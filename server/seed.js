// Initial data: TV Derana rate card (PDF, effective April 2025) + program
// schedule carried over from the legacy SQLite DB (with known fixes applied).
const { tx, query } = require('./db');

// [category, [[slot name, rate per 30s], ...]] — order matches the PDF.
const RATE_CARD = [
  ['Tele Dramas', [
    ['Weekdays Evening', 329000], ['Weekends Evening', 329000],
    ['Weekdays 7.30pm', 1200000], ['Weekdays 8.00pm', 1166000], ['Weekdays 8.30pm', 1092000],
    ['Weekdays 9.00pm', 779000], ['Weekdays 9.30pm', 664000],
    ['Other Dramas, Kanthoru Moru', 299000],
    ['Tele Drama Repeats-Catg 01', 152000], ['Tele Drama Repeats-Catg 02', 121000],
  ]],
  ['Exclusive', [
    ['Weekends Prime Drama', 559000], ['Dream Star', 493000], ['Star City', 604000],
    ['Little Star/Drama', 535000], ['Champion Star', 457000], ['60+, Battle of Bands', 415000],
    ['Dance Unlimited', 415000], ['DMSL/DFA/DMVA', 228000], ['Reality Repeats', 125000],
    ['Paara Kiyana Tharuka', 259000], ['Travel with Chathura', 259000],
    ['Thathvika, Dishum, Beli Mal, K/Warriors', 199000],
  ]],
  ['Cartoons/Children', [
    ['Weekdays', 161000], ['Weekends, Hondatama Pahila', 161000],
  ]],
  ['Movies', [
    ['Weekday Movies', 130000], ['Weekend Movies', 228000],
    ['Movies On Special Days/Block Buster Movies', 319000], ['Children Movies', 208000],
  ]],
  ['News & Current Affairs', [
    ['Ada Derana 7.00pm', 1156000], ['Ada Derana 10.00pm (Weekdays)', 374000],
    ['Midday News', 202000], ['Derana Aruna & Lokaya Saha Lokayo', 332000],
  ]],
  ['Other', [
    ['Other Prime Programs 10.30pm Onwards - Weekdays', 145000],
    ['Other Prime Programs 10.30pm Onwards - Weekends', 145000],
    ['Request/Chart Shows - Weekdays', 110000], ['Request/Chart Shows - Weekends', 110000],
    ['Chat/Talk Shows - Weekdays', 110000], ['Chat/Talk Shows - Weekends', 110000],
    ['Magazines and Documentaries - Weekdays', 110000], ['Magazines and Documentaries - Weekends', 110000],
    ['Religious Programs - Weekdays', 110000], ['Religious Programs - Weekends', 110000],
    ['Other Day Time Programs 8.00am-6.00pm - Weekdays', 110000],
    ['Other Day Time Programs 8.00am-6.00pm - Weekends', 110000],
  ]],
];

