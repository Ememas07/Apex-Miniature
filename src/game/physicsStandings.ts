import { CAR_CLASSES } from './cars';
import type { CarSimState, ControlInput } from './physics';
import { CompiledTrack, sampleTrackAtT } from './tracks';
import {
  AIDifficulty,
  CarClassId,
  CarSpec,
  DriverStandingsEntry,
  PitServiceAction,
  TcLevel,
  TireCompound,
} from './types';

export function getRollingFormationSpeedMs(cars: ReadonlyArray<{ carSpec: CarSpec }>): number {
  if (cars.length === 0) return 28;
  let minTopSpeed = Infinity;
  for (let i = 0; i < cars.length; i++) {
    const ts = cars[i].carSpec.attributes.topSpeed;
    if (ts < minTopSpeed) minTopSpeed = ts;
  }
  if (!Number.isFinite(minTopSpeed)) return 28;
  // ~34% of slowest class top speed, clamped to authentic 72–115 km/h (20–32 m/s) rolling pace
  return Math.max(20, Math.min(32, minTopSpeed * 0.34));
}

export function computeRollingFormationControl(
  car: CarSimState,
  compiledTrack: CompiledTrack,
  allCars: ReadonlyArray<CarSimState>,
  formationSpeedMs: number,
  targetLaneLat?: number,
): ControlInput {
  const trackLen = Math.max(100, compiledTrack.totalLength);
  const lookAheadDist = Math.max(18, Math.min(34, formationSpeedMs * 0.9));
  const spNow = sampleTrackAtT(compiledTrack, car.trackT);
  const spAhead = sampleTrackAtT(compiledTrack, (car.trackT + lookAheadDist / trackLen) % 1);
  const halfW = (spNow.width ?? compiledTrack.spec.trackWidth) * 0.5;

  const desiredLat =
    targetLaneLat !== undefined
      ? Math.max(-halfW * 0.65, Math.min(halfW * 0.65, targetLaneLat))
      : Math.max(-halfW * 0.55, Math.min(halfW * 0.55, car.lateralOffset));
  const latErr = desiredLat - car.lateralOffset;

  const trackHeading = Math.atan2(spAhead.tx, spAhead.tz);
  let headingErr = trackHeading - car.heading;
  while (headingErr > Math.PI) headingErr -= Math.PI * 2;
  while (headingErr < -Math.PI) headingErr += Math.PI * 2;

  const steer = Math.max(
    -1,
    Math.min(1, headingErr * 2.1 + (latErr / Math.max(3, halfW)) * 0.85),
  );

  // Check nearest car directly ahead in the same lane to maintain crisp 2x2 spacing
  let effectiveTargetSpeed = formationSpeedMs;
  for (let i = 0; i < allCars.length; i++) {
    const other = allCars[i];
    if (other.id === car.id) continue;
    let dt = other.trackT - car.trackT;
    if (dt > 0.5) dt -= 1;
    if (dt < -0.5) dt += 1;
    const relLong = dt * trackLen;
    if (relLong > 0.5 && relLong < 12.0 && Math.abs(other.lateralOffset - car.lateralOffset) < 2.2) {
      // Gently match or trim speed if closing within 9.5m of the car directly ahead in our column
      if (relLong < 9.5) {
        effectiveTargetSpeed = Math.min(effectiveTargetSpeed, Math.max(12, other.speed - (9.5 - relLong) * 0.7));
      }
    }
  }

  // Respect sharp final-corner curvature so rolling formation never slides off before S/F
  const spFar = sampleTrackAtT(compiledTrack, (car.trackT + 48 / trackLen) % 1);
  const absCurv = Math.max(Math.abs(spNow.curvature ?? 0), Math.abs(spAhead.curvature ?? 0), Math.abs(spFar.curvature ?? 0));
  if (absCurv > 0.015) {
    effectiveTargetSpeed = Math.min(effectiveTargetSpeed, Math.max(16, 34 - absCurv * 320));
  }

  const speedDiff = effectiveTargetSpeed - car.speed;
  const throttle = speedDiff > -0.4 ? Math.max(0, Math.min(0.85, 0.22 + speedDiff * 0.14)) : 0;
  const brake = speedDiff < -1.5 ? Math.max(0, Math.min(0.75, (-speedDiff - 1.5) * 0.12)) : 0;

  return {
    steer,
    throttle,
    brake,
    specialPressed: false,
  };
}

