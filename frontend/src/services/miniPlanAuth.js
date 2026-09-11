/**
 * Edit lock for the CPP Mechanical Mini Plan.
 *
 * The Mini Plan is shared as a LIVE LINK, so people who are not on the project
 * team open it. They must be able to read it; they must not be able to change
 * the schedule, tick an activity as Done, or hand the link on with edits of
 * their own. So the document is READ-ONLY until the project password is
 * entered, and both editing and issuing the share link sit behind that.
 *
 * WHAT THIS IS AND IS NOT
 * ----------------------
 * This is a shared team password held in the client bundle. It stops a viewer
 * from editing the plan by accident or on a whim, and it keeps the Share
 * button out of a viewer's hands. It is NOT authentication: anyone who reads
 * the JavaScript can find the string, and the Firestore rules on this project
 * are open (APP_STATE "Open Items" #2), so the database itself is not
 * protected by it. Real access control means Improvement #8, which is a
 * deliberate open decision because it would force a login on a field app.
 * Recorded here so nobody later mistakes this gate for security.
 *
 * The unlock lives in sessionStorage, not localStorage: closing the tab
 * re-locks the plan. On a borrowed phone or a link forwarded to a colleague
 * that is the behaviour you want; on the owner's own laptop it costs one
 * password entry per session.
 */

/** The project password. */
const MINI_PLAN_PASSWORD = 'EPC1_CPPMech';

const STORAGE_KEY = 'fr_miniplan_unlocked';
const EVENT = 'flashreport:miniplan-lock';

/**
 * The user wrote the password as ":EPC1_CPPMech". A leading colon is almost
 * certainly the punctuation of the sentence it was written in rather than part
 * of the secret, and either spelling is accepted so a genuine holder of the
 * password is never locked out by a stray character. Surrounding whitespace
 * goes the same way - a pasted password very often carries a trailing space.
 */
export function checkMiniPlanPassword(input) {
  const raw = String(input ?? '').trim();
  const cleaned = raw.replace(/^:+/, '').trim();
  return cleaned === MINI_PLAN_PASSWORD;
}

export function isMiniPlanUnlocked() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Private mode / storage blocked. Fail CLOSED: a plan that silently
    // unlocks itself because storage threw is worse than one extra prompt.
    return false;
  }
}

function _emit() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { unlocked: isMiniPlanUnlocked() } }));
}

/** @returns {boolean} true when the password matched and the plan is now open. */
export function unlockMiniPlan(password) {
  if (!checkMiniPlanPassword(password)) return false;
  try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch { /* see isMiniPlanUnlocked */ }
  _emit();
  return true;
}

export function lockMiniPlan() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* nothing to clear */ }
  _emit();
}

/**
 * Subscribe to lock/unlock. Returns an unsubscribe function.
 * Components use this instead of polling so every open table, the header
 * badge and the Share button flip together.
 */
export function onMiniPlanLockChange(fn) {
  if (typeof window === 'undefined') return () => {};
  const handler = (e) => fn(Boolean(e.detail?.unlocked));
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
