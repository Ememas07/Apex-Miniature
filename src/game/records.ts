import { CAR_CLASSES, CARS, getCarById } from './cars';
import { CompiledTrack, TRACKS, getTrackById, sampleTrackAtT } from './tracks';
import { createCarSimState, stepCarPhysics } from './physics';
import { computeNeuralAIControl } from './aiNeuralPolicy';
import {
  AIDifficulty,
  CarClassId,
  CarSpec,
  GhostTargetMode,
  MedalTier,
  RaceConfig,
  TireCompound,
  TrackSpec,
  WeatherPresetId,
} from './types';

// ==================== Class Medal Target Times ====================

export interface TrackMedalTargets {
  bronze: number;
  silver: number;
  gold: number;
  alien: number;
}

/**
 * Empirical mean clean-lap speeds (km/h) per class measured across all 43 circuits in the physics engine.
 * Overall fleet reference mean across all 58 cars = 194.64 km/h.
 */
const CLASS_BENCHMARK_SPEED_KMH: Record<CarClassId, number> = {
  [CarClassId.F1_2021]: 236.0,
  [CarClassId.F1_2005]: 232.0,
  [CarClassId.F1_2026]: 233.0,
  [CarClassId.HYPERCAR_GTP]: 198.5,
  [CarClassId.LMP2]: 188.0,
  [CarClassId.FORMULA_E]: 185.0,
  [CarClassId.SUPERCAR]: 186.0,
  [CarClassId.GT3]: 172.0,
  [CarClassId.TRACK_COUPE]: 158.0,
  [CarClassId.GT4]: 156.5,
};

const FLEET_MEAN_KMH = 184.5;

/**
 * Audited [circuitLengthKm, fleetMeanSpeedKmh] per built-in circuit so every medal target
 * reflects genuine achievable in-game physics pace rather than unscaled real-world F1 quali times.
 */
const TRACK_PHYSICS_BENCHMARKS: Record<string, [number, number]> = {
  'le-mans': [13.63, 235.8],
  'las-vegas': [6.20, 212.5],
  'road-america': [6.52, 210.4],
  'daytona-road': [5.73, 208.8],
  'silverstone': [5.89, 208.5],
  'watkins-glen': [5.55, 207.6],
  'sebring': [6.02, 206.9],
  'albert-park': [5.28, 205.1],
  'suzuka': [5.81, 204.7],
  'mosport': [3.96, 204.6],
  'imola': [4.91, 204.1],
  'lusail': [5.42, 204.0],
  'jeddah': [6.17, 202.9],
  'miami': [5.41, 201.3],
  'lime-rock': [2.41, 201.2],
  'spa-francorchamps': [7.00, 200.4],
  'road-atlanta': [4.09, 193.7],
  'fuji': [4.56, 193.2],
  'madring': [5.47, 192.8],
  'bahrain': [5.41, 192.5],
  'mid-ohio': [3.63, 191.8],
  'paul-ricard': [5.84, 191.5],
  'indianapolis-road': [3.93, 191.4],
  'interlagos': [4.31, 190.4],
  'sepang': [5.54, 186.0],
  'shanghai': [5.45, 185.5],
  'portimao': [4.65, 183.0],
  'cota': [5.51, 182.4],
  'zandvoort': [4.26, 180.9],
  'barcelona': [4.66, 194.2],
  'hungaroring': [4.38, 189.1],
  'laguna-seca': [3.60, 188.5],
  'yas-marina': [5.28, 198.3],
  'red-bull-ring': [4.32, 197.7],
  'monaco': [3.34, 159.3],
  'monza': [5.79, 210.6],
  'long-beach': [3.17, 169.7],
  'detroit-street': [2.65, 171.8],
  'baku': [6.00, 192.7],
  'vir': [5.26, 193.4],
  'singapore': [4.94, 169.0],
  'mexico-city': [4.30, 201.6],
  'montreal': [4.36, 176.0],
};

