// src/components/alerts/AlertBanner.tsx
import React, { useEffect, useRef } from "react";

export type Severity = "critical" | "warning" | "info";
export type AlertEvent = {
  id: string; ts: number; severity: Severity;
  label: string; kind: string; count?: number; coord?: [number, number];
};

export default function AlertBanner({
  alert, onAck
}: { alert: AlertEvent | null; onAck: () => void }) {
  const wasHidden = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === "Space") { e.preventDefault(); onAck(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAck]);

  // Title flash (visual only)
  useEffect(() => {
    if (!alert) { document.title = document.title.replace(/^\(\d+\)\s*/, ""); return; }
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    let tick = false;
    const t = window.setInterval(() => {
      tick = !tick;
      document.title = tick ? `(1) ${base}` : base;
    }, 900);
    return () => { window.clearInterval(t); document.title = base; };
  }, [alert]);

  if (!alert) return null;
  const color = alert.severity === "critical" ? "#fee2e2" : alert.severity === "warning" ? "#fef3c7" : "#e0f2fe";
  const fg    = alert.severity === "critical" ? "#7f1d1d" : alert.severity === "warning" ? "#7c2d12" : "#075985";

  return (
    <div
      role="region"
      aria-live="assertive"
      aria-label={`Alert ${alert.severity}`}
      style={{
        position:"absolute", top:0, left:0, right:0, zIndex:3000,
        background:color, color:fg, borderBottom:"1px solid rgba(0,0,0,0.08)",
        padding:"10px 12px", display:"flex", gap:12, alignItems:"center"
      }}
    >
      <strong style={{fontWeight:800}}>
        {alert.severity === "critical" ? "🚨" : alert.severity === "warning" ? "⚠️" : "ℹ️"}
      </strong>
      <div style={{fontWeight:700}}>
        {alert.label}{alert.count ? ` (x${alert.count})` : ""}
      </div>
      <div style={{fontSize:12, opacity:.8}}>{new Date(alert.ts).toLocaleTimeString()}</div>
      <button
        onClick={onAck}
        style={{marginLeft:"auto", padding:"6px 10px", borderRadius:8, border:"1px solid #ddd", background:"#fff"}}
      >
        Acknowledge (Space)
      </button>
    </div>
  );
}
