/**
 * Read an "EPCI Findings & Action Tracking" workbook into OPS Findings rows.
 *
 * Dependency-free on purpose: an .xlsx is a ZIP of XML files, the browser
 * already has a DEFLATE decoder (DecompressionStream) and an XML parser
 * (DOMParser), and ExcelJS — which the app loads for EXPORTS — cannot see the
 * pictures this workbook actually carries:
 *
 *  1. FLOATING pictures (drawing anchors) — 37 in the source file. They sit
 *     ON TOP of the grid, so they belong to whichever row they cover most.
 *     Several are nudged into the neighbouring row or start in column F; the
 *     overlap rule assigns them where a reader would.
 *  2. "PLACE IN CELL" pictures (Excel's rich-value images) — the cells that
 *     show `#VALUE!` in older readers (G12, G13, G14, G29 …). They are reached
 *     through xl/metadata.xml → richData/rdrichvalue.xml → richValueRel.xml
 *     → its .rels → xl/media/*. ExcelJS ignores this chain entirely.
 *
 * Every picture goes through compressForStorage() on the way in — the one
 * ingest rule that keeps the app from freezing (BUG-013).
 *
 * Merged cells: a vertical merge (B28:B33 …) is SPLIT — every row of the
 * block receives the block's value, as the user asked. Without that the empty
 * B of rows 2..n would both break the B+C import key and lose the system name.
 */

import { compressForStorage, yieldToBrowser, withTimeout } from './imageCompression';
import { parseDateInput } from './dateInput';
import {
  OPS_DEFAULT_SECTION, CLOSEOUT_SLOT_BASE, OPS_DATE_FIELDS,
  normalizeOpsStatus, todayKeyLocal,
} from './opsFindings';

// ─── ZIP ─────────────────────────────────────────────────────────

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot read .xlsx files (no DecompressionStream). Please use a current Chrome, Edge or Safari.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Map of entry path → { read(): Promise<Uint8Array> }. */
export function readZip(buffer) {
  const u8 = new Uint8Array(buffer);
  const dv = new DataView(buffer);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i -= 1) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This file is not an .xlsx workbook (no ZIP directory found).');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const entries = new Map();
  for (let n = 0; n < count; n += 1) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    entries.set(name, {
      async read() {
        const ln = dv.getUint16(local + 26, true);
        const le = dv.getUint16(local + 28, true);
        const start = local + 30 + ln + le;
        const data = u8.subarray(start, start + csize);
        if (method === 0) return data;
        if (method === 8) return inflateRaw(data);
        throw new Error(`Unsupported compression in ${name}`);
      },
    });
  }
  return entries;
}

// ─── XML helpers ─────────────────────────────────────────────────

const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

async function readText(zip, path) {
  const e = zip.get(path);
  if (!e) return null;
  return new TextDecoder().decode(await e.read());
}

async function readXml(zip, path) {
  const text = await readText(zip, path);
  if (text == null) return null;
  return new DOMParser().parseFromString(text, 'application/xml');
}

const all = (node, local) => (node ? Array.from(node.getElementsByTagNameNS('*', local)) : []);
const first = (node, local) => all(node, local)[0] || null;
const kids = (node, local) => (node ? Array.from(node.children).filter((c) => c.localName === local) : []);

/** Resolve "../media/x.png" against the folder of `fromPath`. */
function resolvePath(fromPath, target) {
  if (!target) return '';
  if (target.startsWith('/')) return target.slice(1);
  const parts = fromPath.split('/');
  parts.pop();
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

function relsPathFor(path) {
  const parts = path.split('/');
  const file = parts.pop();
  return [...parts, '_rels', `${file}.rels`].join('/');
}

async function readRels(zip, path) {
  const doc = await readXml(zip, relsPathFor(path));
  const map = new Map();
  for (const r of all(doc, 'Relationship')) {
    map.set(r.getAttribute('Id'), resolvePath(path, r.getAttribute('Target')));
  }
  return map;
}

/** "AB12" → { col: 27 (0-based), row: 12 (1-based) } */
export function parseRef(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(String(ref || '').toUpperCase());
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: Number(m[2]) };
}

// ─── Values ──────────────────────────────────────────────────────

