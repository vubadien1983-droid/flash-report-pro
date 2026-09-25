import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * A Word (.docx) attachment rendered as pages — v3.21.0
 *
 * `docx-preview` lays the document out in the browser (page size, margins,
 * colours, tables, pictures, headers and footers). It is a READING view:
 * line and page breaks can differ slightly from Word, which is why the
 * Download button stays next to it.
 *
 * On a narrow screen the pages are scaled to the width with CSS `zoom` — ONE
 * measurement of the first page when the document loads and on resize, never
 * per element (BUG-021).
 */
export default function DocxView({ blob }) {
  const hostRef = useRef(null);
  const [state, setState] = useState({ status: 'loading' });
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return undefined;
    host.innerHTML = '';
    setState({ status: 'loading' });

    const fit = () => {
      const page = host.querySelector('section.docx');
      if (!page) return;
      host.style.zoom = '';
      const avail = host.parentElement ? host.parentElement.clientWidth - 8 : 0;
      const need = page.offsetWidth + 24;
      host.style.zoom = avail > 0 && need > avail ? String(Math.max(0.3, avail / need)) : '';
    };

    (async () => {
      try {
        const { renderAsync } = await import('docx-preview');
        await renderAsync(blob, host, host, {
          className: 'docx',
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          useBase64URL: true,
          experimental: true,
        });
        if (cancelled) return;
        // A Word hyperlink can point anywhere, `javascript:` included. Keep
        // web, mail and in-document links only; open web links in a new tab.
        host.querySelectorAll('a[href]').forEach((a) => {
          const href = a.getAttribute('href') || '';
          if (href.startsWith('#')) return;
          if (!/^(https?:|mailto:)/i.test(href.trim())) { a.removeAttribute('href'); return; }
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
        });
        fit();
        setState({ status: 'ready' });
      } catch (e) {
        if (!cancelled) setErr(e?.message || String(e));
      }
    })();

    window.addEventListener('resize', fit);
    return () => { cancelled = true; window.removeEventListener('resize', fit); };
  }, [blob]);

  if (err) throw new Error(`This Word file could not be shown: ${err}`);

  return (
    <div className="w-full h-full overflow-auto rounded-lg bg-slate-500/40">
      {state.status === 'loading' && (
        <div className="flex items-center justify-center gap-2 text-white/80 text-sm py-10">
          <RefreshCw className="w-5 h-5 animate-spin" /> Opening Word document…
        </div>
      )}
      <div ref={hostRef} className="fr-docx" />
    </div>
  );
}
