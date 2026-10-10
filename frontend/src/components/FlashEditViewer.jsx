import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText, RefreshCw, Radio, Laptop, Smartphone, Save, KeyRound, Lock, Eye,
  FileSpreadsheet, Download, Calendar, Tag, MapPin, Layers,
} from 'lucide-react';
import InspectionTable from './InspectionTable';
import ImageModal from './ImageModal';
import FilePreviewModal from './FilePreviewModal';
import Toast from './Toast';
import {
  subscribeSharedMiniPlan, pushSharedMiniPlanEdit, hydrateWithLocalPhotos,
  deletePhotoBytes, refOf, loadMissingSharedPhotos,
} from '../services/miniPlanLive';
import { mergeMiniPlanItems } from '../services/miniPlanMerge';
import { isFirebaseConfigured, fileKey } from '../services/firebase';
import { putAttachment, getAttachmentBlob, prefetchReportVideos, formatBytes } from '../services/fileAttachments';
import { rememberPoster } from '../services/videoMedia';
import {
  FLASH_MERGE_OPTS, FLASH_MERGE_FIELDS, normalizeFlashItems, placeBySlot,
  checkEditPassword, isFlashEditUnlocked, unlockFlashEdit, lockFlashEdit,
} from '../services/flashEdit';

/**
 * The EDITABLE link of a Flash Report: #/view/<shareId>?edit=1
 *
 * Built on the same engine as the Mini Plan / OPS links: a live listener, a
 * local draft, automatic retry, photo BYTES written before the document
 * (BUG-032), a deleted photo takes its bytes with it (BUG-035), and every save
 * is a three-way MERGE with what the cloud holds (BUG-033). The page is locked
 * behind the report's edit password; the plain password is never in the shared
 * copy, only a salted digest of it (services/flashEdit.js).
 */
