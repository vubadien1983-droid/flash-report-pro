/**
 * File attachments — v2.5
 *
 * A photo slot can hold a FILE instead of an image: a PDF datasheet, a
 * drawing, a spreadsheet. The cell then shows the file name, clicking it
 * opens the file, and an exported report turns the cell into a link that
 * opens the same file with no sign-in.
 *
 * WHY NOT GOOGLE DRIVE
 * --------------------
 * Drive was the obvious idea and it is the wrong one here. It needs an OAuth
 * grant against the user's account plus a stored token, and "anyone with the
 * link" sharing is exactly what a corporate Workspace policy tends to block —
 * which would break the one hard requirement, that a recipient opens the file
 * without logging in. Firestore is already public-read for shared reports, so
 * the file rides the same path the photos do and inherits the same guarantee.
 *
 * HOW IT IS STORED
 * ----------------
 * Firebase Storage needs the paid Blaze plan, and a Firestore document caps
 * at 1 MiB. So a file becomes:
 *
 *   <collection>/{key}         → { filename, mime, size, chunks, updated_at }
 *   <collection>/{key}__c0..n  → { d: <base64 slice> }
 *
 * where <collection> is `reports/{id}/files` for the private copy and
 * `shared_reports/{shareId}/files` for the public one. Reassembly is just
 * concatenating the slices in order.
 *
 * Chunks are written BEFORE the metadata document, and the metadata document
 * is what a reader trusts. A half-written file therefore reads as "not there"
 * rather than as a truncated file — the same rule that fixed BUG-012 for
 * photos: never publish a pointer to bytes that may not exist.
 */

import {
  isFirebaseConfigured,
  reportFileDoc, sharedFileDoc,
  getDoc, setDoc, deleteDoc,
} from './firebase';
import { withTimeout, yieldToBrowser } from './imageCompression';
import { isBlockedUpload, fileExtension } from './previewKind';
import { isVideoFile, isVideoEntry, MAX_VIDEO_BYTES } from './videoMedia';

/** Base64 characters per chunk document. Well under the 1 MiB ceiling. */
const CHUNK_CHARS = 700_000;

/** Refuse anything larger. 10 MB of base64 is ~14 MB across ~20 documents. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const READ_TIMEOUT_MS = 30_000;
const WRITE_TIMEOUT_MS = 45_000;

function emitProgress(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('flashreport:upload-progress', { detail }));
}

function docRef(scope, id, key) {
  return scope === 'shared' ? sharedFileDoc(id, key) : reportFileDoc(id, key);
}

export function formatBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Pick a small label for the file type, used on the cell and in exports. */
export function fileKindLabel(filenameOrMime = '') {
  const s = String(filenameOrMime).toLowerCase();
  if (s.includes('pdf')) return 'PDF';
  if (/^video\/|\.(mp4|m4v|mov|webm|mkv|avi|3gp|ogv)$/.test(s)) return 'VID';
  if (/\.(xlsx|xls|csv)$|sheet|excel/.test(s)) return 'XLS';
  if (/\.(docx|doc)$|word/.test(s)) return 'DOC';
  if (/\.(pptx|ppt)$|presentation/.test(s)) return 'PPT';
  if (/\.(dwg|dxf)$/.test(s)) return 'CAD';
  if (/\.(zip|rar|7z)$/.test(s)) return 'ZIP';
  if (/^image\/|\.(png|jpe?g|gif|webp|bmp)$/.test(s)) return 'IMG';
  const ext = s.split('.').pop();
  return ext && ext.length <= 4 ? ext.toUpperCase() : 'FILE';
}

async function fileToBase64(file) {
  const dataUrl = await withTimeout(
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result);
      r.onerror = () => reject(new Error('Could not read the file'));
      r.readAsDataURL(file);
    }),
    READ_TIMEOUT_MS,
    'Reading file'
  );
  const comma = dataUrl.indexOf(',');
  return dataUrl.slice(comma + 1);
}

