import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Save, Download, FileSpreadsheet, FileText, Printer,
  Sparkles, Check, RefreshCw, AlertCircle, Share2, Menu,
  Laptop, Smartphone, Sliders, ChevronDown, Link as LinkIcon,
  Lock, Unlock
} from 'lucide-react';
import Sidebar from './components/Sidebar';
import HeaderForm from './components/HeaderForm';
import InspectionTable from './components/InspectionTable';
import DeleteModal from './components/DeleteModal';
import ImageModal from './components/ImageModal';
import FilePreviewModal from './components/FilePreviewModal';
import ConfirmModal from './components/ConfirmModal';
import ShareModal from './components/ShareModal';
import FileViewer from './components/FileViewer';
import SharedViewRouter from './components/SharedViewRouter';
import MiniPlanWorkspace from './components/MiniPlanWorkspace';
import OpsFindingsWorkspace from './components/OpsFindingsWorkspace';
import PasswordModal from './components/PasswordModal';
import Toast from './components/Toast';
import { compactReportPhotos } from './services/imageCompression';
import { fileKey } from './services/firebase';
import {
  putAttachment, getAttachmentBlob, deleteAttachment, openBlob, formatBytes,
  copyAttachmentToShare,
  collectAttachments,
} from './services/fileAttachments';
import SyncStatusIndicator from './components/SyncStatusIndicator';
import {
  fetchReports, fetchReport, createReport, saveReport,
  deleteReport, duplicateReport, batchSyncReports
} from './services/api';
import {
  getLocalReports, getLocalReport, saveLocalReport, deleteLocalReport
} from './services/clientStorage';
import {
  exportExcelClient, exportPdfClient
} from './services/clientExport';
import {
  publishReportForSharing, republishIfShared
} from './services/shareService';
import syncEngine, { SyncStatus } from './services/syncEngine';
import realtimeSync from './services/realtimeSync';
import {
  MINI_PLAN_TYPE, MINI_PLAN_LABEL, isMiniPlan,
  normalizeMiniPlanItems, makeMiniPlanRow, makeGroupId,
} from './services/miniPlan';
import { deletePhotoBytes, refOf } from './services/miniPlanLive';
import { MINI_PLAN_SEED, MINI_PLAN_DEFAULT_TITLE } from './services/miniPlanSeed';
import {
  isMiniPlanUnlocked, unlockMiniPlan, lockMiniPlan, onMiniPlanLockChange,
} from './services/miniPlanAuth';
import { lockApp } from './services/appLock';
import {
  OPS_FINDINGS_TYPE, OPS_FINDINGS_LABEL, OPS_DEFAULT_SUBTITLE, OPS_DEFAULT_SECTION,
  isOpsFindings, normalizeOpsItems, makeOpsFinding, todayKeyLocal,
} from './services/opsFindings';
import {
  isOpsSectionUnlocked, unlockOpsSection, lockOpsSection, onOpsLockChange, sectionLetter,
} from './services/opsAuth';

