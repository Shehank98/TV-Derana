// All schedules with month / agency / client filters.
import { api, run, esc, money, num, pct, date, setHeader, icon, confirmBox, toast, download, debounce, monthLabel, store } from '../ui.js';

let el;
let agencies = [];
let clients = [];
const F = store.get('tvd_sched_filters', { month: '', agency_id: '', client_id: '', search: '' });

export async function render(root) {
  el = root;
  setHeader('Schedules', 'Every saved schedule, filtered by month, agency or client', `<a class="btn btn-primary" href="#/new">${icon.plus} New schedule</a>`);
  [agencies, clients] = await Promise.all([api('/agencies'), api('/clients')]);
  el.innerHTML = `
    <div class="card card-pad" style="margin-bottom:16px"><div class="toolbar" style="margin:0">
      <label class="field">Month<input type="month" id="fm" value="${esc(F.month)}"></label>
      <label class="field">Agency<select id="fa"><option value="">All agencies</option>${agencies.map((a) => `<option value="${a.id}" ${String(a.id) === String(F.agency_id) ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      <label class="field">Client<select id="fc"><option value="">All clients</option>${clients.map((c) => `<option value="${c.id}" ${String(c.id) === String(F.client_id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field" style="flex:1">Search<div class="search">${icon.search}<input id="fs" placeholder="Schedule No, client, agency, file" value="${esc(F.search)}"></div></label>
      <button class="btn btn-ghost" id="clear">Clear</button>
    </div></div>
    <div class="card"><div class="table-wrap" id="list"><div class="loading"><span class="spin"></span></div></div></div>`;
  const set = (k, v) => { F[k] = v; store.set('tvd_sched_filters', F); load(); };
  el.querySelector('#fm').onchange = (e) => set('month', e.target.value);
  el.querySelector('#fa').onchange = (e) => set('agency_id', e.target.value);
  el.querySelector('#fc').onchange = (e) => set('client_id', e.target.value);
  el.querySelector('#fs').oninput = debounce((e) => set('search', e.target.value), 300);
  el.querySelector('#clear').onclick = () => { Object.assign(F, { month: '', agency_id: '', client_id: '', search: '' }); store.set('tvd_sched_filters', F); render(root); };
  await load();
}

async function load() {
  const qs = new URLSearchParams(Object.entries(F).filter(([, v]) => v)).toString();
  const rows = await api(`/schedules${qs ? `?${qs}` : ''}`);
  const list = el.querySelector('#list');
  if (!rows.length) {
    list.innerHTML = `<div class="empty">${Object.values(F).some(Boolean) ? 'No schedules match these filters.' : 'No schedules yet. <a href="#/new">Upload the first one</a>.'}</div>`;
    return;
  }
  const sum = (k) => rows.reduce((a, x) => a + Number(x[k] || 0), 0);
  list.innerHTML = `<table class="t"><thead><tr><th>Schedule No</th><th>Month</th><th>Client</th><th>Agency</th><th class="num">Spots</th><th class="num">PT / NPT</th>
    <th class="num">Rate card value</th><th class="num">Package</th><th class="num">Discount</th><th>Saved</th><th></th></tr></thead><tbody>
    ${rows.map((x) => `<tr class="link-row" data-open="${x.id}">
      <td class="nowrap"><b><a href="#/schedule/${x.id}">${esc(x.schedule_no)}</a></b></td>
      <td class="nowrap">${monthLabel(x.month)}</td>
      <td>${esc(x.client_name)}</td><td>${esc(x.agency_name)}</td>
      <td class="num">${num(x.spots, 0)}</td><td class="num small">${num(x.pt_spots, 0)} / ${num(x.npt_spots, 0)}</td>
      <td class="num">${money(x.trv)}</td><td class="num"><b>${money(x.package)}</b><div class="small muted">Option 0${x.selected_option}</div></td>
      <td class="num">${pct(x.discount_pct)}</td><td class="small nowrap">${date(x.updated_at)}</td>
      <td class="actions">
        <button class="btn btn-sm" data-x="${x.id}" title="Excel report">XLSX</button>
        <button class="btn btn-sm" data-p="${x.id}" title="PDF report">PDF</button>
        <button class="btn btn-sm btn-danger" data-del="${x.id}" data-no="${esc(x.schedule_no)}" title="Delete">${icon.trash}</button></td></tr>`).join('')}
    <tr class="total"><td colspan="4">${rows.length} schedule${rows.length > 1 ? 's' : ''}</td><td class="num">${num(sum('spots'), 0)}</td><td></td>
      <td class="num">${money(sum('trv'))}</td><td class="num">${money(sum('package'))}</td><td class="num">${pct(sum('trv') ? (1 - sum('package') / sum('trv')) * 100 : 0)}</td><td colspan="2"></td></tr>
    </tbody></table>`;
  list.querySelectorAll('[data-open]').forEach((tr) => tr.addEventListener('click', (e) => {
    if (e.target.closest('button,a')) return;
    location.hash = `#/schedule/${tr.dataset.open}`;
  }));
  list.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', () => run(async () => download(await api(`/schedules/${b.dataset.x}/report.xlsx`)), b)));
  list.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => run(async () => download(await api(`/schedules/${b.dataset.p}/report.pdf`)), b)));
  list.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmBox('Delete schedule', `Delete schedule <b>${esc(b.dataset.no)}</b>? This cannot be undone.`))) return;
    await run(() => api(`/schedules/${b.dataset.del}`, { method: 'DELETE' }));
    toast('Schedule deleted'); load();
  }));
}
