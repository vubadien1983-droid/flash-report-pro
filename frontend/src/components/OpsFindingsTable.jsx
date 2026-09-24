import React, { useState } from 'react';
import { Plus, Trash2, CornerDownRight, FolderPlus } from 'lucide-react';
import { TextCell, DateCell } from './PlanCell';
import PhotoGalleryCell from './PhotoGalleryCell';
import {
  OPS_STATUS_OPTIONS, OPS_STATUS_STYLE, normalizeOpsStatus, formatOpsDate,
  photosOf, nextSlotFor,
} from '../services/opsFindings';

/**
 * The OPS Findings table (laptop) and cards (phone).
 *
 * Same editing model as the Mini Plan (BUG-024): a cell is TEXT until it is
 * double-clicked, only the ONE open cell is a form control, and a cell commits
 * when it closes — one edit is one save, never one save per keystroke. Dates
 * open on a single click through the app's own picker (BUG-028).
 *
 * Every handler addresses a row by its INDEX in the real items array, never by
 * its position on screen: the filter hands this component a subset carrying
 * the original indices, so numbering and edits are unaffected by filtering.
 */

const TEXT_COLS = {
  system:          { ph: 'System / package / location', w: 'min-w-[150px] w-[150px]' },
  description:     { ph: 'Finding description', w: 'min-w-[260px] w-[260px]' },
  action:          { ph: 'Corrective action', w: 'min-w-[210px] w-[210px]' },
  reference:       { ph: 'PQPOC spec / standard', w: 'min-w-[130px] w-[130px]' },
  raised_by:       { ph: 'Raised by', w: 'min-w-[96px] w-[96px]' },
  pic:             { ph: 'PIC', w: 'min-w-[120px] w-[120px]' },
  remark:          { ph: 'Remark', w: 'min-w-[230px] w-[230px]' },
  closeout_status: { ph: 'Close-out status', w: 'min-w-[170px] w-[170px]' },
};

const HEAD = [
  ['No', 'min-w-[44px] w-[44px] text-center'],
  ['System/ Package/ Location', TEXT_COLS.system.w],
  ['Finding Description', TEXT_COLS.description.w],
  ['Corrective Action', TEXT_COLS.action.w],
  ['Reference to PQPOC Spec / Standard', TEXT_COLS.reference.w],
  ['Raise By', TEXT_COLS.raised_by.w],
  ['Photo Reference', 'min-w-[200px] w-[200px]'],
  ['Open Date', 'min-w-[92px] w-[92px] text-center'],
  ['PIC', TEXT_COLS.pic.w],
  ['Status', 'min-w-[104px] w-[104px] text-center'],
  ['Close-out Date', 'min-w-[92px] w-[92px] text-center'],
  ['Remark', TEXT_COLS.remark.w],
  ['Close-out status', TEXT_COLS.closeout_status.w],
  ['Updated Date', 'min-w-[92px] w-[92px] text-center'],
  ['Close-out references', 'min-w-[210px] w-[210px]'],
];

const cellText = 'text-[12.5px] leading-snug text-slate-900';
const inputText = 'w-full text-[12.5px] leading-snug text-slate-900 bg-white border border-slate-200 rounded-md px-2 py-1.5';

