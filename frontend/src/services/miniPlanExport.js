/**
 * CPP Mechanical Mini Plan — Excel and PDF exporters.
 *
 * The Mini Plan is a different document from a Flash Report, so it gets its
 * own exporters rather than extra branches inside clientExport.js: seven
 * columns, Item and Equipment merged down each equipment's activities, a row
 * colour that carries meaning, and a Photo column holding any number of
 * images in ONE cell.
 *
 * Every colour and every item number comes from services/miniPlan.js. Nothing
 * here re-derives either (BUG-014), and every image is placed with native EMU
 * offsets through services/exportImage.js (BUG-015).
 */

import {
  getImageData, sanitizeFilename, downloadBlob,
  colWidthToPx, rowPointsToPx, pxToPoints, imageAnchor, photoGrid, tileBox,
} from './exportImage';
import {
  groupMiniPlanItems, miniPlanStats, rowState, ROW_STATE_STYLE, ROW_STATE_LEGEND,
  STATUS_STYLE, normalizeStatus, scheduleKey, todayKey, MINI_PLAN_LABEL,
} from './miniPlan';

// --- Column geometry, shared by both exporters --------------------
// Excel width units. colWidthToPx() is the ONLY conversion to pixels; the
// photo tiling and the row heights are both derived from it, so changing a
// width here cannot leave the images anchored to the old one.
const COLS = {
  item: 7,
  equipment: 44,
  schedule: 13,
  activities: 50,
  status: 13,
  note: 30,
  photo: 46,
};

const PHOTO_COL_INDEX = 6;              // 0-based: G
const MIN_ROW_POINTS = 30;
const LINE_POINTS = 12.5;

const thin = (argb = 'FFD0D5DD') => ({
  top: { style: 'thin', color: { argb } },
  left: { style: 'thin', color: { argb } },
  bottom: { style: 'thin', color: { argb } },
  right: { style: 'thin', color: { argb } },
});

/** Rough wrapped-line count for a string in a column of the given width. */
function linesFor(text, widthUnits) {
  const s = String(text || '');
  if (!s) return 1;
  const perLine = Math.max(8, Math.floor(widthUnits * 1.05));
  return s.split('\n').reduce((n, part) => n + Math.max(1, Math.ceil(part.length / perLine)), 0);
}

