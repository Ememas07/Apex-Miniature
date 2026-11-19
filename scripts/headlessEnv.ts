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

const { createCarSimState, resolveWallContact, stepCarPhysics } = await import('../src/game/physics');
const { buildObservationVector } = await import('../src/game/aiNeuralPolicy');
const { compileTrack, sampleTrackAtT, TRACKS } = await import('../src/game/tracks');

interface MlpWeights {
  w0: number[][];
  b0: number[];
  w1: number[][];
  b1: number[];
  w2: number[][];
  b2: number[];
}

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
}

export interface TrafficMix {
  soloRatio: number;
  scriptedRatio: number;
  selfplayRatio: number;
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
  stallStopSpeed: 4.0,
};

const DEFAULT_TRAFFIC_MIX: TrafficMix = {
  soloRatio: 0.3,
  scriptedRatio: 0.3,
  selfplayRatio: 0.4,
};

interface TrafficBot {
  car: CarSimState;
  mode: 'scripted' | 'neural';
  policy: MlpWeights | null;
  targetLaneRatio: number; // -0.55..0.55 of half-width
  paceScale: number; // 0.65..0.92 speed multiplier (scripted) or subtle throttle scale (neural)
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
}

const DEFAULT_CARS = [
  'f1-26-mercedes',
  'porsche-963',
  'oreca-07',
  'porsche-911-gt3-r',
  'porsche-cayman-gt4-rs',
  'porsche-911-gt3-rs',
];

const WEIGHTS_PATH = path.resolve(process.cwd(), 'src/game/aiPolicyWeights.json');
const POOL_DIR = path.resolve(process.cwd(), 'audit/selfplay_pool');

let rewardWeights: RewardWeights = { ...DEFAULT_REWARD_WEIGHTS };
let trafficMix: TrafficMix = { ...DEFAULT_TRAFFIC_MIX };
let activeWeightsPath = WEIGHTS_PATH;
let activePoolDir = POOL_DIR;

let policyPool: MlpWeights[] = [];
let resetCounter = 0;

function parsePolicyWeights(raw: any): MlpWeights | null {
  if (!raw || typeof raw !== 'object') return null;
  // Standard trainPPO.py v2 export format (w0/b0, w1/b1, w2/b2)
  if (raw.w0 && raw.b0 && raw.w1 && raw.b1 && raw.w2 && raw.b2) {
    return { w0: raw.w0, b0: raw.b0, w1: raw.w1, b1: raw.b1, w2: raw.w2, b2: raw.b2 };
  }
  // Fallback for 1-indexed keys
  if (raw.w1 && raw.b1 && raw.w2 && raw.b2 && raw.w3 && raw.b3) {
    return { w0: raw.w1, b0: raw.b1, w1: raw.w2, b1: raw.b2, w2: raw.w3, b2: raw.b3 };
  }
  if (Array.isArray(raw.layers) && raw.layers.length >= 3) {
    const [l1, l2, l3] = raw.layers;
    return {
      w0: l1.w ?? l1.weights,
      b0: l1.b ?? l1.biases,
      w1: l2.w ?? l2.weights,
      b1: l2.b ?? l2.biases,
      w2: l3.w ?? l3.weights,
      b2: l3.b ?? l3.biases,
    };
  }
  return null;
}

