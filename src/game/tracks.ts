import * as THREE from 'three';
import { SceneryTheme, TrackRegion, TrackSpec, TrackWaypoint } from './types';
import { getCustomTrackById } from './customTracks';

/**
 * Corner / anchor skeleton node used to generate high-density (50-100+) true-to-life
 * waypoints with collinear straight anchors and sharp 3-5 point corner clusters:
 * [x, z, y?, cornerRadius?, bankingDeg?]
 * - cornerRadius === 0 -> collinear straight/elevation anchor (passes straight through)
 * - cornerRadius > 0   -> sharp circular fillet arc cluster (braking entry -> apex(es) -> exit)
 */
type CircuitNode = [
  x: number,
  z: number,
  y?: number,
  cornerRadius?: number,
  bankingDeg?: number,
];

function buildCircuitPoints(
  nodes: CircuitNode[],
  targetLengthMeters: number,
  trackWidth: number,
): TrackWaypoint[] {
  const minSafeRadius = Math.max(12.0, trackWidth * 0.72);

  const expandFromNodes = (input: CircuitNode[], minStraightGap: number): TrackWaypoint[] => {
    const n = input.length;
    const cornerExpanded: Array<{
      x: number;
      y: number;
      z: number;
      banking: number;
      isCorner: boolean;
    }> = [];

    for (let i = 0; i < n; i++) {
      const prev = input[(i - 1 + n) % n];
      const curr = input[i];
      const next = input[(i + 1) % n];

      const p0x = prev[0], p0z = prev[1];
      const p1x = curr[0], p1z = curr[1], p1y = curr[2] ?? 0;
      const p2x = next[0], p2z = next[1];
      const reqR = curr[3] ?? 18;
      const bank = curr[4] ?? 0;

      const inDx = p1x - p0x;
      const inDz = p1z - p0z;
      const inLen = Math.hypot(inDx, inDz) || 1;
      const uInX = inDx / inLen;
      const uInZ = inDz / inLen;

      const outDx = p2x - p1x;
      const outDz = p2z - p1z;
      const outLen = Math.hypot(outDx, outDz) || 1;
      const uOutX = outDx / outLen;
      const uOutZ = outDz / outLen;

      const dot = Math.max(-0.999, Math.min(0.999, uInX * uOutX + uInZ * uOutZ));
      const phi = Math.acos(dot);

      // Only pass straight through truly collinear vertices (< ~5 deg).
      // Any sharper bend with reqR=0 gets a smooth safe fillet so no sharp vertex kink occurs.
      if (phi < 0.085) {
        cornerExpanded.push({ x: p1x, y: p1y, z: p1z, banking: bank, isCorner: false });
        continue;
      }

      const r = reqR <= 0 ? Math.max(minSafeRadius, 18) : Math.max(minSafeRadius, reqR);
      const tanHalf = Math.tan(phi * 0.5);
      const maxTrim = 0.45 * Math.min(inLen, outLen);
      const trim = Math.min(r * tanHalf, maxTrim);
      const rEff = trim / Math.max(1e-4, tanHalf);

      const ax = p1x - uInX * trim;
      const az = p1z - uInZ * trim;
      const bx = p1x + uOutX * trim;
      const bz = p1z + uOutZ * trim;

      const cross = uInX * uOutZ - uInZ * uOutX;
      const sign = cross >= 0 ? 1 : -1;
      // Inward normal from incoming tangent at entry A
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
      const desiredArcChords = Math.max(2, Math.min(5, Math.round(arcLen / 9.5)));
      const interiorPts = Math.max(1, desiredArcChords - 1);

      cornerExpanded.push({ x: ax, y: p1y, z: az, banking: bank * 0.65, isCorner: true });
      for (let k = 1; k <= interiorPts; k++) {
        const frac = k / (interiorPts + 1);
        const theta = angA + dAng * frac;
        cornerExpanded.push({
          x: cx + Math.cos(theta) * rEff,
          y: p1y,
          z: cz + Math.sin(theta) * rEff,
          banking: bank,
          isCorner: true,
        });
      }
      cornerExpanded.push({ x: bx, y: p1y, z: bz, banking: bank * 0.65, isCorner: true });
    }

    // Remove near-coincident transition points (< 7.5m) that cause Catmull-Rom tangent overshoot
    const cleaned: typeof cornerExpanded = [];
    for (let i = 0; i < cornerExpanded.length; i++) {
      const pt = cornerExpanded[i];
      if (cleaned.length > 0) {
        const prev = cleaned[cleaned.length - 1];
        if (Math.hypot(pt.x - prev.x, pt.z - prev.z) < 7.2) {
          // Average nearly coincident junction points cleanly
          prev.x = (prev.x + pt.x) * 0.5;
          prev.y = (prev.y + pt.y) * 0.5;
          prev.z = (prev.z + pt.z) * 0.5;
          prev.banking = (prev.banking + pt.banking) * 0.5;
          continue;
        }
      }
      cleaned.push({ ...pt });
    }
    if (cleaned.length > 2) {
      const first = cleaned[0];
      const last = cleaned[cleaned.length - 1];
      if (Math.hypot(first.x - last.x, first.z - last.z) < 7.2) {
        first.x = (first.x + last.x) * 0.5;
        first.y = (first.y + last.y) * 0.5;
        first.z = (first.z + last.z) * 0.5;
        cleaned.pop();
      }
    }

    // Insert collinear straightaway anchors (entry collar, mid-straight anchors, exit collar)
    const dense: TrackWaypoint[] = [];
    const m = cleaned.length;
    for (let i = 0; i < m; i++) {
      const a = cleaned[i];
      const b = cleaned[(i + 1) % m];

      dense.push({
        x: Math.round(a.x * 10) / 10,
        y: Math.round(a.y * 10) / 10,
        z: Math.round(a.z * 10) / 10,
        ...(Math.abs(a.banking) > 0.05 ? { banking: Math.round(a.banking * 10) / 10 } : {}),
      });

      const segLen = Math.hypot(b.x - a.x, b.z - a.z);
      if (segLen > minStraightGap) {
        const steps = Math.max(2, Math.round(segLen / minStraightGap));
        // Add tight collinear entry/exit collar points ~12m inside corners so low-tension Catmull-Rom never bows
        const collarTs: number[] = [];
        if (segLen >= 34) {
          collarTs.push(12 / segLen);
          for (let s = 1; s < steps; s++) {
            const tMid = s / steps;
            if (tMid > 18 / segLen && tMid < 1 - 18 / segLen) {
              collarTs.push(tMid);
            }
          }
          collarTs.push(1 - 12 / segLen);
        } else {
          collarTs.push(0.5);
        }
        for (const frac of collarTs) {
          const bankVal = a.banking + (b.banking - a.banking) * frac;
          dense.push({
            x: Math.round((a.x + (b.x - a.x) * frac) * 10) / 10,
            y: Math.round((a.y + (b.y - a.y) * frac) * 10) / 10,
            z: Math.round((a.z + (b.z - a.z) * frac) * 10) / 10,
            ...(Math.abs(bankVal) > 0.05 ? { banking: Math.round(bankVal * 10) / 10 } : {}),
          });
        }
      }
    }
    return dense;
  };

  // Pass 1: Measure initial polygon/spline length and re-center
  let sumX = 0;
  let sumZ = 0;
  for (const nd of nodes) {
    sumX += nd[0];
    sumZ += nd[1];
  }
  const meanX = sumX / nodes.length;
  const meanZ = sumZ / nodes.length;
  const centered: CircuitNode[] = nodes.map((nd) => [
    nd[0] - meanX,
    nd[1] - meanZ,
    nd[2] ?? 0,
    nd[3],
    nd[4],
  ]);

  const probe = expandFromNodes(centered, 30);
  const probeCurve = new THREE.CatmullRomCurve3(
    probe.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    true,
    'centripetal',
    0.5,
  );
  probeCurve.arcLengthDivisions = 1800;
  const rawLength = probeCurve.getLength() || 1000;
  const scale = targetLengthMeters / rawLength;

  // Pass 2: Scale skeleton to exact world meters BEFORE corner filleting so minSafeRadius is guaranteed
  const scaledNodes: CircuitNode[] = centered.map((nd) => [
    nd[0] * scale,
    nd[1] * scale,
    nd[2] ?? 0,
    nd[3] !== undefined ? (nd[3] > 0 ? Math.max(minSafeRadius, nd[3] * Math.sqrt(scale)) : 0) : undefined,
    nd[4],
  ]);

  let gap = 28;
  let result = expandFromNodes(scaledNodes, gap);
  while (result.length < 56 && gap > 12) {
    gap -= 4;
    result = expandFromNodes(scaledNodes, gap);
  }
  return result;
}

