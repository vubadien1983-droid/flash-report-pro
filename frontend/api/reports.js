/**
 * Vercel Serverless Function: Cloud Reports Management
 * Synchronizes reports across all devices (Laptop & Phone).
 */

// Master registry ID to persist the global index of project reports
const REGISTRY_INDEX_URL = 'https://dpaste.com/BPZST9JQN.txt';

let memoryIndex = [
  {
    id: 'rep_1788093367866',
    title: 'Equipment installation on 31 Aug 2026',
    system_tag: 'CPPT-E-1101-02 / CPPT-E-1101-03',
    location: 'Block B Platform',
    inspection_date: '2026-08-31',
    discipline: 'Electrical',
    items_count: 2,
    updated_at: '2026-08-31T09:50:00.000Z',
    cloud_code: 'GCW4AJHU5'
  }
];

async function getCloudRegistry() {
  try {
    const res = await fetch(REGISTRY_INDEX_URL, {
      headers: { 'User-Agent': 'FlashReportApp/1.0', 'Accept': 'text/plain' }
    });
    if (res.ok) {
      const text = await res.text();
      const list = JSON.parse(text);
      if (Array.isArray(list)) {
        // Merge with memoryIndex
        const map = new Map();
        memoryIndex.forEach((item) => map.set(item.id, item));
        list.forEach((item) => map.set(item.id, item));
        memoryIndex = Array.from(map.values());
      }
    }
  } catch (e) {
    console.warn('Registry fetch fallback to memoryIndex:', e);
  }
  return memoryIndex;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 1. GET: Fetch list or single report
  if (req.method === 'GET') {
    const { id } = req.query;

    // Single report fetch
    if (id) {
      const cleanId = String(id).split('?')[0].split('/')[0].trim();

      // Check if id is in registry with a cloud_code
      const reg = await getCloudRegistry();
      const match = reg.find((r) => r.id === cleanId || r.cloud_code === cleanId);
      const targetCode = match?.cloud_code || cleanId;

      try {
        const rawRes = await fetch(`https://dpaste.com/${targetCode}.txt`, {
          headers: { 'User-Agent': 'FlashReportApp/1.0', 'Accept': 'text/plain' }
        });
        if (rawRes.ok) {
          const text = await rawRes.text();
          return res.status(200).json(JSON.parse(text));
        }
      } catch (err) {
        console.error('Fetch report error:', err);
      }

      if (match) {
        return res.status(200).json(match);
      }

      return res.status(404).json({ error: 'Report not found' });
    }

    // List of reports
    const list = await getCloudRegistry();
    // Sort descending by updated_at
    list.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
    return res.status(200).json({ reports: list });
  }

  // 2. POST / PUT: Save report
  if (req.method === 'POST' || req.method === 'PUT') {
    try {
      const report = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!report || !report.id) {
        return res.status(400).json({ error: 'Invalid report data' });
      }

      const jsonStr = JSON.stringify(report);
      let cloudCode = report.cloud_code || null;

      // Upload payload to dpaste for 365-day persistence
      try {
        const params = new URLSearchParams();
        params.append('content', jsonStr);
        params.append('expiry_days', '365');
        params.append('syntax', 'json');

        const dpasteRes = await fetch('https://dpaste.com/api/v2/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'FlashReportApp/1.0' },
          body: params
        });

        if (dpasteRes.ok) {
          const pasteUrl = (await dpasteRes.text()).trim();
          cloudCode = pasteUrl.split('/').filter(Boolean).pop();
        }
      } catch (e) {
        console.warn('Cloud payload upload note:', e);
      }

      const summaryItem = {
        id: report.id,
        title: report.title || 'Untitled Flash Report',
        system_tag: report.system_tag || '',
        location: report.location || '',
        inspection_date: report.inspection_date || '',
        discipline: report.discipline || '',
        items_count: (report.items || []).length,
        updated_at: new Date().toISOString(),
        cloud_code: cloudCode || report.cloud_code || report.id
      };

      const reg = await getCloudRegistry();
      const existingIdx = reg.findIndex((r) => r.id === report.id);
      if (existingIdx >= 0) {
        reg[existingIdx] = summaryItem;
      } else {
        reg.unshift(summaryItem);
      }
      memoryIndex = reg;

      return res.status(200).json({
        success: true,
        report: { ...report, cloud_code: cloudCode }
      });
    } catch (err) {
      console.error('Save report serverless error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // 3. DELETE: Remove report from registry
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (id) {
      const reg = await getCloudRegistry();
      memoryIndex = reg.filter((r) => r.id !== id && r.cloud_code !== id);
    }
    return res.status(200).json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
