import React, { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

/**
 * The plan's search box — one implementation, used by both tabs.
 *
 * It is DEBOUNCED, and that is not a refinement: measured on the live plan,
 * one keystroke re-rendered 503 preview rows (or 504 editable ones) in
 * **~1,000 ms**, so the box ran a full second behind the typing and the
 * feature felt broken. The input now holds its own draft and commits it
 * `delay` ms after the last keystroke, so the letters appear instantly and
 * the table re-renders once per word instead of once per letter.
 *
 * This is BUG-021's rule in its other form: the per-item cost was never the
 * problem, the number of items is. Anything that re-renders this table must be
 * asked how often it fires.
 *
 * The draft follows the filter when the filter is changed from OUTSIDE (the
 * Clear button, the other tab), which is why `value` is watched.
 */
export default function SearchBox({
  value = '',
  onChange,
  placeholder = 'Search anything - equipment, activity, note, status, date...',
  delay = 250,
  disabled = false,
  className = '',
  inputClassName = 'w-full text-[13px] text-black bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-9 py-2 outline-none focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all placeholder:text-slate-400',
}) {
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);

  // An external change (Clear, or the other tab) wins over the draft.
  useEffect(() => {
    committed.current = value;
    setDraft((d) => (d === value ? d : value));
  }, [value]);

  useEffect(() => {
    if (draft === committed.current) return undefined;
    const t = setTimeout(() => {
      committed.current = draft;
      onChange(draft);
    }, delay);
    return () => clearTimeout(t);
    // `onChange` is recreated every render by the parent; depending on it here
    // would restart the timer on every unrelated render and the commit would
    // never fire while anything else on the page is moving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, delay]);

  const clear = () => {
    setDraft('');
    committed.current = '';
    onChange('');
  };

  return (
    <div className={`relative ${className}`}>
      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="text"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        title={disabled ? 'Filters are locked while a cell is open for editing' : undefined}
        className={inputClassName}
      />
      {draft && !disabled && (
        <button
          type="button"
          onClick={clear}
          title="Clear the search"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
