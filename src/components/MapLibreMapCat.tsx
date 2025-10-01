// src/components/pages/ReengagementMap.tsx
import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, LineString, Point, Polygon, MultiPolygon } from 'geojson';
import type { MapGeoJSONFeature } from 'maplibre-gl';
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

function clusterByCategory(events: DetectionEvent[], radiusMeters = 200): Feature<Point>[] {
  const grouped: Record<string, { center: [number, number]; members: DetectionEvent[] }[]> = {};

  for (const e of events) {
    const cat = e.label;
    grouped[cat] ??= [];
    const p = point(e.coord);
    let placed = false;

    for (const g of grouped[cat]) {
      if (distance(point(g.center), p, { units: 'meters' }) < radiusMeters) {
        g.members.push(e);
        g.center = centroid(featureCollection(g.members.map((m) => point(m.coord)))).geometry
          .coordinates as [number, number];
        placed = true;
        break;
      }
    }

    if (!placed) grouped[cat].push({ center: e.coord, members: [e] });
  }

  return Object.entries(grouped).flatMap(([cat, clusters]) =>
    clusters.map((c) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point', coordinates: c.center },
      properties: {
        label: cat,
        count: c.members.length,
        // ✅ force every thumbnail to a plain string
        thumbnails: c.members
          .map((m) => (m.thumbnail ? String(m.thumbnail) : null))
          .filter((t): t is string => !!t),
        timestamps: c.members.map((m) => m.ts),
      },
    }))
  );
}

// ---------------- Config ----------------
type Coord = [number, number];

type DronePort = { coord: Coord; id: string; status: 'idle' | 'in-flight' };
const initialDronePorts: DronePort[] = [
  { coord: [11.505, 48.719], id: 'drone-port-1', status: 'idle' },
  { coord: [11.502, 48.716], id: 'drone-port-2', status: 'idle' },
];

// Mission modes (as you asked: STREET / POI / FOI; plus CLICK if you want a quick circle)
type ScanMode = 'STREET' | 'POI' | 'FOI' | 'CLICK';

const DEFAULT_SCAN_RADIUS_M = 120; // for CLICK/POI circle polygon
const STREET_BUFFER_M = 25; // buffered corridor for STREET
const DRONE_SPEED_MPS = 15; // used to compute ETA (≈54 km/h)
const ORBIT_RADIUS_M = 70; // simple orbit after arrival (optional eye-candy)