/** Excel serial → YYYY-MM-DD, computed in UTC so no timezone can shift it (BUG-022). */
export function serialToKey(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n) || n <= 0) return '';
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
  return d.toISOString().slice(0, 10);
}

function toDateKey(v, today) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return serialToKey(v);
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 20000) return serialToKey(Number(s));
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return parseDateInput(s, today) || '';
}

const cleanText = (v) => String(v ?? '')
  .replace(/\r\n?/g, '\n')
  .replace(/[ \t ]+/g, ' ')
  .split('\n').map((l) => l.trim()).join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Which field a header cell names. Order matters: the specific tests first. */
function fieldForHeader(text) {
  const t = norm(text);
  if (!t) return null;
  if (t === 'no' || t === 'no.' || t === 'item') return 'no';
  if (t.startsWith('close-out ref') || t.startsWith('closeout ref') || t.startsWith('close out ref')) return 'photos_o';
  if (t.startsWith('close-out status') || t.startsWith('closeout status') || t.startsWith('close out status')) return 'closeout_status';
  if (t.startsWith('close-out date') || t.startsWith('closeout date') || t.startsWith('close out date')) return 'closeout_date';
  if (t.startsWith('updated date')) return 'updated_date';
  if (t.startsWith('open date') || t === 'open') return 'open_date';
  if (t.includes('system') || t.includes('package') || t.includes('location')) return 'system';
  if (t.includes('finding')) return 'description';
  if (t.includes('corrective') || t === 'action') return 'action';
  if (t.includes('reference to') || t.includes('spec') || t.includes('standard')) return 'reference';
  if (t.startsWith('raise')) return 'raised_by';
  if (t.includes('photo')) return 'photos_g';
  if (t === 'pic' || t.startsWith('pic ')) return 'pic';
  if (t === 'status') return 'status';
  if (t.startsWith('remark')) return 'remark';
  return null;
}

// ─── Main ────────────────────────────────────────────────────────

/**
 * @param {File|Blob|ArrayBuffer} file
 * @param {{ onProgress?: (msg: string, done?: number, total?: number) => void }} opts
 * @returns {Promise<{ meta, rows, warnings: string[], imageCount: number, sheetName: string }>}
 */
