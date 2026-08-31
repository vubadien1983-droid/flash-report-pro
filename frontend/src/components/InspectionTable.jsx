import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Camera, ListPlus, CornerDownRight } from 'lucide-react';
import PhotoSlot from './PhotoSlot';

// Auto-growing textarea component with zero scrollbars and dynamic full expansion
function AutoGrowingTextarea({
  value,
  onChange,
  placeholder,
  className = '',
  minHeight = 85,
  rows = 3
}) {
  const textareaRef = useRef(null);

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const newHeight = Math.max(el.scrollHeight, minHeight);
    el.style.height = `${newHeight}px`;
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      rows={rows}
      value={value || ''}
      onChange={(e) => {
        onChange(e);
        adjustHeight();
      }}
      placeholder={placeholder}
      className={`${className} overflow-hidden resize-none`}
    />
  );
}

export default function InspectionTable({
  items,
  onItemsChange,
  onPhotoClick,
  isMobileMode = false
}) {
  // Selected slot for keyboard paste: { itemIndex, slotIndex } | null
  const [selectedSlot, setSelectedSlot] = useState(null);

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    onItemsChange(newItems);
  };

  const handlePhotoChange = (itemIndex, slotIndex, photoData) => {
    const newItems = [...items];
    const item = { ...newItems[itemIndex] };
    const photos = [...(item.photos || [])];

    while (photos.length <= slotIndex) {
      photos.push(null);
    }
    photos[slotIndex] = photoData;
    item.photos = photos;
    newItems[itemIndex] = item;
    onItemsChange(newItems);

    // Auto select next slot
    if (slotIndex < 3) {
      setSelectedSlot({ itemIndex, slotIndex: slotIndex + 1 });
    } else if (itemIndex < items.length - 1) {
      setSelectedSlot({ itemIndex: itemIndex + 1, slotIndex: 0 });
    }
  };

  const handlePhotoDelete = (itemIndex, slotIndex) => {
    const newItems = [...items];
    const item = { ...newItems[itemIndex] };
    const photos = [...(item.photos || [])];
    if (photos[slotIndex]) {
      photos[slotIndex] = null;
    }
    item.photos = photos;
    newItems[itemIndex] = item;
    onItemsChange(newItems);
  };

  // Global window paste listener when a slot is selected
  useEffect(() => {
    const handleGlobalPaste = (e) => {
      const targetTag = e.target.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea') return;

      if (!selectedSlot) return;
      const { itemIndex, slotIndex } = selectedSlot;
      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      // 1. Direct image items
      const itemsList = clipboardData.items;
      if (itemsList && itemsList.length > 0) {
        for (let i = 0; i < itemsList.length; i++) {
          const item = itemsList[i];
          if (item.type.indexOf('image') !== -1) {
            const blob = item.getAsFile();
            if (blob) {
              e.preventDefault();
              const reader = new FileReader();
              reader.onloadend = () => {
                handlePhotoChange(itemIndex, slotIndex, {
                  id: `local_${Date.now()}_${slotIndex}`,
                  filename: `paste_${Date.now()}.png`,
                  url: reader.result,
                  slot_index: slotIndex
                });
              };
              reader.readAsDataURL(blob);
              return;
            }
          }
        }
      }

      // 2. Files
      const files = clipboardData.files;
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file.type.startsWith('image/') || file.name.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i)) {
            e.preventDefault();
            const reader = new FileReader();
            reader.onloadend = () => {
              handlePhotoChange(itemIndex, slotIndex, {
                id: `local_${Date.now()}_${slotIndex}`,
                filename: file.name,
                url: reader.result,
                slot_index: slotIndex
              });
            };
            reader.readAsDataURL(file);
            return;
          }
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [selectedSlot, items]);

  const addItem = () => {
    const newItem = {
      id: `item_${Date.now()}`,
      tag: '',
      description: '',
      note: '',
      photos: []
    };
    onItemsChange([...items, newItem]);
  };

  // Insert row directly below a specific index
  const insertRowBelow = (index) => {
    const currentItem = items[index];
    const inheritedTag = currentItem ? (currentItem.tag || '') : '';
    const newItem = {
      id: `item_${Date.now()}`,
      tag: inheritedTag,
      description: '',
      note: '',
      photos: []
    };
    const updated = [...items];
    updated.splice(index + 1, 0, newItem);
    onItemsChange(updated);
  };

  const deleteItem = (index) => {
    if (items.length <= 1) {
      onItemsChange([
        {
          id: `item_${Date.now()}`,
          tag: '',
          description: '',
          note: '',
          photos: []
        }
      ]);
      return;
    }
    const newItems = items.filter((_, i) => i !== index);
    onItemsChange(newItems);
  };

  const moveItem = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= items.length) return;
    const newItems = [...items];
    const [moved] = newItems.splice(index, 1);
    newItems.splice(newIndex, 0, moved);
    onItemsChange(newItems);
  };

  // Dynamic Row Numbering
  let currentSeq = 0;
  let lastSeenTag = '';
  const computedNos = items.map((item) => {
    const rawTag = (item.tag || '').trim();
    const hasAnyContent = Boolean(rawTag || (item.description || '').trim() || (item.note || '').trim() || (item.photos && item.photos.some(Boolean)));

    if (!hasAnyContent) return '';

    if (rawTag && rawTag !== lastSeenTag) {
      currentSeq += 1;
      lastSeenTag = rawTag;
      return currentSeq;
    }

    if (rawTag && rawTag === lastSeenTag) {
      return '';
    }

    if (!rawTag) {
      currentSeq += 1;
      lastSeenTag = '';
      return currentSeq;
    }

    return '';
  });

  const actualItemCount = items.filter(
    (item) => Boolean((item.tag || '').trim() || (item.description || '').trim() || (item.note || '').trim() || (item.photos && item.photos.some(Boolean)))
  ).length;

  return (
    <div className="bg-white rounded-xl shadow-xs border border-slate-200/80 overflow-hidden mb-6">
      {/* Header bar */}
      <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand-500"></span>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Detail of Inspection ({actualItemCount} {actualItemCount === 1 ? 'Item' : 'Items'})
          </h3>
        </div>

        <button
          type="button"
          onClick={addItem}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200/70 rounded-lg transition-colors shadow-2xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Item</span>
        </button>
      </div>

      {/* 1. Mobile Phone Card-Based Inspection View */}
      {isMobileMode ? (
        <div className="p-3 space-y-4 bg-slate-50/50">
          {items.map((item, idx) => {
            const rowNo = computedNos[idx];
            const photos = item.photos || [];

            return (
              <div
                key={item.id || idx}
                className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs space-y-3"
              >
                {/* Card Header */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    {rowNo ? (
                      <span className="w-6 h-6 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center">
                        {rowNo}
                      </span>
                    ) : (
                      <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 text-xs font-mono flex items-center justify-center">
                        -
                      </span>
                    )}
                    <span className="text-xs font-bold text-slate-800">
                      Row #{idx + 1}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveItem(idx, -1)}
                      disabled={idx === 0}
                      className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 rounded"
                      title="Move up"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveItem(idx, 1)}
                      disabled={idx === items.length - 1}
                      className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 rounded"
                      title="Move down"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteItem(idx)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded ml-1"
                      title="Delete row"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Tag */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    System / Equipment Tag
                  </label>
                  <AutoGrowingTextarea
                    rows={2}
                    minHeight={45}
                    value={item.tag || ''}
                    onChange={(e) => handleItemChange(idx, 'tag', e.target.value)}
                    placeholder="e.g. CPPT-E-1101-02"
                    className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-lg p-2 focus:border-brand-500 outline-none leading-snug whitespace-pre-wrap break-words"
                  />
                </div>

                {/* Description - Auto Growing Full Content */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Inspection Description
                  </label>
                  <AutoGrowingTextarea
                    rows={2}
                    minHeight={60}
                    value={item.description || ''}
                    onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                    placeholder="Inspection description..."
                    className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-lg p-2 focus:border-brand-500 outline-none leading-relaxed whitespace-pre-wrap break-words text-left"
                  />
                </div>

                {/* Note - Auto Growing Full Content */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Note / Action
                  </label>
                  <AutoGrowingTextarea
                    rows={2}
                    minHeight={50}
                    value={item.note || ''}
                    onChange={(e) => handleItemChange(idx, 'note', e.target.value)}
                    placeholder="Note / Action required..."
                    className="w-full text-xs text-slate-700 bg-white border border-slate-200 rounded-lg p-2 focus:border-brand-500 outline-none leading-relaxed whitespace-pre-wrap break-words text-left"
                  />
                </div>

                {/* 2x2 Photo Touch Grid */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                    <span>Illustration</span>
                    <span className="text-[10px] text-brand-600 font-medium">Tap to snap camera / pick</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[0, 1, 2, 3].map((slotIdx) => (
                      <PhotoSlot
                        key={slotIdx}
                        photo={photos[slotIdx]}
                        slotIndex={slotIdx}
                        isSelected={selectedSlot?.itemIndex === idx && selectedSlot?.slotIndex === slotIdx}
                        onSelectSlot={() => setSelectedSlot({ itemIndex: idx, slotIndex: slotIdx })}
                        onPhotoChange={(photoData) => handlePhotoChange(idx, slotIdx, photoData)}
                        onPhotoDelete={() => handlePhotoDelete(idx, slotIdx)}
                        onPhotoClick={onPhotoClick}
                        isMobileView={true}
                      />
                    ))}
                  </div>
                </div>

                {/* Quick Add Row Below Button */}
                <div className="pt-1 flex justify-center">
                  <button
                    type="button"
                    onClick={() => insertRowBelow(idx)}
                    className="w-full py-1.5 text-[11px] font-semibold text-brand-700 bg-white hover:bg-brand-50 border border-dashed border-brand-300 rounded-lg transition-colors flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Insert item below this Tag
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* 2. Desktop Laptop Full-Width 8-Column Table View with Auto-Expanding Rows */
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-800 text-xs font-bold">
                <th className="w-10 px-2 py-2.5 text-center font-bold">No</th>
                <th className="w-32 lg:w-36 px-2.5 py-2.5 text-center font-bold">Tag</th>
                <th className="w-52 lg:w-64 px-3 py-2.5 text-center font-bold">Inspection Description</th>
                <th className="w-40 lg:w-52 px-3 py-2.5 text-center font-bold">Note</th>
                <th className="px-3 py-2.5 text-center font-bold" colSpan={4}>
                  Illustration
                </th>
                <th className="w-16 px-2 py-2.5 text-center font-bold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {items.map((item, idx) => {
                const rowNo = computedNos[idx];
                const photos = item.photos || [];

                return (
                  <tr key={item.id || idx} className="hover:bg-slate-50/60 transition-colors group">
                    {/* No */}
                    <td className="px-2 py-3 text-center align-middle">
                      {rowNo ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200/80 text-slate-800 text-[11px] font-bold">
                          {rowNo}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs font-mono">-</span>
                      )}
                    </td>

                    {/* Tag (Auto-expanding without scrollbars) */}
                    <td className="px-1.5 py-2 align-top">
                      <AutoGrowingTextarea
                        rows={3}
                        minHeight={85}
                        value={item.tag || ''}
                        onChange={(e) => handleItemChange(idx, 'tag', e.target.value)}
                        placeholder="e.g. CPPT-E-1101-02"
                        className="w-full text-[11px] font-bold text-slate-800 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-brand-500 rounded-md px-2 py-1.5 transition-all outline-none text-center whitespace-pre-wrap break-words leading-snug"
                      />
                    </td>

                    {/* Inspection Description (Auto-expanding, Left-aligned, Zero scrollbars) */}
                    <td className="px-2 py-2 align-top">
                      <AutoGrowingTextarea
                        rows={3}
                        minHeight={85}
                        value={item.description || ''}
                        onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                        placeholder="Enter description of inspection findings..."
                        className="w-full text-[11px] text-slate-800 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-brand-500 rounded-md px-2.5 py-1.5 transition-all outline-none text-left leading-relaxed whitespace-pre-wrap break-words"
                      />
                    </td>

                    {/* Note (Auto-expanding, Left-aligned, Zero scrollbars) */}
                    <td className="px-2 py-2 align-top">
                      <AutoGrowingTextarea
                        rows={3}
                        minHeight={85}
                        value={item.note || ''}
                        onChange={(e) => handleItemChange(idx, 'note', e.target.value)}
                        placeholder="e.g. Needs immediate repair"
                        className="w-full text-[11px] text-slate-700 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-brand-500 rounded-md px-2.5 py-1.5 transition-all outline-none text-left leading-relaxed whitespace-pre-wrap break-words"
                      />
                    </td>

                    {/* 4 Photo Columns (Enlarged widths for prominent photo viewing) */}
                    {[0, 1, 2, 3].map((slotIdx) => (
                      <td key={slotIdx} className="px-1.5 py-2 align-middle w-36 md:w-44 lg:w-52 xl:w-60">
                        <PhotoSlot
                          photo={photos[slotIdx]}
                          slotIndex={slotIdx}
                          isSelected={selectedSlot?.itemIndex === idx && selectedSlot?.slotIndex === slotIdx}
                          onSelectSlot={() => setSelectedSlot({ itemIndex: idx, slotIndex: slotIdx })}
                          onPhotoChange={(photoData) => handlePhotoChange(idx, slotIdx, photoData)}
                          onPhotoDelete={() => handlePhotoDelete(idx, slotIdx)}
                          onPhotoClick={onPhotoClick}
                          isMobileView={false}
                        />
                      </td>
                    ))}

                    {/* Row Actions */}
                    <td className="px-2 py-2 text-center align-middle">
                      <div className="flex flex-col items-center justify-center gap-1">
                        {/* Insert row below button (+) */}
                        <button
                          type="button"
                          onClick={() => insertRowBelow(idx)}
                          className="w-7 h-7 flex items-center justify-center bg-brand-50 hover:bg-brand-600 text-brand-600 hover:text-white border border-brand-200 hover:border-brand-600 rounded-md transition-all shadow-2xs group/btn"
                          title="Insert row below (same Tag)"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>

                        {/* Move Up / Down */}
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveItem(idx, -1)}
                            disabled={idx === 0}
                            className="p-1 hover:bg-slate-200 disabled:opacity-20 text-slate-500 rounded transition-colors"
                            title="Move item up"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveItem(idx, 1)}
                            disabled={idx === items.length - 1}
                            className="p-1 hover:bg-slate-200 disabled:opacity-20 text-slate-500 rounded transition-colors"
                            title="Move item down"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Delete row */}
                        <button
                          type="button"
                          onClick={() => deleteItem(idx)}
                          className="p-1 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          title="Delete row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Table footer */}
      <div className="px-4 py-2.5 bg-slate-50/60 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500">
        <span>Showing {actualItemCount} active inspection items</span>
        <button
          type="button"
          onClick={addItem}
          className="text-xs font-semibold text-brand-600 hover:text-brand-800 flex items-center gap-1 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Inspection Item
        </button>
      </div>
    </div>
  );
}
