import { CAR_CLASSES, getCarById, resolveCarSpecial, getCarBoP, BoPMultipliers, getRealWorldCarDimensions } from './cars';
import { computeSetupPhysicsModifiers, DEFAULT_CAR_SETUP, normalizeCarSetup, resolveEffectiveBoP } from './carSetup';
import { getErsModeProfile } from './raceSystems';
import { CompiledTrack, computeTrackWallHalfWidth, projectOntoTrack, sampleTrackAtT } from './tracks';
import tuningConfigRaw from './tuningConfig.json';
import {
  AbsLevel,
  AIDifficulty,
  AIPersonality,
  CarClassId,
  CarSetupConfig,
  CarSpec,
  DamageLevel,
  DriverStandingsEntry,
  ErsMode,
  FourWheelTireState,
  LiveryConfig,
  LocalizedDamageState,
  PenaltyReason,
  PenaltyType,
  PitServiceAction,
  PitStrategy,
  RaceStartType,
  SceneryTheme,
  TireCompound,
  TrackSurfaceType,
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
  specialPressed: boolean; // legacy / current button state; falls back to trigger if specialJustPressed is omitted
  specialJustPressed?: boolean; // edge-triggered toggle activation (preferred)
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
  slipstreamStrength?: number; // 0..1 continuous exponential aerodynamic tow intensity
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
  lastCollisionImpact?: number; // latest car-to-car closing speed impact on THIS car (m/s)
  lastWallImpact?: number; // latest wall closing speed impact on THIS car (m/s)
  spawnGhostTimer?: number; // seconds remaining where car-to-car collisions are bypassed after spawn/respawn
  pitch?: number; // radians (+ = nose up)
  roll?: number; // radians (+ = right side raised)
  yawRate?: number;
  bopEnabled?: boolean;
  bopMultipliers?: BoPMultipliers;
  currentSector?: 1 | 2 | 3;
  sectorStartTime?: number;
  sectorTimes?: [number | null, number | null, number | null];
  bestSectorTimes?: [number | null, number | null, number | null];
  lastLapSectorTimes?: [number | null, number | null, number | null];
  // Advanced Driving Physics (Section 2.1, 2.2, 2.3) & Race Rules (Section 1.2, 1.3, 1.4)
  tires?: FourWheelTireState;
  brakeTempFront?: number; // Celsius (ambient ~35 .. 1000)
  brakeTempRear?: number;
  brakeFade?: number; // 0..1
  brakeLockupIntensity?: number; // 0..1
  flatSpotVibration?: number; // 0..1
  dirtyAirStrength?: number; // 0..1 high-speed corner turbulent wake
  surfaceType?: TrackSurfaceType;
  crestLoadFactor?: number; // 0.55..1.45 vertical normal load from crests/dips
  suspensionHeave?: number; // meters vertical chassis hop/compression
  sausageKerbHop?: number; // 0..1 active kerb hop upset
  prevSpeedMs?: number; // for longitudinal G weight transfer
  prevThrottle?: number; // for lift-off oversteer detection
  damage?: LocalizedDamageState;
  damageLevel?: DamageLevel;
  absLevel?: AbsLevel;
  setup?: CarSetupConfig;
  ersMode?: ErsMode;
  drsEligible?: boolean;
  inDrsZone?: boolean;
  inAttackModeZone?: boolean;
  blueFlagActive?: boolean;
  blackAndWhiteFlagged?: boolean;
  disqualified?: boolean;
  postRacePenaltySeconds?: number;
  penaltyReason?: PenaltyReason | null;
  penaltyType?: PenaltyType | null;
  launchBoostTimer?: number; // >0 seconds of standing-start perfect-launch traction bonus
  debrisBurstIntensity?: number; // >0 transient impact debris cue for 3D VFX
  localWetness?: number;
  puddleIntensity?: number;
  trackRubber?: number;
}

export function createInitialFourWheelTires(initialTemp = 72): FourWheelTireState {
  const mk = () => ({ wear: 100, temp: initialTemp, flatSpot: 0, graining: 0, load: 1.0 });
  return { fl: mk(), fr: mk(), rl: mk(), rr: mk() };
}

export function createInitialLocalizedDamage(): LocalizedDamageState {
  return {
    frontWing: 0,
    rearWing: 0,
    engine: 0,
    suspension: 0,
    suspensionPullDir: 0,
    headlightBroken: false,
    frontWingDetached: false,
    rearWingDetached: false,
  };
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
  startType?: RaceStartType;
  rollingSpeed?: number;
  damageLevel?: DamageLevel;
  absLevel?: AbsLevel;
  setup?: CarSetupConfig;
}): CarSimState {
  const bopEnabled = params.bopEnabled ?? true;
  const carSpec = getCarById(params.carId);
  const rawBop = bopEnabled ? getCarBoP(params.carId) : { topSpeedMult: 1.0, gripMult: 1.0, downforceMult: 1.0, brakingMult: 1.0 };
  const bop = bopEnabled ? resolveEffectiveBoP(rawBop, carSpec.id, carSpec.classId) : rawBop;
  const normalizedSetup = params.setup ? normalizeCarSetup(params.setup) : { ...DEFAULT_CAR_SETUP };
  const row = Math.floor(params.gridSlot / 2);
  const col = params.gridSlot % 2;
  const isRolling = params.startType === 'rolling';
  const trackLength = Math.max(100, params.compiledTrack.totalLength);

  // Authentic staggered 2-by-2 starting grid spacing (wider & further back for rolling starts)
  const rowSpacing = isRolling ? 10.5 : 7.5;
  const colStagger = isRolling ? 2.2 : 3.75;
  const baseStartOffset = isRolling
    ? Math.min(130.0, Math.max(45.0, trackLength * 0.13))
    : 12.0;
  const rawDistBehind = baseStartOffset + row * rowSpacing + col * colStagger;
  const distBehindStartLine = isRolling
    ? Math.min(rawDistBehind, trackLength * 0.44)
    : rawDistBehind;
  const deltaT = distBehindStartLine / trackLength;
  const startT = (((1.0 - deltaT) % 1) + 1) % 1;
  const sp = sampleTrackAtT(params.compiledTrack, startT);
  const halfW = params.compiledTrack.spec.trackWidth * 0.5;
  const latOffset = Math.min(2.8, Math.max(1.8, halfW * 0.38));
  const lat = (col === 0 ? -1 : 1) * latOffset;
  const x = sp.x + sp.nx * lat;
  const z = sp.z + sp.nz * lat;
  const heading = Math.atan2(sp.tx, sp.tz);
  const initSpeed = isRolling ? Math.max(14, params.rollingSpeed ?? 26) : 0;
  const startingFuel = normalizedSetup.startingFuel;

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
    vx: Math.sin(heading) * initSpeed,
    vz: Math.cos(heading) * initSpeed,
    heading,
    speed: initSpeed,
    steerAngle: 0,
    lap: 1,
    trackT: startT,
    prevTrackT: startT,
    totalDistance: isRolling ? startT - 1 : -distBehindStartLine, // negative until S/F crossing on lap 1
    lateralOffset: lat,
    currentLapTime: 0,
    bestLapTime: null,
    lastLapTime: null,
    totalTime: 0,
    compound: params.compound,
    tireWear: 100,
    tireTemp: 72,
    tires: createInitialFourWheelTires(72),
    brakeTempFront: 240,
    brakeTempRear: 220,
    brakeFade: 0,
    brakeLockupIntensity: 0,
    flatSpotVibration: 0,
    dirtyAirStrength: 0,
    surfaceType: 'asphalt',
    crestLoadFactor: 1.0,
    suspensionHeave: 0,
    sausageKerbHop: 0,
    prevSpeedMs: initSpeed,
    prevThrottle: 0,
    fuel: startingFuel,
    fuelLapsRemaining: Number(((startingFuel / 100) * 14.3).toFixed(1)),
    aeroDamage: 0,
    damage: createInitialLocalizedDamage(),
    damageLevel: params.damageLevel ?? 'light',
    absLevel: params.absLevel ?? 'low',
    setup: normalizedSetup,
    ersMode: 'balanced',
    drsEligible: false,
    inDrsZone: false,
    inAttackModeZone: false,
    blueFlagActive: false,
    blackAndWhiteFlagged: false,
    disqualified: false,
    postRacePenaltySeconds: 0,
    penaltyReason: null,
    penaltyType: null,
    launchBoostTimer: 0,
    debrisBurstIntensity: 0,
    localWetness: 0,
    puddleIntensity: 0,
    trackRubber: 0.25,
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
    spawnGhostTimer: 0,
    pitch: 0,
    roll: 0,
    yawRate: 0,
    bopEnabled,
    bopMultipliers: bop,
    currentSector: 1,
    sectorStartTime: 0,
    sectorTimes: [null, null, null],
    bestSectorTimes: [null, null, null],
    lastLapSectorTimes: [null, null, null],
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
 * Resolves car contact against barriers, guardrails and invisible pit walls:
 * 1. Depenetration: pushes car out of wall collision normal (normal * depth + 0.05m) every frame
 * 2. Tangent wall-damping: dt-normalized heavy barrier scraping friction + normal-impact scrub and low restitution (0.10) so cars lose speed noticeably instead of sliding cleanly along walls
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

  // Heavy dt-normalized barrier friction + normal-impact scrub and low restitution (0.10)
  // Consistent across browser 60Hz (dt=1/60) and headlessEnv 120Hz substeps (dt=1/120)
  const vNorm = side * (car.vx * sample.nx + car.vz * sample.nz);
  const vTan = car.vx * sample.tx + car.vz * sample.tz;

  const scrapeRetention = Math.exp(-8.5 * Math.max(dt, 1 / 240));
  const impactRetention = Math.max(0.74, 1.0 - Math.max(0, vNorm - 3.0) * 0.016);
  const vSlide = vTan * scrapeRetention * impactRetention;
  const vBounce = vNorm > 0 ? -0.10 * vNorm : 0;

  car.vx = vSlide * sample.tx + (side * vBounce) * sample.nx;
  car.vz = vSlide * sample.tz + (side * vBounce) * sample.nz;
  car.speed = Math.max(0, Math.min(car.speed, Math.abs(vSlide)));
  car.yawRate = (car.yawRate ?? 0) * 0.15;

  // Outward yaw alignment toward wall tangent so car glances off instead of pinning
  const wallHeading = Math.atan2(sample.tx, sample.tz);
  let headingDiff = wallHeading - car.heading;
  while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
  while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
  car.heading += headingDiff * Math.min(1.0, dt * 10.5);

  // Collision damage threshold & cooldown:
  // Ignore low-speed grazing impacts below 25 km/h (6.944 m/s) -> 0 damage
  const impactSpeed = Math.max(0, vNorm);
  const DAMAGE_THRESHOLD_SPEED = 25 / SPEED_KMH_FACTOR; // 6.944 m/s
  if (impactSpeed >= DAMAGE_THRESHOLD_SPEED && (!car.wallCollisionCooldown || car.wallCollisionCooldown <= 0)) {
    const heavyDmg = Math.min(5.0, (impactSpeed - DAMAGE_THRESHOLD_SPEED) * 0.25);
    const noseAngle = Math.abs(headingDiff);
    const zone: 'front' | 'side' | 'rear' =
      noseAngle > 0.45 ? 'front' : noseAngle > 2.3 ? 'rear' : 'side';
    applyLocalizedImpactDamage(car, zone, heavyDmg, impactSpeed, side);
    car.wallCollisionCooldown = 0.5;
    car.lastWallImpact = Math.max(car.lastWallImpact ?? 0, impactSpeed);
  }
}

/**
 * Applies localized damage to front wing, rear wing, engine, and suspension while keeping
 * aggregate `car.aeroDamage` synced and respecting `car.damageLevel` ('off' | 'visual-only' | 'light' | 'realistic').
 */
