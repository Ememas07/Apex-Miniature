import fs from 'fs';
import path from 'path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CARS, CAR_CLASSES } from '../src/game/cars';
import { TRACKS, compileTrack } from '../src/game/tracks';
import {
  computeAIControl,
  createCarSimState,
  stepCarPhysics,
  SPEED_KMH_FACTOR,
} from '../src/game/physics';
import { CarClassId } from '../src/game/types';

const __filename = fileURLToPath(import.meta.url);
const TSX_CLI_PATH = path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs');

const FLAGSHIP_TRACK_IDS = [
  'spa-francorchamps',
  'monza',
  'suzuka',
  'silverstone',
  'laguna-seca',
  'le-mans',
  'monaco',
] as const;

// Include flagship tracks first, followed by any additional tracks defined in TRACKS
const ALL_BENCHMARK_TRACK_IDS: string[] = [
  ...FLAGSHIP_TRACK_IDS.filter((id) => TRACKS.some((t) => t.id === id)),
  ...TRACKS.map((t) => t.id).filter(
    (id) => !(FLAGSHIP_TRACK_IDS as readonly string[]).includes(id),
  ),
];

// Real-world motorsport reference figures (Pole / Race pace + Speed traps) across all 10 classes
const IRL_REFERENCE: Record<
  string,
  Partial<Record<CarClassId, { lapSec: string; vmaxKmh: string; sourceNote: string }>>
