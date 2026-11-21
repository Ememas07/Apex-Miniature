import { CAR_CLASSES, CARS, getCarById } from './cars';
import { CompiledTrack, TRACKS, getTrackById, sampleTrackAtT } from './tracks';
import {
  CarClassId,
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
 * Computes Bronze / Silver / Gold / Alien target lap times for any (track, class) pair.
 * `track.targetLapSeconds` is calibrated around F1_2026 / Hypercar reference pace;
 * scaling by `1 / basePaceIndex` aligns targets naturally across all 10 classes.
 */
export function computeTrackClassMedalTargets(
  track: Pick<TrackSpec, 'targetLapSeconds'>,
  classId: CarClassId,
): TrackMedalTargets {
  const pace = CAR_CLASSES[classId]?.basePaceIndex ?? 0.92;
  // Reference baseline: basePaceIndex = 1.0 corresponds to Gold pace at track.targetLapSeconds
  const refLap = Math.max(20, (track.targetLapSeconds || 95) / Math.max(0.55, pace));
  return {
    alien: Number((refLap * 0.955).toFixed(3)),
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

/**
 * Synthesizes a smooth medal-pace Target Ghost along the track spline (modulated gently by curvature
 * so it slows slightly in corners and accelerates down straights!).
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
      safetyCarEnabled: config.safetyCarEnabled,
      jumpStartEnabled: config.jumpStartEnabled,
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
