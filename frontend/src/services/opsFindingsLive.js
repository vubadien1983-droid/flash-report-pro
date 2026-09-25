/**
 * The live share link of the OPS Findings report — the SAME machinery as the
 * CPP Mechanical Mini Plan's link (services/miniPlanLive.js), with the OPS row
 * normaliser and merge rules plugged in:
 *
 *  - one Firestore listener on `shared_reports/{shareId}`, photo bytes fetched
 *    once per ref and cached, "missing" vs "loading" kept apart (BUG-012/036);
 *  - edits from an unlocked tab write photo BYTES first, then a three-way
 *    MERGED item list to the shared copy and to the source report
 *    (BUG-032/033), photo deletions stay deletions (`threeWayPhotos`, BUG-048);
 *  - bytes already in the cloud are never re-sent (BUG-040).
 */

import {
  subscribeSharedMiniPlan, pushSharedMiniPlanEdit,
} from './miniPlanLive';
import { normalizeOpsItems, OPS_MERGE_FIELDS } from './opsFindings';

export const OPS_MERGE_OPTS = { fields: OPS_MERGE_FIELDS, regroup: false, threeWayPhotos: true, preferMineOrder: true };

/** @returns {() => void} unsubscribe */
export function subscribeSharedOps(shareId, onData, onError) {
  return subscribeSharedMiniPlan(shareId, onData, onError, { normalize: normalizeOpsItems });
}

export function pushSharedOpsEdit(shareId, sourceReportId, items, options = {}) {
  return pushSharedMiniPlanEdit(shareId, sourceReportId, items, {
    ...options,
    normalize: normalizeOpsItems,
    mergeOpts: OPS_MERGE_OPTS,
    compareFields: OPS_MERGE_FIELDS,
  });
}
