/**
 * SOURCE of api/ops-weekly.js (v3.28.0) — the weekly OPS report for e-mail.
 *
 * Build:  node server/build.mjs   (bundles this file + the app's own OPS code
 * into api/ops-weekly.js; exceljs / jspdf / jpeg-js stay in node_modules).
 * NEVER edit api/ops-weekly.js by hand — edit this file and rebuild.
 *
 *   GET /api/ops-weekly?share=<shareId>&format=json|xlsx|pdf
 *
 * Reads the SHARED copy of the OPS report straight from Firestore's REST API
 * (world-readable by design, exactly what the share link reads), rebuilds the
 * photos, and returns the same Excel / PDF the app's Export buttons make, or a
 * JSON summary for the e-mail body. It needs nothing the share link does not
 * already expose, so it holds no secret.
 *
 * Vercel caps a response at 4.5 MB, so pictures are re-encoded to at most
 * 520 px (they print about 130 pt wide) — that keeps both files around 2 MB.
 */

import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { setImageLoader } from '../src/services/exportImage';
import { exportOpsExcel, exportOpsPdf } from '../src/services/opsFindingsExport';
import {
  normalizeOpsItems, opsStats, opsSectionSummary, opsActionByBreakdown,
  normalizeOpsStatus, OPS_STATUS, opsDateKey, closedOn, formatOpsDate, OPS_FINDINGS_LABEL,
} from '../src/services/opsFindings';

const MAX_PX = 520;
const QUALITY = 72;
const FETCH_CONCURRENCY = 8;

// ─── Firestore REST ──────────────────────────────────────────────

function fromValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  if ('referenceValue' in v) return v.referenceValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  if ('bytesValue' in v) return v.bytesValue;
  return null;
}
export function fromFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = fromValue(v);
  return out;
}

let cachedConfig = null;
/** projectId + apiKey: Vercel env first; else read them from the app's own bundle. */
async function firebaseConfig(origin) {
  if (cachedConfig) return cachedConfig;
  const env = process.env;
  let projectId = env.VITE_FIREBASE_PROJECT_ID || env.FIREBASE_PROJECT_ID || '';
  let apiKey = env.VITE_FIREBASE_API_KEY || env.FIREBASE_API_KEY || '';
  if (!projectId && origin) {             // the API key is optional for public reads
    const html = await (await fetch(origin + '/')).text();
    const js = (html.match(/\/assets\/index-[^"']+\.js/) || [])[0];
    if (js) {
      const code = await (await fetch(origin + js)).text();
      projectId = projectId || (code.match(/projectId:"([^"]+)"/) || [])[1] || '';
      apiKey = apiKey || (code.match(/apiKey:"([^"]+)"/) || [])[1] || '';
    }
  }
  if (!projectId) throw new Error('Firebase project id is not configured.');
  cachedConfig = { projectId, apiKey };
  return cachedConfig;
}

async function readDoc(cfg, path) {
  const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${path}`
    + (cfg.apiKey ? `?key=${cfg.apiKey}` : '');
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore ${res.status} on ${path}`);
  const json = await res.json();
  return fromFields(json.fields || {});
}

async function pool(list, n, fn) {
  let i = 0;
  const run = async () => { while (i < list.length) { const k = i++; await fn(list[k], k); } };
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, run));
}

/** The shared report with its photo bytes put back (like the share link does). */
export async function loadSharedReport(shareId, { origin, readDocFn } = {}) {
  const read = readDocFn || (async (p) => readDoc(await firebaseConfig(origin), p));
  const data = await read(`shared_reports/${shareId}`);
  if (!data) throw Object.assign(new Error('Report not found'), { status: 404 });
  const items = normalizeOpsItems(data.items || []);
  const refs = new Set();
  for (const it of items) for (const p of it.photos || []) if (p && !p.url && p.photo_ref) refs.add(p.photo_ref);
  const bytes = new Map();
  await pool([...refs], FETCH_CONCURRENCY, async (ref) => {
    try { const d = await read(`shared_reports/${shareId}/photos/${ref}`); if (d?.url) bytes.set(ref, d.url); }
    catch (e) { console.warn('photo', ref, e.message); }
  });
  const withBytes = items.map((it) => ({
    ...it,
    photos: (it.photos || []).map((p) => (p && !p.url && p.photo_ref && bytes.has(p.photo_ref) ? { ...p, url: bytes.get(p.photo_ref) } : p)),
  }));
  return { ...data, id: `share_${shareId}`, share_id: shareId, items: withBytes };
}

