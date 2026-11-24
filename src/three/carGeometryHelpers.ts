import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CarClassId } from '../game/types';
import { computeDefaultHoodMount, HoodMountOffset } from '../game/camera';
import type { TrackDisposable } from './carMaterials';

export type CarUVZone = 'TOP' | 'LEFT_SIDE' | 'RIGHT_SIDE' | 'FRONT' | 'REAR' | 'WINGS_AERO_TRIM';

export interface UVZoneRect {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  label: string;
}

/**
 * Deterministic 6-zone non-overlapping UV atlas layout inside [0, 1] x [0, 1] with 0.02 zone margins.
 * Matches scripts/objToLowPoly.mjs 1:1 so procedural and converted cars share identical UV templates.
 */
export const SIX_ZONE_UV_ATLAS: Record<CarUVZone, UVZoneRect> = {
  TOP: { uMin: 0.02, uMax: 0.44, vMin: 0.02, vMax: 0.98, label: 'Top (Roof / Hood / Decklid)' },
  LEFT_SIDE: { uMin: 0.46, uMax: 0.98, vMin: 0.76, vMax: 0.98, label: 'Left Side' },
  RIGHT_SIDE: { uMin: 0.46, uMax: 0.98, vMin: 0.52, vMax: 0.74, label: 'Right Side' },
  FRONT: { uMin: 0.46, uMax: 0.71, vMin: 0.27, vMax: 0.50, label: 'Front Bumper / Nose' },
  REAR: { uMin: 0.73, uMax: 0.98, vMin: 0.27, vMax: 0.50, label: 'Rear Bumper / Diffuser' },
  WINGS_AERO_TRIM: { uMin: 0.46, uMax: 0.98, vMin: 0.02, vMax: 0.25, label: 'Wings / Aero / Trim' },
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function projectPointToSixZoneUV(
  x: number,
  y: number,
  z: number,
  zone: CarUVZone,
  bounds: THREE.Box3,
  isUnderside: boolean,
): [number, number] {
  const minX = bounds.min.x;
  const maxX = bounds.max.x;
  const minY = bounds.min.y;
  const maxY = bounds.max.y;
  const minZ = bounds.min.z;
  const maxZ = bounds.max.z;
  const spanX = Math.max(1e-4, maxX - minX);
  const spanY = Math.max(1e-4, maxY - minY);
  const spanZ = Math.max(1e-4, maxZ - minZ);

  let rect = SIX_ZONE_UV_ATLAS[zone];
  let nu = 0.5;
  let nv = 0.5;

  if (zone === 'TOP') {
    // Nose (+Z) toward top of UV (vMax), left/right (+X/-X) across u
    nu = (maxX - x) / spanX;
    nv = (z - minZ) / spanZ;
  } else if (zone === 'LEFT_SIDE') {
    nu = (z - minZ) / spanZ;
    nv = (y - minY) / spanY;
  } else if (zone === 'RIGHT_SIDE') {
    nu = (maxZ - z) / spanZ;
    nv = (y - minY) / spanY;
  } else if (zone === 'FRONT') {
    nu = (maxX - x) / spanX;
    nv = (y - minY) / spanY;
  } else if (zone === 'REAR') {
    nu = (x - minX) / spanX;
    nv = (y - minY) / spanY;
  } else {
    // WINGS_AERO_TRIM: sub-partition aero/wings (left half) vs underside/trim (right half) so they never overlap
    rect = isUnderside
      ? { uMin: 0.73, uMax: 0.98, vMin: 0.02, vMax: 0.25, label: rect.label }
      : { uMin: 0.46, uMax: 0.71, vMin: 0.02, vMax: 0.25, label: rect.label };
    nu = (maxX - x) / spanX;
    nv = (z - minZ) / spanZ;
  }

  const innerPad = 0.006;
  const uLo = rect.uMin + innerPad;
  const uHi = rect.uMax - innerPad;
  const vLo = rect.vMin + innerPad;
  const vHi = rect.vMax - innerPad;
  const u = uLo + clamp01(nu) * (uHi - uLo);
  const v = vLo + clamp01(nv) * (vHi - vLo);
  return [u, v];
}

export function classifyTriangleSixZone(
  nx: number,
  ny: number,
  nz: number,
  isAero = false,
): { zone: CarUVZone; isUnderside: boolean } {
  const isUnderside = ny < -0.55;
  if (isAero || isUnderside) {
    return { zone: 'WINGS_AERO_TRIM', isUnderside };
  }
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  if (ay >= ax && ay >= az) {
    return { zone: 'TOP', isUnderside: false };
  }
  if (ax >= ay && ax >= az) {
    return { zone: nx >= 0 ? 'LEFT_SIDE' : 'RIGHT_SIDE', isUnderside: false };
  }
  return { zone: nz >= 0 ? 'FRONT' : 'REAR', isUnderside: false };
}

/**
 * Applies deterministic 6-zone orthographic box/atlas UVs to a BufferGeometry.
 * Splits shared vertices across zone seams while preserving existing normals so triangles
 * never stretch across atlas zones or wrap outside [0, 1].
 */
export function applySixZoneCarUVs(
  geometry: THREE.BufferGeometry,
  carBounds?: THREE.Box3,
  options?: { isAero?: boolean; forceZone?: CarUVZone },
): THREE.BufferGeometry {
  const posAttr = geometry.getAttribute('position');
  if (!posAttr || posAttr.count < 3) return geometry;

  if (!geometry.getAttribute('normal')) {
    geometry.computeVertexNormals();
  }
  const normAttr = geometry.getAttribute('normal');
  const indexAttr = geometry.getIndex();

  const bounds = carBounds ? carBounds.clone() : new THREE.Box3().setFromBufferAttribute(posAttr as THREE.BufferAttribute);
  if (bounds.isEmpty()) return geometry;

  const triCount = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(posAttr.count / 3);
  if (triCount === 0) return geometry;

  const newPos: number[] = [];
  const newNorm: number[] = [];
  const newUV: number[] = [];
  const newIndices: number[] = [];
  const dedup = new Map<string, number>();

  const getIdx = (t: number, corner: number) => (indexAttr ? indexAttr.getX(t * 3 + corner) : t * 3 + corner);

  for (let t = 0; t < triCount; t++) {
    const i0 = getIdx(t, 0);
    const i1 = getIdx(t, 1);
    const i2 = getIdx(t, 2);

    const ax = posAttr.getX(i0), ay = posAttr.getY(i0), az = posAttr.getZ(i0);
    const bx = posAttr.getX(i1), by = posAttr.getY(i1), bz = posAttr.getZ(i1);
    const cx = posAttr.getX(i2), cy = posAttr.getY(i2), cz = posAttr.getZ(i2);

    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    let fnx = e1y * e2z - e1z * e2y;
    let fny = e1z * e2x - e1x * e2z;
    let fnz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(fnx, fny, fnz) || 1;
    fnx /= len;
    fny /= len;
    fnz /= len;

    const classified = options?.forceZone
      ? { zone: options.forceZone, isUnderside: fny < -0.55 }
      : classifyTriangleSixZone(fnx, fny, fnz, Boolean(options?.isAero));

    const zoneTag = `${classified.zone}:${classified.isUnderside ? 1 : 0}`;
    for (const vi of [i0, i1, i2]) {
      const key = `${vi}:${zoneTag}`;
      let outVi = dedup.get(key);
      if (outVi === undefined) {
        const px = posAttr.getX(vi);
        const py = posAttr.getY(vi);
        const pz = posAttr.getZ(vi);
        const [u, v] = projectPointToSixZoneUV(px, py, pz, classified.zone, bounds, classified.isUnderside);
        outVi = newPos.length / 3;
        newPos.push(px, py, pz);
        newNorm.push(normAttr.getX(vi), normAttr.getY(vi), normAttr.getZ(vi));
        newUV.push(u, v);
        dedup.set(key, outVi);
      }
      newIndices.push(outVi);
    }
  }

  const outGeo = new THREE.BufferGeometry();
  outGeo.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3));
  outGeo.setAttribute('normal', new THREE.Float32BufferAttribute(newNorm, 3));
  outGeo.setAttribute('uv', new THREE.Float32BufferAttribute(newUV, 2));
  outGeo.setIndex(newIndices);
  return outGeo;
}

