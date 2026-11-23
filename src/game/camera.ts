import { CameraMode, CarClassId } from './types';

export interface HoodMountOffset {
  forward: number; // local +Z meters ahead of car origin
  up: number;      // local +Y meters above car origin
}

export interface BroadcastCameraStation {
  x: number;
  y: number;
  z: number;
  t: number; // normalized track progress 0..1
  fov: number;
}

export interface CameraTuningOptions {
  fovOffset?: number;
  lookToApex?: number;
  steerAngle?: number;
  lookBack?: boolean;
  chaseHeightOffset?: number;
  chaseDistanceOffset?: number;
  broadcastStation?: BroadcastCameraStation | null;
}

export interface CarCameraState {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch?: number;
  roll?: number;
  speed: number;
  hoodMount?: HoodMountOffset;
  carSpec?: {
    classId?: CarClassId;
    dimensions?: { length?: number; width?: number; height?: number };
  };
}

export interface CameraRigResult {
  position: { x: number; y: number; z: number };
  lookAt: { x: number; y: number; z: number };
  up?: { x: number; y: number; z: number };
  fov: number;
  isLocked: boolean; // true for rigid mounting (hood/bumper/cockpit/orbit/tv), false for spring-damped chase
}

export const CAMERA_MODE_ORDER: CameraMode[] = [
  'orbit',
  'chase-close',
  'chase-far',
  'hood',
  'bumper',
  'cockpit',
  'tv-broadcast',
];

export const CAMERA_MODE_LABELS: Record<CameraMode, string> = {
  orbit: 'Orbit Chase',
  'chase-close': 'Chase Close',
  'chase-far': 'Chase Far',
  hood: 'Hood / T-Cam',
  bumper: 'Bumper Cam',
  cockpit: 'Cockpit / Halo',
  'tv-broadcast': 'TV Broadcast',
};

export function cycleCameraMode(current: CameraMode, step: 1 | -1 = 1): CameraMode {
  const idx = CAMERA_MODE_ORDER.indexOf(current);
  if (idx < 0) return CAMERA_MODE_ORDER[0];
  return CAMERA_MODE_ORDER[(idx + step + CAMERA_MODE_ORDER.length) % CAMERA_MODE_ORDER.length];
}

export const CAR_HOOD_SPECS = {
  carLength: 4.6,
  carHeight: 1.24,
  hoodForwardFraction: 0.21,
  hoodUpFraction: 0.98,
  hoodFov: 68,
  lookDist: 25.0,
  lookDrop: 0.50,
};

export const DEFAULT_CHASE_CAMERA = {
  pitch: 0.42,
  distance: 12.2,
  pivotHeight: 1.35,
  minHeightAboveCar: 0.65,
  minPitch: 0.1,
  maxPitch: 1.28,
  minDistance: 5.5,
  maxDistance: 28.0,
  rollResetDelayMs: 2500,
  rollResetDampRate: 3.5,
};

export interface CameraLookOffset {
  yaw: number;
  pitch: number;
}

const OPEN_WHEEL_CLASSES = new Set<CarClassId>([
  CarClassId.F1_2026,
  CarClassId.F1_2021,
  CarClassId.F1_2005,
  CarClassId.FORMULA_E,
]);

const PROTOTYPE_CLASSES = new Set<CarClassId>([
  CarClassId.HYPERCAR_GTP,
  CarClassId.LMP2,
]);

export function computeDefaultHoodMount(
  classId?: CarClassId,
  dimensions?: { length?: number; height?: number },
): HoodMountOffset {
  const length = dimensions?.length && dimensions.length > 1.5 ? dimensions.length : CAR_HOOD_SPECS.carLength;
  const height = dimensions?.height && dimensions.height > 0.5 ? dimensions.height : CAR_HOOD_SPECS.carHeight;

  if (classId && OPEN_WHEEL_CLASSES.has(classId)) {
    return {
      forward: length * 0.14,
      up: Math.max(1.18, height + 0.28),
    };
  }
  if (classId && PROTOTYPE_CLASSES.has(classId)) {
    return {
      forward: length * 0.21,
      up: Math.max(1.18, height + 0.15),
    };
  }
  return {
    forward: length * CAR_HOOD_SPECS.hoodForwardFraction,
    up: Math.max(1.24, height * CAR_HOOD_SPECS.hoodUpFraction),
  };
}

/**
 * Generates elevated TV broadcast camera tower stations around a compiled track centerline.
 */
