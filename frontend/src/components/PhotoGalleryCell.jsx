import React, { useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2, ZoomIn, RefreshCw, Plus, X, FolderOpen } from 'lucide-react';
import { compressForStorage, compressDataUrl, yieldToBrowser } from '../services/imageCompression';
import { nextPhotoSlot } from '../services/miniPlan';

/**
 * The Mini Plan's Photo column: MANY images inside ONE cell.
 *
 * A Flash Report has four fixed slots, one PhotoSlot component each. The Mini
 * Plan has a single Photo cell per activity holding as many pictures as the
 * work needs, so this component owns the whole collection rather than one
 * position in it.
 *
 * Three rules carried over from PhotoSlot, each of them a fix for a real
 * failure (ERROR_LOG BUG-013 and BUG-016):
 *
 *  1. COMPRESS AT INGEST, ONCE. Every path an image can arrive by - the file
 *     picker, the camera, a drag-drop, a Ctrl+V of a screenshot, a Zalo
 *     rich-text paste - goes through compressForStorage/compressDataUrl
 *     BEFORE the image reaches React state. Nothing downstream re-encodes.
 *  2. YIELD BETWEEN IMAGES. Picking twelve photos at once is normal here.
 *     Each one is awaited and followed by yieldToBrowser(), so the tab keeps
 *     painting and the progress count moves instead of the app appearing to
 *     freeze.
 *  3. A ZERO-OPACITY OVERLAY STILL RECEIVES CLICKS. The delete button on a
 *     thumbnail is a real button on phone (no :hover exists there) and the
 *     thumbnail itself opens the viewer from anywhere inside it.
 */
