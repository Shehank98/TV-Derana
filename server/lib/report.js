// Shared report content for the Excel and PDF exports, built from a saved
// schedule row (the result snapshot is what the client was shown).

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthLabel(key) {
  const [y, m] = String(key || '').split('-').map(Number);
  return y && m ? `${MONTHS[m - 1]} ${y}` : '';
}

function fmtDate(d) {
  const x = new Date(d || Date.now());
  return `${String(x.getDate()).padStart(2, '0')} ${MONTHS[x.getMonth()].slice(0, 3)} ${x.getFullYear()}`;
}

function hhmm(min) {
  if (min === null || min === undefined || min === '') return '';
  const t = ((Number(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function model(s) {
  const r = s.result;
  const t = r.totals;
  const deal = r.deal || {};
  const pct = (a, b) => (b ? a / b : 0);
  const categories = r.byCategory.map((c) => c.name); // biggest value first
  return {
    title: 'Schedule Analysis Report',
    info: [
      ['Agency', s.agency_name],
      ['Client', s.client_name],
      ['Campaign month', monthLabel(s.month_key || s.month)],
      ['Schedule No', s.schedule_no],
      ['Rate card', s.rate_card_name || deal.rate_card_name || 'Base rate card'],
      ['Agreed discount', `${Number(deal.agreed_discount || 0)}%`],
      ['Source file', s.file_name || '-'],
      ['Prepared on', fmtDate(s.updated_at)],
    ],
    t,
    selected: t.selected_option,
    option1: t.option1,
    option2: t.option2,
    durations: r.durations,
    split: ['PT', 'NPT'].map((k) => ({
      key: k, label: k === 'PT' ? 'Prime Time (PT)' : 'Non Prime Time (NPT)', ...r.split[k],
      spot_share: pct(r.split[k].spots, t.spots), value_share: pct(r.split[k].discounted, t.package),
    })),
    categories: r.byCategory.map((c) => ({ ...c, share: pct(c.discounted, t.package) })),
    programGroups: categories.map((cat) => {
      const programs = r.byProgram.filter((p) => p.category === cat).map((p) => ({ ...p, share: pct(p.discounted, t.package) }));
      const sub = programs.reduce((a, p) => ({
        spots: a.spots + p.spots, units: a.units + p.units, value: a.value + p.value, discounted: a.discounted + p.discounted,
      }), { spots: 0, units: 0, value: 0, discounted: 0 });
      return { category: cat, programs, sub: { ...sub, share: pct(sub.discounted, t.package) } };
    }),
    lines: r.lines,
    excluded: [...(r.excluded || []), ...(s.extras || [])],
  };
}

module.exports = { model, monthLabel, fmtDate, hhmm };
