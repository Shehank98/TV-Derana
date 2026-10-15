// Schedule workflow: upload → parse + auto-match → (user removes / fixes mappings)
// → calculate with Option 01 / Option 02 → save → dashboard + Excel / PDF reports.
const express = require('express');
const { query } = require('../db');
const repo = require('../repo');
const { parseWorkbook } = require('../lib/parser');
const { matchAll } = require('../lib/matcher');
const { calculate } = require('../lib/pricing');
const { buildWorkbook } = require('../lib/exporter');
const { buildPdf } = require('../lib/pdf');
const { httpError, requireText, optText, num, id } = require('./util');

const r = express.Router();

// "2026-10" → "2026-10-01"
function monthDate(v) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})/);
  if (!m || +m[2] < 1 || +m[2] > 12) throw httpError(400, 'Month is required (YYYY-MM)');
  return `${m[1]}-${m[2]}-01`;
}

function cleanLines(lines) {
  if (!Array.isArray(lines)) throw httpError(400, 'lines must be an array');
  return lines.map((l) => ({
    row: Number(l.row) || 0,
    theme: String(l.theme || ''),
    program: String(l.program || ''),
    day: String(l.day || ''),
    start: l.start === null || l.start === undefined ? null : Number(l.start),
    end: l.end === null || l.end === undefined ? null : Number(l.end),
    dur: num(l.dur, 'Duration', { min: 0 }),
    spots: num(l.spots, 'Spots', { min: 0 }),
    program_id: l.program_id ? Number(l.program_id) : null,
    status: l.status ? String(l.status) : null,
    confidence: l.match?.confidence ?? l.confidence ?? null,
    reason: l.match?.reason ?? l.reason ?? null,
  }));
}

function optionFields(b) {
  return {
    option1_package: num(b.option1_package, 'Package value', { min: 0, required: false }),
    option2_discount: num(b.option2_discount, 'Discount %', { min: 0, max: 100, required: false }),
    selected_option: Number(b.selected_option) === 1 ? 1 : 2,
  };
}

async function compute(agencyId, clientId, lines, opts) {
  const ctx = await repo.pricingContext(agencyId, clientId);
  const result = calculate(lines, ctx, opts);
  result.deal = ctx.deal ? {
    agency_id: ctx.deal.agency_id, agency_name: ctx.deal.agency_name,
    client_id: ctx.deal.client_id, client_name: ctx.deal.client_name,
    rate_card_name: ctx.card ? ctx.card.name : 'Base rate card',
    agreed_discount: Number(ctx.deal.discount_pct) || 0,
  } : null;
  return result;
}

// 1) Upload (raw .xlsx body) → lines with suggested matches.
r.post('/schedules/parse', express.raw({ type: () => true, limit: '20mb' }), async (req, res) => {
  if (!req.body || !req.body.length) throw httpError(400, 'Empty upload');
  const settings = await repo.getSettings();
  let parsed;
  try {
    parsed = await parseWorkbook(req.body, { sectionLabels: settings.section_labels, sheetName: req.query.sheet || undefined });
  } catch (e) {
    if (e.status) throw e;
    throw httpError(400, 'Could not read this file. Please upload an Excel .xlsx file (old .xls files: open in Excel and "Save As" .xlsx).');
  }
  const [programs, aliases] = await Promise.all([repo.getPrograms(), repo.getAliases()]);
  const matched = matchAll(parsed.lines, programs, aliases, settings);
  res.json({
    sheet: parsed.sheet, sheets: parsed.sheets,
    lines: matched.map((l) => ({ ...l, program_id: l.match.program_id, status: l.match.status })),
    extras: parsed.extras,
  });
});

// 2) Live calculation while the user works on mappings / options.
r.post('/schedules/calculate', async (req, res) => {
  const b = req.body || {};
  res.json(await compute(b.agency_id ? id(b.agency_id) : null, b.client_id ? id(b.client_id) : null, cleanLines(b.lines), optionFields(b)));
});

// ── Saved schedules ──
const LIST_COLS = `s.id, s.schedule_no, to_char(s.month, 'YYYY-MM') AS month, s.agency_id, s.client_id, s.agency_name, s.client_name,
  s.rate_card_name, s.file_name, s.selected_option, s.option1_package, s.option2_discount, s.created_at, s.updated_at,
  (s.result->'totals'->>'trv')::numeric AS trv, (s.result->'totals'->>'package')::numeric AS package,
  (s.result->'totals'->>'discount_pct')::numeric AS discount_pct, (s.result->'totals'->>'spots')::numeric AS spots,
  (s.result->'split'->'PT'->>'spots')::numeric AS pt_spots, (s.result->'split'->'NPT'->>'spots')::numeric AS npt_spots`;

