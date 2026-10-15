// Schedule dashboard: details, Option 01 / Option 02, PT/NPT split, categories,
// program analysis, lines — plus Excel / PDF reports.
import { api, run, esc, money, money0, num, pct, hhmm, date, setHeader, icon, confirmBox, toast, download, monthLabel, debounce } from '../ui.js';
import { attachTips, hbars, ptStack } from '../charts.js';

let el;
let s;
let tab = 'programs';

export async function render(root, params) {
  el = root;
  s = await api(`/schedules/${params.id}`);
  draw();
}

function draw() {
  const r = s.result;
  const t = r.totals;
  const deal = r.deal || {};
  setHeader(`Schedule ${s.schedule_no}`, `${s.client_name} · ${s.agency_name} · ${monthLabel(s.month)}`,
    `<a class="btn" href="#/schedule/${s.id}/edit">${icon.edit} Edit mappings</a>
     <button class="btn btn-dark" id="xlsx">${icon.download} Excel</button>
     <button class="btn btn-primary" id="pdf">${icon.download} PDF</button>`);

  el.innerHTML = `
  <div class="stack">
    <div class="card card-pad"><div class="info-strip">
      ${[['Agency', s.agency_name], ['Client', s.client_name], ['Campaign month', monthLabel(s.month)], ['Schedule No', s.schedule_no],
    ['Rate card', s.rate_card_name || 'Base rate card'], ['Agreed discount', `${num(deal.agreed_discount || 0)}%`],
    ['Source file', s.file_name || '—'], ['Last saved', date(s.updated_at)]]
    .map(([k, v]) => `<div><div class="k">${k}</div><div class="v" title="${esc(v)}">${esc(v)}</div></div>`).join('')}
    </div></div>

    <div class="kpis">
      <div class="card kpi"><div class="label">Total rate card value</div><div class="value">${money(t.trv)}</div><div class="hint">LKR · ${t.lines} lines</div></div>
      <div class="card kpi accent"><div class="label">Package value · Option 0${t.selected_option}</div><div class="value">${money(t.package)}</div><div class="hint">${pct(t.discount_pct, 1)} discount</div></div>
      <div class="card kpi"><div class="label">Total spots</div><div class="value">${num(t.spots, 0)}</div><div class="hint">${num(t.seconds, 0)} seconds</div></div>
      <div class="card kpi"><div class="label">30-sec equivalents</div><div class="value">${num(t.units, 1)}</div><div class="hint">${r.byProgram.length} programs</div></div>
    </div>

    <div>
      <div class="row" style="margin-bottom:10px"><h2 style="margin:0">Package options</h2><span class="spacer"></span><span class="saved" id="saved"></span></div>
      <div class="options">
        ${optionCard(1, 'Option 01 — Package Value to Discount', t)}
        ${optionCard(2, 'Option 02 — Discount to Package Value', t)}
      </div>
    </div>

    <div class="grid-2">
      <div class="card card-pad">
        <div class="chart-title"><h2>Prime time vs non prime time</h2><span class="small muted">package value</span></div>
        ${ptStack(r.split.PT.discounted, r.split.NPT.discounted, money0, '')}
        <table class="t" style="margin-top:14px"><thead><tr><th></th><th class="num">Spots</th><th class="num">30s eq.</th><th class="num">R/C value</th><th class="num">Package value</th></tr></thead><tbody>
          ${['PT', 'NPT'].map((k) => `<tr><td><span class="chip ${k.toLowerCase()}">${k}</span></td><td class="num">${num(r.split[k].spots, 0)} <span class="muted small">(${pct(t.spots ? (r.split[k].spots / t.spots) * 100 : 0, 0)})</span></td>
            <td class="num">${num(r.split[k].units, 1)}</td><td class="num">${money0(r.split[k].value)}</td><td class="num"><b>${money0(r.split[k].discounted)}</b></td></tr>`).join('')}
        </tbody></table>
      </div>
      <div class="card card-pad">
        <div class="chart-title"><h2>Investment by category</h2><span class="small muted">package value</span></div>
        ${hbars(r.byCategory.map((c) => ({ label: c.name, value: c.discounted, tip: `${c.name}|Package ${money0(c.discounted)}|R/C ${money0(c.value)}|${num(c.spots, 0)} spots` })), money0)}
      </div>
    </div>

    <div class="card">
      <div class="tabs">${[['programs', 'Program analysis'], ['lines', `Schedule lines (${r.lines.length})`], ['excluded', `Not counted (${(r.excluded || []).length + (s.extras || []).length})`]]
    .map(([k, n]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="table-wrap">${tabTable(r)}</div>
    </div>

    <div class="row"><span class="spacer"></span><button class="btn btn-danger" id="del">${icon.trash} Delete schedule</button></div>
  </div>`;

  attachTips(el);
  bind();
}