export function getDifficultyMultiplier(difficulty: AIDifficulty, adaptiveBoost = 0): number {
  const base =
    difficulty === 'Rookie'
      ? 0.84
      : difficulty === 'Amateur'
      ? 0.92
      : difficulty === 'Pro'
      ? 1.0
      : 1.07;
  return Math.max(0.75, Math.min(1.16, base + adaptiveBoost));
}

/**
 * Returns realistic fuel tank capacity in liters for a car class (used by Fuel HUD display).
 */
export function getClassFuelCapacityLiters(classId: CarClassId): number {
  switch (classId) {
    case CarClassId.HYPERCAR_GTP:
      return 90;
    case CarClassId.LMP2:
      return 75;
    case CarClassId.GT3:
      return 120;
    case CarClassId.GT4:
      return 100;
    case CarClassId.F1_2026:
    case CarClassId.F1_2021:
    case CarClassId.F1_2005:
      return 110;
    case CarClassId.FORMULA_E:
      return 52; // GEN3 Evo usable energy (kWh equivalent)
    case CarClassId.SUPERCAR:
      return 80;
    case CarClassId.TRACK_COUPE:
    default:
      return 65;
  }
}

/**
 * Rubberbanding removed: AI always races on full push with zero speed modulation relative to the player or pack.
 */
export function computeDynamicAiPackPace(
  _car: Pick<CarSimState, 'id' | 'isPlayer' | 'carSpec' | 'totalDistance' | 'finished'>,
  _allCars: ReadonlyArray<Pick<CarSimState, 'id' | 'isPlayer' | 'carSpec' | 'totalDistance' | 'finished'>>,
  _trackLength: number,
): number {
  return 1.0;
}

/**
 * Triggers or queues an on-track stationary pit service ('tyres' = 2.0s, 'fuel' = 4.0s)
 * whenever the player car is stopped on track (speed < 1.5 m/s).
 */
export function getPitServiceDuration(action: PitServiceAction): number {
  if (action === 'tyres') return 2.0;
  if (action === 'repair') return 3.0;
  return 4.0;
}

export function requestOnTrackPitStop(
  car: CarSimState,
  action: PitServiceAction,
  nextCompound?: TireCompound,
): boolean {
  if (car.finished || car.speed >= 1.5) {
    return false;
  }

  if (nextCompound) {
    car.pitStrategy = {
      ...car.pitStrategy,
      nextCompound,
    };
  }

  const duration = getPitServiceDuration(action);

  if (car.pitStopRemaining <= 0) {
    car.speed = 0;
    car.vx = 0;
    car.vz = 0;
    car.pitActiveTask = action;
    car.pitStopRemaining = duration;
    car.pitStopTotal = duration;
    car.pitQueue = [];
    return true;
  }

  if (car.pitActiveTask !== action && !car.pitQueue.includes(action)) {
    car.pitQueue.push(action);
    car.pitStopTotal += duration;
    return true;
  }

  return false;
}

