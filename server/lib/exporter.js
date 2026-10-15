// Builds the quotation workbook: Summary, Program Summary, Schedule Lines,
// and (if any) Not Priced.
const ExcelJS = require('exceljs');
const { fmt } = require('./time');

const RED = 'FFB3121E';
const GREY = 'FFF2F2F2';
const MONEY = '#,##0.00';
const MONEY0 = '#,##0';

function header(ws, rowNo, labels) {
  const row = ws.getRow(rowNo);
  labels.forEach((l, i) => {
    const c = row.getCell(i + 1);
    c.value = l;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  row.height = 28;
}

function widths(ws, list) { list.forEach((w, i) => { ws.getColumn(i + 1).width = w; }); }

async function buildWorkbook(q, result) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TV Derana Quotation System';
  const t = result.totals;

  // ── Summary ──
  const s = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
  widths(s, [34, 26]);
  s.mergeCells('A1:B1');
  s.getCell('A1').value = 'TV DERANA — ADVERTISING QUOTATION';
  s.getCell('A1').font = { bold: true, size: 16, color: { argb: RED } };
  const info = [
    ['Quotation ref', q.ref || '(not saved)'],
    ['Campaign', q.title || ''],
    ['Agency', q.agency_name || ''],
    ['Client', q.client_name || ''],
    ['Client pricing', q.pricing_label || ''],
    ['Source file', q.file_name || ''],
    ['Date', new Date(q.created_at || Date.now()).toLocaleDateString('en-GB')],
  ];
  let r = 3;
  for (const [k, v] of info) { s.getCell(`A${r}`).value = k; s.getCell(`A${r}`).font = { bold: true }; s.getCell(`B${r}`).value = v; r++; }
  r++;
  const money = [
    ['Total spots', t.spots, MONEY0],
    ['Total seconds', t.seconds, MONEY0],
    ['30-sec equivalents', t.units, '#,##0.00'],
    ['Rate card value (LKR)', t.gross, MONEY],
    ['Client rate value (LKR)', t.net, MONEY],
    ['Client discount', t.client_discount_pct / 100, '0.00%'],
  ];
  if (t.package_price) {
    money.push(['Package price (LKR)', t.package_price, MONEY]);
    money.push(['Additional discount on client rates', t.extra_discount_pct / 100, '0.00%']);
  }
  money.push(['Total discount vs rate card', t.total_discount_pct / 100, '0.00%']);
  money.push(['Final value (LKR)', t.final, MONEY]);
  if (t.tax_pct) {
    money.push([`Tax ${t.tax_pct}% (LKR)`, t.tax, MONEY]);
    money.push(['Grand total (LKR)', t.grand_total, MONEY]);
  }
  for (const [k, v, f] of money) {
    s.getCell(`A${r}`).value = k;
    s.getCell(`B${r}`).value = v;
    s.getCell(`B${r}`).numFmt = f;
    s.getCell(`B${r}`).alignment = { horizontal: 'right' };
    if (/Final|Grand/.test(k)) { s.getCell(`A${r}`).font = { bold: true }; s.getCell(`B${r}`).font = { bold: true, color: { argb: RED } }; }
    r++;
  }
  r++;
  s.getCell(`A${r}`).value = 'Prime / Non-prime split'; s.getCell(`A${r}`).font = { bold: true }; r++;
  for (const k of ['PT', 'NPT']) {
    const p = result.prime[k];
    s.getCell(`A${r}`).value = `${k === 'PT' ? 'Prime time' : 'Non-prime'} — ${p.spots} spots`;
    s.getCell(`B${r}`).value = p.final; s.getCell(`B${r}`).numFmt = MONEY; r++;
  }
  r++;
  s.getCell(`A${r}`).value = 'Rates are per 30 seconds; other durations are pro-rata. Prevailing taxes apply.';
  s.getCell(`A${r}`).font = { italic: true, color: { argb: 'FF666666' } };

  // ── Program Summary ──
  const ps = wb.addWorksheet('Program Summary', { views: [{ state: 'frozen', ySplit: 1 }] });
  const durs = result.durations;
  const cols = ['Category', 'Program', 'PT/NPT', ...durs.map((d) => `${d}s`), 'Spots', '30s Eq.', 'Base Rate', 'Client Rate',
    'Rate Card Value', 'Client Value', 'Final Value', '% Investment'];
  header(ps, 1, cols);
  widths(ps, [22, 34, 8, ...durs.map(() => 7), 8, 9, 13, 13, 16, 16, 16, 12]);
  r = 2;
  const cats = [...new Set(result.byProgram.map((p) => p.category))];
  for (const cat of cats) {
    for (const p of result.byProgram.filter((x) => x.category === cat)) {
      const row = ps.getRow(r++);
      const vals = [cat, p.program_name, p.is_prime ? 'PT' : 'NPT', ...durs.map((d) => p.durations[d] || null),
        p.spots, p.units, p.base_rate, p.client_rate, p.gross, p.net, p.final, t.final ? p.final / t.final : 0];
      row.values = vals;
      const off = 3 + durs.length;
      row.getCell(off + 2).numFmt = '0.00';
      for (let i = off + 3; i <= off + 7; i++) row.getCell(i).numFmt = MONEY;
      row.getCell(off + 8).numFmt = '0.00%';
    }
  }
  const tot = ps.getRow(r);
  const off = 3 + durs.length;
  tot.getCell(1).value = 'TOTAL';
  durs.forEach((d, i) => { tot.getCell(4 + i).value = result.lines.filter((l) => Number(l.dur) === d).reduce((a, l) => a + Number(l.spots), 0); });
  tot.getCell(off + 1).value = t.spots;
  tot.getCell(off + 2).value = t.units; tot.getCell(off + 2).numFmt = '0.00';
  tot.getCell(off + 5).value = t.gross; tot.getCell(off + 6).value = t.net; tot.getCell(off + 7).value = t.final;
  for (let i = off + 5; i <= off + 7; i++) tot.getCell(i).numFmt = MONEY;
  tot.getCell(off + 8).value = 1; tot.getCell(off + 8).numFmt = '0.00%';
  tot.eachCell((c) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY } }; });

  // ── Schedule lines ──
  const ls = wb.addWorksheet('Schedule Lines', { views: [{ state: 'frozen', ySplit: 1 }] });
  header(ls, 1, ['Row', 'Section', 'Agency Program', 'Day', 'Start', 'End', 'Dur', 'Spots', '30s Eq.', 'Matched Program',
    'Rate Slot', 'PT/NPT', 'Base Rate', 'Client Rate', 'Rate Basis', 'Rate Card Value', 'Client Value', 'Final Value']);
  widths(ls, [6, 24, 30, 12, 7, 7, 6, 7, 8, 24, 30, 7, 12, 12, 26, 15, 15, 15]);
  r = 2;
  for (const l of result.lines) {
    const row = ls.getRow(r++);
    row.values = [l.row, l.theme, l.program, l.day, fmt(l.start), fmt(l.end), Number(l.dur), Number(l.spots), l.units,
      l.program_name, l.slot_name, l.is_prime ? 'PT' : 'NPT', l.base_rate, l.client_rate, l.rate_basis, l.gross, l.net, l.final];
    row.getCell(9).numFmt = '0.00';
    for (const i of [13, 14, 16, 17, 18]) row.getCell(i).numFmt = MONEY;
  }

  // ── Not priced ──
  const extra = [...(result.unpriced || []).map((u) => ({ ...u, reason: u.reason })), ...(q.extras || [])];
  if (extra.length) {
    const xs = wb.addWorksheet('Not Priced');
    header(xs, 1, ['Row', 'Section', 'Agency Program', 'Day', 'Start', 'End', 'Dur', 'Spots', 'Reason']);
    widths(xs, [6, 24, 40, 12, 7, 7, 6, 7, 40]);
    r = 2;
    for (const e of extra) {
      xs.getRow(r++).values = [e.row, e.theme, e.program, e.day, fmt(e.start), fmt(e.end), e.dur ?? null, e.spots ?? null, e.reason];
    }
  }

  return wb.xlsx.writeBuffer();
}

module.exports = { buildWorkbook };
