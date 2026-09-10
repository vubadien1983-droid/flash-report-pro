/**
 * exceljs, jspdf and jspdf-autotable together are ~1.4MB of the bundle, and
 * none of them are needed until the user actually presses Export. They are
 * loaded on demand below so the app's first paint on a phone stays fast.
 */

function sanitizeFilename(name) {
  return (name || 'Flash_Report').replace(/[\\/*?:"<>|]/g, '_').trim();
}

/**
 * Robustly converts any image URL or Data URL (PNG, JPEG, WEBP, BMP, AVIF, Zalo clipboard)
 * into a clean JPEG base64 string, and calculates its exact natural aspect ratio
 * so images are NEVER squished or distorted in Excel and PDF.
 */
async function getImageData(url) {
  if (!url) return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const nw = img.naturalWidth || img.width || 800;
      const nh = img.naturalHeight || img.height || 600;
      const maxDim = 800;
      let w = nw;
      let h = nh;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      // Fill white background for transparent PNGs
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const base64 = dataUrl.split(',')[1];
      resolve({
        base64,
        extension: 'jpeg',
        dataUrl,
        aspectRatio: nw / nh,
        width: w,
        height: h
      });
    };
    img.onerror = () => {
      console.warn('Image load error during export:', url.substring(0, 40));
      if (url.startsWith('data:image')) {
        const parts = url.split(',');
        resolve({
          base64: parts[1],
          extension: 'jpeg',
          dataUrl: url,
          aspectRatio: 1.33,
          width: 800,
          height: 600
        });
      } else {
        resolve(null);
      }
    };
    img.src = url;
  });
}

/**
 * Public URL that opens a slot's attached file with no sign-in.
 *
 * Exports are read by people who do not have the app, so a cell holding a file
 * has to become a real hyperlink. That link points at the app's public
 * attachment route, which reads from the world-readable `shared_reports`
 * collection — which is why the caller must publish the report before
 * exporting one that has attachments.
 */
function attachmentLink(report, photo) {
  const shareId = report?.share_id || report?.cloud_code;
  if (!shareId || !photo?.file_ref) return null;
  const base = window.location.origin + window.location.pathname;
  return `${base}#/file/${shareId}/${photo.file_ref}`;
}

function isFileSlot(p) {
  return Boolean(p && p.kind === 'file');
}