export interface BuiltCarRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  frontWheels: THREE.Group[];
  allWheels: THREE.Group[];
  frontWingFlap: THREE.Mesh | null;
  rearWingFlap: THREE.Mesh | null;
  headlightMats: THREE.MeshStandardMaterial[];
  brakeLightMat: THREE.MeshStandardMaterial;
  brakeRotorMat?: THREE.MeshStandardMaterial;
  rainLightMat?: THREE.MeshStandardMaterial;
  headlightCones?: THREE.Mesh[];
  /** Geometry-measured unobstructed hood camera mount in car-local space. */
  hoodMount: HoodMountOffset;
  dispose: () => void;
}

const _hoodRaycaster = new THREE.Raycaster();
const _hoodRayOrigin = new THREE.Vector3();
const _hoodRayDir = new THREE.Vector3(0, -1, 0);
const _hoodBox = new THREE.Box3();
const _hoodSize = new THREE.Vector3();

/**
 * Measures the actual 3D body surface along the hood, cowl/halo, and forward fenders
 * to compute a guaranteed-unobstructed, horizon-clear Hood Camera mount for any car
 * (both external OBJ models and procedural die-cast meshes).
 */
export function computeRigHoodMount(
  root: THREE.Group,
  bodyGroup: THREE.Group,
  classId?: CarClassId,
  dimensions?: { length?: number; height?: number },
): HoodMountOffset {
  const fallback = computeDefaultHoodMount(classId, dimensions);
  root.updateMatrixWorld(true);
  _hoodBox.setFromObject(bodyGroup);
  if (_hoodBox.isEmpty()) return fallback;

  _hoodBox.getSize(_hoodSize);
  const L = _hoodSize.z;
  const minZ = _hoodBox.min.z;
  const maxY = _hoodBox.max.y;
  if (!Number.isFinite(L) || L < 1.5 || !Number.isFinite(maxY)) return fallback;

  const isOpenWheel =
    classId === CarClassId.F1_2026 ||
    classId === CarClassId.F1_2021 ||
    classId === CarClassId.F1_2005 ||
    classId === CarClassId.FORMULA_E;
  const isProto =
    classId === CarClassId.HYPERCAR_GTP || classId === CarClassId.LMP2;

  // Longitudinal mount: forward of A-pillars/windshield on closed cars, right over front halo/nose ridge on open-wheelers
  const zf = isOpenWheel ? 0.64 : 0.71;
  const mountZ = minZ + zf * L;
  const rayStartY = maxY + 2.0;

  const probeMaxY = (x: number, z: number): number | null => {
    _hoodRayOrigin.set(x, rayStartY, z);
    _hoodRaycaster.set(_hoodRayOrigin, _hoodRayDir);
    const hits = _hoodRaycaster.intersectObject(bodyGroup, true);
    if (hits.length === 0) return null;
    // Ignore stray thin roof/wing antennas well above plausible hood/cowl elevation
    const capY = Math.min(maxY, (dimensions?.height ?? 1.35) + 0.35);
    for (let i = 0; i < hits.length; i++) {
      const hy = hits[i].point.y;
      if (Number.isFinite(hy) && hy <= capY) return hy;
    }
    return hits[0].point.y;
  };

  let localSurfaceY = 0;
  let hasHit = false;
  for (const dz of [-0.14, 0.0, 0.12]) {
    for (const tx of [-0.34, 0.0, 0.34]) {
      const y = probeMaxY(tx, mountZ + dz);
      if (y !== null) {
        hasHit = true;
        if (y > localSurfaceY) localSurfaceY = y;
      }
    }
  }

  // Clearance above local hood/halo + every forward hood/fender point along the forward sightline
  let requiredY = localSurfaceY + 0.30;
  for (const ffrac of [0.76, 0.82, 0.88, 0.93]) {
    const fz = minZ + ffrac * L;
    if (fz <= mountZ + 0.05) continue;
    for (const tx of [-0.48, -0.22, 0.0, 0.22, 0.48]) {
      const y = probeMaxY(tx, fz);
      if (y !== null) {
        hasHit = true;
        // 0.26m vertical margin (accounts for suspension roll + visual margin) + sightline slope clearance
        const need = y + 0.26 + (fz - mountZ) * 0.05;
        if (need > requiredY) requiredY = need;
      }
    }
  }

  if (!hasHit) return fallback;

  const minEyeY = isOpenWheel || isProto ? 1.16 : 1.22;
  const maxEyeY = Math.max(1.56, (dimensions?.height ?? 1.25) + 0.36);
  // +0.02m compensates for RaceViewport's rig.root.position.y = c.y + 0.02
  const mountY = Math.min(maxEyeY, Math.max(minEyeY, requiredY)) + 0.02;

  return {
    forward: Number(mountZ.toFixed(3)),
    up: Number(mountY.toFixed(3)),
  };
}

