// Agencies & clients. Clients exist once; an agency–client "deal" links them
// (rate card + agreed discount). Moving a client ends the old link (kept as
// history) and starts a new one, so old schedules keep their agency.
import { api, run, esc, num, setHeader, icon, modal, confirmBox, toast, formData, store } from '../ui.js';

let el;
let agencies = [];
let clients = [];
let cards = [];
let view = store.get('tvd_clients_view', 'agencies');
let selected = store.get('tvd_agency', null);
let filter = '';

export async function render(root) {
  el = root;
  setHeader('Agencies & clients', 'Who books through whom, at which rate card and agreed discount',
    `<button class="btn" id="addAgency">${icon.plus} Agency</button><button class="btn btn-primary" id="addClient">${icon.plus} Client</button>`);
  document.getElementById('addAgency').onclick = () => editAgency();
  document.getElementById('addClient').onclick = () => newClient(view === 'agencies' ? selected : null);
  await load();
}

async function load() {
  [agencies, clients, cards] = await Promise.all([api('/agencies'), api('/clients'), api('/rate-cards')]);
  if (!agencies.find((a) => a.id === selected)) selected = agencies[0]?.id ?? null;
  draw();
}

const cardName = (l) => esc(l.rate_card_name || 'Base rate card');
const cardOptions = (sel) => `<option value="">Base rate card (published rates)</option>${cards.map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

function draw() {
  el.innerHTML = `
  <div class="filters" style="margin-bottom:14px">
    <button data-v="agencies" class="${view === 'agencies' ? 'on' : ''}">By agency</button>
    <button data-v="clients" class="${view === 'clients' ? 'on' : ''}">All clients</button>
  </div>
  ${view === 'agencies' ? agencyView() : clientView()}`;
  el.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { view = b.dataset.v; store.set('tvd_clients_view', view); draw(); }));
  (view === 'agencies' ? bindAgency : bindClients)();
  bindDealButtons();
}

// ── By agency ──
function agencyView() {
  const a = agencies.find((x) => x.id === selected);
  const shown = agencies.filter((x) => !filter || x.name.toLowerCase().includes(filter.toLowerCase()));
  return `<div class="split">
    <div class="card">
      <div class="card-head"><div class="search" style="width:100%">${icon.search}<input id="f" placeholder="Find agency" value="${esc(filter)}"></div></div>
      <div class="list">${shown.map((x) => `<button data-a="${x.id}" class="${x.id === selected ? 'on' : ''}"><b>${esc(x.name)}</b><span class="count">${x.clients.length}</span></button>`).join('') || '<div class="empty">No agencies</div>'}</div>
    </div>
    <div class="card">${a ? `
      <div class="card-head">
        <div><h2>${esc(a.name)}</h2><div class="small muted">${[a.contact, a.email, a.phone].filter(Boolean).map(esc).join(' · ') || 'No contact details'}</div></div>
        <div class="row"><button class="btn btn-sm" id="editA">${icon.edit} Edit</button><button class="btn btn-sm btn-danger" id="delA">${icon.trash}</button>
          <button class="btn btn-sm btn-primary" id="linkC">${icon.plus} Add client</button></div>
      </div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Client</th><th>Rate card</th><th class="num">Agreed discount</th><th class="num">Schedules</th><th>Since</th><th></th></tr></thead><tbody>
        ${a.clients.map((l) => `<tr><td><b>${esc(l.client_name)}</b>${l.notes ? `<div class="small muted">${esc(l.notes)}</div>` : ''}</td><td>${cardName(l)}</td>
          <td class="num">${num(l.discount_pct)}%</td><td class="num">${l.schedule_count}</td><td class="small">${fmtDate(l.since)}</td>
          <td class="actions"><button class="btn btn-sm" data-deal="${l.id}">${icon.edit} Deal</button> <button class="btn btn-sm" data-move="${l.client_id}">Move…</button> <button class="btn btn-sm btn-danger" data-end="${l.id}" title="Remove from this agency">${icon.trash}</button></td></tr>`).join('')
          || '<tr><td colspan="6" class="empty">No clients linked to this agency yet.</td></tr>'}
      </tbody></table></div>
      ${a.past_clients.length ? `<div class="card-pad history"><b>Previous clients:</b> ${a.past_clients.map((l) => `${esc(l.client_name)} (until ${fmtDate(l.ended)})`).join(', ')}</div>` : ''}
    ` : '<div class="empty">Add your first agency to get started.</div>'}</div>
  </div>`;
}

function bindAgency() {
  const f = el.querySelector('#f');
  f.oninput = () => { filter = f.value; const p = f.selectionStart; draw(); const n = el.querySelector('#f'); n.focus(); n.setSelectionRange(p, p); };
  el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => { selected = Number(b.dataset.a); store.set('tvd_agency', selected); draw(); }));
  const a = agencies.find((x) => x.id === selected);
  if (!a) return;
  el.querySelector('#editA').onclick = () => editAgency(a);
  el.querySelector('#delA').onclick = async () => {
    if (!(await confirmBox('Delete agency', `Delete <b>${esc(a.name)}</b>? Its client links are removed; clients and saved schedules are kept.`))) return;
    await run(() => api(`/agencies/${a.id}`, { method: 'DELETE' }));
    toast('Agency deleted'); selected = null; load();
  };
  el.querySelector('#linkC').onclick = () => linkClient(a);
}

// ── All clients ──
function clientView() {
  const shown = clients.filter((c) => !filter || c.name.toLowerCase().includes(filter.toLowerCase()));
  return `<div class="card">
    <div class="card-head"><div class="search" style="width:min(320px,100%)">${icon.search}<input id="f" placeholder="Find client" value="${esc(filter)}"></div><span class="muted small">${shown.length} clients</span></div>
    <div class="table-wrap"><table class="t"><thead><tr><th>Client</th><th>Current agency</th><th>Rate card</th><th class="num">Agreed discount</th><th class="num">Schedules</th><th>History</th><th></th></tr></thead><tbody>
    ${shown.map((c) => {
    const cur = c.links.filter((l) => l.active);
    const past = c.links.filter((l) => !l.active);
    return `<tr><td><b>${esc(c.name)}</b>${c.notes ? `<div class="small muted">${esc(c.notes)}</div>` : ''}</td>
        <td>${cur.map((l) => esc(l.agency_name)).join('<br>') || '<span class="chip warn plain">No agency</span>'}</td>
        <td>${cur.map(cardName).join('<br>')}</td>
        <td class="num">${cur.map((l) => `${num(l.discount_pct)}%`).join('<br>')}</td>
        <td class="num">${c.schedule_count}</td>
        <td class="history">${past.map((l) => `${esc(l.agency_name)} → ${fmtDate(l.ended)}`).join('<br>') || '-'}</td>
        <td class="actions">${cur[0] ? `<button class="btn btn-sm" data-deal="${cur[0].id}">${icon.edit} Deal</button> ` : ''}<button class="btn btn-sm" data-move="${c.id}">${cur.length ? 'Move…' : 'Assign…'}</button>
          <button class="btn btn-sm" data-ec="${c.id}" title="Rename">${icon.edit}</button> <button class="btn btn-sm btn-danger" data-dc="${c.id}">${icon.trash}</button></td></tr>`;
  }).join('') || '<tr><td colspan="7" class="empty">No clients yet.</td></tr>'}
    </tbody></table></div></div>`;
}

function bindClients() {
  const f = el.querySelector('#f');
  f.oninput = () => { filter = f.value; const p = f.selectionStart; draw(); const n = el.querySelector('#f'); n.focus(); n.setSelectionRange(p, p); };
  el.querySelectorAll('[data-ec]').forEach((b) => b.addEventListener('click', () => editClient(clients.find((c) => c.id === Number(b.dataset.ec)))));
  el.querySelectorAll('[data-dc]').forEach((b) => b.addEventListener('click', async () => {
    const c = clients.find((x) => x.id === Number(b.dataset.dc));
    if (!(await confirmBox('Delete client', `Delete <b>${esc(c.name)}</b>? Saved schedules are kept.`))) return;
    await run(() => api(`/clients/${c.id}`, { method: 'DELETE' }));
    toast('Client deleted'); load();
  }));
}

function bindDealButtons() {
  const allLinks = clients.flatMap((c) => c.links);
  el.querySelectorAll('[data-deal]').forEach((b) => b.addEventListener('click', () => editDeal(allLinks.find((l) => l.id === Number(b.dataset.deal)))));
  el.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', () => moveClient(clients.find((c) => c.id === Number(b.dataset.move)))));
  el.querySelectorAll('[data-end]').forEach((b) => b.addEventListener('click', async () => {
    const l = allLinks.find((x) => x.id === Number(b.dataset.end));
    if (!(await confirmBox('Remove from agency', `Remove <b>${esc(l.client_name)}</b> from <b>${esc(l.agency_name)}</b>? It stays in the history and its schedules are kept.`, 'Remove'))) return;
    await run(() => api(`/agency-clients/${l.id}`, { method: 'DELETE' }));
    toast('Client removed from agency'); load();
  }));
}

// ── Modals ──
const dealFields = (cardId, disc, notes) => `
  <label class="field">Rate card<select name="rate_card_id">${cardOptions(cardId)}</select><span class="help">Custom cards are managed under <a href="#/rate-cards">Client rate cards</a>.</span></label>
  <label class="field">Agreed discount (%)<input name="discount_pct" inputmode="decimal" value="${disc ?? 0}"><span class="help">Pre-filled as the Option 02 discount on new schedules.</span></label>
  <label class="field full">Deal notes<input name="deal_notes" value="${esc(notes || '')}" placeholder="Validity, reference…"></label>`;

async function editAgency(a = {}) {
  const saved = await modal({
    title: a.id ? 'Edit agency' : 'Add agency',
    body: `<div class="form-grid">
      <label class="field full">Agency name<input name="name" value="${esc(a.name || '')}"></label>
      <label class="field">Contact person<input name="contact" value="${esc(a.contact || '')}"></label>
      <label class="field">Phone<input name="phone" value="${esc(a.phone || '')}"></label>
      <label class="field full">Email<input name="email" type="email" value="${esc(a.email || '')}"></label>
      <label class="field full">Notes<textarea name="notes">${esc(a.notes || '')}</textarea></label></div>`,
    onOk: (b) => api(a.id ? `/agencies/${a.id}` : '/agencies', { method: a.id ? 'PUT' : 'POST', body: formData(b) }),
  });
  if (saved) { selected = saved.id; store.set('tvd_agency', selected); view = 'agencies'; toast('Agency saved', 'ok'); load(); }
}

async function newClient(agencyId) {
  if (!agencies.length) return toast('Add an agency first', 'error');
  const saved = await modal({
    title: 'Add client',
    body: `<div class="form-grid">
      <label class="field">Client name<input name="name" placeholder="e.g. Dialog Axiata"></label>
      <label class="field">Agency<select name="agency_id">${agencies.map((a) => `<option value="${a.id}" ${a.id === agencyId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      ${dealFields(null, 0, '')}
      <label class="field full">Client notes<input name="notes"></label></div>`,
    onOk: (b) => api('/clients', { method: 'POST', body: formData(b) }),
  });
  if (saved) { toast('Client added', 'ok'); load(); }
}

