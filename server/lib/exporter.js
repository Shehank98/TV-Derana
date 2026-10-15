// Excel report:
//   Summary          — schedule details, Option 01 / Option 02, KPIs, PT/NPT split, category summary
//   Program Analysis — the team's familiar table (durations, Total 30s, R/C rate, value, discounted, % investment)
//   Schedule Lines   — every agency line and what it was matched to
//   Not Priced       — removed / unmatched / zero-spot rows
const ExcelJS = require('exceljs');
const { model, hhmm } = require('./report');

const RED = 'FFC8102E';
const RED_LIGHT = 'FFFDECEE';
const INK = 'FF1B1F2A';
const MUTED = 'FF5A6273';
const GREY = 'FFF3F4F8';
const LINE = 'FFD9DDE6';
const YELLOW = 'FFFFF4BF';
const WHITE = 'FFFFFFFF';
const MONEY = '#,##0.00';
const INT = '#,##0';
const DEC1 = '#,##0.0';
const PCT = '0.0%';
const thin = { style: 'thin', color: { argb: LINE } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

const fill = (cell, argb) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }; };
const landscape = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
  margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };

// Small writer that tracks the current row on a sheet.
function writer(ws, lastCol) {
  const w = { r: 1 };
  w.band = (text, { size = 12, color = INK, bg = null, height = 20, bold = true } = {}) => {
    ws.mergeCells(w.r, 1, w.r, lastCol);
    const c = ws.getCell(w.r, 1);
    c.value = text;
    c.font = { bold, size, color: { argb: color } };
    if (bg) fill(c, bg);
    c.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(w.r).height = height;
    w.r++;
  };
  w.section = (text) => {
    w.r++;
    ws.mergeCells(w.r, 1, w.r, lastCol);
    const c = ws.getCell(w.r, 1);
    c.value = text;
    c.font = { bold: true, size: 12, color: { argb: RED } };
    c.border = { bottom: { style: 'medium', color: { argb: RED } } };
    w.r += 2;
  };
  w.header = (labels) => {
    labels.forEach((l, i) => {
      const c = ws.getCell(w.r, i + 1);
      c.value = l;
      c.font = { bold: true, color: { argb: WHITE } };
      fill(c, INK);
      c.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle', wrapText: true };
      c.border = box;
    });
    ws.getRow(w.r).height = 30;
    w.r++;
  };
  w.row = (vals, fmts, { bold = false, bg = null, center = [] } = {}) => {
    vals.forEach((v, i) => {
      const c = ws.getCell(w.r, i + 1);
      c.value = v;
      if (fmts[i]) c.numFmt = fmts[i];
      c.border = box;
      c.alignment = { horizontal: i === 0 ? 'left' : center.includes(i) ? 'center' : 'right', vertical: 'middle' };
      c.font = { bold };
      if (bg) fill(c, bg);
    });
    w.r++;
  };
  return w;
}

function titleBlock(ws, w, s, m, subtitle) {
  w.band('TV DERANA', { size: 20, color: WHITE, bg: RED, height: 34 });
  w.band(`${subtitle}  ·  ${s.client_name}  ·  ${m.info[2][1]}  ·  Schedule No ${s.schedule_no}`, { bg: RED_LIGHT, height: 22 });
}