/**
 * Computes Bronze / Silver / Gold / Alien target lap times for any (track, class) pair.
 * Calibrated directly against audited in-game physics speeds so Alien (~3.5% faster than clean AI lap)
 * and Gold (~1.5% above clean AI lap) are genuinely achievable across all 43 circuits and 10 classes.
 */
export function computeTrackClassMedalTargets(
  track: Pick<TrackSpec, 'targetLapSeconds'> & { id?: string; circuitLengthKm?: number },
  classId: CarClassId,
): TrackMedalTargets {
  const classKmh = CLASS_BENCHMARK_SPEED_KMH[classId] ?? 195.0;
  const bench = track.id ? TRACK_PHYSICS_BENCHMARKS[track.id] : undefined;

  let refLap: number;
  if (bench) {
    const [lengthKm, trackFleetKmh] = bench;
    const expectedKmh = Math.max(95, trackFleetKmh * (classKmh / FLEET_MEAN_KMH));
    // Clean benchmark lap in seconds; Gold sits at +1.5%, Alien at -3.5% (demanding but achievable!)
    const aiCleanLap = (lengthKm / expectedKmh) * 3600;
    refLap = Math.max(20, aiCleanLap * 1.015);
  } else {
    // Custom or unbenchmarked track: scale targetLapSeconds (authored around Hypercar/F1 pace) by class speed ratio
    const paceScale = Math.max(0.55, classKmh / 218.0);
    refLap = Math.max(20, (track.targetLapSeconds || 95) / paceScale);
  }

  return {
    alien: Number((refLap * 0.952).toFixed(3)),
    gold: Number((refLap * 1.0).toFixed(3)),
    silver: Number((refLap * 1.055).toFixed(3)),
    bronze: Number((refLap * 1.13).toFixed(3)),
  };
}

export function evaluateMedal(
  lapTimeSeconds: number | null | undefined,
  targets: TrackMedalTargets,
): MedalTier | null {
  if (lapTimeSeconds === null || lapTimeSeconds === undefined || !Number.isFinite(lapTimeSeconds) || lapTimeSeconds <= 0) {
    return null;
  }
  if (lapTimeSeconds <= targets.alien) return 'alien';
  if (lapTimeSeconds <= targets.gold) return 'gold';
  if (lapTimeSeconds <= targets.silver) return 'silver';
  if (lapTimeSeconds <= targets.bronze) return 'bronze';
  return null;
}

export function medalRank(medal: MedalTier | null | undefined): number {
  switch (medal) {
    case 'alien':
      return 4;
    case 'gold':
      return 3;
    case 'silver':
      return 2;
    case 'bronze':
      return 1;
    default:
      return 0;
  }
}

// ==================== Personal Records Matrix ====================

export interface PersonalRecord {
  trackId: string;
  carId: string;
  classId: CarClassId;
  bestLapTime: number;
  bestSectors: [number | null, number | null, number | null];
  topSpeedKmh: number;
  compound: TireCompound;
  medal: MedalTier | null;
  updatedAt: number;
}

const RECORDS_STORAGE_KEY = 'apex_personal_records_v1';

function recordKey(trackId: string, carId: string): string {
  return `${trackId}::${carId}`;
}

export function loadPersonalRecords(): Record<string, PersonalRecord> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(RECORDS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, PersonalRecord>;
  } catch {
    return {};
  }
}

function savePersonalRecords(records: Record<string, PersonalRecord>): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(records));
    }
  } catch {
    // Ignore quota errors
  }
}

export function getPersonalRecord(trackId: string, carId: string): PersonalRecord | null {
  const all = loadPersonalRecords();
  return all[recordKey(trackId, carId)] ?? null;
}

export function getBestRecordForTrackClass(
  trackId: string,
  classId: CarClassId,
): PersonalRecord | null {
  const all = Object.values(loadPersonalRecords());
  let best: PersonalRecord | null = null;
  for (const r of all) {
    if (r.trackId !== trackId || r.classId !== classId) continue;
    if (!best || r.bestLapTime < best.bestLapTime) best = r;
  }
  return best;
}

