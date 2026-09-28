/**
 * Excel and PDF of the Preservation Findings and Tracking report.
 *
 * Same construction rules as the OPS Findings exports (opsFindingsExport.js):
 * pictures tiled INSIDE their cell with the shared EMU geometry of
 * exportImage.js (BUG-015), dates as real Excel dates via excelDate()
 * (BUG-022), LIVE formulas for the summary figures, and in the PDF
 * `rowPageBreak: 'avoid'` + a header on every page (BUG-010).
 *
 * SCOPE: from the Findings tab with a filter on, exactly the rows on screen
 * (and the file names the filter); otherwise every finding. The Summary sheet
 * counts the rows IN THE FILE, with formulas over the Findings sheet, so the
 * two sheets can never disagree.
 */

import {
  getImageData, sanitizeFilename, downloadBlob, excelDate,
  colWidthToPx, rowPointsToPx, pxToPoints, imageAnchor, photoGrid, tileBox,
} from './exportImage';
import { attachmentUrl } from './fileAttachments';
import { closureChartPng } from './opsFindingsExport';
import {
  PRESERVATION_LABEL, PF_COLUMNS, PF_DB_FIELDS, PF_STATUS, PF_STATUS_STYLE, PF_STATUS_OPTIONS, PF_NY_CLARIFY,
  normalizePfStatus, pfDateKey, formatPfDate, todayKeyLocal, pfRowNumbers, pfFindingIndices,
  pfSummary, pfBreakdown, pfLearnedRows, pfOpenDays, PF_DEFAULT_OVERDUE_DAYS, pfColLetter,
} from './preservationFindings';

const NAVY = 'FF1F3A5F';
const NAVY_RGB = [31, 58, 95];
const isFile = (p) => Boolean(p && (p.kind === 'file' || (!p.url && p.file_ref)));
const imagesOf = (item) => (item.photos || []).filter((p) => p && p.url && !isFile(p));
const filesOf = (item) => (item.photos || []).filter((p) => isFile(p) && p.file_ref);

function fileBase(report) {
  return `${sanitizeFilename(report?.title || PRESERVATION_LABEL)}_${todayKeyLocal().replace(/-/g, '')}`;
}

/** The rows the file carries: the filtered view, or every finding. */
function scopeOf(report, view) {
  const items = report?.items || [];
  const numbers = pfRowNumbers(items);
  const filtered = view?.active && view?.tab === 'findings' && Array.isArray(view.indices);
  const idx = filtered ? view.indices : pfFindingIndices(items);
  const rows = idx.filter((i) => items[i]).map((i) => ({ item: items[i], no: numbers[i] }));
  return { items, rows, label: filtered ? (view.label || 'Filtered') : '', overdueDays: view?.overdueDays || PF_DEFAULT_OVERDUE_DAYS };
}

function linesFor(text, widthUnits) {
  const s = String(text || '');
  if (!s) return 1;
  const perLine = Math.max(8, Math.floor(widthUnits * 1.1));
  return s.split('\n').reduce((n, part) => n + Math.max(1, Math.ceil(part.length / perLine)), 0);
}

// ══════════════════════════════════════════════════════════════════
// EXCEL
// ══════════════════════════════════════════════════════════════════

