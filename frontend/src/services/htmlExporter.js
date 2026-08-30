/**
 * Generates a beautiful, single-file, 100% standalone HTML report
 * that can be opened in any web browser (Laptop or Phone) completely offline.
 */

function sanitizeFilename(name) {
  return (name || 'Flash_Report').replace(/[\\/*?:"<>|]/g, '_').trim();
}

export function exportStandaloneHtml(report) {
  if (!report) return;

  const items = report.items || [];
  let seqCounter = 1;

  const title = report.title || 'Untitled Flash Report';
  const tag = report.system_tag || '-';
  const location = report.location || '-';
  const date = report.inspection_date || '-';
  const discipline = report.discipline || '-';

  // Build rows HTML
  const rowsHtml = items.map((item, idx) => {
    const hasContent = Boolean(item.tag?.trim() || item.description?.trim());
    const no = hasContent ? seqCounter++ : '';
    const photos = item.photos || [];

    const photoCellsHtml = [0, 1, 2, 3].map((slotIdx) => {
      const p = photos[slotIdx];
      if (p && p.url) {
        return `
          <td style="padding: 6px; width: 110px; text-align: center; vertical-align: middle; border: 1px solid #d1d5db;">
            <div style="width: 100px; height: 75px; margin: 0 auto; display: flex; align-items: center; justify-content: center; background: #f9fafb; border-radius: 6px; overflow: hidden; cursor: pointer; border: 1px solid #e5e7eb;" onclick="openZoom('${p.url}')">
              <img src="${p.url}" alt="Photo" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
            </div>
          </td>
        `;
      } else {
        return `
          <td style="padding: 6px; width: 110px; text-align: center; vertical-align: middle; border: 1px solid #d1d5db; color: #9ca3af; font-size: 11px; background: #fafafa;">
            -
          </td>
        `;
      }
    }).join('');

    return `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 8px; text-align: center; vertical-align: middle; font-weight: bold; border: 1px solid #d1d5db; width: 45px;">
          ${no ? `<span style="display: inline-flex; width: 24px; height: 24px; border-radius: 50%; background: #e2e8f0; align-items: center; justify-content: center; font-size: 11px;">${no}</span>` : '-'}
        </td>
        <td style="padding: 8px; text-align: center; vertical-align: middle; font-weight: bold; border: 1px solid #d1d5db; width: 120px;">
          ${item.tag || '-'}
        </td>
        <td style="padding: 8px; text-align: left; vertical-align: middle; border: 1px solid #d1d5db; font-size: 12px; line-height: 1.5; white-space: pre-wrap;">
          ${item.description || '-'}
        </td>
        <td style="padding: 8px; text-align: left; vertical-align: middle; border: 1px solid #d1d5db; font-size: 12px; line-height: 1.5; white-space: pre-wrap; width: 150px;">
          ${item.note || '-'}
        </td>
        ${photoCellsHtml}
      </tr>
    `;
  }).join('');

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f3f4f6; color: #1f2937; padding: 16px; }
    .container { max-width: 1100px; margin: 0 auto; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03); overflow: hidden; border: 1px solid #e5e7eb; }
    .header-bar { padding: 12px 20px; background: #ffffff; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
    .brand { font-size: 14px; font-weight: bold; color: #0f172a; display: flex; align-items: center; gap: 8px; }
    .badge { background: #eff6ff; color: #1d4ed8; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; border: 1px solid #bfdbfe; }
    .actions button { padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: all 0.15s; }
    .btn-print { background: #2563eb; color: #ffffff; }
    .btn-print:hover { background: #1d4ed8; }
    .content { padding: 20px; }
    .report-title-card { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
    .report-title { font-size: 18px; font-weight: bold; color: #111827; margin-bottom: 12px; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 12px; }
    .meta-item span { display: block; color: #64748b; font-size: 11px; margin-bottom: 2px; }
    .meta-item strong { color: #0f172a; font-weight: 600; }
    .table-container { width: 100%; overflow-x: auto; border: 1px solid #d1d5db; border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th { background: #f3f4f6; color: #111827; font-size: 12px; font-weight: bold; text-align: center; padding: 10px 8px; border: 1px solid #d1d5db; }
    #lightbox { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 999; align-items: center; justify-content: center; padding: 20px; }
    #lightbox img { max-width: 90vw; max-height: 90vh; object-fit: contain; border-radius: 8px; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .container { border: none; box-shadow: none; max-width: 100%; }
      .header-bar { display: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-bar">
      <div class="brand">
        <span class="badge">Flash Report</span>
        <span>${title}</span>
      </div>
      <div class="actions">
        <button class="btn-print" onclick="window.print()">🖨️ Print / Save PDF</button>
      </div>
    </div>

    <div class="content">
      <div class="report-title-card">
        <h1 class="report-title">${title}</h1>
        <div class="meta-grid">
          <div class="meta-item">
            <span>System / Equipment Tag:</span>
            <strong>${tag}</strong>
          </div>
          <div class="meta-item">
            <span>Location:</span>
            <strong>${location}</strong>
          </div>
          <div class="meta-item">
            <span>Inspection Date:</span>
            <strong>${date}</strong>
          </div>
          <div class="meta-item">
            <span>Discipline:</span>
            <strong style="color: #1d4ed8;">${discipline}</strong>
          </div>
        </div>
      </div>

      <div style="margin-bottom: 8px; font-size: 12px; font-weight: bold; color: #374151; text-transform: uppercase; letter-spacing: 0.05em;">
        Detail of inspection (${items.length} ${items.length === 1 ? 'item' : 'items'})
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th style="width: 45px;">No</th>
              <th style="width: 120px;">Tag</th>
              <th>Inspection Description</th>
              <th style="width: 150px;">Note</th>
              <th colspan="4" style="width: 440px;">Illustration</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <div id="lightbox" onclick="closeZoom()">
    <img id="lightbox-img" src="" alt="Full view" />
  </div>

  <script>
    function openZoom(url) {
      document.getElementById('lightbox-img').src = url;
      document.getElementById('lightbox').style.display = 'flex';
    }
    function closeZoom() {
      document.getElementById('lightbox').style.display = 'none';
    }
  </script>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const dateStr = (report.inspection_date || '').replace(/-/g, '') || 'report';
  const fileName = `${sanitizeFilename(report.title)}_${dateStr}.html`;

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
