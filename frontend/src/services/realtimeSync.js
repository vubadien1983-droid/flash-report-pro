/**
 * Realtime sync — live Firestore listeners so a change made on the phone
 * appears on the laptop (and vice versa) without pressing Sync.
 *
 * Two listeners, deliberately asymmetric:
 *
 *   LIST  → the whole `reports` collection. Drives the sidebar. Its payload is
 *           reduced to HEADERS ONLY (no `items`) before it leaves this module.
 *           A collection snapshot does carry `items`, but those items hold
 *           `photo_ref` pointers with empty `url` — the bytes live in each
 *           report's `photos` subcollection. Passing them on would blank out
 *           photos the device already has. See ERROR_LOG BUG-011.
 *
 *   DOC   → the one report currently open. Full document, photos hydrated.
 *           Applied only when the local copy has no unsaved edits, so a remote
 *           echo can never overwrite what the user is typing. See BUG-001.
 *
 * Snapshots caused by this device's own writes are skipped
 * (`metadata.hasPendingWrites`), otherwise every keystroke would round-trip.
 */

import {
  isFirebaseConfigured,
  reportsCollection, reportDoc,
  onSnapshot, query, orderBy,
} from './firebase';
import { fetchReport } from './api';

class RealtimeSync {
  constructor() {
    this._listUnsub = null;
    this._docUnsub = null;
    this._watchedId = null;
    this._listeners = new Set();
    this._suppressUntil = 0;
  }

  /** Subscribe to realtime events. Returns an unsubscribe function. */
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit(event) {
    for (const fn of this._listeners) {
      try { fn(event); } catch (e) { console.warn('RealtimeSync listener error:', e); }
    }
  }

  /**
   * Briefly ignore remote echoes after a local save. Firestore reports our own
   * write twice (optimistic, then server-confirmed); the second one has
   * hasPendingWrites false and would otherwise look like a remote change.
   */
  suppress(ms = 2500) {
    this._suppressUntil = Date.now() + ms;
  }

  _isSuppressed() {
    return Date.now() < this._suppressUntil;
  }

  // ─── List listener ───────────────────────────────────────────────

  startList() {
    if (!isFirebaseConfigured || this._listUnsub) return;

    const q = query(reportsCollection(), orderBy('updated_at', 'desc'));

    this._listUnsub = onSnapshot(
      q,
      { includeMetadataChanges: false },
      (snap) => {
        if (snap.metadata.hasPendingWrites) return; // our own write

        // Headers only — never let a list row carry items downstream.
        const headers = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title || 'Untitled Flash Report',
            report_type: data.report_type || '',
            share_id: data.share_id || data.cloud_code || '',
            cloud_code: data.cloud_code || data.share_id || '',
            system_tag: data.system_tag || '',
            location: data.location || '',
            inspection_date: data.inspection_date || '',
            discipline: data.discipline || 'Mechanical',
            version: data.version || 1,
            updated_at: data.updated_at || '',
            created_at: data.created_at || '',
          };
        });

        this._emit({ type: 'remote_list', reports: headers });
      },
      (err) => {
        console.warn('Realtime list listener error:', err.message);
        this._emit({ type: 'realtime_error', scope: 'list', message: err.message });
      }
    );
  }

  // ─── Active-report listener ──────────────────────────────────────

  /** Watch one report. Switching reports swaps the listener. */
  watchReport(reportId) {
    if (!isFirebaseConfigured) return;
    if (this._watchedId === reportId) return;

    this.unwatchReport();
    if (!reportId) return;

    this._watchedId = reportId;

    this._docUnsub = onSnapshot(
      reportDoc(reportId),
      { includeMetadataChanges: false },
      async (snap) => {
        if (!snap.exists()) {
          this._emit({ type: 'remote_deleted', reportId });
          return;
        }
        if (snap.metadata.hasPendingWrites) return; // our own write
        if (this._isSuppressed()) return;           // echo of a save we just made

        // Re-fetch through the API so photos are hydrated from the
        // subcollection — the raw snapshot only carries photo_ref pointers.
        try {
          const full = await fetchReport(reportId);
          if (this._watchedId !== reportId) return; // user switched away
          this._emit({ type: 'remote_report', report: full });
        } catch (e) {
          console.warn('Realtime hydrate failed:', e.message);
        }
      },
      (err) => {
        console.warn('Realtime doc listener error:', err.message);
        this._emit({ type: 'realtime_error', scope: 'doc', message: err.message });
      }
    );
  }

  unwatchReport() {
    if (this._docUnsub) { this._docUnsub(); this._docUnsub = null; }
    this._watchedId = null;
  }

  stop() {
    if (this._listUnsub) { this._listUnsub(); this._listUnsub = null; }
    this.unwatchReport();
    this._listeners.clear();
  }
}

const realtimeSync = new RealtimeSync();
export default realtimeSync;