export function applyLocalizedImpactDamage(
  car: CarSimState,
  zone: 'front' | 'rear' | 'side',
  baseDmg: number,
  impactSpeedMs: number,
  lateralSide: number = 0,
): void {
  const level = car.damageLevel ?? 'light';
  if (level === 'off') return;
  if (!car.damage) car.damage = createInitialLocalizedDamage();

  const scale = level === 'realistic' ? 1.85 : level === 'visual-only' ? 0.65 : 1.0;
  const scaled = Math.min(18.0, baseDmg * scale);
  const d = car.damage;

  if (zone === 'front') {
    d.frontWing = Math.min(100, d.frontWing + scaled * 1.45);
    d.engine = Math.min(100, d.engine + scaled * 0.35);
    d.suspension = Math.min(100, d.suspension + scaled * 0.30);
    if (impactSpeedMs > 12.0 || d.frontWing > 32) {
      d.headlightBroken = true;
    }
    if (d.frontWing > 58) {
      d.frontWingDetached = true;
    }
  } else if (zone === 'rear') {
    d.rearWing = Math.min(100, d.rearWing + scaled * 1.45);
    d.engine = Math.min(100, d.engine + scaled * 0.55);
    if (d.rearWing > 58) {
      d.rearWingDetached = true;
    }
  } else {
    d.suspension = Math.min(100, d.suspension + scaled * 1.35);
    d.frontWing = Math.min(100, d.frontWing + scaled * 0.45);
    d.rearWing = Math.min(100, d.rearWing + scaled * 0.35);
    if (lateralSide !== 0) {
      d.suspensionPullDir = Math.max(-1, Math.min(1, d.suspensionPullDir + Math.sign(lateralSide) * 0.25));
    }
  }

  // Emit visual carbon debris particle cue on meaningful impacts
  if (impactSpeedMs > 8.5) {
    car.debrisBurstIntensity = Math.min(1, Math.max(car.debrisBurstIntensity ?? 0, (impactSpeedMs - 7.0) / 14.0));
  }

  // Sync aggregate aeroDamage for HUD/legacy consumers (0 performance impact in visual-only mode handled in stepCarPhysics)
  car.aeroDamage = Math.min(100, car.aeroDamage + (level === 'realistic' ? baseDmg * 1.6 : baseDmg));
}

/**
 * Classifies track surface type and returns grip, rolling drag, and gravel sinking resistance.
 */
