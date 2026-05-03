const crypto = require('crypto');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) return res.status(500).json({ error: 'No GOOGLE_SHEET_ID' });

    const jwt = createJWT(credentials);

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    const tokenText = await tokenRes.text();
    let tokenData;
    try {
      tokenData = JSON.parse(tokenText);
    } catch(e) {
      return res.status(500).json({ error: 'Token not JSON', status: tokenRes.status, raw: tokenText.substring(0, 500) });
    }
    if (!tokenData.access_token) return res.status(500).json({ error: 'No access token', details: tokenData });

    const { rows } = req.body;
    const appendRes = await fetch(
      'https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '/values/Sheet1!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokenData.access_token },
        body: JSON.stringify({ values: rows }),
      }
    );

    const result = await appendRes.json();
    if (result.error) return res.status(500).json({ error: 'Sheets API error', details: result.error });
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function createJWT(credentials) {
  const b64url = (str) => Buffer.from(str).toString('base64url');

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));

  const unsigned = header + '.' + payload;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  const signature = sign.sign(credentials.private_key, 'base64url');

  return unsigned + '.' + signature;
}
