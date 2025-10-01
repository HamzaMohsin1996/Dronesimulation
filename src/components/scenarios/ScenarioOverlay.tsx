import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const mockEvents = [
  { id: 'o1', type: 'fire', time: '13:02', text: 'Fire in warehouse', confidence: 0.91 },
  { id: 'o2', type: 'people', time: '13:05', text: 'People detected in zone B', confidence: 0.89 },
];

export default function ScenarioOverlay() {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {/* Simulated map background */}
      <div style={{ height: '100%', background: '#d1d5db' }} />

      {/* Toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          background: '#0a84ff',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '8px 12px',
          cursor: 'pointer',
        }}
      >
        {open ? 'Hide Panel' : 'Show Panel'}
      </button>

      {/* Floating overlay panel */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 70,
            right: 20,
            width: 300,
            maxHeight: '70%',
            overflowY: 'auto',
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            padding: 16,
          }}
        >
          <h4 style={{ marginTop: 0 }}>Recent Events</h4>
          {mockEvents.map((e) => (
            <Link
              key={e.id}
              to={`/reengagement/overlay/${e.id}`}
              style={{
                display: 'block',
                padding: '10px',
                marginBottom: 8,
                borderRadius: 8,
                background: '#f8fafc',
                textDecoration: 'none',
                color: '#111',
              }}
            >
              {e.type === 'fire' ? '🔥' : '👥'} {e.text}
              <div style={{ fontSize: 12, color: '#475569' }}>{e.time}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
