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

1. **New schedule** (red button): pick the **agency** card, then the **client** card (both have a search bar).
2. On the client page you see past schedules by month. Click **New schedule**, then enter the month, schedule number and schedule name, upload the Excel and click **Continue**.
3. **Matching:** every program in the schedule is listed (rows with no time belt or zero spots are ignored). Untick what the client doesn't want, and fix any wrong rate card match from the dropdown. Then click **Proceed**.
4. **Dashboard:** Option 01 (enter the package value → discount %) and Option 02 (enter the discount % → package value), the PT/NPT split, categories and program analysis. Download the **Excel** or **PDF** report.

| Page | What it's for |
|---|---|
| **Home** | Totals for this month / 12 months / all time, by agency |
| **Schedules** | All schedules, filtered by month, agency, client or number |
| **Agencies & clients** | Agency list, client cards with their deal (rate card + agreed discount), **move a client to another agency** (history kept) |
| **Client rate cards / Base rate card** | Custom per-slot rates / published TV Derana rates |
| **Programs & time belts** | What airs when, aliases, week view, "Test matching" |
| **Settings** | Crawler rates and words used to read schedules |

The sidebar collapses to icons with the **Collapse** button at the bottom.

See `CLAUDE.md` for the full logic (matching, calculations, data model).
