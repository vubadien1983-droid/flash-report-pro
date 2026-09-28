import React, { useState } from 'react';
import { PF_STATUS, PF_STATUS_STYLE } from '../services/preservationFindings';

/**
 * Charts of the Preservation Summary tab.
 *
 * Status carries the app's reserved status colours (Open red · On-going amber ·
 * Closed green) — the same three the table rows, the badges, Excel and PDF use
 * (OPS_STATUS_STYLE), always with the status NAME beside the colour, never
 * colour alone. Text stays in ink colours, not series colours. Thin marks, a
 * 2px surface gap between stacked segments, a hover tooltip on every segment.
 */

const HEX = {
  [PF_STATUS.OPEN]: '#DC2626',
  [PF_STATUS.ONGOING]: '#F59E0B',
  [PF_STATUS.CLOSED]: '#059669',
};
const ORDER = [PF_STATUS.OPEN, PF_STATUS.ONGOING, PF_STATUS.CLOSED];
const KEY = { [PF_STATUS.OPEN]: 'open', [PF_STATUS.ONGOING]: 'ongoing', [PF_STATUS.CLOSED]: 'closed' };

export function StatusLegend({ className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 text-[11.5px] text-slate-600 ${className}`}>
      {ORDER.map((st) => (
        <span key={st} className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: HEX[st] }} />{st}
        </span>
      ))}
    </div>
  );
}

/** Donut of the three statuses with the total in the middle. */
export function StatusDonut({ stats, size = 168, onPick, picked }) {
  const [hover, setHover] = useState(null);
  const total = stats.total || 0;
  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const gap = ORDER.filter((st) => stats[KEY[st]] > 0).length > 1 ? 2 : 0;
  let acc = 0;
  const segs = ORDER.map((st) => {
    const v = stats[KEY[st]] || 0;
    const len = total ? (v / total) * circ : 0;
    const seg = { st, v, len, off: acc };
    acc += len;
    return seg;
  }).filter((x) => x.v > 0);

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Findings by close-out status">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F1F5F9" strokeWidth="20" />
        {segs.map((sg) => (
          <circle key={sg.st} cx={cx} cy={cy} r={r} fill="none"
            stroke={HEX[sg.st]} strokeWidth={hover === sg.st || picked === sg.st ? 24 : 20}
            strokeDasharray={`${Math.max(0, sg.len - gap)} ${circ}`}
            strokeDashoffset={-sg.off}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ cursor: onPick ? 'pointer' : 'default', transition: 'stroke-width .12s' }}
            onMouseEnter={() => setHover(sg.st)} onMouseLeave={() => setHover(null)}
            onClick={() => onPick?.(sg.st)}>
            <title>{`${sg.st}: ${sg.v} (${Math.round((sg.v / total) * 100)}%)`}</title>
          </circle>
        ))}
        <text x={cx} y={cy - 2} textAnchor="middle" className="fill-slate-900" style={{ fontSize: 26, fontWeight: 800 }}>
          {hover ? (stats[KEY[hover]] || 0) : total}
        </text>
        <text x={cx} y={cy + 17} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 11 }}>
          {hover || 'findings'}
        </text>
      </svg>
      <div className="space-y-1.5 min-w-[140px]">
        {ORDER.map((st) => {
          const v = stats[KEY[st]] || 0;
          return (
            <button key={st} type="button" onClick={() => onPick?.(st)}
              className={`w-full flex items-center gap-2 text-left px-2 py-1 rounded-lg border ${picked === st ? 'border-brand-500 bg-brand-50' : 'border-transparent hover:bg-slate-50'}`}>
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: HEX[st] }} />
              <span className="flex-1 text-[12.5px] text-slate-700">{st}</span>
              <span className="text-[13px] font-bold tabular-nums text-slate-900">{v}</span>
              <span className="w-10 text-right text-[11.5px] tabular-nums text-slate-500">{total ? `${Math.round((v / total) * 100)}%` : '—'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Horizontal stacked bars, one per group (Action By, Facility, Discipline…),
 * split by status. One axis, scaled to the largest group. Clicking a bar
 * filters by that group.
 */
export function StackedStatusBars({ rows, onPick, pickedValue, maxRows = 12, labelWidth = 150 }) {
  const [tip, setTip] = useState(null);
  const shown = rows.slice(0, maxRows);
  const rest = rows.length - shown.length;
  const max = Math.max(1, ...shown.map((r) => r.total));
  if (!rows.length) return <div className="text-[12px] text-slate-400 py-4 text-center">No findings yet.</div>;
  return (
    <div className="relative">
      <div className="space-y-1">
        {shown.map((r) => {
          const on = pickedValue && pickedValue === r.value;
          return (
            <button key={r.value} type="button" onClick={() => onPick?.(r)}
              className={`w-full flex items-center gap-2 px-1 py-0.5 rounded-md text-left ${on ? 'bg-brand-50 ring-1 ring-brand-400' : 'hover:bg-slate-50'}`}
              title={`${r.name}: ${r.total} — Open ${r.open} · On-going ${r.ongoing} · Closed ${r.closed}`}>
              <span className={`flex-shrink-0 truncate text-[12px] ${r.blank ? 'text-amber-800 font-semibold' : 'text-slate-700'}`} style={{ width: labelWidth }}>{r.name}</span>
              <span className="flex-1 h-[14px] flex items-stretch">
                <span className="flex h-full" style={{ width: `${(r.total / max) * 100}%`, gap: 2 }}>
                  {ORDER.map((st) => {
                    const v = r[KEY[st]];
                    if (!v) return null;
                    return (
                      <span key={st} className="h-full first:rounded-l-[4px] last:rounded-r-[4px]"
                        style={{ flex: `${v} 0 0`, background: HEX[st], minWidth: 3 }}
                        onMouseEnter={(e) => setTip({ x: e.currentTarget.offsetLeft, name: r.name, st, v })}
                        onMouseLeave={() => setTip(null)} />
                    );
                  })}
                </span>
              </span>
              <span className="w-9 text-right text-[12px] font-bold tabular-nums text-slate-900">{r.total}</span>
              <span className="w-10 text-right text-[11px] tabular-nums text-slate-500">{r.percentClosed}%</span>
            </button>
          );
        })}
      </div>
      {rest > 0 && <div className="text-[11px] text-slate-500 mt-1 px-1">+ {rest} more (see the table below)</div>}
      {tip && (
        <div className="pointer-events-none absolute -top-7 right-2 px-2 py-1 rounded-md bg-slate-900 text-white text-[11px] shadow-lg">
          {tip.name} · {tip.st}: <b>{tip.v}</b>
        </div>
      )}
    </div>
  );
}
