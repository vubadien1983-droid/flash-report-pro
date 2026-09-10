/**
 * Share Service v3.0 — Firestore-backed public share links.
 *
 * Previous versions posted the report to a Vercel serverless function and
 * fell back to dpaste.com. Both were unreliable: the serverless route was
 * removed and dpaste expires pastes, which is why existing links render
 * "Report Not Found".
 *
 * Reports are now published to the `shared_reports` collection, which the
 * Firestore rules expose as world-readable. That gives us:
 *   - recipients open the link with no sign-in
 *   - the link keeps working indefinitely
 *   - re-publishing the same report overwrites in place, so a shared link
 *     always serves the latest data (see republishIfShared)
 *
 * Photos go in a `photos` subcollection, one document per image, so each
 * stays under the 1 MiB Firestore document ceiling — no Firebase Storage
 * (and therefore no Blaze plan) required.
 */

import { getLocalReport, saveLocalReport } from './clientStorage';
import {
  isFirebaseConfigured,
  sharedDoc, sharedPhotosCollection, sharedPhotoDoc,
  photoKey,
  getDoc, getDocs, setDoc,
} from './firebase';
import {
  compressDataUrl, photoFingerprint, withTimeout, yieldToBrowser,
} from './imageCompression';
import { collectAttachments, copyAttachmentToShare } from './fileAttachments';

/** Leaves headroom under the 1 MiB per-document limit. */
const PHOTO_MAX_BYTES = 900_000;

/** Short, URL-friendly, collision-resistant share id. */
function makeShareId() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

const READ_TIMEOUT_MS = 30_000;
const WRITE_TIMEOUT_MS = 45_000;

/**
 * Fingerprints of photos already published under a given share id, so a
 * re-publish only sends what changed.
 *
 * This is the single biggest reason share links used to hang. The old code
 * pushed EVERY photo through a `<canvas>` decode-and-re-encode on the main
 * thread each time — including on `republishIfShared`, which runs after every
 * save. Eight multi-megabyte images recompressed on every autosave is not a
 * slow network, it is a blocked browser.
 */
function _shareHashKey(shareId) { return `fr_sharehash_${shareId}`; }

function _readShareHashes(shareId) {
  try { return JSON.parse(localStorage.getItem(_shareHashKey(shareId)) || '{}'); }
  catch { return {}; }
}

function _writeShareHashes(shareId, map) {
  try { localStorage.setItem(_shareHashKey(shareId), JSON.stringify(map)); }
  catch { /* private mode — we only lose the skip optimisation */ }
}

function _emitProgress(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('flashreport:upload-progress', { detail }));
}

/**
 * Photos are compressed once, at ingest, so by the time they reach here they
 * already fit. This only has to rescue images stored before that change, and
 * it is bounded by a timeout so it can never hang the publish.
 */
async function compressPhotoForShare(url) {
  if (!url) return null;
  if (url.length <= PHOTO_MAX_BYTES) return url;
  return compressDataUrl(url, { maxBytes: PHOTO_MAX_BYTES });
}

/**
 * Publish (or re-publish) a report to the public `shared_reports`
 * collection and return its share URL.
 *
 * Re-publishing reuses the report's existing share id, so a link that has
 * already been sent out picks up the new content instead of going stale.
 */
