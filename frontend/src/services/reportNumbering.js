/**
 * Row numbering — ONE definition, used everywhere.
 *
 * There used to be three different rules in the same product:
 *
 *   - InspectionTable grouped consecutive rows sharing a Tag and numbered the
 *     group once, so a second finding under the same Tag showed no number.
 *   - The Excel and PDF exporters numbered every row whose Tag OR Description
 *     was filled.
 *   - ReportViewer counted items by yet another variation.
 *
 * So a report could read "1, —" on screen and "1, 2" in the exported file.
 * That is what the user hit: two findings under the tag "Exhaust Duct System",
 * numbered 1 and 2 in the PDF and Excel but 1 and nothing in the app.
 *
 * The rule below is the exported one, because that is the document people
 * actually sign and send: EVERY row that carries content gets the next number.
 *
 * NEVER re-implement this inline. Import it.
 */

/**
 * A row counts as real content if the inspector put anything in it — including
 * a row that is only photos or only a note, which the old export rule ignored.
 */
export function rowHasContent(item) {
  if (!item) return false;
  if ((item.tag || '').trim()) return true;
  if ((item.description || '').trim()) return true;
  if ((item.note || '').trim()) return true;
  return (item.photos || []).some((p) => p && (p.url || p.kind === 'file'));
}

/**
 * @returns {Array<number|''>} one entry per item: its number, or '' for an
 * empty row. Positions line up with the input array.
 */
export function computeRowNumbers(items) {
  let n = 0;
  return (items || []).map((item) => (rowHasContent(item) ? ++n : ''));
}

/** How many rows the report actually contains. */
export function countContentRows(items) {
  return (items || []).filter(rowHasContent).length;
}
