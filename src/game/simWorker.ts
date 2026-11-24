import { computeNeuralAIControl } from './aiNeuralPolicy';
import { normalizeCarSetup } from './carSetup';
import {
  CarSimState,
  computeRollingFormationControl,
  createCarSimState,
  requestOnTrackPitStop,
  resolveCarCollisions,
  stepCarPhysics,
} from './physics';
import {
  computeTrackSpecialZones,
  createRaceControlState,
  createWeatherSystemState,
  RaceControlState,
  sampleLocalTrackSurfaceWeather,
  stepRaceControl,
  stepWeatherSystem,
  TrackSpecialZones,
  WeatherSystemState,
} from './raceSystems';
import { compileTrack, CompiledTrack } from './tracks';
import {
  AbsLevel,
  AIDifficulty,
  AiPaceOrder,
  AIPersonality,
  CarSetupConfig,
  DamageLevel,
  ErsMode,
  LiveryConfig,
  PenaltyReason,
  PenaltyType,
  PitServiceAction,
  PitStrategy,
  RaceFlagState,
  RaceStartType,
  SafetyCarPhase,
  SectorFlag,
  TcLevel,
  TireCompound,
  TrackSpec,
  TrackSurfaceType,
  WeatherForecastSegment,
  WeatherMode,
  WeatherPresetId,
} from './types';

export const SIM_WORKER_STRIDE = 24;

export const SIM_FLAG_FINISHED = 1 << 0;
export const SIM_FLAG_SPECIAL_ACTIVE = 1 << 1;
export const SIM_FLAG_ON_KERB = 1 << 2;
export const SIM_FLAG_IN_SLIPSTREAM = 1 << 3;
export const SIM_FLAG_DRS_ELIGIBLE = 1 << 4;
export const SIM_FLAG_IN_DRS_ZONE = 1 << 5;
export const SIM_FLAG_IN_ATTACK_ZONE = 1 << 6;
export const SIM_FLAG_BLUE_FLAG = 1 << 7;
export const SIM_FLAG_ELIMINATED = 1 << 8;
export const SIM_FLAG_REV_LIMITER = 1 << 9;
export const SIM_FLAG_TC_INTERVENING = 1 << 10;
export const SIM_FLAG_STAB_INTERVENING = 1 << 11;

export interface SimWorkerCarInit {
  id: string;
  name: string;
  isPlayer: boolean;
  isHumanPeer?: boolean;
  carId: string;
  livery: LiveryConfig;
  gridSlot: number;
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
  initialStatePatch?: Partial<
    Pick<
      CarSimState,
      | 'x'
      | 'y'
      | 'z'
      | 'heading'
      | 'speed'
      | 'trackT'
      | 'prevTrackT'
      | 'lap'
      | 'totalDistance'
      | 'fuel'
      | 'fuelLapsRemaining'
      | 'spawnGhostTimer'
      | 'lateralOffset'
    >
  >;
}

export interface SimWorkerPlayerInput {
  throttle: number;
  brake: number;
  steer: number;
  specialPressed: boolean;
  specialJustPressed: boolean;
  shiftUp: boolean;
  shiftDown: boolean;
}

export interface SimWorkerCarCommand {
  carId: string;
  pitAction?: { action: PitServiceAction; compound?: TireCompound };
  pitStrategy?: PitStrategy;
  ersMode?: ErsMode;
  tcLevel?: TcLevel;
  brakeBalance?: number;
  aiPaceOrder?: AiPaceOrder;
  aiPendingStop?: { action: PitServiceAction; compound?: TireCompound } | null;
  transmissionMode?: 'auto' | 'semi-auto' | 'manual';
  stabilityControl?: boolean;
}

