/**
 * The look of every report this app produces.
 *
 * Two rules decide everything here:
 *
 *  - **No black.** Not in a fill, not in a font, not in a border. Ink is navy
 *    (`INK.primary`), secondary text is slate-blue, rules are pale blue-grey.
 *    A progress report that is read in a meeting and printed for a folder
 *    should not look like a terminal window, and the user asked for it plainly.
 *  - **The chart colours ARE the plan's colours.** Done is the green the row is
 *    on screen, overdue-not-started is the same rose, and so on, so somebody
 *    who reads the app and somebody who reads the .xlsx are looking at one
 *    colour language (BUG-014's rule, applied to a report).
 *
 * The status steps are the validated status palette (good / due / warning /
 * critical) plus one deliberate NEUTRAL for work that is simply not due yet —
 * a neutral is not a categorical hue and is meant to recede. The two-series
 * plan-vs-actual pair (blue / aqua) passes the all-pairs colour-blindness and
 * normal-vision separation checks on a white sheet; the amber and the aqua sit
 * below 3:1 against white, which is why every chart in this file carries
 * DIRECT LABELS and a legend with counts rather than relying on hue.
 */

/** Chart + fill colours, saturated (for marks), with the ARGB Excel needs. */
export const VIZ = {
  done:      { hex: '#0CA30C', argb: 'FF0CA30C', label: 'Done' },
  today:     { hex: '#2A78D6', argb: 'FF2A78D6', label: 'Due today' },
  overdue:   { hex: '#D98A00', argb: 'FFD98A00', label: 'Overdue - on-going' },
  missed:    { hex: '#D03B3B', argb: 'FFD03B3B', label: 'Overdue - not started' },
  planned:   { hex: '#7C8DA3', argb: 'FF7C8DA3', label: 'Planned' },
  plan:      { hex: '#2A78D6', argb: 'FF2A78D6', label: 'Plan' },
  actual:    { hex: '#1BAF7A', argb: 'FF1BAF7A', label: 'Actual' },
};

/** Ink and paper. Never #000000. */
export const INK = {
  primary:   { hex: '#1F3A5F', argb: 'FF1F3A5F' },   // navy
  secondary: { hex: '#51607A', argb: 'FF51607A' },
  muted:     { hex: '#8494AC', argb: 'FF8494AC' },
  onDark:    { hex: '#FFFFFF', argb: 'FFFFFFFF' },
};

export const PAPER = {
  surface:   { hex: '#FFFFFF', argb: 'FFFFFFFF' },
  band:      { hex: '#F4F7FB', argb: 'FFF4F7FB' },   // table stripe
  panel:     { hex: '#EAF0F8', argb: 'FFEAF0F8' },   // KPI card
  header:    { hex: '#1F3A5F', argb: 'FF1F3A5F' },   // table head (navy)
  accent:    { hex: '#2A78D6', argb: 'FF2A78D6' },
  rule:      { hex: '#C7D3E3', argb: 'FFC7D3E3' },
};

/** Pale row tints, matching the app's row colours but printable. */
export const ROW_TINT = {
  done:    'FFE7F6E7',
  today:   'FFE4EEFB',
  overdue: 'FFFBF0DC',
  missed:  'FFFBE4E4',
  none:    null,
};

export const border = (argb = PAPER.rule.argb) => ({
  top:    { style: 'thin', color: { argb } },
  left:   { style: 'thin', color: { argb } },
  bottom: { style: 'thin', color: { argb } },
  right:  { style: 'thin', color: { argb } },
});

export const FONT = 'Calibri';

export const titleFont  = (size = 15) => ({ name: FONT, size, bold: true, color: { argb: INK.primary.argb } });
export const labelFont  = (size = 9)  => ({ name: FONT, size, bold: true, color: { argb: INK.secondary.argb } });
export const bodyFont   = (size = 10) => ({ name: FONT, size, color: { argb: INK.primary.argb } });
export const headFont   = (size = 10) => ({ name: FONT, size, bold: true, color: { argb: INK.onDark.argb } });

export function fill(argb) {
  return argb ? { type: 'pattern', pattern: 'solid', fgColor: { argb } } : undefined;
}
