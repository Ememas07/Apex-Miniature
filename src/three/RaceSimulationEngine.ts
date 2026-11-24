import { assignAiRosterGrid, evaluateAiRaceStrategy } from '../game/aiRacecraft';
import { computeNeuralAIControl } from '../game/aiNeuralPolicy';
import { CAR_CLASSES, carHasHybridErs, CARS, getCarById } from '../game/cars';
import { DEFAULT_CAR_SETUP, getDefaultTrackClassSetup, normalizeCarSetup } from '../game/carSetup';
import { MultiplayerClient } from '../game/multiplayer';
import {
  CarSimState,
  computeRollingFormationControl,
  computeStandings,
  computeUpcomingCornerInfo,
  createCarSimState,
  getClassFuelCapacityLiters,
  getRollingFormationSpeedMs,
  requestOnTrackPitStop,
  resolveCarCollisions,
  resolveClassDefaultTc,
  SPEED_KMH_FACTOR,
  stepCarPhysics,
  tryStepMecachromeEvent,
} from '../game/physics';
import { RaceEngineerRadio } from '../game/raceRadio';
import {
  computeTrackSpecialZones,
  createRaceControlState,
  createWeatherSystemState,
  cycleErsMode,
  DRIVE_THROUGH_HOLD_SECONDS,
  evaluateOnTrackPenaltyServe,
  evaluateStandingStartLaunch,
  isCarInYellowMicrosector,
  LAUNCH_RPM_SWEET_SPOT,
  RaceControlState,
  sampleLocalTrackSurfaceWeather,
  stepRaceControl,
  stepWeatherSystem,
  STOP_AND_GO_HOLD_SECONDS,
  TrackSpecialZones,
  WeatherSystemState,
} from '../game/raceSystems';
import {
  computeLiveDeltaSeconds,
  generatePhysicsTargetGhostLap,
  GhostSample,
  loadGhostLap,
  recordDailyChallengeLap,
  resolveGhostTargetLapTime,
  sampleRecordedGhostAtTime,
  sampleTargetGhostAtTime,
  saveGhostLap,
  savePersonalRecordLap,
  StoredGhostLap,
} from '../game/records';
import { RaceReplayRecorder } from '../game/replay';
import {
  createEliminationState,
  EliminationState,
  getScenarioById,
  stepEliminationState,
} from '../game/scenarios';
import { GameSettings } from '../game/settings';
import {
  resolveCustomWaypointSurface,
  SimWorkerCarCommand,
  SimWorkerCarInit,
  SimWorkerInboundMsg,
  SimWorkerOutboundMsg,
  unpackFloat32ToCars,
} from '../game/simWorker';
import { telemetryRecorder } from '../game/telemetryRecorder';
import { CompiledTrack, compileTrack, getTrackById, sampleTrackAtT } from '../game/tracks';
import {
  AiPaceOrder,
  BlindSpotStatus,
  CameraMode,
  CarClassId,
  ErsMode,
  GamePhase,
  HudSnapshot,
  PitServiceAction,
  PitStrategy,
  ProximityCarIndicator,
  RaceConfig,
  RaceRadioMessage,
  RaceStartType,
  RoomPeer,
  SpectatorCameraMode,
  TcLevel,
  TireCompound,
  TrackSurfaceType,
} from '../game/types';

export const ATTRACT_SCENARIOS: Array<{ trackId: string; classes: CarClassId[] }> = [
  { trackId: 'suzuka', classes: [CarClassId.F1_2026] },
  { trackId: 'le-mans', classes: [CarClassId.HYPERCAR_GTP, CarClassId.LMP2, CarClassId.GT3] },
  { trackId: 'laguna-seca', classes: [CarClassId.GT3, CarClassId.GT4, CarClassId.TRACK_COUPE] },
  { trackId: 'monaco', classes: [CarClassId.FORMULA_E, CarClassId.F1_2021] },
  { trackId: 'las-vegas', classes: [CarClassId.SUPERCAR, CarClassId.GT3] },
  { trackId: 'interlagos', classes: [CarClassId.F1_2026, CarClassId.F1_2021] },
  { trackId: 'daytona-road', classes: [CarClassId.HYPERCAR_GTP, CarClassId.LMP2, CarClassId.GT3] },
  { trackId: 'zandvoort', classes: [CarClassId.GT3, CarClassId.GT4] },
  { trackId: 'monza', classes: [CarClassId.SUPERCAR, CarClassId.F1_2021] },
  { trackId: 'spa-francorchamps', classes: [CarClassId.HYPERCAR_GTP, CarClassId.GT3] },
];

export const ATTRACT_FADE_OUT_MS = 700;
export const ATTRACT_HOLD_MS = 180;
export const ATTRACT_FADE_IN_MS = 750;

export { resolveCustomWaypointSurface as resolveCustomSegmentSurface };

export function isTrackSegmentTunnel(compiledTrack: CompiledTrack, trackT: number): boolean {
  const wps = compiledTrack.spec.waypoints;
  if (!wps || wps.length === 0) return false;
  const wrappedT = ((trackT % 1) + 1) % 1;
  const idx = Math.floor(wrappedT * wps.length) % wps.length;
  const wp = wps[idx];
  return (wp?.propType ?? wp?.sceneryProp) === 'tunnel';
}

export interface GhostCarPose {
  visible: boolean;
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  roll: number;
}

export type SimAudioEvent =
  | { type: 'beep'; freq: number; duration: number }
  | { type: 'impact'; intensity: number; kind: 'wall' | 'car' };

export interface SimRumbleEvent {
  weak: number;
  strong: number;
  durationMs: number;
}

export interface SimStepInput {
  throttle: number;
  brake: number;
  steer: number;
  specialPressed: boolean;
  specialJustPressed: boolean;
  shiftUp: boolean;
  shiftDown: boolean;
}

export interface SimSessionContext {
  phase: GamePhase;
  raceConfig: RaceConfig;
  cameraMode: CameraMode;
  pitStrategy: PitStrategy;
  mpClient: MultiplayerClient;
  roomPeers: RoomPeer[];
  settings: GameSettings;
}

export interface SimStepResult {
  attractFaded?: boolean;
  shouldRebuildAttract?: boolean;
  audioEvents: SimAudioEvent[];
  rumbleEvents: SimRumbleEvent[];
  ghostPose: GhostCarPose;
  hudSnapshot: HudSnapshot | null;
  qualifyingFinish?: { qualiTime: number; gridPos: number };
  raceFinish?: HudSnapshot;
}

class SimWorkerBridge {
  private worker: Worker | null = null;
  private ready = false;
  private failed = false;
  private inFlight = false;
  private sessionNonce = 0;
  private seq = 0;
  private initSentAt = 0;
  private pendingCommands: SimWorkerCarCommand[] = [];
  private latestMsg: SimWorkerOutboundMsg | null = null;

  public isActive(enabled: boolean): boolean {
    return enabled && !this.failed && this.worker !== null && this.ready;
  }

  public isUsingWorker(enabled: boolean): boolean {
    if (!enabled || this.failed) return false;
    if (typeof Worker === 'undefined') return false;
    return true;
  }

  public queueCommand(cmd: SimWorkerCarCommand): void {
    this.pendingCommands.push(cmd);
  }

  public initSession(msg: Omit<Extract<SimWorkerInboundMsg, { type: 'init' }>, 'type' | 'sessionNonce'>): void {
    this.ready = false;
    this.inFlight = false;
    this.latestMsg = null;
    this.pendingCommands = [];
    this.sessionNonce += 1;
    if (typeof Worker === 'undefined') {
      this.failed = true;
      return;
    }
    if (!this.worker) {
      try {
        this.worker = new Worker(new URL('../game/simWorker.ts', import.meta.url), {
          type: 'module',
        });
        this.worker.onmessage = (ev: MessageEvent<SimWorkerOutboundMsg>) => {
          const data = ev.data;
          if (!data || data.sessionNonce !== this.sessionNonce) return;
          if (data.type === 'ready') {
            this.ready = true;
            this.inFlight = false;
          } else if (data.type === 'stepped') {
            this.inFlight = false;
            this.latestMsg = data;
          }
        };
        this.worker.onerror = () => {
          this.disableWithFallback();
        };
        this.worker.onmessageerror = () => {
          this.disableWithFallback();
        };
      } catch {
        this.disableWithFallback();
        return;
      }
    }
    try {
      this.initSentAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.worker.postMessage({
        ...msg,
        type: 'init',
        sessionNonce: this.sessionNonce,
      });
    } catch {
      this.disableWithFallback();
    }
  }

  public checkInitTimeout(nowMs: number): void {
    if (this.worker && !this.ready && !this.failed && this.initSentAt > 0 && nowMs - this.initSentAt > 1800) {
      this.disableWithFallback();
    }
  }

  public applyLatestResult(
    cars: CarSimState[],
    raceControl: RaceControlState,
    weatherSystem: WeatherSystemState,
  ): boolean {
    if (!this.latestMsg || this.latestMsg.type !== 'stepped') return false;
    const msg = this.latestMsg;
    this.latestMsg = null;
    if (msg.sessionNonce !== this.sessionNonce) return false;

    unpackFloat32ToCars(msg.buffer, cars);
    for (const t of msg.telemetry) {
      const car = cars.find((c) => c.id === t.id);
      if (!car) continue;
      car.tireWear = t.tireWear;
      car.tireTemp = t.tireTemp;
      car.fuel = t.fuel;
      car.fuelLapsRemaining = t.fuelLapsRemaining;
      car.aeroDamage = t.aeroDamage;
      car.specialCharge = t.specialCharge;
      car.ersBattery = t.ersBattery;
      car.ersMode = t.ersMode;
      car.tcLevel = t.tcLevel;
      car.transmissionMode = t.transmissionMode;
      car.attackModeUsesRemaining = t.attackModeUsesRemaining;
      car.attackModeTimer = t.attackModeTimer;
      car.warningCount = t.warningCount;
      car.penaltyTimeRemaining = t.penaltyTimeRemaining;
      car.postRacePenaltySeconds = t.postRacePenaltySeconds;
      car.penaltyReason = t.penaltyReason;
      car.penaltyType = t.penaltyType;
      car.heavyPenaltyHoldProgress = t.heavyPenaltyHoldProgress;
      car.heavyPenaltyIssuedLap = t.heavyPenaltyIssuedLap;
      car.heavyPenaltyDeadlineLap = t.heavyPenaltyDeadlineLap;
      car.neutralizationSpeedCapMs = t.neutralizationSpeedCapMs;
      car.safetyCarQueueTargetSpeedMs = t.safetyCarQueueTargetSpeedMs;
      car.safetyCarBunchingGapM = t.safetyCarBunchingGapM;
      car.surfaceType = t.surfaceType;
      car.crestLoadFactor = t.crestLoadFactor;
      car.dirtyAirStrength = t.dirtyAirStrength;
      car.brakeTempFront = t.brakeTempFront;
      car.brakeTempRear = t.brakeTempRear;
      car.brakeFade = t.brakeFade;
      car.bestLapTime = t.bestLapTime;
      car.lastLapTime = t.lastLapTime;
      car.totalTime = t.totalTime;
      car.pitStopRemaining = t.pitStopRemaining;
      car.pitStopTotal = t.pitStopTotal;
      car.pitActiveTask = t.pitActiveTask;
      car.pitQueue = t.pitQueue;
      car.pitStops = t.pitStops;
      car.compound = t.compound;
      car.currentSector = t.currentSector;
      car.sectorTimes = t.sectorTimes;
      car.bestSectorTimes = t.bestSectorTimes;
      car.lastLapSectorTimes = t.lastLapSectorTimes;
      if (t.debrisBurstIntensity > 0) car.debrisBurstIntensity = t.debrisBurstIntensity;
      car.disqualified = t.disqualified;
      car.lastInputThrottle = t.lastInputThrottle;
      car.lastInputBrake = t.lastInputBrake;
      car.lastInputSteer = t.lastInputSteer;
      if (car.setup) car.setup.brakeBalance = t.brakeBalance;
      car.aiPaceOrder = t.aiPaceOrder;
    }

    const rc = msg.raceControl;
    raceControl.globalFlag = rc.globalFlag;
    raceControl.sectorFlags = rc.sectorFlags;
    raceControl.message = rc.message;
    raceControl.safetyCar.active = rc.safetyCarActive;
    raceControl.safetyCar.phase = rc.safetyCarPhase;
    raceControl.safetyCar.trackT = rc.safetyCarTrackT;
    raceControl.safetyCar.lateralOffset = rc.safetyCarLateralOffset;
    raceControl.safetyCar.speedMs = rc.safetyCarSpeedMs;
    raceControl.neutralizationSpeedCapMs = rc.neutralizationSpeedCapMs;

    weatherSystem.trackWetness = rc.trackWetness;
    weatherSystem.rainIntensity = rc.rainIntensity;
    weatherSystem.trackRubber = rc.trackRubber;
    weatherSystem.ambientTempC = rc.ambientTempC;
    weatherSystem.trackTempC = rc.trackTempC;
    weatherSystem.racingLineWetness = rc.racingLineWetness;
    weatherSystem.offLineWetness = rc.offLineWetness;
    return true;
  }