export interface SimWorkerCarTelemetry {
  id: string;
  tireWear: number;
  tireTemp: number;
  fuel: number;
  fuelLapsRemaining: number;
  aeroDamage: number;
  specialCharge: number;
  ersBattery: number;
  ersMode: ErsMode;
  tcLevel: TcLevel;
  transmissionMode: 'auto' | 'semi-auto' | 'manual';
  attackModeUsesRemaining: number;
  attackModeTimer: number;
  warningCount: number;
  penaltyTimeRemaining: number;
  postRacePenaltySeconds: number;
  penaltyReason: PenaltyReason | null;
  penaltyType: PenaltyType | null;
  heavyPenaltyHoldProgress: number;
  heavyPenaltyIssuedLap: number | null;
  heavyPenaltyDeadlineLap: number | null;
  neutralizationSpeedCapMs: number | null;
  safetyCarQueueTargetSpeedMs: number | null;
  safetyCarBunchingGapM: number | null;
  surfaceType: TrackSurfaceType;
  crestLoadFactor: number;
  dirtyAirStrength: number;
  brakeTempFront: number;
  brakeTempRear: number;
  brakeFade: number;
  bestLapTime: number | null;
  lastLapTime: number | null;
  totalTime: number;
  pitStopRemaining: number;
  pitStopTotal: number;
  pitActiveTask: PitServiceAction | null;
  pitQueue: PitServiceAction[];
  pitStops: number;
  compound: TireCompound;
  currentSector: 1 | 2 | 3;
  sectorTimes: [number | null, number | null, number | null];
  bestSectorTimes: [number | null, number | null, number | null];
  lastLapSectorTimes: [number | null, number | null, number | null];
  debrisBurstIntensity: number;
  disqualified: boolean;
  lastInputThrottle: number;
  lastInputBrake: number;
  lastInputSteer: number;
  brakeBalance: number;
  aiPaceOrder: AiPaceOrder;
}

export interface SimWorkerRaceControlSummary {
  globalFlag: RaceFlagState;
  sectorFlags: [SectorFlag, SectorFlag, SectorFlag];
  message: string | null;
  safetyCarActive: boolean;
  safetyCarPhase: SafetyCarPhase;
  safetyCarTrackT: number;
  safetyCarLateralOffset: number;
  safetyCarSpeedMs: number;
  neutralizationSpeedCapMs: number | null;
  trackWetness: number;
  rainIntensity: number;
  trackRubber: number;
  ambientTempC: number;
  trackTempC: number;
  racingLineWetness: number;
  offLineWetness: number;
}

export type SimWorkerInboundMsg =
  | {
      type: 'init';
      sessionNonce: number;
      trackSpec: TrackSpec;
      cars: SimWorkerCarInit[];
      weatherMode: WeatherMode;
      weatherPreset?: WeatherPresetId;
      weatherTimeline?: WeatherForecastSegment[];
      totalLaps: number;
      effectiveTotalLaps: number;
      isTitle: boolean;
      isRealRace: boolean;
      isQualifying: boolean;
      isPractice: boolean;
      damageLevel: DamageLevel;
      absLevel: AbsLevel;
      aiDifficulty: AIDifficulty;
      activeStartType: RaceStartType;
      rollingFormationSpeed: number;
      rollingFormationLanes: Array<[string, number]>;
    }
  | {
      type: 'step';
      sessionNonce: number;
      seq: number;
      dt: number;
      raceElapsed: number;
      countdown: number;
      isTimedFinish: boolean;
      aiDifficulty: AIDifficulty;
      playerInput: SimWorkerPlayerInput;
      commands?: SimWorkerCarCommand[];
      peerStates?: Array<{
        id: string;
        x: number;
        y: number;
        z: number;
        heading: number;
        speed: number;
        steerAngle: number;
        lap: number;
        trackT: number;
        totalDistance: number;
        specialActive: boolean;
        isGhosted?: boolean;
      }>;
    }
  | {
      type: 'syncCars';
      sessionNonce: number;
      snapshots: Array<{
        id: string;
        x: number;
        y: number;
        z: number;
        vx: number;
        vz: number;
        heading: number;
        speed: number;
        trackT: number;
        lap: number;
        totalDistance: number;
        currentLapTime: number;
        fuel: number;
        tireWear: number;
      }>;
    };

export type SimWorkerOutboundMsg =
  | { type: 'ready'; sessionNonce: number }
  | {
      type: 'stepped';
      sessionNonce: number;
      seq: number;
      buffer: Float32Array;
      telemetry: SimWorkerCarTelemetry[];
      raceControl: SimWorkerRaceControlSummary;
    };

