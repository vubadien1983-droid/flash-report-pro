import React, { useState } from 'react';
import { LayoutDashboard, Table2, Filter, X } from 'lucide-react';
import MiniPlanDashboard from './MiniPlanDashboard';
import MiniPlanTable from './MiniPlanTable';
import {
  EMPTY_FILTER, isFilterActive, normalizeFilter, MINI_PLAN_LABEL,
} from '../services/miniPlan';

export const TAB_DASHBOARD = 'status';
export const TAB_MONITORING = 'monitoring';

/**
 * The view the user chose SURVIVES a remount.
 *
 * Which tab is open, and what is filtered, is the user's place in the
 * document — not application state to be reset by a refresh. It used to live
 * only in this component's `useState`, so anything that unmounted the tree
 * (a re-subscribe on the share link, a route flip, a report reloaded from
 * disk) quietly put the user back on the dashboard with their filter gone
 * (BUG-026). It is kept in sessionStorage instead: per browser tab, dropped
 * when that tab closes, so a link opened fresh still starts on the dashboard.
 *
 * Storage can throw (private mode, blocked cookies) - every access is guarded
 * and simply falls back to the default, exactly as the unlock flag does.
 */
const TAB_KEY = 'fr_miniplan_tab';
const FILTER_KEY = 'fr_miniplan_filter';

function readStoredTab() {
  try {
    const v = sessionStorage.getItem(TAB_KEY);
    return v === TAB_MONITORING || v === TAB_DASHBOARD ? v : null;
  } catch { return null; }
}

function readStoredFilter() {
  try {
    const raw = sessionStorage.getItem(FILTER_KEY);
    return raw ? normalizeFilter(JSON.parse(raw)) : null;
  } catch { return null; }
}

function store(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* nothing is lost but the memory of it */ }
}

/**
 * The CPP Mechanical Mini Plan, as TWO TABS over ONE document.
 *
 *   "Equipment installation status" - the dashboard: progress per equipment,
 *      six summary figures, and a flat preview of the data. Read-only by
 *      construction, so it needs no password and works on the share link.
 *   "Monitoring" - the plan itself, edited exactly as before.
 *
 * THE FILTER LIVES HERE, not in either tab. That is the requirement: a
 * selection made on the dashboard has to leave the Monitoring tab showing the
 * same work. Two tabs with two filters would be two different answers to
 * "what is due this week", and the user would have no way to tell which one
 * the export came from.
 *
 * The two tabs read that one filter differently, and deliberately so:
 *   - the dashboard shows the matching ROWS, flat and numbered;
 *   - Monitoring shows every matching EQUIPMENT with ALL of its activities,
 *     because you cannot act on the one task due this week without the rest
 *     of that equipment's work in front of you.
 */
export default function MiniPlanWorkspace({
  items,
  onItemsChange,
  onPhotoClick,
  isMobileMode = false,
  readOnly = false,
  onRequestUnlock,
  title = MINI_PLAN_LABEL,
  initialTab = TAB_DASHBOARD,
  fullScreen = false,
}) {
  const [tab, setTabState] = useState(() => readStoredTab() || initialTab);
  const [filter, setFilterState] = useState(() => readStoredFilter() || EMPTY_FILTER);

  const setTab = (next) => { setTabState(next); store(TAB_KEY, next); };
  const setFilter = (next) => {
    setFilterState(next);
    store(FILTER_KEY, JSON.stringify(normalizeFilter(next)));
  };

  const active = isFilterActive(filter);
  const safeFilter = normalizeFilter(filter);

  const tabButton = (key, label, Icon) => {
    const on = tab === key;
    return (
      <button
        type="button"
        onClick={() => setTab(key)}
        className={`inline-flex items-center gap-2 px-4 py-2.5 text-[13px] font-bold rounded-t-xl border-b-2 transition-colors ${
          on
            ? 'bg-white text-brand-700 border-brand-600 shadow-2xs'
            : 'bg-slate-100/70 text-slate-600 border-transparent hover:bg-white hover:text-slate-900'
        }`}
      >
        <Icon className="w-4 h-4" />
        <span className={isMobileMode ? 'text-[12px]' : ''}>{label}</span>
      </button>
    );
  };

  return (
    <div className={fullScreen ? 'h-full flex flex-col min-h-0' : 'mb-6'}>
      <div className="flex flex-wrap items-end gap-1.5 px-1">
        {tabButton(TAB_DASHBOARD, 'Equipment installation status', LayoutDashboard)}
        {tabButton(TAB_MONITORING, 'Monitoring', Table2)}

        {/* One filter, both tabs - so it is stated once, where switching tabs
            cannot hide it. */}
        {active && (
          <span className="inline-flex items-center gap-1.5 ml-auto mb-1.5 px-2.5 py-1 text-[11.5px] font-bold text-violet-900 bg-violet-100 border border-violet-300 rounded-md">
            <Filter className="w-3.5 h-3.5" />
            Filter applies to both tabs
            <button
              type="button"
              onClick={() => setFilter({ ...EMPTY_FILTER })}
              title="Clear the filter"
              className="ml-0.5 p-0.5 rounded hover:bg-violet-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        )}
      </div>

      {tab === TAB_DASHBOARD ? (
        <div className={`bg-slate-100/60 rounded-xl rounded-tl-none p-2 border border-slate-200/80 ${
          fullScreen ? 'flex-1 min-h-0 overflow-auto' : ''
        }`}>
          <MiniPlanDashboard
            items={items}
            title={title}
            filter={safeFilter}
            onFilterChange={setFilter}
            isMobileMode={isMobileMode}
            onOpenMonitoring={() => setTab(TAB_MONITORING)}
            fullScreen={fullScreen}
          />
        </div>
      ) : (
        <MiniPlanTable
          items={items}
          onItemsChange={onItemsChange}
          onPhotoClick={onPhotoClick}
          isMobileMode={isMobileMode}
          readOnly={readOnly}
          onRequestUnlock={onRequestUnlock}
          filter={safeFilter}
          onFilterChange={setFilter}
          fullScreen={fullScreen}
        />
      )}
    </div>
  );
}
