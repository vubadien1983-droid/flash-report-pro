import React from 'react';
import { Calendar, Tag, MapPin, Layers, FileText } from 'lucide-react';

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

export default function HeaderForm({ report, onChange }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-5 mb-5">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
        <FileText className="w-4 h-4 text-brand-600" />
        <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Report Header Information</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Report Title (Full Width) */}
        <div className="col-span-1 md:col-span-2 lg:col-span-4">
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Report Title <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={report.title || ''}
              onChange={(e) => onChange('title', e.target.value)}
              placeholder="e.g. Wellhead Platform A Piping Line Inspection"
              className="w-full text-base font-semibold text-slate-900 bg-slate-50/50 border border-slate-200 rounded-lg px-3.5 py-2 focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all outline-none"
            />
          </div>
        </div>

        {/* System / Equipment Tag */}
        <div className="col-span-1 md:col-span-1 lg:col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-slate-400" />
            System / Equipment Tag
          </label>
          <input
            type="text"
            value={report.system_tag || ''}
            onChange={(e) => onChange('system_tag', e.target.value)}
            placeholder="e.g. 21-TK-101 / P-102A"
            className="w-full text-sm text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all outline-none"
          />
        </div>

        {/* Location */}
        <div className="col-span-1 md:col-span-1 lg:col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            Location
          </label>
          <input
            type="text"
            value={report.location || ''}
            onChange={(e) => onChange('location', e.target.value)}
            placeholder="e.g. Block B CPP / Platform Deck 2"
            className="w-full text-sm text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all outline-none"
          />
        </div>

        {/* Inspection Date */}
        <div className="col-span-1 md:col-span-1 lg:col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            Inspection Date
          </label>
          <input
            type="date"
            value={report.inspection_date || ''}
            onChange={(e) => onChange('inspection_date', e.target.value)}
            className="w-full text-sm text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all outline-none"
          />
        </div>

        {/* Discipline */}
        <div className="col-span-1 md:col-span-1 lg:col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            Discipline
          </label>
          <select
            value={report.discipline || 'Mechanical'}
            onChange={(e) => onChange('discipline', e.target.value)}
            className="w-full text-sm text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all outline-none cursor-pointer"
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
