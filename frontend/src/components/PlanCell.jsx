import React, { useState, useEffect, useRef } from 'react';
import { CalendarDays } from 'lucide-react';
import { STATUS_OPTIONS, STATUS_STYLE, normalizeStatus, scheduleKey } from '../services/miniPlan';
import { formatDateKey } from '../services/dateInput';
import DatePopover from './DatePopover';

/**
 * The cells of the Mini Plan table. Two things make them what they are:
 *
 * 1. A cell is TEXT until it is double-clicked. A single click does nothing.
 *    The plan is a live document that a dozen people read during a meeting,
 *    and a stray click into a 500-row grid used to change real work silently.
 *    Double-click is the smallest gesture that cannot happen by accident.
 *
 * 2. Because of that, the table renders ~3,000 plain <div>s instead of ~3,000
 *    form controls, and only the ONE cell being edited is an input. That is
 *    also why typing no longer stutters: a keystroke stays inside the open
 *    cell's own state, so nothing above it re-renders and nothing is saved
 *    until the cell is closed. See ERROR_LOG BUG-024.
 *
 * The parent owns "which cell is open" — one at a time, by design. It also
 * locks the filters while a cell is open, so the row being typed into cannot
 * slide away underneath the cursor.
 */

const EDIT_RING = 'ring-2 ring-brand-500 ring-offset-0';

/** Shared behaviour: what a closed cell looks like and how it opens. */
function ClosedCell({ children, onEdit, readOnly, className = '', title }) {
  return (
    <div
      onDoubleClick={onEdit}
      title={title || (readOnly
        ? 'Locked — enter the project password to edit'
        : 'Double-click to edit')}
      className={`rounded-md px-2 py-1.5 transition-colors ${
        readOnly ? '' : 'hover:bg-white/80 hover:ring-1 hover:ring-slate-200 cursor-text'
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function TextCell({
  value = '',
  placeholder = '',
  isEditing = false,
  onEdit,
  onCommit,
  onCancel,
  readOnly = false,
  displayClassName = '',
  inputClassName = '',
}) {
  const [draft, setDraft] = useState(value ?? '');

  // Re-seed from the record each time the cell is opened, never while it is
  // open: a remote sync landing mid-sentence must not rewrite what is being
  // typed (BUG-001's rule, one cell down).
  useEffect(() => { if (isEditing) setDraft(value ?? ''); }, [isEditing]);

  if (!isEditing) {
    return (
      <ClosedCell onEdit={onEdit} readOnly={readOnly} className={`whitespace-pre-wrap break-words ${displayClassName}`}>
        {value
          ? value
          : <span className="text-slate-400 italic">{placeholder || '—'}</span>}
      </ClosedCell>
    );
  }

  // The mirror keeps the box the height of its content without measuring
  // anything (BUG-021). Only one of these exists at a time now.
  const cell = { gridArea: '1 / 1 / 2 / 2' };
  return (
    <div className="grid w-full">
      <div aria-hidden="true" style={cell} className={`${inputClassName} invisible whitespace-pre-wrap break-words`}>
        {`${draft || placeholder || ''} `}
      </div>
      <textarea
        autoFocus
        style={cell}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onCommit(draft); }
        }}
        placeholder={placeholder}
        className={`${inputClassName} overflow-hidden resize-none outline-none ${EDIT_RING}`}
      />
    </div>
  );
}

/** Human form of a stored date, so the table reads like the exports. */
export function formatCellDate(value) {
  return formatDateKey(scheduleKey(value));
}

/**
 * A date in the plan. Closed it is plain text; a SINGLE click opens the
 * picker, because opening a calendar changes nothing and a date is the field
 * people update most often — double-click stays the rule for the cells that
 * take free text, where a stray click could overwrite real work.
 *
 * The picker itself lives in DatePopover: no native date box, no commit until
 * the user says so, and no closing on blur. See BUG-028.
 */
export function DateCell({
  value = '',
  isEditing = false,
  onEdit,
  onCommit,
  onCancel,
  readOnly = false,
  displayClassName = '',
  note = null,
  label = 'Date',
}) {
  const ref = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const key = scheduleKey(value);

  // The popover needs a mounted element to hang off, which only exists after
  // this cell has rendered once.
  useEffect(() => { setAnchor(isEditing ? ref.current : null); }, [isEditing]);

  return (
    <>
      <div
        ref={ref}
        onClick={readOnly ? undefined : onEdit}
        onDoubleClick={onEdit}
        title={readOnly
          ? 'Locked — enter the project password to edit'
          : 'Click to pick a date — or type 15/9'}
        className={`rounded-md px-2 py-1.5 text-center tabular-nums transition-colors ${
          readOnly ? '' : 'cursor-pointer hover:bg-white hover:ring-1 hover:ring-brand-300'
        } ${isEditing ? `bg-white ${EDIT_RING}` : ''} ${displayClassName}`}
      >
        {key
          ? formatCellDate(key)
          : (
            <span className="text-slate-400 inline-flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5 opacity-70" />—
            </span>
          )}
        {note}
      </div>

      {isEditing && anchor && (
        <DatePopover
          anchorEl={anchor}
          value={key}
          label={label}
          onPick={(picked) => onCommit(picked)}
          onClose={onCancel}
        />
      )}
    </>
  );
}

export function StatusCell({
  value = '',
  isEditing = false,
  onEdit,
  onCommit,
  onCancel,
  readOnly = false,
}) {
  const st = normalizeStatus(value);
  const s = STATUS_STYLE[st];

  if (!isEditing) {
    return (
      <div
        onDoubleClick={onEdit}
        title={readOnly ? 'Locked — enter the project password to edit' : 'Double-click to change the status'}
        className="flex justify-center"
      >
        <span
          className={`inline-block min-w-[84px] text-center px-2 py-1 rounded-md text-[12px] font-bold border transition-transform ${s.tw} ${
            readOnly ? '' : 'hover:scale-[1.03] cursor-pointer'
          }`}
        >
          {st || '— not started —'}
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
      className={`w-full text-[13px] font-bold rounded-md border px-1.5 py-1.5 outline-none cursor-pointer ${s.tw} ${EDIT_RING}`}
    >
      {STATUS_OPTIONS.map((o) => (
        <option key={o || 'blank'} value={o} className="bg-white text-black font-semibold">
          {o || '— not started —'}
        </option>
      ))}
    </select>
  );
}
