import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardList, Upload, Plus, FolderPlus, X, RefreshCw, FileSpreadsheet,
  AlertTriangle, CheckCircle2, User, Calendar, MapPin, Filter,
} from 'lucide-react';
import OpsFindingsTable from './OpsFindingsTable';
import SearchBox from './SearchBox';
import ConfirmModal from './ConfirmModal';
import { TextCell, DateCell } from './PlanCell';
import {
  OPS_STATUS, OPS_STATUS_STYLE, OPS_DEFAULT_SECTION, EMPTY_OPS_FILTER,
  groupOpsSections, opsStats, filterOpsIndices, opsFilterActive, distinctValues,
  describeOpsFilter, makeOpsFinding, opsEditPatch, withColumnPhotos, opsSections,
  mergeOpsImport, todayKeyLocal, formatOpsDate, opsRowHasContent,
} from '../services/opsFindings';

/**
 * OPS Findings & Action Tracking — the whole report surface.
 *
 * Used twice: in the app (editable) and on the public share link
 * (`readOnly`, fed by the live listener). Both draw the same header, the same
 * summary figures, the same filter and the same table, so a reader of the link
 * sees exactly what the author sees.
 *
 * THE FIGURES COUNT THE WHOLE REPORT; the filter narrows the table only. A
 * closure percentage that moved when someone typed in the search box would be
 * a lie (the Mini Plan's rule). Clicking a figure filters the table to it.
 */

const SEL = 'text-[12.5px] bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-900 outline-none focus:border-brand-500 max-w-[180px]';

function Tile({ label, value, sub, tone = 'text-slate-900', active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 min-w-[96px] text-left px-3 py-2 rounded-xl border transition-all ${
        active ? 'border-brand-500 ring-2 ring-brand-500/25 bg-brand-50/50' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-[22px] leading-tight font-extrabold tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="text-[10.5px] text-slate-500 leading-tight">{sub}</div>}
    </button>
  );
}

