// Agencies (left) and their clients (right). Each client has its own pricing:
// base rate card, a flat discount, or a custom rate card.
import { api, run, esc, num, setHeader, icon, modal, confirmBox, toast, formData, store } from '../ui.js';

let el;
let agencies = [];
let cards = [];
let selected = null;
let filter = '';

export async function render(root) {
  el = root;
  setHeader('Agencies & clients', 'Each agency has many clients; each client can have its own discount or rate card',
    `<button class="btn btn-primary" id="addAgency">${icon.plus} Add agency</button>`);
  document.getElementById('addAgency').onclick = () => editAgency();
  await load();
}

async function load() {
  [agencies, cards] = await Promise.all([api('/agencies'), api('/rate-cards')]);
  selected = selected ?? store.get('tvd_agency') ?? agencies[0]?.id ?? null;
  if (!agencies.find((a) => a.id === selected)) selected = agencies[0]?.id ?? null;
  draw();
}

function pricing(c) {
  if (c.pricing_type === 'discount') return `<span class="chip warn plain">${num(c.discount_pct)}% discount</span>`;
  if (c.pricing_type === 'rate_card') return c.rate_card_name ? `<span class="chip info plain">Card: ${esc(c.rate_card_name)}</span>` : '<span class="chip bad plain">Card missing</span>';
  return '<span class="chip plain">Base rates</span>';
}

function draw() {
  const a = agencies.find((x) => x.id === selected);
  const shown = agencies.filter((x) => !filter || x.name.toLowerCase().includes(filter.toLowerCase()) ||
    x.clients.some((c) => c.name.toLowerCase().includes(filter.toLowerCase())));
  el.innerHTML = `
  <div class="split">
    <div class="card">
      <div class="card-head"><div class="search" style="width:100%">${icon.search}<input id="f" placeholder="Find agency or client" value="${esc(filter)}"></div></div>
      <div class="list">${shown.map((x) => `<button data-a="${x.id}" class="${x.id === selected ? 'on' : ''}"><b>${esc(x.name)}</b><span class="count">${x.clients.length}</span></button>`).join('') || '<div class="empty">No agencies</div>'}</div>
    </div>
    <div class="card">
      ${a ? `
      <div class="card-head">
        <div><h2>${esc(a.name)}</h2><div class="small muted">${[a.contact, a.email, a.phone].filter(Boolean).map(esc).join(' · ') || 'No contact details'}</div></div>
        <div class="row">
          <button class="btn btn-sm" id="editA">${icon.edit} Edit agency</button>
          <button class="btn btn-sm btn-danger" id="delA">${icon.trash}</button>
          <button class="btn btn-sm btn-primary" id="addC">${icon.plus} Add client</button>
        </div>
      </div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Client</th><th>Pricing</th><th class="num">Quotations</th><th></th></tr></thead><tbody>
        ${a.clients.map((c) => `<tr><td><b>${esc(c.name)}</b>${c.notes ? `<div class="small muted">${esc(c.notes)}</div>` : ''}</td><td>${pricing(c)}</td>
          <td class="num">${c.quote_count}</td>
          <td class="actions"><button class="btn btn-sm" data-c="${c.id}">${icon.edit} Edit</button> <button class="btn btn-sm btn-danger" data-dc="${c.id}">${icon.trash}</button></td></tr>`).join('')
          || '<tr><td colspan="4" class="empty">No clients yet for this agency.</td></tr>'}
      </tbody></table></div>` : '<div class="empty">Add your first agency to get started.</div>'}
    </div>
  </div>`;

  el.querySelector('#f').oninput = (e) => { filter = e.target.value; const pos = e.target.selectionStart; draw(); const f = el.querySelector('#f'); f.focus(); f.setSelectionRange(pos, pos); };
  el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => { selected = Number(b.dataset.a); store.set('tvd_agency', selected); draw(); }));
  if (!a) return;
  el.querySelector('#editA').onclick = () => editAgency(a);
  el.querySelector('#delA').onclick = async () => {
    if (!(await confirmBox('Delete agency', `Delete <b>${esc(a.name)}</b> and its ${a.clients.length} client(s)? Saved quotations are kept.`))) return;
    await run(() => api(`/agencies/${a.id}`, { method: 'DELETE' }));
    selected = null; toast('Agency deleted'); load();
  };
  el.querySelector('#addC').onclick = () => editClient({ agency_id: a.id, pricing_type: 'base' });
  el.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => editClient(a.clients.find((c) => c.id === Number(b.dataset.c)))));
  el.querySelectorAll('[data-dc]').forEach((b) => b.addEventListener('click', async () => {
    const c = a.clients.find((x) => x.id === Number(b.dataset.dc));
    if (!(await confirmBox('Delete client', `Delete <b>${esc(c.name)}</b>? Saved quotations are kept.`))) return;
    await run(() => api(`/clients/${c.id}`, { method: 'DELETE' }));
    toast('Client deleted'); load();
  }));
}

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
  if (saved) { selected = saved.id; store.set('tvd_agency', selected); toast('Agency saved', 'ok'); load(); }
}

