# CLAUDE.md — TV Derana Ad Quotation System

Guide for Claude (and humans) working on this repo: what the system does, how
each flow works, **every calculation rule**, and the conventions to keep.

---

## 1. What the system does

TV Derana sales staff receive a **campaign schedule Excel** from an ad agency.
It lists programs, days, time belts, spot durations and spot counts. The system:

1. **Parses** the sheet into schedule lines (+ section headings / "themes").
2. **Matches** each line to a TV Derana **program**. It uses the name when it can, the section heading for
   ad-format lines (BILLBOARDS, SONG CARD…), and otherwise the **day + time belt**.
3. **Prices** each line using the client's deal: base rate card, flat discount, or custom rate card.
4. Produces a **quotation**: rate card value, client value, an optional negotiated package,
   per-program share, PT/NPT split. It is exported to Excel and saved in Postgres.

No authentication yet (intentional — product owner asked for none for now).

---

## 2. Stack & layout

- Node.js ≥ 20, Express 5, `pg`, `exceljs`. Frontend: plain HTML/CSS/ES modules, no build step.
- PostgreSQL (Railway). Schema migrations: `server/migrations/NNN_*.sql`, applied once each at startup.
- Seed data (`server/seed.js`) loads only when `rate_categories` is empty.

```
server/
  index.js            Express app: /api + static SPA, error handler, migrate → seed → listen
  db.js               pg Pool, tx(), migrate()
  seed.js             Rate card (PDF), programs, settings, sample agencies/clients/cards
  repo.js             DB loaders used by the engine (programs+aliases, slots, client, card…)
  migrations/001_init.sql
  lib/                ── pure logic, no DB access, unit-tested ──
    time.js           time parsing, intervals (midnight-safe), timeScore
    days.js           day text → weekday set, dayScore
    names.js          name normalisation, fuzzy/skeleton similarity, generic-item detection
    parser.js         Excel → lines + extras
    matcher.js        lines × programs → best match + candidates + status
    pricing.js        quotation maths
    exporter.js       quotation workbook (Summary, Program Summary, Schedule Lines, Not Priced)
  routes/             ratecard.js · clients.js · settings.js · quotes.js · util.js
public/
  index.html, css/app.css
  js/app.js (hash router), js/ui.js (api, modal, toast, formatters)
  js/pages/ quote.js · quotes.js · clients.js · ratecards.js · baserates.js · programs.js · settings.js
test/engine.test.js   node --test; uses test/fixtures/sample_schedule.xlsx
legacy/               old Tkinter + SQLite app (reference only, not deployed)
docs/                 TV Derana rate card PDF (source of the seed rates)
```

---

## 3. Data model

```
rate_categories 1─* rate_slots 1─* programs 1─* program_aliases
                    (rate_30s)     (name, day_pattern, start/end, is_prime, is_generic, active)

agencies 1─* clients ─? rate_cards 1─* rate_card_items *─1 rate_slots
             (pricing_type: base | discount | rate_card, discount_pct)
                         (default_discount_pct)  (mode: fixed | discount, value)

special_rules (keyword → rate_pt / rate_npt)       settings (key → jsonb)
quotations (lines jsonb, extras jsonb, totals jsonb = full result snapshot)
```

- **A rate belongs to a rate slot** (one line of the PDF, e.g. "Weekdays 8.00pm" = 1,166,000).
  Programs point at a slot, so changing a slot rate re-prices every program in it.
- A **program** = one airing pattern (name + days + time belt). The same show can have
  several rows (e.g. `Naataka Maarai Rpt` ×3).
- **Generic programs** (`is_generic`) are catch-all time belts, such as "Day Time Belt (Weekdays) 08:00–18:00".
  They are only chosen when nothing named fits.
- `end_time <= start_time` means the belt runs past midnight (`22:35–00:00`).
- Saved quotations store a **snapshot** of the full result. Exporting a saved quotation uses
  that snapshot, so later rate changes never alter a quotation that was already sent.

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