async function buildWorkbook(s) {
  const m = model(s);
  const t = m.t;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TV Derana Schedule System';
  wb.created = new Date();
  const footer = { oddFooter: `&L${s.schedule_no} · ${s.client_name} · ${m.info[2][1]}&RPage &P of &N` };

  // ── Summary ────────────────────────────────────────────────────────────
  const ws = wb.addWorksheet('Summary', { views: [{ showGridLines: false }], pageSetup: { ...landscape, fitToHeight: 1 }, headerFooter: footer });
  ws.columns = [{ width: 30 }, { width: 16 }, { width: 18 }, { width: 18 }, { width: 30 }, { width: 16 }, { width: 18 }];
  const w = writer(ws, 7);
  titleBlock(ws, w, s, m, m.title);
  w.r++;

  // Details: two label/value pairs per row
  const half = Math.ceil(m.info.length / 2);
  for (let i = 0; i < half; i++) {
    const put = (col, pair) => {
      if (!pair) return;
      const lc = ws.getCell(w.r, col);
      lc.value = pair[0];
      lc.font = { color: { argb: MUTED } };
      ws.mergeCells(w.r, col + 1, w.r, col + 2);
      const vc = ws.getCell(w.r, col + 1);
      vc.value = pair[1];
      vc.font = { bold: true, color: { argb: INK } };
    };
    put(1, m.info[i]);
    put(5, m.info[i + half]);
    w.r++;
  }

  // Option 01 / Option 02, laid out like the team's sheet
  w.section('FINANCIAL SUMMARY');
  const top = w.r;
  const optBox = (col, n, heading, o, input) => {
    const sel = m.selected === n && o;
    ws.mergeCells(top, col, top, col + 2);
    const h = ws.getCell(top, col);
    h.value = heading + (sel ? '   ✔ used in this report' : '');
    h.font = { bold: true, color: { argb: sel ? WHITE : RED }, underline: !sel };
    if (sel) fill(h, RED);
    [['Total Rate Card Value', t.trv, MONEY], ['Package Value', o ? o.package : '—', MONEY], ['Discount %', o ? o.discount_pct / 100 : '—', PCT]]
      .forEach(([k, v, f], i) => {
        const rr = top + 1 + i;
        ws.mergeCells(rr, col, rr, col + 1);
        const kc = ws.getCell(rr, col);
        const isDisc = k === 'Discount %';
        kc.value = k;
        kc.alignment = { horizontal: 'right' };
        kc.font = { bold: isDisc, color: { argb: isDisc ? RED : INK } };
        const vc = ws.getCell(rr, col + 2);
        vc.value = v;
        vc.numFmt = f;
        vc.alignment = { horizontal: 'right' };
        vc.font = { bold: true, color: { argb: isDisc ? RED : INK } };
        if (k === input) fill(vc, YELLOW);
        for (let c = col; c <= col + 2; c++) ws.getCell(rr, c).border = box;
      });
  };
  optBox(1, 1, 'Option 01 — Package Value to Discount', m.option1, 'Package Value');
  optBox(5, 2, 'Option 02 — Discount to Package Value', m.option2, 'Discount %');
  w.r = top + 5;

  const kpis = [
    ['Total spots', t.spots, INT], ['Total seconds', t.seconds, INT], ['Total 30-sec equivalents', t.units, DEC1],
    ['Total rate card value (LKR)', t.trv, MONEY], [`Final package value — Option 0${m.selected} (LKR)`, t.package, MONEY],
    ['Overall discount', t.discount_pct / 100, PCT],
  ];
  if (Math.abs(t.base_value - t.trv) > 0.5) kpis.splice(4, 0, ['Value at published base rates (LKR)', t.base_value, MONEY]);
  for (const [k, v, f] of kpis) {
    ws.getCell(w.r, 1).value = k;
    ws.getCell(w.r, 1).font = { color: { argb: MUTED }, bold: /Final/.test(k) };
    ws.mergeCells(w.r, 2, w.r, 3);
    const c = ws.getCell(w.r, 2);
    c.value = v; c.numFmt = f; c.alignment = { horizontal: 'right' };
    c.font = { bold: true, color: { argb: /Final/.test(k) ? RED : INK } };
    w.r++;
  }

  w.section('SPOT MIX — PRIME TIME (PT) / NON PRIME TIME (NPT)');
  w.header(['Time band', 'Spots', '% Spots', '30s Eq.', 'R/C Value (LKR)', 'Package Value (LKR)', '% Value']);
  const splitFmt = [null, INT, PCT, DEC1, MONEY, MONEY, PCT];
  for (const p of m.split) w.row([p.label, p.spots, p.spot_share, p.units, p.value, p.discounted, p.value_share], splitFmt);
  w.row(['Total', t.spots, 1, t.units, t.trv, t.package, 1], splitFmt, { bold: true, bg: YELLOW });

  w.section('SUMMARY BY CATEGORY');
  w.header(['Category', 'Spots', '30s Eq.', 'R/C Value (LKR)', 'Package Value (LKR)', '% Investment']);
  const catFmt = [null, INT, DEC1, MONEY, MONEY, PCT];
  for (const c of m.categories) w.row([c.name, c.spots, c.units, c.value, c.discounted, c.share], catFmt);
  w.row(['Total', t.spots, t.units, t.trv, t.package, 1], catFmt, { bold: true, bg: YELLOW });
  w.r++;
  ws.mergeCells(w.r, 1, w.r, 7);
  ws.getCell(w.r, 1).value = 'Rates per 30 seconds; other durations are pro-rata. Prevailing taxes are to be added. Special events are negotiated separately.';
  ws.getCell(w.r, 1).font = { italic: true, size: 9, color: { argb: 'FF7B8294' } };

  // ── Program analysis ──────────────────────────────────────────────────
  const durs = m.durations;
  const nCols = 2 + durs.length + 6;
  const pa = wb.addWorksheet('Program Analysis', { views: [{ showGridLines: false }], pageSetup: landscape, headerFooter: footer });
  pa.columns = [{ width: 34 }, { width: 9 }, ...durs.map(() => ({ width: 8 })), { width: 10 }, { width: 11 }, { width: 13 }, { width: 18 }, { width: 20 }, { width: 13 }];
  const p = writer(pa, nCols);
  titleBlock(pa, p, s, m, 'Program Analysis Details');
  p.r++;
  p.header(['Program', 'PT/NPT', ...durs.map((d) => `${d}s`), 'Total Spots', 'Total 30s', 'R/C Rate Rs', 'Value Rs', 'Discounted Value Rs', '% From Investment']);
  pa.views = [{ state: 'frozen', ySplit: p.r - 1, showGridLines: false }];
  const off = 2 + durs.length;
  const fmts = [null, null, ...durs.map(() => INT), INT, DEC1, INT, MONEY, MONEY, PCT];
  for (const g of m.programGroups) {
    pa.mergeCells(p.r, 1, p.r, nCols);
    const gc = pa.getCell(p.r, 1);
    gc.value = g.category;
    gc.font = { bold: true, color: { argb: RED } };
    fill(gc, RED_LIGHT);
    p.r++;
    for (const x of g.programs) {
      p.row([x.program_name, x.is_prime ? 'PT' : 'NPT', ...durs.map((d) => x.durations[d] || null), x.spots, x.units, x.rc_rate, x.value, x.discounted, x.share], fmts, { center: [1] });
    }
    if (g.programs.length > 1) {
      const v = Array(nCols).fill(null);
      v[0] = `${g.category} subtotal`;
      v[off] = g.sub.spots; v[off + 1] = g.sub.units; v[off + 3] = g.sub.value; v[off + 4] = g.sub.discounted; v[off + 5] = g.sub.share;
      p.row(v, fmts, { bold: true, bg: GREY });
    }
  }
  const tot = Array(nCols).fill(null);
  tot[0] = 'GRAND TOTAL';
  durs.forEach((d, i) => { tot[2 + i] = m.lines.filter((l) => Number(l.dur) === d).reduce((a, l) => a + Number(l.spots), 0); });
  tot[off] = t.spots; tot[off + 1] = t.units; tot[off + 3] = t.trv; tot[off + 4] = t.package; tot[off + 5] = 1;
  p.row(tot, fmts, { bold: true, bg: YELLOW });

  // ── Schedule lines ────────────────────────────────────────────────────
  const ls = wb.addWorksheet('Schedule Lines', { views: [{ state: 'frozen', ySplit: 1 }], pageSetup: landscape, headerFooter: footer });
  ls.columns = [6, 28, 30, 12, 7, 7, 8, 7, 8, 26, 22, 8, 12, 16, 16, 12].map((x) => ({ width: x }));
  const l = writer(ls, 16);
  l.header(['Row', 'Section', 'Agency Program', 'Day', 'Start', 'End', 'Dur (s)', 'Spots', '30s Eq.', 'TV Derana Program', 'Category', 'PT/NPT',
    'R/C Rate', 'Value', 'Discounted Value', 'Matched by']);
  const lineFmt = [INT, null, null, null, null, null, INT, INT, '0.00', null, null, null, MONEY, MONEY, MONEY, null];
  for (const x of m.lines) {
    l.row([x.row, x.theme, x.program, x.day, hhmm(x.start), hhmm(x.end), Number(x.dur), Number(x.spots), x.units, x.program_name, x.category,
      x.is_prime ? 'PT' : 'NPT', x.rc_rate, x.value, x.discounted, x.status === 'manual' ? 'User' : x.status === 'belt' ? 'Time belt' : 'Auto'],
    lineFmt, { center: [3, 4, 5, 11, 15] });
    [1, 2, 9, 10].forEach((c) => { ls.getCell(l.r - 1, c + 1).alignment = { horizontal: 'left' }; });
  }

  // ── Not priced ────────────────────────────────────────────────────────
  if (m.excluded.length) {
    const xs = wb.addWorksheet('Not Priced', { views: [{ state: 'frozen', ySplit: 1 }], pageSetup: landscape, headerFooter: footer });
    xs.columns = [6, 28, 40, 12, 7, 7, 7, 7, 36].map((x) => ({ width: x }));
    const x = writer(xs, 9);
    x.header(['Row', 'Section', 'Agency Program', 'Day', 'Start', 'End', 'Dur', 'Spots', 'Reason']);
    for (const e of m.excluded) {
      x.row([e.row, e.theme, e.program, e.day, hhmm(e.start), hhmm(e.end), e.dur ?? null, e.spots ?? null, e.reason], [INT], { center: [3, 4, 5] });
      [1, 2, 8].forEach((c) => { xs.getCell(x.r - 1, c + 1).alignment = { horizontal: 'left' }; });
    }
  }

  return wb.xlsx.writeBuffer();
}

module.exports = { buildWorkbook };
