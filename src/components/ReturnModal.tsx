import React, { useEffect, useState } from 'react';
import { Modal, Button } from 'react-bootstrap';
import type { DetectionEvent } from '../shared/DetectionEvent';

type ReturnModalProps = {
  show: boolean;
  missedEvents: DetectionEvent[];
  reason: 'tab-switch' | 'out-of-focus' | 'idle' | null;
  onClose: (remaining: DetectionEvent[]) => void;
  onSelectEvent: (id: string) => void;
  onReplayRange?: (startTs: number, endTs: number) => void;
  onGoLive?: () => void;
};

const iconFor = (label: string) => {
  switch (label) {
    case 'fire':
      return '🔥';
    case 'person':
      return '👥';
    case 'chemical':
      return '🧪';
    case 'car':
      return '🚗';
    case 'truck':
      return '🚚';
    default:
      return '📸';
  }
};

export default function ReturnModal({
  show,
  missedEvents,
  reason,
  onClose,
  onSelectEvent,
  onReplayRange,
  onGoLive,
}: ReturnModalProps) {
  const [frozenEvents, setFrozenEvents] = useState<DetectionEvent[]>([]);
  const [hoverEvent, setHoverEvent] = useState<string | null>(null);
  const [hoverData, setHoverData] = useState<DetectionEvent | null>(null);
  const [hoverPos, setHoverPos] = useState<number | null>(null);

  // 🧊 Freeze snapshot of missed events when modal opens
  useEffect(() => {
    if (show) {
      setFrozenEvents(missedEvents);
      setHoverEvent(null);
    }
  }, [show]);

  if (!show || !frozenEvents?.length) return null;

  // ✅ Filter for highway-relevant detections
  const relevantLabels = ['fire', 'person', 'chemical', 'car', 'truck'];
  const sorted = frozenEvents
    .filter((e) => relevantLabels.includes(e.label.toLowerCase()))
    .sort((a, b) => a.ts - b.ts);

  if (!sorted.length) return null;

  const minTs = sorted[0].ts;
  const maxTs = sorted.at(-1)!.ts;
  const midTs = minTs + (maxTs - minTs) / 2;

  const heading =
    reason === 'tab-switch'
      ? 'Welcome back — you switched tabs'
      : reason === 'out-of-focus'
      ? 'Welcome back — you left the app window'
      : reason === 'idle'
      ? 'Welcome back — you were inactive'
      : 'While you were away';

  const subText =
    reason === 'tab-switch'
      ? 'Here’s what happened while you viewed another tab.'
      : reason === 'out-of-focus'
      ? 'Here’s what happened while the app was in the background.'
      : reason === 'idle'
      ? 'Here’s what happened while you were inactive.'
      : 'Here’s what you missed.';

  const getColor = (score?: number) => {
    if (score == null) return '#9ca3af';
    if (score > 0.8) return '#16a34a';
    if (score > 0.6) return '#ca8a04';
    return '#dc2626';
  };

  // 🌀 Add CSS for glowing pulse animation
  const pulseStyle = `
    @keyframes pulseGlow {
      0% { box-shadow: 0 0 0 0 rgba(22,163,74,0.6); }
      70% { box-shadow: 0 0 0 0.6em rgba(22,163,74,0); }
      100% { box-shadow: 0 0 0 0 rgba(22,163,74,0); }
    }
  `;

  return (
    <>
      <style>{pulseStyle}</style>

      <Modal show={show} onHide={() => onClose(frozenEvents)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: 'clamp(16px, 2vw, 20px)' }}>{heading}</Modal.Title>
        </Modal.Header>

        <Modal.Body
          style={{
            maxHeight: '70vh',
            overflowY: 'auto',
            position: 'relative',
            paddingBottom: 8,
          }}
        >
          <p style={{ marginBottom: 6, color: '#6b7280', fontSize: 'clamp(13px, 1.5vw, 15px)' }}>
            {subText}
          </p>
          <p
            style={{
              marginBottom: 10,
              fontStyle: 'italic',
              color: '#9ca3af',
              fontSize: 'clamp(12px, 1.2vw, 14px)',
            }}
          >
            Events occurred between <strong>{new Date(minTs).toLocaleTimeString()}</strong> and{' '}
            <strong>{new Date(maxTs).toLocaleTimeString()}</strong>.
          </p>

          {/* Sticky, compact timeline */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              background: '#fff',
              padding: '6px 0 12px',
            }}
          >
            <div
              style={{
                position: 'relative',
                height: 26,
                background: '#f9fafb',
                borderRadius: 5,
                marginBottom: 4,
                width: '100%',
                overflow: 'visible',
              }}
            >
              {sorted.map((e, i) => {
                const pos = ((e.ts - minTs) / (maxTs - minTs)) * 100;
                const isLatest = e.ts === maxTs; // 🌟 highlight latest
                return (
                  <div
                    key={i}
                    title={`${e.label} (${Math.round((e.score ?? 0) * 100)}%)`}
                    onMouseEnter={() => {
                      setHoverEvent(e.id);
                      setHoverData(e);
                      setHoverPos(pos);
                    }}
                    onMouseLeave={() => {
                      setHoverEvent(null);
                      setHoverData(null);
                    }}
                    style={{
                      position: 'absolute',
                      left: `${pos}%`,
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      fontSize: 'clamp(14px, 1.8vw, 20px)',
                      cursor: 'pointer',
                      color: getColor(e.score),
                      transition: 'transform 0.2s ease, font-size 0.2s',
                      transformOrigin: 'center',
                      scale: hoverEvent === e.id ? 1.2 : 1,
                      animation: isLatest ? 'pulseGlow 2s infinite' : 'none',
                      borderRadius: '50%',
                    }}
                  >
                    {iconFor(e.label)}
                  </div>
                );
              })}

              {/* Responsive hover card */}
              {hoverData && hoverPos !== null && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '110%',
                    left: `${Math.min(Math.max(hoverPos, 10), 90)}%`,
                    transform: 'translate(-50%, -4px)',
                    background: 'rgba(0,0,0,0.85)',
                    color: '#fff',
                    padding: '8px 10px',
                    borderRadius: 8,
                    width: 'min(240px, 70vw)',
                    zIndex: 20,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    fontSize: 'clamp(12px, 1.3vw, 14px)',
                  }}
                >
                  <strong>{hoverData.label.toUpperCase()}</strong> •{' '}
                  {(hoverData.score * 100).toFixed(0)}%
                  <br />
                  {new Date(hoverData.ts).toLocaleTimeString()}
                  {hoverData.thumbnail && (
                    <img
                      src={hoverData.thumbnail}
                      alt="snapshot"
                      style={{
                        width: '100%',
                        marginTop: 6,
                        borderRadius: 4,
                        objectFit: 'cover',
                      }}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Compact timestamps */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 'clamp(10px, 1.2vw, 12px)',
                color: '#6b7280',
                padding: '0 4px',
              }}
            >
              <span>{new Date(minTs).toLocaleTimeString()}</span>
              <span>{new Date(midTs).toLocaleTimeString()}</span>
              <span>{new Date(maxTs).toLocaleTimeString()}</span>
            </div>
          </div>

          {/* Event list (below timeline) */}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, marginTop: 8 }}>
            {sorted.map((e) => (
              <li
                key={e.id}
                onClick={() => {
                  onSelectEvent(e.id);
                  onClose(frozenEvents.filter((ev) => ev.id !== e.id));
                }}
                style={{
                  display: 'flex',
                  gap: 10,
                  padding: '10px 0',
                  borderBottom: '1px solid #e5e7eb',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 'clamp(18px, 2vw, 22px)' }}>{iconFor(e.label)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>
                    {e.label.charAt(0).toUpperCase() + e.label.slice(1)}
                  </div>
                  <div style={{ fontSize: 'clamp(11px, 1.2vw, 13px)', color: '#6b7280' }}>
                    {new Date(e.ts).toLocaleTimeString()} •{' '}
                    {e.score != null && (
                      <span
                        style={{
                          color: getColor(e.score),
                          fontWeight: 500,
                        }}
                      >
                        {Math.round(e.score * 100)}% confidence
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Modal.Body>

        <Modal.Footer
          style={{
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            rowGap: 8,
          }}
        >
          <div style={{ fontSize: 'clamp(10px, 1vw, 12px)', color: '#6b7280' }}>
            <em>Supports cognitive re-entry and situational awareness (Endsley, 1995)</em>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {onReplayRange && (
              <Button
                variant="secondary"
                onClick={() => onReplayRange(minTs, maxTs)}
                style={{ fontSize: 'clamp(12px, 1.3vw, 14px)' }}
              >
                Replay This Period
              </Button>
            )}
            {onGoLive && (
              <Button
                variant="success"
                onClick={onGoLive}
                style={{ fontSize: 'clamp(12px, 1.3vw, 14px)' }}
              >
                Go Live →
              </Button>
            )}
            <Button
              variant="outline-primary"
              onClick={() => onClose(frozenEvents)}
              style={{ fontSize: 'clamp(12px, 1.3vw, 14px)' }}
            >
              Dismiss All
            </Button>
          </div>
        </Modal.Footer>
      </Modal>
    </>
  );
}
