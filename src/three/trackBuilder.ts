import * as THREE from 'three';
import {
  CompiledTrack,
  SampledSplinePoint,
  computeTrackApronHalfWidth,
  computeTrackWallHalfWidth,
  sampleTrackAtT,
} from '../game/tracks';
import { SceneryTheme } from '../game/types';
import {
  createAsphaltTexture,
  createBrakingBoardTexture,
  createKerbTexture,
  createStartLineTexture,
} from './proceduralTextures';

export interface TrackPropCarState {
  x: number;
  y?: number;
  z: number;
  vx?: number;
  vz?: number;
  speed?: number;
  lap?: number;
}

export interface BuiltTrackScene {
  group: THREE.Group;
  skyColor: number;
  fogColor: number;
  startLightMats: THREE.MeshStandardMaterial[];
  roadMat: THREE.MeshStandardMaterial;
  updateMarshalFlags: (flagState: string, timeSec: number, yellowSectors?: number[]) => void;
  setNightLights: (nightIntensity: number) => void;
  updateTrackProps?: (dt: number, carStates?: TrackPropCarState[], isFinalLap?: boolean) => void;
  dispose: () => void;
}

export type TrackSceneHandle = BuiltTrackScene;

type TrackDisposable = <T extends { dispose: () => void }>(item: T) => T;

interface AnimatedLandmarkHandles {
  ferrisWheel?: {
    wheel: THREE.Group;
    gondolas: THREE.Group[];
  };
  blimp?: {
    group: THREE.Group;
    centerX: number;
    centerZ: number;
    baseY: number;
    rx: number;
    rz: number;
    angle: number;
  };
  helicopter?: {
    group: THREE.Group;
    mainRotor: THREE.Object3D;
    tailRotor: THREE.Object3D;
    centerX: number;
    centerZ: number;
    baseY: number;
    rx: number;
    rz: number;
    angle: number;
  };
}

function buildFerrisWheelLandmark(
  track: TrackDisposable,
  isNight: boolean,
): { root: THREE.Group; wheel: THREE.Group; gondolas: THREE.Group[] } {
  const root = new THREE.Group();
  const frameMat = track(
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.45, metalness: 0.5 }),
  );
  const rimMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: isNight ? 0x38bdf8 : 0x0f172a,
      emissiveIntensity: isNight ? 1.4 : 0.05,
      roughness: 0.35,
      metalness: 0.4,
    }),
  );

  const radius = 15;
  const hubY = 18.5;
  const legGeo = track(new THREE.CylinderGeometry(0.45, 0.7, 20.5, 6));
  for (const sideZ of [-2.4, 2.4]) {
    for (const sideX of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, frameMat);
      leg.position.set(sideX * 4.6, hubY * 0.5, sideZ);
      leg.rotation.z = sideX * 0.24;
      root.add(leg);
    }
  }

  const wheel = new THREE.Group();
  wheel.position.set(0, hubY, 0);

  const rimGeo = track(new THREE.TorusGeometry(radius, 0.42, 6, 28));
  for (const rimZ of [-1.1, 1.1]) {
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.z = rimZ;
    wheel.add(rim);
  }

  const spokeGeo = track(new THREE.CylinderGeometry(0.14, 0.14, radius * 2, 5));
  for (let i = 0; i < 6; i++) {
    const spoke = new THREE.Mesh(spokeGeo, frameMat);
    spoke.rotation.z = (i / 6) * Math.PI;
    wheel.add(spoke);
  }

  const gondolas: THREE.Group[] = [];
  const cabinGeo = track(new THREE.BoxGeometry(1.9, 1.7, 2.2));
  const cabinColors = [0xef4444, 0xfacc15, 0x38bdf8, 0x22c55e, 0xf97316, 0xa855f7];
  const cabinMats = cabinColors.map((hex) =>
    track(
      new THREE.MeshStandardMaterial({
        color: hex,
        emissive: isNight ? hex : 0x000000,
        emissiveIntensity: isNight ? 0.65 : 0,
        roughness: 0.4,
      }),
    ),
  );
  const gondolaCount = 12;
  for (let i = 0; i < gondolaCount; i++) {
    const ang = (i / gondolaCount) * Math.PI * 2;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(ang) * radius, Math.sin(ang) * radius, 0);
    const cabin = new THREE.Mesh(cabinGeo, cabinMats[i % cabinMats.length]);
    cabin.position.y = -1.1;
    pivot.add(cabin);
    wheel.add(pivot);
    gondolas.push(pivot);
  }

  root.add(wheel);
  return { root, wheel, gondolas };
}

function buildBlimpLandmark(track: TrackDisposable, isNight: boolean): THREE.Group {
  const group = new THREE.Group();
  const hullGeo = track(new THREE.SphereGeometry(5.5, 16, 12));
  hullGeo.scale(1.0, 0.88, 2.75);
  const hullMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: isNight ? 0x1e293b : 0x000000,
      emissiveIntensity: isNight ? 0.5 : 0,
      roughness: 0.45,
      metalness: 0.15,
    }),
  );
  const hull = new THREE.Mesh(hullGeo, hullMat);
  group.add(hull);

  const bandGeo = track(new THREE.CylinderGeometry(5.55, 5.55, 4.2, 16, 1, true));
  bandGeo.rotateX(Math.PI * 0.5);
  const bandMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xe11d48,
      emissive: isNight ? 0xe11d48 : 0x000000,
      emissiveIntensity: isNight ? 0.8 : 0,
      roughness: 0.4,
      side: THREE.DoubleSide,
    }),
  );
  group.add(new THREE.Mesh(bandGeo, bandMat));

  const finGeo = track(new THREE.BoxGeometry(0.3, 4.4, 3.8));
  const finMat = track(new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.5 }));
  const topFin = new THREE.Mesh(finGeo, finMat);
  topFin.position.set(0, 3.6, -10.5);
  group.add(topFin);
  const sideFinGeo = track(new THREE.BoxGeometry(4.6, 0.3, 3.6));
  const sideFin = new THREE.Mesh(sideFinGeo, finMat);
  sideFin.position.set(0, 0, -10.5);
  group.add(sideFin);

  const cabinGeo = track(new THREE.BoxGeometry(2.1, 1.6, 5.2));
  const cabinMat = track(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 }));
  const cabin = new THREE.Mesh(cabinGeo, cabinMat);
  cabin.position.set(0, -4.9, 1.0);
  group.add(cabin);

  return group;
}

function buildHelicopterLandmark(
  track: TrackDisposable,
  isNight: boolean,
): { group: THREE.Group; mainRotor: THREE.Object3D; tailRotor: THREE.Object3D } {
  const group = new THREE.Group();
  const bodyMat = track(
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.45 }),
  );
  const accentMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: isNight ? 0x38bdf8 : 0x000000,
      emissiveIntensity: isNight ? 0.9 : 0,
      roughness: 0.3,
    }),
  );
  const rotorMat = track(new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.4, metalness: 0.6 }));

  const body = new THREE.Mesh(track(new THREE.BoxGeometry(2.4, 2.0, 5.4)), bodyMat);
  group.add(body);

  const canopy = new THREE.Mesh(track(new THREE.BoxGeometry(2.2, 1.3, 2.0)), accentMat);
  canopy.position.set(0, 0.1, 2.4);
  group.add(canopy);

  const boom = new THREE.Mesh(track(new THREE.BoxGeometry(0.55, 0.65, 5.6)), bodyMat);
  boom.position.set(0, 0.35, -5.0);
  group.add(boom);

  const mainRotor = new THREE.Group();
  mainRotor.position.set(0, 1.35, 0);
  const blade1 = new THREE.Mesh(track(new THREE.BoxGeometry(10.8, 0.08, 0.42)), rotorMat);
  const blade2 = new THREE.Mesh(track(new THREE.BoxGeometry(0.42, 0.08, 10.8)), rotorMat);
  mainRotor.add(blade1, blade2);
  group.add(mainRotor);

  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.4, 0.6, -7.6);
  const tBlade = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 2.4, 0.25)), rotorMat);
  tailRotor.add(tBlade);
  group.add(tailRotor);

  return { group, mainRotor, tailRotor };
}

function getSceneryPalette(scenery: SceneryTheme): {
  sky: number;
  ground: number;
  propColor1: number;
  propColor2: number;
  isNight: boolean;
} {
  switch (scenery) {
    case 'street-night':
      return { sky: 0x0c1322, ground: 0x161c28, propColor1: 0x1e293b, propColor2: 0x38bdf8, isNight: true };
    case 'desert':
      return { sky: 0xd9a773, ground: 0xb88b58, propColor1: 0x925f36, propColor2: 0x5c6b3c, isNight: false };
    case 'coastal':
      return { sky: 0x7ec8e3, ground: 0x568259, propColor1: 0x2e6f40, propColor2: 0x0284c7, isNight: false };
    case 'forest':
      return { sky: 0x8db9d8, ground: 0x325b37, propColor1: 0x1e4620, propColor2: 0x2d6a33, isNight: false };
    case 'parkland':
      return { sky: 0x94c5e8, ground: 0x3e6b3d, propColor1: 0x2a572c, propColor2: 0x4b7f44, isNight: false };
    case 'stadium':
    default:
      return { sky: 0x87b7dc, ground: 0x38613a, propColor1: 0x334155, propColor2: 0x1e40af, isNight: false };
  }
}

