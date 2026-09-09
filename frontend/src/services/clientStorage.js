/**
 * Client-side persistent storage using IndexedDB.
 * v2.0 — Enhanced with version tracking & sync status fields.
 *
 * Each report now carries:
 *   _version        : number  — incremented on every local save
 *   _syncStatus     : string  — 'synced' | 'pending' | 'conflict' | 'failed'
 *   _lastSyncedAt   : string  — ISO timestamp of last successful cloud sync
 *   _localModifiedAt: string  — ISO timestamp of last local modification
 *   _retryCount     : number  — cloud push retry counter
 *   _lastSyncAttempt: string  — ISO timestamp of last sync attempt
 */

const DB_NAME = 'FlashReportDB';
const DB_VERSION = 2;  // Bumped to trigger upgrade for new index
const STORE_REPORTS = 'reports';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      let store;
      if (!db.objectStoreNames.contains(STORE_REPORTS)) {
        store = db.createObjectStore(STORE_REPORTS, { keyPath: 'id' });
        store.createIndex('updated_at', 'updated_at', { unique: false });
      } else {
        store = e.target.transaction.objectStore(STORE_REPORTS);
      }

      // Add index for sync status queries (v2)
      if (!store.indexNames.contains('_syncStatus')) {
        store.createIndex('_syncStatus', '_syncStatus', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getLocalReports() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REPORTS, 'readonly');
    const store = tx.objectStore(STORE_REPORTS);
    const request = store.getAll();

    request.onsuccess = () => {
      const reports = request.result || [];
      // Sort by updated_at desc
      reports.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
      resolve(reports);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getLocalReport(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REPORTS, 'readonly');
    const store = tx.objectStore(STORE_REPORTS);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveLocalReport(report) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REPORTS, 'readwrite');
    const store = tx.objectStore(STORE_REPORTS);

    // Last line of defence against BUG-011: a caller handing us a report
    // with NO items array is passing a list-query header, not a full
    // document. Overwriting a stored record with one would destroy its
    // items and photos, so the existing items are carried across instead.
    //
    // An explicit empty array is left alone — that is the user deleting
    // every row, which must still persist.
    const existingReq = store.get(report.id);

    existingReq.onsuccess = () => {
      const existing = existingReq.result;
      const updated = {
        ...report,
        updated_at: report.updated_at || new Date().toISOString(),
        _version: report._version || 1,
        _syncStatus: report._syncStatus || 'pending',
      };

      if (!Array.isArray(updated.items) && Array.isArray(existing?.items)) {
        updated.items = existing.items;
        updated.updated_at = existing.updated_at || updated.updated_at;
      }

      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve(updated);
      putReq.onerror = () => reject(putReq.error);
    };

    existingReq.onerror = () => reject(existingReq.error);
  });
}

export async function deleteLocalReport(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REPORTS, 'readwrite');
    const store = tx.objectStore(STORE_REPORTS);
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all reports with a specific sync status.
 * @param {string} status - 'synced' | 'pending' | 'conflict' | 'failed'
 * @returns {Promise<Array>}
 */
export async function getReportsBySyncStatus(status) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REPORTS, 'readonly');
    const store = tx.objectStore(STORE_REPORTS);

    // Try using index if available
    if (store.indexNames.contains('_syncStatus')) {
      const index = store.index('_syncStatus');
      const request = index.getAll(status);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    } else {
      // Fallback: filter manually
      const request = store.getAll();
      request.onsuccess = () => {
        const all = request.result || [];
        resolve(all.filter(r => r._syncStatus === status));
      };
      request.onerror = () => reject(request.error);
    }
  });
}

/**
 * Bulk update sync status for multiple reports.
 * @param {string[]} ids - Report IDs
 * @param {string} status - New sync status
 */
export async function bulkUpdateSyncStatus(ids, status) {
  const db = await openDB();
  const tx = db.transaction(STORE_REPORTS, 'readwrite');
  const store = tx.objectStore(STORE_REPORTS);

  const promises = ids.map(id =>
    new Promise((resolve, reject) => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const report = getReq.result;
        if (report) {
          report._syncStatus = status;
          if (status === 'synced') {
            report._lastSyncedAt = new Date().toISOString();
            report._retryCount = 0;
          }
          const putReq = store.put(report);
          putReq.onsuccess = () => resolve(report);
          putReq.onerror = () => reject(putReq.error);
        } else {
          resolve(null);
        }
      };
      getReq.onerror = () => reject(getReq.error);
    })
  );

  return Promise.all(promises);
}
