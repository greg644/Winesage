import { useState, useRef } from "react";
import Head from "next/head";

async function callClaude(body) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error("API error: " + JSON.stringify(data.error));
  if (!data.content) throw new Error("No content. Response: " + JSON.stringify(data).substring(0, 200));
  return data;
}

function markupColor(pct) {
  if (pct == null) return "var(--text-dim)";
  if (pct > 200) return "var(--red)";
  if (pct > 120) return "var(--amber)";
  return "var(--green)";
}

function Stars({ n }) {
  return (
    <span style={{ color: "var(--gold)", letterSpacing: 2, fontSize: "0.85rem" }}>
      {"★".repeat(n)}{"☆".repeat(5 - n)}
    </span>
  );
}

export default function AskTrevor() {
  const [img64, setImg64] = useState(null);
  const [imgType, setImgType] = useState("image/jpeg");
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [wines, setWines] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef();
  const tableRef = useRef();

  function loadFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target.result;
      const base64 = dataUrl.split(",")[1];
      const mediaType = dataUrl.split(";")[0].split(":")[1] || "image/jpeg";
      setImg64(base64);
      setImgType(mediaType);
      setPreview(dataUrl);
      setWines(null); setAnalysis(null); setError(null);
    };
    reader.onerror = () => setError("Could not read file. Please try again.");
    reader.readAsDataURL(file);
  }

  async function analyse() {
    if (!img64) return;
    setBusy(true); setError(null); setWines(null); setAnalysis(null);
    setStatus("Reading wine list...");
    try {
      const d1 = await callClaude({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: imgType, data: img64 } },
            { type: "text", text: "Extract all wines from this wine list image. Return ONLY a JSON array, no markdown, no backticks. Each item: {\"name\":\"full wine name\",\"origin\":\"region, country\",\"price_glass\":null,\"price_bottle\":null,\"category\":\"red/white/rose/sparkling\"}" }
          ]
        }]
      });

      const t1 = d1.content.find(b => b.type === "text")?.text || "";
      const i1s = t1.indexOf("[");
      const i1e = t1.lastIndexOf("]");
      if (i1s === -1 || i1e === -1) throw new Error("Could not read wines from image. Got: " + t1.substring(0, 100));
      const wList = JSON.parse(t1.substring(i1s, i1e + 1));
      if (!wList.length) throw new Error("No wines found in image.");
      setWines(wList);
      setStatus("Found " + wList.length + " wines - analysing quality and value...");

      const wineList = wList.map((w, i) => {
        const price = w.price_bottle ? "GBP" + w.price_bottle : w.price_glass ? "GBP" + w.price_glass + "/glass" : "unknown";
        const name = (w.name || "").replace(/[^\x20-\x7E]/g, "");
        const origin = (w.origin || "").replace(/[^\x20-\x7E]/g, "");
        return (i + 1) + ". " + name + " (" + origin + ") menu price: " + price;
      }).join("\n");

      const d2 = await callClaude({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4000,
        messages: [{
          role: "user",
          content: "For each wine in the list below, estimate the typical UK retail bottle price in GBP and rate the quality from 1 to 5 stars. Return a JSON array only, no explanation. Each object must have these fields: index (number), retail_price (number or null), quality_stars (integer 1 to 5), quality_note (short string), markup_pct (integer or null). Wines: " + wineList
        }]
      });

      const t2 = d2.content.find(b => b.type === "text")?.text || "";
      const i2s = t2.indexOf("[");
      const i2e = t2.lastIndexOf("]");
      if (i2s === -1 || i2e === -1) throw new Error("Analysis failed. Got: " + t2.substring(0, 200));
      setAnalysis(JSON.parse(t2.substring(i2s, i2e + 1)));
      setStatus(null);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  function copyTable() {
    if (!tableRef.current) return;
    const range = document.createRange();
    range.selectNode(tableRef.current);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.execCommand("copy");
    window.getSelection().removeAllRanges();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function reset() {
    setWines(null); setAnalysis(null);
    setImg64(null); setPreview(null); setError(null);
  }

  let bestIdx = null;
  if (analysis) {
    let lo = Infinity;
    analysis.forEach(a => {
      if (a.markup_pct != null && a.markup_pct < lo) { lo = a.markup_pct; bestIdx = a.index; }
    });
  }

  const btnStyle = {
    background: "none", border: "1px solid var(--border)",
    color: "var(--text-dim)", fontFamily: "Montserrat, sans-serif",
    fontSize: "0.62rem", letterSpacing: "0.18em",
    textTransform: "uppercase", padding: "10px 18px",
    cursor: "pointer", borderRadius: 2, transition: "all 0.2s",
  };

  return (
    <>
      <Head>
        <title>Ask Trevor</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Your personal sommelier. Photograph any wine list for instant quality and value analysis." />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Ask Trevor" />
        <meta name="theme-color" content="#120e08" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-512.png" />
      </Head>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "40px 20px" }}>

        <header style={{ textAlign: "center", marginBottom: 48, borderTop: "2px solid #c9a84c", paddingTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <span style={{ fontSize: "0.55rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "#8a6e2e" }}>Est. 2025</span>
            <span style={{ fontSize: "0.55rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "#8a6e2e" }}>London</span>
          </div>
          <div style={{ borderBottom: "1px solid #2a2010", marginBottom: 16 }} />
          <h1 style={{
            fontFamily: "Playfair Display, Georgia, serif",
            fontSize: "clamp(2.6rem, 7vw, 4rem)",
            fontWeight: 400,
            fontStyle: "italic",
            color: "#e2cfa0",
            letterSpacing: "0.02em",
            lineHeight: 1,
          }}>
            Ask Trevor
          </h1>
          <div style={{ borderTop: "1px solid #2a2010", marginTop: 16, paddingTop: 12 }}>
            <p style={{ fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "#7a6440" }}>
              Quality &amp; Value Intelligence
            </p>
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--text-mid)", marginTop: 20, maxWidth: 420, margin: "20px auto 0", lineHeight: 1.8 }}>
            Photograph any wine list. Instantly see quality ratings and how much the restaurant is marking up each bottle over UK retail.
          </p>
        </header>

        <div
          onClick={() => fileRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); loadFile(e.dataTransfer.files[0]); }}
          style={{
            maxWidth: 600, margin: "0 auto 24px",
            border: "1px dashed " + (dragOver ? "var(--gold-dim)" : "var(--border)"),
            background: dragOver ? "var(--surface2)" : "var(--surface)",
            padding: preview ? "16px" : "52px 32px",
            textAlign: "center", cursor: "pointer",
            transition: "all 0.2s", borderRadius: 2,
          }}
        >
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={e => loadFile(e.target.files[0])} />
          {preview ? (
            <div>
              <img src={preview} alt="wine list" style={{ maxWidth: "100%", maxHeight: 240, objectFit: "contain", display: "block", margin: "0 auto 12px" }} />
              <span style={{ fontSize: "0.6rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--text-dim)" }}>
                Tap to change photo
              </span>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: "2.4rem", marginBottom: 14, opacity: 0.4 }}>🍷</div>
              <div style={{ fontFamily: "Playfair Display, Georgia, serif", fontStyle: "italic", fontSize: "1.3rem", color: "var(--text-mid)", marginBottom: 6 }}>
                Drop a wine list photo here
              </div>
              <div style={{ fontSize: "0.62rem", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text-dim)" }}>
                or tap to browse
              </div>
            </div>
          )}
        </div>

        {img64 && !busy && (
          <div style={{ maxWidth: 600, margin: "0 auto 40px" }}>
            <button onClick={analyse} style={{
              width: "100%", background: "none",
              border: "1px solid var(--gold-dim)", color: "var(--gold)",
              fontFamily: "Montserrat, sans-serif",
              fontSize: "0.68rem", letterSpacing: "0.22em",
              textTransform: "uppercase", padding: 16,
              cursor: "pointer", borderRadius: 2, transition: "all 0.2s",
            }}>
              Ask Trevor
            </button>
          </div>
        )}

        {status && (
          <div style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: 32 }}>
            <span style={{
              display: "inline-block", width: 12, height: 12,
              border: "2px solid var(--border)", borderTopColor: "var(--gold)",
              borderRadius: "50%", animation: "spin 0.8s linear infinite",
              marginRight: 10, verticalAlign: "middle",
            }} />
            {status}
          </div>
        )}

        {error && (
          <div style={{
            maxWidth: 600, margin: "0 auto 32px",
            background: "#1e0e0a", border: "1px solid #5a2a1e",
            color: "#c07060", padding: "14px 18px",
            fontSize: "0.76rem", lineHeight: 1.6, borderRadius: 2,
          }}>
            {error}
          </div>
        )}

        {wines && analysis && (
          <div style={{ animation: "fadeIn 0.4s ease" }}>
            <div style={{
              fontSize: "0.6rem", letterSpacing: "0.24em",
              textTransform: "uppercase", color: "var(--text-dim)",
              marginBottom: 16, paddingBottom: 10,
              borderBottom: "1px solid var(--border)",
            }}>
              Quality &amp; Value Analysis — {wines.length} wines
            </div>

            <div style={{ overflowX: "auto", marginBottom: 20 }}>
              <table ref={tableRef} style={{
                width: "100%", borderCollapse: "collapse",
                background: "var(--surface)", border: "1px solid var(--border)",
                fontSize: "0.78rem",
              }}>
                <thead>
                  <tr style={{ background: "var(--surface2)" }}>
                    {["Wine", "Menu", "Est. Retail", "Markup", "Quality", "Note"].map(h => (
                      <th key={h} style={{
                        padding: "12px 14px", textAlign: "left",
                        fontSize: "0.56rem", letterSpacing: "0.18em",
                        textTransform: "uppercase", color: "var(--text-dim)",
                        borderBottom: "1px solid var(--border)",
                        fontWeight: 600, whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wines.map((w, i) => {
                    const a = analysis.find(x => x.index === i + 1) || {};
                    const isBest = (i + 1) === bestIdx;
                    const menuPrice = w.price_bottle ? "£" + w.price_bottle : w.price_glass ? "£" + w.price_glass + "/glass" : "—";
                    const retail = a.retail_price ? "~£" + a.retail_price : "—";
                    const markup = a.markup_pct != null ? "~" + a.markup_pct + "%" : "—";
                    return (
                      <tr key={i} style={{ background: isBest ? "#1f1a09" : "transparent" }}>
                        <td style={{ padding: "12px 14px", borderBottom: "1px solid var(--surface2)", minWidth: 180 }}>
                          <span style={{
                            fontFamily: "Playfair Display, Georgia, serif",
                            fontSize: "0.98rem",
                            color: isBest ? "var(--gold)" : "var(--text)",
                            fontWeight: 600, display: "block",
                          }}>
                            {w.name}
                            {isBest && (
                              <span style={{
                                fontSize: "0.5rem", letterSpacing: "0.1em",
                                textTransform: "uppercase",
                                background: "#c9a84c18", color: "var(--gold)",
                                border: "1px solid #c9a84c44",
                                padding: "2px 5px", marginLeft: 8,
                                verticalAlign: "middle",
                              }}>Best Value</span>
                            )}
                          </span>
                          <span style={{ fontSize: "0.67rem", color: "var(--text-dim)" }}>{w.origin}</span>
                        </td>
                        <td style={{ padding: "12px 14px", borderBottom: "1px solid var(--surface2)", color: "var(--text-mid)", whiteSpace: "nowrap" }}>{menuPrice}</td>
                        <td style={{ padding: "12px 14px", borderBottom: "1px solid var(--surface2)", color: "var(--text-mid)", whiteSpace: "nowrap" }}>{retail}</td>
                        <td style={{ padding: "12px 14px", borderBottom: "1px solid var(--surface2)", color: markupColor(a.markup_pct), fontWeight: 600, whiteSpace: "nowrap" }}>{markup}</td>
                        <td style={{ padding: "12px 14px", borderBottom: "1px solid var(--surface2)", whiteSpace: "nowrap" }}>
                          {a.quality_stars ? <Stars n={a.quality_stars} /> : "—"}
                        </td>
                        <td style={{ padding: "12px 14px", borderBottom: "1px solid var(--surface2)", fontSize: "0.7rem", color: "var(--text-dim)", minWidth: 140 }}>
                          {a.quality_note || ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button onClick={copyTable} style={btnStyle}>
                {copied ? "Copied!" : "Copy table for email"}
              </button>
              <button onClick={reset} style={btnStyle}>
                Analyse another list
              </button>
            </div>
          </div>
        )}

        <footer style={{
          marginTop: 80, paddingTop: 24,
          borderTop: "1px solid var(--border)",
          textAlign: "center",
          fontSize: "0.6rem", letterSpacing: "0.12em",
          color: "var(--text-dim)", textTransform: "uppercase",
        }}>
          Ask Trevor · Powered by Claude AI
        </footer>

      </main>
    </>
  );
}
