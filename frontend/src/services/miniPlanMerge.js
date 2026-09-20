/**
 * Three-way merge for the Mini Plan.
 *
 * Two people on two devices edit the same plan at the same time — one in the
 * app, one through the share link. Until now every save wrote the WHOLE items
 * array, so whoever saved last silently erased what the other had just done.
 * A plan used in a meeting cannot work that way.
 *
 * So a save is no longer "write what I have". It is:
 *
 *      base    what this device last saw from the cloud
 *      mine    what this device has now
 *      theirs  what is in the cloud right now
 *      ->      merge(base, mine, theirs), then write that
 *
 * The rules, in the order they matter:
 *
 *   1. Rows are matched by `id`, never by position. Two devices adding rows
 *      would otherwise line up different work on the same index.
 *   2. Per FIELD, not per row: if I did not touch a field, their value wins;
 *      if they did not touch it, mine wins. Only a field both of us changed is
 *      a conflict, and there the local edit wins — that is the person actually
 *      looking at the work.
 *   3. Photos are never lost. The two lists are unioned by slot, and a slot
 *      that carries bytes beats the same slot as a bare pointer.
 *   4. An EDIT BEATS A DELETE. If I deleted a row that they edited (or the
 *      reverse), the row stays. Getting a row back is a two-second fix;
 *      getting it back after it was erased everywhere is not possible.
 */

const FIELDS = [
  'equipment', 'activity', 'schedule', 'status', 'completed_date', 'note',
  'group_id', 'report_type',
];

const keyOf = (item, i) => item?.id || `${item?.group_id || 'g'}#${item?.activity || ''}#${i}`;

function indexBy(list) {
  const map = new Map();
  (list || []).forEach((item, i) => {
    if (!item) return;
    map.set(keyOf(item, i), item);
  });
  return map;
}

const same = (a, b) => (a ?? '') === (b ?? '');

/** A photo carrying bytes beats the same slot as a bare pointer (rule 3). */
function mergePhotos(basePhotos, minePhotos, theirPhotos) {
  const slots = new Map();
  const add = (list, weight) => {
    (list || []).forEach((p, i) => {
      if (!p) return;
      const slot = p.slot_index ?? i;
      const cur = slots.get(slot);
      const score = (p.url ? 2 : 0) + weight;          // bytes first, then side
      if (!cur || score > cur.score) slots.set(slot, { photo: p, score });
    });
  };
  add(basePhotos, 0);
  add(theirPhotos, 0.5);
  add(minePhotos, 1);                                   // ties go to this device
  return [...slots.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v.photo);
}

function mergeRow(base, mine, theirs, stats) {
  const out = { ...theirs, ...mine };                   // start from mine, keep unknown keys

  /**
   * Set a field, or REMOVE it when the winning side does not have one.
   *
   * `out[f] = undefined` looks harmless in JavaScript and is fatal in
   * Firestore: setDoc refuses the whole document with "Unsupported field
   * value: undefined", so a photo pasted through the link was never saved and
   * the picture was lost with it (BUG-041). A row that never carried a field
   * must come out of the merge still not carrying it.
   */
  const put = (f, v) => {
    if (v === undefined) delete out[f];
    else out[f] = v;
  };

  FIELDS.forEach((f) => {
    const b = base ? base[f] : undefined;
    const m = mine[f];
    const t = theirs[f];
    if (same(m, t)) { put(f, m); return; }
    if (base && same(m, b)) { put(f, t); stats.fromTheirs += 1; return; }    // I did not touch it
    if (base && same(t, b)) { put(f, m); stats.fromMine += 1; return; }      // they did not touch it
    put(f, m);                                                              // both did: local wins
    stats.conflicts += 1;
  });
  out.photos = mergePhotos(base?.photos, mine.photos, theirs.photos);
  return out;
}

/**
 * @param {Array} base   the copy this device last received from the cloud
 * @param {Array} mine   what this device holds now
 * @param {Array} theirs what the cloud holds now
 * @returns {{items:Array, stats:object}}
 */
export function mergeMiniPlanItems(base, mine, theirs) {
  const mineList = Array.isArray(mine) ? mine : [];
  const theirList = Array.isArray(theirs) ? theirs : [];
  if (!theirList.length) return { items: mineList, stats: empty('no remote rows') };
  if (!mineList.length) return { items: theirList, stats: empty('no local rows') };

  const baseMap = indexBy(base);
  const mineMap = indexBy(mineList);
  const theirMap = indexBy(theirList);
  const stats = {
    fromMine: 0, fromTheirs: 0, conflicts: 0,
    addedRemote: 0, addedLocal: 0, deleted: 0, keptOverDelete: 0, note: '',
  };

  const out = [];
  const taken = new Set();

  // Their order is the shared order, so it leads.
  theirList.forEach((theirRow, i) => {
    const key = keyOf(theirRow, i);
    taken.add(key);
    const mineRow = mineMap.get(key);
    const baseRow = baseMap.get(key);

    if (mineRow) { out.push(mergeRow(baseRow, mineRow, theirRow, stats)); return; }
    if (!baseRow) { out.push(theirRow); stats.addedRemote += 1; return; }   // they added it

    // I deleted it. Honour that only if they left it alone (rule 4).
    const theyEdited = FIELDS.some((f) => !same(theirRow[f], baseRow[f]));
    if (theyEdited) { out.push(theirRow); stats.keptOverDelete += 1; }
    else stats.deleted += 1;
  });

  // Rows only this device has: new ones, or ones they deleted.
  mineList.forEach((mineRow, i) => {
    const key = keyOf(mineRow, i);
    if (taken.has(key)) return;
    const baseRow = baseMap.get(key);
    if (!baseRow) {
      out.push(mineRow);                                   // my new row
      stats.addedLocal += 1;
      return;
    }
    const iEdited = FIELDS.some((f) => !same(mineRow[f], baseRow[f]));
    if (iEdited) { out.push(mineRow); stats.keptOverDelete += 1; }          // rule 4
    else stats.deleted += 1;
  });

  // Keep each equipment's rows together: a row added on one device must not
  // land at the bottom of the plan, away from its own equipment.
  return { items: regroup(out), stats };
}

function empty(note) {
  return { fromMine: 0, fromTheirs: 0, conflicts: 0, addedRemote: 0, addedLocal: 0, deleted: 0, keptOverDelete: 0, note };
}

/** Stable group-by: first appearance of a group_id fixes that group's place. */
export function regroup(items) {
  const order = [];
  const groups = new Map();
  (items || []).forEach((item) => {
    const g = item?.group_id || '__ungrouped';
    if (!groups.has(g)) { groups.set(g, []); order.push(g); }
    groups.get(g).push(item);
  });
  return order.flatMap((g) => groups.get(g));
}

/** True when two plans would write the same thing — used to skip pointless writes. */
export function samePlan(a, b) {
  const fa = Array.isArray(a) ? a : [];
  const fb = Array.isArray(b) ? b : [];
  if (fa.length !== fb.length) return false;
  for (let i = 0; i < fa.length; i += 1) {
    for (const f of FIELDS) if (!same(fa[i]?.[f], fb[i]?.[f])) return false;
    const pa = (fa[i]?.photos || []).filter(Boolean).length;
    const pb = (fb[i]?.photos || []).filter(Boolean).length;
    if (pa !== pb) return false;
  }
  return true;
}