async function linkClient(a) {
  const linked = new Set(a.clients.map((l) => l.client_id));
  const free = clients.filter((c) => !linked.has(c.id));
  const saved = await modal({
    title: `Add client to ${a.name}`,
    body: `<div class="form-grid">
      <label class="field full">Client<select name="client_id"><option value="new">＋ New client…</option>
        ${free.map((c) => `<option value="${c.id}">${esc(c.name)}${c.links.some((l) => l.active) ? ` (now with ${esc(c.links.find((l) => l.active).agency_name)})` : ''}</option>`).join('')}</select></label>
      <label class="field full" data-newname>New client name<input name="name"></label>
      ${dealFields(null, 0, '')}</div>`,
    onOpen: (b) => {
      const sel = b.querySelector('[name=client_id]');
      const sync = () => b.querySelector('[data-newname]').classList.toggle('hidden', sel.value !== 'new');
      sel.onchange = sync; sync();
    },
    onOk: (b) => {
      const d = formData(b);
      if (d.client_id === 'new') return api('/clients', { method: 'POST', body: { ...d, agency_id: a.id } });
      return api('/agency-clients', { method: 'POST', body: { ...d, agency_id: a.id } });
    },
  });
  if (saved) { toast('Client linked', 'ok'); load(); }
}

async function editDeal(l) {
  const saved = await modal({
    title: `${l.client_name} via ${l.agency_name}`,
    body: `<div class="form-grid">${dealFields(l.rate_card_id, l.discount_pct, l.notes)}</div>`,
    onOk: (b) => api(`/agency-clients/${l.id}`, { method: 'PUT', body: formData(b) }),
  });
  if (saved) { toast('Deal updated', 'ok'); load(); }
}

