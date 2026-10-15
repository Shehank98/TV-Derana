// Agencies & clients: pick an agency on the left, its clients appear as cards.
// A client books through one agency at a time (rate card + agreed discount).
// Moving a client ends the old link (kept as history) and starts a new one.
import { api, run, esc, num, setHeader, icon, modal, confirmBox, toast, formData, store, initials, tint, monthLabel } from '../ui.js';

let el;
let agencies = [];
let clients = [];
let cards = [];
let selected = store.get('tvd_agency', null);
let q = '';
let panel = null; // { type: 'move' | 'deal' | 'add', link? }

export async function render(root) {
  el = root;
  panel = null;
  setHeader('Agencies & clients', 'Each client books through one agency at a time, with its own rate card and agreed discount.',
    `<button class="btn" id="addAgency">${icon.plus} Agency</button><button class="btn btn-primary" id="addClient">${icon.plus} Client</button>`);
  document.getElementById('addAgency').onclick = () => editAgency();
  document.getElementById('addClient').onclick = () => { if (selected) { panel = { type: 'add' }; draw(); } else editAgency(); };
  await load();
}

async function load() {
  [agencies, clients, cards] = await Promise.all([api('/agencies'), api('/clients'), api('/rate-cards')]);
  if (selected !== 'none' && !agencies.find((a) => a.id === selected)) selected = agencies[0]?.id ?? null;
  draw();
}

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '');
const cardOptions = (sel) => `<option value="">Base rate card (published rates)</option>${cards.map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}`;
const orphans = () => clients.filter((c) => !c.links.some((l) => l.active));

function draw() {
  const s = q.trim().toLowerCase();
  const shown = agencies.filter((a) => !s || a.name.toLowerCase().includes(s) || a.clients.some((c) => c.client_name.toLowerCase().includes(s)));
  const a = agencies.find((x) => x.id === selected);
  const lone = orphans();
  el.innerHTML = `
  <div class="dir">
    <aside class="card agencies">
      <div style="padding:14px"><label class="search"><span class="sr">Find agency or client</span>${icon.search}<input type="search" id="q" placeholder="Find agency or client" value="${esc(q)}"></label></div>
      <div class="list">
        ${shown.map((x) => {
    const [bg, ink] = tint(x.name);
    const hit = s && !x.name.toLowerCase().includes(s) ? x.clients.find((c) => c.client_name.toLowerCase().includes(s)) : null;
    return `<button data-a="${x.id}" class="${x.id === selected ? 'on' : ''}"><span class="mono-tile" style="background:${bg};color:${ink}">${esc(initials(x.name))}</span>
            <span style="min-width:0"><span style="display:block">${esc(x.name)}</span>${hit ? `<span class="small muted">has ${esc(hit.client_name)}</span>` : ''}</span><span class="count">${x.clients.length}</span></button>`;
  }).join('') || '<div class="empty">No match</div>'}
        ${lone.length ? `<button data-a="none" class="${selected === 'none' ? 'on' : ''}"><span class="mono-tile" style="background:var(--amber);color:var(--amber-ink)">?</span><span>Clients with no agency</span><span class="count">${lone.length}</span></button>` : ''}
      </div>
    </aside>
    <section class="detail">${selected === 'none' ? orphanView(lone) : a ? agencyView(a) : '<div class="empty-hero"><h2>No agencies yet</h2><p>Add the first agency to start.</p></div>'}</section>
    ${panel ? `<div class="panel-scrim" id="pScrim"></div><aside class="panel" aria-label="Client details">${panelView(a)}</aside>` : ''}
  </div>`;
  bind(a);
}