export function OpsStatusCell({ value, isEditing, onEdit, onCommit, onCancel, readOnly }) {
  const st = normalizeOpsStatus(value);
  const s = OPS_STATUS_STYLE[st];
  if (!isEditing) {
    return (
      <div className="flex justify-center" onDoubleClick={readOnly ? undefined : onEdit} onClick={readOnly ? undefined : onEdit}>
        <span
          title={readOnly ? st : 'Click to change the status'}
          className={`inline-block min-w-[80px] text-center px-2 py-1 rounded-md text-[12px] font-bold border ${s.badge} ${readOnly ? '' : 'cursor-pointer hover:brightness-105'}`}
        >
          {st}
        </span>
      </div>
    );
  }
  return (
    <select
      autoFocus
      value={st}
      onChange={(e) => onCommit(e.target.value)}
      onBlur={onCancel}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } }}
      className="w-full text-[12.5px] font-bold rounded-md border px-1.5 py-1.5 outline-none ring-2 ring-brand-500 bg-white text-slate-900"
    >
      {OPS_STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function SectionHeader({ section, colSpan, readOnly, onRename, onAddRow, count }) {
  const [editing, setEditing] = useState(false);
  return (
    <tr className="bg-slate-800">
      <td colSpan={colSpan} className="px-2 py-1.5 sticky left-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-[240px] max-w-[640px]">
            <TextCell
              value={section}
              placeholder="Section name"
              readOnly={readOnly}
              isEditing={editing}
              onEdit={() => { if (!readOnly) setEditing(true); }}
              onCommit={(v) => { setEditing(false); if (v.trim() && v.trim() !== section) onRename(v.trim()); }}
              onCancel={() => setEditing(false)}
              displayClassName="text-[13px] font-bold text-white hover:!bg-slate-700"
              inputClassName="w-full text-[13px] font-bold text-slate-900 bg-white rounded-md px-2 py-1"
            />
          </div>
          <span className="text-[11px] font-semibold text-slate-300">{count} finding{count === 1 ? '' : 's'}</span>
          {!readOnly && (
            <button
              type="button"
              onClick={onAddRow}
              className="ml-1 inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-white bg-brand-600 hover:bg-brand-500 rounded-md"
              title={`Add a finding at the end of "${section}"`}
            >
              <Plus className="w-3 h-3" /> Add finding
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

/**
 * One cell of either photo column. Column G takes pictures only; column O
 * (close-out references) takes pictures AND documents.
 */
function PhotoColumnCell({ item, index, col, readOnly, isMobileMode, selected, onSelect, api }) {
  const list = photosOf(item, col);
  return (
    <PhotoGalleryCell
      photos={list}
      compact
      readOnly={readOnly}
      isMobileView={isMobileMode}
      isSelected={selected}
      onSelectSlot={onSelect}
      nextSlot={nextSlotFor(col)}
      emptyLabel={col === 'O' ? 'No reference' : 'No photo'}
      onPhotosChange={(next) => api.setColumnPhotos(item.id, col, next)}
      onPhotoClick={(entry, rowEntries) => api.onPhotoClick?.(entry, rowEntries, index)}
      onPhotoRemoved={(p) => api.onPhotoRemoved?.(item, p)}
      onAttachFile={col === 'O' && api.onAttachFile ? (file, slot) => api.onAttachFile(item, index, file, slot) : undefined}
      onOpenAttachment={(p) => api.onOpenAttachment?.(p, item, index)}
    />
  );
}

const Row = React.memo(function Row({ item, index, no, editingField, readOnly, isMobileMode, selectedCol, api }) {
  const st = normalizeOpsStatus(item.status);
  const style = OPS_STATUS_STYLE[st];
  const ed = (field) => ({
    isEditing: editingField === field,
    onEdit: () => api.beginEdit(item.id, field),
    onCommit: (v) => api.commit(item.id, field, v),
    onCancel: api.cancel,
    readOnly,
  });
  const text = (field) => (
    <td key={field} className={`align-top px-0.5 py-0.5 border-b border-r border-slate-200 ${TEXT_COLS[field].w}`}>
      <TextCell
        value={item[field] || ''}
        placeholder=""
        {...ed(field)}
        displayClassName={cellText}
        inputClassName={inputText}
      />
    </td>
  );
  const date = (field, label) => (
    <td className="align-top px-0.5 py-0.5 border-b border-r border-slate-200">
      {readOnly ? (
        <div className="px-2 py-1.5 text-center text-[12.5px] tabular-nums text-slate-900">{formatOpsDate(item[field]) || '—'}</div>
      ) : (
        <DateCell value={item[field] || ''} label={label} {...ed(field)} displayClassName="text-[12.5px] text-slate-900" />
      )}
    </td>
  );

  return (
    <tr className={`${style.row} group/row`}>
      <td className="align-top text-center px-1 py-2 border-b border-r border-slate-200 text-[12.5px] font-bold text-slate-700 tabular-nums">
        {no}
      </td>
      {text('system')}
      {text('description')}
      {text('action')}
      {text('reference')}
      {text('raised_by')}
      <td className="align-top p-1 border-b border-r border-slate-200">
        <PhotoColumnCell item={item} index={index} col="G" readOnly={readOnly} isMobileMode={isMobileMode}
          selected={selectedCol === 'G'} onSelect={() => api.select(item.id, 'G')} api={api} />
      </td>
      {date('open_date', 'Open date')}
      {text('pic')}
      <td className="align-top px-1 py-1.5 border-b border-r border-slate-200">
        <OpsStatusCell value={item.status} {...ed('status')} />
      </td>
      {date('closeout_date', 'Close-out date')}
      {text('remark')}
      {text('closeout_status')}
      {date('updated_date', 'Updated date')}
      <td className="align-top p-1 border-b border-r border-slate-200">
        <PhotoColumnCell item={item} index={index} col="O" readOnly={readOnly} isMobileMode={isMobileMode}
          selected={selectedCol === 'O'} onSelect={() => api.select(item.id, 'O')} api={api} />
      </td>
      {!readOnly && (
        <td className="align-top px-1 py-1.5 border-b border-slate-200 bg-white/60">
          <div className="flex flex-col gap-1 items-center">
            <button type="button" onClick={() => api.insertBelow(index)} title="Insert a finding below this one"
              className="p-1 rounded-md text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200">
              <CornerDownRight className="w-3.5 h-3.5" />
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

/** Phone: one card per finding, the same cells stacked. */
const Card = React.memo(function Card({ item, index, no, editingField, readOnly, selectedCol, api }) {
  const st = normalizeOpsStatus(item.status);
  const style = OPS_STATUS_STYLE[st];
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
        ? <div className="px-2 py-1.5 text-[12.5px] text-slate-900">{formatOpsDate(item[field]) || '—'}</div>
        : <DateCell value={item[field] || ''} label={label} {...ed(field)} displayClassName="text-[12.5px] text-slate-900 !text-left" />}
    </div>
  );
  return (
    <div className={`rounded-xl border border-slate-200 shadow-2xs overflow-hidden ${style.row}`}>
      <div className="flex items-center gap-2 px-3 py-2 bg-white/80 border-b border-slate-200">
        <span className="text-[13px] font-extrabold text-slate-700 tabular-nums">#{no}</span>
        <div className="flex-1 min-w-0 text-[12.5px] font-bold text-slate-900 truncate">{item.system || '—'}</div>
        <div className="w-[108px]"><OpsStatusCell value={item.status} {...ed('status')} /></div>
      </div>
      <div className="p-1.5 space-y-1">
        {line('System / Package / Location', 'system')}
        {line('Finding description', 'description')}
        {line('Corrective action', 'action')}
        <div className="px-1">
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 px-1 mb-0.5">Photo reference</div>
          <PhotoColumnCell item={item} index={index} col="G" readOnly={readOnly} isMobileMode
            selected={selectedCol === 'G'} onSelect={() => api.select(item.id, 'G')} api={api} />
        </div>
        <div className="flex flex-wrap gap-1">
          {dateLine('Open date', 'open_date')}
          {dateLine('Close-out date', 'closeout_date')}
          {dateLine('Updated', 'updated_date')}
        </div>
        {line('PIC', 'pic')}
        {line('Raise by', 'raised_by')}
        {line('Reference (PQPOC spec / standard)', 'reference')}
        {line('Remark', 'remark')}
        {line('Close-out status', 'closeout_status')}
        <div className="px-1">
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 px-1 mb-0.5">Close-out references</div>
          <PhotoColumnCell item={item} index={index} col="O" readOnly={readOnly} isMobileMode
            selected={selectedCol === 'O'} onSelect={() => api.select(item.id, 'O')} api={api} />
        </div>
        {!readOnly && (
          <div className="flex gap-2 pt-1 px-1">
            <button type="button" onClick={() => api.insertBelow(index)}
              className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg text-[12px] font-bold text-brand-700 bg-brand-50 border border-brand-200">
              <CornerDownRight className="w-3.5 h-3.5" /> Insert below
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

export default function OpsFindingsTable({
  groups,            // [{ section, rows: [{ item, index, no }] }]
  readOnly = false,
  isMobileMode = false,
  editing,           // { id, field } | null
  selected,          // { id, col } | null
  api,
  emptyText = 'No findings match the filter.',
  showSections = true,   // false on a section tab: the tab IS the section
}) {
  const colSpan = HEAD.length + (readOnly ? 0 : 1);

  if (!groups.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-[13px] text-slate-500">
        {emptyText}
      </div>
    );
  }

  if (isMobileMode) {
    return (
      <div className="space-y-3">
        {groups.map((g, gi) => (
          <div key={`${g.section}_${gi}`} className="space-y-2">
            {showSections && <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 text-white">
              <FolderPlus className="w-4 h-4 text-brand-300" />
              <span className="flex-1 text-[13px] font-bold">{g.section}</span>
              {!readOnly && (
                <button type="button" onClick={() => api.addToSection(g.section, g.rows[g.rows.length - 1]?.index)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold bg-brand-600 rounded-md">
                  <Plus className="w-3 h-3" /> Add
                </button>
              )}
            </div>}
            {g.rows.map(({ item, index, no }) => (
              <Card key={item.id} item={item} index={index} no={no} readOnly={readOnly}
                editingField={editing?.id === item.id ? editing.field : null}
                selectedCol={selected?.id === item.id ? selected.col : null}
                api={api} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-auto max-h-[calc(100vh-270px)] min-h-[320px]">
      <table className="border-separate border-spacing-0 text-left table-fixed">
        <thead>
          <tr>
            {HEAD.map(([label, w]) => (
              <th key={label}
                className={`sticky top-0 z-10 bg-[#1F3A5F] text-white text-[11.5px] font-bold px-2 py-2 border-r border-slate-600 align-middle leading-tight ${w}`}>
                {label}
              </th>
            ))}
            {!readOnly && <th className="sticky top-0 z-10 bg-[#1F3A5F] text-white text-[11px] font-bold px-1 py-2 min-w-[44px] w-[44px]" />}
          </tr>
        </thead>
        <tbody>
          {groups.map((g, gi) => (
            <React.Fragment key={`${g.section}_${gi}`}>
              {showSections && <SectionHeader
                section={g.section}
                colSpan={colSpan}
                readOnly={readOnly}
                count={g.rows.length}
                onRename={(name) => api.renameSection(g.rows.map((r) => r.index), name)}
                onAddRow={() => api.addToSection(g.section, g.rows[g.rows.length - 1]?.index)}
              />}
              {g.rows.map(({ item, index, no }) => (
                <Row key={item.id} item={item} index={index} no={no} readOnly={readOnly}
                  isMobileMode={false}
                  editingField={editing?.id === item.id ? editing.field : null}
                  selectedCol={selected?.id === item.id ? selected.col : null}
                  api={api} />
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
