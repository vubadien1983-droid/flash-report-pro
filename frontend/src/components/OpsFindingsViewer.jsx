import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText, RefreshCw, ArrowLeft, Radio, Laptop, Smartphone, Save, KeyRound, Lock, Unlock,
} from 'lucide-react';
import OpsFindingsWorkspace from './OpsFindingsWorkspace';
import ImageModal from './ImageModal';
import FilePreviewModal from './FilePreviewModal';
import PasswordModal from './PasswordModal';
import Toast from './Toast';
import { subscribeSharedOps, pushSharedOpsEdit, OPS_MERGE_OPTS } from '../services/opsFindingsLive';
import { hydrateWithLocalPhotos, deletePhotoBytes, refOf } from '../services/miniPlanLive';
import { mergeMiniPlanItems } from '../services/miniPlanMerge';
import { isFirebaseConfigured, fileKey } from '../services/firebase';
import { putAttachment, getAttachmentBlob, formatBytes } from '../services/fileAttachments';
import {
  isOpsSectionUnlocked, unlockOpsSection, lockOpsSection, onOpsLockChange,
  unlockOpsMaster, isOpsMasterUnlocked, lockAllOps,
} from '../services/opsAuth';
import { normalizeOpsItems, OPS_FINDINGS_LABEL } from '../services/opsFindings';
import { aliasForShareId, ALIAS_TITLES, aliasKeyFromHash, shareIdFromHost, publicShareUrl } from '../services/shareAliases';

/**
 * The public, LIVE share link of the OPS Findings report — built exactly like
 * the Mini Plan's (MiniPlanViewer) and sharing its engine:
 *
 *  - LIVE: a Firestore listener keeps every open link in step (seconds);
 *  - EDITABLE PER TAB: each section tab unlocks with its own password
 *    (checked against salted digests — services/opsAuth.js);
 *    the Summary tab needs none because it edits nothing;
 *  - photos pasted / uploaded / deleted and documents attached right here, with
 *    the BYTES written first (BUG-032) and a deletion removing the bytes too
 *    (BUG-035);
 *  - every save is a three-way MERGE with what the cloud holds (BUG-033), with
 *    a local draft, automatic retry, Save and Sync, and a leave-page guard;
 *  - Excel / PDF / Link on every tab.
 *
 * `#/view/<shareId>?tab=B` opens on section B's tab.
 */
function tabFromHash() {
  const m = /[?&]tab=([^&]+)/.exec(window.location.hash || '') || /[?&]tab=([^&]+)/.exec(window.location.search || '');
  return m ? decodeURIComponent(m[1]) : '';
}

