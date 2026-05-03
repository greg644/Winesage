import { useState, useRef, useEffect } from "react";
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

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function Stars({ count, max = 5 }) {
  return (
    <span style={{ display: "inline-flex", gap: 2 }}>
      {Array.from({ length: max }).map((_, i) => (
        <svg key={i} width={13} height={13} viewBox="0 0 24 24"
          fill={i < count ? "#C9A84C" : "none"} stroke="#C9A84C" strokeWidth="1.5">
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
        </svg>
      ))}
    </span>
  );
}

function MarkupBadge({ pct }) {
  const color = pct == null ? "#5a4f3a" : pct > 220 ? "#E05C5C" : pct > 150 ? "#C9A84C" : "#6BAE75";
  return <span style={{ color, fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}>{pct != null ? "~" + pct + "%" : "-"}</span>;
}

export default function AskTrevor() {
  const [phase, setPhase] = useState("upload");
  const [img64, setImg64] = useState(null);
  const [imgType, setImgType] = useState("image/jpeg");
  const [preview, setPreview] = useState(null);
  const [analysing, setAnalysing] = useState(false);
  const [analyseStatus, setAnalyseStatus] = useState(null);
  const [wines, setWines] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [activeTab, setActiveTab] = useState("list");
  const [filter, setFilter] = useState("All");
  const [sortBy, setSortBy] = useState("markup");
  const [selectedWine, setSelectedWine] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();
  const chatEndRef = useRef();
  const wineContextRef = useRef("");

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function loadFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target.result;
      setImg64(dataUrl.split(",")[1]);
      setImgType(dataUrl.split(";")[0].split(":")[1] || "image/jpeg");
      setPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  async function analyse() {
    if (!img64) return;
    setAnalysing(true);
    setAnalyseStatus("Reading wine list...");
    try {
      const d1 = await callClaude({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: imgType, data: img64 } },
            { type: "text", text: "Extract all wines from this wine list image. Return ONLY a JSON array, no markdown. Each item: {\"name\":\"full wine name\",\"origin\":\"region, country\",\"price_glass\":null,\"price_bottle\":null,\"category\":\"red/white/rose/sparkling\"}" }
          ]
        }]
      });

      const t1 = d1.content.find(b => b.type === "text")?.text || "";
      const i1s = t1.indexOf("[");
      const i1e = t1.lastIndexOf("]");
      if (i1s === -1) throw new Error("Could not read wines from image. Try a clearer photo.");
      const wList = JSON.parse(t1.substring(i1s, i1e + 1));
      if (!wList.length) throw new Error("No wines found in image.");
      setWines(wList);
      setAnalyseStatus("Found " + wList.length + " wines - researching prices...");

      const wineList = wList.map((w, i) => {
        const price = w.price_bottle ? "GBP" + w.price_bottle : w.price_glass ? "GBP" + w.price_glass + "/glass" : "unknown";
        return (i + 1) + ". " + (w.name || "").replace(/[^\x20-\x7E]/g, "") + " (" + (w.origin || "").replace(/[^\x20-\x7E]/g, "") + ") menu price: " + price;
      }).join("\n");

      const d2 = await callClaude({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4000,
        messages: [{
          role: "user",
          content: "For each wine below, estimate UK retail price and rate quality 1-5. Return JSON array only: [{\"index\":1,\"retail_price\":25,\"quality_stars\":4,\"quality_note\":\"short phrase\",\"markup_pct\":120}]\n\nWines:\n" + wineList
        }]
      });

      const t2 = d2.content.find(b => b.type === "text")?.text || "";
      const i2s = t2.indexOf("[");
      const i2e = t2.lastIndexOf("]");
      if (i2s === -1) throw new Error("Analysis failed. Please try again.");
      const analysisData = JSON.parse(t2.substring(i2s, i2e + 1));
      setAnalysis(analysisData);

      const ctx = wList.map((w, i) => {
        const a = analysisData.find(x => x.index === i + 1) || {};
        const price = w.price_bottle ? "GBP" + w.price_bottle : w.price_glass ? "GBP" + w.price_glass + "/glass" : "unknown";
        return w.name + " (" + w.origin + "): Menu " + price + ", Est retail ~GBP" + (a.retail_price || "unknown") + ", Markup ~" + (a.markup_pct || "?") + "%, Quality " + (a.quality_stars || "?") + "/5. " + (a.quality_note || "");
      }).join("\n");
      wineContextRef.current = ctx;

      // Sweet Spot for opening message
      let ssIdx = null, ssScore = -Infinity;
      wList.forEach((w, i) => {
        const a = analysisData.find(x => x.index === i + 1) || {};
        const price = w.price_bottle || w.price_glass;
        const markup = a.markup_pct || (a.retail_price && price ? Math.round(((price - a.retail_price) / a.retail_price) * 100) : null);
        if (!price || price > 100 || !a.quality_stars || !markup || markup <= 0) return;
        const score = (Math.pow(a.quality_stars, 2) * 10) / (markup / 100) / Math.pow(price, 0.4);
        if (score > ssScore) { ssScore = score; ssIdx = i; }
      });
      const ssWine = ssIdx !== null ? wList[ssIdx] : null;
      const ssGreeting = ssWine ? " Tonight's sweet spot is the " + ssWine.name + " — I'd start there." : "";

      setMessages([{
        role: "assistant",
        content: getGreeting() + ". I have full sight of tonight's wine list — " + wList.length + " bottles, markups, quality assessments. Ask me anything: best value picks, food pairings, what to avoid, or recommendations on any budget." + ssGreeting,
      }]);

      // Prompt for restaurant name and save to Google Sheets
      const restaurant = window.prompt("What's the restaurant? (for your log)", "") || "Unknown";
      saveToSheets(wList, analysisData, restaurant);

      setPhase("main");
      setAnalyseStatus(null);
    } catch (err) {
      setAnalyseStatus("Error: " + (err.message || "Something went wrong."));
    } finally {
      setAnalysing(false);
    }
  }

  async function sendMessage(overrideText) {
    const text = overrideText || input.trim();
    if (!text || chatLoading) return;
    const userMsg = { role: "user", content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setChatLoading(true);

    const systemPrompt = "You are Trevor, an acerbic but brilliant sommelier with 25 years of experience. You speak with dry wit, genuine expertise, and zero tolerance for bad value. You have full sight of tonight's wine list:\n\n" + wineContextRef.current + "\n\nBe honest about poor value. Celebrate genuine quality. Keep responses concise — 2-4 sentences unless detail is needed. Never be sycophantic.";

    try {
      const d = await callClaude({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 500,
        system: systemPrompt,
        messages: updated.map(m => ({ role: m.role, content: m.content }))
      });
      const reply = d.content.find(b => b.type === "text")?.text || "My apologies — I seem to have lost my tongue momentarily.";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "The kitchen appears to have severed my connection. Please try again." }]);
    }
    setChatLoading(false);
  }

  function exportCSV() {
    const restaurant = window.prompt("What's the restaurant?", "");
    if (restaurant === null) return;
    const date = new Date().toLocaleDateString("en-GB");
    const rows = [
      ["Date", "Restaurant", "Wine", "Origin", "Category", "Menu Price", "Est. Retail", "Markup %", "Quality Stars", "Note", "Sweet Spot", "Best Value"]
    ];
    (wines || []).forEach((w, i) => {
      const a = (analysis || []).find(x => x.index === i + 1) || {};
      const isSweet = (i + 1) === sweetSpotIdx;
      const isBest = (i + 1) === bestIdx;
      rows.push([
        date,
        restaurant || "Unknown",
        w.name || "",
        w.origin || "",
        w.category || "",
        w.price_bottle || w.price_glass || "",
        a.retail_price || "",
        a.markup_pct || "",
        a.quality_stars || "",
        (a.quality_note || "").replace(/,/g, ";"),
        isSweet ? "Yes" : "",
        isBest ? "Yes" : ""
      ]);
    });
    const csvRows = rows.map(r => r.map(c => String(c)).join(",")); const csv = csvRows.join(String.fromCharCode(10));
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (restaurant || "wine-list") + "-" + date.replace(/\//g, "-") + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function saveToSheets(wList, analysisData, restaurant) {
    const date = new Date().toLocaleDateString("en-GB");
    const rows = [];
    // Add header if first row
    rows.push(["Date", "Restaurant", "Wine", "Origin", "Category", "Menu Price", "Est. Retail", "Markup %", "Quality Stars", "Note", "Sweet Spot", "Best Value"]);
    wList.forEach((w, i) => {
      const a = analysisData.find(x => x.index === i + 1) || {};
      const price = w.price_bottle || w.price_glass;
      const markup = a.markup_pct || (a.retail_price && price ? Math.round(((price - a.retail_price) / a.retail_price) * 100) : null);
      let ssIdx = null, ssScore = -Infinity;
      wList.forEach((w2, j) => {
        const a2 = analysisData.find(x => x.index === j + 1) || {};
        const p2 = w2.price_bottle || w2.price_glass;
        const m2 = a2.markup_pct || (a2.retail_price && p2 ? Math.round(((p2 - a2.retail_price) / a2.retail_price) * 100) : null);
        if (!p2 || p2 > 100 || !a2.quality_stars || !m2 || m2 <= 0) return;
        const score = (Math.pow(a2.quality_stars, 2) * 10) / (m2 / 100) / Math.pow(p2, 0.4);
        if (score > ssScore) { ssScore = score; ssIdx = j + 1; }
      });
      let bstIdx = null, loMarkup = Infinity;
      analysisData.forEach(a2 => { if (a2.markup_pct != null && a2.markup_pct < loMarkup) { loMarkup = a2.markup_pct; bstIdx = a2.index; } });
      rows.push([
        date,
        restaurant || "Unknown",
        w.name || "",
        w.origin || "",
        w.category || "",
        price || "",
        a.retail_price || "",
        markup || "",
        a.quality_stars || "",
        (a.quality_note || "").replace(/,/g, ";"),
        (i + 1) === ssIdx ? "Yes" : "",
        (i + 1) === bstIdx ? "Yes" : ""
      ]);
    });
    try {
      await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
    } catch (e) {
      console.error("Sheets save failed:", e);
    }
  }

  const mergedWines = wines ? wines.map((w, i) => {
    const a = (analysis || []).find(x => x.index === i + 1) || {};
    return { ...w, ...a, index: i + 1 };
  }) : [];

  const filtered = mergedWines
    .filter(w => filter === "All" || w.category === filter.toLowerCase())
    .sort((a, b) => {
      if (sortBy === "markup") return (a.markup_pct || 999) - (b.markup_pct || 999);
      if (sortBy === "quality") return (b.quality_stars || 0) - (a.quality_stars || 0);
      return (a.price_bottle || 0) - (b.price_bottle || 0);
    });

  let bestIdx = null;
  if (analysis) {
    let lo = Infinity;
    analysis.forEach(a => { if (a.markup_pct != null && a.markup_pct < lo) { lo = a.markup_pct; bestIdx = a.index; } });
  }

  let sweetSpotIdx = null;
  let sweetSpotScore = -Infinity;
  let sweetSpotNote = "";
  if (wines && analysis) {
    wines.forEach((w, i) => {
      const a = analysis.find(x => x.index === i + 1) || {};
      const price = w.price_bottle || w.price_glass;
      const markup = a.markup_pct || (a.retail_price && price ? Math.round(((price - a.retail_price) / a.retail_price) * 100) : null);
      if (!price || price > 100) return;
      if (!a.quality_stars || a.quality_stars < 1) return;
      if (!markup || markup <= 0) return;
      const score = (Math.pow(a.quality_stars, 2) * 10) / (markup / 100) / Math.pow(price, 0.4);
      if (score > sweetSpotScore) {
        sweetSpotScore = score;
        sweetSpotIdx = i + 1;
        sweetSpotNote = a.quality_note || "";
      }
    });
  }

  const S = {
    bg: "#0f0d09", surface: "#151208", surface2: "#1a1610",
    border: "#2a2318", gold: "#C9A84C", text: "#e8dfc8", dim: "#5a4f3a",
  };

  if (phase === "upload") return (
    <>
      <Head>
        <title>Ask Trevor</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Ask Trevor" />
        <meta name="theme-color" content="#0f0d09" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-512.png" />
      </Head>
      <div style={{ background: S.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", fontFamily: "Georgia, serif" }}>
        <div style={{ borderTop: "2px solid " + S.gold, paddingTop: 24, textAlign: "center", marginBottom: 48, width: "100%", maxWidth: 560 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <span style={{ fontSize: "0.55rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "#8a6e2e", fontFamily: "monospace" }}>Est. 2025</span>
            <span style={{ fontSize: "0.55rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "#8a6e2e", fontFamily: "monospace" }}>London</span>
          </div>
          <div style={{ borderBottom: "1px solid #2a2010", marginBottom: 16 }} />
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(2.6rem, 7vw, 4rem)", fontWeight: 400, fontStyle: "italic", color: S.text, letterSpacing: "0.02em", lineHeight: 1 }}>
            Ask Trevor
          </h1>
          <div style={{ borderTop: "1px solid #2a2010", marginTop: 16, paddingTop: 12 }}>
            <p style={{ fontSize: "0.58rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "#7a6440", fontFamily: "monospace" }}>
              Sommelier Intelligence
            </p>
          </div>
          <p style={{ fontSize: "0.85rem", color: "#b09a6e", marginTop: 20, lineHeight: 1.8 }}>
            Photograph any wine list. Trevor analyses quality and markup, then answers your questions.
          </p>
        </div>

        <div
          onClick={() => !analysing && fileRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); loadFile(e.dataTransfer.files[0]); }}
          style={{
            maxWidth: 560, width: "100%", border: "1px dashed " + (dragOver ? S.gold : S.border),
            background: dragOver ? "#1a1610" : S.surface,
            padding: preview ? "16px" : "48px 32px",
            textAlign: "center", cursor: analysing ? "wait" : "pointer", transition: "all 0.2s",
          }}
        >
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => loadFile(e.target.files[0])} />
          {preview ? (
            <div>
              <img src={preview} alt="wine list" style={{ maxWidth: "100%", maxHeight: 220, objectFit: "contain", display: "block", margin: "0 auto 12px" }} />
              {!analysing && <span style={{ fontSize: "0.6rem", letterSpacing: "0.15em", textTransform: "uppercase", color: S.dim, fontFamily: "monospace" }}>Tap to change photo</span>}
            </div>
          ) : (
            <div>
              <div style={{ fontSize: "2.4rem", marginBottom: 14, opacity: 0.4 }}>🍷</div>
              <div style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: "1.3rem", color: "#b09a6e", marginBottom: 6 }}>Drop a wine list photo here</div>
              <div style={{ fontSize: "0.62rem", letterSpacing: "0.16em", textTransform: "uppercase", color: S.dim, fontFamily: "monospace" }}>or tap to browse</div>
            </div>
          )}
        </div>

        {img64 && !analysing && (
          <button onClick={analyse} style={{
            marginTop: 16, width: "100%", maxWidth: 560, background: "none",
            border: "1px solid #8a6e2e", color: S.gold, fontFamily: "monospace",
            fontSize: "0.68rem", letterSpacing: "0.22em", textTransform: "uppercase",
            padding: 16, cursor: "pointer",
          }}>Ask Trevor</button>
        )}

        {analyseStatus && (
          <div style={{ marginTop: 20, textAlign: "center", fontSize: "0.75rem", color: S.dim, fontFamily: "monospace" }}>
            {analyseStatus.startsWith("Error") ? (
              <span style={{ color: "#E05C5C" }}>{analyseStatus}</span>
            ) : (
              <span>Analysing... {analyseStatus}</span>
            )}
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      <Head>
        <title>Ask Trevor</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#0f0d09" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-512.png" />
      </Head>
      <div style={{ background: S.bg, minHeight: "100vh", color: S.text, fontFamily: "Georgia, serif" }}>

        <div style={{ borderBottom: "1px solid " + S.border, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: S.surface }}>
          <div>
            <div style={{ fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 700, fontStyle: "italic", color: S.gold }}>Ask Trevor</div>
            <div style={{ fontSize: 11, letterSpacing: "0.18em", color: S.dim, marginTop: 2, fontFamily: "monospace", textTransform: "uppercase" }}>
              {wines ? wines.length + " bottles analysed" : "Wine Intelligence"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {["list", "chat"].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                background: activeTab === tab ? S.gold : "transparent",
                color: activeTab === tab ? S.bg : S.dim,
                border: "1px solid " + (activeTab === tab ? S.gold : S.border),
                padding: "7px 16px", cursor: "pointer", fontFamily: "monospace",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", transition: "all 0.2s"
              }}>{tab === "list" ? "Wine List" : "Ask Trevor"}</button>
            ))}
            <button onClick={() => { setPhase("upload"); setWines(null); setAnalysis(null); setMessages([]); setPreview(null); setImg64(null); wineContextRef.current = ""; }} style={{
              background: "transparent", color: S.dim, border: "1px solid " + S.border,
              padding: "7px 12px", cursor: "pointer", fontFamily: "monospace", fontSize: 11, letterSpacing: "0.1em"
            }}>New List</button>
          </div>
        </div>

        {activeTab === "list" && (
          <div style={{ padding: "20px 24px" }}>

            {sweetSpotIdx && wines && (
              <div style={{ marginBottom: 24, border: "1px solid " + S.gold, background: "rgba(201,168,76,0.06)", padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ fontSize: "1.6rem" }}>🎯</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: S.gold, fontFamily: "monospace", marginBottom: 4 }}>Trevor's Sweet Spot</div>
                  <div style={{ fontFamily: "Georgia, serif", fontSize: "1.05rem", color: S.text, fontWeight: 600 }}>
                    {wines[sweetSpotIdx - 1]?.name}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: S.dim, marginTop: 2 }}>
                    {wines[sweetSpotIdx - 1]?.origin} · £{wines[sweetSpotIdx - 1]?.price_bottle || wines[sweetSpotIdx - 1]?.price_glass} · {sweetSpotNote}
                  </div>
                </div>
                <button onClick={() => { setActiveTab("chat"); setTimeout(() => sendMessage("Tell me about the sweet spot pick — " + (wines[sweetSpotIdx - 1]?.name || "")), 100); }}
                  style={{ background: S.gold, color: S.bg, border: "none", padding: "8px 16px", cursor: "pointer", fontFamily: "monospace", fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase" }}>
                  Ask Trevor
                </button>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <button onClick={exportCSV} style={{
                background: "transparent", border: "1px solid " + S.border, color: S.dim,
                padding: "6px 14px", cursor: "pointer", fontFamily: "monospace",
                fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", transition: "all 0.15s"
              }}>Export CSV</button>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 10, letterSpacing: "0.2em", color: S.dim, fontFamily: "monospace" }}>FILTER</span>
              {["All", "Red", "White", "Rose", "Sparkling"].map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  background: filter === f ? "rgba(201,168,76,0.15)" : "transparent",
                  color: filter === f ? S.gold : S.dim,
                  border: "1px solid " + (filter === f ? S.gold : S.border),
                  padding: "4px 12px", cursor: "pointer", fontFamily: "monospace",
                  fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", transition: "all 0.15s"
                }}>{f}</button>
              ))}
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 10, letterSpacing: "0.2em", color: S.dim, fontFamily: "monospace" }}>SORT</span>
                {[["markup", "Markup"], ["quality", "Quality"], ["price_bottle", "Price"]].map(([val, label]) => (
                  <button key={val} onClick={() => setSortBy(val)} style={{
                    background: sortBy === val ? "rgba(201,168,76,0.1)" : "transparent",
                    color: sortBy === val ? S.gold : S.dim,
                    border: "1px solid " + (sortBy === val ? S.gold : S.border),
                    padding: "4px 10px", cursor: "pointer", fontFamily: "monospace",
                    fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", transition: "all 0.15s"
                  }}>{label}</button>
                ))}
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                <thead>
                  <tr style={{ background: S.surface }}>
                    {["Wine", "Menu", "Est. Retail", "Markup", "Quality", "Note", ""].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: "0.56rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.dim, borderBottom: "1px solid " + S.border, fontWeight: 600, whiteSpace: "nowrap", fontFamily: "monospace" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((w, i) => {
                    const isBest = w.index === bestIdx;
                    const isSweet = w.index === sweetSpotIdx;
                    const menuPrice = w.price_bottle ? "£" + w.price_bottle : w.price_glass ? "£" + w.price_glass + "/gl" : "-";
                    const retail = w.retail_price ? "~£" + w.retail_price : "-";
                    return (
                      <tr key={i} onClick={() => setSelectedWine(selectedWine?.name === w.name ? null : w)}
                        style={{ background: isSweet ? "rgba(107,174,117,0.04)" : isBest ? "rgba(201,168,76,0.05)" : "transparent", borderBottom: "1px solid " + S.surface2, cursor: "pointer" }}>
                        <td style={{ padding: "12px 12px", minWidth: 180 }}>
                          <div style={{ fontFamily: "Georgia, serif", fontSize: "0.95rem", color: isSweet ? "#6BAE75" : isBest ? S.gold : S.text, fontWeight: 600 }}>
                            {w.name}
                            {isBest && <span style={{ fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", background: "rgba(201,168,76,0.15)", color: S.gold, border: "1px solid rgba(201,168,76,0.3)", padding: "2px 5px", marginLeft: 8, verticalAlign: "middle", fontFamily: "monospace" }}>Best Value</span>}
                            {isSweet && <span style={{ fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", background: "rgba(107,174,117,0.15)", color: "#6BAE75", border: "1px solid rgba(107,174,117,0.3)", padding: "2px 5px", marginLeft: 8, verticalAlign: "middle", fontFamily: "monospace" }}>Sweet Spot</span>}
                          </div>
                          <div style={{ fontSize: "0.67rem", color: S.dim }}>{w.origin}</div>
                          {selectedWine?.name === w.name && w.quality_note && (
                            <div style={{ marginTop: 8, fontSize: "0.75rem", color: "#9a8e75", fontStyle: "italic", background: "rgba(201,168,76,0.06)", padding: "8px 12px", borderLeft: "2px solid " + S.gold }}>
                              {w.quality_note}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "12px 12px", color: S.text, whiteSpace: "nowrap", fontFamily: "monospace" }}>{menuPrice}</td>
                        <td style={{ padding: "12px 12px", color: "#7a6d55", whiteSpace: "nowrap", fontFamily: "monospace" }}>{retail}</td>
                        <td style={{ padding: "12px 12px", whiteSpace: "nowrap" }}><MarkupBadge pct={w.markup_pct} /></td>
                        <td style={{ padding: "12px 12px", whiteSpace: "nowrap" }}>{w.quality_stars ? <Stars count={w.quality_stars} /> : "-"}</td>
                        <td style={{ padding: "12px 12px", fontSize: "0.7rem", color: S.dim, minWidth: 140 }}>{w.quality_note || ""}</td>
                        <td style={{ padding: "12px 12px" }}>
                          <button onClick={e => { e.stopPropagation(); setActiveTab("chat"); setTimeout(() => sendMessage("Tell me about " + w.name), 100); }}
                            style={{ background: "transparent", border: "1px solid " + S.border, color: S.dim, padding: "3px 10px", cursor: "pointer", fontFamily: "monospace", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", transition: "all 0.15s" }}>
                            Ask
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "chat" && (
          <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 73px)" }}>
            <div style={{ padding: "12px 24px", borderBottom: "1px solid " + S.border, display: "flex", alignItems: "center", gap: 12, background: "#0d0b07" }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#2a2210", border: "1px solid " + S.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🍷</div>
              <div>
                <div style={{ fontFamily: "Georgia, serif", fontSize: 15, color: S.gold, fontWeight: 600 }}>Trevor</div>
                <div style={{ fontSize: 10, color: S.dim, letterSpacing: "0.1em", fontFamily: "monospace" }}>Head Sommelier</div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {["Best value?", "Under £60?", "With fish?", "Impress me"].map(q => (
                  <button key={q} onClick={() => sendMessage(q)} style={{
                    background: "transparent", border: "1px solid " + S.border, color: S.dim,
                    padding: "4px 10px", cursor: "pointer", fontFamily: "monospace", fontSize: 10, letterSpacing: "0.08em", transition: "all 0.15s"
                  }}>{q}</button>
                ))}

              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              {messages.length === 1 && (
                <div style={{ textAlign: "center", opacity: 0.2, marginTop: 20 }}>
                  <div style={{ fontSize: "3rem" }}>🍷</div>
                  <div style={{ fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "monospace", marginTop: 8 }}>Try asking: what should I order with steak?</div>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  {msg.role === "assistant" && (
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#2a2210", border: "1px solid " + S.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, marginRight: 10, flexShrink: 0, marginTop: 4 }}>🍷</div>
                  )}
                  <div style={{
                    maxWidth: "75%", padding: "12px 16px",
                    background: msg.role === "user" ? "rgba(201,168,76,0.1)" : S.surface,
                    border: "1px solid " + (msg.role === "user" ? "rgba(201,168,76,0.25)" : S.border),
                    fontFamily: "Georgia, serif", fontSize: 14, lineHeight: 1.7, color: S.text
                  }}>
                    {msg.content.split("**").map((part, j) =>
                      j % 2 === 1 ? <strong key={j} style={{ color: S.gold }}>{part}</strong> : part
                    )}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#2a2210", border: "1px solid " + S.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🍷</div>
                  <div style={{ display: "flex", gap: 5, padding: "12px 16px", background: S.surface, border: "1px solid " + S.border }}>
                    <style>{`@keyframes trevorPulse { 0%,100%{opacity:0.2;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.2)} }`}</style>
                    {[0, 1, 2].map(j => <div key={j} style={{ width: 6, height: 6, borderRadius: "50%", background: S.gold, animation: "trevorPulse 1.2s ease infinite", animationDelay: j * 0.2 + "s" }} />)}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div style={{ padding: "12px 24px", borderTop: "1px solid " + S.border, background: "#0d0b07", display: "flex", gap: 10 }}>
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendMessage()}
                placeholder="Ask Trevor about today's list..."
                style={{ flex: 1, background: S.surface, border: "1px solid " + S.border, color: S.text, padding: "11px 14px", fontFamily: "Georgia, serif", fontSize: 14, outline: "none" }}
              />
              <button onClick={() => sendMessage()} disabled={chatLoading || !input.trim()} style={{
                background: chatLoading || !input.trim() ? S.surface2 : S.gold,
                color: chatLoading || !input.trim() ? S.dim : S.bg,
                border: "none", padding: "11px 20px", cursor: chatLoading || !input.trim() ? "not-allowed" : "pointer",
                fontFamily: "monospace", fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", transition: "all 0.2s"
              }}>{chatLoading ? "..." : "Send"}</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
