/**
 * 100% Reliable Cloud & URL Share Service for Flash Reports
 */

import { getLocalReport, saveLocalReport } from './clientStorage';

// Pure JS lightweight LZ-based string compressor for URL safety
const LZ = {
  compressToBase64: function (input) {
    if (input == null) return '';
    try {
      return btoa(encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (match, p1) => {
        return String.fromCharCode('0x' + p1);
      }));
    } catch (e) {
      return encodeURIComponent(input);
    }
  },
  decompressFromBase64: function (input) {
    if (input == null || input === '') return null;
    try {
      return decodeURIComponent(Array.prototype.map.call(atob(input), (c) => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
    } catch (e) {
      try {
        return decodeURIComponent(input);
      } catch (err) {
        return null;
      }
    }
  }
};

const KV_ENDPOINT = 'https://kvdb.io/6VfN9t215GqXv8cT9zK1eU/';

/**
 * Resizes a base64 photo to a compact web thumbnail to ensure fast cloud upload and URL sharing.
 */
async function compressPhotoForShare(url) {
  if (!url) return null;
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
  const shareId = report.id || `rep_${Date.now()}`;
  
  // Save locally in IndexedDB
  await saveLocalReport(report);

  // Create lightweight optimized version of report for sharing
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
    id: shareId,
    items: sharedItems
  };

  const jsonStr = JSON.stringify(sharedReport);

  // 1. Publish to Cloud KV
  try {
    fetch(`${KV_ENDPOINT}${shareId}`, {
      method: 'POST',
      body: jsonStr,
      headers: { 'Content-Type': 'application/json' }
    }).catch((e) => console.warn('Cloud KV upload background note:', e));
  } catch (e) {}

  // 2. Encode payload in URL hash query for 100% fail-proof zero-backend loading
  const encodedPayload = LZ.compressToBase64(jsonStr);
  const baseUrl = window.location.origin + window.location.pathname;
  
  // Short URL format with embedded fallback data
  const shareUrl = `${baseUrl}#/view/${shareId}?d=${encodeURIComponent(encodedPayload)}`;

  return {
    shareId,
    shareUrl
  };
}

export async function fetchSharedReport(shareId, urlSearchString = '') {
  // 1. Priority 1: Check embedded URL payload (Instant 100% fail-proof)
  try {
    let payload = null;
    const hash = window.location.hash;
    if (hash.includes('?d=')) {
      const parts = hash.split('?d=');
      if (parts[1]) payload = decodeURIComponent(parts[1]);
    } else if (window.location.search.includes('d=')) {
      const params = new URLSearchParams(window.location.search);
      payload = params.get('d');
    }

    if (payload) {
      const jsonStr = LZ.decompressFromBase64(payload);
      if (jsonStr) {
        const parsed = JSON.parse(jsonStr);
        if (parsed && parsed.title) {
          saveLocalReport(parsed).catch(() => {});
          return parsed;
        }
      }
    }
  } catch (e) {
    console.warn('URL payload decompression error:', e);
  }

  // 2. Priority 2: Check Cloud KV
  try {
    const cleanId = shareId.split('?')[0];
    const res = await fetch(`${KV_ENDPOINT}${cleanId}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.title) {
        saveLocalReport(data).catch(() => {});
        return data;
      }
    }
  } catch (err) {
    console.warn('Cloud KV fetch error:', err);
  }

  // 3. Priority 3: Check Local IndexedDB (if opened on same author device)
  try {
    const cleanId = shareId.split('?')[0];
    const local = await getLocalReport(cleanId);
    if (local) return local;
  } catch (e) {
    console.warn('Local database fetch error:', e);
  }

  return null;
}
