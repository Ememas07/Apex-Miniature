import { CameraMode } from './types';

export interface CarCameraState {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch?: number;
  roll?: number;
  speed: number;
}

export interface CameraRigResult {
  position: { x: number; y: number; z: number };
  lookAt: { x: number; y: number; z: number };
  up?: { x: number; y: number; z: number };
  fov: number;
  isLocked: boolean; // true for rigid mounting (hood / orbit), false for spring-damped chase
}

export const CAR_HOOD_SPECS = {
  carLength: 4.4,
  carHeight: 1.18,
  hoodForwardFraction: 0.24,
  hoodUpFraction: 0.68,
  hoodFov: 65,
};

export const DEFAULT_CHASE_CAMERA = {
  pitch: 0.42, // ~24 deg downward look angle for clear sightline down the track
  distance: 12.2,
  pivotHeight: 1.35, // slightly above car roofline
  minHeightAboveCar: 0.65,
  minPitch: 0.1,
  maxPitch: 1.28,
  minDistance: 5.5,
  maxDistance: 28.0,
  rollResetDelayMs: 2500, // 2.5s idle before smoothly damping camera roll back to 0
  rollResetDampRate: 3.5,
};

export interface CameraLookOffset {
  yaw: number;
  pitch: number;
}

/**
 * Calculates camera target position, look-at orientation, and FOV.
 * When cameraMode === "hood", all velocity lag, trailing spring-damper,
 * and backward speed-FOV kicks are completely bypassed and mount/lookAt are
 * transformed by the car's full 3D orientation (heading, pitch, roll).
 */
export function computeCameraFrame(
  mode: CameraMode,
  car: CarCameraState,
  dampedPitch: number,
  dampedRoll: number,
  lookOffset?: CameraLookOffset,
): CameraRigResult {
  const carLen = CAR_HOOD_SPECS.carLength;
  const carHgt = CAR_HOOD_SPECS.carHeight;
  const lookYaw = lookOffset?.yaw ?? 0;
  const lookPitch = lookOffset?.pitch ?? 0;

  if (mode === 'hood') {
    // Full 3D car orientation matching YXZ Euler (ry = heading, rx = -pitch, rz = -roll)
    // Positive pitch (+p) pitches car nose UP (+Y); positive roll (+r) lifts right side.
    const p = car.pitch ?? dampedPitch;
    const r = car.roll ?? dampedRoll;

    const cosP = Math.cos(p);
    const sinP = Math.sin(p);
    const cosR = Math.cos(r);
    const sinR = Math.sin(r);
    const sinH = Math.sin(car.heading);
    const cosH = Math.cos(car.heading);

    // Forward unit vector in world space: Ry(h) * Rx(-p) * (0, 0, 1)
    const fwdX = sinH * cosP;
    const fwdY = sinP;
    const fwdZ = cosH * cosP;

    // Up unit vector in world space: Ry(h) * Rx(-p) * Rz(-r) * (0, 1, 0)
    const upX = sinR * cosH - cosR * sinP * sinH;
    const upY = cosR * cosP;
    const upZ = -sinR * sinH - cosR * sinP * cosH;

    const fwdDist = carLen * CAR_HOOD_SPECS.hoodForwardFraction; // ~1.056m forward
    const upDist = carHgt * CAR_HOOD_SPECS.hoodUpFraction; // ~0.802m up

    const posX = car.x + fwdX * fwdDist + upX * upDist;
    const posY = car.y + fwdY * fwdDist + upY * upDist;
    const posZ = car.z + fwdZ * fwdDist + upZ * upDist;

    // Look forward along car's pitched/rolled forward vector, with optional right-stick glance offset
    const lookDist = 25.0;
    let dirX = fwdX;
    let dirY = fwdY;
    let dirZ = fwdZ;
    if (lookYaw !== 0 || lookPitch !== 0) {
      // Screen-right unit vector: fwd x up
      const rightX = fwdY * upZ - fwdZ * upY;
      const rightY = fwdZ * upX - fwdX * upZ;
      const rightZ = fwdX * upY - fwdY * upX;
      const cosLY = Math.cos(lookYaw);
      const sinLY = Math.sin(lookYaw);
      const cosLP = Math.cos(-lookPitch);
      const sinLP = Math.sin(-lookPitch);
      dirX = (fwdX * cosLY + rightX * sinLY) * cosLP + upX * sinLP;
      dirY = (fwdY * cosLY + rightY * sinLY) * cosLP + upY * sinLP;
      dirZ = (fwdZ * cosLY + rightZ * sinLY) * cosLP + upZ * sinLP;
    }

    const lookX = posX + dirX * lookDist - upX * 1.4;
    const lookY = posY + dirY * lookDist - upY * 1.4;
    const lookZ = posZ + dirZ * lookDist - upZ * 1.4;

    return {
      position: { x: posX, y: posY, z: posZ },
      lookAt: { x: lookX, y: lookY, z: lookZ },
      up: { x: upX, y: upY, z: upZ },
      fov: CAR_HOOD_SPECS.hoodFov,
      isLocked: true,
    };
  }

  if (mode === 'isometric') {
    let posX = car.x - 16;
    let posY = car.y + 22;
    let posZ = car.z - 16;
    if (lookYaw !== 0 || lookPitch !== 0) {
      const isoRadiusXZ = Math.SQRT2 * 16;
      const isoAngle = -Math.PI * 0.75 + lookYaw;
      posX = car.x + Math.sin(isoAngle) * isoRadiusXZ;
      posY = car.y + Math.max(8, Math.min(34, 22 + lookPitch * 14));
      posZ = car.z + Math.cos(isoAngle) * isoRadiusXZ;
    }
    return {
      position: { x: posX, y: posY, z: posZ },
      lookAt: {
        x: car.x + Math.sin(car.heading) * 4,
        y: car.y + 0.6,
        z: car.z + Math.cos(car.heading) * 4,
      },
      fov: 42,
      isLocked: false,
    };
  }

  const cosP = Math.cos(DEFAULT_CHASE_CAMERA.pitch);
  const sinP = Math.sin(DEFAULT_CHASE_CAMERA.pitch);
  const horizDist = DEFAULT_CHASE_CAMERA.distance * cosP;
  const heightOffset = DEFAULT_CHASE_CAMERA.pivotHeight + DEFAULT_CHASE_CAMERA.distance * sinP;
  const targetFov = 52 + Math.min(10, (car.speed / 60) * 8);

  if (mode === 'chase') {
    const chaseYaw = car.heading + lookYaw;
    const lookAhead = 5.5;
    return {
      position: {
        x: car.x - Math.sin(chaseYaw) * horizDist,
        y: Math.max(car.y + DEFAULT_CHASE_CAMERA.minHeightAboveCar, car.y + heightOffset),
        z: car.z - Math.cos(chaseYaw) * horizDist,
      },
      lookAt: {
        x: car.x + Math.sin(chaseYaw) * lookAhead,
        y: car.y + DEFAULT_CHASE_CAMERA.pivotHeight,
        z: car.z + Math.cos(chaseYaw) * lookAhead,
      },
      fov: targetFov,
      isLocked: false,
    };
  }

  // Interactive Orbit camera ('orbit') centered on the car pivot
  return {
    position: {
      x: car.x - Math.sin(car.heading) * horizDist,
      y: Math.max(car.y + DEFAULT_CHASE_CAMERA.minHeightAboveCar, car.y + heightOffset),
      z: car.z - Math.cos(car.heading) * horizDist,
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