/**
 * Store a file and return the descriptor to keep on the photo slot.
 * The descriptor carries no bytes, so the report document stays tiny.
 */
export async function putAttachment(scope, id, key, file) {
  if (!isFirebaseConfigured) {
    throw new Error('Cloud storage is not configured, so files cannot be attached.');
  }
  // A report attachment is opened by other people from a public link, so a
  // file that RUNS when opened is refused outright (v3.21.0). This is the one
  // upload chokepoint for every report type and every share link.
  if (isBlockedUpload(file.name)) {
    throw new Error(
      `"${file.name}" is a program file (.${fileExtension(file.name)}) and cannot be attached. Zip it or attach a PDF instead.`
    );
  }
  // A video has its own, larger ceiling — it has already been compressed to
  // fit it at ingest (services/videoMedia.js prepareVideoForUpload).
  const limit = isVideoFile(file) ? MAX_VIDEO_BYTES : MAX_FILE_BYTES;
  if (file.size > limit) {
    throw new Error(
      `"${file.name}" is ${formatBytes(file.size)}. The limit is ${formatBytes(limit)}.`
    );
  }

  const b64 = await fileToBase64(file);
  const total = Math.max(1, Math.ceil(b64.length / CHUNK_CHARS));

  emitProgress({ reportId: id, done: 0, total, phase: 'file' });

  // Chunks first, metadata last — see the note at the top of this file.
  try {
  for (let i = 0; i < total; i++) {
    const slice = b64.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS);
    await withTimeout(
      setDoc(docRef(scope, id, `${key}__c${i}`), { d: slice }),
      WRITE_TIMEOUT_MS,
      `Uploading file part ${i + 1} of ${total}`
    );
    emitProgress({ reportId: id, done: i + 1, total, phase: 'file' });
    await yieldToBrowser();
  }
  } catch (err) {
    // Clear the progress banner, then let the caller report the failure.
    emitProgress({ reportId: id, done: total, total, phase: 'done' });
    throw err;
  }

  const meta = {
    filename: file.name || 'attachment',
    mime: file.type || 'application/octet-stream',
    size: file.size,
    chunks: total,
    updated_at: new Date().toISOString(),
  };
  await withTimeout(
    setDoc(docRef(scope, id, key), meta),
    WRITE_TIMEOUT_MS,
    'Saving file details'
  );

  emitProgress({ reportId: id, done: total, total, phase: 'done' });

  // The uploader can play / open it straight away with no download.
  rememberBlob(scope, id, key, file, meta);

  return { ...meta, kind: 'file', file_ref: key };
}

/**
 * Blobs this page has already read or written, by scope/id/key, newest last.
 * A 20 MB video is ~30 document reads; watching it twice must not cost 60.
 * Bounded by total bytes so a long session cannot hoard memory.
 */
const BLOB_CACHE_BYTES = 120 * 1024 * 1024;
const blobCache = new Map();
function cacheKey(scope, id, key) { return `${scope}|${id}|${key}`; }
function rememberBlob(scope, id, key, blob, meta, { persist = true } = {}) {
  if (!blob) return;
  const k = cacheKey(scope, id, key);
  blobCache.delete(k);
  blobCache.set(k, { blob, meta });
  let total = 0;
  for (const v of blobCache.values()) total += v.blob.size || 0;
  for (const [ck, v] of blobCache) {
    if (total <= BLOB_CACHE_BYTES || blobCache.size <= 1) break;
    total -= v.blob.size || 0;
    blobCache.delete(ck);
  }
  if (persist) diskPut(scope, id, key, blob, meta);
}
function forgetBlob(scope, id, key) {
  blobCache.delete(cacheKey(scope, id, key));
  diskDelete(scope, id, key);
}

