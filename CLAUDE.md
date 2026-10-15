# CLAUDE.md — TV Derana Schedule Analysis System

Guide for Claude (and humans) working on this repo: what the system does, how
each flow works, **every calculation rule**, and the conventions to keep.

---

## 1. What the system does

TV Derana sales staff receive a **campaign schedule Excel** from an ad agency. It lists programs, days,
time belts, spot durations and spot counts. The flow is:

**Agency → Client → Campaign month → Schedule No + upload → Proceed → Program mappings → Continue → Schedule dashboard**

1. **Parse** the sheet into schedule lines (+ section headings / "themes").
2. **Auto-match** each line to a TV Derana **program**. It uses the name, the section heading for ad-format lines
   (BILLBOARDS, SONG CARD…), and otherwise the **day + time belt**.
3. On the **mappings** screen the user can switch off whole programs or single lines (not counted),
   change a line's program, and confirm uncertain matches.
4. The **schedule dashboard** shows the Total Rate Card Value plus the two package options the team uses:
   - **Option 01 – Package Value → Discount** (user types the package value)
   - **Option 02 – Discount → Package Value** (user types the discount %; defaults to the client's agreed discount)
   It also shows the PT/NPT split, categories, program analysis and lines. Changes autosave.
5. **Reports:** Excel (Summary, Program Analysis, Schedule Lines, Not Priced) and PDF, built from the saved snapshot.
6. A **home dashboard** totals schedules by month/agency: trend, PT/NPT mix, top clients and agencies.

There used to be "quotations"; they were replaced by **schedules** (migration 002 dropped the table).
No authentication yet (intentional — the product owner asked for none for now).

---

## 2. Stack & layout

- Node.js ≥ 20, Express 5, `pg`, `exceljs`, `pdfkit`. Frontend: plain HTML/CSS/ES modules, no build step, no chart library.
- PostgreSQL (Railway). Schema migrations: `server/migrations/NNN_*.sql`, applied once each at startup.
- Seed data (`server/seed.js`) loads only when `rate_categories` is empty.

```
server/
  index.js            Express app: /api + static SPA, error handler, migrate → seed → listen
  db.js               pg Pool, tx(), migrate()
  seed.js             Rate card (PDF), programs, settings, sample agencies/clients/cards
  repo.js             DB loaders used by the engine (programs+aliases, slots, client, card…)
  migrations/001_init.sql, 002_schedules.sql
  lib/                ── pure logic, no DB access, unit-tested ──
    time.js           time parsing, intervals (midnight-safe), timeScore
    days.js           day text → weekday set, dayScore
    names.js          name normalisation, fuzzy/skeleton similarity, generic-item detection
    parser.js         Excel → lines + extras
    matcher.js        lines × programs → best match + candidates + status
    pricing.js        TRV + Option 01 / Option 02 maths
    report.js         report model shared by the Excel and PDF exports
    exporter.js       Excel report (Summary, Program Analysis, Schedule Lines, Not Priced)
    pdf.js            PDF report (A4 landscape, pdfkit)
  routes/             ratecard.js · clients.js · settings.js · schedules.js · util.js
public/
  index.html, css/app.css
  js/app.js (hash router), js/ui.js (api, modal, toast, formatters), js/charts.js (HTML bars, tooltips)
  js/pages/ dashboard.js · new.js · schedule.js · schedules.js · clients.js · ratecards.js · baserates.js · programs.js · settings.js
test/engine.test.js   node --test; uses test/fixtures/sample_schedule.xlsx
legacy/               old Tkinter + SQLite app (reference only, not deployed)
docs/                 TV Derana rate card PDF (source of the seed rates)
```

---

## 3. Data model

```
rate_categories 1─* rate_slots 1─* programs 1─* program_aliases
                    (rate_30s)     (name, day_pattern, start/end, is_prime, is_generic, active)

agencies 1─* agency_clients *─1 clients            ← a client can MOVE between agencies
             (rate_card_id NULL = base card,          (old link: active=false, ended=date — kept as history)
              discount_pct = agreed discount → Option 02 default, active, since, ended)
rate_cards 1─* rate_card_items *─1 rate_slots  (mode: fixed | discount, value; card default_discount_pct)

schedules (schedule_no, month, agency/client ids + NAME SNAPSHOTS, rate_card_name, file_name,
           lines jsonb, extras jsonb, option1_package, option2_discount, selected_option, result jsonb)
special_rules (keyword → rate_pt / rate_npt)       settings (key → jsonb)
```

- **A rate belongs to a rate slot** (one line of the rate card, e.g. "Weekdays 8.00pm" = 1,166,000).
  Programs point at a slot, so changing a slot rate re-prices every program in it.
- A **program** = one airing pattern (name + days + time belt). The same show can have several rows.
- **Generic programs** (`is_generic`) are catch-all time belts, used only when nothing named fits.
- `end_time <= start_time` means the belt runs past midnight (`22:35–00:00`).
- Schedules store agency/client **names** as well as ids, so moving or deleting a client never changes past schedules.
- `schedules.result` is the full calculation snapshot. Reports are built from it. Rates are re-applied only when the
  schedule is edited (PUT) or its options change (PATCH).
- Schedule numbers are unique by default. The API returns 409 `{duplicate:true}`, and the UI can override with `allow_duplicate`.

---

## 4. Flow 1 — Parsing the agency Excel (`lib/parser.js`)

1. Use the first sheet whose first 25 rows contain a cell with **PROGRAM**. That row is the header.
2. Columns, by header text (any order):
   `PROGRAM*` · `DAY|DAYS|DAY PATTERN` · `*START*` · `*END*` · a single `*TIME*` column (start, with the end in the next column)
   · `DUR|DURATION|FCT|SEC…` · `TOTAL SPOTS|SPOTS|NO OF SPOTS|TOTAL` · `BRAND|THEME|CAMPAIGN`.
   If there is no spots column, the date/day-number columns to the right are **summed**.
3. Each row:
   - empty program → skip;
   - only the program cell filled → **section heading**. It becomes the current theme unless it
     contains a *section label* (setting `section_labels`: SPONSORSHIP, BENEFITS, PRESENCE…).
     So "BRAND PRESENCE" under "DREAM STAR" keeps the theme DREAM STAR;
   - no dur and no spots → `extras` ("non-priced benefit", e.g. JUDGES TABLE BRANDING);
   - spots = 0 → `extras` ("Zero spots"); missing dur → `extras`;
   - otherwise → a **line** `{row, theme, program, day, start, end (minutes), dur, spots}`.
4. Times accept Excel time cells (Date in UTC), day fractions, `"22:00"`, `"10.30 PM"`, `"1930"`.

---

## 5. Flow 2 — Matching (`lib/matcher.js`) — the tricky part

Every active program gets a score against each line:

| Signal | Weight | How |
|---|---|---|
| **name** | 50% | best of: line name vs program name/aliases, and **theme** vs program (× 0.9). If the line is only ad-format words (`generic_item_words`: BILLBOARD, CARD, CRAWLER…), only the theme counts. Rpt/non-Rpt mismatch × 0.85. Generic programs have name = 0. |
| **time** | 30% | `0.6·overlap/agency_len + 0.4·overlap/program_len`. No overlap: start within 10 min = 0.35, within 20 min = 0.2, else 0 |
| **day** | 20% | `0.75·common/agency_days + 0.25·common/program_days`. Poya only matches Poya |

- `day = 0` → never a candidate. `time = 0` → candidate only if name ≥ 0.9, and the total is × 0.6.
- Generic programs: total × 0.9, so a named show wins ties.
- **Name similarity** (`lib/names.js`): upper-case; remove times (`18:55`, `10.00pm`), `RPT`,
  punctuation and stop words (THE, NEWS, SHOW, PM…); make plurals singular. Then compare token by token:
  exact = 1, same **consonant skeleton** = 0.9 (DHEVANI≈DEVENI, both `DVN`), Levenshtein ratio ≥ 0.75.
  Words shorter than 4 letters must match exactly.
  `score = 0.7·coverage(shorter→longer) + 0.3·coverage(longer→shorter)`.
- **Status** of the best candidate:
  - `matched`: name ≥ `match_auto_threshold` (0.8) and time ≥ 0.5 and day ≥ 0.5, and the runner-up is not within 0.03;
  - `belt`: name < 0.5 → "matched by day & time belt", **needs confirmation**;
  - `review`: the name matches but the time/day is weak, or two programs are near-tied;
  - `unmatched`: no candidate at all (not priced);
  - set by the UI: `manual` (user picked a program) and `excluded` (user chose "not priced").
- **Learning:** when the user picks a program by hand (with "Learn from my corrections" on), the line
  name is saved as a `program_alias`. Next time it scores name = 1. Generic item names are
  refused server-side.
- In the UI, changing one line applies to **all identical lines** (same text + day + times).

Verified on `test/fixtures/sample_schedule.xlsx`: 50/50 lines matched correctly, e.g.
BILLBOARDS under "22:00 ADA DERANA NEWS" → Ada Derana 10.00pm; SONG CARD under DREAM STAR → Dream Star;
DHEVANI INIMA → Deveni Inima; 18:55 ADA DERANA → Ada Derana 6.55.

---

## 6. Flow 3 — Calculations (`lib/pricing.js`) ⭐

Per line (lines with `status = 'excluded'` — switched off by the user — or with no program are skipped and listed in `excluded`):
```
units  (30-sec equivalents) = dur × spots / 30            ← pro-rata, ANY duration (rate card rule)
R/C rate = the deal's rate card for the program's slot:
             no card       → slot.rate_30s (base)
             item fixed    → item.value
             item discount → base × (1 − item.value/100)
             no item       → base × (1 − card.default_discount_pct/100)
           special item (CRAWLER…) → rule.rate_pt / rate_npt by the program's PT flag
value  = units × R/C rate          TRV (Total Rate Card Value) = Σ value
```
Options (exactly as in the team's sheet):
```
Option 01 (package → discount):  discount% = (1 − package / TRV) × 100
Option 02 (discount → package):  package   = TRV × (1 − discount% / 100)
selected_option chooses the final package (falls back to the other option if the chosen one is empty;
neither filled → package = TRV, discount 0)
line.discounted = line.value × package / TRV         line.share = line.discounted / package
```
Rules:
- Team sheet check (a unit test): TRV 2,319,166.67 → package 1,000,000 = **56.9%**; 70% → **695,750.00**.
- The agreed discount lives on the agency–client deal and is only the **default for Option 02**. It is never baked into rates.
- **No rounding until output** (`r2` on the returned result only).
- **Each line is priced at its own program/slot**; the program analysis groups by program row.
- Prime/non-prime comes from the program's `is_prime` (the rate card's PT/NPT column).

**Worked example** — SLT/Mobitel (base card), sample schedule with Weekend Movies switched off:
46 lines · 437 spots · 144.3 × 30s · TRV 64,075,666.67 · Option 02 at 30% → 44,852,966.67.
Line check: BILLBOARDS 3s × 31 = 3.1 units × 374,000 = 1,159,400 → × 0.7 = 811,580.

---

## 7. API (all JSON under `/api`)

| Area | Endpoints |
|---|---|
| Health | `GET /health` |
| Dashboard | `GET /dashboard?month=YYYY-MM&agency_id=` → kpi, byAgency, byClient, recent, 12-month trend |
| Schedules | `POST /schedules/parse` (raw .xlsx body, `?sheet=`) · `POST /schedules/calculate` · `GET /schedules?month&agency_id&client_id&search` · `POST /schedules` · `GET/PUT/DELETE /schedules/:id` · `PATCH /schedules/:id/options` · `GET /schedules/:id/report.xlsx` · `GET /schedules/:id/report.pdf` |
| Agencies/clients | `GET /agencies` (active `clients` + `past_clients`) · `POST/PUT/DELETE /agencies[/:id]` · `GET /clients` (with all `links`) · `POST/PUT/DELETE /clients[/:id]` · `POST /clients/:id/move` · `POST /agency-clients` · `PUT /agency-clients/:id` · `DELETE /agency-clients/:id` (ends the link) |
| Client rate cards | `GET/POST /rate-cards` (`copy_from` to duplicate) · `GET/PUT/DELETE /rate-cards/:id` (PUT `items` replaces all) |
| Rate card | `GET /ratecard` · `POST/PUT/DELETE /categories[/:id]` · `POST/PUT/DELETE /slots[/:id]` |
| Programs | `GET/POST /programs` · `PUT/DELETE /programs/:id` · `POST /programs/:id/aliases` · `POST /match-test` |
| Settings | `GET /settings` · `PUT /settings` · `POST/PUT/DELETE /special-rules[/:id]` |

Errors: `{ error: "human readable message" }` with 4xx. FK/unique violations are mapped in `routes/util.js`.

---

## 8. UI flows (`public/js/pages`)

- **dashboard.js** (home): month + agency filters; KPIs; package value by month (12 columns); PT/NPT stacked bars;
  top clients / agencies; recent schedules.
- **new.js** (`#/new`, `#/schedule/:id/edit`): step 1 agency → client (shows the rate card and agreed discount) → month →
  Schedule No → Excel; **Proceed** parses. Step 2 has a yellow "Please check" box (time-belt / uncertain lines) and program
  groups with on/off switches; expand a group to switch off single lines or change a line's program (this applies to identical
  lines and learns an alias). **Continue** saves and opens the dashboard. The live TRV is shown at the top.
