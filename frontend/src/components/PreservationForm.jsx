import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Database, CheckCircle2, AlertTriangle, Sparkles, Eraser, Save, Plus, ChevronDown, RefreshCw,
} from 'lucide-react';
import { DateCell } from './PlanCell';
import PhotoGalleryCell from './PhotoGalleryCell';
import {
  PF_DB_FIELDS, PF_DB_DISPLAY, PF_STATUS_OPTIONS, pfLabel, pfColLetter, buildLookup, seedToRows, suggestionsFor,
  autoFill, canonical, matchCandidates, isNewToDb, dbNorm, pfDistinct, normalizePfStatus,
  PF_STATUS, todayKeyLocal, makePfId,
} from '../services/preservationFindings';

/**
 * "Add finding" / "Edit finding" — the entry form of the Preservation report.
 *
 * The EQUIPMENT columns (TagNo, EquipmentName, ChecksheetType, Interval,
 * Subsystem, SubsystemDescription, DisciplineCode, FacilityCode) come from the hidden lookup database (the PreservationControl
 * workbook + every entry learned from earlier findings). Type into ANY of the
 * eight fields and it offers the values the other filled fields allow; pick
 * one and every field the remaining rows agree on fills itself. TagNo is the
 * strong key: picking a tag fills every equipment field at once (a tag with two checksheets —
 * CLQU-RSD-8601/8602 — leaves ChecksheetType to be picked). Anything can
 * still be typed by hand; a (TagNo, ChecksheetType) the database does not
 * know is ADDED to it when the finding is saved.
 *
 * The finding columns (Issue … References) are typed here or left for later in the table.
 */

const seedPromise = { p: null };
function loadSeed() {
  if (!seedPromise.p) seedPromise.p = import('../services/preservationDb').then((m) => seedToRows(m.PRESERVATION_DB_ROWS));
  return seedPromise.p;
}

const EMPTY_DB = Object.fromEntries(PF_DB_FIELDS.map((f) => [f, '']));
const INPUT = 'w-full text-[13px] text-slate-900 bg-white border border-slate-300 rounded-lg px-2.5 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';