// ---------------- Component ----------------
export default function MapLibreMap() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);

  const droneMarkerRef = useRef<maplibregl.Marker | null>(null);
  const originPortRef = useRef<DronePort | null>(null);

  const videoRef = useRef<VideoReviewHandle | null>(null);

  const [scanMode, setScanMode] = useState<ScanMode | null>(null);
  const [missionGeom, setMissionGeom] = useState<{
    kind: ScanMode;
    center: Coord;
    shape?: Feature<Polygon | MultiPolygon>; // ✅ allow MultiPolygon too
    line?: Feature<LineString>;
  } | null>(null);
  const [showFeed, setShowFeed] = useState(true);

  const [missionActive, setMissionActive] = useState(false);
  const [inTransit, setInTransit] = useState(false);
  const [etaText, setEtaText] = useState<string | null>(null);

  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [draftPoints, setDraftPoints] = useState<Coord[]>([]);
  const missionActiveRef = useRef(false);
  const [showQuickBrief, setShowQuickBrief] = useState(false);
  // highlight last arrival
  const [newEventToast, setNewEventToast] = useState<DetectionEvent | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  // new state
  const [missedEvents, setMissedEvents] = useState<DetectionEvent[]>([]);
  const hiddenSince = useRef<number | null>(null);
  const lastAwayTime = useRef<number | null>(null);

  const [isIdle, setIsIdle] = useState(false);
  const idleStart = useRef<number | null>(null);
  const lastActivity = useRef(Date.now());
  const IDLE_TIMEOUT = 5_000; // e.g. 1 minute
  // reason the operator was considered "away"
  type AwayReason = 'tab-switch' | 'out-of-focus' | 'idle' | null;
  const [awayReason, setAwayReason] = useState<AwayReason>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  // highlight currently selected event
  const [showReturnModal, setShowReturnModal] = useState(false);
  // new: events that were missed but not yet opened from the header dropdown
  const [notificationEvents, setNotificationEvents] = useState<DetectionEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [allEvents, setAllEvents] = useState<DetectionEvent[]>([]);

  // ✅ all unique labels we’ve actually received so far
  const detectedLabels = React.useMemo(() => {
    const s = new Set<string>();
    allEvents.forEach((e) => s.add(e.label));
    return s;
  }, [allEvents]);

  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [videoExpanded, setVideoExpanded] = useState(false);
  const toggleVideo = () => setVideoExpanded((v) => !v);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [currentBoxes, setCurrentBoxes] = useState<DetectionEvent[]>([]);

  // const [streamStart] = useState(() => Date.now());
  const [streamStart, setStreamStart] = useState<number | null>(null);

  const toggleFilter = (label: DetectionEvent['label']) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };
  // 🔌 Connect to YOLO WebSocket backend
  // useEffect(() => {
  //   const ws = new WebSocket(`ws://${window.location.hostname}:8000/ws`);
  //   ws.onopen = () => console.log('🔌 WebSocket connected');

  //   ws.onmessage = (msg) => {
  //     const data = JSON.parse(msg.data);
  //     console.log('📩 Incoming from backend:', data);

  //     if (data.events && data.events.length > 0) {
  //       setEvents((prev) => [...prev, ...data.events]); // ✅ store backend detections
  //     }
  //   };

  //   ws.onclose = () => console.log('🔌 WebSocket closed');
  //   return () => ws.close();
  // }, []);

  // const [viewMode, setViewMode] = useState<'events' | 'categories'>('events');
  useEffect(() => {
    missionActiveRef.current = missionActive;
  }, [missionActive]);
  // ---------- Map init ----------
  useEffect(() => {
    if (!mapEl.current) return;

    const m = new maplibregl.Map({
      container: mapEl.current,
      style: {
        version: 8,
        glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
          },
          missionGeom: {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] } as FeatureCollection,
          },
          covered: {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: [] },
              properties: {},
            },
          },
          remaining: {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: [] },
              properties: {},
            },
          },
          annotations: {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
            cluster: true, // ✅ enable clustering
            clusterRadius: 50, // pixels around which points will group
            clusterMaxZoom: 14, // stop clustering beyond this zoom
          },
          annotationsCategory: {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
        },
        layers: [
          { id: 'osm', type: 'raster', source: 'osm' },
          {
            id: 'mission-fill',
            type: 'fill',
            source: 'missionGeom',
            filter: ['==', ['geometry-type'], 'Polygon'],
            paint: { 'fill-color': '#0ea5e9', 'fill-opacity': 0.12 },
          },
          {
            id: 'mission-outline',
            type: 'line',
            source: 'missionGeom',
            filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'LineString']]],
            paint: { 'line-color': '#0ea5e9', 'line-width': 2, 'line-dasharray': [2, 1] },
          },
          {
            id: 'path-covered',
            type: 'line',
            source: 'covered',
            paint: { 'line-color': '#16a34a', 'line-width': 4 },
          },
          {
            id: 'path-remaining',
            type: 'line',
            source: 'remaining',
            paint: { 'line-color': '#64748b', 'line-width': 3, 'line-dasharray': [2, 2] },
          },

          // --- 🔵 Category cluster background (colored circle)
          {
            id: 'category-clusters',
            type: 'circle',
            source: 'annotationsCategory',
            paint: {
              'circle-color': [
                'match',
                ['get', 'label'],
                'fire',
                '#ef4444',
                'person',
                '#0ea5e9',
                'chemical',
                '#eab308',
                'snapshot',
                '#22c55e',
                /* default */ '#6b7280',
              ],
              'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 22, 10, 28, 20, 34],
              'circle-stroke-color': '#fff',
              'circle-stroke-width': 2,
            },
          },

          // --- 🖼 icon (white SVG) drawn on top of the circle
          {
            id: 'category-icons',
            type: 'symbol',
            source: 'annotationsCategory',
            layout: {
              'icon-image': [
                'match',
                ['get', 'label'],
                'fire',
                'cat-fire',
                'person',
                'cat-person',
                'chemical',
                'cat-chemical',
                'snapshot',
                'cat-snapshot',
                '', // fallback
              ],
              'icon-size': 0.7,
              'icon-allow-overlap': true,
            },
          },

          // --- 🔢 count number over everything
          {
            id: 'category-count',
            type: 'symbol',
            source: 'annotationsCategory',
            layout: {
              'text-field': '{count}', // show the count
              'text-size': 11, // smaller font
              'text-font': ['Open Sans Bold'],
              'text-allow-overlap': true,
              'text-offset': [0.7, -0.7], // move to top-right of the circle
              'text-anchor': 'center',
            },
            paint: {
              'text-color': '#fff',
              'text-halo-color': '#000', // optional: small outline for readability
              'text-halo-width': 1,
            },
          },
          {
            id: 'annots',
            type: 'circle',
            source: 'annotations',
            // show only real (unclustered) events
            filter: ['!', ['has', 'point_count']],
            paint: {
              'circle-radius': 8,
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
                'snapshot',
                '#22c55e',
                '#6b7280',
              ],
              'circle-stroke-color': '#fff',
              'circle-stroke-width': 2,
            },
          },
          {
            id: 'clusters',
            type: 'circle',
            source: 'annotations',
            filter: ['has', 'point_count'], // only clustered features
            paint: {
              'circle-color': '#0ea5e9',
              'circle-radius': ['step', ['get', 'point_count'], 15, 10, 20, 30, 25],
              'circle-stroke-color': '#fff',
              'circle-stroke-width': 2,
            },
          },
          {
            id: 'cluster-count',
            type: 'symbol',
            source: 'annotations',
            filter: ['has', 'point_count'],
            layout: {
              'text-field': '{point_count_abbreviated}',
              'text-font': ['Open Sans Bold'],
              'text-size': 14,
            },
            paint: { 'text-color': '#fff' },
          },
        ],
      },
      center: [11.506, 48.718],
      zoom: 13,
    });

    m.on('load', () => {
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
        new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(coord).addTo(m);
      });
      // Load SVG icons (white fill so they stand out on coloured circle)
      Object.entries(categoryIcons).forEach(([key, { svg: Icon }]) => {
        const markup = renderToStaticMarkup(<Icon color="#fff" size={28} />);
        const blob = new Blob([markup], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const img = new Image(32, 32);

        img.onload = () => {
          if (!m.hasImage(`cat-${key}`)) {
            m.addImage(`cat-${key}`, img, { pixelRatio: 2 });
          }
          URL.revokeObjectURL(url);
        };

        img.src = url;
      });
    });

    mapRef.current = m;

    // ✅ Correct cleanup
    return () => {
      m.remove();
    };
  }, []);

  // ---------- Mode → next map click defines target ----------

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
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
  // useEffect(() => {
  //   const m = mapRef.current;
  //   if (!m) return;

  //   const setVis = (id: string, visible: boolean) => {
  //     if (m.getLayer(id)) {
  //       m.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  //     }
  //   };

  //   // turn individual events ON only if viewMode === 'events'
  //   setVis('annots', viewMode === 'events');
  //   setVis('clusters', viewMode === 'events');
  //   setVis('cluster-count', viewMode === 'events');

  //   // turn category clusters ON only if viewMode === 'categories'
  //   setVis('category-clusters', viewMode === 'categories');
  //   setVis('category-count', viewMode === 'categories');
  // }, [viewMode]);
  // useEffect(() => {
  //   if (viewMode === 'categories') {
  //     // hide all manual markers
  //     markersRef.current.forEach((marker) => {
  //       marker.getElement().style.display = 'none';
  //     });
  //   } else {
  //     // show them again
  //     markersRef.current.forEach((marker) => {
  //       marker.getElement().style.display = '';
  //     });
  //   }
  // }, [viewMode]);

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
    if (!m.isStyleLoaded()) return;

    const src = m.getSource('annotationsCategory') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    // ✅ keep only events that match the current filters
    const filtered = allEvents.filter(
      (ev) => activeFilters.size === 0 || activeFilters.has(ev.label)
    );

    // then cluster that subset
    const clustered = clusterByCategory(filtered, 200);

    src.setData({
      type: 'FeatureCollection',
      features: clustered,
    });

    console.log(
      'Category source now has',
      clustered.length,
      'features:',
      clustered.map((f) => f.properties)
    );
  }, [allEvents, activeFilters]); // 👈 re-run when history or filters change

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSince.current = Date.now();
      } else {
        const since = hiddenSince.current;
        if (!since) return;
        // use the ref so we always have the newest list
        const missed = eventsRef.current.filter((e) => e.ts > since);
        if (missed.length) {
          setMissedEvents(missed);
          setShowReturnModal(true);
        }
      }
    };

    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []); // 👈 run once

  const setMissionTargetOnMap = (opts: {
    polygon?: Feature<Polygon | MultiPolygon>;
    line?: Feature<LineString>;
  }) => {
    const m = mapRef.current!;
    const features: any[] = [];
    if (opts.polygon) features.push(opts.polygon);
    if (opts.line) features.push(opts.line);
    (m.getSource('missionGeom') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features,
    } as FeatureCollection);
    // Reset path sources
    (m.getSource('covered') as maplibregl.GeoJSONSource).setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [] },
      properties: {},
    } as any);
    (m.getSource('remaining') as maplibregl.GeoJSONSource).setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [] },
      properties: {},
    } as any);
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
      if (!missionActiveRef.current) return;
      if (!droneMarkerRef.current) return;

      droneMarkerRef.current.setLngLat(coords[idx]);
      idx = (idx + 1) % coords.length;
      requestAnimationFrame(animate);
    };
    animate();

    // draw the ring on the map for visual feedback
    const ring = turf.lineString(coords);
    (mapRef.current!.getSource('missionGeom') as maplibregl.GeoJSONSource).setData({
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
      if (!missionActiveRef.current) return;
      if (!droneMarkerRef.current) return;

      droneMarkerRef.current.setLngLat(path[idx]);
      idx = (idx + 1) % path.length;

      requestAnimationFrame(animate);
    };
    animate();

    const scanLine = turf.lineString(path);
    (mapRef.current!.getSource('missionGeom') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: [scanLine],
    });
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

    // Choose nearest port
    const center = missionGeom.center;
    const origin = nearestPort(center);
    originPortRef.current = origin;

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
    droneMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
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

    // ⭐ NEW popup to show live progress
    const progressPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'drone-progress-popup',
    }).addTo(mapRef.current!);

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

    // Prime sources
    (mapRef.current!.getSource('remaining') as maplibregl.GeoJSONSource).setData(
      toTarget.geometry.coordinates.length >= 2
        ? toTarget
        : ({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [] },
            properties: {},
          } as Feature<LineString>)
    );
    (mapRef.current!.getSource('covered') as maplibregl.GeoJSONSource).setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [] },
      properties: {},
    } as Feature<LineString>);

    // ETA
    // ETA
    const eta = new Date(Date.now() + transitMs);
    setEtaText(`ETA ${eta.toLocaleTimeString()}`);

    // ✅ NEW logic here
    if (toTarget.geometry.coordinates.length >= 2 && totalDistKm > 0) {
      // Normal case → drone flies
      setMissionActive(true);
      setStreamStart(Date.now());
      setInTransit(true);

      let startTs: number | null = null;
      const raf = (now: number) => {
        if (!droneMarkerRef.current) return;
        if (startTs === null) startTs = now;
        const t = Math.min((now - startTs) / transitMs, 1);
        const distKm = totalDistKm * t;

        // move drone along path
        const pt = turf.along(toTarget, distKm, { units: 'kilometers' }) as Feature<Point>;
        const cur = pt.geometry.coordinates as Coord;
        droneMarkerRef.current?.setLngLat(cur);
        // console.log('Drone position:', cur, 'progress:', t);

        // ⭐ Update popup text/location each frame
        const metersLeft = Math.max(0, totalDistM - distKm * 1000);
        const secsLeft = Math.max(0, ((1 - t) * transitMs) / 1000).toFixed(0);
        progressPopup
          .setLngLat(cur)
          .setHTML(`<strong>${Math.round(metersLeft)} m left</strong><br/>ETA ${secsLeft}s`);

        // update path slices
        let covered = turf.lineSlice(turf.point(origin.coord), turf.point(cur), toTarget);
        if (!covered.geometry.coordinates || covered.geometry.coordinates.length < 2) {
          covered = {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [] },
            properties: {},
          };
        }

        let remaining = turf.lineSlice(turf.point(cur), turf.point(center), toTarget);
        if (!remaining.geometry.coordinates || remaining.geometry.coordinates.length < 2) {
          remaining = {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [] },
            properties: {},
          };
        }

        (mapRef.current!.getSource('covered') as maplibregl.GeoJSONSource).setData(covered);
        (mapRef.current!.getSource('remaining') as maplibregl.GeoJSONSource).setData(remaining);

        if (t < 1) {
          requestAnimationFrame(raf);
        } else {
          // ✅ Arrived
          progressPopup.remove(); // <-- remove ETA popup here

          setInTransit(false);
          (mapRef.current!.getSource('remaining') as maplibregl.GeoJSONSource).setData({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [] },
            properties: {},
          });

          // 🚀 Start scanning depending on mission type
          if (scanMode === 'CLICK') {
            startCircleScan(center);
          } else if (scanMode === 'STREET' && missionGeom?.line) {
            startStreetScan(missionGeom.line);
          } else {
            startOrbit(center); // fallback
          }
        }
      };
      requestAnimationFrame(raf);
    } else {
      // Special case → no distance to fly
      progressPopup.remove();

      setMissionActive(true);
      setInTransit(false);
      droneMarkerRef.current?.setLngLat(center);
      startOrbit(center);
    }
    // inside startMission, after setMissionActive(true)
    const socket = new WebSocket(`ws://${window.location.hostname}:8000/ws`);
    setWs(socket);

    socket.onopen = () => {
      console.log('🔌 Detection WebSocket connected');

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
      };

      socket.onmessage = (msg) => {
        const data = JSON.parse(msg.data);

        const normalize = (l: string) =>
          l.toLowerCase() === 'people' ? 'person' : l.toLowerCase();

        const iconMap: Record<string, string> = {
          fire: '🔥',
          person: '👤',
          chemical: '🧪',
          snapshot: '📸',
          car: '🚗', // add whatever else your backend might send
          truck: '🚚',
          animal: '🐾', // example extra
        };

        if (data.events) {
          const fixed = data.events.map((e: DetectionEvent) => {
            const label = normalize(e.label);
            return {
              ...e,
              ts: e.ts && e.ts > 1e11 ? e.ts : Date.now(),
              label,
              icon: iconMap[label] || '📸', // fallback only if label missing
            };
          });

          console.log(
            'Adding events',
            fixed.map((ev: DetectionEvent) => ({ label: ev.label, icon: ev.icon }))
          );

          setCurrentBoxes(fixed);
          setAllEvents((prev) => [...prev, ...fixed]);
        }
      };
    };
  };

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.isStyleLoaded()) return;

    const features = clusterByCategory(events, 200);
    console.log('⬆️ Updating annotationsCategory with', features.length, 'features');

    (m.getSource('annotationsCategory') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features,
    });

    // Check right after setting
    console.log(
      '➡️ Current category source features:',
      m.querySourceFeatures('annotationsCategory').map((f) => f.properties)
    );
  }, [events]);

  const startOrbit = (center: Coord) => {
    // Optional: small circular patrol to visualize "scan"
    const m = mapRef.current!;
    const orbit = turf.circle(center, ORBIT_RADIUS_M, {
      units: 'meters',
      steps: 120,
    }) as Feature<Polygon>;
    const ring = orbit.geometry.coordinates[0];
    let i = 0;
    const tick = () => {
      if (!missionActive) return;
      i = (i + 1) % ring.length;
      droneMarkerRef.current?.setLngLat(ring[i] as Coord);
      setTimeout(tick, 80);
    };
    tick();
  };

  const nearestPort = (pt: Coord): DronePort => {
    return initialDronePorts.reduce((best, p) => {
      const dBest = turf.distance(best.coord, pt);
      const dP = turf.distance(p.coord, pt);
      return dP < dBest ? p : best;
    }, initialDronePorts[0]);
  };

  // ---------- Detections (mock) + annotations layer ----------
  // When mission is active, periodically add fake detections near the selected target
  // useEffect(() => {
  //   if (!missionActiveRef.current) return;
  //   if (inTransit) return;
  //   if (!droneMarkerRef.current) return;
  //   const id = setInterval(() => {
  //     // inside your detection interval effect:
  //     const area = missionGeom?.shape; // already a Polygon (circle buffer, corridor, FOI)
  //     if (!area) return;

  //     // pick one random point inside area
  //     const pts = turf.randomPoint(1, { bbox: turf.bbox(area) }).features;
  //     let pt = pts[0];
  //     if (!turf.booleanPointInPolygon(pt, area)) {
  //       // retry until point is inside
  //       for (let i = 0; i < 5; i++) {
  //         const retry = turf.randomPoint(1, { bbox: turf.bbox(area) }).features[0];
  //         if (turf.booleanPointInPolygon(retry, area)) {
  //           pt = retry;
  //           break;
  //         }
  //       }
  //     }

  //     const coord = pt.geometry.coordinates as Coord;
  //     const ts = Date.now();
  //     const labels: DetectionEvent['label'][] = ['fire', 'chemical', 'person'];
  //     const label = labels[Math.floor(Math.random() * labels.length)];
  //     const currentTime = videoRef.current?.getCurrentTime() ?? 0;
  //     const snapshot = videoRef.current?.captureFrame?.() ?? undefined;
  //     console.log('📸 snapshot value:', snapshot?.length);

  //     const newEvent: DetectionEvent = {
  //       id: `${ts}-${label}`,
  //       ts,
  //       label,
  //       score: 0.9,
  //       coord,
  //       seen: false,
  //       thumbnail: snapshot,
  //       videoTime: currentTime, // optional, for later seeking
  //       bbox: [0, 0, 0, 0],
  //     };

  //     setEvents((prev) => {
  //       const next = [...prev, newEvent];
  //       setNewEventToast(newEvent); // show the temporary toast (make sure you have const [newEventToast,setNewEventToast] = useState<DetectionEvent|null>(null);)
  //       setUnreadCount((c) => c + 1); // optional unread badge (if you added unread state)
  //       return next;
  //     });
  //   }, 4000);
  //   return () => clearInterval(id);
  // }, [missionActive, inTransit, missionGeom]);

  // Push events into the "annotations" source whenever they change
  // useEffect(() => {
  //   const m = mapRef.current;
  //   if (!m) return;

  //   // remove previous markers so we don’t duplicate them
  //   markersRef.current.forEach((marker) => marker.remove());
  //   markersRef.current = [];

  //   const popup = new maplibregl.Popup({ closeButton: false, offset: 25 });

  //   // ✅ filter using the shared Set of active filters
  //   const visible = events.filter((e) => activeFilters.has(e.label));

  //   visible.forEach((ev) => {
  //     const el = createEventMarker(ev.label);
  //     el.classList.add('map-marker');
  //     el.dataset.id = ev.id;

  //     const marker = new maplibregl.Marker({ element: el }).setLngLat(ev.coord).addTo(m);

  //     // build the popup HTML
  //     const html =
  //       ev.label === 'snapshot'
  //         ? `
  //           <strong>📸 Snapshot</strong><br/>
  //           ${new Date(ev.ts).toLocaleTimeString()}<br/>
  //           ${
  //             ev.thumbnail
  //               ? `<img src="${ev.thumbnail}" style="margin-top:6px;max-width:150px;border-radius:6px"/>`
  //               : ''
  //           }
  //         `
  //         : `
  //           <strong>${ev.label}</strong><br/>
  //           ${new Date(ev.ts).toLocaleTimeString()}
  //         `;

  //     el.addEventListener('mouseenter', () => {
  //       setSelectedEventId(ev.id); // highlight on hover
  //       popup.setLngLat(ev.coord).setHTML(html).addTo(m);
  //     });

  //     el.addEventListener('mouseleave', () => {
  //       setSelectedEventId(null); // clear when leaving
  //       popup.remove();
  //     });

  //     el.addEventListener('click', () => {
  //       m.flyTo({ center: ev.coord, zoom: 16 });
  //       const firstTs = events[0]?.ts ?? ev.ts;
  //       videoRef.current?.seekTo(Math.max(0, (ev.ts - firstTs) / 1000));
  //     });

  //     markersRef.current.push(marker);
  //   });

  //   // cleanup
  //   return () => {
  //     popup.remove();
  //     markersRef.current.forEach((marker) => marker.remove());
  //     markersRef.current = [];
  //   };
  // }, [events, activeFilters]); // <-- note activeFilters here
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    // ensure the style is fully loaded and the source exists
    if (!m.isStyleLoaded() || !m.getSource('annotations')) return;

    const collection: FeatureCollection<Point> = {
      type: 'FeatureCollection',
      features: events
        .filter((e) => activeFilters.has(e.label))
        .map(
          (e): Feature<Point> => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: e.coord },
            properties: { ...e },
          })
        ),
    };

    (m.getSource('annotations') as maplibregl.GeoJSONSource).setData(collection);
  }, [events, activeFilters]);

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

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
    });

    let popupContainer: HTMLDivElement | null = null;
    let isMouseOnPopup = false;
    let closeTimeout: ReturnType<typeof setTimeout> | null = null;

    const onEnter = (e: maplibregl.MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat) return;

      const coords = (feat.geometry as Point).coordinates as [number, number];
      const props = feat.properties;

      let thumbs: string[] = [];
      let timestamps: number[] = [];

      try {
        const parsedThumbs = JSON.parse(props.thumbnails);
        if (Array.isArray(parsedThumbs)) {
          thumbs = parsedThumbs.filter(
            (t: unknown): t is string => typeof t === 'string' && t.startsWith('data:image')
          );
        }

        const parsedTimestamps = JSON.parse(props.timestamps);
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
  <strong>${props.label}</strong><br/>
  ${props.count} detections<br/>
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
            title.textContent = props.label || 'Unknown Event';
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
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

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

  // --- ✅ NEW: window focus/blur detection ---
  useEffect(() => {
    const handleBlur = () => {
      lastAwayTime.current = Date.now();
      setAwayReason('out-of-focus'); // 👈 add this
    };
    const handleFocus = () => {
      if (lastAwayTime.current) {
        const missed = events.filter((e) => e.ts > lastAwayTime.current!);
        if (missed.length) {
          setMissedEvents(missed);
          setShowQuickBrief(true);
        }
        lastAwayTime.current = null;
      }
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [events]);

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

        // setEvents((prev) => [
        //   ...prev,
        //   {
        //     id: `snap-${ts}`,
        //     ts,
        //     label: 'snapshot',
        //     score: 1,
        //     coord, // ✅ now tied to actual drone path
        //     seen: false,
        //     thumbnail: snap,
        //   },
        // ]);
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
    // clear sources
    const m = mapRef.current!;
    (m.getSource('missionGeom') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: [],
    } as FeatureCollection);
    (m.getSource('covered') as maplibregl.GeoJSONSource).setData(turf.lineString([]) as any);
    (m.getSource('remaining') as maplibregl.GeoJSONSource).setData(turf.lineString([]) as any);
    (m.getSource('annotations') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: events.map((ev) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: ev.coord },
        properties: { ...ev },
      })),
    });
    droneMarkerRef.current?.remove();
  };

  // Reset timer on any activity
  const markActivity = () => {
    lastActivity.current = Date.now();
    if (isIdle) setIsIdle(false);
  };

  useEffect(() => {
    const activityEvents = ['mousemove', 'keydown', 'scroll', 'mousedown', 'touchstart'];
    const handleActivity = () => {
      lastActivity.current = Date.now();
      setIsIdle(false);
    };
    activityEvents.forEach((ev) => window.addEventListener(ev, handleActivity));

    const check = setInterval(() => {
      if (Date.now() - lastActivity.current > IDLE_TIMEOUT) {
        setIsIdle(true);
        if (!idleStart.current) idleStart.current = Date.now();
      }
    }, 10000);

    return () => {
      activityEvents.forEach((ev) => window.removeEventListener(ev, handleActivity));
      clearInterval(check);
    };
  }, []); // ✅ run once

  useEffect(() => {
    if (!isIdle && idleStart.current) {
      const missed = events.filter((e) => e.ts > idleStart.current!); // <- !
      if (missed.length) {
        setMissedEvents(missed);
        setShowQuickBrief(true);
      }
      idleStart.current = null;
    }
  }, [isIdle, events]);

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
        zIndex: 2000,
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
      <Header
        notifications={notificationEvents}
        onSelectNotification={(ev) => {
          setSelectedEventId(ev.id);
          mapRef.current?.flyTo({ center: ev.coord, zoom: 16 });
        }}
      />
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
            zIndex: 4000,
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
              zIndex: 100,
            }}
          />

          {/* Always-visible mission mode buttons (right-center) */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
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

          {missionActive && (
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
                zIndex: 2200,
              }}
            >
              ⏹ End Mission
            </button>
          )}
        </main>
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
        {missionActive && (
          <>
            <VideoReview
              ref={videoRef}
              // src={inTransit ? DroneEnrouteVideo : FirefighterVideo}
              src={DroneEnrouteVideo}
              expanded={videoExpanded}
              onToggle={toggleVideo}
              events={currentBoxes}
            />

            {/* New filter strip positioned wherever you like */}
            {/* <EventFilters active={activeFilters} onToggle={toggleFilter} /> */}

            {console.log('Timeline props', {
              startTs: streamStart,
              count: allEvents.length,
              labels: [...detectedLabels],
              filters: [...activeFilters],
            })}

            <EventTimeline
              videoHandleRef={videoRef}
              events={allEvents}
              startTs={streamStart ?? Date.now()}
              filters={activeFilters}
              onFilterChange={setActiveFilters}
              availableLabels={[...detectedLabels]}
            />
            {/* Debug overlay for backend detections */}
          </>
        )}
      </div>
    </>
  );
}