  public postStep(
    msg: Omit<Extract<SimWorkerInboundMsg, { type: 'step' }>, 'type' | 'sessionNonce' | 'seq' | 'commands'>,
  ): void {
    if (!this.worker || !this.ready || this.failed || this.inFlight) return;
    const cmds = this.pendingCommands.length > 0 ? this.pendingCommands.splice(0) : undefined;
    this.seq += 1;
    this.inFlight = true;
    try {
      this.worker.postMessage({
        ...msg,
        type: 'step',
        sessionNonce: this.sessionNonce,
        seq: this.seq,
        commands: cmds,
      });
    } catch {
      this.disableWithFallback();
    }
  }

  public syncCars(cars: CarSimState[]): void {
    if (!this.worker || !this.ready || this.failed) return;
    try {
      this.worker.postMessage({
        type: 'syncCars',
        sessionNonce: this.sessionNonce,
        snapshots: cars.map((c) => ({
          id: c.id,
          x: c.x,
          y: c.y,
          z: c.z,
          vx: c.vx,
          vz: c.vz,
          heading: c.heading,
          speed: c.speed,
          trackT: c.trackT,
          lap: c.lap,
          totalDistance: c.totalDistance,
          currentLapTime: c.currentLapTime,
          fuel: c.fuel,
          tireWear: c.tireWear,
        })),
      });
    } catch {
      this.disableWithFallback();
    }
  }

  private disableWithFallback(): void {
    this.failed = true;
    this.ready = false;
    this.inFlight = false;
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
    }
  }

  public dispose(): void {
    this.ready = false;
    this.inFlight = false;
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
    }
  }
}

export class RaceSimulationEngine {
  public compiledTrack: CompiledTrack;
  public cars: CarSimState[] = [];
  public countdown = 3.0;
  public activeStartType: RaceStartType = 'standing';
  public rollingFormationSpeed = 28;
  public rollingFormationLanes = new Map<string, number>();
  public raceElapsed = 0;
  public greenFlagFlash = 0;
  public trackWetness = 0;
  public weatherSystem: WeatherSystemState;
  public raceControl: RaceControlState;
  public specialZones: TrackSpecialZones;
  public launchStatus: 'none' | 'perfect' = 'none';
  public launchStatusTimer = 0;
  public loadingAssets = false;
  public trauma = 0;
  public qualiTime: number | null = null;
  public qualiGridPos: number | null = null;
  public finishEmitted = false;
  public lastHudTime = 0;
  public lastTelemetryTime = 0;
  public worldVersion = 0;

  public spectatedCarId: string | null = null;
  public attractIndex = Math.floor(Math.random() * ATTRACT_SCENARIOS.length);
  public attractFocusPassedHalfway = false;
  public attractTransitionState: 'idle' | 'fading-out' | 'holding' | 'fading-in' = 'idle';
  public attractTransitionAt = 0;

  public elimination: EliminationState = createEliminationState(false, 30);
  public raceDurationSeconds = 0;
  public timedFinalLapAnnounced = false;
  public replayRecorder = new RaceReplayRecorder();
  public raceRadio: RaceEngineerRadio;
  public timeOfDayHours = 13.0;
  public timeScale = 1;
  public lastRadioMessage: RaceRadioMessage | null = null;
  public lapPositionHistory: Array<{ lap: number; position: number }> = [];
  public prevCarGears = new Map<string, number>();

  public ghostLap: StoredGhostLap | null = null;
  public ghostLabel: string | null = null;
  public ghostTargetTime: number | null = null;
  public ghostUseSamples = false;
  public currentLapGhostSamples: GhostSample[] = [];
  public lastGhostSampleTime = -1;
  public lastRecordedLapCount = 1;
  public playerTopSpeedKmh = 0;
  public overtakesCount = 0;
  public cleanLapsCount = 0;
  public incidentsCount = 0;
  public prevPlayerRank: number | null = null;
  public lapStartWarnings = 0;

  private workerBridge = new SimWorkerBridge();
  private workerRequested = false;

  constructor(initialConfig: RaceConfig, onRadioChirp?: () => void) {
    const initialTrackSpec = initialConfig.customTrack || getTrackById(initialConfig.trackId);
    this.compiledTrack = compileTrack(initialTrackSpec);
    this.weatherSystem = createWeatherSystemState({
      weatherMode: initialConfig.weather,
      weatherPreset: initialConfig.weatherPreset,
      customTimeline: initialConfig.weatherTimeline,
      compiledTrack: this.compiledTrack,
      totalLaps: initialConfig.totalLaps,
    });
    this.trackWetness = this.weatherSystem.trackWetness;
    this.raceControl = createRaceControlState();
    this.specialZones = computeTrackSpecialZones(this.compiledTrack);
    this.raceRadio = new RaceEngineerRadio(onRadioChirp);
  }

  public isWorkerEnabled(settings: GameSettings): boolean {
    return Boolean((settings as GameSettings & { workerSimulation?: boolean }).workerSimulation);
  }