export function classifyTrackSurface(
  lateralOffset: number,
  halfW: number,
  curvature: number,
  scenery: SceneryTheme,
  localWetness: number,
): {
  surface: TrackSurfaceType;
  gripMult: number;
  dragMult: number;
  gravelDecelMs2: number;
  sausageUpset: number;
} {
  const absLat = Math.abs(lateralOffset);
  const absCurv = Math.abs(curvature);
  const isInsideCorner =
    absCurv > 0.008 &&
    ((curvature > 0 && lateralOffset > 0) || (curvature < 0 && lateralOffset < 0));

  if (absLat <= halfW - 0.55) {
    return { surface: 'asphalt', gripMult: 1.0, dragMult: 1.0, gravelDecelMs2: 0, sausageUpset: 0 };
  }

  // Apex kerb & painted sausage kerb
  if (absLat <= halfW + 1.55) {
    if (isInsideCorner) {
      return {
        surface: 'kerb',
        gripMult: Math.max(0.74, 0.96 - localWetness * 0.18),
        dragMult: 0.985,
        gravelDecelMs2: 0,
        sausageUpset: 0,
      };
    }
    return { surface: 'asphalt', gripMult: 0.98, dragMult: 0.99, gravelDecelMs2: 0, sausageUpset: 0 };
  }

  // Sausage kerb on tight chicanes / inner apex beyond primary kerb
  if (isInsideCorner && absCurv > 0.024 && absLat <= halfW + 2.35) {
    return {
      surface: 'sausage-kerb',
      gripMult: Math.max(0.60, 0.78 - localWetness * 0.18),
      dragMult: 0.94,
      gravelDecelMs2: 0,
      sausageUpset: 1.0,
    };
  }

  // Street/stadium circuits have painted concrete runoff
  if (scenery === 'street-night' || scenery === 'stadium') {
    return {
      surface: 'concrete-runoff',
      gripMult: Math.max(0.66, 0.86 - localWetness * 0.16),
      dragMult: 0.93,
      gravelDecelMs2: 0,
      sausageUpset: 0,
    };
  }

  // Wet astroturf strip just outside kerbs on modern circuits (ice-like when wet)
  if (absLat <= halfW + 2.85) {
    return {
      surface: 'astroturf',
      gripMult: localWetness > 0.18 ? Math.max(0.36, 0.72 - localWetness * 0.42) : 0.79,
      dragMult: 0.90,
      gravelDecelMs2: 0,
      sausageUpset: 0,
    };
  }

  // Outer gravel traps on high-curvature corners in desert / forest / parkland tracks
  const isOutsideCorner =
    absCurv > 0.014 &&
    ((curvature > 0 && lateralOffset < 0) || (curvature < 0 && lateralOffset > 0));
  if (isOutsideCorner && (scenery === 'desert' || scenery === 'forest' || scenery === 'parkland')) {
    const depthRatio = Math.min(1, (absLat - (halfW + 2.85)) / 4.0);
    return {
      surface: 'gravel',
      gripMult: 0.48,
      dragMult: 0.64 - depthRatio * 0.10,
      gravelDecelMs2: 4.5 + depthRatio * 5.0,
      sausageUpset: 0.25,
    };
  }

  // Standard grass runoff
  return {
    surface: 'grass',
    gripMult: Math.max(0.40, 0.60 - localWetness * 0.20),
    dragMult: 0.74,
    gravelDecelMs2: 1.2,
    sausageUpset: 0,
  };
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
 * Computes dynamic pack-fighting pace multiplier for AI cars to promote close racing:
 * - The further ahead an AI pulls (of the player or trailing pack), the slightly slower it runs.
 * - If behind a same-class human player, the AI pushes harder to reel the player back in and fight.
 */
export function computeDynamicAiPackPace(
  car: Pick<CarSimState, 'id' | 'isPlayer' | 'carSpec' | 'totalDistance' | 'finished'>,
  allCars: ReadonlyArray<Pick<CarSimState, 'id' | 'isPlayer' | 'carSpec' | 'totalDistance' | 'finished'>>,
  trackLength: number,
): number {
  if (car.isPlayer || car.finished || allCars.length <= 1) return 1.0;

  const sameClassCars = allCars.filter(
    (other) => other.carSpec.classId === car.carSpec.classId && !other.finished,
  );
  if (sameClassCars.length <= 1) return 1.0;

  const sameClassPlayer = sameClassCars.find((other) => other.isPlayer);
  if (sameClassPlayer) {
    const gapToPlayerM = (car.totalDistance - sameClassPlayer.totalDistance) * trackLength;
    if (gapToPlayerM > 10) {
      // Ahead of player: progressively ease off the further ahead (up to -5.5%) to encourage battles
      const excess = gapToPlayerM - 10;
      const slowDelta = 0.055 * (1 - Math.exp(-excess / 95));
      return 1.0 - slowDelta;
    }
    if (gapToPlayerM < -8) {
      // Behind player: push harder (up to +6.5%) to close in and fight if possible
      const deficit = -gapToPlayerM - 8;
      const boostDelta = 0.065 * (1 - Math.exp(-deficit / 80));
      return 1.0 + boostDelta;
    }
    return 1.0;
  }

  // Pure AI race (or class without human player): gently compress runaway leaders & aid chasers
  let sumOtherDist = 0;
  let maxOtherDist = -Infinity;
  let count = 0;
  for (let i = 0; i < sameClassCars.length; i++) {
    const o = sameClassCars[i];
    if (o.id === car.id) continue;
    sumOtherDist += o.totalDistance;
    if (o.totalDistance > maxOtherDist) maxOtherDist = o.totalDistance;
    count++;
  }
  if (count === 0) return 1.0;
  const avgOtherDist = sumOtherDist / count;
  const gapAheadOfPackM = (car.totalDistance - avgOtherDist) * trackLength;
  const gapBehindLeaderM = (maxOtherDist - car.totalDistance) * trackLength;

  if (gapAheadOfPackM > 14) {
    const slowDelta = 0.048 * (1 - Math.exp(-(gapAheadOfPackM - 14) / 105));
    return 1.0 - slowDelta;
  }
  if (gapBehindLeaderM > 16) {
    const boostDelta = 0.036 * (1 - Math.exp(-(gapBehindLeaderM - 16) / 100));
    return 1.0 + boostDelta;
  }
  return 1.0;
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
    isPractice?: boolean;
    allCars: CarSimState[];
    bopEnabled?: boolean;
    localWetness?: number;
    puddleIntensity?: number;
    trackRubber?: number;
    trackTempC?: number;
    safetyCarSpeedLimitMs?: number | null;
    drsZoneEnforced?: boolean;
    damageLevel?: DamageLevel;
    absLevel?: AbsLevel;
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

  if (!car.tires) car.tires = createInitialFourWheelTires(car.tireTemp || 72);
  if (!car.damage) car.damage = createInitialLocalizedDamage();
  if (opts.damageLevel) car.damageLevel = opts.damageLevel;
  if (opts.absLevel) car.absLevel = opts.absLevel;
  car.debrisBurstIntensity = Math.max(0, (car.debrisBurstIntensity ?? 0) - dt * 2.5);
  if (car.launchBoostTimer && car.launchBoostTimer > 0) {
    car.launchBoostTimer = Math.max(0, car.launchBoostTimer - dt);
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
        car.tires = createInitialFourWheelTires(72);
        car.flatSpotVibration = 0;
        car.aeroDamage = Math.max(0, car.aeroDamage - 25);
        car.damage.frontWing = Math.max(0, car.damage.frontWing - 25);
        car.damage.rearWing = Math.max(0, car.damage.rearWing - 25);
        if (car.damage.frontWing < 45) car.damage.frontWingDetached = false;
        if (car.damage.rearWing < 45) car.damage.rearWingDetached = false;
      } else if (completedTask === 'fuel') {
        car.fuel = 100;
        car.fuelLapsRemaining = Math.max(12, car.fuelLapsRemaining);
      } else {
        car.compound = car.pitStrategy.nextCompound;
        car.tireWear = 100;
        car.tireTemp = 72;
        car.tires = createInitialFourWheelTires(72);
        car.flatSpotVibration = 0;
        car.fuel = 100;
        car.aeroDamage = 0;
        car.damage = createInitialLocalizedDamage();
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
  const setupMod = computeSetupPhysicsModifiers(car.setup);
  const effectiveWetness = Math.max(0, Math.min(1, opts.localWetness ?? opts.trackWetness));
  const puddleIntensity = Math.max(0, Math.min(1, opts.puddleIntensity ?? 0));
  const trackRubber = Math.max(0, Math.min(1, opts.trackRubber ?? 0.25));
  const trackTempC = opts.trackTempC ?? (28 - effectiveWetness * 10);
  car.localWetness = effectiveWetness;
  car.puddleIntensity = puddleIntensity;
  car.trackRubber = trackRubber;

  // Class / car-specific special toggle activation (press once ON, press again OFF, auto-OFF on depletion/expiry)
  const resolvedSpecial = resolveCarSpecial(car.carSpec);
  const specialType = resolvedSpecial.specialType;
  const isSpecialTriggered = input.specialJustPressed ?? input.specialPressed;

  switch (specialType) {
    case 'active-aero': {
      const drsAllowed = !opts.drsZoneEnforced || Boolean(car.drsEligible);
      if (isSpecialTriggered) {
        if (car.specialActive) {
          car.specialActive = false;
        } else if (drsAllowed) {
          car.specialActive = true;
        }
      }
      if (car.specialActive && (input.brake > 0.35 || (opts.drsZoneEnforced && !car.inDrsZone))) {
        // Braking or leaving DRS zone automatically closes low-drag wing back to high-downforce corner mode
        car.specialActive = false;
      }
      break;
    }
    case 'attack-mode': {
      // 2 uses per race, 15s duration: toggle ON to deploy AWD boost, toggle again to deactivate/stow early
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
      // Toggle ON/OFF to deploy rechargeable battery for +15% acceleration; auto-OFF when depleted
      if (isSpecialTriggered) {
        if (car.specialActive) {
          car.specialActive = false;
        } else if (car.specialCharge > 1) {
          car.specialActive = true;
        }
      }
      if (car.specialActive) {
        if (car.specialCharge > 0) {
          car.specialCharge = Math.max(0, car.specialCharge - dt * 20);
        }
        if (car.specialCharge <= 0) {
          car.specialActive = false;
        }
      }
      if (!car.specialActive) {
        // Recharges under braking and lightly off-deployment
        const rechargeRate = input.brake > 0.2 ? 22 : 3.5;
        car.specialCharge = Math.min(100, car.specialCharge + dt * rechargeRate);
      }
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
      break;
    }
  }

  // Realistic exponential aerodynamic slipstream wake (begins ~48m back, ramps sharply closer in) — applies equally to Player & AI
  const slipstreamStrength = computeSlipstreamStrength(car, opts.allCars, compiledTrack.totalLength);
  car.slipstreamStrength = slipstreamStrength;
  car.inSlipstream = slipstreamStrength >= 0.14;
  car.lastWallImpact = 0;

  // Sample current 3D road normal tilt, surface classification, crest unloading & dirty air
  const currentRoadSample = sampleTrackAtT(compiledTrack, car.trackT);
  const roadTilt = computeRoadSurfaceTilt(currentRoadSample, car.heading);
  const sampleHalfWNow = (currentRoadSample.width ?? compiledTrack.spec.trackWidth) * 0.5;
  const surfaceInfo = classifyTrackSurface(
    car.lateralOffset,
    sampleHalfWNow,
    currentRoadSample.curvature || 0,
    compiledTrack.spec.scenery,
    effectiveWetness,
  );
  car.surfaceType = surfaceInfo.surface;
  if (surfaceInfo.sausageUpset > 0 && car.speed > 10) {
    car.sausageKerbHop = Math.min(1, (car.sausageKerbHop ?? 0) + surfaceInfo.sausageUpset * Math.min(1, car.speed / 35) * dt * 12);
  } else {
    car.sausageKerbHop = Math.max(0, (car.sausageKerbHop ?? 0) - dt * 5.5);
  }
  const crestLoadFactor = computeCrestLoadFactor(compiledTrack, car.trackT, car.speed);
  car.crestLoadFactor = crestLoadFactor;
  const dirtyAirStrength = computeDirtyAirStrength(
    car,
    opts.allCars,
    compiledTrack.totalLength,
    currentRoadSample.curvature || 0,
    Math.abs(input.steer),
  );
  car.dirtyAirStrength = dirtyAirStrength;

  // Compute physical performance scalars & Balance of Performance
  if (opts.bopEnabled !== undefined) {
    car.bopEnabled = opts.bopEnabled;
  }
  const rawBop = (car.bopEnabled !== false)
    ? (car.bopMultipliers ?? getCarBoP(car.carSpec.id))
    : { topSpeedMult: 1.0, gripMult: 1.0, downforceMult: 1.0, brakingMult: 1.0 };
  const bop = (car.bopEnabled !== false)
    ? resolveEffectiveBoP(rawBop, car.carSpec.id, car.carSpec.classId)
    : rawBop;

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

  // Real-world class physical parameters (kg, Watts, traction-limited launch g, aero downforce traction gain, high-RPM power taper)
  const massKg = isF126 || isF121
    ? 798
    : isF105
    ? 720
    : isGTP
    ? 1030
    : isLMP2
    ? 930
    : isGT3
    ? 1300
    : isGT4
    ? 1420
    : isFE
    ? 860
    : isCoupe
    ? 1450
    : 1400;

  const powerWatts = isF126 || isF121
    ? 785_000 + (attrs.acceleration - 93) * 14_000
    : isF105
    ? 705_000 + (attrs.acceleration - 93) * 12_000
    : isGTP
    ? 495_000 + (attrs.acceleration - 85) * 7_500
    : isLMP2
    ? 435_000 + (attrs.acceleration - 80) * 6_500
    : isGT3
    ? 325_000 + (attrs.acceleration - 77) * 6_000
    : isGT4
    ? 275_000 + (attrs.acceleration - 70) * 5_500
    : isFE
    ? 360_000 + (attrs.acceleration - 90) * 7_500
    : isCoupe
    ? 245_000 + Math.max(0, attrs.acceleration - 64) * 11_000
    : 650_000 + (attrs.acceleration - 85) * 26_000;

  const launchGripG = isF126 || isF121 || isF105
    ? 1.06 + (attrs.acceleration - 93) * 0.015
    : isFE
    ? 1.12 + (attrs.acceleration - 90) * 0.015
    : isGTP
    ? 0.94 + (attrs.acceleration - 85) * 0.012
    : isLMP2
    ? 0.91 + (attrs.acceleration - 80) * 0.012
    : isGT3
    ? 0.84 + (attrs.acceleration - 77) * 0.012
    : isGT4
    ? 0.70 + (attrs.acceleration - 70) * 0.010
    : isCoupe
    ? 0.65 + Math.max(0, attrs.acceleration - 64) * 0.012
    : 1.06 + Math.max(-0.15, (attrs.acceleration - 85) * 0.018);

  const downforceTractionCoeff = isFormula && !isFE
    ? 0.0018
    : isGTP || isLMP2
    ? 0.0010
    : isGT3
    ? 0.0005
    : 0.0002;

  const highSpeedPowerTaper = isFormula && !isFE
    ? 0.44
    : isGTP
    ? 0.25
    : isLMP2 || isGT3
    ? 0.20
    : 0.14;

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

  const compoundMod = getCompoundModifiers(car.compound, effectiveWetness);
  const tState = car.tires;
  const avgTireWear = (tState.fl.wear + tState.fr.wear + tState.rl.wear + tState.rr.wear) * 0.25;
  const wearGripFactor = 0.72 + 0.28 * Math.pow(avgTireWear / 100, 0.7);
  // Localized damage effects (bypassed in 'off' and 'visual-only' modes)
  const mechDamageActive = car.damageLevel !== 'off' && car.damageLevel !== 'visual-only';
  const dmg = car.damage;
  const frontWingDmgFactor = mechDamageActive ? 1 - (dmg.frontWing / 100) * 0.22 - (dmg.frontWingDetached ? 0.08 : 0) : 1.0;
  const rearWingDmgFactor = mechDamageActive ? 1 - (dmg.rearWing / 100) * 0.22 - (dmg.rearWingDetached ? 0.08 : 0) : 1.0;
  const engineDmgFactor = mechDamageActive ? 1 - (dmg.engine / 100) * 0.16 : 1.0;
  const suspDmgGripFactor = mechDamageActive ? 1 - (dmg.suspension / 100) * 0.12 : 1.0;
  const damageFactor = mechDamageActive ? 1 - (car.aeroDamage / 100) * 0.11 : 1.0;
  const fuelFactor = car.fuel > 0 ? 1.0 : 0.45;
  // Fuel weight effect: lighter fuel load subtly improves acceleration & cornering responsiveness
  const fuelWeightMassBonusKg = (car.fuel / 100) * (isFormula ? 65 : isGTP || isLMP2 ? 55 : 48);
  const effectiveMassKg = massKg - 32 + fuelWeightMassBonusKg;

  // ERS Deployment Mode continuous modulation (Harvest / Balanced / Overtake / Quali)
  const ersActiveEligible =
    specialType === 'ers-overtake' || specialType === 'hybrid-deploy' || specialType === 'attack-mode';
  let ersModeSpeedBonus = 0;
  let ersModeAccelBonus = 0;
  if (ersActiveEligible && car.ersMode && car.ersMode !== 'balanced') {
    const ersProf = getErsModeProfile(car.ersMode);
    if (ersProf.drainPerSec > 0) {
      if (car.specialCharge > 4 && input.throttle > 0.25) {
        ersModeSpeedBonus = ersProf.topSpeedBonus;
        ersModeAccelBonus = ersProf.accelBonus;
        car.specialCharge = Math.max(0, car.specialCharge - ersProf.drainPerSec * dt * input.throttle);
      }
    } else {
      // Harvest mode: slightly less straight pull, faster battery regen
      ersModeSpeedBonus = ersProf.topSpeedBonus;
      ersModeAccelBonus = ersProf.accelBonus;
      car.specialCharge = Math.min(100, car.specialCharge + Math.abs(ersProf.drainPerSec) * dt * (input.brake > 0.15 ? 1.6 : 0.7));
    }
  }

  let specialSpeedMult = 1.0 + ersModeSpeedBonus;
  let specialAccelMult = (1.0 + ersModeAccelBonus) * setupMod.accelMult * engineDmgFactor;
  let specialGripMult = 1.0;
  if (car.specialActive) {
    if (specialType === 'active-aero') {
      // 2026 F1: +3.8% low-drag straight Vmax (350-355 km/h), -25% cornering grip
      specialSpeedMult = 1.038;
      specialAccelMult *= 1.06;
      specialGripMult = 0.75;
    } else if (specialType === 'attack-mode') {
      // Formula E: AWD launch & +15% power, +5.5% top speed (315-324 km/h)
      specialSpeedMult = 1.055;
      specialAccelMult *= 1.18;
      specialGripMult = 1.08;
    } else if (specialType === 'ers-overtake' || specialType === 'hybrid-deploy') {
      // 2021 F1 & Hypercar: +12% mid/high-speed pull, +2.0% Vmax
      specialSpeedMult = 1.020 + ersModeSpeedBonus * 0.5;
      specialAccelMult *= 1.12;
    } else if (specialType === 'v10-overboost' || specialType === 'rich-fuel-overboost') {
      // 2005 F1 & Non-hybrid LMH: +8% power surge with +35% fuel burn
      specialSpeedMult = 1.026;
      specialAccelMult *= 1.08;
    }
  }

  // DRS boost for F1_2021 when DRS eligible + special active in DRS zone
  if (isF121 && car.drsEligible && car.specialActive) {
    specialSpeedMult *= 1.022;
  }

  const slipstreamMult = 1.0 + 0.052 * slipstreamStrength;

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
      car.penaltyReason = null;
      car.penaltyType = null;
    }
  }

  // Surface-specific resistance & puddle hydroplaning (replaces binary onAsphalt)
  const puddleDragFactor = 1.0 - puddleIntensity * 0.14;
  const puddleGripFactor = 1.0 - puddleIntensity * 0.34;
  const rubberGripBonus = 1.0 + trackRubber * 0.04 * (1 - effectiveWetness * 0.85);
  const offTrackDrag = surfaceInfo.dragMult * puddleDragFactor;
  const offTrackGrip = surfaceInfo.gripMult * puddleGripFactor * rubberGripBonus;

  // Dynamic pack pace variance for AI (leaders subtly slow, chasers behind player push harder to promote fights)
  const aiPackPace = car.isPlayer
    ? 1.0
    : computeDynamicAiPackPace(car, opts.allCars, compiledTrack.totalLength);
  const effectiveAiPace = car.aiPaceMultiplier * aiPackPace;
  // Speed ceiling (AI gains pace via cornering commitment/skill + realistic straight-line pack modulation)
  const aiStraightScale = car.isPlayer
    ? 1.0
    : Math.max(0.86, Math.min(1.075, 1.0 + (effectiveAiPace - 1.0) * 0.40));
  const dragVmaxFactor = Math.pow(tuning.dragScale * setupMod.dragMult, -0.22);
  let effectiveMaxSpeed =
    maxSpeedBase *
    setupMod.topSpeedMult *
    specialSpeedMult *
    slipstreamMult *
    damageFactor *
    (mechDamageActive ? 1 - (dmg.rearWing / 100) * 0.05 : 1.0) *
    fuelFactor *
    offTrackDrag *
    penaltyCap *
    aiStraightScale *
    dragVmaxFactor;

  // Enforce Safety Car / VSC speed limit for AI automatically (players receive steward delta enforcement)
  if (!car.isPlayer && opts.safetyCarSpeedLimitMs && opts.safetyCarSpeedLimitMs > 0) {
    effectiveMaxSpeed = Math.min(effectiveMaxSpeed, opts.safetyCarSpeedLimitMs);
  }

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

    // True Newtonian longitudinal dynamics: F_net = F_drive - F_drag - F_roll, dv = (F_net / mass) * dt
    const GRAVITY = 9.81;
    const CRR = 0.014;
    const fRollN = CRR * massKg * GRAVITY;
    const speedRatio = Math.min(1, car.speed / Math.max(1, effectiveMaxSpeed));
    const powerAtVmaxW = powerWatts * specialAccelMult * fuelFactor * (1 - highSpeedPowerTaper);
    // kDrag = 0.5 * rho * Cd * A derived cleanly so aero + rolling resistance balances wheel power at effectiveMaxSpeed
    const kAeroDragBase = Math.max(
      0.05,
      (powerAtVmaxW / Math.max(20, effectiveMaxSpeed) - fRollN) / (effectiveMaxSpeed * effectiveMaxSpeed),
    );
    // Real aerodynamic slipstream directly cuts drag coefficient in the wake for genuine mid/high-speed tow pull
    const kAeroDrag = kAeroDragBase * (1 - 0.22 * slipstreamStrength);
    const fAeroDragN = kAeroDrag * car.speed * car.speed;

    if (throttle > 0 && brake < 0.1) {
      // Engine torque/power delivery across RPM & high-speed taper
      const lowSpeedSpool = isFE ? 1.0 : 0.88 + 0.12 * Math.min(1, car.speed / 18.0);
      const powerCurveFactor = lowSpeedSpool * (1 - highSpeedPowerTaper * Math.pow(speedRatio, isFormula && !isFE ? 1.18 : 1.45));
      const pWheelW = powerWatts * specialAccelMult * fuelFactor * throttle * powerCurveFactor;
      const fPowerN = pWheelW / Math.max(4.5, car.speed);

      // Tire traction limit (static launch grip + aero downforce load + crest load + differential exit traction + perfect launch boost)
      const launchBonusMult = (car.launchBoostTimer ?? 0) > 0 ? 1.12 : 1.0;
      const tireLaunchFactor =
        (0.75 + 0.25 * compoundMod.grip) *
        (0.85 + 0.15 * wearGripFactor) *
        offTrackGrip *
        setupMod.diffExitTractionMult *
        launchBonusMult *
        Math.pow(crestLoadFactor, 0.55);
      const fTractionN =
        effectiveMassKg * (launchGripG * GRAVITY * tireLaunchFactor + downforceTractionCoeff * car.speed * car.speed);

      const fDriveN = limiterTorqueCut === 0 ? 0 : Math.min(fPowerN, fTractionN);
      const fNetN = fDriveN - fAeroDragN - fRollN;
      car.speed = Math.max(0, car.speed + (fNetN / effectiveMassKg) * dt);
    }

    // Brake disc thermal model, cold bite, hot fade & wheel lock-up (ABS-modulated)
    const brakeBiasF = setupMod.brakeBiasFront;
    const brakeBiasR = 1 - brakeBiasF;
    const brakeHeatPower = brake * car.speed * (isFormula ? 10.5 : isGTP || isLMP2 ? 9.5 : 8.4);
    const brakeAmbient = Math.max(25, trackTempC + 10);
    const brakeCoolRate = (0.045 + car.speed * 0.0042) * (1 + effectiveWetness * 0.45);
    const curBTF = car.brakeTempFront ?? 240;
    const curBTR = car.brakeTempRear ?? 220;
    const nextBTF = Math.max(
      brakeAmbient,
      Math.min(1020, curBTF + (brakeHeatPower * brakeBiasF * 1.15 - (curBTF - brakeAmbient) * brakeCoolRate) * dt),
    );
    const nextBTR = Math.max(
      brakeAmbient,
      Math.min(1020, curBTR + (brakeHeatPower * brakeBiasR * 1.15 - (curBTR - brakeAmbient) * brakeCoolRate) * dt),
    );
    car.brakeTempFront = nextBTF;
    car.brakeTempRear = nextBTR;

    const avgBrakeTemp = nextBTF * brakeBiasF + nextBTR * brakeBiasR;
    const coldBrakeEff = avgBrakeTemp < 180 ? 0.88 + 0.12 * Math.max(0, (avgBrakeTemp - 50) / 130) : 1.0;
    const hotFadeLoss = avgBrakeTemp > 760 ? Math.min(0.28, ((avgBrakeTemp - 760) / 260) * 0.28) : 0;
    car.brakeFade = Math.min(1, hotFadeLoss / 0.28);
    const brakeThermalEff = coldBrakeEff * (1 - hotFadeLoss);

    let lockupIntensity = 0;
    if (brake > 0) {
      const absLvl = car.absLevel ?? 'low';
      const absMargin = absLvl === 'high' ? 1.18 : absLvl === 'low' ? 0.96 : 0.74;
      const lockThreshold =
        absMargin *
        compoundMod.grip *
        Math.max(0.65, offTrackGrip) *
        Math.pow(crestLoadFactor, 0.5) *
        (1 - Math.abs(brakeBiasF - 0.56) * 1.1);
      if (car.speed > 14 && brake > lockThreshold && absLvl !== 'high') {
        lockupIntensity = Math.min(1, (brake - lockThreshold) / Math.max(0.15, 1.05 - lockThreshold));
      }
      // Locked wheels lose peak friction slightly and scrub flat-spots onto front/rear tires
      const lockupDecelPenalty = 1 - lockupIntensity * 0.16;
      const fBrakeN =
        effectiveMassKg *
          brakeBase *
          compoundMod.grip *
          brakeThermalEff *
          lockupDecelPenalty *
          Math.pow(crestLoadFactor, 0.4) *
          brake +
        fAeroDragN +
        fRollN;
      car.speed = Math.max(0, car.speed - (fBrakeN / effectiveMassKg) * dt);
    }
    car.brakeLockupIntensity = lockupIntensity;

    // Gravel trap progressive deceleration & sinking drag
    if (surfaceInfo.gravelDecelMs2 > 0 && car.speed > 2.5) {
      car.speed = Math.max(0, car.speed - surfaceInfo.gravelDecelMs2 * (0.5 + 0.5 * speedRatio) * dt);
    }

    // Natural aero/rolling drag & realistic RPM/gear-dependent engine braking when coasting or above effectiveMaxSpeed
    if (car.speed > effectiveMaxSpeed) {
      car.speed -= (car.speed - effectiveMaxSpeed) * Math.min(1, dt * 3.8);
    } else if (throttle < 0.05 && brake < 0.05) {
      const coastRpm = Math.max(0, Math.min(1, car.rpmNormalized));
      const gearFactor = totalGears <= 1
        ? 0.45
        : Math.max(0.45, Math.min(1.45, 1.35 - ((Math.max(1, car.gear) - 1) / Math.max(1, totalGears - 1)) * 0.75));
      const engineBrakeG = (isFE ? 0.05 : 0.06) + (isFE ? 0.09 : 0.14) * coastRpm * gearFactor;
      const fEngineBrakeN = massKg * engineBrakeG * GRAVITY;
      const fCoastN = fAeroDragN + fRollN + fEngineBrakeN;
      car.speed = Math.max(0, car.speed - (fCoastN / massKg) * dt);
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

  // Dynamic Tire Friction & Bicycle Slip-Angle Lateral Physics (replaces kinematic nose-pulling)
  const dims = car.carSpec.dimensions ?? getRealWorldCarDimensions(car.carSpec.id, classId);
  const wheelbase = Math.max(2.4, Math.min(3.7, dims.wheelbase ?? 2.8));
  const aAxle = wheelbase * 0.49;
  const bAxle = wheelbase * 0.51;
  const yawInertia = (isGTP ? 0.19 : 0.20) * massKg * wheelbase * wheelbase;

  const steerInput = Math.max(-1, Math.min(1, input.steer));
  const steerMag = Math.abs(steerInput);
  const speedNorm = Math.min(1, car.speed / Math.max(1, maxSpeedBase));

  // High-speed progressive sensitivity (calms both analog micro-inputs and high-speed keyboard taps without dulling low/mid-speed turn-in)
  const highSpeedBlend = Math.max(0, (speedNorm - 0.45) / 0.55);
  const shapedSteerInput =
    steerMag > 0
      ? Math.sign(steerInput) * Math.pow(steerMag, 1.0 + 0.45 * highSpeedBlend)
      : 0;
  const maxSteerAngle = 0.46 * (1.0 - 0.72 * Math.min(1, car.speed / Math.max(38, maxSpeedBase * 0.88)));
  const targetSteerAngle = shapedSteerInput * maxSteerAngle;

  // Fast caster self-centering with exact-zero snap on release; speed-damped turn-in ramp on high-speed straights
  const isReturningToCenter = steerMag < 0.04 || Math.abs(targetSteerAngle) < Math.abs(car.steerAngle);
  const turnInRate = 18.5 - 8.5 * highSpeedBlend;
  const steerRate = steerMag < 0.04 ? 28.0 + 16.0 * speedNorm : isReturningToCenter ? 26.0 : turnInRate;
  car.steerAngle += (targetSteerAngle - car.steerAngle) * (1 - Math.exp(-steerRate * dt));
  if (steerMag < 0.015 && Math.abs(car.steerAngle) < 0.0025) {
    car.steerAngle = 0;
  }

  // Separate instantaneous release signal (inputStraightness) from physical wheel angle so corner-exit settling engages immediately on release
  const steerActivity = Math.min(1, Math.max(steerMag, Math.abs(car.steerAngle) / Math.max(0.05, maxSteerAngle)));
  const wheelStraightness = Math.max(0, 1.0 - steerActivity * 2.2);
  const inputStraightness = Math.max(0, 1.0 - steerMag * 3.0);
  const exitSettling = Math.max(wheelStraightness, inputStraightness * 0.85);

  // Longitudinal G & abrupt lift-off detection for authentic weight transfer & pitch/roll coupling
  const prevSpd = car.prevSpeedMs ?? car.speed;
  const rawLongAccel = dt > 1e-4 ? (car.speed - prevSpd) / dt : 0;
  const longG = Math.max(-4.5, Math.min(2.5, rawLongAccel / 9.81));
  const liftOffDrop = Math.max(0, (car.prevThrottle ?? throttle) - throttle);
  const liftOffOversteer = liftOffDrop > 0.35 && car.speed > 26 && steerMag > 0.22 ? Math.min(0.055, liftOffDrop * 0.065) : 0;
  car.prevSpeedMs = car.speed;
  car.prevThrottle = throttle;

  // Suspension alignment pull from localized suspension damage
  const suspPullSteer = mechDamageActive && dmg.suspension > 10
    ? dmg.suspensionPullDir * (dmg.suspension / 100) * 0.045
    : 0;

  // Trail-braking bonus: braking while turning loads and sharpens front-axle bite
  const trailBrakeBonus = brake > 0.05 && brake < 0.75 && Math.abs(steerInput) > 0.2 ? 1.20 : 1.0;
  const sampleBank = currentRoadSample.banking || 0;
  const bankingGripBonus = 1.0 + Math.sin(Math.abs(sampleBank)) * 0.35;
  const { classGripMult, classDownforceBonus } = computeClassGripProfile(
    classId,
    car.speed,
    tuning,
    bop.downforceMult * setupMod.overallDownforceMult,
  );
  // Tire thermal window + graining + flat-spot grip factor across 4 wheels
  const wheelGrip = (w: { wear: number; temp: number; flatSpot: number; graining: number }) => {
    const tempDelta = w.temp - compoundMod.optimalTemp;
    const coldPenalty = tempDelta < -18 ? Math.min(0.11, ((-18 - tempDelta) / 40) * 0.11) : 0;
    const hotPenalty = tempDelta > 16 ? Math.min(0.14, ((tempDelta - 16) / 35) * 0.14) : 0;
    const wFactor = 0.72 + 0.28 * Math.pow(w.wear / 100, 0.7);
    return wFactor * (1 - coldPenalty - hotPenalty - w.graining * 0.08 - w.flatSpot * 0.09);
  };
  const frontTireGrip = (wheelGrip(tState.fl) + wheelGrip(tState.fr)) * 0.5;
  const rearTireGrip = (wheelGrip(tState.rl) + wheelGrip(tState.rr)) * 0.5;
  const avgWheelGrip = (frontTireGrip + rearTireGrip) * 0.5;

  // Crest unloading scales normal load; sausage kerb hop briefly reduces contact patch grip
  const crestGripFactor = Math.pow(crestLoadFactor, 0.55);
  const sausageHopPenalty = 1.0 - (car.sausageKerbHop ?? 0) * 0.24 * setupMod.kerbComplianceMult;
  const availableGrip =
    gripBase *
    classGripMult *
    compoundMod.grip *
    avgWheelGrip *
    specialGripMult *
    offTrackGrip *
    damageFactor *
    suspDmgGripFactor *
    trailBrakeBonus *
    bankingGripBonus *
    classDownforceBonus *
    crestGripFactor *
    sausageHopPenalty;

  const rightX = -Math.cos(car.heading);
  const rightZ = Math.sin(car.heading);

  let vLat = car.vx * rightX + car.vz * rightZ;
  let vFwd = car.speed * moveSign;
  let rYaw = -(car.yawRate ?? 0); // positive = turning right (-heading)

  // Preserve pointy front-axle balance during active steering while shifting to neutral/rear-planted stability as soon as steering releases
  const activeTurnWeight = Math.min(1, steerMag * 1.15);
  const staticFrontShare = bAxle / wheelbase + (isGTP ? 0.045 : 0.020) * activeTurnWeight;
  // Direct physics coupling: longitudinal G (braking/accel) + lift-off oversteer shifts front/rear grip bias
  const dynamicWeightTransfer =
    (brake * 0.14 - throttle * 0.065 + Math.max(-0.06, Math.min(0.08, -longG * 0.028)) + liftOffOversteer) *
    (car.speed > 2 ? 1 : 0);
  const frontShare = Math.max(0.36, Math.min(0.67, staticFrontShare + dynamicWeightTransfer));
  const rearShare = 1.0 - frontShare;

  // Dirty air / turbulent wake reduces front downforce in fast corners; localized wing damage & setup balance axles
  const dirtyAirFrontLoss = 1.0 - dirtyAirStrength * 0.22;
  const frontAxleBalance =
    (frontTireGrip / Math.max(0.4, avgWheelGrip)) *
    setupMod.frontMechGripMult *
    setupMod.frontDownforceMult *
    setupMod.diffTurnInMult *
    frontWingDmgFactor *
    dirtyAirFrontLoss *
    (1 - (car.brakeLockupIntensity ?? 0) * 0.22);
  const rearAxleBalance =
    (rearTireGrip / Math.max(0.4, avgWheelGrip)) *
    setupMod.rearMechGripMult *
    setupMod.rearDownforceMult *
    rearWingDmgFactor;

  // Lateral tire friction limit (mu * Fz) in Newtons
  const latGripAccel = availableGrip * 11.8;
  const fMaxTotalN = massKg * latGripAccel;
  const frontTurnInMult = (1.0 + (isGTP ? 0.12 : 0.045) * activeTurnWeight) * frontAxleBalance;
  const rearStraightAeroPlant =
    (1.0 + (0.16 + (isFormula || isGTP || isLMP2 ? 0.09 : 0.03)) * speedNorm * speedNorm * exitSettling) *
    rearAxleBalance;
  const fMaxFrontN = fMaxTotalN * frontShare * (isReversing ? 0.75 : 1.0) * frontTurnInMult;
  const fMaxRearN =
    fMaxTotalN *
    rearShare *
    rearStraightAeroPlant *
    (isGTP && throttle > 0.80 && Math.abs(steerInput) > 0.25 && car.speed > 12 && car.speed < 72
      ? Math.max(0.85, 1.0 - (throttle - 0.80) * 0.45)
      : 1.0);

  // High small-slip cornering stiffness (|alpha| < 3-5 deg) with strong positive straight-line weathervane margin (b * cAlphaRear > a * cAlphaFront)
  const cAlphaFront = fMaxFrontN * (isGTP ? 13.8 : 13.2);
  const cAlphaRear = fMaxRearN * (14.5 + 3.5 * exitSettling + 2.5 * speedNorm * exitSettling);

  let understeerAccum = 0;
  let dHeadingAccum = 0;
  if (car.speed < 0.35 && Math.abs(throttle) < 0.05 && Math.abs(brake) < 0.05) {
    vLat = 0;
    rYaw = 0;
  } else {
    const subSteps = dt > 0.008 ? 4 : 2;
    const subDt = dt / subSteps;
    const delta = (car.steerAngle + suspPullSteer) * moveSign;

    for (let s = 0; s < subSteps; s++) {
      const vReg = Math.hypot(vFwd, 2.2);
      const speedForwardAbs = Math.max(0.5, Math.abs(vFwd));

      const alphaF = delta - Math.atan2(vLat + aAxle * rYaw, vReg);
      const alphaR = -Math.atan2(vLat - bAxle * rYaw, vReg);

      const fyF = fMaxFrontN * Math.tanh((cAlphaFront * alphaF) / Math.max(1, fMaxFrontN));
      const fyR = fMaxRearN * Math.tanh((cAlphaRear * alphaR) / Math.max(1, fMaxRearN));

      const bankLatAccel = car.speed > 4.0 ? -9.81 * roadTilt.sinBank : 0;
      const yawAccel = (aAxle * fyF - bAxle * fyR) / yawInertia;

      // Apply lateral tire acceleration in body frame + subtle front steering scrub
      vLat += ((fyF + fyR) / massKg + bankLatAccel) * subDt;
      if (Math.abs(vFwd) > 1.0) {
        const steerDragDecel = (Math.abs(fyF * Math.sin(delta)) / massKg) * 0.25 * subDt;
        vFwd -= Math.sign(vFwd) * Math.min(Math.abs(vFwd), steerDragDecel);
      }

      rYaw += yawAccel * subDt;

      // Speed-scaled yaw-rate damping + anti-pendulum counter-yaw catch (light in corners, crisp settling on release/straights)
      const isCounterYaw = steerMag > 0.05 && rYaw * (steerInput * moveSign) < 0;
      const baseYawDamp = (1.0 + 1.4 * speedNorm) * (isCounterYaw ? 1.45 : 1.0);
      const yawDampRate = baseYawDamp + exitSettling * (10.0 + 12.0 * speedNorm);
      rYaw *= Math.exp(-yawDampRate * subDt);
      if (exitSettling > 0.80 && Math.abs(rYaw) < 0.01) {
        rYaw = 0;
      }

      // Enforce physical tire-friction yaw ceiling across all speeds (and wheelbase geometry below 12 m/s)
      const maxTireYaw = latGripAccel / Math.max(2.5, speedForwardAbs);
      if (car.speed < 12.0) {
        const maxGeomYaw = (speedForwardAbs * Math.abs(Math.tan(car.steerAngle))) / wheelbase + 0.08;
        const physicalCap = Math.min(maxGeomYaw * 1.12, maxTireYaw);
        if (Math.abs(rYaw) > physicalCap) {
          rYaw = Math.sign(rYaw) * physicalCap;
        }
      } else if (Math.abs(rYaw) > maxTireYaw) {
        rYaw = Math.sign(rYaw) * maxTireYaw;
      }

      // Energy-conserving body-frame Coriolis rotation matched 1:1 with accumulated heading delta (zero phantom sideways shear)
      const dRot = rYaw * subDt;
      dHeadingAccum += dRot;
      const cosR = Math.cos(dRot);
      const sinR = Math.sin(dRot);
      const nextFwd = vFwd * cosR + vLat * sinR;
      const nextLat = -vFwd * sinR + vLat * cosR;
      vFwd = nextFwd;
      vLat = nextLat;

      if (car.speed < 4.5) {
        const crawlDamp = Math.exp(-subDt * (6.0 - car.speed));
        vLat *= crawlDamp;
      } else if (exitSettling > 0.05) {
        // Small-slip lateral tire bite on straights/exits locks the car onto its heading instead of floating sideways
        const slipRatio = Math.min(1, Math.abs(vLat) / (speedForwardAbs * 0.10));
        const smallSlipWeight = 1.0 - 0.50 * slipRatio;
        const latSettleRate = exitSettling * (7.5 + 6.5 * speedNorm) * smallSlipWeight;
        vLat *= Math.exp(-latSettleRate * subDt);
        if (exitSettling > 0.80 && Math.abs(vLat) < 0.05) {
          vLat = 0;
        }
      }

      const frontRatio = Math.min(1, Math.abs(fyF) / Math.max(1, fMaxFrontN));
      if (Math.abs(alphaF) > 0.14 && frontRatio > 0.78) {
        understeerAccum = Math.max(understeerAccum, Math.min(1, (Math.abs(alphaF) - 0.14) * 3.4));
      }
    }
  }

  car.speed = Math.min(effectiveMaxSpeed * 1.05, Math.max(0, moveSign * vFwd));
  car.understeerFactor = understeerAccum;
  if (car.understeerFactor > 0.10 && car.speed > 12) {
    car.speed = Math.max(10.0, car.speed - car.understeerFactor * 6.5 * dt);
  }

  car.heading -= dHeadingAccum;
  car.yawRate = -rYaw;

  const newFwdX = Math.sin(car.heading);
  const newFwdZ = Math.cos(car.heading);
  const newRightX = -Math.cos(car.heading);
  const newRightZ = Math.sin(car.heading);
  car.vx = newFwdX * (car.speed * moveSign) + newRightX * vLat;
  car.vz = newFwdZ * (car.speed * moveSign) + newRightZ * vLat;

  car.lateralSlip = Math.min(
    1,
    (Math.abs(vLat) / 5.5 + car.understeerFactor * 0.70) * (car.speed > 5 ? 1 : 0),
  );

  car.x += car.vx * dt;
  car.z += car.vz * dt;

  // Project onto track spline (update lateralOffset FIRST so car.y has zero 1-frame banking lag)
  const proj = projectOntoTrack(compiledTrack, car.x, car.z, car.trackT);
  const bank = proj.sample.banking || 0;
  car.lateralOffset = proj.lateralOffset;
  const heaveTarget =
    (car.sausageKerbHop ?? 0) * 0.11 * setupMod.kerbComplianceMult +
    (1.0 - crestLoadFactor) * 0.045;
  car.suspensionHeave = (car.suspensionHeave ?? 0) + (heaveTarget - (car.suspensionHeave ?? 0)) * (1 - Math.exp(-18 * dt));
  car.y = proj.sample.y + car.lateralOffset * Math.sin(bank) + (car.suspensionHeave ?? 0);
  const newTilt = computeRoadSurfaceTilt(proj.sample, car.heading);
  // Couple longitudinal brake dive / accel squat and lateral cornering body roll into car pitch & roll
  const latGApprox = Math.max(-3.8, Math.min(3.8, (car.speed * rYaw) / 9.81));
  const dynPitch = Math.max(-0.055, Math.min(0.045, longG * 0.016 * setupMod.pitchRollScale));
  const dynRoll = Math.max(-0.075, Math.min(0.075, latGApprox * 0.018 * setupMod.pitchRollScale));
  const targetPitch = newTilt.pitchRad + dynPitch;
  const targetRoll = newTilt.rollRad + dynRoll;
  const tiltDamp = 1 - Math.exp(-15 * dt);
  car.pitch = (car.pitch ?? targetPitch) + (targetPitch - (car.pitch ?? targetPitch)) * tiltDamp;
  car.roll = (car.roll ?? targetRoll) + (targetRoll - (car.roll ?? targetRoll)) * tiltDamp;

  // Kerb contact detection on curved apexes
  const sampleHalfW = (proj.sample.width ? proj.sample.width : compiledTrack.spec.trackWidth) * 0.5;
  car.onKerb =
    car.speed > 4 &&
    Math.abs(proj.sample.curvature) > 0.008 &&
    Math.abs(car.lateralOffset) >= sampleHalfW - 0.65 &&
    Math.abs(car.lateralOffset) <= sampleHalfW + 1.8 &&
    ((proj.sample.curvature > 0 && car.lateralOffset > 0) ||
      (proj.sample.curvature < 0 && car.lateralOffset < 0));

  // Update wall collision cooldown & spawn ghosting timers
  if (car.wallCollisionCooldown && car.wallCollisionCooldown > 0) {
    car.wallCollisionCooldown = Math.max(0, car.wallCollisionCooldown - dt);
  }
  if (car.spawnGhostTimer && car.spawnGhostTimer > 0) {
    car.spawnGhostTimer = Math.max(0, car.spawnGhostTimer - dt);
  }

  // Solid continuous track barriers — exact match to 3D trackBuilder wall inner face minus car's oriented lateral half-extent
  // so no part of a car's bodywork or nose can ever clip outside the barrier.
  const wallDims = car.carSpec.dimensions ?? getRealWorldCarDimensions(car.carSpec.id, car.carSpec.classId);
  const carHalfW = (wallDims.width ?? 2.0) * 0.5;
  const carHalfL = (wallDims.length ?? 4.6) * 0.5;
  const trackHeading = Math.atan2(proj.sample.tx, proj.sample.tz);
  const relYaw = car.heading - trackHeading;
  const orientedHalfLat =
    Math.abs(Math.cos(relYaw)) * carHalfW + Math.abs(Math.sin(relYaw)) * carHalfL;
  const wallClearance = Math.max(carHalfW + 0.12, orientedHalfLat + 0.08);
  const rightWallInner = computeTrackWallHalfWidth(sampleHalfW, proj.sample.curvature || 0, 1);
  const leftWallInner = computeTrackWallHalfWidth(sampleHalfW, proj.sample.curvature || 0, -1);
  const maxRight = Math.max(sampleHalfW * 0.5, rightWallInner - wallClearance);
  const maxLeft = -Math.max(sampleHalfW * 0.5, leftWallInner - wallClearance);
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
      // Cap slow-down penalties at 0.5s–1.2s max; repeated violations also accrue +3s steward penalty
      car.penaltyReason = 'corner-cut';
      car.penaltyType = car.warningCount >= 6 ? 'time-penalty' : 'slow-down';
      car.penaltyTimeRemaining = Math.min(1.2, Math.max(0.6, car.penaltyTimeRemaining + 0.8));
      if (car.warningCount >= 6) {
        car.postRacePenaltySeconds = (car.postRacePenaltySeconds ?? 0) + 3;
      }
    }
  }

  // Sector splits (S1 @ 0.333, S2 @ 0.667, S3 @ S/F) & Lap progress tracking
  car.prevTrackT = car.trackT;
  car.trackT = proj.sample.t;
  if (!car.finished) {
    car.currentLapTime += dt;
    car.totalTime += dt;
  }

  if (!car.sectorTimes) car.sectorTimes = [null, null, null];
  if (!car.bestSectorTimes) car.bestSectorTimes = [null, null, null];
  if (!car.lastLapSectorTimes) car.lastLapSectorTimes = [null, null, null];

  if (!car.finished && !isReversing && car.totalDistance >= 0) {
    if (car.prevTrackT < 0.333 && car.trackT >= 0.333 && (car.currentSector ?? 1) === 1) {
      const s1 = car.currentLapTime;
      car.sectorTimes[0] = s1;
      if (car.bestSectorTimes[0] === null || s1 < car.bestSectorTimes[0]) {
        car.bestSectorTimes[0] = s1;
      }
      car.sectorStartTime = car.currentLapTime;
      car.currentSector = 2;
    } else if (car.prevTrackT < 0.667 && car.trackT >= 0.667 && car.currentSector === 2) {
      const s2 = Math.max(0.1, car.currentLapTime - (car.sectorStartTime ?? 0));
      car.sectorTimes[1] = s2;
      if (car.bestSectorTimes[1] === null || s2 < car.bestSectorTimes[1]) {
        car.bestSectorTimes[1] = s2;
      }
      car.sectorStartTime = car.currentLapTime;
      car.currentSector = 3;
    }
  }

  // Detect start/finish crossing forward (prevTrackT > 0.85 && trackT < 0.15)
  if (!car.finished && !isReversing && car.prevTrackT > 0.85 && car.trackT < 0.15) {
    if (car.totalDistance < 0) {
      // Initial start/finish crossing from pre-start grid
      car.lap = 1;
      car.currentLapTime = 0;
      car.currentSector = 1;
      car.sectorStartTime = 0;
      car.sectorTimes = [null, null, null];
    } else {
      // Sub-frame crossing interpolation so finish times & lap times are exact to milliseconds
      const totalStepT = Math.max(1e-5, (1 - car.prevTrackT) + car.trackT);
      const overshootFrac = Math.max(0, Math.min(1, car.trackT / totalStepT));
      const overshootSec = dt * overshootFrac;
      const completedTime = Math.max(0.1, car.currentLapTime - overshootSec);
      if (completedTime > 5) {
        const s3 = Math.max(0.1, completedTime - (car.sectorStartTime ?? 0));
        car.sectorTimes[2] = s3;
        if (car.bestSectorTimes[2] === null || s3 < car.bestSectorTimes[2]) {
          car.bestSectorTimes[2] = s3;
        }
        car.lastLapSectorTimes = [car.sectorTimes[0], car.sectorTimes[1], s3];
        car.lastLapTime = completedTime;
        if (car.bestLapTime === null || completedTime < car.bestLapTime) {
          car.bestLapTime = completedTime;
        }
      }
      car.currentLapTime = overshootSec;
      car.currentSector = 1;
      car.sectorStartTime = 0;
      car.sectorTimes = [null, null, null];
      if (opts.isQualifying) {
        car.totalTime = Math.max(0, car.totalTime - overshootSec);
        car.finished = true;
      } else if (!(opts.isPractice && opts.totalLaps <= 0) && car.lap >= opts.totalLaps) {
        car.totalTime = Math.max(0, car.totalTime - overshootSec);
        car.finished = true;
      } else {
        car.lap += 1;
      }
    }
  } else if (!car.finished && car.prevTrackT < 0.15 && car.trackT > 0.85 && car.totalDistance > 0.2) {
    // Backwards crossing guard
    car.lap = Math.max(1, car.lap - 1);
  }

  car.totalDistance = car.totalDistance < 0 && car.prevTrackT > 0.5 && car.trackT > 0.5
    ? car.trackT - 1
    : (car.lap - 1) + car.trackT;

  // Per-Corner 4-Wheel Tire Modeling (FL / FR / RL / RR wear, thermal dynamics, graining & lock-up flat spots)
  const efficiencyFactor = 1.25 - (attrs.efficiency / 100) * 0.55;
  const cornerLoad = Math.abs(steerInput) * speedNorm;
  const latShift = Math.max(-0.45, Math.min(0.45, (car.speed * rYaw) / 36.0)); // + = turning right (loads left tires)
  const longShift = Math.max(-0.35, Math.min(0.35, brake * 0.30 - throttle * 0.18));
  const fBaseLoad = (1.0 + longShift) * crestLoadFactor;
  const rBaseLoad = (1.0 - longShift) * crestLoadFactor;
  const loads = {
    fl: Math.max(0.25, fBaseLoad * (1.0 + latShift)),
    fr: Math.max(0.25, fBaseLoad * (1.0 - latShift)),
    rl: Math.max(0.25, rBaseLoad * (1.0 + latShift)),
    rr: Math.max(0.25, rBaseLoad * (1.0 - latShift)),
  };

  const lockup = car.brakeLockupIntensity ?? 0;
  const rearWheelspin = throttle > 0.82 && car.speed < 28 && !isFE ? (throttle - 0.82) * 2.5 : 0;
  const trackTempBias = (trackTempC - 26) * 0.45;
  const baseWearStep = (0.014 + cornerLoad * 0.045 + car.understeerFactor * 0.04) * compoundMod.wearRate * efficiencyFactor;

  const updateWheel = (
    w: { wear: number; temp: number; flatSpot: number; graining: number; load: number },
    load: number,
    isFront: boolean,
  ) => {
    w.load = load;
    const heatMult = isFront ? setupMod.frontTireHeatMult : setupMod.rearTireHeatMult;
    const wearMult = isFront ? setupMod.frontTireWearMult : setupMod.rearTireWearMult;
    const extraScrub = isFront
      ? car.understeerFactor * 0.55 + lockup * 0.9
      : rearWheelspin * 0.65 + car.lateralSlip * 0.35;

    w.wear = Math.max(5, w.wear - baseWearStep * (0.65 + 0.35 * load + extraScrub * 0.4) * wearMult * dt);

    const targetWheelTemp =
      compoundMod.optimalTemp +
      trackTempBias +
      (cornerLoad * 24 * load + extraScrub * 22) * heatMult -
      effectiveWetness * 14 -
      puddleIntensity * 8;
    w.temp += (targetWheelTemp - w.temp) * Math.min(1, dt * (1.2 + load * 0.35));

    // Lock-up accumulates flat-spot on fronts (or rears if rear-biased)
    if (lockup > 0.15 && ((isFront && setupMod.brakeBiasFront >= 0.52) || (!isFront && setupMod.brakeBiasFront < 0.52))) {
      w.flatSpot = Math.min(1, w.flatSpot + lockup * 0.065 * dt);
    }
    // Cold graining if pushing hard while tire is significantly below operating window
    if (w.temp < compoundMod.optimalTemp - 16 && cornerLoad > 0.45) {
      w.graining = Math.min(1, w.graining + 0.03 * cornerLoad * dt);
    } else if (w.temp >= compoundMod.optimalTemp - 6) {
      w.graining = Math.max(0, w.graining - 0.04 * dt);
    }
  };

  updateWheel(tState.fl, loads.fl, true);
  updateWheel(tState.fr, loads.fr, true);
  updateWheel(tState.rl, loads.rl, false);
  updateWheel(tState.rr, loads.rr, false);

  car.tireWear = (tState.fl.wear + tState.fr.wear + tState.rl.wear + tState.rr.wear) * 0.25;
  car.tireTemp = (tState.fl.temp + tState.fr.temp + tState.rl.temp + tState.rr.temp) * 0.25;
  car.flatSpotVibration = Math.max(tState.fl.flatSpot, tState.fr.flatSpot, tState.rl.flatSpot, tState.rr.flatSpot);

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

