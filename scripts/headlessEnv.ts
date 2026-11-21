import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import type { CarSimState, ControlInput } from '../src/game/physics';
import type { CompiledTrack } from '../src/game/tracks';

// Ensure no imported module logs (e.g. console.info('[AI Policy]', ...)) pollute JSON-RPC stdout
const redirectToStderr = (...args: unknown[]) => {
  console.error(...args);
};
console.log = redirectToStderr;
console.info = redirectToStderr;
console.debug = redirectToStderr;

import type { PolicyObsConfig, PolicyWeights } from '../src/game/aiNeuralPolicy';

const { createCarSimState, resolveCarCollisions, resolveWallContact, stepCarPhysics } = await import('../src/game/physics');
const {
  buildObservationVector,
  decodePolicyWeightsBinary,
  evaluateNeuralPolicy,
  validatePolicyWeights,
} = await import('../src/game/aiNeuralPolicy');
const { compileTrack, sampleTrackAtT, TRACKS } = await import('../src/game/tracks');
const { CARS, getAllSelectableCars } = await import('../src/game/cars');

type MlpWeights = PolicyWeights;

export interface RewardWeights {
  forwardProgress: number;
  closeProximity: number;
  minSpeedThreshold: number;
  minSpeedPenalty: number;
  floorSpeedThreshold: number;
  floorSpeedPenalty: number;
  offTrackBase: number;
  offTrackSlope: number;
  steerJerk: number;
  throttleBrakeOverlap: number;
  carCrash: number;
  wallCrash: number;
  decelThreshold: number;
  decelPenalty: number;
  stallStopSpeed: number;
  ttcPenalty?: number;
  wallScrapeBase?: number;
  wallScrapeDamageScale?: number;
  wallScrapeCap?: number;
  maxWallScrapes?: number;
  lapCompletionBonus?: number;
  cornerSurvivalBonus?: number;
  cleanOvertakeBonus?: number;
  ghostOverlapPenalty?: number;
  bumpDraftBonus?: number;
  launchAccelBonus?: number;
  alternateLineOvertakeBonus?: number;
}

export interface TrafficMix {
  soloRatio: number;
  scriptedRatio: number;
  selfplayRatio: number;
}

export interface EnvOptions {
  brakingZoneSpawnRatio: number;
  tightPackRatio: number;
  technicalTrackBoost: number;
  trackWeights: Record<string, number>;
  spawnGhostSeconds: number;
  enableCarPhysicsCollisions: boolean;
  startScenarioRatio: number;
  rollingStartRatio: number;
  maxEpisodeSteps: number;
  multiLineTrafficRatio: number;
}

const DEFAULT_REWARD_WEIGHTS: RewardWeights = {
  forwardProgress: 0.45,
  closeProximity: 0.06,
  minSpeedThreshold: 15.0,
  minSpeedPenalty: 0.08,
  floorSpeedThreshold: 25.0 / 3.6,
  floorSpeedPenalty: 0.0,
  offTrackBase: 1.2,
  offTrackSlope: 0.35,
  steerJerk: 0.06,
  throttleBrakeOverlap: 0.15,
  carCrash: 4.5,
  wallCrash: 5.0,
  decelThreshold: 0.45,
  decelPenalty: 0.0,
  stallStopSpeed: 2.0,
  ttcPenalty: 0.0,
  wallScrapeBase: 0.15,
  wallScrapeDamageScale: 0.4,
  wallScrapeCap: 2.0,
  maxWallScrapes: 6,
  lapCompletionBonus: 0.0,
  cornerSurvivalBonus: 0.0,
  cleanOvertakeBonus: 0.0,
  ghostOverlapPenalty: 0.0,
  bumpDraftBonus: 0.0,
  launchAccelBonus: 0.0,
  alternateLineOvertakeBonus: 0.0,
};

const DEFAULT_TRAFFIC_MIX: TrafficMix = {
  soloRatio: 0.3,
  scriptedRatio: 0.3,
  selfplayRatio: 0.4,
};

const DEFAULT_ENV_OPTIONS: EnvOptions = {
  brakingZoneSpawnRatio: 0.0,
  tightPackRatio: 0.35,
  technicalTrackBoost: 0.0,
  trackWeights: {},
  spawnGhostSeconds: 0.0,
  enableCarPhysicsCollisions: false,
  startScenarioRatio: 0.0,
  rollingStartRatio: 0.45,
  maxEpisodeSteps: 0,
  multiLineTrafficRatio: 0.0,
};

interface TrafficBot {
  car: CarSimState;
  mode: 'scripted' | 'neural';
  policy: MlpWeights | null;
  targetLaneRatio: number; // -0.55..0.55 of half-width
  paceScale: number; // 0.65..0.92 speed multiplier (scripted) or subtle throttle scale (neural)
  prevSignedDist: number;
}

interface EnvSlot {
  car: CarSimState;
  carId: string;
  carClass: string;
  traffic: TrafficBot[];
  allCars: CarSimState[];
  track: CompiledTrack;
  prevTrackT: number;
  prevAeroDamage: number;
  prevSteer: number;
  prevSpeed: number;
  stepsInEpisode: number;
  lapsCompleted: number;
  consecutiveWallSteps: number;
  wallScrapes: number;
  prevLat: number;
  consecutiveOffTrackSteps: number;
  consecutiveStallSteps: number;
  spawnGhostDuration: number;
}

const DEFAULT_CARS: string[] = CARS.map((c: any) => c.id);

const WEIGHTS_PATH = path.resolve(process.cwd(), 'src/game/aiPolicyWeights.json');
const POOL_DIR = path.resolve(process.cwd(), 'audit/selfplay_pool');

let rewardWeights: RewardWeights = { ...DEFAULT_REWARD_WEIGHTS };
let trafficMix: TrafficMix = { ...DEFAULT_TRAFFIC_MIX };
let envOptions: EnvOptions = { ...DEFAULT_ENV_OPTIONS, trackWeights: {} };
let activeObsConfig: PolicyObsConfig | undefined = undefined;
let activeWeightsPath = WEIGHTS_PATH;
let activePoolDir = POOL_DIR;

let policyPool: MlpWeights[] = [];
let resetCounter = 0;

function parsePolicyWeights(raw: any): MlpWeights | null {
  if (!raw || typeof raw !== 'object') return null;
  const validated = validatePolicyWeights(raw);
  if (validated) return validated;
  const version = typeof raw.version === 'number' ? raw.version : undefined;
  // Fallback for 1-indexed keys
  if (raw.w1 && raw.b1 && raw.w2 && raw.b2 && raw.w3 && raw.b3) {
    return validatePolicyWeights({
      version,
      obsDim: raw.obsDim ?? 43,
      actDim: raw.actDim ?? 3,
      w0: raw.w1,
      b0: raw.b1,
      w1: raw.w2,
      b1: raw.b2,
      w2: raw.w3,
      b2: raw.b3,
    });
  }
  if (Array.isArray(raw.layers) && raw.layers.length >= 3) {
    const [l1, l2, l3] = raw.layers;
    return validatePolicyWeights({
      version,
      obsDim: raw.obsDim ?? 43,
      actDim: raw.actDim ?? 3,
      w0: l1.w ?? l1.weights,
      b0: l1.b ?? l1.biases,
      w1: l2.w ?? l2.weights,
      b1: l2.b ?? l2.biases,
      w2: l3.w ?? l3.weights,
      b2: l3.b ?? l3.biases,
    });
  }
  return null;
}

