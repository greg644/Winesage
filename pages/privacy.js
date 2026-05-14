export default function Privacy() {
  return (
    <div style={{ background: "#0f0d09", minHeight: "100vh", padding: "60px 24px", fontFamily: "Georgia, serif", color: "#e2cfa0", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ borderTop: "2px solid #c9a84c", paddingTop: 24, marginBottom: 40 }}>
        <h1 style={{ fontStyle: "italic", fontSize: "2rem", fontWeight: 400, color: "#c9a84c", marginBottom: 8 }}>Ask Trevor</h1>
        <p style={{ fontFamily: "monospace", fontSize: "0.65rem", letterSpacing: "0.2em", color: "#7a6440", textTransform: "uppercase" }}>Privacy Policy</p>
      </div>
      <p style={{ color: "#7a6440", fontSize: "0.8rem", marginBottom: 32 }}>Last updated: May 2026</p>
      {[
        ["What we collect", "When you use Ask Trevor, photos of wine lists are sent to Anthropic's Claude API for analysis. We do not store these photos. If you choose to log your analysis, the wine list data and restaurant name are saved to a private Google Sheet accessible only to the app owner."],
        ["How we use your data", "Wine list photos are processed solely to provide quality ratings, markup analysis and sommelier recommendations. No personal data is collected, stored or shared with third parties."],
        ["Data retention", "No user data is retained beyond the duration of a single session. Wine list photos are not stored at any point. As we do not collect or store personal data, there is nothing to delete or access upon request."],
        ["Your rights", "As Ask Trevor does not collect or store any personal data, there is no personal information to access, correct or delete. If you have any concerns about data processed by third party services such as Anthropic, please refer to their respective privacy policies."],
        ["Third party services", "Ask Trevor uses the Anthropic Claude API to analyse wine lists and generate recommendations. Please refer to Anthropic's privacy policy at anthropic.com for details of how they handle API data."],
        ["Cookies", "Ask Trevor does not use cookies or tracking technologies."],
        ["Children", "Ask Trevor is intended for users aged 18 and over in accordance with alcohol-related content guidelines."],
        ["Contact", "If you have any questions about this privacy policy please contact greg@mceneny.net"],
      ].map(([title, text]) => (
        <div key={title} style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 400, color: "#c9a84c", fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>{title}</h2>
          <p style={{ lineHeight: 1.8, color: "#b09a6e", fontSize: "0.9rem" }}>{text}</p>
        </div>
      ))}
      <div style={{ borderTop: "1px solid #2a2318", marginTop: 60, paddingTop: 20, textAlign: "center" }}>
        <a href="/" style={{ fontFamily: "monospace", fontSize: "0.65rem", letterSpacing: "0.15em", color: "#7a6440", textTransform: "uppercase", textDecoration: "none" }}>Back to Ask Trevor</a>
      </div>
    </div>
  );
}
