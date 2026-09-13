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

function title(ctx, text, x, y, size = 12) {
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
export function rankChart(rows, { width = 690, height = 260, heading = '' } = {}) {
  const { canvas, ctx } = surface(width, height);
  if (heading) title(ctx, heading, 12, 16);

  const list = (rows || []).slice(0, 10);
  if (!list.length) return toBase64(canvas);

  const max = Math.max(1, ...list.map((r) => r.total));
  const labelW = 250;
  const trackX = labelW + 18;
  const trackW = width - trackX - 74;
  const top = 34;
  const rowH = Math.min(21, (height - top - 12) / list.length);

  list.forEach((r, i) => {
    const y = top + i * rowH;
    const midY = y + rowH / 2;

    ctx.textAlign = 'left';
    ctx.fillStyle = INK.primary.hex;
    ctx.font = `600 10.5px ${FONT}`;
    const label = r.label.length > 42 ? `${r.label.slice(0, 41)}…` : r.label;
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
    ctx.font = `700 10.5px ${FONT}`;
    ctx.fillText(`${r.done} / ${r.total}`, width - 12, midY);
  });

  return toBase64(canvas);
}
