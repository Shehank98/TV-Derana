// Schedule dashboard & report: hero totals, Option 01 / Option 02 (autosave),
// PT/NPT donut, category bars, program analysis, lines, downloads.
import { api, run, esc, money, money0, num, pct, hhmm, setHeader, icon, confirmBox, toast, download, monthLabel, debounce } from '../ui.js';
import { attachTips } from '../charts.js';

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
  setHeader('', '', '', [['Schedules', '#/schedules'], [s.agency_name, null], [s.client_name, s.agency_id && s.client_id ? `#/client/${s.agency_id}/${s.client_id}` : null], [s.schedule_no]]);
  const ptShare = t.package > 0 ? (r.split.PT.discounted / t.package) * 100 : 0;
  const ptSpots = t.spots ? (r.split.PT.spots / t.spots) * 100 : 0;
  const maxCat = Math.max(...r.byCategory.map((c) => c.discounted), 1);
  const gap = 0.4;
  const donut = ptShare >= 99.9 ? 'var(--pt)' : ptShare <= 0.1 ? 'var(--npt)'
    : `conic-gradient(var(--pt) 0 ${ptShare - gap}%, #fff ${ptShare - gap}% ${ptShare}%, var(--npt) ${ptShare}% ${100 - gap}%, #fff ${100 - gap}% 100%)`;

  el.innerHTML = `
  <div class="stack">
    <section class="hero stack" style="gap:24px">
      <div class="row" style="justify-content:space-between;align-items:flex-start;gap:18px">
        <div style="display:flex;flex-direction:column;gap:8px;min-width:0">
          <span class="eyebrow">Schedule ${esc(s.schedule_no)} · ${monthLabel(s.month)}</span>
          <h1>${esc(s.title || s.client_name)}</h1>
          <span class="sub">${esc(s.client_name)} via ${esc(s.agency_name)} · ${esc(s.rate_card_name || 'Base rate card')} · Agreed discount ${num(deal.agreed_discount || 0)}%</span>
        </div>
        <div class="row" style="gap:10px">
          <a class="btn btn-outline-light" href="#/schedule/${s.id}/match">${icon.edit} Edit matches</a>
          <button class="btn" id="xlsx"><svg viewBox="0 0 24 24" fill="none" stroke="#11845B" stroke-width="2.2" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M4 20h16"/></svg>Excel report</button>
          <button class="btn btn-primary" id="pdf">${icon.download} PDF report</button>
        </div>
      </div>
      <div class="grid-4">
        <div class="kpi dark"><div class="label">Total rate card value</div><div class="value">${money(t.trv)}</div><div class="hint">LKR · ${t.lines} lines</div></div>
        <div class="kpi accent"><div class="label">Package value · Option 0${t.selected_option}</div><div class="value">${money(t.package)}</div><div class="hint">${pct(t.discount_pct, 1)} discount</div></div>
        <div class="kpi dark"><div class="label">Spots</div><div class="value">${num(t.spots, 0)}</div><div class="hint">${num(t.seconds, 0)} seconds</div></div>
        <div class="kpi dark"><div class="label">30-sec equivalents</div><div class="value">${num(t.units, 1)}</div><div class="hint">${r.byProgram.length} programs</div></div>
      </div>
    </section>

    <div>
      <div class="row" style="margin-bottom:12px"><h2 style="margin:0">Package options</h2><span class="spacer"></span><span class="saved" id="saved"></span></div>
      <div class="options">${optionCard(1, t)}${optionCard(2, t)}</div>
    </div>

    <div class="grid-2" style="grid-template-columns:minmax(0,1fr) minmax(0,1.25fr)">
      <section class="card card-pad rise" style="animation-delay:.1s">
        <h2>Prime time vs non prime time</h2>
        <div class="donut-wrap">
          <div class="donut" role="img" aria-label="Package value: prime time ${ptShare.toFixed(1)} percent, non prime time ${(100 - ptShare).toFixed(1)} percent" style="background:${donut}">
            <div class="hole"><b>${Math.round(ptShare)}%</b><span>prime time</span></div>
          </div>
          <div class="legend-list">
            <div class="it"><span class="sw" style="background:var(--pt)"></span><div><b>PT · ${money0(r.split.PT.discounted)}</b><div class="small muted">${num(r.split.PT.spots, 0)} spots (${ptSpots.toFixed(1)}%) · ${num(r.split.PT.units, 1)} × 30s</div></div></div>
            <div class="it"><span class="sw" style="background:var(--npt)"></span><div><b>NPT · ${money0(r.split.NPT.discounted)}</b><div class="small muted">${num(r.split.NPT.spots, 0)} spots (${(100 - ptSpots).toFixed(1)}%) · ${num(r.split.NPT.units, 1)} × 30s</div></div></div>
            <div class="small muted">Rate card value: PT ${money0(r.split.PT.value)} · NPT ${money0(r.split.NPT.value)}</div>
          </div>
        </div>
      </section>
      <section class="card card-pad rise" style="animation-delay:.16s">
        <div class="row" style="justify-content:space-between;align-items:baseline"><h2>Investment by category</h2><span class="small muted">package value, LKR</span></div>
        <div class="hbars">${r.byCategory.map((c, i) => `
          <div class="hbar" data-tip="${esc(`${c.name}|Package ${money0(c.discounted)}|Rate card ${money0(c.value)}|${num(c.spots, 0)} spots`)}">
            <span class="lbl">${esc(c.name)}</span>
            <div class="track"><div class="fill" style="width:${(c.discounted / maxCat) * 74}%;animation-delay:${0.3 + i * 0.1}s"></div>
              <span class="val">${(c.discounted / 1e6).toFixed(1)}M · ${pct(t.package ? (c.discounted / t.package) * 100 : 0)}</span></div>
          </div>`).join('')}</div>
      </section>
    </div>

    <section class="card rise" style="animation-delay:.22s;overflow:hidden">
      <div class="tabs">${[['programs', 'Program analysis'], ['lines', `Schedule lines (${r.lines.length})`], ['excluded', `Not counted (${(r.excluded || []).length})`]]
    .map(([k, n]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="table-wrap">${tabTable(r)}</div>
    </section>

    <div class="row"><span class="small muted">Saved ${esc(new Date(s.updated_at).toLocaleString('en-GB'))} · source file ${esc(s.file_name || '-')}</span><span class="spacer"></span>
      <button class="btn btn-danger btn-sm" id="del">${icon.trash} Delete schedule</button></div>
  </div>`;
  attachTips(el);
  bind();
}