function optionCard(n, title, t) {
  const o = n === 1 ? t.option1 : t.option2;
  const sel = t.selected_option === n && o;
  const pkgCell = n === 1
    ? `<input class="hl" id="o1" inputmode="decimal" placeholder="Enter package value" value="${s.option1_package ?? ''}">`
    : `<span id="o2pkg">${o ? money(o.package) : '—'}</span>`;
  const discCell = n === 2
    ? `<input class="hl" id="o2" inputmode="decimal" placeholder="Enter discount %" value="${s.option2_discount ?? ''}">`
    : `<span id="o1disc">${o ? pct(o.discount_pct, 1) : '—'}</span>`;
  return `<div class="opt ${sel ? 'sel' : ''}" id="opt${n}">
    <h3>${title}</h3>
    <label class="use"><input type="radio" name="useopt" value="${n}" ${t.selected_option === n ? 'checked' : ''}> Use in report</label>
    <table>
      <tr><td>Total Rate Card Value</td><td>${money(t.trv)}</td></tr>
      <tr><td>Package Value</td><td>${pkgCell}</td></tr>
      <tr class="disc"><td>Discount %</td><td>${discCell}</td></tr>
    </table>
  </div>`;
}

function tabTable(r) {
  const t = r.totals;
  if (tab === 'programs') {
    const durs = r.durations;
    const cats = r.byCategory.map((c) => c.name);
    const span = durs.length + 8;
    const body = cats.map((cat) => {
      const ps = r.byProgram.filter((p) => p.category === cat);
      return `<tr class="group"><td colspan="${span}">${esc(cat)}</td></tr>${ps.map((p) => `<tr>
        <td><b>${esc(p.program_name)}</b><div class="small muted">${esc(p.rate_basis)}</div></td>
        <td>${p.is_prime ? '<span class="chip pt">PT</span>' : '<span class="chip npt">NPT</span>'}</td>
        ${durs.map((d) => `<td class="num">${p.durations[d] || ''}</td>`).join('')}
        <td class="num">${num(p.units, 1)}</td><td class="num">${money0(p.rc_rate)}</td><td class="num">${money(p.value)}</td>
        <td class="num"><b>${money(p.discounted)}</b></td><td class="num">${pct(t.package ? (p.discounted / t.package) * 100 : 0)}</td></tr>`).join('')}`;
    }).join('');
    const durTot = durs.map((d) => r.lines.filter((l) => Number(l.dur) === d).reduce((a, l) => a + Number(l.spots), 0));
    return `<table class="t"><thead><tr><th>Program</th><th></th>${durs.map((d) => `<th class="num">${d}s</th>`).join('')}
      <th class="num">Total 30s</th><th class="num">R/C rate</th><th class="num">Value Rs</th><th class="num">Discounted Rs</th><th class="num">% Investment</th></tr></thead>
      <tbody>${body}<tr class="total"><td>Grand total</td><td></td>${durTot.map((n) => `<td class="num">${n}</td>`).join('')}<td class="num">${num(t.units, 1)}</td><td></td>
      <td class="num">${money(t.trv)}</td><td class="num">${money(t.package)}</td><td class="num">100%</td></tr></tbody></table>`;
  }
  if (tab === 'lines') {
    return `<table class="t"><thead><tr><th>Row</th><th>Section</th><th>Agency line</th><th>TV Derana program</th><th class="num">Dur</th><th class="num">Spots</th><th class="num">30s eq.</th><th class="num">R/C rate</th><th class="num">Value</th><th class="num">Discounted</th></tr></thead><tbody>
      ${r.lines.map((l) => `<tr><td>${l.row}</td><td class="small">${esc(l.theme)}</td><td>${esc(l.program)}<div class="small muted">${esc(l.day)} ${hhmm(l.start)}–${hhmm(l.end)}</div></td>
        <td>${esc(l.program_name)} ${l.is_prime ? '<span class="chip pt">PT</span>' : '<span class="chip npt">NPT</span>'}</td><td class="num">${l.dur}s</td><td class="num">${l.spots}</td>
        <td class="num">${num(l.units, 2)}</td><td class="num">${money0(l.rc_rate)}</td><td class="num">${money(l.value)}</td><td class="num"><b>${money(l.discounted)}</b></td></tr>`).join('')}
    </tbody></table>`;
  }
  const rows = [...(r.excluded || []), ...(s.extras || [])];
  if (!rows.length) return '<div class="empty">Every line is counted.</div>';
  return `<table class="t"><thead><tr><th>Row</th><th>Section</th><th>Line</th><th>Day / time</th><th class="num">Dur</th><th class="num">Spots</th><th>Reason</th></tr></thead><tbody>
    ${rows.map((e) => `<tr><td>${e.row}</td><td>${esc(e.theme)}</td><td>${esc(e.program)}</td><td class="small">${esc(e.day)} ${hhmm(e.start)}–${hhmm(e.end)}</td>
      <td class="num">${e.dur ?? ''}</td><td class="num">${e.spots ?? ''}</td><td class="muted">${esc(e.reason)}</td></tr>`).join('')}</tbody></table>`;
}

