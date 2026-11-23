import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BodySilhouette, CarClassId, HeadlightTint, LiveryConfig, RimFinish } from '../game/types';
import {
  createCarbonTexture,
  createContactShadowTexture,
  createLiveryTexture,
  createWindshieldBannerTexture,
} from './proceduralTextures';

import {
  REAL_WORLD_CAR_DIMENSIONS,
  REAL_WORLD_CAR_LENGTHS,
  getRealWorldCarDimensions,
  getRealWorldCarLength,
} from '../game/cars';
import { computeDefaultHoodMount, HoodMountOffset } from '../game/camera';

export {
  REAL_WORLD_CAR_DIMENSIONS,
  REAL_WORLD_CAR_LENGTHS,
  getRealWorldCarDimensions,
  getRealWorldCarLength,
};

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

export function createCarGlassMaterial(
  tintColor: THREE.ColorRepresentation = 0x0b1220,
  opacity = 0.46,
  name = 'GLASS',
): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    name,
    color: tintColor,
    roughness: 0.08,
    metalness: 0.14,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  mat.userData.isGlass = true;
  return mat;
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

interface ClosedWheelDesign {
  cabinStyle?: CabinStyle;
  cabinOffsetZ: number;
  cabinScaleW: number;
  cabinScaleH: number;
  cabinScaleL: number;
  noseHeightRatio: number;
  tailHeightRatio: number;
  widthScale: number;
  lengthScale: number;
  hoodStyle?: 'power-dome' | 'pontoon-channel' | 'standard';
  haunchScale?: number;
  grilleStyle:
    | 'none'
    | 'bmw-kidney'
    | 'bentley-matrix'
    | 'aston-wings'
    | 'mustang-pony'
    | 'merc-panamericana'
    | 'lexus-spindle'
    | 'porsche-992'
    | 'corvette-wedge'
    | 'ferrari-split'
    | 'mclaren-eye'
    | 'gtr-v'
    | 'audi-singleframe'
    | 'clio-hatch'
    | 'civic-fl5'
    | 'supra-nose'
    | 'alpine-arrow'
    | 'f80-blade'
    | 'w1-aero'
    | 'lmp-intake';
  headlightStyle:
    | 'blade'
    | 'vertical-stack'
    | 'round-911'
    | 'bentley-quad'
    | 'c-clamp'
    | 'fang'
    | 'twin-pod'
    | 'c-blade-rs01';
  sidepodStyle:
    | 'undercut'
    | 'venturi-tunnel'
    | 'louvered'
    | 'sculpted-intake'
    | 'clio-side-scoop'
    | 'clean-street';
  rearDeckStyle:
    | 'wingless-9x8'
    | 'split-499p'
    | 'swan-neck'
    | 'strut-race'
    | 'ducktail-rs'
    | 'active-lip'
    | 'deck-tunnel'
    | 'roof-spoiler-hatch'
    | 'w1-longtail';
  exhaustStyle: 'rear-dual' | 'rear-center' | 'top-exit' | 'side-exit' | 'clio-center-twin';
  sharkFinStyle: 'none' | 'tall-proto' | 'curved-lmh' | 'roof-scoop';
  caliperColor?: string;
}

