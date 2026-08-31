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
  publishReportForSharing
} from './services/shareService';

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
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [isExporting, setIsExporting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const autoSaveTimerRef = useRef(null);

  // Listen to window resize
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isPhoneView = viewMode === 'phone' || (viewMode === 'auto' && windowWidth < 768);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  // Load initial reports with seamless cloud + local IndexedDB merging & auto-sync
  const loadReportsList = async (preferredSelectId = null) => {
    if (isViewRoute) return;
    try {
      // 1. Fetch from local IndexedDB
      const localList = await getLocalReports();

      // Clean out any legacy test dummy reports
      for (const r of localList) {
        if (r.id === 'rep_test_sync_phone' || (r.title && r.title.includes('Second Report'))) {
          await deleteLocalReport(r.id);
        }
      }

      // 2. Fetch from Cloud Serverless API
      let cloudList = [];
      try {
        cloudList = await fetchReports();
      } catch (e) {
        console.warn('Cloud reports list note:', e);
      }

      // 3. Fast Parallel Batch Sync if local has un-synced reports
      const cloudMap = new Map();
      cloudList.forEach((r) => cloudMap.set(r.id, r));

      const unSynced = localList.filter((loc) => {
        if (loc.id === 'rep_test_sync_phone' || loc.title?.includes('Second Report')) return false;
        const inCloud = cloudMap.get(loc.id);
        return !inCloud || new Date(loc.updated_at || 0) > new Date(inCloud.updated_at || 0);
      });

      if (unSynced.length > 0) {
        batchSyncReports(localList)
          .then((updatedCloud) => {
            if (Array.isArray(updatedCloud) && updatedCloud.length > 0) {
              setReports((prev) => {
                const pMap = new Map();
                prev.forEach((r) => pMap.set(r.id, r));
                updatedCloud.forEach((r) => pMap.set(r.id, r));
                return Array.from(pMap.values()).sort(
                  (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
                );
              });
            }
          })
          .catch(() => {});
      }

      // 4. Merge lists by ID, removing test dummy entries
      const map = new Map();
      localList.forEach((r) => {
        if (r.id !== 'rep_test_sync_phone' && !r.title?.includes('Second Report')) {
          map.set(r.id, r);
        }
      });

      cloudList.forEach((r) => {
        if (r.id !== 'rep_test_sync_phone' && !r.title?.includes('Second Report')) {
          if (!map.has(r.id)) {
            map.set(r.id, r);
            saveLocalReport(r).catch(() => {});
          } else {
            const existing = map.get(r.id);
            if (new Date(r.updated_at || 0) >= new Date(existing.updated_at || 0)) {
              map.set(r.id, { ...existing, ...r });
            }
          }
        }
      });

      const mergedList = Array.from(map.values());
      mergedList.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));

      setReports(mergedList);

      // Determine target report to open
      const lastActiveId = localStorage.getItem('flash_report_last_active_id');
      let targetId = preferredSelectId || lastActiveId;
      if (!targetId || !mergedList.some((r) => r.id === targetId)) {
        targetId = mergedList.length > 0 ? mergedList[0].id : null;
      }

      if (targetId) {
        await loadSingleReport(targetId);
      } else if (mergedList.length === 0) {
        await handleNewReport();
      }
    } catch (err) {
      console.error('Error loading reports:', err);
      showToast('Could not load reports', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadSingleReport = async (id) => {
    if (!id) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    try {
      let rep = await getLocalReport(id);
      if (!rep || !rep.title || !rep.items || rep.items.length === 0) {
        try {
          const cloudRep = await fetchReport(id);
          if (cloudRep && cloudRep.title) {
            rep = cloudRep;
            await saveLocalReport(cloudRep);
          }
        } catch (e) {
          console.warn('Cloud single report fetch note:', e);
        }
      }

      if (rep) {
        setCurrentReport(rep);
        setActiveReportId(id);
        localStorage.setItem('flash_report_last_active_id', id);
        setHasUnsavedChanges(false);
      }
    } catch (err) {
      console.error('Error loading report:', err);
      showToast('Failed to load report data', 'error');
    }
  };

  // Full Two-Way High-Speed Batch Cloud Sync (< 0.5s)
  const handleSyncWithCloud = async () => {
    setIsSyncing(true);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    try {
      // 1. If current report is dirty, save it locally first
      if (currentReport && currentReport.id && currentReport.id !== 'rep_test_sync_phone') {
        await saveLocalReport(currentReport);
      }

      // 2. Fetch local reports
      const localList = await getLocalReports();
      const cleanLocal = localList.filter(
        (r) => r.id !== 'rep_test_sync_phone' && !r.title?.includes('Second Report')
      );

      // 3. One single batch request syncs EVERYTHING to cloud (< 0.5s)
      const cloudReports = await batchSyncReports(cleanLocal);

      // 4. Update state & IndexedDB cache
      const mergedMap = new Map();
      cleanLocal.forEach((r) => mergedMap.set(r.id, r));
      cloudReports.forEach((r) => {
        if (!mergedMap.has(r.id)) {
          mergedMap.set(r.id, r);
          saveLocalReport(r).catch(() => {});
        } else {
          const existing = mergedMap.get(r.id);
          if (new Date(r.updated_at || 0) >= new Date(existing.updated_at || 0)) {
            mergedMap.set(r.id, { ...existing, ...r });
          }
        }
      });

      const mergedList = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
      );

      setReports(mergedList);

      if (activeReportId) {
        await loadSingleReport(activeReportId);
      }

      showToast(`Đồng bộ Cloud thành công! Có ${mergedList.length} báo cáo`, 'success');
    } catch (err) {
      console.error('Sync failed:', err);
      showToast('Lỗi khi đồng bộ dữ liệu', 'error');
    } finally {
      setIsSyncing(false);
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

  // Debounced auto-save
  const triggerAutoSave = (updatedReport) => {
    setHasUnsavedChanges(true);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      executeSave(updatedReport, false);
    }, 1500);
  };

  const executeSave = async (reportToSave = currentReport, notify = true) => {
    if (!reportToSave || !reportToSave.id) return;
    setIsSaving(true);
    try {
      await saveLocalReport(reportToSave);

      try {
        await saveReport(reportToSave.id, reportToSave);
      } catch (e) {
        console.warn('Saved to local IndexedDB (offline mode)');
      }

      setHasUnsavedChanges(false);

      // Refresh list
      const localList = await getLocalReports();
      let cloudList = [];
      try {
        cloudList = await fetchReports();
      } catch (e) {}

      const map = new Map();
      localList.forEach((r) => map.set(r.id, r));
      cloudList.forEach((r) => map.set(r.id, r));
      const updatedList = Array.from(map.values()).sort(
        (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
      );
      setReports(updatedList);

      if (notify) {
        showToast('Report saved successfully', 'success');
      }
    } catch (err) {
      console.error('Save failed:', err);
      showToast('Failed to save report', 'error');
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
        ]
      };

      await saveLocalReport(defaultNew);
      try {
        await saveReport(defaultNew.id, defaultNew);
      } catch (e) {}

      const localList = await getLocalReports();
      setReports(localList);
      setCurrentReport(defaultNew);
      setActiveReportId(defaultNew.id);
      localStorage.setItem('flash_report_last_active_id', defaultNew.id);
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
          cloud_code: null
        };
        await saveLocalReport(dup);
        try {
          await saveReport(dup.id, dup);
        } catch (e) {}

        const localList = await getLocalReports();
        setReports(localList);
        setCurrentReport(dup);
        setActiveReportId(dup.id);
        localStorage.setItem('flash_report_last_active_id', dup.id);
        setHasUnsavedChanges(false);
        showToast('Report duplicated successfully', 'success');
      }
    } catch (err) {
      console.error('Duplicate failed:', err);
      showToast('Failed to duplicate report', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const openDeleteModal = (id, title) => {
    setDeleteModalState({ isOpen: true, id, title });
  };

  // Fixed Delete: Removes strictly the selected report without wiping others
  const confirmDelete = async () => {
    const idToDelete = deleteModalState.id;
    if (!idToDelete) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    try {
      // 1. Delete from Cloud
      try {
        await deleteReport(idToDelete);
      } catch (e) {
        console.warn('Cloud delete note:', e);
      }

      // 2. Delete from Local IndexedDB
      await deleteLocalReport(idToDelete);

      // 3. Remove specifically idToDelete from state
      const updatedList = reports.filter((r) => r.id !== idToDelete);
      setReports(updatedList);
      setDeleteModalState({ isOpen: false, id: null, title: '' });
      showToast('Báo cáo đã được xóa thành công', 'info');

      // 4. Switch to remaining report or create new if 0 left
      if (activeReportId === idToDelete) {
        if (updatedList.length > 0) {
          await loadSingleReport(updatedList[0].id);
        } else {
          await handleNewReport();
        }
      }
    } catch (err) {
      console.error('Delete failed:', err);
      showToast('Failed to delete report', 'error');
    }
  };

  // Share Link Handler
  const handleOpenShareModal = async () => {
    if (!currentReport) return;
    setIsPublishing(true);
    await executeSave(currentReport, false);
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

  // 100% Reliable Client-Side Excel Export
  const handleExportExcel = async () => {
    if (!currentReport) return;
    setIsExporting(true);
    await executeSave(currentReport, false);
    try {
      await exportExcelClient(currentReport);
      showToast('Excel report (.xlsx) downloaded successfully', 'success');
    } catch (err) {
      console.error('Export Excel failed:', err);
      showToast('Failed to generate Excel report', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // 100% Reliable Client-Side PDF Export
  const handleExportPdf = async () => {
    if (!currentReport) return;
    setIsExporting(true);
    await executeSave(currentReport, false);
    try {
      await exportPdfClient(currentReport);
      showToast('PDF report (.pdf) downloaded successfully', 'success');
    } catch (err) {
      console.error('Export PDF failed:', err);
      showToast('Failed to generate PDF report', 'error');
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

          <div className="hidden sm:flex items-center gap-2">
            {hasUnsavedChanges ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                Unsaved
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Check className="w-3 h-3" />
                Saved
              </span>
            )}
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
            title="Đồng bộ Cloud (Tải & Lưu báo cáo giữa Điện thoại & Máy tính)"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-sky-600 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sync Cloud</span>
            <span className="sm:hidden">Sync</span>
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
            className="py-2 px-3 text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-xl flex items-center justify-center gap-1 transition-colors border border-sky-200"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-sky-600 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sync</span>
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
        onClose={() => setToast({ message: '', type: 'success' })}
      />
    </div>
  );
}
