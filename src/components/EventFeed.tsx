import React, { useState, useMemo } from 'react';
import type { DetectionEvent } from '../shared/DetectionEvent';

const iconMap: Record<string, { icon: string; name: string }> = {
  fire: { icon: '🔥', name: 'Fire' },
  chemical: { icon: '🧪', name: 'Chemical' },
  snapshot: { icon: '📸', name: 'Snapshot' },
  person: { icon: '👤', name: 'Person' },
  car: { icon: '🚗', name: 'Car' },
  truck: { icon: '🚚', name: 'Truck' },
  animal: { icon: '🐾', name: 'Animal' },
};

function formatEvent(ev: DetectionEvent) {
  const entry = iconMap[ev.label] ?? { icon: '❓', name: ev.label };
  return `${entry.icon} ${entry.name}`;
}

interface EventFeedProps {
  events: DetectionEvent[];
  missionActive: boolean;
  unreadCount: number;
  onSelect: (ev: DetectionEvent) => void;
  onMarkRead: (id: string) => void;
}

export default function EventFeed({
  events,
  missionActive,
  unreadCount,
  onSelect,
}: EventFeedProps) {
  const [filter, setFilter] = useState<string>('all');

  // ✅ Collect unique labels from detections
  const detectedLabels = useMemo(() => {
    const unique = new Set(events.map((e) => e.label));
    return Array.from(unique);
  }, [events]);

  // ✅ Filter feed
  const filtered = events
    .slice()
    .filter((ev) => filter === 'all' || ev.label === filter)
    .sort((a, b) => b.ts - a.ts);

  return (
    <aside
      style={{
        width: 340,
        borderRight: '1px solid #e5e7eb',
        background: '#f9fafb',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui,sans-serif',
      }}
    >
      {/* ---- Header ---- */}
      <header
        style={{
          padding: '1rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#fff',
          gap: '0.75rem',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Event Feed</h2>

        {/* ✅ Only show filter dropdown if we actually have detections */}
        {detectedLabels.length > 0 && (
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid #d1d5db',
              fontSize: '0.85rem',
              background: '#f9fafb',
              cursor: 'pointer',
            }}
          >
            <option value="all">All</option>
            {detectedLabels.map((label) => {
              const entry = iconMap[label] ?? { icon: '❓', name: label };
              return (
                <option key={label} value={label}>
                  {entry.icon} {entry.name}
                </option>
              );
            })}
          </select>
        )}

        {unreadCount > 0 && (
          <span
            style={{
              background: '#0ea5e9',
              color: '#fff',
              borderRadius: '999px',
              padding: '2px 8px',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {unreadCount} NEW
          </span>
        )}
      </header>

      {/* ---- Scrollable list ---- */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0.75rem',
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              color: '#6b7280',
              marginTop: '2rem',
              fontSize: '0.95rem',
              lineHeight: 1.4,
            }}
          >
            {!missionActive ? (
              <>
                <strong>No mission launched</strong>
                <br />
                Select a mission mode and start to begin detecting events.
              </>
            ) : (
              <>
                <strong>Mission launched</strong>
                <br />
                Waiting for incoming detections…
              </>
            )}
          </div>
        ) : (
          filtered.map((ev) => (
            <div
              key={ev.id}
              onClick={() => onSelect(ev)}
              style={{
                background: ev.seen ? '#fff' : '#e0f2fe',
                marginBottom: 10,
                padding: '12px',
                borderRadius: 10,
                boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
                {formatEvent(ev)}
              </div>
              <div style={{ fontSize: 12, color: '#475569' }}>
                {new Date(ev.ts).toLocaleTimeString()} • {(ev.score * 100).toFixed(0)}% confidence
              </div>
              {ev.thumbnail && (
                <img
                  src={ev.thumbnail}
                  alt="snapshot"
                  style={{
                    marginTop: 6,
                    width: '100%',
                    borderRadius: 6,
                  }}
                />
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
