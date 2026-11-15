import { SceneryTheme, TrackRegion, TrackSpec, TrackWaypoint } from './types';

export const CUSTOM_TRACKS_STORAGE_KEY = 'apex_miniature_custom_tracks';

// In-memory runtime cache for custom tracks (includes tracks received via multiplayer)
const customTracksRegistry = new Map<string, TrackSpec>();

/**
 * Pre-made starter templates for the Track Studio
 */
export const STARTER_TEMPLATES: Array<{
  id: string;
  name: string;
  description: string;
  scenery: SceneryTheme;
  waypoints: TrackWaypoint[];
  trackWidth: number;
  kerbPrimary: string;
  kerbSecondary: string;
}> = [
  {
    id: 'template-gp',
    name: 'Apex Grand Prix Ring',
    description: 'High-speed flowing GP circuit with sweeping esses, a long DRS straight, and elevation crest.',
    scenery: 'stadium',
    trackWidth: 17,
    kerbPrimary: '#ef4444',
    kerbSecondary: '#f8fafc',
    waypoints: [
      { x: -160, y: 0, z: -180 }, // 0: Start / Finish line
      { x: 0, y: 0, z: -180 },    // 1: Pit straight exit
      { x: 160, y: 0, z: -180 },   // 2: Turn 1 braking zone
      { x: 240, y: 3, z: -90, banking: 6 }, // 3: Sweeper right uphill
      { x: 210, y: 6, z: 60 },     // 4: Turn 3 crest
      { x: 120, y: 4, z: 160 },    // 5: Turn 4 left
      { x: -40, y: 2, z: 180 },    // 6: Back hairpin
      { x: -170, y: 0, z: 130 },   // 7: Chicane entry
      { x: -220, y: 0, z: 20 },    // 8: Mid-sector sweep
      { x: -210, y: 0, z: -90 },   // 9: Final turn onto front straight
    ],
  },
  {
    id: 'template-figure8',
    name: 'Suzuka-Style Figure 8',
    description: 'Iconic crossover circuit with a high bridge (10m clearance) over the lower underpass straight.',
    scenery: 'forest',
    trackWidth: 16.5,
    kerbPrimary: '#dc2626',
    kerbSecondary: '#facc15',
    waypoints: [
      { x: -160, y: 0, z: -140 }, // 0: Start / Finish straight
      { x: -40, y: 0, z: -140 },  // 1: S/F gantry
      { x: 80, y: 0, z: -140 },   // 2: Straight end
      { x: 180, y: 0, z: -120 },  // 3: Turn 1 right
      { x: 220, y: 2, z: -40 },   // 4: First corner apex
      { x: 190, y: 4, z: 40 },    // 5: Esses exit
      { x: 110, y: 7, z: 40 },    // 6: Climbing to bridge
      { x: -80, y: 10, z: -30 },  // 7: Bridge span across underpass (10m)
      { x: -160, y: 6, z: -40 },  // 8: Descent
      { x: -220, y: 3, z: 20 },   // 9: Hairpin entry
      { x: -200, y: 1, z: 90 },   // 10: Hairpin exit
      { x: -120, y: 0, z: 120 },  // 11: Back loop
      { x: -60, y: 0, z: 60 },    // 12: Approach underpass
      { x: 60, y: 0, z: -60 },    // 13: Underpass span (0m) - crossed by bridge
      { x: 20, y: 0, z: -100 },   // 14: Final chicane left
      { x: -80, y: 0, z: -110 },  // 15: Chicane exit
      { x: -160, y: 0, z: -110 }, // 16: Sweep onto front straight
    ],
  },
  {
    id: 'template-banked-oval',
    name: 'Daytona Banked Tri-Oval',
    description: 'High-speed speedway with steep 15° corner banking and flat-out wide apron.',
    scenery: 'desert',
    trackWidth: 19,
    kerbPrimary: '#f59e0b',
    kerbSecondary: '#111827',
    waypoints: [
      { x: -180, y: 0, z: -160 },          // 0: Start / Finish tri-oval kink
      { x: 0, y: 0, z: -175 },             // 1: Pit straight center
      { x: 180, y: 0, z: -160 },           // 2: Turn 1 entry
      { x: 250, y: 3, z: -40, banking: 14 }, // 3: East banking high
      { x: 230, y: 3, z: 100, banking: 14 }, // 4: East banking exit
      { x: 100, y: 0, z: 180 },            // 5: Long backstretch
      { x: -100, y: 0, z: 180 },           // 6: Backstretch mid
      { x: -230, y: 3, z: 100, banking: 14 },// 7: West banking entry
      { x: -250, y: 3, z: -40, banking: 14 },// 8: West banking high
    ],
  },
  {
    id: 'template-street-night',
    name: 'Singapore Night Marina Ring',
    description: 'Tight downtown street circuit flanked by barrier walls, floodlights, and sharp 90-degree corners.',
    scenery: 'street-night',
    trackWidth: 15.5,
    kerbPrimary: '#06b6d4',
    kerbSecondary: '#ffffff',
    waypoints: [
      { x: -140, y: 0, z: -160 },
      { x: 0, y: 0, z: -160 },
      { x: 140, y: 0, z: -160 },
      { x: 180, y: 0, z: -90 },
      { x: 180, y: 0, z: 40 },
      { x: 90, y: 0, z: 130 },
      { x: 0, y: 0, z: 150 },
      { x: -110, y: 0, z: 130 },
      { x: -180, y: 0, z: 40 },
      { x: -180, y: 0, z: -90 },
    ],
  },
];

