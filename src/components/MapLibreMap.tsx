// src/components/pages/ReengagementMap.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl, { Map as MapboxMap, Marker, GeoJSONSource, MapMouseEvent, Popup } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, LineString, Point, Polygon, MultiPolygon } from 'geojson';
import DronePortIcon from '../assets/images/icons/dronePort.svg';
import DroneIcon from '../assets/images/icons/twister.png';
import VideoReview, { VideoReviewHandle } from './VideoReview';
import FirefighterVideo from '../assets/images/firefightervideo.mp4';
import DroneEnrouteVideo from '../assets/images/firefightervideo.mp4';
import ReturnModal from './ReturnModal';
import type { DetectionEvent } from '../shared/DetectionEvent';
import { createEventMarker } from './createEventMarker';
import Header from './Header/Header';
import EventTimeline from './EventTimeline';
import EventFilters from './EventFilters';
import { featureCollection, point, centroid, distance } from '@turf/turf';
import { renderToStaticMarkup } from 'react-dom/server';
import { categoryIcons } from './mapicons'; // "events" shows the normal points, "categories" shows category clusters
import EventFeed from './EventFeed';
import { iconMap } from '../shared/iconMap';
import RecapPanel from './RecapPanel';
import { useReengagement } from './useReengagement';
import PegmanControl from './PegmanIcon';


// ---------------- Config ----------------
type Coord = [number, number];

type DronePort = { coord: Coord; id: string; status: 'idle' | 'in-flight' };
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string;
const MAP_STYLES = {
  Streets: 'mapbox://styles/mapbox/streets-v12',
  Satellite: 'mapbox://styles/mapbox/satellite-v9',
} as const;
const initialDronePorts: DronePort[] = [
  { coord: [11.505, 48.719], id: 'drone-port-1', status: 'idle' },
  { coord: [11.502, 48.716], id: 'drone-port-2', status: 'idle' },
];
type IndividualMapProps = {
  setConnectionStatus: (status: 'connected' | 'connecting' | 'disconnected') => void;
};

// Mission modes (as you asked: STREET / POI / FOI; plus CLICK if you want a quick circle)
type ScanMode = 'STREET' | 'POI' | 'FOI' | 'CLICK';

const DEFAULT_SCAN_RADIUS_M = 120; // for CLICK/POI circle polygon
const STREET_BUFFER_M = 25; // buffered corridor for STREET
const DRONE_SPEED_MPS = 15; // used to compute ETA (≈54 km/h)
const ORBIT_RADIUS_M = 70; // simple orbit after arrival (optional eye-candy)

// ---------------- Component ----------------
export default function MapLibreMap({ setConnectionStatus }: IndividualMapProps) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);

  const droneMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const originPortRef = useRef<DronePort | null>(null);

  const videoRef = useRef<VideoReviewHandle | null>(null);
  const arrivalRef = useRef<number | null>(null);

  const [scanMode, setScanMode] = useState<ScanMode>('CLICK'); // ✅ circle area by default
  const [tooltip, setTooltip] = useState<{ lat: number; lng: number } | null>(null);

  const [missionGeom, setMissionGeom] = useState<{
    kind: ScanMode;
    center: Coord;
    shape?: Feature<Polygon | MultiPolygon>; // ✅ allow MultiPolygon too
    line?: Feature<LineString>;
  } | null>(null);
  const [showFeed, setShowFeed] = useState(true);
  useEffect(() => {
    if (!mapRef.current) return;

    // Wait for layout transition to finish
    const timer = setTimeout(() => {
      mapRef.current!.resize();
    }, 300); // match your CSS transition time (0.3s)

    return () => clearTimeout(timer);
  }, [showFeed]);

  const [missionActive, setMissionActive] = useState(false);
  const [inTransit, setInTransit] = useState(false);
  const [etaText, setEtaText] = useState<string | null>(null);

  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [allEvents, setAllEvents] = useState<DetectionEvent[]>([]); // 👈 Declare it first!

  // 👇 Hook to detect when user leaves or becomes idle
  const { showReturnModal, setShowReturnModal, missedEvents, awayReason } =
    useReengagement(allEvents);

  const [draftPoints, setDraftPoints] = useState<Coord[]>([]);
  const missionActiveRef = useRef(missionActive);
  useEffect(() => {
    missionActiveRef.current = missionActive;
  }, [missionActive]);
  const [showQuickBrief, setShowQuickBrief] = useState(false);
  // highlight last arrival
  const [newEventToast, setNewEventToast] = useState<DetectionEvent | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  // new state

  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const replayMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // highlight currently selected event
  // new: events that were missed but not yet opened from the header dropdown
  const [notificationEvents, setNotificationEvents] = useState<DetectionEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [recap, setRecap] = useState<any | null>(null);
  const [timelineTs, setTimelineTs] = useState<number | null>(null); // current replay time
  const [isLive, setIsLive] = useState(true);
  const isLiveRef = useRef(isLive);
  useEffect(() => {
    isLiveRef.current = isLive;
  }, [isLive]);
  const animatingRef = useRef(true);
  const orbitTimerRef = useRef<number | null>(null);
  const isResumingRef = useRef(false); // 🆕 add this
  const wasEnrouteRef = useRef(false);
  const isReplayModeRef = useRef(false);
  const enrouteRafRef = useRef<number | null>(null);
  const pegmanMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const lastScanTsRef = useRef(0);
  const SCAN_INTERVAL_MS = 120; // scan every 0.3 seconds

  // ✅ all unique labels we’ve actually received so far
  const detectedLabels = React.useMemo(() => {
    const s = new Set<string>();
    allEvents.forEach((e) => s.add(e.label));
    return s;
  }, [allEvents]);
  const scannedRef = useRef<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  // 🧠 Performance tuning constants
const MAX_SCANS = 200; // keep last 200 scan footprints only
const lastScannedUpdateRef = useRef(0); // used to throttle map updates

  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [videoExpanded, setVideoExpanded] = useState(false);
  const toggleVideo = () => setVideoExpanded((v) => !v);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [currentBoxes, setCurrentBoxes] = useState<DetectionEvent[]>([]);
  const [missionPhase, setMissionPhase] = useState<
    'idle' | 'in-transit' | 'scanning' | 'returning'
  >('idle');
  const [progressPct, setProgressPct] = useState<number | null>(null);

  type DronePathPoint = {
    ts: number; // timestamp (ms since epoch)
    coord: [number, number]; // [lng, lat]
  };

  const [dronePath, setDronePath] = useState<DronePathPoint[]>([]);
  const inTransitRef = useRef(false);
  useEffect(() => {
    inTransitRef.current = inTransit;
  }, [inTransit]);
  const [gimbalTarget, setGimbalTarget] = useState<Coord | null>(null);
  const [scanClips, setScanClips] = useState<
  { id: string; coord: Coord; startTimeSec: number; confidence: number }[]
