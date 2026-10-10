/**
 * The EDITABLE share link of a Flash Report (v3.37.0).
 *
 * A Flash Report now has two links:
 *
 *   1. the VIEW-ONLY link   #/view/<shareId>            (as before: a read-only
 *      page that shows the latest published copy, exports Excel / PDF);
 *   2. the EDIT link        #/view/<shareId>?edit=1     (live, opens behind a
 *      password; rows, photos and files can be edited and are merged into the
 *      report and into the view-only copy).
 *
 * WHERE THE PASSWORD LIVES - read before changing
 * ------------------------------------------------
 * - `report.edit_password` (plain text) lives on the REPORT only, so the owner
 *   can show it again in the app behind the eye button, on any device.
 * - The shared copy (`shared_reports/<id>`), which every link holder can read,
 *   carries only a SALTED SHA-256 digest: `edit_pw_salt` + `edit_pw_hash`.
 *   The page checks what is typed against that digest. The plain password is
 *   never written into a document a link holder reads from.
 * - NEVER put a password in the repository, a comment or a commit message
 *   (BUG-030): the repository is public.
 *
 * This is not authentication. The check runs in the browser and the Firestore
 * rules of this project are open (APP_STATE Open Item #2). It stops a person
 * who has the link from editing by accident or on a whim.
 */

import { sha256Hex, digestsEqual } from './sha256';

export const FLASH_MERGE_FIELDS = ['tag', 'description', 'note'];

/** Merge rules for a Flash Report's rows (see services/miniPlanMerge.js). */
export const FLASH_MERGE_OPTS = {
  fields: FLASH_MERGE_FIELDS, regroup: false, threeWayPhotos: true, preferMineOrder: true,
};

export const MIN_EDIT_PASSWORD = 4;
const MIN_SLOTS = 4;

/**
 * A Flash Report row holds its pictures POSITIONALLY: `photos[slot]`, with
 * `null` in the empty slots, and the table, the exports and the app all read
 * it that way. The three-way merge works by slot NUMBER and returns a compact
 * list, which would slide a picture into the wrong column. This puts every
 * photo back at the index its `slot_index` names (and stamps the index on any
 * photo that lacks one), always leaving at least four slots.
 */
export function placeBySlot(items) {
  return (Array.isArray(items) ? items : []).map((item) => {
    if (!item || !Array.isArray(item.photos)) return item;
    const placed = [];
    item.photos.forEach((p, i) => {
      if (!p) return;
      const slot = Number.isInteger(p.slot_index) && p.slot_index >= 0 ? p.slot_index : i;
      placed.push([slot, p.slot_index === slot ? p : { ...p, slot_index: slot }]);
    });
    const length = Math.max(MIN_SLOTS, ...placed.map(([s]) => s + 1));
    const photos = Array.from({ length }, () => null);
    placed.forEach(([slot, p]) => { photos[slot] = p; });
    return { ...item, photos };
  });
}

/** Row normaliser for the live listener and the merge (never throws). */
export function normalizeFlashItems(items) {
  try { return placeBySlot(items); } catch { return Array.isArray(items) ? items : []; }
}

// ── password ────────────────────────────────────────────────────────────────

function randomBytes(n) {
  const out = new Uint8Array(n);
  try { crypto.getRandomValues(out); } catch { for (let i = 0; i < n; i += 1) out[i] = Math.floor(Math.random() * 256); }
  return out;
}

export function newEditSalt() {
  return Array.from(randomBytes(12), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** An easy-to-read password: no 0/O, 1/I/L. Eight characters. */
export function generateEditPassword() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join('');
}

export function hashEditPassword(salt, password) {
  return sha256Hex(`${salt}:${String(password ?? '').trim()}`);
}

export function isValidEditPassword(password) {
  return String(password ?? '').trim().length >= MIN_EDIT_PASSWORD;
}

export function checkEditPassword(input, salt, hash) {
  if (!salt || !hash) return false;
  const pw = String(input ?? '').trim();
  if (!pw) return false;
  return digestsEqual(hashEditPassword(salt, pw), hash);
}

/** True when the report has an editable link switched on. */
export function hasEditLink(report) {
  return Boolean(report && report.edit_password && report.edit_salt);
}

/** The two fields a published copy carries for the password check. */
export function editFieldsForShare(report) {
  if (!hasEditLink(report)) return {};
  return { edit_pw_salt: report.edit_salt, edit_pw_hash: hashEditPassword(report.edit_salt, report.edit_password) };
}

/** `…#/view/<id>` -> `…#/view/<id>?edit=1` */
export function editUrlFor(viewUrl) {
  return viewUrl ? `${String(viewUrl).split('?')[0]}?edit=1` : '';
}

export function isEditRequested() {
  const text = `${window.location.hash || ''}${window.location.search || ''}`;
  return /[?&]edit=(1|true)\b/.test(text);
}

// ── unlock (per browser tab, per link) ──────────────────────────────────────

const STORAGE_KEY = 'fr_flash_edit_unlocked';

function readSet() {
  try {
    const list = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
    return new Set(Array.isArray(list) ? list : []);
  } catch { return new Set(); }
}

export function isFlashEditUnlocked(shareId) {
  return Boolean(shareId) && readSet().has(shareId);
}

export function unlockFlashEdit(shareId) {
  const set = readSet();
  set.add(shareId);
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...set])); } catch { /* fails closed: it just stays locked */ }
}

export function lockFlashEdit(shareId) {
  const set = readSet();
  set.delete(shareId);
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...set])); } catch { /* nothing to clear */ }
}
