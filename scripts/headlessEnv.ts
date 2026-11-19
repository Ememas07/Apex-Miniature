import * as readline from 'node:readline';
import {
  CarSimState,
  ControlInput,
  createCarSimState,
  resolveWallContact,
  stepCarPhysics,
} from '../src/game/physics';
import { buildObservationVector } from '../src/game/aiNeuralPolicy';
import { CompiledTrack, compileTrack, sampleTrackAtT, TRACKS } from '../src/game/tracks';

interface TrafficBot {
  car: CarSimState;
  targetLaneRatio: number; // -0.55..0.55 of half-width
  paceScale: number; // 0.65..0.92 speed multiplier
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

function computeTrafficControl(bot: TrafficBot, track: CompiledTrack): ControlInput {
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
  const tId = trackIds && trackIds.length > 0 ? trackIds[Math.floor(Math.random() * trackIds.length)] : undefined;
  const cPool = carIds && carIds.length > 0 ? carIds : DEFAULT_CARS;
  const cId = cPool[Math.floor(Math.random() * cPool.length)];
  const track = getCompiledTrack(tId);

  const startT = randomStart ? Math.random() : 0;
  const latRatio = randomStart ? (Math.random() - 0.5) * 0.8 : 0;
  const initSpeed = randomStart ? 16 + Math.random() * 18 : 0;
  const car = spawnCarAt(track, cId, 'rl_agent', startT, latRatio, initSpeed);

  // 60% of slots spawn 4 traffic cars ahead/around the agent so it learns overtaking + pure pace
  const traffic: TrafficBot[] = [];
  if (Math.random() < 0.6) {
    const numTraffic = 4;
    for (let k = 0; k < numTraffic; k++) {
      const offsetMeters = 22 + k * 34 + Math.random() * 14;
      const tOffset = offsetMeters / Math.max(200, track.totalLength);
      const botCarId = cPool[Math.floor(Math.random() * cPool.length)];
      const laneRatio = ((k % 2 === 0 ? 1 : -1) * (0.2 + Math.random() * 0.35));
      const paceScale = 0.62 + Math.random() * 0.3;
      const botInitSpeed = Math.max(14, initSpeed * paceScale);
      const botCar = spawnCarAt(track, botCarId, `traffic_${k}`, startT + tOffset, laneRatio, botInitSpeed);
      traffic.push({ car: botCar, targetLaneRatio: laneRatio, paceScale });
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
    const n: number = msg.numEnvs ?? 32;
    cfgTracks = msg.tracks;
    cfgCars = msg.cars;
    slots = Array.from({ length: n }, () => resetSlot(cfgTracks, cfgCars, true));
    process.stdout.write(JSON.stringify({ obs: slots.map(getObs) }) + '\n');
    return;
  }

  if (msg.cmd === 'step') {
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
      const trafficInputs = slot.traffic.map((bot) => computeTrafficControl(bot, slot.track));

      const prevT = slot.car.trackT;
      const prevDmg = slot.car.aeroDamage;

      for (let s = 0; s < SUBSTEPS; s++) {
        // Step traffic cars first
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
          closeProximityPenalty += (6.0 - dist) * 0.06;
        }
      }

      let reward = forwardMeters * 0.45 - closeProximityPenalty;
      if (slot.car.speed < 15.0) {
        reward -= (15.0 - slot.car.speed) * 0.08;
      }
      if (offTrack) {
        reward -= 1.2 + (absLat - halfW) * 0.35;
      }
      const steerJerk = Math.abs(steer - slot.prevSteer);
      reward -= 0.06 * steerJerk * steerJerk;
      reward -= 0.15 * (throttle * brake);

      let done = false;
      let crashed = false;
      let completedLapTime: number | null = null;

      if (prevT > 0.85 && slot.car.trackT < 0.15 && slot.stepsInEpisode > 150) {
        slot.lapsCompleted++;
        const lapTime = slot.car.lastLapTime ?? 0;
        if (slot.lapsCompleted >= 2 && lapTime >= 60) {
          completedLapTime = lapTime;
          done = true;
        }
      }

      if (carContact || wallOrContactDmg || absLat > halfW + 5.5 || (slot.stepsInEpisode > 90 && slot.car.speed < 4.0)) {
        reward -= carContact ? 4.5 : 5.0;
        crashed = true;
        done = true;
      } else if (slot.stepsInEpisode > 6000) {
        done = true;
      }

      slot.prevSteer = steer;
      infoOut.push({
        trackId: slot.track.spec.id,
        carId: slot.carId,
        carClass: slot.carClass,
        speed: slot.car.speed,
        lapTime: completedLapTime,
        offTrack,
        crashed,
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