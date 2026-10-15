// PDF report (A4 landscape) built with pdfkit from a saved schedule.
//  Page 1  : header, schedule details, KPIs, Option 01 / Option 02, PT/NPT split, category summary
//  Page 2+ : program analysis details (durations pivot, R/C rate, value, discounted, % investment)
//  Appendix: schedule lines and rows not priced
const PDFDocument = require('pdfkit');
const { model, hhmm } = require('./report');

const C = {
  red: '#c8102e', redLight: '#fdecee', ink: '#1b1f2a', ink2: '#4a5163', muted: '#7b8294',
  line: '#e1e4eb', zebra: '#f7f8fb', head: '#1b1f2a', pt: '#c8102e', npt: '#2f6fb5', yellow: '#fff4bf',
};
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const money = (n) => (n === null || n === undefined ? '-' : nf2.format(n));
const int = (n) => (n === null || n === undefined || n === '' ? '' : nf0.format(n));
const pct = (f) => `${nf1.format(f * 100)}%`;
// Standard PDF fonts are WinAnsi: replace the few characters it lacks.
const txt = (s) => String(s ?? '').replace(/[−–]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF—·•]/g, '?');

function buildPdf(s) {
  const m = model(s);
  const t = m.t;
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true,
    info: { Title: `Schedule ${s.schedule_no} - ${s.client_name}`, Author: 'TV Derana', Subject: 'Schedule Analysis Report' } });
  const chunks = [];
  doc.on('data', (b) => chunks.push(b));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const L = doc.page.margins.left;
  const W = doc.page.width - L - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 18;

  const pageHeader = () => {
    doc.save().rect(0, 0, doc.page.width, 6).fill(C.red).restore();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.red).text('TV DERANA', L, 16, { continued: true })
      .font('Helvetica').fillColor(C.muted).text(txt(`   Schedule Analysis Report  ·  ${s.client_name}  ·  ${m.info[2][1]}`));
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.ink).text(txt(`Schedule No ${s.schedule_no}`), L, 16, { width: W, align: 'right' });
    doc.moveTo(L, 32).lineTo(L + W, 32).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.y = 44;
  };
  const newPage = () => { doc.addPage(); pageHeader(); };
  const ensure = (h) => { if (doc.y + h > bottom()) newPage(); };

  const sectionTitle = (label, need = 40) => {
    ensure(need);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.red).text(label.toUpperCase(), L, doc.y, { characterSpacing: 0.5 });
    doc.moveTo(L, doc.y + 2).lineTo(L + W, doc.y + 2).lineWidth(1).strokeColor(C.red).stroke();
    doc.y += 8;
  };

  // Generic table with repeating header row and page breaks.
  // cols: [{ label, w (fraction of width), align }]; rows: [{ cells: [...], kind: 'group'|'sub'|'total'|undefined }]
  const table = (cols, rows, { fontSize = 8, rowH = 15, keepTogether = false } = {}) => {
    const widths = cols.map((c) => c.w * W);
    if (keepTogether) ensure((rows.length + 1) * rowH + 8);
    const drawHead = () => {
      const y = doc.y;
      doc.save().rect(L, y, W, rowH + 4).fill(C.head).restore();
      let x = L;
      cols.forEach((c, i) => {
        doc.font('Helvetica-Bold').fontSize(fontSize - 0.5).fillColor('#ffffff')
          .text(txt(c.label), x + 4, y + 5, { width: widths[i] - 8, align: c.align || 'left', lineBreak: false, ellipsis: true });
        x += widths[i];
      });
      doc.y = y + rowH + 4;
    };
    drawHead();
    rows.forEach((row, ri) => {
      if (doc.y + rowH > bottom()) { newPage(); drawHead(); }
      const y = doc.y;
      if (row.kind === 'group') {
        doc.save().rect(L, y, W, rowH).fill(C.redLight).restore();
        doc.font('Helvetica-Bold').fontSize(fontSize).fillColor(C.red).text(txt(row.cells[0]), L + 4, y + 4, { width: W - 8, lineBreak: false });
      } else {
        const bg = row.kind === 'total' ? C.yellow : row.kind === 'sub' ? '#eef0f5' : ri % 2 ? C.zebra : null;
        if (bg) doc.save().rect(L, y, W, rowH).fill(bg).restore();
        let x = L;
        cols.forEach((c, i) => {
          doc.font(row.kind || (i === 0 && c.boldFirst) ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).fillColor(C.ink)
            .text(txt(row.cells[i]), x + 4, y + 4, { width: widths[i] - 8, align: c.align || 'left', lineBreak: false, ellipsis: true });
          x += widths[i];
        });
      }
      doc.moveTo(L, y + rowH).lineTo(L + W, y + rowH).lineWidth(0.4).strokeColor(C.line).stroke();
      doc.y = y + rowH;
    });
    doc.y += 12;
  };

  // ── Page 1 ──────────────────────────────────────────────────────────────
  doc.save().rect(0, 0, doc.page.width, 78).fill(C.red).restore();
  doc.font('Helvetica-Bold').fontSize(26).fillColor('#ffffff').text('TV DERANA', L, 20);
  doc.font('Helvetica').fontSize(12).fillColor('#ffd9de').text('Schedule Analysis Report', L, 50);
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#ffffff').text(txt(`Schedule No ${s.schedule_no}`), L, 24, { width: W, align: 'right' });
  doc.font('Helvetica').fontSize(10).fillColor('#ffd9de').text(txt(`${s.client_name}  ·  ${m.info[2][1]}`), L, 46, { width: W, align: 'right' });

  // Details grid: 4 columns × 2 rows
  let y = 94;
  const colW = W / 4;
  m.info.forEach(([k, v], i) => {
    const x = L + (i % 4) * colW;
    const yy = y + Math.floor(i / 4) * 34;
    doc.font('Helvetica').fontSize(7.5).fillColor(C.muted).text(k.toUpperCase(), x, yy, { width: colW - 10, characterSpacing: 0.4 });
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(C.ink).text(txt(v), x, yy + 11, { width: colW - 10, lineBreak: false, ellipsis: true });
  });
  y += 76;

  // KPI tiles
  const kpis = [
    ['Total Rate Card Value', `LKR ${money(t.trv)}`],
    [`Package Value (Option 0${m.selected})`, `LKR ${money(t.package)}`],
    ['Discount', pct(t.discount_pct / 100)],
    ['Total Spots', int(t.spots)],
    ['30-sec Equivalents', nf1.format(t.units)],
  ];
  const kw = (W - 4 * 8) / kpis.length;
  kpis.forEach(([k, v], i) => {
    const x = L + i * (kw + 8);
    const accent = i === 1;
    doc.save().roundedRect(x, y, kw, 52, 6).fill(accent ? C.red : '#f5f6fa').restore();
    doc.font('Helvetica').fontSize(8).fillColor(accent ? '#ffd9de' : C.muted).text(txt(k), x + 10, y + 10, { width: kw - 20 });
    doc.font('Helvetica-Bold').fontSize(14).fillColor(accent ? '#ffffff' : C.ink).text(txt(v), x + 10, y + 26, { width: kw - 20, lineBreak: false, ellipsis: true });
  });
  y += 68;

  // Option 01 / Option 02
  const ow = (W - 16) / 2;
  const optionBox = (x, n, heading, o, inputLabel) => {
    const sel = m.selected === n && o;
    doc.save().roundedRect(x, y, ow, 92, 6).lineWidth(sel ? 2 : 0.8).strokeColor(sel ? C.red : C.line).stroke().restore();
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(C.red).text(heading, x + 12, y + 10, { underline: true });
    if (sel) {
      doc.save().roundedRect(x + ow - 128, y + 8, 116, 16, 8).fill(C.red).restore();
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff').text('USED IN THIS REPORT', x + ow - 128, y + 13, { width: 116, align: 'center' });
    }
    const rows = [['Total Rate Card Value', money(t.trv)], ['Package Value', o ? money(o.package) : '-'], ['Discount %', o ? pct(o.discount_pct / 100) : '-']];
    rows.forEach(([k, v], i) => {
      const yy = y + 32 + i * 18;
      const isInput = k === inputLabel;
      if (isInput) doc.save().rect(x + ow - 150, yy - 3, 138, 16).fill(C.yellow).restore();
      doc.font(k === 'Discount %' ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(k === 'Discount %' ? C.red : C.ink2)
        .text(k, x + 12, yy, { width: ow - 170 });
      doc.font('Helvetica-Bold').fontSize(10).fillColor(k === 'Discount %' ? C.red : C.ink).text(v, x + ow - 150, yy, { width: 132, align: 'right' });
    });
    if (!o) doc.font('Helvetica-Oblique').fontSize(8).fillColor(C.muted).text('Not used', x + 12, y + 78);
  };
  optionBox(L, 1, 'Option 01 - Package Value to Discount', m.option1, 'Package Value');
  optionBox(L + ow + 16, 2, 'Option 02 - Discount to Package Value', m.option2, 'Discount %');
  y += 108;
  doc.y = y;

  // PT / NPT split: stacked bar + table
  sectionTitle('Spot mix - Prime Time / Non Prime Time');
  const barY = doc.y;
  const ptShare = t.package > 0 ? m.split[0].discounted / t.package : 0;
  const ptW = Math.max(0, Math.min(1, ptShare)) * W;
  if (ptW > 0) doc.save().roundedRect(L, barY, Math.max(ptW - 1, 4), 12, 3).fill(C.pt).restore();
  if (W - ptW > 0) doc.save().roundedRect(L + ptW + 1, barY, Math.max(W - ptW - 1, 4), 12, 3).fill(C.npt).restore();
  doc.y = barY + 18;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.ink).text(`PT ${pct(ptShare)} of package value`, L, doc.y, { continued: true })
    .font('Helvetica').fillColor(C.muted).text(`      NPT ${pct(1 - ptShare)}`);
  doc.y += 6;
  table(
    [{ label: 'Time band', w: 0.25 }, { label: 'Spots', w: 0.1, align: 'right' }, { label: '% Spots', w: 0.1, align: 'right' },
      { label: '30s Eq.', w: 0.1, align: 'right' }, { label: 'R/C Value (LKR)', w: 0.16, align: 'right' },
      { label: 'Package Value (LKR)', w: 0.17, align: 'right' }, { label: '% Value', w: 0.12, align: 'right' }],
    [...m.split.map((p) => ({ cells: [p.label, int(p.spots), pct(p.spot_share), nf1.format(p.units), money(p.value), money(p.discounted), pct(p.value_share)] })),
      { kind: 'total', cells: ['Total', int(t.spots), '100.0%', nf1.format(t.units), money(t.trv), money(t.package), '100.0%'] }],
    { keepTogether: true },
  );

  sectionTitle('Summary by category', (m.categories.length + 3) * 15 + 30);
  table(
    [{ label: 'Category', w: 0.35 }, { label: 'Spots', w: 0.1, align: 'right' }, { label: '30s Eq.', w: 0.1, align: 'right' },
      { label: 'R/C Value (LKR)', w: 0.16, align: 'right' }, { label: 'Package Value (LKR)', w: 0.17, align: 'right' }, { label: '% Investment', w: 0.12, align: 'right' }],
    [...m.categories.map((c) => ({ cells: [c.name, int(c.spots), nf1.format(c.units), money(c.value), money(c.discounted), pct(c.share)] })),
      { kind: 'total', cells: ['Total', int(t.spots), nf1.format(t.units), money(t.trv), money(t.package), '100.0%'] }],
    { keepTogether: true },
  );

  // ── Program analysis ─────────────────────────────────────────────────────
  sectionTitle('Program analysis details', 140);
  const durs = m.durations;
  const fixed = 0.21 + 0.05 + 0.06 + 0.06 + 0.09 + 0.12 + 0.13 + 0.08;
  const dw = durs.length ? (1 - fixed) / durs.length : 0;
  const cols = [{ label: 'Program', w: 0.21 + (durs.length ? 0 : 1 - fixed), boldFirst: true }, { label: 'PT/NPT', w: 0.05, align: 'center' },
    ...durs.map((d) => ({ label: `${d}s`, w: dw, align: 'right' })),
    { label: 'Spots', w: 0.06, align: 'right' }, { label: 'Total 30s', w: 0.06, align: 'right' }, { label: 'R/C Rate', w: 0.09, align: 'right' },
    { label: 'Value Rs', w: 0.12, align: 'right' }, { label: 'Discounted Rs', w: 0.13, align: 'right' }, { label: '% Invest.', w: 0.08, align: 'right' }];
  const rows = [];
  for (const g of m.programGroups) {
    rows.push({ kind: 'group', cells: [g.category] });
    for (const p of g.programs) {
      rows.push({ cells: [p.program_name, p.is_prime ? 'PT' : 'NPT', ...durs.map((d) => int(p.durations[d])), int(p.spots), nf1.format(p.units),
        int(p.rc_rate), money(p.value), money(p.discounted), pct(p.share)] });
    }
    if (g.programs.length > 1) {
      rows.push({ kind: 'sub', cells: [`${g.category} subtotal`, '', ...durs.map(() => ''), int(g.sub.spots), nf1.format(g.sub.units), '', money(g.sub.value), money(g.sub.discounted), pct(g.sub.share)] });
    }
  }
  const durTotals = durs.map((d) => m.lines.filter((l) => Number(l.dur) === d).reduce((a, l) => a + Number(l.spots), 0));
  rows.push({ kind: 'total', cells: ['GRAND TOTAL', '', ...durTotals.map(int), int(t.spots), nf1.format(t.units), '', money(t.trv), money(t.package), '100.0%'] });
  table(cols, rows, { fontSize: 8, rowH: 16 });
  ensure(30);
  doc.font('Helvetica-Oblique').fontSize(8).fillColor(C.muted)
    .text('Rates are per 30 seconds; other durations are pro-rata. Prevailing taxes are to be added. Rates for special events are negotiated separately.', L, doc.y, { width: W });

  // ── Appendix ─────────────────────────────────────────────────────────────
  newPage();
  sectionTitle(`Appendix A - Schedule lines (${m.lines.length})`);
  table(
    [{ label: 'Row', w: 0.04, align: 'right' }, { label: 'Section', w: 0.15 }, { label: 'Agency program', w: 0.17 }, { label: 'Day', w: 0.08 },
      { label: 'Time', w: 0.08 }, { label: 'Dur', w: 0.04, align: 'right' }, { label: 'Spots', w: 0.05, align: 'right' },
      { label: 'TV Derana program', w: 0.15 }, { label: 'PT/NPT', w: 0.05, align: 'center' }, { label: 'R/C Rate', w: 0.08, align: 'right' },
      { label: 'Value Rs', w: 0.11, align: 'right' }],
    m.lines.map((l) => ({ cells: [l.row, l.theme, l.program, l.day, `${hhmm(l.start)}-${hhmm(l.end)}`, `${l.dur}s`, int(l.spots),
      l.program_name, l.is_prime ? 'PT' : 'NPT', int(l.rc_rate), money(l.value)] })),
    { fontSize: 7.5, rowH: 14 },
  );
  if (m.excluded.length) {
    sectionTitle(`Appendix B - Not priced (${m.excluded.length})`);
    table(
      [{ label: 'Row', w: 0.05, align: 'right' }, { label: 'Section', w: 0.2 }, { label: 'Agency program', w: 0.27 }, { label: 'Day / time', w: 0.16 },
        { label: 'Dur', w: 0.06, align: 'right' }, { label: 'Spots', w: 0.06, align: 'right' }, { label: 'Reason', w: 0.2 }],
      m.excluded.map((e) => ({ cells: [e.row, e.theme, e.program, `${e.day || ''} ${hhmm(e.start)}-${hhmm(e.end)}`, e.dur ?? '', e.spots ?? '', e.reason] })),
      { fontSize: 7.5, rowH: 14 },
    );
  }

  // Footer with page numbers on every page.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // writing inside the margin must not trigger a new page
    const fy = doc.page.height - 26;
    doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
      .text(txt(`${s.agency_name}  ·  ${s.client_name}  ·  ${m.info[2][1]}  ·  Schedule No ${s.schedule_no}`), L, fy, { width: W / 2, lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, L + W / 2, fy, { width: W / 2, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;
}

module.exports = { buildPdf };
