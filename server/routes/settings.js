const express = require('express');
const { query } = require('../db');
const repo = require('../repo');
const { httpError, requireText, num, id } = require('./util');

const r = express.Router();

r.get('/settings', async (req, res) => {
  res.json({ settings: await repo.getSettings(), rules: await repo.getRules() });
});

const ALLOWED = {
  currency: (v) => requireText(v, 'Currency'),
  section_labels: (v) => listOf(v),
  generic_item_words: (v) => listOf(v).map((w) => w.toUpperCase()),
  match_auto_threshold: (v) => num(v, 'Auto-match threshold', { min: 0.5, max: 1 }),
};
function listOf(v) {
  const arr = Array.isArray(v) ? v : String(v || '').split(/[\n,]/);
  return arr.map((s) => String(s).trim()).filter(Boolean);
}

r.put('/settings', async (req, res) => {
  for (const [k, v] of Object.entries(req.body || {})) {
    if (!ALLOWED[k]) throw httpError(400, `Unknown setting ${k}`);
    await query(`INSERT INTO settings(key, value) VALUES ($1,$2)
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [k, JSON.stringify(ALLOWED[k](v))]);
  }
  res.json(await repo.getSettings());
});

const ruleFields = (b) => [requireText(b.keyword, 'Keyword').toUpperCase(), requireText(b.label, 'Label'),
  num(b.rate_pt, 'Prime-time rate', { min: 0 }), num(b.rate_npt, 'Non-prime rate', { min: 0 }),
  !!b.apply_client_discount, b.active !== false];

r.post('/special-rules', async (req, res) => {
  const { rows } = await query(`INSERT INTO special_rules(keyword, label, rate_pt, rate_npt, apply_client_discount, active)
                                VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, ruleFields(req.body));
  res.status(201).json(rows[0]);
});
r.put('/special-rules/:id', async (req, res) => {
  const { rows } = await query(`UPDATE special_rules SET keyword=$1, label=$2, rate_pt=$3, rate_npt=$4,
                                apply_client_discount=$5, active=$6 WHERE id=$7 RETURNING *`, [...ruleFields(req.body), id(req.params.id)]);
  if (!rows[0]) throw httpError(404, 'Rule not found');
  res.json(rows[0]);
});
r.delete('/special-rules/:id', async (req, res) => {
  await query('DELETE FROM special_rules WHERE id=$1', [id(req.params.id)]);
  res.status(204).end();
});

module.exports = r;
