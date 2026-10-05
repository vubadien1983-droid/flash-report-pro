import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useColumnWidths } from './ColumnResize';
import {
  FileSpreadsheet, FileText, Plus, RefreshCw, UploadCloud, Trash2, CheckCircle2, AlertTriangle,
  CalendarDays, MapPin, Clock, NotebookPen, ChevronDown,
} from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import PhotoGalleryCell from './PhotoGalleryCell';
import {
  MOM_COLUMNS, createMom, refreshMom, editMomCell, editMomMeeting, planMomSync, applyMomSync,
  momPendingCount, momGroups, momStats, momName, momIdFor, longDate, pendingAction, sortMoms,
} from '../services/opsMom';
import { subscribeMoms, saveMom, deleteMom } from '../services/opsMomStore';
import {
  OPS_STATUS_OPTIONS, OPS_STATUS_STYLE, normalizeOpsStatus, formatOpsDate, opsDateKey, todayKeyLocal,
  photosOf, sectionLetter,
} from '../services/opsFindings';

/**
 * The MoM tab of the OPS Findings share link (v3.32.0) — master password only.
 *
 * Left: the weekly MoMs (one per ISO week, newest first).
 * Right: the selected MoM laid out as a meeting record. Cells of the finding
 * columns are edited with a DOUBLE click; "Updated Corrective Action" with a
 * single click. Nothing reaches the report until "Sync to the tabs".
 * The rules live in services/opsMom.js.
 */