>([]);


  // const [streamStart] = useState(() => Date.now());
  const [streamStart, setStreamStart] = useState<number | null>(null);

  const toggleFilter = (label: DetectionEvent['label']) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };
  const CAMERA_OFFSET_DEG = 360; // 0 = front, 180 = back, etc.

  useEffect(() => {
    missionActiveRef.current = missionActive;
  }, [missionActive]);
  // ---------- Map init ----------
  // ---------- Map init ----------
  useEffect(() => {
    if (!mapEl.current) return;

    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string;

    const m = new mapboxgl.Map({
      container: mapEl.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [11.506, 48.718],
      zoom: 13,
    });

    m.on('load', () => {
      console.log('✅ Mapbox loaded');

      // --- Add custom sources ---
      m.addSource('missionGeom', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      m.addSource('covered', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [] },
          properties: {},
        },
      });
      m.addSource('coverage-zone', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      
      const beforeId = m.getLayer("path-covered") ? "path-covered" : undefined;
      m.addLayer(
        {
          id: "coverage-zone",
          type: "fill",
          source: "coverage-zone",
          paint: { "fill-color": "#ff9500", "fill-opacity": 0.15 },
        },
        beforeId // ✅ only insert before if layer exists
      );
      
      // --- Orange cumulative scanned zone ---
m.addSource("scanned", {
  type: "geojson",
  data: { type: "FeatureCollection", features: [] },
});

m.addLayer({
  id: "scanned-fill",
  type: "fill",
  source: "scanned",
  paint: {
    "fill-color": "#ff6b00",
    "fill-opacity": [
      'interpolate', ['linear'],
      // 🔸 Compute how old the scan is (in seconds)
      ['-', ['to-number', ['get', 'scannedAt']], ['number', ['/', ['to-number', ['get', 'now']], 1], 0]],
      0, 0.6,        // just scanned → bright
      60000, 0.2,    // older than 60s → faded
      120000, 0.05   // older than 2min → barely visible
    ]
  }
});


      m.addSource('remaining', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [] },
          properties: {},
        },
      });
      m.addSource('pinnedEvents', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      // --- Ghost replay path ---
      m.addSource('replay-path', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [] },
          properties: {},
        },
      });
      m.addLayer({
        id: 'replay-path',
        type: 'line',
        source: 'replay-path',
        paint: {
          'line-color': '#111827',
          'line-opacity': 0.6,
          'line-width': 3,
          'line-dasharray': [2, 2],
        },
      });

      // --- Add layers (just like before) ---
      m.addLayer({
        id: 'mission-fill',
        type: 'fill',
        source: 'missionGeom',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#0ea5e9', 'fill-opacity': 0.12 },
      });

      m.addLayer({
        id: 'mission-outline',
        type: 'line',
        source: 'missionGeom',
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'LineString']]],
        paint: { 'line-color': '#0ea5e9', 'line-width': 2, 'line-dasharray': [2, 1] },
      });

      m.addLayer({
        id: 'path-covered',
        type: 'line',
        source: 'covered',
        paint: { 'line-color': '#16a34a', 'line-width': 4 },
      });

      m.addLayer({
        id: 'path-remaining',
        type: 'line',
        source: 'remaining',
        paint: { 'line-color': '#64748b', 'line-width': 3, 'line-dasharray': [2, 2] },
      });

      // --- Add your drone port icons as markers ---
           // --- Add your drone port icons as markers ---
           initialDronePorts.forEach(({ coord }) => {
            const el = document.createElement('div');
            el.style.width = '30px';
            el.style.height = '30px';
            el.style.transform = 'translate(-50%,-50%)';
            const img = document.createElement('img');
            img.src = DronePortIcon;
            img.alt = 'Drone Port';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'contain';
            el.appendChild(img);
            new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat(coord).addTo(m);
          });
    
          // ✅ Make orange scanned area always appear on top
          if (m.getLayer("scanned-fill")) {
            try {
              m.moveLayer("scanned-fill"); // brings it above all others
            } catch (err) {
              console.warn("⚠️ Could not move scanned-fill:", err);
            }
          }
        });

    mapRef.current = m;
    console.log('✅ Mapbox loaded');
    (window as any).mapboxMapRef = m; // 👈 Makes PegmanControl work
    console.log('🧭 mapboxMapRef', (window as any).mapboxMapRef);

    return () => m.remove();
  }, []);
  useEffect(() => {
    if (missionPhase !== 'in-transit' || !arrivalRef.current) return;

    const timer = setInterval(() => {
      const remainingMs = arrivalRef.current! - Date.now();

      if (remainingMs <= 0) {
        clearInterval(timer);
        setEtaText('Arrived at target');
        setMissionPhase('scanning'); // ✅ optional auto-transition
        return;
      }

      const mins = Math.floor(remainingMs / 60000);
      const secs = Math.floor((remainingMs % 60000) / 1000);
      const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      setEtaText(`ETA: ${formatted}`);
    }, 1000);

    return () => clearInterval(timer);
  }, [missionPhase]);

  // 👇 Add this effect inside your component
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    // 🧹 Remove existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    // 🧠 Determine which events should be visible
    const filtered = allEvents.filter((ev) => {
      const matchesLabel = activeFilters.size === 0 || activeFilters.has(ev.label);

      // if replaying history → only show events up to the current timelineTs
      // if live mode → show everything
      const inTime = isLive || timelineTs === null ? true : ev.ts <= timelineTs;

      return matchesLabel && inTime;
    });

    // 🪄 Draw the visible events
    filtered.forEach((ev) => {
      const el = document.createElement('div');
      el.style.fontSize = '28px';
      el.style.cursor = 'pointer';
      el.innerText = iconMap[ev.label]?.icon ?? '❓';

      // --- Hover preview popup ---
      let popup: mapboxgl.Popup | null = null;

      el.addEventListener('mouseenter', () => {
        if (popup) return;
        popup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 25,
        })
          .setLngLat(ev.coord)
          .setHTML(
            `
            <strong>${ev.label.toUpperCase()}</strong><br/>
            ${new Date(ev.ts).toLocaleTimeString()}<br/>
            ${
              ev.thumbnail
                ? `<img src="${ev.thumbnail}" style="max-width:120px;border-radius:4px;margin-top:4px"/>`
                : ''
            }
          `
          )
          .addTo(m);
      });

      el.addEventListener('mouseleave', () => {
        if (popup) {
          popup.remove();
          popup = null;
        }
      });

      // --- Click to open full modal ---
      el.addEventListener('click', () => {
        if (popup) {
          popup.remove();
          popup = null;
        }
        const existing = document.getElementById('event-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'event-modal';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100vw';
        modal.style.height = '100vh';
        modal.style.background = 'rgba(0,0,0,0.9)';
        modal.style.display = 'flex';
        modal.style.flexDirection = 'column';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.zIndex = '9999';
        modal.style.color = 'white';
        modal.style.padding = '20px';
        modal.style.overflow = 'auto';

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.position = 'absolute';
        closeBtn.style.top = '20px';
        closeBtn.style.right = '30px';
        closeBtn.style.fontSize = '28px';
        closeBtn.style.background = 'transparent';
        closeBtn.style.border = 'none';
        closeBtn.style.color = 'white';
        closeBtn.style.cursor = 'pointer';
        closeBtn.addEventListener('click', () => modal.remove());
        modal.appendChild(closeBtn);

        const title = document.createElement('h2');
        title.textContent = ev.label.toUpperCase();
        modal.appendChild(title);

        const time = document.createElement('p');
        time.textContent = new Date(ev.ts).toLocaleString();
        modal.appendChild(time);

        const location = document.createElement('p');
        location.textContent =
          ev.address ?? `Lat: ${ev.coord[1].toFixed(5)}, Lng: ${ev.coord[0].toFixed(5)}`;
        modal.appendChild(location);

        if (ev.thumbnail) {
          const img = document.createElement('img');
          img.src = ev.thumbnail;
          img.style.maxWidth = '90vw';
          img.style.maxHeight = '80vh';
          img.style.borderRadius = '8px';
          img.style.marginTop = '12px';
          modal.appendChild(img);
        }

        document.body.appendChild(modal);
      });

      const marker = new mapboxgl.Marker({ element: el }).setLngLat(ev.coord).addTo(m);
      markersRef.current.push(marker);
    });
  }, [allEvents, activeFilters, timelineTs, isLive]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      maxWidth: '300px',
    });

    const onEnter = (e: mapboxgl.MapLayerMouseEvent) => {
      m.getCanvas().style.cursor = 'pointer';
      const feat = e.features?.[0];
      if (!feat) return;

      const props = feat.properties as any;
      const coords = (feat.geometry as Point).coordinates as [number, number];

      const ev = allEvents.find((x) => x.id === props.id || x.ts === props.ts);
      if (!ev) return;

      // build small preview
      const thumbHtml = ev.thumbnail
        ? `<img src="${ev.thumbnail}" style="max-width:100%;border-radius:6px;margin-top:6px"/>`
        : '';

      popup
        .setLngLat(coords)
        .setHTML(
          `
        <strong>${ev.label.toUpperCase()}</strong><br/>
        ${new Date(ev.ts).toLocaleString()}<br/>
        ${ev.address ?? `Lat: ${coords[1].toFixed(5)}, Lng: ${coords[0].toFixed(5)}`}<br/>
        ${thumbHtml}
      `
        )
        .addTo(m);
    };

    const onLeave = () => {
      m.getCanvas().style.cursor = '';
      popup.remove();
    };

    const onClick = (e: mapboxgl.MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat) return;
      const props = feat.properties as any;
      const ev = allEvents.find((x) => x.id === props.id || x.ts === props.ts);
      if (!ev) return;

      // show a full overlay
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100vw';
      overlay.style.height = '100vh';
      overlay.style.background = 'rgba(0,0,0,0.85)';
      overlay.style.display = 'flex';
      overlay.style.flexDirection = 'column';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.zIndex = '9999';
      overlay.style.color = 'white';
      overlay.style.padding = '20px';

      const close = document.createElement('div');
      close.textContent = '✕';
      close.style.position = 'absolute';
      close.style.top = '20px';
      close.style.right = '30px';
      close.style.fontSize = '28px';
      close.style.cursor = 'pointer';
      close.addEventListener('click', () => document.body.removeChild(overlay));
      overlay.appendChild(close);

      const title = document.createElement('h2');
      title.textContent = ev.label.toUpperCase();
      overlay.appendChild(title);

      const time = document.createElement('div');
      time.textContent = new Date(ev.ts).toLocaleString();
      overlay.appendChild(time);

      const loc = document.createElement('div');
      loc.innerHTML =
        ev.address ?? `Lat: ${ev.coord[1].toFixed(5)}, Lng: ${ev.coord[0].toFixed(5)}`;
      overlay.appendChild(loc);

      if (ev.thumbnail) {
        const img = document.createElement('img');
        img.src = ev.thumbnail;
        img.style.maxWidth = '80vw';
        img.style.maxHeight = '70vh';
        img.style.borderRadius = '8px';
        img.style.marginTop = '12px';
        overlay.appendChild(img);
      }

      document.body.appendChild(overlay);
    };

    ['pinned-circles', 'pinned-emojis'].forEach((layer) => {
      m.on('mouseenter', layer, onEnter);
      m.on('mouseleave', layer, onLeave);
      m.on('click', layer, onClick);
    });

    return () => {
      m.off('mouseenter', 'pinned-icons', onEnter);
      m.off('mouseleave', 'pinned-icons', onLeave);
      m.off('click', 'pinned-icons', onClick);
      popup.remove();
    };
  }, [allEvents]);

  // ---------- Mode → next map click defines target ----------

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const onClick = (e: mapboxgl.MapMouseEvent) => {
      if (missionActiveRef.current) return;

      const c: Coord = [e.lngLat.lng, e.lngLat.lat];

      // ---- CLICK / POI (circle) ----
      if (scanMode === 'CLICK' || scanMode === 'POI') {
        const radius = scanMode === 'CLICK' ? DEFAULT_SCAN_RADIUS_M : DEFAULT_SCAN_RADIUS_M * 1.5;
        const circle = turf.circle(c, radius, { units: 'meters' }) as Feature<Polygon>;
        setMissionGeom({ kind: scanMode, center: c, shape: circle });
        setMissionTargetOnMap({ polygon: circle });
        return;
      }

      // ---- STREET (2 clicks for line) ----
      if (scanMode === 'STREET') {
        setDraftPoints((prev) => {
          const next = [...prev, c];
          if (next.length === 1) {
            // preview dot
            const dot = turf.circle(c, 8, { units: 'meters' });
            setMissionTargetOnMap({ polygon: dot as any });
          } else if (next.length >= 2) {
            const line = turf.lineString(next.slice(0, 2)); // ✅ always exactly 2 points
            const buf = turf.buffer(line, STREET_BUFFER_M, { units: 'meters' }) as Feature<Polygon>;
            setMissionGeom({
              kind: 'STREET',
              center: turf.center(line).geometry.coordinates as Coord,
              line,
              shape: buf,
            });
            setMissionTargetOnMap({ line, polygon: buf });
          }
          return next.slice(-2);
        });
        return;
      }

      // ---- FOI (multi-click polygon) ----
      if (scanMode === 'FOI') {
        setDraftPoints((prev) => {
          const next = [...prev, c];

          if (next.length >= 3) {
            // Close polygon when operator clicks near start OR right-clicks
            const polygon = turf.polygon([[...next, next[0]]]) as Feature<Polygon>;
            setMissionGeom({
              kind: 'FOI',
              center: turf.center(polygon).geometry.coordinates as Coord,
              shape: polygon,
            });
            setMissionTargetOnMap({ polygon });
            return []; // reset draft points
          } else {
            // Just preview the partial polygon/line
            const preview = turf.lineString(next) as Feature<LineString>;
            setMissionTargetOnMap({ line: preview });
          }
          return next;
        });
        return;
      }
    };

    m.on('click', onClick);
    return () => {
      m.off('click', onClick); // ✅
    };
  }, [scanMode]);

  // keep the latest events in a ref
  const eventsRef = useRef<DetectionEvent[]>([]);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);
  // ✅ keep only this effect for category clusters

  // ✅ use allEvents instead of events
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const src = m.getSource('pinnedEvents') as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;

    // filter events based on active filters if needed
    const filtered = allEvents.filter(
      (ev) => activeFilters.size === 0 || activeFilters.has(ev.label)
    );

    // normalize coords to [lng, lat]
    const normalize = (coord: [number, number]) => {
      const [a, b] = coord;
      // if first looks like latitude → flip
      return Math.abs(a) <= 90 && Math.abs(b) <= 180 ? [b, a] : coord;
    };

    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: filtered.map((ev) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: ev.coord }, // no normalize
        properties: {
          id: ev.id,
          label: ev.label,
          ts: ev.ts,
          icon: iconMap[ev.label] ?? '❓', // 👈 map label → emoji
        },
      })),
    };

    console.log('🔴 Updating pinnedEvents source with', fc.features.length, 'features');
    src.setData(fc);
  }, [allEvents, activeFilters]);
 
  const setMissionTargetOnMap = (opts: {
    polygon?: Feature<Polygon | MultiPolygon>;
    line?: Feature<LineString>;
  }) => {
    const m = mapRef.current!;
    const features: Feature[] = [];
  
    if (opts.polygon) features.push(opts.polygon);
    if (opts.line) features.push(opts.line);
  
    // --- mission geometry ---
    (m.getSource('missionGeom') as mapboxgl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features,
    });
  
    // --- reset paths ---
    (m.getSource('covered') as mapboxgl.GeoJSONSource).setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [] },
      properties: {},
    });
  
    (m.getSource('remaining') as mapboxgl.GeoJSONSource).setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [] },
      properties: {},
    });
  
    // --- coverage zone ---
    const coverageSource = m.getSource('coverage-zone') as mapboxgl.GeoJSONSource;
  
    if (opts.line && opts.line.geometry?.coordinates?.length > 1) {
      // Buffer the scanned line to visualize coverage area
      const buffered = turf.buffer(opts.line, 30, { units: 'meters' });
  
      if (buffered) {
        coverageSource.setData(buffered as Feature<Polygon | MultiPolygon>);
      } else {
        // Fallback if turf.buffer somehow returns undefined
        coverageSource.setData({
          type: 'FeatureCollection',
          features: [],
        } as FeatureCollection);
      }
    } else {
      // No line → clear coverage zone
      coverageSource.setData({
        type: 'FeatureCollection',
        features: [],
      } as FeatureCollection);
    }
  };
  
  
  
  

  const startCircleScan = (center: Coord, radiusM = DEFAULT_SCAN_RADIUS_M) => {
    const steps = 360; // number of points around the ring
    const coords: Coord[] = [];

    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * 2 * Math.PI; // full 360°
      const dx = (radiusM / 111320) * Math.cos(angle);
      const dy = (radiusM / 110540) * Math.sin(angle);
      coords.push([center[0] + dx, center[1] + dy]);
    }

    // animate drone around the ring
    let idx = 0;
    const animate = () => {
      if (!missionActiveRef.current || !isLiveRef.current) return;
      if (!droneMarkerRef.current) return;

      droneMarkerRef.current.setLngLat(coords[idx]);
      idx = (idx + 1) % coords.length;
      requestAnimationFrame(animate);
    };
    animate();

    // draw the ring on the map for visual feedback
    const ring = turf.lineString(coords);
    (mapRef.current!.getSource('missionGeom') as mapboxgl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: [ring],
    });
  };

  // Lawn-mower scan for STREET missions
  const startStreetScan = (line: Feature<LineString>, bufferM = STREET_BUFFER_M) => {
    if (!line.geometry.coordinates || line.geometry.coordinates.length < 2) return;

    const [start, end] = line.geometry.coordinates;
    const passes = 4;
    const pointsPerSegment = 100;
    const path: Coord[] = [];

    for (let i = 0; i < passes; i++) {
      const offset = (i / passes - 0.5) * (bufferM / 111320);
      const a: Coord = [start[0] + offset, start[1]];
      const b: Coord = [end[0] + offset, end[1]];

      const seg = turf.lineString([a, b]);
      const length = turf.length(seg, { units: 'kilometers' });

      for (let j = 0; j <= pointsPerSegment; j++) {
        const pt = turf.along(seg, (length * j) / pointsPerSegment, { units: 'kilometers' });
        path.push(pt.geometry.coordinates as Coord);
      }

      if (i % 2 === 1) path.reverse(); // zigzag effect
    }

    let idx = 0;
    const animate = () => {
      if (!missionActiveRef.current || !isLiveRef.current) return;
      if (!droneMarkerRef.current) return;

      // ✅ use path instead of coords
      droneMarkerRef.current.setLngLat(path[idx]);
      idx = (idx + 1) % path.length;
      requestAnimationFrame(animate);
    };

    animate();

    const scanLine = turf.lineString(path);
    (mapRef.current!.getSource('missionGeom') as mapboxgl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: [scanLine],
    });
  };
  

  const handlePegmanDrop = useCallback((lng: number, lat: number) => {
    const m = mapRef.current;
    if (!m) return;
  
    const dropped = turf.point([lng, lat]);
    const match = scannedRef.current.features.find((f) =>
      turf.booleanPointInPolygon(dropped, f as Feature<Polygon>)
    );
  
    if (!match) {
      new mapboxgl.Popup()
        .setLngLat([lng, lat])
        .setHTML("🚫 Area not scanned yet")
        .addTo(m);
      return;
    }
  
    const { startTimeSec, confidence } = match.properties as any;
    const snapshot = videoRef.current?.captureFrame?.();
  
    // Highlight polygon
  // 🧹 Clean up any existing highlight before adding new one
if (m.getLayer("highlight-fov")) m.removeLayer("highlight-fov");
if (m.getSource("highlight-fov")) m.removeSource("highlight-fov");

// 🆕 Add a fresh source + layer
m.addSource("highlight-fov", { type: "geojson", data: match });
m.addLayer({
  id: "highlight-fov",
  type: "line",
  source: "highlight-fov",
  paint: { "line-color": "#ff0", "line-width": 3 },
});

  
    // Fade highlight after 3s
    setTimeout(() => {
      if (m.getLayer("highlight-fov")) m.removeLayer("highlight-fov");
    }, 3000);
  
    // Show popup with snapshot
    new mapboxgl.Popup()
      .setLngLat([lng, lat])
      .setHTML(`
        <div style="width:220px">
          <img src="${snapshot}" style="width:100%;border-radius:6px" />
          <div style="font-size:13px;margin-top:6px">
            Confidence: ${(confidence * 100).toFixed(0)}%<br/>
            Time: ${Math.round(startTimeSec)}s
          </div>
          <button id="playReplayBtn" 
            style="margin-top:8px;width:100%;background:#0ea5e9;color:white;border:none;border-radius:6px;padding:6px;cursor:pointer">
            ▶️ Replay 5s
          </button>
        </div>
      `)
      .addTo(m);
  
    // Attach handler for replay
    setTimeout(() => {
      const btn = document.getElementById("playReplayBtn");
      if (btn) {
        btn.onclick = () => {
          setVideoExpanded(true);
          setMissionActive(true);
          videoRef.current?.seekAndPlay(startTimeSec);
          setTimeout(() => videoRef.current?.seekAndPause(startTimeSec + 5), 5000);
        };
      }
    }, 500);
  }, []);
  
  
  
  

  const handleDetectionMessage = (msg: MessageEvent) => {
    try {
      const data = JSON.parse(msg.data);

      if (!data.events || !Array.isArray(data.events)) {
        console.warn('⚠️ No detection events in payload');
        return;
      }

      const iconMap: Record<string, string> = {
        fire: '🔥',
        person: '👤',
        chemical: '🧪',
        snapshot: '📸',
        car: '🚗',
        truck: '🚚',
        animal: '🐾',
      };

      if (!isLive) {
        console.debug('Skipping detections during replay');
        return;
      }

      const delayMs = 2000;

      const synced: DetectionEvent[] = data.events.map((e: any) => {
        const correctedTs = e.ts > 1e11 ? e.ts - delayMs : Date.now();
        const label = e.label?.toLowerCase();

        return {
          id: e.id ?? crypto.randomUUID(),
          ts: correctedTs,
          label,
          score: e.score ?? 0,
          coord: e.coord ?? [0, 0],
          seen: false,
          thumbnail: e.thumbnail,
          bbox: e.bbox,
          icon: iconMap[label] || '📸',
        };
      });

      setCurrentBoxes(synced);
      setAllEvents((prev) => [...prev, ...synced]);
    } catch (err) {
      console.error('❌ Error parsing detection message', err);
    }
  };

  // ---------- Start Mission (only after mode + coordinates set) ----------
  const startMission = () => {
    if (!missionGeom || !scanMode) return;
    if (scanMode === 'STREET') {
      if (!missionGeom.line || missionGeom.line.geometry.coordinates.length < 2) {
        console.warn('Street mission requires 2 clicks before starting');
        return; // stop mission start
      }
    }
    setDronePath((prev) => [...prev]);
    const m = mapRef.current;
    if (!m) return;
    //  setDronePath([]); // clear old flight data before new mission
    ensureSourceAndLayer(m);
    // Choose nearest port
    const center = missionGeom.center;
    const origin = nearestPort(center);
    originPortRef.current = origin;
    setMissionPhase('in-transit');

    // Drone marker
    const el = document.createElement('div');
    el.style.width = '34px';
    el.style.height = '34px';
    el.style.transform = 'translate(-50%,-50%)';
    const img = document.createElement('img');
    img.src = DroneIcon;
    img.alt = 'Drone';
    img.style.width = '100%';
    img.style.height = '100%';
    el.appendChild(img);

    droneMarkerRef.current?.remove();
    droneMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat(origin.coord)
      .addTo(mapRef.current!);

    // Build transit line port → target center
    let toTarget: Feature<LineString>;
    if (origin.coord[0] === center[0] && origin.coord[1] === center[1]) {
      // Same place → no path
      toTarget = {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [] },
        properties: {},
      } as Feature<LineString>;
    } else {
      toTarget = turf.lineString([origin.coord, center]) as Feature<LineString>;
    }

    // // ⭐ NEW popup to show live progress
    // const progressPopup = new mapboxgl.Popup({
    //   closeButton: false,
    //   closeOnClick: false,
    //   className: 'drone-progress-popup',
    // }).addTo(mapRef.current!);

    // --- distance & time setup (unchanged) ---
    let totalDistKm = 0;
    if (toTarget.geometry.coordinates.length >= 2) {
      try {
        totalDistKm = turf.length(toTarget, { units: 'kilometers' });
      } catch (err) {
        console.warn('turf.length failed:', err);
      }
    }

    const totalDistM = totalDistKm * 1000;
    const transitMs = totalDistM > 0 ? (totalDistM / DRONE_SPEED_MPS) * 1000 : 1;

    // ✅ Prime sources only if this is a *new mission*, not a resume
    const remainingSrc = mapRef.current!.getSource('remaining') as mapboxgl.GeoJSONSource;
    const coveredSrc = mapRef.current!.getSource('covered') as mapboxgl.GeoJSONSource;
    

    if (!isResumingRef.current) {
      console.log('🟢 New mission — resetting path layers');
      remainingSrc.setData(
        toTarget.geometry.coordinates.length >= 2
          ? toTarget
          : ({
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: [] },
              properties: {},
            } as Feature<LineString>)
      );
      coveredSrc.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [] },
        properties: {},
      });
    } else {
      console.log('🟢 Resuming mission — keeping existing path');
      isResumingRef.current = false; // reset the flag for next time
    }

    // ETA
    // ETA
    // ✅ Compute distance from origin to center
    const distanceMeters = turf.distance(origin.coord, center, { units: 'meters' });
    const etaSeconds = distanceMeters / DRONE_SPEED_MPS;

    // ✅ Store arrival time for countdown
    const arrivalTimestamp = Date.now() + etaSeconds * 1000;
    arrivalRef.current = arrivalTimestamp;
    setEtaText(`ETA: ${Math.round(etaSeconds)}s`);

    setMissionPhase('in-transit');
    setInTransit(true);

    // Keep it in a ref so the timer effect can use it
    arrivalRef.current = arrivalTimestamp;

    // setEtaText(`ETA ${eta.toLocaleTimeString()}`);

    // ✅ NEW logic here
    if (toTarget.geometry.coordinates.length >= 2 && totalDistKm > 0) {
      // Normal case → drone flies
      setMissionActive(true);
      setStreamStart(Date.now());
      setInTransit(true);

      let startTs: number | null = null;

      // 🧹 Stop any previous RAF
      if (enrouteRafRef.current) {
        cancelAnimationFrame(enrouteRafRef.current);
        enrouteRafRef.current = null;
      }

      // Add this above raf (outside startMission)
let lastScanTime = 0;
let lastUpdateTime = 0;
const PATH_UPDATE_MS = 100;   // 10 FPS is enough

const raf = (now: number) => {
  if (!missionActiveRef.current) return;
  if (!droneMarkerRef.current) return;
  if (startTs === null) startTs = now;

  const t = Math.min((now - startTs) / transitMs, 1);
  const distKm = totalDistKm * t;
  const pt = turf.along(toTarget, distKm, { units: "kilometers" }) as Feature<Point>;
  const cur = pt.geometry.coordinates as Coord;

  // Smooth marker motion
  droneMarkerRef.current.setLngLat(cur);

  // Only do heavy turf + setData every PATH_UPDATE_MS
  if (now - lastUpdateTime > PATH_UPDATE_MS) {
    lastUpdateTime = now;

    const covered = turf.lineSlice(turf.point(origin.coord), turf.point(cur), toTarget);
    const remaining = turf.lineSlice(turf.point(cur), turf.point(center), toTarget);
    (mapRef.current!.getSource("covered") as mapboxgl.GeoJSONSource).setData(covered);
    (mapRef.current!.getSource("remaining") as mapboxgl.GeoJSONSource).setData(remaining);

    // Update FOV even less often (~6–8 fps)
    if (now - lastScanTime > 150) {
      lastScanTime = now;
      const heading = turf.bearing(origin.coord, cur);
      recordScanAt(mapRef.current!, cur, heading + CAMERA_OFFSET_DEG);
    }
  }

  if (t < 1) {
    enrouteRafRef.current = requestAnimationFrame(raf);
  } else {
    setInTransit(false);
    inTransitRef.current = false;
    startOrbit(center);
  }
};



      // 🔁 Save ID so we can cancel later
      enrouteRafRef.current = requestAnimationFrame(raf);
    } else {
      // Special case → no distance to fly
      // progressPopup.remove();

      setMissionActive(true);
      setInTransit(false);
      droneMarkerRef.current?.setLngLat(center);
      startOrbit(center);
    }
    // inside startMission, after setMissionActive(true)
    // const socket = new WebSocket(`ws://${window.location.hostname}:8000/ws`);
    const socket = new WebSocket('wss://HamzaMohsin-IC-FReD-server.hf.space/ws');
    setConnectionStatus('connecting'); // 🟡 show connecting
    setWs(socket);

    socket.onopen = () => {
      console.log('🔌 Detection WebSocket connected');
      setConnectionStatus('connected'); // 🟢 live

      // Send frames every 500 ms while mission is active
      const sendLoop = setInterval(() => {
        if (!missionActiveRef.current) {
          clearInterval(sendLoop);
          return;
        }
        if (!videoRef.current) return;

        const frame = videoRef.current.captureFrame?.();

        // ⬇️ get the *current* marker position just before sending
        const pos = droneMarkerRef.current?.getLngLat();

        if (frame && pos && socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              frame, // base64 JPEG from VideoReview
              coord: [pos.lng, pos.lat], // <-- live [lon, lat]
            })
          );
        }
      }, 500);

      socket.onclose = () => {
        console.log('🔌 Detection WebSocket closed');
        clearInterval(sendLoop);
        setConnectionStatus('disconnected');
      };

      socket.onmessage = handleDetectionMessage;
    };
  };
  const startOrbit = (center: Coord) => {
    if (orbitTimerRef.current) {
      clearTimeout(orbitTimerRef.current);
      orbitTimerRef.current = null;
    }
  
    // ✅ FIX #1: define map instance for use below
    const m = mapRef.current;
    if (!m) return;
  
    const orbit = turf.circle(center, ORBIT_RADIUS_M, {
      units: 'meters',
      steps: 120,
    }) as Feature<Polygon>;
  
    const ring = orbit.geometry.coordinates[0];
    let i = 0;
  
    setMissionPhase('scanning'); // 🛰️ update HUD immediately
  
    const tick = () => {
      // Keep the mission ticking as long as it's active (even during replay)
      if (!missionActiveRef.current) return;
  
      i = (i + 1) % ring.length;
      const cur = ring[i] as Coord;
  
      // Move the live marker ONLY when not replaying
      if (!isReplayModeRef.current && droneMarkerRef.current) {
        droneMarkerRef.current.setLngLat(cur);
      }
  
      // 🟠 record camera FOV every few hundred ms
      // 🟠 Record camera FOV every frame — synced with drone
      const heading = turf.bearing(cur, center);
    recordScanAt(mapRef.current!, cur, heading + 180); // +180 if camera looks backward

  
      // Continue recording the live path regardless of replay mode
      setDronePath((prev) => {
        const now = Date.now();
        const last = prev.at(-1);
        if (!last || turf.distance(last.coord, cur, { units: 'meters' }) > 2) {
          return [...prev, { ts: now, coord: cur }];
        }
        return prev;
      });
  
      orbitTimerRef.current = window.setTimeout(tick, 80);
    };
  
    tick();
  };
  

  
  const handleTimelineSeek = (ts: number) => {
    if (dronePath.length < 2 || !mapRef.current) return;

    console.log('🎥 Entering replay mode');
    isReplayModeRef.current = true;
    isLiveRef.current = false;
    setIsLive(false);
    setTimelineTs(ts);

    // 🧭 Interpolate the position
    const before = [...dronePath].reverse().find((p) => p.ts <= ts);
    const after = dronePath.find((p) => p.ts >= ts);
    let interpolated: [number, number] | null = null;
    if (before && after && after.ts !== before.ts) {
      const ratio = (ts - before.ts) / (after.ts - before.ts);
      interpolated = [
        before.coord[0] + (after.coord[0] - before.coord[0]) * ratio,
        before.coord[1] + (after.coord[1] - before.coord[1]) * ratio,
      ];
    } else if (before) interpolated = before.coord;
    else if (after) interpolated = after.coord;

    const m = mapRef.current;

    // 🧵 Update replay overlay
    const replaySrc = m.getSource('replay-path') as mapboxgl.GeoJSONSource | undefined;
    if (replaySrc) {
      const coordsUntilNow = dronePath.filter((p) => p.ts <= ts).map((p) => p.coord);
      if (interpolated) coordsUntilNow.push(interpolated);
      replaySrc.setData(
        coordsUntilNow.length >= 2
          ? turf.lineString(coordsUntilNow)
          : {
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: [] },
              properties: {},
            }
      );
    }

    // 🛰️ Update ghost marker (create if missing)
    if (interpolated) {
      if (!replayMarkerRef.current) {
        const ghostEl = document.createElement('div');
        ghostEl.style.width = '30px';
        ghostEl.style.height = '30px';
        ghostEl.style.transform = 'translate(-50%,-50%)';
        ghostEl.style.filter = 'grayscale(1) opacity(0.85)';
        ghostEl.style.border = '2px dashed #111827';
        ghostEl.style.borderRadius = '50%';
        replayMarkerRef.current = new mapboxgl.Marker({ element: ghostEl, anchor: 'center' })
          .setLngLat(interpolated)
          .addTo(m);
      } else {
        replayMarkerRef.current.setLngLat(interpolated);
      }
    }

    // Hide live marker visually
    if (droneMarkerRef.current) {
      (droneMarkerRef.current.getElement() as HTMLElement).style.visibility = 'hidden';
    }

    // Update visible events up to this timestamp
    const delayMs = 2000;
    const visibleEvents = allEvents.filter((e) => e.ts - delayMs <= ts);
    updateEventMarkers(visibleEvents);
  };


  const goLive = () => {
    console.log('🔴 Returning to LIVE mode...');

    // --- Reset state flags ---
    isReplayModeRef.current = false;
    isLiveRef.current = true;
    setIsLive(true);
    setTimelineTs(null);

    // --- Remove ghost (replay) marker ---
    if (replayMarkerRef.current) {
      replayMarkerRef.current.remove();
      replayMarkerRef.current = null;
    }

    // --- Show the real live drone marker again ---
    if (droneMarkerRef.current) {
      (droneMarkerRef.current.getElement() as HTMLElement).style.visibility = '';
    }

    // --- Clear the replay overlay path ---
    const m = mapRef.current;
    
    const replaySrc = m?.getSource('replay-path') as mapboxgl.GeoJSONSource | undefined;
    if (replaySrc) {
      replaySrc.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [] },
        properties: {},
      });
    }

    // --- Optional: recenter the camera on the live drone position ---
    if (droneMarkerRef.current && m) {
      const pos = droneMarkerRef.current.getLngLat();
      m.easeTo({ center: [pos.lng, pos.lat], duration: 800 });
    }
    if (m) {
      if (m.getLayer("highlight-fov")) m.removeLayer("highlight-fov");
      if (m.getSource("highlight-fov")) m.removeSource("highlight-fov");
// Remove any open popups from the DOM (Pegman or others)
document.querySelectorAll('.mapboxgl-popup').forEach((el) => el.remove());
if (m.getLayer("highlight-fov")) m.removeLayer("highlight-fov");
if (m.getSource("highlight-fov")) m.removeSource("highlight-fov");

    }
    console.log('✅ LIVE mode resumed (no restart needed)');
  };

  // 🧭 Helper to refresh visible event markers
  const updateEventMarkers = (events: DetectionEvent[]) => {
    const m = mapRef.current;
    if (!m) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    events.forEach((ev) => {
      const el = document.createElement('div');
      el.style.fontSize = '28px';
      el.style.cursor = 'pointer';
      el.innerText = iconMap[ev.label]?.icon ?? '❓';

      const marker = new mapboxgl.Marker({ element: el }).setLngLat(ev.coord).addTo(m);
      markersRef.current.push(marker);
    });
  };