Per line:
```
units  (30-sec equivalents) = dur × spots / 30            ← pro-rata, ANY duration (rate card rule)
base   = slot.rate_30s                                     (special item: rule.rate_pt / rate_npt by program PT flag)
client rate:
  base       → base
  discount   → base × (1 − client.discount_pct/100)
  rate_card  → item fixed  → item.value
               item discount → base × (1 − item.value/100)
               no item     → base × (1 − card.default_discount_pct/100)
  special item → rule rate (× (1 − client general discount) only if rule.apply_client_discount)
gross  = units × base           ("rate card value")
net    = units × client rate    ("value at client rates")
```
Totals and package:
```
GROSS = Σ gross      NET = Σ net
client_discount_pct = 1 − NET/GROSS
final = PACKAGE (if entered) else NET
line.final = final × line.net / NET          line.share = line.final / final
total_discount_pct = 1 − final/GROSS         extra_discount_pct = 1 − PACKAGE/NET
tax = final × tax_pct/100                    grand_total = final + tax
```
Rules:
- **The discount is applied once.** (Legacy bug B1 double-discounted.)
- **No rounding until output.** Values are rounded to 2 dp only in the returned result. (Legacy rounded units first.)
- **Each line is priced at its own program/slot.** (Legacy merged spots per program name.)
- Prime/non-prime comes from the program's `is_prime` (the PT/NPT on the rate card), not the clock.
- The "or total discount %" box in the UI sets `package = GROSS × (1 − d/100)`.
- Unmatched/excluded lines are listed in `unpriced` and are not in any total.

**Worked example** — SLT/Mobitel (−30%), sample schedule:
units 150.3 · GROSS 65,443,666.67 · NET 45,834,566.67 (29.96% — crawlers carry their own rate)
· package 30,000,000 → 54.16% off rate card, 34.55% below client rates.
Line check: BILLBOARDS 3s × 31 = 3.1 units × 374,000 = 1,159,400 gross → × 0.7 = 811,580 net.

---

## 7. API (all JSON under `/api`)

| Area | Endpoints |
|---|---|
| Health | `GET /health` |
| Rate card | `GET /ratecard` · `POST/PUT/DELETE /categories[/:id]` · `POST/PUT/DELETE /slots[/:id]` |
| Programs | `GET/POST /programs` · `PUT/DELETE /programs/:id` (body `aliases: []` replaces them) · `POST /programs/:id/aliases` · `POST /match-test` |
| Agencies/clients | `GET /agencies` (clients nested) · `POST/PUT/DELETE /agencies[/:id]` · `POST/PUT/DELETE /clients[/:id]` |
| Client rate cards | `GET/POST /rate-cards` (`copy_from` to duplicate) · `GET/PUT/DELETE /rate-cards/:id` (PUT `items` replaces all) |
| Settings | `GET /settings` (settings + rules) · `PUT /settings` · `POST/PUT/DELETE /special-rules[/:id]` |
| Quotes | `POST /quotes/parse` (raw .xlsx body, `?sheet=`) · `POST /quotes/calculate` · `POST /quotes/export` (xlsx) |
| Quotations | `GET /quotations?search=` · `POST /quotations` · `GET/PUT/DELETE /quotations/:id` · `GET /quotations/:id/export` |

Errors: `{ error: "human readable message" }` with 4xx. FK/unique violations are mapped in `routes/util.js`.

---

## 8. UI flows (`public/js/pages`)

- **quote.js**: stepper 1 Client → 2 Upload → 3 Match (filters: Needs a look / All / Matched / Time belt / Check / Not matched;
  a per-line program picker with best candidates first) → 4 Quotation (KPIs, package price or discount %,
  tabs By program / Lines / Section / Category, Export, Save). Unsaved work is kept as a draft in `localStorage`.
- **clients.js**: agency list ↔ clients table; client modal with pricing choice (base / discount / custom card,
  or "create a new card").
- **ratecards.js**: card list, and an editor with a per-slot rule (Default / Discount % / Fixed), live effective rate,
  "apply % to category".
- **baserates.js**: inline rate editing (save on blur/Enter).
- **programs.js**: list + **week view** timeline + "Test matching" tool.
- **settings.js**: special rules, tax %, auto-match threshold, section labels, ad-format words.

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
- `Derana 60 Plus` time belt imported as 10:00–00:00 from the old DB — confirm the real belt.
- PT/NPT for "Other Prime Programs 10.30pm onwards" differs per show in the old data — confirm.
- Rate card slots without programs (Star City, Little Star, Dance Unlimited…) need program rows added
  when those shows air.
- Rate-card versioning by date (e.g. "rates effective from") is not modelled. Saved quotations snapshot their rates instead.
