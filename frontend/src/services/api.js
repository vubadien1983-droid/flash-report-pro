/**
 * API Service v3.0 — Firebase-first with legacy fallback
 *
 * When Firebase is configured (VITE_FIREBASE_* env vars):
 *   → All CRUD goes directly to Firestore (NoSQL document DB)
 *   → Photos upload to Firebase Storage (returns download URL)
 *
 * When Firebase is NOT configured:
 *   → Falls back to legacy Vercel serverless /api/reports (restful-api.dev)
 *   → Photos remain as base64 data URLs
 */

import {
  isFirebaseConfigured,
  reportsCollection, reportDoc,
  reportPhotosCollection, reportPhotoDoc, photoKey,
  getDoc, getDocs, setDoc, deleteDoc, writeBatch,
  query, orderBy, db,
  uploadPhotoToStorage,
  deleteReportPhotos,
  base64ToBlob,
} from './firebase';
import {
  compressDataUrl, photoFingerprint, withTimeout, yieldToBrowser, HARD_MAX_BYTES,
} from './imageCompression';

/**
 * Firestore hard-caps a single document at 1 MiB. A photo is therefore
 * stored in its own document inside the report's `photos` subcollection,
 * and the report document keeps only a lightweight reference.
 *
 * PHOTO_MAX_BYTES leaves headroom for the surrounding document fields.
 */
const PHOTO_MAX_BYTES = HARD_MAX_BYTES;

/**
 * Every Firestore call is bounded. The SDK applies a write to its local cache
 * immediately but only RESOLVES the returned promise once the server has
 * acknowledged it — so on a weak field connection `await setDoc(...)` can stay
 * pending forever. That unsettled promise was reaching the UI as a spinner
 * that never stopped and an app that could not be closed. A timeout here is
 * not data loss: the write stays queued in the SDK and the report stays
 * PENDING, so the offline queue retries it.
 */
const READ_TIMEOUT_MS = 30_000;
const WRITE_TIMEOUT_MS = 45_000;

/**
 * Fingerprints of photos already written to the cloud, per report.
 *
 * Re-uploading eight unchanged images on every sync is what made a second
 * "Sync with Cloud" as slow as the first. Kept in localStorage rather than in
 * the report document so it never travels between devices: a device that has
 * not uploaded a photo itself must not assume it is in the cloud.
 */
function _hashKey(reportId) { return `fr_photohash_${reportId}`; }

function _readUploadedHashes(reportId) {
  try { return JSON.parse(localStorage.getItem(_hashKey(reportId)) || '{}'); }
  catch { return {}; }
}

function _writeUploadedHashes(reportId, map) {
  try { localStorage.setItem(_hashKey(reportId), JSON.stringify(map)); }
  catch { /* private mode or quota — we just lose the skip optimisation */ }
}

/**
 * Forget what we believe is in the cloud for this report, so the next push
 * re-uploads everything. Called whenever a read comes back with photos
 * missing: the local belief is demonstrably wrong.
 */
export function invalidatePhotoCache(reportId) {
  try { localStorage.removeItem(_hashKey(reportId)); } catch { /* ignore */ }
}

function _emitUploadProgress(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('flashreport:upload-progress', { detail }));
}

/**
 * Placeholder written by a previous version of this file, which replaced
 * base64 image data whenever a Firebase Storage upload failed. On the Spark
 * plan Storage is unavailable, so that upload ALWAYS failed and the string
 * overwrote real photos. It is treated as "image absent" everywhere now.
 */
const LEGACY_TOMBSTONE = '__base64_pending_upload__';

function _isMissingImage(url) {
  return !url || url === LEGACY_TOMBSTONE;
}

/**
 * A slot can hold a FILE attachment instead of an image. Those carry no
 * `url` and no photo document, so every image code path must step over them —
 * otherwise hydration counts each one as a missing photo, flags the report
 * `_photosIncomplete` and re-uploads every real photo on each load.
 */
export function isFileSlot(p) {
  return Boolean(p && p.kind === 'file');
}

const API_BASE = '/api';

// ─── Report List ─────────────────────────────────────────────────