export function resolveCustomWaypointSurface(
  compiledTrack: CompiledTrack,
  trackT: number,
  lateralOffset: number,
  fallbackSurface: TrackSurfaceType,
): TrackSurfaceType {
  const wps = compiledTrack.spec.waypoints;
  if (!wps || wps.length === 0) return fallbackSurface;
  const wrappedT = ((trackT % 1) + 1) % 1;
  const wpIdx = Math.floor(wrappedT * wps.length) % wps.length;
  const wp = wps[wpIdx];
  if (!wp) return fallbackSurface;
  const halfW = (wp.width ?? compiledTrack.spec.trackWidth) * 0.5;
  // Only override once the car leaves the primary asphalt ribbon
  if (Math.abs(lateralOffset) <= halfW + 0.35) {
    return fallbackSurface;
  }
  const painted =
    lateralOffset < 0
      ? wp.surfaceLeft ?? wp.runoff
      : wp.surfaceRight ?? wp.runoff;
  if (!painted) return fallbackSurface;
  return painted as TrackSurfaceType;
}

export function packCarsToFloat32(cars: CarSimState[], out?: Float32Array): Float32Array {
  const needed = cars.length * SIM_WORKER_STRIDE;
  const buf = out && out.length === needed ? out : new Float32Array(needed);
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    const base = i * SIM_WORKER_STRIDE;
    buf[base + 0] = c.x;
    buf[base + 1] = c.y;
    buf[base + 2] = c.z;
    buf[base + 3] = c.vx;
    buf[base + 4] = c.vz;
    buf[base + 5] = c.heading;
    buf[base + 6] = c.speed;
    buf[base + 7] = c.steerAngle;
    buf[base + 8] = c.pitch ?? 0;
    buf[base + 9] = c.roll ?? 0;
    buf[base + 10] = c.trackT;
    buf[base + 11] = c.lateralOffset;
    buf[base + 12] = c.totalDistance;
    buf[base + 13] = c.lap;
    buf[base + 14] = c.gear;
    buf[base + 15] = c.rpmNormalized;
    buf[base + 16] = c.suspensionHeave ?? 0;
    buf[base + 17] = c.sausageKerbHop ?? 0;
    buf[base + 18] = c.lateralSlip;
    buf[base + 19] = c.brakeLockupIntensity ?? 0;
    buf[base + 20] = c.lastCollisionImpact ?? 0;
    buf[base + 21] = c.lastWallImpact ?? 0;
    let flags = 0;
    if (c.finished) flags |= SIM_FLAG_FINISHED;
    if (c.specialActive) flags |= SIM_FLAG_SPECIAL_ACTIVE;
    if (c.onKerb) flags |= SIM_FLAG_ON_KERB;
    if (c.inSlipstream) flags |= SIM_FLAG_IN_SLIPSTREAM;
    if (c.drsEligible) flags |= SIM_FLAG_DRS_ELIGIBLE;
    if (c.inDrsZone) flags |= SIM_FLAG_IN_DRS_ZONE;
    if (c.inAttackModeZone) flags |= SIM_FLAG_IN_ATTACK_ZONE;
    if (c.blueFlagActive) flags |= SIM_FLAG_BLUE_FLAG;
    if (c.eliminated) flags |= SIM_FLAG_ELIMINATED;
    if (c.revLimiterActive) flags |= SIM_FLAG_REV_LIMITER;
    if (c.tcIntervening) flags |= SIM_FLAG_TC_INTERVENING;
    if (c.stabilityIntervening) flags |= SIM_FLAG_STAB_INTERVENING;
    buf[base + 22] = flags;
    buf[base + 23] = c.currentLapTime;
  }
  return buf;
}