function filters(q, params) {
  const where = [];
  if (q.month) { params.push(monthDate(q.month)); where.push(`s.month = $${params.length}`); }
  if (q.agency_id) { params.push(id(q.agency_id)); where.push(`s.agency_id = $${params.length}`); }
  if (q.client_id) { params.push(id(q.client_id)); where.push(`s.client_id = $${params.length}`); }
  if (q.search) {
    params.push(`%${String(q.search).trim()}%`);
    where.push(`(s.schedule_no ILIKE $${params.length} OR s.client_name ILIKE $${params.length} OR s.agency_name ILIKE $${params.length} OR s.file_name ILIKE $${params.length})`);
  }
  return where.length ? `WHERE ${where.join(' AND ')}` : '';
}

r.get('/schedules', async (req, res) => {
  const params = [];
  const { rows } = await query(`SELECT ${LIST_COLS} FROM schedules s ${filters(req.query, params)}
                                ORDER BY s.month DESC, s.updated_at DESC LIMIT 1000`, params);
  res.json(rows);
});

r.get('/schedules/:id', async (req, res) => {
  const { rows } = await query(`SELECT s.*, to_char(s.month, 'YYYY-MM') AS month FROM schedules s WHERE id=$1`, [id(req.params.id)]);
  if (!rows[0]) throw httpError(404, 'Schedule not found');
  res.json(rows[0]);
});

async function saveSchedule(b, existingId) {
  const agencyId = id(b.agency_id);
  const clientId = id(b.client_id);
  const scheduleNo = requireText(b.schedule_no, 'Schedule number');
  const month = monthDate(b.month);
  const lines = cleanLines(b.lines);
  const opts = optionFields(b);
  const result = await compute(agencyId, clientId, lines, opts);
  if (!result.deal) throw httpError(400, 'This client is not linked to the selected agency');

  if (!b.allow_duplicate) {
    const { rows: dup } = await query(
      `SELECT id, client_name, to_char(month,'Mon YYYY') AS m FROM schedules WHERE lower(schedule_no)=lower($1) AND id <> $2 LIMIT 1`,
      [scheduleNo, existingId || 0]);
    if (dup[0]) {
      const e = httpError(409, `Schedule No "${scheduleNo}" already exists (${dup[0].client_name}, ${dup[0].m}).`);
      e.duplicate = true;
      throw e;
    }
  }

  const vals = [scheduleNo, month, agencyId, clientId, result.deal.agency_name, result.deal.client_name, result.deal.rate_card_name,
    optText(b.file_name), JSON.stringify(lines), JSON.stringify(Array.isArray(b.extras) ? b.extras : []),
    opts.option1_package, opts.option2_discount, result.totals.selected_option, JSON.stringify(result)];
  if (existingId) {
    const { rows } = await query(`UPDATE schedules SET schedule_no=$1, month=$2, agency_id=$3, client_id=$4, agency_name=$5, client_name=$6,
      rate_card_name=$7, file_name=$8, lines=$9, extras=$10, option1_package=$11, option2_discount=$12, selected_option=$13, result=$14,
      updated_at=now() WHERE id=$15 RETURNING id`, [...vals, existingId]);
    if (!rows[0]) throw httpError(404, 'Schedule not found');
    return { id: rows[0].id, result };
  }
  const { rows } = await query(`INSERT INTO schedules(schedule_no, month, agency_id, client_id, agency_name, client_name, rate_card_name,
    file_name, lines, extras, option1_package, option2_discount, selected_option, result)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`, vals);
  return { id: rows[0].id, result };
}

// Option 01 / Option 02 changes from the schedule dashboard (autosaved).
r.patch('/schedules/:id/options', async (req, res) => {
  const sid = id(req.params.id);
  const { rows } = await query('SELECT agency_id, client_id, lines, result FROM schedules WHERE id=$1', [sid]);
  if (!rows[0]) throw httpError(404, 'Schedule not found');
  const opts = optionFields(req.body || {});
  const result = await compute(rows[0].agency_id, rows[0].client_id, rows[0].lines, opts);
  if (!result.deal) result.deal = rows[0].result.deal; // agency/client deleted later: keep the original deal info
  await query(`UPDATE schedules SET option1_package=$1, option2_discount=$2, selected_option=$3, result=$4, updated_at=now() WHERE id=$5`,
    [opts.option1_package, opts.option2_discount, result.totals.selected_option, JSON.stringify(result), sid]);
  res.json(result);
});

