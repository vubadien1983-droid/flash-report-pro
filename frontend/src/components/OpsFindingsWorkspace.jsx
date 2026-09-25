import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardList, Upload, Plus, FolderPlus, X, RefreshCw, FileSpreadsheet, FileText,
  AlertTriangle, CheckCircle2, User, Calendar, MapPin, Filter, Lock, Unlock, Link2,
  LayoutDashboard, ChevronRight,
} from 'lucide-react';
import OpsFindingsTable from './OpsFindingsTable';
import OpsClosureChart from './OpsClosureChart';
import SearchBox from './SearchBox';
import ConfirmModal from './ConfirmModal';
import { TextCell, DateCell } from './PlanCell';
import {
  OPS_STATUS, OPS_STATUS_STYLE, OPS_DEFAULT_SECTION, EMPTY_OPS_FILTER,
  groupOpsSections, opsStats, filterOpsIndices, opsFilterActive, distinctValues,
  describeOpsFilter, makeOpsFinding, opsEditPatch, withColumnPhotos, opsSections,
  mergeOpsImport, replaceOpsFromImport, todayKeyLocal, formatOpsDate, opsRowHasContent,
  opsSectionSummary, sectionIndices, sectionLetter, nextSectionLetter,
} from '../services/opsFindings';

/**
 * OPS Findings & Action Tracking — the whole report surface, as TABS:
 *
 *   Summary | A. … | B. … | C. … | D. …
 *
 * - SUMMARY: the status of the whole report by section (a table with one line
 *   per section and a total), the overall figures, and a week-by-week chart of
 *   findings closed. It edits nothing, so it has NO password.
 * - ONE TAB PER SECTION: that section's own figures, filters and table. Each
 *   is read-only until ITS password is entered (services/opsAuth.js) — in the
 *   app and on the live link alike, the Mini Plan's model.
 *
 * Used in the app and on the share link (OpsFindingsViewer); both draw the
 * same thing. Every tab has Export Excel / PDF and a Link to itself.
 *
 * THE FIGURES COUNT THE WHOLE TAB; the filter narrows the table only — a
 * percentage that moved when someone typed in the search box would be a lie.
 */

const SEL = 'text-[12.5px] bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-900 outline-none focus:border-brand-500 max-w-[170px]';
const BTN = 'inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-bold rounded-lg border transition-colors';

function Tile({ label, value, sub, tone = 'text-slate-900', active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 min-w-[92px] text-left px-3 py-1.5 rounded-xl border transition-all ${
        active ? 'border-brand-500 ring-2 ring-brand-500/25 bg-brand-50/50' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-[20px] leading-tight font-extrabold tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 leading-tight">{sub}</div>}
    </button>
  );
}

function Progress({ stats }) {
  const t = stats.total || 0;
  return (
    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden flex">
      {t > 0 && (
        <>
          <div style={{ width: `${(stats.closed / t) * 100}%` }} className="bg-emerald-600" />
          <div style={{ width: `${(stats.ongoing / t) * 100}%` }} className="bg-amber-400" />
          <div style={{ width: `${(stats.open / t) * 100}%` }} className="bg-rose-500" />
        </>
      )}
    </div>
  );
}

/** "A. Findings from M&R Team" → short tab label "A · M&R Team". */
function tabLabel(section) {
  const L = sectionLetter(section);
  const rest = String(section || '').replace(/^\s*[A-Za-z]\s*[.)\-:]\s*/, '').replace(/^Findings\s+from\s+/i, '');
  return L ? `${L} · ${rest || section}` : section;
}