// 🧩 Place these at the top of your component (near other refs)
function recordScanAt(m: mapboxgl.Map, position: Coord, heading: number) {
  if (!m) return;

  const MAX_SCANS = 80;
  const now = Date.now();

  // 🧹 Initialize scannedRef safely
  if (
    !scannedRef.current ||
    !Array.isArray(scannedRef.current.features)
  ) {
    scannedRef.current = {
      type: "FeatureCollection",
      features: [] as Feature<Polygon>[],
    };
  }

  // 🟧 Create the new FOV polygon
  const fov = makeFovRect(position, heading);
  if (!fov.properties) fov.properties = {};

  const videoTime = videoRef.current?.getCurrentTime?.() ?? 0;
  const confidence = +(0.8 + Math.random() * 0.2).toFixed(2);
  const snapshot = videoRef.current?.captureFrame?.() ?? null;

  Object.assign(fov.properties, {
    id: `scan-${now}`,
    scannedAt: now,
    coord: position,
    heading,
    confidence,
    thumbnail: snapshot,
    "fill-opacity": 1.0, // newest = brightest
  });

  // 🧩 Keep only last N scans
  const scans = scannedRef.current.features as Feature<Polygon>[];
  if (scans.length >= MAX_SCANS) scans.shift();
  scans.push(fov);

  // 🌓 Fade older scans
  const faded: Feature<Polygon>[] = scans.map((f) => {
    if (!f.properties) f.properties = {};
    const scannedAt = (f.properties.scannedAt as number) ?? now;
    const age = now - scannedAt;
    const fade = Math.max(0.15, 1 - age / 5000); // 5s fade
    f.properties["fill-opacity"] = fade;
    return f;
  });

  // 🟠 Update the orange "scanned" source
  const collection: FeatureCollection<Polygon> = {
    type: "FeatureCollection",
    features: faded,
  };

  const src = m.getSource("scanned") as mapboxgl.GeoJSONSource | undefined;
  if (src) src.setData(collection);
  scannedRef.current = collection;

  // 🟢 Update live current FOV (sensor beam)
  const fovSrc = m.getSource("sensorFov") as mapboxgl.GeoJSONSource | undefined;
  if (fovSrc) fovSrc.setData(fov);

  // 🧠 Persist to React state for side panel
  setScanClips((prev) => {
    if (prev.some((clip) => clip.id === fov.properties!.id)) return prev;
    return [
      ...prev,
      {
        id: fov.properties!.id as string,
        coord: position,
        heading,
        startTimeSec: videoTime,
        confidence,
        thumbnail: snapshot,
      },
    ];
  });

  console.log(
    `🟧 Recorded scan at ${videoTime.toFixed(1)}s (heading ${heading.toFixed(
      0
    )}°), confidence ${(confidence * 100).toFixed(0)}%`
  );
}