// ─── Pictures without a canvas ───────────────────────────────────

export function nodeImageData(url) {
  try { return decodeAndShrink(url); } catch (e) { console.warn('image skipped:', e.message); return null; }
}

function decodeAndShrink(url) {
  const m = /^data:[^;,]*;base64,(.*)$/i.exec(String(url || ''));
  if (!m) return null;
  const raw = Buffer.from(m[1], 'base64');
  // Trust the BYTES, not the label: photos saved as "image/png" are often JPEG.
  let img;
  if (raw[0] === 0xff && raw[1] === 0xd8) img = jpeg.decode(raw, { useTArray: true, maxMemoryUsageInMB: 512 });
  else if (raw[0] === 0x89 && raw[1] === 0x50) {
    const png = PNG.sync.read(raw, { checkCRC: false });
    // Flatten transparency onto white, as the browser export does.
    const d = png.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3] / 255;
      d[i] = d[i] * a + 255 * (1 - a); d[i + 1] = d[i + 1] * a + 255 * (1 - a); d[i + 2] = d[i + 2] * a + 255 * (1 - a); d[i + 3] = 255;
    }
    img = { width: png.width, height: png.height, data: d };
  } else return null;                              // webp etc.: skipped
  const isJpeg = raw[0] === 0xff;
  const { width: w0, height: h0 } = img;
  const scale = Math.min(1, MAX_PX / Math.max(w0, h0));
  let out = raw; let w = w0; let h = h0;
  if (scale < 1 || !isJpeg) {
    w = Math.max(1, Math.round(w0 * scale)); h = Math.max(1, Math.round(h0 * scale));
    const dst = new Uint8Array(w * h * 4);
    // Box filter: average every source pixel that falls in the target pixel.
    const fx = w0 / w; const fy = h0 / h;
    for (let y = 0; y < h; y += 1) {
      const sy0 = Math.floor(y * fy); const sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * fy));
      for (let x = 0; x < w; x += 1) {
        const sx0 = Math.floor(x * fx); const sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * fx));
        let r = 0; let g = 0; let b = 0; let n = 0;
        for (let sy = sy0; sy < sy1 && sy < h0; sy += 1) {
          let o = (sy * w0 + sx0) * 4;
          for (let sx = sx0; sx < sx1 && sx < w0; sx += 1) { r += img.data[o]; g += img.data[o + 1]; b += img.data[o + 2]; n += 1; o += 4; }
        }
        const d = (y * w + x) * 4;
        dst[d] = r / n; dst[d + 1] = g / n; dst[d + 2] = b / n; dst[d + 3] = 255;
      }
    }
    out = Buffer.from(jpeg.encode({ data: dst, width: w, height: h }, QUALITY).data);
  }
  const base64 = out.toString('base64');
  return { base64, extension: 'jpeg', dataUrl: `data:image/jpeg;base64,${base64}`, aspectRatio: w0 / h0, width: w, height: h };
}

// ─── The e-mail summary ──────────────────────────────────────────

const DAY = 86400000;
const keyToUtc = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const utcToKey = (t) => new Date(t).toISOString().slice(0, 10);

export function isoWeek(key) {
  const d = new Date(keyToUtc(key));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - firstThu) / DAY - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
}

