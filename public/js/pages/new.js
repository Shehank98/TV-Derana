// New schedule (and edit): 1 Schedule details + upload → 2 Program mappings → saved → schedule dashboard.
import { api, run, esc, money, money0, num, hhmm, dbTime, toast, setHeader, icon, modal, monthLabel, thisMonth, debounce } from '../ui.js';

let el;
let S;
let agencies = [];
let programs = [];
let programById = new Map();

const ATTENTION = ['belt', 'review', 'unmatched'];
const chevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m9 6 6 6-6 6"/></svg>';

export async function render(root, params) {
  el = root;
  [agencies, programs] = await Promise.all([api('/agencies'), api('/programs')]);
  programById = new Map(programs.map((p) => [p.id, p]));
  S = { step: 1, id: null, agency_id: '', client_id: '', month: thisMonth(), schedule_no: '', file: null, file_name: '',
    lines: [], extras: [], open: new Set(), calc: null, existing: null, reading: false, upError: null };
  if (params.id) {
    const s = await api(`/schedules/${params.id}`);
    Object.assign(S, { id: s.id, agency_id: s.agency_id || '', client_id: s.client_id || '', month: s.month, schedule_no: s.schedule_no,
      file_name: s.file_name, lines: s.lines, extras: s.extras || [], existing: s });
  }
  draw();
}

function header() {
  setHeader(S.id ? `Edit schedule ${S.existing.schedule_no}` : 'New schedule',
    S.id ? `${S.existing.client_name} · ${monthLabel(S.existing.month)}` : 'Upload an agency schedule and programs are matched automatically',
    S.id ? `<a class="btn" href="#/schedule/${S.id}">${icon.back} Back to dashboard</a>` : '');
}

function stepsMini() {
  const st = (n, t) => `<span class="${S.step === n ? 'on' : S.step > n ? 'done' : ''}"><i>${S.step > n ? '✓' : n}</i>${t}</span>`;
  return `<div class="steps-mini">${st(1, 'Schedule details')}<span class="sep"></span>${st(2, 'Program mappings')}<span class="sep"></span>${st(3, 'Dashboard & reports')}</div>`;
}

function draw() {
  const y = window.scrollY;
  header();
  el.innerHTML = `<div class="wizard${S.step === 2 ? ' wide' : ''}">${stepsMini()}${S.step === 1 ? step1() : step2()}</div>`;
  if (S.step === 2) el.querySelector('.wizard').style.maxWidth = 'none';
  (S.step === 1 ? bind1 : bind2)();
  window.scrollTo(0, y);
}

// ── Step 1: details + upload ─────────────────────────────────────────────
const agencyOf = () => agencies.find((a) => a.id === Number(S.agency_id));
const dealOf = () => agencyOf()?.clients.find((c) => c.client_id === Number(S.client_id));

