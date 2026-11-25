import { CAR_CLASSES, carHasHybridErs, getCarById, resolveCarSpecial, getCarBoP, BoPMultipliers, getRealWorldCarDimensions } from './cars';
import { computeSetupPhysicsModifiers, DEFAULT_CAR_SETUP, normalizeCarSetup, resolveEffectiveBoP } from './carSetup';
import { CompiledTrack, computeTrackWallHalfWidth, projectOntoTrack, sampleTrackAtT } from './tracks';
import { getAiPaceOrderModifiers } from './scenarios';
import { computeRacecraftOverlay } from './aiRacecraft';
import {
  classifyTrackSurface,
  computeWheelGripFactor,
  createInitialFourWheelTires,
  getCompoundModifiers,
  stepBrakeThermalAndLockup,
  stepFourWheelTireDynamics,
} from './physicsTires';
import {
  ACTIVE_TUNING_CONFIG,
  computeClassGripProfile,
  computeCrestLoadFactor,
  computeDirtyAirStrength,
  computeErsAndSpecialMultipliers,
  computeRoadSurfaceTilt,
  computeSlipstreamStrength,
  GLOBAL_TUNING_CONFIG,
  resolveTuningConfig,
  TUNING_BOUNDS,
  TuningConfig,
  updateCarSpecialActivation,
} from './physicsAero';
import {
  applyLocalizedImpactDamage,
  CAR_COLLISION_CONSTANTS,
  createInitialLocalizedDamage,
  resolveCarCollisions,
  resolveWallContact,
  SPEED_KMH_FACTOR,
} from './physicsCollisions';
import {
  computeDynamicAiPackPace,
  computeRollingFormationControl,
  computeStandings,
  formatLapTime,
  getCarDrivetrain,
  getClassFuelCapacityLiters,
  getDifficultyMultiplier,
  getPitServiceDuration,
  getRollingFormationSpeedMs,
  isCarTcEquipped,
  requestOnTrackPitStop,
  resolveClassDefaultTc,
  tryStepMecachromeEvent,
} from './physicsStandings';
import {
  AbsLevel,
  AiNeuralTelemetrySnapshot,
  AiPaceOrder,
  AIPersonality,
  CarClassId,
  CarSetupConfig,
  CarSpec,
  DamageLevel,
  FourWheelTireState,
  LiveryConfig,
  LocalizedDamageState,
  PenaltyReason,
  PenaltyType,
  PitServiceAction,
  PitStrategy,
  RaceStartType,
  TcLevel,
  TireCompound,
  TrackSurfaceType,
} from './types';

