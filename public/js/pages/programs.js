// Programs = what airs when (days + time belt) and which rate slot prices it.
// The matcher uses names, aliases, days and time belts from here.
import { api, run, esc, money0, dbTime, hhmm, setHeader, icon, modal, confirmBox, toast, formData, store } from '../ui.js';

let el;
let programs = [];
let cats = [];
let view = store.get('tvd_prog_view', 'list');
let q = '';
let slotFilter = '';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export async function render(root) {
  el = root;
  setHeader('Programs & time belts', 'What airs when, and which rate slot prices it',
    `<button class="btn" id="test">${icon.search} Test matching</button><button class="btn btn-primary" id="add">${icon.plus} Add program</button>`);
  slotFilter = sessionStorage.getItem('tvd_slot_filter') || '';
  sessionStorage.removeItem('tvd_slot_filter');
  await load();
  document.getElementById('add').onclick = () => edit({ is_prime: false, active: true });
  document.getElementById('test').onclick = testMatch;
}

async function load() {
  [programs, cats] = await Promise.all([api('/programs'), api('/ratecard')]);
  draw();
}

function shown() {
  const s = q.toLowerCase();
  return programs.filter((p) => (!slotFilter || p.slot_id === Number(slotFilter)) &&
    (!s || p.name.toLowerCase().includes(s) || p.slot_name.toLowerCase().includes(s) || p.aliases.some((a) => a.toLowerCase().includes(s))));
}

