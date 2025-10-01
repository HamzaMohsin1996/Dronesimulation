// src/components/MapWithAlerts.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// -------- Types
type Severity = "critical" | "warning" | "info";
type Coord = [number, number];
type AlertEvent = {
  id: string;
  ts: number;
  severity: Severity;
  kind: "person" | "fire" | "link-loss" | "battery-low" | "other";
  label: string;
  coord?: Coord;
  count?: number;
};

// ======= Inline Alert Center (visual-only) =======
function useAlertCenter() {
  const [active, setActive] = useState<AlertEvent | null>(null);
  const [queue, setQueue] = useState<AlertEvent[]>([]);
  const [unseen, setUnseen] = useState(0);
  const lastUserPanRef = useRef(0);               // map interaction guard
  const lastShownRef = useRef<number>(0);         // banner rate-limit
  const RATE_LIMIT_MS = 800;                      // don’t swap banner faster than this
  const COALESCE_MS = 5000;                       // burst coalescing window

  const coalesce = (prev: AlertEvent | null, evt: AlertEvent) => {
    if (!prev) return null;
    if (prev.severity !== evt.severity || prev.kind !== evt.kind) return null;
    if (!prev.coord || !evt.coord) return null;
    if (Math.abs(prev.ts - evt.ts) > COALESCE_MS) return null;
    const [lngA, latA] = prev.coord; const [lngB, latB] = evt.coord;
    const near = Math.abs(lngA - lngB) < 0.0003 && Math.abs(latA - latB) < 0.0003; // ~30m
    return near ? ({ ...prev, ts: evt.ts, count: (prev.count ?? 1) + (evt.count ?? 1) }) : null;
  };

  const show = useCallback((evt: AlertEvent) => {
    setQueue((q) => {
      // coalesce with most recent in queue if possible
      const last = q[q.length - 1] ?? null;
      const merged = coalesce(last, evt);
      if (merged) return [...q.slice(0, -1), merged];
      return [...q, evt];
    });
    setUnseen((u) => u + 1);
  }, []);

  // rotate queue into active with rate-limit
  useEffect(() => {
    if (active || queue.length === 0) return;
    const now = Date.now();
    const wait = Math.max(0, RATE_LIMIT_MS - (now - lastShownRef.current));
    const t = setTimeout(() => {
      lastShownRef.current = Date.now();
      setActive(queue[0]);
      setQueue((q) => q.slice(1));
    }, wait);
    return () => clearTimeout(t);
  }, [active, queue]);

  const acknowledge = useCallback(() => setActive(null), []);
  const markSeen = useCallback(() => setUnseen(0), []);

  return {
    active, unseen, queue, show, acknowledge, markSeen,
    lastUserPanRef, setQueue
  };
}

// ======= Banner (visual, ARIA) =======
function AlertBanner({ alert, onAck }: { alert: AlertEvent | null; onAck: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === "Space") { e.preventDefault(); onAck(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAck]);

  // Title flash (visual cue, no sound)
  useEffect(() => {
    if (!alert) { document.title = document.title.replace(/^\(\d+\)\s*/, ""); return; }
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    let tick = false;
    const id = window.setInterval(() => {
      tick = !tick;
      document.title = tick ? `(1) ${base}` : base;
    }, 900);
    return () => { window.clearInterval(id); document.title = base; };
  }, [alert]);

  if (!alert) return null;
  const color = alert.severity === "critical" ? "#fee2e2" : alert.severity === "warning" ? "#fef3c7" : "#e0f2fe";
  const fg    = alert.severity === "critical" ? "#7f1d1d" : alert.severity === "warning" ? "#7c2d12" : "#075985";

  return (
    <div
      role="region" aria-live="assertive" aria-label={`Alert ${alert.severity}`}
      style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 3000,
        background: color, color: fg, borderBottom: "1px solid rgba(0,0,0,0.08)",
        padding: "10px 12px", display: "flex", gap: 12, alignItems: "center"
      }}
    >
      <strong style={{ fontWeight: 800 }}>
        {alert.severity === "critical" ? "🚨" : alert.severity === "warning" ? "⚠️" : "ℹ️"}
      </strong>
      <div style={{ fontWeight: 700 }}>
        {alert.label}{alert.count ? ` (x${alert.count})` : ""}
      </div>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{new Date(alert.ts).toLocaleTimeString()}</div>
      <button
        onClick={onAck}
        style={{ marginLeft: "auto", padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
      >
        Acknowledge (Space)
      </button>
    </div>
  );
}

