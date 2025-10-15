export type DetectionEvent = {
  id: string;
  ts: number;
  label: 'fire' | 'person' | 'chemical' | 'snapshot' | 'car' | 'truck' | 'animal' | string;
  score: number;
  coord: [number, number];
  seen: boolean;
  thumbnail?: string;
  videoTime?: number;
  address?: string;
  headingDeg?: number;
  bbox?: [number, number, number, number]; // ✅ make optional
  icon?: string;
};