export async function fetchReports() {
  if (isFirebaseConfigured) {
    const q = query(reportsCollection(), orderBy('updated_at', 'desc'));
    const snapshot = await withTimeout(getDocs(q), READ_TIMEOUT_MS, 'Loading report list');
    return snapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        title: data.title || 'Untitled Flash Report',
        system_tag: data.system_tag || '',
        location: data.location || '',
        inspection_date: data.inspection_date || '',
        discipline: data.discipline || 'Mechanical',
        version: data.version || 1,
        updated_at: data.updated_at || '',
        created_at: data.created_at || '',
        // Don't include items in list — too heavy
      };
    });
  }

  // Legacy fallback
  const res = await fetch(`${API_BASE}/reports`);
  if (!res.ok) throw new Error('Failed to fetch reports');
  const json = await res.json();
  return json.reports || [];
}

// ─── Single Report (full data with items) ────────────────────────

export async function fetchReport(id) {
  if (isFirebaseConfigured) {
    const snap = await withTimeout(getDoc(reportDoc(id)), READ_TIMEOUT_MS, 'Loading report');
    if (!snap.exists()) throw new Error('Report not found');
    const report = { id: snap.id, ...snap.data() };
    return await _hydratePhotos(id, report);
  }

  // Legacy fallback
  const res = await fetch(`${API_BASE}/reports?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error('Failed to fetch report');
  return await res.json();
}

// ─── Create Report ───────────────────────────────────────────────

export async function createReport(payload = {}) {
  if (isFirebaseConfigured) {
    // Photos FIRST. _toFirestoreDoc replaces inline base64 with photo_ref
    // pointers, so writing the parent document before the bytes exist leaves
    // pointers to nothing if the photo write then fails — and the next load
    // hydrates them as empty. See ERROR_LOG BUG-012.
    await _pushPhotos(payload.id, payload);
    const row = _toFirestoreDoc(payload);
    await withTimeout(setDoc(reportDoc(payload.id), row), WRITE_TIMEOUT_MS, 'Saving report');
    return { ...row, id: payload.id };
  }

  // Legacy fallback
  const res = await fetch(`${API_BASE}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to create report');
  return await res.json();
}

// ─── Save / Update Report ────────────────────────────────────────

export async function saveReport(id, reportData) {
  if (isFirebaseConfigured) {
    // Photos FIRST — see the note in createReport. If this throws, the parent
    // document keeps its previous, still-consistent state instead of being
    // left pointing at bytes that were never written.
    await _pushPhotos(id, reportData);
    const row = _toFirestoreDoc({ ...reportData, id });
    await withTimeout(setDoc(reportDoc(id), row, { merge: true }), WRITE_TIMEOUT_MS, 'Saving report');
    return { ...row, id };
  }

  // Legacy fallback
  const res = await fetch(`${API_BASE}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...reportData, id }),
  });
  if (!res.ok) throw new Error('Failed to save report');
  return await res.json();
}

// ─── Batch Sync ──────────────────────────────────────────────────

export async function batchSyncReports(localReportsList) {
  if (isFirebaseConfigured) {
    // Photos FIRST, for every report, before any parent document is written.
    // A parent document stores photo_ref pointers, so committing it while the
    // bytes are missing is what made photos disappear on reload (BUG-012).
    // A report whose photos fail to write is dropped from this batch and left
    // PENDING, so it retries rather than being recorded as synced.
    const writable = [];
    for (const report of localReportsList) {
      if (!report || !report.id) continue;
      try {
        await _pushPhotos(report.id, report);
        writable.push(report);
      } catch (e) {
        console.warn(`Photo push failed for ${report.id}, deferring:`, e.message);
      }
    }

    // Firestore batch write (max 500 per batch, we're well under)
    const batch = writeBatch(db);
    const results = [];

    for (const report of writable) {
      const row = _toFirestoreDoc(report);
      batch.set(reportDoc(report.id), row, { merge: true });
      results.push({ id: report.id, ...row });
    }

    if (results.length > 0) {
      await withTimeout(batch.commit(), WRITE_TIMEOUT_MS, 'Saving reports');
    }

    return results;
  }

  // Legacy fallback
  const res = await fetch(`${API_BASE}/reports?action=batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch: localReportsList }),
  });
  if (!res.ok) throw new Error('Failed to batch sync reports');
  const json = await res.json();
  return json.reports || [];
}