export const CAR_COLLISION_CONSTANTS = {
  BASE_RESTITUTION: 0.08,
  BUMP_DRAFT_RESTITUTION: 0.0,
  BUMP_DRAFT_MAX_CLOSING_SPEED: 8.0, // m/s (~29 km/h)
  BUMP_DRAFT_MIN_HEADING_DOT: 0.88,
  BUMP_DRAFT_MIN_NORMAL_DOT: 0.78,
  BUMP_DRAFT_MIN_FORWARD_SPEED: 5.0,
  TANGENTIAL_FRICTION_MU: 0.20,
  PENETRATION_SLOP: 0.015,
  BUMP_DRAFT_SLOP: 0.03,
  POSITION_CORRECTION_PERCENT: 0.72,
  BUMP_DRAFT_CORRECTION_PERCENT: 0.45,
  MAX_POSITION_CORRECTION_PER_STEP: 0.25,
  MAX_LINEAR_DV_PER_STEP: 14.0,
  MAX_ANGULAR_DW_PER_STEP: 2.6,
  MAX_YAW_RATE: 4.5,
  DAMAGE_THRESHOLD_SPEED: 25 / SPEED_KMH_FACTOR, // 6.944 m/s (25 km/h)
} as const;

interface CarCollisionBody {
  x: number;
  z: number;
  fwdX: number;
  fwdZ: number;
  rightX: number;
  rightZ: number;
  halfW: number;
  halfL: number;
  mass: number;
  invMass: number;
  invInertia: number;
}