- **schedule.js** (`#/schedule/:id`): details strip, KPIs, **Option 01 / Option 02 cards** (yellow inputs, "Use in report"
  radio, autosave via PATCH), PT/NPT chart + table, category bars, tabs Program analysis / Lines / Not counted; Excel & PDF.
- **schedules.js**: list with month / agency / client / search filters and totals row.
- **clients.js**: "By agency" (linked clients, deal, move, remove, past clients) and "All clients" (current agency, history).
- **ratecards.js**, **baserates.js**, **programs.js** (list + week view + "Test matching"), **settings.js**.

Charts: plain HTML/CSS in `js/charts.js`. PT = `#c8102e`, NPT = `#2f6fb5` (pair validated for colour-blind separation).
Single-series charts use one hue with direct labels, and every mark has a hover tooltip.

---

## 9. Conventions

- Calculation and matching logic stays in `server/lib/` as **pure functions**. Any change there needs a
  test in `test/engine.test.js`. Run `npm test` (no DB needed).
- Schema changes: add `server/migrations/002_*.sql` — never edit an applied migration.
- Escape everything rendered into HTML with `esc()`. Never build SQL with string concatenation.
- Money: NUMERIC in Postgres; JS numbers in the engine; round only at the end (`r2`).
- Don't hard-code business words or thresholds in code — they belong in `settings` (see `seed.js` SETTINGS).
- Keep the UI plain HTML/CSS/JS (the product owner's choice) — no framework or build step.

## 10. Known follow-ups / open questions

- Authentication & roles (deliberately postponed).
- Agency schedules must be **.xlsx**. Old `.xls` files need "Save As .xlsx" (exceljs can't read .xls).
- Rate card slots without programs (Star City, Little Star, Dance Unlimited…) need program rows when those shows air.
- Rate-card versioning by date is not modelled. Saved schedules keep their snapshot until edited.
- Resolved from the official rate card sheet: Derana 60 Plus = Wkends 10:00–11:00; all "10.35pm onwards" shows are NPT.