r.post('/schedules', async (req, res) => res.status(201).json(await saveSchedule(req.body || {})));
r.put('/schedules/:id', async (req, res) => res.json(await saveSchedule(req.body || {}, id(req.params.id))));
r.delete('/schedules/:id', async (req, res) => {
  await query('DELETE FROM schedules WHERE id=$1', [id(req.params.id)]);
  res.status(204).end();
});

// ── Reports (always from the saved snapshot) ──
async function loadForReport(sid) {
  const { rows } = await query(`SELECT s.*, to_char(s.month, 'YYYY-MM') AS month_key FROM schedules s WHERE id=$1`, [sid]);
  if (!rows[0]) throw httpError(404, 'Schedule not found');
  return rows[0];
}
const fileBase = (s) => `${s.schedule_no}_${s.client_name}_${s.month_key}`.replace(/[^\w.-]+/g, '_').slice(0, 90);

r.get('/schedules/:id/report.xlsx', async (req, res) => {
  const s = await loadForReport(id(req.params.id));
  const buf = await buildWorkbook(s);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileBase(s)}.xlsx"`);
  res.send(Buffer.from(buf));
});
r.get('/schedules/:id/report.pdf', async (req, res) => {
  const s = await loadForReport(id(req.params.id));
  const buf = await buildPdf(s);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.inline ? 'inline' : 'attachment'}; filename="${fileBase(s)}.pdf"`);
  res.send(buf);
});

// ── Home dashboard ──
r.get('/dashboard', async (req, res) => {
  const params = [];
  const where = filters({ month: req.query.month, agency_id: req.query.agency_id }, params);
  const T = (k) => `COALESCE(sum((s.result->'totals'->>'${k}')::numeric),0)`;
  const S = (p, k) => `COALESCE(sum((s.result->'split'->'${p}'->>'${k}')::numeric),0)`;
  const [{ rows: [kpi] }, { rows: byAgency }, { rows: byClient }, { rows: recent }] = await Promise.all([
    query(`SELECT count(*)::int AS schedules, count(DISTINCT s.client_id)::int AS clients, ${T('trv')} AS trv, ${T('package')} AS package,
      ${T('spots')} AS spots, ${T('units')} AS units, ${S('PT', 'spots')} AS pt_spots, ${S('NPT', 'spots')} AS npt_spots,
      ${S('PT', 'discounted')} AS pt_value, ${S('NPT', 'discounted')} AS npt_value FROM schedules s ${where}`, params),
    query(`SELECT s.agency_name AS name, count(*)::int AS schedules, ${T('trv')} AS trv, ${T('package')} AS package
      FROM schedules s ${where} GROUP BY s.agency_name ORDER BY package DESC LIMIT 10`, params),
    query(`SELECT s.client_name AS name, s.agency_name AS agency, count(*)::int AS schedules, ${T('trv')} AS trv, ${T('package')} AS package
      FROM schedules s ${where} GROUP BY s.client_name, s.agency_name ORDER BY package DESC LIMIT 10`, params),
    query(`SELECT ${LIST_COLS} FROM schedules s ${where} ORDER BY s.updated_at DESC LIMIT 8`, params),
  ]);
  // 12-month trend ending at the selected month (or the latest month with data).
  const tParams = [];
  const tWhere = req.query.agency_id ? (tParams.push(id(req.query.agency_id)), `WHERE s.agency_id = $${tParams.length}`) : '';
  tParams.push(req.query.month ? monthDate(req.query.month) : null);
  const { rows: trend } = await query(`
    WITH last AS (SELECT COALESCE($${tParams.length}::date, (SELECT max(month) FROM schedules), date_trunc('month', now())::date) AS m),
    months AS (SELECT (date_trunc('month', (SELECT m FROM last)) - (n || ' month')::interval)::date AS m FROM generate_series(0, 11) n)
    SELECT to_char(months.m, 'YYYY-MM') AS month, count(s.id)::int AS schedules, ${T('trv')} AS trv, ${T('package')} AS package
    FROM months LEFT JOIN schedules s ON s.month = months.m ${tWhere ? `AND ${tWhere.slice(6)}` : ''}
    GROUP BY months.m ORDER BY months.m`, tParams);
  res.json({ kpi, byAgency, byClient, recent, trend });
});

module.exports = r;
