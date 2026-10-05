import React from 'react';
import { useColumnWidths } from './ColumnResize';
import { Trash2, Pencil, AlertTriangle, Plus } from 'lucide-react';
import { TextCell, DateCell } from './PlanCell';
import PhotoGalleryCell from './PhotoGalleryCell';
import { OpsStatusCell } from './OpsFindingsTable';
import {
  PF_COLUMNS, PF_STATUS_STYLE, normalizePfStatus, formatPfDate, pfOpenDays,
} from '../services/preservationFindings';

/**
 * The Preservation findings table (laptop) and cards (phone).
 *
 * The OPS editing model (BUG-024): a cell is TEXT until it is double-clicked,
 * only the ONE open cell is a form control, a cell commits when it closes.
 * COLUMN ORDER = PF_COLUMNS (v3.31.1): TagNo, EquipmentName and the finding
 * (Issue … References) first, so they fit a laptop screen without scrolling
 * sideways; No + TagNo stay pinned on the left when the table IS scrolled.
 * The equipment columns belong to the lookup database, so double-clicking
 * one of them opens the finding in the FORM (where the database suggestions and the
 * auto-fill live) instead of a bare text box. I, J, K, N edit in place; the
 * status and the dates open on a single click (BUG-028's picker).
 *
 * Rows are addressed by the item's INDEX in the real items array — the filter
 * hands this component a subset carrying the original indices.
 */

// Widths: the first ten (No … References) add up to ~1,390 px, which fits the
// report area of a 1920-px laptop screen with the report list open.
const W = {
  no: 'min-w-[40px] w-[40px]',
  tag_no: 'min-w-[124px] w-[124px]',
  equipment_name: 'min-w-[150px] w-[150px]',
  issue: 'min-w-[240px] w-[240px]',
  action_by: 'min-w-[100px] w-[100px]',
  action: 'min-w-[210px] w-[210px]',
  status: 'min-w-[98px] w-[98px]',
  closeout_date: 'min-w-[84px] w-[84px]',
  remark: 'min-w-[170px] w-[170px]',
  photos: 'min-w-[176px] w-[176px]',
  checksheet_type: 'min-w-[86px] w-[86px]',
  interval: 'min-w-[70px] w-[70px]',
  subsystem: 'min-w-[96px] w-[96px]',
  subsystem_desc: 'min-w-[190px] w-[190px]',
  discipline: 'min-w-[92px] w-[92px]',
  facility: 'min-w-[96px] w-[96px]',
  open_date: 'min-w-[88px] w-[88px]',
  updated_date: 'min-w-[88px] w-[88px]',
};

// Header labels in the order of PF_COLUMNS (the single statement of the order).
const SHORT = { interval: 'Interval', checksheet_type: 'Checksheet Type', subsystem_desc: 'Subsystem Description', equipment_name: 'Equipment Name', discipline: 'Discipline Code', facility: 'Facility Code' };
const HEAD = [['No', 'no', '', false], ...PF_COLUMNS.map((c) => [SHORT[c.key] || c.label, c.key, c.col, Boolean(c.db)])];

// Opaque twins of the row tints (OPS_STATUS_STYLE.row is translucent).
const PIN_BG = { Open: 'bg-rose-50', 'On-going': 'bg-amber-50', Closed: 'bg-emerald-50' };

// No and TagNo are pinned while the table scrolls sideways.
const PIN = { no: 'sticky left-0 z-[2]', tag_no: 'sticky left-[40px] z-[2] shadow-[2px_0_0_0_#CBD5E1]' };

const cellText = 'text-[12.5px] leading-snug text-slate-900';
const inputText = 'w-full text-[12.5px] leading-snug text-slate-900 bg-white border border-slate-200 rounded-md px-2 py-1.5';

