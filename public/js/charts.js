// Tiny chart helpers (HTML + CSS, no library). Colors: PT = Derana red, NPT = blue
// (validated pair). Single-series charts use one hue; values are labelled directly.
import { esc } from './ui.js';

let tip;
// Any element with data-tip="title|line|line" gets a hover tooltip.
export function attachTips(root) {
  if (!tip) { tip = document.createElement('div'); tip.className = 'tip hidden'; document.body.append(tip); }
  root.querySelectorAll('[data-tip]').forEach((el) => {
    el.addEventListener('mouseenter', () => {
      const [title, ...rest] = el.dataset.tip.split('|');
      tip.innerHTML = `<b>${esc(title)}</b>${rest.map((r) => `<div>${esc(r)}</div>`).join('')}`;
      tip.classList.remove('hidden');
    });
    el.addEventListener('mousemove', (e) => { tip.style.left = `${e.clientX}px`; tip.style.top = `${e.clientY}px`; });
    el.addEventListener('mouseleave', () => tip.classList.add('hidden'));
  });
}

// Horizontal bars: [{ label, value, tip }]
export function hbars(items, fmt, { color = 'var(--red)' } = {}) {
  if (!items.length) return '<div class="muted small">No data yet</div>';
  const max = Math.max(...items.map((i) => i.value), 1);
  return `<div class="hbars">${items.map((i) => `
    <div class="hbar" data-tip="${esc(i.tip || `${i.label}|${fmt(i.value)}`)}">
      <div class="lbl" title="${esc(i.label)}">${esc(i.label)}</div>
      <div class="track"><div class="fill" style="width:${(i.value / max) * 82}%;background:${color}"></div><span class="val">${fmt(i.value)}</span></div>
    </div>`).join('')}</div>`;
}

// Vertical columns for a time series: [{ label, value, tip }]. Labels the max and the last column.
export function columns(items, fmt, short) {
  const max = Math.max(...items.map((i) => i.value), 0);
  const lastIdx = items.length - 1;
  const maxIdx = items.findIndex((i) => i.value === max);
  return `<div class="cols">${items.map((i, k) => `
      <div class="c ${i.value ? '' : 'zero'}" data-tip="${esc(i.tip || `${i.label}|${fmt(i.value)}`)}">
        ${(k === lastIdx || k === maxIdx) && i.value ? `<span class="top" style="bottom:${max ? (i.value / max) * 100 : 0}%">${short(i.value)}</span>` : ''}
        <div class="b" style="height:${max ? (i.value / max) * 100 : 0}%"></div>
      </div>`).join('')}</div>
    <div class="col-labels">${items.map((i) => `<span>${esc(i.short || i.label)}</span>`).join('')}</div>`;
}

// Two-part stacked bar (PT / NPT) with legend.
export function ptStack(pt, npt, fmt, unit = '') {
  const tot = pt + npt;
  const a = tot ? (pt / tot) * 100 : 0;
  return `<div class="pstack">
      ${pt ? `<i style="width:${a}%;background:var(--pt)" data-tip="Prime time (PT)|${fmt(pt)}${unit} · ${a.toFixed(1)}%"></i>` : ''}
      ${npt ? `<i style="width:${100 - a}%;background:var(--npt)" data-tip="Non prime time (NPT)|${fmt(npt)}${unit} · ${(100 - a).toFixed(1)}%"></i>` : ''}
    </div>
    <div class="legend2"><span style="--c:var(--pt)"><b>PT</b> ${fmt(pt)}${unit} (${a.toFixed(1)}%)</span><span style="--c:var(--npt)"><b>NPT</b> ${fmt(npt)}${unit} (${(100 - a).toFixed(1)}%)</span></div>`;
}

// 64,075,666 → "64.1M"
export const short = (n) => {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
};