export type CabinStyle =
  | 'proto-teardrop'
  | 'porsche-911'
  | 'mid-engine-buttress'
  | 'grand-tourer'
  | 'hatchback-clio'
  | 'lmp-gt3-hybrid';

export interface HullStationSpec {
  z: number;
  halfW: number;
  xInnerFloor: number;
  yFloor: number;
  ySill: number;
  yBelt: number;
  wBelt: number;
  yCrown: number;
  wCrown: number;
}

export function createLoftedHullGeometry(
  stations: HullStationSpec[],
  uvWidth: number,
  uvLength: number,
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const nStations = stations.length;
  const nPoints = 11;
  const totalVerts = nStations * nPoints;

  const positions = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indices: number[] = [];

  for (let i = 0; i < nStations; i++) {
    const st = stations[i];
    const z = st.z;
    const lipX = Math.max(st.xInnerFloor + 0.02, st.halfW * 1.015);
    const yArchCeil = Math.min(st.yBelt - 0.015, st.ySill);

    const pts: [number, number, number][] = [
      [-st.xInnerFloor, st.yFloor, z],
      [-st.xInnerFloor, yArchCeil, z],
      [-lipX, st.ySill, z],
      [-st.wBelt, st.yBelt, z],
      [-st.wCrown, (st.yBelt + st.yCrown) * 0.5 + 0.015, z],
      [0, st.yCrown, z],
      [st.wCrown, (st.yBelt + st.yCrown) * 0.5 + 0.015, z],
      [st.wBelt, st.yBelt, z],
      [lipX, st.ySill, z],
      [st.xInnerFloor, yArchCeil, z],
      [st.xInnerFloor, st.yFloor, z],
    ];

    const baseIdx = i * nPoints;
    for (let p = 0; p < nPoints; p++) {
      const vIdx = baseIdx + p;
      const [px, py, pz] = pts[p];
      positions[vIdx * 3] = px;
      positions[vIdx * 3 + 1] = py;
      positions[vIdx * 3 + 2] = pz;

      const u = Math.max(0, Math.min(1, (px + uvWidth * 0.5) / uvWidth));
      const v = Math.max(0, Math.min(1, 1 - (pz + uvLength * 0.5) / uvLength));
      uvs[vIdx * 2] = u;
      uvs[vIdx * 2 + 1] = v;
    }
  }

  for (let i = 0; i < nStations - 1; i++) {
    const r0 = i * nPoints;
    const r1 = (i + 1) * nPoints;

    for (let k = 0; k < 10; k++) {
      const a = r0 + k;
      const b = r1 + k;
      const c = r1 + k + 1;
      const d = r0 + k + 1;
      indices.push(a, b, c);
      indices.push(a, c, d);
    }

    const aFloor = r0 + 10;
    const bFloor = r1 + 10;
    const cFloor = r1 + 0;
    const dFloor = r0 + 0;
    indices.push(aFloor, bFloor, cFloor);
    indices.push(aFloor, cFloor, dFloor);
  }

  // End cap: Rear
  const r0 = 0;
  for (let k = 1; k < 5; k++) {
    indices.push(r0 + 0, r0 + k, r0 + 10 - k);
    indices.push(r0 + k, r0 + k + 1, r0 + 10 - k);
  }
  indices.push(r0 + 4, r0 + 5, r0 + 6);

  // End cap: Front
  const rf = (nStations - 1) * nPoints;
  for (let k = 1; k < 5; k++) {
    indices.push(rf + 0, rf + 10 - k, rf + k);
    indices.push(rf + k, rf + 10 - k, rf + 9 - k);
  }
  indices.push(rf + 4, rf + 6, rf + 5);

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  const creased = toCreasedNormals(geo, 0.72);
  geo.dispose();
  const sixZone = applySixZoneCarUVs(creased);
  creased.dispose();
  return sixZone;
}