> = {
  'spa-francorchamps': {
    [CarClassId.F1_2026]: { lapSec: '102.0–105.0s (1:42–1:45)', vmaxKmh: '335–345', sourceNote: 'F1 Spa GP Quali/Race' },
    [CarClassId.F1_2021]: { lapSec: '102.5–106.0s (1:42–1:46)', vmaxKmh: '332–342', sourceNote: 'F1 2021 Spa Quali' },
    [CarClassId.F1_2005]: { lapSec: '106.0–109.5s (1:46–1:49)', vmaxKmh: '335–345', sourceNote: 'F1 2005 V10 Spa' },
    [CarClassId.HYPERCAR_GTP]: { lapSec: '122.5–126.0s (2:02–2:06)', vmaxKmh: '315–325', sourceNote: 'WEC 6h Spa Hyperpole' },
    [CarClassId.LMP2]: { lapSec: '126.5–130.0s (2:06–2:10)', vmaxKmh: '300–310', sourceNote: 'ELMS / WEC LMP2 Spa' },
    [CarClassId.GT3]: { lapSec: '136.0–140.0s (2:16–2:20)', vmaxKmh: '275–285', sourceNote: 'GTWC/WEC LMGT3 Spa' },
    [CarClassId.GT4]: { lapSec: '148.0–153.0s (2:28–2:33)', vmaxKmh: '250–262', sourceNote: 'GT4 European Series Spa' },
    [CarClassId.SUPERCAR]: { lapSec: '142.0–148.0s (2:22–2:28)', vmaxKmh: '295–315', sourceNote: 'Hypercar/Supercar Trackday' },
    [CarClassId.TRACK_COUPE]: { lapSec: '154.0–160.0s (2:34–2:40)', vmaxKmh: '240–255', sourceNote: 'Clubsport Track Coupe' },
  },
  monza: {
    [CarClassId.F1_2026]: { lapSec: '79.5–82.5s (1:19–1:22)', vmaxKmh: '348–356', sourceNote: 'F1 Italian GP Low-Downforce' },
    [CarClassId.F1_2021]: { lapSec: '79.5–82.0s (1:19–1:22)', vmaxKmh: '345–355', sourceNote: 'F1 2021 Monza Quali' },
    [CarClassId.F1_2005]: { lapSec: '80.5–83.0s (1:20–1:23)', vmaxKmh: '355–368', sourceNote: 'F1 2005 V10 Monza' },
    [CarClassId.HYPERCAR_GTP]: { lapSec: '95.0–98.5s (1:35–1:38)', vmaxKmh: '330–340', sourceNote: 'WEC 6h Monza' },
    [CarClassId.LMP2]: { lapSec: '98.5–102.0s (1:38–1:42)', vmaxKmh: '312–322', sourceNote: 'ELMS LMP2 Monza' },
    [CarClassId.GT3]: { lapSec: '106.5–109.5s (1:46–1:49)', vmaxKmh: '285–295', sourceNote: 'GTWC/WEC GT3 Monza' },
    [CarClassId.GT4]: { lapSec: '116.0–120.0s (1:56–2:00)', vmaxKmh: '258–268', sourceNote: 'GT4 European Series Monza' },
    [CarClassId.SUPERCAR]: { lapSec: '111.0–116.0s (1:51–1:56)', vmaxKmh: '310–330', sourceNote: 'Road Supercar Monza' },
    [CarClassId.TRACK_COUPE]: { lapSec: '121.0–126.0s (2:01–2:06)', vmaxKmh: '245–260', sourceNote: 'Clubsport Coupe Monza' },
  },
  suzuka: {
    [CarClassId.F1_2026]: { lapSec: '88.0–91.5s (1:28–1:31)', vmaxKmh: '322–332', sourceNote: 'F1 Japanese GP' },
    [CarClassId.F1_2021]: { lapSec: '87.5–91.0s (1:27–1:31)', vmaxKmh: '320–330', sourceNote: 'F1 High-Downforce Suzuka' },
    [CarClassId.F1_2005]: { lapSec: '90.0–93.0s (1:30–1:33)', vmaxKmh: '322–332', sourceNote: 'F1 2005 V10 Suzuka' },
    [CarClassId.HYPERCAR_GTP]: { lapSec: '105.0–109.0s (1:45–1:49)', vmaxKmh: '305–315', sourceNote: 'Super GT / Prototype Suzuka' },
    [CarClassId.GT3]: { lapSec: '120.0–124.0s (2:00–2:04)', vmaxKmh: '275–285', sourceNote: 'Suzuka 1000km / GT3' },
    [CarClassId.SUPERCAR]: { lapSec: '126.0–132.0s (2:06–2:12)', vmaxKmh: '290–308', sourceNote: 'Production Supercar Suzuka' },
  },
  silverstone: {
    [CarClassId.F1_2026]: { lapSec: '85.5–89.0s (1:25–1:29)', vmaxKmh: '325–336', sourceNote: 'F1 British GP' },
    [CarClassId.F1_2021]: { lapSec: '86.0–89.5s (1:26–1:29)', vmaxKmh: '322–332', sourceNote: 'F1 2021 British GP' },
    [CarClassId.F1_2005]: { lapSec: '80.0–83.0s (1:20–1:23)', vmaxKmh: '318–328', sourceNote: 'F1 2005 Silverstone' },
    [CarClassId.HYPERCAR_GTP]: { lapSec: '101.0–105.0s (1:41–1:45)', vmaxKmh: '310–320', sourceNote: 'ELMS / WEC Silverstone' },
    [CarClassId.LMP2]: { lapSec: '104.0–108.0s (1:44–1:48)', vmaxKmh: '295–305', sourceNote: 'ELMS 4h Silverstone' },
    [CarClassId.GT3]: { lapSec: '117.0–121.0s (1:57–2:01)', vmaxKmh: '272–282', sourceNote: 'British GT / GTWC' },
    [CarClassId.GT4]: { lapSec: '127.0–131.5s (2:07–2:11)', vmaxKmh: '245–258', sourceNote: 'British GT GT4' },
    [CarClassId.TRACK_COUPE]: { lapSec: '132.0–137.0s (2:12–2:17)', vmaxKmh: '238–252', sourceNote: 'Track Coupe Silverstone' },
  },
  'laguna-seca': {
    [CarClassId.HYPERCAR_GTP]: { lapSec: '72.0–75.0s (1:12–1:15)', vmaxKmh: '275–285', sourceNote: 'IMSA WeatherTech Laguna' },
    [CarClassId.LMP2]: { lapSec: '75.0–78.0s (1:15–1:18)', vmaxKmh: '265–275', sourceNote: 'IMSA LMP2 Laguna' },
    [CarClassId.GT3]: { lapSec: '82.5–85.5s (1:22–1:25)', vmaxKmh: '250–262', sourceNote: 'IMSA GTD Pro Laguna' },
    [CarClassId.GT4]: { lapSec: '89.5–93.0s (1:29–1:33)', vmaxKmh: '232–244', sourceNote: 'IMSA Pilot Challenge GS' },
    [CarClassId.SUPERCAR]: { lapSec: '86.0–90.0s (1:26–1:30)', vmaxKmh: '262–278', sourceNote: 'MotorTrend / Road Supercar' },
    [CarClassId.TRACK_COUPE]: { lapSec: '92.0–96.0s (1:32–1:36)', vmaxKmh: '225–238', sourceNote: 'Track Coupe Laguna' },
  },
  'le-mans': {
    [CarClassId.HYPERCAR_GTP]: { lapSec: '204.0–209.0s (3:24–3:29)', vmaxKmh: '335–345', sourceNote: '24h Le Mans Hyperpole' },
    [CarClassId.LMP2]: { lapSec: '213.0–218.0s (3:33–3:38)', vmaxKmh: '315–325', sourceNote: '24h Le Mans LMP2' },
    [CarClassId.GT3]: { lapSec: '234.0–240.0s (3:54–4:00)', vmaxKmh: '285–296', sourceNote: '24h Le Mans LMGT3' },
  },
  monaco: {
    [CarClassId.F1_2026]: { lapSec: '70.0–73.5s (1:10–1:13)', vmaxKmh: '288–296', sourceNote: 'F1 Monaco GP' },
    [CarClassId.F1_2021]: { lapSec: '70.3–73.5s (1:10–1:13)', vmaxKmh: '286–295', sourceNote: 'F1 2021 Monaco Quali' },
    [CarClassId.F1_2005]: { lapSec: '73.5–76.5s (1:13–1:16)', vmaxKmh: '282–292', sourceNote: 'F1 2005 Monaco GP' },
    [CarClassId.FORMULA_E]: { lapSec: '86.0–90.0s (1:26–1:30)', vmaxKmh: '245–265', sourceNote: 'Monaco E-Prix Gen3 Evo' },
  },
};

