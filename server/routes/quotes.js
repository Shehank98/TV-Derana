// Quote workflow: upload → parse + match → calculate → export / save.
const express = require('express');
const { query, tx } = require('../db');
const repo = require('../repo');
const { parseWorkbook } = require('../lib/parser');
const { matchAll } = require('../lib/matcher');
const { calculate } = require('../lib/pricing');
const { buildWorkbook } = require('../lib/exporter');
const { httpError, requireText, optText, num, id } = require('./util');

const r = express.Router();

function pricingLabel(client, card) {
  if (!client) return 'Base rate card';
  if (client.pricing_type === 'discount') return `Base rate card −${Number(client.discount_pct)}%`;
  if (client.pricing_type === 'rate_card') return card ? `Custom card: ${card.name}` : 'Custom card (missing → base)';
  return 'Base rate card';
}

// Keep only the fields a schedule line needs (never trust the browser's extras).
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
  }));
}

async function compute(clientId, lines, packagePrice) {
  const ctx = await repo.pricingContext(clientId);
  const result = calculate(lines, ctx, packagePrice);
  result.client = ctx.client ? {
    id: ctx.client.id, name: ctx.client.name, agency_id: ctx.client.agency_id, agency_name: ctx.client.agency_name,
    pricing_label: pricingLabel(ctx.client, ctx.card),
  } : null;
  return result;
}

// 1) Upload: raw .xlsx body. Returns parsed lines with match suggestions.
r.post('/quotes/parse', express.raw({ type: () => true, limit: '20mb' }), async (req, res) => {
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
    sheet: parsed.sheet, sheets: parsed.sheets, columns: parsed.columns,
    lines: matched.map((l) => ({ ...l, program_id: l.match.program_id, status: l.match.status })),
    extras: parsed.extras,
  });
});

// 2) Calculate with the current (possibly hand-corrected) matches.
r.post('/quotes/calculate', async (req, res) => {
  const b = req.body || {};
  const clientId = b.client_id ? id(b.client_id) : null;
  res.json(await compute(clientId, cleanLines(b.lines), num(b.package_price, 'Package price', { min: 0, required: false })));
});

async function sendWorkbook(res, q, result) {
  const buf = await buildWorkbook(q, result);
  const safe = String(q.ref || q.title || 'quotation').replace(/[^\w.-]+/g, '_').slice(0, 80);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${safe}.xlsx"`);
  res.send(Buffer.from(buf));
}

// 3a) Export without saving.
r.post('/quotes/export', async (req, res) => {
  const b = req.body || {};
  const clientId = b.client_id ? id(b.client_id) : null;
  const result = await compute(clientId, cleanLines(b.lines), num(b.package_price, 'Package price', { min: 0, required: false }));
  await sendWorkbook(res, {
    ref: b.ref, title: b.title, file_name: b.file_name, extras: Array.isArray(b.extras) ? b.extras : [],
    agency_name: result.client?.agency_name, client_name: result.client?.name, pricing_label: result.client?.pricing_label,
  }, result);
});

// ── Saved quotations ──
r.get('/quotations', async (req, res) => {
  const s = `%${String(req.query.search || '').trim()}%`;
  const { rows } = await query(`
    SELECT id, ref, title, agency_name, client_name, client_id, file_name, package_price, created_at, updated_at,
           (totals->'totals'->>'final')::numeric AS final, (totals->'totals'->>'gross')::numeric AS gross,
           (totals->'totals'->>'spots')::int AS spots, (totals->'totals'->>'total_discount_pct')::numeric AS discount_pct
    FROM quotations
    WHERE $1 = '%%' OR title ILIKE $1 OR ref ILIKE $1 OR agency_name ILIKE $1 OR client_name ILIKE $1
    ORDER BY created_at DESC LIMIT 500`, [s]);
  res.json(rows);
});

r.get('/quotations/:id', async (req, res) => {
  const { rows } = await query('SELECT * FROM quotations WHERE id=$1', [id(req.params.id)]);
  if (!rows[0]) throw httpError(404, 'Quotation not found');
  res.json(rows[0]);
});

async function saveQuote(body, existingId) {
  const clientId = body.client_id ? id(body.client_id) : null;
  const lines = cleanLines(body.lines);
  const pkg = num(body.package_price, 'Package price', { min: 0, required: false });
  const result = await compute(clientId, lines, pkg);
  const title = requireText(body.title, 'Campaign title');
  const extras = Array.isArray(body.extras) ? body.extras : [];
  const vals = [title, result.client?.agency_id || null, clientId, result.client?.agency_name || null, result.client?.name || null,
    optText(body.file_name), pkg, JSON.stringify(lines), JSON.stringify(extras), JSON.stringify(result)];
  return tx(async (c) => {
    if (existingId) {
      const { rows } = await c.query(`UPDATE quotations SET title=$1, agency_id=$2, client_id=$3, agency_name=$4, client_name=$5,
        file_name=$6, package_price=$7, lines=$8, extras=$9, totals=$10, updated_at=now() WHERE id=$11 RETURNING id, ref`,
      [...vals, existingId]);
      if (!rows[0]) throw httpError(404, 'Quotation not found');
      return rows[0];
    }
    const { rows } = await c.query(`INSERT INTO quotations(ref, title, agency_id, client_id, agency_name, client_name, file_name,
      package_price, lines, extras, totals) VALUES ('pending',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, vals);
    const ref = `DQ-${new Date().getFullYear()}-${String(rows[0].id).padStart(4, '0')}`;
    await c.query('UPDATE quotations SET ref=$1 WHERE id=$2', [ref, rows[0].id]);
    return { id: rows[0].id, ref };
  });
}

r.post('/quotations', async (req, res) => res.status(201).json(await saveQuote(req.body || {})));
r.put('/quotations/:id', async (req, res) => res.json(await saveQuote(req.body || {}, id(req.params.id))));
r.delete('/quotations/:id', async (req, res) => {
  await query('DELETE FROM quotations WHERE id=$1', [id(req.params.id)]);
  res.status(204).end();
});

// Export a saved quotation exactly as it was saved (rate changes later don't alter it).
r.get('/quotations/:id/export', async (req, res) => {
  const { rows } = await query('SELECT * FROM quotations WHERE id=$1', [id(req.params.id)]);
  const q = rows[0];
  if (!q) throw httpError(404, 'Quotation not found');
  await sendWorkbook(res, { ...q, pricing_label: q.totals.client?.pricing_label }, q.totals);
});

module.exports = r;
