const API_BASE = '/api';

export async function fetchReports() {
  const res = await fetch(`${API_BASE}/reports`);
  if (!res.ok) throw new Error('Failed to fetch reports');
  const data = await res.json();
  return data.reports || [];
}

export async function fetchReport(id) {
  const res = await fetch(`${API_BASE}/reports/${id}`);
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
  const res = await fetch(`${API_BASE}/reports/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reportData)
  });
  if (!res.ok) throw new Error('Failed to save report');
  return await res.json();
}

export async function deleteReport(id) {
  const res = await fetch(`${API_BASE}/reports/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete report');
  return await res.json();
}

export async function duplicateReport(id) {
  const res = await fetch(`${API_BASE}/reports/${id}/duplicate`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error('Failed to duplicate report');
  return await res.json();
}

export async function uploadPhotoFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/upload-photo`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) throw new Error('Failed to upload photo');
  return await res.json();
}

export async function uploadPhotoBase64(base64String) {
  const formData = new FormData();
  formData.append('base64_data', base64String);
  const res = await fetch(`${API_BASE}/upload-photo`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) throw new Error('Failed to upload clipboard photo');
  return await res.json();
}

export function getExcelExportUrl(reportId) {
  return `${API_BASE}/reports/${reportId}/export/excel`;
}

export function getPdfExportUrl(reportId) {
  return `${API_BASE}/reports/${reportId}/export/pdf`;
}
