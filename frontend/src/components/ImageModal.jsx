import React, { useEffect, useState, useRef, useCallback } from 'react';
import { X, Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Trash2, Paperclip } from 'lucide-react';

/**
 * Full-screen photo lightbox with gallery navigation.
 *
 * Two call styles are supported, because the editor and the shared viewer
 * grew separately:
 *   - gallery:  <ImageModal photos={[{url, filename}]} index={n} onIndexChange={fn} />
 *   - single:   <ImageModal imageUrl={url} />            (legacy, still works)
 *
 * What this replaces: a boxed dialog capped at `max-w-5xl` / `max-h-[75vh]`
 * with no way to move between photos — on a phone that showed a thumbnail-
 * sized image inside a card, which is not a review tool. This fills the
 * viewport and moves through every photo in the report with arrows, the
 * keyboard, or a swipe.
 */
export default function ImageModal({
  isOpen,
  imageUrl,          // legacy single-photo mode
  photos,            // gallery mode: [{ url, filename }]
  index = 0,
  onIndexChange,
  title,
  onClose,
  onDelete,          // (photo) => void — only passed when the plan is unlocked
  onOpenAttachment,  // (photo) => void — for entries that are files, not images
}) {
  const list = Array.isArray(photos) && photos.length
    ? photos
    : (imageUrl ? [{ url: imageUrl, filename: title }] : []);

  const [localIndex, setLocalIndex] = useState(index);
  const [zoomed, setZoomed] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const touchStart = useRef(null);

  // Follow the parent when it drives the index, but stay usable when it does not.
  useEffect(() => { setLocalIndex(index); }, [index, isOpen]);
  useEffect(() => { setZoomed(false); setAskDelete(false); }, [localIndex, isOpen]);

  const current = list[localIndex] || list[0] || null;
  const count = list.length;
  /** A slot can hold a document instead of a picture; it slides with the rest. */
  const isFile = Boolean(current && !current.url && (current.kind === 'file' || current.file_ref));

  const go = useCallback((delta) => {
    if (count < 2) return;
    const next = (localIndex + delta + count) % count;
    setLocalIndex(next);
    if (onIndexChange) onIndexChange(next);
  }, [localIndex, count, onIndexChange]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, go]);

  // The page behind must not scroll while the lightbox is up. Restoring the
  // previous value matters: the shared viewer relies on document scrolling.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  if (!isOpen || !current?.url) return null;

  const onTouchStart = (e) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e) => {
    if (!touchStart.current || zoomed) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    // Horizontal intent only — a vertical drag is a scroll, not a swipe.
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    touchStart.current = null;
  };

  const label = current.filename || title || 'Inspection Photo';

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950/95 backdrop-blur-sm flex flex-col animate-fade-in select-none"
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between gap-2 px-3 sm:px-5 py-2.5 text-white/90 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex items-baseline gap-2.5">
          <span className="text-xs sm:text-sm font-semibold truncate max-w-[45vw] sm:max-w-md">{label}</span>
          {count > 1 && (
            <span className="text-[11px] font-mono text-white/60 flex-shrink-0">
              {localIndex + 1} / {count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!isFile && (
            <button
              type="button"
              onClick={() => setZoomed((z) => !z)}
              title={zoomed ? 'Fit to screen' : 'Zoom in'}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              {zoomed ? <ZoomOut className="w-5 h-5" /> : <ZoomIn className="w-5 h-5" />}
            </button>
          )}
          {isFile ? (
            <button
              type="button"
              onClick={() => onOpenAttachment?.(current)}
              title="Open this file"
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <Download className="w-5 h-5" />
            </button>
          ) : (
            <a
              href={current.url}
              download={current.filename || 'photo.jpg'}
              target="_blank"
              rel="noreferrer"
              title="Download"
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <Download className="w-5 h-5" />
            </a>
          )}
          {/* Deleting the photo you are LOOKING AT is the only way to be sure
              you deleted the right one — which is the whole point when the
              wrong image has just been pasted into a cell. Two steps, because
              this one cannot be undone. */}
          {onDelete && (
            <button
              type="button"
              onClick={() => setAskDelete((v) => !v)}
              title="Delete this photo"
              className={`p-2 rounded-lg transition-colors ${askDelete ? 'bg-rose-600 text-white' : 'hover:bg-white/10'}`}
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
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

      {/* The confirm bar sits over the image, so the picture being deleted is
          in view while the question is answered. */}
      {onDelete && askDelete && (
        <div
          className="mx-auto mb-1 px-4 py-2.5 rounded-xl bg-rose-600/95 text-white shadow-lg flex items-center gap-3 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-[13px] font-semibold">Delete this photo from the plan?</span>
          <button
            type="button"
            onClick={() => { setAskDelete(false); onDelete(current); }}
            className="px-3 py-1 text-[13px] font-bold bg-white text-rose-700 rounded-lg hover:bg-rose-50"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setAskDelete(false)}
            className="px-3 py-1 text-[13px] font-semibold bg-rose-700/60 rounded-lg hover:bg-rose-700"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Image stage — fills everything the bars leave behind */}
      <div
        className={`flex-1 min-h-0 relative flex items-center justify-center px-2 sm:px-14 ${zoomed ? 'overflow-auto' : 'overflow-hidden'}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {isFile ? (
          <div className="flex flex-col items-center gap-4 text-center px-6">
            <div className="w-24 h-24 rounded-2xl bg-white/10 flex items-center justify-center">
              <Paperclip className="w-10 h-10 text-sky-300" />
            </div>
            <div>
              <p className="text-white text-base font-bold break-all max-w-[80vw]">{current.filename || 'file'}</p>
              {current.size ? (
                <p className="text-white/60 text-xs mt-1">{Math.round(current.size / 1024)} KB</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onOpenAttachment?.(current)}
              className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold"
            >
              Open file
            </button>
            <p className="text-white/40 text-[11px] max-w-xs">
              Opens in a new tab, or downloads when the browser cannot display it.
            </p>
          </div>
        ) : (
        <img
          key={String(current.url).slice(0, 64) + localIndex}
          src={current.url}
          alt={label}
          onClick={(e) => { e.stopPropagation(); setZoomed((z) => !z); }}
          className={
            zoomed
              ? 'max-w-none w-auto h-auto min-w-full cursor-zoom-out'
              : 'max-h-full max-w-full w-auto h-auto object-contain cursor-zoom-in'
          }
        />
        )}

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); go(-1); }}
              title="Previous (←)"
              className="absolute left-1 sm:left-3 top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full bg-slate-900/60 hover:bg-slate-900/90 text-white shadow-lg transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); go(1); }}
              title="Next (→)"
              className="absolute right-1 sm:right-3 top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full bg-slate-900/60 hover:bg-slate-900/90 text-white shadow-lg transition-colors"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      {count > 1 && (
        <div
          className="flex-shrink-0 flex items-center gap-1.5 overflow-x-auto px-3 py-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          {list.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setLocalIndex(i); if (onIndexChange) onIndexChange(i); }}
              className={`h-12 w-16 flex-shrink-0 rounded-md overflow-hidden border-2 transition-all ${
                i === localIndex ? 'border-sky-400 opacity-100' : 'border-transparent opacity-50 hover:opacity-90'
              }`}
            >
              {p.url ? (
                <img src={p.url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="w-full h-full flex items-center justify-center bg-slate-800 text-sky-300">
                  <Paperclip className="w-4 h-4" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
