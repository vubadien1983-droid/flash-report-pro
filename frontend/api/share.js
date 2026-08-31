export default async function handler(req, res) {
  // Enable CORS
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

  // 1. POST: Publish a report
  if (req.method === 'POST') {
    try {
      const reportData = req.body;
      if (!reportData) {
        return res.status(400).json({ error: 'Missing report data' });
      }

      const jsonStr = typeof reportData === 'string' ? reportData : JSON.stringify(reportData);

      const params = new URLSearchParams();
      params.append('content', jsonStr);
      params.append('expiry_days', '365');
      params.append('syntax', 'json');

      const dpasteRes = await fetch('https://dpaste.com/api/v2/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'FlashReportApp/1.0'
        },
        body: params
      });

      if (!dpasteRes.ok) {
        const errText = await dpasteRes.text();
        throw new Error(`dpaste returned ${dpasteRes.status}: ${errText}`);
      }

      const pasteUrl = (await dpasteRes.text()).trim();
      const code = pasteUrl.split('/').filter(Boolean).pop();

      return res.status(200).json({
        id: code,
        url: `#/view/${code}`
      });
    } catch (err) {
      console.error('Server share publish error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // 2. GET: Fetch a shared report by id
  if (req.method === 'GET') {
    try {
      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ error: 'Missing id' });
      }

      const cleanId = String(id).split('?')[0].split('/')[0].trim();
      const rawRes = await fetch(`https://dpaste.com/${cleanId}.txt`, {
        headers: {
          'User-Agent': 'FlashReportApp/1.0',
          'Accept': 'text/plain'
        }
      });

      if (!rawRes.ok) {
        return res.status(404).json({ error: 'Report not found or expired' });
      }

      const text = await rawRes.text();
      const data = JSON.parse(text);
      return res.status(200).json(data);
    } catch (err) {
      console.error('Server share fetch error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}