export function buildHullStations(
  length: number,
  width: number,
  wheelBaseZ: number,
  wheelRadius: number,
  trackHalfX: number,
  wheelWidth: number,
  design: {
    noseHeightRatio: number;
    tailHeightRatio: number;
    haunchScale?: number;
    hoodStyle?: 'power-dome' | 'pontoon-channel' | 'standard';
    cabinStyle?: CabinStyle;
  },
  isProto: boolean,
  isStreetCar: boolean,
): HullStationSpec[] {
  const halfLen = length * 0.5;
  const archR = wheelRadius + 0.048;
  const innerTubX = Math.max(0.42, trackHalfX - wheelWidth * 0.5 - 0.035);

  // Build dense longitudinal sample points including exact circular wheel-well stations around front & rear axles
  const zRaw: number[] = [];
  for (let i = 0; i <= 26; i++) {
    zRaw.push(-halfLen + (i / 26) * length);
  }
  for (const axleZ of [-wheelBaseZ, wheelBaseZ]) {
    for (const frac of [-1.08, -0.96, -0.82, -0.55, -0.25, 0, 0.25, 0.55, 0.82, 0.96, 1.08]) {
      const zVal = axleZ + frac * archR;
      if (zVal > -halfLen + 0.04 && zVal < halfLen - 0.04) {
        zRaw.push(zVal);
      }
    }
  }
  zRaw.sort((a, b) => a - b);
  const zPoints: number[] = [];
  for (const z of zRaw) {
    if (zPoints.length === 0 || z - zPoints[zPoints.length - 1] > 0.022) {
      zPoints.push(z);
    }
  }

  const hScale = design.haunchScale ?? (isStreetCar ? 1.03 : 1.0);
  const isPowerDome = design.hoodStyle === 'power-dome';
  const isPontoon = design.hoodStyle === 'pontoon-channel' || isProto;
  const isHatch = design.cabinStyle === 'hatchback-clio';
  const archTopTarget = wheelRadius + archR;

  const stations: HullStationSpec[] = [];

  for (const z of zPoints) {
    const t = Math.max(0, Math.min(1, (z + halfLen) / length));
    const yFloor = 0.14;
    let halfW = width * 0.46;
    let ySill = 0.18;
    let yBelt = 0.56;
    let yCrown = 0.58;

    // Smooth wheel-well proximity check (prevents sharp quad twists at arch entry/exit)
    const dzFront = Math.abs(z - wheelBaseZ);
    const dzRear = Math.abs(z + wheelBaseZ);
    const dzMin = Math.min(dzFront, dzRear);
    const inArchZone = dzMin < archR;
    const archCurve = inArchZone ? Math.sqrt(Math.max(0, archR * archR - dzMin * dzMin)) : 0;
    const lowerCornerT = Math.max(0, Math.min(1, (archR * 1.06 - dzMin) / (archR * 0.16)));
    const lowerCornerBlend = lowerCornerT * lowerCornerT * (3 - 2 * lowerCornerT);
    const rawArchLipY = wheelRadius * lowerCornerBlend + archCurve;
    const archLipY = 0.18 + (Math.max(0.18, rawArchLipY) - 0.18) * lowerCornerBlend;
    const fenderEnv = dzMin < archR * 1.35 ? Math.cos((dzMin / (archR * 1.35)) * Math.PI * 0.5) : 0;

    if (t <= 0.075) {
      // Rear bumper / diffuser tail
      const f = t / 0.075;
      halfW = width * (isProto ? 0.43 + f * 0.045 : 0.455 + f * 0.035);
      ySill = 0.21 - f * 0.03;
      yBelt = (isProto ? 0.56 : 0.60) * Math.max(0.84, design.tailHeightRatio) + f * 0.04;
      yCrown = yBelt + (isProto ? 0.01 : 0.03);
    } else if (t <= 0.29) {
      // Rear wheel arch & muscular haunches
      const baseHaunch = isProto ? 0.475 : 0.49;
      halfW = width * (baseHaunch + fenderEnv * (isProto ? 0.045 : 0.035)) * hScale;
      ySill = Math.max(0.18, archLipY);
      yBelt = Math.max(archTopTarget + 0.025, 0.60 + fenderEnv * 0.09);
      yCrown = isProto ? 0.56 + fenderEnv * 0.03 : 0.62 + fenderEnv * 0.04;
    } else if (t <= 0.56) {
      // Side doors / coke-bottle waist
      const pinch = Math.sin(((t - 0.29) / 0.27) * Math.PI);
      const minWFactor = isProto ? 0.415 : isHatch ? 0.475 : isStreetCar ? 0.46 : 0.455;
      const startW = isProto ? 0.475 : 0.49;
      halfW = width * (startW - pinch * (startW - minWFactor));
      ySill = Math.max(0.18, archLipY);
      yBelt = Math.max(archLipY + 0.04, isProto ? 0.54 : isHatch ? 0.60 : 0.56);
      yCrown = isProto ? 0.53 : isHatch ? 0.61 : 0.58;
    } else if (t <= 0.875) {
      // Front wheel arch & fenders
      const baseFender = isProto ? 0.47 : 0.485;
      halfW = width * (baseFender + fenderEnv * (isProto ? 0.035 : 0.03));
      ySill = Math.max(0.18, archLipY);
      yBelt = Math.max(archTopTarget + 0.025, (isProto ? 0.56 : 0.59) + fenderEnv * 0.09);
      if (isPontoon) {
        yCrown = 0.45 + (1 - fenderEnv) * 0.03;
      } else if (isPowerDome) {
        yCrown = 0.57 + fenderEnv * 0.02;
      } else {
        yCrown = 0.54 + fenderEnv * 0.02;
      }
    } else {
      // Smooth front hood taper & nosecone
      const frac = (t - 0.875) / 0.125;
      const smoothFrac = frac * frac * (3 - 2 * frac);
      const baseNose = isProto ? 0.47 : 0.485;
      halfW = width * (baseNose - smoothFrac * (isProto ? 0.11 : 0.075));
      ySill = 0.17;
      yBelt = (isProto ? 0.54 : 0.57) * (1 - smoothFrac * 0.44) * Math.max(0.75, design.noseHeightRatio);
      if (isPontoon) {
        yCrown = (0.45 - smoothFrac * 0.18) * Math.max(0.78, design.noseHeightRatio);
      } else if (isPowerDome) {
        yCrown = (0.57 - smoothFrac * 0.25) * Math.max(0.78, design.noseHeightRatio);
      } else {
        yCrown = (0.54 - smoothFrac * 0.23) * Math.max(0.78, design.noseHeightRatio);
      }
      yBelt = Math.max(0.24, yBelt);
      yCrown = Math.max(0.23, yCrown);
    }

    // Smoothly blend inner wheel-arch recess depth across the arch edge so there are zero vertical creases
    const archDepthT = Math.max(0, Math.min(1, (archR * 1.06 - dzMin) / (archR * 0.24)));
    const archDepthBlend = archDepthT * archDepthT * (3 - 2 * archDepthT);
    const outerTubX = halfW * 0.88;
    const recessedTubX = Math.min(outerTubX, innerTubX);
    const xInnerFloor = outerTubX + (recessedTubX - outerTubX) * archDepthBlend;
    const wBelt = halfW * (isProto ? 0.91 : 0.935);
    const wCrown = halfW * (isProto ? 0.44 : 0.48);

    stations.push({
      z,
      halfW,
      xInnerFloor,
      yFloor,
      ySill,
      yBelt,
      wBelt,
      yCrown,
      wCrown,
    });
  }

  return stations;
}

