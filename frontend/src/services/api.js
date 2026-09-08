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
  getDoc, getDocs, setDoc, deleteDoc, writeBatch,
  query, orderBy, db,
  uploadPhotoToStorage,
  deleteReportPhotos,
  base64ToBlob,
} from './firebase';

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
    return { id: snap.id, ...snap.data() };
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
    // Delete photos from Storage first
    try {
      await deleteReportPhotos(id);
    } catch (e) {
      console.warn('Photo cleanup on delete:', e);
    }
    // Delete Firestore document
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

  let hasChanges = false;
  const updatedItems = await Promise.all(
    report.items.map(async (item) => {
      if (!item.photos || item.photos.length === 0) return item;

      const updatedPhotos = await Promise.all(
        item.photos.map(async (photo, idx) => {
          if (!photo || !photo.url) return photo;
          // Skip if already a URL (not base64)
          if (!photo.url.startsWith('data:')) return photo;

          try {
            const blob = base64ToBlob(photo.url);
            const storageUrl = await uploadPhotoToStorage(
              blob,
              report.id,
              item.id || `item_${idx}`,
              photo.slot_index ?? idx
            );
            if (storageUrl) {
              hasChanges = true;
              return { ...photo, url: storageUrl };
            }
          } catch (e) {
            console.warn(`Photo migration failed for ${item.id}:`, e);
          }
          return photo; // Keep base64 if upload fails
        })
      );

      return { ...item, photos: updatedPhotos };
    })
  );

  if (!hasChanges) return report;
  return { ...report, items: updatedItems };
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

  // Strip base64 photo data from cloud copy to avoid Firestore 1MB doc limit
  if (Array.isArray(doc.items)) {
    doc.items = doc.items.map((item) => {
      if (!item.photos || item.photos.length === 0) return item;
      return {
        ...item,
        photos: item.photos.map((p) => {
          if (!p || !p.url) return p;
          // If still base64 (not yet migrated), store a placeholder
          if (p.url.startsWith('data:') && p.url.length > 500) {
            return { ...p, url: '__base64_pending_upload__' };
          }
          return p;
        }),
      };
    });
  }

  return doc;
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
