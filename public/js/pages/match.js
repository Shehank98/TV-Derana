// New schedule, step 4 (and "Edit matches" for a saved schedule).
// One row per agency program (same name + days + time belt), merging its spots
// across sections. Untick to leave it out; change the rate card program if wrong.
import { api, run, esc, money, money0, num, hhmm, dbTime, setHeader, icon, modal, toast, debounce, monthLabel } from '../ui.js';
import { steps, getDraft, setDraft, clearDraft } from '../flow.js';

let el;
let D;            // { agency_id, client_id, ..., lines }
let editId = null;
let programs = [];
let byId = new Map();
let calc = null;
let filter = 'all';

export async function render(root, params) {
  el = root;
  filter = 'all';
  editId = params.id || null;
  programs = await api('/programs');
  byId = new Map(programs.map((p) => [p.id, p]));
  if (editId) {
    const s = await api(`/schedules/${editId}`);
    const agencies = await api('/agencies');
    const deal = agencies.find((a) => a.id === s.agency_id)?.clients.find((c) => c.client_id === s.client_id);
    D = { agency_id: s.agency_id, agency_name: s.agency_name, client_id: s.client_id, client_name: s.client_name, month: s.month,
      schedule_no: s.schedule_no, title: s.title, file_name: s.file_name, lines: s.lines, skipped: 0,
      discount_pct: Number(deal?.discount_pct || 0), existing: s };
  } else {
    D = getDraft();
    if (!D) { toast('Start by choosing an agency and client'); location.hash = '#/new'; return; }
  }
  await recalc();
  draw();
}

async function recalc() {
  calc = await api('/schedules/calculate', { method: 'POST', body: { agency_id: D.agency_id, client_id: D.client_id, lines: D.lines } });
  return calc;
}
const recalcSoon = debounce(async () => { if (await run(recalc) !== undefined) { paintTotals(); paintValues(); } }, 250);
const persist = () => { if (!editId) setDraft(D); };

// Group lines by agency program + days + time belt.
function groups() {
  const map = new Map();
  D.lines.forEach((l, i) => {
    const key = `${l.program.trim().toUpperCase()}|${String(l.day).toUpperCase().replace(/\s+/g, '')}|${l.start}|${l.end}`;
    if (!map.has(key)) map.set(key, { key, idx: [], themes: new Set(), durs: {} });
    const g = map.get(key);
    g.idx.push(i);
    if (l.theme) g.themes.add(l.theme);
    g.durs[l.dur] = (g.durs[l.dur] || 0) + Number(l.spots);
  });
  return [...map.values()].map((g) => {
    const ls = g.idx.map((i) => D.lines[i]);
    const first = ls[0];
    const on = ls.some((l) => l.status !== 'excluded');
    const pid = first.program_id;
    const statuses = new Set(ls.map((l) => l.status));
    const reason = first.match?.reason || first.reason || '';
    let how;
    if (!pid) how = ['Not matched', 'bad'];
    else if (statuses.has('manual')) how = ['Changed by you', 'violet'];
    else if (statuses.has('belt')) how = ['By time belt', 'info'];
    else if (statuses.has('review')) how = ['Please check', 'warn'];
    else if (/section/i.test(reason)) how = ['By section', 'info'];
    else how = ['Exact name', 'ok'];
    const spots = ls.reduce((a, l) => a + Number(l.spots), 0);
    return { ...g, ls, first, on, pid, how, spots, attention: !pid || statuses.has('review') || statuses.has('belt') };
  });
}

function groupValue(g) {
  if (!calc) return null;
  let v = 0;
  let special = null;
  for (const i of g.idx) {
    const r = calc.lines.find((x) => x.row === D.lines[i].row);
    if (r) { v += r.value; special = special || r.special; }
  }
  return { v, special };
}

