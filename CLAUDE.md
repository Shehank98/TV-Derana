# CLAUDE.md — TV Derana Ad Package Calculator

This file guides Claude (and humans) working on this repo. It documents **what the
current desktop app does**, **every calculation rule**, **known bugs**, and the
**target web architecture** (Railway + PostgreSQL).

> Status: **planning phase.** The code in the repo today is the legacy Tkinter +
> SQLite desktop app. The web rebuild has not started. Items marked ❓ are open
> questions waiting on the product owner — do not guess them in code.

---

## 1. What the system does (one paragraph)

TV Derana sales staff receive a **campaign schedule Excel** from an ad agency
(which programs, which days/times, spot durations, number of spots). The system
reads that Excel, **matches each line to a program slot in the TV Derana rate
card** (stored in the DB), looks up the **effective 30‑second rate for that
agency + client**, converts all spots into **30‑second equivalents**, calculates
the **total rate‑card value**, then works out the **package value / discount %**
and each program's **share of investment**. Results can be exported to Excel and
saved to a 30‑day history.

---

## 2. Current repo layout (legacy)

| File | What it is |
|---|---|
| `MainV3_Front.py` | Main Tkinter app (~8k lines): login, calculator, rate‑card manager, admin, history. |
| `MainV2.py` | **Byte‑for‑byte identical** to `MainV3_Front.py`. Treat as duplicate; ignore. |
| `adddata.py` | Admin tool: **wipes the DB** and imports the master rate card from Excel. |
| `export.py` | Standalone helper: extracts rows with spot counts from a raw schedule Excel. |
| `tv_program_schedule.db` | SQLite DB with real data (45 programs, 48 schedules, 3 agency‑clients, 2 custom cards). |

Key classes in `MainV3_Front.py`:
- `RateCardManager` (L454) — **effective rate logic** (most important business rule).
- `EnhancedSmartAdCalculator` (L1116) — upload → parse → match → calculate → options → export.
- `HistoryManager` (L346) — 30‑day calculation history (folders on disk + DB row).
- `EnhancedTVProgramDatabaseAdmin` (L3793) — CRUD for programs, schedules, agencies, users, permissions.

---

## 3. Data model

```
program_categories 1─* program_subcategories 1─* programs 1─* program_schedules
                                                            (day_pattern, start, end,
                                                             PT/NPT, rate_30sec)
day_patterns  1─* program_schedules
broadcast_types 1─* program_schedules            (PT = Prime Time, NPT = Non‑Prime)

agencies 1─* agency_clients *─1 clients
             (discount_rate, rate_card_type = 'discount' | 'custom')
agency_clients 1─* custom_rate_cards (base_modifier_percentage, is_active)
custom_rate_cards 1─* custom_program_rates *─1 program_schedules
                      (custom_rate_30sec, override_type)

users *─* permissions (user_permissions)
calculation_history → users, agency_clients, custom_rate_cards
```

Important facts:
- **A rate belongs to a *schedule* (program + day pattern + time slot), not a program.**
  The same program can have several schedules with different rates
  (e.g. `Naataka Maarai Rpt` has 3 slots).
- `agency_clients` is the pricing key: each agency+client pair has its own deal.
- Day pattern codes in use: `Wkdays, Wkends, Daily, Monday, Tuesday, Wednesday,
  Thursday, Friday, Sat.day, Sunday, Tue-Fri, Poya Days`.
- Currency: **LKR**. All rates are **per 30 seconds**.

---

## 4. End‑to‑end flow

```
[1 Login] → [2 Select Agency → Client] → [3 Upload campaign Excel]
   → [4 Parse rows into themes] → [5 Auto‑match to schedules (+ manual fix)]
   → [6 Calculate rate‑card value] → [7 Option 1 or Option 2 package]
   → [8 Export Excel / Save to history]
```

### Step 3–4: Parsing the campaign Excel (`find_header_row_and_columns`, `process_data`)
1. Scan the first 15 rows; the **first row containing "PROGRAM"** is the header.
2. Column detection (case‑insensitive):
   - `PROGRAM*` → program name
   - exactly `DAY` → day text
   - first header containing `TIME` → **start time**, and the **next column is end time**
   - exactly `DUR` → spot duration (seconds)
   - `BRAND` / `THEME` / `CAMPAIGN` → theme
   - contains `TOTAL SPOTS` → spot count
3. For each row:
   - Empty program → skip.
   - Program filled but **DAY and start time empty** → it's a **theme header**
     (e.g. `CASH BONANZA`, `CORPORATE`); following rows belong to it.
     Exception: rows containing `SPONSORSHIP/BENEFITS/PRESENCE` are skipped, not themes.
   - Rows containing `SPONSORSHIP/BENEFITS/PRESENCE/COMMERCIAL` → skip.
   - Duration or spots missing/zero → skip.
   - Times: `"HH:MM"` strings are normalised; Excel fractional days (0.5 = 12:00) converted.
   - `total_seconds = duration × spots`.