export async function publishReportForSharing(report) {
  if (!isFirebaseConfigured) {
    throw new Error(
      'Cloud sharing is not configured. Add the Firebase environment variables to enable share links.'
    );
  }

  const shareId = report.share_id || report.cloud_code || makeShareId();
  const baseUrl = window.location.origin + window.location.pathname;

  const uploaded = _readShareHashes(shareId);
  const items = report.items || [];
  const photoWrites = [];

  // 1. Split photos out of the main document, keeping the ones that are
  //    already published untouched.
  const sharedItems = [];
  for (const [itemIdx, item] of items.entries()) {
    const itemId = item.id || `item_${itemIdx}`;
    const photos = item.photos || [];
    const refs = [];

    for (const [pIdx, p] of photos.entries()) {
      // A file attachment is not an image: it keeps its descriptor as-is and
      // its bytes are copied separately below.
      if (p && p.kind === 'file') { refs.push(p); continue; }
      if (!p || !p.url) { refs.push(null); continue; }
      const slot = p.slot_index ?? pIdx;
      const key = photoKey(itemId, slot);

      // Already-hosted URLs are passed through untouched.
      if (!p.url.startsWith('data:')) {
        refs.push({ id: p.id, filename: p.filename, slot_index: slot, url: p.url });
        continue;
      }

      const fingerprint = photoFingerprint(p.url);
      const ref = {
        id: p.id,
        filename: p.filename,
        slot_index: slot,
        url: '',
        photo_ref: key,
      };

      if (uploaded[key] === fingerprint) {
        // Unchanged since the last publish — the shared photo document is
        // already correct, so nothing to send.
        refs.push(ref);
        continue;
      }

      const compact = await compressPhotoForShare(p.url);
      if (!compact || compact.length > PHOTO_MAX_BYTES) {
        console.warn(`Photo ${key} too large to share; skipped.`);
        refs.push({ id: p.id, filename: p.filename, slot_index: slot, url: '' });
        continue;
      }

      photoWrites.push({ key, fingerprint, data: { url: compact, slot_index: slot, item_id: itemId } });
      refs.push(ref);
      await yieldToBrowser();
    }

    sharedItems.push({ ...item, photos: refs });
  }

  // 2. Photo documents first, one at a time. The report document stores
  //    pointers, so writing it before the bytes exist would publish a link
  //    that renders empty slots (the same shape of failure as BUG-012).
  //    Sequential writes also mean progress can be shown and an interrupted
  //    publish resumes instead of restarting.
  const total = photoWrites.length;
  if (total > 0) _emitProgress({ reportId: report.id, done: 0, total, phase: 'share' });

  let done = 0;
  for (const { key, fingerprint, data } of photoWrites) {
    await withTimeout(
      setDoc(sharedPhotoDoc(shareId, key), data),
      WRITE_TIMEOUT_MS,
      `Publishing photo ${done + 1} of ${total}`
    );
    uploaded[key] = fingerprint;
    _writeShareHashes(shareId, uploaded);
    done++;
    _emitProgress({ reportId: report.id, done, total, phase: 'share' });
    await yieldToBrowser();
  }

  // 2b. Copy file attachments into the share so the public link resolves
  //     without ever touching the private `reports` collection. Same ordering
  //     rule as the photos: bytes first, then the document that points at them.
  const attachments = collectAttachments(report);
  for (const att of attachments) {
    const stamp = `${att.descriptor.updated_at || ''}_${att.descriptor.size || 0}`;
    if (uploaded[`file:${att.key}`] === stamp) continue; // already published
    try {
      const ok = await copyAttachmentToShare(report.id, shareId, att.key);
      if (ok) {
        uploaded[`file:${att.key}`] = stamp;
        _writeShareHashes(shareId, uploaded);
      }
    } catch (e) {
      console.warn(`Could not publish attachment ${att.key}:`, e.message);
    }
    await yieldToBrowser();
  }

  // 3. Write the report document.
  await withTimeout(setDoc(sharedDoc(shareId), {
    title: report.title || 'Untitled Flash Report',
    system_tag: report.system_tag || '',
    location: report.location || '',
    inspection_date: report.inspection_date || '',
    discipline: report.discipline || 'Mechanical',
    items: sharedItems,
    source_report_id: report.id || '',
    updated_at: new Date().toISOString(),
    created_at: report.created_at || new Date().toISOString(),
  }), WRITE_TIMEOUT_MS, 'Publishing report');

  if (total > 0) _emitProgress({ reportId: report.id, done: total, total, phase: 'done' });

  // 4. Remember the id so future edits republish to the same URL.
  saveLocalReport({ ...report, share_id: shareId, cloud_code: shareId }).catch(() => {});

  return {
    shareId,
    shareUrl: `${baseUrl}#/view/${shareId}`,
  };
}

/**
 * Push the latest content to an already-published share link.
 * No-op for reports that have never been shared, so it is safe to call
 * on every save.
 */
const _republishInFlight = new Set();

export async function republishIfShared(report) {
  if (!isFirebaseConfigured) return;
  const shareId = report?.share_id || report?.cloud_code;
  if (!shareId) return;

  // This runs after every save. Without a guard, a burst of autosaves starts
  // several overlapping publishes of the same report, each re-reading and
  // re-writing the same photos — which is how a single edit could leave the
  // app grinding for a minute.
  if (_republishInFlight.has(shareId)) return;
  _republishInFlight.add(shareId);
  try {
    await publishReportForSharing(report);
  } catch (e) {
    console.warn('Share refresh failed:', e.message);
  } finally {
    _republishInFlight.delete(shareId);
  }
}

/**
 * Fetch a shared report by its share id. Used by the public viewer route;
 * requires no authentication.
 */
export async function fetchSharedReport(shareId) {
  if (!shareId) return null;
  const cleanId = shareId.split('?')[0].split('/')[0].trim();

  if (isFirebaseConfigured) {
    try {
      const snap = await withTimeout(getDoc(sharedDoc(cleanId)), READ_TIMEOUT_MS, 'Loading shared report');
      if (snap.exists()) {
        const report = { id: cleanId, share_id: cleanId, ...snap.data() };
        return await hydrateSharedPhotos(cleanId, report);
      }
    } catch (e) {
      console.warn('Shared report fetch failed:', e.message);
    }
  }

  // Local copy — lets the author preview their own link offline.
  try {
    const local = await getLocalReport(cleanId);
    if (local) return local;
  } catch (e) { /* no local copy */ }

  return null;
}

/** Splice photo documents back into the shared report's items. */
async function hydrateSharedPhotos(shareId, report) {
  if (!report?.items?.length) return report;

  const needs = report.items.some((item) =>
    (item.photos || []).some((p) => p && !p.url && p.photo_ref)
  );
  if (!needs) return report;

  const byKey = new Map();
  try {
    const snap = await withTimeout(
      getDocs(sharedPhotosCollection(shareId)), READ_TIMEOUT_MS, 'Loading shared photos'
    );
    snap.docs.forEach((d) => byKey.set(d.id, d.data()));
  } catch (e) {
    console.warn('Shared photo hydration failed:', e.message);
    return report;
  }

  const items = report.items.map((item) => ({
    ...item,
    photos: (item.photos || []).map((p) => {
      if (!p || p.url) return p;
      const stored = p.photo_ref ? byKey.get(p.photo_ref) : null;
      return stored ? { ...p, url: stored.url } : p;
    }),
  }));

  return { ...report, items };
}