export default function FlashEditViewer({ shareId }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [stalled, setStalled] = useState('');
  const [live, setLive] = useState(false);
  const [unlocked, setUnlocked] = useState(() => isFlashEditUnlocked(shareId));
  const [saving, setSaving] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [subKey, setSubKey] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [filePreview, setFilePreview] = useState({ isOpen: false, blob: null, filename: '', mime: '', size: 0 });
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [viewMode, setViewMode] = useState('auto');
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [exporting, setExporting] = useState('');

  const dirtyRef = useRef(false);
  const pushTimerRef = useRef(null);
  const baseRef = useRef([]);
  const itemsRef = useRef([]);
  const reportRef = useRef(null);
  const retryRef = useRef({ timer: null, tries: 0 });
  const pushEditRef = useRef(null);
  reportRef.current = report;

  const showToast = (message, type = 'success') => setToast({ message, type });
  const viewOnlyUrl = `${window.location.href.split('#')[0]}#/view/${shareId}`;

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const isPhoneView = viewMode === 'phone' || (viewMode === 'auto' && windowWidth < 768);

  // ── Local draft: a refresh or a flat battery must not take an edit with it ──
  const backupKey = `fr_share_pending_${shareId}`;
  const writeBackup = (items) => {
    try {
      const light = (items || []).map((it) => ({
        ...it,
        photos: (it.photos || []).map((p) => (p && p.url && p.url.startsWith('data:') ? { ...p, url: '' } : p)),
      }));
      localStorage.setItem(backupKey, JSON.stringify({ items: light, base: baseRef.current, at: Date.now() }));
    } catch { /* storage full or blocked: the in-memory copy still stands */ }
  };
  const readBackup = () => {
    try {
      const data = JSON.parse(localStorage.getItem(backupKey) || 'null');
      if (!data?.items?.length || Date.now() - (data.at || 0) > 24 * 3600 * 1000) return null;
      return data;
    } catch { return null; }
  };
  const clearBackup = () => { try { localStorage.removeItem(backupKey); } catch { /* nothing */ } };

  // ── Live subscription ───────────────────────────────────────────
  useEffect(() => {
    if (!shareId) return undefined;
    if (!reportRef.current) setLoading(true);        // only the FIRST load shows a loading screen (BUG-026)
    const silent = setTimeout(() => {
      setLoading((was) => {
        if (was) setStalled('The report did not answer. The network may be blocking it.');
        return false;
      });
    }, 15_000);

    const unsub = subscribeSharedMiniPlan(
      shareId,
      (data) => {
        clearTimeout(silent);
        setLoading(false);
        setLive(true);
        setStalled('');
        setNotFound(false);
        document.title = data.title || 'Flash Report';
        const remote = data.items || [];

        // This device has edits not yet saved: fold the cloud copy INTO them.
        if (dirtyRef.current && itemsRef.current.length) {
          const merged = mergeMiniPlanItems(baseRef.current, itemsRef.current, remote, FLASH_MERGE_OPTS);
          const items = placeBySlot(merged.items);
          baseRef.current = remote;
          itemsRef.current = items;
          setReport({ ...data, items });
          return;
        }
        const backup = !baseRef.current.length ? readBackup() : null;
        if (backup && isFlashEditUnlocked(shareId)) {
          const merged = mergeMiniPlanItems(backup.base || remote, backup.items, remote, FLASH_MERGE_OPTS);
          const items = placeBySlot(merged.items);
          baseRef.current = remote;
          itemsRef.current = items;
          dirtyRef.current = true;
          setUnsaved(true);
          setReport({ ...data, items });
          showToast('Draft from this device restored — saving it now', 'success');
          if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
          pushTimerRef.current = setTimeout(() => pushEditRef.current?.(items), 800);
          return;
        }
        baseRef.current = remote;
        itemsRef.current = remote;
        setReport(data);
      },
      (err) => {
        clearTimeout(silent);
        setLoading(false);
        setLive(false);
        if (String(err?.message || '').toLowerCase().includes('not found')) setNotFound(true);
        else {
          setStalled(err?.message || 'The report could not be opened.');
          showToast('Live connection lost — the report may be out of date', 'error');
        }
      },
      { normalize: normalizeFlashItems },
    );
    return () => { clearTimeout(silent); unsub(); if (pushTimerRef.current) clearTimeout(pushTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId, subKey]);

  // Videos on screen are fetched in the background so a click plays at once.
  useEffect(() => {
    prefetchReportVideos([['shared', shareId], ['report', report?.source_report_id]], report?.items);
  }, [report, shareId]);

  // ── Saving through the link ─────────────────────────────────────
  function scheduleRetry() {
    const tries = Math.min(retryRef.current.tries + 1, 6);
    retryRef.current.tries = tries;
    if (retryRef.current.timer) clearTimeout(retryRef.current.timer);
    retryRef.current.timer = setTimeout(() => pushEditRef.current?.(itemsRef.current), Math.min(30_000, 4_000 * tries));
  }

  const pushEdit = useCallback(async (items) => {
    const rep = reportRef.current;
    if (!rep) return;
    const rows = items || itemsRef.current;
    writeBackup(rows);
    setSaving(true);
    try {
      const res = await pushSharedMiniPlanEdit(shareId, rep.source_report_id, rows, {
        base: baseRef.current,
        normalize: normalizeFlashItems,
        mergeOpts: FLASH_MERGE_OPTS,
        compareFields: FLASH_MERGE_FIELDS,
        finalize: placeBySlot,
      });
      const saved = placeBySlot(hydrateWithLocalPhotos(shareId, res.items || rows));
      baseRef.current = res.items || rows;
      itemsRef.current = saved;
      setReport((r) => (r ? { ...r, items: saved } : r));
      dirtyRef.current = false;
      setUnsaved(false);
      retryRef.current.tries = 0;
      if (retryRef.current.timer) { clearTimeout(retryRef.current.timer); retryRef.current.timer = null; }
      clearBackup();
      if (res.skipped) { showToast('Already up to date', 'success'); return; }
      const m = res.merge;
      const fromThem = m ? (m.fromTheirs + m.addedRemote) : 0;
      showToast(
        fromThem
          ? `Saved — and ${fromThem} change${fromThem === 1 ? '' : 's'} from another device kept`
          : (res.photos?.written ? `Saved with ${res.photos.written} photo${res.photos.written === 1 ? '' : 's'}` : 'Saved'),
        'success',
      );
      if (res.photos?.failed) {
        showToast(`${res.photos.failed} photo could not be saved — will retry`, 'error');
        dirtyRef.current = true;
        setUnsaved(true);
        scheduleRetry();
      }
    } catch (e) {
      console.error('Edit through the link failed:', e);
      dirtyRef.current = true;
      setUnsaved(true);
      if (retryRef.current.tries === 0) showToast(`Not saved yet: ${e.message} — retrying`, 'error');
      scheduleRetry();
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId]);
  useEffect(() => { pushEditRef.current = pushEdit; }, [pushEdit]);

  /** A photo that disappeared from a row takes its bytes with it (BUG-035). */
  const dropRemovedPhotos = (prev, next) => {
    const src = reportRef.current?.source_report_id;
    const nextById = new Map((next || []).map((it) => [it?.id, it]));
    (prev || []).forEach((it) => {
      if (!it) return;
      const keep = nextById.get(it.id);
      const keepSlots = new Set((keep?.photos || []).map((p, i) => (p && p.kind !== 'file' ? (p.slot_index ?? i) : null)).filter((s) => s !== null));
      (it.photos || []).forEach((p, i) => {
        if (!p || p.kind === 'file') return;
        const slot = p.slot_index ?? i;
        if (keep && keepSlots.has(slot)) return;
        deletePhotoBytes(shareId, src, refOf(it, p, slot)).catch((e) => console.warn('Photo bytes not removed:', e?.message));
      });
    });
  };

  const handleItemsChange = (next) => {
    const items = placeBySlot(next);
    dropRemovedPhotos(itemsRef.current, items);
    dirtyRef.current = true;
    setUnsaved(true);
    itemsRef.current = items;
    writeBackup(items);
    setReport((r) => (r ? { ...r, items } : r));
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => pushEditRef.current?.(items), 2500);
  };

  const flushNow = () => {
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    if (retryRef.current.timer) { clearTimeout(retryRef.current.timer); retryRef.current.timer = null; }
    retryRef.current.tries = 0;
    pushEditRef.current?.(itemsRef.current.length ? itemsRef.current : report?.items);
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      if (dirtyRef.current && itemsRef.current.length) {
        if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
        await pushEditRef.current?.(itemsRef.current);
      }
      dirtyRef.current = false;
      setSubKey((k) => k + 1);
      showToast('Synced with the latest report', 'success');
    } catch (e) {
      showToast(`Sync failed: ${e.message}`, 'error');
    } finally {
      setTimeout(() => setSyncing(false), 600);
    }
  };

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

  // ── Files and videos ────────────────────────────────────────────
  const attachFromLink = async (itemIndex, slotIndex, file, extra = {}) => {
    if (!file) return;
    const item = (itemsRef.current || [])[itemIndex];
    if (!item) return;
    const key = fileKey(item.id || `item_${itemIndex}`, slotIndex);
    try {
      const descriptor = await putAttachment('shared', shareId, key, file);
      const src = reportRef.current?.source_report_id;
      if (src) {
        try { await putAttachment('report', src, key, file); } catch (e) { console.warn('File not copied to the report:', e.message); }
      }
      const photos = [...(item.photos || [])];
      while (photos.length <= slotIndex) photos.push(null);
      photos[slotIndex] = {
        ...descriptor,
        id: `file_${Date.now()}_${slotIndex}`,
        slot_index: slotIndex,
        ...(extra?.duration ? { duration: Math.round(extra.duration) } : {}),
      };
      if (extra?.poster) rememberPoster(key, extra.poster);
      handleItemsChange(itemsRef.current.map((it, i) => (i === itemIndex ? { ...it, photos } : it)));
      showToast(`Attached ${file.name} (${formatBytes(file.size)})`, 'success');
    } catch (e) {
      showToast(e.message || 'Could not attach that file', 'error');
    }
  };

  const openAttachment = async (photo, item, itemIndex) => {
    const ref = photo?.file_ref || (item ? fileKey(item.id || `item_${itemIndex}`, photo?.slot_index ?? 0) : '');
    if (!ref) { showToast('That attachment has no file reference.', 'error'); return; }
    try {
      let got = await getAttachmentBlob('shared', shareId, ref, { expect: photo });
      const src = reportRef.current?.source_report_id;
      if (!got && src) got = await getAttachmentBlob('report', src, ref, { expect: photo });
      if (!got) { showToast('That file is not in the cloud (yet)', 'error'); return; }
      setFilePreview({
        isOpen: true, blob: got.blob,
        filename: got.meta?.filename || photo?.filename || 'file',
        mime: got.meta?.mime || got.blob.type || '', size: got.meta?.size || got.blob.size || 0,
      });
    } catch (e) {
      showToast(`Could not open the file: ${e.message}`, 'error');
    }
  };

  // ── Export ──────────────────────────────────────────────────────
  const exportFile = async (kind) => {
    if (!report) return;
    setExporting(kind);
    try {
      const mod = await import('../services/clientExport');
      const { items, failed } = await loadMissingSharedPhotos(shareId, itemsRef.current || report.items || []);
      const rep = { ...report, items };
      if (kind === 'xlsx') await mod.exportExcelClient(rep);
      else await mod.exportPdfClient(rep);
      showToast(`${kind === 'xlsx' ? 'Excel' : 'PDF'} downloaded` + (failed ? ` — ${failed} picture(s) could not be loaded` : ''), failed ? 'error' : 'success');
    } catch (e) {
      console.error(e);
      showToast(`Export failed: ${e?.message || e}`, 'error');
    } finally {
      setExporting('');
    }
  };

  // ── States ──────────────────────────────────────────────────────
  if (loading && !report) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white gap-3 p-4">
        <RefreshCw className="w-8 h-8 text-brand-400 animate-spin" />
        <p className="text-sm font-medium text-slate-300">Opening the report…</p>
      </div>
    );
  }
  if (stalled && !report) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white gap-3 p-6 text-center">
        <RefreshCw className="w-8 h-8 text-amber-400" />
        <p className="text-base font-bold">The report did not load</p>
        <p className="text-sm text-slate-300 max-w-md">{stalled}</p>
        <button type="button" onClick={() => { setStalled(''); setLoading(true); setSubKey((k) => k + 1); }}
          className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold mt-2">Try again</button>
        <p className="text-[11px] text-slate-500 mt-2">Report id: {shareId} · cloud settings: {isFirebaseConfigured ? 'present' : 'MISSING in this build'}</p>
      </div>
    );
  }
  if (notFound || !report) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-slate-100 p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-lg border border-slate-200">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4"><FileText className="w-6 h-6" /></div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Report Not Found</h2>
          <p className="text-xs text-slate-500">This link may have been withdrawn or mistyped. Check it with whoever sent it.</p>
        </div>
      </div>
    );
  }

  // ── The lock ────────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <PasswordGate
        title={report.title}
        enabled={Boolean(report.edit_pw_hash && report.edit_pw_salt)}
        viewOnlyUrl={viewOnlyUrl}
        onSubmit={(pw) => {
          if (!checkEditPassword(pw, report.edit_pw_salt, report.edit_pw_hash)) return false;
          unlockFlashEdit(shareId);
          setUnlocked(true);
          return true;
        }}
      />
    );
  }

  const items = report.items || [];
  const galleryPhotos = [];
  items.forEach((item, i) => {
    (item.photos || []).forEach((p, sIdx) => {
      if (p && p.url && p.kind !== 'file') {
        galleryPhotos.push({ url: p.url, filename: p.filename || `Item ${i + 1} · Photo ${(p.slot_index ?? sIdx) + 1}` });
      }
    });
  });
  const openLightbox = (url) => {
    const idx = galleryPhotos.findIndex((g) => g.url === url);
    setLightboxIndex(idx >= 0 ? idx : 0);
  };

  return (
    <div className="h-app w-full bg-slate-100 flex flex-col overflow-hidden">
      <header className="px-3 sm:px-5 py-2 bg-white border-b border-slate-200/90 flex items-center justify-between gap-2 shadow-2xs">
        <div className="min-w-0">
          <h1 className="text-xs sm:text-sm font-bold text-slate-900 truncate">{report.title || 'Flash Report'}</h1>
          <p className="text-[10px] text-slate-500 flex items-center gap-1.5 flex-wrap">
            {live
              ? <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold"><Radio className="w-3 h-3 animate-pulse" /> Live · editing</span>
              : <span className="text-amber-600 font-semibold">Reconnecting…</span>}
            {report.system_tag && <span className="inline-flex items-center gap-0.5"><Tag className="w-3 h-3" />{report.system_tag}</span>}
            {report.location && <span className="inline-flex items-center gap-0.5"><MapPin className="w-3 h-3" />{report.location}</span>}
            {report.inspection_date && <span className="inline-flex items-center gap-0.5"><Calendar className="w-3 h-3" />{report.inspection_date}</span>}
            {report.discipline && <span className="inline-flex items-center gap-0.5"><Layers className="w-3 h-3" />{report.discipline}</span>}
            {saving && <span className="text-sky-600 font-semibold">Saving…</span>}
            {!saving && unsaved && <span className="text-amber-600 font-semibold">Unsaved — retrying</span>}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="hidden md:flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button onClick={() => setViewMode('laptop')} title="Laptop view"
              className={`p-1.5 rounded-md ${viewMode === 'laptop' ? 'bg-white text-brand-600 shadow-xs' : 'text-slate-500'}`}><Laptop className="w-3.5 h-3.5" /></button>
            <button onClick={() => setViewMode('phone')} title="Phone view"
              className={`p-1.5 rounded-md ${viewMode === 'phone' ? 'bg-white text-brand-600 shadow-xs' : 'text-slate-500'}`}><Smartphone className="w-3.5 h-3.5" /></button>
          </div>
          <button type="button" onClick={() => exportFile('xlsx')} disabled={Boolean(exporting)} title="Download Excel"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg disabled:opacity-60">
            {exporting === 'xlsx' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}<span className="hidden sm:inline">Excel</span>
          </button>
          <button type="button" onClick={() => exportFile('pdf')} disabled={Boolean(exporting)} title="Download PDF"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg disabled:opacity-60">
            {exporting === 'pdf' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}<span className="hidden sm:inline">PDF</span>
          </button>
          <button type="button" onClick={syncNow} disabled={syncing} title="Pull the latest version now"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">Sync</span>
          </button>
          <button type="button" onClick={flushNow} disabled={saving} title="Save now"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}<span className="hidden sm:inline">Save</span>
          </button>
          <button type="button" title="Lock editing"
            onClick={() => { flushNow(); lockFlashEdit(shareId); setUnlocked(false); showToast('Editing locked', 'info'); }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">
            <Lock className="w-3.5 h-3.5" /><span className="hidden sm:inline">Lock</span>
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 w-full overflow-auto px-1 pt-1.5 pb-2 sm:px-2">
        <InspectionTable
          items={items}
          onItemsChange={handleItemsChange}
          onPhotoClick={openLightbox}
          onAttachFile={attachFromLink}
          onOpenAttachment={openAttachment}
          isMobileMode={isPhoneView}
        />
      </main>

      <ImageModal
        isOpen={lightboxIndex !== null}
        photos={galleryPhotos}
        index={lightboxIndex ?? 0}
        onIndexChange={setLightboxIndex}
        title={report.title}
        onClose={() => setLightboxIndex(null)}
      />
      <FilePreviewModal
        isOpen={filePreview.isOpen}
        blob={filePreview.blob}
        filename={filePreview.filename}
        mime={filePreview.mime}
        size={filePreview.size}
        onClose={() => setFilePreview({ isOpen: false, blob: null, filename: '', mime: '', size: 0 })}
      />
      <Toast message={toast.message} type={toast.type} duration={3000} onClose={() => setToast({ message: '', type: 'success' })} />
    </div>
  );
}