### Step 5: Auto‑matching (`find_best_match`) — score out of 100
For every Excel row, compare against every DB schedule:

| Factor | Points |
|---|---|
| Start **and** end time exactly equal | 40 |
| Start **or** end time equal | 25 |
| Start time within 15 min | 20 |
| Start time within 30 min | 10 |
| Day pattern matches (alias table, see below) | 40 |
| Name: one contains the other | 20 |
| Name: fuzzy similarity > 0.7 | `int(similarity × 15)` |

- A candidate is accepted only if **score > 60** (and confidence `score/100 > 0.5`).
- Highest score wins. Unmatched rows can be mapped manually.
- Day aliases (after lower‑casing and removing spaces/`-`/`_`):
  `daily ≈ all/everyday/7days`, `montofri ≈ weekdays/wkdays/monfri`,
  `sattosun ≈ weekends/wkends/satsun`, single days (`sat`, `sat.day`, …), `tuefri`, `poya`.
  Fallback: any weekday‑ish text matches any weekday‑ish pattern; same for weekend.

### Step 6: Effective rate per schedule (`RateCardManager.get_effective_rate`)
```
look up agency_clients(agency_client_id) → rate_card_type, discount_rate

IF rate_card_type = 'discount':
    rate = base_rate_30sec × (100 − discount_rate) / 100           type='discount'

IF rate_card_type = 'custom':
    card = newest ACTIVE custom_rate_card for this agency_client
    IF none → return None  (program is silently dropped!)
    IF custom_program_rates has a row for (card, schedule):
        rate = custom_rate_30sec                                   type='custom_individual'
    ELSE IF card.base_modifier ≠ 0:
        rate = base_rate × (100 + base_modifier) / 100             type='custom_modifier'
    ELSE:
        rate = base_rate                                           type='default'
```
Note: for custom cards, **+modifier = price increase**, for discount cards
**+discount = price decrease**.

Creating a custom card from default (`create_custom_rate_card_from_default`)
pre‑fills **every** schedule with `base × (100 + modifier)/100`.

### Step 6: Rate‑card value (`calculate_enhanced_analysis`)
Rows are grouped **by category → DB program name**. Spots are bucketed by
duration (only these buckets exist: **5, 10, 15, 20, 25, 30, 45, 60 s**).

```
30s_equivalents  = Σ over durations ( spots_d × d / 30 )
30s_equivalents  = round(30s_equivalents, 1)          ← rounded BEFORE pricing
value_rs         = round(30s_equivalents × effective_rate, 2)
TOTAL_RATE_CARD  = Σ value_rs over all programs
```

Prime/non‑prime spot counts: a row is **prime if start hour is 19–23**
(i.e. 19:00–23:59), otherwise non‑prime. (The DB `PT/NPT` field is *not* used here.)

**Worked example** — Sangeethe, effective rate 1,166,000:
15s × 5, 20s × 2, 30s × 3 → 2.5 + 1.333 + 3 = 6.833 → rounded 6.8
→ value = 6.8 × 1,166,000 = **7,928,800 LKR**

### Step 7a: Option 1 — manual package value (`apply_option1`)
User types the package price agreed with the client.
```
discount_%                = (TOTAL_RATE_CARD − package) / TOTAL_RATE_CARD × 100
per program final_value   = value_rs × (100 − discount_%) / 100
per program investment_%  = final_value / package × 100
```
(Σ final_value = package; Σ investment_% = 100%.)

Real example from history: rate card 51,374,654.32, package 4,500,000 → discount **91.24%**.

### Step 7b: Option 2 — agency deal (`apply_option2_enhanced`)
```
IF custom:   package = TOTAL_RATE_CARD, discount = 0
IF discount: package = TOTAL_RATE_CARD × (100 − discount_rate) / 100
```
⚠️ See bug B1 — this double‑discounts.

### Step 8: History & export
- Saved to `calculation_history` with `expires_date = now + 30 days`; full inputs
  stored as JSON in `calculation_data`; original Excel copied to a dated folder.
- `cleanup_expired_history` deletes expired rows + folders.
- Excel export: header info, rate‑type breakdown, financial summary, per‑program
  table (5s…60s, Total 30s, Rate, Value Rs, Final Value, % Investment, Rate Source).

### Admin: master rate card import (`adddata.py`)
Required Excel columns: `categories, subcategories, Program, Day pattern, PT/NPT,
30 Sec., Start Time, End Time`. ⚠️ It **deletes all data** (including agencies,
custom cards and history) before import, and it **reads Start/End swapped**
(`start = row['End Time']`) because the source sheet has them swapped.

---

## 5. Known bugs / risks in the legacy logic (verified)