const CLOSED_WHEEL_DESIGNS: Record<string, ClosedWheelDesign> = {
  // ================= WEC HYPERCAR / IMSA GTP (12 distinct chassis) =================
  'ferrari-499p': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.06,
    cabinScaleW: 0.94,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.56,
    tailHeightRatio: 0.80,
    widthScale: 1.0,
    lengthScale: 1.02,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'blade',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'split-499p',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'curved-lmh',
    caliperColor: '#ef4444',
  },
  'toyota-gr010': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.04,
    cabinScaleW: 1.0,
    cabinScaleH: 1.02,
    cabinScaleL: 1.02,
    noseHeightRatio: 0.62,
    tailHeightRatio: 0.84,
    widthScale: 1.02,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'twin-pod',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#facc15',
  },
  'porsche-963': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.05,
    cabinScaleW: 0.96,
    cabinScaleH: 0.98,
    cabinScaleL: 0.98,
    noseHeightRatio: 0.58,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.01,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'porsche-992',
    headlightStyle: 'twin-pod',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#84cc16',
  },
  'cadillac-vseries-r': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.02,
    cabinScaleW: 0.98,
    cabinScaleH: 1.0,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.82,
    widthScale: 1.01,
    lengthScale: 1.02,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#38bdf8',
  },
  'bmw-m-hybrid-v8': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.04,
    cabinScaleW: 0.96,
    cabinScaleH: 0.98,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.58,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.01,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'bmw-kidney',
    headlightStyle: 'fang',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#2563eb',
  },
  'acura-arx-06': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.06,
    cabinScaleW: 0.94,
    cabinScaleH: 0.96,
    cabinScaleL: 0.98,
    noseHeightRatio: 0.54,
    tailHeightRatio: 0.82,
    widthScale: 1.01,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'corvette-wedge',
    headlightStyle: 'blade',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'curved-lmh',
    caliperColor: '#ef4444',
  },
  'alpine-a424': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.04,
    cabinScaleW: 0.96,
    cabinScaleH: 0.98,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.56,
    tailHeightRatio: 0.80,
    widthScale: 1.0,
    lengthScale: 1.02,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'blade',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'curved-lmh',
    caliperColor: '#38bdf8',
  },
  'peugeot-9x8': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.08,
    cabinScaleW: 0.98,
    cabinScaleH: 0.92,
    cabinScaleL: 1.02,
    noseHeightRatio: 0.50,
    tailHeightRatio: 0.76,
    widthScale: 1.03,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'corvette-wedge',
    headlightStyle: 'fang',
    sidepodStyle: 'venturi-tunnel',
    rearDeckStyle: 'wingless-9x8',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'none',
    caliperColor: '#84cc16',
  },
  'aston-valkyrie-lmh': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.08,
    cabinScaleW: 0.88,
    cabinScaleH: 0.90,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.48,
    tailHeightRatio: 0.74,
    widthScale: 0.98,
    lengthScale: 1.01,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'aston-wings',
    headlightStyle: 'blade',
    sidepodStyle: 'venturi-tunnel',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'roof-scoop',
    caliperColor: '#a3e635',
  },
  'lamborghini-sc63': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.04,
    cabinScaleW: 0.98,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.54,
    tailHeightRatio: 0.82,
    widthScale: 1.01,
    lengthScale: 1.01,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'corvette-wedge',
    headlightStyle: 'fang',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'curved-lmh',
    caliperColor: '#84cc16',
  },
  'genesis-gmr-001': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.05,
    cabinScaleW: 0.96,
    cabinScaleH: 0.98,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.56,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.01,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'blade',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'curved-lmh',
    caliperColor: '#ea580c',
  },
  'glickenhaus-scg-007': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.06,
    cabinScaleW: 0.92,
    cabinScaleH: 0.98,
    cabinScaleL: 1.02,
    noseHeightRatio: 0.58,
    tailHeightRatio: 0.86,
    widthScale: 1.0,
    lengthScale: 1.02,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'twin-pod',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#dc2626',
  },

  // ================= LMP2 (Oreca 07 + Ligier JS P217) =================
  'oreca-07': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.03,
    cabinScaleW: 0.92,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#f97316',
  },
  'oreca-07-united': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.03,
    cabinScaleW: 0.92,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#f97316',
  },
  'oreca-07-europol': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.03,
    cabinScaleW: 0.92,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#eab308',
  },
  'oreca-07-ao': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.03,
    cabinScaleW: 0.92,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#7c3aed',
  },
  'oreca-07-united-autosports': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.03,
    cabinScaleW: 0.92,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#f97316',
  },
  'united-autosports': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.03,
    cabinScaleW: 0.92,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#f97316',
  },
  'oreca-07-inter-europol': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.03,
    cabinScaleW: 0.92,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#eab308',
  },
  'inter-europol': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.03,
    cabinScaleW: 0.92,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#eab308',
  },
  'oreca-07-ao-racing': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.03,
    cabinScaleW: 0.92,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#7c3aed',
  },
  'ao-racing': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.03,
    cabinScaleW: 0.92,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#7c3aed',
  },
  'oreca-07-af-corse': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.03,
    cabinScaleW: 0.92,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#dc2626',
  },
  'af-corse': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.03,
    cabinScaleW: 0.92,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#dc2626',
  },
  'oreca-07-cool': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.03,
    cabinScaleW: 0.92,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#0055b8',
  },
  'oreca-07-cool-racing': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.03,
    cabinScaleW: 0.92,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#0055b8',
  },
  'cool-racing': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.03,
    cabinScaleW: 0.92,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#0055b8',
  },
  'oreca-07-algarve': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.03,
    cabinScaleW: 0.92,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#ea580c',
  },
  'oreca-07-algarve-pro': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.03,
    cabinScaleW: 0.92,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#ea580c',
  },
  'algarve-pro': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.03,
    cabinScaleW: 0.92,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#ea580c',
  },
  'ligier-js-p217': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.04,
    cabinScaleW: 0.92,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.54,
    tailHeightRatio: 0.82,
    widthScale: 1.0,
    lengthScale: 1.01,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'lmp-intake',
    headlightStyle: 'vertical-stack',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'tall-proto',
    caliperColor: '#2563eb',
  },

  // ================= GTD Pro / LMGT3 (14 cars) =================
  'porsche-911-gt3-r': {
    cabinStyle: 'porsche-911',
    cabinOffsetZ: -0.16,
    cabinScaleW: 0.98,
    cabinScaleH: 1.0,
    cabinScaleL: 0.98,
    noseHeightRatio: 0.58,
    tailHeightRatio: 0.90,
    widthScale: 0.98,
    lengthScale: 0.96,
    haunchScale: 1.08,
    grilleStyle: 'porsche-992',
    headlightStyle: 'round-911',
    sidepodStyle: 'louvered',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#facc15',
  },
  'ferrari-296-gt3': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.08,
    cabinScaleW: 0.98,
    cabinScaleH: 0.92,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.84,
    widthScale: 1.02,
    lengthScale: 0.98,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'ferrari-split',
    headlightStyle: 'blade',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#ef4444',
  },
  'corvette-z06-gt3r': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.12,
    cabinScaleW: 0.96,
    cabinScaleH: 0.90,
    cabinScaleL: 0.94,
    noseHeightRatio: 0.50,
    tailHeightRatio: 0.86,
    widthScale: 1.03,
    lengthScale: 1.01,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'corvette-wedge',
    headlightStyle: 'blade',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#facc15',
  },
  'bmw-m4-gt3': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.24,
    cabinScaleW: 1.02,
    cabinScaleH: 1.06,
    cabinScaleL: 1.02,
    noseHeightRatio: 0.72,
    tailHeightRatio: 0.94,
    widthScale: 1.02,
    lengthScale: 1.03,
    hoodStyle: 'power-dome',
    grilleStyle: 'bmw-kidney',
    headlightStyle: 'fang',
    sidepodStyle: 'louvered',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'side-exit',
    sharkFinStyle: 'none',
    caliperColor: '#2563eb',
  },
  'ford-mustang-gt3': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.26,
    cabinScaleW: 1.02,
    cabinScaleH: 1.06,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.74,
    tailHeightRatio: 0.94,
    widthScale: 1.01,
    lengthScale: 1.03,
    hoodStyle: 'power-dome',
    grilleStyle: 'mustang-pony',
    headlightStyle: 'fang',
    sidepodStyle: 'louvered',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'side-exit',
    sharkFinStyle: 'none',
    caliperColor: '#ef4444',
  },
  'aston-vantage-gt3': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.22,
    cabinScaleW: 1.0,
    cabinScaleH: 0.98,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.64,
    tailHeightRatio: 0.88,
    widthScale: 1.02,
    lengthScale: 1.0,
    hoodStyle: 'power-dome',
    grilleStyle: 'aston-wings',
    headlightStyle: 'blade',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#a3e635',
  },
  'lamborghini-temerario-gt3': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.14,
    cabinScaleW: 0.98,
    cabinScaleH: 0.88,
    cabinScaleL: 0.98,
    noseHeightRatio: 0.48,
    tailHeightRatio: 0.84,
    widthScale: 1.03,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'corvette-wedge',
    headlightStyle: 'blade',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#84cc16',
  },
  'mercedes-amg-gt3': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.26,
    cabinScaleW: 1.0,
    cabinScaleH: 1.02,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.70,
    tailHeightRatio: 0.92,
    widthScale: 1.03,
    lengthScale: 1.02,
    hoodStyle: 'power-dome',
    grilleStyle: 'merc-panamericana',
    headlightStyle: 'blade',
    sidepodStyle: 'clean-street',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'side-exit',
    sharkFinStyle: 'none',
    caliperColor: '#eab308',
  },
  'lexus-rcf-gt3': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.22,
    cabinScaleW: 1.02,
    cabinScaleH: 1.06,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.72,
    tailHeightRatio: 0.94,
    widthScale: 1.01,
    lengthScale: 1.02,
    hoodStyle: 'power-dome',
    grilleStyle: 'lexus-spindle',
    headlightStyle: 'fang',
    sidepodStyle: 'louvered',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'side-exit',
    sharkFinStyle: 'none',
    caliperColor: '#f97316',
  },
  'mclaren-720s-gt3': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.12,
    cabinScaleW: 0.96,
    cabinScaleH: 0.88,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.48,
    tailHeightRatio: 0.84,
    widthScale: 1.02,
    lengthScale: 0.98,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'mclaren-eye',
    headlightStyle: 'c-clamp',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#f97316',
  },
  'renault-rs01-gt3': {
    cabinStyle: 'lmp-gt3-hybrid',
    cabinOffsetZ: 0.02,
    cabinScaleW: 0.94,
    cabinScaleH: 0.88,
    cabinScaleL: 1.02,
    noseHeightRatio: 0.46,
    tailHeightRatio: 0.82,
    widthScale: 1.04,
    lengthScale: 1.02,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'none',
    headlightStyle: 'c-blade-rs01',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#facc15',
  },
  'bentley-continental-gt3': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.22,
    cabinScaleW: 1.04,
    cabinScaleH: 1.06,
    cabinScaleL: 1.02,
    noseHeightRatio: 0.76,
    tailHeightRatio: 0.95,
    widthScale: 1.04,
    lengthScale: 1.04,
    hoodStyle: 'power-dome',
    haunchScale: 1.08,
    grilleStyle: 'bentley-matrix',
    headlightStyle: 'bentley-quad',
    sidepodStyle: 'louvered',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'side-exit',
    sharkFinStyle: 'none',
    caliperColor: '#22c55e',
  },
  'audi-r8-lms-gt3': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.06,
    cabinScaleW: 0.98,
    cabinScaleH: 0.90,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.84,
    widthScale: 1.02,
    lengthScale: 0.98,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'audi-singleframe',
    headlightStyle: 'blade',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#ef4444',
  },
  'acura-nsx-gt3': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.08,
    cabinScaleW: 0.98,
    cabinScaleH: 0.90,
    cabinScaleL: 0.98,
    noseHeightRatio: 0.50,
    tailHeightRatio: 0.84,
    widthScale: 1.02,
    lengthScale: 0.99,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'corvette-wedge',
    headlightStyle: 'blade',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#ef4444',
  },

  // ================= GT4 EUROPEAN / IMSA GS (8 cars) =================
  'porsche-cayman-gt4-rs': {
    cabinStyle: 'porsche-911',
    cabinOffsetZ: 0.02,
    cabinScaleW: 0.96,
    cabinScaleH: 0.94,
    cabinScaleL: 0.94,
    noseHeightRatio: 0.56,
    tailHeightRatio: 0.88,
    widthScale: 0.98,
    lengthScale: 0.95,
    haunchScale: 1.06,
    grilleStyle: 'porsche-992',
    headlightStyle: 'round-911',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'roof-scoop',
    caliperColor: '#0284c7',
  },
  'bmw-m4-gt4': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.22,
    cabinScaleW: 1.02,
    cabinScaleH: 1.05,
    cabinScaleL: 1.02,
    noseHeightRatio: 0.72,
    tailHeightRatio: 0.94,
    widthScale: 1.01,
    lengthScale: 1.02,
    hoodStyle: 'power-dome',
    grilleStyle: 'bmw-kidney',
    headlightStyle: 'fang',
    sidepodStyle: 'clean-street',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#0284c7',
  },
  'aston-vantage-gt4': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.20,
    cabinScaleW: 1.0,
    cabinScaleH: 0.98,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.64,
    tailHeightRatio: 0.88,
    widthScale: 1.01,
    lengthScale: 1.0,
    hoodStyle: 'power-dome',
    grilleStyle: 'aston-wings',
    headlightStyle: 'blade',
    sidepodStyle: 'clean-street',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#eab308',
  },
  'toyota-supra-gt4': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.16,
    cabinScaleW: 0.96,
    cabinScaleH: 0.96,
    cabinScaleL: 0.92,
    noseHeightRatio: 0.60,
    tailHeightRatio: 0.90,
    widthScale: 0.99,
    lengthScale: 0.96,
    grilleStyle: 'supra-nose',
    headlightStyle: 'blade',
    sidepodStyle: 'clean-street',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#ef4444',
  },
  'mclaren-artura-gt4': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.10,
    cabinScaleW: 0.96,
    cabinScaleH: 0.88,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.50,
    tailHeightRatio: 0.84,
    widthScale: 1.01,
    lengthScale: 0.98,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'mclaren-eye',
    headlightStyle: 'c-clamp',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#ea580c',
  },
  'mercedes-amg-gt4': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.24,
    cabinScaleW: 1.0,
    cabinScaleH: 1.0,
    cabinScaleL: 0.98,
    noseHeightRatio: 0.68,
    tailHeightRatio: 0.92,
    widthScale: 1.02,
    lengthScale: 1.01,
    hoodStyle: 'power-dome',
    grilleStyle: 'merc-panamericana',
    headlightStyle: 'blade',
    sidepodStyle: 'clean-street',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#eab308',
  },
  'alpine-a110-gt4': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.04,
    cabinScaleW: 0.94,
    cabinScaleH: 0.92,
    cabinScaleL: 0.92,
    noseHeightRatio: 0.54,
    tailHeightRatio: 0.86,
    widthScale: 0.96,
    lengthScale: 0.94,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'alpine-arrow',
    headlightStyle: 'twin-pod',
    sidepodStyle: 'clean-street',
    rearDeckStyle: 'swan-neck',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#2563eb',
  },
  'ford-mustang-gt4': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.24,
    cabinScaleW: 1.02,
    cabinScaleH: 1.06,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.74,
    tailHeightRatio: 0.94,
    widthScale: 1.01,
    lengthScale: 1.02,
    hoodStyle: 'power-dome',
    grilleStyle: 'mustang-pony',
    headlightStyle: 'fang',
    sidepodStyle: 'clean-street',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#ef4444',
  },

  // ================= PRODUCTION TRACK COUPES (7 cars) =================
  'bmw-m2-cs': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.16,
    cabinScaleW: 1.0,
    cabinScaleH: 1.06,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.70,
    tailHeightRatio: 0.92,
    widthScale: 0.98,
    lengthScale: 0.96,
    hoodStyle: 'power-dome',
    grilleStyle: 'bmw-kidney',
    headlightStyle: 'fang',
    sidepodStyle: 'clean-street',
    rearDeckStyle: 'ducktail-rs',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#2563eb',
  },
  'porsche-911-gt3-rs': {
    cabinStyle: 'porsche-911',
    cabinOffsetZ: -0.18,
    cabinScaleW: 0.96,
    cabinScaleH: 1.02,
    cabinScaleL: 1.0,
    noseHeightRatio: 0.58,
    tailHeightRatio: 0.90,
    widthScale: 0.99,
    lengthScale: 0.96,
    haunchScale: 1.10,
    grilleStyle: 'porsche-992',
    headlightStyle: 'round-911',
    sidepodStyle: 'louvered',
    rearDeckStyle: 'ducktail-rs',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#ef4444',
  },
  'corvette-z06-coupe': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.12,
    cabinScaleW: 0.96,
    cabinScaleH: 0.90,
    cabinScaleL: 0.94,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.88,
    widthScale: 1.01,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'corvette-wedge',
    headlightStyle: 'blade',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'ducktail-rs',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#facc15',
  },
  'nissan-gtr-nismo': {
    cabinStyle: 'grand-tourer',
    cabinOffsetZ: -0.18,
    cabinScaleW: 1.04,
    cabinScaleH: 1.12,
    cabinScaleL: 1.04,
    noseHeightRatio: 0.74,
    tailHeightRatio: 0.98,
    widthScale: 0.99,
    lengthScale: 1.01,
    hoodStyle: 'power-dome',
    grilleStyle: 'gtr-v',
    headlightStyle: 'blade',
    sidepodStyle: 'clean-street',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'rear-dual',
    sharkFinStyle: 'none',
    caliperColor: '#ef4444',
  },
  'renault-clio-v6': {
    cabinStyle: 'hatchback-clio',
    cabinOffsetZ: -0.06,
    cabinScaleW: 1.02,
    cabinScaleH: 1.08,
    cabinScaleL: 0.94,
    noseHeightRatio: 0.65,
    tailHeightRatio: 0.94,
    widthScale: 1.02,
    lengthScale: 0.90,
    haunchScale: 1.18,
    grilleStyle: 'clio-hatch',
    headlightStyle: 'twin-pod',
    sidepodStyle: 'clio-side-scoop',
    rearDeckStyle: 'roof-spoiler-hatch',
    exhaustStyle: 'clio-center-twin',
    sharkFinStyle: 'none',
    caliperColor: '#cbd5e1',
  },
  'honda-civic-type-r': {
    cabinStyle: 'hatchback-clio',
    cabinOffsetZ: -0.10,
    cabinScaleW: 1.0,
    cabinScaleH: 1.04,
    cabinScaleL: 1.02,
    noseHeightRatio: 0.66,
    tailHeightRatio: 0.92,
    widthScale: 1.0,
    lengthScale: 0.98,
    haunchScale: 1.06,
    grilleStyle: 'civic-fl5',
    headlightStyle: 'blade',
    sidepodStyle: 'clean-street',
    rearDeckStyle: 'strut-race',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#dc2626',
  },

  // ================= PRODUCTION SUPERCARS & HYPERCARS (8 cars) =================
  'ferrari-296-gtb': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.09,
    cabinScaleW: 0.96,
    cabinScaleH: 0.90,
    cabinScaleL: 0.94,
    noseHeightRatio: 0.52,
    tailHeightRatio: 0.86,
    widthScale: 1.0,
    lengthScale: 0.96,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'ferrari-split',
    headlightStyle: 'blade',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'active-lip',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#facc15',
  },
  'mclaren-750s': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.14,
    cabinScaleW: 0.94,
    cabinScaleH: 0.88,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.50,
    tailHeightRatio: 0.84,
    widthScale: 1.01,
    lengthScale: 0.98,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'mclaren-eye',
    headlightStyle: 'c-clamp',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'active-lip',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#ea580c',
  },
  'ferrari-sf90': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.08,
    cabinScaleW: 0.96,
    cabinScaleH: 0.90,
    cabinScaleL: 0.96,
    noseHeightRatio: 0.50,
    tailHeightRatio: 0.86,
    widthScale: 1.0,
    lengthScale: 0.99,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'ferrari-split',
    headlightStyle: 'c-clamp',
    sidepodStyle: 'sculpted-intake',
    rearDeckStyle: 'deck-tunnel',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#facc15',
  },
  'porsche-918-spyder': {
    cabinStyle: 'porsche-911',
    cabinOffsetZ: 0.08,
    cabinScaleW: 0.96,
    cabinScaleH: 0.86,
    cabinScaleL: 0.90,
    noseHeightRatio: 0.54,
    tailHeightRatio: 0.84,
    widthScale: 1.0,
    lengthScale: 0.99,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'porsche-992',
    headlightStyle: 'twin-pod',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'active-lip',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'none',
    caliperColor: '#84cc16',
  },
  'aston-valkyrie-road': {
    cabinStyle: 'proto-teardrop',
    cabinOffsetZ: 0.10,
    cabinScaleW: 0.82,
    cabinScaleH: 0.88,
    cabinScaleL: 0.94,
    noseHeightRatio: 0.48,
    tailHeightRatio: 0.68,
    widthScale: 0.95,
    lengthScale: 1.0,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'aston-wings',
    headlightStyle: 'blade',
    sidepodStyle: 'venturi-tunnel',
    rearDeckStyle: 'active-lip',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'roof-scoop',
    caliperColor: '#a3e635',
  },
  'ferrari-f80': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.08,
    cabinScaleW: 0.94,
    cabinScaleH: 0.86,
    cabinScaleL: 0.98,
    noseHeightRatio: 0.46,
    tailHeightRatio: 0.82,
    widthScale: 1.04,
    lengthScale: 1.01,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'f80-blade',
    headlightStyle: 'blade',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'active-lip',
    exhaustStyle: 'rear-center',
    sharkFinStyle: 'none',
    caliperColor: '#ef4444',
  },
  'mclaren-w1': {
    cabinStyle: 'mid-engine-buttress',
    cabinOffsetZ: 0.10,
    cabinScaleW: 0.94,
    cabinScaleH: 0.86,
    cabinScaleL: 0.98,
    noseHeightRatio: 0.46,
    tailHeightRatio: 0.82,
    widthScale: 1.04,
    lengthScale: 1.02,
    hoodStyle: 'pontoon-channel',
    grilleStyle: 'w1-aero',
    headlightStyle: 'c-clamp',
    sidepodStyle: 'undercut',
    rearDeckStyle: 'w1-longtail',
    exhaustStyle: 'top-exit',
    sharkFinStyle: 'roof-scoop',
    caliperColor: '#ea580c',
  },
};

