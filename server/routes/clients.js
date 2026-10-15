// Agencies, clients, the agency–client deals that link them, and client rate cards.
// A client exists once and can be linked to an agency; when a client moves to a
// new agency the old link is ended (kept as history) and a new one is created.
const express = require('express');
const { query, tx } = require('../db');
const repo = require('../repo');
const { httpError, requireText, optText, num, id, pgFriendly } = require('./util');

const r = express.Router();

const LINKS_SQL = `
  SELECT ac.*, a.name AS agency_name, cl.name AS client_name, rc.name AS rate_card_name,
         (SELECT count(*)::int FROM schedules s WHERE s.agency_id = ac.agency_id AND s.client_id = ac.client_id) AS schedule_count
  FROM agency_clients ac
  JOIN agencies a ON a.id = ac.agency_id
  JOIN clients cl ON cl.id = ac.client_id
  LEFT JOIN rate_cards rc ON rc.id = ac.rate_card_id`;

// ── Agencies (with their linked clients) ──
r.get('/agencies', async (req, res) => {
  const { rows: agencies } = await query('SELECT * FROM agencies ORDER BY name');
  const { rows: links } = await query(`${LINKS_SQL} ORDER BY cl.name`);
  res.json(agencies.map((a) => ({
    ...a,
    clients: links.filter((l) => l.agency_id === a.id && l.active),
    past_clients: links.filter((l) => l.agency_id === a.id && !l.active),
  })));
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

// ── Clients (with all their agency links, current first) ──
r.get('/clients', async (req, res) => {
  const { rows: clients } = await query(`
    SELECT cl.*, (SELECT count(*)::int FROM schedules s WHERE s.client_id = cl.id) AS schedule_count
    FROM clients cl ORDER BY cl.name`);
  const { rows: links } = await query(`${LINKS_SQL} ORDER BY ac.active DESC, ac.since DESC`);
  res.json(clients.map((c) => ({ ...c, links: links.filter((l) => l.client_id === c.id) })));
});

function dealFields(b) {
  return {
    rate_card_id: b.rate_card_id ? id(b.rate_card_id) : null,
    discount_pct: num(b.discount_pct || 0, 'Agreed discount %', { min: 0, max: 100 }),
    notes: optText(b.deal_notes ?? b.notes),
  };
}

// Creates or re-activates the link between an agency and a client.
async function linkClient(c, agencyId, clientId, deal) {
  const { rows } = await c.query(`
    INSERT INTO agency_clients(agency_id, client_id, rate_card_id, discount_pct, notes, active, since, ended)
    VALUES ($1,$2,$3,$4,$5,TRUE,CURRENT_DATE,NULL)
    ON CONFLICT (agency_id, client_id) DO UPDATE SET rate_card_id=EXCLUDED.rate_card_id, discount_pct=EXCLUDED.discount_pct,
      notes=EXCLUDED.notes, active=TRUE, since=CURRENT_DATE, ended=NULL
    RETURNING *`, [agencyId, clientId, deal.rate_card_id, deal.discount_pct, deal.notes]);
  return rows[0];
}

r.post('/clients', async (req, res) => {
  const b = req.body;
  const out = await tx(async (c) => {
    const { rows } = await c.query('INSERT INTO clients(name, notes) VALUES ($1,$2) RETURNING *',
      [requireText(b.name, 'Client name'), optText(b.notes)]).catch((e) => { throw pgFriendly(e); });
    if (b.agency_id) await linkClient(c, id(b.agency_id), rows[0].id, dealFields(b));
    return rows[0];
  });
  res.status(201).json(out);
});
r.put('/clients/:id', async (req, res) => {
  try {
    const { rows } = await query('UPDATE clients SET name=$1, notes=$2 WHERE id=$3 RETURNING *',
      [requireText(req.body.name, 'Client name'), optText(req.body.notes), id(req.params.id)]);
    if (!rows[0]) throw httpError(404, 'Client not found');
    res.json(rows[0]);
  } catch (e) { throw pgFriendly(e); }
});
r.delete('/clients/:id', async (req, res) => {
  await query('DELETE FROM clients WHERE id=$1', [id(req.params.id)]);
  res.status(204).end();
});

// Move a client to another agency: current links end, the new link starts today.
r.post('/clients/:id/move', async (req, res) => {
  const clientId = id(req.params.id);
  const to = id(req.body.agency_id);
  const link = await tx(async (c) => {
    await c.query(`UPDATE agency_clients SET active=FALSE, ended=CURRENT_DATE
                   WHERE client_id=$1 AND active AND agency_id <> $2`, [clientId, to]);
    return linkClient(c, to, clientId, dealFields(req.body));
  });
  res.json(link);
});

// ── Agency–client deals ──
r.post('/agency-clients', async (req, res) => {
  const b = req.body;
  const link = await tx((c) => linkClient(c, id(b.agency_id), id(b.client_id), dealFields(b)));
  res.status(201).json(link);
});
r.put('/agency-clients/:id', async (req, res) => {
  const d = dealFields(req.body);
  const { rows } = await query(`UPDATE agency_clients SET rate_card_id=$1, discount_pct=$2, notes=$3 WHERE id=$4 RETURNING *`,
    [d.rate_card_id, d.discount_pct, d.notes, id(req.params.id)]);
  if (!rows[0]) throw httpError(404, 'Link not found');
  res.json(rows[0]);
});
// Ending a link keeps it as history (schedules still show the agency).
r.delete('/agency-clients/:id', async (req, res) => {
  await query('UPDATE agency_clients SET active=FALSE, ended=CURRENT_DATE WHERE id=$1', [id(req.params.id)]);
  res.status(204).end();
});

// ── Client rate cards ──
r.get('/rate-cards', async (req, res) => {
  const { rows } = await query(`
    SELECT rc.*, (SELECT count(*)::int FROM rate_card_items i WHERE i.rate_card_id = rc.id) AS item_count,
           COALESCE((SELECT json_agg(json_build_object('client', cl.name, 'agency', a.name) ORDER BY cl.name)
                     FROM agency_clients ac JOIN clients cl ON cl.id = ac.client_id JOIN agencies a ON a.id = ac.agency_id
                     WHERE ac.rate_card_id = rc.id AND ac.active), '[]') AS used_by
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

// Deals on this card fall back to the base rate card (rate_card_id → NULL).
r.delete('/rate-cards/:id', async (req, res) => {
  await query('DELETE FROM rate_cards WHERE id=$1', [id(req.params.id)]);
  res.status(204).end();
});

module.exports = r;
