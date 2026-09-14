import React from 'react';
import { Calendar, Tag, MapPin, Layers, FileText, ChevronDown, ChevronUp, Pencil } from 'lucide-react';

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
 * Report header.
 *
 * A field report is mostly its inspection rows, and the header is filled in
 * once and then just sits there — on a laptop it was eating ~190 px and on a
 * phone far more, pushing the first photo row off the screen. So it opens
 * full size while the report is being created, and once the report has been
 * saved and synced it folds down to a single summary line, which stays
 * clickable to reopen.
 *
 * The collapsed/expanded decision is made by the parent ONCE per report, when
 * the report is opened — never on every save. Otherwise an autosave would
 * snap the header shut while the inspector is still typing in it.
 */
export default function HeaderForm({ report, onChange, collapsed = false, onToggleCollapsed }) {
  const title = report.title || 'Untitled Flash Report';

  const chips = [
    { icon: Tag, value: report.system_tag },
    { icon: MapPin, value: report.location },
    { icon: Calendar, value: report.inspection_date },
    { icon: Layers, value: report.discipline },
  ].filter((c) => (c.value || '').toString().trim());

  if (collapsed) {
    return (
      <div className="w-full bg-white rounded-xl shadow-xs border border-slate-200/80 mb-3">
        <button
          type="button"
          onClick={onToggleCollapsed}
          title="Show the full header to edit it"
          className="w-full flex items-center gap-2.5 px-3 sm:px-4 py-2 text-left hover:bg-slate-50/80 rounded-xl transition-colors group"
        >
          <FileText className="w-4 h-4 text-brand-600 flex-shrink-0" />

          <span className="text-sm font-bold text-slate-900 truncate flex-shrink min-w-0">
            {title}
          </span>

          {/* Meta chips — hidden on the narrowest screens so the title always wins */}
          <span className="hidden md:flex items-center gap-1.5 min-w-0 flex-1">
            {chips.map(({ icon: Icon, value }, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-[11px] font-medium text-slate-600 max-w-[22%] truncate"
              >
                <Icon className="w-3 h-3 text-slate-400 flex-shrink-0" />
                <span className="truncate">{value}</span>
              </span>
            ))}
          </span>

          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 group-hover:text-brand-600 transition-colors flex-shrink-0">
            <Pencil className="w-3 h-3" />
            <span className="hidden sm:inline">Edit header</span>
            <ChevronDown className="w-4 h-4" />
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="w-full bg-white rounded-xl shadow-xs border border-slate-200/80 p-4 md:p-5 mb-4">
      <div className="flex items-center justify-between gap-2 mb-3.5 pb-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-brand-600" />
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Report Header Information</h2>
        </div>

        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            title="Collapse the header to a single line"
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-brand-700 hover:bg-brand-50 rounded-lg transition-colors"
          >
            <ChevronUp className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Collapse</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Report Title (Full Width) */}
        <div className="col-span-1 sm:col-span-2 lg:col-span-4">
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Report Title <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={report.title || ''}
            onChange={(e) => onChange('title', e.target.value)}
            placeholder="e.g. Wellhead Platform A Piping Line Inspection"
            className="w-full text-sm md:text-base font-semibold text-slate-900 bg-slate-50/50 border border-slate-200 rounded-lg px-3.5 py-2 focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all outline-none"
          />
        </div>

        {/* System / Equipment Tag */}
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
            className="w-full text-xs md:text-sm text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all outline-none"
          />
        </div>

        {/* Location */}
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
            className="w-full text-xs md:text-sm text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all outline-none"
          />
        </div>

        {/* Inspection Date */}
        <div className="col-span-1 sm:col-span-1 lg:col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            Inspection Date
          </label>
          <input
            type="date"
            value={report.inspection_date || ''}
            onChange={(e) => onChange('inspection_date', e.target.value)}
            className="w-full text-xs md:text-sm text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all outline-none"
          />
        </div>

        {/* Discipline */}
        <div className="col-span-1 sm:col-span-1 lg:col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            Discipline
          </label>
          <select
            value={report.discipline || 'Mechanical'}
            onChange={(e) => onChange('discipline', e.target.value)}
            className="w-full text-xs md:text-sm text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all outline-none cursor-pointer"
          >
            {DISCIPLINES.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
