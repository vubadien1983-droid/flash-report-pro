import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Lock, Unlock, CalendarClock,
  CornerDownRight, Layers, X, CalendarRange, SearchX, PencilLine,
} from 'lucide-react';
import PhotoGalleryCell from './PhotoGalleryCell';
import SearchBox from './SearchBox';
import ConfirmModal from './ConfirmModal';
import { TextCell, DateCell, StatusCell, formatCellDate } from './PlanCell';
import { compressForStorage, yieldToBrowser } from '../services/imageCompression';
import {
  ROW_STATE_LEGEND, ROW_STATE_STYLE,
  rowStyle, todayKey, groupMiniPlanItems, miniPlanStats,
  makeMiniPlanRow, makeGroupId, nextPhotoSlot,
  filterMiniPlanGroups, statusChangePatch, isCompletedDateInferred,
  needsPlanDate, NO_DATE_CELL,
  EMPTY_FILTER, normalizeFilter, weekRangeFor, weekModeLabel, WEEK_MODE, FOCUS,
} from '../services/miniPlan';

/** Small coloured chip used by the legend and the summary strip. */
function Chip({ state, count }) {
  const s = ROW_STATE_STYLE[state];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold ${s.tw} ${s.twText} border border-black/5`}>
      <span className="w-2 h-2 rounded-sm" style={{ background: s.css }} />
      {s.label}
      {typeof count === 'number' && <strong className="tabular-nums">{count}</strong>}
    </span>
  );
}

/**
 * CPP Mechanical Mini Plan — the "Monitoring" tab.
 *
 * Layout differs from the Flash Report on purpose:
 *   - Item (A) and Equipment (B) are MERGED down the activities that belong to
 *     one piece of equipment, the way the source spreadsheet has them. A row
 *     added to a group inherits both automatically, which is the whole point
 *     of grouping: the user types the activity, nothing else.
 *   - Schedule (C) and Completed Date (F) are dates, so the colour rule has
 *     something unambiguous to compare against.
 *   - Status (E) is a closed vocabulary, coloured per value.
 *   - Photo (H) is ONE cell holding any number of images.
 *
 * Three rules govern editing here, and all three exist because this is a LIVE
 * document that people read during meetings while somebody types into it:
 *   - a cell opens on DOUBLE-CLICK and on nothing else (components/PlanCell);
 *   - while a cell is open the filters are FROZEN, so the row cannot slide
 *     away under the cursor;
 *   - adding or deleting a row, or deleting an equipment, asks first and names
 *     the equipment in the question.
 *
 * The row colour is NOT computed here — it comes from services/miniPlan.js, the
 * same module the exports and the live link read.
 */
export default function MiniPlanTable({
  items,
  onItemsChange,
  onPhotoClick,
  onPhotoRemoved,
  onAttachFile,
  onOpenAttachment,
  isMobileMode = false,
  readOnly = false,
  onRequestUnlock,
  filter: filterProp,
  onFilterChange,
  fullScreen = false,
}) {
  const [selectedCell, setSelectedCell] = useState(null); // itemIndex | null
  const [editing, setEditing] = useState(null);           // {index, field} | null
  const [confirm, setConfirm] = useState(null);           // {title,message,...} | null

  // The filter is CONTROLLED when the workspace passes one in, so the
  // dashboard tab and this table select the same work. Standalone it keeps its
  // own state, which is what the v2.9 behaviour was.
  const [ownFilter, setOwnFilter] = useState(EMPTY_FILTER);
  const filter = normalizeFilter(filterProp || ownFilter);
  const setFilter = (patch) => {
    const next = { ...filter, ...patch };
    if (onFilterChange) onFilterChange(next);
    else setOwnFilter(next);
  };

  const isEditingCell = editing !== null;

  // Writing a cell re-renders the whole list, and a list that re-renders can
  // lose its scroll position — which reads as the table "jumping" the moment
  // a date is saved. Hold the scroll where the user left it.
  const scrollRef = useRef(null);
  const keepScroll = useRef(null);
  useLayoutEffect(() => {
    if (keepScroll.current == null) return;
    const box = scrollRef.current;
    if (box) box.scrollTop = keepScroll.current;
    keepScroll.current = null;
  });

  // Recomputed once per render; "today" only changes at midnight and a stale
  // value would silently mis-colour every row, so it is read fresh.
  const today = todayKey();

  const allGroups = groupMiniPlanItems(items);
  // Statistics describe the WHOLE plan, never the filtered view - a completion
  // percentage that changed when you typed in a search box would be a lie.
  const stats = miniPlanStats(items, today);

  const {
    groups, matched, groupCount, rowCount, active: filterActive,
  } = filterMiniPlanGroups(allGroups, { ...filter, today });

  const week = weekRangeFor(filter.week, today);
  const weekLabel = weekModeLabel(filter.week);
  const clearFilters = () => setFilter({ ...EMPTY_FILTER });

  /** Mark the rows that actually matched, so it is clear why a group is here.
   *  An OUTLINE, not a fill: the row background already carries the schedule
   *  status, and overwriting it would destroy the colour rule the plan is
   *  read by. */
  const matchClass = (index) =>
    filterActive && matched.has(index)
      ? 'ring-2 ring-inset ring-violet-500/70 bg-violet-50/40'
      : '';

  // ── Editing ────────────────────────────────────────────────────
  const beginEdit = (index, field) => {
    if (readOnly) { onRequestUnlock?.(); return; }
    setEditing({ index, field });
  };
  const cancelEdit = () => setEditing(null);
  const isOpen = (index, field) => Boolean(editing && editing.index === index && editing.field === field);

  // ── Mutations ──────────────────────────────────────────────────
  const patchItem = (index, patch) => {
    if (readOnly) return;
    const next = [...items];
    next[index] = { ...next[index], ...patch };
    onItemsChange(next);
  };

  /** Commit one cell: close it first, then write. */
  const commitCell = (index, patch) => {
    keepScroll.current = scrollRef.current ? scrollRef.current.scrollTop : null;
    setEditing(null);
    const current = items[index] || {};
    const changed = Object.keys(patch).some((k) => (current[k] ?? '') !== (patch[k] ?? ''));
    if (changed) patchItem(index, patch);
  };

  /** Editing the merged Equipment cell rewrites the name on every row of the
   *  group, so a single row still carries its equipment wherever it is read. */
  const commitEquipment = (groupKey, equipment) => {
    setEditing(null);
    if (readOnly) return;
    const changed = items.some((it) => it.group_id === groupKey && (it.equipment || '') !== equipment);
    if (!changed) return;
    onItemsChange(items.map((it) => (it.group_id === groupKey ? { ...it, equipment } : it)));
  };

  const addRowToGroup = (group, afterIndex = null) => {
    const at = afterIndex === null ? group.start + group.count - 1 : afterIndex;
    const row = makeMiniPlanRow(group.key, group.equipment);
    const next = [...items];
    next.splice(at + 1, 0, row);
    onItemsChange(next);
  };

  const addEquipment = (afterGroup = null) => {
    const gid = makeGroupId();
    const row = makeMiniPlanRow(gid, '');
    const next = [...items];
    const at = afterGroup ? afterGroup.start + afterGroup.count : items.length;
    next.splice(at, 0, row);
    onItemsChange(next);
  };

  const deleteRow = (index) => {
    if (items.length <= 1) {
      onItemsChange([makeMiniPlanRow(makeGroupId(), '')]);
      return;
    }
    onItemsChange(items.filter((_, i) => i !== index));
  };

  const deleteGroup = (group) => {
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

  // ── Confirmations ──────────────────────────────────────────────
  // The wording is the user's: the question always names the equipment,
  // because "did I click the right row?" is the only thing worth asking here.
  const equipName = (group) => group.equipment?.trim() || '(unnamed equipment)';

  const askAddRow = (group, afterIndex = null) => {
    if (readOnly) { onRequestUnlock?.(); return; }
    setConfirm({
      title: 'Add one row',
      message: `Do you want to Add one row for the Equipment "${equipName(group)}"?`,
      confirmLabel: 'Yes, add one row',
      tone: 'brand',
      onYes: () => addRowToGroup(group, afterIndex),
    });
  };

  const askDeleteRow = (group, index) => {
    if (readOnly) { onRequestUnlock?.(); return; }
    const activity = (items[index]?.activity || '').trim();
    setConfirm({
      title: 'Delete one row',
      message: `Do you want to Delete one row for the Equipment "${equipName(group)}"?`
        + (activity ? `\n\nActivity: ${activity}` : ''),
      confirmLabel: 'Yes, delete this row',
      tone: 'danger',
      onYes: () => deleteRow(index),
    });
  };

  const askDeleteGroup = (group) => {
    if (readOnly) { onRequestUnlock?.(); return; }
    setConfirm({
      title: 'Delete the Equipment',
      message: `Do you want to Delete the Equipment "${equipName(group)}" and all `
        + `${group.count} ${group.count === 1 ? 'row' : 'rows'} under it?`,
      confirmLabel: 'Yes, delete the Equipment',
      tone: 'danger',
      onYes: () => deleteGroup(group),
    });
  };

  const askAddEquipment = (afterGroup = null) => {
    if (readOnly) { onRequestUnlock?.(); return; }
    setConfirm({
      title: 'Add one Equipment',
      message: afterGroup
        ? `Do you want to Add one new Equipment below the Equipment "${equipName(afterGroup)}"?`
        : 'Do you want to Add one new Equipment at the end of the plan?',
      confirmLabel: 'Yes, add the Equipment',
      tone: 'brand',
      onYes: () => addEquipment(afterGroup),
    });
  };

  const runConfirm = () => {
    const action = confirm?.onYes;
    setConfirm(null);
    if (action) action();
  };

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

  // ── One-line header + toolbar ──────────────────────────────────
  //
  // Header and toolbar used to be two stacked bars above a 500-row table. On a
  // laptop that is a third of the useful height spent on text that never
  // changes, so everything the user actually operates lives on ONE wrapping
  // line and the table gets the screen.
  const weekButton = (mode, label) => {
    const on = filter.week === mode;
    const r = weekRangeFor(mode, today);
    return (
      <button
        key={mode}
        type="button"
        disabled={isEditingCell}
        onClick={() => setFilter({ week: on ? WEEK_MODE.NONE : mode })}
        title={isEditingCell
          ? 'Filters are locked while a cell is open for editing'
          : `Show every Equipment with an activity scheduled ${r.start} to ${r.end}`}
        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[12.5px] font-bold rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          on
            ? 'bg-violet-600 text-white border-violet-700 shadow-sm shadow-violet-600/30'
            : 'bg-white text-black border-slate-300 hover:bg-slate-50'
        }`}
      >
        <CalendarRange className="w-3.5 h-3.5" />
        {label}
      </button>
    );
  };

  const toolbar = (
    <div className="px-3 py-2 bg-slate-50/90 border-b border-slate-200/80 flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-black">
        <span className="w-2 h-2 rounded-full bg-brand-500" />
        {stats.equipment} EQ · {stats.total} act
        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
          {stats.percent}%
        </span>
      </span>

      {readOnly ? (
        <button
          type="button"
          onClick={onRequestUnlock}
          className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded-md hover:bg-amber-100 transition-colors"
          title="Enter the project password to edit"
        >
          <Lock className="w-3 h-3" /> Read only
        </button>
      ) : (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-1.5 py-0.5 rounded-md">
          <Unlock className="w-3 h-3" /> Unlocked · double-click a cell
        </span>
      )}

      <SearchBox
        className="flex-1 min-w-[180px] max-w-sm"
        value={filter.search}
        onChange={(v) => setFilter({ search: v })}
        disabled={isEditingCell}
        placeholder="Search anything..."
        inputClassName="w-full text-[12.5px] text-black bg-white border border-slate-200 rounded-lg pl-8 pr-8 py-1.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all placeholder:text-slate-400 disabled:bg-slate-100 disabled:cursor-not-allowed"
      />

      {weekButton(WEEK_MODE.THIS, 'This week')}
      {weekButton(WEEK_MODE.NEXT, 'Next week')}

      {filterActive && (
        <>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11.5px] font-bold text-violet-900 bg-violet-100 border border-violet-300 rounded-md">
            {groupCount} EQ · {rowCount} matching
          </span>
          <button
            type="button"
            disabled={isEditingCell}
            onClick={clearFilters}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11.5px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md transition-colors disabled:opacity-40"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        </>
      )}

      {/* The filters are frozen while a cell is open. Without that the row
          being typed into can leave the view the moment its Status changes,
          and the next keystroke lands somewhere else entirely. */}
      {isEditingCell && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11.5px] font-bold text-amber-900 bg-amber-100 border border-amber-300 rounded-md">
          <PencilLine className="w-3 h-3" /> Editing — filters locked
        </span>
      )}

      {filter.week !== WEEK_MODE.NONE && (
        <span className="text-[11.5px] text-slate-500">{weekLabel}: {week.start} → {week.end}</span>
      )}

      <span className="ml-auto flex items-center gap-1 flex-wrap">
        {/* One count per state, looked up by key: a ternary chain silently
            mislabels the moment a state is added — which is exactly what
            happened when Unplanned arrived. */}
        {ROW_STATE_LEGEND.map((s) => <Chip key={s} state={s} count={stats[s] ?? 0} />)}
      </span>
    </div>
  );

  /* Shown instead of the table when a filter excludes everything, so an empty
     screen is never mistaken for an empty plan. */
  const emptyState = (
    <div className="px-4 py-12 text-center">
      <SearchX className="w-8 h-8 text-slate-300 mx-auto mb-2" />
      <p className="text-[14px] font-bold text-black">No Equipment matches</p>
      <p className="text-[12px] text-slate-500 mt-1">
        {filter.week !== WEEK_MODE.NONE
          ? `Nothing is scheduled between ${week.start} and ${week.end}${filter.search ? ' for that search' : ''}.`
          : 'Try a shorter search, or clear the dashboard selection.'}
      </p>
      <button
        type="button"
        onClick={clearFilters}
        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-bold text-white bg-slate-800 hover:bg-slate-700 rounded-lg"
      >
        <X className="w-4 h-4" /> Clear filters
      </button>
    </div>
  );

  /* App chrome — hidden on the share link, where the screen belongs to the
     plan. The colour legend it explains is already in the toolbar, and "Add
     Equipment" is on every equipment block. */
  const footer = fullScreen ? null : (
    <div className="px-3 py-1.5 bg-slate-50/60 border-t border-slate-200/80 flex items-center justify-between text-[11.5px] text-slate-600">
      <span className="flex items-center gap-1.5">
        <CalendarClock className="w-3.5 h-3.5 text-slate-400" />
        Colours follow Schedule vs today ({today})
      </span>
      <button
        type="button"
        onClick={() => askAddEquipment(null)}
        className="text-[11.5px] font-semibold text-brand-600 hover:text-brand-800 flex items-center gap-1 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Equipment
      </button>
    </div>
  );

  const confirmModal = (
    <ConfirmModal
      isOpen={Boolean(confirm)}
      title={confirm?.title}
      message={confirm?.message || ''}
      confirmLabel={confirm?.confirmLabel}
      tone={confirm?.tone}
      onConfirm={runConfirm}
      onCancel={() => setConfirm(null)}
    />
  );

  // ── Phone: cards grouped by equipment ──────────────────────────
  if (isMobileMode) {
    return (
      <div className={`bg-white rounded-xl shadow-xs border border-slate-200/80 overflow-hidden ${
        fullScreen ? 'h-full flex flex-col min-h-0' : 'mb-6'
      }`}>
        {toolbar}
        {confirmModal}

        {filterActive && groups.length === 0 && emptyState}

        <div className={`p-2.5 space-y-3 bg-slate-50/50 ${fullScreen ? 'flex-1 min-h-0 overflow-auto' : ''}`}>
          {groups.map((group) => (
            <div key={group.key} className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              {/* Equipment header = merged columns A + B */}
              <div className="px-3 py-2 bg-slate-800 text-white flex items-start gap-2">
                <span className="w-6 h-6 rounded-full bg-white/15 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {group.no || '-'}
                </span>
                <div className="flex-1 min-w-0">
                  <TextCell
                    value={group.equipment}
                    placeholder="Equipment name..."
                    readOnly={readOnly}
                    isEditing={isOpen(group.start, 'equipment')}
                    onEdit={() => beginEdit(group.start, 'equipment')}
                    onCommit={(v) => commitEquipment(group.key, v)}
                    onCancel={cancelEdit}
                    displayClassName="text-[14px] font-bold text-white leading-snug"
                    inputClassName="w-full text-[14px] font-bold text-black bg-white rounded-md px-1.5 py-1 leading-snug"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => askDeleteGroup(group)}
                  title="Delete this equipment and all its activities"
                  className="p-1 text-white/60 hover:text-rose-300 flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="p-2.5 space-y-2.5">
                {group.rows.map(({ item, index }) => {
                  const s = rowStyle(item, today);
                  return (
                    <div
                      key={item.id || index}
                      className={`rounded-lg border border-slate-200 p-2.5 space-y-2 ${s.tw} ${matchClass(index)}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-bold text-slate-600 uppercase tracking-wide">
                          Activity {index - group.start + 1}
                        </span>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => moveRow(group, index, -1)} disabled={index === group.start}
                            className="p-1 text-slate-400 disabled:opacity-25"><ChevronUp className="w-4 h-4" /></button>
                          <button type="button" onClick={() => moveRow(group, index, 1)} disabled={index === group.start + group.count - 1}
                            className="p-1 text-slate-400 disabled:opacity-25"><ChevronDown className="w-4 h-4" /></button>
                          <button type="button" onClick={() => askDeleteRow(group, index)}
                            className="p-1 text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>

                      <TextCell
                        value={item.activity}
                        placeholder="Activity to be carried out..."
                        readOnly={readOnly}
                        isEditing={isOpen(index, 'activity')}
                        onEdit={() => beginEdit(index, 'activity')}
                        onCommit={(v) => commitCell(index, { activity: v })}
                        onCancel={cancelEdit}
                        displayClassName="text-[14px] text-black bg-white/70 border border-slate-200 leading-relaxed"
                        inputClassName="w-full text-[14px] text-black bg-white border border-slate-200 rounded-lg p-2 leading-relaxed"
                      />

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11.5px] font-semibold text-black mb-0.5">Schedule</label>
                          <DateCell
                            label="Schedule"
                            value={item.schedule}
                            readOnly={readOnly}
                            isEditing={isOpen(index, 'schedule')}
                            onEdit={() => beginEdit(index, 'schedule')}
                            onCommit={(v) => commitCell(index, { schedule: v })}
                            onCancel={cancelEdit}
                            displayClassName={`text-[14px] text-black border border-slate-200 ${
                              needsPlanDate(item, today) ? NO_DATE_CELL.tw : 'bg-white/70'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="block text-[11.5px] font-semibold text-black mb-0.5">Status</label>
                          <StatusCell
                            value={item.status}
                            readOnly={readOnly}
                            isEditing={isOpen(index, 'status')}
                            onEdit={() => beginEdit(index, 'status')}
                            onCommit={(v) => commitCell(index, statusChangePatch(item, v, today))}
                            onCancel={cancelEdit}
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[11.5px] font-semibold text-black mb-0.5 flex items-center gap-1">
                            Completed date
                            {isCompletedDateInferred(item) && (
                              <span className="text-[10px] font-medium text-slate-500 italic">(from plan date)</span>
                            )}
                          </label>
                          <DateCell
                            label="Completed date"
                            value={item.completed_date}
                            readOnly={readOnly}
                            isEditing={isOpen(index, 'completed_date')}
                            onEdit={() => beginEdit(index, 'completed_date')}
                            onCommit={(v) => commitCell(index, { completed_date: v })}
                            onCancel={cancelEdit}
                            displayClassName="text-[14px] text-black bg-white/70 border border-slate-200"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11.5px] font-semibold text-black mb-0.5">Note</label>
                        <TextCell
                          value={item.note}
                          placeholder="Note..."
                          readOnly={readOnly}
                          isEditing={isOpen(index, 'note')}
                          onEdit={() => beginEdit(index, 'note')}
                          onCommit={(v) => commitCell(index, { note: v })}
                          onCancel={cancelEdit}
                          displayClassName="text-[14px] text-black bg-white/70 border border-slate-200"
                          inputClassName="w-full text-[14px] text-black bg-white border border-slate-200 rounded-lg p-2"
                        />
                      </div>

                      <div>
                        <label className="block text-[11.5px] font-semibold text-black mb-0.5 flex items-center justify-between">
                          <span>Photo ({(item.photos || []).filter(Boolean).length})</span>
                          <span className="text-[9px] text-brand-600 font-medium">many photos per activity</span>
                        </label>
                        <PhotoGalleryCell
                          photos={item.photos}
                          onPhotosChange={(ph) => setPhotos(index, ph)}
                          onPhotoClick={(entry, rowList) => onPhotoClick?.(entry, rowList, index)}
                          onPhotoRemoved={(photo) => onPhotoRemoved?.(item, photo)}
                          onAttachFile={onAttachFile ? (file, slot) => onAttachFile(item, index, file, slot) : undefined}
                          onOpenAttachment={(photo) => onOpenAttachment?.(photo, item, index)}
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
                  onClick={() => askAddRow(group)}
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

          <button
            type="button"
            onClick={() => askAddEquipment(null)}
            className="w-full py-2.5 text-[14px] font-bold text-white bg-slate-800 hover:bg-slate-700 rounded-xl flex items-center justify-center gap-1.5"
          >
            <Layers className="w-4 h-4" />
            Add Equipment
          </button>
        </div>

        {footer}
      </div>
    );
  }

  // ── Laptop: the plan table with merged A + B ───────────────────
  const cellBase = 'px-1.5 py-1 align-top border-b border-slate-200';
  const headCls = 'sticky top-0 z-20 bg-slate-100 border-b border-slate-300 px-2 py-2 text-center text-[12.5px] font-bold text-black shadow-[0_1px_0_0_rgba(148,163,184,0.6)]';

  return (
    <div className={`bg-white rounded-xl shadow-xs border border-slate-200/80 overflow-hidden ${
      fullScreen ? 'h-full flex flex-col min-h-0' : 'mb-6'
    }`}>
      {toolbar}
      {confirmModal}

      {filterActive && groups.length === 0 && emptyState}

      {/* The table scrolls INSIDE this box, both ways, and the header row is
          sticky to its top — on a 500-row plan the column titles have to stay
          on screen or the table cannot be read at all. The min-width keeps the
          row's shape: a plan is read across the row, so the box scrolls
          sideways rather than squeezing eight columns into the pane. */}
      <div ref={scrollRef} className={`overflow-auto w-full ${
        fullScreen ? 'flex-1 min-h-0' : 'max-h-[calc(100vh-215px)] min-h-[320px]'
      }`}>
        <table className="w-full min-w-[1400px] text-left border-collapse table-fixed">
          <thead>
            <tr>
              <th className={`${headCls} w-12`}>Item</th>
              <th className={`${headCls} w-44`}>Equipment</th>
              <th className={`${headCls} w-28`}>Schedule</th>
              <th className={`${headCls} w-[21rem]`}>Activities</th>
              <th className={`${headCls} w-32`}>Status</th>
              <th className={`${headCls} w-28`}>Completed</th>
              <th className={`${headCls} w-48`}>Note</th>
              <th className={`${headCls} w-[18rem]`}>Photo</th>
              <th className={`${headCls} w-12`}>Act.</th>
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
                  <tr key={item.id || index} className={`${s.tw} ${matchClass(index)} hover:brightness-[0.985] transition-all`}>
                    {isFirst && (
                      <>
                        <td rowSpan={group.count} className="px-1.5 py-1.5 text-center align-middle border-b border-slate-200 bg-white/60">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-800 text-white text-[12.5px] font-bold">
                            {group.no || '-'}
                          </span>
                        </td>
                        <td rowSpan={group.count} className="px-1.5 py-1.5 align-top border-b border-slate-200 bg-white/60">
                          <TextCell
                            value={group.equipment}
                            placeholder="Equipment name..."
                            readOnly={readOnly}
                            isEditing={isOpen(group.start, 'equipment')}
                            onEdit={() => beginEdit(group.start, 'equipment')}
                            onCommit={(v) => commitEquipment(group.key, v)}
                            onCancel={cancelEdit}
                            displayClassName="text-[13px] font-bold text-black leading-snug"
                            inputClassName="w-full text-[13px] font-bold text-black bg-white border border-slate-200 rounded-md px-2 py-1.5 leading-snug"
                          />
                          {/* These stay on screen when the plan is LOCKED, greyed
                              but present, and a click asks for the password.
                              Hiding them entirely was wrong: with nothing on
                              screen there is no way to tell that adding a row to
                              an Equipment is possible at all, so the feature
                              reads as missing rather than as protected. */}
                          <div className="flex flex-wrap items-center gap-1 mt-1 px-1">
                            <button
                              type="button"
                              onClick={() => askAddRow(group)}
                              title={readOnly
                                ? 'Enter the project password to add an activity'
                                : 'Add an activity to this Equipment'}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11.5px] font-bold border rounded-md transition-colors ${
                                readOnly
                                  ? 'text-slate-400 bg-slate-50 border-slate-200 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300'
                                  : 'text-brand-700 bg-brand-50 hover:bg-brand-600 hover:text-white border-brand-200'
                              }`}
                            >
                              {readOnly ? <Lock className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                              Add row
                            </button>
                            <button
                              type="button"
                              onClick={() => askAddEquipment(group)}
                              title={readOnly
                                ? 'Enter the project password to add an Equipment'
                                : 'Insert a new Equipment below'}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11.5px] font-bold border rounded-md transition-colors ${
                                readOnly
                                  ? 'text-slate-400 bg-slate-50 border-slate-200 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300'
                                  : 'text-slate-700 bg-slate-100 hover:bg-slate-700 hover:text-white border-slate-200'
                              }`}
                            >
                              <Layers className="w-3 h-3" /> Equip.
                            </button>
                            <button
                              type="button"
                              onClick={() => askDeleteGroup(group)}
                              title="Delete this Equipment and all its activities"
                              className="p-0.5 text-slate-400 hover:text-rose-600 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}

                    {/* Schedule — tinted when it is EMPTY, so the mark sits on
                        the missing value instead of colouring the whole row. */}
                    <td className={`${cellBase} align-middle`}>
                      <DateCell
                        label="Schedule"
                        value={item.schedule}
                        readOnly={readOnly}
                        isEditing={isOpen(index, 'schedule')}
                        onEdit={() => beginEdit(index, 'schedule')}
                        onCommit={(v) => commitCell(index, { schedule: v })}
                        onCancel={cancelEdit}
                        displayClassName={`text-[13px] text-black ${needsPlanDate(item, today) ? NO_DATE_CELL.tw : ''}`}
                      />
                    </td>

                    {/* Activities */}
                    <td className={cellBase}>
                      <TextCell
                        value={item.activity}
                        placeholder="Activity to be carried out..."
                        readOnly={readOnly}
                        isEditing={isOpen(index, 'activity')}
                        onEdit={() => beginEdit(index, 'activity')}
                        onCommit={(v) => commitCell(index, { activity: v })}
                        onCancel={cancelEdit}
                        displayClassName="text-[13px] text-black leading-relaxed"
                        inputClassName="w-full text-[13px] text-black bg-white border border-slate-200 rounded-md px-2 py-1.5 leading-relaxed"
                      />
                    </td>

                    {/* Status */}
                    <td className={`${cellBase} align-middle`}>
                      <StatusCell
                        value={item.status}
                        readOnly={readOnly}
                        isEditing={isOpen(index, 'status')}
                        onEdit={() => beginEdit(index, 'status')}
                        onCommit={(v) => commitCell(index, statusChangePatch(item, v, today))}
                        onCancel={cancelEdit}
                      />
                    </td>

                    {/* Completed Date — when the work was actually finished,
                        which is what the dashboard's weekly figures count.
                        Stamped automatically the moment Status becomes Done. */}
                    <td className={`${cellBase} align-middle`}>
                      <DateCell
                        label="Completed date"
                        value={item.completed_date}
                        readOnly={readOnly}
                        isEditing={isOpen(index, 'completed_date')}
                        onEdit={() => beginEdit(index, 'completed_date')}
                        onCommit={(v) => commitCell(index, { completed_date: v })}
                        onCancel={cancelEdit}
                        displayClassName="text-[13px] text-black"
                        note={isCompletedDateInferred(item) ? (
                          <span
                            title="No completed date was recorded for this Done activity, so the dashboard counts its plan date."
                            className="block text-[10px] text-slate-600 italic"
                          >
                            {formatCellDate(item.schedule)} (plan)
                          </span>
                        ) : null}
                      />
                    </td>

                    {/* Note */}
                    <td className={cellBase}>
                      <TextCell
                        value={item.note}
                        placeholder="Note..."
                        readOnly={readOnly}
                        isEditing={isOpen(index, 'note')}
                        onEdit={() => beginEdit(index, 'note')}
                        onCommit={(v) => commitCell(index, { note: v })}
                        onCancel={cancelEdit}
                        displayClassName="text-[13px] text-black leading-relaxed"
                        inputClassName="w-full text-[13px] text-black bg-white border border-slate-200 rounded-md px-2 py-1.5 leading-relaxed"
                      />
                    </td>

                    {/* Photo — ONE cell, many images */}
                    <td className={cellBase}>
                      <PhotoGalleryCell
                        photos={item.photos}
                        onPhotosChange={(ph) => setPhotos(index, ph)}
                        onPhotoClick={(entry, rowList) => onPhotoClick?.(entry, rowList, index)}
                        onPhotoRemoved={(photo) => onPhotoRemoved?.(item, photo)}
                        onAttachFile={onAttachFile ? (file, slot) => onAttachFile(item, index, file, slot) : undefined}
                        onOpenAttachment={(photo) => onOpenAttachment?.(photo, item, index)}
                        isSelected={selectedCell === index}
                        onSelectSlot={() => setSelectedCell(index)}
                        readOnly={readOnly}
                        isMobileView={false}
                      />
                    </td>

                    {/* Row actions */}
                    <td className={`${cellBase} text-center align-middle`}>
                      <div className="flex flex-col items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => askAddRow(group, index)}
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
                        <button type="button" onClick={() => askDeleteRow(group, index)} title="Delete this activity"
                          className="p-0.5 text-slate-400 hover:text-rose-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
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
