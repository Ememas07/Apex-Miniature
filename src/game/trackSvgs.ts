import * as THREE from 'three';
import { TrackWaypoint } from './types';
import { REAL_DEM_ELEVATIONS, getTrackElevationSync, registerTrackElevation } from './trackElevations';
import {
  ALL_TRACK_DATA_IDS,
  isNodeSyncCapable,
  loadTrackDataAsync,
  readTrackDataSync,
} from './trackData/loaders';

export interface SvgTrackOptions {
  trackId?: string;
  targetLapSeconds?: number;
  trackWidth?: number;
  direction?: 'cw' | 'ccw';
  demProfile?: number[];
  elevationProfile?: Array<{ tMin: number; tMax: number; y: number | ((t: number) => number) }>;
  bankingProfile?: Array<{ tMin: number; tMax: number; bankDeg: number }>;
}

/**
 * Counter-Clockwise (CCW) circuit IDs in official racing direction
 */
export const CCW_CIRCUIT_IDS = new Set([
  "baku",
  "cota",
  "daytona-road",
  "detroit-street",
  "imola",
  "interlagos",
  "jeddah",
  "laguna-seca",
  "las-vegas",
  "miami",
  "singapore",
  "yas-marina",
]);

const svgPathCache: Record<string, string> = Object.create(null) as Record<string, string>;

export function registerTrackSvgPath(trackId: string, svgPath: string): void {
  if (typeof svgPath === 'string' && svgPath.length > 0) {
    svgPathCache[trackId] = svgPath;
  }
}

export function getTrackSvgPathSync(trackId: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(svgPathCache, trackId)) {
    return svgPathCache[trackId];
  }
  const payload = readTrackDataSync(trackId);
  if (payload) {
    svgPathCache[trackId] = payload.svg;
    registerTrackElevation(trackId, payload.dem);
    return payload.svg;
  }
  return undefined;
}

export async function loadTrackSvgPath(trackId: string): Promise<string | undefined> {
  if (Object.prototype.hasOwnProperty.call(svgPathCache, trackId)) {
    return svgPathCache[trackId];
  }
  const payload = await loadTrackDataAsync(trackId);
  if (payload) {
    svgPathCache[trackId] = payload.svg;
    registerTrackElevation(trackId, payload.dem);
    return payload.svg;
  }
  return undefined;
}

export async function ensureAllTrackSvgsLoaded(): Promise<Record<string, string>> {
  await Promise.all(ALL_TRACK_DATA_IDS.map((id) => loadTrackSvgPath(id)));
  return TRACK_SVG_PATHS;
}

