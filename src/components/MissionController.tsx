import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import { useMap } from '../contexts/MapContext';
import { Coord, DronePort, Hazard, Obstacle, isCoord } from '../shared/drone';

type Props = {
  dronePorts: DronePort[];
  setDronePorts: React.Dispatch<React.SetStateAction<DronePort[]>>;
  hazards: Hazard[];
  obstacles: Obstacle[];
  pushAlert: (msg: string) => void;
  appendLog: (lines: string[]) => void;
  onMarkerRef?: (m: maplibregl.Marker | null) => void;
  onMissionStart?: (dest: Coord) => void;
  onMissionComplete?: () => void;
};

export default function MissionController({
  dronePorts,
  setDronePorts,
  hazards,
  obstacles,
  pushAlert,
  appendLog,
  onMarkerRef,
  onMissionStart,
  onMissionComplete,
}: Props) {
  const map = useMap();
  const droneMarkerRef = useRef<maplibregl.Marker | null>(null);

  // create line sources/layers when style is ready
  useEffect(() => {
    const m = map;
    if (!m) return;

    const ensureLine = (id: string, color: string, width: number, dash?: number[]) => {
      if (m.getSource(id)) return;
      m.addSource(id, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [] },
          properties: {},
        },
      } as any);
      m.addLayer({
        id,
        type: 'line',
        source: id,
        paint: {
          'line-color': color,
          'line-width': width,
          ...(dash ? { 'line-dasharray': dash } : {}),
        },
      });
    };

    const init = () => {
      ensureLine('covered-path', '#00FF00', 4);
      ensureLine('remaining-path', '#888', 2, [2, 2]);
      ensureLine('blocked-path', '#FF0000', 3);
    };

    if (m.isStyleLoaded()) {
      init();
      return; // no cleanup needed
    }

    m.once('load', init);
    return () => {
      m.off('load', init);
    }; // ✅ return void, not Map
  }, [map]);

  useEffect(() => {
    onMarkerRef?.(droneMarkerRef.current);
  }, [onMarkerRef]);

  // click-to-go handler
  useEffect(() => {
    const m = map;
    if (!m) return;

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat || {};
      if (![lng, lat].every(Number.isFinite)) return pushAlert('❌ Could not read click location.');
      const dest: Coord = [lng, lat];

      const available = dronePorts.filter((d) => d.status === 'idle');
      if (!available.length) return pushAlert('🚫 No available drones. Wait.');

      const nearest = available.reduce((prev, cur) => {
        const dp = turf.distance(turf.point(cur.coord), turf.point(dest), { units: 'kilometers' });
        const pd = turf.distance(turf.point(prev.coord), turf.point(dest), { units: 'kilometers' });
        return dp < pd ? cur : prev;
      });

      pushAlert(`🚁 Launching ${nearest.id}...`);
      onMissionStart?.(dest);
      appendLog([
        `${new Date().toLocaleTimeString()} – Mission launched to ${lat.toFixed(5)}, ${lng.toFixed(
          5
        )}`,
      ]);
      startMission(nearest, dest);
    };

    m.on('click', handleClick);
    return () => {
      m.off('click', handleClick);
    }; // ✅ return void
  }, [map, dronePorts, hazards, obstacles]);

  const startMission = (port: DronePort, dest: Coord) => {
    const m = map;
    if (!m) return;
    if (!isCoord(port.coord) || !isCoord(dest)) return pushAlert('❌ Invalid coordinates.');

    const path: Coord[] = [port.coord, dest];
    const fullLine = turf.lineString(path);
    const totalDist = turf.length(fullLine, { units: 'kilometers' });

    setDronePorts((prev) =>
      prev.map((d) => (d.id === port.id ? { ...d, status: 'in-flight' } : d))
    );

    // minimal marker (emoji)
    droneMarkerRef.current?.remove();
    const el = document.createElement('div');
    el.style.fontSize = '22px';
    el.textContent = '🚁';
    const marker = new maplibregl.Marker({ element: el }).setLngLat(path[0]).addTo(m);
    droneMarkerRef.current = marker;

    let startTs: number | null = null;
    const duration = 15000;

    const animate = (now: number) => {
      if (startTs === null) startTs = now;
      const elapsed = Math.max(0, now - startTs);
      const prog = Math.min(elapsed / duration, 1);
      const dist = totalDist * prog;

      try {
        const pt = turf.along(fullLine, dist, { units: 'kilometers' }).geometry
          .coordinates as Coord;
        marker.setLngLat(pt);

        // hazards → mark remaining as blocked if within 50m
        let inHazard = false;
        hazards.forEach((h) => {
          const d = turf.distance(turf.point(pt), turf.point(h.coord), { units: 'kilometers' });
          if (Number.isFinite(d) && d < 0.05) inHazard = true;
        });
        if (inHazard) {
          const ahead = turf.lineSlice(turf.point(pt), turf.point(path[1]), fullLine);
          (m.getSource('blocked-path') as maplibregl.GeoJSONSource | undefined)?.setData({
            type: 'Feature',
            geometry: ahead.geometry,
            properties: {},
          } as any);
        }

        // covered & remaining
        const covered = turf.lineSlice(turf.point(path[0]), turf.point(pt), fullLine);
        (m.getSource('covered-path') as maplibregl.GeoJSONSource | undefined)?.setData({
          type: 'Feature',
          geometry: covered.geometry,
          properties: {},
        } as any);

        (m.getSource('remaining-path') as maplibregl.GeoJSONSource | undefined)?.setData({
          type: 'Feature',
          geometry: fullLine.geometry,
          properties: {},
        } as any);

        if (prog < 1) requestAnimationFrame(animate);
        else {
          pushAlert('✅ Mission complete.');
          setDronePorts((prev) =>
            prev.map((d) => (d.id === port.id ? { ...d, status: 'idle' } : d))
          );
          onMissionComplete?.();
          appendLog([`${new Date().toLocaleTimeString()} – Mission complete`]);
        }
      } catch (e) {
        pushAlert('❌ Error during flight. Check console.');
        console.error('Flight error', e);
      }
    };

    if (m.isStyleLoaded()) {
      requestAnimationFrame(animate);
    } else {
      const kick = () => requestAnimationFrame(animate);
      m.once('load', kick);
      // cleanup if effect unmounts before load fires
      // (this is inside a function, not an effect; no return needed)
      // m.off('load', kick) would be handled by component unmount anyway
    }
  };

  return null;
}
