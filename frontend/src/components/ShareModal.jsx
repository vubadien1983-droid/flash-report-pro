import React, { useState, useEffect, useRef } from 'react';
import {
  Link as LinkIcon, Copy, Check, ExternalLink, QrCode, X, Share2, Sparkles, Smartphone, Download, Globe,
  Eye, EyeOff, KeyRound, Pencil, Wand2
} from 'lucide-react';
import { generateEditPassword, isValidEditPassword, MIN_EDIT_PASSWORD } from '../services/flashEdit';
import { exportStandaloneHtml } from '../services/htmlExporter';
import { isMiniPlan, MINI_PLAN_LABEL } from '../services/miniPlan';
import { isOpsFindings } from '../services/opsFindings';
import { isPreservation } from '../services/preservationFindings';

/**
 * The EDITABLE link of a Flash Report (v3.37.0): create it with a password,
 * show the password behind an eye button, change it or switch the link off.
 * The password is hidden by default so it is not exposed on a shared screen.
 */
function EditLinkSection({ editUrl, editPassword, onEnable, onDisable }) {
  const enabled = Boolean(editPassword);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const copy = async (what, text) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 2200); }
    catch (e) { console.error('Copy failed:', e); }
  };

  const save = async () => {
    if (!isValidEditPassword(draft)) { setError(`The password needs at least ${MIN_EDIT_PASSWORD} characters.`); return; }
    setBusy(true); setError('');
    try { await onEnable(draft.trim()); setFormOpen(false); setDraft(''); setReveal(false); }
    catch (e) { setError(e?.message || 'Could not save the password.'); }
    finally { setBusy(false); }
  };

  const turnOff = async () => {
    if (!window.confirm('Turn off the editable link? Anyone holding it will no longer be able to edit.')) return;
    setBusy(true);
    try { await onDisable(); setReveal(false); } catch (e) { setError(e?.message || 'Could not turn it off.'); } finally { setBusy(false); }
  };

  const showForm = formOpen || !enabled;

  return (
    <div className="mb-4 p-3 bg-amber-50/70 border border-amber-200/70 rounded-xl">
      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 mb-1">
        <Pencil className="w-3.5 h-3.5 text-amber-600" /> Editable link (needs a password)
      </div>
      <p className="text-[11px] text-amber-900/80 leading-relaxed mb-2.5">
        {enabled
          ? 'Whoever opens this link and types the password can edit rows, photos and files. Their changes are saved into this report and shown on the view-only link. The view-only link above stays read-only.'
          : 'Create a link that lets other people UPDATE this report once they type a password you choose. The view-only link above is unchanged.'}
      </p>

      {enabled && (
        <>
          <div className="flex items-center gap-2 mb-2">
            <input type="text" readOnly value={editUrl} onClick={(e) => e.target.select()}
              className="flex-1 min-w-0 text-xs font-mono text-slate-700 bg-white border border-amber-200 rounded-xl px-3 py-2 outline-none select-all" />
            <button type="button" onClick={() => copy('link', editUrl)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white flex-shrink-0">
              {copied === 'link' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied === 'link' ? 'Copied' : 'Copy link'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <KeyRound className="w-3.5 h-3.5 text-amber-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type={reveal ? 'text' : 'password'} readOnly value={editPassword} autoComplete="off"
                aria-label="Edit password"
                className="w-full text-xs font-mono text-slate-800 bg-white border border-amber-200 rounded-xl pl-8 pr-9 py-2 outline-none" />
              <button type="button" onClick={() => setReveal((v) => !v)} title={reveal ? 'Hide the password' : 'Show the password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100">
                {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button type="button" onClick={() => copy('pw', editPassword)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-amber-100 text-amber-800 border border-amber-200 flex-shrink-0">
              {copied === 'pw' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied === 'pw' ? 'Copied' : 'Copy password'}
            </button>
          </div>
        </>
      )}

      {showForm && (
        <div className={enabled ? 'mt-3 pt-3 border-t border-amber-200/70' : ''}>
          <label className="block text-[11px] font-semibold text-amber-900 mb-1">
            {enabled ? 'New password' : 'Choose a password'}
          </label>
          <div className="flex items-center gap-2">
            <input type="text" value={draft} onChange={(e) => { setDraft(e.target.value); setError(''); }}
              placeholder={`At least ${MIN_EDIT_PASSWORD} characters`} autoComplete="off"
              className="flex-1 min-w-0 text-xs font-mono bg-white border border-amber-200 rounded-xl px-3 py-2 outline-none focus:border-amber-500" />
            <button type="button" onClick={() => { setDraft(generateEditPassword()); setError(''); }} title="Generate a random password"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-amber-100 text-amber-800 border border-amber-200 flex-shrink-0">
              <Wand2 className="w-3.5 h-3.5" /> Generate
            </button>
          </div>
          {error && <p className="text-[11px] text-rose-600 mt-1.5">{error}</p>}
          <div className="flex items-center gap-2 mt-2.5">
            <button type="button" onClick={save} disabled={busy}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white">
              {busy ? 'Saving…' : (enabled ? 'Change password' : 'Create editable link')}
            </button>
            {enabled && (
              <button type="button" onClick={() => { setFormOpen(false); setDraft(''); setError(''); }}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50">Cancel</button>
            )}
          </div>
        </div>
      )}

      {enabled && !showForm && (
        <div className="flex items-center gap-3 mt-3">
          <button type="button" onClick={() => setFormOpen(true)} className="text-[11px] font-semibold text-amber-800 hover:underline">Change password</button>
          <button type="button" onClick={turnOff} disabled={busy} className="text-[11px] font-semibold text-rose-600 hover:underline">Turn off editable link</button>
        </div>
      )}
    </div>
  );
}

export default function ShareModal({ isOpen, shareUrl, report, onClose, editUrl = '', onEnableEdit, onDisableEdit }) {
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !shareUrl || !canvasRef.current) return;

    let cancelled = false;

    // qrcode is only needed once the share dialog is actually opened, so it
    // is kept out of the main bundle.
    import('qrcode')
      .then(({ default: QRCode }) => {
        if (cancelled || !canvasRef.current) return;
        QRCode.toCanvas(
          canvasRef.current,
          shareUrl,
          {
            width: 140,
            margin: 2,
            color: {
              dark: '#0f172a',
              light: '#ffffff'
            }
          },
          (error) => {
            if (error) console.error('Local QR render error:', error);
          }
        );
      })
      .catch((e) => console.warn('QR library failed to load:', e.message));

    return () => { cancelled = true; };
  }, [isOpen, shareUrl]);

  if (!isOpen || !shareUrl) return null;

  // A Mini Plan link is LIVE and password-locked; a Flash Report link is a
  // snapshot that refreshes when the author saves. The dialog has to say which
  // one the user is about to send, because the two promise different things to
  // whoever receives them.
  const plan = isMiniPlan(report);
  const ops = isOpsFindings(report);
  const pf = isPreservation(report);
  const reportTitle = report?.title || (plan ? MINI_PLAN_LABEL : 'Flash Inspection Report');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: reportTitle,
          text: plan ? `Live plan: ${reportTitle}` : `Flash Inspection Report: ${reportTitle}`,
          url: shareUrl
        });
      } catch (err) {
        console.warn('Share cancelled or failed:', err);
      }
    } else {
      handleCopy();
    }
  };

  const handleDownloadHtml = () => {
    exportStandaloneHtml(report);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-5 md:p-6 border border-slate-200 max-h-[94vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-sky-400 flex items-center justify-center text-white shadow-md shadow-brand-500/20">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm md:text-base font-bold text-slate-900">
                {plan ? 'Share live plan' : 'Share Flash Report'}
              </h3>
              <p className="text-xs text-slate-500">
                {plan
                  ? 'Recipients see the plan update live, and can export Excel / PDF'
                  : 'Recipients can view the report and export Excel / PDF'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Report Title Badge */}
        <div className="mb-4 p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center gap-2">
          <span className="px-2 py-0.5 bg-brand-100 text-brand-700 text-[10px] font-bold rounded-md uppercase">
            {plan ? 'Mini Plan' : ops ? 'OPS Findings' : pf ? 'Preservation' : 'Report'}
          </span>
          <span className="text-xs font-semibold text-slate-800 truncate">
            {reportTitle}
          </span>
        </div>

        {/* What the recipient gets. Stated plainly so the sender knows what
            they are handing over — a live document, editable only with the
            project password. */}
        {ops && (
          <div className="mb-4 p-3 bg-emerald-50/70 border border-emerald-200/70 rounded-xl text-[11px] text-emerald-900 leading-relaxed">
            <strong className="font-bold">This link is live.</strong> Whoever opens it sees the findings as
            they are right now, and the page keeps updating — no need to resend it. The Summary tab is open to
            everyone; <strong className="font-bold">editing a section tab needs that section's password</strong>.
            A link ending in <code>?tab=B</code> opens on that tab.
          </div>
        )}

        {pf && (
          <div className="mb-4 p-3 bg-emerald-50/70 border border-emerald-200/70 rounded-xl text-[11px] text-emerald-900 leading-relaxed">
            <strong className="font-bold">This link is live.</strong> Whoever opens it sees the findings as
            they are right now — Summary and Findings, search, filters, Excel / PDF — with no password.{' '}
            <strong className="font-bold">Editing, adding findings and uploading pictures or files need the team password.</strong>{' '}
            A link ending in <code>?tab=findings</code> opens on the Findings tab.
          </div>
        )}

        {plan && (
          <div className="mb-4 p-3 bg-emerald-50/70 border border-emerald-200/70 rounded-xl text-[11px] text-emerald-900 leading-relaxed">
            <strong className="font-bold">This link is live.</strong> Whoever opens it sees the
            plan as it is right now, and it keeps updating on their screen as the plan changes —
            no need to resend it. They can read it and export it, but{' '}
            <strong className="font-bold">editing needs the project password</strong>.
          </div>
        )}

        {/* Share Link Input & Copy Button */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
            <span>{plan ? 'Live Plan Link' : (!ops && !pf && onEnableEdit ? 'View-only link' : 'Shareable Online Link')}</span>
            {copied && (
              <span className="text-emerald-600 text-xs font-medium flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Copied to clipboard!
              </span>
            )}
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <LinkIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                readOnly
                value={shareUrl}
                onClick={(e) => e.target.select()}
                className="w-full text-xs font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 outline-none focus:border-brand-500 focus:bg-white transition-all select-all"
              />
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex-shrink-0 ${
                copied
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                  : 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm shadow-brand-600/30 hover:scale-[1.02]'
              }`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Local Canvas QR Code & Mobile Scan Area */}
        <div className="mb-4 p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl flex flex-col sm:flex-row items-center gap-4">
          <div className="w-[140px] h-[140px] bg-white p-1 rounded-xl border border-slate-200 shadow-xs flex items-center justify-center flex-shrink-0">
            <canvas ref={canvasRef} className="rounded-lg max-w-full max-h-full" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-bold text-slate-800 mb-1">
              <Smartphone className="w-4 h-4 text-brand-600" />
              Scan QR Code with Phone
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed mb-2.5">
              Open your phone camera to scan and view this report on mobile immediately.
            </p>
            {typeof navigator !== 'undefined' && navigator.share && (
              <button
                type="button"
                onClick={handleNativeShare}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold shadow-2xs transition-colors"
              >
                <Share2 className="w-3.5 h-3.5 text-brand-600" />
                Share via Zalo / App
              </button>
            )}
          </div>
        </div>

        {/* Flash Report only: the second kind of link, editable behind a password. */}
        {!plan && !ops && !pf && onEnableEdit && (
          <EditLinkSection
            editUrl={editUrl}
            editPassword={report?.edit_password || ''}
            onEnable={onEnableEdit}
            onDisable={onDisableEdit}
          />
        )}

        {/* Option 2: Download Standalone HTML Web Report (not for OPS Findings:
            its link and its Excel / PDF are the formats that report offers). */}
        {!ops && (
        <div className="mb-4 p-3 bg-brand-50/60 border border-brand-200/60 rounded-xl flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-brand-900 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-brand-600" />
              Download Standalone Web Report (.html)
            </div>
            <p className="text-[11px] text-brand-700">
              Single interactive file to send via Zalo/Email. Opens directly in any browser.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownloadHtml}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-2xs transition-colors flex-shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Download HTML
          </button>
        </div>
        )}

        {/* Bottom Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Close
          </button>
          <a
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-xl transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open in New Tab
          </a>
        </div>
      </div>
    </div>
  );
}
