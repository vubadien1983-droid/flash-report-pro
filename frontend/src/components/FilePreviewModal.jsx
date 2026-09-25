import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, FileText, ExternalLink, ArrowLeft, RefreshCw } from 'lucide-react';
import { previewKind, guessMime, PREVIEW, PREVIEW_LABEL } from '../services/previewKind';

/**
 * Look at an attached file WITHOUT putting it on the disk.
 *
 * Opening a file used to hand it straight to the browser, which downloads
 * anything it cannot render — so reading one PDF left a copy in Downloads,
 * and a day of checking certificates left a folder full of them (BUG-045).
 *
 * Here the file is shown in place, from memory, and the copy on disk happens
 * only when the user presses Download.
 *
 * v3.21.0 — the ORIGINAL file is kept (no conversion) and the app now shows
 * the common office formats itself, in the browser, with nothing sent to any
 * server: Outlook .msg and .eml as an email (header, body, attachments),
 * Word .docx as pages, Excel .xlsx/.xlsm and .csv as a grid with sheet tabs.
 * `previewKind()` is the single decision of which viewer a file gets; this
 * component is used by the app, every share link (Flash Report, Mini Plan,
 * OPS Findings) and the public `#/file/...` page — one viewer everywhere.
 *
 * An attachment INSIDE an email opens here too, on a small stack: Back
 * returns to the email.
 */

const EmailView = lazy(() => import('./preview/EmailView'));
const DocxView = lazy(() => import('./preview/DocxView'));
const SheetView = lazy(() => import('./preview/SheetView'));

class PreviewBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  render() {
    if (this.state.error) return this.props.fallback(this.state.error);
    return this.props.children;
  }
}

function CannotShow({ filename, type, url, reason }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-center px-6">
      <div className="w-24 h-24 rounded-2xl bg-white/10 flex items-center justify-center">
        <FileText className="w-10 h-10 text-sky-300" />
      </div>
      <div>
        <p className="text-white text-base font-bold break-all max-w-[80vw]">{filename}</p>
        <p className="text-white/50 text-xs mt-1">{type || 'unknown type'}</p>
      </div>
      <p className="text-white/60 text-[13px] max-w-sm">
        {reason || 'This kind of file cannot be shown here. Press Download to open it in the program it belongs to — nothing is saved until you do.'}
      </p>
      <a
        href={url}
        download={filename}
        className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold inline-flex items-center gap-2"
      >
        <Download className="w-4 h-4" /> Download {filename}
      </a>
    </div>
  );
}

/**
 * The viewer itself, without the window around it. Used by the modal and by
 * the full-page `FileViewer` (#/file/<shareId>/<key>).
 *   url   an object URL of a blob typed with `type` (for native viewers)
 */
export function FilePreviewBody({ blob, url, filename, type, onOpenNested, dark = true }) {
  const kind = previewKind(filename, type);
  const spinner = (
    <div className={`w-full h-full flex items-center justify-center gap-2 text-sm ${dark ? 'text-white/80' : 'text-slate-500'}`}>
      <RefreshCw className="w-5 h-5 animate-spin" /> Opening…
    </div>
  );
  const fallback = (error) => (
    <div className={dark ? 'w-full h-full' : 'w-full h-full bg-slate-800 rounded-xl'}>
      <CannotShow filename={filename} type={type} url={url} reason={`${error?.message || 'This file could not be shown.'} Press Download to open it in its own program.`} />
    </div>
  );

  let view;
  if (kind === PREVIEW.IMAGE) {
    view = (
      <div className="w-full h-full flex items-center justify-center">
        <img src={url} alt={filename} className="max-h-full max-w-full object-contain" />
      </div>
    );
  } else if (kind === PREVIEW.PDF || kind === PREVIEW.TEXT || kind === PREVIEW.MEDIA) {
    view = <iframe src={url} title={filename} className="w-full h-full rounded-lg bg-white border-0" />;
  } else if (kind === PREVIEW.EML || kind === PREVIEW.MSG) {
    view = <EmailView blob={blob} kind={kind} onOpenAttachment={onOpenNested} />;
  } else if (kind === PREVIEW.DOCX) {
    view = <DocxView blob={blob} />;
  } else if (kind === PREVIEW.XLSX || kind === PREVIEW.CSV) {
    view = <SheetView blob={blob} kind={kind} filename={filename} />;
  } else {
    return (
      <div className={dark ? 'w-full h-full' : 'w-full h-full bg-slate-800 rounded-xl'}>
        <CannotShow filename={filename} type={type} url={url} />
      </div>
    );
  }

  return (
    <PreviewBoundary resetKey={blob} fallback={fallback}>
      <Suspense fallback={spinner}>{view}</Suspense>
    </PreviewBoundary>
  );
}

