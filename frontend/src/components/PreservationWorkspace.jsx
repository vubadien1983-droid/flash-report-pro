import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ShieldCheck, Plus, X, FileSpreadsheet, FileText, User, Calendar, MapPin, Filter, Lock, Unlock,
  Link2, LayoutDashboard, ListChecks, AlertTriangle, ChevronRight, Database,
} from 'lucide-react';
import PreservationTable from './PreservationTable';
import PreservationForm from './PreservationForm';
import { StatusDonut, StackedStatusBars, StatusLegend } from './PreservationCharts';
import OpsClosureChart from './OpsClosureChart';
import SearchBox from './SearchBox';
import ConfirmModal from './ConfirmModal';
import { TextCell, DateCell } from './PlanCell';
import {
  PF_STATUS, PF_STATUS_STYLE, EMPTY_PF_FILTER, PF_OVERDUE_OPTIONS, PF_DEFAULT_OVERDUE_DAYS, PF_BLANK, PF_NY_CLARIFY,
  pfSummary, pfBreakdown, pfRowNumbers, filterPfIndices, pfFilterActive, describePfFilter, pfDistinct,
  pfFindingIndices, pfFindings, pfEditPatch, todayKeyLocal, formatPfDate, pfLearnedRows,
  seedToRows, buildLookup, learnedRowFor, withLearned,
} from '../services/preservationFindings';

/**
 * Preservation Findings and Tracking — the whole report surface, two TABS over
 * one document and ONE filter (the Mini Plan's rule: a selection made on the
 * Summary must leave the Findings tab showing the same work):
 *
 *   Summary  — the state of every finding: totals, open / closed, overdue,
 *              by Action By / Facility / Discipline, and closed over time.
 *              Edits nothing. Clicking a figure opens Findings filtered by it.
 *   Findings — the table (A–Q), Add finding, search and filters.
 *
 * THE FIGURES COUNT EVERY FINDING; the filter narrows the table only — a
 * percentage that moved when someone typed in the search box would be a lie.
 *
 * Used in the app (always editable, the owner's app) and on the share link
 * (`locked` until the team password is entered — reading is never locked).
 */

const SEL = 'text-[12.5px] bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-900 outline-none focus:border-brand-500 max-w-[160px]';
const BTN = 'inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-bold rounded-lg border transition-colors';

