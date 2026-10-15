// Hash router: #/quote/new, #/quote/12, #/quotes, #/clients, #/rate-cards, #/rate-cards/3, …
import { esc } from './ui.js';

const routes = [
  [/^\/quote\/new$/, 'quote', () => ({})],
  [/^\/quote\/(\d+)$/, 'quote', (m) => ({ id: Number(m[1]) })],
  [/^\/quotes$/, 'quotes', () => ({})],
  [/^\/clients$/, 'clients', () => ({})],
  [/^\/rate-cards$/, 'ratecards', () => ({})],
  [/^\/rate-cards\/(\d+)$/, 'ratecards', (m) => ({ id: Number(m[1]) })],
  [/^\/base-rates$/, 'baserates', () => ({})],
  [/^\/programs$/, 'programs', () => ({})],
  [/^\/settings$/, 'settings', () => ({})],
];

const navKey = { quote: 'quote', quotes: 'quotes', clients: 'clients', ratecards: 'rate-cards', baserates: 'base-rates', programs: 'programs', settings: 'settings' };

let current = null;

async function render() {
  const path = (location.hash || '#/quote/new').slice(1);
  let found = null;
  for (const [re, page, params] of routes) {
    const m = path.match(re);
    if (m) { found = { page, params: params(m) }; break; }
  }
  if (!found) { location.hash = '#/quote/new'; return; }

  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === navKey[found.page]));
  document.getElementById('side').classList.remove('open');

  const el = document.getElementById('page');
  if (current && current.leave) current.leave();
  el.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  try {
    const mod = await import(`./pages/${found.page}.js`);
    current = mod;
    await mod.render(el, found.params);
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="card card-pad"><b>Could not load this page.</b><div class="muted">${esc(e.message)}</div></div>`;
  }
  window.scrollTo(0, 0);
}

document.getElementById('menuBtn').addEventListener('click', () => document.getElementById('side').classList.toggle('open'));
window.addEventListener('hashchange', render);
render();