interface ObbContactManifold {
  nx: number;
  nz: number;
  penetration: number;
  cx: number;
  cz: number;
}

function getCarCollisionMassKg(classId: CarClassId): number {
  switch (classId) {
    case CarClassId.F1_2026:
    case CarClassId.F1_2021:
      return 798;
    case CarClassId.F1_2005:
      return 720;
    case CarClassId.HYPERCAR_GTP:
      return 1030;
    case CarClassId.LMP2:
      return 930;
    case CarClassId.GT3:
      return 1300;
    case CarClassId.GT4:
      return 1420;
    case CarClassId.FORMULA_E:
      return 860;
    case CarClassId.TRACK_COUPE:
      return 1450;
    default:
      return 1400;
  }
}

function getCarCollisionBody(car: CarSimState): CarCollisionBody {
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  const dims = car.carSpec.dimensions ?? getRealWorldCarDimensions(car.carSpec.id, car.carSpec.classId);
  const halfW = Math.max(0.85, Math.min(1.15, (dims.width ?? 1.98) * 0.48));
  const halfL = Math.max(2.0, Math.min(2.9, (dims.length ?? 4.75) * 0.485));
  const wheelbase = Math.max(2.4, Math.min(3.7, dims.wheelbase ?? 2.8));
  const mass = getCarCollisionMassKg(car.carSpec.classId);
  const isGTP = car.carSpec.classId === CarClassId.HYPERCAR_GTP || car.carSpec.classId === CarClassId.LMP2;
  const inertia = (isGTP ? 0.19 : 0.20) * mass * wheelbase * wheelbase;

  return {
    x: car.x,
    z: car.z,
    fwdX: sinH,
    fwdZ: cosH,
    rightX: -cosH,
    rightZ: sinH,
    halfW,
    halfL,
    mass,
    invMass: 1 / mass,
    invInertia: 1 / Math.max(400, inertia),
  };
}

