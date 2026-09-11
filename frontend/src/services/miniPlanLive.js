/**
 * LIVE share link for the CPP Mechanical Mini Plan.
 *
 * A Flash Report share link is a SNAPSHOT that the author refreshes by saving
 * (`republishIfShared`). A Mini Plan is a working schedule that a site team
 * watches all day, so its link is LIVE: the public viewer holds a Firestore
 * `onSnapshot` on `shared_reports/{shareId}` and the table re-colours itself
 * the moment anyone changes a status — no reload, no re-sent link.
 *
 * TWO THINGS THIS FILE IS CAREFUL ABOUT
 * ------------------------------------
 *
 * 1. PHOTOS ARE FETCHED ONCE, NOT ON EVERY SNAPSHOT.
 *    The shared document stores `photo_ref` POINTERS; the bytes live in
 *    `shared_reports/{shareId}/photos/{key}`. A plan with sixty photos would
 *    otherwise re-download several megabytes every time somebody ticked a
 *    checkbox. `_PhotoCache` keeps what it has already read, and each snapshot
 *    fetches only the keys it has never seen. A key that disappears from the
 *    document is dropped from the cache so the memory does not grow forever.
 *
 * 2. AN UNRESOLVED POINTER IS NEVER RENDERED AS "NO PHOTO".
 *    ERROR_LOG BUG-012: a hydration function must not invent a value for a
 *    reference it could not resolve. A photo whose document has not arrived
 *    keeps `url: ''` AND its `photo_ref`, and PhotoGalleryCell draws that as a
 *    spinner. Blanking it would make a transient read look like a deletion —
 *    and, in the edit path below, would then WRITE that deletion back.
 *
 * WRITE PATH (an unlocked viewer editing through the link)
 * -------------------------------------------------------
 * Edits go to BOTH copies: `shared_reports/{shareId}` so every other viewer
 * sees them immediately, and `reports/{sourceReportId}` so the author's app
 * picks them up through its own realtime listener and keeps them on the next
 * save. Text, dates, status, notes and row structure travel this way; PHOTOS
 * DO NOT — the items are stripped back to pointers before either write, so a
 * hydrated base64 image can never be inlined into a parent document (that is
 * BUG-005, the 1 MiB document ceiling) and no photo document is ever touched
 * from the public side.
 */

import {
  isFirebaseConfigured,
  sharedDoc, sharedPhotoDoc, reportDoc,
  photoKey,
  getDoc, setDoc, onSnapshot,
} from './firebase';
import { withTimeout, yieldToBrowser } from './imageCompression';
import { normalizeMiniPlanItems } from './miniPlan';

const READ_TIMEOUT_MS = 30_000;
const WRITE_TIMEOUT_MS = 45_000;

/**
 * Reduce items to what may be written into a PARENT document: every photo
 * becomes a pointer with no bytes.
 *
 * This is the guard that lets a public viewer edit at all. The viewer holds
 * fully hydrated photos in memory; writing those items back verbatim would
 * push megabytes of base64 into a document that caps at 1 MiB and would fail
 * — or worse, partially succeed on a smaller plan and quietly bloat it.
 */
export function stripPhotosToRefs(items) {
  return (items || []).map((item, itemIdx) => {
    const itemId = item?.id || `item_${itemIdx}`;
    const photos = Array.isArray(item?.photos) ? item.photos : [];

    return {
      ...item,
      photos: photos.map((p, pIdx) => {
        if (!p) return null;
        if (p.kind === 'file') return p;                 // attachment descriptor, no bytes
        const slot = p.slot_index ?? pIdx;
        const ref = p.photo_ref || photoKey(itemId, slot);
        if (p.url && !p.url.startsWith('data:')) {
          // Already a hosted URL — pass it through untouched.
          return { id: p.id, filename: p.filename, slot_index: slot, url: p.url };
        }
        return { id: p.id, filename: p.filename, slot_index: slot, url: '', photo_ref: ref };
      }),
    };
  });
}

/** Collect every photo_ref a document points at. */
function collectRefs(items) {
  const keys = new Set();
  for (const item of items || []) {
    for (const p of item?.photos || []) {
      if (p && !p.url && p.photo_ref) keys.add(p.photo_ref);
    }
  }
  return keys;
}

