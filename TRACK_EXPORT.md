# Apex Miniature — Track & Elevation Export Specification

This document provides the complete, authoritative export of the track registry, TypeScript schemas, SVG-to-3D spline compiler, elevation/banking mathematical models, reference track configurations, and the full catalog of all 43 circuits in Apex Miniature.

---

## 1. Exact Track Schema & Loader Implementation

### Exact File Paths in Codebase
- **Core Interfaces & Types:** [`src/game/types.ts`](file:///c:/Users/Marc%20Mas/Documents/Apex-Miniature/src/game/types.ts)
- **SVG Paths, Metric Scale, Direction & 3D Spline Generator:** [`src/game/trackSvgs.ts`](file:///c:/Users/Marc%20Mas/Documents/Apex-Miniature/src/game/trackSvgs.ts)
- **Static Track Registry & Spline Compiler:** [`src/game/tracks.ts`](file:///c:/Users/Marc%20Mas/Documents/Apex-Miniature/src/game/tracks.ts)
- **Custom Track Studio & Persistence:** [`src/game/customTracks.ts`](file:///c:/Users/Marc%20Mas/Documents/Apex-Miniature/src/game/customTracks.ts)
- **3D Three.js Mesh, Ribbon & Terrain Generator:** [`src/three/trackBuilder.ts`](file:///c:/Users/Marc%20Mas/Documents/Apex-Miniature/src/three/trackBuilder.ts)

---

### Exact TypeScript Interfaces

```typescript
// From src/game/types.ts

export type TrackRegion = 'Americas' | 'Europe' | 'Asia-Pacific & Middle East' | 'Custom';

export type SceneryTheme = 'stadium' | 'forest' | 'desert' | 'street-night' | 'coastal' | 'parkland';

export interface TrackWaypoint {
  x: number;          // 3D World X in meters (lateral position relative to track centroid)
  y: number;          // 3D World Y in meters (elevation above datum, +Y = UP)
  z: number;          // 3D World Z in meters (longitudinal position relative to track centroid, derived from SVG Y)
  width?: number;     // Per-node track width override in meters (default: TrackSpec.trackWidth)
  banking?: number;   // Per-node track banking in degrees (>0 raises right edge, lowers left edge)
  tension?: number;   // Per-node Catmull-Rom spline tension (0.15 tight .. 0.85 sweeping, default: 0.5)
}

export interface TrackSpec {
  id: string;                                // Unique identifier (e.g., 'spa-francorchamps', 'daytona-road')
  name: string;                              // Full display name & configuration variant
  shortName: string;                         // Short HUD/UI name (e.g., 'Spa', 'Daytona')
  country: string;                           // Country of origin
  region: TrackRegion;                       // Geographical grouping
  seriesTags: ('IMSA' | 'WEC' | 'F1')[];     // Sanctioning series
  flagship: boolean;                         // Flagship circuit indicator
  scenery: SceneryTheme;                     // Visual theme & prop distribution
  asphaltColor: string;                      // Hex color for road asphalt texture tint
  kerbPrimary: string;                       // Hex color for kerb primary blocks
  kerbSecondary: string;                     // Hex color for kerb secondary blocks
  trackWidth: number;                        // Nominal asphalt ribbon width in meters (11.0m .. 14.5m)
  targetLapSeconds: number;                  // Baseline competitive lap time in seconds
  corners: number;                           // Official corner count
  waypoints: TrackWaypoint[];                // Ordered closed-loop waypoints (1:1 meters)
  isCustom?: boolean;                        // Custom Track Studio flag
  startNodeIndex?: number;                   // Node index hosting the Start/Finish gantry
  pitSide?: 'left' | 'right';                // Lateral side hosting the pit lane bypass
  banking?: number;                          // Global default banking override in degrees
  createdAt?: number;                        // Timestamp for custom circuits
}

// From src/game/trackSvgs.ts

export interface SvgTrackOptions {
  trackId?: string;
  targetLapSeconds?: number;
  trackWidth?: number;
  direction?: 'cw' | 'ccw';
  elevationProfile?: Array<{ tMin: number; tMax: number; y: number | ((t: number) => number) }>;
  bankingProfile?: Array<{ tMin: number; tMax: number; bankDeg: number }>;
}

export interface RealTrackMetric {
  lengthMeters: number;      // Real-world 1:1 centerline distance in meters
  trackWidth: number;        // Official asphalt ribbon width in meters
  targetLapSeconds: number;  // Competitive race lap benchmark
}

// From src/game/tracks.ts

export interface SampledSplinePoint {
  x: number;
  y: number;
  z: number;
  tx: number;       // Unit tangent vector X
  ty: number;       // Unit tangent vector Y
  tz: number;       // Unit tangent vector Z
  nx: number;       // Unit normal vector X (perpendicular to tangent in XZ plane)
  nz: number;       // Unit normal vector Z
  distance: number; // Cumulative arc length along centerline from S/F line in meters
  t: number;        // Normalized position along circuit [0.0 .. 1.0)
  banking: number;  // Local roll angle in radians
  width: number;    // Local track width in meters
  curvature: number;// Local 2D curvature kappa (1 / R) in 1/m (+ = right turn, - = left turn)
}

export interface CompiledTrack {
  spec: TrackSpec;
  curve: THREE.CatmullRomCurve3;
  samples: SampledSplinePoint[];
  totalLength: number;         // Total closed spline length in meters
  pitEntryT: number;           // Normalized T for pit entry deceleration line (typically 0.89)
  pitExitT: number;            // Normalized T for pit exit blend line (typically 0.09)
  pitOffset: number;           // Lateral displacement in meters to pit stall row
}
```

---

### Coordinate System & ViewBox Mapping Rules

1. **SVG Coordinate Space:**
   - SVG path strings are defined in a normalized screen viewBox: standard traces use `viewBox="0 0 1000 1000"`, Le Mans uses `viewBox="0 0 1000 562"`, and Silverstone/Portimão/Spa/Daytona use `viewBox="0 0 1000 600"`.
   - In SVG screen space:
     - `+X` extends from **left to right** ($0 \to 1000$).
     - `+Y` extends from **top to bottom** ($0 \to 600$ or $1000$).
2. **3D World Space (Three.js):**
   - Coordinates are metric ($1\text{ unit} = 1.0\text{ meter}$).
   - **Horizontal X:** Centered on track centroid: $X_{3D} = (X_{SVG} - \bar{X}_{SVG}) \times \text{scale}$.
   - **Vertical Y (Elevation):** $+Y$ points **upwards** into the sky in true meters. Smooth metric elevations ($0\text{m} \dots +45\text{m}$) are assigned per normalized arc-length parameter $t \in [0, 1]$.
   - **Horizontal Z (Longitudinal):** Mapped directly from SVG $Y$: $Z_{3D} = (Y_{SVG} - \bar{Y}_{SVG}) \times \text{scale}$.
3. **Uniform Metric Scaling:**
   - The raw SVG perimeter is measured in viewBox units: $\text{rawLen} = \sum_{i} \text{hypot}(\Delta X, \Delta Y)$.
   - The uniform metric scaling factor is: $\text{scale} = \frac{\text{lengthMeters}}{\text{rawLen}}$.
   - This guarantees 100% preservation of aspect ratio with zero anamorphic distortion or stretching.
4. **Winding Order & Driving Direction:**
   - In 2D screen coordinates, polygon signed area is computed by the shoelace formula: $\text{Area}_{SVG} = \sum_{i} (X_i Y_{i+1} - X_{i+1} Y_i)$. A Clockwise polygon yields $\text{Area} > 0$.
   - In 3D space $(X, Z)$, the area is $\sum_i (X_i Z_{i+1} - X_{i+1} Z_i)$. Clockwise circuits have $\text{Area}_{XZ} > 0$; Counter-Clockwise circuits have $\text{Area}_{XZ} < 0$.
   - If a track ID is present in `CCW_CIRCUIT_IDS`, `svgToTrackPoints` verifies the winding and automatically reverses the vertex array if it was drawn clockwise, ensuring the physical driving direction matches reality.

---

### Verbatim `svgToTrackPoints`, Area Calculation & Parser Implementation

```typescript
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

  // Enforce correct physical driving winding
  const curArea = calculateSvgPathArea(rawVerts.map((v) => ({ x: v[0], y: v[1] })));
  if (isCCW && curArea > 0) {
    rawVerts.reverse();
  } else if (!isCCW && trackId !== 'suzuka' && curArea < 0) {
    rawVerts.reverse();
  }

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

  // Authentic 1:1 scale factor (1 unit = 1 meter)
  const minSafeRadius = Math.max(9.5, trackWidth * 0.72);
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

    const r = minSafeRadius;
    const tanHalf = Math.tan(phi * 0.5);
    const maxTrim = 0.44 * Math.min(inLen, outLen);
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
    const desiredArcChords = Math.max(2, Math.min(6, Math.round(arcLen / 8.5)));
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
      if (Math.hypot(pt.x - prev.x, pt.z - prev.z) < 7.2) {
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
  const rawWaypoints = dense.map((p, idx) => {
    const t = idx / totalPts;
    let y = 0;
    let banking = 0;

    // 1:1 Metric Elevation Profiles in true meters
    if (trackId === 'spa-francorchamps') {
      // Spa has ~100m total elevation span.
      // Descend into Eau Rouge (lowest point), then steep climb up Raidillon (+35m) to Kemmel, peaking at Les Combes (+45m).
      if (t >= 0.05 && t <= 0.14) {
        const u = (t - 0.05) / 0.09;
        y = (1 - Math.cos(u * Math.PI)) * 0.5 * 35;
      } else if (t > 0.14 && t <= 0.22) {
        const u = (t - 0.14) / 0.08;
        y = 35 + Math.sin(u * Math.PI * 0.5) * 10;
      } else if (t > 0.22 && t <= 0.48) {
        const u = (t - 0.22) / 0.26;
        y = 45 * Math.cos(u * Math.PI * 0.5);
      } else if (t > 0.48 && t <= 0.75) {
        const u = (t - 0.48) / 0.27;
        y = Math.sin(u * Math.PI) * -8;
      }
    } else if (trackId === 'laguna-seca') {
      // Laguna Seca Corkscrew: climb Rahal straight up to Corkscrew crest (+18m), then plunge 18m down turns 8 & 8A
      if (t >= 0.46 && t <= 0.58) {
        const u = (t - 0.46) / 0.12;
        y = (1 - Math.cos(u * Math.PI)) * 0.5 * 18;
      } else if (t > 0.58 && t <= 0.68) {
        const u = (t - 0.58) / 0.10;
        y = (1 + Math.cos(u * Math.PI)) * 0.5 * 18;
      }
    } else if (trackId === 'suzuka') {
      // Smooth cosine figure-8 bridge overpass (+10.5m deck clearing lower track at 0m)
      if (t >= 0.24 && t <= 0.32) {
        y = 10.5;
      } else if (t >= 0.16 && t < 0.24) {
        const u = (t - 0.16) / 0.08;
        y = (1 - Math.cos(u * Math.PI)) * 0.5 * 10.5;
      } else if (t > 0.32 && t <= 0.40) {
        const u = (t - 0.32) / 0.08;
        y = (1 + Math.cos(u * Math.PI)) * 0.5 * 10.5;
      }
    } else if (trackId === 'red-bull-ring') {
      if (t >= 0.10 && t <= 0.24) {
        const u = (t - 0.10) / 0.14;
        y = (1 - Math.cos(u * Math.PI)) * 0.5 * 24;
      } else if (t > 0.24 && t <= 0.45) {
        const u = (t - 0.24) / 0.21;
        y = (1 + Math.cos(u * Math.PI)) * 0.5 * 24;
      }
    } else if (trackId === 'cota') {
      if (t >= 0.03 && t <= 0.12) {
        const u = (t - 0.03) / 0.09;
        y = (1 - Math.cos(u * Math.PI)) * 0.5 * 28;
      } else if (t > 0.12 && t <= 0.22) {
        const u = (t - 0.12) / 0.10;
        y = (1 + Math.cos(u * Math.PI)) * 0.5 * 28;
      }
    } else if (trackId === 'portimao') {
      // Autódromo Internacional do Algarve rollercoaster elevation: crests and blind dips
      if (t >= 0.08 && t <= 0.28) {
        const u = (t - 0.08) / 0.20;
        y = (1 - Math.cos(u * Math.PI * 2)) * 0.5 * 18;
      } else if (t > 0.45 && t <= 0.70) {
        const u = (t - 0.45) / 0.25;
        y = (1 - Math.cos(u * Math.PI)) * 0.5 * 22;
      } else if (t > 0.70 && t <= 0.90) {
        const u = (t - 0.70) / 0.20;
        y = (1 + Math.cos(u * Math.PI)) * 0.5 * 22;
      }
    } else if (trackId === 'interlagos') {
      // Interlagos: steep climb up Arquibancadas into Subida dos Boxes (+16m), plunge through Senna S
      if (t >= 0.78 && t <= 0.98) {
        const u = (t - 0.78) / 0.20;
        y = (1 - Math.cos(u * Math.PI)) * 0.5 * 16;
      } else if (t >= 0.0 && t <= 0.16) {
        const u = t / 0.16;
        y = (1 + Math.cos(u * Math.PI)) * 0.5 * 16;
      }
    } else if (trackId === 'road-atlanta') {
      // Road Atlanta: climb Turn 1 to Esses crest (+18m), undulating dip, dramatic downhill plunge into Turn 12
      if (t >= 0.05 && t <= 0.25) {
        const u = (t - 0.05) / 0.20;
        y = (1 - Math.cos(u * Math.PI)) * 0.5 * 18;
      } else if (t > 0.25 && t <= 0.60) {
        const u = (t - 0.25) / 0.35;
        y = 18 - Math.sin(u * Math.PI) * 12;
      } else if (t > 0.82 && t <= 0.96) {
        const u = (t - 0.82) / 0.14;
        y = (1 + Math.cos(u * Math.PI)) * 0.5 * 10;
      }
    } else if (trackId === 'watkins-glen') {
      // Watkins Glen: uphill charge through the Esses (+18m), rolling boot section
      if (t >= 0.08 && t <= 0.28) {
        const u = (t - 0.08) / 0.20;
        y = (1 - Math.cos(u * Math.PI)) * 0.5 * 18;
      } else if (t > 0.28 && t <= 0.65) {
        const u = (t - 0.28) / 0.37;
        y = 18 - Math.sin(u * Math.PI * 0.5) * 8;
      } else if (t > 0.65 && t <= 0.90) {
        const u = (t - 0.65) / 0.25;
        y = (1 + Math.cos(u * Math.PI)) * 0.5 * 10;
      }
    } else if (trackId === 'monaco') {
      // Monaco: uphill climb Beau Rivage to Casino Square (+24m), plunge down Mirabeau and Fairmont Hairpin to Portier
      if (t >= 0.08 && t <= 0.28) {
        const u = (t - 0.08) / 0.20;
        y = (1 - Math.cos(u * Math.PI)) * 0.5 * 24;
      } else if (t > 0.28 && t <= 0.55) {
        const u = (t - 0.28) / 0.27;
        y = (1 + Math.cos(u * Math.PI)) * 0.5 * 24;
      }
    }

    // Gentle Banking Profiles: smooth 8°-10° max for Daytona, 10°-12° max for Zandvoort/Indy, 0°-3° standard
    if (trackId === 'daytona-road') {
      if (t >= 0.20 && t <= 0.42) {
        const ease = 0.035;
        let factor = 1.0;
        if (t < 0.20 + ease) factor = (1 - Math.cos(((t - 0.20) / ease) * Math.PI)) * 0.5;
        else if (t > 0.42 - ease) factor = (1 - Math.cos(((0.42 - t) / ease) * Math.PI)) * 0.5;
        banking = 9.5 * factor;
      } else if (t >= 0.75 && t <= 0.95) {
        const ease = 0.035;
        let factor = 1.0;
        if (t < 0.75 + ease) factor = (1 - Math.cos(((t - 0.75) / ease) * Math.PI)) * 0.5;
        else if (t > 0.95 - ease) factor = (1 - Math.cos(((0.95 - t) / ease) * Math.PI)) * 0.5;
        banking = 9.5 * factor;
      }
    } else if (trackId === 'zandvoort') {
      if (t >= 0.14 && t <= 0.24) {
        const ease = 0.025;
        let factor = 1.0;
        if (t < 0.14 + ease) factor = (1 - Math.cos(((t - 0.14) / ease) * Math.PI)) * 0.5;
        else if (t > 0.24 - ease) factor = (1 - Math.cos(((0.24 - t) / ease) * Math.PI)) * 0.5;
        banking = 11.0 * factor;
      } else if (t >= 0.88 && t <= 0.98) {
        const ease = 0.025;
        let factor = 1.0;
        if (t < 0.88 + ease) factor = (1 - Math.cos(((t - 0.88) / ease) * Math.PI)) * 0.5;
        else if (t > 0.98 - ease) factor = (1 - Math.cos(((0.98 - t) / ease) * Math.PI)) * 0.5;
        banking = 11.0 * factor;
      }
    } else if (trackId === 'indianapolis-road') {
      if (t >= 0.88 && t <= 0.98) {
        const ease = 0.025;
        let factor = 1.0;
        if (t < 0.88 + ease) factor = (1 - Math.cos(((t - 0.88) / ease) * Math.PI)) * 0.5;
        else if (t > 0.98 - ease) factor = (1 - Math.cos(((0.98 - t) / ease) * Math.PI)) * 0.5;
        banking = 9.5 * factor;
      }
    }

    return {
      x: Math.round(p.x * 10) / 10,
      y,
      z: Math.round(p.z * 10) / 10,
      ...(banking ? { banking } : {}),
      width: trackWidth,
    };
  });

  // Low-pass smoothing filter on elevation (Y) so slopes are realistic and transition buttery smooth
  const smoothedWaypoints: TrackWaypoint[] = [];
  const W = rawWaypoints.length;
  for (let i = 0; i < W; i++) {
    const yMinus2 = rawWaypoints[(i - 2 + W) % W].y;
    const yMinus1 = rawWaypoints[(i - 1 + W) % W].y;
    const y0 = rawWaypoints[i].y;
    const yPlus1 = rawWaypoints[(i + 1) % W].y;
    const yPlus2 = rawWaypoints[(i + 2) % W].y;
    const smoothedY = 0.06 * yMinus2 + 0.24 * yMinus1 + 0.40 * y0 + 0.24 * yPlus1 + 0.06 * yPlus2;
    smoothedWaypoints.push({
      ...rawWaypoints[i],
      y: Math.round(smoothedY * 10) / 10,
    });
  }

  return smoothedWaypoints;
}
```

---

## 2. Current Configs for the 5 Reference Tracks (For Elevation Correction)

### 1. Circuit de la Sarthe (`le-mans`)
- **Track ID:** `le-mans`
- **Display Name:** `Circuit de la Sarthe (Le Mans)`
- **Short Name:** `Le Mans`
- **Country / Region:** `France` / `Europe`
- **Series:** `WEC`
- **1:1 Centerline Length:** `13626` meters
- **Track Width:** `13.5` meters
- **Target Lap Time:** `208` seconds (~3:28.0)
- **Driving Direction:** `clockwise` ($\text{Area} > 0$)
- **SVG ViewBox:** `0 0 1000 562`
- **Banking:** Flat ($0^\circ$)
- **Current Elevation Profile:** Currently flat ($Y = 0.0\text{m}$ across all 725 waypoints).
- **Target Elevation Topography Needed:**
  - Start/Finish straight to Dunlop Curve: gentle climb $+6\text{m}$.
  - Dunlop Chicane crest: $+15\text{m}$.
  - Plunge through the Esses down to Tertre Rouge: drops to $-2\text{m}$.
  - Mulsanne Straight (Ligne Droite des Hunaudières): subtle undulations ($\pm 4\text{m}$) across the 6 km straight with braking dips into Chicane 1 and Chicane 2.
  - Mulsanne Corner braking zone: low point $-4\text{m}$.
  - Run to Indianapolis: gradual climb $+8\text{m}$.
  - Arnage: flat chicane dip $+2\text{m}$.
  - Porsche Curves: undulating high-speed technical sweeps climbing from $+5\text{m}$ to $+14\text{m}$ before dropping back into the Ford Chicanes ($+3\text{m}$).
- **Exact SVG Path String (`d` attribute):**
```
M 266,516 L 215,513 L 180,505 L 158,490 L 146,464 L 138,443 L 132,442 L 123,448 L 116,444 L 110,425 L 100,395 L 98,372 L 94,360 L 78,348 L 64,326 L 52,296 L 53,282 L 66,268 L 95,250 L 146,222 L 260,188 L 355,160 L 364,168 L 371,173 L 378,167 L 383,154 L 395,149 L 520,113 L 642,78 L 651,74 L 656,61 L 662,57 L 669,64 L 675,68 L 718,56 L 820,48 L 912,42 L 921,45 L 920,56 L 892,165 L 862,265 L 838,332 L 812,344 L 775,349 L 760,353 L 759,360 L 766,372 L 778,405 L 776,412 L 765,415 L 685,434 L 645,449 L 605,472 L 582,487 L 562,484 L 542,469 L 522,463 L 504,471 L 486,487 L 468,486 L 454,474 L 442,466 L 428,468 L 395,473 L 362,479 L 336,491 L 327,498 L 318,496 L 311,504 L 303,511 L 296,517 L 288,514 L 281,517 Z
```
- **TrackSpec Object in Code:**
```typescript
{
  id: "le-mans",
  name: "Circuit de la Sarthe (Le Mans)",
  shortName: "Le Mans",
  country: "France",
  region: "Europe",
  seriesTags: ["WEC"],
  flagship: true,
  scenery: "forest",
  asphaltColor: "#252a32",
  kerbPrimary: "#facc15",
  kerbSecondary: "#1d4ed8",
  trackWidth: 13.5,
  targetLapSeconds: 208,
  corners: 21,
  waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["le-mans"], { trackId: "le-mans" }),
}
```

---

### 2. Silverstone Grand Prix Circuit (`silverstone`)
- **Track ID:** `silverstone`
- **Display Name:** `Silverstone Grand Prix Circuit`
- **Short Name:** `Silverstone`
- **Country / Region:** `United Kingdom` / `Europe`
- **Series:** `F1`
- **1:1 Centerline Length:** `5891` meters
- **Track Width:** `14.0` meters
- **Target Lap Time:** `87` seconds (~1:27.0)
- **Driving Direction:** `clockwise` ($\text{Area} > 0$)
- **SVG ViewBox:** `0 0 1000 600`
- **Banking:** Flat ($0^\circ$)
- **Current Elevation Profile:** Currently flat ($Y = 0.0\text{m}$ across all 324 waypoints).
- **Target Elevation Topography Needed:**
  - Hamilton Straight to Abbey: flat datum $0.0\text{m}$.
  - Village & The Loop: dip down to $-3.5\text{m}$.
  - Aintree & Wellington Straight: gentle uphill climb up to $+4.5\text{m}$ at Brooklands.
  - Luffield & Woodcote: flat apron $+2.0\text{m}$.
  - Copse Corner: blind crest at $+3.0\text{m}$.
  - Maggotts-Becketts-Chapel complex: downhill sweep dropping from $+3.0\text{m}$ to $-1.5\text{m}$ onto the Hangar Straight.
  - Hangar Straight: long gentle rise up to Stowe corner ($+6.2\text{m}$ crest).
  - Vale & Club Chicane: plunge downhill into Vale ($-3.0\text{m}$) before rising back to the S/F line ($0.0\text{m}$).
- **Exact SVG Path String (`d` attribute):**
```
M 644,492 L 535,416 L 522,398 L 518,375 L 517,322 L 502,286 L 462,244 C 452,232 454,220 468,214 L 498,205 C 508,198 506,186 490,182 L 448,176 C 430,175 418,182 406,196 L 265,368 C 250,388 250,410 265,418 L 296,422 C 318,425 324,452 308,464 C 292,474 268,462 246,448 C 212,428 194,404 186,368 L 164,225 C 162,196 176,180 206,172 L 365,146 C 385,142 396,130 408,126 C 424,122 442,138 464,138 C 486,138 502,114 522,112 C 542,112 552,132 564,152 C 574,166 588,174 606,182 L 848,294 C 872,308 876,338 856,356 L 794,404 L 752,442 C 742,452 742,462 752,472 C 760,482 756,496 738,508 L 712,522 C 698,528 686,522 672,512 Z
```
- **TrackSpec Object in Code:**
```typescript
{
  id: "silverstone",
  name: "Silverstone Grand Prix Circuit",
  shortName: "Silverstone",
  country: "United Kingdom",
  region: "Europe",
  seriesTags: ["F1"],
  flagship: true,
  scenery: "stadium",
  asphaltColor: "#2a2e36",
  kerbPrimary: "#dc2626",
  kerbSecondary: "#ffffff",
  trackWidth: 14,
  targetLapSeconds: 87,
  corners: 18,
  waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["silverstone"], { trackId: "silverstone" }),
}
```

---

### 3. Autódromo Internacional do Algarve (`portimao`)
- **Track ID:** `portimao`
- **Display Name:** `Autódromo Internacional do Algarve (Portimão)`
- **Short Name:** `Portimão`
- **Country / Region:** `Portugal` / `Europe`
- **Series:** `F1`, `WEC`
- **1:1 Centerline Length:** `4653` meters
- **Track Width:** `13.5` meters
- **Target Lap Time:** `78` seconds (~1:18.0)
- **Driving Direction:** `clockwise` ($\text{Area} > 0$)
- **SVG ViewBox:** `0 0 1000 600`
- **Banking:** Flat ($0^\circ$)
- **Current Elevation Profile:** 259 waypoints, range $0.0\text{m} \dots +22.0\text{m}$.
  ```typescript
  // Autódromo Internacional do Algarve rollercoaster elevation: crests and blind dips
  if (t >= 0.08 && t <= 0.28) {
    const u = (t - 0.08) / 0.20;
    y = (1 - Math.cos(u * Math.PI * 2)) * 0.5 * 18;
  } else if (t > 0.45 && t <= 0.70) {
    const u = (t - 0.45) / 0.25;
    y = (1 - Math.cos(u * Math.PI)) * 0.5 * 22;
  } else if (t > 0.70 && t <= 0.90) {
    const u = (t - 0.70) / 0.20;
    y = (1 + Math.cos(u * Math.PI)) * 0.5 * 22;
  }
  ```
- **Target Elevation Topography Notes:** Portimão is famous as the "rollercoaster". Turn 1 drops downhill into Lagos. Turn 3 climbs sharply into Turn 4. Turn 8 plunges into a blind right-hander, and Turn 10/11 is a massive crest where cars get light before plunging down into the final sweeping right-hander (Galp) back onto the main straight.
- **Exact SVG Path String (`d` attribute):**
```
M 588,462 L 105,461 C 86,461 80,452 74,432 L 48,358 C 44,344 46,332 54,320 L 96,252 C 106,240 120,240 126,256 L 142,318 C 148,338 162,348 186,348 L 566,350 C 584,350 588,332 572,322 L 456,274 C 436,266 416,266 392,270 L 278,288 C 258,290 246,282 236,266 L 202,212 C 194,196 202,180 222,182 L 442,214 C 464,216 482,210 498,194 L 578,108 C 594,92 614,88 642,90 C 660,92 666,102 666,122 L 668,224 C 670,256 692,278 726,294 L 796,324 C 818,332 830,318 818,300 L 762,206 C 750,186 762,162 790,154 C 818,148 842,162 862,190 L 924,284 C 942,322 944,376 920,414 C 896,446 862,462 818,462 Z
```
- **TrackSpec Object in Code:**
```typescript
{
  id: "portimao",
  name: "Autódromo Internacional do Algarve (Portimão)",
  shortName: "Portimão",
  country: "Portugal",
  region: "Europe",
  seriesTags: ["F1","WEC"],
  flagship: false,
  scenery: "desert",
  asphaltColor: "#2a2e37",
  kerbPrimary: "#facc15",
  kerbSecondary: "#16a34a",
  trackWidth: 13.5,
  targetLapSeconds: 78,
  corners: 15,
  waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["portimao"], { trackId: "portimao" }),
}
```

---

### 4. Circuit de Spa-Francorchamps (`spa-francorchamps`)
- **Track ID:** `spa-francorchamps`
- **Display Name:** `Circuit de Spa-Francorchamps`
- **Short Name:** `Spa`
- **Country / Region:** `Belgium` / `Europe`
- **Series:** `F1`, `WEC`
- **1:1 Centerline Length:** `7004` meters
- **Track Width:** `14.5` meters
- **Target Lap Time:** `106` seconds (~1:46.0)
- **Driving Direction:** `clockwise` ($\text{Area} > 0$)
- **SVG ViewBox:** `0 0 1000 600`
- **Banking:** Flat ($0^\circ$)
- **Current Elevation Profile:** 381 waypoints, range $-8.0\text{m} \dots +45.0\text{m}$.
  ```typescript
  // Descend into Eau Rouge (lowest point), then steep climb up Raidillon (+35m) to Kemmel, peaking at Les Combes (+45m).
  if (t >= 0.05 && t <= 0.14) {
    const u = (t - 0.05) / 0.09;
    y = (1 - Math.cos(u * Math.PI)) * 0.5 * 35;
  } else if (t > 0.14 && t <= 0.22) {
    const u = (t - 0.14) / 0.08;
    y = 35 + Math.sin(u * Math.PI * 0.5) * 10;
  } else if (t > 0.22 && t <= 0.48) {
    const u = (t - 0.22) / 0.26;
    y = 45 * Math.cos(u * Math.PI * 0.5);
  } else if (t > 0.48 && t <= 0.75) {
    const u = (t - 0.48) / 0.27;
    y = Math.sin(u * Math.PI) * -8;
  }
  ```
- **Target Elevation Topography Notes:** Authentic elevation span across the Ardennes forest: steep descent from La Source hairpin down through Eau Rouge valley (lowest local datum), monumental uphill rise through Raidillon ($+35\text{m}$) onto Kemmel Straight peaking at Les Combes chicane ($+45\text{m}$), followed by continuous downhill plunge through Bruxelles and the high-speed double-apex Pouhon ($-8\text{m}$) before rising back through Blanchimont into the Bus Stop chicane.
- **Exact SVG Path String (`d` attribute):**
```
M 238,398 L 124,480 C 112,488 108,482 114,468 L 164,364 C 180,334 204,312 236,286 C 254,270 262,250 276,238 C 292,226 312,228 330,216 C 356,196 384,166 426,146 L 708,44 C 722,40 730,46 736,56 C 742,66 752,66 768,58 L 788,50 C 800,48 808,54 818,68 L 880,148 C 892,164 882,182 862,178 C 846,174 836,154 824,134 C 816,122 806,122 790,128 L 636,176 C 614,184 608,204 610,232 C 612,262 630,280 666,292 L 764,322 C 782,328 788,342 780,362 C 772,382 774,398 792,410 L 854,448 C 866,456 866,468 856,484 L 836,514 C 822,534 798,536 770,524 C 724,504 692,468 656,412 C 632,374 604,352 558,334 L 522,322 C 508,318 496,322 480,330 L 396,368 L 316,384 C 306,384 306,374 306,362 C 304,352 296,352 284,362 Z
```
- **TrackSpec Object in Code:**
```typescript
{
  id: "spa-francorchamps",
  name: "Circuit de Spa-Francorchamps",
  shortName: "Spa",
  country: "Belgium",
  region: "Europe",
  seriesTags: ["F1","WEC"],
  flagship: true,
  scenery: "forest",
  asphaltColor: "#262b33",
  kerbPrimary: "#e11d48",
  kerbSecondary: "#facc15",
  trackWidth: 14.5,
  targetLapSeconds: 106,
  corners: 19,
  waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["spa-francorchamps"], { trackId: "spa-francorchamps" }),
}
```

---

### 5. Daytona International Speedway Road Course (`daytona-road`)
- **Track ID:** `daytona-road`
- **Display Name:** `Daytona International Speedway (Road)`
- **Short Name:** `Daytona`
- **Country / Region:** `USA` / `Americas`
- **Series:** `IMSA`
- **1:1 Centerline Length:** `5729` meters
- **Track Width:** `14.0` meters
- **Target Lap Time:** `96` seconds (~1:36.0)
- **Driving Direction:** `counter-clockwise` ($\text{Area} < 0$)
- **SVG ViewBox:** `0 0 1000 600`
- **Banking:** Gentle banked oval transitions peaking at $9.5^\circ$ (capped to smooth $8^\circ \dots 10^\circ$ window).
  ```typescript
  if (trackId === 'daytona-road') {
    if (t >= 0.20 && t <= 0.42) {
      const ease = 0.035;
      let factor = 1.0;
      if (t < 0.20 + ease) factor = (1 - Math.cos(((t - 0.20) / ease) * Math.PI)) * 0.5;
      else if (t > 0.42 - ease) factor = (1 - Math.cos(((0.42 - t) / ease) * Math.PI)) * 0.5;
      banking = 9.5 * factor;
    } else if (t >= 0.75 && t <= 0.95) {
      const ease = 0.035;
      let factor = 1.0;
      if (t < 0.75 + ease) factor = (1 - Math.cos(((t - 0.75) / ease) * Math.PI)) * 0.5;
      else if (t > 0.95 - ease) factor = (1 - Math.cos(((0.95 - t) / ease) * Math.PI)) * 0.5;
      banking = 9.5 * factor;
    }
  }
  ```
- **Current Elevation Profile:** Currently flat ($Y = 0.0\text{m}$ across all 312 waypoints).
- **Target Elevation Topography Notes:** Infield road course is essentially flat terrain ($0.0\text{m}$ datum). As the track transitions through NASCAR Turn 1/2 banking, outer ribbon rises slightly. Backstretch straight (Pedro Rodriguez straight) is flat with the Le Mans Bus Stop chicane breaking up the straight. Outer oval turns 3/4 feature banking roll.
- **Exact SVG Path String (`d` attribute):**
```
M 502,86 C 440,86 385,102 336,128 C 304,148 292,174 300,192 C 308,208 328,212 356,214 C 376,216 390,232 412,234 L 512,236 C 536,236 538,278 510,282 L 304,284 C 288,284 276,290 264,302 L 162,368 C 146,378 144,352 158,334 L 262,226 C 276,212 268,196 248,184 C 228,174 210,174 188,184 C 112,222 76,282 78,348 C 80,418 122,474 202,494 C 234,500 268,502 310,502 L 554,502 C 568,502 574,480 588,478 L 620,476 C 632,476 638,494 656,500 C 720,506 785,504 832,484 C 896,456 926,404 922,334 C 918,266 878,218 802,184 C 712,144 606,86 502,86 Z
```
- **TrackSpec Object in Code:**
```typescript
{
  id: "daytona-road",
  name: "Daytona International Speedway (Road)",
  shortName: "Daytona",
  country: "USA",
  region: "Americas",
  seriesTags: ["IMSA"],
  flagship: true,
  scenery: "stadium",
  asphaltColor: "#272b34",
  kerbPrimary: "#facc15",
  kerbSecondary: "#2563eb",
  trackWidth: 14,
  targetLapSeconds: 96,
  corners: 12,
  waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["daytona-road"], { trackId: "daytona-road" }),
}
```

---

## 3. Full List of All Remaining Tracks in the Roster (38 Circuits)

The 38 remaining circuits currently utilize approximate traces or older splines and are scheduled for replacement with high-precision screenshot-traced SVGs and verified elevation profiles.

### Structured Markdown Table

| # | Codebase `id` | Official Track Name & Configuration | Series | Length (m) | Direction | RacingCircuits.info URL Reference | Current Status |
|---|---|---|---|---|---|---|---|
| 1 | `laguna-seca` | WeatherTech Raceway Laguna Seca | IMSA | 3,602 | Counter-Clockwise | `https://www.racingcircuits.info/north-america/usa/laguna-seca.html` | Legacy Reference Spline (Needs High-Fidelity SVG) |
| 2 | `monza` | Autodromo Nazionale Monza | F1, WEC | 5,793 | Clockwise | `https://www.racingcircuits.info/europe/italy/monza.html` | Legacy Reference Spline (Needs High-Fidelity SVG) |
| 3 | `suzuka` | Suzuka International Racing Course (Figure-8) | F1 | 5,807 | Clockwise | `https://www.racingcircuits.info/asia/japan/suzuka.html` | Legacy Reference Spline (Needs High-Fidelity SVG) |
| 4 | `monaco` | Circuit de Monaco | F1 | 3,337 | Clockwise | `https://www.racingcircuits.info/europe/monaco/monte-carlo.html` | Legacy Reference Spline (Needs High-Fidelity SVG) |
| 5 | `cota` | Circuit of the Americas (Austin) | F1, WEC | 5,513 | Counter-Clockwise | `https://www.racingcircuits.info/north-america/usa/circuit-of-the-americas.html` | Legacy Reference Spline (Needs High-Fidelity SVG) |
| 6 | `sebring` | Sebring International Raceway (12 Hour) | IMSA, WEC | 6,019 | Clockwise | `https://www.racingcircuits.info/north-america/usa/sebring.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 7 | `long-beach` | Streets of Long Beach | IMSA | 3,167 | Counter-Clockwise | `https://www.racingcircuits.info/north-america/usa/long-beach.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 8 | `detroit-street` | Detroit Street Circuit (Downtown) | IMSA | 2,735 | Clockwise | `https://www.racingcircuits.info/north-america/usa/detroit.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 9 | `mid-ohio` | Mid-Ohio Sports Car Course | IMSA | 3,634 | Clockwise | `https://www.racingcircuits.info/north-america/usa/mid-ohio.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 10 | `watkins-glen` | Watkins Glen International (Full Boot) | IMSA | 5,472 | Clockwise | `https://www.racingcircuits.info/north-america/usa/watkins-glen.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 11 | `mosport` | Canadian Tire Motorsport Park (Mosport) | IMSA | 3,957 | Clockwise | `https://www.racingcircuits.info/north-america/canada/canadian-tire-motorsport-park-mosport.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 12 | `lime-rock` | Lime Rock Park | IMSA | 2,414 | Clockwise | `https://www.racingcircuits.info/north-america/usa/lime-rock-park.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 13 | `road-america` | Road America (Elkhart Lake) | IMSA | 6,515 | Clockwise | `https://www.racingcircuits.info/north-america/usa/road-america.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 14 | `vir` | VIRginia International Raceway (Full Course) | IMSA | 5,260 | Clockwise | `https://www.racingcircuits.info/north-america/usa/virginia-international-raceway.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 15 | `indianapolis-road` | Indianapolis Motor Speedway (Road Course) | IMSA | 3,925 | Clockwise | `https://www.racingcircuits.info/north-america/usa/indianapolis-motor-speedway.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 16 | `road-atlanta` | Michelin Raceway Road Atlanta | IMSA | 4,088 | Clockwise | `https://www.racingcircuits.info/north-america/usa/road-atlanta.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 17 | `montreal` | Circuit Gilles Villeneuve (Montreal) | F1 | 4,361 | Counter-Clockwise | `https://www.racingcircuits.info/north-america/canada/montreal.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 18 | `miami` | Miami International Autodrome | F1 | 5,412 | Clockwise | `https://www.racingcircuits.info/north-america/usa/miami-international-autodrome.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 19 | `las-vegas` | Las Vegas Strip Circuit | F1 | 6,201 | Counter-Clockwise | `https://www.racingcircuits.info/north-america/usa/las-vegas-strip-circuit.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 20 | `mexico-city` | Autódromo Hermanos Rodríguez | F1 | 4,304 | Counter-Clockwise | `https://www.racingcircuits.info/north-america/mexico/mexico-city.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 21 | `interlagos` | Autódromo José Carlos Pace (Interlagos) | F1, WEC | 4,309 | Counter-Clockwise | `https://www.racingcircuits.info/south-america/brazil/interlagos.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 22 | `imola` | Autodromo Enzo e Dino Ferrari (Imola) | F1, WEC | 4,909 | Counter-Clockwise | `https://www.racingcircuits.info/europe/italy/imola.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 23 | `barcelona` | Circuit de Barcelona-Catalunya (2023+ Layout) | F1 | 4,657 | Clockwise | `https://www.racingcircuits.info/europe/spain/barcelona-catalunya.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 24 | `madring` | Circuito de Madring (Madrid F1 2026) | F1 | 5,474 | Clockwise | `https://www.racingcircuits.info/europe/spain/madrid-circuito-madring.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 25 | `red-bull-ring` | Red Bull Ring (Spielberg) | F1 | 4,318 | Clockwise | `https://www.racingcircuits.info/europe/austria/red-bull-ring.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 26 | `hungaroring` | Hungaroring (Budapest) | F1 | 4,381 | Clockwise | `https://www.racingcircuits.info/europe/hungary/hungaroring.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 27 | `zandvoort` | Circuit Zandvoort | F1 | 4,259 | Clockwise | `https://www.racingcircuits.info/europe/netherlands/zandvoort.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 28 | `paul-ricard` | Circuit Paul Ricard (1C-V2 Layout) | WEC, F1 | 5,842 | Clockwise | `https://www.racingcircuits.info/europe/france/paul-ricard.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 29 | `baku` | Baku City Circuit | F1 | 6,003 | Counter-Clockwise | `https://www.racingcircuits.info/asia/azerbaijan/baku-city-circuit.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 30 | `fuji` | Fuji Speedway | WEC | 4,563 | Clockwise | `https://www.racingcircuits.info/asia/japan/fuji-speedway.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 31 | `shanghai` | Shanghai International Circuit | F1 | 5,451 | Clockwise | `https://www.racingcircuits.info/asia/china/shanghai-international-circuit.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 32 | `singapore` | Marina Bay Street Circuit (2023+ Layout) | F1 | 4,940 | Counter-Clockwise | `https://www.racingcircuits.info/asia/singapore/marina-bay.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 33 | `sepang` | Petronas Sepang International Circuit | F1 | 5,543 | Clockwise | `https://www.racingcircuits.info/asia/malaysia/sepang.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 34 | `bahrain` | Bahrain International Circuit (Sakhir GP) | F1, WEC | 5,412 | Clockwise | `https://www.racingcircuits.info/middle-east/bahrain/bahrain-international-circuit.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 35 | `jeddah` | Jeddah Corniche Circuit | F1 | 6,174 | Counter-Clockwise | `https://www.racingcircuits.info/middle-east/saudi-arabia/jeddah-corniche-circuit.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 36 | `lusail` | Lusail International Circuit (Qatar) | F1, WEC | 5,419 | Clockwise | `https://www.racingcircuits.info/middle-east/qatar/losail.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 37 | `yas-marina` | Yas Marina Circuit (Abu Dhabi 2021+) | F1 | 5,281 | Counter-Clockwise | `https://www.racingcircuits.info/middle-east/united-arab-emirates/yas-marina.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |
| 38 | `albert-park` | Albert Park Grand Prix Circuit (Melbourne 2022+) | F1 | 5,278 | Clockwise | `https://www.racingcircuits.info/australasia/australia/albert-park-melbourne.html` | Simplified Polyline Trace (Needs RacingCircuits SVG) |

---

### Machine-Readable JSON Export

```json
[
  {
    "id": "laguna-seca",
    "name": "WeatherTech Raceway Laguna Seca",
    "series": "IMSA",
    "lengthMeters": 3602,
    "direction": "counter-clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/north-america/usa/laguna-seca.html",
    "status": "Legacy Reference Spline (Needs High-Fidelity SVG)"
  },
  {
    "id": "monza",
    "name": "Autodromo Nazionale Monza",
    "series": "F1, WEC",
    "lengthMeters": 5793,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/europe/italy/monza.html",
    "status": "Legacy Reference Spline (Needs High-Fidelity SVG)"
  },
  {
    "id": "suzuka",
    "name": "Suzuka International Racing Course",
    "series": "F1",
    "lengthMeters": 5807,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/asia/japan/suzuka.html",
    "status": "Legacy Reference Spline (Needs High-Fidelity SVG)"
  },
  {
    "id": "monaco",
    "name": "Circuit de Monaco",
    "series": "F1",
    "lengthMeters": 3337,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/europe/monaco/monte-carlo.html",
    "status": "Legacy Reference Spline (Needs High-Fidelity SVG)"
  },
  {
    "id": "cota",
    "name": "Circuit of the Americas (Austin)",
    "series": "F1, WEC",
    "lengthMeters": 5513,
    "direction": "counter-clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/north-america/usa/circuit-of-the-americas.html",
    "status": "Legacy Reference Spline (Needs High-Fidelity SVG)"
  },
  {
    "id": "sebring",
    "name": "Sebring International Raceway",
    "series": "IMSA, WEC",
    "lengthMeters": 6019,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/north-america/usa/sebring.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "long-beach",
    "name": "Streets of Long Beach",
    "series": "IMSA",
    "lengthMeters": 3167,
    "direction": "counter-clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/north-america/usa/long-beach.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "detroit-street",
    "name": "Detroit Street Circuit",
    "series": "IMSA",
    "lengthMeters": 2735,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/north-america/usa/detroit.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "mid-ohio",
    "name": "Mid-Ohio Sports Car Course",
    "series": "IMSA",
    "lengthMeters": 3634,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/north-america/usa/mid-ohio.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "watkins-glen",
    "name": "Watkins Glen International (Full Boot)",
    "series": "IMSA",
    "lengthMeters": 5472,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/north-america/usa/watkins-glen.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "mosport",
    "name": "Canadian Tire Motorsport Park (Mosport)",
    "series": "IMSA",
    "lengthMeters": 3957,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/north-america/canada/canadian-tire-motorsport-park-mosport.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "lime-rock",
    "name": "Lime Rock Park",
    "series": "IMSA",
    "lengthMeters": 2414,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/north-america/usa/lime-rock-park.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "road-america",
    "name": "Road America",
    "series": "IMSA",
    "lengthMeters": 6515,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/north-america/usa/road-america.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "vir",
    "name": "VIRginia International Raceway",
    "series": "IMSA",
    "lengthMeters": 5260,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/north-america/usa/virginia-international-raceway.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "indianapolis-road",
    "name": "Indianapolis Motor Speedway (Road)",
    "series": "IMSA",
    "lengthMeters": 3925,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/north-america/usa/indianapolis-motor-speedway.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "road-atlanta",
    "name": "Michelin Raceway Road Atlanta",
    "series": "IMSA",
    "lengthMeters": 4088,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/north-america/usa/road-atlanta.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "montreal",
    "name": "Circuit Gilles Villeneuve (Montreal)",
    "series": "F1",
    "lengthMeters": 4361,
    "direction": "counter-clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/north-america/canada/montreal.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "miami",
    "name": "Miami International Autodrome",
    "series": "F1",
    "lengthMeters": 5412,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/north-america/usa/miami-international-autodrome.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "las-vegas",
    "name": "Las Vegas Strip Circuit",
    "series": "F1",
    "lengthMeters": 6201,
    "direction": "counter-clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/north-america/usa/las-vegas-strip-circuit.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "mexico-city",
    "name": "Autódromo Hermanos Rodríguez",
    "series": "F1",
    "lengthMeters": 4304,
    "direction": "counter-clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/north-america/mexico/mexico-city.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "interlagos",
    "name": "Autódromo José Carlos Pace (Interlagos)",
    "series": "F1, WEC",
    "lengthMeters": 4309,
    "direction": "counter-clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/south-america/brazil/interlagos.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "imola",
    "name": "Autodromo Enzo e Dino Ferrari (Imola)",
    "series": "F1, WEC",
    "lengthMeters": 4909,
    "direction": "counter-clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/europe/italy/imola.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "barcelona",
    "name": "Circuit de Barcelona-Catalunya",
    "series": "F1",
    "lengthMeters": 4657,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/europe/spain/barcelona-catalunya.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "madring",
    "name": "Circuito de Madring (Madrid)",
    "series": "F1",
    "lengthMeters": 5474,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/europe/spain/madrid-circuito-madring.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "red-bull-ring",
    "name": "Red Bull Ring (Spielberg)",
    "series": "F1",
    "lengthMeters": 4318,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/europe/austria/red-bull-ring.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "hungaroring",
    "name": "Hungaroring (Budapest)",
    "series": "F1",
    "lengthMeters": 4381,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/europe/hungary/hungaroring.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "zandvoort",
    "name": "Circuit Zandvoort",
    "series": "F1",
    "lengthMeters": 4259,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/europe/netherlands/zandvoort.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "paul-ricard",
    "name": "Circuit Paul Ricard (Le Castellet)",
    "series": "WEC, F1",
    "lengthMeters": 5842,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/europe/france/paul-ricard.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "baku",
    "name": "Baku City Circuit",
    "series": "F1",
    "lengthMeters": 6003,
    "direction": "counter-clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/asia/azerbaijan/baku-city-circuit.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "fuji",
    "name": "Fuji Speedway",
    "series": "WEC",
    "lengthMeters": 4563,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/asia/japan/fuji-speedway.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "shanghai",
    "name": "Shanghai International Circuit",
    "series": "F1",
    "lengthMeters": 5451,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/asia/china/shanghai-international-circuit.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "singapore",
    "name": "Marina Bay Street Circuit",
    "series": "F1",
    "lengthMeters": 4940,
    "direction": "counter-clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/asia/singapore/marina-bay.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "sepang",
    "name": "Petronas Sepang International Circuit",
    "series": "F1",
    "lengthMeters": 5543,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/asia/malaysia/sepang.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "bahrain",
    "name": "Bahrain International Circuit (Sakhir)",
    "series": "F1, WEC",
    "lengthMeters": 5412,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/middle-east/bahrain/bahrain-international-circuit.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "jeddah",
    "name": "Jeddah Corniche Circuit",
    "series": "F1",
    "lengthMeters": 6174,
    "direction": "counter-clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/middle-east/saudi-arabia/jeddah-corniche-circuit.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "lusail",
    "name": "Lusail International Circuit",
    "series": "F1, WEC",
    "lengthMeters": 5419,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/middle-east/qatar/losail.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "yas-marina",
    "name": "Yas Marina Circuit (Abu Dhabi)",
    "series": "F1",
    "lengthMeters": 5281,
    "direction": "counter-clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/middle-east/united-arab-emirates/yas-marina.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  },
  {
    "id": "albert-park",
    "name": "Albert Park Grand Prix Circuit (Melbourne)",
    "series": "F1",
    "lengthMeters": 5278,
    "direction": "clockwise",
    "racingCircuitsUrl": "https://www.racingcircuits.info/australasia/australia/albert-park-melbourne.html",
    "status": "Simplified Polyline Trace (Needs RacingCircuits SVG)"
  }
]
```
