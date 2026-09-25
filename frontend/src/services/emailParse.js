/**
 * Email attachments (.eml / .msg) → one normalized shape → a safe HTML page — v3.21.0
 *
 * Both formats are read entirely IN THE BROWSER. Nothing is sent anywhere, so
 * an email attached to a report can be read on the share link, on a phone,
 * by somebody without Outlook:
 *   .eml — `postal-mime` (MIME, any charset, inline images, attachments)
 *   .msg — `@kenjiuno/msgreader` (Outlook OLE file). The body is taken in
 *          this order: HTML property → compressed RTF (decompressed, and if
 *          it wraps HTML the HTML is recovered, see rtfToHtml.js) → plain text.
 *
 * The parsers are imported lazily, so they cost nothing until somebody opens
 * an email.
 *
 * Normalized shape:
 *   { subject, from:{name,address}|null, to:[], cc:[], bcc:[], date: Date|null,
 *     html: string|null, text: string, attachments:[{ filename, mime, size,
 *     content: Uint8Array, cid, inline }] }
 *
 * SAFETY — an email is HTML written by a stranger. `buildEmailDocument()`
 * returns a document meant for an `<iframe sandbox srcdoc>` WITHOUT
 * allow-scripts, sanitized again with DOMPurify when one is passed in, and
 * carrying a Content-Security-Policy that blocks every remote load (tracking
 * pixels, remote CSS, fonts) until the reader presses "Show images".
 */

import { rtfToHtml } from './rtfToHtml';
import { guessMime } from './previewKind';

export { guessMime };

const stripAngles = (s) => String(s || '').trim().replace(/^<|>$/g, '');

function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toU8(content) {
  if (!content) return new Uint8Array(0);
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (ArrayBuffer.isView(content)) return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  if (Array.isArray(content)) return Uint8Array.from(content);
  return new Uint8Array(0);
}

function decodeCodepage(bytes, codepage) {
  const cp = Number(codepage) || 0;
  const labels = [];
  if (cp === 65001 || cp === 0) labels.push('utf-8');
  else if (cp >= 1250 && cp <= 1258) labels.push(`windows-${cp}`);
  else if (cp >= 28591 && cp <= 28605) labels.push(`iso-8859-${cp - 28590}`);
  else if (cp === 20127) labels.push('us-ascii');
  else if (cp === 936) labels.push('gbk');
  else if (cp === 932) labels.push('shift_jis');
  else if (cp === 949) labels.push('euc-kr');
  else if (cp === 950) labels.push('big5');
  labels.push('utf-8');
  for (const l of labels) {
    try { return new TextDecoder(l).decode(bytes); } catch { /* next */ }
  }
  return new TextDecoder().decode(bytes);
}

/* ─────────────────────────────── .eml ─────────────────────────────── */

const person = (p) => (p && (p.address || p.name) ? { name: p.name || '', address: p.address || '' } : null);

/** postal-mime's result → the normalized shape. Pure. */
export function normalizeEml(parsed = {}) {
  // A group address ("Team: a@x, b@y;") carries its members in `group`.
  const flat = (list) => (list || []).flatMap((p) => (Array.isArray(p?.group) ? p.group : [p])).map(person).filter(Boolean);
  return {
    subject: parsed.subject || '',
    from: person(parsed.from) || person(parsed.sender),
    to: flat(parsed.to),
    cc: flat(parsed.cc),
    bcc: flat(parsed.bcc),
    date: toDate(parsed.date),
    html: parsed.html || null,
    text: parsed.text || '',
    attachments: (parsed.attachments || []).map((a, i) => {
      const content = toU8(a.content);
      const filename = a.filename || (a.mimeType === 'message/rfc822' ? `message-${i + 1}.eml` : `attachment-${i + 1}`);
      return {
        filename,
        mime: guessMime(filename, a.mimeType),
        size: content.byteLength,
        content,
        cid: stripAngles(a.contentId),
        inline: a.disposition === 'inline' || !!a.related,
      };
    }),
  };
}

/* ─────────────────────────────── .msg ─────────────────────────────── */

