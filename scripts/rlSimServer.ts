import { CARS } from '../src/game/cars';
import { TRACKS, compileTrack } from '../src/game/tracks';
import {
  createCarSimState,
  stepCarPhysics,
  SPEED_KMH_FACTOR,
} from '../src/game/physics';

type SimCar = ReturnType<typeof createCarSimState>;

const compiledTracks = TRACKS.map((t) => compileTrack(t));
const LOOKAHEAD_METERS = [12, 25, 42, 65, 95, 135, 185, 250];
const TRAFFIC_SLOTS = 4; // 4 * 4 = 16 traffic floats + 26 solo floats + 1 skillTarget = 43 total

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

let prevTrackT = 0;
let prevSteer = 0;
let prevDamage = 0;
let stepCount = 0;
const MAX_EPISODE_STEPS = 60 * 150;

function sampleTrackAtDistance(baseT: number, distMeters: number) {
  const dt = distMeters / Math.max(1, activeTrack.totalLength);
  const t = (((baseT + dt) % 1) + 1) % 1;
  const idx = Math.min(
    activeTrack.samples.length - 1,
    Math.floor(t * activeTrack.samples.length),
  );
  return activeTrack.samples[idx];
}

function applyBopOverrides(targetCar: SimCar, bop = activeBop) {
  const anyCar = targetCar as any;
  if (anyCar.spec) {
    anyCar.spec = {
      ...anyCar.spec,
      topSpeedKmh: (anyCar.spec.topSpeedKmh ?? 300) * (bop.topSpeedMult ?? 1.0),
      grip: (anyCar.spec.grip ?? 1.2) * (bop.gripMult ?? 1.0),
      downforce: (anyCar.spec.downforce ?? 1.0) * (bop.downforceMult ?? 1.0),
      braking: (anyCar.spec.braking ?? 1.2) * (bop.brakingMult ?? 1.0),
    };
  }
}

function getObservation(): number[] {
  const sp = sampleTrackAtDistance(car.trackT, 0);
  const halfW = Math.max(1, (sp.width ?? activeTrack.spec.trackWidth) * 0.5);
  const trackHeading = Math.atan2(sp.tx, sp.tz);

  let headingErr = car.heading - trackHeading;
  while (headingErr > Math.PI) headingErr -= Math.PI * 2;
  while (headingErr < -Math.PI) headingErr += Math.PI * 2;

  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  const forwardVel = car.vx * sinH + car.vz * cosH;
  const lateralVel = car.vx * cosH - car.vz * sinH;

  const anySpec = activeCarSpec as any;
  const stats = anySpec.stats ?? anySpec;
  const normTopSpeed =
    ((stats.topSpeedKmh ?? stats.topSpeed ?? 300) * (activeBop.topSpeedMult ?? 1.0)) / 360;
  const normGrip = ((stats.grip ?? 1.2) * (activeBop.gripMult ?? 1.0)) / 2.2;
  const normDownforce = ((stats.downforce ?? 1.0) * (activeBop.downforceMult ?? 1.0)) / 3.0;
  const normBraking = ((stats.braking ?? 1.2) * (activeBop.brakingMult ?? 1.0)) / 2.2;

  const obs: number[] = [
    forwardVel / 100,
    lateralVel / 30,
    car.lateralOffset / halfW,
    headingErr / Math.PI,
    ((car as any).yawRate ?? 0) / 3.0,
    prevSteer,
    normTopSpeed,
    normGrip,
    normDownforce,
    normBraking,
  ];

  // 16 lookahead track curvature & heading delta features
  for (const dist of LOOKAHEAD_METERS) {
    const ahead = sampleTrackAtDistance(car.trackT, dist);
    const aheadHeading = Math.atan2(ahead.tx, ahead.tz);
    let dHeading = aheadHeading - trackHeading;
    while (dHeading > Math.PI) dHeading -= Math.PI * 2;
    while (dHeading < -Math.PI) dHeading += Math.PI * 2;

    const curv = (ahead as any).curvature ?? 0;
    obs.push(Math.max(-1, Math.min(1, curv * 40)));
    obs.push(dHeading / Math.PI);
  }

  // 16 traffic radar features
  const nearby: {
    absDist: number;
    relLong: number;
    relLat: number;
    relSpeed: number;
    sameClass: number;
  }[] = [];

  for (const other of trafficCars) {
    let dt = other.trackT - car.trackT;
    if (dt > 0.5) dt -= 1;
    if (dt < -0.5) dt += 1;
    const relLong = dt * activeTrack.totalLength;
    if (relLong < -25 || relLong > 85) continue;

    const otherClass = trafficClasses.get(other.id);
    const sameClass =
      otherClass !== undefined && otherClass === (activeCarSpec as any).carClass ? 1.0 : 0.0;

    nearby.push({
      absDist: Math.abs(relLong),
      relLong: Math.max(-1, Math.min(1, relLong / 80)),
      relLat: Math.max(-2, Math.min(2, (other.lateralOffset - car.lateralOffset) / halfW)),
      relSpeed: Math.max(-1, Math.min(1, (car.speed - other.speed) / 50)),
      sameClass,
    });
  }

  nearby.sort((a, b) => a.absDist - b.absDist);

  for (let i = 0; i < TRAFFIC_SLOTS; i++) {
    if (i < nearby.length) {
      obs.push(nearby[i].relLong, nearby[i].relLat, nearby[i].relSpeed, nearby[i].sameClass);
    } else {
      obs.push(1.0, 0.0, 0.0, 0.0);
    }
  }

  // Input #43: Target Skill / Pace Scalar [0.65 .. 1.05]
  obs.push(skillTarget);

  return obs; // 43 floats total
}