export default function OpsFindingsWorkspace({
  report,
  items,
  onItemsChange,
  onHeaderChange,          // (field, value) — omitted when read-only
  onReportPatch,           // ({ items?, location?, ... }) — one write for an import
  readOnly = false,
  isMobileMode = false,
  onPhotoClick,            // (entry, rowEntries, itemIndex)
  onPhotoRemoved,          // (item, photo)
  onAttachFile,            // async (item, itemIndex, file, slot) => descriptor | null
  onOpenAttachment,        // (photo, item, itemIndex)
  onViewChange,            // ({ filter, indices, label }) — lets the exporter follow the screen
  notify,                  // (message, type)
  toolbarExtra = null,     // extra buttons (the share link puts its export buttons here)
}) {
  const [filter, setFilter] = useState(() => {
    try {
      const raw = sessionStorage.getItem(`fr_ops_filter_${report?.id || 'shared'}`);
      return raw ? { ...EMPTY_OPS_FILTER, ...JSON.parse(raw) } : EMPTY_OPS_FILTER;
    } catch { return EMPTY_OPS_FILTER; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(`fr_ops_filter_${report?.id || 'shared'}`, JSON.stringify(filter)); } catch { /* ignore */ }
  }, [filter, report?.id]);

  const [editing, setEditing] = useState(null);     // { id, field }
  const [selected, setSelected] = useState(null);   // { id, col }
  const [confirm, setConfirm] = useState(null);
  const [newSection, setNewSection] = useState(null); // string while the dialog is open
  const [headerEdit, setHeaderEdit] = useState(null);

  // Latest items for callbacks that finish later (a photo still compressing
  // must not write its row back over an edit made in the meantime).
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const stats = useMemo(() => opsStats(items), [items]);
  const indices = useMemo(() => filterOpsIndices(items, filter), [items, filter]);

  // Freeze the visible rows while a cell is open, so the row being typed into
  // cannot slide out of view when its own edit stops matching the filter.
  const frozen = useRef(indices);
  if (!editing) frozen.current = indices;
  const shown = editing ? frozen.current : indices;
  const groups = useMemo(() => groupOpsSections(items, shown), [items, shown]);
  const active = opsFilterActive(filter);

  useEffect(() => {
    onViewChange?.({ filter, indices, label: describeOpsFilter(filter), active });
  }, [filter, indices, active]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = useMemo(() => ({
    system: distinctValues(items, 'system'),
    pic: distinctValues(items, 'pic'),
    raisedBy: distinctValues(items, 'raised_by'),
  }), [items]);

  // ── Editing API handed to the table ───────────────────────────
  const write = (next) => { if (!readOnly) onItemsChange(next); };
  const updateById = (id, patchFn) => {
    const cur = itemsRef.current;
    const i = cur.findIndex((it) => it.id === id);
    if (i < 0) return;
    const patch = patchFn(cur[i]);
    if (!patch) return;
    const next = cur.slice();
    next[i] = { ...cur[i], ...patch };
    write(next);
  };

  const api = useMemo(() => ({
    beginEdit: (id, field) => { if (!readOnly) setEditing({ id, field }); },
    cancel: () => setEditing(null),
    commit: (id, field, value) => {
      setEditing(null);
      updateById(id, (cur) => {
        if ((cur[field] ?? '') === (value ?? '')) return null;
        return opsEditPatch(cur, field, value, todayKeyLocal());
      });
    },
    select: (id, col) => setSelected({ id, col }),
    setColumnPhotos: (id, col, list) => updateById(id, (cur) => ({
      photos: withColumnPhotos(cur, col, list),
      updated_date: todayKeyLocal(),
    })),
    onPhotoClick,
    onPhotoRemoved,
    onAttachFile,
    onOpenAttachment,
    insertBelow: (index) => {
      const cur = itemsRef.current;
      const base = cur[index];
      const row = makeOpsFinding(base?.section || OPS_DEFAULT_SECTION, {
        system: base?.system || '',
        open_date: todayKeyLocal(),
        updated_date: todayKeyLocal(),
      });
      const next = cur.slice();
      next.splice(index + 1, 0, row);
      write(next);
      setEditing({ id: row.id, field: 'description' });
    },
    addToSection: (section, lastIndex) => {
      const cur = itemsRef.current;
      const row = makeOpsFinding(section, { open_date: todayKeyLocal(), updated_date: todayKeyLocal() });
      const next = cur.slice();
      const at = Number.isInteger(lastIndex) ? lastIndex + 1 : next.length;
      next.splice(at, 0, row);
      write(next);
      setEditing({ id: row.id, field: 'system' });
    },
    renameSection: (rowIndices, name) => {
      const set = new Set(rowIndices);
      write(itemsRef.current.map((it, i) => (set.has(i) ? { ...it, section: name } : it)));
    },
    askDelete: (index) => {
      const it = itemsRef.current[index];
      if (!it) return;
      const what = [it.system, it.description].filter(Boolean).join(' — ').slice(0, 160) || 'this empty finding';
      setConfirm({
        title: 'Delete this finding?',
        message: `"${what}" will be removed from the report, with its photos and close-out references.`,
        confirmLabel: 'Yes, delete',
        tone: 'danger',
        onYes: () => {
          setConfirm(null);
          const cur = itemsRef.current;
          const i = cur.findIndex((x) => x.id === it.id);
          if (i < 0) return;
          const gone = cur[i];
          write(cur.filter((_, j) => j !== i));
          (gone.photos || []).filter(Boolean).forEach((p) => onPhotoRemoved?.(gone, p));
        },
      });
    },
  }), [readOnly, onPhotoClick, onPhotoRemoved, onAttachFile, onOpenAttachment]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Import ────────────────────────────────────────────────────
  const fileRef = useRef(null);
  const [importState, setImportState] = useState(null);
  // null | { phase: 'reading', msg } | { phase: 'preview', parsed, merged, fileName } | { phase: 'error', msg }

  const startImport = async (file) => {
    if (!file) return;
    setImportState({ phase: 'reading', msg: 'Reading the workbook…' });
    try {
      const { parseOpsWorkbook } = await import('../services/opsFindingsImport');
      const parsed = await parseOpsWorkbook(file, {
        onProgress: (msg) => setImportState({ phase: 'reading', msg }),
      });
      // A brand-new report starts with one blank finding; it must not stay
      // on top of an import as an empty row 1.
      const cur = itemsRef.current;
      const base = cur.some(opsRowHasContent) ? cur : [];
      const merged = mergeOpsImport(base, parsed.rows);
      setImportState({ phase: 'preview', parsed, merged, fileName: file.name });
    } catch (e) {
      console.error('Import failed:', e);
      setImportState({ phase: 'error', msg: e.message || String(e) });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const applyImport = () => {
    if (importState?.phase !== 'preview') return;
    const { merged, parsed } = importState;
    // Header: fill only what is empty — same rule as the rows. ONE write with
    // the items, so the two cannot overwrite each other.
    const m = parsed.meta || {};
    const patch = { items: merged.items };
    if (!report?.location && m.subtitle) patch.location = m.subtitle;
    if (!report?.system_tag && m.updatedBy) patch.system_tag = m.updatedBy;
    if (onReportPatch) onReportPatch(patch);
    else write(merged.items);
    const s = merged.stats;
    notify?.(`Import done: ${s.added} new finding(s), ${s.rowsFilled} existing row(s) completed, ${s.photosAdded} photo(s).`, 'success');
    setImportState(null);
  };

  // ── Header ────────────────────────────────────────────────────
  const headerField = (field, value, { placeholder, cls = 'text-[12.5px] text-slate-700', icon: Icon, date = false } = {}) => (
    <span className="flex items-center gap-1 min-w-0">
      {Icon && <Icon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
      <span className="min-w-[90px] flex-1">
        {readOnly || !onHeaderChange ? (
          <span className={`px-2 py-1 block ${cls}`}>{date ? (formatOpsDate(value) || '—') : (value || '—')}</span>
        ) : date ? (
          <DateCell value={value || ''} label={placeholder}
            isEditing={headerEdit === field} onEdit={() => setHeaderEdit(field)}
            onCommit={(v) => { setHeaderEdit(null); if ((value || '') !== (v || '')) onHeaderChange(field, v); }}
            onCancel={() => setHeaderEdit(null)} displayClassName={cls} />
        ) : (
          <TextCell value={value || ''} placeholder={placeholder}
            isEditing={headerEdit === field} onEdit={() => setHeaderEdit(field)}
            onCommit={(v) => { setHeaderEdit(null); if ((value || '') !== (v || '')) onHeaderChange(field, v); }}
            onCancel={() => setHeaderEdit(null)} displayClassName={cls}
            inputClassName={`w-full bg-white border border-slate-200 rounded-md px-2 py-1 ${cls}`} />
        )}
      </span>
    </span>
  );

  const setF = (patch) => setFilter((f) => ({ ...f, ...patch }));
  const statusTile = (st) => () => setF({ status: filter.status === st ? '' : st });

  return (
    <div className="w-full">
      {/* Header — one compact card: title, area, updated by / date. */}
      <div className="w-full bg-white rounded-xl shadow-xs border border-slate-200/80 px-3 py-2 mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <ClipboardList className="w-4 h-4 text-brand-600 flex-shrink-0" />
        <div className="flex-1 min-w-[220px]">
          {headerField('title', report?.title, { placeholder: 'Report title', cls: 'text-[15px] font-extrabold text-slate-900' })}
        </div>
        <div className="min-w-[160px]">{headerField('location', report?.location, { placeholder: 'Area (e.g. CPP/LQ/Flare Tower)', icon: MapPin })}</div>
        <div className="min-w-[150px]">{headerField('system_tag', report?.system_tag, { placeholder: 'Updated by', icon: User })}</div>
        <div className="min-w-[130px]">{headerField('inspection_date', report?.inspection_date, { placeholder: 'Updated date', icon: Calendar, date: true })}</div>
      </div>

      {/* Summary — whole report. */}
      <div className="flex flex-wrap gap-2 mb-2">
        <Tile label="Total findings" value={stats.total} active={!filter.status && active === false}
          onClick={() => setF({ status: '' })} />
        <Tile label="Open" value={stats.open} tone={OPS_STATUS_STYLE[OPS_STATUS.OPEN].tile}
          sub={stats.total ? `${Math.round((stats.open / stats.total) * 100)}%` : ''}
          active={filter.status === OPS_STATUS.OPEN} onClick={statusTile(OPS_STATUS.OPEN)} />
        <Tile label="On-going" value={stats.ongoing} tone={OPS_STATUS_STYLE[OPS_STATUS.ONGOING].tile}
          sub={stats.total ? `${Math.round((stats.ongoing / stats.total) * 100)}%` : ''}
          active={filter.status === OPS_STATUS.ONGOING} onClick={statusTile(OPS_STATUS.ONGOING)} />
        <Tile label="Closed" value={stats.closed} tone={OPS_STATUS_STYLE[OPS_STATUS.CLOSED].tile}
          sub={stats.total ? `${Math.round((stats.closed / stats.total) * 100)}%` : ''}
          active={filter.status === OPS_STATUS.CLOSED} onClick={statusTile(OPS_STATUS.CLOSED)} />
        <div className="flex-[1.4] min-w-[170px] px-3 py-2 rounded-xl border border-slate-200 bg-white">
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Close-out progress</div>
          <div className="flex items-baseline gap-2">
            <span className="text-[22px] leading-tight font-extrabold tabular-nums text-emerald-700">{stats.percentClosed}%</span>
            <span className="text-[11px] text-slate-500">{stats.closed} of {stats.total} closed</span>
          </div>
          <div className="mt-1 h-2 w-full rounded-full bg-slate-100 overflow-hidden flex">
            {stats.total > 0 && (
              <>
                <div style={{ width: `${(stats.closed / stats.total) * 100}%` }} className="bg-emerald-600" />
                <div style={{ width: `${(stats.ongoing / stats.total) * 100}%` }} className="bg-amber-400" />
                <div style={{ width: `${(stats.open / stats.total) * 100}%` }} className="bg-rose-500" />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filter + actions */}
      <div className="bg-white rounded-xl border border-slate-200 px-2.5 py-2 mb-2 flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[220px] max-w-[420px]">
          <SearchBox value={filter.search} onChange={(v) => setF({ search: v })}
            placeholder="Search system, finding, action, PIC, remark, date..." />
        </div>
        <Filter className="w-3.5 h-3.5 text-slate-400" />
        <select className={SEL} value={filter.status} onChange={(e) => setF({ status: e.target.value })} title="Status">
          <option value="">All status</option>
          {[OPS_STATUS.OPEN, OPS_STATUS.ONGOING, OPS_STATUS.CLOSED].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={SEL} value={filter.system} onChange={(e) => setF({ system: e.target.value })} title="System / Package / Location">
          <option value="">All systems</option>
          {options.system.map((s) => <option key={s} value={s}>{s.replace(/\n/g, ' ')}</option>)}
        </select>
        <select className={SEL} value={filter.pic} onChange={(e) => setF({ pic: e.target.value })} title="PIC">
          <option value="">All PIC</option>
          {options.pic.map((s) => <option key={s} value={s}>{s.replace(/\n/g, ' ')}</option>)}
        </select>
        <select className={SEL} value={filter.raisedBy} onChange={(e) => setF({ raisedBy: e.target.value })} title="Raise By">
          <option value="">All raised by</option>
          {options.raisedBy.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {active && (
          <button type="button" onClick={() => setFilter(EMPTY_OPS_FILTER)}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-[12px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
        <span className="text-[12px] text-slate-500">
          {active ? `${indices.length} of ${items.length} shown` : `${items.length} findings`}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {toolbarExtra}
          {!readOnly && (
            <>
              <button type="button"
                onClick={() => api.addToSection(opsSections(items).slice(-1)[0], items.length - 1)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg">
                <Plus className="w-3.5 h-3.5" /> Add finding
              </button>
              <button type="button" onClick={() => setNewSection('')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg">
                <FolderPlus className="w-3.5 h-3.5" /> New section
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden" onChange={(e) => startImport(e.target.files?.[0])} />
              <button type="button" onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-2xs">
                <Upload className="w-3.5 h-3.5" /> Import Excel
              </button>
            </>
          )}
        </div>
      </div>

      {!readOnly && !isMobileMode && (
        <p className="text-[11px] text-slate-500 mb-1.5 px-1">
          Double-click a cell to edit · click a date or a status to change it · click a photo cell, then Ctrl+V to paste · row colour follows the Status.
        </p>
      )}

      <OpsFindingsTable
        groups={groups}
        readOnly={readOnly}
        isMobileMode={isMobileMode}
        editing={editing}
        selected={selected}
        api={api}
        emptyText={items.length ? 'No findings match the filter.' : 'No findings yet — add one, or import the Excel file.'}
      />

      <ConfirmModal
        isOpen={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        cancelLabel="Cancel"
        tone={confirm?.tone}
        onConfirm={() => confirm?.onYes?.()}
        onCancel={() => setConfirm(null)}
      />

      {/* New section */}
      {newSection !== null && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/65" onClick={() => setNewSection(null)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-bold text-slate-900 mb-1">New section</h3>
            <p className="text-[12.5px] text-slate-500 mb-3">A new group of findings, e.g. "B. Findings from Operations". A first empty finding is added under it.</p>
            <input autoFocus value={newSection} onChange={(e) => setNewSection(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newSection.trim()) { api.addToSection(newSection.trim(), items.length - 1); setNewSection(null); } }}
              placeholder="B. Findings from ..." className="w-full border border-slate-300 rounded-lg px-3 py-2 text-[13px] text-slate-900 outline-none focus:border-brand-500" />
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => setNewSection(null)} className="px-3 py-2 text-[13px] font-bold text-slate-700 bg-slate-100 rounded-lg">Cancel</button>
              <button type="button" disabled={!newSection.trim()}
                onClick={() => { api.addToSection(newSection.trim(), items.length - 1); setNewSection(null); }}
                className="px-3 py-2 text-[13px] font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-40">Add section</button>
            </div>
          </div>
        </div>
      )}

      {/* Import: reading / preview / error */}
      {importState && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/65">
          <div className="w-full max-w-2xl max-h-[88vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-200">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              <h3 className="flex-1 text-[15px] font-bold text-slate-900">Import findings from Excel</h3>
              {importState.phase !== 'reading' && (
                <button type="button" onClick={() => setImportState(null)} className="p-1 text-slate-500 hover:text-slate-900"><X className="w-4 h-4" /></button>
              )}
            </div>

            {importState.phase === 'reading' && (
              <div className="p-8 flex flex-col items-center gap-3 text-[13px] text-slate-700">
                <RefreshCw className="w-6 h-6 text-brand-600 animate-spin" />
                {importState.msg}
              </div>
            )}

            {importState.phase === 'error' && (
              <div className="p-6">
                <div className="flex items-start gap-2 text-[13px] text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-3">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{importState.msg}</span>
                </div>
                <div className="flex justify-end mt-4">
                  <button type="button" onClick={() => setImportState(null)} className="px-3 py-2 text-[13px] font-bold text-slate-700 bg-slate-100 rounded-lg">Close</button>
                </div>
              </div>
            )}

            {importState.phase === 'preview' && (() => {
              const { parsed, merged, fileName } = importState;
              const s = merged.stats;
              return (
                <>
                  <div className="px-5 py-4 overflow-y-auto">
                    <p className="text-[12.5px] text-slate-600 mb-3">
                      <b>{fileName}</b> · sheet “{parsed.sheetName}” · {parsed.rows.length} findings and {parsed.imageCount} photos read.
                      Rows are matched on <b>System (B) + Finding Description (C)</b>.
                    </p>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                        <div className="text-[10.5px] font-bold uppercase text-emerald-800">New findings</div>
                        <div className="text-[22px] font-extrabold text-emerald-700 tabular-nums">{s.added}</div>
                      </div>
                      <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
                        <div className="text-[10.5px] font-bold uppercase text-sky-800">Existing — empty cells filled</div>
                        <div className="text-[22px] font-extrabold text-sky-700 tabular-nums">{s.rowsFilled}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-[10.5px] font-bold uppercase text-slate-600">Already up to date</div>
                        <div className="text-[22px] font-extrabold text-slate-700 tabular-nums">{s.unchanged}</div>
                      </div>
                    </div>
                    <p className="text-[12px] text-slate-500 mb-2">
                      Existing rows keep everything already typed in the app — only EMPTY cells are filled from the file. Photos to add: {s.photosAdded}.
                    </p>
                    {s.addedRows.length > 0 && (
                      <div className="border border-slate-200 rounded-lg max-h-[36vh] overflow-y-auto">
                        {s.addedRows.map((r, i) => (
                          <div key={r.id} className="flex gap-2 px-3 py-1.5 text-[12px] border-b border-slate-100 last:border-0">
                            <span className="text-slate-400 tabular-nums w-6 text-right">{i + 1}</span>
                            <span className="font-semibold text-slate-800 w-[34%] truncate">{(r.system || '—').replace(/\n/g, ' ')}</span>
                            <span className="text-slate-600 flex-1 truncate">{r.description}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {parsed.warnings.length > 0 && (
                      <div className="mt-3 text-[12px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5 space-y-0.5">
                        {parsed.warnings.map((w, i) => <div key={i}>• {w}</div>)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
                    <button type="button" onClick={() => setImportState(null)} className="px-3 py-2 text-[13px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg">Cancel</button>
                    <button type="button" onClick={applyImport} disabled={!s.added && !s.rowsFilled}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-40">
                      <CheckCircle2 className="w-4 h-4" />
                      {s.added || s.rowsFilled ? 'Import' : 'Nothing to import'}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
