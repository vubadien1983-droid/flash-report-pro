/**
 * SyncStatusIndicator — 3-state visual sync indicator
 *
 * States:
 *   synced   → Green checkmark  "Cloud Synced"
 *   pending  → Yellow pulse     "Local Only (N pending)"
 *   conflict → Orange warning   "Conflict"
 *   failed   → Red X            "Sync Failed"
 *   offline  → Gray cloud       "Offline"
 *   syncing  → Blue spinner     "Syncing..."
 */

import React from 'react';
import { Check, CloudOff, RefreshCw, AlertTriangle, XCircle, Upload } from 'lucide-react';
import { SyncStatus } from '../services/syncEngine';

const STATUS_CONFIG = {
  [SyncStatus.SYNCED]: {
    icon: Check,
    label: 'Cloud Synced',
    bgClass: 'bg-emerald-50',
    textClass: 'text-emerald-700',
    borderClass: 'border-emerald-200',
    dotClass: 'bg-emerald-500',
    animate: false,
  },
  [SyncStatus.PENDING]: {
    icon: Upload,
    label: 'Local Only',
    bgClass: 'bg-amber-50',
    textClass: 'text-amber-700',
    borderClass: 'border-amber-200',
    dotClass: 'bg-amber-500',
    animate: true,
  },
  [SyncStatus.CONFLICT]: {
    icon: AlertTriangle,
    label: 'Conflict',
    bgClass: 'bg-orange-50',
    textClass: 'text-orange-700',
    borderClass: 'border-orange-200',
    dotClass: 'bg-orange-500',
    animate: true,
  },
  [SyncStatus.FAILED]: {
    icon: XCircle,
    label: 'Sync Failed',
    bgClass: 'bg-red-50',
    textClass: 'text-red-700',
    borderClass: 'border-red-200',
    dotClass: 'bg-red-500',
    animate: false,
  },
  [SyncStatus.OFFLINE]: {
    icon: CloudOff,
    label: 'Offline',
    bgClass: 'bg-slate-100',
    textClass: 'text-slate-500',
    borderClass: 'border-slate-200',
    dotClass: 'bg-slate-400',
    animate: false,
  },
  syncing: {
    icon: RefreshCw,
    label: 'Syncing...',
    bgClass: 'bg-sky-50',
    textClass: 'text-sky-700',
    borderClass: 'border-sky-200',
    dotClass: 'bg-sky-500',
    animate: true,
  },
};

export default function SyncStatusIndicator({
  status = SyncStatus.SYNCED,
  pendingCount = 0,
  compact = false,
  onRetry,
}) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG[SyncStatus.SYNCED];
  const Icon = config.icon;

  const label = status === SyncStatus.PENDING && pendingCount > 0
    ? `Local Only (${pendingCount})`
    : config.label;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${config.bgClass} ${config.textClass} border ${config.borderClass}`}
        title={label}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass} ${config.animate ? 'animate-pulse' : ''}`} />
        {status === 'syncing' && <Icon className="w-2.5 h-2.5 animate-spin" />}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${config.bgClass} ${config.textClass} border ${config.borderClass} cursor-default select-none`}
      title={`Sync Status: ${label}`}
    >
      {status === 'syncing' ? (
        <Icon className="w-3 h-3 animate-spin" />
      ) : (
        <>
          <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass} ${config.animate ? 'animate-pulse' : ''}`} />
          <Icon className="w-3 h-3" />
        </>
      )}
      <span>{label}</span>

      {/* Retry button for failed status */}
      {status === SyncStatus.FAILED && onRetry && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRetry(); }}
          className="ml-0.5 px-1 py-0 text-[9px] font-bold text-red-600 hover:text-red-800 underline"
        >
          Retry
        </button>
      )}
    </span>
  );
}

/**
 * Per-report sync status dot (shown in sidebar report list)
 */
export function ReportSyncDot({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG[SyncStatus.SYNCED];
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${config.dotClass} ${config.animate ? 'animate-pulse' : ''} flex-shrink-0`}
      title={config.label}
    />
  );
}
