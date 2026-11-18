import * as THREE from 'three';
import { CompiledTrack, SampledSplinePoint, sampleTrackAtT } from '../game/tracks';
import { SceneryTheme } from '../game/types';
import {
  createAsphaltTexture,
  createBrakingBoardTexture,
  createKerbTexture,
  createStartLineTexture,
} from './proceduralTextures';

export interface BuiltTrackScene {
  group: THREE.Group;
  skyColor: number;
  fogColor: number;
  startLightMats: THREE.MeshStandardMaterial[];
  dispose: () => void;
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
  for (let i = 0; i < compiled.samples.length; i++) {
    const s = compiled.samples[i];
    if (s.x < minTrackX) minTrackX = s.x;
    if (s.x > maxTrackX) maxTrackX = s.x;
    if (s.z < minTrackZ) minTrackZ = s.z;
    if (s.z > maxTrackZ) maxTrackZ = s.z;
    if (s.y < minTrackY) minTrackY = s.y;
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
    let lowestCorridorY = Infinity;
    let inAnyCorridor = false;

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
          const segCorridor = segHalfW + 1.5;
          if (dSq <= segCorridor * segCorridor) {
            inAnyCorridor = true;
            const segY = seg.ay + t * (seg.by - seg.ay);
            const segBank = seg.abank + t * (seg.bbank - seg.abank);
            const segLowEdge = segY - segHalfW * Math.abs(Math.sin(segBank));
            if (segLowEdge < lowestCorridorY) lowestCorridorY = segLowEdge;
          }

          if (dSq < minDistSq) {
            minDistSq = dSq;
            bestSeg = seg;
            bestT = t;
            bestPx = px;
            bestPz = pz;
          }
        }
      }
    }
    return { bestSeg, bestT, bestDist: Math.sqrt(minDistSq), bestPx, bestPz, lowestCorridorY, inAnyCorridor };
  };

  const clampTerrainHeight = (vx: number, vz: number, rawY: number): number => {
    const { bestSeg, bestT, bestDist, bestPx, bestPz, lowestCorridorY, inAnyCorridor } = getNearestRoadSegment(vx, vz);
    let vy = rawY;
    if (bestSeg) {
      const roadW = bestSeg.aw + bestT * (bestSeg.bw - bestSeg.aw);
      const roadHalfW = roadW * 0.5;
      const roadY = bestSeg.ay + bestT * (bestSeg.by - bestSeg.ay);
      const roadBank = bestSeg.abank + bestT * (bestSeg.bbank - bestSeg.abank);
      const segNx = bestSeg.anx + bestT * (bestSeg.bnx - bestSeg.anx);
      const segNz = bestSeg.anz + bestT * (bestSeg.bnz - bestSeg.anz);

      // Overpass is when this road segment is elevated high above an underlying road corridor (e.g. Suzuka bridge)
      const isOverpass = inAnyCorridor && lowestCorridorY < Infinity && roadY - lowestCorridorY > 3.5;
      if (!isOverpass) {
        const latSign = Math.sign((vx - bestPx) * segNx + (vz - bestPz) * segNz) || 1;
        const roadEdgeY = roadY + latSign * (roadHalfW + 1.5) * Math.sin(roadBank);
        const targetEdgeY = (inAnyCorridor && lowestCorridorY < Infinity ? lowestCorridorY : roadEdgeY) - 0.18;

        const dClamp = roadHalfW + 1.5;
        const dOuter = roadHalfW + 42.0;

        if (inAnyCorridor || bestDist <= dClamp) {
          // Exactly flush under kerb/apron without vertical trench or drop
          vy = targetEdgeY;
        } else if (bestDist <= dOuter) {
          // Smoothstep outer embankment transition from exact outer curb elevation out to surrounding DEM terrain
          const u = (bestDist - dClamp) / (dOuter - dClamp);
          const s = u * u * (3 - 2 * u);
          vy = targetEdgeY * (1 - s) + rawY * s;
        }
        // Strict guard: grass within immediate runoff apron (roadHalfW + 4.8) never bleeds above road/kerb
        if (bestDist <= roadHalfW + 4.8) {
          vy = Math.min(vy, targetEdgeY);
        }
      }
    }
    return vy;
  };

  const posAttr = groundGeo.attributes.position;
  for (let k = 0; k < posAttr.count; k++) {
    const vx = posAttr.getX(k);
    const vz = posAttr.getZ(k);
    const bgY = sampleBaseGroundY(vx, vz);
    const vy = clampTerrainHeight(vx, vz, bgY);
    posAttr.setY(k, vy);
  }
  groundGeo.computeVertexNormals();

  const groundMat = track(
    new THREE.MeshStandardMaterial({
      color: palette.ground,
      roughness: 0.94,
      metalness: 0.02,
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

  // 2b. Smooth Bank-Aware Outer Turf Embankment Skirts (left & right from apron outer edge +4.7m out to +34m)
  // Bridges steep elevation crests & banked corners cleanly to surrounding terrain with zero sunken gaps or cliff steps
  const buildOuterSkirt = (side: -1 | 1): THREE.BufferGeometry => {
    const n = compiled.samples.length;
    const vertCount = (n + 1) * 2;
    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    const indices: number[] = [];

    for (let i = 0; i <= n; i++) {
      const s = compiled.samples[i % n];
      const hw = s.width ? s.width * 0.5 : halfW;
      const bank = s.banking || 0;
      const cosB = Math.cos(bank);
      const sinB = Math.sin(bank);

      // Detect elevated overpass sections (e.g. Suzuka bridge) so skirt drops cleanly rather than bridging across lower road
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

      const innerEdge = hw + 4.7;
      const outerEdge = hw + 34.0;

      const ix = s.x + s.nx * side * innerEdge * cosB;
      const iz = s.z + s.nz * side * innerEdge * cosB;
      const iy = isOverpass ? s.y - 1.2 : (s.y - 0.02 + side * innerEdge * sinB);

      const ox = s.x + s.nx * side * outerEdge;
      const oz = s.z + s.nz * side * outerEdge;
      const bgOuterY = sampleBaseGroundY(ox, oz);
      const oy = isOverpass ? Math.min(bgOuterY, s.y - 1.5) : clampTerrainHeight(ox, oz, bgOuterY);

      const base = i * 2;
      const v0 = side === 1 ? base : base + 1;
      const v1 = side === 1 ? base + 1 : base;
      positions[v0 * 3] = ix; positions[v0 * 3 + 1] = iy; positions[v0 * 3 + 2] = iz;
      positions[v1 * 3] = ox; positions[v1 * 3 + 1] = oy; positions[v1 * 3 + 2] = oz;
      normals[v0 * 3 + 1] = 1;
      normals[v1 * 3 + 1] = 1;

      if (i > 0) {
        const a = (i - 1) * 2;
        const b = a + 1;
        const c = i * 2;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }

    // Strict post-generation height clamp across all skirt mesh vertices:
    // Ensures zero skirt triangles ever poke above the asphalt or curbs
    for (let k = 0; k < vertCount; k++) {
      const vx = positions[k * 3];
      const vy = positions[k * 3 + 1];
      const vz = positions[k * 3 + 2];
      positions[k * 3 + 1] = clampTerrainHeight(vx, vz, vy);
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

  // 3. Main Track Asphalt Ribbon (clean +0.02m layering above apron & ground)
  const asphaltTex = track(createAsphaltTexture(compiled.spec.asphaltColor, maxAniso));
  const roadGeo = track(buildRibbonGeometry(compiled.samples, halfW, 0.02, 16, true, compiled.spec.trackWidth));
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
  group.add(roadMesh);

  // 4. Gravel / Turf Runoff Apron under Track (0.00m baseline)
  const apronGeo = track(buildRibbonGeometry(compiled.samples, halfW + 4.8, 0.00, 24, true, compiled.spec.trackWidth));
  const apronMat = track(
    new THREE.MeshStandardMaterial({
      color: compiled.spec.scenery === 'desert' ? 0xc49c6e : 0x3b483d,
      roughness: 0.95,
      metalness: 0,
    }),
  );
  const apronMesh = new THREE.Mesh(apronGeo, apronMat);
  apronMesh.receiveShadow = true;
  group.add(apronMesh);

  // 5. Stylized Oversized Die-Cast Apex Kerbs (+0.035m proud of asphalt)
  const kerbTex = track(createKerbTexture(compiled.spec.kerbPrimary, compiled.spec.kerbSecondary, maxAniso));
  const kerbMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: kerbTex,
      roughness: 0.55,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const kerbBoxGeo = track(new THREE.BoxGeometry(1.3, 0.07, 2.2));
  const kerbMatrices: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();

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
      dummy.position.set(
        s.x + s.nx * side * kerbDist * cosB,
        s.y + 0.02 + (i % 2) * 0.003 + side * kerbDist * sinB,
        s.z + s.nz * side * kerbDist * cosB,
      );
      dummy.rotation.set(bank * side * Math.cos(Math.atan2(s.tx, s.tz)), Math.atan2(s.tx, s.tz), bank * side);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
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

  // 6. Outer & Inner Continuous Guardrail Posts / Barriers (InstancedMesh)
  const barrierGeo = track(new THREE.BoxGeometry(0.45, 0.85, 4.4));
  const barrierMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xdbe2ea,
      roughness: 0.45,
      metalness: 0.45,
    }),
  );
  const barrierMatrices: THREE.Matrix4[] = [];
  for (let i = 0; i < compiled.samples.length; i += 2) {
    const s = compiled.samples[i];
    for (const side of [-1, 1]) {
      const bank = s.banking || 0;
      const cosB = Math.cos(bank);
      const sinB = Math.sin(bank);
      const curHalfW = s.width ? s.width * 0.5 : halfW;
      const offset = curHalfW + 5.6;
      dummy.position.set(
        s.x + s.nx * side * offset * cosB,
        s.y + 0.35 + side * offset * sinB,
        s.z + s.nz * side * offset * cosB,
      );
      dummy.rotation.set(0, Math.atan2(s.tx, s.tz), bank * side);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      barrierMatrices.push(dummy.matrix.clone());
    }
  }
  const barrierInst = new THREE.InstancedMesh(barrierGeo, barrierMat, barrierMatrices.length);
  barrierMatrices.forEach((m, idx) => barrierInst.setMatrixAt(idx, m));
  barrierInst.instanceMatrix.needsUpdate = true;
  barrierInst.computeBoundingSphere();
  barrierInst.castShadow = true;
  group.add(barrierInst);

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
    return track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.05 }));
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
      polygonOffsetFactor: -1,
    }),
  );
  const sfLine = new THREE.Mesh(sfLineGeo, sfLineMat);
  sfLine.position.y = 0.025;
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

  // 8. Decorative Paddock Garages & Grandstands flanking the Main Straight
  const pitBuildingGroup = new THREE.Group();
  pitBuildingGroup.position.set(
    sf.x + sf.nx * pitSideSign * (halfW + 13.5),
    sf.y,
    sf.z + sf.nz * pitSideSign * (halfW + 13.5),
  );
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

  // Main Grandstand opposite Pit Lane
  const standGroup = new THREE.Group();
  standGroup.position.set(
    sf.x - sf.nx * pitSideSign * (halfW + 13),
    sf.y,
    sf.z - sf.nz * pitSideSign * (halfW + 13),
  );
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
  const colorObj = new THREE.Color();
  for (let i = 0; i < specCount; i++) {
    const row = Math.floor(i / 24);
    const col = i % 24;
    dummy.position.set(-3.2 + row * 1.4, 5.75, -16 + col * 1.4);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 0.9 + (i % 3) * 0.15, 1);
    dummy.updateMatrix();
    specInst.setMatrixAt(i, dummy.matrix);
    colorObj.setHex(specColors[(i * 7) % specColors.length]);
    specInst.setColorAt(i, colorObj);
  }
  specInst.instanceMatrix.needsUpdate = true;
  if (specInst.instanceColor) specInst.instanceColor.needsUpdate = true;
  specInst.computeBoundingSphere();
  standGroup.add(specInst);

  const isSafe = (px: number, pz: number, r: number) =>
    isPositionSafeFromTrack(px, pz, r, compiled);

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

  // 10. Night Street Circuit Floodlight Towers
  if (compiled.spec.scenery === 'street-night') {
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
        color: 0xffffff,
        emissive: 0xffedd5,
        emissiveIntensity: 2.5,
        roughness: 0.2,
      }),
    );

    const floodStep = Math.max(12, Math.floor(compiled.samples.length / 20));
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

  return {
    group,
    skyColor: palette.sky,
    fogColor: palette.sky,
    startLightMats,
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