/** "A <a@x>, \"B, C\" <b@x>, c@x" → [{name,address}] */
export function parseAddressList(value = '') {
  const out = [];
  let cur = '';
  let q = false;
  let angle = false;
  for (const ch of String(value)) {
    if (ch === '"') q = !q;
    if (ch === '<') angle = true;
    if (ch === '>') angle = false;
    if (ch === ',' && !q && !angle) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = /^(.*?)<([^>]*)>\s*$/.exec(s);
    if (m) return { name: m[1].trim().replace(/^"|"$/g, '').replace(/^'|'$/g, ''), address: m[2].trim() };
    return { name: '', address: s.replace(/^"|"$/g, '') };
  });
}

/** RFC 2047 encoded words ("=?utf-8?B?…?=") in a header value. */
export function decodeEncodedWords(value = '') {
  return String(value).replace(/\?=\s+=\?/g, '?==?').replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (m, charset, enc, data) => {
    try {
      let bytes;
      if (enc.toUpperCase() === 'B') {
        const bin = typeof atob === 'function' ? atob(data) : Buffer.from(data, 'base64').toString('binary');
        bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      } else {
        const bin = data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (x, h) => String.fromCharCode(parseInt(h, 16)));
        bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      }
      return new TextDecoder(charset.split('*')[0]).decode(bytes);
    } catch { return m; }
  });
}

/** The few transport headers a received .msg keeps (From/To/Cc/Date). */
export function parseTransportHeaders(headers = '') {
  const unfolded = String(headers || '').replace(/\r?\n[ \t]+/g, ' ');
  const get = (name) => {
    const m = new RegExp(`^${name}:[ \\t]*(.*)$`, 'im').exec(unfolded);
    return m ? decodeEncodedWords(m[1].trim()) : '';
  };
  return { from: get('From'), to: get('To'), cc: get('Cc'), date: get('Date') };
}

/**
 * msgreader's fields → the normalized shape. `readAttachment(att)` returns
 * `{fileName, content}`; `decompressRTF(number[])` → number[]. Both are passed
 * in so this stays testable in plain Node.
 */
export function normalizeMsg(fields = {}, readAttachment, decompressRTF) {
  const recips = fields.recipients || [];
  const hdr = parseTransportHeaders(fields.headers);
  const addr = (r) => {
    const email = r.smtpAddress || (String(r.email || '').includes('@') ? r.email : '') || r.email || '';
    const name = String(r.name || '').replace(/^'(.*)'$/, '$1');
    return { name: name === email ? '' : name, address: email };
  };
  const byType = (t) => {
    const list = recips.filter((r) => (r.recipType || 'to') === t).map(addr).filter((p) => p.name || p.address);
    if (list.length || t === 'bcc') return list;
    // A message with no recipient table still keeps its transport headers.
    return parseAddressList(t === 'to' ? hdr.to : hdr.cc);
  };

  let html = null;
  let text = fields.body || '';
  if (fields.bodyHtml) {
    html = fields.bodyHtml;
  } else if (fields.html && fields.html.length) {
    html = decodeCodepage(toU8(fields.html), fields.internetCodepage);
  } else if (fields.compressedRtf && fields.compressedRtf.length && decompressRTF) {
    try {
      const raw = Uint8Array.from(decompressRTF(Array.from(fields.compressedRtf)));
      // RTF is 7-bit; latin1 keeps every byte as one char for the tokenizer.
      const rtf = new TextDecoder('latin1').decode(raw);
      const got = rtfToHtml(rtf);
      if (got.html) html = got.html;
      else if (!text && got.text) text = got.text;
    } catch { /* fall back to the plain body */ }
  }

  const attachments = [];
  (fields.attachments || []).forEach((att, i) => {
    let data = null;
    try { data = readAttachment ? readAttachment(att) : null; } catch { data = null; }
    const content = toU8(data?.content);
    const filename = data?.fileName || att.fileName || att.fileNameShort
      || (att.innerMsgContent ? `${att.name || 'message'}.msg` : `attachment-${i + 1}`);
    attachments.push({
      filename,
      mime: guessMime(filename, att.attachMimeTag),
      size: content.byteLength || att.contentLength || 0,
      content,
      cid: stripAngles(att.pidContentId),
      inline: !!att.attachmentHidden || !!att.pidContentId,
    });
  });

  // Exchange stores the sender as an X.500 path ("/O=EXCHANGE/…"); prefer SMTP.
  const hdrFrom = parseAddressList(hdr.from)[0] || null;
  const fromAddress = fields.senderSmtpAddress
    || (fields.senderEmail && fields.senderEmail.includes('@') ? fields.senderEmail : '')
    || hdrFrom?.address || fields.senderEmail || '';
  const fromName = fields.senderName || hdrFrom?.name || '';
  return {
    subject: fields.subject || '',
    from: (fromName || fromAddress) ? { name: fromName === fromAddress ? '' : fromName, address: fromAddress } : null,
    to: byType('to'),
    cc: byType('cc'),
    bcc: byType('bcc'),
    date: toDate(fields.clientSubmitTime || fields.messageDeliveryTime || hdr.date || fields.creationTime),
    html,
    text,
    attachments,
  };
}

