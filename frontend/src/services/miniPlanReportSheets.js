/**
 * The OVERVIEW sheet — sheet 1 of every Excel report this app produces.
 *
 * A progress report is read from the top: how much is done, what was due this
 * week, what actually happened, and which equipment is holding the rest up.
 * That page did not exist before — the file opened straight into 500 rows of
 * detail, which is a data dump, not a report.
 *
 * Everything on it is derived from the SAME rows the data sheet lists, through
 * the same predicates the app uses, so the summary cannot drift from the
 * detail behind it.
 */

import {
  rowState, ROW_STATE, normalizeStatus, scheduleKey, completedKey,
  todayKey, STATUS_DONE, inRange,
} from './miniPlan';
import { VIZ, INK, PAPER, FONT, border, fill, titleFont, labelFont, bodyFont } from './excelTheme';
import { donutChart, columnChart, rankChart } from './reportChart';

const STATE_ORDER = [
  { key: ROW_STATE.DONE,    viz: VIZ.done,    label: 'Done' },
  { key: ROW_STATE.TODAY,   viz: VIZ.today,   label: 'Due today - on-going' },
  { key: ROW_STATE.OVERDUE, viz: VIZ.overdue, label: 'Overdue - on-going' },
  { key: ROW_STATE.MISSED,  viz: VIZ.missed,  label: 'Overdue - not started' },
  { key: ROW_STATE.NONE,    viz: VIZ.planned, label: 'Planned (not due yet)' },
];

/** The figures the overview states, counted once. */
export function overviewFigures(rows, { today = todayKey(), range = null } = {}) {
  const counts = { done: 0, today: 0, overdue: 0, missed: 0, none: 0 };
  let planWeek = 0;
  let doneWeek = 0;

  for (const item of rows || []) {
    const st = rowState(item, today);
    if (st === ROW_STATE.DONE) counts.done++;
    else if (st === ROW_STATE.TODAY) counts.today++;
    else if (st === ROW_STATE.OVERDUE) counts.overdue++;
    else if (st === ROW_STATE.MISSED) counts.missed++;
    else counts.none++;

    if (range) {
      if (inRange(scheduleKey(item.schedule), range)) planWeek++;
      if (inRange(completedKey(item), range)) doneWeek++;
    }
  }

  const total = (rows || []).length;
  return {
    counts,
    total,
    done: counts.done,
    remaining: total - counts.done,
    percent: total ? Math.round((counts.done / total) * 100) : 0,
    planWeek,
    doneWeek,
    variance: doneWeek - planWeek,
    overdueAll: counts.overdue + counts.missed,
  };
}

/**
 * Write the overview sheet. Returns the worksheet so the caller can add more.
 *
 * @param wb        ExcelJS workbook
 * @param opts.rows       the ACTIVITY rows in view
 * @param opts.equipment  [{no, equipment, done, total}] for the ranking chart
 */
