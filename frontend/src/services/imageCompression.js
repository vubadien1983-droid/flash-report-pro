/**
 * Image ingest compression — v2.4
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Photos used to enter the app straight from `FileReader.readAsDataURL(file)`
 * with no resizing and no recompression at all. A clipboard paste is a PNG and
 * a phone camera frame is a 3-8 MB JPEG, and base64 adds another third on top,
 * so a two-row report with four photos each could hold 30-80 MB of string data
 * in React state and in IndexedDB.
 *
 * Everything downstream then inherited that: the sync path tried to rescue
 * every oversized image with up to five sequential `canvas.toDataURL()` passes
 * ON THE MAIN THREAD, the share path did the same work a second time, and the
 * browser stopped painting. The spinner was not waiting on the network — the
 * main thread was blocked, which is why the app could not even be closed.
 *
 * The fix is to compress ONCE, at the moment an image enters the app, so that
 * every later stage handles a few hundred kilobytes instead of megabytes.
 *
 * RULES THIS FILE ENFORCES
 * ------------------------
 * - Decoding happens off the main thread via `createImageBitmap` +
 *   `OffscreenCanvas` wherever the browser supports it. The `<img>` + `<canvas>`
 *   path is only a fallback for older mobile Safari.
 * - Every decode is bounded by a timeout. `img.onload` firing is NOT guaranteed
 *   (a truncated data URL never fires either handler), and an unbounded promise
 *   here is exactly what freezes a sync.
 * - Callers that loop over several images must `await yieldToBrowser()` between
 *   them so the UI can paint and stay responsive.
 */

/** Longest edge kept for a stored photo. Plenty for an A4 report cell. */
const TARGET_MAX_DIM = 1600;

/** Aim for this base64 length. ~300 KB of string ≈ 220 KB of JPEG. */
const TARGET_MAX_BYTES = 400_000;

/** Firestore caps a document at 1 MiB; this leaves headroom for the fields. */
export const HARD_MAX_BYTES = 900_000;

/** A decode that has not finished by now is never going to. */
const DECODE_TIMEOUT_MS = 20_000;

/** Below this an image is already small enough to leave alone. */
const ALREADY_SMALL_BYTES = 250_000;

/**
 * Reject rather than hang. Firestore writes and image decodes can both stall
 * indefinitely, and an unsettled promise upstream is what the user experiences
 * as a spinner that never stops.
 */
export function withTimeout(promise, ms, label = 'operation') {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
        ms
      );
    }),
  ]);
}

/**
 * Hand the main thread back to the browser so it can paint a progress update.
 * `setTimeout(0)` yields a full task, which `await Promise.resolve()` does not.
 */
export function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function byteLength(dataUrl) {
  return typeof dataUrl === 'string' ? dataUrl.length : 0;
}

/**
 * Cheap content fingerprint used to skip re-uploading a photo that has not
 * changed. Not cryptographic and does not need to be: it only has to change
 * when the bytes change. Sampling keeps it O(1) instead of O(size), which
 * matters when it runs for every photo on every save.
 */
