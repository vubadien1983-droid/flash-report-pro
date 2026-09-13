import React, { useState } from 'react';
import { TextCell, DateCell } from './PlanCell';
import { Calendar, Tag, MapPin, Layers, FileText, CalendarRange, Lock, Unlock } from 'lucide-react';

const DISCIPLINES = [
  'Mechanical',
  'Piping',
  'Electrical',
  'Instrumentation',
  'Civil / Structural',
  'HSE',
  'QA/QC',
  'Commissioning',
  'Subsea / Pipeline',
  'Other'
];

/**
 * @param variant  'flash' (default) | 'miniPlan'
 *
 * A Mini Plan has no single inspection tag, location or discipline — it is a
 * schedule covering the whole CPP mechanical scope. Showing those three empty
 * boxes would invite someone to fill them in with something that no export or
 * view ever reads, so the plan variant shows only what it actually uses.
 */
export default function HeaderForm({
  report,
  onChange,
  variant = 'flash',
  readOnly = false,
  onRequestUnlock,
}) {
  const isPlan = variant === 'miniPlan';
  const [editing, setEditing] = useState(null);   // 'title' | 'location' | 'date' | null

  const beginEdit = (field) => {
    if (readOnly) { onRequestUnlock?.(); return; }
    setEditing(field);
  };
  const commit = (field, value) => {
    setEditing(null);
    if ((report[field] || '') !== (value || '')) onChange(field, value);
  };

  /**
   * ONE LINE for the whole Mini Plan header.
   *
   * It used to be a card with three labelled boxes — roughly 120px of screen
   * spent on a title, a location and a date that change about once a month,
   * above a table with 500 rows in it. The values are still all here, still
   * editable, and the plan gets the height back.
   *
   * Like every other value in this report the fields open on DOUBLE-CLICK, so
   * the title of a live plan cannot be changed by a stray click during a
   * meeting.
   */
  if (isPlan) {
    return (
      <div className="w-full bg-white rounded-xl shadow-xs border border-slate-200/80 px-3 py-1.5 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <CalendarRange className="w-4 h-4 text-brand-600 flex-shrink-0" />

        <div className="flex-1 min-w-[200px]">
          <TextCell
            value={report.title || ''}
            placeholder="Plan title..."
            readOnly={readOnly}
            isEditing={editing === 'title'}
            onEdit={() => beginEdit('title')}
            onCommit={(v) => commit('title', v)}
            onCancel={() => setEditing(null)}
            displayClassName="text-[14px] font-bold text-slate-900 leading-tight"
            inputClassName="w-full text-[14px] font-bold text-slate-900 bg-white border border-slate-200 rounded-md px-2 py-1 leading-tight"
          />
        </div>

        <span className="flex items-center gap-1 min-w-[130px] max-w-[240px]">
          <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span className="flex-1">
            <TextCell
              value={report.location || ''}
              placeholder="Location / Area"
              readOnly={readOnly}
              isEditing={editing === 'location'}
              onEdit={() => beginEdit('location')}
              onCommit={(v) => commit('location', v)}
              onCancel={() => setEditing(null)}
              displayClassName="text-[12.5px] text-slate-700 leading-tight"
              inputClassName="w-full text-[12.5px] text-slate-900 bg-white border border-slate-200 rounded-md px-2 py-1 leading-tight"
            />
          </span>
        </span>

        <span className="flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span className="min-w-[92px]">
            <DateCell
              value={report.inspection_date || ''}
              readOnly={readOnly}
              isEditing={editing === 'date'}
              onEdit={() => beginEdit('date')}
              onCommit={(v) => commit('inspection_date', v)}
              onCancel={() => setEditing(null)}
              displayClassName="text-[12.5px] text-slate-700"
            />
          </span>
        </span>

        {readOnly ? (
          <button
            type="button"
            onClick={onRequestUnlock}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-300 rounded-md hover:bg-amber-100 transition-colors"
          >
            <Lock className="w-3 h-3" /> Locked
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 rounded-md">
            <Unlock className="w-3 h-3" /> Unlocked
          </span>
        )}
      </div>
    );
  }


  const inputCls = (extra = '') =>
    `w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all outline-none disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-default ${extra}`;

  return (
    <div className="w-full bg-white rounded-xl shadow-xs border border-slate-200/80 p-4 md:p-5 mb-4">
      <div className="flex items-center justify-between gap-2 mb-3.5 pb-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          {isPlan ? <CalendarRange className="w-4 h-4 text-brand-600" /> : <FileText className="w-4 h-4 text-brand-600" />}
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            {isPlan ? 'Mini Plan Header' : 'Report Header Information'}
          </h2>
        </div>

        {isPlan && readOnly && (
          <button
            type="button"
            onClick={onRequestUnlock}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-300 rounded-md hover:bg-amber-100 transition-colors"
          >
            <Lock className="w-3 h-3" /> Locked — password required
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Report Title (full width) */}
        <div className="col-span-1 sm:col-span-2 lg:col-span-4">
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            {isPlan ? 'Plan Title' : 'Report Title'} <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            disabled={readOnly}
            value={report.title || ''}
            onChange={(e) => onChange('title', e.target.value)}
            placeholder={isPlan ? 'e.g. CPP Mechanical Mini Plan' : 'e.g. Wellhead Platform A Piping Line Inspection'}
            className={inputCls('text-sm md:text-base font-semibold text-slate-900 !bg-slate-50/50 focus:!bg-white px-3.5 py-2')}
          />
        </div>

        {isPlan ? (
          <>
            {/* Location — the plan does cover one facility */}
            <div className="col-span-1 sm:col-span-1 lg:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                Location / Area
              </label>
              <input
                type="text"
                disabled={readOnly}
                value={report.location || ''}
                onChange={(e) => onChange('location', e.target.value)}
                placeholder="e.g. Block B CPP"
                className={inputCls('text-xs md:text-sm text-slate-800')}
              />
            </div>

            {/* Plan date — the issue date of this revision, NOT a row's
                Schedule. Row colours are compared against TODAY, never
                against this field. */}
            <div className="col-span-1 sm:col-span-1 lg:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Plan Issue Date
              </label>
              <input
                type="date"
                disabled={readOnly}
                value={report.inspection_date || ''}
                onChange={(e) => onChange('inspection_date', e.target.value)}
                className={inputCls('text-xs md:text-sm text-slate-800')}
              />
            </div>
          </>
        ) : (
          <>
            <div className="col-span-1 sm:col-span-1 lg:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-slate-400" />
                System / Equipment Tag
              </label>
              <input
                type="text"
                value={report.system_tag || ''}
                onChange={(e) => onChange('system_tag', e.target.value)}
                placeholder="e.g. 21-TK-101 / P-102A"
                className={inputCls('text-xs md:text-sm text-slate-800')}
              />
            </div>

            <div className="col-span-1 sm:col-span-1 lg:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                Location
              </label>
              <input
                type="text"
                value={report.location || ''}
                onChange={(e) => onChange('location', e.target.value)}
                placeholder="e.g. Block B CPP / Platform Deck 2"
                className={inputCls('text-xs md:text-sm text-slate-800')}
              />
            </div>

            <div className="col-span-1 sm:col-span-1 lg:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Inspection Date
              </label>
              <input
                type="date"
                value={report.inspection_date || ''}
                onChange={(e) => onChange('inspection_date', e.target.value)}
                className={inputCls('text-xs md:text-sm text-slate-800')}
              />
            </div>

            <div className="col-span-1 sm:col-span-1 lg:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                Discipline
              </label>
              <select
                value={report.discipline || 'Mechanical'}
                onChange={(e) => onChange('discipline', e.target.value)}
                className={inputCls('text-xs md:text-sm text-slate-800 cursor-pointer')}
              >
                {DISCIPLINES.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
