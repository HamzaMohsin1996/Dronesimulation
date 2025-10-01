import React, { useEffect, useRef } from 'react';
import type { DetectionEvent } from '../shared/drone';

interface EventFeedPanelProps {
  /** All detection events (fire, chemical, snapshot, etc.) */
  events: DetectionEvent[];
  /** Called when user clicks an event to zoom map/video */
  onSelect: (ev: DetectionEvent) => void;
  /** Timestamp when user left; events after this show a NEW badge */
  missedSince?: number | null;
}

/**
 * Sidebar feed that lists every event in reverse-chronological order.
 * Highlights unseen events with a “NEW” badge.
 */
export default function EventFeedPanel({ events, onSelect, missedSince }: EventFeedPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to top when a NEW event arrives
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [events]);

  // choose icon & color per label
  const iconFor = (label: string) => {
    switch (label) {
      case 'fire':
        return { icon: '🔥', color: '#ef4444' };
      case 'chemical':
        return { icon: '🧪', color: '#eab308' };
      case 'people':
      case 'person':
        return { icon: '👥', color: '#0ea5e9' };
      case 'snapshot':
        return { icon: '📸', color: '#22c55e' };
      default:
        return { icon: '❗', color: '#6b7280' };
    }
  };

  const sorted = [...events].sort((a, b) => b.ts - a.ts);

  return (
    <aside
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        width: 300,
        background: '#ffffff',
        borderRight: '1px solid #e5e7eb',
        overflowY: 'auto',
        zIndex: 2500,
        boxShadow: '2px 0 8px rgba(0,0,0,0.1)',
        fontFamily: 'system-ui, sans-serif',
      }}
      ref={containerRef}
    >
      <div
        style={{
          padding: '12px 16px',
          fontWeight: 700,
          borderBottom: '1px solid #e5e7eb',
          background: '#f8fafc',
        }}
      >
        Event Feed
      </div>

      {sorted.map((ev) => {
        const { icon, color } = iconFor(ev.label);
        const isNew = missedSince ? ev.ts > missedSince : false;

        return (
          <div
            key={ev.id}
            onClick={() => onSelect(ev)}
            style={{
              display: 'flex',
              gap: 10,
              padding: '10px 14px',
              cursor: 'pointer',
              borderBottom: '1px solid #f1f5f9',
              background: isNew ? '#f0fdf4' : 'transparent',
              transition: 'background 0.2s',
            }}
          >
            <div
              style={{
                fontSize: 22,
                flexShrink: 0,
                color,
                lineHeight: '24px',
              }}
            >
              {icon}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>
                {ev.label.toUpperCase()}
                {isNew && (
                  <span
                    style={{
                      marginLeft: 6,
                      background: '#16a34a',
                      color: '#fff',
                      fontSize: 10,
                      padding: '1px 4px',
                      borderRadius: 4,
                      fontWeight: 700,
                    }}
                  >
                    NEW
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#475569' }}>
                {new Date(ev.ts).toLocaleTimeString()}
              </div>
              {ev.thumbnail && (
                <img
                  src={ev.thumbnail}
                  alt="snapshot"
                  style={{
                    width: '100%',
                    maxHeight: 120,
                    marginTop: 6,
                    borderRadius: 6,
                    objectFit: 'cover',
                  }}
                />
              )}
            </div>
          </div>
        );
      })}
      {!sorted.length && (
        <div style={{ padding: '16px', color: '#6b7280', fontSize: 14 }}>No events yet.</div>
      )}
    </aside>
  );
}