export const TRACKS: TrackSpec[] = [
  // ==================== FLAGSHIP 10 STARTER PACK ====================
  {
    id: 'spa-francorchamps',
    name: 'Circuit de Spa-Francorchamps',
    shortName: 'Spa',
    country: 'Belgium',
    region: 'Europe',
    seriesTags: ['F1', 'WEC'],
    flagship: true,
    scenery: 'forest',
    asphaltColor: '#262b33',
    kerbPrimary: '#e11d48',
    kerbSecondary: '#facc15',
    trackWidth: 18,
    targetLapSeconds: 70,
    corners: 19,
    // CW: Pit Straight -> La Source hairpin -> downhill to Eau Rouge/Raidillon -> dead-straight Kemmel Straight -> Les Combes chicane -> Bruxelles -> Pouhon -> Fagnes -> Stavelot -> Blanchimont -> Bus Stop chicane
    waypoints: buildCircuitPoints(
      [
        [-220, -395, 0, 0],
        [85, -395, 0, 0],         // Main straight end
        [245, -395, 1, 13.5],     // La Source entry turn
        [270, -358, 1.5, 13.5],   // La Source exit turn
        [200, -255, 3, 0],        // Downhill past old pits
        [218, -165, 2, 42],       // Eau Rouge dip
        [258, -85, 10, 48],       // Raidillon uphill bend
        [285, -10, 26, 44],       // Raidillon crest
        [405, 265, 22, 0],        // Kemmel Straight (dead straight!)
        [435, 345, 21, 13.5],     // Les Combes right entry
        [390, 365, 20, 13.5],     // Les Combes left
        [365, 420, 19, 15],       // Malmedy right
        [280, 355, 16, 22],       // Rivage / Bruxelles entry
        [225, 318, 15, 14.5],     // Bruxelles hairpin apex
        [235, 395, 13, 18],       // Speaker's Corner exit
        [170, 475, 10, 34],       // Pouhon entry
        [45, 505, 8, 46],         // Pouhon double-left apex
        [-75, 475, 7, 38],        // Pouhon exit
        [-165, 405, 5, 15],       // Fagnes right
        [-220, 425, 5, 15],       // Fagnes left
        [-295, 365, 4, 24],       // Stavelot entry
        [-355, 285, 3, 28],       // Stavelot exit onto straight
        [-395, 140, 2, 95],       // Paul Frere / Blanchimont 1
        [-375, -105, 1, 95],      // Blanchimont 2
        [-325, -285, 0.5, 13],    // Bus Stop braking left/right entry
        [-272, -310, 0, 12.5],    // Bus Stop right apex
        [-298, -385, 0, 13.5],    // Bus Stop left onto pit straight
      ],
      3320,
      18,
    ),
  },
  {
    id: 'daytona-road',
    name: 'Daytona International Speedway (Road)',
    shortName: 'Daytona',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['IMSA'],
    flagship: true,
    scenery: 'stadium',
    asphaltColor: '#272b34',
    kerbPrimary: '#facc15',
    kerbSecondary: '#2563eb',
    trackWidth: 19,
    targetLapSeconds: 46,
    corners: 12,
    // CCW Oval wrapper + Infield Road Course: Tri-Oval Frontstretch -> T1 left into infield -> T2 -> International Horseshoe -> T5 Kink -> West Horseshoe -> Banked Oval T1-2 -> Backstretch + Bus Stop Chicane -> Banked Oval T3-4
    waypoints: buildCircuitPoints(
      [
        [-110, 255, 0, 0, 5],
        [45, 275, 0, 90, 6],       // Tri-Oval Start/Finish kink
        [205, 255, 0, 0, 5],
        [265, 245, 2, 13.5, 4],    // Turn 1 braking left into infield
        [225, 145, 0, 26],         // T2 infield sweep
        [155, 95, 0, 13.5],        // International Horseshoe entry
        [170, 55, 0, 13.5],        // International Horseshoe exit
        [235, -35, 0, 28],         // T5 infield kink
        [120, -105, 0, 14],        // West Horseshoe entry
        [85, -75, 0, 14],          // West Horseshoe exit
        [-15, -35, 0, 22],         // Infield exit straight
        [-95, -185, 4, 48, 15],    // Exit onto NASCAR Oval T1-T2
        [-225, -235, 7, 56, 16],   // Oval Banking T2
        [-315, -145, 6, 44, 10],   // Superstretch entry
        [-315, -45, 4, 0, 0],      // Superstretch straight
        [-315, 20, 4, 13],         // Le Mans Bus Stop entry (left)
        [-260, 45, 4, 13],         // Bus Stop right apex
        [-295, 95, 4, 13],         // Bus Stop exit
        [-305, 175, 7, 48, 16],    // Oval Banking T3-T4
        [-230, 245, 3, 44, 12],    // T4 exit onto tri-oval
      ],
      2120,
      19,
    ),
  },
  {
    id: 'laguna-seca',
    name: 'WeatherTech Raceway Laguna Seca',
    shortName: 'Laguna Seca',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['IMSA'],
    flagship: true,
    scenery: 'desert',
    asphaltColor: '#2f333b',
    kerbPrimary: '#dc2626',
    kerbSecondary: '#f8fafc',
    trackWidth: 16.5,
    targetLapSeconds: 36,
    corners: 11,
    // CCW: Front Straight -> T1 crest -> Andretti Hairpin (L) -> T3 -> T4 -> T5 uphill -> T6 -> Rahal Crest -> Corkscrew Plunge (L-R) -> Rainey -> T10 -> T11 hairpin (L)
    waypoints: buildCircuitPoints(
      [
        [-115, 190, 0, 0],
        [95, 190, 1.5, 0],         // Front straight T1 crest
        [225, 185, 2, 14],         // Andretti Hairpin entry (double-apex left)
        [235, 138, 2.5, 14],       // Andretti Hairpin exit
        [155, 108, 3, 18],         // Transition toward T3
        [185, 42, 4.5, 22],        // Turn 3 right
        [238, -22, 7, 24],         // Turn 4 right
        [178, -112, 13, 22],       // Turn 5 uphill left
        [105, -172, 18, 28],       // Turn 6 fast left
        [-15, -195, 23, 0],        // Rahal Straight steep climb
        [-105, -195, 22, 13],      // Corkscrew top left
        [-128, -142, 12, 13],      // Corkscrew steep S-plunge right!
        [-198, -108, 8, 24],       // Rainey Curve fast left
        [-188, -32, 5, 20],        // Turn 10 right
        [-252, 42, 3, 22],         // Approach to T11
        [-262, 152, 1, 13.5],      // Turn 11 tight hairpin entry
        [-215, 188, 0, 13.5],      // Turn 11 exit onto straight
      ],
      1660,
      16.5,
    ),
  },
  {
    id: 'le-mans',
    name: 'Circuit de la Sarthe (Le Mans)',
    shortName: 'Le Mans',
    country: 'France',
    region: 'Europe',
    seriesTags: ['WEC'],
    flagship: true,
    scenery: 'forest',
    asphaltColor: '#252a32',
    kerbPrimary: '#facc15',
    kerbSecondary: '#1d4ed8',
    trackWidth: 18.5,
    targetLapSeconds: 72,
    corners: 21,
    // CW: Pit Straight -> Dunlop Curve & Chicane -> Forest Esses -> Tertre Rouge -> 3-Part Mulsanne Straight (2 sharp chicanes!) -> Mulsanne Hairpin -> Indianapolis -> Arnage -> Porsche Curves -> Ford Chicanes
    waypoints: buildCircuitPoints(
      [
        [-210, -455, 0, 0],
        [45, -455, 0, 0],          // Pit straight
        [155, -430, 5, 32],        // Dunlop Curve
        [210, -430, 6, 13],        // Dunlop Chicane left
        [235, -385, 5, 13],        // Dunlop Chicane right
        [285, -355, 3, 22],        // Esses 1
        [255, -295, 2, 22],        // Esses 2
        [305, -235, 1, 20],        // Esses 3
        [395, -235, 1, 14],        // Tertre Rouge 90° right onto Mulsanne!
        [400, -100, 1, 0],         // Mulsanne Straight Part 1
        [405, 20, 1, 13],          // Mulsanne Chicane 1 (right-left-right)
        [445, 45, 1, 13],
        [410, 75, 1, 13],
        [415, 215, 1, 0],          // Mulsanne Straight Part 2
        [420, 290, 1, 13],         // Mulsanne Chicane 2 (left-right-left)
        [378, 318, 1, 13],
        [418, 348, 1, 13],
        [425, 450, 2, 0],          // Mulsanne Straight Part 3 crest
        [425, 505, 1, 13],         // Mulsanne Hairpin entry
        [385, 520, 1, 13],         // Mulsanne Hairpin exit
        [155, 495, 0, 0],          // Straight to Indianapolis
        [55, 485, 0, 22],          // Indianapolis fast right
        [15, 445, 0, 14],          // Indianapolis tight 90° left
        [15, 345, 0, 0],           // Short straight to Arnage
        [15, 305, 0, 13],          // Arnage 90° right!
        [-145, 285, 0, 0],         // Straight to Porsche Curves
        [-235, 245, 0, 32],        // Porsche Curve 1 right
        [-275, 155, 0, 32],        // Porsche Curve 2 left
        [-255, 65, 0, 34],         // Porsche Curve 3 left
        [-315, -35, 0, 32],        // Karting / Corvette right
        [-285, -185, 0, 0],        // Maison Blanche approach
        [-290, -255, 0, 13],       // Ford Chicane 1 left
        [-245, -280, 0, 13],       // Ford Chicane 1 right
        [-285, -335, 0, 13],       // Ford Chicane 2 left
        [-240, -370, 0, 13],       // Ford Chicane 2 right
        [-260, -445, 0, 16],       // Pit straight entry
      ],
      3420,
      18.5,
    ),
  },
  {
    id: 'monza',
    name: 'Autodromo Nazionale Monza',
    shortName: 'Monza',
    country: 'Italy',
    region: 'Europe',
    seriesTags: ['F1', 'WEC'],
    flagship: true,
    scenery: 'parkland',
    asphaltColor: '#252930',
    kerbPrimary: '#16a34a',
    kerbSecondary: '#dc2626',
    trackWidth: 18,
    targetLapSeconds: 40,
    corners: 11,
    // CW: Long straight -> Rettifilo Chicane (R-L) -> Curva Grande -> Roggia Chicane (L-R) -> Lesmo 1 (90° R) -> Lesmo 2 (90° R) -> Ascari Chicane (L-R-L) -> Back Straight -> Parabolica
    waypoints: buildCircuitPoints(
      [
        [-185, -255, 0, 0],
        [200, -255, 0, 0],         // Long main straight
        [240, -255, 0, 12.5],      // Variante del Rettifilo right
        [245, -222, 0, 12.5],      // Rettifilo left
        [325, -205, 0, 44],        // Curva Grande sweeping right
        [345, -75, 0, 46],         // Curva Grande exit
        [265, 25, 0, 0],           // Approach to Roggia
        [230, 55, 0, 13],          // Variante della Roggia left
        [225, 92, 0, 13],          // Roggia right
        [275, 165, 0, 15],         // Lesmo 1 (90° right)
        [230, 215, 0, 0],          // Short chute
        [205, 255, 0, 15],         // Lesmo 2 (90° right)
        [65, 230, 0, 0],           // Straight downhill under Serraglio
        [-45, 215, 0, 14],         // Variante Ascari entry left
        [-95, 245, 0, 15],         // Ascari apex right
        [-145, 210, 0, 15],        // Ascari exit left
        [-285, 185, 0, 0],         // Dead-straight back straight
        [-335, 175, 0, 22],        // Parabolica entry right
        [-355, 65, 0, 38],         // Parabolica sweeping mid
        [-305, -210, 0, 38],       // Parabolica exit onto main straight
        [-265, -255, 0, 18],
      ],
      1980,
      18,
    ),
  },
  {
    id: 'silverstone',
    name: 'Silverstone Grand Prix Circuit',
    shortName: 'Silverstone',
    country: 'United Kingdom',
    region: 'Europe',
    seriesTags: ['F1'],
    flagship: true,
    scenery: 'stadium',
    asphaltColor: '#2a2e36',
    kerbPrimary: '#dc2626',
    kerbSecondary: '#ffffff',
    trackWidth: 18.5,
    targetLapSeconds: 46,
    corners: 18,
    // CW: Hamilton Straight -> Abbey (R) -> Farm (L) -> Village (R) -> The Loop Hairpin (L) -> Aintree -> Wellington Straight -> Brooklands (L) -> Luffield (R) -> Woodcote -> Copse (90° R) -> Maggotts/Becketts -> Hangar Straight -> Stowe (R) -> Vale/Club
    waypoints: buildCircuitPoints(
      [
        [-165, -295, 0, 0],
        [45, -295, 0, 0],          // Hamilton Straight
        [135, -270, 0, 26],        // Abbey fast right
        [155, -215, 0, 22],        // Farm left
        [205, -185, 0, 13.5],      // Village right
        [170, -145, 0, 13],        // The Loop tight left hairpin
        [225, -105, 0, 22],        // Aintree kink
        [195, 45, 0, 0],           // Wellington Straight
        [185, 105, 0, 15],         // Brooklands left
        [115, 125, 0, 18],         // Luffield 180° right
        [110, 75, 0, 18],          // Luffield exit
        [45, 95, 0, 28],           // Woodcote onto National Straight
        [-65, 195, 0, 0],          // National Pit Straight
        [-115, 225, 0, 20],        // Copse 90° right!
        [-215, 215, 0, 24],        // Maggotts left
        [-255, 165, 0, 22],        // Becketts right
        [-225, 115, 0, 22],        // Becketts left
        [-275, 55, 0, 24],         // Chapel right onto Hangar Straight
        [-290, -155, 0, 0],        // Dead-straight Hangar Straight
        [-295, -215, 0, 18],       // Stowe 90° right!
        [-225, -255, 0, 0],        // Approach Vale
        [-215, -295, 0, 13.5],     // Vale left chicane
        [-190, -325, 0, 18],       // Club double-right onto Hamilton Straight
      ],
      2150,
      18.5,
    ),
  },
  {
    id: 'suzuka',
    name: 'Suzuka International Racing Course',
    shortName: 'Suzuka',
    country: 'Japan',
    region: 'Asia-Pacific & Middle East',
    seriesTags: ['F1'],
    flagship: true,
    scenery: 'stadium',
    asphaltColor: '#262b33',
    kerbPrimary: '#ef4444',
    kerbSecondary: '#f8fafc',
    trackWidth: 17.5,
    targetLapSeconds: 52,
    corners: 18,
    // Figure-8! Pit Straight -> T1/T2 (R) -> S-Curves -> Dunlop (L) -> Degner 1 (R) -> Degner 2 (90° R) -> UNDERPASS (y=0) -> Hairpin (L) -> 200R -> Spoon (L) -> OVERPASS (+11m across underpass!) -> 130R -> Casio Chicane
    waypoints: buildCircuitPoints(
      [
        [-95, -265, 3, 0],
        [115, -265, 0, 0],         // Pit Straight downhill
        [245, -265, 0, 22],        // T1 fast right
        [275, -210, 0, 18],        // T2 right
        [225, -175, 1, 18],        // Esses 1 left
        [255, -120, 2, 18],        // Esses 2 right
        [195, -80, 3, 18],         // Esses 3 left
        [210, -20, 4, 22],         // Esses 4 right
        [120, 30, 5, 24],          // Dunlop curve uphill left
        [35, 35, 3, 18],           // Degner 1 fast right
        [-5, 65, 1, 13.5],         // Degner 2 90° right
        [-25, 5, 0, 0],            // Straight UNDERPASS bridge (0m)!
        [-75, -60, 0, 13],         // T11 Hairpin entry
        [-115, -45, 0, 13],        // T11 Hairpin exit
        [-145, 25, 1, 24],         // 200R fast sweep
        [-255, 85, 2, 18],         // Spoon Curve entry left
        [-295, 55, 3, 18],         // Spoon Curve exit left
        [-265, -35, 5, 0],         // Back Straight climbing
        [-145, -35, 11, 0],        // OVERPASS BRIDGE (+11m directly above underpass!)
        [-15, -55, 9, 44],         // 130R ultra-fast left
        [-20, -145, 6, 0],         // Approach to Casio
        [-45, -195, 4, 13],        // Casio Triangle right
        [-105, -205, 4, 13],       // Casio Triangle left
        [-155, -255, 3, 16],       // Final kink onto Pit Straight
      ],
      2440,
      17.5,
    ),
  },
  {
    id: 'monaco',
    name: 'Circuit de Monaco',
    shortName: 'Monaco',
    country: 'Monaco',
    region: 'Europe',
    seriesTags: ['F1'],
    flagship: true,
    scenery: 'coastal',
    asphaltColor: '#2a2f38',
    kerbPrimary: '#dc2626',
    kerbSecondary: '#ffffff',
    trackWidth: 14.5,
    targetLapSeconds: 38,
    corners: 19,
    // CW Harbor Loop: Start Straight -> Sainte Devote 90° R -> Beau Rivage climb -> Massenet -> Casino Square -> Mirabeau Haute -> Fairmont Hairpin -> Portier -> Tunnel -> Nouvelle Chicane -> Tabac -> Swimming Pool S-chicane -> Rascasse -> Noghes
    waypoints: buildCircuitPoints(
      [
        [-95, -185, 0, 0],
        [45, -185, 0, 0],          // Pit straight
        [105, -210, 2, 11.5],      // Sainte-Devote 90° right uphill!
        [135, -300, 9, 0],         // Beau Rivage hill climb
        [195, -315, 15, 16],       // Massenet left
        [240, -280, 16, 12],       // Casino Square right
        [235, -205, 12, 11.5],     // Mirabeau Haute right
        [295, -175, 8, 11],        // Fairmont Hairpin tightest 180° left!
        [285, -140, 6, 11],        // Fairmont exit
        [240, -110, 3, 12],        // Mirabeau Bas right
        [295, -55, 1, 13],         // Portier double-right down to sea level
        [245, 25, 0, 28],          // Tunnel entry sweep
        [145, 40, 0, 0],           // Straight Tunnel blast
        [75, 40, 0, 11],           // Nouvelle Chicane entry left
        [55, 70, 0, 11],           // Nouvelle Chicane exit right
        [-25, 55, 0, 0],           // Harbor straight
        [-75, 55, 0, 12.5],        // Tabac 90° left
        [-90, -15, 0, 12],         // Swimming Pool S-1 right
        [-125, -25, 0, 12],        // Swimming Pool S-2 left
        [-130, -85, 0, 11.5],      // Swimming Pool exit chicane
        [-155, -115, 0, 11],       // La Rascasse 160° right!
        [-125, -145, 0, 11],       // Rascasse exit
        [-140, -185, 0, 11.5],     // Anthony Noghes 90° right onto start straight
      ],
      1660,
      14.5,
    ),
  },
  {
    id: 'cota',
    name: 'Circuit of the Americas (Austin)',
    shortName: 'COTA',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['F1', 'WEC'],
    flagship: true,
    scenery: 'desert',
    asphaltColor: '#282d35',
    kerbPrimary: '#dc2626',
    kerbSecondary: '#f8fafc',
    trackWidth: 18,
    targetLapSeconds: 48,
    corners: 20,
    // CCW: Steep uphill Main Straight -> T1 tight hairpin (L) -> downhill Esses (R-L-R-L-R) -> T11 tight hairpin (L) -> dead-straight 1.2km Back Straight -> T12 (90° L) -> T13-15 Stadium -> T16-18 triple right -> T19-20 (L)
    waypoints: buildCircuitPoints(
      [
        [-95, 205, 0, 0],
        [155, 205, 12, 0],         // Steep uphill Pit Straight
        [305, 218, 19, 14],        // Iconic single steep uphill T1 peak hairpin!
        [220, 115, 10, 22],        // T2 fast right downhill into Esses
        [255, 58, 7, 19],          // T3 left
        [215, 2, 5, 19],           // T4 right
        [255, -54, 3, 19],         // T5 left
        [220, -108, 2, 19],        // T6 right
        [262, -162, 1, 18],        // T7-T8 S-bend
        [195, -198, 0, 18],        // T9-T10
        [268, -245, 0, 13.5],      // T11 sharp hairpin entry
        [225, -275, 0, 13.5],      // T11 hairpin exit onto Back Straight
        [-235, -225, 0, 0],        // Long dead-straight 1.2km Back Straight!
        [-315, -212, 0, 13.5],     // T12 heavy braking 90° left!
        [-295, -105, 0, 13.5],     // T13 Stadium right
        [-235, -92, 0, 13.5],      // T14 hairpin
        [-265, -28, 0, 13.5],      // T15 left
        [-335, 25, 0, 28],         // T16-17-18 sweeping triple-apex right
        [-320, 135, 0, 28],        // T18 exit
        [-235, 175, 0, 14],        // T19 90° left
        [-235, 205, 0, 14],        // T20 90° left onto Pit Straight
      ],
      2210,
      18,
    ),
  },
  {
    id: 'sebring',
    name: 'Sebring International Raceway',
    shortName: 'Sebring',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['IMSA', 'WEC'],
    flagship: true,
    scenery: 'desert',
    asphaltColor: '#373b42',
    kerbPrimary: '#2563eb',
    kerbSecondary: '#facc15',
    trackWidth: 18,
    targetLapSeconds: 45,
    corners: 17,
    // CW: Pit Straight -> T1 fast sweeping left? Look: North-up Sebring Pit Straight is West->East at bottom heading to T17 Sunset? Wait: Sunset Bend is at the South-East entering Pit Straight going West->East or East->West! Going East along top Pit Straight -> T1 left... wait: on Sebring CW overall: Sunset Bend (right) -> Pit Straight (+x) -> T1 sweeping right/left -> T3-5 chicane -> T7 Hairpin right -> T10-13 -> long Ulmann Straight (back bottom) -> T15-16 chicane -> Sunset Bend (180° right)!
    waypoints: buildCircuitPoints(
      [
        [-155, -225, 0, 0],
        [95, -225, 0, 0],          // Pit straight
        [195, -205, 0, 28],        // Turn 1 fast sweep
        [245, -255, 0, 14],        // Turn 3 right
        [285, -225, 0, 14],        // Turn 4 left
        [315, -155, 0, 22],        // Turn 5-6 sweep
        [265, -75, 0, 0],          // Runway straight to Hairpin
        [312, -15, 0, 16],         // T7 Hairpin tight right!
        [235, 12, 0, 16],          // T7 Hairpin exit
        [155, 55, 0, 16],          // Collier / Fangio chicane right
        [195, 115, 0, 16],         // Tower turn left
        [125, 185, 0, 14],         // Bishop Bend
        [-145, 225, 0, 0],         // HUGE dead-straight Ulmann Runway Straight!
        [-215, 225, 0, 13.5],      // T15 braking chicane right
        [-245, 185, 0, 13.5],      // T16 left
        [-295, 125, 0, 24],        // T17 Sunset Bend entry right!
        [-295, -95, 0, 28],        // Sunset Bend bumpy exit sweep
        [-245, -215, 0, 18],       // Pit wall entrance
      ],
      2050,
      18,
    ),
  },

  // ==================== REMAINING AMERICAS (15 tracks) ====================
  {
    id: 'long-beach',
    name: 'Streets of Long Beach',
    shortName: 'Long Beach',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['IMSA'],
    flagship: false,
    scenery: 'street-night',
    asphaltColor: '#252932',
    kerbPrimary: '#ef4444',
    kerbSecondary: '#facc15',
    trackWidth: 15.5,
    targetLapSeconds: 38,
    corners: 11,
    waypoints: buildCircuitPoints(
      [
        [-165, -165, 0, 0],
        [145, -195, 0, 95],        // Curved Shoreline Drive frontstretch
        [215, -185, 0, 12],        // T1 sharp 90° right!
        [235, -95, 0, 13],         // T2-T3 Fountain roundabout right
        [195, -65, 0, 13],         // Fountain roundabout exit
        [165, 15, 0, 12],          // T4 90° right
        [85, 15, 0, 12],           // T5 90° left
        [85, 115, 0, 12],          // T6 90° right onto Pine Ave
        [-45, 115, 0, 12],         // T7 90° left
        [-65, 185, 0, 12],         // T8 90° right onto Seaside Way
        [-225, 185, 0, 0],         // Straight Seaside Way
        [-245, 125, 0, 14],        // T9-T10 fast right kink
        [-235, -85, 0, 0],         // Back approach
        [-245, -145, 0, 11.5],     // T11 tight 180° hairpin!
        [-205, -165, 0, 12],       // Exit onto Shoreline Drive
      ],
      1680,
      15.5,
    ),
  },
  {
    id: 'detroit-street',
    name: 'Detroit Street Circuit',
    shortName: 'Detroit',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['IMSA'],
    flagship: false,
    scenery: 'street-night',
    asphaltColor: '#242830',
    kerbPrimary: '#2563eb',
    kerbSecondary: '#ffffff',
    trackWidth: 15,
    targetLapSeconds: 39,
    corners: 14,
    // CCW downtown Jefferson Ave -> T1-3 Hairpin -> Bates St downhill -> Atwater riverfront -> St. Antoine -> Franklin split pit -> Rivard back to Jefferson
    waypoints: buildCircuitPoints(
      [
        [-155, 148, 0, 0],
        [235, 148, 0, 0],          // Long dead-straight Jefferson Ave
        [295, 132, 0, 14],         // T1-2 Hairpin entry
        [295, 72, 0, 14],          // T3 Hairpin exit back onto Jefferson
        [45, 72, 0, 0],            // Return along parallel Jefferson lane
        [-25, 72, 0, 13],          // Sharp right downhill Bates St
        [-35, -45, 2, 13],         // 90° left onto Atwater riverfront straight
        [-145, -45, 0, 14],        // Atwater St west to St. Antoine
        [-152, -148, 0, 15],       // St. Antoine north to Franklin St
        [-255, -148, 0, 15],       // Franklin St west to Rivard
        [-265, 128, 0, 15],        // Rivard St south to Jefferson Ave
        [-215, 148, 0, 14],        // Final turn onto Jefferson Ave Pit Straight
      ],
      1700,
      15,
    ),
  },
  {
    id: 'mid-ohio',
    name: 'Mid-Ohio Sports Car Course',
    shortName: 'Mid-Ohio',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['IMSA'],
    flagship: false,
    scenery: 'parkland',
    asphaltColor: '#262b33',
    kerbPrimary: '#dc2626',
    kerbSecondary: '#facc15',
    trackWidth: 16.5,
    targetLapSeconds: 38,
    corners: 13,
    waypoints: buildCircuitPoints(
      [
        [-125, -195, 0, 0],
        [65, -195, 0, 0],          // Pit straight
        [155, -185, 2, 18],        // Turn 1 fast left
        [195, -245, 6, 12.5],      // Keyhole hairpin entry
        [225, -210, 6, 12.5],      // Keyhole hairpin exit!
        [195, -65, 4, 0],          // Long dead-straight Backstraight
        [195, 65, 2, 13],          // T4 China Beach sharp right
        [105, 85, 4, 15],          // T5 Madness crest
        [135, 165, 6, 16],         // T7-T8 dip
        [35, 185, 4, 15],          // T9 right
        [-55, 145, 2, 15],         // T10 chicane
        [-145, 185, 0, 22],        // T11 Thunder Valley
        [-235, 125, 0, 20],        // T12 The Carousel 180° right
        [-225, -25, 1, 20],        // Carousel exit
        [-175, -185, 0, 15],       // T13 onto front straight
      ],
      1680,
      16.5,
    ),
  },
  {
    id: 'watkins-glen',
    name: 'Watkins Glen International (Full Boot)',
    shortName: 'Watkins Glen',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['IMSA'],
    flagship: false,
    scenery: 'parkland',
    asphaltColor: '#262a31',
    kerbPrimary: '#2563eb',
    kerbSecondary: '#facc15',
    trackWidth: 18,
    targetLapSeconds: 36,
    corners: 11,
    waypoints: buildCircuitPoints(
      [
        [-135, -215, 0, 0],
        [115, -215, 0, 0],         // Pit straight
        [205, -215, 1, 13.5],      // T1 "The 90" sharp right!
        [215, -125, 4, 34],        // Climbing Esses 1 (R)
        [185, -45, 8, 34],         // Esses 2 (L)
        [215, 65, 12, 0],          // Long dead-straight Backstraight
        [205, 135, 12, 13],        // Inner Loop Bus Stop entry
        [165, 155, 12, 13],        // Bus Stop exit
        [145, 225, 10, 24],        // Outer Loop sweeping right
        [25, 235, 8, 18],          // Chute left
        [-45, 295, 4, 13.5],       // Heel of the Boot hairpin
        [-115, 265, 2, 13.5],      // Toe of the Boot hairpin
        [-115, 175, 4, 15],        // Sole climb right
        [-205, 125, 5, 14],        // Turn 10 90° left
        [-215, -155, 2, 16],       // Turn 11 sweeping right onto straight
      ],
      1680,
      18,
    ),
  },
  {
    id: 'mosport',
    name: 'Canadian Tire Motorsport Park (Mosport)',
    shortName: 'Mosport',
    country: 'Canada',
    region: 'Americas',
    seriesTags: ['IMSA'],
    flagship: false,
    scenery: 'forest',
    asphaltColor: '#282c34',
    kerbPrimary: '#ef4444',
    kerbSecondary: '#ffffff',
    trackWidth: 17,
    targetLapSeconds: 38,
    corners: 10,
    waypoints: buildCircuitPoints(
      [
        [-125, -205, 4, 0],
        [105, -205, 8, 0],         // Pit straight crest
        [215, -175, 10, 24],       // Turn 1 fast downhill right
        [245, -75, 2, 22],         // Turn 2 blind plunging double-apex left!
        [185, 25, 3, 22],          // Turn 3 right
        [225, 115, 1, 24],         // Turn 4 sweeping uphill
        [175, 195, 0, 13],         // T5A Moss Corner hairpin entry!
        [125, 185, 0, 13],         // T5B Moss Corner hairpin exit
        [-175, 195, 8, 0],         // Long uphill Mario Andretti Straight!
        [-235, 145, 12, 18],       // Turn 8 fast right
        [-205, -25, 11, 18],       // Turn 9 left
        [-235, -155, 8, 16],       // Turn 10 right onto pit straight
      ],
      1720,
      17,
    ),
  },
  {
    id: 'lime-rock',
    name: 'Lime Rock Park',
    shortName: 'Lime Rock',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['IMSA'],
    flagship: false,
    scenery: 'parkland',
    asphaltColor: '#272b33',
    kerbPrimary: '#16a34a',
    kerbSecondary: '#facc15',
    trackWidth: 15.5,
    targetLapSeconds: 35,
    corners: 7,
    waypoints: buildCircuitPoints(
      [
        [-145, -175, 0, 0],
        [135, -175, 0, 0],         // Sam Posey Pit Straight
        [225, -155, 0, 16],        // Big Bend entry
        [235, -85, 0, 16],         // Big Bend exit (180° sweeping right)
        [115, -65, 1, 13],         // Turn 3 Left-Hander!
        [85, 25, 1, 13],           // Turn 4 Right-Hander onto No Name Straight
        [-25, 115, 4, 0],          // No Name Straight
        [-135, 155, 12, 22],       // The Uphill crest!
        [-225, 95, 10, 18],        // West Bend
        [-215, -95, 4, 22],        // The Downhill fast right onto Sam Posey Straight
      ],
      1540,
      15.5,
    ),
  },
  {
    id: 'road-america',
    name: 'Road America',
    shortName: 'Road America',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['IMSA'],
    flagship: false,
    scenery: 'forest',
    asphaltColor: '#272c34',
    kerbPrimary: '#dc2626',
    kerbSecondary: '#ffffff',
    trackWidth: 18,
    targetLapSeconds: 42,
    corners: 14,
    waypoints: buildCircuitPoints(
      [
        [-145, -245, 0, 0],
        [155, -245, 0, 0],         // Main Pit Straight
        [245, -245, 2, 14],        // Turn 1 sharp 90° right!
        [235, -125, 4, 14],        // Turn 3 90° right
        [115, -105, 3, 28],        // Moraine Sweep straight
        [52, -105, 0, 16.5],       // Turn 5 heavy braking 90° left!
        [55, -28, 4, 16],          // Turn 6 uphill left under Corvette Bridge
        [135, -5, 6, 16],          // Turn 7 right
        [115, 75, 4, 14],          // Turn 8 left onto Kettle Bottoms
        [155, 215, 2, 0],          // Kettle Bottoms straight
        [85, 275, 2, 26],          // The Carousel long 180° right sweep!
        [-35, 265, 3, 26],         // Carousel exit
        [-115, 195, 4, 38],        // The Kink!
        [-215, 145, 3, 0],         // Straight to Canada Corner
        [-272, 145, 1, 16.5],      // Canada Corner 90° right!
        [-248, -25, 2, 16],        // Turn 13-14 climbing onto Pit Straight
        [-235, -225, 4, 16],
      ],
      1950,
      18,
    ),
  },
  {
    id: 'vir',
    name: 'VIRginia International Raceway',
    shortName: 'VIR',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['IMSA'],
    flagship: false,
    scenery: 'parkland',
    asphaltColor: '#272c34',
    kerbPrimary: '#facc15',
    kerbSecondary: '#16a34a',
    trackWidth: 16.5,
    targetLapSeconds: 38,
    corners: 17,
    waypoints: buildCircuitPoints(
      [
        [-135, -225, 0, 0],
        [95, -225, 0, 0],          // Front Straight
        [225, -225, 1, 12.5],      // Turn 1 Horseshoe entry
        [225, -165, 1, 12.5],      // Turn 1 Horseshoe exit
        [145, -120, 1, 13],        // Turn 3 Left Hook!
        [235, -65, 2, 16],         // NASCAR Bend
        [165, 5, 3, 20],           // The Snake
        [225, 85, 7, 22],          // Climbing Esses 1
        [175, 165, 9, 22],         // Climbing Esses 2
        [125, 225, 8, 12.5],       // Oak Tree slow hairpin!
        [75, 215, 7, 13],          // Oak Tree exit
        [-85, 235, 5, 0],          // Long Back Straight
        [-195, 215, 6, 13.5],      // Rollercoaster downhill chicane
        [-235, 165, 3, 13.5],      // Rollercoaster plunge
        [-245, 65, 2, 18],         // Hog Pen 1
        [-215, -55, 2, 22],        // Hog Pen 2
        [-245, -195, 0, 15],       // Final turn onto front straight
      ],
      1780,
      16.5,
    ),
  },
  {
    id: 'indianapolis-road',
    name: 'Indianapolis Motor Speedway (Road)',
    shortName: 'Indy Road',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['IMSA'],
    flagship: false,
    scenery: 'stadium',
    asphaltColor: '#252932',
    kerbPrimary: '#ef4444',
    kerbSecondary: '#ffffff',
    trackWidth: 18,
    targetLapSeconds: 35,
    corners: 14,
    waypoints: buildCircuitPoints(
      [
        [-135, -220, 0, 0],
        [145, -220, 0, 0],         // Brickyard frontstretch
        [218, -220, 0, 16.5],      // T1 sharp 90° right braking!
        [215, -130, 0, 16],        // T2-T3 left-right
        [135, -105, 0, 14],        // T4 right
        [135, 15, 0, 16],          // T5-T6 onto Hulman Blvd
        [212, 125, 0, 16.5],       // Hulman Blvd -> T7 braking right
        [105, 185, 0, 16],         // T8-T9
        [-45, 165, 0, 13],         // T10 tight hairpin
        [-115, 115, 0, 14],        // T11
        [-195, 165, 0, 14],        // T12-T13 infield exit
        [-265, 65, 2, 46, 11],     // Oval Turn 1 Banking!
        [-245, -175, 2, 42, 10],   // Oval banking exit onto Brickyard
      ],
      1660,
      18,
    ),
  },
  {
    id: 'road-atlanta',
    name: 'Michelin Raceway Road Atlanta',
    shortName: 'Road Atlanta',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['IMSA'],
    flagship: false,
    scenery: 'parkland',
    asphaltColor: '#2b2f38',
    kerbPrimary: '#dc2626',
    kerbSecondary: '#ffffff',
    trackWidth: 17,
    targetLapSeconds: 35,
    corners: 12,
    waypoints: buildCircuitPoints(
      [
        [-135, -185, 2, 0],
        [95, -185, 8, 0],          // Uphill pit straight
        [215, -165, 10, 22],       // Turn 1 uphill right
        [245, -75, 6, 20],         // Esses 1 downhill
        [195, 5, 3, 20],           // Esses 2
        [225, 85, 1, 20],          // Turn 5 uphill right
        [165, 165, 3, 18],         // Turn 6 right
        [85, 195, 3, 13],          // Turn 7 sharp 90° right onto Back Straight!
        [-135, 195, 4, 0],         // Long dead-straight Back Straight
        [-205, 185, 4, 12.5],      // T10A-T10B sharp chicane!
        [-235, 135, 8, 12.5],      // T10B exit climbing
        [-225, 15, 15, 22],        // Turn 11 crest under bridge!
        [-245, -145, 4, 22],       // Turn 12 terrifying downhill right onto straight!
      ],
      1650,
      17,
    ),
  },
  {
    id: 'montreal',
    name: 'Circuit Gilles Villeneuve (Montreal)',
    shortName: 'Montreal',
    country: 'Canada',
    region: 'Americas',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'parkland',
    asphaltColor: '#262b33',
    kerbPrimary: '#dc2626',
    kerbSecondary: '#ffffff',
    trackWidth: 17,
    targetLapSeconds: 40,
    corners: 14,
    waypoints: buildCircuitPoints(
      [
        [-185, -125, 0, 0],
        [55, -125, 0, 0],          // Pit straight
        [145, -145, 0, 13],        // T1-T2 Senna S left-right!
        [195, -105, 0, 14],        // T2 exit
        [245, -115, 0, 13],        // T3-T4 chicane
        [295, -85, 0, 13],         // T5 fast right
        [335, -35, 0, 14],         // T6-T7 chicane
        [295, 25, 0, 0],           // Straight to T8
        [235, 45, 0, 13],          // T8-T9 chicane
        [155, 85, 0, 0],           // Approach to Hairpin
        [115, 115, 0, 12.5],       // T10 L'Épingle hairpin entry!
        [75, 95, 0, 12.5],         // T10 L'Épingle hairpin exit
        [-245, 105, 0, 0],         // HUGE dead-straight Casino Straight!
        [-295, 95, 0, 12.5],       // T13 Wall of Champions chicane right
        [-285, 45, 0, 12.5],       // T14 Wall of Champions left
        [-275, -110, 0, 16],       // Return onto Pit Straight
      ],
      1840,
      17,
    ),
  },
  {
    id: 'miami',
    name: 'Miami International Autodrome',
    shortName: 'Miami',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'stadium',
    asphaltColor: '#262b34',
    kerbPrimary: '#06b6d4',
    kerbSecondary: '#ec4899',
    trackWidth: 17.5,
    targetLapSeconds: 37,
    corners: 19,
    // CCW: Pit straight -> T1 -> T2-3 -> sweeping T4-8 -> T11 -> T12-16 tight highway chicane -> long back straight -> T17 tight hairpin
    waypoints: buildCircuitPoints(
      [
        [-135, 185, 0, 0],
        [115, 185, 0, 0],          // Pit straight
        [235, 165, 0, 16],         // Turn 1 left
        [265, 95, 0, 16],          // Turn 2-3
        [215, -35, 0, 26],         // T4-T6 sweeping marina curves
        [135, -155, 0, 24],        // T7-T8 double apex left
        [-5, -185, 0, 0],          // Straight to T11
        [-75, -185, 0, 13],        // Turn 11 heavy braking left!
        [-95, -115, 0, 12.5],      // T12-T13 chicane
        [-165, -135, 1, 12.5],     // T14-T15 tight uphill chicane!
        [-215, -75, 0, 13],        // T16 exit onto back straight
        [-265, 115, 0, 0],         // Long dead-straight Back Straight
        [-275, 175, 0, 12.5],      // T17 tight 180° hairpin left!
        [-225, 195, 0, 13],        // T17 exit onto Pit Straight
      ],
      1740,
      17.5,
    ),
  },
  {
    id: 'las-vegas',
    name: 'Las Vegas Strip Circuit',
    shortName: 'Las Vegas',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'street-night',
    asphaltColor: '#22262f',
    kerbPrimary: '#ef4444',
    kerbSecondary: '#ffffff',
    trackWidth: 17.5,
    targetLapSeconds: 38,
    corners: 17,
    // CCW: Harmon Pit Straight -> T1-2 hairpin -> T3-4 -> T5-9 Sphere -> T12 onto huge Las Vegas Blvd Strip -> T14-16 tight chicane
    waypoints: buildCircuitPoints(
      [
        [-115, 195, 0, 0],
        [145, 195, 0, 0],          // Harmon Ave pit straight
        [225, 185, 0, 12.5],       // T1 tight 90° left hairpin!
        [185, 105, 0, 22],         // T3-T4 sweeping right
        [255, -25, 0, 13],         // T5 90° left around Sphere
        [215, -115, 0, 20],        // T6-T8 Sphere bowl sweep
        [135, -155, 0, 13],        // T9 left onto Koval Lane
        [-5, -165, 0, 0],          // Koval Lane straight
        [-85, -175, 0, 13],        // T12 90° left onto The Strip!
        [-245, -115, 0, 0],        // HUGE dead-straight Las Vegas Strip!
        [-285, 105, 0, 0],         // Strip braking zone
        [-295, 165, 0, 12.5],      // T14 heavy braking chicane left
        [-245, 175, 0, 12.5],      // T15 chicane right
        [-255, 215, 0, 13],        // T16 left onto Harmon
      ],
      1800,
      17.5,
    ),
  },
  {
    id: 'mexico-city',
    name: 'Autódromo Hermanos Rodríguez',
    shortName: 'Mexico City',
    country: 'Mexico',
    region: 'Americas',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'stadium',
    asphaltColor: '#272c35',
    kerbPrimary: '#16a34a',
    kerbSecondary: '#ef4444',
    trackWidth: 17,
    targetLapSeconds: 35,
    corners: 17,
    waypoints: buildCircuitPoints(
      [
        [-155, -175, 0, 0],
        [165, -175, 0, 0],         // Long dead-straight Main Straight
        [235, -175, 0, 13],        // T1 sharp 90° right!
        [235, -135, 0, 13],        // T2-T3 chicane left-right
        [125, -105, 0, 0],         // Middle straight
        [45, -105, 0, 13],         // T4 hairpin right!
        [45, -45, 0, 13],          // T5-T6 exit left
        [145, 15, 0, 20],          // T7-T11 high-speed Esses
        [115, 115, 0, 20],         // Esses exit
        [15, 175, 0, 14],          // T12 90° right into Foro Sol Stadium
        [-115, 175, 0, 13],        // Foro Sol stadium tight chicane
        [-135, 125, 0, 13],        // Stadium exit
        [-235, 105, 0, 26],        // Peraltada half-sweep right
        [-235, -135, 0, 22],       // Peraltada exit onto Main Straight
      ],
      1660,
      17,
    ),
  },
  {
    id: 'interlagos',
    name: 'Autódromo José Carlos Pace (Interlagos)',
    shortName: 'Interlagos',
    country: 'Brazil',
    region: 'Americas',
    seriesTags: ['F1', 'WEC'],
    flagship: false,
    scenery: 'stadium',
    asphaltColor: '#262b33',
    kerbPrimary: '#16a34a',
    kerbSecondary: '#facc15',
    trackWidth: 17.5,
    targetLapSeconds: 35,
    corners: 15,
    // CCW: Steep uphill Arquibancadas -> Senna S (L-R) -> Curva do Sol (L) -> Reta Oposta -> Descida do Lago (L) -> Ferradura -> Laranjinha -> Bico de Pato (R) -> Mergulho -> Juncao (L)
    waypoints: buildCircuitPoints(
      [
        [-125, 205, 6, 0],
        [115, 215, 11, 0],         // Steep uphill Pit Straight
        [215, 210, 9, 13],         // Senna S entry left downhill
        [155, 125, 5, 13],         // Senna S exit right
        [235, 45, 2, 24],          // Curva do Sol sweeping left
        [215, -95, 0, 0],          // Dead-straight Reta Oposta
        [145, -195, 1, 16],        // Descida do Lago double-left
        [45, -155, 3, 18],         // Ferradura right
        [-35, -195, 4, 16],        // Laranjinha
        [-115, -135, 2, 13],       // Pinheirinho & Bico de Pato tight hairpin!
        [-195, -165, 1, 16],       // Mergulho
        [-245, -45, 1, 13.5],      // Juncao heavy braking uphill left!
        [-215, 155, 6, 16],        // Subida dos Boxes steep climb onto Pit Straight
      ],
      1660,
      17.5,
    ),
  },

  // ==================== REMAINING EUROPE (9 tracks) ====================
  {
    id: 'imola',
    name: 'Autodromo Enzo e Dino Ferrari (Imola)',
    shortName: 'Imola',
    country: 'Italy',
    region: 'Europe',
    seriesTags: ['F1', 'WEC'],
    flagship: false,
    scenery: 'parkland',
    asphaltColor: '#262b33',
    kerbPrimary: '#16a34a',
    kerbSecondary: '#dc2626',
    trackWidth: 16.5,
    targetLapSeconds: 36,
    corners: 19,
    // CCW: Pit Straight -> Tamburello L-R-L -> Villeneuve -> Tosa Hairpin (L) -> Piratella (L) -> Acque Minerali -> Variante Alta -> Rivazza 1-2
    waypoints: buildCircuitPoints(
      [
        [-125, 205, 0, 0],
        [95, 205, 0, 0],           // Pit straight
        [205, 185, 0, 14],         // Tamburello chicane
        [255, 115, 0, 14],         // Villeneuve chicane
        [235, 15, 1, 12.5],        // Tosa Hairpin tight left!
        [195, -15, 3, 12.5],       // Tosa exit
        [155, -115, 10, 18],       // Piratella uphill left
        [15, -165, 2, 15],         // Acque Minerali drop R-R
        [-15, -115, 3, 15],        // Acque Minerali climb
        [-135, -145, 7, 13],       // Variante Alta tight chicane!
        [-165, -115, 7, 13],       // Variante Alta exit
        [-245, -25, 2, 16],        // Plunge to Rivazza
        [-235, 145, 0, 14],        // Rivazza 1-2 double-left onto Pit Straight
        [-185, 195, 0, 14],
      ],
      1680,
      16.5,
    ),
  },
  {
    id: 'barcelona',
    name: 'Circuit de Barcelona-Catalunya',
    shortName: 'Barcelona',
    country: 'Spain',
    region: 'Europe',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'desert',
    asphaltColor: '#292e36',
    kerbPrimary: '#ef4444',
    kerbSecondary: '#facc15',
    trackWidth: 17.5,
    targetLapSeconds: 37,
    corners: 14,
    waypoints: buildCircuitPoints(
      [
        [-145, -195, 0, 0],
        [125, -195, 0, 0],         // Main straight
        [215, -195, 0, 13],        // Elf T1 right
        [225, -155, 0, 13],        // T2 left
        [305, -75, 2, 34],         // T3 Renault long sweeper right!
        [245, 65, 4, 15],          // T4 Repsol 180° hairpin right
        [115, 35, 3, 13],          // T5 downhill left hairpin!
        [85, 115, 5, 15],          // T7-T8 chicane
        [-15, 165, 4, 22],         // T9 Campsa crest
        [-175, 185, 1, 0],         // Dead-straight Back Straight
        [-235, 185, 0, 12.5],      // T10 La Caixa hairpin!
        [-195, 125, 0, 13],        // T10 exit
        [-235, 25, 0, 16],         // T11-T12 Stadium
        [-245, -135, 0, 20],       // Final fast right onto Main Straight
      ],
      1720,
      17.5,
    ),
  },
  {
    id: 'madring',
    name: 'Circuito de Madring (Madrid)',
    shortName: 'Madring',
    country: 'Spain',
    region: 'Europe',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'street-night',
    asphaltColor: '#242933',
    kerbPrimary: '#ef4444',
    kerbSecondary: '#facc15',
    trackWidth: 17,
    targetLapSeconds: 37,
    corners: 20,
    // CW: IFEMA Recta Principal -> T1-2 chicane -> Alta Velocidad -> T12 banked "La Monumental" 180° bowl -> IFEMA street section
    waypoints: buildCircuitPoints(
      [
        [-155, -195, 0, 0],
        [95, -195, 0, 0],          // Recta Principal
        [185, -195, 0, 13],        // T1-T2 braking chicane
        [215, -145, 0, 14],        // T3 exit
        [275, -55, 2, 24],         // Alta Velocidad sweep
        [255, 75, 3, 14],          // T7-T9 Valdebebas corners
        [185, 125, 4, 14],         // T10
        [135, 225, 4, 26, 12],     // T12 "La Monumental" banked 180° bowl!
        [-15, 235, 4, 26, 12],     // Monumental banked exit
        [-135, 185, 1, 0],         // Back straight under tunnel
        [-195, 185, 0, 13],        // T14 90° street braking right
        [-195, 95, 0, 13],         // T15-T17 IFEMA chicane
        [-255, 65, 0, 13],         // T18 90° right
        [-245, -135, 0, 14],       // T19-T20 back onto Recta Principal
      ],
      1740,
      17,
    ),
  },
  {
    id: 'red-bull-ring',
    name: 'Red Bull Ring (Spielberg)',
    shortName: 'Red Bull Ring',
    country: 'Austria',
    region: 'Europe',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'forest',
    asphaltColor: '#272c34',
    kerbPrimary: '#ef4444',
    kerbSecondary: '#facc15',
    trackWidth: 18,
    targetLapSeconds: 36,
    corners: 10,
    // Angular boomerang! Steep uphill T1 90° R -> uphill straight -> T3 Remus tight hairpin R -> downhill straight -> T4 90° R -> T6-7 fast L -> T9-10 Rindt R
    waypoints: buildCircuitPoints(
      [
        [-135, -205, 0, 0],
        [95, -205, 12, 0],         // Steep uphill Pit Straight
        [155, -205, 14, 13.5],     // Turn 1 Castrol sharp 90° right!
        [245, -35, 24, 0],         // Long uphill straight to Remus
        [265, 45, 25, 13],         // Turn 3 Remus sharp hairpin right!
        [195, 75, 22, 13],         // Remus exit
        [45, 175, 12, 0],          // Long downhill straight
        [-5, 205, 8, 14],          // Turn 4 Schlossgold 90° right
        [-95, 115, 5, 22],         // Turn 6-7 double-left
        [-215, 65, 3, 18],         // Turn 9-10 Rindt double-right
        [-215, -165, 0, 18],       // Final turn onto Pit Straight
      ],
      1660,
      18,
    ),
  },
  {
    id: 'hungaroring',
    name: 'Hungaroring (Budapest)',
    shortName: 'Hungaroring',
    country: 'Hungary',
    region: 'Europe',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'parkland',
    asphaltColor: '#282d35',
    kerbPrimary: '#16a34a',
    kerbSecondary: '#dc2626',
    trackWidth: 16.5,
    targetLapSeconds: 36,
    corners: 14,
    waypoints: buildCircuitPoints(
      [
        [-125, -215, 0, 0],
        [125, -215, 0, 0],         // Pit straight
        [215, -215, 0, 12.5],      // Turn 1 tight 180° hairpin right!
        [205, -165, 0, 12.5],      // T1 exit
        [95, -135, 2, 14],         // T2-T3 downhill left
        [15, -45, 7, 16],          // T4 blind crest left
        [85, 25, 6, 16],           // T5 right
        [135, 75, 5, 12.5],        // T6-T7 chicane!
        [75, 145, 4, 18],          // T8-T11 flowing esses
        [-45, 175, 3, 14],         // T12 90° right
        [-145, 145, 2, 13],        // T13 180° hairpin left!
        [-195, 25, 1, 14],         // T14 180° hairpin right onto Pit Straight
        [-195, -175, 0, 14],
      ],
      1680,
      16.5,
    ),
  },
  {
    id: 'zandvoort',
    name: 'Circuit Zandvoort',
    shortName: 'Zandvoort',
    country: 'Netherlands',
    region: 'Europe',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'coastal',
    asphaltColor: '#292e37',
    kerbPrimary: '#f97316',
    kerbSecondary: '#ffffff',
    trackWidth: 16,
    targetLapSeconds: 39,
    corners: 14,
    waypoints: buildCircuitPoints(
      [
        [-135, -215, 0, 0],
        [95, -215, 0, 0],          // Pit straight
        [205, -215, 2, 13, 10],    // Tarzanbocht banked 180° hairpin!
        [195, -165, 3, 13, 10],    // Tarzan exit
        [115, -125, 5, 14, 14],    // Gerlach -> Hugenholtz steep 14° banked left!
        [175, -25, 11, 20],        // Hunserug crest & Rob Slotemaker
        [245, 75, 14, 22],         // Scheivlak fast downhill right!
        [145, 175, 7, 14],         // Mastersbocht -> Renault
        [-15, 155, 4, 13],         // Hans Ernst chicane!
        [-115, 195, 2, 16],        // Kumho corner
        [-225, 95, 4, 30, 16],     // Arie Luyendyk 16° steep banked sweeper!
        [-215, -165, 2, 28, 14],   // Banked exit onto Pit Straight
      ],
      1740,
      16,
    ),
  },
  {
    id: 'paul-ricard',
    name: 'Circuit Paul Ricard (Le Castellet)',
    shortName: 'Paul Ricard',
    country: 'France',
    region: 'Europe',
    seriesTags: ['WEC', 'F1'],
    flagship: false,
    scenery: 'parkland',
    asphaltColor: '#232833',
    kerbPrimary: '#2563eb',
    kerbSecondary: '#ef4444',
    trackWidth: 18.5,
    targetLapSeconds: 38,
    corners: 15,
    waypoints: buildCircuitPoints(
      [
        [-165, -155, 0, 0],
        [85, -155, 0, 0],          // Pit straight
        [155, -155, 0, 13.5],      // T1-T2 Verrerie L-R chicane
        [195, -105, 0, 13.5],
        [265, -95, 0, 14],         // T3-T5 S-bend onto Mistral
        [365, -110, 0, 0],         // Mistral Straight West->East!
        [385, -55, 0, 13.5],       // North Chicane!
        [365, 15, 0, 13.5],
        [365, 135, 0, 0],          // Mistral Straight Part 2
        [275, 185, 0, 32],         // Signes fast right!
        [95, 195, 0, 18],          // Beausset double-right loop
        [15, 115, 0, 15],          // Virage du Pont technical switchbacks
        [-125, 145, 0, 15],
        [-255, 65, 0, 16],
        [-255, -125, 0, 15],       // Final corner onto Pit Straight
      ],
      1780,
      18.5,
    ),
  },
  {
    id: 'baku',
    name: 'Baku City Circuit',
    shortName: 'Baku',
    country: 'Azerbaijan',
    region: 'Europe',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'street-night',
    asphaltColor: '#252932',
    kerbPrimary: '#ef4444',
    kerbSecondary: '#06b6d4',
    trackWidth: 15,
    targetLapSeconds: 40,
    corners: 20,
    // CCW: HUGE Waterfront Main Straight -> T1 90° L -> T2 90° L -> T3 90° L -> T4-7 90° grid -> T8-12 Narrow Uphill Castle -> T15 90° L -> T16 90° L -> Waterfront kinks
    waypoints: buildCircuitPoints(
      [
        [-215, 195, 0, 0],
        [195, 195, 0, 0],          // Massive dead-straight Main Straight
        [255, 195, 0, 12],         // T1 sharp 90° left!
        [255, 55, 0, 12],          // T2 90° left!
        [115, 55, 0, 12],          // T3 90° left!
        [115, 115, 0, 12],         // T4 90° right
        [5, 115, 1, 12],           // T5-T6 chicane
        [-45, 5, 3, 12],           // T7 90° right toward Old City
        [-115, -25, 8, 11.5],      // T8-T12 Narrow Uphill Castle Section!
        [-165, -135, 14, 12],      // T12 summit crest
        [-255, -145, 10, 13],      // Downhill straight to T15
        [-285, -65, 2, 12],        // T15 sharp 90° left!
        [-285, 25, 0, 12],         // T16 90° left onto fast Waterfront!
        [-265, 155, 0, 26],        // T17-T20 flat-out coastal kinks onto Main Straight
      ],
      1840,
      15,
    ),
  },
  {
    id: 'portimao',
    name: 'Autódromo Internacional do Algarve (Portimão)',
    shortName: 'Portimão',
    country: 'Portugal',
    region: 'Europe',
    seriesTags: ['F1', 'WEC'],
    flagship: false,
    scenery: 'desert',
    asphaltColor: '#2a2e37',
    kerbPrimary: '#facc15',
    kerbSecondary: '#16a34a',
    trackWidth: 17.5,
    targetLapSeconds: 37,
    corners: 15,
    waypoints: buildCircuitPoints(
      [
        [-135, -205, 8, 0],
        [115, -205, 2, 0],         // Downhill Pit Straight
        [215, -185, 0, 16],        // T1 plunge right
        [245, -105, 2, 18],        // T2 right
        [215, -25, 4, 13],         // T3 tight 180° hairpin right!
        [135, -45, 9, 16],         // T4 uphill left
        [105, 65, 16, 13],         // T5 Craig Jones tight hairpin left crest!
        [165, 145, 8, 18],         // Blind rollercoaster drop
        [55, 205, 5, 16],          // T8-T11 undulations
        [-65, 165, 9, 14],         // T13 hairpin
        [-175, 185, 12, 22],       // Galp crest
        [-245, 75, 10, 26],        // Final sweeping downhill right onto Pit Straight
        [-215, -155, 9, 22],
      ],
      1740,
      17.5,
    ),
  },

  // ==================== ASIA-PACIFIC & MIDDLE EAST (10 tracks) ====================
  {
    id: 'fuji',
    name: 'Fuji Speedway',
    shortName: 'Fuji',
    country: 'Japan',
    region: 'Asia-Pacific & Middle East',
    seriesTags: ['WEC'],
    flagship: false,
    scenery: 'forest',
    asphaltColor: '#272c35',
    kerbPrimary: '#dc2626',
    kerbSecondary: '#ffffff',
    trackWidth: 18,
    targetLapSeconds: 36,
    corners: 16,
    waypoints: buildCircuitPoints(
      [
        [-185, -195, 0, 0],
        [195, -195, 0, 0],         // HUGE 1.5km Main Straight!
        [255, -195, 0, 12.5],      // T1 tight 180° hairpin right!
        [215, -145, 0, 13],        // T1 exit
        [115, -115, 0, 22],        // Coca-Cola fast left
        [215, -15, 1, 28],         // 100R long sweeping right!
        [135, 95, 2, 12.5],        // Advan Hairpin tight left!
        [85, 75, 3, 13],           // Advan exit
        [-15, 135, 4, 24],         // 300R fast sweep
        [-105, 195, 5, 13],        // Dunlop Chicane tight right-left!
        [-155, 155, 6, 13],        // Dunlop exit
        [-235, 115, 5, 15],        // T13-T16 technical uphill complex
        [-245, -125, 2, 16],       // Panasonic final corner onto Main Straight
      ],
      1720,
      18,
    ),
  },
  {
    id: 'shanghai',
    name: 'Shanghai International Circuit',
    shortName: 'Shanghai',
    country: 'China',
    region: 'Asia-Pacific & Middle East',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'stadium',
    asphaltColor: '#272c35',
    kerbPrimary: '#ef4444',
    kerbSecondary: '#ffffff',
    trackWidth: 18,
    targetLapSeconds: 39,
    corners: 16,
    waypoints: buildCircuitPoints(
      [
        [-145, -215, 0, 0],
        [115, -215, 0, 0],         // Pit Straight
        [235, -195, 2, 24],        // T1-T2 famous tightening snail right!
        [215, -125, 2, 14],        // T3 sharp left hairpin exit
        [125, -105, 1, 16],        // T4 left
        [215, -25, 1, 13],         // T6 tight hairpin right!
        [125, 5, 2, 18],           // T7-T8 high-speed S
        [155, 105, 3, 20],         // T9-T10
        [15, 175, 2, 20, 7],       // T11-T13 banked snail loop right!
        [5, 225, 2, 22, 7],        // T13 exit onto Back Straight
        [-245, 225, 0, 0],         // HUGE 1.17km Back Straight!
        [-295, 225, 0, 12.5],      // T14 tightest 180° hairpin right!
        [-275, 175, 0, 12.5],      // T14 exit
        [-245, -175, 0, 14],       // T16 90° left onto Pit Straight
      ],
      1860,
      18,
    ),
  },
  {
    id: 'singapore',
    name: 'Marina Bay Street Circuit',
    shortName: 'Singapore',
    country: 'Singapore',
    region: 'Asia-Pacific & Middle East',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'street-night',
    asphaltColor: '#21262f',
    kerbPrimary: '#06b6d4',
    kerbSecondary: '#ffffff',
    trackWidth: 15.5,
    targetLapSeconds: 40,
    corners: 19,
    // CCW: Pit straight -> T1-3 Sheares chicane -> Raffles Blvd -> T7 Memorial 90° L -> T8-9 -> Anderson Bridge -> Esplanade Drive -> T14 90° R -> Marina promenade -> T18-19 chicane
    waypoints: buildCircuitPoints(
      [
        [-135, 195, 0, 0],
        [95, 195, 0, 0],           // Pit straight
        [175, 195, 0, 12],         // T1 Sheares left
        [195, 155, 0, 12],         // T2-T3 chicane
        [255, 55, 0, 0],           // Raffles Blvd straight
        [255, -25, 0, 12],         // T5 right
        [245, -135, 0, 12],        // T7 Memorial 90° left!
        [125, -135, 0, 12],        // T8-T9
        [45, -175, 0, 14],         // Anderson Bridge
        [-135, -175, 0, 0],        // Straight Esplanade Drive!
        [-215, -175, 0, 12],       // T14 sharp 90° left
        [-215, -65, 0, 18],        // Marina Bay Promenade fast kinks
        [-265, 25, 0, 16],
        [-245, 135, 0, 12],        // T18-T19 chicane onto Pit Straight
        [-205, 195, 0, 13],
      ],
      1780,
      15.5,
    ),
  },
  {
    id: 'sepang',
    name: 'Petronas Sepang International Circuit',
    shortName: 'Sepang',
    country: 'Malaysia',
    region: 'Asia-Pacific & Middle East',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'stadium',
    asphaltColor: '#272c35',
    kerbPrimary: '#06b6d4',
    kerbSecondary: '#facc15',
    trackWidth: 18.5,
    targetLapSeconds: 39,
    corners: 15,
    // Twin parallel straights! Pit Straight -> T1-2 Pangkor Laut hairpin -> T3 -> T4 90° -> T5-6 ultra-fast S -> T7-8 -> T9 hairpin -> Back Straight -> T15 tight hairpin!
    waypoints: buildCircuitPoints(
      [
        [-155, -205, 0, 0],
        [145, -205, 0, 0],         // Main Pit Straight
        [245, -205, 1, 13.5],      // T1 tight hairpin right!
        [245, -155, 1, 13.5],      // T2 tight left!
        [175, -115, 1, 15],        // T2 exit
        [275, -45, 2, 22],         // T3 fast right
        [225, 45, 3, 14],          // T4 90° right
        [245, 175, 3, 24],         // T5-T6 ultra-fast S-curves
        [115, 225, 2, 18],         // T7-T8 double-right
        [-15, 185, 1, 13.5],       // T9 tight hairpin left!
        [-115, 215, 2, 16],        // T11-T12
        [-245, 145, 1, 16],        // Back straight entry
        [-265, -135, 0, 0],        // Dead-straight parallel Back Straight!
        [-265, -205, 0, 16],       // T15 tight hairpin onto Pit Straight!
      ],
      1860,
      18.5,
    ),
  },
  {
    id: 'bahrain',
    name: 'Bahrain International Circuit (Sakhir)',
    shortName: 'Bahrain',
    country: 'Bahrain',
    region: 'Asia-Pacific & Middle East',
    seriesTags: ['F1', 'WEC'],
    flagship: false,
    scenery: 'desert',
    asphaltColor: '#2a2e36',
    kerbPrimary: '#dc2626',
    kerbSecondary: '#ffffff',
    trackWidth: 18,
    targetLapSeconds: 38,
    corners: 15,
    waypoints: buildCircuitPoints(
      [
        [-155, -215, 0, 0],
        [135, -215, 0, 0],         // Main Pit Straight
        [235, -215, 0, 13],        // Turn 1 tight right hairpin!
        [235, -165, 0.5, 13],      // T1-T2 exit
        [175, -125, 1, 0],         // T2-T3 blast
        [265, -25, 2, 14],         // Turn 4 90° right!
        [195, 75, 2, 20],          // T5-T7 fast Esses
        [245, 165, 1, 13],         // T8 tight hairpin right!
        [195, 195, 1, 13],         // T8 exit
        [115, 145, 1, 14],         // T9-T10 off-camber double-left lockup!
        [-5, 195, 0, 0],           // Back Straight!
        [-115, 195, 0, 18],        // T11 fast left
        [-215, 135, 0, 22],        // T12-T13 sweeping right
        [-255, 25, 0, 0],          // Straight to T14
        [-255, -185, 0, 13.5],     // T14-T15 90° right onto Pit Straight
      ],
      1800,
      18,
    ),
  },
  {
    id: 'jeddah',
    name: 'Jeddah Corniche Circuit',
    shortName: 'Jeddah',
    country: 'Saudi Arabia',
    region: 'Asia-Pacific & Middle East',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'street-night',
    asphaltColor: '#232833',
    kerbPrimary: '#16a34a',
    kerbSecondary: '#ffffff',
    trackWidth: 16.5,
    targetLapSeconds: 39,
    corners: 27,
    // CCW long fast coastal ribbon -> T1-2 chicane -> high-speed coastal kinks -> T13 banked hairpin -> sweeping coastal S -> T27 hairpin
    waypoints: buildCircuitPoints(
      [
        [-165, 85, 0, 0],
        [115, 85, 0, 0],           // Pit straight
        [205, 85, 0, 13],          // T1-T2 tight chicane!
        [235, 48, 0, 14],          // T3 exit
        [335, -12, 0, 32],         // High-speed coastal kinks T4-T12
        [435, -62, 0, 15, 10],     // T13 banked 180° hairpin left!
        [415, -108, 0, 15, 10],    // T13 exit
        [205, -68, 0, 34],         // T16-T22 rapid coastal esses
        [-45, -88, 0, 36],         // T23-T24 DRS sweep
        [-345, -55, 0, 0],         // Long fast coastal back straight
        [-395, 45, 0, 0],          // Final straight approach
        [-375, 85, 0, 13],         // T27 tight hairpin left onto Pit Straight!
        [-305, 85, 0, 13],
      ],
      1860,
      16.5,
    ),
  },
  {
    id: 'lusail',
    name: 'Lusail International Circuit',
    shortName: 'Lusail',
    country: 'Qatar',
    region: 'Asia-Pacific & Middle East',
    seriesTags: ['F1', 'WEC'],
    flagship: false,
    scenery: 'desert',
    asphaltColor: '#252a33',
    kerbPrimary: '#7c2d12',
    kerbSecondary: '#ffffff',
    trackWidth: 18,
    targetLapSeconds: 37,
    corners: 16,
    waypoints: buildCircuitPoints(
      [
        [-165, -215, 0, 0],
        [165, -215, 0, 0],         // HUGE 1.07km Main Straight!
        [245, -215, 0, 13.5],      // T1 heavy braking 90° right!
        [225, -125, 0, 18],        // T2-T3 left
        [265, -15, 0, 22],         // T4-T5 flowing right
        [215, 125, 0, 13],         // T6 tight 180° hairpin left!
        [155, 115, 0, 14],         // T6 exit
        [65, 185, 0, 20],          // T7-T9 medium rights
        [-55, 135, 0, 15],         // T10 90° left
        [-155, 195, 0, 26],        // T12-T14 triple-apex sweeping right!
        [-255, 85, 0, 24],         // T14-T15 high speed sweep
        [-245, -185, 0, 15],       // T16 final 90° right onto Main Straight
      ],
      1760,
      18,
    ),
  },
  {
    id: 'yas-marina',
    name: 'Yas Marina Circuit (Abu Dhabi)',
    shortName: 'Yas Marina',
    country: 'UAE',
    region: 'Asia-Pacific & Middle East',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'coastal',
    asphaltColor: '#252a34',
    kerbPrimary: '#06b6d4',
    kerbSecondary: '#ef4444',
    trackWidth: 17.5,
    targetLapSeconds: 37,
    corners: 16,
    // CCW: Pit straight -> T1 90° L -> uphill T2-4 S -> T5 hairpin L -> HUGE 1.2km straight -> T6-7 chicane -> straight -> T9 banked Marsa hairpin -> Yas Hotel 90° grid
    waypoints: buildCircuitPoints(
      [
        [-125, 195, 0, 0],
        [95, 195, 0, 0],           // Pit straight
        [175, 195, 0, 13],         // Turn 1 90° left!
        [195, 95, 6, 22],          // Uphill Turn 2-4 sweeping left-right-left
        [145, -25, 4, 13],         // Turn 5 tight 180° hairpin left!
        [105, -55, 2, 13],         // T5 exit
        [-155, -145, 0, 0],        // HUGE 1.2km dead-straight Back Straight!
        [-235, -165, 0, 12.5],     // Turn 6-7 tight chicane!
        [-265, -125, 0, 12.5],     // T7 exit
        [-295, 25, 0, 0],          // Second DRS straight
        [-285, 125, 0, 18, 7],     // Turn 9 Marsa banked 180° hairpin!
        [-195, 95, 0, 18, 7],      // Marsa exit
        [-195, 185, 0, 13],        // T12-T16 Yas Hotel 90° marina complex
        [-155, 195, 0, 13],
      ],
      1760,
      17.5,
    ),
  },
  {
    id: 'albert-park',
    name: 'Albert Park Grand Prix Circuit (Melbourne)',
    shortName: 'Albert Park',
    country: 'Australia',
    region: 'Asia-Pacific & Middle East',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'parkland',
    asphaltColor: '#272c35',
    kerbPrimary: '#16a34a',
    kerbSecondary: '#facc15',
    trackWidth: 17,
    targetLapSeconds: 35,
    corners: 14,
    waypoints: buildCircuitPoints(
      [
        [-145, -195, 0, 0],
        [95, -195, 0, 0],          // Pit straight
        [195, -195, 0, 14],        // T1-T2 fast right-left chicane!
        [245, -155, 0, 14],        // T2 exit
        [285, -35, 0, 0],          // Straight to T3
        [265, 25, 0, 13],          // T3 sharp 90° right!
        [185, 45, 0, 14],          // T4-T5 left-right
        [155, 135, 0, 24],         // T6-T8 fast sweep around lake
        [-5, 195, 0, 26],          // Lakeside drive
        [-115, 175, 0, 18],        // T9-T10 ultra-fast chicane!
        [-225, 115, 0, 13],        // T11 tight 90° left
        [-255, 5, 0, 13.5],        // T13 90° right!
        [-225, -145, 0, 14],       // T14 90° right onto Pit Straight
      ],
      1680,
      17,
    ),
  },
];

