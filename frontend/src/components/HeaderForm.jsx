import React from 'react';
import { Calendar, Tag, MapPin, Layers, FileText, CalendarRange, Lock } from 'lucide-react';

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
