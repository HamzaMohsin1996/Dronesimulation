import React, { useState, useMemo } from 'react';
import type { DetectionEvent } from '../shared/DetectionEvent';
import { TbDrone, TbHome } from 'react-icons/tb';

const iconMap: Record<string, { icon: string; color: string; bg: string; name: string }> = {
  fire: { icon: 'local_fire_department', color: '#ef4444', bg: '#2c1d1f', name: 'Fire' },
  person: { icon: 'person', color: '#eab308', bg: '#2c291d', name: 'Person' },
  car: { icon: 'directions_car', color: '#60a5fa', bg: '#1d262c', name: 'Car' },
  truck: { icon: 'local_shipping', color: '#60a5fa', bg: '#1d262c', name: 'Truck' },
  animal: { icon: 'pets', color: '#22c55e', bg: '#1d2c22', name: 'Animal' },
  default: { icon: 'sensors', color: '#9ca3af', bg: '#1e293b', name: 'Detection' },
};

// function formatEvent(ev: DetectionEvent) {
//   const entry = iconMap[ev.label] ?? { icon: '❓', name: ev.label };
//   return `${entry.icon} ${entry.name}`;
// }

interface EventFeedProps {
  events: DetectionEvent[];
  missionActive: boolean;
  unreadCount: number;
  onSelect: (ev: DetectionEvent) => void;
  onMarkRead: (id: string) => void;
  onStartMission?: () => void;
  onEndMission?: () => void;
  onRemoveEvent?: (id: string) => void;
}

