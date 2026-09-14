import { sha256Hex, digestsEqual } from './sha256.js';

/**
 * App open lock — the password asked for BEFORE the app itself opens.
 *
 * WHAT IT PROTECTS
 * ----------------
 * The platform holds every report, every photo and the controls that create,
 * delete, export and SHARE them. A phone left on a desk or a laptop borrowed
 * for a minute is the realistic threat here, and until now anything with the
 * URL opened straight into the data. This gate stands in front of the whole
 * app shell: nothing is fetched, nothing is listened to and nothing is painted
 * until the password is entered.
 *
 * WHAT IT DELIBERATELY DOES NOT PROTECT
 * -------------------------------------
 * The PUBLIC ROUTES stay open — `#/view/<shareId>` (a shared report or the
 * live Mini Plan) and `#/file/<shareId>/<key>` (an attachment opened from an
 * exported report). Those links are already in the hands of people who do not
 * have this password, and gating them would silently break every link that has
 * been distributed. `isPublicRoute()` below is the single definition of that
 * boundary, and it is deliberately LOOSE in the same way App.jsx's own route
 * test is: anything that even looks like a view/file link is treated as public
 * rather than risk locking a colleague out of a link that already works.
 *
 * WHAT THIS IS AND IS NOT (the same honesty as services/miniPlanAuth.js)
 * ---------------------------------------------------------------------
 * This is a shared password held in the client bundle. It stops somebody
 * picking up the device and reading or changing the project's data. It is NOT
 * authentication: anyone who reads the JavaScript can find the string, and the
 * Firestore rules on this project are open (APP_STATE "Open Items" #2), so the
 * database itself is not protected by it. Real access control is Improvement
 * #8 and remains a deliberate open decision. Recorded here so nobody later
 * mistakes this gate for security.
 *
 * TWO LOCKS, TWO AUDIENCES — do not merge them without deciding this first:
 *   - THIS lock is for the DEVICE HOLDER and guards the app itself.
 *   - `services/miniPlanAuth.js` holds the TEAM password that lets a reader of
 *     the public live link edit the plan. It is handed out to people who must
 *     never be given the app password.
 *   Neither password is written in this repository; see PASSWORD_HASH below.
 *
 * The unlock lives in sessionStorage, so a RELOAD keeps the app open and
 * CLOSING THE TAB re-locks it. Storage that throws (private mode) fails
 * CLOSED — an app that silently opens itself because storage was unavailable
 * is worse than one extra prompt.
 */

/**
 * The app password, stored as a SALTED SHA-256 DIGEST rather than as itself.
 *
 * This repository is PUBLIC. A password written here as a plain string would be
 * readable by anyone who opens the file on GitHub — no bundle to inspect, no
 * minified JavaScript to pick through, just the text. The digest gives that
 * away to nobody: there is nothing to read out, and a generic rainbow table
 * does not help because of the salt.
 *
 * Be clear about what it does NOT do. The comparison still happens on the
 * client, so somebody who can edit the JavaScript can remove the check
 * altogether, and the Firestore rules remain open. This raises the floor — it
 * does not make the lock into authentication.
 *
 * TO CHANGE THE PASSWORD: run
 *   node -e "import('./sha256.js').then(m=>console.log(m.sha256Hex('<salt>'+'<new password>')))"
 * with the salt below, and paste the digest in. Never commit the password
 * itself, not even in a comment or a commit message.
 */
const PASSWORD_SALT = 'FlashReportPro/BlockB-EPC#1/app-lock/v1:';
const PASSWORD_HASH = 'f88049447151b6fe363e5da1d8542f9e504276df50a15fa2ddd716c175ac3193';

const STORAGE_KEY = 'fr_app_unlocked';
const FAIL_KEY = 'fr_app_lock_fails';
const UNTIL_KEY = 'fr_app_lock_until';
const EVENT = 'flashreport:app-lock';

/** Wrong tries allowed before the field starts cooling down. */
const FREE_ATTEMPTS = 5;
const COOLDOWN_BASE_MS = 15_000;
const COOLDOWN_MAX_MS = 5 * 60_000;

/**
 * A password is often written inside quotation marks or after a colon, and a
 * pasted one very often carries a trailing space. None of that punctuation is
 * part of the secret, so surrounding whitespace, quotes and leading colons are
 * stripped before the digest is taken — a genuine holder of the password is
 * never locked out by a stray character. The letters themselves are compared
 * EXACTLY: a case-insensitive match would make a short password weaker still.
 */