export default function App() {
  // Check if current route is a shared viewer link e.g. #/view/:id
  const [currentHash, setCurrentHash] = useState(window.location.hash);

  useEffect(() => {
    const handleHashChange = () => setCurrentHash(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Shared View Mode Detection
  const hash = currentHash || window.location.hash || '';
  const search = window.location.search || '';

  // Public attachment route: #/file/<shareId>/<key>. Checked first — it must
  // not fall through to the (deliberately loose) shared-report test below.
  const fileRouteMatch = hash.match(/#\/file\/([^/?]+)\/([^/?]+)/);

  const isViewRoute = !fileRouteMatch &&
    (hash.includes('/view') || hash.includes('view') || search.includes('view'));

  let sharedReportId = null;
  if (isViewRoute) {
    if (hash.includes('/view/')) {
      sharedReportId = hash.split('/view/')[1].split('?')[0];
    } else if (hash.includes('/view')) {
      sharedReportId = 'shared';
    } else if (search.includes('view=')) {
      sharedReportId = new URLSearchParams(search).get('view');
    } else {
      sharedReportId = 'shared';
    }
  }

  const [reports, setReports] = useState([]);
  const [activeReportId, setActiveReportId] = useState(null);
  const [currentReport, setCurrentReport] = useState(null);
  const [loading, setLoading] = useState(!isViewRoute);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // ─── NEW: Sync Engine State ─────────────────────────────────────
  const [syncStatus, setSyncStatus] = useState(SyncStatus.SYNCED);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncResult, setLastSyncResult] = useState(null);

  // Live "Uploading photo 3 of 8" feedback. Without it a large first sync is
  // indistinguishable from a hang, which is exactly how the old build felt.
  const [uploadProgress, setUploadProgress] = useState(null);

  // Responsive device view mode: 'auto' | 'laptop' | 'phone'
  const [viewMode, setViewMode] = useState('auto');
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Splitter width state (persisted)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('flash_report_sidebar_width');
    return saved ? parseInt(saved, 10) : 320;
  });
  const [isResizing, setIsResizing] = useState(false);

  // Modals state
  const [deleteModalState, setDeleteModalState] = useState({ isOpen: false, id: null, title: '' });
  const [imageModalState, setImageModalState] = useState({ isOpen: false, index: 0 });
  const [shareModalState, setShareModalState] = useState({ isOpen: false, shareUrl: '', reportTitle: '' });
  const [toast, setToast] = useState({ message: '', type: 'success', action: null });
  const [isExporting, setIsExporting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Mini Plan edit lock. Held in sessionStorage by services/miniPlanAuth so a
  // reload of the shared link re-locks; mirrored into state so the table, the
  // header badge and the Share button all flip together.
  const [miniPlanUnlocked, setMiniPlanUnlocked] = useState(isMiniPlanUnlocked());
  const [passwordPrompt, setPasswordPrompt] = useState(null); // null | { then }

  useEffect(() => onMiniPlanLockChange(setMiniPlanUnlocked), []);

  // A Mini Plan is read-only until the project password is entered. Both
  // editing and ISSUING THE SHARE LINK sit behind it - handing somebody a live
  // link is as consequential as changing the plan, so it is gated the same way.
  const isPlanReport = isMiniPlan(currentReport);
  // OPS Findings & Action Tracking — not password locked in the app; its
  // share link is read-only instead.
  const isOpsReport = isOpsFindings(currentReport);
  // What the OPS table is showing right now (filter + rows), so an export
  // follows the screen. A ref: it changes on every keystroke in the search box
  // and nothing needs to re-render for it.
  const opsViewRef = useRef(null);
  // Per-section edit locks of the OPS report (services/opsAuth.js). The tick
  // re-renders the workspace when a tab is unlocked or locked anywhere.
  const [, setOpsLockTick] = useState(0);
  useEffect(() => onOpsLockChange(() => setOpsLockTick((n) => n + 1)), []);
  const [opsAsk, setOpsAsk] = useState(null);     // { letter, section }
  const planLocked = isPlanReport && !miniPlanUnlocked;

  /** Run `action` now, or after the password is accepted. */
  const requirePlanPassword = (action) => {
    if (!planLocked) { action(); return; }
    setPasswordPrompt({ then: action });
  };

  const autoSaveTimerRef = useRef(null);
  const republishTimerRef = useRef(null);
  const undoDeleteRef = useRef(null);

  // Realtime callbacks fire outside React's render cycle, so they read these
  // refs rather than closing over possibly-stale state.
  const hasUnsavedRef = useRef(false);
  const activeReportIdRef = useRef(null);
  useEffect(() => { hasUnsavedRef.current = hasUnsavedChanges; }, [hasUnsavedChanges]);
  useEffect(() => { activeReportIdRef.current = activeReportId; }, [activeReportId]);

  // Listen to window resize
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isPhoneView = viewMode === 'phone' || (viewMode === 'auto' && windowWidth < 768);

  const showToast = (message, type = 'success', action = null) => {
    setToast({ message, type, action });
  };

  // Last-resort watchdog. Every cloud call is individually bounded now, but a
  // spinner that cannot be dismissed is bad enough that it gets a second net:
  // after this long the UI unlocks no matter what, and the queue keeps working
  // in the background.
  useEffect(() => {
    if (!isSyncing) return;
    const timer = setTimeout(() => {
      setIsSyncing(false);
      setUploadProgress(null);
      showToast('Sync is taking too long — it will keep retrying in the background.', 'info');
    }, 180_000);
    return () => clearTimeout(timer);
  }, [isSyncing]);

  // One-time compaction of reports created before ingest compression existed.
  //
  // Those reports hold multi-megabyte photos. Without this they would be
  // recompressed on every sync and every share for the rest of their life, and
  // the first sync after this update would still be slow. Compacting once, in
  // the background, makes the report permanently light — and the smaller
  // photos are then pushed up, replacing the oversized cloud documents.
  const compactedRef = useRef(new Set());
  useEffect(() => {
    const id = currentReport?.id;
    if (!id || isViewRoute) return;
    if (compactedRef.current.has(id)) return;
    if (hasUnsavedChanges) return; // never rewrite a report mid-edit
    compactedRef.current.add(id);

    let cancelled = false;
    (async () => {
      try {
        const { report: compacted, changed } = await compactReportPhotos(currentReport, {
          onProgress: (done, total) =>
            !cancelled && setUploadProgress({ done: done - 1, total, phase: 'compact' }),
        });
        if (cancelled) return;
        setUploadProgress(null);
        if (!changed) return;

        const next = { ...compacted, _syncStatus: SyncStatus.PENDING };
        setCurrentReport((prev) => (prev?.id === id ? next : prev));
        await saveLocalReport(next);
        syncEngine.processQueue();
      } catch (e) {
        if (!cancelled) setUploadProgress(null);
        console.warn('Photo compaction skipped:', e.message);
      }
    })();

    return () => { cancelled = true; };
  }, [currentReport?.id, isViewRoute]);

  // Photo upload progress, emitted by api.js and shareService.js.
  useEffect(() => {
    const onProgress = (e) => {
      const { done, total, phase } = e.detail || {};
      if (!total || phase === 'done' || done >= total) {
        setUploadProgress(null);
      } else {
        setUploadProgress({ done, total, phase });
      }
    };
    window.addEventListener('flashreport:upload-progress', onProgress);
    return () => window.removeEventListener('flashreport:upload-progress', onProgress);
  }, []);

  // ─── NEW: Initialize SyncEngine & Subscribe to Events ───────────
  useEffect(() => {
    if (isViewRoute) return;

    syncEngine.init();

    const unsubscribe = syncEngine.subscribe((event) => {
      switch (event.type) {
        case 'sync_start':
          setIsSyncing(true);
          setSyncStatus('syncing');
          break;

        case 'sync_end':
          setIsSyncing(false);
          setUploadProgress(null);
          setLastSyncResult(event.result);
          setSyncStatus(syncEngine.getOverallStatus());
          setPendingCount(syncEngine.getPendingCount());

          // Refresh reports list after sync
          refreshReportsList();

          if (event.result) {
            const { pushed, pulled, conflicts, errors } = event.result;
            if (errors.length === 0) {
              if (pushed > 0 || pulled > 0) {
                showToast(
                  `Sync OK! ${pushed > 0 ? `Pushed ${pushed}` : ''} ${pulled > 0 ? `Pulled ${pulled}` : ''} ${conflicts.length > 0 ? `(${conflicts.length} conflicts resolved)` : ''}`.trim(),
                  'success'
                );
              }
            } else {
              showToast(`Sync: ${errors[0]}`, 'error');
            }
          }
          break;

        case 'report_saved_local':
          setPendingCount(syncEngine.getPendingCount());
          setSyncStatus(syncEngine.getOverallStatus());
          break;

        case 'report_synced':
          setPendingCount(syncEngine.getPendingCount());
          setSyncStatus(syncEngine.getOverallStatus());
          break;

        case 'sync_failed':
          setSyncStatus(SyncStatus.FAILED);
          showToast('Sync failed for a report after multiple retries', 'error');
          break;

        case 'online':
          showToast('Back online — syncing...', 'success');
          setSyncStatus(syncEngine.getOverallStatus());
          break;

        case 'offline':
          setSyncStatus(SyncStatus.OFFLINE);
          showToast('You are offline. Changes saved locally.', 'info');
          break;

        case 'resume_pull':
          // App returned from background — refresh list and active report
          refreshReportsList();
          if (activeReportId) {
            getLocalReport(activeReportId).then((fresh) => {
              if (fresh && fresh.items) {
                setCurrentReport(fresh);
              }
            });
          }
          if (event.pulled > 0) {
            showToast(`Pulled ${event.pulled} update(s) from cloud`, 'success');
          }
          break;

        default:
          break;
      }
    });

    return () => {
      unsubscribe();
      syncEngine.destroy();
    };
  }, [isViewRoute]);

  // ─── Helper: Refresh reports list from local + cloud ────────────
  const refreshReportsList = async () => {
    try {
      const localList = await getLocalReports();
      setReports(localList);
    } catch (e) {
      console.warn('Refresh reports list error:', e);
    }
  };

  /**
   * Merge a realtime LIST snapshot. Headers only — this must never touch
   * `items`, or a remote list row would blank out photos this device holds
   * (ERROR_LOG BUG-011).
   */
  const mergeRemoteHeaders = async (headers) => {
    try {
      const localList = await getLocalReports();
      const localById = new Map(localList.map((r) => [r.id, r]));
      const remoteIds = new Set(headers.map((h) => h.id));

      for (const h of headers) {
        const local = localById.get(h.id);

        // Never clobber a report with local edits still waiting to be pushed.
        if (local && local._syncStatus === SyncStatus.PENDING) continue;

        if (local) {
          const changed =
            local.title !== h.title ||
            local.report_type !== h.report_type ||
            local.system_tag !== h.system_tag ||
            local.location !== h.location ||
            local.inspection_date !== h.inspection_date ||
            local.discipline !== h.discipline ||
            local.updated_at !== h.updated_at;
          if (!changed) continue;

          // Spread local FIRST so its `items` survive the header overlay.
          await saveLocalReport(keepShareId({
            ...local, ...h,
            items: local.items,
            _syncStatus: SyncStatus.SYNCED,
          }, local));
        } else {
          // A report created on another device. Stored header-only; the full
          // document (with photos) is fetched when the user opens it.
          await saveLocalReport({ ...h, _syncStatus: SyncStatus.SYNCED });
        }
      }

      // Reports deleted elsewhere. Only drop ones we know were synced —
      // a local-only draft is absent from the cloud legitimately.
      for (const local of localList) {
        if (remoteIds.has(local.id)) continue;
        if (local._syncStatus === SyncStatus.SYNCED) {
          await deleteLocalReport(local.id);
        }
      }

      await refreshReportsList();
    } catch (e) {
      console.warn('Remote header merge failed:', e);
    }
  };

  // ─── Realtime: live updates across phone and laptop ──────────────
  useEffect(() => {
    if (isViewRoute) return;

    realtimeSync.startList();

    const unsub = realtimeSync.subscribe(async (ev) => {
      switch (ev.type) {
        case 'remote_list':
          await mergeRemoteHeaders(ev.reports);
          break;

        case 'remote_report': {
          // Only adopt a remote version of the report the user is looking at,
          // and only while they have nothing unsaved (BUG-001).
          if (ev.report.id !== activeReportIdRef.current) return;
          if (hasUnsavedRef.current) return;

          // Same protection as loadSingleReport: a remote copy whose photo
          // slots came back empty must not wipe images held only here.
          const localCopy = await getLocalReport(ev.report.id);
          const safe = keepShareId({
            ...ev.report,
            items: mergePhotosPreferLocal(ev.report.items, localCopy?.items),
            _syncStatus: SyncStatus.SYNCED,
          }, localCopy);
          delete safe._photosIncomplete;

          setCurrentReport(safe);
          await saveLocalReport(safe);
          await refreshReportsList();
          showToast('Updated from another device', 'info');
          break;
        }

        case 'remote_deleted':
          if (ev.reportId === activeReportIdRef.current) {
            showToast('This report was deleted on another device', 'info');
          }
          break;

        default:
          break;
      }
    });

    return () => {
      unsub();
      realtimeSync.stop();
    };
  }, [isViewRoute]);

  // Follow the active report with a document listener.
  useEffect(() => {
    if (isViewRoute) return;
    realtimeSync.watchReport(activeReportId);
  }, [activeReportId, isViewRoute]);

  // A photo that cannot be made to fit a Firestore document stays on this
  // device only. That used to be a console warning nobody saw — surface it.
  useEffect(() => {
    const onSkipped = (e) => {
      const list = e.detail?.skipped || [];
      if (list.length === 0) return;
      const slots = list.map((x) => `Photo ${x.slot}`).join(', ');
      showToast(
        `${slots} too large to sync — kept on this device only. Retake at a lower resolution to share ${list.length > 1 ? 'them' : 'it'}.`,
        'error'
      );
    };
    window.addEventListener('flashreport:photos-skipped', onSkipped);
    return () => window.removeEventListener('flashreport:photos-skipped', onSkipped);
  }, []);

  // Cloud-First Initial Loader & Synchronizer (Never Auto-Creates Blank Reports)
  const loadReportsList = async (preferredSelectId = null) => {
    if (isViewRoute) return;
    try {
      // 1. Fetch Cloud list (Master Truth)
      let cloudList = [];
      try {
        cloudList = await fetchReports();
      } catch (e) {
        console.warn('Cloud reports list note:', e);
      }

      // 2. Fetch local IndexedDB list
      const localList = await getLocalReports();

      // 3. Build unified list — Cloud + Local merge with version awareness
      const map = new Map();

      // Add cloud reports first (as baseline)
      cloudList.forEach((r) => {
        map.set(r.id, {
          ...r,
          _syncStatus: SyncStatus.SYNCED,
          _lastSyncedAt: new Date().toISOString(),
        });
      });

      // Merge local reports
      localList.forEach((r) => {
        const existing = map.get(r.id);
        if (!existing) {
          // Only in local → keep it (mark pending)
          if (r.title && r.title !== 'New Flash Report') {
            map.set(r.id, { ...r, _syncStatus: r._syncStatus || SyncStatus.PENDING });
          }
          return;
        }

        // `fetchReports` is a LIST query: it returns report headers without
        // the `items` array, because shipping every photo in the list would
        // be enormous. A list row must therefore never be treated as a
        // complete report — merging one over a local record erases its
        // items and photos. See ERROR_LOG BUG-011.
        const cloudHasItems = Array.isArray(existing.items);
        const localItems = Array.isArray(r.items) ? r.items : [];

        const localTime = new Date(r._localModifiedAt || r.updated_at || 0).getTime();
        const cloudTime = new Date(existing.updated_at || 0).getTime();
        const localIsNewer = localTime > cloudTime && r._syncStatus === SyncStatus.PENDING;

        if (localIsNewer || !cloudHasItems) {
          // Keep the local record whole. When the cloud row carries no items
          // there is nothing there worth merging in — the full document is
          // only fetched later, by loadSingleReport.
          map.set(r.id, {
            ...r,
            _version: Math.max(r._version || 0, existing._version || 0),
            _syncStatus: r._syncStatus || SyncStatus.SYNCED,
            _lastSyncedAt: existing._lastSyncedAt || r._lastSyncedAt,
          });
        } else {
          // Cloud is newer AND actually carries items → cloud wins, but never
          // hand back fewer items than we already hold locally.
          const merged = existing.items.length >= localItems.length ? existing.items : localItems;
          map.set(r.id, {
            ...existing,
            items: merged,
            _version: Math.max(r._version || 0, existing._version || 0),
            _syncStatus: r._syncStatus === SyncStatus.PENDING ? SyncStatus.PENDING : SyncStatus.SYNCED,
            _lastSyncedAt: existing._lastSyncedAt || r._lastSyncedAt,
          });
        }
      });

      // Persist the merge — but only for records that carry an items array.
      // Writing a header-only row here is what destroyed reports previously.
      for (const [, r] of map) {
        if (!Array.isArray(r.items)) continue;
        saveLocalReport(r).catch(() => {});
      }

      const mergedList = Array.from(map.values()).sort(
        (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
      );

      setReports(mergedList);

      // Update sync status counts
      setPendingCount(mergedList.filter(r => r._syncStatus === SyncStatus.PENDING).length);
      setSyncStatus(syncEngine.getOverallStatus());

      // Determine target report to open
      const lastActiveId = localStorage.getItem('flash_report_last_active_id');
      let targetId = preferredSelectId || lastActiveId;
      if (!targetId || !mergedList.some((r) => r.id === targetId)) {
        targetId = mergedList.length > 0 ? mergedList[0].id : null;
      }

      if (targetId) {
        await loadSingleReport(targetId);
      }
      // NOTHING is created just because the app opened. An empty workspace is
      // an empty workspace; a report appears when the user asks for one
      // (BUG-046). This used to fire whenever the list came back empty — a
      // slow first sync was enough — and left stray "Untitled" reports behind.

      // 4. Trigger background sync to push any pending local reports
      if (mergedList.some(r => r._syncStatus === SyncStatus.PENDING)) {
        syncEngine.processQueue();
      }
    } catch (err) {
      console.error('Error loading reports:', err);
      showToast('Could not load reports', 'error');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Combine cloud items with local ones, keeping a LOCAL photo whenever the
   * cloud slot has no image. Cloud photos live in a subcollection behind
   * `photo_ref` pointers, so an empty slot means "not fetched" at least as
   * often as it means "deleted" — and guessing wrong destroys the only copy.
   * Text fields always come from the cloud; only images are protected.
   */
  const mergePhotosPreferLocal = (cloudItems, localItems) => {
    if (!Array.isArray(cloudItems)) return localItems || [];
    if (!Array.isArray(localItems) || localItems.length === 0) return cloudItems;

    const localById = new Map(localItems.map((it, i) => [it?.id || `item_${i}`, it]));

    return cloudItems.map((item, idx) => {
      const local = localById.get(item?.id || `item_${idx}`);
      if (!local || !Array.isArray(item?.photos)) return item;

      return {
        ...item,
        photos: item.photos.map((p, pIdx) => {
          if (p && p.kind === 'file') return p; // attachment, not an image
          if (p && p.url) return p;             // cloud has the image
          const slot = p?.slot_index ?? pIdx;
          const localPhoto = (local.photos || []).find(
            (lp, li) => lp && lp.url && (lp.slot_index ?? li) === slot
          );
          return localPhoto ? { ...(p || {}), ...localPhoto } : p;
        }),
      };
    });
  };

  /**
   * Keep a share id the cloud copy does not have.
   *
   * Same shape of rule as the photo merge: an EMPTY field arriving from the
   * cloud means "this copy predates the share" at least as often as it means
   * "the share was withdrawn". Losing it breaks `republishIfShared` silently
   * and freezes a link the user still believes is live.
   */
  const keepShareId = (incoming, local) => {
    const id = incoming?.share_id || incoming?.cloud_code || local?.share_id || local?.cloud_code || '';
    if (!id) return incoming;
    return { ...incoming, share_id: id, cloud_code: id };
  };

  /** True when this device holds at least one image the cloud copy is missing. */
  const localHasPhotoCloudLacks = (cloudItems, localItems) => {
    if (!Array.isArray(cloudItems) || !Array.isArray(localItems)) return false;
    const localById = new Map(localItems.map((it, i) => [it?.id || `item_${i}`, it]));

    return cloudItems.some((item, idx) => {
      const local = localById.get(item?.id || `item_${idx}`);
      if (!local || !Array.isArray(item?.photos)) return false;
      return item.photos.some((p, pIdx) => {
        if (p && p.kind === 'file') return false; // attachment, not an image
        if (p && p.url) return false;
        const slot = p?.slot_index ?? pIdx;
        return (local.photos || []).some(
          (lp, li) => lp && lp.url && (lp.slot_index ?? li) === slot
        );
      });
    });
  };

  const loadSingleReport = async (id) => {
    if (!id) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    try {
      // 1. Check local IndexedDB first (instant)
      let rep = await getLocalReport(id);
      if (rep && rep.title && Array.isArray(rep.items) && rep.items.length > 0) {
        setCurrentReport(rep);
        setActiveReportId(id);
        localStorage.setItem('flash_report_last_active_id', id);
        setHasUnsavedChanges(false);
      }

      // 2. Fetch fresh from Cloud
      try {
        const cloudRep = await fetchReport(id);
        if (cloudRep && cloudRep.title) {
          // ─── NEW: Conflict-aware merge ─────────────────────────
          if (rep && rep._syncStatus === SyncStatus.PENDING) {
            // Local has unsaved changes → DON'T overwrite!
            // Compare timestamps to decide
            const localTime = new Date(rep._localModifiedAt || rep.updated_at || 0).getTime();
            const cloudTime = new Date(cloudRep.updated_at || 0).getTime();

            if (cloudTime > localTime) {
              // Cloud is genuinely newer → notify user of conflict
              showToast('Cloud has newer changes. Your local edits are preserved. Tap Sync to merge.', 'info');
              // Don't overwrite — user can manually sync
              return;
            }
            // Local is newer → keep local, don't overwrite
            return;
          }

          // No local pending changes → safe to take the cloud text.
          // Photos are a different matter: the cloud copy stores them as
          // pointers into a subcollection, so a slot can come back empty
          // simply because that read failed or the bytes were never written.
          // Overwriting a local image with an empty slot destroys the only
          // copy — which is exactly what used to happen (BUG-012).
          const merged = keepShareId({
            ...cloudRep,
            items: mergePhotosPreferLocal(cloudRep.items, rep?.items),
            _version: Math.max(rep?._version || 0, cloudRep._version || 0),
            _syncStatus: SyncStatus.SYNCED,
            _lastSyncedAt: new Date().toISOString(),
          }, rep);
          delete merged._photosIncomplete;

          setCurrentReport(merged);
          setActiveReportId(id);
          localStorage.setItem('flash_report_last_active_id', id);
          setHasUnsavedChanges(false);
          await saveLocalReport(merged);

          // A photo held only on this device is one power-cycle from being
          // lost, so push it back up rather than leaving it stranded.
          if (cloudRep._photosIncomplete && localHasPhotoCloudLacks(cloudRep.items, rep?.items)) {
            syncEngine.saveReport({ ...merged, _syncStatus: SyncStatus.PENDING })
              .then(() => syncEngine.processQueue())
              .catch((e) => console.warn('Photo re-push failed:', e.message));
          }
          return;
        }
      } catch (e) {
        console.warn('Cloud single report fetch note:', e);
      }

      // 3. Fallback: if not loaded yet, construct from existing reports summary
      if (!rep) {
        const summary = reports.find((r) => r.id === id);
        if (summary) {
          rep = {
            id: summary.id,
            title: summary.title || 'Untitled Flash Report',
            system_tag: summary.system_tag || '',
            location: summary.location || '',
            inspection_date: summary.inspection_date || new Date().toISOString().split('T')[0],
            discipline: summary.discipline || 'Mechanical',
            items: [
              { id: `${summary.id}_1`, tag: summary.system_tag || '', description: '', note: '', photos: [] }
            ],
            _version: 1,
            _syncStatus: SyncStatus.PENDING,
          };
          setCurrentReport(rep);
          setActiveReportId(id);
          localStorage.setItem('flash_report_last_active_id', id);
          setHasUnsavedChanges(false);
        }
      }
    } catch (err) {
      console.error('Error loading report:', err);
      showToast('Failed to load report data', 'error');
    }
  };

  /**
   * Every image in the report, in reading order. The lightbox needs the whole
   * set so the reviewer can move between photos instead of closing and
   * reopening one at a time. File attachments are skipped — they are not
   * images and have nothing to show in a gallery.
   */
  const galleryPhotos = React.useMemo(() => {
    const out = [];
    (currentReport?.items || []).forEach((item, i) => {
      (item.photos || []).forEach((p, sIdx) => {
        if (p && p.url && p.kind !== 'file') {
          out.push({
            url: p.url,
            filename: p.filename || `Item ${i + 1} · Photo ${(p.slot_index ?? sIdx) + 1}`,
            // Where this photo LIVES, so the lightbox can delete the one on
            // screen rather than the first row that happens to share its url.
            itemIndex: i,
            photoIndex: sIdx,
            slotIndex: p.slot_index ?? sIdx,
          });
        }
      });
    });
    return out;
  }, [currentReport]);

  /**
   * Delete the photo currently open in the lightbox.
   *
   * Addressed by ITEM + SLOT, never by url: two rows can legitimately hold the
   * same image (the same detail photographed for two activities), and matching
   * on the url would delete whichever came first.
   */
  /** Delete the stored bytes of a photo that has just been removed. */
  const dropPlanPhotoBytes = (item, photo) => {
    const ref = photo?.photo_ref || refOf(item, photo, photo?.slot_index ?? 0);
    deletePhotoBytes(currentReport?.share_id || '', currentReport?.id || '', ref)
      .catch((e) => console.warn('Photo bytes not removed:', e?.message));
  };

  /**
   * Attach a document to a Mini Plan row.
   *
   * Same storage as every other attachment in the project: the bytes go to the
   * report AND, when the plan is shared, to the shared copy — which is what
   * the public file page reads, so a recipient of the link or of the exported
   * report opens the file by clicking its name.
   */
  const handlePlanAttach = async (item, itemIndex, file, slotIndex) => {
    if (!currentReport || !file) return null;
    const key = fileKey(item?.id || `item_${itemIndex}`, slotIndex);
    try {
      const descriptor = await putAttachment('report', currentReport.id, key, file);
      const shareId = currentReport.share_id || currentReport.cloud_code || '';
      if (shareId) {
        try { await copyAttachmentToShare(currentReport.id, shareId, key); }
        catch (e) { console.warn('File not copied to the share:', e.message); }
      }
      showToast(`Attached ${file.name} (${formatBytes(file.size)})`, 'success');
      return { ...descriptor, id: `file_${Date.now()}_${slotIndex}` };
    } catch (err) {
      console.error('Attach failed:', err);
      showToast(err.message || 'Could not attach that file', 'error');
      return null;
    }
  };

  const handleDeletePhoto = (photo) => {
    if (!currentReport || !photo || planLocked) return;
    const items = currentReport.items || [];
    const item = items[photo.itemIndex];
    if (!item) return;

    const gone = (item.photos || []).find((p, idx) =>
      p && (p.slot_index ?? idx) === photo.slotIndex && idx === photo.photoIndex
    );
    const photos = (item.photos || []).filter((p, idx) =>
      !(p && (p.slot_index ?? idx) === photo.slotIndex && idx === photo.photoIndex)
    );
    const nextItems = items.map((it, i) => (i === photo.itemIndex ? { ...it, photos } : it));
    handleItemsChange(nextItems);
    if (gone) dropPlanPhotoBytes(item, gone);

    // Keep the viewer on something sensible instead of a dangling index.
    // A viewer opened on ONE ROW (Mini Plan, OPS Findings) carries its own
    // list: drop the deleted entry from it — otherwise the picture just
    // deleted stays on screen — and shift the positions of the ones after it
    // in the same row, since the row's photos array has just closed up.
    setImageModalState((st) => {
      if (Array.isArray(st.photos)) {
        const rest = st.photos
          .filter((x) => !(x.itemIndex === photo.itemIndex && x.photoIndex === photo.photoIndex))
          .map((x) => (x.itemIndex === photo.itemIndex && x.photoIndex > photo.photoIndex
            ? { ...x, photoIndex: x.photoIndex - 1 } : x));
        if (!rest.length) return { isOpen: false, index: 0 };
        return { ...st, photos: rest, index: Math.min(st.index, rest.length - 1) };
      }
      const remaining = galleryPhotos.length - 1;
      if (remaining <= 0) return { isOpen: false, index: 0 };
      return { ...st, index: Math.min(st.index, remaining - 1) };
    });
    showToast('Photo deleted', 'success');
  };

  /**
   * Open the viewer on the row that was clicked, and on nothing else.
   *
   * Sliding used to run through every picture in the plan — hundreds of them —
   * when what the user wanted was the two or three attached to THIS activity.
   * Files slide with the pictures: a slot holds either.
   */
  const openPlanLightbox = (entry, rowEntries, itemIndex) => {
    const list = (rowEntries || []).filter(Boolean).map((p, i) => ({
      ...p,
      itemIndex,
      photoIndex: i,
      slotIndex: p.slot_index ?? i,
    }));
    if (!list.length) return;
    const at = list.findIndex((p) => (entry?.id ? p.id === entry.id : p.url === entry?.url));
    setImageModalState({ isOpen: true, index: at < 0 ? 0 : at, photos: list });
  };

  const openLightboxByUrl = (url) => {
    const idx = galleryPhotos.findIndex((g) => g.url === url);
    setImageModalState({ isOpen: true, index: idx >= 0 ? idx : 0 });
  };

  /** Attach a file to a photo slot. The bytes go to Firestore, not the report. */
  const handleAttachFile = async (itemIndex, slotIndex, file) => {
    if (!currentReport || !file) return;
    const item = (currentReport.items || [])[itemIndex];
    if (!item) return;
    const itemId = item.id || `item_${itemIndex}`;
    const key = fileKey(itemId, slotIndex);

    try {
      const descriptor = await putAttachment('report', currentReport.id, key, file);

      const newItems = [...(currentReport.items || [])];
      const photos = [...(newItems[itemIndex].photos || [])];
      while (photos.length <= slotIndex) photos.push(null);
      photos[slotIndex] = {
        ...descriptor,
        id: `file_${Date.now()}_${slotIndex}`,
        slot_index: slotIndex,
      };
      newItems[itemIndex] = { ...newItems[itemIndex], photos };
      handleItemsChange(newItems);

      showToast(`Attached ${file.name} (${formatBytes(file.size)})`, 'success');
    } catch (err) {
      console.error('Attach failed:', err);
      showToast(err.message || 'Could not attach that file', 'error');
    }
  };

  const [filePreview, setFilePreview] = useState({ isOpen: false, blob: null, filename: '', mime: '', size: 0 });

  const handleOpenAttachment = async (photo, item, itemIndex) => {
    if (!currentReport) return;
    // An older descriptor may carry no pointer; it can still be rebuilt from
    // the row it sits in, which is how it was stored in the first place.
    const ref = photo?.file_ref
      || (item ? fileKey(item.id || `item_${itemIndex}`, photo?.slot_index ?? 0) : '');
    if (!ref) { showToast('That attachment has no file reference.', 'error'); return; }
    showToast(`Opening ${photo?.filename || 'file'}…`, 'info');
    try {
      // Look in BOTH copies: a file attached through the share link lands in
      // the shared one first, and a file attached here is copied there.
      let got = await getAttachmentBlob('report', currentReport.id, ref);
      const shareId = currentReport.share_id || currentReport.cloud_code || '';
      if (!got && shareId) got = await getAttachmentBlob('shared', shareId, ref);
      if (!got) {
        showToast('That file is not fully uploaded yet — try again in a moment.', 'error');
        return;
      }
      // Shown in the app, not written to disk. Downloading is a button the
      // user presses, not a side effect of looking (BUG-045).
      setFilePreview({
        isOpen: true,
        blob: got.blob,
        filename: got.meta?.filename || photo?.filename || 'file',
        mime: got.meta?.mime || got.blob.type || '',
        size: got.meta?.size || got.blob.size || 0,
      });
    } catch (err) {
      showToast(`Could not open the file: ${err.message}`, 'error');
    }
  };

  // ─── UPDATED: Full Two-Way Sync via SyncEngine ──────────────────
  const handleSyncWithCloud = async () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    try {
      // 1. Save current report locally first (if dirty)
      if (currentReport && hasUnsavedChanges) {
        await syncEngine.saveReport(currentReport);
        setHasUnsavedChanges(false);
      }

      // 2. Full bidirectional sync
      const result = await syncEngine.fullSync();

      // 3. Reload active report if it was pulled
      if (result.pulled > 0 && activeReportId) {
        const freshLocal = await getLocalReport(activeReportId);
        if (freshLocal) {
          setCurrentReport(freshLocal);
        }
      }

      // 4. Refresh reports list
      await refreshReportsList();
    } catch (err) {
      // Nothing is lost: every edit is already in IndexedDB and the report
      // stays PENDING, so the offline queue retries it. What must not happen
      // is the spinner staying up, which is what the user saw before.
      console.error('Sync failed:', err);
      showToast(`Sync stopped: ${err.message}. Your data is saved on this device and will retry.`, 'error');
    } finally {
      setIsSyncing(false);
      setUploadProgress(null);
    }
  };

  useEffect(() => {
    if (!isViewRoute) {
      loadReportsList();
    }
  }, [isViewRoute]);

  // Splitter resizing
  const startResizing = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e) => {
    if (isResizing) {
      const newWidth = Math.min(Math.max(e.clientX, 240), 600);
      setSidebarWidth(newWidth);
      localStorage.setItem('flash_report_sidebar_width', newWidth.toString());
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  // ─── Auto-save uses SyncEngine (local instant, cloud debounced) ─────
  //
  // Two things here are deliberately SLOW, because the alternative is an app
  // that stutters while somebody types into it during a meeting (BUG-024):
  //
  //  - the save itself waits 2.5s after the last change. An edit now arrives
  //    once per CELL (a cell commits when it closes), not once per keystroke,
  //    so a longer wait costs nothing and collapses a burst of edits into one
  //    write.
  //  - re-publishing the SHARE LINK is separated from the save and throttled
  //    hard. Publishing rewrites the whole shared document — 500 rows of JSON
  //    — and doing that after every autosave was the single most expensive
  //    thing the app did while the user was typing. The link now catches up
  //    ~12s after the last edit, or instantly on an explicit Save.
  const latestSavedRef = useRef(null);

  const scheduleRepublish = (report, immediate = false) => {
    latestSavedRef.current = report;
    if (republishTimerRef.current) clearTimeout(republishTimerRef.current);
    if (immediate) {
      republishIfShared(latestSavedRef.current).catch(() => {});
      return;
    }
    republishTimerRef.current = setTimeout(() => {
      republishTimerRef.current = null;
      if (latestSavedRef.current) republishIfShared(latestSavedRef.current).catch(() => {});
    }, 12000);
  };

  const triggerAutoSave = (updatedReport) => {
    setHasUnsavedChanges(true);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      await executeSave(updatedReport, false);
    }, 2500);
  };

  const executeSave = async (reportToSave = currentReport, notify = true) => {
    if (!reportToSave || !reportToSave.id) return;
    setIsSaving(true);
    try {
      // ─── NEW: Save via SyncEngine (handles version bump + cloud queue) ─
      realtimeSync.suppress();
      const savedReport = await syncEngine.saveReport(reportToSave);
      setCurrentReport(savedReport);
      setHasUnsavedChanges(false);

      // The sidebar only shows titles and timestamps, and re-reading the whole
      // list re-renders the app. On an autosave it is not worth a frame of the
      // user's typing; an explicit save still refreshes it.
      if (notify) await refreshReportsList();

      // If this report has already been shared, push the new content to the
      // same share link so recipients always see current data. Throttled —
      // see scheduleRepublish.
      scheduleRepublish(savedReport, notify);

      if (notify) {
        showToast('Report saved. Cloud sync queued.', 'success');
      }
    } catch (err) {
      console.error('Save failed:', err);
      showToast('Error saving report', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Lock the app again — stepping away from the desk, or handing the phone
  // over. AppGate UNMOUNTS <App/> when this fires, so anything still sitting in
  // a debounce would go with it: flush the pending autosave and the pending
  // re-publish FIRST, and only lock once they have settled. Locking is never
  // blocked by a failure here — a save that will not complete must not become
  // a reason the screen stays open.
  const handleLockApp = async () => {
    const pendingSave = hasUnsavedChanges || Boolean(autoSaveTimerRef.current);
    const pendingPublish = Boolean(republishTimerRef.current);
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    try {
      if (currentReport?.id && (pendingSave || pendingPublish)) {
        // notify = true so the share link is re-published NOW rather than in
        // 12 seconds' time, by which point this component is gone.
        await executeSave(currentReport, true);
      }
    } catch (err) {
      console.warn('Save before locking failed:', err?.message || err);
    } finally {
      lockApp();
    }
  };

  const handleHeaderChange = (field, value) => {
    if (!currentReport) return;
    if (planLocked) return;   // the inputs are disabled too; this is the backstop
    const updated = { ...currentReport, [field]: value };
    setCurrentReport(updated);
    triggerAutoSave(updated);
  };

  const handleItemsChange = (newItems) => {
    if (!currentReport) return;
    if (planLocked) return;   // ditto - MiniPlanTable renders read-only when locked
    const updated = { ...currentReport, items: newItems };
    setCurrentReport(updated);
    triggerAutoSave(updated);
  };

  /** Several fields in ONE write (an OPS import sets items and header together). */
  const handleReportPatch = (patch) => {
    if (!currentReport || !patch) return;
    const updated = { ...currentReport, ...patch };
    setCurrentReport(updated);
    triggerAutoSave(updated);
  };

  /**
   * Open the viewer on one OPS cell's pictures and documents. Each entry
   * carries its index in the item's WHOLE photos array — the lightbox delete
   * (handleDeletePhoto) addresses the photo by that index, and a cell shows
   * only one column's share of the array.
   */
  const openOpsLightbox = (entry, rowEntries, itemIndex) => {
    const item = (currentReport?.items || [])[itemIndex];
    if (!item) return;
    const all = item.photos || [];
    const list = (rowEntries || []).filter(Boolean).map((p, i) => {
      const at = all.findIndex((x) => x && (p.id ? x.id === p.id : x === p));
      return { ...p, itemIndex, photoIndex: at, slotIndex: p.slot_index ?? at, _i: i };
    }).filter((p) => p.photoIndex >= 0);
    if (!list.length) return;
    const at = list.findIndex((p) => (entry?.id ? p.id === entry.id : p.url === entry?.url));
    setImageModalState({ isOpen: true, index: at < 0 ? 0 : at, photos: list });
  };

  /**
   * Build the rows a brand-new Mini Plan starts with.
   *
   * The plan as it stands (items 1-19) is copied in from services/
   * miniPlanSeed.js, because an empty CPP Mechanical Mini Plan is of no use to
   * anyone - the equipment list and its activities already exist. From this
   * point the report in Firestore is the live document: editing the seed file
   * later changes only what the NEXT new plan starts from, never this one.
   */
  const buildMiniPlanItems = () => {
    const rows = [];
    for (const group of MINI_PLAN_SEED) {
      const gid = makeGroupId();
      for (const r of group.rows) {
        rows.push(makeMiniPlanRow(gid, group.equipment, {
          schedule: r.schedule || '',
          activity: r.activity || '',
          status: r.status || '',
          note: r.note || '',
        }));
      }
    }
    return normalizeMiniPlanItems(rows);
  };

  const handleNewReport = async (reportType = '') => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    try {
      setIsSaving(true);
      const newId = `rep_${Date.now()}`;
      const isPlan = reportType === MINI_PLAN_TYPE;
      const isOps = reportType === OPS_FINDINGS_TYPE;

      const defaultNew = isOps ? {
        id: newId,
        title: OPS_FINDINGS_LABEL,
        report_type: OPS_FINDINGS_TYPE,
        system_tag: '',                       // "Updated by"
        location: OPS_DEFAULT_SUBTITLE,       // the area line under the title
        inspection_date: todayKeyLocal(),     // "Updated date"
        discipline: 'Mechanical',
        items: [makeOpsFinding(OPS_DEFAULT_SECTION, { open_date: todayKeyLocal() })],
        _version: 1,
        _syncStatus: SyncStatus.PENDING,
      } : isPlan ? {
        id: newId,
        title: MINI_PLAN_DEFAULT_TITLE,
        report_type: MINI_PLAN_TYPE,
        system_tag: '',
        location: 'Block B CPP',
        inspection_date: new Date().toISOString().split('T')[0],
        discipline: 'Mechanical',
        items: buildMiniPlanItems(),
        _version: 1,
        _syncStatus: SyncStatus.PENDING,
      } : {
        id: newId,
        title: 'New Flash Report',
        report_type: '',
        system_tag: '',
        location: '',
        inspection_date: new Date().toISOString().split('T')[0],
        discipline: 'Mechanical',
        items: [
          { id: `${newId}_1`, tag: '', description: '', note: '', photos: [] },
          { id: `${newId}_2`, tag: '', description: '', note: '', photos: [] },
          { id: `${newId}_3`, tag: '', description: '', note: '', photos: [] },
          { id: `${newId}_4`, tag: '', description: '', note: '', photos: [] },
        ],
        _version: 1,
        _syncStatus: SyncStatus.PENDING,
      };

      // Save via SyncEngine
      const saved = await syncEngine.saveReport(defaultNew);
      await refreshReportsList();

      setCurrentReport(saved);
      setActiveReportId(saved.id);
      localStorage.setItem('flash_report_last_active_id', saved.id);
      setHasUnsavedChanges(false);
      showToast(
        isPlan ? `${MINI_PLAN_LABEL} created with ${MINI_PLAN_SEED.length} equipment items`
          : isOps ? `${OPS_FINDINGS_LABEL} created — use Import Excel to load the findings`
          : 'New report created',
        'success'
      );
    } catch (err) {
      console.error('Failed to create report:', err);
      showToast('Error creating report', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Duplicating and deleting a report are both one click away in a list, and
   * both are easy to hit by accident on a phone. Each now asks a plain
   * question first, and the delete asks TWICE: the second question is the one
   * that says the word "permanently" (BUG-046).
   */
  const [confirmAsk, setConfirmAsk] = useState(null);   // {title, message, confirmLabel, tone, onYes}

  const askDuplicate = (reportId, reportTitle) => {
    setConfirmAsk({
      title: 'Duplicate this report?',
      message: `A full copy of "${reportTitle || 'this report'}" will be created, including its rows and photos. The original is not changed.`,
      confirmLabel: 'Yes, duplicate',
      tone: 'brand',
      onYes: () => { setConfirmAsk(null); runDuplicate(reportId); },
    });
  };

  const runDuplicate = async (reportId) => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    try {
      setIsSaving(true);
      let orig = await getLocalReport(reportId);
      if (!orig) {
        try {
          orig = await fetchReport(reportId);
        } catch (e) {}
      }

      if (orig) {
        const newId = `rep_${Date.now()}`;
        const dup = {
          ...orig,
          id: newId,
          title: `Copy of ${orig.title || 'Report'}`,
          updated_at: new Date().toISOString(),
          cloud_code: null,
          _version: 1,
          _syncStatus: SyncStatus.PENDING,
        };

        // Save via SyncEngine
        const saved = await syncEngine.saveReport(dup);
        await refreshReportsList();

        setCurrentReport(saved);
        setActiveReportId(saved.id);
        localStorage.setItem('flash_report_last_active_id', saved.id);
        setHasUnsavedChanges(false);
        showToast('Report duplicated successfully', 'success');
      }
    } catch (err) {
      console.error('Duplicate failed:', err);
      showToast('Error duplicating report', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const openDeleteModal = (id, title) => {
    setDeleteModalState({ isOpen: true, id, title });
  };

  /** First Yes → ask once more, in the plainest words available. */
  const askDeleteAgain = () => {
    const { title } = deleteModalState;
    setDeleteModalState((st) => ({ ...st, isOpen: false }));
    setConfirmAsk({
      title: 'Delete permanently?',
      message: `"${title || 'This report'}" and all of its rows, photos and files will be removed from this device and from the cloud. This cannot be undone.`,
      confirmLabel: 'Yes, delete permanently',
      tone: 'danger',
      onYes: () => { setConfirmAsk(null); confirmDelete(); },
    });
  };

  // Fixed Delete: Removes strictly the selected report from Cloud & Local
  const confirmDelete = async () => {
    const idToDelete = deleteModalState.id;
    if (!idToDelete) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    // Optimistic delete: the row disappears at once and the cloud delete is
    // held for UNDO_MS so it can be taken back. Nothing is destroyed until
    // that window closes, which is why the snapshot is captured first.
    const UNDO_MS = 6000;
    let snapshot = null;
    try {
      snapshot = await getLocalReport(idToDelete);
    } catch (e) {
      console.warn('Could not snapshot report before delete:', e);
    }

    const remaining = reports.filter((r) => r.id !== idToDelete);
    setReports(remaining);
    setDeleteModalState({ isOpen: false, id: null, title: '' });

    try {
      await deleteLocalReport(idToDelete);
    } catch (e) {
      console.warn('Local delete note:', e);
    }

    if (activeReportId === idToDelete) {
      if (remaining.length > 0) {
        await loadSingleReport(remaining[0].id);
      } else {
        // The last report was deleted: show an empty workspace, do not
        // conjure a replacement the user did not ask for.
        setCurrentReport(null);
        setActiveReportId(null);
      }
    }

    const commitTimer = setTimeout(async () => {
      undoDeleteRef.current = null;
      try {
        await deleteReport(idToDelete);
      } catch (e) {
        console.warn('Cloud delete note:', e);
      }
    }, UNDO_MS);

    undoDeleteRef.current = { id: idToDelete, snapshot, commitTimer };

    showToast('Report deleted', 'info', {
      label: 'Undo',
      onClick: async () => {
        const pending = undoDeleteRef.current;
        if (!pending || pending.id !== idToDelete) return;
        clearTimeout(pending.commitTimer);
        undoDeleteRef.current = null;

        if (pending.snapshot) {
          // Mark pending so the restored copy is pushed back to the cloud.
          await saveLocalReport({ ...pending.snapshot, _syncStatus: SyncStatus.PENDING });
          await refreshReportsList();
          await loadSingleReport(idToDelete);
          syncEngine.processQueue();
        }
        showToast('Delete undone', 'success');
      },
    });
  };


  // Share Link Handler
  const handleOpenShareModal = async (opsTab = '') => {
    if (!currentReport) return;
    if (planLocked) {
      // Ask for the password, then come back and publish.
      setPasswordPrompt({ then: () => handleOpenShareModal() });
      return;
    }
    // Called from a button's onClick, the argument is an event, not a tab.
    const tab = typeof opsTab === 'string' ? opsTab : '';
    setIsPublishing(true);
    try {
      const { shareUrl, shareId } = await publishReportForSharing(currentReport);

      // Keep the share id on the report in memory too. The standalone HTML
      // export builds its attachment links from it, and without this it would
      // write "share the report to activate this link" on a report that has
      // just been shared.
      if (shareId && currentReport.share_id !== shareId) {
        const withShare = { ...currentReport, share_id: shareId, cloud_code: shareId };
        setCurrentReport(withShare);
        saveLocalReport(withShare).catch(() => {});
      }

      setShareModalState({
        isOpen: true,
        shareUrl: tab && tab !== 'summary' ? `${shareUrl}?tab=${encodeURIComponent(tab)}` : shareUrl,
        reportTitle: currentReport.title
      });
    } catch (err) {
      console.error('Failed to generate share link:', err);
      showToast('Failed to generate share link', 'error');
    } finally {
      setIsPublishing(false);
    }
  };

  /**
   * An exported report links its attachments to the app's PUBLIC attachment
   * route, which reads from `shared_reports`. So a report that carries files
   * has to be published before it is exported — otherwise the export would
   * contain links that resolve to nothing.
   */
  const reportForExport = async (rep) => {
    if (!rep) return rep;
    if (collectAttachments(rep).length === 0) return rep;
    if (rep.share_id || rep.cloud_code) {
      // Already shared: refresh so the newest attachments are published too.
      try { await publishReportForSharing(rep); } catch (e) { console.warn('Share refresh:', e.message); }
      return rep;
    }
    showToast('Publishing attachments so the file links work…', 'info');
    const { shareId } = await publishReportForSharing(rep);
    const withShare = { ...rep, share_id: shareId, cloud_code: shareId };
    setCurrentReport(withShare);
    await saveLocalReport(withShare);
    return withShare;
  };

  // Client-Side Excel Export
  const handleExportExcel = async () => {
    if (!currentReport) return;
    setIsExporting(true);
    try {
      if (isOpsReport) {
        const { exportOpsExcel } = await import('./services/opsFindingsExport');
        const rep = await reportForExport(currentReport);
        await exportOpsExcel({ ...rep, items: normalizeOpsItems(rep.items) }, opsViewRef.current);
      } else {
        await exportExcelClient(await reportForExport(currentReport));
      }
      showToast('Excel export successful', 'success');
    } catch (err) {
      console.error('Export Excel failed:', err);
      showToast('Excel export failed', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // Client-Side PDF Export
  const handleExportPdf = async () => {
    if (!currentReport) return;
    setIsExporting(true);
    try {
      if (isOpsReport) {
        const { exportOpsPdf } = await import('./services/opsFindingsExport');
        const rep = await reportForExport(currentReport);
        await exportOpsPdf({ ...rep, items: normalizeOpsItems(rep.items) }, opsViewRef.current);
      } else {
        await exportPdfClient(await reportForExport(currentReport));
      }
      showToast('PDF export successful', 'success');
    } catch (err) {
      console.error('Export PDF failed:', err);
      showToast('PDF export failed', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // Public attachment link from an exported report — no sign-in required.
  if (fileRouteMatch) {
    return <FileViewer shareId={fileRouteMatch[1]} fileKey={fileRouteMatch[2]} />;
  }

  // A shared link e.g. #/view/:id. Which viewer it opens depends on the
  // report's type, so the router probes that before mounting either.
  if (isViewRoute && sharedReportId) {
    return <SharedViewRouter shareId={sharedReportId} />;
  }

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white gap-3">
        <RefreshCw className="w-8 h-8 text-brand-400 animate-spin" />
        <p className="text-sm font-medium text-slate-300">Loading Flash Report Pro...</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-100 font-sans">
      {/* Top Navbar */}
      <header className="h-14 px-3 md:px-5 bg-white border-b border-slate-200/90 flex items-center justify-between flex-shrink-0 z-20 shadow-xs">
        <div className="flex items-center gap-2 min-w-0">
          {isPhoneView && (
            <button
              onClick={() => setMobileDrawerOpen(true)}
              className="p-1.5 text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 border border-slate-200 transition-colors"
              title="Open reports list"
            >
              <Menu className="w-4 h-4 text-brand-600" />
              <span className="text-[11px] font-bold text-slate-800">
                Reports ({reports.length})
              </span>
            </button>
          )}

          <h2 className="text-xs md:text-sm font-bold text-slate-800 truncate max-w-[160px] sm:max-w-[240px] md:max-w-md lg:max-w-lg">
            {currentReport?.title || 'Untitled Flash Report'}
          </h2>

          {/* ─── UPDATED: 3-State Sync Status Indicator ─────────── */}
          <div className="hidden sm:flex items-center gap-2">
            <SyncStatusIndicator
              status={hasUnsavedChanges ? SyncStatus.PENDING : syncStatus}
              pendingCount={pendingCount}
              onRetry={() => syncEngine.processQueue()}
            />
          </div>
          {/* Mobile: compact indicator */}
          <div className="sm:hidden">
            <SyncStatusIndicator
              status={hasUnsavedChanges ? SyncStatus.PENDING : syncStatus}
              pendingCount={pendingCount}
              compact={true}
            />
          </div>
        </div>

        {/* Action Toolbar & Mode Switcher */}
        <div className="flex items-center gap-1.5 md:gap-2">
          {/* Sync Cloud Button */}
          <button
            type="button"
            onClick={handleSyncWithCloud}
            disabled={isSyncing}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200/80 rounded-lg shadow-2xs transition-colors"
            title="Full 2-way sync between Phone & Laptop"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-sky-600 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sync Cloud</span>
            <span className="sm:hidden">Sync</span>
            {/* Pending count badge */}
            {pendingCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0 text-[9px] font-bold bg-amber-500 text-white rounded-full leading-relaxed">
                {pendingCount}
              </span>
            )}
          </button>

          {/* Device Mode Switcher */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('laptop')}
              className={`p-1.5 rounded-md flex items-center gap-1 transition-all ${
                viewMode === 'laptop' ? 'bg-white text-brand-600 shadow-xs font-semibold' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Force Laptop / Spreadsheet View"
            >
              <Laptop className="w-3.5 h-3.5" />
              <span className="hidden lg:inline text-[11px]">Laptop</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('phone')}
              className={`p-1.5 rounded-md flex items-center gap-1 transition-all ${
                viewMode === 'phone' ? 'bg-white text-brand-600 shadow-xs font-semibold' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Force Phone / Card View"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden lg:inline text-[11px]">Phone</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('auto')}
              className={`px-2 py-1 rounded-md text-[11px] transition-all ${
                viewMode === 'auto' ? 'bg-white text-brand-600 shadow-xs font-semibold' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Auto-detect based on screen width"
            >
              Auto
            </button>
          </div>

          {/* Share Link Button */}
          <button
            type="button"
            onClick={handleOpenShareModal}
            disabled={isPublishing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200/80 rounded-lg shadow-2xs transition-colors"
            title="Generate shareable web link with QR code"
          >
            {isPublishing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5 text-brand-600" />}
            <span className="hidden sm:inline">{isPlanReport || isOpsReport ? 'Live Link' : 'Share Link'}</span>
            <span className="sm:hidden">Share</span>
          </button>

          {/* Mini Plan lock. Only a plan has one, so it is not drawn for a
              Flash Report, which has never been password protected. */}
          {isPlanReport && (
            planLocked ? (
              <button
                type="button"
                onClick={() => setPasswordPrompt({ then: () => {} })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors"
                title="Enter the project password to edit or share this plan"
              >
                <Lock className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Locked</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { lockMiniPlan(); showToast('Plan locked', 'info'); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors"
                title="Lock this plan again"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Unlocked</span>
              </button>
            )
          )}

          <button
            type="button"
            onClick={() => executeSave(currentReport, true)}
            disabled={isSaving}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            Save
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={isExporting}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 rounded-lg shadow-2xs transition-colors"
          >
            {isExporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" /> : <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />}
            Export Excel
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-2xs transition-all"
          >
            {isExporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Export PDF</span>
            <span className="sm:hidden">PDF</span>
          </button>

          {/* Lock the app. Saves first — see handleLockApp. */}
          <button
            type="button"
            onClick={handleLockApp}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors"
            title="Lock the app (saves first). The password is needed to open it again."
          >
            <Lock className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Lock</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* 1. Desktop Left Sidebar */}
        {!isPhoneView && (
          <>
            <div style={{ width: `${sidebarWidth}px` }} className="h-full flex-shrink-0">
              <Sidebar
                reports={reports}
                activeReportId={activeReportId}
                onSelectReport={loadSingleReport}
                onNewReport={handleNewReport}
                onDuplicateReport={askDuplicate}
                onDeleteReport={openDeleteModal}
                isSaving={isSaving}
                isSyncing={isSyncing}
                onSyncCloud={handleSyncWithCloud}
              />
            </div>

            {/* Draggable Resizer Handle */}
            <div
              onMouseDown={startResizing}
              onDoubleClick={() => setSidebarWidth(320)}
              title="Drag to resize panels (Double-click to reset)"
              className={`w-1.5 h-full cursor-col-resize resizer-handle select-none transition-colors z-10 ${
                isResizing ? 'bg-brand-500' : 'bg-slate-800 hover:bg-brand-400'
              }`}
            />
          </>
        )}

        {/* 2. Mobile Drawer Sidebar (Slide-out) */}
        {isPhoneView && mobileDrawerOpen && (
          <div className="fixed inset-0 z-50 flex">
            <div
              onClick={() => setMobileDrawerOpen(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            />
            <div className="relative w-80 max-w-[85vw] h-full bg-slate-900 shadow-2xl z-10 animate-fade-in">
              <Sidebar
                reports={reports}
                activeReportId={activeReportId}
                onSelectReport={loadSingleReport}
                onNewReport={handleNewReport}
                onDuplicateReport={askDuplicate}
                onDeleteReport={openDeleteModal}
                isSaving={isSaving}
                isSyncing={isSyncing}
                onSyncCloud={handleSyncWithCloud}
                isMobileDrawer={true}
                onCloseMobileDrawer={() => setMobileDrawerOpen(false)}
              />
            </div>
          </div>
        )}

        {/* 3. Main Report Editor Area */}
        <main className="flex-1 h-full overflow-y-auto p-3 md:p-4 lg:p-5 pb-24 sm:pb-6 w-full">
          <div className="w-full">
            {/* No report open, and none invented. The app no longer creates one
                just because it was opened (BUG-046) — this says so, and offers
                the button that does it deliberately. */}
            {!currentReport && !loading && (
              <div className="max-w-lg mx-auto mt-16 text-center bg-white border border-slate-200 rounded-2xl p-8 shadow-xs">
                <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h2 className="text-[15px] font-bold text-slate-800">No report is open</h2>
                <p className="text-[13px] text-slate-500 mt-1.5">
                  Pick one from the list, or create a new report when you are ready.
                </p>
                <button
                  type="button"
                  onClick={() => handleNewReport()}
                  className="mt-5 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold"
                >
                  New report
                </button>
              </div>
            )}

            {currentReport && isOpsReport && (
              <OpsFindingsWorkspace
                report={currentReport}
                items={normalizeOpsItems(currentReport.items)}
                onItemsChange={handleItemsChange}
                onHeaderChange={handleHeaderChange}
                onReportPatch={handleReportPatch}
                onPhotoClick={openOpsLightbox}
                onPhotoRemoved={dropPlanPhotoBytes}
                onAttachFile={handlePlanAttach}
                onOpenAttachment={handleOpenAttachment}
                onViewChange={(v) => { opsViewRef.current = v; }}
                isUnlocked={(L) => isOpsSectionUnlocked(L)}
                onRequestUnlock={(letter, section) => setOpsAsk({ letter, section })}
                onLockSection={(L) => { lockOpsSection(L); showToast(`Section ${L} locked`, 'info'); }}
                onExport={(kind, view) => { opsViewRef.current = view; if (kind === 'xlsx') handleExportExcel(); else handleExportPdf(); }}
                onTabLink={(tab) => handleOpenShareModal(tab)}
                canImport
                isMobileMode={isPhoneView}
                notify={showToast}
              />
            )}

            {currentReport && !isOpsReport && (
              <>
                <HeaderForm
                  report={currentReport}
                  onChange={handleHeaderChange}
                  variant={isPlanReport ? 'miniPlan' : 'flash'}
                  readOnly={planLocked}
                  onRequestUnlock={() => setPasswordPrompt({ then: () => {} })}
                />

                {isPlanReport ? (
                  <MiniPlanWorkspace
                    items={normalizeMiniPlanItems(currentReport.items)}
                    onItemsChange={handleItemsChange}
                    onPhotoClick={openPlanLightbox}
                    onPhotoRemoved={dropPlanPhotoBytes}
                    onAttachFile={handlePlanAttach}
                    onOpenAttachment={handleOpenAttachment}
                    isMobileMode={isPhoneView}
                    readOnly={planLocked}
                    onRequestUnlock={() => setPasswordPrompt({ then: () => {} })}
                    title={currentReport.title}
                  />
                ) : (
                  <InspectionTable
                    items={currentReport.items || []}
                    onItemsChange={handleItemsChange}
                    onPhotoClick={openLightboxByUrl}
                    onAttachFile={handleAttachFile}
                    onOpenAttachment={handleOpenAttachment}
                    isMobileMode={isPhoneView}
                  />
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Mobile Sticky Bottom Action Bar */}
      {isPhoneView && (
        <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200 p-2.5 px-3 flex items-center justify-between gap-1.5 z-30 shadow-lg">
          <button
            type="button"
            onClick={handleOpenShareModal}
            disabled={isPublishing}
            className="flex-1 py-2 text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-xl flex items-center justify-center gap-1 transition-colors"
          >
            <Share2 className="w-4 h-4 text-brand-600" />
            <span>Share Link</span>
          </button>

          <button
            type="button"
            onClick={handleSyncWithCloud}
            disabled={isSyncing}
            className="relative py-2 px-3 text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-xl flex items-center justify-center gap-1 transition-colors border border-sky-200"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-sky-600 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sync</span>
            {/* Pending badge on mobile */}
            {pendingCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0 text-[9px] font-bold bg-amber-500 text-white rounded-full leading-relaxed">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExporting}
            className="flex-1 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl flex items-center justify-center gap-1 shadow-md shadow-brand-600/20 transition-all"
          >
            <FileText className="w-4 h-4" />
            <span>Export PDF</span>
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteModal
        isOpen={deleteModalState.isOpen}
        reportTitle={deleteModalState.title}
        onConfirm={askDeleteAgain}
        onCancel={() => setDeleteModalState({ isOpen: false, id: null, title: '' })}
      />

      {/* Image Lightbox Modal */}
      <ImageModal
        isOpen={imageModalState.isOpen}
        photos={imageModalState.photos || galleryPhotos}
        index={imageModalState.index}
        onIndexChange={(i) => setImageModalState((st) => ({ ...st, index: i }))}
        title={currentReport?.title}
        onClose={() => setImageModalState({ isOpen: false, index: 0 })}
        onDelete={planLocked ? undefined : (isOpsReport ? (() => {
          const first = (imageModalState.photos || [])[0];
          const it = first ? (currentReport?.items || [])[first.itemIndex] : null;
          return isOpsSectionUnlocked(sectionLetter(it?.section)) ? handleDeletePhoto : undefined;
        })() : handleDeletePhoto)}
        onOpenAttachment={handleOpenAttachment}
      />

      <ConfirmModal
        isOpen={Boolean(confirmAsk)}
        title={confirmAsk?.title}
        message={confirmAsk?.message}
        confirmLabel={confirmAsk?.confirmLabel}
        cancelLabel="Cancel"
        tone={confirmAsk?.tone}
        onConfirm={() => confirmAsk?.onYes?.()}
        onCancel={() => setConfirmAsk(null)}
      />

      <FilePreviewModal
        isOpen={filePreview.isOpen}
        blob={filePreview.blob}
        filename={filePreview.filename}
        mime={filePreview.mime}
        size={filePreview.size}
        onClose={() => setFilePreview({ isOpen: false, blob: null, filename: '', mime: '', size: 0 })}
      />

      {/* Share Modal.
          `report` is the prop ShareModal actually reads - it was being passed
          as `currentReport`, so the "Download standalone HTML" button inside
          the dialog had nothing to export. */}
      <ShareModal
        isOpen={shareModalState.isOpen}
        shareUrl={shareModalState.shareUrl}
        report={currentReport}
        onClose={() => setShareModalState({ isOpen: false, shareUrl: '', reportTitle: '' })}
      />

      {/* Mini Plan password prompt. Opened by an edit attempt, by the lock
          badge, or by pressing Share on a locked plan; whatever asked for it
          runs once the password is accepted. */}
      <PasswordModal
        isOpen={Boolean(passwordPrompt)}
        title={`Unlock ${MINI_PLAN_LABEL}`}
        message="Editing this plan and issuing its live share link are password protected."
        onSubmit={(pw) => {
          const ok = unlockMiniPlan(pw);
          if (ok) {
            const next = passwordPrompt?.then;
            setPasswordPrompt(null);
            showToast('Editing unlocked for this session', 'success');
            if (typeof next === 'function') setTimeout(next, 0);
          }
          return ok;
        }}
        onClose={() => setPasswordPrompt(null)}
      />

      {/* OPS Findings: one password per section tab. */}
      <PasswordModal
        isOpen={Boolean(opsAsk)}
        title={`Unlock section ${opsAsk?.letter || ''}`}
        message={`Editing "${opsAsk?.section || ''}" needs this section's password.`}
        onSubmit={(pw) => {
          const ok = unlockOpsSection(opsAsk?.letter, pw);
          if (ok) { setOpsAsk(null); showToast('Editing unlocked for this tab', 'success'); }
          return ok;
        }}
        onClose={() => setOpsAsk(null)}
      />

      {/* Upload progress. A long first sync is normal; a long sync with no
          sign of movement is what made the old build feel frozen. */}
      {uploadProgress && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-xl bg-slate-900/92 text-white text-xs font-semibold shadow-xl flex items-center gap-3 backdrop-blur">
          <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
          <div className="flex flex-col gap-1 min-w-[150px]">
            <span>
              {uploadProgress.phase === 'share'
                ? 'Publishing photo'
                : uploadProgress.phase === 'compact'
                ? 'Optimising photo'
                : 'Uploading photo'}{' '}
              {uploadProgress.done + 1} / {uploadProgress.total}
            </span>
            <div className="h-1 w-full rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full bg-sky-400 transition-all duration-200"
                style={{ width: `${Math.round((uploadProgress.done / uploadProgress.total) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      <Toast
        message={toast.message}
        type={toast.type}
        action={toast.action}
        duration={toast.action ? 6000 : 3000}
        onClose={() => setToast({ message: '', type: 'success', action: null })}
      />
    </div>
  );
}