export function photoFingerprint(dataUrl) {
  if (!dataUrl) return '';
  const len = dataUrl.length;
  const sample =
    dataUrl.slice(0, 1024) +
    dataUrl.slice(Math.max(0, (len >> 1) - 512), (len >> 1) + 512) +
    dataUrl.slice(-1024);

  // FNV-1a, 32-bit.
  let h = 0x811c9dc5;
  for (let i = 0; i < sample.length; i++) {
    h ^= sample.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${len.toString(36)}_${(h >>> 0).toString(36)}`;
}

function targetSize(w, h, maxDim) {
  if (w <= maxDim && h <= maxDim) return { w, h };
  if (w > h) return { w: maxDim, h: Math.max(1, Math.round((h * maxDim) / w)) };
  return { w: Math.max(1, Math.round((w * maxDim) / h)), h: maxDim };
}

async function blobToDataUrl(blob) {
  return withTimeout(
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('FileReader failed'));
      reader.readAsDataURL(blob);
    }),
    DECODE_TIMEOUT_MS,
    'image read'
  );
}

/** Off-main-thread path. Returns null when the browser lacks the APIs. */
async function encodeWithOffscreen(source, maxDim, quality) {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') {
    return null;
  }
  const bitmap = await withTimeout(createImageBitmap(source), DECODE_TIMEOUT_MS, 'image decode');
  try {
    const { w, h } = targetSize(bitmap.width, bitmap.height, maxDim);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    // Flatten transparency onto white — a pasted PNG screenshot with an alpha
    // channel would otherwise turn black once encoded as JPEG.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await withTimeout(
      canvas.convertToBlob({ type: 'image/jpeg', quality }),
      DECODE_TIMEOUT_MS,
      'image encode'
    );
    return await blobToDataUrl(blob);
  } finally {
    if (typeof bitmap.close === 'function') bitmap.close();
  }
}

/** Fallback for browsers without OffscreenCanvas (older iOS Safari). */
async function encodeWithImageElement(dataUrl, maxDim, quality) {
  const img = await withTimeout(
    new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image decode failed'));
      el.src = dataUrl;
    }),
    DECODE_TIMEOUT_MS,
    'image decode'
  );

  const { w, h } = targetSize(img.naturalWidth || img.width, img.naturalHeight || img.height, maxDim);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

async function encode(source, dataUrlForFallback, maxDim, quality) {
  const off = await encodeWithOffscreen(source, maxDim, quality);
  if (off) return off;
  return encodeWithImageElement(dataUrlForFallback, maxDim, quality);
}

/**
 * Compress a Blob/File into a data URL that fits `maxBytes`.
 *
 * Steps down dimension and quality together, and — unlike the old
 * `_shrinkToFit` — yields between attempts so the browser can still paint.
 * Returns the original data URL if compression fails for any reason: a photo
 * that is merely too big is far better than no photo (BUG-012).
 */
export async function compressImageBlob(blob, { maxBytes = TARGET_MAX_BYTES } = {}) {
  const original = await blobToDataUrl(blob);
  if (byteLength(original) <= ALREADY_SMALL_BYTES) return original;

  const steps = [
    [TARGET_MAX_DIM, 0.8],
    [1400, 0.72],
    [1200, 0.65],
    [1000, 0.55],
    [800, 0.45],
  ];

  let best = null;
  for (const [maxDim, quality] of steps) {
    try {
      const out = await encode(blob, original, maxDim, quality);
      if (out) {
        best = out;
        if (out.length <= maxBytes) return out;
      }
    } catch (e) {
      console.warn('[compress] step failed:', e.message);
      break;
    }
    await yieldToBrowser();
  }

  // Nothing hit the target. Return the smallest result we produced, or the
  // original — never nothing.
  if (best && best.length < byteLength(original)) return best;
  return original;
}

/** Same as compressImageBlob, for an image that is already a data URL. */
export async function compressDataUrl(dataUrl, opts = {}) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return dataUrl;
  if (dataUrl.length <= (opts.maxBytes || TARGET_MAX_BYTES)) return dataUrl;
  try {
    const blob = await withTimeout(fetch(dataUrl).then((r) => r.blob()), DECODE_TIMEOUT_MS, 'image load');
    return await compressImageBlob(blob, opts);
  } catch (e) {
    console.warn('[compress] data URL compression failed:', e.message);
    return dataUrl;
  }
}

/**
 * Normalize a File/Blob picked from the camera, the gallery or the clipboard
 * into a compact JPEG data URL. This is THE entry point for every photo — if a
 * new ingest path is added, it must call this, or the whole freeze comes back.
 */
export async function compressForStorage(fileOrBlob) {
  return compressImageBlob(fileOrBlob, { maxBytes: TARGET_MAX_BYTES });
}

/**
 * Bring an existing report's photos down to size.
 *
 * Reports created before ingest compression existed hold multi-megabyte
 * images. Left alone they would be recompressed on every sync and every share
 * forever. This runs once when such a report is opened, rewrites the oversized
 * photos in place and lets the caller save the result, after which the report
 * is permanently light.
 *
 * Yields between images: this runs while the user is looking at the report and
 * must not stutter the UI.
 */
export async function compactReportPhotos(report, { onProgress } = {}) {
  if (!report?.items?.length) return { report, changed: false };

  const oversized = [];
  report.items.forEach((item, itemIdx) => {
    (item.photos || []).forEach((p, pIdx) => {
      if (p?.url?.startsWith('data:') && p.url.length > ALREADY_SMALL_BYTES) {
        oversized.push({ itemIdx, pIdx });
      }
    });
  });

  if (oversized.length === 0) return { report, changed: false };

  const items = report.items.map((item) => ({
    ...item,
    photos: (item.photos || []).map((p) => (p ? { ...p } : p)),
  }));

  let done = 0;
  let changed = false;

  for (const { itemIdx, pIdx } of oversized) {
    const photo = items[itemIdx].photos[pIdx];
    try {
      const compact = await compressDataUrl(photo.url, { maxBytes: TARGET_MAX_BYTES });
      if (compact && compact.length < photo.url.length) {
        photo.url = compact;
        changed = true;
      }
    } catch (e) {
      // Keep the original. An oversized photo is still a photo (BUG-012).
      console.warn('[compact] skipped one photo:', e.message);
    }
    done++;
    if (onProgress) onProgress(done, oversized.length);
    await yieldToBrowser();
  }

  return { report: { ...report, items }, changed };
}
