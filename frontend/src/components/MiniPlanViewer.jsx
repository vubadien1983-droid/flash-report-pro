import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileSpreadsheet, FileText, RefreshCw, ArrowLeft, Lock, Unlock, Radio,
  Laptop, Smartphone, Copy, Check, Download, Save,
} from 'lucide-react';
import MiniPlanTable from './MiniPlanTable';
import ImageModal from './ImageModal';
import PasswordModal from './PasswordModal';
import Toast from './Toast';
import { exportExcelClient, exportPdfClient } from '../services/clientExport';
import { exportMiniPlanHtml } from '../services/miniPlanHtml';
import { subscribeSharedMiniPlan, pushSharedMiniPlanEdit } from '../services/miniPlanLive';
import {
  isMiniPlanUnlocked, unlockMiniPlan, lockMiniPlan, onMiniPlanLockChange,
} from '../services/miniPlanAuth';
import { normalizeMiniPlanItems, MINI_PLAN_LABEL } from '../services/miniPlan';

/**
 * The public, LIVE view of a CPP Mechanical Mini Plan.
 *
 * Opened from a share link with no sign-in. Two things make it different from
 * the Flash Report viewer:
 *
 *  - It is LIVE. A Firestore listener keeps the table in step with whoever is
 *    editing; a status ticked on the platform re-colours here within a second.
 *    No refresh, and the link never goes stale.
 *  - It can EDIT, once the project password is entered. Edits go back to both
 *    the shared copy and the source report (services/miniPlanLive.js), so the
 *    plan has one version wherever it is opened. Without the password the
 *    page is strictly read-only.
 *
 * PHOTOS ARE NOT EDITABLE HERE, by design. Adding an image from the public
 * view would mean writing bytes into two photo subcollections from an
 * unauthenticated page, and a half-written pair is the failure BUG-012 was
 * made of. Photos are added in the app, on the phone or laptop that took
 * them; the link shows them.
 */
