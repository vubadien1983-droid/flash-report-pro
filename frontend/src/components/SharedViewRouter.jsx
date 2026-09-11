import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import ReportViewer from './ReportViewer';
import MiniPlanViewer from './MiniPlanViewer';
import { fetchSharedReportType } from '../services/shareService';
import { MINI_PLAN_TYPE } from '../services/miniPlan';

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
export default function SharedViewRouter({ shareId }) {
  const [type, setType] = useState(null);   // null = still probing

  useEffect(() => {
    let cancelled = false;
    if (!shareId) { setType(''); return undefined; }

    fetchSharedReportType(shareId)
      .then((t) => { if (!cancelled) setType(t || ''); })
      .catch(() => { if (!cancelled) setType(''); });

    return () => { cancelled = true; };
  }, [shareId]);

  if (type === null) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white gap-3 p-4">
        <RefreshCw className="w-8 h-8 text-brand-400 animate-spin" />
        <p className="text-sm font-medium text-slate-300">Opening shared report…</p>
      </div>
    );
  }

  if (type === MINI_PLAN_TYPE) return <MiniPlanViewer shareId={shareId} />;
  return <ReportViewer reportId={shareId} />;
}
