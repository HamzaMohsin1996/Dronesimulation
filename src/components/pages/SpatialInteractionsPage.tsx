import React, { useEffect, useRef, useState } from 'react';
import mapboxgl, { Map as MapboxMap, Marker, GeoJSONSource, MapMouseEvent, Popup } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, LineString, Point, Polygon, MultiPolygon } from 'geojson';
import Header from '../Header/Header';
import PersonIcon from '../../assets/images/personMarker.svg';
import DronePortIcon from '../../assets/images/icons/dronePort.svg';
import DroneIcon from '../../assets/images/icons/twister.png';
import type { DetectionEvent } from '../../shared/DetectionEvent';
import VideoReview, { VideoReviewHandle } from '../VideoReview';
import DroneEnrouteVideo from '../../assets/images/dronenroute.mp4';
import PegmanControl from '../PegmanIcon';
import { createRoot } from "react-dom/client";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string;

type Coord = [number, number];
type ScanMode = 'CLICK' | 'STREET';

const MAP_STYLES = {
  Streets: 'mapbox://styles/mapbox/streets-v12',
  Satellite: 'mapbox://styles/mapbox/satellite-v9',
} as const;

const DEFAULT_SCAN_RADIUS_M = 120;
const STREET_BUFFER_M = 25;
const DRONE_SPEED_MPS = 15;
const ORBIT_RADIUS_M = 70;
const SENSOR_WIDTH = 20;
const SENSOR_DEPTH = 40;

const DRONE_PORTS: Coord[] = [
  [11.505, 48.719],
  [11.502, 48.716],
];

