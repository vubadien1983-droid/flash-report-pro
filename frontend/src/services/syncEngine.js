/**
 * SyncEngine v2.0 — Conflict Resolution & Offline Queue
 *
 * Core responsibilities:
 * 1. Version-based conflict detection (each report has _version)
 * 2. Offline queue with automatic retry
 * 3. 3-state sync status tracking: synced | pending | conflict
 * 4. Background sync every 30s + on app resume
 * 5. Debounced cloud push (saves local instantly, batches cloud writes)
 *
 * Sync rules:
 * - Local version > Cloud version  → PUSH local to cloud
 * - Cloud version > Local version  → PULL cloud to local (if no unsaved local edits)
 * - Both modified (same version, different updated_at) → keep newer by timestamp, flag conflict
 * - Cloud save fails → mark "pending", retry later
 */

import {
  getLocalReports, getLocalReport, saveLocalReport, deleteLocalReport
} from './clientStorage';
import {
  fetchReports, fetchReport, saveReport, batchSyncReports,
  migrateReportPhotosToStorage
} from './api';

// ─── Constants ───────────────────────────────────────────────────
const SYNC_INTERVAL_MS = 30_000;        // Background retry every 30s
const CLOUD_DEBOUNCE_MS = 5_000;        // Batch cloud writes every 5s
const MAX_RETRY_COUNT = 10;             // Max retries before marking failed
const SYNC_STATUS_KEY = 'flash_report_sync_meta';

// ─── Sync Status Enum ────────────────────────────────────────────
export const SyncStatus = {
  SYNCED: 'synced',       // Cloud and local are in sync
  PENDING: 'pending',     // Local changes waiting to be pushed to cloud
  CONFLICT: 'conflict',   // Both local and cloud modified — needs resolution
  FAILED: 'failed',       // Sync failed after max retries
  OFFLINE: 'offline',     // No network detected
};

