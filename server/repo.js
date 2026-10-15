// Loads everything the matcher and pricing engine need from Postgres.
const { query } = require('./db');

async function getSettings() {
  const { rows } = await query('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

async function getSlots() {
  const { rows } = await query(`
    SELECT s.*, c.name AS category_name, c.sort AS category_sort
    FROM rate_slots s JOIN rate_categories c ON c.id = s.category_id
    ORDER BY c.sort, c.id, s.sort, s.id`);
  return rows;
}

async function getPrograms({ includeInactive = false } = {}) {
  const { rows } = await query(`
    SELECT p.*, s.name AS slot_name, s.rate_30s, c.name AS category_name,
           COALESCE(json_agg(json_build_object('id', a.id, 'alias', a.alias))
                    FILTER (WHERE a.id IS NOT NULL), '[]') AS alias_list
    FROM programs p
    JOIN rate_slots s ON s.id = p.slot_id
    JOIN rate_categories c ON c.id = s.category_id
    LEFT JOIN program_aliases a ON a.program_id = p.id
    ${includeInactive ? '' : 'WHERE p.active'}
    GROUP BY p.id, s.id, c.id
    ORDER BY c.sort, s.sort, p.start_time, p.name`);
  return rows.map((p) => ({ ...p, aliases: p.alias_list.map((a) => a.alias) }));
}

async function getAliases() {
  const { rows } = await query('SELECT program_id, alias, alias_norm FROM program_aliases');
  return rows;
}

async function getRules() {
  const { rows } = await query('SELECT * FROM special_rules ORDER BY id');
  return rows;
}

// An agency–client deal (which card prices it, the agreed discount).
async function getDeal(agencyId, clientId) {
  if (!agencyId || !clientId) return null;
  const { rows } = await query(`
    SELECT ac.*, a.name AS agency_name, cl.name AS client_name, rc.name AS rate_card_name
    FROM agency_clients ac
    JOIN agencies a ON a.id = ac.agency_id
    JOIN clients cl ON cl.id = ac.client_id
    LEFT JOIN rate_cards rc ON rc.id = ac.rate_card_id
    WHERE ac.agency_id = $1 AND ac.client_id = $2`, [agencyId, clientId]);
  return rows[0] || null;
}

async function getCard(id) {
  if (!id) return null;
  const { rows } = await query('SELECT * FROM rate_cards WHERE id = $1', [id]);
  if (!rows[0]) return null;
  const { rows: items } = await query('SELECT slot_id, mode, value FROM rate_card_items WHERE rate_card_id = $1', [id]);
  return { ...rows[0], items: Object.fromEntries(items.map((i) => [i.slot_id, { mode: i.mode, value: i.value }])) };
}

// Everything pricing.calculate() needs for one agency–client deal.
async function pricingContext(agencyId, clientId) {
  const [slots, programs, rules, deal] = await Promise.all([
    getSlots(), getPrograms({ includeInactive: true }), getRules(), getDeal(agencyId, clientId),
  ]);
  const card = deal && deal.rate_card_id ? await getCard(deal.rate_card_id) : null;
  return {
    slots: new Map(slots.map((s) => [s.id, s])),
    programs: new Map(programs.map((p) => [p.id, p])),
    deal, card, rules,
  };
}

module.exports = { getSettings, getSlots, getPrograms, getAliases, getRules, getDeal, getCard, pricingContext };