export type { CompiledTrack } from './tracks';
export { sampleTrackAtT } from './tracks';
export type { TuningConfig } from './physicsAero';
export {
  TUNING_BOUNDS,
  GLOBAL_TUNING_CONFIG,
  resolveTuningConfig,
  ACTIVE_TUNING_CONFIG,
  computeRoadSurfaceTilt,
  computeClassGripProfile,
  computeDirtyAirStrength,
  computeCrestLoadFactor,
  computeSlipstreamStrength,
} from './physicsAero';
export {
  createInitialFourWheelTires,
  getCompoundModifiers,
  classifyTrackSurface,
} from './physicsTires';
export {
  SPEED_KMH_FACTOR,
  createInitialLocalizedDamage,
  resolveWallContact,
  applyLocalizedImpactDamage,
  CAR_COLLISION_CONSTANTS,
  resolveCarCollisions,
} from './physicsCollisions';
export {
  getRollingFormationSpeedMs,
  computeRollingFormationControl,
  getDifficultyMultiplier,
  getClassFuelCapacityLiters,
  computeDynamicAiPackPace,
  getPitServiceDuration,
  requestOnTrackPitStop,
  computeStandings,
  formatLapTime,
  getCarDrivetrain,
  isCarTcEquipped,
  resolveClassDefaultTc,
  tryStepMecachromeEvent,
} from './physicsStandings';

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
  transmissionMode?: 'auto' | 'semi-auto' | 'manual';
  semiAutoHoldTimer?: number;
  tcLevel?: TcLevel;
  tcIntervening?: boolean;
  stabilityControl?: boolean;
  stabilityIntervening?: boolean;
  mecachromeActive?: boolean;
  mecachromeTimer?: number;
  mecachromeCooldown?: number;
  lastInputThrottle?: number;
  lastInputBrake?: number;
  lastInputSteer?: number;
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
  frontAxleSlip?: number; // 0..1 front-axle lateral/understeer slip (used for FWD TC)
  rearAxleSlip?: number; // 0..1 rear-axle lateral/oversteer slip (used for RWD TC)
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
  ersMode?: ErsModePlaceholder;
  ersBattery: number; // 0..100 standalone hybrid battery (GTP hybrids, F1 26, F1 21 only)
  drsEligible?: boolean;
  inDrsZone?: boolean;
  inAttackModeZone?: boolean;
  blueFlagActive?: boolean;
  blackAndWhiteFlagged?: boolean;
  disqualified?: boolean;
  postRacePenaltySeconds?: number;
  penaltyReason?: PenaltyReason | null;
  penaltyType?: PenaltyType | null;
  lastAvoidableContactImpact?: number;
  launchBoostTimer?: number; // >0 seconds of standing-start perfect-launch traction bonus
  debrisBurstIntensity?: number; // >0 transient impact debris cue for 3D VFX
  localWetness?: number;
  puddleIntensity?: number;
  trackRubber?: number;
  eliminated?: boolean;
  aiPaceOrder?: AiPaceOrder;
  aiPendingStop?: { action: PitServiceAction; compound?: TireCompound } | null;
  // Section 4: Driver Roster, Racecraft, One-Move Defense, Human-Like Mistakes & Recovery
  aiDriverId?: string;
  aiNationality?: string;
  aiTeamName?: string;
  aiRivalId?: string;
  aiSkillRating?: number;
  aiAggression?: number;
  aiWetSkill?: number;
  aiConsistency?: number;
  aiReverseTimer?: number;
  aiDefenseCommitted?: boolean;
  aiDefenseLane?: number;
  aiDefenseTimer?: number;
  aiMistakeTimer?: number;
  aiMistakeCooldown?: number;
  aiMistakeType?: 'lockup' | 'wide-exit';
  aiMistakeDir?: number;
  aiStrategyIntent?: string | null;
  aiLastTelemetry?: AiNeuralTelemetrySnapshot | null;
}

type ErsModePlaceholder = import('./types').ErsMode;

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
  transmissionMode?: 'auto' | 'semi-auto' | 'manual';
  tcLevel?: TcLevel;
  stabilityControl?: boolean;
  bopEnabled?: boolean;
  startType?: RaceStartType;
  rollingSpeed?: number;
  damageLevel?: DamageLevel;
  absLevel?: AbsLevel;
  setup?: CarSetupConfig;
  aiDriverId?: string;
  aiNationality?: string;
  aiTeamName?: string;
  aiRivalId?: string;
  aiSkillRating?: number;
  aiAggression?: number;
  aiWetSkill?: number;
  aiConsistency?: number;
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
    ersBattery: carHasHybridErs(carSpec) ? 100 : 0,
    drsEligible: false,
    inDrsZone: false,
    inAttackModeZone: false,
    blueFlagActive: false,
    blackAndWhiteFlagged: false,
    disqualified: false,
    postRacePenaltySeconds: 0,
    penaltyReason: null,
    penaltyType: null,
    lastAvoidableContactImpact: 0,
    launchBoostTimer: 0,
    debrisBurstIntensity: 0,
    localWetness: 0,
    puddleIntensity: 0,
    trackRubber: 0.25,
    specialCharge: resolveCarSpecial(carSpec).specialType === 'none' ? 0 : 100,
    specialActive: false,
    attackModeUsesRemaining: 2,
    attackModeTimer: 0,
    inSlipstream: false,
    understeerFactor: 0,
    lateralSlip: 0,
    frontAxleSlip: 0,
    rearAxleSlip: 0,
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
    semiAutoHoldTimer: 0,
    tcLevel: isCarTcEquipped(carSpec.classId, carSpec.id) ? (params.tcLevel ?? 0) : 0,
    tcIntervening: false,
    stabilityControl: params.stabilityControl ?? false,
    stabilityIntervening: false,
    mecachromeActive: false,
    mecachromeTimer: 0,
    mecachromeCooldown: 0,
    lastInputThrottle: 0,
    lastInputBrake: 0,
    lastInputSteer: 0,
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
    aiDriverId: params.aiDriverId,
    aiNationality: params.aiNationality,
    aiTeamName: params.aiTeamName,
    aiRivalId: params.aiRivalId,
    aiSkillRating: params.aiSkillRating,
    aiAggression: params.aiAggression,
    aiWetSkill: params.aiWetSkill,
    aiConsistency: params.aiConsistency,
    aiReverseTimer: 0,
    aiDefenseCommitted: false,
    aiMistakeTimer: 0,
    aiMistakeCooldown: 0,
    aiStrategyIntent: null,
    aiLastTelemetry: null,
  };
}

