import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Eraser, X, CornerDownLeft } from 'lucide-react';
import { todayKey } from '../services/miniPlan';
import {
  MONTH_LONG, WEEKDAY_SHORT, monthGrid, addDays, addMonths, keyParts,
  makeKey, nextWeekday, parseDateInput, formatDateKey, formatDateLong,
} from '../services/dateInput';

/**
 * The plan's date editor.
 *
 * It replaces <input type="date">, which was wrong here for three reasons the
 * user hit every day (BUG-028):
 *
 *   1. The native box fires a change for every complete-looking value, so
 *      typing the year "2026" one digit at a time wrote the year 0002 and
 *      closed the cell before the user reached the second digit.
 *   2. Its segments are ordered by the machine's locale (mm/dd/yyyy on this
 *      laptop) while the plan is written dd/mm — so the day landed in the
 *      month, and the caret jumped between segments on its own.
 *   3. Opening its calendar moved focus off the input, and the cell closed on
 *      blur, taking the calendar with it.
 *
 * This one: opens on a single click, keeps the caret in one plain text box,
 * accepts anything a person would write (15, 15/9, 15 sep, +1w, today),
 * previews what it understood, and only writes when Enter is pressed or a day
 * is clicked. Nothing closes it except Escape, a click outside, or a pick.
 */

const CELL = 'w-9 h-8 rounded-md text-[12.5px] font-semibold tabular-nums transition-colors';
const CHIP = 'px-2 py-1 rounded-md text-[11.5px] font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700';

const POP_W = 272;
const POP_H = 372;

function place(rect) {
  const gapBelow = window.innerHeight - rect.bottom;
  const top = (gapBelow < POP_H && rect.top > gapBelow)
    ? Math.max(8, rect.top - POP_H - 6)
    : Math.min(rect.bottom + 6, window.innerHeight - POP_H - 8);
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - POP_W - 8);
  return { top: Math.max(8, top), left };
}