/** The lock screen: what is typed is checked against the digest in the shared copy. */
function PasswordGate({ title, enabled, viewOnlyUrl, onSubmit }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [fails, setFails] = useState(0);
  const [until, setUntil] = useState(0);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!until) return undefined;
    const t = setInterval(() => { tick((n) => n + 1); if (Date.now() >= until) setUntil(0); }, 500);
    return () => clearInterval(t);
  }, [until]);

  const wait = Math.max(0, Math.ceil((until - Date.now()) / 1000));

  const submit = (e) => {
    e.preventDefault();
    if (wait > 0 || !value.trim()) return;
    if (onSubmit(value)) return;
    const n = fails + 1;
    setFails(n);
    setValue('');
    setError('Wrong password.');
    if (n >= 5) setUntil(Date.now() + Math.min(300, 15 * 2 ** (n - 5)) * 1000);
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white rounded-2xl p-7 max-w-sm w-full shadow-lg border border-slate-200">
        <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center mx-auto mb-3"><KeyRound className="w-6 h-6" /></div>
        <h2 className="text-base font-bold text-slate-900 text-center">{title || 'Flash Report'}</h2>
        {enabled ? (
          <form onSubmit={submit} className="mt-4">
            <p className="text-xs text-slate-500 text-center mb-3">Enter the editing password to change this report.</p>
            <input
              type="password" autoFocus autoComplete="off" value={value}
              onChange={(e) => { setValue(e.target.value); setError(''); }}
              disabled={wait > 0} placeholder="Password"
              className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2.5 outline-none focus:border-brand-500"
            />
            {error && <p className="text-xs text-rose-600 mt-2">{error}{wait > 0 ? ` Try again in ${wait}s.` : ''}</p>}
            <button type="submit" disabled={wait > 0 || !value.trim()}
              className="w-full mt-3 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-bold">Unlock to edit</button>
          </form>
        ) : (
          <p className="text-xs text-slate-500 text-center mt-3">Editing is not switched on for this report. Ask the owner for an editable link.</p>
        )}
        <a href={viewOnlyUrl} className="mt-4 flex items-center justify-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline">
          <Eye className="w-3.5 h-3.5" /> Open the view-only report
        </a>
      </div>
    </div>
  );
}
