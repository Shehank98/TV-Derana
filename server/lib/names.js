// Program-name normalisation and fuzzy comparison.
//
// Agency sheets spell Sinhala titles freely ("DHEVANI INIMA" vs "Deveni Inima",
// "SANGEETHE" vs "Sangeethe"), add times ("18:55 ADA DERANA"), plurals
// ("WEEKDAY MOVIE" vs "Weekday Movies") and channel prefixes ("DERANA DREAM
// STAR"). We compare token by token, allowing a consonant "skeleton" match.

const STOP = new Set(['THE', 'AND', 'OF', 'ON', 'WITH', 'AM', 'PM', 'TV', 'PROGRAM', 'PROGRAMME', 'NEWS', 'SHOW']);

function normalizeName(raw) {
  let s = String(raw || '').toUpperCase();
  const repeat = /\b(RPT|REPEAT|RERUN|RE-RUN)\b/.test(s);
  s = s
    .replace(/\b\d{1,2}\s*[:.]\s*\d{2}\s*(AM|PM)?\b/g, ' ')   // 18:55, 10.00PM
    .replace(/\b\d{1,2}\s*(AM|PM)\b/g, ' ')                     // 7pm
    .replace(/\+/g, ' PLUS ')
    .replace(/(\d)([A-Z])/g, '$1 $2')                           // 60PLUS → 60 PLUS
    .replace(/\b(RPT|REPEAT|RERUN|RE-RUN)\b/g, ' ')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = s.split(' ').filter((t) => t && !STOP.has(t)).map(singular);
  return { tokens, repeat, key: tokens.join(' ') };
}

function singular(t) {
  if (t.length > 3 && t.endsWith('S') && !/(SS|US|IS)$/.test(t)) return t.slice(0, -1);
  return t;
}

// Consonant skeleton: DHEVANI → DVN, DEVENI → DVN, SANGEETHE → SNGT.
function skeleton(t) {
  return t[0] + t.slice(1).replace(/[AEIOUYH]/g, '').replace(/(.)\1+/g, '$1');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

function tokenSim(a, b) {
  if (a === b) return 1;
  if (a.length < 4 || b.length < 4) return 0; // short words must match exactly
  if (skeleton(a) === skeleton(b)) return 0.9;
  const ratio = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  return ratio >= 0.75 ? ratio : 0;
}

// Average best-match of each token in `from` against tokens in `to`.
function coverage(from, to) {
  if (!from.length) return 0;
  let sum = 0;
  for (const t of from) {
    let best = 0;
    for (const u of to) best = Math.max(best, tokenSim(t, u));
    sum += best;
  }
  return sum / from.length;
}

// 0..1 similarity between two normalised names.
function nameScore(a, b) {
  if (!a.tokens.length || !b.tokens.length) return 0;
  if (a.key === b.key) return 1;
  const [short, long] = a.tokens.length <= b.tokens.length ? [a.tokens, b.tokens] : [b.tokens, a.tokens];
  return 0.7 * coverage(short, long) + 0.3 * coverage(long, short);
}

// True when every word is an item word (BILLBOARDS, SONG CARD …), i.e. the
// line describes the ad format rather than the program.
function isGenericItem(norm, genericWords) {
  const set = new Set((genericWords || []).map((w) => singular(String(w).toUpperCase())));
  return norm.tokens.length > 0 && norm.tokens.every((t) => set.has(t) || t.length <= 2);
}

module.exports = { normalizeName, nameScore, tokenSim, skeleton, isGenericItem };