export function getTrackById(id: string): TrackSpec {
  const builtin = TRACKS.find((t) => t.id === id);
  if (builtin) return builtin;
  const custom = getCustomTrackById(id);
  if (custom) return custom;
  return TRACKS[0];
}

export function getTracksByRegion(region: TrackRegion | 'All' | 'Flagship'): TrackSpec[] {
  if (region === 'Flagship') return TRACKS.filter((t) => t.flagship);
  if (region === 'All') return TRACKS;
  return TRACKS.filter((t) => t.region === region);
}

export interface SampledSplinePoint {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  nx: number;
  nz: number;
  s: number;
  t: number; // 0..1 normalized progress
  curvature: number; // signed 1/R in 1/m (+ = right turn, - = left turn)
  banking?: number; // radians
  width?: number; // track width in meters
}

export interface CompiledTrack {
  spec: TrackSpec;
  samples: SampledSplinePoint[];
  totalLength: number;
  pitEntryT: number;
  pitExitT: number;
  pitOffset: number; // lateral world offset for pit corridor
}

function hermiteCatmullRomVal(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
  tau1 = 0.16,
  tau2 = 0.16,
): number {
  const m1 = tau1 * (p2 - p0);
  const m2 = tau2 * (p3 - p1);
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * p1 +
    (t3 - 2 * t2 + t) * m1 +
    (-2 * t3 + 3 * t2) * p2 +
    (t3 - t2) * m2
  );
}

