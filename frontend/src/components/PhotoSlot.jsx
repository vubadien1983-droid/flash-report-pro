import React, { useRef, useState } from 'react';
import { Camera, Image as ImageIcon, Plus, Trash2, ZoomIn, Upload, RefreshCw, X, Check, FolderOpen } from 'lucide-react';
import { compressForStorage, compressDataUrl } from '../services/imageCompression';

export default function PhotoSlot({
  photo,
  slotIndex,
  isSelected = false,
  onSelectSlot,
  onPhotoChange,
  onPhotoDelete,
  onPhotoClick,
  isMobileView = false
}) {
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const slotRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [slotUploading, setSlotUploading] = useState(false);
  const [showOptionsModal, setShowOptionsModal] = useState(false);

  const slotLabels = ['Photo 1', 'Photo 2', 'Photo 3', 'Photo 4'];

  /**
   * THE single ingest point for a photo in this component.
   *
   * The image is resized and re-encoded HERE, before it reaches React state or
   * IndexedDB. It used to be stored as the raw file — a phone JPEG or a pasted
   * PNG screenshot, several megabytes each — which left the sync and share
   * paths trying to recompress megabytes on the main thread and freezing the
   * app. Any new way of adding a photo must go through compressForStorage too.
   */
  const handleFile = async (file) => {
    if (!file) return;
    setSlotUploading(true);
    setShowOptionsModal(false);

    try {
      const dataUrl = await compressForStorage(file);
      onPhotoChange({
        id: `local_${Date.now()}_${slotIndex}`,
        filename: file.name || `photo_${slotIndex + 1}.jpg`,
        url: dataUrl,
        slot_index: slotIndex
      });
    } catch (err) {
      console.error('Failed to process image:', err);
      alert('Failed to read image file');
    } finally {
      setSlotUploading(false);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  /**
   * Comprehensive clipboard extractor supporting Zalo Desktop, web browsers,
   * print-screen, and file copies.
   */
  const handlePasteEvent = async (e) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    // 1. Check direct image items (Standard & Zalo Desktop PNG/JPEG copy)
    const items = clipboardData.items;
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          e.preventDefault();
          e.stopPropagation();
          const blob = item.getAsFile();
          if (blob) {
            handleFile(blob);
            return;
          }
        }
      }
    }

    // 2. Check files list (Copied files from file explorer or Zalo drag/drop)
    const files = clipboardData.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/') || file.name.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i)) {
          e.preventDefault();
          e.stopPropagation();
          handleFile(file);
          return;
        }
      }
    }

    // 3. Check HTML content (Zalo rich text / HTML <img> tag with data:image or local src)
    const html = clipboardData.getData('text/html');
    if (html) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const img = doc.querySelector('img');
        if (img && img.src) {
          e.preventDefault();
          e.stopPropagation();
          if (img.src.startsWith('data:image')) {
            // Compressed like every other ingest path — a rich-text paste from
            // Zalo carries a full-size PNG.
            setSlotUploading(true);
            try {
              const url = await compressDataUrl(img.src);
              onPhotoChange({
                id: `local_${Date.now()}_${slotIndex}`,
                filename: `zalo_paste_${Date.now()}.jpg`,
                url,
                slot_index: slotIndex
              });
            } finally {
              setSlotUploading(false);
            }
            return;
          } else if (img.src.startsWith('http') || img.src.startsWith('blob:')) {
            // Fetch remote / blob image
            try {
              const res = await fetch(img.src);
              const blob = await res.blob();
              handleFile(blob);
              return;
            } catch (fetchErr) {
              console.warn('Could not fetch HTML img src:', fetchErr);
            }
          }
        }
      } catch (htmlErr) {
        console.warn('Error parsing clipboard HTML:', htmlErr);
      }
    }
  };

  const handleContainerClick = (e) => {
    if (isMobileView) {
      // On phone, tap opens the Camera / Gallery sheet
      setShowOptionsModal(true);
    } else {
      // On Laptop, clicking the slot SELECTS it for paste (does NOT open file explorer)
      if (onSelectSlot) {
        onSelectSlot();
      }
      if (slotRef.current) {
        slotRef.current.focus();
      }
    }
  };

  const handleBrowseButtonClick = (e) => {
    e.stopPropagation(); // Do not trigger container click
    if (isMobileView) {
      setShowOptionsModal(true);
    } else {
      // ONLY clicking this button opens the system file picker
      galleryInputRef.current?.click();
    }
  };

  return (
    <>
      <div
        ref={slotRef}
        tabIndex={0}
        onClick={handleContainerClick}
        onPaste={handlePasteEvent}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
        }}
        className={`relative group w-full ${isMobileView ? 'h-32 sm:h-36' : 'h-32 lg:h-36 xl:h-40'} rounded-xl border transition-all duration-150 flex flex-col items-center justify-center overflow-hidden outline-none select-none cursor-pointer ${
          isDragOver
            ? 'border-brand-500 bg-brand-50/80 ring-2 ring-brand-500/30'
            : isSelected && !isMobileView
            ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/40 shadow-xs'
            : photo?.url
            ? 'border-slate-200 bg-slate-50'
            : 'border-dashed border-slate-300 hover:border-brand-400 bg-white hover:bg-slate-50'
        }`}
      >
        {/* Hidden Camera Input (Phone mode only) */}
        {isMobileView && (
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="hidden"
          />
        )}

        {/* Hidden Gallery / File Input */}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => handleFile(e.target.files?.[0])}
          className="hidden"
        />

        {slotUploading ? (
          <div className="flex flex-col items-center justify-center text-brand-600 gap-1">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-[10px] font-medium">Processing...</span>
          </div>
        ) : photo?.url ? (
          <>
            {/* Image Thumbnail */}
            <img
              src={photo.url}
              alt={photo.filename || `Photo ${slotIndex + 1}`}
              className="w-full h-full object-contain p-1 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onPhotoClick(photo.url);
              }}
            />

            {/* Hover / Action Overlay */}
            <div className="absolute inset-0 bg-slate-950/65 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 backdrop-blur-[1px]">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPhotoClick(photo.url);
                }}
                title="Zoom image"
                className="p-1.5 bg-white/95 hover:bg-white text-slate-800 rounded-md shadow hover:scale-105 transition-all"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleBrowseButtonClick}
                title={isMobileView ? "Replace photo" : "Replace file"}
                className="p-1.5 bg-white/95 hover:bg-white text-slate-800 rounded-md shadow hover:scale-105 transition-all"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPhotoDelete();
                }}
                title="Delete photo"
                className="p-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-md shadow hover:scale-105 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        ) : (
          /* Empty Slot */
          <div className="w-full h-full flex flex-col items-center justify-between p-1.5 py-2 text-slate-400">
            {isMobileView ? (
              /* Phone View */
              <div className="flex flex-col items-center justify-center flex-1">
                <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center mb-1 text-slate-500">
                  <Camera className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] font-semibold text-slate-600 leading-tight">
                  {slotLabels[slotIndex]}
                </span>
                <span className="text-[10px] text-slate-400">Camera / Files</span>
              </div>
            ) : (
              /* Laptop View: Click slot = Select to Paste; Click '+' = Browse Folder */
              <div className="w-full h-full flex flex-col items-center justify-between">
                <div className="text-center">
                  <span className="text-[10px] font-bold text-slate-600 block leading-tight">
                    {slotLabels[slotIndex]}
                  </span>
                  {isSelected ? (
                    <span className="text-[10px] font-bold text-brand-600 bg-brand-100/80 px-1.5 py-0.2 rounded mt-0.5 inline-block animate-pulse">
                      Ctrl + V to Paste
                    </span>
                  ) : (
                    <span className="text-[9px] text-slate-400 block mt-0.5">
                      Click to Select
                    </span>
                  )}
                </div>

                {/* Explicit Browse Button (ONLY this button opens file picker) */}
                <button
                  type="button"
                  onClick={handleBrowseButtonClick}
                  title="Open folder to choose file"
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-slate-700 bg-slate-100 hover:bg-brand-500 hover:text-white border border-slate-200 hover:border-brand-500 rounded-md transition-all shadow-2xs"
                >
                  <Plus className="w-3 h-3" />
                  <span>Browse</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Phone Mode Only: Photo Picker Bottom Sheet / Modal */}
      {isMobileView && showOptionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xs w-full p-5 border border-slate-200">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-brand-600" />
                <h4 className="text-sm font-bold text-slate-800">Add Photo {slotIndex + 1}</h4>
              </div>
              <button
                onClick={() => setShowOptionsModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setShowOptionsModal(false);
                  cameraInputRef.current?.click();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 bg-brand-50 hover:bg-brand-100 text-brand-800 rounded-xl font-semibold text-xs transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-brand-500 text-white flex items-center justify-center flex-shrink-0">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-slate-900 font-bold text-xs">Take Photo (Camera)</div>
                  <div className="text-[11px] text-slate-500 font-normal">Snap live field photo with device camera</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowOptionsModal(false);
                  galleryInputRef.current?.click();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-xl font-semibold text-xs transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-slate-700 text-white flex items-center justify-center flex-shrink-0">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-slate-900 font-bold text-xs">Choose from Gallery / Files</div>
                  <div className="text-[11px] text-slate-500 font-normal">Select existing photo from phone</div>
                </div>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowOptionsModal(false)}
              className="w-full mt-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
