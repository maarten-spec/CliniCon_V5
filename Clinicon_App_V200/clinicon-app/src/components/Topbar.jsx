import React from "react";

export default function Topbar(){
  return (
    <div className="glass" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", gap:12 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0 }}>
        <div style={{ fontWeight:800 }}>CliniCon App</div>
        <div style={{ color:"var(--muted)", fontWeight:600, fontSize:13 }}>Stufe 2 - Stellenplan Suite</div>
      </div>

      <div style={{ display:"flex", alignItems:"center", gap:10, width:"min(520px, 55%)" }}>
        <input className="input" placeholder="Suchen (z. B. Station, Mitarbeitende, Insights) ..." />
        <button className="btn" type="button">Einstellungen</button>
      </div>
    </div>
  );
}
