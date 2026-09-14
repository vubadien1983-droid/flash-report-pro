import React, { useEffect, useRef, useState } from 'react';
import { weeklySeries, weeksForWidth } from '../services/miniPlanWeekly';

/**
 * Plan vs actual, week by week — the one picture a progress meeting runs on.
 *
 *   columns : tasks planned in the week, and tasks actually finished in it
 *   lines   : the two running totals, on their own axis at the right
 *
 * The actual column and the actual line STOP at the current week: a future
 * week has no actual yet, and drawing a zero there would read as failure.
 *
 * How many weeks are drawn depends on how wide the box is (weeksForWidth), so
 * the same chart is legible on a phone and on the meeting-room screen instead
 * of being squeezed into 40 unreadable columns. Every column top and every
 * line node carries its number, so nothing has to be measured by eye.
 */

const C = {
  plan: '#2A78D6',
  actual: '#1BAF7A',
  cumPlan: '#1F3A5F',
  cumActual: '#0E7C56',
  axis: '#CBD5E1',
  ink: '#1F3A5F',
  muted: '#7C8DA3',
  now: '#EC835A',
};

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setW(el.clientWidth || 0);
    read();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', read);
      return () => window.removeEventListener('resize', read);
    }
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function Legend() {
  const chip = (color, label, line = false) => (
    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-slate-600">
      {line
        ? <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke={color} strokeWidth="2"
            strokeDasharray={label.includes('Plan') ? '4 3' : ''} /></svg>
        : <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />}
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {chip(C.plan, 'Plan / week')}
      {chip(C.actual, 'Actual / week')}
      {chip(C.cumPlan, 'Cum. Plan', true)}
      {chip(C.cumActual, 'Cum. Actual', true)}
    </div>
  );
}