/* ── Disk cache (v3.33.1) ──────────────────────────────────────────────────
 * The browser's Cache Storage keeps every attachment this device has opened
 * or uploaded, across reloads, so a video is downloaded from Firestore ONCE
 * per device and opens instantly ever after — like a photo. Bounded by
 * DISK_CACHE_BYTES (oldest dropped first). Any failure (private mode, no
 * Cache API, quota) silently falls back to the network: the cache is an
 * accelerator, never a source of truth. */
const DISK_CACHE = 'fr-attachments-v1';
const DISK_CACHE_BYTES = 300 * 1024 * 1024;
const hasDisk = () => typeof caches !== 'undefined' && typeof window !== 'undefined' && window.isSecureContext !== false;
const diskUrl = (scope, id, key) => `https://attachments.local/${encodeURIComponent(scope)}/${encodeURIComponent(id)}/${encodeURIComponent(key)}`;

async function diskGet(scope, id, key) {
  if (!hasDisk()) return null;
  try {
    const c = await caches.open(DISK_CACHE);
    const res = await c.match(diskUrl(scope, id, key));
    if (!res) return null;
    const meta = JSON.parse(decodeURIComponent(res.headers.get('x-fr-meta') || '%7B%7D'));
    const blob = await res.blob();
    if (!blob.size) return null;
    return { blob: blob.type ? blob : new Blob([blob], { type: meta.mime || '' }), meta };
  } catch { return null; }
}
async function diskPut(scope, id, key, blob, meta) {
  if (!hasDisk() || !blob || blob.size > 60 * 1024 * 1024) return;
  try {
    const c = await caches.open(DISK_CACHE);
    const headers = {
      'content-type': meta?.mime || blob.type || 'application/octet-stream',
      'x-fr-meta': encodeURIComponent(JSON.stringify({
        filename: meta?.filename, mime: meta?.mime, size: meta?.size ?? blob.size,
        chunks: meta?.chunks, updated_at: meta?.updated_at,
      })),
      'x-fr-bytes': String(blob.size),
    };
    await c.put(diskUrl(scope, id, key), new Response(blob, { headers }));
    // Trim, oldest first (Cache Storage keeps insertion order).
    const reqs = await c.keys();
    let total = 0;
    const sizes = [];
    for (const r of reqs) {
      const m = await c.match(r);
      const n = Number(m?.headers.get('x-fr-bytes')) || 0;
      sizes.push([r, n]);
      total += n;
    }
    for (const [r, n] of sizes) {
      if (total <= DISK_CACHE_BYTES) break;
      await c.delete(r);
      total -= n;
    }
  } catch { /* quota / private mode: network only */ }
}
async function diskDelete(scope, id, key) {
  if (!hasDisk()) return;
  try { const c = await caches.open(DISK_CACHE); await c.delete(diskUrl(scope, id, key)); } catch { /* ignore */ }
}

/**
 * A cached copy is only good if it is the SAME upload the row points at: a
 * Flash Report slot that is replaced re-uses its key. The row's descriptor
 * carries the stored meta (putAttachment returns it), so compare.
 */
function sameUpload(meta, expect) {
  if (!expect) return true;
  if (expect.updated_at && meta?.updated_at) return expect.updated_at === meta.updated_at;
  if (expect.size && meta?.size) return Number(expect.size) === Number(meta.size)
    && (!expect.filename || !meta.filename || expect.filename === meta.filename);
  return true;
}

/** base64 → bytes, one chunk at a time (each chunk is a whole number of quads). */
function decodeBase64(b64) {
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** How many parts are downloaded at once. Sequential reads were the delay. */
const PARALLEL_PARTS = 6;

/** Load progress for the "Opening…" overlay, on every surface. */
function emitLoading(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('flashreport:attachment-loading', { detail }));
}

/** One download per file at a time: a click during a prefetch joins it. */
const inFlight = new Map();

function typed(hit) {
  const mime = hit.meta?.mime;
  return { blob: !mime || hit.blob.type === mime ? hit.blob : new Blob([hit.blob], { type: mime }), meta: hit.meta };
}

