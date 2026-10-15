# TV Derana — Schedule Analysis System

Upload an agency's campaign schedule (Excel). The system then:
1. reads every program, day, time belt, duration and spot count;
2. **auto-matches** each line to a TV Derana program. It uses the name first. If the name isn't clear, it uses the section heading or the **day + time belt**;
3. lets you **switch off** any program or line the client doesn't want counted;
4. shows a dashboard with the **Total Rate Card Value** and the two package options:
   - **Option 01:** you enter the package value, and the discount % is worked out;
   - **Option 02:** you enter the discount %, and the package value is worked out;
5. exports a detailed **Excel** and **PDF** report (agency, client, month, schedule no, PT/NPT split, program analysis).

Stack: **Node.js + Express**, **PostgreSQL**, plain **HTML / CSS / JavaScript** (no build step).

---

## Deploy on Railway (step by step)

1. Push this repo to GitHub (already done if you're reading this there).
2. In Railway: **New Project → Deploy from GitHub repo →** pick this repo.
3. In the same project: **+ New → Database → PostgreSQL**.
4. Open the web service → **Variables** → add a reference variable:
   `DATABASE_URL` = `${{ Postgres.DATABASE_URL }}`
5. Open **Settings → Networking → Generate Domain** to get a public URL.
6. Deploy. On first start the app creates all tables and loads:
   - the TV Derana rate card (April 2025 PDF);
   - the program schedule (from the old system, with fixes);
   - sample agencies, clients and rate cards.
   Upgrading an earlier deployment? Migration `002` runs automatically. It converts clients to the new
   agency-link model and **removes the old quotations** (replaced by schedules).

Nothing else is required. `PORT` is set by Railway automatically. `railway.json` sets the start command and the health check (`/api/health`).

> ⚠️ There is **no login yet** (as requested). Anyone with the URL can use the app. Add authentication before you share the link outside the team.

## Run locally

```bash
npm install
# needs a Postgres database; default is postgres://postgres@localhost:5433/tvderana
DATABASE_URL=postgres://user:pass@localhost:5432/tvderana npm start
# → http://localhost:3000
npm test        # matching + pricing tests (no database needed)
```

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `PORT` | no | default 3000 (Railway sets it) |
| `PGSSL` | no | `true` / `false` to force SSL on or off. By default SSL is off for `localhost` and `*.railway.internal`, and on for everything else. |

## Daily use

| Page | What it's for |
|---|---|
| **Dashboard** | Totals for a month / agency: schedules, rate card value, packages, discount, PT/NPT, top clients |
| **New schedule** | Agency → Client → Month → Schedule No → upload Excel → **Proceed** → check mappings → **Continue** |
| **Schedule dashboard** | Option 01 / Option 02, PT/NPT split, program analysis, Excel & PDF reports |
| **Schedules** | All schedules, filtered by month, agency, client or number |
| **Agencies & clients** | Link clients to agencies, set each deal's rate card and agreed discount, **move a client to another agency** (history is kept) |
| **Client rate cards** | Custom cards: a fixed rate or a % discount per rate slot, plus a default % |
| **Base rate card** | Published TV Derana rates per 30 seconds (edit inline) |
| **Programs & time belts** | What airs when and which slot prices it; aliases; week view; "Test matching" tool |
| **Settings** | Special item rates (crawlers) and words used to read schedules |

See `CLAUDE.md` for the full logic (matching, calculations, data model).
