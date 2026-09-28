/**
 * Edit lock of the Preservation Findings SHARE LINK (user decision,
 * 2026-09-28): anyone with the link can READ it — both tabs, search, filters,
 * Excel / PDF — and ONE team password unlocks editing, adding findings and
 * uploading pictures / files there. The app itself has no lock (the owner's
 * app, the same rule as OPS Findings v3.20.4).
 *
 * The repository is PUBLIC, so the password is stored as a SALTED SHA-256
 * digest, never as text (BUG-030). To change it: hash SALT + newPassword and
 * paste the digest below. Never write the password itself into this file, a
 * comment or a commit message.
 *
 * Like the other locks this is a UI lock for a shared team password, not
 * authentication: the Firestore rules are open (APP_STATE Open Item #2).
 * The unlock lives in sessionStorage — closing the tab locks again — and
 * storage that throws fails CLOSED.
 */

import { sha256Hex, digestsEqual } from './sha256';

const SALT = 'preservation-2026|40f318beb99367f9|';
const DIGEST = 'c5dc3dcb6163f80795a0972a65a8f93fb73551b7b73feb2564ece54ac4ed2e92';

const STORAGE_KEY = 'fr_pf_unlocked';
const EVENT = 'flashreport:pf-lock';

function clean(input) {
  return String(input ?? '')
    .trim()
    .replace(/^[:\s]+/, '')
    .replace(/^["'‘’“”]+|["'‘’“”]+$/g, '')
    .trim();
}

export function checkPfPassword(input) {
  const c = clean(input);
  return Boolean(c) && digestsEqual(sha256Hex(SALT + c), DIGEST);
}

export function isPfUnlocked() {
  try { return sessionStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

function emit() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT));
}

/** @returns {boolean} true when the password was right and editing is now open. */
export function unlockPf(input) {
  if (!checkPfPassword(input)) return false;
  try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch { /* fails closed */ }
  emit();
  return true;
}

export function lockPf() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* nothing to clear */ }
  emit();
}

export function onPfLockChange(fn) {
  if (typeof window === 'undefined') return () => {};
  const h = () => fn(isPfUnlocked());
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
