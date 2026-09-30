/**
 * OPS Findings — weekly Minutes of Meeting (v3.32.0).
 *
 * A MoM is a SNAPSHOT of the findings discussed in one weekly meeting, kept
 * as its own document (shared_reports/{shareId}/moms/{momId}), never inside
 * the report's rows. Edits are made in the MoM first; "Sync to the tabs"
 * then writes them into the live report in one go.
 *
 * Rules agreed with the user (30-Sep-2026):
 *  1. A MoM holds every finding that is NOT Closed, plus the findings
 *     CLOSED during the MoM's week (Mon–Sun, ISO week).
 *  2. Snapshot at creation; "Refresh from the app" adds findings that became
 *     eligible and pulls the app's value into every cell NOT edited in the MoM.
 *  3. "Updated Corrective Action" (empty at creation) REPLACES the app's
 *     Corrective Action on Sync. The MoM keeps both texts, so the history is
 *     in the MoM of each week.
 *  4. Every finding changed by a Sync gets Updated Date = the day of the Sync
 *     (unless Updated Date itself was edited in the MoM).
 *  5. Status → Closed on Sync stamps the Close-out Date (opsEditPatch rule).
 *  6. A MoM is never locked: it can be edited and synced again; it shows
 *     when it was last synced. One MoM per ISO week.
 *
 * Everything here is PURE (no Firestore, no DOM) so it is unit-tested.
 */

import {
  OPS_STATUS, OPS_DEFAULT_SECTION, normalizeOpsStatus, opsEditPatch, opsDateKey,
  todayKeyLocal, closedOn, groupOpsSections, formatOpsDate, opsStats,
} from './opsFindings';

/** The finding columns a MoM shows and may edit, in MoM order. */
export const MOM_FIELDS = [
  'system', 'subsystem_no', 'description', 'remark', 'action', 'status', 'closeout_status', 'updated_date',
];

/** Column layout of the MoM table (screen, Excel and PDF use this list). */
export const MOM_COLUMNS = [
  { key: 'no', label: 'No.' },
  { key: 'system', label: 'System/ Package/ Location' },
  { key: 'subsystem_no', label: 'Subsystem No.' },
  { key: 'description', label: 'Finding Description' },
  { key: 'remark', label: 'Remark' },
  { key: 'action', label: 'Corrective Action' },
  { key: 'updated_action', label: 'Updated Corrective Action' },
  { key: 'status', label: 'Status' },
  { key: 'closeout_status', label: 'Close-out status' },
  { key: 'updated_date', label: 'Updated Date', date: true },
  { key: 'photos_g', label: 'Photo Reference' },
  { key: 'photos_o', label: 'Close-out references' },
];

export const MOM_DEFAULT_VENUE = 'PTSC MC Yard';
export const MOM_DEFAULT_TITLE = 'Weekly OPS Findings Meeting';
export const MOM_DEFAULT_PROJECT = 'Block B - EPC#1';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 86400000;
const keyToUtc = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const utcToKey = (t) => new Date(t).toISOString().slice(0, 10);
const str = (v) => String(v ?? '');
const same = (a, b) => str(a).trim() === str(b).trim();

/** ISO-8601 week of a yyyy-mm-dd key: { year, week, monday, sunday }. */
export function isoWeek(key) {
  const t = keyToUtc(key);
  const dow = (new Date(t).getUTCDay() + 6) % 7;          // Mon = 0
  const monday = t - dow * DAY;
  const thursday = monday + 3 * DAY;
  const year = new Date(thursday).getUTCFullYear();
  const jan4 = Date.UTC(year, 0, 4);
  const week1Mon = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY;
  const week = 1 + Math.round((monday - week1Mon) / (7 * DAY));
  return { year, week, monday: utcToKey(monday), sunday: utcToKey(monday + 6 * DAY) };
}

export const momIdFor = (key) => {
  const w = isoWeek(key);
  return `${w.year}-W${String(w.week).padStart(2, '0')}`;
};

