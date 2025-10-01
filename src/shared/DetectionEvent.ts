// src/shared/DetectionEvent.ts

export type DetectionEvent = {
  id: string;
  ts: number;
  label: 'fire' | 'person' | 'chemical' | 'snapshot';
  score: number;
  coord: [number, number]; // 👈 optional now
  seen: boolean;
  thumbnail?: string;
  videoTime?: number; // ✅ add this
  address?: string; // 👈 new
  headingDeg?: number; // 👈 optional if you know drone heading
  bbox: [number, number, number, number];
  icon?: string;
};
