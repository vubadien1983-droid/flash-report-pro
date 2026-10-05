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
import { isVideoFile, MAX_VIDEO_BYTES } from './videoMedia';

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
function rememberBlob(scope, id, key, blob, meta) {
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
}
function forgetBlob(scope, id, key) { blobCache.delete(cacheKey(scope, id, key)); }

/** base64 → bytes, one chunk at a time (each chunk is a whole number of quads). */
function decodeBase64(b64) {
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** Read a stored file back as a Blob, or null when it is not fully there. */
export async function getAttachmentBlob(scope, id, key) {
  if (!isFirebaseConfigured) return null;
  const hit = blobCache.get(cacheKey(scope, id, key));
  if (hit) return { blob: hit.blob.type === (hit.meta.mime || hit.blob.type) ? hit.blob : new Blob([hit.blob], { type: hit.meta.mime }), meta: hit.meta };

  const metaSnap = await withTimeout(
    getDoc(docRef(scope, id, key)), READ_TIMEOUT_MS, 'Loading file'
  );
  if (!metaSnap.exists()) return null;
  const meta = metaSnap.data();
  const total = meta.chunks || 1;

  // Decoded chunk by chunk: one 30 MB base64 string (a video) is a needless
  // memory spike and a long main-thread stall. CHUNK_CHARS is a multiple of
  // 4, so every chunk but the last decodes on its own. Any older file whose
  // chunks were cut differently falls back to decoding the joined string.
  const pieces = [];
  let carry = '';
  try {
  for (let i = 0; i < total; i++) {
    const snap = await withTimeout(
      getDoc(docRef(scope, id, `${key}__c${i}`)),
      READ_TIMEOUT_MS,
      `Loading file part ${i + 1} of ${total}`
    );
    // A missing chunk means the file is incomplete. Returning a truncated
    // blob would hand the user a corrupt document that looks fine.
    if (!snap.exists()) return null;
    const d = carry + (snap.data().d || '');
    const whole = i === total - 1 ? d.length : d.length - (d.length % 4);
    if (whole) pieces.push(decodeBase64(d.slice(0, whole)));
    carry = d.slice(whole);
    if (total > 3) emitProgress({ reportId: id, done: i + 1, total, phase: 'file-read' });
    await yieldToBrowser();
  }
  } finally {
    // Always clear the banner, also when a part was missing or timed out.
    if (total > 3) emitProgress({ reportId: id, done: total, total, phase: 'done' });
  }

  const blob = new Blob(pieces, { type: meta.mime || 'application/octet-stream' });
  rememberBlob(scope, id, key, blob, meta);
  return { blob, meta };
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
  const got = await getAttachmentBlob('report', reportId, key);
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
