import { applyChecksheetUpdate } from './checksheetUpdate.js';
/**
 * CPP Mechanical Mini Plan — the ONE definition of this report type.
 *
 * A Mini Plan is a different document from a Flash Report: it is a planning
 * sheet (Item / Equipment / Schedule / Activities / Status / Note / Photo),
 * not an inspection log, and its rows carry a colour that means something.
 *
 * Everything about that meaning lives HERE — the status vocabulary, the
 * row-colour rule, the grouping of rows under one Equipment, and the item
 * numbering. The editor, the phone cards, the live share link, the Excel
 * file, the PDF and the standalone HTML all import from this file.
 *
 * That is not tidiness, it is ERROR_LOG BUG-014: a value the user can see in
 * two places must have exactly one implementation. A row that reads GREEN on
 * the laptop and YELLOW in the exported PDF is the same class of defect as a
 * row numbered "2" in the file and "-" on screen.
 *
 * NEVER re-derive a colour, a status list or an item number inline.
 */

export const MINI_PLAN_TYPE = 'cpp_mech_mini_plan';
export const MINI_PLAN_LABEL = 'CPP Mechanical Mini Plan';

/** The Status column is a closed vocabulary. '' means "not started". */
export const STATUS_BLANK = '';
export const STATUS_ONGOING = 'On-going';
export const STATUS_DONE = 'Done';
export const STATUS_OPTIONS = [STATUS_BLANK, STATUS_ONGOING, STATUS_DONE];

export function isMiniPlan(report) {
  return report?.report_type === MINI_PLAN_TYPE;
}

/**
 * Accepts whatever is in the data ("done", "ON-GOING", "Ongoing", a stray
 * space) and returns one of the three canonical values. Imported spreadsheets
 * and hand edits are not consistent; the colour rule must be.
 */
