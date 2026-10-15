// New / edit quotation: 1 Client → 2 Upload → 3 Match programs → 4 Quotation
import { api, run, esc, money, money0, num, pct, hhmm, dbTime, toast, setHeader, icon, debounce, store, download, modal } from '../ui.js';

const DRAFT = 'tvd_quote_draft';
const STATUS = {
  matched: ['ok', 'Matched'],
  manual: ['info', 'Set by you'],
  belt: ['warn', 'Time belt'],
  review: ['warn', 'Check'],
  unmatched: ['bad', 'Not matched'],
  excluded: ['plain', 'Excluded'],
};
const STEPS = ['Client & campaign', 'Upload schedule', 'Match programs', 'Quotation'];

let S;          // page state
let el;         // page root
let agencies = [];
let programs = [];
let programById = new Map();

const blank = () => ({
  step: 1, quoteId: null, ref: null, agency_id: '', client_id: '', title: '', file_name: '',
  sheet: '', sheets: [], lines: [], extras: [], package_price: null, result: null, filter: 'attention',
  learn: true, savedFinal: null,
});

function saveDraft() {
  if (S.quoteId) return;
  const { _file, result, ...rest } = S; // the File object and results aren't worth persisting
  store.set(DRAFT, rest);
}

export async function render(root, params) {
  el = root;
  [agencies, programs] = await Promise.all([api('/agencies'), api('/programs')]);
  programById = new Map(programs.map((p) => [p.id, p]));

  if (params.id) {
    const q = await api(`/quotations/${params.id}`);
    S = { ...blank(), step: 4, quoteId: q.id, ref: q.ref, agency_id: q.agency_id || '', client_id: q.client_id || '',
      title: q.title, file_name: q.file_name, lines: q.lines, extras: q.extras || [], package_price: q.package_price,
      savedFinal: q.totals?.totals?.final ?? null, filter: 'all' };
    await calculate();
  } else {
    S = { ...blank(), ...(store.get(DRAFT) || {}) };
    if (S.quoteId) S = blank();
    if (S.step === 4) await calculate();
  }
  draw();
}

function header() {
  const sub = S.ref ? `${S.ref} · ${S.title}` : S.title || 'Turn an agency schedule into a priced quotation';
  setHeader(S.quoteId ? 'Edit quotation' : 'New quotation', sub,
    `<button class="btn" id="startOver">${icon.plus} Start a new one</button>`);
  document.getElementById('startOver').onclick = () => {
    store.del(DRAFT);
    if (location.hash !== '#/quote/new') location.hash = '#/quote/new';
    else { S = blank(); draw(); }
  };
}

function stepper() {
  const reach = S.lines.length ? (S.result ? 4 : 3) : S.client_id ? 2 : 1;
  return `<div class="stepper">${STEPS.map((t, i) => {
    const n = i + 1;
    const cls = n === S.step ? 'cur' : n <= reach ? 'done' : '';
    return `<div class="s ${cls}" data-step="${n <= reach ? n : ''}"><span class="n">${n < S.step || (n <= reach && n !== S.step) ? '✓' : n}</span><span class="t">${t}</span></div>`;
  }).join('')}</div>`;
}

function draw() {
  header();
  const body = [null, step1, step2, step3, step4][S.step]();
  el.innerHTML = stepper() + body;
  el.querySelectorAll('.stepper [data-step]').forEach((s) => s.addEventListener('click', async () => {
    const n = Number(s.dataset.step);
    if (!n || n === S.step) return;
    if (n === 4) await calculate();
    S.step = n; saveDraft(); draw();
  }));
  [null, bind1, bind2, bind3, bind4][S.step]();
}

// ── Step 1: client & campaign ────────────────────────────────────────────
function clientOf(id) {
  for (const a of agencies) for (const c of a.clients) if (c.id === Number(id)) return { ...c, agency: a };
  return null;
}
function pricingText(c) {
  if (!c) return '';
  if (c.pricing_type === 'discount') return `Base rate card with <b>${num(c.discount_pct)}% discount</b>`;
  if (c.pricing_type === 'rate_card') return c.rate_card_name ? `Custom rate card <b>${esc(c.rate_card_name)}</b>` : 'Custom rate card (not set — base rates will be used)';
  return 'Standard <b>base rate card</b> (no discount)';
}

