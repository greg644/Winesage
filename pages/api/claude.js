// pages/api/claude.js
// Proxy between the Ask Trevor front end and the Anthropic API.
// The caller is never trusted: model, tools, token limits and request volume
// are all decided here, on the server.

// ---- Limits you can tune -------------------------------------------------
const DAILY_SCAN_LIMIT = 10;        // new wine-list scans (requests containing an image) per IP per day
const DAILY_SEARCH_LIMIT = 80;      // requests that use web search, per IP per day (a scan makes up to ~4)
const DAILY_REQUEST_LIMIT = 250;    // all requests (chat included), per IP per day
const MAX_TOKENS_CAP = 4000;        // upper bound on max_tokens for any request
const WEB_SEARCH_MAX_USES = 4;      // hard cap on searches inside one API request (the app sends one request per chunk of ~14 wines)
const MAX_MESSAGES = 40;            // sanity cap on conversation length

// Only these models can be called through the proxy.
const ALLOWED_MODELS = new Set([
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
]);

// Only these fields are forwarded to Anthropic. Anything else is dropped.
const ALLOWED_FIELDS = ['model', 'max_tokens', 'messages', 'system'];

// Only retail and critic sites. Edit this list if you want to widen the search.
const SEARCH_ALLOWED_DOMAINS = [
  'waitrose.com',
  'majestic.co.uk',
  'bbr.com',
  'nakedwines.com',
  'tesco.com',
  'sainsburys.co.uk',
  'laithwaites.co.uk',
  'thewinesociety.com',
  'virginwines.co.uk',
  'decanter.com',
  'winespectator.com',
  'robertparker.com',
];
// --------------------------------------------------------------------------

function getIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function hasImage(messages) {
  return messages.some(
    (m) => Array.isArray(m.content) && m.content.some((b) => b && b.type === 'image')
  );
}

// Atomic daily counter in Upstash KV. Returns the new count, or null if KV is unavailable.
async function bump(kvUrl, kvToken, key) {
  const headers = { Authorization: `Bearer ${kvToken}` };
  const r = await fetch(`${kvUrl}/incr/${encodeURIComponent(key)}`, { headers });
  const d = await r.json();
  const n = parseInt(d.result, 10);
  if (Number.isNaN(n)) return null;
  if (n === 1) {
    await fetch(`${kvUrl}/expire/${encodeURIComponent(key)}/86400`, { headers });
  }
  return n;
}

function reject(res, status, error, message) {
  return res.status(status).json({ error, message });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const input = req.body;
  if (!input || typeof input !== 'object') {
    return reject(res, 400, 'bad_request', 'Invalid request body.');
  }

  // ---- Validate -----------------------------------------------------------
  if (!ALLOWED_MODELS.has(input.model)) {
    return reject(res, 400, 'bad_request', 'Model not allowed.');
  }
  if (!Array.isArray(input.messages) || input.messages.length === 0 || input.messages.length > MAX_MESSAGES) {
    return reject(res, 400, 'bad_request', 'Invalid messages.');
  }

  // ---- Build the body we actually send -----------------------------------
  const body = {};
  for (const f of ALLOWED_FIELDS) {
    if (input[f] !== undefined) body[f] = input[f];
  }
  body.max_tokens = Math.min(parseInt(input.max_tokens, 10) || 1000, MAX_TOKENS_CAP);

  // The only tool allowed is web search, and its settings are set here, not by the caller.
  let usesSearch = false;
  if (Array.isArray(input.tools) && input.tools.length > 0) {
    const wantsSearch = input.tools.every((t) => t && t.name === 'web_search');
    if (!wantsSearch) {
      return reject(res, 400, 'bad_request', 'Tool not allowed.');
    }
    usesSearch = true;
    body.tools = [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: WEB_SEARCH_MAX_USES,
        allowed_domains: SEARCH_ALLOWED_DOMAINS,
      },
    ];
  }

  // ---- Rate limits (decided by what the request contains, not by a client flag) ----
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (kvUrl && kvToken) {
    try {
      const ip = getIp(req);
      const today = new Date().toISOString().slice(0, 10);

      const total = await bump(kvUrl, kvToken, `rate:all:${ip}:${today}`);
      if (total !== null && total > DAILY_REQUEST_LIMIT) {
        return reject(res, 429, 'rate_limited', 'You have reached today\'s usage limit. Please come back tomorrow.');
      }

      if (usesSearch) {
        const n = await bump(kvUrl, kvToken, `rate:search:${ip}:${today}`);
        if (n !== null && n > DAILY_SEARCH_LIMIT) {
          return reject(res, 429, 'rate_limited', 'You have reached today\'s usage limit. Please come back tomorrow.');
        }
      }

      if (hasImage(input.messages)) {
        // Same key as the old limiter so today's counts carry over.
        const n = await bump(kvUrl, kvToken, `rate:${ip}:${today}`);
        if (n !== null && n > DAILY_SCAN_LIMIT) {
          return reject(
            res,
            429,
            'rate_limited',
            `You have used your ${DAILY_SCAN_LIMIT} free analyses today. Please come back tomorrow or upgrade for unlimited access.`
          );
        }
      }
    } catch (e) {
      // If KV is down the app keeps working, but limits are not enforced.
      console.error('Rate limit error:', e.message);
    }
  }

  // ---- Forward ------------------------------------------------------------
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) res.setHeader('retry-after', retryAfter);
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