export async function exportExcelClient(report) {
  if (!report) throw new Error('No report data provided');

  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Flash Report Pro';
  workbook.lastModifiedBy = 'Flash Report Pro';
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet('Flash Report', {
    views: [{ showGridLines: true }]
  });

  // Set column widths (Reduced text columns, enlarged photo columns E, F, G, H)
  worksheet.columns = [
    { key: 'no', width: 6 },
    { key: 'tag', width: 15 },
    { key: 'desc', width: 28 },
    { key: 'note', width: 20 },
    { key: 'photo1', width: 22 },  // PHOTO_COL_WIDTH
    { key: 'photo2', width: 22 },
    { key: 'photo3', width: 22 },
    { key: 'photo4', width: 22 }
  ];

  const thinBorder = {
    top: { style: 'thin', color: { argb: 'D0D5DD' } },
    left: { style: 'thin', color: { argb: 'D0D5DD' } },
    bottom: { style: 'thin', color: { argb: 'D0D5DD' } },
    right: { style: 'thin', color: { argb: 'D0D5DD' } }
  };

  const headerFill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'F3F4F6' }
  };

  const sectionFill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'E5E7EB' }
  };

  // Row 1: Report Title
  const row1 = worksheet.getRow(1);
  row1.height = 24;
  worksheet.getCell('A1').value = 'Report:';
  worksheet.getCell('A1').font = { name: 'Arial', size: 11, bold: true, color: { argb: '111827' } };
  worksheet.getCell('A1').alignment = { vertical: 'middle' };

  worksheet.getCell('B1').value = report.title || 'Untitled Flash Report';
  worksheet.getCell('B1').font = { name: 'Arial', size: 11, bold: true, color: { argb: '1F2937' } };
  worksheet.getCell('B1').alignment = { vertical: 'middle' };
  worksheet.mergeCells('B1:H1');

  // Row 2: Tag & Location
  const row2 = worksheet.getRow(2);
  row2.height = 20;
  worksheet.getCell('A2').value = 'System / Equipment Tag:';
  worksheet.getCell('A2').font = { name: 'Arial', size: 10, bold: false, color: { argb: '374151' } };
  worksheet.getCell('A2').alignment = { vertical: 'middle' };

  worksheet.getCell('C2').value = report.system_tag || '';
  worksheet.getCell('C2').font = { name: 'Arial', size: 10, bold: true, color: { argb: '111827' } };
  worksheet.getCell('C2').alignment = { vertical: 'middle' };
  worksheet.mergeCells('C2:D2');

  worksheet.getCell('E2').value = 'Location:';
  worksheet.getCell('E2').font = { name: 'Arial', size: 10, bold: false, color: { argb: '374151' } };
  worksheet.getCell('E2').alignment = { vertical: 'middle' };

  worksheet.getCell('F2').value = report.location || '';
  worksheet.getCell('F2').font = { name: 'Arial', size: 10, bold: true, color: { argb: '111827' } };
  worksheet.getCell('F2').alignment = { vertical: 'middle' };
  worksheet.mergeCells('F2:H2');

  // Row 3: Inspection Date & Discipline
  const row3 = worksheet.getRow(3);
  row3.height = 20;
  worksheet.getCell('A3').value = 'Inspection Date:';
  worksheet.getCell('A3').font = { name: 'Arial', size: 10, bold: false, color: { argb: '374151' } };
  worksheet.getCell('A3').alignment = { vertical: 'middle' };

  worksheet.getCell('C3').value = report.inspection_date || '';
  worksheet.getCell('C3').font = { name: 'Arial', size: 10, bold: true, color: { argb: '111827' } };
  worksheet.getCell('C3').alignment = { vertical: 'middle' };
  worksheet.mergeCells('C3:D3');

  worksheet.getCell('E3').value = 'Discipline:';
  worksheet.getCell('E3').font = { name: 'Arial', size: 10, bold: false, color: { argb: '374151' } };
  worksheet.getCell('E3').alignment = { vertical: 'middle' };

  worksheet.getCell('F3').value = report.discipline || '';
  worksheet.getCell('F3').font = { name: 'Arial', size: 10, bold: true, color: { argb: '111827' } };
  worksheet.getCell('F3').alignment = { vertical: 'middle' };
  worksheet.mergeCells('F3:H3');

  // Bottom thick line under header
  ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach((col) => {
    worksheet.getCell(`${col}3`).border = {
      bottom: { style: 'medium', color: { argb: '1F2937' } }
    };
  });

  // Row 4: Detail of inspection section bar
  const row4 = worksheet.getRow(4);
  row4.height = 22;
  worksheet.getCell('A4').value = 'Detail of inspection';
  worksheet.getCell('A4').font = { name: 'Arial', size: 10, bold: true, color: { argb: '1F2937' } };
  worksheet.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getCell('A4').fill = sectionFill;
  worksheet.mergeCells('A4:H4');
  ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach((col) => {
    worksheet.getCell(`${col}4`).border = thinBorder;
  });

  // Row 5: Column Headers (Bold & Centered, "Illustration" column)
  const row5 = worksheet.getRow(5);
  row5.height = 24;
  const headers = [
    { col: 'A', text: 'No' },
    { col: 'B', text: 'Tag' },
    { col: 'C', text: 'Inspection Description' },
    { col: 'D', text: 'Note' }
  ];
  headers.forEach(({ col, text }) => {
    const cell = worksheet.getCell(`${col}5`);
    cell.value = text;
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: '111827' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = headerFill;
    cell.border = thinBorder;
  });

  // Merge E5:H5 for "Illustration"
  worksheet.getCell('E5').value = 'Illustration';
  worksheet.getCell('E5').font = { name: 'Arial', size: 10, bold: true, color: { argb: '111827' } };
  worksheet.getCell('E5').alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getCell('E5').fill = headerFill;
  worksheet.mergeCells('E5:H5');
  ['E', 'F', 'G', 'H'].forEach((col) => {
    worksheet.getCell(`${col}5`).border = thinBorder;
  });

  // Data Rows
  const items = report.items || [];
  let currentRow = 6;
  let seqNo = 1;

  // Derive the photo cell's true aspect ratio from the values actually used
  // above, rather than hard-coding it — a mismatch here is what stretches
  // images out of proportion.
  //   Excel column width unit → px:  width * 7 + 5
  //   Row height points       → px:  points * 96/72
  const PHOTO_COL_WIDTH = 22;   // must match worksheet.columns photo entries
  const PHOTO_ROW_HEIGHT = 92;  // must match row.height below

  const cellWidthPx = PHOTO_COL_WIDTH * 7 + 5;      // ≈ 159px
  const cellHeightPx = PHOTO_ROW_HEIGHT * (96 / 72); // ≈ 123px
  const cellAspectRatio = cellWidthPx / cellHeightPx; // ≈ 1.30

  for (const item of items) {
    const tag = (item.tag || '').trim();
    const desc = (item.description || '').trim();
    const note = (item.note || '').trim();
    const photos = item.photos || [];

    const hasContent = Boolean(tag || desc);
    const itemNo = hasContent ? seqNo++ : '';

    const row = worksheet.getRow(currentRow);
    row.height = PHOTO_ROW_HEIGHT;

    // No (Centered)
    const cellA = worksheet.getCell(`A${currentRow}`);
    cellA.value = itemNo;
    cellA.font = { name: 'Arial', size: 9.5, bold: false, color: { argb: '111827' } };
    cellA.alignment = { horizontal: 'center', vertical: 'middle' };
    cellA.border = thinBorder;

    // Tag (Centered)
    const cellB = worksheet.getCell(`B${currentRow}`);
    cellB.value = tag;
    cellB.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: '111827' } };
    cellB.alignment = { horizontal: 'center', vertical: 'top', wrapText: true };
    cellB.border = thinBorder;

    // Description (Left, Top)
    const cellC = worksheet.getCell(`C${currentRow}`);
    cellC.value = desc;
    cellC.font = { name: 'Arial', size: 9.5, bold: false, color: { argb: '1F2937' } };
    cellC.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
    cellC.border = thinBorder;

    // Note (Left, Top)
    const cellD = worksheet.getCell(`D${currentRow}`);
    cellD.value = note;
    cellD.font = { name: 'Arial', size: 9.5, bold: false, color: { argb: '374151' } };
    cellD.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
    cellD.border = thinBorder;

    // Photo cells (E, F, G, H)
    const photoCols = ['E', 'F', 'G', 'H'];
    for (let p = 0; p < 4; p++) {
      const colLetter = photoCols[p];
      const cell = worksheet.getCell(`${colLetter}${currentRow}`);
      cell.border = thinBorder;

      const photoObj = photos[p];

      if (isFileSlot(photoObj)) {
        // The cell becomes a clickable link to the attached file.
        const href = attachmentLink(report, photoObj);
        const name = photoObj.filename || 'Attachment';
        if (href) {
          cell.value = { text: name, hyperlink: href, tooltip: 'Open the attached file' };
          cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF0563C1' }, underline: true };
        } else {
          // Not published yet — say so rather than writing a dead link.
          cell.value = `${name} (share the report to activate this link)`;
          cell.font = { name: 'Arial', size: 8.5, italic: true, color: { argb: 'FF6B7280' } };
        }
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        continue;
      }

      if (photoObj && photoObj.url) {
        const imgData = await getImageData(photoObj.url);
        if (imgData && imgData.base64) {
          try {
            const imageId = workbook.addImage({
              base64: imgData.base64,
              extension: 'jpeg'
            });

            // Letterbox the image inside the cell: scale the constraining
            // axis to the full padded area, shrink the other by the aspect
            // ratio, then centre both. Preserves proportions exactly.
            const PAD = 0.90; // leaves a 5% margin on every side
            const imgAR = imgData.aspectRatio || 1.33;

            let colSpan = PAD;
            let rowSpan = PAD;

            if (imgAR < cellAspectRatio) {
              // Taller than the cell → height fills, width shrinks
              colSpan = PAD * (imgAR / cellAspectRatio);
            } else {
              // Wider than the cell → width fills, height shrinks
              rowSpan = PAD * (cellAspectRatio / imgAR);
            }

            const colOffset = (1 - colSpan) / 2;
            const rowOffset = (1 - rowSpan) / 2;

            worksheet.addImage(imageId, {
              tl: { col: 4 + p + colOffset, row: currentRow - 1 + rowOffset },
              br: { col: 4 + p + colOffset + colSpan, row: currentRow - 1 + rowOffset + rowSpan },
              editAs: 'oneCell'
            });
          } catch (imgErr) {
            console.error('Error attaching image to worksheet:', imgErr);
          }
        }
      }
    }

    currentRow++;
  }

  // Write Excel binary buffer
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const title = sanitizeFilename(report.title);
  const dateStr = (report.inspection_date || '').replace(/-/g, '') || 'report';
  const fileName = `${title}_${dateStr}.xlsx`;

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }, 100);
}

