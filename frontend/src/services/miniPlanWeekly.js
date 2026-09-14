/**
 * The plan seen week by week: what was planned, what was actually finished,
 * and the two running totals that say whether the job as a whole is on time.
 *
 * Four series, because that is what a progress meeting asks for:
 *   plan      - tasks whose Schedule falls in that week          (column)
 *   actual    - tasks actually finished in that week             (column)
 *   cumPlan   - every task planned up to and including that week (line)
 *   cumActual - every task finished up to and including that week(line)
 *
 * ACTUAL STOPS AT THE CURRENT WEEK. A future week has no actual — not a zero,
 * which would read as "nothing was done" and drag the line to the floor. The
 * distance between the two lines at today's week IS the schedule variance.
 *
 * Pure functions: the screen chart and the chart drawn into the Excel report
 * are both fed from here, so the meeting and the file cannot disagree.
 */
import { scheduleKey, completedKey, normalizeStatus, todayKey, STATUS_DONE } from './miniPlan.js';
import { addDays, weekdayIndex, keyParts, MONTH_SHORT } from './dateInput.js';

/** Monday of the week a date falls in — the plan's week starts on Monday. */
export function weekStart(key) {
  return key ? addDays(key, -weekdayIndex(key)) : '';
}

/** "15 Sep" — short enough for an axis, unambiguous in a meeting. */
export function weekLabel(key) {
  const p = keyParts(key);
  return p ? `${p.d} ${MONTH_SHORT[p.m - 1]}` : '';
}

function addWeeks(key, n) { return addDays(key, n * 7); }

/**
 * @param items  the plan rows
 * @param today  the day the chart is being read on
 * @param maxWeeks how many weeks the screen (or the page) can show legibly
 * @param past   share of the window spent on weeks already gone (0..1)
 */
export function weeklySeries(items, { today = todayKey(), maxWeeks = 14, past = 0.45 } = {}) {
  const list = Array.isArray(items) ? items : [];
  const plan = new Map();
  const actual = new Map();
  let planned = 0; let unplanned = 0; let done = 0; let doneUndated = 0;

  list.forEach((item) => {
    const s = weekStart(scheduleKey(item?.schedule));
    if (s) { plan.set(s, (plan.get(s) || 0) + 1); planned += 1; } else unplanned += 1;

    if (normalizeStatus(item?.status) === STATUS_DONE) {
      done += 1;
      const c = weekStart(completedKey(item));
      if (c) actual.set(c, (actual.get(c) || 0) + 1); else doneUndated += 1;
    }
  });

  const cur = weekStart(today);
  // A plan where nothing is dated has no time axis to draw — say so, rather
  // than drawing one empty week around today and calling it a chart.
  const dated = [...plan.keys(), ...actual.keys()].filter(Boolean);
  const keys = dated.length ? [...dated, cur].filter(Boolean).sort() : [];
  if (!keys.length) {
    return { weeks: [], window: null, currentIndex: -1, hasData: false,
             totals: { tasks: list.length, planned, unplanned, done, doneUndated, remaining: list.length - done } };
  }

  // Every week from the first to the last, including the empty ones: a gap in
  // a time axis must be shown as a gap, not closed up.
  const all = [];
  for (let k = keys[0]; k <= keys[keys.length - 1]; k = addWeeks(k, 1)) all.push(k);

  let cp = 0; let ca = 0;
  const full = all.map((key) => {
    const p = plan.get(key) || 0;
    const a = actual.get(key) || 0;
    cp += p;
    const future = key > cur;
    if (!future) ca += a;
    return {
      key, label: weekLabel(key), end: addDays(key, 6),
      plan: p,
      actual: future ? null : a,
      cumPlan: cp,
      cumActual: future ? null : ca,
      isCurrent: key === cur,
      isFuture: future,
    };
  });

  // The window: keep the current week in view, spend the rest of the space
  // mostly on what is still ahead, and never run past either end.
  const size = Math.max(3, Math.min(maxWeeks, full.length));
  const curIdx = Math.max(0, full.findIndex((w) => w.key === cur));
  let from = Math.round(curIdx - (size * past));
  from = Math.max(0, Math.min(from, full.length - size));
  const weeks = full.slice(from, from + size);

  return {
    weeks,
    window: { from, to: from + size, of: full.length },
    currentIndex: weeks.findIndex((w) => w.isCurrent),
    hasData: true,
    totals: {
      tasks: list.length, planned, unplanned, done, doneUndated,
      remaining: list.length - done,
      planToDate: full[curIdx] ? full[curIdx].cumPlan : 0,
      doneToDate: full[curIdx] ? full[curIdx].cumActual : 0,
    },
  };
}

/** How many weeks fit legibly in a box this wide. */
export function weeksForWidth(width) {
  if (!width || width < 360) return 6;
  return Math.max(6, Math.min(26, Math.floor((width - 70) / 52)));
}