export default function PhotoGalleryCell({
  photos = [],
  onPhotosChange,      // (nextPhotosArray) => void
  onPhotoClick,        // (url) => void  - opens the lightbox
  isSelected = false,
  onSelectSlot,
  readOnly = false,
  isMobileView = false,
  compact = false,
}) {
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [busy, setBusy] = useState(null); // { done, total } | null
  const [isDragOver, setIsDragOver] = useState(false);

  const list = Array.isArray(photos) ? photos.filter(Boolean) : [];

  /**
   * THE single ingest point. Appends, never replaces - this cell is a
   * collection, so adding four photos to a cell that holds three leaves seven.
   */
  const addFiles = async (files) => {
    const images = Array.from(files || []).filter(
      (f) => f && (f.type?.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(f.name || ''))
    );
    if (images.length === 0) return;

    setBusy({ done: 0, total: images.length });
    const added = [];

    try {
      for (const [i, file] of images.entries()) {
        try {
          const url = await compressForStorage(file);
          added.push({
            id: `local_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            filename: file.name || `photo_${i + 1}.jpg`,
            url,
            // Slot indices are allocated once and never reused, so deleting a
            // photo cannot renumber the others and force a full re-upload.
            slot_index: nextPhotoSlot([...list, ...added]),
          });
        } catch (err) {
          console.error('Failed to process image:', err);
        }
        setBusy({ done: i + 1, total: images.length });
        await yieldToBrowser();
      }

      if (added.length) onPhotosChange([...list, ...added]);
    } finally {
      setBusy(null);
      if (galleryInputRef.current) galleryInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const addDataUrl = async (dataUrl, filename) => {
    setBusy({ done: 0, total: 1 });
    try {
      const url = await compressDataUrl(dataUrl);
      onPhotosChange([
        ...list,
        {
          id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          filename: filename || `paste_${Date.now()}.jpg`,
          url,
          slot_index: nextPhotoSlot(list),
        },
      ]);
    } catch (err) {
      console.error('Failed to process pasted image:', err);
    } finally {
      setBusy(null);
    }
  };

  /**
   * Clipboard extractor. Same four sources PhotoSlot handles - direct image
   * items, a copied file, a Zalo/HTML rich-text paste carrying a data: URL,
   * and a remote/blob <img> src - except that here a paste can carry SEVERAL
   * images and all of them are taken.
   */
  const handlePasteEvent = async (e) => {
    if (readOnly) return;
    const cd = e.clipboardData;
    if (!cd) return;

    // 1. Direct image items (screenshot, Zalo desktop copy)
    const blobs = [];
    for (const item of Array.from(cd.items || [])) {
      if (item.type?.indexOf('image') !== -1 && item.kind === 'file') {
        const blob = item.getAsFile();
        if (blob) blobs.push(blob);
      }
    }
    if (blobs.length) {
      e.preventDefault();
      e.stopPropagation();
      await addFiles(blobs);
      return;
    }

    // 2. Copied files from the file explorer
    if (cd.files && cd.files.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      await addFiles(cd.files);
      return;
    }

    // 3. Rich text carrying images
    const html = cd.getData('text/html');
    if (html) {
      try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const imgs = Array.from(doc.querySelectorAll('img')).filter((i) => i.src);
        if (imgs.length) {
          e.preventDefault();
          e.stopPropagation();
          for (const img of imgs) {
            if (img.src.startsWith('data:image')) {
              await addDataUrl(img.src, `paste_${Date.now()}.jpg`);
            } else if (img.src.startsWith('http') || img.src.startsWith('blob:')) {
              try {
                const res = await fetch(img.src);
                await addFiles([await res.blob()]);
              } catch (fetchErr) {
                console.warn('Could not fetch pasted image src:', fetchErr);
              }
            }
            await yieldToBrowser();
          }
        }
      } catch (htmlErr) {
        console.warn('Error parsing clipboard HTML:', htmlErr);
      }
    }
  };

  const removeAt = (arrayIndex) => {
    const next = list.filter((_, i) => i !== arrayIndex);
    onPhotosChange(next);
  };

  const thumbSize = compact || isMobileView ? 'w-16 h-16' : 'w-20 h-20';
  const canAdd = !readOnly;

  return (
    <div
      tabIndex={readOnly ? -1 : 0}
      onClick={() => { if (!readOnly && onSelectSlot) onSelectSlot(); }}
      onPaste={handlePasteEvent}
      onDragOver={(e) => { if (readOnly) return; e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        if (readOnly) return;
        e.preventDefault();
        setIsDragOver(false);
        addFiles(e.dataTransfer.files);
      }}
      className={`w-full min-h-[5.5rem] rounded-xl border p-1.5 outline-none transition-all ${
        isDragOver
          ? 'border-brand-500 bg-brand-50/80 ring-2 ring-brand-500/30'
          : isSelected && !readOnly
          ? 'border-brand-500 bg-brand-50/40 ring-2 ring-brand-500/30'
          : list.length
          ? 'border-slate-200 bg-slate-50/60'
          : 'border-dashed border-slate-300 bg-white hover:border-brand-400'
      }`}
    >
      {/* Hidden inputs. `multiple` is the point of this cell. */}
      {canAdd && (
        <>
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => addFiles(e.target.files)}
            className="hidden"
          />
          {isMobileView && (
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => addFiles(e.target.files)}
              className="hidden"
            />
          )}
        </>
      )}

      <div className="flex flex-wrap gap-1.5 items-start">
        {list.map((p, i) => (
          <div
            key={p.id || `${p.slot_index}_${i}`}
            className={`${thumbSize} relative group/thumb rounded-lg overflow-hidden border border-slate-200 bg-white shadow-2xs flex-shrink-0`}
          >
            {p.url ? (
              <img
                src={p.url}
                alt={p.filename || `Photo ${i + 1}`}
                onClick={(e) => { e.stopPropagation(); if (onPhotoClick) onPhotoClick(p.url); }}
                className="w-full h-full object-cover cursor-zoom-in"
              />
            ) : (
              /* A slot whose bytes have not been fetched yet. Shown as
                 "loading", never as empty - an unresolved photo reference is
                 not the same thing as a deleted photo (BUG-012). */
              <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              </div>
            )}

            <span className="absolute bottom-0 left-0 px-1 text-[9px] font-bold text-white bg-slate-900/60 rounded-tr">
              {i + 1}
            </span>

            {/* Phone has no hover, so the remove button is always drawn there. */}
            {!readOnly && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeAt(i); }}
                title="Remove photo"
                className={`absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center bg-rose-500 hover:bg-rose-600 text-white rounded-md shadow transition-opacity ${
                  isMobileView ? 'opacity-100' : 'opacity-0 group-hover/thumb:opacity-100'
                }`}
              >
                <X className="w-3 h-3" />
              </button>
            )}

            {!isMobileView && (
              <div
                onClick={(e) => { e.stopPropagation(); if (onPhotoClick) onPhotoClick(p.url); }}
                className="absolute inset-0 bg-slate-950/45 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center cursor-zoom-in"
              >
                <ZoomIn className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        ))}

        {/* Add tile */}
        {canAdd && (
          <div className={`${thumbSize} flex-shrink-0 flex flex-col gap-1`}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); galleryInputRef.current?.click(); }}
              title="Add photos (you can pick several at once)"
              className="flex-1 w-full flex flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-slate-300 hover:border-brand-500 hover:bg-brand-50 text-slate-500 hover:text-brand-700 transition-colors"
            >
              <ImagePlus className="w-4 h-4" />
              <span className="text-[11px] font-bold leading-none">Add</span>
            </button>
            {isMobileView && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); cameraInputRef.current?.click(); }}
                title="Take a photo"
                className="w-full py-1 flex items-center justify-center gap-1 rounded-lg bg-brand-600 text-white text-[11px] font-bold"
              >
                <Camera className="w-3 h-3" />
                Camera
              </button>
            )}
          </div>
        )}

        {list.length === 0 && readOnly && (
          <span className="text-[12px] text-slate-500 px-1 py-2">No photo</span>
        )}
      </div>

      {/* Per-image progress. Twelve photos take a while; silence is what made
          the old build feel frozen. */}
      {busy && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-brand-700">
          <RefreshCw className="w-3 h-3 animate-spin" />
          Processing {busy.done} / {busy.total}
        </div>
      )}

      {!readOnly && !busy && (
        <div className="mt-1 px-0.5 text-[11px] text-slate-500 leading-tight">
          {isSelected ? (
            <span className="font-bold text-brand-600">Ctrl + V to paste here</span>
          ) : (
            <span>Click cell, then Ctrl+V - or drop / pick several images</span>
          )}
        </div>
      )}
    </div>
  );
}