function loadPolicyFile(filePath: string): MlpWeights | null {
  if (!fs.existsSync(filePath)) return null;
  if (filePath.endsWith('.bin')) {
    const buf = fs.readFileSync(filePath);
    return decodePolicyWeightsBinary(buf);
  }
  return parsePolicyWeights(JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

function refreshPolicyPool(): void {
  const loaded: MlpWeights[] = [];

  // 1. Always try to load the latest active weights (.bin or .json)
  try {
    const parsed = loadPolicyFile(activeWeightsPath);
    if (parsed) loaded.push(parsed);
  } catch {
    // Ignore transient read errors if trainPPO.py is mid-write
  }

  // 2. Also load up to 6 recent historical snapshots from the active selfplay pool directory
  try {
    if (fs.existsSync(activePoolDir)) {
      const files = fs
        .readdirSync(activePoolDir)
        .filter((f) => f.endsWith('.json') || f.endsWith('.bin'))
        .sort()
        .slice(-6);
      for (const file of files) {
        try {
          const parsed = loadPolicyFile(path.join(activePoolDir, file));
          if (parsed) loaded.push(parsed);
        } catch {
          // Skip unreadable snapshot
        }
      }
    }
  } catch {
    // Ignore if pool directory doesn't exist
  }

  if (loaded.length > 0) {
    policyPool = loaded;
  }
}

function applyConfigPatch(msg: Record<string, any>, resetDefaults: boolean): void {
  if (resetDefaults) {
    rewardWeights = { ...DEFAULT_REWARD_WEIGHTS };
    trafficMix = { ...DEFAULT_TRAFFIC_MIX };
    envOptions = { ...DEFAULT_ENV_OPTIONS, trackWeights: {} };
    activeObsConfig = undefined;
    activeWeightsPath = WEIGHTS_PATH;
    activePoolDir = POOL_DIR;
  }

  if (msg.rewardWeights && typeof msg.rewardWeights === 'object') {
    for (const key of Object.keys(DEFAULT_REWARD_WEIGHTS) as (keyof RewardWeights)[]) {
      const val = msg.rewardWeights[key];
      if (typeof val === 'number' && Number.isFinite(val)) {
        rewardWeights[key] = val;
      }
    }
  }

  if (msg.trafficMix && typeof msg.trafficMix === 'object') {
    const nextSolo =
      typeof msg.trafficMix.soloRatio === 'number' && Number.isFinite(msg.trafficMix.soloRatio)
        ? Math.max(0, Math.min(1, msg.trafficMix.soloRatio))
        : trafficMix.soloRatio;
    const nextScripted =
      typeof msg.trafficMix.scriptedRatio === 'number' && Number.isFinite(msg.trafficMix.scriptedRatio)
        ? Math.max(0, Math.min(1, msg.trafficMix.scriptedRatio))
        : trafficMix.scriptedRatio;
    const nextSelfplay =
      typeof msg.trafficMix.selfplayRatio === 'number' && Number.isFinite(msg.trafficMix.selfplayRatio)
        ? Math.max(0, Math.min(1, msg.trafficMix.selfplayRatio))
        : trafficMix.selfplayRatio;
    trafficMix = {
      soloRatio: nextSolo,
      scriptedRatio: nextScripted,
      selfplayRatio: nextSelfplay,
    };
  }

  if (msg.obsConfig && typeof msg.obsConfig === 'object') {
    activeObsConfig = {
      lookaheadMeters: Array.isArray(msg.obsConfig.lookaheadMeters)
        ? msg.obsConfig.lookaheadMeters
        : undefined,
      curvatureMode:
        msg.obsConfig.curvatureMode === 'window_tanh' ? 'window_tanh' : 'clamp40',
      curvatureScale:
        typeof msg.obsConfig.curvatureScale === 'number' &&
        Number.isFinite(msg.obsConfig.curvatureScale)
          ? msg.obsConfig.curvatureScale
          : 14.0,
    };
  }

  if (msg.envOptions && typeof msg.envOptions === 'object') {
    const eo = msg.envOptions;
    if (typeof eo.brakingZoneSpawnRatio === 'number' && Number.isFinite(eo.brakingZoneSpawnRatio)) {
      envOptions.brakingZoneSpawnRatio = Math.max(0, Math.min(0.9, eo.brakingZoneSpawnRatio));
    }
    if (typeof eo.tightPackRatio === 'number' && Number.isFinite(eo.tightPackRatio)) {
      envOptions.tightPackRatio = Math.max(0, Math.min(1, eo.tightPackRatio));
    }
    if (typeof eo.technicalTrackBoost === 'number' && Number.isFinite(eo.technicalTrackBoost)) {
      envOptions.technicalTrackBoost = Math.max(0, Math.min(8, eo.technicalTrackBoost));
    }
    if (eo.trackWeights && typeof eo.trackWeights === 'object') {
      const cleaned: Record<string, number> = {};
      for (const [k, v] of Object.entries(eo.trackWeights)) {
        if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
          cleaned[k] = Math.max(0.25, Math.min(8.0, v));
        }
      }
      envOptions.trackWeights = cleaned;
    }
    if (typeof eo.spawnGhostSeconds === 'number' && Number.isFinite(eo.spawnGhostSeconds)) {
      envOptions.spawnGhostSeconds = Math.max(0, Math.min(6.0, eo.spawnGhostSeconds));
    }
    if (typeof eo.enableCarPhysicsCollisions === 'boolean') {
      envOptions.enableCarPhysicsCollisions = eo.enableCarPhysicsCollisions;
    }
    if (typeof eo.startScenarioRatio === 'number' && Number.isFinite(eo.startScenarioRatio)) {
      envOptions.startScenarioRatio = Math.max(0, Math.min(1.0, eo.startScenarioRatio));
    }
    if (typeof eo.rollingStartRatio === 'number' && Number.isFinite(eo.rollingStartRatio)) {
      envOptions.rollingStartRatio = Math.max(0, Math.min(1.0, eo.rollingStartRatio));
    }
    if (typeof eo.maxEpisodeSteps === 'number' && Number.isFinite(eo.maxEpisodeSteps)) {
      envOptions.maxEpisodeSteps = Math.max(0, Math.round(eo.maxEpisodeSteps));
    }
    if (typeof eo.multiLineTrafficRatio === 'number' && Number.isFinite(eo.multiLineTrafficRatio)) {
      envOptions.multiLineTrafficRatio = Math.max(0, Math.min(1.0, eo.multiLineTrafficRatio));
    }
  }

  if (typeof msg.weightsPath === 'string' && msg.weightsPath.trim()) {
    activeWeightsPath = path.resolve(process.cwd(), msg.weightsPath.trim());
  }
  if (typeof msg.poolDir === 'string' && msg.poolDir.trim()) {
    activePoolDir = path.resolve(process.cwd(), msg.poolDir.trim());
  }
}

function runNeuralPolicy(obs: number[], policy: MlpWeights): ControlInput {
  const out = evaluateNeuralPolicy(obs, policy);
  if (!out) {
    return { steer: 0, throttle: 0.5, brake: 0, specialPressed: false };
  }
  return {
    steer: out.steer,
    throttle: out.throttle,
    brake: out.brake,
    specialPressed: false,
  };
}

function getCarClass(carId: string): string {
  const spec = CARS.find((c: any) => c.id === carId);
  if (spec?.classId) return spec.classId;
  if (carId.startsWith('f1-')) return 'F1';
  if (carId.includes('963') || carId.includes('hypercar') || carId.includes('499p') || carId.includes('valkyrie')) return 'Hypercar';
  if (carId.includes('oreca') || carId.includes('ligier') || carId.includes('lmp2')) return 'LMP2';
  if (carId.includes('gt4')) return 'GT4';
  if (carId.includes('gt3')) return 'GT3';
  return 'Other';
}

const TIGHT_STREET_TRACK_IDS = new Set([
  'monaco',
  'long-beach',
  'detroit-street',
  'baku',
  'singapore',
  'jeddah',
  'las-vegas',
  'madring',
  'macau',
]);

const TECHNICAL_HARD_TRACK_IDS = new Set([
  'monaco',
  'long-beach',
  'detroit-street',
  'baku',
  'singapore',
  'las-vegas',
  'macau',
  'shanghai',
  'montreal',
  'spa-francorchamps',
  'laguna-seca',
  'yas-marina',
  'zandvoort',
  'vir',
  'sepang',
  'miami',
  'hungaroring',
]);

const compiledTracks = new Map<string, CompiledTrack>();

function getCompiledTrack(trackId?: string): CompiledTrack {
  if (trackId && compiledTracks.has(trackId)) return compiledTracks.get(trackId)!;
  let spec: (typeof TRACKS)[number];
  if (trackId) {
    spec = TRACKS.find((t: any) => t.id === trackId) ?? TRACKS[0];
  } else {
    const hasAdaptive = Object.keys(envOptions.trackWeights).length > 0;
    const techBoost = envOptions.technicalTrackBoost;
    if (hasAdaptive || techBoost > 0) {
      let totalW = 0;
      const weights = TRACKS.map((t) => {
        let w = TIGHT_STREET_TRACK_IDS.has(t.id) ? 2.5 : 1.0;
        if (techBoost > 0 && TECHNICAL_HARD_TRACK_IDS.has(t.id)) {
          w = Math.max(w, techBoost);
        }
        if (hasAdaptive && envOptions.trackWeights[t.id] !== undefined) {
          w *= envOptions.trackWeights[t.id];
        }
        totalW += w;
        return w;
      });
      let r = Math.random() * totalW;
      let chosen = TRACKS[0];
      for (let i = 0; i < TRACKS.length; i++) {
        r -= weights[i];
        if (r <= 0) {
          chosen = TRACKS[i];
          break;
        }
      }
      spec = chosen;
    } else {
      // Legacy 3x sampling weight for narrow/street circuits
      const weighted: (typeof TRACKS)[number][] = [];
      for (const t of TRACKS) {
        const weight = TIGHT_STREET_TRACK_IDS.has(t.id) ? 3 : 1;
        for (let w = 0; w < weight; w++) {
          weighted.push(t);
        }
      }
      spec = weighted[Math.floor(Math.random() * weighted.length)];
    }
  }
  if (!compiledTracks.has(spec.id)) {
    compiledTracks.set(spec.id, compileTrack(spec, 720));
  }
  return compiledTracks.get(spec.id)!;
}

function getSharpCornerStartT(track: CompiledTrack, randomCorner = false): number {
  const candidates: number[] = [];
  let inCorner = false;
  for (let i = 0; i < track.samples.length; i++) {
    const sp = track.samples[i];
    if (Math.abs(sp.curvature) > (randomCorner ? 0.022 : 0.015)) {
      if (!inCorner) {
        candidates.push(sp.s);
        inCorner = true;
      }
      if (!randomCorner) break;
    } else {
      inCorner = false;
    }
  }
  if (candidates.length > 0) {
    const cornerS = randomCorner
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : candidates[0];
    const distBefore = randomCorner
      ? 180 + Math.random() * 140 // 180..320m for high-speed braking zone practice
      : 180 + Math.random() * 80; // legacy 180..260m
    let startDist = cornerS - distBefore;
    while (startDist < 0) startDist += track.totalLength;
    return (startDist % track.totalLength) / track.totalLength;
  }
  return 0.96; // fallback to standing-start grid
}

function spawnCarAt(
  track: CompiledTrack,
  carId: string,
  id: string,
  startT: number,
  latRatio: number,
  initSpeed: number,
): CarSimState {
  const car = createCarSimState({
    id,
    name: id,
    isPlayer: false,
    carId,
    livery: { primary: '#ff0000', secondary: '#ffffff', accent: '#000000', number: 1 } as any,
    gridSlot: 0,
    compiledTrack: track,
    compound: 'soft',
    transmissionMode: 'auto',
    bopEnabled: true,
  });

  const wrappedT = ((startT % 1) + 1) % 1;
  const sp = sampleTrackAtT(track, wrappedT);
  const halfW = (sp.width ?? track.spec.trackWidth) * 0.5;
  const lat = latRatio * halfW;
  car.trackT = wrappedT;
  car.lateralOffset = lat;
  car.x = sp.x + sp.nx * lat;
  car.z = sp.z + sp.nz * lat;
  car.heading = Math.atan2(sp.tx, sp.tz);
  car.speed = initSpeed;
  car.vx = Math.sin(car.heading) * initSpeed;
  car.vz = Math.cos(car.heading) * initSpeed;

  return car;
}

function computeTrafficControl(bot: TrafficBot, track: CompiledTrack, allCars: CarSimState[]): ControlInput {
  if (bot.mode === 'neural' && bot.policy) {
    const obs = buildObservationVector(
      bot.car,
      track,
      allCars,
      bot.car.steerAngle,
      1.0,
      bot.car.bopMultipliers,
      bot.policy.obsConfig,
    );
    const ctrl = runNeuralPolicy(obs, bot.policy);
    // Slight pace variation (0.94..1.00) so self-play cars create natural overtakes instead of static trains
    ctrl.throttle *= bot.paceScale;
    return ctrl;
  }

  const lookAheadT = (bot.car.trackT + 28 / Math.max(200, track.totalLength)) % 1;
  const spNow = sampleTrackAtT(track, bot.car.trackT);
  const spAhead = sampleTrackAtT(track, lookAheadT);
  const halfW = (spNow.width ?? track.spec.trackWidth) * 0.5;

  const targetLat = bot.targetLaneRatio * halfW;
  const latErr = targetLat - bot.car.lateralOffset;

  const trackHeading = Math.atan2(spAhead.tx, spAhead.tz);
  let headingErr = trackHeading - bot.car.heading;
  while (headingErr > Math.PI) headingErr -= Math.PI * 2;
  while (headingErr < -Math.PI) headingErr += Math.PI * 2;

  const steer = Math.max(-1, Math.min(1, headingErr * 2.2 + (latErr / Math.max(3, halfW)) * 0.9));

  // Slow down for upcoming curvature
  const spFar = sampleTrackAtT(track, (bot.car.trackT + 65 / Math.max(200, track.totalLength)) % 1);
  let turnAngle = Math.atan2(spFar.tx, spFar.tz) - trackHeading;
  while (turnAngle > Math.PI) turnAngle -= Math.PI * 2;
  while (turnAngle < -Math.PI) turnAngle += Math.PI * 2;

  const curvature = Math.abs(turnAngle);
  const baseTargetSpeed = Math.max(22, (72 - curvature * 65) * bot.paceScale);
  const speedDiff = baseTargetSpeed - bot.car.speed;

  const throttle = speedDiff > 0 ? Math.min(1, 0.25 + speedDiff * 0.08) : 0;
  const brake = speedDiff < -2.0 ? Math.min(1, (-speedDiff - 2.0) * 0.1) : 0;

  return { steer, throttle, brake, specialPressed: false };
}

function getCarTopSpeedMs(carId: string): number {
  const spec = CARS.find((c: any) => c.id === carId);
  return spec?.attributes?.topSpeed ?? 75;
}

function resetSlot(trackIds?: string[], carIds?: string[], randomStart = true): EnvSlot {
  resetCounter++;
  if (resetCounter % 500 === 0 || (policyPool.length === 0 && trafficMix.selfplayRatio > 0 && resetCounter % 50 === 0)) {
    refreshPolicyPool();
  }

  const tId = trackIds && trackIds.length > 0 ? trackIds[Math.floor(Math.random() * trackIds.length)] : undefined;
  const cPool = carIds && carIds.length > 0 ? carIds : DEFAULT_CARS;
  const cId = cPool[Math.floor(Math.random() * cPool.length)];
  const track = getCompiledTrack(tId);

  // Determine scenario: dedicated 2x2 grid start (standing or rolling), multi-line pack, tight pack, or standard
  const isStartScenario =
    randomStart && envOptions.startScenarioRatio > 0 && Math.random() < envOptions.startScenarioRatio;
  const roll = Math.random();
  const isTraffic = randomStart && !isStartScenario && roll >= trafficMix.soloRatio;
  const isMultiLinePack =
    isTraffic && envOptions.multiLineTrafficRatio > 0 && Math.random() < envOptions.multiLineTrafficRatio;
  const isTightPack = isTraffic && !isMultiLinePack && Math.random() < envOptions.tightPackRatio;

  let startT: number;
  let latRatio: number;
  let initSpeed: number;
  let isRollingGridStart = false;
  let gridEgoSlot = 0;
  let gridTotalCars = 0;

  if (!randomStart) {
    startT = 0;
    latRatio = 0;
    initSpeed = 0;
  } else if (isStartScenario) {
    // Authentic staggered 2x2 starting grid (standing start from 0 m/s OR rolling start formation)
    isRollingGridStart = Math.random() < envOptions.rollingStartRatio;
    gridTotalCars = 8 + Math.floor(Math.random() * 5); // 8..12 cars on grid
    gridEgoSlot = Math.floor(Math.random() * gridTotalCars);
    const trackLen = Math.max(200, track.totalLength);
    const row = Math.floor(gridEgoSlot / 2);
    const col = gridEgoSlot % 2;
    const rowSpacing = isRollingGridStart ? 10.5 : 7.5;
    const colStagger = isRollingGridStart ? 2.2 : 3.75;
    const baseOffset = isRollingGridStart ? Math.min(130, Math.max(45, trackLen * 0.13)) : 12.0;
    const distBehind = Math.min(baseOffset + row * rowSpacing + col * colStagger, trackLen * 0.44);
    startT = (((1.0 - distBehind / trackLen) % 1) + 1) % 1;
    const halfW = track.spec.trackWidth * 0.5;
    const gridLat = Math.min(2.8, Math.max(1.8, halfW * 0.38)) / Math.max(1, halfW);
    latRatio = (col === 0 ? -1 : 1) * gridLat;
    if (isRollingGridStart) {
      const carTopMs = getCarTopSpeedMs(cId);
      initSpeed = Math.max(20, Math.min(34, carTopMs * (0.30 + Math.random() * 0.12)));
    } else {
      initSpeed = 0;
    }
  } else if (isMultiLinePack) {
    // V9 multi-line racecraft scenario: varied straightaway draft trains & 2-wide corner battles
    const spawnOnStraight = Math.random() < 0.5;
    startT = spawnOnStraight ? Math.random() : getSharpCornerStartT(track, false);
    latRatio = (Math.random() - 0.5) * 1.15; // full track width (-0.575..+0.575)
    const carTopMs = getCarTopSpeedMs(cId);
    initSpeed = spawnOnStraight
      ? Math.max(36, Math.min(carTopMs * 0.88, carTopMs * (0.55 + Math.random() * 0.30)))
      : Math.max(20, Math.min(44, 22 + Math.random() * 20));
  } else if (isTightPack) {
    // Tight Grid Pack / T1 Funnel scenario (~180-260m before sharp corner)
    startT = getSharpCornerStartT(track, false);
    latRatio = (Math.random() - 0.5) * 0.6;
    initSpeed = 18 + Math.random() * 14; // 18..32 m/s matched initial speed
  } else if (envOptions.brakingZoneSpawnRatio > 0 && Math.random() < envOptions.brakingZoneSpawnRatio) {
    // High-speed braking-zone approach spawn: 180..320m before a random sharp corner at class-realistic speed
    startT = getSharpCornerStartT(track, true);
    latRatio = (Math.random() - 0.5) * 0.65;
    const carTopMs = getCarTopSpeedMs(cId);
    initSpeed = Math.max(25, Math.min(carTopMs * 0.92, carTopMs * (0.60 + Math.random() * 0.30)));
  } else {
    // Standing start vs rolling random track position
    const standingProb = envOptions.brakingZoneSpawnRatio > 0 ? 0.15 : 0.25;
    const isStandingStart = Math.random() < standingProb;
    if (isStandingStart) {
      const gridOffset = -Math.random() * 0.02; // -0.02..0.0
      startT = gridOffset < 0 ? 1.0 + gridOffset : gridOffset;
      latRatio = (Math.random() - 0.5) * 0.7; // -0.35..0.35
      initSpeed = 0;
    } else {
      startT = Math.random();
      latRatio = (Math.random() - 0.5) * 0.8;
      initSpeed = 16 + Math.random() * 18;
    }
  }

  const car = spawnCarAt(track, cId, 'rl_agent', startT, latRatio, initSpeed);
  const traffic: TrafficBot[] = [];

  if (isStartScenario) {
    // Populate all other 2x2 grid slots authentically (standing at 0 m/s or rolling at matched formation speed)
    const trackLen = Math.max(200, track.totalLength);
    const halfW = track.spec.trackWidth * 0.5;
    const gridLat = Math.min(2.8, Math.max(1.8, halfW * 0.38)) / Math.max(1, halfW);
    const rowSpacing = isRollingGridStart ? 10.5 : 7.5;
    const colStagger = isRollingGridStart ? 2.2 : 3.75;
    const baseOffset = isRollingGridStart ? Math.min(130, Math.max(45, trackLen * 0.13)) : 12.0;

    for (let slotIdx = 0; slotIdx < gridTotalCars; slotIdx++) {
      if (slotIdx === gridEgoSlot) continue;
      const row = Math.floor(slotIdx / 2);
      const col = slotIdx % 2;
      const distBehind = Math.min(baseOffset + row * rowSpacing + col * colStagger, trackLen * 0.44);
      const botT = (((1.0 - distBehind / trackLen) % 1) + 1) % 1;
      const laneRatio = (col === 0 ? -1 : 1) * gridLat;
      const botCarId = Math.random() < 0.7 ? cId : cPool[Math.floor(Math.random() * cPool.length)];
      const botSpeed = isRollingGridStart ? Math.max(18, initSpeed + (Math.random() - 0.5) * 1.5) : 0;
      const botCar = spawnCarAt(track, botCarId, `grid_bot_${slotIdx}`, botT, laneRatio, botSpeed);
      let dtSigned = botT - startT;
      if (dtSigned > 0.5) dtSigned -= 1;
      if (dtSigned < -0.5) dtSigned += 1;
      const signedDist = dtSigned * trackLen;

      // Mix neural selfplay (once pool is warm) with realistic scripted launchers that accelerate cleanly from 0
      const useNeural = policyPool.length > 0 && Math.random() < 0.45;
      if (useNeural) {
        const policy = policyPool[Math.floor(Math.random() * policyPool.length)];
        const paceScale = 0.90 + Math.random() * 0.10;
        traffic.push({ car: botCar, mode: 'neural', policy, targetLaneRatio: laneRatio, paceScale, prevSignedDist: signedDist });
      } else {
        const paceScale = 0.80 + Math.random() * 0.22;
        traffic.push({ car: botCar, mode: 'scripted', policy: null, targetLaneRatio: laneRatio, paceScale, prevSignedDist: signedDist });
      }
    }
  } else if (isMultiLinePack) {
    // 5-6 rivals holding distinct racing lines (inside defense, center draft lead, outside sweep, flanking cars)
    const numRivals = 5 + (Math.random() < 0.5 ? 1 : 0);
    const laneChoices = [-0.62, -0.32, 0.0, 0.32, 0.62];
    const offsets = [-14, 7, 15, 26, 40, 58];
    for (let k = 0; k < numRivals; k++) {
      const longOffset = offsets[k] + (Math.random() - 0.5) * 5;
      const tOffset = longOffset / Math.max(200, track.totalLength);
      // Put one same-class draft lead directly ahead on the first slot to practice bump-draft & slingshot!
      const laneRatio =
        k === 1
          ? Math.max(-0.6, Math.min(0.6, latRatio + (Math.random() - 0.5) * 0.12))
          : laneChoices[(k + Math.floor(Math.random() * laneChoices.length)) % laneChoices.length];
      const botCarId = k <= 2 ? cId : cPool[Math.floor(Math.random() * cPool.length)];
      const botSpeed = Math.max(16, initSpeed + (k === 1 ? -2.0 + Math.random() * 2.5 : (Math.random() - 0.5) * 6.0));
      let botT = (startT + tOffset) % 1;
      if (botT < 0) botT += 1;
      const botCar = spawnCarAt(track, botCarId, `multiline_bot_${k}`, botT, laneRatio, botSpeed);
      const useNeural = policyPool.length > 0 && Math.random() < 0.55;
      if (useNeural) {
        const policy = policyPool[Math.floor(Math.random() * policyPool.length)];
        const paceScale = 0.90 + Math.random() * 0.10;
        traffic.push({ car: botCar, mode: 'neural', policy, targetLaneRatio: laneRatio, paceScale, prevSignedDist: longOffset });
      } else {
        const paceScale = 0.74 + Math.random() * 0.24;
        traffic.push({ car: botCar, mode: 'scripted', policy: null, targetLaneRatio: laneRatio, paceScale, prevSignedDist: longOffset });
      }
    }
  } else if (isTightPack) {
    // Spawn 4-5 rivals tightly staggered ahead/beside (+8m to +45m longitudinal, across both left and right lanes)
    const numRivals = 4 + (Math.random() < 0.5 ? 1 : 0);
    for (let k = 0; k < numRivals; k++) {
      const longOffset = 8 + (k / (numRivals - 1)) * 37 + (Math.random() - 0.5) * 4;
      const tOffset = longOffset / Math.max(200, track.totalLength);
      const laneRatio = (k % 2 === 0 ? 1 : -1) * (0.18 + Math.random() * 0.35);
      const botCarId = cPool[Math.floor(Math.random() * cPool.length)];
      const botSpeed = Math.max(16, Math.min(34, initSpeed + (Math.random() - 0.5) * 3.0));
      let botT = (startT + tOffset) % 1;
      if (botT < 0) botT += 1;
      const botCar = spawnCarAt(track, botCarId, `pack_bot_${k}`, botT, laneRatio, botSpeed);
      const useNeural = policyPool.length > 0 && Math.random() < 0.5;
      if (useNeural) {
        const policy = policyPool[Math.floor(Math.random() * policyPool.length)];
        const paceScale = 0.92 + Math.random() * 0.08;
        traffic.push({ car: botCar, mode: 'neural', policy, targetLaneRatio: laneRatio, paceScale, prevSignedDist: longOffset });
      } else {
        const paceScale = 0.75 + Math.random() * 0.20;
        traffic.push({ car: botCar, mode: 'scripted', policy: null, targetLaneRatio: laneRatio, paceScale, prevSignedDist: longOffset });
      }
    }
  } else if (isTraffic) {
    const scriptedCutoff = trafficMix.soloRatio + trafficMix.scriptedRatio;
    if (roll < scriptedCutoff) {
      // Scripted slower multiclass traffic
      const numTraffic = 4;
      for (let k = 0; k < numTraffic; k++) {
        const offsetMeters = 22 + k * 34 + Math.random() * 14;
        const tOffset = offsetMeters / Math.max(200, track.totalLength);
        const botCarId = cPool[Math.floor(Math.random() * cPool.length)];
        const laneRatio = (k % 2 === 0 ? 1 : -1) * (0.2 + Math.random() * 0.35);
        const paceScale = 0.62 + Math.random() * 0.3;
        const botInitSpeed = Math.max(14, initSpeed * paceScale);
        let botT = (startT + tOffset) % 1;
        if (botT < 0) botT += 1;
        const botCar = spawnCarAt(track, botCarId, `traffic_${k}`, botT, laneRatio, botInitSpeed);
        traffic.push({ car: botCar, mode: 'scripted', policy: null, targetLaneRatio: laneRatio, paceScale, prevSignedDist: offsetMeters });
      }
    } else if (policyPool.length > 0) {
      // Neural self-play: 3 same-class rivals (1 slightly behind, 2 ahead)
      const offsets = [-18 - Math.random() * 10, 16 + Math.random() * 12, 42 + Math.random() * 18];
      for (let k = 0; k < offsets.length; k++) {
        const tOffset = offsets[k] / Math.max(200, track.totalLength);
        const laneRatio = (k % 2 === 0 ? 1 : -1) * (0.18 + Math.random() * 0.32);
        const policy = policyPool[Math.floor(Math.random() * policyPool.length)];
        const paceScale = 0.94 + Math.random() * 0.06;
        let botT = (startT + tOffset) % 1;
        if (botT < 0) botT += 1;
        const botCar = spawnCarAt(track, cId, `selfplay_${k}`, botT, laneRatio, initSpeed);
        traffic.push({ car: botCar, mode: 'neural', policy, targetLaneRatio: laneRatio, paceScale, prevSignedDist: offsets[k] });
      }
    }
  }

  const allCars = [car, ...traffic.map((t) => t.car)];

  // Opt-in spawn ghosting: start scenarios & tight packs get full ghost window to prevent launch gridlock;
  // spaced traffic mixes ghosted and immediately-solid starts so policy never assumes permanent ghosting.
  let spawnGhostDuration = 0;
  if (traffic.length > 0 && envOptions.spawnGhostSeconds > 0) {
    if (isStartScenario || isTightPack) {
      spawnGhostDuration = envOptions.spawnGhostSeconds;
    } else if (Math.random() < 0.5) {
      spawnGhostDuration = envOptions.spawnGhostSeconds * 0.5;
    }
    if (spawnGhostDuration > 0) {
      for (const c of allCars) {
        c.spawnGhostTimer = spawnGhostDuration;
      }
    }
  }

  return {
    car,
    carId: cId,
    carClass: getCarClass(cId),
    traffic,
    allCars,
    track,
    prevTrackT: car.trackT,
    prevAeroDamage: car.aeroDamage,
    prevSteer: 0,
    prevSpeed: car.speed,
    stepsInEpisode: 0,
    lapsCompleted: 0,
    consecutiveWallSteps: 0,
    wallScrapes: 0,
    prevLat: car.lateralOffset,
    consecutiveOffTrackSteps: 0,
    consecutiveStallSteps: 0,
    spawnGhostDuration,
  };
}

function getObs(slot: EnvSlot): number[] {
  return buildObservationVector(
    slot.car,
    slot.track,
    slot.allCars,
    slot.car.steerAngle,
    1.0,
    slot.car.bopMultipliers,
    activeObsConfig,
  );
}

let slots: EnvSlot[] = [];
let cfgTracks: string[] | undefined;
let cfgCars: string[] | undefined;

const USE_BINARY_IPC = process.argv.includes('--binary-ipc');

function writeBinaryFrame(msgType: number, payload: Buffer): void {
  const hdr = Buffer.allocUnsafe(8);
  hdr.writeUInt32LE(msgType, 0);
  hdr.writeUInt32LE(payload.length, 4);
  process.stdout.write(hdr);
  if (payload.length > 0) {
    process.stdout.write(payload);
  }
}

function sendJsonResponse(obj: unknown): void {
  const str = JSON.stringify(obj);
  if (USE_BINARY_IPC) {
    writeBinaryFrame(1, Buffer.from(str, 'utf8'));
  } else {
    process.stdout.write(str + '\n');
  }
}

function handleMessage(msg: any): void {
  if (msg.cmd === 'catalog') {
    const tracks = TRACKS.map((t: any) => ({ id: t.id, name: t.name }));
    const baseCars = CARS.map((c: any) => ({ id: c.id, name: c.name, classId: c.classId }));
    const selectableCars = getAllSelectableCars().map((c: any) => ({ id: c.id, name: c.name, classId: c.classId }));
    sendJsonResponse({ tracks, baseCars, selectableCars });
    return;
  }

  if (msg.cmd === 'eval_batch') {
    const pairs: Array<{ trackId: string; carId: string }> = msg.pairs ?? [];
    let policy: MlpWeights | null = null;
    if (msg.weights && typeof msg.weights === 'object') {
      policy = parsePolicyWeights(msg.weights);
    } else if (typeof msg.weightsPath === 'string' && msg.weightsPath.trim()) {
      const pPath = path.resolve(process.cwd(), msg.weightsPath.trim());
      if (fs.existsSync(pPath)) {
        try {
          policy = parsePolicyWeights(JSON.parse(fs.readFileSync(pPath, 'utf8')));
        } catch (e: any) {
          console.error(`[eval_batch] Failed to parse weights from ${pPath}:`, e.message);
        }
      }
    }
    if (!policy && policyPool.length > 0) {
      policy = policyPool[0];
    }
    if (!policy) {
      refreshPolicyPool();
      policy = policyPool[0] ?? null;
    }

    const POLICY_DT = 1 / 30;
    const SUBSTEPS = 4;
    const SUB_DT = POLICY_DT / SUBSTEPS;
    const defaultMaxSteps: number = msg.maxSteps ?? 6000;

    const results: Array<{
      trackId: string;
      carId: string;
      carClass: string;
      completed: boolean;
      bestLapTime: number | null;
      avgSpeedKmh: number;
      offTrackPct: number;
      wallCrash: number;
      stalls?: number;
      steps: number;
    }> = [];

    for (const pair of pairs) {
      const track = getCompiledTrack(pair.trackId);
      const cId = pair.carId;
      // Spawn at startT = 0.02 with rolling speed 18 m/s, latRatio = 0
      const car = spawnCarAt(track, cId, 'eval_agent', 0.02, 0, 18.0);
      const carClass = getCarClass(cId);

      // Dynamic maxSteps scaled by track length, preserving >=10000 on tracks >10km
      const dynamicCap = Math.ceil((track.totalLength / 22.0) * 30 * 1.5);
      const maxSteps = Math.max(
        defaultMaxSteps,
        dynamicCap,
        track.totalLength > 10000 ? 10000 : 0
      );

      let totalSpeedMps = 0;
      let offTrackSteps = 0;
      let wallCrashCount = 0;
      let prevDmg = car.aeroDamage;
      let distanceTraveledMeters = 0;
      let lapsCompleted = 0;
      let completedLap = false;
      let completedLapTime: number | null = null;
      let crashed = false;
      let stalled = false;
      let consecutiveStallSteps = 0;
      let consecutiveWallSteps = 0;
      let wallScrapeCount = 0;
      let step = 0;

      for (; step < maxSteps; step++) {
        totalSpeedMps += car.speed;
        const absLat = Math.abs(car.lateralOffset);
        const sp = sampleTrackAtT(track, car.trackT);
        const halfW = (sp.width ?? track.spec.trackWidth) * 0.5;
        const KERB_EDGE = halfW + 1.8;

        if (absLat > KERB_EDGE) {
          offTrackSteps++;
        }

        const deltaAero = Math.max(0, car.aeroDamage - prevDmg);
        const wallContact = absLat > halfW + 2.8 || deltaAero > 0.02;

        if (wallContact) {
          consecutiveWallSteps++;
          if (consecutiveWallSteps === 1) {
            wallScrapeCount++;
          }
        } else {
          consecutiveWallSteps = 0;
        }

        // Terminal crash condition during evaluation:
        // 1. Violent wall impact: damage delta > 2.5
        // 2. Sustained barrier grinding: >= 18 steps (~0.6s at 30Hz) without deflecting
        // 3. Blown through barriers far into deep terrain: absLat > halfW + 7.0m
        // 4. Repeated wall pinballing: >= 5 distinct scrape events
        const terminalWallCrash =
          deltaAero > 2.5 ||
          consecutiveWallSteps >= 18 ||
          absLat > halfW + 7.0 ||
          wallScrapeCount >= 5;

        if (terminalWallCrash) {
          wallCrashCount++;
          crashed = true;
          break;
        }

        // Stall detection: require 90 consecutive steps (3.0s at 30 Hz) after initial launch
        if (step > 300 && car.speed < 1.0) {
          consecutiveStallSteps++;
          if (consecutiveStallSteps >= 90) {
            stalled = true;
            crashed = true;
            break;
          }
        } else {
          consecutiveStallSteps = 0;
        }

        // Step physics with neural policy (respecting policy.obsConfig for full train/eval parity)
        let ctrl: ControlInput;
        if (policy) {
          const obs = buildObservationVector(
            car,
            track,
            [car],
            car.steerAngle,
            1.0,
            car.bopMultipliers,
            policy.obsConfig,
          );
          ctrl = runNeuralPolicy(obs, policy);
        } else {
          ctrl = { steer: 0, throttle: 0.5, brake: 0, specialPressed: false };
        }

        const stepPrevT = car.trackT;
        prevDmg = car.aeroDamage;

        for (let s = 0; s < SUBSTEPS; s++) {
          stepCarPhysics(car, ctrl, track, SUB_DT, {
            trackWetness: 0,
            totalLaps: 99,
            isQualifying: false,
            allCars: [car],
            bopEnabled: true,
          });
          const bSp = sampleTrackAtT(track, car.trackT);
          const bWall = (bSp.width ?? track.spec.trackWidth) * 0.5 + 3.0;
          if (Math.abs(car.lateralOffset) > bWall) {
            const bSide: 1 | -1 = car.lateralOffset > 0 ? 1 : -1;
            resolveWallContact(car, bSp, bSide * bWall, bSide, SUB_DT);
          }
        }

        let deltaT = car.trackT - stepPrevT;
        if (deltaT < -0.5) deltaT += 1.0;
        if (deltaT > 0.5) deltaT -= 1.0;
        const forwardMeters = deltaT * track.totalLength;
        if (forwardMeters > 0) {
          distanceTraveledMeters += forwardMeters;
        }

        // Record a completed clean lap as soon as distanceTraveledMeters >= 0.90 * track.totalLength
        // on any start/finish crossing (stepPrevT > 0.85 && car.trackT < 0.15)
        if (stepPrevT > 0.85 && car.trackT < 0.15) {
          lapsCompleted++;
          if (distanceTraveledMeters >= 0.90 * track.totalLength) {
            completedLap = true;
            completedLapTime = car.lastLapTime ?? (step * POLICY_DT);
            break;
          }
        }
      }

      const totalSteps = Math.max(1, step);
      // Clean lap: finished full distance, no terminal crash, no stall, no hard wall crashes, max 2 minor scrapes, offTrack <= 12%
      const isClean = completedLap && !crashed && !stalled && wallCrashCount === 0 && wallScrapeCount <= 2 && (offTrackSteps / totalSteps) <= 0.12;
      results.push({
        trackId: pair.trackId,
        carId: cId,
        carClass,
        completed: isClean,
        bestLapTime: completedLapTime != null ? Number(completedLapTime.toFixed(2)) : null,
        avgSpeedKmh: Number(((totalSpeedMps / totalSteps) * 3.6).toFixed(1)),
        offTrackPct: Number(((offTrackSteps / totalSteps) * 100).toFixed(1)),
        wallCrash: wallCrashCount > 0 ? wallCrashCount : (wallScrapeCount > 2 ? 1 : 0),
        stalls: stalled ? 1 : 0,
        steps: totalSteps,
      });
    }

    sendJsonResponse({ results });
    return;
  }

  if (msg.cmd === 'init') {
    policyPool = [];
    applyConfigPatch(msg, true);
    refreshPolicyPool();
    cfgTracks = msg.tracks;
    cfgCars = msg.cars;
    if (Array.isArray(msg.pairs) && msg.pairs.length > 0) {
      slots = msg.pairs.map((p: { trackId: string; carId: string }) => resetSlot([p.trackId], [p.carId], false));
    } else {
      const n: number = msg.numEnvs ?? 32;
      slots = Array.from({ length: n }, () => resetSlot(cfgTracks, cfgCars, true));
    }
    sendJsonResponse({ obs: slots.map(getObs), poolSize: policyPool.length });
    return;
  }

  if (msg.cmd === 'config') {
    applyConfigPatch(msg, false);
    refreshPolicyPool();
    sendJsonResponse({ ok: true, poolSize: policyPool.length });
    return;
  }

  if (msg.cmd === 'step') {
    if (msg.trafficMix || msg.rewardWeights || msg.envOptions || msg.obsConfig) {
      applyConfigPatch(msg, false);
    }
    const stepRes = runStepBatch(msg.actions);
    sendJsonResponse(stepRes);
  }
}

function runStepBatch(actions: number[][] | Float32Array): {
  obs: number[][];
  rewards: number[];
  dones: boolean[];
  truncated: boolean[];
  finalObs: (number[] | null)[];
  info: Array<{
    trackId: string;
    carId: string;
    carClass: string;
    speed: number;
    lapTime: number | null;
    offTrack: boolean;
    crashed: boolean;
    carCrash: boolean;
    wallCrash: boolean;
    stalled?: boolean;
    ghostOverlap?: boolean;
  }>;
} {
    const obsOut: number[][] = [];
    const rewardsOut: number[] = [];
    const donesOut: boolean[] = [];
    const truncatedOut: boolean[] = [];
    const finalObsOut: (number[] | null)[] = [];
    const infoOut: {
      trackId: string;
      carId: string;
      carClass: string;
      speed: number;
      lapTime: number | null;
      offTrack: boolean;
      crashed: boolean;
      carCrash: boolean;
      wallCrash: boolean;
      stalled?: boolean;
      ghostOverlap?: boolean;
    }[] = [];

    const POLICY_DT = 1 / 30;
    const SUBSTEPS = 4;
    const SUB_DT = POLICY_DT / SUBSTEPS;
    const isFlatActions = actions instanceof Float32Array;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const a0 = isFlatActions ? actions[i * 3] : (actions as number[][])[i][0];
      const a1 = isFlatActions ? actions[i * 3 + 1] : (actions as number[][])[i][1];
      const a2 = isFlatActions ? actions[i * 3 + 2] : (actions as number[][])[i][2];
      const steer = Math.max(-1, Math.min(1, a0));
      const rawThrottle = Math.max(-1, Math.min(1, a1));
      const rawBrake = Math.max(-1, Math.min(1, a2));
      const throttle = (rawThrottle + 1) * 0.5;
      const brake = (rawBrake + 1) * 0.5;

      const egoInput: ControlInput = {
        steer,
        throttle,
        brake,
        specialPressed: false,
      };
      const trafficInputs = slot.traffic.map((bot) => computeTrafficControl(bot, slot.track, slot.allCars));

      const prevT = slot.car.trackT;
      const prevDmg = slot.car.aeroDamage;

      for (let s = 0; s < SUBSTEPS; s++) {
        // Step traffic / self-play cars first
        for (let b = 0; b < slot.traffic.length; b++) {
          const bot = slot.traffic[b];
          stepCarPhysics(bot.car, trafficInputs[b], slot.track, SUB_DT, {
            trackWetness: 0,
            totalLaps: 99,
            isQualifying: false,
            allCars: slot.allCars,
            bopEnabled: true,
          });
          const bSp = sampleTrackAtT(slot.track, bot.car.trackT);
          const bWall = (bSp.width ?? slot.track.spec.trackWidth) * 0.5 + 3.0;
          if (Math.abs(bot.car.lateralOffset) > bWall) {
            const bSide: 1 | -1 = bot.car.lateralOffset > 0 ? 1 : -1;
            resolveWallContact(bot.car, bSp, bSide * bWall, bSide, SUB_DT);
          }
        }

        // Step RL ego car
        stepCarPhysics(slot.car, egoInput, slot.track, SUB_DT, {
          trackWetness: 0,
          totalLaps: 99,
          isQualifying: false,
          allCars: slot.allCars,
          bopEnabled: true,
        });

        const curSp = sampleTrackAtT(slot.track, slot.car.trackT);
        const wallLat = (curSp.width ?? slot.track.spec.trackWidth) * 0.5 + 3.0;
        if (Math.abs(slot.car.lateralOffset) > wallLat) {
          const wallSide: 1 | -1 = slot.car.lateralOffset > 0 ? 1 : -1;
          resolveWallContact(
            slot.car,
            curSp,
            wallSide * wallLat,
            wallSide,
            SUB_DT,
          );
        }

        // Authentic OBB car-to-car physics collisions (opt-in; automatically skips cars with spawnGhostTimer > 0)
        if (envOptions.enableCarPhysicsCollisions && slot.allCars.length > 1) {
          resolveCarCollisions(slot.allCars);
        }
      }

      slot.stepsInEpisode++;

      let deltaT = slot.car.trackT - prevT;
      if (deltaT < -0.5) deltaT += 1.0;
      if (deltaT > 0.5) deltaT -= 1.0;
      const forwardMeters = deltaT * slot.track.totalLength;

      const sp = sampleTrackAtT(slot.track, slot.car.trackT);
      const halfW = (sp.width ?? slot.track.spec.trackWidth) * 0.5;
      const KERB_EDGE = halfW + 1.8;
      const absLat = Math.abs(slot.car.lateralOffset);
      const prevAbsLat = Math.abs(slot.prevLat ?? slot.car.lateralOffset);
      const isPastKerb = absLat > KERB_EDGE;
      const isDeepOffTrack = absLat > halfW + 2.7;

      if (isPastKerb) {
        slot.consecutiveOffTrackSteps++;
      } else {
        slot.consecutiveOffTrackSteps = 0;
      }
      const offTrack = isPastKerb;
      const deltaAero = Math.max(0, slot.car.aeroDamage - prevDmg);
      const wallContact = absLat > halfW + 2.8 || deltaAero > 0.02;
      let wallScrapePenalty = 0;

      if (wallContact) {
        slot.consecutiveWallSteps++;
        if (slot.consecutiveWallSteps === 1) {
          slot.wallScrapes++;
        }
        const scrapeBase = rewardWeights.wallScrapeBase ?? 0.15;
        const scrapeDmgScale = rewardWeights.wallScrapeDamageScale ?? 0.4;
        const scrapeCap = rewardWeights.wallScrapeCap ?? 2.0;
        wallScrapePenalty = Math.min(scrapeCap, deltaAero * scrapeDmgScale + scrapeBase);
      } else {
        slot.consecutiveWallSteps = 0;
      }

      // Check car-to-car proximity, forward-cone TTC penalty, clean overtakes, spawn-ghost overlap, and physical contact
      let carContact = false;
      let ghostOverlap = false;
      let closeProximityPenalty = 0;
      let ghostOverlapPenaltySum = 0;
      let ttcPenaltySum = 0;
      let overtakeBonusSum = 0;
      const ttcWeight = rewardWeights.ttcPenalty ?? 0;
      const overtakeWeight = rewardWeights.cleanOvertakeBonus ?? 0;
      const altLineOvertakeWeight = rewardWeights.alternateLineOvertakeBonus ?? 0;
      const ghostOverlapWeight = rewardWeights.ghostOverlapPenalty ?? 0;
      const bumpDraftWeight = rewardWeights.bumpDraftBonus ?? 0;
      const headingX = Math.sin(slot.car.heading);
      const headingZ = Math.cos(slot.car.heading);
      const egoGhost = slot.car.spawnGhostTimer ?? 0;
      const maxGhostDur = Math.max(0.5, slot.spawnGhostDuration || envOptions.spawnGhostSeconds || 2.0);
      let bumpDraftBonusSum = 0;

      // Pre-check straightaway eligibility for legal bump-drafting (aligned nose-to-tail at high speed)
      const spAhead65 =
        bumpDraftWeight > 0
          ? sampleTrackAtT(slot.track, (slot.car.trackT + 65 / Math.max(200, slot.track.totalLength)) % 1)
          : null;
      const onBumpDraftStraight =
        bumpDraftWeight > 0 &&
        slot.car.speed > 36.0 &&
        Math.abs(sp.curvature ?? 0) < 0.008 &&
        Math.abs(spAhead65?.curvature ?? 0) < 0.012 &&
        !isPastKerb;

      for (let b = 0; b < slot.traffic.length; b++) {
        const bot = slot.traffic[b];
        const other = bot.car;
        const otherGhost = other.spawnGhostTimer ?? 0;
        const pairGhosted = egoGhost > 0 || otherGhost > 0;
        const dx = other.x - slot.car.x;
        const dz = other.z - slot.car.z;
        const distSq = dx * dx + dz * dz;
        const aheadDist = dx * headingX + dz * headingZ;
        const closingSpeed = slot.car.speed - other.speed;

        // Check if ego is tucked cleanly behind a same-class car on a straightaway (bump-draft cone)
        let isCleanStraightDraft = false;
        if (
          onBumpDraftStraight &&
          aheadDist > 1.5 &&
          aheadDist < 18.0 &&
          other.carSpec.classId === slot.car.carSpec.classId &&
          other.speed > 32.0 &&
          Math.abs(other.lateralOffset - slot.car.lateralOffset) < 1.9 &&
          closingSpeed < 4.8 &&
          closingSpeed > -6.0
        ) {
          const otherHeadingDot = headingX * Math.sin(other.heading) + headingZ * Math.cos(other.heading);
          if (otherHeadingDot > 0.95) {
            isCleanStraightDraft = true;
          }
        }

        if (distSq < 6.25) {
          if (!pairGhosted) {
            // Allow gentle nose-to-tail bump drafting on clear straights (matches resolveCarCollisions isBumpDraft)
            if (isCleanStraightDraft && closingSpeed < 4.5 && Math.abs(other.lateralOffset - slot.car.lateralOffset) < 1.35) {
              bumpDraftBonusSum += bumpDraftWeight * 2.0;
            } else {
              // Within 2.5m center-to-center (solid cars) = physical collision
              carContact = true;
              break;
            }
          } else {
            // Non-terminal during spawn ghosting to avoid pack gridlock, but apply an escalating
            // overlap penalty as ghosting nears expiry so the policy peels into clean air before turning solid.
            ghostOverlap = true;
            const activeGhost = Math.max(egoGhost, otherGhost);
            const ghostProgress = Math.max(0, Math.min(1, 1 - activeGhost / maxGhostDur));
            const escalation = 0.5 + 2.0 * ghostProgress * ghostProgress;
            const basePenalty = ghostOverlapWeight > 0 ? ghostOverlapWeight : 0.6;
            ghostOverlapPenaltySum += basePenalty * escalation;
            closeProximityPenalty += 3.5 * rewardWeights.closeProximity;
          }
        } else if (isCleanStraightDraft && aheadDist < 15.0) {
          // Reward holding a close straightaway tow instead of timidly braking 10-15m behind
          bumpDraftBonusSum += bumpDraftWeight;
        } else if (distSq < 36.0) {
          // Soft warning zone (2.5m..6.0m) stays active even while ghosted to guide clean lane selection
          const dist = Math.sqrt(distSq);
          closeProximityPenalty += (6.0 - dist) * rewardWeights.closeProximity;
        }

        // Forward-cone Time-To-Collision (TTC) closing penalty within 14m (suppressed during clean straight bump-draft)
        if (ttcWeight > 0 && distSq < 196.0 && !isCleanStraightDraft) {
          if (aheadDist > 0) {
            const dist = Math.sqrt(distSq);
            if (dist < 14.0 && closingSpeed > 1.5) {
              ttcPenaltySum += ttcWeight * (closingSpeed / Math.max(2.0, dist));
            }
          }
        }

        // Clean overtake bonus (opt-in; disabled while ghosted so agents cannot farm passes through ghosted cars)
        if (overtakeWeight > 0) {
          let dtOther = other.trackT - slot.car.trackT;
          if (dtOther > 0.5) dtOther -= 1.0;
          if (dtOther < -0.5) dtOther += 1.0;
          const signedDist = dtOther * slot.track.totalLength;
          if (
            !pairGhosted &&
            bot.prevSignedDist > 0 &&
            bot.prevSignedDist < 30 &&
            signedDist <= 0 &&
            signedDist > -15 &&
            !wallContact &&
            !isPastKerb
          ) {
            overtakeBonusSum += overtakeWeight;
            if (altLineOvertakeWeight > 0 && Math.abs(slot.car.lateralOffset) > Math.max(1.6, halfW * 0.25)) {
              overtakeBonusSum += altLineOvertakeWeight;
            }
          }
          bot.prevSignedDist = signedDist;
        }
      }

      let reward =
        forwardMeters * rewardWeights.forwardProgress -
        closeProximityPenalty -
        ghostOverlapPenaltySum -
        ttcPenaltySum -
        wallScrapePenalty +
        overtakeBonusSum +
        bumpDraftBonusSum;

      // Opt-in launch acceleration bonus during first 4 seconds (120 steps) for the Starts specialist
      const launchBonus = rewardWeights.launchAccelBonus ?? 0;
      if (
        launchBonus > 0 &&
        slot.stepsInEpisode <= 120 &&
        !isPastKerb &&
        !wallContact &&
        !carContact &&
        forwardMeters > 0
      ) {
        const accelGain = Math.max(0, slot.car.speed - slot.prevSpeed);
        reward += launchBonus * (accelGain * 1.5 + Math.min(1.0, slot.car.speed / 30.0) * 0.4);
      }

      // Opt-in corner survival bonus for cleanly navigating high-curvature corners on track
      const cornerSurvBonus = rewardWeights.cornerSurvivalBonus ?? 0;
      if (
        cornerSurvBonus > 0 &&
        Math.abs(sp.curvature) > 0.02 &&
        !isPastKerb &&
        !wallContact &&
        slot.car.speed > 10.0 &&
        forwardMeters > 0
      ) {
        reward += cornerSurvBonus;
      }

      if (slot.car.speed < rewardWeights.minSpeedThreshold) {
        reward -= (rewardWeights.minSpeedThreshold - slot.car.speed) * rewardWeights.minSpeedPenalty;
      }
      if (rewardWeights.floorSpeedPenalty > 0 && slot.car.speed < rewardWeights.floorSpeedThreshold) {
        reward -= (rewardWeights.floorSpeedThreshold - slot.car.speed) * rewardWeights.floorSpeedPenalty;
      }
      if (rewardWeights.decelPenalty > 0 && slot.stepsInEpisode > 1) {
        const speedDrop = slot.prevSpeed - slot.car.speed;
        if (speedDrop > rewardWeights.decelThreshold) {
          reward -= (speedDrop - rewardWeights.decelThreshold) * rewardWeights.decelPenalty;
        }
      }
      if (isPastKerb) {
        const excursionDist = absLat - KERB_EDGE;
        const returningToTrack = absLat < prevAbsLat;
        const hasTrackLimitStrike = (slot.car.warningCount ?? 0) > 0;
        if (slot.consecutiveOffTrackSteps <= 8 && !isDeepOffTrack && !hasTrackLimitStrike) {
          // Grace margin for brief kerb overshoot: proportional excursion penalty only
          reward -= excursionDist * rewardWeights.offTrackSlope;
        } else {
          // Sustained or deep excursion or real track limit strike: apply base penalty (halved when actively returning to track)
          const effectiveBase = returningToTrack ? rewardWeights.offTrackBase * 0.5 : rewardWeights.offTrackBase;
          reward -= effectiveBase + excursionDist * rewardWeights.offTrackSlope;
        }
      }

      // Exit-kerb stall escape & heading recovery gradient at low speeds (< 8.0 m/s)
      if (slot.car.speed < 8.0) {
        const carHeadingX = Math.sin(slot.car.heading);
        const carHeadingZ = Math.cos(slot.car.heading);
        const headingAlign = carHeadingX * sp.tx + carHeadingZ * sp.tz;

        if (headingAlign > 0) {
          reward += headingAlign * 0.15;
          reward += headingAlign * (slot.car.speed / 8.0) * 0.25;
        } else {
          reward += headingAlign * 0.10;
        }

        // Discourage coming to a standstill when outside the racing line
        if (isPastKerb && slot.car.speed < 2.0) {
          reward -= (2.0 - slot.car.speed) * 0.20;
        }
      }

      const steerJerk = Math.abs(steer - slot.prevSteer);
      reward -= rewardWeights.steerJerk * steerJerk * steerJerk;
      reward -= rewardWeights.throttleBrakeOverlap * (throttle * brake);

      let done = false;
      let truncated = false;
      let crashed = false;
      let carCrash = false;
      let wallCrash = false;
      let completedLapTime: number | null = null;

      if (prevT > 0.85 && slot.car.trackT < 0.15 && slot.stepsInEpisode > 150) {
        slot.lapsCompleted++;
        const lapTime = slot.car.lastLapTime ?? 0;
        const lapBonus = rewardWeights.lapCompletionBonus ?? 0;
        if (lapBonus > 0 && slot.wallScrapes <= 2) {
          reward += lapBonus;
        }
        if (slot.lapsCompleted >= 2 && lapTime >= 20) {
          completedLapTime = lapTime;
          done = true;
          truncated = true; // Clean finish is a time/lap truncation, not a crash death
        }
      }

      // Scale episode cap by track length (or fixed cap when envOptions.maxEpisodeSteps > 0, e.g. Starts training)
      const maxSteps =
        envOptions.maxEpisodeSteps > 0
          ? envOptions.maxEpisodeSteps
          : Math.max(6000, Math.ceil((slot.track.totalLength / 25) * 30 * 2.2));
      const maxScrapes = rewardWeights.maxWallScrapes ?? 6;

      // Terminal crash conditions
      const hardWallCrash =
        deltaAero > 2.5 ||
        slot.consecutiveWallSteps >= 18 ||
        absLat > halfW + 7.0 ||
        slot.wallScrapes >= maxScrapes;

      const stallSpeedThreshold = rewardWeights.stallStopSpeed ?? 2.0;
      const stallGraceSteps = envOptions.startScenarioRatio > 0.5 ? 45 : 180;
      if (slot.stepsInEpisode > stallGraceSteps && slot.car.speed < stallSpeedThreshold) {
        slot.consecutiveStallSteps++;
      } else {
        slot.consecutiveStallSteps = 0;
      }
      const isStalled = slot.consecutiveStallSteps >= (envOptions.startScenarioRatio > 0.5 ? 30 : 60);

      if (carContact) {
        reward -= rewardWeights.carCrash;
        crashed = true;
        carCrash = true;
        done = true;
        truncated = false;
      } else if (hardWallCrash) {
        reward -= rewardWeights.wallCrash;
        crashed = true;
        wallCrash = true;
        done = true;
        truncated = false;
      } else if (isStalled) {
        reward -= Math.min(rewardWeights.wallCrash, 3.5);
        crashed = true;
        done = true;
        truncated = false;
      } else if (!done && slot.stepsInEpisode > maxSteps) {
        done = true;
        truncated = true;
      }

      slot.prevLat = slot.car.lateralOffset;
      slot.prevSteer = steer;
      slot.prevSpeed = slot.car.speed;
      infoOut.push({
        trackId: slot.track.spec.id,
        carId: slot.carId,
        carClass: slot.carClass,
        speed: slot.car.speed,
        lapTime: completedLapTime,
        offTrack,
        crashed,
        carCrash,
        wallCrash: wallCrash || (wallContact && slot.consecutiveWallSteps === 1),
        stalled: isStalled,
        ghostOverlap,
      });

      let finalObs: number[] | null = null;
      if (done) {
        if (truncated) {
          finalObs = getObs(slot);
        }
        slots[i] = resetSlot(cfgTracks, cfgCars, true);
      }

      obsOut.push(getObs(slots[i]));
      rewardsOut.push(reward);
      donesOut.push(done);
      truncatedOut.push(truncated);
      finalObsOut.push(finalObs);
    }

    return {
      obs: obsOut,
      rewards: rewardsOut,
      dones: donesOut,
      truncated: truncatedOut,
      finalObs: finalObsOut,
      info: infoOut,
    };
}

