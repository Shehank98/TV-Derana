// Pricing: turns matched schedule lines into a quotation.
//
//   units (30-sec equivalents) = duration × spots / 30      (pro-rata, any duration)
//   gross  = units × base rate        → "rate card value"
//   net    = units × client rate      → value after the client's deal
//   final  = package price split by each line's share of net (if a package is set)
//
// Client rate per rate-card slot:
//   pricing 'base'       → base rate
//   pricing 'discount'   → base × (1 − discount%)
//   pricing 'rate_card'  → card item for the slot: fixed rate, or base × (1 − item%);
//                          slots without an item → base × (1 − card default%)
// Special items (e.g. CRAWLER) use their own PT/NPT rate instead of the slot rate;
// the client discount applies to them only if the rule says so.
// Nothing is rounded until the end, so totals equal the sum of exact line values.

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function clientRate(slot, client, card) {
  const base = Number(slot.rate_30s);
  if (!client || client.pricing_type === 'base') return { rate: base, basis: 'Base rate card' };
  if (client.pricing_type === 'discount') {
    const d = Number(client.discount_pct) || 0;
    return { rate: base * (1 - d / 100), basis: `Base −${d}%` };
  }
  if (client.pricing_type === 'rate_card' && card) {
    const item = card.items && card.items[slot.id];
    if (item && item.mode === 'fixed') return { rate: Number(item.value), basis: `${card.name}: fixed` };
    if (item && item.mode === 'discount') return { rate: base * (1 - item.value / 100), basis: `${card.name}: −${Number(item.value)}%` };
    const d = Number(card.default_discount_pct) || 0;
    return { rate: base * (1 - d / 100), basis: d ? `${card.name}: −${d}% (default)` : `${card.name}: base` };
  }
  return { rate: base, basis: 'Base rate card' };
}

// Discount % the client gets "in general" (used for special items that allow it).
function clientGeneralDiscount(client, card) {
  if (!client) return 0;
  if (client.pricing_type === 'discount') return Number(client.discount_pct) || 0;
  if (client.pricing_type === 'rate_card' && card) return Number(card.default_discount_pct) || 0;
  return 0;
}

