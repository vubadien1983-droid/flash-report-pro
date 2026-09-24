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
  sharedDoc, sharedPhotoDoc, reportDoc, reportPhotoDoc,
  photoKey,
  getDoc, setDoc, deleteDoc, onSnapshot,
} from './firebase';
import { withTimeout, yieldToBrowser } from './imageCompression';
import { normalizeMiniPlanItems } from './miniPlan';
import { mergeMiniPlanItems, samePlan } from './miniPlanMerge';

const READ_TIMEOUT_MS = 30_000;
const WRITE_TIMEOUT_MS = 45_000;
const PHOTO_TIMEOUT_MS = 25_000;

/**
 * Bytes this DEVICE has produced, kept for the life of the page.
 *
 * A photo pasted through the link is held here the moment it is pasted, so the
 * thumbnail keeps showing the picture even though the copy written to the
 * shared document is only a pointer. Without it the next snapshot replaced the
 * picture with a spinner that never stopped — the bytes existed nowhere the
 * viewer could look (BUG-030).
 */
const localBytes = new Map();          // `${shareId}|${ref}` -> data URL
const uploaded = new Set();            // `${shareId}|${ref}|${bytes}` written this session
/**
 * What the CLOUD already holds, `${shareId}|${ref}` -> byte length.
 *
 * Photos live as base64 in their own documents, so a photo READ BACK from the
 * cloud arrives as a `data:` url — indistinguishable from one just pasted.
 * Every save therefore re-uploaded EVERY picture in the plan: dozens of
 * documents written for an edit that touched none of them, which is what made
 * saving through the link crawl (BUG-040).
 */
const remoteBytes = new Map();

export function rememberLocalPhoto(shareId, ref, url) {
  if (shareId && ref && url) localBytes.set(`${shareId}|${ref}`, url);
}
export function localPhoto(shareId, ref) {
  return localBytes.get(`${shareId}|${ref}`) || '';
}

/** The pointer a photo is stored under, whatever shape it arrives in. */
/** Put this device's own bytes back into a list of stripped rows. */
export function hydrateWithLocalPhotos(shareId, items) {
  return (items || []).map((item) => ({
    ...item,
    photos: (item?.photos || []).map((p, i) => {
      if (!p || p.url) return p;
      const url = localPhoto(shareId, p.photo_ref || photoKey(item?.id || 'item', p.slot_index ?? i));
      return url ? { ...p, url } : p;
    }),
  }));
}

/**
 * Delete a photo's BYTES from both copies.
 *
 * Removing the pointer from the plan is what the user sees; without this the
 * picture stays in the database for ever, and a device that still holds the
 * old plan can put the pointer back and resurrect it. Failure is logged and
 * never blocks the screen: the pointer is already gone.
 */
export async function deletePhotoBytes(shareId, sourceReportId, ref) {
  if (!isFirebaseConfigured || !ref) return { shared: false, source: false };
  const out = { shared: false, source: false };
  localBytes.delete(`${shareId}|${ref}`);
  remoteBytes.delete(`${shareId}|${ref}`);
  for (const key of [...uploaded]) if (key.startsWith(`${shareId}|${ref}|`)) uploaded.delete(key);

  if (shareId) {
    try { await deleteDoc(sharedPhotoDoc(shareId, ref)); out.shared = true; }
    catch (e) { console.warn('Shared photo not deleted:', e.message); }
  }
  if (sourceReportId) {
    try { await deleteDoc(reportPhotoDoc(sourceReportId, ref)); out.source = true; }
    catch (e) { console.warn('Report photo not deleted:', e.message); }
  }
  return out;
}

export function refOf(item, photo, index) {
  return photo?.photo_ref || photoKey(item?.id || 'item', photo?.slot_index ?? index);
}

/**
 * Write the bytes of every photo that is still inline, to BOTH copies.
 *
 * Photos go first, exactly as in the app's own save path: the parent document
 * only ever stores pointers, so writing it while the bytes are missing is what
 * leaves a viewer looking at a spinner (BUG-012, and again as BUG-030 on the
 * share link, where photos were never written at all).
 */
