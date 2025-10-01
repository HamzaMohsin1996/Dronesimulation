export type Coord = [number, number];

export interface DronePort {
  coord: Coord;
  id: string;
  status: 'idle' | 'in-flight';
}

export interface Hazard {
  coord: Coord;
  type: 'fire' | 'chemical' | 'people';
  info: string;
}

export interface Obstacle {
  coord: Coord;
  type: 'congestion' | 'closed';
  info: string;
}

export type Detection = {
  id: string;
  label: string; // 'people' | 'fire' | 'chemical' | ...
  score: number; // 0..1
  bbox: [number, number, number, number]; // [x,y,w,h] px
  color?: string;
};

export type DetectionEvent = {
  id: string;
  ts: number; // epoch ms
  label: string; // 'fire' | 'people' | 'chemical' | ...
  score: number;
  coord: Coord; // [lng, lat]
  seen?: boolean; // optional (live vs review)
  thumbnail?: string; // optional screenshot
};

export const isCoord = (c: any): c is Coord =>
  Array.isArray(c) && c.length === 2 && c.every((n) => Number.isFinite(n));

export const isImportant = (label: string, score = 0) =>
  (label === 'fire' || label === 'people' || label === 'chemical') && score >= 0.6;


