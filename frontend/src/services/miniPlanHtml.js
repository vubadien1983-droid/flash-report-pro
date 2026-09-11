/**
 * Standalone single-file HTML export of a CPP Mechanical Mini Plan.
 *
 * One .html to send over Zalo or email: it opens in any browser with no app,
 * no network and no sign-in, photos embedded. Colours come from
 * services/miniPlan.js like every other surface, so a plan printed, exported
 * and opened on the live link reads identically.
 *
 * The file is a SNAPSHOT, and it says so on its face — unlike the live link,
 * which keeps updating. Somebody holding an HTML copy from last Tuesday must
 * not mistake it for the current schedule.
 */

import {
  groupMiniPlanItems, miniPlanStats, rowState, ROW_STATE_STYLE, ROW_STATE_LEGEND,
  STATUS_STYLE, normalizeStatus, scheduleKey, todayKey, MINI_PLAN_LABEL,
} from './miniPlan';
import { sanitizeFilename, downloadBlob } from './exportImage';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function formatDate(iso) {
  const key = scheduleKey(iso);
  if (!key) return '';
  const [y, m, d] = key.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(d)}-${months[Number(m) - 1]}-${y.slice(2)}`;
}

export function renderMiniPlanHtml(report) {
  const today = todayKey();
  const items = report?.items || [];
  const groups = groupMiniPlanItems(items);
  const stats = miniPlanStats(items, today);
  const title = report?.title || MINI_PLAN_LABEL;

  const legend = ROW_STATE_LEGEND.map((s) => {
    const st = ROW_STATE_STYLE[s];
    return `<span class="lg"><i style="background:${st.css}"></i>${esc(st.label)}</span>`;
  }).join('');

  const rowsHtml = groups.map((group) => group.rows.map(({ item }, i) => {
    const st = ROW_STATE_STYLE[rowState(item, today)];
    const status = normalizeStatus(item.status);
    const ss = STATUS_STYLE[status];
    const photos = (item.photos || []).filter((p) => p && p.url);

    const span = group.count > 1 ? ` rowspan="${group.count}"` : '';
    const lead = i === 0
      ? `<td class="c-item"${span}>${esc(group.no)}</td><td class="c-eq"${span}>${esc(group.equipment)}</td>`
      : '';

    const photoCell = photos.length
      ? `<div class="gal">${photos.map((p, k) =>
          `<img src="${esc(p.url)}" alt="${esc(p.filename || `Photo ${k + 1}`)}" onclick="zoom(this.src)">`
        ).join('')}</div>`
      : '<span class="none">—</span>';

    return `<tr style="background:${st.css}">
      ${lead}
      <td class="c-sched">${esc(formatDate(item.schedule))}</td>
      <td class="c-act">${esc(item.activity)}</td>
      <td class="c-status"><span class="badge" style="background:${ss.css};color:${ss.cssText};border-color:${status ? ss.css : '#cbd5e1'}">${esc(status || '—')}</span></td>
      <td class="c-note">${esc(item.note)}</td>
      <td class="c-photo">${photoCell}</td>
    </tr>`;
  }).join('')).join('');

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#f1f5f9;color:#0f172a;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
  .wrap{max-width:1400px;margin:0 auto;padding:16px}
  header{background:#0f172a;color:#fff;border-radius:14px;padding:16px 18px;margin-bottom:12px}
  header h1{margin:0 0 4px;font-size:18px;letter-spacing:-.01em}
  header p{margin:0;font-size:11.5px;color:#cbd5e1}
  .stats{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
  .stat{background:rgba(255,255,255,.1);border-radius:8px;padding:4px 9px;font-size:11px;font-weight:600}
  .legend{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px;font-size:11px}
  .lg{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:3px 8px;font-weight:600;color:#334155}
  .lg i{width:11px;height:11px;border-radius:3px;border:1px solid rgba(0,0,0,.08);display:inline-block}
  .snap{font-size:11px;color:#92400e;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:6px 10px;margin-bottom:10px}
  .tw{overflow-x:auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px}
  table{border-collapse:collapse;width:100%;min-width:980px}
  th{background:#1e293b;color:#fff;font-size:11px;text-align:center;padding:9px 6px;position:sticky;top:0;z-index:2}
  td{border:1px solid #cbd5e1;padding:6px 7px;vertical-align:middle;font-size:11.5px}
  .c-item{width:44px;text-align:center;font-weight:700;background:#f8fafc}
  .c-eq{width:210px;font-weight:700;background:#f8fafc}
  .c-sched{width:82px;text-align:center;white-space:nowrap}
  .c-act{min-width:230px}
  .c-status{width:88px;text-align:center}
  .c-note{width:170px;color:#334155}
  .c-photo{width:260px}
  .badge{display:inline-block;padding:2px 8px;border-radius:6px;font-size:10.5px;font-weight:700;border:1px solid}
  .gal{display:flex;flex-wrap:wrap;gap:4px}
  .gal img{width:72px;height:72px;object-fit:cover;border-radius:7px;border:1px solid #cbd5e1;background:#fff;cursor:zoom-in}
  .none{color:#94a3b8}
  #zm{display:none;position:fixed;inset:0;background:rgba(2,6,23,.92);z-index:99;align-items:center;justify-content:center;padding:20px;cursor:zoom-out}
  #zm img{max-width:100%;max-height:100%;border-radius:10px}
  footer{text-align:center;font-size:11px;color:#64748b;padding:14px}
  @media print{body{background:#fff}.tw{border:0}th{position:static}.snap{display:none}}
</style></head>
<body>
<div class="wrap">
  <header>
    <h1>${esc(title)}</h1>
    <p>Block B - EPC#1 &nbsp;|&nbsp; ${stats.equipment} Equipment &nbsp;|&nbsp; ${stats.total} activities</p>
    <div class="stats">
      <span class="stat">Done ${stats.done} (${stats.percent}%)</span>
      <span class="stat">Due today ${stats.today}</span>
      <span class="stat">Overdue on-going ${stats.overdue}</span>
      <span class="stat">Overdue not started ${stats.missed}</span>
    </div>
  </header>

  <div class="snap">Snapshot exported ${esc(formatDate(today))}. Colours were calculated against that date — open the live link for the current schedule.</div>
  <div class="legend">${legend}</div>

  <div class="tw">
    <table>
      <thead><tr>
        <th>Item</th><th>Equipment</th><th>Schedule</th><th>Activities</th><th>Status</th><th>Note</th><th>Photo</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>

  <footer>Generated by Flash Report Pro &middot; Block B - EPC#1</footer>
</div>

<div id="zm" onclick="this.style.display='none'"><img id="zi" alt=""></div>
<script>
  function zoom(src){var z=document.getElementById('zm');document.getElementById('zi').src=src;z.style.display='flex';}
  document.addEventListener('keydown',function(e){if(e.key==='Escape')document.getElementById('zm').style.display='none';});
</script>
</body></html>`;
}

export function exportMiniPlanHtml(report) {
  if (!report) return;
  const html = renderMiniPlanHtml(report);
  const name = sanitizeFilename(report.title || MINI_PLAN_LABEL);
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${name}_${todayKey().replace(/-/g, '')}.html`);
}
