/**
 * One-time update of the Mini Plan from the CMS "Checksheet A" issue.
 *
 * The rules, exactly as the plan owner stated them:
 *
 *   1. Take the equipment number (CPPT-…) out of the Equipment text, and the
 *      checksheet code (Mxx-A) out of the Activities text of each row.
 *   2. Tag normalisation, both sides: a trailing sub-number is dropped
 *      (CPPT-E-3001-01/02 -> CPPT-E-3001) and spaces inside the tag are closed
 *      up (CPPT-P-3402 B -> CPPT-P-3402B, CPPT-PK - 5101 -> CPPT-PK-5101).
 *   3. Checksheet found in the file  -> Schedule = its PlanFinish date.
 *   4. Checksheet NOT found          -> Note = "CMS Check".
 *   5. Two checksheet codes in one row                      -> Note = "CMS Check".
 *   6. Equipment whose text carries a tag in brackets
 *      (e.g. "LUBE OIL TANK MIST SEPARATOR (CPPT-PK-6001)") -> Note = "CMS Check"
 *      on every row that has a checksheet: which equipment the checksheet
 *      belongs to cannot be decided from the text.
 *   7. The file has a checksheet for an equipment that is in the plan, but the
 *      plan has no row for it -> add one row:
 *      Activities = "Complete and NFI for <TYPE>", Schedule = PlanFinish.
 *   8. Anything that does not meet a rule above is LEFT ALONE. An empty cell is
 *      honest; a guessed date is not.
 *
 * It runs itself: the first time a plan is opened after this release, the
 * update is applied and the plan is stamped, so it never runs twice — no
 * import button, no file to load, nothing to click. Saving the plan (or the
 * next autosave) writes the result back.
 */
import { CHECKSHEET_A } from './checksheetData.js';

export const CS_STAMP = 'cs_update_1';
export const CMS_NOTE = 'CMS Check';

const CODE = /\b[A-Z]\d{2}-[AB]\b/g;
const TAG_IN_TEXT = /CPPT\s*-\s*[A-Z]+\s*-\s*\d+\s*[A-Z]?(?:\s*-\s*[\dA-Z/]+)?/gi;
const TAG_IN_BRACKETS = /\([^)]*CPPT[^)]*\)/i;

/** 'CPPT-E-3001-01/02' -> 'CPPT-E-3001'; 'CPPT-P-3402 B' -> 'CPPT-P-3402B'. */
export function normalizeTag(raw) {
  const s = String(raw || '').toUpperCase().replace(/\s*-\s*/g, '-').replace(/\s+/g, '');
  const parts = s.split('-');
  if (parts.length < 3) return '';
  return parts.slice(0, 3).join('-');
}

/**
 * The tag a row's equipment refers to, or '' when the text cannot say so:
 * no tag at all, a tag still written with XX placeholders, or a second tag in
 * brackets (rule 6). `bracket` tells the two apart, because one gets a note
 * and the other is left alone.
 */
export function equipmentTag(equipment) {
  const text = String(equipment || '');
  if (TAG_IN_BRACKETS.test(text)) return { tag: '', bracket: true };
  const found = text.match(TAG_IN_TEXT);
  if (!found) return { tag: '', bracket: false };
  const tag = normalizeTag(found[found.length - 1]);
  if (!tag || /X{2,}/.test(tag)) return { tag: '', bracket: false };
  return { tag, bracket: false };
}

export function checksheetCodes(activity) {
  const found = String(activity || '').toUpperCase().match(CODE);
  return found ? Array.from(new Set(found)) : [];
}

/** Add the note without destroying what is already written there. */
function withNote(note) {
  const cur = String(note || '').trim();
  if (!cur) return CMS_NOTE;
  if (/CMS/i.test(cur)) return cur;          // already says the same thing
  return `${cur} / ${CMS_NOTE}`;
}

export function planDateFor(tag, code) {
  return CHECKSHEET_A[`${tag}|${code}`] || '';
}

/**
 * Apply the update to a normalised item list. Returns the SAME array when
 * there is nothing to do, so React sees no change.
 *
 * `makeRow(groupId, equipment)` builds a blank row of the plan's own shape.
 */
export function applyChecksheetUpdate(items, makeRow) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return items;
  if (list.some((it) => it && it[CS_STAMP])) return items;   // already done

  const out = [];
  let touched = 0;
  let i = 0;

  while (i < list.length) {
    const groupId = list[i].group_id;
    const rows = [];
    while (i < list.length && list[i].group_id === groupId) { rows.push(list[i]); i += 1; }

    const equipment = rows.find((r) => r.equipment)?.equipment || '';
    const { tag, bracket } = equipmentTag(equipment);
    const seen = new Set();

    rows.forEach((row) => {
      const codes = checksheetCodes(row.activity);
      if (!codes.length) { out.push(row); return; }              // rule 8
      if (bracket) { out.push({ ...row, note: withNote(row.note) }); touched += 1; return; }
      if (!tag) { out.push(row); return; }                       // rule 8
      if (codes.length > 1) { out.push({ ...row, note: withNote(row.note) }); touched += 1; return; }

      const code = codes[0];
      seen.add(code);
      const date = code.endsWith('-A') ? planDateFor(tag, code) : '';
      if (date) {
        if ((row.schedule || '') === date) { out.push(row); return; }
        out.push({ ...row, schedule: date });
        touched += 1;
      } else {
        out.push({ ...row, note: withNote(row.note) });
        touched += 1;
      }
    });

    if (tag) {                                                    // rule 7
      Object.keys(CHECKSHEET_A).forEach((key) => {
        const [t, code] = key.split('|');
        if (t !== tag || seen.has(code)) return;
        const row = makeRow(groupId, equipment);
        row.activity = `Complete and NFI for ${code}`;
        row.schedule = CHECKSHEET_A[key];
        row[CS_STAMP] = 1;
        out.push(row);
        touched += 1;
      });
    }
  }

  if (!touched) return items;
  out[0] = { ...out[0], [CS_STAMP]: 1 };          // never run again on this plan
  return out;
}