function projectObbRadius(body: CarCollisionBody, ax: number, az: number): number {
  return (
    Math.abs(body.rightX * ax + body.rightZ * az) * body.halfW +
    Math.abs(body.fwdX * ax + body.fwdZ * az) * body.halfL
  );
}

/**
 * 2D Sutherland-Hodgman clip of segment (p0, p1) against half-space dot(p, n) <= limit.
 */
function clipSegmentToHalfSpace(
  p0x: number,
  p0z: number,
  p1x: number,
  p1z: number,
  nx: number,
  nz: number,
  limit: number,
): Array<{ x: number; z: number }> {
  const d0 = p0x * nx + p0z * nz - limit;
  const d1 = p1x * nx + p1z * nz - limit;
  const out: Array<{ x: number; z: number }> = [];

  if (d0 <= 0) out.push({ x: p0x, z: p0z });
  if (d1 <= 0) out.push({ x: p1x, z: p1z });

  if ((d0 < 0 && d1 > 0) || (d0 > 0 && d1 < 0)) {
    const t = d0 / (d0 - d1);
    out.push({
      x: p0x + t * (p1x - p0x),
      z: p0z + t * (p1z - p0z),
    });
  }
  return out;
}

/**
 * 4-axis SAT OBB overlap test + clipped contact manifold point computation.
 * Normal (nx, nz) always points from body A toward body B.
 */