export const TRACK_SVG_PATHS: Record<string, string> = new Proxy(svgPathCache, {
  get(target, prop, receiver) {
    if (typeof prop === 'string') {
      return getTrackSvgPathSync(prop);
    }
    return Reflect.get(target, prop, receiver);
  },
  has(target, prop) {
    if (typeof prop === 'string') {
      return getTrackSvgPathSync(prop) !== undefined;
    }
    return Reflect.has(target, prop);
  },
  ownKeys(target) {
    if (isNodeSyncCapable()) {
      for (const id of ALL_TRACK_DATA_IDS) {
        getTrackSvgPathSync(id);
      }
    }
    return Reflect.ownKeys(target);
  },
  getOwnPropertyDescriptor(target, prop) {
    if (typeof prop === 'string') {
      getTrackSvgPathSync(prop);
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  },
  set(target, prop, value, receiver) {
    return Reflect.set(target, prop, value, receiver);
  },
});

export const TRACK_SVG_REGISTRY = TRACK_SVG_PATHS;

export interface RealTrackMetric {
  lengthMeters: number;
  trackWidth: number;
  targetLapSeconds: number;
}

/**
 * Official Real-World metric dimensions (1 unit = 1 meter) from RacingCircuits.info
 * for all 43 circuits, with authentic per-circuit track widths (7.5m Monaco to 16m Sepang) and real-life lap times.
 */
export const REAL_TRACK_METRICS: Record<string, RealTrackMetric> = {
  'spa-francorchamps': { lengthMeters: 7004, trackWidth: 13.5, targetLapSeconds: 106 },
  'daytona-road': { lengthMeters: 5729, trackWidth: 14.5, targetLapSeconds: 96 },
  'laguna-seca': { lengthMeters: 3602, trackWidth: 10.8, targetLapSeconds: 76 },
  'le-mans': { lengthMeters: 13626, trackWidth: 12.0, targetLapSeconds: 208 },
  'monza': { lengthMeters: 5793, trackWidth: 12.0, targetLapSeconds: 81 },
  'silverstone': { lengthMeters: 5891, trackWidth: 14.5, targetLapSeconds: 87 },
  'suzuka': { lengthMeters: 5807, trackWidth: 11.8, targetLapSeconds: 89 },
  'monaco': { lengthMeters: 3337, trackWidth: 7.5, targetLapSeconds: 72 },
  'cota': { lengthMeters: 5513, trackWidth: 15.5, targetLapSeconds: 94 },
  'sebring': { lengthMeters: 6019, trackWidth: 14.0, targetLapSeconds: 107 },
  'long-beach': { lengthMeters: 3167, trackWidth: 9.5, targetLapSeconds: 67 },
  'detroit-street': { lengthMeters: 2735, trackWidth: 9.0, targetLapSeconds: 62 },
  'mid-ohio': { lengthMeters: 3634, trackWidth: 10.8, targetLapSeconds: 74 },
  'watkins-glen': { lengthMeters: 5472, trackWidth: 12.0, targetLapSeconds: 88 },
  'mosport': { lengthMeters: 3957, trackWidth: 11.5, targetLapSeconds: 75 },
  'lime-rock': { lengthMeters: 2414, trackWidth: 9.8, targetLapSeconds: 50 },
  'road-america': { lengthMeters: 6515, trackWidth: 12.5, targetLapSeconds: 110 },
  'vir': { lengthMeters: 5260, trackWidth: 10.8, targetLapSeconds: 98 },
  'indianapolis-road': { lengthMeters: 3925, trackWidth: 14.0, targetLapSeconds: 76 },
  'road-atlanta': { lengthMeters: 4088, trackWidth: 11.5, targetLapSeconds: 72 },
  'montreal': { lengthMeters: 4361, trackWidth: 11.2, targetLapSeconds: 73 },
  'miami': { lengthMeters: 5412, trackWidth: 12.2, targetLapSeconds: 89 },
  'las-vegas': { lengthMeters: 6201, trackWidth: 13.5, targetLapSeconds: 93 },
  'mexico-city': { lengthMeters: 4304, trackWidth: 12.2, targetLapSeconds: 77 },
  'interlagos': { lengthMeters: 4309, trackWidth: 12.0, targetLapSeconds: 70 },
  'imola': { lengthMeters: 4909, trackWidth: 10.5, targetLapSeconds: 75 },
  'barcelona': { lengthMeters: 4657, trackWidth: 12.2, targetLapSeconds: 73 },
  'madring': { lengthMeters: 5474, trackWidth: 12.2, targetLapSeconds: 88 },
  'red-bull-ring': { lengthMeters: 4318, trackWidth: 12.2, targetLapSeconds: 65 },
  'hungaroring': { lengthMeters: 4381, trackWidth: 11.0, targetLapSeconds: 76 },
  'zandvoort': { lengthMeters: 4259, trackWidth: 10.5, targetLapSeconds: 71 },
  'paul-ricard': { lengthMeters: 5842, trackWidth: 15.0, targetLapSeconds: 92 },
  'baku': { lengthMeters: 6003, trackWidth: 8.5, targetLapSeconds: 102 },
  'portimao': { lengthMeters: 4653, trackWidth: 13.5, targetLapSeconds: 78 },
  'fuji': { lengthMeters: 4563, trackWidth: 15.5, targetLapSeconds: 74 },
  'shanghai': { lengthMeters: 5451, trackWidth: 15.5, targetLapSeconds: 93 },
  'singapore': { lengthMeters: 4940, trackWidth: 9.8, targetLapSeconds: 91 },
  'sepang': { lengthMeters: 5543, trackWidth: 16.0, targetLapSeconds: 92 },
  'bahrain': { lengthMeters: 5412, trackWidth: 15.0, targetLapSeconds: 90 },
  'jeddah': { lengthMeters: 6174, trackWidth: 11.5, targetLapSeconds: 88 },
  'lusail': { lengthMeters: 5419, trackWidth: 15.0, targetLapSeconds: 83 },
  'yas-marina': { lengthMeters: 5281, trackWidth: 14.5, targetLapSeconds: 83 },
  'albert-park': { lengthMeters: 5278, trackWidth: 12.0, targetLapSeconds: 78 },
};

/**
 * Calculates 2D polygon signed area in screen/SVG space (x, y).
 */
export function calculateSvgPathArea(points: Array<{ x: number; y: number }>): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return area;
}