  public rebuildSession(ctx: SimSessionContext): {
    isTitle: boolean;
    isAiRace: boolean;
    showFeAttackZone: boolean;
    showDrsZones: boolean;
  } {
    this.worldVersion += 1;
    const cfg = ctx.raceConfig;
    const currentPhase = ctx.phase;
    const isTitle = currentPhase === 'title';
    const attract = ATTRACT_SCENARIOS[this.attractIndex % ATTRACT_SCENARIOS.length];
    const trackSpec = isTitle
      ? getTrackById(attract.trackId)
      : cfg.customTrack || getTrackById(cfg.trackId);
    const compiled = compileTrack(trackSpec);
    this.compiledTrack = compiled;
    this.specialZones = computeTrackSpecialZones(compiled);

    const isAiRaceMode = cfg.sessionMode === 'ai-race';
    const showFeAttackZone = !isTitle && (isAiRaceMode
      ? cfg.activeClasses.includes(CarClassId.FORMULA_E)
      : getCarById(cfg.playerCarId).classId === CarClassId.FORMULA_E);
    const showDrsZones = !isTitle && (isAiRaceMode
      ? cfg.activeClasses.includes(CarClassId.F1_2021)
      : getCarById(cfg.playerCarId).classId === CarClassId.F1_2021);

    this.weatherSystem = createWeatherSystemState({
      weatherMode: isTitle ? 'dry' : cfg.weather,
      weatherPreset: isTitle ? 'clear-dry' : cfg.weatherPreset,
      customTimeline: isTitle ? undefined : cfg.weatherTimeline,
      compiledTrack: compiled,
      totalLaps: cfg.totalLaps,
    });
    this.raceControl = createRaceControlState();
    this.launchStatus = 'none';
    this.launchStatusTimer = 0;
    this.replayRecorder.reset();
    this.raceRadio.reset();
    this.lapPositionHistory = [];
    this.prevCarGears.clear();
    this.lastRadioMessage = null;

    const todPreset = isTitle
      ? 'midday'
      : cfg.timeOfDay ?? (compiled.spec.scenery === 'street-night' ? 'night' : 'midday');
    this.timeOfDayHours =
      todPreset === 'dawn'
        ? 6.2
        : todPreset === 'golden-hour'
        ? 17.6
        : todPreset === 'dusk'
        ? 19.3
        : todPreset === 'night'
        ? 22.5
        : todPreset === 'dynamic-24h'
        ? 14.0
        : 13.0;
    this.timeScale =
      todPreset === 'dynamic-24h' ? Math.max(10, cfg.timeScale ?? 30) : Math.max(1, cfg.timeScale ?? 1);

    const isQuali = currentPhase === 'qualifying';
    const isTimeTrial = currentPhase === 'playing' && cfg.sessionMode === 'time-trial';
    const isLicenseSolo = currentPhase === 'playing' && cfg.sessionMode === 'license' && (cfg.aiBotCount ?? 0) === 0;
    const isPractice = currentPhase === 'playing' && (cfg.sessionMode === 'practice' || isTimeTrial);
    const isSoloSession = isQuali || isPractice || isLicenseSolo;
    const isAiRace = currentPhase === 'playing' && cfg.sessionMode === 'ai-race';
    const isElimination = currentPhase === 'playing' && cfg.sessionMode === 'elimination';
    const playerSpec = getCarById(cfg.playerCarId);

    const rawActiveClasses = isTitle
      ? attract.classes
      : cfg.activeClasses.length > 0
      ? cfg.activeClasses
      : [playerSpec.classId];
    const uniqueClasses = Array.from(
      new Set(
        !isTitle && !isAiRace ? [...rawActiveClasses, playerSpec.classId] : rawActiveClasses,
      ),
    );
    const orderedClasses = [...uniqueClasses].sort(
      (a, b) => (CAR_CLASSES[b]?.basePaceIndex ?? 0.8) - (CAR_CLASSES[a]?.basePaceIndex ?? 0.8),
    );

    const allowedCars = CARS.filter((c) => orderedClasses.includes(c.classId));
    const poolCars = allowedCars.length > 0 ? allowedCars : CARS;
    const sortedPool = [...poolCars].sort(
      (a, b) => CAR_CLASSES[b.classId].basePaceIndex - CAR_CLASSES[a.classId].basePaceIndex,
    );

    const peers =
      isSoloSession || isAiRace
        ? []
        : ctx.roomPeers.filter((p) => p.peerId !== ctx.mpClient.peerId);
    const aiCount = isSoloSession
      ? 0
      : isAiRace
      ? Math.max(2, Math.min(24, cfg.aiBotCount ?? cfg.gridSize ?? 12))
      : cfg.noAi
      ? 0
      : cfg.aiBotCount !== undefined
      ? Math.max(0, Math.min(23, cfg.aiBotCount))
      : Math.max(0, cfg.gridSize - 1 - peers.length);
    const totalGrid = isSoloSession
      ? 1
      : isTitle
      ? 10
      : isAiRace
      ? aiCount
      : Math.max(1, 1 + peers.length + aiCount);

    const slotClasses: CarClassId[] = [];
    if (orderedClasses.length <= 1 || isSoloSession) {
      for (let s = 0; s < totalGrid; s++) slotClasses.push(playerSpec.classId);
    } else {
      const classCount = orderedClasses.length;
      const basePerClass = Math.floor(totalGrid / classCount);
      let remainder = totalGrid % classCount;
      for (let ci = 0; ci < classCount; ci++) {
        const cid = orderedClasses[ci];
        const countForClass = Math.max(1, basePerClass + (remainder > 0 ? 1 : 0));
        if (remainder > 0) remainder--;
        for (let k = 0; k < countForClass && slotClasses.length < totalGrid; k++) {
          slotClasses.push(cid);
        }
      }
      while (slotClasses.length < totalGrid) {
        slotClasses.push(orderedClasses[orderedClasses.length - 1]);
      }
    }

    const playerClassSlots: number[] = [];
    for (let s = 0; s < slotClasses.length; s++) {
      if (slotClasses[s] === playerSpec.classId) playerClassSlots.push(s);
    }
    const defaultPlayerSlot =
      playerClassSlots.length > 0
        ? playerClassSlots[Math.floor(playerClassSlots.length * 0.45)]
        : Math.min(totalGrid - 1, Math.floor(totalGrid * 0.45));

    const playerSlot = isSoloSession
      ? 0
      : isAiRace
      ? -1
      : cfg.startingGridPosition !== undefined
      ? Math.max(0, Math.min(totalGrid - 1, cfg.startingGridPosition - 1))
      : this.qualiGridPos !== null
      ? Math.min(totalGrid - 1, this.qualiGridPos - 1)
      : defaultPlayerSlot;

    const aiPaceMult =
      cfg.aiDifficulty === 'Rookie'
        ? 0.84
        : cfg.aiDifficulty === 'Amateur'
        ? 0.92
        : cfg.aiDifficulty === 'Pro'
        ? 1.0
        : 1.07;

    const useRollingStart = !isSoloSession && !isTitle && cfg.startType === 'rolling';
    const formationPoolSpecs = [
      ...(!isTitle && !isAiRace ? [{ carSpec: playerSpec }] : []),
      ...sortedPool.map((carSpec) => ({ carSpec })),
    ];
    const formationSpeedMs = getRollingFormationSpeedMs(formationPoolSpecs);
    const gridStartType: RaceStartType = useRollingStart ? 'rolling' : 'standing';
    this.rollingFormationLanes.clear();

    const unassignedPeers = [...peers];
    const classAiCursors = new Map<CarClassId, number>();
    let aiCursor = 0;
    const aiRoster = assignAiRosterGrid(totalGrid, cfg.aiDifficulty, aiPaceMult);
    const newCars: CarSimState[] = [];
    const workerInits: SimWorkerCarInit[] = [];

    for (let slot = 0; slot < totalGrid; slot++) {
      const slotClassId = slotClasses[slot] ?? playerSpec.classId;
      const matchingPeerIdx =
        currentPhase !== 'title' && !isSoloSession && slot !== playerSlot
          ? unassignedPeers.findIndex((pr) => pr.classId === slotClassId)
          : -1;
      const fallbackPeerIdx =
        matchingPeerIdx >= 0
          ? matchingPeerIdx
          : currentPhase !== 'title' && !isSoloSession && slot !== playerSlot && unassignedPeers.length >= totalGrid - slot
          ? 0
          : -1;

      if (slot === playerSlot && !isTitle && !isAiRace) {
        const initSpec: SimWorkerCarInit = {
          id: 'player',
          name: 'You',
          isPlayer: true,
          carId: playerSpec.id,
          livery: cfg.playerLivery,
          gridSlot: isSoloSession ? 0 : slot,
          compound: cfg.startingCompound,
          startType: gridStartType,
          rollingSpeed: formationSpeedMs,
          setup: cfg.carSetup ?? getDefaultTrackClassSetup(playerSpec.id, compiled.spec.id),
          damageLevel: cfg.damageLevel ?? 'light',
          absLevel: cfg.absLevel ?? 'low',
          transmissionMode: ctx.settings.transmissionMode,
          tcLevel: resolveClassDefaultTc(playerSpec.classId, ctx.settings.tcDefault),
          stabilityControl: ctx.settings.stabilityControl,
        };
        const pCar = createCarSimState({ ...initSpec, compiledTrack: compiled });
        const patch: SimWorkerCarInit['initialStatePatch'] = {};
        if (cfg.startingFuelOverride !== undefined && Number.isFinite(cfg.startingFuelOverride)) {
          pCar.fuel = Math.max(5, Math.min(100, cfg.startingFuelOverride));
          pCar.fuelLapsRemaining = Math.max(0.5, Number(((pCar.fuel / 100) * 14).toFixed(1)));
          patch.fuel = pCar.fuel;
          patch.fuelLapsRemaining = pCar.fuelLapsRemaining;
        }
        const useFlyingHotlapStart =
          isQuali || isPractice || (isLicenseSolo && cfg.startType === 'rolling');
        if (useFlyingHotlapStart) {
          const sp = sampleTrackAtT(compiled, 0.88);
          pCar.trackT = 0.88;
          pCar.prevTrackT = 0.88;
          pCar.x = sp.x;
          pCar.y = sp.y;
          pCar.z = sp.z;
          pCar.heading = Math.atan2(sp.tx, sp.tz);
          pCar.speed = isQuali ? 38 : 34;
          pCar.totalDistance = -0.12;
          Object.assign(patch, {
            trackT: pCar.trackT,
            prevTrackT: pCar.prevTrackT,
            x: pCar.x,
            y: pCar.y,
            z: pCar.z,
            heading: pCar.heading,
            speed: pCar.speed,
            totalDistance: pCar.totalDistance,
          });
        }
        initSpec.initialStatePatch = patch;
        this.rollingFormationLanes.set(pCar.id, pCar.lateralOffset);
        newCars.push(pCar);
        workerInits.push(initSpec);
      } else if (fallbackPeerIdx >= 0) {
        const [peer] = unassignedPeers.splice(fallbackPeerIdx, 1);
        const initSpec: SimWorkerCarInit = {
          id: peer.peerId,
          name: peer.name,
          isPlayer: false,
          isHumanPeer: true,
          carId: peer.carId,
          livery: peer.livery,
          gridSlot: slot,
          compound: cfg.startingCompound,
          startType: gridStartType,
          rollingSpeed: formationSpeedMs,
          setup: getDefaultTrackClassSetup(peer.carId, compiled.spec.id),
          damageLevel: cfg.damageLevel ?? 'light',
        };
        const peerCar = createCarSimState({ ...initSpec, compiledTrack: compiled });
        this.rollingFormationLanes.set(peerCar.id, peerCar.lateralOffset);
        newCars.push(peerCar);
        workerInits.push(initSpec);
      } else {
        const classPool = sortedPool.filter((c) => c.classId === slotClassId);
        const effectivePool = classPool.length > 0 ? classPool : sortedPool;
        const classAiIdx = classAiCursors.get(slotClassId) ?? 0;
        classAiCursors.set(slotClassId, classAiIdx + 1);
        const teamPairIdx = Math.floor(classAiIdx / 2);
        const pick = effectivePool[teamPairIdx % effectivePool.length];
        const assignment = aiRoster[aiCursor % aiRoster.length];
        const profile = assignment.profile;

        const hasTeamPresets = Boolean(pick.liveries && pick.liveries.length > 0);
        const randomPresetIdx = hasTeamPresets
          ? Math.floor(Math.random() * pick.liveries!.length)
          : 0;
        const baseLivery = hasTeamPresets
          ? { ...pick.liveries![randomPresetIdx].livery }
          : { ...pick.defaultLivery };
        const aiLivery = assignment.applyCoordinatedLivery(baseLivery, hasTeamPresets);

        const isWetStart =
          this.weatherSystem.trackWetness >= 0.28 || this.weatherSystem.rainIntensity >= 0.35;
        const defaultDryCompound: TireCompound =
          cfg.totalLaps <= 3
            ? 'soft'
            : profile.personality === 'Tire-Saver'
            ? 'hard'
            : profile.personality === 'Average GTP Driver' || profile.personality === 'Late-Braker'
            ? 'soft'
            : 'medium';

        const initSpec: SimWorkerCarInit = {
          id: `ai-${aiCursor}`,
          name: profile.name,
          isPlayer: false,
          carId: pick.id,
          livery: aiLivery,
          gridSlot: slot,
          compound: isWetStart ? 'wet' : defaultDryCompound,
          personality: profile.personality,
          aiPaceMultiplier: assignment.paceMultiplier,
          aiDriverId: profile.id,
          aiNationality: profile.nationality,
          aiTeamName: profile.teamName,
          aiRivalId: profile.rivalId,
          aiSkillRating: profile.skill,
          aiAggression: profile.aggression,
          aiWetSkill: profile.wetSkill,
          aiConsistency: profile.consistency,
          setup: getDefaultTrackClassSetup(pick.id, compiled.spec.id),
          startType: gridStartType,
          rollingSpeed: formationSpeedMs,
          damageLevel: cfg.damageLevel ?? 'light',
          absLevel: 'low',
        };
        const bot = createCarSimState({ ...initSpec, compiledTrack: compiled });
        if (currentPhase === 'title') {
          const t = (0.015 + slot / totalGrid) % 1;
          const sp = sampleTrackAtT(compiled, t);
          bot.trackT = t;
          bot.prevTrackT = t;
          bot.x = sp.x + sp.nx * ((slot % 2 === 0 ? -1 : 1) * 2.5);
          bot.y = sp.y;
          bot.z = sp.z + sp.nz * ((slot % 2 === 0 ? -1 : 1) * 2.5);
          bot.heading = Math.atan2(sp.tx, sp.tz);
          bot.speed = 34;
          bot.lap = 1;
          bot.totalDistance = t;
          initSpec.initialStatePatch = {
            trackT: bot.trackT,
            prevTrackT: bot.prevTrackT,
            x: bot.x,
            y: bot.y,
            z: bot.z,
            heading: bot.heading,
            speed: bot.speed,
            lap: bot.lap,
            totalDistance: bot.totalDistance,
          };
        }
        this.rollingFormationLanes.set(bot.id, bot.lateralOffset);
        newCars.push(bot);
        workerInits.push(initSpec);
        aiCursor++;
      }
    }

    if (newCars.length > 1 && !isQuali && !isPractice && currentPhase !== 'title') {
      const ghostSec = useRollingStart ? 5.5 : 2.5;
      for (let i = 0; i < newCars.length; i++) {
        newCars[i].spawnGhostTimer = ghostSec;
        if (workerInits[i]) {
          workerInits[i].initialStatePatch = {
            ...workerInits[i].initialStatePatch,
            spawnGhostTimer: ghostSec,
          };
        }
      }
    }

    this.cars = newCars;
    this.loadingAssets = !isTitle;

    const isAutostart =
      typeof window !== 'undefined' && window.location.search.includes('autostart=1');
    this.activeStartType = gridStartType;
    this.rollingFormationSpeed = formationSpeedMs;
    this.raceElapsed = 0;
    this.greenFlagFlash = 0;
    const skipCountdownForSolo = isPractice || (isLicenseSolo && cfg.startType === 'rolling');
    this.countdown =
      currentPhase === 'playing' && !skipCountdownForSolo && !isAutostart
        ? useRollingStart
          ? 3.2
          : 2.0
        : 0;
    this.trackWetness = this.weatherSystem.trackWetness;
    this.trauma = 0;
    this.finishEmitted = false;
    this.spectatedCarId = newCars[0]?.id ?? null;

    this.elimination = createEliminationState(
      isElimination && !isTitle,
      cfg.eliminationIntervalSeconds ?? 30,
    );
    this.raceDurationSeconds =
      !isTitle && !isQuali && !isPractice && !isElimination && (cfg.raceDurationMinutes ?? 0) > 0
        ? Math.round((cfg.raceDurationMinutes ?? 0) * 60)
        : 0;
    this.timedFinalLapAnnounced = false;
    this.currentLapGhostSamples = [];
    this.lastGhostSampleTime = -1;
    this.lastRecordedLapCount = 1;
    this.playerTopSpeedKmh = 0;
    this.overtakesCount = 0;
    this.cleanLapsCount = 0;
    this.incidentsCount = 0;
    this.prevPlayerRank = null;
    this.lapStartWarnings = 0;

    const desiredGhostMode =
      isTitle || isAiRace ? 'off' : cfg.ghostMode ?? (isTimeTrial ? 'personal-best' : 'off');
    const storedPbGhost = !isTitle ? loadGhostLap(trackSpec.id, playerSpec.id) : null;
    const ghostResolved = resolveGhostTargetLapTime(
      desiredGhostMode,
      trackSpec,
      playerSpec.classId,
      storedPbGhost,
    );
    if (
      !isTitle &&
      (desiredGhostMode === 'alien' ||
        desiredGhostMode === 'gold' ||
        desiredGhostMode === 'silver' ||
        desiredGhostMode === 'bronze')
    ) {
      const physicsGhost = generatePhysicsTargetGhostLap(
        compiled,
        playerSpec,
        desiredGhostMode,
        this.trackWetness,
      );
      if (physicsGhost) {
        this.ghostLap = physicsGhost;
        this.ghostLabel = ghostResolved.label;
        this.ghostTargetTime = physicsGhost.lapTime;
        this.ghostUseSamples = true;
      } else {
        this.ghostLap = storedPbGhost;
        this.ghostLabel = ghostResolved.label;
        this.ghostTargetTime = ghostResolved.targetTime;
        this.ghostUseSamples = ghostResolved.useRecordedSamples;
      }
    } else {
      this.ghostLap = storedPbGhost;
      this.ghostLabel = ghostResolved.label;
      this.ghostTargetTime = ghostResolved.targetTime;
      this.ghostUseSamples = ghostResolved.useRecordedSamples;
    }

    const playerAnchor = newCars.find((c) => c.isPlayer);
    if (playerAnchor && !isTitle) {
      telemetryRecorder.resetSession();
    }
    this.attractFocusPassedHalfway = false;

    const isPracticeSession = isQuali || isPractice;
    const isRealRaceSession = !isTitle && !isQuali && !isPractice;
    const effectiveTotalLaps =
      this.raceDurationSeconds > 0 || isElimination ? 0 : cfg.totalLaps;

    this.workerRequested = this.isWorkerEnabled(ctx.settings);
    if (this.workerRequested && this.workerBridge.isUsingWorker(true)) {
      this.workerBridge.initSession({
        trackSpec,
        cars: workerInits,
        weatherMode: isTitle ? 'dry' : cfg.weather,
        weatherPreset: isTitle ? 'clear-dry' : cfg.weatherPreset,
        weatherTimeline: isTitle ? undefined : cfg.weatherTimeline,
        totalLaps: cfg.totalLaps,
        effectiveTotalLaps,
        isTitle,
        isRealRace: isRealRaceSession,
        isQualifying: isQuali,
        isPractice: isPracticeSession,
        damageLevel: cfg.damageLevel ?? 'light',
        absLevel: cfg.absLevel ?? 'low',
        aiDifficulty: cfg.aiDifficulty,
        activeStartType: gridStartType,
        rollingFormationSpeed: formationSpeedMs,
        rollingFormationLanes: Array.from(this.rollingFormationLanes.entries()),
      });
    }

    return { isTitle, isAiRace, showFeAttackZone, showDrsZones };
  }

