import React, { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';

export type VideoReviewHandle = {
  captureFrame: () => string | null;
  seekTo: (sec: number) => void;
  getCurrentTime: () => number;
  videoEl: HTMLVideoElement | null;
  seekAndPause: (sec: number) => void;
  highlightBox: (id: string | null) => void; // ✅ new
};

type DetectionEvent = {
  id: string;
  label: string;
  score: number;
  bbox: [number, number, number, number];
  thumbnail?: string;
  ts?: number;
};

type Props = {
  src: string;
  expanded: boolean;
  onToggle: () => void;
  style?: React.CSSProperties;
  events?: DetectionEvent[];
};

const VideoReview = forwardRef<VideoReviewHandle, Props>(
  ({ src, expanded, onToggle, style, events = [] }, ref) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const [hovered, setHovered] = useState<DetectionEvent | null>(null);
    const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);

    // 🔑 NEW: track which box should be highlighted externally
    const [highlightId, setHighlightId] = useState<string | null>(null);

    useEffect(() => {
      videoRef.current?.play().catch(() => {});
    }, []);

    useImperativeHandle(ref, () => ({
      captureFrame: () => {
        const v = videoRef.current;
        if (!v) return null;
        const c = document.createElement('canvas');
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(v, 0, 0, c.width, c.height);
        return c.toDataURL('image/png');
      },
      seekTo: (sec) => {
        if (videoRef.current) videoRef.current.currentTime = Math.max(0, sec);
      },
      seekAndPause: (sec) => {
        const v = videoRef.current;
        if (!v) return;
        const doSeek = () => {
          v.currentTime = Math.max(0, sec);
          v.pause();
        };
        if (v.readyState >= 1) doSeek();
        else v.addEventListener('loadedmetadata', doSeek, { once: true });
      },
      getCurrentTime: () => videoRef.current?.currentTime ?? 0,
      videoEl: videoRef.current,
      highlightBox: (id: string | null) => setHighlightId(id), // ✅ expose setter
    }));

    // 🎯 draw boxes each animation frame
    useEffect(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const draw = () => {
        const vw = video.videoWidth || 1;
        const vh = video.videoHeight || 1;
        const rw = canvas.clientWidth;
        const rh = canvas.clientHeight;

        if (canvas.width !== rw || canvas.height !== rh) {
          canvas.width = rw;
          canvas.height = rh;
        }

        ctx.clearRect(0, 0, rw, rh);

        events.forEach((ev) => {
          const [x1, y1, x2, y2] = ev.bbox;
          const scaleX = rw / vw;
          const scaleY = rh / vh;

          const w = (x2 - x1) * scaleX;
          const h = (y2 - y1) * scaleY;
          const left = x1 * scaleX;
          const top = y1 * scaleY;

          // ✅ normal boxes = green, highlighted = yellow & thicker
          const isHighlight = highlightId === ev.id;
          ctx.strokeStyle = isHighlight ? '#ffff00' : '#00ff00';
          ctx.lineWidth = isHighlight ? 4 : 2;
          ctx.fillStyle = isHighlight ? 'rgba(255,255,0,0.25)' : 'rgba(0,255,0,0.2)';

          ctx.fillRect(left, top, w, h);
          ctx.strokeRect(left, top, w, h);

          ctx.fillStyle = 'white';
          ctx.font = '12px sans-serif';
          ctx.fillText(`${ev.label} ${(ev.score * 100).toFixed(0)}%`, left + 4, top + 14);
        });

        requestAnimationFrame(draw);
      };

      requestAnimationFrame(draw);
    }, [events, highlightId]); // 🔑 depend on highlightId

    // 🔎 hover detection unchanged…
    useEffect(() => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      const handleMove = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const vw = video.videoWidth || 1;
        const vh = video.videoHeight || 1;
        const rw = canvas.clientWidth;
        const rh = canvas.clientHeight;
        const scaleX = rw / vw;
        const scaleY = rh / vh;

        const hit = events.find((ev) => {
          const [x1, y1, x2, y2] = ev.bbox;
          const left = x1 * scaleX;
          const top = y1 * scaleY;
          const width = (x2 - x1) * scaleX;
          const height = (y2 - y1) * scaleY;
          return x >= left && x <= left + width && y >= top && y <= top + height;
        });

        if (hit) {
          setHovered(hit);
          setPopupPos({ x: e.clientX, y: e.clientY });
        } else {
          setHovered(null);
          setPopupPos(null);
        }
      };

      const handleLeave = () => {
        setHovered(null);
        setPopupPos(null);
      };

      canvas.addEventListener('mousemove', handleMove);
      canvas.addEventListener('mouseleave', handleLeave);
      return () => {
        canvas.removeEventListener('mousemove', handleMove);
        canvas.removeEventListener('mouseleave', handleLeave);
      };
    }, [events]);

    return (
      <div
        style={{
          position: 'absolute',
          bottom: expanded ? 0 : 20,
          right: expanded ? 0 : 20,
          width: expanded ? '100%' : 250,
          height: expanded ? '100%' : 250,
          background: '#000',
          borderRadius: expanded ? 0 : 8,
          overflow: 'hidden',
          transition: 'all 0.3s ease',
          zIndex: expanded ? 99 : 1000,
          ...style,
        }}
      >
        <button
          onClick={onToggle}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'rgba(0,0,0,0.5)',
            border: 'none',
            borderRadius: 6,
            padding: 6,
            cursor: 'pointer',
            zIndex: 3100,
          }}
        >
          {expanded ? '✕' : '⤢'}
        </button>

        <video
          ref={videoRef}
          src={src}
          muted
          autoPlay
          loop
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />

        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            cursor: 'pointer',
          }}
        />

        {hovered && popupPos && (
          <div
            style={{
              position: 'fixed',
              top: popupPos.y + 12,
              left: popupPos.x + 12,
              background: 'rgba(0,0,0,0.85)',
              color: '#fff',
              padding: '8px 10px',
              borderRadius: 6,
              fontSize: 12,
              maxWidth: 240,
              zIndex: 4000,
              pointerEvents: 'none',
            }}
          >
            <strong>{hovered.label.toUpperCase()}</strong>
            <div>Confidence: {(hovered.score * 100).toFixed(1)}%</div>
            {hovered.ts && <div>Time: {new Date(hovered.ts).toLocaleTimeString()}</div>}
            {hovered.thumbnail && (
              <img
                src={hovered.thumbnail}
                alt="snapshot"
                style={{
                  marginTop: 6,
                  width: '100%',
                  borderRadius: 4,
                  objectFit: 'cover',
                }}
              />
            )}
          </div>
        )}
      </div>
    );
  }
);

export default VideoReview;