function getClassPhysicalConstants(
  classId: CarClassId,
  attrs: CarSpec['attributes'],
  topSpeedBopMult: number,
) {
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

  // 1:1 Metric Scale Top Speeds (m/s) calibrated to real-life circuit lap times (e.g., GTP ~2:00 at Spa, GT3 ~2:17, F1 ~1:44)
  const maxSpeedBase = (isF126
    ? 91.5 + (attrs.topSpeed - 90) * 0.32
    : isF121
    ? 92.8 + (attrs.topSpeed - 90) * 0.32
    : isF105
    ? 92.5 + (attrs.topSpeed - 92) * 0.32
    : isGTP
    ? 88.2 + (attrs.topSpeed - 86) * 0.22
    : isLMP2
    ? 83.8 + (attrs.topSpeed - 78) * 0.38
    : isGT3
    ? 75.8 + (attrs.topSpeed - 74) * 0.42
    : isGT4
    ? 69.5 + (attrs.topSpeed - 67) * 0.38
    : isFE
    ? 80.5 + (attrs.topSpeed - 77) * 0.48
    : isCoupe
    ? 66.5 + (attrs.topSpeed - 64) * 0.92
    : 88.5 + (attrs.topSpeed - 83) * 1.55) * topSpeedBopMult;

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
    ? 755_000 + (attrs.acceleration - 93) * 13_000
    : isF105
    ? 680_000 + (attrs.acceleration - 93) * 11_000
    : isGTP
    ? 445_000 + (attrs.acceleration - 85) * 6_500
    : isLMP2
    ? 398_000 + (attrs.acceleration - 80) * 6_000
    : isGT3
    ? 302_000 + (attrs.acceleration - 77) * 5_500
    : isGT4
    ? 258_000 + (attrs.acceleration - 70) * 5_000
    : isFE
    ? 340_000 + (attrs.acceleration - 90) * 7_000
    : isCoupe
    ? 235_000 + Math.max(0, attrs.acceleration - 64) * 10_000
    : 615_000 + (attrs.acceleration - 85) * 24_000;

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

  return {
    isGTP,
    isLMP2,
    isGT3,
    isGT4,
    isF126,
    isF121,
    isF105,
    isFE,
    isCoupe,
    isSupercar,
    isFormula,
    maxSpeedBase,
    massKg,
    powerWatts,
    launchGripG,
    downforceTractionCoeff,
    highSpeedPowerTaper,
  };
}

/**
 * Steps active on-track stationary pit service countdown and completion.
 */