export default function ReengagementMap() {
  const mapRef = useRef<MapboxMap | null>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const styleReadyRef = useRef(false);

  const [mapStyle, setMapStyle] = useState<'Streets' | 'Satellite'>('Streets');
  const [scanMode, setScanMode] = useState<ScanMode>('CLICK');
  const [streetDraft, setStreetDraft] = useState<Coord[]>([]);
  const [notificationEvents, setNotificationEvents] = useState<DetectionEvent[]>([]);
  // --- at the top of ReengagementMap
  const [viewerActive, setViewerActive] = useState(false);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [videoExpanded, setVideoExpanded] = useState(true);
  const videoRef = useRef<VideoReviewHandle>(null);
  function showHint(msg: string, ms = 4000) {
    setHint(msg);
    setTimeout(() => setHint(null), ms);
  }
  const [missionGeom, setMissionGeom] = useState<{
    center: Coord;
    shape?: Feature<Polygon>;
    line?: Feature<LineString>;
  } | null>(null);

  const [missionActive, setMissionActive] = useState(false);
  const missionActiveRef = useRef(false);
  useEffect(() => {
    missionActiveRef.current = missionActive;
  }, [missionActive]);

  const droneMarkerRef = useRef<Marker | null>(null);
  const dronePopupRef = useRef<Popup | null>(null);
  const animationFrame = useRef<number | null>(null);

  const [etaSec, setEtaSec] = useState<number | null>(null);
  const [distKmLeft, setDistKmLeft] = useState<number | null>(null);
  const [arrivalToast, setArrivalToast] = useState<string | null>(null);

  // scanned rectangles
  const scannedRef = useRef<FeatureCollection>({ type: 'FeatureCollection', features: [] });

  // gimbal target
  const [gimbalTarget, setGimbalTarget] = useState<Coord | null>(null);

  // fire detections
  const fireRef = useRef<Coord | null>(null);
  const fireHistoryRef = useRef<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const lastScanTsRef = useRef(0);
  const SCAN_INTERVAL_MS = 300; // scan every 0.3 seconds
  

  // 🧍 Add draggable person (Pegman-style)
  const personMarkerRef = useRef<mapboxgl.Marker | null>(null);

  function handlePegmanDrop(lng: number, lat: number) {
    console.log("Pegman dropped at:", lng, lat);
    handlePersonDropped([lng, lat]); // reuse the same logic
  }
  
  
  function handlePersonDropped(coord: Coord) {
    const m = mapRef.current;
    if (!m) return;
  
    const point = turf.point(coord);
  
    // 🧭 Search ALL scanned polygons
    const match = scannedRef.current.features.find((f) => {
      if (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon') return false;
      // Add a small tolerance
      const buffered = turf.buffer(f, 10, { units: 'meters' });
      return turf.booleanPointInPolygon(point, buffered as Feature<Polygon | MultiPolygon>);
    });
  
    if (!match) {
      new mapboxgl.Popup()
        .setLngLat(coord)
        .setHTML("<b>No scan data yet for this area.</b>")
        .addTo(m);
      return;
    }
  
    // ✅ Found a match — open the corresponding video
    const { videoUrl, startTimeSec } = match.properties as any;
    setViewerSrc(videoUrl || DroneEnrouteVideo);
    setViewerActive(true);
  
    // Seek to correct time in video
    setTimeout(() => {
      videoRef.current?.seekAndPause(startTimeSec ?? 0);
    }, 500);
  }
  

  // --------------------------------------------------------
  // Map creation
  // --------------------------------------------------------
  useEffect(() => {
    if (!mapEl.current) return;

    const m = new mapboxgl.Map({
      container: mapEl.current,
      style: MAP_STYLES[mapStyle],
      center: [11.506, 48.718],
      zoom: 13,
    });

    m.on('load', () => {
      addCustomSourcesAndLayers(m);
      addDronePorts(m);
    // addPersonMarker(m);
      styleReadyRef.current = true;
      // expose map globally so PegmanControl can access it
  (window as any).mapboxMapRef = m;

      // --- Hover popup for historical fires ---
      m.on('mouseenter', 'fire-history', (e) => {
        m.getCanvas().style.cursor = 'pointer';
        const f = e.features?.[0];
        if (!f) return;
        const { detectedAt } = f.properties as { detectedAt: number };
        const [lng, lat] = (f.geometry as Point).coordinates;
        const timeStr = new Date(detectedAt).toLocaleTimeString();
        const popup = new mapboxgl.Popup({ closeButton: false })
          .setLngLat([lng, lat])
          .setHTML(
            `<strong>🔥 Fire</strong><br/>
                    Time: ${timeStr}<br/>
                    Lat: ${lat.toFixed(5)}<br/>
                    Lng: ${lng.toFixed(5)}`
          )
          .addTo(m);
        m.once('mouseleave', 'fire-history', () => popup.remove());
      });
      m.on('mouseenter', 'scanned-fill', (e) => {
        m.getCanvas().style.cursor = 'pointer';
        const f = e.features?.[0];
        if (!f) return;
        const { scannedAt, confidence } = f.properties as any;
        const timeStr = new Date(scannedAt).toLocaleTimeString();
        const popup = new mapboxgl.Popup({ closeButton: false })
          .setLngLat(e.lngLat)
          .setHTML(`
            <strong>Scanned Area</strong><br/>
            Time: ${timeStr}<br/>
            Confidence: ${(confidence * 100).toFixed(0)}%
          `)
          .addTo(m);
        m.once('mouseleave', 'scanned-fill', () => popup.remove());
      });
      
    });

    mapRef.current = m;
    return () => {
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
      m.remove();
    };
  }, []);

  // handle style change
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    styleReadyRef.current = false;

    // Wait until the new style finishes loading
    m.setStyle(MAP_STYLES[mapStyle]);

    const onStyleLoad = () => {
      addCustomSourcesAndLayers(m);
      addDronePorts(m);
      // ❌ DO NOT call addPersonMarker here again!
      styleReadyRef.current = true;
      redrawLayers();
    };

    m.once('style.load', onStyleLoad);

    return () => {
      m.off('style.load', onStyleLoad);
    };
  }, [mapStyle]);

  const addCustomSourcesAndLayers = (m: MapboxMap) => {
    const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
    const addSource = (id: string) => {
      if (!m.getSource(id)) m.addSource(id, { type: 'geojson', data: empty });
    };

    addSource('missionGeom');
    addSource('covered');
    addSource('remaining');
    addSource('sensorFov');
    addSource('scanOrbit');
    addSource('scanned');
    addSource('fire-center');
    addSource('fire-history');
    addSource('droneTrail');

    // mission layers
    if (!m.getLayer('mission-fill'))
      m.addLayer({
        id: 'mission-fill',
        type: 'fill',
        source: 'missionGeom',
        paint: { 'fill-color': '#0ea5e9', 'fill-opacity': 0.18 },
        filter: ['==', ['geometry-type'], 'Polygon'],
      });
      if (!m.getLayer('scanned-outline'))
        m.addLayer({
          id: 'scanned-outline',
          type: 'line',
          source: 'scanned',
          paint: { 'line-color': '#cc5600', 'line-width': 1.5, 'line-opacity': 0.9 },
        });
      
    if (!m.getLayer('mission-outline'))
      m.addLayer({
        id: 'mission-outline',
        type: 'line',
        source: 'missionGeom',
        paint: { 'line-color': '#0ea5e9', 'line-width': 2 },
      });
    if (!m.getLayer('drone-trail-line'))
      m.addLayer({
        id: 'drone-trail-line',
        type: 'line',
        source: 'droneTrail',
        paint: {
          'line-color': '#22d3ee', // cyan color
          'line-width': 3,
        },
      });

    // travel path & orbit
    if (!m.getLayer('path-covered'))
      m.addLayer({
        id: 'path-covered',
        type: 'line',
        source: 'covered',
        paint: { 'line-color': '#16a34a', 'line-width': 4 },
      });
    if (!m.getLayer('path-remaining'))
      m.addLayer({
        id: 'path-remaining',
        type: 'line',
        source: 'remaining',
        paint: { 'line-color': '#64748b', 'line-width': 3, 'line-dasharray': [2, 2] },
      });
    if (!m.getLayer('scan-orbit'))
      m.addLayer({
        id: 'scan-orbit',
        type: 'line',
        source: 'scanOrbit',
        paint: { 'line-color': '#16a34a', 'line-width': 2, 'line-dasharray': [4, 2] },
      });

    // live sensor FOV
    if (!m.getLayer('scanned-fill'))
      m.addLayer({
        id: 'scanned-fill',
        type: 'fill',
        source: 'scanned',
        paint: { 'fill-color': '#ff6b00', 'fill-opacity': 0.3 },
      });

    // live sensor FOV - draw above
    if (!m.getLayer('sensor-fov'))
      m.addLayer({
        id: 'sensor-fov',
        type: 'fill',
        source: 'sensorFov',
        paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.35 },
      });

    // current fire icon & glow
    if (!m.getLayer('fire-halo'))
      m.addLayer({
        id: 'fire-halo',
        type: 'circle',
        source: 'fire-center',
        paint: {
          'circle-radius': 18,
          'circle-color': 'rgba(255,80,0,0.25)',
          'circle-stroke-color': '#ff3b00',
          'circle-stroke-width': 2,
          'circle-blur': 0.4,
        },
      });
    if (!m.getLayer('fire-icon'))
      m.addLayer({
        id: 'fire-icon',
        type: 'symbol',
        source: 'fire-center',
        layout: { 'text-field': '🔥', 'text-size': 24, 'text-anchor': 'center' },
      });

    // historical fire points (small dots)
    if (!m.getLayer('fire-history'))
      m.addLayer({
        id: 'fire-history',
        type: 'circle',
        source: 'fire-history',
        paint: {
          'circle-radius': 7,
          'circle-color': '#ff3b00',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
          'circle-opacity': 0.8,
        },
      });
  };

  const redrawLayers = () => {
    const m = mapRef.current;
    if (!m) return;

    if (missionGeom) updateMissionSource(missionGeom.shape, missionGeom.line);

    // ✅ reapply scanned polygons
    (m.getSource('scanned') as GeoJSONSource | undefined)?.setData(scannedRef.current);

    (m.getSource('fire-center') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: fireRef.current ? [turf.point(fireRef.current)] : [],
    });

    (m.getSource('fire-history') as GeoJSONSource | undefined)?.setData(fireHistoryRef.current);
  };

  const addDronePorts = (m: MapboxMap) => {
    DRONE_PORTS.forEach((coord) => {
      const el = document.createElement('div');
      el.style.width = '30px';
      el.style.height = '30px';
      const img = document.createElement('img');
      img.src = DronePortIcon;
      img.style.width = '100%';
      img.style.height = '100%';
      el.appendChild(img);
      new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat(coord).addTo(m);
    });
  };

  // mission selection & gimbal target
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return () => {};
    const onClick = (e: MapMouseEvent) => {
      if (!styleReadyRef.current || missionActiveRef.current) return;
      const c: Coord = [e.lngLat.lng, e.lngLat.lat];

      if (e.originalEvent.shiftKey) {
        setGimbalTarget(c);
        return;
      }

      if (scanMode === 'CLICK') {
        const circle = turf.circle(c, DEFAULT_SCAN_RADIUS_M, {
          units: 'meters',
        }) as Feature<Polygon>;
        setMissionGeom({ center: c, shape: circle });
        setGimbalTarget(c);
        setStreetDraft([]);
        updateMissionSource(circle);
        return;
      }

      if (scanMode === 'STREET') {
        setStreetDraft((prev) => {
          const next = [...prev, c].slice(-2);
          if (next.length === 1) {
            const dot = turf.circle(c, 8, { units: 'meters' }) as Feature<Polygon>;
            setMissionGeom({ center: c });
            setGimbalTarget(c);
            updateMissionSource(dot);
          }
          if (next.length === 2) {
            const line = turf.lineString(next) as Feature<LineString>;
            const buf = turf.buffer(line, STREET_BUFFER_M, { units: 'meters' }) as Feature<Polygon>;
            const center = turf.center(line).geometry.coordinates as Coord;
            setMissionGeom({ center, shape: buf, line });
            setGimbalTarget(center);
            updateMissionSource(buf, line);
          }
          return next;
        });
      }
    };
    m.on('click', onClick);
    return () => m.off('click', onClick);
  }, [scanMode]);

  const updateMissionSource = (polygon?: Feature<Polygon>, line?: Feature<LineString>) => {
    const m = mapRef.current;
    if (!m || !styleReadyRef.current) return;
    const feats: any[] = [];
    if (polygon) feats.push(polygon);
    if (line) feats.push(line);
    (m.getSource('missionGeom') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: feats,
    });
  };

  const nearestPort = (pt: Coord): Coord =>
    DRONE_PORTS.reduce(
      (best, p) => (turf.distance(best, pt) < turf.distance(p, pt) ? best : p),
      DRONE_PORTS[0]
    );
    function recordScanAt(m: MapboxMap, position: Coord, heading: number) {
      const fov = makeFovRect(position, heading);
      const timestamp = Date.now();
      const videoTime = videoRef.current?.getCurrentTime?.() ?? 0;
    
      fov.properties = {
        id: `scan-${timestamp}`,
        scannedAt: timestamp,
        videoUrl: DroneEnrouteVideo,
        startTimeSec: videoTime,
        confidence: +(0.8 + Math.random() * 0.2).toFixed(2),
      };
    
      (m.getSource("sensorFov") as GeoJSONSource)?.setData(fov);
    
      // ✅ Append (don’t overwrite)
      scannedRef.current.features.push(fov as Feature<Polygon>);
      (m.getSource("scanned") as GeoJSONSource)?.setData(scannedRef.current);
    }
    

  const startMission = () => {
    if (!missionGeom) return;
    const m = mapRef.current;
    if (!m || !styleReadyRef.current) return;

    const origin = nearestPort(missionGeom.center);
    const center = missionGeom.center;
    const orbit = turf.circle(center, ORBIT_RADIUS_M, { units: 'meters' });
    (m.getSource('scanOrbit') as GeoJSONSource | undefined)?.setData(orbit);

    const el = document.createElement('div');
    el.style.width = '34px';
    el.style.height = '34px';
    const img = document.createElement('img');
    img.src = DroneIcon;
    img.style.width = '100%';
    img.style.height = '100%';
    el.appendChild(img);
    droneMarkerRef.current?.remove();
    droneMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat(origin)
      .addTo(m);

    const popup = new mapboxgl.Popup({ closeButton: false, offset: 25 }).setHTML('');
    popup.addTo(m);
    dronePopupRef.current = popup;
    droneMarkerRef.current.setPopup(popup);

    setMissionActive(true);
    if (personMarkerRef.current) {
      personMarkerRef.current.addTo(m);
      showHint("🧍 You can drag the orange person onto any scanned area to view what the drone sees.");
    }
    scannedRef.current = { type: 'FeatureCollection', features: [] };

    const toTarget = turf.lineString([origin, center]) as Feature<LineString>;
    const distKm = turf.length(toTarget, { units: 'kilometers' });
    const durationMs = ((distKm * 1000) / DRONE_SPEED_MPS) * 1000;

    let startTs: number | null = null;
    const animate = (now: number) => {
      if (!droneMarkerRef.current) return;
      if (startTs === null) startTs = now;
      const t = Math.min((now - startTs) / durationMs, 1);
      const curPt = turf.along(toTarget, distKm * t, { units: 'kilometers' }) as Feature<Point>;
      const curCoord = curPt.geometry.coordinates as Coord;
      droneMarkerRef.current.setLngLat(curCoord);
      const heading = turf.bearing(curCoord, center);
     // ✅ continuously record sensor footprints every few hundred ms
const nowMs = performance.now();
if (nowMs - lastScanTsRef.current > SCAN_INTERVAL_MS) {
  lastScanTsRef.current = nowMs;
  recordScanAt(m, curCoord, heading);
}


      const remainingKm = distKm * (1 - t);
      setDistKmLeft(remainingKm);
      setEtaSec((remainingKm * 1000) / DRONE_SPEED_MPS);
      dronePopupRef.current?.setHTML(
        `ETA: ${Math.ceil(
          (remainingKm * 1000) / DRONE_SPEED_MPS
        )} s<br/>Dist: ${remainingKm.toFixed(2)} km`
      );

      if (styleReadyRef.current) {
        const covered = turf.lineSlice(turf.point(origin), curPt, toTarget);
        const remaining = turf.lineSlice(curPt, turf.point(center), toTarget);
        (m.getSource('covered') as GeoJSONSource | undefined)?.setData(covered);
        (m.getSource('remaining') as GeoJSONSource | undefined)?.setData(remaining);
      }

      if (t < 1) animationFrame.current = requestAnimationFrame(animate);
      else {
        showArrivalToast();
        startOrbit(center);
        showHint("You can now drag the orange person onto scanned areas to view what the drone saw.");

      }
    };
    if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    animationFrame.current = requestAnimationFrame(animate);
  };

  function makeFovRect(center: Coord, heading: number): Feature<Polygon> {
    const halfW = SENSOR_WIDTH / 2;
    const backLeft = turf.destination(center, halfW, heading - 90, { units: 'meters' }).geometry
      .coordinates as Coord;
    const backRight = turf.destination(center, halfW, heading + 90, { units: 'meters' }).geometry
      .coordinates as Coord;
    const frontLeft = turf.destination(backLeft, SENSOR_DEPTH, heading, { units: 'meters' })
      .geometry.coordinates as Coord;
    const frontRight = turf.destination(backRight, SENSOR_DEPTH, heading, { units: 'meters' })
      .geometry.coordinates as Coord;
    return turf.polygon([[backLeft, frontLeft, frontRight, backRight, backLeft]], {
      scannedAt: Date.now(),
    });
  }

  const startOrbit = (center: Coord) => {
    const ring = turf.circle(center, ORBIT_RADIUS_M, { units: 'meters', steps: 180 }).geometry
      .coordinates[0] as Coord[];

    let i = 0;
    const m = mapRef.current!;
   //   addPersonMarker(m); //  Pegman appears now, only when scanning starts
    const trailCoords: Coord[] = [];

    const loop = () => {
      if (!missionActiveRef.current) return;

      const cur = ring[i];
      trailCoords.push(cur);
      if (trailCoords.length > 200) trailCoords.shift(); // optional short tail

      // ✅ Only draw if we have at least 2 points
      if (trailCoords.length >= 2) {
        const pathLine = turf.lineString(trailCoords);
        (m.getSource('droneTrail') as GeoJSONSource)?.setData(pathLine);
      }
      const heading = turf.bearing(cur, gimbalTarget || center);
      const nowMs = performance.now();
      if (nowMs - lastScanTsRef.current > SCAN_INTERVAL_MS) {
        lastScanTsRef.current = nowMs;
        recordScanAt(m, cur, heading);
      }
      
      droneMarkerRef.current?.setLngLat(cur);

      i = (i + 1) % ring.length;
      animationFrame.current = requestAnimationFrame(loop);
    };

    if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    animationFrame.current = requestAnimationFrame(loop);
  };

  const endMission = () => {
    setMissionActive(false);
    setEtaSec(null);
    setDistKmLeft(null);
    if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    droneMarkerRef.current?.remove();
    dronePopupRef.current?.remove();
    (mapRef.current?.getSource('sensorFov') as GeoJSONSource)?.setData({
      type: 'FeatureCollection',
      features: [],
    });
  };

  const showArrivalToast = () => {
    setArrivalToast('Drone has arrived and started scanning');
    setTimeout(() => setArrivalToast(null), 3500);
  };

  const handleSelectNotification = (ev: DetectionEvent) => {
    console.log('Selected notification:', ev);
    // navigate, open drawer, mark read, etc.
  };
  const btnStyle = (on: boolean): React.CSSProperties => ({
    width: 44,
    height: 44,
    borderRadius: '50%',
    background: on ? '#111827' : '#fff',
    color: on ? '#fff' : '#111',
    border: '1px solid #e5e7eb',
    cursor: 'pointer',
    fontSize: 20,
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
  });

  return (
    <>
      <Header notifications={[]} onSelectNotification={() => {}} />
  
      {/* 🗺️ Map container */}
      <div style={{ position: "relative", height: "calc(100vh - 60px)" }}>
        <div ref={mapEl} style={{ position: "absolute", inset: 0 }} />
  
        {/* 🧭 Basemap toggle */}
        <LayersControl current={mapStyle} onChange={setMapStyle} />
  
        {/* 🎛️ Scan mode buttons + Pegman */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            right: 20,
            transform: "translateY(-50%)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            alignItems: "center",
            zIndex: 3000,
          }}
        >
          {/* 📍 Area scan button */}
          <button
            style={btnStyle(scanMode === "CLICK")}
            onClick={() => {
              setScanMode("CLICK");
              setStreetDraft([]);
            }}
            title="Area scan"
          >
            📍
          </button>
  
          {/* 📏 Street scan button */}
          <button
            style={btnStyle(scanMode === "STREET")}
            onClick={() => {
              setScanMode("STREET");
              setStreetDraft([]);
              setMissionGeom((g) => (g ? { center: g.center } : null));
            }}
            title="Street segment"
          >
            📏
          </button>
  
          {/* 🧍 Pegman control */}
          <div
  style={{
    ...btnStyle(false),
    width: 52,
    height: 52,
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    transition: "background 0.2s, transform 0.2s",
    overflow: "visible", // ✅ allow Pegman to move freely
  }}
  title="Drag me onto a scanned area to view what the drone saw"
