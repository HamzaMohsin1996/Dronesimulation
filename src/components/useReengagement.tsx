import { useEffect, useRef, useState } from 'react';
import type { DetectionEvent } from '../shared/DetectionEvent';

export function useReengagement(events: DetectionEvent[]) {
  const [isIdle, setIsIdle] = useState(false);
  const [missedEvents, setMissedEvents] = useState<DetectionEvent[]>([]);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [awayReason, setAwayReason] = useState<'tab-switch' | 'out-of-focus' | 'idle' | null>(null);

  const lastActivity = useRef(Date.now());
  const lastAwayTime = useRef<number | null>(null);
  const idleStart = useRef<number | null>(null);

  const IDLE_TIMEOUT = 15000; // 15s demo timeout

  // 🖱️ Detect user activity
  useEffect(() => {
    const handleActivity = () => {
      lastActivity.current = Date.now();
      setIsIdle(false);
    };
    ['mousemove', 'keydown', 'mousedown', 'scroll', 'touchstart'].forEach((ev) =>
      window.addEventListener(ev, handleActivity)
    );

    const check = setInterval(() => {
      if (Date.now() - lastActivity.current > IDLE_TIMEOUT) {
        setIsIdle(true);
        idleStart.current = idleStart.current ?? Date.now();
        setAwayReason('idle');
      }
    }, 3000);

    return () => {
      ['mousemove', 'keydown', 'mousedown', 'scroll', 'touchstart'].forEach((ev) =>
        window.removeEventListener(ev, handleActivity)
      );
      clearInterval(check);
    };
  }, []);

  // 💡 When user becomes active again after being idle
  useEffect(() => {
    if (!isIdle && idleStart.current) {
      const missed = events.filter((e) => e.ts > idleStart.current!);
      if (missed.length) {
        setMissedEvents(missed);
        setShowReturnModal(true);
      }
      idleStart.current = null;
    }
  }, [isIdle, events]);

  // 🌐 When user switches tabs
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        lastAwayTime.current = Date.now();
        setAwayReason('tab-switch');
      } else if (lastAwayTime.current) {
        const missed = events.filter((e) => e.ts > lastAwayTime.current!);
        if (missed.length) {
          setMissedEvents(missed);
          setShowReturnModal(true);
        }
        lastAwayTime.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [events]);

  // 🪟 When window loses/gains focus
  useEffect(() => {
    const onBlur = () => {
      lastAwayTime.current = Date.now();
      setAwayReason('out-of-focus');
    };
    const onFocus = () => {
      if (lastAwayTime.current) {
        const missed = events.filter((e) => e.ts > lastAwayTime.current!);
        if (missed.length) {
          setMissedEvents(missed);
          setShowReturnModal(true);
        }
        lastAwayTime.current = null;
      }
    };
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [events]);

  return { showReturnModal, setShowReturnModal, missedEvents, awayReason };
}
