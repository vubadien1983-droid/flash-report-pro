/**
 * RTF body of an Outlook .msg → HTML or plain text — v3.21.0
 *
 * Outlook often stores a message body ONLY as compressed RTF (PR_RTF_COMPRESSED).
 * After decompression there are two cases:
 *
 *  1. `\fromhtml1` — the RTF is an ENVELOPE around the original HTML
 *     ([MS-OXRTFEX]). The HTML is recovered exactly: text inside
 *     `{\*\htmltagN …}` groups is HTML source, text between `\htmlrtf` and
 *     `\htmlrtf0` exists only for RTF readers and is dropped, and everything
 *     else is the HTML's own text content.
 *  2. Anything else (a real rich-text message) — the readable TEXT is
 *     extracted; formatting is not reproduced.
 *
 * Written by hand because the one library that does this (rtf-stream-parser)
 * is built on Node streams and iconv-lite, neither of which exists in a
 * browser. Pure: no DOM, no Node APIs beyond TextDecoder (present in both).
 */

const SKIP_DESTINATIONS = new Set([
  'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer',
  'headerl', 'headerr', 'headerf', 'footerl', 'footerr', 'footerf',
  'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl',
  'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'mmathPr',
  'pgdsctbl', 'objdata', 'fldinst', 'filetbl', 'revtbl', 'userprops',
  'bkmkstart', 'bkmkend', 'object', 'nonshppict', 'shppict', 'wgrffmtfilter',
]);

const CHAR_WORDS = {
  par: '\n', line: '\n', page: '\n', sect: '\n', row: '\n', tab: '\t', cell: '\t',
  emdash: '\u2014', endash: '\u2013', bullet: '\u2022', lquote: '\u2018',
  rquote: '\u2019', ldblquote: '\u201C', rdblquote: '\u201D', emspace: '\u2003',
  enspace: '\u2002', qmspace: '\u2005',
};

/** \fcharsetN (font table) → Windows code page. 0 = the document's \ansicpg. */
const CHARSET_CP = {
  128: 932, 129: 949, 130: 1361, 134: 936, 136: 950, 161: 1253, 162: 1254,
  163: 1258, 177: 1255, 178: 1256, 186: 1257, 204: 1251, 222: 874, 238: 1250,
};

function decoderFor(codepage) {
  const cp = Number(codepage) || 1252;
  const label = cp === 65001 ? 'utf-8'
    : cp === 936 ? 'gbk' : cp === 932 ? 'shift_jis' : cp === 949 ? 'euc-kr'
      : cp === 950 ? 'big5' : cp === 874 ? 'windows-874' : `windows-${cp}`;
  try { return new TextDecoder(label); } catch { return new TextDecoder('windows-1252'); }
}

export function isEncapsulatedHtml(rtf = '') {
  return /\\fromhtml1/.test(String(rtf).slice(0, 2048));
}

/**
 * @returns {{ html: string|null, text: string }}
 *          `html` when the RTF encapsulates HTML, otherwise `null` and `text`.
 */
