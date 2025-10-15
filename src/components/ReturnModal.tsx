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

// 🔹 event icon mapping
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

// 🔹 confidence color mapping
const getColor = (score?: number) => {
  if (score == null) return '#9ca3af';
  if (score > 0.8) return '#16a34a';
  if (score > 0.6) return '#ca8a04';
  return '#dc2626';
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
  const [hoverEventId, setHoverEventId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  useEffect(() => {
    if (show) {
      setFrozenEvents(missedEvents);
      setHoverEventId(null);
    }
  }, [show, missedEvents]);

  // ✅ Reliable manual scroll adjustment
  useEffect(() => {
    if (hoverEventId) {
      const target = document.getElementById(`event-${hoverEventId}`);
      const container = document.querySelector('.modal-body');
      if (target && container instanceof HTMLElement) {
        const targetOffset = target.offsetTop - container.offsetTop - 70; // sticky header offset
        container.scrollTo({
          top: targetOffset,
          behavior: 'smooth',
        });

        // visual flash
        setFlashId(hoverEventId);
        const t = setTimeout(() => setFlashId(null), 900);
        return () => clearTimeout(t);
      }
    }
  }, [hoverEventId]);

  if (!show || !frozenEvents.length) return null;

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

  const styles = `
    @keyframes pulseGlow {
      0% { box-shadow: 0 0 0 0 rgba(22,163,74,0.6); }
      70% { box-shadow: 0 0 0 0.6em rgba(22,163,74,0); }
      100% { box-shadow: 0 0 0 0 rgba(22,163,74,0); }
    }
    @keyframes flashRow {
      0% { background-color: rgba(34,197,94,0.3); }
      100% { background-color: transparent; }
    }
  `;

  return (
    <>
      <style>{styles}</style>
      <Modal show={show} onHide={() => onClose(frozenEvents)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{heading}</Modal.Title>
        </Modal.Header>

        <Modal.Body
          className="modal-body"
          style={{
            maxHeight: '70vh',
            overflowY: 'auto',
            position: 'relative',
            background: '#fff',
          }}
        >
          <p style={{ marginBottom: 6, color: '#6b7280' }}>{subText}</p>
          <p style={{ marginBottom: 10, fontStyle: 'italic', color: '#9ca3af' }}>
            Events occurred between <strong>{new Date(minTs).toLocaleTimeString()}</strong> and{' '}
            <strong>{new Date(maxTs).toLocaleTimeString()}</strong>.
          </p>

          {/* 🧭 Sticky timeline / tab bar */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              background: '#f9fafb', // new tab-like color
              borderRadius: 8,
              padding: '10px 6px 14px',
              marginBottom: 10,
              boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
              border: '1px solid #e5e7eb',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                overflowX: 'auto',
                scrollbarWidth: 'thin',
                gap: 6,
                padding: '4px 2px',
              }}
            >
              {sorted.map((e) => {
                const isHovered = hoverEventId === e.id;
                const isLatest = e.ts === maxTs;
                return (
                  <div
                    key={e.id}
                    onMouseEnter={() => setHoverEventId(e.id)}
                    onMouseLeave={() => setHoverEventId(null)}
                    style={{ flex: '0 0 auto', textAlign: 'center', position: 'relative' }}
                  >
                    <div
                      style={{
                        fontSize: 20,
                        cursor: 'pointer',
                        color: getColor(e.score),
                        transform: isHovered ? 'scale(1.25)' : 'scale(1)',
                        transition: 'transform 0.2s ease',
                        animation: isLatest ? 'pulseGlow 2s infinite' : 'none',
                      }}
                    >
                      {iconFor(e.label)}
                    </div>
                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                      {new Date(e.ts).toLocaleTimeString().split(':').slice(0, 2).join(':')}
                    </div>
                    {isHovered && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: '50%',
                          width: 2,
                          height: 28,
                          background: '#9ca3af',
                          transform: 'translateX(-50%)',
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 10,
                color: '#6b7280',
                marginTop: 4,
              }}
            >
              <span>{new Date(minTs).toLocaleTimeString()}</span>
              <span>{new Date(midTs).toLocaleTimeString()}</span>
              <span>{new Date(maxTs).toLocaleTimeString()}</span>
            </div>
          </div>

          {/* 🧩 Event list */}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {sorted.map((e, i) => (
              <li
                key={e.id}
                id={`event-${e.id}`}
                onClick={() => {
                  onSelectEvent(e.id);
                  onClose(frozenEvents.filter((ev) => ev.id !== e.id));
                }}
                onMouseEnter={() => setHoverEventId(e.id)}
                onMouseLeave={() => setHoverEventId(null)}
                style={{
                  display: 'flex',
                  gap: 10,
                  paddingTop: i === 0 ? '20px' : '10px', // extra padding for first
                  paddingBottom: i === sorted.length - 1 ? '20px' : '10px', // extra padding for last
                  borderBottom: '1px solid #e5e7eb',
                  cursor: 'pointer',
                  background:
                    flashId === e.id
                      ? 'rgba(34,197,94,0.25)'
                      : hoverEventId === e.id
                      ? 'rgba(34,197,94,0.08)'
                      : 'transparent',
                  animation: flashId === e.id ? 'flashRow 1s ease' : 'none',
                }}
              >
                <div style={{ fontSize: 20 }}>{iconFor(e.label)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>
                    {e.label.charAt(0).toUpperCase() + e.label.slice(1)}
                  </div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>
                    {new Date(e.ts).toLocaleTimeString()} •{' '}
                    {e.score != null && (
                      <span style={{ color: getColor(e.score), fontWeight: 500 }}>
                        {Math.round(e.score * 100)}% confidence
                      </span>
                    )}
                  </div>
                  {e.thumbnail && (
                    <img
                      src={e.thumbnail}
                      alt="snapshot"
                      style={{
                        marginTop: 6,
                        maxWidth: '100%',
                        borderRadius: 6,
                        boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                      }}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Modal.Body>

        <Modal.Footer style={{ justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 8 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            <em>Supports cognitive re-entry and situational awareness (Endsley, 1995)</em>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {onReplayRange && (
              <Button variant="secondary" onClick={() => onReplayRange(minTs, maxTs)}>
                Replay This Period
              </Button>
            )}
            {onGoLive && (
              <Button variant="success" onClick={onGoLive}>
                Go Live →
              </Button>
            )}
            <Button variant="outline-primary" onClick={() => onClose(frozenEvents)}>
              Dismiss All
            </Button>
          </div>
        </Modal.Footer>
      </Modal>
    </>
  );
}