export default function DatePopover({
  anchorEl,
  value = '',
  label = 'Date',
  onPick,
  onClose,
  today = todayKey(),
}) {
  const boxRef = useRef(null);
  const current = keyParts(value) ? value : '';
  const [text, setText] = useState('');
  const [cursor, setCursor] = useState(current || today);
  const [view, setView] = useState(() => {
    const p = keyParts(current || today);
    return { y: p.y, m: p.m };
  });
  const [pos, setPos] = useState(() => place(anchorEl.getBoundingClientRect()));

  const viewKey = makeKey(view.y, view.m, 1);
  const typed = parseDateInput(text, today, viewKey);

  // Follow the anchor: the table scrolls under the popover, and a picker that
  // stays behind while its row moves is worse than no picker.
  useLayoutEffect(() => {
    const sync = () => {
      if (!anchorEl.isConnected) { onClose(); return; }
      setPos(place(anchorEl.getBoundingClientRect()));
    };
    window.addEventListener('scroll', sync, true);
    window.addEventListener('resize', sync);
    return () => {
      window.removeEventListener('scroll', sync, true);
      window.removeEventListener('resize', sync);
    };
  }, [anchorEl, onClose]);

  // A click anywhere else closes it — including on another date cell, which
  // then opens its own. Mousedown, not click, so the cell underneath is not
  // also activated.
  useEffect(() => {
    const away = (e) => {
      if (boxRef.current?.contains(e.target)) return;
      if (anchorEl.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', away, true);
    document.addEventListener('touchstart', away, true);
    return () => {
      document.removeEventListener('mousedown', away, true);
      document.removeEventListener('touchstart', away, true);
    };
  }, [anchorEl, onClose]);

  // Typing moves the highlight and the month with it, so what the box
  // understood is visible on the calendar before anything is written.
  useEffect(() => {
    if (!typed) return;
    setCursor(typed);
    const p = keyParts(typed);
    setView((v) => (v.y === p.y && v.m === p.m ? v : { y: p.y, m: p.m }));
  }, [typed]);

  const commit = (key) => { onPick(key || ''); };

  const moveCursor = (days) => {
    const next = addDays(cursor, days);
    setCursor(next);
    const p = keyParts(next);
    setView({ y: p.y, m: p.m });
  };

  const onKeyDown = (e) => {
    switch (e.key) {
      case 'Escape': e.preventDefault(); onClose(); break;
      case 'Enter': e.preventDefault(); commit(typed || cursor); break;
      case 'ArrowLeft': e.preventDefault(); moveCursor(-1); break;
      case 'ArrowRight': e.preventDefault(); moveCursor(1); break;
      case 'ArrowUp': e.preventDefault(); moveCursor(-7); break;
      case 'ArrowDown': e.preventDefault(); moveCursor(7); break;
      case 'PageUp': e.preventDefault(); setView(({ y, m }) => (m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 })); break;
      case 'PageDown': e.preventDefault(); setView(({ y, m }) => (m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 })); break;
      default: break;
    }
  };

  const shiftMonth = (n) => {
    const next = keyParts(addMonths(makeKey(view.y, view.m, 1), n));
    setView({ y: next.y, m: next.m });
  };

  const grid = monthGrid(view.y, view.m);

  return createPortal(
    <div
      ref={boxRef}
      style={{ top: pos.top, left: pos.left, width: POP_W }}
      className="fixed z-[70] bg-white rounded-xl shadow-2xl border border-slate-200 p-2.5 select-none"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="min-w-0">
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
          <div className="text-[12px] font-semibold text-slate-800 truncate">
            {current ? formatDateLong(current) : 'not set'}
          </div>
        </div>
        <button type="button" onClick={onClose} title="Close (Esc)"
          className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">
          <X className="w-4 h-4" />
        </button>
      </div>

      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Type 15/9 · 15 sep · today · +1w"
        className={`w-full text-[13px] rounded-md border px-2 py-1.5 outline-none ${
          text && !typed ? 'border-rose-300 bg-rose-50' : 'border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30'
        }`}
      />
      <div className="h-4 mt-0.5 mb-1 px-0.5 text-[11px] leading-4">
        {text
          ? (typed
            ? <span className="text-emerald-700 font-semibold flex items-center gap-1">
                {formatDateKey(typed)} <CornerDownLeft className="w-3 h-3" /> Enter to save
              </span>
            : <span className="text-rose-600">not a date yet</span>)
          : <span className="text-slate-400">or click a day below</span>}
      </div>

      <div className="flex items-center justify-between mb-1">
        <button type="button" onClick={() => shiftMonth(-1)} title="Previous month"
          className="p-1 rounded-md text-slate-500 hover:bg-slate-100"><ChevronLeft className="w-4 h-4" /></button>
        <div className="text-[12.5px] font-bold text-slate-800">{MONTH_LONG[view.m - 1]} {view.y}</div>
        <button type="button" onClick={() => shiftMonth(1)} title="Next month"
          className="p-1 rounded-md text-slate-500 hover:bg-slate-100"><ChevronRight className="w-4 h-4" /></button>
      </div>

      <div className="grid grid-cols-7 gap-y-0.5 mb-0.5">
        {WEEKDAY_SHORT.map((d) => (
          <div key={d} className="w-9 text-center text-[10px] font-bold text-slate-400">{d[0]}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {grid.map(({ key, inMonth }) => {
          const isValue = key === current;
          const isToday = key === today;
          const isCursor = key === cursor;
          return (
            <button
              key={key}
              type="button"
              onClick={() => commit(key)}
              title={formatDateLong(key)}
              className={`${CELL} ${
                isValue ? 'bg-brand-600 text-white hover:bg-brand-700'
                  : inMonth ? 'text-slate-800 hover:bg-brand-50' : 'text-slate-300 hover:bg-slate-50'
              } ${isCursor && !isValue ? 'ring-2 ring-brand-400' : ''} ${
                isToday && !isValue ? 'ring-1 ring-amber-400 bg-amber-50' : ''
              }`}
            >
              {keyParts(key).d}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-slate-100">
        <button type="button" className={CHIP} onClick={() => commit(today)}>Today</button>
        <button type="button" className={CHIP} onClick={() => commit(addDays(today, 1))}>Tomorrow</button>
        <button type="button" className={CHIP} onClick={() => commit(addDays(current || today, 7))}>+1 week</button>
        <button type="button" className={CHIP} onClick={() => commit(nextWeekday(today, 0))}>Next Mon</button>
        <button type="button" onClick={() => commit('')}
          className="px-2 py-1 rounded-md text-[11.5px] font-semibold border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 flex items-center gap-1">
          <Eraser className="w-3 h-3" /> Clear
        </button>
      </div>
    </div>,
    document.body,
  );
}