async function editClient(c) {
  const cardOptions = cards.map((k) => `<option value="${k.id}" ${k.id === c.rate_card_id ? 'selected' : ''}>${esc(k.name)}${Number(k.default_discount_pct) ? ` (default −${num(k.default_discount_pct)}%)` : ''}</option>`).join('');
  const saved = await modal({
    title: c.id ? `Edit client — ${c.name}` : 'Add client',
    body: `<div class="stack">
      <div class="form-grid">
        <label class="field">Client name<input name="name" value="${esc(c.name || '')}"></label>
        <label class="field">Agency<select name="agency_id">${agencies.map((a) => `<option value="${a.id}" ${a.id === c.agency_id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      </div>
      <div><div class="field" style="margin-bottom:8px">How is this client priced?</div>
      <div class="choice">
        <label><input type="radio" name="pricing_type" value="base" ${c.pricing_type === 'base' ? 'checked' : ''}><span>Base rate card<small>Published TV Derana rates</small></span></label>
        <label><input type="radio" name="pricing_type" value="discount" ${c.pricing_type === 'discount' ? 'checked' : ''}><span>Flat discount<small>Same % off every program</small></span></label>
        <label><input type="radio" name="pricing_type" value="rate_card" ${c.pricing_type === 'rate_card' ? 'checked' : ''}><span>Custom rate card<small>Own rate per program slot</small></span></label>
      </div></div>
      <label class="field" data-show="discount">Discount off the base rate card (%)<input name="discount_pct" inputmode="decimal" value="${c.discount_pct ?? ''}" placeholder="e.g. 30"></label>
      <div data-show="rate_card">
        <label class="field">Rate card
          <select name="rate_card_id"><option value="">Select a rate card…</option>${cardOptions}<option value="new">＋ Create a new card for this client…</option></select>
          <span class="help">Cards can be shared by several clients. Edit them under <a href="#/rate-cards">Client rate cards</a>.</span></label>
      </div>
      <label class="field">Notes<textarea name="notes" placeholder="Deal terms, validity, contact…">${esc(c.notes || '')}</textarea></label>
    </div>`,
    onOpen: (b) => {
      const sync = () => {
        const t = b.querySelector('[name=pricing_type]:checked').value;
        b.querySelectorAll('[data-show]').forEach((x) => x.classList.toggle('hidden', x.dataset.show !== t));
      };
      b.querySelectorAll('[name=pricing_type]').forEach((r) => r.addEventListener('change', sync));
      sync();
    },
    onOk: async (b) => {
      const d = formData(b);
      if (d.pricing_type === 'rate_card' && d.rate_card_id === 'new') {
        const name = `${d.name || 'Client'} rate card`;
        const card = await api('/rate-cards', { method: 'POST', body: { name, default_discount_pct: 0 } });
        d.rate_card_id = card.id;
        d._newCard = card.id;
      }
      const res = await api(c.id ? `/clients/${c.id}` : '/clients', { method: c.id ? 'PUT' : 'POST', body: d });
      return { ...res, _newCard: d._newCard };
    },
  });
  if (saved) {
    toast('Client saved', 'ok');
    if (saved._newCard) { location.hash = `#/rate-cards/${saved._newCard}`; return; }
    selected = saved.agency_id; load();
  }
}