function optionCard(n, t) {
  const o = n === 1 ? t.option1 : t.option2;
  const sel = t.selected_option === n && o;
  const title = n === 1 ? 'Option 01 · Package value to discount' : 'Option 02 · Discount to package value';
  return `<section class="opt ${sel ? 'sel' : ''}" data-opt="${n}" role="button" tabindex="0" aria-pressed="${sel ? 'true' : 'false'}" title="${sel ? 'Used in report' : 'Click to use this option in the report'}" style="animation-delay:${n * 0.06}s">
    <div class="head"><h3>${title}</h3>
      ${sel ? '<span class="badge">✓ Used in report</span>' : '<span class="use">Click card to use in report</span>'}</div>
    <div class="line"><span>Total rate card value</span><b>${money(t.trv)}</b></div>
    ${n === 1
    ? `<div class="line"><label for="o1">Package value</label><input id="o1" class="amber" inputmode="decimal" placeholder="Type package value" value="${s.option1_package ?? ''}"></div>
       <div class="disc"><span>Discount</span><span id="o1disc">${o ? pct(o.discount_pct, 1) : '-'}</span></div>`
    : `<div class="line"><span>Package value</span><b id="o2pkg">${o ? money(o.package) : '-'}</b></div>
       <div class="disc"><label for="o2">Discount %</label><input id="o2" class="amber" inputmode="decimal" placeholder="%" value="${s.option2_discount ?? ''}"></div>`}
  </section>`;
}

