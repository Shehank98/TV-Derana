// Schedule pricing with the two package options the sales team uses.
//
//   units (30-sec equivalents) = duration × spots / 30         (pro-rata, any duration)
//   R/C rate   = the client's rate card rate for the program's slot
//                (custom card: fixed rate | base × (1 − item%) | base × (1 − card default%);
//                 no card: the base rate; special items such as CRAWLER: the rule's PT/NPT rate)
//   value      = units × R/C rate             → Σ = TOTAL RATE CARD VALUE (TRV)
//
//   Option 01 (package → discount):  discount% = (1 − package / TRV) × 100
//   Option 02 (discount → package):  package   = TRV × (1 − discount% / 100)
//
//   The selected option gives the final package. Each line's
//   discounted value = value × package / TRV, and its share = discounted / package.
// Nothing is rounded until the result is returned.

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;
const pos = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0;

function cardRate(slot, card) {
  const base = Number(slot.rate_30s);
  if (!card) return { rate: base, basis: 'Base rate card' };
  const item = card.items && card.items[slot.id];
  if (item && item.mode === 'fixed') return { rate: Number(item.value), basis: `${card.name} (fixed)` };
  if (item && item.mode === 'discount') return { rate: base * (1 - item.value / 100), basis: `${card.name} (−${Number(item.value)}%)` };
  const d = Number(card.default_discount_pct) || 0;
  return { rate: base * (1 - d / 100), basis: d ? `${card.name} (−${d}%)` : card.name };
}

function findSpecialRule(text, rules) {
  const up = String(text || '').toUpperCase();
  return (rules || []).find((r) => r.active !== false && r.keyword &&
    new RegExp(`\\b${String(r.keyword).toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(up));
}

// Works out both options from the total rate card value.
function options(trv, { option1_package: pkg1, option2_discount: d2, selected_option: sel = 2 } = {}) {
  const o1 = pos(pkg1) && trv > 0
    ? { package: Number(pkg1), discount_pct: (1 - Number(pkg1) / trv) * 100 } : null;
  const o2 = pos(d2) && Number(d2) <= 100
    ? { discount_pct: Number(d2), package: trv * (1 - Number(d2) / 100) } : null;
  let selected = Number(sel) === 1 ? 1 : 2;
  if (selected === 1 && !o1 && o2) selected = 2;
  if (selected === 2 && !o2 && o1) selected = 1;
  const chosen = selected === 1 ? o1 : o2;
  return { option1: o1, option2: o2, selected, package: chosen ? chosen.package : trv, discount_pct: chosen ? chosen.discount_pct : 0 };
}

/**
 * @param lines  [{ row, theme, program, day, start, end, dur, spots, program_id, status }]
 * @param ctx    { programs: Map, slots: Map, card, rules }
 * @param opts   { option1_package, option2_discount, selected_option }
 */
function calculate(lines, ctx, opts = {}) {
  const { programs, slots, card = null, rules = [] } = ctx;
  const out = [];
  const excluded = [];

  for (const l of lines) {
    const units = (Number(l.dur) * Number(l.spots)) / 30;
    const prog = l.program_id ? programs.get(Number(l.program_id)) : null;
    const slot = prog ? slots.get(prog.slot_id) : null;
    if (l.status === 'excluded' || !prog || !slot) {
      excluded.push({ ...l, units: r3(units), reason: l.status === 'excluded' ? 'Removed by user' : 'Not matched to a program' });
      continue;
    }
    const rule = findSpecialRule(l.program, rules);
    const base = rule ? Number(prog.is_prime ? rule.rate_pt : rule.rate_npt) : Number(slot.rate_30s);
    const { rate, basis } = rule
      ? { rate: base, basis: `${rule.label} ${prog.is_prime ? 'PT' : 'NPT'} rate` }
      : cardRate(slot, card);
    out.push({
      ...l, units,
      program_name: prog.name, slot_id: slot.id, slot_name: slot.name, category: slot.category_name,
      is_prime: !!prog.is_prime, special: rule ? rule.label : null,
      base_rate: base, rc_rate: rate, rate_basis: basis,
      base_value: units * base, value: units * rate,
    });
  }

  const sum = (arr, k) => arr.reduce((s, x) => s + Number(x[k]), 0);
  const trv = sum(out, 'value');
  const opt = options(trv, opts);
  const factor = trv > 0 ? opt.package / trv : 0;
  for (const l of out) {
    l.discounted = l.value * factor;
    l.share = opt.package > 0 ? l.discounted / opt.package : 0;
  }

  const durations = [...new Set(out.map((l) => Number(l.dur)))].sort((a, b) => a - b);
  const acc = () => ({ lines: 0, spots: 0, seconds: 0, units: 0, value: 0, discounted: 0 });
  const add = (g, l) => {
    g.lines++; g.spots += Number(l.spots); g.seconds += Number(l.dur) * Number(l.spots);
    g.units += l.units; g.value += l.value; g.discounted += l.discounted;
  };

  // Program analysis (one row per program airing, durations pivoted).
  const byProgram = new Map();
  for (const l of out) {
    const key = `${l.program_id}|${l.special || ''}`;
    if (!byProgram.has(key)) {
      byProgram.set(key, { ...acc(), program_id: l.program_id, program_name: l.program_name + (l.special ? ` (${l.special})` : ''),
        category: l.category, slot_name: l.slot_name, is_prime: l.is_prime, rc_rate: l.rc_rate, base_rate: l.base_rate,
        rate_basis: l.rate_basis, durations: {} });
    }
    const g = byProgram.get(key);
    g.durations[l.dur] = (g.durations[l.dur] || 0) + Number(l.spots);
    add(g, l);
  }
  const group = (key) => {
    const m = new Map();
    for (const l of out) {
      const k = l[key] || '-';
      if (!m.has(k)) m.set(k, { name: k, ...acc() });
      add(m.get(k), l);
    }
    return [...m.values()];
  };
  const split = { PT: acc(), NPT: acc() };
  for (const l of out) add(split[l.is_prime ? 'PT' : 'NPT'], l);

  const totals = acc();
  out.forEach((l) => add(totals, l));

  const round = (o) => {
    const c = { ...o };
    for (const k of ['units']) if (k in c) c[k] = r3(c[k]);
    for (const k of ['base_rate', 'rc_rate', 'base_value', 'value', 'discounted']) if (k in c) c[k] = r2(c[k]);
    if ('share' in c) c.share = Math.round(c.share * 1e6) / 1e6;
    return c;
  };
  const roundOpt = (o) => (o ? { package: r2(o.package), discount_pct: Math.round(o.discount_pct * 1000) / 1000 } : null);
  const catOrder = (a, b) => b.value - a.value;

  return {
    lines: out.map(round),
    excluded,
    durations,
    byProgram: [...byProgram.values()].map(round).sort((a, b) => a.category.localeCompare(b.category) || b.value - a.value),
    byCategory: group('category').map(round).sort(catOrder),
    byTheme: group('theme').map(round).sort(catOrder),
    split: { PT: round(split.PT), NPT: round(split.NPT) },
    totals: {
      ...round(totals),
      base_value: r2(sum(out, 'base_value')),
      excluded: excluded.length,
      trv: r2(trv),
      option1: roundOpt(opt.option1),
      option2: roundOpt(opt.option2),
      selected_option: opt.selected,
      package: r2(opt.package),
      discount_pct: Math.round(opt.discount_pct * 1000) / 1000,
    },
  };
}

module.exports = { calculate, cardRate, findSpecialRule, options };
