import { CAR_CLASSES, getCarById, resolveCarSpecial, getCarBoP, BoPMultipliers } from './cars';
import { CompiledTrack, projectOntoTrack, sampleTrackAtT } from './tracks';
import tuningConfigRaw from './tuningConfig.json';
import {
  AIDifficulty,
  AIPersonality,
  CarClassId,
  CarSpec,
  DriverStandingsEntry,
  LiveryConfig,
  PitServiceAction,
  PitStrategy,
  TireCompound,
} from './types';

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

export const SPEED_KMH_FACTOR = 3.6;

export interface ControlInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (left) .. +1 (right)
  specialPressed: boolean; // edge-triggered or held depending on class
  specialJustPressed?: boolean; // edge-triggered activation
  shiftUp?: boolean;
  shiftDown?: boolean;
}

export interface CarSimState {
  id: string;
  name: string;
  isPlayer: boolean;
  isHumanPeer: boolean;
  carSpec: CarSpec;
  livery: LiveryConfig;
  personality?: AIPersonality;
  transmissionMode?: 'auto' | 'manual';
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  heading: number; // radians; 0 = +Z, atan2(tx, tz)
  speed: number; // m/s forward scalar
  steerAngle: number; // visual wheel angle
  lap: number; // 1-indexed current lap
  trackT: number; // 0..1 normalized position
  prevTrackT: number;
  totalDistance: number; // laps + trackT
  lateralOffset: number;
  currentLapTime: number;
  bestLapTime: number | null;
  lastLapTime: number | null;
  totalTime: number;
  compound: TireCompound;
  tireWear: number; // 100 down to 0
  tireTemp: number; // Celsius (50..125)
  fuel: number; // 100 down to 0
  fuelLapsRemaining: number; // estimated laps of fuel remaining
  aeroDamage: number; // 0..100
  specialCharge: number; // 0..100
  specialActive: boolean;
  attackModeUsesRemaining: number;
  attackModeTimer: number;
  inSlipstream: boolean;
  understeerFactor: number; // 0..1
  lateralSlip: number; // 0..1 tire lateral scrub intensity
  onKerb: boolean; // currently riding corner kerb rumble strips
  warningCount: number;
  offTrackCooldown: number;
  penaltyTimeRemaining: number;
  pitStopRemaining: number;
  pitStopTotal: number;
  pitActiveTask: PitServiceAction | null;
  pitQueue: PitServiceAction[];
  pitStops: number;
  pitCooldown: number;
  pitStrategy: PitStrategy;
  flashingHeadlights: boolean;
  finished: boolean;
  gear: number;
  rpmNormalized: number;
  revLimiterTimer?: number;
  revLimiterActive?: boolean;
  aiTargetOffset: number;
  aiPassTimer: number;
  aiPaceMultiplier: number;
  aiStuckTimer: number;
  aiPrevHeadingErr: number;
  wallCollisionCooldown?: number;
  pitch?: number; // radians (+ = nose up)
  roll?: number; // radians (+ = right side raised)
  yawRate?: number;
  bopEnabled?: boolean;
  bopMultipliers?: BoPMultipliers;
}

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
        classGripMult: 0.88,
        classDownforceBonus: 1.0 + Math.min(0.22, speed / 78.0) * dfScale,
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

export function createCarSimState(params: {
  id: string;
  name: string;
  isPlayer: boolean;
  isHumanPeer?: boolean;
  carId: string;
  livery: LiveryConfig;
  gridSlot: number;
  compiledTrack: CompiledTrack;
  compound: TireCompound;
  personality?: AIPersonality;
  aiPaceMultiplier?: number;
  transmissionMode?: 'auto' | 'manual';
  bopEnabled?: boolean;
}): CarSimState {
  const bopEnabled = params.bopEnabled ?? true;
  const bop = bopEnabled ? getCarBoP(params.carId) : { topSpeedMult: 1.0, gripMult: 1.0, downforceMult: 1.0, brakingMult: 1.0 };
  const carSpec = getCarById(params.carId);
  const row = Math.floor(params.gridSlot / 2);
  const col = params.gridSlot % 2;
  // Authentic staggered 2-by-2 starting grid spacing (~7.5m per row / ~3.75m stagger)
  const rowSpacing = 7.5;
  const colStagger = 3.75;
  const baseStartOffset = 12.0; // 12m behind start/finish line for Pole Position
  const distBehindStartLine = baseStartOffset + row * rowSpacing + col * colStagger;
  const trackLength = Math.max(100, params.compiledTrack.totalLength);
  const deltaT = distBehindStartLine / trackLength;
  const startT = (((1.0 - deltaT) % 1) + 1) % 1;
  const sp = sampleTrackAtT(params.compiledTrack, startT);
  const halfW = params.compiledTrack.spec.trackWidth * 0.5;
  const latOffset = Math.min(2.8, Math.max(1.8, halfW * 0.38));
  const lat = (col === 0 ? -1 : 1) * latOffset;
  const x = sp.x + sp.nx * lat;
  const z = sp.z + sp.nz * lat;
  const heading = Math.atan2(sp.tx, sp.tz);

  return {
    id: params.id,
    name: params.name,
    isPlayer: params.isPlayer,
    isHumanPeer: params.isHumanPeer ?? false,
    carSpec,
    livery: params.livery,
    personality: params.personality,
    x,
    y: sp.y,
    z,
    vx: 0,
    vz: 0,
    heading,
    speed: 0,
    steerAngle: 0,
    lap: 1,
    trackT: startT,
    prevTrackT: startT,
    totalDistance: -distBehindStartLine, // exact meters remaining to S/F line on lap 1
    lateralOffset: lat,
    currentLapTime: 0,
    bestLapTime: null,
    lastLapTime: null,
    totalTime: 0,
    compound: params.compound,
    tireWear: 100,
    tireTemp: 72,
    fuel: 100,
    fuelLapsRemaining: 14.3,
    aeroDamage: 0,
    specialCharge: 100,
    specialActive: false,
    attackModeUsesRemaining: 2,
    attackModeTimer: 0,
    inSlipstream: false,
    understeerFactor: 0,
    lateralSlip: 0,
    onKerb: false,
    warningCount: 0,
    offTrackCooldown: 0,
    penaltyTimeRemaining: 0,
    pitStopRemaining: 0,
    pitStopTotal: 0,
    pitActiveTask: null,
    pitQueue: [],
    pitStops: 0,
    pitCooldown: 0,
    pitStrategy: {
      nextCompound: params.compound,
    },
    flashingHeadlights: false,
    finished: false,
    gear: 1,
    rpmNormalized: 0.18,
    transmissionMode: params.transmissionMode ?? 'auto',
    aiTargetOffset: lat * 0.4,
    aiPassTimer: 0,
    aiPaceMultiplier: params.aiPaceMultiplier ?? 1.0,
    aiStuckTimer: 0,
    aiPrevHeadingErr: 0,
    wallCollisionCooldown: 0,
    pitch: 0,
    roll: 0,
    yawRate: 0,
    bopEnabled,
    bopMultipliers: bop,
  };
}

export function getCompoundModifiers(compound: TireCompound, trackWetness: number): {
  grip: number;
  wearRate: number;
  optimalTemp: number;
} {
  const wetPenalty = trackWetness;
  switch (compound) {
    case 'soft':
      return {
        grip: 1.08 * (1 - wetPenalty * 0.36),
        wearRate: 1.45,
        optimalTemp: 95,
      };
    case 'medium':
      return {
        grip: 1.0 * (1 - wetPenalty * 0.30),
        wearRate: 1.0,
        optimalTemp: 88,
      };
    case 'hard':
      return {
        grip: 0.94 * (1 - wetPenalty * 0.25),
        wearRate: 0.65,
        optimalTemp: 82,
      };
    case 'wet':
      return {
        grip: 0.90 + wetPenalty * 0.17, // Shines in rain, slower/hotter on dry asphalt
        wearRate: trackWetness < 0.2 ? 1.85 : 0.85,
        optimalTemp: 68,
      };
  }
}

