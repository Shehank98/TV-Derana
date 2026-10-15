# TV Derana — Ad Quotation System

Upload an agency's campaign schedule (Excel). The system then:
1. finds every program, duration and spot count in the sheet;
2. matches each line to a TV Derana program. It uses the name first. If the name isn't recognised, it uses the **day + time belt**;
3. prices each line with that client's deal (base rates, a flat discount, or a custom rate card);
4. produces a quotation with an optional negotiated package price, which you can export to Excel and save.

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
   - the sample agencies and clients.

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
| **New quotation** | 1 pick agency & client → 2 upload Excel → 3 check matches → 4 quotation, package price, export, save |
| **Saved quotations** | Search, reopen, download or delete past quotations |
| **Agencies & clients** | Add agencies and their clients; set each client's pricing |
| **Client rate cards** | Custom cards: a fixed rate or a % discount per rate slot, plus a default % |
| **Base rate card** | The published TV Derana rates per 30 seconds (edit inline) |
| **Programs & time belts** | What airs when, which slot prices it, and the names agencies use for it. Has a week view and a "Test matching" tool. |
| **Settings** | Special item rates (crawlers), tax %, schedule-reading words |

See `CLAUDE.md` for the full logic (matching, calculations, data model).