async function moveClient(c) {
  const cur = c.links.find((l) => l.active);
  const saved = await modal({
    title: cur ? `Move ${c.name} to another agency` : `Assign ${c.name} to an agency`,
    body: `<div class="form-grid">
      ${cur ? `<div class="note full">Currently with <b>${esc(cur.agency_name)}</b> since ${fmtDate(cur.since)}. That link will end today and stay in the history; existing schedules keep ${esc(cur.agency_name)}.</div>` : ''}
      <label class="field full">New agency<select name="agency_id">${agencies.filter((a) => !cur || a.id !== cur.agency_id).map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label>
      ${dealFields(cur?.rate_card_id ?? null, cur?.discount_pct ?? 0, '')}</div>`,
    okText: cur ? 'Move client' : 'Assign',
    onOk: (b) => api(`/clients/${c.id}/move`, { method: 'POST', body: formData(b) }),
  });
  if (saved) { toast(`${c.name} moved`, 'ok'); selected = saved.agency_id; store.set('tvd_agency', selected); load(); }
}

async function editClient(c) {
  const saved = await modal({
    title: 'Edit client',
    body: `<div class="form-grid"><label class="field full">Client name<input name="name" value="${esc(c.name)}"></label>
      <label class="field full">Notes<input name="notes" value="${esc(c.notes || '')}"></label></div>`,
    onOk: (b) => api(`/clients/${c.id}`, { method: 'PUT', body: formData(b) }),
  });
  if (saved) { toast('Client saved', 'ok'); load(); }
}
