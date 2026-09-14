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
  ROW_STATE_STYLE, ROW_STATE, rowState, STATUS_STYLE, normalizeStatus,
  scheduleKey, completedKey, todayKey, MINI_PLAN_LABEL, STATUS_DONE,
  needsPlanDate, NO_DATE_CELL,
} from './miniPlan';
import { writeOverviewSheet, reportState } from './miniPlanReportSheets';
import { weeklySeries } from './miniPlanWeekly';
import { weeklyTrendChart } from './reportChart';
import {
  VIZ, INK, PAPER, ROW_TINT, FONT, fill, bodyFont,
} from './excelTheme';

const COLS = {
  no: 6, equipment: 38, activities: 56, schedule: 13,
  status: 13, completed: 14, state: 22,
};

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

  const today = view.today || todayKey();
  const rowsInView = view.previewRows.map((r) => r.item);

  // ── SHEET 1 — the report ─────────────────────────────────────
  writeOverviewSheet(wb, {
    title: `${title || MINI_PLAN_LABEL} — Equipment installation status`,
    subtitle: subtitle(view),
    rows: rowsInView,
    equipment: view.equipmentRows,
    today,
    range: view.range,
    weekLabel: view.weekLabel,
  });

  // ── SHEET 2 — the data ───────────────────────────────────────
  //
  // A real Excel TABLE, not a grid of coloured cells: the header gets filter
  // dropdowns, the stripes come from the table style, and the whole range can
  // be sorted, filtered and fed to a PivotTable by whoever opens it. That is
  // what "filter it like the app does" means once the file leaves the app.
  const ws = wb.addWorksheet('Data', {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 4 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.columns = [
    { width: COLS.no }, { width: COLS.equipment }, { width: COLS.activities },
    { width: COLS.schedule }, { width: COLS.status }, { width: COLS.completed },
    { width: COLS.state },
  ];

  ws.mergeCells('A1:G1');
  const t = ws.getCell('A1');
  t.value = `${title || MINI_PLAN_LABEL} — data`;
  t.font = { name: FONT, size: 13, bold: true, color: { argb: INK.onDark.argb } };
  t.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  t.fill = fill(PAPER.header.argb);
  ws.getRow(1).height = 28;

  ws.mergeCells('A2:G2');
  const sub = ws.getCell('A2');
  sub.value = subtitle(view);
  sub.font = { name: FONT, size: 9, color: { argb: INK.secondary.argb } };
  sub.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(2).height = 18;

  const tableRows = view.previewRows.map((row) => {
    const item = row.item;
    const doneOn = completedKey(item);
    return [
      row.no,
      row.equipment || '',
      item.activity || '',
      excelDate(scheduleKey(item.schedule)),
      normalizeStatus(item.status) || 'Not started',
      excelDate(doneOn),
      reportState(item, today).label,
    ];
  });

  ws.addTable({
    name: 'EquipmentStatus',
    ref: 'A4',
    headerRow: true,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: [
      { name: 'No', filterButton: true },
      { name: 'Equipment', filterButton: true },
      { name: 'Activities', filterButton: true },
      { name: 'Schedule', filterButton: true },
      { name: 'Status', filterButton: true },
      { name: 'Completed Date', filterButton: true },
      { name: 'State', filterButton: true },
    ],
    rows: tableRows.length ? tableRows : [['', '', 'No rows in this view', null, '', null, '']],
  });

  // Cell-level formatting on top of the table style: dates as dates, the
  // State column in the plan's own colours, text in navy rather than black.
  const firstRow = 5;
  view.previewRows.forEach((row, i) => {
    const r = firstRow + i;
    const item = row.item;
    const state = rowState(item, today);
    const tint = ROW_TINT[state];
    const noDate = needsPlanDate(item, today);

    ws.getRow(r).height = Math.max(16, Math.max(
      linesFor(item.activity, COLS.activities),
      linesFor(row.equipment, COLS.equipment)
    ) * 12.5 + 3);

    for (let c = 1; c <= 7; c++) {
      const cell = ws.getCell(r, c);
      cell.font = bodyFont(9.5);
      cell.alignment = {
        horizontal: c === 1 || c >= 4 ? 'center' : 'left',
        vertical: 'middle',
        wrapText: c === 2 || c === 3,
        indent: c === 2 || c === 3 ? 1 : 0,
      };
      if (c === 4 || c === 6) cell.numFmt = 'd-mmm-yy';
      // The empty Schedule box is marked; the row is left alone (BUG-027).
      if (c === 4 && noDate) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NO_DATE_CELL.argb } };
      }
    }

    // State — and an activity with NO SCHEDULE says "Unplanned", in red.
    // Nothing else on the row says so: its Schedule cell is simply empty, and
    // on screen it looks like any other future work. It is not future work,
    // it is work nobody has dated.
    const rs = reportState(item, today);
    const stateCell = ws.getCell(r, 7);
    stateCell.font = { name: FONT, size: 9, bold: true, color: { argb: rs.argb } };
    if (tint) stateCell.fill = fill(tint);

    const statusCell = ws.getCell(r, 5);
    if (normalizeStatus(item.status) === STATUS_DONE) {
      statusCell.font = { name: FONT, size: 9.5, bold: true, color: { argb: VIZ.done.argb } };
    }
  });

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
  doc.setTextColor(31, 58, 95);
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
    doc.setFillColor(234, 240, 248);
    doc.roundedRect(x, y, boxW, 34, 3, 3, 'FD');

    doc.setFontSize(6);
    doc.setTextColor(81, 96, 122);
    doc.text(String(tile.label).toUpperCase(), x + 5, y + 11, { maxWidth: boxW - 10 });

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(13);
    if (tile.signed && tile.value < 0) doc.setTextColor(185, 28, 28);
    else doc.setTextColor(31, 58, 95);
    doc.text(tile.signed ? signed(tile.value) : String(tile.value), x + 5, y + 28);
    doc.setFont('Helvetica', 'normal');
  });

  // ── The weekly picture, above the list ───────────────────────
  // Same series as the screen and the Excel overview, so the three cannot
  // tell different stories about the same week.
  let tableTop = 112;
  try {
    const series = weeklySeries(view.previewRows.map((r) => r.item), { today, maxWeeks: 14 });
    if (series.hasData) {
      const png = weeklyTrendChart(series.weeks, {
        heading: 'Weekly progress - plan vs actual',
        footnote: `To this week: plan ${series.totals.planToDate}, done ${series.totals.doneToDate}`
          + `, variance ${series.totals.doneToDate - series.totals.planToDate}`
          + (series.totals.unplanned ? `  |  ${series.totals.unplanned} task with no plan date are not in this chart` : ''),
      });
      const w = pageWidth - 48;
      const h = (w * 320) / 1020;
      doc.addImage(`data:image/png;base64,${png}`, 'PNG', 24, 108, w, h);
      tableTop = 108 + h + 10;
    }
  } catch (e) {
    // A missing picture must never cost the reader the report.
    console.warn('Weekly chart skipped in PDF:', e?.message);
  }

  // ── The table, in the order the panel showed it ──────────────
  const body = [];
  const stateMatrix = [];
  const statusMatrix = [];
  const noDateMatrix = [];

  for (const row of view.previewRows) {
    const item = row.item;
    stateMatrix[body.length] = rowState(item, today);
    statusMatrix[body.length] = normalizeStatus(item.status);
    noDateMatrix[body.length] = needsPlanDate(item, today);
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
    startY: tableTop,
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
      fillColor: [31, 58, 95], textColor: [255, 255, 255],
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
      if (data.column.index === 3 && noDateMatrix[data.row.index]) {
        data.cell.styles.fillColor = NO_DATE_CELL.rgb;
      }
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
