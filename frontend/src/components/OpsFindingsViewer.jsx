import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, FileSpreadsheet, FileText, Radio, AlertTriangle } from 'lucide-react';
import OpsFindingsWorkspace from './OpsFindingsWorkspace';
import ImageModal from './ImageModal';
import FilePreviewModal from './FilePreviewModal';
import { subscribeSharedOps } from '../services/opsFindingsLive';
import { getAttachmentBlob } from '../services/fileAttachments';
import { isFirebaseConfigured } from '../services/firebase';
import { normalizeOpsItems, OPS_FINDINGS_LABEL } from '../services/opsFindings';

/**
 * The public, READ-ONLY, LIVE view of an OPS Findings report.
 *
 * No password: nothing on it can change the report (the user's decision —
 * editing happens in the app). It follows the shared document live, so the
 * reader always sees the latest the author has saved. Search, filters and
 * the Excel / PDF exports work here too; exporting is reading, not editing.
 */
export default function OpsFindingsViewer({ shareId }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [stalled, setStalled] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [subKey, setSubKey] = useState(0);
  const [exporting, setExporting] = useState('');
  const [lightbox, setLightbox] = useState({ isOpen: false, index: 0, photos: [] });
  const [filePreview, setFilePreview] = useState({ isOpen: false, blob: null, filename: '', mime: '', size: 0 });
  const [toast, setToast] = useState('');
  const [width, setWidth] = useState(window.innerWidth);
  const viewRef = useRef(null);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    setError('');
    setStalled(false);
    const timer = setTimeout(() => setStalled(true), 15000);
    const unsub = subscribeSharedOps(
      shareId,
      (data) => { clearTimeout(timer); setStalled(false); setReport(data); setUpdatedAt(new Date()); },
      (err) => { clearTimeout(timer); setError(err?.message || String(err)); },
    );
    return () => { clearTimeout(timer); unsub(); };
  }, [shareId, subKey]);

  useEffect(() => { if (report?.title) document.title = report.title; }, [report?.title]);

  const say = (m) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  const openFile = async (photo) => {
    const ref = photo?.file_ref;
    if (!ref) return;
    say(`Opening ${photo.filename || 'file'}…`);
    try {
      const got = await getAttachmentBlob('shared', shareId, ref);
      if (!got) { say('That file is not available on the link yet.'); return; }
      setFilePreview({
        isOpen: true, blob: got.blob,
        filename: got.meta?.filename || photo.filename || 'file',
        mime: got.meta?.mime || got.blob.type || '', size: got.meta?.size || got.blob.size || 0,
      });
    } catch (e) { say(`Could not open the file: ${e.message}`); }
  };

  const doExport = async (kind) => {
    if (!report) return;
    setExporting(kind);
    try {
      const mod = await import('../services/opsFindingsExport');
      const rep = { ...report, items: normalizeOpsItems(report.items) };
      if (kind === 'xlsx') await mod.exportOpsExcel(rep, viewRef.current);
      else await mod.exportOpsPdf(rep, viewRef.current);
    } catch (e) {
      console.error(e);
      say(`Export failed: ${e.message}`);
    } finally { setExporting(''); }
  };

  if (!report) {
    const failed = error || stalled;
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white gap-3 p-6 text-center">
        {failed ? <AlertTriangle className="w-8 h-8 text-amber-400" /> : <RefreshCw className="w-8 h-8 text-brand-400 animate-spin" />}
        <p className="text-sm font-semibold">{failed ? 'The report did not load' : 'Opening the findings report…'}</p>
        {failed && (
          <>
            <p className="text-[13px] text-slate-300 max-w-md">{error || 'No answer from the cloud after 15 seconds. Check the connection and try again.'}</p>
            <button type="button" onClick={() => setSubKey((k) => k + 1)} className="mt-2 px-4 py-2 rounded-lg bg-brand-600 text-sm font-bold">Try again</button>
            <p className="text-[11px] text-slate-500 mt-2">Report id: {shareId} · cloud settings: {isFirebaseConfigured ? 'present' : 'MISSING in this build'}</p>
          </>
        )}
      </div>
    );
  }

  const items = normalizeOpsItems(report.items);
  const exportBtns = (
    <>
      <button type="button" disabled={Boolean(exporting)} onClick={() => doExport('xlsx')}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg">
        {exporting === 'xlsx' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />} Excel
      </button>
      <button type="button" disabled={Boolean(exporting)} onClick={() => doExport('pdf')}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg">
        {exporting === 'pdf' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} PDF
      </button>
    </>
  );

  return (
    <div className="min-h-screen w-full bg-slate-100">
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 px-3 py-1.5 flex items-center gap-2 text-[12px]">
        <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
        <span className="font-bold text-slate-800">Live · read-only</span>
        <span className="text-slate-500 truncate">
          {report.title || OPS_FINDINGS_LABEL}
          {updatedAt ? ` · refreshed ${updatedAt.toLocaleTimeString()}` : ''}
        </span>
      </div>
      <div className="p-2 md:p-4">
        <OpsFindingsWorkspace
          report={report}
          items={items}
          onItemsChange={() => {}}
          readOnly
          isMobileMode={width < 768}
          onViewChange={(v) => { viewRef.current = v; }}
          onPhotoClick={(entry, rowEntries) => {
            const list = (rowEntries || []).filter(Boolean);
            const at = list.findIndex((p) => (entry?.id ? p.id === entry.id : p.url === entry?.url));
            setLightbox({ isOpen: true, index: at < 0 ? 0 : at, photos: list });
          }}
          onOpenAttachment={(p) => openFile(p)}
          toolbarExtra={exportBtns}
          notify={say}
        />
      </div>

      <ImageModal
        isOpen={lightbox.isOpen}
        photos={lightbox.photos}
        index={lightbox.index}
        onIndexChange={(i) => setLightbox((s) => ({ ...s, index: i }))}
        title={report.title}
        onClose={() => setLightbox({ isOpen: false, index: 0, photos: [] })}
        onOpenAttachment={(p) => openFile(p)}
      />
      <FilePreviewModal
        isOpen={filePreview.isOpen}
        blob={filePreview.blob}
        filename={filePreview.filename}
        mime={filePreview.mime}
        size={filePreview.size}
        onClose={() => setFilePreview({ isOpen: false, blob: null, filename: '', mime: '', size: 0 })}
      />
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] px-4 py-2 rounded-xl bg-slate-900 text-white text-[12.5px] font-semibold shadow-xl">{toast}</div>
      )}
    </div>
  );
}