export function computeStandings(cars: CarSimState[], compiledTrack: CompiledTrack): DriverStandingsEntry[] {
  const effectiveTime = (c: CarSimState) => c.totalTime + (c.postRacePenaltySeconds ?? 0);
  const sorted = [...cars].sort((a, b) => {
    const aElim = Boolean(a.eliminated);
    const bElim = Boolean(b.eliminated);
    if (aElim !== bElim) return aElim ? 1 : -1;
    if (aElim && bElim) return b.totalDistance - a.totalDistance;
    if (a.finished && !b.finished) return -1;
    if (!a.finished && b.finished) return 1;
    if (a.finished && b.finished) return effectiveTime(a) - effectiveTime(b);
    return b.totalDistance - a.totalDistance;
  });

  const classCounters = new Map<CarClassId, number>();
  const leader = sorted[0];

  // Use a stable track reference pace (never instantaneous hairpin vs straight speed) so gaps never invert or spike
  const trackNominalRefSpeed =
    compiledTrack.spec.targetLapSeconds > 10
      ? Math.max(36, compiledTrack.totalLength / compiledTrack.spec.targetLapSeconds)
      : 54;
  let prevIntervalToLeader = 0;

  return sorted.map((c, idx) => {
    const classPos = (classCounters.get(c.carSpec.classId) ?? 0) + 1;
    classCounters.set(c.carSpec.classId, classPos);

    const ahead = idx > 0 ? sorted[idx - 1] : null;
    const classPace = CAR_CLASSES[c.carSpec.classId]?.basePaceIndex ?? 0.95;
    const stableRefSpeed = Math.max(30, trackNominalRefSpeed * classPace);

    let intervalToLeaderSec = 0;
    if (idx > 0) {
      if (leader.finished && c.finished) {
        intervalToLeaderSec = Math.max(0, effectiveTime(c) - effectiveTime(leader));
      } else if (leader.finished && !c.finished) {
        const remainingLaps = Math.max(0, leader.lap - c.totalDistance);
        const elapsedSinceLeader = Math.max(0, effectiveTime(c) - effectiveTime(leader));
        intervalToLeaderSec = elapsedSinceLeader + (remainingLaps * compiledTrack.totalLength) / stableRefSpeed;
      } else {
        const distDiffLeader = Math.max(0, (leader.totalDistance - c.totalDistance) * compiledTrack.totalLength);
        intervalToLeaderSec = distDiffLeader / stableRefSpeed;
      }
      // Guarantee monotonic intervals relative to standings order so relative deltas never invert sign
      if (intervalToLeaderSec < prevIntervalToLeader) {
        intervalToLeaderSec = prevIntervalToLeader;
      }
    }

    let intervalToAheadSec = 0;
    if (ahead) {
      if (ahead.finished && c.finished) {
        intervalToAheadSec = Math.max(0, effectiveTime(c) - effectiveTime(ahead));
      } else if (ahead.finished && !c.finished) {
        const remainingLaps = Math.max(0, ahead.lap - c.totalDistance);
        const elapsedSinceAhead = Math.max(0, effectiveTime(c) - effectiveTime(ahead));
        intervalToAheadSec = elapsedSinceAhead + (remainingLaps * compiledTrack.totalLength) / stableRefSpeed;
      } else {
        const distDiffAhead = Math.max(0, (ahead.totalDistance - c.totalDistance) * compiledTrack.totalLength);
        intervalToAheadSec = distDiffAhead / stableRefSpeed;
      }
    }
    prevIntervalToLeader = intervalToLeaderSec;

    return {
      id: c.id,
      name: c.name,
      isPlayer: c.isPlayer,
      isHumanPeer: c.isHumanPeer,
      carId: c.carSpec.id,
      classId: c.carSpec.classId,
      driverNumber: c.livery.driverNumber,
      nationality: c.aiNationality,
      teamName: c.aiTeamName,
      personality: c.personality,
      position: idx + 1,
      classPosition: classPos,
      lap: c.lap,
      progress: c.trackT,
      totalDistance: c.totalDistance,
      intervalToAhead: Number(intervalToAheadSec.toFixed(2)),
      intervalToLeader: Number(intervalToLeaderSec.toFixed(2)),
      bestLapTime: c.bestLapTime,
      lastLapTime: c.lastLapTime,
      totalTime: effectiveTime(c),
      postRacePenaltySeconds: c.postRacePenaltySeconds ?? 0,
      pitStops: c.pitStops,
      inPit: c.pitStopRemaining > 0,
      finished: c.finished,
      eliminated: Boolean(c.eliminated),
      primaryColor: c.livery.primaryColor,
      secondaryColor: c.livery.secondaryColor,
    };
  });
}

