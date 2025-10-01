import React, { useEffect, useState, useRef } from 'react';

export default function DroneDashboard() {
  const [telemetry, setTelemetry] = useState(null);
  const [logs, setLogs] = useState([]);
  const [frame, setFrame] = useState(null);
  const wsRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080/ws');
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ Connected to WS server');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'telemetry') {
          setTelemetry(msg);
        }

        if (msg.type === 'video_frame') {
          setFrame(`data:image/${msg.format};base64,${msg.data}`);
        }

        setLogs((prev) => [...prev.slice(-10), msg]);
      } catch (err) {
        console.error('❌ Error parsing WS message', err);
      }
    };

    ws.onclose = () => console.log('❌ WS closed');
    ws.onerror = (err) => console.error('❌ WS error', err);

    return () => ws.close();
  }, []);

  const sendScanCommand = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ WebSocket not connected');
      return;
    }

    const command = {
      type: 'SCAN_COMMAND',
      droneId: 'drone-01',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [77.5946, 12.9716],
            [77.6, 12.9716],
            [77.6, 12.975],
            [77.5946, 12.975],
            [77.5946, 12.9716],
          ],
        ],
      },
      angle: 0,
      altitude: 40,
    };

    wsRef.current.send(JSON.stringify(command));
    console.log('📤 Sent SCAN_COMMAND');
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">🚁 Drone Dashboard</h1>

      <button className="px-4 py-2 bg-blue-500 text-white rounded" onClick={sendScanCommand}>
        Start Scan
      </button>

      {telemetry ? (
        <div className="border p-4 rounded bg-gray-100">
          <h2 className="font-semibold mb-2">Latest Telemetry</h2>
          <pre className="text-sm">{JSON.stringify(telemetry, null, 2)}</pre>
        </div>
      ) : (
        <p>Waiting for telemetry...</p>
      )}

      {frame && (
        <div>
          <h2 className="font-semibold mb-2">Live Video Feed</h2>
          <img src={frame} alt="Drone video" className="rounded shadow-md max-w-md" />
        </div>
      )}

      <div>
        <h2 className="font-semibold">Logs</h2>
        <ul className="text-xs bg-black text-green-400 p-2 rounded max-h-60 overflow-auto">
          {logs.map((log, i) => (
            <li key={i}>{JSON.stringify(log)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
