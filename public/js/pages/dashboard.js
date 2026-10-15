// Home dashboard: totals for a month (or all time), 12-month trend, PT/NPT mix,
// top clients and agencies, recent schedules.
import { api, esc, money, money0, num, pct, date, setHeader, icon, monthLabel, store } from '../ui.js';
import { attachTips, hbars, columns, ptStack, short } from '../charts.js';

let el;
let agencies = [];
const F = store.get('tvd_dash', { month: '', agency_id: '' });

export async function render(root) {
  el = root;
  setHeader('Dashboard', 'Schedules, rate card value and packages at a glance', `<a class="btn btn-primary" href="#/new">${icon.plus} New schedule</a>`);
  agencies = await api('/agencies');
  await load();
}

async function load() {
  const qs = new URLSearchParams(Object.entries(F).filter(([, v]) => v)).toString();
  const d = await api(`/dashboard${qs ? `?${qs}` : ''}`);
  const k = d.kpi;
  const period = F.month ? monthLabel(F.month) : 'All months';
  const avgDisc = k.trv ? (1 - k.package / k.trv) * 100 : 0;

  el.innerHTML = `
  <div class="toolbar">
    <label class="field">Month<input type="month" id="m" value="${esc(F.month)}"></label>
    <label class="field">Agency<select id="a"><option value="">All agencies</option>${agencies.map((a) => `<option value="${a.id}" ${String(a.id) === String(F.agency_id) ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
    <button class="btn btn-ghost" id="all" ${F.month || F.agency_id ? '' : 'disabled'}>Show everything</button>
  </div>
  ${!k.schedules ? `
  <div class="card empty-hero">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4"/></svg>
    <h2>No schedules for ${esc(period)}${F.agency_id ? ' and this agency' : ''}</h2>
    <p class="muted">Upload an agency schedule and the programs are matched and priced automatically.</p>
    <a class="btn btn-primary" href="#/new">${icon.plus} New schedule</a>
  </div>` : `
  <div class="kpis">
    <div class="card kpi"><div class="label">Schedules · ${esc(period)}</div><div class="value">${num(k.schedules, 0)}</div><div class="hint">${num(k.clients, 0)} client${k.clients === 1 ? '' : 's'}</div></div>
    <div class="card kpi"><div class="label">Total rate card value</div><div class="value">${short(k.trv)}</div><div class="hint">LKR ${money0(k.trv)}</div></div>
    <div class="card kpi accent"><div class="label">Total package value</div><div class="value">${short(k.package)}</div><div class="hint">LKR ${money0(k.package)}</div></div>
    <div class="card kpi"><div class="label">Average discount</div><div class="value">${pct(avgDisc, 1)}</div><div class="hint">package vs rate card</div></div>
    <div class="card kpi"><div class="label">Spots</div><div class="value">${num(k.spots, 0)}</div><div class="hint">${num(k.units, 0)} × 30-sec</div></div>
  </div>

  <div class="grid-2" style="margin-top:16px">
    <div class="card card-pad">
      <div class="chart-title"><h2>Package value by month</h2><span class="small muted">last 12 months · LKR</span></div>
      ${columns(d.trend.map((x) => ({ label: monthLabel(x.month), short: monthLabel(x.month, true).split(' ')[0], value: Number(x.package),
    tip: `${monthLabel(x.month)}|Package ${money0(x.package)}|Rate card ${money0(x.trv)}|${x.schedules} schedule${x.schedules === 1 ? '' : 's'}` })), money0, short)}
    </div>
    <div class="card card-pad">
      <div class="chart-title"><h2>Prime time vs non prime time</h2><span class="small muted">${esc(period)}</span></div>
      <div class="small muted" style="margin-bottom:6px">Package value</div>
      ${ptStack(Number(k.pt_value), Number(k.npt_value), money0)}
      <div class="small muted" style="margin:18px 0 6px">Spots</div>
      ${ptStack(Number(k.pt_spots), Number(k.npt_spots), (n) => num(n, 0), ' spots')}
    </div>
  </div>

  <div class="grid-2" style="margin-top:16px">
    <div class="card card-pad">
      <div class="chart-title"><h2>Top clients</h2><span class="small muted">package value</span></div>
      ${hbars(d.byClient.map((c) => ({ label: c.name, value: Number(c.package), tip: `${c.name} (${c.agency})|Package ${money0(c.package)}|Rate card ${money0(c.trv)}|${c.schedules} schedule${c.schedules === 1 ? '' : 's'}` })), short)}
    </div>
    <div class="card card-pad">
      <div class="chart-title"><h2>By agency</h2><span class="small muted">package value</span></div>
      ${hbars(d.byAgency.map((a) => ({ label: a.name, value: Number(a.package), tip: `${a.name}|Package ${money0(a.package)}|Rate card ${money0(a.trv)}|${a.schedules} schedule${a.schedules === 1 ? '' : 's'}` })), short)}
    </div>
  </div>

  <div class="card" style="margin-top:16px">
    <div class="card-head"><h2>Recent schedules</h2><a href="#/schedules" class="small">View all →</a></div>
    <div class="table-wrap"><table class="t"><thead><tr><th>Schedule No</th><th>Month</th><th>Client</th><th>Agency</th><th class="num">Spots</th><th class="num">Rate card value</th><th class="num">Package</th><th class="num">Discount</th><th>Saved</th></tr></thead><tbody>
      ${d.recent.map((x) => `<tr class="link-row" onclick="location.hash='#/schedule/${x.id}'"><td><b>${esc(x.schedule_no)}</b></td><td class="nowrap">${monthLabel(x.month)}</td>
        <td>${esc(x.client_name)}</td><td>${esc(x.agency_name)}</td><td class="num">${num(x.spots, 0)}</td><td class="num">${money(x.trv)}</td>
        <td class="num"><b>${money(x.package)}</b></td><td class="num">${pct(x.discount_pct)}</td><td class="small nowrap">${date(x.updated_at)}</td></tr>`).join('')}
    </tbody></table></div>
  </div>`}`;

  attachTips(el);
  const set = (key, v) => { F[key] = v; store.set('tvd_dash', F); load(); };
  el.querySelector('#m').onchange = (e) => set('month', e.target.value);
  el.querySelector('#a').onchange = (e) => set('agency_id', e.target.value);
  el.querySelector('#all').onclick = () => { F.month = ''; F.agency_id = ''; store.set('tvd_dash', F); load(); };
}