/** Object URL of the blob, re-typed from the file name when the stored type is useless. */
export function useTypedObjectUrl(blob, filename, mime) {
  const type = guessMime(filename, mime || blob?.type || '');
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) { setUrl(''); return undefined; }
    const typed = blob.type === type ? blob : new Blob([blob], { type });
    const made = URL.createObjectURL(typed);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [blob, type]);
  return { url, type };
}

export default function FilePreviewModal({ isOpen, blob, filename = 'file', mime = '', size = 0, onClose }) {
  // Files opened from INSIDE this one (an email's attachments) stack on top.
  const [nested, setNested] = useState([]);
  useEffect(() => { setNested([]); }, [blob, isOpen]);

  const top = nested.length ? nested[nested.length - 1] : { blob, filename, mime, size };
  const { url, type } = useTypedObjectUrl(isOpen ? top.blob : null, top.filename, top.mime);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (nested.length) setNested((s) => s.slice(0, -1));
      else onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, nested.length]);

  const openNested = useMemo(() => (att) => {
    if (!att?.content) return;
    const t = guessMime(att.filename, att.mime);
    setNested((s) => [...s, { blob: new Blob([att.content], { type: t }), filename: att.filename, mime: t, size: att.size }]);
  }, []);

  if (!isOpen || !top.blob || !url) return null;

  const kind = previewKind(top.filename, type);
  const nativeViewable = kind === PREVIEW.PDF || kind === PREVIEW.IMAGE || kind === PREVIEW.TEXT || kind === PREVIEW.MEDIA;
  const kb = top.size || top.blob.size || 0;

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-slate-950/92 flex flex-col" onClick={onClose}>
      <div
        className="flex items-center justify-between gap-3 px-3 sm:px-5 py-2.5 text-white bg-slate-900/80 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex items-center gap-2.5">
          {nested.length > 0 && (
            <button
              type="button"
              onClick={() => setNested((s) => s.slice(0, -1))}
              title="Back"
              className="p-2 -ml-1 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <span className="text-xs sm:text-sm font-semibold truncate max-w-[50vw]">{top.filename}</span>
          {PREVIEW_LABEL[kind] && (
            <span className="hidden sm:inline text-[10.5px] font-bold uppercase tracking-wide text-sky-300 bg-sky-400/15 rounded px-1.5 py-0.5 flex-shrink-0">
              {PREVIEW_LABEL[kind]}
            </span>
          )}
          {kb > 0 && <span className="text-[11px] text-white/50 flex-shrink-0">{Math.round(kb / 1024)} KB</span>}
        </div>
        <div className="flex items-center gap-1">
          {nativeViewable && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              title="Open in a new tab"
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <ExternalLink className="w-5 h-5" />
            </a>
          )}
          {/* The ONLY thing that writes to disk, and the user pressed it. */}
          <a
            href={url}
            download={top.filename}
            title="Download to this computer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-[12.5px] font-bold"
          >
            <Download className="w-4 h-4" /> <span className="hidden sm:inline">Download</span>
          </a>
          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 p-2 sm:p-4" onClick={(e) => e.stopPropagation()}>
        <FilePreviewBody
          key={`${nested.length}`}
          blob={top.blob}
          url={url}
          filename={top.filename}
          type={type}
          onOpenNested={openNested}
        />
      </div>
    </div>,
    document.body,
  );
}