export async function parseOpsWorkbook(file, { onProgress, today = todayKeyLocal() } = {}) {
  const buffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const zip = readZip(buffer);
  const warnings = [];
  onProgress?.('Reading the workbook…');

  // Workbook → first sheet (or the one named like the findings master).
  const wbPath = 'xl/workbook.xml';
  const wb = await readXml(zip, wbPath);
  if (!wb) throw new Error('This file is not an Excel workbook (xl/workbook.xml missing).');
  const wbRels = await readRels(zip, wbPath);
  const sheets = all(wb, 'sheet').map((s) => ({
    name: s.getAttribute('name') || '',
    path: wbRels.get(s.getAttributeNS(REL_NS, 'id') || s.getAttribute('r:id')),
  })).filter((s) => s.path);
  if (!sheets.length) throw new Error('The workbook has no sheets.');
  const sheet = sheets.find((s) => /finding/i.test(s.name)) || sheets[0];

  // Shared strings — including rich-text runs, excluding phonetic hints.
  const sstDoc = await readXml(zip, 'xl/sharedStrings.xml');
  const sst = all(sstDoc, 'si').map((si) => all(si, 't')
    .filter((t) => {
      for (let n = t.parentNode; n && n !== si; n = n.parentNode) if (n.localName === 'rPh') return false;
      return true;
    })
    .map((t) => t.textContent).join(''));

  const ws = await readXml(zip, sheet.path);
  if (!ws) throw new Error(`Sheet "${sheet.name}" could not be read.`);

  // ── Cells ─────────────────────────────────────────────────────
  const cells = new Map();     // "r:c" → value
  const vmCells = [];          // { row, col, vm }
  const rowHeights = new Map();
  const fmt = first(ws, 'sheetFormatPr');
  const defaultRowPt = Number(fmt?.getAttribute('defaultRowHeight')) || 15;
  let maxRow = 0;

  for (const r of all(ws, 'row')) {
    const rn = Number(r.getAttribute('r'));
    if (r.getAttribute('ht')) rowHeights.set(rn, Number(r.getAttribute('ht')));
    maxRow = Math.max(maxRow, rn);
    for (const c of kids(r, 'c')) {
      const ref = parseRef(c.getAttribute('r'));
      if (!ref) continue;
      const t = c.getAttribute('t');
      const vEl = kids(c, 'v')[0];
      let v = vEl ? vEl.textContent : null;
      if (t === 's') v = sst[Number(v)] ?? '';
      else if (t === 'inlineStr') v = all(c, 't').map((x) => x.textContent).join('');
      else if (t === 'e') v = '';                     // #VALUE! etc. — an in-cell picture shows as this
      else if (t === 'b') v = v === '1' ? 'TRUE' : 'FALSE';
      else if (t === 'str') v = v ?? '';
      else if (v !== null && v !== '') v = Number(v);
      if (v !== null && v !== '') cells.set(`${ref.row}:${ref.col}`, v);
      const vm = c.getAttribute('vm');
      if (vm) vmCells.push({ row: ref.row, col: ref.col, vm: Number(vm) });
    }
  }
  const get = (row, col) => cells.get(`${row}:${col}`);

  // ── Split vertical merges: every row of the block gets its value ─
  const merges = all(ws, 'mergeCell').map((m) => {
    const [a, b] = String(m.getAttribute('ref') || '').split(':');
    const s = parseRef(a); const e = parseRef(b || a);
    return s && e ? { r1: s.row, c1: s.col, r2: e.row, c2: e.col } : null;
  }).filter(Boolean);

  // ── Header row and column map ─────────────────────────────────
  let headerRow = 0;
  const colOf = {};
  for (let r = 1; r <= Math.min(maxRow, 40) && !headerRow; r += 1) {
    const map = {};
    for (let c = 0; c < 40; c += 1) {
      const f = fieldForHeader(get(r, c));
      if (f && map[f] === undefined) map[f] = c;
    }
    if (map.no !== undefined && map.description !== undefined) {
      headerRow = r;
      Object.assign(colOf, map);
    }
  }
  if (!headerRow) {
    throw new Error('Could not find the header row (a "No" column and a "Finding Description" column). Is this the Findings & Action Tracking workbook?');
  }

  for (const m of merges) {
    if (m.r2 <= m.r1 || m.r1 <= headerRow) continue;           // single-row or header merges
    for (let c = m.c1; c <= m.c2; c += 1) {
      if (c === colOf.no || c === colOf.photos_g || c === colOf.photos_o) continue;
      const v = get(m.r1, c);
      if (v === undefined) continue;
      for (let r = m.r1 + 1; r <= m.r2; r += 1) {
        if (get(r, c) === undefined) cells.set(`${r}:${c}`, v);
      }
    }
  }

  // ── Meta above the header ─────────────────────────────────────
  const meta = { title: '', subtitle: '', updatedBy: '', updatedDate: '' };
  const titles = [];
  for (let r = 1; r < headerRow; r += 1) {
    const rowVals = [];
    for (let c = 0; c < 20; c += 1) {
      const v = get(r, c);
      if (v !== undefined && String(v).trim()) rowVals.push({ c, v });
    }
    if (!rowVals.length) continue;
    const label = norm(rowVals[0].v);
    if (label.startsWith('updated by')) { meta.updatedBy = cleanText(rowVals[1]?.v ?? ''); continue; }
    if (label.startsWith('updated date')) { meta.updatedDate = toDateKey(rowVals[1]?.v ?? '', today); continue; }
    titles.push(cleanText(rowVals[0].v));
  }
  meta.title = titles[0] || '';
  meta.subtitle = titles[1] || '';

  // ── Rows ──────────────────────────────────────────────────────
  const textField = (r, f) => (colOf[f] === undefined ? '' : cleanText(get(r, colOf[f])));
  const records = [];            // { excelRow, row }
  const byExcelRow = new Map();
  let section = OPS_DEFAULT_SECTION;
  let sawSection = false;

  for (let r = headerRow + 1; r <= maxRow; r += 1) {
    const noVal = get(r, colOf.no);
    const system = textField(r, 'system');
    const description = textField(r, 'description');
    const noText = cleanText(noVal);

    // A section header: text in column A that is not a number, nothing in C.
    if (noText && !/^\d+(\.\d+)?$/.test(noText) && !description) {
      section = noText;
      sawSection = true;
      continue;
    }
    if (!system && !description && !textField(r, 'action')) continue;   // empty row

    const row = { section, photos: [], _excelRow: r };
    for (const f of ['system', 'description', 'action', 'reference', 'raised_by', 'pic', 'remark', 'closeout_status']) {
      row[f] = textField(r, f);
    }
    row.system = system;
    row.description = description;
    for (const f of OPS_DATE_FIELDS) {
      row[f] = colOf[f] === undefined ? '' : toDateKey(get(r, colOf[f]), today);
    }
    const rawStatus = colOf.status === undefined ? '' : cleanText(get(r, colOf.status));
    row.status = normalizeOpsStatus(rawStatus);
    // A close-out reference written as TEXT is kept in the remark rather than lost.
    const refText = colOf.photos_o === undefined ? '' : cleanText(get(r, colOf.photos_o));
    if (refText) row.remark = row.remark ? `${row.remark}\nClose-out ref: ${refText}` : `Close-out ref: ${refText}`;
    records.push({ excelRow: r, row });
    byExcelRow.set(r, row);
  }
  if (!sawSection) warnings.push('No section row found — all findings go under "A. Findings from M&R Team".');

  // ── Pictures ──────────────────────────────────────────────────
  const pending = [];   // { excelRow, col: 'G'|'O', top, left, media }
  const colForPicture = (startCol) =>
    (colOf.photos_o !== undefined && startCol >= colOf.photos_o ? 'O' : 'G');

  // Row geometry in points, so an anchor can be measured against real rows.
  const rowPt = (r) => rowHeights.get(r) ?? defaultRowPt;          // r is 1-based
  const topOf = (() => {
    const cache = [0];
    return (r0) => {                                                   // 0-based row → top in pt
      for (let i = cache.length; i <= r0; i += 1) cache[i] = cache[i - 1] + rowPt(i);
      return cache[r0];
    };
  })();
  const EMU_PER_PT = 12700;

  const nearestDataRow = (top, bottom) => {
    let best = null; let bestOverlap = 0;
    for (const { excelRow } of records) {
      const rt = topOf(excelRow - 1); const rb = rt + rowPt(excelRow);
      const ov = Math.min(bottom, rb) - Math.max(top, rt);
      if (ov > bestOverlap) { bestOverlap = ov; best = excelRow; }
    }
    if (best) return best;
    // Nothing overlaps: the first data row below the picture's top edge.
    const below = records.find(({ excelRow }) => topOf(excelRow - 1) >= top);
    return below ? below.excelRow : null;
  };

  // 1) Floating pictures on the drawing layer.
  const sheetRels = await readRels(zip, sheet.path);
  for (const dr of all(ws, 'drawing')) {
    const rid = dr.getAttributeNS(REL_NS, 'id') || dr.getAttribute('r:id');
    const drawingPath = sheetRels.get(rid);
    if (!drawingPath) continue;
    const drawing = await readXml(zip, drawingPath);
    const dRels = await readRels(zip, drawingPath);
    const anchors = [...all(drawing, 'twoCellAnchor'), ...all(drawing, 'oneCellAnchor')];
    for (const a of anchors) {
      const blip = first(a, 'blip');
      const embed = blip && (blip.getAttributeNS(REL_NS, 'embed') || blip.getAttribute('r:embed'));
      const media = embed && dRels.get(embed);
      if (!media) continue;
      const from = first(a, 'from');
      const to = first(a, 'to');
      const num = (el, tag) => Number(first(el, tag)?.textContent || 0);
      const fromRow = num(from, 'row'); const fromCol = num(from, 'col');
      const top = topOf(fromRow) + num(from, 'rowOff') / EMU_PER_PT;
      let bottom;
      if (to) bottom = topOf(num(to, 'row')) + num(to, 'rowOff') / EMU_PER_PT;
      else bottom = top + Number(first(a, 'ext')?.getAttribute('cy') || 0) / EMU_PER_PT;
      if (!(bottom > top)) bottom = top + 1;
      const target = nearestDataRow(top, bottom);
      if (!target) { warnings.push(`A picture near row ${fromRow + 1} is not next to any finding and was skipped.`); continue; }
      pending.push({ excelRow: target, col: colForPicture(fromCol), top, left: fromCol, media });
    }
  }

  // 2) "Place in Cell" pictures (rich values).
  if (vmCells.length) {
    const md = await readXml(zip, 'xl/metadata.xml');
    const rvDoc = await readXml(zip, 'xl/richData/rdrichvalue.xml');
    const rvsDoc = await readXml(zip, 'xl/richData/rdrichvaluestructure.xml');
    const relList = await readXml(zip, 'xl/richData/richValueRel.xml');
    const relMap = await readRels(zip, 'xl/richData/richValueRel.xml');

    const futureBks = kids(first(md, 'futureMetadata'), 'bk')
      .map((bk) => Number(first(bk, 'rvb')?.getAttribute('i')));
    const valueBks = kids(first(md, 'valueMetadata'), 'bk')
      .map((bk) => Number(first(bk, 'rc')?.getAttribute('v')));
    const structures = all(rvsDoc, 's').map((s) => kids(s, 'k').map((k) => k.getAttribute('n')));
    const richValues = all(rvDoc, 'rv').map((rv) => ({
      s: Number(rv.getAttribute('s')),
      v: kids(rv, 'v').map((x) => x.textContent),
    }));
    const rels = all(relList, 'rel').map((r) => relMap.get(r.getAttributeNS(REL_NS, 'id') || r.getAttribute('r:id')));

    for (const { row, col, vm } of vmCells) {
      const fb = valueBks[vm - 1];                       // vm is 1-based
      const rvIndex = futureBks[fb];
      const rv = richValues[rvIndex];
      if (!rv) continue;
      const keys = structures[rv.s] || [];
      const k = keys.indexOf('_rvRel:LocalImageIdentifier');
      const relIdx = Number(rv.v[k >= 0 ? k : 0]);
      const media = rels[relIdx];
      if (!media) continue;
      if (!byExcelRow.has(row)) { warnings.push(`An in-cell picture at row ${row} is not on a finding row and was skipped.`); continue; }
      pending.push({ excelRow: row, col: colForPicture(col), top: topOf(row - 1), left: col, media });
    }
  }

  // Decode + compress, one at a time with a yield, reporting progress.
  pending.sort((a, b) => (a.excelRow - b.excelRow) || (a.top - b.top) || (a.left - b.left));
  const counters = new Map();
  let done = 0;
  for (const pic of pending) {
    done += 1;
    onProgress?.(`Processing picture ${done} of ${pending.length}…`, done, pending.length);
    const entry = zip.get(pic.media);
    if (!entry) { warnings.push(`Picture ${pic.media} is missing from the file.`); continue; }
    const ext = (pic.media.split('.').pop() || '').toLowerCase();
    if (!['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext)) {
      warnings.push(`A .${ext} picture on row ${pic.excelRow} cannot be read by a browser and was skipped.`);
      continue;
    }
    try {
      const bytes = await entry.read();
      const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      const url = await withTimeout(compressForStorage(new Blob([bytes], { type: mime })), 30000, 'Compressing picture');
      if (!url) throw new Error('empty result');
      const row = byExcelRow.get(pic.excelRow);
      const key = `${pic.excelRow}:${pic.col}`;
      const n = counters.get(key) || 0;
      counters.set(key, n + 1);
      row.photos.push({
        id: `imp_${pic.excelRow}_${pic.col}_${n}_${Math.random().toString(36).slice(2, 6)}`,
        filename: `${pic.col}${pic.excelRow}_${n + 1}.jpg`,
        url,
        slot_index: (pic.col === 'O' ? CLOSEOUT_SLOT_BASE : 0) + n,
      });
    } catch (e) {
      warnings.push(`Picture on row ${pic.excelRow} could not be processed (${e.message}).`);
    }
    await yieldToBrowser();
  }

  const rows = records.map(({ row }) => row);
  return {
    meta,
    rows,
    warnings,
    imageCount: rows.reduce((n, r) => n + r.photos.length, 0),
    sheetName: sheet.name,
  };
}
