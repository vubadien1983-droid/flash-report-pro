/**
 * "Equipment installation status" — Excel and PDF of the RIGHT PANEL.
 *
 * The user's rule, and it is the right one: the file must contain what the
 * panel was showing when the button was pressed. If "This week" is on, or a
 * search is typed, or a summary figure is selected, the export carries THAT
 * set of rows and THOSE totals — not the whole plan. A report that silently
 * disagrees with the screen it came from is worse than no report, because
 * nobody notices until it has been circulated.
 *
 * So both exporters take the same `view` object the screen rendered from
 * (services/miniPlanDashboard.js). Neither re-queries the data, and neither
 * re-derives a colour or a status: those come from services/miniPlan.js like
 * everywhere else (BUG-014).
 *
 * No photos here. This tab is the plain data table.
 */

import { sanitizeFilename, downloadBlob, excelDate } from './exportImage';
import { summaryTiles, describeFilter } from './miniPlanDashboard';
import {
  ROW_STATE_STYLE, rowState, STATUS_STYLE, normalizeStatus,
  scheduleKey, completedKey, todayKey, MINI_PLAN_LABEL,
} from './miniPlan';

const COLS = { no: 6, equipment: 40, activities: 58, schedule: 14, status: 14, completed: 16 };

const thin = (argb = 'FFD0D5DD') => ({
  top: { style: 'thin', color: { argb } },
  left: { style: 'thin', color: { argb } },
  bottom: { style: 'thin', color: { argb } },
  right: { style: 'thin', color: { argb } },
});

function formatDate(iso) {
  const key = scheduleKey(iso);
  if (!key) return '';
  const [y, m, d] = key.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(d)}-${months[Number(m) - 1]}-${y.slice(2)}`;
}

function linesFor(text, widthUnits) {
  const s = String(text || '');
  if (!s) return 1;
  const perLine = Math.max(8, Math.floor(widthUnits * 1.05));
  return s.split('\n').reduce((n, part) => n + Math.max(1, Math.ceil(part.length / perLine)), 0);
}

function fileBase(title) {
  const base = sanitizeFilename(title || MINI_PLAN_LABEL);
  return `${base}_Equipment_status_${todayKey().replace(/-/g, '')}`;
}

function signed(n) { return n > 0 ? `+${n}` : String(n); }

/** The caption that says exactly what this file contains. */
function subtitle(view) {
  return `Block B - EPC#1   |   Exported ${formatDate(todayKey())}   |   ` +
    `${view.weekLabel}: ${view.range.start} to ${view.range.end}   |   ` +
    `View: ${describeFilter(view)}   |   ${view.previewRows.length} rows`;
}

// ══════════════════════════════════════════════════════════════════
// EXCEL
// ══════════════════════════════════════════════════════════════════