function programOptions(pid) {
  const cats = new Map();
  for (const p of programs) {
    if (!p.active && p.id !== pid) continue;
    if (!cats.has(p.category_name)) cats.set(p.category_name, []);
    cats.get(p.category_name).push(p);
  }
  let html = pid ? '' : '<option value="">Choose a rate card program…</option>';
  for (const [cat, list] of cats) {
    html += `<optgroup label="${esc(cat)}">${list.map((p) => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.name)} · ${esc(p.day_pattern)} ${dbTime(p.start_time)}-${dbTime(p.end_time)}</option>`).join('')}</optgroup>`;
  }
  return html;
}

function draw() {
  const crumbs = editId ? [['Schedules', '#/schedules'], [D.schedule_no, `#/schedule/${editId}`], ['Edit matches']] : [];
  setHeader('', '', '', crumbs);
  const gs = groups();
  const counts = { all: gs.length, inferred: gs.filter((g) => g.how[0] !== 'Exact name' && g.pid).length,
    attention: gs.filter((g) => g.attention && g.on).length, off: gs.filter((g) => !g.on).length };
  if (filter === 'attention' && !counts.attention) filter = 'all';
  const shown = gs.filter((g) => filter === 'all' || (filter === 'inferred' ? g.how[0] !== 'Exact name' && g.pid
    : filter === 'attention' ? g.attention && g.on : !g.on));

  el.innerHTML = `
    ${editId ? '' : steps(4, { agency: { id: D.agency_id, name: D.agency_name }, client: { id: D.client_id, name: D.client_name } })}
    <div class="row" style="justify-content:space-between;align-items:flex-end;margin-bottom:20px;gap:16px">
      <div><h1>Check the program matches</h1>
        <p style="margin:6px 0 0;font-size:15.5px;color:var(--ink-2)">Untick anything the client does not want counted. If a match is wrong, pick the right rate card program.</p></div>
      <span class="small muted">${esc(D.schedule_no)} · ${monthLabel(D.month)}${D.skipped ? ` · ${D.skipped} rows with no time belt or zero spots were skipped` : ''}</span>
    </div>
    <div class="grid-4" id="totals" style="margin-bottom:18px"></div>
    <div class="row" style="margin-bottom:14px">
      <div class="filters">
        ${[['all', 'All programs'], ['inferred', 'Matched by section or time belt'], ['attention', 'Needs a look'], ['off', 'Unselected']]
    .filter(([k]) => k === 'all' || counts[k])
    .map(([k, t]) => `<button data-f="${k}" class="${filter === k ? 'on' : ''}">${t}<span class="n">${counts[k]}</span></button>`).join('')}
      </div>
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm" id="all">Select all</button>
      <button class="btn btn-ghost btn-sm" id="none">Unselect all</button>
    </div>
    <section class="mtable" aria-label="Program matches">
      <div class="mrow head"><span></span><span>Agency schedule</span><span>Spots by length</span><span></span><span>Matched rate card program</span><span style="text-align:right">R/C value</span></div>
      ${shown.map((g, i) => {
    const p = byId.get(g.pid);
    const durs = Object.keys(g.durs).map(Number).sort((a, b) => b - a);
    return `<div class="mrow ${g.on ? '' : 'off'}" style="animation-delay:${Math.min(i, 20) * 30}ms">
          <label class="tick"><span class="sr">Include ${esc(g.first.program)}</span><input type="checkbox" data-tog="${esc(g.key)}" ${g.on ? 'checked' : ''}></label>
          <div style="min-width:0"><span class="ag-name">${esc(g.first.program)}</span>
            <span class="small muted">${esc([...g.themes].slice(0, 2).join(', ') || 'No section')} · ${esc(g.first.day || 'Any day')} ${hhmm(g.first.start)}-${hhmm(g.first.end)}</span></div>
          <div class="durs">${durs.map((d) => `<span>${d}s × ${g.durs[d]}</span>`).join('')}</div>
          <svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          <div class="pick" style="min-width:0">
            <label><span class="sr">Rate card program for ${esc(g.first.program)}</span><select data-prog="${esc(g.key)}" ${g.on ? '' : 'disabled'}>${programOptions(g.pid)}</select></label>
            <div class="meta">${p ? `${p.is_prime ? '<span class="chip pt">PT</span>' : '<span class="chip npt">NPT</span>'}<span class="muted">${money0(p.rate_30s)} / 30s</span>` : ''}
              <span class="chip ${g.how[1]}">${g.how[0]}</span><span data-special="${esc(g.key)}"></span></div>
          </div>
          <span class="val" data-val="${esc(g.key)}">…</span>
        </div>`;
  }).join('') || '<div class="empty">Nothing in this filter.</div>'}
    </section>
    <div class="dock">
      <span id="dockText"></span>
      <div class="row" style="gap:10px">
        <a class="btn btn-outline-light" href="${editId ? `#/schedule/${editId}` : `#/client/${D.agency_id}/${D.client_id}`}">Back</a>
        <button class="btn btn-primary btn-lg" id="proceed">${editId ? 'Save and view dashboard' : 'Proceed to dashboard'} ${icon.arrow}</button>
      </div>
    </div>`;
  paintTotals();
  paintValues();
  bind(gs);
}

function paintTotals() {
  const gs = groups();
  const t = calc?.totals;
  const on = gs.filter((g) => g.on);
  const inferred = on.filter((g) => g.how[0] !== 'Exact name').length;
  el.querySelector('#totals').innerHTML = `
    <div class="kpi"><div class="label">Programs selected</div><div class="value">${on.length} <span style="font-size:16px;color:var(--ink-3)">/ ${gs.length}</span></div></div>
    <div class="kpi"><div class="label">Spots</div><div class="value">${num(t?.spots ?? 0, 0)}</div><div class="hint">${num(t?.units ?? 0, 1)} × 30-sec</div></div>
    <div class="kpi"><div class="label">Matched by section or time belt</div><div class="value" style="color:var(--info)">${inferred}</div><div class="hint">worth a quick look</div></div>
    <div class="kpi accent"><div class="label">Total rate card value (LKR)</div><div class="value">${t ? money(t.trv) : '…'}</div></div>`;
  el.querySelector('#dockText').innerHTML = `<b>${on.length} programs</b> · ${num(t?.spots ?? 0, 0)} spots · rate card value <b>LKR ${t ? money(t.trv) : '…'}</b>`;
}

function paintValues() {
  for (const g of groups()) {
    const v = el.querySelector(`[data-val="${CSS.escape(g.key)}"]`);
    if (!v) continue;
    const gv = groupValue(g);
    v.textContent = g.on && gv ? money0(gv.v) : '-';
    const sp = el.querySelector(`[data-special="${CSS.escape(g.key)}"]`);
    if (sp) sp.innerHTML = gv && gv.special && g.on ? `<span class="chip warn">${esc(gv.special)} rate</span>` : '';
  }
}

function setOn(g, on) {
  for (const i of g.idx) {
    const l = D.lines[i];
    if (on) { if (l.status === 'excluded') l.status = l._prev && l._prev !== 'excluded' ? l._prev : (l.program_id ? 'manual' : 'unmatched'); }
    else if (l.status !== 'excluded') { l._prev = l.status; l.status = 'excluded'; }
  }
}

function bind(gs) {
  const find = (key) => gs.find((g) => g.key === key);
  el.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.f; draw(); }));
  el.querySelector('#all').onclick = () => { gs.forEach((g) => setOn(g, true)); persist(); draw(); recalcSoon(); };
  el.querySelector('#none').onclick = () => { gs.forEach((g) => setOn(g, false)); persist(); draw(); recalcSoon(); };
  el.querySelectorAll('[data-tog]').forEach((cb) => cb.addEventListener('change', () => {
    setOn(find(cb.dataset.tog), cb.checked);
    persist(); draw(); recalcSoon();
  }));
  el.querySelectorAll('[data-prog]').forEach((sel) => sel.addEventListener('change', () => {
    const g = find(sel.dataset.prog);
    const pid = sel.value ? Number(sel.value) : null;
    for (const i of g.idx) { const l = D.lines[i]; l.program_id = pid; if (l.status !== 'excluded') l.status = pid ? 'manual' : 'unmatched'; }
    // Remember the agency's wording for this program (generic words like BILLBOARDS are refused by the server).
    if (pid) api(`/programs/${pid}/aliases`, { method: 'POST', body: { alias: g.first.program } }).catch(() => {});
    persist(); draw(); recalcSoon();
  }));
  el.querySelector('#proceed').onclick = (e) => run(() => save(), e.currentTarget);
}

async function save(allowDuplicate = false) {
  const unmatched = D.lines.filter((l) => l.status !== 'excluded' && !l.program_id).length;
  if (unmatched && !allowDuplicate && !(await modal({ title: 'Some programs are not matched', body: `<p style="margin:0">${unmatched} line(s) have no rate card program and won't be counted. Continue?</p>`, okText: 'Continue' }))) return;
  const body = {
    agency_id: D.agency_id, client_id: D.client_id, month: D.month, schedule_no: D.schedule_no, title: D.title, file_name: D.file_name,
    lines: D.lines.map(({ _prev, match, ...l }) => ({ ...l, confidence: match?.confidence ?? l.confidence, reason: match?.reason ?? l.reason })),
    allow_duplicate: allowDuplicate,
  };
  if (editId) Object.assign(body, { option1_package: D.existing.option1_package, option2_discount: D.existing.option2_discount, selected_option: D.existing.selected_option });
  else body.option2_discount = D.discount_pct;
  try {
    const res = editId ? await api(`/schedules/${editId}`, { method: 'PUT', body }) : await api('/schedules', { method: 'POST', body });
    if (!editId) clearDraft();
    toast(editId ? 'Matches saved' : 'Schedule saved', 'ok');
    location.hash = `#/schedule/${res.id}`;
  } catch (err) {
    if (err.status === 409 && !allowDuplicate) {
      if (await modal({ title: 'Schedule number already used', body: `<p style="margin:0">${esc(err.message)}</p><p>Save this one as well?</p>`, okText: 'Save anyway' })) return save(true);
      return;
    }
    throw err;
  }
}