function encodeBinaryStepResponse(res: ReturnType<typeof runStepBatch>): Buffer {
  const n = res.obs.length;
  const OBS_DIM = 43;
  const finalObsPairs: Array<{ idx: number; obs: number[] }> = [];
  for (let i = 0; i < n; i++) {
    const fo = res.finalObs[i];
    if (fo) finalObsPairs.push({ idx: i, obs: fo });
  }
  const infoBytes = Buffer.from(JSON.stringify(res.info), 'utf8');
  const totalLen =
    4 + // numEnvs
    n * OBS_DIM * 4 + // obs float32
    n * 4 + // rewards float32
    n + // dones uint8
    n + // truncated uint8
    4 + // finalObsCount
    finalObsPairs.length * (4 + OBS_DIM * 4) +
    4 + // infoJsonLen
    infoBytes.length;

  const buf = Buffer.allocUnsafe(totalLen);
  let off = 0;
  buf.writeUInt32LE(n, off);
  off += 4;
  for (let i = 0; i < n; i++) {
    const o = res.obs[i];
    for (let j = 0; j < OBS_DIM; j++) {
      buf.writeFloatLE(o[j], off);
      off += 4;
    }
  }
  for (let i = 0; i < n; i++) {
    buf.writeFloatLE(res.rewards[i], off);
    off += 4;
  }
  for (let i = 0; i < n; i++) {
    buf[off++] = res.dones[i] ? 1 : 0;
  }
  for (let i = 0; i < n; i++) {
    buf[off++] = res.truncated[i] ? 1 : 0;
  }
  buf.writeUInt32LE(finalObsPairs.length, off);
  off += 4;
  for (let k = 0; k < finalObsPairs.length; k++) {
    const pair = finalObsPairs[k];
    buf.writeUInt32LE(pair.idx, off);
    off += 4;
    for (let j = 0; j < OBS_DIM; j++) {
      buf.writeFloatLE(pair.obs[j], off);
      off += 4;
    }
  }
  buf.writeUInt32LE(infoBytes.length, off);
  off += 4;
  infoBytes.copy(buf, off);
  return buf;
}

