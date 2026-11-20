import { CARS } from '../src/game/cars';
import { TRACKS, compileTrack, sampleTrackAtT } from '../src/game/tracks';
import {
  createCarSimState,
  stepCarPhysics,
  resolveWallContact,
  SPEED_KMH_FACTOR,
} from '../src/game/physics';
import {
  buildObservationVector,
  PolicyObsConfig,
} from '../src/game/aiNeuralPolicy';

type SimCar = ReturnType<typeof createCarSimState>;

const compiledTracks = TRACKS.map((t) => compileTrack(t));

let activeTrack = compiledTracks[0];
let activeCarSpec = CARS[0];
let car!: SimCar;
let trafficCars: SimCar[] = [];
let trafficTargetLanes: Map<string, number> = new Map();
let trafficClasses: Map<string, string> = new Map();
let allCars: SimCar[] = [];
let prevTrafficSignedDists: Map<string, number> = new Map();

let skillTarget = 1.0; // [0.65 .. 1.05] target pace multiplier
let activeBop: {
  topSpeedMult?: number;
  gripMult?: number;
  downforceMult?: number;
  brakingMult?: number;
} = {};
let activeObsConfig: PolicyObsConfig | undefined;

let prevTrackT = 0;
let prevSteer = 0;
let prevDamage = 0;
let stepCount = 0;
let consecutiveStallSteps = 0;
const MAX_EPISODE_STEPS = 60 * 150;

function getCarClass(c: any): string {
  return c?.classId ?? c?.carClass ?? c?.category ?? c?.class ?? 'UNKNOWN';
}

function sampleTrackAtDistance(baseT: number, distMeters: number) {
  const dt = distMeters / Math.max(1, activeTrack.totalLength);
  const t = (((baseT + dt) % 1) + 1) % 1;
  return sampleTrackAtT(activeTrack, t);
}

function applyBopOverrides(targetCar: SimCar, bop = activeBop) {
  const anyCar = targetCar as any;
  anyCar.bopMultipliers = {
    topSpeedMult: bop.topSpeedMult ?? 1.0,
    gripMult: bop.gripMult ?? 1.0,
    downforceMult: bop.downforceMult ?? 1.0,
    brakingMult: bop.brakingMult ?? 1.0,
  };
}

function getObservation(): number[] {
  return buildObservationVector(
    car,
    activeTrack,
    allCars,
    prevSteer,
    skillTarget,
    car.bopMultipliers,
    activeObsConfig,
  );
}

function resetEpisode(opts: {
  trackIndex?: number;
  carIndex?: number;
  carId?: string;
  skill?: number;
  solo?: boolean;
  startAtLine?: boolean;
  bop?: typeof activeBop;
  obsConfig?: PolicyObsConfig;
} = {}) {
  activeObsConfig = opts.obsConfig;
  activeTrack =
    opts.trackIndex !== undefined
      ? compiledTracks[opts.trackIndex % compiledTracks.length]
      : compiledTracks[Math.floor(Math.random() * compiledTracks.length)];

  if (opts.carId) {
    activeCarSpec = CARS.find((c) => c.id === opts.carId) ?? CARS[0];
  } else if (opts.carIndex !== undefined) {
    activeCarSpec = CARS[opts.carIndex % CARS.length];
  } else {
    activeCarSpec = CARS[Math.floor(Math.random() * CARS.length)];
  }

  activeBop = opts.bop ?? {};
  // Sample skill targets biased toward higher difficulties while covering Rookie -> Alien
  skillTarget =
    opts.skill !== undefined
      ? opts.skill
      : Math.random() < 0.4
        ? 1.0
        : 0.68 + Math.random() * 0.37;

  car = createCarSimState({
    id: 'rl-agent',
    name: 'RL Agent',
    isPlayer: false,
    carId: activeCarSpec.id,
    livery: activeCarSpec.defaultLivery,
    gridSlot: 0,
    compiledTrack: activeTrack,
    compound: 'soft',
  });
  applyBopOverrides(car, activeBop);

  const startT = opts.startAtLine ? 0.0 : Math.random() * 0.95;
  const sp = sampleTrackAtDistance(startT, 0);
  const halfW = Math.max(1, (sp.width ?? activeTrack.spec.trackWidth) * 0.5);

  car.trackT = sp.t;
  car.prevTrackT = sp.t;
  car.x = sp.x;
  car.y = sp.y;
  car.z = sp.z;
  car.heading = Math.atan2(sp.tx, sp.tz);
  car.speed = opts.startAtLine ? 45 : 35 + Math.random() * 25;
  car.vx = Math.sin(car.heading) * car.speed;
  car.vz = Math.cos(car.heading) * car.speed;
  car.lateralOffset = opts.startAtLine ? 0 : (Math.random() - 0.5) * (halfW * 0.8);

  trafficCars = [];
  trafficTargetLanes.clear();
  trafficClasses.clear();
  prevTrafficSignedDists.clear();

  const numTraffic = opts.solo ? 0 : 5;
  for (let i = 0; i < numTraffic; i++) {
    const tSpec =
      i % 2 === 0
        ? activeCarSpec
        : CARS[Math.floor(Math.random() * CARS.length)];
    const tCar = createCarSimState({
      id: `traffic-${i}`,
      name: `Traffic ${i}`,
      isPlayer: false,
      carId: tSpec.id,
      livery: tSpec.defaultLivery,
      gridSlot: i + 1,
      compiledTrack: activeTrack,
      compound: 'medium',
    });

    const offsetMeters = 18 + i * 42 + Math.random() * 15;
    const tSample = sampleTrackAtDistance(startT, offsetMeters);
    const tHalfW = Math.max(1, (tSample.width ?? activeTrack.spec.trackWidth) * 0.5);

    tCar.trackT = tSample.t;
    tCar.prevTrackT = tSample.t;
    tCar.x = tSample.x;
    tCar.y = tSample.y;
    tCar.z = tSample.z;
    tCar.heading = Math.atan2(tSample.tx, tSample.tz);
    tCar.speed = (30 + Math.random() * 22) * Math.min(1.0, skillTarget + 0.05);
    tCar.vx = Math.sin(tCar.heading) * tCar.speed;
    tCar.vz = Math.cos(tCar.heading) * tCar.speed;
    tCar.lateralOffset = ((i % 3) - 1) * (tHalfW * 0.55);

    trafficTargetLanes.set(tCar.id, tCar.lateralOffset);
    trafficClasses.set(tCar.id, getCarClass(tSpec));
    trafficCars.push(tCar);
    prevTrafficSignedDists.set(tCar.id, offsetMeters);
  }

  allCars = [car, ...trafficCars];
  prevTrackT = car.trackT;
  prevSteer = 0;
  prevDamage = car.aeroDamage;
  stepCount = 0;
  consecutiveStallSteps = 0;

  return getObservation();
}

