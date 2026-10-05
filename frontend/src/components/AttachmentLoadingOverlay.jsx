import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, Play, FileText } from 'lucide-react';
import { isVideoFile } from '../services/videoMedia';

/**
 * "Opening…" window for an attachment being downloaded — v3.33.1
 *
 * Mounted ONCE in main.jsx, so it covers the app, every share link and the
 * public file page with no wiring in any of them. It listens to the
 * `flashreport:attachment-loading` events getAttachmentBlob emits and appears
 * only when a download takes longer than SHOW_AFTER_MS — a file already on
 * this device opens with no flash at all.
 *
 * It replaced a small "Opening <file>…" toast that was the only sign of life
 * while a video downloaded, which read as a failure (user report, v3.33.0).
 */
const SHOW_AFTER_MS = 200;

export default function AttachmentLoadingOverlay() {
  const [loads, setLoads] = useState({});      // id → {filename, done, total, at}
  const [, tick] = useState(0);

  useEffect(() => {
    const on = (e) => {
      const d = e.detail || {};
      if (!d.id) return;
      setLoads((cur) => {
        const next = { ...cur };
        if (d.phase === 'end') delete next[d.id];
        else next[d.id] = { ...(cur[d.id] || { at: Date.now() }), ...d, filename: d.filename || cur[d.id]?.filename || '' };
        return next;
      });
    };
    window.addEventListener('flashreport:attachment-loading', on);
    return () => window.removeEventListener('flashreport:attachment-loading', on);
  }, []);

  // Re-render once the delay has passed so a slow load does appear.
  const ids = Object.keys(loads);
  useEffect(() => {
    if (!ids.length) return undefined;
    const t = setTimeout(() => tick((n) => n + 1), SHOW_AFTER_MS + 20);
    return () => clearTimeout(t);
  }, [ids.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = ids.map((k) => loads[k]).filter((l) => Date.now() - l.at >= SHOW_AFTER_MS);
  if (!visible.length) return null;
  const l = visible[visible.length - 1];
  const video = isVideoFile({ name: l.filename || '' });
  const pct = l.total ? Math.round((l.done / l.total) * 100) : 0;

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/55 pointer-events-none">
      <div className="pointer-events-auto w-[min(22rem,calc(100vw-2rem))] rounded-2xl bg-slate-900 text-white shadow-2xl px-5 py-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${video ? 'bg-rose-600' : 'bg-sky-600'}`}>
            {video ? <Play className="w-5 h-5 fill-white ml-0.5" /> : <FileText className="w-5 h-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-bold">{video ? 'Opening video…' : 'Opening file…'}</div>
            <div className="text-[11.5px] text-white/60 truncate">{l.filename || ' '}</div>
          </div>
          <RefreshCw className="w-4 h-4 animate-spin text-white/70 flex-shrink-0" />
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-white/15 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-200 ${l.total ? 'bg-sky-400' : 'bg-sky-400/60 w-1/3 animate-pulse'}`}
            style={l.total ? { width: `${Math.max(6, pct)}%` } : undefined}
          />
        </div>
        <div className="mt-1.5 text-[11px] text-white/50">
          {l.total ? `${pct}% · part ${l.done} of ${l.total}` : 'Connecting…'} — saved on this device after the first time
        </div>
      </div>
    </div>,
    document.body,
  );
}