export function listPersonalRecords(): PersonalRecord[] {
  return Object.values(loadPersonalRecords()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function savePersonalRecordLap(params: {
  track: TrackSpec;
  carId: string;
  classId: CarClassId;
  lapTime: number;
  sectors?: [number | null, number | null, number | null];
  topSpeedKmh: number;
  compound: TireCompound;
}): { record: PersonalRecord; isNewBest: boolean; previousBest: number | null } {
  const all = loadPersonalRecords();
  const key = recordKey(params.track.id, params.carId);
  const existing = all[key] ?? null;
  const targets = computeTrackClassMedalTargets(params.track, params.classId);
  const previousBest = existing ? existing.bestLapTime : null;
  const isNewBest = !existing || params.lapTime < existing.bestLapTime;

  const mergedSectors: [number | null, number | null, number | null] = [0, 1, 2].map((idx) => {
    const prevS = existing?.bestSectors?.[idx] ?? null;
    const nextS = params.sectors?.[idx] ?? null;
    if (nextS === null) return prevS;
    if (prevS === null) return nextS;
    return Math.min(prevS, nextS);
  }) as [number | null, number | null, number | null];

  const bestLapTime = isNewBest ? params.lapTime : existing!.bestLapTime;
  const updated: PersonalRecord = {
    trackId: params.track.id,
    carId: params.carId,
    classId: params.classId,
    bestLapTime,
    bestSectors: mergedSectors,
    topSpeedKmh: Math.max(existing?.topSpeedKmh ?? 0, Math.round(params.topSpeedKmh)),
    compound: isNewBest ? params.compound : existing!.compound,
    medal: evaluateMedal(bestLapTime, targets),
    updatedAt: Date.now(),
  };

  all[key] = updated;
  savePersonalRecords(all);
  return { record: updated, isNewBest, previousBest };
}

// ==================== Ghost Car Recording, Playback & Live Delta ====================

export interface GhostSample {
  /** Elapsed lap time in seconds */
  time: number;
  /** Normalized progress along track [0..1] */
  trackT: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  roll: number;
}

export interface StoredGhostLap {
  trackId: string;
  carId: string;
  lapTime: number;
  updatedAt: number;
  samples: GhostSample[];
}

const GHOSTS_STORAGE_KEY = 'apex_ghost_laps_v1';
const MAX_STORED_GHOSTS = 12;

export function loadGhostLap(trackId: string, carId: string): StoredGhostLap | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(GHOSTS_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, StoredGhostLap>;
    const found = map[recordKey(trackId, carId)];
    if (!found || !Array.isArray(found.samples) || found.samples.length < 4) return null;
    return found;
  } catch {
    return null;
  }
}

export function saveGhostLap(ghost: StoredGhostLap): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(GHOSTS_STORAGE_KEY);
    const map: Record<string, StoredGhostLap> = raw ? JSON.parse(raw) : {};
    // Quantize floats to keep localStorage footprint compact (~8-14KB per ghost)
    const compact: StoredGhostLap = {
      trackId: ghost.trackId,
      carId: ghost.carId,
      lapTime: Number(ghost.lapTime.toFixed(3)),
      updatedAt: ghost.updatedAt,
      samples: ghost.samples.map((s) => ({
        time: Number(s.time.toFixed(3)),
        trackT: Number(s.trackT.toFixed(4)),
        x: Number(s.x.toFixed(2)),
        y: Number(s.y.toFixed(2)),
        z: Number(s.z.toFixed(2)),
        heading: Number(s.heading.toFixed(3)),
        pitch: Number(s.pitch.toFixed(3)),
        roll: Number(s.roll.toFixed(3)),
      })),
    };
    map[recordKey(ghost.trackId, ghost.carId)] = compact;

    // Evict oldest ghosts if exceeding cap
    const entries = Object.entries(map).sort((a, b) => b[1].updatedAt - a[1].updatedAt);
    const trimmed: Record<string, StoredGhostLap> = {};
    for (let i = 0; i < Math.min(MAX_STORED_GHOSTS, entries.length); i++) {
      trimmed[entries[i][0]] = entries[i][1];
    }
    localStorage.setItem(GHOSTS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore quota errors
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

/**
 * Samples a recorded GhostLap at an elapsed lap time (wraps smoothly across lap duration).
 */
export function sampleRecordedGhostAtTime(
  samples: ReadonlyArray<GhostSample>,
  lapTime: number,
  elapsedTime: number,
): GhostSample | null {
  if (samples.length < 2 || lapTime <= 0) return null;
  const tWrap = ((elapsedTime % lapTime) + lapTime) % lapTime;

  // Binary search by sample.time
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].time <= tWrap) lo = mid;
    else hi = mid;
  }
  const s0 = samples[lo];
  const s1 = samples[hi];
  const span = Math.max(1e-4, s1.time - s0.time);
  const alpha = Math.max(0, Math.min(1, (tWrap - s0.time) / span));

  return {
    time: tWrap,
    trackT: s0.trackT + (s1.trackT - s0.trackT) * alpha,
    x: s0.x + (s1.x - s0.x) * alpha,
    y: s0.y + (s1.y - s0.y) * alpha,
    z: s0.z + (s1.z - s0.z) * alpha,
    heading: lerpAngle(s0.heading, s1.heading, alpha),
    pitch: s0.pitch + (s1.pitch - s0.pitch) * alpha,
    roll: s0.roll + (s1.roll - s0.roll) * alpha,
  };
}