function step1() {
  const ag = agencies.find((a) => a.id === Number(S.agency_id));
  const client = clientOf(S.client_id);
  return `
  <div class="card card-pad" style="max-width:760px">
    <h2>Who is this quotation for?</h2>
    <div class="form-grid">
      <label class="field">Agency
        <select id="agency"><option value="">Select agency…</option>
          ${agencies.map((a) => `<option value="${a.id}" ${a.id === Number(S.agency_id) ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
        </select></label>
      <label class="field">Client
        <select id="client" ${ag ? '' : 'disabled'}><option value="">${ag ? 'Select client…' : 'Pick an agency first'}</option>
          ${(ag ? ag.clients : []).map((c) => `<option value="${c.id}" ${c.id === Number(S.client_id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select></label>
      <label class="field full">Campaign / quotation title
        <input id="title" placeholder="e.g. SLT Mobitel – Dream Star season 12" value="${esc(S.title)}"></label>
    </div>
    ${client ? `<div class="note" style="margin-top:14px">Pricing for ${esc(client.name)}: ${pricingText(client)}</div>` : ''}
    ${!agencies.length ? '<div class="note warn" style="margin-top:14px">No agencies yet. Add one under <a href="#/clients">Agencies &amp; clients</a>.</div>' : ''}
    <div class="row" style="margin-top:18px">
      <a href="#/clients" class="small">Manage agencies &amp; clients</a><span class="spacer"></span>
      <button class="btn btn-primary" id="next1" ${S.client_id ? '' : 'disabled'}>Continue ${icon.next}</button>
    </div>
  </div>`;
}
function bind1() {
  el.querySelector('#agency').onchange = (e) => { S.agency_id = e.target.value; S.client_id = ''; saveDraft(); draw(); };
  el.querySelector('#client').onchange = (e) => { S.client_id = e.target.value; saveDraft(); draw(); };
  el.querySelector('#title').oninput = (e) => { S.title = e.target.value; saveDraft(); };
  el.querySelector('#next1').onclick = () => {
    if (!S.title.trim()) S.title = `${clientOf(S.client_id)?.name || 'Campaign'} – ${new Date().toLocaleDateString('en-GB')}`;
    S.step = S.lines.length ? 3 : 2; saveDraft(); draw();
  };
}

// ── Step 2: upload ───────────────────────────────────────────────────────
function step2() {
  return `
  <div class="grid-2" style="align-items:start">
    <div class="card card-pad">
      <h2>Upload the agency schedule</h2>
      <label class="drop" id="drop">
        ${icon.upload}
        <b>Drop the Excel file here</b>
        <span class="muted">or click to choose an .xlsx file</span>
        <input type="file" id="file" accept=".xlsx,.xlsm" hidden>
      </label>
      ${S.sheets.length > 1 ? `<label class="field" style="margin-top:14px">Sheet
        <select id="sheet">${S.sheets.map((s) => `<option ${s === S.sheet ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>` : ''}
      ${S.file_name ? `<p class="muted small">Current file: <b>${esc(S.file_name)}</b> (${S.lines.length} priced lines). Uploading again replaces it.</p>` : ''}
      <div id="upStatus"></div>
    </div>
    <div class="card card-pad">
      <h2>What the system reads</h2>
      <p class="muted" style="margin-top:0">The header row is found automatically (the row containing <b>PROGRAM</b>). Column order doesn’t matter.</p>
      <table class="t"><tbody>
        <tr><td><b>PROGRAM</b></td><td class="muted">Program or ad item (BILLBOARDS, L CRAWLER…)</td></tr>
        <tr><td><b>DAY</b></td><td class="muted">DAILY, MON TO FRI, SAT - SUN, WKDAYS…</td></tr>
        <tr><td><b>START / END TIME</b></td><td class="muted">Time belt, 24-hour</td></tr>
        <tr><td><b>DUR</b></td><td class="muted">Seconds per spot (any length, priced pro-rata)</td></tr>
        <tr><td><b>TOTAL SPOTS</b></td><td class="muted">Or daily spot columns, which are added up</td></tr>
      </tbody></table>
      <p class="muted small" style="margin-bottom:0">Rows with only a program name (e.g. <i>CASH BONANZA</i>) are treated as section headings and help identify billboards, cards and crawlers inside them. Rows with zero spots are listed but not priced.</p>
    </div>
  </div>
  <div class="sticky-foot"><button class="btn" id="back2">${icon.back} Back</button>
    ${S.lines.length ? `<button class="btn btn-primary" id="next2">Review matches ${icon.next}</button>` : ''}</div>`;
}
function bind2() {
  const drop = el.querySelector('#drop');
  const input = el.querySelector('#file');
  const upload = async (file, sheet) => {
    if (!file) return;
    const status = el.querySelector('#upStatus');
    status.innerHTML = '<p class="muted"><span class="spin"></span> Reading schedule and matching programs…</p>';
    const res = await run(() => api(`/quotes/parse${sheet ? `?sheet=${encodeURIComponent(sheet)}` : ''}`, { method: 'POST', raw: file }));
    if (!res) { status.innerHTML = ''; return; }
    S.file_name = file.name;
    S._file = file;
    S.sheet = res.sheet; S.sheets = res.sheets;
    S.lines = res.lines; S.extras = res.extras;
    S.result = null; S.filter = 'attention';
    if (!S.title.trim()) S.title = file.name.replace(/\.[^.]+$/, '');
    S.step = 3; saveDraft(); draw();
    const bad = res.lines.filter((l) => l.status !== 'matched').length;
    toast(`${res.lines.length} lines read · ${res.lines.length - bad} matched automatically${bad ? ` · ${bad} to check` : ''}`, 'ok');
  };
  input.onchange = () => upload(input.files[0]);
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => upload(e.dataTransfer.files[0]));
  const sheet = el.querySelector('#sheet');
  if (sheet) sheet.onchange = () => (S._file ? upload(S._file, sheet.value) : toast('Upload the file again to switch sheets'));
  el.querySelector('#back2').onclick = () => { S.step = 1; draw(); };
  const n = el.querySelector('#next2');
  if (n) n.onclick = () => { S.step = 3; draw(); };
}

// ── Step 3: match review ─────────────────────────────────────────────────
const lineKey = (l) => `${l.program}|${l.day}|${l.start}|${l.end}`;
const attention = (l) => ['belt', 'review', 'unmatched'].includes(l.status);

function progLabel(p) {
  return `${p.name} · ${p.day_pattern} ${dbTime(p.start_time)}–${dbTime(p.end_time)} · ${money0(p.rate_30s)}`;
}

function programOptions(l) {
  const cands = (l.match?.candidates || []).filter((c) => programById.has(c.program_id));
  const candIds = new Set(cands.map((c) => c.program_id));
  let html = `<option value="">— Not priced (exclude) —</option>`;
  if (cands.length) {
    html += `<optgroup label="Best fits for this line">${cands.map((c) => {
      const p = programById.get(c.program_id);
      return `<option value="${p.id}" ${p.id === l.program_id ? 'selected' : ''}>${esc(progLabel(p))}  (${Math.round(c.total * 100)}%)</option>`;
    }).join('')}</optgroup>`;
  }
  const byCat = new Map();
  for (const p of programs) {
    if (candIds.has(p.id) || !p.active) continue;
    if (!byCat.has(p.category_name)) byCat.set(p.category_name, []);
    byCat.get(p.category_name).push(p);
  }
  for (const [cat, list] of byCat) {
    html += `<optgroup label="${esc(cat)}">${list.map((p) => `<option value="${p.id}" ${p.id === l.program_id ? 'selected' : ''}>${esc(progLabel(p))}</option>`).join('')}</optgroup>`;
  }
  return html;
}

function scoreBar(c) {
  if (c === undefined || c === null) return '';
  const cls = c >= 0.8 ? '' : c >= 0.6 ? 'mid' : 'low';
  return `<span class="score ${cls}" title="Confidence ${Math.round(c * 100)}%"><i style="width:${Math.round(c * 100)}%"></i></span>`;
}

function step3() {
  const counts = { all: S.lines.length, attention: 0, matched: 0, manual: 0, belt: 0, review: 0, unmatched: 0, excluded: 0 };
  for (const l of S.lines) { counts[l.status] = (counts[l.status] || 0) + 1; if (attention(l)) counts.attention++; }
  const filters = [['attention', 'Needs a look'], ['all', 'All'], ['matched', 'Matched'], ['manual', 'Set by you'], ['belt', 'Time belt'], ['review', 'Check'], ['unmatched', 'Not matched'], ['excluded', 'Excluded']]
    .filter(([k]) => k === 'all' || k === 'attention' || counts[k]);
  if (S.filter === 'attention' && !counts.attention) S.filter = 'all';
  const shown = S.lines.map((l, i) => ({ l, i })).filter(({ l }) => S.filter === 'all' || (S.filter === 'attention' ? attention(l) : l.status === S.filter));

  let lastTheme = null;
  const rows = shown.map(({ l, i }) => {
    const p = programById.get(l.program_id);
    const [cls, label] = STATUS[l.status] || ['', l.status];
    const themeRow = l.theme !== lastTheme ? `<tr class="group"><td colspan="7">${esc(l.theme || 'No section')}</td></tr>` : '';
    lastTheme = l.theme;
    return `${themeRow}<tr class="match-row ${l.status === 'excluded' ? 'dim' : ''}">
      <td class="nowrap"><span class="chip ${cls}">${label}</span><div class="small muted" style="margin-top:4px">Row ${l.row}</div></td>
      <td><b>${esc(l.program)}</b><div class="small muted">${esc(l.day || '—')} · ${hhmm(l.start)}–${hhmm(l.end)}</div></td>
      <td class="num">${num(l.dur, 0)}s</td>
      <td class="num">${num(l.spots, 0)}</td>
      <td><div class="picker"><select data-line="${i}">${programOptions(l)}</select>
        <span class="why">${l.match ? scoreBar(l.match.confidence) : ''}${esc(l.status === 'manual' ? 'Chosen manually' : l.match?.reason || '')}</span></div></td>
      <td>${p ? `${esc(p.slot_name)}<div class="small muted">${esc(p.category_name)}</div>` : '<span class="muted">—</span>'}</td>
      <td class="num">${p ? `${money0(p.rate_30s)} ${p.is_prime ? '<span class="chip pt">PT</span>' : '<span class="chip npt">NPT</span>'}` : ''}</td>
    </tr>`;
  }).join('');

  return `
  <div class="card">
    <div class="card-head">
      <div><h2>Check how each line was matched</h2>
        <div class="muted small">${esc(S.file_name)} · sheet “${esc(S.sheet)}” · ${S.lines.length} priced lines${S.extras.length ? ` · ${S.extras.length} not priced` : ''}</div></div>
      <label class="check small" title="When you pick a program by hand, remember that name for next time"><input type="checkbox" id="learn" ${S.learn ? 'checked' : ''}> Learn from my corrections</label>
    </div>
    <div class="card-pad" style="padding-bottom:6px">
      <div class="filters">${filters.map(([k, t]) => `<button data-f="${k}" class="${S.filter === k ? 'on' : ''}">${t}<span class="n">${counts[k]}</span></button>`).join('')}</div>
      ${counts.belt ? `<p class="small muted" style="margin:10px 0 0"><span class="chip warn">Time belt</span> = the name wasn’t recognised, so the program airing on those days &amp; times was used. Please confirm.</p>` : ''}
    </div>
    <div class="table-wrap"><table class="t">
      <thead><tr><th>Status</th><th>Agency line</th><th class="num">Dur</th><th class="num">Spots</th><th>TV Derana program</th><th>Rate slot</th><th class="num">Base rate</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="empty">Nothing here 🎉 — every line in this filter is fine.</td></tr>'}</tbody>
    </table></div>
  </div>
  ${extrasCard()}
  <div class="sticky-foot">
    <button class="btn" id="back3">${icon.back} Upload different file</button>
    <button class="btn btn-primary" id="next3">Calculate quotation ${icon.next}</button>
  </div>`;
}

function extrasCard() {
  if (!S.extras.length) return '';
  const benefits = S.extras.filter((e) => !/Zero spots/.test(e.reason));
  return `<details class="card extras" style="margin-top:16px">
    <summary>Not priced: ${S.extras.length} rows <span class="muted small">(${benefits.length} benefits / incomplete, ${S.extras.length - benefits.length} with zero spots)</span></summary>
    <div class="table-wrap"><table class="t"><thead><tr><th>Row</th><th>Section</th><th>Line</th><th>Day / time</th><th class="num">Dur</th><th>Reason</th></tr></thead><tbody>
    ${S.extras.map((e) => `<tr><td>${e.row}</td><td>${esc(e.theme)}</td><td>${esc(e.program)}</td><td class="small">${esc(e.day)} ${hhmm(e.start)}–${hhmm(e.end)}</td><td class="num">${e.dur ?? ''}</td><td class="muted">${esc(e.reason)}</td></tr>`).join('')}
    </tbody></table></div></details>`;
}

function bind3() {
  el.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { S.filter = b.dataset.f; draw(); }));
  el.querySelector('#learn').onchange = (e) => { S.learn = e.target.checked; saveDraft(); };
  el.querySelectorAll('select[data-line]').forEach((sel) => sel.addEventListener('change', () => {
    const line = S.lines[Number(sel.dataset.line)];
    const pid = sel.value ? Number(sel.value) : null;
    const key = lineKey(line);
    let n = 0;
    for (const l of S.lines) {
      if (lineKey(l) !== key) continue;
      l.program_id = pid;
      l.status = pid ? 'manual' : 'excluded';
      n++;
    }
    if (pid && S.learn) {
      // Server refuses generic item names (BILLBOARDS etc.) — that's fine, ignore.
      api(`/programs/${pid}/aliases`, { method: 'POST', body: { alias: line.program } }).catch(() => {});
    }
    S.result = null;
    saveDraft();
    draw();
    if (n > 1) toast(`Applied to ${n} identical lines`);
  }));
  el.querySelector('#back3').onclick = () => { S.step = 2; draw(); };
  el.querySelector('#next3').onclick = async (e) => {
    const left = S.lines.filter((l) => l.status === 'unmatched').length;
    if (left && !(await modal({ title: 'Some lines are not matched', body: `<p>${left} line(s) have no program and will <b>not be priced</b>. Continue anyway?</p>`, okText: 'Continue' }))) return;
    const ok = await run(() => calculate(), e.currentTarget);
    if (ok !== undefined) { S.step = 4; saveDraft(); draw(); }
  };
}

// ── Step 4: quotation ────────────────────────────────────────────────────
async function calculate() {
  S.result = await api('/quotes/calculate', { method: 'POST', body: { client_id: S.client_id || null, lines: S.lines, package_price: S.package_price } });
  return S.result;
}

let tab = 'program';

function step4() {
  const r = S.result;
  if (!r) return '<div class="loading">Calculating…</div>';
  const t = r.totals;
  const client = r.client;
  const changed = S.savedFinal !== null && Math.abs(S.savedFinal - t.final) > 0.5;
  const ptVal = r.prime.PT.final; const nptVal = r.prime.NPT.final;
  const ptShare = t.final ? (ptVal / t.final) * 100 : 0;

  return `
  ${changed ? `<div class="note warn" style="margin-bottom:14px">Rates have changed since this quotation was saved (saved final value ${money(S.savedFinal)}, now ${money(t.final)}). Saving will update it.</div>` : ''}
  ${t.unpriced ? `<div class="note warn" style="margin-bottom:14px">${t.unpriced} line(s) are not priced because they have no program. <a href="#" id="toMatch">Review matches</a></div>` : ''}
  <div class="kpis">
    <div class="card kpi"><div class="label">Rate card value</div><div class="value">${money(t.gross)}</div><div class="hint">${num(t.spots, 0)} spots · ${num(t.units)} × 30s</div></div>
    <div class="card kpi"><div class="label">Value at client rates</div><div class="value">${money(t.net)}</div><div class="hint">${t.client_discount_pct >= 0 ? `${pct(t.client_discount_pct, 2)} client discount` : `${pct(-t.client_discount_pct, 2)} above base`}</div></div>
    <div class="card kpi accent"><div class="label">${t.package_price ? 'Package price' : 'Final value'} (LKR)</div><div class="value">${money(t.final)}</div><div class="hint">${pct(t.total_discount_pct, 2)} off rate card${t.tax_pct ? ` · ${money(t.grand_total)} incl. ${t.tax_pct}% tax` : ''}</div></div>
    <div class="card kpi"><div class="label">Prime time share</div><div class="value">${pct(ptShare, 0)}</div>
      <div class="bar" style="margin-top:8px"><i style="width:${ptShare}%;background:var(--red)"></i><i style="width:${100 - ptShare}%;background:#c9cedb"></i></div>
      <div class="hint">PT ${num(r.prime.PT.spots, 0)} spots · NPT ${num(r.prime.NPT.spots, 0)} spots</div></div>
  </div>

  <div class="grid-2" style="margin-top:16px">
    <div class="card card-pad">
      <h2>Negotiated package <span class="muted small" style="font-weight:400">(optional)</span></h2>
      <div class="form-grid">
        <label class="field">Package price (LKR)<input id="pkg" class="money-input" inputmode="decimal" placeholder="${money(t.net)}" value="${S.package_price ? S.package_price : ''}"></label>
        <label class="field">…or total discount off rate card (%)<input id="disc" class="money-input" inputmode="decimal" placeholder="${num(t.client_discount_pct)}" value="${t.package_price ? Number(t.total_discount_pct).toFixed(2) : ''}"></label>
      </div>
      <p class="small muted" style="margin:10px 0 0">${t.package_price
    ? `Package is <b>${pct(t.extra_discount_pct, 2)}</b> below the client’s own rates. The package is shared across programs in proportion to their client-rate value.`
    : 'Leave empty to quote at the client’s rates. Enter a package price to see the discount and the share for each program.'}</p>
    </div>
    <div class="card card-pad">
      <h2>Quotation details</h2>
      <table class="t"><tbody>
        <tr><td class="muted">Agency / client</td><td><b>${esc(client?.agency_name || '—')}</b> / <b>${esc(client?.name || '—')}</b></td></tr>
        <tr><td class="muted">Pricing</td><td>${esc(client?.pricing_label || 'Base rate card')}</td></tr>
        <tr><td class="muted">Title</td><td><input id="qtitle" class="input-sm" value="${esc(S.title)}"></td></tr>
        <tr><td class="muted">Source file</td><td>${esc(S.file_name || '—')}</td></tr>
      </tbody></table>
    </div>
  </div>

  <div class="card" style="margin-top:16px">
    <div class="tabs">
      ${[['program', 'By program'], ['lines', 'Schedule lines'], ['theme', 'By section'], ['category', 'By category']].map(([k, n]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}
    </div>
    <div class="table-wrap">${tabTable(r)}</div>
  </div>
  ${extrasCard()}
  <div class="sticky-foot">
    <button class="btn" id="back4">${icon.back} Matches</button>
    <span class="spacer"></span>
    <button class="btn" id="print">${icon.print} Print</button>
    <button class="btn btn-dark" id="export">${icon.download} Export Excel</button>
    <button class="btn btn-primary" id="save">${icon.save} ${S.quoteId ? 'Update quotation' : 'Save quotation'}</button>
  </div>`;
}

function tabTable(r) {
  const t = r.totals;
  if (tab === 'program') {
    const durs = r.durations;
    const cats = [...new Set(r.byProgram.map((p) => p.category))];
    const body = cats.map((cat) => {
      const ps = r.byProgram.filter((p) => p.category === cat);
      return `<tr class="group"><td colspan="${durs.length + 9}">${esc(cat)}</td></tr>` + ps.map((p) => `<tr>
        <td class="pname"><b>${esc(p.program_name)}</b><div class="small muted">${esc(p.rate_basis)}</div></td>
        <td>${p.is_prime ? '<span class="chip pt">PT</span>' : '<span class="chip npt">NPT</span>'}</td>
        ${durs.map((d) => `<td class="num">${p.durations[d] || ''}</td>`).join('')}
        <td class="num">${num(p.units)}</td>
        <td class="num">${money0(p.base_rate)}</td><td class="num">${money(p.client_rate)}</td>
        <td class="num">${money(p.gross)}</td><td class="num">${money(p.net)}</td>
        <td class="num"><b>${money(p.final)}</b></td><td class="num">${pct(t.final ? (p.final / t.final) * 100 : 0)}</td></tr>`).join('');
    }).join('');
    const durTotals = durs.map((d) => r.lines.filter((l) => Number(l.dur) === d).reduce((s, l) => s + Number(l.spots), 0));
    return `<table class="t"><thead><tr><th>Program</th><th></th>${durs.map((d) => `<th class="num">${d}s</th>`).join('')}
      <th class="num">30s eq.</th><th class="num">Base rate</th><th class="num">Client rate</th><th class="num">Rate card value</th><th class="num">Client value</th><th class="num">Final value</th><th class="num">Share</th></tr></thead>
      <tbody>${body}<tr class="total"><td>Total</td><td></td>${durTotals.map((n) => `<td class="num">${n}</td>`).join('')}<td class="num">${num(t.units)}</td><td></td><td></td>
      <td class="num">${money(t.gross)}</td><td class="num">${money(t.net)}</td><td class="num">${money(t.final)}</td><td class="num">100%</td></tr></tbody></table>`;
  }
  if (tab === 'lines') {
    return `<table class="t"><thead><tr><th>Row</th><th>Section</th><th>Agency line</th><th>Program</th><th class="num">Dur</th><th class="num">Spots</th><th class="num">30s eq.</th><th class="num">Client rate</th><th class="num">Rate card value</th><th class="num">Final value</th></tr></thead><tbody>
      ${r.lines.map((l) => `<tr><td>${l.row}</td><td class="small">${esc(l.theme)}</td><td>${esc(l.program)}<div class="small muted">${esc(l.day)} ${hhmm(l.start)}–${hhmm(l.end)}</div></td>
        <td>${esc(l.program_name)}${l.special ? ` <span class="chip info plain">${esc(l.special)}</span>` : ''}</td><td class="num">${l.dur}s</td><td class="num">${l.spots}</td><td class="num">${num(l.units)}</td>
        <td class="num">${money(l.client_rate)}</td><td class="num">${money(l.gross)}</td><td class="num"><b>${money(l.final)}</b></td></tr>`).join('')}
      <tr class="total"><td colspan="5">Total</td><td class="num">${t.spots}</td><td class="num">${num(t.units)}</td><td></td><td class="num">${money(t.gross)}</td><td class="num">${money(t.final)}</td></tr></tbody></table>`;
  }
  const list = tab === 'theme' ? r.byTheme : r.byCategory;
  return `<table class="t"><thead><tr><th>${tab === 'theme' ? 'Section' : 'Category'}</th><th class="num">Spots</th><th class="num">30s eq.</th><th class="num">Rate card value</th><th class="num">Client value</th><th class="num">Final value</th><th class="num">Share</th></tr></thead><tbody>
    ${list.map((g) => `<tr><td><b>${esc(g.name)}</b></td><td class="num">${g.spots}</td><td class="num">${num(g.units)}</td><td class="num">${money(g.gross)}</td><td class="num">${money(g.net)}</td><td class="num"><b>${money(g.final)}</b></td><td class="num">${pct(t.final ? (g.final / t.final) * 100 : 0)}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td class="num">${t.spots}</td><td class="num">${num(t.units)}</td><td class="num">${money(t.gross)}</td><td class="num">${money(t.net)}</td><td class="num">${money(t.final)}</td><td class="num">100%</td></tr></tbody></table>`;
}

function payload() {
  return { title: S.title, client_id: S.client_id || null, file_name: S.file_name, lines: S.lines, extras: S.extras, package_price: S.package_price, ref: S.ref };
}

function bind4() {
  const toMatch = el.querySelector('#toMatch');
  if (toMatch) toMatch.onclick = (e) => { e.preventDefault(); S.step = 3; S.filter = 'attention'; draw(); };
  el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; draw(); }));
  const recalc = debounce(async () => { if (await run(calculate) !== undefined) { saveDraft(); draw(); } }, 500);
  const parse = (v) => { const n = Number(String(v).replace(/[^0-9.]/g, '')); return v.trim() && Number.isFinite(n) && n > 0 ? n : null; };
  el.querySelector('#pkg').oninput = (e) => { S.package_price = parse(e.target.value); recalc(); };
  el.querySelector('#disc').oninput = (e) => {
    const d = parse(e.target.value);
    S.package_price = d !== null && d < 100 ? Math.round(S.result.totals.gross * (1 - d / 100) * 100) / 100 : null;
    recalc();
  };
  el.querySelector('#qtitle').oninput = (e) => { S.title = e.target.value; saveDraft(); header(); };
  el.querySelector('#back4').onclick = () => { S.step = 3; draw(); };
  el.querySelector('#print').onclick = () => window.print();
  el.querySelector('#export').onclick = (e) => run(async () => download(await api('/quotes/export', { method: 'POST', body: payload() })), e.currentTarget);
  el.querySelector('#save').onclick = (e) => run(async () => {
    if (!S.title.trim()) throw new Error('Please give the quotation a title');
    const res = S.quoteId
      ? await api(`/quotations/${S.quoteId}`, { method: 'PUT', body: payload() })
      : await api('/quotations', { method: 'POST', body: payload() });
    S.quoteId = res.id; S.ref = res.ref; S.savedFinal = S.result.totals.final;
    store.del(DRAFT);
    history.replaceState(null, '', `#/quote/${res.id}`);
    toast(`Saved as ${res.ref}`, 'ok');
    draw();
  }, e.currentTarget);
}