export function rtfToHtml(rtf = '') {
  const src = String(rtf || '');
  const htmlMode = isEncapsulatedHtml(src);
  let ansiCp = 1252;
  const fontCp = new Map();   // \fN → code page from its \fcharset (Chinese, Korean… need their own)
  let fontDef = null;         // the font being defined inside \fonttbl
  const decoders = new Map();
  const decoderNow = () => {
    const cp = (state.font != null && fontCp.get(state.font)) || ansiCp;
    if (!decoders.has(cp)) decoders.set(cp, decoderFor(cp));
    return decoders.get(cp);
  };

  const out = [];
  let bytes = [];
  let state = { skip: false, htmlTag: false, htmlrtf: false, uc: 1, font: null, fonttbl: false };
  const stack = [];
  let groupStart = false;   // the next token is the first one inside a new group
  let starPending = false;  // `\*` seen at the start of this group
  let skipChars = 0;        // fallback characters still to drop after a \uN

  const emitting = () => !state.skip && (!htmlMode || state.htmlTag || !state.htmlrtf);

  const flushBytes = () => {
    if (!bytes.length) return;
    const s = decoderNow().decode(new Uint8Array(bytes));
    bytes = [];
    if (emitting()) out.push(s);
  };
  const emit = (s) => {
    flushBytes();
    if (emitting()) out.push(s);
  };
  const plainChar = (ch) => {
    if (skipChars > 0) { skipChars -= 1; return; }
    emit(ch);
  };

  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];

    if (c === '{') {
      flushBytes();
      stack.push(state);
      state = { ...state };
      groupStart = true;
      starPending = false;
      skipChars = 0;
      i += 1;
      continue;
    }
    if (c === '}') {
      flushBytes();
      state = stack.pop() || { skip: false, htmlTag: false, htmlrtf: false, uc: 1, font: null, fonttbl: false };
      groupStart = false;
      starPending = false;
      skipChars = 0;
      i += 1;
      continue;
    }
    if (c === '\r' || c === '\n') { i += 1; continue; }

    if (c === '\\') {
      const nx = src[i + 1];
      if (nx === undefined) break;

      if (/[A-Za-z]/.test(nx)) {
        let j = i + 1;
        while (j < n && /[A-Za-z]/.test(src[j])) j += 1;
        const word = src.slice(i + 1, j);
        let param = null;
        const pm = /^-?\d+/.exec(src.slice(j, j + 12));
        if (pm) { param = Number(pm[0]); j += pm[0].length; }
        if (src[j] === ' ') j += 1;
        i = j;

        const first = groupStart;
        groupStart = false;

        // Inside the font table only the font → charset pairs matter.
        if (state.fonttbl) {
          if (word === 'f' && param != null) fontDef = param;
          else if (word === 'fcharset' && param != null && fontDef != null && CHARSET_CP[param]) fontCp.set(fontDef, CHARSET_CP[param]);
          continue;
        }
        if (first && word === 'fonttbl') { flushBytes(); state.skip = true; state.fonttbl = true; continue; }

        if (first && starPending) {
          starPending = false;
          if (htmlMode && word === 'htmltag') { flushBytes(); state.htmlTag = true; state.skip = false; }
          else { flushBytes(); state.skip = true; }
          continue;
        }
        if (first && SKIP_DESTINATIONS.has(word)) { flushBytes(); state.skip = true; continue; }

        if (word === 'ansicpg' && param != null) { flushBytes(); ansiCp = param; continue; }
        if (word === 'f' && param != null) { flushBytes(); state.font = param; continue; }
        if (word === 'uc' && param != null) { state.uc = Math.max(0, param); continue; }
        if (word === 'u' && param != null) {
          const code = param < 0 ? param + 65536 : param;
          emit(String.fromCharCode(code));
          skipChars = state.uc;
          continue;
        }
        if (word === 'htmlrtf') { flushBytes(); state.htmlrtf = param !== 0; continue; }
        if (Object.prototype.hasOwnProperty.call(CHAR_WORDS, word)) {
          const ch = CHAR_WORDS[word];
          emit(htmlMode && ch === '\n' ? '\r\n' : ch);
          continue;
        }
        continue; // every other control word is formatting
      }

      groupStart = false;
      if (nx === "'") {
        const hex = src.slice(i + 2, i + 4);
        i += 4;
        if (skipChars > 0) { skipChars -= 1; continue; }
        const b = parseInt(hex, 16);
        if (!Number.isNaN(b)) bytes.push(b);
        continue;
      }
      if (nx === '*') { starPending = true; groupStart = true; i += 2; continue; }
      if (nx === '\\' || nx === '{' || nx === '}') { plainChar(nx); i += 2; continue; }
      if (nx === '~') { plainChar('\u00A0'); i += 2; continue; }
      if (nx === '_') { plainChar('-'); i += 2; continue; }
      if (nx === '\r' || nx === '\n') { emit(htmlMode ? '\r\n' : '\n'); i += 2; continue; }
      i += 2; // \- (optional hyphen), \| , \: … carry no text
      continue;
    }

    groupStart = false;
    plainChar(c);
    i += 1;
  }
  flushBytes();

  const joined = out.join('');
  if (htmlMode) return { html: joined, text: '' };
  return { html: null, text: joined.replace(/\n{3,}/g, '\n\n').trim() };
}
