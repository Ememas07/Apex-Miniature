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

  // 1. Pit Lane Bypass Corridor + Speed Limit Line (computed early so ground terrain & clearance verify both splines)
  const pitSamples: Array<{ x: number; y: number; z: number; nx: number; nz: number; banking?: number; width?: number }> = [];
  const pitSteps = 44;
  for (let i = 0; i <= pitSteps; i++) {
    const u = i / pitSteps;
    // t spans from 0.89 -> 1.0 -> 0.09
    const t = (0.89 + u * 0.2) % 1;
    const sp = sampleTrackAtT(compiled, t);
    const blend = Math.sin(u * Math.PI); // smoothly pulls away from track to pitOffset
    const lat = compiled.pitOffset * Math.min(1, blend * 1.45);
    pitSamples.push({
      x: sp.x + sp.nx * lat,
      y: sp.y,
      z: sp.z + sp.nz * lat,
      nx: sp.nx,
      nz: sp.nz,
      banking: 0,
      width: 7.6,
    });
  }
  const pitRoadGeo = track(buildRibbonGeometry(pitSamples, 3.8, 0.08, 12, false, 7.6));
  const pitRoadMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x333944,
      roughness: 0.82,
      metalness: 0.05,
    }),
  );
  const pitMesh = new THREE.Mesh(pitRoadGeo, pitRoadMat);
  pitMesh.receiveShadow = true;
  group.add(pitMesh);

  // Pit Entry Speed Limit Line (White + Amber)
  const pitEntrySp = pitSamples[7];
  const limitGeo = track(new THREE.BoxGeometry(7.6, 0.08, 0.7));
  const limitMat = track(new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 }));
  const limitLine = new THREE.Mesh(limitGeo, limitMat);
  limitLine.position.set(pitEntrySp.x, pitEntrySp.y + 0.08, pitEntrySp.z);
  limitLine.rotation.y = Math.atan2(-pitEntrySp.nz, pitEntrySp.nx);
  group.add(limitLine);

  // 2. Expansive Contoured Ground Terrain Grid with Strict Road Surface Clearance
  // (within trackWidth / 2 + kerbWidth + runoffWidth + 6.0m, terrainY <= nearestRoadY - 0.35m)
  let minTrackX = Infinity, maxTrackX = -Infinity, minTrackZ = Infinity, maxTrackZ = -Infinity;
  for (let i = 0; i < compiled.samples.length; i++) {
    const s = compiled.samples[i];
    if (s.x < minTrackX) minTrackX = s.x;
    if (s.x > maxTrackX) maxTrackX = s.x;
    if (s.z < minTrackZ) minTrackZ = s.z;
    if (s.z > maxTrackZ) maxTrackZ = s.z;
  }
  const gridSpanX = Math.max(1600, (maxTrackX - minTrackX) + 500);
  const gridSpanZ = Math.max(1600, (maxTrackZ - minTrackZ) + 500);
  const centerTrackX = (minTrackX + maxTrackX) * 0.5;
  const centerTrackZ = (minTrackZ + maxTrackZ) * 0.5;

  const groundGeo = track(new THREE.PlaneGeometry(gridSpanX, gridSpanZ, 96, 96));
  groundGeo.rotateX(-Math.PI / 2);
  groundGeo.translate(centerTrackX, 0, centerTrackZ);

  const posAttr = groundGeo.attributes.position;
  const sampleCount = compiled.samples.length;
  const KERB_WIDTH = 1.8;
  const RUNOFF_MARGIN = 4.2;
  const EXTRA_CLEARANCE = 6.0;

  for (let k = 0; k < posAttr.count; k++) {
    const vx = posAttr.getX(k);
    const vz = posAttr.getZ(k);
    let minDistSq = Infinity;
    let nearestY = 0;
    let nearestHalfW = halfW;

    for (let s = 0; s < sampleCount; s++) {
      const sp = compiled.samples[s];
      const dx = vx - sp.x;
      const dz = vz - sp.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < minDistSq) {
        minDistSq = dSq;
        nearestY = sp.y;
        nearestHalfW = sp.width ? sp.width * 0.5 : halfW;
      }
    }
    for (let p = 0; p < pitSamples.length; p++) {
      const ps = pitSamples[p];
      const dx = vx - ps.x;
      const dz = vz - ps.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < minDistSq) {
        minDistSq = dSq;
        nearestY = ps.y;
        nearestHalfW = 3.8;
      }
    }

    const dist = Math.sqrt(minDistSq);
    const clearanceThreshold = nearestHalfW + KERB_WIDTH + RUNOFF_MARGIN + EXTRA_CLEARANCE;

    let vy = -0.25;
    if (dist < clearanceThreshold) {
      vy = Math.min(vy, nearestY - 0.35);
    } else {
      const falloff = Math.max(0, 1 - (dist - clearanceThreshold) / 95);
      const targetH = (nearestY - 0.35) * falloff - 0.25 * (1 - falloff);
      vy = Math.max(-0.25, targetH);
      if (dist < clearanceThreshold + 4.0) {
        vy = Math.min(vy, nearestY - 0.35);
      }
    }
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

  // Optional coastal harbor water apron
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
    water.position.y = -0.18;
    group.add(water);
  }

  // 3. Main Track Asphalt Ribbon (offset +0.08m above spline Y)
  const asphaltTex = track(createAsphaltTexture(compiled.spec.asphaltColor, maxAniso));
  const roadGeo = track(buildRibbonGeometry(compiled.samples, halfW, 0.08, 16, true, compiled.spec.trackWidth));
  const roadMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: asphaltTex,
      roughness: 0.78,
      metalness: 0.04,
    }),
  );
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  // 4. Gravel / Turf Runoff Apron under Track
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

  // 5. Stylized Oversized Die-Cast Apex Kerbs (InstancedMesh on curved sections)
  const kerbTex = track(createKerbTexture(compiled.spec.kerbPrimary, compiled.spec.kerbSecondary, maxAniso));
  const kerbMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: kerbTex,
      roughness: 0.55,
      metalness: 0.05,
    }),
  );
  const kerbBoxGeo = track(new THREE.BoxGeometry(1.3, 0.14, 2.2));
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
        s.y + 0.08 + (i % 2) * 0.004 + side * kerbDist * sinB,
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
  const pitSideSign = compiled.pitOffset >= 0 ? 1 : -1;
  for (let i = 0; i < compiled.samples.length; i += 2) {
    const s = compiled.samples[i];
    // Skip inner barrier along pit lane corridor so players can enter pits cleanly
    const inPitWindow = s.t >= 0.88 || s.t <= 0.10;
    for (const side of [-1, 1]) {
      if (side === pitSideSign && inPitWindow) continue;
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

  // Concrete Pit Wall Divider between main track straight and pit lane corridor
  const pitWallGeo = track(new THREE.BoxGeometry(0.55, 1.1, 4.4));
  const pitWallMat = track(new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.65, metalness: 0.25 }));
  const pitWallMatrices: THREE.Matrix4[] = [];
  for (let i = 0; i < compiled.samples.length; i += 2) {
    const s = compiled.samples[i];
    // Extend along pit corridor except throat and merge
    const inDivider = (s.t >= 0.905 || s.t <= 0.075);
    if (inDivider) {
      const curHalfW = s.width ? s.width * 0.5 : halfW;
      const wallOffset = curHalfW + 0.9;
      dummy.position.set(
        s.x + s.nx * pitSideSign * wallOffset,
        s.y + 0.55,
        s.z + s.nz * pitSideSign * wallOffset,
      );
      dummy.rotation.set(0, Math.atan2(s.tx, s.tz), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pitWallMatrices.push(dummy.matrix.clone());
    }
  }
  if (pitWallMatrices.length > 0) {
    const pitWallInst = new THREE.InstancedMesh(pitWallGeo, pitWallMat, pitWallMatrices.length);
    pitWallMatrices.forEach((m, idx) => pitWallInst.setMatrixAt(idx, m));
    pitWallInst.instanceMatrix.needsUpdate = true;
    pitWallInst.computeBoundingSphere();
    pitWallInst.castShadow = true;
    pitWallInst.receiveShadow = true;
    group.add(pitWallInst);
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
    if (s.y > 4.2) {
      const curHalfW = s.width ? s.width * 0.5 : halfW;
      for (const side of [-1, 1]) {
        const pier = new THREE.Mesh(pierGeo, pierMat);
        const offset = curHalfW + 2.4;
        pier.scale.y = Math.max(1, s.y - 0.1);
        pier.position.set(
          s.x + s.nx * side * offset,
          (s.y - 0.1) * 0.5,
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

  const distScale = compiled.totalLength / sampleCount;
  // Corners where target apex speed drops below 65% of straight-line top speed (|curvature| > 0.025, R < 40m)
  const zoneEntries: Array<{ index: number; side: number }> = [];
  let cooldownSamples = 0;
  for (let i = 0; i < sampleCount; i++) {
    if (cooldownSamples > 0) {
      cooldownSamples--;
      continue;
    }
    const cur = compiled.samples[i];
    // Check direction change angle over the corner entry (25m) or heavy curvature
    const upcomingSamples = Math.max(3, Math.round(25 / distScale));
    const nextSamp = compiled.samples[(i + upcomingSamples) % sampleCount];
    const dotTangent = Math.max(-1, Math.min(1, cur.tx * nextSamp.tx + cur.tz * nextSamp.tz));
    const turnAngleDeg = Math.acos(dotTangent) * (180 / Math.PI);
    const isHeavyBraking = Math.abs(cur.curvature) > 0.022 || turnAngleDeg > 35;

    if (isHeavyBraking) {
      // Check preceding ~50m has a genuine straight/braking approach
      const backCheck = Math.max(4, Math.round(50 / distScale));
      let approachClear = true;
      for (let b = 2; b <= backCheck; b++) {
        const prev = compiled.samples[(i - b + sampleCount) % sampleCount];
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
      const si = (zone.index - offsetSamples + sampleCount) % sampleCount;
      const s = compiled.samples[si];
      const inPitWindow = s.t >= 0.89 || s.t <= 0.09;
      if (inPitWindow && zone.side === pitSideSign) continue;
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
  sfLine.position.y = 0.08;
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

  // 8. Pit Garages & Grandstands flanking the Main Straight
  const pitBuildingGroup = new THREE.Group();
  pitBuildingGroup.position.set(
    sf.x + sf.nx * (compiled.pitOffset + pitSideSign * 7.5),
    sf.y,
    sf.z + sf.nz * (compiled.pitOffset + pitSideSign * 7.5),
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
    isPositionSafeFromTrack(px, pz, r, compiled, pitSamples);

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
    dummy.position.set(px, compiled.spec.scenery === 'street-night' ? 11 * hScale : 4.2 * s, pz);
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
