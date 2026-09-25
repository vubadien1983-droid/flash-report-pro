/**
 * Excel / CSV attachment → read-only HTML grid — v3.21.0
 *
 * Reuses `exceljs`, which the app already ships for its own exports (lazily
 * imported), so viewing a spreadsheet adds no new library. The grid shows:
 * values as Excel formats them (numbers, %, dates), bold/italic/colour/size,
 * cell fills (RGB, theme and indexed colours), borders, alignment and wrap,
 * merged cells, column widths and row heights, hidden rows/columns, and the
 * PICTURES placed on the sheet — inspection spreadsheets are mostly photos.
 * Charts are not drawn (exceljs cannot read them); the reader downloads for that.
 *
 * Two steps, both pure and testable in Node:
 *   worksheetToModel(ws, wb) / csvToModel(text) → a plain model
 *   modelToHtml(model) → one HTML string (rendered with innerHTML: ~50k cells
 *   as React elements would freeze a phone — BUG-021/BUG-024's lesson).
 *
 * Large sheets are cut at MAX_ROWS × MAX_COLS and say so.
 */

import { escapeHtml } from './emailParse';

export const MAX_ROWS = 1000;
export const MAX_COLS = 60;
const ROW_HEAD_PX = 42;
const COL_HEAD_PX = 20;
const DEFAULT_COL_WIDTH = 8.43;
const DEFAULT_ROW_PT = 15;

/* ───────────────────────── colours ───────────────────────── */

const THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'];
const INDEXED = [
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080',
  '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
  '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF',
  '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696',
  '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333',
];

