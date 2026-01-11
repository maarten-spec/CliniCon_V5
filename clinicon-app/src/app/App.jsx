import React from "react";
import AppShell from "../components/AppShell";
import { resolveRoute } from "./routes";

export default function App(){
  const [hash, setHash] = React.useState(window.location.hash || "#/");

  React.useEffect(() => {
    const onHash = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return <AppShell>{resolveRoute(hash)}</AppShell>;
}
