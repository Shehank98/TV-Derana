// Small UI toolkit: escaping, formatting, toasts, modals, API calls.

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n) => (n === null || n === undefined || n === '' ? '-' : nf2.format(Number(n)));
export const money0 = (n) => (n === null || n === undefined || n === '' ? '-' : nf0.format(Number(n)));
export const num = (n, d = 2) => (n === null || n === undefined ? '-' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d }));
export const pct = (n, d = 1) => (n === null || n === undefined ? '-' : `${Number(n).toFixed(d)}%`);
export const hhmm = (min) => {
  if (min === null || min === undefined || min === '') return '';
  const t = ((Number(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
export const dbTime = (t) => (t ? String(t).slice(0, 5) : '');
export const date = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

export function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 6000 : 3200);
}

export async function api(path, { method = 'GET', body, raw, headers = {} } = {}) {
  const opts = { method, headers: { ...headers } };
  if (raw) { opts.body = raw; opts.headers['Content-Type'] = 'application/octet-stream'; }
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  const res = await fetch(`/api${path}`, opts);
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  if (!res.ok) {
    const msg = ct.includes('json') ? (await res.json()).error : await res.text();
    const err = new Error(msg || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  if (ct.includes('spreadsheetml') || ct.includes('pdf')) return res;
  return ct.includes('json') ? res.json() : res.text();
}

// Wraps an async action: shows errors as toasts, optionally disables a button.
export async function run(fn, btn) {
  const label = btn && btn.innerHTML;
  try {
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; }
    return await fn();
  } catch (e) {
    toast(e.message || 'Something went wrong', 'error');
    return undefined;
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = label; }
  }
}

export async function download(res) {
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') || '';
  const name = (cd.match(/filename="([^"]+)"/) || [])[1] || 'schedule-report';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// modal({ title, body (html), wide, okText, onOk(el) → false keeps it open }) → Promise<result|null>
export function modal({ title, sub = '', body, wide = false, okText = 'Save', cancelText = 'Cancel', onOk, danger = false, onOpen }) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `
      <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
        <div class="modal-head"><div><h2>${esc(title)}</h2>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div><button class="btn btn-icon" data-x aria-label="Close">✕</button></div>
        <div class="modal-body">${body}</div>
        <div class="modal-foot">
          ${cancelText ? `<button class="btn" data-x>${esc(cancelText)}</button>` : ''}
          ${okText ? `<button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(okText)}</button>` : ''}
        </div>
      </div>`;
    const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(null); });
    back.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', () => close(null)));
    const ok = back.querySelector('[data-ok]');
    const submit = async () => {
      if (!onOk) return close(true);
      const r = await run(() => onOk(back.querySelector('.modal-body')), ok);
      if (r !== false && r !== undefined) close(r);
    };
    if (ok) ok.addEventListener('click', submit);
    back.querySelector('.modal-body').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); submit(); }
    });
    document.body.append(back);
    if (onOpen) onOpen(back.querySelector('.modal-body'));
    const first = back.querySelector('.modal-body input, .modal-body select, .modal-body textarea');
    if (first) first.focus();
  });
}

export const confirmBox = (title, text, okText = 'Delete') =>
  modal({ title, body: `<p style="margin:0">${text}</p>`, okText, danger: true });

// Reads named form controls inside el into an object.
export function formData(el) {
  const out = {};
  el.querySelectorAll('[name]').forEach((f) => {
    if (f.type === 'checkbox') out[f.name] = f.checked;
    else if (f.type === 'radio') { if (f.checked) out[f.name] = f.value; }
    else out[f.name] = f.value;
  });
  return out;
}

// crumbs: [[label, href?], ...]; the last one is the current page.
export function setHeader(title, sub = '', actionsHtml = '', crumbs = []) {
  document.getElementById('topbar').classList.toggle('hidden', !title && !actionsHtml && !crumbs.length);
  document.getElementById('crumbs').innerHTML = crumbs.map(([label, href], i) => {
    if (i === crumbs.length - 1) return `<b>${esc(label)}</b>`;
    return `${href ? `<a href="${href}">${esc(label)}</a>` : `<span>${esc(label)}</span>`}<span aria-hidden="true">/</span>`;
  }).join('');
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('pageSub').textContent = sub;
  document.getElementById('pageActions').innerHTML = actionsHtml;
  document.title = `${title || 'TV Derana'} · TV Derana Schedules`;
}

// Agency / client initials and tile tints (stable per name).
export const initials = (name) => String(name || '?').replace(/[^A-Za-z0-9 /]/g, ' ').split(/[\s/]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
const TINTS = [['#fdecef', '#b00e28'], ['#e8f0fb', '#245a99'], ['#e6f5ee', '#0d6b49'], ['#fff3c4', '#6b5200'], ['#f1ecfb', '#5a3c9e'], ['#eef0f5', '#111827']];
export const tint = (name) => { let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TINTS[h % TINTS.length]; };

export const icon = {
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 6l6 6-6 6"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 14l2 2 4-4"/></svg>',
  fileBad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M10 12l4 4M14 12l-4 4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
};

export const debounce = (fn, ms = 350) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// "2026-10" → "October 2026" (or "Oct 26" with short)
export const monthLabel = (key, shortForm = false) => {
  const [y, m] = String(key || '').split('-').map(Number);
  if (!y || !m) return '';
  return shortForm ? `${MONTHS[m - 1].slice(0, 3)} ${String(y).slice(2)}` : `${MONTHS[m - 1]} ${y}`;
};
export const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