/**
 * Compiles track waypoints into a dense, arc-length-uniformly-resampled closed racing spline.
 * Uses THREE.CatmullRomCurve3 ('catmullrom', low tension = 0.16, arcLengthDivisions = 1800)
 * so straights stay dead straight and hairpins/chicanes stay sharp without oval rounding.
 */
export function compileTrack(spec: TrackSpec, sampleCount = 720): CompiledTrack {
  let ptsArr = spec.waypoints;
  if (
    spec.startNodeIndex !== undefined &&
    spec.startNodeIndex > 0 &&
    spec.startNodeIndex < ptsArr.length
  ) {
    const head = ptsArr.slice(spec.startNodeIndex);
    const tail = ptsArr.slice(0, spec.startNodeIndex);
    ptsArr = [...head, ...tail];
  }
  const n = ptsArr.length;
  const hasPerNodeTension = ptsArr.some((wp) => wp.tension !== undefined);

  const raw: Array<{ x: number; y: number; z: number; banking: number; width: number; s: number }> = [];
  let totalLength = 0;

  if (!hasPerNodeTension) {
    // Centripetal Catmull-Rom over piecewise straight collars + circular corner clusters
    // guarantees zero ribbon self-intersection folds AND dead-straight straights.
    const curve = new THREE.CatmullRomCurve3(
      ptsArr.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
      true,
      'centripetal',
      0.5,
    );
    curve.arcLengthDivisions = Math.max(1500, n * 30, 1800);
    totalLength = curve.getLength();
    const spaced = curve.getSpacedPoints(sampleCount);

    for (let k = 0; k < sampleCount; k++) {
      const u = k / sampleCount;
      const tParam = curve.getUtoTmapping(u, 0);
      const segU = tParam * n;
      const seg = Math.floor(segU) % n;
      const localT = segU - Math.floor(segU);

      const p0 = ptsArr[(seg - 1 + n) % n];
      const p1 = ptsArr[seg];
      const p2 = ptsArr[(seg + 1) % n];
      const p3 = ptsArr[(seg + 2) % n];

      const bank0 = (p0.banking || 0) * (Math.PI / 180);
      const bank1 = (p1.banking || 0) * (Math.PI / 180);
      const bank2 = (p2.banking || 0) * (Math.PI / 180);
      const bank3 = (p3.banking || 0) * (Math.PI / 180);

      const w0 = p0.width || spec.trackWidth;
      const w1 = p1.width || spec.trackWidth;
      const w2 = p2.width || spec.trackWidth;
      const w3 = p3.width || spec.trackWidth;

      const pt = spaced[k];
      raw.push({
        x: pt.x,
        y: pt.y,
        z: pt.z,
        banking: hermiteCatmullRomVal(bank0, bank1, bank2, bank3, localT, 0.18, 0.18),
        width: hermiteCatmullRomVal(w0, w1, w2, w3, localT, 0.18, 0.18),
        s: u * totalLength,
      });
    }
  } else {
    // Custom Track Studio path honoring per-node tension overrides (same Catmull-Rom polynomial, 1800+ arc divisions)
    const denseCount = Math.max(1800, n * 60);
    const dense: Array<{ x: number; y: number; z: number; banking: number; width: number }> = [];

    for (let i = 0; i < denseCount; i++) {
      const u = (i / denseCount) * n;
      const seg = Math.floor(u) % n;
      const localT = u - Math.floor(u);
      const p0 = ptsArr[(seg - 1 + n) % n];
      const p1 = ptsArr[seg];
      const p2 = ptsArr[(seg + 1) % n];
      const p3 = ptsArr[(seg + 2) % n];

      const tau1 = Math.max(0.12, Math.min(0.85, p1.tension ?? 0.16));
      const tau2 = Math.max(0.12, Math.min(0.85, p2.tension ?? 0.16));

      const bank0 = (p0.banking || 0) * (Math.PI / 180);
      const bank1 = (p1.banking || 0) * (Math.PI / 180);
      const bank2 = (p2.banking || 0) * (Math.PI / 180);
      const bank3 = (p3.banking || 0) * (Math.PI / 180);

      const w0 = p0.width || spec.trackWidth;
      const w1 = p1.width || spec.trackWidth;
      const w2 = p2.width || spec.trackWidth;
      const w3 = p3.width || spec.trackWidth;

      dense.push({
        x: hermiteCatmullRomVal(p0.x, p1.x, p2.x, p3.x, localT, tau1, tau2),
        y: hermiteCatmullRomVal(p0.y, p1.y, p2.y, p3.y, localT, 0.25, 0.25),
        z: hermiteCatmullRomVal(p0.z, p1.z, p2.z, p3.z, localT, tau1, tau2),
        banking: hermiteCatmullRomVal(bank0, bank1, bank2, bank3, localT, 0.25, 0.25),
        width: hermiteCatmullRomVal(w0, w1, w2, w3, localT, 0.25, 0.25),
      });
    }

    const denseCumLen: number[] = [0];
    for (let i = 1; i <= denseCount; i++) {
      const a = dense[i - 1];
      const b = dense[i % denseCount];
      totalLength += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      denseCumLen.push(totalLength);
    }

    let cursor = 0;
    for (let k = 0; k < sampleCount; k++) {
      const targetS = (k / sampleCount) * totalLength;
      while (cursor < denseCount - 1 && denseCumLen[cursor + 1] < targetS) {
        cursor++;
      }
      const s0 = denseCumLen[cursor];
      const s1 = denseCumLen[cursor + 1];
      const alpha = s1 > s0 ? (targetS - s0) / (s1 - s0) : 0;
      const a = dense[cursor];
      const b = dense[(cursor + 1) % denseCount];
      raw.push({
        x: a.x + (b.x - a.x) * alpha,
        y: a.y + (b.y - a.y) * alpha,
        z: a.z + (b.z - a.z) * alpha,
        banking: a.banking + (b.banking - a.banking) * alpha,
        width: a.width + (b.width - a.width) * alpha,
        s: targetS,
      });
    }
  }

  const samples: SampledSplinePoint[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const prev = raw[(i - 1 + sampleCount) % sampleCount];
    const curr = raw[i];
    const next = raw[(i + 1) % sampleCount];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const tx = dx / len;
    const ty = dy / len;
    const tz = dz / len;

    // Right-hand normal in XZ plane
    const xzLen = Math.hypot(tx, tz) || 1;
    const nx = -tz / xzLen;
    const nz = tx / xzLen;

    // True geometric inverse-radius curvature (1/R in 1/m) in XZ plane
    const ax = curr.x - prev.x;
    const az = curr.z - prev.z;
    const bx = next.x - curr.x;
    const bz = next.z - curr.z;
    const crossY = ax * bz - az * bx;
    const segLen = (Math.hypot(ax, az) + Math.hypot(bx, bz)) * 0.5 || 1;
    const curvature = crossY / (segLen * segLen * segLen);

    samples.push({
      x: curr.x,
      y: curr.y,
      z: curr.z,
      tx,
      ty,
      tz,
      nx,
      nz,
      s: curr.s,
      t: curr.s / Math.max(1, totalLength),
      curvature,
      banking: curr.banking,
      width: curr.width,
    });
  }

  const pitSign = spec.pitSide === 'right' ? 1 : -1;
  const pitOffset = pitSign * (spec.trackWidth * 0.5 + 8.5);

  return {
    spec,
    samples,
    totalLength,
    pitEntryT: 0.90,
    pitExitT: 0.08,
    pitOffset,
  };
}