const PHYSICS_TARGET_GHOST_CACHE = new Map<string, StoredGhostLap>();

/**
 * Simulates a real, physics-obeying flying lap using the game's actual physics & AI engine
 * so the Alien (and Gold/Silver/Bronze) target ghosts follow real braking zones, cornering grip,
 * elevation, and racing lines instead of an impossible constant-speed centerline path.
 */
export function generatePhysicsTargetGhostLap(
  compiledTrack: CompiledTrack,
  carSpec: CarSpec,
  mode: Exclude<GhostTargetMode, 'off' | 'personal-best'>,
  trackWetness = 0,
): StoredGhostLap | null {
  const wetBucket = Math.round(Math.max(0, Math.min(1, trackWetness)) * 10);
  const cacheKey = `${compiledTrack.spec.id}:${carSpec.id}:${mode}:${wetBucket}`;
  const cached = PHYSICS_TARGET_GHOST_CACHE.get(cacheKey);
  if (cached) return cached;

  const difficulty: AIDifficulty =
    mode === 'alien' ? 'Alien' : mode === 'gold' ? 'Pro' : mode === 'silver' ? 'Amateur' : 'Rookie';
  const paceMult =
    mode === 'alien' ? 1.0 : mode === 'gold' ? 0.96 : mode === 'silver' ? 0.91 : 0.85;
  const compound: TireCompound = trackWetness > 0.35 ? 'wet' : 'soft';

  const simCar = createCarSimState({
    id: `ghost-sim-${mode}`,
    name: `${mode.toUpperCase()} Ghost`,
    isPlayer: false,
    carId: carSpec.id,
    livery: carSpec.defaultLivery,
    gridSlot: 0,
    compiledTrack,
    compound,
    aiPaceMultiplier: paceMult,
    personality: 'Metronome',
  });
  // Place on a flying run-up before S/F with warm brakes & optimal tyres so the recorded lap is a clean flying lap
  const runupT = 0.84;
  const runupSp = sampleTrackAtT(compiledTrack, runupT);
  simCar.trackT = runupT;
  simCar.x = runupSp.x;
  simCar.y = runupSp.y;
  simCar.z = runupSp.z;
  simCar.heading = Math.atan2(runupSp.tx, runupSp.tz);
  simCar.speed = 38;
  simCar.vx = runupSp.tx * 38;
  simCar.vz = runupSp.tz * 38;
  simCar.brakeTempFront = 320;
  simCar.brakeTempRear = 290;
  simCar.ersBattery = 100;

  const dt = 1 / 30;
  const maxSimSteps = 30 * 420; // safety cap (7 min simulated max)
  const samples: GhostSample[] = [];
  let recording = false;
  let lapStartTime = 0;
  let simTime = 0;
  let sampleAccum = 0;
  let lapTime = 0;

  for (let step = 0; step < maxSimSteps; step++) {
    const prevLap = simCar.lap;
    const input = computeNeuralAIControl(
      simCar,
      compiledTrack,
      [simCar],
      dt,
      trackWetness,
      difficulty,
    );
    stepCarPhysics(simCar, input, compiledTrack, dt, {
      trackWetness,
      localWetness: trackWetness,
      totalLaps: 5,
      isQualifying: true,
      isPractice: false,
      allCars: [simCar],
      damageLevel: 'off',
      absLevel: 'low',
    });
    simTime += dt;

    if (!recording && simCar.lap > prevLap) {
      recording = true;
      lapStartTime = simTime;
      sampleAccum = 0;
      samples.push({
        time: 0,
        trackT: 0,
        x: simCar.x,
        y: simCar.y,
        z: simCar.z,
        heading: simCar.heading,
        pitch: simCar.pitch ?? 0,
        roll: simCar.roll ?? 0,
      });
    } else if (recording) {
      if (simCar.lap > prevLap) {
        lapTime = simCar.lastLapTime && simCar.lastLapTime > 10 ? simCar.lastLapTime : simTime - lapStartTime;
        samples.push({
          time: lapTime,
          trackT: 1,
          x: simCar.x,
          y: simCar.y,
          z: simCar.z,
          heading: simCar.heading,
          pitch: simCar.pitch ?? 0,
          roll: simCar.roll ?? 0,
        });
        break;
      }
      sampleAccum += dt;
      if (sampleAccum >= 0.08) {
        sampleAccum = 0;
        samples.push({
          time: simTime - lapStartTime,
          trackT: simCar.trackT,
          x: simCar.x,
          y: simCar.y,
          z: simCar.z,
          heading: simCar.heading,
          pitch: simCar.pitch ?? 0,
          roll: simCar.roll ?? 0,
        });
      }
    }
  }

  if (samples.length < 10 || lapTime <= 10) return null;

  const recorded: StoredGhostLap = {
    trackId: compiledTrack.spec.id,
    carId: carSpec.id,
    lapTime,
    updatedAt: Date.now(),
    samples,
  };
  PHYSICS_TARGET_GHOST_CACHE.set(cacheKey, recorded);
  return recorded;
}

