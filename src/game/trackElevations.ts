/**
 * Real-World Satellite Digital Elevation Model (DEM) lookup table
 * for all 43 circuits fetched from Copernicus DEM via Open-Meteo & OpenTopoData Elevation APIs.
 * 200 samples per closed circuit loop, corner-aligned to real GPS loops via Procrustes + Cyclic DTW,
 * normalized to Start/Finish line (0.0m datum) and filtered with 2 passes of circular 7-tap Gaussian smoothing.
 *
 * Heavy elevation payloads live in split chunks under `src/game/trackData/*.json` so they are
 * dynamically code-split out of the initial browser bundle while remaining synchronously accessible in Node.
 */

import {
  ALL_TRACK_DATA_IDS,
  isNodeSyncCapable,
  loadTrackDataAsync,
  readTrackDataSync,
} from './trackData/loaders';

const demCache: Record<string, number[]> = Object.create(null) as Record<string, number[]>;

export function registerTrackElevation(trackId: string, dem: number[]): void {
  if (Array.isArray(dem)) {
    demCache[trackId] = dem;
  }
}

export function getTrackElevationSync(trackId: string): number[] | undefined {
  if (Object.prototype.hasOwnProperty.call(demCache, trackId)) {
    return demCache[trackId];
  }
  const payload = readTrackDataSync(trackId);
  if (payload) {
    demCache[trackId] = payload.dem;
    return payload.dem;
  }
  return undefined;
}

export async function loadTrackElevation(trackId: string): Promise<number[] | undefined> {
  if (Object.prototype.hasOwnProperty.call(demCache, trackId)) {
    return demCache[trackId];
  }
  const payload = await loadTrackDataAsync(trackId);
  if (payload) {
    demCache[trackId] = payload.dem;
    return payload.dem;
  }
  return undefined;
}

export async function ensureAllTrackElevationsLoaded(): Promise<Record<string, number[]>> {
  await Promise.all(ALL_TRACK_DATA_IDS.map((id) => loadTrackElevation(id)));
  return REAL_DEM_ELEVATIONS;
}

export const REAL_DEM_ELEVATIONS: Record<string, number[]> = new Proxy(demCache, {
  get(target, prop, receiver) {
    if (typeof prop === 'string') {
      return getTrackElevationSync(prop);
    }
    return Reflect.get(target, prop, receiver);
  },
  has(target, prop) {
    if (typeof prop === 'string') {
      return getTrackElevationSync(prop) !== undefined;
    }
    return Reflect.has(target, prop);
  },
  ownKeys(target) {
    if (isNodeSyncCapable()) {
      for (const id of ALL_TRACK_DATA_IDS) {
        getTrackElevationSync(id);
      }
    }
    return Reflect.ownKeys(target);
  },
  getOwnPropertyDescriptor(target, prop) {
    if (typeof prop === 'string') {
      getTrackElevationSync(prop);
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  },
  set(target, prop, value, receiver) {
    return Reflect.set(target, prop, value, receiver);
  },
});
