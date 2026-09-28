/**
 * Preservation Findings and Tracking — the single definition of the report type.
 *
 * Built on the OPS Findings model (services/opsFindings.js) and deliberately
 * REUSING its rules instead of copying them (BUG-014: a value seen in two
 * places has one implementation): the status vocabulary and colours
 * (Open / On-going / Closed), the edit patch (→ Closed stamps the Closed Date,
 * leaving Closed clears it, any edit stamps Updated Date), the dates, the
 * accent-folding search and the closed-over-time series all come from there.
 * That works because this report stores those values under the SAME field
 * names: `status`, `closeout_date`, `open_date`, `updated_date`, `action_by`.
 *
 * COLUMNS (user's workbook "PreservationControl", sheet DATA):
 *   A FacilityCode · B DisciplineCode · C Subsystem · D SubsystemDescription ·
 *   E TagNo · F EquipmentName · G PreservationInterval · H ChecksheetType
 *     → filled from the hidden lookup database (services/preservationDb.js)
 *   I Issue Description · J Action By · K Corrective / Alternative Action ·
 *   L Close-out Status · M Closed Date · N Remark · O References (pictures +
 *   documents)  → typed by the user
 *   P Open Date · Q Updated Date → kept by the app (ageing / overdue / chart).
 *
 * THE LOOKUP DATABASE lives in two places:
 *   - the SEED, generated from the workbook (preservationDb.js, dynamic import);
 *   - LEARNED entries: a finding saved with a (TagNo, ChecksheetType) the
 *     database does not know adds a row `{ kind: 'db', ... }` to the report's
 *     own `items`. Items are the one field that travels through every hop
 *     (IndexedDB, Firestore, the share copy, the merge), so no new header field
 *     and no new storage path were needed. Each learned row has a
 *     DETERMINISTIC id derived from its key (BUG-037), so two devices learning
 *     the same tag converge on one row. Every view filters them out with
 *     `isDbRow` — they are never a finding.
 */

import {
  OPS_STATUS, normalizeOpsStatus, opsEditPatch, opsDateKey, formatOpsDate, todayKeyLocal,
  normalizeSearch, opsStats,
} from './opsFindings';

export {
  OPS_STATUS as PF_STATUS, OPS_STATUS_STYLE as PF_STATUS_STYLE, OPS_STATUS_OPTIONS as PF_STATUS_OPTIONS,
  normalizeOpsStatus as normalizePfStatus, formatOpsDate as formatPfDate, opsDateKey as pfDateKey,
  todayKeyLocal, normalizeSearch, opsStats as pfStats, opsClosureSeries as pfClosureSeries,
} from './opsFindings';

export const PRESERVATION_TYPE = 'preservation_findings';
export const PRESERVATION_LABEL = 'Preservation Findings and Tracking';
export const PRESERVATION_DEFAULT_SUBTITLE = 'Block B - EPC#1 · Preservation';

export const isPreservation = (report) => report?.report_type === PRESERVATION_TYPE;

/** Columns A–H: the fields the lookup database fills. Order = the workbook's. */
export const PF_DB_FIELDS = [
  'facility', 'discipline', 'subsystem', 'subsystem_desc',
  'tag_no', 'equipment_name', 'interval', 'checksheet_type',
];

export const PF_COLUMNS = [
  { col: 'A', key: 'facility',        label: 'FacilityCode',                   db: true },
  { col: 'B', key: 'discipline',      label: 'DisciplineCode',                 db: true },
  { col: 'C', key: 'subsystem',       label: 'Subsystem',                      db: true },
  { col: 'D', key: 'subsystem_desc',  label: 'SubsystemDescription',           db: true },
  { col: 'E', key: 'tag_no',          label: 'TagNo',                          db: true },
  { col: 'F', key: 'equipment_name',  label: 'EquipmentName',                  db: true },
  { col: 'G', key: 'interval',        label: 'PreservationInterval',           db: true },
  { col: 'H', key: 'checksheet_type', label: 'ChecksheetType',                 db: true },
  { col: 'I', key: 'issue',           label: 'Issue Description' },
  { col: 'J', key: 'action_by',       label: 'Action By' },
  { col: 'K', key: 'action',          label: 'Corrective / Alternative Action' },
  { col: 'L', key: 'status',          label: 'Close-out Status' },
  { col: 'M', key: 'closeout_date',   label: 'Closed Date', date: true },
  { col: 'N', key: 'remark',          label: 'Remark' },
  { col: 'O', key: 'photos',          label: 'References' },
  { col: 'P', key: 'open_date',       label: 'Open Date', date: true },
  { col: 'Q', key: 'updated_date',    label: 'Updated Date', date: true },
];