/**
 * Fallback target ghost sampler (used only if a physics-simulated ghost lap is unavailable).
 */
export function sampleTargetGhostAtTime(
  compiledTrack: CompiledTrack,
  targetLapSeconds: number,
  elapsedTime: number,
): GhostSample {
  const safeLap = Math.max(15, targetLapSeconds);
  const tWrap = ((elapsedTime % safeLap) + safeLap) % safeLap;
  const frac = tWrap / safeLap;
  const sp = sampleTrackAtT(compiledTrack, frac);
  const nextSp = sampleTrackAtT(compiledTrack, (frac + 0.004) % 1);
  const dy = nextSp.y - sp.y;
  const dist = Math.max(0.5, Math.hypot(nextSp.x - sp.x, nextSp.z - sp.z));
  return {
    time: tWrap,
    trackT: frac,
    x: sp.x,
    y: sp.y,
    z: sp.z,
    heading: Math.atan2(sp.tx, sp.tz),
    pitch: Math.atan2(dy, dist),
    roll: -(sp.banking ?? 0),
  };
}

/**
 * Computes real-time delta in seconds (negative = ahead/faster than reference, positive = behind/slower).
 */
export function computeLiveDeltaSeconds(params: {
  currentTrackT: number;
  currentLapTime: number;
  referenceSamples?: ReadonlyArray<GhostSample> | null;
  referenceLapTime?: number | null;
}): number | null {
  const { currentTrackT, currentLapTime, referenceSamples, referenceLapTime } = params;
  if (!Number.isFinite(currentLapTime) || currentLapTime < 0.25) return null;
  const clampedT = Math.max(0, Math.min(0.999, currentTrackT));

  if (referenceSamples && referenceSamples.length >= 4) {
    // Interpolate reference time at currentTrackT
    let prev = referenceSamples[0];
    for (let i = 1; i < referenceSamples.length; i++) {
      const cur = referenceSamples[i];
      if (cur.trackT >= clampedT && prev.trackT <= cur.trackT) {
        const span = Math.max(1e-5, cur.trackT - prev.trackT);
        const alpha = Math.max(0, Math.min(1, (clampedT - prev.trackT) / span));
        const refTimeAtT = prev.time + (cur.time - prev.time) * alpha;
        return currentLapTime - refTimeAtT;
      }
      prev = cur;
    }
  }

  if (referenceLapTime && Number.isFinite(referenceLapTime) && referenceLapTime > 5) {
    return currentLapTime - clampedT * referenceLapTime;
  }

  return null;
}

