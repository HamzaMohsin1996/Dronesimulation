import { useEffect, useRef, useState } from 'react';

export type Telemetry = {
  type: 'telemetry';
  droneId: string;
  t: number;
  pose: { lat: number; lon: number; alt: number; roll: number; pitch: number; yaw: number };
  vel: { vx: number; vy: number; vz: number };
  imu: { ax: number; ay: number; az: number; gx: number; gy: number; gz: number };
  battery?: { v: number; pct: number };
};

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';

export function useDroneTelemetry() {
  const [latestByDrone, setLatestByDrone] = useState<Map<string, Telemetry>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let retry = 500;
    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        retry = 500;
        console.log('WS connected:', WS_URL);
      };
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg?.type === 'telemetry' && msg.droneId) {
            setLatestByDrone((prev) => {
              const next = new Map(prev);
              next.set(msg.droneId, msg as Telemetry);
              return next;
            });
          }
        } catch {
          /* ignore non-JSON */
        }
      };
      ws.onclose = () => setTimeout(connect, Math.min(5000, (retry *= 1.5)));
      ws.onerror = () => ws.close();
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

  return latestByDrone; // Map<droneId, Telemetry>
}
