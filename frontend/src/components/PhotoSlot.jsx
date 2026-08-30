import React, { useRef, useState } from 'react';
import { Camera, Image as ImageIcon, Plus, Trash2, ZoomIn, Upload, RefreshCw, X } from 'lucide-react';
import { uploadPhotoFile, uploadPhotoBase64 } from '../services/api';

export default function PhotoSlot({
  photo,
  slotIndex,
  onPhotoChange,
  onPhotoDelete,
  onPhotoClick,
  isMobileView = false
}) {
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [slotUploading, setSlotUploading] = useState(false);
  const [showOptionsModal, setShowOptionsModal] = useState(false);

  const slotLabels = ['Col E (1)', 'Col F (2)', 'Col G (3)', 'Col H (4)'];

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (JPG, PNG, WEBP)');
      return;
    }
    setSlotUploading(true);
    setShowOptionsModal(false);

    try {
      try {
        const res = await uploadPhotoFile(file);
        onPhotoChange({
          id: res.id,
          filename: res.filename,
          url: res.url,
          slot_index: slotIndex
        });
        return;
      } catch (backendErr) {
        console.warn('Backend unavailable, saving locally as base64 URL');
        const reader = new FileReader();
        reader.onloadend = () => {
          onPhotoChange({
            id: `local_${Date.now()}_${slotIndex}`,
            filename: file.name || `photo_${slotIndex + 1}.jpg`,
            url: reader.result,
            slot_index: slotIndex
          });
        };
        reader.readAsDataURL(file);
      }
    } catch (err) {
      console.error('Failed to process image:', err);
      alert('Failed to load image. Please try again.');
    } finally {
      setSlotUploading(false);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  const handlePasteEvent = (e) => {
    e.stopPropagation();
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          handleFile(blob);
          return;
        }
      }
    }
  };

  const handleSlotClick = () => {
    if (isMobileView) {
      // Phone Mode: show option to pick Camera or Gallery
      setShowOptionsModal(true);
    } else {
      // Laptop Mode: directly open file explorer
      galleryInputRef.current?.click();
    }
  };

  const handleReplaceClick = (e) => {
    e.stopPropagation();
    if (isMobileView) {
      setShowOptionsModal(true);
    } else {
      galleryInputRef.current?.click();
    }
  };

  return (
    <>
      <div
        tabIndex={0}
        onPaste={handlePasteEvent}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
        }}
        className={`relative group w-full ${isMobileView ? 'h-24' : 'h-24 lg:h-28'} rounded-lg border transition-all duration-150 flex flex-col items-center justify-center overflow-hidden outline-none select-none ${
          isDragOver
            ? 'border-brand-500 bg-brand-50/80 ring-2 ring-brand-500/20'
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
              onClick={() => onPhotoClick(photo.url)}
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
                onClick={handleReplaceClick}
                title={isMobileView ? "Replace photo (Camera or Gallery)" : "Replace photo (Browse files)"}
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
          <div
            onClick={handleSlotClick}
            className="w-full h-full flex flex-col items-center justify-center p-1.5 cursor-pointer text-slate-400 hover:text-brand-600 transition-colors"
          >
            {isMobileView ? (
              /* Phone View: Camera Icon + Camera/Files */
              <>
                <div className="w-7 h-7 rounded-full bg-slate-100 group-hover:bg-brand-50 flex items-center justify-center mb-1 text-slate-500 group-hover:text-brand-600">
                  <Camera className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] font-semibold text-slate-600 group-hover:text-brand-600 leading-tight">
                  {slotLabels[slotIndex]}
                </span>
                <span className="text-[10px] text-slate-400">Camera / Files</span>
              </>
            ) : (
              /* Laptop View: Plus/Image Icon + Paste/Drop/Browse */
              <>
                <div className="w-7 h-7 rounded-full bg-slate-100 group-hover:bg-brand-50 flex items-center justify-center mb-1 text-slate-500 group-hover:text-brand-600">
                  <Plus className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-semibold text-slate-600 group-hover:text-brand-600 leading-tight">
                  {slotLabels[slotIndex]}
                </span>
                <span className="text-[10px] text-slate-400">Browse / Ctrl+V</span>
              </>
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
