/**
 * Excel and PDF of the OPS Findings & Action Tracking report.
 *
 * Laid out like the source workbook — the same 15 columns A..O, the section
 * rows, "Updated by / Updated date" at the top — with photos tiled INSIDE
 * their cells (column G and column O) using the shared EMU geometry in
 * exportImage.js (BUG-015: never fractional anchors, never a second copy of
 * the arithmetic), dates as real Excel dates built with excelDate()
 * (BUG-022), and in the PDF `rowPageBreak: 'avoid'` + a header on every page
 * (BUG-010).
 *
 * SCOPE: with no filter on screen the whole report is exported; with a
 * filter, exactly the rows on screen, and the file says which filter it is.
 * A file that silently disagrees with the screen it came from is worse than
 * no file.
 */

import {
  getImageData, sanitizeFilename, downloadBlob, excelDate,
  colWidthToPx, rowPointsToPx, pxToPoints, imageAnchor, photoGrid, tileBox,
} from './exportImage';
import { attachmentUrl } from './fileAttachments';
import {
  OPS_FINDINGS_LABEL, OPS_STATUS_STYLE, OPS_STATUS_OPTIONS, OPS_COLUMNS,
  groupOpsSections, opsStats, normalizeOpsStatus, photosOf, isFileEntry,
  opsDateKey, formatOpsDate, todayKeyLocal,
} from './opsFindings';

const NAVY = 'FF1F3A5F';
const NAVY_RGB = [31, 58, 95];

function fileBase(report) {
  const title = sanitizeFilename(report?.title || OPS_FINDINGS_LABEL);
  return `${title}_${todayKeyLocal().replace(/-/g, '')}`;
}

function scopeOf(report, view) {
  const items = report?.items || [];
  const indices = view?.active && Array.isArray(view.indices) ? view.indices : null;
  const groups = groupOpsSections(items, indices);
  const rows = groups.flatMap((g) => g.rows.map((r) => r.item));
  return { items, groups, rows, label: indices ? (view.label || 'Filtered') : '' };
}

function linesFor(text, widthUnits) {
  const s = String(text || '');
  if (!s) return 1;
  const perLine = Math.max(8, Math.floor(widthUnits * 1.1));
  return s.split('\n').reduce((n, part) => n + Math.max(1, Math.ceil(part.length / perLine)), 0);
}

const images = (item, col) => photosOf(item, col).filter((p) => p && p.url && !isFileEntry(p));
const files = (item, col) => photosOf(item, col).filter((p) => isFileEntry(p) && p.file_ref);

// ══════════════════════════════════════════════════════════════════
// EXCEL
// ══════════════════════════════════════════════════════════════════

// Width of each column in Excel character units, A..O.
const XL_WIDTHS = [5, 20, 42, 32, 18, 11, 28, 11, 16, 11, 11, 36, 26, 11, 28];
const COL_G = 6;
const COL_O = 14;
const HEADER_ROW = 9;

