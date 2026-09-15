import React, { useState } from 'react';
import {
  X, CalendarRange, FileSpreadsheet, FileText, RefreshCw,
  Layers, SearchX, ArrowUpRight,
} from 'lucide-react';
import SearchBox from './SearchBox';
import WeeklyProgressChart from './WeeklyProgressChart';
import { dashboardView, describeFilter } from '../services/miniPlanDashboard';
import {
  STATUS_STYLE, ROW_STATE_STYLE, rowState, normalizeStatus, scheduleKey,
  todayKey, WEEK_MODE, EMPTY_FILTER, completedKey, isCompletedDateInferred,
  needsPlanDate, NO_DATE_CELL,
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
  fullScreen = false,
}) {
  const [busy, setBusy] = useState('');
  const today = todayKey();
  const view = dashboardView(items, filter, today);
  const { equipmentRows, previewRows, range } = view;

  const setFilter = (patch) => onFilterChange({ ...view.filter, ...patch });

  const clickEquipment = (row) => {
    setFilter({ equipment: view.filter.equipment === row.key ? '' : row.key });
  };

  const weekButton = (mode, label) => {
    const on = view.filter.week === mode;
    return (
      <button
        type="button"
        onClick={() => setFilter({ week: on ? WEEK_MODE.NONE : mode })}
        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-bold rounded-lg border transition-colors ${
          on
            ? 'bg-violet-600 text-white border-violet-700 shadow-sm shadow-violet-600/30'
            : 'bg-white text-black border-slate-300 hover:bg-slate-50'
        }`}
      >
        <CalendarRange className="w-3.5 h-3.5" />
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

      <div className={`overflow-y-auto ${
        isMobileMode ? 'max-h-[360px]' : (fullScreen ? 'max-h-[calc(100vh-175px)]' : 'max-h-[calc(100vh-245px)]')
      }`}>
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
              {/* The item number in a soft red: it is the one thing in this
                  list that is a LOOKUP KEY - "which line is equipment 104?" -
                  and in grey it disappeared into the names around it. */}
              <span className="text-[10.5px] font-bold text-rose-400 tabular-nums mr-1.5">{row.no || '-'}</span>
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
      <div className="px-3 py-1.5 bg-slate-50/80 border-b border-slate-200/80 flex flex-wrap items-center gap-1.5">
        <SearchBox
          className="flex-1 min-w-[200px] max-w-md"
          value={view.filter.search}
          onChange={(v) => setFilter({ search: v })}
          placeholder="Search anything - equipment, activity, status, date..."
          inputClassName="w-full text-[12.5px] text-black bg-white border border-slate-200 rounded-lg pl-9 pr-9 py-1.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all placeholder:text-slate-400"
        />

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
            className="inline-flex items-center gap-1 px-2 py-1 text-[11.5px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg disabled:opacity-60"
          >
            {busy === 'excel' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
            Excel
          </button>
          <button
            type="button"
            onClick={() => runExport('pdf')}
            disabled={Boolean(busy)}
            title="Export exactly what this panel shows"
            className="inline-flex items-center gap-1 px-2 py-1 text-[11.5px] font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-60"
          >
            {busy === 'pdf' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            PDF
          </button>
        </div>
      </div>

      <div className="px-3 pb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-slate-500">
        <span>{view.weekLabel}: {range.start} → {range.end}</span>
        <span className="text-slate-300">|</span>
        <span>Showing: <strong className="text-slate-700">{describeFilter(view)}</strong></span>
        {onOpenMonitoring && (
          <button
            type="button"
            onClick={onOpenMonitoring}
            className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:text-brand-800"
          >
            Open these in Monitoring <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* The week-by-week picture of the same rows the figures count. It sits
          under the figures because that is the order the meeting reads in:
          where are we, then how did we get here and where does it end. */}
      <div className="px-3 pt-1.5 pb-2 border-t border-slate-100">
        <WeeklyProgressChart
          items={previewRows.map((r) => r.item)}
          today={today}
          compact={isMobileMode}
        />
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
        <div className={`overflow-auto ${
          isMobileMode ? 'max-h-[60vh]' : (fullScreen ? 'max-h-[calc(100vh-500px)] min-h-[220px]' : 'max-h-[calc(100vh-565px)] min-h-[220px]')
        }`}>
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
                    {/* Columns 1 and 2 are NOT bold: on a 500-row list the
                        eye needs one thing to catch on, and that is the
                        Activity and the row colour, not a running number and
                        a name that repeats down the page. */}
                    <td className="px-2 py-1.5 text-center text-[12px] text-black tabular-nums align-top">
                      {row.no}
                    </td>
                    {/* Deliberately NOT merged: every line carries its own
                        equipment so the preview can be read, sorted and
                        exported one row at a time. */}
                    <td className="px-2 py-1.5 text-[12.5px] text-black align-top leading-snug break-words">
                      {row.equipment}
                    </td>
                    <td className="px-2 py-1.5 text-[12.5px] text-black align-top leading-snug whitespace-pre-wrap break-words">
                      {row.item.activity || <span className="text-slate-400 italic">—</span>}
                    </td>
                    {/* Only the empty Schedule box is marked, never the row. */}
                    <td className="px-1.5 py-1.5 text-center text-[12px] text-black tabular-nums align-top whitespace-nowrap">
                      <span className={`inline-block w-full px-1 py-0.5 ${
                        needsPlanDate(row.item, today) ? NO_DATE_CELL.tw : ''
                      }`}>
                        {fmtDate(row.item.schedule) || <span className="text-slate-300">—</span>}
                      </span>
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
