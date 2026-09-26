/**
 * CPP Mechanical Mini Plan — the dashboard's arithmetic.
 *
 * The "Equipment installation status" tab is a REPORT ON the plan, not a
 * second copy of it: every figure here is derived from the same `items` array
 * the Monitoring tab edits, through the same predicates in services/
 * miniPlan.js. Nothing in this file re-implements a status, a week or a
 * match — that is BUG-014's rule, and it is what lets the two tabs filter as
 * one.
 *
 * One call, `dashboardView(items, filter, today)`, returns everything the
 * screen AND the exporters need, so the .xlsx, the .pdf and the table the
 * user is looking at cannot disagree about what "this week" contained.
 */

import {
  groupMiniPlanItems, miniActivityHasContent, miniRowHasContent,
  normalizeStatus, scheduleKey, completedKey, todayKey,
  itemInScope, itemInFocus, normalizeFilter, isFilterActive,
  weekRangeFor, weekModeLabel, inRange, STATUS_DONE, WEEK_MODE, FOCUS,
  focusState, ROW_STATE_STYLE,
} from './miniPlan';

/**
 * Everything the dashboard shows, computed once.
 *
 * @param {Array} items    the plan's rows, in their real order
 * @param {Object} filter  {search, week, focus, equipment}
 * @param {string} today   YYYY-MM-DD, injected so tests are not time-bombs
 *
 * @returns {{
 *   filter, today, range, weekLabel, active,
 *   equipmentRows: Array<{key, no, equipment, done, total, percent, selected}>,
 *   stats: {equipment, done, total, percent, planWeek, doneWeek, variance},
 *   previewRows: Array<{no, index, item, equipment, itemNo}>,
 *   totalRows: number
 * }}
 */
export function dashboardView(items, filter = {}, today = todayKey()) {
  const f = normalizeFilter(filter);
  const groups = groupMiniPlanItems(items);
  const range = weekRangeFor(f.week, today);
  const weekLabel = weekModeLabel(f.week);

  const equipmentRows = [];
  const previewRows = [];

  const stats = {
    equipment: 0, done: 0, total: 0, percent: 0,
    planWeek: 0, doneWeek: 0, variance: 0, behind: 0,
  };

  for (const group of groups) {
    let inScope = 0;
    let gDone = 0;
    let gTotal = 0;

    // An equipment that has been named but not yet planned - and this plan
    // holds a long backlog of those - must still appear as ONE line, or it
    // would vanish from the preview while sitting in the left panel at 0/0.
    // An equipment that DOES have activities shows only those: the blank rows
    // waiting to be typed into are not work, and a flat table full of empty
    // lines is unreadable.
    const hasAnyActivity = group.rows.some((r) => miniActivityHasContent(r.item));
    const placeholderId = hasAnyActivity ? null : (group.rows[0]?.item?.id ?? null);

    for (const { item, index } of group.rows) {
      if (!itemInScope(item, f, today)) continue;
      inScope++;

      // Statistics count ACTIVITIES, never rows: a row that only carries the
      // equipment name it inherited is not planned work (BUG-018).
      if (miniActivityHasContent(item)) {
        const isDone = normalizeStatus(item.status) === STATUS_DONE;
        gTotal++;
        if (isDone) gDone++;

        stats.total++;
        if (isDone) stats.done++;
        const plannedThisWeek = inRange(scheduleKey(item.schedule), range);
        const doneThisWeek = inRange(completedKey(item), range);
        if (plannedThisWeek) stats.planWeek++;
        if (doneThisWeek) stats.doneWeek++;
        // The tasks the VAR figure stands for, counted one by one.
        if (plannedThisWeek && !isDone) stats.behind++;
      }

      const listable = miniActivityHasContent(item)
        || (placeholderId !== null && item?.id === placeholderId && miniRowHasContent(item));

      if (listable && itemInFocus(item, f, today)) {
        previewRows.push({
          no: previewRows.length + 1,
          index,
          item,
          equipment: group.equipment || item.equipment || '',
          itemNo: group.no,
        });
      }
    }

    if (inScope > 0) {
      stats.equipment++;
      equipmentRows.push({
        key: group.key,
        no: group.no,
        equipment: group.equipment || '',
        done: gDone,
        total: gTotal,
        percent: gTotal ? Math.round((gDone / gTotal) * 100) : 0,
        selected: f.equipment === group.key,
      });
    }
  }

  stats.percent = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  /**
   * VAR is the work of THIS WEEK'S PLAN that the week did not deliver.
   *
   * It used to be `doneWeek - planWeek`, and that number counts two different
   * populations: a task finished this week may have been planned for another
   * week entirely. The figure said -7 while clicking it produced 27 rows —
   * both correct, about different things, which makes the tile useless
   * (BUG-043). A figure on this panel must be the SIZE OF THE LIST it opens.
   *
   * So VAR = -(scheduled in the week and NOT Done): click it and you get
   * exactly those rows. A task finished early is delivered, and a task from
   * another week that is merely under way is not this week's variance — both
   * stay out. Plan against delivery is still readable next to it, in the PLAN
   * WK and DONE WK tiles.
   */
  stats.variance = -stats.behind;

  return {
    filter: f,
    today,
    range,
    weekLabel,
    active: isFilterActive(f),
    equipmentRows,
    stats,
    previewRows,
    totalRows: previewRows.length,
  };
}