export function formatLapTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '--:--.--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs.toFixed(2)}`;
}

export type CarDrivetrain = 'rwd' | 'fwd' | 'awd';

/**
 * Resolves the real-world drivetrain layout for a car so TC only monitors
 * rear-axle slip on RWD cars, front-axle slip on FWD cars, and both on AWD cars.
 */
export function getCarDrivetrain(carId: string, classId: CarClassId): CarDrivetrain {
  if (carId === 'honda-civic-type-r') return 'fwd';
  if (
    carId === 'nissan-gtr-nismo' ||
    carId === 'porsche-918-spyder' ||
    classId === CarClassId.FORMULA_E
  ) {
    return 'awd';
  }
  return 'rwd';
}

/**
 * Returns whether the car is equipped with Traction Control in real life.
 * F1 2026, F1 2021, Formula E, and the Renault Clio V6 Phase 2 do not have TC IRL.
 */
export function isCarTcEquipped(classId: CarClassId, carId?: string): boolean {
  if (carId === 'renault-clio-v6') return false;
  if (
    classId === CarClassId.F1_2026 ||
    classId === CarClassId.F1_2021 ||
    classId === CarClassId.FORMULA_E
  ) {
    return false;
  }
  return true;
}

/**
 * Resolves the authentic class-default Traction Control level when settings.tcDefault === 'auto'.
 * Forces TC OFF (0) on cars that do not have Traction Control IRL.
 */
export function resolveClassDefaultTc(
  classId: CarClassId,
  setting: 'auto' | TcLevel,
  carId?: string,
): TcLevel {
  if (!isCarTcEquipped(classId, carId)) return 0;
  if (setting !== 'auto') return setting;
  switch (classId) {
    case CarClassId.GT3:
    case CarClassId.GT4:
      return 2;
    case CarClassId.HYPERCAR_GTP:
    case CarClassId.LMP2:
    case CarClassId.F1_2005:
    case CarClassId.SUPERCAR:
    case CarClassId.TRACK_COUPE:
      return 1;
    default:
      return 0;
  }
}

/**
 * Rare "Getting Mecachromed" mechanical failure easter egg (player-only).
 * When triggered, drops engine output by 92% for 5.0s with white smoke, then recovers automatically.
 * Returns true on the exact tick it triggers so UI/radio/audio can alert the driver.
 */
export function tryStepMecachromeEvent(
  car: CarSimState,
  dt: number,
  rng: () => number = Math.random,
): boolean {
  if (!car.isPlayer || car.finished || car.pitStopRemaining > 0) return false;
  if (car.carSpec.classId === CarClassId.FORMULA_E) return false; // EVs don't blow ICE pistons

  if (car.mecachromeActive) {
    car.mecachromeTimer = Math.max(0, (car.mecachromeTimer ?? 0) - dt);
    if (car.mecachromeTimer <= 0) {
      car.mecachromeActive = false;
      car.mecachromeCooldown = 140;
    }
    return false;
  }

  if ((car.mecachromeCooldown ?? 0) > 0) {
    car.mecachromeCooldown = Math.max(0, (car.mecachromeCooldown ?? 0) - dt);
    return false;
  }

  // Only roll at high speed on full throttle past lap 1 (approx ~1 in 450s average)
  const throttle = car.lastInputThrottle ?? 0;
  if (car.lap >= 1 && car.speed > 42 && throttle > 0.85) {
    const chancePerSec = 0.0022;
    if (rng() < chancePerSec * dt) {
      car.mecachromeActive = true;
      car.mecachromeTimer = 5.0;
      return true;
    }
  }
  return false;
}