function refreshPolicyPool(): void {
  const loaded: MlpWeights[] = [];

  // 1. Always try to load the latest active weights
  try {
    if (fs.existsSync(activeWeightsPath)) {
      const parsed = parsePolicyWeights(JSON.parse(fs.readFileSync(activeWeightsPath, 'utf8')));
      if (parsed) loaded.push(parsed);
    }
  } catch {
    // Ignore transient read errors if trainPPO.py is mid-write
  }

  // 2. Also load up to 6 recent historical snapshots from the active selfplay pool directory
  try {
    if (fs.existsSync(activePoolDir)) {
      const files = fs
        .readdirSync(activePoolDir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .slice(-6);
      for (const file of files) {
        try {
          const parsed = parsePolicyWeights(JSON.parse(fs.readFileSync(path.join(activePoolDir, file), 'utf8')));
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

  if (typeof msg.weightsPath === 'string' && msg.weightsPath.trim()) {
    activeWeightsPath = path.resolve(process.cwd(), msg.weightsPath.trim());
  }
  if (typeof msg.poolDir === 'string' && msg.poolDir.trim()) {
    activePoolDir = path.resolve(process.cwd(), msg.poolDir.trim());
  }
}

function denseLayer(input: number[], w: number[][], b: number[], applyTanh: boolean): number[] {
  const out = new Array<number>(b.length);
  for (let i = 0; i < b.length; i++) {
    const row = w[i];
    let sum = b[i];
    for (let j = 0; j < input.length; j++) {
      sum += row[j] * input[j];
    }
    out[i] = applyTanh ? Math.tanh(sum) : sum;
  }
  return out;
}

function runNeuralPolicy(obs: number[], policy: MlpWeights): ControlInput {
  const h1 = denseLayer(obs, policy.w0, policy.b0, true);
  const h2 = denseLayer(h1, policy.w1, policy.b1, true);
  const act = denseLayer(h2, policy.w2, policy.b2, false);

  const steer = Math.max(-1, Math.min(1, act[0]));
  const rawThrottle = Math.max(-1, Math.min(1, act[1]));
  const rawBrake = Math.max(-1, Math.min(1, act[2]));

  return {
    steer,
    throttle: (rawThrottle + 1) * 0.5,
    brake: (rawBrake + 1) * 0.5,
    specialPressed: false,
  };
}

function getCarClass(carId: string): string {
  if (carId.startsWith('f1-')) return 'F1';
  if (carId.includes('963') || carId.includes('hypercar') || carId.includes('499p') || carId.includes('valkyrie')) return 'Hypercar';
  if (carId.includes('oreca') || carId.includes('ligier') || carId.includes('lmp2')) return 'LMP2';
  if (carId.includes('gt4')) return 'GT4';
  if (carId.includes('gt3')) return 'GT3';
  return 'Other';
}

const compiledTracks = new Map<string, CompiledTrack>();

function getCompiledTrack(trackId?: string): CompiledTrack {
  if (trackId && compiledTracks.has(trackId)) return compiledTracks.get(trackId)!;
  const spec = trackId ? TRACKS.find((t) => t.id === trackId) ?? TRACKS[0] : TRACKS[Math.floor(Math.random() * TRACKS.length)];
  if (!compiledTracks.has(spec.id)) {
    compiledTracks.set(spec.id, compileTrack(spec, 720));
  }
  return compiledTracks.get(spec.id)!;
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

function resetSlot(trackIds?: string[], carIds?: string[], randomStart = true): EnvSlot {
  resetCounter++;
  if (resetCounter % 500 === 0 || (policyPool.length === 0 && trafficMix.selfplayRatio > 0 && resetCounter % 50 === 0)) {
    refreshPolicyPool();
  }

  const tId = trackIds && trackIds.length > 0 ? trackIds[Math.floor(Math.random() * trackIds.length)] : undefined;
  const cPool = carIds && carIds.length > 0 ? carIds : DEFAULT_CARS;
  const cId = cPool[Math.floor(Math.random() * cPool.length)];
  const track = getCompiledTrack(tId);

  const startT = randomStart ? Math.random() : 0;
  const latRatio = randomStart ? (Math.random() - 0.5) * 0.8 : 0;
  const initSpeed = randomStart ? 16 + Math.random() * 18 : 0;
  const car = spawnCarAt(track, cId, 'rl_agent', startT, latRatio, initSpeed);

  // Configurable traffic diet (default: 30% solo hotlap, 30% scripted traffic, 40% neural self-play)
  const traffic: TrafficBot[] = [];
  const roll = Math.random();
  const scriptedCutoff = trafficMix.soloRatio + trafficMix.scriptedRatio;

  if (roll >= trafficMix.soloRatio && roll < scriptedCutoff) {
    // Scripted slower multiclass traffic
    const numTraffic = 4;
    for (let k = 0; k < numTraffic; k++) {
      const offsetMeters = 22 + k * 34 + Math.random() * 14;
      const tOffset = offsetMeters / Math.max(200, track.totalLength);
      const botCarId = cPool[Math.floor(Math.random() * cPool.length)];
      const laneRatio = (k % 2 === 0 ? 1 : -1) * (0.2 + Math.random() * 0.35);
      const paceScale = 0.62 + Math.random() * 0.3;
      const botInitSpeed = Math.max(14, initSpeed * paceScale);
      const botCar = spawnCarAt(track, botCarId, `traffic_${k}`, startT + tOffset, laneRatio, botInitSpeed);
      traffic.push({ car: botCar, mode: 'scripted', policy: null, targetLaneRatio: laneRatio, paceScale });
    }
  } else if (roll >= scriptedCutoff && roll < scriptedCutoff + trafficMix.selfplayRatio && policyPool.length > 0) {
    // Neural self-play: 3 same-class rivals (1 slightly behind, 2 ahead)
    const offsets = [-18 - Math.random() * 10, 16 + Math.random() * 12, 42 + Math.random() * 18];
    for (let k = 0; k < offsets.length; k++) {
      const tOffset = offsets[k] / Math.max(200, track.totalLength);
      const laneRatio = (k % 2 === 0 ? 1 : -1) * (0.18 + Math.random() * 0.32);
      const policy = policyPool[Math.floor(Math.random() * policyPool.length)];
      const paceScale = 0.94 + Math.random() * 0.06;
      const botCar = spawnCarAt(track, cId, `selfplay_${k}`, startT + tOffset, laneRatio, initSpeed);
      traffic.push({ car: botCar, mode: 'neural', policy, targetLaneRatio: laneRatio, paceScale });
    }
  }

  const allCars = [car, ...traffic.map((t) => t.car)];

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
  );
}

let slots: EnvSlot[] = [];
let cfgTracks: string[] | undefined;
let cfgCars: string[] | undefined;

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);

  if (msg.cmd === 'init') {
    policyPool = [];
    applyConfigPatch(msg, true);
    refreshPolicyPool();
    const n: number = msg.numEnvs ?? 32;
    cfgTracks = msg.tracks;
    cfgCars = msg.cars;
    slots = Array.from({ length: n }, () => resetSlot(cfgTracks, cfgCars, true));
    process.stdout.write(JSON.stringify({ obs: slots.map(getObs), poolSize: policyPool.length }) + '\n');
    return;
  }

  if (msg.cmd === 'config') {
    applyConfigPatch(msg, false);
    refreshPolicyPool();
    process.stdout.write(JSON.stringify({ ok: true, poolSize: policyPool.length }) + '\n');
    return;
  }

  if (msg.cmd === 'step') {
    if (msg.trafficMix || msg.rewardWeights) {
      applyConfigPatch(msg, false);
    }
    const actions: number[][] = msg.actions;
    const obsOut: number[][] = [];
    const rewardsOut: number[] = [];
    const donesOut: boolean[] = [];
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
    }[] = [];

    const POLICY_DT = 1 / 30;
    const SUBSTEPS = 4;
    const SUB_DT = POLICY_DT / SUBSTEPS;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const act = actions[i];
      const steer = Math.max(-1, Math.min(1, act[0]));
      const rawThrottle = Math.max(-1, Math.min(1, act[1]));
      const rawBrake = Math.max(-1, Math.min(1, act[2]));
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
            resolveWallContact(bot.car, bSp, bWall, bot.car.lateralOffset > 0 ? 1 : -1, SUB_DT);
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
      }

      slot.stepsInEpisode++;

      let deltaT = slot.car.trackT - prevT;
      if (deltaT < -0.5) deltaT += 1.0;
      if (deltaT > 0.5) deltaT -= 1.0;
      const forwardMeters = deltaT * slot.track.totalLength;

      const sp = sampleTrackAtT(slot.track, slot.car.trackT);
      const halfW = (sp.width ?? slot.track.spec.trackWidth) * 0.5;
      const absLat = Math.abs(slot.car.lateralOffset);
      const offTrack = absLat > halfW + 1.0;
      const wallOrContactDmg = slot.car.aeroDamage > prevDmg + 0.02;

      // Check car-to-car proximity and physical contact
      let carContact = false;
      let closeProximityPenalty = 0;
      for (let b = 0; b < slot.traffic.length; b++) {
        const other = slot.traffic[b].car;
        const dx = other.x - slot.car.x;
        const dz = other.z - slot.car.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < 6.25) {
          // Within 2.5m center-to-center = physical collision
          carContact = true;
          break;
        } else if (distSq < 36.0) {
          // Soft warning zone (2.5m..6.0m) encourages clean lateral pass instead of tailgating
          const dist = Math.sqrt(distSq);
          closeProximityPenalty += (6.0 - dist) * rewardWeights.closeProximity;
        }
      }

      let reward = forwardMeters * rewardWeights.forwardProgress - closeProximityPenalty;
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
      if (offTrack) {
        reward -= rewardWeights.offTrackBase + (absLat - halfW) * rewardWeights.offTrackSlope;
      }
      const steerJerk = Math.abs(steer - slot.prevSteer);
      reward -= rewardWeights.steerJerk * steerJerk * steerJerk;
      reward -= rewardWeights.throttleBrakeOverlap * (throttle * brake);

      let done = false;
      let crashed = false;
      let carCrash = false;
      let wallCrash = false;
      let completedLapTime: number | null = null;

      if (prevT > 0.85 && slot.car.trackT < 0.15 && slot.stepsInEpisode > 150) {
        slot.lapsCompleted++;
        const lapTime = slot.car.lastLapTime ?? 0;
        if (slot.lapsCompleted >= 2 && lapTime >= 20) {
          completedLapTime = lapTime;
          done = true;
        }
      }

      // Scale episode cap by track length (~2.2x a 90 km/h lap, min 6000 steps) so long tracks like Le Mans can finish 2 crossings
      const maxSteps = Math.max(6000, Math.ceil((slot.track.totalLength / 25) * 30 * 2.2));

      if (carContact) {
        reward -= rewardWeights.carCrash;
        crashed = true;
        carCrash = true;
        done = true;
      } else if (
        wallOrContactDmg ||
        absLat > halfW + 5.5 ||
        (slot.stepsInEpisode > 90 && slot.car.speed < rewardWeights.stallStopSpeed)
      ) {
        reward -= rewardWeights.wallCrash;
        crashed = true;
        wallCrash = true;
        done = true;
      } else if (slot.stepsInEpisode > maxSteps) {
        done = true;
      }

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
        wallCrash,
      });

      if (done) {
        slots[i] = resetSlot(cfgTracks, cfgCars, true);
      }

      obsOut.push(getObs(slots[i]));
      rewardsOut.push(reward);
      donesOut.push(done);
    }

    process.stdout.write(JSON.stringify({ obs: obsOut, rewards: rewardsOut, dones: donesOut, info: infoOut }) + '\n');
  }
});