/** One equipment field: a text box with its own suggestion list. */
function DbCombo({ field, value, lookup, values, onType, onPick, onClear, autoFocus }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef(null);
  const sugg = useMemo(
    () => (lookup && open ? suggestionsFor(lookup, values, field, value) : { list: [], total: 0 }),
    [lookup, open, values, field, value],
  );
  useEffect(() => { setHi(0); }, [value, open]);
  const known = lookup && value && lookup.known[field].has(dbNorm(value));

  const pick = (v) => { setOpen(false); onPick(field, v, { widened: sugg.widened }); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, Math.max(0, sugg.list.length - 1))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter') { if (open && sugg.list[hi]) { e.preventDefault(); pick(sugg.list[hi].value); } }
    else if (e.key === 'Escape') { if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false); } }
  };

  return (
    <div ref={boxRef} className="relative">
      <label className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-500 mb-0.5">
        <span className="px-1 rounded bg-slate-200 text-slate-700">{pfColLetter(field)}</span>
        {pfLabel(field)}
        {field === 'tag_no' && <span className="normal-case font-semibold text-brand-600 tracking-normal">· fills all equipment fields</span>}
        {value && (known
          ? <CheckCircle2 className="w-3 h-3 text-emerald-600" title="Known in the database" />
          : <Sparkles className="w-3 h-3 text-violet-600" title="Not in the database — typed by hand" />)}
      </label>
      <div className="relative">
        <input
          data-field={field}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => { onType(field, e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => { setOpen(false); onPick(field, value, { blur: true }); }, 140)}
          onKeyDown={onKey}
          placeholder={lookup ? 'Type or pick…' : 'Loading database…'}
          autoComplete="off"
          className={`${INPUT} pr-12 ${value && !known ? 'border-violet-300 bg-violet-50/40' : ''}`}
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
          {value && (
            <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => onClear(field)}
              className="p-1 text-slate-400 hover:text-slate-700" title="Clear"><X className="w-3.5 h-3.5" /></button>
          )}
          <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)}
            className="p-1 text-slate-400 hover:text-slate-700" title="Show the choices"><ChevronDown className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      {open && sugg.list.length > 0 && (
        <div className="absolute z-[95] left-0 right-0 mt-1 max-h-[240px] overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl">
          {sugg.widened && (
            <div className="px-2.5 py-1 text-[11px] font-semibold text-sky-800 bg-sky-50 border-b border-sky-100">
              Other equipment — picking one replaces the equipment fields
            </div>
          )}
          {sugg.list.map((s, i) => (
            <button key={s.value} type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s.value)}
              onMouseEnter={() => setHi(i)}
              className={`w-full text-left px-2.5 py-1.5 text-[12.5px] flex items-start gap-2 border-b border-slate-50 last:border-0 ${i === hi ? 'bg-brand-50' : ''}`}>
              <span className="flex-1 text-slate-900 break-words">{s.value}</span>
              {field === 'tag_no' && s.row && <span className="text-[10.5px] text-slate-500 truncate max-w-[45%]">{s.row.equipment_name}</span>}
              {field !== 'tag_no' && s.count > 1 && <span className="text-[10.5px] text-slate-400 tabular-nums">{s.count}</span>}
              {s.row?.source === 'learned' && <span className="text-[9.5px] font-bold text-violet-700 bg-violet-100 rounded px-1">added</span>}
            </button>
          ))}
          {sugg.total > sugg.list.length && (
            <div className="px-2.5 py-1 text-[11px] text-slate-500 bg-slate-50">Type more to narrow {sugg.total} values…</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PreservationForm({
  isOpen,
  initial = null,            // the finding being edited, or null for a new one
  prefill = null,            // a new finding's equipment fields (the row "+" button)
  belowNo = null,            // a new finding from a row's "+": the number it goes below
  items = [],                // the report's items (learned database rows are read from them)
  onSave,                    // (finding, { keepOpen }) => void
  onClose,
  onAttachFile,              // (item, file, slot) => descriptor | null
  onOpenAttachment,          // (photo, item) => void
  onPhotoRemoved,            // (item, photo) => void
  isMobileMode = false,
}) {
  const [seed, setSeed] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [v, setV] = useState(null);
  const [dateEdit, setDateEdit] = useState(null);
  const [touched, setTouched] = useState(false);
  const [askClose, setAskClose] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    loadSeed().then(setSeed).catch((e) => setLoadErr(e.message || String(e)));
  }, [isOpen]);

  const lookup = useMemo(() => (seed ? buildLookup(seed, items) : null), [seed, items]);

  useEffect(() => {
    if (!isOpen) return;
    const today = todayKeyLocal();
    setV(initial ? { ...initial, photos: [...(initial.photos || [])] } : {
      id: makePfId(), ...EMPTY_DB, ...(prefill || {}), issue: '', action_by: '', action: '', remark: '',
      status: PF_STATUS.OPEN, closeout_date: '', open_date: today, updated_date: today, photos: [],
    });
    setTouched(false);
    setAskClose(false);
    setDateEdit(null);
  }, [isOpen, initial, prefill]);

  const actionByOptions = useMemo(() => pfDistinct(items, 'action_by'), [items]);

  if (!isOpen || !v) return null;

  const dbValues = Object.fromEntries(PF_DB_FIELDS.map((f) => [f, v[f] || '']));
  const set = (patch) => { setV((cur) => ({ ...cur, ...patch })); setTouched(true); };

  const onType = (field, text) => set({ [field]: text });
  const onClear = (field) => set({ [field]: '' });
  const clearAll = () => set({ ...EMPTY_DB });

  const onPick = (field, value, opts = {}) => {
    const { blur: leaving = false, widened = false } = opts;
    if (!lookup) return;
    setV((cur) => {
      let blur = leaving;
      const canon = canonical(lookup, field, value);
      // A value from outside the current combination starts the equipment fields afresh.
      let next = widened && !blur ? { ...cur, ...EMPTY_DB, [field]: canon } : { ...cur, [field]: canon };
      // A known tag typed and left (not picked) that does not fit the other
      // fields is taken as a new pick too — otherwise the equipment fields would keep the
      // previous equipment beside the new tag.
      const tagDisagrees = blur && field === 'tag_no' && canon && lookup.known.tag_no.has(dbNorm(canon))
        && !matchCandidates(lookup, Object.fromEntries(PF_DB_FIELDS.map((f) => [f, next[f] || '']))).length;
      if (tagDisagrees) blur = false;
      if (!blur && field === 'tag_no' && canon) {
        // A picked tag is authoritative: take its row(s), whatever else was there.
        const rows = lookup.rows.filter((r) => dbNorm(r.tag_no) === dbNorm(canon));
        if (rows.length) {
          for (const f of PF_DB_FIELDS) {
            const vals = [...new Set(rows.map((r) => r[f]))];
            if (vals.length === 1) next[f] = vals[0];
            else if (!vals.some((x) => dbNorm(x) === dbNorm(next[f]))) next[f] = '';
          }
        }
      }
      if (blur && (cur[field] || '') === canon) {
        // Leaving a field without changing it: only fill what is empty.
        const filled = autoFill(lookup, Object.fromEntries(PF_DB_FIELDS.map((f) => [f, next[f] || ''])));
        return { ...next, ...filled.values };
      }
      const filled = autoFill(lookup, Object.fromEntries(PF_DB_FIELDS.map((f) => [f, next[f] || ''])));
      next = { ...next, ...filled.values };
      return next;
    });
    if (!leaving) setTouched(true);
  };

  const candidates = lookup ? matchCandidates(lookup, dbValues) : [];
  const anyDb = PF_DB_FIELDS.some((f) => dbValues[f]);
  const isNew = lookup && isNewToDb(lookup, dbValues);
  const exactRow = lookup && dbValues.tag_no && !isNew;
  const canSave = anyDb || String(v.issue || '').trim();

  const save = (keepOpen) => {
    if (!canSave) return;
    const status = normalizePfStatus(v.status);
    const out = { ...v, status };
    // The OPS rule: Closed carries a Closed Date, anything else carries none.
    if (status === PF_STATUS.CLOSED && !out.closeout_date) out.closeout_date = todayKeyLocal();
    if (status !== PF_STATUS.CLOSED) out.closeout_date = '';
    out.updated_date = todayKeyLocal();
    for (const f of PF_DB_FIELDS) out[f] = String(out[f] || '').replace(/\s+/g, ' ').trim();
    onSave(out, { keepOpen });
    if (keepOpen) {
      // Next finding: often the same equipment — keep the equipment, clear the finding.
      setV((cur) => ({
        ...cur, id: makePfId(), issue: '', action: '', remark: '', status: PF_STATUS.OPEN, closeout_date: '',
        open_date: todayKeyLocal(), updated_date: todayKeyLocal(), photos: [],
      }));
      setTouched(false);
      setTimeout(() => document.querySelector('[data-pf-issue]')?.focus(), 30);
    }
  };

  const close = () => {
    if (touched) { setAskClose(true); return; }
    onClose();
  };

  const dateField = (field, label) => (
    <div>
      <label className="block text-[10.5px] font-bold uppercase tracking-wide text-slate-500 mb-0.5">
        <span className="px-1 rounded bg-slate-200 text-slate-700 mr-1">{pfColLetter(field)}</span>{label}
      </label>
      <div className="border border-slate-300 rounded-lg bg-white min-h-[38px] flex items-center">
        <DateCell value={v[field] || ''} label={label} isEditing={dateEdit === field}
          onEdit={() => setDateEdit(field)}
          onCommit={(val) => { setDateEdit(null); set({ [field]: val || '' }); }}
          onCancel={() => setDateEdit(null)} displayClassName="text-[13px] text-slate-900 !text-left" />
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[85] flex items-stretch sm:items-center justify-center sm:p-4 bg-slate-900/65" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="w-full sm:max-w-5xl max-h-[100dvh] sm:max-h-[94vh] flex flex-col bg-white sm:rounded-2xl shadow-2xl overflow-hidden"
        onKeyDown={(e) => { if (e.key === 'Escape') close(); }}>
        <div className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b border-slate-200">
          <Database className="w-5 h-5 text-brand-600" />
          <h3 className="flex-1 text-[15px] font-bold text-slate-900">{initial ? 'Edit finding' : 'Add finding'}
            {!initial && belowNo ? <span className="ml-2 text-[12px] font-semibold text-brand-700">— goes right below #{belowNo}</span> : null}
            {!initial && !belowNo ? <span className="ml-2 text-[12px] font-semibold text-slate-500">— placed with the same TagNo (list kept in TagNo order)</span> : null}
          </h3>
          <button type="button" onClick={close} className="p-1 text-slate-500 hover:text-slate-900"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3 space-y-4">
          {/* Equipment, from the database */}
          <section>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-[12.5px] font-bold text-slate-800">Equipment — from the database</span>
              {!lookup && !loadErr && <span className="inline-flex items-center gap-1 text-[11.5px] text-slate-500"><RefreshCw className="w-3 h-3 animate-spin" /> loading…</span>}
              {loadErr && <span className="text-[11.5px] text-rose-700">Database not loaded: {loadErr}</span>}
              {lookup && anyDb && (
                exactRow ? (
                  <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                    <CheckCircle2 className="w-3 h-3" /> Tag + checksheet found in the database
                  </span>
                ) : isNew ? (
                  <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-violet-800 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5">
                    <Sparkles className="w-3 h-3" /> New tag / checksheet — it will be added to the database on save
                  </span>
                ) : candidates.length > 1 ? (
                  <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-sky-800 bg-sky-50 border border-sky-200 rounded-full px-2 py-0.5">
                    {candidates.length} matching rows — pick a TagNo (or ChecksheetType) to finish
                  </span>
                ) : candidates.length === 0 ? (
                  <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                    <AlertTriangle className="w-3 h-3" /> No database row has this combination
                  </span>
                ) : null
              )}
              {anyDb && (
                <button type="button" onClick={clearAll} className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-[11.5px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg">
                  <Eraser className="w-3.5 h-3.5" /> Clear equipment
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-2.5">
              {PF_DB_DISPLAY.map((f, i) => (
                <div key={f} className={f === 'subsystem_desc' || f === 'equipment_name' ? 'lg:col-span-2' : ''}>
                  <DbCombo field={f} value={v[f] || ''} lookup={lookup} values={dbValues}
                    onType={onType} onPick={onPick} onClear={onClear} autoFocus={!initial && !prefill && f === 'tag_no' && !isMobileMode && i === 0} />
                </div>
              ))}
            </div>
          </section>

          {/* I–O typed */}
          <section>
            <div className="text-[12.5px] font-bold text-slate-800 mb-2">Finding — can also be filled in later in the table</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-3 gap-y-2.5">
              <div>
                <label className="block text-[10.5px] font-bold uppercase tracking-wide text-slate-500 mb-0.5"><span className="px-1 rounded bg-slate-200 text-slate-700 mr-1">{pfColLetter('issue')}</span>Issue Description</label>
                <textarea data-pf-issue autoFocus={Boolean(!initial && prefill && !isMobileMode)} rows={3} value={v.issue || ''} onChange={(e) => set({ issue: e.target.value })} className={INPUT} placeholder="What was found" />
              </div>
              <div>
                <label className="block text-[10.5px] font-bold uppercase tracking-wide text-slate-500 mb-0.5"><span className="px-1 rounded bg-slate-200 text-slate-700 mr-1">{pfColLetter('action')}</span>Corrective / Alternative Action</label>
                <textarea rows={3} value={v.action || ''} onChange={(e) => set({ action: e.target.value })} className={INPUT} placeholder="What will be done" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10.5px] font-bold uppercase tracking-wide text-slate-500 mb-0.5"><span className="px-1 rounded bg-slate-200 text-slate-700 mr-1">{pfColLetter('action_by')}</span>Action By</label>
                  <input list="pf-actionby" value={v.action_by || ''} onChange={(e) => set({ action_by: e.target.value })} className={INPUT} placeholder="Free text" />
                  <datalist id="pf-actionby">{actionByOptions.map((a) => <option key={a} value={a} />)}</datalist>
                </div>
                <div>
                  <label className="block text-[10.5px] font-bold uppercase tracking-wide text-slate-500 mb-0.5"><span className="px-1 rounded bg-slate-200 text-slate-700 mr-1">{pfColLetter('status')}</span>Close-out Status</label>
                  <select value={normalizePfStatus(v.status)} onChange={(e) => set({ status: e.target.value, closeout_date: e.target.value === PF_STATUS.CLOSED ? (v.closeout_date || todayKeyLocal()) : '' })} className={INPUT}>
                    {PF_STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {dateField('closeout_date', 'Closed Date')}
                {dateField('open_date', 'Open Date')}
              </div>
              <div className="lg:col-span-2">
                <label className="block text-[10.5px] font-bold uppercase tracking-wide text-slate-500 mb-0.5"><span className="px-1 rounded bg-slate-200 text-slate-700 mr-1">{pfColLetter('remark')}</span>Remark</label>
                <textarea rows={2} value={v.remark || ''} onChange={(e) => set({ remark: e.target.value })} className={INPUT} />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-[10.5px] font-bold uppercase tracking-wide text-slate-500 mb-0.5"><span className="px-1 rounded bg-slate-200 text-slate-700 mr-1">{pfColLetter('photos')}</span>References — pictures and documents (paste, upload, or add later)</label>
                <div className="border border-slate-300 rounded-lg p-1.5 bg-slate-50/50">
                  <PhotoGalleryCell
                    photos={v.photos || []}
                    isMobileView={isMobileMode}
                    isSelected
                    onSelectSlot={() => {}}
                    emptyLabel="No reference yet"
                    onPhotosChange={(next) => set({ photos: next })}
                    onPhotoRemoved={(p) => onPhotoRemoved?.(v, p)}
                    onAttachFile={onAttachFile ? (file, slot) => onAttachFile(v, file, slot) : undefined}
                    onOpenAttachment={(p) => onOpenAttachment?.(p, v)}
                  />
                </div>
              </div>
            </div>
          </section>
        </div>

        {askClose && (
          <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-2 border-t border-amber-200 bg-amber-50 text-[12.5px] text-amber-900">
            <AlertTriangle className="w-4 h-4" />
            <span className="flex-1">Close without saving? What you typed in this form will be lost.</span>
            <button type="button" onClick={() => setAskClose(false)} className="px-2.5 py-1 font-bold bg-white border border-amber-300 rounded-lg">Keep editing</button>
            <button type="button" onClick={() => { setAskClose(false); onClose(); }} className="px-2.5 py-1 font-bold text-white bg-rose-600 rounded-lg">Discard</button>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2 px-4 sm:px-5 py-3 border-t border-slate-200 bg-slate-50">
          {!canSave && <span className="mr-auto text-[11.5px] text-slate-500">Fill a TagNo (or any equipment field) or the Issue Description to save.</span>}
          <button type="button" onClick={close} className="px-3 py-2 text-[13px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg">Cancel</button>
          {!initial && (
            <button type="button" onClick={() => save(true)} disabled={!canSave}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-bold text-brand-700 bg-brand-50 border border-brand-200 hover:bg-brand-100 rounded-lg disabled:opacity-40">
              <Plus className="w-4 h-4" /> Save &amp; add another
            </button>
          )}
          <button type="button" onClick={() => save(false)} disabled={!canSave}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-40">
            <Save className="w-4 h-4" /> {initial ? 'Save changes' : 'Save finding'}
          </button>
        </div>
      </div>
    </div>
  );
}
