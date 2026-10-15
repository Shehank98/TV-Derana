// Agencies, their clients, and custom client rate cards.
const express = require('express');
const { query, tx } = require('../db');
const repo = require('../repo');
const { httpError, requireText, optText, num, id, pgFriendly } = require('./util');

const r = express.Router();

// ── Agencies (with nested clients) ──
r.get('/agencies', async (req, res) => {
  const { rows: agencies } = await query('SELECT * FROM agencies ORDER BY name');
  const { rows: clients } = await query(`
    SELECT cl.*, rc.name AS rate_card_name,
           (SELECT count(*)::int FROM quotations q WHERE q.client_id = cl.id) AS quote_count
    FROM clients cl LEFT JOIN rate_cards rc ON rc.id = cl.rate_card_id ORDER BY cl.name`);
  res.json(agencies.map((a) => ({ ...a, clients: clients.filter((c) => c.agency_id === a.id) })));
});

const agencyFields = (b) => [requireText(b.name, 'Agency name'), optText(b.contact), optText(b.email), optText(b.phone), optText(b.notes)];

r.post('/agencies', async (req, res) => {
  try {
    const { rows } = await query('INSERT INTO agencies(name, contact, email, phone, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *', agencyFields(req.body));
    res.status(201).json(rows[0]);
  } catch (e) { throw pgFriendly(e); }
});
r.put('/agencies/:id', async (req, res) => {
  try {
    const { rows } = await query('UPDATE agencies SET name=$1, contact=$2, email=$3, phone=$4, notes=$5 WHERE id=$6 RETURNING *',
      [...agencyFields(req.body), id(req.params.id)]);
    if (!rows[0]) throw httpError(404, 'Agency not found');
    res.json(rows[0]);
  } catch (e) { throw pgFriendly(e); }
});
r.delete('/agencies/:id', async (req, res) => {
  await query('DELETE FROM agencies WHERE id=$1', [id(req.params.id)]);
  res.status(204).end();
});

// ── Clients ──
function clientFields(b) {
  const type = b.pricing_type || 'base';
  if (!['base', 'discount', 'rate_card'].includes(type)) throw httpError(400, 'Invalid pricing type');
  const discount = type === 'discount' ? num(b.discount_pct, 'Discount %', { min: 0, max: 100 }) : 0;
  const card = type === 'rate_card' ? id(b.rate_card_id) : null;
  return [id(b.agency_id), requireText(b.name, 'Client name'), type, discount, card, optText(b.notes)];
}

r.post('/clients', async (req, res) => {
  try {
    const { rows } = await query(
      'INSERT INTO clients(agency_id, name, pricing_type, discount_pct, rate_card_id, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      clientFields(req.body));
    res.status(201).json(rows[0]);
  } catch (e) { throw pgFriendly(e); }
});
r.put('/clients/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE clients SET agency_id=$1, name=$2, pricing_type=$3, discount_pct=$4, rate_card_id=$5, notes=$6
       WHERE id=$7 RETURNING *`, [...clientFields(req.body), id(req.params.id)]);
    if (!rows[0]) throw httpError(404, 'Client not found');
    res.json(rows[0]);
  } catch (e) { throw pgFriendly(e); }
});
r.delete('/clients/:id', async (req, res) => {
  await query('DELETE FROM clients WHERE id=$1', [id(req.params.id)]);
  res.status(204).end();
});

// ── Client rate cards ──
r.get('/rate-cards', async (req, res) => {
  const { rows } = await query(`
    SELECT rc.*, (SELECT count(*)::int FROM rate_card_items i WHERE i.rate_card_id = rc.id) AS item_count,
           COALESCE((SELECT json_agg(json_build_object('id', cl.id, 'name', cl.name, 'agency', a.name) ORDER BY cl.name)
                     FROM clients cl JOIN agencies a ON a.id = cl.agency_id
                     WHERE cl.rate_card_id = rc.id AND cl.pricing_type = 'rate_card'), '[]') AS clients
    FROM rate_cards rc ORDER BY rc.name`);
  res.json(rows);
});

r.get('/rate-cards/:id', async (req, res) => {
  const card = await repo.getCard(id(req.params.id));
  if (!card) throw httpError(404, 'Rate card not found');
  res.json({ ...card, slots: await repo.getSlots() });
});

function cardFields(b) {
  return [requireText(b.name, 'Card name'), num(b.default_discount_pct ?? 0, 'Default discount %', { min: 0, max: 100 }), optText(b.notes)];
}

async function saveItems(c, cardId, items) {
  if (!Array.isArray(items)) return;
  await c.query('DELETE FROM rate_card_items WHERE rate_card_id=$1', [cardId]);
  for (const it of items) {
    if (!it || !['fixed', 'discount'].includes(it.mode)) continue;
    const value = num(it.value, it.mode === 'fixed' ? 'Fixed rate' : 'Discount %', { min: 0, max: it.mode === 'discount' ? 100 : Infinity });
    await c.query('INSERT INTO rate_card_items(rate_card_id, slot_id, mode, value) VALUES ($1,$2,$3,$4)', [cardId, id(it.slot_id), it.mode, value]);
  }
}

r.post('/rate-cards', async (req, res) => {
  const card = await tx(async (c) => {
    const { rows } = await c.query('INSERT INTO rate_cards(name, default_discount_pct, notes) VALUES ($1,$2,$3) RETURNING *',
      cardFields(req.body)).catch((e) => { throw pgFriendly(e); });
    if (req.body.copy_from) {
      await c.query(`INSERT INTO rate_card_items(rate_card_id, slot_id, mode, value)
                     SELECT $1, slot_id, mode, value FROM rate_card_items WHERE rate_card_id=$2`, [rows[0].id, id(req.body.copy_from)]);
    } else {
      await saveItems(c, rows[0].id, req.body.items);
    }
    return rows[0];
  });
  res.status(201).json(card);
});

r.put('/rate-cards/:id', async (req, res) => {
  const cid = id(req.params.id);
  const card = await tx(async (c) => {
    const { rows } = await c.query('UPDATE rate_cards SET name=$1, default_discount_pct=$2, notes=$3, updated_at=now() WHERE id=$4 RETURNING *',
      [...cardFields(req.body), cid]).catch((e) => { throw pgFriendly(e); });
    if (!rows[0]) throw httpError(404, 'Rate card not found');
    await saveItems(c, cid, req.body.items);
    return rows[0];
  });
  res.json(card);
});

r.delete('/rate-cards/:id', async (req, res) => {
  const cid = id(req.params.id);
  // Clients on this card fall back to the base rate card.
  await tx(async (c) => {
    await c.query(`UPDATE clients SET pricing_type='base', rate_card_id=NULL WHERE rate_card_id=$1`, [cid]);
    await c.query('DELETE FROM rate_cards WHERE id=$1', [cid]);
  });
  res.status(204).end();
});

module.exports = r;
