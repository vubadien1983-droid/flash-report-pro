/**
 * The live, READ-ONLY share link of an OPS Findings report.
 *
 * Holds a Firestore listener on `shared_reports/{shareId}`: the author's app
 * re-publishes after each save (throttled, see scheduleRepublish in App.jsx),
 * and every open link redraws within a second of that write — no reload.
 *
 * Lessons carried over from the Mini Plan's live link:
 *  - every failure path REPORTS a reason (BUG-036) — a silent no-op is a
 *    spinner that never stops;
 *  - the snapshot callback body is wrapped in try/catch, because Firestore
 *    swallows an exception thrown inside it;
 *  - no name inside the callback shadows an outer binding the callback reads
 *    (BUG-040: a `const` further down a block puts the name in the temporal
 *    dead zone for the WHOLE block);
 *  - photo bytes are fetched once per `photo_ref` and cached; a ref not yet
 *    read shows as loading, a ref read and absent shows as missing (BUG-012).
 */

import {
  isFirebaseConfigured, sharedDoc, sharedPhotoDoc, getDoc, onSnapshot,
} from './firebase';
import { withTimeout, yieldToBrowser } from './imageCompression';
import { normalizeOpsItems } from './opsFindings';

const READ_TIMEOUT_MS = 30_000;

function refsOf(items) {
  const out = new Set();
  for (const it of items || []) {
    for (const p of it?.photos || []) {
      if (p && !p.url && p.photo_ref && p.kind !== 'file') out.add(p.photo_ref);
    }
  }
  return out;
}

function withBytes(items, cache, absent) {
  return (items || []).map((it) => ({
    ...it,
    photos: (it.photos || []).map((p) => {
      if (!p || p.url || !p.photo_ref || p.kind === 'file') return p;
      if (cache.has(p.photo_ref)) return { ...p, url: cache.get(p.photo_ref) };
      if (absent.has(p.photo_ref)) return { ...p, photo_missing: true };
      return p;
    }),
  }));
}

/**
 * @returns {() => void} unsubscribe
 */
export function subscribeSharedOps(shareId, onData, onError) {
  if (!isFirebaseConfigured) {
    setTimeout(() => onError?.(new Error('Cloud is not configured for this build.')), 0);
    return () => {};
  }
  if (!shareId) {
    setTimeout(() => onError?.(new Error('This link has no report id.')), 0);
    return () => {};
  }

  const photoCache = new Map();   // photo_ref -> data url
  const absentRefs = new Set();   // photo_ref read and not found
  let stopped = false;
  let generation = 0;

  const unsub = onSnapshot(
    sharedDoc(shareId),
    async (snap) => {
      if (stopped) return;
      try {
        if (!snap.exists()) { onError?.(new Error('Report not found — the link may have been withdrawn.')); return; }
        const gen = ++generation;
        const data = snap.data() || {};
        const rows = normalizeOpsItems(data.items || []);
        const header = { ...data, id: shareId, share_id: shareId };
        onData({ ...header, items: withBytes(rows, photoCache, absentRefs) });

        const wanted = refsOf(rows);
        const queue = [...wanted].filter((k) => !photoCache.has(k) && !absentRefs.has(k));
        let fetched = 0;
        for (const key of queue) {
          if (stopped || gen !== generation) return;
          try {
            const ps = await withTimeout(getDoc(sharedPhotoDoc(shareId, key)), READ_TIMEOUT_MS, 'Loading photo');
            const url = ps.exists() ? (ps.data()?.url || '') : '';
            if (url) photoCache.set(key, url); else absentRefs.add(key);
          } catch (e) {
            console.warn(`Shared photo ${key} not read:`, e.message);   // retried on the next snapshot
          }
          fetched += 1;
          // Paint in batches so a report with 50 photos fills in progressively.
          if (fetched % 6 === 0 && gen === generation && !stopped) {
            onData({ ...header, items: withBytes(rows, photoCache, absentRefs) });
          }
          await yieldToBrowser();
        }
        for (const key of [...photoCache.keys()]) if (!wanted.has(key)) photoCache.delete(key);
        if (stopped || gen !== generation) return;
        onData({ ...header, items: withBytes(rows, photoCache, absentRefs) });
      } catch (e) {
        console.error('Shared findings could not be read:', e);
        onError?.(new Error(`The report could not be read: ${e.message}`));
      }
    },
    (err) => {
      console.warn('Live share listener error:', err.message);
      onError?.(err);
    },
  );

  return () => { stopped = true; photoCache.clear(); unsub(); };
}