| # | Issue | Impact |
|---|---|---|
| **B1** | **Double discount** for `discount` clients: the table already uses discounted rates, then Option 2 discounts the total again. 30% client: 1,200,000 → 840,000 → 588,000. | Wrong quotes |
| **B2** | **Durations outside {5,10,15,20,25,30,45,60} are silently dropped** (real data has 3‑sec billboards/cards). | Under‑pricing |
| **B3** | **Spots are merged per program name**, priced at the *first* schedule's rate, even if they ran in a different slot with a different rate. | Wrong value |
| **B4** | Excel cells read as `datetime.time` become `"22:00:00"`, DB gives `"22:00"` → **exact time match never fires**; only the 20‑pt proximity rule works. | Weaker matching |
| **B5** | `30s_equivalents` rounded to 1 decimal **before** multiplying (example above loses ~38,867 LKR). | Small mis‑pricing |
| **B6** | Custom client with no active card → `None` → program silently skipped. | Missing lines |
| **B7** | Prime time uses clock hour 19–23, but DB has its own `PT/NPT` per slot (they disagree, e.g. 18:55 news is PT in DB). | Inconsistent reporting |
| **B8** | Midnight stored as `12:00` for some slots (e.g. `22:35–12:00`). | Bad time matching |
| **B9** | Passwords = unsalted SHA‑256; default `admin/admin`. | Security |
| **B10** | `adddata.py` wipes every table (agencies, custom cards, history). | Data loss |

When rebuilding, **fix these by design** (pending confirmation of ❓ items).

---

## 6. Target architecture (Railway + PostgreSQL) — proposed

```
Browser ──HTTPS──► Railway service "web" (Python, FastAPI)
                     ├─ /api/*        REST endpoints
                     ├─ static UI     (frontend — see ❓ Q7)
                     └─ SQLAlchemy ──► Railway PostgreSQL (DATABASE_URL)
```

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2 + Alembic migrations,
  pandas/openpyxl for Excel in/out. Reuses the existing Python logic.
- **DB:** Railway Postgres plugin. Money as `NUMERIC(14,2)`, times as `TIME`,
  timestamps as `TIMESTAMPTZ`.
- **Files:** uploaded/exported Excel stored in Postgres (`BYTEA`) for 30 days —
  avoids needing a Railway volume (container disk is ephemeral).
- **Auth:** bcrypt/argon2 hashes, session cookie or JWT; legacy SHA‑256 hashes
  re‑hashed on first successful login.
- **Jobs:** daily cleanup of expired history (Railway cron or on‑startup task).
- **Config (env vars):** `DATABASE_URL`, `SECRET_KEY`, `ADMIN_INITIAL_PASSWORD`, `PORT`.
- **Migration:** one‑off script copies `tv_program_schedule.db` → Postgres.

Proposed module layout:
```
app/
  main.py            FastAPI app, routers
  db.py, models.py   SQLAlchemy models (mirrors section 3)
  services/
    excel_parser.py  Step 3–4 (pure functions, unit‑tested)
    matcher.py       Step 5
    rates.py         Step 6 effective rate
    calculator.py    Step 6–7 totals, options
    exporter.py      Step 8 Excel
  routers/           auth, calculator, rate_cards, admin, history
alembic/             migrations
scripts/migrate_sqlite.py
tests/               golden tests using real history example
```

**Rule:** all calculation code lives in `services/` as pure functions with
unit tests; routers only orchestrate. Every calculation change needs a test.

---

## 7. Open questions (❓ — answer before building)

1. **B1 double discount:** should Option 2 for discount clients equal
   `Σ(spot units × discounted rate)` (discount applied once)? And should the
   "Total Rate Card Value" shown be the **undiscounted** base value?
2. **B2 durations:** price *any* duration pro‑rata (`d/30`), e.g. 3s = 0.1 unit?
   Or do billboards/crawlers have special pricing?
3. **B3:** price each matched **schedule** separately (recommended)?
4. **Prime time:** use DB `PT/NPT` per slot, or clock 19:00–23:00?
5. **Rounding:** round only the final LKR value (recommended)?
6. **Custom modifier sign:** +10% means *more expensive*? (DB data looks like a discount.)
7. **Frontend:** simple server‑rendered pages (fast to build) vs React SPA?
8. **Users:** how many, and do we keep the 19 granular permissions or just Admin / Sales roles?
9. **History:** keep 30‑day expiry? Keep the original uploaded Excel?
10. **Data:** migrate existing SQLite data, or start fresh from a new rate‑card Excel?
11. **Scope:** are `export.py` (spot extractor) and multiple rate‑card versions over time needed?

---

## 8. Conventions for Claude

- Do not modify the legacy `.py` files except to fix them deliberately; build the
  new app under `app/`.
- Never commit secrets; Railway env vars only.
- Do not hard‑code the prime‑time window, duration list, or match thresholds —
  keep them in one config module.
- Keep amounts as `Decimal` in Python, `NUMERIC` in Postgres — never float for money.