  public applySettings(settings: GameSettings): void {
    const wantWorker = this.isWorkerEnabled(settings);
    if (wantWorker && !this.workerRequested) {
      this.workerRequested = true;
    } else if (!wantWorker && this.workerRequested) {
      this.workerRequested = false;
      this.workerBridge.dispose();
    }
    const pCar = this.cars.find((c) => c.isPlayer);
    if (pCar) {
      pCar.transmissionMode = settings.transmissionMode;
      pCar.tcLevel = resolveClassDefaultTc(pCar.carSpec.classId, settings.tcDefault);
      pCar.stabilityControl = settings.stabilityControl;
      if (this.workerBridge.isActive(this.workerRequested)) {
        this.workerBridge.queueCommand({
          carId: pCar.id,
          transmissionMode: pCar.transmissionMode,
          tcLevel: pCar.tcLevel,
          stabilityControl: pCar.stabilityControl,
        });
      }
    }
  }

  public requestPitStop(action: PitServiceAction, nextCompound?: TireCompound): boolean {
    const pCar = this.cars.find((c) => c.isPlayer);
    if (!pCar) return false;
    const ok = requestOnTrackPitStop(pCar, action, nextCompound);
    if (ok && this.workerBridge.isActive(this.workerRequested)) {
      this.workerBridge.queueCommand({ carId: pCar.id, pitAction: { action, compound: nextCompound } });
    }
    return ok;
  }

  public cycleErsMode(): boolean {
    const pCar = this.cars.find((c) => c.isPlayer);
    if (!pCar || !carHasHybridErs(pCar.carSpec)) return false;
    pCar.ersMode = cycleErsMode(pCar.ersMode ?? 'balanced');
    if (this.workerBridge.isActive(this.workerRequested)) {
      this.workerBridge.queueCommand({ carId: pCar.id, ersMode: pCar.ersMode });
    }
    return true;
  }

  public adjustBrakeBalance(delta: number): number | null {
    const pCar = this.cars.find((c) => c.isPlayer);
    if (!pCar) return null;
    const cur = pCar.setup ?? { ...DEFAULT_CAR_SETUP };
    const next = Math.max(46, Math.min(68, Math.round((cur.brakeBalance + delta) * 2) / 2));
    pCar.setup = normalizeCarSetup({ ...cur, brakeBalance: next });
    if (this.workerBridge.isActive(this.workerRequested)) {
      this.workerBridge.queueCommand({ carId: pCar.id, brakeBalance: next });
    }
    return next;
  }

  public cycleTcLevel(): TcLevel | null {
    const pCar = this.cars.find((c) => c.isPlayer);
    if (!pCar) return null;
    const next = (((pCar.tcLevel ?? 0) + 1) % 4) as TcLevel;
    pCar.tcLevel = next;
    this.raceControl.message = `TRACTION CONTROL: ${next === 0 ? 'OFF' : `LEVEL ${next}`}`;
    this.raceControl.messageTimer = 1.8;
    if (this.workerBridge.isActive(this.workerRequested)) {
      this.workerBridge.queueCommand({ carId: pCar.id, tcLevel: next });
    }
    return next;
  }

  public triggerFlashback(roomPeersCount: number, sessionMode?: string): boolean {
    if (roomPeersCount > 1 || sessionMode === 'ai-race') return false;
    if (!this.replayRecorder.canFlashback()) return false;
    const rewoundTo = this.replayRecorder.applyFlashback(this.cars, 5.5);
    if (rewoundTo === null) return false;
    this.raceElapsed = rewoundTo;
    this.raceControl.message = 'FLASHBACK REWIND (-5.5s)';
    this.raceControl.messageTimer = 2.0;
    if (this.workerBridge.isActive(this.workerRequested)) {
      this.workerBridge.syncCars(this.cars);
    }
    return true;
  }

  public setAiPaceOrder(carId: string, order: AiPaceOrder): boolean {
    const target = this.cars.find((c) => c.id === carId && !c.isPlayer);
    if (!target) return false;
    target.aiPaceOrder = order;
    if (this.workerBridge.isActive(this.workerRequested)) {
      this.workerBridge.queueCommand({ carId: target.id, aiPaceOrder: order });
    }
    return true;
  }

  public setAiErsMode(carId: string, mode: ErsMode): boolean {
    const target = this.cars.find((c) => c.id === carId && !c.isPlayer);
    if (!target || !carHasHybridErs(target.carSpec)) return false;
    target.ersMode = mode;
    if (this.workerBridge.isActive(this.workerRequested)) {
      this.workerBridge.queueCommand({ carId: target.id, ersMode: mode });
    }
    return true;
  }

  public callAiOnTrackService(carId: string, action: PitServiceAction, compound?: TireCompound): boolean {
    const target = this.cars.find((c) => c.id === carId && !c.isPlayer && !c.finished);
    if (!target) return false;
    target.aiPendingStop = { action, compound };
    this.raceControl.message = `RADIO TO ${target.name.toUpperCase()}: BOX ON-TRACK FOR ${action.toUpperCase()}`;
    this.raceControl.messageTimer = 3.2;
    if (this.workerBridge.isActive(this.workerRequested)) {
      this.workerBridge.queueCommand({ carId: target.id, aiPendingStop: target.aiPendingStop });
    }
    return true;
  }