function Tile({ label, value, sub, tone = 'text-slate-900', active, onClick, icon: Icon }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex-1 min-w-[118px] text-left rounded-xl border px-3 py-1.5 transition-all ${
        active ? 'border-brand-500 ring-2 ring-brand-500/25 bg-brand-50/50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {Icon && <Icon className="w-3 h-3" />}{label}
      </div>
      <div className={`text-[22px] leading-tight font-extrabold tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="text-[10.5px] text-slate-500 leading-tight">{sub}</div>}
    </button>
  );
}

function Progress({ stats }) {
  const t = stats.total || 0;
  return (
    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden flex gap-[2px]">
      {t > 0 && (
        <>
          {stats.closed > 0 && <div style={{ width: `${(stats.closed / t) * 100}%` }} className="bg-emerald-600" />}
          {stats.ongoing > 0 && <div style={{ width: `${(stats.ongoing / t) * 100}%` }} className="bg-amber-400" />}
          {stats.open > 0 && <div style={{ width: `${(stats.open / t) * 100}%` }} className="bg-rose-500" />}
        </>
      )}
    </div>
  );
}

function Card({ title, sub, children, right }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-3 py-2.5 min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-[12.5px] font-bold text-slate-800">{title}</div>
          {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
        </div>
        <div className="ml-auto">{right}</div>
      </div>
      {children}
    </div>
  );
}

export default function PreservationWorkspace({
  report,
  items,
  onItemsChange,
  onHeaderChange,          // (field, value) — omitted when the header is read-only
  locked = false,          // share link: true until the team password is entered
  onRequestUnlock,         // (then?) => void
  onLock,                  // share link: lock again
  isMobileMode = false,
  onPhotoClick,            // (entry, rowEntries, itemIndex)
  onPhotoRemoved,          // (item, photo)
  onAttachFile,            // async (item, itemIndex, file, slot) => descriptor | null
  onOpenAttachment,        // (photo, item, itemIndex)
  onViewChange,            // ({ tab, filter, indices, label, active, overdueDays })
  onExport,                // ('xlsx' | 'pdf', view) => void
  onTabLink,               // (tab) => void
  notify,
  headerBadge = null,      // share link: Live / Saving… beside the title
  headerExtra = null,      // share link: password box + view / Sync / Save — ONE header row (v3.31.3)
  initialTab = '',
  fullScreen = false,
}) {
  const storeKey = `fr_pf_${report?.id || 'shared'}`;
  const readStore = (k, fallback) => { try { const v = sessionStorage.getItem(`${storeKey}_${k}`); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } };
  const writeStore = (k, v) => { try { sessionStorage.setItem(`${storeKey}_${k}`, JSON.stringify(v)); } catch { /* ignore */ } };

  // ── The USER'S view state (survives a remount, BUG-026) ─────────
  const [tab, setTabState] = useState(() => (initialTab === 'findings' || initialTab === 'summary' ? initialTab : readStore('tab', 'summary')));
  const setTab = (t) => { setTabState(t); writeStore('tab', t); };
  const [filter, setFilterState] = useState(() => ({ ...EMPTY_PF_FILTER, ...readStore('filter', {}) }));
  const setFilter = (next) => { setFilterState(next); writeStore('filter', next); };
  const setF = (patch) => setFilter({ ...filter, ...patch });
  const clearF = () => setFilter(EMPTY_PF_FILTER);
  const [overdueDays, setOverdueState] = useState(() => Number(readStore('overdue', PF_DEFAULT_OVERDUE_DAYS)) || PF_DEFAULT_OVERDUE_DAYS);
  const setOverdueDays = (d) => { setOverdueState(d); writeStore('overdue', d); };

  const [editing, setEditing] = useState(null);     // { id, field }
  const [selected, setSelected] = useState(null);   // item id
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState(null);           // { initial } | null
  const [headerEdit, setHeaderEdit] = useState(null);
  useEffect(() => { setEditing(null); }, [tab]);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  const today = todayKeyLocal();
  const all = useMemo(() => pfSummary(items, { overdueDays, today }), [items, overdueDays, today]);
  const byActionBy = useMemo(() => pfBreakdown(items, 'action_by', { overdueDays, today }), [items, overdueDays, today]);
  const byFacility = useMemo(() => pfBreakdown(items, 'facility', { overdueDays, today }), [items, overdueDays, today]);
  const byDiscipline = useMemo(() => pfBreakdown(items, 'discipline', { overdueDays, today }), [items, overdueDays, today]);
  const findings = useMemo(() => pfFindings(items), [items]);
  const learnedCount = useMemo(() => pfLearnedRows(items).length, [items]);
  const numbers = useMemo(() => pfRowNumbers(items), [items]);
  const allIdx = useMemo(() => pfFindingIndices(items), [items]);

  const active = pfFilterActive(filter);
  const indices = useMemo(() => filterPfIndices(items, filter, { overdueDays, today }), [items, filter, overdueDays, today]);
  // Freeze the visible rows while a cell is open (BUG-024 / the OPS rule).
  const frozen = useRef(indices);
  if (!editing) frozen.current = indices;
  const shown = editing ? frozen.current : indices;
  const rows = useMemo(() => shown.filter((i) => items[i]).map((i) => ({ item: items[i], index: i, no: numbers[i] })), [shown, items, numbers]);

  const label = describePfFilter(filter, overdueDays);
  const view = { tab, filter, indices: active ? indices : allIdx, label, active, overdueDays };
  useEffect(() => { onViewChange?.(view); }, [tab, indices, allIdx, active, label, overdueDays]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = useMemo(() => {
    const blank = (f) => findings.some((it) => !String(it?.[f] ?? '').trim());
    return {
      facility: pfDistinct(items, 'facility'), discipline: pfDistinct(items, 'discipline'),
      subsystem: pfDistinct(items, 'subsystem'), checksheet: pfDistinct(items, 'checksheet_type'),
      actionBy: pfDistinct(items, 'action_by'),
      blank: { facility: blank('facility'), discipline: blank('discipline'), subsystem: blank('subsystem'), checksheet: blank('checksheet_type'), actionBy: blank('action_by') },
    };
  }, [items, findings]);

  // From the Summary: filter, then show the findings.
  const drill = (patch) => { setFilter({ ...EMPTY_PF_FILTER, ...patch }); setTab('findings'); };

  // ── Editing ───────────────────────────────────────────────────
  const write = (next) => { if (!lockedRef.current) onItemsChange(next); };
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

  const askUnlock = (then) => onRequestUnlock?.(then);

  const api = useMemo(() => ({
    beginEdit: (id, field) => {
      if (lockedRef.current) { askUnlock(); return; }
      setEditing({ id, field });
    },
    cancel: () => setEditing(null),
    commit: (id, field, value) => {
      setEditing(null);
      if (lockedRef.current) return;
      updateById(id, (cur) => ((cur[field] ?? '') === (value ?? '') ? null : pfEditPatch(cur, field, value, todayKeyLocal())));
    },
    select: (id) => setSelected(id),
    setPhotos: (id, list) => {
      if (lockedRef.current) return;
      updateById(id, () => ({ photos: (list || []).filter(Boolean), updated_date: todayKeyLocal() }));
    },
    openForm: (index) => {
      if (lockedRef.current) { askUnlock(() => setForm({ initial: itemsRef.current[index] })); return; }
      setForm({ initial: itemsRef.current[index] });
    },
    askDelete: (index) => {
      if (lockedRef.current) return;
      const it = itemsRef.current[index];
      if (!it) return;
      const what = [it.tag_no, it.checksheet_type, it.issue].filter(Boolean).join(' — ').slice(0, 160) || 'this empty finding';
      setConfirm({
        title: 'Delete this finding?',
        message: `"${what}" will be removed from the report, with its references (pictures and documents). The tag stays in the database.`,
        confirmLabel: 'Yes, delete', tone: 'danger',
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
    onPhotoClick, onPhotoRemoved, onAttachFile, onOpenAttachment,
  }), [onPhotoClick, onPhotoRemoved, onAttachFile, onOpenAttachment, onRequestUnlock]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAdd = () => {
    if (lockedRef.current) { askUnlock(() => setForm({ initial: null })); return; }
    setForm({ initial: null });
  };

  // The form's save: the finding, plus the database row it teaches (if any).
  const seedRef = useRef(null);
  const saveFinding = async (finding, { keepOpen }) => {
    if (lockedRef.current) return;
    if (!seedRef.current) {
      const m = await import('../services/preservationDb');
      seedRef.current = seedToRows(m.PRESERVATION_DB_ROWS);
    }
    const cur = itemsRef.current;
    const lookup = buildLookup(seedRef.current, cur);
    const learned = learnedRowFor(lookup, finding);
    const i = cur.findIndex((x) => x.id === finding.id);
    let next;
    if (i >= 0) { next = cur.slice(); next[i] = { ...cur[i], ...finding }; }
    else next = [...cur, finding];
    next = withLearned(next, learned);
    write(next);
    if (i < 0 && active) {
      // A new finding the filter would hide is still shown: clear the filter.
      const keep = filterPfIndices(next, filter, { overdueDays, today: todayKeyLocal() });
      if (!keep.includes(next.findIndex((x) => x.id === finding.id))) clearF();
    }
    setTab('findings');
    notify?.(`${i >= 0 ? 'Finding updated' : 'Finding added'}${learned ? ` — ${learned.tag_no} / ${learned.checksheet_type || 'no checksheet'} added to the database` : ''}`, 'success');
    if (!keepOpen) setForm(null);
  };

  // ── Header ────────────────────────────────────────────────────
  const headerField = (field, value, { placeholder, cls = 'text-[12.5px] text-slate-700', icon: Icon, date = false } = {}) => (
    <span className="flex items-center gap-1 min-w-0">
      {Icon && <Icon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
      <span className="min-w-[90px] flex-1">
        {!onHeaderChange ? (
          <span className={`px-2 py-1 block ${cls}`}>{date ? (formatPfDate(value) || '—') : (value || '—')}</span>
        ) : date ? (
          <DateCell value={value || ''} label={placeholder} isEditing={headerEdit === field} onEdit={() => setHeaderEdit(field)}
            onCommit={(v) => { setHeaderEdit(null); if ((value || '') !== (v || '')) onHeaderChange(field, v); }}
            onCancel={() => setHeaderEdit(null)} displayClassName={cls} />
        ) : (
          <TextCell value={value || ''} placeholder={placeholder} isEditing={headerEdit === field} onEdit={() => setHeaderEdit(field)}
            onCommit={(v) => { setHeaderEdit(null); if ((value || '') !== (v || '')) onHeaderChange(field, v); }}
            onCancel={() => setHeaderEdit(null)} displayClassName={cls}
            inputClassName={`w-full bg-white border border-slate-200 rounded-md px-2 py-1 ${cls}`} />
        )}
      </span>
    </span>
  );

  const exportBar = (
    <>
      {onExport && (
        <>
          <button type="button" onClick={() => onExport('xlsx', view)} className={`${BTN} text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200`}
            title={active && tab === 'findings' ? 'Excel of the filtered findings' : 'Excel: Summary sheet + all findings'}>
            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
          </button>
          <button type="button" onClick={() => onExport('pdf', view)} className={`${BTN} text-brand-700 bg-brand-50 hover:bg-brand-100 border-brand-200`}>
            <FileText className="w-3.5 h-3.5" /> PDF
          </button>
        </>
      )}
      {onTabLink && (
        <button type="button" onClick={() => onTabLink(tab)} className={`${BTN} text-sky-700 bg-sky-50 hover:bg-sky-100 border-sky-200`} title="The live link that opens on this tab">
          <Link2 className="w-3.5 h-3.5" /> Link
        </button>
      )}
    </>
  );

  const lockButton = locked ? (
    <button type="button" onClick={() => askUnlock()} className={`${BTN} text-amber-800 bg-amber-50 hover:bg-amber-100 border-amber-300`} title="Enter the team password to edit">
      <Lock className="w-3.5 h-3.5" /> Unlock to edit
    </button>
  ) : onLock ? (
    <button type="button" onClick={onLock} className={`${BTN} text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-300`} title="Lock editing again">
      <Unlock className="w-3.5 h-3.5" /> Lock
    </button>
  ) : null;

  const addButton = (
    <button type="button" onClick={openAdd}
      className={`${BTN} text-white bg-brand-600 hover:bg-brand-700 border-brand-700`} title={locked ? 'Adding a finding needs the team password' : 'Add a finding'}>
      {locked ? <Lock className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />} Add finding
    </button>
  );

  const pct = (v) => (all.total ? `${Math.round((v / all.total) * 100)}%` : '');
  const dropFilter = (key, title, allLabel, values, hasBlank) => (
    <select className={SEL} value={filter[key] || ''} onChange={(e) => setF({ [key]: e.target.value })} title={title}>
      <option value="">{allLabel}</option>
      {values.map((x) => <option key={x} value={x}>{x}</option>)}
      {hasBlank && <option value={PF_BLANK}>{key === 'actionBy' ? PF_NY_CLARIFY : '(blank)'}</option>}
    </select>
  );

  const pin = fullScreen && !isMobileMode;
  return (
    <div className={`w-full ${pin ? 'h-full flex flex-col min-h-0' : ''} ${fullScreen && isMobileMode ? 'h-full overflow-y-auto overscroll-contain pb-6' : ''}`}>
      {/* Header */}
      <div className="w-full bg-white rounded-xl shadow-xs border border-slate-200/80 px-3 py-1.5 mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <ShieldCheck className="w-4 h-4 text-brand-600 flex-shrink-0" />
        <div className="flex-1 min-w-[220px] flex items-center gap-2">
          <div className="min-w-0 flex-1">{headerField('title', report?.title, { placeholder: 'Report title', cls: 'text-[15px] font-extrabold text-slate-900' })}</div>
          {headerBadge}
        </div>
        <div className="min-w-[160px]">{headerField('location', report?.location, { placeholder: 'Area', icon: MapPin })}</div>
        <div className="min-w-[110px]">{headerField('system_tag', report?.system_tag, { placeholder: 'Updated by', icon: User })}</div>
        <div className="min-w-[110px]">{headerField('inspection_date', report?.inspection_date, { placeholder: 'Updated date', icon: Calendar, date: true })}</div>
        {headerExtra && <div className="ml-auto flex flex-wrap items-center gap-1.5">{headerExtra}</div>}
      </div>

      {/* Tabs */}
      <div className="flex items-end gap-1 overflow-x-auto border-b border-slate-300 mb-2 px-0.5">
        {[['summary', 'Summary', LayoutDashboard], ['findings', 'Findings', ListChecks]].map(([k, name, Icon]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-bold rounded-t-lg border border-b-0 ${
              tab === k ? 'bg-white text-brand-700 border-slate-300 -mb-px' : 'bg-slate-50 text-slate-600 border-transparent hover:bg-white'}`}>
            <Icon className="w-3.5 h-3.5" /> {name}
            {k === 'findings' && (
              <span className={`px-1.5 rounded-full text-[10.5px] ${all.total - all.closed ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {all.total - all.closed}/{all.total}
              </span>
            )}
          </button>
        ))}
        {active && tab === 'summary' && (
          <button type="button" onClick={() => setTab('findings')} className="ml-2 mb-1 text-[11.5px] text-brand-700 font-semibold hover:underline">
            Filter on: {label} →
          </button>
        )}
      </div>

      {tab === 'summary' ? (
        <div className={`space-y-2 ${pin ? 'flex-1 min-h-0 overflow-y-auto pr-0.5' : ''}`}>
          <div className="flex flex-wrap gap-2">
            <Tile label="Total findings" value={all.total} onClick={() => drill({})} sub={learnedCount ? `${learnedCount} tag(s) added to the database` : 'click to see all'} />
            <Tile label="Open" value={all.open} tone={PF_STATUS_STYLE[PF_STATUS.OPEN].tile} sub={pct(all.open)} onClick={() => drill({ status: PF_STATUS.OPEN })} />
            <Tile label="On-going" value={all.ongoing} tone={PF_STATUS_STYLE[PF_STATUS.ONGOING].tile} sub={pct(all.ongoing)} onClick={() => drill({ status: PF_STATUS.ONGOING })} />
            <Tile label="Closed" value={all.closed} tone={PF_STATUS_STYLE[PF_STATUS.CLOSED].tile} sub={pct(all.closed)} onClick={() => drill({ status: PF_STATUS.CLOSED })} />
            <Tile label={`Open > ${overdueDays} days`} icon={AlertTriangle} value={all.overdue} tone={all.overdue ? 'text-rose-700' : 'text-slate-900'}
              sub={all.total - all.closed ? `avg. open ${all.avgOpenDays} days` : 'nothing open'} onClick={() => drill({ overdue: true })} />
            <div className="flex-[1.4] min-w-[180px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Close-out progress</div>
              <div className="flex items-baseline gap-2">
                <span className="text-[22px] leading-tight font-extrabold tabular-nums text-emerald-700">{all.percentClosed}%</span>
                <span className="text-[11px] text-slate-500">{all.closed} of {all.total} closed</span>
              </div>
              <Progress stats={all} />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 px-2.5 py-2 flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-bold text-slate-800">Summary</span>
            <span className="text-[11.5px] text-slate-500">— click any figure, bar or row to open the findings behind it</span>
            <label className="inline-flex items-center gap-1 text-[11.5px] text-slate-600 ml-1">
              Overdue after
              <select className={SEL} value={overdueDays} onChange={(e) => setOverdueDays(Number(e.target.value))}>
                {PF_OVERDUE_OPTIONS.map((d) => <option key={d} value={d}>{d} days</option>)}
              </select>
            </label>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">{exportBar}{addButton}{lockButton}</div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-2">
            <Card title="Close-out status" sub="Every finding in the report">
              <StatusDonut stats={all} onPick={(st) => drill({ status: st })} />
            </Card>
            <Card title="By Action By" sub={`Open / On-going / Closed per party · ${PF_NY_CLARIFY} = no Action By yet`} right={<StatusLegend />}>
              <StackedStatusBars rows={byActionBy} onPick={(r) => drill({ actionBy: r.value })} />
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <Card title="By Facility" right={<StatusLegend />}>
              <StackedStatusBars rows={byFacility} onPick={(r) => drill({ facility: r.value })} labelWidth={120} />
            </Card>
            <Card title="By Discipline" right={<StatusLegend />}>
              <StackedStatusBars rows={byDiscipline} onPick={(r) => drill({ discipline: r.value })} labelWidth={120} />
            </Card>
          </div>

          <Card title="Status by Action By" sub="Click a row to open its findings">
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-left border-separate border-spacing-0 min-w-[620px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-white">
                    {['Action By', 'Total', 'Open', 'On-going', 'Closed', `Open > ${overdueDays}d`, '% closed', ''].map((h, i) => (
                      <th key={h || i} className={`bg-[#1F3A5F] px-3 py-2 font-bold ${i ? 'text-center' : ''} ${i === 6 ? 'w-[24%]' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byActionBy.map((r) => (
                    <tr key={r.value} onClick={() => drill({ actionBy: r.value })} className="cursor-pointer hover:bg-brand-50/60 text-[13px] text-slate-900">
                      <td className={`px-3 py-1.5 border-b border-slate-100 font-bold ${r.blank ? 'text-amber-800' : ''}`}>{r.name}</td>
                      <td className="px-3 py-1.5 border-b border-slate-100 text-center tabular-nums font-bold">{r.total}</td>
                      <td className="px-3 py-1.5 border-b border-slate-100 text-center tabular-nums font-bold text-rose-700">{r.open}</td>
                      <td className="px-3 py-1.5 border-b border-slate-100 text-center tabular-nums font-bold text-amber-700">{r.ongoing}</td>
                      <td className="px-3 py-1.5 border-b border-slate-100 text-center tabular-nums font-bold text-emerald-700">{r.closed}</td>
                      <td className={`px-3 py-1.5 border-b border-slate-100 text-center tabular-nums font-bold ${r.overdue ? 'text-rose-700' : 'text-slate-400'}`}>{r.overdue}</td>
                      <td className="px-3 py-1.5 border-b border-slate-100">
                        <div className="flex items-center gap-2"><span className="w-9 text-right tabular-nums font-bold text-[12px]">{r.percentClosed}%</span><Progress stats={r} /></div>
                      </td>
                      <td className="px-2 py-1.5 border-b border-slate-100 text-slate-400"><ChevronRight className="w-4 h-4" /></td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 text-[13px] font-extrabold text-slate-900">
                    <td className="px-3 py-1.5">Total</td>
                    <td className="px-3 py-1.5 text-center tabular-nums">{all.total}</td>
                    <td className="px-3 py-1.5 text-center tabular-nums text-rose-700">{all.open}</td>
                    <td className="px-3 py-1.5 text-center tabular-nums text-amber-700">{all.ongoing}</td>
                    <td className="px-3 py-1.5 text-center tabular-nums text-emerald-700">{all.closed}</td>
                    <td className="px-3 py-1.5 text-center tabular-nums text-rose-700">{all.overdue}</td>
                    <td className="px-3 py-1.5"><div className="flex items-center gap-2"><span className="w-9 text-right tabular-nums text-[12px]">{all.percentClosed}%</span><Progress stats={all} /></div></td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Findings opened and closed over time (by week)">
            <OpsClosureChart items={findings} />
          </Card>

          {!all.total && (
            <div className="bg-white rounded-xl border border-dashed border-slate-300 p-6 text-center">
              <Database className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <div className="text-[13px] font-bold text-slate-800">No findings yet</div>
              <div className="text-[12px] text-slate-500 mb-3">Press Add finding and type a TagNo — the equipment columns fill themselves from the database.</div>
              {addButton}
            </div>
          )}
        </div>
      ) : (
        <div className={pin ? 'flex-1 min-h-0 flex flex-col' : ''}>
          <div className="flex flex-wrap gap-2 mb-2">
            <Tile label="Total" value={all.total} active={!filter.status && !filter.overdue} onClick={() => setF({ status: '', overdue: false })} />
            {[PF_STATUS.OPEN, PF_STATUS.ONGOING, PF_STATUS.CLOSED].map((st) => {
              const v = st === PF_STATUS.OPEN ? all.open : st === PF_STATUS.ONGOING ? all.ongoing : all.closed;
              return <Tile key={st} label={st} value={v} tone={PF_STATUS_STYLE[st].tile} sub={pct(v)} active={filter.status === st}
                onClick={() => setF({ status: filter.status === st ? '' : st })} />;
            })}
            <Tile label={`Open > ${overdueDays} days`} icon={AlertTriangle} value={all.overdue} tone={all.overdue ? 'text-rose-700' : 'text-slate-900'}
              active={filter.overdue} onClick={() => setF({ overdue: !filter.overdue })} />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 px-2.5 py-2 mb-2 flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-[200px] max-w-[360px]">
              <SearchBox value={filter.search} onChange={(v) => setF({ search: v })} placeholder="Search tag, equipment, issue, action, remark, date…" />
            </div>
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select className={SEL} value={filter.status} onChange={(e) => setF({ status: e.target.value })} title="Close-out Status">
              <option value="">All status</option>
              {[PF_STATUS.OPEN, PF_STATUS.ONGOING, PF_STATUS.CLOSED].map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            {/* Same order as the columns (v3.31.1). */}
            {dropFilter('actionBy', 'Action By', 'All action by', options.actionBy, options.blank.actionBy)}
            {dropFilter('checksheet', 'ChecksheetType', 'All checksheets', options.checksheet, options.blank.checksheet)}
            {dropFilter('subsystem', 'Subsystem', 'All subsystems', options.subsystem, options.blank.subsystem)}
            {dropFilter('discipline', 'DisciplineCode', 'All disciplines', options.discipline, options.blank.discipline)}
            {dropFilter('facility', 'FacilityCode', 'All facilities', options.facility, options.blank.facility)}
            {active && (
              <button type="button" onClick={clearF} className={`${BTN} text-slate-700 bg-slate-100 hover:bg-slate-200 border-slate-200`}><X className="w-3.5 h-3.5" /> Clear</button>
            )}
            <span className="text-[12px] text-slate-500">{active ? `${indices.length} of ${all.total} shown` : `${all.total} findings`}</span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">{exportBar}{addButton}{lockButton}</div>
          </div>

          {!locked && !isMobileMode && (
            <p className="text-[11px] text-slate-500 mb-1.5 px-1">
              Double-click a cell to edit (the equipment columns open the form with the database) · No and TagNo stay pinned when scrolling sideways · click a date or a status to change it · click a References cell, then Ctrl+V to paste · row colour follows the Close-out Status.
            </p>
          )}

          <div className={pin ? 'flex-1 min-h-0' : ''}>
            <PreservationTable
              fill={pin}
              rows={rows}
              readOnly={locked}
              isMobileMode={isMobileMode}
              editing={editing}
              selected={selected}
              api={api}
              overdueDays={overdueDays}
              emptyText={all.total ? 'No findings match the filter.' : 'No findings yet — press Add finding.'}
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

      <PreservationForm
        isOpen={Boolean(form)}
        initial={form?.initial || null}
        items={items}
        isMobileMode={isMobileMode}
        onClose={() => setForm(null)}
        onSave={saveFinding}
        onAttachFile={onAttachFile ? (item, file, slot) => onAttachFile(item, -1, file, slot) : undefined}
        onOpenAttachment={(p, item) => onOpenAttachment?.(p, item, -1)}
        onPhotoRemoved={onPhotoRemoved}
      />
    </div>
  );
}
