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
  fov: number;
  isLocked: boolean; // true for rigid mounting (hood), false for spring-damped chase
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
 * and backward speed-FOV kicks are completely bypassed.
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
    // Subtle damped pitch/roll horizon blend so small bumps don't jitter,
    // while remaining solidly locked to the car body transform
    const p = dampedPitch * 0.45;
    const r = dampedRoll * 0.40;

    // Unit forward vector with subtle chassis tilt
    const cosP = Math.cos(p);
    const sinP = Math.sin(p);
    const sinH = Math.sin(car.heading);
    const cosH = Math.cos(car.heading);

    const fwdX = sinH * cosP;
    const fwdY = -sinP;
    const fwdZ = cosH * cosP;

    // Unit up vector
    const upX = -sinH * Math.sin(r);
    const upY = Math.cos(r) * cosP;
    const upZ = -cosH * Math.sin(r);

    const fwdDist = carLen * CAR_HOOD_SPECS.hoodForwardFraction; // ~1.056m forward
    const upDist = carHgt * CAR_HOOD_SPECS.hoodUpFraction; // ~0.802m up

    const posX = car.x + fwdX * fwdDist + upX * upDist;
    const posY = car.y + fwdY * fwdDist + upY * upDist;
    const posZ = car.z + fwdZ * fwdDist + upZ * upDist;

    // Look forward along heading (25m ahead)
    const lookDist = 25.0;
    const lookX = posX + fwdX * lookDist;
    const lookY = posY + fwdY * lookDist;
    const lookZ = posZ + fwdZ * lookDist;

    return {
      position: { x: posX, y: posY, z: posZ },
      lookAt: { x: lookX, y: lookY, z: lookZ },
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