function agencyView(a) {
  return `
    <div class="card card-pad rise row" style="justify-content:space-between;gap:16px">
      <div><h2 style="margin:0;font-size:22px">${esc(a.name)}</h2>
        <div class="small muted" style="margin-top:4px">${[a.contact, a.phone, a.email].filter(Boolean).map(esc).join(' · ') || 'No contact details yet'}</div></div>
      <div class="row" style="gap:8px">
        <button class="btn btn-sm" id="editA">${icon.edit} Edit agency</button>
        <button class="btn btn-sm btn-danger btn-icon" id="delA" aria-label="Delete agency">${icon.trash}</button>
        <button class="btn btn-sm btn-dark" id="addHere">${icon.plus} Add client here</button>
      </div>
    </div>
    <div class="ccards">
      ${a.clients.map((l, i) => `
        <article class="ccard ${panel?.link?.id === l.id ? 'sel' : ''}" style="animation-delay:${i * 60}ms">
          <div class="row" style="gap:12px;flex-wrap:nowrap">
            <span class="avatar" style="width:46px;height:46px">${esc(initials(l.client_name))}</span>
            <div style="min-width:0;flex:1"><b class="display" style="font-size:17px">${esc(l.client_name)}</b>
              <div class="small muted">With ${esc(a.name)} since ${fmtDate(l.since)} · ${l.schedule_count} schedule${l.schedule_count === 1 ? '' : 's'}${l.last_month ? ` · last ${monthLabel(l.last_month)}` : ''}</div></div>
            <button class="btn btn-ghost btn-icon btn-sm" data-end="${l.id}" aria-label="Remove ${esc(l.client_name)} from ${esc(a.name)}" title="Remove from this agency">${icon.trash}</button>
          </div>
          <dl><div><dt>Rate card</dt><dd>${esc(l.rate_card_name || 'Base rate card')}</dd></div><div class="amber"><dt>Agreed discount</dt><dd>${num(l.discount_pct)}%</dd></div></dl>
          <div class="acts"><button class="btn btn-sm" data-deal="${l.id}">Edit deal</button><button class="btn btn-sm" data-move="${l.id}">Move to another agency</button></div>
        </article>`).join('')}
      <button class="tile-add" id="addCard"><span>${icon.plus}</span>Add a client to ${esc(a.name)}</button>
    </div>
    <div class="history"><b style="color:var(--ink)">History:</b> ${a.past_clients.length
    ? a.past_clients.map((l) => `${esc(l.client_name)} (left ${fmtDate(l.ended)})`).join(', ')
    : 'clients that move away stay listed here with the date they left. Their old schedules keep this agency.'}</div>`;
}

function orphanView(list) {
  return `<div class="card card-pad rise"><h2 style="margin:0;font-size:22px">Clients with no agency</h2><div class="small muted" style="margin-top:4px">Assign them to an agency so their schedules can be started.</div></div>
    <div class="ccards">${list.map((c, i) => `
      <article class="ccard" style="animation-delay:${i * 60}ms">
        <div class="row" style="gap:12px;flex-wrap:nowrap"><span class="avatar" style="width:46px;height:46px">${esc(initials(c.name))}</span>
          <div style="flex:1"><b class="display" style="font-size:17px">${esc(c.name)}</b><div class="small muted">${c.schedule_count} schedules</div></div>
          <button class="btn btn-ghost btn-icon btn-sm" data-delc="${c.id}" aria-label="Delete ${esc(c.name)}">${icon.trash}</button></div>
        <div class="acts"><button class="btn btn-sm btn-primary" data-assign="${c.id}">Assign to an agency</button></div>
      </article>`).join('')}</div>`;
}

