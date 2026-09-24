import React, { useEffect, useMemo, useRef, useState } from 'react';
import { opsClosureSeries } from '../services/opsFindings';

/**
 * "Closed over time" on the OPS Summary tab.
 *
 * Per week: findings OPENED (grey column) and CLOSED (green column), on the
 * left scale; the cumulative number CLOSED (green line) and the OPEN BACKLOG
 * at the end of the week (red line), on the right scale. The same series
 * (services/opsFindings.js opsClosureSeries) feeds the Excel Summary sheet, so
 * the file cannot disagree with the screen.
 *
 * Responsive SVG, sized from its container with a ResizeObserver — no per-row
 * layout measurement anywhere (BUG-021's rule does not apply to one chart).
 */
const C = {
  opened: '#CBD5E1', closed: '#059669', cum: '#047857', backlog: '#DC2626',
  grid: '#E2E8F0', ink: '#334155', soft: '#64748B', now: '#EEF2FF',
};

export default function OpsClosureChart({ items, height = 260 }) {
  const boxRef = useRef(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    if (!boxRef.current || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((es) => { const w = es[0]?.contentRect?.width; if (w) setWidth(Math.max(280, w)); });
    ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, []);

  const maxWeeks = width < 480 ? 8 : width < 800 ? 14 : 24;
  const { weeks, totals } = useMemo(() => opsClosureSeries(items, { maxWeeks }), [items, maxWeeks]);

  const pad = { l: 34, r: 38, t: 18, b: 34 };
  const W = width;
  const H = height;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const n = Math.max(1, weeks.length);
  const slot = iw / n;
  const barW = Math.max(3, Math.min(16, slot * 0.32));
  const maxBar = Math.max(1, ...weeks.map((w) => Math.max(w.opened, w.closed)));
  const maxLine = Math.max(1, ...weeks.map((w) => Math.max(w.cumClosed, w.backlog)));
  const yb = (v) => pad.t + ih - (v / maxBar) * ih;
  const yl = (v) => pad.t + ih - (v / maxLine) * ih;
  const xc = (i) => pad.l + slot * i + slot / 2;
  const line = (key) => weeks.map((w, i) => `${i ? 'L' : 'M'}${xc(i).toFixed(1)},${yl(w[key]).toFixed(1)}`).join(' ');
  const every = Math.max(1, Math.ceil(n / Math.max(4, Math.floor(iw / 58))));
  const halo = { paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3, strokeLinejoin: 'round' };

  return (
    <div ref={boxRef} className="w-full">
      <svg width={W} height={H} role="img" aria-label="Findings closed over time">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih * (1 - f)} y2={pad.t + ih * (1 - f)} stroke={C.grid} />
            <text x={pad.l - 5} y={pad.t + ih * (1 - f) + 3} textAnchor="end" fontSize="10" fill={C.soft}>{Math.round(maxBar * f)}</text>
            <text x={W - pad.r + 5} y={pad.t + ih * (1 - f) + 3} fontSize="10" fill={C.soft}>{Math.round(maxLine * f)}</text>
          </g>
        ))}
        {weeks.map((w, i) => (
          <g key={w.week}>
            {w.isNow && <rect x={pad.l + slot * i} y={pad.t} width={slot} height={ih} fill={C.now} />}
            <rect x={xc(i) - barW - 1} y={yb(w.opened)} width={barW} height={pad.t + ih - yb(w.opened)} fill={C.opened} rx="1.5" />
            <rect x={xc(i) + 1} y={yb(w.closed)} width={barW} height={pad.t + ih - yb(w.closed)} fill={C.closed} rx="1.5" />
            {w.closed > 0 && <text x={xc(i) + 1 + barW / 2} y={yb(w.closed) - 3} textAnchor="middle" fontSize="10" fontWeight="700" fill={C.closed} style={halo}>{w.closed}</text>}
            {(i % every === 0 || w.isNow) && (
              <text x={xc(i)} y={H - pad.b + 14} textAnchor="middle" fontSize="10" fill={w.isNow ? '#4338CA' : C.soft} fontWeight={w.isNow ? 700 : 400}>
                {w.isNow ? 'NOW' : w.label}
              </text>
            )}
          </g>
        ))}
        <path d={line('backlog')} fill="none" stroke={C.backlog} strokeWidth="2.2" />
        <path d={line('cumClosed')} fill="none" stroke={C.cum} strokeWidth="2.2" />
        {weeks.map((w, i) => (
          <g key={`p${w.week}`}>
            <circle cx={xc(i)} cy={yl(w.backlog)} r="2.6" fill={C.backlog} />
            <circle cx={xc(i)} cy={yl(w.cumClosed)} r="2.6" fill={C.cum} />
            {(i === n - 1 || i === 0) && (
              <>
                <text x={xc(i)} y={yl(w.backlog) - 6} textAnchor="middle" fontSize="10" fontWeight="700" fill={C.backlog} style={halo}>{w.backlog}</text>
                <text x={xc(i)} y={yl(w.cumClosed) - 6} textAnchor="middle" fontSize="10" fontWeight="700" fill={C.cum} style={halo}>{w.cumClosed}</text>
              </>
            )}
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600 px-1 mt-1">
        <span className="inline-flex items-center gap-1"><span className="w-3 h-2.5 rounded-sm" style={{ background: C.opened }} /> Opened in week</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-2.5 rounded-sm" style={{ background: C.closed }} /> Closed in week</span>
        <span className="inline-flex items-center gap-1"><span className="w-4 h-0.5" style={{ background: C.cum }} /> Total closed (right scale)</span>
        <span className="inline-flex items-center gap-1"><span className="w-4 h-0.5" style={{ background: C.backlog }} /> Still open (right scale)</span>
        <span className="ml-auto text-slate-500">
          {totals.closed} of {totals.total} closed
          {totals.closedNoDate ? ` · ${totals.closedNoDate} closed without a date` : ''}
        </span>
      </div>
    </div>
  );
}
