// Pure-logic tests (no database): parsing, matching and pricing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { parseTime, timeScore, interval } = require('../server/lib/time');
const { parseDays, dayScore } = require('../server/lib/days');
const { normalizeName, nameScore, isGenericItem } = require('../server/lib/names');
const { parseWorkbook } = require('../server/lib/parser');
const { matchAll } = require('../server/lib/matcher');
const { calculate } = require('../server/lib/pricing');
const { PROGRAMS, RATE_CARD, SETTINGS } = require('../server/seed');

// In-memory copy of the seed data, shaped like the DB rows.
const slots = [];
RATE_CARD.forEach(([cat, list]) => list.forEach(([name, rate]) => slots.push({ id: slots.length + 1, name, rate_30s: rate, category_name: cat })));
const slotByName = Object.fromEntries(slots.map((s) => [s.name, s]));
const programs = PROGRAMS.map(([name, slot, day, s, e, prime, generic = false, aliases = []], i) => ({
  id: i + 1, name, slot_id: slotByName[slot].id, day_pattern: day, start_time: s, end_time: e, is_prime: prime, is_generic: generic, aliases, active: true,
}));
const byName = (n) => programs.find((p) => p.name === n);
const ctxFor = (client, card = null) => ({
  programs: new Map(programs.map((p) => [p.id, p])),
  slots: new Map(slots.map((s) => [s.id, s])),
  client, card,
  rules: [{ keyword: 'CRAWLER', label: 'Crawler', rate_pt: 15000, rate_npt: 8000, apply_client_discount: false, active: true }],
  settings: { tax_pct: 0 },
});

test('times: excel dates, fractions, strings, midnight', () => {
  assert.equal(parseTime(new Date(Date.UTC(1899, 11, 30, 22, 0))), 22 * 60);
  assert.equal(parseTime(0.5), 720);
  assert.equal(parseTime('22:00:00'), 1320);
  assert.equal(parseTime('10.30 PM'), 1350);
  assert.equal(parseTime('1930'), 1170);
  assert.deepEqual(interval(1355, 0), { start: 1355, end: 1440 });
  assert.ok(timeScore(interval(1170, 1260), interval(1175, 1265)) > 0.9);
  assert.equal(timeScore(interval(600, 660), interval(1200, 1260)), 0);
});

test('days: agency wording and DB patterns', () => {
  const set = (t) => [...parseDays(t).days].sort().join('');
  assert.equal(set('MON TO FRI'), '01234');
  assert.equal(set('SAT - SUN'), '56');
  assert.equal(set('SAT-SUN'), '56');
  assert.equal(set('Wkdays'), '01234');
  assert.equal(set('Sat.day'), '5');
  assert.equal(set('Tue-Fri'), '1234');
  assert.equal(set('DAILY'), '0123456');
  assert.ok(parseDays('Poya Days').poya);
  assert.ok(dayScore(parseDays('MON TO FRI'), parseDays('Daily')) > 0.9);
  assert.equal(dayScore(parseDays('SAT - SUN'), parseDays('Wkdays')), 0);
});

test('names: Sinhala spelling variants, times and plurals', () => {
  const s = (a, b) => nameScore(normalizeName(a), normalizeName(b));
  assert.ok(s('DHEVANI INIMA', 'Deveni Inima') >= 0.9);
  assert.equal(s('18:55 ADA DERANA', 'Ada Derana 6.55'), 1);
  assert.equal(s('WEEKDAY MOVIE', 'Weekday Movies'), 1);
  assert.ok(s('DERANA DREAM STAR', 'Dream Star') >= 0.85);
  assert.ok(s('SANGEETHE', 'Prarthana') < 0.3);
  assert.ok(normalizeName('Skole Rpt').repeat);
  assert.ok(isGenericItem(normalizeName('BILLBOARDS'), SETTINGS.generic_item_words));
  assert.ok(isGenericItem(normalizeName('L CRAWLER'), SETTINGS.generic_item_words));
  assert.ok(!isGenericItem(normalizeName('NIKINI KUSUM'), SETTINGS.generic_item_words));
});

test('sample schedule: every priced line matches the right program', async () => {
  const parsed = await parseWorkbook(fs.readFileSync(path.join(__dirname, 'fixtures/sample_schedule.xlsx')), { sectionLabels: SETTINGS.section_labels });
  assert.equal(parsed.lines.length, 50);
  assert.equal(parsed.extras.length, 25);
  const expected = {
    BILLBOARDS: { '22:00': 'Ada Derana 10.00pm', '13:00': 'Weekday Movies' },
    'SONG CARD - MTUNE': 'Dream Star', 'L CRAWLER': 'Dream Star', 'DERANA DREAM STAR': 'Dream Star',
    'DHEVANI INIMA': 'Deveni Inima', SANGEETHE: 'Sangeethe', '18:55 ADA DERANA': 'Ada Derana 6.55',
    '22:00 ADA DERANA': 'Ada Derana 10.00pm', 'NIKINI KUSUM': 'Nikini Kusum', 'DERANA ARUNA': 'Derana Aruna',
    'LOKAYA SAHA LOKAYO': 'Lokaya Saha Lokayo', 'WEEKEND MOVIE': 'Weekend Movies', 'WEEKDAY MOVIE': 'Weekday Movies',
  };
  const matched = matchAll(parsed.lines, programs, [], SETTINGS);
  for (const l of matched) {
    let want = expected[l.program];
    if (want && typeof want === 'object') want = want[l.start === 1320 ? '22:00' : '13:00'];
    if (!want) continue;
    assert.equal(byName(want).id, l.match.program_id, `row ${l.row} ${l.program} → ${want}`);
    assert.equal(l.match.status, 'matched', `row ${l.row} status`);
  }
});