/** "30-Sep-2026" */
export function longDate(key) {
  const k = opsDateKey(key);
  if (!k) return '';
  const [y, m, d] = k.split('-');
  return `${d}-${MONTHS[Number(m) - 1]}-${y}`;
}

/** "MoM W40 - 30-Sep-2026" (the meeting date, or the creation date). */
export function momName(mom) {
  const date = mom?.meeting?.date || mom?.created_date || '';
  const w = date ? isoWeek(date).week : mom?.week;
  return `MoM W${String(w || '').padStart(2, '0')} - ${longDate(date)}`;
}

/** Does this finding belong in the MoM of the week [monday, sunday]? */
export function momEligible(item, monday, sunday) {
  if (!item || item.kind) return false;
  if (normalizeOpsStatus(item.status) !== OPS_STATUS.CLOSED) return true;
  const c = closedOn(item);
  return Boolean(c) && c >= monday && c <= sunday;
}

function fieldsOf(item) {
  const out = {};
  for (const f of MOM_FIELDS) out[f] = f === 'status' ? normalizeOpsStatus(item?.[f]) : str(item?.[f]);
  return out;
}

function rowFrom(item, no) {
  const v = fieldsOf(item);
  return {
    id: item.id,
    section: item.section || OPS_DEFAULT_SECTION,
    no,
    ...v,
    updated_action: '',
    orig: { ...v },        // the app's values when last taken from the app
    edits: {},             // field -> true when edited IN the MoM and not yet synced
    synced_action: '',     // the Updated Corrective Action already written to the app
    gone: false,           // the finding no longer exists in the app
  };
}

/** Rows of the MoM, in report order (sections as in the report). */
function eligibleRows(items, monday, sunday) {
  const groups = groupOpsSections(items || []);
  const rows = [];
  for (const g of groups) {
    for (const { item, no } of g.rows) {
      if (momEligible(item, monday, sunday)) rows.push({ item, no });
    }
  }
  return rows;
}

/**
 * A new MoM for the week of `dateKey` (default today).
 */
export function createMom(items, { dateKey = todayKeyLocal(), now = new Date().toISOString(), meeting = {} } = {}) {
  const w = isoWeek(dateKey);
  const rows = eligibleRows(items, w.monday, w.sunday).map(({ item, no }) => rowFrom(item, no));
  const mom = {
    id: momIdFor(dateKey),
    year: w.year,
    week: w.week,
    week_start: w.monday,
    week_end: w.sunday,
    created_date: dateKey,
    created_at: now,
    updated_at: now,
    synced_at: '',
    sync_count: 0,
    meeting: {
      project: MOM_DEFAULT_PROJECT,
      title: MOM_DEFAULT_TITLE,
      date: dateKey,
      time: '',
      venue: MOM_DEFAULT_VENUE,
      next_meeting: '',
      ...meeting,
    },
    rows,
  };
  mom.name = momName(mom);
  return mom;
}

/**
 * Refresh a MoM from the app: numbers / sections follow the app, every cell
 * NOT edited in the MoM takes the app's value, findings that became eligible
 * are added (in report order), findings deleted in the app are flagged.
 * @returns {{ mom, added, updatedCells, gone }}
 */