export default function OpsFindingsViewer({ shareId }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [live, setLive] = useState(false);
  const [, setLockTick] = useState(0);
  const [askPassword, setAskPassword] = useState(null);   // { letter, section }
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [subKey, setSubKey] = useState(0);
  const [stalled, setStalled] = useState('');
  const [lightbox, setLightbox] = useState(null);           // { list, index }
  const [filePreview, setFilePreview] = useState({ isOpen: false, blob: null, filename: '', mime: '', size: 0 });
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [viewMode, setViewMode] = useState('auto');
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [unsaved, setUnsaved] = useState(false);

  const dirtyRef = useRef(false);
  const pushTimerRef = useRef(null);
  const baseRef = useRef([]);
  const itemsRef = useRef([]);
  const retryRef = useRef({ timer: null, tries: 0 });
  const reportRef = useRef(null);
  reportRef.current = report;

  const showToast = (message, type = 'success') => setToast({ message, type });

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => onOpsLockChange(() => setLockTick((n) => n + 1)), []);
  const isPhoneView = viewMode === 'phone' || (viewMode === 'auto' && windowWidth < 768);

  // ── Local draft: a refresh or a dead phone must not take an edit with it ──
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

  // ── Live subscription ──────────────────────────────────────────
  useEffect(() => {
    if (!shareId) return undefined;
    if (!reportRef.current) setLoading(true);     // only the FIRST load shows a loading screen (BUG-026)
    const silent = setTimeout(() => {
      setLoading((was) => {
        if (was) setStalled('The live report did not answer. The network may be blocking it.');
        return false;
      });
    }, 15_000);

    const unsub = subscribeSharedOps(
      shareId,
      (data) => {
        clearTimeout(silent);
        setLoading(false);
        setLive(true);
        setStalled('');
        setNotFound(false);
        // A named link carries its own name into the browser tab.
        document.title = (shareIdFromHost() ? 'OPS Finding Status' : '') || ALIAS_TITLES[aliasKeyFromHash(window.location.hash)] || (aliasForShareId(shareId) ? aliasForShareId(shareId).replace(/-/g, ' ') : '') || data.title || OPS_FINDINGS_LABEL;
        const remote = data.items || [];

        if (dirtyRef.current && itemsRef.current.length) {
          const merged = mergeMiniPlanItems(baseRef.current, itemsRef.current, remote, OPS_MERGE_OPTS);
          baseRef.current = remote;
          itemsRef.current = merged.items;
          setReport({ ...data, items: merged.items });
          return;
        }
        const backup = !baseRef.current.length ? readBackup() : null;
        if (backup) {
          const merged = mergeMiniPlanItems(backup.base || remote, backup.items, remote, OPS_MERGE_OPTS);
          baseRef.current = remote;
          itemsRef.current = merged.items;
          dirtyRef.current = true;
          setUnsaved(true);
          setReport({ ...data, items: merged.items });
          showToast('Draft from this device restored — saving it now', 'success');
          if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
          pushTimerRef.current = setTimeout(() => pushEditRef.current(merged.items), 800);
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
          setStalled(err?.message || 'The live report could not be opened.');
          showToast('Live connection lost — the report may be out of date', 'error');
        }
      },
    );
    return () => { clearTimeout(silent); unsub(); if (pushTimerRef.current) clearTimeout(pushTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId, subKey]);

  // ── Saving through the link ────────────────────────────────────
  const pushEdit = useCallback(async (items) => {
    const rep = reportRef.current;
    if (!rep) return;
    const rows = items || itemsRef.current;
    writeBackup(rows);
    setSaving(true);
    try {
      const res = await pushSharedOpsEdit(shareId, rep.source_report_id, rows, { base: baseRef.current });
      const saved = hydrateWithLocalPhotos(shareId, res.items || rows);
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
          : (res.photos?.written ? `Saved with ${res.photos.written} photo${res.photos.written === 1 ? '' : 's'}` : 'Saved — everyone on this link sees it'),
        'success',
      );
      if (res.photos?.failed) {
        showToast(`${res.photos.failed} photo could not be saved — will retry`, 'error');
        dirtyRef.current = true;
        setUnsaved(true);
        scheduleRetry();
      }
    } catch (e) {
      console.error('Live edit failed:', e);
      dirtyRef.current = true;
      setUnsaved(true);
      if (retryRef.current.tries === 0) showToast(`Not saved yet: ${e.message} — retrying`, 'error');
      scheduleRetry();
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId]);

  const pushEditRef = useRef(pushEdit);
  useEffect(() => { pushEditRef.current = pushEdit; }, [pushEdit]);

  function scheduleRetry() {
    const tries = Math.min(retryRef.current.tries + 1, 6);
    retryRef.current.tries = tries;
    if (retryRef.current.timer) clearTimeout(retryRef.current.timer);
    retryRef.current.timer = setTimeout(() => pushEditRef.current(itemsRef.current), Math.min(30_000, 4_000 * tries));
  }

  const handleItemsChange = (items) => {
    dirtyRef.current = true;
    setUnsaved(true);
    itemsRef.current = items;
    writeBackup(items);
    setReport((r) => (r ? { ...r, items } : r));
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => pushEditRef.current(items), 2500);
  };

  const flushNow = () => {
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    if (retryRef.current.timer) { clearTimeout(retryRef.current.timer); retryRef.current.timer = null; }
    retryRef.current.tries = 0;
    pushEditRef.current(itemsRef.current.length ? itemsRef.current : report?.items);
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      if (dirtyRef.current && itemsRef.current.length) {
        if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
        await pushEditRef.current(itemsRef.current);
      }
      dirtyRef.current = false;
      setSubKey((k) => k + 1);
      showToast('Synced with the live report', 'success');
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

  // ── Photos and documents ──────────────────────────────────────
  const dropPhotoBytes = (item, photo) => {
    const ref = photo?.photo_ref || refOf(item, photo, photo?.slot_index ?? 0);
    deletePhotoBytes(shareId, reportRef.current?.source_report_id, ref)
      .catch((e) => console.warn('Photo bytes not removed:', e?.message));
  };

  const attachFromLink = async (item, itemIndex, file, slotIndex) => {
    if (!file) return null;
    const key = fileKey(item?.id || `item_${itemIndex}`, slotIndex);
    try {
      const descriptor = await putAttachment('shared', shareId, key, file);
      const src = reportRef.current?.source_report_id;
      if (src) {
        try { await putAttachment('report', src, key, file); } catch (e) { console.warn('File not copied to the report:', e.message); }
      }
      showToast(`Attached ${file.name} (${formatBytes(file.size)})`, 'success');
      return { ...descriptor, id: `file_${Date.now()}_${slotIndex}` };
    } catch (e) {
      showToast(e.message || 'Could not attach that file', 'error');
      return null;
    }
  };

  const openAttachment = async (photo, item, itemIndex) => {
    const ref = photo?.file_ref || (item ? fileKey(item.id || `item_${itemIndex}`, photo?.slot_index ?? 0) : '');
    if (!ref) { showToast('That attachment has no file reference.', 'error'); return; }
    showToast(`Opening ${photo?.filename || 'file'}…`, 'success');
    try {
      let got = await getAttachmentBlob('shared', shareId, ref);
      const src = reportRef.current?.source_report_id;
      if (!got && src) got = await getAttachmentBlob('report', src, ref);
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

  const openRowLightbox = (entry, rowEntries, itemIndex) => {
    const item = (itemsRef.current || [])[itemIndex];
    const all = item?.photos || [];
    const list = (rowEntries || []).filter(Boolean).map((p) => {
      const at = all.findIndex((x) => x && (p.id ? x.id === p.id : x === p));
      return { ...p, itemIndex, photoIndex: at, slotIndex: p.slot_index ?? at };
    });
    if (!list.length) return;
    const at = list.findIndex((p) => (entry?.id ? p.id === entry.id : p.url === entry?.url));
    setLightbox({ list, index: at < 0 ? 0 : at });
  };

  const lightboxItemLetter = () => {
    const it = lightbox?.list?.[0] ? itemsRef.current[lightbox.list[0].itemIndex] : null;
    const m = /^\s*([A-Za-z])\s*[.)\-:]/.exec(it?.section || '');
    return m ? m[1].toUpperCase() : '';
  };

  const deletePhoto = (photo) => {
    const items = itemsRef.current || [];
    const item = items[photo.itemIndex];
    if (!item) return;
    const gone = (item.photos || [])[photo.photoIndex];
    const photos = (item.photos || []).filter((_, idx) => idx !== photo.photoIndex);
    handleItemsChange(items.map((it, i) => (i === photo.itemIndex ? { ...it, photos } : it)));
    if (gone) dropPhotoBytes(item, gone);
    setLightbox((lb) => {
      if (!lb) return lb;
      const rest = lb.list.filter((x) => x.photoIndex !== photo.photoIndex)
        .map((x) => (x.photoIndex > photo.photoIndex ? { ...x, photoIndex: x.photoIndex - 1 } : x));
      return rest.length ? { list: rest, index: Math.min(lb.index, rest.length - 1) } : null;
    });
    showToast('Photo deleted', 'success');
  };

  // ── Export and link ───────────────────────────────────────────
  const exportFile = async (kind, view) => {
    if (!report) return;
    try {
      const mod = await import('../services/opsFindingsExport');
      const rep = { ...report, items: normalizeOpsItems(report.items) };
      if (kind === 'xlsx') await mod.exportOpsExcel(rep, view);
      else await mod.exportOpsPdf(rep, view);
      showToast(`${kind === 'xlsx' ? 'Excel' : 'PDF'} downloaded`, 'success');
    } catch (e) {
      console.error(e);
      showToast(`Export failed: ${e.message}`, 'error');
    }
  };

  const copyTabLink = async (tab) => {
    const base = window.location.href.split('#')[0];
    const url = publicShareUrl(shareId, tab) || `${base}#/view/${shareId}`;
    try { await navigator.clipboard.writeText(url); showToast('Link to this tab copied', 'success'); }
    catch { showToast(url, 'info'); }
  };

  // ── States ─────────────────────────────────────────────────────
  if (loading && !report) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white gap-3 p-4">
        <RefreshCw className="w-8 h-8 text-brand-400 animate-spin" />
        <p className="text-sm font-medium text-slate-300">Connecting to the live report…</p>
      </div>
    );
  }
  if (stalled && !report) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white gap-3 p-6 text-center">
        <RefreshCw className="w-8 h-8 text-amber-400" />
        <p className="text-base font-bold">The report did not load</p>
        <p className="text-sm text-slate-300 max-w-md">{stalled}</p>
        <div className="flex gap-2 mt-2">
          <button type="button" onClick={() => { setStalled(''); setLoading(true); setSubKey((k) => k + 1); }}
            className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold">Try again</button>
        </div>
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
          <p className="text-xs text-slate-500 mb-6">This link may have been withdrawn or mistyped. Check it with whoever sent it.</p>
        </div>
      </div>
    );
  }

  const anyUnlocked = (normalizeOpsItems(report.items) || []).some((it) => {
    const m = /^\s*([A-Za-z])\s*[.)\-:]/.exec(it?.section || '');
    return m && isOpsSectionUnlocked(m[1]);
  });

  return (
    <div className="h-app w-full bg-slate-100 flex flex-col overflow-hidden">
      <header className="px-3 sm:px-5 py-2 bg-white border-b border-slate-200/90 flex items-center justify-between gap-2 shadow-2xs">
        <div className="min-w-0">
          <h1 className="text-xs sm:text-sm font-bold text-slate-900 truncate">{report.title || OPS_FINDINGS_LABEL}</h1>
          <p className="text-[10px] text-slate-500 flex items-center gap-1.5">
            {live
              ? <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold"><Radio className="w-3 h-3 animate-pulse" /> Live</span>
              : <span className="text-amber-600 font-semibold">Reconnecting…</span>}
            <span className="text-slate-300">|</span> Block B - EPC#1
            {saving && <><span className="text-slate-300">|</span><span className="text-sky-600 font-semibold">Saving…</span></>}
            {!saving && unsaved && <><span className="text-slate-300">|</span><span className="text-amber-600 font-semibold">Unsaved — retrying</span></>}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="hidden md:flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button onClick={() => setViewMode('laptop')} title="Laptop view"
              className={`p-1.5 rounded-md ${viewMode === 'laptop' ? 'bg-white text-brand-600 shadow-xs' : 'text-slate-500'}`}><Laptop className="w-3.5 h-3.5" /></button>
            <button onClick={() => setViewMode('phone')} title="Phone view"
              className={`p-1.5 rounded-md ${viewMode === 'phone' ? 'bg-white text-brand-600 shadow-xs' : 'text-slate-500'}`}><Smartphone className="w-3.5 h-3.5" /></button>
          </div>
          <button type="button" onClick={syncNow} disabled={syncing} title="Pull the latest version now"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">Sync</span>
          </button>
          {anyUnlocked && (
            <button type="button" onClick={flushNow} disabled={saving} title="Save now"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}<span className="hidden sm:inline">Save</span>
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 min-h-0 w-full px-1 pt-1.5 pb-1 sm:px-2 sm:pb-2 flex flex-col">
        {/* The master password lives on the Summary tab: typed here first, or
            asked for when Import / New section is pressed (v3.20.5). */}
        <OpsFindingsWorkspace
          report={{ ...report, id: `share_${shareId}` }}
          items={normalizeOpsItems(report.items)}
          onItemsChange={handleItemsChange}
          isMobileMode={isPhoneView}
          initialTab={tabFromHash()}
          isUnlocked={(L) => isOpsSectionUnlocked(L)}
          onRequestUnlock={(letter, section) => setAskPassword({ letter, section })}
          onLockSection={(L) => { flushNow(); lockOpsSection(L); showToast(`Section ${L} locked`, 'info'); }}
          canImport
          importLocked={!isOpsMasterUnlocked()}
          onRequestImportUnlock={(then) => setAskPassword({ master: true, then })}
          summaryExtra={<MasterBox onDone={(m, t) => showToast(m, t)} onLock={() => { flushNow(); lockAllOps(); showToast('All tabs locked', 'info'); }} />}
          onPhotoClick={openRowLightbox}
          onPhotoRemoved={dropPhotoBytes}
          onAttachFile={attachFromLink}
          onOpenAttachment={openAttachment}
          onExport={exportFile}
          onTabLink={copyTabLink}
          notify={showToast}
          fullScreen
        />
      </main>

      <PasswordModal
        isOpen={Boolean(askPassword)}
        title={askPassword?.master ? 'Master password' : 'Unlock to edit'}
        message={askPassword?.master
          ? 'Importing data and adding a section need the master password.'
          : `Enter the master password to edit every tab, or the password of section ${askPassword?.letter || ''} to edit "${askPassword?.section || ''}" only.`}
        onSubmit={(pw) => {
          const ask = askPassword;
          const ok = ask?.master ? unlockOpsMaster(pw) : unlockOpsSection(ask?.letter, pw);
          if (ok) {
            setAskPassword(null);
            showToast(isOpsMasterUnlocked() ? 'Editing unlocked for all tabs' : 'Editing unlocked for this tab', 'success');
            if (typeof ask?.then === 'function') setTimeout(ask.then, 0);
          }
          return ok;
        }}
        onClose={() => setAskPassword(null)}
      />

      <ImageModal
        isOpen={Boolean(lightbox)}
        photos={lightbox?.list || []}
        index={lightbox?.index ?? 0}
        onIndexChange={(i) => setLightbox((lb) => (lb ? { ...lb, index: i } : lb))}
        title={report.title}
        onClose={() => setLightbox(null)}
        onDelete={lightbox && isOpsSectionUnlocked(lightboxItemLetter()) ? deletePhoto : undefined}
        onOpenAttachment={(p) => openAttachment(p, itemsRef.current[p.itemIndex], p.itemIndex)}
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

/** Summary tab of the share link: type the master password here, or see that it is on. */
function MasterBox({ onDone, onLock }) {
  const [pw, setPw] = useState('');
  const [bad, setBad] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => onOpsLockChange(() => tick((n) => n + 1)), []);
  if (isOpsMasterUnlocked()) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 px-2 py-1.5 text-[12px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 rounded-lg">
          <Unlock className="w-3.5 h-3.5" /> Master unlocked — all tabs editable
        </span>
        <button type="button" onClick={onLock}
          className="inline-flex items-center gap-1 px-2 py-1.5 text-[12px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg">
          <Lock className="w-3.5 h-3.5" /> Lock
        </button>
      </span>
    );
  }
  const submit = (e) => {
    e.preventDefault();
    if (unlockOpsMaster(pw)) { setPw(''); setBad(false); onDone?.('Editing unlocked for all tabs', 'success'); }
    else setBad(true);
  };
  return (
    <form onSubmit={submit} className="inline-flex items-center gap-1">
      <KeyRound className="w-3.5 h-3.5 text-slate-400" />
      <input type="password" value={pw} onChange={(e) => { setPw(e.target.value); setBad(false); }}
        placeholder="Master password" autoComplete="off"
        className={`w-[150px] text-[12.5px] px-2 py-1.5 rounded-lg border outline-none text-slate-900 ${bad ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white focus:border-brand-500'}`} />
      <button type="submit" className="px-2.5 py-1.5 text-[12px] font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg">Unlock</button>
    </form>
  );
}
