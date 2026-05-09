import { useState, useRef, useEffect } from "react";
import Head from "next/head";

async function callClaude(body) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch(e) {
    throw new Error("Server error " + res.status + ": " + text.substring(0, 150));
  }
  if (data.error) throw new Error("API error: " + JSON.stringify(data.error));
  if (!data.content) throw new Error("No content: " + JSON.stringify(data).substring(0, 200));
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

function MarkupBadge({ pct, searching }) {
  if (searching && pct == null) return <span style={{ color: "#3a3020", fontFamily: "monospace", fontSize: 10, letterSpacing: "0.05em" }}>searching...</span>;
  if (pct == null) return <span style={{ color: "#3a3020", fontSize: 12 }}>—</span>;
  const color = pct > 250 ? "#E05C5C" : pct > 150 ? "#C9A84C" : "#6BAE75";
  const label = pct > 250 ? "High" : pct > 150 ? "Typical" : "Good";
  return <span style={{ color, fontFamily: "monospace", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em" }}>{label}</span>;
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
  const [sortBy, setSortBy] = useState("value");
  const [selectedWine, setSelectedWine] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showChoicePrompt, setShowChoicePrompt] = useState(false);
  const [chosenWine, setChosenWine] = useState(null);
  const [searchingPrices, setSearchingPrices] = useState(false);
  const [choiceComment, setChoiceComment] = useState(null);
  const choiceTimerRef = useRef(null);
  const [foodInput, setFoodInput] = useState("");
  const [pairingResult, setPairingResult] = useState(null);
  const [pairingLoading, setPairingLoading] = useState(false);
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
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        // Scale down if too large - max 1600px on longest side
        const MAX = 1600;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.80);
        setImg64(dataUrl.split(",")[1]);
        setImgType("image/jpeg");
        setPreview(dataUrl);
      };
      img.src = ev.target.result;
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
        max_tokens: 4000,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: imgType, data: img64 } },
            { type: "text", text: "Extract all wines from this wine list image. Some lists may not have prices — that is fine, just set price_glass and price_bottle to null. Return ONLY a raw JSON array. No markdown, no backticks, no code blocks, no explanation. Start with [ and end with ]. IMPORTANT: create exactly ONE entry per wine. Each item must have: name, origin, price_glass (number or null), price_bottle (number or null), glass_size (125, 175 or 250 or null), category (red/white/rose/sparkling). If no prices are shown set all price fields to null. Do not create duplicate entries for the same wine. Ignore magnum and large format prices." }
          ]
        }]
      });

      const t1raw = d1.content.find(b => b.type === "text")?.text || "";
      const t1 = t1raw.replace(/```json/gi, "").replace(/```/g, "").replace(/`/g, "").replace(/^[^\[]*/, "").replace(/[^\]]*$/, "").trim();
      const i1s = t1.indexOf("[");
      const i1e = t1.lastIndexOf("]");
      if (i1s === -1) throw new Error("Trevor could not read this wine list. Please try again with a clearer photo — make sure the list is well lit, in focus, and the text is visible. Avoid photographing screens.");
      let wList;
      try {
        wList = JSON.parse(t1.substring(i1s, i1e + 1));
      } catch(e) {
        // Try cleaning the string further
        const cleaned = t1.substring(i1s, i1e + 1).replace(/[\u0000-\u001F\u007F-\u009F]/g, "").replace(/,\s*]/g, "]").replace(/,\s*}/g, "}");
        wList = JSON.parse(cleaned);
      }
      if (!wList.length) throw new Error("No wines found in this image. Please make sure you are photographing a wine list — ideally in portrait orientation with good lighting and the full list visible.");
      setWines(wList);
      const hasPrices = wList.some(w => w.price_bottle || w.price_glass);

      // PHASE 1: Get quality ratings instantly (no web search)
      setAnalyseStatus("Found " + wList.length + " wines - rating quality...");
      const quickList = wList.map((w, i) => (i + 1) + ". " + (w.name || "").replace(/[^\x20-\x7E]/g, "") + " (" + (w.origin || "").replace(/[^\x20-\x7E]/g, "") + ")").join("\n");
      const dQuick = await callClaude({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 3000,
        messages: [{ role: "user", content: "You must respond with ONLY a JSON array. No words before or after. No markdown. No backticks. Just start with [ and end with ]. For each wine rate quality 1-5. Format: [{index:1,quality_stars:4,quality_note:short phrase,retail_price:null,markup_pct:null}]. Wines: " + quickList + quickList }]
      });
      const tQuick = (dQuick.content.find(b => b.type === "text")?.text || "").replace(/```json/gi, "").replace(/```/g, "").replace(/`/g, "").trim();
      const iQs = tQuick.indexOf("["); const iQe = tQuick.lastIndexOf("]");
      if (iQs !== -1) {
        try {
          let quickData = JSON.parse(tQuick.substring(iQs, iQe + 1));
          setAnalysis(quickData);
        } catch(e) {
          console.error("Phase 1 parse error:", e.message, "Raw:", tQuick.substring(0, 200));
        }
      } else {
        console.error("Phase 1 no JSON found. Raw response:", tQuick.substring(0, 300));
      }

      // Show app immediately with quality data
      setPhase("main");
      setAnalyseStatus(null);
      // Set basic Trevor context so chat works immediately
      const basicCtx = wList.map((w, i) => {
        const price = w.price_bottle ? "GBP" + w.price_bottle : w.price_glass ? "GBP" + w.price_glass + "/glass" : "unknown";
        return w.name + " (" + w.origin + "): Menu " + price;
      }).join("\n");
      wineContextRef.current = basicCtx;
      setMessages([{ role: "assistant", content: getGreeting() + ". I have full sight of tonight's wine list — " + wList.length + " wines. Quality ratings are ready. Retail prices are loading. Ask me anything." }]);

      setAnalysing(false);
      // phase 1 complete - app shown

      // PHASE 2: Search retail prices in background
      if (hasPrices) {
        setSearchingPrices(true);
      }

      const wineList = wList.map((w, i) => {
        const bottlePrice = w.price_bottle || (w.price_glass ? (w.glass_size === 125 ? Math.round(w.price_glass * 6) : w.glass_size === 250 ? Math.round(w.price_glass * 3) : Math.round(w.price_glass * 4.3)) : null);
        const price = w.price_bottle ? "GBP" + w.price_bottle : bottlePrice ? "GBP" + bottlePrice + " (est from glass)" : "unknown";
        return (i + 1) + ". " + (w.name || "").replace(/[^\x20-\x7E]/g, "") + " (" + (w.origin || "").replace(/[^\x20-\x7E]/g, "") + ") menu price: " + price;
      }).join("\n");

      // PHASE 2: Analysis with web search loop
      try {
      const analysisPrompt = hasPrices
        ? "For each wine below: (1) search for the average UK retail bottle price across mainstream retailers such as Waitrose, Majestic, Berry Bros and Naked Wines, (2) search for critic scores from Decanter, Wine Spectator, Vivino or Robert Parker and use these to rate quality 1-5 stars, (3) assess the vintage year if shown and use ONLY these exact words for vintage_note: Legendary, Outstanding, Exceptional, Superb, Good, Average, Poor, or n/a if too recent to assess, (4) give a drinking window e.g. drink now, peak 2025-2028, needs time, or past best. Return a raw JSON array only. No markdown, no backticks. Start with [ and end with ]. Format: [{index:1,retail_price:25,quality_stars:4,quality_note:short phrase based on critic consensus,markup_pct:120,vintage_note:exceptional year,drinking_window:drink now}]\n\nWines:\n" + wineList
        : "For each wine below, rate the quality 1-5 and estimate the typical UK retail price. There are no menu prices so set markup_pct to null. Return a raw JSON array only. No markdown, no backticks. Start with [ and end with ]. Format: [{index:1,retail_price:25,quality_stars:4,quality_note:short phrase,markup_pct:null}]\n\nWines:\n" + wineList;
      let analysisText = "";
      let searchMessages = [{ role: "user", content: analysisPrompt }];
      for (let si = 0; si < 15; si++) {
        const sd = await callClaude({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 4000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: searchMessages,
        });
        searchMessages.push({ role: "assistant", content: sd.content });
        if (sd.stop_reason === "end_turn") {
          analysisText = sd.content.filter(b => b.type === "text").map(b => b.text).join("");
          break;
        }
        if (sd.stop_reason === "tool_use") {
          const toolResults = sd.content.filter(b => b.type === "tool_use").map(b => ({ type: "tool_result", tool_use_id: b.id, content: "done" }));
          searchMessages.push({ role: "user", content: toolResults });
          setAnalyseStatus("Searching retail prices... (" + (si + 1) + ")");
        } else {
          analysisText = sd.content.filter(b => b.type === "text").map(b => b.text).join("");
          break;
        }
      }

      const t2raw = analysisText;
      const t2 = t2raw.replace(/```json/gi, "").replace(/```/g, "").replace(/`/g, "").replace(/^[^\[]*/, "").replace(/[^\]]*$/, "").trim();
      const i2s = t2.indexOf("[");
      const i2e = t2.lastIndexOf("]");
      if (i2s === -1) throw new Error("Analysis failed. Please try again.");
      let analysisData;
      try {
        analysisData = JSON.parse(t2.substring(i2s, i2e + 1));
      } catch(e) {
        const cleaned = t2.substring(i2s, i2e + 1).replace(/[\u0000-\u001F\u007F-\u009F]/g, "").replace(/,\s*]/g, "]").replace(/,\s*}/g, "}");
        analysisData = JSON.parse(cleaned);
      }
      // Merge retail prices, vintage notes and drinking window into existing quality data
      setAnalysis(prev => {
        if (!prev) return analysisData;
        return prev.map((q, i) => {
          const a = analysisData.find(x => x.index === q.index) || {};
          return { ...q, retail_price: a.retail_price, markup_pct: a.markup_pct, vintage_note: a.vintage_note, drinking_window: a.drinking_window };
        });
      });
      setSearchingPrices(false);
      } catch(phase2Err) {
        console.error('Phase 2 error:', phase2Err.message);
        setSearchingPrices(false);
        setAnalyseStatus('Could not load retail prices: ' + phase2Err.message);
        setTimeout(() => setAnalyseStatus(null), 4000);
      }

      const ctx = wList.map((w, i) => {
        const a = analysisData.find(x => x.index === i + 1) || {};
        const price = w.price_bottle ? "GBP" + w.price_bottle : w.price_glass ? "GBP" + w.price_glass + "/glass" : "unknown";
        return w.name + " (" + w.origin + "): Menu " + price + ", Est retail ~GBP" + (a.retail_price || "unknown") + ", Value ~" + (a.markup_pct || "?") + "%, Quality " + (a.quality_stars || "?") + "/5. " + (a.quality_note || "");
      }).join("\n");
      wineContextRef.current = ctx;
      // Update Trevor's opening message now that prices are available
      setMessages(prev => {
        if (!prev || prev.length === 0) return prev;
        const updated = [...prev];
        updated[0] = { ...updated[0], content: getGreeting() + ". I have full sight of tonight's wine list — " + wList.length + " wines with quality ratings and retail price analysis. Ask me anything." };
        return updated;
      });

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
        content: getGreeting() + ". I have full sight of tonight's wine list — " + wList.length + " bottles, quality assessments. Ask me anything: best value picks, food pairings, what to avoid, or recommendations on any budget." + ssGreeting,
      }]);

      // Prompt for restaurant name and save to Google Sheets
      const restaurant = window.prompt("What's the restaurant? (for your log)", "") || "Unknown";
      saveToSheets(wList, analysisData, restaurant);

      // Start 5 minute timer for choice prompt
      if (choiceTimerRef.current) clearTimeout(choiceTimerRef.current);
      choiceTimerRef.current = setTimeout(() => setShowChoicePrompt(true), 5 * 60 * 1000);

    } catch (err) {
      setAnalyseStatus("Error: " + (err.message || "Something went wrong."));
      setSearchingPrices(false);
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

  async function askFoodPairing() {
    if (!foodInput.trim() || pairingLoading) return;
    setPairingLoading(true);
    setPairingResult(null);
    const systemPrompt = "You are Trevor, an acerbic but brilliant sommelier. You have full sight of tonight's wine list:\n\n" + wineContextRef.current + "\n\nBe concise and specific. Recommend one wine from the list only.";
    try {
      const d = await callClaude({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 200,
        system: systemPrompt,
        messages: [{ role: "user", content: "I am eating " + foodInput.trim() + ". Which wine on this list should I order?" }]
      });
      const reply = d.content.find(b => b.type === "text")?.text || "I seem to have lost my tongue momentarily.";
      setPairingResult(reply);
    } catch(e) {
      setPairingResult("My apologies — something went wrong.");
    }
    setPairingLoading(false);
  }

  async function handleChoice(wine) {
    setChosenWine(wine);
    setShowChoicePrompt(false);
    setChatLoading(true);
    setActiveTab("chat");

    const systemPrompt = "You are Trevor, an acerbic but brilliant sommelier. Be brief — one sentence of dry wit congratulating or gently teasing the choice. Never be sycophantic.";
    try {
      const d = await callClaude({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 100,
        system: systemPrompt,
        messages: [{ role: "user", content: "I chose the " + wine.name + " (" + wine.origin + ") at £" + (wine.price_bottle || wine.price_glass) + "." }]
      });
      const reply = d.content.find(b => b.type === "text")?.text || "An excellent choice.";
      setChoiceComment(reply);
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch(e) {
      setMessages(prev => [...prev, { role: "assistant", content: "An excellent choice." }]);
    }
    setChatLoading(false);

    // Log chosen wine to sheets
    const date = new Date().toLocaleDateString("en-GB");
    try {
      await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [[date, "CHOSEN", wine.name, wine.origin, wine.category || "", wine.price_bottle || wine.price_glass || "", "", "", "", "", "", ""]] }),
      });
    } catch(e) { console.error("Sheet log failed", e); }
  }

  async function saveToSheets(wList, analysisData, restaurant) {
    const date = new Date().toLocaleDateString("en-GB");
    const rows = [];
    // Add header if first row
    rows.push(["Date", "Restaurant", "Wine", "Origin", "Category", "Menu Price", "Est. Retail", "Value %", "Quality Stars", "Note", "Sweet Spot", "Best Value"]);
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
        value || "",
        a.quality_stars || "",
        (a.quality_note || "").replace(/,/g, ";"),
        (i + 1) === ssIdx ? "Yes" : "",
        (i + 1) === bstIdx ? "Yes" : ""
      ]);
    });
    try {
      const sheetsRes = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const sheetsData = await sheetsRes.json();
      if (!sheetsData.success) {
        alert("Sheets error: " + JSON.stringify(sheetsData));
      }
    } catch (e) {
      alert("Sheets fetch failed: " + e.message);
    }
  }

  const mergedWines = wines ? wines.map((w, i) => {
    const a = (analysis || []).find(x => x.index === i + 1) || {};
    return { ...w, ...a, index: i + 1 };
  }) : [];

  const filtered = mergedWines
    .filter(w => filter === "All" || w.category === filter.toLowerCase())
    .sort((a, b) => {
      if (sortBy === "value") return (a.markup_pct || 999) - (b.markup_pct || 999);
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

  async function shareAnalysis() {
    if (!wines || !analysis) return;
    try {
      const scale = 2;
      const width = 800;
      const rowHeight = 44;
      const headerHeight = 100;
      const footerHeight = 50;
      const height = headerHeight + (wines.length + 1) * rowHeight + footerHeight;
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);

      ctx.fillStyle = "#0f0d09";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#c9a84c";
      ctx.fillRect(0, 0, width, 3);

      ctx.font = "italic 28px Georgia, serif";
      ctx.fillStyle = "#c9a84c";
      ctx.fillText("Ask Trevor", 24, 40);
      ctx.font = "11px monospace";
      ctx.fillStyle = "#9a8a6a";
      ctx.fillText("QUALITY & VALUE ANALYSIS", 24, 60);
      ctx.fillText(new Date().toLocaleDateString("en-GB"), width - 110, 60);

      const cols = ["Wine", "Menu", "Value", "Quality", "Vintage", "Drink"];
      const colX = [24, 300, 374, 454, 554, 644];
      ctx.font = "bold 10px monospace";
      ctx.fillStyle = "#9a8a6a";
      cols.forEach((c, i) => ctx.fillText(c.toUpperCase(), colX[i], headerHeight - 8));

      ctx.fillStyle = "#2a2318";
      ctx.fillRect(0, headerHeight, width, 1);

      wines.forEach((w, i) => {
        const a = (analysis || []).find(x => x.index === i + 1) || {};
        const y = headerHeight + (i + 1) * rowHeight - 8;
        const isSweet = (i + 1) === sweetSpotIdx;
        const isBest = (i + 1) === bestIdx;

        if (isSweet || isBest) {
          ctx.fillStyle = "rgba(201,168,76,0.06)";
          ctx.fillRect(0, y - 26, width, rowHeight);
        }

        ctx.font = "13px Georgia, serif";
        ctx.fillStyle = isSweet || isBest ? "#c9a84c" : "#f0e6c8";
        ctx.fillText((w.name || "").substring(0, 34), colX[0], y);

        const menuPrice = w.price_bottle ? "£" + w.price_bottle : w.price_glass ? "£" + w.price_glass : "-";
        ctx.font = "12px monospace";
        ctx.fillStyle = "#c8b48a";
        ctx.fillText(menuPrice, colX[1], y);

        const pct = a.markup_pct;
        const vLabel = pct == null ? "-" : pct > 250 ? "High" : pct > 150 ? "Typical" : "Good";
        ctx.font = "bold 11px monospace";
        ctx.fillStyle = pct == null ? "#9a8a6a" : pct > 250 ? "#E05C5C" : pct > 150 ? "#C9A84C" : "#6BAE75";
        ctx.fillText(vLabel, colX[2], y);

        ctx.font = "12px Arial";
        ctx.fillStyle = "#c9a84c";
        ctx.fillText("★".repeat(a.quality_stars || 0) + "☆".repeat(5 - (a.quality_stars || 0)), colX[3], y);

        ctx.font = "11px monospace";
        ctx.fillStyle = "#c8b48a";
        if (a.vintage_note) {
          const vn = a.vintage_note.toLowerCase();
          const vnt = vn.includes("legendary") ? "Legendary" : vn.includes("outstanding") ? "Outstanding" : vn.includes("exceptional") ? "Exceptional" : vn.includes("superb") || vn.includes("excellent") ? "Superb" : vn.includes("good") ? "Good" : vn.includes("poor") ? "Poor" : "n/a";
          ctx.fillText(vnt, colX[4], y);
        } else { ctx.fillText("-", colX[4], y); }

        if (a.drinking_window) {
          const dw = a.drinking_window.toLowerCase();
          const cy = new Date().getFullYear();
          const yrs = dw.match(/20[2-9][0-9]/g);
          let dl = dw.includes("now") ? "Drink now" : dw.includes("past") ? "Past best" : dw.includes("young") || dw.includes("needs") ? "Too young" : a.drinking_window;
          if (yrs) { const mn = Math.min(...yrs.map(Number)), mx = Math.max(...yrs.map(Number)); dl = mx < cy ? "Past best" : mn <= cy ? "Drink now" : "Too young"; }
          ctx.fillText(dl.substring(0, 9), colX[5], y);
        } else { ctx.fillText("-", colX[5], y); }

        ctx.fillStyle = "#1a1610";
        ctx.fillRect(0, y + 8, width, 1);
      });

      ctx.font = "10px monospace";
      ctx.fillStyle = "#5a4f3a";
      ctx.fillText("asktrevor.app", 24, height - 16);
      ctx.fillStyle = "#c9a84c";
      ctx.fillRect(0, height - 3, width, 3);

      canvas.toBlob(async (blob) => {
        const file = new File([blob], "asktrevor.png", { type: "image/png" });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ title: "Ask Trevor", text: "Wine list analysis", files: [file] });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = "asktrevor.png"; a.click();
          URL.revokeObjectURL(url);
        }
      }, "image/png");
    } catch(e) { console.error("Share failed:", e.message); }
  }

  const S = {
    bg: "#0f0d09", surface: "#151208", surface2: "#1a1610",
    border: "#2a2318", gold: "#C9A84C", text: "#f0e6c8", dim: "#c8b48a",
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
          <p style={{ fontSize: "0.85rem", color: "#d4b87a", marginTop: 20, lineHeight: 1.8 }}>
            Photograph any wine list.<br/>Trevor analyses quality and value,<br/>then answers your questions.
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
              <div style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: "1.3rem", color: "#d4b87a", marginBottom: 6 }}>Drop a wine list photo here</div>
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
            <button onClick={() => { setPhase("upload"); setWines(null); setAnalysis(null); setMessages([]); setPreview(null); setImg64(null); wineContextRef.current = ""; if (choiceTimerRef.current) clearTimeout(choiceTimerRef.current); setShowChoicePrompt(false); setChosenWine(null); setFoodInput(""); setPairingResult(null); setSearchingPrices(false); }} style={{
              background: "transparent", color: S.dim, border: "1px solid " + S.border,
              padding: "7px 12px", cursor: "pointer", fontFamily: "monospace", fontSize: 11, letterSpacing: "0.1em"
            }}>New List</button>
          </div>
        </div>

        {activeTab === "list" && (
          <div style={{ padding: "20px 24px" }}>

            {searchingPrices && (
              <div style={{ marginBottom: 12, padding: "8px 14px", background: "#1a1408", border: "0.5px solid #2a2010", fontSize: 11, fontFamily: "monospace", color: "#5a4f3a", letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#c9a84c", opacity: 0.6, animation: "trevorPulse 1.2s ease infinite" }} />
                SEARCHING RETAIL PRICES...
              </div>
            )}
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
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button onClick={() => { setActiveTab("chat"); setTimeout(() => sendMessage("Tell me about the sweet spot pick — " + (wines[sweetSpotIdx - 1]?.name || "")), 100); }}
                    style={{ background: S.gold, color: S.bg, border: "none", padding: "8px 16px", cursor: "pointer", fontFamily: "monospace", fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase" }}>
                    Ask Trevor
                  </button>
                  <button onClick={shareAnalysis}
                    style={{ background: "transparent", color: S.gold, border: "1px solid " + S.gold, padding: "8px 16px", cursor: "pointer", fontFamily: "monospace", fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase" }}>
                    Share
                  </button>
                </div>
              </div>
            )}

            {/* Food Pairing */}
            <div style={{ marginBottom: 24, border: "1px solid " + S.border, background: S.surface, padding: "16px 20px" }}>
              <div style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: S.dim, fontFamily: "monospace", marginBottom: 12 }}>Trevor's Food Pairing</div>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  value={foodInput}
                  onChange={e => setFoodInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && askFoodPairing()}
                  placeholder="What are you eating?"
                  style={{ flex: 1, background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "9px 12px", fontFamily: "Georgia, serif", fontSize: 13, outline: "none" }}
                />
                <button onClick={askFoodPairing} disabled={pairingLoading || !foodInput.trim()} style={{
                  background: pairingLoading || !foodInput.trim() ? S.surface2 : S.gold,
                  color: pairingLoading || !foodInput.trim() ? S.dim : S.bg,
                  border: "none", padding: "9px 16px", cursor: pairingLoading || !foodInput.trim() ? "not-allowed" : "pointer",
                  fontFamily: "monospace", fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", transition: "all 0.2s"
                }}>{pairingLoading ? "..." : "Ask"}</button>
              </div>
              {pairingResult && (
                <div style={{ marginTop: 12, fontSize: "0.82rem", color: S.text, fontFamily: "Georgia, serif", lineHeight: 1.7, borderTop: "1px solid " + S.border, paddingTop: 12, fontStyle: "italic" }}>
                  {pairingResult.split("**").map((part, j) =>
                    j % 2 === 1 ? <strong key={j} style={{ color: S.gold, fontStyle: "normal" }}>{part}</strong> : part
                  )}
                </div>
              )}
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
                {[["value", "Value"], ["quality", "Quality"], ["price_bottle", "Price"]].map(([val, label]) => (
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
                    {["Wine", "Menu", "Value", "Quality", "Vintage", "Drink", "Note", ""].map(h => (
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
                            <div style={{ marginTop: 8, fontSize: "0.75rem", color: "#c8aa6e", fontStyle: "italic", background: "rgba(201,168,76,0.06)", padding: "8px 12px", borderLeft: "2px solid " + S.gold }}>
                              {w.quality_note}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "12px 12px", color: S.text, whiteSpace: "nowrap", fontFamily: "monospace" }}>{menuPrice}</td>
                        <td style={{ padding: "12px 12px", whiteSpace: "nowrap" }}><MarkupBadge pct={w.markup_pct} searching={searchingPrices} /></td>
                        <td style={{ padding: "12px 12px", whiteSpace: "nowrap" }}>{w.quality_stars ? <Stars count={w.quality_stars} /> : "-"}</td>
                        <td style={{ padding: "12px 12px", fontSize: "0.68rem", color: S.dim, whiteSpace: "nowrap" }}>{w.vintage_note ? (() => {
                            const vn = w.vintage_note.toLowerCase();
                            if (vn.includes("recent") || vn.includes("n/a") || vn.includes("too young") || vn.includes("assess")) return "n/a";
                            if (vn.includes("legendary") || vn.includes("historic") || vn.includes("greatest")) return "Legendary";
                            if (vn.includes("outstanding")) return "Outstanding";
                            if (vn.includes("exceptional")) return "Exceptional";
                            if (vn.includes("superb") || vn.includes("excellent")) return "Superb";
                            if (vn.includes("good") || vn.includes("solid") || vn.includes("reliable")) return "Good";
                            if (vn.includes("average") || vn.includes("ordinary") || vn.includes("mixed")) return "Average";
                            if (vn.includes("poor") || vn.includes("difficult") || vn.includes("challenging") || vn.includes("weak")) return "Poor";
                            return w.vintage_note;
                          })() : (searchingPrices ? "..." : "-")}</td>
                        <td style={{ padding: "12px 12px", fontSize: "0.68rem", color: (() => {
                            if (!w.drinking_window) return S.dim;
                            const dw = w.drinking_window.toLowerCase();
                            const currentYear = new Date().getFullYear();
                            const years = dw.match(/20[2-9][0-9]/g);
                            if (years) {
                              const minYear = Math.min(...years.map(Number));
                              const maxYear = Math.max(...years.map(Number));
                              if (maxYear < currentYear) return "#E05C5C";
                              if (minYear <= currentYear) return "#6BAE75";
                              return "#C9A84C";
                            }
                            if (dw.includes("past")) return "#E05C5C";
                            if (dw.includes("now")) return "#6BAE75";
                            if (dw.includes("young") || dw.includes("needs")) return "#C9A84C";
                            return S.dim;
                          })(), whiteSpace: "nowrap" }}>
                          {w.drinking_window ? (() => {
                            const dw = w.drinking_window.toLowerCase();
                            const currentYear = new Date().getFullYear();
                            if (dw.includes("past")) return "Past best";
                            // Check if any year in the window includes current year or earlier
                            const years = dw.match(/20[2-9][0-9]/g);
                            if (years) {
                              const minYear = Math.min(...years.map(Number));
                              const maxYear = Math.max(...years.map(Number));
                              if (maxYear < currentYear) return "Past best";
                              if (minYear <= currentYear && maxYear >= currentYear) return "Drink now";
                              if (minYear > currentYear) return "Too young";
                            }
                            if (dw.includes("young") || dw.includes("needs")) return "Too young";
                            if (dw.includes("now")) return "Drink now";
                            return w.drinking_window;
                          })() : (searchingPrices ? "..." : "-")}
                        </td>
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
                {["Best value?", "Under £60?", "Best quality?", "Impress me"].map(q => (
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
    {/* Choice prompt modal */}
    {showChoicePrompt && wines && (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100, padding: "0 0 24px" }}>
        <div style={{ background: "#151208", border: "1px solid #c9a84c", borderRadius: 4, padding: "20px 20px", width: "100%", maxWidth: 560, margin: "0 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#2a2210", border: "1px solid #c9a84c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🍷</div>
            <div>
              <div style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 15, color: "#c9a84c" }}>Trevor</div>
              <div style={{ fontFamily: "monospace", fontSize: 9, color: "#5a4f3a", letterSpacing: "0.1em" }}>What did you order?</div>
            </div>
            <button onClick={() => setShowChoicePrompt(false)} style={{ marginLeft: "auto", background: "transparent", border: "none", color: "#5a4f3a", fontSize: 18, cursor: "pointer" }}>×</button>
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {wines.map((w, i) => (
              <button key={i} onClick={() => handleChoice(w)} style={{
                background: "transparent", border: "0.5px solid #2a2318", color: "#d4b87a",
                padding: "10px 12px", cursor: "pointer", textAlign: "left", borderRadius: 2,
                fontFamily: "Georgia, serif", fontSize: 13, transition: "all 0.15s"
              }}>
                <div style={{ color: "#e2cfa0", fontSize: 13 }}>{w.name}</div>
                <div style={{ fontSize: 11, color: "#5a4f3a", marginTop: 2 }}>{w.origin} · £{w.price_bottle || w.price_glass}</div>
              </button>
            ))}
          </div>
          <button onClick={() => setShowChoicePrompt(false)} style={{
            marginTop: 12, width: "100%", background: "transparent", border: "0.5px solid #2a2318",
            color: "#5a4f3a", fontFamily: "monospace", fontSize: 10, letterSpacing: "0.15em",
            textTransform: "uppercase", padding: 10, cursor: "pointer"
          }}>Skip</button>
        </div>
      </div>
    )}
    </>
  );
}