function formatDate(iso) {
  const key = scheduleKey(iso);
  if (!key) return '';
  const [y, m, d] = key.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(d)}-${months[Number(m) - 1]}-${y.slice(2)}`;
}

function fileBase(report) {
  const title = sanitizeFilename(report.title || MINI_PLAN_LABEL);
  const stamp = todayKey().replace(/-/g, '');
  return `${title}_${stamp}`;
}

// ══════════════════════════════════════════════════════════════════
// EXCEL
// ══════════════════════════════════════════════════════════════════

export async function exportMiniPlanExcel(report) {
  if (!report) throw new Error('No report data provided');

  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Flash Report Pro';
  wb.created = new Date();
  wb.modified = new Date();

  const ws = wb.addWorksheet('MEC mini plan', {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 4 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.columns = [
    { key: 'item', width: COLS.item },
    { key: 'equipment', width: COLS.equipment },
    { key: 'schedule', width: COLS.schedule },
    { key: 'activities', width: COLS.activities },
    { key: 'status', width: COLS.status },
    { key: 'note', width: COLS.note },
    { key: 'photo', width: COLS.photo },
  ];

  const today = todayKey();
  const items = report.items || [];
  const groups = groupMiniPlanItems(items);
  const stats = miniPlanStats(items, today);

  // ── Title block ──────────────────────────────────────────────
  ws.mergeCells('A1:G1');
  const t = ws.getCell('A1');
  t.value = report.title || MINI_PLAN_LABEL;
  t.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FF0F172A' } };
  t.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(1).height = 26;

  ws.mergeCells('A2:G2');
  const sub = ws.getCell('A2');
  sub.value =
    `Block B - EPC#1   |   Exported ${formatDate(today)}   |   ` +
    `${stats.equipment} Equipment, ${stats.total} activities   |   ` +
    `Done ${stats.done} (${stats.percent}%)  ·  Due today ${stats.today}  ·  ` +
    `Overdue on-going ${stats.overdue}  ·  Overdue not started ${stats.missed}`;
  sub.font = { name: 'Arial', size: 9, color: { argb: 'FF475569' } };
  sub.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(2).height = 18;

  // ── Legend: the colour key, so the file explains itself ──────
  const legendRow = ws.getRow(3);
  legendRow.height = 18;
  ws.getCell('A3').value = 'Legend:';
  ws.getCell('A3').font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };
  ROW_STATE_LEGEND.forEach((state, i) => {
    const cell = ws.getCell(3, 2 + i);
    const style = ROW_STATE_STYLE[state];
    cell.value = style.label;
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FF1F2937' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (style.argb) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.argb } };
    cell.border = thin();
  });

  // ── Column headers ───────────────────────────────────────────
  const headers = ['Item', 'Equipment', 'Schedule', 'Activities', 'Status', 'Note', 'Photo'];
  const headRow = ws.getRow(4);
  headRow.height = 24;
  headers.forEach((text, i) => {
    const cell = ws.getCell(4, i + 1);
    cell.value = text;
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.border = thin('FF1E293B');
  });

  // ── Data rows ────────────────────────────────────────────────
  const photoCellWidthPx = colWidthToPx(COLS.photo);
  let excelRow = 5;

  for (const group of groups) {
    const groupStartRow = excelRow;

    for (const { item } of group.rows) {
      const state = rowState(item, today);
      const rowFill = ROW_STATE_STYLE[state].argb;
      const status = normalizeStatus(item.status);
      const photos = (item.photos || []).filter((p) => p && p.url);

      // Height: whichever needs more room, the wrapped text or the photo grid.
      const textLines = Math.max(
        linesFor(item.activity, COLS.activities),
        linesFor(item.note, COLS.note),
        1
      );
      let heightPoints = Math.max(MIN_ROW_POINTS, textLines * LINE_POINTS + 8);

      let grid = null;
      if (photos.length) {
        grid = photoGrid(photos.length, photoCellWidthPx);
        heightPoints = Math.max(heightPoints, pxToPoints(grid.heightPx) + 4);
      }

      const row = ws.getRow(excelRow);
      row.height = heightPoints;

      // Item (A) and Equipment (B) are written on the FIRST row of the group
      // only; the merge below makes them span the rest.
      const cellA = ws.getCell(excelRow, 1);
      const cellB = ws.getCell(excelRow, 2);
      if (excelRow === groupStartRow) {
        cellA.value = group.no === '' ? '' : group.no;
        cellA.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0F172A' } };
        cellA.alignment = { horizontal: 'center', vertical: 'middle' };

        cellB.value = group.equipment || '';
        cellB.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
        cellB.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      }
      cellA.border = thin();
      cellB.border = thin();

      // Schedule (C) — a REAL date value, not text, so the sheet can sort and
      // filter on it. Blank stays blank; an invented date would be read by the
      // colour rule as a real deadline.
      const cellC = ws.getCell(excelRow, 3);
      const sched = scheduleKey(item.schedule);
      if (sched) {
        const [y, m, d] = sched.split('-').map(Number);
        cellC.value = new Date(y, m - 1, d);
        cellC.numFmt = 'd-mmm-yy';
      } else {
        cellC.value = '';
      }
      cellC.font = { name: 'Arial', size: 9.5, color: { argb: 'FF1F2937' } };
      cellC.alignment = { horizontal: 'center', vertical: 'middle' };

      // Activities (D)
      const cellD = ws.getCell(excelRow, 4);
      cellD.value = item.activity || '';
      cellD.font = { name: 'Arial', size: 9.5, color: { argb: 'FF1F2937' } };
      cellD.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

      // Status (E) — its own colour, distinct from the row's.
      const cellE = ws.getCell(excelRow, 5);
      const sStyle = STATUS_STYLE[status];
      cellE.value = status || '';
      cellE.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: sStyle.fg } };
      cellE.alignment = { horizontal: 'center', vertical: 'middle' };

      // Note (F)
      const cellF = ws.getCell(excelRow, 6);
      cellF.value = item.note || '';
      cellF.font = { name: 'Arial', size: 9, color: { argb: 'FF374151' } };
      cellF.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

      // Photo (G)
      const cellG = ws.getCell(excelRow, 7);
      cellG.alignment = { horizontal: 'center', vertical: 'middle' };

      // Fill C..G with the row colour. A and B are left neutral: they are
      // merged across several activities that may each be in a different
      // state, so colouring them would have to pick one and mislead.
      for (let c = 3; c <= 7; c++) {
        const cell = ws.getCell(excelRow, c);
        cell.border = thin();
        if (c === 5 && sStyle.argb) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sStyle.argb } };
        } else if (rowFill) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowFill } };
        }
      }

      // Tile the photos inside the single Photo cell.
      if (grid) {
        const cellHeightPx = rowPointsToPx(heightPoints);
        for (const [i, p] of photos.entries()) {
          const img = await getImageData(p.url);
          if (!img?.base64) continue;
          try {
            const id = wb.addImage({ base64: img.base64, extension: 'jpeg' });
            const box = tileBox(i, grid);
            // Never let the grid overflow the cell it belongs to.
            const h = Math.min(box.h, Math.max(8, cellHeightPx - box.y - grid.gap));
            const { tl, br } = imageAnchor(
              PHOTO_COL_INDEX, excelRow - 1, box.x, box.y, box.w, h, img.aspectRatio
            );
            ws.addImage(id, { tl, br, editAs: 'oneCell' });
          } catch (e) {
            console.error('Mini Plan: could not attach image', e);
          }
        }
      }

      excelRow++;
    }

    // Merge Item and Equipment down the group, exactly as the source sheet.
    if (group.count > 1) {
      ws.mergeCells(groupStartRow, 1, excelRow - 1, 1);
      ws.mergeCells(groupStartRow, 2, excelRow - 1, 2);
    }
  }

  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, excelRow - 1), column: 7 } };

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${fileBase(report)}.xlsx`
  );
}

// ══════════════════════════════════════════════════════════════════
// PDF
// ══════════════════════════════════════════════════════════════════

export async function exportMiniPlanPdf(report) {
  if (!report) throw new Error('No report data provided');

  const [{ default: jsPDF }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const today = todayKey();
  const items = report.items || [];
  const groups = groupMiniPlanItems(items);
  const stats = miniPlanStats(items, today);

  // ── Header ───────────────────────────────────────────────────
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(report.title || MINI_PLAN_LABEL, 24, 34);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Block B - EPC#1   |   Exported ${formatDate(today)}   |   ${stats.equipment} Equipment, ` +
    `${stats.total} activities   |   Done ${stats.done} (${stats.percent}%)`,
    24, 48
  );

  // Legend swatches
  let lx = 24;
  const ly = 58;
  doc.setFontSize(7.5);
  for (const state of ROW_STATE_LEGEND) {
    const s = ROW_STATE_STYLE[state];
    if (s.rgb) {
      doc.setFillColor(...s.rgb);
      doc.setDrawColor(203, 213, 225);
      doc.rect(lx, ly, 9, 9, 'FD');
    }
    doc.setTextColor(51, 65, 85);
    doc.text(s.label, lx + 12, ly + 7);
    lx += 14 + doc.getTextWidth(s.label) + 14;
  }

  // ── Build the table body, with Item/Equipment spanning groups ─
  const body = [];
  const photoMatrix = [];   // body row index -> image objects
  const stateMatrix = [];   // body row index -> row state
  const statusMatrix = [];

  const PHOTO_COL_WIDTH = 190;
  const STATUS_COL = 4;   // table column index of Status
  const PHOTO_COL = 6;    // table column index of Photo

  for (const group of groups) {
    for (const [i, { item }] of group.rows.entries()) {
      const state = rowState(item, today);
      const status = normalizeStatus(item.status);

      const photos = (item.photos || []).filter((p) => p && p.url);
      const images = [];
      for (const p of photos) {
        const img = await getImageData(p.url);
        if (img) images.push(img);
      }

      const rowIndex = body.length;
      photoMatrix[rowIndex] = images;
      stateMatrix[rowIndex] = state;
      statusMatrix[rowIndex] = status;

      const cells = [];
      if (i === 0) {
        cells.push({
          content: group.no === '' ? '' : String(group.no),
          rowSpan: group.count,
          styles: { halign: 'center', valign: 'middle', fontStyle: 'bold', fillColor: [248, 250, 252] },
        });
        cells.push({
          content: group.equipment || '',
          rowSpan: group.count,
          styles: { halign: 'left', valign: 'middle', fontStyle: 'bold', fillColor: [248, 250, 252] },
        });
      }

      cells.push(formatDate(item.schedule));
      cells.push(item.activity || '');
      cells.push(status || '');
      cells.push(item.note || '');
      cells.push('');                       // Photo cell — drawn in didDrawCell

      body.push(cells);
    }
  }

  doc.autoTable({
    startY: 74,
    margin: { left: 24, right: 24, bottom: 34 },
    head: [['Item', 'Equipment', 'Schedule', 'Activities', 'Status', 'Note', 'Photo']],
    body,
    theme: 'grid',
    // An engineering plan must not tear a row - or the photos drawn in it -
    // across a page boundary (BUG-010).
    rowPageBreak: 'avoid',
    showHead: 'everyPage',
    styles: {
      font: 'Helvetica',
      fontSize: 7.5,
      cellPadding: 3,
      valign: 'middle',
      lineColor: [203, 213, 225],
      lineWidth: 0.5,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 28, halign: 'center' },
      1: { cellWidth: 138 },
      2: { cellWidth: 54, halign: 'center' },
      3: { cellWidth: 196 },
      4: { cellWidth: 54, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 122 },
      6: { cellWidth: PHOTO_COL_WIDTH },
    },

    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const state = stateMatrix[data.row.index];
      const style = ROW_STATE_STYLE[state];

      // The merged Item / Equipment cells span activities that may each be in
      // a different state, so they keep their neutral fill rather than
      // claiming one of them.
      const isSpanning = data.cell.rowSpan > 1;
      if (!isSpanning && style?.rgb) data.cell.styles.fillColor = style.rgb;

      // The Status cell always wears its own colour.
      //
      // `data.column.index` is the TABLE column (0..6), not a position in the
      // raw array: autoTable accounts for the cells a rowSpan swallowed when
      // it maps an array row onto columns. So 4 is Status and 6 is Photo on
      // every row, whether that row carries the merged Item/Equipment cells
      // or not — do not try to correct for the shorter raw array.
      if (data.column.index === STATUS_COL) {
        const s = STATUS_STYLE[statusMatrix[data.row.index]];
        if (s?.rgb) {
          data.cell.styles.fillColor = s.rgb;
          data.cell.styles.textColor = [255, 255, 255];
        }
      }

      // Reserve height for the photo grid so didDrawCell has room to draw in.
      if (data.column.index === PHOTO_COL) {
        const images = photoMatrix[data.row.index] || [];
        if (images.length) {
          const grid = photoGrid(images.length, PHOTO_COL_WIDTH - 6);
          data.cell.styles.minCellHeight = Math.min(260, grid.heightPx + 6);
        }
      }
    },

    didDrawCell: (data) => {
      if (data.section !== 'body') return;
      // The Photo column is the LAST cell of the row whichever shape the row
      // has (7 cells on a group's first row, 5 on the others).
      if (data.column.index !== PHOTO_COL) return;

      const images = photoMatrix[data.row.index] || [];
      if (!images.length) return;

      const grid = photoGrid(images.length, data.cell.width - 6);
      images.forEach((img, i) => {
        const box = tileBox(i, grid);
        const ar = img.aspectRatio || 4 / 3;
        let w = box.w;
        let h = w / ar;
        if (h > box.h) { h = box.h; w = h * ar; }

        const x = data.cell.x + 3 + box.x + (box.w - w) / 2;
        const y = data.cell.y + 3 + box.y + (box.h - h) / 2;

        // Never paint outside the cell, whatever the grid says.
        if (y + h > data.cell.y + data.cell.height) return;

        try {
          doc.addImage(img.dataUrl, 'JPEG', x, y, w, h, undefined, 'FAST');
        } catch (e) {
          console.error('Mini Plan PDF image:', e);
        }
      });
    },

    didDrawPage: () => {
      doc.setFontSize(7.5);
      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text('Block B - EPC#1  |  CPP Mechanical Mini Plan', 24, pageHeight - 16);
      doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageWidth - 24, pageHeight - 16, { align: 'right' });
    },
  });

  doc.save(`${fileBase(report)}.pdf`);
}
