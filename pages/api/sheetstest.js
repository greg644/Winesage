export default async function handler(req, res) {
  try {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
    if (!raw) return res.status(200).json({ error: "No env var" });
    const parsed = JSON.parse(raw);
    res.status(200).json({ 
      ok: true, 
      email: parsed.client_email,
      has_key: !!parsed.private_key
    });
  } catch (e) {
    res.status(200).json({ error: "Parse failed: " + e.message, raw_start: (process.env.GOOGLE_SERVICE_ACCOUNT || "").substring(0, 50) });
  }
}
