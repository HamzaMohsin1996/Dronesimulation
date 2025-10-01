import React from 'react';
import { Link } from 'react-router-dom';

const mockEvents = [
  { id: 't1', type: 'fire', time: '13:30', text: 'Fire in block C' },
  { id: 't2', type: 'chemical', time: '13:42', text: 'Gas leak near pipeline' },
  { id: 't3', type: 'people', time: '13:55', text: 'Rescue team spotted' },
];

export default function ScenarioTimeline() {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#f1f5f9',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h3 style={{ padding: '16px 24px', margin: 0 }}>Event Timeline</h3>

      <div
        style={{
          display: 'flex',
          overflowX: 'auto',
          gap: 16,
          padding: '0 24px 24px',
        }}
      >
        {mockEvents.map((e) => (
          <Link
            key={e.id}
            to={`/reengagement/timeline/${e.id}`}
            style={{
              minWidth: 240,
              background: '#fff',
              borderRadius: 12,
              padding: 16,
              boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
              textDecoration: 'none',
              color: '#111',
              flex: '0 0 auto',
            }}
          >
            <div style={{ fontSize: 32 }}>
              {e.type === 'fire' ? '🔥' : e.type === 'chemical' ? '🧪' : '👥'}
            </div>
            <strong>{e.text}</strong>
            <div style={{ color: '#475569', marginTop: 4 }}>{e.time}</div>
          </Link>
        ))}
      </div>

      {/* Placeholder for map/video area */}
      <div style={{ flex: 1, background: '#e2e8f0' }} />
    </div>
  );
}
