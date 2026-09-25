import React, { useEffect, useMemo, useState } from 'react';
import { Paperclip, ImageOff, Image as ImageIcon, Mail, RefreshCw } from 'lucide-react';
import {
  parseEmailBuffer, buildEmailDocument, sanitizeEmailHtml, inlineCidImages,
  countRemoteImages, formatPerson,
} from '../../services/emailParse';
import { formatBytes } from '../../services/fileAttachments';

/**
 * An .eml / .msg attachment shown as an email — v3.21.0
 *
 * Header (subject, from, to, cc, date) and the attachment list are React; the
 * BODY is a stranger's HTML and lives in an `<iframe sandbox srcdoc>` with no
 * script permission, DOMPurify on top, and a CSP that blocks every remote
 * load until the reader presses "Show images" (see emailParse.js).
 *
 * An attachment inside the email opens in the same preview window (Back
 * returns to the email) — a PDF inside an email reads like any other PDF.
 */

function fmtDate(d) {
  if (!d) return '';
  try {
    return d.toLocaleString(undefined, {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return d.toISOString(); }
}

function People({ label, list }) {
  if (!list || !list.length) return null;
  return (
    <div className="flex gap-2 text-[12.5px] leading-snug">
      <span className="w-10 flex-shrink-0 text-slate-400 font-semibold">{label}</span>
      <span className="text-slate-700 break-words min-w-0">{list.map(formatPerson).join('; ')}</span>
    </div>
  );
}

export default function EmailView({ blob, kind, onOpenAttachment }) {
  const [state, setState] = useState({ status: 'loading' });
  const [allowRemote, setAllowRemote] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    setAllowRemote(false);
    (async () => {
      try {
        const buffer = await blob.arrayBuffer();
        const email = await parseEmailBuffer(buffer, kind);
        let purify = null;
        try {
          const mod = await import('dompurify');
          purify = mod.default || mod;
        } catch { purify = null; }
        if (!cancelled) setState({ status: 'ready', email, purify });
      } catch (e) {
        if (!cancelled) setState({ status: 'error', message: e?.message || String(e) });
      }
    })();
    return () => { cancelled = true; };
  }, [blob, kind]);

  const email = state.email;
  const purify = state.purify;

  const srcDoc = useMemo(() => {
    if (!email) return '';
    const sanitize = purify && typeof purify.sanitize === 'function'
      ? (html) => sanitizeEmailHtml(html, purify)
      : null;
    return buildEmailDocument(email, { allowRemote, sanitize });
  }, [email, purify, allowRemote]);

  // Inline pictures already shown in the body are not listed again.
  const { listed, remoteCount } = useMemo(() => {
    if (!email) return { listed: [], remoteCount: 0 };
    const used = email.html ? inlineCidImages(email.html, email.attachments).used : new Set();
    return {
      listed: email.attachments.map((a, i) => ({ ...a, i })).filter((a) => !used.has(a.i)),
      remoteCount: email.html ? countRemoteImages(email.html) : 0,
    };
  }, [email]);

  if (state.status === 'loading') {
    return (
      <div className="w-full h-full flex items-center justify-center gap-2 text-white/80 text-sm">
        <RefreshCw className="w-5 h-5 animate-spin" /> Reading email…
      </div>
    );
  }
  if (state.status === 'error') {
    throw new Error(`This email could not be read: ${state.message}`);
  }

  return (
    <div className="w-full h-full flex flex-col bg-white rounded-lg overflow-hidden">
      <div className="px-3 sm:px-5 pt-3 pb-2.5 border-b border-slate-200 bg-slate-50 flex-shrink-0 max-h-[45%] overflow-y-auto">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Mail className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] sm:text-base font-bold text-slate-900 break-words leading-snug">
              {email.subject || '(no subject)'}
            </h2>
            <div className="mt-1.5 space-y-0.5">
              <People label="From" list={email.from ? [email.from] : []} />
              <People label="To" list={email.to} />
              <People label="Cc" list={email.cc} />
              <People label="Bcc" list={email.bcc} />
              {email.date && (
                <div className="flex gap-2 text-[12.5px]">
                  <span className="w-10 flex-shrink-0 text-slate-400 font-semibold">Date</span>
                  <span className="text-slate-700">{fmtDate(email.date)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {listed.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {listed.map((a) => (
              <button
                key={a.i}
                type="button"
                onClick={() => onOpenAttachment?.(a)}
                disabled={!a.content || !a.content.byteLength}
                title={`Open ${a.filename}`}
                className="inline-flex items-center gap-1.5 max-w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:border-sky-400 hover:bg-sky-50 text-[12px] text-slate-700 disabled:opacity-50"
              >
                <Paperclip className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <span className="truncate max-w-[55vw] sm:max-w-[260px] font-medium">{a.filename}</span>
                <span className="text-slate-400 flex-shrink-0">{formatBytes(a.size)}</span>
              </button>
            ))}
          </div>
        )}

        {remoteCount > 0 && (
          <div className="mt-2 flex items-center gap-2 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            {allowRemote ? <ImageIcon className="w-4 h-4 flex-shrink-0" /> : <ImageOff className="w-4 h-4 flex-shrink-0" />}
            <span className="flex-1">
              {allowRemote
                ? 'Pictures from the internet are shown.'
                : `${remoteCount} picture${remoteCount > 1 ? 's' : ''} from the internet blocked, for privacy.`}
            </span>
            {!allowRemote && (
              <button type="button" onClick={() => setAllowRemote(true)} className="font-bold text-amber-900 underline underline-offset-2">
                Show images
              </button>
            )}
          </div>
        )}
      </div>

      <iframe
        key={allowRemote ? 'remote' : 'local'}
        title={email.subject || 'Email'}
        srcDoc={srcDoc}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        className="flex-1 min-h-0 w-full border-0 bg-white"
      />
    </div>
  );
}
