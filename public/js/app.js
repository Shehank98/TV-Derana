// Hash router.
import { esc } from './ui.js';

const routes = [
  [/^\/dashboard$/, 'dashboard', () => ({})],
  [/^\/new$/, 'new', () => ({})],
  [/^\/schedule\/(\d+)\/edit$/, 'new', (m) => ({ id: Number(m[1]) })],
  [/^\/schedule\/(\d+)$/, 'schedule', (m) => ({ id: Number(m[1]) })],
  [/^\/schedules$/, 'schedules', () => ({})],
  [/^\/clients$/, 'clients', () => ({})],
  [/^\/rate-cards$/, 'ratecards', () => ({})],
  [/^\/rate-cards\/(\d+)$/, 'ratecards', (m) => ({ id: Number(m[1]) })],
  [/^\/base-rates$/, 'baserates', () => ({})],
  [/^\/programs$/, 'programs', () => ({})],
  [/^\/settings$/, 'settings', () => ({})],
];

const navKey = { dashboard: 'dashboard', new: 'new', schedule: 'schedules', schedules: 'schedules', clients: 'clients',
  ratecards: 'rate-cards', baserates: 'base-rates', programs: 'programs', settings: 'settings' };

let current = null;

async function render() {
  const path = (location.hash || '#/dashboard').slice(1);
  let found = null;
  for (const [re, page, params] of routes) {
    const m = path.match(re);
    if (m) { found = { page, params: params(m) }; break; }
  }
  if (!found) { location.hash = '#/dashboard'; return; }

  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === navKey[found.page]));
  document.querySelector('.new-btn').classList.toggle('active', found.page === 'new' && !found.params.id);
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