// [name, slot name, day pattern, start, end, prime, generic?, aliases?, notes?]
const PROGRAMS = [
  ['Kodu Kaari', 'Weekdays Evening', 'Wkdays', '17:55', '18:25', false],
  ['Sitha Nidi Na', 'Weekdays Evening', 'Wkdays', '18:25', '18:55', false],
  ['Amma Wage', 'Weekends Evening', 'Wkends', '16:55', '17:55', false],
  ['Bakery Gedara', 'Weekends Evening', 'Wkends', '17:55', '18:55', false],
  ['Skole', 'Weekdays 7.30pm', 'Wkdays', '19:30', '20:00', true],
  ['Sangeethe', 'Weekdays 8.00pm', 'Wkdays', '20:00', '20:30', true],
  ['Deveni Inima', 'Weekdays 8.30pm', 'Wkdays', '20:30', '21:00', true],
  ['Nikini Kusum', 'Weekdays 9.00pm', 'Wkdays', '21:00', '21:30', true],
  ['Prarthana', 'Weekdays 9.30pm', 'Wkdays', '21:30', '22:00', true],
  ['Skole Rpt', 'Tele Drama Repeats-Catg 01', 'Wkdays', '09:00', '09:30', false],
  ['Sangeethe Rpt', 'Tele Drama Repeats-Catg 01', 'Wkdays', '09:30', '10:00', false],
  ['Deveni Inima Rpt', 'Tele Drama Repeats-Catg 02', 'Wkdays', '10:00', '10:30', false],
  ['Nikini Kusum Rpt', 'Tele Drama Repeats-Catg 02', 'Wkdays', '10:30', '11:00', false],
  ['Prarthana Rpt', 'Tele Drama Repeats-Catg 02', 'Wkdays', '11:00', '11:30', false],
  ['Bakery Gedara Rpt', 'Tele Drama Repeats-Catg 02', 'Wkends', '09:00', '10:00', false],
  ['Naataka Maarai Rpt', 'Tele Drama Repeats-Catg 02', 'Sat.day', '15:30', '16:25', false],
  ['Naataka Maarai Rpt', 'Tele Drama Repeats-Catg 02', 'Sunday', '11:30', '12:00', false],
  ['Naataka Maarai Rpt', 'Tele Drama Repeats-Catg 02', 'Sunday', '15:30', '16:00', false],
  ['Salena Nuwan', 'Weekends Prime Drama', 'Wkends', '21:05', '22:00', true],
  ['Dream Star', 'Dream Star', 'Wkends', '19:35', '21:05', true],
  ['Champion Star Unlimited', 'Champion Star', 'Sat.day', '22:35', '00:00', true],
  ['Derana 60 Plus', '60+, Battle of Bands', 'Wkends', '10:00', '11:00', false, false, ['Derana 60Plus', 'Derana 60+']],
  ['Paara Kiyana Tharuka', 'Paara Kiyana Tharuka', 'Monday', '08:00', '09:00', false],
  ['Travel with Chathura', 'Travel with Chathura', 'Sat.day', '11:00', '11:30', false],
  ['Dishyum Dishyum', 'Thathvika, Dishum, Beli Mal, K/Warriors', 'Sat.day', '11:00', '12:00', false],
  ['Sootin Martin', 'Weekdays', 'Tue-Fri', '08:00', '09:00', false],
  ['Golmaal', 'Weekdays', 'Wkdays', '16:00', '16:25', false],
  ['Kala Kalliya', 'Weekdays', 'Wkdays', '16:25', '16:55', false],
  ['Alvin', 'Weekdays', 'Wkdays', '16:55', '17:25', false],
  ['Nil Kurumitto', 'Weekdays', 'Wkdays', '17:25', '17:55', false],
  ['Supiri Raju', 'Weekends, Hondatama Pahila', 'Wkends', '08:00', '09:00', false],
  ['Hondatama Pahila', 'Weekends, Hondatama Pahila', 'Sat.day', '16:25', '16:55', false],
  ['Weekday Movies', 'Weekday Movies', 'Wkdays', '12:30', '16:00', false],
  ['Weekend Movies', 'Weekend Movies', 'Wkends', '12:35', '15:30', false],
  ['Ada Derana 6.55', 'Ada Derana 7.00pm', 'Daily', '18:55', '19:30', true, false, ['Ada Derana 7.00pm']],
  ['Ada Derana 10.00pm', 'Ada Derana 10.00pm (Weekdays)', 'Daily', '22:00', '22:35', true],
  ['Midday News', 'Midday News', 'Daily', '12:00', '12:30', false],
  ['Derana Aruna', 'Derana Aruna & Lokaya Saha Lokayo', 'Daily', '06:30', '07:30', false],
  ['Lokaya Saha Lokayo', 'Derana Aruna & Lokaya Saha Lokayo', 'Daily', '07:30', '08:00', false],
  ['360', 'Other Prime Programs 10.30pm Onwards - Weekdays', 'Monday', '22:35', '00:00', false],
  ['Vaada Pitiya', 'Other Prime Programs 10.30pm Onwards - Weekdays', 'Tuesday', '22:35', '00:00', false],
  ['Aluth Parlimenthuwa', 'Other Prime Programs 10.30pm Onwards - Weekdays', 'Wednesday', '22:35', '00:00', false],
  ['Rebuild Sri Lanka', 'Other Prime Programs 10.30pm Onwards - Weekdays', 'Thursday', '22:35', '00:00', false],
  ['Ma', 'Other Prime Programs 10.30pm Onwards - Weekdays', 'Friday', '22:35', '00:00', false],
  ['Sparsha', 'Other Prime Programs 10.30pm Onwards - Weekends', 'Sunday', '22:35', '00:00', false],
  ['Sera Smart Kitchen', 'Magazines and Documentaries - Weekends', 'Sunday', '16:00', '16:25', false],
  ['The Cook Out', 'Magazines and Documentaries - Weekends', 'Sunday', '16:25', '16:55', false],
  ['Poya Programs', 'Religious Programs - Weekdays', 'Poya Days', '06:00', '18:00', false],
  // Generic time belts: used when an agency line names no recognisable show.
  ['Day Time Belt (Weekdays)', 'Other Day Time Programs 8.00am-6.00pm - Weekdays', 'Wkdays', '08:00', '18:00', false, true],
  ['Day Time Belt (Weekends)', 'Other Day Time Programs 8.00am-6.00pm - Weekends', 'Wkends', '08:00', '18:00', false, true],
  ['Late Night Belt (Weekdays)', 'Other Prime Programs 10.30pm Onwards - Weekdays', 'Wkdays', '22:30', '00:00', false, true],
  ['Late Night Belt (Weekends)', 'Other Prime Programs 10.30pm Onwards - Weekends', 'Wkends', '22:30', '00:00', false, true],
];