function stepEpisode(action: [number, number, number]) {
  let steer = Math.max(-1, Math.min(1, action[0]));
  let throttle = Math.max(0, Math.min(1, (action[1] + 1) * 0.5));
  let brake = Math.max(0, Math.min(1, (action[2] + 1) * 0.5));

  const spNow = sampleTrackAtDistance(car.trackT, 0);
  const halfWNow = Math.max(1, (spNow.width ?? activeTrack.spec.trackWidth) * 0.5);
  if (car.speed < 2.5 && stepCount > 60) {
    throttle = Math.max(0.75, throttle);
    brake = 0.0;
    if (Math.abs(car.lateralOffset) > halfWNow * 0.3) {
      const toCenterSteer = car.lateralOffset > 0 ? -0.75 : 0.75;
      steer = steer * 0.25 + toCenterSteer * 0.75;
    }
  }

  const ctx = {
    trackWetness: 0,
    totalLaps: 10,
    isQualifying: false,
    allCars,
  };

  for (const tCar of trafficCars) {
    const tSp = sampleTrackAtDistance(tCar.trackT, 0);
    const tAhead = sampleTrackAtDistance(tCar.trackT, 45);
    const tTrackHeading = Math.atan2(tSp.tx, tSp.tz);
    const tAheadHeading = Math.atan2(tAhead.tx, tAhead.tz);

    let dHead = tAheadHeading - tTrackHeading;
    while (dHead > Math.PI) dHead -= Math.PI * 2;
    while (dHead < -Math.PI) dHead += Math.PI * 2;

    const targetLat = trafficTargetLanes.get(tCar.id) ?? 0;
    const latErr = targetLat - tCar.lateralOffset;
    const desiredHeading = tTrackHeading + Math.max(-0.35, Math.min(0.35, latErr * 0.08));

    let steerErr = desiredHeading - tCar.heading;
    while (steerErr > Math.PI) steerErr -= Math.PI * 2;
    while (steerErr < -Math.PI) steerErr += Math.PI * 2;

    const cornerSeverity = Math.abs(dHead);
    const baseTarget = cornerSeverity > 0.35 ? 28 : cornerSeverity > 0.15 ? 45 : 75;
    const targetSpeed = baseTarget * Math.min(1.0, skillTarget + 0.05);
    const tThrottle = tCar.speed < targetSpeed ? 0.85 : 0.1;
    const tBrake = tCar.speed > targetSpeed + 6 ? 0.75 : 0.0;

    stepCarPhysics(
      tCar,
      {
        throttle: tThrottle,
        brake: tBrake,
        steer: Math.max(-1, Math.min(1, steerErr * 2.4)),
        specialPressed: false,
      },
      activeTrack,
      1 / 60,
      ctx,
    );
  }

  const SUBSTEPS = 2;
  const SUB_DT = (1 / 60) / SUBSTEPS;
  for (let s = 0; s < SUBSTEPS; s++) {
    stepCarPhysics(
      car,
      { throttle, brake, steer, specialPressed: false },
      activeTrack,
      SUB_DT,
      ctx,
    );
    const bSp = sampleTrackAtDistance(car.trackT, 0);
    const bWall = (bSp.width ?? activeTrack.spec.trackWidth) * 0.5 + 3.0;
    if (Math.abs(car.lateralOffset) > bWall) {
      const bSide: 1 | -1 = car.lateralOffset > 0 ? 1 : -1;
      resolveWallContact(car, bSp, bSide * bWall, bSide, SUB_DT);
    }
  }

  stepCount++;

  let deltaT = car.trackT - prevTrackT;
  if (deltaT < -0.5) deltaT += 1;
  if (deltaT > 0.5) deltaT -= 1;
  prevTrackT = car.trackT;

  const progressMeters = deltaT * activeTrack.totalLength;
  const sp = sampleTrackAtDistance(car.trackT, 0);
  const halfW = Math.max(1, (sp.width ?? activeTrack.spec.trackWidth) * 0.5);
  const absLat = Math.abs(car.lateralOffset);

  const anySpec = activeCarSpec as any;
  const stats = anySpec.stats ?? anySpec;
  const refMaxSpeedMs = ((stats.topSpeedKmh ?? 300) / SPEED_KMH_FACTOR) * 0.82;
  const targetPaceMs = refMaxSpeedMs * skillTarget;
  const overspeed = Math.max(0, car.speed - targetPaceMs);

  let reward = progressMeters * 0.6 * skillTarget - overspeed * 0.045;
  let terminated = false;

  if (absLat > halfW + 1.2) {
    reward -= 0.4 * (absLat - (halfW + 1.2));
  }

  const damageDelta = car.aeroDamage - prevDamage;
  if (damageDelta > 0.01) {
    reward -= Math.min(20.0, damageDelta * 220.0);
    prevDamage = car.aeroDamage;
  }

  const hardWallCrash = damageDelta > 2.5 || absLat > halfW + 7.5;
  if (hardWallCrash) {
    reward -= 15.0;
    terminated = true;
  }

  for (const tCar of trafficCars) {
    let dt = tCar.trackT - car.trackT;
    if (dt > 0.5) dt -= 1;
    if (dt < -0.5) dt += 1;
    const signedDist = dt * activeTrack.totalLength;
    const latGap = Math.abs(tCar.lateralOffset - car.lateralOffset);

    if (Math.abs(signedDist) < 4.6 && latGap < 2.1) {
      reward -= 2.5;
    }

    const prevDist = prevTrafficSignedDists.get(tCar.id);
    if (
      prevDist !== undefined &&
      prevDist > 0 &&
      prevDist < 35 &&
      signedDist <= 0 &&
      signedDist > -20 &&
      damageDelta <= 0.005
    ) {
      reward += 3.5 * skillTarget;
    }
    prevTrafficSignedDists.set(tCar.id, signedDist);
  }

  if (car.speed < 2.0 && stepCount > 120) {
    consecutiveStallSteps++;
  } else {
    consecutiveStallSteps = 0;
  }
  if (consecutiveStallSteps >= 90) {
    reward -= 5.0;
    terminated = true;
  }

  reward -= Math.abs(steer - prevSteer) * 0.08;
  prevSteer = steer;

  const truncated = stepCount >= MAX_EPISODE_STEPS;
  return { obs: getObservation(), reward, terminated, truncated, deltaT, speed: car.speed };
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  buffer += chunk;
  let newlineIdx: number;
  while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newlineIdx).trim();
    buffer = buffer.slice(newlineIdx + 1);
    if (!line) continue;
    const cmd = JSON.parse(line);
    if (cmd.type === 'reset') {
      const obs = resetEpisode(cmd);
      process.stdout.write(JSON.stringify({ obs }) + '\n');
    } else if (cmd.type === 'step') {
      const res = stepEpisode(cmd.action);
      process.stdout.write(JSON.stringify(res) + '\n');
    } else if (cmd.type === 'list_cars') {
      const list = CARS.map((c: any, idx: number) => ({
        index: idx,
        id: c.id,
        name: c.name,
        carClass: getCarClass(c),
      }));
      process.stdout.write(JSON.stringify({ cars: list, numTracks: compiledTracks.length }) + '\n');
    }
  }
});