export function unpackFloat32ToCars(buf: Float32Array, cars: CarSimState[]): void {
  const count = Math.min(cars.length, Math.floor(buf.length / SIM_WORKER_STRIDE));
  for (let i = 0; i < count; i++) {
    const c = cars[i];
    const base = i * SIM_WORKER_STRIDE;
    c.x = buf[base + 0];
    c.y = buf[base + 1];
    c.z = buf[base + 2];
    c.vx = buf[base + 3];
    c.vz = buf[base + 4];
    c.heading = buf[base + 5];
    c.speed = buf[base + 6];
    c.steerAngle = buf[base + 7];
    c.pitch = buf[base + 8];
    c.roll = buf[base + 9];
    c.prevTrackT = c.trackT;
    c.trackT = buf[base + 10];
    c.lateralOffset = buf[base + 11];
    c.totalDistance = buf[base + 12];
    c.lap = buf[base + 13];
    c.gear = buf[base + 14];
    c.rpmNormalized = buf[base + 15];
    c.suspensionHeave = buf[base + 16];
    c.sausageKerbHop = buf[base + 17];
    c.lateralSlip = buf[base + 18];
    c.brakeLockupIntensity = buf[base + 19];
    c.lastCollisionImpact = buf[base + 20];
    c.lastWallImpact = buf[base + 21];
    const flags = buf[base + 22] | 0;
    c.finished = (flags & SIM_FLAG_FINISHED) !== 0;
    c.specialActive = (flags & SIM_FLAG_SPECIAL_ACTIVE) !== 0;
    c.onKerb = (flags & SIM_FLAG_ON_KERB) !== 0;
    c.inSlipstream = (flags & SIM_FLAG_IN_SLIPSTREAM) !== 0;
    c.drsEligible = (flags & SIM_FLAG_DRS_ELIGIBLE) !== 0;
    c.inDrsZone = (flags & SIM_FLAG_IN_DRS_ZONE) !== 0;
    c.inAttackModeZone = (flags & SIM_FLAG_IN_ATTACK_ZONE) !== 0;
    c.blueFlagActive = (flags & SIM_FLAG_BLUE_FLAG) !== 0;
    c.eliminated = (flags & SIM_FLAG_ELIMINATED) !== 0;
    c.revLimiterActive = (flags & SIM_FLAG_REV_LIMITER) !== 0;
    c.tcIntervening = (flags & SIM_FLAG_TC_INTERVENING) !== 0;
    c.stabilityIntervening = (flags & SIM_FLAG_STAB_INTERVENING) !== 0;
    c.currentLapTime = buf[base + 23];
  }
}

interface WorkerRuntime {
  sessionNonce: number;
  compiledTrack: CompiledTrack;
  cars: CarSimState[];
  weatherSystem: WeatherSystemState;
  raceControl: RaceControlState;
  specialZones: TrackSpecialZones;
  totalLaps: number;
  effectiveTotalLaps: number;
  isTitle: boolean;
  isRealRace: boolean;
  isQualifying: boolean;
  isPractice: boolean;
  damageLevel: DamageLevel;
  absLevel: AbsLevel;
  activeStartType: RaceStartType;
  rollingFormationSpeed: number;
  rollingFormationLanes: Map<string, number>;
}

function buildTelemetryForCar(c: CarSimState): SimWorkerCarTelemetry {
  return {
    id: c.id,
    tireWear: c.tireWear,
    tireTemp: c.tireTemp,
    fuel: c.fuel,
    fuelLapsRemaining: c.fuelLapsRemaining,
    aeroDamage: c.aeroDamage,
    specialCharge: c.specialCharge,
    ersBattery: c.ersBattery,
    ersMode: c.ersMode ?? 'balanced',
    tcLevel: c.tcLevel ?? 0,
    transmissionMode: c.transmissionMode ?? 'auto',
    attackModeUsesRemaining: c.attackModeUsesRemaining,
    attackModeTimer: c.attackModeTimer,
    warningCount: c.warningCount,
    penaltyTimeRemaining: c.penaltyTimeRemaining,
    postRacePenaltySeconds: c.postRacePenaltySeconds ?? 0,
    penaltyReason: c.penaltyReason ?? null,
    penaltyType: c.penaltyType ?? null,
    heavyPenaltyHoldProgress: c.heavyPenaltyHoldProgress ?? 0,
    heavyPenaltyIssuedLap: c.heavyPenaltyIssuedLap ?? null,
    heavyPenaltyDeadlineLap: c.heavyPenaltyDeadlineLap ?? null,
    neutralizationSpeedCapMs: c.neutralizationSpeedCapMs ?? null,
    safetyCarQueueTargetSpeedMs: c.safetyCarQueueTargetSpeedMs ?? null,
    safetyCarBunchingGapM: c.safetyCarBunchingGapM ?? null,
    surfaceType: c.surfaceType ?? 'asphalt',
    crestLoadFactor: c.crestLoadFactor ?? 1,
    dirtyAirStrength: c.dirtyAirStrength ?? 0,
    brakeTempFront: c.brakeTempFront ?? 240,
    brakeTempRear: c.brakeTempRear ?? 220,
    brakeFade: c.brakeFade ?? 0,
    bestLapTime: c.bestLapTime,
    lastLapTime: c.lastLapTime,
    totalTime: c.totalTime,
    pitStopRemaining: c.pitStopRemaining,
    pitStopTotal: c.pitStopTotal,
    pitActiveTask: c.pitActiveTask,
    pitQueue: [...c.pitQueue],
    pitStops: c.pitStops,
    compound: c.compound,
    currentSector: c.currentSector ?? 1,
    sectorTimes: c.sectorTimes ? [...c.sectorTimes] : [null, null, null],
    bestSectorTimes: c.bestSectorTimes ? [...c.bestSectorTimes] : [null, null, null],
    lastLapSectorTimes: c.lastLapSectorTimes ? [...c.lastLapSectorTimes] : [null, null, null],
    debrisBurstIntensity: c.debrisBurstIntensity ?? 0,
    disqualified: Boolean(c.disqualified),
    lastInputThrottle: c.lastInputThrottle ?? 0,
    lastInputBrake: c.lastInputBrake ?? 0,
    lastInputSteer: c.lastInputSteer ?? 0,
    brakeBalance: c.setup?.brakeBalance ?? 56,
    aiPaceOrder: c.aiPaceOrder ?? 'balanced',
  };
}

