import React, { useEffect, useState } from 'react';
import { FileText, RefreshCw, Download, ArrowLeft } from 'lucide-react';
import { getAttachmentBlob, formatBytes, openBlob } from '../services/fileAttachments';
import FilePreviewModal, { FilePreviewBody, useTypedObjectUrl } from './FilePreviewModal';

/**
 * Public attachment page — `#/file/<shareId>/<key>`.
 *
 * This is what an exported report's file link points at. It reads from the
 * `shared_reports` collection, which the Firestore rules expose as world-
 * readable, so a recipient opens the file with NO sign-in. That requirement is
 * the whole reason attachments live in Firestore rather than Google Drive.
 *
 * PDFs and images render inline, and since v3.21.0 so do Outlook emails
 * (.msg/.eml), Word (.docx) and Excel/CSV — through the same viewer the app
 * uses (`FilePreviewBody`). Anything else is offered as a download.
 */
export default function FileViewer({ shareId, fileKey }) {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const got = await getAttachmentBlob('shared', shareId, fileKey);
        if (cancelled) return;
        if (!got) { setState({ status: 'missing' }); return; }
        document.title = got.meta.filename || 'Attachment';
        setState({ status: 'ready', meta: got.meta, blob: got.blob });
      } catch (e) {
        if (!cancelled) setState({ status: 'error', message: e.message });
      }
    })();

    return () => { cancelled = true; };
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

  return <ReadyFile meta={state.meta} blob={state.blob} />;
}

export function ReadyFile({ meta, blob }) {
  const { url, type } = useTypedObjectUrl(blob, meta.filename, meta.mime);
  // An attachment opened from INSIDE an email shown on this page.
  const [nested, setNested] = useState(null);

  return (
    <div className="h-screen flex flex-col bg-slate-900">
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
          onClick={() => openBlob(blob, meta.filename, { forceDownload: true })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors flex-shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Download</span>
        </button>
      </header>

      <main className="flex-1 min-h-0 p-2 sm:p-4">
        {url && (
          <FilePreviewBody
            blob={blob}
            url={url}
            filename={meta.filename}
            type={type}
            onOpenNested={(att) => att?.content && setNested({
              blob: new Blob([att.content], { type: att.mime }),
              filename: att.filename, mime: att.mime, size: att.size,
            })}
          />
        )}
      </main>

      <FilePreviewModal
        isOpen={!!nested}
        blob={nested?.blob}
        filename={nested?.filename}
        mime={nested?.mime}
        size={nested?.size}
        onClose={() => setNested(null)}
      />
    </div>
  );
}
