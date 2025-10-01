import { useEffect } from 'react';
import maplibregl, { Map, Point } from 'maplibre-gl';
import type { DetectionEvent } from '../shared/DetectionEvent';

type Props = {
  map: Map | null;
  events: DetectionEvent[];
};

export default function PinnedEventsLayer({ map, events }: Props) {
  // 1. Init source + layer once
  useEffect(() => {
    if (!map) return;

    if (!map.getSource('annotationsPins')) {
      map.addSource('annotationsPins', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'event-pins',
        type: 'symbol',
        source: 'annotationsPins',
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
      });
    }
  }, [map]);

  // 2. Update data whenever events change
  useEffect(() => {
    if (!map) return;
    const src = map.getSource('annotationsPins') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    const features = events.map((ev) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: ev.coord },
      properties: {
        id: ev.id,
        label: ev.label,
        ts: ev.ts,
        thumbnail: ev.thumbnail ?? null,
      },
    }));

    src.setData({ type: 'FeatureCollection', features });
  }, [map, events]);

  // 3. Hover popup
  useEffect(() => {
    if (!map) return;

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    const onEnter = (e: any) => {
      const feat = e.features?.[0];
      if (!feat) return;
      const { label, ts, thumbnail } = feat.properties;
      const coords = (feat.geometry as Point).coordinates as [number, number];

      popup
        .setLngLat(coords)
        .setHTML(
          `
          <strong>${label.toUpperCase()}</strong><br/>
          ${new Date(ts).toLocaleTimeString()}<br/>
          ${
            thumbnail
              ? `<img src="${thumbnail}" width="120" style="margin-top:6px;border-radius:6px"/>`
              : ''
          }
        `
        )
        .addTo(map);
    };

    const onLeave = () => popup.remove();

    map.on('mouseenter', 'event-pins', onEnter);
    map.on('mouseleave', 'event-pins', onLeave);

    return () => {
      map.off('mouseenter', 'event-pins', onEnter);
      map.off('mouseleave', 'event-pins', onLeave);
      popup.remove();
    };
  }, [map]);

  // 4. Click → full preview overlay
  useEffect(() => {
    if (!map) return;

    const onClick = (e: any) => {
      const feat = e.features?.[0];
      if (!feat) return;
      const { label, ts, thumbnail } = feat.properties;

      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.9);display:flex;flex-direction:column;
        align-items:center;justify-content:center;z-index:9999;color:white;
      `;

      const close = document.createElement('div');
      close.textContent = '✕';
      close.style.cssText = 'position:absolute;top:20px;right:30px;cursor:pointer;font-size:28px;';
      close.onclick = () => document.body.removeChild(overlay);
      overlay.appendChild(close);

      const title = document.createElement('h2');
      title.textContent = label.toUpperCase();
      overlay.appendChild(title);

      const time = document.createElement('div');
      time.textContent = new Date(ts).toLocaleString();
      overlay.appendChild(time);

      if (thumbnail) {
        const img = document.createElement('img');
        img.src = thumbnail;
        img.style.maxWidth = '80%';
        img.style.maxHeight = '70%';
        img.style.borderRadius = '12px';
        img.style.marginTop = '20px';
        overlay.appendChild(img);
      }

      document.body.appendChild(overlay);
    };

    map.on('click', 'event-pins', onClick);
    return () => {
      map.off('click', 'event-pins', onClick);
    };
  }, [map]);

  return null;
}
