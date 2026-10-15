// The published TV Derana rate card: categories → slots with a 30-sec rate.
import { api, run, esc, money0, setHeader, icon, modal, confirmBox, toast, formData } from '../ui.js';

let el;

export async function render(root) {
  el = root;
  setHeader('Base rate card', 'TV Derana published rates per 30 seconds. Programs take their rate from a slot here.',
    `<button class="btn" id="addCat">${icon.plus} Add category</button><button class="btn btn-primary" id="addSlot">${icon.plus} Add rate slot</button>`);
  await load();
}

async function load() {
  const cats = await api('/ratecard');
  document.getElementById('addCat').onclick = () => editCat();
  document.getElementById('addSlot').onclick = () => editSlot(cats, {});
  el.innerHTML = `
    <div class="note" style="margin-bottom:14px">Changing a rate here updates every program in that slot and every client discount or card based on it. Saved quotations keep the rates they were saved with.</div>
    <div class="card"><div class="table-wrap"><table class="t">
      <thead><tr><th>Rate slot</th><th class="num">Rate / 30 sec (LKR)</th><th class="num">Programs</th><th></th></tr></thead>
      <tbody>${cats.map((c) => `
        <tr class="group"><td colspan="4"><div class="row"><span>${esc(c.name)}</span><span class="spacer"></span>
          <button class="btn btn-sm btn-ghost" data-ecat="${c.id}">${icon.edit}</button>
          <button class="btn btn-sm btn-ghost btn-danger" data-dcat="${c.id}">${icon.trash}</button></div></td></tr>
        ${c.slots.map((s) => `<tr>
          <td>${esc(s.name)}${s.notes ? `<div class="small muted">${esc(s.notes)}</div>` : ''}</td>
          <td class="num"><input class="input-sm money-input" style="width:140px;margin-left:auto" data-rate="${s.id}" value="${money0(s.rate_30s)}"></td>
          <td class="num">${s.program_count ? `<a href="#/programs" data-slotlink="${s.id}">${s.program_count}</a>` : '<span class="muted">0</span>'}</td>
          <td class="actions"><button class="btn btn-sm" data-eslot="${s.id}">${icon.edit}</button> <button class="btn btn-sm btn-danger" data-dslot="${s.id}">${icon.trash}</button></td>
        </tr>`).join('') || '<tr><td colspan="4" class="muted">No slots in this category</td></tr>'}`).join('')}
      </tbody></table></div></div>
    <p class="muted small">From the rate card: rates for other durations are pro-rata; special events are negotiated separately; prevailing taxes apply.</p>`;

  const slotById = new Map(cats.flatMap((c) => c.slots).map((s) => [s.id, s]));
  el.querySelectorAll('[data-rate]').forEach((inp) => {
    const save = () => {
      const s = slotById.get(Number(inp.dataset.rate));
      const v = Number(inp.value.replace(/,/g, ''));
      if (!Number.isFinite(v) || v < 0) { toast('Enter a valid rate', 'error'); inp.value = money0(s.rate_30s); return; }
      if (v === Number(s.rate_30s)) { inp.value = money0(v); return; }
      run(async () => {
        await api(`/slots/${s.id}`, { method: 'PUT', body: { ...s, rate_30s: v } });
        s.rate_30s = v; inp.value = money0(v);
        toast(`${s.name}: ${money0(v)} saved`, 'ok');
      });
    };
    inp.addEventListener('focus', () => { inp.value = String(inp.value).replace(/,/g, ''); inp.select(); });
    inp.addEventListener('blur', save);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
  });
  el.querySelectorAll('[data-eslot]').forEach((b) => b.addEventListener('click', () => editSlot(cats, slotById.get(Number(b.dataset.eslot)))));
  el.querySelectorAll('[data-dslot]').forEach((b) => b.addEventListener('click', async () => {
    const s = slotById.get(Number(b.dataset.dslot));
    if (!(await confirmBox('Delete rate slot', `Delete <b>${esc(s.name)}</b>?${s.program_count ? ' Programs still use it — move them first.' : ''}`))) return;
    if (await run(() => api(`/slots/${s.id}`, { method: 'DELETE' })) !== undefined) { toast('Slot deleted'); load(); }
  }));
  el.querySelectorAll('[data-ecat]').forEach((b) => b.addEventListener('click', () => editCat(cats.find((c) => c.id === Number(b.dataset.ecat)))));
  el.querySelectorAll('[data-dcat]').forEach((b) => b.addEventListener('click', async () => {
    const c = cats.find((x) => x.id === Number(b.dataset.dcat));
    if (!(await confirmBox('Delete category', `Delete <b>${esc(c.name)}</b> and its ${c.slots.length} slot(s)?`))) return;
    if (await run(() => api(`/categories/${c.id}`, { method: 'DELETE' })) !== undefined) { toast('Category deleted'); load(); }
  }));
  el.querySelectorAll('[data-slotlink]').forEach((a) => a.addEventListener('click', () => sessionStorage.setItem('tvd_slot_filter', a.dataset.slotlink)));
}

async function editCat(c = {}) {
  const saved = await modal({
    title: c.id ? 'Rename category' : 'Add category',
    body: `<label class="field">Category name<input name="name" value="${esc(c.name || '')}" placeholder="e.g. Sports"></label>`,
    onOk: (b) => api(c.id ? `/categories/${c.id}` : '/categories', { method: c.id ? 'PUT' : 'POST', body: formData(b) }),
  });
  if (saved) { toast('Category saved', 'ok'); load(); }
}

async function editSlot(cats, s) {
  if (!cats.length) return toast('Add a category first', 'error');
  const saved = await modal({
    title: s.id ? 'Edit rate slot' : 'Add rate slot',
    body: `<div class="form-grid">
      <label class="field full">Slot name<input name="name" value="${esc(s.name || '')}" placeholder="e.g. Weekdays 8.00pm"></label>
      <label class="field">Category<select name="category_id">${cats.map((c) => `<option value="${c.id}" ${c.id === s.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field">Rate per 30 sec (LKR)<input name="rate_30s" class="money-input" inputmode="decimal" value="${s.rate_30s ?? ''}"></label>
      <label class="field full">Notes<input name="notes" value="${esc(s.notes || '')}"></label></div>`,
    onOk: (b) => api(s.id ? `/slots/${s.id}` : '/slots', { method: s.id ? 'PUT' : 'POST', body: formData(b) }),
  });
  if (saved) { toast('Rate slot saved', 'ok'); load(); }
}
