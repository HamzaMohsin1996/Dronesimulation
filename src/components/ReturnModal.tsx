import { Modal, Button } from 'react-bootstrap';
import type { DetectionEvent } from '../shared/DetectionEvent';

type ReturnModalProps = {
  show: boolean;
  missedEvents: DetectionEvent[];
  reason: 'tab-switch' | 'out-of-focus' | 'idle' | null;
  onClose: (remaining: DetectionEvent[]) => void;
  onSelectEvent: (id: string) => void;
};

export default function ReturnModal({
  show,
  missedEvents,
  reason,
  onClose,
  onSelectEvent,
}: ReturnModalProps) {
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

  return (
    <Modal show={show} onHide={() => onClose(missedEvents)} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>{heading}</Modal.Title>
      </Modal.Header>

      <Modal.Body style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        <p style={{ marginBottom: 16 }}>{subText}</p>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {missedEvents
            .slice()
            .sort((a, b) => b.ts - a.ts)
            .map((e) => (
              <li
                key={e.id}
                onClick={() => {
                  // Highlight the selected event
                  onSelectEvent(e.id);

                  // Close modal and keep only the *other* missed events
                  onClose(missedEvents.filter(ev => ev.id !== e.id));
                }}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '12px 0',
                  borderBottom: '1px solid #e5e7eb',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 22, minWidth: 28 }}>
                  {e.label === 'fire'
                    ? '🔥'
                    : e.label === 'chemical'
                    ? '🧪'
                    : e.label === 'person'
                    ? '👥'
                    : '📸'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>
                    {e.label.charAt(0).toUpperCase() + e.label.slice(1)}
                  </div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>
                    {new Date(e.ts).toLocaleTimeString()}
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

      <Modal.Footer>
        <Button
          variant="primary"
          onClick={() => onClose(missedEvents)}
        >
          Dismiss All
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
