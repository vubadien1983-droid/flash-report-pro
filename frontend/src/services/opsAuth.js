/**
 * Edit locks of the OPS Findings SHARE LINK — a master password for every tab
 * (v3.20.4) plus one password per section tab. The app itself has NO lock:
 * it is the owner's app (user decision, v3.20.4).
 *
 * The Summary tab has no password (it cannot edit anything). Every section
 * tab is read-only until its own password is entered, in the app and on the
 * live share link alike — the Mini Plan's model, one lock per section.
 *
 * The repository is PUBLIC, so the passwords are stored as SALTED SHA-256
 * digests, never as text (BUG-030). A digest exists for every letter A–Z, so
 * a section added later (E, F, …) is lockable without a code change.
 *
 * Like the Mini Plan's lock this is a UI lock for a shared team password, not
 * authentication: the Firestore rules are open (APP_STATE Open Item #2).
 * Unlocks live in sessionStorage — closing the tab locks everything again,
 * and storage that throws fails CLOSED.
 */

import { sha256Hex, digestsEqual } from './sha256';

const SALT = 'ops-findings-2026|5658bbe46d34d29c|';
const DIGESTS = {
  A: '4533f1a87749d4ae4e8293d842ef43e31c0fe966672a93ee5b0e36e8bab4e75c',
  B: 'b1bd20b9b7a997a27e625bd7714baf2a54b9430cd795e4c816519f40d7f773f3',
  C: 'f6d9fabc79cea9e5f3fade2f3bddb1acfe17a8d4ed1cdb69f0fb55d2e5668b22',
  D: '0d6b66ce4e6298dbf656a4da621e38b0d25d28d95b930b69d0ab2671e3aa5242',
  E: '51abb3cacaa0c5cce6269ca03efd7380ae2923e2d78c393722d815a79d90634e',
  F: '4abf9248fcfdc468beee76a193aedc7b1da12d6e802e78c58d28a28221bc41bf',
  G: '79eb8cb2073575edf15ad4f8d9fbfb19a3976a52719de31679d1ba05ea0d7bf2',
  H: 'f6d4cccd55e0faa36d397f0c257373c0f1c8d3cf74306aa878cf94f4e409475d',
  I: '06408b92cee77fcad90acbf3f75bcba940f8f8571bd3d56271e26dd2b66c58dc',
  J: '8d3af3af685519de842e88634bd85a4eb117323844b50686c886537b1ace1395',
  K: 'b2cb001fe9aa59c8742f3f9803740b2575e4f5c9c86573605cbee9b674bda407',
  L: '01bfe957458f3c6c4945a6024ff9df497d10776115fab338257d5f3bc7c7da20',
  M: 'cc79092dcae3f688e5678b862594d4d687180cb7217cd34199cc833ff7c7606c',
  N: '0de4c65c9a781b48c4b40b1f5e61c6beb5d6c768fec35a9df51d2aac5d2f1dfa',
  O: 'c45de40f8f03d6ec3a267f20a5dd36e6d0c29edd271a190d3ad724617329a13f',
  P: '1a7f6c6571e1a5f2304479cdddad2c57815a557bc33eafb6249981b15ad3d588',
  Q: '2e75a48377e92bb2f3e371d7866442d1569b28738e2bb83e6f4142d9989844e4',
  R: '492a19001db55a1949b4fa502de566fd561ce45062fc5975de383490d3fc41b6',
  S: '4ef6aa113420a18d464242b8de09d2df7196210c835de13915919e2773d45179',
  T: 'fc1135c008870047a26e7a0db4f0053454bbb21c2b5a0b3bb5c2d5e8bc584ecd',
  U: '1e61aa0c900200c98088bf8809100755f74fc1886d3d949ef708064c44e3b8a4',
  V: '4dc209c260ad5fe6598122d3517ed11cdd36ab64d3381688e7d3b7bb5f538c42',
  W: 'bb7931bdf257608348030b045da137b416fd7c382f43500b3abac82854f6b2b3',
  X: '0db9068f0de686601ed59c48835c2585b7865d35413b50f17167e3cd122b5dfe',
  Y: 'f72af8ea9974cedae92492abefbcd7d21140f6afb21a088cca4dd2ae3d2041c1',
  Z: '8fefff7f70457ce22f9d02ef33de29f79bc089e56d3b75d7cf88e78f10fe9fbd',
};

// MASTER password (v3.20.4): opens EVERY section tab of the share link at once.
const MASTER_DIGEST = 'd829ab110fe081e728ff2a685fc945c51fe7e6df1b686a4439560af0ae2c90f6';
const ALL = '*';

const STORAGE_KEY = 'fr_ops_unlocked';
const EVENT = 'flashreport:ops-lock';

/** The section letter a title starts with: "B. Findings from E&I Team" → "B". */
export function sectionLetter(section) {
  const m = /^\s*([A-Za-z])\s*[.)\-:]/.exec(String(section || ''));
  return m ? m[1].toUpperCase() : '';
}

function clean(input) {
  return String(input ?? '')
    .trim()
    .replace(/^[:\s]+/, '')
    .replace(/^["'‘’“”]+|["'‘’“”]+$/g, '')
    .trim();
}

export function checkOpsPassword(letter, input) {
  const L = String(letter || '').toUpperCase();
  const want = DIGESTS[L];
  const cleaned = clean(input);
  if (!want || !cleaned) return false;
  return digestsEqual(sha256Hex(SALT + cleaned), want);
}

function readSet() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}
function writeSet(set) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...set])); } catch { /* fails closed */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT));
}

export function checkOpsMasterPassword(input) {
  const cleaned = clean(input);
  return Boolean(cleaned) && digestsEqual(sha256Hex(SALT + cleaned), MASTER_DIGEST);
}

export function isOpsSectionUnlocked(letter) {
  const set = readSet();
  return set.has(ALL) || (Boolean(letter) && set.has(String(letter).toUpperCase()));
}

export function unlockedOpsSections() {
  return [...readSet()];
}

/** @returns {boolean} true when the password was right and the tab is now open. */
export function unlockOpsSection(letter, input) {
  // The master password opens every tab; a section password opens its own.
  if (checkOpsMasterPassword(input)) { const s = readSet(); s.add(ALL); writeSet(s); return true; }
  if (!checkOpsPassword(letter, input)) return false;
  const set = readSet();
  set.add(String(letter).toUpperCase());
  writeSet(set);
  return true;
}

export function lockOpsSection(letter) {
  const set = readSet();
  set.delete(String(letter || '').toUpperCase());
  set.delete(ALL);           // "Lock" after a master unlock locks the tabs again
  writeSet(set);
}

export function lockAllOpsSections() { writeSet(new Set()); }

export function onOpsLockChange(fn) {
  if (typeof window === 'undefined') return () => {};
  const h = () => fn(unlockedOpsSections());
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
