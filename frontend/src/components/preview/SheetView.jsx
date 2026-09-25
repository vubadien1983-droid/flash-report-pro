import React, { useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import {
  worksheetToModel, csvToModel, modelToHtml, loadWorkbookTolerant, SHEET_CSS, MAX_ROWS, MAX_COLS,
} from '../../services/sheetPreview';

/**
 * An Excel (.xlsx/.xlsm) or CSV attachment as a read-only grid with sheet
 * tabs — v3.21.0. The grid is built once per sheet as an HTML string (see
 * sheetPreview.js for why not React elements). Charts are not drawn.
 */
export default function SheetView({ blob, kind, filename }) {
  const [state, setState] = useState({ status: 'loading' });
  const [active, setActive] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    (async () => {
      try {
        let models;
        let picturesDropped = false;
        if (kind === 'csv') {
          const buf = new Uint8Array(await blob.arrayBuffer());
          let text = new TextDecoder('utf-8').decode(buf);
          // A CSV saved by Excel on a Vietnamese Windows is not UTF-8.
          if (text.includes('\uFFFD')) text = new TextDecoder('windows-1258').decode(buf);
          models = [csvToModel(text, filename || 'CSV')];
        } else {
          const [{ default: ExcelJS }, { default: JSZip }] = await Promise.all([import('exceljs'), import('jszip')]);
          const wb = await loadWorkbookTolerant(ExcelJS, await blob.arrayBuffer(), JSZip);
          picturesDropped = !!wb.picturesDropped;
          models = wb.worksheets.map((ws) => worksheetToModel(ws, wb));
        }
        if (!models.length) throw new Error('The workbook has no sheets.');
        const sheets = models.map((m) => ({ ...m, html: modelToHtml(m) }));
        const firstVisible = Math.max(0, sheets.findIndex((s) => !s.hidden));
        if (!cancelled) { setState({ status: 'ready', sheets, picturesDropped }); setActive(firstVisible); }
      } catch (e) {
        if (!cancelled) setState({ status: 'error', message: e?.message || String(e) });
      }
    })();
    return () => { cancelled = true; };
  }, [blob, kind, filename]);

  if (state.status === 'loading') {
    return (
      <div className="w-full h-full flex items-center justify-center gap-2 text-white/80 text-sm">
        <RefreshCw className="w-5 h-5 animate-spin" /> Opening spreadsheet…
      </div>
    );
  }
  if (state.status === 'error') throw new Error(`This spreadsheet could not be shown: ${state.message}`);

  const sheet = state.sheets[active] || state.sheets[0];

  return (
    <div className="w-full h-full flex flex-col bg-white rounded-lg overflow-hidden">
      <style>{SHEET_CSS}</style>
      {state.picturesDropped && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-[12px] bg-amber-50 text-amber-800 border-b border-amber-200 flex-shrink-0">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          The pictures in this file could not be read here — the cells are shown. Download it to see the pictures.
        </div>
      )}
      {sheet.truncated && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-[12px] bg-amber-50 text-amber-800 border-b border-amber-200 flex-shrink-0">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Showing the first {Math.min(sheet.totalRows, MAX_ROWS)} rows × {Math.min(sheet.totalCols, MAX_COLS)} columns
          of {sheet.totalRows} × {sheet.totalCols}. Download the file to see all of it.
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-auto" dangerouslySetInnerHTML={{ __html: sheet.html }} />
      {state.sheets.length > 1 && (
        <div className="flex-shrink-0 flex gap-0.5 overflow-x-auto border-t border-slate-200 bg-slate-100 px-1 pt-0.5">
          {state.sheets.map((s, i) => (
            <button
              key={`${s.name}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              className={`px-3 py-1.5 text-[12px] whitespace-nowrap rounded-b-md border-x border-b ${
                i === active
                  ? 'bg-white text-emerald-700 font-bold border-slate-300 -mt-px'
                  : 'text-slate-600 border-transparent hover:bg-white/60'
              } ${s.hidden ? 'italic opacity-70' : ''}`}
            >
              {s.name}{s.hidden ? ' (hidden)' : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