export function weeklySummary(report, today) {
  const items = report.items || [];
  const st = opsStats(items);
  const weekAgo = utcToKey(keyToUtc(today) - 7 * DAY);
  const opened = (it) => opsDateKey(it.open_date);
  const newThisWeek = items.filter((it) => opened(it) && opened(it) > weekAgo && opened(it) <= today);
  const closedThisWeek = items.filter((it) => { const c = closedOn(it); return c && c > weekAgo && c <= today; });
  const totalBefore = items.filter((it) => !opened(it) || opened(it) <= weekAgo).length;
  const closedBefore = items.filter((it) => { const c = closedOn(it); return normalizeOpsStatus(it.status) === OPS_STATUS.CLOSED && (!c || c <= weekAgo); }).length;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const split = (status) => opsActionByBreakdown(items, status).map((b) => ({ name: b.name, count: b.count, blank: b.blank }));
  return {
    title: report.title || OPS_FINDINGS_LABEL,
    location: report.location || '',
    today, today_label: formatOpsDate(today), week: isoWeek(today), year: Number(today.slice(0, 4)),
    totals: { total: st.total, open: st.open, ongoing: st.ongoing, closed: st.closed, percentClosed: st.percentClosed },
    actionBy: { total: split(''), open: split(OPS_STATUS.OPEN), ongoing: split(OPS_STATUS.ONGOING), closed: split(OPS_STATUS.CLOSED) },
    sections: opsSectionSummary(items).map((s) => ({ section: s.section, letter: s.letter, ...s.stats })),
    thisWeek: { new: newThisWeek.length, closed: closedThisWeek.length, percentNow: st.percentClosed, percentLastWeek: pct(closedBefore, totalBefore) },
    nyClarify: items.filter((it) => !String(it.action_by || '').trim()).length,
  };
}

// ─── The e-mail itself (for Power Automate, v3.29.0) ─────────────
//
// Power Automate (the BV Microsoft 365 licence has STANDARD connectors only)
// copies these URLs into OneDrive with "Upload file from URL" and puts them in
// "Send an email (V2)", so the body and subject are built HERE, not in the flow.

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longDate = (k) => { const d = new Date(keyToUtc(k)); return `${String(d.getUTCDate()).padStart(2, '0')}-${MON[d.getUTCMonth()]}-${d.getUTCFullYear()}`; };

/** The next <day> after `today` (never today itself). */
export function nextMeetingDay(today, dayName) {
  const want = Math.max(0, DAYS.findIndex((d) => d.toLowerCase() === String(dayName || 'tuesday').toLowerCase()));
  const t = keyToUtc(today);
  const cur = new Date(t).getUTCDay();
  const add = ((want - cur + 7) % 7) || 7;
  return utcToKey(t + add * DAY);
}

export function emailOptions(q = {}) {
  const pick = (k, d) => (q[k] !== undefined && String(q[k]).trim() !== '' ? String(q[k]).slice(0, 300) : d);
  return {
    project: pick('project', 'Block B - EPC#1'),
    meetDay: pick('meetday', 'Tuesday'),
    meetStart: pick('meetstart', '09:00'),
    meetMinutes: Number(pick('meetmin', '60')) || 60,
    venue: pick('venue', 'Site office meeting room / Microsoft Teams'),
    agenda: pick('agenda', '1) New findings this week  2) Open items per Action By  3) Items to be clarified (NY Clarify)  4) Close-out evidence'),
    sender: pick('sender', 'Vu Ba Dien'),
    senderTitle: pick('title', 'Bureau Veritas - Block B EPC#1'),
    link: pick('link', 'https://flash-report-pro.vercel.app/#/OPS-Finding-Status'),
  };
}

export function emailSubject(sum, o) {
  return `${o.project} - [OPS Findings] Weekly Status Report & Weekly Meeting - Week ${String(sum.week).padStart(2, '0')} (${longDate(sum.today)})`;
}