if (USE_BINARY_IPC) {
  let rxBuf: Buffer = Buffer.alloc(0);
  process.stdin.on('data', (chunk: Buffer) => {
    rxBuf = rxBuf.length === 0 ? chunk : Buffer.concat([rxBuf, chunk]);
    while (rxBuf.length >= 8) {
      const msgType = rxBuf.readUInt32LE(0);
      const payloadLen = rxBuf.readUInt32LE(4);
      if (rxBuf.length < 8 + payloadLen) break;
      const payload = rxBuf.subarray(8, 8 + payloadLen);
      rxBuf = rxBuf.subarray(8 + payloadLen);

      if (msgType === 1) {
        const msg = JSON.parse(payload.toString('utf8'));
        handleMessage(msg);
      } else if (msgType === 2) {
        // Binary step request: [uint32 numEnvs][uint32 patchLen][patchJson][float32 actions (N*3)]
        const numEnvs = payload.readUInt32LE(0);
        const patchLen = payload.readUInt32LE(4);
        if (patchLen > 0) {
          const patch = JSON.parse(payload.subarray(8, 8 + patchLen).toString('utf8'));
          applyConfigPatch(patch, false);
        }
        const actOff = 8 + patchLen;
        const actBytes = payload.subarray(actOff, actOff + numEnvs * 3 * 4);
        const aligned = Buffer.from(actBytes);
        const actionsF32 = new Float32Array(aligned.buffer, aligned.byteOffset, numEnvs * 3);
        const res = runStepBatch(actionsF32);
        writeBinaryFrame(3, encodeBinaryStepResponse(res));
      }
    }
  });
} else {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    handleMessage(JSON.parse(line));
  });
}