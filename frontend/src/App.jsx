import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Save, Download, FileSpreadsheet, FileText, Printer,
  Sparkles, Check, RefreshCw, AlertCircle, Share2, Menu,
  Laptop, Smartphone, Sliders, ChevronDown, Link as LinkIcon
} from 'lucide-react';
import Sidebar from './components/Sidebar';
import HeaderForm from './components/HeaderForm';
import InspectionTable from './components/InspectionTable';
import DeleteModal from './components/DeleteModal';
import ImageModal from './components/ImageModal';
import ShareModal from './components/ShareModal';
import ReportViewer from './components/ReportViewer';
import Toast from './components/Toast';
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
  const isViewRoute = hash.includes('/view') || hash.includes('view') || search.includes('view');

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
  const [imageModalState, setImageModalState] = useState({ isOpen: false, url: '', title: '' });
  const [shareModalState, setShareModalState] = useState({ isOpen: false, shareUrl: '', reportTitle: '' });
  const [toast, setToast] = useState({ message: '', type: 'success', action: null });
  const [isExporting, setIsExporting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const autoSaveTimerRef = useRef(null);
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
            local.system_tag !== h.system_tag ||
            local.location !== h.location ||
            local.inspection_date !== h.inspection_date ||
            local.discipline !== h.discipline ||
            local.updated_at !== h.updated_at;
          if (!changed) continue;

          // Spread local FIRST so its `items` survive the header overlay.
          await saveLocalReport({
            ...local, ...h,
            items: local.items,
            _syncStatus: SyncStatus.SYNCED,
          });
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
          const safe = {
            ...ev.report,
            items: mergePhotosPreferLocal(ev.report.items, localCopy?.items),
            _syncStatus: SyncStatus.SYNCED,
          };
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
      } else if (mergedList.length === 0) {
        // ONLY initialize a new report if there are strictly 0 reports anywhere
        await handleNewReport();
      }

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
          if (p && p.url) return p; // cloud has the image
          const slot = p?.slot_index ?? pIdx;
          const localPhoto = (local.photos || []).find(
            (lp, li) => lp && lp.url && (lp.slot_index ?? li) === slot
          );
          return localPhoto ? { ...(p || {}), ...localPhoto } : p;
        }),
      };
    });
  };

  /** True when this device holds at least one image the cloud copy is missing. */
  const localHasPhotoCloudLacks = (cloudItems, localItems) => {
    if (!Array.isArray(cloudItems) || !Array.isArray(localItems)) return false;
    const localById = new Map(localItems.map((it, i) => [it?.id || `item_${i}`, it]));

    return cloudItems.some((item, idx) => {
      const local = localById.get(item?.id || `item_${idx}`);
      if (!local || !Array.isArray(item?.photos)) return false;
      return item.photos.some((p, pIdx) => {
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
          const merged = {
            ...cloudRep,
            items: mergePhotosPreferLocal(cloudRep.items, rep?.items),
            _version: Math.max(rep?._version || 0, cloudRep._version || 0),
            _syncStatus: SyncStatus.SYNCED,
            _lastSyncedAt: new Date().toISOString(),
          };
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

  // ─── UPDATED: Full Two-Way Sync via SyncEngine ──────────────────
  const handleSyncWithCloud = async () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

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

  // ─── UPDATED: Auto-save uses SyncEngine (local instant, cloud debounced) ─
  const triggerAutoSave = (updatedReport) => {
    setHasUnsavedChanges(true);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      await executeSave(updatedReport, false);
    }, 1500);
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

      // Refresh reports list
      await refreshReportsList();

      // If this report has already been shared, push the new content to the
      // same share link so recipients always see current data. No-op
      // otherwise, and never blocks the save.
      republishIfShared(savedReport).catch(() => {});

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

  const handleHeaderChange = (field, value) => {
    if (!currentReport) return;
    const updated = { ...currentReport, [field]: value };
    setCurrentReport(updated);
    triggerAutoSave(updated);
  };

  const handleItemsChange = (newItems) => {
    if (!currentReport) return;
    const updated = { ...currentReport, items: newItems };
    setCurrentReport(updated);
    triggerAutoSave(updated);
  };

  const handleNewReport = async () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    try {
      setIsSaving(true);
      const newId = `rep_${Date.now()}`;
      const defaultNew = {
        id: newId,
        title: 'New Flash Report',
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
      showToast('New report created', 'success');
    } catch (err) {
      console.error('Failed to create report:', err);
      showToast('Error creating report', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDuplicate = async (reportId) => {
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
        await handleNewReport();
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
  const handleOpenShareModal = async () => {
    if (!currentReport) return;
    setIsPublishing(true);
    try {
      const { shareUrl } = await publishReportForSharing(currentReport);
      setShareModalState({
        isOpen: true,
        shareUrl,
        reportTitle: currentReport.title
      });
    } catch (err) {
      console.error('Failed to generate share link:', err);
      showToast('Failed to generate share link', 'error');
    } finally {
      setIsPublishing(false);
    }
  };

  // Client-Side Excel Export
  const handleExportExcel = async () => {
    if (!currentReport) return;
    setIsExporting(true);
    try {
      await exportExcelClient(currentReport);
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
      await exportPdfClient(currentReport);
      showToast('PDF export successful', 'success');
    } catch (err) {
      console.error('Export PDF failed:', err);
      showToast('PDF export failed', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // If user opens a shared presentation link e.g. #/view/:id
  if (isViewRoute && sharedReportId) {
    return <ReportViewer reportId={sharedReportId} />;
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
            <span className="hidden sm:inline">Share Link</span>
            <span className="sm:hidden">Share</span>
          </button>

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
                onDuplicateReport={handleDuplicate}
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
                onDuplicateReport={handleDuplicate}
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
            {currentReport && (
              <>
                <HeaderForm
                  report={currentReport}
                  onChange={handleHeaderChange}
                />

                <InspectionTable
                  items={currentReport.items || []}
                  onItemsChange={handleItemsChange}
                  onPhotoClick={(url) => setImageModalState({ isOpen: true, url, title: currentReport.title })}
                  isMobileMode={isPhoneView}
                />
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
        onConfirm={confirmDelete}
        onCancel={() => setDeleteModalState({ isOpen: false, id: null, title: '' })}
      />

      {/* Image Lightbox Modal */}
      <ImageModal
        isOpen={imageModalState.isOpen}
        imageUrl={imageModalState.url}
        title={imageModalState.title}
        onClose={() => setImageModalState({ isOpen: false, url: '', title: '' })}
      />

      {/* Share Modal */}
      <ShareModal
        isOpen={shareModalState.isOpen}
        shareUrl={shareModalState.shareUrl}
        reportTitle={shareModalState.reportTitle}
        currentReport={currentReport}
        onClose={() => setShareModalState({ isOpen: false, shareUrl: '', reportTitle: '' })}
      />

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
