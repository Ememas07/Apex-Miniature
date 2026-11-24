import { carHasHybridErs, resolveCarSpecial } from './cars';
import type { SetupPhysicsModifiers } from './carSetup';
import type { CarSimState, ControlInput } from './physics';
import { getErsModeProfile } from './raceSystems';
import { CompiledTrack, sampleTrackAtT } from './tracks';
import tuningConfigRaw from './tuningConfig.json';
import { CarClassId } from './types';

export interface TuningConfig {
  downforceScale: number;
  brakeForceScale: number;
  dragScale: number;
  lowSpeedGripScale: number;
  aiCornerSpeedScale: number;
  aiBrakeMarginScale: number;
}

export const TUNING_BOUNDS = {
  downforceScale: [0.55, 1.35] as [number, number],
  brakeForceScale: [0.55, 1.35] as [number, number],
  dragScale: [0.65, 1.45] as [number, number],
  lowSpeedGripScale: [0.65, 1.30] as [number, number],
  aiCornerSpeedScale: [0.75, 1.00] as [number, number], // Strictly capped at 100% of physical tire grip
  aiBrakeMarginScale: [0.85, 1.40] as [number, number], // Cannot brake later than physical stopping distance
};

const clampNum = (v: number | undefined, min: number, max: number, fallback = 1.0) =>
  Math.max(min, Math.min(max, typeof v === 'number' && Number.isFinite(v) ? v : fallback));

function clampProfile(raw: Partial<TuningConfig> | undefined, fallback: TuningConfig): TuningConfig {
  return {
    downforceScale: clampNum(raw?.downforceScale, TUNING_BOUNDS.downforceScale[0], TUNING_BOUNDS.downforceScale[1], fallback.downforceScale),
    brakeForceScale: clampNum(raw?.brakeForceScale, TUNING_BOUNDS.brakeForceScale[0], TUNING_BOUNDS.brakeForceScale[1], fallback.brakeForceScale),
    dragScale: clampNum(raw?.dragScale, TUNING_BOUNDS.dragScale[0], TUNING_BOUNDS.dragScale[1], fallback.dragScale),
    lowSpeedGripScale: clampNum(raw?.lowSpeedGripScale, TUNING_BOUNDS.lowSpeedGripScale[0], TUNING_BOUNDS.lowSpeedGripScale[1], fallback.lowSpeedGripScale),
    aiCornerSpeedScale: clampNum(raw?.aiCornerSpeedScale, TUNING_BOUNDS.aiCornerSpeedScale[0], TUNING_BOUNDS.aiCornerSpeedScale[1], fallback.aiCornerSpeedScale),
    aiBrakeMarginScale: clampNum(raw?.aiBrakeMarginScale, TUNING_BOUNDS.aiBrakeMarginScale[0], TUNING_BOUNDS.aiBrakeMarginScale[1], fallback.aiBrakeMarginScale),
  };
}

const DEFAULT_FALLBACK_TUNING: TuningConfig = {
  downforceScale: 1.0,
  brakeForceScale: 1.0,
  dragScale: 1.0,
  lowSpeedGripScale: 1.0,
  aiCornerSpeedScale: 1.0,
  aiBrakeMarginScale: 1.0,
};

// Global base config
const rawGlobal: Partial<TuningConfig> =
  (tuningConfigRaw as any).global ??
  ((tuningConfigRaw as any).downforceScale !== undefined ? tuningConfigRaw : {});

export const GLOBAL_TUNING_CONFIG: TuningConfig = clampProfile(rawGlobal, DEFAULT_FALLBACK_TUNING);

/**
 * Resolves the specific tuning profile for a vehicle class, clamped within bounds.
 */