/**
 * Line segment intersection in 2D (XZ plane)
 */
function checkSegmentIntersection2D(
  p1: { x: number; z: number },
  p2: { x: number; z: number },
  p3: { x: number; z: number },
  p4: { x: number; z: number },
): { intersects: boolean; ua?: number; ub?: number } {
  const denom = (p4.z - p3.z) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.z - p1.z);
  if (Math.abs(denom) < 1e-6) return { intersects: false };

  const ua = ((p4.x - p3.x) * (p1.z - p3.z) - (p4.z - p3.z) * (p1.x - p3.x)) / denom;
  const ub = ((p2.x - p1.x) * (p1.z - p3.z) - (p2.z - p1.z) * (p1.x - p3.x)) / denom;

  // Intersects strictly inside both segments (excluding exact endpoints)
  if (ua > 0.05 && ua < 0.95 && ub > 0.05 && ub < 0.95) {
    return { intersects: true, ua, ub };
  }
  return { intersects: false };
}

export interface TrackGeometryAnalysis {
  length: number;
  totalLengthMeters: number;
  estimatedLapSeconds: number;
  corners: number;
  cornerCount: number;
  maxElevation: number;
  minElevation: number;
  elevationRange: { min: number; max: number };
  warnings: string[];
  tightNodes: number[];
  bridgeCrossings: Array<{ nodeA: number; nodeB: number; heightDiff: number; isValidBridge: boolean }>;
  isValid: boolean;
}

export type TrackAnalysisResult = TrackGeometryAnalysis;

/**
 * Analyzes track spline geometry, computing real-time length, estimated lap time,
 * tight turn radii, and 3D overpass vertical clearances.
 */
