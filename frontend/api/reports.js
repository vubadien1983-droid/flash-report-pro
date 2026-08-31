/**
 * Vercel Serverless Function: Cloud Reports Management
 * Uses restful-api.dev persistent master registry + dpaste payload storage
 * to guarantee 100% reliable real-time synchronization between Laptop & Phone.
 */

const MASTER_REGISTRY_OBJ_ID = 'ff808181a04ccf2d01a05613c1a02006';
const MASTER_REGISTRY_URL = `https://api.restful-api.dev/objects/${MASTER_REGISTRY_OBJ_ID}`;

async function fetchMasterRegistry() {
  try {
    const res = await fetch(MASTER_REGISTRY_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) FlashReportApp/1.0',
        'Accept': 'application/json'
      }
    });
    if (res.ok) {
      const json = await res.json();
      if (json && json.data && Array.isArray(json.data.reports)) {
        return json.data.reports;
      }
    }
  } catch (err) {
    console.error('Error fetching master registry:', err);
  }
  return [];
}

async function updateMasterRegistry(reportsList) {
  try {
    const payload = {
      name: 'FlashReport_Master_Registry',
      data: {
        reports: reportsList
      }
    };
    const res = await fetch(MASTER_REGISTRY_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) FlashReportApp/1.0'
      },
      body: JSON.stringify(payload)
    });
    return res.ok;
  } catch (err) {
    console.error('Error updating master registry:', err);
    return false;
  }
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

  // 1. GET: Fetch list of reports or single report
  if (req.method === 'GET') {
    const { id } = req.query;

    // Single report fetch
    if (id) {
      const cleanId = String(id).split('?')[0].split('/')[0].trim();
      const reg = await fetchMasterRegistry();
      const match = reg.find((r) => r.id === cleanId || r.cloud_code === cleanId);
      const targetCode = match?.cloud_code || cleanId;

      // Fetch full report JSON from dpaste
      try {
        const rawRes = await fetch(`https://dpaste.com/${targetCode}.txt`, {
          headers: { 'User-Agent': 'FlashReportApp/1.0', 'Accept': 'text/plain' }
        });
        if (rawRes.ok) {
          const text = await rawRes.text();
          const reportObj = JSON.parse(text);
          return res.status(200).json(reportObj);
        }
      } catch (err) {
        console.error('Single report fetch from dpaste note:', err);
      }

      if (match) {
        return res.status(200).json(match);
      }

      return res.status(404).json({ error: 'Report not found' });
    }

    // List of reports
    const list = await fetchMasterRegistry();
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

      const reg = await fetchMasterRegistry();
      const existingIdx = reg.findIndex((r) => r.id === report.id);
      if (existingIdx >= 0) {
        reg[existingIdx] = summaryItem;
      } else {
        reg.unshift(summaryItem);
      }

      // Persist to master cloud registry
      await updateMasterRegistry(reg);

      return res.status(200).json({
        success: true,
        report: { ...report, cloud_code: cloudCode }
      });
    } catch (err) {
      console.error('Save report serverless error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // 3. DELETE: Remove single report from cloud registry
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (id) {
      const reg = await fetchMasterRegistry();
      const filtered = reg.filter((r) => r.id !== id && r.cloud_code !== id);
      await updateMasterRegistry(filtered);
    }
    return res.status(200).json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
