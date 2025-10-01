import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { DetectionEvent } from '../shared/DetectionEvent';
import type { VideoReviewHandle } from './VideoReview';
import EventFilters from './EventFilters';
import './EventTimeline.css';

type Label = string;

/** NEW: optional range annotations + extra filter support */
type RangeAnnotation = {
  id: string;
  start: number; // ms
  end: number; // ms
  label: string;
  color?: string;
  description?: string;
  icon?: string; // emoji or short text glyph
};
type ExtraFilters = {
  query?: string; // free text (matches label/description)
  predicate?: (e: DetectionEvent) => boolean; // custom logic hook
};

type Props = {
  videoHandleRef: React.RefObject<VideoReviewHandle | null>;
  events: DetectionEvent[];
  startTs: number;
  filters: Set<Label>;
  onFilterChange: (next: Set<Label>) => void;
  initialWindowMin?: number;
  availableLabels: string[];

  /** NEW (all optional) */
  rangeAnnotations?: RangeAnnotation[];
  extraFilters?: ExtraFilters;
  onBrushChange?: (sel: { start: number; end: number } | null) => void;
  theme?: Partial<{
    background: string;
    markerColor: string;
    tickColor: string;
    bandColor: string;
  }>;
};

export default function EventTimeline({
  videoHandleRef,
  events,
  startTs,
  filters,
  onFilterChange,
  initialWindowMin = 5,
  availableLabels,
  rangeAnnotations = [],
  extraFilters,
  onBrushChange,
  theme,
}: Props) {
  const [now, setNow] = useState(Date.now());
  const [timeHover, setTimeHover] = useState<{ x: number; ms: number } | null>(null);
  const [hoverCluster, setHoverCluster] = useState<{ x: number; events: DetectionEvent[] } | null>(
    null
  );

  /** track <video> play/pause */
  const [isPlaying, setIsPlaying] = useState(true);

  /** live clock */
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  /** keep state in sync with actual <video> element */
  useEffect(() => {
    const videoEl = videoHandleRef.current?.videoEl;
    if (!videoEl) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const capture = () => {
      if (!ctx) return;
      const sec = Math.floor(videoEl.currentTime);
      setFrameCache((prev) => {
        if (prev.has(sec)) return prev;
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        const next = new Map(prev);
        next.set(sec, dataUrl);
        return next;
      });
    };

    const id = setInterval(capture, 1000);
    return () => clearInterval(id);
  }, [videoHandleRef.current?.videoEl?.src]);

  /** timeline window */
  const minWindow = 60_000;
  const [viewStart, setViewStart] = useState(startTs);
  const [viewEnd, setViewEnd] = useState(startTs + initialWindowMin * 60_000);
  useEffect(() => {
    if (now > viewEnd) setViewEnd(now);
  }, [now, viewEnd]);

  /** px↔time mapping */
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = useState(600);
  useEffect(() => {
    if (!trackRef.current) return;
    const ro = new ResizeObserver((e) => setTrackWidth(Math.max(280, e[0].contentRect.width)));
    ro.observe(trackRef.current);
    return () => ro.disconnect();
  }, []);

  const msToX = (ms: number) => {
    const pct = (ms - viewStart) / Math.max(1, viewEnd - viewStart);
    return Math.max(0, Math.min(1, pct)) * trackWidth;
  };

  const xToMs = (x: number, rectWidth: number) =>
    viewStart + (x / Math.max(1, rectWidth)) * (viewEnd - viewStart);

  const [reviewMs, setReviewMs] = useState<number | null>(null);

  /** filter & cluster (ENHANCED) */
  const textMatch = (s: string, q: string) => s.toLowerCase().includes(q.toLowerCase());
  const filtered = useMemo(() => {
    const q = extraFilters?.query?.trim();
    return events.filter((e) => {
      const byLabel = filters.size === 0 || filters.has(e.label as Label);
      const byQuery =
        !q || textMatch(e.label ?? '', q) || textMatch((e as any).description ?? '', q);
      const byPred = extraFilters?.predicate ? extraFilters.predicate(e) : true;
      return byLabel && byQuery && byPred;
    });
  }, [events, filters, extraFilters]);

  /** cluster within 1s buckets per label (same as yours) */
  const bucketMs = 1000;
  const clusters = useMemo(() => {
    const map = new Map<string, { ts: number; label: Label; list: DetectionEvent[] }>();
    filtered
      .filter((e) => e.ts >= viewStart && e.ts <= viewEnd)
      .forEach((ev) => {
        const keyTs = Math.round(ev.ts / bucketMs) * bucketMs;
        const key = `${keyTs}-${ev.label}`;
        const entry = map.get(key) ?? { ts: keyTs, label: ev.label, list: [] };
        entry.list.push(ev);
        map.set(key, entry);
      });
    return [...map.values()].sort((a, b) => a.ts - b.ts);
  }, [filtered, viewStart, viewEnd]);

  // keep a map: second -> captured dataURL
  const [frameCache, setFrameCache] = useState<Map<number, string>>(new Map());

  // How long the mission has been running
  const [missionMs, setMissionMs] = useState(Date.now() - startTs);

  useEffect(() => {
    const id = setInterval(() => setMissionMs(Date.now() - startTs), 1000);
    return () => clearInterval(id);
  }, [startTs]);

  useEffect(() => {
    const videoEl = videoHandleRef.current?.videoEl;
    if (!videoEl) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const capture = () => {
      const wallSec = Math.floor((Date.now() - startTs) / 1000);
      if (!frameCache.has(wallSec)) {
        if (!ctx) return;
        // draw the current video frame into a canvas
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        setFrameCache((prev) => new Map(prev).set(wallSec, dataUrl));
      }
    };

    const id = setInterval(capture, 1000); // grab a frame every second
    return () => clearInterval(id);
  }, [videoHandleRef]);

  /** stack markers */
  function allocateLanes(points: { x: number }[], minGap = 12) {
    const lanes: number[] = [];
    return points.map((p) => {
      let lane = 0;
      while (lane < lanes.length && Math.abs(p.x - lanes[lane]) < minGap) lane++;
      lanes[lane] = p.x;
      return lane;
    });
  }
  const clusterPoints = clusters.map((c) => ({ x: msToX(c.ts), cluster: c }));
  const laneNumbers = allocateLanes(clusterPoints);
  const laneCount = laneNumbers.length ? Math.max(...laneNumbers) + 1 : 1;

  /** dynamic container height */
  const basePadding = 56; // + toolbar & labels
  const perLaneHeight = 24;
  const containerHeight = basePadding + laneCount * perLaneHeight + 56; // + heatmap

  /** ticks (smarter steps by window size) */
  const windowMs = viewEnd - viewStart;
  let smallStep = 1000;
  let bigStep = 60_000;
  if (windowMs > 10 * 60_000) smallStep = 5_000;
  if (windowMs > 30 * 60_000) smallStep = 10_000;
  if (windowMs > 2 * 60 * 60_000) {
    smallStep = 60_000;
    bigStep = 5 * 60_000;
  }
  if (windowMs > 24 * 60 * 60_000) {
    smallStep = 5 * 60_000;
    bigStep = 60 * 60_000;
  }
  const ticks: { t: number; big: boolean }[] = [];
  const first = Math.ceil(viewStart / smallStep) * smallStep;
  for (let t = first; t <= viewEnd; t += smallStep) {
    ticks.push({ t, big: t % bigStep === 0 });
  }
  const [playbackMs, setPlaybackMs] = useState(startTs);

  useEffect(() => {
    const id = setInterval(() => {
      // mission time = wall clock now minus when mission started
      setPlaybackMs(Date.now());
    }, 200);
    return () => clearInterval(id);
  }, []);

  /** seek helper */
  const seekTo = (ms: number, pause = false) => {
    const api = videoHandleRef.current;
    if (!api) return;
    api.seekTo((ms - startTs) / 1000);
    if (pause && api.videoEl && !api.videoEl.paused) api.videoEl.pause();
  };

  /** play / pause toggle */
  const togglePlayback = () => {
    const el = videoHandleRef.current?.videoEl;
    if (!el) return;
    el.paused ? el.play() : el.pause();
  };

  /** go live → jump to “now” and play */
  const goLive = () => {
    const api = videoHandleRef.current;
    if (!api?.videoEl) return;
    api.seekTo((Date.now() - startTs) / 1000);
    api.videoEl.play();
  };

  const defaultIcon = (l: Label) =>
    l === 'fire' ? '🔥' : l === 'chemical' ? '🧪' : l === 'person' ? '👥' : '📸';

  /** NEW: zoom + pan state for drag/brush */
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ msAtDown: number; rectLeft: number; rectWidth: number } | null>(
    null
  );

  const [brush, setBrush] = useState<{ x0: number; x1: number } | null>(null);

  /** wheel / pinch zoom (with cursor as anchor) */
  const onWheelZoom = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const anchorX = e.clientX - rect.left;
    const center = xToMs(anchorX, rect.width);

    // pinch-zoom support (ctrl/cmd or trackpad pinch often sets ctrlKey)
    const direction = e.deltaY > 0 ? 1.15 : 0.85;
    const newSpan = Math.max(minWindow, (viewEnd - viewStart) * direction);

    const leftFrac = (center - viewStart) / (viewEnd - viewStart || 1);
    const rightFrac = 1 - leftFrac;

    const nextStart = center - newSpan * leftFrac;
    const nextEnd = center + newSpan * rightFrac;
    setViewStart(nextStart);
    setViewEnd(nextEnd);
  };

  /** drag-to-pan and shift+drag brush selection */
  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    if (e.shiftKey) {
      setBrush({ x0: e.clientX - rect.left, x1: e.clientX - rect.left });
      return;
    }
    setIsPanning(true);
    panStartRef.current = {
      msAtDown: xToMs(e.clientX - rect.left, rect.width),
      rectLeft: rect.left,
      rectWidth: rect.width,
    };
  };
  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const ms = xToMs(px, rect.width);
    setTimeHover({ x: px, ms });

    if (brush) {
      setBrush((b) => (b ? { x0: b.x0, x1: px } : null));
      return;
    }
    if (isPanning && panStartRef.current) {
      const atDown = panStartRef.current.msAtDown;
      const msNow = ms;
      const delta = msNow - atDown;
      setViewStart((s) => s - delta);
      setViewEnd((e2) => e2 - delta);
    }
  };
  const onMouseUpLeave = () => {
    setIsPanning(false);
    panStartRef.current = null;
    if (brush && trackRef.current) {
      const rect = trackRef.current.getBoundingClientRect();
      const selStart = xToMs(Math.min(brush.x0, brush.x1), rect.width);
      const selEnd = xToMs(Math.max(brush.x0, brush.x1), rect.width);
      setViewStart(selStart);
      setViewEnd(Math.max(selStart + minWindow, selEnd));
      onBrushChange?.({ start: selStart, end: selEnd });
      setBrush(null);
    }
  };

  /** keyboard: ←/→ pan, +/- zoom, space play/pause, G live */
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === 'INPUT') return;
      const span = viewEnd - viewStart;
      if (e.key === 'ArrowLeft') {
        setViewStart(viewStart - span * 0.2);
        setViewEnd(viewEnd - span * 0.2);
      }
      if (e.key === 'ArrowRight') {
        setViewStart(viewStart + span * 0.2);
        setViewEnd(viewEnd + span * 0.2);
      }
      if (e.key === '+' || e.key === '=') {
        const mid = (viewStart + viewEnd) / 2,
          newSpan = Math.max(minWindow, span * 0.8);
        setViewStart(mid - newSpan / 2);
        setViewEnd(mid + newSpan / 2);
      }
      if (e.key === '-' || e.key === '_') {
        const mid = (viewStart + viewEnd) / 2,
          newSpan = span * 1.25;
        setViewStart(mid - newSpan / 2);
        setViewEnd(mid + newSpan / 2);
      }
      if (e.key === ' ') {
        e.preventDefault();
        togglePlayback();
      }
      if (e.key.toLowerCase() === 'g') goLive();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [viewStart, viewEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  /** pattern-of-life mini heatmap (by hour, for currently filtered dataset) */
  const hourBuckets = useMemo(() => {
    const arr = Array(24).fill(0);
    filtered.forEach((e) => {
      arr[new Date(e.ts).getHours()]++;
    });
    const max = Math.max(1, ...arr);
    return { arr, max };
  }, [filtered]);

  return (
    <div
      className="tl-container"
      style={{
        minHeight: `${containerHeight}px`,
        ...(theme?.background ? { ['--tl-bg' as any]: theme.background } : {}),
        ...(theme?.markerColor ? { ['--tl-marker' as any]: theme.markerColor } : {}),
        ...(theme?.tickColor ? { ['--tl-tick' as any]: theme.tickColor } : {}),
        ...(theme?.bandColor ? { ['--tl-band' as any]: theme.bandColor } : {}),
      }}
    >
      {/* Toolbar */}
      <div className="tl-toolbar">
        <div className="tl-toolbar-left g">
          {/* pan left/right (fallback) */}
          {/* <button
            className="tl-btn"
            title="Pan left"
            onClick={() => {
              const w = viewEnd - viewStart;
              setViewStart(Math.max(startTs, viewStart - w * 0.3));
              setViewEnd(Math.max(startTs + minWindow, viewEnd - w * 0.3));
            }}
          >
            ⟵
          </button>
          <button
            className="tl-btn"
            title="Pan right"
            onClick={() => {
              const w = viewEnd - viewStart;
              setViewStart(viewStart + w * 0.3);
              setViewEnd(viewEnd + w * 0.3);
            }}
          >
            ⟶
          </button> */}

          {/* zoom */}
          <button
            className="tl-btn"
            title="Zoom in (+)"
            onClick={() => {
              const mid = (viewStart + viewEnd) / 2;
              const w = Math.max(minWindow, (viewEnd - viewStart) * 0.8);
              setViewStart(mid - w / 2);
              setViewEnd(mid + w / 2);
            }}
          >
            ＋
          </button>
          <button
            className="tl-btn"
            title="Zoom out (-)"
            onClick={() => {
              const mid = (viewStart + viewEnd) / 2;
              const w = (viewEnd - viewStart) * 1.25;
              setViewStart(mid - w / 2);
              setViewEnd(mid + w / 2);
            }}
          >
            －
          </button>

          {/* Play / Pause */}
          <button className="tl-btn" onClick={togglePlayback} title="Space">
            {isPlaying ? '⏸' : '▶️'}
          </button>

          {/* Go Live */}
          <button className="tl-btn" onClick={goLive} title="G">
            🔴 Live
          </button>
        </div>

        <div className="tl-toolbar-right">
          {/* NEW: quick text filter */}
          {/* <input
            className="tl-search"
            placeholder="Filter… (label/description)"
            defaultValue={extraFilters?.query ?? ''}
            onChange={(e) => {
              // let parent control this via extraFilters if desired
              extraFilters && (extraFilters.query = e.target.value);
            }}
          /> */}
          {/* build the dropdown from labels we actually have */}
          <select
            value={filters.size === 0 ? 'all' : [...filters][0]}
            onChange={(e) => {
              const val = e.target.value;
              onFilterChange(val === 'all' ? new Set(availableLabels) : new Set<Label>([val]));
            }}
          >
            <option value="all">All</option>
            {availableLabels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>

          <div className="tl-clock">{new Date(now).toLocaleTimeString()}</div>
        </div>
      </div>

      {/* Pattern-of-life mini heatmap */}
      <div className="tl-heatmap">
        {hourBuckets.arr.map((v, hr) => (
          <div
            key={hr}
            className="tl-heatcell"
            title={`${hr.toString().padStart(2, '0')}:00 — ${v} events`}
            style={{ opacity: v === 0 ? 0.1 : 0.2 + 0.8 * (v / hourBuckets.max) }}
          >
            {hr}
          </div>
        ))}
      </div>

      {/* Timeline Track */}
      <div className="tl-track-wrap">
        <div
          ref={trackRef}
          className="tl-track"
          style={{ minHeight: `${laneCount * 24 + 24}px` }}
          onWheel={onWheelZoom}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUpLeave}
          onMouseLeave={onMouseUpLeave}
          onClick={(e) => {
            if (!trackRef.current) return;
            const r = trackRef.current.getBoundingClientRect();
            const ms = xToMs(e.clientX - r.left, r.width);
            setReviewMs(ms);
            videoHandleRef.current?.seekAndPause((ms - startTs) / 1000);
          }}
        >
          {/* background bands for range annotations */}
          {rangeAnnotations
            .filter((a) => a.end >= viewStart && a.start <= viewEnd)

            .map((a) => {
              const left = msToX(a.start);
              const width = Math.max(2, msToX(a.end) - left);
              return (
                <div
                  key={`band-${a.id}`}
                  className="tl-band"
                  title={a.description || a.label}
                  style={{
                    left,
                    width,
                    background: a.color || 'var(--tl-band)',
                  }}
                >
                  {a.icon ? <span className="tl-band-icon">{a.icon}</span> : null}
                  <span className="tl-band-label">{a.label}</span>
                </div>
              );
            })}

          {/* progress and playhead */}
          <div className="tl-playhead" style={{ left: `${msToX(Date.now())}px` }} />
          <div className="tl-progress-fill" style={{ width: `${msToX(Date.now())}px` }} />

          {/* LIVE scanning bar – always up to current wall clock */}
          <div
            className="tl-live-fill"
            style={{
              left: `${msToX(startTs)}px`,
              width: `${msToX(Math.min(now, viewEnd)) - msToX(startTs)}px`,
            }}
          />

          {/* ticks */}
          {ticks.map(({ t, big }) => (
            <div
              key={`tick-${t}`}
              className={`tl-tick ${big ? 'big' : 'small'}`}
              style={{ left: `${msToX(t)}px` }}
            />
          ))}
          {ticks
            .filter((tk) => tk.big)
            .map(({ t }) => (
              <div key={`label-${t}`} className="tl-tick-label" style={{ left: `${msToX(t)}px` }}>
                {new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            ))}

          {/* event markers */}
          {clusterPoints.map((cp, i) => {
            const c = cp.cluster;
            const lane = laneNumbers[i];
            const count = c.list.length;
            const icon = (c.list[0] as any).icon || defaultIcon(c.label);
            const title =
              count > 1
                ? `${count} ${c.label} events @ ${new Date(c.ts).toLocaleTimeString()}`
                : `${c.label} @ ${new Date(c.ts).toLocaleTimeString()}`;
            return (
              <button
                key={`${c.ts}-${c.label}-${i}`}
                className={`tl-marker${count > 1 ? ' tl-marker-cluster' : ''}`}
                title={title}
                style={{ left: `${cp.x}px`, top: `${lane * 18}px` }}
                onClick={(e) => {
                  e.stopPropagation();
                  seekTo(c.ts, true);
                }}
                onMouseEnter={(e) => {
                  e.stopPropagation();
                  setHoverCluster({ x: cp.x, events: c.list });
                }}
                onMouseLeave={() => setHoverCluster(null)}
              >
                {icon}
                {count > 1 && <span className="tl-badge">+{count}</span>}
              </button>
            );
          })}

          {/* hover tooltip (time) */}
          {timeHover && (
            <div
              className="tl-hover-preview"
              style={{ left: Math.min(trackWidth - 160, Math.max(0, timeHover.x - 80)) }}
              onMouseLeave={() => setTimeHover(null)}
            >
              {(() => {
                const sec = Math.floor((timeHover.ms - startTs) / 1000);
                const url = frameCache.get(sec);
                return url ? (
                  <img
                    src={url}
                    alt="preview"
                    width={160}
                    height={90}
                    className="tl-hover-preview-img"
                  />
                ) : (
                  <div className="tl-hover-preview-placeholder">No frame yet</div>
                );
              })()}
              <div className="tl-hover-preview-time">
                {new Date(timeHover.ms).toLocaleTimeString()}
              </div>
            </div>
          )}
          {reviewMs !== null && (
            <>
              {/* <div className="tl-review-fill" style={{ width: `${msToX(reviewMs)}px` }} /> */}
              <div className="tl-review-head" style={{ left: `${msToX(reviewMs)}px` }} />
            </>
          )}

          {/* rich cluster tooltip with description support */}
          {hoverCluster && (
            <div
              className="tl-tooltip tl-tooltip-details"
              style={{ left: Math.min(trackWidth - 240, Math.max(0, hoverCluster.x - 120)) }}
              role="dialog"
              aria-label="Incident details"
            >
              {hoverCluster.events.map((ev) => (
                <div key={ev.id} className="tl-tooltip-event">
                  <div>
                    <strong>{ev.label.toUpperCase()}</strong>
                    {(ev as any).description && (
                      <div className="tl-context">{(ev as any).description}</div>
                    )}
                    <div className="tl-ts">{new Date(ev.ts).toLocaleTimeString()}</div>
                  </div>
                  {ev.thumbnail ? (
                    <img
                      src={ev.thumbnail}
                      alt={`${ev.label} snapshot`}
                      className="tl-tooltip-img"
                    />
                  ) : (
                    <div className="tl-tooltip-placeholder">No image</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* brush overlay */}
          {brush && (
            <div
              className="tl-brush"
              style={{
                left: Math.min(brush.x0, brush.x1),
                width: Math.abs(brush.x1 - brush.x0),
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
