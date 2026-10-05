/**
 * Video in the photo / file cells — v3.33.0
 *
 * A video rides the SAME storage as every other attachment (fileAttachments.js
 * chunked Firestore documents, BUG-005 / Spark plan: no Firebase Storage), so a
 * video slot is an ordinary file descriptor `{kind:'file', mime:'video/…'}` and
 * every surface that already knows how to sync, publish, export and delete an
 * attachment handles a video with no new path.
 *
 * What is NEW is the ingest rule, which is BUG-013's rule applied to video:
 *
 *   COMPRESS AT INGEST, ONCE. A phone records ~15-40 MB per MINUTE, and every
 *   byte here is a Firestore document read by every viewer (50K reads/day, 1 GB
 *   total, shared with five other apps). A video is therefore re-encoded in the
 *   browser to a size budget BEFORE it is stored — never in the sync or export
 *   path. In-app recording records straight at the budget bitrate, so nothing
 *   has to be re-encoded afterwards.
 *
 * The pure helpers at the top run in plain Node (unit-tested). Everything that
 * touches the DOM is below the marked line and is only called from components.
 */

/** Hard ceiling for a STORED video (after compression). ~38 chunk documents. */
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

/** A file at or under this size is stored as it is — already small enough. */
export const KEEP_ORIGINAL_BYTES = 8 * 1024 * 1024;

/** What a re-encode aims at, leaving headroom under MAX_VIDEO_BYTES. */
export const TARGET_VIDEO_BYTES = 20 * 1024 * 1024;

/**
 * In-app recording: bitrate and the auto-stop. 1 Mbps ≈ 8 MB / minute, so a
 * full 150 s clip is ~20 MB — under MAX_VIDEO_BYTES with room for an encoder
 * that overshoots its target (they do). A clip that still comes out too big
 * is re-encoded by prepareVideoForUpload rather than refused.
 */
export const RECORD_VIDEO_BPS = 1_000_000;
export const RECORD_AUDIO_BPS = 64_000;
export const MAX_RECORD_SECONDS = 150;

/** Re-encode: never above this, never below the floor (unwatchable below it). */
export const MAX_VIDEO_BPS = 1_500_000;
export const MIN_VIDEO_BPS = 280_000;
export const AUDIO_BPS = 64_000;

/** Longest edge of a re-encoded frame. 720p is plenty for a site record. */
export const MAX_VIDEO_EDGE = 1280;

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|3gp|3g2|mpe?g|wmv|ogv)$/i;

/** Is this File / Blob a video? Type first, then the name (phones send ''). */
export function isVideoFile(file) {
  if (!file) return false;
  const t = String(file.type || '').toLowerCase();
  if (t.startsWith('video/')) return true;
  return VIDEO_EXT.test(String(file.name || ''));
}

/** Is this stored slot descriptor a video? */
export function isVideoEntry(p) {
  if (!p) return false;
  const isFile = p.kind === 'file' || (!p.url && p.file_ref);
  if (!isFile) return false;
  if (String(p.mime || '').toLowerCase().startsWith('video/')) return true;
  return VIDEO_EXT.test(String(p.filename || ''));
}

