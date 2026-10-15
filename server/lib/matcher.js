// Matches agency schedule lines to TV Derana programs.
//
// Every program is scored on three signals:
//   name (50%)  — line name, or the theme/section name when the line is just an
//                 ad format ("BILLBOARDS", "SONG CARD"); learned aliases count as exact
//   time (30%)  — overlap between the agency time belt and the program belt
//   day  (20%)  — overlap between the agency days and the program day pattern
// A program with no day overlap is never a candidate. A program with no time
// overlap is only a (weak) candidate when the name is a near-exact match.
// When no name matches, the best day + time belt fit is proposed instead.

const { normalizeName, nameScore, isGenericItem } = require('./names');
const { parseDays, dayScore } = require('./days');
const { interval, fromDb, timeScore } = require('./time');

const W_NAME = 0.5;
const W_TIME = 0.3;
const W_DAY = 0.2;

function prepPrograms(programs) {
  return programs.filter((p) => p.active !== false).map((p) => {
    const norm = normalizeName(p.name);
    return {
      ...p,
      _norm: norm,
      _aliases: (p.aliases || []).map((a) => normalizeName(a)),
      _days: parseDays(p.day_pattern),
      _int: interval(fromDb(p.start_time), fromDb(p.end_time)),
    };
  });
}

function bestName(lineNorm, p) {
  let s = nameScore(lineNorm, p._norm);
  for (const a of p._aliases) {
    if (a.key === lineNorm.key) return 1;
    s = Math.max(s, nameScore(lineNorm, a));
  }
  return s;
}

function scoreProgram(ctx, p) {
  const { lineNorm, themeNorm, lineGeneric, days, int } = ctx;
  const day = dayScore(days, p._days);
  if (day === 0) return null;
  const time = timeScore(int, p._int);

  let name = 0;
  let basis = 'none';
  if (!p.is_generic) {
    const viaLine = lineGeneric ? 0 : bestName(lineNorm, p);
    const viaTheme = themeNorm && themeNorm.tokens.length ? bestName(themeNorm, p) * 0.9 : 0;
    if (viaLine >= viaTheme && viaLine > 0) { name = viaLine; basis = 'name'; }
    else if (viaTheme > 0) { name = viaTheme; basis = 'theme'; }
    // "Nikini Kusum" should prefer the first run over "Nikini Kusum Rpt".
    const nameUsed = basis === 'theme' ? themeNorm : lineNorm;
    if (name > 0 && nameUsed.repeat !== p._norm.repeat) name *= 0.85;
  }

  if (time === 0 && name < 0.9) return null;
  let total = W_NAME * name + W_TIME * time + W_DAY * day;
  if (time === 0) total *= 0.6;          // right name, wrong slot: weak
  if (p.is_generic) total *= 0.9;         // catch-all belts lose ties to real shows
  return { program_id: p.id, name: round(name), time: round(time), day: round(day), total: round(total), basis };
}

const round = (n) => Math.round(n * 1000) / 1000;

function matchLine(line, programs, aliasIndex, settings = {}) {
  const autoThr = settings.match_auto_threshold ?? 0.8;
  const lineNorm = normalizeName(line.program);
  const themeNorm = line.theme ? normalizeName(line.theme) : null;
  const ctx = {
    lineNorm,
    themeNorm,
    lineGeneric: isGenericItem(lineNorm, settings.generic_item_words),
    days: parseDays(line.day),
    int: interval(line.start, line.end),
  };

  const scored = [];
  for (const p of programs) {
    const s = scoreProgram(ctx, p);
    if (s) scored.push(s);
  }
  scored.sort((a, b) => b.total - a.total);
  const candidates = scored.slice(0, 6);
  const best = candidates[0];

  if (!best) return { program_id: null, status: 'unmatched', confidence: 0, reason: 'No program airs on these days / times', candidates };

  let status;
  let reason;
  const learned = aliasIndex && aliasIndex.has(lineNorm.key) && aliasIndex.get(lineNorm.key).has(best.program_id);
  if (best.basis === 'none' || best.name < 0.5) {
    status = 'belt';
    reason = 'Name not recognised — matched by day & time belt';
  } else if (best.name >= autoThr && best.time >= 0.5 && best.day >= 0.5) {
    status = 'matched';
    reason = learned ? 'Learned alias' : best.basis === 'theme' ? `Matched via section "${line.theme}"` : 'Name, day & time match';
  } else {
    status = 'review';
    reason = best.time < 0.5 ? 'Name matches but time belt differs' : best.day < 0.5 ? 'Name matches but days differ' : 'Partial name match';
  }
  // Two different programs almost tied: ask a human.
  const second = candidates[1];
  if (status === 'matched' && second && best.total - second.total < 0.03 && second.program_id !== best.program_id) {
    status = 'review';
    reason = 'Two programs fit almost equally — please confirm';
  }
  return { program_id: best.program_id, status, confidence: best.total, reason, candidates };
}

function matchAll(lines, programs, aliases = [], settings = {}) {
  const prepared = prepPrograms(programs);
  const aliasIndex = new Map();
  for (const a of aliases) {
    if (!aliasIndex.has(a.alias_norm)) aliasIndex.set(a.alias_norm, new Set());
    aliasIndex.get(a.alias_norm).add(a.program_id);
  }
  return lines.map((line) => ({ ...line, match: matchLine(line, prepared, aliasIndex, settings) }));
}

module.exports = { matchAll, matchLine, prepPrograms };
