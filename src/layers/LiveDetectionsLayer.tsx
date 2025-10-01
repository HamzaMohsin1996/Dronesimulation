import React, { useEffect } from 'react';
import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { useMap } from '../contexts/MapContext';
import { Coord, Detection } from '../shared/drone';

type Props = { coord?: Coord; detections: Detection[] };

export default function LiveDetectionsLayer({ coord, detections }: Props) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    if (!map.getSource('live-detection-point')) {
      map.addSource('live-detection-point', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] } as FeatureCollection,
      });
      map.addLayer({
        id: 'live-detection-circle',
        type: 'circle',
        source: 'live-detection-point',
        paint: {
          'circle-radius': 8,
          'circle-color': '#ff9500',
          'circle-stroke-color': '#000',
          'circle-stroke-width': 1,
        },
      });

      map.addSource('live-detection-buffer', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] } as FeatureCollection,
      });
      map.addLayer({
        id: 'live-detection-buffer-fill',
        type: 'fill',
        source: 'live-detection-buffer',
        paint: { 'fill-color': '#ff3b30', 'fill-opacity': 0.18 },
      });
      map.addLayer({
        id: 'live-detection-buffer-outline',
        type: 'line',
        source: 'live-detection-buffer',
        paint: { 'line-color': '#ff3b30', 'line-width': 2, 'line-dasharray': [2, 2] },
      });
    }

    if (!coord) return;

    const pointFeature: Feature<Point> = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coord },
      properties: {},
    };
    (map.getSource('live-detection-point') as maplibregl.GeoJSONSource).setData(
      pointFeature as any
    );

    const radius = detections.some((d) => d.label === 'fire') ? 80 : 40;
    const buffered = turf.buffer(pointFeature, radius, { units: 'meters' });
    (map.getSource('live-detection-buffer') as maplibregl.GeoJSONSource).setData(buffered as any);
  }, [map, coord, detections]);

  return null;
}