let sharedShadowTex: THREE.CanvasTexture | null = null;
function getShadowTexture() {
  if (!sharedShadowTex) sharedShadowTex = createContactShadowTexture();
  return sharedShadowTex;
}

function getRimColorAndMetalness(finish: RimFinish, primaryColor: string): {
  color: string;
  metalness: number;
  roughness: number;
} {
  switch (finish) {
    case 'gloss-black':
      return { color: '#1e242e', metalness: 0.72, roughness: 0.18 };
    case 'silver':
      return { color: '#d4d8df', metalness: 0.9, roughness: 0.2 };
    case 'gold-bronze':
      return { color: '#c89b3c', metalness: 0.85, roughness: 0.24 };
    case 'white':
      return { color: '#f1f5f9', metalness: 0.25, roughness: 0.28 };
    case 'body-matched':
      return { color: primaryColor, metalness: 0.55, roughness: 0.24 };
  }
}

function getHeadlightHex(tint: HeadlightTint, classId: CarClassId): number {
  if (classId === CarClassId.GT3 && tint === 'crystal-white') {
    return 0xfacc15;
  }
  switch (tint) {
    case 'endurance-yellow':
      return 0xfacc15;
    case 'ice-blue':
      return 0x38bdf8;
    case 'crystal-white':
    default:
      return 0xf8fafc;
  }
}

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

