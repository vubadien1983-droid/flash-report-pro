/**
 * Excel and PDF of one OPS weekly Minutes of Meeting (v3.32.0).
 *
 * A meeting record, laid out like one: a title band, the meeting details,
 * the status summary, the findings table by section (with the Updated
 * Corrective Action agreed in the meeting highlighted, and the pictures of
 * the finding at the end of the row), and the "Prepared by" signature block.
 *
 * Pictures come from the LIVE finding (the MoM stores no bytes), placed with
 * the shared EMU geometry of exportImage.js (BUG-015). PDF rows never split
 * across pages (BUG-010).
 */
import {
  getImageData, sanitizeFilename, downloadBlob, excelDate,
  colWidthToPx, pxToPoints, imageAnchor, photoGrid, tileBox,
} from './exportImage';
import { OPS_STATUS_STYLE, normalizeOpsStatus, photosOf, isFileEntry, opsDateKey, formatOpsDate } from './opsFindings';
import { MOM_COLUMNS, momGroups, momStats, momName, longDate } from './opsMom';

const NAVY = 'FF1F3A5F';
const NAVY_RGB = [31, 58, 95];
const AMBER_FILL = 'FFFFF7D6';
const AMBER_RGB = [255, 247, 214];

const XL_WIDTH_OF = {
  no: 5, system: 20, subsystem_no: 13, description: 40, remark: 30, action: 32, updated_action: 34,
  status: 11, closeout_status: 22, updated_date: 12, photos_g: 30, photos_o: 26,
};
// A3 landscape, 24 pt margins: 1142 pt. Re-check the sum when a width changes.
const PDF_W_OF = {
  no: 22, system: 80, subsystem_no: 56, description: 150, remark: 110, action: 120, updated_action: 130,
  status: 48, closeout_status: 90, updated_date: 48, photos_g: 160, photos_o: 128,
};
const KEYS = MOM_COLUMNS.map((c) => c.key);
const IDX = (k) => KEYS.indexOf(k);
const LAST = KEYS.length;

const images = (item, col) => photosOf(item, col).filter((p) => p && p.url && !isFileEntry(p));

function fileBase(mom) {
  return sanitizeFilename(`${momName(mom)}_OPS Findings`);
}

const cellText = (r, key) => {
  if (key === 'no') return String(r.no ?? '');
  if (key === 'status') return normalizeOpsStatus(r.status);
  if (key === 'photos_g' || key === 'photos_o') return '';
  return String(r[key] ?? '');
};

// ══════════════════════════════════════════════════════════════════
// EXCEL
// ══════════════════════════════════════════════════════════════════

/**
 * @param mom         the MoM document
 * @param itemsById   Map(id -> live finding) — pictures come from here
 */