export function checkAppPassword(input) {
  const cleaned = String(input ?? '')
    .trim()
    .replace(/^[:\s]+/, '')
    .replace(/^["'‘’“”]+|["'‘’“”]+$/g, '')
    .trim();
  if (!cleaned) return false;
  return digestsEqual(sha256Hex(PASSWORD_SALT + cleaned), PASSWORD_HASH);
}

/* ── storage helpers: every access guarded, every failure fails closed ── */

function _readSession(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function _readLocal(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function _writeLocal(key, value) {
  try { localStorage.setItem(key, value); } catch { /* penalty is best-effort */ }
}
function _clearLocal(key) {
  try { localStorage.removeItem(key); } catch { /* nothing to clear */ }
}

/** Is the app open for this browser tab? */
export function isAppUnlocked() {
  return _readSession(STORAGE_KEY) === '1';
}

/**
 * The public routes that must open with NO app password. Kept here rather than
 * in the gate component so there is exactly one answer to "is this link
 * public?", and so a future route can be added in one place.
 *
 * @param {string} [href] - defaults to the current location.
 */
export function isPublicRoute(href) {
  if (typeof window === 'undefined') return false;
  let hash = '';
  let search = '';
  if (href == null) {
    hash = window.location.hash || '';
    search = window.location.search || '';
  } else {
    const s = String(href);
    const h = s.indexOf('#');
    hash = h === -1 ? '' : s.slice(h);
    const q = s.indexOf('?');
    search = q === -1 ? '' : (h === -1 ? s.slice(q) : s.slice(q, h > q ? h : undefined));
  }
  // Public attachment link, opened from an exported report with no sign-in.
  if (/#\/file\/[^/?]+\/[^/?]+/.test(hash)) return true;
  // Shared report / live Mini Plan link. Matches App.jsx's own loose test on
  // purpose: a link already in circulation must never fall into the app gate.
  if (hash.includes('view') || search.includes('view')) return true;
  return false;
}

function _emit() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { unlocked: isAppUnlocked() } }));
}

/**
 * Milliseconds the user must wait before the next try, 0 when they may try now.
 * The penalty lives in localStorage, so closing the tab does not wipe it.
 */
export function cooldownRemaining(now = Date.now()) {
  const until = Number(_readLocal(UNTIL_KEY) || 0);
  if (!Number.isFinite(until) || until <= now) return 0;
  // A clock moved far forward then back could strand the app; cap the wait at
  // the longest penalty this module can legitimately have set.
  return Math.min(until - now, COOLDOWN_MAX_MS);
}

/** How many wrong passwords have been entered on this device. */
export function failedAttempts() {
  const n = Number(_readLocal(FAIL_KEY) || 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function _registerFailure(now = Date.now()) {
  const fails = failedAttempts() + 1;
  _writeLocal(FAIL_KEY, String(fails));
  if (fails > FREE_ATTEMPTS) {
    const step = fails - FREE_ATTEMPTS - 1;
    const wait = Math.min(COOLDOWN_BASE_MS * 2 ** step, COOLDOWN_MAX_MS);
    _writeLocal(UNTIL_KEY, String(now + wait));
  }
  return fails;
}

/**
 * Try to open the app.
 * @returns {{ok: boolean, wait: number, fails: number}} `wait` is the
 * milliseconds still to sit out; it is > 0 only when the attempt was refused
 * without even checking the password.
 */
export function unlockApp(password, now = Date.now()) {
  const wait = cooldownRemaining(now);
  if (wait > 0) return { ok: false, wait, fails: failedAttempts() };

  if (!checkAppPassword(password)) {
    const fails = _registerFailure(now);
    return { ok: false, wait: cooldownRemaining(now), fails };
  }

  try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch { /* see isAppUnlocked */ }
  _clearLocal(FAIL_KEY);
  _clearLocal(UNTIL_KEY);
  _emit();
  return { ok: true, wait: 0, fails: 0 };
}

/** Close the app again — the Lock button in the header, or stepping away. */
export function lockApp() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* nothing to clear */ }
  _emit();
}

/** Subscribe to lock/unlock. Returns an unsubscribe function. */
export function onAppLockChange(fn) {
  if (typeof window === 'undefined') return () => {};
  const handler = (e) => fn(Boolean(e.detail?.unlocked));
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

export const __test__ = {
  PASSWORD_SALT, PASSWORD_HASH, FREE_ATTEMPTS, COOLDOWN_BASE_MS, COOLDOWN_MAX_MS,
  STORAGE_KEY, FAIL_KEY, UNTIL_KEY,
};
