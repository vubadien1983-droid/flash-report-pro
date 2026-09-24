/**
 * OPS Findings & Action Tracking — the single definition of the report type.
 *
 * Everything a surface needs to agree on lives here, so the table, the phone
 * cards, the share link, the Excel and the PDF cannot disagree (BUG-014):
 * the columns, the status vocabulary and its colours, the row number, the
 * section grouping, the statistics, the filter, the import key and the rule
 * that decides which photo belongs to which column.
 *
 * TWO PHOTO COLUMNS, ONE `photos` ARRAY.
 * Column G (Photo Reference) and column O (Close-out references) both hold
 * pictures, and O also holds documents. They share the item's single `photos`
 * array because every storage path in the app — `_pushPhotos`, hydration, the
 * share publisher, the fingerprint cache, `deletePhotoBytes` — addresses a
 * photo by (item id, slot_index) and nothing else. The column is therefore
 * carried BY THE SLOT NUMBER: slots below CLOSEOUT_SLOT_BASE are column G,
 * slots at or above it are column O. A field such as `col: 'O'` would be
 * stripped by `_toFirestoreDoc`, which rewrites a photo to
 * `{id, filename, slot_index, url, photo_ref}` — the slot number survives
 * every hop, a tag would not.
 */

export const OPS_FINDINGS_TYPE = 'ops_findings';
export const OPS_FINDINGS_LABEL = 'OPS Findings & Action Tracking';
export const OPS_DEFAULT_SECTION = 'A. Findings from M&R Team';
export const OPS_DEFAULT_SUBTITLE = 'CPP/LQ/Flare Tower';

export const CLOSEOUT_SLOT_BASE = 1000;

export const isOpsFindings = (report) => report?.report_type === OPS_FINDINGS_TYPE;

/**
 * The columns, in the order of the source workbook (A..O). `key` is the field
 * on the item; `no` and the two photo columns are not text fields.
 */
export const OPS_COLUMNS = [
  { col: 'A', key: 'no',              label: 'No' },
  { col: 'B', key: 'system',          label: 'System/ Package/ Location' },
  { col: 'C', key: 'description',     label: 'Finding Description' },
  { col: 'D', key: 'action',          label: 'Corrective Action' },
  { col: 'E', key: 'reference',       label: 'Reference to PQPOC Spec / Standard' },
  { col: 'F', key: 'raised_by',       label: 'Raise By' },
  { col: 'G', key: 'photos_g',        label: 'Photo Reference' },
  { col: 'H', key: 'open_date',       label: 'Open Date', date: true },
  { col: 'I', key: 'pic',             label: 'PIC' },
  { col: 'J', key: 'status',          label: 'Status' },
  { col: 'K', key: 'closeout_date',   label: 'Close-out Date', date: true },
  { col: 'L', key: 'remark',          label: 'Remark' },
  { col: 'M', key: 'closeout_status', label: 'Close-out status' },
  { col: 'N', key: 'updated_date',    label: 'Updated Date', date: true },
  { col: 'O', key: 'photos_o',        label: 'Close-out references' },
];

/** Plain value fields of a finding (everything but id, section and photos). */
export const OPS_TEXT_FIELDS = [
  'system', 'description', 'action', 'reference', 'raised_by',
  'open_date', 'pic', 'status', 'closeout_date', 'remark',
  'closeout_status', 'updated_date',
];

export const OPS_DATE_FIELDS = ['open_date', 'closeout_date', 'updated_date'];

/** Fields the multi-device merge compares (see miniPlanMerge opts). */
export const OPS_MERGE_FIELDS = [...OPS_TEXT_FIELDS, 'section', 'report_type'];

// ─── Status ──────────────────────────────────────────────────────

export const OPS_STATUS = { OPEN: 'Open', ONGOING: 'On-going', CLOSED: 'Closed' };
export const OPS_STATUS_OPTIONS = [OPS_STATUS.OPEN, OPS_STATUS.ONGOING, OPS_STATUS.CLOSED];

/**
 * One style object per status, for every surface: Tailwind for the app,
 * ARGB for ExcelJS, RGB for jsPDF. `row*` is the light tint of the whole row,
 * the rest is the Status cell itself.
 */