export function normalizeStatus(value) {
  const v = String(value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (v === 'done' || v === 'completed' || v === 'complete') return STATUS_DONE;
  if (v === 'on-going' || v === 'ongoing' || v === 'in-progress' || v === 'wip') return STATUS_ONGOING;
  return STATUS_BLANK;
}

/** Today as YYYY-MM-DD in the DEVICE's local timezone, never UTC. */
export function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Normalise any stored schedule value to a comparable YYYY-MM-DD, or ''. */
export function scheduleKey(value) {
  if (!value) return '';
  if (value instanceof Date && !isNaN(value)) return todayKey(value);
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = new Date(s);
  return isNaN(parsed) ? '' : todayKey(parsed);
}

// --- Row state: the colour rule, stated once ----------------------
//
//   Status = Done                                   -> GREEN   (done)
//   Schedule = today      AND Status = On-going     -> BLUE    (today)
//   Schedule in the past  AND Status = On-going     -> AMBER   (overdue)
//   Schedule in the past  AND Status = blank        -> RED     (missed)
//   NO SCHEDULE AT ALL                              -> no ROW fill; the
//                                                      SCHEDULE CELL alone is
//                                                      tinted (unplanned)
//   a future date                                   -> no fill (none)
//
// Done wins over every date: a finished activity is never late, and one that
// was finished without ever being scheduled is Done, not unplanned.
//
// UNPLANNED COLOURS ONE CELL, NOT THE ROW. Every other colour here describes
// the ROW's situation - this one describes a single EMPTY BOX, so tinting the
// whole row made readers ask what was wrong with the activity when the answer
// was only "this date has not been filled in". The mark belongs where the
// missing value is.

export const ROW_STATE = {
  DONE: 'done',
  TODAY: 'today',
  OVERDUE: 'overdue',
  MISSED: 'missed',
  UNPLANNED: 'unplanned',
  NONE: 'none',
};

/**
 * One palette, four representations, so the screen / Excel / PDF / HTML
 * cannot drift apart:
 *   tw   - Tailwind classes for the React table
 *   css  - plain CSS colour for the standalone HTML export
 *   argb - ExcelJS fill (8 hex digits, alpha first)
 *   rgb  - jsPDF fill triple
 */
export const ROW_STATE_STYLE = {
  [ROW_STATE.DONE]: {
    label: 'Done',
    tw: 'bg-emerald-100/90',
    twText: 'text-emerald-900',
    css: '#D1FAE5',
    argb: 'FFD1FAE5',
    rgb: [209, 250, 229],
  },
  [ROW_STATE.TODAY]: {
    label: 'Due today - On-going',
    tw: 'bg-sky-100/90',
    twText: 'text-sky-900',
    css: '#DBEAFE',
    argb: 'FFDBEAFE',
    rgb: [219, 234, 254],
  },
  [ROW_STATE.OVERDUE]: {
    label: 'Overdue - On-going',
    tw: 'bg-amber-100/90',
    twText: 'text-amber-900',
    css: '#FEF3C7',
    argb: 'FFFEF3C7',
    rgb: [254, 243, 199],
  },
  [ROW_STATE.MISSED]: {
    label: 'Overdue - not started',
    tw: 'bg-rose-100/90',
    twText: 'text-rose-900',
    css: '#FEE2E2',
    argb: 'FFFEE2E2',
    rgb: [254, 226, 226],
  },
  [ROW_STATE.UNPLANNED]: {
    label: 'Unplanned',
    // No ROW fill: see the note above. The Schedule cell carries the mark
    // (NO_DATE_CELL), everywhere the plan is drawn.
    tw: '',
    twText: 'text-slate-800',
    css: '#FFFFFF',
    argb: null,
    rgb: null,
  },
  [ROW_STATE.NONE]: {
    label: 'Planned',
    tw: '',
    twText: 'text-slate-800',
    css: '#FFFFFF',
    argb: null,
    rgb: null,
  },
};

/** The legend, in the order it should be displayed. */
export const ROW_STATE_LEGEND = [
  ROW_STATE.DONE, ROW_STATE.TODAY, ROW_STATE.OVERDUE, ROW_STATE.MISSED,
  ROW_STATE.UNPLANNED,
];

export function rowState(item, today = todayKey()) {
  const status = normalizeStatus(item?.status);
  if (status === STATUS_DONE) return ROW_STATE.DONE;

  // No date at all: the work exists but nobody has planned it.
  const sched = scheduleKey(item?.schedule);
  if (!sched) return ROW_STATE.UNPLANNED;

  if (status === STATUS_ONGOING) {
    if (sched === today) return ROW_STATE.TODAY;
    if (sched < today) return ROW_STATE.OVERDUE;
    return ROW_STATE.NONE;
  }

  // Status is blank.
  return sched < today ? ROW_STATE.MISSED : ROW_STATE.NONE;
}

export function rowStyle(item, today = todayKey()) {
  return ROW_STATE_STYLE[rowState(item, today)];
}

/**
 * The tint the SCHEDULE CELL wears when no date has been entered — one cell,
 * in the column the value is missing from, so the reason for the colour is
 * where the colour is. The inset ring is what separates "a marked empty box"
 * from "a row filled amber because it is overdue".
 */
export const NO_DATE_CELL = {
  tw: 'bg-amber-100/80 ring-1 ring-inset ring-amber-300 rounded-md',
  css: '#FEF3C7',
  argb: 'FFFEF3C7',
  rgb: [254, 243, 199],
};

/** Does this row need a plan date? (No date, and not already finished.) */
export function needsPlanDate(item, today = todayKey()) {
  return rowState(item, today) === ROW_STATE.UNPLANNED;
}

/** Colour of the Status cell itself, so the two values read apart at a glance. */
export const STATUS_STYLE = {
  [STATUS_DONE]: {
    tw: 'bg-emerald-600 text-white border-emerald-700',
    argb: 'FF059669', rgb: [5, 150, 105], fg: 'FFFFFFFF',
    css: '#059669', cssText: '#ffffff',
  },
  [STATUS_ONGOING]: {
    tw: 'bg-sky-600 text-white border-sky-700',
    argb: 'FF0284C7', rgb: [2, 132, 199], fg: 'FFFFFFFF',
    css: '#0284C7', cssText: '#ffffff',
  },
  [STATUS_BLANK]: {
    tw: 'bg-white text-slate-500 border-slate-300',
    argb: null, rgb: null, fg: 'FF334155',
    css: '#ffffff', cssText: '#64748b',
  },
};

// --- Rows, groups and numbering -----------------------------------

/** A blank activity row belonging to an equipment group. */
export function makeMiniPlanRow(groupId, equipment = '', overrides = {}) {
  const rand = Math.random().toString(36).slice(2, 7);
  return {
    id: `mp_${Date.now()}_${rand}`,
    group_id: groupId,
    equipment,
    schedule: '',
    activity: '',
    status: STATUS_BLANK,
    completed_date: '',
    note: '',
    photos: [],
    ...overrides,
  };
}

export function makeGroupId() {
  return `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Does this row hold an ACTIVITY the user actually entered?
 *
 * Equipment is deliberately excluded. A row added to a group inherits the
 * equipment name automatically, so counting that as content would make every
 * blank row the user has just created count as a finished-or-not activity —
 * inflating the total and dragging the completion percentage down for rows
 * nobody has typed into yet.
 */
export function miniActivityHasContent(item) {
  if (!item) return false;
  if ((item.activity || '').trim()) return true;
  if ((item.note || '').trim()) return true;
  if (scheduleKey(item.schedule)) return true;
  if (scheduleKey(item.completed_date)) return true;
  if (normalizeStatus(item.status)) return true;
  return (item.photos || []).some((p) => p && (p.url || p.kind === 'file'));
}

/**
 * Does this row hold anything at all, INCLUDING an equipment name?
 *
 * This is the test for numbering an equipment group: an equipment that has
 * been named but not yet planned is still Item N on the plan — that is the
 * normal state of a backlog entry — whereas a wholly untouched trailing group
 * is not numbered, exactly as an empty row in a Flash Report is not.
 */
export function miniRowHasContent(item) {
  if (!item) return false;
  if ((item.equipment || '').trim()) return true;
  return miniActivityHasContent(item);
}

/**
 * Split the flat item array into the CONSECUTIVE runs that share a
 * `group_id` - one run per Equipment, which is what columns A and B show
 * merged.
 *
 * Grouping is by id, not by the Equipment TEXT. Two different equipments can
 * legitimately be given the same name while they are being typed, and an
 * equipment can be renamed; neither must silently merge or split a group.
 *
 * @returns {Array<{ key, equipment, start, count, no, rows: Array<{item,index}> }>}
 */
export function groupMiniPlanItems(items) {
  const list = items || [];
  const groups = [];
  let current = null;

  list.forEach((item, index) => {
    const key = item?.group_id || `__row_${index}`;
    if (!current || current.key !== key) {
      current = { key, equipment: item?.equipment || '', start: index, count: 0, no: '', rows: [] };
      groups.push(current);
    }
    // The whole group shows ONE equipment name: the first non-empty one.
    if (!current.equipment && item?.equipment) current.equipment = item.equipment;
    current.count += 1;
    current.rows.push({ item, index });
  });

  // Number the groups that carry content. An untouched trailing group gets
  // no number, exactly as an empty row in a Flash Report does.
  let n = 0;
  for (const g of groups) {
    const hasContent = g.rows.some(({ item }) => miniRowHasContent(item));
    g.no = hasContent ? ++n : '';
  }

  return groups;
}

/** How many Equipment items the plan actually contains. */
export function countMiniPlanItems(items) {
  return groupMiniPlanItems(items).filter((g) => g.no !== '').length;
}

/** Completion summary for the header strip and the exports. */
export function miniPlanStats(items, today = todayKey()) {
  // Counts ACTIVITIES, not rows: a freshly inserted blank row carries its
  // group's equipment name and must not be counted as planned work.
  const rows = (items || []).filter(miniActivityHasContent);
  const counts = {
    total: rows.length, done: 0, today: 0, overdue: 0, missed: 0,
    unplanned: 0, planned: 0,
  };
  for (const r of rows) {
    const st = rowState(r, today);
    if (st === ROW_STATE.DONE) counts.done++;
    else if (st === ROW_STATE.TODAY) counts.today++;
    else if (st === ROW_STATE.OVERDUE) counts.overdue++;
    else if (st === ROW_STATE.MISSED) counts.missed++;
    else if (st === ROW_STATE.UNPLANNED) counts.unplanned++;
    else counts.planned++;
  }
  counts.equipment = countMiniPlanItems(items);
  counts.percent = counts.total ? Math.round((counts.done / counts.total) * 100) : 0;
  return counts;
}

/**
 * Re-stamp every row of a group with the same equipment text.
 * Used when the user edits the merged Equipment cell - the text is stored on
 * every row so a single row still makes sense on its own (phone cards, an
 * export that lost the merge, a row moved to another group).
 */
export function applyEquipmentToGroup(items, groupKey, equipment) {
  return (items || []).map((it) =>
    (it?.group_id || '') === groupKey ? { ...it, equipment } : it
  );
}

/**
 * Ensure every row has a group_id and an equipment string.
 * Cheap, idempotent, and run on load so an older or hand-edited document
 * cannot render an un-grouped table.
 */
/**
 * One-off text corrections the plan carries itself.
 *
 * A phrase that was typed the wrong way round lives in hundreds of rows, in
 * the live report AND in the shared copy, so fixing it by hand is not a fix at
 * all. Every surface reads its rows through normalizeMiniPlanItems(), so a
 * correction stated here lands on the table, the dashboard, the share link and
 * every export at once, and is written back the next time the plan is saved.
 *
 * Rules must be idempotent — running them on already-corrected text must
 * change nothing — because they run on every load, forever.
 */
const TEXT_FIXES = [
  [/\bPlan Seal\b/g, 'Seal Plan'],
];

export function fixPlanText(value) {
  if (typeof value !== 'string' || !value) return value;
  let out = value;
  for (const [pattern, replacement] of TEXT_FIXES) out = out.replace(pattern, replacement);
  return out;
}

export function normalizeMiniPlanItems(items) {
  return applyChecksheetUpdate(normalizeRows(items), makeMiniPlanRow);
}

function normalizeRows(items) {
  const list = Array.isArray(items) ? items : [];
  let lastKey = null;
  let lastEquip = '';

  return list.map((raw, i) => {
    const item = { ...(raw || {}) };
    if (!item.id) item.id = `mp_${i}_${Math.random().toString(36).slice(2, 7)}`;

    item.equipment = fixPlanText(item.equipment);
    item.activity = fixPlanText(item.activity);
    item.note = fixPlanText(item.note);

    if (!item.group_id) {
      // No id: fall back to the equipment text, which is how a row imported
      // from the spreadsheet arrives.
      const equip = (item.equipment || '').trim();
      if (equip && equip !== lastEquip) {
        lastKey = makeGroupId();
        lastEquip = equip;
      } else if (!lastKey) {
        lastKey = makeGroupId();
      }
      item.group_id = lastKey;
    } else {
      lastKey = item.group_id;
      lastEquip = (item.equipment || '').trim() || lastEquip;
    }

    if (!item.equipment) item.equipment = lastEquip;
    item.schedule = scheduleKey(item.schedule);
    item.status = normalizeStatus(item.status);
    item.completed_date = scheduleKey(item.completed_date);
    if (!Array.isArray(item.photos)) item.photos = [];
    return item;
  });
}

// --- Photo slots --------------------------------------------------

/**
 * The Photo column holds an UNBOUNDED number of images in ONE cell, unlike a
 * Flash Report's four fixed slots. The array index cannot be the storage key:
 * deleting the first of five photos would shift the other four, every
 * fingerprint would miss, and all of them would be re-uploaded (and the old
 * documents orphaned).
 *
 * So each photo keeps a STABLE `slot_index`, allocated once and never reused
 * within an item. `photoKey(itemId, slot_index)` therefore stays valid for the
 * life of the photo, and the existing sync, share and hydrate paths - which
 * all read `p.slot_index ?? index` - work unchanged.
 */
export function nextPhotoSlot(photos) {
  let max = -1;
  for (const [i, p] of (photos || []).entries()) {
    const s = Number(p?.slot_index ?? i);
    if (Number.isFinite(s) && s > max) max = s;
  }
  return max + 1;
}

// --- Search and the "this week" filter ----------------------------
//
// Both are VIEW-ONLY. They never touch `items`, never reorder it and never
// renumber anything: they decide which groups the table draws and which rows
// it highlights, working from the ORIGINAL indices that `groupMiniPlanItems`
// already carries. A filter that rewrote the array would break every edit
// handler, because those address rows by their index in the real list.
//
// This lives here rather than in the component because the laptop table, the
// phone cards and the public live link all have to agree on what "this week"
// means and on what counts as a match - the same reason the colour rule is
// here.

/**
 * Monday-to-Sunday week containing `today`, as {start, end} YYYY-MM-DD.
 *
 * Monday-start is the working convention on this project. `getDay()` returns
 * 0 for Sunday, so Sunday has to fold back to the END of the week, not the
 * start - otherwise every Sunday would show the week about to begin instead
 * of the one just worked.
 */
export function weekRange(today = todayKey()) {
  const [y, m, d] = today.split('-').map(Number);
  const base = new Date(y, m - 1, d);
  const dow = base.getDay();                 // 0 = Sunday
  const backToMonday = dow === 0 ? 6 : dow - 1;

  const start = new Date(base);
  start.setDate(base.getDate() - backToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return { start: todayKey(start), end: todayKey(end) };
}

/** Is this row's Schedule inside the current week? A blank schedule is not. */
export function isInCurrentWeek(schedule, today = todayKey()) {
  const key = scheduleKey(schedule);
  if (!key) return false;
  const { start, end } = weekRange(today);
  return key >= start && key <= end;
}

/**
 * Fold text for searching: lower-cased and stripped of diacritics, so typing
 * "kiem tra" finds "Kiem tra" written with accents, and "e-1302" finds
 * "E-1302". Notes on this project are written in both English and Vietnamese,
 * often without the accents.
 */
export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Human form of a schedule, so searching "14-Sep" matches what is on screen. */
function scheduleLabel(schedule) {
  const key = scheduleKey(schedule);
  if (!key) return '';
  const [y, m, d] = key.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(d)}-${months[Number(m) - 1]}-${y.slice(2)} ${key}`;
}

/**
 * Does this row match the typed text? Every field the user can see is
 * searchable - equipment, activity, note, status, and the schedule in both
 * the stored and the displayed spelling. Searching one column only would make
 * the box feel broken the first time somebody types a date or a status.
 */
export function itemMatchesSearch(item, needle) {
  if (!needle) return true;
  const hay = normalizeSearchText([
    item?.equipment,
    item?.activity,
    item?.note,
    normalizeStatus(item?.status),
    scheduleLabel(item?.schedule),
    scheduleLabel(item?.completed_date),
  ].join(' ~ '));
  return hay.includes(needle);
}


// --- Completed Date -----------------------------------------------
//
// Added in v3.1. The Schedule column says when an activity was PLANNED; this
// one says when it was actually finished, which is the only way to answer
// "how much of this week's plan did we actually deliver?".

/**
 * The date this activity was completed, as YYYY-MM-DD, or ''.
 *
 * A Done row entered before this column existed has no completed date at all.
 * Rather than report those 35 rows as "never completed", the row's own
 * Schedule stands in for them - the plan's own statement of when the work was
 * meant to happen, on a row somebody has since ticked as Done. That inference
 * is visible on screen (the value is shown greyed and marked "planned"), and
 * the moment anyone types a real date it wins.
 *
 * A row that is NOT Done never has a completed date, whatever is stored.
 */
export function completedKey(item) {
  // A date stored on a row that is not Done is a contradiction the plan
  // cannot support - Status is what says whether the work is finished - so it
  // is never counted. statusChangePatch() clears it on the way out of Done;
  // this guard covers a date typed directly into a row nobody has ticked.
  if (normalizeStatus(item?.status) !== STATUS_DONE) return '';
  return scheduleKey(item?.completed_date) || scheduleKey(item?.schedule);
}

/** True when completedKey() fell back to the Schedule instead of a real entry. */
export function isCompletedDateInferred(item) {
  if (normalizeStatus(item?.status) !== STATUS_DONE) return false;
  return !scheduleKey(item?.completed_date) && Boolean(scheduleKey(item?.schedule));
}

/**
 * The patch to apply when the user changes Status, so Status and Completed
 * Date can never disagree.
 *
 *   -> Done      : stamp today, unless a date is already recorded.
 *   -> not Done  : clear it. A date on a row that is not finished is a claim
 *                  the plan cannot support, and it would be counted by the
 *                  weekly "completed" figure.
 */
export function statusChangePatch(item, nextStatus, today = todayKey()) {
  const status = normalizeStatus(nextStatus);
  if (status !== STATUS_DONE) return { status, completed_date: '' };
  return { status, completed_date: scheduleKey(item?.completed_date) || today };
}

// --- Week modes ---------------------------------------------------

export const WEEK_MODE = { NONE: 'none', THIS: 'this', NEXT: 'next' };

/** Monday-to-Sunday week AFTER the one containing `today`. */
export function nextWeekRange(today = todayKey()) {
  const { end } = weekRange(today);                 // Sunday of this week
  const [y, m, d] = end.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  start.setDate(start.getDate() + 1);               // the following Monday
  const finish = new Date(start);
  finish.setDate(start.getDate() + 6);
  return { start: todayKey(start), end: todayKey(finish) };
}

/** The week a mode refers to. NONE still reports the current week, because
 *  the weekly figures on the dashboard always describe SOME week. */
export function weekRangeFor(mode, today = todayKey()) {
  return mode === WEEK_MODE.NEXT ? nextWeekRange(today) : weekRange(today);
}

export function weekModeLabel(mode) {
  return mode === WEEK_MODE.NEXT ? 'Next week' : 'This week';
}

/** Is a YYYY-MM-DD key inside {start,end}? Both ends inclusive; '' is never. */
export function inRange(key, range) {
  if (!key || !range) return false;
  return key >= range.start && key <= range.end;
}

// --- The filter, shared by both tabs ------------------------------
//
// ONE filter object drives the dashboard AND the monitoring table. That is the
// whole point of the two tabs: clicking "12 completed this week" on the
// dashboard has to leave the Monitoring tab showing the same work, or the two
// views become two different truths about one plan (BUG-014's rule applied to
// a selection instead of a colour).
//
//   search    - free text, matched against every visible field
//   week      - WEEK_MODE: none / this / next, matched against SCHEDULE
//   focus     - which summary tile is selected (see FOCUS)
//   equipment - a single group_id, set by clicking a row in the left panel
//
// `search`, `week` and `equipment` are the SCOPE: the dashboard's summary
// figures are counted over exactly those rows, which is what makes the tiles
// re-count when the user types. `focus` is applied on top, to the preview
// table and to the Monitoring tab, so selecting a tile narrows the list
// WITHOUT changing the numbers the tiles themselves show - otherwise every
// click would rewrite the very figure that was clicked.

export const FOCUS = {
  ALL: 'all',
  DONE: 'done',
  OPEN: 'open',
  PLAN_WEEK: 'planWeek',
  DONE_WEEK: 'doneWeek',
  VAR: 'var',
};

export const EMPTY_FILTER = {
  search: '',
  week: WEEK_MODE.NONE,
  focus: FOCUS.ALL,
  equipment: '',
};

/** Accepts the v2.9 shape (`week: true/false`) as well as the current one. */
export function normalizeFilter(filter) {
  const f = filter || {};
  let week = f.week;
  if (week === true) week = WEEK_MODE.THIS;
  if (week !== WEEK_MODE.THIS && week !== WEEK_MODE.NEXT) week = WEEK_MODE.NONE;
  return {
    search: String(f.search ?? ''),
    week,
    focus: f.focus || FOCUS.ALL,
    equipment: f.equipment || '',
  };
}

export function isFilterActive(filter) {
  const f = normalizeFilter(filter);
  return Boolean(normalizeSearchText(f.search).trim())
    || f.week !== WEEK_MODE.NONE
    || f.focus !== FOCUS.ALL
    || Boolean(f.equipment);
}

/** Search + week + equipment. This is what the summary figures count. */
export function itemInScope(item, filter, today = todayKey()) {
  const f = normalizeFilter(filter);
  const needle = normalizeSearchText(f.search).trim();
  if (needle && !itemMatchesSearch(item, needle)) return false;
  if (f.equipment && (item?.group_id || '') !== f.equipment) return false;
  if (f.week !== WEEK_MODE.NONE) {
    if (!inRange(scheduleKey(item?.schedule), weekRangeFor(f.week, today))) return false;
  }
  return true;
}

/** The selected summary tile, applied on top of the scope. */
export function itemInFocus(item, filter, today = todayKey()) {
  const f = normalizeFilter(filter);
  const range = weekRangeFor(f.week, today);
  const status = normalizeStatus(item?.status);

  switch (f.focus) {
    case FOCUS.DONE:      return status === STATUS_DONE;
    case FOCUS.OPEN:      return status !== STATUS_DONE;
    case FOCUS.PLAN_WEEK: return inRange(scheduleKey(item?.schedule), range);
    case FOCUS.DONE_WEEK: return inRange(completedKey(item), range);
    // The variance IS the gap: planned inside the week and not completed
    // inside it. Clicking Var should hand the user the work that slipped,
    // not a number they then have to find by eye.
    case FOCUS.VAR:
      return inRange(scheduleKey(item?.schedule), range) && !inRange(completedKey(item), range);
    default: return true;
  }
}

export function itemMatchesFilter(item, filter, today = todayKey()) {
  return itemInScope(item, filter, today) && itemInFocus(item, filter, today);
}

/**
 * Apply the filter to grouped rows.
 *
 * THE GROUP IS THE UNIT. If ANY activity of an Equipment matches, the whole
 * Equipment is kept with ALL of its activities - that is what makes the
 * filter usable on a plan: to act on the one item that is due this week you
 * need the rest of that equipment's work in front of you, not a row torn out
 * of its context. It is also exactly what the user asked for when the
 * dashboard drives the Monitoring tab.
 *
 * The rows that actually matched come back in `matched` so the table can mark
 * them; without that the user cannot tell WHY a group is on screen.
 *
 * VIEW-ONLY: the groups handed back carry their ORIGINAL row indices, so item
 * numbers never shift and every edit handler - all of which address rows by
 * their index in the real `items` array - keeps working.
 *
 * @returns {{groups, matched:Set<number>, groupCount:number, rowCount:number, active:boolean}}
 */
export function filterMiniPlanGroups(groups, options = {}) {
  const today = options.today || todayKey();
  const filter = normalizeFilter(options);
  const active = isFilterActive(filter);

  if (!active) {
    return { groups, matched: new Set(), groupCount: groups.length, rowCount: 0, active: false };
  }

  const matched = new Set();
  const kept = [];

  for (const group of groups) {
    let hit = false;
    for (const { item, index } of group.rows) {
      if (itemMatchesFilter(item, filter, today)) {
        matched.add(index);
        hit = true;
      }
    }
    // Keep EVERY row of the group, not only the matching ones.
    if (hit) kept.push(group);
  }

  return { groups: kept, matched, groupCount: kept.length, rowCount: matched.size, active: true };
}
