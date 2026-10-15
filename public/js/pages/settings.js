import { api, run, esc, money0, setHeader, icon, modal, confirmBox, toast, formData } from '../ui.js';

let el;

export async function render(root) {
  el = root;
  setHeader('Settings', 'Special item rates, tax and how schedules are read');
  await load();
}

async function load() {
  const { settings, rules } = await api('/settings');
  el.innerHTML = `
  <div class="stack">
    <div class="card">
      <div class="card-head"><div><h2>Special item rates</h2><div class="small muted">Lines whose name contains the keyword use these rates instead of the program rate (still per 30 sec, pro-rata).</div></div>
        <button class="btn btn-primary btn-sm" id="addRule">${icon.plus} Add rule</button></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Keyword</th><th>Label</th><th class="num">Prime time</th><th class="num">Non-prime</th><th>Client discount</th><th>Status</th><th></th></tr></thead><tbody>
        ${rules.map((r) => `<tr class="${r.active ? '' : 'dim'}"><td><b class="mono">${esc(r.keyword)}</b></td><td>${esc(r.label)}</td>
          <td class="num">${money0(r.rate_pt)}</td><td class="num">${money0(r.rate_npt)}</td>
          <td>${r.apply_client_discount ? 'Applied' : '<span class="muted">Not applied</span>'}</td>
          <td>${r.active ? '<span class="chip ok">Active</span>' : '<span class="chip">Off</span>'}</td>
          <td class="actions"><button class="btn btn-sm" data-er="${r.id}">${icon.edit}</button> <button class="btn btn-sm btn-danger" data-dr="${r.id}">${icon.trash}</button></td></tr>`).join('')
          || '<tr><td colspan="7" class="empty">No special rules.</td></tr>'}
      </tbody></table></div>
    </div>

    <div class="grid-2">
      <div class="card card-pad">
        <h2>Quotation</h2>
        <div class="stack">
          <label class="field">Tax added on top of the final value (%)<input id="tax_pct" inputmode="decimal" value="${settings.tax_pct ?? 0}"><span class="help">Rate card: “prevailing taxes has to be added”. Use 0 to quote before tax.</span></label>
          <label class="field">Auto-match confidence for names (0.5 – 1)<input id="match_auto_threshold" inputmode="decimal" value="${settings.match_auto_threshold ?? 0.8}"><span class="help">Higher = more lines sent to you for checking.</span></label>
        </div>
      </div>
      <div class="card card-pad">
        <h2>Reading agency schedules</h2>
        <div class="stack">
          <label class="field">Section labels to ignore (one per line)<textarea id="section_labels">${esc((settings.section_labels || []).join('\n'))}</textarea>
            <span class="help">Heading rows containing these words don’t replace the current section (e.g. “BRAND PRESENCE” under DREAM STAR).</span></label>
          <label class="field">Ad-format words (one per line)<textarea id="generic_item_words">${esc((settings.generic_item_words || []).join('\n'))}</textarea>
            <span class="help">Lines made only of these words (BILLBOARDS, SONG CARD…) are matched using their section heading + time belt.</span></label>
        </div>
      </div>
    </div>
    <div class="sticky-foot"><button class="btn btn-primary" id="saveSettings">${icon.save} Save settings</button></div>
  </div>`;

  el.querySelector('#saveSettings').onclick = (e) => run(async () => {
    const body = {};
    for (const k of ['tax_pct', 'match_auto_threshold', 'section_labels', 'generic_item_words']) body[k] = el.querySelector(`#${k}`).value;
    await api('/settings', { method: 'PUT', body });
    toast('Settings saved', 'ok');
  }, e.currentTarget);
  el.querySelector('#addRule').onclick = () => editRule({ active: true });
  el.querySelectorAll('[data-er]').forEach((b) => b.addEventListener('click', () => editRule(rules.find((r) => r.id === Number(b.dataset.er)))));
  el.querySelectorAll('[data-dr]').forEach((b) => b.addEventListener('click', async () => {
    const r = rules.find((x) => x.id === Number(b.dataset.dr));
    if (!(await confirmBox('Delete rule', `Delete the <b>${esc(r.keyword)}</b> rule?`))) return;
    await run(() => api(`/special-rules/${r.id}`, { method: 'DELETE' }));
    load();
  }));
}

async function editRule(r) {
  const saved = await modal({
    title: r.id ? 'Edit special rate' : 'Add special rate',
    body: `<div class="form-grid">
      <label class="field">Keyword in line name<input name="keyword" value="${esc(r.keyword || '')}" placeholder="CRAWLER"></label>
      <label class="field">Label<input name="label" value="${esc(r.label || '')}" placeholder="Crawler"></label>
      <label class="field">Prime-time rate / 30 sec<input name="rate_pt" inputmode="decimal" value="${r.rate_pt ?? ''}"></label>
      <label class="field">Non-prime rate / 30 sec<input name="rate_npt" inputmode="decimal" value="${r.rate_npt ?? ''}"></label>
      <label class="check full"><input type="checkbox" name="apply_client_discount" ${r.apply_client_discount ? 'checked' : ''}> Also apply the client’s discount to this rate</label>
      <label class="check full"><input type="checkbox" name="active" ${r.active !== false ? 'checked' : ''}> Active</label></div>`,
    onOk: (b) => api(r.id ? `/special-rules/${r.id}` : '/special-rules', { method: r.id ? 'PUT' : 'POST', body: formData(b) }),
  });
  if (saved) { toast('Rule saved', 'ok'); load(); }
}