function draw() {
  const list = shown();
  el.innerHTML = `
  <div class="card">
    <div class="card-head">
      <div class="row" style="flex:1">
        <div class="search" style="width:min(300px,100%)">${icon.search}<input id="q" placeholder="Search name, alias or slot" value="${esc(q)}"></div>
        <select id="slotF" style="width:auto;max-width:320px"><option value="">All rate slots</option>
          ${cats.map((c) => `<optgroup label="${esc(c.name)}">${c.slots.map((s) => `<option value="${s.id}" ${String(s.id) === String(slotFilter) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</optgroup>`).join('')}</select>
        <span class="muted small">${list.length} of ${programs.length}</span>
      </div>
      <div class="filters"><button data-v="list" class="${view === 'list' ? 'on' : ''}">List</button><button data-v="week" class="${view === 'week' ? 'on' : ''}">Week view</button></div>
    </div>
    <div id="body">${view === 'list' ? table(list) : week(list)}</div>
  </div>`;
  const qi = el.querySelector('#q');
  qi.oninput = () => { q = qi.value; const pos = qi.selectionStart; draw(); const n = el.querySelector('#q'); n.focus(); n.setSelectionRange(pos, pos); };
  el.querySelector('#slotF').onchange = (e) => { slotFilter = e.target.value; draw(); };
  el.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { view = b.dataset.v; store.set('tvd_prog_view', view); draw(); }));
  el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => edit(programs.find((p) => p.id === Number(b.dataset.edit)))));
  el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const p = programs.find((x) => x.id === Number(b.dataset.del));
    if (!(await confirmBox('Delete program', `Delete <b>${esc(p.name)}</b> (${esc(p.day_pattern)} ${dbTime(p.start_time)}–${dbTime(p.end_time)})?`))) return;
    await run(() => api(`/programs/${p.id}`, { method: 'DELETE' }));
    toast('Program deleted'); load();
  }));
}

function table(list) {
  if (!list.length) return '<div class="empty">No programs found.</div>';
  return `<div class="table-wrap"><table class="t"><thead><tr><th>Program</th><th>Days</th><th>Time belt</th><th>Rate slot</th><th class="num">Rate</th><th></th><th></th></tr></thead><tbody>
    ${list.map((p) => `<tr class="${p.active ? '' : 'dim'}">
      <td><b>${esc(p.name)}</b> ${p.is_generic ? '<span class="chip plain">Time belt</span>' : ''} ${p.active ? '' : '<span class="chip bad plain">Inactive</span>'}
        <div>${p.aliases.map((a) => `<span class="alias">${esc(a)}</span>`).join('')}</div>
        ${p.notes ? `<div class="small muted">${esc(p.notes)}</div>` : ''}</td>
      <td>${esc(p.day_pattern)}<div class="small muted">${esc(p.days_label)}</div></td>
      <td class="nowrap">${dbTime(p.start_time)} – ${dbTime(p.end_time)}</td>
      <td>${esc(p.slot_name)}<div class="small muted">${esc(p.category_name)}</div></td>
      <td class="num">${money0(p.rate_30s)}</td>
      <td>${p.is_prime ? '<span class="chip pt">PT</span>' : '<span class="chip npt">NPT</span>'}</td>
      <td class="actions"><button class="btn btn-sm" data-edit="${p.id}">${icon.edit}</button> <button class="btn btn-sm btn-danger" data-del="${p.id}">${icon.trash}</button></td></tr>`).join('')}
  </tbody></table></div>`;
}

// Weekly grid: one lane per weekday, blocks positioned by time belt.
function week(list) {
  const dayIdx = (p) => {
    const s = String(p.days_label);
    if (s.startsWith('Daily')) return [0, 1, 2, 3, 4, 5, 6];
    if (s.startsWith('Mon–Fri')) return [0, 1, 2, 3, 4];
    if (s.startsWith('Sat–Sun')) return [5, 6];
    return DAYS.map((d, i) => (s.includes(d) ? i : -1)).filter((i) => i >= 0);
  };
  const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  const lanes = DAYS.map((d, i) => {
    const blocks = list.filter((p) => p.active && dayIdx(p).includes(i)).map((p) => {
      const s = toMin(p.start_time);
      let e = toMin(p.end_time);
      if (e <= s) e = 1440;
      return `<div class="tl-block ${p.is_prime ? 'pt' : ''} ${p.is_generic ? 'generic' : ''}" data-edit="${p.id}"
        style="left:${(s / 1440) * 100}%;width:${((e - s) / 1440) * 100}%"
        title="${esc(`${p.name} · ${hhmm(s)}–${hhmm(e)} · ${p.slot_name} · ${money0(p.rate_30s)}`)}">${esc(p.name)}<br><span class="muted">${hhmm(s)}</span></div>`;
    }).join('');
    return `<div class="tl-row"><div class="day">${d}</div><div class="lane">${blocks}</div></div>`;
  }).join('');
  const poya = list.filter((p) => /Poya/.test(p.days_label));
  return `<div class="card-pad timeline"><div class="tl-inner">
      <div class="tl-hours"><div></div><div class="scale">${Array.from({ length: 13 }, (_, i) => `<span style="left:${(i * 2 / 24) * 100}%">${String(i * 2).padStart(2, '0')}:00</span>`).join('')}</div></div>
      ${lanes}</div>
    <div class="legend"><span style="--c:#ffe3e7">Prime time</span><span style="--c:#e9ecf3">Non-prime</span><span style="--c:#eceef4">Generic time belt</span>${poya.length ? `<span style="--c:transparent">Poya-only programs: ${poya.map((p) => esc(p.name)).join(', ')}</span>` : ''}</div>
    <p class="small muted">Click a block to edit it. Overlapping blocks usually mean a generic time belt under a named show — named shows always win when the name matches.</p></div>`;
}

async function edit(p) {
  const saved = await modal({
    title: p.id ? `Edit — ${p.name}` : 'Add program',
    wide: true,
    body: `<div class="form-grid">
      <label class="field">Program name<input name="name" value="${esc(p.name || '')}"></label>
      <label class="field">Rate slot<select name="slot_id">${cats.map((c) => `<optgroup label="${esc(c.name)}">${c.slots.map((s) => `<option value="${s.id}" ${s.id === p.slot_id ? 'selected' : ''}>${esc(s.name)} — ${money0(s.rate_30s)}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label class="field">Day pattern<input name="day_pattern" value="${esc(p.day_pattern || '')}" placeholder="Wkdays, Wkends, Daily, Sat, Tue-Fri, Poya Days">
        <span class="help" id="dayHelp">${esc(p.days_label || '')}</span></label>
      <div class="form-grid" style="gap:10px">
        <label class="field">Start<input name="start_time" type="time" value="${dbTime(p.start_time)}"></label>
        <label class="field">End<input name="end_time" type="time" value="${dbTime(p.end_time)}"><span class="help">End before start = runs past midnight</span></label>
      </div>
      <label class="field full">Other names agencies use (one per line)
        <textarea name="aliases" placeholder="e.g. DHEVANI INIMA">${esc((p.aliases || []).join('\n'))}</textarea>
        <span class="help">Spelling variants are matched automatically; add aliases for names that look completely different.</span></label>
      <div class="full row" style="gap:22px">
        <label class="check"><input type="checkbox" name="is_prime" ${p.is_prime ? 'checked' : ''}> Prime time (PT)</label>
        <label class="check" title="A catch-all belt (e.g. day time 8am–6pm) used when a line names no known show"><input type="checkbox" name="is_generic" ${p.is_generic ? 'checked' : ''}> Generic time belt</label>
        <label class="check"><input type="checkbox" name="active" ${p.active !== false ? 'checked' : ''}> Active</label>
      </div>
      <label class="field full">Notes<input name="notes" value="${esc(p.notes || '')}"></label>
    </div>`,
    onOpen: (b) => {
      const dp = b.querySelector('[name=day_pattern]');
      const help = b.querySelector('#dayHelp');
      const days = { MON: 0, TUE: 1, WED: 2, THU: 3, FRI: 4, SAT: 5, SUN: 6 };
      dp.addEventListener('input', () => {
        const s = dp.value.toUpperCase();
        if (/DAILY|EVERY/.test(s)) help.textContent = 'Every day';
        else if (/WK ?DAYS?|WEEK ?DAYS?/.test(s)) help.textContent = 'Mon–Fri';
        else if (/WK ?ENDS?|WEEK ?ENDS?/.test(s)) help.textContent = 'Sat–Sun';
        else if (/POYA/.test(s)) help.textContent = 'Poya days';
        else help.textContent = Object.keys(days).filter((d) => s.includes(d)).join(', ') || 'Not recognised yet';
      });
    },
    onOk: (b) => {
      const d = formData(b);
      d.aliases = d.aliases.split('\n').map((s) => s.trim()).filter(Boolean);
      return api(p.id ? `/programs/${p.id}` : '/programs', { method: p.id ? 'PUT' : 'POST', body: d });
    },
  });
  if (saved) { toast('Program saved', 'ok'); load(); }
}

async function testMatch() {
  await modal({
    title: 'Test matching',
    wide: true,
    okText: '',
    cancelText: 'Close',
    body: `<p class="muted" style="margin-top:0">Type a line as it appears in an agency schedule to see which program the system picks and why.</p>
      <div class="form-grid">
        <label class="field">Program / item<input id="tp" value="DHEVANI INIMA"></label>
        <label class="field">Section heading (optional)<input id="tt" placeholder="e.g. DREAM STAR"></label>
        <label class="field">Day<input id="td" value="MON TO FRI"></label>
        <div class="form-grid" style="gap:10px"><label class="field">Start<input id="ts" type="time" value="20:30"></label><label class="field">End<input id="te" type="time" value="21:00"></label></div>
      </div>
      <div class="row" style="margin-top:12px"><button class="btn btn-primary" id="go">Find match</button></div>
      <div id="tr" style="margin-top:14px"></div>`,
    onOpen: (b) => {
      const go = async () => {
        const res = await run(() => api('/match-test', { method: 'POST', body: {
          program: b.querySelector('#tp').value, theme: b.querySelector('#tt').value, day: b.querySelector('#td').value,
          start: b.querySelector('#ts').value, end: b.querySelector('#te').value } }));
        if (!res) return;
        const byId = new Map(programs.map((p) => [p.id, p]));
        b.querySelector('#tr').innerHTML = `<div class="note ${res.status === 'matched' ? '' : 'warn'}"><b>${esc(res.status.toUpperCase())}</b> — ${esc(res.reason)}</div>
          <table class="t" style="margin-top:10px"><thead><tr><th>Candidate</th><th class="num">Name</th><th class="num">Time</th><th class="num">Day</th><th class="num">Total</th></tr></thead><tbody>
          ${res.candidates.map((c, i) => { const p = byId.get(c.program_id); return `<tr ${i === 0 ? 'style="font-weight:700"' : ''}><td>${esc(p?.name)} <span class="small muted">${esc(p?.day_pattern)} ${dbTime(p?.start_time)}–${dbTime(p?.end_time)} · via ${esc(c.basis)}</span></td>
            <td class="num">${Math.round(c.name * 100)}%</td><td class="num">${Math.round(c.time * 100)}%</td><td class="num">${Math.round(c.day * 100)}%</td><td class="num">${Math.round(c.total * 100)}%</td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">No program airs on those days/times.</td></tr>'}
          </tbody></table>`;
      };
      b.querySelector('#go').onclick = go;
      go();
    },
  });
}