export function resolveGhostTargetLapTime(
  mode: GhostTargetMode,
  track: TrackSpec,
  classId: CarClassId,
  pbGhost: StoredGhostLap | null,
): { label: string | null; targetTime: number | null; useRecordedSamples: boolean } {
  if (mode === 'off') {
    return { label: null, targetTime: null, useRecordedSamples: false };
  }
  const targets = computeTrackClassMedalTargets(track, classId);
  if (mode === 'personal-best') {
    if (pbGhost && pbGhost.samples.length >= 4) {
      return { label: 'PB Ghost', targetTime: pbGhost.lapTime, useRecordedSamples: true };
    }
    return { label: 'Gold Target', targetTime: targets.gold, useRecordedSamples: false };
  }
  return {
    label: `${mode.charAt(0).toUpperCase() + mode.slice(1)} Ghost`,
    targetTime: targets[mode],
    useRecordedSamples: false,
  };
}

// ==================== Daily Hotlap Challenge ====================

export interface DailyHotlapChallenge {
  dateKey: string; // YYYY-MM-DD
  title: string;
  trackId: string;
  carId: string;
  weatherPreset: WeatherPresetId;
  compound: TireCompound;
  targets: TrackMedalTargets;
}

export interface DailyChallengeBest {
  dateKey: string;
  bestLapTime: number;
  medal: MedalTier | null;
  topSpeedKmh: number;
}

const DAILY_STORAGE_KEY = 'apex_daily_challenge_v1';

function hashDateString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function getTodayDateKey(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDailyHotlapChallenge(dateKey = getTodayDateKey()): DailyHotlapChallenge {
  const h = hashDateString(`apex-daily-${dateKey}`);
  const track = TRACKS[h % TRACKS.length];
  const car = CARS[(h >>> 7) % CARS.length];
  const weatherPool: WeatherPresetId[] = ['clear-dry', 'overcast', 'drying-track', 'clear-dry'];
  const weatherPreset = weatherPool[(h >>> 15) % weatherPool.length];
  const compound: TireCompound = weatherPreset === 'drying-track' ? 'wet' : 'soft';
  const targets = computeTrackClassMedalTargets(track, car.classId);

  return {
    dateKey,
    title: `${track.shortName} · ${car.name}`,
    trackId: track.id,
    carId: car.id,
    weatherPreset,
    compound,
    targets,
  };
}

export function getDailyChallengeBest(dateKey = getTodayDateKey()): DailyChallengeBest | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(DAILY_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, DailyChallengeBest>;
    return map[dateKey] ?? null;
  } catch {
    return null;
  }
}

export function recordDailyChallengeLap(
  dateKey: string,
  lapTime: number,
  topSpeedKmh: number,
): DailyChallengeBest {
  const challenge = getDailyHotlapChallenge(dateKey);
  const prev = getDailyChallengeBest(dateKey);
  const bestLapTime = prev ? Math.min(prev.bestLapTime, lapTime) : lapTime;
  const next: DailyChallengeBest = {
    dateKey,
    bestLapTime,
    medal: evaluateMedal(bestLapTime, challenge.targets),
    topSpeedKmh: Math.max(prev?.topSpeedKmh ?? 0, Math.round(topSpeedKmh)),
  };
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(DAILY_STORAGE_KEY);
      const map: Record<string, DailyChallengeBest> = raw ? JSON.parse(raw) : {};
      map[dateKey] = next;
      localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(map));
    }
  } catch {
    // ignore
  }
  return next;
}