/* ─────────────────────────── loading ─────────────────────────── */

/** Text read as ASCII from ANSI bytes: high Latin-1 chars and nothing above U+00FF. */
export function looksLikeRawAnsi(fields = {}) {
  const sample = [fields.subject, fields.senderName, fields.body && fields.body.slice(0, 2000)].filter(Boolean).join(' ');
  return /[\x80-\xFF]/.test(sample) && !/[\u0100-\uFFFF]/.test(sample);
}

/** The Windows code page a non-Unicode .msg was written in. */
export function ansiCodepageOf(fields = {}, decompressRTF) {
  if (Number(fields.messageCodepage) > 0 && fields.messageCodepage !== 65001) return Number(fields.messageCodepage);
  if (fields.compressedRtf && fields.compressedRtf.length && decompressRTF) {
    try {
      const head = Uint8Array.from(decompressRTF(Array.from(fields.compressedRtf)).slice(0, 400));
      const m = /\\ansicpg(\d+)/.exec(new TextDecoder('latin1').decode(head));
      if (m) return Number(m[1]);
    } catch { /* fall through */ }
  }
  const inet = Number(fields.internetCodepage) || 0;
  const byInet = { 50220: 932, 50221: 932, 50222: 932, 51932: 932, 20932: 932, 936: 936, 52936: 936, 54936: 936, 51949: 949, 949: 949, 950: 950, 1258: 1258, 1252: 1252, 28591: 1252, 1251: 1251, 1250: 1250 };
  return byInet[inet] || 1252;
}

export async function parseEmailBuffer(buffer, kind) {
  if (kind === 'eml') {
    const { default: PostalMime } = await import('postal-mime');
    const parsed = await PostalMime.parse(buffer, { attachmentEncoding: 'arraybuffer' });
    return normalizeEml(parsed);
  }
  const [mr, dr] = await Promise.all([
    import('@kenjiuno/msgreader'),
    import('@kenjiuno/decompressrtf'),
  ]);
  const MsgReader = mr.default?.default || mr.default || mr.MsgReader;
  const decompressRTF = dr.decompressRTF || dr.default?.decompressRTF;
  let reader = new MsgReader(buffer);
  let fields = reader.getFileData();
  if (fields?.error) throw new Error(`This is not a readable Outlook message (${fields.error}).`);
  // A NON-Unicode .msg (older Outlook, or saved as "Outlook Message Format")
  // stores its text in the sender's Windows code page, and msgreader reads it
  // as ASCII unless told which one. Find the code page and read it again.
  if (looksLikeRawAnsi(fields)) {
    const cp = ansiCodepageOf(fields, decompressRTF);
    if (cp) {
      reader = new MsgReader(buffer);
      reader.parserConfig = { ansiEncoding: `cp${cp}` };
      const again = reader.getFileData();
      if (!again?.error) fields = again;
    }
  }
  return normalizeMsg(fields, (att) => reader.getAttachment(att), decompressRTF);
}

/* ──────────────────────── safe document ──────────────────────── */

export function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function u8ToBase64(u8) {
  let s = '';
  const step = 0x8000;
  for (let i = 0; i < u8.length; i += step) s += String.fromCharCode.apply(null, u8.subarray(i, i + step));
  return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
}