function findSpecialRule(text, rules) {
  const up = String(text || '').toUpperCase();
  return (rules || []).find((r) => r.active !== false && r.keyword &&
    new RegExp(`\\b${String(r.keyword).toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(up));
}

/**
 * @param lines    [{ row, theme, program, day, start, end, dur, spots, program_id }]
 * @param ctx      { programs: Map id→program(with slot_id), slots: Map id→slot(with category_name),
 *                   client, card: {name, default_discount_pct, items: {slotId: {mode,value}}},
 *                   rules, settings }
 * @param packagePrice  optional negotiated total
 */
function calculate(lines, ctx, packagePrice) {
  const { programs, slots, client, card, rules = [], settings = {} } = ctx;
  const out = [];
  const unpriced = [];

  for (const l of lines) {
    const units = (Number(l.dur) * Number(l.spots)) / 30;
    const prog = l.program_id ? programs.get(Number(l.program_id)) : null;
    const slot = prog ? slots.get(prog.slot_id) : null;
    if (!prog || !slot) {
      unpriced.push({ ...l, units, reason: prog ? 'Program has no rate slot' : 'Not matched to a program' });
      continue;
    }
    const rule = findSpecialRule(l.program, rules);
    let base;
    let rate;
    let basis;
    if (rule) {
      base = Number(prog.is_prime ? rule.rate_pt : rule.rate_npt);
      const d = rule.apply_client_discount ? clientGeneralDiscount(client, card) : 0;
      rate = base * (1 - d / 100);
      basis = `${rule.label} (${prog.is_prime ? 'PT' : 'NPT'})${d ? ` −${d}%` : ''}`;
    } else {
      base = Number(slot.rate_30s);
      ({ rate, basis } = clientRate(slot, client, card));
    }
    out.push({
      ...l,
      units,
      program_name: prog.name,
      slot_id: slot.id,
      slot_name: slot.name,
      category: slot.category_name,
      is_prime: !!prog.is_prime,
      special: rule ? rule.label : null,
      base_rate: base,
      client_rate: rate,
      rate_basis: basis,
      gross: units * base,
      net: units * rate,
    });
  }

  const sum = (arr, k) => arr.reduce((s, x) => s + x[k], 0);
  const gross = sum(out, 'gross');
  const net = sum(out, 'net');
  const pkg = packagePrice !== null && packagePrice !== undefined && packagePrice !== '' && Number(packagePrice) > 0
    ? Number(packagePrice) : null;
  const final = pkg ?? net;
  for (const l of out) {
    l.final = net > 0 ? final * (l.net / net) : 0;
    l.share = final > 0 ? l.final / final : 0;
  }

  const taxPct = Number(settings.tax_pct) || 0;
  const durations = [...new Set(out.map((l) => Number(l.dur)))].sort((a, b) => a - b);

  // Program summary (pivot by duration), keyed by program (= one time slot).
  const byProgram = new Map();
  for (const l of out) {
    const key = `${l.program_id}|${l.special || ''}`;
    if (!byProgram.has(key)) {
      byProgram.set(key, {
        program_id: l.program_id, program_name: l.program_name + (l.special ? ` — ${l.special}` : ''),
        category: l.category, slot_name: l.slot_name, is_prime: l.is_prime,
        base_rate: l.base_rate, client_rate: l.client_rate, rate_basis: l.rate_basis,
        durations: {}, spots: 0, units: 0, gross: 0, net: 0, final: 0,
      });
    }
    const g = byProgram.get(key);
    g.durations[l.dur] = (g.durations[l.dur] || 0) + Number(l.spots);
    g.spots += Number(l.spots); g.units += l.units; g.gross += l.gross; g.net += l.net; g.final += l.final;
  }

  const groupBy = (key) => {
    const m = new Map();
    for (const l of out) {
      const k = l[key] || '—';
      if (!m.has(k)) m.set(k, { name: k, spots: 0, units: 0, gross: 0, net: 0, final: 0 });
      const g = m.get(k);
      g.spots += Number(l.spots); g.units += l.units; g.gross += l.gross; g.net += l.net; g.final += l.final;
    }
    return [...m.values()];
  };
  const prime = { PT: { spots: 0, units: 0, final: 0 }, NPT: { spots: 0, units: 0, final: 0 } };
  for (const l of out) {
    const p = prime[l.is_prime ? 'PT' : 'NPT'];
    p.spots += Number(l.spots); p.units += l.units; p.final += l.final;
  }

  const roundRow = (o) => {
    const c = { ...o };
    for (const k of ['units']) if (k in c) c[k] = Math.round(c[k] * 1000) / 1000;
    for (const k of ['base_rate', 'client_rate', 'gross', 'net', 'final']) if (k in c) c[k] = r2(c[k]);
    if ('share' in c) c.share = Math.round(c.share * 1e6) / 1e6;
    return c;
  };

  return {
    lines: out.map(roundRow),
    unpriced,
    durations,
    byProgram: [...byProgram.values()].map(roundRow).sort((a, b) => b.final - a.final),
    byCategory: groupBy('category').map(roundRow),
    byTheme: groupBy('theme').map(roundRow),
    prime: { PT: roundRow(prime.PT), NPT: roundRow(prime.NPT) },
    totals: {
      lines: out.length,
      spots: sum(out, 'spots'),
      seconds: out.reduce((s, l) => s + Number(l.dur) * Number(l.spots), 0),
      units: Math.round(sum(out, 'units') * 1000) / 1000,
      gross: r2(gross),
      net: r2(net),
      client_discount_pct: gross > 0 ? r2((1 - net / gross) * 100) : 0,
      package_price: pkg,
      final: r2(final),
      total_discount_pct: gross > 0 ? r2((1 - final / gross) * 100) : 0,
      extra_discount_pct: pkg && net > 0 ? r2((1 - pkg / net) * 100) : 0,
      tax_pct: taxPct,
      tax: r2(final * taxPct / 100),
      grand_total: r2(final * (1 + taxPct / 100)),
      unpriced: unpriced.length,
    },
  };
}

module.exports = { calculate, clientRate, findSpecialRule };
