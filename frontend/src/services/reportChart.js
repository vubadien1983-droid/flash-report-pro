/**
 * Charts for the Excel report, drawn on a canvas and embedded as images.
 *
 * ExcelJS cannot create a native Excel chart — it has no chart API at all — so
 * the choice is a picture or nothing. A picture is the right trade here: the
 * sheet next to it carries every number the chart is drawn from, so nothing is
 * lost that a reader would want to click on, and the file opens the same way
 * on a phone, in Google Sheets and in a PDF print.
 *
 * Drawing rules (they are the reason these read as a report and not as
 * spreadsheet clip-art):
 *   - thin marks, rounded data-ends, a 2px gap between adjacent fills;
 *   - every value DIRECTLY LABELLED, so hue never carries meaning alone —
 *     which is also what makes the softer amber legitimate on white;
 *   - recessive axes: one pale baseline, no gridlines, no 3-D, no shadows;
 *   - text in ink tokens (navy / slate), never in the series colour, never
 *     black.
 */

import { VIZ, INK, PAPER } from './excelTheme';

const FONT = '"Segoe UI", Calibri, Arial, sans-serif';
const SCALE = 2;                       // drawn at 2x so it stays crisp in Excel

function surface(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = PAPER.surface.hex;
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = 'middle';
  return { canvas, ctx, width, height };
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
  else {
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
  ctx.fill();
}

function title(ctx, text, x, y, size = 12) {   // size is the last argument
  ctx.fillStyle = INK.primary.hex;
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(text, x, y);
}

function toBase64(canvas) {
  return canvas.toDataURL('image/png').split(',')[1];
}

/**
 * Completion doughnut with the percentage in the middle and a labelled legend.
 * Segments with a zero value are dropped rather than drawn as a hairline.
 */
export function donutChart(segments, { width = 330, height = 220, heading = '', centerSub = 'complete' } = {}) {
  const { canvas, ctx } = surface(width, height);
  const data = (segments || []).filter((s) => s.value > 0);
  const total = data.reduce((n, s) => n + s.value, 0) || 1;

  if (heading) title(ctx, heading, 12, 16);

  const cx = 84;
  const cy = height / 2 + 6;
  const outer = 62;
  const inner = 40;

  let angle = -Math.PI / 2;
  for (const seg of data) {
    const sweep = (seg.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, outer, angle, angle + sweep);
    ctx.arc(cx, cy, inner, angle + sweep, angle, true);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    // A 2px surface gap between neighbouring segments, never a black stroke.
    ctx.strokeStyle = PAPER.surface.hex;
    ctx.lineWidth = 2;
    ctx.stroke();
    angle += sweep;
  }

  const done = data.find((s) => s.key === 'done');
  const pct = Math.round(((done?.value || 0) / total) * 100);
  ctx.textAlign = 'center';
  ctx.fillStyle = INK.primary.hex;
  ctx.font = `700 24px ${FONT}`;
  ctx.fillText(`${pct}%`, cx, cy - 4);
  ctx.fillStyle = INK.secondary.hex;
  ctx.font = `600 10px ${FONT}`;
  ctx.fillText(centerSub, cx, cy + 16);

  // Legend: swatch + label + count, so the reading never depends on hue.
  let ly = cy - (data.length - 1) * 11 - 2;
  ctx.textAlign = 'left';
  for (const seg of data) {
    ctx.fillStyle = seg.color;
    roundRect(ctx, 168, ly - 5, 10, 10, 3);
    ctx.fillStyle = INK.primary.hex;
    ctx.font = `600 10.5px ${FONT}`;
    ctx.fillText(`${seg.label}`, 184, ly);
    ctx.fillStyle = INK.secondary.hex;
    ctx.font = `700 10.5px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(String(seg.value), width - 12, ly);
    ctx.textAlign = 'left';
    ly += 22;
  }

  return toBase64(canvas);
}

/**
 * A small column chart — used for plan vs actual, where two bars beside each
 * other is the entire message.
 */
export function columnChart(bars, { width = 330, height = 220, heading = '', footnote = '' } = {}) {
  const { canvas, ctx } = surface(width, height);
  if (heading) title(ctx, heading, 12, 16);

  const list = bars || [];
  const max = Math.max(1, ...list.map((b) => b.value));
  const baseY = height - (footnote ? 44 : 30);
  const topY = 40;
  const plotH = baseY - topY;
  const slot = (width - 40) / Math.max(1, list.length);
  const barW = Math.min(58, slot - 18);

  list.forEach((b, i) => {
    const x = 20 + slot * i + (slot - barW) / 2;
    const h = Math.max(2, (b.value / max) * plotH);
    ctx.fillStyle = b.color;
    roundRect(ctx, x, baseY - h, barW, h, 4);

    ctx.textAlign = 'center';
    ctx.fillStyle = INK.primary.hex;
    ctx.font = `700 13px ${FONT}`;
    ctx.fillText(String(b.value), x + barW / 2, baseY - h - 11);

    ctx.fillStyle = INK.secondary.hex;
    ctx.font = `600 10px ${FONT}`;
    ctx.fillText(b.label, x + barW / 2, baseY + 13);
  });

  ctx.strokeStyle = PAPER.rule.hex;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(16, baseY + 0.5);
  ctx.lineTo(width - 16, baseY + 0.5);
  ctx.stroke();

  if (footnote) {
    ctx.textAlign = 'center';
    ctx.fillStyle = INK.muted.hex;
    ctx.font = `600 10px ${FONT}`;
    ctx.fillText(footnote, width / 2, height - 14);
  }

  return toBase64(canvas);
}

/**
 * Horizontal bars for "the equipment with the most work left" — a ranking is
 * read down a list, not across an axis, and the labels are long.
 */
export function rankChart(rows, { width = 1020, height = 330, heading = '' } = {}) {
  const { canvas, ctx } = surface(width, height);
  if (heading) title(ctx, heading, 12, 18, 13);

  const list = (rows || []).slice(0, 10);
  if (!list.length) return toBase64(canvas);

  const max = Math.max(1, ...list.map((r) => r.total));
  // The equipment name is the point of this chart - "96. Gas Turbine Generation
  // Package (Dual…" tells a meeting nothing. The label column takes 44% of the
  // width and the text is TRUNCATED BY MEASUREMENT, not by a character count,
  // so a name is only ever shortened when it genuinely does not fit.
  const labelW = Math.round(width * 0.44);
  const trackX = labelW + 20;
  const trackW = width - trackX - 96;
  const top = 40;
  const rowH = Math.min(27, (height - top - 14) / list.length);
  const labelFontPx = 12;

  const fit = (text, maxWidth) => {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    return `${text.slice(0, lo)}…`;
  };

  list.forEach((r, i) => {
    const y = top + i * rowH;
    const midY = y + rowH / 2;

    ctx.textAlign = 'left';
    ctx.fillStyle = INK.primary.hex;
    ctx.font = `600 ${labelFontPx}px ${FONT}`;
    const label = fit(r.label, labelW - 16);
    ctx.fillText(label, 12, midY);

    const h = Math.max(7, rowH - 9);
    // The whole bar is the equipment's scope; the filled part is what is done.
    ctx.fillStyle = PAPER.band.hex;
    roundRect(ctx, trackX, midY - h / 2, (r.total / max) * trackW, h, 4);
    if (r.done > 0) {
      ctx.fillStyle = VIZ.done.hex;
      roundRect(ctx, trackX, midY - h / 2, (r.done / max) * trackW, h, 4);
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = INK.secondary.hex;
    ctx.font = `700 12px ${FONT}`;
    ctx.fillText(`${r.done} / ${r.total}`, width - 12, midY);
  });

  return toBase64(canvas);
}

/**
 * Plan vs actual, week by week — the report's version of the chart on the
 * dashboard, drawn from the same series so the meeting and the file agree.
 *
 *   columns : tasks planned in the week / tasks finished in the week
 *   lines   : both running totals, on their own scale at the right
 *
 * The actual series stops at the current week. A future week has no actual,
 * and a zero drawn there would read as a failure that has not happened yet.
 */
/** Text with a white halo, so a number over a bar or a line stays readable. */
function haloText(ctx, text, x, y, color, size = 9, align = 'center') {
  ctx.textAlign = align;
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = PAPER.surface.hex;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export function weeklyTrendChart(weeks, { width = 1020, height = 320, heading = '', footnote = '' } = {}) {
  const { canvas, ctx } = surface(width, height);
  const rows = Array.isArray(weeks) ? weeks : [];
  if (!rows.length) return toBase64(canvas);

  if (heading) title(ctx, heading, 12, 16, 12);

  // Legend, right-aligned on the heading line.
  const legend = [
    ['Plan / week', VIZ.plan.hex, 'bar'],
    ['Actual / week', VIZ.actual.hex, 'bar'],
    ['Cum. plan', INK.primary.hex, 'dash'],
    ['Cum. actual', VIZ.done.hex, 'line'],
  ];
  ctx.font = `600 9.5px ${FONT}`;
  ctx.textAlign = 'left';
  let lx = width - 12 - legend.reduce((w, [t]) => w + ctx.measureText(t).width + 26, 0);
  legend.forEach(([text, color, kind]) => {
    if (kind === 'bar') { ctx.fillStyle = color; roundRect(ctx, lx, 12, 9, 9, 2); }
    else {
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.setLineDash(kind === 'dash' ? [4, 3] : []);
      ctx.beginPath(); ctx.moveTo(lx, 16.5); ctx.lineTo(lx + 14, 16.5); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = INK.secondary.hex;
    ctx.fillText(text, lx + (kind === 'bar' ? 13 : 18), 17);
    lx += ctx.measureText(text).width + 26 + (kind === 'bar' ? 0 : 4);
  });

  const M = { top: 40, right: 46, bottom: 34, left: 40 };
  const plotW = width - M.left - M.right;
  const plotH = height - M.top - M.bottom;
  const base = M.top + plotH;

  const maxBar = Math.max(1, ...rows.map((w) => Math.max(w.plan || 0, w.actual || 0)));
  const maxCum = Math.max(1, ...rows.map((w) => Math.max(w.cumPlan || 0, w.cumActual || 0)));
  const band = plotW / rows.length;
  const barW = Math.max(4, Math.min(20, band * 0.32));
  const yBar = (v) => base - (v / maxBar) * plotH;
  const yCum = (v) => base - (v / maxCum) * plotH;
  const xMid = (i) => M.left + band * (i + 0.5);
  const every = rows.length > 18 ? 2 : 1;

  // Baseline only — the labels carry the values, so gridlines are noise.
  ctx.strokeStyle = PAPER.rule ? PAPER.rule.hex : '#CBD5E1';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(M.left, base + 0.5); ctx.lineTo(M.left + plotW, base + 0.5); ctx.stroke();

  ctx.fillStyle = INK.muted.hex;
  ctx.font = `400 9px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(String(maxBar), M.left - 6, M.top);
  ctx.textAlign = 'left';
  ctx.fillText(String(maxCum), M.left + plotW + 6, M.top);

  rows.forEach((w, i) => {
    const x = xMid(i);
    if (w.isCurrent) {
      ctx.fillStyle = `${VIZ.unplanned.hex}1F`;
      ctx.fillRect(x - band / 2, M.top - 10, band, plotH + 10);
      ctx.fillStyle = VIZ.unplanned.hex;
      ctx.font = `700 9px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('NOW', x, M.top - 16);
    }
    if (w.plan > 0) {
      ctx.fillStyle = VIZ.plan.hex;
      roundRect(ctx, x - barW - 1, yBar(w.plan), barW, base - yBar(w.plan), 2);
      haloText(ctx, String(w.plan), x - barW / 2 - 1, yBar(w.plan) - 7, VIZ.plan.hex);
    }
    if (w.actual != null && w.actual > 0) {
      ctx.fillStyle = VIZ.actual.hex;
      roundRect(ctx, x + 1, yBar(w.actual), barW, base - yBar(w.actual), 2);
      haloText(ctx, String(w.actual), x + barW / 2 + 1, yBar(w.actual) - 7, VIZ.actual.hex);
    }
    if (i % every === 0) {
      ctx.textAlign = 'center';
      ctx.font = `${w.isCurrent ? 700 : 400} 9px ${FONT}`;
      ctx.fillStyle = w.isCurrent ? INK.primary.hex : INK.muted.hex;
      ctx.fillText(w.label, x, base + 16);
    }
  });

  const drawLine = (pick, color, dash) => {
    const pts = rows.map((w, i) => (pick(w) == null ? null : [xMid(i), yCum(pick(w))])).filter(Boolean);
    if (pts.length < 1) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = dash ? 1.8 : 2.4;
    ctx.setLineDash(dash ? [5, 3] : []);
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.setLineDash([]);
    pts.forEach(([x, y]) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill(); });
  };
  drawLine((w) => w.cumPlan, INK.primary.hex, true);
  drawLine((w) => w.cumActual, VIZ.done.hex, false);

  // The running totals are labelled sparingly: the line's shape carries the
  // story, the numbers are there to be read off at the points that matter -
  // the ends, this week, and every other node when there is room.
  const everyCum = rows.length > 10 ? 2 : 1;
  const lastActual = rows.reduce((acc, w, i) => (w.cumActual == null ? acc : i), -1);
  rows.forEach((w, i) => {
    const anchor = w.isCurrent || i === 0 || i === rows.length - 1 || i === lastActual;
    if (i % everyCum !== 0 && !anchor) return;
    haloText(ctx, String(w.cumPlan), xMid(i), yCum(w.cumPlan) - 9, INK.primary.hex);
    if (w.cumActual != null) haloText(ctx, String(w.cumActual), xMid(i), yCum(w.cumActual) + 16, VIZ.done.hex);
  });

  if (footnote) {
    ctx.fillStyle = INK.muted.hex;
    ctx.font = `400 9px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(footnote, 12, height - 8);
  }
  return toBase64(canvas);
}