export default function WeeklyProgressChart({ items, today, compact = false, className = '' }) {
  const [ref, width] = useWidth();

  const maxWeeks = weeksForWidth(width);
  const series = weeklySeries(items, { today, maxWeeks });
  const { weeks, totals } = series;

  const H = compact ? 168 : 214;
  const W = Math.max(320, width || 320);
  const M = { top: 16, right: 38, bottom: 26, left: 32 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  const maxBar = Math.max(1, ...weeks.map((w) => Math.max(w.plan, w.actual || 0)));
  const maxCum = Math.max(1, ...weeks.map((w) => Math.max(w.cumPlan, w.cumActual || 0)));
  const band = weeks.length ? plotW / weeks.length : plotW;
  const barW = Math.max(4, Math.min(16, band * 0.32));
  const yBar = (v) => M.top + plotH - (v / maxBar) * plotH;
  const yCum = (v) => M.top + plotH - (v / maxCum) * plotH;
  const xMid = (i) => M.left + band * (i + 0.5);

  const labelEvery = weeks.length > 16 ? 2 : 1;
  // A number drawn over a bar or a line needs a white halo behind it, or the
  // chart turns into a smudge exactly where it is being read.
  const halo = { paintOrder: 'stroke', stroke: '#FFFFFF', strokeWidth: 3, strokeLinejoin: 'round' };
  const everyCum = weeks.length > 10 ? 2 : 1;
  const lastActual = weeks.reduce((acc, w, i) => (w.cumActual == null ? acc : i), -1);
  const line = (pick) => weeks
    .map((w, i) => (pick(w) == null ? null : `${xMid(i)},${yCum(pick(w))}`))
    .filter(Boolean)
    .join(' ');

  const variance = (totals.doneToDate ?? 0) - (totals.planToDate ?? 0);

  return (
    <div ref={ref} className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-1">
        <h3 className="text-[11.5px] font-bold uppercase tracking-wider text-black">
          Weekly progress — plan vs actual
        </h3>
        <Legend />
      </div>

      {!series.hasData ? (
        <p className="py-6 text-center text-[12px] text-slate-500">
          No dated task yet — add a Schedule and the curve starts.
        </p>
      ) : (
        <>
          <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img"
            aria-label="Weekly plan versus actual tasks">
            {/* baseline and the two axis ends, nothing else: no gridlines */}
            <line x1={M.left} y1={M.top + plotH} x2={M.left + plotW} y2={M.top + plotH}
              stroke={C.axis} strokeWidth="1" />
            <text x={M.left - 6} y={M.top + 4} textAnchor="end" fontSize="9" fill={C.muted}>{maxBar}</text>
            <text x={M.left + plotW + 6} y={M.top + 4} fontSize="9" fill={C.muted}>{maxCum}</text>

            {weeks.map((w, i) => {
              const x = xMid(i);
              return (
                <g key={w.key}>
                  {w.isCurrent && (
                    <>
                      <rect x={x - band / 2} y={M.top - 6} width={band} height={plotH + 6}
                        fill={C.now} opacity="0.07" />
                      <text x={x} y={M.top - 8} textAnchor="middle" fontSize="8.5"
                        fontWeight="700" fill={C.now}>NOW</text>
                    </>
                  )}

                  {w.plan > 0 && (
                    <>
                      <rect x={x - barW - 1} y={yBar(w.plan)} width={barW}
                        height={M.top + plotH - yBar(w.plan)} rx="2" fill={C.plan} />
                      <text x={x - barW / 2 - 1} y={yBar(w.plan) - 5} textAnchor="middle"
                        fontSize="9" fontWeight="700" fill={C.plan} style={halo}>{w.plan}</text>
                    </>
                  )}
                  {w.actual != null && w.actual > 0 && (
                    <>
                      <rect x={x + 1} y={yBar(w.actual)} width={barW}
                        height={M.top + plotH - yBar(w.actual)} rx="2" fill={C.actual} />
                      <text x={x + barW / 2 + 1} y={yBar(w.actual) - 5} textAnchor="middle"
                        fontSize="9" fontWeight="700" fill={C.actual} style={halo}>{w.actual}</text>
                    </>
                  )}

                  {i % labelEvery === 0 && (
                    <text x={x} y={H - 8} textAnchor="middle" fontSize="9"
                      fontWeight={w.isCurrent ? '700' : '400'}
                      fill={w.isCurrent ? C.ink : C.muted}>{w.label}</text>
                  )}
                </g>
              );
            })}

            <polyline points={line((w) => w.cumPlan)} fill="none" stroke={C.cumPlan}
              strokeWidth="1.8" strokeDasharray="4 3" strokeLinejoin="round" />
            <polyline points={line((w) => w.cumActual)} fill="none" stroke={C.cumActual}
              strokeWidth="2.2" strokeLinejoin="round" />

            {weeks.map((w, i) => {
              const anchor = w.isCurrent || i === 0 || i === weeks.length - 1 || i === lastActual;
              const show = i % everyCum === 0 || anchor;
              return (
                <g key={`n${w.key}`}>
                  <circle cx={xMid(i)} cy={yCum(w.cumPlan)} r="2.4" fill={C.cumPlan} />
                  {show && (
                    <text x={xMid(i)} y={yCum(w.cumPlan) - 8} textAnchor="middle" fontSize="8.5"
                      fontWeight="700" fill={C.cumPlan} style={halo}>{w.cumPlan}</text>
                  )}
                  {w.cumActual != null && (
                    <>
                      <circle cx={xMid(i)} cy={yCum(w.cumActual)} r={w.isCurrent ? 3.4 : 2.4}
                        fill={C.cumActual} />
                      {show && (
                        <text x={xMid(i)} y={yCum(w.cumActual) + 14} textAnchor="middle" fontSize="8.5"
                          fontWeight="700" fill={C.cumActual} style={halo}>{w.cumActual}</text>
                      )}
                    </>
                  )}
                </g>
              );
            })}
          </svg>

          <p className="text-[10.5px] text-slate-500 leading-tight">
            To this week: plan <strong className="text-slate-700 tabular-nums">{totals.planToDate}</strong>,
            done <strong className="text-slate-700 tabular-nums">{totals.doneToDate}</strong>,
            variance <strong className={`tabular-nums ${variance < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {variance > 0 ? `+${variance}` : variance}
            </strong>
            {totals.unplanned > 0 && (
              <> · <span className="text-amber-700">{totals.unplanned} task with no plan date are not in this chart</span></>
            )}
            {' '}· showing {weeks.length} of {series.window.of} weeks
          </p>
        </>
      )}
    </div>
  );
}
