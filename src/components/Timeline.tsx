import React from 'react';
import type { DetectionEvent } from '../shared/drone';

type Props = {
  startMs: number;
  endMs: number;
  events: DetectionEvent[];
  reviewMode: boolean;
  unread: number;
  onToggleReview: () => void;
  onChangeWindow: (from: number, to: number) => void;
  // NEW: let the parent jump the map / marker when a tick is clicked
  onSelectEvent?: (ev: DetectionEvent) => void;
  onSeekRelative?: (deltaSec: number) => void;
  canSeekForward?: boolean;
};

// --- helpers ----------------------------------------------------
const fmt = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const colorFor = (label: string) => {
  const l = label.toLowerCase();
  if (l.includes('fire')) return '#ff3b30';
  if (l.includes('person') || l.includes('people')) return '#0a84ff';
  if (l.includes('chemical') || l.includes('hazmat')) return '#ffd60a';
  return '#6e6e73'; // default
};

const iconFor = (label: string) => {
  const l = label.toLowerCase();
  if (l.includes('fire')) return '🔥';
  if (l.includes('person') || l.includes('people')) return '👤';
  if (l.includes('chemical') || l.includes('hazmat')) return '🧪';
  return '•';
};

// ---------------------------------------------------------------

export default function Timeline({
  startMs,
  endMs,
  events,
  reviewMode,
  unread,
  onToggleReview,
  onChangeWindow,
  onSelectEvent,
  onSeekRelative,
  canSeekForward,
}: Props) {
  // local state mirrors props so the sliders feel responsive
  const [from, setFrom] = React.useState(startMs);
  const [to, setTo] = React.useState(endMs);

  // filters by label (auto-built from the incoming events)
  const uniqueLabels = React.useMemo(
    () => Array.from(new Set(events.map((e) => e.label.toLowerCase()))),
    [events]
  );
  const [filters, setFilters] = React.useState<Record<string, boolean>>({});

  // init / refresh
  React.useEffect(() => {
    setFrom(startMs);
    setTo(endMs);
  }, [startMs, endMs]);

  // init filters when labels change (default: all on)
  React.useEffect(() => {
    setFilters((prev) => {
      const next: Record<string, boolean> = { ...prev };
      uniqueLabels.forEach((l) => {
        if (typeof next[l] === 'boolean') return;
        next[l] = true;
      });
      // remove stale keys not present anymore
      Object.keys(next).forEach((k) => {
        if (!uniqueLabels.includes(k)) delete next[k];
      });
      return next;
    });
  }, [uniqueLabels]);

  const min = Math.min(from, to);
  const max = Math.max(from, to);
  const trackMin = Math.min(startMs, endMs);
  const trackMax = Math.max(startMs, endMs);
  const trackSpan = Math.max(1, trackMax - trackMin);
  const selSpan = Math.max(1, max - min);

  const filtered = events.filter((e) => filters[e.label.toLowerCase()] !== false);
  const ticks = filtered.map((e, i) => {
    const leftPct = ((e.ts - trackMin) / trackSpan) * 100;
    const inSel = e.ts >= min && e.ts <= max;
    return {
      key: e.id ?? String(i),
      left: Math.max(0, Math.min(100, leftPct)),
      label: e.label,
      ts: e.ts,
      inSel,
      ev: e, // keep the full event to return on click
      row: i % 2, // small stagger row
    };
  });

  const commit = () => onChangeWindow(min, max);

  // prev/next helpers within filtered events
  const prevEvent = () => {
    const before = filtered
      .map((e) => e.ts)
      .filter((t) => t < min)
      .sort((a, b) => b - a)[0];
    if (before) {
      const width = selSpan; // keep same window width
      const newFrom = before;
      const newTo = before + width;
      setFrom(newFrom);
      setTo(newTo);
      onChangeWindow(newFrom, newTo);
    }
  };
  const nextEvent = () => {
    const after = filtered
      .map((e) => e.ts)
      .filter((t) => t > max)
      .sort((a, b) => a - b)[0];
    if (after) {
      const width = selSpan;
      const newTo = after;
      const newFrom = after - width;
      setFrom(newFrom);
      setTo(newTo);
      onChangeWindow(newFrom, newTo);
    }
  };

  const zoom = (factor: number) => {
    const center = (min + max) / 2;
    const half = ((max - min) / 2) * factor;
    const newFrom = Math.max(trackMin, center - half);
    const newTo = Math.min(trackMax, center + half);
    setFrom(newFrom);
    setTo(newTo);
    onChangeWindow(newFrom, newTo);
  };

  const handleTickActivate = (ev: DetectionEvent) => {
    onSelectEvent?.(ev);
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: 24,
        right: 24,
        bottom: 16,
        zIndex: 3000,
        pointerEvents: 'auto',
      }}
      aria-label="Mission timeline"
    >
      <div
        style={{
          margin: '0 auto',
          maxWidth: 1100,
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 -10px 30px rgba(0,0,0,0.15)',
          border: '1px solid #e8e8e8',
          padding: '12px 16px',
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 10,
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={onToggleReview}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #d0d0d0',
              background: reviewMode ? '#111' : '#fff',
              color: reviewMode ? '#fff' : '#111',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            aria-pressed={reviewMode}
            title={reviewMode ? 'Back to live view' : 'Enter review mode'}
          >
            {reviewMode ? 'Back to Live' : 'Review'}
            {!reviewMode && unread > 0 && (
              <span
                style={{
                  marginLeft: 8,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: '#ff3b30',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {unread}
              </span>
            )}
          </button>

          {/* Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {uniqueLabels.map((l) => {
              const active = filters[l] !== false;
              return (
                <button
                  key={l}
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      [l]: !(f[l] !== false), // toggle
                    }))
                  }
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 999,
                    border: `1px solid ${active ? colorFor(l) : '#d0d0d0'}`,
                    background: active ? `${colorFor(l)}22` : '#fff',
                    color: '#111',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                  title={active ? `Hide ${l}` : `Show ${l}`}
                >
                  <span>{iconFor(l)}</span>
                  <span style={{ textTransform: 'capitalize' }}>{l}</span>
                </button>
              );
            })}
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => onSeekRelative?.(-120)} // back 2 min
              style={btnStyle}
              title="Back 2 min"
            >
              ⏪ -2m
            </button>

            <button
              onClick={() => onSeekRelative?.(30)} // forward 30s (only if allowed)
              style={{
                ...btnStyle,
                opacity: canSeekForward ? 1 : 0.3,
                pointerEvents: canSeekForward ? 'auto' : 'none',
              }}
              title="Forward 30s"
            >
              +30s ⏩
            </button>

            <button onClick={() => zoom(0.8)} title="Zoom in" style={btnStyle} aria-label="Zoom in">
              ⤢
            </button>
            <button
              onClick={() => zoom(1.25)}
              title="Zoom out"
              style={btnStyle}
              aria-label="Zoom out"
            >
              ⤡
            </button>
            <div style={{ width: 8 }} />
            <button onClick={prevEvent} title="Previous event" style={btnStyle}>
              ◀ Prev
            </button>
            <button onClick={nextEvent} title="Next event" style={btnStyle}>
              Next ▶
            </button>
          </div>
        </div>

        {/* Track */}
        <div style={{ position: 'relative', height: 64 }}>
          {/* full track */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 28,
              height: 8,
              background: '#eee',
              borderRadius: 4,
            }}
          />

          {/* selected window highlight */}
          <div
            style={{
              position: 'absolute',
              top: 24,
              height: 16,
              left: `${((min - trackMin) / trackSpan) * 100}%`,
              width: `${(selSpan / trackSpan) * 100}%`,
              background: 'linear-gradient(180deg, rgba(10,132,255,0.18), rgba(10,132,255,0.12))',
              border: '1px solid #0a84ff',
              borderRadius: 6,
              pointerEvents: 'none',
            }}
          />

          {/* event ticks (clickable) */}
          {/* event ticks (clickable) */}
          {ticks.map((t) => (
            <div
              key={t.key}
              style={{
                position: 'absolute',
                top: 20 + t.row * 6,
                left: `calc(${t.left}% - 6px)`,
              }}
            >
              <button
                onClick={() => handleTickActivate(t.ev)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleTickActivate(t.ev);
                  }
                }}
                title={`${iconFor(t.label)} ${t.label.toUpperCase()} – ${fmt(t.ts)}`}
                style={{
                  width: 12,
                  height: 24,
                  borderRadius: 3,
                  background: colorFor(t.label),
                  opacity: t.inSel ? 1 : 0.35,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                  border: 'none',
                  cursor: 'pointer',
                }}
                aria-label={`${t.label} at ${fmt(t.ts)}`}
              />
              {t.ev.thumbnail && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '120%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#fff',
                    border: '1px solid #ccc',
                    borderRadius: 6,
                    padding: 4,
                    display: 'none',
                  }}
                  className="timeline-thumb"
                >
                  <img src={t.ev.thumbnail} alt="snapshot" width={120} />
                </div>
              )}
            </div>
          ))}

          {/* dual sliders overlayed - keep the simple mechanism but polish the UI */}
          <input
            type="range"
            min={trackMin}
            max={trackMax}
            step={10_000}
            value={from}
            onChange={(e) => setFrom(Number(e.target.value))}
            onMouseUp={commit}
            onTouchEnd={commit}
            style={rangeStyle}
            aria-label="From time"
          />
          <input
            type="range"
            min={trackMin}
            max={trackMax}
            step={10_000}
            value={to}
            onChange={(e) => setTo(Number(e.target.value))}
            onMouseUp={commit}
            onTouchEnd={commit}
            style={rangeStyle}
            aria-label="To time"
          />

          {/* time labels */}
          <div
            style={{
              position: 'absolute',
              left: `${((min - trackMin) / trackSpan) * 100}%`,
              top: 0,
              transform: 'translateX(-50%)',
              fontSize: 12,
              color: '#555',
            }}
          >
            {fmt(min)}
          </div>
          <div
            style={{
              position: 'absolute',
              left: `${((max - trackMin) / trackSpan) * 100}%`,
              top: 0,
              transform: 'translateX(-50%)',
              fontSize: 12,
              color: '#555',
            }}
          >
            {fmt(max)}
          </div>
        </div>
      </div>
    </div>
  );
}

// small shared button style
const btnStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid #d0d0d0',
  background: '#fff',
  cursor: 'pointer',
  fontWeight: 600,
  color: '#111',
};

// make the native slider unobtrusive while keeping accessibility
const rangeStyle: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 20,
  width: '100%',
  WebkitAppearance: 'none',
  appearance: 'none',
  background: 'transparent',
  height: 0,
};