/**
 * The six summary tiles, in the order the user asked for them.
 *
 * Each carries the FOCUS it applies when clicked, so the tile and the filter
 * it produces are defined in one place — a tile that showed one number and
 * filtered by another would be indefensible.
 */
export function summaryTiles(view) {
  const { stats, weekLabel } = view;
  const wk = weekLabel.toLowerCase();
  return [
    { key: 'equipment', label: 'Equipment',        value: stats.equipment, focus: FOCUS.ALL,       tone: 'slate',   hint: 'Equipment in view — click to clear the row filter' },
    { key: 'done',      label: 'Completed tasks',  value: stats.done,      focus: FOCUS.DONE,      tone: 'emerald', hint: 'Activities marked Done' },
    { key: 'total',     label: 'Total tasks',      value: stats.total,     focus: FOCUS.ALL,       tone: 'sky',     hint: 'All planned activities in view' },
    { key: 'planWeek',  label: `Plan ${wk}`,       value: stats.planWeek,  focus: FOCUS.PLAN_WEEK, tone: 'violet',  hint: `Scheduled ${view.range.start} to ${view.range.end}` },
    { key: 'doneWeek',  label: `Done ${wk}`,       value: stats.doneWeek,  focus: FOCUS.DONE_WEEK, tone: 'teal',    hint: `Completed ${view.range.start} to ${view.range.end}` },
    { key: 'variance',  label: 'Var',              value: stats.variance,  focus: FOCUS.VAR,       tone: 'amber',   hint: "Tasks planned in that week that the week did not finish — click for exactly those rows", signed: true },
  ];
}

/** How many equipment / rows a filter is currently showing, for a caption. */
export function describeFilter(view) {
  const f = view.filter;
  const bits = [];
  if (f.search.trim()) bits.push(`"${f.search.trim()}"`);
  if (f.week !== WEEK_MODE.NONE) bits.push(`${view.weekLabel} (${view.range.start} to ${view.range.end})`);
  const st = focusState(f.focus);
  if (st) bits.push(ROW_STATE_STYLE[st]?.label || st);
  else if (f.focus !== FOCUS.ALL) {
    const tile = summaryTiles(view).find((t) => t.focus === f.focus && t.key !== 'equipment' && t.key !== 'total');
    if (tile) bits.push(tile.label);
  }
  if (f.equipment) {
    const eq = view.equipmentRows.find((e) => e.key === f.equipment);
    if (eq) bits.push(eq.equipment || 'one Equipment');
  }
  return bits.length ? bits.join(' · ') : 'Whole plan';
}
