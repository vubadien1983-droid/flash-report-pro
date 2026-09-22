import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, FileText, ExternalLink } from 'lucide-react';

/**
 * Look at an attached file WITHOUT putting it on the disk.
 *
 * Opening a file used to hand it straight to the browser, which downloads
 * anything it cannot render — so reading one PDF left a copy in Downloads,
 * and a day of checking certificates left a folder full of them (BUG-045).
 *
 * Here the file is shown in place, from memory: PDFs, images, text and media
 * render inside the page, and the copy on disk happens only when the user
 * presses Download. Nothing is written otherwise, and the object URL is
 * revoked when the window closes.
 */

const VIEWABLE = /^(application\/pdf|image\/|text\/|audio\/|video\/)/i;

export default function FilePreviewModal({ isOpen, blob, filename = 'file', mime = '', size = 0, onClose }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (!isOpen || !blob) { setUrl(''); return undefined; }
    const made = URL.createObjectURL(blob);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [isOpen, blob]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !blob || !url) return null;

  const type = mime || blob.type || '';
  const isImage = /^image\//i.test(type);
  const canView = VIEWABLE.test(type);
  const kb = size || blob.size || 0;

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-slate-950/92 flex flex-col" onClick={onClose}>
      <div
        className="flex items-center justify-between gap-3 px-3 sm:px-5 py-2.5 text-white bg-slate-900/80 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex items-baseline gap-2.5">
          <span className="text-xs sm:text-sm font-semibold truncate max-w-[50vw]">{filename}</span>
          {kb > 0 && <span className="text-[11px] text-white/50 flex-shrink-0">{Math.round(kb / 1024)} KB</span>}
        </div>
        <div className="flex items-center gap-1">
          {canView && (
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
            download={filename}
            title="Download to this computer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-[12.5px] font-bold"
          >
            <Download className="w-4 h-4" /> Download
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
        {isImage ? (
          <div className="w-full h-full flex items-center justify-center">
            <img src={url} alt={filename} className="max-h-full max-w-full object-contain" />
          </div>
        ) : canView ? (
          <iframe src={url} title={filename} className="w-full h-full rounded-lg bg-white border-0" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-center px-6">
            <div className="w-24 h-24 rounded-2xl bg-white/10 flex items-center justify-center">
              <FileText className="w-10 h-10 text-sky-300" />
            </div>
            <div>
              <p className="text-white text-base font-bold break-all max-w-[80vw]">{filename}</p>
              <p className="text-white/50 text-xs mt-1">{type || 'unknown type'}</p>
            </div>
            <p className="text-white/60 text-[13px] max-w-sm">
              A browser cannot display this kind of file. Press Download to open it
              in the program it belongs to — nothing is saved until you do.
            </p>
            <a
              href={url}
              download={filename}
              className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> Download {filename}
            </a>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