export function getDifficultyMultiplier(difficulty: AIDifficulty, adaptiveBoost: number): number {
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

export function computeUpdatedAdaptiveBoost(
  currentBoost: number,
  playerBestLap: number | null,
  targetLapSeconds: number,
  classPaceIndex: number,
): number {
  if (!playerBestLap || playerBestLap <= 5) return currentBoost;
  const expectedLap = targetLapSeconds / classPaceIndex;
  const ratio = expectedLap / playerBestLap; // > 1 if player is faster than expected
  const delta = (ratio - 1) * 0.18;
  return Math.max(-0.06, Math.min(0.08, Number((currentBoost * 0.6 + delta).toFixed(4))));
}

/**
 * Resolves car contact against barriers, guardrails and invisible pit walls:
 * 1. Depenetration: pushes car out of wall collision normal (normal * depth + 0.05m) every frame
 * 2. Tangent wall-sliding: projects velocity onto wall tangent (v_slide = v - (v . n)n) with 0.07 scraping friction and 0.15 restitution
 * 3. Outward yaw alignment toward wall tangent so car glances off smoothly instead of sticking dead
 * 4. Damage: ignores impacts < 25 km/h (0 damage); heavy impacts accumulated at 0.25x rate with 0.5s cooldown
 */
export function resolveWallContact(
  car: CarSimState,
  sample: { nx: number; nz: number; tx: number; tz: number },
  wallLat: number,
  side: 1 | -1, // 1 = car struck right wall (+lateral), -1 = car struck left wall (-lateral)
  dt: number,
): void {
  const penetration = side === 1 ? car.lateralOffset - wallLat : wallLat - car.lateralOffset;
  if (penetration <= 0) return;

  // Depenetration: push car out along collision normal (-side * n)
  const pushDist = penetration + 0.05;
  car.x -= sample.nx * (side * pushDist);
  car.z -= sample.nz * (side * pushDist);
  car.lateralOffset = side === 1 ? wallLat - 0.05 : wallLat + 0.05;

  // Velocity projection onto wall tangent: v_slide = v - (v . n)n
  const vNorm = side * (car.vx * sample.nx + car.vz * sample.nz);
  const vTan = car.vx * sample.tx + car.vz * sample.tz;

  // Tangent slide with modest scraping friction (0.07) and gentle restitution (0.15)
  const vSlide = vTan * 0.93;
  const vBounce = vNorm > 0 ? -0.15 * vNorm : 0;

  car.vx = vSlide * sample.tx + (side * vBounce) * sample.nx;
  car.vz = vSlide * sample.tz + (side * vBounce) * sample.nz;
  car.speed = Math.max(0, vSlide);

  // Outward yaw alignment toward wall tangent so car glances off smoothly
  const wallHeading = Math.atan2(sample.tx, sample.tz);
  let headingDiff = wallHeading - car.heading;
  while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
  while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
  car.heading += headingDiff * Math.min(1.0, dt * 8.5);

  // Collision damage threshold & cooldown:
  // Ignore low-speed grazing impacts below 25 km/h (6.944 m/s) -> 0 damage
  const impactSpeed = Math.max(0, vNorm);
  const DAMAGE_THRESHOLD_SPEED = 25 / SPEED_KMH_FACTOR; // 6.944 m/s
  if (impactSpeed >= DAMAGE_THRESHOLD_SPEED && (!car.wallCollisionCooldown || car.wallCollisionCooldown <= 0)) {
    // 75% reduced damage accumulation (0.25x rate) with 0.5s cooldown
    const heavyDmg = (impactSpeed - DAMAGE_THRESHOLD_SPEED) * 0.25;
    car.aeroDamage = Math.min(100, car.aeroDamage + Math.min(5.0, heavyDmg));
    car.wallCollisionCooldown = 0.5;
  }
}

/**
 * Triggers or queues an on-track stationary pit service ('tyres' = 2.0s, 'fuel' = 4.0s)
 * whenever the player car is stopped on track (speed < 1.5 m/s).
 */
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

  const duration = action === 'tyres' ? 2.0 : 4.0;

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

/**
 * Steps a single car's sim-cade physics for `dt` seconds.
 */
export function stepCarPhysics(
  car: CarSimState,
  input: ControlInput,
  compiledTrack: CompiledTrack,
  dt: number,
  opts: {
    trackWetness: number;
    totalLaps: number;
    isQualifying: boolean;
    allCars: CarSimState[];
    bopEnabled?: boolean;
  },
): void {
  if (car.finished) {
    car.speed *= Math.max(0, 1 - 1.5 * dt);
    car.vx = Math.sin(car.heading) * car.speed;
    car.vz = Math.cos(car.heading) * car.speed;
    car.x += car.vx * dt;
    car.z += car.vz * dt;
    return;
  }

  const classMeta = CAR_CLASSES[car.carSpec.classId];
  const attrs = car.carSpec.attributes;

  // Handle active on-track stationary pit stop hold
  if (car.pitStopRemaining > 0) {
    car.speed = 0;
    car.vx = 0;
    car.vz = 0;
    car.pitStopRemaining = Math.max(0, car.pitStopRemaining - dt);
    car.currentLapTime += dt;
    car.totalTime += dt;
    if (car.pitStopRemaining === 0) {
      const completedTask = car.pitActiveTask;
      if (completedTask === 'tyres') {
        car.compound = car.pitStrategy.nextCompound;
        car.tireWear = 100;
        car.tireTemp = 72;
        car.aeroDamage = Math.max(0, car.aeroDamage - 25);
      } else if (completedTask === 'fuel') {
        car.fuel = 100;
        car.fuelLapsRemaining = Math.max(12, car.fuelLapsRemaining);
      } else {
        car.compound = car.pitStrategy.nextCompound;
        car.tireWear = 100;
        car.tireTemp = 72;
        car.fuel = 100;
        car.aeroDamage = 0;
      }

      if (car.pitQueue.length > 0) {
        const nextTask = car.pitQueue.shift()!;
        car.pitActiveTask = nextTask;
        car.pitStopRemaining = nextTask === 'tyres' ? 2.0 : 4.0;
      } else {
        car.pitActiveTask = null;
        car.pitStopTotal = 0;
        car.pitStops += 1;
        car.pitCooldown = 3.0;
      }
    }
    return;
  }

  const halfW = compiledTrack.spec.trackWidth * 0.5;

  // Class / car-specific special activation / toggle
  const resolvedSpecial = resolveCarSpecial(car.carSpec);
  const specialType = resolvedSpecial.specialType;
  const isSpecialTriggered = input.specialJustPressed ?? input.specialPressed;

  switch (specialType) {
    case 'active-aero': {
      if (isSpecialTriggered) {
        car.specialActive = !car.specialActive;
      }
      if (car.specialActive && input.brake > 0.35) {
        // Braking automatically closes low-drag wing back to high-downforce corner mode
        car.specialActive = false;
      }
      break;
    }
    case 'attack-mode': {
      // 2 uses per race, 15s duration: enables AWD acceleration boost and +15% power
      if (isSpecialTriggered && car.attackModeUsesRemaining > 0 && car.attackModeTimer <= 0) {
        car.attackModeUsesRemaining -= 1;
        car.attackModeTimer = 15.0;
        car.specialActive = true;
      }
      if (car.attackModeTimer > 0) {
        car.attackModeTimer = Math.max(0, car.attackModeTimer - dt);
        car.specialCharge = Math.round((car.attackModeTimer / 15.0) * 100);
        if (car.attackModeTimer <= 0) {
          car.specialActive = false;
        }
      } else {
        car.specialCharge = car.attackModeUsesRemaining * 50;
      }
      break;
    }
    case 'ers-overtake':
    case 'hybrid-deploy': {
      // Hold or toggle to deploy rechargeable battery for +15% acceleration
      if (input.specialPressed && car.specialCharge > 1) {
        car.specialActive = true;
        car.specialCharge = Math.max(0, car.specialCharge - dt * 20);
      } else {
        car.specialActive = false;
      }
      if (!car.specialActive) {
        // Recharges under braking
        const rechargeRate = input.brake > 0.2 ? 22 : 3.5;
        car.specialCharge = Math.min(100, car.specialCharge + dt * rechargeRate);
      }
      break;
    }
    case 'v10-overboost':
    case 'rich-fuel-overboost': {
      // Temporary +8% power/RPM surge with +35% fuel burn while active (NA V10 / Valkyrie / Glickenhaus)
      if (input.specialPressed && car.specialCharge > 2) {
        car.specialActive = true;
        car.specialCharge = Math.max(0, car.specialCharge - dt * 15);
      } else {
        car.specialActive = false;
        car.specialCharge = Math.min(100, car.specialCharge + dt * 10);
      }
      break;
    }
    case 'high-beam-flash': {
      // Flashes headlights and signals slower traffic ahead to yield
      car.specialActive = Boolean(input.specialPressed);
      car.flashingHeadlights = car.specialActive;
      break;
    }
    default: {
      car.specialActive = false;
      break;
    }
  }

  // Prototype / GT High-Beam flash signals slower traffic ahead to yield cleanly toward its nearest open edge
  if (car.flashingHeadlights) {
    for (let i = 0; i < opts.allCars.length; i++) {
      const other = opts.allCars[i];
      if (other.id === car.id || other.pitStopRemaining > 0 || other.isPlayer) continue;
      let dT = other.trackT - car.trackT;
      while (dT > 0.5) dT -= 1;
      while (dT < -0.5) dT += 1;
      const distAhead = dT * compiledTrack.totalLength;
      if (distAhead > 1.5 && distAhead < 28 && other.speed < car.speed + 2) {
        const yieldSide = other.lateralOffset >= car.lateralOffset ? 1 : -1;
        const maxYield = Math.max(2.0, halfW - 2.0);
        other.aiTargetOffset = yieldSide * Math.min(maxYield, 4.2);
        other.aiPassTimer = 1.6;
      }
    }
  }

  // Slipstream detection (within 1.5..14m ahead and +/-2.8m laterally)
  let inSlipstream = false;
  for (let i = 0; i < opts.allCars.length; i++) {
    const other = opts.allCars[i];
    if (other.id === car.id) continue;
    let dT = other.trackT - car.trackT;
    if (dT < 0) dT += 1;
    const distAhead = dT * compiledTrack.totalLength;
    if (distAhead > 1.8 && distAhead < 14.5 && Math.abs(other.lateralOffset - car.lateralOffset) < 2.9) {
      inSlipstream = true;
      break;
    }
  }
  car.inSlipstream = inSlipstream;

  // Compute physical performance scalars & Balance of Performance
  if (opts.bopEnabled !== undefined) {
    car.bopEnabled = opts.bopEnabled;
  }
  const bop = (car.bopEnabled !== false)
    ? (car.bopMultipliers ?? getCarBoP(car.carSpec.id))
    : { topSpeedMult: 1.0, gripMult: 1.0, downforceMult: 1.0, brakingMult: 1.0 };

  const paceScale = classMeta.basePaceIndex;
  const tuning = resolveTuningConfig(car.carSpec?.classId);
  const classId = car.carSpec.classId;
  const isGTP = classId === CarClassId.HYPERCAR_GTP;
  const isLMP2 = classId === CarClassId.LMP2;
  const isGT3 = classId === CarClassId.GT3;
  const isGT4 = classId === CarClassId.GT4;
  const isF126 = classId === CarClassId.F1_2026;
  const isF121 = classId === CarClassId.F1_2021;
  const isF105 = classId === CarClassId.F1_2005;
  const isFE = classId === CarClassId.FORMULA_E;
  const isCoupe = classId === CarClassId.TRACK_COUPE;
  const isSupercar = classId === CarClassId.SUPERCAR;
  const isFormula = isF126 || isF121 || isF105 || isFE;

  // 1:1 Metric Scale Top Speeds (m/s):
  // F1: 325-355 km/h (with active-aero/ERS), GTP: 330-345 km/h, LMP2: 315-325 km/h,
  // GT3: 285-300 km/h, GT4: 260-275 km/h, FE: 300-324 km/h, Coupe: 247-313 km/h, Supercar: 330-427 km/h
  const maxSpeedBase = (isF126
    ? 93.8 + (attrs.topSpeed - 90) * 0.35
    : isF121
    ? 95.2 + (attrs.topSpeed - 90) * 0.35
    : isF105
    ? 95.0 + (attrs.topSpeed - 92) * 0.35
    : isGTP
    ? 93.3 + (attrs.topSpeed - 86) * 0.25
    : isLMP2
    ? 87.5 + (attrs.topSpeed - 78) * 0.46
    : isGT3
    ? 79.2 + (attrs.topSpeed - 74) * 0.51
    : isGT4
    ? 72.2 + (attrs.topSpeed - 67) * 0.42
    : isFE
    ? 83.0 + (attrs.topSpeed - 77) * 0.55
    : isCoupe
    ? 68.5 + (attrs.topSpeed - 64) * 1.02
    : 91.5 + (attrs.topSpeed - 83) * 1.70) * bop.topSpeedMult;

  // Calibrated class launch acceleration (m/s^2) producing authentic 0-100 & 0-200 km/h splits
  const accelAttrNorm = Math.max(-1, Math.min(1.5, (attrs.acceleration - 80) / 20));
  const accelBase = isF126 || isF121 || isF105
    ? 15.8 + (attrs.acceleration - 90) * 0.18
    : isFE
    ? 12.6 + (attrs.acceleration - 84) * 0.22
    : isGTP
    ? 11.6 + (attrs.acceleration - 85) * 0.16
    : isLMP2
    ? 10.7 + (attrs.acceleration - 80) * 0.16
    : isGT3
    ? 9.9 + (attrs.acceleration - 77) * 0.16
    : isGT4
    ? 7.9 + (attrs.acceleration - 70) * 0.16
    : isCoupe
    ? 6.2 + Math.max(0, attrs.acceleration - 64) * 0.18
    : 12.2 + accelAttrNorm * 1.4;

  const gripBase =
    (1.42 + (attrs.corneringGrip / 100) * 1.15) *
    (0.75 + paceScale * 0.25) *
    tuning.lowSpeedGripScale *
    bop.gripMult;
  const brakeMultiplier = isSupercar ? 0.85 : isCoupe ? 0.85 : isGT4 ? 0.88 : 1.0;
  const brakeBase =
    (24 + (attrs.braking / 100) * 15) *
    (0.65 + paceScale * 0.35) *
    brakeMultiplier *
    tuning.brakeForceScale *
    bop.brakingMult;

  const compoundMod = getCompoundModifiers(car.compound, opts.trackWetness);
  const wearGripFactor = 0.72 + 0.28 * Math.pow(car.tireWear / 100, 0.7);
  const damageFactor = 1 - (car.aeroDamage / 100) * 0.11;
  const fuelFactor = car.fuel > 0 ? 1.0 : 0.45;

  let specialSpeedMult = 1.0;
  let specialAccelMult = 1.0;
  let specialGripMult = 1.0;
  if (car.specialActive) {
    if (specialType === 'active-aero') {
      // 2026 F1: +3.8% low-drag straight Vmax (350-355 km/h), -25% cornering grip
      specialSpeedMult = 1.038;
      specialAccelMult = 1.06;
      specialGripMult = 0.75;
    } else if (specialType === 'attack-mode') {
      // Formula E: AWD launch & +15% power, +5.5% top speed (315-324 km/h)
      specialSpeedMult = 1.055;
      specialAccelMult = 1.18;
      specialGripMult = 1.08;
    } else if (specialType === 'ers-overtake' || specialType === 'hybrid-deploy') {
      // 2021 F1 & Hypercar: +12% mid/high-speed pull, +2.0% Vmax
      specialSpeedMult = 1.020;
      specialAccelMult = 1.12;
    } else if (specialType === 'v10-overboost' || specialType === 'rich-fuel-overboost') {
      // 2005 F1 & Non-hybrid LMH: +8% power surge with +35% fuel burn
      specialSpeedMult = 1.026;
      specialAccelMult = 1.08;
    }
  }

  const slipstreamMult = inSlipstream ? 1.045 : 1.0;

  let penaltyCap = 1.0;
  if (car.penaltyTimeRemaining > 0) {
    if (input.throttle < 0.65 || input.brake > 0.1) {
      car.penaltyTimeRemaining = Math.max(0, car.penaltyTimeRemaining - dt * 1.6);
    } else {
      penaltyCap = 0.88;
      car.penaltyTimeRemaining = Math.max(0, car.penaltyTimeRemaining - dt * 0.7);
    }
    if (car.penaltyTimeRemaining <= 0) {
      car.penaltyTimeRemaining = 0;
    }
  }

  // Off-track / runoff resistance
  const onAsphalt = Math.abs(car.lateralOffset) <= halfW + 1.0;
  const offTrackDrag = onAsphalt ? 1.0 : 0.72;
  const offTrackGrip = onAsphalt ? 1.0 : 0.65;

  // Speed ceiling (AI gains pace via cornering commitment/skill rather than unrealistic +7% straight-line Vmax)
  const aiStraightScale = car.isPlayer ? 1.0 : 1.0 + (car.aiPaceMultiplier - 1.0) * 0.25;
  const dragVmaxFactor = Math.pow(tuning.dragScale, -0.22);
  let effectiveMaxSpeed =
    maxSpeedBase *
    specialSpeedMult *
    slipstreamMult *
    damageFactor *
    fuelFactor *
    offTrackDrag *
    penaltyCap *
    aiStraightScale *
    dragVmaxFactor;

  // Sample current 3D road normal tilt (slope + banking) for longitudinal gravity and lateral banking forces
  const currentRoadSample = sampleTrackAtT(compiledTrack, car.trackT);
  const roadTilt = computeRoadSurfaceTilt(currentRoadSample, car.heading);

  // Longitudinal acceleration, braking & transmission drivetrain
  const throttle = Math.max(0, Math.min(1, input.throttle));
  const brake = Math.max(0, Math.min(1, input.brake));
  const isManual = car.transmissionMode === 'manual';
  const totalGears = car.carSpec.gears ?? classMeta.forwardGears ?? 6;

  // Manual transmission shifting:
  if (isManual) {
    if (input.shiftUp) {
      if (car.gear === -1 && car.speed < 4.0) {
        car.gear = 1;
      } else if (car.gear > 0 && car.gear < totalGears) {
        car.gear += 1;
      }
    } else if (input.shiftDown) {
      if (car.gear === 1 && car.speed < 3.0) {
        car.gear = -1;
      } else if (car.gear > 1) {
        car.gear -= 1;
      }
    }
  }

  // Automatic transmission mode reverse engagement & forward shift:
  if (!isManual) {
    if (car.gear === -1) {
      if (throttle > 0.1) {
        // Pressing Throttle shifts back to 1st gear and resets reverse momentum
        car.gear = 1;
        car.speed = 0;
      }
    } else {
      // Holding Brake once speed < 1.5 m/s smoothly engages R (gear = -1)
      if (brake > 0.1 && throttle < 0.05 && car.speed < 1.5) {
        car.gear = -1;
        car.speed = 0;
      }
    }
  }

  if (car.gear === -1) {
    // ==================== REVERSE GEAR (R = -1) ====================
    // Accelerates backward up to ~35 km/h (9.72 m/s)
    const maxReverseSpeed = 35 / SPEED_KMH_FACTOR;
    const reverseThrottle = isManual ? throttle : brake;
    const reverseBrake = isManual ? brake : (throttle > 0.1 ? 1.0 : 0.0);

    if (reverseThrottle > 0.05) {
      car.speed = Math.min(maxReverseSpeed, car.speed + 5.5 * reverseThrottle * dt);
    } else if (reverseBrake > 0.05) {
      car.speed = Math.max(0, car.speed - 18.0 * reverseBrake * dt);
    } else {
      car.speed = Math.max(0, car.speed - 3.5 * dt);
    }

    car.rpmNormalized = Math.round(Math.min(1.0, 0.22 + (car.speed / maxReverseSpeed) * 0.58) * 100) / 100;
  } else {
    // ==================== FORWARD GEARS (1..N) ====================
    const isStandstillRev = car.speed < 1.2 && brake > 0.1 && throttle > 0.08;

    // Stateful hysteresis fuel/spark-cut rev limiter (>= 60-120 RPM constant oscillation)
    // 70-120 RPM drop on an ~7500-8500 RPM range is ~0.014-0.018 normalized RPM
    const HYSTERESIS_RPM_DROP = 0.016; // ~100-120 RPM drop
    const HYSTERESIS_WINDOW_SEC = 0.055; // 55 ms cyclic window (45-70 ms)

    if (!isFE && throttle > 0.20) {
      if (car.revLimiterActive) {
        car.revLimiterTimer = (car.revLimiterTimer ?? 0) + dt;
        if (car.revLimiterTimer >= HYSTERESIS_WINDOW_SEC || car.rpmNormalized <= 1.0 - HYSTERESIS_RPM_DROP) {
          car.revLimiterActive = false;
          car.revLimiterTimer = 0;
        }
      } else if (car.rpmNormalized >= 0.995) {
        car.revLimiterActive = true;
        car.revLimiterTimer = 0;
      }
    } else {
      car.revLimiterActive = false;
      car.revLimiterTimer = 0;
    }

    const limiterTorqueCut = car.revLimiterActive ? 0.0 : 1.0;

    if (throttle > 0 && brake < 0.1) {
      const speedRatio = Math.min(1, car.speed / Math.max(1, effectiveMaxSpeed));
      const aeroTraction = isFormula && !isFE
        ? 0.72 + 0.60 * Math.min(1, car.speed / 25.0)
        : isGTP || isLMP2
        ? 0.88 + 0.22 * Math.min(1, car.speed / 30.0)
        : isFE
        ? 0.94 + 0.08 * Math.min(1, car.speed / 24.0)
        : 0.92 + 0.08 * Math.min(1, car.speed / 26.0);
      const highSpeedAero = isFormula && !isFE ? 1.32 : isGTP || isLMP2 ? 1.10 : isFE ? 1.02 : 1.0;
      const torqueCurve = Math.max(0.35, 1.0 - 0.58 * Math.pow(speedRatio, 1.75));
      const engineAccel =
        accelBase *
        aeroTraction *
        specialAccelMult *
        fuelFactor *
        throttle *
        torqueCurve *
        limiterTorqueCut;
      // Quadratic aero drag F_drag = c_drag * v^2 calibrated so steady-state equilibrium matches effectiveMaxSpeed
      const eqDragDecel = accelBase * highSpeedAero * specialAccelMult * 0.42;
      const cAeroDrag = eqDragDecel / (effectiveMaxSpeed * effectiveMaxSpeed);
      const aeroDragDecel = cAeroDrag * car.speed * car.speed;
      const netAccel = limiterTorqueCut === 0 ? -2.2 : engineAccel - aeroDragDecel;
      car.speed = Math.max(0, car.speed + netAccel * dt);
    }

    if (brake > 0) {
      car.speed = Math.max(0, car.speed - brakeBase * compoundMod.grip * brake * dt);
    }

    // Natural aero/rolling drag when coasting or above effectiveMaxSpeed
    const dragCoeff =
      (car.specialActive && specialType === 'active-aero' ? 0.34 : 0.46) * tuning.dragScale;
    if (car.speed > effectiveMaxSpeed) {
      car.speed -= (car.speed - effectiveMaxSpeed) * Math.min(1, dt * 3.8);
    } else if (throttle < 0.05 && brake < 0.05) {
      car.speed = Math.max(
        0,
        car.speed - (car.speed * dragCoeff + 0.00032 * tuning.dragScale * car.speed * car.speed) * dt,
      );
    }

    // Forward Gearing Simulation with progressive ratios (headroom above nominal Vmax prevents premature limiter hits)
    const getGearTopFracs = (nGears: number): number[] => {
      if ((isF126 || isF121) && nGears === 8) {
        return [0.30, 0.39, 0.48, 0.57, 0.67, 0.78, 0.89, 1.00];
      }
      if ((isGTP || isF105) && nGears === 7) {
        return [0.32, 0.43, 0.54, 0.65, 0.77, 0.89, 1.00];
      }
      if (isGTP && nGears === 6) {
        return [0.33, 0.46, 0.59, 0.72, 0.86, 1.00];
      }
      const out: number[] = [];
      for (let g = 1; g <= nGears; g++) {
        out.push(0.22 + 0.78 * Math.pow(g / nGears, 1 / 0.82));
      }
      return out;
    };

    if (totalGears === 1) {
      car.gear = 1;
      if (isStandstillRev) {
        car.rpmNormalized = Math.min(1.0, car.rpmNormalized + dt * 3.5 * throttle);
      } else {
        const motorRatio = Math.min(1.0, car.speed / Math.max(1, maxSpeedBase));
        car.rpmNormalized = car.speed < 1.0 ? 0.15 : Math.min(1.0, 0.15 + motorRatio * 0.85);
      }
    } else if (isStandstillRev) {
      // Stationary burnout / launch revving against brake: freely sweeps to redline & bounces
      const targetRev = Math.min(1.0, 0.18 + throttle * 0.84);
      if (car.revLimiterActive) {
        const nextRpm = Math.max(1.0 - HYSTERESIS_RPM_DROP, car.rpmNormalized - dt * 2.2);
        car.rpmNormalized = Math.round(nextRpm * 1000) / 1000;
      } else {
        const nextRpm =
          car.rpmNormalized < targetRev
            ? Math.min(targetRev, car.rpmNormalized + dt * 4.2 * throttle)
            : Math.max(targetRev, car.rpmNormalized - dt * 3.2);
        if (nextRpm >= 0.995) {
          car.revLimiterActive = true;
          car.revLimiterTimer = 0;
        }
        car.rpmNormalized = Math.round(nextRpm * 1000) / 1000;
      }
    } else {
      const gearboxTopSpeed = Math.max(45, maxSpeedBase * dragVmaxFactor * 1.045);
      const gearFracs = getGearTopFracs(totalGears);
      const speedRatioGear = Math.min(1.02, car.speed / gearboxTopSpeed);

      if (isManual) {
        car.gear = Math.max(1, Math.min(totalGears, car.gear));
        if (car.speed < 1.0 && car.gear === 1 && throttle < 0.08) {
          car.rpmNormalized = 0.18;
        } else {
          const gearMinRatio = car.gear === 1 ? 0 : gearFracs[car.gear - 2] * 0.82;
          const gearMaxRatio = gearFracs[car.gear - 1];
          const band = Math.max(0.05, gearMaxRatio - gearMinRatio);
          let gearRpm: number;
          if (car.gear === totalGears) {
            const entryRatio = gearFracs[totalGears - 2] * 0.82;
            const inTop = Math.max(0, Math.min(1.0, (speedRatioGear - entryRatio) / Math.max(0.06, 1.0 - entryRatio)));
            gearRpm = 0.72 + 0.28 * Math.pow(inTop, 0.85);
          } else {
            const inGearFrac = Math.max(-0.25, Math.min(1.0, (speedRatioGear - gearMinRatio) / band));
            const baseFloor = car.gear === 1 ? 0.22 : 0.62;
            gearRpm = Math.max(0.18, Math.min(1.0, baseFloor + (1.0 - baseFloor) * inGearFrac));
          }
          if (car.gear < totalGears && speedRatioGear >= gearMaxRatio) {
            car.speed = Math.min(car.speed, gearboxTopSpeed * gearMaxRatio);
            if (car.revLimiterActive) {
              gearRpm = Math.max(1.0 - HYSTERESIS_RPM_DROP, car.rpmNormalized - dt * 1.5);
            } else {
              gearRpm = 1.0;
              car.revLimiterActive = true;
            }
          } else if (car.revLimiterActive) {
            gearRpm = Math.max(1.0 - HYSTERESIS_RPM_DROP, car.rpmNormalized - dt * 1.5);
          } else if (gearRpm >= 0.995) {
            gearRpm = 1.0;
            car.revLimiterActive = true;
          }
          car.rpmNormalized = Math.round(gearRpm * 1000) / 1000;
        }
      } else {
        if (car.speed < 1.0 && throttle < 0.08) {
          car.gear = 1;
          car.rpmNormalized = 0.18;
        } else {
          let currentGear = Math.max(1, Math.min(totalGears, car.gear));
          while (currentGear < totalGears && speedRatioGear >= gearFracs[currentGear - 1] * 0.965) {
            currentGear += 1;
          }
          while (currentGear > 1 && speedRatioGear < gearFracs[currentGear - 2] * 0.80) {
            currentGear -= 1;
          }
          const shiftUpPoint = gearFracs[currentGear - 1] * (currentGear === totalGears ? 1.0 : 0.965);
          const entryRatio = currentGear === 1 ? 0 : gearFracs[currentGear - 2] * 0.82;
          let gearRpm: number;
          if (currentGear === totalGears) {
            const inTop = Math.max(0, Math.min(1.0, (speedRatioGear - entryRatio) / Math.max(0.06, 1.0 - entryRatio)));
            gearRpm = 0.72 + 0.28 * Math.pow(inTop, 0.88);
          } else {
            const inGearFrac = Math.max(0, Math.min(1.0, (speedRatioGear - entryRatio) / Math.max(0.05, shiftUpPoint - entryRatio)));
            const baseFloor = currentGear === 1 ? 0.22 : 0.70;
            gearRpm = baseFloor + (0.975 - baseFloor) * inGearFrac;
          }
          if (car.revLimiterActive) {
            gearRpm = Math.max(1.0 - HYSTERESIS_RPM_DROP, car.rpmNormalized - dt * 1.5);
          } else if (gearRpm >= 0.995) {
            gearRpm = 1.0;
            car.revLimiterActive = true;
          }
          car.gear = currentGear;
          car.rpmNormalized = Math.round(gearRpm * 1000) / 1000;
        }
      }
    }
  }

  const isReversing = car.gear === -1;
  const moveSign = isReversing ? -1 : 1;

  // Slope gravity force (-g * sinSlope): climbing slows car, downhill accelerates car smoothly
  if (car.speed > 0.5 || throttle > 0.05) {
    const slopeGravity = -9.81 * roadTilt.sinSlope * moveSign;
    car.speed = Math.max(0, car.speed + slopeGravity * dt);
  }

  // Sim-Cade Steering, Centripetal Cornering Limit, Trail-Braking & Understeer Scrub
  const steerInput = Math.max(-1, Math.min(1, input.steer));
  car.steerAngle += (steerInput * 0.5 - car.steerAngle) * Math.min(1, dt * 14);

  const speedNorm = Math.min(1, car.speed / Math.max(1, maxSpeedBase));
  // Trail-braking bonus: gentle braking (0.08..0.7) while turning sharpens front bite
  const trailBrakeBonus = brake > 0.08 && brake < 0.7 && Math.abs(steerInput) > 0.25 ? 1.14 : 1.0;
  const sampleBank = sampleTrackAtT(compiledTrack, car.trackT).banking || 0;
  const bankingGripBonus = 1.0 + Math.sin(Math.abs(sampleBank)) * 0.35;
  const { classGripMult, classDownforceBonus } = computeClassGripProfile(classId, car.speed, tuning, bop.downforceMult);
  const availableGrip =
    gripBase *
    classGripMult *
    compoundMod.grip *
    wearGripFactor *
    specialGripMult *
    offTrackGrip *
    damageFactor *
    trailBrakeBonus *
    bankingGripBonus *
    classDownforceBonus;

  // Centripetal lateral physics cap: realistic centripetal limit matching physical Gs
  const maxTurnRate = Math.min(
    availableGrip * 1.45,
    (availableGrip * 22.0) / Math.max(7.5, car.speed),
  );
  const lateralDemand = Math.abs(steerInput) * speedNorm * speedNorm * 1.55;
  const understeer = Math.max(0, (lateralDemand - availableGrip * 0.56) * 1.65);
  car.understeerFactor = Math.min(1, understeer);

  // Over-driving entries scrubs speed & pushes the car wide with genuine front-axle washout
  if (understeer > 0.05 && car.speed > 12) {
    car.speed = Math.max(11.0, car.speed - understeer * 15.0 * dt);
  }

  // Progressive exit power-oversteer when overdriven in GTP
  if (isGTP && throttle > 0.75 && Math.abs(steerInput) > 0.28 && car.speed > 14 && car.speed < 55) {
    const powerOversteer = (throttle - 0.75) * 4.0 * (Math.abs(steerInput) - 0.28) * 1.2;
    car.heading -= Math.sign(steerInput) * powerOversteer * 0.45 * dt;
    car.lateralSlip = Math.min(1, car.lateralSlip + powerOversteer * 0.35);
  }

  const turnEffectiveness = 1 - Math.min(0.55, understeer * 0.45);
  const lowSpeedScale = Math.min(1, car.speed / 6.0);
  // Lateral banking centripetal gravity assist (+sinBank pulls toward -R_car = left = +heading)
  const bankingTurnAssist = car.speed > 4.0 ? (9.81 * roadTilt.sinBank) / Math.max(10.0, car.speed) * 0.35 : 0;
  const turnDelta = steerInput * moveSign * maxTurnRate * turnEffectiveness * lowSpeedScale - bankingTurnAssist;
  car.heading -= turnDelta * dt;
  car.yawRate = -turnDelta;

  // Lateral velocity blend & lateral slip calculation for tire scrub audio
  const desiredVx = Math.sin(car.heading) * car.speed * moveSign;
  const desiredVz = Math.cos(car.heading) * car.speed * moveSign;
  const lateralBlend = Math.min(1, dt * (6.5 + availableGrip * 3.5) * (1 - Math.min(0.45, understeer * 0.4)));
  car.vx += (desiredVx - car.vx) * lateralBlend;
  car.vz += (desiredVz - car.vz) * lateralBlend;

  const fwdX = Math.sin(car.heading);
  const fwdZ = Math.cos(car.heading);
  const rightVel = car.vx * fwdZ - car.vz * fwdX;
  car.lateralSlip = Math.min(
    1,
    (Math.abs(rightVel) / 7.5 + car.understeerFactor * 0.72) * (car.speed > 5 ? 1 : 0),
  );

  car.x += car.vx * dt;
  car.z += car.vz * dt;

  // Project onto track spline (update lateralOffset FIRST so car.y has zero 1-frame banking lag)
  const proj = projectOntoTrack(compiledTrack, car.x, car.z, car.trackT);
  const bank = proj.sample.banking || 0;
  car.lateralOffset = proj.lateralOffset;
  car.y = proj.sample.y + car.lateralOffset * Math.sin(bank);
  const newTilt = computeRoadSurfaceTilt(proj.sample, car.heading);
  const tiltDamp = 1 - Math.exp(-15 * dt);
  car.pitch = (car.pitch ?? newTilt.pitchRad) + (newTilt.pitchRad - (car.pitch ?? newTilt.pitchRad)) * tiltDamp;
  car.roll = (car.roll ?? newTilt.rollRad) + (newTilt.rollRad - (car.roll ?? newTilt.rollRad)) * tiltDamp;

  // Kerb contact detection on curved apexes
  const sampleHalfW = (proj.sample.width ? proj.sample.width : compiledTrack.spec.trackWidth) * 0.5;
  car.onKerb =
    car.speed > 4 &&
    Math.abs(proj.sample.curvature) > 0.008 &&
    Math.abs(car.lateralOffset) >= sampleHalfW - 0.65 &&
    Math.abs(car.lateralOffset) <= sampleHalfW + 1.8 &&
    ((proj.sample.curvature > 0 && car.lateralOffset > 0) ||
      (proj.sample.curvature < 0 && car.lateralOffset < 0));

  // Update wall collision cooldown timer
  if (car.wallCollisionCooldown && car.wallCollisionCooldown > 0) {
    car.wallCollisionCooldown = Math.max(0, car.wallCollisionCooldown - dt);
  }

  // Outer track guardrails / barriers
  const outerRunoff = 6.2;
  const maxRight = sampleHalfW + outerRunoff;
  const maxLeft = -sampleHalfW - outerRunoff;
  if (car.lateralOffset > maxRight) {
    resolveWallContact(car, proj.sample, maxRight, 1, dt);
  } else if (car.lateralOffset < maxLeft) {
    resolveWallContact(car, proj.sample, maxLeft, -1, dt);
  }

  if (car.pitCooldown > 0) car.pitCooldown = Math.max(0, car.pitCooldown - dt);

  // Track limits corner cutting check
  // Generous 4-Wheels-Off Rule (Allow Kerb Riding): only count off-track violation when ALL four wheels are outside kerbs
  // |lateralOffset| > halfTrackWidth + kerbWidth + carHalfWidth * 0.85
  // No Penalty when running wide / losing time onto outside exit runoff (gives 0 warnings and 0 penalty)
  // 3-Warning Buffer: grant 3 free track-limit warnings before issuing slow-down penalty
  // Cap slow-down penalties at 0.5s–1.2s max
  if (car.offTrackCooldown > 0) car.offTrackCooldown = Math.max(0, car.offTrackCooldown - dt);
  const KERB_WIDTH = 1.8;
  const CAR_HALF_WIDTH = 1.05;
  const offTrackThreshold = sampleHalfW + KERB_WIDTH + CAR_HALF_WIDTH * 0.85;

  const isCuttingInside =
    Math.abs(car.lateralOffset) > offTrackThreshold &&
    ((proj.sample.curvature > 0.010 && car.lateralOffset > offTrackThreshold) ||
      (proj.sample.curvature < -0.010 && car.lateralOffset < -offTrackThreshold));

  if (isCuttingInside && car.offTrackCooldown <= 0 && car.speed > 16) {
    car.warningCount += 1;
    car.offTrackCooldown = 3.0;
    if (car.warningCount > 3) {
      // Cap slow-down penalties at 0.5s–1.2s max
      car.penaltyTimeRemaining = Math.min(1.2, Math.max(0.6, car.penaltyTimeRemaining + 0.8));
    }
  }

  // Lap & progress tracking
  car.prevTrackT = car.trackT;
  car.trackT = proj.sample.t;
  car.currentLapTime += dt;
  car.totalTime += dt;

  // Detect start/finish crossing forward (prevTrackT > 0.85 && trackT < 0.15)
  if (!isReversing && car.prevTrackT > 0.85 && car.trackT < 0.15) {
    if (car.totalDistance < 0) {
      // Initial start/finish crossing from pre-start grid
      car.lap = 1;
      car.currentLapTime = 0;
    } else {
      const completedTime = car.currentLapTime;
      if (completedTime > 5) {
        car.lastLapTime = completedTime;
        if (car.bestLapTime === null || completedTime < car.bestLapTime) {
          car.bestLapTime = completedTime;
        }
      }
      car.currentLapTime = 0;
      if (opts.isQualifying) {
        car.finished = true;
      } else if (car.lap >= opts.totalLaps) {
        car.finished = true;
      } else {
        car.lap += 1;
      }
    }
  } else if (car.prevTrackT < 0.15 && car.trackT > 0.85 && car.totalDistance > 0.2) {
    // Backwards crossing guard
    car.lap = Math.max(1, car.lap - 1);
  }

  car.totalDistance = car.totalDistance < 0 && car.prevTrackT > 0.85 && car.trackT > 0.5
    ? car.trackT - 1
    : (car.lap - 1) + car.trackT;

  // Tire wear, temperature & fuel consumption (calibrated so a full tank lasts ~12-16 laps at full push)
  const efficiencyFactor = 1.25 - (attrs.efficiency / 100) * 0.55;
  const cornerLoad = Math.abs(steerInput) * speedNorm;
  const wearDelta = (0.014 + cornerLoad * 0.045 + car.understeerFactor * 0.04) * compoundMod.wearRate * efficiencyFactor * dt;
  car.tireWear = Math.max(5, car.tireWear - wearDelta);

  const targetTemp = compoundMod.optimalTemp + cornerLoad * 24 + car.understeerFactor * 16 - opts.trackWetness * 14;
  car.tireTemp += (targetTemp - car.tireTemp) * Math.min(1, dt * 1.4);

  // Recalibrated fuel consumption: a full tank lasts ~12-16 laps at 1:1 scale (a 5km-7km lap burns ~6-8% of a tank)
  const lapProgressDelta = (car.speed * dt) / Math.max(2000, compiledTrack.totalLength);
  const throttleLoad = 0.40 + 0.60 * throttle;
  let overboostFuelMult = 1.0;
  if (car.specialActive && (specialType === 'v10-overboost' || specialType === 'rich-fuel-overboost')) {
    overboostFuelMult = 1.35; // +35% fuel burn while overboost active
  }
  const fuelBurn = 8.8 * lapProgressDelta * throttleLoad * efficiencyFactor * overboostFuelMult;
  car.fuel = Math.max(0, car.fuel - fuelBurn);

  const avgBurnRatePerLap = Math.max(4.0, 8.8 * efficiencyFactor * 0.78 * overboostFuelMult);
  car.fuelLapsRemaining = Number((car.fuel / avgBurnRatePerLap).toFixed(1));

  // Anti-Stuck Watchdog: if an AI car's speed remains < 5 km/h for 1.5s while racing,
  // smoothly reset aligned with nearest spline point at 35 km/h (9.72 m/s) in an unoccupied lateral lane
  if (!car.isPlayer && car.pitStopRemaining <= 0) {
    if (car.speed < 5 / SPEED_KMH_FACTOR) {
      car.aiStuckTimer = (car.aiStuckTimer || 0) + dt;
      if (car.aiStuckTimer >= 1.5) {
        const sp = sampleTrackAtT(compiledTrack, car.trackT);
        const safeMargin = 1.8;
        const laneLimit = Math.max(1.5, halfW - safeMargin);
        const candidates = [0, -laneLimit * 0.65, laneLimit * 0.65, -laneLimit * 0.35, laneLimit * 0.35];
        let bestLane = 0;
        let bestClearance = -1;
        for (const cand of candidates) {
          let minGap = Infinity;
          for (const other of opts.allCars) {
            if (other.id === car.id || other.pitStopRemaining > 0) continue;
            let dT = other.trackT - car.trackT;
            while (dT > 0.5) dT -= 1;
            while (dT < -0.5) dT += 1;
            const ds = Math.abs(dT * compiledTrack.totalLength);
            if (ds < 14) {
              minGap = Math.min(minGap, Math.hypot(ds, other.lateralOffset - cand));
            }
          }
          if (minGap > bestClearance) {
            bestClearance = minGap;
            bestLane = cand;
          }
        }
        car.x = sp.x + sp.nx * bestLane * Math.cos(sp.banking || 0);
        car.y = sp.y + bestLane * Math.sin(sp.banking || 0);
        car.z = sp.z + sp.nz * bestLane * Math.cos(sp.banking || 0);
        car.lateralOffset = bestLane;
        car.aiTargetOffset = bestLane;
        car.heading = Math.atan2(sp.tx, sp.tz);
        car.speed = 35 / SPEED_KMH_FACTOR; // 35 km/h rolling speed (~9.72 m/s)
        car.vx = Math.sin(car.heading) * car.speed;
        car.vz = Math.cos(car.heading) * car.speed;
        car.steerAngle = 0;
        car.understeerFactor = 0;
        car.aiPrevHeadingErr = 0;
        car.aiStuckTimer = 0;
      }
    } else {
      car.aiStuckTimer = 0;
    }
  }
}

/**
 * Resolves car-to-car collisions with elastic bounce, non-zeroing momentum transfer, and reduced damage:
 * 1. Horizontal separation: normal * (overlap * 0.5 + 0.05m)
 * 2. Elastic normal bounce: restitution = 0.50
 * 3. Tangential momentum preservation: transfer 20% relative tangential velocity without zeroing forward speed
 * 4. Damage: ignore contacts below 25 km/h (0 damage), 75% damage reduction (0.25x rate), max penalty capped at 10%-12%
 */
export function resolveCarCollisions(cars: CarSimState[]): number {
  let maxImpact = 0;
  const DAMAGE_THRESHOLD_SPEED = 25 / SPEED_KMH_FACTOR; // 6.944 m/s (25 km/h)
  const sphereR = 0.98; // Car half-width (real-world ~1.96m car width)
  const minDist = sphereR * 2.0; // 1.96m contact threshold
  const minDistSq = minDist * minDist;
  const halfL = 1.35; // Front/rear collision circle offset along wheelbase

  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      if (a.pitStopRemaining > 0 || b.pitStopRemaining > 0) continue;

      // Quick broadphase reject if cars are far apart (> 6.5m)
      const cdx = b.x - a.x;
      const cdz = b.z - a.z;
      if (cdx * cdx + cdz * cdz > 42.25) continue;

      // Narrowphase: 2 collision circles per car along heading (front & rear axles)
      const aSin = Math.sin(a.heading);
      const aCos = Math.cos(a.heading);
      const bSin = Math.sin(b.heading);
      const bCos = Math.cos(b.heading);

      const aCenters = [
        { x: a.x + aSin * halfL, z: a.z + aCos * halfL },
        { x: a.x - aSin * halfL, z: a.z - aCos * halfL },
      ];
      const bCenters = [
        { x: b.x + bSin * halfL, z: b.z + bCos * halfL },
        { x: b.x - bSin * halfL, z: b.z - bCos * halfL },
      ];

      let closestPairDistSq = Infinity;
      let hitNx = 0;
      let hitNz = 0;
      let hitDist = 0;

      for (let ai = 0; ai < 2; ai++) {
        for (let bi = 0; bi < 2; bi++) {
          const dx = bCenters[bi].x - aCenters[ai].x;
          const dz = bCenters[bi].z - aCenters[ai].z;
          const dSq = dx * dx + dz * dz;
          if (dSq < closestPairDistSq) {
            closestPairDistSq = dSq;
            hitDist = Math.sqrt(Math.max(1e-4, dSq));
            hitNx = dx / hitDist;
            hitNz = dz / hitDist;
          }
        }
      }

      if (closestPairDistSq < minDistSq) {
        const pushDist = (minDist - hitDist) * 0.5 + 0.05;
        a.x -= hitNx * pushDist;
        a.z -= hitNz * pushDist;
        b.x += hitNx * pushDist;
        b.z += hitNz * pushDist;

        const relVx = b.vx - a.vx;
        const relVz = b.vz - a.vz;
        const relVNorm = relVx * hitNx + relVz * hitNz;

        // Elastic normal bounce (restitution = 0.50)
        if (relVNorm < 0) {
          const restitution = 0.50;
          const bounceSpeed = Math.max(1.5, Math.abs(relVNorm) * restitution);
          // Zero inward normal velocity and apply outward restitution bounce
          const normA = a.vx * hitNx + a.vz * hitNz;
          const normB = b.vx * hitNx + b.vz * hitNz;
          a.vx = (a.vx - normA * hitNx) - hitNx * bounceSpeed;
          a.vz = (a.vz - normA * hitNz) - hitNz * bounceSpeed;
          b.vx = (b.vx - normB * hitNx) + hitNx * bounceSpeed;
          b.vz = (b.vz - normB * hitNz) + hitNz * bounceSpeed;
        }

        // Tangent momentum preservation: transfer 20% relative tangential closing speed without zeroing forward velocity
        const tx = -hitNz;
        const tz = hitNx;
        const relVTan = relVx * tx + relVz * tz;
        const tanTransfer = relVTan * 0.20 * 0.5;
        a.vx += tanTransfer * tx;
        a.vz += tanTransfer * tz;
        b.vx -= tanTransfer * tx;
        b.vz -= tanTransfer * tz;

        // Recompute speed scalar preserving forward momentum
        a.speed = Math.hypot(a.vx, a.vz);
        b.speed = Math.hypot(b.vx, b.vz);

        const impactSpeed = Math.abs(relVNorm);
        if (impactSpeed >= DAMAGE_THRESHOLD_SPEED) {
          maxImpact = Math.max(maxImpact, impactSpeed);
          // 75% damage reduction (0.25x rate), capped at 3.5% per contact
          const dmg = Math.min(3.5, (impactSpeed - DAMAGE_THRESHOLD_SPEED) * 0.25);
          a.aeroDamage = Math.min(100, a.aeroDamage + dmg);
          b.aeroDamage = Math.min(100, b.aeroDamage + dmg);
        }
      }
    }
  }
  return maxImpact;
}

