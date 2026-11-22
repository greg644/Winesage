// Ask Trevor log relay: validates rows from the page, then forwards them to the Google Apps Script.
export const config = { api: { bodyParser: { sizeLimit: '100kb' } } };

const MAX_ROWS = 100;
const NUM_COLS = 13;
const DAILY_WRITE_LIMIT = 30; // log writes per IP per day (one per scan plus one per chosen wine)

const DEFAULT_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbw7wDJKuS-eJOBYTZnoD-4onOYrA1KTpgS6MxZMfe9qLGROdSuLwcN0Qk6LHoqgjWt_AA/exec';

const CATEGORIES = new Set(['red', 'white', 'rose', 'sparkling']);

function getIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

// Atomic daily counter in Upstash KV. Returns the new count, or null if KV is unavailable.
async function bump(kvUrl, kvToken, key) {
  const headers = { Authorization: `Bearer ${kvToken}` };
  const r = await fetch(`${kvUrl}/incr/${encodeURIComponent(key)}`, { headers });
  const d = await r.json();
  const n = parseInt(d.result, 10);
  if (Number.isNaN(n)) return null;
  if (n === 1) await fetch(`${kvUrl}/expire/${encodeURIComponent(key)}/86400`, { headers });
  return n;
}

// Text that Sheets could read as a formula is stored as plain text.
function plainText(v, max) {
  const t = String(v).replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').trim().slice(0, max);
  return /^[=@]/.test(t) || /^[+\-](?![\d.])/.test(t) ? "'" + t : t;
}

function num(v) {
  if (v === '' || v === null || v === undefined) return '';
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[£$€,\s]/g, ''));
  return Number.isFinite(n) && n >= 0 && n < 100000 ? n : '';
}

// Returns a clean 13-cell row, or null if the row is not a plausible log row.
function cleanRow(r) {
  if (!Array.isArray(r) || r.length > NUM_COLS) return null;
  const c = r.concat(Array(NUM_COLS - r.length).fill(''));
  if (c.some((x) => x !== null && typeof x === 'object')) return null;
  const s = (x) => (x === null || x === undefined ? '' : x);

  const date = String(s(c[0])).trim();
  if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) return null;
  const wine = String(s(c[2])).trim();
  if (!wine) return null;

  const markup = String(s(c[7])).trim();
  const category = String(s(c[4])).trim().toLowerCase();
  return [
    date,
    plainText(s(c[1]) || 'Unknown', 60),
    plainText(wine, 200),
    plainText(s(c[3]), 100),
    CATEGORIES.has(category) ? category : '',
    num(c[5]),
    num(c[6]),
    /^-?\d{1,6}%$/.test(markup) ? markup : '',
    num(c[8]),
    plainText(s(c[9]), 150),
    String(s(c[10])).trim() === 'Yes' ? 'Yes' : '',
    String(s(c[11])).trim() === 'Yes' ? 'Yes' : '',
    String(s(c[12])).trim() === 'Yes' ? 'Yes' : '',
  ];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const input = req.body;
  if (!input || typeof input !== 'object' || !Array.isArray(input.rows)) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  if (input.rows.length === 0 || input.rows.length > MAX_ROWS) {
    return res.status(400).json({ error: 'Invalid number of rows' });
  }
  const rows = input.rows.map(cleanRow);
  if (rows.some((r) => r === null)) {
    return res.status(400).json({ error: 'Invalid row' });
  }

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (kvUrl && kvToken) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const n = await bump(kvUrl, kvToken, `rate:sheets:${getIp(req)}:${today}`);
      if (n !== null && n > DAILY_WRITE_LIMIT) {
        return res.status(429).json({ error: 'rate_limited' });
      }
    } catch (e) {
      console.error('Sheets rate limit error:', e.message); // fails open, as in claude.js
    }
  }

  try {
    const payload = { rows };
    // Optional shared secret: if SHEETS_TOKEN is set here, the Apps Script can require it.
    if (process.env.SHEETS_TOKEN) payload.token = process.env.SHEETS_TOKEN;

    const response = await fetch(process.env.GOOGLE_SCRIPT_URL || DEFAULT_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(502).json({ error: 'Bad response from log' });
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error('Sheets forward error:', err.message);
    return res.status(502).json({ error: 'Log unavailable' });
  }
}