function buildRibbonGeometry(
  points: Array<{ x: number; y: number; z: number; nx: number; nz: number; banking?: number; width?: number }>,
  baseHalfWidth: number,
  yOffset: number,
  uvRepeatLength: number,
  closed: boolean,
  nominalTrackWidth = 16,
): THREE.BufferGeometry {
  const n = points.length;
  const vertCount = (closed ? n + 1 : n) * 2;
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const indices: number[] = [];

  let accLen = 0;
  for (let i = 0; i < (closed ? n + 1 : n); i++) {
    const p = points[i % n];
    if (i > 0) {
      const prev = points[(i - 1) % n];
      accLen += Math.hypot(p.x - prev.x, p.z - prev.z);
    }
    const vCoord = accLen / uvRepeatLength;

    const widthScale = p.width ? p.width / nominalTrackWidth : 1;
    const hw = baseHalfWidth * widthScale;

    // Apply banking rotation around tangent (banking > 0 raises right side, lowers left side)
    const bank = p.banking || 0;
    const cosB = Math.cos(bank);
    const sinB = Math.sin(bank);

    const lx = p.x - p.nx * hw * cosB;
    const ly = p.y + yOffset - hw * sinB;
    const lz = p.z - p.nz * hw * cosB;

    const rx = p.x + p.nx * hw * cosB;
    const ry = p.y + yOffset + hw * sinB;
    const rz = p.z + p.nz * hw * cosB;

    const base = i * 2;
    positions[base * 3] = lx;
    positions[base * 3 + 1] = ly;
    positions[base * 3 + 2] = lz;

    positions[(base + 1) * 3] = rx;
    positions[(base + 1) * 3 + 1] = ry;
    positions[(base + 1) * 3 + 2] = rz;

    // Upward surface normal tilted by banking
    const vertNx = -p.nx * sinB;
    const vertNy = cosB;
    const vertNz = -p.nz * sinB;

    normals[base * 3] = vertNx;
    normals[base * 3 + 1] = vertNy;
    normals[base * 3 + 2] = vertNz;

    normals[(base + 1) * 3] = vertNx;
    normals[(base + 1) * 3 + 1] = vertNy;
    normals[(base + 1) * 3 + 2] = vertNz;

    uvs[base * 2] = 0;
    uvs[base * 2 + 1] = vCoord;
    uvs[(base + 1) * 2] = 1;
    uvs[(base + 1) * 2 + 1] = vCoord;

    if (i > 0) {
      const a = (i - 1) * 2;
      const b = a + 1;
      const c = i * 2;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

export function buildTrackEnvironment(
  compiled: CompiledTrack,
  maxAniso = 4,
): BuiltTrackScene {
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const group = new THREE.Group();
  const palette = getSceneryPalette(compiled.spec.scenery);
  const halfW = compiled.spec.trackWidth * 0.5;
  const pitSideSign = compiled.spec.pitSide === 'right' ? 1 : -1;

  // 2. Expansive Contoured Ground Terrain Grid + Bank-Aware Embankment Skirts
  // Preserves track surface & banking heights 100%, derives continuous surrounding terrain from DEM road heights
  // so steep elevation circuits (Spa, Laguna Seca, Portimao) never exhibit sunken trenches or cliff walls.
  let minTrackX = Infinity, maxTrackX = -Infinity, minTrackZ = Infinity, maxTrackZ = -Infinity;
  let minTrackY = Infinity;
  let maxTrackY = -Infinity;
  for (let i = 0; i < compiled.samples.length; i++) {
    const s = compiled.samples[i];
    if (s.x < minTrackX) minTrackX = s.x;
    if (s.x > maxTrackX) maxTrackX = s.x;
    if (s.z < minTrackZ) minTrackZ = s.z;
    if (s.z > maxTrackZ) maxTrackZ = s.z;
    if (s.y < minTrackY) minTrackY = s.y;
    if (s.y > maxTrackY) maxTrackY = s.y;
  }
  const gridSpanX = Math.max(1600, (maxTrackX - minTrackX) + 540);
  const gridSpanZ = Math.max(1600, (maxTrackZ - minTrackZ) + 540);
  const centerTrackX = (minTrackX + maxTrackX) * 0.5;
  const centerTrackZ = (minTrackZ + maxTrackZ) * 0.5;

  // Build smooth 48x48 inverse-distance-weighted surrounding landscape elevation field from track DEM samples
  const anchorStep = Math.max(1, Math.floor(compiled.samples.length / 96));
  const anchors: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i < compiled.samples.length; i += anchorStep) {
    const s = compiled.samples[i];
    anchors.push({ x: s.x, y: s.y, z: s.z });
  }
  const FIELD_RES = 48;
  const fieldGrid = new Float32Array((FIELD_RES + 1) * (FIELD_RES + 1));
  const xMin = centerTrackX - gridSpanX * 0.5;
  const zMin = centerTrackZ - gridSpanZ * 0.5;
  const smoothR2 = 115 * 115;

  for (let gz = 0; gz <= FIELD_RES; gz++) {
    const wz = zMin + (gz / FIELD_RES) * gridSpanZ;
    for (let gx = 0; gx <= FIELD_RES; gx++) {
      const wx = xMin + (gx / FIELD_RES) * gridSpanX;
      let wSum = 0;
      let ySum = 0;
      for (let a = 0; a < anchors.length; a++) {
        const anc = anchors[a];
        const dx = wx - anc.x;
        const dz = wz - anc.z;
        const w = 1 / (dx * dx + dz * dz + smoothR2);
        wSum += w;
        ySum += w * anc.y;
      }
      fieldGrid[gz * (FIELD_RES + 1) + gx] = wSum > 0 ? ySum / wSum : -0.25;
    }
  }

  const sampleBaseGroundY = (wx: number, wz: number): number => {
    const u = Math.max(0, Math.min(FIELD_RES - 0.001, ((wx - xMin) / gridSpanX) * FIELD_RES));
    const v = Math.max(0, Math.min(FIELD_RES - 0.001, ((wz - zMin) / gridSpanZ) * FIELD_RES));
    const x0 = Math.floor(u);
    const z0 = Math.floor(v);
    const fx = u - x0;
    const fz = v - z0;
    const stride = FIELD_RES + 1;
    const h00 = fieldGrid[z0 * stride + x0];
    const h10 = fieldGrid[z0 * stride + x0 + 1];
    const h01 = fieldGrid[(z0 + 1) * stride + x0];
    const h11 = fieldGrid[(z0 + 1) * stride + x0 + 1];
    const h0 = h00 + (h10 - h00) * fx;
    const h1 = h01 + (h11 - h01) * fx;
    return h0 + (h1 - h0) * fz;
  };

  // High-resolution terrain grid (<= 7.5m edge near road corridor)
  const segsX = Math.min(340, Math.max(180, Math.ceil(gridSpanX / 7.0)));
  const segsZ = Math.min(340, Math.max(180, Math.ceil(gridSpanZ / 7.0)));
  const groundGeo = track(new THREE.PlaneGeometry(gridSpanX, gridSpanZ, segsX, segsZ));
  groundGeo.rotateX(-Math.PI / 2);
  groundGeo.translate(centerTrackX, 0, centerTrackZ);

  // Precompute line segments for both main track spline and pit-lane spline
  interface RoadSegment {
    ax: number; az: number; ay: number; aw: number; abank: number; anx: number; anz: number;
    bx: number; bz: number; by: number; bw: number; bbank: number; bnx: number; bnz: number;
  }
  const roadSegments: RoadSegment[] = [];
  const sCount = compiled.samples.length;
  for (let i = 0; i < sCount; i++) {
    const a = compiled.samples[i];
    const b = compiled.samples[(i + 1) % sCount];
    roadSegments.push({
      ax: a.x, az: a.z, ay: a.y, aw: a.width ? a.width : compiled.spec.trackWidth, abank: a.banking || 0, anx: a.nx, anz: a.nz,
      bx: b.x, bz: b.z, by: b.y, bw: b.width ? b.width : compiled.spec.trackWidth, bbank: b.banking || 0, bnx: b.nx, bnz: b.nz,
    });
  }

  // Build 2D spatial grid index for fast segment distance queries (covers corridor + 45m outer embankment)
  const CELL_SIZE = 44.0;
  const QUERY_MARGIN = 64.0;
  const spatialMap = new Map<number, number[]>();

  for (let i = 0; i < roadSegments.length; i++) {
    const seg = roadSegments[i];
    const c0 = Math.floor((Math.min(seg.ax, seg.bx) - QUERY_MARGIN) / CELL_SIZE);
    const c1 = Math.floor((Math.max(seg.ax, seg.bx) + QUERY_MARGIN) / CELL_SIZE);
    const r0 = Math.floor((Math.min(seg.az, seg.bz) - QUERY_MARGIN) / CELL_SIZE);
    const r1 = Math.floor((Math.max(seg.az, seg.bz) + QUERY_MARGIN) / CELL_SIZE);
    for (let c = c0; c <= c1; c++) {
      for (let r = r0; r <= r1; r++) {
        const key = (c * 73856093) ^ (r * 19349663);
        let list = spatialMap.get(key);
        if (!list) {
          list = [];
          spatialMap.set(key, list);
        }
        list.push(i);
      }
    }
  }

  const getNearestRoadSegment = (vx: number, vz: number) => {
    const c = Math.floor(vx / CELL_SIZE);
    const r = Math.floor(vz / CELL_SIZE);
    let minDistSq = Infinity;
    let bestSeg: RoadSegment | null = null;
    let bestT = 0;
    let bestPx = 0;
    let bestPz = 0;
    let bestSegHalfW = halfW;
    let lowestCorridorY = Infinity;
    let inAnyCorridor = false;
    let inApronCorridor = false;

    // Check 3x3 neighborhood around cell so segment queries never miss near cell boundaries
    const checked = new Set<number>();
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        const key = ((c + dc) * 73856093) ^ ((r + dr) * 19349663);
        const candidateIdxs = spatialMap.get(key);
        if (!candidateIdxs) continue;
        for (let j = 0; j < candidateIdxs.length; j++) {
          const segIdx = candidateIdxs[j];
          if (checked.has(segIdx)) continue;
          checked.add(segIdx);
          const seg = roadSegments[segIdx];
          const dx = seg.bx - seg.ax;
          const dz = seg.bz - seg.az;
          const lenSq = dx * dx + dz * dz;
          let t = 0;
          if (lenSq > 1e-6) {
            t = Math.max(0, Math.min(1, ((vx - seg.ax) * dx + (vz - seg.az) * dz) / lenSq));
          }
          const px = seg.ax + t * dx;
          const pz = seg.az + t * dz;
          const rx = vx - px;
          const rz = vz - pz;
          const dSq = rx * rx + rz * rz;

          const segW = seg.aw + t * (seg.bw - seg.aw);
          const segHalfW = segW * 0.5;
          const segApron = segHalfW + 6.5;
          if (dSq <= segApron * segApron) {
            inApronCorridor = true;
            if (dSq <= (segHalfW + 1.8) * (segHalfW + 1.8)) {
              inAnyCorridor = true;
            }
            const segY = seg.ay + t * (seg.by - seg.ay);
            const segBank = seg.abank + t * (seg.bbank - seg.abank);
            const segNx = seg.anx + t * (seg.bnx - seg.anx);
            const segNz = seg.anz + t * (seg.bnz - seg.anz);
            const latSigned = rx * segNx + rz * segNz;
            const clampedLat = Math.max(-(segHalfW + 5.2), Math.min(segHalfW + 5.2, latSigned));
            const segSurfaceY = segY + clampedLat * Math.sin(segBank);
            if (segSurfaceY < lowestCorridorY) lowestCorridorY = segSurfaceY;
          }

          if (dSq < minDistSq) {
            minDistSq = dSq;
            bestSeg = seg;
            bestT = t;
            bestPx = px;
            bestPz = pz;
            bestSegHalfW = segHalfW;
          }
        }
      }
    }
    return {
      bestSeg,
      bestT,
      bestDist: Math.sqrt(minDistSq),
      bestPx,
      bestPz,
      bestSegHalfW,
      lowestCorridorY,
      inAnyCorridor,
      inApronCorridor,
    };
  };

  const clampTerrainHeight = (vx: number, vz: number, rawY: number, isSkirt = false): { y: number; insideRoad: boolean } => {
    const {
      bestSeg,
      bestT,
      bestDist,
      bestPx,
      bestPz,
      bestSegHalfW,
      lowestCorridorY,
      inAnyCorridor,
      inApronCorridor,
    } = getNearestRoadSegment(vx, vz);
    let vy = rawY;
    let insideRoad = false;
    if (bestSeg) {
      const roadHalfW = bestSegHalfW;
      const roadY = bestSeg.ay + bestT * (bestSeg.by - bestSeg.ay);
      const roadBank = bestSeg.abank + bestT * (bestSeg.bbank - bestSeg.abank);
      const segNx = bestSeg.anx + bestT * (bestSeg.bnx - bestSeg.anx);
      const segNz = bestSeg.anz + bestT * (bestSeg.bnz - bestSeg.anz);

      const latSigned = (vx - bestPx) * segNx + (vz - bestPz) * segNz;
      const latSign = Math.sign(latSigned) || 1;
      const clampedLat = Math.max(-(roadHalfW + 5.2), Math.min(roadHalfW + 5.2, latSigned));
      const roadSurfaceY = roadY + clampedLat * Math.sin(roadBank);
      const roadEdgeY = roadY + latSign * (roadHalfW + 5.2) * Math.sin(roadBank);

      // Overpass: upper bridge crosses >=3.5m above a lower road corridor (e.g., Suzuka figure-8).
      const isOverpass =
        inAnyCorridor && lowestCorridorY < Infinity && roadY - lowestCorridorY > 3.5;

      const minClearance = isSkirt ? 0.22 : 0.72;
      const dClamp = roadHalfW + (isSkirt ? 5.0 : 6.6);
      const dOuter = roadHalfW + 44.0;
      const corridorFloorY =
        (lowestCorridorY < Infinity ? Math.min(roadSurfaceY, lowestCorridorY) : roadSurfaceY) -
        minClearance;

      if (!isSkirt && (bestDist <= roadHalfW + 5.2 || inApronCorridor)) {
        insideRoad = true;
      }

      if (isOverpass) {
        vy = Math.min(vy, lowestCorridorY - minClearance);
      } else if (inApronCorridor || bestDist <= dClamp) {
        // Strictly depressed beneath road, kerbs, and runoff apron
        vy = Math.min(vy, corridorFloorY);
      } else if (bestDist <= dOuter) {
        // Smoothstep outer embankment transition from apron outer edge to surrounding DEM terrain
        const edgeBaseY =
          (lowestCorridorY < Infinity ? Math.min(roadEdgeY, lowestCorridorY) : roadEdgeY) -
          (isSkirt ? 0.14 : 0.34);
        const u = (bestDist - dClamp) / (dOuter - dClamp);
        const s = u * u * (3 - 2 * u);
        vy = Math.min(vy, edgeBaseY * (1 - s) + rawY * s);
        // Anti-tenting guard just outside the apron edge so coarse grid triangles never clip upward across the apron
        if (bestDist <= roadHalfW + 18.0) {
          const maxSlopeY = edgeBaseY + Math.max(0, bestDist - dClamp) * 0.12;
          vy = Math.min(vy, maxSlopeY);
        }
      }
    }
    return { y: vy, insideRoad };
  };

  const posAttr = groundGeo.attributes.position;
  for (let k = 0; k < posAttr.count; k++) {
    const vx = posAttr.getX(k);
    const vz = posAttr.getZ(k);
    const bgY = sampleBaseGroundY(vx, vz);
    const res = clampTerrainHeight(vx, vz, bgY, false);
    posAttr.setY(k, res.y);
  }

  // Keep the full terrain mesh intact underneath the track (depressed safely below road/apron)
  // so no empty void gaps ever appear beneath embankments, hairpins, or hillsides.
  groundGeo.computeVertexNormals();

  const groundMat = track(
    new THREE.MeshStandardMaterial({
      color: palette.ground,
      roughness: 0.94,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: 4,
      polygonOffsetUnits: 4,
    }),
  );
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  group.add(ground);

  // Optional coastal harbor water apron safely below lowest track coastal elevation
  if (compiled.spec.scenery === 'coastal') {
    const waterGeo = track(new THREE.RingGeometry(240, 720, 48));
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = track(
      new THREE.MeshPhysicalMaterial({
        color: 0x0e7490,
        roughness: 0.18,
        metalness: 0.1,
        clearcoat: 0.9,
      }),
    );
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = Math.min(-0.65, minTrackY - 1.2);
    group.add(water);
  }

  // 2b. Smooth Bank-Aware Outer Turf Embankment Skirts (2 radial rings from apron outer edge +4.70m out to +32m)
  // Bridges steep elevation crests & banked corners cleanly with zero hairpin self-intersection or road overlap
  const buildOuterSkirt = (side: -1 | 1): THREE.BufferGeometry => {
    const n = compiled.samples.length;
    const vertCount = (n + 1) * 3;
    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    const indices: number[] = [];

    for (let i = 0; i <= n; i++) {
      const s = compiled.samples[i % n];
      const hw = s.width ? s.width * 0.5 : halfW;
      const bank = s.banking || 0;
      const cosB = Math.cos(bank);
      const sinB = Math.sin(bank);

      // Detect elevated overpass sections (e.g. Suzuka bridge)
      let minOtherY = s.y;
      if (s.y > 4.0) {
        for (let k = 0; k < n; k += 4) {
          const stepD = Math.min(Math.abs(k - (i % n)), n - Math.abs(k - (i % n)));
          if (stepD < 24) continue;
          const o = compiled.samples[k];
          if ((o.x - s.x) * (o.x - s.x) + (o.z - s.z) * (o.z - s.z) < 42 * 42) {
            minOtherY = Math.min(minOtherY, o.y);
          }
        }
      }
      const isOverpass = s.y - minOtherY > 3.5;

      // Dynamically cap outer skirt width on inside of tight hairpins AND before reaching any non-adjacent road corridor
      const avgSegLen = Math.max(1.0, compiled.totalLength / Math.max(1, n));
      const isInsideTurn = s.curvature * side > 0.004;
      let maxSafeOuter = isInsideTurn
        ? Math.min(32.0, Math.max(5.4, 0.72 / Math.abs(s.curvature) - hw))
        : 32.0;

      // March along outward normal to stop skirt cleanly before crossing another leg (including tight hairpins & chicanes)
      const checkSkip = Math.max(4, Math.min(18, Math.ceil((hw + 14.0) / avgSegLen)));
      for (let dProbe = 5.5; dProbe <= maxSafeOuter; dProbe += 1.8) {
        const px = s.x + s.nx * side * (hw + dProbe) * cosB;
        const pz = s.z + s.nz * side * (hw + dProbe) * cosB;
        let hitOther = false;
        for (let k = 0; k < n; k++) {
          const stepD = Math.min(Math.abs(k - (i % n)), n - Math.abs(k - (i % n)));
          if (stepD < checkSkip) continue;
          const o = compiled.samples[k];
          const ohw = o.width ? o.width * 0.5 : halfW;
          const dx = px - o.x;
          const dz = pz - o.z;
          const clearR = ohw + 3.6;
          if (dx * dx + dz * dz < clearR * clearR) {
            maxSafeOuter = Math.max(4.9, dProbe - 1.8);
            hitOther = true;
            break;
          }
        }
        if (hitOther) break;
      }

      const apronSideHW = computeTrackApronHalfWidth(hw, s.curvature || 0, side);
      const innerEdge = Math.max(hw + 0.4, apronSideHW - 0.35);
      const midEdge = Math.min(hw + 13.0, innerEdge + Math.max(0.6, (hw + maxSafeOuter - innerEdge) * 0.4));
      const outerEdge = Math.max(innerEdge + 0.9, hw + Math.max(5.0, maxSafeOuter));

      const ix = s.x + s.nx * side * innerEdge * cosB;
      const iz = s.z + s.nz * side * innerEdge * cosB;
      const iyRaw = isOverpass ? s.y - 1.2 : s.y - 0.16 + side * innerEdge * sinB;
      const iy = clampTerrainHeight(ix, iz, iyRaw, true).y;

      const mx = s.x + s.nx * side * midEdge * cosB;
      const mz = s.z + s.nz * side * midEdge * cosB;
      const bgMidY = sampleBaseGroundY(mx, mz);
      const myRaw = isOverpass
        ? Math.min(bgMidY, s.y - 1.35)
        : iy * 0.65 + bgMidY * 0.35;
      const my = clampTerrainHeight(mx, mz, myRaw, true).y;

      const ox = s.x + s.nx * side * outerEdge;
      const oz = s.z + s.nz * side * outerEdge;
      const bgOuterY = sampleBaseGroundY(ox, oz);
      const oyRaw = isOverpass ? Math.min(bgOuterY, s.y - 1.5) : bgOuterY;
      const oy = clampTerrainHeight(ox, oz, oyRaw, true).y;

      const base = i * 3;
      positions[base * 3] = ix;
      positions[base * 3 + 1] = iy;
      positions[base * 3 + 2] = iz;
      positions[(base + 1) * 3] = mx;
      positions[(base + 1) * 3 + 1] = my;
      positions[(base + 1) * 3 + 2] = mz;
      positions[(base + 2) * 3] = ox;
      positions[(base + 2) * 3 + 1] = oy;
      positions[(base + 2) * 3 + 2] = oz;

      normals[base * 3 + 1] = 1;
      normals[(base + 1) * 3 + 1] = 1;
      normals[(base + 2) * 3 + 1] = 1;

      if (i > 0) {
        const p0 = (i - 1) * 3;
        const p1 = p0 + 1;
        const p2 = p0 + 2;
        const c0 = base;
        const c1 = base + 1;
        const c2 = base + 2;
        const tris = side === 1
          ? [[p0, p1, c0], [p1, c1, c0], [p1, p2, c1], [p2, c2, c1]]
          : [[p1, p0, c0], [p1, c0, c1], [p2, p1, c1], [p2, c1, c2]];
        const pointClipsRoad = (qx: number, qy: number, qz: number): boolean => {
          const segCheck = getNearestRoadSegment(qx, qz);
          if (!segCheck.bestSeg) return false;
          if (!segCheck.inApronCorridor && segCheck.bestDist >= segCheck.bestSegHalfW + 2.2) return false;
          const bSeg = segCheck.bestSeg;
          const bt = segCheck.bestT;
          const ry = bSeg.ay + bt * (bSeg.by - bSeg.ay);
          const rBank = bSeg.abank + bt * (bSeg.bbank - bSeg.abank);
          const rNx = bSeg.anx + bt * (bSeg.bnx - bSeg.anx);
          const rNz = bSeg.anz + bt * (bSeg.bnz - bSeg.anz);
          const lat = (qx - segCheck.bestPx) * rNx + (qz - segCheck.bestPz) * rNz;
          const clampedLat = Math.max(-(segCheck.bestSegHalfW + 4.8), Math.min(segCheck.bestSegHalfW + 4.8, lat));
          const rSurfY = ry + clampedLat * Math.sin(rBank);
          const minSurfY = segCheck.lowestCorridorY < Infinity ? Math.min(rSurfY, segCheck.lowestCorridorY) : rSurfY;
          return qy > minSurfY - 0.10;
        };
        for (const [ta, tb, tc] of tris) {
          const ax = positions[ta * 3], ay = positions[ta * 3 + 1], az = positions[ta * 3 + 2];
          const bx = positions[tb * 3], by = positions[tb * 3 + 1], bz = positions[tb * 3 + 2];
          const cx = positions[tc * 3], cy = positions[tc * 3 + 1], cz = positions[tc * 3 + 2];
          if (
            pointClipsRoad((ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3) ||
            pointClipsRoad((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5) ||
            pointClipsRoad((bx + cx) * 0.5, (by + cy) * 0.5, (bz + cz) * 0.5) ||
            pointClipsRoad((cx + ax) * 0.5, (cy + ay) * 0.5, (cz + az) * 0.5) ||
            pointClipsRoad(ax, ay, az) ||
            pointClipsRoad(bx, by, bz) ||
            pointClipsRoad(cx, cy, cz)
          ) {
            continue;
          }
          indices.push(ta, tb, tc);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  };

  for (const side of [-1, 1] as const) {
    const skirtGeo = track(buildOuterSkirt(side));
    const skirtMesh = new THREE.Mesh(skirtGeo, groundMat);
    skirtMesh.receiveShadow = true;
    group.add(skirtMesh);
  }

  // 3. Main Track Asphalt Ribbon (y + 0.005m, cleanly above apron & depressed terrain)
  const asphaltTex = track(createAsphaltTexture(compiled.spec.asphaltColor, maxAniso));
  const roadGeo = track(buildRibbonGeometry(compiled.samples, halfW, 0.005, 16, true, compiled.spec.trackWidth));
  const roadMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: asphaltTex,
      roughness: 0.78,
      metalness: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  roadMesh.renderOrder = 2;
  group.add(roadMesh);

  // 4. Gravel / Turf Runoff Apron under Track (y - 0.030m, curvature-clamped so inner hairpin edges never fold over asphalt)
  const buildSafeApronGeometry = (): THREE.BufferGeometry => {
    const pts = compiled.samples;
    const n = pts.length;
    const vertCount = (n + 1) * 2;
    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 2);
    const indices: number[] = [];

    let accLen = 0;
    for (let i = 0; i <= n; i++) {
      const p = pts[i % n];
      if (i > 0) {
        const prev = pts[(i - 1) % n];
        accLen += Math.hypot(p.x - prev.x, p.z - prev.z);
      }
      const vCoord = accLen / 24;
      const roadHW = p.width ? p.width * 0.5 : halfW;
      const curv = p.curvature || 0;
      const leftHW = computeTrackApronHalfWidth(roadHW, curv, -1);
      const rightHW = computeTrackApronHalfWidth(roadHW, curv, 1);

      const bank = p.banking || 0;
      const cosB = Math.cos(bank);
      const sinB = Math.sin(bank);

      const lx = p.x - p.nx * leftHW * cosB;
      let ly = p.y - 0.03 - leftHW * sinB;
      const lz = p.z - p.nz * leftHW * cosB;

      const rx = p.x + p.nx * rightHW * cosB;
      let ry = p.y - 0.03 + rightHW * sinB;
      const rz = p.z + p.nz * rightHW * cosB;

      // Ensure apron edges never protrude above an adjacent lower road leg (e.g. Monaco/Montreal/Interlagos hairpins)
      const qL = getNearestRoadSegment(lx, lz);
      if (qL.lowestCorridorY < Infinity && ly > qL.lowestCorridorY - 0.03 && p.y - qL.lowestCorridorY < 3.5) {
        ly = qL.lowestCorridorY - 0.03;
      }
      const qR = getNearestRoadSegment(rx, rz);
      if (qR.lowestCorridorY < Infinity && ry > qR.lowestCorridorY - 0.03 && p.y - qR.lowestCorridorY < 3.5) {
        ry = qR.lowestCorridorY - 0.03;
      }

      const base = i * 2;
      positions[base * 3] = lx;
      positions[base * 3 + 1] = ly;
      positions[base * 3 + 2] = lz;
      positions[(base + 1) * 3] = rx;
      positions[(base + 1) * 3 + 1] = ry;
      positions[(base + 1) * 3 + 2] = rz;

      const vertNx = -p.nx * sinB;
      const vertNy = cosB;
      const vertNz = -p.nz * sinB;
      normals[base * 3] = vertNx;
      normals[base * 3 + 1] = vertNy;
      normals[base * 3 + 2] = vertNz;
      normals[(base + 1) * 3] = vertNx;
      normals[(base + 1) * 3 + 1] = vertNy;
      normals[(base + 1) * 3 + 2] = vertNz;

      uvs[base * 2] = 0;
      uvs[base * 2 + 1] = vCoord;
      uvs[(base + 1) * 2] = 1;
      uvs[(base + 1) * 2 + 1] = vCoord;

      if (i > 0) {
        const a = (i - 1) * 2;
        const b = a + 1;
        const c = i * 2;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    return geo;
  };
  const apronGeo = track(buildSafeApronGeometry());
  const apronMat = track(
    new THREE.MeshStandardMaterial({
      color: compiled.spec.scenery === 'desert' ? 0xc49c6e : 0x3b483d,
      roughness: 0.95,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
  );
  const apronMesh = new THREE.Mesh(apronGeo, apronMat);
  apronMesh.receiveShadow = true;
  apronMesh.renderOrder = 1;
  group.add(apronMesh);

  // 4b. Solid Roadbed Under-Deck & Foundation Walls (seals every underside edge on hills, banking, and overpasses)
  const buildRoadbedUnderDeckGeometry = (): THREE.BufferGeometry => {
    const pts = compiled.samples;
    const n = pts.length;
    // 4 vertices per sample: leftTop, leftBot, rightBot, rightTop
    const positions = new Float32Array((n + 1) * 4 * 3);
    const indices: number[] = [];

    for (let i = 0; i <= n; i++) {
      const p = pts[i % n];
      const roadHW = p.width ? p.width * 0.5 : halfW;
      const curv = p.curvature || 0;
      const leftHW = computeTrackApronHalfWidth(roadHW, curv, -1);
      const rightHW = computeTrackApronHalfWidth(roadHW, curv, 1);

      const bank = p.banking || 0;
      const cosB = Math.cos(bank);
      const sinB = Math.sin(bank);

      const lx = p.x - p.nx * leftHW * cosB;
      const lyTop = p.y - 0.04 - leftHW * sinB;
      const lz = p.z - p.nz * leftHW * cosB;

      const rx = p.x + p.nx * rightHW * cosB;
      const ryTop = p.y - 0.04 + rightHW * sinB;
      const rz = p.z + p.nz * rightHW * cosB;

      // Detect elevated bridge/overpass so bridge underside stays a clean 1.15m slab above the lower road
      let isBridge = false;
      if (p.y > 4.0) {
        for (let k = 0; k < n; k += 4) {
          const stepD = Math.min(Math.abs(k - (i % n)), n - Math.abs(k - (i % n)));
          if (stepD < 24) continue;
          const o = pts[k];
          if ((o.x - p.x) * (o.x - p.x) + (o.z - p.z) * (o.z - p.z) < 38 * 38 && p.y - o.y > 3.5) {
            isBridge = true;
            break;
          }
        }
      }

      const bgL = sampleBaseGroundY(lx, lz);
      const bgR = sampleBaseGroundY(rx, rz);
      const lyBot = isBridge ? lyTop - 1.15 : Math.min(lyTop - 1.45, bgL - 0.9);
      const ryBot = isBridge ? ryTop - 1.15 : Math.min(ryTop - 1.45, bgR - 0.9);

      const base = i * 4;
      // 0: leftTop, 1: leftBot, 2: rightBot, 3: rightTop
      positions[base * 3] = lx;
      positions[base * 3 + 1] = lyTop;
      positions[base * 3 + 2] = lz;
      positions[(base + 1) * 3] = lx;
      positions[(base + 1) * 3 + 1] = lyBot;
      positions[(base + 1) * 3 + 2] = lz;
      positions[(base + 2) * 3] = rx;
      positions[(base + 2) * 3 + 1] = ryBot;
      positions[(base + 2) * 3 + 2] = rz;
      positions[(base + 3) * 3] = rx;
      positions[(base + 3) * 3 + 1] = ryTop;
      positions[(base + 3) * 3 + 2] = rz;

      if (i > 0) {
        const p0 = (i - 1) * 4;
        const c0 = base;
        // Left vertical foundation wall (outward normal)
        indices.push(p0, c0, p0 + 1, c0, c0 + 1, p0 + 1);
        // Bottom soffit (downward normal)
        indices.push(p0 + 1, c0 + 1, p0 + 2, c0 + 1, c0 + 2, p0 + 2);
        // Right vertical foundation wall (outward normal)
        indices.push(p0 + 2, c0 + 2, p0 + 3, c0 + 2, c0 + 3, p0 + 3);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  };
  const underDeckGeo = track(buildRoadbedUnderDeckGeometry());
  const underDeckMat = track(
    new THREE.MeshStandardMaterial({
      color: compiled.spec.scenery === 'desert' ? 0x6b5b4a : 0x334155,
      roughness: 0.92,
      metalness: 0.05,
      side: THREE.DoubleSide,
    }),
  );
  const underDeckMesh = new THREE.Mesh(underDeckGeo, underDeckMat);
  underDeckMesh.receiveShadow = true;
  group.add(underDeckMesh);

  // 5. Stylized Oversized Die-Cast Apex Kerbs (y + 0.020m, strictly proud of asphalt)
  const kerbTex = track(createKerbTexture(compiled.spec.kerbPrimary, compiled.spec.kerbSecondary, maxAniso));
  const kerbMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      map: kerbTex,
      roughness: 0.84,
      metalness: 0.02,
      envMapIntensity: 0.25,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  const kerbBoxGeo = track(new THREE.BoxGeometry(1.3, 0.07, 2.2));
  const kerbMatrices: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  const basisMat = new THREE.Matrix4();
  const zAxis = new THREE.Vector3();
  const xRaw = new THREE.Vector3();
  const yAxis = new THREE.Vector3();
  const xAxis = new THREE.Vector3();
  const setBankedTrackTransform = (
    px: number,
    py: number,
    pz: number,
    s: CompiledTrack['samples'][number],
    bank: number,
  ) => {
    const cosB = Math.cos(bank);
    const sinB = Math.sin(bank);
    zAxis.set(s.tx, s.ty || 0, s.tz).normalize();
    xRaw.set(-s.nx * cosB, -sinB, -s.nz * cosB);
    yAxis.crossVectors(zAxis, xRaw).normalize();
    xAxis.crossVectors(yAxis, zAxis).normalize();
    dummy.position.set(px, py, pz);
    dummy.quaternion.setFromRotationMatrix(basisMat.makeBasis(xAxis, yAxis, zAxis));
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
  };

  for (let i = 0; i < compiled.samples.length; i++) {
    const s = compiled.samples[i];
    if (Math.abs(s.curvature) > 0.0115) {
      // Place kerb on inside of corner
      const side = s.curvature > 0 ? 1 : -1;
      const bank = s.banking || 0;
      const cosB = Math.cos(bank);
      const sinB = Math.sin(bank);
      const curHalfW = s.width ? s.width * 0.5 : halfW;
      const kerbDist = curHalfW + 0.55;
      setBankedTrackTransform(
        s.x + s.nx * side * kerbDist * cosB,
        s.y + 0.02 + (i % 2) * 0.003 + side * kerbDist * sinB,
        s.z + s.nz * side * kerbDist * cosB,
        s,
        bank,
      );
      kerbMatrices.push(dummy.matrix.clone());
    }
  }

  if (kerbMatrices.length > 0) {
    const kerbInst = new THREE.InstancedMesh(kerbBoxGeo, kerbMat, kerbMatrices.length);
    kerbMatrices.forEach((m, idx) => kerbInst.setMatrixAt(idx, m));
    kerbInst.instanceMatrix.needsUpdate = true;
    kerbInst.computeBoundingSphere();
    kerbInst.receiveShadow = true;
    group.add(kerbInst);
  }

  // 6. Solid Continuous Extruded 3D FIA Safety Barriers (concrete base + striped upper rail, zero gaps)
  const createSolidBarrierTexture = (): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Lower weathered concrete jersey wall
      ctx.fillStyle = '#9aa5b1';
      ctx.fillRect(0, 62, 256, 66);
      // Subtle concrete seam & grime band near base
      ctx.fillStyle = '#7b8794';
      ctx.fillRect(0, 104, 256, 24);
      ctx.fillStyle = '#52606d';
      ctx.fillRect(0, 60, 256, 5);
      // Upper matte steel rail with alternating safety panels
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(0, 0, 128, 60);
      ctx.fillStyle = compiled.spec.kerbPrimary || '#b91c1c';
      ctx.fillRect(128, 0, 128, 60);
      // Dark steel shadow groove & muted top cap (no bright specular glare strip)
      ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
      ctx.fillRect(0, 28, 256, 5);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.fillRect(0, 0, 256, 4);
      // Concrete vertical expansion joints
      ctx.fillStyle = 'rgba(30, 41, 59, 0.35)';
      ctx.fillRect(0, 62, 3, 66);
      ctx.fillRect(128, 62, 3, 66);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, maxAniso);
    return tex;
  };

  const barrierTex = track(createSolidBarrierTexture());
  const barrierMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xdbe2ea,
      map: barrierTex,
      roughness: 0.9,
      metalness: 0.04,
      envMapIntensity: 0.2,
    }),
  );

  const buildContinuousSolidBarrier = (side: -1 | 1): THREE.BufferGeometry => {
    const pts = compiled.samples;
    const n = pts.length;
    const adjSkip = Math.max(12, Math.floor(n * 0.04));

    // 4-point closed cross-section profile per sample:
    // 0: inner bottom (buried -0.65m into apron), 1: inner top (+1.08m),
    // 2: outer top (+1.08m, +0.58m thick), 3: outer bottom (-0.65m, +0.66m thick)
    const profileOffsets: Array<{ dOff: number; yOff: number; v: number }> = [
      { dOff: 0.0, yOff: -0.65, v: 0.0 },
      { dOff: 0.04, yOff: 1.08, v: 1.0 },
      { dOff: 0.58, yOff: 1.08, v: 1.0 },
      { dOff: 0.66, yOff: -0.65, v: 0.0 },
    ];
    const P = profileOffsets.length;
    const positions = new Float32Array((n + 1) * P * 3);
    const uvs = new Float32Array((n + 1) * P * 2);
    const validSample = new Uint8Array(n + 1);
    const indices: number[] = [];

    let accDist = 0;
    for (let i = 0; i <= n; i++) {
      const idx = i % n;
      const s = pts[idx];
      if (i > 0) {
        const prev = pts[(i - 1) % n];
        accDist += Math.hypot(s.x - prev.x, s.z - prev.z);
      }
      const uCoord = accDist / 12.0;
      const bank = s.banking || 0;
      const cosB = Math.cos(bank);
      const sinB = Math.sin(bank);
      const curHalfW = s.width ? s.width * 0.5 : halfW;
      const wallInner = computeTrackWallHalfWidth(curHalfW, s.curvature || 0, side);

      const testX = s.x + s.nx * side * (wallInner + 0.3) * cosB;
      const testY = s.y + side * (wallInner + 0.3) * sinB;
      const testZ = s.z + s.nz * side * (wallInner + 0.3) * cosB;

      // Skip barrier segment only if it physically collides with a non-adjacent road deck at the same elevation
      let overlapsOtherRoad = false;
      for (let j = 0; j < n; j += 2) {
        const dIdx = Math.min(Math.abs(j - idx), n - Math.abs(j - idx));
        if (dIdx < adjSkip) continue;
        const o = pts[j];
        if (Math.abs(o.y - testY) >= 4.0) continue;
        const clearR = (o.width ? o.width * 0.5 : halfW) + 1.4;
        const dx = testX - o.x;
        const dz = testZ - o.z;
        if (dx * dx + dz * dz < clearR * clearR) {
          overlapsOtherRoad = true;
          break;
        }
      }
      validSample[i] = overlapsOtherRoad ? 0 : 1;

      for (let pIdx = 0; pIdx < P; pIdx++) {
        const prof = profileOffsets[pIdx];
        const lat = wallInner + prof.dOff;
        const vx = s.x + s.nx * side * lat * cosB;
        const vy = s.y + side * lat * sinB + prof.yOff;
        const vz = s.z + s.nz * side * lat * cosB;

        const outIdx = i * P + pIdx;
        positions[outIdx * 3] = vx;
        positions[outIdx * 3 + 1] = vy;
        positions[outIdx * 3 + 2] = vz;
        uvs[outIdx * 2] = uCoord;
        uvs[outIdx * 2 + 1] = prof.v;
      }

      if (i > 0 && validSample[i] && validSample[i - 1]) {
        const a0 = (i - 1) * P;
        const b0 = i * P;
        // Connect inner face (0->1), top cap (1->2), outer face (2->3) with outward winding
        for (let seg = 0; seg < P - 1; seg++) {
          const pA = a0 + seg;
          const pB = a0 + seg + 1;
          const cA = b0 + seg;
          const cB = b0 + seg + 1;
          if (side === 1) {
            indices.push(pA, pB, cA, pB, cB, cA);
          } else {
            indices.push(pA, cA, pB, pB, cA, cB);
          }
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  };

  for (const side of [-1, 1] as const) {
    const solidBarrierGeo = track(buildContinuousSolidBarrier(side));
    const solidBarrierMesh = new THREE.Mesh(solidBarrierGeo, barrierMat);
    solidBarrierMesh.castShadow = true;
    solidBarrierMesh.receiveShadow = true;
    group.add(solidBarrierMesh);
  }

  // 6b. Concrete Overpass Support Piers on Elevated Sections (e.g., Suzuka Figure-8 Bridge)
  const pierGeo = track(new THREE.BoxGeometry(1.4, 1.0, 1.4));
  const pierMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.85,
      metalness: 0.1,
    }),
  );
  const pierStep = Math.max(8, Math.floor(compiled.samples.length / 40));
  for (let i = 0; i < compiled.samples.length; i += pierStep) {
    const s = compiled.samples[i];
    const bgY = sampleBaseGroundY(s.x, s.z);
    if (s.y - bgY > 3.5) {
      const curHalfW = s.width ? s.width * 0.5 : halfW;
      const pierHeight = s.y - bgY;
      for (const side of [-1, 1]) {
        const pier = new THREE.Mesh(pierGeo, pierMat);
        const offset = curHalfW + 2.4;
        pier.scale.y = Math.max(1, pierHeight);
        pier.position.set(
          s.x + s.nx * side * offset,
          bgY + pierHeight * 0.5,
          s.z + s.nz * side * offset,
        );
        pier.rotation.y = Math.atan2(s.tx, s.tz);
        pier.castShadow = true;
        pier.receiveShadow = true;
        group.add(pier);
      }
    }
  }

  // 6c. 200m / 150m / 100m / 50m Braking Distance Boards before Heavy Braking Zones
  const boardDists = [200, 150, 100, 50];
  const boardGeo = track(new THREE.BoxGeometry(2.6, 1.75, 0.24));
  const postGeo = track(new THREE.BoxGeometry(0.22, 2.2, 0.22));
  const postMat = track(new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6, metalness: 0.5 }));
  const boardFaceMats = boardDists.map((dist) => {
    const tex = track(createBrakingBoardTexture(dist, maxAniso));
    return track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.78, metalness: 0.02, envMapIntensity: 0.25 }));
  });

  const totalSamples = compiled.samples.length;
  const distScale = compiled.totalLength / totalSamples;
  // Corners where target apex speed drops below 65% of straight-line top speed (|curvature| > 0.025, R < 40m)
  const zoneEntries: Array<{ index: number; side: number }> = [];
  let cooldownSamples = 0;
  for (let i = 0; i < totalSamples; i++) {
    if (cooldownSamples > 0) {
      cooldownSamples--;
      continue;
    }
    const cur = compiled.samples[i];
    // Check direction change angle over the corner entry (25m) or heavy curvature
    const upcomingSamples = Math.max(3, Math.round(25 / distScale));
    const nextSamp = compiled.samples[(i + upcomingSamples) % totalSamples];
    const dotTangent = Math.max(-1, Math.min(1, cur.tx * nextSamp.tx + cur.tz * nextSamp.tz));
    const turnAngleDeg = Math.acos(dotTangent) * (180 / Math.PI);
    const isHeavyBraking = Math.abs(cur.curvature) > 0.022 || turnAngleDeg > 35;

    if (isHeavyBraking) {
      // Check preceding ~50m has a genuine straight/braking approach
      const backCheck = Math.max(4, Math.round(50 / distScale));
      let approachClear = true;
      for (let b = 2; b <= backCheck; b++) {
        const prev = compiled.samples[(i - b + totalSamples) % totalSamples];
        if (Math.abs(prev.curvature) > 0.016) {
          approachClear = false;
          break;
        }
      }
      if (approachClear) {
        // Outside of the corner is opposite the inside turn direction
        const outsideSide = cur.curvature > 0 ? -1 : 1;
        zoneEntries.push({ index: i, side: outsideSide });
        cooldownSamples = Math.max(12, Math.round(95 / distScale));
      }
    }
  }

  // Scale board spacing proportionally to scaled track length so 200/150/100/50 sit cleanly along approach
  const worldSpacingRatio = Math.min(0.85, Math.max(0.42, compiled.totalLength / 3200));
  for (const zone of zoneEntries) {
    for (let bIdx = 0; bIdx < boardDists.length; bIdx++) {
      const metersBefore = boardDists[bIdx] * worldSpacingRatio;
      const offsetSamples = Math.round(metersBefore / distScale);
      const si = (zone.index - offsetSamples + totalSamples) % totalSamples;
      const s = compiled.samples[si];
      if (s.y > 4.2) continue; // avoid floating boards beside elevated overpasses
      if (bIdx < 2 && Math.abs(s.curvature) > 0.02) continue; // only show 200m/150m if approach is clear

      const bank = s.banking || 0;
      const curHalfW = s.width ? s.width * 0.5 : halfW;
      const latDist = curHalfW + 3.4;
      const bx = s.x + s.nx * zone.side * latDist * Math.cos(bank);
      const by = s.y + zone.side * latDist * Math.sin(bank);
      const bz = s.z + s.nz * zone.side * latDist * Math.cos(bank);

      const boardGroup = new THREE.Group();
      boardGroup.position.set(bx, by, bz);
      // Face oncoming drivers (-tangent direction)
      boardGroup.rotation.y = Math.atan2(-s.tx, -s.tz);

      const post = new THREE.Mesh(postGeo, postMat);
      post.position.y = 1.1;
      boardGroup.add(post);

      const signMesh = new THREE.Mesh(boardGeo, [
        postMat,
        postMat,
        postMat,
        postMat,
        boardFaceMats[bIdx],
        boardFaceMats[bIdx],
      ]);
      signMesh.position.y = 2.1;
      signMesh.castShadow = true;
      boardGroup.add(signMesh);

      group.add(boardGroup);
    }
  }

  // 7. Start / Finish Line & Checkered Gantry Arch + Starting Lights
  const sf = sampleTrackAtT(compiled, 0);
  const sfAngle = Math.atan2(sf.tx, sf.tz);
  const sfGroup = new THREE.Group();
  sfGroup.position.set(sf.x, sf.y, sf.z);
  sfGroup.rotation.y = sfAngle;

  const sfLineTex = track(createStartLineTexture(maxAniso));
  const sfLineGeo = track(new THREE.PlaneGeometry(compiled.spec.trackWidth, 2.8));
  sfLineGeo.rotateX(-Math.PI / 2);
  const sfLineMat = track(
    new THREE.MeshStandardMaterial({
      map: sfLineTex,
      roughness: 0.65,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }),
  );
  const sfLine = new THREE.Mesh(sfLineGeo, sfLineMat);
  sfLine.position.y = 0.03;
  sfGroup.add(sfLine);

  const gantryMat = track(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.6 }));
  const pillarGeo = track(new THREE.BoxGeometry(0.9, 6.2, 0.9));
  for (const sx of [-halfW - 1.2, halfW + 1.2]) {
    const p = new THREE.Mesh(pillarGeo, gantryMat);
    p.position.set(sx, 3.1, 0);
    p.castShadow = true;
    sfGroup.add(p);
  }
  const bridgeGeo = track(new THREE.BoxGeometry(compiled.spec.trackWidth + 3.4, 1.35, 1.4));
  const bridgeMat = track(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.45 }));
  const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
  bridge.position.set(0, 6.0, 0);
  bridge.castShadow = true;
  sfGroup.add(bridge);

  // 5 Starting Light Pods on gantry
  const startLightMats: THREE.MeshStandardMaterial[] = [];
  const podGeo = track(new THREE.CylinderGeometry(0.32, 0.32, 0.3, 12));
  podGeo.rotateX(Math.PI / 2);
  for (let l = 0; l < 5; l++) {
    const lm = track(
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        emissive: 0xef4444,
        emissiveIntensity: 0,
        roughness: 0.2,
      }),
    );
    startLightMats.push(lm);
    const pod = new THREE.Mesh(podGeo, lm);
    pod.position.set((l - 2) * 1.4, 5.9, -0.78);
    sfGroup.add(pod);
  }
  group.add(sfGroup);

  const isSafe = (px: number, pz: number, r: number) =>
    isPositionSafeFromTrack(px, pz, r, compiled);
  const colorObj = new THREE.Color();

  // 8. Decorative Paddock Garages & Grandstands flanking the Main Straight
  const pitX = sf.x + sf.nx * pitSideSign * (halfW + 13.5);
  const pitZ = sf.z + sf.nz * pitSideSign * (halfW + 13.5);
  if (isSafe(pitX, pitZ, 4.5)) {
    const pitBuildingGroup = new THREE.Group();
    pitBuildingGroup.position.set(pitX, sf.y, pitZ);
    pitBuildingGroup.rotation.y = sfAngle;

    const garageWallGeo = track(new THREE.BoxGeometry(5.5, 4.2, 34));
    const garageWallMat = track(new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65, metalness: 0.25 }));
    const garageMesh = new THREE.Mesh(garageWallGeo, garageWallMat);
    garageMesh.position.y = 2.1;
    garageMesh.castShadow = true;
    pitBuildingGroup.add(garageMesh);

    const garageRoofGeo = track(new THREE.BoxGeometry(8.5, 0.6, 36));
    const garageRoofMat = track(new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.45, metalness: 0.2 }));
    const garageRoof = new THREE.Mesh(garageRoofGeo, garageRoofMat);
    garageRoof.position.set(1.2 * pitSideSign, 4.4, 0);
    garageRoof.castShadow = true;
    pitBuildingGroup.add(garageRoof);
    group.add(pitBuildingGroup);
  }

  // Main Grandstand opposite Pit Lane + animated crowd reference
  let crowdInst: THREE.InstancedMesh | null = null;
  const crowdSpectators: Array<{
    x: number;
    y: number;
    z: number;
    baseScaleY: number;
    phase: number;
    speedMult: number;
  }> = [];

  const standX = sf.x - sf.nx * pitSideSign * (halfW + 13);
  const standZ = sf.z - sf.nz * pitSideSign * (halfW + 13);
  if (isSafe(standX, standZ, 5.2)) {
    const standGroup = new THREE.Group();
    standGroup.position.set(standX, sf.y, standZ);
    standGroup.rotation.y = sfAngle;
    const standBaseGeo = track(new THREE.BoxGeometry(9.5, 5.4, 38));
    const standBaseMat = track(new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.75 }));
    const standMesh = new THREE.Mesh(standBaseGeo, standBaseMat);
    standMesh.position.y = 2.7;
    standMesh.castShadow = true;
    standGroup.add(standMesh);
    group.add(standGroup);

    // Stylized Miniature Spectator Dots (InstancedMesh)
    const specGeo = track(new THREE.BoxGeometry(0.65, 0.7, 0.65));
    const specMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
    const specCount = 96;
    const specInst = new THREE.InstancedMesh(specGeo, specMat, specCount);
    const specColors = [0xef4444, 0xfacc15, 0x38bdf8, 0xf8fafc, 0x22c55e, 0xf97316];
    for (let i = 0; i < specCount; i++) {
      const row = Math.floor(i / 24);
      const col = i % 24;
      const sx = -3.2 + row * 1.4;
      const sy = 5.75;
      const sz = -16 + col * 1.4;
      const baseScaleY = 0.9 + (i % 3) * 0.15;
      crowdSpectators.push({
        x: sx,
        y: sy,
        z: sz,
        baseScaleY,
        phase: (i * 0.61) % (Math.PI * 2),
        speedMult: 6.5 + (i % 5) * 0.75,
      });
      dummy.position.set(sx, sy, sz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, baseScaleY, 1);
      dummy.updateMatrix();
      specInst.setMatrixAt(i, dummy.matrix);
      colorObj.setHex(specColors[(i * 7) % specColors.length]);
      specInst.setColorAt(i, colorObj);
    }
    specInst.instanceMatrix.needsUpdate = true;
    if (specInst.instanceColor) specInst.instanceColor.needsUpdate = true;
    specInst.computeBoundingSphere();
    standGroup.add(specInst);
    crowdInst = specInst;
  }

  // 8b. Instanced Timing Tower near Start/Finish
  {
    const towerCandidates = [
      { longOff: 24, side: pitSideSign, latOff: halfW + 13.5 },
      { longOff: -24, side: pitSideSign, latOff: halfW + 13.5 },
      { longOff: 25, side: -pitSideSign, latOff: halfW + 14.5 },
      { longOff: -25, side: -pitSideSign, latOff: halfW + 14.5 },
    ];
    for (const cand of towerCandidates) {
      const tx = sf.x + sf.tx * cand.longOff + sf.nx * cand.side * cand.latOff;
      const tz = sf.z + sf.tz * cand.longOff + sf.nz * cand.side * cand.latOff;
      if (!isSafe(tx, tz, 3.0)) continue;

      const towerGroup = new THREE.Group();
      towerGroup.position.set(tx, sf.y, tz);
      towerGroup.rotation.y = sfAngle;

      const plinthGeo = track(new THREE.BoxGeometry(3.2, 1.4, 3.2));
      const coreGeo = track(new THREE.BoxGeometry(2.0, 18.0, 2.0));
      const towerMat = track(
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.65 }),
      );
      const plinth = new THREE.Mesh(plinthGeo, towerMat);
      plinth.position.y = 0.7;
      plinth.castShadow = true;
      towerGroup.add(plinth);

      const core = new THREE.Mesh(coreGeo, towerMat);
      core.position.y = 9.0;
      core.castShadow = true;
      towerGroup.add(core);

      // Instanced LED position/timing tiers stacked up the pylon
      const tierCount = 16;
      const tierGeo = track(new THREE.BoxGeometry(2.28, 0.68, 2.28));
      const tierMat = track(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0x1e293b,
          emissiveIntensity: palette.isNight ? 1.15 : 0.45,
          roughness: 0.3,
          metalness: 0.2,
        }),
      );
      const tierInst = new THREE.InstancedMesh(tierGeo, tierMat, tierCount);
      const tierColors = [
        0xa855f7, // fastest purple
        0x22c55e, // green sector
        0xf8fafc,
        0xef4444,
        0x38bdf8,
        0xfacc15,
        0xf8fafc,
        0xf97316,
      ];
      for (let t = 0; t < tierCount; t++) {
        dummy.position.set(0, 2.5 + t * 0.96, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        tierInst.setMatrixAt(t, dummy.matrix);
        colorObj.setHex(tierColors[t % tierColors.length]);
        tierInst.setColorAt(t, colorObj);
      }
      tierInst.instanceMatrix.needsUpdate = true;
      if (tierInst.instanceColor) tierInst.instanceColor.needsUpdate = true;
      tierInst.computeBoundingSphere();
      towerGroup.add(tierInst);

      const crownGeo = track(new THREE.BoxGeometry(2.6, 0.7, 2.6));
      const crownMat = track(
        new THREE.MeshStandardMaterial({
          color: 0xe11d48,
          emissive: 0xe11d48,
          emissiveIntensity: palette.isNight ? 1.5 : 0.45,
          roughness: 0.25,
        }),
      );
      const crown = new THREE.Mesh(crownGeo, crownMat);
      crown.position.y = 18.35;
      towerGroup.add(crown);

      group.add(towerGroup);
      break;
    }
  }

  // 9. Scenery Perimeter Landmarks (Trees / Desert Rocks / Night Towers)
  const propRadius =
    compiled.spec.scenery === 'street-night'
      ? 5.5
      : compiled.spec.scenery === 'desert'
      ? 4.2
      : 3.2;

  const propGeo =
    compiled.spec.scenery === 'street-night'
      ? track(new THREE.BoxGeometry(8, 22, 8))
      : compiled.spec.scenery === 'desert'
      ? track(new THREE.DodecahedronGeometry(4.2, 0))
      : track(new THREE.ConeGeometry(3.2, 9.5, 7));

  const propMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: compiled.spec.scenery === 'street-night' ? 0.35 : 0.85,
      metalness: compiled.spec.scenery === 'street-night' ? 0.45 : 0.05,
    }),
  );

  // Compute track bounding extent for natural distribution
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < compiled.samples.length; i++) {
    const s = compiled.samples[i];
    if (s.x < minX) minX = s.x;
    if (s.x > maxX) maxX = s.x;
    if (s.z < minZ) minZ = s.z;
    if (s.z > maxZ) maxZ = s.z;
  }
  const midX = (minX + maxX) * 0.5;
  const midZ = (minZ + maxZ) * 0.5;
  const spanX = (maxX - minX) * 0.5 + 160;
  const spanZ = (maxZ - minZ) * 0.5 + 160;

  // Strict Exclusion Buffer Filter: discard any object violating clearance threshold
  const validProps: Array<{ matrix: THREE.Matrix4; color: number }> = [];
  const TARGET_PROPS = 120;
  const MAX_ATTEMPTS = 650;

  for (let attempt = 0; attempt < MAX_ATTEMPTS && validProps.length < TARGET_PROPS; attempt++) {
    let px = 0;
    let pz = 0;
    if (attempt % 2 === 0) {
      // Offset perpendicular to spline samples
      const sampleIdx = (attempt * 19) % compiled.samples.length;
      const s = compiled.samples[sampleIdx];
      const side = attempt % 4 === 0 ? -1 : 1;
      const distOffset = (halfW + 1.8 + 4.2 + propRadius + 5.0) + 14 + ((attempt * 31) % 65);
      px = s.x + s.nx * side * distOffset;
      pz = s.z + s.nz * side * distOffset;
    } else {
      // Polar scatter around circuit perimeter
      const angle = (attempt / 180) * Math.PI * 2;
      const rx = Math.cos(angle) * (spanX * (0.60 + ((attempt * 13) % 35) * 0.015));
      const rz = Math.sin(angle) * (spanZ * (0.60 + ((attempt * 19) % 35) * 0.015));
      px = midX + rx;
      pz = midZ + rz;
    }

    // Strict Clearance Check: ZERO props ever sit on asphalt, kerbs, runoff, or pit lane
    if (!isSafe(px, pz, propRadius)) {
      continue;
    }

    const s = 0.8 + ((attempt * 19) % 10) * 0.09;
    const hScale = compiled.spec.scenery === 'street-night' ? 0.6 + ((attempt * 23) % 10) * 0.16 : s;
    const groundY = sampleBaseGroundY(px, pz);
    dummy.position.set(px, groundY + (compiled.spec.scenery === 'street-night' ? 11 * hScale : 4.2 * s), pz);
    dummy.rotation.set(0, (attempt * 0.7) % Math.PI, 0);
    dummy.scale.set(s, hScale, s);
    dummy.updateMatrix();

    validProps.push({
      matrix: dummy.matrix.clone(),
      color: attempt % 2 === 0 ? palette.propColor1 : palette.propColor2,
    });
  }

  if (validProps.length > 0) {
    const propInst = new THREE.InstancedMesh(propGeo, propMat, validProps.length);
    for (let i = 0; i < validProps.length; i++) {
      propInst.setMatrixAt(i, validProps[i].matrix);
      colorObj.setHex(validProps[i].color);
      propInst.setColorAt(i, colorObj);
    }
    propInst.instanceMatrix.needsUpdate = true;
    if (propInst.instanceColor) propInst.instanceColor.needsUpdate = true;
    propInst.computeBoundingSphere();
    group.add(propInst);
  }

  // 10. Universal Circuit Floodlight Towers (dynamically lit during Dusk/Night or street-night)
  const floodlightLampMats: THREE.MeshStandardMaterial[] = [];
  {
    const floodlightGeo = track(new THREE.CylinderGeometry(0.25, 0.35, 11, 8));
    const floodlightHeadGeo = track(new THREE.BoxGeometry(2.0, 0.8, 1.4));
    const floodMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.8,
        roughness: 0.3,
      }),
    );
    const lampMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        emissive: 0xffedd5,
        emissiveIntensity: compiled.spec.scenery === 'street-night' ? 2.5 : 0.0,
        roughness: 0.2,
      }),
    );
    floodlightLampMats.push(lampMat);

    const towerCount = compiled.spec.scenery === 'street-night' ? 20 : 12;
    const floodStep = Math.max(12, Math.floor(compiled.samples.length / towerCount));
    for (let i = 0; i < compiled.samples.length; i += floodStep) {
      const s = compiled.samples[i];
      const curHalfW = s.width ? s.width * 0.5 : halfW;
      const postOffset = curHalfW + 1.8 + 4.2 + 0.4 + 5.0 + 1.5;
      const postX = s.x - s.nx * postOffset;
      const postZ = s.z - s.nz * postOffset;

      if (!isSafe(postX, postZ, 0.5)) continue;

      const flGroup = new THREE.Group();
      flGroup.position.set(postX, s.y, postZ);
      flGroup.rotation.y = Math.atan2(s.nx, s.nz);

      const mast = new THREE.Mesh(floodlightGeo, floodMat);
      mast.position.y = 5.5;
      mast.castShadow = true;
      flGroup.add(mast);

      const head = new THREE.Mesh(floodlightHeadGeo, lampMat);
      head.position.set(0, 10.8, 1.0);
      head.rotation.x = 0.45;
      flGroup.add(head);

      group.add(flGroup);
    }
  }

  // 11. Trackside Marshal Posts with Animated Flag Meshes (12 posts distributed across 3 sectors)
  const marshalFlags: Array<{ mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; sector: number; baseRotY: number }> = [];
  {
    const boothGeo = track(new THREE.BoxGeometry(1.7, 2.2, 1.5));
    const boothMat = track(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.55, metalness: 0.1 }));
    const poleGeo = track(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6));
    const poleMat = track(new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.7, roughness: 0.3 }));
    const flagGeo = track(new THREE.PlaneGeometry(1.15, 0.72));
    flagGeo.translate(0.58, 0, 0);

    const marshalCount = 12;
    const step = Math.max(8, Math.floor(compiled.samples.length / marshalCount));
    for (let m = 0; m < marshalCount; m++) {
      const idx = (m * step + Math.floor(step * 0.5)) % compiled.samples.length;
      const s = compiled.samples[idx];
      const curHalfW = s.width ? s.width * 0.5 : halfW;
      const side = m % 2 === 0 ? 1 : -1;
      const offset = curHalfW + 1.8 + 4.8;
      const mx = s.x + s.nx * side * offset;
      const mz = s.z + s.nz * side * offset;
      if (!isSafe(mx, mz, 0.6)) continue;

      const mGroup = new THREE.Group();
      mGroup.position.set(mx, s.y, mz);
      const faceY = Math.atan2(-s.nx * side, -s.nz * side);
      mGroup.rotation.y = faceY;

      const booth = new THREE.Mesh(boothGeo, boothMat);
      booth.position.y = 1.1;
      mGroup.add(booth);

      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(0.75, 2.1, 0.65);
      mGroup.add(pole);

      const fMat = track(
        new THREE.MeshStandardMaterial({
          color: 0x22c55e,
          emissive: 0x16a34a,
          emissiveIntensity: 0.35,
          side: THREE.DoubleSide,
          roughness: 0.5,
        }),
      );
      const fMesh = new THREE.Mesh(flagGeo, fMat);
      fMesh.position.set(0.75, 3.05, 0.65);
      mGroup.add(fMesh);
      group.add(mGroup);

      const sector = Math.min(3, Math.floor((idx / compiled.samples.length) * 3) + 1);
      marshalFlags.push({ mesh: fMesh, mat: fMat, sector, baseRotY: 0 });
    }
  }

  // 12. Distant Biome Horizon Silhouette Ring
  {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of compiled.samples) {
      if (s.x < minX) minX = s.x;
      if (s.x > maxX) maxX = s.x;
      if (s.z < minZ) minZ = s.z;
      if (s.z > maxZ) maxZ = s.z;
    }
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const span = Math.max(maxX - minX, maxZ - minZ);
    const ringRadius = Math.max(360, span * 0.82);

    const skylineColor =
      compiled.spec.scenery === 'street-night'
        ? 0x0f172a
        : compiled.spec.scenery === 'desert'
        ? 0xa16236
        : compiled.spec.scenery === 'coastal'
        ? 0x3b6c8c
        : 0x254534;
    const skylineMat = track(
      new THREE.MeshStandardMaterial({
        color: skylineColor,
        roughness: 0.95,
        metalness: 0.05,
        fog: true,
      }),
    );

    const segments = 28;
    for (let i = 0; i < segments; i++) {
      const ang = (i / segments) * Math.PI * 2;
      const sx = cx + Math.cos(ang) * ringRadius;
      const sz = cz + Math.sin(ang) * ringRadius;
      const h =
        compiled.spec.scenery === 'street-night'
          ? 28 + ((i * 37) % 52)
          : 22 + ((i * 29) % 44);
      const w = (2 * Math.PI * ringRadius) / segments * 1.12;
      const silGeo =
        compiled.spec.scenery === 'street-night'
          ? track(new THREE.BoxGeometry(w * 0.72, h, 24))
          : track(new THREE.ConeGeometry(w * 0.78, h, 5));
      const sil = new THREE.Mesh(silGeo, skylineMat);
      sil.position.set(sx, h * 0.42 - 6, sz);
      sil.rotation.y = -ang + Math.PI * 0.5;
      group.add(sil);
    }
  }

  // 13. Knockable Chicane Apex Bollards (Pooled rigid impulse + reset per lap)
  interface BollardState {
    baseX: number;
    baseY: number;
    baseZ: number;
    baseQuat: THREE.Quaternion;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    rotX: number;
    rotZ: number;
    angVx: number;
    angVz: number;
    knocked: boolean;
    active: boolean;
  }

  const bollards: BollardState[] = [];
  let bollardPostInst: THREE.InstancedMesh | null = null;
  {
    const MAX_BOLLARDS = 18;
    const minSpacing = 18;
    const minReverseSamples = Math.max(3, Math.round(16 / distScale));
    const maxReverseSamples = Math.max(6, Math.round(82 / distScale));
    const placed: Array<{ x: number; z: number }> = [];

    const tryAddBollard = (idx: number) => {
      if (bollards.length >= MAX_BOLLARDS) return;
      const s = compiled.samples[idx];
      if (s.y > 4.2 || s.t < 0.03 || s.t > 0.97) return;
      const side = s.curvature > 0 ? 1 : -1;
      const bank = s.banking || 0;
      const cosB = Math.cos(bank);
      const sinB = Math.sin(bank);
      const curHalfW = s.width ? s.width * 0.5 : halfW;
      const apexOffset = curHalfW + 0.35;
      const bx = s.x + s.nx * side * apexOffset * cosB;
      const by = s.y + 0.04 + side * apexOffset * sinB;
      const bz = s.z + s.nz * side * apexOffset * cosB;

      for (const p of placed) {
        if ((p.x - bx) * (p.x - bx) + (p.z - bz) * (p.z - bz) < minSpacing * minSpacing) {
          return;
        }
      }

      setBankedTrackTransform(bx, by + 0.44, bz, s, bank);
      placed.push({ x: bx, z: bz });
      bollards.push({
        baseX: bx,
        baseY: by,
        baseZ: bz,
        baseQuat: dummy.quaternion.clone(),
        x: bx,
        y: by + 0.44,
        z: bz,
        vx: 0,
        vy: 0,
        vz: 0,
        rotX: 0,
        rotZ: 0,
        angVx: 0,
        angVz: 0,
        knocked: false,
        active: false,
      });
    };

    // Pass 1: Detect S-bend chicane curvature reversals
    for (let i = 1; i < totalSamples - 1; i++) {
      const prevC = compiled.samples[i - 1].curvature;
      const curC = compiled.samples[i].curvature;
      const nextC = compiled.samples[i + 1].curvature;
      const isPeak =
        Math.abs(curC) >= Math.abs(prevC) &&
        Math.abs(curC) >= Math.abs(nextC) &&
        Math.abs(curC) > 0.02;
      if (!isPeak) continue;

      let hasOppositeSign = false;
      for (let off = minReverseSamples; off <= maxReverseSamples; off++) {
        const fwd = compiled.samples[(i + off) % totalSamples].curvature;
        const bwd = compiled.samples[(i - off + totalSamples) % totalSamples].curvature;
        if ((curC * fwd < 0 && Math.abs(fwd) > 0.018) || (curC * bwd < 0 && Math.abs(bwd) > 0.018)) {
          hasOppositeSign = true;
          break;
        }
      }
      if (hasOppositeSign) {
        tryAddBollard(i);
      }
    }

    // Pass 2: If fewer than 2 S-bend bollards found, include very tight hairpin apexes
    if (bollards.length < 2) {
      for (let i = 1; i < totalSamples - 1; i++) {
        const prevC = compiled.samples[i - 1].curvature;
        const curC = compiled.samples[i].curvature;
        const nextC = compiled.samples[i + 1].curvature;
        if (Math.abs(curC) > 0.032 && Math.abs(curC) >= Math.abs(prevC) && Math.abs(curC) >= Math.abs(nextC)) {
          tryAddBollard(i);
        }
      }
    }

    if (bollards.length > 0) {
      const baseGeo = track(new THREE.CylinderGeometry(0.24, 0.28, 0.08, 10));
      const baseMat = track(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 }));
      const baseInst = new THREE.InstancedMesh(baseGeo, baseMat, bollards.length);

      const postGeo = track(new THREE.CylinderGeometry(0.1, 0.13, 0.88, 10));
      const postBollardMat = track(
        new THREE.MeshStandardMaterial({
          color: 0xf97316,
          emissive: 0x7c2d12,
          emissiveIntensity: palette.isNight ? 0.65 : 0.2,
          roughness: 0.4,
        }),
      );
      bollardPostInst = new THREE.InstancedMesh(postGeo, postBollardMat, bollards.length);

      for (let i = 0; i < bollards.length; i++) {
        const b = bollards[i];
        dummy.position.set(b.baseX, b.baseY + 0.04, b.baseZ);
        dummy.quaternion.copy(b.baseQuat);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        baseInst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(b.x, b.y, b.z);
        dummy.updateMatrix();
        bollardPostInst.setMatrixAt(i, dummy.matrix);
      }
      baseInst.instanceMatrix.needsUpdate = true;
      baseInst.computeBoundingSphere();
      bollardPostInst.instanceMatrix.needsUpdate = true;
      bollardPostInst.computeBoundingSphere();
      bollardPostInst.frustumCulled = false;
      bollardPostInst.castShadow = true;
      group.add(baseInst, bollardPostInst);
    }
  }

  // 14. Rotating / Moving Distant Landmarks per SceneryTheme (Ferris Wheel, Helicopter, Blimp)
  const landmarks: AnimatedLandmarkHandles = {};
  {
    const span = Math.max(maxTrackX - minTrackX, maxTrackZ - minTrackZ);
    const scenery = compiled.spec.scenery;
    const isNightTheme = palette.isNight;

    // Ferris Wheel on Stadium, Street-Night & Coastal circuits
    if (scenery === 'stadium' || scenery === 'street-night' || scenery === 'coastal') {
      const wheelDist = Math.max(150, span * 0.54 + 34);
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2 + 0.4;
        const fx = centerTrackX + Math.cos(ang) * wheelDist;
        const fz = centerTrackZ + Math.sin(ang) * wheelDist;
        if (!isSafe(fx, fz, 12)) continue;
        const fw = buildFerrisWheelLandmark(track, isNightTheme);
        fw.root.position.set(fx, sampleBaseGroundY(fx, fz), fz);
        fw.root.rotation.y = Math.atan2(centerTrackX - fx, centerTrackZ - fz);
        group.add(fw.root);
        landmarks.ferrisWheel = { wheel: fw.wheel, gondolas: fw.gondolas };
        break;
      }
    }

    // Blimp over Stadium, Forest, Desert & Parkland circuits
    if (scenery === 'stadium' || scenery === 'forest' || scenery === 'desert' || scenery === 'parkland') {
      const blimpGroup = buildBlimpLandmark(track, isNightTheme);
      const rx = Math.max(175, span * 0.46);
      const rz = Math.max(155, span * 0.41);
      const baseY = maxTrackY + 66;
      blimpGroup.position.set(centerTrackX + rx, baseY, centerTrackZ);
      group.add(blimpGroup);
      landmarks.blimp = {
        group: blimpGroup,
        centerX: centerTrackX,
        centerZ: centerTrackZ,
        baseY,
        rx,
        rz,
        angle: 0,
      };
    }

    // Broadcast Helicopter over Street-Night, Coastal, Forest, Desert & Parkland circuits
    if (
      scenery === 'street-night' ||
      scenery === 'coastal' ||
      scenery === 'forest' ||
      scenery === 'desert' ||
      scenery === 'parkland'
    ) {
      const heli = buildHelicopterLandmark(track, isNightTheme);
      const rx = Math.max(135, span * 0.37);
      const rz = Math.max(120, span * 0.33);
      const baseY = maxTrackY + 42;
      heli.group.position.set(centerTrackX - rx, baseY, centerTrackZ);
      group.add(heli.group);
      landmarks.helicopter = {
        group: heli.group,
        mainRotor: heli.mainRotor,
        tailRotor: heli.tailRotor,
        centerX: centerTrackX,
        centerZ: centerTrackZ,
        baseY,
        rx,
        rz,
        angle: Math.PI,
      };
    }
  }

  let propAnimTime = 0;
  let wasFinalLap = false;
  let lastObservedLap: number | null = null;
  const tumbleEuler = new THREE.Euler();
  const tumbleQuat = new THREE.Quaternion();

  const updateTrackProps = (
    dt: number,
    carStates: TrackPropCarState[] = [],
    isFinalLap = false,
  ) => {
    const safeDt = Math.min(0.05, Math.max(0, dt));
    propAnimTime += safeDt;

    // 1. Final-lap animated grandstand crowd bobbing
    if (crowdInst && crowdSpectators.length > 0) {
      if (isFinalLap) {
        for (let i = 0; i < crowdSpectators.length; i++) {
          const sp = crowdSpectators[i];
          const bob = Math.abs(Math.sin(propAnimTime * sp.speedMult + sp.phase)) * 0.42;
          dummy.position.set(sp.x, sp.y + bob, sp.z);
          dummy.rotation.set(0, 0, Math.sin(propAnimTime * sp.speedMult * 0.5 + sp.phase) * 0.08);
          dummy.scale.set(1, sp.baseScaleY + bob * 0.25, 1);
          dummy.updateMatrix();
          crowdInst.setMatrixAt(i, dummy.matrix);
        }
        crowdInst.instanceMatrix.needsUpdate = true;
        wasFinalLap = true;
      } else if (wasFinalLap) {
        for (let i = 0; i < crowdSpectators.length; i++) {
          const sp = crowdSpectators[i];
          dummy.position.set(sp.x, sp.y, sp.z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, sp.baseScaleY, 1);
          dummy.updateMatrix();
          crowdInst.setMatrixAt(i, dummy.matrix);
        }
        crowdInst.instanceMatrix.needsUpdate = true;
        wasFinalLap = false;
      }
    }

    // 2. Rotating / Moving Distant Landmarks
    if (landmarks.ferrisWheel) {
      const fw = landmarks.ferrisWheel;
      fw.wheel.rotation.z += safeDt * 0.24;
      for (let i = 0; i < fw.gondolas.length; i++) {
        fw.gondolas[i].rotation.z = -fw.wheel.rotation.z;
      }
    }
    if (landmarks.blimp) {
      const bl = landmarks.blimp;
      bl.angle += safeDt * 0.045;
      const cosA = Math.cos(bl.angle);
      const sinA = Math.sin(bl.angle);
      const vx = -bl.rx * sinA;
      const vz = bl.rz * cosA;
      bl.group.position.set(
        bl.centerX + cosA * bl.rx,
        bl.baseY + Math.sin(propAnimTime * 0.55) * 2.2,
        bl.centerZ + sinA * bl.rz,
      );
      bl.group.rotation.y = Math.atan2(vx, vz);
    }
    if (landmarks.helicopter) {
      const hl = landmarks.helicopter;
      hl.angle -= safeDt * 0.14;
      const cosA = Math.cos(hl.angle);
      const sinA = Math.sin(hl.angle);
      const vx = hl.rx * sinA;
      const vz = -hl.rz * cosA;
      hl.group.position.set(
        hl.centerX + cosA * hl.rx,
        hl.baseY + Math.sin(propAnimTime * 1.1) * 1.4,
        hl.centerZ + sinA * hl.rz,
      );
      hl.group.rotation.set(0.11, Math.atan2(vx, vz), 0);
      hl.mainRotor.rotation.y += safeDt * 26;
      hl.tailRotor.rotation.x += safeDt * 34;
    }

    // 3. Knockable Chicane Apex Bollards (pooled rigid impulse + reset per lap)
    if (bollardPostInst && bollards.length > 0) {
      let bollardDirty = false;

      // Detect lap transition across cars to reset knocked bollards cleanly
      let maxLap = -1;
      for (let c = 0; c < carStates.length; c++) {
        const carLap = carStates[c].lap;
        if (typeof carLap === 'number' && carLap > maxLap) {
          maxLap = carLap;
        }
      }
      if (maxLap >= 0) {
        if (lastObservedLap === null) {
          lastObservedLap = maxLap;
        } else if (maxLap !== lastObservedLap) {
          lastObservedLap = maxLap;
          for (let i = 0; i < bollards.length; i++) {
            const b = bollards[i];
            if (b.knocked || b.active) {
              b.x = b.baseX;
              b.y = b.baseY + 0.44;
              b.z = b.baseZ;
              b.vx = 0;
              b.vy = 0;
              b.vz = 0;
              b.rotX = 0;
              b.rotZ = 0;
              b.angVx = 0;
              b.angVz = 0;
              b.knocked = false;
              b.active = false;
              dummy.position.set(b.x, b.y, b.z);
              dummy.quaternion.copy(b.baseQuat);
              dummy.scale.set(1, 1, 1);
              dummy.updateMatrix();
              bollardPostInst.setMatrixAt(i, dummy.matrix);
              bollardDirty = true;
            }
          }
        }
      }

      // Trigger rigid impulse on car contact
      const hitRadiusSq = 1.35 * 1.35;
      for (let i = 0; i < bollards.length; i++) {
        const b = bollards[i];
        if (!b.knocked) {
          for (let c = 0; c < carStates.length; c++) {
            const car = carStates[c];
            const dx = b.baseX - car.x;
            const dz = b.baseZ - car.z;
            if (dx * dx + dz * dz < hitRadiusSq && Math.abs((car.y ?? b.baseY) - b.baseY) < 2.2) {
              const cvx = car.vx ?? 0;
              const cvz = car.vz ?? 0;
              const vLen = Math.hypot(cvx, cvz);
              const dirX = vLen > 0.5 ? cvx / vLen : dx / Math.max(0.05, Math.hypot(dx, dz));
              const dirZ = vLen > 0.5 ? cvz / vLen : dz / Math.max(0.05, Math.hypot(dx, dz));
              const carSpd = car.speed ?? vLen;
              const impulse = Math.max(10, Math.min(36, carSpd * 0.45 + 6));
              b.vx = dirX * impulse;
              b.vz = dirZ * impulse;
              b.vy = 4.0 + Math.min(8.5, carSpd * 0.18);
              b.angVx = (dirZ >= 0 ? 1 : -1) * (8.5 + (i % 3) * 2.5);
              b.angVz = (dirX >= 0 ? -1 : 1) * (8.5 + (i % 4) * 2.0);
              b.knocked = true;
              b.active = true;
              break;
            }
          }
        }

        if (b.active && safeDt > 0) {
          b.vy -= 18.0 * safeDt;
          b.x += b.vx * safeDt;
          b.y += b.vy * safeDt;
          b.z += b.vz * safeDt;
          b.rotX += b.angVx * safeDt;
          b.rotZ += b.angVz * safeDt;
          const airDrag = Math.exp(-1.8 * safeDt);
          b.vx *= airDrag;
          b.vz *= airDrag;

          const floorY = b.baseY + 0.15;
          if (b.y < floorY) {
            b.y = floorY;
            b.vy = Math.abs(b.vy) * 0.35;
            b.vx *= 0.65;
            b.vz *= 0.65;
            b.angVx *= 0.6;
            b.angVz *= 0.6;
            if (Math.hypot(b.vx, b.vz) < 0.25 && Math.abs(b.vy) < 0.3) {
              b.vx = 0;
              b.vy = 0;
              b.vz = 0;
              b.angVx = 0;
              b.angVz = 0;
              b.active = false;
            }
          }

          tumbleEuler.set(b.rotX, 0, b.rotZ);
          tumbleQuat.setFromEuler(tumbleEuler);
          dummy.position.set(b.x, b.y, b.z);
          dummy.quaternion.copy(b.baseQuat).multiply(tumbleQuat);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          bollardPostInst.setMatrixAt(i, dummy.matrix);
          bollardDirty = true;
        }
      }

      if (bollardDirty) {
        bollardPostInst.instanceMatrix.needsUpdate = true;
      }
    }
  };

  const updateMarshalFlags = (flagState: string, timeSec: number, yellowSectors?: number[]) => {
    for (let i = 0; i < marshalFlags.length; i++) {
      const f = marshalFlags[i];
      const sectorYellow = yellowSectors?.includes(f.sector) ?? false;
      const isYellow = flagState === 'yellow' || sectorYellow;
      const isRed = flagState === 'red';
      const isCheckered = flagState === 'checkered';
      const colorHex = isRed ? 0xef4444 : isYellow ? 0xfacc15 : isCheckered ? 0xf8fafc : 0x22c55e;
      f.mat.color.setHex(colorHex);
      f.mat.emissive.setHex(colorHex);
      f.mat.emissiveIntensity = isYellow || isRed ? 0.95 : 0.3;
      const waveSpeed = isYellow || isRed ? 11.0 : 4.2;
      const waveAmp = isYellow || isRed ? 0.52 : 0.18;
      f.mesh.rotation.y = f.baseRotY + Math.sin(timeSec * waveSpeed + i * 0.7) * waveAmp;
    }
  };

  const setNightLights = (nightIntensity: number) => {
    const clamped = Math.max(0, Math.min(1, nightIntensity));
    for (const m of floodlightLampMats) {
      m.emissiveIntensity = clamped * 2.8;
    }
  };

  return {
    group,
    skyColor: palette.sky,
    fogColor: palette.sky,
    startLightMats,
    roadMat,
    updateMarshalFlags,
    setNightLights,
    updateTrackProps,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}