export async function exportMomExcel(mom, itemsById, opts = {}) {
  const { default: ExcelJS } = await import('exceljs');
  const { MOM_SIGNATURE_PNG, MOM_SIGNATURE_RATIO, MOM_SIGNER } = await import('./momSignature');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Flash Report Pro';
  wb.created = new Date();
  const m = mom.meeting || {};
  const ws = wb.addWorksheet(`MoM W${String(mom.week).padStart(2, '0')}`, {
    pageSetup: { orientation: 'landscape', paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
    headerFooter: { oddFooter: `&L${m.project || ''} — ${momName(mom)}&RPage &P of &N` },
  });
  ws.columns = KEYS.map((k) => ({ width: XL_WIDTH_OF[k] || 14 }));
  const lastL = ws.getColumn(LAST).letter;
  const font = (o = {}) => ({ name: 'Arial', size: 9.5, color: { argb: 'FF1E293B' }, ...o });
  const thin = (argb = 'FFBFC7D5') => ({ top: { style: 'thin', color: { argb } }, left: { style: 'thin', color: { argb } }, bottom: { style: 'thin', color: { argb } }, right: { style: 'thin', color: { argb } } });

  // ── Title band ────────────────────────────────────────────────
  ws.mergeCells(`A1:${lastL}1`);
  const t = ws.getCell('A1');
  t.value = 'MINUTES OF MEETING';
  t.font = { name: 'Arial', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 34;
  ws.mergeCells(`A2:${lastL}2`);
  const t2 = ws.getCell('A2');
  t2.value = `${m.title || 'Weekly OPS Findings Meeting'} — ${momName(mom)}`;
  t2.font = { name: 'Arial', size: 12, bold: true, color: { argb: NAVY } };
  t2.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 22;

  // ── Meeting details (label/value pairs on two blocks) ─────────
  const info = [
    ['Project', m.project || '', 'Venue', m.venue || ''],
    ['Meeting', m.title || '', 'Date / time', [longDate(m.date), m.time].filter(Boolean).join(', ')],
    ['MoM No.', momName(mom), 'Next meeting', m.next_meeting || ''],
  ];
  info.forEach((row, i) => {
    const r = 4 + i;
    ws.mergeCells(r, 1, r, 2); ws.mergeCells(r, 3, r, 5);
    ws.mergeCells(r, 6, r, 6); ws.mergeCells(r, 7, r, 10);
    const put = (col, v, label) => {
      const c = ws.getCell(r, col);
      c.value = v;
      c.font = font(label ? { bold: true, color: { argb: 'FF475569' } } : { bold: true, color: { argb: NAVY } });
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: label ? 'FFF1F5F9' : 'FFFFFFFF' } };
      c.alignment = { vertical: 'middle', wrapText: true };
      c.border = thin();
    };
    put(1, row[0], true); put(3, row[1]); put(6, row[2], true); put(7, row[3]);
    for (const col of [2, 4, 5, 8, 9, 10]) ws.getCell(r, col).border = thin();
    ws.getRow(r).height = 18;
  });

  // ── Summary ──────────────────────────────────────────────────
  const st = momStats(mom);
  const sum = [['Total', st.total, NAVY], ['Open', st.open, OPS_STATUS_STYLE.Open.argb], ['On-going', st.ongoing, 'FFD97706'], ['Closed', st.closed, OPS_STATUS_STYLE.Closed.argb], ['Closed %', `${st.percentClosed}%`, 'FF475569']];
  ws.getCell(8, 2).value = 'Summary';
  ws.getCell(8, 2).font = font({ bold: true });
  ws.getCell(8, 2).alignment = { horizontal: 'right', vertical: 'middle' };
  sum.forEach(([h, v, argb], i) => {
    const c = ws.getCell(8, 3 + i);
    c.value = h;
    c.font = font({ bold: true, color: { argb: 'FFFFFFFF' }, size: 9 });
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
    c.alignment = { horizontal: 'center' };
    c.border = thin();
    const d = ws.getCell(9, 3 + i);
    d.value = v;
    d.font = font({ bold: true, size: 11 });
    d.alignment = { horizontal: 'center' };
    d.border = thin();
  });

  // ── Table ────────────────────────────────────────────────────
  const HEAD = 11;
  const head = ws.getRow(HEAD);
  MOM_COLUMNS.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.label;
    cell.font = font({ bold: true, color: { argb: c.key === 'updated_action' ? 'FF1E293B' : 'FFFFFFFF' }, size: 10 });
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.key === 'updated_action' ? 'FFFCD34D' : NAVY } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thin(NAVY);
  });
  head.height = 32;
  ws.views = [{ state: 'frozen', ySplit: HEAD, xSplit: 0 }];

  const gPx = colWidthToPx(XL_WIDTH_OF.photos_g);
  const oPx = colWidthToPx(XL_WIDTH_OF.photos_o);
  let r = HEAD + 1;
  for (const g of momGroups(mom)) {
    ws.mergeCells(r, 1, r, LAST);
    const sc = ws.getCell(r, 1);
    sc.value = g.section;
    sc.font = font({ bold: true, size: 11, color: { argb: 'FFFFFFFF' } });
    sc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    ws.getRow(r).height = 20;
    r += 1;
    for (const row of g.rows) {
      const item = itemsById.get(row.id);
      const gi = item ? images(item, 'G') : [];
      const oi = item ? images(item, 'O') : [];
      const stName = normalizeOpsStatus(row.status);
      const style = OPS_STATUS_STYLE[stName];
      const lines = Math.max(1, ...['description', 'remark', 'action', 'updated_action', 'closeout_status', 'system']
        .map((k) => String(row[k] || '').split('\n').reduce((n, part) => n + Math.max(1, Math.ceil(part.length / Math.max(8, XL_WIDTH_OF[k] * 1.1))), 0)));
      let height = Math.max(30, lines * 12.5 + 8);
      const gGrid = gi.length ? photoGrid(gi.length, gPx, { maxCols: 2 }) : null;
      const oGrid = oi.length ? photoGrid(oi.length, oPx, { maxCols: 2 }) : null;
      if (gGrid) height = Math.max(height, pxToPoints(gGrid.heightPx) + 4);
      if (oGrid) height = Math.max(height, pxToPoints(oGrid.heightPx) + 4);
      ws.getRow(r).height = Math.min(409, height);
      MOM_COLUMNS.forEach((c, i) => {
        const cell = ws.getCell(r, i + 1);
        if (c.date) {
          const k = opsDateKey(row[c.key]);
          cell.value = k ? excelDate(k) : '';
          if (k) cell.numFmt = 'd-mmm-yy';
        } else cell.value = cellText(row, c.key);
        cell.font = font(c.key === 'no' || c.key === 'system' ? { bold: true } : c.key === 'updated_action' ? { bold: true, color: { argb: 'FF7C2D12' } } : {});
        cell.alignment = { vertical: 'top', wrapText: true, horizontal: ['no', 'status', 'updated_date', 'subsystem_no'].includes(c.key) ? 'center' : 'left' };
        cell.border = thin();
        if (c.key === 'updated_action') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER_FILL } };
        else if (style?.rowArgb) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.rowArgb } };
        if (c.key === 'status') {
          cell.font = font({ bold: true, color: { argb: style.fg } });
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.argb } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      });
      const place = async (list, grid, colIndex) => {
        for (const [i, p] of list.entries()) {
          const img = await getImageData(p.url);
          if (!img?.base64) continue;
          try {
            const id = wb.addImage({ base64: img.base64, extension: 'jpeg' });
            const box = tileBox(i, grid);
            const { tl, br } = imageAnchor(colIndex, r - 1, box.x, box.y, box.w, box.h, img.aspectRatio);
            ws.addImage(id, { tl, br, editAs: 'oneCell' });
          } catch (e) { console.error('MoM export: image', e); }
        }
      };
      if (gGrid) await place(gi, gGrid, IDX('photos_g'));
      if (oGrid) await place(oi, oGrid, IDX('photos_o'));
      r += 1;
    }
  }

  // ── Prepared by ──────────────────────────────────────────────
  r += 2;
  const sigCol = IDX('updated_action') + 1;       // under the Updated Corrective Action column
  ws.getCell(r, sigCol).value = 'Prepared by:';
  ws.getCell(r, sigCol).font = font({ bold: true });
  const sigRow = r + 1;
  ws.getRow(sigRow).height = 62;
  try {
    const id = wb.addImage({ base64: MOM_SIGNATURE_PNG.split(',')[1], extension: 'png' });
    const w = 160; const h = w / MOM_SIGNATURE_RATIO;
    const { tl, br } = imageAnchor(sigCol - 1, sigRow - 1, 4, 2, w, h, MOM_SIGNATURE_RATIO);
    ws.addImage(id, { tl, br, editAs: 'oneCell' });
  } catch (e) { console.error('MoM export: signature', e); }
  ws.getCell(sigRow + 1, sigCol).value = MOM_SIGNER;
  ws.getCell(sigRow + 1, sigCol).font = font({ bold: true, size: 10.5 });
  ws.getCell(sigRow + 1, sigCol).border = { top: { style: 'thin', color: { argb: 'FF64748B' } } };
  ws.getCell(sigRow + 2, sigCol).value = `Date: ${longDate(m.date || mom.created_date)}`;
  ws.getCell(sigRow + 2, sigCol).font = font({ color: { argb: 'FF475569' } });
  ws.pageSetup.printArea = `A1:${lastL}${sigRow + 2}`;
  ws.pageSetup.printTitlesRow = `${HEAD}:${HEAD}`;

  const buffer = await wb.xlsx.writeBuffer();
  if (opts.returnBuffer) return { buffer, fileName: `${fileBase(mom)}.xlsx` };
  downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileBase(mom)}.xlsx`);
  return null;
}

// ══════════════════════════════════════════════════════════════════
// PDF
// ══════════════════════════════════════════════════════════════════

export async function exportMomPdf(mom, itemsById, opts = {}) {
  const [jspdfMod, autoTableMod, sig] = await Promise.all([import('jspdf'), import('jspdf-autotable'), import('./momSignature')]);
  const jsPDF = jspdfMod.jsPDF || jspdfMod.default?.jsPDF || jspdfMod.default;
  if (typeof jsPDF.API.autoTable !== 'function' && autoTableMod.applyPlugin) autoTableMod.applyPlugin(jsPDF);
  const m = mom.meeting || {};
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a3' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const L = 24;

  // Title band.
  doc.setFillColor(...NAVY_RGB);
  doc.rect(L, 22, pageW - 2 * L, 34, 'F');
  doc.setFont('Helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(255, 255, 255);
  doc.text('MINUTES OF MEETING', pageW / 2, 45, { align: 'center' });
  doc.setFontSize(12); doc.setTextColor(...NAVY_RGB);
  doc.text(`${m.title || 'Weekly OPS Findings Meeting'} — ${momName(mom)}`, pageW / 2, 74, { align: 'center' });

  // Meeting details.
  doc.autoTable({
    startY: 86,
    margin: { left: L, right: L },
    tableWidth: 760,
    body: [
      ['Project', m.project || '', 'Venue', m.venue || ''],
      ['Meeting', m.title || '', 'Date / time', [longDate(m.date), m.time].filter(Boolean).join(', ')],
      ['MoM No.', momName(mom), 'Next meeting', m.next_meeting || ''],
    ],
    theme: 'grid',
    styles: { font: 'Helvetica', fontSize: 9.5, cellPadding: 4, lineColor: [203, 213, 225], lineWidth: 0.5, textColor: NAVY_RGB, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 90, fillColor: [241, 245, 249], textColor: [71, 85, 105] }, 1: { cellWidth: 290 },
      2: { cellWidth: 90, fillColor: [241, 245, 249], textColor: [71, 85, 105] }, 3: { cellWidth: 290 },
    },
  });

  // Summary chips.
  const st = momStats(mom);
  let x = 800; const y = 90;
  const chip = (text, rgb, fg = [255, 255, 255]) => {
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(9);
    const w = doc.getTextWidth(text) + 14;
    doc.setFillColor(...rgb); doc.roundedRect(x, y, w, 16, 3, 3, 'F');
    doc.setTextColor(...fg); doc.text(text, x + 7, y + 11);
    x += w + 5;
  };
  chip(`Total ${st.total}`, NAVY_RGB);
  chip(`Open ${st.open}`, OPS_STATUS_STYLE.Open.rgb);
  chip(`On-going ${st.ongoing}`, OPS_STATUS_STYLE['On-going'].rgb, [69, 26, 3]);
  chip(`Closed ${st.closed}`, OPS_STATUS_STYLE.Closed.rgb);
  doc.setFont('Helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
  doc.text(`Closed ${st.percentClosed}%  ·  ${mom.synced_at ? `Synced to the report ${formatOpsDate(new Date(mom.synced_at).toLocaleDateString('en-CA'))}` : 'Not synced yet'}`, 800, 122);

  // Body: images decoded first (didDrawCell is synchronous).
  const body = []; const meta = [];
  for (const g of momGroups(mom)) {
    body.push([{ content: g.section, colSpan: LAST, styles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 } }]);
    meta.push({ section: true });
    for (const row of g.rows) {
      const item = itemsById.get(row.id);
      const gImgs = []; const oImgs = [];
      if (item) {
        for (const p of images(item, 'G')) { const im = await getImageData(p.url); if (im) gImgs.push(im); }
        for (const p of images(item, 'O')) { const im = await getImageData(p.url); if (im) oImgs.push(im); }
      }
      body.push(MOM_COLUMNS.map((c) => (c.date ? formatOpsDate(row[c.key]) : cellText(row, c.key))));
      meta.push({ row, gImgs, oImgs, style: OPS_STATUS_STYLE[normalizeOpsStatus(row.status)] });
    }
  }
  const W = KEYS.map((k) => PDF_W_OF[k]);
  const PG = IDX('photos_g'); const PO = IDX('photos_o'); const PS = IDX('status'); const PU = IDX('updated_action');
  const gridFor = (n, w) => photoGrid(n, w - 6, { maxCols: 2 });
  const CENTER = new Set(['no', 'status', 'updated_date', 'subsystem_no'].map(IDX));

  doc.autoTable({
    startY: Math.max(140, (doc.lastAutoTable?.finalY || 130) + 12),
    margin: { left: L, right: L, bottom: 30 },
    head: [MOM_COLUMNS.map((c) => c.label)],
    body,
    theme: 'grid',
    rowPageBreak: 'avoid',
    showHead: 'everyPage',
    styles: { font: 'Helvetica', fontSize: 7, cellPadding: 2.5, valign: 'top', lineColor: [203, 213, 225], lineWidth: 0.5, overflow: 'linebreak', textColor: [30, 41, 59] },
    headStyles: { fillColor: NAVY_RGB, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', valign: 'middle', fontSize: 7.2 },
    columnStyles: Object.fromEntries(W.map((w, i) => [i, { cellWidth: w }])),
    didParseCell: (d) => {
      if (d.section === 'head' && d.column.index === PU) { d.cell.styles.fillColor = [252, 211, 77]; d.cell.styles.textColor = [30, 41, 59]; }
      if (d.section !== 'body') return;
      const mm = meta[d.row.index];
      if (!mm || mm.section) return;
      const ci = d.column.index;
      if (mm.style?.rowRgb) d.cell.styles.fillColor = mm.style.rowRgb;
      if (CENTER.has(ci)) d.cell.styles.halign = 'center';
      if (ci === 0 || ci === 1) d.cell.styles.fontStyle = 'bold';
      if (ci === PU) { d.cell.styles.fillColor = AMBER_RGB; d.cell.styles.fontStyle = 'bold'; d.cell.styles.textColor = [124, 45, 18]; }
      if (ci === PS) {
        d.cell.styles.fillColor = mm.style.rgb;
        d.cell.styles.textColor = mm.style === OPS_STATUS_STYLE['On-going'] ? [69, 26, 3] : [255, 255, 255];
        d.cell.styles.fontStyle = 'bold'; d.cell.styles.valign = 'middle';
      }
      if (ci === PG && mm.gImgs.length) d.cell.styles.minCellHeight = Math.min(300, gridFor(mm.gImgs.length, W[PG]).heightPx + 6);
      if (ci === PO && mm.oImgs.length) d.cell.styles.minCellHeight = Math.min(300, gridFor(mm.oImgs.length, W[PO]).heightPx + 6);
    },
    didDrawCell: (d) => {
      if (d.section !== 'body') return;
      const mm = meta[d.row.index];
      if (!mm || mm.section) return;
      const ci = d.column.index;
      if (ci !== PG && ci !== PO) return;
      const list = ci === PG ? mm.gImgs : mm.oImgs;
      if (!list.length) return;
      const cell = d.cell;
      const grid = gridFor(list.length, cell.width);
      list.forEach((img, i) => {
        const box = tileBox(i, grid);
        const ar = img.aspectRatio || 4 / 3;
        let w = box.w; let h = w / ar;
        if (h > box.h) { h = box.h; w = h * ar; }
        const ix = cell.x + 3 + box.x + (box.w - w) / 2;
        const iy = cell.y + 3 + box.y + (box.h - h) / 2;
        if (iy + h > cell.y + cell.height) return;
        try { doc.addImage(img.dataUrl, 'JPEG', ix, iy, w, h, undefined, 'FAST'); } catch (e) { console.error('MoM PDF image', e); }
      });
    },
    didDrawPage: () => {
      doc.setFont('Helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(132, 148, 172);
      doc.text(`${m.project || ''}  |  ${momName(mom)}`, L, pageH - 14);
      doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageW - L, pageH - 14, { align: 'right' });
    },
  });

  // Prepared by — kept whole on one page.
  let top = (doc.lastAutoTable?.finalY || 200) + 24;
  if (top + 110 > pageH - 30) { doc.addPage(); top = 40; }
  const sx = pageW - L - 260;
  doc.setFont('Helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 41, 59);
  doc.text('Prepared by:', sx, top);
  try {
    const w = 150; const h = w / sig.MOM_SIGNATURE_RATIO;
    doc.addImage(sig.MOM_SIGNATURE_PNG, 'PNG', sx, top + 6, w, h);
  } catch (e) { console.error('MoM PDF signature', e); }
  doc.setDrawColor(100, 116, 139); doc.line(sx, top + 80, sx + 220, top + 80);
  doc.setFontSize(10.5); doc.text(sig.MOM_SIGNER, sx, top + 94);
  doc.setFont('Helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(71, 85, 105);
  doc.text(`Date: ${longDate(m.date || mom.created_date)}`, sx, top + 107);

  if (opts.returnBuffer) return { buffer: doc.output('arraybuffer'), fileName: `${fileBase(mom)}.pdf` };
  doc.save(`${fileBase(mom)}.pdf`);
  return null;
}

