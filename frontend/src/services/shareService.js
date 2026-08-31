/**
 * Ultra High-Speed Short Link Share Service for Flash Reports
 * Instant return (< 50ms) when report is already synced,
 * with fast parallel image optimization and fallback to Vercel Serverless `/api/share`.
 */

import { getLocalReport, saveLocalReport } from './clientStorage';

async function compressPhotoForShare(url) {
  if (!url) return null;
  // If already compact data URL (< 120KB), don't re-compress
  if (url.length < 120000) return url;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const maxDim = 450;
      let w = img.naturalWidth || img.width || 400;
      let h = img.naturalHeight || img.height || 300;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.65));
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
}

export async function publishReportForSharing(report) {
  const localId = report.id || `rep_${Date.now()}`;
  const baseUrl = window.location.origin + window.location.pathname;

  // 1. Instant Cache Hit: If report already has cloud_code, return in 0ms!
  if (report.cloud_code && report.cloud_code.length >= 6 && !report.cloud_code.startsWith('rep_')) {
    return {
      shareId: report.cloud_code,
      shareUrl: `${baseUrl}#/view/${report.cloud_code}`
    };
  }

  // Save locally in IndexedDB
  await saveLocalReport(report);

  // 2. Fast Parallel photo compression
  const items = report.items || [];
  const sharedItems = await Promise.all(
    items.map(async (item) => {
      const photos = item.photos || [];
      const compressedPhotos = await Promise.all(
        photos.map(async (p) => {
          if (!p || !p.url) return null;
          const compactUrl = await compressPhotoForShare(p.url);
          return {
            id: p.id,
            filename: p.filename,
            url: compactUrl,
            slot_index: p.slot_index
          };
        })
      );
      return {
        ...item,
        photos: compressedPhotos
      };
    })
  );

  const sharedReport = {
    ...report,
    id: localId,
    items: sharedItems
  };

  let shortCode = null;

  // 3. Try Vercel Serverless Function `/api/share` (Same-Origin)
  try {
    const res = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sharedReport)
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.id) {
        shortCode = data.id;
      }
    }
  } catch (e) {
    console.warn('Vercel API share note:', e);
  }

  // 4. Direct Fallback to dpaste.com
  if (!shortCode) {
    try {
      const bodyParams = new URLSearchParams();
      bodyParams.append('content', JSON.stringify(sharedReport));
      bodyParams.append('expiry_days', '365');
      bodyParams.append('syntax', 'json');

      const res = await fetch('https://dpaste.com/api/v2/', {
        method: 'POST',
        body: bodyParams,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      if (res.ok) {
        const pasteUrl = (await res.text()).trim();
        const code = pasteUrl.split('/').filter(Boolean).pop();
        if (code) {
          shortCode = code;
        }
      }
    } catch (err) {
      console.warn('Direct dpaste fallback note:', err);
    }
  }

  if (!shortCode) {
    throw new Error('Upload failed. Please check internet connection.');
  }

  // Cache cloud_code into local report
  const updatedReport = { ...report, cloud_code: shortCode };
  saveLocalReport(updatedReport).catch(() => {});

  const shareUrl = `${baseUrl}#/view/${shortCode}`;

  return {
    shareId: shortCode,
    shareUrl
  };
}

export async function fetchSharedReport(shareId) {
  if (!shareId) return null;
  const cleanId = shareId.split('?')[0].split('/')[0].trim();

  // 1. Try Vercel Serverless Function `/api/share?id=...`
  try {
    const res = await fetch(`/api/share?id=${encodeURIComponent(cleanId)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.title) {
        saveLocalReport(data).catch(() => {});
        return data;
      }
    }
  } catch (err) {
    console.warn('Vercel serverless fetch note:', err);
  }

  // 2. Direct Fallback to dpaste.com
  try {
    const res = await fetch(`https://dpaste.com/${cleanId}.txt`, {
      method: 'GET',
      headers: { 'Accept': 'text/plain' }
    });
    if (res.ok) {
      const text = await res.text();
      const data = JSON.parse(text);
      if (data && data.title) {
        saveLocalReport(data).catch(() => {});
        return data;
      }
    }
  } catch (err) {
    console.warn('Direct dpaste fetch note:', err);
  }

  // 3. Fallback to Local IndexedDB
  try {
    const local = await getLocalReport(cleanId);
    if (local) return local;
  } catch (e) {}

  return null;
}
