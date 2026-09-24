/**
 * Named share links — a readable address for a live share link.
 *
 *   https://flash-report-pro.vercel.app/#/OPS-Finding-Status
 *     opens the same page as  …/#/view/45dvx7p5ny
 *
 * The share id is public already (it is in the link people receive), so
 * listing it here reveals nothing new. The old `#/view/<id>` address keeps
 * working. Matching ignores case, and treats spaces, %20, "_" and "-" alike.
 */
export const SHARE_ALIASES = {
  'ops-finding-status': '45dvx7p5ny',
};

/** Display names, for the page title and the copy-link button. */
export const ALIAS_TITLES = {
  'ops-finding-status': 'OPS Finding Status',
};

/** The alias key a hash names, or ''. "#/OPS%20Finding%20Status?tab=B" → "ops-finding-status". */
export function aliasKeyFromHash(hash) {
  const m = /^#\/([^/?]+)/.exec(String(hash || ''));
  if (!m) return '';
  let raw = m[1];
  try { raw = decodeURIComponent(raw); } catch { /* keep as is */ }
  const key = raw.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
  return SHARE_ALIASES[key] ? key : '';
}

export function shareIdFromAlias(hash) {
  const k = aliasKeyFromHash(hash);
  return k ? SHARE_ALIASES[k] : '';
}

/** The named link for a share id, or '' when it has none. */
export function aliasForShareId(shareId) {
  const k = Object.keys(SHARE_ALIASES).find((a) => SHARE_ALIASES[a] === shareId);
  return k ? `${ALIAS_TITLES[k] || k}`.replace(/\s+/g, '-') : '';
}

// ─── A DOMAIN of its own (v3.20.2) ───────────────────────────────
//
// https://ops-finding-status.vercel.app is a second domain of the SAME Vercel
// project (added under Settings → Domains). On that host the page is ONLY the
// live OPS report: whatever the hash says, the app itself is never rendered
// there, so the recipients of that link never see the report list, the other
// reports or the app's lock screen. The main app's own domain is unchanged.
// Preview hosts ("ops-finding-status-git-…vercel.app") behave the same.
export const HOST_SHARES = {
  'ops-finding-status': '45dvx7p5ny',
};

export function shareIdFromHost(host) {
  const h = String(host ?? (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
  const label = h.split('.')[0] || '';
  for (const [key, id] of Object.entries(HOST_SHARES)) {
    if (label === key || label.startsWith(`${key}-`)) return id;
  }
  return '';
}

/** The public address of a share: its own domain when it has one. */
export function publicShareUrl(shareId, tab = '') {
  const key = Object.keys(HOST_SHARES).find((k) => HOST_SHARES[k] === shareId);
  const q = tab && tab !== 'summary' ? `?tab=${encodeURIComponent(tab)}` : '';
  if (key) return `https://${key}.vercel.app/${q}`;
  const named = aliasForShareId(shareId);
  const base = `${window.location.origin}${window.location.pathname}`;
  return named ? `${base}#/${named}${q}` : `${base}#/view/${shareId}${q}`;
}