/**
 * Computes AI control inputs using:
 * 1. Full track-relative (ds, dLat) 3-layer spatial avoidance (Forward Braking Cone, Dynamic Overtaking Lane, Side-by-Side Door Awareness)
 * 2. Kinematic stopping-distance curvature scan across [0, v^2/(2*a_brake) + 15m]
 * 3. Adaptive lookahead + damped PD steering + Off-Track Guardrail Override
 */
export function computeAIControl(
  car: CarSimState,
  compiledTrack: CompiledTrack,
  allCars: CarSimState[],
  dt: number,
  trackWetness: number,
): ControlInput {
  const personality = car.personality ?? 'Metronome';
  const classMeta = CAR_CLASSES[car.carSpec.classId];
  const attrs = car.carSpec.attributes;

  const CAR_WIDTH = car.carSpec.dimensions?.width ?? 1.95;
  const CAR_HALF_WIDTH = CAR_WIDTH * 0.5;
  const CAR_LENGTH = car.carSpec.length ?? (car.carSpec.dimensions?.length ?? 4.7);

  // On-track stationary pit request helper for AI if critically depleted or wet mismatch
  const needsWetSwitch = trackWetness > 0.5 && car.compound !== 'wet';
  const needsDrySwitch = trackWetness < 0.15 && car.compound === 'wet';
  if (car.pitCooldown <= 0 && (needsWetSwitch || needsDrySwitch)) {
    car.pitStrategy = {
      nextCompound: trackWetness > 0.45 ? 'wet' : 'medium',
    };
  }

  // Physical performance estimation matching stepCarPhysics via shared computeClassGripProfile
  const paceScale = classMeta.basePaceIndex;
  const tuning = resolveTuningConfig(car.carSpec?.classId);
  const isSupercar = car.carSpec.classId === CarClassId.SUPERCAR;
  const isCoupe = car.carSpec.classId === CarClassId.TRACK_COUPE;
  const isGT4 = car.carSpec.classId === CarClassId.GT4;
  const classBrakeMult = isSupercar ? 0.85 : isCoupe ? 0.85 : isGT4 ? 0.88 : 1.0;
  const compoundMod = getCompoundModifiers(car.compound, trackWetness);
  const wearGripFactor = 0.72 + 0.28 * Math.pow(car.tireWear / 100, 0.7);
  const damageFactor = 1 - (car.aeroDamage / 100) * 0.18;

  const bop = (car.bopEnabled !== false)
    ? (car.bopMultipliers ?? getCarBoP(car.carSpec.id))
    : { topSpeedMult: 1.0, gripMult: 1.0, downforceMult: 1.0, brakingMult: 1.0 };

  const gripBase =
    (1.42 + (attrs.corneringGrip / 100) * 1.15) *
    (0.75 + paceScale * 0.25) *
    tuning.lowSpeedGripScale *
    bop.gripMult;
  const brakeBase =
    (24 + (attrs.braking / 100) * 15) *
    (0.65 + paceScale * 0.35) *
    classBrakeMult *
    tuning.brakeForceScale *
    bop.brakingMult;
  const personalityBrakeFactor =
    personality === 'Late-Braker' ? 0.94 : personality === 'Tire-Saver' ? 0.82 : 0.88;
  const brakeDecel = Math.max(12, brakeBase * compoundMod.grip * personalityBrakeFactor);
  // Cornering speed utilization capped strictly <= 1.00 (100% of physical tire grip)
  const skillFactor = Math.max(
    0.75,
    Math.min(1.0, 0.96 * (0.45 + 0.55 * car.aiPaceMultiplier) * tuning.aiCornerSpeedScale),
  );

  const currentSample = sampleTrackAtT(compiledTrack, car.trackT);
  const halfW = (currentSample.width || compiledTrack.spec.trackWidth) * 0.5;
  const boundaryMargin = CAR_HALF_WIDTH + 0.75;
  const minSafeLane = Math.min(-0.5, -halfW + boundaryMargin);
  const maxSafeLane = Math.max(0.5, halfW - boundaryMargin);

  // ==================== 1. FULL SPATIAL AWARENESS (ALL CARS INCLUDING PLAYER) ====================
  car.aiPassTimer = Math.max(0, car.aiPassTimer - dt);

  const dynamicBrakingDist = Math.max(
    14,
    (car.speed * car.speed) / (2 * Math.max(8, brakeDecel * 0.78)) + 9.0,
  );

  let leadCar: CarSimState | null = null;
  let leadDs = Infinity;
  let passTargetCar: CarSimState | null = null;
  let passTargetDs = Infinity;
  let slowerClassAhead = false;

  // Side-by-side door awareness bounds
  let sideCarLeftLat: number | null = null;
  let sideCarRightLat: number | null = null;

  for (let i = 0; i < allCars.length; i++) {
    const other = allCars[i];
    if (other.id === car.id || other.pitStopRemaining > 0) continue;

    let dT = other.trackT - car.trackT;
    while (dT > 0.5) dT -= 1;
    while (dT < -0.5) dT += 1;
    const ds = dT * compiledTrack.totalLength;
    const dLat = other.lateralOffset;

    // Layer 3: Side-by-Side Door Awareness (|ds| < carLength * 1.4)
    if (Math.abs(ds) < CAR_LENGTH * 1.4 && Math.abs(dLat) <= halfW + 2.5) {
      if (dLat < car.lateralOffset) {
        if (sideCarLeftLat === null || dLat > sideCarLeftLat) {
          sideCarLeftLat = dLat;
        }
      } else {
        if (sideCarRightLat === null || dLat < sideCarRightLat) {
          sideCarRightLat = dLat;
        }
      }
    }

    // Layer 1: Forward braking cone ONLY for cars overlapping our current or target lane!
    // Never false-brake on straights for cars in an adjacent clear passing lane.
    if (ds > 0.4 && ds < Math.max(62.0, dynamicBrakingDist + 8.0)) {
      const latDiffCurr = Math.abs(dLat - car.lateralOffset);
      const latDiffTarget = Math.abs(dLat - car.aiTargetOffset);
      const inSameLane = latDiffCurr < CAR_WIDTH * 1.45 || latDiffTarget < CAR_WIDTH * 1.25;

      if (inSameLane && ds < dynamicBrakingDist && ds < leadDs) {
        leadDs = ds;
        leadCar = other;
      }

      if (latDiffCurr < halfW * 1.45 && ds < 62.0 && ds < passTargetDs && other.speed < car.speed + 2.5) {
        passTargetDs = ds;
        passTargetCar = other;
      }

      if (ds < 60.0) {
        const otherClass = CAR_CLASSES[other.carSpec.classId];
        if (classMeta.basePaceIndex > otherClass.basePaceIndex + 0.04) {
          slowerClassAhead = true;
        }
      }
    }
  }

  // Traffic-Smart prototypes flash headlights at slower GT traffic ahead
  car.flashingHeadlights =
    personality === 'Traffic-Smart' && slowerClassAhead && Math.floor(car.totalTime * 6) % 2 === 0;

  // ==================== 2. DYNAMIC OVERTAKING LANE & RACING LINE ====================
  // Lookahead & lookback samples to detect corner entry, apex, and track-out unwinding
  const aheadLookMeters = Math.max(18, Math.min(50, car.speed * 0.75));
  const aheadSample = sampleTrackAtT(
    compiledTrack,
    car.trackT + aheadLookMeters / Math.max(100, compiledTrack.totalLength),
  );
  const pastLookMeters = Math.max(14, Math.min(35, car.speed * 0.55));
  const pastSample = sampleTrackAtT(
    compiledTrack,
    car.trackT - pastLookMeters / Math.max(100, compiledTrack.totalLength),
  );

  let dynamicRacingLine = currentSample.racingLineOffset ?? 0;
  if (currentSample.racingLineOffset === undefined) {
    const currK = currentSample.curvature;
    const aheadK = aheadSample.curvature;
    const pastK = pastSample.curvature;

    if (Math.abs(currK) > 0.009) {
      // Clipping inside apex kerb at peak curvature proportional to curvature and car lateral margin
      const intensity = Math.min(1.0, Math.abs(currK) / 0.022);
      dynamicRacingLine = Math.sign(currK) * maxSafeLane * intensity;
    } else if (Math.abs(aheadK) > 0.0075) {
      // Swing toward outside edge in braking zone / entry
      const intensity = Math.min(1.0, Math.abs(aheadK) / 0.020);
      dynamicRacingLine = -Math.sign(aheadK) * maxSafeLane * intensity;
    } else if (Math.abs(pastK) > 0.0075) {
      // Unwind smoothly to outside exit kerb
      const intensity = Math.min(1.0, Math.abs(pastK) / 0.020);
      dynamicRacingLine = -Math.sign(pastK) * maxSafeLane * intensity;
    } else {
      dynamicRacingLine = 0;
    }
  }

  dynamicRacingLine = Math.max(minSafeLane, Math.min(maxSafeLane, dynamicRacingLine));
  let desiredOffset = dynamicRacingLine;

  // Layer 2: Proactive Overtaking Lane Selection when closing on slower car ahead within 60m
  const overtakeRef = leadCar ?? passTargetCar;
  const overtakeDs = leadCar ? leadDs : passTargetDs;
  const isBattlingTraffic = !!(overtakeRef && overtakeDs < Math.max(48, car.speed * 1.5) && car.speed > overtakeRef.speed - 2.5);

  if (isBattlingTraffic && overtakeRef) {
    const clearance = CAR_WIDTH * 1.35; // >= 1.35 * carWidth lateral clearance
    const leftUpper = Math.min(maxSafeLane, overtakeRef.lateralOffset - clearance);
    const rightLower = Math.max(minSafeLane, overtakeRef.lateralOffset + clearance);
    const leftClearance = Math.max(0, leftUpper - minSafeLane);
    const rightClearance = Math.max(0, maxSafeLane - rightLower);

    // Prevent picking a lane that cuts into a side-by-side car
    const canGoLeft =
      leftClearance >= 0.45 &&
      (sideCarLeftLat === null || leftUpper >= sideCarLeftLat + CAR_WIDTH + 1.0);
    const canGoRight =
      rightClearance >= 0.45 &&
      (sideCarRightLat === null || rightLower <= sideCarRightLat - (CAR_WIDTH + 1.0));

    if (canGoLeft && (!canGoRight || leftClearance >= rightClearance)) {
      desiredOffset = Math.min(leftUpper, (minSafeLane + leftUpper) * 0.52);
      car.aiPassTimer = Math.max(car.aiPassTimer, 1.4);
    } else if (canGoRight) {
      desiredOffset = Math.max(rightLower, (rightLower + maxSafeLane) * 0.52);
      car.aiPassTimer = Math.max(car.aiPassTimer, 1.4);
    } else {
      desiredOffset = car.lateralOffset;
    }
  } else if (car.aiPassTimer > 0) {
    // Hold chosen passing lane smoothly until pass completes
    desiredOffset = car.aiTargetOffset;
  }

  // Smooth lateral lane transition
  const hasLateralOverlapNow = leadCar ? Math.abs(leadCar.lateralOffset - car.lateralOffset) < CAR_WIDTH * 1.35 : false;
  const laneBlendRate = hasLateralOverlapNow ? 5.5 : (isBattlingTraffic ? 4.2 : 5.0);
  car.aiTargetOffset += (desiredOffset - car.aiTargetOffset) * Math.min(1, dt * laneBlendRate);

  // Layer 3 Lockout: Hold parallel lateral spacing (>= carWidth + 1.0m) when alongside
  const sideBySideSpacing = CAR_WIDTH + 1.0;
  if (sideCarLeftLat !== null) {
    car.aiTargetOffset = Math.max(car.aiTargetOffset, sideCarLeftLat + sideBySideSpacing);
  }
  if (sideCarRightLat !== null) {
    car.aiTargetOffset = Math.min(car.aiTargetOffset, sideCarRightLat - sideBySideSpacing);
  }

  // Hard Track-Boundary Containment: strictly clamp target offset inside safe asphalt bounds
  car.aiTargetOffset = Math.max(minSafeLane, Math.min(maxSafeLane, car.aiTargetOffset));

  const steerTargetOffset = car.aiTargetOffset;

  // ==================== 3. KINEMATIC SLOPE-AWARE STOPPING-DISTANCE CURVATURE SCAN ====================
  const scanDist = Math.max(180, Math.min(430, (car.speed * car.speed) / (2 * Math.max(10, brakeDecel * 0.80)) + 45.0));
  let maxBrakeRatio = 0;
  let immediateCornerSpeed = 999;

  const effectiveLatGripBase =
    gripBase * compoundMod.grip * wearGripFactor * damageFactor;

  // Dense 2.5m scan across near-zone [0..95m] so current apex & tight hairpins (e.g., Monaco R=4.2m) are never skipped,
  // followed by 10m scan up to scanDist.
  const scanDistances: number[] = [0];
  for (let d = 2.0; d <= 95.0; d += 2.5) scanDistances.push(d);
  for (let d = 105.0; d <= scanDist; d += 10.0) scanDistances.push(d);

  for (let sIdx = 0; sIdx < scanDistances.length; sIdx++) {
    const dMeters = scanDistances[sIdx];
    const sample =
      dMeters === 0
        ? currentSample
        : sampleTrackAtT(
            compiledTrack,
            car.trackT + dMeters / Math.max(100, compiledTrack.totalLength),
          );
    const absK = Math.abs(sample.curvature);
    if (absK < 0.0042) continue;

    const bankBonus = 1.0 + Math.sin(Math.abs(sample.banking || 0)) * 0.35;
    const { classGripMult, classDownforceBonus } = computeClassGripProfile(car.carSpec.classId, car.speed, tuning, bop.downforceMult);
    const sampleGrip = effectiveLatGripBase * classGripMult * bankBonus * classDownforceBonus;
    // Calibrated centripetal safe cornering speed with boosted exit aggression
    const minCornerSpeed = absK > 0.10 ? 7.6 : 9.5;
    const curvScale = absK > 0.10 ? 11.2 : 23.4;
    const vSafe = Math.max(minCornerSpeed, Math.sqrt((sampleGrip * curvScale) / absK) * skillFactor);

    if (dMeters < 20) {
      immediateCornerSpeed = Math.min(immediateCornerSpeed, vSafe);
    }

    if (dMeters > 0 && car.speed > vSafe) {
      // Factor longitudinal road slope (ty < 0 downhill reduces effective braking deceleration)
      const avgTy = (currentSample.ty + sample.ty) * 0.5;
      const slopeAwareBrake = Math.max(8.0, brakeDecel + 9.81 * avgTy * 0.85);
      const reqBrakeDist = (car.speed * car.speed - vSafe * vSafe) / (2 * slopeAwareBrake);
      const ratio = (reqBrakeDist * tuning.aiBrakeMarginScale) / Math.max(1.2, dMeters - 1.0);
      if (ratio > maxBrakeRatio) {
        maxBrakeRatio = ratio;
      }
    }
  }

  let cornerThrottle = 1.0;
  let cornerBrake = 0.0;

  if (car.speed > immediateCornerSpeed * 1.03) {
    const over = (car.speed - immediateCornerSpeed) / 7.5;
    cornerBrake = Math.min(1.0, 0.40 + over * 0.60);
    cornerThrottle = 0.0;
  } else if (maxBrakeRatio >= 0.88) {
    cornerBrake = Math.min(1.0, 0.20 + (maxBrakeRatio - 0.88) * 3.0);
    cornerThrottle = 0.0;
  } else if (maxBrakeRatio >= 0.76) {
    cornerThrottle = Math.max(0.40, 1.0 - (maxBrakeRatio - 0.76) * 4.5);
  } else if (car.understeerFactor > 0.32) {
    // Modulate corner-exit throttle cleanly when pushing wide
    cornerThrottle = Math.max(0.65, 1.0 - (car.understeerFactor - 0.32) * 0.6);
  }

  // ==================== 4. COLLISION-AVOIDANCE BRAKING ====================
  let avoidBrake = 0.0;
  let avoidThrottleCap = 1.0;

  if (leadCar) {
    const closingSpeed = car.speed - leadCar.speed;
    const hasLateralOverlap = Math.abs(leadCar.lateralOffset - car.lateralOffset) < CAR_WIDTH * 1.35;
    const pullingOutToPass =
      Math.abs(car.aiTargetOffset - leadCar.lateralOffset) >= CAR_WIDTH * 1.45 &&
      Math.abs(leadCar.lateralOffset - car.lateralOffset) < CAR_WIDTH * 1.45;

    // Only apply collision braking when actually overlapping our lane or dangerously close without open passing space
    const immediateDanger = hasLateralOverlap && (!pullingOutToPass || leadDs < 14.0);

    if (immediateDanger) {
      const gap = Math.max(0.5, leadDs - 4.2);
      const desiredFollowSpeed =
        leadDs < 10.0
          ? Math.max(0, leadCar.speed * Math.max(0, (leadDs - 4.0) / 6.0))
          : Math.min(leadCar.speed, car.speed);

      if (car.speed > desiredFollowSpeed || closingSpeed > 0.2) {
        const speedDiffDecel =
          (car.speed * car.speed - desiredFollowSpeed * desiredFollowSpeed) / (2 * Math.max(1.0, gap));
        const closingDecel = Math.max(0, closingSpeed) * (3.0 / Math.max(1.0, gap));
        const reqAvoidDecel = speedDiffDecel + closingDecel;
        if (reqAvoidDecel > 1.0) {
          avoidBrake = Math.max(0, Math.min(1.0, reqAvoidDecel / brakeDecel));
          avoidThrottleCap = avoidBrake > 0.05 ? 0.0 : 0.35;
        }
      } else if (leadDs < 14.0) {
        avoidThrottleCap = Math.min(avoidThrottleCap, 0.5);
      }
    }
  }

  // ==================== 5. ADAPTIVE LOOKAHEAD + DAMPED PD STEERING ====================
  const ahead5 = sampleTrackAtT(
    compiledTrack,
    car.trackT + 5 / Math.max(100, compiledTrack.totalLength),
  );
  const ahead10 = sampleTrackAtT(
    compiledTrack,
    car.trackT + 10 / Math.max(100, compiledTrack.totalLength),
  );
  const ahead20 = sampleTrackAtT(
    compiledTrack,
    car.trackT + 20 / Math.max(100, compiledTrack.totalLength),
  );
  const apexNearCurv = Math.max(Math.abs(currentSample.curvature), Math.abs(ahead5.curvature), Math.abs(ahead10.curvature));
  const nearCurv = Math.max(apexNearCurv, Math.abs(ahead20.curvature));
  const curvBlend = Math.min(1, nearCurv / 0.042);
  const straightLook = Math.max(38, Math.min(68, 32 + car.speed * 0.36));
  const baseTightLook = Math.max(12, Math.min(24, 10 + car.speed * 0.16));
  const tightLook = apexNearCurv > 0.08 ? Math.max(7.0, Math.min(baseTightLook, 1.15 / apexNearCurv)) : baseTightLook;
  let lookAheadDist = straightLook * (1 - curvBlend) + tightLook * curvBlend;
  if (leadCar && leadDs < 24 && Math.abs(car.lateralOffset - steerTargetOffset) > 0.5) {
    lookAheadDist = Math.max(12, Math.min(lookAheadDist, leadDs * 0.85));
  }

  const targetSample = sampleTrackAtT(
    compiledTrack,
    car.trackT + lookAheadDist / Math.max(100, compiledTrack.totalLength),
  );

  // Lookahead racing line offset at target sample for uncontested out-in-out apex tracking
  const targetLineOffset = targetSample.racingLineOffset !== undefined
    ? Math.max(minSafeLane, Math.min(maxSafeLane, targetSample.racingLineOffset))
    : steerTargetOffset;

  const isContested = isBattlingTraffic || car.aiPassTimer > 0 || sideCarLeftLat !== null || sideCarRightLat !== null;
  const effectiveLookaheadOffset = isContested ? steerTargetOffset : targetLineOffset;

  const targetX = targetSample.x + targetSample.nx * effectiveLookaheadOffset;
  const targetZ = targetSample.z + targetSample.nz * effectiveLookaheadOffset;

  const dx = targetX - car.x;
  const dz = targetZ - car.z;
  const desiredHeading = Math.atan2(dx, dz);
  let headingErr = desiredHeading - car.heading;
  while (headingErr > Math.PI) headingErr -= Math.PI * 2;
  while (headingErr < -Math.PI) headingErr += Math.PI * 2;

  const safeDt = Math.max(0.005, dt);
  const errDeriv = Math.max(-8, Math.min(8, (headingErr - (car.aiPrevHeadingErr || 0)) / safeDt));
  car.aiPrevHeadingErr = headingErr;

  // stepCarPhysics: heading -= steer * rate -> positive headingErr (target left) requires steer < 0
  const kp = 2.45;
  const kd = 0.14;
  let steer = -(headingErr * kp + errDeriv * kd);

  let throttle = Math.min(cornerThrottle, avoidThrottleCap);
  let brake = Math.max(cornerBrake, avoidBrake);

  // ==================== 6. OFF-TRACK GUARDRAIL OVERRIDE ====================
  if (Math.abs(car.lateralOffset) > halfW * 0.78) {
    const excessRatio = (Math.abs(car.lateralOffset) - halfW * 0.78) / Math.max(1, halfW * 0.22);
    // Lift throttle 30-50% to arrest drift velocity and stabilize front grip
    throttle = Math.min(throttle, Math.max(0.50, 0.70 - Math.min(0.20, excessRatio * 0.15)));
    // Corrective inward steering bias: lateralOffset > 0 (right) -> steer < 0 (left)
    const inwardBias = Math.min(0.65, 0.25 + excessRatio * 0.45);
    steer += -Math.sign(car.lateralOffset) * inwardBias;
  }

  steer = Math.max(-1, Math.min(1, steer));

  if (personality === 'Tire-Saver' && car.tireWear > 45 && Math.abs(steer) > 0.55 && brake === 0) {
    throttle = Math.min(throttle, 0.84);
  }

  // Trigger Class / Car Special on straights when clear ahead
  const resolvedSpecial = resolveCarSpecial(car.carSpec);
  const onStraight = nearCurv < 0.01 && Math.abs(steer) < 0.18 && maxBrakeRatio < 0.5;
  let specialPressed = false;
  if (resolvedSpecial.specialType === 'active-aero') {
    if (onStraight && !car.specialActive && car.speed > 26) specialPressed = true;
    if (!onStraight && car.specialActive) specialPressed = true;
  } else if (resolvedSpecial.specialType === 'attack-mode') {
    if (onStraight && !car.specialActive && car.attackModeUsesRemaining > 0 && car.speed > 25) {
      specialPressed = true;
    }
  } else if (onStraight && !car.specialActive && car.specialCharge > 50 && car.speed > 24 && !leadCar) {
    specialPressed = true;
  }

  return { throttle, brake, steer, specialPressed };
}