// Column 1 is "No"; then PF_COLUMNS A..Q in their display order (so the sheet's letters are one to the right).
const XL_KEYS = ['no', ...PF_COLUMNS.map((c) => c.key)];
const XL_WIDTH_OF = {
  no: 5, facility: 13, discipline: 12, subsystem: 12, subsystem_desc: 30, tag_no: 18, equipment_name: 26,
  interval: 9, checksheet_type: 11, issue: 40, action_by: 16, action: 34, status: 12, closeout_date: 11,
  remark: 28, photos: 30, open_date: 11, updated_date: 11,
};
const XL_WIDTHS = XL_KEYS.map((k) => XL_WIDTH_OF[k] || 12);
const xcol = (key) => XL_KEYS.indexOf(key) + 1;                  // 1-based
const xletter = (key) => { let n = xcol(key); let s = ''; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const LAST_COL = XL_KEYS.length;
const HEADER_ROW = 7;
const SHEET = 'Findings';

const thin = (argb = 'FFBFC7D5') => ({
  top: { style: 'thin', color: { argb } }, left: { style: 'thin', color: { argb } },
  bottom: { style: 'thin', color: { argb } }, right: { style: 'thin', color: { argb } },
});
const font = (o = {}) => ({ name: 'Arial', size: 9.5, color: { argb: 'FF1E293B' }, ...o });

async function writeFindings(wb, report, { rows, label }) {
  const shareId = report.share_id || report.cloud_code || '';
  const ws = wb.addWorksheet(SHEET, {
    views: [{ state: 'frozen', ySplit: HEADER_ROW, xSplit: 0 }],
    pageSetup: { orientation: 'landscape', paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = XL_WIDTHS.map((width) => ({ width }));
  const LAST = xletter(XL_KEYS[XL_KEYS.length - 1]);

  ws.mergeCells(`A1:${LAST}1`);
  ws.getCell('A1').value = report.title || PRESERVATION_LABEL;
  ws.getCell('A1').font = { name: 'Arial', size: 16, bold: true, color: { argb: NAVY } };
  ws.getRow(1).height = 26;
  ws.mergeCells(`A2:${LAST}2`);
  ws.getCell('A2').value = [report.location,
    report.system_tag ? `Updated by: ${report.system_tag}` : '',
    pfDateKey(report.inspection_date) ? `Updated date: ${formatPfDate(report.inspection_date)}` : '',
    `Exported ${formatPfDate(todayKeyLocal())}`].filter(Boolean).join('   |   ');
  ws.getCell('A2').font = font({ color: { argb: 'FF51607A' } });
  if (label) {
    ws.mergeCells(`A4:${LAST}4`);
    ws.getCell('A4').value = `Filtered — ${label} — ${rows.length} finding(s)`;
    ws.getCell('A4').font = font({ italic: true, color: { argb: 'FF9A3412' } });
  }
  // The database columns are not contiguous any more (v3.31.1 order), so they
  // are told apart by their header colour and this note instead of a band.
  ws.mergeCells(`A6:${LAST}6`);
  ws.getCell('A6').value = 'Lighter-blue headers = equipment data from the Preservation database.';
  ws.getCell('A6').font = font({ italic: true, size: 8.5, color: { argb: 'FF51607A' } });
  const head = ws.getRow(HEADER_ROW);
  XL_KEYS.forEach((k, i) => {
    const cell = head.getCell(i + 1);
    const col = PF_COLUMNS.find((c) => c.key === k);
    cell.value = k === 'no' ? 'No' : col.label;
    cell.font = font({ bold: true, color: { argb: 'FFFFFFFF' }, size: 10 });
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col?.db ? 'FF3B6B9E' : NAVY } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thin(NAVY);
  });
  head.height = 32;

  const refPx = colWidthToPx(XL_WIDTHS[xcol('photos') - 1]);
  let r = HEADER_ROW + 1;
  const first = r;
  for (const { item, no } of rows) {
    const st = normalizePfStatus(item.status);
    const style = PF_STATUS_STYLE[st];
    const imgs = imagesOf(item);
    const fls = filesOf(item);
    const textLines = Math.max(1, ...['subsystem_desc', 'equipment_name', 'issue', 'action', 'remark', 'action_by']
      .map((k) => linesFor(item[k], XL_WIDTHS[xcol(k) - 1])));
    let height = Math.max(30, textLines * 12.5 + 8);
    const grid = imgs.length ? photoGrid(imgs.length, refPx, { maxCols: 2 }) : null;
    const fileTopPx = fls.length ? fls.length * 15 + 4 : 0;
    if (grid || fls.length) height = Math.max(height, pxToPoints(fileTopPx + (grid ? grid.heightPx : 0)) + 4);
    height = Math.min(height, 409);
    ws.getRow(r).height = height;

    const set = (key, value, extra = {}) => {
      const c = ws.getCell(r, xcol(key));
      c.value = value;
      c.font = font(extra.font || {});
      c.alignment = { vertical: 'top', wrapText: true, ...(extra.alignment || {}) };
      c.border = thin();
      if (style.rowArgb) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.rowArgb } };
      return c;
    };
    const center = { alignment: { horizontal: 'center' } };
    set('no', no, { font: { bold: true }, alignment: { horizontal: 'center' } });
    for (const f of PF_DB_FIELDS) {
      if (f === 'interval') {
        const n = Number(item.interval);
        set(f, item.interval !== '' && Number.isFinite(n) ? n : (item.interval || ''), center);
      } else set(f, item[f] || '', f === 'tag_no' ? { font: { bold: true } } : (f === 'checksheet_type' || f === 'facility' || f === 'discipline' || f === 'subsystem') ? center : {});
    }
    set('issue', item.issue || '');
    set('action_by', item.action_by || '', center);
    set('action', item.action || '');
    const sc = set('status', st, { font: { bold: true, color: { argb: style.fg } }, alignment: { horizontal: 'center', vertical: 'middle' } });
    sc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.argb } };
    sc.dataValidation = { type: 'list', allowBlank: true, formulae: [`"${PF_STATUS_OPTIONS.join(',')}"`] };
    for (const k of ['closeout_date', 'open_date', 'updated_date']) {
      const key = pfDateKey(item[k]);
      const c = set(k, key ? excelDate(key) : '', center);
      if (key) c.numFmt = 'd-mmm-yy';
    }
    set('remark', item.remark || '');
    const oc = set('photos', '');
    if (fls.length) {
      const names = fls.map((f) => f.filename || 'file').join('\n');
      if (shareId) {
        oc.value = { text: names, hyperlink: attachmentUrl(shareId, fls[0].file_ref) };
        oc.font = font({ size: 9, underline: true, color: { argb: 'FF0563C1' } });
      } else { oc.value = names; oc.font = font({ size: 9 }); }
    }
    if (grid) {
      const cellHpx = rowPointsToPx(height);
      for (const [i, p] of imgs.entries()) {
        const img = await getImageData(p.url);
        if (!img?.base64) continue;
        try {
          const id = wb.addImage({ base64: img.base64, extension: 'jpeg' });
          const box = tileBox(i, grid);
          const top = fileTopPx + box.y;
          const h = Math.min(box.h, Math.max(8, cellHpx - top - grid.gap));
          if (h <= 8) continue;
          const { tl, br } = imageAnchor(xcol('photos') - 1, r - 1, box.x, top, box.w, h, img.aspectRatio);
          ws.addImage(id, { tl, br, editAs: 'oneCell' });
        } catch (e) { console.error('Preservation export: image not placed', e); }
      }
    }
    r += 1;
  }
  const last = Math.max(first, r - 1);
  ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: last, column: LAST_COL } };
  return { first, last };
}

