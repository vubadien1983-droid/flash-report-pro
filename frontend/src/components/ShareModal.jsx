import React, { useState, useEffect, useRef } from 'react';
import {
  Link as LinkIcon, Copy, Check, ExternalLink, QrCode, X, Share2, Sparkles, Smartphone, Download, Globe
} from 'lucide-react';
import { exportStandaloneHtml } from '../services/htmlExporter';

export default function ShareModal({ isOpen, shareUrl, report, onClose }) {
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !shareUrl || !canvasRef.current) return;

    let cancelled = false;

    // qrcode is only needed once the share dialog is actually opened, so it
    // is kept out of the main bundle.
    import('qrcode')
      .then(({ default: QRCode }) => {
        if (cancelled || !canvasRef.current) return;
        QRCode.toCanvas(
          canvasRef.current,
          shareUrl,
          {
            width: 140,
            margin: 2,
            color: {
              dark: '#0f172a',
              light: '#ffffff'
            }
          },
          (error) => {
            if (error) console.error('Local QR render error:', error);
          }
        );
      })
      .catch((e) => console.warn('QR library failed to load:', e.message));

    return () => { cancelled = true; };
  }, [isOpen, shareUrl]);

  if (!isOpen || !shareUrl) return null;

  const reportTitle = report?.title || 'Flash Inspection Report';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: reportTitle,
          text: `Flash Inspection Report: ${reportTitle}`,
          url: shareUrl
        });
      } catch (err) {
        console.warn('Share cancelled or failed:', err);
      }
    } else {
      handleCopy();
    }
  };

  const handleDownloadHtml = () => {
    exportStandaloneHtml(report);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-5 md:p-6 border border-slate-200">
        {/* Header */}
        <div className="flex items-start justify-between mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-sky-400 flex items-center justify-center text-white shadow-md shadow-brand-500/20">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm md:text-base font-bold text-slate-900">Share Flash Report</h3>
              <p className="text-xs text-slate-500">Recipients can view the report and export Excel / PDF</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Report Title Badge */}
        <div className="mb-4 p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center gap-2">
          <span className="px-2 py-0.5 bg-brand-100 text-brand-700 text-[10px] font-bold rounded-md uppercase">
            Report
          </span>
          <span className="text-xs font-semibold text-slate-800 truncate">
            {reportTitle}
          </span>
        </div>

        {/* Share Link Input & Copy Button */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
            <span>Shareable Online Link</span>
            {copied && (
              <span className="text-emerald-600 text-xs font-medium flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Copied to clipboard!
              </span>
            )}
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <LinkIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                readOnly
                value={shareUrl}
                onClick={(e) => e.target.select()}
                className="w-full text-xs font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 outline-none focus:border-brand-500 focus:bg-white transition-all select-all"
              />
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex-shrink-0 ${
                copied
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                  : 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm shadow-brand-600/30 hover:scale-[1.02]'
              }`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Local Canvas QR Code & Mobile Scan Area */}
        <div className="mb-4 p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl flex flex-col sm:flex-row items-center gap-4">
          <div className="w-[140px] h-[140px] bg-white p-1 rounded-xl border border-slate-200 shadow-xs flex items-center justify-center flex-shrink-0">
            <canvas ref={canvasRef} className="rounded-lg max-w-full max-h-full" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-bold text-slate-800 mb-1">
              <Smartphone className="w-4 h-4 text-brand-600" />
              Scan QR Code with Phone
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed mb-2.5">
              Open your phone camera to scan and view this report on mobile immediately.
            </p>
            {typeof navigator !== 'undefined' && navigator.share && (
              <button
                type="button"
                onClick={handleNativeShare}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold shadow-2xs transition-colors"
              >
                <Share2 className="w-3.5 h-3.5 text-brand-600" />
                Share via Zalo / App
              </button>
            )}
          </div>
        </div>

        {/* Option 2: Download Standalone HTML Web Report */}
        <div className="mb-4 p-3 bg-brand-50/60 border border-brand-200/60 rounded-xl flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-brand-900 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-brand-600" />
              Download Standalone Web Report (.html)
            </div>
            <p className="text-[11px] text-brand-700">
              Single interactive file to send via Zalo/Email. Opens directly in any browser.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownloadHtml}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-2xs transition-colors flex-shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Download HTML
          </button>
        </div>

        {/* Bottom Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Close
          </button>
          <a
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-xl transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open in New Tab
          </a>
        </div>
      </div>
    </div>
  );
}