/** Replace `cid:` references with data: URLs of the matching attachment. */
export function inlineCidImages(html, attachments = []) {
  if (!html) return { html, used: new Set() };
  const byCid = new Map();
  attachments.forEach((a, i) => { if (a.cid) byCid.set(a.cid.toLowerCase(), i); });
  const used = new Set();
  const out = html.replace(/cid:([^"'\s)>]+)/gi, (m, id) => {
    let key = id;
    try { key = decodeURIComponent(id); } catch { /* keep raw */ }
    const at = byCid.get(stripAngles(key).toLowerCase());
    if (at === undefined) return m;
    used.add(at);
    const a = attachments[at];
    return `data:${a.mime};base64,${u8ToBase64(a.content)}`;
  });
  return { html: out, used };
}

export function countRemoteImages(html = '') {
  return (String(html).match(/<img\b[^>]*\bsrc\s*=\s*["']?\s*https?:/gi) || []).length
    + (String(html).match(/url\(\s*["']?https?:/gi) || []).length;
}

const URL_RE = /\b(https?:\/\/[^\s<>"']+)/g;

export function textToHtml(text = '') {
  return escapeHtml(text).replace(URL_RE, '<a href="$1">$1</a>');
}

/**
 * The body as a complete HTML document for a sandboxed iframe.
 * @param {object} email      normalized email
 * @param {object} opts
 * @param {boolean} opts.allowRemote   let remote images/CSS load
 * @param {(html:string)=>string} [opts.sanitize]  DOMPurify, when available
 */
/**
 * Defuse remote loads in the markup itself (img src/srcset, background=…),
 * not only by CSP: the browser's preload scanner can start fetching an image
 * before it has applied a `<meta>` CSP, and a tracking pixel only needs the
 * request to leave, not to succeed.
 */
export function blockRemoteLoads(html = '') {
  return String(html)
    .replace(/(<(?:img|image|input|video|audio|source)\b[^>]*?\s)(src|srcset|poster)(\s*=\s*["']?\s*(?:https?:)?\/\/)/gi, '$1data-fr-blocked-$2$3')
    .replace(/(<[a-z][^>]*?\s)(background)(\s*=\s*["']?\s*(?:https?:)?\/\/)/gi, '$1data-fr-blocked-$2$3');
}

export function buildEmailDocument(email, { allowRemote = false, sanitize } = {}) {
  let body;
  if (email.html) {
    const { html } = inlineCidImages(email.html, email.attachments);
    body = sanitize ? sanitize(html) : html;
    if (!allowRemote) body = blockRemoteLoads(body);
  } else {
    body = `<div class="fr-plain">${textToHtml(email.text || '')}</div>`;
  }
  const remote = allowRemote ? ' https: http:' : '';
  const csp = `default-src 'none'; img-src data:${remote}; style-src 'unsafe-inline'${remote}; font-src data:${remote}; media-src data:`;
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<base target="_blank">',
    '<style>html,body{margin:0;background:#fff}body{padding:14px 16px;font:14px/1.5 Segoe UI,Arial,sans-serif;color:#111;word-wrap:break-word;overflow-wrap:anywhere}',
    'img{max-width:100%;height:auto}table{max-width:100%}.fr-plain{white-space:pre-wrap;font-family:inherit}</style>',
    '</head><body>',
    body,
    '</body></html>',
  ].join('');
}

/**
 * DOMPurify for an email body. DOMPurify returns only the BODY of a whole
 * document, and most emails are laid out by `<style>` blocks in their HEAD —
 * so those blocks are lifted out first and put back in front. CSS cannot run
 * code, and the CSP above stops it fetching anything.
 */
export function sanitizeEmailHtml(html, purify) {
  const src = String(html || '');
  const styles = (src.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || []).join('\n');
  const clean = purify.sanitize(src, {
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'base', 'meta', 'link', 'iframe', 'object', 'embed'],
    ADD_ATTR: ['target'],
  });
  return styles + clean;
}

/** "Name <address>" for a header line. */
export function formatPerson(p) {
  if (!p) return '';
  if (p.name && p.address && p.name !== p.address) return `${p.name} <${p.address}>`;
  return p.name || p.address || '';
}