function ensureSourceAndLayer(map: mapboxgl.Map) {
  const empty: FeatureCollection = { type: "FeatureCollection", features: [] };

  if (!map.getSource("scanned")) {
    map.addSource("scanned", { type: "geojson", data: empty });
  }
  if (!map.getSource("covered")) {
    map.addSource("covered", { type: "geojson", data: empty });
  }
  if (!map.getSource("remaining")) {
    map.addSource("remaining", { type: "geojson", data: empty });
  }

  if (!map.getLayer("scanned-fill")) {
    map.addLayer({
      id: "scanned-fill",
      type: "fill",
      source: "scanned",
      paint: { "fill-color": "#ff9500", "fill-opacity": 0.15 },
    });
  }
  if (!map.getLayer("path-covered")) {
    map.addLayer({
      id: "path-covered",
      type: "line",
      source: "covered",
      paint: { "line-color": "#16a34a", "line-width": 4 },
    });
  }
  if (!map.getLayer("path-remaining")) {
    map.addLayer({
      id: "path-remaining",
      type: "line",
      source: "remaining",
      paint: { "line-color": "#64748b", "line-width": 3, "line-dasharray": [2, 2] },
    });
  }
}  
  
function makeFovRect(center: Coord, heading: number): Feature<Polygon> {
  const halfW = 50;    // half-width (total width 100m)
  const depth = 200;   // forward distance of camera FOV

  // compute left/right edges relative to heading
  const left = turf.destination(center, halfW, heading - 90, { units: "meters" })
    .geometry.coordinates as Coord;
  const right = turf.destination(center, halfW, heading + 90, { units: "meters" })
    .geometry.coordinates as Coord;

  // extend forward (in front of the drone)
  const frontLeft = turf.destination(left, depth, heading, { units: "meters" })
    .geometry.coordinates as Coord;
  const frontRight = turf.destination(right, depth, heading, { units: "meters" })
    .geometry.coordinates as Coord;

  return turf.polygon([[left, frontLeft, frontRight, right, left]], {
    scannedAt: Date.now(),
  });
}


  const nearestPort = (pt: Coord): DronePort => {
    return initialDronePorts.reduce((best, p) => {
      const dBest = turf.distance(best.coord, pt);
      const dP = turf.distance(p.coord, pt);
      return dP < dBest ? p : best;
    }, initialDronePorts[0]);
  };

  useEffect(() => {
    markersRef.current.forEach((marker) => {
      const el = marker.getElement();
      const id = el.dataset.id;
      if (!id) return;

      if (selectedEventId === id) {
        el.classList.add('active');
        el.classList.remove('dimmed');
      } else if (selectedEventId) {
        el.classList.add('dimmed');
        el.classList.remove('active');
      } else {
        el.classList.remove('active', 'dimmed');
      }
    });
  }, [selectedEventId]);

  // Hover/Click behavior for annotations
  // 🔵 Popup for category-level clusters with thumbnails

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
    });

    let popupContainer: HTMLDivElement | null = null;
    let isMouseOnPopup = false;
    let closeTimeout: ReturnType<typeof setTimeout> | null = null;

    const onEnter = (e: mapboxgl.MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat) return;

      const coords = (feat.geometry as Point).coordinates as [number, number];
      const props = feat.properties;

      let thumbs: string[] = [];
      let timestamps: number[] = [];

      try {
        const parsedThumbs = JSON.parse(props?.thumbnails);
        if (Array.isArray(parsedThumbs)) {
          thumbs = parsedThumbs.filter(
            (t: unknown): t is string => typeof t === 'string' && t.startsWith('data:image')
          );
        }

        const parsedTimestamps = JSON.parse(props?.timestamps);
        if (Array.isArray(parsedTimestamps)) {
          timestamps = parsedTimestamps.filter((t: unknown): t is number => typeof t === 'number');
        }
      } catch (err) {
        console.warn('⚠️ Failed to parse props:', err);
      }

      const container = document.createElement('div');
      popupContainer = container;

      // 👉 Hover sticky logic
      container.addEventListener('mouseenter', () => {
        isMouseOnPopup = true;
        if (closeTimeout) clearTimeout(closeTimeout);
      });

      container.addEventListener('mouseleave', () => {
        isMouseOnPopup = false;
        closeTimeout = setTimeout(() => {
          if (!isMouseOnPopup) popup.remove();
        }, 200);
      });

      const centerLat = coords[1].toFixed(5);
      const centerLng = coords[0].toFixed(5);
      let addressText = '';
      const anyEvent = events.find((e) => e.ts === timestamps[0]); // first event in this cluster
      if (anyEvent?.address) {
        addressText = `${anyEvent.address}<br/>`;
      }

      container.innerHTML = `
  <strong>${props?.label}</strong><br/>
  ${props?.count} detections<br/>
  ${addressText}
  ${centerLat}, ${centerLng}
`;

      const thumbWrapper = document.createElement('div');
      thumbWrapper.style.display = 'flex';
      thumbWrapper.style.flexDirection = 'row';
      thumbWrapper.style.overflowX = 'auto';
      thumbWrapper.style.overflowY = 'hidden'; // Optional
      thumbWrapper.style.gap = '6px';
      thumbWrapper.style.marginTop = '8px';
      thumbWrapper.style.paddingBottom = '4px';
      thumbWrapper.style.maxWidth = '260px'; // Required to restrict width
      thumbWrapper.style.whiteSpace = 'nowrap';
      thumbWrapper.style.scrollbarWidth = 'thin'; // Optional (Firefox)

      let isExpanded = false;

      const renderThumbnails = (limit: number | null = null) => {
        thumbWrapper.innerHTML = '';

        const items = limit ? thumbs.slice(0, limit) : thumbs;

        items.forEach((src: string, index: number) => {
          const wrapper = document.createElement('div');
          wrapper.style.display = 'flex';
          wrapper.style.flexDirection = 'column';
          wrapper.style.alignItems = 'center';
          wrapper.style.margin = '3px';

          const img = document.createElement('img');
          img.src = src;
          img.alt = `thumb-${index}`;
          img.style.width = '60px';
          img.style.height = '60px';
          img.style.borderRadius = '6px';
          img.style.objectFit = 'cover';
          img.style.cursor = 'pointer';

          // Zoom-in click
          img.addEventListener('click', () => {
            let currentIndex = index;

            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100vw';
            overlay.style.height = '100vh';
            overlay.style.background = 'rgba(0,0,0,0.9)';
            overlay.style.display = 'flex';
            overlay.style.flexDirection = 'column';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.zIndex = '9999';
            overlay.style.color = 'white';
            overlay.style.padding = '20px';
            overlay.style.boxSizing = 'border-box';

            // ===== Close button =====
            const closeBtn = document.createElement('div');
            closeBtn.textContent = '✕';
            closeBtn.style.position = 'absolute';
            closeBtn.style.top = '20px';
            closeBtn.style.right = '30px';
            closeBtn.style.fontSize = '28px';
            closeBtn.style.cursor = 'pointer';
            closeBtn.addEventListener('click', () => document.body.removeChild(overlay));
            overlay.appendChild(closeBtn);

            // ===== Incident label =====
            const title = document.createElement('h2');
            title.textContent = props?.label || 'Unknown Event';
            title.style.marginBottom = '4px';
            overlay.appendChild(title);

            // ===== Timestamp =====
            const time = document.createElement('div');
            const ts = timestamps[currentIndex];
            time.textContent = ts ? new Date(ts).toLocaleString() : '';
            time.style.marginBottom = '12px';
            time.style.fontSize = '14px';
            overlay.appendChild(time);

            // ===== Location + heading (initial render) =====
            const locationBox = document.createElement('div');
            locationBox.style.marginBottom = '12px';
            locationBox.style.fontSize = '13px';
            locationBox.style.color = '#ccc';
            overlay.appendChild(locationBox);

            const updateLocationInfo = (idx: number) => {
              const ev = events.find((e) => e.ts === timestamps[idx]);
              if (!ev) {
                locationBox.innerHTML = '';
                return;
              }
              const coordsText = `${ev.coord[1].toFixed(5)}, ${ev.coord[0].toFixed(5)}`;
              const addr = ev.address ? `${ev.address}<br/>(${coordsText})` : coordsText;
              const heading =
                ev.headingDeg !== undefined
                  ? `<br/>Drone heading: ${Math.round(ev.headingDeg)}°`
                  : '';
              locationBox.innerHTML = `${addr}${heading}`;
            };
            updateLocationInfo(currentIndex);

            // ===== Large main image =====
            const largeImage = document.createElement('img');
            largeImage.src = thumbs[currentIndex];
            largeImage.style.maxWidth = '80vw';
            largeImage.style.maxHeight = '60vh';
            largeImage.style.borderRadius = '10px';
            largeImage.style.boxShadow = '0 0 20px rgba(0,0,0,0.5)';
            largeImage.style.objectFit = 'contain';
            overlay.appendChild(largeImage);

            // ===== Thumbnail strip =====
            const thumbStrip = document.createElement('div');
            thumbStrip.style.display = 'flex';
            thumbStrip.style.overflowX = 'auto';
            thumbStrip.style.marginTop = '20px';
            thumbStrip.style.padding = '10px';
            thumbStrip.style.gap = '10px';
            thumbStrip.style.borderTop = '1px solid #444';

            thumbs.forEach((thumbSrc, i) => {
              const thumbBox = document.createElement('div');
              thumbBox.style.display = 'flex';
              thumbBox.style.flexDirection = 'column';
              thumbBox.style.alignItems = 'center';
              thumbBox.style.cursor = 'pointer';

              const thumbImg = document.createElement('img');
              thumbImg.src = thumbSrc;
              thumbImg.style.width = '60px';
              thumbImg.style.height = '60px';
              thumbImg.style.borderRadius = '6px';
              thumbImg.style.objectFit = 'cover';
              thumbImg.style.border =
                i === currentIndex ? '2px solid #fff' : '2px solid transparent';

              thumbImg.addEventListener('click', () => {
                currentIndex = i;
                largeImage.src = thumbs[currentIndex];
                const newTs = timestamps[currentIndex];
                time.textContent = newTs ? new Date(newTs).toLocaleString() : '';
                updateLocationInfo(currentIndex); // 🔑 update coords + heading
                Array.from(thumbStrip.children).forEach((el, j) => {
                  const img = el.querySelector('img');
                  if (img) img.style.border = j === i ? '2px solid #fff' : '2px solid transparent';
                });
              });

              const thumbTime = document.createElement('div');
              const thumbTs = timestamps[i];
              thumbTime.textContent = thumbTs ? new Date(thumbTs).toLocaleTimeString() : '';
              thumbTime.style.fontSize = '12px';
              thumbTime.style.color = '#ccc';
              thumbTime.style.marginTop = '4px';

              thumbBox.appendChild(thumbImg);
              thumbBox.appendChild(thumbTime);
              thumbStrip.appendChild(thumbBox);
            });

            overlay.appendChild(thumbStrip);

            document.body.appendChild(overlay);
          });

          wrapper.appendChild(img);

          const ts = timestamps[index];
          if (ts) {
            const label = document.createElement('div');
            label.textContent = new Date(ts).toLocaleTimeString();
            label.style.fontSize = '12px';
            label.style.color = '#666';
            label.style.marginTop = '4px';
            wrapper.appendChild(label);
          }

          thumbWrapper.appendChild(wrapper);
        });
      };

      // Render first 3 only
      renderThumbnails();
      container.appendChild(thumbWrapper);

      // Add expand/collapse toggle if needed
      // if (thumbs.length > 3) {
      //   const toggle = document.createElement('button');
      //   toggle.textContent = `+${thumbs.length - 3} more`;
      //   toggle.style.marginTop = '8px';
      //   toggle.style.padding = '4px 8px';
      //   toggle.style.border = 'none';
      //   toggle.style.borderRadius = '4px';
      //   toggle.style.background = '#eee';
      //   toggle.style.cursor = 'pointer';
      //   toggle.style.fontSize = '13px';

      //   // toggle.addEventListener('click', () => {
      //   //   isExpanded = !isExpanded;
      //   //   renderThumbnails(isExpanded ? null : 3);
      //   //   toggle.textContent = isExpanded ? 'Show less' : `+${thumbs.length - 3} more`;
      //   // });

      //   container.appendChild(toggle);
      // }

      popup.setLngLat(coords).setDOMContent(container).addTo(m);
    };

    const onLeave = () => {
      m.getCanvas().style.cursor = '';
      closeTimeout = setTimeout(() => {
        if (!isMouseOnPopup) popup.remove();
      }, 200);
    };

    m.on('mouseenter', 'category-clusters', onEnter);
    m.on('mouseleave', 'category-clusters', onLeave);

    return () => {
      m.off('mouseenter', 'category-clusters', onEnter);
      m.off('mouseleave', 'category-clusters', onLeave);
      popup.remove();
    };
  }, []);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });

    const onEnter = (e: any) => {
      m.getCanvas().style.cursor = 'pointer';
      const feat = e.features?.[0];
      if (!feat) return;

      const coords = (feat.geometry as Point).coordinates as Coord;
      const props = feat.properties as any;

      // Find the full DetectionEvent so we can access address/heading
      const ev = events.find((x) => x.ts === props.ts);
      if (!ev) return;

      // Format location string
      const locationInfo = ev.address
        ? `${ev.address}<br/>(${ev.coord[1].toFixed(5)}, ${ev.coord[0].toFixed(5)})`
        : `Lat: ${ev.coord[1].toFixed(5)}, Lng: ${ev.coord[0].toFixed(5)}`;

      // Optional heading
      const headingInfo =
        ev.headingDeg !== undefined ? `<br/>Heading: ${Math.round(ev.headingDeg)}°` : '';

      // Optional thumbnail
      const thumbHtml = ev.thumbnail
        ? `<br/><img src="${ev.thumbnail}" width="150" style="border-radius:6px;margin-top:6px"/>`
        : '';

      popup
        .setLngLat(coords)
        .setHTML(
          `
        <strong>${ev.label.toUpperCase()}</strong><br/>
        ${new Date(ev.ts).toLocaleTimeString()}<br/>
        ${locationInfo}
        ${headingInfo}
        ${thumbHtml}
      `
        )
        .addTo(m);
    };

    const onLeave = () => {
      m.getCanvas().style.cursor = '';
      popup.remove();
    };
    const onClick = (e: any) => {
      const feat = e.features?.[0];
      if (!feat || events.length === 0) return;
      const ts = (feat.properties as any).ts as number;
      const firstTs = events[0].ts;
      const offsetSec = Math.max(0, (ts - firstTs) / 1000);
      videoRef.current?.seekTo(offsetSec);
    };

    m.on('mouseenter', 'annots', onEnter);
    m.on('mouseleave', 'annots', onLeave);
    m.on('click', 'annots', onClick);
    return () => {
      m.off('mouseenter', 'annots', onEnter);
      m.off('mouseleave', 'annots', onLeave);
      m.off('click', 'annots', onClick);
      popup.remove();
    };
  }, [events]);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.resize();
      // Expose the map instance for debugging
    }
  }, [videoExpanded]);
  useEffect(() => {
    mapRef.current?.resize();
  }, [videoExpanded]);
  useEffect(() => {
    if (!mapEl.current) return;
    const observer = new ResizeObserver(() => {
      mapRef.current?.resize();
    });
    observer.observe(mapEl.current);
    return () => observer.disconnect();
  }, []);

  // --- ✅ NEW: window focus/blur detection ---

  // Snapshot when tab hidden (optional)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden' && missionActiveRef.current) {
        const snap = videoRef.current?.captureFrame?.();
        if (!snap) return;

        const ts = Date.now();

        let coord: Coord;

        // Case 1: Drone in transit → take snapshot at current drone position
        if (inTransit && droneMarkerRef.current) {
          coord = droneMarkerRef.current.getLngLat().toArray() as Coord;
        }
        // Case 2: Drone scanning → also take at current drone position
        else if (!inTransit && droneMarkerRef.current) {
          coord = droneMarkerRef.current.getLngLat().toArray() as Coord;
        }
        // Fallback: mission area center (should rarely happen)
        else {
          coord = missionGeom?.center ?? (mapRef.current?.getCenter().toArray() as Coord);
        }
      }
    };

    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [inTransit, missionGeom]);

  // ---------- UI ----------
  const resetMission = () => {
    setMissionActive(false);
    setInTransit(false);
    setEtaText(null);
    setEvents([]);
    setMissionGeom(null);
    setShowQuickBrief(false); // ✅ reset quick brief
    setMissionPhase('returning');
    // clear sources
    const m = mapRef.current!;
    (m.getSource('missionGeom') as mapboxgl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: [],
    } as FeatureCollection);
    (m.getSource('covered') as mapboxgl.GeoJSONSource).setData(turf.lineString([]) as any);
    (m.getSource('remaining') as mapboxgl.GeoJSONSource).setData(turf.lineString([]) as any);
    (m.getSource('pinnedEvents') as mapboxgl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: [],
    });

    droneMarkerRef.current?.remove();
  };

  const activeBtn = (on: boolean): React.CSSProperties => ({
    width: 44,
    height: 44,
    borderRadius: '50%',
    background: on ? '#111827' : '#fff',
    color: on ? '#fff' : '#111',
    border: '1px solid #e5e7eb',
    cursor: 'pointer',
    fontSize: 20,
    boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
  });

  // Helper banners for the flow you requested
  const InstructionBanner = () => (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        padding: '10px 12px',
        borderRadius: 10,
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        zIndex: 101,
        fontWeight: 600,
      }}
    >
      {!scanMode && '1) Select a mission mode on the right →'}
      {scanMode && !missionGeom && '2) Click on the map to set the target'}
      {scanMode && missionGeom && !missionActive && '3) Start Mission to launch the drone'}
      {missionActive && inTransit && etaText && `In transit — ${etaText}`}
    </div>
  );

  return (
    <>
      <div style={{ display: 'flex', height: 'calc(100vh - 65px)', width: '100vw' }}>
        {/* --- Event Feed Sidebar --- */}

        {/* --- Drawer Toggle Button --- */}
        {showFeed && (
          <EventFeed
            events={allEvents}
            missionActive={missionActive}
            unreadCount={unreadCount}
            onSelect={(ev) => {
              setSelectedEventId(ev.id);
              mapRef.current?.flyTo({ center: ev.coord, zoom: 15 });

              const first = allEvents[0];
              if (first && videoRef.current) {
                const offset = Math.max(0, (ev.ts - first.ts) / 1000);
                videoRef.current.seekTo(offset);
              }

              // mark as read
              setAllEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, seen: true } : e)));
            }}
            onMarkRead={(id) =>
              setAllEvents((prev) => prev.map((e) => (e.id === id ? { ...e, seen: true } : e)))
            }
          />
        )}

        <button
          onClick={() => setShowFeed((v) => !v)}
          style={{
            position: 'absolute',
            top: '50%',
            left: showFeed ? 340 : 0, // move out when sidebar is open
            transform: 'translateY(-50%)',
            zIndex: videoExpanded ? 101 : 107,
            background: showFeed ? '#0ea5e9' : '#111827',
            color: '#fff',
            border: 'none',
            borderRadius: '0 12px 12px 0',
            padding: '10px 16px',
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            transition: 'left 0.3s ease, background 0.3s ease, transform 0.15s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-50%) scale(1.05)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-50%) scale(1)';
          }}
        >
          {showFeed ? '⟨ Hide Feed' : 'Show Feed ⟩'}
        </button>
        <main style={{ flex: 1, position: 'relative' }}>
          <InstructionBanner />

          {/* Map */}
          <div
            ref={mapEl}
            style={{
              position: 'absolute',
              bottom: videoExpanded ? 8 : 0,
              right: videoExpanded ? 20 : 0,
              width: videoExpanded ? 250 : '100%',
              height: videoExpanded ? 250 : '100%',
              transition: 'all 0.3s ease',
              borderRadius: videoExpanded ? 8 : 0,
              overflow: 'hidden',
              zIndex: videoExpanded ? 105 : 106,
            }}
          />
          <div
            className="scanned-area-overlay"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 1200,
            }}
          />

          {/* Always-visible mission mode buttons (right-center) */}
          <div
            style={{
              position: 'absolute',
              top: '10%',
              right: 20,
              transform: 'translateY(-50%)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              zIndex: 2100,
            }}
          >
            <button
              title="Click → circle area"
              onClick={() => {
                setScanMode('CLICK');
                setMissionGeom(null); // must click map after picking the mode
              }}
              style={activeBtn(scanMode === 'CLICK')}
            >
              📍
            </button>
            <button
              title="Street segment"
              onClick={() => {
                setScanMode('STREET');
                setMissionGeom(null);
              }}
              style={activeBtn(scanMode === 'STREET')}
            >
              📏
            </button>
            <PegmanControl enabled={missionActive || allEvents.length > 0} onDropOnMap={handlePegmanDrop} />

          </div>

          {/* Video Review — shown only when mission active */}
          {missionActive && (
            <>
              <div
                style={{
                  position: 'absolute',
                  left: 12,
                  bottom: 12,
                  right: 12,
                  zIndex: 1500,
                }}
              ></div>
              {/* <div
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 20,
                  zIndex: 2500,
                  background: '#fff',
                  borderRadius: 6,
                  padding: '4px 8px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                }}
              >
                <label style={{ fontSize: 14, marginRight: 6 }}>View:</label>
                <select
                  value={viewMode}
                  onChange={(e) => setViewMode(e.target.value as 'events' | 'categories')}
                  style={{ position: 'absolute', top: 10, right: 10, zIndex: 3000 }}
                >
                  <option value="events">Show Events</option>
                  <option value="categories">Show Category Clusters</option>
                </select>
              </div> */}
            </>
          )}
          {/* --- View mode selector --- */}

          {/* Controls */}
          {!missionActive && (
            <button
              disabled={
                !missionGeom?.center ||
                (scanMode === 'STREET' &&
                  (!missionGeom.line || missionGeom.line.geometry.coordinates.length < 2))
              }
              onClick={startMission}
              style={{
                position: 'absolute',
                bottom: 24,
                left: 20,
                padding: '10px 16px',
                borderRadius: 8,
                background: !missionGeom?.center ? '#9ca3af' : '#16a34a',
                color: '#fff',
                fontWeight: 700,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                cursor: !missionGeom?.center ? 'not-allowed' : 'pointer',
                zIndex: 2200,
              }}
            >
              🚀 Start Mission
            </button>
          )}

          {(missionActive || dronePath.length > 0) && (
            <button
              onClick={resetMission}
              style={{
                position: 'absolute',
                bottom: 24,
                left: 20,
                padding: '10px 16px',
                borderRadius: 8,
                background: '#111827',
                color: '#fff',
                fontWeight: 700,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 101,
              }}
            >
              ⏹ End Mission
            </button>
          )}
        </main>
        <ReturnModal
          show={showReturnModal}
          missedEvents={missedEvents}
          reason={awayReason}
          onClose={(remaining) => {
            setShowReturnModal(false);
            setNotificationEvents((prev) => [...prev, ...remaining]);
          }}
          onSelectEvent={(id) => {
            /* flyTo etc. */
          }}
        />
        {/* Mission Status HUD */}
        {missionActive && (
          <div
            style={{
              position: 'absolute',
              top: 76,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(255,255,255,0.9)',
              backdropFilter: 'blur(6px)',
              borderRadius: 12,
              boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
              padding: '10px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              zIndex: videoExpanded ? 101 : 106,
              cursor: 'default',
            }}
            title={
              missionPhase === 'in-transit'
                ? 'Drone is currently en route to the incident area.'
                : missionPhase === 'scanning'
                ? 'Drone is performing its scanning pattern.'
                : missionPhase === 'returning'
                ? 'Drone is returning to base.'
                : 'Mission idle.'
            }
          >
            {/* Icon */}
            <div style={{ fontSize: 24 }}>
              {missionPhase === 'in-transit'
                ? '🚀'
                : missionPhase === 'scanning'
                ? '🛰️'
                : missionPhase === 'returning'
                ? '✅'
                : '⚪'}
            </div>

            {/* Main Text */}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontWeight: 700,
                  color:
                    missionPhase === 'in-transit'
                      ? '#0ea5e9'
                      : missionPhase === 'scanning'
                      ? '#16a34a'
                      : missionPhase === 'returning'
                      ? '#ca8a04'
                      : '#6b7280',
                }}
              >
                {missionPhase === 'in-transit'
                  ? 'En route to target'
                  : missionPhase === 'scanning'
                  ? 'Drone on station'
                  : missionPhase === 'returning'
                  ? 'Returning to base'
                  : 'Idle'}
              </div>

              {/* Subtext */}
              <div style={{ fontSize: 13, color: '#475569', marginTop: 2 }}>
                {missionPhase === 'in-transit' && etaText
                  ? etaText
                  : missionPhase === 'scanning'
                  ? `Performing ${scanMode} scan...`
                  : missionPhase === 'returning'
                  ? 'Scan complete — navigation to base in progress...'
                  : 'Awaiting new mission'}
              </div>

              {/* Progress bar only during transit */}
              {missionPhase === 'in-transit' && progressPct !== null && (
                <div
                  style={{
                    marginTop: 6,
                    height: 5,
                    background: '#e5e7eb',
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${progressPct}%`,
                      background: '#0ea5e9',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Optional small drone/port image */}
            {/* <img src="/images/drone-icon.png" alt="drone icon" style={{ width: 28, height: 28 }} /> */}
          </div>
        )}

        {/* {missionPhase === 'returning' && (
          <>
            <div style={{ fontWeight: 700, color: '#111827' }}>
              ✅ Scan complete — returning to base
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
              Drone navigation back to origin in progress...
            </div>
          </>
        )} */}

        {/* 🔔 One-off toast when a new event arrives */}
        {newEventToast && (
          <div
            style={{
              position: 'absolute',
              top: 20,
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#0ea5e9',
              color: '#fff',
              padding: '10px 16px',
              borderRadius: 12,
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              animation: 'fadeOut 4s forwards',
              zIndex: 3000,
            }}
            onAnimationEnd={() => setNewEventToast(null)}
          >
            {newEventToast.label.toUpperCase()} detected!
          </div>
        )}
        <ReturnModal
          show={showReturnModal}
          missedEvents={missedEvents}
          reason={awayReason}
          onClose={(remaining) => {
            setShowReturnModal(false);
            setNotificationEvents((prev) => [...prev, ...remaining]);
          }}
          onSelectEvent={(id) => {
            /* flyTo etc. */
          }}
        />
        {tooltip && (
        <div
          style={{
            position: 'absolute',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#ef4444',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: 12,
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            animation: 'fadeOut 3s forwards',
            zIndex: 4000,
          }}
          onAnimationEnd={() => setTooltip(null)}
        >
          🚫 This area hasn’t been scanned yet
        </div>
      )}

        {(missionActive || dronePath.length > 0) && (
          <div>
            <VideoReview
              ref={videoRef}
              src={DroneEnrouteVideo}
              expanded={videoExpanded}
              onToggle={toggleVideo}
              events={currentBoxes}
            />
            <EventTimeline
              videoHandleRef={videoRef}
              events={allEvents}
              startTs={streamStart ?? Date.now()}
              filters={activeFilters}
              onFilterChange={setActiveFilters}
              availableLabels={[...detectedLabels]}
              onSeek={handleTimelineSeek}
              onGoLive={goLive}
            />
          </div>
        )}
      </div>
    </>
  );
}