function isDedicatedWorkerEnv(): boolean {
  try {
    return (
      typeof self !== 'undefined' &&
      typeof (self as unknown as { document?: unknown }).document === 'undefined' &&
      typeof (self as unknown as { postMessage?: unknown }).postMessage === 'function' &&
      typeof (self as unknown as { importScripts?: unknown }).importScripts !== 'undefined'
    );
  } catch {
    return false;
  }
}

if (isDedicatedWorkerEnv()) {
  let rt: WorkerRuntime | null = null;
  const workerSelf = self as unknown as {
    onmessage: ((e: MessageEvent<SimWorkerInboundMsg>) => void) | null;
    postMessage: (msg: SimWorkerOutboundMsg, transfer?: Transferable[]) => void;
  };

  workerSelf.onmessage = (ev: MessageEvent<SimWorkerInboundMsg>) => {
    const msg = ev.data;
    if (!msg) return;

    if (msg.type === 'init') {
      const compiledTrack = compileTrack(msg.trackSpec);
      const cars: CarSimState[] = msg.cars.map((spec) => {
        const car = createCarSimState({
          ...spec,
          compiledTrack,
        });
        if (spec.initialStatePatch) {
          Object.assign(car, spec.initialStatePatch);
        }
        return car;
      });
      rt = {
        sessionNonce: msg.sessionNonce,
        compiledTrack,
        cars,
        weatherSystem: createWeatherSystemState({
          weatherMode: msg.weatherMode,
          weatherPreset: msg.weatherPreset,
          customTimeline: msg.weatherTimeline,
          compiledTrack,
          totalLaps: msg.totalLaps,
        }),
        raceControl: createRaceControlState(),
        specialZones: computeTrackSpecialZones(compiledTrack),
        totalLaps: msg.totalLaps,
        effectiveTotalLaps: msg.effectiveTotalLaps,
        isTitle: msg.isTitle,
        isRealRace: msg.isRealRace,
        isQualifying: msg.isQualifying,
        isPractice: msg.isPractice,
        damageLevel: msg.damageLevel,
        absLevel: msg.absLevel,
        activeStartType: msg.activeStartType,
        rollingFormationSpeed: msg.rollingFormationSpeed,
        rollingFormationLanes: new Map(msg.rollingFormationLanes),
      };
      workerSelf.postMessage({ type: 'ready', sessionNonce: msg.sessionNonce });
      return;
    }

    if (!rt || msg.sessionNonce !== rt.sessionNonce) return;

    if (msg.type === 'syncCars') {
      for (const snap of msg.snapshots) {
        const target = rt.cars.find((c) => c.id === snap.id);
        if (!target) continue;
        target.x = snap.x;
        target.y = snap.y;
        target.z = snap.z;
        target.vx = snap.vx;
        target.vz = snap.vz;
        target.heading = snap.heading;
        target.speed = snap.speed;
        target.trackT = snap.trackT;
        target.lap = snap.lap;
        target.totalDistance = snap.totalDistance;
        target.currentLapTime = snap.currentLapTime;
        target.fuel = snap.fuel;
        target.tireWear = snap.tireWear;
      }
      return;
    }

    if (msg.type === 'step') {
      const { dt, raceElapsed, countdown, playerInput, aiDifficulty, isTimedFinish } = msg;

      if (msg.commands) {
        for (const cmd of msg.commands) {
          const target = rt.cars.find((c) => c.id === cmd.carId);
          if (!target) continue;
          if (cmd.pitAction) requestOnTrackPitStop(target, cmd.pitAction.action, cmd.pitAction.compound);
          if (cmd.pitStrategy) target.pitStrategy = cmd.pitStrategy;
          if (cmd.ersMode) target.ersMode = cmd.ersMode;
          if (cmd.tcLevel !== undefined) target.tcLevel = cmd.tcLevel;
          if (cmd.brakeBalance !== undefined && target.setup) {
            target.setup = normalizeCarSetup({ ...target.setup, brakeBalance: cmd.brakeBalance });
          }
          if (cmd.aiPaceOrder) target.aiPaceOrder = cmd.aiPaceOrder;
          if (cmd.aiPendingStop !== undefined) target.aiPendingStop = cmd.aiPendingStop;
          if (cmd.transmissionMode) target.transmissionMode = cmd.transmissionMode;
          if (cmd.stabilityControl !== undefined) target.stabilityControl = cmd.stabilityControl;
        }
      }

      if (msg.peerStates) {
        for (const ps of msg.peerStates) {
          const peer = rt.cars.find((c) => c.id === ps.id);
          if (!peer) continue;
          peer.x = ps.x;
          peer.y = ps.y;
          peer.z = ps.z;
          peer.heading = ps.heading;
          peer.speed = ps.speed;
          peer.steerAngle = ps.steerAngle;
          peer.lap = ps.lap;
          peer.trackT = ps.trackT;
          peer.totalDistance = ps.totalDistance;
          peer.specialActive = ps.specialActive;
          if (ps.isGhosted) peer.spawnGhostTimer = Math.max(peer.spawnGhostTimer ?? 0, 0.25);
        }
      }

      const roadHalfW = rt.compiledTrack.spec.trackWidth * 0.5;
      if (rt.isTitle) {
        for (let i = 0; i < rt.cars.length; i++) {
          const c = rt.cars[i];
          const aiIn = computeNeuralAIControl(c, rt.compiledTrack, rt.cars, dt, 0, 'Alien');
          stepCarPhysics(c, aiIn, rt.compiledTrack, dt, {
            trackWetness: 0,
            totalLaps: 99,
            isQualifying: false,
            allCars: rt.cars,
          });
          c.surfaceType = resolveCustomWaypointSurface(
            rt.compiledTrack,
            c.trackT,
            c.lateralOffset,
            c.surfaceType ?? 'asphalt',
          );
        }
        resolveCarCollisions(rt.cars);
      } else {
        let leaderDist = 0;
        for (let i = 0; i < rt.cars.length; i++) {
          if (rt.cars[i].totalDistance > leaderDist) leaderDist = rt.cars[i].totalDistance;
        }
        const raceProgress =
          !rt.isQualifying && !rt.isPractice && rt.totalLaps > 0
            ? Math.max(0, Math.min(1, leaderDist / Math.max(1, rt.totalLaps)))
            : undefined;
        stepWeatherSystem(
          rt.weatherSystem,
          dt,
          rt.compiledTrack.spec.scenery,
          rt.cars.length,
          raceProgress,
        );

        if (countdown <= 0) {
          stepRaceControl(rt.raceControl, rt.cars, rt.compiledTrack, rt.specialZones, dt, {
            totalLaps: rt.effectiveTotalLaps > 0 ? rt.effectiveTotalLaps : 99,
            isRace: rt.isRealRace,
          });
          if (isTimedFinish) rt.raceControl.globalFlag = 'white';

          const startCtx =
            !rt.isQualifying && !rt.isPractice
              ? { raceElapsed, startType: rt.activeStartType }
              : undefined;

          for (let i = 0; i < rt.cars.length; i++) {
            const c = rt.cars[i];
            if (c.isHumanPeer) continue;
            const localW = sampleLocalTrackSurfaceWeather(
              rt.weatherSystem,
              c.trackT,
              c.lateralOffset,
              roadHalfW,
            );
            if (c.isPlayer) {
              stepCarPhysics(c, playerInput, rt.compiledTrack, dt, {
                trackWetness: rt.weatherSystem.trackWetness,
                localWetness: localW.localWetness,
                puddleIntensity: localW.puddleIntensity,
                trackRubber: rt.weatherSystem.trackRubber,
                trackTempC: localW.trackTempC,
                drsZoneEnforced: rt.isRealRace,
                damageLevel: rt.damageLevel,
                absLevel: rt.absLevel,
                totalLaps: rt.effectiveTotalLaps,
                isQualifying: rt.isQualifying,
                isPractice: rt.isPractice,
                isTimedFinish,
                allCars: rt.cars,
              });
            } else {
              c.localWetness = localW.localWetness;
              c.puddleIntensity = localW.puddleIntensity;
              const aiIn = computeNeuralAIControl(
                c,
                rt.compiledTrack,
                rt.cars,
                dt,
                localW.localWetness,
                aiDifficulty,
                startCtx,
              );
              stepCarPhysics(c, aiIn, rt.compiledTrack, dt, {
                trackWetness: rt.weatherSystem.trackWetness,
                localWetness: localW.localWetness,
                puddleIntensity: localW.puddleIntensity,
                trackRubber: rt.weatherSystem.trackRubber,
                trackTempC: localW.trackTempC,
                drsZoneEnforced: rt.isRealRace,
                damageLevel: rt.damageLevel,
                absLevel: 'low',
                totalLaps: rt.effectiveTotalLaps,
                isQualifying: rt.isQualifying,
                isPractice: rt.isPractice,
                isTimedFinish,
                allCars: rt.cars,
              });
            }
            c.surfaceType = resolveCustomWaypointSurface(
              rt.compiledTrack,
              c.trackT,
              c.lateralOffset,
              c.surfaceType ?? 'asphalt',
            );
          }
          resolveCarCollisions(rt.cars);
        } else if (rt.activeStartType === 'rolling') {
          for (let i = 0; i < rt.cars.length; i++) {
            const c = rt.cars[i];
            if (c.isHumanPeer) continue;
            const laneLat = rt.rollingFormationLanes.get(c.id);
            const formCtrl = computeRollingFormationControl(
              c,
              rt.compiledTrack,
              rt.cars,
              rt.rollingFormationSpeed,
              laneLat,
            );
            const applied = c.isPlayer
              ? {
                  steer: Math.max(-1, Math.min(1, formCtrl.steer * 0.78 + playerInput.steer * 0.22)),
                  throttle: formCtrl.throttle,
                  brake: formCtrl.brake,
                  specialPressed: false,
                }
              : formCtrl;
            stepCarPhysics(c, applied, rt.compiledTrack, dt, {
              trackWetness: rt.weatherSystem.trackWetness,
              totalLaps: rt.totalLaps,
              isQualifying: rt.isQualifying,
              isPractice: rt.isPractice,
              allCars: rt.cars,
            });
          }
        }
      }

      const buffer = packCarsToFloat32(rt.cars);
      const telemetry = rt.cars.map(buildTelemetryForCar);
      const rcSummary: SimWorkerRaceControlSummary = {
        globalFlag: rt.raceControl.globalFlag,
        sectorFlags: [...rt.raceControl.sectorFlags] as [SectorFlag, SectorFlag, SectorFlag],
        message: rt.raceControl.message,
        safetyCarActive: rt.raceControl.safetyCar.active,
        safetyCarPhase: rt.raceControl.safetyCar.phase,
        safetyCarTrackT: rt.raceControl.safetyCar.trackT,
        safetyCarLateralOffset: rt.raceControl.safetyCar.lateralOffset,
        safetyCarSpeedMs: rt.raceControl.safetyCar.speedMs,
        neutralizationSpeedCapMs: rt.raceControl.neutralizationSpeedCapMs,
        trackWetness: rt.weatherSystem.trackWetness,
        rainIntensity: rt.weatherSystem.rainIntensity,
        trackRubber: rt.weatherSystem.trackRubber,
        ambientTempC: rt.weatherSystem.ambientTempC,
        trackTempC: rt.weatherSystem.trackTempC,
        racingLineWetness: rt.weatherSystem.racingLineWetness,
        offLineWetness: rt.weatherSystem.offLineWetness,
      };
      workerSelf.postMessage(
        {
          type: 'stepped',
          sessionNonce: rt.sessionNonce,
          seq: msg.seq,
          buffer,
          telemetry,
          raceControl: rcSummary,
        },
        [buffer.buffer],
      );
    }
  };
}