/** 75 → "1:15", 3725 → "1:02:05". Empty for anything not a finite positive. */
export function formatDuration(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return '';
  const total = Math.round(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/**
 * The video bitrate that fits `durationSec` into TARGET_VIDEO_BYTES.
 * Returns null when even the floor would not fit — the video is too long to
 * keep, and the caller must say so rather than store something unwatchable.
 */
export function videoBitrateFor(durationSec, {
  targetBytes = TARGET_VIDEO_BYTES, maxBps = MAX_VIDEO_BPS, minBps = MIN_VIDEO_BPS, audioBps = AUDIO_BPS,
} = {}) {
  const d = Number(durationSec);
  if (!Number.isFinite(d) || d <= 0) return maxBps; // unknown length: best effort
  // 5% container overhead.
  const budget = (targetBytes * 8 * 0.95) / d - audioBps;
  if (budget < minBps) return null;
  return Math.floor(Math.min(maxBps, budget));
}

/** Longest playable length at the floor bitrate — for the "too long" message. */
export function maxVideoSeconds({ targetBytes = TARGET_VIDEO_BYTES, minBps = MIN_VIDEO_BPS, audioBps = AUDIO_BPS } = {}) {
  return Math.floor((targetBytes * 8 * 0.95) / (minBps + audioBps));
}

/** Fit (w, h) inside a box whose longest edge is `maxEdge`, even numbers (encoders need them). */
export function scaledSize(w, h, maxEdge = MAX_VIDEO_EDGE) {
  const W = Math.max(2, Number(w) || 0);
  const H = Math.max(2, Number(h) || 0);
  const k = Math.min(1, maxEdge / Math.max(W, H));
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  return { width: even(W * k), height: even(H * k) };
}

/**
 * The recording container to ask MediaRecorder for. MP4 (H.264/AAC) first:
 * it plays on EVERY phone, iPhone included, whereas WebM does not. Chrome
 * records MP4 since v126; older Chrome / Firefox fall back to WebM.
 */
export const RECORDER_TYPES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function pickRecorderMime(isTypeSupported) {
  if (typeof isTypeSupported !== 'function') return '';
  for (const t of RECORDER_TYPES) {
    try { if (isTypeSupported(t)) return t; } catch { /* keep looking */ }
  }
  return '';
}

/** "video/mp4;codecs=…" → "mp4". */
export function extensionForMime(mime = '') {
  const t = String(mime).toLowerCase();
  if (t.includes('mp4')) return 'mp4';
  if (t.includes('webm')) return 'webm';
  if (t.includes('quicktime')) return 'mov';
  return 'mp4';
}

/** "site_clip.MOV" → "site_clip.mp4" when the container changed. */
export function renameForContainer(filename, mime) {
  const ext = extensionForMime(mime);
  const base = String(filename || 'video').replace(/\.[A-Za-z0-9]{1,5}$/, '') || 'video';
  return `${base}.${ext}`;
}

/** Name of a clip recorded in the app: video_2026-10-05_1432.mp4 */
export function recordedFilename(mime, now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `video_${stamp}.${extensionForMime(mime)}`;
}

// ───────────────────────────── browser only below ─────────────────────────────

/**
 * Posters (first-frame thumbnails) for videos THIS DEVICE has touched, by
 * file_ref and by local id. Never stored in the report document: a poster is
 * base64, and base64 in a parent document is BUG-005. A video slot without a
 * cached poster draws a dark play tile instead.
 */
const posterCache = new Map();
export function rememberPoster(key, dataUrl) {
  if (key && dataUrl) posterCache.set(String(key), dataUrl);
}
export function posterFor(p) {
  if (!p) return '';
  return posterCache.get(String(p.file_ref || '')) || posterCache.get(String(p.id || '')) || p.poster_local || '';
}

const PROBE_TIMEOUT_MS = 20_000;

/** Load a video element on a blob and resolve once its metadata is known. */
function loadVideo(blob, { muted = true } = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement('video');
    v.preload = 'auto';
    v.muted = muted;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.crossOrigin = 'anonymous';
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      reject(new Error('This video could not be read by the browser.'));
    }, PROBE_TIMEOUT_MS);
    v.onloadedmetadata = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ video: v, url });
    };
    v.onerror = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      reject(new Error('This video format cannot be played in this browser.'));
    };
    v.src = url;
  });
}

/**
 * A WebM written by MediaRecorder reports duration = Infinity until the
 * element is asked to seek far past the end. Resolve the real length.
 */
async function realDuration(v) {
  if (Number.isFinite(v.duration) && v.duration > 0) return v.duration;
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(0), 4000);
    v.ontimeupdate = () => {
      v.ontimeupdate = null;
      clearTimeout(t);
      const d = v.duration;
      v.currentTime = 0;
      resolve(Number.isFinite(d) ? d : 0);
    };
    try { v.currentTime = 1e7; } catch { clearTimeout(t); resolve(0); }
  });
}

