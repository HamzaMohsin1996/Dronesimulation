import React from "react";
import type { AlertEvent } from "./AlertBanner";

export default function AlertDock({
  items, unseen, onOpen
}: { items: AlertEvent[]; unseen: number; onOpen: (a: AlertEvent)=>void }) {
  return (
    <div style={{
      position:'absolute', right:12, bottom:12, zIndex:1600,
      width:320, background:'#fff', border:'1px solid #e5e7eb', borderRadius:12
    }}>
      <div style={{ padding:10, borderBottom:'1px solid #eef2f7', fontWeight:800 }}>
        Alerts {unseen > 0 && <span style={{
          marginLeft:8, background:'#ef4444', color:'#fff', borderRadius:999, padding:'2px 8px', fontSize:12
        }}>{unseen}</span>}
      </div>
      <div style={{ maxHeight:240, overflow:'auto', padding:8 }}>
        {items.length === 0 && <div style={{color:'#64748b'}}>No alerts yet.</div>}
        {items.slice(0,20).map(a => (
          <button key={a.id} onClick={()=>onOpen(a)}
            style={{ display:'block', width:'100%', textAlign:'left',
            padding:'8px', marginBottom:6, border:'1px solid #e5e7eb', borderRadius:8, background:'#fff' }}>
            <div style={{fontWeight:700}}>
              {a.severity === "critical" ? "🚨 " : a.severity === "warning" ? "⚠️ " : "ℹ️ "}
              {a.label}{a.count ? ` (x${a.count})` : ""}
            </div>
            <div style={{fontSize:12, color:'#334155'}}>{new Date(a.ts).toLocaleTimeString()}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
