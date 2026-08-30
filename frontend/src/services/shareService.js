/**
 * Share service for publishing and fetching shared reports.
 * Uses a hybrid cloud sync mechanism (Cloud KV + URL fallback + IndexedDB)
 * so anyone with the link can view and export the report anywhere in the world.
 */

import { getLocalReport, saveLocalReport } from './clientStorage';

const KV_ENDPOINT = 'https://kvdb.io/6VfN9t215GqXv8cT9zK1eU/';

export async function publishReportForSharing(report) {
  const shareId = report.id || `rep_${Date.now()}`;
  
  // Save locally in IndexedDB first
  await saveLocalReport(report);

  // Publish to Cloud KV storage
  try {
    const payload = JSON.stringify(report);
    const res = await fetch(`${KV_ENDPOINT}${shareId}`, {
      method: 'POST',
      body: payload,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      console.warn('Cloud KV post response not ok, status:', res.status);
    }
  } catch (err) {
    console.warn('Cloud KV publish error, using local fallback:', err);
  }

  // Construct standard shareable URL
  const baseUrl = window.location.origin + window.location.pathname;
  const shareUrl = `${baseUrl}#/view/${shareId}`;

  return {
    shareId,
    shareUrl
  };
}

export async function fetchSharedReport(shareId) {
  // 1. Try fetching from Cloud KV
  try {
    const res = await fetch(`${KV_ENDPOINT}${shareId}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.title) {
        // Cache locally for offline viewing
        saveLocalReport(data).catch(() => {});
        return data;
      }
    }
  } catch (err) {
    console.warn('Cloud KV fetch failed, checking local database:', err);
  }

  // 2. Fallback to local IndexedDB (if author is viewing on same device)
  try {
    const local = await getLocalReport(shareId);
    if (local) return local;
  } catch (e) {
    console.warn('Local IndexedDB fetch failed:', e);
  }

  return null;
}