function computeObbCollision(a: CarCollisionBody, b: CarCollisionBody): ObbContactManifold | null {
  const dx = b.x - a.x;
  const dz = b.z - a.z;

  // 4 SAT axes: 0 = A.right, 1 = A.fwd, 2 = B.right, 3 = B.fwd
  const axesX = [a.rightX, a.fwdX, b.rightX, b.fwdX];
  const axesZ = [a.rightZ, a.fwdZ, b.rightZ, b.fwdZ];

  let minOverlap = Infinity;
  let bestAxisIndex = 0;
  let bestNx = 1;
  let bestNz = 0;

  for (let i = 0; i < 4; i++) {
    let ax = axesX[i];
    let az = axesZ[i];
    const centerProj = dx * ax + dz * az;
    const ra = projectObbRadius(a, ax, az);
    const rb = projectObbRadius(b, ax, az);
    const overlap = ra + rb - Math.abs(centerProj);
    if (overlap <= 0) return null;

    if (overlap < minOverlap) {
      minOverlap = overlap;
      bestAxisIndex = i;
      if (centerProj < 0) {
        ax = -ax;
        az = -az;
      }
      bestNx = ax;
      bestNz = az;
    }
  }

  // Reference body owns bestAxisIndex; incident body is the other
  const refIsA = bestAxisIndex < 2;
  const ref = refIsA ? a : b;
  const inc = refIsA ? b : a;
  const refAlongRight = bestAxisIndex === 0 || bestAxisIndex === 2;

  // Outward normal of the reference face (points from ref toward inc)
  const refNx = refIsA ? bestNx : -bestNx;
  const refNz = refIsA ? bestNz : -bestNz;
  const refExtentN = refAlongRight ? ref.halfW : ref.halfL;
  const refTx = refAlongRight ? ref.fwdX : ref.rightX;
  const refTz = refAlongRight ? ref.fwdZ : ref.rightZ;
  const refExtentT = refAlongRight ? ref.halfL : ref.halfW;

  const refFaceCx = ref.x + refNx * refExtentN;
  const refFaceCz = ref.z + refNz * refExtentN;

  // Find the incident face whose outward normal is most anti-parallel to refN
  const incNormals = [
    { nx: inc.rightX, nz: inc.rightZ, extN: inc.halfW, tx: inc.fwdX, tz: inc.fwdZ, extT: inc.halfL },
    { nx: -inc.rightX, nz: -inc.rightZ, extN: inc.halfW, tx: inc.fwdX, tz: inc.fwdZ, extT: inc.halfL },
    { nx: inc.fwdX, nz: inc.fwdZ, extN: inc.halfL, tx: inc.rightX, tz: inc.rightZ, extT: inc.halfW },
    { nx: -inc.fwdX, nz: -inc.fwdZ, extN: inc.halfL, tx: inc.rightX, tz: inc.rightZ, extT: inc.halfW },
  ];

  let incFace = incNormals[0];
  let minDot = Infinity;
  for (let i = 0; i < 4; i++) {
    const dot = incNormals[i].nx * refNx + incNormals[i].nz * refNz;
    if (dot < minDot) {
      minDot = dot;
      incFace = incNormals[i];
    }
  }

  const incCx = inc.x + incFace.nx * incFace.extN;
  const incCz = inc.z + incFace.nz * incFace.extN;
  let seg = [
    { x: incCx - incFace.tx * incFace.extT, z: incCz - incFace.tz * incFace.extT },
    { x: incCx + incFace.tx * incFace.extT, z: incCz + incFace.tz * incFace.extT },
  ];

  // Clip incident edge against both side planes of the reference face
  const sidePosLimit = refFaceCx * refTx + refFaceCz * refTz + refExtentT;
  const sideNegLimit = -(refFaceCx * refTx + refFaceCz * refTz) + refExtentT;

  seg = clipSegmentToHalfSpace(seg[0].x, seg[0].z, seg[1].x, seg[1].z, refTx, refTz, sidePosLimit);
  if (seg.length >= 2) {
    seg = clipSegmentToHalfSpace(seg[0].x, seg[0].z, seg[1].x, seg[1].z, -refTx, -refTz, sideNegLimit);
  }

  // Keep points penetrating (behind or on) the reference face plane
  const refPlaneOffset = refFaceCx * refNx + refFaceCz * refNz;
  let sumX = 0;
  let sumZ = 0;
  let count = 0;
  for (let i = 0; i < seg.length; i++) {
    const sep = seg[i].x * refNx + seg[i].z * refNz - refPlaneOffset;
    if (sep <= 0.025) {
      sumX += seg[i].x;
      sumZ += seg[i].z;
      count++;
    }
  }

  const cx = count > 0 ? sumX / count : 0.5 * (a.x + b.x);
  const cz = count > 0 ? sumZ / count : 0.5 * (a.z + b.z);

  return {
    nx: bestNx,
    nz: bestNz,
    penetration: minOverlap,
    cx,
    cz,
  };
}

/**
 * Resolves car-to-car collisions with 2D rigid-body OBB impulse physics:
 * 1. 4-axis SAT OBB overlap + clipped contact manifold point (lever arms rA, rB)
 * 2. Low-restitution (0.08) mass-weighted linear impulse & lever-arm yaw torque (PIT maneuvers)
 * 3. Bump-drafting detection: aligned low-closing-speed nose-to-tail drops restitution to 0.0 with gentle slop
 * 4. Clamped Coulomb tangential rubbing friction (mu = 0.20)
 * 5. Strictly separate positional depenetration & anti-fling linear/angular impulse clamps
 */