function col(key) { return xletter(key); }

async function writeSummary(wb, ws, report, { rows, label, overdueDays }, range) {
  ws.columns = [{ width: 30 }, { width: 10 }, { width: 10 }, { width: 11 }, { width: 10 }, { width: 13 }, { width: 11 }];
  const items = rows.map((x) => x.item);
  const all = pfSummary(items, { overdueDays });
  const border = thin();
  const R = (key) => `'${SHEET}'!$${col(key)}$${range.first}:$${col(key)}$${range.last}`;
  const ST = R('status');
  const OD = R('open_date');
  const f = (formula, result) => ({ formula, result });

  ws.mergeCells('A1:G1');
  ws.getCell('A1').value = report.title || PRESERVATION_LABEL;
  ws.getCell('A1').font = { name: 'Arial', size: 16, bold: true, color: { argb: NAVY } };
  ws.getRow(1).height = 26;
  ws.mergeCells('A2:G2');
  ws.getCell('A2').value = [report.location,
    report.system_tag ? `Updated by: ${report.system_tag}` : '',
    pfDateKey(report.inspection_date) ? `Updated date: ${formatPfDate(report.inspection_date)}` : '',
    `Exported ${formatPfDate(todayKeyLocal())}`].filter(Boolean).join('   |   ');
  ws.getCell('A2').font = font({ color: { argb: 'FF51607A' } });
  if (label) {
    ws.mergeCells('A3:G3');
    ws.getCell('A3').value = `Filtered — ${label}. The figures below count the rows of this file.`;
    ws.getCell('A3').font = font({ italic: true, color: { argb: 'FF9A3412' } });
  }

  // KPI block — live formulas over the Findings sheet.
  const heads = ['Total', 'Open', 'On-going', 'Closed', 'Closed %', `Open > ${overdueDays} days`];
  const fills = [NAVY, PF_STATUS_STYLE.Open.argb, 'FFD97706', PF_STATUS_STYLE.Closed.argb, 'FF475569', 'FFB91C1C'];
  heads.forEach((h, i) => {
    const c = ws.getCell(5, i + 2);
    c.value = h;
    c.font = font({ bold: true, color: { argb: 'FFFFFFFF' }, size: 9 });
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills[i] } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = border;
  });
  ws.getRow(5).height = 26;
  ws.getCell('A6').value = 'Findings';
  ws.getCell('C6').value = f(`COUNTIF(${ST},"Open")`, all.open);
  ws.getCell('D6').value = f(`COUNTIF(${ST},"On-going")`, all.ongoing);
  ws.getCell('E6').value = f(`COUNTIF(${ST},"Closed")`, all.closed);
  ws.getCell('B6').value = f('C6+D6+E6', all.total);
  ws.getCell('F6').value = f('IF(B6=0,0,E6/B6)', all.total ? all.closed / all.total : 0);
  ws.getCell('F6').numFmt = '0%';
  ws.getCell('G6').value = f(`COUNTIFS(${ST},"<>Closed",${OD},"<"&(TODAY()-${overdueDays}))`, all.overdue);
  for (let c = 1; c <= 7; c += 1) {
    const cell = ws.getCell(6, c);
    cell.font = font({ bold: true, size: 11 });
    cell.alignment = { horizontal: c === 1 ? 'left' : 'center' };
    cell.border = border;
  }

  // Breakdown tables with COUNTIFS.
  let r = 8;
  const table = (title, key, list) => {
    ws.getCell(r, 1).value = title;
    ws.getCell(r, 1).font = font({ bold: true, color: { argb: NAVY }, size: 11 });
    r += 1;
    [key === 'action_by' ? 'Action By' : title.replace(/^By /, ''), 'Total', 'Open', 'On-going', 'Closed', 'Closed %', `Open > ${overdueDays}d`].forEach((h, i) => {
      const c = ws.getCell(r, i + 1);
      c.value = h;
      c.font = font({ bold: true, color: { argb: 'FFFFFFFF' } });
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      c.alignment = { horizontal: i ? 'center' : 'left' };
      c.border = border;
    });
    r += 1;
    const K = R(key);
    const firstRow = r;
    for (const b of list) {
      const crit = b.blank ? '""' : `"${String(b.name).replace(/"/g, '""')}"`;
      ws.getCell(r, 1).value = b.name;
      ws.getCell(r, 3).value = f(`COUNTIFS(${K},${crit},${ST},"Open")`, b.open);
      ws.getCell(r, 4).value = f(`COUNTIFS(${K},${crit},${ST},"On-going")`, b.ongoing);
      ws.getCell(r, 5).value = f(`COUNTIFS(${K},${crit},${ST},"Closed")`, b.closed);
      ws.getCell(r, 2).value = f(`C${r}+D${r}+E${r}`, b.total);
      ws.getCell(r, 6).value = f(`IF(B${r}=0,0,E${r}/B${r})`, b.total ? b.closed / b.total : 0);
      ws.getCell(r, 7).value = f(`COUNTIFS(${K},${crit},${ST},"<>Closed",${OD},"<"&(TODAY()-${overdueDays}))`, b.overdue);
      r += 1;
    }
    for (let rr = firstRow; rr < r; rr += 1) {
      for (let c = 1; c <= 7; c += 1) {
        const cell = ws.getCell(rr, c);
        cell.border = border;
        cell.alignment = { horizontal: c === 1 ? 'left' : 'center' };
        const colour = c === 3 ? 'FFB91C1C' : c === 4 ? 'FFB45309' : c === 5 ? 'FF047857' : c === 7 ? 'FFB91C1C' : 'FF1E293B';
        cell.font = font({ bold: c > 1, color: { argb: colour } });
      }
      ws.getCell(rr, 6).numFmt = '0%';
    }
    r += 1;
  };
  table('By Action By', 'action_by', pfBreakdown(items, 'action_by', { overdueDays }));
  table('By Facility', 'facility', pfBreakdown(items, 'facility', { overdueDays }));
  table('By Discipline', 'discipline', pfBreakdown(items, 'discipline', { overdueDays }));

  // Pictures of the two Summary charts (a failed chart must never cost the numbers).
  try {
    const png = actionByChartPng(items, { overdueDays });
    if (png) {
      ws.getCell(r, 1).value = 'FINDINGS BY ACTION BY';
      ws.getCell(r, 1).font = font({ bold: true, color: { argb: NAVY } });
      const id = wb.addImage({ base64: png.data.split(',')[1], extension: 'png' });
      ws.addImage(id, { tl: { col: 0.05, row: r + 0.2 }, ext: { width: png.width, height: png.height }, editAs: 'oneCell' });
      r += Math.ceil(png.height / 20) + 3;
    }
  } catch (e) { console.error('Preservation chart (Action By):', e); }
  try {
    const png = closureChartPng(items, { width: 900, height: 300 });
    if (png) {
      ws.getCell(r, 1).value = 'FINDINGS OPENED AND CLOSED OVER TIME (BY WEEK)';
      ws.getCell(r, 1).font = font({ bold: true, color: { argb: NAVY } });
      const id = wb.addImage({ base64: png.split(',')[1], extension: 'png' });
      ws.addImage(id, { tl: { col: 0.05, row: r + 0.2 }, ext: { width: 900, height: 300 }, editAs: 'oneCell' });
    }
  } catch (e) { console.error('Preservation chart (closure):', e); }
}