export function writeOverviewSheet(wb, {
  title,
  subtitle,
  rows,
  equipment = [],
  today = todayKey(),
  range = null,
  weekLabel = 'This week',
  sheetName = 'Overview',
}) {
  const f = overviewFigures(rows, { today, range });

  const ws = wb.addWorksheet(sheetName, {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.columns = [
    { width: 30 }, { width: 14 }, { width: 11 }, { width: 12 }, { width: 12 },
    { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
  ];

  // ── Title band ───────────────────────────────────────────────
  ws.mergeCells('A1:J1');
  const t = ws.getCell('A1');
  t.value = title;
  t.font = { name: FONT, size: 16, bold: true, color: { argb: INK.onDark.argb } };
  t.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  t.fill = fill(PAPER.header.argb);
  ws.getRow(1).height = 34;

  ws.mergeCells('A2:J2');
  const sub = ws.getCell('A2');
  sub.value = subtitle;
  sub.font = { name: FONT, size: 9.5, color: { argb: INK.secondary.argb } };
  sub.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(2).height = 20;

  // ── KPI strip ────────────────────────────────────────────────
  const kpis = [
    ['Equipment', equipment.length],
    ['Total tasks', f.total],
    ['Completed', f.done],
    ['Remaining', f.remaining],
    ['% complete', `${f.percent}%`],
    ['Overdue', f.overdueAll],
    [`Plan ${weekLabel.toLowerCase()}`, f.planWeek],
    [`Done ${weekLabel.toLowerCase()}`, f.doneWeek],
    ['Var (Done - Plan)', f.variance > 0 ? `+${f.variance}` : String(f.variance)],
  ];

  ws.getRow(4).height = 15;
  ws.getRow(5).height = 26;
  kpis.forEach(([label, value], i) => {
    const col = i + 1;
    const l = ws.getCell(4, col);
    l.value = label;
    l.font = labelFont(8.5);
    l.alignment = { horizontal: 'center', vertical: 'middle' };
    l.fill = fill(PAPER.panel.argb);
    l.border = border();

    const v = ws.getCell(5, col);
    v.value = value;
    v.font = {
      name: FONT, size: 15, bold: true,
      color: { argb: label.startsWith('Var') && f.variance < 0 ? VIZ.missed.argb : INK.primary.argb },
    };
    v.alignment = { horizontal: 'center', vertical: 'middle' };
    v.border = border();
  });

  // ── Status breakdown table ───────────────────────────────────
  ws.getCell('A7').value = 'STATUS BREAKDOWN';
  ws.getCell('A7').font = labelFont(9);

  const head = ['State', 'Tasks', 'Share'];
  head.forEach((h, i) => {
    const c = ws.getCell(8, i + 1);
    c.value = h;
    c.font = { name: FONT, size: 9.5, bold: true, color: { argb: INK.onDark.argb } };
    c.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle', indent: i === 0 ? 1 : 0 };
    c.fill = fill(PAPER.header.argb);
    c.border = border();
  });

  STATE_ORDER.forEach((state, i) => {
    const r = 9 + i;
    const n = f.counts[state.key] ?? 0;
    const a = ws.getCell(r, 1);
    a.value = state.label;
    a.font = bodyFont(9.5);
    a.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    a.fill = fill(i % 2 ? PAPER.band.argb : null);
    a.border = border();

    const b = ws.getCell(r, 2);
    b.value = n;
    b.font = { name: FONT, size: 10, bold: true, color: { argb: state.viz.argb } };
    b.alignment = { horizontal: 'center', vertical: 'middle' };
    b.fill = fill(i % 2 ? PAPER.band.argb : null);
    b.border = border();

    const c = ws.getCell(r, 3);
    c.value = f.total ? n / f.total : 0;
    c.numFmt = '0%';
    c.font = bodyFont(9.5);
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.fill = fill(i % 2 ? PAPER.band.argb : null);
    c.border = border();
    ws.getRow(r).height = 17;
  });

  // ── Charts ───────────────────────────────────────────────────
  // Pictures, because ExcelJS cannot write a native chart. Every value they
  // show is on this sheet in figures as well, so nothing depends on the image.
  try {
    const donut = donutChart(
      STATE_ORDER.map((s) => ({
        key: s.key, label: s.label, value: f.counts[s.key] ?? 0, color: s.viz.hex,
      })),
      { heading: 'Completion', centerSub: 'complete' }
    );
    ws.addImage(wb.addImage({ base64: donut, extension: 'png' }), {
      tl: { col: 3.1, row: 6.2 }, ext: { width: 330, height: 220 },
    });

    const week = columnChart(
      [
        { label: `Plan ${weekLabel.toLowerCase()}`, value: f.planWeek, color: VIZ.plan.hex },
        { label: `Done ${weekLabel.toLowerCase()}`, value: f.doneWeek, color: VIZ.actual.hex },
      ],
      {
        heading: `${weekLabel}: plan vs actual`,
        footnote: range ? `${range.start} to ${range.end}` : '',
      }
    );
    ws.addImage(wb.addImage({ base64: week, extension: 'png' }), {
      tl: { col: 6.6, row: 6.2 }, ext: { width: 330, height: 220 },
    });

    const ranked = [...equipment]
      .filter((e) => e.total > 0)
      .sort((a, b) => (b.total - b.done) - (a.total - a.done))
      .slice(0, 10)
      .map((e) => ({ label: `${e.no ? `${e.no}. ` : ''}${e.equipment}`, done: e.done, total: e.total }));

    if (ranked.length) {
      ws.getCell('A16').value = 'EQUIPMENT WITH THE MOST WORK OUTSTANDING';
      ws.getCell('A16').font = labelFont(9);
      const rank = rankChart(ranked, { heading: 'Done / total activities per equipment' });
      ws.addImage(wb.addImage({ base64: rank, extension: 'png' }), {
        tl: { col: 0.1, row: 16.4 }, ext: { width: 690, height: 260 },
      });
      for (let r = 17; r <= 30; r++) ws.getRow(r).height = 19;
    }
  } catch (e) {
    // A chart that cannot be drawn must never cost the reader the report.
    console.warn('Overview charts skipped:', e?.message);
  }

  return ws;
}
