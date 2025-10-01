import React, { useState, useMemo } from 'react';
import type { DetectionEvent } from '../shared/DetectionEvent';
import EventTimeline from './EventTimeline'; // your existing timeline
import './EventFilters.css';

type Label = DetectionEvent['label'];

type Props = {
  events: DetectionEvent[];
  videoHandleRef: React.RefObject<any>;
  startTs: number;
};

export default function EventFilters({ events, videoHandleRef, startTs }: Props) {
  // 1️⃣  internal state for the dropdown
  const [filter, setFilter] = useState<'all' | Label>('all');

  // 2️⃣  compute the list of events to show
  const visibleEvents = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter((e) => e.label === filter);
  }, [events, filter]);

  // 3️⃣  render the select + the filtered timeline
  return (
    <div>
      <select
        value={filter}
        onChange={(e) => setFilter(e.target.value as 'all' | Label)}
        style={{
          padding: '4px 8px',
          borderRadius: 6,
          border: '1px solid #d1d5db',
          fontSize: '0.85rem',
          background: '#f9fafb',
          cursor: 'pointer',
          marginBottom: '1rem',
        }}
        aria-label="Event type filter"
      >
        <option value="all">All</option>
        <option value="fire">🔥 Fire</option>
        <option value="chemical">🧪 Chemical</option>
        <option value="person">👥 Person</option>
        <option value="snapshot">📸 Snapshot</option>
      </select>

      {/* Your original timeline now only receives the filtered list */}
      <EventTimeline
        videoHandleRef={videoHandleRef}
        events={visibleEvents}
        startTs={startTs}
        filters={new Set()} // or remove if not needed
        onFilterChange={() => {}}
      />
    </div>
  );
}
