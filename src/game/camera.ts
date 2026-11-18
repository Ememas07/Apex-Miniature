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
): CameraRigResult {
  const carLen = CAR_HOOD_SPECS.carLength;
  const carHgt = CAR_HOOD_SPECS.carHeight;

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

    // Look forward along car's pitched/rolled forward vector so hood & road ahead stay framed on climbs & drops
    const lookDist = 25.0;
    const lookX = posX + fwdX * lookDist - upX * 1.4;
    const lookY = posY + fwdY * lookDist - upY * 1.4;
    const lookZ = posZ + fwdZ * lookDist - upZ * 1.4;

    return {
      position: { x: posX, y: posY, z: posZ },
      lookAt: { x: lookX, y: lookY, z: lookZ },
      up: { x: upX, y: upY, z: upZ },
      fov: CAR_HOOD_SPECS.hoodFov,
      isLocked: true,
    };
  }

  if (mode === 'isometric') {
    return {
      position: { x: car.x - 16, y: car.y + 22, z: car.z - 16 },
      lookAt: {
        x: car.x + Math.sin(car.heading) * 4,
        y: car.y + 0.6,
        z: car.z + Math.cos(car.heading) * 4,
      },
      fov: 42,
      isLocked: false,
    };
  }

  if (mode === 'orbit') {
    return {
      position: {
        x: car.x - Math.sin(car.heading) * 12.0,
        y: Math.max(car.y + 0.45, car.y + 5.2),
        z: car.z - Math.cos(car.heading) * 12.0,
      },
      lookAt: {
        x: car.x,
        y: car.y + 0.8,
        z: car.z,
      },
      fov: 52,
      isLocked: true,
    };
  }

  // Chase camera modes ('chase-34' | 'high-chase')
  const isChase34 = mode === 'chase-34';
  const backDist = isChase34 ? 14.5 : 21.0;
  const height = isChase34 ? 9.5 : 16.5;
  const lookAhead = 8.5;

  const targetFov = 48 + Math.min(12, (car.speed / 55) * 10);

  return {
    position: {
      x: car.x - Math.sin(car.heading) * backDist,
      y: car.y + height,
      z: car.z - Math.cos(car.heading) * backDist,
    },
    lookAt: {
      x: car.x + Math.sin(car.heading) * lookAhead,
      y: car.y + 0.6,
      z: car.z + Math.cos(car.heading) * lookAhead,
    },
    fov: targetFov,
    isLocked: false,
  };
}
