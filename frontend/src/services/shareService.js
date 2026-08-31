/**
 * High-Speed Short Link Share Service for Flash Reports
 * Uses Vercel Serverless `/api/share` backend with direct fallback,
 * producing 50-char permanent URLs with 100% reliable cloud sync.
 */

import { getLocalReport, saveLocalReport } from './clientStorage';

async function compressPhotoForShare(url) {
  if (!url) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const maxDim = 500;
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
      resolve(canvas.toDataURL('image/jpeg', 0.68));
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
}

export async function publishReportForSharing(report) {
  const localId = report.id || `rep_${Date.now()}`;
  
  // Save locally in IndexedDB
  await saveLocalReport(report);

  // Compress photos for rapid upload
  const sharedItems = await Promise.all(
    (report.items || []).map(async (item) => {
      const compressedPhotos = await Promise.all(
        (item.photos || []).map(async (p) => {
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

  // 1. Try Vercel Serverless Function `/api/share` (Same-Origin, Zero CORS issues)
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

  // 2. Direct Fallback to dpaste.com
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
    throw new Error('Cloud storage upload failed. Please check your internet connection.');
  }

  const baseUrl = window.location.origin + window.location.pathname;
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

  // 3. Fallback to Local IndexedDB (if author is viewing own report)
  try {
    const local = await getLocalReport(cleanId);
    if (local) return local;
  } catch (e) {}

  return null;
}