function fmtTime(sec: number): string {
  const mins = Math.floor(sec / 60);
  const rem = sec - mins * 60;
  return mins > 0 ? `${mins}:${rem.toFixed(2).padStart(5, '0')}` : `${sec.toFixed(2)}s`;
}

function measureStraightLineDyno() {
  const baseTrack = compileTrack(TRACKS.find((t) => t.id === 'monza') ?? TRACKS[0]);
  const straightWaypoints = Array.from({ length: 100 }, (_, i) => ({
    x: 0,
    y: 0,
    z: i * 100,
    banking: 0,
    width: 24,
  }));
  const flatTrack = {
    ...baseTrack,
    spec: { ...baseTrack.spec, waypoints: straightWaypoints, lengthMeters: 10000 },
    totalLength: 10000,
    samples: Array.from({ length: 1000 }, (_, i) => ({
      t: i / 1000,
      x: 0,
      y: 0,
      z: i * 10,
      tx: 0,
      ty: 0,
      tz: 1,
      nx: 1,
      nz: 0,
      curvature: 0,
      banking: 0,
      width: 24,
      pitch: 0,
    })),
    pitEntryT: 0.99,
    pitExitT: 0.001,
  };

  const results: Record<
    string,
    {
      id: string;
      name: string;
      classId: CarClassId;
      t100: number | null;
      t200: number | null;
      baseVmax: number;
      specialVmax: number;
    }
  > = {};

  for (const spec of CARS) {
    // 1. Base acceleration & Vmax run
    const car = createCarSimState({
      id: spec.id,
      name: spec.name,
      isPlayer: true,
      carId: spec.id,
      livery: spec.defaultLivery,
      gridSlot: 1,
      compiledTrack: flatTrack as any,
      compound: 'soft',
    });
    car.x = 0;
    car.z = 50;
    car.y = 0;
    car.trackT = 0.005;
    car.heading = 0;
    car.lateralOffset = 0;

    let t100: number | null = null;
    let t200: number | null = null;
    let baseVmax = 0;
    for (let tick = 1; tick <= 60 * 30; tick++) {
      stepCarPhysics(
        car,
        { throttle: 1, brake: 0, steer: 0, specialPressed: false },
        flatTrack as any,
        1 / 60,
        { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [car] },
      );
      const kmh = car.speed * SPEED_KMH_FACTOR;
      if (kmh > baseVmax) baseVmax = kmh;
      if (t100 === null && kmh >= 100) t100 = tick / 60;
      if (t200 === null && kmh >= 200) t200 = tick / 60;
    }

    // 2. Special-active Vmax probe
    const carSp = createCarSimState({
      id: spec.id + '-sp',
      name: spec.name,
      isPlayer: true,
      carId: spec.id,
      livery: spec.defaultLivery,
      gridSlot: 1,
      compiledTrack: flatTrack as any,
      compound: 'soft',
    });
    carSp.x = 0;
    carSp.z = 50;
    carSp.y = 0;
    carSp.trackT = 0.005;
    carSp.heading = 0;
    carSp.lateralOffset = 0;
    carSp.speed = baseVmax / SPEED_KMH_FACTOR;

    let specialVmax = baseVmax;
    for (let tick = 1; tick <= 60 * 10; tick++) {
      carSp.specialCharge = 100;
      stepCarPhysics(
        carSp,
        {
          throttle: 1,
          brake: 0,
          steer: 0,
          specialPressed: true,
          specialJustPressed: tick === 1,
        },
        flatTrack as any,
        1 / 60,
        { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [carSp] },
      );
      const kmh = carSp.speed * SPEED_KMH_FACTOR;
      if (kmh > specialVmax) specialVmax = kmh;
    }

    results[spec.id] = {
      id: spec.id,
      name: spec.name,
      classId: spec.classId,
      t100,
      t200,
      baseVmax,
      specialVmax,
    };
  }
  return results;
}