// ─── Delete Report ───────────────────────────────────────────────

export async function deleteReport(id) {
  if (isFirebaseConfigured) {
    // Firestore does not cascade — remove the photos subcollection first,
    // otherwise its documents are orphaned and keep consuming quota.
    try {
      invalidatePhotoCache(id);
      const snap = await withTimeout(
        getDocs(reportPhotosCollection(id)), READ_TIMEOUT_MS, 'Loading photos'
      );
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await withTimeout(batch.commit(), WRITE_TIMEOUT_MS, 'Deleting photos');
      }
    } catch (e) {
      console.warn('Photo subcollection cleanup:', e.message);
    }

    // Also clean Storage, for reports created before the subcollection change
    try {
      await deleteReportPhotos(id);
    } catch (e) {
      console.warn('Photo cleanup on delete:', e);
    }

    await deleteDoc(reportDoc(id));
    return { success: true };
  }

  // Legacy fallback
  const res = await fetch(`${API_BASE}/reports?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete report');
  return await res.json();
}

// ─── Duplicate Report ────────────────────────────────────────────

export async function duplicateReport(id) {
  const report = await fetchReport(id);
  const newId = `rep_${Date.now()}`;
  const dup = {
    ...report,
    id: newId,
    title: `${report.title || 'Report'} (Copy)`,
    cloud_code: null,
    updated_at: new Date().toISOString(),
  };
  await saveReport(newId, dup);
  return dup;
}

// ─── Photo Upload ────────────────────────────────────────────────

/**
 * Upload a photo file. With Firebase: compresses and uploads to Storage.
 * Without Firebase: converts to base64 data URL (legacy behavior).
 *
 * @param {File} file - Image file from input or camera
 * @param {string} reportId - Parent report ID (for Storage path)
 * @param {string} itemId - Parent item ID
 * @param {number} slotIndex - Photo slot index
 * @returns {{ url: string }} Object with the photo URL
 */
export async function uploadPhotoFile(file, reportId = '', itemId = '', slotIndex = 0) {
  // 1. Compress the image client-side
  const compressed = await _compressImage(file, 1200, 0.82);

  // 2. If Firebase configured → upload to Storage
  if (isFirebaseConfigured && reportId) {
    const storageUrl = await uploadPhotoToStorage(compressed, reportId, itemId, slotIndex);
    if (storageUrl) {
      return { url: storageUrl };
    }
    // Fall through to base64 if upload fails
  }

  // 3. Fallback: convert to base64 data URL
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve({ url: reader.result });
    reader.readAsDataURL(compressed);
  });
}

/**
 * Accept a base64 data URL as-is (for backward compatibility).
 */
export async function uploadPhotoBase64(base64) {
  return { url: base64 };
}

// ─── Photo Migration: base64 → Storage ───────────────────────────

/**
 * Process a report's items and upload any remaining base64 photos to Firebase Storage.
 * Returns the report with all base64 URLs replaced by Storage URLs.
 * If Firebase is not configured or no base64 photos found, returns report unchanged.
 */
export async function migrateReportPhotosToStorage(report) {
  if (!isFirebaseConfigured || !report || !report.items) return report;

  // Firebase Storage requires the paid Blaze plan. On Spark, photos live in
  // the report's Firestore `photos` subcollection instead, which _pushPhotos
  // already handles. The local base64 is deliberately left untouched so the
  // image keeps rendering offline.
  try {
    await _pushPhotos(report.id, report);
  } catch (e) {
    console.warn('Photo push during migration:', e.message);
  }

  return report;
}

// ─── Private Helpers ─────────────────────────────────────────────

/**
 * Map a report object to a Firestore document.
 * Strips internal sync metadata fields (prefixed with _).
 */
function _toFirestoreDoc(report) {
  const doc = {
    title: report.title || 'Untitled Flash Report',
    system_tag: report.system_tag || '',
    location: report.location || '',
    inspection_date: report.inspection_date || '',
    discipline: report.discipline || 'Mechanical',
    items: report.items || [],
    version: report._version || report.version || 1,
    updated_at: report.updated_at || new Date().toISOString(),
    created_at: report.created_at || new Date().toISOString(),
  };

  // Replace inline base64 with a REFERENCE to the photos subcollection.
  // The bytes are never discarded — _pushPhotos writes them alongside this
  // document, and _hydratePhotos reads them back on load.
  if (Array.isArray(doc.items)) {
    doc.items = doc.items.map((item, itemIdx) => {
      if (!item.photos || item.photos.length === 0) return item;
      const itemId = item.id || `item_${itemIdx}`;
      return {
        ...item,
        photos: item.photos.map((p, pIdx) => {
          if (!p || !p.url) return p;
          if (!p.url.startsWith('data:')) return p; // already a hosted URL
          const slot = p.slot_index ?? pIdx;
          return {
            id: p.id,
            filename: p.filename,
            slot_index: slot,
            url: '',
            photo_ref: photoKey(itemId, slot), // ← pointer, not a tombstone
          };
        }),
      };
    });
  }

  return doc;
}

/**
 * Write a report's photos into its `photos` subcollection, one document per
 * image.
 *
 * Three things this function must keep doing, each of them a fix for a real
 * failure the user hit:
 *
 * 1. SKIP UNCHANGED PHOTOS. Every photo carries a fingerprint of its bytes.
 *    A photo whose fingerprint matches what this device already uploaded is
 *    not sent again, which is what turns a repeat sync from minutes into a
 *    round trip.
 * 2. WRITE ONE DOCUMENT AT A TIME, not one atomic `writeBatch`. Eight photos
 *    in a single batch is one multi-megabyte request that cannot report
 *    progress, cannot be resumed, and fails as a whole. Sequential writes are
 *    observable and resumable — the fingerprint map is persisted after each
 *    one, so an interrupted sync continues where it stopped.
 * 3. NEVER BLOCK THE MAIN THREAD. Recompression is bounded by a timeout and
 *    the loop yields between images so the browser keeps painting. The frozen
 *    UI the user reported was not a slow network, it was this loop.
 */
async function _pushPhotos(reportId, report) {
  if (!isFirebaseConfigured || !report?.items?.length) return { skipped: [] };

  const uploaded = _readUploadedHashes(reportId);
  const writes = [];
  const skipped = [];
  let unchanged = 0;

  for (const [itemIdx, item] of report.items.entries()) {
    const itemId = item.id || `item_${itemIdx}`;
    const photos = item.photos || [];

    for (const [pIdx, p] of photos.entries()) {
      if (!p || !p.url || !p.url.startsWith('data:')) continue;

      const key = photoKey(itemId, p.slot_index ?? pIdx);

      // The fingerprint identifies what the USER has, so it is taken from the
      // original bytes — before any recompression — and stays stable across
      // saves that did not touch this photo.
      const fingerprint = photoFingerprint(p.url);
      if (uploaded[key] === fingerprint) { unchanged++; continue; }

      let url = p.url;

      // Photos are compressed at ingest now, so this is only reached by images
      // that predate that change. Bounded, and it yields afterwards.
      if (url.length > PHOTO_MAX_BYTES) {
        url = await compressDataUrl(url, { maxBytes: PHOTO_MAX_BYTES });
        await yieldToBrowser();
      }

      if (!url || url.length > PHOTO_MAX_BYTES) {
        skipped.push({
          itemId,
          slot: (p.slot_index ?? pIdx) + 1,
          filename: p.filename || '',
          kb: Math.round(p.url.length / 1024),
        });
        continue;
      }

      writes.push({
        key,
        fingerprint,
        data: {
          url,
          filename: p.filename || '',
          slot_index: p.slot_index ?? pIdx,
          item_id: itemId,
          updated_at: new Date().toISOString(),
        },
      });
    }
  }

  const total = writes.length;
  if (total > 0) _emitUploadProgress({ reportId, done: 0, total, phase: 'photos' });

  let done = 0;
  for (const { key, fingerprint, data } of writes) {
    await withTimeout(
      setDoc(reportPhotoDoc(reportId, key), data),
      WRITE_TIMEOUT_MS,
      `Uploading photo ${done + 1} of ${total}`
    );
    // Persisted per photo, not at the end: an upload interrupted halfway does
    // not start over.
    uploaded[key] = fingerprint;
    _writeUploadedHashes(reportId, uploaded);
    done++;
    _emitUploadProgress({ reportId, done, total, phase: 'photos' });
    await yieldToBrowser();
  }

  if (total > 0) _emitUploadProgress({ reportId, done: total, total, phase: 'done' });

  // Tell the UI, so an unsyncable photo is visible to the user instead of
  // living only in the console.
  if (skipped.length > 0 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('flashreport:photos-skipped', {
      detail: { reportId, skipped },
    }));
  }

  return { skipped, uploaded: done, unchanged };
}

/**
 * Recompress a base64 image until it fits `maxBytes`, stepping the longest
 * edge and JPEG quality down together. Returns null if it cannot be made to
 * fit, which the caller reports to the user rather than dropping silently.
 */
function _shrinkToFit(dataUrl, maxBytes) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const steps = [
        [1600, 0.75], [1200, 0.7], [1000, 0.6], [800, 0.5], [640, 0.42],
      ];
      for (const [maxDim, quality] of steps) {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
          else { w = Math.round((w * maxDim) / h); h = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const out = canvas.toDataURL('image/jpeg', quality);
        if (out.length <= maxBytes) { resolve(out); return; }
      }
      resolve(null);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Read a report's photos subcollection back and splice the base64 data
 * into the items, reversing what _toFirestoreDoc stored as references.
 */
async function _hydratePhotos(reportId, report) {
  if (!isFirebaseConfigured || !report?.items?.length) return report;

  const needsHydration = report.items.some((item) =>
    (item.photos || []).some((p) => p && !isFileSlot(p) && _isMissingImage(p.url))
  );
  if (!needsHydration) return report;

  let byKey = new Map();
  let hydrationOk = true;
  try {
    const snap = await withTimeout(
      getDocs(reportPhotosCollection(reportId)), READ_TIMEOUT_MS, 'Loading photos'
    );
    snap.docs.forEach((d) => byKey.set(d.id, d.data()));
  } catch (e) {
    console.warn('Photo hydration failed:', e.message);
    hydrationOk = false;
  }

  let missing = 0;

  const items = report.items.map((item, itemIdx) => {
    if (!item.photos || item.photos.length === 0) return item;
    const itemId = item.id || `item_${itemIdx}`;
    return {
      ...item,
      photos: item.photos.map((p, pIdx) => {
        if (!p) return p;
        if (isFileSlot(p)) return p;           // attachment, not an image
        if (!_isMissingImage(p.url)) return p; // already has real data
        const key = p.photo_ref || photoKey(itemId, p.slot_index ?? pIdx);
        const stored = byKey.get(key);
        if (stored) return { ...p, url: stored.url };

        // The pointer resolved to nothing. Do NOT invent a url of any kind —
        // an earlier version wrote '' here, and callers then saved that over
        // a local copy that still had the image, destroying it (BUG-012).
        // Leaving the slot untouched and flagging the report lets the caller
        // prefer whatever it already holds.
        missing++;
        return p;
      }),
    };
  });

  // `_photosIncomplete` marks a cloud copy that must never be treated as the
  // authoritative version of this report's photos.
  const incomplete = !hydrationOk || missing > 0;

  // The cloud does not hold what this device believed it uploaded, so the
  // fingerprint cache is wrong. Drop it: the next push re-sends everything
  // rather than skipping a photo that is not actually there.
  if (missing > 0) invalidatePhotoCache(reportId);

  return { ...report, items, _photosIncomplete: incomplete };
}

/**
 * Compress an image file to target max dimension and quality.
 * Returns a Blob.
 */
function _compressImage(file, maxDim = 1200, quality = 0.82) {
  return new Promise((resolve) => {
    // If file is already small enough, use as-is
    if (file.size < 200_000) {
      resolve(file);
      return;
    }

    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;

      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => resolve(blob || file),
        'image/jpeg',
        quality
      );

      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}