export interface GreenhouseStationSpec {
  z: number;
  wBase: number;
  wRoof: number;
  yBase: number;
  yRoof: number;
}

export function createLoftedGreenhouseGeometry(
  stations: GreenhouseStationSpec[],
  uvWidth: number,
  uvLength: number,
  inset = 0,
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const nStations = stations.length;
  const nPoints = 5;
  const totalVerts = nStations * nPoints;

  const positions = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indices: number[] = [];

  for (let i = 0; i < nStations; i++) {
    const st = stations[i];
    const z = st.z;
    const wb = Math.max(0.06, st.wBase - inset);
    const wr = Math.max(0.04, st.wRoof - inset);
    const yr = st.yRoof - inset * 0.5;
    const pts: [number, number, number][] = [
      [-wb, st.yBase, z],
      [-wr, yr, z],
      [0, yr + 0.028, z],
      [wr, yr, z],
      [wb, st.yBase, z],
    ];

    const baseIdx = i * nPoints;
    for (let p = 0; p < nPoints; p++) {
      const vIdx = baseIdx + p;
      const [px, py, pz] = pts[p];
      positions[vIdx * 3] = px;
      positions[vIdx * 3 + 1] = py;
      positions[vIdx * 3 + 2] = pz;

      const u = Math.max(0, Math.min(1, (px + uvWidth * 0.5) / uvWidth));
      const v = Math.max(0, Math.min(1, 1 - (pz + uvLength * 0.5) / uvLength));
      uvs[vIdx * 2] = u;
      uvs[vIdx * 2 + 1] = v;
    }
  }

  for (let i = 0; i < nStations - 1; i++) {
    const r0 = i * nPoints;
    const r1 = (i + 1) * nPoints;
    for (let k = 0; k < 4; k++) {
      const a = r0 + k;
      const b = r1 + k;
      const c = r1 + k + 1;
      const d = r0 + k + 1;
      indices.push(a, b, c);
      indices.push(a, c, d);
    }
  }

  // Rear cap
  indices.push(0, 1, 4);
  indices.push(1, 2, 3);
  indices.push(1, 3, 4);

  // Front cap
  const rf = (nStations - 1) * nPoints;
  indices.push(rf + 0, rf + 4, rf + 1);
  indices.push(rf + 1, rf + 3, rf + 2);
  indices.push(rf + 1, rf + 4, rf + 3);

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  return geo;
}

