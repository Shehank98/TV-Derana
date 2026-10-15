// Base rate card (categories → slots) and the program schedule.
const express = require('express');
const { query, tx } = require('../db');
const repo = require('../repo');
const { normalizeName, isGenericItem } = require('../lib/names');
const { parseDays, describe } = require('../lib/days');
const { matchAll } = require('../lib/matcher');
const { parseTime } = require('../lib/time');
const { httpError, requireText, optText, num, time, id, pgFriendly } = require('./util');

const r = express.Router();

r.get('/ratecard', async (req, res) => {
  const { rows: cats } = await query('SELECT * FROM rate_categories ORDER BY sort, id');
  const { rows: slots } = await query(`
    SELECT s.*, (SELECT count(*)::int FROM programs p WHERE p.slot_id = s.id) AS program_count
    FROM rate_slots s ORDER BY sort, id`);
  res.json(cats.map((c) => ({ ...c, slots: slots.filter((s) => s.category_id === c.id) })));
});

// ── Categories ──
r.post('/categories', async (req, res) => {
  const name = requireText(req.body.name, 'Name');
  try {
    const { rows } = await query(
      'INSERT INTO rate_categories(name, sort) VALUES ($1, (SELECT COALESCE(max(sort),0)+1 FROM rate_categories)) RETURNING *', [name]);
    res.status(201).json(rows[0]);
  } catch (e) { throw pgFriendly(e); }
});
r.put('/categories/:id', async (req, res) => {
  const name = requireText(req.body.name, 'Name');
  try {
    const { rows } = await query('UPDATE rate_categories SET name=$1 WHERE id=$2 RETURNING *', [name, id(req.params.id)]);
    if (!rows[0]) throw httpError(404, 'Category not found');
    res.json(rows[0]);
  } catch (e) { throw pgFriendly(e); }
});
r.delete('/categories/:id', async (req, res) => {
  try {
    await query('DELETE FROM rate_categories WHERE id=$1', [id(req.params.id)]);
    res.status(204).end();
  } catch (e) { throw pgFriendly(e); }
});

// ── Slots ──
r.post('/slots', async (req, res) => {
  const b = req.body;
  try {
    const { rows } = await query(
      `INSERT INTO rate_slots(category_id, name, rate_30s, notes, sort)
       VALUES ($1,$2,$3,$4,(SELECT COALESCE(max(sort),0)+1 FROM rate_slots WHERE category_id=$1)) RETURNING *`,
      [id(b.category_id), requireText(b.name, 'Name'), num(b.rate_30s, 'Rate', { min: 0 }), optText(b.notes)]);
    res.status(201).json(rows[0]);
  } catch (e) { throw pgFriendly(e); }
});
r.put('/slots/:id', async (req, res) => {
  const b = req.body;
  try {
    const { rows } = await query(
      'UPDATE rate_slots SET name=$1, rate_30s=$2, notes=$3, category_id=COALESCE($4, category_id) WHERE id=$5 RETURNING *',
      [requireText(b.name, 'Name'), num(b.rate_30s, 'Rate', { min: 0 }), optText(b.notes),
        b.category_id ? id(b.category_id) : null, id(req.params.id)]);
    if (!rows[0]) throw httpError(404, 'Slot not found');
    res.json(rows[0]);
  } catch (e) { throw pgFriendly(e); }
});
r.delete('/slots/:id', async (req, res) => {
  try {
    await query('DELETE FROM rate_slots WHERE id=$1', [id(req.params.id)]);
    res.status(204).end();
  } catch (e) { throw pgFriendly(e); }
});

// ── Programs ──
const withDays = (p) => ({ ...p, days_label: describe(parseDays(p.day_pattern)) });

r.get('/programs', async (req, res) => {
  const programs = await repo.getPrograms({ includeInactive: true });
  res.json(programs.map(withDays));
});

function programFields(b) {
  const pattern = requireText(b.day_pattern, 'Day pattern');
  const parsed = parseDays(pattern);
  if (!parsed.days.size && !parsed.poya) throw httpError(400, `Could not understand day pattern "${pattern}". Try e.g. Wkdays, Wkends, Daily, Mon-Fri, Sat, Sunday, Tue-Fri, Poya.`);
  return [requireText(b.name, 'Name'), id(b.slot_id), pattern, time(b.start_time, 'Start time'), time(b.end_time, 'End time'),
    !!b.is_prime, !!b.is_generic, b.active !== false, optText(b.notes)];
}

async function saveAliases(c, programId, aliases) {
  if (!Array.isArray(aliases)) return;
  await c.query('DELETE FROM program_aliases WHERE program_id=$1', [programId]);
  const seen = new Set();
  for (const a of aliases) {
    const alias = String(a || '').trim();
    const key = normalizeName(alias).key;
    if (!alias || !key || seen.has(key)) continue;
    seen.add(key);
    await c.query('INSERT INTO program_aliases(program_id, alias, alias_norm) VALUES ($1,$2,$3)', [programId, alias, key]);
  }
}

r.post('/programs', async (req, res) => {
  const f = programFields(req.body);
  const prog = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO programs(name, slot_id, day_pattern, start_time, end_time, is_prime, is_generic, active, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, f).catch((e) => { throw pgFriendly(e); });
    await saveAliases(c, rows[0].id, req.body.aliases);
    return rows[0];
  });
  res.status(201).json(prog);
});
r.put('/programs/:id', async (req, res) => {
  const f = programFields(req.body);
  const pid = id(req.params.id);
  const prog = await tx(async (c) => {
    const { rows } = await c.query(
      `UPDATE programs SET name=$1, slot_id=$2, day_pattern=$3, start_time=$4, end_time=$5, is_prime=$6,
       is_generic=$7, active=$8, notes=$9 WHERE id=$10 RETURNING *`, [...f, pid]).catch((e) => { throw pgFriendly(e); });
    if (!rows[0]) throw httpError(404, 'Program not found');
    await saveAliases(c, pid, req.body.aliases);
    return rows[0];
  });
  res.json(prog);
});
r.delete('/programs/:id', async (req, res) => {
  await query('DELETE FROM programs WHERE id=$1', [id(req.params.id)]);
  res.status(204).end();
});

// Learn a new alias from a manual match on the quote screen.
r.post('/programs/:id/aliases', async (req, res) => {
  const alias = requireText(req.body.alias, 'Alias');
  const norm = normalizeName(alias);
  const settings = await repo.getSettings();
  if (!norm.key) throw httpError(400, 'Alias has no usable words');
  if (isGenericItem(norm, settings.generic_item_words)) {
    throw httpError(400, `"${alias}" describes an ad format, not a program, so it is not saved as an alias.`);
  }
  await query(`INSERT INTO program_aliases(program_id, alias, alias_norm) VALUES ($1,$2,$3)
               ON CONFLICT (program_id, alias_norm) DO NOTHING`, [id(req.params.id), alias, norm.key]);
  res.status(201).json({ ok: true });
});

// Try the matcher with a single made-up line (Programs page → "Test matching").
r.post('/match-test', async (req, res) => {
  const b = req.body;
  const line = { row: 0, theme: b.theme || '', program: b.program || '', day: b.day || '',
    start: parseTime(b.start), end: parseTime(b.end), dur: 30, spots: 1 };
  const [programs, aliases, settings] = await Promise.all([repo.getPrograms(), repo.getAliases(), repo.getSettings()]);
  const [m] = matchAll([line], programs, aliases, settings);
  res.json(m.match);
});

module.exports = r;