function panelView(a) {
  const close = '<button class="btn btn-outline-light btn-sm" id="pClose">Cancel</button>';
  if (panel.type === 'move' || panel.type === 'assign') {
    const l = panel.link;
    const name = l ? l.client_name : panel.client.name;
    const others = agencies.filter((x) => !l || x.id !== l.agency_id);
    return `<div class="dark-panel">
      <div><span class="eyebrow">${l ? 'Move client' : 'Assign client'}</span><h3>${esc(name)} ${l ? 'is changing agency' : 'needs an agency'}</h3></div>
      <ol><li>Choose the new agency</li><li>Confirm the rate card and discount</li>${l ? `<li>Old schedules keep ${esc(l.agency_name)}</li>` : ''}</ol>
      <fieldset style="border:0;margin:0;padding:0;display:flex;flex-direction:column;gap:8px"><legend class="small" style="font-weight:700;margin-bottom:8px">New agency</legend>
        ${others.map((x, i) => `<label class="pick-agency"><input type="radio" name="to" value="${x.id}" ${i === 0 ? 'checked' : ''}> ${esc(x.name)}</label>`).join('') || '<div class="small">Add another agency first.</div>'}
      </fieldset>
      <label class="field">Rate card<select id="pCard">${cardOptions(l ? l.rate_card_id : null)}</select></label>
      <label class="field">Agreed discount (%)<input id="pDisc" class="amber" inputmode="decimal" value="${l ? Number(l.discount_pct) : 0}"></label>
      <div class="row" style="gap:8px"><button class="btn btn-primary" id="pGo" ${others.length ? '' : 'disabled'} style="flex:1">${l ? `Move ${esc(name)}` : 'Assign'}</button>${close}</div>
    </div>`;
  }
  if (panel.type === 'deal') {
    const l = panel.link;
    return `<div class="dark-panel">
      <div><span class="eyebrow">Edit deal</span><h3>${esc(l.client_name)} via ${esc(l.agency_name)}</h3></div>
      <label class="field">Rate card<select id="pCard">${cardOptions(l.rate_card_id)}</select><span class="help" style="color:var(--side-ink)">Custom cards live under Client rate cards.</span></label>
      <label class="field">Agreed discount (%)<input id="pDisc" class="amber" inputmode="decimal" value="${Number(l.discount_pct)}"><span class="help" style="color:var(--side-ink)">Pre-filled as the Option 02 discount on new schedules.</span></label>
      <label class="field">Deal notes<input id="pNotes" value="${esc(l.notes || '')}" placeholder="Validity, reference…"></label>
      <div class="row" style="gap:8px"><button class="btn btn-primary" id="pGo" style="flex:1">Save deal</button>${close}</div>
    </div>`;
  }
  // add a client to the selected agency
  const linked = new Set(a.clients.map((l) => l.client_id));
  const free = clients.filter((c) => !linked.has(c.id));
  return `<div class="dark-panel">
    <div><span class="eyebrow">Add client</span><h3>New client for ${esc(a.name)}</h3></div>
    <label class="field">Client<select id="pWho"><option value="new">+ A new client…</option>${free.map((c) => {
    const cur = c.links.find((l) => l.active);
    return `<option value="${c.id}">${esc(c.name)}${cur ? ` (now with ${esc(cur.agency_name)})` : ''}</option>`;
  }).join('')}</select></label>
    <label class="field" id="pNewWrap">Client name<input id="pName" placeholder="e.g. Dialog Axiata"></label>
    <label class="field">Rate card<select id="pCard">${cardOptions(null)}</select></label>
    <label class="field">Agreed discount (%)<input id="pDisc" class="amber" inputmode="decimal" value="0"></label>
    <div class="row" style="gap:8px"><button class="btn btn-primary" id="pGo" style="flex:1">Add to ${esc(a.name)}</button>${close}</div>
  </div>`;
}

