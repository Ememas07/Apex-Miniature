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

interface EnvSlot {
  car: CarSimState;
  carId: string;
  carClass: string;
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

function spawnCar(track: CompiledTrack, carId: string, randomStart: boolean): CarSimState {
  const car = createCarSimState({
    id: 'rl_agent',
    name: 'RL Agent',
    isPlayer: false,
    carId,
    livery: { primary: '#ff0000', secondary: '#ffffff', accent: '#000000', number: 1 } as any,
    gridSlot: 0,
    compiledTrack: track,
    compound: 'soft',
    transmissionMode: 'auto',
    bopEnabled: true,
  });

  if (randomStart) {
    const startT = Math.random();
    const sp = sampleTrackAtT(track, startT);
    const halfW = (sp.width ?? track.spec.trackWidth) * 0.5;
    const lat = (Math.random() - 0.5) * halfW * 0.8;
    car.trackT = startT;
    car.lateralOffset = lat;
    car.x = sp.x + sp.nx * lat;
    car.z = sp.z + sp.nz * lat;
    car.heading = Math.atan2(sp.tx, sp.tz);
    const initSpeed = 16 + Math.random() * 18;
    car.speed = initSpeed;
    car.vx = Math.sin(car.heading) * initSpeed;
    car.vz = Math.cos(car.heading) * initSpeed;
  }

  return car;
}

function resetSlot(trackIds?: string[], carIds?: string[], randomStart = true): EnvSlot {
  const tId = trackIds && trackIds.length > 0 ? trackIds[Math.floor(Math.random() * trackIds.length)] : undefined;
  const cPool = carIds && carIds.length > 0 ? carIds : DEFAULT_CARS;
  const cId = cPool[Math.floor(Math.random() * cPool.length)];
  const track = getCompiledTrack(tId);
  const car = spawnCar(track, cId, randomStart);

  return {
    car,
    carId: cId,
    carClass: getCarClass(cId),
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
    [slot.car],
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
      const throttle = Math.max(0, Math.min(1, (act[1] + 1) * 0.5));
      const brake = Math.max(0, Math.min(1, (act[2] + 1) * 0.5));

      const input: ControlInput = {
        steer,
        throttle,
        brake,
        specialPressed: false,
      };

      const prevT = slot.car.trackT;
      const prevDmg = slot.car.aeroDamage;

      for (let s = 0; s < SUBSTEPS; s++) {
        stepCarPhysics(slot.car, input, slot.track, SUB_DT, {
          trackWetness: 0,
          totalLaps: 99,
          isQualifying: true,
          allCars: [slot.car],
          bopEnabled: true,
        });

        const curSp = sampleTrackAtT(slot.track, slot.car.trackT);
        const wallLat = (curSp.width ?? slot.track.spec.trackWidth) * 0.5 + 3.0;
        if (Math.abs(slot.car.lateralOffset) > wallLat) {
          resolveWallContact(
            slot.car,
            curSp,
            wallLat,
            slot.car.lateralOffset > 0 ? 1 : -1,
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
      const wallHit = slot.car.aeroDamage > prevDmg + 0.02;

      let reward = forwardMeters * 0.45;
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

      if (wallHit || absLat > halfW + 5.5 || (slot.stepsInEpisode > 90 && slot.car.speed < 4.0)) {
        reward -= 5.0;
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