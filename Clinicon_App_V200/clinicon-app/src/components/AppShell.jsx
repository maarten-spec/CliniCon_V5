import React from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppShell({ children }){
  return (
    <div style={{ display:"grid", gridTemplateColumns:"280px 1fr", minHeight:"100vh", gap:16, padding:16 }}>
      <Sidebar />
      <div style={{ display:"grid", gridTemplateRows:"64px 1fr", gap:16, minWidth:0 }}>
        <Topbar />
        <div className="glass" style={{ padding:16, minWidth:0 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