function AgeBadge({ item, overdueDays }) {  // days open, beside the status
  const d = pfOpenDays(item);
  if (d === null) return null;
  const late = d > overdueDays;
  return (
    <span className={`inline-flex items-center gap-0.5 mt-0.5 px-1.5 rounded text-[10.5px] font-bold tabular-nums ${late ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}
      title={late ? `Open for ${d} days — more than ${overdueDays}` : `Open for ${d} days`}>
      {late && <AlertTriangle className="w-2.5 h-2.5" />}{d}d
    </span>
  );
}

function Refs({ item, index, readOnly, isMobileMode, selected, api }) {
  return (
    <PhotoGalleryCell
      photos={item.photos || []}
      compact
      readOnly={readOnly}
      isMobileView={isMobileMode}
      isSelected={selected}
      onSelectSlot={() => api.select(item.id)}
      emptyLabel="No reference"
      onPhotosChange={(next) => api.setPhotos(item.id, next)}
      onPhotoClick={(entry, rowEntries) => api.onPhotoClick?.(entry, rowEntries, index)}
      onPhotoRemoved={(p) => api.onPhotoRemoved?.(item, p)}
      onAttachFile={api.onAttachFile ? (file, slot) => api.onAttachFile(item, index, file, slot) : undefined}
      onOpenAttachment={(p) => api.onOpenAttachment?.(p, item, index)}
    />
  );
}

const Row = React.memo(function Row({ item, index, no, editingField, readOnly, isMobileMode, selected, api, overdueDays }) {
  const st = normalizePfStatus(item.status);
  const style = PF_STATUS_STYLE[st];
  const ed = (field) => ({
    isEditing: editingField === field,
    onEdit: () => api.beginEdit(item.id, field),
    onCommit: (v) => api.commit(item.id, field, v),
    onCancel: api.cancel,
    readOnly,
  });
  const td = (field, children, extra = '') => (
    <td key={field} className={`align-top px-0.5 py-0.5 border-b border-r border-slate-200 ${W[field]} ${extra}`}>{children}</td>
  );
  const dbCell = (field, bold = false, extra = '') => td(field, (
    <div
      onDoubleClick={readOnly ? undefined : () => api.openForm(index, field)}
      title={readOnly ? undefined : 'Double-click to edit the equipment fields in the form (database suggestions)'}
      className={`px-2 py-1.5 whitespace-pre-wrap break-words ${cellText} ${bold ? 'font-bold' : ''} ${readOnly ? '' : 'cursor-default hover:bg-white/70 rounded'}`}>
      {item[field] || <span className="text-slate-300">—</span>}
    </div>
  ), extra);
  const text = (field) => td(field, (
    <TextCell value={item[field] || ''} placeholder="" {...ed(field)} displayClassName={cellText} inputClassName={inputText} />
  ));
  const date = (field, label) => td(field, (
    <div className="flex flex-col items-center">
      {readOnly
        ? <div className="px-2 py-1.5 text-center text-[12.5px] tabular-nums text-slate-900">{formatPfDate(item[field]) || '—'}</div>
        : <DateCell value={item[field] || ''} label={label} {...ed(field)} displayClassName="text-[12.5px] text-slate-900" />}
    </div>
  ));

  // A pinned cell needs an OPAQUE background, or the scrolled cells show through.
  const pinBg = PIN_BG[st] || 'bg-white';
  const cells = {
    tag_no: dbCell('tag_no', true, `${PIN.tag_no} ${pinBg}`),
    equipment_name: dbCell('equipment_name'),
    issue: text('issue'),
    action_by: text('action_by'),
    action: text('action'),
    status: td('status', (
      <div className="py-1 flex flex-col items-center gap-0.5">
        <OpsStatusCell value={item.status} {...ed('status')} />
        <AgeBadge item={item} overdueDays={overdueDays} />
      </div>
    )),
    closeout_date: date('closeout_date', 'Closed date'),
    remark: text('remark'),
    photos: td('photos', <div className="p-0.5"><Refs item={item} index={index} readOnly={readOnly} isMobileMode={isMobileMode} selected={selected} api={api} /></div>),
    checksheet_type: dbCell('checksheet_type'),
    interval: dbCell('interval'),
    subsystem: dbCell('subsystem'),
    subsystem_desc: dbCell('subsystem_desc'),
    discipline: dbCell('discipline'),
    facility: dbCell('facility'),
    open_date: date('open_date', 'Open date'),
    updated_date: date('updated_date', 'Updated date'),
  };

  return (
    <tr className={style.row}>
      <td className={`align-top text-center px-1 py-2 border-b border-r border-slate-200 text-[12.5px] font-bold text-slate-700 tabular-nums ${PIN.no} ${pinBg}`}>{no}</td>
      {PF_COLUMNS.map((c) => <React.Fragment key={c.key}>{cells[c.key]}</React.Fragment>)}
      {!readOnly && (
        <td className="align-top px-1 py-1.5 border-b border-slate-200 bg-white/60">
          <div className="flex flex-col gap-1 items-center">
            <button type="button" onClick={() => api.addBelow(index)} title="Add a finding right below this one (same equipment filled in)"
              className="p-1 rounded-md text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200">
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => api.openForm(index)} title="Edit this finding in the form"
              className="p-1 rounded-md text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => api.askDelete(index)} title="Delete this finding"
              className="p-1 rounded-md text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
});

const Card = React.memo(function Card({ item, index, no, editingField, readOnly, selected, api, overdueDays }) {
  const st = normalizePfStatus(item.status);
  const style = PF_STATUS_STYLE[st];
  const ed = (field) => ({
    isEditing: editingField === field,
    onEdit: () => api.beginEdit(item.id, field),
    onCommit: (v) => api.commit(item.id, field, v),
    onCancel: api.cancel,
    readOnly,
  });
  const line = (label, field) => (
    <div key={field}>
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 px-2">{label}</div>
      <TextCell value={item[field] || ''} placeholder={readOnly ? '—' : `Add ${label.toLowerCase()}`} {...ed(field)}
        displayClassName={cellText} inputClassName={inputText} />
    </div>
  );
  const dateLine = (label, field) => (
    <div className="flex-1 min-w-[96px]">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 px-2">{label}</div>
      {readOnly
        ? <div className="px-2 py-1.5 text-[12.5px] text-slate-900">{formatPfDate(item[field]) || '—'}</div>
        : <DateCell value={item[field] || ''} label={label} {...ed(field)} displayClassName="text-[12.5px] text-slate-900 !text-left" />}
    </div>
  );
  return (
    <div className={`rounded-xl border border-slate-200 shadow-2xs overflow-hidden ${style.row}`}>
      <div className="flex items-center gap-2 px-3 py-2 bg-white/80 border-b border-slate-200">
        <span className="text-[13px] font-extrabold text-slate-700 tabular-nums">#{no}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-bold text-slate-900 truncate">{item.tag_no || '—'} <span className="font-semibold text-slate-500">{item.checksheet_type}</span></div>
          <div className="text-[11px] text-slate-600 truncate">{item.equipment_name}</div>
        </div>
        <AgeBadge item={item} overdueDays={overdueDays} />
        <div className="w-[108px]"><OpsStatusCell value={item.status} {...ed('status')} /></div>
      </div>
      <div className="p-1.5 space-y-1">
        {line('Issue description', 'issue')}
        {line('Action by', 'action_by')}
        {line('Corrective / alternative action', 'action')}
        <div className="flex flex-wrap gap-1">
          {dateLine('Closed date', 'closeout_date')}
          {dateLine('Open date', 'open_date')}
          {dateLine('Updated', 'updated_date')}
        </div>
        {line('Remark', 'remark')}
        <div className="px-1">
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 px-1 mb-0.5">References</div>
          <Refs item={item} index={index} readOnly={readOnly} isMobileMode selected={selected} api={api} />
        </div>
        <button type="button" disabled={readOnly} onClick={() => api.openForm(index)}
          className="w-full text-left px-2 py-1.5 rounded-lg bg-white/70 border border-slate-200 text-[11.5px] text-slate-700 leading-snug">
          <span className="font-semibold">{item.checksheet_type || '—'}</span> · Interval {item.interval || '—'} · {item.subsystem || '—'}
          <span className="block text-slate-500">{item.subsystem_desc} · {item.discipline || '—'} · {item.facility || '—'}</span>
          {!readOnly && <span className="block text-brand-700 font-bold mt-0.5">Tap to edit the equipment fields</span>}
        </button>
        {!readOnly && (
          <div className="flex gap-2 pt-1 px-1">
            <button type="button" onClick={() => api.addBelow(index)}
              className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg text-[12px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200">
              <Plus className="w-3.5 h-3.5" /> Add below
            </button>
            <button type="button" onClick={() => api.openForm(index)}
              className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg text-[12px] font-bold text-brand-700 bg-brand-50 border border-brand-200">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
            <button type="button" onClick={() => api.askDelete(index)}
              className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg text-[12px] font-bold text-rose-700 bg-rose-50 border border-rose-200">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

export default function PreservationTable({
  rows,              // [{ item, index, no }]
  readOnly = false,
  isMobileMode = false,
  editing,
  selected,          // item id of the selected References cell
  api,
  overdueDays = 14,
  emptyText = 'No findings match the filter.',
  fill = false,
}) {
  const cw = useColumnWidths('preservation');
  if (!rows.length) {
    return <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-[13px] text-slate-500">{emptyText}</div>;
  }
  if (isMobileMode) {
    return (
      <div className="space-y-2">
        {rows.map(({ item, index, no }) => (
          <Card key={item.id} item={item} index={index} no={no} readOnly={readOnly} overdueDays={overdueDays}
            editingField={editing?.id === item.id ? editing.field : null}
            selected={selected === item.id} api={api} />
        ))}
      </div>
    );
  }
  return (
    <div className={`bg-white border border-slate-200 rounded-xl shadow-xs overflow-auto ${fill ? 'h-full min-h-[240px]' : 'max-h-[calc(100dvh-300px)] min-h-[320px]'}`}>
      <table className="border-separate border-spacing-0 text-left table-fixed" style={cw.tableStyle}>
        <thead>
          <tr>
            {HEAD.map(([label, key, letter, db]) => (
              <th key={key} data-col={key} style={cw.thStyle(key)} className={`sticky top-0 ${PIN[key] ? `${PIN[key].replace('z-[2]', 'z-20')}` : 'z-10'} ${db ? 'bg-[#3B6B9E]' : 'bg-[#1F3A5F]'} text-white text-[11.5px] font-bold px-2 py-1.5 border-r border-slate-600 align-middle leading-tight ${W[key]} ${key === 'no' ? 'text-center' : ''}`}
                title={db ? 'From the Preservation database' : undefined}>
                {letter && <span className="block text-[9.5px] font-semibold text-slate-300">{letter}</span>}
                {label}
                {/* No stays fixed: TagNo is pinned at its right edge. */}
                {key !== 'no' && cw.handle(key)}
              </th>
            ))}
            {!readOnly && <th data-col="_act" className="sticky top-0 z-10 bg-[#1F3A5F] min-w-[44px] w-[44px]" />}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ item, index, no }) => (
            <Row key={item.id} item={item} index={index} no={no} readOnly={readOnly} isMobileMode={false} overdueDays={overdueDays}
              editingField={editing?.id === item.id ? editing.field : null}
              selected={selected === item.id} api={api} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
