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
  opsSectionSummary, sectionIndices, sectionLetter, opsClosureSeries,
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

/**
 * One findings sheet (the source workbook's layout) for `groups`.
 * @returns {{ sheetName, firstData, lastData }} — the Status range, for the Summary formulas.
 */
async function writeFindingsSheet(wb, report, { groups, rows, label, sheetName, subtitle }) {
  const stats = opsStats(rows);
  const shareId = report.share_id || report.cloud_code || '';
  const ws = wb.addWorksheet(sheetName, {
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
  ws.getCell('A5').value = subtitle || report.location || '';
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
    ws.getCell('A8').value = `${label} — ${rows.length} finding(s)`;
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

  return { sheetName, firstData, lastData };
}

/** Excel sheet names: at most 31 characters, none of []:*?/\ . */
function sheetNameFor(section, used) {
  const L = sectionLetter(section);
  let base = (L ? `Section ${L}` : String(section || 'Section')).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim() || 'Section';
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) name = `${base.slice(0, 27)} (${n++})`;
  used.add(name.toLowerCase());
  return name;
}

/**
 * Excel export.
 *  - From a SECTION tab: one sheet — that section (and the tab's filter, when
 *    one is on, named in the sheet).
 *  - From the SUMMARY tab: the whole report — a Summary sheet (status by
 *    section with LIVE COUNTIF formulas over the section sheets, a total line,
 *    and the closed-over-time chart) followed by one sheet per section.
 */
export async function exportOpsExcel(report, view = null) {
  if (!report) throw new Error('No report data provided');
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Flash Report Pro';
  wb.created = new Date();
  const items = report.items || [];
  const used = new Set();

  if (view?.section) {
    const { groups, rows } = scopeOf(report, view);
    const filterOn = view.filter && Object.values(view.filter).some(Boolean);
    await writeFindingsSheet(wb, report, {
      groups, rows,
      label: filterOn ? `Filtered — ${view.label}` : '',
      sheetName: sheetNameFor(view.section, used),
      subtitle: view.section,
    });
    await saveWorkbook(wb, `${fileBase(report)}_${sectionLetter(view.section) || 'section'}`);
    return;
  }

  const sum = wb.addWorksheet('Summary', {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const sections = opsSectionSummary(items);
  const refs = [];
  for (const s of sections) {
    const groups = groupOpsSections(items, sectionIndices(items, s.section));
    const rows = groups.flatMap((g) => g.rows.map((r) => r.item));
    const at = await writeFindingsSheet(wb, report, {
      groups, rows, label: '', sheetName: sheetNameFor(s.section, used), subtitle: s.section,
    });
    refs.push({ ...s, ...at });
  }
  await writeSummarySheet(wb, sum, report, refs, items);
  await saveWorkbook(wb, fileBase(report));
}

async function saveWorkbook(wb, name) {
  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${name}.xlsx`,
  );
}

async function writeSummarySheet(wb, ws, report, refs, items) {
  const font = (o = {}) => ({ name: 'Arial', size: 10, color: { argb: 'FF1E293B' }, ...o });
  const border = { top: { style: 'thin', color: { argb: 'FFBFC7D5' } }, left: { style: 'thin', color: { argb: 'FFBFC7D5' } },
    bottom: { style: 'thin', color: { argb: 'FFBFC7D5' } }, right: { style: 'thin', color: { argb: 'FFBFC7D5' } } };
  ws.columns = [{ width: 44 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 12 }, { width: 22 }];

  ws.mergeCells('A1:G1');
  ws.getCell('A1').value = report.title || OPS_FINDINGS_LABEL;
  ws.getCell('A1').font = { name: 'Arial', size: 16, bold: true, color: { argb: NAVY } };
  ws.getRow(1).height = 26;
  ws.mergeCells('A2:G2');
  ws.getCell('A2').value = [report.location, report.system_tag ? `Updated by: ${report.system_tag}` : '',
    opsDateKey(report.inspection_date) ? `Updated date: ${formatOpsDate(report.inspection_date)}` : '',
    `Exported ${formatOpsDate(todayKeyLocal())}`].filter(Boolean).join('   |   ');
  ws.getCell('A2').font = font({ color: { argb: 'FF51607A' } });

  const HEAD = 4;
  ['Section', 'Total', 'Open', 'On-going', 'Closed', 'Closed %', 'Sheet'].forEach((h, i) => {
    const c = ws.getCell(HEAD, i + 1);
    c.value = h;
    c.font = font({ bold: true, color: { argb: 'FFFFFFFF' } });
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.alignment = { horizontal: i ? 'center' : 'left', vertical: 'middle' };
    c.border = border;
  });
  ws.getRow(HEAD).height = 22;

  const f = (formula, result) => ({ formula, result });
  let r = HEAD + 1;
  for (const s of refs) {
    const J = `'${s.sheetName}'!$J$${s.firstData}:$J$${Math.max(s.firstData, s.lastData)}`;
    ws.getCell(r, 1).value = s.section;
    ws.getCell(r, 3).value = f(`COUNTIF(${J},"Open")`, s.stats.open);
    ws.getCell(r, 4).value = f(`COUNTIF(${J},"On-going")`, s.stats.ongoing);
    ws.getCell(r, 5).value = f(`COUNTIF(${J},"Closed")`, s.stats.closed);
    ws.getCell(r, 2).value = f(`C${r}+D${r}+E${r}`, s.stats.total);
    ws.getCell(r, 6).value = f(`IF(B${r}=0,0,E${r}/B${r})`, s.stats.total ? s.stats.closed / s.stats.total : 0);
    ws.getCell(r, 7).value = { text: s.sheetName, hyperlink: `#'${s.sheetName}'!A1` };
    r += 1;
  }
  const first = HEAD + 1;
  const last = r - 1;
  const all = opsStats(items);
  ws.getCell(r, 1).value = 'Total';
  ws.getCell(r, 2).value = f(`SUM(B${first}:B${last})`, all.total);
  ws.getCell(r, 3).value = f(`SUM(C${first}:C${last})`, all.open);
  ws.getCell(r, 4).value = f(`SUM(D${first}:D${last})`, all.ongoing);
  ws.getCell(r, 5).value = f(`SUM(E${first}:E${last})`, all.closed);
  ws.getCell(r, 6).value = f(`IF(B${r}=0,0,E${r}/B${r})`, all.total ? all.closed / all.total : 0);
  for (let rr = first; rr <= r; rr += 1) {
    const total = rr === r;
    for (let c = 1; c <= 7; c += 1) {
      const cell = ws.getCell(rr, c);
      cell.border = border;
      cell.alignment = { horizontal: c === 1 ? 'left' : 'center', vertical: 'middle' };
      const colour = c === 3 ? 'FFB91C1C' : c === 4 ? 'FFB45309' : c === 5 ? 'FF047857' : c === 7 ? 'FF0563C1' : 'FF1E293B';
      cell.font = font({ bold: total || c > 1, color: { argb: colour }, underline: c === 7 });
      if (total) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    }
    ws.getCell(rr, 6).numFmt = '0%';
    ws.getRow(rr).height = 20;
  }

  // The chart the Summary tab shows, drawn from the same series.
  try {
    const png = closureChartPng(items, { width: 980, height: 330 });
    if (png) {
      const top = r + 2;
      ws.getCell(top, 1).value = 'FINDINGS CLOSED OVER TIME (BY WEEK)';
      ws.getCell(top, 1).font = font({ bold: true, color: { argb: NAVY } });
      const id = wb.addImage({ base64: png.split(',')[1], extension: 'png' });
      ws.addImage(id, { tl: { col: 0.05, row: top + 0.2 }, ext: { width: 980, height: 330 }, editAs: 'oneCell' });
    }
  } catch (e) {
    console.error('OPS summary chart not drawn:', e);   // the numbers above still stand
  }
}

/** The Summary chart as a PNG data URL (canvas) — same series as the screen. */
export function closureChartPng(items, { width = 980, height = 330 } = {}) {
  if (typeof document === 'undefined') return '';
  const { weeks } = opsClosureSeries(items, { maxWeeks: 30 });
  const cv = document.createElement('canvas');
  const k = 2;
  cv.width = width * k; cv.height = height * k;
  const ctx = cv.getContext('2d');
  ctx.scale(k, k);
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, width, height);
  const pad = { l: 40, r: 44, t: 26, b: 44 };
  const iw = width - pad.l - pad.r; const ih = height - pad.t - pad.b;
  const n = Math.max(1, weeks.length); const slot = iw / n;
  const barW = Math.max(3, Math.min(16, slot * 0.32));
  const maxBar = Math.max(1, ...weeks.map((w) => Math.max(w.opened, w.closed)));
  const maxLine = Math.max(1, ...weeks.map((w) => Math.max(w.cumClosed, w.backlog)));
  const yb = (v) => pad.t + ih - (v / maxBar) * ih;
  const yl = (v) => pad.t + ih - (v / maxLine) * ih;
  const xc = (i) => pad.l + slot * i + slot / 2;
  ctx.font = '11px Arial';
  for (const fr of [0, 0.25, 0.5, 0.75, 1]) {
    const y = pad.t + ih * (1 - fr);
    ctx.strokeStyle = '#E2E8F0'; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(width - pad.r, y); ctx.stroke();
    ctx.fillStyle = '#64748B'; ctx.textAlign = 'right'; ctx.fillText(String(Math.round(maxBar * fr)), pad.l - 5, y + 4);
    ctx.textAlign = 'left'; ctx.fillText(String(Math.round(maxLine * fr)), width - pad.r + 5, y + 4);
  }
  const every = Math.max(1, Math.ceil(n / Math.max(4, Math.floor(iw / 58))));
  weeks.forEach((w, i) => {
    if (w.isNow) { ctx.fillStyle = '#EEF2FF'; ctx.fillRect(pad.l + slot * i, pad.t, slot, ih); }
    ctx.fillStyle = '#CBD5E1'; ctx.fillRect(xc(i) - barW - 1, yb(w.opened), barW, pad.t + ih - yb(w.opened));
    ctx.fillStyle = '#059669'; ctx.fillRect(xc(i) + 1, yb(w.closed), barW, pad.t + ih - yb(w.closed));
    if (w.closed) { ctx.fillStyle = '#059669'; ctx.textAlign = 'center'; ctx.fillText(String(w.closed), xc(i) + 1 + barW / 2, yb(w.closed) - 3); }
    if (i % every === 0 || w.isNow) {
      ctx.fillStyle = w.isNow ? '#4338CA' : '#64748B'; ctx.textAlign = 'center';
      ctx.fillText(w.isNow ? 'NOW' : w.label, xc(i), height - pad.b + 16);
    }
  });
  const drawLine = (key, colour) => {
    ctx.strokeStyle = colour; ctx.lineWidth = 2.2; ctx.beginPath();
    weeks.forEach((w, i) => { if (i) ctx.lineTo(xc(i), yl(w[key])); else ctx.moveTo(xc(i), yl(w[key])); });
    ctx.stroke(); ctx.lineWidth = 1;
    const lastW = weeks[weeks.length - 1];
    if (lastW) { ctx.fillStyle = colour; ctx.textAlign = 'center'; ctx.font = 'bold 11px Arial'; ctx.fillText(String(lastW[key]), xc(n - 1), yl(lastW[key]) - 7); ctx.font = '11px Arial'; }
  };
  drawLine('backlog', '#DC2626');
  drawLine('cumClosed', '#047857');
  const legend = [['#CBD5E1', 'Opened in week', 'bar'], ['#059669', 'Closed in week', 'bar'], ['#047857', 'Total closed (right)', 'line'], ['#DC2626', 'Still open (right)', 'line']];
  let lx = pad.l; const ly = height - 12;
  ctx.textAlign = 'left';
  for (const [c, t, kind] of legend) {
    ctx.fillStyle = c;
    if (kind === 'bar') ctx.fillRect(lx, ly - 8, 12, 9); else ctx.fillRect(lx, ly - 4, 14, 2.5);
    ctx.fillStyle = '#334155'; ctx.fillText(t, lx + 17, ly);
    lx += 34 + ctx.measureText(t).width;
  }
  return cv.toDataURL('image/png');
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
  const sub = view?.section || report.location;
  if (sub) doc.text(sub, 24, 50);
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
    doc.text(`${label} — ${rows.length} finding(s)`, x + 6, y + 10.5);
  }

  // From the Summary tab: a first page with the status by section and the
  // closed-over-time chart, then every section.
  let tableStart = 94;
  if (!view?.section) {
    const secs = opsSectionSummary(report.items || []);
    const all = opsStats(report.items || []);
    doc.autoTable({
      startY: 96,
      margin: { left: 24, right: 24 },
      tableWidth: 640,
      head: [['Section', 'Total', 'Open', 'On-going', 'Closed', '% closed']],
      body: [
        ...secs.map((sx) => [sx.section, sx.stats.total, sx.stats.open, sx.stats.ongoing, sx.stats.closed, `${sx.stats.percentClosed}%`]),
        ['Total', all.total, all.open, all.ongoing, all.closed, `${all.percentClosed}%`],
      ],
      theme: 'grid',
      styles: { font: 'Helvetica', fontSize: 9, cellPadding: 4, lineColor: [203, 213, 225], lineWidth: 0.5 },
      headStyles: { fillColor: NAVY_RGB, textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 300 }, 1: { halign: 'center' }, 2: { halign: 'center', textColor: [185, 28, 28] }, 3: { halign: 'center', textColor: [180, 83, 9] }, 4: { halign: 'center', textColor: [4, 120, 87] }, 5: { halign: 'center' } },
      didParseCell: (d) => { if (d.section === 'body' && d.row.index === secs.length) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [241, 245, 249]; } },
    });
    try {
      const png = closureChartPng(report.items || [], { width: 980, height: 330 });
      const top = (doc.lastAutoTable?.finalY || 200) + 24;
      doc.setFont('Helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...NAVY_RGB);
      doc.text('Findings closed over time (by week)', 24, top);
      if (png) doc.addImage(png, 'PNG', 24, top + 8, 980 * 0.8, 330 * 0.8);
    } catch (e) { console.error('OPS PDF chart:', e); }
    doc.addPage();
    tableStart = 30;
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
    startY: tableStart,
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