export function buildCabinStations(
  style: CabinStyle,
  cabinOffsetZ: number,
  cabinScaleW: number,
  cabinScaleH: number,
  cabinScaleL: number,
  isProto: boolean,
): GreenhouseStationSpec[] {
  const baseW = (isProto ? 0.44 : 0.62) * cabinScaleW;
  const roofH = (isProto ? 0.94 : 1.04) * cabinScaleH;
  const beltY = isProto ? 0.52 : 0.56;
  const len = (isProto ? 1.56 : 1.72) * cabinScaleL;
  const zRear = cabinOffsetZ - len * 0.5;
  // Keep windshield base strictly <= +0.58 so Hood Cam at z=+0.68..+0.72 never clips windshield/A-pillars
  const zFront = Math.min(isProto ? 0.58 : 0.56, cabinOffsetZ + len * 0.5);
  const effLen = Math.max(1.1, zFront - zRear);

  if (style === 'hatchback-clio') {
    return [
      { z: zRear - 0.26, wBase: baseW * 0.90, wRoof: baseW * 0.72, yBase: beltY + 0.05, yRoof: beltY + 0.14 },
      { z: zRear - 0.12, wBase: baseW * 0.94, wRoof: baseW * 0.81, yBase: beltY + 0.04, yRoof: roofH * 0.98 },
      { z: zRear + effLen * 0.25, wBase: baseW * 0.98, wRoof: baseW * 0.84, yBase: beltY + 0.02, yRoof: roofH * 1.01 },
      { z: zRear + effLen * 0.52, wBase: baseW * 0.99, wRoof: baseW * 0.84, yBase: beltY, yRoof: roofH * 1.01 },
      { z: zRear + effLen * 0.74, wBase: baseW * 0.95, wRoof: baseW * 0.79, yBase: beltY, yRoof: roofH * 0.96 },
      { z: zFront - 0.14, wBase: baseW * 0.89, wRoof: baseW * 0.72, yBase: beltY, yRoof: roofH * 0.91 },
      { z: zFront + 0.04, wBase: baseW * 0.84, wRoof: baseW * 0.64, yBase: beltY - 0.02, yRoof: beltY + 0.03 },
    ];
  }

  if (style === 'porsche-911') {
    return [
      { z: zRear - 0.18, wBase: baseW * 0.68, wRoof: baseW * 0.36, yBase: beltY + 0.03, yRoof: beltY + 0.06 },
      { z: zRear + effLen * 0.22, wBase: baseW * 0.88, wRoof: baseW * 0.68, yBase: beltY + 0.02, yRoof: roofH * 0.93 },
      { z: zRear + effLen * 0.42, wBase: baseW * 0.96, wRoof: baseW * 0.78, yBase: beltY + 0.01, yRoof: roofH * 1.00 },
      { z: zRear + effLen * 0.60, wBase: baseW * 0.99, wRoof: baseW * 0.80, yBase: beltY, yRoof: roofH * 1.02 },
      { z: zRear + effLen * 0.76, wBase: baseW * 0.94, wRoof: baseW * 0.75, yBase: beltY, yRoof: roofH * 0.95 },
      { z: zFront - 0.14, wBase: baseW * 0.87, wRoof: baseW * 0.68, yBase: beltY, yRoof: roofH * 0.90 },
      { z: zFront, wBase: baseW * 0.80, wRoof: baseW * 0.58, yBase: beltY - 0.02, yRoof: beltY + 0.03 },
    ];
  }

  if (style === 'grand-tourer') {
    return [
      { z: zRear - 0.06, wBase: baseW * 0.82, wRoof: baseW * 0.54, yBase: beltY + 0.03, yRoof: beltY + 0.07 },
      { z: zRear + effLen * 0.22, wBase: baseW * 0.93, wRoof: baseW * 0.74, yBase: beltY + 0.02, yRoof: roofH * 0.94 },
      { z: zRear + effLen * 0.44, wBase: baseW * 0.98, wRoof: baseW * 0.81, yBase: beltY + 0.01, yRoof: roofH * 1.01 },
      { z: zRear + effLen * 0.64, wBase: baseW * 0.98, wRoof: baseW * 0.80, yBase: beltY, yRoof: roofH * 1.00 },
      { z: zRear + effLen * 0.80, wBase: baseW * 0.92, wRoof: baseW * 0.74, yBase: beltY, yRoof: roofH * 0.94 },
      { z: zFront - 0.14, wBase: baseW * 0.86, wRoof: baseW * 0.66, yBase: beltY, yRoof: roofH * 0.89 },
      { z: zFront, wBase: baseW * 0.78, wRoof: baseW * 0.56, yBase: beltY - 0.02, yRoof: beltY + 0.02 },
    ];
  }

  if (style === 'mid-engine-buttress') {
    return [
      { z: zRear - 0.04, wBase: baseW * 0.86, wRoof: baseW * 0.52, yBase: beltY + 0.02, yRoof: beltY + 0.06 },
      { z: zRear + effLen * 0.20, wBase: baseW * 0.93, wRoof: baseW * 0.70, yBase: beltY + 0.02, yRoof: roofH * 0.92 },
      { z: zRear + effLen * 0.42, wBase: baseW * 0.98, wRoof: baseW * 0.77, yBase: beltY + 0.01, yRoof: roofH * 0.98 },
      { z: zRear + effLen * 0.62, wBase: baseW * 0.97, wRoof: baseW * 0.76, yBase: beltY, yRoof: roofH * 0.97 },
      { z: zRear + effLen * 0.78, wBase: baseW * 0.92, wRoof: baseW * 0.70, yBase: beltY, yRoof: roofH * 0.91 },
      { z: zFront - 0.14, wBase: baseW * 0.85, wRoof: baseW * 0.62, yBase: beltY, yRoof: roofH * 0.86 },
      { z: zFront, wBase: baseW * 0.76, wRoof: baseW * 0.52, yBase: beltY - 0.02, yRoof: beltY + 0.02 },
    ];
  }

  if (style === 'lmp-gt3-hybrid') {
    return [
      { z: zRear, wBase: baseW * 0.78, wRoof: baseW * 0.44, yBase: beltY + 0.02, yRoof: beltY + 0.05 },
      { z: zRear + effLen * 0.24, wBase: baseW * 0.89, wRoof: baseW * 0.64, yBase: beltY + 0.01, yRoof: roofH * 0.91 },
      { z: zRear + effLen * 0.48, wBase: baseW * 0.96, wRoof: baseW * 0.74, yBase: beltY, yRoof: roofH * 0.98 },
      { z: zRear + effLen * 0.70, wBase: baseW * 0.95, wRoof: baseW * 0.72, yBase: beltY, yRoof: roofH * 0.95 },
      { z: zFront - 0.16, wBase: baseW * 0.86, wRoof: baseW * 0.60, yBase: beltY, yRoof: roofH * 0.88 },
      { z: zFront, wBase: baseW * 0.74, wRoof: baseW * 0.46, yBase: beltY - 0.02, yRoof: beltY + 0.02 },
    ];
  }

  // Default 'proto-teardrop'
  return [
    { z: zRear, wBase: baseW * 0.48, wRoof: baseW * 0.24, yBase: beltY + 0.03, yRoof: beltY + 0.06 },
    { z: zRear + effLen * 0.24, wBase: baseW * 0.78, wRoof: baseW * 0.52, yBase: beltY + 0.02, yRoof: roofH * 0.91 },
    { z: zRear + effLen * 0.48, wBase: baseW * 0.96, wRoof: baseW * 0.68, yBase: beltY + 0.01, yRoof: roofH * 1.00 },
    { z: zRear + effLen * 0.72, wBase: baseW * 0.94, wRoof: baseW * 0.66, yBase: beltY, yRoof: roofH * 0.96 },
    { z: zFront - 0.16, wBase: baseW * 0.82, wRoof: baseW * 0.54, yBase: beltY, yRoof: roofH * 0.89 },
    { z: zFront, wBase: baseW * 0.66, wRoof: baseW * 0.38, yBase: beltY - 0.02, yRoof: beltY + 0.02 },
  ];
}