export function refreshMom(mom, items) {
  const byId = new Map((mom.rows || []).map((r) => [r.id, r]));
  const numbers = new Map();
  for (const g of groupOpsSections(items || [])) for (const { item, no } of g.rows) numbers.set(item.id, { item, no });
  const eligible = eligibleRows(items, mom.week_start, mom.week_end);

  let added = 0; let updatedCells = 0; let gone = 0;
  const out = [];
  const used = new Set();
  // Report order: every eligible finding, plus rows the MoM already had
  // (a finding closed earlier in the meeting stays in its MoM).
  const order = [];
  const eligibleIds = new Set(eligible.map((x) => x.item.id));
  for (const g of groupOpsSections(items || [])) {
    for (const { item } of g.rows) {
      if (eligibleIds.has(item.id) || byId.has(item.id)) order.push(item.id);
    }
  }
  for (const id of order) {
    const { item, no } = numbers.get(id);
    const old = byId.get(id);
    used.add(id);
    if (!old) { out.push(rowFrom(item, no)); added += 1; continue; }
    const v = fieldsOf(item);
    const row = { ...old, no, section: item.section || OPS_DEFAULT_SECTION, gone: false, orig: { ...old.orig }, edits: { ...(old.edits || {}) } };
    for (const f of MOM_FIELDS) {
      if (row.edits[f]) continue;                        // the meeting's value stays
      if (f === 'action' && row.synced_action) continue;  // keep the pre-meeting text on record
      if (!same(row[f], v[f])) { row[f] = v[f]; updatedCells += 1; }
      row.orig[f] = v[f];
    }
    out.push(row);
  }
  for (const r of mom.rows || []) {
    if (used.has(r.id)) continue;
    if (!r.gone) gone += 1;
    out.push({ ...r, gone: true });
  }
  return { mom: { ...mom, rows: out }, added, updatedCells, gone };
}

/** Edit one cell of the MoM. Editing a cell back to the app's value clears the mark. */
export function editMomCell(mom, rowId, field, value, { now = new Date().toISOString() } = {}) {
  const rows = (mom.rows || []).map((r) => {
    if (r.id !== rowId) return r;
    if (field === 'updated_action') return { ...r, updated_action: str(value) };
    const v = field === 'status' ? normalizeOpsStatus(value) : str(value);
    const edits = { ...(r.edits || {}) };
    if (same(v, r.orig?.[field])) delete edits[field]; else edits[field] = true;
    return { ...r, [field]: v, edits };
  });
  return { ...mom, rows, updated_at: now };
}

/** Change a header field (title, date, time, venue, project, next meeting). */
export function editMomMeeting(mom, field, value, { now = new Date().toISOString() } = {}) {
  const meeting = { ...(mom.meeting || {}), [field]: str(value) };
  const next = { ...mom, meeting, updated_at: now };
  next.name = momName(next);
  return next;
}

/** An Updated Corrective Action waiting to be written to the app. */
export const pendingAction = (row) => {
  const t = str(row?.updated_action).trim();
  return Boolean(t) && t !== str(row?.synced_action).trim();
};

/** How many cells are waiting for a Sync (for the button badge). */
export function momPendingCount(mom) {
  let n = 0;
  for (const r of mom?.rows || []) {
    if (r.gone) continue;
    n += Object.keys(r.edits || {}).length + (pendingAction(r) ? 1 : 0);
  }
  return n;
}

/**
 * What a Sync would do, row by row.
 * A change is a CONFLICT when the app's value moved since the MoM took it
 * (someone edited the tab meanwhile): the user decides per change.
 *
 * @returns {{ changes: Array<{key,rowId,index,section,no,field,label,from,to,conflict,source}>, missing:number }}
 */
export function planMomSync(mom, items) {
  const index = new Map((items || []).map((it, i) => [it.id, i]));
  const changes = [];
  let missing = 0;
  const label = Object.fromEntries(MOM_COLUMNS.map((c) => [c.key, c.label]));
  for (const r of mom?.rows || []) {
    const i = index.get(r.id);
    if (i === undefined) { if (Object.keys(r.edits || {}).length || pendingAction(r)) missing += 1; continue; }
    const item = items[i];
    for (const f of MOM_FIELDS) {
      if (!r.edits?.[f]) continue;
      if (f === 'action' && pendingAction(r)) continue;   // the Updated Corrective Action wins
      const app = f === 'status' ? normalizeOpsStatus(item[f]) : str(item[f]);
      if (same(app, r[f])) continue;
      changes.push({
        key: `${r.id}|${f}`, rowId: r.id, index: i, section: r.section, no: r.no, field: f, label: label[f],
        from: app, to: r[f], conflict: !same(app, r.orig?.[f]), source: 'cell',
      });
    }
    if (pendingAction(r)) {
      const to = str(r.updated_action).trim();
      if (!same(item.action, to)) {
        changes.push({
          key: `${r.id}|action`, rowId: r.id, index: i, section: r.section, no: r.no, field: 'action', label: 'Corrective Action',
          from: str(item.action), to, conflict: !same(item.action, r.orig?.action), source: 'updated_action',
        });
      }
    }
  }
  return { changes, missing };
}

