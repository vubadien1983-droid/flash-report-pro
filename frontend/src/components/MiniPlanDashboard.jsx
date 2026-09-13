import React, { useState } from 'react';
import {
  Search, X, CalendarRange, FileSpreadsheet, FileText, RefreshCw,
  Layers, SearchX, ArrowUpRight,
} from 'lucide-react';
import {
  dashboardView, summaryTiles, describeFilter,
} from '../services/miniPlanDashboard';
import {
  STATUS_STYLE, ROW_STATE_STYLE, rowState, normalizeStatus, scheduleKey,
  todayKey, WEEK_MODE, FOCUS, EMPTY_FILTER, completedKey, isCompletedDateInferred,
} from '../services/miniPlan';
import {
  exportDashboardExcel, exportDashboardPdf,
} from '../services/miniPlanDashboardExport';

/**
 * Tab 1 — "Equipment installation status".
 *
 * A dashboard ON the plan, not a second copy of it. Every number comes from
 * services/miniPlanDashboard.js, which in turn uses the same predicates the
 * Monitoring tab edits through, so the two tabs cannot disagree about what
 * "done", "this week" or "matching" means.
 *
 * Three areas, as specified:
 *   LEFT   - one line per Equipment: done / total activities.
 *   RIGHT  - the six summary figures (each one a filter when clicked), the
 *            search box and the two week buttons.
 *   BELOW  - a flat preview of the data: No, Equipment, Activities, Schedule,
 *            Status, Completed Date. Nothing is merged here, unlike the
 *            Monitoring tab: every row states its own equipment so the table
 *            can be sorted, read and exported line by line.
 *
 * NO PASSWORD. The whole tab is read-only by construction - there is not one
 * editable control on it - so gating it would protect nothing and would make
 * the share link useless to the people it is sent to.
 */

const TONE = {
  slate:   { box: 'bg-slate-50 border-slate-200 hover:border-slate-400',     text: 'text-slate-900',   on: 'ring-slate-500 bg-slate-100' },
  emerald: { box: 'bg-emerald-50 border-emerald-200 hover:border-emerald-400', text: 'text-emerald-700', on: 'ring-emerald-500 bg-emerald-100' },
  sky:     { box: 'bg-sky-50 border-sky-200 hover:border-sky-400',           text: 'text-sky-700',     on: 'ring-sky-500 bg-sky-100' },
  violet:  { box: 'bg-violet-50 border-violet-200 hover:border-violet-400',  text: 'text-violet-700',  on: 'ring-violet-500 bg-violet-100' },
  teal:    { box: 'bg-teal-50 border-teal-200 hover:border-teal-400',        text: 'text-teal-700',    on: 'ring-teal-500 bg-teal-100' },
  amber:   { box: 'bg-amber-50 border-amber-200 hover:border-amber-400',     text: 'text-amber-700',   on: 'ring-amber-500 bg-amber-100' },
};

