// src/components/PegmanControl.tsx
import React, { useEffect, useRef, useState } from 'react';
import './PegmanControl.css';

type PegmanProps = {
  onDropOnMap?: (lng: number, lat: number) => void;
  enabled?: boolean;
};

export default function PegmanControl({ onDropOnMap, enabled = false }: PegmanProps) {
  const pegmanRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  console.log('🧩 Pegman rendered');
  useEffect(() => {
    console.log('🚀 Pegman mounted');
    return () => console.log('💥 Pegman unmounted');
  }, []);
  useEffect(() => {
    const pegman = pegmanRef.current;
    if (!pegman) {
      console.warn('⚠️ Pegman ref not found — cannot attach drag handlers');
      return;
    }

    let isDragging = false;
    let startX = 0;
    let startY = 0;

    const onMouseDown = (e: MouseEvent) => {
      console.log('🟢 Mouse down on Pegman');
      isDragging = true;
      setDragging(true);
      startX = e.clientX;
      startY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      console.log('🟡 Moving...', e.clientX, e.clientY);
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      setOffset({ x: dx, y: dy });
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!isDragging) return;
      console.log('🔴 Mouse up at:', e.clientX, e.clientY);

      isDragging = false;
      setDragging(false);
      setOffset({ x: 0, y: 0 });

      // --- DEBUG START ---
      const mapEl = document.querySelector<HTMLDivElement>('.mapboxgl-canvas');
      const map = (window as any).mapboxMapRef;

      console.log('🧭 Step 1: map element found?', !!mapEl, mapEl);
      console.log('🗺️ Step 2: global map object exists?', !!map, map);
      console.log('🎯 Step 3: callback exists?', !!onDropOnMap);

      if (map && mapEl && onDropOnMap) {
        const rect = mapEl.getBoundingClientRect();
        console.log('📏 Step 4: map canvas rect:', rect);

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        console.log('🖱️ Step 5: local mouse coords relative to map:', x, y);

        const lngLat = map.unproject([x, y]);
        console.log('🌍 Step 6: converted lngLat:', lngLat);

        onDropOnMap(lngLat.lng, lngLat.lat);
      } else {
        console.warn('⚠️ Something missing → cannot drop on map!');
      }
      // --- DEBUG END ---
    };

    pegman.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    console.log('✅ Pegman drag listeners attached');

    return () => {
      pegman.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      console.log('🧹 Pegman drag listeners cleaned up');
    };
  }, [onDropOnMap]);

  // 🧭 Adjust tooltip if it's near screen edge
  useEffect(() => {
    const tooltip = document.querySelector('.pegman-tooltip') as HTMLElement;
    if (!tooltip) return;

    const handleMouseEnter = () => {
      const rect = tooltip.getBoundingClientRect();

      // Shift inward if near right edge
      if (rect.right > window.innerWidth) {
        tooltip.style.left = 'auto';
        tooltip.style.right = '0';
        tooltip.style.transform = 'translateX(0)';
      }

      // (Optional) handle left edge if needed
      if (rect.left < 0) {
        tooltip.style.left = '0';
        tooltip.style.transform = 'translateX(0)';
      }
    };

    const container = document.getElementById('pegman-container');
    container?.addEventListener('mouseenter', handleMouseEnter);

    return () => container?.removeEventListener('mouseenter', handleMouseEnter);
  }, []);

  return (
    <div id="pegman-container" className={!enabled ? 'disabled' : ''}>
      <div
        id="pegman"
        ref={pegmanRef}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          cursor: !enabled ? 'not-allowed' : dragging ? 'grabbing' : 'grab',
          opacity: enabled ? 1 : 0.5,
          filter: enabled ? 'none' : 'grayscale(1)',
          transition: 'opacity 0.3s ease, filter 0.3s ease',
        }}
      ></div>

      {!enabled && <div className="pegman-tooltip">🔒 Pegman locked until scanning starts</div>}
    </div>
  );
}