/**
 * Apply a Sync. `skip` holds the keys of the changes the user chose NOT to
 * write (conflicts resolved in favour of the app).
 * @returns {{ items, mom, applied, findings }}
 */
export function applyMomSync(mom, items, plan, { skip = new Set(), today = todayKeyLocal(), now = new Date().toISOString() } = {}) {
  const todo = plan.changes.filter((c) => !skip.has(c.key));
  const byIndex = new Map();
  for (const c of todo) {
    if (!byIndex.has(c.index)) byIndex.set(c.index, []);
    byIndex.get(c.index).push(c);
  }
  const nextItems = [...items];
  for (const [i, list] of byIndex) {
    let it = { ...nextItems[i] };
    let manualDate = '';
    for (const c of list) {
      if (c.field === 'updated_date') { manualDate = opsDateKey(c.to) || c.to; continue; }
      it = { ...it, ...opsEditPatch(it, c.field, c.to, today) };
    }
    it.updated_date = manualDate || today;
    nextItems[i] = it;
  }

  const appliedKeys = new Set(todo.map((c) => c.key));
  const touched = new Set(todo.map((c) => c.rowId));
  const rows = (mom.rows || []).map((r) => {
    if (!touched.has(r.id)) return r;
    const i = items.findIndex((it) => it.id === r.id);
    const item = nextItems[i];
    const v = fieldsOf(item);
    const edits = { ...(r.edits || {}) };
    const row = { ...r, orig: { ...r.orig } };
    for (const f of MOM_FIELDS) {
      if (appliedKeys.has(`${r.id}|${f}`) && edits[f]) delete edits[f];
      if (!edits[f]) row.orig[f] = v[f];
    }
    // The meeting's record: the Updated Date the app now carries.
    row.updated_date = v.updated_date;
    row.orig.updated_date = v.updated_date;
    delete edits.updated_date;
    // Status may have stamped a close-out date; the MoM shows the status only.
    if (appliedKeys.has(`${r.id}|action`) && pendingAction(r)) row.synced_action = str(r.updated_action).trim();
    // An edited Corrective Action that was superseded by the Updated one is done too.
    if (row.synced_action && edits.action) delete edits.action;
    row.edits = edits;
    return row;
  });

  return {
    items: nextItems,
    mom: { ...mom, rows, synced_at: now, sync_count: (mom.sync_count || 0) + 1, updated_at: now },
    applied: todo.length,
    findings: byIndex.size,
  };
}

/** Status counts of the MoM rows (the header tiles, the exports). */
export function momStats(mom) {
  return opsStats((mom?.rows || []).filter((r) => !r.gone));
}

/** Rows grouped by section, in MoM order: [{ section, rows }]. */
export function momGroups(mom) {
  const out = [];
  let cur = null;
  for (const r of mom?.rows || []) {
    if (!cur || cur.section !== r.section) { cur = { section: r.section, rows: [] }; out.push(cur); }
    cur.rows.push(r);
  }
  return out;
}

export const momDateLabel = (mom) => formatOpsDate(mom?.meeting?.date || mom?.created_date);

/** Newest week first. */
export function sortMoms(list) {
  return [...(list || [])].sort((a, b) => String(b.id).localeCompare(String(a.id)));
}
