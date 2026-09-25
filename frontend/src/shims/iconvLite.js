/**
 * Browser stand-in for `iconv-lite` — v3.21.0
 *
 * `@kenjiuno/msgreader` (the Outlook .msg reader) requires iconv-lite, which is
 * built on Node's Buffer and does not run in a browser. msgreader only ever
 * calls `decode(bytes, encoding)` (and `encode` when WRITING a file, which the
 * app never does), so the browser's own TextDecoder covers it. Aliased in
 * vite.config.js; nothing else in the app imports iconv-lite.
 */
function label(encoding) {
  const e = String(encoding || 'utf-8').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (e === 'utf16le' || e === 'ucs2') return 'utf-16le';
  if (e === 'utf8') return 'utf-8';
  if (e === 'latin1' || e === 'binary') return 'iso-8859-1';
  const cp = /^(?:cp|windows|win)(\d+)$/.exec(e);
  if (cp) {
    const n = Number(cp[1]);
    if (n === 65001) return 'utf-8';
    if (n === 936) return 'gbk';
    if (n === 932) return 'shift_jis';
    if (n === 949) return 'euc-kr';
    if (n === 950) return 'big5';
    return `windows-${n}`;
  }
  return encoding;
}

export function decode(bytes, encoding) {
  try { return new TextDecoder(label(encoding)).decode(bytes); } catch { return new TextDecoder('utf-8').decode(bytes); }
}

export function encode(str) {
  return new TextEncoder().encode(String(str));
}

export function encodingExists(encoding) {
  try { new TextDecoder(label(encoding)); return true; } catch { return false; }
}

export default { decode, encode, encodingExists };
