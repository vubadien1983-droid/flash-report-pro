import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileSpreadsheet, FileText, RefreshCw, ArrowLeft, Lock, Unlock, Radio,
  Laptop, Smartphone, Copy, Check, Download, Save,
} from 'lucide-react';
import MiniPlanWorkspace from './MiniPlanWorkspace';
import ImageModal from './ImageModal';
import PasswordModal from './PasswordModal';
import Toast from './Toast';
import { exportExcelClient, exportPdfClient } from '../services/clientExport';
import { exportMiniPlanHtml } from '../services/miniPlanHtml';
import {
  subscribeSharedMiniPlan, pushSharedMiniPlanEdit, hydrateWithLocalPhotos,
  deletePhotoBytes, refOf,
} from '../services/miniPlanLive';
import { mergeMiniPlanItems } from '../services/miniPlanMerge';
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
  const [syncing, setSyncing] = useState(false);
  const [subKey, setSubKey] = useState(0);     // bump to re-open the listener
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

  // ── Two devices, one plan ──────────────────────────────────────
  //
  // `baseRef` is the last copy this device received from the cloud. It is what
  // makes a three-way merge possible: base + what I changed + what they
  // changed. Without it a save is a blind overwrite, and the other device's
  // work disappears (BUG-031).
  //
  // `itemsRef` mirrors the rows in a ref because the live listener is opened
  // once and would otherwise read a stale copy from the closure.
  const baseRef = useRef([]);
  const itemsRef = useRef([]);
  const retryRef = useRef({ timer: null, tries: 0 });
  const [unsaved, setUnsaved] = useState(false);

  /** A crash, a refresh or a dead phone must not take unsaved rows with it. */
  const backupKey = `fr_share_pending_${shareId}`;
  const writeBackup = (items) => {
    try {
      const light = (items || []).map((it) => ({
        ...it,
        photos: (it.photos || []).map((p) => (p && p.url && p.url.startsWith('data:')
          ? { ...p, url: '' } : p)),
      }));
      localStorage.setItem(backupKey, JSON.stringify({ items: light, base: baseRef.current, at: Date.now() }));
    } catch { /* storage full or blocked: the in-memory copy still stands */ }
  };
  const readBackup = () => {
    try {
      const raw = localStorage.getItem(backupKey);
      if (!raw) return null;
      const data = JSON.parse(raw);
      // A day-old draft is not a draft any more, it is a surprise.
      if (!data?.items?.length || Date.now() - (data.at || 0) > 24 * 3600 * 1000) return null;
      return data;
    } catch { return null; }
  };
  const clearBackup = () => { try { localStorage.removeItem(backupKey); } catch { /* nothing to do */ } };

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
    // ONLY the first load shows the loading screen.
    //
    // Pressing Sync re-opens the listener, and setting `loading` here used to
    // swap the whole page for "Connecting to the live plan…" — which unmounts
    // the workspace, so it came back on its default tab with the filter and
    // the scroll position gone. The user was on Monitoring, pressed Sync, and
    // landed on the dashboard. A refresh must never move the user (BUG-026).
    if (!report) setLoading(true);

    const unsub = subscribeSharedMiniPlan(
      shareId,
      (data) => {
        setLoading(false);
        setLive(true);
        setNotFound(false);
        document.title = data.title || MINI_PLAN_LABEL;
        const remote = data.items || [];

        if (dirtyRef.current && itemsRef.current.length) {
          // Somebody else saved while this device still has unsaved work.
          // Take BOTH: their rows and fields, my rows and fields. Ignoring the
          // snapshot (what this used to do) hid their work until the next
          // save; taking it plainly would have thrown mine away.
          const merged = mergeMiniPlanItems(baseRef.current, itemsRef.current, remote);
          baseRef.current = remote;
          itemsRef.current = merged.items;
          setReport({ ...data, items: merged.items });
          return;
        }

        // Nothing local in flight — but a draft may have survived a refresh.
        const backup = !baseRef.current.length ? readBackup() : null;
        if (backup) {
          const merged = mergeMiniPlanItems(backup.base || remote, backup.items, remote);
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
    // subKey re-opens the listener when the user presses Sync. `report` is
    // deliberately NOT a dependency - it is read once, to decide whether this
    // is the first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId, subKey]);

  // ── Editing through the link ───────────────────────────────────
  const pushEdit = useCallback(async (items) => {
    if (!report) return;
    const rows = items || itemsRef.current;
    writeBackup(rows);
    setSaving(true);
    try {
      const res = await pushSharedMiniPlanEdit(shareId, report.source_report_id, rows, {
        base: baseRef.current,
      });

      // Adopt what was actually written — it may contain the other device's
      // work — and put this device's photo bytes back on top of the pointers.
      const saved = hydrateWithLocalPhotos(shareId, res.items || rows);
      baseRef.current = res.items || rows;
      itemsRef.current = saved;
      setReport((r) => (r ? { ...r, items: saved } : r));

      dirtyRef.current = false;
      setUnsaved(false);
      retryRef.current.tries = 0;
      if (retryRef.current.timer) { clearTimeout(retryRef.current.timer); retryRef.current.timer = null; }
      clearBackup();

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
      // NOTHING IS THROWN AWAY. The rows stay in memory and in the local
      // backup, and the save is tried again on a widening delay.
      console.error('Live edit failed:', e);
      dirtyRef.current = true;
      setUnsaved(true);
      if (retryRef.current.tries === 0) showToast(`Not saved yet: ${e.message} — retrying`, 'error');
      scheduleRetry();
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, shareId]);

  // The listener is opened once, so it needs a stable way to reach the current
  // push function.
  const pushEditRef = useRef(pushEdit);
  useEffect(() => { pushEditRef.current = pushEdit; }, [pushEdit]);

  function scheduleRetry() {
    const tries = Math.min(retryRef.current.tries + 1, 6);
    retryRef.current.tries = tries;
    if (retryRef.current.timer) clearTimeout(retryRef.current.timer);
    retryRef.current.timer = setTimeout(() => {
      pushEditRef.current(itemsRef.current);
    }, Math.min(30_000, 4_000 * tries));
  }

  const handleItemsChange = (items) => {
    dirtyRef.current = true;
    setUnsaved(true);
    itemsRef.current = items;
    writeBackup(items);
    setReport((r) => (r ? { ...r, items } : r));

    // Debounced, for the same reason the editor debounces its cloud push
    // (BUG-004): typing an activity should not be one Firestore write per
    // keystroke.
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => pushEdit(items), 1800);
  };

  const flushNow = () => {
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    if (retryRef.current.timer) { clearTimeout(retryRef.current.timer); retryRef.current.timer = null; }
    retryRef.current.tries = 0;
    if (report?.items) pushEdit(itemsRef.current.length ? itemsRef.current : report.items);
  };

  /**
   * Sync on demand.
   *
   * The link is live, so this is not normally needed — but "is what I am
   * looking at current?" is a fair question to be able to answer on your own,
   * especially on a phone that has just come back from sleep with a listener
   * that quietly died. It sends anything unsent FIRST (losing an edit to a
   * refresh would be unforgivable), then re-opens the listener from scratch.
   */
  const syncNow = async () => {
    setSyncing(true);
    try {
      if (dirtyRef.current && (itemsRef.current.length || report?.items)) {
        if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
        await pushEdit(itemsRef.current.length ? itemsRef.current : report.items);
      }
      dirtyRef.current = false;
      setSubKey((k) => k + 1);
      showToast('Synced with the live plan', 'success');
    } catch (e) {
      showToast(`Sync failed: ${e.message}`, 'error');
    } finally {
      setTimeout(() => setSyncing(false), 600);
    }
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
    (report?.items || []).forEach((item, i) => {
      (item.photos || []).forEach((p, sIdx) => {
        if (p?.url) {
          out.push({
            url: p.url,
            filename: p.filename || item.activity || item.equipment || '',
            caption: item.activity || item.equipment || '',
            itemIndex: i,
            photoIndex: sIdx,
            slotIndex: p.slot_index ?? sIdx,
          });
        }
      });
    });
    return out;
  }, [report]);

  /** Remove the photo currently open, addressed by item + slot, never by url. */
  /**
   * A deleted photo must lose its BYTES as well, in both copies. Dropping the
   * pointer alone leaves the picture in the database and lets any device that
   * still holds the old plan put the pointer back (BUG-035).
   */
  const dropPhotoBytes = (item, photo) => {
    const ref = photo?.photo_ref || refOf(item, photo, photo?.slot_index ?? 0);
    deletePhotoBytes(shareId, report?.source_report_id, ref)
      .catch((e) => console.warn('Photo bytes not removed:', e?.message));
  };

  const deletePhoto = (photo) => {
    if (!report || !photo || !unlocked) return;
    const items = report.items || [];
    const item = items[photo.itemIndex];
    if (!item) return;
    const gone = (item.photos || []).find((p, idx) =>
      p && (p.slot_index ?? idx) === photo.slotIndex && idx === photo.photoIndex
    );
    const photos = (item.photos || []).filter((p, idx) =>
      !(p && (p.slot_index ?? idx) === photo.slotIndex && idx === photo.photoIndex)
    );
    const next = items.map((it, i) => (i === photo.itemIndex ? { ...it, photos } : it));
    handleItemsChange(next);
    if (gone) dropPhotoBytes(item, gone);
    setLightboxIndex(null);
    showToast('Photo deleted', 'success');
  };

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
  if (loading && !report) {
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
    /* h-screen, not min-h-screen: the page is exactly the viewport and only the
       table scrolls inside it, so the header stays put and nothing below the
       plan can push it off screen. */
    <div className="h-screen w-full bg-slate-100 flex flex-col overflow-hidden">
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
              {!saving && unsaved && (
                <>
                  <span className="text-slate-300">|</span>
                  <span className="text-amber-600 font-semibold" title="Kept on this device and retried automatically">
                    Unsaved — retrying
                  </span>
                </>
              )}
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

          <button
            type="button"
            onClick={syncNow}
            disabled={syncing}
            title="Pull the latest version of this plan now"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sync</span>
          </button>

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

      {/* FULL SCREEN on the share link: no page padding, no footer line, and
          the workspace stretches to whatever the header leaves. Somebody who
          opens this link came to read the plan, not the app's own captions -
          every pixel spent on chrome is a row they cannot see. */}
      <main className="flex-1 min-h-0 w-full px-1 pb-1 sm:px-2 sm:pb-2">
        <MiniPlanWorkspace
          items={normalizeMiniPlanItems(report.items)}
          onItemsChange={handleItemsChange}
          onPhotoClick={openLightbox}
          isMobileMode={isPhoneView}
          readOnly={!unlocked}
          onRequestUnlock={() => setAskPassword(true)}
          title={report.title}
          fullScreen
        />
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
        onDelete={unlocked ? deletePhoto : undefined}
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