export function analyzeTrackGeometry(waypoints: TrackWaypoint[], trackWidth = 17): TrackGeometryAnalysis {
  const warnings: string[] = [];
  const tightNodes: number[] = [];
  const bridgeCrossings: Array<{ nodeA: number; nodeB: number; heightDiff: number; isValidBridge: boolean }> = [];

  const n = waypoints.length;
  if (n < 4) {
    return {
      length: 0,
      totalLengthMeters: 0,
      estimatedLapSeconds: 0,
      corners: 0,
      cornerCount: 0,
      maxElevation: 0,
      minElevation: 0,
      elevationRange: { min: 0, max: 0 },
      warnings: ['A circuit requires at least 4 control points to form a closed racing loop.'],
      tightNodes: [],
      bridgeCrossings: [],
      isValid: false,
    };
  }

  // 1. Calculate arc length and elevation bounds
  let length = 0;
  let maxElevation = -Infinity;
  let minElevation = Infinity;

  for (let i = 0; i < n; i++) {
    const curr = waypoints[i];
    const next = waypoints[(i + 1) % n];
    const dx = next.x - curr.x;
    const dy = (next.y || 0) - (curr.y || 0);
    const dz = next.z - curr.z;
    length += Math.hypot(dx, dy, dz);
    maxElevation = Math.max(maxElevation, curr.y || 0);
    minElevation = Math.min(minElevation, curr.y || 0);
  }

  // 2. Corner counting and turn angle / radius check
  let corners = 0;
  for (let i = 0; i < n; i++) {
    const prev = waypoints[(i - 1 + n) % n];
    const curr = waypoints[i];
    const next = waypoints[(i + 1) % n];

    const v1x = curr.x - prev.x;
    const v1z = curr.z - prev.z;
    const v2x = next.x - curr.x;
    const v2z = next.z - curr.z;
    const len1 = Math.hypot(v1x, v1z) || 1;
    const len2 = Math.hypot(v2x, v2z) || 1;

    const dot = (v1x * v2x + v1z * v2z) / (len1 * len2);
    const angleRad = Math.acos(Math.max(-1, Math.min(1, dot)));
    const angleDeg = (angleRad * 180) / Math.PI;

    if (angleDeg > 18) {
      corners++;
    }

    // Acute corner check: turn sharper than 120 degrees or radius < 14m
    const approxTurnRadius = ((len1 + len2) * 0.5) / Math.max(0.1, 2 * Math.sin(angleRad * 0.5));
    if (angleDeg > 110 || (approxTurnRadius < 14 && angleDeg > 45)) {
      tightNodes.push(i);
      warnings.push(`Turn at Node #${i + 1} is extremely tight (radius ~${Math.round(approxTurnRadius)}m, ${Math.round(angleDeg)}°). Cars may struggle to turn without scrubbing.`);
    }
  }

  // 3. Overpass & self-intersection vertical clearance validation
  for (let i = 0; i < n; i++) {
    const p1 = waypoints[i];
    const p2 = waypoints[(i + 1) % n];

    for (let j = i + 2; j < n; j++) {
      // Don't compare closing segment with segment 0 as adjacent
      if (i === 0 && j === n - 1) continue;

      const p3 = waypoints[j];
      const p4 = waypoints[(j + 1) % n];

      const check = checkSegmentIntersection2D(p1, p2, p3, p4);
      if (check.intersects) {
        const ySeg1 = (p1.y || 0) + (check.ua || 0.5) * ((p2.y || 0) - (p1.y || 0));
        const ySeg2 = (p3.y || 0) + (check.ub || 0.5) * ((p4.y || 0) - (p3.y || 0));
        const diff = Math.abs(ySeg1 - ySeg2);
        const isValidBridge = diff >= 6.0;

        bridgeCrossings.push({
          nodeA: i,
          nodeB: j,
          heightDiff: diff,
          isValidBridge,
        });

        if (!isValidBridge) {
          warnings.push(
            `Segments between Node #${i + 1} and Node #${j + 1} intersect without sufficient vertical bridge clearance (${diff.toFixed(1)}m < 6.0m required).`,
          );
        }
      }
    }
  }

  // 4. Target lap time estimation (35–55s scale)
  // Straights cruise at ~52 m/s, corners average ~24 m/s
  const cornerFraction = Math.min(0.65, (corners * 35) / Math.max(400, length));
  const avgSpeed = (1 - cornerFraction) * 50 + cornerFraction * 24;
  const estimatedLapSeconds = Math.round(length / avgSpeed);

  if (length < 900) {
    warnings.push(`Track is unusually short (${Math.round(length)}m). Target is 1,200m–2,500m for authentic 35s–55s laps.`);
  } else if (length > 3600) {
    warnings.push(`Track is very long (${Math.round(length)}m). Laps may take over 75 seconds.`);
  }

  const isValid = n >= 4 && warnings.filter((w) => w.includes('without sufficient vertical')).length === 0;
  const roundedLength = Math.round(length);
  const minElev = isFinite(minElevation) ? Math.round(minElevation * 10) / 10 : 0;
  const maxElev = isFinite(maxElevation) ? Math.round(maxElevation * 10) / 10 : 0;

  return {
    length: roundedLength,
    totalLengthMeters: roundedLength,
    estimatedLapSeconds: Math.max(20, estimatedLapSeconds),
    corners,
    cornerCount: corners,
    maxElevation: maxElev,
    minElevation: minElev,
    elevationRange: { min: minElev, max: maxElev },
    warnings,
    tightNodes,
    bridgeCrossings,
    isValid,
  };
}