function stepOnTrackPitServiceHold(car: CarSimState, dt: number): void {
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
      car.damage!.frontWing = Math.max(0, car.damage!.frontWing - 25);
      car.damage!.rearWing = Math.max(0, car.damage!.rearWing - 25);
      if (car.damage!.frontWing < 45) car.damage!.frontWingDetached = false;
      if (car.damage!.rearWing < 45) car.damage!.rearWingDetached = false;
    } else if (completedTask === 'fuel') {
      car.fuel = 100;
      car.fuelLapsRemaining = Math.max(12, car.fuelLapsRemaining);
    } else if (completedTask === 'repair') {
      car.aeroDamage = 0;
      car.damage = createInitialLocalizedDamage();
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
      car.pitStopRemaining = getPitServiceDuration(nextTask);
    } else {
      car.pitActiveTask = null;
      car.pitStopTotal = 0;
      car.pitStops += 1;
      car.pitCooldown = 3.0;
    }
  }
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
    isTimedFinish?: boolean;
    allCars: CarSimState[];
    bopEnabled?: boolean;
    localWetness?: number;
    puddleIntensity?: number;
    trackRubber?: number;
    trackTempC?: number;
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
    stepOnTrackPitServiceHold(car, dt);
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
  const { specialType, hasHybridErs } = updateCarSpecialActivation(
    car,
    input,
    dt,
    opts.drsZoneEnforced,
    false,
  );

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
  const cp = getClassPhysicalConstants(classId, attrs, bop.topSpeedMult);
  const {
    isGTP,
    isLMP2,
    isF126,
    isF121,
    isF105,
    isFE,
    isCoupe,
    isSupercar,
    isGT4,
    isFormula,
    maxSpeedBase,
    massKg,
    powerWatts,
    launchGripG,
    downforceTractionCoeff,
    highSpeedPowerTaper,
  } = cp;

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

  // Standalone Hybrid ERS Battery & Deployment Mode (STRICTLY GTP hybrids, F1 2026, F1 2021 only)
  const { specialSpeedMult, specialAccelMult, specialGripMult } = computeErsAndSpecialMultipliers(
    car,
    input,
    dt,
    setupMod,
    engineDmgFactor,
    specialType,
    hasHybridErs,
  );

  const slipstreamMult = 1.0 + 0.052 * slipstreamStrength;

  let penaltyCap = 1.0;
  if (car.penaltyTimeRemaining > 0) {
    if (input.throttle < 0.65 || input.brake > 0.1) {
      car.penaltyTimeRemaining = Math.max(0, car.penaltyTimeRemaining - dt * 2.0);
    } else {
      penaltyCap = 0.94;
      car.penaltyTimeRemaining = Math.max(0, car.penaltyTimeRemaining - dt * 0.9);
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

  // Pure full-push AI pace (rubberbanding removed)
  const effectiveAiPace = car.aiPaceMultiplier;
  // Speed ceiling (AI gains pace via cornering commitment/skill without artificial rubberbanding)
  const aiStraightScale = car.isPlayer
    ? 1.0
    : Math.max(0.88, Math.min(1.04, 1.0 + (effectiveAiPace - 1.0) * 0.35));
  const dragVmaxFactor = Math.pow(tuning.dragScale * setupMod.dragMult, -0.22);
  const effectiveMaxSpeed =
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

  // Longitudinal acceleration, braking & transmission drivetrain
  const throttle = Math.max(0, Math.min(1, input.throttle));
  const brake = Math.max(0, Math.min(1, input.brake));
  car.lastInputThrottle = throttle;
  car.lastInputBrake = brake;
  car.lastInputSteer = Math.max(-1, Math.min(1, input.steer));
  const isManual = car.transmissionMode === 'manual';
  const isSemiAuto = car.transmissionMode === 'semi-auto';
  const totalGears = car.carSpec.gears ?? classMeta.forwardGears ?? 6;
  if ((car.semiAutoHoldTimer ?? 0) > 0) {
    car.semiAutoHoldTimer = Math.max(0, (car.semiAutoHoldTimer ?? 0) - dt);
  }

  // Manual & Semi-Auto paddle shifting:
  if (isManual || isSemiAuto) {
    if (input.shiftUp) {
      if (car.gear === -1 && car.speed < 4.0) {
        car.gear = 1;
      } else if (car.gear > 0 && car.gear < totalGears) {
        car.gear += 1;
      }
      if (isSemiAuto) car.semiAutoHoldTimer = 2.6;
    } else if (input.shiftDown) {
      if (car.gear === 1 && car.speed < 3.0) {
        car.gear = -1;
      } else if (car.gear > 1) {
        car.gear -= 1;
      }
      if (isSemiAuto) car.semiAutoHoldTimer = 2.6;
    }
  }

  // Automatic & Semi-Auto reverse engagement & forward shift:
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

    car.tcIntervening = false;
    if (throttle > 0 && brake < 0.1) {
      // Engine torque/power delivery across RPM & high-speed taper
      const lowSpeedSpool = isFE ? 1.0 : 0.88 + 0.12 * Math.min(1, car.speed / 18.0);
      const powerCurveFactor = lowSpeedSpool * (1 - highSpeedPowerTaper * Math.pow(speedRatio, isFormula && !isFE ? 1.18 : 1.45));
      const mecachromeMult = car.mecachromeActive ? 0.08 : 1.0;
      const pWheelW =
        powerWatts * specialAccelMult * fuelFactor * throttle * powerCurveFactor * mecachromeMult;
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

      // Traction Control (TC 1-3):
      // - Disabled completely on cars that do not have TC IRL
      // - Monitors ONLY rear slide on RWD cars, front slip on FWD cars, or both on AWD cars
      // - Gentle progressive torque trim so TC 1 never bogs down corner exits
      let tcTorqueScale = 1.0;
      const tcEquipped = isCarTcEquipped(classId, car.carSpec.id);
      if (!tcEquipped) {
        car.tcLevel = 0;
        car.tcIntervening = false;
      }
      const tcLvl = tcEquipped ? (car.tcLevel ?? 0) : 0;
      if (tcLvl > 0 && car.speed > 3.5) {
        const drivetrain = getCarDrivetrain(car.carSpec.id, classId);
        const rearSlip = car.rearAxleSlip ?? 0;
        const frontSlip = car.frontAxleSlip ?? 0;
        const drivenAxleSlip =
          drivetrain === 'fwd'
            ? frontSlip
            : drivetrain === 'awd'
              ? Math.max(rearSlip, frontSlip) * 0.9
              : rearSlip;
        const slipThreshold = tcLvl === 3 ? 0.26 : tcLvl === 2 ? 0.36 : 0.48;
        const slipDemand = drivenAxleSlip + effectiveWetness * 0.10;
        if (slipDemand > slipThreshold) {
          const excess = Math.min(1, slipDemand - slipThreshold);
          const gain = tcLvl === 3 ? 0.40 : tcLvl === 2 ? 0.28 : 0.16;
          const minFloor = tcLvl === 3 ? 0.74 : tcLvl === 2 ? 0.82 : 0.89;
          tcTorqueScale = Math.max(minFloor, 1.0 - excess * gain);
          car.tcIntervening = tcTorqueScale < 0.985;
        }
      }

      const fDriveN = limiterTorqueCut === 0 ? 0 : Math.min(fPowerN * tcTorqueScale, fTractionN);
      const fNetN = fDriveN - fAeroDragN - fRollN;
      car.speed = Math.max(0, car.speed + (fNetN / effectiveMassKg) * dt);
    }

    // Brake disc thermal model: realistic thermal inertia (~3.5x slower transfer) with impactful cold bite & hot fade
    stepBrakeThermalAndLockup({
      car,
      brake,
      brakeBase,
      effectiveMassKg,
      setupMod,
      compoundGrip: compoundMod.grip,
      offTrackGrip,
      crestLoadFactor,
      trackTempC,
      effectiveWetness,
      isFormula,
      isProto: isGTP || isLMP2,
      fAeroDragN,
      fRollN,
      dt,
    });

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

      const holdManualGear = isManual || (isSemiAuto && (car.semiAutoHoldTimer ?? 0) > 0 && speedRatioGear < gearFracs[Math.max(0, Math.min(totalGears - 1, car.gear - 1))] * 1.01);
      if (holdManualGear) {
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
  // Tire thermal window + graining + flat-spot grip factor across 4 wheels (strong cold & overheat impact)
  const frontTireGrip = (computeWheelGripFactor(tState.fl, compoundMod.optimalTemp) + computeWheelGripFactor(tState.fr, compoundMod.optimalTemp)) * 0.5;
  const rearTireGrip = (computeWheelGripFactor(tState.rl, compoundMod.optimalTemp) + computeWheelGripFactor(tState.rr, compoundMod.optimalTemp)) * 0.5;
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

  car.stabilityIntervening = false;
  let understeerAccum = 0;
  let frontSlipAccum = 0;
  let rearSlipAccum = 0;
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

      // Speed-scaled yaw-rate damping + anti-pendulum counter-yaw catch + optional Stability Control assist
      const isCounterYaw = steerMag > 0.05 && rYaw * (steerInput * moveSign) < 0;
      const baseYawDamp = (1.0 + 1.4 * speedNorm) * (isCounterYaw ? 1.45 : 1.0);
      let stabDamp = 0;
      if (car.stabilityControl && car.speed > 8.0) {
        const slipAngleAbs = Math.abs(Math.atan2(vLat, Math.max(3, Math.abs(vFwd))));
        if (slipAngleAbs > 0.14 || (isCounterYaw && Math.abs(rYaw) > 0.55)) {
          stabDamp = 4.5 + Math.min(6.0, slipAngleAbs * 14.0);
          vLat *= Math.exp(-3.8 * subDt);
          car.stabilityIntervening = true;
        }
      }
      const yawDampRate = baseYawDamp + stabDamp + exitSettling * (10.0 + 12.0 * speedNorm);
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
      if (car.speed > 3.5) {
        const fSlipNorm = Math.max(0, (Math.abs(alphaF) - 0.08) * 3.6);
        const rSlipNorm = Math.max(0, (Math.abs(alphaR) - 0.07) * 4.2);
        frontSlipAccum = Math.max(frontSlipAccum, Math.min(1, fSlipNorm));
        rearSlipAccum = Math.max(rearSlipAccum, Math.min(1, rSlipNorm));
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

  car.frontAxleSlip = Math.min(
    1,
    Math.max(frontSlipAccum, car.understeerFactor * 0.85) * (car.speed > 3.5 ? 1 : 0),
  );
  car.rearAxleSlip = Math.min(
    1,
    Math.max(rearSlipAccum, (Math.abs(vLat) / 6.0) * (car.speed > 3.5 ? 1 : 0)),
  );
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
    if (car.warningCount >= 3) {
      // Cap slow-down penalties at 0.6s–1.5s max; repeated violations also accrue +3s post-race time penalty
      car.penaltyReason = 'corner-cut';
      car.penaltyType = car.warningCount >= 5 ? 'time-penalty' : 'slow-down';
      car.penaltyTimeRemaining = Math.min(1.5, Math.max(0.6, car.penaltyTimeRemaining + 0.8));
      if (car.warningCount >= 5) {
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
      } else if (opts.isTimedFinish) {
        car.totalTime = Math.max(0, car.totalTime - overshootSec);
        car.finished = true;
      } else if (opts.totalLaps > 0 && car.lap >= opts.totalLaps) {
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
  stepFourWheelTireDynamics({
    car,
    tState,
    steerInput,
    speedNorm,
    rYaw,
    brake,
    throttle,
    crestLoadFactor,
    isFE,
    trackTempC,
    efficiencyAttr: attrs.efficiency,
    compoundMod,
    setupMod,
    effectiveWetness,
    puddleIntensity,
    dt,
  });

  // Recalibrated fuel consumption: a full tank lasts ~12-16 laps at 1:1 scale (a 5km-7km lap burns ~6-8% of a tank)
  const efficiencyFactor = 1.25 - (attrs.efficiency / 100) * 0.55;
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
 * Computes AI control inputs using:
 * 1. Full track-relative (ds, dLat) 3-layer spatial avoidance (Forward Braking Cone, Dynamic Overtaking Lane, Side-by-Side Door Awareness)
 * 2. Kinematic stopping-distance curvature scan across [0, v^2/(2*a_brake) + 15m]
 * 3. Adaptive lookahead + damped PD steering + Off-Track Guardrail Override
 * 4. Safety Car / VSC single-file bunching, no-overtaking & wave-by support, plus on-track heavy penalty serving
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

  // Wet-weather racing line: in damp/rainy conditions, shift off the slick rubbered inside apex
  const effWet = Math.max(trackWetness, car.localWetness ?? 0);
  if (effWet > 0.25 && Math.abs(currentSample.curvature) > 0.008) {
    const wetBlend = Math.min(1, (effWet - 0.25) / 0.55);
    const wetApexShift = -Math.sign(currentSample.curvature) * halfW * 0.24 * wetBlend;
    dynamicRacingLine = dynamicRacingLine * (1 - 0.28 * wetBlend) + wetApexShift;
  }

  dynamicRacingLine = Math.max(minSafeLane, Math.min(maxSafeLane, dynamicRacingLine));
  let desiredOffset = dynamicRacingLine;

  // Layer 2: Proactive Overtaking Lane Selection when closing on slower car ahead within 60m
  const overtakeRef = leadCar ?? passTargetCar;
  const isBattlingTraffic = Boolean(
    overtakeRef &&
      (leadCar ? leadDs : passTargetDs) < Math.max(48, car.speed * 1.5) &&
      car.speed > overtakeRef.speed - 2.5,
  );

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

  // Section 4.1: Multi-Class Traffic Projection, Blue-Flag Etiquette & One-Move Defensive Racecraft
  const racecraftOverlay = computeRacecraftOverlay(
    car,
    compiledTrack,
    allCars,
    dt,
    halfW,
    minSafeLane,
    maxSafeLane,
  );

  if (racecraftOverlay.overrideTargetOffset !== null) {
    desiredOffset = racecraftOverlay.overrideTargetOffset;
    if (racecraftOverlay.maneuver === 'overtaking') {
      car.aiPassTimer = Math.max(car.aiPassTimer, 1.25);
    }
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
    const minCornerSpeed = absK > 0.10 ? 7.2 : 9.0;
    const curvScale = absK > 0.10 ? 9.8 : 11.2;
    const vSafe = Math.max(minCornerSpeed, Math.sqrt((sampleGrip * curvScale) / absK) * skillFactor);

    if (dMeters < 20) {
      immediateCornerSpeed = Math.min(immediateCornerSpeed, vSafe);
    }

    if (dMeters > 0 && car.speed > vSafe) {
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

    const canBumpDraftStraight =
      maxBrakeRatio < 0.30 &&
      Math.abs(currentSample.curvature) < 0.008 &&
      car.speed > 35 &&
      leadCar.speed > 30 &&
      closingSpeed < 6.5 &&
      leadCar.carSpec.classId === car.carSpec.classId;

    const immediateDanger =
      hasLateralOverlap &&
      (!pullingOutToPass || leadDs < 14.0) &&
      !racecraftOverlay.suppressStraightBraking;

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

  const targetLineOffset = targetSample.racingLineOffset !== undefined
    ? Math.max(minSafeLane, Math.min(maxSafeLane, targetSample.racingLineOffset))
    : steerTargetOffset;

  const isContested =
    isBattlingTraffic ||
    car.aiPassTimer > 0 ||
    sideCarLeftLat !== null ||
    sideCarRightLat !== null;
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

  const kp = 2.45;
  const kd = 0.14;
  let steer = -(headingErr * kp + errDeriv * kd);

  let throttle = Math.min(cornerThrottle, avoidThrottleCap);
  let brake = Math.max(cornerBrake, avoidBrake);

  // ==================== 6. OFF-TRACK GUARDRAIL OVERRIDE ====================
  if (Math.abs(car.lateralOffset) > halfW * 0.78) {
    const excessRatio = (Math.abs(car.lateralOffset) - halfW * 0.78) / Math.max(1, halfW * 0.22);
    throttle = Math.min(throttle, Math.max(0.50, 0.70 - Math.min(0.20, excessRatio * 0.15)));
    const inwardBias = Math.min(0.65, 0.25 + excessRatio * 0.45);
    steer += -Math.sign(car.lateralOffset) * inwardBias;
  }

  steer = Math.max(-1, Math.min(1, steer));

  if (personality === 'Tire-Saver' && car.tireWear > 45 && Math.abs(steer) > 0.55 && brake === 0) {
    throttle = Math.min(throttle, 0.84);
  }

  // Wet-weather corner-exit throttle modulation & slicks-in-rain caution
  const aiWet = Math.max(trackWetness, car.localWetness ?? 0);
  if (aiWet > 0.22) {
    const wetSkill = car.aiWetSkill ?? 1.0;
    const slickPenalty = car.compound !== 'wet' ? 1.0 + aiWet * 0.35 : 1.0;
    if (Math.abs(steer) > 0.26 && brake < 0.1) {
      const tractionCap = Math.max(0.58, 1.0 - aiWet * 0.24 * slickPenalty * (1.12 - (wetSkill - 0.9)));
      throttle = Math.min(throttle, tractionCap);
    }
    if ((car.puddleIntensity ?? 0) > 0.25 && car.speed > 26) {
      throttle = Math.min(throttle, 0.72);
    }
  }

  const resolvedSpecial = resolveCarSpecial(car.carSpec);
  const onStraight = nearCurv < 0.01 && Math.abs(steer) < 0.18 && maxBrakeRatio < 0.5;

  // Aggressive Hybrid ERS Mode management
  if (carHasHybridErs(car.carSpec)) {
    const batt = car.ersBattery ?? 0;
    const isBattling = Boolean(leadCar || car.aiDefenseCommitted || car.aiPassTimer > 0);
    const acceleratingHard = throttle > 0.65 && brake < 0.08 && car.speed > 18;
    if (batt < 10) {
      car.ersMode = 'harvest';
    } else if (brake > 0.25 && batt < 85) {
      car.ersMode = 'harvest';
    } else if (batt > 24 && (isBattling || (onStraight && car.speed > 26))) {
      car.ersMode = batt > 55 && (isBattling || onStraight) ? 'quali' : 'overtake';
    } else if (batt > 14 && acceleratingHard) {
      car.ersMode = 'overtake';
    } else {
      car.ersMode = 'balanced';
    }
  }

  // Trigger Class / Car Special aggressively on straights & corner exits
  let specialPressed = false;
  if (resolvedSpecial.specialType === 'drs') {
    if (car.drsEligible && onStraight && !car.specialActive && car.speed > 24) {
      specialPressed = true;
    } else if ((!onStraight || brake > 0.2) && car.specialActive) {
      specialPressed = true;
    }
  } else if (resolvedSpecial.specialType === 'active-aero') {
    if (onStraight && !car.specialActive && car.speed > 26) specialPressed = true;
    if ((!onStraight || brake > 0.2) && car.specialActive) specialPressed = true;
  } else if (resolvedSpecial.specialType === 'attack-mode') {
    if (onStraight && !car.specialActive && car.attackModeUsesRemaining > 0 && car.speed > 22) {
      specialPressed = true;
    }
  } else if (resolvedSpecial.specialType === 'ers-overtake' || resolvedSpecial.specialType === 'hybrid-deploy') {
    const batt = car.ersBattery ?? 0;
    const canDeploy = (onStraight || (throttle > 0.78 && Math.abs(steer) < 0.28)) && brake < 0.12 && car.speed > 18;
    if (canDeploy && !car.specialActive && batt > 16) {
      specialPressed = true;
    } else if ((!canDeploy || brake > 0.22 || batt < 8) && car.specialActive) {
      specialPressed = true;
    }
  } else if (resolvedSpecial.specialType !== 'none') {
    if (onStraight && !car.specialActive && car.specialCharge > 25 && car.speed > 22) {
      specialPressed = true;
    } else if ((!onStraight || brake > 0.25) && car.specialActive) {
      specialPressed = true;
    }
  }

  // Blue Flag Multi-Class Yielding
  if (racecraftOverlay.throttleMultiplier < 0.999) {
    throttle *= racecraftOverlay.throttleMultiplier;
  } else if (car.blueFlagActive && car.speed > 14 && Math.abs(car.lateralOffset) < halfW * 0.72) {
    const yieldSide = car.lateralOffset >= 0 ? Math.min(maxSafeLane, halfW * 0.68) : Math.max(minSafeLane, -halfW * 0.68);
    car.aiTargetOffset += (yieldSide - car.aiTargetOffset) * Math.min(1, dt * 3.5);
    throttle *= 0.90;
  }

  // AI Race Engineer pace orders & pending on-track service stop
  if (car.aiPendingStop) {
    // Pull smoothly toward right edge and brake to a stop to trigger on-track service (NO pit lane!)
    const pullSide = Math.min(maxSafeLane, halfW * 0.72);
    car.aiTargetOffset += (pullSide - car.aiTargetOffset) * Math.min(1, dt * 4.0);
    throttle = 0;
    brake = car.speed > 1.2 ? 0.85 : 1.0;
    if (car.speed < 1.4) {
      const ok = requestOnTrackPitStop(car, car.aiPendingStop.action, car.aiPendingStop.compound);
      if (ok) car.aiPendingStop = null;
    }
  } else if (car.aiPaceOrder && car.aiPaceOrder !== 'balanced') {
    const mod = getAiPaceOrderModifiers(car.aiPaceOrder);
    if (mod.paceMultiplier < 1) {
      throttle *= mod.paceMultiplier;
    } else if (throttle > 0.6) {
      throttle = Math.min(1, throttle * mod.paceMultiplier);
    }
  }

  return { throttle, brake, steer, specialPressed, specialJustPressed: specialPressed };
}