/**
 * Read a stored file back as a Blob, or null when it is not fully there.
 *
 *   opts.expect     the row's descriptor — a cached copy must match it
 *   opts.background true for a prefetch: no "Opening…" overlay
 *
 * Order: memory → this device's disk cache → Firestore (all parts in
 * parallel). v3.33.1: parts used to be read one after another, which made a
 * 2-3 MB video take several seconds on a site connection with only an
 * "Opening…" toast on screen — it looked failed.
 */
export async function getAttachmentBlob(scope, id, key, opts = {}) {
  if (!isFirebaseConfigured) return null;
  const { expect = null, background = false } = opts;
  const ck = cacheKey(scope, id, key);

  const hit = blobCache.get(ck);
  if (hit && sameUpload(hit.meta, expect)) return typed(hit);

  const loadId = `${ck}|${Date.now()}`;
  const label = expect?.filename || '';
  let shown = false;
  const show = (detail) => {
    if (background) return;
    shown = true;
    emitLoading({ id: loadId, filename: label, ...detail });
  };

  // Joining a download already running (a prefetch, a double click).
  if (inFlight.has(ck)) {
    if (!background) show({ phase: 'start', done: 0, total: 0 });
    try {
      const got = await inFlight.get(ck);
      if (got && sameUpload(got.meta, expect)) return typed(got);
    } finally {
      if (shown) emitLoading({ id: loadId, phase: 'end' });
    }
  }

  const run = (async () => {
    const disk = await diskGet(scope, id, key);
    if (disk && expect && sameUpload(disk.meta, expect)) {
      rememberBlob(scope, id, key, disk.blob, disk.meta, { persist: false });
      return disk;
    }

    if (!background) show({ phase: 'start', done: 0, total: 0 });
    const metaSnap = await withTimeout(
      getDoc(docRef(scope, id, key)), READ_TIMEOUT_MS, 'Loading file'
    );
    if (!metaSnap.exists()) return null;
    const meta = metaSnap.data();

    // Without a descriptor to compare with, the disk copy is trusted only
    // when it matches the stored meta — still saves every part read.
    if (disk && sameUpload(disk.meta, meta)) {
      rememberBlob(scope, id, key, disk.blob, disk.meta, { persist: false });
      return disk;
    }

    const total = meta.chunks || 1;
    if (!background) show({ phase: 'progress', done: 0, total, filename: meta.filename || label });

    const parts = new Array(total);
    let next = 0;
    let done = 0;
    let missing = false;
    const worker = async () => {
      while (next < total && !missing) {
        const i = next++;
        const snap = await withTimeout(
          getDoc(docRef(scope, id, `${key}__c${i}`)),
          READ_TIMEOUT_MS,
          `Loading file part ${i + 1} of ${total}`
        );
        // A missing part means the file is incomplete. Returning a truncated
        // blob would hand the user a corrupt document that looks fine.
        if (!snap.exists()) { missing = true; return; }
        parts[i] = snap.data().d || '';
        done++;
        if (!background) show({ phase: 'progress', done, total, filename: meta.filename || label });
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL_PARTS, total) }, worker));
    if (missing) return null;

    // Decoded part by part: one 30 MB base64 string is a needless memory
    // spike. Parts are whole quads except possibly the last; a carry covers
    // any older file cut differently.
    const pieces = [];
    let carry = '';
    for (let i = 0; i < total; i++) {
      const d = carry + parts[i];
      const whole = i === total - 1 ? d.length : d.length - (d.length % 4);
      if (whole) pieces.push(decodeBase64(d.slice(0, whole)));
      carry = d.slice(whole);
      parts[i] = null;
      if (total > 4 && i % 4 === 3) await yieldToBrowser();
    }

    const blob = new Blob(pieces, { type: meta.mime || 'application/octet-stream' });
    rememberBlob(scope, id, key, blob, meta);
    return { blob, meta };
  })();

  inFlight.set(ck, run);
  try {
    const got = await run;
    return got ? typed(got) : null;
  } finally {
    inFlight.delete(ck);
    if (shown) emitLoading({ id: loadId, phase: 'end' });
  }
}