/**
 * Parses SVG path string into an ordered sequence of 2D vertices,
 * expanding Beziers and Lines accurately.
 */
function parseSvgVertices(svgD: string): Array<[number, number]> {
  const regex = /([a-df-z])([^a-df-z]*)/gi;
  let match: RegExpExecArray | null;
  const vertices: Array<[number, number]> = [];
  while ((match = regex.exec(svgD)) !== null) {
    const cmd = match[1].toUpperCase();
    const args = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (cmd === 'M' || cmd === 'L') {
      for (let i = 0; i < args.length; i += 2) {
        vertices.push([args[i], args[i + 1]]);
      }
    } else if (cmd === 'C') {
      for (let i = 0; i < args.length; i += 6) {
        vertices.push([args[i + 2], args[i + 3]]);
        vertices.push([args[i + 4], args[i + 5]]);
      }
    } else if (cmd === 'Q') {
      for (let i = 0; i < args.length; i += 4) {
        vertices.push([args[i], args[i + 1]]);
        vertices.push([args[i + 2], args[i + 3]]);
      }
    }
  }
  return vertices;
}

/**
 * Solves a uniform periodic C2 cubic spline for second derivatives M_i at sample indices 0..N-1.
 */
function solveUniformPeriodicCubicM(vals: number[]): Float64Array {
  const n = vals.length;
  const M = new Float64Array(n);
  if (n < 3) return M;
  const h = 1 / n;
  const a = h / 6;
  const b = (2 * h) / 3;
  const c = h / 6;
  const d = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const im = (i - 1 + n) % n;
    const ip = (i + 1) % n;
    d[i] = (vals[ip] - 2 * vals[i] + vals[im]) / h;
  }
  const gamma = -b;
  const bMod = new Float64Array(n).fill(b);
  bMod[0] = b - gamma;
  bMod[n - 1] = b - (a * c) / gamma;

  const solveTri = (rhs: Float64Array): Float64Array => {
    const cp = new Float64Array(n);
    const dp = new Float64Array(n);
    cp[0] = c / bMod[0];
    dp[0] = rhs[0] / bMod[0];
    for (let i = 1; i < n; i++) {
      const denom = bMod[i] - a * cp[i - 1];
      cp[i] = i < n - 1 ? c / denom : 0;
      dp[i] = (rhs[i] - a * dp[i - 1]) / denom;
    }
    const x = new Float64Array(n);
    x[n - 1] = dp[n - 1];
    for (let i = n - 2; i >= 0; i--) {
      x[i] = dp[i] - cp[i] * x[i + 1];
    }
    return x;
  };

  const u = new Float64Array(n);
  u[0] = gamma;
  u[n - 1] = c;
  const z1 = solveTri(d);
  const z2 = solveTri(u);
  const factor = (z1[0] + (a / gamma) * z1[n - 1]) / (1 + z2[0] + (a / gamma) * z2[n - 1]);
  for (let i = 0; i < n; i++) {
    M[i] = z1[i] - factor * z2[i];
  }
  return M;
}

function evalUniformPeriodicCubic(vals: number[], M: Float64Array, tRaw: number): number {
  const n = vals.length;
  if (n === 0) return 0;
  if (n < 3) return vals[0];
  const t = ((tRaw % 1) + 1) % 1;
  const pos = t * n;
  const i0 = Math.floor(pos) % n;
  const i1 = (i0 + 1) % n;
  const frac = pos - Math.floor(pos);
  const h = 1 / n;
  const A = 1 - frac;
  const B = frac;
  return (
    A * vals[i0] +
    B * vals[i1] +
    (((A * A * A - A) * h * h) / 6) * M[i0] +
    (((B * B * B - B) * h * h) / 6) * M[i1]
  );
}

/**
 * Converts a normalized SVG path string into high-density 3D TrackWaypoints (180-240 points).
 * Preserves crisp corner profiles, prevents ribbon self-intersection folds, scales for
 * authentic 35-55s / 65-75s lap times, and applies real-world elevation and banking profiles.
 */
