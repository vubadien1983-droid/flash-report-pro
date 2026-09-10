/**
 * Generates a beautiful, single-file, 100% standalone HTML report
 * with left-aligned text, reduced text size, and enlarged photos for clear inspection viewing.
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

  const activeItemsCount = items.filter(
    (item) =>
      item.tag?.trim() ||
      item.description?.trim() ||
      item.note?.trim() ||
      (item.photos && item.photos.some((p) => p?.url))
  ).length;
  const displayCount = activeItemsCount > 0 ? activeItemsCount : items.length;

  // Build rows HTML
  const rowsHtml = items.map((item, idx) => {
    const hasContent = Boolean(item.tag?.trim() || item.description?.trim());
    const no = hasContent ? seqCounter++ : '';
    const photos = item.photos || [];

    const photoCellsHtml = [0, 1, 2, 3].map((slotIdx) => {
      const p = photos[slotIdx];

      // A slot holding a FILE becomes a link that opens the attachment. The
      // link resolves against the app's public attachment route, so whoever
      // receives this HTML opens the file without signing in.
      if (p && p.kind === 'file') {
        const shareId = report.share_id || report.cloud_code;
        const name = (p.filename || 'Attachment').replace(/</g, '&lt;');
        const href = shareId && p.file_ref
          ? `${(typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '')}#/file/${shareId}/${p.file_ref}`
          : '';
        const inner = href
          ? `<a href="${href}" target="_blank" rel="noreferrer" style="color:#0563C1;font-weight:700;text-decoration:underline;font-size:11px;word-break:break-all;">${name}</a>`
          : `<span style="color:#6b7280;font-style:italic;font-size:10.5px;">${name} (share the report to activate this link)</span>`;
        return `
          <td style="padding: 6px; width: 175px; text-align: center; vertical-align: middle; border: 1px solid #d1d5db; background: #ffffff;">
            <div style="width: 165px; height: 125px; margin: 0 auto; display: flex; flex-direction: column; gap: 6px; align-items: center; justify-content: center; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; padding: 6px;">
              <div style="width:30px;height:30px;border-radius:8px;background:#0284c7;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">FILE</div>
              ${inner}
            </div>
          </td>
        `;
      }

      if (p && p.url) {
        return `
          <td style="padding: 6px; width: 175px; text-align: center; vertical-align: middle; border: 1px solid #d1d5db; background: #ffffff;">
            <div style="width: 165px; height: 125px; margin: 0 auto; display: flex; align-items: center; justify-content: center; background: #f8fafc; border-radius: 8px; overflow: hidden; cursor: pointer; border: 1px solid #e2e8f0;" onclick="openZoom('${p.url}')">
              <img src="${p.url}" alt="Photo" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
            </div>
          </td>
        `;
      } else {
        return `
          <td style="padding: 6px; width: 175px; text-align: center; vertical-align: middle; border: 1px solid #d1d5db; color: #cbd5e1; font-size: 11px; background: #fafafa;">
            -
          </td>
        `;
      }
    }).join('');

    return `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 8px; text-align: center; vertical-align: middle; font-weight: bold; font-size: 11px; border: 1px solid #d1d5db; width: 42px; background: #fafafa;">
          ${no ? `<span style="display: inline-flex; width: 22px; height: 22px; border-radius: 50%; background: #e2e8f0; align-items: center; justify-content: center; font-size: 11px; font-weight: bold;">${no}</span>` : '-'}
        </td>
        <td style="padding: 8px; text-align: center; vertical-align: top; font-weight: bold; font-size: 11px; color: #0f172a; border: 1px solid #d1d5db; width: 115px; white-space: pre-wrap; word-break: break-word; line-height: 1.35;">
          ${item.tag || '-'}
        </td>
        <td style="padding: 8px 10px; text-align: left; vertical-align: top; font-size: 11px; color: #334155; line-height: 1.45; border: 1px solid #d1d5db; width: 220px; white-space: pre-wrap; word-break: break-word;">
          ${item.description || '-'}
        </td>
        <td style="padding: 8px 10px; text-align: left; vertical-align: top; font-size: 11px; color: #475569; line-height: 1.45; border: 1px solid #d1d5db; width: 160px; white-space: pre-wrap; word-break: break-word;">
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
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f1f5f9; color: #1e293b; padding: 12px; }
    .container { max-width: 1300px; margin: 0 auto; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.06), 0 2px 4px -1px rgba(0,0,0,0.04); overflow: hidden; border: 1px solid #e2e8f0; }
    .header-bar { padding: 12px 20px; background: #ffffff; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
    .brand { font-size: 13px; font-weight: bold; color: #0f172a; display: flex; align-items: center; gap: 8px; }
    .badge { background: #eff6ff; color: #2563eb; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; text-transform: uppercase; border: 1px solid #bfdbfe; }
    .actions button { padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: all 0.15s; }
    .btn-print { background: #2563eb; color: #ffffff; }
    .btn-print:hover { background: #1d4ed8; }
    .content { padding: 16px; }
    .report-title-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 18px; margin-bottom: 14px; }
    .report-title { font-size: 17px; font-weight: bold; color: #0f172a; margin-bottom: 10px; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; background: #f8fafc; padding: 10px 14px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 11px; }
    .meta-item span { display: block; color: #64748b; font-size: 10px; font-weight: 600; margin-bottom: 2px; text-transform: uppercase; }
    .meta-item strong { color: #0f172a; font-weight: 700; }
    .section-title { margin-bottom: 8px; font-size: 11px; font-weight: bold; color: #334155; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; justify-content: space-between; }
    .table-container { width: 100%; overflow-x: auto; border: 1px solid #cbd5e1; border-radius: 8px; }
    table { width: 100%; min-width: 1150px; border-collapse: collapse; text-align: left; }
    th { background: #f1f5f9; color: #0f172a; font-size: 11px; font-weight: 700; text-align: center; padding: 8px 6px; border: 1px solid #cbd5e1; }
    #lightbox { display: none; position: fixed; inset: 0; background: rgba(15, 23, 42, 0.88); z-index: 999; align-items: center; justify-content: center; padding: 16px; backdrop-filter: blur(4px); }
    #lightbox img { max-width: 92vw; max-height: 92vh; object-fit: contain; border-radius: 8px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
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
            <strong style="color: #2563eb;">${discipline}</strong>
          </div>
        </div>
      </div>

      <div class="section-title">
        <span>Detail of inspection (${displayCount} ${displayCount === 1 ? 'item' : 'items'})</span>
        <span style="font-size: 10px; color: #64748b; font-weight: normal; text-transform: none;">Click photo to zoom</span>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th style="width: 42px;">No</th>
              <th style="width: 115px;">Tag</th>
              <th style="width: 220px;">Inspection Description</th>
              <th style="width: 160px;">Note</th>
              <th colspan="4" style="width: 700px;">Illustration</th>
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
