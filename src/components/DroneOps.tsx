import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';

import MapContainer from './MapContainer';
import MissionController from './MissionController';
import StatusPanel from './StatusPanel';
import DroneLiveFeed from './DroneLiveFeed';
import RecordedEventsLayer from '../layers/RecordedEventsLayer';
import Timeline from './Timeline';
import { useMap } from '../contexts/MapContext';

import {
  Coord,
  Detection,
  DronePort,
  Hazard,
  Obstacle,
  DetectionEvent,
  isImportant,
} from '../shared/drone';

const USE_MOCK_WS = true;
// working stream to avoid console spam
const HLS_SRC = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

const initialDronePorts: DronePort[] = [
  { coord: [11.505, 48.719], id: 'drone-port-1', status: 'idle' },
  { coord: [11.502, 48.716], id: 'drone-port-2', status: 'idle' },
];

const proximityHazards: Hazard[] = [
  { coord: [11.504, 48.715], type: 'fire', info: '🔥 Fire nearby' },
  { coord: [11.5055, 48.7165], type: 'chemical', info: '🧪 Chemical spill' },
  { coord: [11.507, 48.717], type: 'people', info: '👥 Crowd detected' },
];

const obstacles: Obstacle[] = [
  { coord: [11.5065, 48.716], type: 'congestion', info: '🚦 Congestion' },
  { coord: [11.508, 48.718], type: 'closed', info: '⛔ Road closed' },
];

// pad the map bottom in review mode so controls aren't obscured
function MapPadding({ bottom }: { bottom: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    map.easeTo({ padding: { top: 0, left: 0, right: 0, bottom }, duration: 350 });
  }, [map, bottom]);
  return null;
}

export default function DroneOps() {
  const [message, setMessage] = useState<string | null>(null);
  const [hazardLog, setHazardLog] = useState<string[]>([]);
  const [dronePorts, setDronePorts] = useState<DronePort[]>(initialDronePorts);

  const [latestDetections, setLatestDetections] = useState<Detection[]>([]);
  const [latestDetGeo, setLatestDetGeo] = useState<Coord | undefined>(undefined);

  const [recording, setRecording] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [timeWindow, setTimeWindow] = useState<[number, number]>([
    Date.now() - 10 * 60_000,
    Date.now(),
  ]);
  const [unread, setUnread] = useState(0);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const droneMarkerRef = useRef<maplibregl.Marker | null>(null);

  const pushAlert = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  };
  const appendLog = (lines: string[]) => setHazardLog((prev) => [...prev, ...lines]);

  const handleMissionStart = (_dest: Coord) => {
    setRecording(true);
    setReviewMode(false);
    setEvents([]);
    setUnread(0);
    const now = Date.now();
    setTimeWindow([now - 5 * 60_000, now + 20 * 60_000]);
  };
  const handleMissionComplete = () => {
    setRecording(false);
    setReviewMode(true);
    if (events.length) {
      const min = Math.min(...events.map((e) => e.ts));
      const max = Math.max(...events.map((e) => e.ts));
      setTimeWindow([min - 10_000, max + 10_000]);
    }
  };

  // mock detections + silent recording
  useEffect(() => {
    if (!USE_MOCK_WS) return;
    const center: Coord = [11.506, 48.718];
    const id = setInterval(() => {
      const dets: Detection[] = [
        { id: 'd1', label: 'people', score: 0.92, bbox: [220, 120, 80, 170] },
        { id: 'd2', label: 'fire', score: 0.87, bbox: [480, 260, 120, 140] },
      ];
      setLatestDetections(dets);
      const geo: Coord = [
        center[0] + (Math.random() - 0.5) * 0.001,
        center[1] + (Math.random() - 0.5) * 0.001,
      ];
      setLatestDetGeo(geo);

      if (recording) {
        const ts = Date.now();
        const important = dets.filter((d) => isImportant(d.label, d.score));
        important.forEach((d) => {
          setEvents((prev) => [
            ...prev,
            {
              id: `${ts}-${d.id}`,
              ts,
              label: d.label,
              score: d.score,
              coord: geo,
              seen: reviewMode,
            },
          ]);
        });
        if (!reviewMode) setUnread((u) => u + important.length);
      }
    }, 1500);
    return () => clearInterval(id);
  }, [recording, reviewMode]);

  useEffect(() => {
    if (reviewMode) {
      setUnread(0);
      setEvents((prev) => prev.map((e) => ({ ...e, seen: true })));
    }
  }, [reviewMode]);

  // ✅ logs OUTSIDE JSX (prevents TS2746)
  console.log('[DroneOps] render');
  console.log('[DroneOps] timeline props', {
    startMs: timeWindow[0],
    endMs: timeWindow[1],
    eventsCount: events.length,
    reviewMode,
  });

  return (
    <div style={{ position: 'relative', height: '100vh', width: '100vw' }}>
      {message && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            background: '#fff3cd',
            color: '#856404',
            padding: 10,
            textAlign: 'center',
            zIndex: 1000,
            fontWeight: 'bold',
          }}
        >
          {message}
        </div>
      )}

      {/* LIVE video */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: 2000,
          width: isFullscreen ? '100%' : 360,
          height: isFullscreen ? '100%' : 420,
          backgroundColor: '#000',
          borderRadius: 8,
          overflow: 'hidden',
          border: '2px solid white',
          transition: 'all 0.3s ease',
        }}
      >
        <DroneLiveFeed
          src={HLS_SRC}
          detections={latestDetections}
          onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
          isFullscreen={isFullscreen}
        />
      </div>

      {/* Map + recorded layer + mission controller */}
      <MapContainer>
        <MapPadding bottom={reviewMode ? 140 : 0} />

        <RecordedEventsLayer
          events={events}
          startMs={timeWindow[0]}
          endMs={timeWindow[1]}
          visible={reviewMode}
        />

        <MissionController
          dronePorts={dronePorts}
          setDronePorts={setDronePorts}
          hazards={proximityHazards}
          obstacles={obstacles}
          pushAlert={pushAlert}
          appendLog={appendLog}
          onMissionStart={handleMissionStart}
          onMissionComplete={handleMissionComplete}
          onMarkerRef={(m: maplibregl.Marker | null) => (droneMarkerRef.current = m)}
        />
      </MapContainer>

      {/* Fixed bottom timeline */}
      <Timeline
        startMs={timeWindow[0]}
        endMs={timeWindow[1]}
        events={events}
        reviewMode={reviewMode}
        unread={unread}
        onToggleReview={() => setReviewMode((v) => !v)}
        onChangeWindow={(from, to) => setTimeWindow([from, to])}
      />

      {/* debug probe — if you don't see this magenta bar, something else is covering fixed elements */}
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          height: 6,
          background: 'magenta',
          zIndex: 9000,
          opacity: 0.5,
        }}
      />

      {/* Status panel */}
      <StatusPanel
        ports={dronePorts}
        logs={[
          ...hazardLog,
          ...events
            .filter((e) => e.ts >= timeWindow[0] && e.ts <= timeWindow[1])
            .slice(-5)
            .map(
              (e) =>
                `${new Date(
                  e.ts
                ).toLocaleTimeString()} – ${e.label.toUpperCase()} at ${e.coord[1].toFixed(
                  5
                )}, ${e.coord[0].toFixed(5)}`
            ),
        ]}
        topOffset={isFullscreen ? 20 : 50}
      />
    </div>
  );
}
