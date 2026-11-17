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

const BENCHMARK_TRACK_IDS = [
  'spa-francorchamps',
  'monza',
  'suzuka',
  'silverstone',
  'laguna-seca',
  'le-mans',
  'monaco',
] as const;

// Real-world motorsport reference figures (Pole / Race pace + Speed traps)
const IRL_REFERENCE: Record<
  string,
  Record<string, { lapSec: string; vmaxKmh: string; sourceNote: string }>
> = {
  'spa-francorchamps': {
    F1_2026: { lapSec: '102.0–105.0s (1:42–1:45)', vmaxKmh: '335–345', sourceNote: 'F1 Spa GP Quali/Race' },
    HYPERCAR_GTP: { lapSec: '122.5–126.0s (2:02–2:06)', vmaxKmh: '315–325', sourceNote: 'WEC 6h Spa Hyperpole' },
    GT3: { lapSec: '136.0–140.0s (2:16–2:20)', vmaxKmh: '275–285', sourceNote: 'GTWC/WEC LMGT3 Spa' },
  },
  monza: {
    F1_2026: { lapSec: '79.5–82.5s (1:19–1:22)', vmaxKmh: '348–356', sourceNote: 'F1 Italian GP Low-Downforce' },
    HYPERCAR_GTP: { lapSec: '95.0–98.5s (1:35–1:38)', vmaxKmh: '330–340', sourceNote: 'WEC 6h Monza' },
    GT3: { lapSec: '106.5–109.5s (1:46–1:49)', vmaxKmh: '285–295', sourceNote: 'GTWC/WEC GT3 Monza' },
  },
  suzuka: {
    F1_2026: { lapSec: '88.0–91.5s (1:28–1:31)', vmaxKmh: '322–332', sourceNote: 'F1 Japanese GP' },
    GT3: { lapSec: '120.0–124.0s (2:00–2:04)', vmaxKmh: '275–285', sourceNote: 'Suzuka 1000km / GT3' },
  },
  silverstone: {
    F1_2026: { lapSec: '85.5–89.0s (1:25–1:29)', vmaxKmh: '325–336', sourceNote: 'F1 British GP' },
    HYPERCAR_GTP: { lapSec: '101.0–105.0s (1:41–1:45)', vmaxKmh: '310–320', sourceNote: 'ELMS / WEC Silverstone' },
    GT3: { lapSec: '117.0–121.0s (1:57–2:01)', vmaxKmh: '272–282', sourceNote: 'British GT / GTWC' },
  },
  'laguna-seca': {
    HYPERCAR_GTP: { lapSec: '72.0–75.0s (1:12–1:15)', vmaxKmh: '275–285', sourceNote: 'IMSA WeatherTech Laguna' },
    GT3: { lapSec: '82.5–85.5s (1:22–1:25)', vmaxKmh: '250–262', sourceNote: 'IMSA GTD Pro Laguna' },
  },
  'le-mans': {
    HYPERCAR_GTP: { lapSec: '204.0–209.0s (3:24–3:29)', vmaxKmh: '335–345', sourceNote: '24h Le Mans Hyperpole' },
    LMP2: { lapSec: '213.0–218.0s (3:33–3:38)', vmaxKmh: '315–325', sourceNote: '24h Le Mans LMP2' },
    GT3: { lapSec: '234.0–240.0s (3:54–4:00)', vmaxKmh: '285–296', sourceNote: '24h Le Mans LMGT3' },
  },
  monaco: {
    F1_2026: { lapSec: '70.0–73.5s (1:10–1:13)', vmaxKmh: '288–296', sourceNote: 'F1 Monaco GP' },
    FORMULA_E: { lapSec: '86.0–90.0s (1:26–1:30)', vmaxKmh: '245–265', sourceNote: 'Monaco E-Prix Gen3 Evo' },
  },
};

function fmtTime(sec: number): string {
  const mins = Math.floor(sec / 60);
  const rem = sec - mins * 60;
  return mins > 0 ? `${mins}:${rem.toFixed(2).padStart(5, '0')}` : `${sec.toFixed(2)}s`;
}

