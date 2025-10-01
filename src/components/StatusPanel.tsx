import React from 'react';
import { DronePort } from '../shared/drone';

export default function StatusPanel({
  ports,
  logs,
  topOffset = 50,
}: {
  ports: DronePort[];
  logs: string[];
  topOffset?: number | string;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: topOffset,
        right: 10,
        background: 'white',
        padding: 10,
        borderRadius: 8,
        zIndex: 1500,
        minWidth: 260,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      }}
    >
      <div>🖱️ Click on the map to launch the nearest drone</div>
      <strong>🛰️ Drone Status</strong>
      <ul>
        {ports.map((d) => (
          <li key={d.id}>
            {d.id}: <strong>{d.status}</strong>
          </li>
        ))}
      </ul>
      {logs.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <strong>📜 Hazard Log:</strong>
          <ul>
            {logs.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