export function createAirfoilWingGeometry(
  spanWidth: number,
  chord = 0.30,
  thickness = 0.052,
): THREE.ExtrudeGeometry {
  const halfC = chord * 0.5;
  const airfoil = new THREE.Shape();
  airfoil.moveTo(halfC, 0.0);
  airfoil.quadraticCurveTo(0.0, thickness * 0.55, -halfC, thickness * 0.65);
  airfoil.lineTo(-halfC, thickness * 0.15);
  airfoil.quadraticCurveTo(0.0, -thickness * 0.25, halfC, -thickness * 0.12);
  airfoil.closePath();

  const geo = new THREE.ExtrudeGeometry(airfoil, {
    depth: spanWidth,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.01,
    bevelSegments: 2,
  });
  geo.rotateY(Math.PI / 2);
  geo.translate(-spanWidth * 0.5, 0, 0);
  return geo;
}

export function createSharkFinGeometry(length = 1.05, height = 0.30): THREE.ExtrudeGeometry {
  const fin = new THREE.Shape();
  fin.moveTo(0, 0);
  fin.lineTo(length, 0);
  fin.lineTo(length, height * 0.95);
  fin.quadraticCurveTo(length * 0.45, height * 0.72, 0.06, height * 0.36);
  fin.lineTo(0, 0.02);
  fin.closePath();

  const geo = new THREE.ExtrudeGeometry(fin, {
    depth: 0.036,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.006,
    bevelSegments: 1,
  });
  geo.rotateY(Math.PI / 2);
  geo.translate(-0.018, 0, 0);
  return geo;
}

