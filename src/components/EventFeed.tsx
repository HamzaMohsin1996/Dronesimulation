import React, { useState, useMemo } from 'react';
import type { DetectionEvent } from '../shared/DetectionEvent';

// 🔹 Icon + color mapping for event types
const iconMap: Record<string, { icon: string; name: string; color: string }> = {
  fire: { icon: '🔥', name: 'Fire', color: '#ef4444' },
  person: { icon: '🧍', name: 'Person', color: '#2563eb' },
  chemical: { icon: '🧪', name: 'Chemical', color: '#a855f7' },
  blocked_road: { icon: '🚧', name: 'Blocked Road', color: '#f59e0b' },
  car: { icon: '🚗', name: 'Car', color: '#6b7280' },
  truck: { icon: '🚚', name: 'Truck', color: '#6b7280' },
  animal: { icon: '🐾', name: 'Animal', color: '#6b7280' },
  snapshot: { icon: '📸', name: 'Snapshot', color: '#6b7280' },
};

function formatEvent(ev: DetectionEvent) {
  const entry = iconMap[ev.label] ?? { icon: '❓', name: ev.label, color: '#6b7280' };
  return entry;
}

interface EventFeedProps {
  events: DetectionEvent[];
  missionActive: boolean;
  unreadCount: number;
  onSelect: (ev: DetectionEvent) => void;
  onLaunchMission: () => void;
  onReturnToBase: () => void;
  missionInfo?: { title: string; location: string };
  uavStatus?: { battery: number; altitude: number; connected: boolean };
}

export default function EventFeed({
  events,
  missionActive,
  unreadCount,
  onSelect,
  onLaunchMission,
  onReturnToBase,
  missionInfo,
  uavStatus,
}: EventFeedProps) {
  const [filter, setFilter] = useState<string>('all');

  // 🔹 Unique event labels
  const detectedLabels = useMemo(() => {
    const unique = new Set(events.map((e) => e.label));
    return Array.from(unique);
  }, [events]);

  // 🔹 Group detections by label
  const grouped = useMemo(() => {
    const groups: Record<string, DetectionEvent[]> = {};
    events.forEach((e) => {
      const key = e.label;
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    });
    return Object.entries(groups).map(([key, list]) => ({
      key,
      label: list[0].label,
      count: list.length,
      latest: list[0],
    }));
  }, [events]);

  // 🔹 Simple auto-summary
  const situationSummary = useMemo(() => {
    const hasFire = events.some((e) => e.label === 'fire');
    const hasPeople = events.some((e) => e.label === 'person');
    const hasBlockedRoad = events.some((e) => e.label === 'blocked_road');

    const summary: string[] = [];
    if (hasFire) summary.push('🔥 Fire spreading north (wind NE)');
    if (hasPeople) summary.push('🧍 Persons near hazard zone');
    if (hasBlockedRoad) summary.push('🚧 South road blocked — reroute west');
    if (summary.length === 0) summary.push('✅ Scene stable — no new hazards detected');
    return summary;
  }, [events]);

  const filteredGroups = filter === 'all' ? grouped : grouped.filter((g) => g.label === filter);

  return (
    <aside
      style={{
        width: 340,
        borderRight: '1px solid #e5e7eb',
        background: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* ---- Mission Header ---- */}
      <header
        style={{
          background: '#1e293b',
          color: '#fff',
          padding: '1rem',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
          {missionActive ? '🚁 UAV-1 In Flight' : '🛰️ UAV Standby'}
        </h2>

        {missionInfo && (
          <p style={{ fontSize: '0.85rem', margin: '4px 0' }}>
            🔥 {missionInfo.title}
            <br />
            📍 {missionInfo.location}
          </p>
        )}

        {uavStatus && (
          <p style={{ fontSize: '0.8rem', color: '#cbd5e1', margin: '2px 0' }}>
            🔋 {uavStatus.battery}% | ⬆️ {uavStatus.altitude} m |{' '}
            {uavStatus.connected ? '🟢 Connected' : '🔴 Disconnected'}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            onClick={onLaunchMission}
            disabled={missionActive}
            style={{
              flex: 1,
              background: '#0ea5e9',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '6px 8px',
              cursor: missionActive ? 'not-allowed' : 'pointer',
              fontWeight: 600,
            }}
          >
            🚀 Launch
          </button>
          <button
            onClick={onReturnToBase}
            disabled={!missionActive}
            style={{
              flex: 1,
              background: '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '6px 8px',
              cursor: missionActive ? 'pointer' : 'not-allowed',
              fontWeight: 600,
            }}
          >
            🔁 Return
          </button>
        </div>
      </header>

      {/* ---- Event Feed ---- */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
        {filteredGroups.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              color: '#64748b',
              marginTop: '2rem',
              fontSize: '0.95rem',
              lineHeight: 1.4,
            }}
          >
            {!missionActive ? (
              <>
                <strong>No mission launched</strong>
                <br />
                Select a mission mode and start detecting events.
              </>
            ) : (
              <>
                <strong>Mission active</strong>
                <br />
                Waiting for incoming detections…
              </>
            )}
          </div>
        ) : (
          filteredGroups.map((g) => {
            const entry = formatEvent(g.latest);
            return (
              <div
                key={g.key}
                onClick={() => onSelect(g.latest)}
                style={{
                  background: '#fff',
                  marginBottom: 10,
                  padding: '12px',
                  borderRadius: 10,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                  borderLeft: `4px solid ${entry.color}`,
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    marginBottom: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>{entry.icon}</span>
                  {entry.name}{' '}
                  {g.count > 1 && (
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>({g.count})</span>
                  )}
                </div>

                <div style={{ fontSize: 12, color: '#475569' }}>
                  {new Date(g.latest.ts).toLocaleTimeString()} • {(g.latest.score * 100).toFixed(0)}
                  % confidence
                </div>

                {g.latest.thumbnail && (
                  <img
                    src={g.latest.thumbnail}
                    alt="snapshot"
                    style={{ marginTop: 6, width: '100%', borderRadius: 6 }}
                  />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ---- Situation Summary ---- */}
      <footer
        style={{
          background: '#fff',
          borderTop: '1px solid #e5e7eb',
          padding: '0.75rem 1rem',
        }}
      >
        <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
          🧠 Situation Summary
        </h4>
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: '0.8rem', color: '#475569' }}>
          {situationSummary.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </footer>
    </aside>
  );
}