const W = {
  no: 'w-[44px]', system: 'w-[150px]', subsystem_no: 'w-[108px]', description: 'w-[260px]', remark: 'w-[200px]',
  action: 'w-[210px]', updated_action: 'w-[230px]', status: 'w-[92px]', closeout_status: 'w-[160px]',
  updated_date: 'w-[96px]', photos_g: 'w-[190px]', photos_o: 'w-[150px]',
};
/** "30-Sep-26 21:55" in the viewer's own time zone (synced_at is ISO UTC). */
const localStamp = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${formatOpsDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const TEXT_FIELDS = new Set(['system', 'subsystem_no', 'description', 'remark', 'action', 'closeout_status']);

export default function OpsMomPanel({
  shareId,
  items,                 // live findings
  onApplyItems,          // (items) => void — the Sync writes through the viewer's save path
  loadPhotos,            // async (items) => items with every picture's bytes (exports)
  onPhotoClick,          // (entry, rowEntries, itemIndex)
  notify,
  isMobileMode = false,
}) {
  const cw = useColumnWidths('ops-mom');
  const [moms, setMoms] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [selId, setSelId] = useState('');
  const [local, setLocal] = useState(null);      // the selected MoM as edited here
  const [saveState, setSaveState] = useState(''); // '' | 'saving' | 'saved' | 'error'
  const [editing, setEditing] = useState(null);   // { rowId, field }
  const [draft, setDraft] = useState('');
  const [syncPlan, setSyncPlan] = useState(null); // { changes, missing, skip:Set }
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState('');
  const [listOpen, setListOpen] = useState(!isMobileMode);
  const [signature, setSignature] = useState('');
  useEffect(() => { import('../services/momSignature').then((m) => setSignature(m.MOM_SIGNATURE_PNG)).catch(() => {}); }, []);
  const dirty = useRef(false);
  const timer = useRef(null);
  const localRef = useRef(null);
  localRef.current = local;

  // ── Live list ─────────────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeMoms(shareId, (list) => {
      setMoms(list);
      setLoaded(true);
      setSelId((cur) => cur || (list[0]?.id || ''));
    }, (e) => { setLoaded(true); notify?.(`MoM list: ${e.message}`, 'error'); });
    return () => unsub();
  }, [shareId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The selected MoM follows the cloud unless it has unsaved edits here.
  useEffect(() => {
    const cloud = moms.find((m) => m.id === selId) || null;
    if (!cloud) { if (!dirty.current) setLocal(null); return; }
    if (!dirty.current) setLocal(cloud);
  }, [moms, selId]);

  const persist = (mom, { now = false } = {}) => {
    dirty.current = true;
    setLocal(mom);
    setSaveState('saving');
    if (timer.current) clearTimeout(timer.current);
    const run = async () => {
      try {
        await saveMom(shareId, now ? mom : (localRef.current || mom));
        dirty.current = false;
        setSaveState('saved');
      } catch (e) {
        setSaveState('error');
        notify?.(`MoM not saved: ${e.message}`, 'error');
      }
    };
    if (now) return run();
    timer.current = setTimeout(run, 1200);
    return null;
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const selectMom = async (id) => {
    if (dirty.current && localRef.current) {
      if (timer.current) clearTimeout(timer.current);
      await persist(localRef.current, { now: true });
    }
    setEditing(null);
    setSelId(id);
    if (isMobileMode) setListOpen(false);
  };

  const thisWeek = momIdFor(todayKeyLocal());
  const hasThisWeek = moms.some((m) => m.id === thisWeek);

  const newMom = async () => {
    if (hasThisWeek) { selectMom(thisWeek); notify?.('This week\'s MoM already exists — opened it', 'info'); return; }
    const mom = createMom(items);
    setBusy('create');
    try {
      await saveMom(shareId, mom);
      dirty.current = false;
      setLocal(mom);
      setSelId(mom.id);
      notify?.(`${mom.name} created with ${mom.rows.length} finding(s)`, 'success');
    } catch (e) {
      notify?.(`MoM not created: ${e.message}`, 'error');
    } finally { setBusy(''); }
  };

  const mom = local;
  const groups = useMemo(() => momGroups(mom), [mom]);
  const stats = useMemo(() => momStats(mom), [mom]);
  const pending = useMemo(() => momPendingCount(mom), [mom]);
  const itemIndex = useMemo(() => new Map((items || []).map((it, i) => [it.id, i])), [items]);

  // ── Editing ──────────────────────────────────────────────────
  const startEdit = (row, field) => {
    if (row.gone) return;
    setEditing({ rowId: row.id, field });
    setDraft(field === 'updated_date' ? (opsDateKey(row[field]) || '') : String(row[field] ?? ''));
  };
  const commit = (value = draft) => {
    if (!editing || !mom) return;
    const row = mom.rows.find((r) => r.id === editing.rowId);
    const cur = editing.field === 'updated_date' ? (opsDateKey(row?.[editing.field]) || '') : String(row?.[editing.field] ?? '');
    setEditing(null);
    if (String(value) === cur) return;
    persist(editMomCell(mom, editing.rowId, editing.field, value));
  };
  const cancel = () => setEditing(null);

  const setMeeting = (field, value) => { if (mom) persist(editMomMeeting(mom, field, value)); };

  // ── Refresh / Sync / Delete / Export ─────────────────────────
  const refresh = () => {
    if (!mom) return;
    const r = refreshMom(mom, items);
    persist(r.mom, { now: true });
    notify?.(`Refreshed from the report: ${r.added} finding(s) added, ${r.updatedCells} cell(s) updated${r.gone ? `, ${r.gone} no longer in the report` : ''}`, 'success');
  };

  const openSync = () => {
    if (!mom) return;
    const plan = planMomSync(mom, items);
    if (!plan.changes.length) {
      notify?.(plan.missing ? `${plan.missing} edited finding(s) are no longer in the report — nothing to sync` : 'Nothing to sync — the tabs already match this MoM', 'info');
      return;
    }
    setSyncPlan({ ...plan, skip: new Set() });
  };
  const doSync = async () => {
    const plan = syncPlan;
    setSyncPlan(null);
    if (!plan || !mom) return;
    const res = applyMomSync(mom, items, plan, { skip: plan.skip });
    onApplyItems?.(res.items);
    await persist(res.mom, { now: true });
    notify?.(`Synced ${res.applied} change(s) to ${res.findings} finding(s) — Updated Date set to ${formatOpsDate(todayKeyLocal())}`, 'success');
  };

  const removeMom = async () => {
    setConfirmDelete(false);
    if (!mom) return;
    try {
      if (timer.current) clearTimeout(timer.current);
      dirty.current = false;
      await deleteMom(shareId, mom.id);
      setLocal(null);
      setSelId(sortMoms(moms.filter((m) => m.id !== mom.id))[0]?.id || '');
      notify?.(`${momName(mom)} deleted`, 'info');
    } catch (e) { notify?.(`Not deleted: ${e.message}`, 'error'); }
  };

  const exportMom = async (kind) => {
    if (!mom) return;
    setBusy(kind);
    try {
      const withPhotos = loadPhotos ? await loadPhotos(items) : items;
      const byId = new Map((withPhotos || []).map((it) => [it.id, it]));
      const mod = await import('../services/opsMomExport');
      if (kind === 'xlsx') await mod.exportMomExcel(mom, byId);
      else await mod.exportMomPdf(mom, byId);
      notify?.(`${kind === 'xlsx' ? 'Excel' : 'PDF'} of ${momName(mom)} downloaded`, 'success');
    } catch (e) {
      console.error(e);
      notify?.(`Export failed: ${e.message}`, 'error');
    } finally { setBusy(''); }
  };

  // ── Cells ────────────────────────────────────────────────────
  const renderCell = (row, key) => {
    const item = items[itemIndex.get(row.id)];
    if (key === 'photos_g' || key === 'photos_o') {
      const list = item ? photosOf(item, key === 'photos_g' ? 'G' : 'O') : [];
      if (!list.length) return <span className="text-slate-300 text-[11px]">—</span>;
      return (
        <PhotoGalleryCell photos={list} compact readOnly isMobileView={isMobileMode}
          thumbClass={key === 'photos_g' ? 'w-[4.6rem] h-[4.6rem]' : 'w-[3.8rem] h-[3.8rem]'}
          onPhotoClick={(entry, rowEntries) => onPhotoClick?.(entry, rowEntries, itemIndex.get(row.id))} />
      );
    }
    if (key === 'no') return <span className="font-bold">{row.no}</span>;
    const isEditing = editing && editing.rowId === row.id && editing.field === key;
    if (isEditing) {
      if (key === 'status') {
        return (
          <select autoFocus value={normalizeOpsStatus(draft)} onChange={(e) => commit(e.target.value)} onBlur={cancel}
            className="w-full text-[12px] border border-brand-400 rounded px-1 py-1 bg-white">
            {OPS_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        );
      }
      if (key === 'updated_date') {
        return (
          <input type="date" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => commit()}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
            className="w-full text-[12px] border border-brand-400 rounded px-1 py-1" />
        );
      }
      return (
        <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => commit()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
          }}
          rows={Math.min(8, Math.max(3, Math.ceil(String(draft).length / 34)))}
          placeholder={key === 'updated_action' ? 'Corrective action agreed in the meeting…' : ''}
          className={`w-full text-[12.5px] leading-snug rounded px-1.5 py-1 outline-none border ${key === 'updated_action' ? 'border-amber-500 bg-amber-50' : 'border-brand-400 bg-white'}`} />
      );
    }
    if (key === 'status') {
      const st = normalizeOpsStatus(row.status);
      return <span className={`inline-block px-2 py-0.5 rounded-md border text-[11.5px] font-bold ${OPS_STATUS_STYLE[st].badge}`}>{st}</span>;
    }
    if (key === 'updated_date') return <span className="tabular-nums">{formatOpsDate(row.updated_date) || '—'}</span>;
    if (key === 'updated_action') {
      const text = String(row.updated_action || '');
      if (!text) return <span className="text-amber-700/60 italic text-[11.5px]">Click to write the agreed action…</span>;
      return (
        <span className="whitespace-pre-wrap">
          {text}
          {!pendingAction(row) && row.synced_action && (
            <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 align-middle"><CheckCircle2 className="w-3 h-3" />synced</span>
          )}
        </span>
      );
    }
    return <span className="whitespace-pre-wrap">{String(row[key] || '') || <span className="text-slate-300">—</span>}</span>;
  };

  // ── Render ───────────────────────────────────────────────────
  const listPanel = (
    <aside className={`${isMobileMode ? 'w-full' : 'w-[250px] flex-shrink-0'} bg-white rounded-xl border border-slate-200 flex flex-col min-h-0`}>
      <div className="px-3 py-2.5 border-b border-slate-200 flex items-center gap-2">
        <NotebookPen className="w-4 h-4 text-brand-600" />
        <span className="text-[13px] font-extrabold text-slate-900 flex-1">Minutes of Meeting</span>
        {isMobileMode && <button type="button" onClick={() => setListOpen((v) => !v)} className="p-1 text-slate-500 inline-flex items-center gap-1 text-[11px] font-semibold">{moms.length} MoM<ChevronDown className={`w-4 h-4 transition-transform ${listOpen ? 'rotate-180' : ''}`} /></button>}
      </div>
      <div className="p-2">
            <button type="button" onClick={newMom} disabled={busy === 'create'}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[12.5px] font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-50">
              {busy === 'create' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {hasThisWeek ? 'Open this week\'s MoM' : 'New MoM — this week'}
            </button>
      </div>
      {(listOpen || !isMobileMode) && (
          <div className={`${isMobileMode ? 'max-h-[40vh]' : 'flex-1 min-h-0'} overflow-y-auto px-2 pb-2 space-y-1`}>
            {!loaded && <div className="text-[12px] text-slate-500 px-2 py-3">Loading…</div>}
            {loaded && !moms.length && <div className="text-[12px] text-slate-500 px-2 py-3">No MoM yet. Create the first one for this week.</div>}
            {moms.map((m) => {
              const on = m.id === selId;
              const shown = on && local ? local : m;
              const p = momPendingCount(shown);
              return (
                <button key={m.id} type="button" onClick={() => selectMom(m.id)}
                  className={`w-full text-left rounded-lg border px-2.5 py-2 ${on ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                  <div className="text-[12.5px] font-bold text-slate-900">{momName(shown)}</div>
                  <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2">
                    <span>{(shown.rows || []).filter((r) => !r.gone).length} findings</span>
                    {p > 0 && <span className="font-bold text-amber-700">{p} to sync</span>}
                    {!p && shown.synced_at && <span className="font-bold text-emerald-700">synced {localStamp(shown.synced_at).split(' ')[0]}</span>}
                  </div>
                </button>
              );
            })}
          </div>
      )}
    </aside>
  );

  const meetingField = (field, label, Icon, { type = 'text', placeholder = '' } = {}) => (
    <label className="flex items-center gap-2 min-w-0">
      <span className="w-[92px] flex-shrink-0 text-[10.5px] font-bold uppercase tracking-wide text-slate-500 inline-flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />}{label}
      </span>
      <input type={type} value={type === 'date' ? (opsDateKey(mom?.meeting?.[field]) || '') : (mom?.meeting?.[field] || '')}
        placeholder={placeholder}
        onChange={(e) => setMeeting(field, e.target.value)}
        className="flex-1 min-w-0 text-[12.5px] font-semibold text-[#1F3A5F] px-2 py-1 rounded-md border border-transparent hover:border-slate-200 focus:border-brand-500 focus:bg-white bg-slate-50 outline-none" />
    </label>
  );

  return (
    <div className={`${isMobileMode ? 'flex flex-col gap-2' : 'flex gap-2 h-full min-h-0'}`}>
      {listPanel}

      <section className="flex-1 min-w-0 min-h-0 bg-white rounded-xl border border-slate-200 flex flex-col">
        {!mom ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-500 gap-2">
            <NotebookPen className="w-8 h-8 text-slate-300" />
            <p className="text-[13px]">Select a MoM on the left, or create this week's.</p>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="px-3 py-2 border-b border-slate-200 flex flex-wrap items-center gap-1.5">
              <span className="text-[13.5px] font-extrabold text-slate-900 mr-1">{momName(mom)}</span>
              <span className="text-[11px] text-slate-500 mr-auto">
                {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? <span className="text-rose-600 font-bold">Not saved</span> : 'Saved'}
                {mom.synced_at ? ` · last synced ${localStamp(mom.synced_at)}` : ' · not synced yet'}
              </span>
              <button type="button" onClick={refresh} title="Add findings that became open this week and take the report's value into every cell not edited here"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh from the report
              </button>
              <button type="button" onClick={openSync}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-bold rounded-lg border ${pending ? 'text-white bg-amber-600 hover:bg-amber-700 border-amber-700' : 'text-slate-700 bg-slate-50 hover:bg-slate-100 border-slate-200'}`}>
                <UploadCloud className="w-3.5 h-3.5" /> Sync to the tabs{pending ? ` (${pending})` : ''}
              </button>
              <button type="button" onClick={() => exportMom('xlsx')} disabled={Boolean(busy)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg disabled:opacity-50">
                {busy === 'xlsx' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />} Excel
              </button>
              <button type="button" onClick={() => exportMom('pdf')} disabled={Boolean(busy)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-bold text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg disabled:opacity-50">
                {busy === 'pdf' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} PDF
              </button>
              <button type="button" onClick={() => setConfirmDelete(true)} title="Delete this MoM"
                className="p-1.5 text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-auto p-3">
              {/* Document header */}
              <div className="rounded-xl overflow-hidden border border-slate-200 mb-3 min-w-[720px]">
                <div className="bg-[#1F3A5F] text-white px-4 py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[18px] font-extrabold tracking-wide">MINUTES OF MEETING</div>
                    <div className="text-[12px] text-sky-100">{mom.meeting?.title || 'Weekly OPS Findings Meeting'} — {momName(mom)}</div>
                  </div>
                  <div className="flex gap-1.5">
                    {[['Total', stats.total, 'bg-white/15'], ['Open', stats.open, 'bg-rose-600'], ['On-going', stats.ongoing, 'bg-amber-400 text-amber-950'], ['Closed', stats.closed, 'bg-emerald-600']].map(([l, v, c]) => (
                      <div key={l} className={`px-2.5 py-1 rounded-lg text-center ${c}`}>
                        <div className="text-[9.5px] font-bold uppercase opacity-90">{l}</div>
                        <div className="text-[17px] leading-none font-extrabold tabular-nums">{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 px-4 py-3 bg-white">
                  {meetingField('project', 'Project')}
                  {meetingField('venue', 'Venue', MapPin, { placeholder: 'PTSC MC Yard' })}
                  {meetingField('title', 'Meeting')}
                  <div className="flex gap-2">
                    <div className="flex-1">{meetingField('date', 'Date', CalendarDays, { type: 'date' })}</div>
                    <div className="w-[220px]">{meetingField('time', 'Time', Clock, { placeholder: '09:00 – 10:00' })}</div>
                  </div>
                  {meetingField('next_meeting', 'Next meeting', CalendarDays, { placeholder: 'e.g. Tue 06-Oct-2026, 09:00' })}
                  <div className="text-[11px] text-slate-500 self-center">
                    Double-click a cell to edit it · click <b className="text-amber-700">Updated Corrective Action</b> to write the agreed action · then <b>Sync to the tabs</b>.
                  </div>
                </div>
              </div>

              {/* Findings */}
              <table className="w-full text-left border-separate border-spacing-0 text-[12.5px] text-slate-900 min-w-[1850px]" style={cw.tableStyle}>
                <thead className="sticky top-0 z-10">
                  <tr>
                    {MOM_COLUMNS.map((c) => (
                      <th key={c.key} data-col={c.key} style={cw.thStyle(c.key)} className={`${W[c.key]} relative px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-center border-r border-white/20 ${
                        c.key === 'updated_action' ? 'bg-amber-300 text-slate-900' : 'bg-[#1F3A5F] text-white'}`}>{c.label}{cw.handle(c.key)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <React.Fragment key={g.section}>
                      <tr>
                        <td colSpan={MOM_COLUMNS.length} className="bg-slate-700 text-white font-bold px-2 py-1.5 text-[12.5px]">
                          {g.section}
                          <span className="ml-2 text-[11px] font-semibold text-slate-300">{g.rows.filter((r) => !r.gone).length} finding(s)</span>
                        </td>
                      </tr>
                      {g.rows.map((row) => {
                        const st = OPS_STATUS_STYLE[normalizeOpsStatus(row.status)];
                        return (
                          <tr key={row.id} className={`${row.gone ? 'opacity-50' : ''} ${st.row}`}>
                            {MOM_COLUMNS.map((c) => {
                              const edited = row.edits?.[c.key] || (c.key === 'updated_action' && pendingAction(row));
                              const editable = !row.gone && (TEXT_FIELDS.has(c.key) || c.key === 'status' || c.key === 'updated_date');
                              const cls = `px-2 py-1.5 align-top border-b border-r border-slate-200 ${
                                c.key === 'updated_action' ? 'bg-amber-50/90 cursor-text' : editable ? 'cursor-pointer' : ''} ${
                                edited ? 'ring-2 ring-inset ring-amber-400' : ''} ${
                                ['no', 'status', 'updated_date', 'subsystem_no'].includes(c.key) ? 'text-center' : ''} ${
                                c.key === 'system' ? 'font-bold' : ''}`;
                              return (
                                <td key={c.key} className={cls}
                                  title={edited ? 'Changed in this MoM — not synced to the tabs yet' : row.gone ? 'No longer in the report' : ''}
                                  onDoubleClick={editable ? () => startEdit(row, c.key) : undefined}
                                  onClick={c.key === 'updated_action' && !row.gone && !(editing?.rowId === row.id && editing?.field === 'updated_action') ? () => startEdit(row, 'updated_action') : undefined}>
                                  {renderCell(row, c.key)}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              {!groups.length && <div className="text-center text-[12.5px] text-slate-500 py-8">No finding in this MoM.</div>}

              <div className="mt-6 flex justify-end pr-6">
                <div className="text-[12px] text-slate-600">
                  <div className="font-bold text-slate-800 mb-1">Prepared by:</div>
                  <div className="h-[70px] flex items-end">{signature && <img src={signature} alt="Signature" className="h-[66px] w-auto" />}</div>
                  <div className="border-t border-slate-400 pt-1 w-[220px] font-bold text-slate-900">Vu Ba Dien</div>
                  <div>Date: {longDate(mom.meeting?.date || mom.created_date)}</div>
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Sync dialog */}
      {syncPlan && (
        <div className="fixed inset-0 z-[70] bg-slate-900/50 flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[860px] max-h-[88vh] flex flex-col">
            <div className="px-5 py-3 border-b border-slate-200">
              <div className="text-[15px] font-extrabold text-slate-900">Sync {momName(mom)} to the tabs</div>
              <div className="text-[12px] text-slate-500">
                {syncPlan.changes.length - syncPlan.skip.size} change(s) will be written to the report. Every finding changed gets Updated Date = {formatOpsDate(todayKeyLocal())}.
                {syncPlan.missing ? ` ${syncPlan.missing} edited finding(s) are no longer in the report and are skipped.` : ''}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-slate-100 text-slate-600 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 w-[34px]">Write</th>
                    <th className="px-2 py-1.5 text-left w-[70px]">Finding</th>
                    <th className="px-2 py-1.5 text-left w-[130px]">Column</th>
                    <th className="px-2 py-1.5 text-left">In the report now</th>
                    <th className="px-2 py-1.5 text-left">From the MoM</th>
                  </tr>
                </thead>
                <tbody>
                  {syncPlan.changes.map((c) => {
                    const on = !syncPlan.skip.has(c.key);
                    const toggle = () => setSyncPlan((p) => {
                      const skip = new Set(p.skip);
                      if (skip.has(c.key)) skip.delete(c.key); else skip.add(c.key);
                      return { ...p, skip };
                    });
                    return (
                      <tr key={c.key} className={`border-t border-slate-100 align-top ${c.conflict ? 'bg-rose-50/60' : ''}`}>
                        <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={on} onChange={toggle} /></td>
                        <td className="px-2 py-1.5 font-bold">{sectionLetter(c.section) || ''}{c.no}</td>
                        <td className="px-2 py-1.5">
                          {c.label}
                          {c.source === 'updated_action' && <div className="text-[10.5px] text-amber-700 font-semibold">from Updated Corrective Action</div>}
                          {c.conflict && <div className="text-[10.5px] text-rose-700 font-bold inline-flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" />changed in the report meanwhile</div>}
                        </td>
                        <td className="px-2 py-1.5 text-slate-500 whitespace-pre-wrap">{c.field === 'updated_date' ? formatOpsDate(c.from) : c.from || '—'}</td>
                        <td className="px-2 py-1.5 font-semibold text-slate-900 whitespace-pre-wrap">{c.field === 'updated_date' ? formatOpsDate(c.to) : c.to || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 rounded-b-2xl">
              <span className="text-[11.5px] text-slate-500 mr-auto">Untick a change to keep the report's value (e.g. a conflict).</span>
              <button type="button" onClick={() => setSyncPlan(null)} className="px-3 py-2 text-[13px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg">Cancel</button>
              <button type="button" onClick={doSync} disabled={syncPlan.changes.length === syncPlan.skip.size}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-40">
                <UploadCloud className="w-4 h-4" /> Sync {syncPlan.changes.length - syncPlan.skip.size} change(s)
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmDelete}
        title="Delete this MoM?"
        message={mom ? `${momName(mom)} will be deleted for everyone. The report itself is not changed.` : ''}
        confirmLabel="Delete MoM"
        tone="danger"
        onConfirm={removeMom}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
