// src/components/PegmanControl.tsx
import React, { useEffect, useRef, useState } from "react";
import "./PegmanControl.css";

type PegmanProps = {
  onDropOnMap?: (lng: number, lat: number) => void;
};

export default function PegmanControl({ onDropOnMap }: PegmanProps) {
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

  return (
    <div id="pegman-container" style={{ all: "unset" }}>
      <div
        id="pegman"
        ref={pegmanRef}
        style={{
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${dragging ? 1.1 : 1})`,
            cursor: dragging ? "grabbing" : "grab",
          }}
          
      ></div>
  
      {/* Preload images */}
      <img
        src="https://maps.gstatic.com/tactile/pegman_v3/santa/runway-2x.png"
        height="0"
        width="0"
        alt=""
      />
      <img
        src="https://maps.gstatic.com/tactile/pegman_v3/santa/dropping-2x.png"
        height="0"
        width="0"
        alt=""
      />
    </div>
  );
   
}