export default function EventFeed({
  events,
  missionActive,
  unreadCount,
  onStartMission,
  onEndMission,
  onMarkRead,
  onRemoveEvent,
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
        background: '#101922',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui,sans-serif',
      }}
    >
      {/* ---- Header ---- */}
      <header
        style={{
          padding: '1rem',
          // borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#101922',
          color: '#e5e7eb',
          gap: '0.75rem',
          paddingBottom: '0',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Mission Control</h2>

        {/* ✅ Only show filter dropdown if we actually have detections */}

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
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: '#101922',
            flexDirection: 'column',
          }}
        >
          {/* --- Start Mission Button --- */}
          <button
            onClick={onStartMission}
            disabled={missionActive}
            style={{
              flex: 1,
              marginBottom: '10px',
              padding: '8px 10px',
              background: missionActive ? '#9ca3af' : '#1173d4',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              cursor: missionActive ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <TbDrone size={20} style={{ marginRight: '6px' }} />
            Launch UAV
          </button>

          {/* --- End Mission Button --- */}
          <button
            onClick={onEndMission}
            disabled={!missionActive}
            style={{
              flex: 1,
              padding: '8px 10px',
              background: !missionActive ? '#233648' : '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              cursor: !missionActive ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <TbHome size={20} style={{ marginRight: '6px' }} />
            Return to Base
          </button>

          {/* --- Drone Status Section --- */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              padding: '16px',
              background: '#192633',
              borderRadius: '8px',
              marginTop: '14px',
            }}
          >
            {/* Battery */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <p style={{ color: 'white', fontSize: '14px', fontWeight: 500 }}>Battery</p>
                <p style={{ color: 'white', fontSize: '14px' }}>80%</p>
              </div>
              <div style={{ background: '#324d67', borderRadius: '4px', height: '8px' }}>
                <div
                  style={{
                    height: '8px',
                    width: '80%',
                    background: '#0ea5e9',
                    borderRadius: '4px',
                  }}
                ></div>
              </div>
            </div>

            {/* Link Strength */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  className="material-symbols-outlined"
                  style={{ color: 'white', fontSize: '18px' }}
                >
                  signal_cellular_alt
                </span>
                <p style={{ color: 'white', fontSize: '14px', fontWeight: 500, margin: 0 }}>
                  Link Strength
                </p>
              </div>
              <p style={{ color: '#4ade80', fontSize: '14px', fontWeight: 600, margin: 0 }}>
                Strong
              </p>
            </div>

            {/* GPS */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  className="material-symbols-outlined"
                  style={{ color: 'white', fontSize: '18px' }}
                >
                  location_on
                </span>
                <p style={{ color: 'white', fontSize: '14px', fontWeight: 500, margin: 0 }}>GPS</p>
              </div>
              <p style={{ color: '#92adc9', fontSize: '14px', margin: 0 }}>34.05° N, 118.24° W</p>
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              color: '#6b7280',
              marginTop: '1rem',
              fontSize: '0.95rem',
              lineHeight: 1.4,
            }}
          >
            {/* ✅ Mission control buttons */}

            {!missionActive ? (
              <div
                style={{
                  color: '#e5e7eb',
                  marginTop: '20px',
                }}
              >
                <strong>No mission launched</strong>
                <br />
                Select a mission mode and start to begin detecting events.
              </div>
            ) : (
              <>
                <strong>Mission launched</strong>
                <br />
                Waiting for incoming detections…
              </>
            )}
          </div>
        ) : (
          // filtered.map((ev) => (
          //   <div
          //     key={ev.id}
          //     onClick={() => onSelect(ev)}
          //     style={{
          //       background: ev.seen ? '#fff' : '#e0f2fe',
          //       marginBottom: 10,
          //       padding: '12px',
          //       borderRadius: 10,
          //       boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
          //       cursor: 'pointer',
          //       transition: 'background 0.2s',
          //     }}
          //   >
          //     <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
          //       {formatEvent(ev)}
          //     </div>
          //     <div style={{ fontSize: 12, color: '#475569' }}>
          //       {new Date(ev.ts).toLocaleTimeString()} • {(ev.score * 100).toFixed(0)}% confidence
          //     </div>
          //     {ev.thumbnail && (
          //       <img
          //         src={ev.thumbnail}
          //         alt="snapshot"
          //         style={{
          //           marginTop: 6,
          //           width: '100%',
          //           borderRadius: 6,
          //         }}
          //       />
          //     )}
          //   </div>
          // ))
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                padding: '1rem',
                // borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#101922',
                color: '#e5e7eb',
                gap: '0.75rem',
                paddingBottom: '0',
              }}
            >
              <h2
                style={{
                  color: 'white',
                  fontSize: '16px',
                  fontWeight: 600,
                  marginBottom: '4px',
                }}
              >
                Detection Feed
              </h2>
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
                    const entry = iconMap[label] ?? { icon: 'sensors', name: label };
                    return (
                      <option key={label} value={label}>
                        {entry.name}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filtered.map((ev) => {
                const meta = iconMap[ev.label] ?? iconMap.default;

                return (
                  <div
                    key={ev.id}
                    onClick={() => onSelect(ev)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#233648',
                      padding: '12px 16px',
                      borderRadius: 10,
                      minHeight: 72,
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }}
                  >
                    {/* Left: icon + text */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div
                        style={{
                          color: meta.color,
                          background: meta.bg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 8,
                          width: 40,
                          height: 40,
                          flexShrink: 0,
                        }}
                      >
                        <span
                          className="material-symbols-outlined"
                          style={{ color: meta.color, fontSize: 22 }}
                        >
                          {meta.icon}
                        </span>
                      </div>
                      <div>
                        <p style={{ color: 'white', fontSize: 14, fontWeight: 500, margin: 0 }}>
                          {meta.name}
                        </p>
                        <p style={{ color: '#92adc9', fontSize: 12, margin: 0 }}>
                          {new Date(ev.ts).toLocaleTimeString()} • {(ev.score * 100).toFixed(0)}%
                          confidence
                        </p>
                      </div>
                    </div>

                    {/* Right: buttons */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      //{' '}
                      {ev.thumbnail && (
                        <img
                          src={ev.thumbnail}
                          alt="snapshot"
                          style={{
                            marginTop: 6,
                            width: '100%',
                            borderRadius: 6,
                            maxWidth: 25,
                            maxHeight: 25,
                          }}
                        />
                      )}
                      {/* <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onMarkRead?.(ev.id);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          borderRadius: 6,
                          padding: '4px 6px',
                          cursor: 'pointer',
                        }}
                      >
                        <span
                          className="material-symbols-outlined"
                          style={{ color: 'white', fontSize: 18 }}
                        >
                          done
                        </span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveEvent?.(ev.id); // ✅ remove event by id
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '4px 6px',
                          cursor: 'pointer',
                        }}
                      >
                        <span
                          className="material-symbols-outlined"
                          style={{ color: 'white', fontSize: 18 }}
                        >
                          close
                        </span>
                      </button> */}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
