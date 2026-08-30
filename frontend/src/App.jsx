import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Save, Download, FileSpreadsheet, FileText, Printer,
  Sparkles, Check, RefreshCw, AlertCircle, Share2, Menu,
  Laptop, Smartphone, Sliders, ChevronDown
} from 'lucide-react';
import Sidebar from './components/Sidebar';
import HeaderForm from './components/HeaderForm';
import InspectionTable from './components/InspectionTable';
import DeleteModal from './components/DeleteModal';
import ImageModal from './components/ImageModal';
import Toast from './components/Toast';
import {
  fetchReports, fetchReport, createReport, saveReport,
  deleteReport, duplicateReport, getExcelExportUrl, getPdfExportUrl
} from './services/api';
import {
  getLocalReports, getLocalReport, saveLocalReport, deleteLocalReport
} from './services/clientStorage';
import {
  exportExcelClient, exportPdfClient
} from './services/clientExport';

export default function App() {
  const [reports, setReports] = useState([]);
  const [activeReportId, setActiveReportId] = useState(null);
  const [currentReport, setCurrentReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
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
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [isExporting, setIsExporting] = useState(false);

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

  // Load initial reports with fallback to IndexedDB
  const loadReportsList = async (preferredSelectId = null) => {
    try {
      let list = [];
      try {
        list = await fetchReports();
      } catch (e) {
        console.warn('Backend unavailable, loading from IndexedDB storage:', e);
        list = await getLocalReports();
      }

      setReports(list);

      let targetId = preferredSelectId;
      if (!targetId && list.length > 0) {
        targetId = list[0].id;
      }

      if (targetId) {
        await loadSingleReport(targetId);
      } else {
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
    try {
      let rep = null;
      try {
        rep = await fetchReport(id);
      } catch (e) {
        rep = await getLocalReport(id);
      }

      if (rep) {
        setCurrentReport(rep);
        setActiveReportId(id);
        setHasUnsavedChanges(false);
      }
    } catch (err) {
      console.error('Error loading report:', err);
      showToast('Failed to load report data', 'error');
    }
  };

  useEffect(() => {
    loadReportsList();
  }, []);

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

      try {
        const updatedList = await fetchReports();
        setReports(updatedList);
      } catch (e) {
        const localList = await getLocalReports();
        setReports(localList);
      }

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

      let created = defaultNew;
      try {
        created = await createReport(defaultNew);
      } catch (e) {
        await saveLocalReport(defaultNew);
      }

      const list = await (async () => {
        try { return await fetchReports(); } catch { return await getLocalReports(); }
      })();

      setReports(list);
      setCurrentReport(created);
      setActiveReportId(created.id);
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
    try {
      setIsSaving(true);
      let dup = null;
      try {
        dup = await duplicateReport(reportId);
      } catch (e) {
        const orig = await getLocalReport(reportId);
        if (orig) {
          const newId = `rep_${Date.now()}`;
          dup = {
            ...orig,
            id: newId,
            title: `Copy of ${orig.title || 'Report'}`,
            created_at: new Date().toISOString()
          };
          await saveLocalReport(dup);
        }
      }

      const list = await (async () => {
        try { return await fetchReports(); } catch { return await getLocalReports(); }
      })();

      setReports(list);
      if (dup) {
        setCurrentReport(dup);
        setActiveReportId(dup.id);
      }
      showToast('Report duplicated successfully', 'success');
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

  const confirmDelete = async () => {
    if (!deleteModalState.id) return;
    try {
      try {
        await deleteReport(deleteModalState.id);
      } catch (e) {
        await deleteLocalReport(deleteModalState.id);
      }
      setDeleteModalState({ isOpen: false, id: null, title: '' });
      showToast('Report deleted', 'info');

      const list = await (async () => {
        try { return await fetchReports(); } catch { return await getLocalReports(); }
      })();
      setReports(list);

      if (list.length > 0) {
        await loadSingleReport(list[0].id);
      } else {
        await handleNewReport();
      }
    } catch (err) {
      console.error('Delete failed:', err);
      showToast('Failed to delete report', 'error');
    }
  };

  const handleExportExcel = async () => {
    if (!currentReport) return;
    setIsExporting(true);
    await executeSave(currentReport, false);
    try {
      try {
        const url = getExcelExportUrl(currentReport.id);
        const res = await fetch(url);
        if (!res.ok) throw new Error('Backend export failed');
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const fileName = `${(currentReport.title || 'Report').replace(/[\\/*?:"<>|]/g, '_')}_${(currentReport.inspection_date || '').replace(/-/g, '')}.xlsx`;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (bErr) {
        await exportExcelClient(currentReport);
      }
      showToast('Excel report downloaded successfully', 'success');
    } catch (err) {
      console.error('Export Excel failed:', err);
      showToast('Failed to generate Excel report', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    if (!currentReport) return;
    setIsExporting(true);
    await executeSave(currentReport, false);
    try {
      try {
        const url = getPdfExportUrl(currentReport.id);
        const res = await fetch(url);
        if (!res.ok) throw new Error('Backend export failed');
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const fileName = `${(currentReport.title || 'Report').replace(/[\\/*?:"<>|]/g, '_')}_${(currentReport.inspection_date || '').replace(/-/g, '')}.pdf`;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (bErr) {
        await exportPdfClient(currentReport);
      }
      showToast('PDF report downloaded successfully', 'success');
    } catch (err) {
      console.error('Export PDF failed:', err);
      showToast('Failed to generate PDF report', 'error');
    } finally {
      setIsExporting(false);
    }
  };

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
        <div className="flex items-center gap-2.5 min-w-0">
          {isPhoneView && (
            <button
              onClick={() => setMobileDrawerOpen(true)}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
              title="Open reports menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <h2 className="text-xs md:text-sm font-bold text-slate-800 truncate max-w-[200px] md:max-w-md lg:max-w-xl">
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
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 rounded-lg shadow-xs transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Export Excel
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-xs transition-all"
          >
            <FileText className="w-3.5 h-3.5" />
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
                isMobileDrawer={true}
                onCloseMobileDrawer={() => setMobileDrawerOpen(false)}
              />
            </div>
          </div>
        )}

        {/* 3. Main Report Editor Area (Full Width Edge-to-Edge) */}
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
        <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200 p-2.5 px-4 flex items-center justify-between gap-2 z-30 shadow-lg">
          <button
            type="button"
            onClick={() => executeSave(currentReport, true)}
            disabled={isSaving}
            className="flex-1 py-2 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
          >
            <Save className="w-4 h-4 text-slate-600" />
            Save
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={isExporting}
            className="flex-1 py-2 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Excel
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExporting}
            className="flex-1 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm shadow-brand-600/30"
          >
            <FileText className="w-4 h-4" />
            PDF
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

      {/* Image Lightbox Zoom Modal */}
      <ImageModal
        isOpen={imageModalState.isOpen}
        imageUrl={imageModalState.url}
        title={imageModalState.title}
        onClose={() => setImageModalState({ isOpen: false, url: '', title: '' })}
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
