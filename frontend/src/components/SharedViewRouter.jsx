import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import ReportViewer from './ReportViewer';
import MiniPlanViewer from './MiniPlanViewer';
import OpsFindingsViewer from './OpsFindingsViewer';
import PreservationViewer from './PreservationViewer';
import FlashEditViewer from './FlashEditViewer';
import { isEditRequested } from '../services/flashEdit';
import { fetchSharedReportType, findSharedIdByType } from '../services/shareService';
import { TYPE_PREFIX } from '../services/shareAliases';
import { MINI_PLAN_TYPE } from '../services/miniPlan';
import { OPS_FINDINGS_TYPE } from '../services/opsFindings';
import { PRESERVATION_TYPE } from '../services/preservationFindings';

/**
 * Picks the right public viewer for a share link.
 *
 * A Flash Report link opens the snapshot viewer; a Mini Plan link opens the
 * LIVE viewer, which holds a Firestore listener and can edit behind the
 * project password. The two have different data flows, so the choice is made
 * before either mounts rather than inside one of them.
 *
 * The probe reads the parent document only (`fetchSharedReportType`), never
 * the photos. It also never throws: an unreadable link falls through to the
 * Flash Report viewer, which already has a "Report Not Found" screen, so a
 * broken link shows a useful page instead of a blank one.
 */
export default function SharedViewRouter({ shareId: requested }) {
  const [type, setType] = useState(null);   // null = still probing
  // A type-named link (#/Preservation-Findings-Status → "@type:…") is resolved
  // to the real share id first (v3.31.2).
  const byType = String(requested || '').startsWith(TYPE_PREFIX) ? requested.slice(TYPE_PREFIX.length) : '';
  const [shareId, setShareId] = useState(byType ? null : requested);
  const [unshared, setUnshared] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUnshared(false);
    setType(null);
    if (!byType) { setShareId(requested); return undefined; }
    setShareId(null);
    findSharedIdByType(byType).then((id) => {
      if (cancelled) return;
      if (id) setShareId(id); else { setUnshared(true); setType(''); }
    });
    return () => { cancelled = true; };
  }, [requested, byType]);

  useEffect(() => {
    let cancelled = false;
    if (shareId === null) return undefined;
    if (!shareId) { setType(''); return undefined; }

    fetchSharedReportType(shareId)
      .then((t) => { if (!cancelled) setType(t || ''); })
      .catch(() => { if (!cancelled) setType(''); });

    return () => { cancelled = true; };
  }, [shareId]);

  if (unshared) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-slate-100 p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-lg border border-slate-200">
          <h2 className="text-lg font-bold text-slate-900 mb-2">This report is not shared yet</h2>
          <p className="text-xs text-slate-500">The owner has to open it in the app once and press Live Link. Then this address works for everyone.</p>
        </div>
      </div>
    );
  }

  if (type === null) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white gap-3 p-4">
        <RefreshCw className="w-8 h-8 text-brand-400 animate-spin" />
        <p className="text-sm font-medium text-slate-300">Opening shared report…</p>
      </div>
    );
  }

  if (type === MINI_PLAN_TYPE) return <MiniPlanViewer shareId={shareId} />;
  if (type === OPS_FINDINGS_TYPE) return <OpsFindingsViewer shareId={shareId} />;
  if (type === PRESERVATION_TYPE) return <PreservationViewer shareId={shareId} />;
  // Flash Report: the view-only page, or — with ?edit=1 — the editable page
  // behind the report's edit password (v3.37.0).
  if (isEditRequested()) return <FlashEditViewer shareId={shareId} />;
  return <ReportViewer reportId={shareId} />;
}