export default function MiniPlanViewer({ shareId }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [live, setLive] = useState(false);
  const [unlocked, setUnlocked] = useState(isMiniPlanUnlocked());
  const [askPassword, setAskPassword] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [toast, setToast] = useState({ message: '', type: 'success' });

  const [viewMode, setViewMode] = useState('auto');
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // A local edit must not be overwritten by the echo of its own write, nor by
  // somebody else's snapshot while it is still being typed. Same problem, and
  // the same answer, as BUG-001 on the editor side.
  const dirtyRef = useRef(false);
  const pushTimerRef = useRef(null);

  const showToast = (message, type = 'success') => setToast({ message, type });

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => onMiniPlanLockChange(setUnlocked), []);

  const isPhoneView = viewMode === 'phone' || (viewMode === 'auto' && windowWidth < 768);

  // ── Live subscription ──────────────────────────────────────────
  useEffect(() => {
    if (!shareId) return undefined;
    setLoading(true);

    const unsub = subscribeSharedMiniPlan(
      shareId,
      (data) => {
        setLoading(false);
        setLive(true);
        setNotFound(false);
        document.title = data.title || MINI_PLAN_LABEL;
        // Do not clobber edits still being typed here.
        if (dirtyRef.current) return;
        setReport(data);
      },
      (err) => {
        setLoading(false);
        setLive(false);
        if (String(err?.message || '').includes('not found')) setNotFound(true);
        else showToast('Live connection lost — the plan may be out of date', 'error');
      }
    );

    return () => {
      unsub();
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    };
  }, [shareId]);

  // ── Editing through the link ───────────────────────────────────
  const pushEdit = useCallback(async (items) => {
    if (!report) return;
    setSaving(true);
    try {
      await pushSharedMiniPlanEdit(shareId, report.source_report_id, items);
      dirtyRef.current = false;
      showToast('Saved — everyone on this link sees it', 'success');
    } catch (e) {
      console.error('Live edit failed:', e);
      showToast(`Could not save: ${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [report, shareId]);

  const handleItemsChange = (items) => {
    dirtyRef.current = true;
    setReport((r) => (r ? { ...r, items } : r));

    // Debounced, for the same reason the editor debounces its cloud push
    // (BUG-004): typing an activity should not be one Firestore write per
    // keystroke.
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => pushEdit(items), 1800);
  };

  const flushNow = () => {
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    if (report?.items) pushEdit(report.items);
  };

  // Leaving with an unsent edit would lose it silently.
  useEffect(() => {
    const warn = (e) => {
      if (!dirtyRef.current) return undefined;
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  // ── Gallery for the lightbox ───────────────────────────────────
  const galleryPhotos = React.useMemo(() => {
    const out = [];
    for (const item of report?.items || []) {
      for (const p of item.photos || []) {
        if (p?.url) out.push({ url: p.url, caption: item.activity || item.equipment || '' });
      }
    }
    return out;
  }, [report]);

  const openLightbox = (url) => {
    const i = galleryPhotos.findIndex((p) => p.url === url);
    setLightboxIndex(i >= 0 ? i : 0);
  };

  // ── Actions ────────────────────────────────────────────────────
  const runExport = async (fn, label) => {
    if (!report) return;
    setIsExporting(true);
    try {
      await fn(report);
      showToast(`${label} downloaded`, 'success');
    } catch (e) {
      console.error(`${label} export failed:`, e);
      showToast(`${label} export failed`, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      showToast('Could not copy the link', 'error');
    }
  };

  // ── States ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white gap-3 p-4">
        <RefreshCw className="w-8 h-8 text-brand-400 animate-spin" />
        <p className="text-sm font-medium text-slate-300">Connecting to the live plan…</p>
      </div>
    );
  }

  if (notFound || !report) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-slate-100 p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-lg border border-slate-200">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Plan Not Found</h2>
          <p className="text-xs text-slate-500 mb-6">
            This link may have been withdrawn or mistyped. Check it with whoever sent it.
          </p>
          <a href="#/" className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl">
            <ArrowLeft className="w-4 h-4" /> Go to the app
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-100 flex flex-col">
      <header className="px-3 sm:px-5 py-2.5 bg-white border-b border-slate-200/90 flex items-center justify-between gap-2 sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-600 to-sky-400 flex items-center justify-center text-white shadow-md flex-shrink-0">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-bold text-slate-900 truncate">{report.title || MINI_PLAN_LABEL}</h1>
            <p className="text-[10px] text-slate-500 flex items-center gap-1.5">
              {live ? (
                <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                  <Radio className="w-3 h-3 animate-pulse" /> Live
                </span>
              ) : (
                <span className="text-amber-600 font-semibold">Reconnecting…</span>
              )}
              <span className="text-slate-300">|</span>
              Block B - EPC#1
              {saving && <><span className="text-slate-300">|</span><span className="text-sky-600 font-semibold">Saving…</span></>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="hidden md:flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button onClick={() => setViewMode('laptop')} title="Laptop view"
              className={`p-1.5 rounded-md ${viewMode === 'laptop' ? 'bg-white text-brand-600 shadow-xs' : 'text-slate-500'}`}>
              <Laptop className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setViewMode('phone')} title="Phone view"
              className={`p-1.5 rounded-md ${viewMode === 'phone' ? 'bg-white text-brand-600 shadow-xs' : 'text-slate-500'}`}>
              <Smartphone className="w-3.5 h-3.5" />
            </button>
          </div>

          {unlocked ? (
            <>
              <button
                type="button"
                onClick={flushNow}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                title="Save now"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">Save</span>
              </button>
              <button
                type="button"
                onClick={() => { flushNow(); lockMiniPlan(); showToast('Editing locked', 'info'); }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                title="Lock editing again"
              >
                <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden lg:inline">Lock</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setAskPassword(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg"
              title="Enter the project password to edit"
            >
              <Lock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Unlock to edit</span>
            </button>
          )}

          <button type="button" onClick={copyLink} title="Copy this link"
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button type="button" onClick={() => runExport(exportExcelClient, 'Excel')} disabled={isExporting}
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 rounded-lg">
            {isExporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
            Excel
          </button>

          <button type="button" onClick={() => runExport(exportPdfClient, 'PDF')} disabled={isExporting}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg">
            {isExporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            PDF
          </button>

          <button type="button" onClick={() => exportMiniPlanHtml(report)} title="Download a standalone .html snapshot"
            className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg">
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      <main className="flex-1 w-full p-3 md:p-4">
        <MiniPlanTable
          items={normalizeMiniPlanItems(report.items)}
          onItemsChange={handleItemsChange}
          onPhotoClick={openLightbox}
          isMobileMode={isPhoneView}
          readOnly={!unlocked}
          onRequestUnlock={() => setAskPassword(true)}
        />

        <p className="text-center text-[11px] text-slate-500 pb-6">
          Live shared plan · Block B - EPC#1 ·{' '}
          <a href="#/" className="text-brand-600 hover:underline font-medium">Open the app</a>
        </p>
      </main>

      <PasswordModal
        isOpen={askPassword}
        title="Unlock this plan"
        message="Editing is restricted to the project team. Photos are added from the app."
        onSubmit={(pw) => {
          const ok = unlockMiniPlan(pw);
          if (ok) {
            setAskPassword(false);
            showToast('Editing unlocked', 'success');
          }
          return ok;
        }}
        onClose={() => setAskPassword(false)}
      />

      <ImageModal
        isOpen={lightboxIndex !== null}
        photos={galleryPhotos}
        index={lightboxIndex ?? 0}
        onIndexChange={setLightboxIndex}
        title={report.title}
        onClose={() => setLightboxIndex(null)}
      />

      <Toast
        message={toast.message}
        type={toast.type}
        duration={3000}
        onClose={() => setToast({ message: '', type: 'success' })}
      />
    </div>
  );
}