function simulateCarFlyingLap(
  spec: (typeof CARS)[0],
  track: ReturnType<typeof compileTrack>,
) {
  const halfW = track.spec.trackWidth * 0.5;
  const car = createCarSimState({
    id: spec.id,
    name: spec.name,
    isPlayer: false,
    carId: spec.id,
    livery: spec.defaultLivery,
    gridSlot: 0,
    compiledTrack: track,
    compound: 'soft',
    personality: 'Metronome',
    aiPaceMultiplier: 1.07,
  });

  // Spawn at t=0.68 rolling at 42 m/s for a clean flying lap across S/F
  const startT = 0.68;
  const sp = track.samples[Math.floor(startT * track.samples.length)];
  car.trackT = sp.t;
  car.prevTrackT = sp.t;
  car.x = sp.x;
  car.y = sp.y;
  car.z = sp.z;
  car.heading = Math.atan2(sp.tx, sp.tz);
  car.speed = 42;
  car.vx = Math.sin(car.heading) * car.speed;
  car.vz = Math.cos(car.heading) * car.speed;
  car.lateralOffset = 0;

  const dt = 1 / 60;
  let startedFlyingLap = false;
  let lapElapsed = 0;
  let s1End = 0;
  let s2End = 0;
  let trapKmh = 0;
  let maxAbsLat = 0;
  let offTrackTicks = 0;
  let totalFlyingTicks = 0;
  let prevDmg = 0;
  let wallHits = 0;

  for (let tick = 0; tick < 60 * 420; tick++) {
    const ai = computeAIControl(car, track, [car], dt, 0);
    const beforeT = car.trackT;
    stepCarPhysics(car, ai, track, dt, {
      trackWetness: 0,
      totalLaps: 10,
      isQualifying: false,
      allCars: [car],
    });

    const crossedSF = beforeT > 0.8 && car.trackT < 0.2;
    if (!startedFlyingLap) {
      if (crossedSF) {
        startedFlyingLap = true;
        lapElapsed = 0;
        s1End = 0;
        s2End = 0;
        trapKmh = 0;
        maxAbsLat = 0;
        offTrackTicks = 0;
        totalFlyingTicks = 0;
        wallHits = 0;
        prevDmg = car.aeroDamage;
      }
      continue;
    }

    lapElapsed += dt;
    totalFlyingTicks++;
    const kmh = car.speed * SPEED_KMH_FACTOR;
    if (kmh > trapKmh) trapKmh = kmh;
    if (Math.abs(car.lateralOffset) > maxAbsLat) maxAbsLat = Math.abs(car.lateralOffset);
    if (Math.abs(car.lateralOffset) > halfW + 1.8) offTrackTicks++;
    if (car.aeroDamage > prevDmg + 0.05) {
      wallHits++;
      prevDmg = car.aeroDamage;
    }

    if (s1End === 0 && car.trackT >= 0.333) {
      s1End = lapElapsed;
    }
    if (s2End === 0 && car.trackT >= 0.667) {
      s2End = lapElapsed;
    }
    if (crossedSF && lapElapsed > 15) {
      const s1 = s1End || lapElapsed / 3;
      const s2 = (s2End || (lapElapsed * 2) / 3) - s1;
      const s3 = lapElapsed - (s1 + s2);
      return {
        trackId: track.spec.id,
        carId: spec.id,
        carName: spec.name,
        classId: spec.classId,
        s1,
        s2,
        s3,
        totalLap: lapElapsed,
        trapKmh,
        maxAbsLat,
        halfWidth: halfW,
        offTrackPct: (offTrackTicks / Math.max(1, totalFlyingTicks)) * 100,
        wallHits,
      };
    }
  }
  return null;
}

