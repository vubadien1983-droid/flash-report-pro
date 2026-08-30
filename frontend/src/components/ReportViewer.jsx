import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet, FileText, Download, Printer, Share2,
  Calendar, Tag, MapPin, Layers, Camera, Check, RefreshCw,
  ExternalLink, ArrowLeft, ZoomIn
} from 'lucide-react';
import { fetchSharedReport } from '../services/shareService';
import { exportExcelClient, exportPdfClient } from '../services/clientExport';
import ImageModal from './ImageModal';
import Toast from './Toast';

export default function ReportViewer({ reportId }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [activePhotoUrl, setActivePhotoUrl] = useState(null);
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    async function loadReport() {
      setLoading(true);
      try {
        const data = await fetchSharedReport(reportId);
        if (data) {
          setReport(data);
        } else {
          showToast('Could not find or load this shared report', 'error');
        }
      } catch (err) {
        console.error('Failed to load shared report:', err);
        showToast('Error loading report data', 'error');
      } finally {
        setLoading(false);
      }
    }
    if (reportId) {
      loadReport();
    }
  }, [reportId]);

  const handleExportExcel = async () => {
    if (!report) return;
    setIsExporting(true);
    try {
      await exportExcelClient(report);
      showToast('Excel report generated and downloaded!', 'success');
    } catch (err) {
      console.error('Export Excel failed:', err);
      showToast('Failed to export Excel report', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    if (!report) return;
    setIsExporting(true);
    try {
      await exportPdfClient(report);
      showToast('PDF report generated and downloaded!', 'success');
    } catch (err) {
      console.error('Export PDF failed:', err);
      showToast('Failed to export PDF report', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    showToast('Report link copied to clipboard!', 'success');
  };

  if (loading) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white gap-3 p-4">
        <RefreshCw className="w-8 h-8 text-brand-400 animate-spin" />
        <p className="text-sm font-medium text-slate-300">Loading Shared Flash Report...</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-slate-100 p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-lg border border-slate-200">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Report Not Found</h2>
          <p className="text-xs text-slate-500 mb-6">
            The shared report link might be expired or invalid. Please check the URL with the sender.
          </p>
          <a
            href="#/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Go to Flash Report App
          </a>
        </div>
      </div>
    );
  }

  const items = report.items || [];
  let seqCounter = 1;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans">
      {/* Top Presentation Navbar */}
      <header className="h-14 px-4 md:px-8 bg-white border-b border-slate-200/90 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-600 to-sky-400 flex items-center justify-center text-white shadow-md shadow-brand-500/20 flex-shrink-0">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs md:text-sm font-bold text-slate-900 truncate">
              {report.title || 'Flash Inspection Report'}
            </h1>
            <p className="text-[10px] text-slate-400 font-medium hidden sm:block">Block B - EPC#1</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 md:gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="p-1.5 sm:px-3 sm:py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
            title="Copy shared link"
          >
            <Share2 className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden md:inline">Share</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 rounded-lg shadow-2xs transition-colors"
            title="Download formatted Excel spreadsheet"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Export Excel</span>
            <span className="sm:hidden">Excel</span>
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-2xs shadow-brand-600/20 transition-all"
            title="Download print-ready PDF document"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>
        </div>
      </header>

      {/* Main Report Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 md:p-6 lg:p-8 space-y-4">
        {/* Header Metadata Card */}
        <div className="w-full bg-white rounded-xl shadow-xs border border-slate-200/80 p-4 md:p-6">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-brand-50 text-brand-700 text-[10px] font-bold rounded-md uppercase tracking-wide border border-brand-200">
                Flash Report
              </span>
              <span className="text-xs text-slate-400 font-medium">Block B - EPC#1</span>
            </div>
            <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              {report.inspection_date || 'No Date'}
            </span>
          </div>

          <h1 className="text-lg md:text-xl font-bold text-slate-900 mb-4 tracking-tight">
            {report.title || 'Untitled Flash Report'}
          </h1>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/60 text-xs">
            <div>
              <span className="text-slate-500 text-[11px] block font-medium">System / Tag:</span>
              <span className="font-bold text-slate-800">{report.system_tag || '-'}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[11px] block font-medium">Location:</span>
              <span className="font-bold text-slate-800">{report.location || '-'}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[11px] block font-medium">Inspection Date:</span>
              <span className="font-bold text-slate-800">{report.inspection_date || '-'}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[11px] block font-medium">Discipline:</span>
              <span className="font-bold text-brand-700">{report.discipline || '-'}</span>
            </div>
          </div>
        </div>

        {/* Inspection Table */}
        <div className="w-full bg-white rounded-xl shadow-xs border border-slate-200/80 overflow-hidden">
          <div className="px-4 md:px-5 py-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-brand-600" />
              <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Detail of Inspection ({items.length} {items.length === 1 ? 'item' : 'items'})
              </h2>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Click photos to zoom</span>
          </div>

          {/* Desktop Table View */}
          {!isMobile ? (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 text-xs font-bold">
                    <th className="w-12 px-3 py-2.5 text-center">No</th>
                    <th className="w-36 px-3 py-2.5">Tag</th>
                    <th className="px-3 py-2.5 min-w-[200px]">Inspection Description</th>
                    <th className="w-48 lg:w-60 px-3 py-2.5">Note</th>
                    <th className="px-3 py-2.5 text-center" colSpan={4}>Photos (Columns E, F, G, H)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {items.map((item, idx) => {
                    const hasContent = Boolean(item.tag?.trim() || item.description?.trim());
                    const no = hasContent ? seqCounter++ : '';
                    const photos = item.photos || [];

                    return (
                      <tr key={item.id || idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-3 py-3 text-center align-middle">
                          {no ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-slate-800 text-xs font-bold">
                              {no}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-xs font-mono">-</span>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top text-xs font-bold text-slate-800">
                          {item.tag || '-'}
                        </td>
                        <td className="px-3 py-3 align-top text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                          {item.description || '-'}
                        </td>
                        <td className="px-3 py-3 align-top text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
                          {item.note || '-'}
                        </td>
                        {[0, 1, 2, 3].map((slotIdx) => {
                          const p = photos[slotIdx];
                          return (
                            <td key={slotIdx} className="px-1.5 py-2 align-middle w-28 md:w-32 lg:w-36">
                              {p?.url ? (
                                <div
                                  onClick={() => setActivePhotoUrl(p.url)}
                                  className="relative group h-24 lg:h-28 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 cursor-pointer hover:border-brand-500 transition-all shadow-2xs"
                                >
                                  <img
                                    src={p.url}
                                    alt={p.filename || `Photo ${slotIdx + 1}`}
                                    className="w-full h-full object-contain p-0.5"
                                  />
                                  <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <ZoomIn className="w-5 h-5 text-white" />
                                  </div>
                                </div>
                              ) : (
                                <div className="h-24 lg:h-28 rounded-lg border border-dashed border-slate-200 bg-slate-50/40 flex items-center justify-center text-slate-300 text-[10px]">
                                  -
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Mobile Cards View */
            <div className="p-3 space-y-4">
              {items.map((item, idx) => {
                const hasContent = Boolean(item.tag?.trim() || item.description?.trim());
                const no = hasContent ? seqCounter++ : '';
                const photos = item.photos || [];

                return (
                  <div
                    key={item.id || idx}
                    className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 space-y-3"
                  >
                    <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2">
                      <span className="w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center">
                        {no || idx + 1}
                      </span>
                      <span className="font-bold text-xs text-slate-800">
                        {item.tag || 'No Tag'}
                      </span>
                    </div>

                    {item.description && (
                      <div>
                        <span className="text-[10px] font-semibold text-slate-400 block uppercase">
                          Description
                        </span>
                        <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                          {item.description}
                        </p>
                      </div>
                    )}

                    {item.note && (
                      <div>
                        <span className="text-[10px] font-semibold text-slate-400 block uppercase">
                          Note / Action
                        </span>
                        <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
                          {item.note}
                        </p>
                      </div>
                    )}

                    {/* 2x2 Photos Grid */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {[0, 1, 2, 3].map((slotIdx) => {
                        const p = photos[slotIdx];
                        return (
                          <div key={slotIdx} className="h-24 rounded-lg overflow-hidden border border-slate-200 bg-white">
                            {p?.url ? (
                              <img
                                src={p.url}
                                alt={`Photo ${slotIdx + 1}`}
                                onClick={() => setActivePhotoUrl(p.url)}
                                className="w-full h-full object-contain p-0.5 cursor-pointer"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-300 text-[10px]">
                                Empty
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info */}
        <footer className="text-center py-6 text-xs text-slate-400">
          <p>Flash Report Pro • Block B - EPC#1 Project</p>
          <a href="#/" className="text-brand-600 hover:underline inline-flex items-center gap-1 mt-1 font-medium">
            <ExternalLink className="w-3 h-3" />
            Open Flash Report Editor
          </a>
        </footer>
      </main>

      {/* Lightbox Zoom Modal */}
      <ImageModal
        isOpen={Boolean(activePhotoUrl)}
        imageUrl={activePhotoUrl}
        title={report.title}
        onClose={() => setActivePhotoUrl(null)}
      />

      {/* Toast Notification */}
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'success' })}
      />
    </div>
  );
}