>
  <div
    style={{
      position: "relative",
      width: 28,
      height: 40,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 10,
    }}
  >
    <PegmanControl onDropOnMap={handlePegmanDrop} />
  </div>
</div>


        </div>
  
        {/* 🚀 Start / Stop Mission buttons */}
        {!missionActive && (
          <button
            onClick={startMission}
            disabled={!missionGeom?.center}
            style={{
              position: "absolute",
              bottom: 24,
              left: 20,
              padding: "10px 16px",
              borderRadius: 8,
              background: missionGeom?.center ? "#16a34a" : "#9ca3af",
              color: "#fff",
              fontWeight: 700,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              cursor: missionGeom?.center ? "pointer" : "not-allowed",
            }}
          >
            🚀 Start Mission
          </button>
        )}
  
        {missionActive && (
          <button
            onClick={endMission}
            style={{
              position: "absolute",
              bottom: 24,
              left: 20,
              padding: "10px 16px",
              borderRadius: 8,
              background: "#111827",
              color: "#fff",
              fontWeight: 700,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            }}
          >
            ⏹ End Mission
          </button>
        )}
  
        {/* 🎥 Video viewer */}
        {viewerActive && (
          <VideoReview
            ref={videoRef}
            src={DroneEnrouteVideo}
            showControls
            expanded={videoExpanded}
            onToggle={() => {
              if (videoExpanded) setViewerActive(false);
              else setVideoExpanded(true);
            }}
            style={{
              zIndex: 9999,
              position: "fixed",
              top: 0,
              left: 0,
            }}
          />
        )}
  
        {/* 🔥 Toasts + hints */}
        {arrivalToast && (
          <div
            style={{
              position: "absolute",
              top: 20,
              left: "50%",
              transform: "translateX(-50%)",
              background: "#111827",
              color: "#fff",
              padding: "10px 16px",
              borderRadius: 12,
              boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
              fontWeight: 700,
            }}
          >
            {arrivalToast}
          </div>
        )}
  
        {hint && (
          <div
            style={{
              position: "absolute",
              bottom: 80,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(0,0,0,0.85)",
              color: "#fff",
              padding: "10px 18px",
              borderRadius: 10,
              fontSize: 14,
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
              textAlign: "center",
            }}
          >
            {hint}
          </div>
        )}
      </div>
    </>
  );
  
}