async function pushPhotoBytes(shareId, sourceReportId, items) {
  let written = 0;
  let failed = 0;

  for (const item of items || []) {
    const photos = Array.isArray(item?.photos) ? item.photos : [];
    for (const [i, p] of photos.entries()) {
      if (!p || !p.url || !p.url.startsWith('data:')) continue;
      const ref = refOf(item, p, i);
      rememberLocalPhoto(shareId, ref, p.url);

      const stamp = `${shareId}|${ref}|${p.url.length}`;
      if (uploaded.has(stamp)) continue;
      // Already in the cloud, byte for byte: nothing to write.
      if (remoteBytes.get(`${shareId}|${ref}`) === p.url.length) continue;

      const row = {
        url: p.url,
        filename: p.filename || '',
        slot_index: p.slot_index ?? i,
        item_id: item.id || '',
        updated_at: new Date().toISOString(),
      };
      try {
        await withTimeout(setDoc(sharedPhotoDoc(shareId, ref), row), PHOTO_TIMEOUT_MS, 'Saving photo');
        written += 1;
        uploaded.add(stamp);
        remoteBytes.set(`${shareId}|${ref}`, p.url.length);
        if (sourceReportId) {
          // Best effort: the author's own copy. A failure here costs nobody
          // the picture — the shared copy already has it.
          try {
            await withTimeout(setDoc(reportPhotoDoc(sourceReportId, ref), row), PHOTO_TIMEOUT_MS, 'Saving photo to the report');
          } catch (e) { console.warn('Photo not copied to the source report:', e.message); }
        }
      } catch (e) {
        failed += 1;
        console.warn(`Photo ${ref} not saved:`, e.message);
      }
      await yieldToBrowser();
    }
  }
  return { written, failed };
}

/**
 * Reduce items to what may be written into a PARENT document: every photo
 * becomes a pointer with no bytes.
 *
 * This is the guard that lets a public viewer edit at all. The viewer holds
 * fully hydrated photos in memory; writing those items back verbatim would
 * push megabytes of base64 into a document that caps at 1 MiB and would fail
 * — or worse, partially succeed on a smaller plan and quietly bloat it.
 */
/**
 * Drop every undefined value, at any depth.
 *
 * Firestore rejects a WHOLE document that contains one undefined field, and
 * the message names the document, not the field — so one stray key silently
 * stops every save for that plan (BUG-041). This is the last gate before a
 * write: whatever produced the value, it does not leave here.
 */
