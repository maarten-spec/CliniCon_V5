import React from "react";

const items = [
  { href: "#/", label: "Dashboard" },
  { href: "#/stellenplan", label: "Stellenplan" },
  { href: "#/stellenplan-gesamt", label: "Stellenplan Gesamt" },
  { href: "#/stellenplan-insights", label: "Insights" },
  { href: "#/stellenplan-berechnung", label: "Berechnung" },
  { href: "#/assistent", label: "Clinicon Assistent" }
];

export default function Sidebar(){
  const active = window.location.hash || "#/";
  return (
    <div className="glass" style={{ padding:14, display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ fontWeight:900, fontSize:18 }}>Create</div>
        <span style={{ fontSize:12, color:"var(--muted)", fontWeight:700 }}>app.clinicon.de</span>
      </div>

      <div style={{ display:"grid", gap:8 }}>
        {items.map((it) => {
          const isActive = active === it.href;
          return (
            <a
              key={it.href}
              href={it.href}
              className="glass"
              style={{
                padding:"10px 12px",
                borderRadius:14,
                background: isActive ? "rgba(37,99,235,.14)" : undefined,
                borderColor: isActive ? "rgba(37,99,235,.28)" : undefined,
                boxShadow: isActive ? "0 12px 26px rgba(37,99,235,.12)" : undefined,
                fontWeight:800
              }}
            >
              {it.label}
            </a>
          );
        })}
      </div>

      <div style={{ marginTop:"auto", color:"var(--muted)", fontSize:12, fontWeight:700 }}>
        Hinweis: Legacy-Seiten laufen im Frame (sicher, schnell, refactor-frei).
      </div>
    </div>
  );
}