export function resolveCarCollisions(cars: CarSimState[]): number {
  let maxImpact = 0;
  const C = CAR_COLLISION_CONSTANTS;
  for (let i = 0; i < cars.length; i++) {
    cars[i].lastCollisionImpact = 0;
  }

  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      if (
        a.pitStopRemaining > 0 ||
        b.pitStopRemaining > 0 ||
        (a.spawnGhostTimer ?? 0) > 0 ||
        (b.spawnGhostTimer ?? 0) > 0
      ) {
        continue;
      }

      // Quick broadphase reject (> 6.5m center distance cannot touch)
      const cdx = b.x - a.x;
      const cdz = b.z - a.z;
      if (cdx * cdx + cdz * cdz > 42.25) continue;

      const bodyA = getCarCollisionBody(a);
      const bodyB = getCarCollisionBody(b);
      const manifold = computeObbCollision(bodyA, bodyB);
      if (!manifold) continue;

      const { nx, nz, penetration, cx, cz } = manifold;
      const invMassSum = bodyA.invMass + bodyB.invMass;

      // Lever arms from each car's center of mass to contact point
      const rAx = cx - a.x;
      const rAz = cz - a.z;
      const rBx = cx - b.x;
      const rBz = cz - b.z;

      const yawA = a.yawRate ?? 0;
      const yawB = b.yawRate ?? 0;

      // Contact-point velocities: v_p = v + omega x r (omega = (0, yawRate, 0))
      const vApX = a.vx + yawA * rAz;
      const vApZ = a.vz - yawA * rAx;
      const vBpX = b.vx + yawB * rBz;
      const vBpZ = b.vz - yawB * rBx;

      const relVx = vBpX - vApX;
      const relVz = vBpZ - vApZ;
      const relVNorm = relVx * nx + relVz * nz;
      const closingSpeed = Math.max(0, -relVNorm);

      // Detect bump-drafting: aligned headings, nose-to-tail normal, low relative closing speed
      const headingDot = bodyA.fwdX * bodyB.fwdX + bodyA.fwdZ * bodyB.fwdZ;
      const avgFwdLen = Math.hypot(bodyA.fwdX + bodyB.fwdX, bodyA.fwdZ + bodyB.fwdZ);
      const avgFwdX = avgFwdLen > 1e-4 ? (bodyA.fwdX + bodyB.fwdX) / avgFwdLen : bodyA.fwdX;
      const avgFwdZ = avgFwdLen > 1e-4 ? (bodyA.fwdZ + bodyB.fwdZ) / avgFwdLen : bodyA.fwdZ;
      const normalAlongHeading = Math.abs(nx * avgFwdX + nz * avgFwdZ);
      const aFwdSpd = a.vx * bodyA.fwdX + a.vz * bodyA.fwdZ;
      const bFwdSpd = b.vx * bodyB.fwdX + b.vz * bodyB.fwdZ;

      const isBumpDraft =
        headingDot >= C.BUMP_DRAFT_MIN_HEADING_DOT &&
        normalAlongHeading >= C.BUMP_DRAFT_MIN_NORMAL_DOT &&
        closingSpeed <= C.BUMP_DRAFT_MAX_CLOSING_SPEED &&
        aFwdSpd >= C.BUMP_DRAFT_MIN_FORWARD_SPEED &&
        bFwdSpd >= C.BUMP_DRAFT_MIN_FORWARD_SPEED;

      // 1. Pure positional depenetration (strictly separate from velocity impulse)
      const slop = isBumpDraft ? C.BUMP_DRAFT_SLOP : C.PENETRATION_SLOP;
      const posPct = isBumpDraft ? C.BUMP_DRAFT_CORRECTION_PERCENT : C.POSITION_CORRECTION_PERCENT;
      const corrMag = Math.min(
        C.MAX_POSITION_CORRECTION_PER_STEP,
        Math.max(0, penetration - slop) * posPct,
      );
      if (corrMag > 0) {
        const shareA = bodyA.invMass / invMassSum;
        const shareB = bodyB.invMass / invMassSum;
        a.x -= nx * corrMag * shareA;
        a.z -= nz * corrMag * shareA;
        b.x += nx * corrMag * shareB;
        b.z += nz * corrMag * shareB;
      }

      // 2. Mass-weighted normal impulse with rotational lever-arm torque
      let jN = 0;
      const maxInvMass = Math.max(bodyA.invMass, bodyB.invMass);
      const maxLinearImpulse = C.MAX_LINEAR_DV_PER_STEP / maxInvMass;

      if (relVNorm < 0) {
        const restitution = isBumpDraft ? C.BUMP_DRAFT_RESTITUTION : C.BASE_RESTITUTION;
        // 2D cross product (r x n)_y = r.z * n.x - r.x * n.z
        const rACrossN = rAz * nx - rAx * nz;
        const rBCrossN = rBz * nx - rBx * nz;
        const denomN =
          invMassSum +
          rACrossN * rACrossN * bodyA.invInertia +
          rBCrossN * rBCrossN * bodyB.invInertia;

        if (denomN > 1e-6) {
          jN = (-(1 + restitution) * relVNorm) / denomN;
          jN = Math.max(0, Math.min(maxLinearImpulse, jN));

          const jNx = jN * nx;
          const jNz = jN * nz;

          a.vx -= jNx * bodyA.invMass;
          a.vz -= jNz * bodyA.invMass;
          b.vx += jNx * bodyB.invMass;
          b.vz += jNz * bodyB.invMass;

          const dYawA = Math.max(
            -C.MAX_ANGULAR_DW_PER_STEP,
            Math.min(C.MAX_ANGULAR_DW_PER_STEP, (-rACrossN * jN) * bodyA.invInertia),
          );
          const dYawB = Math.max(
            -C.MAX_ANGULAR_DW_PER_STEP,
            Math.min(C.MAX_ANGULAR_DW_PER_STEP, (rBCrossN * jN) * bodyB.invInertia),
          );
          a.yawRate = Math.max(-C.MAX_YAW_RATE, Math.min(C.MAX_YAW_RATE, yawA + dYawA));
          b.yawRate = Math.max(-C.MAX_YAW_RATE, Math.min(C.MAX_YAW_RATE, yawB + dYawB));
        }
      }

      // 3. Clamped Coulomb tangential friction (door-to-door rubbing + rotational shear)
      if (jN > 0) {
        const tx = -nz;
        const tz = nx;
        const curYawA = a.yawRate ?? 0;
        const curYawB = b.yawRate ?? 0;
        const vApX2 = a.vx + curYawA * rAz;
        const vApZ2 = a.vz - curYawA * rAx;
        const vBpX2 = b.vx + curYawB * rBz;
        const vBpZ2 = b.vz - curYawB * rBx;
        const relVTan = (vBpX2 - vApX2) * tx + (vBpZ2 - vApZ2) * tz;

        const rACrossT = rAz * tx - rAx * tz;
        const rBCrossT = rBz * tx - rBx * tz;
        const denomT =
          invMassSum +
          rACrossT * rACrossT * bodyA.invInertia +
          rBCrossT * rBCrossT * bodyB.invInertia;

        if (denomT > 1e-6 && Math.abs(relVTan) > 1e-4) {
          const maxFriction = Math.min(C.TANGENTIAL_FRICTION_MU * jN, maxLinearImpulse * 0.5);
          const jT = Math.max(-maxFriction, Math.min(maxFriction, -relVTan / denomT));
          const jTx = jT * tx;
          const jTz = jT * tz;

          a.vx -= jTx * bodyA.invMass;
          a.vz -= jTz * bodyA.invMass;
          b.vx += jTx * bodyB.invMass;
          b.vz += jTz * bodyB.invMass;

          const dYawTanA = Math.max(
            -C.MAX_ANGULAR_DW_PER_STEP * 0.5,
            Math.min(C.MAX_ANGULAR_DW_PER_STEP * 0.5, (-rACrossT * jT) * bodyA.invInertia),
          );
          const dYawTanB = Math.max(
            -C.MAX_ANGULAR_DW_PER_STEP * 0.5,
            Math.min(C.MAX_ANGULAR_DW_PER_STEP * 0.5, (rBCrossT * jT) * bodyB.invInertia),
          );
          a.yawRate = Math.max(-C.MAX_YAW_RATE, Math.min(C.MAX_YAW_RATE, curYawA + dYawTanA));
          b.yawRate = Math.max(-C.MAX_YAW_RATE, Math.min(C.MAX_YAW_RATE, curYawB + dYawTanB));
        }
      }

      // 4. Sync longitudinal speed scalar along each car's heading (never convert sideways impact into forward speed)
      const aProj = a.vx * bodyA.fwdX + a.vz * bodyA.fwdZ;
      const bProj = b.vx * bodyB.fwdX + b.vz * bodyB.fwdZ;
      a.speed = Math.max(0, a.gear === -1 ? -aProj : aProj);
      b.speed = Math.max(0, b.gear === -1 ? -bProj : bProj);

      // 5. Localized damage only above 25 km/h closing speed, capped at 3.5% per contact (light default)
      if (closingSpeed >= C.DAMAGE_THRESHOLD_SPEED) {
        maxImpact = Math.max(maxImpact, closingSpeed);
        a.lastCollisionImpact = Math.max(a.lastCollisionImpact ?? 0, closingSpeed);
        b.lastCollisionImpact = Math.max(b.lastCollisionImpact ?? 0, closingSpeed);
        const dmg = Math.min(3.5, (closingSpeed - C.DAMAGE_THRESHOLD_SPEED) * 0.25);

        // Determine hit zone on A and B using contact lever arm projected onto each car's heading
        const aLocalFwd = rAx * bodyA.fwdX + rAz * bodyA.fwdZ;
        const aLocalLat = rAx * (-bodyA.fwdZ) + rAz * bodyA.fwdX;
        const zoneA: 'front' | 'rear' | 'side' =
          aLocalFwd > bodyA.halfL * 0.45 ? 'front' : aLocalFwd < -bodyA.halfL * 0.45 ? 'rear' : 'side';

        const bLocalFwd = rBx * bodyB.fwdX + rBz * bodyB.fwdZ;
        const bLocalLat = rBx * (-bodyB.fwdZ) + rBz * bodyB.fwdX;
        const zoneB: 'front' | 'rear' | 'side' =
          bLocalFwd > bodyB.halfL * 0.45 ? 'front' : bLocalFwd < -bodyB.halfL * 0.45 ? 'rear' : 'side';

        applyLocalizedImpactDamage(a, zoneA, dmg, closingSpeed, aLocalLat);
        applyLocalizedImpactDamage(b, zoneB, dmg, closingSpeed, bLocalLat);

        // Avoidable-contact stewarding: rear-ending another car at high closing speed triggers warning/penalty
        if (closingSpeed > 12.5 && !isBumpDraft) {
          if (zoneA === 'front' && zoneB === 'rear') {
            a.warningCount += 1;
            a.penaltyReason = 'avoidable-contact';
            if (a.warningCount >= 3) {
              a.penaltyType = 'time-penalty';
              a.postRacePenaltySeconds = (a.postRacePenaltySeconds ?? 0) + 5;
            }
          } else if (zoneB === 'front' && zoneA === 'rear') {
            b.warningCount += 1;
            b.penaltyReason = 'avoidable-contact';
            if (b.warningCount >= 3) {
              b.penaltyType = 'time-penalty';
              b.postRacePenaltySeconds = (b.postRacePenaltySeconds ?? 0) + 5;
            }
          }
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
  // Dynamic pack pace variance: runaway leaders ease slightly, trailing cars behind player push harder
  const aiPackPace = computeDynamicAiPackPace(car, allCars, compiledTrack.totalLength);
  const effectiveAiPace = car.aiPaceMultiplier * aiPackPace;
  // Cornering speed utilization capped strictly <= 1.00 (100% of physical tire grip)
  const skillFactor = Math.max(
    0.75,
    Math.min(1.0, 0.96 * (0.45 + 0.55 * effectiveAiPace) * tuning.aiCornerSpeedScale),
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
    }
  }

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
    // Calibrated centripetal safe cornering speed matching bicycle tire friction limit (availableGrip * 11.5)
    const minCornerSpeed = absK > 0.10 ? 7.2 : 9.0;
    const curvScale = absK > 0.10 ? 9.8 : 11.2;
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

    // Straight-line bump-drafting: when aligned behind a same-class car at high speed on a clear straight
    // with low closing speed, stay tucked in the tow and bump-draft instead of timidly lifting at 14m.
    const canBumpDraftStraight =
      maxBrakeRatio < 0.30 &&
      Math.abs(currentSample.curvature) < 0.008 &&
      car.speed > 35 &&
      leadCar.speed > 30 &&
      closingSpeed < 6.5 &&
      leadCar.carSpec.classId === car.carSpec.classId;

    // Only apply collision braking when actually overlapping our lane or dangerously close without open passing space
    const immediateDanger = hasLateralOverlap && (!pullingOutToPass || leadDs < 14.0);

    if (immediateDanger && !canBumpDraftStraight) {
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
    } else if (immediateDanger && canBumpDraftStraight && leadDs < 6.0 && closingSpeed > 4.2) {
      // Gentle match so bump-draft contact stays below damage threshold (< 4.2 m/s closing speed)
      avoidThrottleCap = 0.72;
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

  // Trigger Class / Car Special on straights when clear ahead (toggle semantics)
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
  } else if (resolvedSpecial.specialType !== 'none') {
    if (onStraight && !car.specialActive && car.specialCharge > 50 && car.speed > 24 && !leadCar) {
      specialPressed = true;
    } else if ((!onStraight || brake > 0.25) && car.specialActive) {
      specialPressed = true;
    }
  }

  // Blue Flag Multi-Class Yielding: slower cars cleanly open the racing line and ease slightly for faster approaching traffic
  if (car.blueFlagActive && car.speed > 14 && Math.abs(car.lateralOffset) < halfW * 0.72) {
    const yieldSide = car.lateralOffset >= 0 ? Math.min(maxSafeLane, halfW * 0.68) : Math.max(minSafeLane, -halfW * 0.68);
    car.aiTargetOffset += (yieldSide - car.aiTargetOffset) * Math.min(1, dt * 3.5);
    throttle *= 0.90;
  }

  return { throttle, brake, steer, specialPressed, specialJustPressed: specialPressed };
}

export function computeStandings(cars: CarSimState[], compiledTrack: CompiledTrack): DriverStandingsEntry[] {
  const effectiveTime = (c: CarSimState) => c.totalTime + (c.postRacePenaltySeconds ?? 0);
  const sorted = [...cars].sort((a, b) => {
    if (a.finished && !b.finished) return -1;
    if (!a.finished && b.finished) return 1;
    if (a.finished && b.finished) return effectiveTime(a) - effectiveTime(b);
    return b.totalDistance - a.totalDistance;
  });

  const classCounters = new Map<CarClassId, number>();
  const leader = sorted[0];

  return sorted.map((c, idx) => {
    const classPos = (classCounters.get(c.carSpec.classId) ?? 0) + 1;
    classCounters.set(c.carSpec.classId, classPos);

    const ahead = idx > 0 ? sorted[idx - 1] : null;
    const refSpeed = Math.max(24, c.speed);

    let intervalToLeaderSec = 0;
    if (idx > 0) {
      if (leader.finished && c.finished) {
        intervalToLeaderSec = Math.max(0, effectiveTime(c) - effectiveTime(leader));
      } else if (leader.finished && !c.finished) {
        // Elapsed gap since leader crossed plus estimated remaining time to the finish line
        const remainingLaps = Math.max(0, leader.lap - c.totalDistance);
        const elapsedSinceLeader = Math.max(0, effectiveTime(c) - effectiveTime(leader));
        intervalToLeaderSec = elapsedSinceLeader + (remainingLaps * compiledTrack.totalLength) / refSpeed;
      } else {
        const distDiffLeader = Math.max(0, (leader.totalDistance - c.totalDistance) * compiledTrack.totalLength);
        intervalToLeaderSec = distDiffLeader / refSpeed;
      }
    }

    let intervalToAheadSec = 0;
    if (ahead) {
      if (ahead.finished && c.finished) {
        intervalToAheadSec = Math.max(0, effectiveTime(c) - effectiveTime(ahead));
      } else if (ahead.finished && !c.finished) {
        const remainingLaps = Math.max(0, ahead.lap - c.totalDistance);
        const elapsedSinceAhead = Math.max(0, effectiveTime(c) - effectiveTime(ahead));
        intervalToAheadSec = elapsedSinceAhead + (remainingLaps * compiledTrack.totalLength) / refSpeed;
      } else {
        const distDiffAhead = Math.max(0, (ahead.totalDistance - c.totalDistance) * compiledTrack.totalLength);
        intervalToAheadSec = distDiffAhead / refSpeed;
      }
    }

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
      intervalToAhead: Number(intervalToAheadSec.toFixed(2)),
      intervalToLeader: Number(intervalToLeaderSec.toFixed(2)),
      bestLapTime: c.bestLapTime,
      lastLapTime: c.lastLapTime,
      totalTime: effectiveTime(c),
      postRacePenaltySeconds: c.postRacePenaltySeconds ?? 0,
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