export default function OpsFindingsWorkspace({
  report,
  items,
  onItemsChange,
  onHeaderChange,          // (field, value) — omitted when the header is read-only
  onReportPatch,           // ({ items?, location?, ... }) — one write for an import
  readOnly = false,        // true = nothing on this surface may be edited
  isMobileMode = false,
  onPhotoClick,            // (entry, rowEntries, itemIndex)
  onPhotoRemoved,          // (item, photo)
  onAttachFile,            // async (item, itemIndex, file, slot) => descriptor | null
  onOpenAttachment,        // (photo, item, itemIndex)
  onViewChange,            // ({ tab, section, filter, indices, label, active })
  notify,                  // (message, type)
  isUnlocked = () => true, // (letter) => boolean
  onRequestUnlock,         // (letter, sectionTitle) => void
  onLockSection,           // (letter) => void
  onExport,                // ('xlsx' | 'pdf', view) => void
  onTabLink,               // (tabKey) => void — share / copy the link that opens this tab
  canImport = false,       // app only: Import Excel + New section on the Summary tab
  initialTab = '',
  fullScreen = false,
}) {
  const storeKey = `fr_ops_${report?.id || 'shared'}`;
  const sections = useMemo(() => opsSections(items), [items]);
  const summary = useMemo(() => opsSectionSummary(items), [items]);

  // ── Tab (the USER'S state: survives a remount, BUG-026) ─────────
  const [tab, setTabState] = useState(() => {
    if (initialTab) return initialTab;
    try { return sessionStorage.getItem(`${storeKey}_tab`) || 'summary'; } catch { return 'summary'; }
  });
  const setTab = (t) => {
    setTabState(t);
    try { sessionStorage.setItem(`${storeKey}_tab`, t); } catch { /* ignore */ }
  };
  // A tab is addressed by its section LETTER when it has one (stable across a
  // rename), otherwise by its title.
  const keyOf = (section) => sectionLetter(section) || section;
  const activeSection = tab === 'summary' ? '' : (sections.find((s) => keyOf(s) === tab) || '');
  useEffect(() => { if (tab !== 'summary' && !activeSection && sections.length) setTab('summary'); }, [tab, activeSection, sections.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const letter = sectionLetter(activeSection);
  const tabLocked = readOnly || (activeSection ? (letter ? !isUnlocked(letter) : false) : true);

  // ── Filter, per tab ─────────────────────────────────────────────
  const [filters, setFilters] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(`${storeKey}_filters`) || '{}'); } catch { return {}; }
  });
  useEffect(() => { try { sessionStorage.setItem(`${storeKey}_filters`, JSON.stringify(filters)); } catch { /* ignore */ } }, [filters, storeKey]);
  const filter = { ...EMPTY_OPS_FILTER, ...(filters[tab] || {}) };
  const setF = (patch) => setFilters((all) => ({ ...all, [tab]: { ...EMPTY_OPS_FILTER, ...(all[tab] || {}), ...patch } }));
  const clearF = () => setFilters((all) => ({ ...all, [tab]: EMPTY_OPS_FILTER }));

  const [editing, setEditing] = useState(null);     // { id, field }
  const [selected, setSelected] = useState(null);   // { id, col }
  const [confirm, setConfirm] = useState(null);
  const [newSection, setNewSection] = useState(null);
  const [headerEdit, setHeaderEdit] = useState(null);
  useEffect(() => { setEditing(null); setSelected(null); }, [tab]);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const tabRows = useMemo(() => sectionIndices(items, activeSection), [items, activeSection]);
  const tabItems = useMemo(() => tabRows.map((i) => items[i]), [items, tabRows]);
  const stats = useMemo(() => opsStats(tabItems), [tabItems]);
  const indices = useMemo(() => {
    const keep = new Set(filterOpsIndices(items, filter));
    return tabRows.filter((i) => keep.has(i));
  }, [items, tabRows, filters, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Freeze the visible rows while a cell is open (the row being typed into
  // must not slide away when its own edit stops matching the filter).
  const frozen = useRef(indices);
  if (!editing) frozen.current = indices;
  const shown = editing ? frozen.current : indices;
  const groups = useMemo(() => groupOpsSections(items, shown), [items, shown]);
  const active = opsFilterActive(filter);

  useEffect(() => {
    onViewChange?.({
      tab, section: activeSection, filter,
      indices: active ? indices : tabRows,
      label: [activeSection, describeOpsFilter(filter)].filter(Boolean).join(' — '),
      active: Boolean(activeSection) || active,
    });
  }, [tab, activeSection, indices, tabRows, active]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = useMemo(() => ({
    system: distinctValues(tabItems, 'system'),
    pic: distinctValues(tabItems, 'pic'),
    raisedBy: distinctValues(tabItems, 'raised_by'),
  }), [tabItems]);

  // ── Editing API handed to the table ───────────────────────────
  const lockedRef = useRef(tabLocked);
  lockedRef.current = tabLocked;
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
    beginEdit: (id, field) => {
      if (lockedRef.current) { onRequestUnlock?.(letter, activeSection); return; }
      setEditing({ id, field });
    },
    cancel: () => setEditing(null),
    commit: (id, field, value) => {
      setEditing(null);
      if (lockedRef.current) return;
      updateById(id, (cur) => {
        if ((cur[field] ?? '') === (value ?? '')) return null;
        return opsEditPatch(cur, field, value, todayKeyLocal());
      });
    },
    select: (id, col) => setSelected({ id, col }),
    setColumnPhotos: (id, col, list) => {
      if (lockedRef.current) return;
      updateById(id, (cur) => ({ photos: withColumnPhotos(cur, col, list), updated_date: todayKeyLocal() }));
    },
    onPhotoClick,
    onPhotoRemoved,
    onAttachFile,
    onOpenAttachment,
    insertBelow: (index) => {
      if (lockedRef.current) return;
      const cur = itemsRef.current;
      const base = cur[index];
      const row = makeOpsFinding(base?.section || OPS_DEFAULT_SECTION, {
        system: base?.system || '', open_date: todayKeyLocal(), updated_date: todayKeyLocal(),
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
      if (lockedRef.current) return;
      const set = new Set(rowIndices);
      write(itemsRef.current.map((it, i) => (set.has(i) ? { ...it, section: name } : it)));
    },
    askDelete: (index) => {
      if (lockedRef.current) return;
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
  }), [readOnly, letter, activeSection, onPhotoClick, onPhotoRemoved, onAttachFile, onOpenAttachment, onRequestUnlock]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Import (app only, Summary tab) ─────────────────────────────
  const fileRef = useRef(null);
  const [importState, setImportState] = useState(null);

  const startImport = async (file) => {
    if (!file) return;
    setImportState({ phase: 'reading', msg: 'Reading the workbook…' });
    try {
      const { parseOpsWorkbook } = await import('../services/opsFindingsImport');
      const parsed = await parseOpsWorkbook(file, { onProgress: (msg) => setImportState({ phase: 'reading', msg }) });
      // A brand-new report starts with one blank finding; it must not stay
      // on top of an import as an empty row 1.
      const cur = itemsRef.current;
      const base = cur.some(opsRowHasContent) ? cur : [];
      const merged = mergeOpsImport(base, parsed.rows);
      const exact = replaceOpsFromImport(base, parsed.rows);
      setImportState({ phase: 'preview', parsed, merged, exact, mode: 'exact', fileName: file.name });
    } catch (e) {
      console.error('Import failed:', e);
      setImportState({ phase: 'error', msg: e.message || String(e) });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const applyImport = () => {
    if (importState?.phase !== 'preview') return;
    const { merged, exact, parsed, mode } = importState;
    const m = parsed.meta || {};
    if (mode === 'exact') {
      // The report becomes the file: one write, then the old pictures' bytes
      // (and those of removed rows) are deleted from both cloud copies.
      const patch = { items: exact.items };
      if (!report?.location && m.subtitle) patch.location = m.subtitle;
      if (!report?.system_tag && m.updatedBy) patch.system_tag = m.updatedBy;
      if (onReportPatch) onReportPatch(patch); else write(exact.items);
      for (const d of exact.dropped) { try { onPhotoRemoved?.(d.item, d.photo); } catch { /* cleanup only */ } }
      const x = exact.stats;
      notify?.(`Report now matches the file: ${x.rows} findings, ${x.photos} photo(s)` + (x.added ? `, ${x.added} added` : '') + (x.removed ? `, ${x.removed} removed` : '') + '.', 'success');
      setImportState(null);
      return;
    }
    const patch = { items: merged.items };
    if (!report?.location && m.subtitle) patch.location = m.subtitle;
    if (!report?.system_tag && m.updatedBy) patch.system_tag = m.updatedBy;
    if (onReportPatch) onReportPatch(patch);
    else write(merged.items);
    const s = merged.stats;
    notify?.(`Import done: ${s.added} new finding(s), ${s.rowsFilled} existing row(s) completed, ${s.photosAdded} photo(s).`, 'success');
    setImportState(null);
  };

  const addSection = (title) => {
    const L = nextSectionLetter(itemsRef.current);
    const clean = String(title || '').trim();
    const name = sectionLetter(clean) ? clean : `${L}. ${clean}`;
    api.addToSection(name, itemsRef.current.length - 1);
    setTab(keyOf(name));
    notify?.(`Section "${name}" added — its password follows the CPP-OPS-<letter> rule`, 'success');
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

  const view = {
    tab, section: activeSection, filter,
    indices: active ? indices : tabRows,
    label: [activeSection, describeOpsFilter(filter)].filter(Boolean).join(' — '),
    active: Boolean(activeSection) || active,
  };
  const exportBar = (
    <>
      {onExport && (
        <>
          <button type="button" onClick={() => onExport('xlsx', view)}
            className={`${BTN} text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200`}
            title={activeSection ? `Excel of ${activeSection}` : 'Excel of the whole report: Summary sheet + one sheet per section'}>
            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
          </button>
          <button type="button" onClick={() => onExport('pdf', view)}
            className={`${BTN} text-brand-700 bg-brand-50 hover:bg-brand-100 border-brand-200`}>
            <FileText className="w-3.5 h-3.5" /> PDF
          </button>
        </>
      )}
      {onTabLink && (
        <button type="button" onClick={() => onTabLink(tab)}
          className={`${BTN} text-sky-700 bg-sky-50 hover:bg-sky-100 border-sky-200`}
          title="The live link that opens on this tab">
          <Link2 className="w-3.5 h-3.5" /> Link
        </button>
      )}
    </>
  );

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className={`w-full ${fullScreen ? 'h-full flex flex-col min-h-0' : ''}`}>
      {/* Header — title, area, updated by / date. */}
      <div className="w-full bg-white rounded-xl shadow-xs border border-slate-200/80 px-3 py-1.5 mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <ClipboardList className="w-4 h-4 text-brand-600 flex-shrink-0" />
        <div className="flex-1 min-w-[220px]">
          {headerField('title', report?.title, { placeholder: 'Report title', cls: 'text-[15px] font-extrabold text-slate-900' })}
        </div>
        <div className="min-w-[160px]">{headerField('location', report?.location, { placeholder: 'Area (e.g. CPP/LQ/Flare Tower)', icon: MapPin })}</div>
        <div className="min-w-[150px]">{headerField('system_tag', report?.system_tag, { placeholder: 'Updated by', icon: User })}</div>
        <div className="min-w-[130px]">{headerField('inspection_date', report?.inspection_date, { placeholder: 'Updated date', icon: Calendar, date: true })}</div>
      </div>

      {/* Tabs */}
      <div className="flex items-end gap-1 overflow-x-auto border-b border-slate-300 mb-2 px-0.5">
        <button type="button" onClick={() => setTab('summary')}
          className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-bold rounded-t-lg border border-b-0 ${
            tab === 'summary' ? 'bg-white text-brand-700 border-slate-300 -mb-px' : 'bg-slate-50 text-slate-600 border-transparent hover:bg-white'}`}>
          <LayoutDashboard className="w-3.5 h-3.5" /> Summary
        </button>
        {summary.map((s) => {
          const k = keyOf(s.section);
          const open = s.letter ? isUnlocked(s.letter) && !readOnly : !readOnly;
          const on = tab === k;
          return (
            <button key={s.section} type="button" onClick={() => setTab(k)} title={s.section}
              className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-bold rounded-t-lg border border-b-0 max-w-[260px] ${
                on ? 'bg-white text-slate-900 border-slate-300 -mb-px' : 'bg-slate-50 text-slate-600 border-transparent hover:bg-white'}`}>
              {open ? <Unlock className="w-3 h-3 text-emerald-600" /> : <Lock className="w-3 h-3 text-slate-400" />}
              <span className="truncate">{tabLabel(s.section)}</span>
              <span className={`px-1.5 rounded-full text-[10.5px] ${s.stats.open ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {s.stats.total - s.stats.closed}/{s.stats.total}
              </span>
            </button>
          );
        })}
      </div>

      {tab === 'summary' ? (
        /* ── SUMMARY ─────────────────────────────────────────── */
        <div className={`space-y-2 ${fullScreen ? 'flex-1 min-h-0 overflow-y-auto' : ''}`}>
          {(() => {
            const all = opsStats(items);
            return (
              <div className="flex flex-wrap gap-2">
                <Tile label="Total findings" value={all.total} />
                <Tile label="Open" value={all.open} tone={OPS_STATUS_STYLE[OPS_STATUS.OPEN].tile} sub={all.total ? `${Math.round((all.open / all.total) * 100)}%` : ''} />
                <Tile label="On-going" value={all.ongoing} tone={OPS_STATUS_STYLE[OPS_STATUS.ONGOING].tile} sub={all.total ? `${Math.round((all.ongoing / all.total) * 100)}%` : ''} />
                <Tile label="Closed" value={all.closed} tone={OPS_STATUS_STYLE[OPS_STATUS.CLOSED].tile} sub={all.total ? `${Math.round((all.closed / all.total) * 100)}%` : ''} />
                <div className="flex-[1.4] min-w-[170px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Close-out progress</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[20px] leading-tight font-extrabold tabular-nums text-emerald-700">{all.percentClosed}%</span>
                    <span className="text-[11px] text-slate-500">{all.closed} of {all.total} closed</span>
                  </div>
                  <Progress stats={all} />
                </div>
              </div>
            );
          })()}

          <div className="bg-white rounded-xl border border-slate-200 px-2.5 py-2 flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-bold text-slate-800">Status by section</span>
            <span className="text-[11.5px] text-slate-500">— click a section to open its tab</span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {exportBar}
              {canImport && !readOnly && (
                <>
                  <button type="button" onClick={() => setNewSection('')}
                    className={`${BTN} text-slate-700 bg-slate-50 hover:bg-slate-100 border-slate-200`}>
                    <FolderPlus className="w-3.5 h-3.5" /> New section
                  </button>
                  <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden" onChange={(e) => startImport(e.target.files?.[0])} />
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className={`${BTN} text-white bg-emerald-600 hover:bg-emerald-700 border-emerald-700`}>
                    <Upload className="w-3.5 h-3.5" /> Import Excel
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-left border-separate border-spacing-0 min-w-[640px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-white">
                  {['Section', 'Total', 'Open', 'On-going', 'Closed', '% closed', ''].map((h, i) => (
                    <th key={h || i} className={`bg-[#1F3A5F] px-3 py-2 font-bold ${i ? 'text-center' : ''} ${i === 5 ? 'w-[26%]' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.section} onClick={() => setTab(keyOf(s.section))}
                    className="cursor-pointer hover:bg-brand-50/60 text-[13px] text-slate-900">
                    <td className="px-3 py-2 border-b border-slate-100 font-bold">
                      <span className="inline-flex items-center gap-1.5">
                        {s.letter && isUnlocked(s.letter) && !readOnly ? <Unlock className="w-3 h-3 text-emerald-600" /> : <Lock className="w-3 h-3 text-slate-400" />}
                        {s.section}
                      </span>
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100 text-center tabular-nums font-bold">{s.stats.total}</td>
                    <td className="px-3 py-2 border-b border-slate-100 text-center tabular-nums font-bold text-rose-700">{s.stats.open}</td>
                    <td className="px-3 py-2 border-b border-slate-100 text-center tabular-nums font-bold text-amber-700">{s.stats.ongoing}</td>
                    <td className="px-3 py-2 border-b border-slate-100 text-center tabular-nums font-bold text-emerald-700">{s.stats.closed}</td>
                    <td className="px-3 py-2 border-b border-slate-100">
                      <div className="flex items-center gap-2"><span className="w-9 text-right tabular-nums font-bold text-[12px]">{s.stats.percentClosed}%</span><Progress stats={s.stats} /></div>
                    </td>
                    <td className="px-2 py-2 border-b border-slate-100 text-slate-400"><ChevronRight className="w-4 h-4" /></td>
                  </tr>
                ))}
                {(() => {
                  const all = opsStats(items);
                  return (
                    <tr className="bg-slate-50 text-[13px] font-extrabold text-slate-900">
                      <td className="px-3 py-2">Total</td>
                      <td className="px-3 py-2 text-center tabular-nums">{all.total}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-rose-700">{all.open}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-amber-700">{all.ongoing}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-emerald-700">{all.closed}</td>
                      <td className="px-3 py-2"><div className="flex items-center gap-2"><span className="w-9 text-right tabular-nums text-[12px]">{all.percentClosed}%</span><Progress stats={all} /></div></td>
                      <td />
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 px-3 py-2">
            <div className="text-[12.5px] font-bold text-slate-800 mb-1">Findings closed over time (by week)</div>
            <OpsClosureChart items={items} />
          </div>
        </div>
      ) : (
        /* ── ONE SECTION ─────────────────────────────────────── */
        <div className={fullScreen ? 'flex-1 min-h-0 flex flex-col' : ''}>
          <div className="flex flex-wrap gap-2 mb-2">
            <Tile label={letter ? `Section ${letter} total` : 'Total'} value={stats.total} active={!filter.status && !active} onClick={() => setF({ status: '' })} />
            {[OPS_STATUS.OPEN, OPS_STATUS.ONGOING, OPS_STATUS.CLOSED].map((st) => {
              const v = st === OPS_STATUS.OPEN ? stats.open : st === OPS_STATUS.ONGOING ? stats.ongoing : stats.closed;
              return (
                <Tile key={st} label={st} value={v} tone={OPS_STATUS_STYLE[st].tile}
                  sub={stats.total ? `${Math.round((v / stats.total) * 100)}%` : ''}
                  active={filter.status === st} onClick={() => setF({ status: filter.status === st ? '' : st })} />
              );
            })}
            <div className="flex-[1.4] min-w-[170px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Close-out progress</div>
              <div className="flex items-baseline gap-2">
                <span className="text-[20px] leading-tight font-extrabold tabular-nums text-emerald-700">{stats.percentClosed}%</span>
                <span className="text-[11px] text-slate-500">{stats.closed} of {stats.total} closed</span>
              </div>
              <Progress stats={stats} />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 px-2.5 py-2 mb-2 flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-[200px] max-w-[380px]">
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
              <button type="button" onClick={clearF} className={`${BTN} text-slate-700 bg-slate-100 hover:bg-slate-200 border-slate-200`}>
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            )}
            <span className="text-[12px] text-slate-500">{active ? `${indices.length} of ${tabRows.length} shown` : `${tabRows.length} findings`}</span>

            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {exportBar}
              {tabLocked ? (
                !readOnly && letter && (
                  <button type="button" onClick={() => onRequestUnlock?.(letter, activeSection)}
                    className={`${BTN} text-amber-800 bg-amber-50 hover:bg-amber-100 border-amber-300`}
                    title={`Enter the password of section ${letter} to edit this tab`}>
                    <Lock className="w-3.5 h-3.5" /> Unlock to edit
                  </button>
                )
              ) : (
                <>
                  <button type="button" onClick={() => api.addToSection(activeSection, tabRows[tabRows.length - 1])}
                    className={`${BTN} text-brand-700 bg-brand-50 hover:bg-brand-100 border-brand-200`}>
                    <Plus className="w-3.5 h-3.5" /> Add finding
                  </button>
                  {letter && onLockSection && (
                    <button type="button" onClick={() => onLockSection(letter)}
                      className={`${BTN} text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-300`}
                      title="Lock this tab again">
                      <Unlock className="w-3.5 h-3.5" /> Lock
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {!tabLocked && !isMobileMode && (
            <p className="text-[11px] text-slate-500 mb-1.5 px-1">
              Double-click a cell to edit · click a date or a status to change it · click a photo cell, then Ctrl+V to paste · row colour follows the Status.
            </p>
          )}

          <div className={fullScreen ? 'flex-1 min-h-0' : ''}>
            <OpsFindingsTable
              groups={groups}
              readOnly={tabLocked}
              isMobileMode={isMobileMode}
              editing={editing}
              selected={selected}
              api={api}
              showSections={false}
              emptyText={tabRows.length ? 'No findings match the filter.' : 'No findings in this section yet.'}
            />
          </div>
        </div>
      )}

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

      {newSection !== null && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/65" onClick={() => setNewSection(null)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-bold text-slate-900 mb-1">New section</h3>
            <p className="text-[12.5px] text-slate-500 mb-3">
              It becomes a new tab, lettered {nextSectionLetter(items)}. A first empty finding is added under it.
            </p>
            <input autoFocus value={newSection} onChange={(e) => setNewSection(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newSection.trim()) { addSection(newSection); setNewSection(null); } }}
              placeholder={`${nextSectionLetter(items)}. Findings from ...`} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-[13px] text-slate-900 outline-none focus:border-brand-500" />
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => setNewSection(null)} className="px-3 py-2 text-[13px] font-bold text-slate-700 bg-slate-100 rounded-lg">Cancel</button>
              <button type="button" disabled={!newSection.trim()}
                onClick={() => { addSection(newSection); setNewSection(null); }}
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
              const { parsed, merged, exact, fileName, mode } = importState;
              const s = merged.stats;
              const x = exact.stats;
              const setMode = (m) => setImportState((st) => ({ ...st, mode: m }));
              const list = mode === 'exact' ? x.addedRows : s.addedRows;
              const can = mode === 'exact' ? x.rows > 0 : (s.added || s.rowsFilled);
              return (
                <>
                  <div className="px-5 py-4 overflow-y-auto">
                    <p className="text-[12.5px] text-slate-600 mb-3">
                      <b>{fileName}</b> · sheet “{parsed.sheetName}” · {parsed.rows.length} findings and {parsed.imageCount} photos read
                      (only pictures visible in Excel — pictures hidden underneath another one are skipped).
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                      <button type="button" onClick={() => setMode('exact')}
                        className={`text-left rounded-xl border px-3 py-2 ${mode === 'exact' ? 'border-emerald-500 ring-2 ring-emerald-500/25 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                        <div className="text-[12.5px] font-bold text-slate-900">Exact copy of the file (recommended)</div>
                        <div className="text-[11.5px] text-slate-600 leading-snug">Every row, section, column A–N and photo becomes exactly what the file has. Column O close-out references already in the app are kept.</div>
                      </button>
                      <button type="button" onClick={() => setMode('fill')}
                        className={`text-left rounded-xl border px-3 py-2 ${mode === 'fill' ? 'border-sky-500 ring-2 ring-sky-500/25 bg-sky-50' : 'border-slate-200 bg-white'}`}>
                        <div className="text-[12.5px] font-bold text-slate-900">Add new rows, fill empty cells</div>
                        <div className="text-[11.5px] text-slate-600 leading-snug">Keeps everything already in the app; only adds new findings and fills empty cells.</div>
                      </button>
                    </div>
                    {mode === 'exact' ? (
                      <div className="grid grid-cols-4 gap-2 mb-3">
                        {[
                          ['Findings after import', x.rows, 'border-emerald-200 bg-emerald-50', 'text-emerald-800', 'text-emerald-700'],
                          ['New rows', x.added, 'border-sky-200 bg-sky-50', 'text-sky-800', 'text-sky-700'],
                          ['Cells changed', x.changedCells, 'border-amber-200 bg-amber-50', 'text-amber-800', 'text-amber-700'],
                          ['Rows removed', x.removed, 'border-rose-200 bg-rose-50', 'text-rose-800', 'text-rose-700'],
                        ].map(([l, v, box, lab, num]) => (
                          <div key={l} className={`rounded-xl border px-3 py-2 ${box}`}>
                            <div className={`text-[10px] font-bold uppercase ${lab}`}>{l}</div>
                            <div className={`text-[20px] font-extrabold tabular-nums ${num}`}>{v}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
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
                    )}
                    {mode === 'exact' && x.removedRows.length > 0 && (
                      <div className="mb-2 text-[12px] text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                        <b>These rows are not in the file and will be removed:</b>
                        {x.removedRows.map((r) => <div key={r.id}>• {sectionLetter(r.section) || ''} {(r.system || '—').replace(/\n/g, ' ')} — {String(r.description || '').slice(0, 90)}</div>)}
                      </div>
                    )}
                    {list.length > 0 && (
                      <>
                        <div className="text-[12px] font-bold text-slate-700 mb-1">New rows</div>
                        <div className="border border-slate-200 rounded-lg max-h-[30vh] overflow-y-auto">
                          {list.map((r, i) => (
                            <div key={r.id} className="flex gap-2 px-3 py-1.5 text-[12px] border-b border-slate-100 last:border-0">
                              <span className="text-slate-400 tabular-nums w-6 text-right">{i + 1}</span>
                              <span className="w-5 text-center text-[10.5px] font-bold rounded bg-slate-100 text-slate-600">{sectionLetter(r.section) || '·'}</span>
                              <span className="font-semibold text-slate-800 w-[32%] truncate">{(r.system || '—').replace(/\n/g, ' ')}</span>
                              <span className="text-slate-600 flex-1 truncate">{r.description}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    {parsed.warnings.length > 0 && (
                      <div className="mt-3 text-[12px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5 space-y-0.5">
                        {parsed.warnings.map((w, i) => <div key={i}>• {w}</div>)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
                    <button type="button" onClick={() => setImportState(null)} className="px-3 py-2 text-[13px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg">Cancel</button>
                    <button type="button" onClick={applyImport} disabled={!can}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-40">
                      <CheckCircle2 className="w-4 h-4" />
                      {can ? (mode === 'exact' ? 'Replace with the file' : 'Import') : 'Nothing to import'}
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