function bind(a) {
  const qi = el.querySelector('#q');
  qi.oninput = () => { q = qi.value; const p = qi.selectionStart; draw(); const n = el.querySelector('#q'); n.focus(); n.setSelectionRange(p, p); };
  el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
    selected = b.dataset.a === 'none' ? 'none' : Number(b.dataset.a);
    store.set('tvd_agency', selected); panel = null; draw();
  }));
  const allLinks = clients.flatMap((c) => c.links);
  el.querySelectorAll('[data-deal]').forEach((b) => b.addEventListener('click', () => { panel = { type: 'deal', link: allLinks.find((l) => l.id === Number(b.dataset.deal)) }; draw(); }));
  el.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', () => { panel = { type: 'move', link: allLinks.find((l) => l.id === Number(b.dataset.move)) }; draw(); }));
  el.querySelectorAll('[data-assign]').forEach((b) => b.addEventListener('click', () => { panel = { type: 'assign', client: clients.find((c) => c.id === Number(b.dataset.assign)) }; draw(); }));
  el.querySelectorAll('[data-end]').forEach((b) => b.addEventListener('click', async () => {
    const l = allLinks.find((x) => x.id === Number(b.dataset.end));
    if (!(await confirmBox('Remove from agency', `Remove <b>${esc(l.client_name)}</b> from <b>${esc(l.agency_name)}</b>? It stays in the history and its schedules are kept.`, 'Remove'))) return;
    await run(() => api(`/agency-clients/${l.id}`, { method: 'DELETE' }));
    toast('Client removed from agency'); panel = null; load();
  }));
  el.querySelectorAll('[data-delc]').forEach((b) => b.addEventListener('click', async () => {
    const c = clients.find((x) => x.id === Number(b.dataset.delc));
    if (!(await confirmBox('Delete client', `Delete <b>${esc(c.name)}</b>? Saved schedules are kept.`))) return;
    await run(() => api(`/clients/${c.id}`, { method: 'DELETE' }));
    toast('Client deleted'); load();
  }));
  if (a) {
    const add = () => { panel = { type: 'add' }; draw(); };
    el.querySelector('#addHere')?.addEventListener('click', add);
    el.querySelector('#addCard')?.addEventListener('click', add);
    el.querySelector('#editA')?.addEventListener('click', () => editAgency(a));
    el.querySelector('#delA')?.addEventListener('click', async () => {
      if (!(await confirmBox('Delete agency', `Delete <b>${esc(a.name)}</b>? Its client links are removed; clients and saved schedules are kept.`))) return;
      await run(() => api(`/agencies/${a.id}`, { method: 'DELETE' }));
      toast('Agency deleted'); selected = null; panel = null; load();
    });
  }
  if (!panel) return;
  el.querySelector('#pClose').onclick = () => { panel = null; draw(); };
  el.querySelector('#pScrim').onclick = () => { panel = null; draw(); };
  const who = el.querySelector('#pWho');
  if (who) { const sync = () => el.querySelector('#pNewWrap').classList.toggle('hidden', who.value !== 'new'); who.onchange = sync; sync(); }
  el.querySelector('#pGo').onclick = (e) => run(async () => {
    const deal = { rate_card_id: el.querySelector('#pCard').value || null, discount_pct: el.querySelector('#pDisc').value || 0 };
    if (panel.type === 'move' || panel.type === 'assign') {
      const to = el.querySelector('[name=to]:checked');
      if (!to) throw new Error('Choose the new agency');
      const cid = panel.link ? panel.link.client_id : panel.client.id;
      await api(`/clients/${cid}/move`, { method: 'POST', body: { ...deal, agency_id: Number(to.value) } });
      toast(panel.link ? `${panel.link.client_name} moved` : 'Client assigned', 'ok');
      selected = Number(to.value);
    } else if (panel.type === 'deal') {
      await api(`/agency-clients/${panel.link.id}`, { method: 'PUT', body: { ...deal, deal_notes: el.querySelector('#pNotes').value } });
      toast('Deal saved', 'ok');
    } else {
      if (who.value === 'new') {
        const name = el.querySelector('#pName').value.trim();
        if (!name) throw new Error('Enter the client name');
        await api('/clients', { method: 'POST', body: { ...deal, name, agency_id: a.id } });
      } else {
        await api('/agency-clients', { method: 'POST', body: { ...deal, agency_id: a.id, client_id: Number(who.value) } });
      }
      toast('Client added', 'ok');
    }
    store.set('tvd_agency', selected);
    panel = null;
    await load();
  }, e.currentTarget);
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
  if (saved) { selected = saved.id; store.set('tvd_agency', selected); panel = null; toast('Agency saved', 'ok'); load(); }
}