export const pfLabel = (key) => PF_COLUMNS.find((c) => c.key === key)?.label || key;
export const pfColLetter = (key) => PF_COLUMNS.find((c) => c.key === key)?.col || '';

/** Free text the user types (I, J, K, N) — what makes a finding "have content". */
export const PF_USER_TEXT_FIELDS = ['issue', 'action_by', 'action', 'remark'];
export const PF_DATE_FIELDS = ['closeout_date', 'open_date', 'updated_date'];
/** Every plain value field of a finding (not id / kind / photos). */
export const PF_TEXT_FIELDS = [...PF_DB_FIELDS, ...PF_USER_TEXT_FIELDS, 'status', ...PF_DATE_FIELDS];
/** Fields the multi-device merge compares (miniPlanMerge opts.fields). */
export const PF_MERGE_FIELDS = [...PF_TEXT_FIELDS, 'kind'];

// ─── Rows ────────────────────────────────────────────────────────

export const isDbRow = (it) => it?.kind === 'db';
export const isFindingRow = (it) => Boolean(it) && !isDbRow(it);

let seq = 0;
export function makePfId() {
  seq = (seq + 1) % 1e6;
  return `pf_${Date.now().toString(36)}_${seq.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

const s = (v) => (v === undefined || v === null ? '' : String(v));

export function makePfFinding(over = {}) {
  const today = todayKeyLocal();
  return {
    id: makePfId(),
    ...Object.fromEntries(PF_DB_FIELDS.map((f) => [f, ''])),
    issue: '', action_by: '', action: '', remark: '',
    status: OPS_STATUS.OPEN, closeout_date: '', open_date: today, updated_date: today,
    photos: [],
    ...over,
  };
}

/**
 * Make every row well-formed without inventing content. Returns the SAME
 * array when nothing needed changing, so a render is not turned into a save.
 */
export function normalizePfItems(items) {
  if (!Array.isArray(items)) return [];
  let changed = false;
  const out = items.filter(Boolean).map((it) => {
    const fix = {};
    if (!it.id) fix.id = isDbRow(it) ? dbRowId(it.tag_no, it.checksheet_type) : makePfId();
    if (!Array.isArray(it.photos)) fix.photos = [];
    const fields = isDbRow(it) ? PF_DB_FIELDS : PF_TEXT_FIELDS;
    for (const f of fields) {
      if (it[f] === undefined || it[f] === null) fix[f] = '';
      else if (typeof it[f] !== 'string') fix[f] = String(it[f]);
    }
    if (!isDbRow(it)) {
      const st = normalizeOpsStatus(it.status);
      if (st !== it.status) fix.status = st;
    }
    if (Object.keys(fix).length) { changed = true; return { ...it, ...fix }; }
    return it;
  });
  if (out.length !== items.length) changed = true;
  return changed ? out : items;
}

/** The finding number: 1..N over the findings, in report order. NOT stored. */
export function pfRowNumbers(items) {
  const out = [];
  let n = 0;
  (items || []).forEach((it, i) => { if (isFindingRow(it)) { n += 1; out[i] = n; } });
  return out;
}

/** Indices of the findings (database rows skipped), in report order. */
export function pfFindingIndices(items) {
  const out = [];
  (items || []).forEach((it, i) => { if (isFindingRow(it)) out.push(i); });
  return out;
}

export const pfFindings = (items) => (items || []).filter(isFindingRow);

export function pfRowHasContent(item) {
  if (!isFindingRow(item)) return false;
  if ([...PF_DB_FIELDS, ...PF_USER_TEXT_FIELDS].some((f) => s(item[f]).trim())) return true;
  return (item.photos || []).some(Boolean);
}

/** One edit's patch — the OPS rules (status ↔ Closed Date, Updated Date stamp). */
export function pfEditPatch(item, field, value, today = todayKeyLocal()) {
  return opsEditPatch(item, field, value, today);
}

// ─── Ageing ──────────────────────────────────────────────────────

const DAY = 86400000;
const keyUtc = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };

/** Days a finding has been open (Open / On-going), or null (closed / no date). */
export function pfOpenDays(item, today = todayKeyLocal()) {
  if (normalizeOpsStatus(item?.status) === OPS_STATUS.CLOSED) return null;
  const o = opsDateKey(item?.open_date);
  if (!o) return null;
  return Math.max(0, Math.round((keyUtc(today) - keyUtc(o)) / DAY));
}

export const PF_OVERDUE_OPTIONS = [7, 14, 30, 60];
export const PF_DEFAULT_OVERDUE_DAYS = 14;

export function pfIsOverdue(item, days = PF_DEFAULT_OVERDUE_DAYS, today = todayKeyLocal()) {
  const d = pfOpenDays(item, today);
  return d !== null && d > days;
}

// ─── Breakdowns (Summary tab) ────────────────────────────────────

export const PF_NY_CLARIFY = 'NY Clarify';
export const PF_BLANK = '\u0000blank';

/**
 * Findings per value of `field`, with their status split.
 * Values are grouped the way the filter compares them (case, accents and
 * spacing ignored). Empty values are one group — "NY Clarify" for Action By,
 * "(blank)" otherwise — always listed last.
 */
export function pfBreakdown(items, field, { overdueDays = PF_DEFAULT_OVERDUE_DAYS, today = todayKeyLocal() } = {}) {
  const map = new Map();
  let blank = null;
  for (const it of pfFindings(items)) {
    const raw = s(it[field]).replace(/\s+/g, ' ').trim();
    let e;
    if (!raw) {
      if (!blank) blank = { name: field === 'action_by' ? PF_NY_CLARIFY : '(blank)', value: PF_BLANK, blank: true, total: 0, open: 0, ongoing: 0, closed: 0, overdue: 0 };
      e = blank;
    } else {
      const k = normalizeSearch(raw);
      e = map.get(k);
      if (!e) { e = { name: raw, value: raw, blank: false, total: 0, open: 0, ongoing: 0, closed: 0, overdue: 0 }; map.set(k, e); }
    }
    e.total += 1;
    const st = normalizeOpsStatus(it.status);
    if (st === OPS_STATUS.CLOSED) e.closed += 1;
    else if (st === OPS_STATUS.ONGOING) e.ongoing += 1;
    else e.open += 1;
    if (pfIsOverdue(it, overdueDays, today)) e.overdue += 1;
  }
  const out = [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  if (blank) out.push(blank);
  for (const e of out) e.percentClosed = e.total ? Math.round((e.closed / e.total) * 100) : 0;
  return out;
}

// ─── Search and filters ──────────────────────────────────────────

export const EMPTY_PF_FILTER = {
  search: '', status: '', facility: '', discipline: '', subsystem: '', checksheet: '', actionBy: '', overdue: false,
};
const FILTER_FIELD = {
  facility: 'facility', discipline: 'discipline', subsystem: 'subsystem', checksheet: 'checksheet_type', actionBy: 'action_by',
};

export function pfFilterActive(f) {
  return Boolean(f && (f.search || f.status || f.facility || f.discipline || f.subsystem || f.checksheet || f.actionBy || f.overdue));
}

export function pfDistinct(items, field) {
  const map = new Map();
  for (const it of pfFindings(items)) {
    const raw = s(it[field]).replace(/\s+/g, ' ').trim();
    if (!raw) continue;
    const k = normalizeSearch(raw);
    if (!map.has(k)) map.set(k, raw);
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function haystack(it) {
  const parts = PF_TEXT_FIELDS.map((f) => it?.[f] ?? '');
  for (const f of PF_DATE_FIELDS) parts.push(formatOpsDate(it?.[f]));
  for (const p of it?.photos || []) if (p?.filename) parts.push(p.filename);
  return normalizeSearch(parts.join(' \u0001 '));
}

/** Indices of the findings the filter keeps, in report order. VIEW-ONLY. */
export function filterPfIndices(items, f = EMPTY_PF_FILTER, { overdueDays = PF_DEFAULT_OVERDUE_DAYS, today = todayKeyLocal() } = {}) {
  const out = [];
  const needle = normalizeSearch(f?.search);
  const eq = (a, b) => (b === PF_BLANK ? !s(a).trim() : normalizeSearch(a) === normalizeSearch(b));
  (items || []).forEach((it, i) => {
    if (!isFindingRow(it)) return;
    if (f?.status && normalizeOpsStatus(it.status) !== f.status) return;
    for (const [k, field] of Object.entries(FILTER_FIELD)) {
      if (f?.[k] && !eq(it[field], f[k])) return;
    }
    if (f?.overdue && !pfIsOverdue(it, overdueDays, today)) return;
    if (needle && !haystack(it).includes(needle)) return;
    out.push(i);
  });
  return out;
}

export function describePfFilter(f, overdueDays = PF_DEFAULT_OVERDUE_DAYS) {
  if (!pfFilterActive(f)) return '';
  const v = (x, blankName = '(blank)') => (x === PF_BLANK ? blankName : x);
  const bits = [];
  if (f.status) bits.push(`Status: ${f.status}`);
  if (f.overdue) bits.push(`Open > ${overdueDays} days`);
  if (f.facility) bits.push(`Facility: ${v(f.facility)}`);
  if (f.discipline) bits.push(`Discipline: ${v(f.discipline)}`);
  if (f.subsystem) bits.push(`Subsystem: ${v(f.subsystem)}`);
  if (f.checksheet) bits.push(`Checksheet: ${v(f.checksheet)}`);
  if (f.actionBy) bits.push(`Action By: ${v(f.actionBy, PF_NY_CLARIFY)}`);
  if (f.search) bits.push(`Search: "${f.search}"`);
  return bits.join(' · ');
}

// ─── The lookup database (columns A–H) ───────────────────────────

/** Case-, accent- and space-insensitive form of a database value. */
export const dbNorm = (v) => normalizeSearch(v).replace(/\s*-\s*/g, '-');

/** The unique key of a database row: TagNo + ChecksheetType (user decision). */
export function dbKey(tag, checksheet) {
  const t = dbNorm(tag).replace(/\s+/g, '');
  const c = dbNorm(checksheet).replace(/\s+/g, '');
  return t ? `${t}|${c}` : '';
}

/** Deterministic id of a learned row — the same key on two devices is one row. */
export function dbRowId(tag, checksheet) {
  const k = dbKey(tag, checksheet) || 'blank';
  return `pfdb_${k.replace(/[^a-z0-9|_-]/g, '_').replace(/\|/g, '__')}`;
}

/** Seed rows (arrays) → objects. */
export function seedToRows(seed) {
  return (seed || []).map((r) => Object.fromEntries(PF_DB_FIELDS.map((f, i) => [f, s(r[i])])));
}

/**
 * The database the form looks things up in: the seed plus every learned row
 * of the report, one row per key (the seed wins a clash). Each row carries
 * `source: 'seed' | 'learned'`.
 */
export function buildLookup(seedRows, items) {
  const rows = [];
  const keys = new Map();
  const add = (r, source) => {
    const k = dbKey(r.tag_no, r.checksheet_type);
    if (!k || keys.has(k)) return;
    const row = { ...Object.fromEntries(PF_DB_FIELDS.map((f) => [f, s(r[f]).replace(/\s+/g, ' ').trim()])), source };
    keys.set(k, row);
    rows.push(row);
  };
  for (const r of seedRows || []) add(r, 'seed');
  for (const it of items || []) if (isDbRow(it)) add(it, 'learned');
  // Values each field is known to take, normalised → canonical spelling.
  const known = Object.fromEntries(PF_DB_FIELDS.map((f) => [f, new Map()]));
  for (const r of rows) for (const f of PF_DB_FIELDS) {
    const v = r[f];
    if (v) { const n = dbNorm(v); if (!known[f].has(n)) known[f].set(n, v); }
  }
  return { rows, keys, known };
}

/** The canonical spelling of a typed value, when the database knows it. */
export function canonical(lookup, field, value) {
  const v = s(value).replace(/\s+/g, ' ').trim();
  if (!v) return '';
  return lookup.known[field]?.get(dbNorm(v)) || v;
}

/**
 * The rows consistent with what is filled in. A field constrains the set only
 * when its value is one the database KNOWS for that field — a value typed by
 * hand (a new tag, a new description) must not empty the suggestions of every
 * other field. `except` leaves one field out, so its own suggestions show the
 * alternatives the other fields allow.
 */
export function matchCandidates(lookup, values, except = null) {
  let rows = lookup.rows;
  for (const f of PF_DB_FIELDS) {
    if (f === except) continue;
    const v = s(values?.[f]).trim();
    if (!v) continue;
    const n = dbNorm(v);
    if (!lookup.known[f].has(n)) continue;
    rows = rows.filter((r) => dbNorm(r[f]) === n);
  }
  return rows;
}

/**
 * Suggestions for one field: the distinct values the OTHER fields allow,
 * narrowed by what is being typed (substring, accents ignored). Each carries
 * how many database rows it stands for.
 */
export function suggestionsFor(lookup, values, field, typed = '', limit = 60) {
  const needle = dbNorm(typed);
  const res = suggestionsFrom(lookup, matchCandidates(lookup, values, field), field, typed, limit, false);
  // What is being typed is not among the values the other fields allow (no
  // match at all, or a KNOWN value of other equipment — e.g. a second tag
  // after "Save & add another"): search the whole database instead, flagged
  // `widened` — picking such a value replaces the other A–H fields.
  const exactKnown = needle && lookup.known[field].has(needle);
  const inList = res.list.some((x) => dbNorm(x.value) === needle);
  if (needle && (!res.total || (exactKnown && !inList))) {
    return { ...suggestionsFrom(lookup, lookup.rows, field, typed, limit, true), widened: true };
  }
  return { ...res, widened: false };
}

function suggestionsFrom(lookup, rows, field, typed, limit, substringOnly) {
  const needle = dbNorm(typed);
  const exact = !substringOnly && needle && lookup.known[field].has(needle);
  const map = new Map();
  for (const r of rows) {
    const v = r[field];
    if (!v) continue;
    const n = dbNorm(v);
    if (needle && !exact && !n.includes(needle)) continue;
    const e = map.get(n);
    if (e) e.count += 1; else map.set(n, { value: v, count: 1, row: r });
  }
  const list = [...map.values()];
  list.sort((a, b) => {
    // The value typed exactly comes first, then the alternatives.
    if (exact) {
      const ae = dbNorm(a.value) === needle ? 0 : 1;
      const be = dbNorm(b.value) === needle ? 0 : 1;
      if (ae !== be) return ae - be;
    }
    if (needle && !exact) {
      const as = dbNorm(a.value).startsWith(needle) ? 0 : 1;
      const bs = dbNorm(b.value).startsWith(needle) ? 0 : 1;
      if (as !== bs) return as - bs;
    }
    return a.value.localeCompare(b.value, undefined, { numeric: true });
  });
  return { list: list.slice(0, limit), total: list.length };
}

/**
 * Fill every EMPTY field that the rows consistent with the filled ones agree
 * on. With a known TagNo that is every field (TagNo + ChecksheetType is the
 * key; the two RSD tags leave ChecksheetType — and Discipline — to be picked).
 * Never overwrites a filled field.
 */
export function autoFill(lookup, values) {
  const next = { ...values };
  for (const f of PF_DB_FIELDS) if (next[f]) next[f] = canonical(lookup, f, next[f]);
  const rows = matchCandidates(lookup, next);
  if (!rows.length) return { values: next, candidates: 0 };
  for (const f of PF_DB_FIELDS) {
    if (s(next[f]).trim()) continue;
    const vals = new Set(rows.map((r) => r[f]));
    if (vals.size === 1) { const [only] = [...vals]; if (only) next[f] = only; }
  }
  return { values: next, candidates: matchCandidates(lookup, next).length };
}

/** Is this (TagNo, ChecksheetType) new to the database? */
export function isNewToDb(lookup, values) {
  const k = dbKey(values?.tag_no, values?.checksheet_type);
  if (!k || lookup.keys.has(k)) return false;
  // A KNOWN tag with its ChecksheetType left empty is not a new entry — it is
  // an unfinished pick (the RSD tags have two checksheets). Learning it would
  // put a "tag | nothing" row into the database.
  if (!dbNorm(values?.checksheet_type) && lookup.known.tag_no.has(dbNorm(values?.tag_no))) return false;
  return true;
}

/** The learned row to add for a finding the database does not know, or null. */
export function learnedRowFor(lookup, values) {
  if (!isNewToDb(lookup, values)) return null;
  return {
    id: dbRowId(values.tag_no, values.checksheet_type),
    kind: 'db',
    ...Object.fromEntries(PF_DB_FIELDS.map((f) => [f, s(values[f]).replace(/\s+/g, ' ').trim()])),
    photos: [],
  };
}

/**
 * Items with `row` learned: appended once — a learned row already present
 * (same deterministic id) is left as it is.
 */
export function withLearned(items, row) {
  if (!row) return items;
  if ((items || []).some((it) => it?.id === row.id)) return items;
  return [...(items || []), row];
}

/** The learned rows of a report (what the "Database — added" sheet lists). */
export const pfLearnedRows = (items) => (items || []).filter(isDbRow);

// ─── Summary figures ─────────────────────────────────────────────

export function pfSummary(items, { overdueDays = PF_DEFAULT_OVERDUE_DAYS, today = todayKeyLocal() } = {}) {
  const list = pfFindings(items);
  const stats = opsStats(list);
  let overdue = 0;
  let ageSum = 0;
  let ageN = 0;
  for (const it of list) {
    const d = pfOpenDays(it, today);
    if (d !== null) { ageSum += d; ageN += 1; }
    if (pfIsOverdue(it, overdueDays, today)) overdue += 1;
  }
  return { ...stats, overdue, avgOpenDays: ageN ? Math.round(ageSum / ageN) : 0 };
}
