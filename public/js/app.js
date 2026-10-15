// Hash router + sidebar behaviour.
import { esc, store } from './ui.js';

const routes = [
  [/^\/home$/, 'home', () => ({})],
  [/^\/new$/, 'pick', () => ({})],
  [/^\/new\/(\d+)$/, 'pick', (m) => ({ agencyId: Number(m[1]) })],
  [/^\/client\/(\d+)\/(\d+)$/, 'client', (m) => ({ agencyId: Number(m[1]), clientId: Number(m[2]) })],
  [/^\/match$/, 'match', () => ({})],
  [/^\/schedule\/(\d+)\/match$/, 'match', (m) => ({ id: Number(m[1]) })],
  [/^\/schedule\/(\d+)$/, 'schedule', (m) => ({ id: Number(m[1]) })],
  [/^\/schedules$/, 'schedules', () => ({})],
  [/^\/clients$/, 'clients', () => ({})],
  [/^\/rate-cards$/, 'ratecards', () => ({})],
  [/^\/rate-cards\/(\d+)$/, 'ratecards', (m) => ({ id: Number(m[1]) })],
  [/^\/base-rates$/, 'baserates', () => ({})],
  [/^\/programs$/, 'programs', () => ({})],
  [/^\/settings$/, 'settings', () => ({})],
];

const navKey = { home: 'home', pick: 'new', client: 'new', match: 'new', schedule: 'schedules', schedules: 'schedules',
  clients: 'clients', ratecards: 'rate-cards', baserates: 'base-rates', programs: 'programs', settings: 'settings' };

let current = null;
const side = document.getElementById('side');

async function render() {
  const path = (location.hash || '#/home').slice(1);
  let found = null;
  for (const [re, page, params] of routes) {
    const m = path.match(re);
    if (m) { found = { page, params: params(m) }; break; }
  }
  if (!found) { location.hash = '#/home'; return; }

  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === navKey[found.page]));
  side.classList.remove('open');

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

// Sidebar: collapse / expand on desktop (remembered), drawer on mobile.
function setCollapsed(c) {
  document.body.classList.toggle('side-collapsed', c);
  const t = document.getElementById('sideToggle');
  t.setAttribute('aria-label', c ? 'Expand sidebar' : 'Collapse sidebar');
  t.querySelector('.label').textContent = c ? 'Expand' : 'Collapse';
  store.set('tvd_side', c ? 'collapsed' : 'open');
}
setCollapsed(store.get('tvd_side') === 'collapsed');
document.getElementById('sideToggle').addEventListener('click', () => setCollapsed(!document.body.classList.contains('side-collapsed')));
document.getElementById('menuBtn').addEventListener('click', () => side.classList.add('open'));
document.getElementById('scrim').addEventListener('click', () => side.classList.remove('open'));

window.addEventListener('hashchange', render);
render();