export async function exportDashboardExcel({ title, view }) {
  if (!view) throw new Error('No dashboard data provided');

  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Flash Report Pro';
  wb.created = new Date();

  const ws = wb.addWorksheet('Equipment status', {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 7 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.columns = [
    { key: 'no', width: COLS.no },
    { key: 'equipment', width: COLS.equipment },
    { key: 'activities', width: COLS.activities },
    { key: 'schedule', width: COLS.schedule },
    { key: 'status', width: COLS.status },
    { key: 'completed', width: COLS.completed },
  ];

  const today = view.today || todayKey();

  ws.mergeCells('A1:F1');
  const t = ws.getCell('A1');
  t.value = `${title || MINI_PLAN_LABEL} — Equipment installation status`;
  t.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FF0F172A' } };
  ws.getRow(1).height = 26;

  ws.mergeCells('A2:F2');
  const sub = ws.getCell('A2');
  sub.value = subtitle(view);
  sub.font = { name: 'Arial', size: 9, color: { argb: 'FF475569' } };
  ws.getRow(2).height = 18;

  // ── The six summary figures, labels above values ─────────────
  const tiles = summaryTiles(view);
  const labelRow = ws.getRow(4);
  const valueRow = ws.getRow(5);
  labelRow.height = 16;
  valueRow.height = 22;

  tiles.forEach((tile, i) => {
    const c = i + 1;
    const l = ws.getCell(4, c);
    l.value = tile.label;
    l.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FF475569' } };
    l.alignment = { horizontal: 'center', vertical: 'middle' };
    l.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    l.border = thin();

    const v = ws.getCell(5, c);
    v.value = tile.signed ? signed(tile.value) : tile.value;
    v.font = {
      name: 'Arial', size: 14, bold: true,
      color: { argb: tile.signed && tile.value < 0 ? 'FFB91C1C' : 'FF0F172A' },
    };
    v.alignment = { horizontal: 'center', vertical: 'middle' };
    v.border = thin();
  });

  // ── Table header ─────────────────────────────────────────────
  const headers = ['No', 'Equipment', 'Activities', 'Schedule', 'Status', 'Completed Date'];
  const headRow = ws.getRow(7);
  headRow.height = 22;
  headers.forEach((text, i) => {
    const cell = ws.getCell(7, i + 1);
    cell.value = text;
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.border = thin('FF1E293B');
  });

  // ── Rows, exactly the ones on screen and in the same order ───
  let r = 8;
  for (const row of view.previewRows) {
    const item = row.item;
    const fill = ROW_STATE_STYLE[rowState(item, today)].argb;
    const status = normalizeStatus(item.status);
    const sStyle = STATUS_STYLE[status];

    const line = ws.getRow(r);
    line.height = Math.max(18, Math.max(
      linesFor(item.activity, COLS.activities),
      linesFor(row.equipment, COLS.equipment)
    ) * 12.5 + 5);

    const cells = [
      row.no,
      row.equipment || '',
      item.activity || '',
      null,   // Schedule — written as a real date below
      status || '',
      null,   // Completed Date — ditto
    ];
    cells.forEach((value, i) => {
      const cell = ws.getCell(r, i + 1);
      if (value !== null) cell.value = value;
      cell.border = thin();
      if (i === 4 && sStyle.argb) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sStyle.argb } };
      } else if (fill) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      }
    });

    // Real DATE values, so the sheet can sort and filter on them.
    const writeDate = (col, key) => {
      const cell = ws.getCell(r, col);
      const k = scheduleKey(key);
      if (k) {
        cell.value = excelDate(k);
        cell.numFmt = 'd-mmm-yy';
      }
      cell.font = { name: 'Arial', size: 9.5, color: { argb: 'FF1F2937' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    };
    writeDate(4, item.schedule);
    writeDate(6, completedKey(item));

    ws.getCell(r, 1).font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
    ws.getCell(r, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(r, 2).font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
    ws.getCell(r, 2).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    ws.getCell(r, 3).font = { name: 'Arial', size: 9.5, color: { argb: 'FF1F2937' } };
    ws.getCell(r, 3).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    ws.getCell(r, 5).font = { name: 'Arial', size: 9.5, bold: true, color: { argb: sStyle.fg } };
    ws.getCell(r, 5).alignment = { horizontal: 'center', vertical: 'middle' };

    r++;
  }

  ws.autoFilter = { from: { row: 7, column: 1 }, to: { row: Math.max(7, r - 1), column: 6 } };

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${fileBase(title)}.xlsx`
  );
}

// ══════════════════════════════════════════════════════════════════
// PDF
// ══════════════════════════════════════════════════════════════════

export async function exportDashboardPdf({ title, view }) {
  if (!view) throw new Error('No dashboard data provided');

  const [{ default: jsPDF }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  // Portrait: six text columns fit comfortably and a progress report is read
  // as a list, so more rows per page is worth more than more width.
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const today = view.today || todayKey();

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(`${title || MINI_PLAN_LABEL} — Equipment installation status`, 24, 32);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  // The caption can run to two lines once a filter is described, so the
  // summary boxes start below where a second line would land.
  doc.text(subtitle(view), 24, 46, { maxWidth: pageWidth - 48 });

  // ── Summary boxes ────────────────────────────────────────────
  const tiles = summaryTiles(view);
  const boxW = (pageWidth - 48 - 5 * 6) / 6;
  tiles.forEach((tile, i) => {
    const x = 24 + i * (boxW + 6);
    const y = 66;
    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, y, boxW, 34, 3, 3, 'FD');

    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(String(tile.label).toUpperCase(), x + 5, y + 11, { maxWidth: boxW - 10 });

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(13);
    if (tile.signed && tile.value < 0) doc.setTextColor(185, 28, 28);
    else doc.setTextColor(15, 23, 42);
    doc.text(tile.signed ? signed(tile.value) : String(tile.value), x + 5, y + 28);
    doc.setFont('Helvetica', 'normal');
  });

  // ── The table, in the order the panel showed it ──────────────
  const body = [];
  const stateMatrix = [];
  const statusMatrix = [];

  for (const row of view.previewRows) {
    const item = row.item;
    stateMatrix[body.length] = rowState(item, today);
    statusMatrix[body.length] = normalizeStatus(item.status);
    body.push([
      String(row.no),
      row.equipment || '',
      item.activity || '',
      formatDate(item.schedule),
      normalizeStatus(item.status) || '',
      formatDate(completedKey(item)),
    ]);
  }

  doc.autoTable({
    startY: 112,
    margin: { left: 24, right: 24, bottom: 30 },
    head: [['No', 'Equipment', 'Activities', 'Schedule', 'Status', 'Completed']],
    body,
    theme: 'grid',
    rowPageBreak: 'avoid',
    showHead: 'everyPage',
    styles: {
      font: 'Helvetica', fontSize: 7, cellPadding: 2.5, valign: 'middle',
      lineColor: [203, 213, 225], lineWidth: 0.5, overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [30, 41, 59], textColor: [255, 255, 255],
      fontStyle: 'bold', halign: 'center', fontSize: 7.5,
    },
    // 24 + 130 + 197 + 54 + 52 + 54 = 511pt, inside the 547pt of printable
    // width A4 portrait leaves after the 24pt margins.
    columnStyles: {
      0: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 130, fontStyle: 'bold' },
      2: { cellWidth: 197 },
      3: { cellWidth: 54, halign: 'center' },
      4: { cellWidth: 52, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 54, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const style = ROW_STATE_STYLE[stateMatrix[data.row.index]];
      if (style?.rgb) data.cell.styles.fillColor = style.rgb;
      if (data.column.index === 4) {
        const s = STATUS_STYLE[statusMatrix[data.row.index]];
        if (s?.rgb) {
          data.cell.styles.fillColor = s.rgb;
          data.cell.styles.textColor = [255, 255, 255];
        }
      }
    },
    didDrawPage: () => {
      doc.setFontSize(7);
      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text('Block B - EPC#1  |  Equipment installation status', 24, pageHeight - 14);
      doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageWidth - 24, pageHeight - 14, { align: 'right' });
    },
  });

  doc.save(`${fileBase(title)}.pdf`);
}