export async function exportOpsExcel(report, view = null) {
  if (!report) throw new Error('No report data provided');
  const { default: ExcelJS } = await import('exceljs');
  const { groups, rows, label } = scopeOf(report, view);
  const stats = opsStats(rows);
  const shareId = report.share_id || report.cloud_code || '';

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Flash Report Pro';
  wb.created = new Date();
  const ws = wb.addWorksheet('Findings Master', {
    views: [{ state: 'frozen', ySplit: HEADER_ROW, xSplit: 0 }],
    pageSetup: { orientation: 'landscape', paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = XL_WIDTHS.map((width) => ({ width }));

  const thin = (argb = 'FFBFC7D5') => ({
    top: { style: 'thin', color: { argb } }, left: { style: 'thin', color: { argb } },
    bottom: { style: 'thin', color: { argb } }, right: { style: 'thin', color: { argb } },
  });
  const font = (o = {}) => ({ name: 'Arial', size: 9.5, color: { argb: 'FF1E293B' }, ...o });

  // ── Top block ───────────────────────────────────────────────
  ws.mergeCells('A1:B1'); ws.mergeCells('A2:B2');
  ws.getCell('A1').value = 'Updated by:';
  ws.getCell('A2').value = 'Updated date:';
  ['A1', 'A2'].forEach((a) => { ws.getCell(a).font = font({ bold: true }); });
  ws.getCell('C1').value = report.system_tag || '';
  ws.getCell('C1').font = font({ bold: true, color: { argb: NAVY } });
  const upd = opsDateKey(report.inspection_date);
  if (upd) { ws.getCell('C2').value = excelDate(upd); ws.getCell('C2').numFmt = 'd-mmm-yy'; }
  ws.getCell('C2').font = font({ bold: true, color: { argb: NAVY } });
  ws.getCell('C2').alignment = { horizontal: 'left' };

  ws.mergeCells('A4:O4');
  ws.getCell('A4').value = report.title || OPS_FINDINGS_LABEL;
  ws.getCell('A4').font = { name: 'Arial', size: 16, bold: true, color: { argb: NAVY } };
  ws.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(4).height = 26;
  ws.mergeCells('A5:O5');
  ws.getCell('A5').value = report.location || '';
  ws.getCell('A5').font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF334155' } };
  ws.getCell('A5').alignment = { horizontal: 'center' };

  // Summary with LIVE formulas over the Status column, so the counts stay
  // right when the file is edited after it leaves the app.
  const firstData = HEADER_ROW + 1;
  let lastData = firstData;   // corrected below
  const sumHead = ['Total', 'Open', 'On-going', 'Closed', 'Closed %'];
  sumHead.forEach((h, i) => {
    const c = ws.getCell(6, 3 + i);
    c.value = h;
    c.font = font({ bold: true, color: { argb: 'FFFFFFFF' }, size: 9 });
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i === 1 ? OPS_STATUS_STYLE.Open.argb : i === 2 ? 'FFD97706' : i === 3 ? OPS_STATUS_STYLE.Closed.argb : NAVY } };
    c.alignment = { horizontal: 'center' };
    c.border = thin();
  });
  ws.getCell('B6').value = 'Summary';
  ws.getCell('B6').font = font({ bold: true });
  ws.getCell('B6').alignment = { horizontal: 'right' };

  if (label) {
    ws.mergeCells('A8:O8');
    ws.getCell('A8').value = `Filtered export — ${label} — ${rows.length} finding(s) of ${(report.items || []).length}`;
    ws.getCell('A8').font = font({ italic: true, color: { argb: 'FF9A3412' } });
  }

  // ── Header row ──────────────────────────────────────────────
  const head = ws.getRow(HEADER_ROW);
  OPS_COLUMNS.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.label;
    cell.font = font({ bold: true, color: { argb: 'FFFFFFFF' }, size: 10 });
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thin(NAVY);
  });
  head.height = 32;

  // ── Body ────────────────────────────────────────────────────
  const gPx = colWidthToPx(XL_WIDTHS[COL_G]);
  const oPx = colWidthToPx(XL_WIDTHS[COL_O]);
  let r = firstData;

  for (const g of groups) {
    ws.mergeCells(r, 1, r, 15);
    const sc = ws.getCell(r, 1);
    sc.value = g.section;
    sc.font = font({ bold: true, size: 11, color: { argb: 'FFFFFFFF' } });
    sc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    sc.alignment = { vertical: 'middle' };
    ws.getRow(r).height = 20;
    r += 1;

    for (const { item, no } of g.rows) {
      const st = normalizeOpsStatus(item.status);
      const style = OPS_STATUS_STYLE[st];
      const gi = images(item, 'G');
      const oi = images(item, 'O');
      const of = files(item, 'O');

      const textLines = Math.max(
        linesFor(item.system, XL_WIDTHS[1]), linesFor(item.description, XL_WIDTHS[2]),
        linesFor(item.action, XL_WIDTHS[3]), linesFor(item.reference, XL_WIDTHS[4]),
        linesFor(item.pic, XL_WIDTHS[8]), linesFor(item.remark, XL_WIDTHS[11]),
        linesFor(item.closeout_status, XL_WIDTHS[12]), 1,
      );
      let height = Math.max(30, textLines * 12.5 + 8);
      const gGrid = gi.length ? photoGrid(gi.length, gPx, { maxCols: 2 }) : null;
      const oGrid = oi.length ? photoGrid(oi.length, oPx, { maxCols: 2 }) : null;
      const fileTopPx = of.length ? of.length * 15 + 4 : 0;
      if (gGrid) height = Math.max(height, pxToPoints(gGrid.heightPx) + 4);
      if (oGrid || of.length) height = Math.max(height, pxToPoints(fileTopPx + (oGrid ? oGrid.heightPx : 0)) + 4);
      height = Math.min(height, 409);   // Excel's own row-height ceiling
      const row = ws.getRow(r);
      row.height = height;

      const set = (col, value, extra = {}) => {
        const c = ws.getCell(r, col);
        c.value = value;
        c.font = font(extra.font || {});
        c.alignment = { vertical: 'top', wrapText: true, ...(extra.alignment || {}) };
        c.border = thin();
        if (style.rowArgb) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.rowArgb } };
        return c;
      };
      const date = (col, v) => {
        const k = opsDateKey(v);
        const c = set(col, k ? excelDate(k) : '', { alignment: { horizontal: 'center' } });
        if (k) c.numFmt = 'd-mmm-yy';
      };

      set(1, no, { font: { bold: true }, alignment: { horizontal: 'center' } });
      set(2, item.system || '', { font: { bold: true } });
      set(3, item.description || '');
      set(4, item.action || '');
      set(5, item.reference || '');
      set(6, item.raised_by || '', { alignment: { horizontal: 'center' } });
      set(7, '');
      date(8, item.open_date);
      set(9, item.pic || '', { alignment: { horizontal: 'center' } });
      const sc2 = set(10, st, { font: { bold: true, color: { argb: style.fg } }, alignment: { horizontal: 'center', vertical: 'middle' } });
      sc2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.argb } };
      date(11, item.closeout_date);
      set(12, item.remark || '');
      set(13, item.closeout_status || '');
      date(14, item.updated_date);
      const oc = set(15, '');

      if (of.length) {
        const names = of.map((f) => f.filename || 'file').join('\n');
        if (shareId) {
          oc.value = { text: names, hyperlink: attachmentUrl(shareId, of[0].file_ref) };
          oc.font = font({ size: 9, underline: true, color: { argb: 'FF0563C1' } });
        } else {
          oc.value = names;
          oc.font = font({ size: 9 });
        }
      }

      const cellHpx = rowPointsToPx(height);
      const place = async (list, grid, colIndex, yOffset) => {
        for (const [i, p] of list.entries()) {
          const img = await getImageData(p.url);
          if (!img?.base64) continue;
          try {
            const id = wb.addImage({ base64: img.base64, extension: 'jpeg' });
            const box = tileBox(i, grid);
            const top = yOffset + box.y;
            const h = Math.min(box.h, Math.max(8, cellHpx - top - grid.gap));
            if (h <= 8) continue;
            const { tl, br } = imageAnchor(colIndex, r - 1, box.x, top, box.w, h, img.aspectRatio);
            ws.addImage(id, { tl, br, editAs: 'oneCell' });
          } catch (e) {
            console.error('OPS export: could not place an image', e);
          }
        }
      };
      if (gGrid) await place(gi, gGrid, COL_G, 0);
      if (oGrid) await place(oi, oGrid, COL_O, fileTopPx);

      lastData = r;
      r += 1;
    }
  }

  // Summary formulas now that the data range is known.
  const J = `J${firstData}:J${Math.max(firstData, lastData)}`;
  const f = (formula, result) => ({ formula, result });
  ws.getCell(7, 4).value = f(`COUNTIF(${J},"Open")`, stats.open);
  ws.getCell(7, 5).value = f(`COUNTIF(${J},"On-going")`, stats.ongoing);
  ws.getCell(7, 6).value = f(`COUNTIF(${J},"Closed")`, stats.closed);
  ws.getCell(7, 3).value = f('D7+E7+F7', stats.total);
  ws.getCell(7, 7).value = f('IF(C7=0,0,F7/C7)', stats.total ? stats.closed / stats.total : 0);
  ws.getCell(7, 7).numFmt = '0%';
  for (let c = 3; c <= 7; c += 1) {
    const cell = ws.getCell(7, c);
    cell.font = font({ bold: true, size: 11 });
    cell.alignment = { horizontal: 'center' };
    cell.border = thin();
  }

  ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: Math.max(HEADER_ROW, lastData), column: 15 } };

  // Status as a drop-down, so a Status typed in the file stays one of three.
  for (let rr = firstData; rr <= lastData; rr += 1) {
    ws.getCell(rr, 10).dataValidation = {
      type: 'list', allowBlank: true, formulae: [`"${OPS_STATUS_OPTIONS.join(',')}"`],
    };
  }

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${fileBase(report)}.xlsx`,
  );
}

// ══════════════════════════════════════════════════════════════════
// PDF
// ══════════════════════════════════════════════════════════════════

// A3 landscape: 1190.55pt wide; 24pt margins leave 1142.55pt. The widths below
// sum to 1142 — re-check the total when a column changes, or autoTable starts
// shrinking the text to make it fit.
const PDF_W = [22, 82, 140, 118, 60, 44, 120, 44, 60, 46, 44, 118, 88, 44, 112];
const P_G = 6;
const P_O = 14;
const P_STATUS = 9;

export async function exportOpsPdf(report, view = null) {
  if (!report) throw new Error('No report data provided');
  const [{ default: jsPDF }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const { groups, rows, label } = scopeOf(report, view);
  const stats = opsStats(rows);
  const shareId = report.share_id || report.cloud_code || '';

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a3' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...NAVY_RGB);
  doc.text(report.title || OPS_FINDINGS_LABEL, 24, 34);
  doc.setFontSize(10.5);
  doc.setTextColor(51, 65, 85);
  if (report.location) doc.text(report.location, 24, 50);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(81, 96, 122);
  const who = [
    report.system_tag ? `Updated by: ${report.system_tag}` : '',
    opsDateKey(report.inspection_date) ? `Updated date: ${formatOpsDate(report.inspection_date)}` : '',
    `Exported ${formatOpsDate(todayKeyLocal())}`,
  ].filter(Boolean).join('   |   ');
  doc.text(who, 24, 64);

  // Summary chips.
  let x = 24;
  const y = 72;
  const chip = (text, rgb, fg = [255, 255, 255]) => {
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8.5);
    const w = doc.getTextWidth(text) + 14;
    doc.setFillColor(...rgb);
    doc.roundedRect(x, y, w, 15, 3, 3, 'F');
    doc.setTextColor(...fg);
    doc.text(text, x + 7, y + 10.5);
    x += w + 6;
  };
  chip(`Total ${stats.total}`, NAVY_RGB);
  chip(`Open ${stats.open}`, OPS_STATUS_STYLE.Open.rgb);
  chip(`On-going ${stats.ongoing}`, OPS_STATUS_STYLE['On-going'].rgb, [69, 26, 3]);
  chip(`Closed ${stats.closed}`, OPS_STATUS_STYLE.Closed.rgb);
  chip(`Closed ${stats.percentClosed}%`, [71, 85, 105]);
  if (label) {
    doc.setFont('Helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(154, 52, 18);
    doc.text(`Filtered export — ${label} — ${rows.length} of ${(report.items || []).length}`, x + 6, y + 10.5);
  }

  // Body, with images decoded up front (didDrawCell is synchronous).
  const body = [];
  const meta = [];     // per body row: { section } | { item, gImgs, oImgs, oFiles, style }
  for (const g of groups) {
    body.push([{ content: g.section, colSpan: 15, styles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 } }]);
    meta.push({ section: true });
    for (const { item, no } of g.rows) {
      const st = normalizeOpsStatus(item.status);
      const gImgs = [];
      for (const p of images(item, 'G')) { const im = await getImageData(p.url); if (im) gImgs.push(im); }
      const oImgs = [];
      for (const p of images(item, 'O')) { const im = await getImageData(p.url); if (im) oImgs.push(im); }
      body.push([
        String(no), item.system || '', item.description || '', item.action || '', item.reference || '',
        item.raised_by || '', '', formatOpsDate(item.open_date), item.pic || '', st,
        formatOpsDate(item.closeout_date), item.remark || '', item.closeout_status || '',
        formatOpsDate(item.updated_date), '',
      ]);
      meta.push({ item, gImgs, oImgs, oFiles: files(item, 'O'), style: OPS_STATUS_STYLE[st] });
    }
  }

  const gridFor = (n, w) => photoGrid(n, w - 6, { maxCols: 2 });

  doc.autoTable({
    startY: 94,
    margin: { left: 24, right: 24, bottom: 30 },
    head: [OPS_COLUMNS.map((c) => c.label)],
    body,
    theme: 'grid',
    rowPageBreak: 'avoid',
    showHead: 'everyPage',
    styles: {
      font: 'Helvetica', fontSize: 6.8, cellPadding: 2.5, valign: 'top',
      lineColor: [203, 213, 225], lineWidth: 0.5, overflow: 'linebreak', textColor: [30, 41, 59],
    },
    headStyles: { fillColor: NAVY_RGB, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', valign: 'middle', fontSize: 7 },
    columnStyles: Object.fromEntries(PDF_W.map((w, i) => [i, { cellWidth: w }])),
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const m = meta[data.row.index];
      if (!m || m.section) return;
      const ci = data.column.index;
      if (m.style?.rowRgb) data.cell.styles.fillColor = m.style.rowRgb;
      if ([0, 7, 9, 10, 13].includes(ci)) data.cell.styles.halign = 'center';
      if (ci === 0 || ci === 1) data.cell.styles.fontStyle = 'bold';
      if (ci === P_STATUS) {
        data.cell.styles.fillColor = m.style.rgb;
        data.cell.styles.textColor = m.style === OPS_STATUS_STYLE['On-going'] ? [69, 26, 3] : [255, 255, 255];
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.valign = 'middle';
      }
      if (ci === P_G && m.gImgs.length) {
        data.cell.styles.minCellHeight = Math.min(300, gridFor(m.gImgs.length, PDF_W[P_G]).heightPx + 6);
      }
      if (ci === P_O && (m.oImgs.length || m.oFiles.length)) {
        const top = m.oFiles.length * 9 + (m.oFiles.length ? 3 : 0);
        const gh = m.oImgs.length ? gridFor(m.oImgs.length, PDF_W[P_O]).heightPx : 0;
        data.cell.styles.minCellHeight = Math.min(300, top + gh + 6);
      }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body') return;
      const m = meta[data.row.index];
      if (!m || m.section) return;
      const ci = data.column.index;
      if (ci !== P_G && ci !== P_O) return;
      const cell = data.cell;
      let top = cell.y + 3;
      if (ci === P_O && m.oFiles.length) {
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(5, 99, 193);
        for (const fl of m.oFiles) {
          const name = String(fl.filename || 'file');
          const t = doc.splitTextToSize(name, cell.width - 6)[0];
          if (shareId) doc.textWithLink(t, cell.x + 3, top + 6, { url: attachmentUrl(shareId, fl.file_ref) });
          else doc.text(t, cell.x + 3, top + 6);
          top += 9;
        }
        top += 3;
      }
      const list = ci === P_G ? m.gImgs : m.oImgs;
      if (!list.length) return;
      const grid = gridFor(list.length, cell.width);
      list.forEach((img, i) => {
        const box = tileBox(i, grid);
        const ar = img.aspectRatio || 4 / 3;
        let w = box.w; let h = w / ar;
        if (h > box.h) { h = box.h; w = h * ar; }
        const ix = cell.x + 3 + box.x + (box.w - w) / 2;
        const iy = top + box.y + (box.h - h) / 2;
        if (iy + h > cell.y + cell.height) return;       // never paint outside the cell
        try { doc.addImage(img.dataUrl, 'JPEG', ix, iy, w, h, undefined, 'FAST'); }
        catch (e) { console.error('OPS PDF image:', e); }
      });
    },
    didDrawPage: () => {
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(132, 148, 172);
      doc.text(`Block B - EPC#1  |  ${report.title || OPS_FINDINGS_LABEL}`, 24, pageH - 14);
      doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageW - 24, pageH - 14, { align: 'right' });
    },
  });

  doc.save(`${fileBase(report)}.pdf`);
}