export function emailHtml(sum, o, nowLabel = '') {
  const t = sum.totals;
  const pc = (v) => (t.total ? Math.round((100 * v) / t.total) : 0);
  const chips = (list) => (list || []).map((b) => `<span style="${b.blank ? 'color:#92400e;' : ''}">${esc(b.name)} ${b.count}</span>`).join(' &middot; ');
  const tile = (label, value, pct, color, list) => `<td width="25%" style="border:1px solid #d7dee8;padding:10px;vertical-align:top;"><div style="font-size:11px;color:#64748b;font-weight:bold;">${label}</div><div style="font-size:24px;font-weight:bold;color:${color};">${value}${pct === null ? '' : ` <span style="font-size:12px;color:#64748b;">${pct}%</span>`}</div><div style="font-size:11px;color:#475569;">${chips(list)}</div></td>`;
  const td = 'style="padding:6px 8px;border:1px solid #d7dee8;"';
  const tdc = 'align="center" style="padding:6px 8px;border:1px solid #d7dee8;"';
  const rows = sum.sections.map((s) => `<tr><td ${td}>${esc(s.section)}</td><td ${tdc}>${s.total}</td><td ${tdc}><span style="color:#b91c1c;">${s.open}</span></td><td ${tdc}>${s.ongoing}</td><td ${tdc}><span style="color:#047857;">${s.closed}</span></td><td ${tdc}>${s.percentClosed}%</td></tr>`).join('')
    + `<tr style="background:#f1f5f9;font-weight:bold;"><td ${td}>Total</td><td ${tdc}>${t.total}</td><td ${tdc}>${t.open}</td><td ${tdc}>${t.ongoing}</td><td ${tdc}>${t.closed}</td><td ${tdc}>${t.percentClosed}%</td></tr>`;
  const mDay = nextMeetingDay(sum.today, o.meetDay);
  const [hh, mm] = String(o.meetStart).split(':').map((x) => Number(x) || 0);
  const endMin = hh * 60 + mm + o.meetMinutes;
  const hm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const mLabel = `${DAYS[new Date(keyToUtc(mDay)).getUTCDay()]}, ${longDate(mDay)}, ${hm(hh * 60 + mm)} - ${hm(endMin)}`;
  const w = sum.thisWeek;
  const ny = sum.nyClarify > 0
    ? `<tr><td style="padding:10px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fcd34d;"><tr><td style="padding:10px 14px;font-size:13px;line-height:1.55;"><b>Action requested:</b> <b>${sum.nyClarify}</b> findings have no Action By yet (<b>NY Clarify</b>). Please confirm the responsible party (CONS / PE) before or during the meeting. Action parties are kindly requested to update status and close-out evidence directly in the live register.</td></tr></table></td></tr>`
    : '';
  return `<html><body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:760px;border:1px solid #d7dee8;">
<tr><td style="background:#1F3A5F;padding:18px 24px;">
<div style="font-size:12px;color:#aac4e6;letter-spacing:1px;">${esc(o.project.toUpperCase())} &middot; ${esc(sum.location)}</div>
<div style="font-size:20px;font-weight:bold;color:#ffffff;margin-top:4px;">OPS Findings &amp; Action Tracking &ndash; Weekly Status</div>
<div style="font-size:13px;color:#d6e2f2;margin-top:2px;">Week ${String(sum.week).padStart(2, '0')} &middot; status as of ${longDate(sum.today)}${nowLabel ? ` ${nowLabel}` : ''}</div>
</td></tr>
<tr><td style="padding:20px 24px 4px 24px;font-size:14px;line-height:1.55;">Dear All,<br><br>Please find attached the weekly status of the OPS Findings &amp; Action Tracking (Excel and PDF). The figures below are taken from the live register at the time of sending. We will review the open items together at the weekly meeting below.</td></tr>
<tr><td style="padding:12px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7ff;border:1px solid #bcd6f5;"><tr><td style="padding:12px 16px;font-size:14px;line-height:1.6;">
<div style="font-weight:bold;color:#1F3A5F;font-size:15px;margin-bottom:4px;">&#128197; Weekly OPS Findings Meeting</div>
<b>Date / time:</b> ${esc(mLabel)}<br><b>Venue:</b> ${esc(o.venue)}<br><b>Agenda:</b> ${esc(o.agenda)}
</td></tr></table></td></tr>
<tr><td style="padding:8px 24px 4px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>${tile('TOTAL FINDINGS', t.total, null, '#1e293b', sum.actionBy.total)}${tile('OPEN', t.open, pc(t.open), '#b91c1c', sum.actionBy.open)}${tile('ON-GOING', t.ongoing, pc(t.ongoing), '#b45309', sum.actionBy.ongoing)}${tile('CLOSED', t.closed, pc(t.closed), '#047857', sum.actionBy.closed)}</tr></table></td></tr>
<tr><td style="padding:8px 24px;font-size:13px;"><b>This week:</b> +<b>${w.new}</b> new findings &middot; <b>${w.closed}</b> closed &middot; close-out progress <b>${w.percentNow}%</b> (last week ${w.percentLastWeek}%)</td></tr>
<tr><td style="padding:4px 24px 8px 24px;"><div style="font-size:14px;font-weight:bold;color:#1F3A5F;margin-bottom:6px;">Status by section</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
<tr style="background:#1F3A5F;color:#ffffff;"><td style="padding:7px 8px;">Section</td><td align="center">Total</td><td align="center">Open</td><td align="center">On-going</td><td align="center">Closed</td><td align="center">% Closed</td></tr>
${rows}
</table></td></tr>
${ny}
<tr><td align="center" style="padding:10px 24px 18px 24px;"><a href="${esc(o.link)}" style="display:inline-block;background:#0369a1;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:10px 22px;">Open the live OPS Finding Status</a>
<div style="font-size:11px;color:#64748b;margin-top:6px;">View, filter and export without a password &middot; editing requires the section password</div></td></tr>
<tr><td style="padding:4px 24px 20px 24px;font-size:13px;line-height:1.55;border-top:1px solid #e2e8f0;"><br>Best regards,<br><b>${esc(o.sender)}</b><br>${esc(o.senderTitle)}<br>
<span style="font-size:11px;color:#94a3b8;">This e-mail is generated automatically every week from the OPS Findings register. Please reply to this e-mail for any question.</span></td></tr>
</table></body></html>`;
}

