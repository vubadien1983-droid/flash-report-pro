import React, { useEffect, useState } from 'react';
import { FileText, RefreshCw, Download, ArrowLeft, ExternalLink } from 'lucide-react';
import { getAttachmentBlob, formatBytes, openBlob } from '../services/fileAttachments';

/**
 * Public attachment page — `#/file/<shareId>/<key>`.
 *
 * This is what an exported report's file link points at. It reads from the
 * `shared_reports` collection, which the Firestore rules expose as world-
 * readable, so a recipient opens the file with NO sign-in. That requirement is
 * the whole reason attachments live in Firestore rather than Google Drive.
 *
 * PDFs and images render inline; anything else is offered as a download,
 * because a browser cannot display a .docx or a .dwg on its own.
 */
export default function FileViewer({ shareId, fileKey }) {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let revoked = null;
    let cancelled = false;

    (async () => {
      try {
        const got = await getAttachmentBlob('shared', shareId, fileKey);
        if (cancelled) return;
        if (!got) { setState({ status: 'missing' }); return; }
        const url = URL.createObjectURL(got.blob);
        revoked = url;
        document.title = got.meta.filename || 'Attachment';
        setState({ status: 'ready', url, meta: got.meta, blob: got.blob });
      } catch (e) {
        if (!cancelled) setState({ status: 'error', message: e.message });
      }
    })();

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [shareId, fileKey]);

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white gap-3 p-4">
        <RefreshCw className="w-8 h-8 text-brand-400 animate-spin" />
        <p className="text-sm font-medium text-slate-300">Opening attachment…</p>
      </div>
    );
  }

  if (state.status !== 'ready') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-lg border border-slate-200">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Attachment not available</h2>
          <p className="text-xs text-slate-500 mb-6">
            {state.status === 'missing'
              ? 'This file is not in the shared report — it may not have finished uploading, or the report was re-shared without it.'
              : state.message || 'Something went wrong loading this file.'}
          </p>
          <a
            href="#/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Go to Flash Report
          </a>
        </div>
      </div>
    );
  }

  const { meta, url, blob } = state;
  const mime = meta.mime || '';
  const inline = mime === 'application/pdf' || mime.startsWith('image/') || mime.startsWith('text/');

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <header className="h-14 px-3 sm:px-5 bg-white border-b border-slate-200 flex items-center justify-between gap-3 flex-shrink-0 shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center text-white flex-shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-bold text-slate-900 truncate">{meta.filename}</h1>
            <p className="text-[11px] text-slate-500">{formatBytes(meta.size)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => openBlob(blob, meta.filename)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors flex-shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Download</span>
        </button>
      </header>

      <main className="flex-1 min-h-0 p-2 sm:p-4">
        {inline ? (
          mime.startsWith('image/') ? (
            <div className="w-full h-full flex items-center justify-center bg-white rounded-xl border border-slate-200 overflow-auto p-2">
              <img src={url} alt={meta.filename} className="max-w-full h-auto" />
            </div>
          ) : (
            <iframe
              src={url}
              title={meta.filename}
              className="w-full h-[calc(100vh-6rem)] rounded-xl border border-slate-200 bg-white"
            />
          )
        ) : (
          <div className="max-w-md mx-auto mt-10 bg-white rounded-2xl p-8 text-center shadow-xs border border-slate-200">
            <div className="w-12 h-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-4">
              <ExternalLink className="w-6 h-6" />
            </div>
            <h2 className="text-sm font-bold text-slate-900 mb-1">{meta.filename}</h2>
            <p className="text-xs text-slate-500 mb-5">
              This type of file cannot be shown in a browser. Download it to open in the right app.
            </p>
            <button
              type="button"
              onClick={() => openBlob(blob, meta.filename)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl transition-colors"
            >
              <Download className="w-4 h-4" />
              Download {formatBytes(meta.size)}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