  public step(
    dt: number,
    rawDt: number,
    nowMs: number,
    input: SimStepInput,
    ctx: SimSessionContext,
    fpsSmoothed: number,
    photoActive: boolean,
    replayActive: boolean,
    spectatorCameraMode?: SpectatorCameraMode,
  ): SimStepResult {
    const audioEvents: SimAudioEvent[] = [];
    const rumbleEvents: SimRumbleEvent[] = [];
    let ghostPose: GhostCarPose = { visible: false, x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 };
    let attractFaded: boolean | undefined;
    let shouldRebuildAttract = false;

    const activePhase = ctx.phase;
    const playerCar = this.cars.find((c) => c.isPlayer) ?? null;

    this.workerBridge.checkInitTimeout(nowMs);
    const useWorker =
      this.workerBridge.isActive(this.workerRequested) &&
      ctx.roomPeers.length <= 1 &&
      !photoActive &&
      !replayActive;

    if (activePhase !== 'title' && this.attractTransitionState !== 'idle') {
      this.attractTransitionState = 'idle';
      attractFaded = false;
    }

    if (activePhase === 'title') {
      if (useWorker) {
        this.workerBridge.applyLatestResult(this.cars, this.raceControl, this.weatherSystem);
        this.workerBridge.postStep({
          dt,
          raceElapsed: this.raceElapsed,
          countdown: 0,
          isTimedFinish: false,
          aiDifficulty: 'Alien',
          playerInput: {
            throttle: 0,
            brake: 0,
            steer: 0,
            specialPressed: false,
            specialJustPressed: false,
            shiftUp: false,
            shiftDown: false,
          },
        });
      } else {
        for (let i = 0; i < this.cars.length; i++) {
          const c = this.cars[i];
          const aiIn = computeNeuralAIControl(c, this.compiledTrack, this.cars, dt, 0, 'Alien');
          stepCarPhysics(c, aiIn, this.compiledTrack, dt, {
            trackWetness: 0,
            totalLaps: 99,
            isQualifying: false,
            allCars: this.cars,
          });
          c.surfaceType = resolveCustomWaypointSurface(
            this.compiledTrack,
            c.trackT,
            c.lateralOffset,
            c.surfaceType ?? 'asphalt',
          );
        }
        resolveCarCollisions(this.cars);
      }

      const focusLead = this.cars[0];
      if (this.attractTransitionState === 'idle' && focusLead) {
        if (focusLead.trackT >= 0.4 && focusLead.trackT <= 0.75) {
          this.attractFocusPassedHalfway = true;
        }
        if (this.attractFocusPassedHalfway && focusLead.lap >= 2) {
          this.attractTransitionState = 'fading-out';
          this.attractTransitionAt = nowMs + ATTRACT_FADE_OUT_MS;
          attractFaded = true;
        }
      } else if (this.attractTransitionState === 'fading-out' && nowMs >= this.attractTransitionAt) {
        this.attractIndex = (this.attractIndex + 1) % ATTRACT_SCENARIOS.length;
        shouldRebuildAttract = true;
        this.attractTransitionState = 'holding';
        this.attractTransitionAt = nowMs + ATTRACT_HOLD_MS;
      } else if (this.attractTransitionState === 'holding' && nowMs >= this.attractTransitionAt) {
        this.attractTransitionState = 'fading-in';
        this.attractTransitionAt = nowMs + ATTRACT_FADE_IN_MS;
        attractFaded = false;
      } else if (this.attractTransitionState === 'fading-in' && nowMs >= this.attractTransitionAt) {
        this.attractTransitionState = 'idle';
      }

      return {
        attractFaded,
        shouldRebuildAttract,
        audioEvents,
        rumbleEvents,
        ghostPose,
        hudSnapshot: null,
      };
    }

    if ((activePhase === 'playing' || activePhase === 'qualifying') && !photoActive && !replayActive) {
      const isQuali = activePhase === 'qualifying';
      const isPractice = activePhase === 'playing' && ctx.raceConfig.sessionMode === 'practice';

      if (this.loadingAssets) {
        // Hold countdown cleanly until preloaded car rigs & shaders finish compiling
      } else if (this.countdown > 0) {
        const prevCeil = Math.ceil(this.countdown);
        const countdownStep = Math.min(Math.max(rawDt, 0.001), 0.35);
        this.countdown = Math.max(0, this.countdown - countdownStep);
        const nextCeil = Math.ceil(this.countdown);
        if (nextCeil < prevCeil && nextCeil > 0) {
          audioEvents.push({ type: 'beep', freq: 520, duration: 0.12 });
        } else if (this.countdown === 0 && prevCeil > 0) {
          audioEvents.push({ type: 'beep', freq: 880, duration: 0.28 });
          this.greenFlagFlash = 1.4;
          if (this.activeStartType === 'standing' && playerCar && !isQuali && !isPractice) {
            const launchEval = evaluateStandingStartLaunch({
              rpmNormalized: playerCar.rpmNormalized,
            });
            this.launchStatus = launchEval.status;
            this.launchStatusTimer = launchEval.status === 'none' ? 0 : 3.2;
            if (launchEval.launchBoostSeconds > 0) {
              playerCar.launchBoostTimer = launchEval.launchBoostSeconds;
              this.raceControl.message = 'PERFECT LAUNCH! OPTIMAL RPM ENGAGEMENT';
              this.raceControl.messageTimer = 2.6;
            }
          }
        }
      } else if (this.greenFlagFlash > 0) {
        this.greenFlagFlash = Math.max(0, this.greenFlagFlash - dt);
      }

      if (this.launchStatusTimer > 0) {
        this.launchStatusTimer = Math.max(0, this.launchStatusTimer - dt);
        if (this.launchStatusTimer <= 0) this.launchStatus = 'none';
      }

      if (!useWorker) {
        let leaderDist = 0;
        for (let i = 0; i < this.cars.length; i++) {
          if (this.cars[i].totalDistance > leaderDist) leaderDist = this.cars[i].totalDistance;
        }
        const raceProgress =
          !isQuali && !isPractice && ctx.raceConfig.totalLaps > 0
            ? Math.max(0, Math.min(1, leaderDist / Math.max(1, ctx.raceConfig.totalLaps)))
            : undefined;
        stepWeatherSystem(
          this.weatherSystem,
          dt,
          this.compiledTrack.spec.scenery,
          this.cars.length,
          raceProgress,
        );
        this.trackWetness = this.weatherSystem.trackWetness;
      }

      if (this.countdown <= 0) {
        this.raceElapsed += dt;
        const isPracticeMode =
          ctx.raceConfig.sessionMode === 'practice' || ctx.raceConfig.sessionMode === 'time-trial';
        const isEliminationMode = ctx.raceConfig.sessionMode === 'elimination';
        const isRealRace = !isQuali && !isPracticeMode && activePhase === 'playing';
        const isTimedRace = this.raceDurationSeconds > 0;
        const raceTimeRemaining = isTimedRace
          ? Math.max(0, this.raceDurationSeconds - this.raceElapsed)
          : null;
        const isTimedFinish = isTimedRace && raceTimeRemaining !== null && raceTimeRemaining <= 0;

        if (isTimedFinish && !this.timedFinalLapAnnounced) {
          this.timedFinalLapAnnounced = true;
          this.raceControl.message = 'ENDURANCE CLOCK EXPIRED — FINAL LAP TO CHECKERED FLAG!';
          this.raceControl.messageTimer = 5.0;
        }

        if (isEliminationMode && this.elimination.active) {
          const elimRes = stepEliminationState(this.elimination, this.cars, dt);
          if (elimRes.eliminatedCar) {
            this.raceControl.message = `ELIMINATED: ${elimRes.eliminatedCar.name.toUpperCase()}!`;
            this.raceControl.messageTimer = 4.0;
            audioEvents.push({ type: 'beep', freq: 320, duration: 0.22 });
          }
          if (elimRes.winnerCar) {
            this.raceControl.message = `KNOCKOUT WINNER: ${elimRes.winnerCar.name.toUpperCase()}!`;
            this.raceControl.messageTimer = 5.0;
          }
        }

        const effectiveTotalLaps =
          isTimedRace || isEliminationMode ? 0 : ctx.raceConfig.totalLaps;

        if (useWorker) {
          if (playerCar) {
            playerCar.pitStrategy = ctx.pitStrategy;
            this.workerBridge.queueCommand({ carId: playerCar.id, pitStrategy: ctx.pitStrategy });
          }
          this.workerBridge.applyLatestResult(this.cars, this.raceControl, this.weatherSystem);
          this.trackWetness = this.weatherSystem.trackWetness;
          this.workerBridge.postStep({
            dt,
            raceElapsed: this.raceElapsed,
            countdown: this.countdown,
            isTimedFinish,
            aiDifficulty: ctx.raceConfig.aiDifficulty,
            playerInput: input,
          });
          if (playerCar) {
            telemetryRecorder.recordStep(playerCar, this.compiledTrack, this.cars, input, dt);
          }
        } else {
          stepRaceControl(this.raceControl, this.cars, this.compiledTrack, this.specialZones, dt, {
            totalLaps: effectiveTotalLaps > 0 ? effectiveTotalLaps : 99,
            isRace: isRealRace,
          });
          if (isTimedFinish) {
            this.raceControl.globalFlag = 'white';
          }

          const roadHalfW = this.compiledTrack.spec.trackWidth * 0.5;
          const dmgLvl = ctx.raceConfig.damageLevel ?? 'light';
          const absLvl = ctx.raceConfig.absLevel ?? 'low';
          const startCtx =
            !isQuali && !isPracticeMode
              ? { raceElapsed: this.raceElapsed, startType: this.activeStartType }
              : undefined;

          for (let i = 0; i < this.cars.length; i++) {
            const c = this.cars[i];
            if (c.isPlayer) {
              c.pitStrategy = ctx.pitStrategy;
              const localW = sampleLocalTrackSurfaceWeather(
                this.weatherSystem,
                c.trackT,
                c.lateralOffset,
                roadHalfW,
              );
              stepCarPhysics(c, input, this.compiledTrack, dt, {
                trackWetness: this.trackWetness,
                localWetness: localW.localWetness,
                puddleIntensity: localW.puddleIntensity,
                trackRubber: this.weatherSystem.trackRubber,
                trackTempC: localW.trackTempC,
                drsZoneEnforced: isRealRace,
                damageLevel: dmgLvl,
                absLevel: absLvl,
                totalLaps: effectiveTotalLaps,
                isQualifying: isQuali,
                isPractice: isPracticeMode,
                isTimedFinish,
                allCars: this.cars,
              });
              c.surfaceType = resolveCustomWaypointSurface(
                this.compiledTrack,
                c.trackT,
                c.lateralOffset,
                c.surfaceType ?? 'asphalt',
              );
              telemetryRecorder.recordStep(c, this.compiledTrack, this.cars, input, dt);
            } else if (c.isHumanPeer) {
              const interp = ctx.mpClient.getInterpolatedPeerState(c.id);
              if (interp) {
                c.x = interp.x;
                c.y = interp.y;
                c.z = interp.z;
                c.heading = interp.heading;
                c.speed = interp.speed;
                c.steerAngle = interp.steerAngle;
                c.lap = interp.lap;
                c.trackT = interp.trackT;
                c.totalDistance = interp.totalDistance;
                c.specialActive = interp.specialActive;
                if (interp.isGhosted) {
                  c.spawnGhostTimer = Math.max(c.spawnGhostTimer ?? 0, 0.25);
                }
              }
            } else {
              const localW = sampleLocalTrackSurfaceWeather(
                this.weatherSystem,
                c.trackT,
                c.lateralOffset,
                roadHalfW,
              );
              if (
                isRealRace &&
                !c.finished &&
                !c.aiPendingStop &&
                c.pitStopRemaining <= 0 &&
                c.pitCooldown <= 0 &&
                c.lap >= 2 &&
                (isTimedRace || effectiveTotalLaps >= 3)
              ) {
                const estRemLaps = isTimedRace
                  ? Math.max(0, (raceTimeRemaining ?? 0) / Math.max(45, c.bestLapTime ?? 75))
                  : Math.max(0, effectiveTotalLaps - c.lap + (1 - c.trackT));
                const strat = evaluateAiRaceStrategy({
                  car: c,
                  allCars: this.cars,
                  trackWetness: this.trackWetness,
                  remainingLaps: estRemLaps,
                  isTimedRace,
                  raceTimeRemainingSeconds: raceTimeRemaining,
                  damageLevel: dmgLvl,
                });
                if (strat) {
                  c.aiPendingStop = { action: strat.action, compound: strat.compound };
                  c.aiStrategyIntent = strat.reason;
                }
              }

              c.localWetness = localW.localWetness;
              c.puddleIntensity = localW.puddleIntensity;

              const aiIn = computeNeuralAIControl(
                c,
                this.compiledTrack,
                this.cars,
                dt,
                localW.localWetness,
                ctx.raceConfig.aiDifficulty,
                startCtx,
              );
              stepCarPhysics(c, aiIn, this.compiledTrack, dt, {
                trackWetness: this.trackWetness,
                localWetness: localW.localWetness,
                puddleIntensity: localW.puddleIntensity,
                trackRubber: this.weatherSystem.trackRubber,
                trackTempC: localW.trackTempC,
                drsZoneEnforced: isRealRace,
                damageLevel: dmgLvl,
                absLevel: 'low',
                totalLaps: effectiveTotalLaps,
                isQualifying: isQuali,
                isPractice: isPracticeMode,
                isTimedFinish,
                allCars: this.cars,
              });
              c.surfaceType = resolveCustomWaypointSurface(
                this.compiledTrack,
                c.trackT,
                c.lateralOffset,
                c.surfaceType ?? 'asphalt',
              );
            }
          }

          resolveCarCollisions(this.cars);
        }

        if (playerCar) {
          this.updatePlayerProgressAndRecords(playerCar, dt, ctx, audioEvents, rumbleEvents);
          const playerImpact = Math.max(
            playerCar.lastCollisionImpact ?? 0,
            playerCar.lastWallImpact ?? 0,
          );
          if (playerImpact > 5) {
            this.trauma = Math.min(1, this.trauma + playerImpact * 0.045);
            if (playerImpact > 10) this.incidentsCount += 1;
          }

          if (this.ghostTargetTime && this.ghostTargetTime > 5 && playerCar.totalDistance >= 0) {
            const pose =
              this.ghostUseSamples && this.ghostLap && this.ghostLap.samples.length >= 4
                ? sampleRecordedGhostAtTime(
                    this.ghostLap.samples,
                    this.ghostLap.lapTime,
                    playerCar.currentLapTime,
                  )
                : sampleTargetGhostAtTime(
                    this.compiledTrack,
                    this.ghostTargetTime,
                    playerCar.currentLapTime,
                  );
            if (pose) {
              ghostPose = {
                visible: true,
                x: pose.x,
                y: pose.y + 0.04,
                z: pose.z,
                heading: pose.heading,
                pitch: pose.pitch,
                roll: pose.roll,
              };
            }
          }
        }
      } else if (this.activeStartType === 'rolling') {
        if (useWorker) {
          this.workerBridge.applyLatestResult(this.cars, this.raceControl, this.weatherSystem);
          this.workerBridge.postStep({
            dt,
            raceElapsed: this.raceElapsed,
            countdown: this.countdown,
            isTimedFinish: false,
            aiDifficulty: ctx.raceConfig.aiDifficulty,
            playerInput: input,
          });
        } else {
          for (let i = 0; i < this.cars.length; i++) {
            const c = this.cars[i];
            if (c.isHumanPeer) {
              const pkt = ctx.mpClient.peerTelemetry.get(c.id);
              if (pkt) {
                c.x += (pkt.x - c.x) * Math.min(1, dt * 15);
                c.y += (pkt.y - c.y) * Math.min(1, dt * 15);
                c.z += (pkt.z - c.z) * Math.min(1, dt * 15);
                c.heading = pkt.heading;
                c.speed = pkt.speed;
                c.steerAngle = pkt.steerAngle;
                c.lap = pkt.lap;
                c.trackT = pkt.trackT;
                c.totalDistance = pkt.totalDistance;
                c.specialActive = pkt.specialActive;
              }
              continue;
            }
            const laneLat = this.rollingFormationLanes.get(c.id);
            const formCtrl = computeRollingFormationControl(
              c,
              this.compiledTrack,
              this.cars,
              this.rollingFormationSpeed,
              laneLat,
            );
            const appliedInput = c.isPlayer
              ? {
                  steer: Math.max(-1, Math.min(1, formCtrl.steer * 0.78 + input.steer * 0.22)),
                  throttle: formCtrl.throttle,
                  brake: formCtrl.brake,
                  specialPressed: false,
                }
              : formCtrl;
            stepCarPhysics(c, appliedInput, this.compiledTrack, dt, {
              trackWetness: this.trackWetness,
              totalLaps: ctx.raceConfig.totalLaps,
              isQualifying: isQuali,
              isPractice,
              allCars: this.cars,
            });
          }
        }
      } else if (playerCar) {
        const targetGridRpm = input.throttle > 0.05 ? Math.min(1.0, 0.18 + input.throttle * 0.84) : 0.18;
        const rate = input.throttle > 0.05 ? 4.5 : 3.0;
        playerCar.rpmNormalized =
          playerCar.rpmNormalized < targetGridRpm
            ? Math.min(targetGridRpm, playerCar.rpmNormalized + dt * rate)
            : Math.max(targetGridRpm, playerCar.rpmNormalized - dt * rate);
      }

      if (playerCar && ctx.mpClient.room && nowMs - this.lastTelemetryTime > 50) {
        this.lastTelemetryTime = nowMs;
        ctx.mpClient.sendTelemetry({
          x: playerCar.x,
          y: playerCar.y,
          z: playerCar.z,
          heading: playerCar.heading,
          speed: playerCar.speed,
          steerAngle: playerCar.steerAngle,
          lap: playerCar.lap,
          trackT: playerCar.trackT,
          totalDistance: playerCar.totalDistance,
          specialActive: playerCar.specialActive,
        });
      }

      if (!photoActive && !replayActive && this.timeScale > 1) {
        this.timeOfDayHours = (this.timeOfDayHours + (dt * this.timeScale) / 3600) % 24;
      }

      if (!replayActive && !photoActive) {
        this.replayRecorder.recordStep(dt, this.raceElapsed, this.cars);
      }
    }

    let hudSnapshot: HudSnapshot | null = null;
    let qualifyingFinish: { qualiTime: number; gridPos: number } | undefined;
    let raceFinish: HudSnapshot | undefined;

    const isAiRaceHud = activePhase === 'playing' && ctx.raceConfig.sessionMode === 'ai-race';
    const hudFocusCar =
      playerCar ??
      (isAiRaceHud ? this.cars.find((c) => c.id === this.spectatedCarId) ?? this.cars[0] ?? null : null);

    if ((activePhase === 'playing' || activePhase === 'qualifying') && hudFocusCar && nowMs - this.lastHudTime > 80) {
      this.lastHudTime = nowMs;
      hudSnapshot = this.buildHudSnapshot(
        hudFocusCar,
        playerCar,
        ctx,
        fpsSmoothed,
        isAiRaceHud,
        spectatorCameraMode,
      );

      const isElimHud = ctx.raceConfig.sessionMode === 'elimination';
      const shouldFinish = isAiRaceHud
        ? this.cars.length > 0 && this.cars.every((c) => c.finished)
        : isElimHud
        ? Boolean(playerCar?.finished || playerCar?.eliminated)
        : Boolean(playerCar?.finished);

      if (shouldFinish && !this.finishEmitted) {
        this.finishEmitted = true;
        if (activePhase === 'qualifying' && playerCar) {
          const qTime = playerCar.bestLapTime ?? playerCar.lastLapTime ?? 38.5;
          const targetLap =
            this.compiledTrack.spec.targetLapSeconds /
            CAR_CLASSES[playerCar.carSpec.classId].basePaceIndex;
          const ratio = qTime / targetLap;
          const gridSize = Math.max(4, ctx.raceConfig.gridSize);
          const gridPos = Math.max(
            1,
            Math.min(gridSize, Math.round((ratio - 0.92) * gridSize * 3.5) + 1),
          );
          this.qualiTime = qTime;
          this.qualiGridPos = gridPos;
          qualifyingFinish = { qualiTime: qTime, gridPos };
        } else {
          raceFinish = hudSnapshot;
        }
      }
    }

    return {
      attractFaded,
      shouldRebuildAttract,
      audioEvents,
      rumbleEvents,
      ghostPose,
      hudSnapshot,
      qualifyingFinish,
      raceFinish,
    };
  }