/**
 * Creates a new TrackSpec from an array of waypoints and designer metadata
 */
export function createCustomTrackSpec(
  opts: {
    id?: string;
    name: string;
    country?: string;
    scenery?: SceneryTheme;
    trackWidth?: number;
    kerbPrimary?: string;
    kerbSecondary?: string;
    waypoints: TrackWaypoint[];
    startNodeIndex?: number;
    pitSide?: 'left' | 'right';
  },
): TrackSpec {
  const id = opts.id || `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const waypoints = [...opts.waypoints];

  // Rotate waypoints if startNodeIndex is designated
  if (opts.startNodeIndex !== undefined && opts.startNodeIndex > 0 && opts.startNodeIndex < waypoints.length) {
    const head = waypoints.slice(opts.startNodeIndex);
    const tail = waypoints.slice(0, opts.startNodeIndex);
    waypoints.splice(0, waypoints.length, ...head, ...tail);
  }

  const analysis = analyzeTrackGeometry(waypoints, opts.trackWidth || 17);

  return {
    id,
    name: opts.name.trim() || 'Custom Circuit',
    shortName: (opts.name.trim() || 'Custom').slice(0, 14),
    country: opts.country?.trim() || 'Global',
    region: 'Custom',
    seriesTags: ['F1', 'WEC'],
    flagship: false,
    scenery: opts.scenery || 'stadium',
    asphaltColor: opts.scenery === 'street-night' ? '#21262f' : '#272c35',
    kerbPrimary: opts.kerbPrimary || '#ef4444',
    kerbSecondary: opts.kerbSecondary || '#f8fafc',
    trackWidth: opts.trackWidth || 17,
    targetLapSeconds: analysis.estimatedLapSeconds,
    corners: analysis.corners,
    waypoints,
    isCustom: true,
    startNodeIndex: 0,
    pitSide: opts.pitSide || 'left',
    createdAt: Date.now(),
  };
}

export const CUSTOM_TRACK_TEMPLATES: TrackSpec[] = STARTER_TEMPLATES.map((t) =>
  createCustomTrackSpec({
    id: t.id,
    name: t.name,
    country: 'Custom CAD',
    scenery: t.scenery,
    trackWidth: t.trackWidth,
    kerbPrimary: t.kerbPrimary,
    kerbSecondary: t.kerbSecondary,
    waypoints: t.waypoints,
  }),
);

/**
 * Persistence: Load all custom tracks from localStorage and memory registry
 */
export function getSavedCustomTracks(): TrackSpec[] {
  const out: TrackSpec[] = [];
  const seenIds = new Set<string>();

  // 1. From localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(CUSTOM_TRACKS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (isValidTrackSpecObject(item)) {
              out.push(item);
              seenIds.add(item.id);
              customTracksRegistry.set(item.id, item);
            }
          }
        }
      }
    } catch {
      // Storage access fail
    }
  }

  // 2. From memory registry (multiplayer-received tracks)
  customTracksRegistry.forEach((track, id) => {
    if (!seenIds.has(id)) {
      out.push(track);
      seenIds.add(id);
    }
  });

  return out;
}

export function saveCustomTrack(track: TrackSpec): void {
  customTracksRegistry.set(track.id, track);
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const list = getSavedCustomTracks().filter((t) => t.id !== track.id);
    list.unshift(track);
    window.localStorage.setItem(CUSTOM_TRACKS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage quota
  }
}

export function deleteCustomTrack(id: string): void {
  customTracksRegistry.delete(id);
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const list = getSavedCustomTracks().filter((t) => t.id !== id);
    window.localStorage.setItem(CUSTOM_TRACKS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore
  }
}

export function getCustomTrackById(id: string): TrackSpec | null {
  if (customTracksRegistry.has(id)) {
    return customTracksRegistry.get(id)!;
  }
  const all = getSavedCustomTracks();
  const found = all.find((t) => t.id === id);
  if (found) {
    customTracksRegistry.set(id, found);
    return found;
  }
  return null;
}

export function registerCustomTrackInMemory(track: TrackSpec): void {
  if (!track || !track.id) return;
  customTracksRegistry.set(track.id, track);
}

/**
 * Validation guard
 */
export function isValidTrackSpecObject(obj: unknown): obj is TrackSpec {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return false;
  if (!Array.isArray(o.waypoints) || o.waypoints.length < 4) return false;
  for (const wp of o.waypoints) {
    if (!wp || typeof wp !== 'object') return false;
    const w = wp as Record<string, unknown>;
    if (typeof w.x !== 'number' || typeof w.z !== 'number') return false;
  }
  return true;
}

/**
 * Export track to downloadable / shareable JSON string
 */
export function exportTrackToJson(track: TrackSpec): string {
  return JSON.stringify(track, null, 2);
}

/**
 * Export track to compact share code
 */
export function exportTrackToShareCode(track: TrackSpec): string {
  const minimal = {
    id: track.id,
    n: track.name,
    c: track.country,
    s: track.scenery,
    w: track.trackWidth,
    kp: track.kerbPrimary,
    ks: track.kerbSecondary,
    ps: track.pitSide,
    pts: track.waypoints.map((p) => [
      Math.round(p.x * 10) / 10,
      Math.round((p.y || 0) * 10) / 10,
      Math.round(p.z * 10) / 10,
      p.banking ? Math.round(p.banking * 10) / 10 : 0,
      p.width ? Math.round(p.width * 10) / 10 : 0,
    ]),
  };
  const jsonStr = JSON.stringify(minimal);
  try {
    return `APXTRK:${btoa(unescape(encodeURIComponent(jsonStr)))}`;
  } catch {
    return `APXTRK:${btoa(jsonStr)}`;
  }
}

/**
 * Import custom track from JSON string or share code
 */
export function importTrackFromString(inputStr: string): { success: boolean; track?: TrackSpec; error?: string } {
  const trimmed = inputStr.trim();
  if (!trimmed) {
    return { success: false, error: 'Input code is empty.' };
  }

  // Share code import
  if (trimmed.startsWith('APXTRK:')) {
    const rawB64 = trimmed.slice(7).trim();
    try {
      let jsonStr = '';
      try {
        jsonStr = decodeURIComponent(escape(atob(rawB64)));
      } catch {
        jsonStr = atob(rawB64);
      }
      const data = JSON.parse(jsonStr);
      if (!data || !Array.isArray(data.pts)) {
        return { success: false, error: 'Invalid share code payload.' };
      }
      const waypoints: TrackWaypoint[] = data.pts.map((row: number[]) => ({
        x: row[0],
        y: row[1] || 0,
        z: row[2],
        banking: row[3] || undefined,
        width: row[4] || undefined,
      }));
      const spec = createCustomTrackSpec({
        id: data.id || `custom-${Date.now().toString(36)}`,
        name: data.n || 'Imported Track',
        country: data.c || 'Custom',
        scenery: data.s || 'stadium',
        trackWidth: data.w || 17,
        kerbPrimary: data.kp || '#ef4444',
        kerbSecondary: data.ks || '#f8fafc',
        pitSide: data.ps || 'left',
        waypoints,
      });
      return { success: true, track: spec };
    } catch {
      return { success: false, error: 'Could not decode track share code.' };
    }
  }

  // Full JSON import
  try {
    const parsed = JSON.parse(trimmed);
    if (!isValidTrackSpecObject(parsed)) {
      return { success: false, error: 'Invalid track JSON schema: must include name and at least 4 waypoints.' };
    }
    const spec = createCustomTrackSpec({
      id: parsed.id || `custom-${Date.now().toString(36)}`,
      name: parsed.name,
      country: parsed.country,
      scenery: parsed.scenery,
      trackWidth: parsed.trackWidth,
      kerbPrimary: parsed.kerbPrimary,
      kerbSecondary: parsed.kerbSecondary,
      waypoints: parsed.waypoints,
      pitSide: parsed.pitSide,
      startNodeIndex: parsed.startNodeIndex,
    });
    return { success: true, track: spec };
  } catch {
    return { success: false, error: 'Invalid JSON format. Please paste valid track JSON or an APXTRK share code.' };
  }
}