const SETTINGS = {
  currency: 'LKR',
  // Header rows in agency sheets that are labels, not campaign themes.
  section_labels: ['SPONSORSHIP', 'BENEFITS', 'PRESENCE', 'COMMERCIAL BENEFITS'],
  // Words that describe the ad item, not the program (never learned as aliases).
  generic_item_words: ['BILLBOARD', 'BILLBOARDS', 'BB', 'CARD', 'CRAWLER', 'TAG', 'TAGS', 'BUMPER', 'BUMPERS',
    'TRAILER', 'TRAILERS', 'LOGO', 'SQUEEZE', 'PROMO', 'STRAP', 'SPOT', 'SPOTS', 'BREAK', 'BRANDING',
    'SONG', 'PROFILE', 'RESULT', 'BOX', 'L', 'SEGMENT', 'ENDORSEMENT', 'MENTION', 'COUNTDOWN'],
  match_auto_threshold: 0.8,
};

async function seedIfEmpty() {
  const { rows } = await query('SELECT count(*)::int AS n FROM rate_categories');
  if (rows[0].n > 0) return false;

  await tx(async (c) => {
    const slotIds = {};
    for (const [ci, [cat, slots]] of RATE_CARD.entries()) {
      const { rows: [{ id: catId }] } = await c.query(
        'INSERT INTO rate_categories(name, sort) VALUES ($1,$2) RETURNING id', [cat, ci]);
      for (const [si, [name, rate]] of slots.entries()) {
        const { rows: [{ id }] } = await c.query(
          'INSERT INTO rate_slots(category_id, name, rate_30s, sort) VALUES ($1,$2,$3,$4) RETURNING id',
          [catId, name, rate, si]);
        slotIds[name] = { id, rate };
      }
    }

    const { normalizeName } = require('./lib/names');
    for (const [name, slot, days, start, end, prime, generic = false, aliases = [], notes = null] of PROGRAMS) {
      if (!slotIds[slot]) throw new Error(`seed: unknown slot ${slot}`);
      const { rows: [{ id }] } = await c.query(
        `INSERT INTO programs(name, slot_id, day_pattern, start_time, end_time, is_prime, is_generic, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [name, slotIds[slot].id, days, start, end, prime, generic, notes]);
      const seen = new Set([normalizeName(name).key]);
      for (const a of aliases) {
        const key = normalizeName(a).key;
        if (seen.has(key)) continue;
        seen.add(key);
        await c.query('INSERT INTO program_aliases(program_id, alias, alias_norm) VALUES ($1,$2,$3)', [id, a, key]);
      }
    }

    await c.query(`INSERT INTO special_rules(keyword, label, rate_pt, rate_npt, apply_client_discount)
                   VALUES ('CRAWLER', 'Crawler', 15000, 8000, false)`);

    for (const [k, v] of Object.entries(SETTINGS)) {
      await c.query('INSERT INTO settings(key, value) VALUES ($1,$2)', [k, JSON.stringify(v)]);
    }

    // Sample agencies/clients carried over from the legacy system.
    const { rows: [{ id: maliCard }] } = await c.query(
      `INSERT INTO rate_cards(name, default_discount_pct, notes)
       VALUES ('Maliban Rates', 4.41, 'Migrated: legacy card was ≈4.41% below base on every slot') RETURNING id`);
    const { rows: [{ id: ndbCard }] } = await c.query(
      `INSERT INTO rate_cards(name, default_discount_pct, notes)
       VALUES ('NDB Rate Card', 0, 'Migrated: legacy card was base +10% on every slot') RETURNING id`);
    for (const { id, rate } of Object.values(slotIds)) {
      await c.query(`INSERT INTO rate_card_items(rate_card_id, slot_id, mode, value) VALUES ($1,$2,'fixed',$3)`,
        [ndbCard, id, Math.round(rate * 1.1)]);
    }

    const agency = async (name) => (await c.query('INSERT INTO agencies(name) VALUES ($1) RETURNING id', [name])).rows[0].id;
    const client = async (name) => (await c.query('INSERT INTO clients(name) VALUES ($1) RETURNING id', [name])).rows[0].id;
    const link = (a, cl, card, disc) => c.query(
      'INSERT INTO agency_clients(agency_id, client_id, rate_card_id, discount_pct) VALUES ($1,$2,$3,$4)', [a, cl, card, disc]);
    const ogilvy = await agency('Ogilvy Media');
    const agency2 = await agency('Agency 2');
    await link(ogilvy, await client('SLT/Mobitel'), null, 30);
    await link(ogilvy, await client('NDB'), ndbCard, 0);
    await link(agency2, await client('Maliban'), maliCard, 0);
  });
  console.log('seed data inserted');
  return true;
}

module.exports = { seedIfEmpty, RATE_CARD, PROGRAMS, SETTINGS };