function createAirfoilWingGeometry(
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

function createSharkFinGeometry(length = 1.05, height = 0.30): THREE.ExtrudeGeometry {
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

function createDiecastWheel(
  radius: number,
  width: number,
  rimMat: THREE.Material,
  tireMat: THREE.Material,
  caliperMat: THREE.Material,
  rotorMat: THREE.Material,
  outSign: -1 | 1,
  track: <T extends { dispose: () => void }>(item: T) => T,
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

function createSuspensionArms(
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endY: number,
  endZ: number,
  mat: THREE.Material,
  track: <T extends { dispose: () => void }>(item: T) => T,
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

/**
 * Builds a composite procedural 3D miniature car rig grounded at y = 0.
 * Spec/era-accurate shared open-wheel & LMP2 chassis + 53 distinct sculpted manufacturer silhouettes.
 */
export function buildDiecastCar(
  silhouette: BodySilhouette,
  classId: CarClassId,
  livery: LiveryConfig,
  maxAniso = 4,
  carId?: string,
): BuiltCarRig {
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  let liveryTex: THREE.Texture;
  if (livery.customTexture) {
    try {
      const loader = new THREE.TextureLoader();
      liveryTex = track(loader.load(livery.customTexture));
      liveryTex.colorSpace = THREE.SRGBColorSpace;
      liveryTex.wrapS = THREE.RepeatWrapping;
      liveryTex.wrapT = THREE.RepeatWrapping;
      liveryTex.anisotropy = maxAniso;
    } catch {
      liveryTex = track(createLiveryTexture(livery, classId, maxAniso));
    }
  } else {
    liveryTex = track(createLiveryTexture(livery, classId, maxAniso));
  }
  const bannerTex = track(createWindshieldBannerTexture(livery.windshieldBanner, livery.secondaryColor, maxAniso));
  const carbonTex = track(createCarbonTexture(maxAniso));

  const finishPreset = (() => {
    switch (livery.paintFinish ?? 'gloss') {
      case 'metallic':
        return { roughness: 0.22, metalness: 0.72, clearcoat: 0.9, clearcoatRoughness: 0.14 };
      case 'matte':
        return { roughness: 0.78, metalness: 0.06, clearcoat: 0.0, clearcoatRoughness: 0.85 };
      case 'satin':
        return { roughness: 0.44, metalness: 0.35, clearcoat: 0.28, clearcoatRoughness: 0.42 };
      case 'chrome':
        return { roughness: 0.08, metalness: 0.96, clearcoat: 1.0, clearcoatRoughness: 0.06 };
      case 'carbon-weave':
        return { roughness: 0.36, metalness: 0.32, clearcoat: 0.65, clearcoatRoughness: 0.22 };
      case 'pearlescent':
        return { roughness: 0.18, metalness: 0.52, clearcoat: 1.0, clearcoatRoughness: 0.08 };
      default:
        return { roughness: 0.24, metalness: 0.18, clearcoat: 1.0, clearcoatRoughness: 0.12 };
    }
  })();

  const bodyMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: livery.paintFinish === 'carbon-weave' ? carbonTex : liveryTex,
      roughness: finishPreset.roughness,
      metalness: finishPreset.metalness,
      clearcoat: finishPreset.clearcoat,
      clearcoatRoughness: finishPreset.clearcoatRoughness,
      iridescence: livery.paintFinish === 'pearlescent' ? 0.85 : 0,
      iridescenceIOR: 1.45,
    }),
  );

  const primaryMat = track(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(livery.primaryColor),
      roughness: finishPreset.roughness,
      metalness: finishPreset.metalness,
      clearcoat: finishPreset.clearcoat,
      clearcoatRoughness: finishPreset.clearcoatRoughness,
      iridescence: livery.paintFinish === 'pearlescent' ? 0.85 : 0,
    }),
  );

  const secondaryMat = track(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(livery.secondaryColor),
      roughness: Math.min(0.85, finishPreset.roughness + 0.04),
      metalness: finishPreset.metalness,
      clearcoat: finishPreset.clearcoat * 0.85,
    }),
  );

  const tertiaryMat = track(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(livery.tertiaryColor),
      roughness: 0.35,
      metalness: 0.3,
    }),
  );

  const carbonMat = track(
    new THREE.MeshStandardMaterial({
      map: carbonTex,
      roughness: 0.45,
      metalness: 0.25,
    }),
  );

  const matteTrimMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x15181e,
      roughness: 0.82,
      metalness: 0.1,
    }),
  );

  const canopySpec = (() => {
    switch (livery.windowTint ?? 'smoke') {
      case 'clear':
        return { hex: 0x1e293b, op: 0.52 };
      case 'dark':
        return { hex: 0x05080f, op: 0.94 };
      case 'mirror':
        return { hex: 0x38bdf8, op: 0.88 };
      default:
        return { hex: 0x0a111d, op: 0.84 };
    }
  })();
  const canopyMat = track(createCarGlassMaterial(canopySpec.hex, canopySpec.op, 'CANOPY_GLASS'));
  if (livery.windowTint === 'mirror') {
    canopyMat.metalness = 0.92;
    canopyMat.roughness = 0.06;
  }

  const tireMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x171a20,
      roughness: 0.88,
      metalness: 0.05,
    }),
  );

  const tireGrooveMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x07090c,
      roughness: 0.96,
      metalness: 0.02,
    }),
  );

  const chromeMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xd8dde4,
      metalness: 0.95,
      roughness: 0.12,
    }),
  );

  const rotorMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x3a3f48,
      emissive: 0xff3b00,
      emissiveIntensity: 0,
      metalness: 0.92,
      roughness: 0.25,
    }),
  );

  const rimInfo = getRimColorAndMetalness(livery.rimFinish, livery.primaryColor);
  const rimMat = track(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(rimInfo.color),
      metalness: rimInfo.metalness,
      roughness: rimInfo.roughness,
    }),
  );

  const bannerMat = track(
    new THREE.MeshStandardMaterial({
      map: bannerTex,
      roughness: 0.3,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );

  const headlightHex = getHeadlightHex(livery.headlightTint, classId);
  const headlightMats: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 2; i++) {
    const hm = track(
      new THREE.MeshStandardMaterial({
        color: headlightHex,
        emissive: headlightHex,
        emissiveIntensity: 1.4,
        roughness: 0.2,
      }),
    );
    headlightMats.push(hm);
  }

  const brakeLightMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.75,
      roughness: 0.22,
    }),
  );

  const rainLightMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xff1e1e,
      emissive: 0xff1e1e,
      emissiveIntensity: 0.3,
      roughness: 0.2,
    }),
  );

  // Contact shadow disc
  const shadowGeo = track(new THREE.PlaneGeometry(2.7, 4.5));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = track(
    new THREE.MeshBasicMaterial({
      map: getShadowTexture(),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.y = 0.025;
  root.add(shadowMesh);

  // Archetype flags
  const isF1_2026 = classId === CarClassId.F1_2026;
  const isF1_2021 = classId === CarClassId.F1_2021;
  const isF1_2005 = classId === CarClassId.F1_2005;
  const isFormulaE = classId === CarClassId.FORMULA_E;
  const isFormula = isF1_2026 || isF1_2021 || isF1_2005 || isFormulaE || silhouette === 'formula';
  const isOpenWheel = isF1_2026 || isF1_2021 || isF1_2005;

  const isHypercar = classId === CarClassId.HYPERCAR_GTP;
  const isLmp2 = classId === CarClassId.LMP2 || silhouette === 'lmp2';
  const isProto = isHypercar || isLmp2;
  const isGT3 = classId === CarClassId.GT3 || silhouette === 'gt';
  const isGT4 = classId === CarClassId.GT4;
  const isStreetCar =
    classId === CarClassId.TRACK_COUPE ||
    classId === CarClassId.SUPERCAR ||
    silhouette === 'coupe' ||
    silhouette === 'supercar';

  const design: ClosedWheelDesign =
    CLOSED_WHEEL_DESIGNS[carId ?? ''] ??
    (carId && (carId.includes('oreca') || carId.includes('lmp2')) ? CLOSED_WHEEL_DESIGNS['oreca-07'] : undefined) ?? {
    cabinStyle: isProto
      ? 'proto-teardrop'
      : isGT3 || isGT4
      ? 'grand-tourer'
      : isStreetCar
      ? 'mid-engine-buttress'
      : 'grand-tourer',
    cabinOffsetZ: isProto ? 0.04 : -0.1,
    cabinScaleW: 0.96,
    cabinScaleH: 0.96,
    cabinScaleL: 1.0,
    noseHeightRatio: isLmp2 ? 0.54 : 0.62,
    tailHeightRatio: isStreetCar ? 0.90 : 0.84,
    widthScale: 1.0,
    lengthScale: 1.0,
    grilleStyle: isProto ? 'lmp-intake' : 'none',
    headlightStyle: 'blade',
    sidepodStyle: isProto ? 'undercut' : 'clean-street',
    rearDeckStyle: isStreetCar ? 'active-lip' : 'strut-race',
    exhaustStyle: isStreetCar ? 'rear-dual' : 'top-exit',
    sharkFinStyle: isProto ? 'tall-proto' : 'none',
  };

  const caliperColorHex =
    livery.caliperColor ||
    design.caliperColor ||
    (isGT4 ? '#0284c7' : isGT3 ? '#ef4444' : isProto ? '#facc15' : '#dc2626');
  const caliperMat = track(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(caliperColorHex),
      roughness: 0.32,
      metalness: 0.45,
    }),
  );

  const realLength = getRealWorldCarLength(carId, classId);
  const baseClosedLen = isProto ? 4.88 : 4.62;
  const length = isFormula
    ? isFormulaE
      ? 3.70
      : 3.92
    : realLength * (design.lengthScale || 1);
  const width = (isFormula ? 1.88 : isGT3 ? 1.96 : isProto ? 1.99 : 1.88) * (isFormula ? 1 : design.widthScale);
  const wheelRadius = isFormula ? 0.36 : isProto || classId === CarClassId.SUPERCAR ? 0.315 : 0.325;
  const wheelWidth = isFormula ? 0.38 : 0.26;
  const wheelBaseZ = isFormula ? 1.26 : length * 0.285;
  const trackHalfX = isFormula ? 0.86 : Math.min(0.79, width * 0.445 - wheelWidth * 0.5);
  const formulaLengthStretch = isFormula ? realLength / (isFormulaE ? 3.85 : 3.92) : 1.0;
  const closedLengthScale = isFormula ? 1.0 : length / baseClosedLen;

  let frontWingFlap: THREE.Mesh | null = null;
  let rearWingFlap: THREE.Mesh | null = null;

  if (isFormula) {
    // Slim tapered carbon floor plank strictly within sidepod footprint (never clips open wheels)
    const plankGeo = track(new THREE.BoxGeometry(width * 0.56, 0.045, 2.05));
    const plankMesh = new THREE.Mesh(plankGeo, matteTrimMat);
    plankMesh.position.set(0, 0.145, -0.45);
    plankMesh.castShadow = true;
    bodyGroup.add(plankMesh);

    if (isFormulaE) {
      // ================= FORMULA E GEN3 EVO SILHOUETTE =================
      const deltaShape = new THREE.Shape();
      deltaShape.moveTo(-0.28, -1.60);
      deltaShape.lineTo(-0.62, -0.60);
      deltaShape.lineTo(-0.62, 0.35);
      deltaShape.lineTo(-0.06, 1.85);
      deltaShape.lineTo(0.06, 1.85);
      deltaShape.lineTo(0.62, 0.35);
      deltaShape.lineTo(0.62, -0.60);
      deltaShape.lineTo(0.28, -1.60);
      deltaShape.closePath();

      const rawFeHullGeo = track(
        new THREE.ExtrudeGeometry(deltaShape, {
          depth: 0.32,
          bevelEnabled: true,
          bevelThickness: 0.06,
          bevelSize: 0.05,
          bevelSegments: 2,
        }),
      );
      rawFeHullGeo.rotateX(Math.PI / 2);
      const feHullGeo = track(applySixZoneCarUVs(rawFeHullGeo));
      const feHullMesh = new THREE.Mesh(feHullGeo, bodyMat);
      feHullMesh.position.y = 0.58;
      feHullMesh.castShadow = true;
      bodyGroup.add(feHullMesh);

      // Enclosed front wheel fairings (GEN3 Evo regulation shrouds)
      const fwFairingGeo = track(new THREE.BoxGeometry(0.36, 0.28, 0.84));
      for (const sx of [-trackHalfX, trackHalfX]) {
        const fairing = new THREE.Mesh(fwFairingGeo, secondaryMat);
        fairing.position.set(sx * 0.98, 0.42, wheelBaseZ + 0.12);
        fairing.rotation.y = sx < 0 ? 0.08 : -0.08;
        fairing.castShadow = true;
        bodyGroup.add(fairing);
      }

      // Cockpit Halo + Front Center Stem (strictly behind z = +0.58 so Hood Cam at z = +0.72 never clips)
      const haloCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.24, 0.72, -0.05),
        new THREE.Vector3(-0.18, 0.85, 0.24),
        new THREE.Vector3(0, 0.86, 0.46),
        new THREE.Vector3(0.18, 0.85, 0.24),
        new THREE.Vector3(0.24, 0.72, -0.05),
      ]);
      const haloGeo = track(new THREE.TubeGeometry(haloCurve, 16, 0.028, 8, false));
      const haloMesh = new THREE.Mesh(haloGeo, matteTrimMat);
      bodyGroup.add(haloMesh);

      const feStemCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.86, 0.46),
        new THREE.Vector3(0, 0.72, 0.51),
        new THREE.Vector3(0, 0.54, 0.54),
      ]);
      const feStemMesh = new THREE.Mesh(track(new THREE.TubeGeometry(feStemCurve, 6, 0.026, 8, false)), matteTrimMat);
      bodyGroup.add(feStemMesh);

      const helmetGeo = track(new THREE.SphereGeometry(0.17, 14, 12));
      const helmet = new THREE.Mesh(helmetGeo, tertiaryMat);
      helmet.position.set(0, 0.74, 0.12);
      bodyGroup.add(helmet);

      // Sculpted Gen3 Evo rear wheel aero pods & winglets
      const wingletProfile = new THREE.Shape();
      wingletProfile.moveTo(-0.28, 0.0);
      wingletProfile.lineTo(0.24, 0.0);
      wingletProfile.lineTo(0.14, 0.20);
      wingletProfile.lineTo(-0.24, 0.30);
      wingletProfile.closePath();
      const wingletGeo = track(
        new THREE.ExtrudeGeometry(wingletProfile, {
          depth: 0.08,
          bevelEnabled: true,
          bevelThickness: 0.02,
          bevelSize: 0.015,
          bevelSegments: 2,
        }),
      );
      wingletGeo.rotateY(Math.PI / 2);
      for (const sx of [-0.62, 0.54]) {
        const winglet = new THREE.Mesh(wingletGeo, secondaryMat);
        winglet.position.set(sx, 0.56, -1.52);
        winglet.castShadow = true;
        bodyGroup.add(winglet);
      }

      [-0.14, 0.14].forEach((hx, idx) => {
        const hlGeo = track(new THREE.BoxGeometry(0.09, 0.045, 0.05));
        const hl = new THREE.Mesh(hlGeo, headlightMats[idx]);
        hl.position.set(hx, 0.35, 1.80);
        bodyGroup.add(hl);
      });
    } else {
      // ================= F1 SPEC ERA SILHOUETTES (2026 / 2021 / 2005) =================
      const hullShape = new THREE.Shape();
      hullShape.moveTo(-0.30, -1.65);
      hullShape.lineTo(isF1_2021 ? -0.68 : -0.58, -0.65);
      hullShape.lineTo(isF1_2021 ? -0.68 : -0.58, 0.42);
      hullShape.lineTo(isF1_2005 ? -0.18 : -0.22, 1.74);
      hullShape.lineTo(isF1_2005 ? 0.18 : 0.22, 1.74);
      hullShape.lineTo(isF1_2021 ? 0.68 : 0.58, 0.42);
      hullShape.lineTo(isF1_2021 ? 0.68 : 0.58, -0.65);
      hullShape.lineTo(0.30, -1.65);
      hullShape.closePath();

      const rawHullGeo = track(
        new THREE.ExtrudeGeometry(hullShape, {
          depth: 0.34,
          bevelEnabled: true,
          bevelThickness: 0.07,
          bevelSize: 0.06,
          bevelSegments: 2,
        }),
      );
      rawHullGeo.rotateX(Math.PI / 2);
      const hullGeo = track(applySixZoneCarUVs(rawHullGeo));
      const hullMesh = new THREE.Mesh(hullGeo, bodyMat);
      hullMesh.position.y = 0.60;
      hullMesh.castShadow = true;
      bodyGroup.add(hullMesh);

      // Sculpted tapered F1 roll-hoop airbox + engine cover shark fin
      const engineCoverProfile = new THREE.Shape();
      engineCoverProfile.moveTo(-0.08, 0.0);
      engineCoverProfile.lineTo(1.32, 0.0);
      engineCoverProfile.lineTo(1.36, 0.14);
      engineCoverProfile.lineTo(0.55, 0.26);
      engineCoverProfile.lineTo(0.06, 0.42);
      engineCoverProfile.lineTo(-0.08, 0.36);
      engineCoverProfile.closePath();
      const airboxGeo = track(
        new THREE.ExtrudeGeometry(engineCoverProfile, {
          depth: 0.18,
          bevelEnabled: true,
          bevelThickness: 0.04,
          bevelSize: 0.03,
          bevelSegments: 2,
        }),
      );
      airboxGeo.rotateY(Math.PI / 2);
      airboxGeo.translate(-0.09, 0.52, -0.12);
      const airboxMesh = new THREE.Mesh(airboxGeo, secondaryMat);
      airboxMesh.castShadow = true;
      bodyGroup.add(airboxMesh);

      // Recessed dark airbox intake above driver helmet
      const scoopMouthGeo = track(new THREE.BoxGeometry(0.16, 0.12, 0.06));
      const scoopMouth = new THREE.Mesh(scoopMouthGeo, matteTrimMat);
      scoopMouth.position.set(0, 0.85, -0.02);
      bodyGroup.add(scoopMouth);

      const helmetGeo = track(new THREE.SphereGeometry(0.18, 16, 14));
      const helmet = new THREE.Mesh(helmetGeo, tertiaryMat);
      helmet.position.set(0, 0.74, 0.14);
      bodyGroup.add(helmet);

      if (isF1_2005) {
        const coamingGeo = track(new THREE.BoxGeometry(0.38, 0.16, 0.52));
        const coaming = new THREE.Mesh(coamingGeo, secondaryMat);
        coaming.position.set(0, 0.73, -0.08);
        bodyGroup.add(coaming);

        for (const sx of [-0.46, 0.46]) {
          const chimneyGeo = track(new THREE.CylinderGeometry(0.04, 0.06, 0.24, 8));
          const chimney = new THREE.Mesh(chimneyGeo, matteTrimMat);
          chimney.position.set(sx, 0.73, -0.32);
          bodyGroup.add(chimney);
        }
      } else {
        const haloMat = livery.carbonHood ? carbonMat : matteTrimMat;
        const haloCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(-0.24, 0.71, -0.05),
          new THREE.Vector3(-0.18, 0.84, 0.24),
          new THREE.Vector3(0, 0.85, 0.46),
          new THREE.Vector3(0.18, 0.84, 0.24),
          new THREE.Vector3(0.24, 0.71, -0.05),
        ]);
        const haloGeo = track(new THREE.TubeGeometry(haloCurve, 16, 0.028, 8, false));
        const haloMesh = new THREE.Mesh(haloGeo, haloMat);
        bodyGroup.add(haloMesh);

        const stemCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0.85, 0.46),
          new THREE.Vector3(0, 0.72, 0.51),
          new THREE.Vector3(0, 0.56, 0.54),
        ]);
        const stemMesh = new THREE.Mesh(track(new THREE.TubeGeometry(stemCurve, 6, 0.026, 8, false)), haloMat);
        bodyGroup.add(stemMesh);
      }

      if (isF1_2021) {
        const bbGeo = track(new THREE.BoxGeometry(0.05, 0.34, 0.62));
        const floorWingGeo = track(new THREE.BoxGeometry(0.16, 0.04, 1.32));
        for (const sx of [-0.64, 0.64]) {
          const bb = new THREE.Mesh(bbGeo, carbonMat);
          bb.position.set(sx * 0.92, 0.40, 0.52);
          bb.rotation.y = sx < 0 ? 0.14 : -0.14;
          bodyGroup.add(bb);

          const fWing = new THREE.Mesh(floorWingGeo, carbonMat);
          fWing.position.set(sx * 1.15, 0.21, -0.2);
          bodyGroup.add(fWing);
        }
      }

      // Front Wing
      const fwWidth = isF1_2005 ? 1.72 : isF1_2026 ? 1.82 : 1.94;
      const fwGeo = track(createAirfoilWingGeometry(fwWidth, 0.34, 0.048));
      const fwMat = livery.carbonSplitter ? carbonMat : secondaryMat;
      const fwMesh = new THREE.Mesh(fwGeo, fwMat);
      fwMesh.position.set(0, 0.21, 1.74);
      fwMesh.castShadow = true;
      bodyGroup.add(fwMesh);

      if (isF1_2026) {
        const fwFlapGeo = track(createAirfoilWingGeometry(fwWidth * 0.92, 0.17, 0.036));
        frontWingFlap = new THREE.Mesh(fwFlapGeo, tertiaryMat);
        frontWingFlap.position.set(0, 0.27, 1.66);
        frontWingFlap.rotation.x = 0.20;
        bodyGroup.add(frontWingFlap);
      }

      const fweGeo = track(new THREE.BoxGeometry(0.04, 0.20, 0.42));
      for (const sx of [-fwWidth * 0.5, fwWidth * 0.5]) {
        const fwe = new THREE.Mesh(fweGeo, tertiaryMat);
        fwe.position.set(sx, 0.27, 1.74);
        bodyGroup.add(fwe);
      }

      // Rear Wing
      const rwWidth = isF1_2005 ? 0.96 : isF1_2026 ? 1.14 : 1.24;
      const rwHeight = isF1_2005 ? 1.08 : 0.96;
      const wingMat = livery.carbonWing ? carbonMat : secondaryMat;

      const rwStrutGeo = track(new THREE.BoxGeometry(0.04, isF1_2005 ? 0.64 : 0.54, 0.24));
      for (const sx of [-0.38, 0.38]) {
        const strut = new THREE.Mesh(rwStrutGeo, matteTrimMat);
        strut.position.set(sx, (rwHeight + 0.44) * 0.5, -1.66);
        bodyGroup.add(strut);
      }

      const rwMainGeo = track(createAirfoilWingGeometry(rwWidth, 0.28, 0.052));
      const rwMain = new THREE.Mesh(rwMainGeo, wingMat);
      rwMain.position.set(0, rwHeight, -1.68);
      rwMain.castShadow = true;
      bodyGroup.add(rwMain);

      const rwFlapGeo = track(createAirfoilWingGeometry(rwWidth * 0.96, 0.20, 0.040));
      rearWingFlap = new THREE.Mesh(rwFlapGeo, tertiaryMat);
      rearWingFlap.position.set(0, rwHeight + 0.08, -1.75);
      rearWingFlap.rotation.x = isF1_2026 ? 0.36 : 0.32;
      bodyGroup.add(rearWingFlap);

      const rweGeo = track(new THREE.BoxGeometry(0.036, 0.34, 0.40));
      for (const sx of [-rwWidth * 0.5, rwWidth * 0.5]) {
        const rwe = new THREE.Mesh(rweGeo, secondaryMat);
        rwe.position.set(sx, rwHeight, -1.68);
        bodyGroup.add(rwe);
      }

      const rainGeo = track(new THREE.BoxGeometry(0.14, 0.11, 0.05));
      const rainLight = new THREE.Mesh(rainGeo, brakeLightMat);
      rainLight.position.set(0, 0.40, -1.82);
      bodyGroup.add(rainLight);

      const hlGeo = track(new THREE.BoxGeometry(0.10, 0.05, 0.05));
      [-0.18, 0.18].forEach((hx, idx) => {
        const hl = new THREE.Mesh(hlGeo, headlightMats[idx]);
        hl.position.set(hx, 0.33, 1.82);
        bodyGroup.add(hl);
      });
    }
  } else {
    // ================= UNIFIED SCULPTED CLOSED-WHEEL CARS (53 CHASSIS) =================
    const bodyWidth = width * (isProto ? 0.97 : 1.01);
    const bodyLen = length * 0.94;
    const cabinStyle: CabinStyle =
      design.cabinStyle ?? (isProto ? 'proto-teardrop' : isStreetCar ? 'grand-tourer' : 'mid-engine-buttress');

    // 1. Unified Parametric Hull with Recessed Wheel Wells & Swept Fenders
    const hullStations = buildHullStations(
      bodyLen,
      bodyWidth,
      wheelBaseZ,
      wheelRadius,
      trackHalfX,
      wheelWidth,
      { ...design, cabinStyle },
      isProto,
      isStreetCar,
    );
    const bodyGeo = track(createLoftedHullGeometry(hullStations, bodyWidth, bodyLen));
    const mainBody = new THREE.Mesh(bodyGeo, bodyMat);
    mainBody.castShadow = true;
    mainBody.receiveShadow = true;
    bodyGroup.add(mainBody);

    // Helper to query exact lofted hull surface height/width at any z
    const sampleHullAtZ = (zQuery: number): HullStationSpec => {
      for (let i = 0; i < hullStations.length - 1; i++) {
        const a = hullStations[i];
        const b = hullStations[i + 1];
        if (zQuery >= a.z && zQuery <= b.z) {
          const f = (zQuery - a.z) / Math.max(1e-4, b.z - a.z);
          return {
            z: zQuery,
            halfW: a.halfW + (b.halfW - a.halfW) * f,
            xInnerFloor: a.xInnerFloor + (b.xInnerFloor - a.xInnerFloor) * f,
            yFloor: a.yFloor + (b.yFloor - a.yFloor) * f,
            ySill: a.ySill + (b.ySill - a.ySill) * f,
            yBelt: a.yBelt + (b.yBelt - a.yBelt) * f,
            wBelt: a.wBelt + (b.wBelt - a.wBelt) * f,
            yCrown: a.yCrown + (b.yCrown - a.yCrown) * f,
            wCrown: a.wCrown + (b.wCrown - a.wCrown) * f,
          };
        }
      }
      return zQuery <= hullStations[0].z ? hullStations[0] : hullStations[hullStations.length - 1];
    };

    // Dark recessed wheel-arch inner backing disc strictly inboard of tire (never pokes through sloped hood)
    const backingGeo = track(new THREE.CircleGeometry(wheelRadius * 0.92, 18));
    const linerBackMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x0b0d12,
        roughness: 0.94,
        metalness: 0.04,
        side: THREE.DoubleSide,
      }),
    );
    const linerCenterX = Math.max(0.40, trackHalfX - wheelWidth * 0.5 - 0.018);
    for (const sz of [-wheelBaseZ, wheelBaseZ]) {
      for (const side of [-1, 1]) {
        const backing = new THREE.Mesh(backingGeo, linerBackMat);
        backing.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        backing.position.set(side * linerCenterX, wheelRadius, sz);
        bodyGroup.add(backing);
      }
    }

    // 2. Clean Underbody Chassis Tray (strictly inside track width between axles, never clips tires)
    const trayGeo = track(new THREE.BoxGeometry(trackHalfX * 1.44, 0.055, bodyLen * 0.90));
    const trayMesh = new THREE.Mesh(trayGeo, matteTrimMat);
    trayMesh.position.set(0, 0.145, 0);
    bodyGroup.add(trayMesh);

    // 3. Two-Layer Framed Cockpit: Sleek Thin Painted Roof Skin + Flush Pillars + Recessed Tinted Glass
    const cabinStations = buildCabinStations(
      cabinStyle,
      design.cabinOffsetZ,
      design.cabinScaleW,
      design.cabinScaleH,
      design.cabinScaleL,
      isProto,
    );

    // Thin painted roof cap covering from rear header (st[1]) to windshield header (st[N-2])
    const roofStations = cabinStations.length >= 4 ? cabinStations.slice(1, cabinStations.length - 1) : cabinStations;
    const roofShellMat = livery.carbonHood ? carbonMat : primaryMat;
    if (roofStations.length >= 2) {
      const roofCapStations = roofStations.map((st) => ({
        ...st,
        yBase: st.yRoof - 0.008,
        wBase: st.wRoof * 1.005,
        yRoof: st.yRoof + 0.006,
      }));
      const roofCapGeo = track(createLoftedGreenhouseGeometry(roofCapStations, bodyWidth, bodyLen, 0));
      const roofCapMesh = new THREE.Mesh(roofCapGeo, roofShellMat);
      roofCapMesh.castShadow = true;
      bodyGroup.add(roofCapMesh);
    }

    // Flush A-pillars & C-pillars seamlessly meeting roof cap corners at st[1] and st[N-2]
    if (cabinStations.length >= 4) {
      const stFrontBtm = cabinStations[cabinStations.length - 1];
      const stFrontTop = cabinStations[cabinStations.length - 2];
      const stRearBtm = cabinStations[0];
      const stRearTop = cabinStations[1];

      for (const sideSign of [-1, 1]) {
        const aP0 = new THREE.Vector3(sideSign * stFrontBtm.wBase * 0.91, stFrontBtm.yBase, stFrontBtm.z);
        const aP1 = new THREE.Vector3(sideSign * stFrontTop.wRoof * 0.97, stFrontTop.yRoof + 0.004, stFrontTop.z);
        const aDir = new THREE.Vector3().subVectors(aP1, aP0);
        const aLen = aDir.length();
        const aPillar = new THREE.Mesh(track(new THREE.BoxGeometry(0.028, aLen, 0.034)), roofShellMat);
        aPillar.position.copy(aP0).addScaledVector(aDir, 0.5);
        aPillar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), aDir.normalize());
        bodyGroup.add(aPillar);

        const cP0 = new THREE.Vector3(sideSign * stRearBtm.wBase * 0.91, stRearBtm.yBase, stRearBtm.z);
        const cP1 = new THREE.Vector3(sideSign * stRearTop.wRoof * 0.97, stRearTop.yRoof + 0.004, stRearTop.z);
        const cDir = new THREE.Vector3().subVectors(cP1, cP0);
        const cLen = cDir.length();
        const cPillar = new THREE.Mesh(
          track(new THREE.BoxGeometry(cabinStyle === 'mid-engine-buttress' ? 0.068 : 0.042, cLen, 0.065)),
          roofShellMat,
        );
        cPillar.position.copy(cP0).addScaledVector(cDir, 0.5);
        cPillar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), cDir.normalize());
        bodyGroup.add(cPillar);
      }
    }

    // Flush Recessed Dark-Tinted Glass Greenhouse
    const glassGeo = track(createLoftedGreenhouseGeometry(cabinStations, bodyWidth, bodyLen, 0.012));
    const glassMesh = new THREE.Mesh(glassGeo, canopyMat);
    glassMesh.castShadow = true;
    bodyGroup.add(glassMesh);

    // Side Aero Wing Mirrors (tucked closely near A-pillar base)
    if (!isProto && cabinStations.length >= 2) {
      const mirrorZ = cabinStations[cabinStations.length - 1].z - 0.14;
      const mirrorBaseHull = sampleHullAtZ(mirrorZ);
      const mirrorX = mirrorBaseHull.wBelt + 0.055;
      const mirrorY = mirrorBaseHull.yBelt + 0.055;
      for (const sx of [-1, 1]) {
        const stalk = new THREE.Mesh(track(new THREE.BoxGeometry(0.07, 0.02, 0.03)), matteTrimMat);
        stalk.position.set(sx * (mirrorBaseHull.wBelt + 0.02), mirrorY - 0.015, mirrorZ);
        stalk.rotation.z = sx * 0.25;
        bodyGroup.add(stalk);

        const cap = new THREE.Mesh(track(new THREE.BoxGeometry(0.095, 0.048, 0.07)), secondaryMat);
        cap.position.set(sx * mirrorX, mirrorY, mirrorZ - 0.01);
        cap.rotation.y = sx * -0.18;
        cap.castShadow = true;
        bodyGroup.add(cap);
      }
    }

    // 4. Flush Integrated Brand Grilles (strictly bounded below yCrown & inside nose width)
    const noseSt = sampleHullAtZ(bodyLen * 0.482);
    const noseFasciaZ = bodyLen * 0.484;
    const maxGrilleW = Math.max(0.44, noseSt.wBelt * 1.18);
    const maxGrilleH = Math.max(0.055, noseSt.yCrown - noseSt.ySill - 0.03);
    const noseMidY = noseSt.ySill + Math.min(maxGrilleH * 0.55 + 0.015, (noseSt.yCrown - noseSt.ySill) * 0.48);

    if (design.grilleStyle === 'bentley-matrix') {
      const gw = Math.min(0.84, maxGrilleW);
      const gh = Math.min(0.16, maxGrilleH);
      const bezel = new THREE.Mesh(track(new THREE.BoxGeometry(gw, gh, 0.04)), chromeMat);
      bezel.position.set(0, noseMidY, noseFasciaZ - 0.014);
      bezel.rotation.x = 0.18;
      bodyGroup.add(bezel);
      const meshInner = new THREE.Mesh(track(new THREE.BoxGeometry(gw * 0.90, gh * 0.76, 0.045)), matteTrimMat);
      meshInner.position.set(0, noseMidY, noseFasciaZ - 0.008);
      meshInner.rotation.x = 0.18;
      bodyGroup.add(meshInner);
    } else if (design.grilleStyle === 'bmw-kidney') {
      const gh = Math.min(0.14, maxGrilleH);
      for (const gx of [-0.14, 0.14]) {
        const trim = new THREE.Mesh(track(new THREE.BoxGeometry(0.22, gh, 0.04)), chromeMat);
        trim.position.set(gx, noseMidY, noseFasciaZ - 0.014);
        trim.rotation.x = 0.16;
        bodyGroup.add(trim);
        const k = new THREE.Mesh(track(new THREE.BoxGeometry(0.18, gh * 0.78, 0.045)), matteTrimMat);
        k.position.set(gx, noseMidY, noseFasciaZ - 0.008);
        k.rotation.x = 0.16;
        bodyGroup.add(k);
      }
    } else if (design.grilleStyle === 'merc-panamericana') {
      const gw = Math.min(0.76, maxGrilleW);
      const gh = Math.min(0.13, maxGrilleH);
      const frame = new THREE.Mesh(track(new THREE.BoxGeometry(gw, gh, 0.04)), matteTrimMat);
      frame.position.set(0, noseMidY, noseFasciaZ - 0.012);
      frame.rotation.x = 0.18;
      bodyGroup.add(frame);
      for (let gx = -gw * 0.38; gx <= gw * 0.38; gx += 0.11) {
        const slat = new THREE.Mesh(track(new THREE.BoxGeometry(0.020, gh * 0.84, 0.045)), chromeMat);
        slat.position.set(gx, noseMidY, noseFasciaZ - 0.006);
        slat.rotation.x = 0.18;
        bodyGroup.add(slat);
      }
    } else if (design.grilleStyle === 'audi-singleframe') {
      const gw = Math.min(0.74, maxGrilleW);
      const gh = Math.min(0.15, maxGrilleH);
      const frame = new THREE.Mesh(track(new THREE.BoxGeometry(gw, gh, 0.04)), matteTrimMat);
      frame.position.set(0, noseMidY, noseFasciaZ - 0.012);
      frame.rotation.x = 0.16;
      bodyGroup.add(frame);
      const ringBar = new THREE.Mesh(track(new THREE.BoxGeometry(0.32, 0.026, 0.045)), chromeMat);
      ringBar.position.set(0, noseMidY + gh * 0.18, noseFasciaZ - 0.006);
      bodyGroup.add(ringBar);
    } else if (design.grilleStyle === 'aston-wings') {
      const gw = Math.min(0.76, maxGrilleW);
      const gh = Math.min(0.08, maxGrilleH * 0.78);
      const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(gw, gh, 0.04)), matteTrimMat);
      mesh.position.set(0, noseSt.ySill + gh * 0.55 + 0.01, noseFasciaZ - 0.014);
      mesh.rotation.x = 0.20;
      bodyGroup.add(mesh);
      const bar = new THREE.Mesh(track(new THREE.BoxGeometry(gw * 0.88, 0.018, 0.045)), tertiaryMat);
      bar.position.set(0, noseSt.ySill + gh * 0.55 + 0.01, noseFasciaZ - 0.008);
      bodyGroup.add(bar);
    } else if (design.grilleStyle === 'mustang-pony' || design.grilleStyle === 'gtr-v' || design.grilleStyle === 'lexus-spindle') {
      const gw = Math.min(0.72, maxGrilleW);
      const gh = Math.min(0.14, maxGrilleH);
      const intake = new THREE.Mesh(track(new THREE.BoxGeometry(gw, gh, 0.04)), matteTrimMat);
      intake.position.set(0, noseMidY, noseFasciaZ - 0.012);
      intake.rotation.x = 0.16;
      bodyGroup.add(intake);
      if (design.grilleStyle === 'mustang-pony') {
        const hoodVent = new THREE.Mesh(track(new THREE.BoxGeometry(0.54, 0.022, 0.34)), carbonMat);
        const ventSt = sampleHullAtZ(bodyLen * 0.24);
        hoodVent.position.set(0, ventSt.yCrown + 0.004, bodyLen * 0.24);
        bodyGroup.add(hoodVent);
      }
    } else if (design.grilleStyle === 'clio-hatch' || design.grilleStyle === 'civic-fl5' || design.grilleStyle === 'porsche-992') {
      const gw = Math.min(0.78, maxGrilleW);
      const gh = Math.min(0.075, maxGrilleH * 0.72);
      const intake = new THREE.Mesh(track(new THREE.BoxGeometry(gw, gh, 0.04)), matteTrimMat);
      intake.position.set(0, noseSt.ySill + gh * 0.55 + 0.01, noseFasciaZ - 0.016);
      intake.rotation.x = 0.14;
      bodyGroup.add(intake);
    } else if (design.grilleStyle !== 'none') {
      const gh = Math.min(0.07, maxGrilleH * 0.7);
      for (const gx of [-noseSt.wBelt * 0.45, noseSt.wBelt * 0.45]) {
        const intake = new THREE.Mesh(track(new THREE.BoxGeometry(0.28, gh, 0.04)), matteTrimMat);
        intake.position.set(gx, noseSt.ySill + gh * 0.55 + 0.01, noseFasciaZ - 0.018);
        intake.rotation.y = gx < 0 ? -0.14 : 0.14;
        bodyGroup.add(intake);
      }
    }

    // 5. Flush Sculpted Side Intakes & Louvers (strictly flush with door skin — no sticking-out bricks)
    if (design.sidepodStyle === 'clio-side-scoop' || design.sidepodStyle === 'sculpted-intake') {
      const doorZ = design.sidepodStyle === 'clio-side-scoop' ? -0.28 : -0.20;
      const doorSt = sampleHullAtZ(doorZ);
      for (const sx of [-1, 1]) {
        const pocket = new THREE.Mesh(track(new THREE.BoxGeometry(0.04, 0.22, 0.48)), matteTrimMat);
        pocket.position.set(sx * (doorSt.halfW * 0.99), doorSt.ySill + 0.16, doorZ);
        pocket.rotation.y = sx * -0.05;
        bodyGroup.add(pocket);

        const strake = new THREE.Mesh(
          track(new THREE.BoxGeometry(0.05, 0.20, 0.08)),
          design.sidepodStyle === 'clio-side-scoop' ? secondaryMat : tertiaryMat,
        );
        strake.position.set(sx * (doorSt.halfW * 1.00), doorSt.ySill + 0.16, doorZ + 0.20);
        bodyGroup.add(strake);
      }
    } else if (design.sidepodStyle === 'venturi-tunnel' || design.sidepodStyle === 'undercut') {
      const doorSt = sampleHullAtZ(0.0);
      for (const sx of [-1, 1]) {
        const undercut = new THREE.Mesh(track(new THREE.BoxGeometry(0.06, 0.14, 1.12)), matteTrimMat);
        undercut.position.set(sx * (doorSt.halfW * 0.96), 0.22, 0.02);
        bodyGroup.add(undercut);
      }
    } else if (design.sidepodStyle === 'louvered') {
      const fSt = sampleHullAtZ(wheelBaseZ);
      for (const sx of [-1, 1]) {
        const louver = new THREE.Mesh(track(new THREE.BoxGeometry(0.22, 0.024, 0.36)), matteTrimMat);
        louver.position.set(sx * (fSt.wBelt * 0.72), fSt.yBelt + 0.01, wheelBaseZ);
        bodyGroup.add(louver);
      }
    }

    // 6. Tapered ExtrudeGeometry Prototype Shark Fin / Roof Air Scoop
    if (design.sharkFinStyle === 'tall-proto' || design.sharkFinStyle === 'curved-lmh') {
      const finH = isLmp2 ? 0.32 : design.sharkFinStyle === 'curved-lmh' ? 0.26 : 0.30;
      const finGeo = track(createSharkFinGeometry(1.02, finH));
      const fin = new THREE.Mesh(finGeo, secondaryMat);
      fin.position.set(0, 0.62, -1.52);
      fin.castShadow = true;
      bodyGroup.add(fin);
    } else if (design.sharkFinStyle === 'roof-scoop') {
      const scoopGeo = track(createSharkFinGeometry(0.62, 0.14));
      const scoop = new THREE.Mesh(scoopGeo, carbonMat);
      const roofPeak = cabinStations[Math.floor(cabinStations.length * 0.5)]?.yRoof ?? 0.88;
      scoop.position.set(0, roofPeak - 0.02, design.cabinOffsetZ - 0.65);
      scoop.castShadow = true;
      bodyGroup.add(scoop);
      if (isProto) {
        const finGeo = track(createSharkFinGeometry(0.92, 0.24));
        const fin = new THREE.Mesh(finGeo, secondaryMat);
        fin.position.set(0, 0.62, -1.52);
        bodyGroup.add(fin);
      }
    }

    // GT3 / GT4 Dive-Plane Canards (tucked neatly at front bumper corners)
    if (isGT3 || isGT4) {
      const cSt = sampleHullAtZ(bodyLen * 0.44);
      const canardGeo = track(new THREE.BoxGeometry(0.12, 0.025, 0.14));
      for (const sx of [-1, 1]) {
        for (const cy of isGT3 ? [0.28, 0.38] : [0.32]) {
          const canard = new THREE.Mesh(canardGeo, carbonMat);
          canard.position.set(sx * (cSt.halfW + 0.01), cy, bodyLen * 0.45);
          canard.rotation.z = sx * -0.18;
          canard.rotation.x = -0.12;
          bodyGroup.add(canard);
        }
      }
    }

    // Windshield Banner (hugging flush with windshield glass slope)
    if (!isStreetCar && cabinStations.length >= 2) {
      const stTop = cabinStations[cabinStations.length - 2];
      const stBtm = cabinStations[cabinStations.length - 1];
      const t0 = 0.05;
      const t1 = 0.28;
      const lerpSt = (t: number) => ({
        z: stTop.z + (stBtm.z - stTop.z) * t,
        w: (stTop.wRoof + (stBtm.wRoof - stTop.wRoof) * t) * 0.90,
        y: stTop.yRoof + (stBtm.yRoof - stTop.yRoof) * t,
      });
      const rTop = lerpSt(t0);
      const rBtm = lerpSt(t1);
      const liftY = 0.008;
      const liftZ = 0.008;
      const crownLift = 0.024;
      const bPos = new Float32Array([
        -rTop.w, rTop.y + liftY, rTop.z + liftZ,
        0, rTop.y + crownLift + liftY, rTop.z + liftZ,
        rTop.w, rTop.y + liftY, rTop.z + liftZ,
        -rBtm.w, rBtm.y + liftY, rBtm.z + liftZ,
        0, rBtm.y + crownLift + liftY, rBtm.z + liftZ,
        rBtm.w, rBtm.y + liftY, rBtm.z + liftZ,
      ]);
      const bUv = new Float32Array([
        0, 1, 0.5, 1, 1, 1,
        0, 0, 0.5, 0, 1, 0,
      ]);
      const bannerGeo = track(new THREE.BufferGeometry());
      bannerGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
      bannerGeo.setAttribute('uv', new THREE.BufferAttribute(bUv, 2));
      bannerGeo.setIndex([0, 3, 4, 0, 4, 1, 1, 4, 5, 1, 5, 2]);
      bannerGeo.computeVertexNormals();
      const bannerMesh = new THREE.Mesh(bannerGeo, bannerMat);
      bodyGroup.add(bannerMesh);
    }

    // 7. Front Chin Splitter & Rear Diffuser Strakes
    const splitterWidth = noseSt.halfW * 2.02;
    const splitterLen = isGT3 ? 0.16 : isGT4 ? 0.13 : isProto ? 0.18 : 0.11;
    const splitterGeo = track(new THREE.BoxGeometry(splitterWidth, 0.036, splitterLen));
    const splitterMesh = new THREE.Mesh(
      splitterGeo,
      livery.carbonSplitter || isGT3 || isGT4 ? carbonMat : tertiaryMat,
    );
    splitterMesh.position.set(0, 0.155, bodyLen * 0.495);
    bodyGroup.add(splitterMesh);

    const rearSt = sampleHullAtZ(-bodyLen * 0.48);
    const diffMesh = new THREE.Mesh(
      track(new THREE.BoxGeometry(rearSt.halfW * 1.72, 0.11, 0.18)),
      matteTrimMat,
    );
    diffMesh.position.set(0, 0.195, -bodyLen * 0.485);
    bodyGroup.add(diffMesh);
    for (const fx of [-0.36, -0.18, 0, 0.18, 0.36]) {
      const fin = new THREE.Mesh(track(new THREE.BoxGeometry(0.022, 0.10, 0.18)), carbonMat);
      fin.position.set(fx, 0.19, -bodyLen * 0.495);
      bodyGroup.add(fin);
    }

    // 8. Exhaust Tips per Architecture
    if (design.exhaustStyle === 'clio-center-twin') {
      const exGeo = track(new THREE.CylinderGeometry(0.04, 0.04, 0.10, 12));
      exGeo.rotateX(Math.PI / 2);
      for (const ex of [-0.065, 0.065]) {
        const exhaust = new THREE.Mesh(exGeo, chromeMat);
        exhaust.position.set(ex, 0.24, -bodyLen * 0.505);
        bodyGroup.add(exhaust);
      }
    } else if (design.exhaustStyle === 'rear-dual') {
      const exGeo = track(new THREE.CylinderGeometry(0.04, 0.04, 0.10, 10));
      exGeo.rotateX(Math.PI / 2);
      for (const ex of [-0.36, -0.26, 0.26, 0.36]) {
        const exhaust = new THREE.Mesh(exGeo, chromeMat);
        exhaust.position.set(ex, 0.23, -bodyLen * 0.505);
        bodyGroup.add(exhaust);
      }
    } else if (design.exhaustStyle === 'rear-center') {
      const exGeo = track(new THREE.CylinderGeometry(0.048, 0.048, 0.10, 10));
      exGeo.rotateX(Math.PI / 2);
      for (const ex of [-0.085, 0.085]) {
        const exhaust = new THREE.Mesh(exGeo, chromeMat);
        exhaust.position.set(ex, 0.26, -bodyLen * 0.505);
        bodyGroup.add(exhaust);
      }
    } else if (design.exhaustStyle === 'top-exit') {
      const exGeo = track(new THREE.CylinderGeometry(0.042, 0.052, 0.08, 10));
      for (const ex of [-0.15, 0.15]) {
        const exhaust = new THREE.Mesh(exGeo, chromeMat);
        exhaust.position.set(ex, 0.58, -bodyLen * 0.18);
        bodyGroup.add(exhaust);
      }
    } else if (design.exhaustStyle === 'side-exit') {
      const exGeo = track(new THREE.CylinderGeometry(0.038, 0.038, 0.08, 10));
      exGeo.rotateZ(Math.PI / 2);
      const exSt = sampleHullAtZ(-0.35);
      for (const sx of [-1, 1]) {
        const exhaust = new THREE.Mesh(exGeo, chromeMat);
        exhaust.position.set(sx * (exSt.halfW + 0.01), 0.21, -0.35);
        bodyGroup.add(exhaust);
      }
    }

    // 9. Clean Cambered Airfoil Rear Wing / Spoiler
    const wingMat = livery.carbonWing ? carbonMat : secondaryMat;
    if (design.rearDeckStyle === 'roof-spoiler-hatch') {
      const roofEdge = cabinStations[1] ?? cabinStations[0];
      const spoilerZ = (roofEdge?.z ?? -1.1) - 0.04;
      const spoilerY = (roofEdge?.yRoof ?? 1.0) + 0.025;
      const spoilerW = Math.min(bodyWidth * 0.72, (roofEdge?.wRoof ?? 0.5) * 2.15);
      const spoilerGeo = track(createAirfoilWingGeometry(spoilerW, 0.18, 0.038));
      const spoiler = new THREE.Mesh(spoilerGeo, wingMat);
      spoiler.position.set(0, spoilerY, spoilerZ);
      spoiler.castShadow = true;
      bodyGroup.add(spoiler);
    } else if (design.rearDeckStyle === 'w1-longtail') {
      const w1Wing = new THREE.Mesh(track(createAirfoilWingGeometry(bodyWidth * 0.94, 0.30, 0.052)), wingMat);
      w1Wing.position.set(0, 0.84, -bodyLen * 0.50);
      w1Wing.castShadow = true;
      bodyGroup.add(w1Wing);
      for (const sx of [-0.42, 0.42]) {
        const strut = new THREE.Mesh(track(new THREE.BoxGeometry(0.04, 0.24, 0.16)), matteTrimMat);
        strut.position.set(sx, 0.72, -bodyLen * 0.47);
        bodyGroup.add(strut);
      }
      rearWingFlap = w1Wing;
    } else if (design.rearDeckStyle === 'wingless-9x8') {
      const lowLip = new THREE.Mesh(track(createAirfoilWingGeometry(bodyWidth * 0.90, 0.18, 0.04)), carbonMat);
      lowLip.position.set(0, 0.65, -bodyLen * 0.47);
      bodyGroup.add(lowLip);
    } else if (design.rearDeckStyle === 'split-499p') {
      const wingWidth = bodyWidth * 0.96;
      for (const sx of [-wingWidth * 0.47, wingWidth * 0.47]) {
        const endPylon = new THREE.Mesh(track(new THREE.BoxGeometry(0.042, 0.46, 0.34)), secondaryMat);
        endPylon.position.set(sx, 0.78, -bodyLen * 0.45);
        endPylon.castShadow = true;
        bodyGroup.add(endPylon);
      }
      const mainWing = new THREE.Mesh(track(createAirfoilWingGeometry(wingWidth, 0.29, 0.055)), wingMat);
      mainWing.position.set(0, 0.98, -bodyLen * 0.46);
      mainWing.castShadow = true;
      bodyGroup.add(mainWing);
      rearWingFlap = mainWing;
    } else if (design.rearDeckStyle === 'active-lip') {
      const deckSt = sampleHullAtZ(-bodyLen * 0.46);
      const lip = new THREE.Mesh(track(createAirfoilWingGeometry(bodyWidth * 0.78, 0.14, 0.036)), wingMat);
      lip.position.set(0, deckSt.yCrown + 0.04, -bodyLen * 0.46);
      bodyGroup.add(lip);
      rearWingFlap = lip;
    } else if (design.rearDeckStyle === 'deck-tunnel') {
      const deckSt = sampleHullAtZ(-bodyLen * 0.46);
      const lip = new THREE.Mesh(track(createAirfoilWingGeometry(bodyWidth * 0.82, 0.16, 0.038)), wingMat);
      lip.position.set(0, deckSt.yCrown + 0.05, -bodyLen * 0.46);
      bodyGroup.add(lip);
      rearWingFlap = lip;
    } else if (design.rearDeckStyle === 'ducktail-rs') {
      const deckSt = sampleHullAtZ(-bodyLen * 0.44);
      const duckMesh = new THREE.Mesh(track(new THREE.BoxGeometry(bodyWidth * 0.82, 0.06, 0.18)), primaryMat);
      duckMesh.position.set(0, deckSt.yCrown + 0.03, -bodyLen * 0.44);
      duckMesh.rotation.x = 0.34;
      duckMesh.castShadow = true;
      bodyGroup.add(duckMesh);

      if (carId === 'porsche-911-gt3-rs') {
        const wingWidth = bodyWidth * 0.95;
        for (const sx of [-0.38, 0.38]) {
          const strut = new THREE.Mesh(track(new THREE.BoxGeometry(0.045, 0.32, 0.16)), matteTrimMat);
          strut.position.set(sx, 0.82, -bodyLen * 0.40);
          strut.rotation.x = 0.16;
          bodyGroup.add(strut);
        }
        const rsWing = new THREE.Mesh(track(createAirfoilWingGeometry(wingWidth, 0.26, 0.05)), wingMat);
        rsWing.position.set(0, 0.98, -bodyLen * 0.45);
        rsWing.castShadow = true;
        bodyGroup.add(rsWing);
        for (const sx of [-wingWidth * 0.5, wingWidth * 0.5]) {
          const ep = new THREE.Mesh(track(new THREE.BoxGeometry(0.032, 0.18, 0.32)), tertiaryMat);
          ep.position.set(sx, 0.98, -bodyLen * 0.45);
          bodyGroup.add(ep);
        }
        rearWingFlap = rsWing;
      } else {
        rearWingFlap = duckMesh;
      }
    } else {
      // swan-neck or strut-race
      const isSwan = design.rearDeckStyle === 'swan-neck';
      const strutGeo = track(new THREE.BoxGeometry(0.045, isSwan ? 0.38 : 0.32, 0.20));
      for (const sx of [-0.46, 0.46]) {
        const strut = new THREE.Mesh(strutGeo, matteTrimMat);
        strut.position.set(sx, isSwan ? 0.83 : 0.78, isSwan ? -bodyLen * 0.41 : -bodyLen * 0.44);
        bodyGroup.add(strut);
      }
      const wingWidth = bodyWidth * (isGT3 ? 1.00 : isGT4 ? 0.95 : 0.94);
      const wingMesh = new THREE.Mesh(track(createAirfoilWingGeometry(wingWidth, 0.28, 0.052)), wingMat);
      wingMesh.position.set(0, 0.98, -bodyLen * 0.46);
      wingMesh.castShadow = true;
      bodyGroup.add(wingMesh);
      rearWingFlap = wingMesh;

      const epGeo = track(new THREE.BoxGeometry(0.034, 0.22, 0.38));
      for (const sx of [-wingWidth * 0.5, wingWidth * 0.5]) {
        const ep = new THREE.Mesh(epGeo, tertiaryMat);
        ep.position.set(sx, 0.98, -bodyLen * 0.46);
        bodyGroup.add(ep);
      }
    }

    // 10. Flush Door Number Plates (integrated directly onto UV canvas via procedural textures)

    // 11. Flush Sculpted Headlights & Rear LED Light Bar (recessed into front/rear fender fascia with dark housing bezel)
    const hlSample = sampleHullAtZ(bodyLen * 0.455);
    const hlZ = bodyLen * 0.468;
    const hlBaseX = Math.min(0.64, hlSample.wBelt * 0.72);
    [-hlBaseX, hlBaseX].forEach((hx, idx) => {
      if (design.headlightStyle === 'bentley-quad') {
        for (const [xMul, rad, yOff] of [[1.04, 0.095, 0.04], [0.70, 0.072, 0.02]] as const) {
          const bezel = new THREE.Mesh(track(new THREE.CylinderGeometry(rad * 1.15, rad * 1.15, 0.04, 14)), matteTrimMat);
          bezel.rotation.x = Math.PI / 2 - 0.16;
          bezel.position.set(hx * xMul, hlSample.yBelt * 0.88 + yOff, hlZ - 0.016);
          bodyGroup.add(bezel);
          const lamp = new THREE.Mesh(track(new THREE.CylinderGeometry(rad, rad, 0.05, 14)), headlightMats[idx]);
          lamp.rotation.x = Math.PI / 2 - 0.16;
          lamp.position.set(hx * xMul, hlSample.yBelt * 0.88 + yOff, hlZ - 0.01);
          bodyGroup.add(lamp);
        }
      } else if (design.headlightStyle === 'c-blade-rs01') {
        const upperBlade = new THREE.Mesh(track(new THREE.BoxGeometry(0.22, 0.045, 0.05)), headlightMats[idx]);
        upperBlade.position.set(hx * 0.96, hlSample.yBelt * 0.92, hlZ);
        upperBlade.rotation.y = hx < 0 ? -0.18 : 0.18;
        bodyGroup.add(upperBlade);

        const dropBlade = new THREE.Mesh(track(new THREE.BoxGeometry(0.048, 0.17, 0.05)), headlightMats[idx]);
        dropBlade.position.set(hx * 1.06, hlSample.yBelt * 0.76, hlZ);
        bodyGroup.add(dropBlade);
      } else if (design.headlightStyle === 'vertical-stack') {
        const hl = new THREE.Mesh(track(new THREE.BoxGeometry(0.09, 0.22, 0.05)), headlightMats[idx]);
        hl.position.set(hx * 1.04, hlSample.yBelt * 0.84, hlZ);
        hl.rotation.x = -0.16;
        bodyGroup.add(hl);
      } else if (design.headlightStyle === 'round-911') {
        const bezel = new THREE.Mesh(track(new THREE.CylinderGeometry(0.132, 0.132, 0.04, 16)), matteTrimMat);
        bezel.rotation.x = Math.PI / 2 - 0.34;
        bezel.position.set(hx * 1.00, hlSample.yBelt * 0.96, hlZ - 0.036);
        bodyGroup.add(bezel);
        const hl = new THREE.Mesh(track(new THREE.CylinderGeometry(0.112, 0.112, 0.05, 16)), headlightMats[idx]);
        hl.rotation.x = Math.PI / 2 - 0.34;
        hl.position.set(hx * 1.00, hlSample.yBelt * 0.96, hlZ - 0.03);
        bodyGroup.add(hl);
      } else if (design.headlightStyle === 'fang') {
        const bezel = new THREE.Mesh(track(new THREE.BoxGeometry(0.28, 0.085, 0.04)), matteTrimMat);
        bezel.position.set(hx, hlSample.yBelt * 0.88, hlZ - 0.008);
        bezel.rotation.z = hx < 0 ? 0.22 : -0.22;
        bezel.rotation.y = hx < 0 ? -0.16 : 0.16;
        bodyGroup.add(bezel);
        const hl = new THREE.Mesh(track(new THREE.BoxGeometry(0.25, 0.06, 0.05)), headlightMats[idx]);
        hl.position.set(hx, hlSample.yBelt * 0.88, hlZ);
        hl.rotation.z = hx < 0 ? 0.22 : -0.22;
        hl.rotation.y = hx < 0 ? -0.16 : 0.16;
        bodyGroup.add(hl);
      } else {
        const bezel = new THREE.Mesh(track(new THREE.BoxGeometry(0.28, 0.085, 0.04)), matteTrimMat);
        bezel.position.set(hx, hlSample.yBelt * 0.88, hlZ - 0.008);
        bezel.rotation.y = hx < 0 ? -0.16 : 0.16;
        bodyGroup.add(bezel);
        const hl = new THREE.Mesh(track(new THREE.BoxGeometry(0.25, 0.06, 0.05)), headlightMats[idx]);
        hl.position.set(hx, hlSample.yBelt * 0.88, hlZ);
        hl.rotation.y = hx < 0 ? -0.16 : 0.16;
        bodyGroup.add(hl);
      }
    });

    const tailBar = new THREE.Mesh(
      track(new THREE.BoxGeometry(rearSt.wBelt * 1.66, 0.068, 0.045)),
      brakeLightMat,
    );
    tailBar.position.set(0, rearSt.yBelt * 0.84, -bodyLen * 0.498);
    bodyGroup.add(tailBar);
  }

  // Apply real-world length stretch to Formula chassis while keeping wheels perfectly circular
  if (isFormula && Math.abs(formulaLengthStretch - 1) > 1e-4) {
    bodyGroup.scale.z = formulaLengthStretch;
  }

  // Four Rotating & Steering Wheels + Wishbones for Open-Wheelers
  const frontWheels: THREE.Group[] = [];
  const allWheels: THREE.Group[] = [];

  const effWheelBaseZ = isFormula ? wheelBaseZ * formulaLengthStretch : wheelBaseZ;
  const wheelCoords: Array<{ x: number; z: number; isFront: boolean }> = [
    { x: -trackHalfX, z: effWheelBaseZ, isFront: true },
    { x: trackHalfX, z: effWheelBaseZ, isFront: true },
    { x: -trackHalfX, z: -effWheelBaseZ, isFront: false },
    { x: trackHalfX, z: -effWheelBaseZ, isFront: false },
  ];

  for (const wc of wheelCoords) {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(wc.x, wheelRadius, wc.z);

    const wheelMesh = createDiecastWheel(
      wheelRadius,
      wheelWidth,
      rimMat,
      tireMat,
      caliperMat,
      rotorMat,
      wc.x < 0 ? -1 : 1,
      track,
      tireGrooveMat,
      isF1_2005,
    );
    steerPivot.add(wheelMesh);
    root.add(steerPivot);
    allWheels.push(wheelMesh);
    if (wc.isFront) {
      frontWheels.push(steerPivot);
    }

    if (isOpenWheel) {
      const chassisX = wc.x < 0 ? -0.32 : 0.32;
      const suspension = createSuspensionArms(
        chassisX,
        wheelRadius,
        wc.z / formulaLengthStretch,
        wc.x < 0 ? wc.x + wheelWidth * 0.45 : wc.x - wheelWidth * 0.45,
        wheelRadius,
        wc.z / formulaLengthStretch,
        matteTrimMat,
        track,
      );
      bodyGroup.add(suspension);
    }
  }

  // FIA Rear Rain Light & Night Volumetric Headlight Beam Cones
  const rainLamp = new THREE.Mesh(track(new THREE.BoxGeometry(0.11, 0.16, 0.05)), rainLightMat);
  rainLamp.position.set(0, 0.44, -length * 0.49);
  bodyGroup.add(rainLamp);

  const headlightCones: THREE.Mesh[] = [];
  if (!isOpenWheel) {
    const coneGeo = track(new THREE.ConeGeometry(1.35, 11.5, 14, 1, true));
    coneGeo.rotateX(-Math.PI / 2);
    coneGeo.translate(0, 0, 5.75);
    const coneMat = track(
      new THREE.MeshBasicMaterial({
        color: headlightHex,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    for (const side of [-0.56, 0.56]) {
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(side, 0.46, length * 0.47);
      cone.visible = false;
      bodyGroup.add(cone);
      headlightCones.push(cone);
    }
  }

  const realDims = carId ? getRealWorldCarDimensions(carId, classId) : undefined;
  const hoodMount = computeRigHoodMount(root, bodyGroup, classId, realDims);

  return {
    root,
    bodyGroup,
    frontWheels,
    allWheels,
    frontWingFlap,
    rearWingFlap,
    headlightMats,
    brakeLightMat,
    brakeRotorMat: rotorMat,
    rainLightMat,
    headlightCones,
    hoodMount,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}

