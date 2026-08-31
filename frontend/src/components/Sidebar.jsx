import React, { useState } from 'react';
import {
  Plus, Search, FileSpreadsheet, Copy, Trash2, Calendar, Tag,
  Clock, CheckCircle2, ChevronRight, Layers, FileText, X, RefreshCw
} from 'lucide-react';

export default function Sidebar({
  reports,
  activeReportId,
  onSelectReport,
  onNewReport,
  onDuplicateReport,
  onDeleteReport,
  isSaving,
  isSyncing = false,
  onSyncCloud,
  isMobileDrawer = false,
  onCloseMobileDrawer
}) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredReports = reports.filter((r) => {
    const term = searchTerm.toLowerCase();
    const title = (r.title || '').toLowerCase();
    const tag = (r.system_tag || '').toLowerCase();
    const location = (r.location || '').toLowerCase();
    const discipline = (r.discipline || '').toLowerCase();
    const date = (r.inspection_date || '').toLowerCase();
    return (
      title.includes(term) ||
      tag.includes(term) ||
      location.includes(term) ||
      discipline.includes(term) ||
      date.includes(term)
    );
  });

  const handleSelect = (id) => {
    onSelectReport(id);
    if (isMobileDrawer && onCloseMobileDrawer) {
      onCloseMobileDrawer();
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-900 text-slate-200 select-none">
      {/* App Branding & Title */}
      <div className="px-4 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-600 to-sky-400 flex items-center justify-center text-white shadow-md shadow-brand-500/20">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              Flash Report Pro
            </h1>
            <p className="text-[10px] text-slate-400 font-medium">Block B - EPC#1</p>
          </div>
        </div>

        {/* Mobile close button */}
        {isMobileDrawer && (
          <button
            onClick={onCloseMobileDrawer}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Action Buttons: New Report + Sync Cloud */}
      <div className="p-3 border-b border-slate-800/80 space-y-2">
        <button
          type="button"
          onClick={() => {
            onNewReport();
            if (isMobileDrawer && onCloseMobileDrawer) onCloseMobileDrawer();
          }}
          className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 rounded-xl shadow-md shadow-brand-600/30 hover:shadow-brand-600/50 transition-all active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          New Report
        </button>

        {onSyncCloud && (
          <button
            type="button"
            onClick={onSyncCloud}
            disabled={isSyncing}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700/80 rounded-xl transition-all active:scale-[0.98]"
            title="Synchronize all reports with cloud"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing with Cloud...' : '🔄 Sync with Cloud'}
          </button>
        )}
      </div>

      {/* Search Filter */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search reports by title, tag..."
            className="w-full text-xs text-slate-200 bg-slate-800/80 border border-slate-700/80 rounded-lg pl-8 pr-3 py-1.5 focus:border-brand-500 focus:bg-slate-800 focus:ring-1 focus:ring-brand-500 transition-all outline-none placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* Report Count summary */}
      <div className="px-4 py-1.5 flex items-center justify-between text-[11px] text-slate-400 font-medium border-b border-slate-800/40">
        <span>Reports ({filteredReports.length})</span>
        {isSaving ? (
          <span className="flex items-center gap-1 text-emerald-400 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Saving...
          </span>
        ) : isSyncing ? (
          <span className="flex items-center gap-1 text-sky-400 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse"></span>
            Syncing...
          </span>
        ) : null}
      </div>

      {/* Report Items List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredReports.length === 0 ? (
          <div className="text-center py-10 px-4 text-slate-500 text-xs">
            {searchTerm ? 'No matching reports found' : 'No reports yet. Click "New Report" to start.'}
          </div>
        ) : (
          filteredReports.map((report) => {
            const isActive = report.id === activeReportId;
            const fullTitle = report.title || 'Untitled Flash Report';

            return (
              <div
                key={report.id}
                onClick={() => handleSelect(report.id)}
                className={`group relative p-2.5 rounded-xl cursor-pointer transition-all duration-150 border ${
                  isActive
                    ? 'bg-brand-600/15 border-brand-500/50 text-white shadow-sm'
                    : 'bg-slate-800/30 hover:bg-slate-800/70 border-transparent hover:border-slate-700 text-slate-300'
                }`}
              >
                {/* Title with hover tooltip */}
                <div className="flex items-start justify-between gap-1 mb-1">
                  <div className="relative flex-1 min-w-0 pr-12">
                    <p
                      className={`text-xs font-semibold truncate ${
                        isActive ? 'text-white' : 'text-slate-200 group-hover:text-white'
                      }`}
                      title={fullTitle}
                    >
                      {fullTitle}
                    </p>
                  </div>
                  {isActive && (
                    <span className="w-2 h-2 rounded-full bg-brand-400 flex-shrink-0 mt-1"></span>
                  )}
                </div>

                {/* Sub info tags */}
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                  {report.inspection_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      {report.inspection_date}
                    </span>
                  )}
                  {report.discipline && (
                    <span className="px-1.5 py-0.2 bg-slate-700/60 text-slate-300 rounded text-[9px] font-medium">
                      {report.discipline}
                    </span>
                  )}
                  {report.system_tag && (
                    <span className="px-1.5 py-0.2 bg-slate-800 text-slate-400 rounded text-[9px] truncate max-w-[90px]">
                      {report.system_tag}
                    </span>
                  )}
                </div>

                {/* Actions: Always visible on Mobile Drawer, Visible on Hover on Desktop */}
                <div className={`absolute right-2 bottom-2 ${isMobileDrawer ? 'flex' : 'hidden group-hover:flex'} items-center gap-1 bg-slate-800/95 backdrop-blur-sm p-0.5 rounded-md border border-slate-700`}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicateReport(report.id);
                    }}
                    className="p-1 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded transition-colors"
                    title="Duplicate report"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteReport(report.id, fullTitle);
                    }}
                    className="p-1 hover:bg-rose-900/50 text-slate-400 hover:text-rose-400 rounded transition-colors"
                    title="Delete report"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
