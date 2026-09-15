import React from 'react';
import { Filter, X } from 'lucide-react';
import { dashboardView, summaryTiles } from '../services/miniPlanDashboard';
import { todayKey, FOCUS, EMPTY_FILTER } from '../services/miniPlan';

/**
 * The six figures, on the tab row.
 *
 * They used to sit inside the dashboard tab, which meant the Monitoring tab —
 * where the plan is actually worked on — had no idea how the job was doing,
 * and the figures cost a whole band of screen on the tab that could least
 * spare it. Here they are read from both tabs and cost one line.
 *
 * Every figure is still a FILTER, and the filter is shared by both tabs, so
 * clicking "Done this week" on Monitoring selects the same work it selects on
 * the dashboard. That is the point of moving them: the number and the rows
 * behind it are one question, asked from wherever the user happens to be.
 */

const SHORT = {
  equipment: 'EQUIP',
  done: 'DONE',
  total: 'TOTAL',
  planWeek: 'PLAN WK',
  doneWeek: 'DONE WK',
  variance: 'VAR',
};

const TONE = {
  slate:   'border-slate-200 bg-slate-50 text-slate-900',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  sky:     'border-sky-200 bg-sky-50 text-sky-700',
  violet:  'border-violet-200 bg-violet-50 text-violet-700',
  teal:    'border-teal-200 bg-teal-50 text-teal-700',
  amber:   'border-amber-200 bg-amber-50 text-amber-700',
};
const ON = {
  slate: 'ring-slate-400', emerald: 'ring-emerald-500', sky: 'ring-sky-500',
  violet: 'ring-violet-500', teal: 'ring-teal-500', amber: 'ring-amber-500',
};

export default function MiniPlanSummaryStrip({
  items, filter, onFilterChange, today = todayKey(), className = '',
}) {
  const view = dashboardView(items, filter, today);
  const tiles = summaryTiles(view);
  const setFilter = (patch) => onFilterChange({ ...view.filter, ...patch });

  const click = (tile) => {
    if (tile.key === 'equipment') { setFilter({ equipment: '', focus: FOCUS.ALL }); return; }
    setFilter({ focus: view.filter.focus === tile.focus ? FOCUS.ALL : tile.focus });
  };

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {tiles.map((tile) => {
        const on = tile.key !== 'equipment' && tile.key !== 'total' && view.filter.focus === tile.focus;
        const value = tile.signed && tile.value > 0 ? `+${tile.value}` : String(tile.value);
        const tone = TONE[tile.tone] || TONE.slate;
        return (
          <button
            key={tile.key}
            type="button"
            onClick={() => click(tile)}
            title={`${tile.label} — ${tile.hint}`}
            className={`inline-flex items-baseline gap-1 px-2 py-1 rounded-md border transition-all ${tone} ${
              on ? `ring-2 ${ON[tile.tone]}` : 'hover:brightness-95'
            }`}
          >
            <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
              {SHORT[tile.key] || tile.label}
            </span>
            <span className={`text-[14px] font-extrabold tabular-nums leading-none ${
              tile.signed
                ? (tile.value < 0 ? 'text-rose-600' : tile.value > 0 ? 'text-emerald-600' : 'text-slate-700')
                : ''
            }`}>
              {value}
            </span>
          </button>
        );
      })}

      <span className="text-[10.5px] text-slate-500 whitespace-nowrap pl-0.5">
        <strong className="text-slate-700">{view.stats.percent}%</strong> done
      </span>

      {view.active && (
        <button
          type="button"
          onClick={() => onFilterChange({ ...EMPTY_FILTER })}
          title="This filter applies to both tabs — click to clear it"
          className="inline-flex items-center gap-1 px-1.5 py-1 text-[10.5px] font-bold text-violet-900 bg-violet-100 border border-violet-300 rounded-md hover:bg-violet-200"
        >
          <Filter className="w-3 h-3" /> both tabs
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