function step1() {
  const ag = agencyOf();
  const deal = dealOf();
  const ready = S.agency_id && S.client_id && S.month && S.schedule_no.trim() && (S.file || S.lines.length);
  return `
  <div class="card card-pad">
    <h2>Schedule details</h2>
    <div class="form-grid">
      <label class="field">Agency
        <select id="agency"><option value="">Select agency…</option>
          ${agencies.map((a) => `<option value="${a.id}" ${a.id === Number(S.agency_id) ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      <label class="field">Client
        <select id="client" ${ag ? '' : 'disabled'}><option value="">${ag ? (ag.clients.length ? 'Select client…' : 'No clients linked to this agency') : 'Select an agency first'}</option>
          ${(ag ? ag.clients : []).map((c) => `<option value="${c.client_id}" ${c.client_id === Number(S.client_id) ? 'selected' : ''}>${esc(c.client_name)}</option>`).join('')}</select></label>
      <label class="field">Campaign month<input type="month" id="month" value="${esc(S.month)}"></label>
      <label class="field">Schedule No<input id="sno" placeholder="e.g. OGL/SLT/2026/045" value="${esc(S.schedule_no)}"></label>
    </div>
    ${deal ? `<div class="deal" style="margin-top:14px"><span>Rate card: <b>${esc(deal.rate_card_name || 'Base rate card')}</b></span>
      <span>Agreed discount: <b>${num(deal.discount_pct)}%</b> <span class="muted">(default for Option 02)</span></span></div>` : ''}
    ${ag && !ag.clients.length ? `<div class="note warn" style="margin-top:14px">Link a client to ${esc(ag.name)} under <a href="#/clients">Agencies &amp; clients</a>.</div>` : ''}

    <h2 style="margin-top:22px">Agency schedule (Excel)</h2>
    ${uploadBox()}
    <p class="small muted" style="margin:10px 0 0">Needs columns PROGRAM, DAY, START / END TIME, DUR and TOTAL SPOTS (any order). Section headings like “CASH BONANZA” are understood.</p>

    <div class="row" style="margin-top:20px"><span class="spacer"></span>
      <button class="btn btn-primary" id="proceed" ${ready && !S.upError && !S.reading ? '' : 'disabled'}>Proceed ${icon.next}</button></div>
  </div>`;
}

const fileIcon = (ok) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="${ok ? 'M14 2v6h6M9 15l2 2 4-4' : 'M14 2v6h6M10 12l4 4M14 12l-4 4'}"/></svg>`;
const fileInput = '<input type="file" id="file" accept=".xlsx,.xlsm" hidden>';

// Upload area states: empty → chosen → reading → (error | mappings). Editing shows the current file.
function uploadBox() {
  if (!S.file && !S.file_name) {
    return `<label class="drop" id="drop">${icon.upload}<b>Drop the schedule Excel here</b>
      <span class="muted">or <u>click to choose</u> an .xlsx file</span>${fileInput}</label>`;
  }
  const name = S.file ? S.file.name : S.file_name;
  const size = S.file ? `${Math.max(1, Math.round(S.file.size / 1024))} KB` : '';
  if (S.reading) {
    return `<div class="file-pill reading" id="drop"><span class="spin"></span>
      <div class="fp-text"><b>${esc(name)}</b><div class="small muted">Reading the schedule and matching programs…</div></div></div>`;
  }
  if (S.upError) {
    return `<div class="file-pill error" id="drop">${fileIcon(false)}
      <div class="fp-text"><b>${esc(name)}</b><div class="small">${esc(S.upError)}</div></div>
      <label class="btn btn-sm">Choose another file${fileInput}</label></div>`;
  }
  return `<div class="file-pill" id="drop">${fileIcon(true)}
    <div class="fp-text"><b>${esc(name)}</b><div class="small muted">${S.file ? `${size} · ready, it will be read when you click Proceed` : `${S.lines.length} lines already mapped · upload again to replace`}</div></div>
    <label class="btn btn-sm">Change file${fileInput}</label>
    ${S.file ? '<button class="btn btn-sm btn-ghost" id="removeFile" title="Remove file">✕</button>' : ''}</div>`;
}

function bind1() {
  el.querySelector('#agency').onchange = (e) => { S.agency_id = e.target.value; S.client_id = ''; draw(); };
  el.querySelector('#client').onchange = (e) => { S.client_id = e.target.value; draw(); };
  el.querySelector('#month').onchange = (e) => { S.month = e.target.value; draw(); };
  const sno = el.querySelector('#sno');
  sno.oninput = () => { S.schedule_no = sno.value; el.querySelector('#proceed').disabled = !(S.agency_id && S.client_id && S.month && S.schedule_no.trim() && (S.file || S.lines.length)); };
  const take = (f) => {
    if (!f) return;
    S.upError = null;
    if (!/\.xls[xm]$/i.test(f.name)) {
      S.file = f;
      S.upError = /\.xls$/i.test(f.name)
        ? 'This is an old .xls file. Open it in Excel, choose Save As → Excel Workbook (.xlsx), then upload that.'
        : 'This is not an Excel file. Please upload the agency schedule as .xlsx.';
    } else {
      S.file = f;
    }
    draw();
  };
  const file = el.querySelector('#file');
  if (file) file.onchange = () => take(file.files[0]);
  const rm = el.querySelector('#removeFile');
  if (rm) rm.onclick = () => { S.file = null; S.upError = null; draw(); };
  const drop = el.querySelector('#drop');
  if (drop && !S.reading) {
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => take(e.dataTransfer.files[0]));
  }
  el.querySelector('#proceed').onclick = async () => {
    if (S.file) {
      S.reading = true; draw();
      try {
        const res = await api('/schedules/parse', { method: 'POST', raw: S.file });
        if (!res.lines.length) throw new Error('No priced lines found: every row has zero spots or no duration.');
        S.lines = res.lines; S.extras = res.extras; S.file_name = S.file.name; S.file = null;
      } catch (err) {
        S.reading = false;
        S.upError = err.message;
        draw();
        return;
      }
      S.reading = false;
    }
    S.step = 2;
    await run(recalc);
    draw();
  };
}

// ── Step 2: mappings ─────────────────────────────────────────────────────
async function recalc() {
  S.calc = await api('/schedules/calculate', { method: 'POST', body: { agency_id: S.agency_id, client_id: S.client_id, lines: S.lines } });
}
const recalcSoon = debounce(async () => { await run(recalc); drawSummary(); drawGroupValues(); }, 300);

const isOff = (l) => l.status === 'excluded';
const lineValue = (l) => S.calc?.lines.find((x) => x.row === l.row)?.value ?? null;

function groups() {
  const map = new Map();
  S.lines.forEach((l, i) => {
    if (ATTENTION.includes(l.status) || (!l.program_id && !isOff(l))) return;
    const key = l.program_id || 'none';
    if (!map.has(key)) map.set(key, { key, program: programById.get(l.program_id), idx: [] });
    map.get(key).idx.push(i);
  });
  return [...map.values()].sort((a, b) => (a.program?.category_name || '').localeCompare(b.program?.category_name || '') || (a.program?.name || '').localeCompare(b.program?.name || ''));
}

function programSelect(l, i) {
  const cands = (l.match?.candidates || []).filter((c) => programById.has(c.program_id));
  const candIds = new Set(cands.map((c) => c.program_id));
  const label = (p) => `${p.name} · ${p.day_pattern} ${dbTime(p.start_time)}–${dbTime(p.end_time)}`;
  let html = l.program_id ? '' : '<option value="">Choose a program…</option>';
  if (cands.length) html += `<optgroup label="Best fits">${cands.map((c) => { const p = programById.get(c.program_id); return `<option value="${p.id}" ${p.id === l.program_id ? 'selected' : ''}>${esc(label(p))} (${Math.round(c.total * 100)}%)</option>`; }).join('')}</optgroup>`;
  const byCat = new Map();
  for (const p of programs) {
    if (candIds.has(p.id) || !p.active) continue;
    if (!byCat.has(p.category_name)) byCat.set(p.category_name, []);
    byCat.get(p.category_name).push(p);
  }
  for (const [cat, list] of byCat) html += `<optgroup label="${esc(cat)}">${list.map((p) => `<option value="${p.id}" ${p.id === l.program_id ? 'selected' : ''}>${esc(label(p))}</option>`).join('')}</optgroup>`;
  return `<select data-prog="${i}">${html}</select>`;
}

const prime = (p) => (p ? (p.is_prime ? '<span class="chip pt">PT</span>' : '<span class="chip npt">NPT</span>') : '');

function lineRow(l, i, { showSelect = true } = {}) {
  const v = lineValue(l);
  return `<div class="mline ${isOff(l) ? 'off' : ''}">
    <label class="switch" title="${isOff(l) ? 'Removed: click to include' : 'Included: click to remove'}"><input type="checkbox" data-line="${i}" ${isOff(l) ? '' : 'checked'}><span></span></label>
    <div class="ag"><b>${esc(l.program)}</b><div class="small muted">${esc(l.theme || '')}</div></div>
    <div class="small">${esc(l.day || '-')}<div class="muted">${hhmm(l.start)}–${hhmm(l.end)}</div></div>
    <div class="num">${num(l.dur, 0)}s</div>
    <div class="num">${num(l.spots, 0)} spot${Number(l.spots) === 1 ? '' : 's'}</div>
    <div>${showSelect ? programSelect(l, i) : ''}</div>
    <div class="num small hide-m">${v !== null && !isOff(l) ? money0(v) : ''}</div>
  </div>`;
}

function summaryTiles() {
  const t = S.calc?.totals;
  const att = S.lines.filter((l) => ATTENTION.includes(l.status)).length;
  const off = S.lines.filter(isOff).length;
  const progs = new Set(S.lines.filter((l) => !isOff(l) && l.program_id && !ATTENTION.includes(l.status)).map((l) => l.program_id)).size;
  return `
    <div class="card kpi"><div class="label">Lines read</div><div class="value">${S.lines.length}</div><div class="hint">${S.extras.length} rows not priced (zero spots / benefits)</div></div>
    <div class="card kpi"><div class="label">Programs mapped</div><div class="value">${progs}</div><div class="hint">${S.lines.length - att - off} lines</div></div>
    <div class="card kpi" ${att ? 'style="border-color:#f2c46b"' : ''}><div class="label">Need your check</div><div class="value" style="color:${att ? 'var(--warn)' : 'var(--ok)'}">${att}</div><div class="hint">${att ? 'see the yellow box below' : 'all lines matched'}</div></div>
    <div class="card kpi"><div class="label">Removed by you</div><div class="value">${off}</div><div class="hint">not counted</div></div>
    <div class="card kpi accent"><div class="label">Total rate card value</div><div class="value">${t ? money(t.trv) : '…'}</div><div class="hint">${t ? `${num(t.spots, 0)} spots · ${num(t.units, 1)} × 30s` : ''}</div></div>`;
}
function drawSummary() { const s = el.querySelector('#mapSummary'); if (s) s.innerHTML = summaryTiles(); }
function drawGroupValues() {
  el.querySelectorAll('[data-gval]').forEach((x) => {
    const g = groups().find((gg) => String(gg.key) === x.dataset.gval);
    if (!g) return;
    const v = g.idx.reduce((a, i) => a + (isOff(S.lines[i]) ? 0 : lineValue(S.lines[i]) || 0), 0);
    x.textContent = money0(v);
  });
}

function step2() {
  const att = S.lines.map((l, i) => ({ l, i })).filter(({ l }) => ATTENTION.includes(l.status));
  const gs = groups();
  return `
  <div class="map-summary" id="mapSummary">${summaryTiles()}</div>
  ${att.length ? `
  <div class="card attention" style="margin-bottom:16px">
    <div class="card-head"><div><h2>Please check ${att.length} line${att.length > 1 ? 's' : ''}</h2>
      <div class="small muted">The name wasn’t clear, so the program airing at that day &amp; time was suggested. Pick the right program, confirm, or remove the line.</div></div>
      <button class="btn btn-sm" id="confirmAll">✓ Accept all suggestions</button></div>
    ${att.map(({ l, i }) => `${lineRow(l, i)}<div class="small muted" style="padding:0 18px 8px 58px">${esc(l.match?.reason || l.reason || '')}
      ${l.program_id ? ` · <a href="#" data-confirm="${i}">Accept suggestion</a>` : ''}</div>`).join('')}
  </div>` : ''}
  <div class="card">
    <div class="card-head"><div><h2>Program mappings</h2><div class="small muted">Switch off anything the client doesn’t want counted. Open a program to see or change its lines.</div></div>
      <div class="row"><button class="btn btn-sm btn-ghost" id="expandAll">Expand all</button><button class="btn btn-sm btn-ghost" id="collapseAll">Collapse all</button></div></div>
    ${gs.map((g) => {
    const ls = g.idx.map((i) => S.lines[i]);
    const allOff = ls.every(isOff);
    const someOff = !allOff && ls.some(isOff);
    const on = ls.filter((l) => !isOff(l));
    const spots = on.reduce((a, l) => a + Number(l.spots), 0);
    const units = on.reduce((a, l) => a + (Number(l.dur) * Number(l.spots)) / 30, 0);
    const p = g.program;
    const open = S.open.has(String(g.key));
    return `<div class="mgroup ${allOff ? 'off' : ''}">
        <div class="mhead">
          <label class="switch" title="${allOff ? 'Include this program' : 'Remove this program'}"><input type="checkbox" data-group="${g.key}" ${allOff ? '' : 'checked'}><span></span></label>
          <div class="name"><div class="row" style="gap:8px"><button class="chev ${open ? 'open' : ''}" data-open="${g.key}" aria-label="Show lines">${chevron}</button>
            <div><b>${esc(p ? p.name : 'Not matched')}</b> ${prime(p)}<div class="small muted">${p ? `${esc(p.slot_name)} · ${esc(p.category_name)}` : ''}${someOff ? ' · <span style="color:var(--warn)">some lines removed</span>' : ''}</div></div></div></div>
          <div class="small muted hide-m">${p ? `${esc(p.day_pattern)} ${dbTime(p.start_time)}–${dbTime(p.end_time)}` : ''}</div>
          <div class="num hide-m">${ls.length} line${ls.length > 1 ? 's' : ''}</div>
          <div class="num hide-m">${num(spots, 0)} spots</div>
          <div class="num hide-m">${num(units, 1)} × 30s</div>
          <div class="num"><b data-gval="${g.key}">…</b><div class="small muted hide-m">R/C ${p ? money0(p.rate_30s) : ''}</div></div>
        </div>
        ${open ? `<div class="mlines">${g.idx.map((i) => lineRow(S.lines[i], i)).join('')}</div>` : ''}
      </div>`;
  }).join('') || '<div class="empty">No mapped programs.</div>'}
  </div>
  ${S.extras.length ? `<details class="card extras" style="margin-top:16px"><summary>${S.extras.length} rows not priced <span class="muted small">(zero spots, benefits without duration)</span></summary>
    <div class="table-wrap"><table class="t"><thead><tr><th>Row</th><th>Section</th><th>Line</th><th>Day / time</th><th class="num">Dur</th><th>Reason</th></tr></thead><tbody>
    ${S.extras.map((e) => `<tr><td>${e.row}</td><td>${esc(e.theme)}</td><td>${esc(e.program)}</td><td class="small">${esc(e.day)} ${hhmm(e.start)}–${hhmm(e.end)}</td><td class="num">${e.dur ?? ''}</td><td class="muted">${esc(e.reason)}</td></tr>`).join('')}
    </tbody></table></div></details>` : ''}
  <div class="sticky-foot">
    <button class="btn" id="back">${icon.back} Schedule details</button><span class="spacer"></span>
    <button class="btn btn-primary" id="continue">Continue to dashboard ${icon.next}</button>
  </div>`;
}

function setStatus(i, include) {
  const l = S.lines[i];
  if (include) { l.status = l._prev && l._prev !== 'excluded' ? l._prev : (l.program_id ? 'manual' : 'unmatched'); }
  else { if (!isOff(l)) l._prev = l.status; l.status = 'excluded'; }
}

function bind2() {
  drawGroupValues();
  el.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
    const k = String(b.dataset.open);
    if (S.open.has(k)) S.open.delete(k); else S.open.add(k);
    draw();
  }));
  el.querySelector('#expandAll').onclick = () => { groups().forEach((g) => S.open.add(String(g.key))); draw(); };
  el.querySelector('#collapseAll').onclick = () => { S.open.clear(); draw(); };
  el.querySelectorAll('[data-group]').forEach((cb) => cb.addEventListener('change', () => {
    const g = groups().find((x) => String(x.key) === cb.dataset.group);
    g.idx.forEach((i) => setStatus(i, cb.checked));
    draw(); recalcSoon();
  }));
  el.querySelectorAll('[data-line]').forEach((cb) => cb.addEventListener('change', () => {
    setStatus(Number(cb.dataset.line), cb.checked);
    draw(); recalcSoon();
  }));
  el.querySelectorAll('[data-prog]').forEach((sel) => sel.addEventListener('change', () => {
    const i = Number(sel.dataset.prog);
    const l = S.lines[i];
    const pid = sel.value ? Number(sel.value) : null;
    const same = S.lines.filter((x) => x.program === l.program && x.day === l.day && x.start === l.start && x.end === l.end);
    same.forEach((x) => { x.program_id = pid; x.status = pid ? 'manual' : 'unmatched'; });
    if (pid) {
      S.open.add(String(pid));
      // Remember the agency's name for this program (generic words like BILLBOARDS are refused by the server).
      api(`/programs/${pid}/aliases`, { method: 'POST', body: { alias: l.program } }).catch(() => {});
    }
    if (same.length > 1) toast(`Applied to ${same.length} identical lines`);
    draw(); recalcSoon();
  }));
  el.querySelectorAll('[data-confirm]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    S.lines[Number(a.dataset.confirm)].status = 'manual';
    draw(); recalcSoon();
  }));
  const ca = el.querySelector('#confirmAll');
  if (ca) ca.onclick = () => {
    S.lines.forEach((l) => { if (ATTENTION.includes(l.status) && l.program_id) l.status = 'manual'; });
    draw(); recalcSoon();
  };
  el.querySelector('#back').onclick = () => { S.step = 1; draw(); };
  el.querySelector('#continue').onclick = (e) => {
    const left = S.lines.filter((l) => l.status === 'unmatched').length;
    const btn = e.currentTarget;
    const go = async (allowDuplicate = false) => {
      const body = { agency_id: S.agency_id, client_id: S.client_id, month: S.month, schedule_no: S.schedule_no, file_name: S.file_name,
        lines: S.lines.map(({ _prev, match, ...l }) => ({ ...l, confidence: match?.confidence ?? l.confidence, reason: match?.reason ?? l.reason })),
        extras: S.extras, allow_duplicate: allowDuplicate };
      if (S.id) Object.assign(body, { option1_package: S.existing.option1_package, option2_discount: S.existing.option2_discount, selected_option: S.existing.selected_option });
      else body.option2_discount = Number(dealOf()?.discount_pct || 0);
      try {
        const res = S.id ? await api(`/schedules/${S.id}`, { method: 'PUT', body }) : await api('/schedules', { method: 'POST', body });
        toast(S.id ? 'Schedule updated' : 'Schedule saved', 'ok');
        location.hash = `#/schedule/${res.id}`;
      } catch (err) {
        if (err.status === 409 && !allowDuplicate) {
          if (await modal({ title: 'Schedule No already used', body: `<p>${esc(err.message)}</p><p>Save this one too?</p>`, okText: 'Save anyway' })) return go(true);
          return undefined;
        }
        throw err;
      }
      return true;
    };
    run(async () => {
      if (left && !(await modal({ title: 'Some lines have no program', body: `<p>${left} line(s) have no program and won’t be counted. Continue?</p>`, okText: 'Continue' }))) return;
      await go();
    }, btn);
  };
}