function tabTable(r) {
  const t = r.totals;
  if (tab === 'programs') {
    const durs = r.durations;
    const body = r.byCategory.map((c) => {
      const ps = r.byProgram.filter((p) => p.category === c.name);
      return `<tr class="group"><td colspan="${durs.length + 6}">${esc(c.name)}</td></tr>${ps.map((p) => `<tr>
        <td><div class="row" style="gap:8px;flex-wrap:nowrap"><b>${esc(p.program_name)}</b>${p.is_prime ? '<span class="chip pt">PT</span>' : '<span class="chip npt">NPT</span>'}</div><div class="small muted">${esc(p.rate_basis)}</div></td>
        ${durs.map((d) => `<td class="num">${p.durations[d] || ''}</td>`).join('')}
        <td class="num">${num(p.units, 1)}</td><td class="num">${money0(p.rc_rate)}</td><td class="num">${money(p.value)}</td>
        <td class="num"><b>${money(p.discounted)}</b></td>
        <td class="num"><span class="minibar"><i style="width:${t.package ? (p.discounted / t.package) * 100 : 0}%"></i></span>${pct(t.package ? (p.discounted / t.package) * 100 : 0)}</td></tr>`).join('')}`;
    }).join('');
    const durTot = durs.map((d) => r.lines.filter((l) => Number(l.dur) === d).reduce((a, l) => a + Number(l.spots), 0));
    return `<table class="t"><thead><tr><th>Program</th>${durs.map((d) => `<th class="num">${d}s</th>`).join('')}
      <th class="num">Total 30s</th><th class="num">R/C rate</th><th class="num">Value</th><th class="num">Discounted</th><th class="num">Share</th></tr></thead>
      <tbody>${body}<tr class="total"><td>Grand total</td>${durTot.map((n) => `<td class="num">${n}</td>`).join('')}<td class="num">${num(t.units, 1)}</td><td></td>
      <td class="num">${money(t.trv)}</td><td class="num">${money(t.package)}</td><td class="num">100%</td></tr></tbody></table>`;
  }
  if (tab === 'lines') {
    return `<table class="t"><thead><tr><th>Row</th><th>Section</th><th>Agency line</th><th>Rate card program</th><th class="num">Dur</th><th class="num">Spots</th><th class="num">30s eq.</th><th class="num">R/C rate</th><th class="num">Value</th><th class="num">Discounted</th></tr></thead><tbody>
      ${r.lines.map((l) => `<tr><td>${l.row}</td><td class="small">${esc(l.theme)}</td><td><b>${esc(l.program)}</b><div class="small muted">${esc(l.day)} ${hhmm(l.start)}-${hhmm(l.end)}</div></td>
        <td>${esc(l.program_name)} ${l.is_prime ? '<span class="chip pt">PT</span>' : '<span class="chip npt">NPT</span>'}</td><td class="num">${l.dur}s</td><td class="num">${l.spots}</td>
        <td class="num">${num(l.units, 2)}</td><td class="num">${money0(l.rc_rate)}</td><td class="num">${money(l.value)}</td><td class="num"><b>${money(l.discounted)}</b></td></tr>`).join('')}
    </tbody></table>`;
  }
  const rows = r.excluded || [];
  if (!rows.length) return '<div class="empty">Every program in the schedule is counted.</div>';
  return `<table class="t"><thead><tr><th>Row</th><th>Section</th><th>Agency line</th><th>Day / time</th><th class="num">Dur</th><th class="num">Spots</th><th>Why</th></tr></thead><tbody>
    ${rows.map((e) => `<tr><td>${e.row}</td><td>${esc(e.theme)}</td><td><b>${esc(e.program)}</b></td><td class="small">${esc(e.day)} ${hhmm(e.start)}-${hhmm(e.end)}</td>
      <td class="num">${e.dur ?? ''}</td><td class="num">${e.spots ?? ''}</td><td class="muted">${esc(e.reason)}</td></tr>`).join('')}</tbody></table>`;
}

function bind() {
  el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; draw(); }));
  el.querySelector('#xlsx').onclick = (e) => run(async () => download(await api(`/schedules/${s.id}/report.xlsx`)), e.currentTarget);
  el.querySelector('#pdf').onclick = (e) => run(async () => download(await api(`/schedules/${s.id}/report.pdf`)), e.currentTarget);
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
    const f0 = focusId ? document.getElementById(focusId) : null;
    const typing = f0 && document.activeElement === f0;
    const pos = typing ? f0.selectionStart : null;
    const y = window.scrollY;
    draw();
    // A redraw after typing should not replay the entrance animations.
    el.querySelectorAll('.rise, .opt, .hero, .kpi, .hbar .fill, .donut').forEach((x) => { x.style.animation = 'none'; });
    window.scrollTo(0, y);
    if (typing) { const f = document.getElementById(focusId); f.focus({ preventScroll: true }); if (pos !== null) f.setSelectionRange(pos, pos); }
    const sv = document.getElementById('saved');
    if (sv) sv.textContent = '✓ Saved';
  }, 500);

  el.querySelector('#o1').addEventListener('input', (e) => {
    s.option1_package = parse(e.target.value);
    const trv = s.result.totals.trv;
    el.querySelector('#o1disc').textContent = s.option1_package !== null && trv ? pct((1 - s.option1_package / trv) * 100, 1) : '-';
    if (s.option1_package !== null) s.selected_option = 1;
    save('o1');
  });
  el.querySelector('#o2').addEventListener('input', (e) => {
    const d = parse(e.target.value);
    s.option2_discount = d !== null && d <= 100 ? d : null;
    el.querySelector('#o2pkg').textContent = s.option2_discount !== null ? money(s.result.totals.trv * (1 - s.option2_discount / 100)) : '-';
    if (s.option2_discount !== null) s.selected_option = 2;
    save('o2');
  });
  // Clicking anywhere on an option card makes it the one used in the report.
  const pick = (card) => {
    const n = Number(card.dataset.opt);
    const input = card.querySelector('input');
    if (!input.value.trim()) { input.focus(); return; } // nothing to use yet: let the user type the value
    if (s.selected_option === n) return;
    s.selected_option = n;
    el.querySelectorAll('.opt[data-opt]').forEach((c) => c.classList.toggle('sel', c === card));
    save();
  };
  el.querySelectorAll('.opt[data-opt]').forEach((card) => {
    card.addEventListener('click', (e) => { if (!e.target.closest('input, label, button, a')) pick(card); });
    card.addEventListener('keydown', (e) => {
      if (e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(card); }
    });
  });
}
