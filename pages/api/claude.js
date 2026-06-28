export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limiting — only count new scans (flagged with isScanStart: true)
  const DAILY_LIMIT = 10;
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (kvUrl && kvToken && req.body.isScanStart) {
    try {
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
      const today = new Date().toISOString().slice(0, 10);
      const key = `rate:${ip}:${today}`;

      const getRes = await fetch(`${kvUrl}/get/${key}`, {
        headers: { Authorization: `Bearer ${kvToken}` }
      });
      const getData = await getRes.json();
      const count = parseInt(getData.result || '0', 10);

      if (count >= DAILY_LIMIT) {
        return res.status(429).json({
          error: 'rate_limited',
          message: `You have used your ${DAILY_LIMIT} free analyses today. Please come back tomorrow or upgrade for unlimited access.`
        });
      }

      await fetch(`${kvUrl}/set/${key}/${count + 1}/ex/86400`, {
        headers: { Authorization: `Bearer ${kvToken}` }
      });

    } catch (e) {
      console.error('Rate limit error:', e.message);
    }
  }

  // Strip isScanStart before forwarding to Anthropic
  const { isScanStart, ...body } = req.body;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