export function withoutUndefined(value) {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[k] = withoutUndefined(v);
    }
    return out;
  }
  return value;
}

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
function applyCache(items, cache, shareId = '', missing = null) {
  return (items || []).map((item) => ({
    ...item,
    photos: (item?.photos || []).map((p) => {
      if (!p || p.url || !p.photo_ref) return p;
      // Anything this device pasted is served from memory even before the
      // upload lands, so a fresh photo is never shown as a spinner.
      const stored = cache.get(p.photo_ref) || localPhoto(shareId, p.photo_ref);
      if (stored) return { ...p, url: stored };
      // Read, and there is no such photo document: the slot is broken, not
      // loading. Marked so the cell can offer to delete it (BUG-036).
      if (missing && missing.has(p.photo_ref)) return { ...p, photo_missing: true };
      // No `url: ''` fallback here on purpose — see the BUG-012 note above.
      return p;
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
export function subscribeSharedMiniPlan(shareId, onData, onError, opts = {}) {
  // The OPS Findings live link reuses this listener with its own normaliser
  // (services/opsFindingsLive.js), so the photo cache and the "already in the
  // cloud" byte map are shared by both reports.
  const normalizeRows = typeof opts.normalize === 'function' ? opts.normalize : normalizeMiniPlanItems;
  // A silent no-op here is what left the share link on "Connecting to the
  // live plan…" for ever: no data, no error, nothing to act on (BUG-037).
  // Whatever the reason, SAY it.
  if (!isFirebaseConfigured) {
    if (onError) setTimeout(() => onError(new Error('Cloud is not configured for this build.')), 0);
    return () => {};
  }
  if (!shareId) {
    if (onError) setTimeout(() => onError(new Error('This link has no plan id.')), 0);
    return () => {};
  }

  const cache = new Map();   // photo_ref -> base64 url
  const missing = new Set();  // photo_ref that HAS been read and does not exist
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

      // Firestore SWALLOWS an exception thrown by a snapshot callback, so a
      // failure in here showed up as a page that never finished loading.
      let items;
      let base;
      try {
        items = normalizeRows(data.items || []);
        base = { ...data, id: shareId, share_id: shareId, items };
        // Emit at once with whatever is already cached, so a status change
        // appears immediately instead of waiting on photo reads.
        onData({ ...base, items: applyCache(items, cache, shareId, missing) });
      } catch (e) {
        console.error('Shared plan could not be read:', e);
        if (onError) onError(new Error(`The plan could not be read: ${e.message}`));
        return;
      }

      // Then fetch only the photo documents never seen before.
      // NAME THIS ANYTHING BUT `missing`. It used to be called that, which
      // re-declared the outer `missing` Set INSIDE this same block — so the
      // `applyCache(..., missing)` call a few lines above sat in the temporal
      // dead zone and threw "Cannot access 'missing' before initialization"
      // on the very first snapshot, killing the share link (BUG-031). The two
      // are different things: this is the fetch QUEUE, `missing` is the set of
      // refs already read and known not to exist.
      const needed = collectRefs(items);
      const toFetch = [...needed].filter((k) => !cache.has(k));

      for (const key of toFetch) {
        if (stopped || gen !== generation) return;   // a newer snapshot took over
        try {
          const psnap = await withTimeout(
            getDoc(sharedPhotoDoc(shareId, key)), READ_TIMEOUT_MS, 'Loading shared photo'
          );
          const url = psnap.exists() ? (psnap.data()?.url || '') : '';
          if (url) {
            cache.set(key, url);
            missing.delete(key);
            // These bytes are already stored: never send them back (BUG-040).
            remoteBytes.set(`${shareId}|${key}`, url.length);
          }
          else if (!localPhoto(shareId, key)) missing.add(key);
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
      onData({ ...base, items: applyCache(items, cache, shareId, missing) });
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
export async function pushSharedMiniPlanEdit(shareId, sourceReportId, items, options = {}) {
  if (!isFirebaseConfigured) throw new Error('Cloud is not configured.');
  if (!shareId) throw new Error('Missing share id.');

  const {
    base = null, extra = {},
    // OPS Findings: its own row normaliser, merge options and compare fields.
    normalize = normalizeMiniPlanItems, mergeOpts = undefined, compareFields = undefined,
    ...rest
  } = options;
  const meta = { ...rest, ...extra };

  // 1. BYTES FIRST. The documents below hold pointers only.
  const photos = await pushPhotoBytes(shareId, sourceReportId, items);

  // 2. Merge with whatever the cloud holds right now, instead of overwriting
  //    it. Another device may have saved between our last snapshot and this
  //    write; a plain write would erase that work (BUG-031).
  let toWrite = withoutUndefined(stripPhotosToRefs(items));
  let mergeStats = null;
  let cloudItems = null;
  try {
    const snap = await withTimeout(getDoc(sharedDoc(shareId)), READ_TIMEOUT_MS, 'Reading the shared plan');
    if (snap.exists()) {
      const theirs = normalize(snap.data()?.items || []);
      cloudItems = theirs;
      const merged = mergeMiniPlanItems(
        base ? stripPhotosToRefs(base) : theirs,   // no base: treat theirs as the base
        toWrite,
        theirs,
        mergeOpts,
      );
      toWrite = withoutUndefined(merged.items);
      mergeStats = merged.stats;
    }
  } catch (e) {
    // If the read fails we still save. Writing our own copy is worse than a
    // merge and better than losing the edit.
    console.warn('Merge skipped, writing this device\'s copy:', e.message);
  }

  // Nothing to say? Then say nothing. Writing the same rows back costs the
  // phone a full upload of the plan for no reason at all.
  if (!photos.written && cloudItems && samePlan(cloudItems, toWrite, compareFields)) {
    return { shared: true, source: true, items: toWrite, photos, merge: mergeStats, skipped: true };
  }

  const updated_at = new Date().toISOString();
  const result = { shared: false, source: false, items: toWrite, photos, merge: mergeStats };

  await withTimeout(
    setDoc(sharedDoc(shareId), { ...meta, items: toWrite, updated_at }, { merge: true }),
    WRITE_TIMEOUT_MS,
    'Saving to the shared plan'
  );
  result.shared = true;

  if (sourceReportId) {
    try {
      await withTimeout(
        setDoc(reportDoc(sourceReportId), { ...meta, items: toWrite, updated_at }, { merge: true }),
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

