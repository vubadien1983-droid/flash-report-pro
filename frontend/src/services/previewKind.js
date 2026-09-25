/**
 * What kind of viewer an attachment gets — v3.21.0
 *
 * ONE answer to "can the app show this file, and with what?", used by the
 * preview window in the app, on every share link and on the public
 * `#/file/...` page, so a file never opens one way here and another there.
 *
 * The EXTENSION decides first, the MIME type second. Browsers hand an Outlook
 * .msg an empty type (stored as application/octet-stream), and an .eml often
 * arrives as message/rfc822 or nothing at all — trusting the type alone is
 * how a perfectly viewable email would end up as "cannot display".
 *
 * No DOM here — covered by a plain Node unit test.
 */

export const PREVIEW = Object.freeze({
  IMAGE: 'image',
  PDF: 'pdf',
  MEDIA: 'media',        // audio / video — the browser plays it
  TEXT: 'text',          // .txt, .log, .json … — the browser shows it
  EML: 'eml',            // internet email (MIME)
  MSG: 'msg',            // Outlook item (OLE compound file)
  DOCX: 'docx',          // Word 2007+
  XLSX: 'xlsx',          // Excel 2007+ (xlsx / xlsm)
  CSV: 'csv',
  NONE: 'none',          // download only
});

const BY_EXT = {
  jpg: PREVIEW.IMAGE, jpeg: PREVIEW.IMAGE, png: PREVIEW.IMAGE, gif: PREVIEW.IMAGE,
  webp: PREVIEW.IMAGE, bmp: PREVIEW.IMAGE, svg: PREVIEW.IMAGE,
  pdf: PREVIEW.PDF,
  mp4: PREVIEW.MEDIA, webm: PREVIEW.MEDIA, mov: PREVIEW.MEDIA, mp3: PREVIEW.MEDIA,
  wav: PREVIEW.MEDIA, m4a: PREVIEW.MEDIA, ogg: PREVIEW.MEDIA,
  txt: PREVIEW.TEXT, log: PREVIEW.TEXT, json: PREVIEW.TEXT, xml: PREVIEW.TEXT, md: PREVIEW.TEXT,
  eml: PREVIEW.EML,
  msg: PREVIEW.MSG,
  docx: PREVIEW.DOCX, docm: PREVIEW.DOCX, dotx: PREVIEW.DOCX,
  xlsx: PREVIEW.XLSX, xlsm: PREVIEW.XLSX, xltx: PREVIEW.XLSX,
  csv: PREVIEW.CSV,
};

export function fileExtension(filename = '') {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(String(filename || '').trim());
  return m ? m[1].toLowerCase() : '';
}

export function previewKind(filename = '', mime = '') {
  const ext = fileExtension(filename);
  if (ext && BY_EXT[ext]) return BY_EXT[ext];

  const t = String(mime || '').toLowerCase();
  if (t.startsWith('image/')) return PREVIEW.IMAGE;
  if (t === 'application/pdf') return PREVIEW.PDF;
  if (t.startsWith('audio/') || t.startsWith('video/')) return PREVIEW.MEDIA;
  if (t === 'message/rfc822') return PREVIEW.EML;
  if (t === 'application/vnd.ms-outlook') return PREVIEW.MSG;
  if (t === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return PREVIEW.DOCX;
  if (t === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return PREVIEW.XLSX;
  if (t === 'text/csv') return PREVIEW.CSV;
  if (t.startsWith('text/')) return PREVIEW.TEXT;
  return PREVIEW.NONE;
}

/** Human label for the viewer, shown next to the file name. */
export const PREVIEW_LABEL = {
  [PREVIEW.EML]: 'Email', [PREVIEW.MSG]: 'Outlook email', [PREVIEW.DOCX]: 'Word',
  [PREVIEW.XLSX]: 'Excel', [PREVIEW.CSV]: 'CSV',
};

/**
 * Files that RUN when opened. A report attachment is opened by other people
 * from a public link, so the app refuses to carry one at all — at the single
 * upload chokepoint (`putAttachment`), which covers every report type and
 * every share link.
 */
export const BLOCKED_EXTENSIONS = new Set([
  'exe', 'com', 'bat', 'cmd', 'msi', 'msp', 'scr', 'pif', 'cpl', 'dll', 'sys',
  'js', 'jse', 'vbs', 'vbe', 'wsf', 'wsh', 'ps1', 'psm1', 'hta', 'jar',
  'lnk', 'reg', 'inf', 'sh', 'app', 'apk', 'appx', 'msix', 'gadget',
]);

export function isBlockedUpload(filename = '') {
  return BLOCKED_EXTENSIONS.has(fileExtension(filename));
}

/* The MIME type to give a blob, from its name when the stored type is missing or generic. */
const MIME_BY_EXT = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', txt: 'text/plain', csv: 'text/csv',
  eml: 'message/rfc822', msg: 'application/vnd.ms-outlook',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc: 'application/msword', xls: 'application/vnd.ms-excel', ppt: 'application/vnd.ms-powerpoint',
  zip: 'application/zip',
};

export function guessMime(filename = '', declared = '') {
  const d = String(declared || '').toLowerCase();
  if (d && d !== 'application/octet-stream') return d;
  return MIME_BY_EXT[fileExtension(filename)] || 'application/octet-stream';
}