/** Is this file already on this device (memory)? Used to skip prefetches. */
export function hasAttachmentInMemory(scope, id, key) {
  return blobCache.has(cacheKey(scope, id, key));
}

/* ── Prefetch (v3.33.1) ────────────────────────────────────────────────────
 * Videos are fetched in the background as soon as a report is on screen, one
 * at a time, so that by the time somebody clicks one it is already on this
 * device and plays at once — the way a photo does. Each device downloads a
 * given video once (the disk cache keeps it), so the Firestore reads this
 * costs are bounded. A phone on mobile data, Data Saver or a 2G link
 * prefetches far less / nothing; hovering or touching a tile still warms
 * that one video. */
const refSources = new Map();     // file_ref → [[scope, id], …] in lookup order
const prefetched = new Set();
let prefetchQueue = [];
let prefetchRunning = false;
let prefetchedBytes = 0;

function prefetchBudget() {
  const c = typeof navigator !== 'undefined' ? navigator.connection : null;
  if (c?.saveData) return 0;
  if (c && /(^|-)2g$/.test(String(c.effectiveType || ''))) return 0;
  if (c?.type === 'cellular') return 25 * 1024 * 1024;
  return 150 * 1024 * 1024;
}

async function fetchFromSources(p, sources, background) {
  for (const [scope, id] of sources) {
    if (!scope || !id) continue;
    try {
      const got = await getAttachmentBlob(scope, id, p.file_ref, { expect: p, background });
      if (got) return got;
    } catch { /* try the next copy */ }
  }
  return null;
}

async function drainPrefetch() {
  if (prefetchRunning) return;
  prefetchRunning = true;
  try {
    // Let the report itself finish drawing first.
    await new Promise((r) => setTimeout(r, 1500));
    while (prefetchQueue.length) {
      const { p, sources } = prefetchQueue.shift();
      if (prefetchedBytes + (Number(p.size) || 0) > prefetchBudget()) continue;
      prefetched.add(p.file_ref);
      const got = await fetchFromSources(p, sources, true);
      if (got) prefetchedBytes += got.blob.size || 0;
      await new Promise((r) => setTimeout(r, 150));
    }
  } finally {
    prefetchRunning = false;
  }
}

/**
 * Register the attachments of the report on screen and queue its videos.
 *   sources  [[scope, id], …] — where this surface looks, in order
 *   items    the report's rows (each with photos[])
 */
export function prefetchReportVideos(sources, items) {
  if (!isFirebaseConfigured || typeof window === 'undefined') return;
  const srcs = (sources || []).filter((s) => s && s[0] && s[1]);
  if (!srcs.length) return;
  const queue = [];
  for (const item of items || []) {
    for (const p of item?.photos || []) {
      if (!p || !p.file_ref) continue;
      refSources.set(p.file_ref, srcs);
      if (isVideoEntry(p) && !prefetched.has(p.file_ref)) queue.push({ p, sources: srcs });
    }
  }
  if (!queue.length) return;
  const queued = new Set(prefetchQueue.map((q) => q.p.file_ref));
  for (const q of queue) if (!queued.has(q.p.file_ref)) prefetchQueue.push(q);
  drainPrefetch();
}

/** Hover / touch on one tile: fetch that file now, ahead of the click. */
export function warmAttachment(p) {
  if (!p?.file_ref || prefetched.has(p.file_ref)) return;
  const sources = refSources.get(p.file_ref);
  if (!sources) return;
  prefetched.add(p.file_ref);
  fetchFromSources(p, sources, true).catch(() => {});
}