/** Splice cached bytes into the items, leaving unresolved pointers intact. */
function applyCache(items, cache) {
  return (items || []).map((item) => ({
    ...item,
    photos: (item?.photos || []).map((p) => {
      if (!p || p.url || !p.photo_ref) return p;
      const stored = cache.get(p.photo_ref);
      // No `url: ''` fallback here on purpose — see the BUG-012 note above.
      return stored ? { ...p, url: stored } : p;
    }),
  }));
}

/**
 * Watch a shared Mini Plan.
 *
 * @param {string} shareId
 * @param {(report:object)=>void} onData   called on every change, photos hydrated
 * @param {(err:Error)=>void}    [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeSharedMiniPlan(shareId, onData, onError) {
  if (!isFirebaseConfigured || !shareId) return () => {};

  const cache = new Map();   // photo_ref -> base64 url
  let stopped = false;
  let generation = 0;

  const unsub = onSnapshot(
    sharedDoc(shareId),
    { includeMetadataChanges: false },
    async (snap) => {
      if (stopped) return;

      if (!snap.exists()) {
        if (onError) onError(new Error('Report not found'));
        return;
      }

      const gen = ++generation;
      const data = snap.data() || {};
      const items = normalizeMiniPlanItems(data.items || []);
      const base = { ...data, id: shareId, share_id: shareId, items };

      // Emit at once with whatever is already cached, so a status change
      // appears immediately instead of waiting on photo reads.
      onData({ ...base, items: applyCache(items, cache) });

      // Then fetch only the photo documents never seen before.
      const needed = collectRefs(items);
      const missing = [...needed].filter((k) => !cache.has(k));

      for (const key of missing) {
        if (stopped || gen !== generation) return;   // a newer snapshot took over
        try {
          const psnap = await withTimeout(
            getDoc(sharedPhotoDoc(shareId, key)), READ_TIMEOUT_MS, 'Loading shared photo'
          );
          const url = psnap.exists() ? (psnap.data()?.url || '') : '';
          if (url) cache.set(key, url);
        } catch (e) {
          // Leave it uncached: the next snapshot retries, and until then the
          // cell shows "loading" rather than claiming there is no photo.
          console.warn(`Shared photo ${key} not read:`, e.message);
        }
        await yieldToBrowser();
      }

      // Drop bytes for photos the plan no longer references.
      for (const key of [...cache.keys()]) {
        if (!needed.has(key)) cache.delete(key);
      }

      if (stopped || gen !== generation) return;
      onData({ ...base, items: applyCache(items, cache) });
    },
    (err) => {
      console.warn('Live share listener error:', err.message);
      if (onError) onError(err);
    }
  );

  return () => { stopped = true; cache.clear(); unsub(); };
}

/**
 * Write an edit made through the live link.
 *
 * Both copies are updated. The SHARED copy goes first because that is what
 * every other viewer is watching; the source report follows so the author's
 * app converges. A failure on the source write is reported but does not undo
 * the shared write — the two are reconciled by the author's next save, and
 * losing the edit entirely would be worse than a brief divergence.
 *
 * @returns {Promise<{shared:boolean, source:boolean}>}
 */
export async function pushSharedMiniPlanEdit(shareId, sourceReportId, items, extra = {}) {
  if (!isFirebaseConfigured) throw new Error('Cloud is not configured.');
  if (!shareId) throw new Error('Missing share id.');

  const safeItems = stripPhotosToRefs(items);
  const updated_at = new Date().toISOString();
  const result = { shared: false, source: false };

  await withTimeout(
    setDoc(sharedDoc(shareId), { ...extra, items: safeItems, updated_at }, { merge: true }),
    WRITE_TIMEOUT_MS,
    'Saving to the shared plan'
  );
  result.shared = true;

  if (sourceReportId) {
    try {
      await withTimeout(
        setDoc(reportDoc(sourceReportId), { ...extra, items: safeItems, updated_at }, { merge: true }),
        WRITE_TIMEOUT_MS,
        'Saving to the source report'
      );
      result.source = true;
    } catch (e) {
      console.warn('Source report not updated from the live link:', e.message);
    }
  }

  return result;
}