export function resolveTuningConfig(carClass?: CarClassId | string): TuningConfig {
  if (!carClass) return GLOBAL_TUNING_CONFIG;
  const classesMap = (tuningConfigRaw as any).classes;
  if (!classesMap || typeof classesMap !== 'object') {
    return GLOBAL_TUNING_CONFIG;
  }

  const str = String(carClass);
  const upper = str.toUpperCase();
  const lower = str.toLowerCase();
  const normalized = upper.replace(/[-\s]+/g, '_');

  const matched =
    classesMap[str] ||
    classesMap[upper] ||
    classesMap[lower] ||
    classesMap[normalized] ||
    (normalized.includes('GT3') ? classesMap['GT3'] : null) ||
    (normalized.includes('HYPER') || normalized.includes('GTP') ? classesMap['HYPERCAR_GTP'] : null) ||
    (normalized.includes('F1_2021') ? classesMap['F1_2021'] : null) ||
    (normalized.includes('F1_2005') ? classesMap['F1_2005'] : null) ||
    (normalized.includes('F1_2026') || normalized === 'F1' || normalized.includes('F1') ? classesMap['F1_2026'] : null) ||
    (normalized.includes('LMP2') ? classesMap['LMP2'] : null) ||
    (normalized.includes('GT4') ? classesMap['GT4'] : null);

  if (!matched) return GLOBAL_TUNING_CONFIG;
  return clampProfile(matched, GLOBAL_TUNING_CONFIG);
}

export const ACTIVE_TUNING_CONFIG: TuningConfig = GLOBAL_TUNING_CONFIG;

/**
 * Projects 3D track surface normal (longitudinal slope + lateral banking) onto the car's heading frame.
 */
export function computeRoadSurfaceTilt(
  sample: { tx: number; ty: number; tz: number; nx: number; nz: number; banking?: number },
  heading: number,
): { sinSlope: number; sinBank: number; pitchRad: number; rollRad: number } {
  const b = sample.banking || 0;
  const cosB = Math.cos(b);
  const sinB = Math.sin(b);
  const rx = sample.nx * cosB;
  const ry = sinB;
  const rz = sample.nz * cosB;

  const cx = ry * sample.tz - rz * sample.ty;
  const cy = rz * sample.tx - rx * sample.tz;
  const cz = rx * sample.ty - ry * sample.tx;
  const len = Math.hypot(cx, cy, cz) || 1;
  const nx = cx / len;
  const ny = cy / len;
  const nz = cz / len;
  const signNy = ny >= 0 ? 1 : -1;

  const sinH = Math.sin(heading);
  const cosH = Math.cos(heading);
  const sinSlope = Math.max(-0.55, Math.min(0.55, -(nx * sinH + nz * cosH) * signNy));
  const sinBank = Math.max(-0.55, Math.min(0.55, -(nx * (-cosH) + nz * sinH) * signNy));
  return {
    sinSlope,
    sinBank,
    pitchRad: Math.asin(sinSlope),
    rollRad: Math.asin(sinBank),
  };
}

/**
 * Shared class cornering grip & aerodynamic downforce curve used identically by physics & AI.
 */
