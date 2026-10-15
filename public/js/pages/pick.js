// New schedule, steps 1–2: agency cards → client cards (both with live search).
import { api, esc, num, setHeader, icon, initials, tint, monthLabel, date } from '../ui.js';
import { steps } from '../flow.js';

let el;
let q = '';

export async function render(root, params) {
  el = root;
  q = '';
  const agencies = await api('/agencies');
  if (params.agencyId) {
    const a = agencies.find((x) => x.id === params.agencyId);
    if (!a) { location.hash = '#/new'; return; }
    return clientsView(a);
  }
  return agenciesView(agencies);
}

const searchBox = (placeholder) => `
  <label class="search big" style="width:min(440px,100%)">
    <span class="sr">${esc(placeholder)}</span>${icon.search}
    <input type="search" id="q" placeholder="${esc(placeholder)}" autocomplete="off">
  </label>`;

function bindSearch(draw) {
  const input = el.querySelector('#q');
  input.focus();
  input.addEventListener('input', () => { q = input.value; draw(); });
}

// ── Step 1: agencies ──
function agenciesView(agencies) {
  setHeader('');
  el.innerHTML = `${steps(1)}
    <div class="row" style="justify-content:space-between;align-items:flex-end;margin-bottom:22px;gap:18px">
      <div><h1>Which agency sent the schedule?</h1>
        <p class="muted" style="margin:6px 0 0;font-size:15.5px;color:var(--ink-2)">Pick the agency, then the client. You will see that client's past schedules next.</p></div>
      ${searchBox('Search agencies…')}
    </div>
    <div class="row" style="justify-content:space-between;margin-bottom:14px;font-size:14px;color:var(--ink-2)">
      <span><b style="color:var(--ink)" id="count"></b> agencies</span>
      <a href="#/clients" style="font-weight:800">+ Add agency</a>
    </div>
    <div class="tiles" id="tiles"></div>`;
  const draw = () => {
    const s = q.trim().toLowerCase();
    const list = agencies.filter((a) => !s || a.name.toLowerCase().includes(s) || a.clients.some((c) => c.client_name.toLowerCase().includes(s)));
    el.querySelector('#count').textContent = list.length;
    el.querySelector('#tiles').innerHTML = list.map((a, i) => {
      const [bg, ink] = tint(a.name);
      const hit = s && !a.name.toLowerCase().includes(s) ? a.clients.find((c) => c.client_name.toLowerCase().includes(s)) : null;
      return `<a class="tile" href="#/new/${a.id}" style="animation-delay:${i * 50}ms">
        <div class="top"><span class="mono-tile" style="background:${bg};color:${ink}">${esc(initials(a.name))}</span>
          <div style="min-width:0"><span class="name">${esc(a.name)}</span><span class="meta">${a.clients.length} client${a.clients.length === 1 ? '' : 's'}${hit ? ` · has ${esc(hit.client_name)}` : ''}</span></div>
          <span class="go">${icon.arrow}</span></div>
        <div class="foot"><span style="flex:1">This month <b>${a.schedules_this_month} schedule${a.schedules_this_month === 1 ? '' : 's'}</b></span>
          <span>Last upload <b>${a.last_upload ? date(a.last_upload).split(',')[0] : '-'}</b></span></div>
      </a>`;
    }).join('') || `<div class="empty-hero" style="grid-column:1/-1"><h2>No agency matches “${esc(q)}”</h2><p>Check the spelling or add it as a new agency.</p><a class="btn btn-primary" href="#/clients">${icon.plus} Add agency</a></div>`;
  };
  draw();
  bindSearch(draw);
}

// ── Step 2: clients of one agency ──
function clientsView(a) {
  setHeader('');
  el.innerHTML = `${steps(2, { agency: a })}
    <div class="row" style="justify-content:space-between;align-items:flex-end;margin-bottom:22px;gap:18px">
      <div class="row" style="gap:16px;flex-wrap:nowrap">
        <a class="btn btn-icon" href="#/new" aria-label="Back to agencies">${icon.back}</a>
        <div><div style="font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--red)">${esc(a.name)}</div>
          <h1>Which client is it for?</h1></div>
      </div>
      ${searchBox(`Search ${a.name}'s clients…`)}
    </div>
    <div class="tiles" id="tiles"></div>`;
  const draw = () => {
    const s = q.trim().toLowerCase();
    const list = a.clients.filter((c) => !s || c.client_name.toLowerCase().includes(s));
    el.querySelector('#tiles').innerHTML = list.map((c, i) => `
      <a class="tile" href="#/client/${a.id}/${c.client_id}" style="animation-delay:${i * 60}ms">
        <div class="top"><span class="avatar">${esc(initials(c.client_name))}</span>
          <div style="min-width:0"><span class="name">${esc(c.client_name)}</span>
            <span class="meta">${c.schedule_count} schedule${c.schedule_count === 1 ? '' : 's'}${c.last_month ? ` · last ${monthLabel(c.last_month)}` : ''}</span></div>
          <span class="go">${icon.arrow}</span></div>
        <div class="row" style="gap:8px"><span class="pill-grey">${esc(c.rate_card_name || 'Base rate card')}</span><span class="pill-amber">Agreed ${num(c.discount_pct)}%</span></div>
      </a>`).join('')
      + (s && !list.length ? `<div class="empty" style="grid-column:1/-1">No client of ${esc(a.name)} matches “${esc(q)}”.</div>` : '')
      + `<a class="tile-add" href="#/clients"><span>${icon.plus}</span>Add a client to ${esc(a.name)}</a>`;
  };
  draw();
  bindSearch(draw);
}
