export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limiting via Upstash KV
  const DAILY_LIMIT = 10;
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (kvUrl && kvToken) {
    try {
      // Get IP address
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const key = `rate:${ip}:${today}`;

      // Get current count
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

      // Increment count and set 24hr expiry
      await fetch(`${kvUrl}/set/${key}/${count + 1}/ex/86400`, {
        headers: { Authorization: `Bearer ${kvToken}` }
      });

    } catch (e) {
      // If rate limiting fails, allow the request through
      console.error('Rate limit error:', e.message);
    }
  }

  // Forward to Anthropic
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
