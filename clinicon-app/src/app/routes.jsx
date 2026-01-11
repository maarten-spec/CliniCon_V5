import React from "react";
import Dashboard from "../pages/Dashboard";
import LegacyStellenplan from "../pages/LegacyStellenplan";
import LegacyStellenplanGesamt from "../pages/LegacyStellenplanGesamt";
import LegacyStellenplanInsights from "../pages/LegacyStellenplanInsights";
import LegacyStellenplanBerechnung from "../pages/LegacyStellenplanBerechnung";
import LegacyAssistent from "../pages/LegacyAssistent";

export function resolveRoute(hash){
  const h = (hash || "#/").replace("#", "");
  switch(h){
    case "/":
      return <Dashboard />;
    case "/stellenplan":
      return <LegacyStellenplan />;
    case "/stellenplan-gesamt":
      return <LegacyStellenplanGesamt />;
    case "/stellenplan-insights":
      return <LegacyStellenplanInsights />;
    case "/stellenplan-berechnung":
      return <LegacyStellenplanBerechnung />;
    case "/assistent":
      return <LegacyAssistent />;
    default:
      return <Dashboard />;
  }
}
