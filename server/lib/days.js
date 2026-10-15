// Turns any day text ("MON TO FRI", "SAT - SUN", "Wkdays", "Sat.day",
// "Tue-Fri", "DAILY", "Poya Days") into a set of weekdays (0 = Mon … 6 = Sun).

const NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const ALL = [0, 1, 2, 3, 4, 5, 6];

function range(a, b) {
  const out = [];
  for (let i = a; ; i = (i + 1) % 7) {
    out.push(i);
    if (i === b) break;
  }
  return out;
}

function parseDays(text) {
  const result = { days: new Set(), poya: false, text: text == null ? '' : String(text) };
  if (text === null || text === undefined) return result;
  let s = String(text).toUpperCase().replace(/[.]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return result;

  if (/POYA/.test(s)) result.poya = true;
  if (/\b(DAILY|EVERY ?DAY|ALL ?DAYS|7 ?DAYS|MON(DAY)? ?(-|TO) ?SUN(DAY)?)\b/.test(s)) ALL.forEach((d) => result.days.add(d));
  if (/\b(WEEK ?DAYS?|WK ?DAYS?)\b/.test(s)) range(0, 4).forEach((d) => result.days.add(d));
  if (/\b(WEEK ?ENDS?|WK ?ENDS?)\b/.test(s)) [5, 6].forEach((d) => result.days.add(d));

  // Individual day names, with "X TO Y" / "X - Y" ranges.
  const re = /\b(MON|TUE|WED|THU|FRI|SAT|SUN)[A-Z]*\b/g;
  const hits = [];
  let m;
  while ((m = re.exec(s))) hits.push({ day: NAMES.indexOf(m[1]), start: m.index, end: m.index + m[0].length });
  for (let i = 0; i < hits.length; i++) {
    const next = hits[i + 1];
    if (next && /^\s*(-|–|TO|THRU|THROUGH|UPTO)\s*$/.test(s.slice(hits[i].end, next.start))) {
      range(hits[i].day, next.day).forEach((d) => result.days.add(d));
      i++;
    } else {
      result.days.add(hits[i].day);
    }
  }
  return result;
}

// 0..1: share of the agency's days the program covers (mostly), plus how
// much of the program's week that is (a little, to prefer tighter patterns).
function dayScore(agency, program) {
  if (agency.poya || program.poya) {
    if (agency.poya && program.poya) return 1;
    if (program.poya && !program.days.size) return 0;
  }
  if (!agency.days.size) return 0.5; // agency left the day blank: neutral
  if (!program.days.size) return 0;
  let common = 0;
  for (const d of agency.days) if (program.days.has(d)) common++;
  if (!common) return 0;
  return 0.75 * (common / agency.days.size) + 0.25 * (common / program.days.size);
}

function describe(parsed) {
  const d = [...parsed.days].sort();
  const parts = [];
  if (d.length === 7) parts.push('Daily');
  else if (d.join() === '0,1,2,3,4') parts.push('Mon–Fri');
  else if (d.join() === '5,6') parts.push('Sat–Sun');
  else if (d.length) parts.push(d.map((i) => NAMES[i][0] + NAMES[i].slice(1).toLowerCase()).join(', '));
  if (parsed.poya) parts.push('Poya');
  return parts.join(' + ') || '-';
}

module.exports = { parseDays, dayScore, describe };
