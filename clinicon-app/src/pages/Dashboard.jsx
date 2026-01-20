import React from "react";

export default function Dashboard(){
  const cards = [
    { title: "Stellenplan", desc: "Planung & Kontrolle - Monatswerte, Qualis, Inclusion", href: "#/stellenplan" },
    { title: "Insights", desc: "Cockpit & Forecast - Heatmaps, KPIs je Station", href: "#/stellenplan-insights" },
    { title: "Assistent", desc: "KI-Agent fuer Stellenplan-Kommandos + Audit-Log", href: "#/assistent" },
    { title: "Gesamt", desc: "Hausweite Aggregation - Plan vs Ist", href: "#/stellenplan-gesamt" }
  ];

  return (
    <div style={{ display:"grid", gap:14 }}>
      <div className="glass" style={{ padding:18 }}>
        <div style={{ fontWeight:900, fontSize:22 }}>Willkommen</div>
        <div style={{ color:"var(--muted)", fontWeight:600, marginTop:4 }}>
          Deine Suite fuer Personalplanung: Stellenplan, Clinicon-Assistent und Insights.
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(240px, 1fr))", gap:12 }}>
        {cards.map((c) => (
          <a key={c.title} href={c.href} className="glass" style={{ padding:16 }}>
            <div style={{ fontWeight:900 }}>{c.title}</div>
            <div style={{ color:"var(--muted)", fontWeight:600, marginTop:6, lineHeight:1.3 }}>{c.desc}</div>
            <div style={{ marginTop:12 }}>
              <span className="btn btnPrimary" role="button">Oeffnen</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