function seekTo(v, t) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    v.onseeked = () => { clearTimeout(timer); v.onseeked = null; resolve(); };
    try { v.currentTime = t; } catch { clearTimeout(timer); resolve(); }
  });
}

/** Small JPEG of one frame, ~320 px, for the cell thumbnail. */
function frameToPoster(v, maxEdge = 320) {
  const { width, height } = scaledSize(v.videoWidth || 320, v.videoHeight || 180, maxEdge);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(v, 0, 0, width, height);
  return c.toDataURL('image/jpeg', 0.7);
}

/** { duration, width, height, poster } of a video blob. Never throws. */
export async function readVideoInfo(blob) {
  let loaded;
  try {
    loaded = await loadVideo(blob);
    const v = loaded.video;
    const duration = await realDuration(v);
    let poster = '';
    try {
      await seekTo(v, Math.min(0.5, (duration || 1) / 4));
      if (v.videoWidth) poster = frameToPoster(v);
    } catch { /* a missing poster is cosmetic */ }
    return { duration, width: v.videoWidth || 0, height: v.videoHeight || 0, poster };
  } catch {
    return { duration: 0, width: 0, height: 0, poster: '' };
  } finally {
    if (loaded) {
      loaded.video.removeAttribute('src');
      try { loaded.video.load(); } catch { /* ignore */ }
      URL.revokeObjectURL(loaded.url);
    }
  }
}

export function canRecordVideo() {
  return typeof window !== 'undefined'
    && typeof window.MediaRecorder !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && window.isSecureContext !== false;
}

function canReencode() {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') return false;
  const c = document.createElement('canvas');
  return typeof c.captureStream === 'function';
}

/**
 * Re-encode a video to the size budget: draw it, frame by frame, onto a
 * canvas no larger than 1280 px and record that canvas (plus the original
 * sound) with MediaRecorder at a bitrate chosen from its length.
 *
 * It runs in REAL TIME (a 2-minute clip takes ~2 minutes) because the browser
 * has no faster public encoder; progress is reported as 0..1 and the caller
 * shows it. An AbortSignal stops it cleanly.
 */
async function reencode(file, { duration, bitrate, onProgress, signal }) {
  const { video: v, url } = await loadVideo(file, { muted: false });
  const { width, height } = scaledSize(v.videoWidth, v.videoHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(30);

  // Sound: route the element through Web Audio so it is RECORDED but not
  // played out loud. A clip with no audio track simply adds nothing.
  let audioCtx = null;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      audioCtx = new AC();
      const src = audioCtx.createMediaElementSource(v);
      const dest = audioCtx.createMediaStreamDestination();
      src.connect(dest);
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    }
  } catch { v.muted = true; }

  const mimeType = pickRecorderMime((t) => window.MediaRecorder.isTypeSupported(t));
  const rec = new window.MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: bitrate,
    audioBitsPerSecond: AUDIO_BPS,
  });
  const parts = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };

  const cleanup = () => {
    try { stream.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try { audioCtx?.close(); } catch { /* ignore */ }
    v.pause();
    v.removeAttribute('src');
    try { v.load(); } catch { /* ignore */ }
    URL.revokeObjectURL(url);
  };

  return new Promise((resolve, reject) => {
    let timer = null;
    let finished = false;
    const finish = (err) => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      if (rec.state !== 'inactive') {
        rec.onstop = () => {
          cleanup();
          if (err) reject(err);
          else resolve(new Blob(parts, { type: (rec.mimeType || mimeType || 'video/webm').split(';')[0] }));
        };
        try { rec.stop(); } catch { cleanup(); if (err) reject(err); }
      } else {
        cleanup();
        if (err) reject(err);
      }
    };
    if (signal) {
      if (signal.aborted) { finish(new DOMException('Cancelled', 'AbortError')); return; }
      signal.addEventListener('abort', () => finish(new DOMException('Cancelled', 'AbortError')), { once: true });
    }
    // A timer, not requestAnimationFrame: rAF stops dead in a background tab.
    const draw = () => {
      try { ctx.drawImage(v, 0, 0, width, height); } catch { /* frame not ready */ }
      if (duration > 0) onProgress?.(Math.min(0.99, v.currentTime / duration));
    };
    v.onended = () => { draw(); finish(); };
    v.onerror = () => finish(new Error('The video stopped playing while it was being compressed.'));
    rec.start(1000);
    v.currentTime = 0;
    try { audioCtx?.resume?.(); } catch { /* ignore */ }
    const startDrawing = () => { timer = setInterval(draw, 1000 / 30); };
    v.play().then(startDrawing).catch(() => {
      // Autoplay with sound refused: keep the picture, lose the sound, rather
      // than fail the whole upload.
      v.muted = true;
      v.play().then(startDrawing)
        .catch((e) => finish(new Error(`The video could not be played for compression (${e?.message || e}).`)));
    });
  });
}