// Helper function to enforce strict track surface clearance:
// distToCenterline >= (trackWidth / 2) + kerbWidth + runoffMargin + propRadius + 5.0m
// tested against EVERY point on main track spline AND pit-lane spline
export function isPositionSafeFromTrack(
  px: number,
  pz: number,
  radius: number,
  compiled: CompiledTrack,
  pitSamples?: Array<{ x: number; z: number; width?: number }>,
): boolean {
  const KERB_WIDTH = 1.8;
  const RUNOFF_MARGIN = 4.2;
  const EXTRA_BUFFER = 5.0;
  const halfW = compiled.spec.trackWidth * 0.5;

  for (let i = 0; i < compiled.samples.length; i++) {
    const s = compiled.samples[i];
    const hw = s.width ? s.width * 0.5 : halfW;
    const reqBuffer = hw + KERB_WIDTH + RUNOFF_MARGIN + radius + EXTRA_BUFFER;
    const dx = px - s.x;
    const dz = pz - s.z;
    if (dx * dx + dz * dz < reqBuffer * reqBuffer) {
      return false;
    }
  }

  if (pitSamples) {
    for (let i = 0; i < pitSamples.length; i++) {
      const ps = pitSamples[i];
      const hw = ps.width ? ps.width * 0.5 : 3.8;
      const reqBuffer = hw + KERB_WIDTH + RUNOFF_MARGIN + radius + EXTRA_BUFFER;
      const dx = px - ps.x;
      const dz = pz - ps.z;
      if (dx * dx + dz * dz < reqBuffer * reqBuffer) {
        return false;
      }
    }
  }

  return true;
}