  private updatePlayerProgressAndRecords(
    playerCar: CarSimState,
    dt: number,
    ctx: SimSessionContext,
    audioEvents: SimAudioEvent[],
    rumbleEvents: SimRumbleEvent[],
  ): void {
    const curKmh = playerCar.speed * SPEED_KMH_FACTOR;
    if (curKmh > this.playerTopSpeedKmh) this.playerTopSpeedKmh = curKmh;

    if (
      playerCar.currentLapTime >= 0 &&
      playerCar.totalDistance >= 0 &&
      (this.lastGhostSampleTime < 0 || playerCar.currentLapTime - this.lastGhostSampleTime >= 0.1)
    ) {
      this.lastGhostSampleTime = playerCar.currentLapTime;
      this.currentLapGhostSamples.push({
        time: playerCar.currentLapTime,
        trackT: playerCar.trackT,
        x: playerCar.x,
        y: playerCar.y,
        z: playerCar.z,
        heading: playerCar.heading,
        pitch: playerCar.pitch ?? 0,
        roll: playerCar.roll ?? 0,
      });
    }

    const completedLapDetected =
      (playerCar.lap > this.lastRecordedLapCount ||
        (playerCar.finished &&
          this.lastRecordedLapCount <= playerCar.lap &&
          playerCar.lastLapTime !== null)) &&
      playerCar.lastLapTime !== null &&
      playerCar.lastLapTime > 5;

    if (completedLapDetected && playerCar.lastLapTime !== null) {
      const isCleanLap = playerCar.warningCount <= this.lapStartWarnings;
      if (isCleanLap) this.cleanLapsCount += 1;
      this.lapStartWarnings = playerCar.warningCount;
      this.lastRecordedLapCount = playerCar.lap + (playerCar.finished ? 1 : 0);

      const pbRes = savePersonalRecordLap({
        track: this.compiledTrack.spec,
        carId: playerCar.carSpec.id,
        classId: playerCar.carSpec.classId,
        lapTime: playerCar.lastLapTime,
        sectors: playerCar.lastLapSectorTimes ?? [null, null, null],
        topSpeedKmh: this.playerTopSpeedKmh,
        compound: playerCar.compound,
      });

      if (pbRes.isNewBest && this.currentLapGhostSamples.length >= 6) {
        const newGhost: StoredGhostLap = {
          trackId: this.compiledTrack.spec.id,
          carId: playerCar.carSpec.id,
          lapTime: playerCar.lastLapTime,
          updatedAt: Date.now(),
          samples: this.currentLapGhostSamples,
        };
        saveGhostLap(newGhost);
        this.ghostLap = newGhost;
        if (
          (ctx.raceConfig.ghostMode ??
            (ctx.raceConfig.sessionMode === 'time-trial' ? 'personal-best' : 'off')) ===
          'personal-best'
        ) {
          this.ghostLabel = 'PB Ghost';
          this.ghostTargetTime = newGhost.lapTime;
          this.ghostUseSamples = true;
        }
      }
      if (ctx.raceConfig.dailyChallengeDate) {
        recordDailyChallengeLap(
          ctx.raceConfig.dailyChallengeDate,
          playerCar.lastLapTime,
          this.playerTopSpeedKmh,
        );
      }
      const curStandings = computeStandings(this.cars, this.compiledTrack);
      const pStanding = curStandings.find((s) => s.id === playerCar.id);
      if (pStanding) {
        this.lapPositionHistory.push({
          lap: Math.max(1, playerCar.lap - 1),
          position: pStanding.position,
        });
      }
      if (pbRes.isNewBest) {
        this.replayRecorder.addBookmark({
          time: this.raceElapsed,
          type: 'fastest-lap',
          label: `Fastest Lap ${playerCar.lastLapTime.toFixed(2)}s`,
        });
      }
      this.currentLapGhostSamples = [];
      this.lastGhostSampleTime = -1;
    } else if (playerCar.currentLapTime < this.lastGhostSampleTime - 1) {
      this.currentLapGhostSamples = [];
      this.lastGhostSampleTime = -1;
    }

    if (tryStepMecachromeEvent(playerCar, dt)) {
      this.raceControl.message = 'ENGINE FAILURE! NO POWER — GETTING MECACHROMED!';
      this.raceControl.messageTimer = 4.5;
      audioEvents.push({ type: 'impact', intensity: 0.75, kind: 'car' });
      rumbleEvents.push({ weak: 0.85, strong: 0.7, durationMs: 360 });
    }
  }