export function buildBroadcastCameraStations(
  samples: Array<{ x: number; y: number; z: number; nx: number; nz: number; width?: number }>,
  defaultTrackWidth = 16,
): BroadcastCameraStation[] {
  if (!samples || samples.length === 0) return [];
  const stationCount = Math.max(6, Math.min(18, Math.floor(samples.length / 28)));
  const stations: BroadcastCameraStation[] = [];
  for (let i = 0; i < stationCount; i++) {
    const t = i / stationCount;
    const idx = Math.floor(t * samples.length) % samples.length;
    const s = samples[idx];
    const side = i % 2 === 0 ? 1 : -1;
    const lateralOffset = (s.width ?? defaultTrackWidth) * 0.5 + 14 + (i % 3) * 4;
    const heightOffset = 6.5 + (i % 3) * 3.0;
    stations.push({
      x: s.x + s.nx * lateralOffset * side,
      y: (s.y ?? 0) + heightOffset,
      z: s.z + s.nz * lateralOffset * side,
      t,
      fov: 38 + (i % 2) * 6,
    });
  }
  return stations;
}

export function selectBroadcastStation(
  stations: BroadcastCameraStation[],
  carX: number,
  carZ: number,
): BroadcastCameraStation | null {
  if (!stations || stations.length === 0) return null;
  let best = stations[0];
  let bestD2 = Infinity;
  for (const st of stations) {
    const dx = st.x - carX;
    const dz = st.z - carZ;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = st;
    }
  }
  return best;
}

function buildBasis(heading: number, pitch: number, roll: number) {
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const cosR = Math.cos(roll);
  const sinR = Math.sin(roll);
  const sinH = Math.sin(heading);
  const cosH = Math.cos(heading);

  const fwdX = sinH * cosP;
  const fwdY = sinP;
  const fwdZ = cosH * cosP;

  const upX = sinR * cosH - cosR * sinP * sinH;
  const upY = cosR * cosP;
  const upZ = -sinR * sinH - cosR * sinP * cosH;

  const rightX = fwdY * upZ - fwdZ * upY;
  const rightY = fwdZ * upX - fwdX * upZ;
  const rightZ = fwdX * upY - fwdY * upX;

  return { fwdX, fwdY, fwdZ, upX, upY, upZ, rightX, rightY, rightZ };
}