export function sampleTrackAtT(compiled: CompiledTrack, tRaw: number): SampledSplinePoint {
  const t = ((tRaw % 1) + 1) % 1;
  const n = compiled.samples.length;
  const fIdx = t * n;
  const i0 = Math.floor(fIdx) % n;
  const i1 = (i0 + 1) % n;
  const alpha = fIdx - Math.floor(fIdx);
  const a = compiled.samples[i0];
  const b = compiled.samples[i1];
  const tx = a.tx + (b.tx - a.tx) * alpha;
  const ty = a.ty + (b.ty - a.ty) * alpha;
  const tz = a.tz + (b.tz - a.tz) * alpha;
  const tLen = Math.hypot(tx, ty, tz) || 1;
  const utx = tx / tLen;
  const utz = tz / tLen;
  const xzLen = Math.hypot(utx, utz) || 1;
  const banking = (a.banking || 0) + ((b.banking || 0) - (a.banking || 0)) * alpha;
  const width =
    (a.width || compiled.spec.trackWidth) +
    ((b.width || compiled.spec.trackWidth) - (a.width || compiled.spec.trackWidth)) * alpha;

  return {
    x: a.x + (b.x - a.x) * alpha,
    y: a.y + (b.y - a.y) * alpha,
    z: a.z + (b.z - a.z) * alpha,
    tx: utx,
    ty: ty / tLen,
    tz: utz,
    nx: -utz / xzLen,
    nz: utx / xzLen,
    s: t * compiled.totalLength,
    t,
    curvature: a.curvature + (b.curvature - a.curvature) * alpha,
    banking,
    width,
  };
}