  public buildHudSnapshot(
    hudFocusCar: CarSimState,
    playerCar: CarSimState | null,
    ctx: SimSessionContext,
    fpsSmoothed: number,
    isAiRaceHud: boolean,
    spectatorCameraMode?: SpectatorCameraMode,
  ): HudSnapshot {
    const standings = computeStandings(this.cars, this.compiledTrack);
    const focusStanding = standings.find((s) => s.id === hudFocusCar.id) ?? standings[0];
    const pIdx = standings.findIndex((s) => s.id === hudFocusCar.id);
    const behind = pIdx >= 0 && pIdx + 1 < standings.length ? standings[pIdx + 1] : null;
    const classCars = standings.filter((s) => s.classId === hudFocusCar.carSpec.classId).length;
    const speedKmh = Math.round(hudFocusCar.speed * SPEED_KMH_FACTOR);

    if (playerCar && this.countdown <= 0 && !isAiRaceHud) {
      if (this.prevPlayerRank !== null && focusStanding.position < this.prevPlayerRank) {
        this.overtakesCount += this.prevPlayerRank - focusStanding.position;
      }
      this.prevPlayerRank = focusStanding.position;
    }

    const sessionBestSectors: [number | null, number | null, number | null] = [null, null, null];
    for (let ci = 0; ci < this.cars.length; ci++) {
      const bs = this.cars[ci].bestSectorTimes;
      if (!bs) continue;
      for (let s = 0; s < 3; s++) {
        const v = bs[s];
        if (v !== null && (sessionBestSectors[s] === null || v < sessionBestSectors[s]!)) {
          sessionBestSectors[s] = v;
        }
      }
    }

    const proximityCars: ProximityCarIndicator[] = [];
    if (!isAiRaceHud && playerCar) {
      const sinH = Math.sin(playerCar.heading);
      const cosH = Math.cos(playerCar.heading);
      for (let ci = 0; ci < this.cars.length; ci++) {
        const other = this.cars[ci];
        if (other.id === playerCar.id || other.eliminated) continue;
        const wx = other.x - playerCar.x;
        const wz = other.z - playerCar.z;
        if (wx * wx + wz * wz > 18 * 18) continue;
        const dz = wx * sinH + wz * cosH;
        const dx = -wx * cosH + wz * sinH;
        proximityCars.push({
          id: other.id,
          dx: Number(dx.toFixed(2)),
          dz: Number(dz.toFixed(2)),
          classId: other.carSpec.classId,
          isHumanPeer: other.isHumanPeer,
        });
      }
    }

    const liveDeltaSeconds =
      !isAiRaceHud && playerCar && playerCar.totalDistance >= 0
        ? computeLiveDeltaSeconds({
            currentTrackT: playerCar.trackT,
            currentLapTime: playerCar.currentLapTime,
            referenceSamples: this.ghostUseSamples ? this.ghostLap?.samples : null,
            referenceLapTime: this.ghostTargetTime ?? playerCar.bestLapTime,
          })
        : null;

    const activeScenario = getScenarioById(ctx.raceConfig.scenarioId ?? ctx.raceConfig.licenseId);
    const raceTimeRemainingHud =
      this.raceDurationSeconds > 0
        ? Math.max(0, this.raceDurationSeconds - this.raceElapsed)
        : null;

    let leftNear = false;
    let rightNear = false;
    let rearGapM: number | null = null;
    let rearClosingKmh = 0;
    let rearLatM = 0;
    if (playerCar && !isAiRaceHud) {
      const sinH = Math.sin(playerCar.heading);
      const cosH = Math.cos(playerCar.heading);
      for (const other of this.cars) {
        if (other.id === playerCar.id) continue;
        const dx = other.x - playerCar.x;
        const dz = other.z - playerCar.z;
        const fwd = dx * sinH + dz * cosH;
        const lat = dx * cosH - dz * sinH;
        if (Math.abs(fwd) < 5.5 && Math.abs(lat) < 4.2) {
          if (lat < 0) leftNear = true;
          else rightNear = true;
        }
        if (fwd < -2.2 && fwd > -34 && Math.abs(lat) < 6.5) {
          const g = Math.abs(fwd);
          if (rearGapM === null || g < rearGapM) {
            rearGapM = Number(g.toFixed(1));
            rearClosingKmh = Math.round((other.speed - playerCar.speed) * SPEED_KMH_FACTOR);
            rearLatM = Number(lat.toFixed(1));
          }
        }
      }
    }
    const blindSpot: BlindSpotStatus =
      leftNear && rightNear ? 'both' : leftNear ? 'left' : rightNear ? 'right' : 'clear';
    const radioSpoken =
      playerCar && !isAiRaceHud
        ? this.raceRadio.step({
            raceTime: this.raceElapsed,
            lap: playerCar.lap,
            totalLaps: ctx.raceConfig.totalLaps,
            blindSpot,
            blueFlagActive: Boolean(playerCar.blueFlagActive),
            trackWetness: this.trackWetness,
            compound: playerCar.compound,
            fuelLapsRemaining: playerCar.fuelLapsRemaining,
            mecachromeActive: Boolean(playerCar.mecachromeActive),
          })
        : null;
    if (radioSpoken) {
      this.lastRadioMessage = {
        id: `rad-${Math.round(this.raceElapsed * 10)}`,
        sender:
          radioSpoken.includes('LEFT') || radioSpoken.includes('RIGHT') || radioSpoken.includes('WIDE')
            ? 'SPOTTER'
            : 'ENGINEER',
        text: radioSpoken,
        priority: playerCar?.mecachromeActive ? 'high' : 'medium',
        timestamp: Date.now(),
      };
    }
    const activeSub = this.raceRadio.getSubtitle(this.raceElapsed);

    // Serveable heavy penalty ('drive-through' | 'stop-and-go') HUD telemetry
    const heavyPenalty = this.raceControl.heavyPenaltyByCarId.get(hudFocusCar.id);
    const activePenaltyType = hudFocusCar.penaltyType ?? heavyPenalty?.penaltyType ?? null;
    const isHeavyPenalty =
      activePenaltyType === 'drive-through' || activePenaltyType === 'stop-and-go';
    const roadHalfW = this.compiledTrack.spec.trackWidth * 0.5;
    const penaltyServeProgress = isHeavyPenalty
      ? heavyPenalty?.holdProgress ?? hudFocusCar.heavyPenaltyHoldProgress ?? 0
      : undefined;
    const penaltyServeRequired = isHeavyPenalty
      ? heavyPenalty?.requiredHoldSeconds ??
        (activePenaltyType === 'stop-and-go'
          ? STOP_AND_GO_HOLD_SECONDS
          : DRIVE_THROUGH_HOLD_SECONDS)
      : undefined;
    const penaltyDeadlineLap = isHeavyPenalty
      ? heavyPenalty?.deadlineLap ?? hudFocusCar.heavyPenaltyDeadlineLap ?? null
      : null;
    const penaltyServeInstruction = isHeavyPenalty
      ? evaluateOnTrackPenaltyServe({
          penaltyType: activePenaltyType,
          speedMs: hudFocusCar.speed,
          lateralOffset: hudFocusCar.lateralOffset,
          trackHalfWidth: roadHalfW,
          holdProgressSeconds: penaltyServeProgress ?? 0,
          dt: 0,
        }).instruction
      : null;

    // Safety Car & VSC HUD telemetry
    const sc = this.raceControl.safetyCar;
    const rawCapMs =
      hudFocusCar.neutralizationSpeedCapMs ?? this.raceControl.neutralizationSpeedCapMs ?? sc.speedCapMs;
    const neutralizationSpeedCapKmh =
      typeof rawCapMs === 'number' && Number.isFinite(rawCapMs) && rawCapMs > 0
        ? Math.round(rawCapMs * SPEED_KMH_FACTOR)
        : null;

    return {
      phase: ctx.phase,
      countdown: this.countdown,
      startType: this.activeStartType,
      greenFlagFlash: this.greenFlagFlash,
      speedKmh,
      gear: hudFocusCar.gear,
      rpmNormalized: hudFocusCar.rpmNormalized,
      lap: hudFocusCar.lap,
      totalLaps: ctx.phase === 'qualifying' ? 1 : ctx.raceConfig.totalLaps,
      position: focusStanding.position,
      totalCars: standings.length,
      classPosition: focusStanding.classPosition,
      classCars,
      currentLapTime: hudFocusCar.currentLapTime,
      bestLapTime: hudFocusCar.bestLapTime,
      lastLapTime: hudFocusCar.lastLapTime,
      liveDeltaSeconds,
      ghostLabel: this.ghostLabel,
      intervalAhead: pIdx > 0 ? focusStanding.intervalToAhead : null,
      intervalBehind: behind ? behind.intervalToAhead : null,
      tireWear: Math.round(hudFocusCar.tireWear),
      tireTemp: Math.round(hudFocusCar.tireTemp),
      compound: hudFocusCar.compound,
      fuel: Math.round(hudFocusCar.fuel),
      fuelCapacityLiters: getClassFuelCapacityLiters(hudFocusCar.carSpec.classId),
      fuelLiters: Number(
        ((hudFocusCar.fuel / 100) * getClassFuelCapacityLiters(hudFocusCar.carSpec.classId)).toFixed(1),
      ),
      fuelLapsRemaining: hudFocusCar.fuelLapsRemaining,
      attackModeUsesRemaining: hudFocusCar.attackModeUsesRemaining,
      attackModeTimer: hudFocusCar.attackModeTimer,
      aeroDamage: Math.round(hudFocusCar.aeroDamage),
      specialCharge: Math.round(hudFocusCar.specialCharge),
      specialActive: hudFocusCar.specialActive,
      inSlipstream: hudFocusCar.inSlipstream,
      trackWetness: this.trackWetness,
      rainIntensity: this.weatherSystem.rainIntensity,
      warningCount: hudFocusCar.warningCount,
      penaltyTimeRemaining: hudFocusCar.penaltyTimeRemaining,
      isStoppedOnTrack: !isAiRaceHud && hudFocusCar.speed < 1.5 && !hudFocusCar.finished,
      pitStopRemaining: hudFocusCar.pitStopRemaining,
      pitStopTotal: hudFocusCar.pitStopTotal,
      pitActiveTask: hudFocusCar.pitActiveTask,
      pitQueue: [...hudFocusCar.pitQueue],
      pitStrategy: hudFocusCar.pitStrategy,
      cameraMode: ctx.cameraMode,
      standings,
      minimapDots: this.cars.map((c) => ({
        id: c.id,
        x: c.x,
        z: c.z,
        classId: c.carSpec.classId,
        isPlayer: isAiRaceHud ? c.id === hudFocusCar.id : c.isPlayer,
        isHumanPeer: c.isHumanPeer,
      })),
      proximityCars,
      qualiResultTime: this.qualiTime,
      qualiGridPos: this.qualiGridPos,
      sessionMode: ctx.raceConfig.sessionMode ?? 'race',
      spectatorCameraMode: isAiRaceHud ? spectatorCameraMode : undefined,
      spectatedCarId: isAiRaceHud ? hudFocusCar.id : undefined,
      spectatedDriverName: isAiRaceHud ? hudFocusCar.name : undefined,
      spectatedCarName: isAiRaceHud ? hudFocusCar.carSpec.name : undefined,
      currentSector: hudFocusCar.currentSector ?? 1,
      sectorTimes: hudFocusCar.sectorTimes ? [...hudFocusCar.sectorTimes] : [null, null, null],
      bestSectorTimes: hudFocusCar.bestSectorTimes
        ? [...hudFocusCar.bestSectorTimes]
        : [null, null, null],
      sessionBestSectorTimes: sessionBestSectors,
      lastLapSectorTimes: hudFocusCar.lastLapSectorTimes
        ? [...hudFocusCar.lastLapSectorTimes]
        : [null, null, null],
      raceFlag: this.raceControl.globalFlag,
      sectorFlags: [...this.raceControl.sectorFlags] as [
        'green' | 'yellow',
        'green' | 'yellow',
        'green' | 'yellow',
      ],
      yellowSectors: [
        this.raceControl.sectorFlags[0] === 'yellow',
        this.raceControl.sectorFlags[1] === 'yellow',
        this.raceControl.sectorFlags[2] === 'yellow',
      ],
      inYellowMicrosector: isCarInYellowMicrosector(this.raceControl, hudFocusCar.trackT),
      yellowYieldTargetName:
        this.raceControl.yellowYieldByCarId.get(hudFocusCar.id)?.targetName ?? null,
      yellowYieldPositions:
        this.raceControl.yellowYieldByCarId.get(hudFocusCar.id)?.positionsToYield ?? 0,
      blueFlagActive: Boolean(hudFocusCar.blueFlagActive),
      raceControlMessage: this.raceControl.message,
      safetyCarActive: sc.active,
      safetyCarPhase: sc.phase,
      safetyCarTrackT: sc.trackT,
      safetyCarSpeedKmh: Math.round(sc.speedMs * SPEED_KMH_FACTOR),
      vscActive: sc.phase === 'vsc',
      neutralizationSpeedCapKmh,
      postRacePenaltySeconds: hudFocusCar.postRacePenaltySeconds ?? 0,
      penaltyReason: hudFocusCar.penaltyReason ?? null,
      penaltyType: activePenaltyType,
      penaltyServeProgress,
      penaltyServeRequired,
      penaltyDeadlineLap,
      penaltyServeInstruction,
      launchStatus: this.launchStatus,
      launchRpmSweetSpot: LAUNCH_RPM_SWEET_SPOT,
      hasErs: carHasHybridErs(hudFocusCar.carSpec),
      ersBattery: Math.round(hudFocusCar.ersBattery ?? 0),
      ersMode: hudFocusCar.ersMode ?? 'balanced',
      transmissionMode: hudFocusCar.transmissionMode ?? 'auto',
      drsEligible: Boolean(hudFocusCar.drsEligible),
      inDrsZone: Boolean(hudFocusCar.inDrsZone),
      inAttackModeZone: Boolean(hudFocusCar.inAttackModeZone),
      weatherCondition: this.weatherSystem.condition,
      weatherNextLabel: this.weatherSystem.nextForecastLabel,
      ambientTempC: Math.round(this.weatherSystem.ambientTempC),
      trackTempC: Math.round(this.weatherSystem.trackTempC),
      trackRubber: this.weatherSystem.trackRubber,
      racingLineWetness: this.weatherSystem.racingLineWetness,
      offLineWetness: this.weatherSystem.offLineWetness,
      tires: hudFocusCar.tires
        ? {
            fl: { ...hudFocusCar.tires.fl },
            fr: { ...hudFocusCar.tires.fr },
            rl: { ...hudFocusCar.tires.rl },
            rr: { ...hudFocusCar.tires.rr },
          }
        : undefined,
      brakeTempFront: Math.round(hudFocusCar.brakeTempFront ?? 280),
      brakeTempRear: Math.round(hudFocusCar.brakeTempRear ?? 250),
      brakeFade: hudFocusCar.brakeFade ?? 0,
      brakeLockup: hudFocusCar.brakeLockupIntensity ?? 0,
      brakeBalance: hudFocusCar.setup?.brakeBalance ?? DEFAULT_CAR_SETUP.brakeBalance,
      dirtyAirStrength: hudFocusCar.dirtyAirStrength ?? 0,
      surfaceType: hudFocusCar.surfaceType ?? 'asphalt',
      crestLoadFactor: hudFocusCar.crestLoadFactor ?? 1,
      damage: hudFocusCar.damage ? { ...hudFocusCar.damage } : undefined,
      damageLevel: ctx.raceConfig.damageLevel ?? 'light',
      raceDurationSeconds: this.raceDurationSeconds,
      raceTimeRemaining: raceTimeRemainingHud,
      eliminationCountdown: this.elimination.active ? Math.max(0, this.elimination.countdown) : null,
      eliminatedCarIds: this.elimination.active
        ? Array.from(this.elimination.eliminatedIds)
        : undefined,
      eliminated: Boolean(hudFocusCar.eliminated),
      scenarioTitle: activeScenario ? `${activeScenario.code}: ${activeScenario.title}` : null,
      scenarioObjective: activeScenario ? activeScenario.objectiveLabel : null,
      topSpeedKmh: Math.round(this.playerTopSpeedKmh),
      overtakesCount: this.overtakesCount,
      cleanLapsCount: this.cleanLapsCount,
      incidentsCount: this.incidentsCount,
      managedAiCarId: isAiRaceHud ? hudFocusCar.id : null,
      aiPaceOrder: hudFocusCar.aiPaceOrder ?? 'balanced',
      weekendStage: ctx.raceConfig.weekendStage,
      aiNeuralTelemetry: (() => {
        if (!hudFocusCar.isPlayer && !hudFocusCar.isHumanPeer && hudFocusCar.aiLastTelemetry) {
          return hudFocusCar.aiLastTelemetry;
        }
        let nearestAi: CarSimState | null = null;
        let bestDist = Infinity;
        for (const c of this.cars) {
          if (c.isPlayer || c.isHumanPeer || !c.aiLastTelemetry) continue;
          const d = Math.hypot(c.x - hudFocusCar.x, c.z - hudFocusCar.z);
          if (d < bestDist) {
            bestDist = d;
            nearestAi = c;
          }
        }
        return nearestAi?.aiLastTelemetry ?? null;
      })(),
      tcLevel: hudFocusCar.tcLevel ?? 0,
      tcIntervening: Boolean(hudFocusCar.tcIntervening),
      stabilityIntervening: Boolean(hudFocusCar.stabilityIntervening),
      throttleInput: hudFocusCar.lastInputThrottle ?? 0,
      brakeInput: hudFocusCar.lastInputBrake ?? 0,
      steerInput: hudFocusCar.lastInputSteer ?? 0,
      playerHeading: hudFocusCar.heading,
      blindSpot,
      rearCarGapM: rearGapM,
      rearCarClosingKmh: rearClosingKmh,
      rearCarLateralM: rearLatM,
      radioMessage: activeSub ? this.lastRadioMessage : null,
      upcomingCorner: computeUpcomingCornerInfo(
        this.compiledTrack,
        hudFocusCar.trackT,
        hudFocusCar.speed,
      ),
      mecachromeWarning: Boolean(hudFocusCar.mecachromeActive),
      mecachromeRemaining: Number((hudFocusCar.mecachromeTimer ?? 0).toFixed(1)),
      fps: Math.round(fpsSmoothed),
      timeOfDayHours: this.timeOfDayHours,
      lapPositionHistory: [...this.lapPositionHistory],
      replayAvailable: this.replayRecorder.hasFrames(),
      flashbackAvailable:
        this.replayRecorder.canFlashback() &&
        ctx.roomPeers.length <= 1 &&
        ctx.raceConfig.sessionMode !== 'ai-race',
    };
  }

  public dispose(): void {
    this.workerBridge.dispose();
  }
}
