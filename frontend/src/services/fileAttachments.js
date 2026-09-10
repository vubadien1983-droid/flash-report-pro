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
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `"${file.name}" is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_FILE_BYTES)}.`
    );
  }

  const b64 = await fileToBase64(file);
  const total = Math.max(1, Math.ceil(b64.length / CHUNK_CHARS));

  emitProgress({ reportId: id, done: 0, total, phase: 'file' });

  // Chunks first, metadata last — see the note at the top of this file.
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

  return { ...meta, kind: 'file', file_ref: key };
}

/** Read a stored file back as a Blob, or null when it is not fully there. */
export async function getAttachmentBlob(scope, id, key) {
  if (!isFirebaseConfigured) return null;

  const metaSnap = await withTimeout(
    getDoc(docRef(scope, id, key)), READ_TIMEOUT_MS, 'Loading file'
  );
  if (!metaSnap.exists()) return null;
  const meta = metaSnap.data();
  const total = meta.chunks || 1;

  let b64 = '';
  for (let i = 0; i < total; i++) {
    const snap = await withTimeout(
      getDoc(docRef(scope, id, `${key}__c${i}`)),
      READ_TIMEOUT_MS,
      `Loading file part ${i + 1} of ${total}`
    );
    // A missing chunk means the file is incomplete. Returning a truncated
    // blob would hand the user a corrupt document that looks fine.
    if (!snap.exists()) return null;
    b64 += snap.data().d || '';
    await yieldToBrowser();
  }

  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return { blob: new Blob([arr], { type: meta.mime || 'application/octet-stream' }), meta };
}

export async function deleteAttachment(scope, id, key, chunks = 1) {
  if (!isFirebaseConfigured) return;
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
  const base = window.location.origin + window.location.pathname;
  return `${base}#/file/${shareId}/${key}`;
}

/** Open a Blob in a new tab, falling back to a download for exotic types. */
export function openBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'attachment';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
