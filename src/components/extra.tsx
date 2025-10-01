// src/components/MapLibreMap.tsx
import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, Point, Polygon, Geometry } from 'geojson';

import Timeline from './Timeline';
import type { Coord, Detection, DetectionEvent } from '../shared/drone';

import DronePortIcon from '../assets/images/icons/dronePort.svg';
import DroneIcon from '../assets/images/icons/twister.png';

// ---------- Config ----------
const USE_MOCK_WS = true;

// Flight timings
const TRANSIT_DURATION_MS = 10_000;
const ORBIT_LAP_MS = 22_000; // one lap; orbit loops indefinitely
const RETURN_DURATION_MS = 10_000;

// Visual radii
const DEFAULT_SCAN_RADIUS_M = 120; // amber ring (focus)
const DEFAULT_ORBIT_RADIUS_M = 120; // orbit radius

// Street segment buffer
const SEG_BUFFER_M = 25;

// ---------- Types ----------
type DronePort = { coord: Coord; id: string; status: 'idle' | 'in-flight' };
const initialDronePorts: DronePort[] = [
  { coord: [11.505, 48.719], id: 'drone-port-1', status: 'idle' },
  { coord: [11.502, 48.716], id: 'drone-port-2', status: 'idle' },
];

type ScanMode = 'CLICK' | 'STREET_SEGMENT' | 'AOI' | 'POI';

type MissionGeometry =
  | { kind: 'point'; center: Coord }
  | { kind: 'segment'; line: Feature; buffer: Feature } // corridor scan
  | { kind: 'aoi'; polygon: FeatureCollection<Polygon>; center: Coord } // AOI center
  | { kind: 'poi'; center: Coord };

type RouteInfo = {
  polyline?: Feature;
  distance_m?: number;
  duration_s?: number;
  eta?: string;
};

// ---------- Mock detections ----------
const isImportant = (label: string, score = 0) =>
  (label === 'fire' || label === 'people' || label === 'person' || label === 'chemical') &&
  score >= 0.7;

function makeMockFrame(center: Coord): { dets: Detection[]; geo: Coord } {
  const jitter = () => (Math.random() - 0.5) * 0.00055;
  const geo: Coord = [center[0] + jitter(), center[1] + jitter()];
  const dets: Detection[] = [];
  const maybe = (label: Detection['label'], p = 0.55) => {
    if (Math.random() < p)
      dets.push({
        id: Math.random().toString(36),
        label,
        score: 0.8 + Math.random() * 0.18,
        bbox: [0, 0, 0, 0],
      });
  };
  const dice = Math.random();
  if (dice < 0.25) maybe('fire', 0.9);
  else if (dice < 0.5) maybe('people', 0.85);
  else if (dice < 0.65) maybe('chemical', 0.8);
  else if (dice < 0.8) maybe('person', 0.5);
  return { dets, geo };
}

// ---------- Minimal surfacing (no auto-dispatch) ----------
type EngineState = { lastByCell: Record<string, { count: number; lastTs: number }> };
const CELL_DEG = 0.00035; // ~35m
const cellKey = (label: string, [lng, lat]: Coord) =>
  `${label}:${Math.round(lng / CELL_DEG)}:${Math.round(lat / CELL_DEG)}`;
const THR = {
  fire: { conf: 0.88, persist: 2 },
  people: { conf: 0.9, persist: 2 },
  person: { conf: 0.9, persist: 2 },
  chemical: { conf: 0.85, persist: 1 },
};
const GAP_MS = 12_000;
const initEngine = (): EngineState => ({ lastByCell: {} });
function shouldSurface(
  st: EngineState,
  ev: { label: string; score: number; coord: Coord; ts: number }
) {
  const thr = (THR as any)[ev.label];
  if (!thr || ev.score < thr.conf) return false;
  const key = cellKey(ev.label, ev.coord);
  const prev = st.lastByCell[key];
  if (!prev || ev.ts - prev.lastTs > GAP_MS) st.lastByCell[key] = { count: 1, lastTs: ev.ts };
  else st.lastByCell[key] = { count: prev.count + 1, lastTs: ev.ts };
  return st.lastByCell[key].count >= thr.persist;
}

// ---------- Small UI ----------
const Alert = ({ msg }: { msg: string | null }) =>
  !msg ? null : (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        background: '#fff3cd',
        color: '#854d0e',
        fontWeight: 700,
        padding: 10,
        textAlign: 'center',
        zIndex: 2000,
      }}
    >
      {msg}
    </div>
  );

