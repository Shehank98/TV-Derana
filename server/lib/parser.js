// Reads an agency campaign schedule (.xlsx) into schedule lines.
//
// Expected shape (column order and position are free; the header row is
// found by looking for "PROGRAM"):
//   PROGRAM | DAY | START TIME | END TIME | DUR | TOTAL SPOTS
// Rows with only a PROGRAM value are section headers. They become the
// "theme" (e.g. CASH BONANZA) unless they are generic labels such as
// "SPONSORSHIP BENEFITS", which are ignored. Rows with no time belt, zero
// spots or no duration are dropped (only counted in `skipped`).

const ExcelJS = require('exceljs');
const { parseTime } = require('./time');

function cellValue(cell) {
  let v = cell && cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) v = v.result;                         // formula
    else if (Array.isArray(v.richText)) v = v.richText.map((r) => r.text).join('');
    else if ('text' in v) v = v.text;                        // hyperlink
    else if (v.error) return null;
  }
  if (typeof v === 'string') {
    v = v.replace(/\s+/g, ' ').trim();
    return v === '' ? null : v;
  }
  return v;
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) && String(v).match(/\d/) ? n : null;
}

const isBlank = (v) => v === null || v === undefined || v === '';

function findHeader(ws) {
  const max = Math.min(ws.rowCount, 25);
  for (let r = 1; r <= max; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= row.cellCount; c++) {
      const v = cellValue(row.getCell(c));
      if (typeof v === 'string' && /PROGRAM/i.test(v)) return r;
    }
  }
  return null;
}

function mapColumns(ws, headerRow) {
  const row = ws.getRow(headerRow);
  const cols = {};
  const headers = [];
  for (let c = 1; c <= Math.max(row.cellCount, ws.columnCount); c++) {
    const raw = cellValue(row.getCell(c));
    const h = raw === null ? '' : String(raw).toUpperCase().trim();
    headers.push({ c, h, raw });
    if (!h) continue;
    if (cols.program === undefined && /PROGRAM/.test(h)) cols.program = c;
    else if (cols.day === undefined && /^(DAYS?|DAY PATTERN|AIR ?DAYS?)$/.test(h)) cols.day = c;
    else if (cols.start === undefined && /START/.test(h)) cols.start = c;
    else if (cols.end === undefined && /END/.test(h)) cols.end = c;
    else if (cols.time === undefined && /TIME/.test(h)) cols.time = c;
    else if (cols.dur === undefined && /^(DUR|DURATION|FCT|SEC|SECS|SECONDS|LENGTH)\b/.test(h)) cols.dur = c;
    else if (cols.spots === undefined && /TOTAL\s*SPOTS|NO\.?\s*OF\s*SPOTS|^SPOTS$|^TOTAL$/.test(h)) cols.spots = c;
    else if (cols.theme === undefined && /^(BRAND|THEME|CAMPAIGN)$/.test(h)) cols.theme = c;
  }
  // A single "TIME" column: start there, end in the next column.
  if (cols.start === undefined && cols.time !== undefined) {
    cols.start = cols.time;
    if (cols.end === undefined) cols.end = cols.time + 1;
  }
  // No total column: add up the daily / dated spot columns right of DUR.
  if (cols.spots === undefined) {
    const from = Math.max(cols.dur || 0, cols.end || 0, cols.start || 0, cols.day || 0, cols.program || 0) + 1;
    cols.spotColumns = headers
      .filter(({ c, raw }) => c >= from && (raw instanceof Date || (toNumber(raw) !== null && toNumber(raw) >= 1 && toNumber(raw) <= 31)))
      .map(({ c }) => c);
  }
  return cols;
}

function isSectionLabel(text, labels) {
  const up = text.toUpperCase();
  return (labels || []).some((l) => up.includes(String(l).toUpperCase()));
}

async function parseWorkbook(buffer, { sectionLabels = [], sheetName } = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheets = wb.worksheets.map((w) => w.name);

  let ws = null;
  let headerRow = null;
  for (const candidate of wb.worksheets) {
    if (sheetName && candidate.name !== sheetName) continue;
    const h = findHeader(candidate);
    if (h) { ws = candidate; headerRow = h; break; }
  }
  if (!ws) {
    const err = new Error('Could not find a header row containing "PROGRAM" in the uploaded file.');
    err.status = 400;
    throw err;
  }

  const cols = mapColumns(ws, headerRow);
  const missing = ['program', 'dur'].filter((k) => cols[k] === undefined);
  if (cols.spots === undefined && !(cols.spotColumns || []).length) missing.push('total spots');
  if (missing.length) {
    const err = new Error(`Missing column(s): ${missing.join(', ')}. Expected PROGRAM, DAY, START TIME, END TIME, DUR, TOTAL SPOTS.`);
    err.status = 400;
    throw err;
  }

  const lines = [];
  let skipped = 0;
  let theme = '';
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (c) => (c === undefined ? null : cellValue(row.getCell(c)));
    const programRaw = get(cols.program);
    if (isBlank(programRaw)) continue;
    const program = String(programRaw).trim();
    const day = get(cols.day);
    const startRaw = get(cols.start);
    const endRaw = get(cols.end);
    const dur = toNumber(get(cols.dur));
    let spots;
    if (cols.spots !== undefined) spots = toNumber(get(cols.spots));
    else spots = cols.spotColumns.reduce((s, c) => s + (toNumber(get(c)) || 0), 0);
    if (cols.theme !== undefined && !isBlank(get(cols.theme))) theme = String(get(cols.theme));

    const start = parseTime(startRaw);
    const end = parseTime(endRaw);

    // Section header: only the program cell is filled.
    if (isBlank(day) && start === null && dur === null && !spots) {
      if (!isSectionLabel(program, sectionLabels)) theme = program;
      continue;
    }

    // Rows without a time belt, without spots or without a duration are ignored entirely.
    if (start === null || !spots || !dur) { skipped++; continue; }
    lines.push({ row: r, theme, program, day: day === null ? '' : String(day), start, end, dur, spots });
  }

  return { sheet: ws.name, sheets, headerRow, columns: cols, lines, skipped };
}

module.exports = { parseWorkbook, cellValue };
