// Times are handled as minutes from midnight. An interval whose end is not
// after its start runs past midnight, so its end gets +1440.

const DAY = 1440;

// Accepts Excel Date objects, Excel day fractions (0.5 = 12:00), "22:00",
// "22:00:00", "10.30 PM", "10pm", "1930". Returns minutes or null.
function parseTime(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    // exceljs stores time-only cells as dates on 1899-12-30 in UTC.
    return value.getUTCHours() * 60 + value.getUTCMinutes() + Math.round(value.getUTCSeconds() / 60);
  }
  if (typeof value === 'number') {
    if (value >= 0 && value < 1) return Math.round(value * DAY) % DAY;
    if (value >= 1 && value <= 2400 && Number.isInteger(value)) return hhmm(Math.floor(value / 100), value % 100);
    return null;
  }
  const s = String(value).trim().toUpperCase();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})\s*[:.]\s*(\d{2})(?:\s*[:.]\s*\d{2})?\s*(AM|PM|A\.M\.|P\.M\.)?$/);
  if (m) return hhmm(+m[1], +m[2], m[3]);
  m = s.match(/^(\d{1,2})\s*(AM|PM)$/);
  if (m) return hhmm(+m[1], 0, m[2]);
  m = s.match(/^(\d{3,4})$/);
  if (m) return hhmm(Math.floor(+m[1] / 100), +m[1] % 100);
  const n = Number(s);
  if (!Number.isNaN(n)) return parseTime(n);
  return null;
}

function hhmm(h, m, ampm) {
  if (ampm) {
    const pm = ampm.startsWith('P');
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  if (h === 24 && m === 0) return 0;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function fmt(min) {
  if (min === null || min === undefined) return '';
  const t = ((min % DAY) + DAY) % DAY;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// "HH:MM[:SS]" from Postgres TIME → minutes.
function fromDb(t) {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
}

function interval(start, end) {
  if (start === null || start === undefined) return null;
  if (end === null || end === undefined) return { start, end: start + 30 }; // assume a half-hour slot
  return { start, end: end > start ? end : end + DAY };
}

function overlap(a, b) {
  // Try b shifted by a day either way so belts that cross midnight still compare.
  let best = 0;
  for (const shift of [-DAY, 0, DAY]) {
    const o = Math.min(a.end, b.end + shift) - Math.max(a.start, b.start + shift);
    if (o > best) best = o;
  }
  return best;
}

function startDistance(a, b) {
  const d = Math.abs(a.start - b.start) % DAY;
  return Math.min(d, DAY - d);
}

// 0..1: how well the agency's time belt fits the program's belt.
// Mostly "is the agency belt inside the program", partly "is it a tight fit".
function timeScore(a, b) {
  if (!a || !b) return 0;
  const o = overlap(a, b);
  if (o > 0) {
    const lenA = a.end - a.start;
    const lenB = b.end - b.start;
    return 0.6 * (o / lenA) + 0.4 * (o / lenB);
  }
  const d = startDistance(a, b);
  if (d <= 10) return 0.35;
  if (d <= 20) return 0.2;
  return 0;
}

module.exports = { parseTime, fmt, fromDb, interval, overlap, timeScore, DAY };
