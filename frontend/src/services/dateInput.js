/**
 * Everything the plan needs to READ a date a human typed, and to lay out a
 * month. Pure functions, no React, no DOM — the date picker is built on top
 * of this file and the unit tests drive this file directly.
 *
 * Two rules govern the whole file:
 *
 *   1. A date is always stored as 'YYYY-MM-DD' (scheduleKey's shape). Nothing
 *      here ever produces a Date object for storage, because a Date is a point
 *      in time in a timezone and a plan date is a day on a calendar. Mixing the
 *      two is what wrote "11-Sep" into Excel for a 12-Sep task (BUG-022).
 *   2. Typed input is DAY FIRST. The plan is written and read by engineers who
 *      write 12/9 for the twelfth of September, and the browser's own date box
 *      follows the machine's locale instead — which is exactly why typing a
 *      date into it kept going wrong (BUG-028).
 */

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
/** Monday first: a work week starts on Monday on every plan in the building. */
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const pad = (n) => String(n).padStart(2, '0');

export function makeKey(y, m, d) {
  return `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`;
}

export function keyParts(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isValidYmd(y, m, d) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1900 || y > 2999 || m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

/** Calendar arithmetic in UTC, so a day never shifts under a timezone. */
export function addDays(key, n) {
  const p = keyParts(key);
  if (!p) return '';
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return makeKey(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addMonths(key, n) {
  const p = keyParts(key);
  if (!p) return '';
  const total = (p.y * 12) + (p.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return makeKey(y, m, Math.min(p.d, daysInMonth(y, m)));
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(key) {
  const p = keyParts(key);
  if (!p) return 0;
  return (new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() + 6) % 7;
}

/** The next given weekday STRICTLY after `key` (default: next Monday). */
export function nextWeekday(key, weekday = 0) {
  const cur = weekdayIndex(key);
  const delta = ((weekday - cur + 7) % 7) || 7;
  return addDays(key, delta);
}

/**
 * Six rows of seven days covering the month of `key`, Monday first, so the
 * grid never changes height when the month changes (a grid that grows a row
 * makes the buttons under it jump, which is the whole complaint).
 */
export function monthGrid(y, m) {
  const first = makeKey(y, m, 1);
  const lead = weekdayIndex(first);
  const start = addDays(first, -lead);
  const out = [];
  for (let i = 0; i < 42; i += 1) {
    const key = addDays(start, i);
    out.push({ key, inMonth: keyParts(key).m === m });
  }
  return out;
}

/** Human form used everywhere the plan is read: 12-Sep-26. */
export function formatDateKey(key) {
  const p = keyParts(key);
  if (!p) return '';
  return `${p.d}-${MONTH_SHORT[p.m - 1]}-${String(p.y).slice(2)}`;
}

/** Long form for the picker's own header: Saturday, 12 September 2026. */
export function formatDateLong(key) {
  const p = keyParts(key);
  if (!p) return '';
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return `${names[weekdayIndex(key)]}, ${p.d} ${MONTH_LONG[p.m - 1]} ${p.y}`;
}

function monthFromWord(word) {
  const w = String(word).toLowerCase().slice(0, 3);
  const i = MONTH_SHORT.findIndex((mm) => mm.toLowerCase() === w);
  return i < 0 ? null : i + 1;
}

function fullYear(y) {
  if (y >= 1000) return y;
  if (y >= 100) return null;      // 3-digit years are a typo, not a year
  if (y < 10) return null;        // a year still being typed ("2" of "2026")
  return 2000 + y;                // 26 -> 2026
}

/**
 * Read a date the way a person typed it. Deliberately forgiving, because the
 * alternative — the browser's segmented box — is what people fight with.
 *
 * Accepted (today = the day the plan is being edited):
 *   15            -> the 15th of the month being shown
 *   15/9  15-9  15.9  15 9          -> 15 September, that year
 *   15/9/26  15/9/2026              -> explicit year
 *   15 sep   sep 15   15 september  -> month by name, either order
 *   1509  150926  15092026          -> no separators, day first
 *   2026-09-15  20260915            -> ISO, year first
 *   today  tod  t  tomorrow  tmr  yesterday  +3  -2  +1w
 *
 * Returns 'YYYY-MM-DD', or '' when the text is not a date (so a half-typed
 * "15/" is simply "not yet a date" and nothing is written).
 */
export function parseDateInput(text, today, viewMonth = null) {
  const base = keyParts(today) ? today : '';
  if (!base) return '';
  const raw = String(text == null ? '' : text).trim().toLowerCase();
  if (!raw) return '';

  // Words and relative jumps
  if (/^(t|tod|today|now|hom nay|hômnay)$/.test(raw)) return base;
  if (/^(tm|tmr|tom|tomorrow|mai)$/.test(raw)) return addDays(base, 1);
  if (/^(y|yst|yesterday|hqua)$/.test(raw)) return addDays(base, -1);
  const rel = /^([+-])\s*(\d{1,3})\s*(d|day|days|w|week|weeks|m|month|months)?$/.exec(raw);
  if (rel) {
    const sign = rel[1] === '-' ? -1 : 1;
    const n = Number(rel[2]) * sign;
    const unit = (rel[3] || 'd')[0];
    if (unit === 'w') return addDays(base, n * 7);
    if (unit === 'm') return addMonths(base, n);
    return addDays(base, n);
  }

  const view = keyParts(viewMonth) || keyParts(base);

  // A month written as a word, in either order: "15 sep 26", "sep 15"
  const wordy = raw.match(/[a-z]{3,9}/);
  if (wordy) {
    const mm = monthFromWord(wordy[0]);
    if (!mm) return '';
    const nums = raw.replace(/[a-z]+/g, ' ').match(/\d{1,4}/g) || [];
    if (!nums.length) return '';
    const d = Number(nums[0]);
    const y = nums.length > 1 ? fullYear(Number(nums[1])) : view.y;
    if (y == null) return '';
    return isValidYmd(y, mm, d) ? makeKey(y, mm, d) : '';
  }

  // Separated numbers, day first — unless the first block is a 4-digit year
  const parts = raw.split(/[^\d]+/).filter(Boolean);
  if (parts.length > 1) {
    if (parts.length > 3) return '';
    if (parts[0].length === 4) {
      const [y, m, d] = parts.map(Number);
      const day = parts.length === 3 ? d : 1;
      return isValidYmd(y, m, day) ? makeKey(y, m, day) : '';
    }
    const d = Number(parts[0]);
    const m = Number(parts[1]);
    const y = parts.length === 3 ? fullYear(Number(parts[2])) : view.y;
    if (y == null) return '';
    return isValidYmd(y, m, d) ? makeKey(y, m, d) : '';
  }

  // One run of digits
  const digits = parts[0] || '';
  if (!digits) return '';
  if (digits.length <= 2) {
    const d = Number(digits);
    return isValidYmd(view.y, view.m, d) ? makeKey(view.y, view.m, d) : '';
  }
  if (digits.length === 3) {
    // d + mm, e.g. 509 = 5 September
    const d = Number(digits.slice(0, 1));
    const m = Number(digits.slice(1));
    return isValidYmd(view.y, m, d) ? makeKey(view.y, m, d) : '';
  }
  if (digits.length === 4) {
    const d = Number(digits.slice(0, 2));
    const m = Number(digits.slice(2));
    return isValidYmd(view.y, m, d) ? makeKey(view.y, m, d) : '';
  }
  if (digits.length === 6) {
    const d = Number(digits.slice(0, 2));
    const m = Number(digits.slice(2, 4));
    const y = fullYear(Number(digits.slice(4)));
    return y != null && isValidYmd(y, m, d) ? makeKey(y, m, d) : '';
  }
  if (digits.length === 8) {
    const lead = Number(digits.slice(0, 4));
    if (lead >= 1900 && lead <= 2999) {           // 20260915
      const m = Number(digits.slice(4, 6));
      const d = Number(digits.slice(6));
      if (isValidYmd(lead, m, d)) return makeKey(lead, m, d);
    }
    const d = Number(digits.slice(0, 2));         // 15092026
    const m = Number(digits.slice(2, 4));
    const y = Number(digits.slice(4));
    return isValidYmd(y, m, d) ? makeKey(y, m, d) : '';
  }
  return '';
}