function writeLearned(wb, report) {
  const learned = pfLearnedRows(report.items || []);
  if (!learned.length) return;
  const ws = wb.addWorksheet('Database (added)');
  ws.columns = PF_DB_FIELDS.map((k) => ({ width: XL_WIDTH_OF[k] || 14 }));
  ws.getCell('A1').value = 'Tags added to the Preservation database from findings (not in the source file)';
  ws.getCell('A1').font = font({ bold: true, color: { argb: NAVY }, size: 11 });
  PF_DB_FIELDS.forEach((k, i) => {
    const c = ws.getCell(3, i + 1);
    c.value = PF_COLUMNS.find((x) => x.key === k).label;
    c.font = font({ bold: true, color: { argb: 'FFFFFFFF' } });
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B6B9E' } };
    c.border = thin();
  });
  learned.forEach((row, j) => PF_DB_FIELDS.forEach((k, i) => {
    const c = ws.getCell(4 + j, i + 1);
    c.value = row[k] || '';
    c.font = font();
    c.border = thin();
  }));
}

export async function exportPfExcel(report, view = null, opts = {}) {
  if (!report) throw new Error('No report data provided');
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Flash Report Pro';
  wb.created = new Date();
  const scope = scopeOf(report, view);
  const sum = wb.addWorksheet('Summary', { pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const range = await writeFindings(wb, report, scope);
  await writeSummary(wb, sum, report, scope, range);
  writeLearned(wb, report);
  const buffer = await wb.xlsx.writeBuffer();
  const name = `${fileBase(report)}${scope.label ? '_filtered' : ''}`;
  if (opts.returnBuffer) return { buffer, fileName: `${name}.xlsx` };
  downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${name}.xlsx`);
  return undefined;
}

/** Horizontal stacked bars by Action By (canvas → PNG), same colours as the screen. */
export function actionByChartPng(items, { overdueDays = PF_DEFAULT_OVERDUE_DAYS, width = 900 } = {}) {
  if (typeof document === 'undefined') return null;
  const list = pfBreakdown(items, 'action_by', { overdueDays }).slice(0, 14);
  if (!list.length) return null;
  const rowH = 24;
  const top = 12;
  const height = top + list.length * rowH + 34;
  const cv = document.createElement('canvas');
  const k = 2;
  cv.width = width * k; cv.height = height * k;
  const ctx = cv.getContext('2d');
  ctx.scale(k, k);
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, width, height);
  const labelW = 180;
  const numW = 80;
  const barMax = width - labelW - numW - 20;
  const max = Math.max(1, ...list.map((b) => b.total));
  const colours = [['open', '#DC2626'], ['ongoing', '#F59E0B'], ['closed', '#059669']];
  ctx.font = '12px Arial';
  list.forEach((b, i) => {
    const y = top + i * rowH;
    ctx.fillStyle = b.blank ? '#92400E' : '#334155';
    ctx.textAlign = 'right';
    const name = b.name.length > 28 ? `${b.name.slice(0, 27)}…` : b.name;
    ctx.fillText(name, labelW - 8, y + 15);
    let x = labelW;
    const w = (b.total / max) * barMax;
    for (const [key, c] of colours) {
      if (!b[key]) continue;
      const seg = (b[key] / b.total) * w;
      ctx.fillStyle = c;
      ctx.fillRect(x, y + 4, Math.max(2, seg - 2), 14);
      x += seg;
    }
    ctx.fillStyle = '#0F172A'; ctx.textAlign = 'left'; ctx.font = 'bold 12px Arial';
    ctx.fillText(`${b.total}`, labelW + w + 6, y + 15);
    ctx.font = '11px Arial'; ctx.fillStyle = '#64748B';
    ctx.fillText(`${b.percentClosed}% closed`, labelW + w + 30, y + 15);
    ctx.font = '12px Arial';
  });
  let lx = labelW;
  const ly = height - 12;
  ctx.textAlign = 'left';
  for (const [key, c] of colours) {
    ctx.fillStyle = c; ctx.fillRect(lx, ly - 9, 12, 10);
    ctx.fillStyle = '#334155';
    const t = key === 'open' ? 'Open' : key === 'ongoing' ? 'On-going' : 'Closed';
    ctx.fillText(t, lx + 17, ly);
    lx += 30 + ctx.measureText(t).width;
  }
  ctx.fillStyle = '#64748B';
  ctx.fillText(`${PF_NY_CLARIFY} = no Action By yet`, lx + 10, ly);
  return { data: cv.toDataURL('image/png'), width, height };
}

// ══════════════════════════════════════════════════════════════════
// PDF — A3 landscape, 24pt margins → 1142pt of table width.
// ══════════════════════════════════════════════════════════════════

const PDF_W_OF = {
  no: 22, facility: 48, discipline: 46, subsystem: 50, subsystem_desc: 82, tag_no: 66, equipment_name: 80,
  interval: 30, checksheet_type: 44, issue: 124, action_by: 54, action: 110, status: 46, closeout_date: 42,
  remark: 84, photos: 130, open_date: 42, updated_date: 42,
};   // sums to 1142
const PDF_W = XL_KEYS.map((k) => PDF_W_OF[k]);
const P_REF = XL_KEYS.indexOf('photos');
const P_STATUS = XL_KEYS.indexOf('status');
const PDF_CENTER = new Set(['no', 'facility', 'discipline', 'subsystem', 'interval', 'checksheet_type', 'action_by', 'status', 'closeout_date', 'open_date', 'updated_date'].map((k) => XL_KEYS.indexOf(k)));

export async function exportPfPdf(report, view = null, opts = {}) {
  if (!report) throw new Error('No report data provided');
  const [jspdfMod, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const jsPDF = jspdfMod.jsPDF || jspdfMod.default?.jsPDF || jspdfMod.default;
  if (typeof jsPDF.API.autoTable !== 'function' && autoTableMod.applyPlugin) autoTableMod.applyPlugin(jsPDF);
  const { rows, label, overdueDays } = scopeOf(report, view);
  const items = rows.map((x) => x.item);
  const all = pfSummary(items, { overdueDays });
  const shareId = report.share_id || report.cloud_code || '';

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a3' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  doc.setFont('Helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...NAVY_RGB);
  doc.text(report.title || PRESERVATION_LABEL, 24, 34);
  doc.setFontSize(10.5); doc.setTextColor(51, 65, 85);
  if (report.location) doc.text(report.location, 24, 50);
  doc.setFont('Helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(81, 96, 122);
  doc.text([
    report.system_tag ? `Updated by: ${report.system_tag}` : '',
    pfDateKey(report.inspection_date) ? `Updated date: ${formatPfDate(report.inspection_date)}` : '',
    `Exported ${formatPfDate(todayKeyLocal())}`,
  ].filter(Boolean).join('   |   '), 24, 64);

  let x = 24;
  const y = 72;
  const chip = (text, rgb, fg = [255, 255, 255]) => {
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(8.5);
    const w = doc.getTextWidth(text) + 14;
    doc.setFillColor(...rgb); doc.roundedRect(x, y, w, 15, 3, 3, 'F');
    doc.setTextColor(...fg); doc.text(text, x + 7, y + 10.5);
    x += w + 6;
  };
  chip(`Total ${all.total}`, NAVY_RGB);
  chip(`Open ${all.open}`, PF_STATUS_STYLE.Open.rgb);
  chip(`On-going ${all.ongoing}`, PF_STATUS_STYLE['On-going'].rgb, [69, 26, 3]);
  chip(`Closed ${all.closed}`, PF_STATUS_STYLE.Closed.rgb);
  chip(`Closed ${all.percentClosed}%`, [71, 85, 105]);
  chip(`Open > ${overdueDays} days ${all.overdue}`, [185, 28, 28]);
  if (label) {
    doc.setFont('Helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(154, 52, 18);
    doc.text(`Filtered — ${label} — ${rows.length} finding(s)`, x + 6, y + 10.5);
  }

  // Page 1: by Action By + the two charts.
  const bd = pfBreakdown(items, 'action_by', { overdueDays });
  doc.autoTable({
    startY: 96, margin: { left: 24, right: 24 }, tableWidth: 560,
    head: [['Action By', 'Total', 'Open', 'On-going', 'Closed', `Open > ${overdueDays}d`, '% closed']],
    body: [...bd.map((b) => [b.name, b.total, b.open, b.ongoing, b.closed, b.overdue, `${b.percentClosed}%`]),
      ['Total', all.total, all.open, all.ongoing, all.closed, all.overdue, `${all.percentClosed}%`]],
    theme: 'grid',
    styles: { font: 'Helvetica', fontSize: 9, cellPadding: 4, lineColor: [203, 213, 225], lineWidth: 0.5 },
    headStyles: { fillColor: NAVY_RGB, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 200 }, 1: { halign: 'center' }, 2: { halign: 'center', textColor: [185, 28, 28] }, 3: { halign: 'center', textColor: [180, 83, 9] }, 4: { halign: 'center', textColor: [4, 120, 87] }, 5: { halign: 'center', textColor: [185, 28, 28] }, 6: { halign: 'center' } },
    didParseCell: (d) => { if (d.section === 'body' && d.row.index === bd.length) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [241, 245, 249]; } },
  });
  const afterTable = doc.lastAutoTable?.finalY || 200;
  let chartBottom = 0;
  try {
    const png = actionByChartPng(items, { overdueDays, width: 900 });
    if (png) {
      const w = 540; const h = png.height * (w / png.width);
      doc.setFont('Helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...NAVY_RGB);
      doc.text('Findings by Action By', 610, 104);
      doc.addImage(png.data, 'PNG', 610, 112, w, Math.min(h, 360));
      chartBottom = 112 + Math.min(h, 360);
    }
  } catch (e) { console.error('Preservation PDF chart:', e); }
  try {
    const png = closureChartPng(items, { width: 980, height: 330 });
    const top = Math.max(afterTable, chartBottom) + 28;
    if (png && top + 280 < pageH - 30) {
      doc.setFont('Helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...NAVY_RGB);
      doc.text('Findings opened and closed over time (by week)', 24, top);
      doc.addImage(png, 'PNG', 24, top + 8, 980 * 0.8, 330 * 0.8);
    }
  } catch (e) { console.error('Preservation PDF chart:', e); }
  doc.addPage();

  const body = [];
  const meta = [];
  for (const { item, no } of rows) {
    const st = normalizePfStatus(item.status);
    const imgs = [];
    for (const p of imagesOf(item)) { const im = await getImageData(p.url); if (im) imgs.push(im); }
    body.push(XL_KEYS.map((k) => {
      if (k === 'no') return String(no);
      if (k === 'status') return st;
      if (k === 'photos') return '';
      if (k === 'open_date') { const d = pfOpenDays(item); return `${formatPfDate(item.open_date)}${d !== null ? `\n(${d}d)` : ''}`; }
      if (k === 'closeout_date' || k === 'updated_date') return formatPfDate(item[k]);
      return item[k] || '';
    }));
    meta.push({ imgs, files: filesOf(item), style: PF_STATUS_STYLE[st], overdue: (pfOpenDays(item) ?? -1) > overdueDays });
  }
  const gridFor = (n, w) => photoGrid(n, w - 6, { maxCols: 2 });

  doc.autoTable({
    startY: 30,
    margin: { left: 24, right: 24, bottom: 30 },
    head: [XL_KEYS.map((k) => (k === 'no' ? 'No' : `${pfColLetter(k)}. ${k === 'interval' ? 'Interval' : k === 'checksheet_type' ? 'Checksheet' : PF_COLUMNS.find((c) => c.key === k).label}`))],
    body,
    theme: 'grid',
    rowPageBreak: 'avoid',
    showHead: 'everyPage',
    styles: { font: 'Helvetica', fontSize: 6.8, cellPadding: 2.5, valign: 'top', lineColor: [203, 213, 225], lineWidth: 0.5, overflow: 'linebreak', textColor: [30, 41, 59] },
    headStyles: { fillColor: NAVY_RGB, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', valign: 'middle', fontSize: 6.8 },
    columnStyles: Object.fromEntries(PDF_W.map((w, i) => [i, { cellWidth: w }])),
    didParseCell: (data) => {
      if (data.section === 'head') {
        const key = XL_KEYS[data.column.index];
        if (PF_COLUMNS.find((c) => c.key === key)?.db) data.cell.styles.fillColor = [59, 107, 158];
        return;
      }
      if (data.section !== 'body') return;
      const m = meta[data.row.index];
      if (!m) return;
      const ci = data.column.index;
      if (m.style?.rowRgb) data.cell.styles.fillColor = m.style.rowRgb;
      if (PDF_CENTER.has(ci)) data.cell.styles.halign = 'center';
      if (ci === 0 || ci === XL_KEYS.indexOf('tag_no')) data.cell.styles.fontStyle = 'bold';
      if (ci === XL_KEYS.indexOf('open_date') && m.overdue) { data.cell.styles.textColor = [185, 28, 28]; data.cell.styles.fontStyle = 'bold'; }
      if (ci === P_STATUS) {
        data.cell.styles.fillColor = m.style.rgb;
        data.cell.styles.textColor = m.style === PF_STATUS_STYLE[PF_STATUS.ONGOING] ? [69, 26, 3] : [255, 255, 255];
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.valign = 'middle';
      }
      if (ci === P_REF && (m.imgs.length || m.files.length)) {
        const top = m.files.length * 9 + (m.files.length ? 3 : 0);
        const gh = m.imgs.length ? gridFor(m.imgs.length, PDF_W[P_REF]).heightPx : 0;
        data.cell.styles.minCellHeight = Math.min(300, top + gh + 6);
      }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== P_REF) return;
      const m = meta[data.row.index];
      if (!m) return;
      const cell = data.cell;
      let top = cell.y + 3;
      if (m.files.length) {
        doc.setFont('Helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(5, 99, 193);
        for (const fl of m.files) {
          const t = doc.splitTextToSize(String(fl.filename || 'file'), cell.width - 6)[0];
          if (shareId) doc.textWithLink(t, cell.x + 3, top + 6, { url: attachmentUrl(shareId, fl.file_ref) });
          else doc.text(t, cell.x + 3, top + 6);
          top += 9;
        }
        top += 3;
      }
      if (!m.imgs.length) return;
      const grid = gridFor(m.imgs.length, cell.width);
      m.imgs.forEach((img, i) => {
        const box = tileBox(i, grid);
        const ar = img.aspectRatio || 4 / 3;
        let w = box.w; let h = w / ar;
        if (h > box.h) { h = box.h; w = h * ar; }
        const ix = cell.x + 3 + box.x + (box.w - w) / 2;
        const iy = top + box.y + (box.h - h) / 2;
        if (iy + h > cell.y + cell.height) return;
        try { doc.addImage(img.dataUrl, 'JPEG', ix, iy, w, h, undefined, 'FAST'); } catch (e) { console.error('Preservation PDF image:', e); }
      });
    },
    didDrawPage: () => {
      doc.setFont('Helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(132, 148, 172);
      doc.text(`Block B - EPC#1  |  ${report.title || PRESERVATION_LABEL}`, 24, pageH - 14);
      doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageW - 24, pageH - 14, { align: 'right' });
    },
  });

  const name = `${fileBase(report)}${label ? '_filtered' : ''}`;
  if (opts.returnBuffer) return { buffer: doc.output('arraybuffer'), fileName: `${name}.pdf` };
  doc.save(`${name}.pdf`);
  return undefined;
}
