import React, { useCallback, useEffect, useState } from 'react';

/**
 * Resizable table columns, remembered on THIS device — v3.34.0
 *
 * Drag the right edge of any column header to make that column wider or
 * narrower; double-click the edge to put every column of that table back to
 * its default. The widths are kept in this browser's localStorage, per table
 * kind (`tableId`), so the app and the share link opened on the same device
 * share them, and every other device keeps its own.
 *
 * How it works without slowing a 500-row table down (BUG-021 / BUG-024):
 *  - Nothing is measured while rendering. The header cells are measured ONCE,
 *    when a drag starts, so the whole row of widths becomes explicit.
 *  - While dragging, only two DOM styles are written (the header cell and the
 *    table width). React state — and so a re-render of the rows — changes
 *    once, on release.
 *  - The table is switched to `table-layout: fixed` with an explicit width as
 *    soon as it has saved widths, so a column can also be made NARROWER than
 *    its content's natural minimum (the text wraps).
 *
 * Usage in a table component:
 *   const cw = useColumnWidths('ops');
 *   <table style={cw.tableStyle} …>
 *     <th data-col="description" style={cw.thStyle('description')} className="… relative">
 *       Finding {cw.handle('description')}
 *     </th>
 * Every header cell of the row should carry a `data-col`; one without a handle
 * keeps its width but cannot be dragged (a pinned column, the action column).
 */

const PREFIX = 'fr_colw_v1_';
const MIN_W = 44;

function read(tableId) {
  try {
    const raw = localStorage.getItem(PREFIX + tableId);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && v.cols ? v : null;
  } catch { return null; }
}
function write(tableId, v) {
  try {
    if (v) localStorage.setItem(PREFIX + tableId, JSON.stringify(v));
    else localStorage.removeItem(PREFIX + tableId);
  } catch { /* private mode: widths last for this page only */ }
  try { window.dispatchEvent(new CustomEvent('flashreport:colwidths', { detail: { tableId } })); } catch { /* ignore */ }
}

/** Sum of a saved layout = the table width it needs. */
export function layoutWidth(saved) {
  if (!saved) return 0;
  return Object.values(saved.cols || {}).reduce((a, b) => a + (Number(b) || 0), 0);
}

export function useColumnWidths(tableId) {
  const [saved, setSaved] = useState(() => read(tableId));

  // Another table of the same kind on the page (or a reset) changed it.
  useEffect(() => {
    const on = (e) => { if (e.detail?.tableId === tableId) setSaved(read(tableId)); };
    window.addEventListener('flashreport:colwidths', on);
    return () => window.removeEventListener('flashreport:colwidths', on);
  }, [tableId]);

  const tableStyle = saved
    ? { tableLayout: 'fixed', width: `${layoutWidth(saved)}px`, minWidth: 0 }
    : undefined;

  const thStyle = useCallback((key) => {
    const w = saved?.cols?.[key];
    return w ? { width: `${w}px`, minWidth: `${w}px`, maxWidth: `${w}px` } : undefined;
  }, [saved]);

  const reset = useCallback(() => { write(tableId, null); setSaved(null); }, [tableId]);

  const onPointerDown = useCallback((e, key) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const handleEl = e.currentTarget;
    const th = handleEl.closest('th');
    const table = th?.closest('table');
    if (!th || !table) return;

    // Measure the header row once: every column gets an explicit width.
    const cells = Array.from(th.parentElement.children).filter((c) => c.tagName === 'TH');
    const cols = {};
    cells.forEach((c, i) => {
      const k = c.dataset.col || `#${i}`;
      cols[k] = Math.round(c.getBoundingClientRect().width);
    });
    const startX = e.clientX;
    const startW = cols[key] || Math.round(th.getBoundingClientRect().width);
    const others = layoutWidth({ cols }) - startW;

    // Freeze the current layout so nothing jumps when fixed layout kicks in.
    table.style.tableLayout = 'fixed';
    table.style.width = `${others + startW}px`;
    table.style.minWidth = '0px';
    cells.forEach((c, i) => {
      const w = cols[c.dataset.col || `#${i}`];
      c.style.width = c.style.minWidth = c.style.maxWidth = `${w}px`;
    });

    try { handleEl.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    let latest = startW;
    const move = (ev) => {
      latest = Math.max(MIN_W, Math.round(startW + (ev.clientX - startX)));
      th.style.width = th.style.minWidth = th.style.maxWidth = `${latest}px`;
      table.style.width = `${others + latest}px`;
    };
    const up = () => {
      handleEl.removeEventListener('pointermove', move);
      handleEl.removeEventListener('pointerup', up);
      handleEl.removeEventListener('pointercancel', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const next = { cols: { ...cols, [key]: latest } };
      write(tableId, next);
      setSaved(next);
    };
    handleEl.addEventListener('pointermove', move);
    handleEl.addEventListener('pointerup', up);
    handleEl.addEventListener('pointercancel', up);
  }, [tableId]);

  /** The drag handle, placed as the LAST child of a header cell. */
  const handle = useCallback((key) => (
    <span
      role="separator"
      aria-orientation="vertical"
      title="Drag to change the column width · double-click to reset all columns"
      onPointerDown={(e) => onPointerDown(e, key)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        const table = e.currentTarget.closest('table');
        if (table) {
          table.style.tableLayout = table.style.width = table.style.minWidth = '';
          table.querySelectorAll('thead th').forEach((c) => { c.style.width = c.style.minWidth = c.style.maxWidth = ''; });
        }
        reset();
      }}
      className="group/cr absolute top-0 right-0 z-30 h-full w-[9px] cursor-col-resize touch-none select-none flex justify-end"
    >
      <span className="h-full w-[3px] rounded-full bg-transparent group-hover/cr:bg-sky-400 transition-colors" />
    </span>
  ), [onPointerDown, reset]);

  return { saved, tableStyle, thStyle, handle, reset, customised: Boolean(saved) };
}