function resetEpisode(opts: {
  trackIndex?: number;
  carIndex?: number;
  carId?: string;
  skill?: number;
  solo?: boolean;
  startAtLine?: boolean;
  bop?: typeof activeBop;
} = {}) {
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
    trafficClasses.set(tCar.id, (tSpec as any).carClass ?? '');
    trafficCars.push(tCar);
    prevTrafficSignedDists.set(tCar.id, offsetMeters);
  }

  allCars = [car, ...trafficCars];
  prevTrackT = car.trackT;
  prevSteer = 0;
  prevDamage = car.aeroDamage;
  stepCount = 0;

  return getObservation();
}

function stepEpisode(action: [number, number, number]) {
  const steer = Math.max(-1, Math.min(1, action[0]));
  const throttle = Math.max(0, Math.min(1, (action[1] + 1) * 0.5));
  const brake = Math.max(0, Math.min(1, (action[2] + 1) * 0.5));

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

  stepCarPhysics(
    car,
    { throttle, brake, steer, specialPressed: false },
    activeTrack,
    1 / 60,
    ctx,
  );

  stepCount++;

  let deltaT = car.trackT - prevTrackT;
  if (deltaT < -0.5) deltaT += 1;
  if (deltaT > 0.5) deltaT -= 1;
  prevTrackT = car.trackT;

  const progressMeters = deltaT * activeTrack.totalLength;
  const sp = sampleTrackAtDistance(car.trackT, 0);
  const halfW = Math.max(1, (sp.width ?? activeTrack.spec.trackWidth) * 0.5);
  const absLat = Math.abs(car.lateralOffset);

  // Skill-conditioned reward:
  // At skillTarget = 1.0 -> full reward for max speed.
  // At skillTarget < 1.0 -> penalizes exceeding target pace so AI brakes earlier & drives naturally slower.
  const anySpec = activeCarSpec as any;
  const stats = anySpec.stats ?? anySpec;
  const refMaxSpeedMs = ((stats.topSpeedKmh ?? 300) / SPEED_KMH_FACTOR) * 0.82;
  const targetPaceMs = refMaxSpeedMs * skillTarget;
  const overspeed = Math.max(0, car.speed - targetPaceMs);

  let reward = progressMeters * 0.6 * skillTarget - overspeed * 0.045;
  let terminated = false;

  if (absLat > halfW + 0.6) {
    reward -= 0.4 * (absLat - (halfW + 0.6));
  }
  if (absLat > halfW + 4.5) {
    reward -= 15.0;
    terminated = true;
  }

  const damageDelta = car.aeroDamage - prevDamage;
  if (damageDelta > 0.005) {
    reward -= Math.min(20.0, damageDelta * 220.0);
    prevDamage = car.aeroDamage;
    if (damageDelta > 0.06) {
      terminated = true;
    }
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

  if (car.speed * SPEED_KMH_FACTOR < 15 && stepCount > 60) {
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
        carClass: c.carClass ?? 'UNKNOWN',
      }));
      process.stdout.write(JSON.stringify({ cars: list, numTracks: compiledTracks.length }) + '\n');
    }
  }
});