function runFlyingLapBenchmark(
  trackIdsToRun: string[],
  filterPairs?: Array<{ trackId: string; classId: CarClassId }>,
) {
  const trackIds = filterPairs
    ? Array.from(new Set(filterPairs.map((p) => p.trackId)))
    : trackIdsToRun;
  const compiledTracks = trackIds
    .map((id) => TRACKS.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .map((t) => compileTrack(t));

  const lapResults: Array<{
    trackId: string;
    carId: string;
    carName: string;
    classId: CarClassId;
    s1: number;
    s2: number;
    s3: number;
    totalLap: number;
    trapKmh: number;
    maxAbsLat: number;
    halfWidth: number;
    offTrackPct: number;
    wallHits: number;
  }> = [];

  for (const track of compiledTracks) {
    const carsForTrack = filterPairs
      ? CARS.filter((c) => filterPairs.some((p) => p.trackId === track.spec.id && p.classId === c.classId))
      : CARS;
    for (const spec of carsForTrack) {
      const res = simulateCarFlyingLap(spec, track);
      if (res) {
        lapResults.push(res);
      }
    }
  }
  return lapResults;
}

// Expanded target matrix covering ALL 10 CarClassIds across diverse track archetypes
const TARGET_BENCHMARKS = [
  // GT3
  { trackId: 'spa-francorchamps', classId: CarClassId.GT3, car: 'gt3', targetLapSec: 137.5, targetTrapKmh: 280 },
  { trackId: 'monza', classId: CarClassId.GT3, car: 'gt3', targetLapSec: 107.5, targetTrapKmh: 292 },
  { trackId: 'laguna-seca', classId: CarClassId.GT3, car: 'gt3', targetLapSec: 84.0, targetTrapKmh: 256 },
  // HYPERCAR_GTP
  { trackId: 'spa-francorchamps', classId: CarClassId.HYPERCAR_GTP, car: 'hypercar_gtp', targetLapSec: 123.0, targetTrapKmh: 320 },
  { trackId: 'le-mans', classId: CarClassId.HYPERCAR_GTP, car: 'hypercar_gtp', targetLapSec: 206.0, targetTrapKmh: 340 },
  // LMP2
  { trackId: 'le-mans', classId: CarClassId.LMP2, car: 'lmp2', targetLapSec: 215.5, targetTrapKmh: 320 },
  { trackId: 'silverstone', classId: CarClassId.LMP2, car: 'lmp2', targetLapSec: 106.0, targetTrapKmh: 300 },
  // GT4
  { trackId: 'silverstone', classId: CarClassId.GT4, car: 'gt4', targetLapSec: 129.0, targetTrapKmh: 252 },
  { trackId: 'laguna-seca', classId: CarClassId.GT4, car: 'gt4', targetLapSec: 91.0, targetTrapKmh: 238 },
  // F1_2026
  { trackId: 'suzuka', classId: CarClassId.F1_2026, car: 'f1_2026', targetLapSec: 89.5, targetTrapKmh: 332 },
  { trackId: 'monaco', classId: CarClassId.F1_2026, car: 'f1_2026', targetLapSec: 71.0, targetTrapKmh: 292 },
  // F1_2021
  { trackId: 'silverstone', classId: CarClassId.F1_2021, car: 'f1_2021', targetLapSec: 87.5, targetTrapKmh: 328 },
  { trackId: 'monza', classId: CarClassId.F1_2021, car: 'f1_2021', targetLapSec: 80.5, targetTrapKmh: 350 },
  // F1_2005
  { trackId: 'monza', classId: CarClassId.F1_2005, car: 'f1_2005', targetLapSec: 81.5, targetTrapKmh: 360 },
  { trackId: 'suzuka', classId: CarClassId.F1_2005, car: 'f1_2005', targetLapSec: 91.5, targetTrapKmh: 326 },
  // FORMULA_E
  { trackId: 'monaco', classId: CarClassId.FORMULA_E, car: 'formula_e', targetLapSec: 87.5, targetTrapKmh: 255 },
  // SUPERCAR
  { trackId: 'monza', classId: CarClassId.SUPERCAR, car: 'supercar', targetLapSec: 113.5, targetTrapKmh: 320 },
  { trackId: 'laguna-seca', classId: CarClassId.SUPERCAR, car: 'supercar', targetLapSec: 88.0, targetTrapKmh: 270 },
  // TRACK_COUPE
  { trackId: 'silverstone', classId: CarClassId.TRACK_COUPE, car: 'track_coupe', targetLapSec: 134.5, targetTrapKmh: 245 },
  { trackId: 'laguna-seca', classId: CarClassId.TRACK_COUPE, car: 'track_coupe', targetLapSec: 94.0, targetTrapKmh: 232 },
] as const;

// ==================== WORKER CHILD LOGIC ====================
const workerItemArg = process.argv.find((a) => a.startsWith('--worker-item='));
if (workerItemArg) {
  const itemJson = decodeURIComponent(workerItemArg.slice('--worker-item='.length));
  const bench = JSON.parse(itemJson) as (typeof TARGET_BENCHMARKS)[number];
  const rawTrack = TRACKS.find((t) => t.id === bench.trackId);
  if (!rawTrack) {
    console.log(JSON.stringify(null));
    process.exit(0);
  }
  const track = compileTrack(rawTrack);
  const cars = CARS.filter((c) => c.classId === bench.classId);

  const startMs = Date.now();
  const laps: NonNullable<ReturnType<typeof simulateCarFlyingLap>>[] = [];
  for (const carSpec of cars) {
    const res = simulateCarFlyingLap(carSpec, track);
    if (res) laps.push(res);
  }

  laps.sort((a, b) => a.totalLap - b.totalLap);
  const best = laps[0];
  const slowest = laps[laps.length - 1];
  const elapsedMs = Date.now() - startMs;

  if (best) {
    const lapErr = Math.abs(best.totalLap - bench.targetLapSec) / bench.targetLapSec;
    const trapErr = Math.abs(best.trapKmh - bench.targetTrapKmh) / bench.targetTrapKmh;
    const totalWallHits = laps.reduce((s, r) => s + r.wallHits, 0);
    const maxOffTrack = Number(Math.max(...laps.map((r) => r.offTrackPct)).toFixed(3));
    const penalty = (totalWallHits > 0 ? totalWallHits * 1.0 : 0) + (maxOffTrack > 0.5 ? 0.5 : 0);
    const errorPct = Number(((lapErr * 0.75 + trapErr * 0.25 + penalty) * 100).toFixed(2));

    console.log(
      JSON.stringify({
        track: bench.trackId,
        carClass: bench.classId,
        car: bench.car,
        carId: best.carId,
        carName: best.carName,
        carsEvaluated: laps.length,
        slowestCarId: slowest?.carId ?? best.carId,
        slowestLapSec: Number((slowest?.totalLap ?? best.totalLap).toFixed(3)),
        lapTime: Number(best.totalLap.toFixed(2)),
        lapSec: Number(best.totalLap.toFixed(3)),
        trapKmh: Number(best.trapKmh.toFixed(2)),
        wallHits: totalWallHits,
        offTrackPct: maxOffTrack,
        errorPct,
        elapsedMs,
      }),
    );
  } else {
    console.log(JSON.stringify(null));
  }
  process.exit(0);
}

async function main() {
  const isJson = process.argv.includes('--json');
  const isStream = process.argv.includes('--stream') || isJson;
  const flagshipOnly = process.argv.includes('--flagship-only');

  if (isJson || isStream) {
    const classArg = process.argv.find((a) => a.startsWith('--class='))?.split('=')[1]?.toUpperCase();
    const trackArg = process.argv.find((a) => a.startsWith('--track='))?.split('=')[1]?.toLowerCase();
    const onlyOutliers = process.argv.includes('--only-outliers');
    const marginArg =
      process.argv.find((a) => a.startsWith('--margin='))?.split('=')[1] ??
      (process.argv.includes('--margin') ? process.argv[process.argv.indexOf('--margin') + 1] : '1.5');
    const marginPct = Number(marginArg) || 1.5;

    const CACHE_PATH = path.resolve(process.cwd(), 'audit/benchmark-cache.json');
    let cache: Record<string, any> = {};
    if (fs.existsSync(CACHE_PATH)) {
      try {
        cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      } catch {}
    }

    const activeBenchmarks = TARGET_BENCHMARKS.filter(
      (b) => TRACKS.some((t) => t.id === b.trackId) && CARS.some((c) => c.classId === b.classId),
    );

    const tasksToRun: (typeof TARGET_BENCHMARKS)[number][] = [];
    const cachedItems: any[] = [];

    for (const bench of activeBenchmarks) {
      const key = `${bench.trackId}:${bench.classId}`;
      const isClassMatch =
        !classArg ||
        bench.classId.toUpperCase().includes(classArg) ||
        bench.car.toUpperCase().includes(classArg);
      const isTrackMatch = !trackArg || bench.trackId.toLowerCase().includes(trackArg);

      if (!isClassMatch || !isTrackMatch) {
        if (cache[key]) {
          cachedItems.push(cache[key]);
        }
        continue;
      }

      const cached = cache[key];
      const isWithinMargin =
        cached &&
        cached.errorPct <= marginPct &&
        (cached.wallHits || 0) === 0 &&
        (cached.offTrackPct || 0) <= 0.05;

      if (onlyOutliers && isWithinMargin) {
        cachedItems.push(cached);
      } else {
        tasksToRun.push(bench);
      }
    }

    const totalExpected = cachedItems.length + tasksToRun.length;
    let completedCount = 0;

    // Immediately stream progress for cached / within-margin items
    for (const c of cachedItems) {
      completedCount++;
      const progressEvent = {
        type: 'progress',
        completed: completedCount,
        total: totalExpected,
        track: c.track,
        car: c.car,
        carClass: c.carClass,
        carName: c.carName,
        carsEvaluated: c.carsEvaluated,
        lapTime: c.lapTime ?? c.lapSec,
        lapSec: c.lapSec ?? c.lapTime,
        trapKmh: c.trapKmh,
        errorPct: c.errorPct,
        elapsedMs: 0,
        cached: true,
      };
      const line = JSON.stringify(progressEvent);
      process.stderr.write(line + '\n');
      process.stdout.write(`PROGRESS:${line}\n`);
    }

    // Run active tasks concurrently across CPU cores using process.execPath with tsx CLI directly
    const freshMap = new Map<string, any>();
    if (tasksToRun.length > 0) {
      const promises = tasksToRun.map((bench) => {
        return new Promise<void>((resolve, reject) => {
          const child = spawn(
            process.execPath,
            [TSX_CLI_PATH, __filename, `--worker-item=${encodeURIComponent(JSON.stringify(bench))}`],
            {
              env: { ...process.env },
              stdio: ['ignore', 'pipe', 'pipe'],
            },
          );

          let stdout = '';
          child.stdout?.on('data', (d) => {
            stdout += d.toString();
          });

          child.on('error', (err) => reject(err));
          child.on('close', (code) => {
            if (code !== 0) {
              reject(new Error(`Worker exited with code ${code}`));
              return;
            }
            try {
              const msg = JSON.parse(stdout.trim());
              if (msg) {
                completedCount++;
                freshMap.set(`${msg.track}:${msg.carClass}`, msg);
                cache[`${msg.track}:${msg.carClass}`] = msg;
                const progressEvent = {
                  type: 'progress',
                  completed: completedCount,
                  total: totalExpected,
                  ...msg,
                };
                const line = JSON.stringify(progressEvent);
                process.stderr.write(line + '\n');
                process.stdout.write(`PROGRESS:${line}\n`);
              }
            } catch {}
            resolve();
          });
        });
      });

      await Promise.all(promises);
    }

    // Persist cache
    try {
      fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
      fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
    } catch {}

    // Output final summary JSON in canonical order
    const jsonRows = activeBenchmarks
      .map((bench) => {
        const key = `${bench.trackId}:${bench.classId}`;
        const item = freshMap.get(key) || cache[key];
        if (!item) return null;
        return {
          track: item.track,
          carClass: item.carClass,
          carId: item.carId,
          carsEvaluated: item.carsEvaluated,
          lapSec: item.lapSec,
          slowestLapSec: item.slowestLapSec,
          trapKmh: item.trapKmh,
          wallHits: item.wallHits,
          offTrackPct: item.offTrackPct,
        };
      })
      .filter(Boolean);

    console.log(JSON.stringify(jsonRows));
    return;
  }

  const tracksForReport = flagshipOnly
    ? FLAGSHIP_TRACK_IDS.filter((id) => TRACKS.some((t) => t.id === id))
    : ALL_BENCHMARK_TRACK_IDS;

  console.log(`Running straight-line dyno across all ${CARS.length} cars...`);
  const dyno = measureStraightLineDyno();
  console.log(
    `Running AI flying laps (${CARS.length} cars × ${tracksForReport.length} circuits = ${CARS.length * tracksForReport.length} laps)...`,
  );
  const laps = runFlyingLapBenchmark(tracksForReport);

  const lines: string[] = [
    '# Apex Miniature — Multi-Car Physics & AI Benchmark Report',
    '',
    `Audited **all ${CARS.length} vehicles** in \`CARS\` across **${tracksForReport.length} circuits** (${tracksForReport.map((id) => `\`${id}\``).join(', ')}) running at \`Alien\` (1.07× pace) flying-lap pace at \`60 Hz\`.`,
    '',
    '## 1. Class-Level Performance Summary vs Real-World Targets',
    '',
    '| Class | Cars | Mean 0–100 | Mean 0–200 | Base Vmax Range | Special Vmax Range | Avg Off-Track % | Total Wall Hits |',
    '|---|---:|---:|---:|---|---|---:|---:|',
  ];

  for (const cls of Object.values(CarClassId)) {
    const classDyno = Object.values(dyno).filter((d) => d.classId === cls);
    const classLaps = laps.filter((l) => l.classId === cls);
    const mean100 =
      classDyno.reduce((s, d) => s + (d.t100 ?? 0), 0) / Math.max(1, classDyno.filter((d) => d.t100 !== null).length);
    const t200Valid = classDyno.filter((d) => d.t200 !== null);
    const mean200 = t200Valid.length > 0 ? t200Valid.reduce((s, d) => s + (d.t200 ?? 0), 0) / t200Valid.length : null;
    const minV = Math.min(...classDyno.map((d) => d.baseVmax));
    const maxV = Math.max(...classDyno.map((d) => d.baseVmax));
    const minSV = Math.min(...classDyno.map((d) => d.specialVmax));
    const maxSV = Math.max(...classDyno.map((d) => d.specialVmax));
    const avgOff = classLaps.reduce((s, l) => s + l.offTrackPct, 0) / Math.max(1, classLaps.length);
    const wallHits = classLaps.reduce((s, l) => s + l.wallHits, 0);

    lines.push(
      `| \`${cls}\` | ${classDyno.length} | ${mean100.toFixed(2)}s | ${mean200 !== null ? mean200.toFixed(2) + 's' : '—'} | ${minV.toFixed(0)}–${maxV.toFixed(0)} km/h | ${minSV.toFixed(0)}–${maxSV.toFixed(0)} km/h | ${avgOff.toFixed(2)}% | ${wallHits} |`,
    );
  }

  lines.push(
    '',
    '## 2. Circuit Lap Time & Speed Trap Comparison vs IRL Benchmarks (Class Leaders)',
    '',
    '| Circuit | Class | Fastest Car | Sim S1 | Sim S2 | Sim S3 | Sim Lap | Trap km/h | IRL Reference Lap & Vmax |',
    '|---|---|---|---:|---:|---:|---:|---:|---|',
  );

  for (const trackId of tracksForReport) {
    const trackRefs = IRL_REFERENCE[trackId] || {};
    for (const cls of Object.values(CarClassId)) {
      const sub = laps.filter((l) => l.trackId === trackId && l.classId === cls);
      if (sub.length === 0) continue;
      sub.sort((a, b) => a.totalLap - b.totalLap);
      const best = sub[0];
      const ref = trackRefs[cls];
      const refStr = ref ? `${ref.lapSec} @ ${ref.vmaxKmh} km/h (${ref.sourceNote})` : `${CAR_CLASSES[cls].name} class pace`;
      lines.push(
        `| \`${trackId}\` | \`${cls}\` | ${best.carName} | ${best.s1.toFixed(2)}s | ${best.s2.toFixed(2)}s | ${best.s3.toFixed(2)}s | **${fmtTime(best.totalLap)}** | ${best.trapKmh.toFixed(1)} | ${refStr} |`,
      );
    }
  }

  lines.push(
    '',
    `## 3. Complete Matrix — All ${CARS.length} Cars × ${tracksForReport.length} Circuits (${laps.length} Flying Laps)`,
    '',
    '| Track | Class | Car | 0–100 | 0–200 | Base Vmax | S1 | S2 | S3 | Lap Time | Trap | Max Lat / HalfW |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  );

  for (const r of laps) {
    const d = dyno[r.carId];
    lines.push(
      `| \`${r.trackId}\` | \`${r.classId}\` | \`${r.carId}\` | ${d.t100 !== null ? d.t100.toFixed(2) + 's' : '—'} | ${d.t200 !== null ? d.t200.toFixed(2) + 's' : '—'} | ${d.baseVmax.toFixed(1)} | ${r.s1.toFixed(2)}s | ${r.s2.toFixed(2)}s | ${r.s3.toFixed(2)}s | ${fmtTime(r.totalLap)} | ${r.trapKmh.toFixed(1)} | ${r.maxAbsLat.toFixed(1)}m / ${r.halfWidth.toFixed(1)}m |`,
    );
  }

  const outPath = path.resolve(process.cwd(), 'audit/ai-and-physics-benchmark.md');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n') + '\n');

  const totalWalls = laps.reduce((s, l) => s + l.wallHits, 0);
  const maxOff = Math.max(...laps.map((l) => l.offTrackPct));
  console.log(`Wrote ${outPath} (${laps.length} laps, total wallHits=${totalWalls}, max offTrack=${maxOff.toFixed(2)}%)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});