import React from 'react';
import type { Detection } from '../shared/drone';

type Props = {
  src: string;
  detections: Detection[];
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
};

export default function DroneLiveFeed({
  src,
  detections,
  isFullscreen,
  onToggleFullscreen,
}: Props) {
  const isPlaceholder = src.includes('YOUR-HLS-STREAM');

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {isPlaceholder ? (
        <img
          src="https://via.placeholder.com/800x600?text=Drone+Camera+Feed"
          alt="Drone Feed"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <video
          src={src}
          controls
          autoPlay
          muted
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}

      {/* overlay detections */}
      {detections.map((d) =>
        d.bbox ? (
          <div
            key={d.id}
            title={`${d.label} ${(d.score * 100).toFixed(0)}%`}
            style={{
              position: 'absolute',
              left: d.bbox[0],
              top: d.bbox[1],
              width: d.bbox[2],
              height: d.bbox[3],
              border: '2px solid #0a84ff',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.2)',
              pointerEvents: 'none',
            }}
          />
        ) : null
      )}

      <button
        onClick={onToggleFullscreen}
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          padding: '6px 12px',
          background: '#fff',
          borderRadius: 4,
          border: 'none',
          cursor: 'pointer',
          fontWeight: 'bold',
        }}
      >
        {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
      </button>
    </div>
  );
}
