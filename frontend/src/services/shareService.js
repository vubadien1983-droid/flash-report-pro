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
  getDoc, getDocs, setDoc, writeBatch, db,
} from './firebase';

/** Leaves headroom under the 1 MiB per-document limit. */
const PHOTO_MAX_BYTES = 900_000;

/** Short, URL-friendly, collision-resistant share id. */
function makeShareId() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

async function compressPhotoForShare(url) {
  if (!url) return null;
  if (url.length < 120_000) return url;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const maxDim = 900;
      let w = img.naturalWidth || img.width || 400;
      let h = img.naturalHeight || img.height || 300;
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

      // Step the quality down until the payload fits a Firestore document.
      let out = canvas.toDataURL('image/jpeg', 0.8);
      for (const q of [0.65, 0.5, 0.38]) {
        if (out.length <= PHOTO_MAX_BYTES) break;
        out = canvas.toDataURL('image/jpeg', q);
      }
      resolve(out);
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
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

  // 1. Compress photos in parallel and split them out of the main document.
  const items = report.items || [];
  const photoWrites = [];

  const sharedItems = await Promise.all(
    items.map(async (item, itemIdx) => {
      const itemId = item.id || `item_${itemIdx}`;
      const photos = item.photos || [];

      const refs = await Promise.all(
        photos.map(async (p, pIdx) => {
          if (!p || !p.url) return null;
          const slot = p.slot_index ?? pIdx;
          const key = photoKey(itemId, slot);

          // Already-hosted URLs are passed through untouched.
          if (!p.url.startsWith('data:')) {
            return { id: p.id, filename: p.filename, slot_index: slot, url: p.url };
          }

          const compact = await compressPhotoForShare(p.url);
          if (!compact || compact.length > PHOTO_MAX_BYTES) {
            console.warn(`Photo ${key} too large to share; skipped.`);
            return { id: p.id, filename: p.filename, slot_index: slot, url: '' };
          }

          photoWrites.push({ key, data: { url: compact, slot_index: slot, item_id: itemId } });
          return {
            id: p.id,
            filename: p.filename,
            slot_index: slot,
            url: '',
            photo_ref: key,
          };
        })
      );

      return { ...item, photos: refs };
    })
  );

  // 2. Write the report document.
  await setDoc(sharedDoc(shareId), {
    title: report.title || 'Untitled Flash Report',
    system_tag: report.system_tag || '',
    location: report.location || '',
    inspection_date: report.inspection_date || '',
    discipline: report.discipline || 'Mechanical',
    items: sharedItems,
    source_report_id: report.id || '',
    updated_at: new Date().toISOString(),
    created_at: report.created_at || new Date().toISOString(),
  });

  // 3. Write the photo documents (batched, 400 per commit).
  for (let i = 0; i < photoWrites.length; i += 400) {
    const batch = writeBatch(db);
    photoWrites.slice(i, i + 400).forEach(({ key, data }) => {
      batch.set(sharedPhotoDoc(shareId, key), data);
    });
    await batch.commit();
  }

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
export async function republishIfShared(report) {
  if (!isFirebaseConfigured) return;
  const shareId = report?.share_id || report?.cloud_code;
  if (!shareId) return;
  try {
    await publishReportForSharing(report);
  } catch (e) {
    console.warn('Share refresh failed:', e.message);
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
      const snap = await getDoc(sharedDoc(cleanId));
      if (snap.exists()) {
        const report = { id: cleanId, ...snap.data() };
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
    const snap = await getDocs(sharedPhotosCollection(shareId));
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
