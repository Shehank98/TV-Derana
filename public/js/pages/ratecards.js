// Client rate cards: list, and an editor that sets each slot to
// default / fixed rate / discount %.
import { api, run, esc, money, money0, num, pct, setHeader, icon, modal, confirmBox, toast, formData } from '../ui.js';

let el;

export async function render(root, params) {
  el = root;
  if (params.id) return editor(params.id);
  return list();
}

async function list() {
  setHeader('Client rate cards', 'Custom pricing that one or more clients use instead of the base rate card',
    `<button class="btn btn-primary" id="newCard">${icon.plus} New rate card</button>`);
  const cards = await api('/rate-cards');
  document.getElementById('newCard').onclick = () => createCard(cards);
  el.innerHTML = `<div class="card"><div class="table-wrap"><table class="t">
    <thead><tr><th>Rate card</th><th class="num">Default discount</th><th class="num">Slot overrides</th><th>Used by</th><th></th></tr></thead><tbody>
    ${cards.map((c) => `<tr><td><a href="#/rate-cards/${c.id}"><b>${esc(c.name)}</b></a>${c.notes ? `<div class="small muted">${esc(c.notes)}</div>` : ''}</td>
      <td class="num">${pct(c.default_discount_pct, 2)}</td><td class="num">${c.item_count}</td>
      <td>${c.used_by.map((x) => `<span class="chip plain">${esc(x.client)} <span class="muted">· ${esc(x.agency)}</span></span>`).join(' ') || '<span class="muted">Not assigned</span>'}</td>
      <td class="actions"><a class="btn btn-sm" href="#/rate-cards/${c.id}">${icon.edit} Edit</a> <button class="btn btn-sm" data-dup="${c.id}" title="Duplicate">${icon.copy}</button></td></tr>`).join('')
      || '<tr><td colspan="5" class="empty">No custom rate cards yet. Clients use the base rate card or a flat discount until you create one.</td></tr>'}
    </tbody></table></div></div>
    <p class="muted small">Tip: assign a card to a client under <a href="#/clients">Agencies &amp; clients</a> → Deal → Rate card.</p>`;
  el.querySelectorAll('[data-dup]').forEach((b) => b.addEventListener('click', () => createCard(cards, cards.find((c) => c.id === Number(b.dataset.dup)))));
}

async function createCard(cards, from) {
  const saved = await modal({
    title: from ? `Duplicate “${from.name}”` : 'New rate card',
    body: `<div class="stack">
      <label class="field">Card name<input name="name" value="${from ? esc(`${from.name} (copy)`) : ''}" placeholder="e.g. Dialog 2026 annual deal"></label>
      <label class="field">Default discount on slots without their own rate (%)<input name="default_discount_pct" inputmode="decimal" value="${from ? from.default_discount_pct : 0}"></label>
      ${from ? '' : `<label class="field">Start from<select name="copy_from"><option value="">Base rate card (no overrides)</option>${cards.map((c) => `<option value="${c.id}">Copy of ${esc(c.name)}</option>`).join('')}</select></label>`}
    </div>`,
    okText: 'Create',
    onOk: (b) => {
      const d = formData(b);
      if (from) d.copy_from = from.id;
      if (!d.copy_from) delete d.copy_from;
      return api('/rate-cards', { method: 'POST', body: d });
    },
  });
  if (saved) location.hash = `#/rate-cards/${saved.id}`;
}

