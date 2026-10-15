// Shared bits of the "new schedule" flow: step chips and the draft that
// travels from the upload popup to the matching screen.
import { esc, store } from './ui.js';

const KEY = 'tvd_draft_v2';
let draft = store.get(KEY, null);

export const getDraft = () => draft;
export function setDraft(d) { draft = d; store.set(KEY, d); }
export function clearDraft() { draft = null; store.del(KEY); }

// steps(n, { agency: {id,name}, client: {id,name} }) → chips; finished steps link back.
export function steps(n, ctx = {}) {
  const items = [
    ['Agency', ctx.agency ? ctx.agency.name : 'Agency', '#/new'],
    ['Client', ctx.client ? ctx.client.name : 'Client', ctx.agency ? `#/new/${ctx.agency.id}` : null],
    ['Schedule', 'Schedule', ctx.agency && ctx.client ? `#/client/${ctx.agency.id}/${ctx.client.id}` : null],
    ['Matching', 'Matching', null],
    ['Dashboard', 'Dashboard', null],
  ];
  return `<nav class="steps" aria-label="Steps">${items.map(([, label, href], i) => {
    const k = i + 1;
    const cls = k < n ? 'done' : k === n ? 'on' : '';
    const inner = `<i>${k < n ? '✓' : k}</i>${esc(label)}`;
    const chip = k < n && href ? `<a class="st ${cls}" href="${href}">${inner}</a>` : `<span class="st ${cls}">${inner}</span>`;
    return (i ? `<span class="bar ${k <= n ? 'done' : ''}"></span>` : '') + chip;
  }).join('')}</nav>`;
}
