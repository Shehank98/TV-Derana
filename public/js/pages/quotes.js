import { api, run, esc, money, pct, date, setHeader, icon, confirmBox, toast, download, debounce } from '../ui.js';

let el;
let search = '';

export async function render(root) {
  el = root;
  setHeader('Saved quotations', 'Every quotation you saved, newest first', `<a class="btn btn-primary" href="#/quote/new">${icon.plus} New quotation</a>`);
  el.innerHTML = `
    <div class="card">
      <div class="card-head"><div class="search" style="width:min(360px,100%)">${icon.search}<input id="q" placeholder="Search title, ref, agency or client" value="${esc(search)}"></div></div>
      <div class="table-wrap" id="list"><div class="loading"><span class="spin"></span></div></div>
    </div>`;
  el.querySelector('#q').oninput = debounce((e) => { search = e.target.value; load(); }, 300);
  await load();
}

async function load() {
  const rows = await api(`/quotations?search=${encodeURIComponent(search)}`);
  const list = el.querySelector('#list');
  if (!rows.length) {
    list.innerHTML = `<div class="empty">${search ? 'No quotations match your search.' : 'No saved quotations yet. <a href="#/quote/new">Create the first one</a>.'}</div>`;
    return;
  }
  list.innerHTML = `<table class="t"><thead><tr><th>Ref</th><th>Title</th><th>Agency / client</th><th class="num">Spots</th><th class="num">Rate card value</th><th class="num">Discount</th><th class="num">Final value</th><th>Saved</th><th></th></tr></thead><tbody>
    ${rows.map((q) => `<tr>
      <td class="nowrap"><a href="#/quote/${q.id}"><b>${esc(q.ref)}</b></a></td>
      <td>${esc(q.title)}<div class="small muted">${esc(q.file_name || '')}</div></td>
      <td>${esc(q.agency_name || '—')}<div class="small muted">${esc(q.client_name || '')}</div></td>
      <td class="num">${q.spots ?? ''}</td>
      <td class="num">${money(q.gross)}</td>
      <td class="num">${pct(q.discount_pct)}</td>
      <td class="num"><b>${money(q.final)}</b></td>
      <td class="small nowrap">${date(q.updated_at)}</td>
      <td class="actions">
        <a class="btn btn-sm" href="#/quote/${q.id}">${icon.edit} Open</a>
        <button class="btn btn-sm" data-dl="${q.id}" title="Download Excel as saved">${icon.download}</button>
        <button class="btn btn-sm btn-danger" data-del="${q.id}" data-ref="${esc(q.ref)}" title="Delete">${icon.trash}</button>
      </td></tr>`).join('')}
    </tbody></table>`;
  list.querySelectorAll('[data-dl]').forEach((b) => b.addEventListener('click', () => run(async () => download(await api(`/quotations/${b.dataset.dl}/export`)), b)));
  list.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmBox('Delete quotation', `Delete <b>${esc(b.dataset.ref)}</b>? This cannot be undone.`))) return;
    await run(() => api(`/quotations/${b.dataset.del}`, { method: 'DELETE' }));
    toast('Quotation deleted');
    load();
  }));
}