function bind() {
  el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; draw(); }));
  document.getElementById('xlsx').onclick = (e) => run(async () => download(await api(`/schedules/${s.id}/report.xlsx`)), e.currentTarget);
  document.getElementById('pdf').onclick = (e) => run(async () => download(await api(`/schedules/${s.id}/report.pdf`)), e.currentTarget);
  el.querySelector('#del').onclick = async () => {
    if (!(await confirmBox('Delete schedule', `Delete schedule <b>${esc(s.schedule_no)}</b> for ${esc(s.client_name)}? This cannot be undone.`))) return;
    await run(() => api(`/schedules/${s.id}`, { method: 'DELETE' }));
    toast('Schedule deleted');
    location.hash = '#/schedules';
  };

  const parse = (v) => { const n = Number(String(v).replace(/[^0-9.]/g, '')); return String(v).trim() && Number.isFinite(n) ? n : null; };
  const save = debounce(async (focusId) => {
    const res = await run(() => api(`/schedules/${s.id}/options`, { method: 'PATCH',
      body: { option1_package: s.option1_package, option2_discount: s.option2_discount, selected_option: s.selected_option } }));
    if (!res) return;
    s.result = res;
    s.updated_at = new Date().toISOString();
    const pos = focusId ? document.getElementById(focusId)?.selectionStart : null;
    const y = window.scrollY;
    const typing = focusId && document.activeElement?.id === focusId;
    draw();
    window.scrollTo(0, y);
    if (typing) { const f = document.getElementById(focusId); f.focus({ preventScroll: true }); if (pos !== null) f.setSelectionRange(pos, pos); }
    const sv = document.getElementById('saved');
    if (sv) sv.textContent = '✓ Saved';
  }, 500);

  el.querySelector('#o1').addEventListener('input', (e) => {
    s.option1_package = parse(e.target.value);
    const trv = s.result.totals.trv;
    el.querySelector('#o1disc').textContent = s.option1_package !== null && trv ? pct((1 - s.option1_package / trv) * 100, 1) : '—';
    if (s.option1_package !== null) s.selected_option = 1;
    save('o1');
  });
  el.querySelector('#o2').addEventListener('input', (e) => {
    const d = parse(e.target.value);
    s.option2_discount = d !== null && d <= 100 ? d : null;
    el.querySelector('#o2pkg').textContent = s.option2_discount !== null ? money(s.result.totals.trv * (1 - s.option2_discount / 100)) : '—';
    if (s.option2_discount !== null) s.selected_option = 2;
    save('o2');
  });
  el.querySelectorAll('[name=useopt]').forEach((r) => r.addEventListener('change', () => { s.selected_option = Number(r.value); save(); }));
}