export function computeClassGripProfile(
  classId: CarClassId,
  speed: number,
  tuningOverride?: TuningConfig,
  downforceMultiplier: number = 1.0,
): { classGripMult: number; classDownforceBonus: number } {
  const tuning = tuningOverride ?? resolveTuningConfig(classId);
  const dfScale = tuning.downforceScale * (downforceMultiplier || 1.0);
  switch (classId) {
    case CarClassId.F1_2026:
    case CarClassId.F1_2021:
    case CarClassId.F1_2005:
      return {
        classGripMult: 1.08,
        classDownforceBonus: 1.0 + Math.min(0.55, (speed / 65.0) * 0.55) * dfScale,
      };
    case CarClassId.HYPERCAR_GTP:
      return {
        classGripMult: 0.93,
        classDownforceBonus: 1.0 + Math.min(0.30, (speed / 72.0) * 0.30) * dfScale,
      };
    case CarClassId.LMP2:
      return {
        classGripMult: 0.86,
        classDownforceBonus: 1.0 + Math.min(0.20, speed / 80.0) * dfScale,
      };
    case CarClassId.FORMULA_E:
      return {
        classGripMult: 0.85,
        classDownforceBonus: 1.0 + Math.min(0.16, speed / 82.0) * dfScale,
      };
    case CarClassId.GT3:
      return {
        classGripMult: 0.84,
        classDownforceBonus: 1.0 + Math.min(0.18, speed / 76.0) * dfScale,
      };
    case CarClassId.SUPERCAR:
      return {
        classGripMult: 0.80,
        classDownforceBonus: 1.0 + Math.min(0.15, speed / 85.0) * dfScale,
      };
    case CarClassId.GT4:
      return {
        classGripMult: 0.77,
        classDownforceBonus: 1.0 + Math.min(0.13, speed / 85.0) * dfScale,
      };
    case CarClassId.TRACK_COUPE:
    default:
      return {
        classGripMult: 0.75,
        classDownforceBonus: 1.0 + Math.min(0.10, speed / 90.0) * dfScale,
      };
  }
}

/**
 * Computes high-speed cornering turbulent wake (dirty air) front-downforce loss when following
 * high-downforce cars closely through fast corners.
 */
export function computeDirtyAirStrength(
  car: Pick<CarSimState, 'id' | 'trackT' | 'lateralOffset' | 'speed' | 'pitStopRemaining' | 'carSpec'>,
  allCars: ReadonlyArray<Pick<CarSimState, 'id' | 'trackT' | 'lateralOffset' | 'speed' | 'pitStopRemaining' | 'carSpec'>>,
  trackLength: number,
  curvature: number,
  steerMag: number,
): number {
  if (car.pitStopRemaining > 0 || car.speed < 28) return 0;
  const cornerActivity = Math.max(steerMag, Math.min(1, Math.abs(curvature) * 55));
  if (cornerActivity < 0.14) return 0;

  const isHighDfSelf =
    car.carSpec.classId === CarClassId.F1_2026 ||
    car.carSpec.classId === CarClassId.F1_2021 ||
    car.carSpec.classId === CarClassId.F1_2005 ||
    car.carSpec.classId === CarClassId.HYPERCAR_GTP ||
    car.carSpec.classId === CarClassId.LMP2;
  const selfSensitivity = isHighDfSelf ? 1.0 : 0.45;
  const speedRamp = Math.max(0, Math.min(1, (car.speed - 28) / 36));

  let best = 0;
  for (let i = 0; i < allCars.length; i++) {
    const other = allCars[i];
    if (other.id === car.id || other.pitStopRemaining > 0) continue;
    let dT = other.trackT - car.trackT;
    if (dT < 0) dT += 1;
    const distAhead = dT * trackLength;
    if (distAhead < 2.2 || distAhead > 28.0) continue;
    const latDiff = Math.abs(other.lateralOffset - car.lateralOffset);
    if (latDiff > 4.2) continue;

    const leadWakeMult =
      other.carSpec.classId === CarClassId.F1_2026 ||
      other.carSpec.classId === CarClassId.F1_2021 ||
      other.carSpec.classId === CarClassId.F1_2005
        ? 1.0
        : other.carSpec.classId === CarClassId.HYPERCAR_GTP || other.carSpec.classId === CarClassId.LMP2
          ? 0.85
          : 0.55;
    const longFactor = Math.exp(-(distAhead - 2.2) / 10.5);
    const latFactor = Math.exp(-((latDiff / 2.6) * (latDiff / 2.6)));
    const val = longFactor * latFactor * speedRamp * cornerActivity * selfSensitivity * leadWakeMult;
    if (val > best) best = val;
  }
  return Math.max(0, Math.min(1, best));
}

/**
 * Computes vertical load multiplier over track crests (<1.0 unloading) and dips (>1.0 compression)
 * using the longitudinal slope derivative from `compiledTrack`.
 */