export function createDiecastWheel(
  radius: number,
  width: number,
  rimMat: THREE.Material,
  tireMat: THREE.Material,
  caliperMat: THREE.Material,
  rotorMat: THREE.Material,
  outSign: -1 | 1,
  track: TrackDisposable,
  grooveMat?: THREE.Material,
  isGrooved = false,
): THREE.Group {
  const wheelGroup = new THREE.Group();
  const rimRadius = radius * 0.66;

  // Open-ended tire tread band + annular sidewalls so wheel center is truly hollow
  const tireGeo = track(new THREE.CylinderGeometry(radius, radius, width, 28, 1, true));
  tireGeo.rotateZ(Math.PI / 2);
  const tireMesh = new THREE.Mesh(tireGeo, tireMat);
  tireMesh.castShadow = true;
  wheelGroup.add(tireMesh);

  const outerWallGeo = track(new THREE.RingGeometry(rimRadius, radius, 28));
  outerWallGeo.rotateY(outSign > 0 ? Math.PI / 2 : -Math.PI / 2);
  const outerWall = new THREE.Mesh(outerWallGeo, tireMat);
  outerWall.position.x = outSign * width * 0.5;
  wheelGroup.add(outerWall);

  const innerWallGeo = track(new THREE.RingGeometry(rimRadius, radius, 28));
  innerWallGeo.rotateY(outSign > 0 ? -Math.PI / 2 : Math.PI / 2);
  const innerWall = new THREE.Mesh(innerWallGeo, tireMat);
  innerWall.position.x = -outSign * width * 0.5;
  wheelGroup.add(innerWall);

  if (isGrooved && grooveMat) {
    const grooveOffsets = [-width * 0.32, -width * 0.11, width * 0.11, width * 0.32];
    for (const gx of grooveOffsets) {
      const gGeo = track(new THREE.CylinderGeometry(radius + 0.003, radius + 0.003, width * 0.08, 24, 1, true));
      gGeo.rotateZ(Math.PI / 2);
      const gMesh = new THREE.Mesh(gGeo, grooveMat);
      gMesh.position.x = gx;
      wheelGroup.add(gMesh);
    }
  }

  // Hollow inner wheel barrel
  const barrelMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x0c0e12,
      metalness: 0.45,
      roughness: 0.55,
      side: THREE.DoubleSide,
    }),
  );
  const rimGeo = track(new THREE.CylinderGeometry(rimRadius, rimRadius, width * 0.96, 24, 1, true));
  rimGeo.rotateZ(Math.PI / 2);
  const rimMesh = new THREE.Mesh(rimGeo, barrelMat);
  wheelGroup.add(rimMesh);

  // Outer alloy rim lip on outward wheel face
  const lipGeo = track(new THREE.TorusGeometry(rimRadius, 0.015, 8, 28));
  lipGeo.rotateY(Math.PI / 2);
  const lipMesh = new THREE.Mesh(lipGeo, rimMat);
  lipMesh.position.x = outSign * width * 0.49;
  wheelGroup.add(lipMesh);

  // Split 5-spoke / Y-spoke alloy wheel face clearly visible on outward side
  const spokeGroup = new THREE.Group();
  spokeGroup.position.x = outSign * width * 0.36;
  const spokeGeo = track(new THREE.BoxGeometry(width * 0.14, rimRadius * 0.95, rimRadius * 0.11));
  for (let s = 0; s < 5; s++) {
    const baseAngle = (s * 2 * Math.PI) / 5;
    for (const forkOffset of [-0.14, 0.14]) {
      const spoke = new THREE.Mesh(spokeGeo, rimMat);
      spoke.rotation.x = baseAngle + forkOffset;
      spokeGroup.add(spoke);
    }
  }
  const hubGeo = track(new THREE.CylinderGeometry(rimRadius * 0.24, rimRadius * 0.24, width * 0.18, 16));
  hubGeo.rotateZ(Math.PI / 2);
  const hubMesh = new THREE.Mesh(hubGeo, rimMat);
  spokeGroup.add(hubMesh);

  const nutGeo = track(new THREE.CylinderGeometry(rimRadius * 0.11, rimRadius * 0.11, width * 0.22, 12));
  nutGeo.rotateZ(Math.PI / 2);
  const nutMesh = new THREE.Mesh(nutGeo, caliperMat);
  spokeGroup.add(nutMesh);
  wheelGroup.add(spokeGroup);

  // Slotted brake rotor & painted brake caliper recessed behind spokes
  const rotorRadius = rimRadius * 0.82;
  const rotorGeo = track(new THREE.CylinderGeometry(rotorRadius, rotorRadius, width * 0.10, 20));
  rotorGeo.rotateZ(Math.PI / 2);
  const rotorMesh = new THREE.Mesh(rotorGeo, rotorMat);
  rotorMesh.position.x = outSign * width * 0.12;
  wheelGroup.add(rotorMesh);

  const caliperGeo = track(new THREE.BoxGeometry(width * 0.20, rotorRadius * 0.42, rotorRadius * 0.34));
  const caliperMesh = new THREE.Mesh(caliperGeo, caliperMat);
  caliperMesh.position.set(outSign * width * 0.15, rotorRadius * 0.68, rotorRadius * 0.30);
  caliperMesh.rotation.x = -0.42;
  wheelGroup.add(caliperMesh);

  return wheelGroup;
}

export function createSuspensionArms(
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endY: number,
  endZ: number,
  mat: THREE.Material,
  track: TrackDisposable,
): THREE.Group {
  const group = new THREE.Group();
  const wishbones = [
    { y0: startY + 0.08, y1: endY + 0.08, zOff0: -0.12, zOff1: 0 },
    { y0: startY + 0.08, y1: endY + 0.08, zOff0: 0.12, zOff1: 0 },
    { y0: startY - 0.08, y1: endY - 0.08, zOff0: -0.14, zOff1: 0 },
    { y0: startY - 0.08, y1: endY - 0.08, zOff0: 0.14, zOff1: 0 },
    { y0: startY + 0.14, y1: endY - 0.06, zOff0: 0.05, zOff1: 0 },
  ];

  for (const wb of wishbones) {
    const p1 = new THREE.Vector3(startX, wb.y0, startZ + wb.zOff0);
    const p2 = new THREE.Vector3(endX, wb.y1, endZ + wb.zOff1);
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();
    const rodGeo = track(new THREE.CylinderGeometry(0.016, 0.016, len, 6));
    const rod = new THREE.Mesh(rodGeo, mat);
    rod.position.copy(p1).addScaledVector(dir, 0.5);
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    group.add(rod);
  }

  return group;
}
