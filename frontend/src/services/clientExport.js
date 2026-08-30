import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

function sanitizeFilename(name) {
  return (name || 'Flash_Report').replace(/[\\/*?:"<>|]/g, '_').trim();
}

async function getImageBase64(url) {
  if (!url) return null;
  if (url.startsWith('data:image')) {
    const parts = url.split(',');
    const extension = url.includes('png') ? 'png' : 'jpeg';
    return { base64: parts[1], extension };
  }

  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const extension = blob.type.includes('png') ? 'png' : 'jpeg';
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result.split(',')[1];
        resolve({ base64: base64data, extension });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error('Error fetching image for export:', e);
    return null;
  }
}

export async function exportExcelClient(report) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Flash Report', {
    views: [{ showGridLines: true }]
  });

  // Set column widths
  worksheet.columns = [
    { key: 'no', width: 8 },
    { key: 'tag', width: 15 },
    { key: 'desc', width: 28 },
    { key: 'note', width: 22 },
    { key: 'photo1', width: 17 },
    { key: 'photo2', width: 17 },
    { key: 'photo3', width: 17 },
    { key: 'photo4', width: 17 }
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

  // Row 4: Detail of inspection section
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

  // Row 5: Column Headers
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

  worksheet.getCell('E5').value = 'Photos';
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

  for (const item of items) {
    const tag = (item.tag || '').trim();
    const desc = (item.description || '').trim();
    const note = (item.note || '').trim();
    const photos = item.photos || [];

    const hasContent = Boolean(tag || desc);
    const itemNo = hasContent ? seqNo++ : '';

    const row = worksheet.getRow(currentRow);
    row.height = 70;

    // No
    const cellA = worksheet.getCell(`A${currentRow}`);
    cellA.value = itemNo;
    cellA.alignment = { horizontal: 'center', vertical: 'middle' };
    cellA.border = thinBorder;

    // Tag
    const cellB = worksheet.getCell(`B${currentRow}`);
    cellB.value = tag;
    cellB.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cellB.border = thinBorder;

    // Description
    const cellC = worksheet.getCell(`C${currentRow}`);
    cellC.value = desc;
    cellC.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    cellC.border = thinBorder;

    // Note
    const cellD = worksheet.getCell(`D${currentRow}`);
    cellD.value = note;
    cellD.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    cellD.border = thinBorder;

    // Photo cells (E, F, G, H)
    const photoCols = ['E', 'F', 'G', 'H'];
    for (let p = 0; p < 4; p++) {
      const colLetter = photoCols[p];
      const cell = worksheet.getCell(`${colLetter}${currentRow}`);
      cell.border = thinBorder;

      const photoObj = photos[p];
      if (photoObj && photoObj.url) {
        const imgData = await getImageBase64(photoObj.url);
        if (imgData) {
          const imageId = workbook.addImage({
            base64: imgData.base64,
            extension: imgData.extension
          });

          worksheet.addImage(imageId, {
            tl: { col: 4 + p + 0.1, row: currentRow - 1 + 0.1 },
            br: { col: 4 + p + 0.9, row: currentRow - 1 + 0.9 },
            editAs: 'oneCell'
          });
        }
      }
    }

    currentRow++;
  }

  // Write and download
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
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export async function exportPdfClient(report) {
  // A4 Landscape: 297mm x 210mm
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

  // Prepare table data and images
  const items = report.items || [];
  let seqNo = 1;
  const tableRows = [];
  const photoMatrix = [];

  for (const item of items) {
    const hasContent = Boolean(item.tag?.trim() || item.description?.trim());
    const no = hasContent ? String(seqNo++) : '';

    const rowPhotos = [];
    for (let p = 0; p < 4; p++) {
      const pObj = item.photos?.[p];
      if (pObj && pObj.url) {
        const img = await getImageBase64(pObj.url);
        rowPhotos.push(img ? `data:image/${img.extension};base64,${img.base64}` : null);
      } else {
        rowPhotos.push(null);
      }
    }
    photoMatrix.push(rowPhotos);

    tableRows.push([
      no,
      item.tag || '',
      item.description || '',
      item.note || '',
      '', '', '', ''
    ]);
  }

  // Draw table with AutoTable
  doc.autoTable({
    startY: 114,
    margin: { left: 36, right: 36, bottom: 40 },
    head: [
      [
        { content: 'No', styles: { halign: 'center' } },
        { content: 'Tag', styles: { halign: 'center' } },
        { content: 'Inspection Description', styles: { halign: 'left' } },
        { content: 'Note', styles: { halign: 'left' } },
        { content: 'Photos (Columns E, F, G, H)', colSpan: 4, styles: { halign: 'center' } }
      ]
    ],
    body: tableRows,
    theme: 'grid',
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
      0: { cellWidth: 35, halign: 'center' },
      1: { cellWidth: 75, halign: 'center' },
      2: { cellWidth: 180 },
      3: { cellWidth: 140 },
      4: { cellWidth: 85, minCellHeight: 65 },
      5: { cellWidth: 85 },
      6: { cellWidth: 85 },
      7: { cellWidth: 85 }
    },
    didDrawCell: function (data) {
      // Draw image inside photo cells
      if (data.section === 'body' && data.column.index >= 4 && data.column.index <= 7) {
        const photoIdx = data.column.index - 4;
        const imgData = photoMatrix[data.row.index]?.[photoIdx];
        if (imgData) {
          const padding = 3;
          const maxW = data.cell.width - padding * 2;
          const maxH = data.cell.height - padding * 2;
          try {
            doc.addImage(
              imgData,
              'JPEG',
              data.cell.x + padding,
              data.cell.y + padding,
              maxW,
              maxH,
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
      // Footer page numbering
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