// ─── SyncEngine Class ────────────────────────────────────────────
class SyncEngine {
  constructor() {
    this._listeners = new Set();
    this._cloudDebounceTimer = null;
    this._backgroundTimer = null;
    this._pendingQueue = new Map();     // reportId → { report, retryCount, lastAttempt }
    this._syncMeta = new Map();         // reportId → { status, version, lastSyncedAt }
    this._isOnline = navigator.onLine;
    this._isSyncing = false;
    this._initialized = false;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────

  async init() {
    if (this._initialized) return;
    this._initialized = true;

    // Load persisted sync metadata
    await this._loadSyncMeta();

    // Listen for online/offline
    window.addEventListener('online', () => {
      this._isOnline = true;
      this._notify({ type: 'online' });
      // Immediately try to flush pending queue
      this.processQueue();
    });
    window.addEventListener('offline', () => {
      this._isOnline = false;
      this._notify({ type: 'offline' });
    });

    // Sync on app resume (tab becomes visible) — push pending + pull new data
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this._isOnline) {
        // Process any pending local pushes
        this.processQueue();
        // Also do a full pull to catch changes made on other devices
        this._resumePull();
      }
    });

    // Try to sync before page unload
    window.addEventListener('beforeunload', () => {
      this._flushCloudDebounce();
    });

    // Start background sync
    this._startBackgroundSync();
  }

  destroy() {
    if (this._backgroundTimer) clearInterval(this._backgroundTimer);
    if (this._cloudDebounceTimer) clearTimeout(this._cloudDebounceTimer);
    this._listeners.clear();
    this._initialized = false;
  }

  // ─── Event System ───────────────────────────────────────────────

  /** Subscribe to sync events. Returns unsubscribe function. */
  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _notify(event) {
    for (const fn of this._listeners) {
      try { fn(event); } catch (e) { console.warn('SyncEngine listener error:', e); }
    }
  }

  // ─── Core: Save with Version Tracking ───────────────────────────

  /**
   * Save a report locally with version bump + queue for cloud sync.
   * This is the PRIMARY save method — replaces direct saveLocalReport + saveReport calls.
   *
   * @param {Object} report - Report data
   * @param {boolean} immediate - If true, attempt cloud sync immediately (e.g. manual Save)
   * @returns {Object} Updated report with _version and _syncStatus
   */
  async saveReport(report) {
    if (!report || !report.id) throw new Error('Invalid report');

    // 1. Bump version
    const currentLocal = await getLocalReport(report.id);
    const currentVersion = currentLocal?._version || report._version || 0;
    const updatedReport = {
      ...report,
      _version: currentVersion + 1,
      _syncStatus: SyncStatus.PENDING,
      _localModifiedAt: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // 2. Save to IndexedDB immediately (never fails unless quota exceeded)
    await saveLocalReport(updatedReport);

    // 3. Update sync meta
    this._updateMeta(report.id, {
      status: SyncStatus.PENDING,
      version: updatedReport._version,
    });

    // 4. Enqueue for cloud push
    this._pendingQueue.set(report.id, {
      report: updatedReport,
      retryCount: 0,
      lastAttempt: null,
    });

    // 5. Debounce cloud write
    this._scheduleCloudPush();

    this._notify({
      type: 'report_saved_local',
      reportId: report.id,
      version: updatedReport._version,
      status: SyncStatus.PENDING,
    });

    return updatedReport;
  }

  /**
   * Force immediate cloud sync for a specific report.
   */
  async pushReportNow(reportId) {
    const entry = this._pendingQueue.get(reportId);
    if (!entry) {
      // Load from IndexedDB if not in queue
      const local = await getLocalReport(reportId);
      if (local && local._syncStatus === SyncStatus.PENDING) {
        this._pendingQueue.set(reportId, {
          report: local,
          retryCount: 0,
          lastAttempt: null,
        });
      } else {
        return; // Nothing to push
      }
    }
    await this._pushSingleReport(reportId);
  }

  // ─── Core: Full Two-Way Sync ────────────────────────────────────

  /**
   * Full bidirectional sync:
   * 1. Push all pending local changes to cloud
   * 2. Pull cloud changes that are newer than local
   * 3. Resolve conflicts
   *
   * @returns {{ pushed, pulled, conflicts, errors }}
   */
  async fullSync() {
    if (this._isSyncing) {
      return { pushed: 0, pulled: 0, conflicts: [], errors: ['Sync already in progress'] };
    }

    this._isSyncing = true;
    this._notify({ type: 'sync_start' });

    const result = { pushed: 0, pulled: 0, conflicts: [], errors: [] };

    try {
      // 1. Get local reports
      const localReports = await getLocalReports();
      const localMap = new Map(localReports.map(r => [r.id, r]));

      // 2. Get cloud reports
      let cloudList = [];
      try {
        cloudList = await fetchReports();
      } catch (e) {
        if (!this._isOnline) {
          this._notify({ type: 'sync_end', result: { ...result, errors: ['Offline'] } });
          return result;
        }
        result.errors.push(`Cloud fetch failed: ${e.message}`);
      }
      const cloudMap = new Map(cloudList.map(r => [r.id, r]));

      // 3. Determine actions for each report
      const toPush = [];   // Local → Cloud
      const toPull = [];   // Cloud → Local

      // 3a. Check local reports against cloud
      for (const [id, local] of localMap) {
        // skip empty/invalid entries
        if (!local || !local.id) continue;

        const cloud = cloudMap.get(id);
        if (!cloud) {
          // Exists locally but not in cloud → push
          if (this._hasRealContent(local)) {
            toPush.push(local);
          }
        } else {
          // Exists in both → resolve conflict
          const resolution = this._resolveConflict(local, cloud);
          if (resolution === 'push') {
            toPush.push(local);
          } else if (resolution === 'pull') {
            toPull.push(cloud);
          } else if (resolution === 'conflict') {
            result.conflicts.push({ localReport: local, cloudReport: cloud });
          }
          // 'equal' → no action
        }
      }

      // 3b. Check cloud reports missing locally → pull
      for (const [id, cloud] of cloudMap) {
        if (!cloud || !cloud.id) continue;
        if (!localMap.has(id)) {
          toPull.push(cloud);
        }
      }

      // 4. Execute pushes (batch)
      if (toPush.length > 0) {
        try {
          const reportsToSync = toPush.map(r => ({
            ...r,
            _syncStatus: undefined,  // Don't send internal fields to cloud
            _localModifiedAt: undefined,
          }));
          await batchSyncReports(reportsToSync);

          // Mark pushed reports as synced
          for (const r of toPush) {
            const synced = {
              ...r,
              _syncStatus: SyncStatus.SYNCED,
              _lastSyncedAt: new Date().toISOString(),
            };
            await saveLocalReport(synced);
            this._pendingQueue.delete(r.id);
            this._updateMeta(r.id, { status: SyncStatus.SYNCED, version: r._version });
          }
          result.pushed = toPush.length;
        } catch (e) {
          result.errors.push(`Batch push failed: ${e.message}`);
          // Mark as pending for retry
          for (const r of toPush) {
            this._pendingQueue.set(r.id, {
              report: r,
              retryCount: (this._pendingQueue.get(r.id)?.retryCount || 0) + 1,
              lastAttempt: new Date().toISOString(),
            });
          }
        }
      }

      // 5. Execute pulls
      for (const cloudReport of toPull) {
        try {
          // Fetch full report from cloud (list may only have summary)
          let fullReport = cloudReport;
          if (!cloudReport.items || cloudReport.items.length === 0) {
            try {
              const fetched = await fetchReport(cloudReport.id);
              if (fetched && fetched.items) fullReport = fetched;
            } catch (e) {
              // Use summary version
            }
          }

          const pulled = {
            ...fullReport,
            _version: fullReport._version || 1,
            _syncStatus: SyncStatus.SYNCED,
            _lastSyncedAt: new Date().toISOString(),
          };
          await saveLocalReport(pulled);
          this._updateMeta(pulled.id, { status: SyncStatus.SYNCED, version: pulled._version });
          result.pulled++;
        } catch (e) {
          result.errors.push(`Pull ${cloudReport.id} failed: ${e.message}`);
        }
      }

      // 6. Handle conflicts (last-write-wins by default, but track them)
      for (const conflict of result.conflicts) {
        const { localReport, cloudReport } = conflict;
        const localTime = new Date(localReport._localModifiedAt || localReport.updated_at || 0).getTime();
        const cloudTime = new Date(cloudReport.updated_at || 0).getTime();

        if (localTime >= cloudTime) {
          // Local is newer → push
          try {
            await saveReport(localReport.id, localReport);
            const synced = {
              ...localReport,
              _syncStatus: SyncStatus.SYNCED,
              _lastSyncedAt: new Date().toISOString(),
            };
            await saveLocalReport(synced);
            this._updateMeta(localReport.id, { status: SyncStatus.SYNCED });
            result.pushed++;
          } catch (e) {
            result.errors.push(`Conflict push ${localReport.id} failed: ${e.message}`);
          }
        } else {
          // Cloud is newer → pull (but preserve local-only fields)
          try {
            let fullCloud = cloudReport;
            if (!cloudReport.items) {
              try {
                fullCloud = await fetchReport(cloudReport.id);
              } catch (e) {}
            }
            const merged = {
              ...fullCloud,
              _version: Math.max(localReport._version || 0, fullCloud._version || 0) + 1,
              _syncStatus: SyncStatus.SYNCED,
              _lastSyncedAt: new Date().toISOString(),
            };
            await saveLocalReport(merged);
            this._updateMeta(merged.id, { status: SyncStatus.SYNCED, version: merged._version });
            result.pulled++;
          } catch (e) {
            result.errors.push(`Conflict pull ${cloudReport.id} failed: ${e.message}`);
          }
        }
      }

      await this._persistSyncMeta();
    } catch (err) {
      result.errors.push(`Sync error: ${err.message}`);
    } finally {
      this._isSyncing = false;
      this._notify({ type: 'sync_end', result });
    }

    return result;
  }

  // ─── Core: Process Offline Queue ────────────────────────────────

  async processQueue() {
    if (!this._isOnline || this._isSyncing) return;
    if (this._pendingQueue.size === 0) {
      // Check IndexedDB for any pending reports missed in memory
      try {
        const all = await getLocalReports();
        for (const r of all) {
          if (r._syncStatus === SyncStatus.PENDING || r._syncStatus === SyncStatus.FAILED) {
            if ((r._retryCount || 0) < MAX_RETRY_COUNT) {
              this._pendingQueue.set(r.id, {
                report: r,
                retryCount: r._retryCount || 0,
                lastAttempt: r._lastSyncAttempt || null,
              });
            }
          }
        }
      } catch (e) {}
    }

    if (this._pendingQueue.size === 0) return;

    // Process each pending report
    const entries = Array.from(this._pendingQueue.entries());
    for (const [reportId, entry] of entries) {
      if (entry.retryCount >= MAX_RETRY_COUNT) {
        // Mark as failed permanently
        const failed = {
          ...entry.report,
          _syncStatus: SyncStatus.FAILED,
          _retryCount: entry.retryCount,
        };
        await saveLocalReport(failed);
        this._updateMeta(reportId, { status: SyncStatus.FAILED });
        this._pendingQueue.delete(reportId);
        this._notify({ type: 'sync_failed', reportId });
        continue;
      }

      await this._pushSingleReport(reportId);
    }

    await this._persistSyncMeta();
  }

  // ─── Status Queries ─────────────────────────────────────────────

  /** Get sync status for a specific report */
  getReportSyncStatus(reportId) {
    if (!this._isOnline) return SyncStatus.OFFLINE;
    const meta = this._syncMeta.get(reportId);
    return meta?.status || SyncStatus.SYNCED;
  }

  /** Get count of pending reports */
  getPendingCount() {
    let count = 0;
    for (const [, meta] of this._syncMeta) {
      if (meta.status === SyncStatus.PENDING) count++;
    }
    return Math.max(count, this._pendingQueue.size);
  }

  /** Get overall sync status summary */
  getOverallStatus() {
    if (!this._isOnline) return SyncStatus.OFFLINE;
    if (this._isSyncing) return 'syncing';
    const pending = this.getPendingCount();
    if (pending > 0) return SyncStatus.PENDING;

    let hasConflict = false;
    let hasFailed = false;
    for (const [, meta] of this._syncMeta) {
      if (meta.status === SyncStatus.CONFLICT) hasConflict = true;
      if (meta.status === SyncStatus.FAILED) hasFailed = true;
    }
    if (hasConflict) return SyncStatus.CONFLICT;
    if (hasFailed) return SyncStatus.FAILED;
    return SyncStatus.SYNCED;
  }

  get isOnline() { return this._isOnline; }
  get isSyncing() { return this._isSyncing; }

  // ─── Private: Conflict Resolution Logic ─────────────────────────

  /**
   * Determine action for a report that exists both locally and in cloud.
   * Returns: 'push' | 'pull' | 'conflict' | 'equal'
   */
  _resolveConflict(local, cloud) {
    const localVersion = local._version || 0;
    const cloudVersion = cloud._version || 0;

    // If local has pending changes, it needs to push
    if (local._syncStatus === SyncStatus.PENDING) {
      const cloudTime = new Date(cloud.updated_at || 0).getTime();
      const localSyncedAt = new Date(local._lastSyncedAt || 0).getTime();

      if (cloudTime > localSyncedAt && localSyncedAt > 0) {
        // Cloud was also modified after our last sync → true conflict
        return 'conflict';
      }
      return 'push';
    }

    // Compare timestamps for non-pending local reports
    const localTime = new Date(local.updated_at || 0).getTime();
    const cloudTime = new Date(cloud.updated_at || 0).getTime();

    // If cloud is significantly newer (>2s gap to avoid clock drift)
    if (cloudTime - localTime > 2000) {
      return 'pull';
    }
    if (localTime - cloudTime > 2000) {
      return 'push';
    }

    return 'equal';
  }

  // ─── Private: Push Single Report to Cloud ───────────────────────

  async _pushSingleReport(reportId) {
    const entry = this._pendingQueue.get(reportId);
    if (!entry) return;

    try {
      // Re-read from IndexedDB to get latest version
      const latest = await getLocalReport(reportId);
      const reportToSend = latest || entry.report;

      // Migrate base64 photos → Supabase Storage (if configured)
      let migratedReport = reportToSend;
      try {
        migratedReport = await migrateReportPhotosToStorage(reportToSend);
        // If photos were migrated, update local copy with new URLs
        if (migratedReport !== reportToSend) {
          await saveLocalReport({ ...migratedReport, _syncStatus: SyncStatus.PENDING });
        }
      } catch (e) {
        console.warn('Photo migration skipped:', e.message);
      }

      // Strip internal sync fields before sending
      const cleanReport = { ...migratedReport };
      delete cleanReport._syncStatus;
      delete cleanReport._localModifiedAt;
      delete cleanReport._lastSyncedAt;
      delete cleanReport._retryCount;
      delete cleanReport._lastSyncAttempt;

      await saveReport(reportId, cleanReport);

      // Success → mark as synced
      const synced = {
        ...reportToSend,
        _syncStatus: SyncStatus.SYNCED,
        _lastSyncedAt: new Date().toISOString(),
        _retryCount: 0,
      };
      await saveLocalReport(synced);
      this._pendingQueue.delete(reportId);
      this._updateMeta(reportId, { status: SyncStatus.SYNCED, version: synced._version });

      this._notify({
        type: 'report_synced',
        reportId,
        version: synced._version,
      });
    } catch (e) {
      // Fail → increment retry
      entry.retryCount++;
      entry.lastAttempt = new Date().toISOString();
      this._pendingQueue.set(reportId, entry);

      // Update IndexedDB with retry info
      const local = await getLocalReport(reportId);
      if (local) {
        await saveLocalReport({
          ...local,
          _syncStatus: SyncStatus.PENDING,
          _retryCount: entry.retryCount,
          _lastSyncAttempt: entry.lastAttempt,
        });
      }

      this._notify({
        type: 'sync_retry',
        reportId,
        retryCount: entry.retryCount,
        error: e.message,
      });
    }
  }

  // ─── Private: Debounced Cloud Push ──────────────────────────────

  _scheduleCloudPush() {
    if (this._cloudDebounceTimer) clearTimeout(this._cloudDebounceTimer);
    this._cloudDebounceTimer = setTimeout(() => {
      this.processQueue();
    }, CLOUD_DEBOUNCE_MS);
  }

  _flushCloudDebounce() {
    if (this._cloudDebounceTimer) {
      clearTimeout(this._cloudDebounceTimer);
      this._cloudDebounceTimer = null;
    }
    // Attempt sync synchronously-ish via sendBeacon if available
    // or just fire processQueue
    if (this._pendingQueue.size > 0 && this._isOnline) {
      this.processQueue();
    }
  }

  // ─── Private: Resume Pull (on visibilitychange) ─────────────────

  /**
   * Lightweight pull when app resumes from background.
   * Fetches cloud list & updates local reports that are behind,
   * without the full bidirectional sync overhead.
   * Debounced to avoid double-fires.
   */
  async _resumePull() {
    // Debounce: skip if a full sync is running or was recent (<10s ago)
    if (this._isSyncing) return;
    const now = Date.now();
    if (this._lastResumePull && (now - this._lastResumePull) < 10_000) return;
    this._lastResumePull = now;

    try {
      const cloudList = await fetchReports();
      if (!Array.isArray(cloudList) || cloudList.length === 0) return;

      let pulled = 0;
      for (const cloud of cloudList) {
        if (!cloud || !cloud.id) continue;
        const local = await getLocalReport(cloud.id);

        if (!local) {
          // New report from cloud — pull it
          let fullReport = cloud;
          try {
            const fetched = await fetchReport(cloud.id);
            if (fetched && fetched.items) fullReport = fetched;
          } catch (e) {}

          await saveLocalReport({
            ...fullReport,
            _version: fullReport._version || 1,
            _syncStatus: SyncStatus.SYNCED,
            _lastSyncedAt: new Date().toISOString(),
          });
          pulled++;
        } else if (local._syncStatus !== SyncStatus.PENDING) {
          // Not pending → safe to update if cloud is newer
          const localTime = new Date(local.updated_at || 0).getTime();
          const cloudTime = new Date(cloud.updated_at || 0).getTime();

          if (cloudTime - localTime > 2000) {
            let fullReport = cloud;
            try {
              const fetched = await fetchReport(cloud.id);
              if (fetched && fetched.items) fullReport = fetched;
            } catch (e) {}

            await saveLocalReport({
              ...fullReport,
              _version: Math.max(local._version || 0, fullReport._version || 0),
              _syncStatus: SyncStatus.SYNCED,
              _lastSyncedAt: new Date().toISOString(),
            });
            this._updateMeta(cloud.id, { status: SyncStatus.SYNCED });
            pulled++;
          }
        }
      }

      if (pulled > 0) {
        this._notify({ type: 'resume_pull', pulled });
      }
    } catch (e) {
      console.warn('Resume pull failed:', e);
    }
  }

  // ─── Private: Background Sync Timer ─────────────────────────────

  _startBackgroundSync() {
    if (this._backgroundTimer) clearInterval(this._backgroundTimer);
    this._backgroundTimer = setInterval(() => {
      if (this._isOnline && !this._isSyncing) {
        this.processQueue();
      }
    }, SYNC_INTERVAL_MS);
  }

  // ─── Private: Sync Metadata Persistence ─────────────────────────

  _updateMeta(reportId, update) {
    const existing = this._syncMeta.get(reportId) || {};
    this._syncMeta.set(reportId, { ...existing, ...update, lastUpdated: Date.now() });
  }

  async _loadSyncMeta() {
    try {
      const raw = localStorage.getItem(SYNC_STATUS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) {
            this._syncMeta.set(k, v);
          }
        }
      }
    } catch (e) {}
  }

  async _persistSyncMeta() {
    try {
      const obj = {};
      for (const [k, v] of this._syncMeta) {
        obj[k] = v;
      }
      localStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(obj));
    } catch (e) {}
  }

  // ─── Private: Helpers ───────────────────────────────────────────

  _hasRealContent(report) {
    return Boolean(
      (report.title && report.title !== 'New Flash Report') ||
      report.system_tag ||
      (report.items && report.items.some(it =>
        it.tag?.trim() || it.description?.trim() ||
        (it.photos && it.photos.length > 0)
      ))
    );
  }
}

// ─── Singleton Export ─────────────────────────────────────────────
const syncEngine = new SyncEngine();
export default syncEngine;