/**
 * THE single ingest point for a video file. Returns
 *   { file, duration, poster, compressed }
 * where `file` is what to store (the original when it is already small, the
 * re-encode otherwise). Throws a sentence the user can act on when the video
 * cannot be brought under the limit.
 */
export async function prepareVideoForUpload(file, { onProgress, signal } = {}) {
  const info = await readVideoInfo(file);
  const mb = (n) => `${(n / (1024 * 1024)).toFixed(1)} MB`;

  if (file.size <= KEEP_ORIGINAL_BYTES) {
    onProgress?.(1);
    return { file, duration: info.duration, poster: info.poster, compressed: false };
  }

  const bitrate = videoBitrateFor(info.duration);
  if (bitrate === null) {
    const maxMin = Math.floor(maxVideoSeconds() / 60);
    throw new Error(
      `"${file.name}" is ${formatDuration(info.duration)} long — too long to store. Keep videos under about ${maxMin} minutes (trim it on the phone, or record a shorter clip in the app).`
    );
  }

  if (!canReencode()) {
    if (file.size <= MAX_VIDEO_BYTES) {
      onProgress?.(1);
      return { file, duration: info.duration, poster: info.poster, compressed: false };
    }
    throw new Error(
      `"${file.name}" is ${mb(file.size)} and this browser cannot compress video. The limit is ${mb(MAX_VIDEO_BYTES)} — use Chrome, or record the clip in the app.`
    );
  }

  let out;
  try {
    out = await reencode(file, { duration: info.duration, bitrate, onProgress, signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    if (file.size <= MAX_VIDEO_BYTES) {
      // Compression failed but the original fits: keep it rather than lose it.
      console.warn('Video compression failed, storing the original:', err);
      onProgress?.(1);
      return { file, duration: info.duration, poster: info.poster, compressed: false };
    }
    throw new Error(`"${file.name}" could not be compressed (${err?.message || err}).`);
  }

  // Never store a "compressed" copy that is bigger, or an empty one.
  if (!out || out.size < 1024 || out.size >= file.size) {
    if (file.size <= MAX_VIDEO_BYTES) {
      onProgress?.(1);
      return { file, duration: info.duration, poster: info.poster, compressed: false };
    }
    throw new Error(`"${file.name}" is ${mb(file.size)}; the limit is ${mb(MAX_VIDEO_BYTES)}.`);
  }
  if (out.size > MAX_VIDEO_BYTES) {
    throw new Error(`"${file.name}" is still ${mb(out.size)} after compression; the limit is ${mb(MAX_VIDEO_BYTES)}. Trim it shorter.`);
  }

  onProgress?.(1);
  const name = renameForContainer(file.name, out.type);
  return {
    file: new File([out], name, { type: out.type || 'video/mp4' }),
    duration: info.duration,
    poster: info.poster,
    compressed: true,
  };
}