// ─── Handler ─────────────────────────────────────────────────────

function todayVN() {
  // The site's day (Vietnam, UTC+7), whatever the server's clock zone.
  return new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  const q = req.query || {};
  const shareId = String(q.share || '').replace(/[^A-Za-z0-9_-]/g, '');
  const format = String(q.format || 'json').toLowerCase();
  if (!shareId) { res.status(400).json({ error: 'share is required' }); return; }
  try {
    const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
    const report = await loadSharedReport(shareId, { origin });
    const today = todayVN();
    const sum = weeklySummary(report, today);
    const base = `OPS_Findings_Week${String(sum.week).padStart(2, '0')}_${today}`;
    res.setHeader('Cache-Control', 'no-store');
    if (format === 'json') { res.status(200).json(sum); return; }
    if (format === 'html' || format === 'subject') {
      const o = emailOptions(q);
      const hhmm = new Date(Date.now() + 7 * 3600000).toISOString().slice(11, 16);
      const text = format === 'html' ? emailHtml(sum, o, hhmm) : emailSubject(sum, o);
      res.setHeader('Content-Type', format === 'html' ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8');
      res.status(200).send(text);
      return;
    }
    setImageLoader(nodeImageData);
    const out = format === 'pdf'
      ? await exportOpsPdf(report, null, { returnBuffer: true, fileName: base })
      : await exportOpsExcel(report, null, { returnBuffer: true, fileName: base });
    const buf = Buffer.from(out.buffer);
    res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${out.fileName}"`);
    res.setHeader('Content-Length', String(buf.length));
    res.status(200).send(buf);
  } catch (e) {
    console.error('ops-weekly', e);
    res.status(e.status || 500).json({ error: e.message || String(e) });
  }
}