/**
 * Projects a world XZ position onto the closest compiled track spline sample.
 */
export function projectOntoTrack(
  compiled: CompiledTrack,
  x: number,
  z: number,
  hintT?: number,
): {
  sample: SampledSplinePoint;
  lateralOffset: number; // positive = right of centerline, negative = left
  distanceSq: number;
} {
  const samples = compiled.samples;
  const n = samples.length;
  let bestIdx = 0;
  let bestDistSq = Infinity;

  if (hintT !== undefined) {
    const centerIdx = Math.floor((((hintT % 1) + 1) % 1) * n);
    const windowRadius = Math.max(36, Math.round(n * 0.08));
    for (let offset = -windowRadius; offset <= windowRadius; offset++) {
      const i = (centerIdx + offset + n) % n;
      const dx = x - samples[i].x;
      const dz = z - samples[i].z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }
    if (bestDistSq > 1600) {
      for (let i = 0; i < n; i++) {
        const dx = x - samples[i].x;
        const dz = z - samples[i].z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }
    }
  } else {
    for (let i = 0; i < n; i++) {
      const dx = x - samples[i].x;
      const dz = z - samples[i].z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }
  }

  const s = samples[bestIdx];
  const dx = x - s.x;
  const dz = z - s.z;
  const lateralOffset = dx * s.nx + dz * s.nz;
  return { sample: s, lateralOffset, distanceSq: bestDistSq };
}