export async function deleteAttachment(scope, id, key, chunks = 1) {
  if (!isFirebaseConfigured) return;
  forgetBlob(scope, id, key);
  try {
    await deleteDoc(docRef(scope, id, key));
    for (let i = 0; i < chunks; i++) {
      await deleteDoc(docRef(scope, id, `${key}__c${i}`)).catch(() => {});
    }
  } catch (e) {
    console.warn('Attachment cleanup:', e.message);
  }
}

/**
 * Copy an attachment from a report into its published share, so the public
 * link resolves without touching the private collection.
 */
export async function copyAttachmentToShare(reportId, shareId, key) {
  const got = await getAttachmentBlob('report', reportId, key, { background: true });
  if (!got) return false;

  const b64 = await fileToBase64(new File([got.blob], got.meta.filename, { type: got.meta.mime }));
  const total = Math.max(1, Math.ceil(b64.length / CHUNK_CHARS));

  for (let i = 0; i < total; i++) {
    await withTimeout(
      setDoc(sharedFileDoc(shareId, `${key}__c${i}`), { d: b64.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS) }),
      WRITE_TIMEOUT_MS,
      `Publishing file part ${i + 1} of ${total}`
    );
    await yieldToBrowser();
  }
  await withTimeout(
    setDoc(sharedFileDoc(shareId, key), { ...got.meta, chunks: total }),
    WRITE_TIMEOUT_MS,
    'Publishing file details'
  );
  return true;
}

/** Public URL that opens the attachment with no sign-in. */
export function attachmentUrl(shareId, key) {
  // No window on the server (weekly report e-mail, v3.28.0): the public app URL.
  const base = typeof window === 'undefined'
    ? 'https://flash-report-pro.vercel.app/'
    : window.location.origin + window.location.pathname;
  return `${base}#/file/${shareId}/${key}`;
}

/** Open a Blob in a new tab, falling back to a download for exotic types. */
/**
 * Types a browser will actually DISPLAY. Everything else is downloaded.
 *
 * Opening a blob of any other type in a tab is what produced "This file type
 * cannot be opened." — Chrome cannot render a .docx, a .zip or an unknown
 * application/octet-stream, so it shows an error page instead of the file the
 * user asked for (BUG-034). A download always works.
 */
const INLINE_TYPES = /^(application\/pdf|image\/|text\/plain|text\/csv|audio\/|video\/)/i;

const EXT_BY_TYPE = {
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'image/jpeg': 'jpg', 'image/png': 'png', 'text/plain': 'txt', 'text/csv': 'csv',
};

/** A download needs a name with an extension, or Windows cannot open it later. */
export function downloadName(filename, type) {
  const name = String(filename || '').trim() || 'attachment';
  if (/\.[A-Za-z0-9]{1,8}$/.test(name)) return name;
  const ext = EXT_BY_TYPE[String(type || '').toLowerCase()];
  return ext ? `${name}.${ext}` : name;
}

export function canOpenInline(type) {
  return INLINE_TYPES.test(String(type || ''));
}

function saveBlob(url, filename, type) {
  const a = document.createElement('a');
  a.href = url;
  a.download = downloadName(filename, type);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Open an attachment: in a tab when the browser can render it, as a download
 * otherwise — and as a download too when a popup blocker eats the tab.
 */
export function openBlob(blob, filename, { forceDownload = false } = {}) {
  const type = blob?.type || '';
  const url = URL.createObjectURL(blob);

  if (forceDownload || !canOpenInline(type)) {
    saveBlob(url, filename, type);
  } else {
    const win = window.open(url, '_blank', 'noopener');
    if (!win) saveBlob(url, filename, type);
  }

  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}


/** Every attachment descriptor in a report, with its slot coordinates. */
export function collectAttachments(report) {
  const out = [];
  (report?.items || []).forEach((item, itemIdx) => {
    (item.photos || []).forEach((p, slotIdx) => {
      if (p && p.kind === 'file' && p.file_ref) {
        out.push({ itemIdx, slotIdx, key: p.file_ref, descriptor: p });
      }
    });
  });
  return out;
}
