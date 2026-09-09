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

/**
 * Firestore hard-caps a single document at 1 MiB. A photo is therefore
 * stored in its own document inside the report's `photos` subcollection,
 * and the report document keeps only a lightweight reference.
 *
 * PHOTO_MAX_BYTES leaves headroom for the surrounding document fields.
 */
const PHOTO_MAX_BYTES = 900_000;

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

const API_BASE = '/api';

// ─── Report List ─────────────────────────────────────────────────

export async function fetchReports() {
  if (isFirebaseConfigured) {
    const q = query(reportsCollection(), orderBy('updated_at', 'desc'));
    const snapshot = await getDocs(q);
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
    const snap = await getDoc(reportDoc(id));
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
    const row = _toFirestoreDoc(payload);
    await setDoc(reportDoc(payload.id), row);
    await _pushPhotos(payload.id, payload);
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
    const row = _toFirestoreDoc({ ...reportData, id });
    await setDoc(reportDoc(id), row, { merge: true });
    await _pushPhotos(id, reportData);
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
    // Firestore batch write (max 500 per batch, we're well under)
    const batch = writeBatch(db);
    const results = [];

    for (const report of localReportsList) {
      if (!report || !report.id) continue;
      const row = _toFirestoreDoc(report);
      batch.set(reportDoc(report.id), row, { merge: true });
      results.push({ id: report.id, ...row });
    }

    await batch.commit();

    // Photos go in their own subcollection documents, after the parent
    // documents are committed.
    for (const report of localReportsList) {
      if (!report || !report.id) continue;
      try {
        await _pushPhotos(report.id, report);
      } catch (e) {
        console.warn(`Photo push failed for ${report.id}:`, e.message);
      }
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
      const snap = await getDocs(reportPhotosCollection(id));
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
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
 * Write every base64 photo of a report into its `photos` subcollection,
 * one document per image. Oversized images are skipped (and reported)
 * rather than silently replaced, so nothing is ever destroyed.
 */
async function _pushPhotos(reportId, report) {
  if (!isFirebaseConfigured || !report?.items?.length) return { skipped: [] };

  const writes = [];
  const skipped = [];

  for (const [itemIdx, item] of report.items.entries()) {
    const itemId = item.id || `item_${itemIdx}`;
    const photos = item.photos || [];

    for (const [pIdx, p] of photos.entries()) {
      if (!p || !p.url || !p.url.startsWith('data:')) continue;

      let url = p.url;

      // Too big for a Firestore document — try to shrink it rather than
      // silently dropping it. Only a photo that survives even aggressive
      // recompression is reported as unsyncable.
      if (url.length > PHOTO_MAX_BYTES) {
        url = await _shrinkToFit(url, PHOTO_MAX_BYTES);
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
        key: photoKey(itemId, p.slot_index ?? pIdx),
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

  // Firestore batches cap at 500 operations.
  for (let i = 0; i < writes.length; i += 400) {
    const chunk = writes.slice(i, i + 400);
    const batch = writeBatch(db);
    chunk.forEach(({ key, data }) => {
      batch.set(reportPhotoDoc(reportId, key), data);
    });
    await batch.commit();
  }

  // Tell the UI, so an unsyncable photo is visible to the user instead of
  // living only in the console.
  if (skipped.length > 0 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('flashreport:photos-skipped', {
      detail: { reportId, skipped },
    }));
  }

  return { skipped };
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
    (item.photos || []).some((p) => p && _isMissingImage(p.url))
  );
  if (!needsHydration) return report;

  let byKey = new Map();
  try {
    const snap = await getDocs(reportPhotosCollection(reportId));
    snap.docs.forEach((d) => byKey.set(d.id, d.data()));
  } catch (e) {
    console.warn('Photo hydration failed:', e.message);
    return report;
  }

  const items = report.items.map((item, itemIdx) => {
    if (!item.photos || item.photos.length === 0) return item;
    const itemId = item.id || `item_${itemIdx}`;
    return {
      ...item,
      photos: item.photos.map((p, pIdx) => {
        if (!p) return p;
        if (!_isMissingImage(p.url)) return p; // already has real data
        const key = p.photo_ref || photoKey(itemId, p.slot_index ?? pIdx);
        const stored = byKey.get(key);
        // Blank out the legacy tombstone so it never renders as a broken <img>
        return stored ? { ...p, url: stored.url } : { ...p, url: '' };
      }),
    };
  });

  return { ...report, items };
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