// ---------- Component ----------
export default function MapLibreMap() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapReadyRef = useRef(false);

  const droneMarkerRef = useRef<maplibregl.Marker | null>(null);
  const originPortRef = useRef<DronePort | null>(null);

  const [msg, setMsg] = useState<string | null>(null);
  const [dronePorts, setDronePorts] = useState<DronePort[]>(initialDronePorts);

  // Search (POI)
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  // Modes & geometry
  const [scanMode, setScanMode] = useState<ScanMode>('CLICK');
  const [draftPoints, setDraftPoints] = useState<Coord[]>([]);
  const [missionGeom, setMissionGeom] = useState<MissionGeometry | null>(null);

  // Orbit settings
  const [orbitRadius, setOrbitRadius] = useState(DEFAULT_ORBIT_RADIUS_M);

  // Mission state
  const [scanCenter, setScanCenter] = useState<Coord | null>(null);
  const [recording, setRecording] = useState(false);
  const [missionActive, setMissionActive] = useState(false); // controls orbit loop & RTB availability

  // Detections
  const [scanHits, setScanHits] = useState<DetectionEvent[]>([]);
  const [events, setEvents] = useState<DetectionEvent[]>([]);

  // Timeline & review
  const [reviewMode, setReviewMode] = useState(false);
  const [unread, setUnread] = useState(0);
  const [timeWindow, setTimeWindow] = useState<[number, number]>([
    Date.now() - 10 * 60_000,
    Date.now(),
  ]);

  // Missed/Return brief
  const [missedSince, setMissedSince] = useState<number | null>(null);

  // Fast route
  const [route, setRoute] = useState<RouteInfo | null>(null);

  // Engine
  const engineRef = useRef<EngineState>(initEngine());

  const toast = (t: string) => {
    setMsg(t);
    window.setTimeout(() => setMsg(null), 3000);
  };
  // small helper to build a FeatureCollection
  const fc = (features: any[] = []) => ({ type: 'FeatureCollection', features });

  // ---------- Map init ----------
  useEffect(() => {
    if (!mapEl.current) return;
    const m = new maplibregl.Map({
      container: mapEl.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [11.506, 48.718],
      zoom: 13,
    });

    m.on('load', () => {
      // Ports
      initialDronePorts.forEach(({ coord }) => {
        const el = document.createElement('div');
        el.style.width = '30px';
        el.style.height = '30px';
        el.style.transform = 'translate(-50%,-50%)';
        el.style.pointerEvents = 'none';
        const img = document.createElement('img');
        img.src = DronePortIcon;
        img.alt = 'Drone Port';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        el.appendChild(img);
        new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(coord).addTo(m);
      });

      // Drawing / mission geometry
      m.addSource('builder', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      m.addLayer({
        id: 'builder-line',
        type: 'line',
        source: 'builder',
        paint: { 'line-color': '#0a84ff', 'line-width': 3, 'line-dasharray': [2, 2] },
      });
      m.addLayer({
        id: 'builder-fill',
        type: 'fill',
        source: 'builder',
        paint: { 'fill-color': '#0a84ff', 'fill-opacity': 0.08 },
      });

      // Scan ring
      m.addSource('scan-ring', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      m.addLayer({
        id: 'scan-fill',
        type: 'fill',
        source: 'scan-ring',
        paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.12 },
      });
      m.addLayer({
        id: 'scan-line',
        type: 'line',
        source: 'scan-ring',
        paint: { 'line-color': '#f59e0b', 'line-width': 2 },
      });

      // Path lines
      m.addSource('covered', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [] },
          properties: {},
        },
      });
      m.addLayer({
        id: 'path-covered',
        type: 'line',
        source: 'covered',
        paint: { 'line-color': '#16a34a', 'line-width': 4 },
      });

      m.addSource('remaining', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [] },
          properties: {},
        },
      });
      m.addLayer({
        id: 'path-rem',
        type: 'line',
        source: 'remaining',
        paint: { 'line-color': '#64748b', 'line-width': 2, 'line-dasharray': [2, 2] },
      });

      // Live hits
      m.addSource('scan-hits', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      m.addLayer({
        id: 'hits',
        type: 'circle',
        source: 'scan-hits',
        paint: {
          'circle-radius': 5,
          'circle-color': [
            'match',
            ['get', 'label'],
            'fire',
            '#ef4444',
            'people',
            '#0ea5e9',
            'person',
            '#0ea5e9',
            'chemical',
            '#eab308',
            '#6b7280',
          ],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1,
        },
      });

      // Critical hits (bigger)
      m.addSource('critical-hits', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      m.addLayer({
        id: 'critical-cir',
        type: 'circle',
        source: 'critical-hits',
        paint: {
          'circle-radius': 10,
          'circle-color': [
            'match',
            ['get', 'label'],
            'fire',
            '#ef4444',
            'people',
            '#0ea5e9',
            'person',
            '#0ea5e9',
            '#6b7280',
          ],
          'circle-stroke-color': '#111827',
          'circle-stroke-width': 2,
        },
      });

      // Recorded (review mode)
      m.addSource('recorded', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      m.addLayer({
        id: 'rec-cir',
        type: 'circle',
        source: 'recorded',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': 6,
          'circle-color': [
            'match',
            ['get', 'label'],
            'fire',
            '#ef4444',
            'people',
            '#0ea5e9',
            'person',
            '#0ea5e9',
            'chemical',
            '#eab308',
            '#6b7280',
          ],
          'circle-stroke-color': '#111827',
          'circle-stroke-width': 1,
        },
      });
      m.addLayer({
        id: 'rec-lbl',
        type: 'symbol',
        source: 'recorded',
        layout: {
          visibility: 'none',
          'text-field': ['to-string', ['get', 'label']],
          'text-size': 11,
          'text-offset': [0, 1.2],
        },
        paint: { 'text-color': '#111827', 'text-halo-color': '#fff', 'text-halo-width': 1 },
      });

      // Emergency route
      m.addSource('emergency-route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      m.addLayer({
        id: 'emergency-route-line',
        type: 'line',
        source: 'emergency-route',
        paint: { 'line-color': '#111827', 'line-width': 4 },
      });

      mapReadyRef.current = true;
    });

    mapRef.current = m;
    return () => {
      m.remove();
    };
  }, []);

  // ---------- helpers ----------
  const setData = (id: string, data: any) => {
    const m = mapRef.current;
    if (!m) return;
    const doSet = () => (m.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(data);
    m.isStyleLoaded() ? doSet() : m.once('idle', doSet);
  };
  const setBuilder = (fc: any) => setData('builder', fc);
  const setRouteLine = (feat?: Feature) =>
    setData('emergency-route', { type: 'FeatureCollection', features: feat ? [feat] : [] });

  const drawScanRing = (center: Coord, radiusM = DEFAULT_SCAN_RADIUS_M) => {
    const poly = turf.circle(center, radiusM, { steps: 72, units: 'meters' });
    setData('scan-ring', { type: 'FeatureCollection', features: [poly as any] });
  };

  // ---------- SEARCH (POI) ----------
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearchErr(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=geojson&q=${encodeURIComponent(
        query
      )}&polygon_geojson=1&limit=1`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      const feat: Feature<Geometry> | undefined = data?.features?.[0];
      if (!feat) throw new Error('No results');

      let center: Coord;
      let highlight: Feature; // <- we’ll use this for fitBounds

      if (feat.geometry.type === 'Polygon' || feat.geometry.type === 'MultiPolygon') {
        const poly =
          feat.geometry.type === 'Polygon'
            ? turf.polygon(feat.geometry.coordinates as any)
            : turf.multiPolygon(feat.geometry.coordinates as any);
        center = turf.centerOfMass(poly as any).geometry.coordinates as Coord;
        highlight = poly as any;
      } else if ((feat as any).bbox) {
        const [minx, miny, maxx, maxy] = (feat as any).bbox;
        const bboxPoly = turf.bboxPolygon([minx, miny, maxx, maxy]);
        center = [(minx + maxx) / 2, (miny + maxy) / 2];
        highlight = bboxPoly as any;
      } else {
        const pt = feat.geometry as any;
        center = pt.coordinates as Coord;
        const bb = turf.circle(center, 150, { units: 'meters' });
        highlight = bb as any;
      }

      setMissionGeom({ kind: 'poi', center });
      setBuilder(fc([highlight]));
      const bbox = turf.bbox(highlight as any);
      mapRef.current?.fitBounds(bbox as any, { padding: 40, duration: 800 });
      mapRef.current?.flyTo({ center, zoom: 15 });
    } catch (err: any) {
      setSearchErr(err?.message || 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  // ---------- Build geometries: Street Segment & AOI ----------
  function finalizeStreetSegment(a: Coord, b: Coord) {
    const line = turf.lineString([a, b]);
    const buf = turf.buffer(line, SEG_BUFFER_M, { units: 'meters' });
    setMissionGeom({ kind: 'segment', line: line as any, buffer: buf as any });
    setBuilder({ type: 'FeatureCollection', features: [buf as any, line as any] });
    mapRef.current?.fitBounds(turf.bbox(buf as any) as any, { padding: 40, duration: 800 });
  }

  function finalizeAOI(points: Coord[]) {
    if (points.length === 2) {
      const bbox = turf.bboxPolygon(turf.bbox(turf.lineString(points)));
      const center = turf.centerOfMass(bbox as any).geometry.coordinates as Coord;
      setMissionGeom({
        kind: 'aoi',
        polygon: { type: 'FeatureCollection', features: [bbox as any] },
        center,
      });
      setBuilder({ type: 'FeatureCollection', features: [bbox as any] });
      mapRef.current?.fitBounds(turf.bbox(bbox as any) as any, { padding: 40, duration: 800 });
    } else if (points.length >= 3) {
      const poly = turf.polygon([[...points, points[0]]]);
      const center = turf.centerOfMass(poly as any).geometry.coordinates as Coord;
      setMissionGeom({
        kind: 'aoi',
        polygon: { type: 'FeatureCollection', features: [poly as any] },
        center,
      });
      setBuilder({ type: 'FeatureCollection', features: [poly as any] });
      mapRef.current?.fitBounds(turf.bbox(poly as any) as any, { padding: 40, duration: 800 });
    }
  }

  // ---------- Map interactions for modes ----------
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReadyRef.current) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const c: Coord = [e.lngLat.lng, e.lngLat.lat];

      if (scanMode === 'CLICK') {
        setMissionGeom({ kind: 'point', center: c });
        const ring = turf.circle(c, DEFAULT_SCAN_RADIUS_M, { units: 'meters' });
        setBuilder({ type: 'FeatureCollection', features: [ring as any] });
        m.flyTo({ center: c, zoom: 15 });
        return;
      }

      if (scanMode === 'STREET_SEGMENT') {
        setDraftPoints((prev) => {
          const next = [...prev, c];

          if (next.length === 1) {
            // preview the first pick (small circle), NOT a line yet
            const dot = turf.circle(c, 10, { units: 'meters' });
            setBuilder(fc([dot as any]));
          } else if (next.length >= 2) {
            // show a simple line preview and immediately finalize with buffer
            const a = next[0],
              b = next[1];
            const line = turf.lineString([a, b]);
            setBuilder(fc([line as any]));
            finalizeStreetSegment(a, b);
          }

          // keep only last two points
          return next.slice(-2);
        });
        return;
      }
      if (scanMode === 'AOI') {
        setDraftPoints((prev) => {
          const next = [...prev, c];

          if (next.length === 1) {
            const dot = turf.circle(c, 10, { units: 'meters' });
            setBuilder(fc([dot as any]));
          } else if (next.length === 2) {
            const bboxPoly = turf.bboxPolygon(turf.bbox(turf.lineString(next)));
            setBuilder(fc([bboxPoly as any]));
          } else {
            const ring = [...next, next[0]];
            const poly = turf.polygon([ring]);
            setBuilder(fc([poly as any]));
          }

          return next;
        });
        return;
      }

      // POI is via search
    };

    const onKey = (ev: KeyboardEvent) => {
      if (scanMode === 'AOI' && ev.key === 'Enter') {
        ev.preventDefault();
        if (draftPoints.length >= 2) finalizeAOI(draftPoints);
        setDraftPoints([]);
      }
      if (ev.key === 'Escape') {
        setDraftPoints([]);
        setMissionGeom(null);
        setBuilder(fc());
      }
    };

    m.on('click', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      m.off('click', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [scanMode, draftPoints]);

  // ---------- Start / Orbit / End Mission ----------
  const startOrbitScanAt = (center: Coord) => {
    if (!mapReadyRef.current || !mapRef.current) {
      toast('Map not ready');
      return;
    }

    // choose nearest idle port
    const avail = dronePorts.filter((d) => d.status === 'idle');
    if (!avail.length) {
      toast('🚫 No available drones');
      return;
    }
    const origin = avail.reduce((a, b) => {
      const da = turf.distance(turf.point(a.coord), turf.point(center), { units: 'kilometers' });
      const db = turf.distance(turf.point(b.coord), turf.point(center), { units: 'kilometers' });
      return da < db ? a : b;
    });
    originPortRef.current = origin;

    // record session window (live end keeps extending)
    setRecording(true);
    setReviewMode(false);
    setEvents([]);
    setUnread(0);
    setMissionActive(true);
    const now0 = Date.now();
    setTimeWindow([now0 - 5 * 60_000, now0 + 30 * 60_000]);

    // visuals
    drawScanRing(center, DEFAULT_SCAN_RADIUS_M);
    setRoute(null);
    setRouteLine(); // clear any prior route card

    // prepare paths
    const m = mapRef.current!;
    const toTargetLine = turf.lineString([origin.coord, center]);
    setData('covered', {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [] },
      properties: {},
    });
    setData('remaining', { type: 'Feature', geometry: toTargetLine.geometry, properties: {} });

    // status
    setDronePorts((prev) =>
      prev.map((p) => (p.id === origin.id ? { ...p, status: 'in-flight' } : p))
    );

    // drone marker
    droneMarkerRef.current?.remove();
    const el = document.createElement('div');
    el.style.width = '34px';
    el.style.height = '34px';
    el.style.transform = 'translate(-50%,-50%)';
    el.style.pointerEvents = 'none';
    const img = document.createElement('img');
    img.src = DroneIcon;
    img.alt = 'Drone';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    el.appendChild(img);
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(origin.coord)
      .addTo(m);
    droneMarkerRef.current = marker;

    // camera & center
    m.flyTo({ center, zoom: 15 });
    setScanCenter(center);

    // Transit animation
    const totalKm = turf.length(toTargetLine, { units: 'kilometers' });
    let t0: number | null = null;
    const animateTransit = (now: number) => {
      if (!missionActive) return;
      if (t0 === null) t0 = now;
      const prog = Math.min((now - t0) / TRANSIT_DURATION_MS, 1);
      const distKm = totalKm * prog;
      try {
        const along = turf.along(toTargetLine, distKm, { units: 'kilometers' }) as Feature<Point>;
        const pt = along.geometry.coordinates as Coord;
        marker.setLngLat(pt);

        const cov = turf.lineSlice(turf.point(origin.coord), turf.point(pt), toTargetLine);
        setData('covered', { type: 'Feature', geometry: cov.geometry, properties: {} });
        setData('remaining', { type: 'Feature', geometry: toTargetLine.geometry, properties: {} });

        if (prog < 1) requestAnimationFrame(animateTransit);
        else startOrbitLoop(center, marker);
      } catch (e) {
        console.error(e);
        toast('❌ Transit error.');
      }
    };
    requestAnimationFrame(animateTransit);
  };

  const startScanFromGeometry = () => {
    if (!missionGeom) {
      toast('Select a scan target.');
      return;
    }
    let center: Coord | null = null;
    if (missionGeom.kind === 'point' || missionGeom.kind === 'poi') center = missionGeom.center;
    else if (missionGeom.kind === 'aoi') center = missionGeom.center;
    else if (missionGeom.kind === 'segment')
      center = turf.center(missionGeom.line as any).geometry.coordinates as Coord;
    if (!center) {
      toast('No center for mission');
      return;
    }
    startOrbitScanAt(center);
  };

  const startOrbitLoop = (center: Coord, marker: maplibregl.Marker) => {
    const orbit = turf.circle(center, orbitRadius || DEFAULT_ORBIT_RADIUS_M, {
      steps: 160,
      units: 'meters',
    });
    const orbitLine = turf.polygonToLine(orbit as any) as Feature<any>;
    const orbitLenKm = turf.length(orbitLine as any, { units: 'kilometers' });
    let loopStart = performance.now();

    const loop = (tNow: number) => {
      if (!missionActive) return; // stop when mission ends
      const oProg = ((tNow - loopStart) % ORBIT_LAP_MS) / ORBIT_LAP_MS;
      const dKm = orbitLenKm * oProg;
      const aO = turf.along(orbitLine as any, dKm, { units: 'kilometers' }) as Feature<Point>;
      marker.setLngLat(aO.geometry.coordinates as Coord);

      setData('covered', {
        type: 'Feature',
        geometry: (orbitLine as any).geometry,
        properties: {},
      });
      setData('remaining', {
        type: 'Feature',
        geometry: (orbitLine as any).geometry,
        properties: {},
      });

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };

  const endMissionAndReturn = () => {
    if (!missionActive) return;
    setMissionActive(false);
    setRecording(false);

    const active = originPortRef.current;
    const marker = droneMarkerRef.current;
    if (!active || !marker) {
      setDronePorts((prev) => prev.map((p) => ({ ...p, status: 'idle' })));
      setReviewMode(true);
      return;
    }

    const from = marker.getLngLat().toArray() as Coord;
    const returnLine = turf.lineString([from, active.coord]);
    const totalKmBack = turf.length(returnLine, { units: 'kilometers' });
    let r0: number | null = null;

    const animateReturn = (now: number) => {
      if (r0 === null) r0 = now;
      const prog = Math.min((now - r0) / RETURN_DURATION_MS, 1);
      const distKm = totalKmBack * prog;
      try {
        const along = turf.along(returnLine, distKm, { units: 'kilometers' }) as Feature<Point>;
        marker.setLngLat(along.geometry.coordinates as Coord);

        const cov = turf.lineSlice(
          turf.point(from),
          turf.point(along.geometry.coordinates as Coord),
          returnLine
        );
        setData('covered', { type: 'Feature', geometry: cov.geometry, properties: {} });
        setData('remaining', { type: 'Feature', geometry: returnLine.geometry, properties: {} });

        if (prog < 1) requestAnimationFrame(animateReturn);
        else {
          toast('✅ Mission complete — drone returned to base.');
          setDronePorts((prev) =>
            prev.map((p) => (p.id === active.id ? { ...p, status: 'idle' } : p))
          );
          setReviewMode(true);
          setTimeWindow((prev) => {
            if (!events.length) return prev;
            const min = Math.min(...events.map((e) => e.ts));
            const max = Math.max(...events.map((e) => e.ts));
            return [min - 10_000, max + 10_000];
          });
        }
      } catch (e) {
        console.error(e);
        toast('❌ Return flight error.');
      }
    };
    requestAnimationFrame(animateReturn);
  };

  // ---------- Detections loop ----------
  useEffect(() => {
    if (!USE_MOCK_WS) return;
    const id = window.setInterval(() => {
      const center = scanCenter ??
        (mapRef.current?.getCenter()?.toArray() as Coord) ?? [11.506, 48.718];
      const { dets, geo } = makeMockFrame(center);

      if (recording) {
        const ts = Date.now();
        const hits = dets.filter((d) => isImportant(d.label, d.score));
        if (hits.length) {
          const evs = hits.map<DetectionEvent>((d) => ({
            id: `${ts}-${d.id}`,
            ts,
            label: d.label,
            score: d.score,
            coord: geo,
            seen: reviewMode,
          }));
          setEvents((prev) => [...prev, ...evs]);
          if (!reviewMode) setUnread((u) => u + evs.length);
          if (!reviewMode) setTimeWindow(([from, _]) => [from, Date.now()]);
        }
      }

      // live scan & criticals
      const ts = Date.now();
      const live = dets
        .filter((d) => ['fire', 'people', 'person', 'chemical'].includes(d.label))
        .map<DetectionEvent>((d) => ({
          id: `${ts}-${d.id}`,
          ts,
          label: d.label,
          score: d.score,
          coord: geo,
          seen: reviewMode,
        }));
      if (live.length) {
        setScanHits((p) => [...p, ...live]);
        setData('scan-hits', {
          type: 'FeatureCollection',
          features: live.map((e) => ({
            type: 'Feature',
            properties: { label: e.label },
            geometry: { type: 'Point', coordinates: e.coord },
          })),
        });

        const critical = live.filter(
          (e) => e.label === 'fire' || e.label === 'people' || e.label === 'person'
        );
        if (critical.length) {
          setData('critical-hits', {
            type: 'FeatureCollection',
            features: critical.map((e) => ({
              type: 'Feature',
              properties: { label: e.label },
              geometry: { type: 'Point', coordinates: e.coord },
            })),
          });
          if (!reviewMode && mapRef.current) {
            const last = critical[critical.length - 1];
            mapRef.current.easeTo({
              center: last.coord as any,
              duration: 600,
              easing: (t) => t * t,
            });
          }
        }
      }

      // Optional toast: we already show on map
      for (const d of dets) {
        if (shouldSurface(engineRef.current, { label: d.label, score: d.score, coord: geo, ts }))
          break;
      }
    }, 1200);
    return () => window.clearInterval(id);
  }, [recording, reviewMode, scanCenter]);

  // ---------- Review layer & timeline ----------
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (reviewMode) {
      setUnread(0);
      setEvents((prev) => prev.map((e) => ({ ...e, seen: true })));
    }
    const inWin = events.filter((e) => e.ts >= timeWindow[0] && e.ts <= timeWindow[1]);
    setData('recorded', {
      type: 'FeatureCollection',
      features: inWin.map((e) => ({
        type: 'Feature',
        properties: { label: e.label, ts: e.ts },
        geometry: { type: 'Point', coordinates: e.coord },
      })),
    });
    const vis = reviewMode ? 'visible' : 'none';
    if (m.getLayer('rec-cir')) m.setLayoutProperty('rec-cir', 'visibility', vis);
    if (m.getLayer('rec-lbl')) m.setLayoutProperty('rec-lbl', 'visibility', vis);
  }, [events, reviewMode, timeWindow]);

  const handleSelectEvent = (ev: DetectionEvent) => {
    setReviewMode(true);
    setTimeWindow([ev.ts - 30_000, ev.ts + 15_000]);
    mapRef.current?.flyTo({ center: ev.coord, zoom: 16 });
    if (droneMarkerRef.current) droneMarkerRef.current.setLngLat(ev.coord);
    toast(`⏪ Jumped to ${ev.label.toUpperCase()} @ ${new Date(ev.ts).toLocaleTimeString()}`);
  };

  // ---------- Away & Back: Quick Brief ----------
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') setMissedSince(Date.now());
      else {
        const since = missedSince;
        if (!since) return;
        const now = Date.now();
        const missedEv = events.filter((e) => e.ts >= since);
        if (missedEv.length) {
          setReviewMode(true);
          setTimeWindow([Math.max(since - 5_000, events[0]?.ts ?? since), now]);
          toast('👋 You were away — Quick Brief ready.');
        }
        setMissedSince(null);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [events, missedSince]);

  // ---------- Fast Emergency Route ----------
  async function computeEmergencyRoute(to: Coord) {
    const origin = dronePorts.reduce((a, b) => {
      const da = turf.distance(turf.point(a.coord), turf.point(to));
      const db = turf.distance(turf.point(b.coord), turf.point(to));
      return da < db ? a : b;
    });
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${origin.coord[0]},${origin.coord[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const json = await res.json();
      const r = json?.routes?.[0];
      if (!r) {
        toast('No route found');
        setRoute(null);
        setRouteLine();
        return;
      }
      const feat: Feature = { type: 'Feature', properties: {}, geometry: r.geometry };
      setRouteLine(feat);
      const arrival = new Date(Date.now() + r.duration * 1000).toLocaleTimeString();
      setRoute({ polyline: feat, distance_m: r.distance, duration_s: r.duration, eta: arrival });
    } catch (e) {
      toast('Routing error');
      setRoute(null);
      setRouteLine();
    }
  }

  const lastCritical = [...events]
    .reverse()
    .find((e) => e.label === 'fire' || e.label === 'people' || e.label === 'person');

  // Quick Brief panel
  const QuickBrief = () => {
    if (!reviewMode) return null;
    const from = timeWindow[0],
      to = timeWindow[1];
    const inWin = events.filter((e) => e.ts >= from && e.ts <= to);
    if (!inWin.length) return null;
    const fire = inWin.filter((e) => e.label === 'fire').length;
    const ppl = inWin.filter((e) => e.label === 'people' || e.label === 'person').length;
    const chem = inWin.filter((e) => e.label === 'chemical').length;

    return (
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 1400,
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 12,
          minWidth: 260,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Quick Brief</div>
        <div style={{ fontSize: 13, color: '#334155', marginBottom: 6 }}>
          Window: {new Date(from).toLocaleTimeString()}–{new Date(to).toLocaleTimeString()}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <div style={{ padding: '4px 8px', borderRadius: 8, background: '#fee2e2' }}>
            🔥 {fire}
          </div>
          <div style={{ padding: '4px 8px', borderRadius: 8, background: '#e0f2fe' }}>👥 {ppl}</div>
          <div style={{ padding: '4px 8px', borderRadius: 8, background: '#fef9c3' }}>
            🧪 {chem}
          </div>
        </div>
        {lastCritical && (
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            Last critical: <strong>{lastCritical.label}</strong> at{' '}
            {new Date(lastCritical.ts).toLocaleTimeString()}
            <div>
              <button
                onClick={() => handleSelectEvent(lastCritical)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  background: '#fff',
                  marginTop: 6,
                }}
              >
                Jump to event
              </button>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button
            onClick={() => {
              // prefer route to lastCritical; else route to scan center
              const target =
                lastCritical?.coord ??
                (missionGeom?.kind === 'point' || missionGeom?.kind === 'poi'
                  ? missionGeom.center
                  : missionGeom?.kind === 'aoi'
                  ? missionGeom.center
                  : missionGeom?.kind === 'segment'
                  ? (turf.center((missionGeom as any).line).geometry.coordinates as Coord)
                  : null);
              if (target) computeEmergencyRoute(target as Coord);
            }}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #111827',
              background: '#fff',
            }}
          >
            Fast Emergency Route
          </button>
          <button
            onClick={() => setTimeWindow([Date.now() - 10 * 60_000, Date.now()])}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              background: '#fff',
            }}
          >
            Last 10 min
          </button>
        </div>
      </div>
    );
  };

  // Emergency Route card
  const RouteCard = () => {
    if (!route?.duration_s) return null;
    const mins = Math.round(route.duration_s / 60);
    const km = (route.distance_m! / 1000).toFixed(1);
    const brief = `Fast route ${km} km / ${mins} min (ETA ${route.eta}).`;
    return (
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 1400,
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 12,
          minWidth: 260,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Emergency Route</div>
        <div style={{ fontSize: 13, color: '#334155', marginBottom: 8 }}>
          {km} km • {mins} min • ETA {route.eta}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => navigator.clipboard?.writeText(brief)}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #0a84ff',
              background: '#0a84ff',
              color: '#fff',
              fontWeight: 600,
            }}
          >
            Copy radio brief
          </button>
          <button
            onClick={() => {
              setRoute(null);
              setRouteLine();
            }}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              background: '#fff',
            }}
          >
            Clear
          </button>
        </div>
      </div>
    );
  };

  // ---------- Layout ----------
  const bottomInset = 170;

  return (
    <div style={{ position: 'relative', height: '100vh', width: '100vw' }}>
      <Alert msg={msg} />
      {route ? <RouteCard /> : <QuickBrief />}

      {/* Map */}
      <div
        ref={mapEl}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: bottomInset }}
      />

      {/* Controls (top-left) */}
      <form
        onSubmit={handleSearch}
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          background: '#fff',
          padding: 12,
          borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 1200,
          display: 'grid',
          gap: 10,
          minWidth: 320,
        }}
      >
        <div style={{ fontWeight: 800, color: '#111827' }}>Scan Mode</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['CLICK', 'STREET_SEGMENT', 'AOI', 'POI'] as ScanMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setScanMode(m);
                setDraftPoints([]);
                setBuilder({ type: 'FeatureCollection', features: [] });
                setMissionGeom(null);
              }}
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                cursor: 'pointer',
                border: `1px solid ${scanMode === m ? '#0a84ff' : '#e5e7eb'}`,
                background: scanMode === m ? '#0a84ff' : '#fff',
                color: scanMode === m ? '#fff' : '#111',
              }}
            >
              {m === 'CLICK'
                ? 'Click Map'
                : m === 'STREET_SEGMENT'
                ? 'Street Segment'
                : m === 'AOI'
                ? 'Area of Interest'
                : 'Point of Interest'}
            </button>
          ))}
        </div>

        {/* POI search */}
        {scanMode === 'POI' && (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search POI (address, park, city)…"
                style={{
                  flex: 1,
                  border: '1px solid #e5e7eb',
                  padding: '8px 10px',
                  borderRadius: 8,
                }}
              />
              <button
                type="submit"
                disabled={searching}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #0a84ff',
                  background: '#0a84ff',
                  color: '#fff',
                }}
              >
                {searching ? 'Searching…' : 'Search'}
              </button>
            </div>
            {searchErr && <div style={{ color: '#b91c1c', fontSize: 12 }}>{searchErr}</div>}
          </>
        )}

        {/* Orbit builder */}
        {(missionGeom ||
          scanMode === 'CLICK' ||
          scanMode === 'AOI' ||
          scanMode === 'STREET_SEGMENT') && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 700, color: '#111827' }}>Orbit</div>
            <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#334155' }}>
              Radius: <span style={{ fontWeight: 600 }}>{orbitRadius} m</span>
              <input
                type="range"
                min={40}
                max={300}
                step={5}
                value={orbitRadius}
                onChange={(e) => setOrbitRadius(Number(e.target.value))}
              />
            </label>

            {!missionActive ? (
              <button
                type="button"
                onClick={startScanFromGeometry}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: '#16a34a',
                  border: '1px solid #16a34a',
                  color: '#fff',
                  fontWeight: 600,
                }}
              >
                Start Scan
              </button>
            ) : (
              <button
                type="button"
                onClick={endMissionAndReturn}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: '#111827',
                  border: '1px solid #111827',
                  color: '#fff',
                  fontWeight: 600,
                }}
              >
                End Mission & Return to Base
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const c =
                  (lastCritical?.coord as Coord) ??
                  (missionGeom?.kind === 'point' || missionGeom?.kind === 'poi'
                    ? missionGeom?.center
                    : missionGeom?.kind === 'aoi'
                    ? missionGeom?.center
                    : missionGeom?.kind === 'segment'
                    ? (turf.center((missionGeom as any).line).geometry.coordinates as Coord)
                    : null);
                if (c) computeEmergencyRoute(c);
              }}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid #111827',
                background: '#fff',
              }}
            >
              Get Fast Emergency Route
            </button>

            <div style={{ fontSize: 11, color: '#64748b' }}>
              Click Map (point), Street Segment (2 clicks), AOI (2 clicks rectangle or 3+ then
              Enter), or POI (search). Orbit loops until you end the mission.
            </div>
          </div>
        )}
      </form>

      {/* Timeline */}
      <Timeline
        startMs={timeWindow[0]}
        endMs={timeWindow[1]}
        events={events}
        reviewMode={reviewMode}
        unread={unread}
        onToggleReview={() => setReviewMode((v) => !v)}
        onChangeWindow={(a, b) => setTimeWindow([a, b])}
        onSelectEvent={handleSelectEvent}
      />
    </div>
  );
}
