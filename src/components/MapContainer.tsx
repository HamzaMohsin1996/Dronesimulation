import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapProvider } from '../contexts/MapContext';

type Props = { center?: [number, number]; zoom?: number; children?: React.ReactNode };

export default function MapContainer({ center = [11.506, 48.718], zoom = 13, children }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const m = new maplibregl.Map({
      container: ref.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
          },
        },
        layers: [{ id: 'osm-layer', type: 'raster', source: 'osm' }],
      },
      center,
      zoom,
    });
    m.on('load', () => setMap(m));
    return () => {
      m.remove();
    };
  }, [center, zoom]);

  return (
    <div style={{ position: 'relative', height: '100vh', width: '100vw' }}>
      <div ref={ref} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
      {map && <MapProvider value={map}>{children}</MapProvider>}
    </div>
  );
}