export async function exportPdfClient(report) {
  if (!report) throw new Error('No report data provided');

  // A4 Landscape: 297mm x 210mm (841.89pt x 595.28pt)
  const [{ default: jsPDF }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Header metadata block
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Report:', 36, 40);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(report.title || 'Untitled Flash Report', 85, 40);

  doc.setFontSize(9);
  doc.setFont('Helvetica', 'bold');
  doc.text('System / Equipment Tag:', 36, 56);
  doc.setFont('Helvetica', 'normal');
  doc.text(report.system_tag || '-', 155, 56);

  doc.setFont('Helvetica', 'bold');
  doc.text('Location:', 420, 56);
  doc.setFont('Helvetica', 'normal');
  doc.text(report.location || '-', 470, 56);

  doc.setFont('Helvetica', 'bold');
  doc.text('Inspection Date:', 36, 72);
  doc.setFont('Helvetica', 'normal');
  doc.text(report.inspection_date || '-', 155, 72);

  doc.setFont('Helvetica', 'bold');
  doc.text('Discipline:', 420, 72);
  doc.setFont('Helvetica', 'normal');
  doc.text(report.discipline || '-', 470, 72);

  // Line below header
  doc.setDrawColor(31, 41, 55);
  doc.setLineWidth(1);
  doc.line(36, 82, pageWidth - 36, 82);

  // Section bar
  doc.setFillColor(229, 231, 235);
  doc.rect(36, 90, pageWidth - 72, 18, 'F');
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(31, 41, 55);
  doc.text('Detail of inspection', pageWidth / 2, 102, { align: 'center' });

  // Prepare table data and normalized images
  const items = report.items || [];
  let seqNo = 1;
  const tableRows = [];
  const photoMatrix = [];
  const fileMatrix = [];

  for (const item of items) {
    const hasContent = Boolean(item.tag?.trim() || item.description?.trim());
    const no = hasContent ? String(seqNo++) : '';

    const rowPhotos = [];
    const rowFiles = [];
    for (let p = 0; p < 4; p++) {
      const pObj = item.photos?.[p];
      if (isFileSlot(pObj)) {
        rowPhotos.push(null);
        rowFiles.push({ name: pObj.filename || 'Attachment', href: attachmentLink(report, pObj) });
      } else if (pObj && pObj.url) {
        const img = await getImageData(pObj.url);
        rowPhotos.push(img || null);
        rowFiles.push(null);
      } else {
        rowPhotos.push(null);
        rowFiles.push(null);
      }
    }
    photoMatrix.push(rowPhotos);
    fileMatrix.push(rowFiles);

    tableRows.push([
      no,
      item.tag || '',
      item.description || '',
      item.note || '',
      '', '', '', ''
    ]);
  }

  // Draw table with AutoTable (Bold & Centered headers, "Illustration")
  doc.autoTable({
    startY: 114,
    margin: { left: 36, right: 36, bottom: 40 },
    head: [
      [
        { content: 'No', styles: { halign: 'center', fontStyle: 'bold' } },
        { content: 'Tag', styles: { halign: 'center', fontStyle: 'bold' } },
        { content: 'Inspection Description', styles: { halign: 'center', fontStyle: 'bold' } },
        { content: 'Note', styles: { halign: 'center', fontStyle: 'bold' } },
        { content: 'Illustration', colSpan: 4, styles: { halign: 'center', fontStyle: 'bold' } }
      ]
    ],
    body: tableRows,
    theme: 'grid',
    // Engineering reports must not tear a row — or the photo drawn inside
    // it — across a page boundary. 'avoid' moves the whole row to the next
    // page instead, and the header is redrawn there.
    rowPageBreak: 'avoid',
    showHead: 'everyPage',
    styles: {
      font: 'Helvetica',
      fontSize: 8,
      cellPadding: 4,
      valign: 'middle',
      lineColor: [209, 213, 219],
      lineWidth: 0.5
    },
    headStyles: {
      fillColor: [243, 244, 246],
      textColor: [17, 24, 39],
      fontStyle: 'bold'
    },
    columnStyles: {
      0: { cellWidth: 28, halign: 'center' },
      1: { cellWidth: 62, halign: 'center' },
      2: { cellWidth: 170, halign: 'left' },
      3: { cellWidth: 130, halign: 'left' },
      4: { cellWidth: 95, minCellHeight: 70 },
      5: { cellWidth: 95 },
      6: { cellWidth: 95 },
      7: { cellWidth: 95 }
    },
    didDrawCell: function (data) {
      if (data.section === 'body' && data.column.index >= 4 && data.column.index <= 7) {
        const photoIdx = data.column.index - 4;

        const fileObj = fileMatrix[data.row.index]?.[photoIdx];
        if (fileObj) {
          // A file slot: draw the name as a real, clickable PDF link.
          const cx = data.cell.x + data.cell.width / 2;
          const cy = data.cell.y + data.cell.height / 2;
          doc.setFontSize(7.5);
          doc.setFont('Helvetica', 'bold');
          doc.setTextColor(fileObj.href ? 5 : 107, fileObj.href ? 99 : 114, fileObj.href ? 193 : 128);
          const lines = doc.splitTextToSize(fileObj.name, data.cell.width - 8);
          const lineH = 9;
          const startY = cy - ((lines.length - 1) * lineH) / 2;
          lines.forEach((ln, li) => doc.text(ln, cx, startY + li * lineH, { align: 'center' }));
          if (fileObj.href) {
            doc.link(data.cell.x + 2, data.cell.y + 2, data.cell.width - 4, data.cell.height - 4, { url: fileObj.href });
          }
          doc.setTextColor(31, 41, 55);
          return;
        }

        const imgObj = photoMatrix[data.row.index]?.[photoIdx];
        if (imgObj && imgObj.dataUrl) {
          const padding = 2;
          const boxW = data.cell.width - padding * 2;
          const boxH = data.cell.height - padding * 2;
          const boxAR = boxW / boxH;
          const imgAR = imgObj.aspectRatio || 1.33;

          let drawW = boxW;
          let drawH = boxH;
          let drawX = data.cell.x + padding;
          let drawY = data.cell.y + padding;

          if (imgAR < boxAR) {
            // Taller image: fit height, center horizontally
            drawW = boxH * imgAR;
            drawX += (boxW - drawW) / 2;
          } else {
            // Wider image: fit width, center vertically
            drawH = boxW / imgAR;
            drawY += (boxH - drawH) / 2;
          }

          try {
            doc.addImage(
              imgObj.dataUrl,
              'JPEG',
              drawX,
              drawY,
              drawW,
              drawH,
              undefined,
              'FAST'
            );
          } catch (e) {
            console.error('Error embedding PDF image cell:', e);
          }
        }
      }
    },
    didDrawPage: function (data) {
      const str = `Page ${doc.internal.getNumberOfPages()}`;
      doc.setFontSize(8);
      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text('Block B - EPC#1 Project | Flash Inspection Report', 36, pageHeight - 20);
      doc.text(str, pageWidth - 36, pageHeight - 20, { align: 'right' });
    }
  });

  const title = sanitizeFilename(report.title);
  const dateStr = (report.inspection_date || '').replace(/-/g, '') || 'report';
  doc.save(`${title}_${dateStr}.pdf`);
}