export function svgToTrackPoints(svgPathD: string, options: SvgTrackOptions = {}): TrackWaypoint[] {
  const trackId = options.trackId ?? '';
  const isCCW = options.direction === 'ccw' || (trackId ? CCW_CIRCUIT_IDS.has(trackId) : false);
  const metric = trackId ? REAL_TRACK_METRICS[trackId] : undefined;
  const trackWidth = metric?.trackWidth ?? options.trackWidth ?? 13.5;
  const targetLengthMeters =
    metric?.lengthMeters ??
    (options.targetLapSeconds ? options.targetLapSeconds * 60 : 5000);

  let rawVerts = parseSvgVertices(svgPathD);
  if (rawVerts.length < 3) return [];

  // Remove duplicate/near-coincident adjacent vertices
  const filtered: Array<[number, number]> = [];
  for (let i = 0; i < rawVerts.length; i++) {
    const v = rawVerts[i];
    if (filtered.length > 0) {
      const prev = filtered[filtered.length - 1];
      if (Math.hypot(v[0] - prev[0], v[1] - prev[1]) < 7) continue;
    }
    filtered.push(v);
  }

  // Remove duplicate closing vertex if coincident with the start vertex in a closed loop
  while (filtered.length > 2) {
    const first = filtered[0];
    const last = filtered[filtered.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 7) {
      filtered.pop();
    } else {
      break;
    }
  }

  // Verify signed area matches expected CW (>0) / CCW (<0) orientation (skipping figure-8 Suzuka),
  // preserving filtered[0] on Start/Finish straight while reversing 1..n-1 if inverted.
  if (trackId !== 'suzuka' && filtered.length > 2) {
    const signedArea = calculateSvgPathArea(filtered.map(([x, y]) => ({ x, y })));
    if ((isCCW && signedArea > 0) || (!isCCW && signedArea < 0)) {
      const rest = filtered.slice(1).reverse();
      filtered.splice(1, rest.length, ...rest);
    }
  }

  // Authentic 1:1 scale factor (1 unit = 1 meter)
  const minSafeRadius = Math.max(7.5, trackWidth * 0.72);
  const n = filtered.length;

  let sumX = 0;
  let sumZ = 0;
  for (const v of filtered) {
    sumX += v[0];
    sumZ += v[1];
  }
  const meanX = sumX / n;
  const meanZ = sumZ / n;

  const centered = filtered.map((v) => [v[0] - meanX, v[1] - meanZ]);
  let rawLen = 0;
  for (let i = 0; i < n; i++) {
    const a = centered[i];
    const b = centered[(i + 1) % n];
    rawLen += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const scale = targetLengthMeters / Math.max(100, rawLen);
  const scaled = centered.map((v) => [v[0] * scale, v[1] * scale]);

  // Expand with piecewise fillet arcs so corners stay crisp and never fold ribbon edges
  const cornerExpanded: Array<{ x: number; y: number; z: number; isCorner: boolean }> = [];
  for (let i = 0; i < n; i++) {
    const prev = scaled[(i - 1 + n) % n];
    const curr = scaled[i];
    const next = scaled[(i + 1) % n];

    const inDx = curr[0] - prev[0];
    const inDz = curr[1] - prev[1];
    const inLen = Math.hypot(inDx, inDz) || 1;
    const uInX = inDx / inLen;
    const uInZ = inDz / inLen;

    const outDx = next[0] - curr[0];
    const outDz = next[1] - curr[1];
    const outLen = Math.hypot(outDx, outDz) || 1;
    const uOutX = outDx / outLen;
    const uOutZ = outDz / outLen;

    const dot = Math.max(-0.999, Math.min(0.999, uInX * uOutX + uInZ * uOutZ));
    const phi = Math.acos(dot);

    if (phi < 0.085) {
      cornerExpanded.push({ x: curr[0], y: 0, z: curr[1], isCorner: false });
      continue;
    }

    // Scale fillet radius by corner angle: tight hairpins use minSafeRadius, fast shallow bends get high-speed sweep radii
    const r =
      phi >= 1.55
        ? minSafeRadius
        : phi >= 0.75
        ? minSafeRadius * (1.0 + 1.8 * ((1.55 - phi) / 0.8))
        : Math.min(180, minSafeRadius * 2.8 + ((0.75 - phi) / 0.75) * 95);
    const tanHalf = Math.tan(phi * 0.5);
    const maxTrim = 0.42 * Math.min(inLen, outLen);
    const trim = Math.min(r * tanHalf, maxTrim);
    const rEff = trim / Math.max(1e-4, tanHalf);

    const ax = curr[0] - uInX * trim;
    const az = curr[1] - uInZ * trim;
    const bx = curr[0] + uOutX * trim;
    const bz = curr[1] + uOutZ * trim;

    const cross = uInX * uOutZ - uInZ * uOutX;
    const sign = cross >= 0 ? 1 : -1;
    const nAx = -sign * uInZ;
    const nAz = sign * uInX;

    const cx = ax + nAx * rEff;
    const cz = az + nAz * rEff;

    const angA = Math.atan2(az - cz, ax - cx);
    const angB = Math.atan2(bz - cz, bx - cx);
    let dAng = angB - angA;
    while (dAng > Math.PI) dAng -= Math.PI * 2;
    while (dAng < -Math.PI) dAng += Math.PI * 2;

    const arcLen = Math.abs(dAng) * rEff;
    const desiredArcChords = Math.max(2, Math.min(8, Math.round(arcLen / 8.5)));
    const interiorPts = Math.max(1, desiredArcChords - 1);

    cornerExpanded.push({ x: ax, y: 0, z: az, isCorner: true });
    for (let k = 1; k <= interiorPts; k++) {
      const frac = k / (interiorPts + 1);
      const theta = angA + dAng * frac;
      cornerExpanded.push({
        x: cx + Math.cos(theta) * rEff,
        y: 0,
        z: cz + Math.sin(theta) * rEff,
        isCorner: true,
      });
    }
    cornerExpanded.push({ x: bx, y: 0, z: bz, isCorner: true });
  }

  // Clean near-coincident points
  const cleaned: typeof cornerExpanded = [];
  for (let i = 0; i < cornerExpanded.length; i++) {
    const pt = cornerExpanded[i];
    if (cleaned.length > 0) {
      const prev = cleaned[cleaned.length - 1];
      if (Math.hypot(pt.x - prev.x, pt.z - prev.z) < 3.5) {
        prev.x = (prev.x + pt.x) * 0.5;
        prev.z = (prev.z + pt.z) * 0.5;
        continue;
      }
    }
    cleaned.push(pt);
  }

  // Subdivide straights so waypoints density is 200-280 points at 1:1 scale
  const gap = 20;
  const dense: typeof cornerExpanded = [];
  const m = cleaned.length;
  for (let i = 0; i < m; i++) {
    const a = cleaned[i];
    const b = cleaned[(i + 1) % m];
    dense.push(a);

    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    if (segLen > gap) {
      const steps = Math.floor(segLen / gap);
      for (let s = 1; s <= steps; s++) {
        const frac = s / (steps + 1);
        dense.push({
          x: a.x + (b.x - a.x) * frac,
          y: 0,
          z: a.z + (b.z - a.z) * frac,
          isCorner: false,
        });
      }
    }
  }

  const totalPts = dense.length;
  const cumS = new Float64Array(totalPts);
  let totalXZLen = 0;
  for (let i = 1; i < totalPts; i++) {
    totalXZLen += Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z);
    cumS[i] = totalXZLen;
  }
  totalXZLen += Math.hypot(dense[0].x - dense[totalPts - 1].x, dense[0].z - dense[totalPts - 1].z);

  const demProfile = options.demProfile ?? (trackId ? getTrackElevationSync(trackId) ?? REAL_DEM_ELEVATIONS[trackId] : undefined);
  const demM = demProfile && demProfile.length >= 3 ? solveUniformPeriodicCubicM(demProfile) : null;

  const smoothedWaypoints: TrackWaypoint[] = dense.map((p, idx) => {
    const tArc = totalXZLen > 1e-3 ? cumS[idx] / totalXZLen : idx / totalPts;
    let y = 0;
    let banking = 0;

    // Exact periodic C2 cubic spline interpolation of Real-World Satellite DEM at true XZ arc-length fraction
    if (demProfile && demProfile.length > 0 && demM) {
      y = Math.round(evalUniformPeriodicCubic(demProfile, demM, tArc) * 1000) / 1000;
    }

    // Gentle Banking Profiles: smooth 8°-10° max for Daytona, 10°-12° max for Zandvoort/Indy
    if (trackId === 'daytona-road') {
      if (tArc >= 0.48 && tArc <= 0.62) {
        const ease = 0.035;
        let factor = 1.0;
        if (tArc < 0.48 + ease) factor = (1 - Math.cos(((tArc - 0.48) / ease) * Math.PI)) * 0.5;
        else if (tArc > 0.62 - ease) factor = (1 - Math.cos(((0.62 - tArc) / ease) * Math.PI)) * 0.5;
        banking = 9.5 * factor;
      } else if (tArc >= 0.77 && tArc <= 0.93) {
        const ease = 0.035;
        let factor = 1.0;
        if (tArc < 0.77 + ease) factor = (1 - Math.cos(((tArc - 0.77) / ease) * Math.PI)) * 0.5;
        else if (tArc > 0.93 - ease) factor = (1 - Math.cos(((0.93 - tArc) / ease) * Math.PI)) * 0.5;
        banking = 9.5 * factor;
      } else if (tArc > 0.93 || tArc < 0.05) {
        let factor = 1.0;
        if (tArc >= 0.93 && tArc < 0.96) factor = (1 - Math.cos(((tArc - 0.93) / 0.03) * Math.PI)) * 0.5;
        else if (tArc >= 0.02 && tArc < 0.05) factor = (1 - Math.cos(((0.05 - tArc) / 0.03) * Math.PI)) * 0.5;
        banking = 6.5 * factor;
      }
    } else if (trackId === 'zandvoort') {
      // T3 Hugenholtzbocht: LEFT-hand banked hairpin (positive banking raises RIGHT/outside edge)
      if (tArc >= 0.18 && tArc <= 0.26) {
        const ease = 0.022;
        let factor = 1.0;
        if (tArc < 0.18 + ease) factor = (1 - Math.cos(((tArc - 0.18) / ease) * Math.PI)) * 0.5;
        else if (tArc > 0.26 - ease) factor = (1 - Math.cos(((0.26 - tArc) / ease) * Math.PI)) * 0.5;
        banking = 15.0 * factor;
      } else if (tArc >= 0.90 && tArc <= 0.98) {
        // T14 Arie Luyendykbocht: RIGHT-hand banked final corner (negative banking raises LEFT/outside edge)
        const ease = 0.022;
        let factor = 1.0;
        if (tArc < 0.90 + ease) factor = (1 - Math.cos(((tArc - 0.90) / ease) * Math.PI)) * 0.5;
        else if (tArc > 0.98 - ease) factor = (1 - Math.cos(((0.98 - tArc) / ease) * Math.PI)) * 0.5;
        banking = -14.5 * factor;
      }
    } else if (trackId === 'indianapolis-road') {
      if (tArc >= 0.88 && tArc <= 0.98) {
        const ease = 0.025;
        let factor = 1.0;
        if (tArc < 0.88 + ease) factor = (1 - Math.cos(((tArc - 0.88) / ease) * Math.PI)) * 0.5;
        else if (tArc > 0.98 - ease) factor = (1 - Math.cos(((0.98 - tArc) / ease) * Math.PI)) * 0.5;
        banking = -9.2 * factor;
      }
    }

    return {
      x: Math.round(p.x * 100) / 100,
      y,
      z: Math.round(p.z * 100) / 100,
      ...(banking ? { banking } : {}),
      width: trackWidth,
    };
  });

  // Final 3D perimeter normalization preserving DEM elevation Y values untouched
  if (smoothedWaypoints.length >= 4) {
    for (let pass = 0; pass < 2; pass++) {
      const curvePts = smoothedWaypoints.map((p) => new THREE.Vector3(p.x, p.y, p.z));
      const checkCurve = new THREE.CatmullRomCurve3(curvePts, true, 'centripetal', 0.5);
      checkCurve.arcLengthDivisions = Math.max(1500, smoothedWaypoints.length * 30, 1800);
      const len3D = checkCurve.getLength();
      if (len3D > 10) {
        const ratio = targetLengthMeters / len3D;
        if (Math.abs(ratio - 1) > 0.0002) {
          for (let i = 0; i < smoothedWaypoints.length; i++) {
            smoothedWaypoints[i].x = Math.round(smoothedWaypoints[i].x * ratio * 100) / 100;
            smoothedWaypoints[i].z = Math.round(smoothedWaypoints[i].z * ratio * 100) / 100;
          }
        }
      }
    }
  }

  return smoothedWaypoints;
}