/* Floating basemap toggle */
function LayersControl({
  current,
  onChange,
}: {
  current: keyof typeof MAP_STYLES;
  onChange: (s: keyof typeof MAP_STYLES) => void;
}) {
  const [open, setOpen] = useState(false);
  const styleId = (key: keyof typeof MAP_STYLES) => MAP_STYLES[key].replace('mapbox://styles/', '');
  const thumb = (key: keyof typeof MAP_STYLES) =>
    `https://api.mapbox.com/styles/v1/${styleId(
      key
    )}/static/11.506,48.718,12/100x100?access_token=${mapboxgl.accessToken}`;
  const options = (Object.keys(MAP_STYLES) as (keyof typeof MAP_STYLES)[]).filter(
    (k) => k !== current
  );

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        width: 100,
        overflow: 'hidden',
        cursor: 'pointer',
        userSelect: 'none',
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      aria-label="Map layers selector"
    >
      <div style={{ padding: 6, fontWeight: 700, textAlign: 'center' }}>Layers</div>
      <img
        src={thumb(current)}
        alt={`${current} preview`}
        width={100}
        height={100}
        style={{ display: 'block' }}
      />
      {open &&
        options.map((name) => (
          <div
            key={name}
            onClick={() => onChange(name)}
            style={{ borderTop: '1px solid #eee', background: '#fafafa' }}
          >
            <img
              src={thumb(name)}
              alt={`${name} preview`}
              width={100}
              height={100}
              style={{ display: 'block' }}
            />
            <div style={{ textAlign: 'center', padding: 6, fontWeight: 600 }}>{name}</div>
          </div>
        ))}
        
    </div>
  );
}
