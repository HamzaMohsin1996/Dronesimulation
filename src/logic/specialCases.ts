import * as turf from '@turf/turf';
import type { FeatureCollection, Polygon } from 'geojson';

export type Coord = [number, number];

export type SpecialCaseContext = {
  aois?: FeatureCollection<Polygon>; // high-priority geofences
  assets?: Coord[]; // critical assets (e.g., drone ports)
};

export type EventInput = {
  label: string;
  score: number;
  coord: Coord;
  ts: number; // epoch ms
};

export type Decision = 'ignore' | 'record' | 'surface' | 'auto-dispatch';

type EngineState = {
  lastByCell: Record<string, { count: number; lastTs: number }>;
  recent: Array<{ label: string; coord: Coord; ts: number }>;
};

const CELL_DEG = 0.00035; // ~35m
const cellKey = (label: string, [lng, lat]: Coord) =>
  `${label}:${Math.round(lng / CELL_DEG)}:${Math.round(lat / CELL_DEG)}`;

const THR = {
  fire: { conf: 0.88, autoConf: 0.95, persistTicks: 2 },
  person: {
    conf: 0.9,
    persistTicksAOI: 3,
    clusterCount: 3,
    clusterMeters: 100,
    clusterWindowMs: 30_000,
  },
  people: {
    conf: 0.9,
    persistTicksAOI: 3,
    clusterCount: 3,
    clusterMeters: 100,
    clusterWindowMs: 30_000,
  },
  chemical: { conf: 0.85 },
};

const NEAR_ASSET_METERS = 60;
const PERSIST_MAX_GAP_MS = 12_000;

export function initSpecialCaseEngine(): EngineState {
  return { lastByCell: {}, recent: [] };
}

export function decideSpecialCase(
  st: EngineState,
  ev: EventInput,
  ctx: SpecialCaseContext
): Decision {
  const label = ev.label.toLowerCase();
  const t = ev.ts;

  // maintain recent buffer (cluster checks)
  st.recent.push({ label, coord: ev.coord, ts: ev.ts });
  const cutoff = t - 60_000;
  st.recent = st.recent.filter((r) => r.ts >= cutoff);

  // persistence per cell
  const key = cellKey(label, ev.coord);
  const prev = st.lastByCell[key];
  if (!prev || t - prev.lastTs > PERSIST_MAX_GAP_MS) {
    st.lastByCell[key] = { count: 1, lastTs: t };
  } else {
    st.lastByCell[key] = { count: prev.count + 1, lastTs: t };
  }
  const persistCount = st.lastByCell[key].count;

  // inside AOI?
  const insideAOI = (() => {
    if (!ctx.aois) return false;
    return (ctx.aois.features || []).some((poly) =>
      turf.booleanPointInPolygon(turf.point(ev.coord), poly as any)
    );
  })();

  // near critical asset?
  const nearAsset = (() => {
    if (!ctx.assets?.length) return false;
    const pt = turf.point(ev.coord);
    return ctx.assets.some(
      (a) => turf.distance(pt, turf.point(a), { units: 'meters' }) <= NEAR_ASSET_METERS
    );
  })();

  // cluster check in recent window (for person/people)
  const clusterHit = (() => {
    const base: any = (THR as any)[label];
    if (!base?.clusterCount) return false;
    const pt = turf.point(ev.coord);
    const since = t - (base.clusterWindowMs ?? 30_000);
    let count = 0;
    for (const r of st.recent) {
      if (r.label !== label || r.ts < since) continue;
      if (
        turf.distance(pt, turf.point(r.coord), { units: 'meters' }) <= (base.clusterMeters ?? 100)
      )
        count++;
    }
    return count >= base.clusterCount;
  })();

  // Rules
  if (label === 'fire' && ev.score >= THR.fire.conf) {
    if (persistCount >= THR.fire.persistTicks) {
      if (ev.score >= THR.fire.autoConf || insideAOI) return 'auto-dispatch';
      return 'surface';
    }
    return 'record';
  }

  if ((label === 'person' || label === 'people') && ev.score >= THR.person.conf) {
    if (insideAOI) {
      if (persistCount >= THR.person.persistTicksAOI || clusterHit) return 'surface';
      return 'record';
    }
  }

  if (label === 'chemical' && ev.score >= THR.chemical.conf) {
    if (insideAOI || nearAsset) return 'surface';
    return 'record';
  }

  if (nearAsset && (label === 'person' || label === 'people' || label === 'fire')) {
    const ok =
      (label === 'fire' && ev.score >= 0.85) ||
      ((label === 'person' || label === 'people') && ev.score >= 0.92);
    if (ok) return 'surface';
  }

  return 'record';
}