export function formatDailyShareCard(challenge: DailyHotlapChallenge, best: DailyChallengeBest | null): string {
  const track = getTrackById(challenge.trackId);
  const car = getCarById(challenge.carId);
  const medalLabel = best?.medal ? best.medal.toUpperCase() : 'UNRANKED';
  const timeStr = best ? `${Math.floor(best.bestLapTime / 60)}:${(best.bestLapTime % 60).toFixed(3).padStart(6, '0')}` : '--:--.---';
  return [
    `APEX MINIATURE · Daily Hotlap (${challenge.dateKey})`,
    `${track.name} · ${car.name}`,
    `Best Lap: ${timeStr} [${medalLabel}] · Top Speed: ${best?.topSpeedKmh ?? 0} km/h`,
  ].join('\n');
}

// ==================== Last Race Config & Favorites Persistence ====================

const LAST_CONFIG_KEY = 'apex_last_race_config_v1';
const FAVORITES_KEY = 'apex_favorites_v1';

export interface UserFavorites {
  cars: string[];
  tracks: string[];
}

export function saveLastRaceConfig(config: RaceConfig): void {
  try {
    if (typeof localStorage === 'undefined') return;
    // Strip transient session-specific fields and large customTrack geometry blobs
    const persistable: Partial<RaceConfig> = {
      trackId: config.trackId,
      activeClasses: config.activeClasses,
      playerCarId: config.playerCarId,
      playerLivery: config.playerLivery,
      gridSize: config.gridSize,
      aiBotCount: config.aiBotCount,
      noAi: config.noAi,
      totalLaps: config.totalLaps,
      raceDurationMinutes: config.raceDurationMinutes ?? 0,
      weather: config.weather,
      weatherPreset: config.weatherPreset,
      startingCompound: config.startingCompound,
      qualifyingEnabled: config.qualifyingEnabled,
      aiDifficulty: config.aiDifficulty,
      damageLevel: config.damageLevel,
      absLevel: config.absLevel,
      startType: config.startType,
      ghostMode: config.ghostMode,
    };
    localStorage.setItem(LAST_CONFIG_KEY, JSON.stringify(persistable));
  } catch {
    // Ignore storage errors
  }
}

export function loadLastRaceConfig(fallback: RaceConfig): RaceConfig {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(LAST_CONFIG_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<RaceConfig>;
    if (!parsed || typeof parsed !== 'object') return fallback;
    return {
      ...fallback,
      ...parsed,
      sessionMode: 'race',
      customTrack: undefined,
      championshipId: undefined,
      scenarioId: undefined,
      licenseId: undefined,
      dailyChallengeDate: undefined,
    };
  } catch {
    return fallback;
  }
}

export function loadFavorites(): UserFavorites {
  try {
    if (typeof localStorage === 'undefined') return { cars: [], tracks: [] };
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return { cars: [], tracks: [] };
    const parsed = JSON.parse(raw);
    return {
      cars: Array.isArray(parsed?.cars) ? parsed.cars : [],
      tracks: Array.isArray(parsed?.tracks) ? parsed.tracks : [],
    };
  } catch {
    return { cars: [], tracks: [] };
  }
}

export function toggleFavoriteCar(carId: string): UserFavorites {
  const fav = loadFavorites();
  fav.cars = fav.cars.includes(carId) ? fav.cars.filter((id) => id !== carId) : [...fav.cars, carId];
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(fav));
  } catch {
    // ignore
  }
  return fav;
}

export function toggleFavoriteTrack(trackId: string): UserFavorites {
  const fav = loadFavorites();
  fav.tracks = fav.tracks.includes(trackId)
    ? fav.tracks.filter((id) => id !== trackId)
    : [...fav.tracks, trackId];
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(fav));
  } catch {
    // ignore
  }
  return fav;
}