export const OPS_STATUS_STYLE = {
  [OPS_STATUS.OPEN]: {
    label: 'Open',
    badge: 'bg-rose-600 text-white border-rose-700',
    row: 'bg-rose-50/70',
    tile: 'text-rose-700',
    argb: 'FFDC2626', fg: 'FFFFFFFF', rowArgb: 'FFFEF2F2',
    rgb: [220, 38, 38], rowRgb: [254, 242, 242],
  },
  [OPS_STATUS.ONGOING]: {
    label: 'On-going',
    badge: 'bg-amber-400 text-amber-950 border-amber-500',
    row: 'bg-amber-50/80',
    tile: 'text-amber-700',
    argb: 'FFFBBF24', fg: 'FF451A03', rowArgb: 'FFFFFBEB',
    rgb: [251, 191, 36], rowRgb: [255, 251, 235],
  },
  [OPS_STATUS.CLOSED]: {
    label: 'Closed',
    badge: 'bg-emerald-600 text-white border-emerald-700',
    row: 'bg-emerald-50/70',
    tile: 'text-emerald-700',
    argb: 'FF059669', fg: 'FFFFFFFF', rowArgb: 'FFECFDF5',
    rgb: [5, 150, 105], rowRgb: [236, 253, 245],
  },
};

/**
 * Fold whatever was typed or imported into the three statuses. A finding
 * with no status at all is OPEN: it was raised and nobody has closed it.
 */
export function normalizeOpsStatus(value) {
  const s = String(value ?? '').trim().toLowerCase().replace(/[\s_]+/g, ' ');
  if (!s) return OPS_STATUS.OPEN;
  if (/^(closed?|done|complete[d]?|finish(ed)?|resolved)$/.test(s)) return OPS_STATUS.CLOSED;
  if (/^(on ?-? ?going|in ?-? ?progress|progress(ing)?|wip|pending)$/.test(s)) return OPS_STATUS.ONGOING;
  if (/^open(ed)?$/.test(s)) return OPS_STATUS.OPEN;
  if (s.startsWith('close')) return OPS_STATUS.CLOSED;
  if (s.includes('going') || s.includes('progress')) return OPS_STATUS.ONGOING;
  return OPS_STATUS.OPEN;
}

// ─── Dates ───────────────────────────────────────────────────────