function measureStraightLineDyno() {
  const baseTrack = compileTrack(TRACKS.find((t) => t.id === 'monza')!);
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

function runFlyingLapBenchmark(filterPairs?: Array<{ trackId: string; classId: CarClassId }>) {
  const trackIds = filterPairs
    ? Array.from(new Set(filterPairs.map((p) => p.trackId)))
    : [...BENCHMARK_TRACK_IDS];
  const compiledTracks = trackIds.map((id) =>
    compileTrack(TRACKS.find((t) => t.id === id)!),
  );

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

const TARGET_BENCHMARKS = [
  { trackId: 'spa-francorchamps', classId: CarClassId.GT3, car: 'gt3', targetLapSec: 137.5, targetTrapKmh: 280 },
  { trackId: 'spa-francorchamps', classId: CarClassId.HYPERCAR_GTP, car: 'hypercar_gtp', targetLapSec: 123.0, targetTrapKmh: 320 },
  { trackId: 'monza', classId: CarClassId.GT3, car: 'gt3', targetLapSec: 107.5, targetTrapKmh: 292 },
  { trackId: 'suzuka', classId: CarClassId.F1_2026, car: 'f1_2026', targetLapSec: 89.5, targetTrapKmh: 332 },
  { trackId: 'monaco', classId: CarClassId.F1_2026, car: 'f1_2026', targetLapSec: 71.0, targetTrapKmh: 292 },
  { trackId: 'le-mans', classId: CarClassId.HYPERCAR_GTP, car: 'hypercar_gtp', targetLapSec: 206.0, targetTrapKmh: 340 },
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
        carName: best.carName,
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

  if (isJson || isStream) {
    const classArg = process.argv.find((a) => a.startsWith('--class='))?.split('=')[1]?.toUpperCase();
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

    const tasksToRun: (typeof TARGET_BENCHMARKS)[number][] = [];
    const cachedItems: any[] = [];

    for (const bench of TARGET_BENCHMARKS) {
      const key = `${bench.trackId}:${bench.classId}`;
      const isClassMatch =
        !classArg ||
        bench.classId.toUpperCase().includes(classArg) ||
        bench.car.toUpperCase().includes(classArg);

      if (!isClassMatch) {
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
    const jsonRows = TARGET_BENCHMARKS.map((bench) => {
      const key = `${bench.trackId}:${bench.classId}`;
      const item = freshMap.get(key) || cache[key];
      if (!item) return null;
      return {
        track: item.track,
        carClass: item.carClass,
        lapSec: item.lapSec,
        trapKmh: item.trapKmh,
        wallHits: item.wallHits,
        offTrackPct: item.offTrackPct,
      };
    }).filter(Boolean);

    console.log(JSON.stringify(jsonRows));
    return;
  }

  console.log(`Running straight-line dyno across all ${CARS.length} cars...`);
  const dyno = measureStraightLineDyno();
  console.log(`Running AI flying laps (${CARS.length} cars × ${BENCHMARK_TRACK_IDS.length} circuits = ${CARS.length * BENCHMARK_TRACK_IDS.length} laps)...`);
  const laps = runFlyingLapBenchmark();

  const lines: string[] = [
    '# Apex Miniature — Multi-Car Physics & AI Benchmark Report',
    '',
    `Audited **all ${CARS.length} vehicles** in \`CARS\` across **${BENCHMARK_TRACK_IDS.length} flagship circuits** (\`spa-francorchamps\`, \`monza\`, \`suzuka\`, \`silverstone\`, \`laguna-seca\`, \`le-mans\`, \`monaco\`) running at \`Alien\` (1.07× pace) flying-lap pace at \`60 Hz\`.`,
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

  for (const trackId of BENCHMARK_TRACK_IDS) {
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
    `## 3. Complete Matrix — All ${CARS.length} Cars × ${BENCHMARK_TRACK_IDS.length} Circuits (${laps.length} Flying Laps)`,
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
