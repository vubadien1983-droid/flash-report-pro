import React, { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Camera, ListPlus } from 'lucide-react';
import PhotoSlot from './PhotoSlot';

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
      // Don't intercept if user is typing in input or textarea
      const targetTag = e.target.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea') return;

      if (!selectedSlot) return;
      const { itemIndex, slotIndex } = selectedSlot;
      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      // 1. Direct image items
      const items = clipboardData.items;
      if (items && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
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

      // 3. HTML <img> tags (Zalo Desktop copy)
      const html = clipboardData.getData('text/html');
      if (html) {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const img = doc.querySelector('img');
          if (img && img.src && img.src.startsWith('data:image')) {
            e.preventDefault();
            handlePhotoChange(itemIndex, slotIndex, {
              id: `local_${Date.now()}_${slotIndex}`,
              filename: `zalo_paste_${Date.now()}.png`,
              url: img.src,
              slot_index: slotIndex
            });
          }
        } catch (err) {}
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [selectedSlot, items]);

  const addRow = () => {
    const newItem = {
      id: `item_${Date.now()}`,
      tag: '',
      description: '',
      note: '',
      photos: []
    };
    onItemsChange([...items, newItem]);
  };

  const removeRow = (index) => {
    if (items.length <= 1) {
      onItemsChange([{
        id: `item_${Date.now()}`,
        tag: '',
        description: '',
        note: '',
        photos: []
      }]);
      return;
    }
    const newItems = items.filter((_, i) => i !== index);
    onItemsChange(newItems);
  };

  const moveRow = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const newItems = [...items];
    const [moved] = newItems.splice(index, 1);
    newItems.splice(targetIndex, 0, moved);
    onItemsChange(newItems);
  };

  // Compute sequence numbers
  let seqCounter = 1;
  const computedNos = items.map((item) => {
    const hasContent = Boolean(item.tag?.trim() || item.description?.trim());
    return hasContent ? seqCounter++ : '';
  });

  return (
    <div className="w-full bg-white rounded-xl shadow-xs border border-slate-200/80 overflow-hidden mb-8">
      {/* Section Header */}
      <div className="px-4 md:px-5 py-3.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-brand-600" />
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Detail of Inspection ({items.length} {items.length === 1 ? 'item' : 'items'})
          </h3>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Item
        </button>
      </div>

      {/* 1. Mobile Phone Card View */}
      {isMobileMode ? (
        <div className="p-3 space-y-4">
          {items.map((item, idx) => {
            const rowNo = computedNos[idx];
            const photos = item.photos || [];

            return (
              <div
                key={item.id || idx}
                className="bg-slate-50/70 border border-slate-200 rounded-xl p-3.5 space-y-3 shadow-xs hover:border-brand-300 transition-all"
              >
                {/* Card Top: No + Tag + Move & Delete */}
                <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold">
                      {rowNo || idx + 1}
                    </span>
                    <input
                      type="text"
                      value={item.tag || ''}
                      onChange={(e) => handleItemChange(idx, 'tag', e.target.value)}
                      placeholder="Tag: e.g. 21-TK-101"
                      className="w-full text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1 focus:border-brand-500 outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveRow(idx, -1)}
                      className="p-1 hover:bg-slate-200 text-slate-500 disabled:opacity-20 rounded"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === items.length - 1}
                      onClick={() => moveRow(idx, 1)}
                      className="p-1 hover:bg-slate-200 text-slate-500 disabled:opacity-20 rounded"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Inspection Description
                  </label>
                  <textarea
                    rows={2}
                    value={item.description || ''}
                    onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                    placeholder="Inspection description..."
                    className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-lg p-2 focus:border-brand-500 outline-none resize-y"
                  />
                </div>

                {/* Note */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Note / Action
                  </label>
                  <input
                    type="text"
                    value={item.note || ''}
                    onChange={(e) => handleItemChange(idx, 'note', e.target.value)}
                    placeholder="Note / Action required..."
                    className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:border-brand-500 outline-none"
                  />
                </div>

                {/* 2x2 Photo Touch Grid */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1.5 flex items-center justify-between">
                    <span>Photos (Columns E, F, G, H)</span>
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
              </div>
            );
          })}
        </div>
      ) : (
        /* 2. Desktop Laptop Full-Width 8-Column Table View */
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 text-xs font-bold">
                <th className="w-12 px-3 py-2.5 text-center">No</th>
                <th className="w-32 lg:w-44 px-3 py-2.5">Tag</th>
                <th className="px-3 py-2.5 min-w-[200px]">Inspection Description</th>
                <th className="w-48 lg:w-64 px-3 py-2.5">Note</th>
                <th className="px-3 py-2.5 text-center" colSpan={4}>
                  Photos (Columns E, F, G, H - Select & Paste Ctrl+V, or Browse)
                </th>
                <th className="w-14 px-2 py-2.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {items.map((item, idx) => {
                const rowNo = computedNos[idx];
                const photos = item.photos || [];

                return (
                  <tr key={item.id || idx} className="hover:bg-slate-50/60 transition-colors group">
                    {/* No */}
                    <td className="px-3 py-3 text-center align-middle">
                      {rowNo ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200/80 text-slate-800 text-xs font-bold">
                          {rowNo}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs font-mono">-</span>
                      )}
                    </td>

                    {/* Tag */}
                    <td className="px-2 py-2 align-top">
                      <input
                        type="text"
                        value={item.tag || ''}
                        onChange={(e) => handleItemChange(idx, 'tag', e.target.value)}
                        placeholder="e.g. 21-TK-101"
                        className="w-full text-xs font-medium text-slate-800 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-brand-500 rounded-md px-2 py-1.5 transition-all outline-none"
                      />
                    </td>

                    {/* Inspection Description */}
                    <td className="px-2 py-2 align-top">
                      <textarea
                        rows={3}
                        value={item.description || ''}
                        onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                        placeholder="Enter description of inspection findings..."
                        className="w-full text-xs text-slate-800 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-brand-500 rounded-md px-2.5 py-1.5 transition-all outline-none resize-y min-h-[72px]"
                      />
                    </td>

                    {/* Note */}
                    <td className="px-2 py-2 align-top">
                      <textarea
                        rows={3}
                        value={item.note || ''}
                        onChange={(e) => handleItemChange(idx, 'note', e.target.value)}
                        placeholder="e.g. Needs immediate repair"
                        className="w-full text-xs text-slate-800 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-brand-500 rounded-md px-2.5 py-1.5 transition-all outline-none resize-y min-h-[72px]"
                      />
                    </td>

                    {/* 4 Photo Columns (Equal widths) */}
                    {[0, 1, 2, 3].map((slotIdx) => (
                      <td key={slotIdx} className="px-1.5 py-2 align-middle w-28 md:w-32 lg:w-36 xl:w-44">
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
                      <div className="flex items-center justify-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveRow(idx, -1)}
                            className="p-1 hover:bg-slate-200 text-slate-600 disabled:opacity-20 rounded transition-colors"
                            title="Move Up"
                          >
                            <ChevronUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === items.length - 1}
                            onClick={() => moveRow(idx, 1)}
                            className="p-1 hover:bg-slate-200 text-slate-600 disabled:opacity-20 rounded transition-colors"
                            title="Move Down"
                          >
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="p-1.5 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded-md transition-colors"
                          title="Delete Row"
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

      {/* Bottom Add Row Bar */}
      <div className="p-3 bg-slate-50 border-t border-slate-200/80 flex items-center justify-center">
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl shadow-xs transition-all"
        >
          <ListPlus className="w-4 h-4 text-brand-600" />
          Add Inspection Item
        </button>
      </div>
    </div>
  );
}
