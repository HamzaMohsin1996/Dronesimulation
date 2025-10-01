import React, { useEffect } from 'react';
import * as turf from '@turf/turf';
import type { FeatureCollection, Point } from 'geojson';
import { useMap } from '../contexts/MapContext';
import { Hazard } from '../shared/drone';

type Props = { hazards: Hazard[]; visible?: boolean };

export default function HazardBuffersLayer({ hazards, visible = false }: Props) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const srcPoints = 'dynamic-hazards-points';
    const layerCircles = 'dynamic-hazards-circles';
    const srcBuffers = 'dynamic-hazards-buffers';
    const layerBufferFill = 'dynamic-hazards-buffer-fill';
    const layerBufferOutline = 'dynamic-hazards-buffer-outline';

    // create sources/layers once
    if (!map.getSource(srcPoints)) {
      map.addSource(srcPoints, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] } as FeatureCollection,
      });
      map.addLayer({
        id: layerCircles,
        type: 'circle',
        source: srcPoints,
        paint: {
          'circle-radius': 6,
          'circle-color': '#ff9500',
          'circle-stroke-color': '#000',
          'circle-stroke-width': 1,
        },
      });
    }

    if (!map.getSource(srcBuffers)) {
      map.addSource(srcBuffers, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] } as FeatureCollection,
      });
      map.addLayer({
        id: layerBufferFill,
        type: 'fill',
        source: srcBuffers,
        paint: { 'fill-color': '#ffcc00', 'fill-opacity': 0.15 },
      });
      map.addLayer({
        id: layerBufferOutline,
        type: 'line',
        source: srcBuffers,
        paint: { 'line-color': '#ffcc00', 'line-width': 2, 'line-dasharray': [1, 2] },
      });
    }

    // hide/show layers
    const vis = visible ? 'visible' : 'none';
    map.setLayoutProperty(layerCircles, 'visibility', vis);
    map.setLayoutProperty(layerBufferFill, 'visibility', vis);
    map.setLayoutProperty(layerBufferOutline, 'visibility', vis);

    if (!visible || hazards.length === 0) {
      // clear data when hidden
      (map.getSource(srcPoints) as any)?.setData({ type: 'FeatureCollection', features: [] });
      (map.getSource(srcBuffers) as any)?.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    // build features
    const fc: FeatureCollection<Point> = {
      type: 'FeatureCollection',
      features: hazards.map((h) => ({
        type: 'Feature',
        properties: { type: h.type, info: h.info },
        geometry: { type: 'Point', coordinates: h.coord },
      })),
    };
    const buffered = turf.buffer(fc, 50, { units: 'meters' });

    (map.getSource(srcPoints) as any).setData(fc as any);
    (map.getSource(srcBuffers) as any).setData(buffered as any);
  }, [map, hazards, visible]);

  return null;
}