function fmtDate(key) {
  const k = scheduleKey(key);
  if (!k) return '';
  const [y, m, d] = k.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(d)}-${months[Number(m) - 1]}-${y.slice(2)}`;
}

export default function MiniPlanDashboard({
  items,
  title,
  filter,
  onFilterChange,
  isMobileMode = false,
  onOpenMonitoring,
}) {
  const [busy, setBusy] = useState('');
  const today = todayKey();
  const view = dashboardView(items, filter, today);
  const { stats, equipmentRows, previewRows, range } = view;
  const tiles = summaryTiles(view);

  const setFilter = (patch) => onFilterChange({ ...view.filter, ...patch });

  /** A tile is a toggle: clicking the selected one puts the list back. */
  const clickTile = (tile) => {
    if (tile.key === 'equipment') { setFilter({ equipment: '', focus: FOCUS.ALL }); return; }
    setFilter({ focus: view.filter.focus === tile.focus ? FOCUS.ALL : tile.focus });
  };

  const clickEquipment = (row) => {
    setFilter({ equipment: view.filter.equipment === row.key ? '' : row.key });
  };

  const weekButton = (mode, label) => {
    const on = view.filter.week === mode;
    return (
      <button
        type="button"
        onClick={() => setFilter({ week: on ? WEEK_MODE.NONE : mode })}
        className={`inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-bold rounded-lg border transition-colors ${
          on
            ? 'bg-violet-600 text-white border-violet-700 shadow-sm shadow-violet-600/30'
            : 'bg-white text-black border-slate-300 hover:bg-slate-50'
        }`}
      >
        <CalendarRange className="w-4 h-4" />
        {label}
      </button>
    );
  };

  /**
   * Export what the RIGHT PANEL is showing — the summary figures and the
   * preview rows as filtered, in that order. Exporting the whole plan from a
   * filtered screen would hand the user a file that does not match what they
   * were looking at when they pressed the button.
   */
  const runExport = async (kind) => {
    setBusy(kind);
    try {
      const fn = kind === 'excel' ? exportDashboardExcel : exportDashboardPdf;
      await fn({ title, view });
    } catch (e) {
      console.error('Dashboard export failed:', e);
    } finally {
      setBusy('');
    }
  };

  // ── Left panel: one line per Equipment ──────────────────────────
  const leftPanel = (
    <div className="bg-white rounded-xl shadow-xs border border-slate-200/80 overflow-hidden flex flex-col">
      <div className="px-3 py-2.5 bg-slate-800 text-white flex items-center justify-between gap-2">
        <span className="text-[12px] font-bold uppercase tracking-wider flex items-center gap-1.5">
          <Layers className="w-4 h-4" /> Equipment
        </span>
        <span className="text-[11px] font-bold bg-white/15 px-2 py-0.5 rounded-md tabular-nums">
          {equipmentRows.length}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto] text-[11px] font-bold uppercase tracking-wide text-slate-500 bg-slate-100 border-b border-slate-200 px-3 py-1.5">
        <span>Equipment</span>
        <span>Task</span>
      </div>

      <div className={`overflow-y-auto ${isMobileMode ? 'max-h-[360px]' : 'max-h-[calc(100vh-260px)]'}`}>
        {equipmentRows.length === 0 && (
          <p className="px-3 py-6 text-center text-[12px] text-slate-500">No Equipment in view.</p>
        )}
        {equipmentRows.map((row) => (
          <button
            key={row.key}
            type="button"
            onClick={() => clickEquipment(row)}
            title="Show only this Equipment"
            className={`w-full text-left grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2 border-b border-slate-100 transition-colors ${
              row.selected ? 'bg-violet-50 ring-1 ring-inset ring-violet-400' : 'hover:bg-slate-50'
            }`}
          >
            <span className="text-[12.5px] text-black leading-snug break-words">
              <span className="text-[10px] font-bold text-slate-400 tabular-nums mr-1.5">{row.no || '-'}</span>
              {row.equipment || <em className="text-slate-400">Unnamed</em>}
            </span>
            <span className="text-[12.5px] font-bold tabular-nums whitespace-nowrap">
              <span className="text-emerald-600">{row.done}</span>
              <span className="text-slate-400"> / {row.total}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  // ── Right panel, top: summary + controls ────────────────────────
  const summary = (
    <div className="bg-white rounded-xl shadow-xs border border-slate-200/80 overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-200/80 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={view.filter.search}
            onChange={(e) => setFilter({ search: e.target.value })}
            placeholder="Search anything - equipment, activity, status, date..."
            className="w-full text-[13px] text-black bg-white border border-slate-200 rounded-lg pl-9 pr-9 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all placeholder:text-slate-400"
          />
          {view.filter.search && (
            <button type="button" onClick={() => setFilter({ search: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {weekButton(WEEK_MODE.THIS, 'This week')}
        {weekButton(WEEK_MODE.NEXT, 'Next week')}

        {view.active && (
          <button
            type="button"
            onClick={() => onFilterChange({ ...EMPTY_FILTER })}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}

        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={() => runExport('excel')}
            disabled={Boolean(busy)}
            title="Export exactly what this panel shows"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg disabled:opacity-60"
          >
            {busy === 'excel' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
            Excel
          </button>
          <button
            type="button"
            onClick={() => runExport('pdf')}
            disabled={Boolean(busy)}
            title="Export exactly what this panel shows"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-60"
          >
            {busy === 'pdf' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            PDF
          </button>
        </div>
      </div>

      {/* The six figures. Each one is also a filter — the number and the rows
          behind it are the same query, so a user can always get from a figure
          to the work it counts. */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 p-3">
        {tiles.map((tile) => {
          const tone = TONE[tile.tone] || TONE.slate;
          const on = tile.key !== 'equipment' && tile.key !== 'total' && view.filter.focus === tile.focus;
          const value = tile.signed && tile.value > 0 ? `+${tile.value}` : String(tile.value);
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => clickTile(tile)}
              title={tile.hint}
              className={`text-left px-3 py-2.5 rounded-xl border transition-all ${tone.box} ${on ? `ring-2 ${tone.on}` : ''}`}
            >
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 leading-tight">
                {tile.label}
              </p>
              <p className={`text-2xl font-extrabold tabular-nums leading-tight ${
                tile.signed
                  ? (tile.value < 0 ? 'text-rose-600' : tile.value > 0 ? 'text-emerald-600' : 'text-slate-700')
                  : tone.text
              }`}>
                {value}
              </p>
            </button>
          );
        })}
      </div>

      <div className="px-4 pb-2.5 -mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-500">
        <span><strong className="text-slate-700">{stats.percent}%</strong> of the activities in view are done</span>
        <span className="text-slate-300">|</span>
        <span>{view.weekLabel}: {range.start} → {range.end}</span>
        <span className="text-slate-300">|</span>
        <span>Showing: <strong className="text-slate-700">{describeFilter(view)}</strong></span>
        {onOpenMonitoring && (
          <button
            type="button"
            onClick={onOpenMonitoring}
            className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-bold text-brand-600 hover:text-brand-800"
          >
            Open these in Monitoring <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );

  // ── Right panel, bottom: the flat preview table ─────────────────
  const previewHead = (
    <tr className="bg-slate-100/95 text-black text-[12px] font-bold">
      <th className="w-12 px-2 py-2 text-center sticky top-0 bg-slate-100/95 border-b border-slate-300">No</th>
      <th className="w-64 px-2 py-2 text-left sticky top-0 bg-slate-100/95 border-b border-slate-300">Equipment</th>
      <th className="px-2 py-2 text-left sticky top-0 bg-slate-100/95 border-b border-slate-300">Activities</th>
      <th className="w-28 px-2 py-2 text-center sticky top-0 bg-slate-100/95 border-b border-slate-300">Schedule</th>
      <th className="w-28 px-2 py-2 text-center sticky top-0 bg-slate-100/95 border-b border-slate-300">Status</th>
      <th className="w-32 px-2 py-2 text-center sticky top-0 bg-slate-100/95 border-b border-slate-300">Completed Date</th>
    </tr>
  );

  const preview = (
    <div className="bg-white rounded-xl shadow-xs border border-slate-200/80 overflow-hidden flex-1 flex flex-col">
      <div className="px-4 py-2 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between">
        <h3 className="text-[12px] font-bold uppercase tracking-wider text-black">
          Data preview
        </h3>
        <span className="text-[11.5px] font-bold text-slate-500 tabular-nums">
          {previewRows.length} {previewRows.length === 1 ? 'row' : 'rows'}
        </span>
      </div>

      {previewRows.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <SearchX className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-[14px] font-bold text-black">Nothing matches</p>
          <p className="text-[12px] text-slate-500 mt-1">Clear the filter to see the whole plan again.</p>
          <button
            type="button"
            onClick={() => onFilterChange({ ...EMPTY_FILTER })}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-bold text-white bg-slate-800 hover:bg-slate-700 rounded-lg"
          >
            <X className="w-4 h-4" /> Clear filters
          </button>
        </div>
      ) : (
        // The header row is sticky and the BODY scrolls: on a 500-row plan the
        // column titles have to stay on screen or the table is unreadable.
        <div className={`overflow-auto ${isMobileMode ? 'max-h-[60vh]' : 'max-h-[calc(100vh-420px)] min-h-[300px]'}`}>
          <table className="w-full min-w-[900px] text-left border-collapse">
            <thead>{previewHead}</thead>
            <tbody>
              {previewRows.map((row) => {
                const st = normalizeStatus(row.item.status);
                const ss = STATUS_STYLE[st];
                const rs = ROW_STATE_STYLE[rowState(row.item, today)];
                const done = completedKey(row.item);
                return (
                  <tr key={row.item.id || row.index} className={`${rs.tw} border-b border-slate-200`}>
                    <td className="px-2 py-1.5 text-center text-[12px] font-bold text-black tabular-nums align-top">
                      {row.no}
                    </td>
                    {/* Deliberately NOT merged: every line carries its own
                        equipment so the preview can be read, sorted and
                        exported one row at a time. */}
                    <td className="px-2 py-1.5 text-[12.5px] font-semibold text-black align-top leading-snug break-words">
                      {row.equipment}
                    </td>
                    <td className="px-2 py-1.5 text-[12.5px] text-black align-top leading-snug whitespace-pre-wrap break-words">
                      {row.item.activity || <span className="text-slate-400 italic">—</span>}
                    </td>
                    <td className="px-2 py-1.5 text-center text-[12px] text-black tabular-nums align-top whitespace-nowrap">
                      {fmtDate(row.item.schedule)}
                    </td>
                    <td className="px-2 py-1.5 text-center align-top">
                      <span
                        className="inline-block px-2 py-0.5 rounded-md text-[11px] font-bold border"
                        style={{ background: ss.css, color: ss.cssText, borderColor: st ? ss.css : '#cbd5e1' }}
                      >
                        {st || '—'}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-center text-[12px] tabular-nums align-top whitespace-nowrap">
                      <span className={isCompletedDateInferred(row.item) ? 'text-slate-500 italic' : 'text-black'}>
                        {fmtDate(done) || '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div className={`flex flex-col gap-3 ${isMobileMode ? '' : 'lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start'}`}>
      <div className={isMobileMode ? 'order-2' : 'order-1'}>{leftPanel}</div>
      <div className={`flex flex-col gap-3 min-w-0 ${isMobileMode ? 'order-1' : 'order-2'}`}>
        {summary}
        {preview}
      </div>
    </div>
  );
}