export function computeCameraFrame(
  mode: CameraMode,
  car: CarCameraState,
  dampedPitch: number,
  dampedRoll: number,
  lookOffset?: CameraLookOffset,
  tuning?: CameraTuningOptions,
): CameraRigResult {
  const fovOffset = tuning?.fovOffset ?? 0;
  const lookBack = Boolean(tuning?.lookBack);
  const apexYaw = (tuning?.steerAngle ?? 0) * (tuning?.lookToApex ?? 0) * 0.32;
  const lookYaw = (lookOffset?.yaw ?? 0) + (lookBack ? Math.PI : apexYaw);
  const lookPitch = lookOffset?.pitch ?? 0;

  // TV Broadcast trackside telephoto camera
  if (mode === 'tv-broadcast' && tuning?.broadcastStation) {
    const st = tuning.broadcastStation;
    const dx = car.x - st.x;
    const dy = car.y + 0.9 - st.y;
    const dz = car.z - st.z;
    const dist = Math.hypot(dx, dy, dz);
    const dynamicFov = Math.max(20, Math.min(58, st.fov + fovOffset - Math.min(14, dist * 0.09)));
    return {
      position: { x: st.x, y: st.y, z: st.z },
      lookAt: { x: car.x, y: car.y + 0.85, z: car.z },
      fov: dynamicFov,
      isLocked: true,
    };
  }

  // Onboard rigidly mounted cameras: hood, bumper, cockpit
  if (mode === 'hood' || mode === 'bumper' || mode === 'cockpit') {
    const p = car.pitch ?? dampedPitch;
    const r = car.roll ?? dampedRoll;
    const basis = buildBasis(car.heading, p, r);

    const baseLength = car.carSpec?.dimensions?.length ?? CAR_HOOD_SPECS.carLength;
    const baseHeight = car.carSpec?.dimensions?.height ?? CAR_HOOD_SPECS.carHeight;
    const hoodMount: HoodMountOffset = car.hoodMount
      ? car.hoodMount
      : car.carSpec
      ? computeDefaultHoodMount(car.carSpec.classId, car.carSpec.dimensions)
      : {
          forward: CAR_HOOD_SPECS.carLength * CAR_HOOD_SPECS.hoodForwardFraction,
          up: CAR_HOOD_SPECS.carHeight * CAR_HOOD_SPECS.hoodUpFraction,
        };

    let fwdDist = hoodMount.forward;
    let upDist = hoodMount.up;
    let baseFov = CAR_HOOD_SPECS.hoodFov;
    let lookDrop = CAR_HOOD_SPECS.lookDrop;

    if (mode === 'bumper') {
      fwdDist = baseLength * 0.48;
      upDist = 0.44;
      baseFov = 74;
      lookDrop = 0.08;
    } else if (mode === 'cockpit') {
      const isOpenWheel = car.carSpec?.classId ? OPEN_WHEEL_CLASSES.has(car.carSpec.classId) : false;
      fwdDist = isOpenWheel ? -0.15 : -0.1;
      upDist = isOpenWheel ? Math.max(0.95, baseHeight * 0.88) : Math.max(1.06, baseHeight * 0.84);
      baseFov = 66;
      lookDrop = 0.25;
    }

    const posX = car.x + basis.fwdX * fwdDist + basis.upX * upDist;
    const posY = car.y + basis.fwdY * fwdDist + basis.upY * upDist;
    const posZ = car.z + basis.fwdZ * fwdDist + basis.upZ * upDist;

    let dirX = basis.fwdX;
    let dirY = basis.fwdY;
    let dirZ = basis.fwdZ;
    if (lookYaw !== 0 || lookPitch !== 0) {
      const cosLY = Math.cos(lookYaw);
      const sinLY = Math.sin(lookYaw);
      const cosLP = Math.cos(-lookPitch);
      const sinLP = Math.sin(-lookPitch);
      dirX = (basis.fwdX * cosLY + basis.rightX * sinLY) * cosLP + basis.upX * sinLP;
      dirY = (basis.fwdY * cosLY + basis.rightY * sinLY) * cosLP + basis.upY * sinLP;
      dirZ = (basis.fwdZ * cosLY + basis.rightZ * sinLY) * cosLP + basis.upZ * sinLP;
    }

    const lookDist = CAR_HOOD_SPECS.lookDist;
    return {
      position: { x: posX, y: posY, z: posZ },
      lookAt: {
        x: posX + dirX * lookDist - basis.upX * lookDrop,
        y: posY + dirY * lookDist - basis.upY * lookDrop,
        z: posZ + dirZ * lookDist - basis.upZ * lookDrop,
      },
      up: { x: basis.upX, y: basis.upY, z: basis.upZ },
      fov: Math.max(45, Math.min(95, baseFov + fovOffset)),
      isLocked: true,
    };
  }

  // Chase Close / Chase Far (spring-damped dynamic chase cameras)
  if (mode === 'chase-close' || mode === 'chase-far') {
    const isFar = mode === 'chase-far';
    const baseDist = (isFar ? 13.5 : 8.4) + (tuning?.chaseDistanceOffset ?? 0);
    const baseHeight = (isFar ? 4.3 : 2.65) + (tuning?.chaseHeightOffset ?? 0);
    const speedStretch = Math.min(2.2, (Math.abs(car.speed) / 85) * 2.0);
    const dist = Math.max(4.5, baseDist + speedStretch);
    const yaw = car.heading + lookYaw;
    const speedFov = Math.min(12, (Math.abs(car.speed) / 85) * 11);
    return {
      position: {
        x: car.x - Math.sin(yaw) * dist,
        y: Math.max(car.y + 0.85, car.y + baseHeight),
        z: car.z - Math.cos(yaw) * dist,
      },
      lookAt: {
        x: car.x + Math.sin(yaw) * 4.5,
        y: car.y + (isFar ? 1.45 : 1.15),
        z: car.z + Math.cos(yaw) * 4.5,
      },
      fov: Math.max(45, Math.min(92, (isFar ? 54 : 58) + speedFov + fovOffset)),
      isLocked: false,
    };
  }

  // Default interactive Orbit camera ('orbit') centered on the car pivot
  const cosP = Math.cos(DEFAULT_CHASE_CAMERA.pitch);
  const sinP = Math.sin(DEFAULT_CHASE_CAMERA.pitch);
  const dist = Math.max(5.5, DEFAULT_CHASE_CAMERA.distance + (tuning?.chaseDistanceOffset ?? 0));
  const horizDist = dist * cosP;
  const heightOffset =
    DEFAULT_CHASE_CAMERA.pivotHeight + dist * sinP + (tuning?.chaseHeightOffset ?? 0);
  const targetFov = Math.max(45, Math.min(90, 52 + Math.min(10, (Math.abs(car.speed) / 60) * 8) + fovOffset));

  const orbitYaw = car.heading + lookYaw;
  return {
    position: {
      x: car.x - Math.sin(orbitYaw) * horizDist,
      y: Math.max(car.y + DEFAULT_CHASE_CAMERA.minHeightAboveCar, car.y + heightOffset),
      z: car.z - Math.cos(orbitYaw) * horizDist,
    },
    lookAt: {
      x: car.x,
      y: car.y + DEFAULT_CHASE_CAMERA.pivotHeight,
      z: car.z,
    },
    fov: targetFov,
    isLocked: true,
  };
}

