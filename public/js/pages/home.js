// Home overview: period + agency filters, start-a-schedule banner, KPIs,
// package value by month, top clients, PT share, recent schedules.
import { api, esc, money0, num, pct, setHeader, icon, monthLabel, thisMonth, store } from '../ui.js';
import { attachTips, short } from '../charts.js';

let el;
let agencies = [];
const F = store.get('tvd_home', { period: 'month', agency_id: '' });

export async function render(root) {
  el = root;
  agencies = await api('/agencies');
  await load();
}

function since12() {
  const d = new Date();
  d.setMonth(d.getMonth() - 11);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function load() {
  const qs = new URLSearchParams();
  if (F.period === 'month') qs.set('month', thisMonth());
  if (F.period === '12m') qs.set('since', since12());
  if (F.agency_id) qs.set('agency_id', F.agency_id);
  const d = await api(`/dashboard?${qs}`);
  const k = d.kpi;
  const label = F.period === 'month' ? monthLabel(thisMonth()) : F.period === '12m' ? 'last 12 months' : 'all time';
  setHeader('Overview', `Schedules, rate card value and packages · ${label}`, `
    <div class="segmented" role="group" aria-label="Period">
      ${[['month', 'This month'], ['12m', 'Last 12 months'], ['all', 'All time']].map(([v, t]) => `<button data-p="${v}" class="${F.period === v ? 'on' : ''}">${t}</button>`).join('')}
    </div>
    <label><span class="sr">Agency</span><select id="ag" style="width:auto;min-width:180px">
      <option value="">All agencies</option>${agencies.map((a) => `<option value="${a.id}" ${String(a.id) === String(F.agency_id) ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>`);

  const avgDisc = k.trv ? (1 - k.package / k.trv) * 100 : 0;
  const ptShare = Number(k.pt_value) + Number(k.npt_value) > 0 ? (Number(k.pt_value) / (Number(k.pt_value) + Number(k.npt_value))) * 100 : 0;
  const maxM = Math.max(...d.trend.map((x) => Number(x.package)), 0);
  const maxC = Math.max(...d.byClient.map((c) => Number(c.package)), 1);

  el.innerHTML = `
  <div class="stack">
    <a class="cta-banner" href="#/new">
      <div><b>Got a new agency schedule?</b><span class="sub">Pick the agency and client, upload the Excel and the programs are matched for you.</span></div>
      <span class="pillbtn">Start a new schedule ${icon.arrow}</span>
    </a>
    ${!k.schedules ? `<div class="empty-hero"><h2>No schedules for ${esc(label)}${F.agency_id ? ' and this agency' : ''}</h2><p>Try another period, or start a new schedule.</p></div>` : `
    <div class="grid-4">
      ${[['Schedules', num(k.schedules, 0), `${num(k.clients, 0)} client${k.clients === 1 ? '' : 's'}`], ['Rate card value', short(k.trv), `LKR ${money0(k.trv)}`],
    ['Package value', short(k.package), `LKR ${money0(k.package)}`, 'accent'], ['Average discount', pct(avgDisc, 1), 'package vs rate card']]
    .map(([l, v, h, cls], i) => `<div class="kpi ${cls || ''}" style="animation-delay:${i * 60}ms"><div class="label">${l}</div><div class="value">${v}</div><div class="hint">${h}</div></div>`).join('')}
    </div>
    <div class="grid-2" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)">
      <section class="card card-pad rise" style="animation-delay:.1s">
        <div class="row" style="justify-content:space-between;align-items:baseline"><h2>Package value by month</h2><span class="small muted">last 12 months · LKR</span></div>
        <div class="cols">${d.trend.map((x, i) => {
    const v = Number(x.package);
    return `<div class="c" data-tip="${esc(`${monthLabel(x.month)}|Package ${money0(v)}|Rate card ${money0(x.trv)}|${x.schedules} schedule${x.schedules === 1 ? '' : 's'}`)}">
            ${v ? `<span class="top" style="bottom:${maxM ? (v / maxM) * 100 : 0}%">${short(v)}</span>` : ''}
            <div class="b" style="height:${maxM ? (v / maxM) * 100 : 0}%;animation-delay:${i * 40}ms"></div></div>`;
  }).join('')}</div>
        <div class="col-labels">${d.trend.map((x) => `<span>${monthLabel(x.month, true).split(' ')[0]}</span>`).join('')}</div>
      </section>
      <section class="card card-pad rise" style="animation-delay:.16s;display:flex;flex-direction:column;gap:14px">
        <h2 style="margin:0">Top clients</h2>
        <div class="hbars">${d.byClient.slice(0, 6).map((c, i) => `
          <div class="hbar" data-tip="${esc(`${c.name} (${c.agency})|Package ${money0(c.package)}|${c.schedules} schedule${c.schedules === 1 ? '' : 's'}`)}">
            <span class="lbl">${esc(c.name)}</span>
            <div class="track"><div class="fill" style="width:${(Number(c.package) / maxC) * 70}%;animation-delay:${0.2 + i * 0.08}s"></div><span class="val">${short(c.package)}</span></div>
          </div>`).join('')}</div>
        <div style="margin-top:auto;padding-top:14px;border-top:1px dashed var(--line);display:flex;flex-direction:column;gap:8px">
          <span class="small" style="font-weight:700;color:var(--ink-2)">Prime time share of package value</span>
          <div class="pstack"><i style="width:${ptShare}%;background:var(--pt)" data-tip="Prime time|${money0(k.pt_value)} · ${ptShare.toFixed(1)}%"></i><i style="width:${100 - ptShare}%;background:var(--npt)" data-tip="Non prime time|${money0(k.npt_value)} · ${(100 - ptShare).toFixed(1)}%"></i></div>
          <div class="legend2" style="margin-top:0"><span style="--c:var(--pt)"><b>PT</b> ${ptShare.toFixed(1)}%</span><span style="--c:var(--npt)"><b>NPT</b> ${(100 - ptShare).toFixed(1)}%</span></div>
        </div>
      </section>
    </div>
    <section>
      <div class="row" style="justify-content:space-between;align-items:baseline;margin-bottom:6px"><h2 style="margin:0">Recent schedules</h2><a href="#/schedules" style="font-weight:800">View all</a></div>
      ${d.recent.map((s, i) => `
        <a class="srow" href="#/schedule/${s.id}" style="animation-delay:${i * 50}ms">
          <div style="min-width:0"><span class="no">${esc(s.schedule_no)}</span><span class="small muted">${monthLabel(s.month)}${s.title ? ` · ${esc(s.title)}` : ''}</span></div>
          <div><span class="k">Client</span><b>${esc(s.client_name)}</b></div>
          <div class="hide-m"><span class="k">Rate card value</span><b>${money0(s.trv)}</b></div>
          <div><span class="k">Package</span><b style="color:var(--red)">${money0(s.package)}</b></div>
          <div class="hide-m"><span class="pill-amber">${pct(s.discount_pct)} off</span></div>
          <span class="hide-m">${icon.chev}</span>
        </a>`).join('')}
    </section>`}
  </div>`;
  attachTips(el);
  document.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { F.period = b.dataset.p; store.set('tvd_home', F); load(); }));
  document.getElementById('ag').onchange = (e) => { F.agency_id = e.target.value; store.set('tvd_home', F); load(); };
}