async function editor(id) {
  const card = await api(`/rate-cards/${id}`);
  setHeader(card.name, 'Set a fixed rate or a discount for any slot; everything else uses the default discount',
    `<a class="btn" href="#/rate-cards">${icon.back} All cards</a><button class="btn btn-danger" id="delCard">${icon.trash} Delete</button>`);

  const items = { ...card.items };
  const cats = [...new Set(card.slots.map((s) => s.category_name))];

  const effective = (s) => {
    const base = Number(s.rate_30s);
    const it = items[s.id];
    if (it && it.mode === 'fixed' && it.value !== '') return Number(it.value);
    if (it && it.mode === 'discount' && it.value !== '') return base * (1 - Number(it.value) / 100);
    return base * (1 - Number(el.querySelector('#def')?.value || card.default_discount_pct) / 100);
  };

  el.innerHTML = `
    <div class="card card-pad">
      <div class="form-grid" style="grid-template-columns:2fr 1fr">
        <label class="field">Card name<input id="name" value="${esc(card.name)}"></label>
        <label class="field">Default discount (%)<input id="def" inputmode="decimal" value="${card.default_discount_pct}"><span class="help">Applies to every slot set to “Default”.</span></label>
        <label class="field full">Notes<input id="notes" value="${esc(card.notes || '')}" placeholder="Validity, deal reference…"></label>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="table-wrap"><table class="t">
        <thead><tr><th>Rate slot</th><th class="num">Base rate</th><th style="width:170px">Rule</th><th style="width:160px">Value</th><th class="num">Client rate</th><th class="num">vs base</th></tr></thead>
        <tbody>${cats.map((cat) => `
          <tr class="group"><td colspan="6"><div class="row"><span>${esc(cat)}</span><span class="spacer"></span>
            <span class="small muted" style="font-weight:500">Set whole category to</span>
            <input class="input-sm" style="width:80px" data-catpct="${esc(cat)}" placeholder="% off">
            <button class="btn btn-sm" data-catapply="${esc(cat)}">Apply</button>
            <button class="btn btn-sm btn-ghost" data-catreset="${esc(cat)}">Reset</button></div></td></tr>
          ${card.slots.filter((s) => s.category_name === cat).map((s) => `<tr data-slot="${s.id}">
            <td>${esc(s.name)}</td>
            <td class="num">${money0(s.rate_30s)}</td>
            <td><select class="input-sm" data-mode="${s.id}">
              <option value="">Default</option>
              <option value="discount" ${items[s.id]?.mode === 'discount' ? 'selected' : ''}>Discount %</option>
              <option value="fixed" ${items[s.id]?.mode === 'fixed' ? 'selected' : ''}>Fixed rate</option></select></td>
            <td><input class="input-sm money-input" data-val="${s.id}" inputmode="decimal" value="${items[s.id] ? items[s.id].value : ''}" ${items[s.id] ? '' : 'disabled'}></td>
            <td class="num" data-eff="${s.id}"></td><td class="num" data-diff="${s.id}"></td></tr>`).join('')}`).join('')}
        </tbody></table></div>
    </div>
    <div class="sticky-foot"><a class="btn" href="#/rate-cards">Cancel</a><button class="btn btn-primary" id="saveCard">${icon.save} Save rate card</button></div>`;

  const refresh = () => {
    for (const s of card.slots) {
      const eff = effective(s);
      const diff = Number(s.rate_30s) ? (eff / Number(s.rate_30s) - 1) * 100 : 0;
      el.querySelector(`[data-eff="${s.id}"]`).textContent = money(eff);
      const d = el.querySelector(`[data-diff="${s.id}"]`);
      d.textContent = Math.abs(diff) < 0.005 ? '-' : `${diff > 0 ? '+' : ''}${num(diff, 2)}%`;
      d.style.color = diff > 0.005 ? 'var(--bad)' : diff < -0.005 ? 'var(--ok)' : '';
    }
  };
  const setItem = (sid, mode, value) => {
    const sel = el.querySelector(`[data-mode="${sid}"]`);
    const inp = el.querySelector(`[data-val="${sid}"]`);
    sel.value = mode || '';
    inp.disabled = !mode;
    inp.value = mode ? value : '';
    if (mode) items[sid] = { mode, value }; else delete items[sid];
  };
  el.querySelectorAll('[data-mode]').forEach((sel) => sel.addEventListener('change', () => {
    const sid = Number(sel.dataset.mode);
    const s = card.slots.find((x) => x.id === sid);
    setItem(sid, sel.value, sel.value === 'fixed' ? Number(s.rate_30s) : sel.value === 'discount' ? Number(el.querySelector('#def').value || 0) : '');
    refresh();
    if (sel.value) el.querySelector(`[data-val="${sid}"]`).select();
  }));
  el.querySelectorAll('[data-val]').forEach((inp) => inp.addEventListener('input', () => {
    const sid = Number(inp.dataset.val);
    if (items[sid]) items[sid].value = inp.value.replace(/,/g, '');
    refresh();
  }));
  el.querySelector('#def').addEventListener('input', refresh);
  el.querySelectorAll('[data-catapply]').forEach((b) => b.addEventListener('click', () => {
    const cat = b.dataset.catapply;
    const v = el.querySelector(`[data-catpct="${CSS.escape(cat)}"]`).value.trim();
    if (!v || !Number.isFinite(Number(v))) return toast('Enter a discount % first', 'error');
    card.slots.filter((s) => s.category_name === cat).forEach((s) => setItem(s.id, 'discount', Number(v)));
    refresh();
  }));
  el.querySelectorAll('[data-catreset]').forEach((b) => b.addEventListener('click', () => {
    card.slots.filter((s) => s.category_name === b.dataset.catreset).forEach((s) => setItem(s.id, '', ''));
    refresh();
  }));
  refresh();

  el.querySelector('#saveCard').onclick = (e) => run(async () => {
    const body = {
      name: el.querySelector('#name').value,
      default_discount_pct: el.querySelector('#def').value || 0,
      notes: el.querySelector('#notes').value,
      items: Object.entries(items).filter(([, it]) => it.mode && it.value !== '').map(([slot_id, it]) => ({ slot_id: Number(slot_id), mode: it.mode, value: it.value })),
    };
    await api(`/rate-cards/${id}`, { method: 'PUT', body });
    toast('Rate card saved', 'ok');
    setHeader(body.name, document.getElementById('pageSub').textContent, document.getElementById('pageActions').innerHTML);
    document.getElementById('delCard').onclick = del;
  }, e.currentTarget);

  const del = async () => {
    const users = (await api('/rate-cards')).find((c) => c.id === Number(id))?.used_by || [];
    const msg = users.length ? `${users.length} client deal(s) use this card and will go back to the base rate card.` : 'No clients use this card.';
    if (!(await confirmBox('Delete rate card', `Delete <b>${esc(card.name)}</b>? ${msg}`))) return;
    await run(() => api(`/rate-cards/${id}`, { method: 'DELETE' }));
    toast('Rate card deleted');
    location.hash = '#/rate-cards';
  };
  document.getElementById('delCard').onclick = del;
}
