import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Lock, Unlock, CalendarClock,
  CornerDownRight, Layers,
} from 'lucide-react';
import PhotoGalleryCell from './PhotoGalleryCell';
import { compressForStorage, yieldToBrowser } from '../services/imageCompression';
import {
  STATUS_OPTIONS, STATUS_STYLE, ROW_STATE_LEGEND, ROW_STATE_STYLE,
  rowState, rowStyle, todayKey, groupMiniPlanItems, miniPlanStats,
  makeMiniPlanRow, makeGroupId, nextPhotoSlot, normalizeStatus,
} from '../services/miniPlan';

/** Auto-growing textarea — no scrollbars, grows to fit its content. */
function AutoGrowingTextarea({ value, onChange, placeholder, className = '', minHeight = 40, rows = 2, disabled = false }) {
  const ref = useRef(null);

  const adjust = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
  };

  useEffect(() => { adjust(); }, [value]);

  return (
    <textarea
      ref={ref}
      rows={rows}
      value={value || ''}
      disabled={disabled}
      onChange={(e) => { onChange(e); adjust(); }}
      placeholder={placeholder}
      className={`${className} overflow-hidden resize-none disabled:cursor-default`}
    />
  );
}

/** Small coloured chip used by the legend and the summary strip. */
function Chip({ state, count }) {
  const s = ROW_STATE_STYLE[state];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold ${s.tw} ${s.twText} border border-black/5`}>
      <span className="w-2 h-2 rounded-sm" style={{ background: s.css }} />
      {s.label}
      {typeof count === 'number' && <strong className="tabular-nums">{count}</strong>}
    </span>
  );
}

/**
 * CPP Mechanical Mini Plan — the editor.
 *
 * Layout differs from the Flash Report on purpose:
 *   - Item (A) and Equipment (B) are MERGED down the activities that belong to
 *     one piece of equipment, the way the source spreadsheet has them. A row
 *     added to a group inherits both automatically, which is the whole point
 *     of grouping: the user types the activity, nothing else.
 *   - Schedule (C) is a real date input, so the colour rule has something
 *     unambiguous to compare against.
 *   - Status (E) is a closed dropdown, coloured per value.
 *   - Photo (G) is ONE cell holding any number of images.
 *
 * The row colour is NOT computed here — it comes from services/miniPlan.js, the
 * same module the exports and the live link read. See the note in that file.
 */
export default function MiniPlanTable({
  items,
  onItemsChange,
  onPhotoClick,
  isMobileMode = false,
  readOnly = false,
  onRequestUnlock,
}) {
  const [selectedCell, setSelectedCell] = useState(null); // itemIndex | null
  // Recomputed once per render; "today" only changes at midnight and a stale
  // value would silently mis-colour every row, so it is read fresh.
  const today = todayKey();

  const groups = groupMiniPlanItems(items);
  const stats = miniPlanStats(items, today);

  // ── Mutations ──────────────────────────────────────────────────
  const patchItem = (index, patch) => {
    if (readOnly) return;
    const next = [...items];
    next[index] = { ...next[index], ...patch };
    onItemsChange(next);
  };

  /** Editing the merged Equipment cell rewrites the name on every row of the
   *  group, so a single row still carries its equipment wherever it is read. */
  const setGroupEquipment = (groupKey, equipment) => {
    if (readOnly) return;
    onItemsChange(items.map((it) => (it.group_id === groupKey ? { ...it, equipment } : it)));
  };

  /** Add an activity row to an equipment. Item (A) and Equipment (B) are
   *  filled in for it — the user only types the activity. */
  const addRowToGroup = (group, afterIndex = null) => {
    if (readOnly) return;
    const at = afterIndex === null ? group.start + group.count - 1 : afterIndex;
    const row = makeMiniPlanRow(group.key, group.equipment);
    const next = [...items];
    next.splice(at + 1, 0, row);
    onItemsChange(next);
  };

  /** A new Equipment: a new group with one blank activity row. */
  const addEquipment = (afterGroup = null) => {
    if (readOnly) return;
    const gid = makeGroupId();
    const row = makeMiniPlanRow(gid, '');
    const next = [...items];
    const at = afterGroup ? afterGroup.start + afterGroup.count : items.length;
    next.splice(at, 0, row);
    onItemsChange(next);
  };

  const deleteRow = (index) => {
    if (readOnly) return;
    if (items.length <= 1) {
      onItemsChange([makeMiniPlanRow(makeGroupId(), '')]);
      return;
    }
    onItemsChange(items.filter((_, i) => i !== index));
  };

  const deleteGroup = (group) => {
    if (readOnly) return;
    const next = items.filter((it) => it.group_id !== group.key);
    onItemsChange(next.length ? next : [makeMiniPlanRow(makeGroupId(), '')]);
  };

  /** Move a row inside its own group only — moving it across a boundary would
   *  silently reassign it to another equipment. */
  const moveRow = (group, index, direction) => {
    if (readOnly) return;
    const target = index + direction;
    if (target < group.start || target >= group.start + group.count) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onItemsChange(next);
  };

  const setPhotos = (index, photos) => patchItem(index, { photos });

  // ── Global paste into the selected Photo cell ──────────────────
  useEffect(() => {
    if (readOnly) return undefined;

    const onPaste = async (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (selectedCell === null || selectedCell === undefined) return;

      const cd = e.clipboardData;
      if (!cd) return;

      const blobs = [];
      for (const it of Array.from(cd.items || [])) {
        if (it.kind === 'file' && it.type?.startsWith('image/')) {
          const b = it.getAsFile();
          if (b) blobs.push(b);
        }
      }
      const files = blobs.length
        ? blobs
        : Array.from(cd.files || []).filter((f) => f.type?.startsWith('image/'));
      if (files.length === 0) return;

      e.preventDefault();

      const item = items[selectedCell];
      if (!item) return;
      const existing = Array.isArray(item.photos) ? item.photos.filter(Boolean) : [];
      const added = [];

      for (const [i, f] of files.entries()) {
        try {
          // Compressed BEFORE it reaches state — every ingest path must, or
          // BUG-013 comes straight back.
          const url = await compressForStorage(f);
          added.push({
            id: `local_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            filename: f.name || `paste_${Date.now()}.jpg`,
            url,
            slot_index: nextPhotoSlot([...existing, ...added]),
          });
        } catch (err) {
          console.error('Paste compression failed:', err);
        }
        await yieldToBrowser();
      }

      if (added.length) setPhotos(selectedCell, [...existing, ...added]);
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [selectedCell, items, readOnly]);

  // ── Shared bits ────────────────────────────────────────────────
  const StatusSelect = ({ index, value }) => {
    const st = normalizeStatus(value);
    const s = STATUS_STYLE[st];
    return (
      <select
        value={st}
        disabled={readOnly}
        onChange={(e) => patchItem(index, { status: e.target.value })}
        className={`w-full text-[13px] font-bold rounded-md border px-1.5 py-1.5 outline-none transition-colors cursor-pointer disabled:cursor-default disabled:opacity-100 ${s.tw}`}
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o || 'blank'} value={o} className="bg-white text-black font-semibold">
            {o || '— not started —'}
          </option>
        ))}
      </select>
    );
  };

  const header = (
    <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-2 h-2 rounded-full bg-brand-500" />
        <h3 className="text-[13px] font-bold uppercase tracking-wider text-black">
          Mini Plan ({stats.equipment} Equipment · {stats.total} activities)
        </h3>
        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
          {stats.percent}% done
        </span>
        {readOnly ? (
          <button
            type="button"
            onClick={onRequestUnlock}
            className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-md hover:bg-amber-100 transition-colors"
            title="Enter the project password to edit"
          >
            <Lock className="w-3 h-3" /> Read only — unlock to edit
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-md">
            <Unlock className="w-3 h-3" /> Editing unlocked
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {ROW_STATE_LEGEND.map((s) => (
          <Chip
            key={s}
            state={s}
            count={s === 'done' ? stats.done : s === 'today' ? stats.today : s === 'overdue' ? stats.overdue : stats.missed}
          />
        ))}
      </div>
    </div>
  );

  const footer = (
    <div className="px-4 py-2.5 bg-slate-50/60 border-t border-slate-200/80 flex items-center justify-between text-[12px] text-slate-600">
      <span className="flex items-center gap-1.5">
        <CalendarClock className="w-3.5 h-3.5 text-slate-400" />
        Colours follow Schedule vs today ({today})
      </span>
      {!readOnly && (
        <button
          type="button"
          onClick={() => addEquipment()}
          className="text-xs font-semibold text-brand-600 hover:text-brand-800 flex items-center gap-1 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Equipment
        </button>
      )}
    </div>
  );

  // ── Phone: cards grouped by equipment ──────────────────────────
  if (isMobileMode) {
    return (
      <div className="bg-white rounded-xl shadow-xs border border-slate-200/80 overflow-hidden mb-6">
        {header}

        <div className="p-3 space-y-4 bg-slate-50/50">
          {groups.map((group) => (
            <div key={group.key} className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              {/* Equipment header = merged columns A + B */}
              <div className="px-3 py-2.5 bg-slate-800 text-white flex items-start gap-2">
                <span className="w-6 h-6 rounded-full bg-white/15 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {group.no || '-'}
                </span>
                <AutoGrowingTextarea
                  rows={1}
                  minHeight={28}
                  disabled={readOnly}
                  value={group.equipment}
                  onChange={(e) => setGroupEquipment(group.key, e.target.value)}
                  placeholder="Equipment name..."
                  className="flex-1 text-[14px] font-bold text-white bg-transparent border border-transparent focus:border-white/40 rounded-md px-1.5 py-1 outline-none leading-snug whitespace-pre-wrap break-words placeholder:text-white/50"
                />
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => deleteGroup(group)}
                    title="Delete this equipment and all its activities"
                    className="p-1 text-white/60 hover:text-rose-300 flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="p-2.5 space-y-2.5">
                {group.rows.map(({ item, index }) => {
                  const s = rowStyle(item, today);
                  return (
                    <div
                      key={item.id || index}
                      className={`rounded-lg border border-slate-200 p-2.5 space-y-2 ${s.tw}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-bold text-slate-600 uppercase tracking-wide">
                          Activity {index - group.start + 1}
                        </span>
                        <div className="flex items-center gap-1">
                          {!readOnly && (
                            <>
                              <button type="button" onClick={() => moveRow(group, index, -1)} disabled={index === group.start}
                                className="p-1 text-slate-400 disabled:opacity-25"><ChevronUp className="w-4 h-4" /></button>
                              <button type="button" onClick={() => moveRow(group, index, 1)} disabled={index === group.start + group.count - 1}
                                className="p-1 text-slate-400 disabled:opacity-25"><ChevronDown className="w-4 h-4" /></button>
                              <button type="button" onClick={() => deleteRow(index)}
                                className="p-1 text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                            </>
                          )}
                        </div>
                      </div>

                      <AutoGrowingTextarea
                        rows={2}
                        minHeight={52}
                        disabled={readOnly}
                        value={item.activity}
                        onChange={(e) => patchItem(index, { activity: e.target.value })}
                        placeholder="Activity to be carried out..."
                        className="w-full text-[14px] text-black bg-white/85 border border-slate-200 rounded-lg p-2 focus:border-brand-500 outline-none leading-relaxed whitespace-pre-wrap break-words disabled:text-black"
                      />

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[12px] font-semibold text-black mb-1">Schedule</label>
                          <input
                            type="date"
                            disabled={readOnly}
                            value={item.schedule || ''}
                            onChange={(e) => patchItem(index, { schedule: e.target.value })}
                            className="w-full text-[14px] text-black bg-white border border-slate-200 rounded-lg px-2 py-2 focus:border-brand-500 outline-none disabled:text-black"
                          />
                        </div>
                        <div>
                          <label className="block text-[12px] font-semibold text-black mb-1">Status</label>
                          <StatusSelect index={index} value={item.status} />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[12px] font-semibold text-black mb-1">Note</label>
                        <AutoGrowingTextarea
                          rows={1}
                          minHeight={36}
                          disabled={readOnly}
                          value={item.note}
                          onChange={(e) => patchItem(index, { note: e.target.value })}
                          placeholder="Note..."
                          className="w-full text-[14px] text-black bg-white/85 border border-slate-200 rounded-lg p-2 focus:border-brand-500 outline-none whitespace-pre-wrap break-words disabled:text-black"
                        />
                      </div>

                      <div>
                        <label className="block text-[12px] font-semibold text-black mb-1 flex items-center justify-between">
                          <span>Photo ({(item.photos || []).filter(Boolean).length})</span>
                          <span className="text-[9px] text-brand-600 font-medium">many photos per activity</span>
                        </label>
                        <PhotoGalleryCell
                          photos={item.photos}
                          onPhotosChange={(ph) => setPhotos(index, ph)}
                          onPhotoClick={onPhotoClick}
                          isSelected={selectedCell === index}
                          onSelectSlot={() => setSelectedCell(index)}
                          readOnly={readOnly}
                          isMobileView
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Visible when locked too — see the note on the laptop buttons. */}
                <button
                  type="button"
                  onClick={() => (readOnly ? onRequestUnlock?.() : addRowToGroup(group))}
                  className={`w-full py-2 text-[13px] font-bold border border-dashed rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                    readOnly
                      ? 'text-slate-400 bg-white border-slate-300 hover:text-amber-700 hover:border-amber-400'
                      : 'text-brand-700 bg-white hover:bg-brand-50 border-brand-300'
                  }`}
                >
                  {readOnly ? <Lock className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  Add activity to this Equipment
                </button>
              </div>
            </div>
          ))}

          {!readOnly && (
            <button
              type="button"
              onClick={() => addEquipment()}
              className="w-full py-3 text-[14px] font-bold text-white bg-slate-800 hover:bg-slate-700 rounded-xl flex items-center justify-center gap-1.5"
            >
              <Layers className="w-4 h-4" />
              Add Equipment
            </button>
          )}
        </div>

        {footer}
      </div>
    );
  }

  // ── Laptop: the 7-column plan table with merged A + B ──────────
  const cellBase = 'px-2 py-2 align-top border-b border-slate-200';

  return (
    <div className="bg-white rounded-xl shadow-xs border border-slate-200/80 overflow-hidden mb-6">
      {header}

      {/* The table carries a MIN WIDTH and the wrapper scrolls.
          Without it `w-full` squeezes seven columns into whatever the pane is,
          and at a laptop width of ~900px the Equipment column wraps one word
          per line and the Note column becomes a vertical stack of letters.
          A plan is read across the row, so the row must keep its shape and the
          container must scroll instead. */}
      <div className="overflow-x-auto w-full">
        <table className="w-full min-w-[1400px] text-left border-collapse table-fixed">
          <thead>
            <tr className="bg-slate-100/90 border-b border-slate-300 text-black text-[13px] font-bold">
              <th className="w-12 px-2 py-2.5 text-center">Item</th>
              <th className="w-64 px-2.5 py-2.5 text-center">Equipment</th>
              <th className="w-32 px-2 py-2.5 text-center">Schedule</th>
              <th className="w-[22rem] px-3 py-2.5 text-center">Activities</th>
              <th className="w-32 px-2 py-2.5 text-center">Status</th>
              <th className="w-52 px-2 py-2.5 text-center">Note</th>
              <th className="w-[19rem] px-2 py-2.5 text-center">Photo</th>
              <th className="w-14 px-1 py-2.5 text-center">Action</th>
            </tr>
          </thead>

          {/* One <tbody> per equipment: that is what lets Item and Equipment
              span the group's rows the way the spreadsheet merges them. */}
          {groups.map((group) => (
            <tbody key={group.key} className="border-b-2 border-slate-300">
              {group.rows.map(({ item, index }, rowIdx) => {
                const s = rowStyle(item, today);
                const isFirst = rowIdx === 0;

                return (
                  <tr key={item.id || index} className={`${s.tw} hover:brightness-[0.985] transition-all`}>
                    {isFirst && (
                      <>
                        <td rowSpan={group.count} className="px-2 py-2 text-center align-middle border-b border-slate-200 bg-white/60">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 text-white text-[13px] font-bold">
                            {group.no || '-'}
                          </span>
                        </td>
                        <td rowSpan={group.count} className="px-2 py-2 align-top border-b border-slate-200 bg-white/60">
                          <AutoGrowingTextarea
                            rows={2}
                            minHeight={56}
                            disabled={readOnly}
                            value={group.equipment}
                            onChange={(e) => setGroupEquipment(group.key, e.target.value)}
                            placeholder="Equipment name..."
                            className="w-full text-[13px] font-bold text-black bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-brand-500 rounded-md px-2 py-1.5 outline-none leading-snug whitespace-pre-wrap break-words"
                          />
                          {/* These stay on screen when the plan is LOCKED, greyed
                              but present, and a click asks for the password.
                              Hiding them entirely was wrong: with nothing on
                              screen there is no way to tell that adding a row to
                              an Equipment is possible at all, so the feature
                              reads as missing rather than as protected. */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5 px-1">
                            <button
                              type="button"
                              onClick={() => (readOnly ? onRequestUnlock?.() : addRowToGroup(group))}
                              title={readOnly
                                ? 'Enter the project password to add an activity'
                                : 'Add an activity to this Equipment (Item and Equipment are filled in automatically)'}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-bold border rounded-md transition-colors ${
                                readOnly
                                  ? 'text-slate-400 bg-slate-50 border-slate-200 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300'
                                  : 'text-brand-700 bg-brand-50 hover:bg-brand-600 hover:text-white border-brand-200'
                              }`}
                            >
                              {readOnly ? <Lock className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                              Add row
                            </button>
                            <button
                              type="button"
                              onClick={() => (readOnly ? onRequestUnlock?.() : addEquipment(group))}
                              title={readOnly
                                ? 'Enter the project password to add an Equipment'
                                : 'Insert a new Equipment below'}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-bold border rounded-md transition-colors ${
                                readOnly
                                  ? 'text-slate-400 bg-slate-50 border-slate-200 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300'
                                  : 'text-slate-700 bg-slate-100 hover:bg-slate-700 hover:text-white border-slate-200'
                              }`}
                            >
                              <Layers className="w-3.5 h-3.5" /> Equipment
                            </button>
                            {!readOnly && (
                              <button
                                type="button"
                                onClick={() => deleteGroup(group)}
                                title="Delete this Equipment and all its activities"
                                className="p-1 text-slate-400 hover:text-rose-600 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </>
                    )}

                    {/* Schedule */}
                    <td className={`${cellBase} align-middle`}>
                      <input
                        type="date"
                        disabled={readOnly}
                        value={item.schedule || ''}
                        onChange={(e) => patchItem(index, { schedule: e.target.value })}
                        className="w-full text-[13px] text-black bg-white/85 border border-slate-200 rounded-md px-1.5 py-1.5 focus:border-brand-500 outline-none disabled:bg-transparent disabled:border-transparent disabled:text-black"
                      />
                    </td>

                    {/* Activities */}
                    <td className={cellBase}>
                      <AutoGrowingTextarea
                        rows={2}
                        minHeight={54}
                        disabled={readOnly}
                        value={item.activity}
                        onChange={(e) => patchItem(index, { activity: e.target.value })}
                        placeholder="Activity to be carried out..."
                        className="w-full text-[13px] text-black bg-transparent hover:bg-white/90 focus:bg-white border border-transparent hover:border-slate-200 focus:border-brand-500 rounded-md px-2 py-1.5 outline-none text-left leading-relaxed whitespace-pre-wrap break-words disabled:text-black"
                      />
                    </td>

                    {/* Status */}
                    <td className={`${cellBase} align-middle`}>
                      <StatusSelect index={index} value={item.status} />
                    </td>

                    {/* Note */}
                    <td className={cellBase}>
                      <AutoGrowingTextarea
                        rows={2}
                        minHeight={54}
                        disabled={readOnly}
                        value={item.note}
                        onChange={(e) => patchItem(index, { note: e.target.value })}
                        placeholder="Note..."
                        className="w-full text-[13px] text-black bg-transparent hover:bg-white/90 focus:bg-white border border-transparent hover:border-slate-200 focus:border-brand-500 rounded-md px-2 py-1.5 outline-none text-left leading-relaxed whitespace-pre-wrap break-words disabled:text-black"
                      />
                    </td>

                    {/* Photo — ONE cell, many images */}
                    <td className={cellBase}>
                      <PhotoGalleryCell
                        photos={item.photos}
                        onPhotosChange={(ph) => setPhotos(index, ph)}
                        onPhotoClick={onPhotoClick}
                        isSelected={selectedCell === index}
                        onSelectSlot={() => setSelectedCell(index)}
                        readOnly={readOnly}
                        isMobileView={false}
                      />
                    </td>

                    {/* Row actions */}
                    <td className={`${cellBase} text-center align-middle`}>
                      {!readOnly && (
                        <div className="flex flex-col items-center gap-1">
                          <button
                            type="button"
                            onClick={() => addRowToGroup(group, index)}
                            title="Insert an activity below (same Item / Equipment)"
                            className="w-6 h-6 flex items-center justify-center bg-white hover:bg-brand-600 text-brand-600 hover:text-white border border-brand-200 rounded-md transition-all"
                          >
                            <CornerDownRight className="w-3 h-3" />
                          </button>
                          <div className="flex items-center">
                            <button type="button" onClick={() => moveRow(group, index, -1)} disabled={index === group.start}
                              className="p-0.5 text-slate-500 hover:bg-white/70 rounded disabled:opacity-20"><ChevronUp className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => moveRow(group, index, 1)} disabled={index === group.start + group.count - 1}
                              className="p-0.5 text-slate-500 hover:bg-white/70 rounded disabled:opacity-20"><ChevronDown className="w-3.5 h-3.5" /></button>
                          </div>
                          <button type="button" onClick={() => deleteRow(index)} title="Delete this activity"
                            className="p-0.5 text-slate-400 hover:text-rose-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>

      {footer}
    </div>
  );
}
