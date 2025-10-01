import React, { useEffect } from 'react';
import { useMap } from '../contexts/MapContext';
import type { DetectionEvent } from '../shared/drone';
import maplibregl from 'maplibre-gl';

type Props = {
  events: DetectionEvent[];
  startMs: number;
  endMs: number;
  visible?: boolean;
};

export default function RecordedEventsLayer({ events, startMs, endMs, visible = true }: Props) {
  const map = useMap();

  useEffect(() => {
    const m = map;
    if (!m) return;

    const srcId = 'recorded-events';
    const clusters = 'recorded-events-clusters';
    const count = 'recorded-events-count';
    const points = 'recorded-events-points';

    const init = () => {
      if (!m.getSource(srcId)) {
        m.addSource(srcId, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          cluster: true,
          clusterRadius: 50,
          clusterMaxZoom: 14,
        } as any);

        if (!m.getLayer(clusters)) {
          m.addLayer({
            id: clusters,
            type: 'circle',
            source: srcId,
            filter: ['has', 'point_count'],
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 5, 12, 100, 28],
              'circle-color': '#444',
              'circle-opacity': 0.25,
              'circle-stroke-color': '#000',
              'circle-stroke-width': 1,
            },
          });
        }
        if (!m.getLayer(count)) {
          m.addLayer({
            id: count,
            type: 'symbol',
            source: srcId,
            filter: ['has', 'point_count'],
            layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 12 },
            paint: { 'text-color': '#111' },
          });
        }
        if (!m.getLayer(points)) {
          m.addLayer({
            id: points,
            type: 'circle',
            source: srcId,
            filter: ['!', ['has', 'point_count']],
            paint: {
              'circle-radius': 6,
              'circle-color': [
                'match',
                ['get', 'label'],
                'fire',
                '#ff3b30',
                'people',
                '#0a84ff',
                'chemical',
                '#ffd60a',
                '#888',
              ],
              'circle-stroke-color': '#000',
              'circle-stroke-width': 1,
            },
          });
        }
      }

      const vis = visible ? 'visible' : 'none';
      if (m.getLayer(clusters)) m.setLayoutProperty(clusters, 'visibility', vis);
      if (m.getLayer(count)) m.setLayoutProperty(count, 'visibility', vis);
      if (m.getLayer(points)) m.setLayoutProperty(points, 'visibility', vis);

      const fc = {
        type: 'FeatureCollection',
        features: events
          .filter((e) => e.ts >= startMs && e.ts <= endMs)
          .map((e) => ({
            type: 'Feature',
            properties: { label: e.label, ts: e.ts, score: e.score },
            geometry: { type: 'Point', coordinates: e.coord },
          })),
      };

      (m.getSource(srcId) as maplibregl.GeoJSONSource | undefined)?.setData(fc as any);
    };

    if (m.isStyleLoaded()) {
      init();
      return; // no cleanup
    }

    m.once('load', init);
    return () => {
      m.off('load', init);
    }; // ✅ return void, not Map
  }, [map, events, startMs, endMs, visible]);

  return null;
}