function applyTint(hex, tint) {
  if (!tint) return hex;
  const ch = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const out = ch.map((c) => Math.round(tint > 0 ? c + (255 - c) * tint : c * (1 + tint)));
  return out.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** exceljs colour object → '#RRGGBB' or '' */
export function cssColor(color) {
  if (!color) return '';
  let hex = '';
  if (typeof color.argb === 'string' && /^[0-9A-Fa-f]{6,8}$/.test(color.argb)) hex = color.argb.slice(-6);
  else if (Number.isInteger(color.theme) && THEME[color.theme]) hex = THEME[color.theme];
  else if (Number.isInteger(color.indexed) && INDEXED[color.indexed]) hex = INDEXED[color.indexed];
  if (!hex) return '';
  return `#${applyTint(hex.toUpperCase(), color.tint || 0)}`;
}

/* ───────────────────────── values ───────────────────────── */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A date under an Excel format. exceljs builds dates in UTC, so read UTC parts. */
export function formatExcelDate(d, fmt = '') {
  const f = String(fmt || '').replace(/\[[^\]]*\]/g, '').replace(/\\/g, '').replace(/"/g, '');
  if (!/[dmyhs]/i.test(f)) {
    return `${String(d.getUTCDate()).padStart(2, '0')}-${MONTHS[d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(-2)}`;
  }
  const hasTime = /h/i.test(f);
  const tokens = f.match(/(yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM|am\/pm|.)/gi) || [];
  let sawHour = false;
  const out = tokens.map((t, i) => {
    const lower = t.toLowerCase();
    const prev = tokens.slice(0, i).reverse().find((x) => /[a-z]/i.test(x)) || '';
    const next = tokens.slice(i + 1).find((x) => /[a-z]/i.test(x)) || '';
    const isMinute = (lower === 'mm' || lower === 'm') && (sawHour && /^h/i.test(prev) || /^s/i.test(next));
    switch (lower) {
      case 'yyyy': return String(d.getUTCFullYear());
      case 'yy': return String(d.getUTCFullYear()).slice(-2);
      case 'mmmm': return MONTHS_LONG[d.getUTCMonth()];
      case 'mmm': return MONTHS[d.getUTCMonth()];
      case 'mm': return isMinute ? String(d.getUTCMinutes()).padStart(2, '0') : String(d.getUTCMonth() + 1).padStart(2, '0');
      case 'm': return isMinute ? String(d.getUTCMinutes()) : String(d.getUTCMonth() + 1);
      case 'dddd': return DAYS_LONG[d.getUTCDay()];
      case 'ddd': return DAYS[d.getUTCDay()];
      case 'dd': return String(d.getUTCDate()).padStart(2, '0');
      case 'd': return String(d.getUTCDate());
      case 'hh': sawHour = true; return String(/am\/pm/i.test(f) ? (d.getUTCHours() % 12 || 12) : d.getUTCHours()).padStart(2, '0');
      case 'h': sawHour = true; return String(/am\/pm/i.test(f) ? (d.getUTCHours() % 12 || 12) : d.getUTCHours());
      case 'ss': return String(d.getUTCSeconds()).padStart(2, '0');
      case 's': return String(d.getUTCSeconds());
      case 'am/pm': return d.getUTCHours() < 12 ? 'AM' : 'PM';
      default: return t;
    }
  }).join('');
  return hasTime || out.trim() ? out : formatExcelDate(d, '');
}

/** A number under an Excel format — the common cases: 0, 0.00, #,##0, %, General. */
export function formatExcelNumber(v, fmt = '') {
  if (!Number.isFinite(v)) return String(v);
  const section = String(fmt || '').split(';')[v < 0 && String(fmt).includes(';') ? 1 : 0] || '';
  const f = section.replace(/\[[^\]]*\]/g, '');
  if (!f || /^general$/i.test(f.trim()) || !/[0#?]/.test(f)) {
    if (Number.isInteger(v)) return String(v);
    return String(Number(v.toPrecision(11)));
  }
  const pct = f.includes('%');
  const val = pct ? v * 100 : v;
  const dec = (/\.([0#?]+)/.exec(f) || ['', ''])[1].length;
  const grouped = /#,##|0,0/.test(f);
  const neg = v < 0 && String(fmt).includes(';');
  let s = Math.abs(val).toFixed(dec);
  if (grouped) {
    const [a, b] = s.split('.');
    s = a.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (b ? `.${b}` : '');
  }
  if (val < 0 && !neg) s = `-${s}`;
  const lit = (part) => (part.match(/"([^"]*)"/g) || []).map((q) => q.slice(1, -1)).join('');
  const [before] = f.split(/[0#?]/);
  const after = f.slice(f.search(/[0#?][^0#?]*$/) + 1);
  const prefix = lit(before) + (before.replace(/"[^"]*"/g, '').match(/[$€£¥₫]/) || [''])[0];
  const suffix = (pct ? '%' : '') + lit(after) + (after.replace(/"[^"]*"/g, '').match(/[$€£¥₫]/) || [''])[0];
  return neg ? `(${prefix}${s}${suffix})` : `${prefix}${s}${suffix}`;
}

/** exceljs cell → the text Excel would show. */
export function cellDisplay(cell) {
  let v = cell?.value;
  if (v == null) return '';
  if (typeof v === 'object' && !(v instanceof Date)) {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text || '').join('');
    if ('result' in v || 'formula' in v || 'sharedFormula' in v) v = v.result;
    else if ('hyperlink' in v) return String(v.text?.richText ? v.text.richText.map((r) => r.text).join('') : v.text ?? v.hyperlink ?? '');
    else if ('error' in v) return String(v.error);
    if (v == null) return '';
    if (typeof v === 'object' && v.error) return String(v.error);
  }
  const fmt = cell.numFmt || '';
  if (v instanceof Date) return formatExcelDate(v, fmt);
  if (typeof v === 'number') return formatExcelNumber(v, fmt);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

/* ───────────────────────── styles ───────────────────────── */

const BORDER = {
  thin: '1px solid', hair: '1px solid', medium: '2px solid', thick: '3px solid',
  dotted: '1px dotted', dashed: '1px dashed', mediumDashed: '2px dashed', double: '3px double',
  dashDot: '1px dashed', dashDotDot: '1px dashed', mediumDashDot: '2px dashed',
  mediumDashDotDot: '2px dashed', slantDashDot: '2px dashed',
};

export function cellCss(cell) {
  const s = [];
  const font = cell?.font || {};
  if (font.bold) s.push('font-weight:700');
  if (font.italic) s.push('font-style:italic');
  if (font.underline) s.push('text-decoration:underline');
  if (font.strike) s.push('text-decoration:line-through');
  const size = Number(font.size);
  if (size > 0 && size < 200) s.push(`font-size:${Math.round(size * 96 / 72 * 10) / 10}px`);
  const fc = cssColor(font.color);
  if (fc) s.push(`color:${fc}`);
  const fill = cell?.fill;
  if (fill && fill.type === 'pattern' && fill.pattern && fill.pattern !== 'none') {
    const bg = cssColor(fill.fgColor) || cssColor(fill.bgColor);
    if (bg) s.push(`background:${bg}`);
  } else if (fill && fill.type === 'gradient' && fill.stops?.length) {
    const bg = cssColor(fill.stops[0].color);
    if (bg) s.push(`background:${bg}`);
  }
  const b = cell?.border || {};
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const e = b[side];
    if (e && e.style && BORDER[e.style]) s.push(`border-${side}:${BORDER[e.style]} ${cssColor(e.color) || '#000'}`);
  }
  const al = cell?.alignment || {};
  // Every value that reaches the style attribute is looked up in a fixed
  // table or computed as a number — a file must not be able to write its own
  // CSS (or break out of the attribute) into the page.
  const H_ALIGN = { left: 'left', center: 'center', right: 'right', justify: 'justify', centerContinuous: 'center', distributed: 'justify', fill: 'left' };
  if (al.horizontal && H_ALIGN[al.horizontal]) {
    s.push(`text-align:${H_ALIGN[al.horizontal]}`);
  } else if (typeof cell?.value === 'number' || cell?.value instanceof Date
    || (cell?.value && typeof cell.value === 'object' && typeof cell.value.result === 'number')) {
    s.push('text-align:right');
  }
  const v = { top: 'top', middle: 'middle', bottom: 'bottom', center: 'middle' }[al.vertical];
  if (v) s.push(`vertical-align:${v}`);
  const indent = Number(al.indent);
  if (indent > 0 && indent < 50) s.push(`padding-left:${3 + indent * 9}px`);
  return s.join(';');
}

/* ───────────────────────── model ───────────────────────── */

const num = (v, dflt, max) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : dflt; };
export const colWidthToPx = (w) => Math.round(num(w ?? DEFAULT_COL_WIDTH, DEFAULT_COL_WIDTH, 255) * 7 + 5);
export const rowPtToPx = (pt) => Math.round(num(pt ?? DEFAULT_ROW_PT, DEFAULT_ROW_PT, 409) * 96 / 72);

export function colLetter(n) {
  let s = '';
  let x = n;
  while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - 1) / 26); }
  return s;
}

function decodeAddress(a) {
  const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(String(a).toUpperCase());
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(m[2]), col };
}

function mergesOf(ws) {
  let list = [];
  try { list = ws.model?.merges || []; } catch { list = []; }
  if ((!list || !list.length) && ws._merges) list = Object.values(ws._merges).map((m) => m.range || m.model || m);
  return (list || []).map((r) => {
    if (typeof r === 'string') {
      const [a, b] = r.split(':');
      const tl = decodeAddress(a); const br = decodeAddress(b || a);
      return tl && br ? { top: tl.row, left: tl.col, bottom: br.row, right: br.col } : null;
    }
    if (r && r.top) return { top: r.top, left: r.left, bottom: r.bottom, right: r.right };
    return null;
  }).filter(Boolean);
}

/**
 * @param ws  exceljs Worksheet
 * @param wb  exceljs Workbook (for images)
 */
export function worksheetToModel(ws, wb) {
  // Pictures often sit to the right of / below the last filled cell (a photo
  // next to a table) — the grid must reach them or they float off its edge.
  let imgCols = 0;
  let imgRows = 0;
  try {
    for (const img of ws.getImages ? ws.getImages() : []) {
      const a = img.range?.br || img.range?.tl;
      if (!a) continue;
      imgCols = Math.max(imgCols, Math.floor(a.nativeCol ?? a.col ?? 0) + 1 + (img.range?.br ? 0 : 3));
      imgRows = Math.max(imgRows, Math.floor(a.nativeRow ?? a.row ?? 0) + 1 + (img.range?.br ? 0 : 8));
    }
  } catch { /* no pictures */ }
  const totalRows = Math.max(ws.rowCount || 0, imgRows);
  const totalCols = Math.max(ws.columnCount || 0, imgCols);
  const nRows = Math.min(totalRows, MAX_ROWS);
  const nCols = Math.min(Math.max(totalCols, 1), MAX_COLS);
  const defRowPt = ws.properties?.defaultRowHeight || DEFAULT_ROW_PT;
  const defColW = ws.properties?.defaultColWidth || DEFAULT_COL_WIDTH;

  const cols = [];
  for (let c = 1; c <= nCols; c++) {
    const col = ws.getColumn(c);
    cols.push({ width: colWidthToPx(col.width || defColW), hidden: !!col.hidden });
  }

  // Merges: the master cell spans, every covered cell is skipped.
  const span = new Map();
  const covered = new Set();
  for (const m of mergesOf(ws)) {
    if (m.top > nRows || m.left > nCols) continue;
    const bottom = Math.min(m.bottom, nRows);
    const right = Math.min(m.right, nCols);
    span.set(`${m.top}:${m.left}`, { rowspan: bottom - m.top + 1, colspan: right - m.left + 1 });
    for (let r = m.top; r <= bottom; r++) for (let c = m.left; c <= right; c++) if (r !== m.top || c !== m.left) covered.add(`${r}:${c}`);
  }

  const rows = [];
  for (let r = 1; r <= nRows; r++) {
    const row = ws.getRow(r);
    const cells = [];
    for (let c = 1; c <= nCols; c++) {
      if (covered.has(`${r}:${c}`)) { cells.push({ skip: true }); continue; }
      const cell = row.getCell(c);
      const sp = span.get(`${r}:${c}`);
      cells.push({
        text: cellDisplay(cell),
        css: cellCss(cell),
        wrap: !!cell.alignment?.wrapText,
        rowspan: sp?.rowspan || 1,
        colspan: sp?.colspan || 1,
      });
    }
    rows.push({ height: rowPtToPx(row.height || defRowPt), hidden: !!row.hidden, cells });
  }

  const images = [];
  try {
    const colPx = [0];
    cols.forEach((c, i) => { colPx[i + 1] = colPx[i] + (c.hidden ? 0 : c.width); });
    const rowPx = [0];
    rows.forEach((r, i) => { rowPx[i + 1] = rowPx[i] + (r.hidden ? 0 : r.height); });
    const at = (arr, idx, fallback) => (idx < arr.length ? arr[idx] : arr[arr.length - 1] + (idx - arr.length + 1) * fallback);
    const pos = (anchor) => {
      if (!anchor) return null;
      const col = anchor.nativeCol ?? Math.floor(anchor.col || 0);
      const row = anchor.nativeRow ?? Math.floor(anchor.row || 0);
      const colOff = anchor.nativeColOff != null ? anchor.nativeColOff / 9525 : ((anchor.col || 0) % 1) * colWidthToPx(defColW);
      const rowOff = anchor.nativeRowOff != null ? anchor.nativeRowOff / 9525 : ((anchor.row || 0) % 1) * rowPtToPx(defRowPt);
      return { x: at(colPx, col, colWidthToPx(defColW)) + colOff, y: at(rowPx, row, rowPtToPx(defRowPt)) + rowOff, row };
    };
    for (const img of ws.getImages ? ws.getImages() : []) {
      const media = wb?.getImage ? wb.getImage(Number(img.imageId)) : null;
      if (!media) continue;
      const tl = pos(img.range?.tl);
      if (!tl || tl.row >= nRows) continue;
      let w; let h;
      const br = pos(img.range?.br);
      if (br) { w = br.x - tl.x; h = br.y - tl.y; }
      else if (img.range?.ext) { w = img.range.ext.width; h = img.range.ext.height; }
      if (!(w > 0 && h > 0)) continue;
      const ext = { png: 'png', jpg: 'jpeg', jpeg: 'jpeg', gif: 'gif', bmp: 'bmp', webp: 'webp' }[String(media.extension || 'png').toLowerCase()];
      if (!ext) continue; // emf/wmf/svg: not drawn (and never a file-chosen string in the markup)
      let b64 = media.base64 || '';
      if (b64.includes(',')) b64 = b64.split(',')[1];
      if (b64 && !/^[A-Za-z0-9+/=]+$/.test(b64)) b64 = '';
      if (!b64 && media.buffer) {
        const u8 = media.buffer instanceof Uint8Array ? media.buffer : new Uint8Array(media.buffer);
        let s = '';
        for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
        b64 = typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
      }
      if (!b64) continue;
      if (![tl.x, tl.y, w, h].every(Number.isFinite)) continue;
      images.push({ x: Math.round(tl.x), y: Math.round(tl.y), w: Math.round(w), h: Math.round(h), src: `data:image/${ext};base64,${b64}` });
    }
  } catch { /* pictures are a bonus; the grid still shows */ }

  return {
    name: ws.name,
    hidden: ws.state && ws.state !== 'visible',
    cols,
    rows,
    images,
    truncated: totalRows > MAX_ROWS || totalCols > MAX_COLS,
    totalRows,
    totalCols,
  };
}

/** RFC-4180-ish CSV parse; delimiter sniffed from the first line (, ; or tab). */
export function parseCsv(text = '') {
  const src = String(text).replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length]);
  const delim = counts.sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i += 1; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function csvToModel(text, name = 'CSV') {
  const all = parseCsv(text);
  const totalRows = all.length;
  const totalCols = all.reduce((m, r) => Math.max(m, r.length), 0);
  const nRows = Math.min(totalRows, MAX_ROWS);
  const nCols = Math.min(Math.max(totalCols, 1), MAX_COLS);
  const widths = Array.from({ length: nCols }, (_, c) => {
    let longest = 4;
    for (let r = 0; r < Math.min(nRows, 200); r++) longest = Math.max(longest, String(all[r]?.[c] ?? '').length);
    return Math.min(360, 12 + longest * 7);
  });
  return {
    name,
    hidden: false,
    cols: widths.map((w) => ({ width: w, hidden: false })),
    rows: all.slice(0, nRows).map((r, i) => ({
      height: 20,
      hidden: false,
      cells: Array.from({ length: nCols }, (_, c) => {
        const t = r[c] ?? '';
        const num = t !== '' && !Number.isNaN(Number(t));
        return { text: t, css: (i === 0 ? 'font-weight:700;background:#F1F5F9;' : '') + (num ? 'text-align:right' : ''), wrap: false, rowspan: 1, colspan: 1 };
      }),
    })),
    images: [],
    truncated: totalRows > MAX_ROWS || totalCols > MAX_COLS,
    totalRows,
    totalCols,
  };
}

/** The model as one HTML string: a grid with Excel-style headers and pictures on top. */
export function modelToHtml(model) {
  const widthSum = ROW_HEAD_PX + model.cols.reduce((s, c) => s + (c.hidden ? 0 : c.width), 0);
  const parts = [];
  parts.push(`<div class="frx-wrap" style="position:relative;width:${widthSum}px">`);
  parts.push(`<table class="frx" style="width:${widthSum}px"><colgroup><col style="width:${ROW_HEAD_PX}px">`);
  model.cols.forEach((c) => parts.push(c.hidden ? '<col style="width:0;visibility:collapse">' : `<col style="width:${c.width}px">`));
  parts.push('</colgroup><thead><tr><th class="frx-corner"></th>');
  model.cols.forEach((c, i) => parts.push(`<th class="frx-ch"${c.hidden ? ' style="visibility:collapse"' : ''}>${colLetter(i + 1)}</th>`));
  parts.push('</tr></thead><tbody>');

  model.rows.forEach((row, ri) => {
    parts.push(`<tr style="height:${row.height}px${row.hidden ? ';display:none' : ''}"><th class="frx-rh">${ri + 1}</th>`);
    row.cells.forEach((cell, ci) => {
      if (cell.skip) return;
      const attrs = [];
      if (cell.rowspan > 1) attrs.push(`rowspan="${cell.rowspan}"`);
      if (cell.colspan > 1) attrs.push(`colspan="${cell.colspan}"`);
      // Excel lets unwrapped text run into EMPTY neighbours; anything else clips.
      const next = row.cells[ci + cell.colspan];
      const spill = !cell.wrap && cell.text && (!next || (!next.skip && !next.text));
      const cls = cell.wrap ? 'w' : spill ? 's' : 'c';
      const h = Math.max(1, row.height * (cell.rowspan || 1) - 2);
      parts.push(`<td ${attrs.join(' ')} style="${cell.css}"><div class="${cls}" style="max-height:${h}px">${escapeHtml(cell.text)}</div></td>`);
    });
    parts.push('</tr>');
  });
  parts.push('</tbody></table>');
  model.images.forEach((im) => {
    parts.push(`<img class="frx-img" alt="" src="${im.src}" style="left:${ROW_HEAD_PX + im.x}px;top:${COL_HEAD_PX + im.y}px;width:${im.w}px;height:${im.h}px">`);
  });
  parts.push('</div>');
  return parts.join('');
}

export const SHEET_CSS = `
.frx{border-collapse:collapse;table-layout:fixed;font:13px/1.25 Calibri,Carlito,'Segoe UI',Arial,sans-serif;color:#000;background:#fff}
.frx td{border:1px solid #E2E8F0;padding:1px 3px;vertical-align:bottom;white-space:nowrap;overflow:visible}
.frx td>div.c{overflow:hidden;text-overflow:clip}
.frx td>div.s{overflow:visible;position:relative;z-index:1}
.frx td>div.w{white-space:pre-wrap;overflow:hidden;word-break:break-word}
.frx th{background:#F1F5F9;color:#64748B;font-weight:500;font-size:11px;border:1px solid #CBD5E1;text-align:center;padding:0}
.frx thead th{position:sticky;top:0;z-index:3;height:${COL_HEAD_PX}px}
.frx .frx-rh{position:sticky;left:0;z-index:2}
.frx .frx-corner{left:0;z-index:4}
.frx-img{position:absolute;z-index:2;pointer-events:none}
`;

/* ─────────────── tolerant workbook loading ─────────────── */

/** Relative path from folder `fromDir` ('xl/worksheets/') to part `to` ('xl/drawings/d1.xml'). */
export function relativePath(fromDir, to) {
  const a = fromDir.split('/').filter(Boolean);
  const b = to.split('/').filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i += 1;
  return [...Array(a.length - i).fill('..'), ...b.slice(i)].join('/');
}

/** Rewrite one .rels file's ABSOLUTE internal targets ("/xl/…") as relative ones. */
export function relativizeRelsXml(relsPath, xml) {
  // xl/worksheets/_rels/sheet1.xml.rels describes xl/worksheets/sheet1.xml
  const dir = relsPath.replace(/_rels\/[^/]+$/, '');
  return xml.replace(/(<Relationship\b[^>]*?\bTarget=")\/([^"]+)"/g, (m, head, target) => {
    if (/TargetMode="External"/.test(m)) return m;
    return `${head}${relativePath(dir, target)}"`;
  });
}

/**
 * A drawing part written with the spreadsheetDrawing namespace as the DEFAULT
 * namespace (`<wsDr xmlns="…">`, as openpyxl writes it) instead of Excel's
 * `xdr:` prefix. exceljs matches element names literally, so it sees no
 * anchors at all. Every unprefixed element gets the `xdr:` prefix back.
 */
export function prefixDrawingXml(xml) {
  const NS = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
  if (!new RegExp(`<wsDr\\b[^>]*\\bxmlns="${NS}"`).test(xml)) return xml;
  return xml
    .replace(/<(\/?)([A-Za-z][\w.-]*)(?=[\s/>])/g, (m, slash, name) => `<${slash}xdr:${name}`)
    .replace(`xmlns="${NS}"`, `xmlns:xdr="${NS}"`);
}

/**
 * Load an .xlsx with exceljs, surviving files exceljs cannot read as-is.
 *
 * Workbooks written by openpyxl / pandas / many report generators differ from
 * Excel's own in two ways exceljs does not tolerate: ABSOLUTE relationship
 * targets ("/xl/drawings/drawing1.xml") and drawings with no `xdr:` prefix.
 * Either kills the load inside exceljs with "Cannot read properties of
 * undefined (reading 'anchors')" as soon as a sheet carries a picture
 * (BUG-053). So:
 *   1. load as-is (every file Excel wrote);
 *   2. on failure, repair the package in memory — targets made relative and
 *      drawings prefixed, exactly as Excel writes them — and load again;
 *   3. if that still fails, load WITHOUT the pictures, so the reader at least
 *      gets the cells (`picturesDropped` is set, and the viewer says so).
 */
export async function loadWorkbookTolerant(ExcelJS, buffer, JSZip) {
  const first = new ExcelJS.Workbook();
  try {
    await first.xlsx.load(buffer);
    return first;
  } catch (err) {
    if (!JSZip) throw err;
    const zip = await JSZip.loadAsync(buffer);
    const names = Object.keys(zip.files);
    for (const p of names.filter((n) => n.endsWith('.rels'))) {
      const xml = await zip.file(p).async('string');
      const fixed = relativizeRelsXml(p, xml);
      if (fixed !== xml) zip.file(p, fixed);
    }
    for (const p of names.filter((n) => /^xl\/drawings\/[^/]+\.xml$/.test(n))) {
      const xml = await zip.file(p).async('string');
      const fixed = prefixDrawingXml(xml);
      if (fixed !== xml) zip.file(p, fixed);
    }
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await zip.generateAsync({ type: 'arraybuffer' }));
      return wb;
    } catch {
      // Last resort: the cells without the pictures.
      for (const p of names.filter((n) => /^xl\/worksheets\/_rels\/.+\.rels$/.test(n))) {
        const xml = await zip.file(p).async('string');
        zip.file(p, xml.replace(/<Relationship\b[^>]*relationships\/drawing"[^>]*\/>/g, ''));
      }
      for (const p of names.filter((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n))) {
        const xml = await zip.file(p).async('string');
        zip.file(p, xml.replace(/<(?:\w+:)?drawing\b[^>]*\/>/g, ''));
      }
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await zip.generateAsync({ type: 'arraybuffer' }));
      wb.picturesDropped = true;
      return wb;
    }
  }
}