/** Today as YYYY-MM-DD in LOCAL time (the site's day, not UTC's). */
export function todayKeyLocal(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** A stored date as YYYY-MM-DD, or '' — accepts ISO strings with a time. */
export function opsDateKey(value) {
  const m = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 04-Jun-26 — the day-first form the source workbook is read in. */
export function formatOpsDate(value) {
  const k = opsDateKey(value);
  if (!k) return '';
  const [y, m, d] = k.split('-');
  return `${d}-${MONTHS[Number(m) - 1]}-${y.slice(2)}`;
}

// ─── Photos by column ────────────────────────────────────────────

export const slotColumn = (p, i = 0) =>
  (Number(p?.slot_index ?? i) >= CLOSEOUT_SLOT_BASE ? 'O' : 'G');

/** The entries of one column, in slot order. */
export function photosOf(item, col) {
  return (item?.photos || [])
    .map((p, i) => (p ? { p, i } : null))
    .filter((x) => x && slotColumn(x.p, x.i) === col)
    .sort((a, b) => Number(a.p.slot_index ?? a.i) - Number(b.p.slot_index ?? b.i))
    .map((x) => x.p);
}

/** Replace one column's entries, leaving the other column untouched. */
export function withColumnPhotos(item, col, list) {
  const other = (item?.photos || []).filter((p, i) => p && slotColumn(p, i) !== col);
  return [...other, ...(list || []).filter(Boolean)];
}

/**
 * The next free slot in a column. Slots are never reused inside a column, so
 * deleting a photo cannot renumber the others and force a re-upload.
 */
export function nextSlotFor(col) {
  const base = col === 'O' ? CLOSEOUT_SLOT_BASE : 0;
  return (list) => {
    let max = base - 1;
    for (const [i, p] of (list || []).entries()) {
      const s = Number(p?.slot_index ?? base + i);
      if (Number.isFinite(s) && s > max) max = s;
    }
    const next = max + 1;
    // Column G must never spill into column O's range.
    if (col === 'G' && next >= CLOSEOUT_SLOT_BASE) return CLOSEOUT_SLOT_BASE - 1;
    return next;
  };
}

export const isFileEntry = (p) => Boolean(p && (p.kind === 'file' || (!p.url && p.file_ref)));

// ─── Rows ────────────────────────────────────────────────────────

let seq = 0;
export function makeOpsId() {
  seq = (seq + 1) % 1e6;
  return `ops_${Date.now().toString(36)}_${seq.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function makeOpsFinding(section = OPS_DEFAULT_SECTION, over = {}) {
  const row = {
    id: makeOpsId(),
    section: section || OPS_DEFAULT_SECTION,
    system: '', description: '', action: '', reference: '', raised_by: '',
    open_date: '', pic: '', status: OPS_STATUS.OPEN, closeout_date: '', remark: '',
    closeout_status: '', updated_date: '',
    photos: [],
    ...over,
  };
  return row;
}

/**
 * Make every row well-formed without inventing content. Returns the SAME
 * array when nothing needed changing, so a render is not turned into a save.
 */
export function normalizeOpsItems(items) {
  if (!Array.isArray(items)) return [];
  let changed = false;
  const out = items.filter(Boolean).map((it) => {
    const fix = {};
    if (!it.id) fix.id = makeOpsId();
    if (typeof it.section !== 'string' || !it.section) fix.section = OPS_DEFAULT_SECTION;
    if (!Array.isArray(it.photos)) fix.photos = [];
    const st = normalizeOpsStatus(it.status);
    if (st !== it.status) fix.status = st;
    for (const f of OPS_TEXT_FIELDS) {
      if (it[f] === undefined || it[f] === null) fix[f] = f === 'status' ? st : '';
    }
    if (Object.keys(fix).length) { changed = true; return { ...it, ...fix }; }
    return it;
  });
  if (out.length !== items.length) changed = true;
  return changed ? out : items;
}

/** A row the user has put something into (auto-filled status does not count). */
export function opsRowHasContent(item) {
  if (!item) return false;
  const text = ['system', 'description', 'action', 'reference', 'raised_by', 'pic', 'remark', 'closeout_status'];
  if (text.some((f) => String(item[f] ?? '').trim())) return true;
  return (item.photos || []).some(Boolean);
}

/**
 * The finding number (column A). NOT stored: it is the row's position among
 * the findings of its section, 1..N, so inserting or deleting a row can
 * never leave a gap or a duplicate (BUG-014's rule, the Mini Plan's too).
 */
export function opsRowNumbers(items) {
  // Numbered WITHIN each section (A 1..40, B 1..16, …), as the source sheet is.
  const out = [];
  const count = new Map();
  (items || []).forEach((it, i) => {
    const sec = it?.section || OPS_DEFAULT_SECTION;
    const n = (count.get(sec) || 0) + 1;
    count.set(sec, n);
    out[i] = n;
  });
  return out;
}

/**
 * Consecutive rows sharing a section form one block, drawn under a section
 * header. Grouping is by consecutive run, so the order in the report is the
 * order on screen and in every export.
 */
export function groupOpsSections(items, indices = null) {
  const numbers = opsRowNumbers(items);
  const use = indices || (items || []).map((_, i) => i);
  const groups = [];
  let cur = null;
  for (const i of use) {
    const item = items[i];
    if (!item) continue;
    const section = item.section || OPS_DEFAULT_SECTION;
    if (!cur || cur.section !== section) {
      cur = { section, rows: [] };
      groups.push(cur);
    }
    cur.rows.push({ item, index: i, no: numbers[i] });
  }
  return groups;
}

export function opsSections(items) {
  const seen = [];
  for (const it of items || []) {
    const s = it?.section || OPS_DEFAULT_SECTION;
    if (!seen.includes(s)) seen.push(s);
  }
  return seen.length ? seen : [OPS_DEFAULT_SECTION];
}

// ─── Statistics ──────────────────────────────────────────────────

export function opsStats(items) {
  const s = { total: 0, open: 0, ongoing: 0, closed: 0, percentClosed: 0 };
  for (const it of items || []) {
    if (!it) continue;
    s.total += 1;
    const st = normalizeOpsStatus(it.status);
    if (st === OPS_STATUS.CLOSED) s.closed += 1;
    else if (st === OPS_STATUS.ONGOING) s.ongoing += 1;
    else s.open += 1;
  }
  s.percentClosed = s.total ? Math.round((s.closed / s.total) * 100) : 0;
  return s;
}

// ─── Editing rules ───────────────────────────────────────────────

/**
 * The patch a single edit produces. Two rules ride along with every edit:
 *  - `updated_date` (column N) becomes today whenever a row changes, unless
 *    the edit IS the updated date;
 *  - Status → Closed stamps the Close-out Date if it is empty; leaving Closed
 *    clears a close-out date, because an open finding has not been closed.
 */
export function opsEditPatch(item, field, value, today = todayKeyLocal()) {
  const patch = { [field]: value };
  if (field === 'status') {
    const next = normalizeOpsStatus(value);
    const prev = normalizeOpsStatus(item?.status);
    patch.status = next;
    if (next === OPS_STATUS.CLOSED && prev !== OPS_STATUS.CLOSED && !opsDateKey(item?.closeout_date)) {
      patch.closeout_date = today;
    }
    if (next !== OPS_STATUS.CLOSED && prev === OPS_STATUS.CLOSED) {
      patch.closeout_date = '';
    }
  }
  if (field !== 'updated_date') patch.updated_date = today;
  return patch;
}

// ─── Search and filters ──────────────────────────────────────────

export function normalizeSearch(text) {
  return String(text ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export const EMPTY_OPS_FILTER = { search: '', status: '', pic: '', raisedBy: '', system: '' };

export function opsFilterActive(f) {
  return Boolean(f && (f.search || f.status || f.pic || f.raisedBy || f.system));
}

/** Distinct values of a field, for the filter drop-downs. */
export function distinctValues(items, field) {
  const map = new Map();
  for (const it of items || []) {
    const raw = String(it?.[field] ?? '').replace(/\s+/g, ' ').trim();
    if (!raw) continue;
    const k = normalizeSearch(raw);
    if (!map.has(k)) map.set(k, raw);
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b));
}

function itemHaystack(it) {
  const parts = OPS_TEXT_FIELDS.map((f) => it?.[f] ?? '');
  for (const f of OPS_DATE_FIELDS) parts.push(formatOpsDate(it?.[f]));
  parts.push(it?.section ?? '');
  for (const p of it?.photos || []) if (p?.filename && isFileEntry(p)) parts.push(p.filename);
  return normalizeSearch(parts.join(' \u0001 '));
}

/** Indices of the rows the filter keeps, in report order. VIEW-ONLY. */
export function filterOpsIndices(items, f = EMPTY_OPS_FILTER) {
  const out = [];
  const needle = normalizeSearch(f?.search);
  const eq = (a, b) => normalizeSearch(a) === normalizeSearch(b);
  (items || []).forEach((it, i) => {
    if (!it) return;
    if (f?.status && normalizeOpsStatus(it.status) !== f.status) return;
    if (f?.pic && !eq(it.pic, f.pic)) return;
    if (f?.raisedBy && !eq(it.raised_by, f.raisedBy)) return;
    if (f?.system && !eq(it.system, f.system)) return;
    if (needle && !itemHaystack(it).includes(needle)) return;
    out.push(i);
  });
  return out;
}

/** "Status: Open · PIC: Mr KIAN · search "bolt"" — names the filter on exports. */
export function describeOpsFilter(f) {
  if (!opsFilterActive(f)) return '';
  const bits = [];
  if (f.status) bits.push(`Status: ${f.status}`);
  if (f.system) bits.push(`System: ${f.system}`);
  if (f.pic) bits.push(`PIC: ${f.pic}`);
  if (f.raisedBy) bits.push(`Raise By: ${f.raisedBy}`);
  if (f.search) bits.push(`Search: "${f.search}"`);
  return bits.join(' · ');
}

// ─── Import ──────────────────────────────────────────────────────

/**
 * The key a row is matched by on import: column B + column C, normalised the
 * same way on both sides (case, accents, runs of whitespace and line breaks).
 * "E-House  CPP HVAC\n" and "e-house cpp hvac" are the same system.
 */
export function opsImportKey(system, description) {
  return `${normalizeSearch(system)}\u0002${normalizeSearch(description)}`;
}

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

/**
 * Merge imported rows into the report.
 *
 * - A row whose B+C is NOT in the report is ADDED, under its own section
 *   (after the last row of that section, or at the end for a new section).
 * - A row whose B+C IS in the report fills only the cells that are EMPTY in
 *   the report — what someone typed in the app is never overwritten by the
 *   file. Column G photos are taken only when the row has none.
 * - Duplicate B+C inside the file are KEPT as separate findings (the user's
 *   decision): the n-th occurrence in the file matches the n-th occurrence in
 *   the report, so re-importing the same file twice changes nothing.
 *
 * Pure: returns a new array and a summary; the caller decides to apply it.
 */
export function mergeOpsImport(existing, imported, { makeId = makeOpsId } = {}) {
  const items = (existing || []).map((it) => ({ ...it, photos: [...(it.photos || [])] }));

  const queues = new Map();
  items.forEach((it, i) => {
    const k = opsImportKey(it.system, it.description);
    if (!queues.has(k)) queues.set(k, []);
    queues.get(k).push(i);
  });

  const stats = { added: 0, matched: 0, rowsFilled: 0, cellsFilled: 0, photosAdded: 0, unchanged: 0, addedRows: [], filledRows: [] };

  for (const row of imported || []) {
    const k = opsImportKey(row.system, row.description);
    const q = queues.get(k);
    const hit = q && q.length ? q.shift() : null;

    if (hit !== null && hit !== undefined) {
      stats.matched += 1;
      const cur = items[hit];
      const patch = {};
      for (const f of OPS_TEXT_FIELDS) {
        if (f === 'status') continue;   // handled below
        if (isBlank(cur[f]) && !isBlank(row[f])) patch[f] = row[f];
      }
      // Status always carries a value in the app (blank folds to Open), so
      // "empty" for it means "still the default": a file that says Closed or
      // On-going for a row the app has left at Open fills it.
      if (!isBlank(row.status)) {
        const incoming = normalizeOpsStatus(row.status);
        if (normalizeOpsStatus(cur.status) === OPS_STATUS.OPEN && incoming !== OPS_STATUS.OPEN) {
          patch.status = incoming;
        }
      }
      let photos = cur.photos;
      const gPhotos = (row.photos || []).filter((p) => slotColumn(p) === 'G');
      if (!photosOf(cur, 'G').length && gPhotos.length) {
        photos = [...photos, ...gPhotos];
        stats.photosAdded += gPhotos.length;
      }
      const oPhotos = (row.photos || []).filter((p) => slotColumn(p) === 'O');
      if (!photosOf(cur, 'O').length && oPhotos.length) {
        photos = [...photos, ...oPhotos];
        stats.photosAdded += oPhotos.length;
      }
      const cells = Object.keys(patch).length + (photos !== cur.photos ? 1 : 0);
      if (cells) {
        items[hit] = { ...cur, ...patch, photos };
        stats.rowsFilled += 1;
        stats.cellsFilled += cells;
        stats.filledRows.push({ index: hit, fields: Object.keys(patch), photos: photos !== cur.photos });
      } else {
        stats.unchanged += 1;
      }
      continue;
    }

    // New finding.
    const section = row.section || OPS_DEFAULT_SECTION;
    const fresh = {
      ...makeOpsFinding(section),
      ...Object.fromEntries(OPS_TEXT_FIELDS.map((f) => [f, isBlank(row[f]) ? '' : row[f]])),
      id: makeId(),
      section,
      photos: [...(row.photos || [])],
    };
    fresh.status = normalizeOpsStatus(fresh.status);
    let at = -1;
    for (let i = items.length - 1; i >= 0; i -= 1) {
      if ((items[i].section || OPS_DEFAULT_SECTION) === section) { at = i; break; }
    }
    if (at >= 0) items.splice(at + 1, 0, fresh);
    else items.push(fresh);
    // Every queued index at or after the insertion point has moved down one.
    if (at >= 0) {
      for (const list of queues.values()) {
        for (let j = 0; j < list.length; j += 1) if (list[j] > at) list[j] += 1;
      }
      for (const fr of stats.filledRows) if (fr.index > at) fr.index += 1;
    }
    stats.added += 1;
    stats.photosAdded += fresh.photos.length;
    stats.addedRows.push({ id: fresh.id, section, system: fresh.system, description: fresh.description });
  }

  return { items, stats };
}

// ─── Sections as tabs (v3.20.0) ──────────────────────────────────

export { sectionLetter } from './opsAuth';
import { sectionLetter as letterOf } from './opsAuth';

/** One entry per section, in report order, with its own statistics. */
export function opsSectionSummary(items) {
  const order = opsSections(items);
  return order.map((section) => {
    const rows = (items || []).filter((it) => (it?.section || OPS_DEFAULT_SECTION) === section);
    return { section, letter: letterOf(section), rows: rows.length, stats: opsStats(rows) };
  });
}

/** Indices of the rows of one section (all sections when `section` is falsy). */
export function sectionIndices(items, section) {
  const out = [];
  (items || []).forEach((it, i) => {
    if (!it) return;
    if (!section || (it.section || OPS_DEFAULT_SECTION) === section) out.push(i);
  });
  return out;
}

/** The next free section letter: A, B, C, D in use → "E". */
export function nextSectionLetter(items) {
  const used = new Set(opsSections(items).map(letterOf).filter(Boolean));
  for (const L of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!used.has(L)) return L;
  return '';
}

// ─── Closure over time (Summary chart) ───────────────────────────

const DAY = 86400000;
const keyToUtc = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const utcToKey = (t) => new Date(t).toISOString().slice(0, 10);

/** Monday of the week holding `key` (weeks start on Monday). */
export function opsWeekStart(key) {
  const t = keyToUtc(key);
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  return utcToKey(t - dow * DAY);
}

/** The date a Closed finding counts as closed on: its Close-out Date, else its Updated Date. */
export function closedOn(item) {
  if (normalizeOpsStatus(item?.status) !== OPS_STATUS.CLOSED) return '';
  return opsDateKey(item?.closeout_date) || opsDateKey(item?.updated_date);
}

/**
 * Week-by-week: findings opened, findings closed, cumulative closed and the
 * open backlog at the end of each week. Runs from the week of the first
 * finding to the current week (the last `maxWeeks` of it).
 */
export function opsClosureSeries(items, { today = todayKeyLocal(), maxWeeks = 26 } = {}) {
  const rows = (items || []).filter(Boolean);
  const opened = new Map();
  const closed = new Map();
  let first = '';
  let undatedOpen = 0;
  let closedNoDate = 0;
  for (const it of rows) {
    const o = opsDateKey(it.open_date);
    if (o) { const w = opsWeekStart(o); opened.set(w, (opened.get(w) || 0) + 1); if (!first || w < first) first = w; }
    else undatedOpen += 1;
    if (normalizeOpsStatus(it.status) === OPS_STATUS.CLOSED) {
      const c = closedOn(it);
      if (c) { const w = opsWeekStart(c); closed.set(w, (closed.get(w) || 0) + 1); if (!first || w < first) first = w; }
      else closedNoDate += 1;
    }
  }
  const nowWeek = opsWeekStart(today);
  if (!first) first = nowWeek;
  const all = [];
  let cumOpened = undatedOpen;
  let cumClosed = closedNoDate;
  for (let t = keyToUtc(first); t <= keyToUtc(nowWeek); t += 7 * DAY) {
    const w = utcToKey(t);
    const o = opened.get(w) || 0;
    const c = closed.get(w) || 0;
    cumOpened += o;
    cumClosed += c;
    all.push({ week: w, label: formatOpsDate(w).slice(0, 6), opened: o, closed: c, cumClosed, backlog: cumOpened - cumClosed, isNow: w === nowWeek });
  }
  return {
    weeks: all.slice(-maxWeeks),
    totals: { total: rows.length, closed: cumClosed, open: rows.length - cumClosed, closedNoDate, undatedOpen },
  };
}