export function computeStandings(cars: CarSimState[], compiledTrack: CompiledTrack): DriverStandingsEntry[] {
  const sorted = [...cars].sort((a, b) => {
    if (a.finished && !b.finished) return -1;
    if (!a.finished && b.finished) return 1;
    if (a.finished && b.finished) return a.totalTime - b.totalTime;
    return b.totalDistance - a.totalDistance;
  });

  const classCounters = new Map<CarClassId, number>();
  const leader = sorted[0];

  return sorted.map((c, idx) => {
    const classPos = (classCounters.get(c.carSpec.classId) ?? 0) + 1;
    classCounters.set(c.carSpec.classId, classPos);

    const ahead = idx > 0 ? sorted[idx - 1] : null;
    const distDiffLeader = Math.max(0, (leader.totalDistance - c.totalDistance) * compiledTrack.totalLength);
    const distDiffAhead = ahead
      ? Math.max(0, (ahead.totalDistance - c.totalDistance) * compiledTrack.totalLength)
      : 0;
    const refSpeed = Math.max(24, c.speed);

    return {
      id: c.id,
      name: c.name,
      isPlayer: c.isPlayer,
      isHumanPeer: c.isHumanPeer,
      carId: c.carSpec.id,
      classId: c.carSpec.classId,
      driverNumber: c.livery.driverNumber,
      personality: c.personality,
      position: idx + 1,
      classPosition: classPos,
      lap: c.lap,
      progress: c.trackT,
      totalDistance: c.totalDistance,
      intervalToAhead: Number((distDiffAhead / refSpeed).toFixed(2)),
      intervalToLeader: Number((distDiffLeader / refSpeed).toFixed(2)),
      bestLapTime: c.bestLapTime,
      lastLapTime: c.lastLapTime,
      totalTime: c.totalTime,
      pitStops: c.pitStops,
      inPit: c.pitStopRemaining > 0,
      finished: c.finished,
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