test('matcher: unknown name falls back to the day & time belt', () => {
  const [m] = matchAll([{ program: 'MYSTERY SHOW XYZ', theme: '', day: 'MON TO FRI', start: 1200, end: 1230, dur: 30, spots: 1 }], programs, [], SETTINGS);
  assert.equal(m.match.program_id, byName('Sangeethe').id);
  assert.equal(m.match.status, 'belt');
  const [day] = matchAll([{ program: 'SOME MAGAZINE', theme: '', day: 'MON TO FRI', start: 14 * 60, end: 14 * 60 + 30, dur: 30, spots: 1 }], programs, [], SETTINGS);
  assert.equal(day.match.status, 'belt');
  assert.ok(['Weekday Movies', 'Day Time Belt (Weekdays)'].includes(programs.find((p) => p.id === day.match.program_id).name));
});

test('matcher: learned alias makes an unrecognisable name an exact match', () => {
  const withAlias = programs.map((p) => (p.name === 'Prarthana' ? { ...p, aliases: ['PRAYER DRAMA'] } : p));
  const [m] = matchAll([{ program: 'PRAYER DRAMA', theme: '', day: 'MON TO FRI', start: 1290, end: 1320, dur: 30, spots: 1 }], withAlias,
    [{ program_id: byName('Prarthana').id, alias_norm: normalizeName('PRAYER DRAMA').key }], SETTINGS);
  assert.equal(m.match.program_id, byName('Prarthana').id);
  assert.equal(m.match.status, 'matched');
});

test('pricing: pro-rata units, single discount, package split', () => {
  const sangeethe = byName('Sangeethe').id; // 1,166,000 per 30s
  const lines = [
    { row: 1, theme: 'A', program: 'SANGEETHE', dur: 15, spots: 5, program_id: sangeethe },
    { row: 2, theme: 'A', program: 'SANGEETHE', dur: 20, spots: 2, program_id: sangeethe },
    { row: 3, theme: 'A', program: 'SANGEETHE', dur: 30, spots: 3, program_id: sangeethe },
    { row: 4, theme: 'A', program: 'BILLBOARD', dur: 3, spots: 10, program_id: sangeethe },
  ];
  const base = calculate(lines, ctxFor({ pricing_type: 'base' }));
  // 2.5 + 1.3333 + 3 + 1 = 7.8333 units, no rounding before pricing
  assert.equal(base.totals.gross, Math.round((2.5 + 4 / 3 + 3 + 1) * 1166000 * 100) / 100);
  assert.equal(base.totals.gross, base.totals.net);

  const disc = calculate(lines, ctxFor({ pricing_type: 'discount', discount_pct: 30 }));
  assert.equal(disc.totals.gross, base.totals.gross);
  assert.equal(disc.totals.net, Math.round(base.totals.gross * 0.7 * 100) / 100); // discount applied once
  assert.equal(disc.totals.client_discount_pct, 30);

  const pkg = calculate(lines, ctxFor({ pricing_type: 'discount', discount_pct: 30 }), 5000000);
  assert.equal(pkg.totals.final, 5000000);
  const sumFinal = pkg.lines.reduce((s, l) => s + l.final, 0);
  assert.ok(Math.abs(sumFinal - 5000000) < 0.05);
  assert.ok(Math.abs(pkg.lines.reduce((s, l) => s + l.share, 0) - 1) < 1e-4);
});

test('pricing: custom card fixed / discount / default, and crawler special rate', () => {
  const dream = byName('Dream Star');
  const skole = byName('Skole');
  const derana = byName('Derana Aruna');
  const card = { name: 'Test card', default_discount_pct: 10, items: {
    [dream.slot_id]: { mode: 'fixed', value: 400000 },
    [skole.slot_id]: { mode: 'discount', value: 25 },
  } };
  const lines = [
    { row: 1, program: 'DREAM STAR', dur: 30, spots: 1, program_id: dream.id },
    { row: 2, program: 'SKOLE', dur: 30, spots: 1, program_id: skole.id },
    { row: 3, program: 'DERANA ARUNA', dur: 30, spots: 1, program_id: derana.id },
    { row: 4, program: 'L CRAWLER', dur: 10, spots: 3, program_id: dream.id },
    { row: 5, program: 'UNKNOWN', dur: 30, spots: 1, program_id: null },
  ];
  const r = calculate(lines, ctxFor({ pricing_type: 'rate_card' }, card));
  const rate = (row) => r.lines.find((l) => l.row === row).client_rate;
  assert.equal(rate(1), 400000);
  assert.equal(rate(2), 900000);           // 1,200,000 − 25%
  assert.equal(rate(3), 298800);           // 332,000 − 10% default
  assert.equal(rate(4), 15000);            // crawler, prime time
  assert.equal(r.lines.find((l) => l.row === 4).net, 15000);  // 10s × 3 = 1 unit
  assert.equal(r.totals.unpriced, 1);
});