// ======= Dock (recent alerts list) =======
function AlertDock({
  items, unseen, onOpen
}: { items: AlertEvent[]; unseen: number; onOpen: (a: AlertEvent) => void }) {
  return (
    <div style={{
      position: "absolute", right: 12, bottom: 12, zIndex: 1600,
      width: 320, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12
    }}>
      <div style={{ padding: 10, borderBottom: "1px solid #eef2f7", fontWeight: 800 }}>
        Alerts {unseen > 0 && (
          <span style={{ marginLeft: 8, background: "#ef4444", color: "#fff",
            borderRadius: 999, padding: "2px 8px", fontSize: 12 }}>{unseen}</span>
        )}
      </div>
      <div style={{ maxHeight: 240, overflow: "auto", padding: 8 }}>
        {items.length === 0 && <div style={{ color: "#64748b" }}>No alerts yet.</div>}
        {items.slice(0, 20).map((a) => (
          <button key={a.id} onClick={() => onOpen(a)}
            style={{
              display: "block", width: "100%", textAlign: "left",
              padding: 8, marginBottom: 6, border: "1px solid #e5e7eb",
              borderRadius: 8, background: "#fff"
            }}>
            <div style={{ fontWeight: 700 }}>
              {a.severity === "critical" ? "🚨 " : a.severity === "warning" ? "⚠️ " : "ℹ️ "}
              {a.label}{a.count ? ` (x${a.count})` : ""}
            </div>
            <div style={{ fontSize: 12, color: "#334155" }}>{new Date(a.ts).toLocaleTimeString()}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ======= Main component with MapLibre + visual alerts =======
export default function MapWithAlerts() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const [dockItems, setDockItems] = useState<AlertEvent[]>([]);
  const { active, unseen, queue, show, acknowledge, markSeen, lastUserPanRef } = useAlertCenter();

  // Init map
  useEffect(() => {
    if (!mapEl.current) return;
    const m = new maplibregl.Map({
      container: mapEl.current,
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256 }
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }]
      },
      center: [11.506, 48.718],
      zoom: 13
    });

    m.on("load", () => {
      // source for pulsing alert circle (we’ll setData per alert)
      m.addSource("alert-point", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] }
      });
      m.addLayer({
        id: "alert-ring",
        type: "circle",
        source: "alert-point",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 6, 18, 16],
          "circle-color": "rgba(239,68,68,0.25)",
          "circle-stroke-color": "#ef4444",
          "circle-stroke-width": 2
        }
      });
    });

    // user interaction guard
    const bump = () => { lastUserPanRef.current = Date.now(); };
    m.on("dragstart", bump);
    m.on("zoomstart", bump);
    m.on("rotatestart", bump);

    mapRef.current = m;
    return () => { m.remove(); };
  }, [lastUserPanRef]);

  // When an alert becomes active -> map focus + pulse ring (visual only)
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !active) return;

    // add to dock
    setDockItems((d) => [active, ...d].slice(0, 50));

    // respect recent user interaction: don’t auto-pan for 5s
    const recentlyInteracted = Date.now() - lastUserPanRef.current < 5000;
    if (active.coord && !recentlyInteracted) {
      m.easeTo({ center: active.coord as any, duration: 650 });
    }

    // show pulsing ring for ~6s
    if (active.coord) {
      const fc = {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: { ts: active.ts },
          geometry: { type: "Point", coordinates: active.coord }
        }]
      } as any;
      (m.getSource("alert-point") as maplibregl.GeoJSONSource | undefined)?.setData(fc);

      // simple fade-out timer (no heavy animation)
      const id = setTimeout(() => {
        (m.getSource("alert-point") as maplibregl.GeoJSONSource | undefined)
          ?.setData({ type: "FeatureCollection", features: [] } as any);
      }, 6000);
      return () => clearTimeout(id);
    }
  }, [active, lastUserPanRef]);

  // EXAMPLE: How to raise alerts (replace with your detection pipeline)
  // Press the buttons rendered below to simulate incoming alerts.
  const simulate = useCallback((kind: AlertEvent["kind"], severity: Severity) => {
    const center = mapRef.current?.getCenter()?.toArray() as Coord || [11.506, 48.718];
    const jitter = () => (Math.random() - 0.5) * 0.003;
    const coord: Coord = [center[0] + jitter(), center[1] + jitter()];
    const ts = Date.now();
    show({
      id: `${ts}-${Math.random().toString(36).slice(2,7)}`,
      ts, severity, kind,
      label: kind === "person" ? "Person detected" : kind === "fire" ? "Fire detected" :
             kind === "battery-low" ? "Battery low" : kind === "link-loss" ? "Link loss" : "Event",
      coord, count: 1
    });
  }, [show]);

  return (
    <div style={{ position: "relative", height: "100vh", width: "100vw" }}>
      {/* Alert banner */}
      <AlertBanner alert={active} onAck={() => { acknowledge(); markSeen(); }} />

      {/* Map */}
      <div ref={mapEl} style={{ position: "absolute", inset: 0 }} />

      {/* Alert dock (right-bottom) */}
      <AlertDock
        items={dockItems}
        unseen={unseen}
        onOpen={(a) => {
          // jump to alert location and (optionally) open review window in your app
          if (a.coord) mapRef.current?.flyTo({ center: a.coord as any, zoom: 16 });
          // mark as seen when user opens from dock
          markSeen();
        }}
      />

      {/* Demo controls: remove in production (just to simulate alerts) */}
      <div style={{
        position: "absolute", left: 12, bottom: 12, zIndex: 1700,
        display: "flex", gap: 8, background: "#fff", border: "1px solid #e5e7eb",
        borderRadius: 12, padding: 10
      }}>
        <button onClick={() => simulate("person", "critical")}
          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}>
          Simulate Person (critical)
        </button>
        <button onClick={() => simulate("fire", "critical")}
          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}>
          Simulate Fire (critical)
        </button>
        <button onClick={() => simulate("battery-low", "warning")}
          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}>
          Battery Low (warning)
        </button>
      </div>
    </div>
  );
}