export function computeCrestLoadFactor(
  compiledTrack: CompiledTrack,
  trackT: number,
  speedMs: number,
): number {
  if (speedMs < 14) return 1.0;
  const ds = 8.0;
  const trackLen = Math.max(100, compiledTrack.totalLength);
  const dtStep = ds / trackLen;
  const prevSp = sampleTrackAtT(compiledTrack, (((trackT - dtStep) % 1) + 1) % 1);
  const nextSp = sampleTrackAtT(compiledTrack, (trackT + dtStep) % 1);
  // Positive dSlopeDs means curving upward (compression / dip); negative means cresting over a hilltop (unloading)
  const dSlopeDs = (nextSp.ty - prevSp.ty) / (2 * ds);
  const verticalAccelG = (speedMs * speedMs * dSlopeDs) / 9.81;
  return Math.max(0.62, Math.min(1.38, 1.0 + verticalAccelG * 0.65));
}

/**
 * Computes realistic continuous aerodynamic slipstream wake strength (0..1) for BOTH player and AI.
 * Begins subtly from ~48m behind a leading car and ramps up exponentially as the gap closes.
 */
export function computeSlipstreamStrength(
  car: Pick<CarSimState, 'id' | 'trackT' | 'lateralOffset' | 'speed' | 'pitStopRemaining'>,
  allCars: ReadonlyArray<Pick<CarSimState, 'id' | 'trackT' | 'lateralOffset' | 'speed' | 'pitStopRemaining'>>,
  trackLength: number,
): number {
  if (car.pitStopRemaining > 0 || car.speed < 14) return 0;
  const speedRamp = Math.max(0, Math.min(1, (car.speed - 14) / 20));
  const MAX_WAKE_M = 48.0;
  const MIN_WAKE_M = 1.8;
  const DECAY_LEN_M = 13.5;
  const tailFloor = Math.exp(-(MAX_WAKE_M - MIN_WAKE_M) / DECAY_LEN_M);

  let bestStrength = 0;
  for (let i = 0; i < allCars.length; i++) {
    const other = allCars[i];
    if (other.id === car.id || other.pitStopRemaining > 0) continue;
    let dT = other.trackT - car.trackT;
    if (dT < 0) dT += 1;
    const distAhead = dT * trackLength;
    if (distAhead <= MIN_WAKE_M || distAhead >= MAX_WAKE_M) continue;

    const latDiff = Math.abs(other.lateralOffset - car.lateralOffset);
    const latLimit = 2.65 + Math.min(1.1, distAhead * 0.022);
    if (latDiff >= latLimit) continue;

    // Exponential longitudinal wake: subtle from 35-48m, ramps sharply inside 15m
    const rawExp = Math.exp(-(distAhead - MIN_WAKE_M) / DECAY_LEN_M);
    const longFactor = Math.max(0, (rawExp - tailFloor) / (1 - tailFloor));

    // Smooth Gaussian lateral wake core
    const latSigma = 1.85 + distAhead * 0.015;
    const latFactor = Math.exp(-((latDiff / latSigma) * (latDiff / latSigma)));

    const strength = longFactor * latFactor * speedRamp;
    if (strength > bestStrength) bestStrength = strength;
  }
  return Math.max(0, Math.min(1, bestStrength));
}

/**
 * Updates class/car-specific special ability toggle state (DRS, Active Aero, Attack Mode, ERS Deploy, Overboost).
 */
