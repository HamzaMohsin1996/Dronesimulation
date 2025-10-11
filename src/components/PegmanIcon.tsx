// src/components/PegmanControl.tsx
import React, { useEffect, useRef, useState } from "react";
import "./PegmanControl.css";

type PegmanProps = {
    onDropOnMap?: (lng: number, lat: number) => void;
    enabled?: boolean;
  };
  

  export default function PegmanControl({ onDropOnMap, enabled = false }: PegmanProps) {
  const pegmanRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const pegman = pegmanRef.current;
    if (!pegman) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      setDragging(true);
      startX = e.clientX;
      startY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      setOffset({ x: dx, y: dy });
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!isDragging) return;
      isDragging = false;
      setDragging(false);
      setOffset({ x: 0, y: 0 });

      // 🧭 Convert screen position → map coordinates
      const mapEl = document.querySelector<HTMLDivElement>(".mapboxgl-canvas");
      const map = (window as any).mapboxMapRef; // we’ll assign this in ReengagementMap
      if (map && mapEl && onDropOnMap) {
        const rect = mapEl.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const lngLat = map.unproject([x, y]);
        onDropOnMap(lngLat.lng, lngLat.lat);
      }
    };

    pegman.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    return () => {
      pegman.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
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
    <div id="pegman-container" className={!enabled ? "disabled" : ""}>
      <div
        id="pegman"
        ref={pegmanRef}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          cursor: !enabled ? "not-allowed" : dragging ? "grabbing" : "grab",
          opacity: enabled ? 1 : 0.5,
          filter: enabled ? "none" : "grayscale(1)",
          transition: "opacity 0.3s ease, filter 0.3s ease",
        }}
      ></div>
  
      {!enabled && (
        <div className="pegman-tooltip">
          🔒 Pegman locked until scanning starts
        </div>
      )}
    </div>
  );
  
  
   
}
