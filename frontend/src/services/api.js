const API_BASE = '/api';

export async function fetchReports() {
  const res = await fetch(`${API_BASE}/reports`);
  if (!res.ok) throw new Error('Failed to fetch reports');
  const data = await res.json();
  return data.reports || [];
}

export async function fetchReport(id) {
  const res = await fetch(`${API_BASE}/reports?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error('Failed to fetch report');
  return await res.json();
}

export async function createReport(payload = {}) {
  const res = await fetch(`${API_BASE}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Failed to create report');
  return await res.json();
}

export async function saveReport(id, reportData) {
  const res = await fetch(`${API_BASE}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...reportData, id })
  });
  if (!res.ok) throw new Error('Failed to save report');
  return await res.json();
}

export async function deleteReport(id) {
  const res = await fetch(`${API_BASE}/reports?id=${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete report');
  return await res.json();
}

export async function duplicateReport(id) {
  const report = await fetchReport(id);
  const newId = `rep_${Date.now()}`;
  const dup = {
    ...report,
    id: newId,
    title: `${report.title || 'Report'} (Copy)`,
    cloud_code: null
  };
  await saveReport(newId, dup);
  return dup;
}

export async function uploadPhotoFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve({ url: reader.result });
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadPhotoBase64(base64) {
  return { url: base64 };
}