export function updateCarSpecialActivation(
  car: CarSimState,
  input: ControlInput,
  dt: number,
  drsZoneEnforced: boolean | undefined,
  isNeutralized: boolean,
): { specialType: ReturnType<typeof resolveCarSpecial>['specialType']; hasHybridErs: boolean } {
  const resolvedSpecial = resolveCarSpecial(car.carSpec);
  const specialType = resolvedSpecial.specialType;
  const hasHybridErs = carHasHybridErs(car.carSpec);
  const isSpecialTriggered = input.specialJustPressed ?? input.specialPressed;

  switch (specialType) {
    case 'drs': {
      // Strictly F1 2021 only: requires DRS zone (& <1s gap in races), disabled under SC/VSC, auto-closes on braking or zone exit
      const drsAllowed = !isNeutralized && (!drsZoneEnforced || Boolean(car.drsEligible));
      if (isSpecialTriggered) {
        if (car.specialActive) {
          car.specialActive = false;
        } else if (drsAllowed && (car.inDrsZone || !drsZoneEnforced)) {
          car.specialActive = true;
        }
      }
      if (car.specialActive && (!drsAllowed || input.brake > 0.35 || (drsZoneEnforced && !car.inDrsZone))) {
        car.specialActive = false;
      }
      car.specialCharge = !isNeutralized && (car.drsEligible || !drsZoneEnforced) ? 100 : 0;
      break;
    }
    case 'active-aero': {
      // F1 2026 X-Mode straight-line active aero (NO DRS zone restriction; closes automatically under braking)
      if (isSpecialTriggered) {
        car.specialActive = !car.specialActive;
      }
      if (car.specialActive && input.brake > 0.35) {
        car.specialActive = false;
      }
      car.specialCharge = 100;
      break;
    }
    case 'attack-mode': {
      // Formula E ONLY: 2 uses per race, 15s duration AWD boost
      if (isSpecialTriggered) {
        if (car.specialActive) {
          car.specialActive = false;
          car.attackModeTimer = 0;
        } else if (car.attackModeUsesRemaining > 0 && car.attackModeTimer <= 0) {
          car.attackModeUsesRemaining -= 1;
          car.attackModeTimer = 15.0;
          car.specialActive = true;
        }
      }
      if (car.specialActive && car.attackModeTimer > 0) {
        car.attackModeTimer = Math.max(0, car.attackModeTimer - dt);
        car.specialCharge = Math.round((car.attackModeTimer / 15.0) * 100);
        if (car.attackModeTimer <= 0) {
          car.specialActive = false;
        }
      } else {
        car.specialActive = false;
        car.specialCharge = car.attackModeUsesRemaining * 50;
      }
      break;
    }
    case 'ers-overtake':
    case 'hybrid-deploy': {
      // GTP Hybrid Overtake deploy: draws directly from the standalone ersBattery
      if (isSpecialTriggered) {
        if (car.specialActive) {
          car.specialActive = false;
        } else if (car.ersBattery > 2) {
          car.specialActive = true;
        }
      }
      if (car.specialActive) {
        if (car.ersBattery > 0) {
          car.ersBattery = Math.max(0, car.ersBattery - dt * 18);
        }
        if (car.ersBattery <= 0) {
          car.specialActive = false;
        }
      } else {
        // MGU-H thermal regeneration when overtake deploy is toggled OFF
        car.ersBattery = Math.min(100, car.ersBattery + dt * 6.0);
      }
      car.specialCharge = Math.round(car.ersBattery);
      break;
    }
    case 'v10-overboost':
    case 'rich-fuel-overboost': {
      // Toggle ON/OFF for +8% power/RPM surge with +35% fuel burn while active; auto-OFF when depleted
      if (isSpecialTriggered) {
        if (car.specialActive) {
          car.specialActive = false;
        } else if (car.specialCharge > 2) {
          car.specialActive = true;
        }
      }
      if (car.specialActive) {
        if (car.specialCharge > 0) {
          car.specialCharge = Math.max(0, car.specialCharge - dt * 15);
        }
        if (car.specialCharge <= 0) {
          car.specialActive = false;
        }
      } else {
        car.specialCharge = Math.min(100, car.specialCharge + dt * 10);
      }
      break;
    }
    default: {
      car.specialActive = false;
      car.specialCharge = 0;
      break;
    }
  }

  return { specialType, hasHybridErs };
}

