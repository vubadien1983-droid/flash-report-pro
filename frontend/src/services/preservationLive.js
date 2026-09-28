/**
 * The live share link of the Preservation Findings report — the SAME
 * machinery as the Mini Plan's and the OPS Findings' links
 * (services/miniPlanLive.js), with this report's row normaliser and merge
 * rules plugged in:
 *
 *  - one Firestore listener on `shared_reports/{shareId}`, photo bytes fetched
 *    once per ref and cached, "missing" vs "loading" kept apart (BUG-012/036);
 *  - edits from an unlocked link write photo BYTES first, then a three-way
 *    MERGED item list to the shared copy and to the source report
 *    (BUG-032/033); photo deletions stay deletions (`threeWayPhotos`, BUG-048).
 */

import { subscribeSharedMiniPlan, pushSharedMiniPlanEdit } from './miniPlanLive';
import { normalizePfItems, PF_MERGE_FIELDS } from './preservationFindings';

export const PF_MERGE_OPTS = { fields: PF_MERGE_FIELDS, regroup: false, threeWayPhotos: true, preferMineOrder: true };

/** @returns {() => void} unsubscribe */
export function subscribeSharedPf(shareId, onData, onError) {
  return subscribeSharedMiniPlan(shareId, onData, onError, { normalize: normalizePfItems });
}

export function pushSharedPfEdit(shareId, sourceReportId, items, options = {}) {
  return pushSharedMiniPlanEdit(shareId, sourceReportId, items, {
    ...options,
    normalize: normalizePfItems,
    mergeOpts: PF_MERGE_OPTS,
    compareFields: PF_MERGE_FIELDS,
  });
}