/**
 * Steps hybrid ERS battery regeneration/drain and computes active special speed, accel, and grip multipliers.
 */
export function computeErsAndSpecialMultipliers(
  car: CarSimState,
  input: ControlInput,
  dt: number,
  setupMod: SetupPhysicsModifiers,
  engineDmgFactor: number,
  specialType: ReturnType<typeof resolveCarSpecial>['specialType'],
  hasHybridErs: boolean,
): { specialSpeedMult: number; specialAccelMult: number; specialGripMult: number } {
  let ersModeSpeedBonus = 0;
  let ersModeAccelBonus = 0;
  if (hasHybridErs) {
    const mode = car.ersMode ?? 'balanced';
    const ersProf = getErsModeProfile(mode);
    // Kinetic MGU-K regeneration under braking (even while in balanced/overtake when braking hard)
    if (input.brake > 0.18 && car.speed > 10) {
      const regen = 18.0 * ersProf.harvestMult * input.brake * dt;
      car.ersBattery = Math.min(100, car.ersBattery + regen);
    }
    if (mode === 'harvest') {
      ersModeSpeedBonus = ersProf.topSpeedBonus;
      ersModeAccelBonus = ersProf.accelBonus;
      car.ersBattery = Math.min(
        100,
        car.ersBattery + Math.abs(ersProf.drainPerSec) * dt * (input.brake > 0.15 ? 1.5 : 0.85),
      );
    } else if (ersProf.drainPerSec > 0) {
      if (car.ersBattery > 2 && input.throttle > 0.25) {
        ersModeSpeedBonus = ersProf.topSpeedBonus;
        ersModeAccelBonus = ersProf.accelBonus;
        car.ersBattery = Math.max(0, car.ersBattery - ersProf.drainPerSec * dt * input.throttle);
      } else if (input.throttle <= 0.15) {
        car.ersBattery = Math.min(100, car.ersBattery + 3.0 * dt);
      }
    }
    if (specialType === 'ers-overtake' || specialType === 'hybrid-deploy') {
      car.specialCharge = Math.round(car.ersBattery);
    }
  } else {
    car.ersBattery = 0;
  }

  let specialSpeedMult = 1.0 + ersModeSpeedBonus;
  let specialAccelMult = (1.0 + ersModeAccelBonus) * setupMod.accelMult * engineDmgFactor;
  let specialGripMult = 1.0;
  if (car.specialActive) {
    if (specialType === 'drs') {
      // F1 2021 DRS: low-drag rear wing flap (+3.6% Vmax, slight corner grip drop)
      specialSpeedMult *= 1.036;
      specialAccelMult *= 1.05;
      specialGripMult = 0.86;
    } else if (specialType === 'active-aero') {
      // 2026 F1 X-Mode Active Aero: +3.8% low-drag straight Vmax (350-355 km/h), -25% cornering grip
      specialSpeedMult *= 1.038;
      specialAccelMult *= 1.06;
      specialGripMult = 0.75;
    } else if (specialType === 'attack-mode') {
      // Formula E ONLY: AWD launch & +15% power, +5.5% top speed (315-324 km/h)
      specialSpeedMult = 1.055;
      specialAccelMult *= 1.18;
      specialGripMult = 1.08;
    } else if (specialType === 'ers-overtake' || specialType === 'hybrid-deploy') {
      // Hypercar/GTP Hybrid Deploy: +12% mid/high-speed pull, +2.0% Vmax
      specialSpeedMult = 1.020 + ersModeSpeedBonus * 0.5;
      specialAccelMult *= 1.12;
    } else if (specialType === 'v10-overboost' || specialType === 'rich-fuel-overboost') {
      // 2005 F1 & Non-hybrid LMH: +8% power surge with +35% fuel burn
      specialSpeedMult = 1.026;
      specialAccelMult *= 1.08;
    }
  }

  return { specialSpeedMult, specialAccelMult, specialGripMult };
}
