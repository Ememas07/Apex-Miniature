import { CAR_CLASSES } from './cars';
import { CompiledTrack, sampleTrackAtT } from './tracks';
import {
  CarClassId,
  ErsMode,
  PenaltyReason,
  PenaltyType,
  RaceFlagState,
  SafetyCarPhase,
  SceneryTheme,
  SectorFlag,
  WeatherCondition,
  WeatherForecastSegment,
  WeatherMode,
  WeatherPresetId,
} from './types';

// ==================== 1.4 Dynamic Weather & Track Evolution ====================

export interface TrackPuddle {
  t: number; // 0..1 along spline
  lengthT: number; // half-length in normalized t
  lateralSide: -1 | 1; // off-line left or right
  lateralCenterRatio: number; // fraction of halfW (e.g. 0.45..0.85)
  depth: number; // 0.4..1.0 severity multiplier
}

export interface WeatherSystemState {
  preset: WeatherPresetId;
  timeline: WeatherForecastSegment[];
  elapsedSeconds: number;
  estimatedSessionDuration: number;
  condition: WeatherCondition;
  rainIntensity: number; // 0..1 current falling rain
  cloudCover: number; // 0..1
  trackWetness: number; // 0..1 overall wetness (synced to HUD & audio)
  racingLineWetness: number; // 0..1 dries faster where cars run
  offLineWetness: number; // 0..1 stays wet longer
  trackRubber: number; // 0..1 asphalt rubber grip build-up
  ambientTempC: number;
  trackTempC: number;
  puddles: TrackPuddle[];
  nextForecastLabel: string;
}

export interface WeatherPresetMeta {
  id: WeatherPresetId;
  label: string;
  description: string;
  timeline: WeatherForecastSegment[];
}

export const WEATHER_PRESETS: readonly WeatherPresetMeta[] = [
  {
    id: 'clear-dry',
    label: 'Clear Dry',
    description: 'Sunny sky, warm asphalt, steady rubber build-up',
    timeline: [{ progressFraction: 0, condition: 'dry', rainIntensity: 0 }],
  },
  {
    id: 'overcast',
    label: 'Overcast',
    description: 'Cooler track temperatures, cloud cover, dry asphalt',
    timeline: [{ progressFraction: 0, condition: 'overcast', rainIntensity: 0 }],
  },
  {
    id: 'passing-shower',
    label: 'Passing Shower',
    description: 'Dry start → mid-race rain shower → drying racing line finish',
    timeline: [
      { progressFraction: 0.0, condition: 'overcast', rainIntensity: 0.0 },
      { progressFraction: 0.28, condition: 'light-drizzle', rainIntensity: 0.35 },
      { progressFraction: 0.45, condition: 'rain', rainIntensity: 0.72 },
      { progressFraction: 0.72, condition: 'drying-track', rainIntensity: 0.0 },
    ],
  },
  {
    id: 'storm-front',
    label: 'Heavy Storm',
    description: 'Light drizzle intensifying into a torrential storm with puddles',
    timeline: [
      { progressFraction: 0.0, condition: 'light-drizzle', rainIntensity: 0.35 },
      { progressFraction: 0.22, condition: 'rain', rainIntensity: 0.75 },
      { progressFraction: 0.50, condition: 'heavy-storm', rainIntensity: 1.0 },
      { progressFraction: 0.85, condition: 'rain', rainIntensity: 0.65 },
    ],
  },
  {
    id: 'drying-track',
    label: 'Drying Track',
    description: 'Wet start with a dry racing line emerging lap by lap',
    timeline: [
      { progressFraction: 0.0, condition: 'light-drizzle', rainIntensity: 0.25 },
      { progressFraction: 0.25, condition: 'drying-track', rainIntensity: 0.0 },
      { progressFraction: 0.65, condition: 'overcast', rainIntensity: 0.0 },
    ],
  },
  {
    id: 'dynamic-random',
    label: 'Dynamic Forecast',
    description: 'Unpredictable multi-phase weather evolution across the race',
    timeline: [
      { progressFraction: 0.0, condition: 'dry', rainIntensity: 0.0 },
      { progressFraction: 0.32, condition: 'overcast', rainIntensity: 0.1 },
      { progressFraction: 0.55, condition: 'rain', rainIntensity: 0.78 },
      { progressFraction: 0.80, condition: 'drying-track', rainIntensity: 0.0 },
    ],
  },
] as const;

function sceneryBaseAmbientTemp(scenery: SceneryTheme): number {
  switch (scenery) {
    case 'desert':
      return 33;
    case 'coastal':
      return 25;
    case 'stadium':
      return 24;
    case 'street-night':
      return 19;
    case 'forest':
      return 18;
    case 'parkland':
    default:
      return 22;
  }
}

function conditionToCloudCover(condition: WeatherCondition): number {
  switch (condition) {
    case 'dry':
      return 0.12;
    case 'overcast':
      return 0.68;
    case 'drying-track':
      return 0.50;
    case 'light-drizzle':
      return 0.80;
    case 'rain':
      return 0.92;
    case 'heavy-storm':
      return 1.0;
  }
}

export function formatWeatherCondition(condition: WeatherCondition): string {
  switch (condition) {
    case 'dry':
      return 'Dry';
    case 'overcast':
      return 'Overcast';
    case 'light-drizzle':
      return 'Light Drizzle';
    case 'rain':
      return 'Rain';
    case 'heavy-storm':
      return 'Heavy Storm';
    case 'drying-track':
      return 'Drying Track';
  }
}

/**
 * Generates deterministic standing-water puddles located along low-elevation / off-line zones of a circuit.
 */
export function generateTrackPuddles(compiledTrack: CompiledTrack): TrackPuddle[] {
  const puddles: TrackPuddle[] = [];
  const sampleCount = 72;
  let minY = Infinity;
  let maxY = -Infinity;
  const samples = [];
  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleCount;
    const sp = sampleTrackAtT(compiledTrack, t);
    samples.push(sp);
    if (sp.y < minY) minY = sp.y;
    if (sp.y > maxY) maxY = sp.y;
  }
  const ySpan = Math.max(1, maxY - minY);
  // Deterministic hash from track id
  let seed = 2166136261;
  for (let i = 0; i < compiledTrack.spec.id.length; i++) {
    seed ^= compiledTrack.spec.id.charCodeAt(i);
    seed = Math.imul(seed, 16777619) >>> 0;
  }
  const nextRand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  const count = 8;
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(((i + 0.35 + nextRand() * 0.4) / count) * sampleCount) % sampleCount;
    const sp = samples[idx];
    const lowBonus = 1.0 - (sp.y - minY) / ySpan;
    const side: -1 | 1 = sp.curvature >= 0 ? -1 : 1; // outside off-line tends to pool water
    puddles.push({
      t: sp.t,
      lengthT: 0.012 + nextRand() * 0.012,
      lateralSide: side,
      lateralCenterRatio: 0.48 + nextRand() * 0.32,
      depth: Math.min(1.0, 0.5 + lowBonus * 0.35 + nextRand() * 0.15),
    });
  }
  return puddles;
}

export function createWeatherSystemState(params: {
  weatherMode: WeatherMode;
  weatherPreset?: WeatherPresetId;
  customTimeline?: WeatherForecastSegment[];
  compiledTrack: CompiledTrack;
  totalLaps: number;
}): WeatherSystemState {
  const preset: WeatherPresetId =
    params.weatherPreset ??
    (params.weatherMode === 'dynamic-rain' ? 'passing-shower' : 'clear-dry');

  let timeline: WeatherForecastSegment[];
  if (preset === 'custom' && params.customTimeline && params.customTimeline.length > 0) {
    timeline = [...params.customTimeline].sort((a, b) => a.progressFraction - b.progressFraction);
  } else if (preset === 'dynamic-random') {
    const r = Math.random();
    if (r < 0.33) {
      timeline = [
        { progressFraction: 0.0, condition: 'dry', rainIntensity: 0.0 },
        { progressFraction: 0.30, condition: 'light-drizzle', rainIntensity: 0.38 },
        { progressFraction: 0.52, condition: 'heavy-storm', rainIntensity: 0.95 },
        { progressFraction: 0.80, condition: 'drying-track', rainIntensity: 0.0 },
      ];
    } else if (r < 0.66) {
      timeline = [
        { progressFraction: 0.0, condition: 'rain', rainIntensity: 0.68 },
        { progressFraction: 0.38, condition: 'drying-track', rainIntensity: 0.0 },
        { progressFraction: 0.72, condition: 'overcast', rainIntensity: 0.0 },
      ];
    } else {
      timeline = [
        { progressFraction: 0.0, condition: 'overcast', rainIntensity: 0.0 },
        { progressFraction: 0.25, condition: 'light-drizzle', rainIntensity: 0.32 },
        { progressFraction: 0.60, condition: 'rain', rainIntensity: 0.76 },
      ];
    }
  } else {
    const found = WEATHER_PRESETS.find((p) => p.id === preset) ?? WEATHER_PRESETS[0];
    timeline = found.timeline.map((s) => ({ ...s }));
  }

  const first = timeline[0] ?? { progressFraction: 0, condition: 'dry' as WeatherCondition, rainIntensity: 0 };
  const initialWet =
    first.condition === 'drying-track'
      ? 0.55
      : first.rainIntensity > 0
        ? Math.min(0.85, 0.25 + first.rainIntensity * 0.55)
        : 0.0;
  const ambientBase = sceneryBaseAmbientTemp(params.compiledTrack.spec.scenery);
  const cloud = conditionToCloudCover(first.condition);
  const ambientTempC = Math.round((ambientBase - cloud * 4.5 - first.rainIntensity * 3.0) * 10) / 10;
  const trackTempC = Math.round((ambientTempC + (1 - cloud) * 13.5 - initialWet * 6.5) * 10) / 10;
  const estLapSec = Math.max(45, params.compiledTrack.spec.targetLapSeconds || 95);
  const estimatedSessionDuration = Math.max(90, estLapSec * Math.max(2, params.totalLaps || 5));

  return {
    preset,
    timeline,
    elapsedSeconds: 0,
    estimatedSessionDuration,
    condition: first.condition,
    rainIntensity: first.rainIntensity,
    cloudCover: cloud,
    trackWetness: initialWet,
    racingLineWetness: initialWet * (first.condition === 'drying-track' ? 0.78 : 1.0),
    offLineWetness: initialWet,
    trackRubber: initialWet > 0.35 ? 0.12 : 0.28,
    ambientTempC,
    trackTempC,
    puddles: generateTrackPuddles(params.compiledTrack),
    nextForecastLabel:
      timeline.length > 1
        ? `Next: ${formatWeatherCondition(timeline[1].condition)}`
        : formatWeatherCondition(first.condition),
  };
}

export function stepWeatherSystem(
  state: WeatherSystemState,
  dt: number,
  scenery: SceneryTheme,
  activeCarCount: number,
  raceProgressFraction?: number,
): void {
  state.elapsedSeconds += dt;
  const progress =
    raceProgressFraction !== undefined && Number.isFinite(raceProgressFraction)
      ? Math.max(0, Math.min(1, raceProgressFraction))
      : Math.min(1, state.elapsedSeconds / Math.max(60, state.estimatedSessionDuration));

  let activeIdx = 0;
  for (let i = 0; i < state.timeline.length; i++) {
    if (progress >= state.timeline[i].progressFraction) {
      activeIdx = i;
    }
  }
  const seg = state.timeline[activeIdx] ?? state.timeline[0];
  const nextSeg = state.timeline[activeIdx + 1] ?? null;

  state.condition = seg.condition;
  state.rainIntensity += (seg.rainIntensity - state.rainIntensity) * Math.min(1, dt * 0.18);
  const targetCloud = conditionToCloudCover(seg.condition);
  state.cloudCover += (targetCloud - state.cloudCover) * Math.min(1, dt * 0.12);

  // Racing line dries faster than off-line thanks to tire heat & displacement
  const trafficDryFactor = 1.0 + Math.min(1.6, activeCarCount * 0.10);
  const sunDryFactor = 0.6 + (1 - state.cloudCover) * 1.1;

  if (state.rainIntensity > 0.04) {
    const wetRate = state.rainIntensity * 0.022;
    const targetWet = Math.min(1.0, 0.18 + state.rainIntensity * 0.82);
    state.offLineWetness += (targetWet - state.offLineWetness) * Math.min(1, dt * (0.04 + wetRate * 4));
    const lineTarget = Math.max(0.08, targetWet - 0.06 * Math.min(1, activeCarCount / 14));
    state.racingLineWetness += (lineTarget - state.racingLineWetness) * Math.min(1, dt * (0.04 + wetRate * 3.5));
  } else {
    const baseDry = 0.0045 * sunDryFactor;
    state.racingLineWetness = Math.max(0, state.racingLineWetness - baseDry * 2.4 * trafficDryFactor * dt);
    state.offLineWetness = Math.max(0, state.offLineWetness - baseDry * 0.85 * dt);
    if (state.racingLineWetness < 0.04 && state.offLineWetness < 0.12 && state.condition === 'drying-track') {
      state.condition = state.cloudCover > 0.45 ? 'overcast' : 'dry';
    }
  }

  state.trackWetness = Math.max(
    0,
    Math.min(1, state.racingLineWetness * 0.65 + state.offLineWetness * 0.35),
  );

  // Track rubbering: builds gradually on dry/damp asphalt, washes away in heavy rain
  if (state.rainIntensity > 0.35) {
    state.trackRubber = Math.max(0.05, state.trackRubber - state.rainIntensity * 0.008 * dt);
  } else {
    const rubberGain = 0.00055 * (1 + Math.min(2.0, activeCarCount * 0.12)) * (1 - state.trackWetness * 0.7);
    state.trackRubber = Math.min(1.0, state.trackRubber + rubberGain * dt);
  }

  // Ambient & Track temperatures
  const baseAmbient = sceneryBaseAmbientTemp(scenery);
  const targetAmbient = baseAmbient - state.cloudCover * 4.5 - state.rainIntensity * 3.2;
  state.ambientTempC += (targetAmbient - state.ambientTempC) * Math.min(1, dt * 0.08);
  const solarHeat = (1 - state.cloudCover) * 14.0;
  const evapCool = state.trackWetness * 7.5;
  const targetTrackTemp = state.ambientTempC + solarHeat - evapCool + state.trackRubber * 2.0;
  state.trackTempC += (targetTrackTemp - state.trackTempC) * Math.min(1, dt * 0.10);

  if (nextSeg) {
    const pctLeft = Math.max(0, Math.round((nextSeg.progressFraction - progress) * 100));
    state.nextForecastLabel = `${formatWeatherCondition(nextSeg.condition)} (~${pctLeft}%)`;
  } else {
    state.nextForecastLabel = `${formatWeatherCondition(state.condition)} steady`;
  }
}

/**
 * Samples local wetness, standing-water puddle depth, and rubbering grip bonus at a car's track position.
 */
export function sampleLocalTrackSurfaceWeather(
  weather: WeatherSystemState,
  trackT: number,
  lateralOffset: number,
  halfWidth: number,
): { localWetness: number; puddleIntensity: number; rubberGripBonus: number; trackTempC: number } {
  const latNorm = Math.min(1.4, Math.abs(lateralOffset) / Math.max(2, halfWidth));
  // Racing line band spans roughly center +/- 42% of half-width
  const offLineBlend = Math.max(0, Math.min(1, (latNorm - 0.32) / 0.55));
  const localWetness =
    weather.racingLineWetness * (1 - offLineBlend) + weather.offLineWetness * offLineBlend;

  // Check deterministic puddles when off-line moisture is meaningful
  let puddleIntensity = 0;
  if (weather.offLineWetness > 0.28) {
    for (let i = 0; i < weather.puddles.length; i++) {
      const p = weather.puddles[i];
      let dt = Math.abs(trackT - p.t);
      if (dt > 0.5) dt = 1 - dt;
      if (dt > p.lengthT) continue;
      const puddleLat = p.lateralSide * p.lateralCenterRatio * halfWidth;
      const latDist = Math.abs(lateralOffset - puddleLat);
      const puddleHalfW = Math.max(1.4, halfWidth * 0.24);
      if (latDist < puddleHalfW) {
        const longFalloff = 1 - dt / p.lengthT;
        const latFalloff = 1 - latDist / puddleHalfW;
        const wetScale = Math.min(1, (weather.offLineWetness - 0.28) / 0.55);
        puddleIntensity = Math.max(puddleIntensity, p.depth * longFalloff * latFalloff * wetScale);
      }
    }
  }

  // Rubbering adds up to +4.5% dry grip on the racing line (reduced off-line and in rain)
  const rubberGripBonus =
    1.0 + weather.trackRubber * 0.045 * (1 - offLineBlend * 0.65) * (1 - localWetness * 0.85);

  return {
    localWetness: Math.min(1, localWetness + puddleIntensity * 0.25),
    puddleIntensity,
    rubberGripBonus,
    trackTempC: weather.trackTempC,
  };
}

// ==================== 1.3 Class-Specific Track Zones (DRS & Attack Mode) ====================

export interface DrsZoneSpec {
  id: number;
  detectionT: number;
  activationStartT: number;
  activationEndT: number;
}

export interface AttackModeZoneSpec {
  startT: number;
  endT: number;
  side: -1 | 1; // outside off-line side
  lateralMinRatio: number; // fraction of halfW (e.g. 0.42)
  lateralMaxRatio: number; // fraction of halfW (e.g. 0.96)
}

export interface TrackSpecialZones {
  drsZones: DrsZoneSpec[];
  attackModeZone: AttackModeZoneSpec;
}

function wrapT(t: number): number {
  return ((t % 1) + 1) % 1;
}

export function isTInRange(t: number, startT: number, endT: number): boolean {
  const tw = wrapT(t);
  const s = wrapT(startT);
  const e = wrapT(endT);
  if (s <= e) return tw >= s && tw <= e;
  return tw >= s || tw <= e;
}

/**
 * Derives 1-2 authentic DRS detection/activation zones on the longest low-curvature straights
 * plus an off-line Formula E Attack Mode activation loop for any circuit.
 */
export function computeTrackSpecialZones(compiledTrack: CompiledTrack): TrackSpecialZones {
  const N = 160;
  const trackLen = Math.max(300, compiledTrack.totalLength);
  const isStraight = new Array<boolean>(N);
  const curvatures = new Array<number>(N);

  for (let i = 0; i < N; i++) {
    const sp = sampleTrackAtT(compiledTrack, i / N);
    curvatures[i] = sp.curvature;
    isStraight[i] = Math.abs(sp.curvature) < 0.0085;
  }

  // Find contiguous straight runs (handling wrap-around)
  const runs: Array<{ startIdx: number; len: number }> = [];
  let i = 0;
  while (i < N) {
    if (!isStraight[i]) {
      i++;
      continue;
    }
    const startIdx = i;
    while (i < N && isStraight[i]) i++;
    runs.push({ startIdx, len: i - startIdx });
  }
  if (runs.length > 1 && isStraight[0] && isStraight[N - 1]) {
    const first = runs.shift()!;
    const last = runs[runs.length - 1];
    last.len += first.len;
  }

  runs.sort((a, b) => b.len - a.len);

  const drsZones: DrsZoneSpec[] = [];
  const minRunMeters = Math.min(260, trackLen * 0.065);
  for (let r = 0; r < Math.min(2, runs.length); r++) {
    const run = runs[r];
    const runMeters = (run.len / N) * trackLen;
    if (runMeters < minRunMeters && drsZones.length > 0) continue;
    const rawStart = run.startIdx / N;
    const rawLen = run.len / N;
    const trim = Math.min(rawLen * 0.14, 45 / trackLen);
    const activationStartT = wrapT(rawStart + trim);
    const activationEndT = wrapT(rawStart + Math.max(trim + 0.03, rawLen - trim));
    const detectionT = wrapT(activationStartT - Math.min(0.06, 140 / trackLen));
    drsZones.push({
      id: r + 1,
      detectionT,
      activationStartT,
      activationEndT,
    });
  }

  if (drsZones.length === 0) {
    drsZones.push({
      id: 1,
      detectionT: 0.90,
      activationStartT: 0.95,
      activationEndT: 0.08,
    });
  }

  // Formula E Attack Mode zone: pick a medium corner/exit outside line away from start line
  let bestAttackIdx = Math.floor(N * 0.36);
  let bestScore = -1;
  for (let k = Math.floor(N * 0.14); k < Math.floor(N * 0.86); k++) {
    const absC = Math.abs(curvatures[k]);
    // Prefer gentle-to-medium sweepers where going off-line costs ~0.3-0.5s
    const score = absC > 0.009 && absC < 0.026 ? 1.0 - Math.abs(absC - 0.016) * 40 : 0.1;
    if (score > bestScore) {
      bestScore = score;
      bestAttackIdx = k;
    }
  }
  const cVal = curvatures[bestAttackIdx];
  const outsideSide: -1 | 1 = cVal >= 0 ? -1 : 1;
  const loopLenT = Math.min(0.055, Math.max(0.025, 110 / trackLen));
  const attackStartT = wrapT(bestAttackIdx / N);
  const attackModeZone: AttackModeZoneSpec = {
    startT: attackStartT,
    endT: wrapT(attackStartT + loopLenT),
    side: outsideSide,
    lateralMinRatio: 0.36,
    lateralMaxRatio: 0.96,
  };

  return { drsZones, attackModeZone };
}

export const ERS_MODE_ORDER: readonly ErsMode[] = ['harvest', 'balanced', 'overtake', 'quali'];

export function cycleErsMode(current: ErsMode): ErsMode {
  const idx = ERS_MODE_ORDER.indexOf(current);
  return ERS_MODE_ORDER[(idx + 1) % ERS_MODE_ORDER.length];
}

export function getErsModeProfile(mode: ErsMode): {
  label: string;
  accelBonus: number;
  topSpeedBonus: number;
  drainPerSec: number;
  harvestMult: number;
} {
  switch (mode) {
    case 'harvest':
      return { label: 'HARVEST', accelBonus: -0.025, topSpeedBonus: -0.008, drainPerSec: -7.5, harvestMult: 1.55 };
    case 'balanced':
      return { label: 'BALANCED', accelBonus: 0.015, topSpeedBonus: 0.004, drainPerSec: 1.8, harvestMult: 1.0 };
    case 'overtake':
      return { label: 'OVERTAKE', accelBonus: 0.065, topSpeedBonus: 0.014, drainPerSec: 9.5, harvestMult: 0.65 };
    case 'quali':
      return { label: 'QUALI', accelBonus: 0.095, topSpeedBonus: 0.020, drainPerSec: 15.0, harvestMult: 0.45 };
  }
}

// ==================== 1.2 Authentic Flag Rules, SC/VSC & Heavy Penalty Race Control ====================

export const MICROSECTOR_COUNT = 18; // 6 microsectors per sector (S1: 0..5, S2: 6..11, S3: 12..17)

export const VSC_SPEED_CAP_KMH = 150;
export const VSC_SPEED_CAP_MS = VSC_SPEED_CAP_KMH / 3.6;
export const SAFETY_CAR_MIN_PACE_KMH = 115;
export const SAFETY_CAR_MAX_PACE_KMH = 135;
export const SAFETY_CAR_CATCHUP_CAP_KMH = 175;
export const SAFETY_CAR_LEADER_TARGET_GAP_M = 22.0;
export const SAFETY_CAR_QUEUE_GAP_M = 14.0;

export const DRIVE_THROUGH_HOLD_SECONDS = 4.0;
export const DRIVE_THROUGH_MAX_SPEED_KMH = 60;
export const DRIVE_THROUGH_MAX_SPEED_MS = DRIVE_THROUGH_MAX_SPEED_KMH / 3.6;
export const STOP_AND_GO_HOLD_SECONDS = 3.0;
export const STOP_AND_GO_MAX_SPEED_MS = 1.6;
export const STOP_AND_GO_MIN_OFFLINE_RATIO = 0.42;
export const HEAVY_PENALTY_LAP_WINDOW = 3;
export const DRIVE_THROUGH_POST_RACE_SECONDS = 15;
export const STOP_AND_GO_POST_RACE_SECONDS = 25;
export const SEVERE_CUTS_FOR_DRIVE_THROUGH = 3;
export const SEVERE_CUTS_FOR_STOP_AND_GO = 5;
export const HEAVY_PUNT_IMPACT_THRESHOLD = 19.0;
export const SEVERE_PUNT_IMPACT_THRESHOLD = 26.0;

export interface YellowYieldObligation {
  targetCarId: string;
  targetName: string;
  positionsToYield: number;
}

export interface SafetyCarState {
  phase: SafetyCarPhase;
  active: boolean;
  trackT: number;
  lateralOffset: number;
  speedMs: number;
  speedCapMs: number | null;
  timer: number;
  inThisLapRemaining: number;
  minDuration: number;
  maxDuration: number;
  cooldownTimer: number;
  deployedLap: number;
  leaderTargetGapM: number;
  greenRestartFlashTimer: number;
  incidentCountAtTrigger: number;
}

export interface IncidentMemoryEntry {
  time: number;
  trackT: number;
  impact: number;
  stopped: boolean;
}

export interface HeavyPenaltyRecord {
  penaltyType: 'drive-through' | 'stop-and-go';
  penaltyReason: PenaltyReason;
  issuedLap: number;
  deadlineLap: number;
  holdProgress: number;
  requiredHoldSeconds: number;
  postRaceEscalationSeconds: number;
}

export interface RaceControlState {
  globalFlag: RaceFlagState;
  sectorFlags: [SectorFlag, SectorFlag, SectorFlag];
  sectorYellowTimers: [number, number, number];
  microsectorFlags: SectorFlag[];
  microsectorYellowTimers: number[];
  yellowYieldByCarId: Map<string, YellowYieldObligation>;
  message: string | null;
  messageTimer: number;
  prevRankByCarId: Map<string, number>;
  yellowOvertakeCooldown: Map<string, number>;
  elapsedRaceTime: number;
  safetyCar: SafetyCarState;
  neutralizationSpeedCapMs: number | null;
  recentIncidentByCarId: Map<string, IncidentMemoryEntry>;
  heavyPenaltyByCarId: Map<string, HeavyPenaltyRecord>;
  prevWarningCountByCarId: Map<string, number>;
  prevExternalCutCountByCarId: Map<string, number>;
  prevExternalPuntCountByCarId: Map<string, number>;
  severeCutCountByCarId: Map<string, number>;
  avoidablePuntCountByCarId: Map<string, number>;
}

export interface RaceControlCarView {
  id: string;
  name: string;
  isPlayer: boolean;
  carSpec: { classId: CarClassId };
  trackT: number;
  lateralOffset: number;
  speed: number;
  yawRate?: number;
  lateralSlip: number;
  lap: number;
  totalDistance: number;
  finished: boolean;
  pitStopRemaining: number;
  lastWallImpact?: number;
  lastCollisionImpact?: number;
  warningCount: number;
  penaltyTimeRemaining: number;
  postRacePenaltySeconds?: number;
  penaltyReason?: PenaltyReason | null;
  penaltyType?: PenaltyType | null;
  blueFlagActive?: boolean;
  blackAndWhiteFlagged?: boolean;
  disqualified?: boolean;
  drsEligible?: boolean;
  inDrsZone?: boolean;
  inAttackModeZone?: boolean;
  attackModeUsesRemaining: number;
  attackModeTimer: number;
  specialActive: boolean;
  neutralizationSpeedCapMs?: number | null;
  safetyCarQueueTargetSpeedMs?: number | null;
  safetyCarBunchingGapM?: number | null;
  heavyPenaltyHoldProgress?: number;
  heavyPenaltyIssuedLap?: number | null;
  heavyPenaltyDeadlineLap?: number | null;
  heavyPenaltySevereCutCount?: number;
  heavyPenaltyPuntingCount?: number;
  lastAvoidableContactImpact?: number;
}

function createInitialSafetyCarState(): SafetyCarState {
  return {
    phase: 'none',
    active: false,
    trackT: 0,
    lateralOffset: 0,
    speedMs: 0,
    speedCapMs: null,
    timer: 0,
    inThisLapRemaining: 0,
    minDuration: 8.0,
    maxDuration: 26.0,
    cooldownTimer: 0,
    deployedLap: 1,
    leaderTargetGapM: SAFETY_CAR_LEADER_TARGET_GAP_M,
    greenRestartFlashTimer: 0,
    incidentCountAtTrigger: 0,
  };
}

export function createRaceControlState(): RaceControlState {
  return {
    globalFlag: 'green',
    sectorFlags: ['green', 'green', 'green'],
    sectorYellowTimers: [0, 0, 0],
    microsectorFlags: Array<SectorFlag>(MICROSECTOR_COUNT).fill('green'),
    microsectorYellowTimers: Array<number>(MICROSECTOR_COUNT).fill(0),
    yellowYieldByCarId: new Map(),
    message: null,
    messageTimer: 0,
    prevRankByCarId: new Map(),
    yellowOvertakeCooldown: new Map(),
    elapsedRaceTime: 0,
    safetyCar: createInitialSafetyCarState(),
    neutralizationSpeedCapMs: null,
    recentIncidentByCarId: new Map(),
    heavyPenaltyByCarId: new Map(),
    prevWarningCountByCarId: new Map(),
    prevExternalCutCountByCarId: new Map(),
    prevExternalPuntCountByCarId: new Map(),
    severeCutCountByCarId: new Map(),
    avoidablePuntCountByCarId: new Map(),
  };
}

export function getSectorIndexForT(t: number): 0 | 1 | 2 {
  const tw = wrapT(t);
  if (tw < 0.3333) return 0;
  if (tw < 0.6667) return 1;
  return 2;
}

export function getMicrosectorIndexForT(t: number): number {
  const tw = wrapT(t);
  return Math.min(MICROSECTOR_COUNT - 1, Math.floor(tw * MICROSECTOR_COUNT));
}

export function isCarInYellowMicrosector(rc: RaceControlState, trackT: number): boolean {
  const mIdx = getMicrosectorIndexForT(trackT);
  return rc.microsectorFlags[mIdx] === 'yellow';
}

function setRaceControlMessage(rc: RaceControlState, msg: string, duration = 4.0): void {
  rc.message = msg;
  rc.messageTimer = duration;
}

/**
 * Forward wrapped track distance in meters from `fromT` ahead to `toT` in [0, trackLen).
 */
export function wrappedTrackGapM(fromT: number, toT: number, trackLen: number): number {
  const safeLen = Math.max(1, trackLen);
  const dT = wrapT(toT - fromT);
  return dT * safeLen;
}

/**
 * Shortest wrapped track distance in meters between two track positions in [0, trackLen * 0.5].
 */
export function wrappedTrackDistanceM(tA: number, tB: number, trackLen: number): number {
  const safeLen = Math.max(1, trackLen);
  let dT = Math.abs(wrapT(tA) - wrapT(tB));
  if (dT > 0.5) dT = 1 - dT;
  return dT * safeLen;
}

/**
 * Computes the Safety Car's controlled pace in m/s (~115–135 km/h) based on local curvature
 * and how far behind the race leader currently is.
 */
export function computeSafetyCarPaceMs(
  compiledTrack: CompiledTrack,
  trackT: number,
  leaderGapM = SAFETY_CAR_LEADER_TARGET_GAP_M,
): number {
  const sp = sampleTrackAtT(compiledTrack, wrapT(trackT));
  const curvPaceKmh = Math.max(
    SAFETY_CAR_MIN_PACE_KMH,
    Math.min(SAFETY_CAR_MAX_PACE_KMH, SAFETY_CAR_MAX_PACE_KMH - Math.abs(sp.curvature) * 550),
  );
  // Ease slightly toward 115 km/h while the leader is still catching up; hold brisker pace when tight
  const catchupOffsetKmh = leaderGapM > 65 ? -8 : leaderGapM < 16 ? 5 : 0;
  const clampedKmh = Math.max(
    SAFETY_CAR_MIN_PACE_KMH,
    Math.min(SAFETY_CAR_MAX_PACE_KMH, curvPaceKmh + catchupOffsetKmh),
  );
  return clampedKmh / 3.6;
}

/**
 * Computes single-file bunching target speed (m/s) for a car queuing behind the Safety Car
 * or the preceding car in the Safety Car train.
 */
export function computeSingleFileBunchingSpeedMs(params: {
  scSpeedMs: number;
  gapAheadM: number;
  targetGapM: number;
}): number {
  const { scSpeedMs, gapAheadM, targetGapM } = params;
  const catchupCapMs = SAFETY_CAR_CATCHUP_CAP_KMH / 3.6;
  if (gapAheadM > targetGapM + 6.0) {
    return Math.min(catchupCapMs, scSpeedMs + Math.min(11.0, (gapAheadM - targetGapM - 6.0) * 0.35));
  }
  if (gapAheadM < targetGapM - 3.0) {
    return Math.max(16.0, scSpeedMs - Math.min(14.0, (targetGapM - 3.0 - gapAheadM) * 1.4));
  }
  return scSpeedMs;
}

export interface HeavyPenaltyEvaluationInput {
  severeCutCount: number;
  avoidablePuntCount: number;
  latestCollisionImpact?: number;
  currentPenaltyType?: PenaltyType | null;
  currentLap: number;
}

export interface HeavyPenaltyAssignment {
  penaltyType: 'drive-through' | 'stop-and-go';
  penaltyReason: PenaltyReason;
  requiredHoldSeconds: number;
  deadlineLap: number;
  postRaceEscalationSeconds: number;
}

/**
 * Evaluates whether repeated severe corner cuts (>=3) or avoidable heavy punting triggers
 * a serveable on-track 'drive-through' or 'stop-and-go' penalty.
 */
export function evaluateHeavyPenaltyAssignment(
  input: HeavyPenaltyEvaluationInput,
): HeavyPenaltyAssignment | null {
  const impact = input.latestCollisionImpact ?? 0;
  const lapWindowDeadline = input.currentLap + HEAVY_PENALTY_LAP_WINDOW;

  // Heavy avoidable punting takes precedence due to collision severity
  if (input.avoidablePuntCount >= 2 || (input.avoidablePuntCount >= 1 && impact >= SEVERE_PUNT_IMPACT_THRESHOLD)) {
    return {
      penaltyType: 'stop-and-go',
      penaltyReason: 'avoidable-contact',
      requiredHoldSeconds: STOP_AND_GO_HOLD_SECONDS,
      deadlineLap: lapWindowDeadline,
      postRaceEscalationSeconds: STOP_AND_GO_POST_RACE_SECONDS,
    };
  }
  if (input.avoidablePuntCount >= 1 && impact >= HEAVY_PUNT_IMPACT_THRESHOLD) {
    if (input.currentPenaltyType === 'stop-and-go') return null;
    return {
      penaltyType: 'drive-through',
      penaltyReason: 'avoidable-contact',
      requiredHoldSeconds: DRIVE_THROUGH_HOLD_SECONDS,
      deadlineLap: lapWindowDeadline,
      postRaceEscalationSeconds: DRIVE_THROUGH_POST_RACE_SECONDS,
    };
  }

  // Repeated severe corner cuts (>=3 for drive-through, >=5 for stop-and-go)
  if (input.severeCutCount >= SEVERE_CUTS_FOR_STOP_AND_GO) {
    return {
      penaltyType: 'stop-and-go',
      penaltyReason: 'corner-cut',
      requiredHoldSeconds: STOP_AND_GO_HOLD_SECONDS,
      deadlineLap: lapWindowDeadline,
      postRaceEscalationSeconds: STOP_AND_GO_POST_RACE_SECONDS,
    };
  }
  if (input.severeCutCount >= SEVERE_CUTS_FOR_DRIVE_THROUGH) {
    if (input.currentPenaltyType === 'stop-and-go') return null;
    return {
      penaltyType: 'drive-through',
      penaltyReason: 'corner-cut',
      requiredHoldSeconds: DRIVE_THROUGH_HOLD_SECONDS,
      deadlineLap: lapWindowDeadline,
      postRaceEscalationSeconds: DRIVE_THROUGH_POST_RACE_SECONDS,
    };
  }

  return null;
}

export interface PenaltyServeEvaluationInput {
  penaltyType: PenaltyType | null | undefined;
  speedMs: number;
  lateralOffset: number;
  trackHalfWidth: number;
  holdProgressSeconds: number;
  dt: number;
}

export interface PenaltyServeEvaluationResult {
  isServing: boolean;
  holdProgressSeconds: number;
  requiredSeconds: number;
  completed: boolean;
  instruction: string | null;
}

/**
 * Pure helper evaluating on-track serving for heavy penalties (since physical pit lanes are excluded):
 * - 'stop-and-go': requires holding stationary (<= 1.6 m/s) off the racing line for 3.0s
 * - 'drive-through': requires holding <= 60 km/h (16.67 m/s) speed-cap zone pace for 4.0s
 */
export function evaluateOnTrackPenaltyServe(
  input: PenaltyServeEvaluationInput,
): PenaltyServeEvaluationResult {
  const safeDt = Math.max(0, input.dt);
  if (input.penaltyType === 'stop-and-go') {
    const minOffLineM = Math.max(2.0, input.trackHalfWidth * STOP_AND_GO_MIN_OFFLINE_RATIO);
    const isOffLine = Math.abs(input.lateralOffset) >= minOffLineM;
    const isStationary = input.speedMs <= STOP_AND_GO_MAX_SPEED_MS;
    const isServing = isOffLine && isStationary;
    let nextProgress = input.holdProgressSeconds;
    if (isServing) {
      nextProgress = Math.min(STOP_AND_GO_HOLD_SECONDS, input.holdProgressSeconds + safeDt);
    } else if (input.speedMs > 8.0) {
      // Driving away at speed resets partial stationary hold
      nextProgress = 0;
    }
    const completed = nextProgress >= STOP_AND_GO_HOLD_SECONDS - 1e-6;
    return {
      isServing,
      holdProgressSeconds: nextProgress,
      requiredSeconds: STOP_AND_GO_HOLD_SECONDS,
      completed,
      instruction: `STOP & GO: PULL OFF-LINE & HOLD 0 KM/H (${nextProgress.toFixed(1)}/${STOP_AND_GO_HOLD_SECONDS.toFixed(1)}s)`,
    };
  }

  if (input.penaltyType === 'drive-through') {
    const withinSpeedCap = input.speedMs <= DRIVE_THROUGH_MAX_SPEED_MS + 1e-6;
    const isMoving = input.speedMs > 1.0;
    const isServing = withinSpeedCap && isMoving;
    let nextProgress = input.holdProgressSeconds;
    if (isServing) {
      nextProgress = Math.min(DRIVE_THROUGH_HOLD_SECONDS, input.holdProgressSeconds + safeDt);
    } else if (!withinSpeedCap) {
      // Exceeding 60 km/h resets the speed-cap zone hold
      nextProgress = 0;
    }
    const completed = nextProgress >= DRIVE_THROUGH_HOLD_SECONDS - 1e-6;
    return {
      isServing,
      holdProgressSeconds: nextProgress,
      requiredSeconds: DRIVE_THROUGH_HOLD_SECONDS,
      completed,
      instruction: `DRIVE-THROUGH: HOLD <=${DRIVE_THROUGH_MAX_SPEED_KMH} KM/H (${nextProgress.toFixed(1)}/${DRIVE_THROUGH_HOLD_SECONDS.toFixed(1)}s)`,
    };
  }

  return {
    isServing: false,
    holdProgressSeconds: 0,
    requiredSeconds: 0,
    completed: false,
    instruction: null,
  };
}

export interface PenaltyEscalationInput {
  penaltyType: PenaltyType | null | undefined;
  currentLap: number;
  issuedLap: number | null | undefined;
  deadlineLap?: number | null;
  finished: boolean;
  existingPostRaceSeconds?: number;
  lapWindow?: number;
}

export interface PenaltyEscalationResult {
  escalated: boolean;
  addedPostRaceSeconds: number;
  totalPostRaceSeconds: number;
  disqualified: boolean;
  clearActivePenalty: boolean;
}

/**
 * Escalates unserved 'drive-through' (+15s) or 'stop-and-go' (+25s) penalties
 * once 3 laps elapse after issuance or upon crossing the finish line unserved.
 */
export function evaluateHeavyPenaltyLapEscalation(
  input: PenaltyEscalationInput,
): PenaltyEscalationResult {
  const basePostRace = input.existingPostRaceSeconds ?? 0;
  if (input.penaltyType !== 'drive-through' && input.penaltyType !== 'stop-and-go') {
    return {
      escalated: false,
      addedPostRaceSeconds: 0,
      totalPostRaceSeconds: basePostRace,
      disqualified: false,
      clearActivePenalty: false,
    };
  }

  const windowLaps = input.lapWindow ?? HEAVY_PENALTY_LAP_WINDOW;
  const effectiveDeadline = input.deadlineLap ?? ((input.issuedLap ?? input.currentLap) + windowLaps);
  const expired = input.finished || input.currentLap >= effectiveDeadline;
  if (!expired) {
    return {
      escalated: false,
      addedPostRaceSeconds: 0,
      totalPostRaceSeconds: basePostRace,
      disqualified: false,
      clearActivePenalty: false,
    };
  }

  const added =
    input.penaltyType === 'stop-and-go'
      ? STOP_AND_GO_POST_RACE_SECONDS
      : DRIVE_THROUGH_POST_RACE_SECONDS;
  const total = basePostRace + added;
  return {
    escalated: true,
    addedPostRaceSeconds: added,
    totalPostRaceSeconds: total,
    disqualified: total >= 50,
    clearActivePenalty: true,
  };
}

function clearNeutralizationOnCars(cars: RaceControlCarView[]): void {
  for (let i = 0; i < cars.length; i++) {
    cars[i].neutralizationSpeedCapMs = null;
    cars[i].safetyCarQueueTargetSpeedMs = null;
    cars[i].safetyCarBunchingGapM = null;
  }
}

function releaseNeutralizationToGreen(
  rc: RaceControlState,
  ordered: RaceControlCarView[],
  opts: {
    incidentsClear: boolean;
    anyFinished: boolean;
    cooldownSeconds: number;
    flashSeconds: number;
    message: string;
  },
): void {
  const sc = rc.safetyCar;
  sc.phase = 'none';
  sc.active = false;
  sc.speedMs = 0;
  sc.speedCapMs = null;
  sc.inThisLapRemaining = 0;
  sc.cooldownTimer = opts.cooldownSeconds;
  sc.greenRestartFlashTimer = opts.flashSeconds;
  rc.neutralizationSpeedCapMs = null;
  if (opts.incidentsClear) {
    rc.microsectorYellowTimers.fill(0);
    rc.microsectorFlags.fill('green');
    rc.sectorYellowTimers = [0, 0, 0];
    rc.sectorFlags = ['green', 'green', 'green'];
  }
  clearNeutralizationOnCars(ordered);
  if (!opts.anyFinished) {
    setRaceControlMessage(rc, opts.message, 3.8);
  }
}

function findLargestIncidentCluster(
  incidents: Map<string, IncidentMemoryEntry>,
  trackLen: number,
): IncidentMemoryEntry[] {
  const entries = Array.from(incidents.values());
  if (entries.length < 2) return entries;
  const clusterRadiusM = Math.max(160, Math.min(280, trackLen * 0.09));
  let bestCluster: IncidentMemoryEntry[] = [];
  for (let i = 0; i < entries.length; i++) {
    const seed = entries[i];
    const cluster: IncidentMemoryEntry[] = [];
    for (let j = 0; j < entries.length; j++) {
      if (wrappedTrackDistanceM(seed.trackT, entries[j].trackT, trackLen) <= clusterRadiusM) {
        cluster.push(entries[j]);
      }
    }
    if (cluster.length > bestCluster.length) {
      bestCluster = cluster;
    }
  }
  return bestCluster;
}

function stepSafetyCarAndVsc(
  rc: RaceControlState,
  ordered: RaceControlCarView[],
  compiledTrack: CompiledTrack,
  dt: number,
  opts: { totalLaps: number; isRace: boolean },
  anyFinished: boolean,
  trackLen: number,
  halfW: number,
): Set<string> {
  const waveByCarIds = new Set<string>();
  const sc = rc.safetyCar;
  const leader = ordered[0];

  if (sc.cooldownTimer > 0) sc.cooldownTimer = Math.max(0, sc.cooldownTimer - dt);
  if (sc.greenRestartFlashTimer > 0) sc.greenRestartFlashTimer = Math.max(0, sc.greenRestartFlashTimer - dt);

  const cluster = findLargestIncidentCluster(rc.recentIncidentByCarId, trackLen);
  const stoppedCount = cluster.filter((e) => e.stopped).length;
  const heavyImpactCount = cluster.filter((e) => e.impact >= 14.0).length;
  const extremeImpactCount = cluster.filter((e) => e.impact >= 21.0).length;

  const canDeployNeutralization =
    opts.isRace &&
    opts.totalLaps >= 3 &&
    !anyFinished &&
    !(leader && leader.lap >= opts.totalLaps && leader.trackT > 0.72);

  // Deployment & VSC -> SC escalation checks
  if (canDeployNeutralization && cluster.length >= 2) {
    const needsFullSc =
      cluster.length >= 3 ||
      stoppedCount >= 2 ||
      extremeImpactCount >= 2 ||
      (stoppedCount >= 1 && heavyImpactCount >= 2);

    if (sc.phase === 'none' && sc.cooldownTimer <= 0) {
      if (needsFullSc) {
        sc.phase = 'deployed';
        sc.active = true;
        sc.timer = 0;
        sc.inThisLapRemaining = 0;
        sc.minDuration = 8.0;
        sc.maxDuration = 26.0;
        sc.deployedLap = leader?.lap ?? 1;
        sc.trackT = wrapT((leader?.trackT ?? 0) + Math.min(0.08, 110 / trackLen));
        sc.lateralOffset = 0;
        sc.speedMs = computeSafetyCarPaceMs(compiledTrack, sc.trackT, 110);
        sc.speedCapMs = sc.speedMs;
        sc.incidentCountAtTrigger = cluster.length;
        rc.neutralizationSpeedCapMs = sc.speedMs;
        setRaceControlMessage(rc, 'SAFETY CAR DEPLOYED — FORM SINGLE FILE, NO OVERTAKING', 5.0);
      } else {
        sc.phase = 'vsc';
        sc.active = false;
        sc.timer = 0;
        sc.inThisLapRemaining = 0;
        sc.minDuration = 5.0;
        sc.maxDuration = 14.0;
        sc.deployedLap = leader?.lap ?? 1;
        sc.speedMs = 0;
        sc.speedCapMs = VSC_SPEED_CAP_MS;
        sc.incidentCountAtTrigger = cluster.length;
        rc.neutralizationSpeedCapMs = VSC_SPEED_CAP_MS;
        setRaceControlMessage(rc, 'VIRTUAL SAFETY CAR DEPLOYED — RESPECT DELTA SPEED CAP', 4.5);
      }
    } else if (sc.phase === 'vsc' && needsFullSc) {
      sc.phase = 'deployed';
      sc.active = true;
      sc.timer = 0;
      sc.minDuration = 8.0;
      sc.maxDuration = 26.0;
      sc.trackT = wrapT((leader?.trackT ?? 0) + Math.min(0.08, 110 / trackLen));
      sc.lateralOffset = 0;
      sc.speedMs = computeSafetyCarPaceMs(compiledTrack, sc.trackT, 110);
      sc.speedCapMs = sc.speedMs;
      sc.incidentCountAtTrigger = cluster.length;
      rc.neutralizationSpeedCapMs = sc.speedMs;
      setRaceControlMessage(rc, 'ESCALATED TO FULL SAFETY CAR — SINGLE FILE BEHIND SC', 5.0);
    }
  }

  if (sc.phase === 'none') {
    rc.neutralizationSpeedCapMs = null;
    clearNeutralizationOnCars(ordered);
    return waveByCarIds;
  }

  sc.timer += dt;
  const incidentsClear = rc.recentIncidentByCarId.size === 0;
  const lateFinalLap = Boolean(opts.totalLaps > 0 && leader && leader.lap >= opts.totalLaps);

  if (sc.phase === 'vsc') {
    sc.speedCapMs = VSC_SPEED_CAP_MS;
    rc.neutralizationSpeedCapMs = VSC_SPEED_CAP_MS;
    for (let i = 0; i < ordered.length; i++) {
      const c = ordered[i];
      c.neutralizationSpeedCapMs = VSC_SPEED_CAP_MS;
      c.safetyCarQueueTargetSpeedMs = VSC_SPEED_CAP_MS;
      c.safetyCarBunchingGapM = null;
    }

    const shouldReleaseVsc =
      anyFinished ||
      lateFinalLap ||
      (sc.timer >= sc.minDuration && incidentsClear) ||
      sc.timer >= sc.maxDuration;

    if (shouldReleaseVsc) {
      releaseNeutralizationToGreen(rc, ordered, {
        incidentsClear,
        anyFinished,
        cooldownSeconds: 15.0,
        flashSeconds: 2.5,
        message: 'VSC ENDING — GREEN FLAG! RACE RESUMED',
      });
    }
    return waveByCarIds;
  }

  // Full Safety Car ('deployed' or 'in-this-lap')
  const leaderGapToSc = leader ? wrappedTrackGapM(leader.trackT, sc.trackT, trackLen) : sc.leaderTargetGapM;
  sc.speedMs = computeSafetyCarPaceMs(compiledTrack, sc.trackT, leaderGapToSc);
  sc.speedCapMs = sc.speedMs;
  rc.neutralizationSpeedCapMs = sc.speedMs;
  sc.trackT = wrapT(sc.trackT + (sc.speedMs * dt) / trackLen);

  const targetLat = sc.phase === 'in-this-lap' ? halfW * 0.78 : 0;
  sc.lateralOffset += (targetLat - sc.lateralOffset) * Math.min(1, dt * 3.5);

  // Single-file bunching rules & lapped car wave-by exemptions
  const activeQueue: RaceControlCarView[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const c = ordered[i];
    if (c.finished || c.pitStopRemaining > 0 || c.disqualified) {
      c.neutralizationSpeedCapMs = null;
      c.safetyCarQueueTargetSpeedMs = null;
      c.safetyCarBunchingGapM = null;
      continue;
    }

    const isLappedBetweenLeaderAndSc =
      sc.phase === 'deployed' &&
      leader &&
      c.id !== leader.id &&
      leader.totalDistance - c.totalDistance > 0.65 &&
      wrappedTrackGapM(leader.trackT, c.trackT, trackLen) <
        wrappedTrackGapM(leader.trackT, sc.trackT, trackLen);

    if (isLappedBetweenLeaderAndSc) {
      const waveCapMs = SAFETY_CAR_CATCHUP_CAP_KMH / 3.6;
      waveByCarIds.add(c.id);
      c.neutralizationSpeedCapMs = waveCapMs;
      c.safetyCarQueueTargetSpeedMs = waveCapMs;
      c.safetyCarBunchingGapM = null;
      continue;
    }

    activeQueue.push(c);
  }

  let bunchedCount = 0;
  for (let q = 0; q < activeQueue.length; q++) {
    const c = activeQueue[q];
    const targetGapM = q === 0 ? SAFETY_CAR_LEADER_TARGET_GAP_M : SAFETY_CAR_QUEUE_GAP_M;
    const gapAheadM =
      q === 0
        ? wrappedTrackGapM(c.trackT, sc.trackT, trackLen)
        : wrappedTrackGapM(c.trackT, activeQueue[q - 1].trackT, trackLen);
    c.safetyCarBunchingGapM = gapAheadM;

    const queueTargetSpeed = computeSingleFileBunchingSpeedMs({
      scSpeedMs: sc.speedMs,
      gapAheadM,
      targetGapM,
    });
    c.safetyCarQueueTargetSpeedMs = queueTargetSpeed;
    c.neutralizationSpeedCapMs = queueTargetSpeed;

    if (gapAheadM <= (q === 0 ? 75 : 55)) bunchedCount += 1;
  }

  if (sc.phase === 'deployed') {
    const packBunched =
      activeQueue.length === 0 ||
      (bunchedCount >= Math.max(1, Math.ceil(activeQueue.length * 0.5)) && leaderGapToSc <= 85);
    const readyToWithdraw =
      anyFinished ||
      lateFinalLap ||
      (sc.timer >= sc.minDuration && incidentsClear && (packBunched || sc.timer >= sc.minDuration + 4.0)) ||
      sc.timer >= sc.maxDuration - 2.5;

    if (readyToWithdraw) {
      if (anyFinished || lateFinalLap) {
        releaseNeutralizationToGreen(rc, ordered, {
          incidentsClear,
          anyFinished,
          cooldownSeconds: 18.0,
          flashSeconds: 3.0,
          message: 'GREEN FLAG — SAFETY CAR WITHDRAWN, RACING RESUMES!',
        });
      } else {
        sc.phase = 'in-this-lap';
        sc.inThisLapRemaining = 2.5;
        setRaceControlMessage(rc, 'SAFETY CAR IN THIS LAP — PREPARE FOR GREEN FLAG RESTART', 3.5);
      }
    }
  } else if (sc.phase === 'in-this-lap') {
    sc.inThisLapRemaining = Math.max(0, sc.inThisLapRemaining - dt);
    if (sc.inThisLapRemaining <= 0 || anyFinished || lateFinalLap) {
      releaseNeutralizationToGreen(rc, ordered, {
        incidentsClear,
        anyFinished,
        cooldownSeconds: 18.0,
        flashSeconds: 3.0,
        message: 'GREEN FLAG — SAFETY CAR WITHDRAWN, RACING RESUMES!',
      });
    }
  }

  return waveByCarIds;
}

function stepHeavyPenaltiesForCar(
  rc: RaceControlState,
  c: RaceControlCarView,
  dt: number,
  halfW: number,
  isRace: boolean,
): void {
  // Adopt any pre-populated heavy penalty directly on car state (e.g. from external assignment/tests)
  if (
    (c.penaltyType === 'drive-through' || c.penaltyType === 'stop-and-go') &&
    !rc.heavyPenaltyByCarId.has(c.id)
  ) {
    const isStopAndGo = c.penaltyType === 'stop-and-go';
    const issuedLap = c.heavyPenaltyIssuedLap ?? c.lap;
    const deadlineLap = c.heavyPenaltyDeadlineLap ?? issuedLap + HEAVY_PENALTY_LAP_WINDOW;
    rc.heavyPenaltyByCarId.set(c.id, {
      penaltyType: c.penaltyType,
      penaltyReason: c.penaltyReason ?? 'corner-cut',
      issuedLap,
      deadlineLap,
      holdProgress: c.heavyPenaltyHoldProgress ?? 0,
      requiredHoldSeconds: isStopAndGo ? STOP_AND_GO_HOLD_SECONDS : DRIVE_THROUGH_HOLD_SECONDS,
      postRaceEscalationSeconds: isStopAndGo ? STOP_AND_GO_POST_RACE_SECONDS : DRIVE_THROUGH_POST_RACE_SECONDS,
    });
  }

  // Detect new severe cuts or heavy avoidable punting increments
  const prevWarn = rc.prevWarningCountByCarId.get(c.id) ?? 0;
  const prevExtCuts = rc.prevExternalCutCountByCarId.get(c.id) ?? 0;
  const prevExtPunts = rc.prevExternalPuntCountByCarId.get(c.id) ?? 0;
  let severeCuts = rc.severeCutCountByCarId.get(c.id) ?? 0;
  let punts = rc.avoidablePuntCountByCarId.get(c.id) ?? 0;
  const latestImpact = Math.max(c.lastAvoidableContactImpact ?? 0, c.lastCollisionImpact ?? 0);

  if (typeof c.heavyPenaltySevereCutCount === 'number' && c.heavyPenaltySevereCutCount > prevExtCuts) {
    severeCuts += c.heavyPenaltySevereCutCount - prevExtCuts;
    rc.prevExternalCutCountByCarId.set(c.id, c.heavyPenaltySevereCutCount);
  }
  if (typeof c.heavyPenaltyPuntingCount === 'number' && c.heavyPenaltyPuntingCount > prevExtPunts) {
    punts += c.heavyPenaltyPuntingCount - prevExtPunts;
    rc.prevExternalPuntCountByCarId.set(c.id, c.heavyPenaltyPuntingCount);
  }

  if (c.warningCount > prevWarn) {
    const deltaWarn = c.warningCount - prevWarn;
    if (c.penaltyReason === 'corner-cut') {
      severeCuts += deltaWarn;
    } else if (c.penaltyReason === 'avoidable-contact' && latestImpact >= HEAVY_PUNT_IMPACT_THRESHOLD) {
      punts += 1;
    }
  } else if (
    isRace &&
    !c.finished &&
    (c.lastAvoidableContactImpact ?? 0) >= HEAVY_PUNT_IMPACT_THRESHOLD &&
    !rc.heavyPenaltyByCarId.has(c.id)
  ) {
    punts += 1;
    c.lastAvoidableContactImpact = 0;
  }

  rc.prevWarningCountByCarId.set(c.id, c.warningCount);
  rc.severeCutCountByCarId.set(c.id, severeCuts);
  rc.avoidablePuntCountByCarId.set(c.id, punts);

  if (isRace && !c.finished && !c.disqualified) {
    const existingRecord = rc.heavyPenaltyByCarId.get(c.id);
    const assignment = evaluateHeavyPenaltyAssignment({
      severeCutCount: severeCuts,
      avoidablePuntCount: punts,
      latestCollisionImpact: latestImpact,
      currentPenaltyType: existingRecord?.penaltyType ?? c.penaltyType,
      currentLap: c.lap,
    });

    if (
      assignment &&
      (!existingRecord ||
        (existingRecord.penaltyType === 'drive-through' && assignment.penaltyType === 'stop-and-go'))
    ) {
      rc.heavyPenaltyByCarId.set(c.id, {
        penaltyType: assignment.penaltyType,
        penaltyReason: assignment.penaltyReason,
        issuedLap: c.lap,
        deadlineLap: assignment.deadlineLap,
        holdProgress: 0,
        requiredHoldSeconds: assignment.requiredHoldSeconds,
        postRaceEscalationSeconds: assignment.postRaceEscalationSeconds,
      });
      c.penaltyType = assignment.penaltyType;
      c.penaltyReason = assignment.penaltyReason;
      c.penaltyTimeRemaining = 0;
      c.heavyPenaltyHoldProgress = 0;
      c.heavyPenaltyIssuedLap = c.lap;
      c.heavyPenaltyDeadlineLap = assignment.deadlineLap;
      if (c.isPlayer) {
        const label = assignment.penaltyType === 'stop-and-go' ? '3.0s OFF-LINE STOP & GO' : '4.0s <=60 KM/H DRIVE-THROUGH';
        setRaceControlMessage(rc, `STEWARD PENALTY: ${label} (SERVE BY LAP ${assignment.deadlineLap})`, 4.5);
      }
    }
  }

  const activeRecord = rc.heavyPenaltyByCarId.get(c.id);
  if (!activeRecord) return;

  // Keep car state synced even if physics temporarily altered penaltyType
  c.penaltyType = activeRecord.penaltyType;
  c.penaltyReason = activeRecord.penaltyReason;
  c.heavyPenaltyIssuedLap = activeRecord.issuedLap;
  c.heavyPenaltyDeadlineLap = activeRecord.deadlineLap;

  // 1) Check 3-lap / finish-line escalation to post-race +15s / +25s penalty
  const escalation = evaluateHeavyPenaltyLapEscalation({
    penaltyType: activeRecord.penaltyType,
    currentLap: c.lap,
    issuedLap: activeRecord.issuedLap,
    deadlineLap: activeRecord.deadlineLap,
    finished: c.finished,
    existingPostRaceSeconds: c.postRacePenaltySeconds ?? 0,
  });

  if (escalation.escalated) {
    c.postRacePenaltySeconds = escalation.totalPostRaceSeconds;
    if (escalation.disqualified) c.disqualified = true;
    rc.heavyPenaltyByCarId.delete(c.id);
    rc.severeCutCountByCarId.set(c.id, 0);
    rc.avoidablePuntCountByCarId.set(c.id, 0);
    c.penaltyType = null;
    c.penaltyReason = null;
    c.penaltyTimeRemaining = 0;
    c.heavyPenaltyHoldProgress = 0;
    c.heavyPenaltyIssuedLap = null;
    c.heavyPenaltyDeadlineLap = null;
    if (c.isPlayer) {
      setRaceControlMessage(
        rc,
        `UNSERVED PENALTY ESCALATED — +${escalation.addedPostRaceSeconds}s POST-RACE PENALTY`,
        4.5,
      );
    }
    return;
  }

  // 2) Evaluate on-track serving hold
  const serveRes = evaluateOnTrackPenaltyServe({
    penaltyType: activeRecord.penaltyType,
    speedMs: c.speed,
    lateralOffset: c.lateralOffset,
    trackHalfWidth: halfW,
    holdProgressSeconds: activeRecord.holdProgress,
    dt,
  });

  activeRecord.holdProgress = serveRes.holdProgressSeconds;
  c.heavyPenaltyHoldProgress = serveRes.holdProgressSeconds;

  if (serveRes.completed) {
    const servedType = activeRecord.penaltyType;
    rc.heavyPenaltyByCarId.delete(c.id);
    rc.severeCutCountByCarId.set(c.id, 0);
    rc.avoidablePuntCountByCarId.set(c.id, 0);
    c.penaltyType = null;
    c.penaltyReason = null;
    c.penaltyTimeRemaining = 0;
    c.heavyPenaltyHoldProgress = 0;
    c.heavyPenaltyIssuedLap = null;
    c.heavyPenaltyDeadlineLap = null;
    if (c.isPlayer) {
      setRaceControlMessage(rc, `${servedType.replace('-', ' ').toUpperCase()} PENALTY SERVED`, 3.2);
    }
  }
}

/**
 * Steps full Race Control:
 * - Local Yellow flags per microsector (18 microsectors = 6 per sector) on spins, stopped cars, or heavy crashes
 * - Safety Car ('safety-car') & Virtual Safety Car ('vsc') deployment, speed caps, single-file bunching & green-flag restart
 * - Serveable on-track 'drive-through' & 'stop-and-go' penalties with 3-lap +15s/+25s escalation
 * - Overtaking under yellow/SC/VSC with yield-back clearance
 * - Blue flags for slower-class or lapped traffic
 * - White flag (final lap), Black-and-White warning flag, Checkered flag
 * - DRS detection/activation & Formula E Attack Mode zone detection
 */
export function stepRaceControl(
  rc: RaceControlState,
  cars: RaceControlCarView[],
  compiledTrack: CompiledTrack,
  zones: TrackSpecialZones,
  dt: number,
  opts: {
    totalLaps: number;
    isRace: boolean;
  },
): void {
  rc.elapsedRaceTime += dt;
  if (rc.messageTimer > 0) {
    rc.messageTimer = Math.max(0, rc.messageTimer - dt);
    if (rc.messageTimer === 0) rc.message = null;
  }

  // Decay yellow overtake cooldowns
  rc.yellowOvertakeCooldown.forEach((val, key) => {
    const next = val - dt;
    if (next <= 0) rc.yellowOvertakeCooldown.delete(key);
    else rc.yellowOvertakeCooldown.set(key, next);
  });

  // 1. Sort cars by race progress (highest totalDistance first)
  const ordered = [...cars].sort((a, b) => b.totalDistance - a.totalDistance);
  const rankById = new Map<string, number>();
  const carById = new Map<string, RaceControlCarView>();
  for (let i = 0; i < ordered.length; i++) {
    rankById.set(ordered[i].id, i);
    carById.set(ordered[i].id, ordered[i]);
  }
  const leader = ordered[0];
  const anyFinished = ordered.some((c) => c.finished);
  const trackLen = Math.max(200, compiledTrack.totalLength);
  const halfW = compiledTrack.spec.trackWidth * 0.5;

  // 2. Detect microsector incidents & update rolling pileup memory window
  const microIncidentThisTick = new Array<boolean>(MICROSECTOR_COUNT).fill(false);

  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    if (c.finished || c.pitStopRemaining > 0 || c.disqualified) {
      rc.recentIncidentByCarId.delete(c.id);
      continue;
    }
    const mIdx = getMicrosectorIndexForT(c.trackT);
    const isSpun = Math.abs(c.yawRate ?? 0) > 2.65 && c.speed > 7.5;
    const isStoppedOnTrack = rc.elapsedRaceTime > 10.0 && c.speed < 1.6 && c.totalDistance > 0.03;
    const isStoppedForPileup =
      c.speed < 2.0 && c.totalDistance > 0.08 && (rc.elapsedRaceTime > 2.5 || c.totalDistance > 0.15);
    const maxImpact = Math.max(c.lastWallImpact ?? 0, c.lastCollisionImpact ?? 0);
    const isHeavyCrash = (c.lastWallImpact ?? 0) > 18.0 || (c.lastCollisionImpact ?? 0) > 16.0;
    const isPileupCrash = (c.lastWallImpact ?? 0) >= 16.0 || (c.lastCollisionImpact ?? 0) >= 14.0;

    if (isSpun || isStoppedOnTrack || isHeavyCrash) {
      const holdDur = isHeavyCrash ? 4.5 : 2.8;
      microIncidentThisTick[mIdx] = true;
      rc.microsectorYellowTimers[mIdx] = Math.max(rc.microsectorYellowTimers[mIdx], holdDur);
      // Flag the immediate approach microsector as well so approaching drivers see the local yellow
      const prevM = (mIdx - 1 + MICROSECTOR_COUNT) % MICROSECTOR_COUNT;
      microIncidentThisTick[prevM] = true;
      rc.microsectorYellowTimers[prevM] = Math.max(rc.microsectorYellowTimers[prevM], holdDur * 0.85);
    }

    if (isPileupCrash || isStoppedForPileup) {
      rc.recentIncidentByCarId.set(c.id, {
        time: rc.elapsedRaceTime,
        trackT: wrapT(c.trackT),
        impact: maxImpact,
        stopped: isStoppedForPileup,
      });
    }
  }

  // Prune expired or recovered incident records from the 6.0s rolling window
  rc.recentIncidentByCarId.forEach((entry, carId) => {
    const c = carById.get(carId);
    const age = rc.elapsedRaceTime - entry.time;
    const recoveredAndMoving =
      c !== undefined &&
      c.speed > 14.0 &&
      (c.lastWallImpact ?? 0) < 5.0 &&
      (c.lastCollisionImpact ?? 0) < 5.0 &&
      age > 2.0;
    if (!c || c.finished || c.pitStopRemaining > 0 || age > 6.0 || recoveredAndMoving) {
      rc.recentIncidentByCarId.delete(carId);
    }
  });

  for (let m = 0; m < MICROSECTOR_COUNT; m++) {
    if (!microIncidentThisTick[m] && rc.microsectorYellowTimers[m] > 0) {
      rc.microsectorYellowTimers[m] = Math.max(0, rc.microsectorYellowTimers[m] - dt);
    }
    rc.microsectorFlags[m] = rc.microsectorYellowTimers[m] > 0 ? 'yellow' : 'green';
  }

  // Derive general sector flags (S1/S2/S3) from microsectors for the sector status bar
  const microPerSector = MICROSECTOR_COUNT / 3;
  for (let s = 0; s < 3; s++) {
    let maxTimer = 0;
    for (let k = 0; k < microPerSector; k++) {
      const tVal = rc.microsectorYellowTimers[s * microPerSector + k];
      if (tVal > maxTimer) maxTimer = tVal;
    }
    rc.sectorYellowTimers[s] = maxTimer;
    rc.sectorFlags[s] = maxTimer > 0 ? 'yellow' : 'green';
  }

  // 2b. Safety Car & Virtual Safety Car deployment, bunching, speed caps, and green-flag restart
  const waveByCarIds = stepSafetyCarAndVsc(
    rc,
    ordered,
    compiledTrack,
    dt,
    opts,
    anyFinished,
    trackLen,
    halfW,
  );
  const isNeutralized =
    rc.safetyCar.phase === 'vsc' ||
    rc.safetyCar.phase === 'deployed' ||
    rc.safetyCar.phase === 'in-this-lap';

  // 3. Overtaking under Yellow / SC / VSC + yield-back clearance + Heavy Penalties
  for (let idx = 0; idx < ordered.length; idx++) {
    const c = ordered[idx];
    const prevRank = rc.prevRankByCarId.get(c.id);
    const inYellowMicro = isCarInYellowMicrosector(rc, c.trackT);

    // Check if an existing yellow-flag yield obligation has been satisfied
    const activeYield = rc.yellowYieldByCarId.get(c.id);
    if (activeYield) {
      const targetRank = rankById.get(activeYield.targetCarId);
      const gavePositionBack = targetRank !== undefined && idx > targetRank;
      if (gavePositionBack || c.penaltyTimeRemaining <= 0 || c.penaltyReason !== 'yellow-overtake') {
        rc.yellowYieldByCarId.delete(c.id);
        if (gavePositionBack && c.penaltyReason === 'yellow-overtake') {
          c.penaltyTimeRemaining = 0;
          c.penaltyReason = null;
          c.penaltyType = null;
          if (c.isPlayer) {
            setRaceControlMessage(rc, 'POSITION YIELDED — YELLOW FLAG PENALTY CLEARED', 2.8);
          }
        }
      }
    }

    const overtakeProhibited =
      (inYellowMicro && rc.elapsedRaceTime > 8.0) ||
      (isNeutralized && rc.safetyCar.timer > 0.2 && !waveByCarIds.has(c.id));

    if (
      opts.isRace &&
      prevRank !== undefined &&
      idx < prevRank &&
      overtakeProhibited &&
      !c.finished &&
      c.pitStopRemaining <= 0 &&
      !rc.yellowOvertakeCooldown.has(c.id)
    ) {
      // Only penalize if overtaken car is genuinely racing on-track (not stopped/pitted/serving penalty)
      const passedCar = ordered[idx + 1];
      const passedCarServingHeavy =
        passedCar?.penaltyType === 'stop-and-go' || passedCar?.penaltyType === 'drive-through';
      const minPassedSpeed = isNeutralized ? 10.0 : 18.0;
      if (
        passedCar &&
        passedCar.speed > minPassedSpeed &&
        passedCar.pitStopRemaining <= 0 &&
        !passedCarServingHeavy &&
        Math.abs(passedCar.lateralOffset) < halfW * 1.05
      ) {
        rc.yellowOvertakeCooldown.set(c.id, 10.0);
        c.warningCount += 1;
        c.penaltyReason = 'yellow-overtake';
        c.penaltyType = 'slow-down';
        const prevYield = rc.yellowYieldByCarId.get(c.id);
        const positionsToYield = Math.min(3, (prevYield?.positionsToYield ?? 0) + (prevRank - idx));
        c.penaltyTimeRemaining = Math.min(2.5, Math.max(1.2, c.penaltyTimeRemaining + 1.2));
        rc.yellowYieldByCarId.set(c.id, {
          targetCarId: passedCar.id,
          targetName: passedCar.name,
          positionsToYield,
        });
        if (c.isPlayer) {
          const contextLabel = isNeutralized ? 'SAFETY CAR / VSC' : 'YELLOW FLAG';
          setRaceControlMessage(
            rc,
            `${contextLabel} OVERTAKE — YIELD ${positionsToYield} POS TO ${passedCar.name.toUpperCase()} OR SLOW ${c.penaltyTimeRemaining.toFixed(1)}s`,
            3.8,
          );
        }
      }
    }
    rc.prevRankByCarId.set(c.id, idx);

    // Serveable on-track heavy penalties ('drive-through' & 'stop-and-go') + 3-lap escalation
    stepHeavyPenaltiesForCar(rc, c, dt, halfW, opts.isRace);

    // Black-and-White flag warning at 5 warnings
    if (c.warningCount >= 5 && !c.blackAndWhiteFlagged) {
      c.blackAndWhiteFlagged = true;
      if (c.isPlayer) {
        setRaceControlMessage(rc, 'BLACK & WHITE FLAG — FINAL TRACK LIMITS / CONDUCT WARNING', 4.0);
      }
    }
  }

  // 4. Blue Flags (Multi-Class / Lapped Traffic)
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    c.blueFlagActive = false;
    if (c.finished || c.pitStopRemaining > 0) continue;
    const myPace = CAR_CLASSES[c.carSpec.classId]?.basePaceIndex ?? 0.8;

    for (let j = 0; j < cars.length; j++) {
      if (i === j) continue;
      const other = cars[j];
      if (other.finished || other.pitStopRemaining > 0) continue;
      const otherPace = CAR_CLASSES[other.carSpec.classId]?.basePaceIndex ?? 0.8;
      const isFasterClass = otherPace > myPace + 0.06;
      const isLapping = other.totalDistance > c.totalDistance + 0.65;
      if (!isFasterClass && !isLapping) continue;

      let dT = c.trackT - other.trackT;
      if (dT > 0.5) dT -= 1;
      if (dT < -0.5) dT += 1;
      const distAhead = dT * trackLen; // positive means `other` is behind `c`
      if (distAhead > 3.0 && distAhead < 68.0 && other.speed >= c.speed - 3.0) {
        c.blueFlagActive = true;
        break;
      }
    }
  }

  // 5. DRS Detection/Activation (STRICTLY F1 2021 ONLY; disabled under SC/VSC) & Formula E Attack Mode Zone
  const drsAllowedGlobally = !isNeutralized && (opts.isRace ? (leader?.lap ?? 1) >= 2 : true);

  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    const isF121Car = c.carSpec.classId === CarClassId.F1_2021;
    const inDrs =
      isF121Car &&
      zones.drsZones.some((z) => isTInRange(c.trackT, z.activationStartT, z.activationEndT));
    c.inDrsZone = inDrs;

    if (!isF121Car || !drsAllowedGlobally) {
      c.drsEligible = false;
    } else if (!opts.isRace) {
      // Practice / Qualifying: F1 2021 DRS allowed in any DRS zone
      c.drsEligible = inDrs;
    } else {
      // Check if within <1.0s gap to any car ahead on track
      let withinOneSec = false;
      const refSpeed = Math.max(25, c.speed);
      const oneSecDist = Math.min(85, Math.max(28, refSpeed * 1.05));
      for (let j = 0; j < cars.length; j++) {
        if (i === j) continue;
        const other = cars[j];
        if (other.finished || other.pitStopRemaining > 0) continue;
        let dT = other.trackT - c.trackT;
        if (dT > 0.5) dT -= 1;
        if (dT < -0.5) dT += 1;
        const gapM = dT * trackLen;
        if (gapM > 2.5 && gapM <= oneSecDist) {
          withinOneSec = true;
          break;
        }
      }
      c.drsEligible = inDrs && withinOneSec;
    }

    // Attack Mode zone check strictly for Formula E cars only
    if (c.carSpec.classId === CarClassId.FORMULA_E) {
      const az = zones.attackModeZone;
      const inAzLong = isTInRange(c.trackT, az.startT, az.endT);
      const latSigned = c.lateralOffset * az.side;
      const inAzLat = latSigned >= az.lateralMinRatio * halfW && latSigned <= az.lateralMaxRatio * halfW + 1.2;
      c.inAttackModeZone = inAzLong && inAzLat;
    } else {
      c.inAttackModeZone = false;
    }

    if (
      c.carSpec.classId === CarClassId.FORMULA_E &&
      c.inAttackModeZone &&
      c.attackModeUsesRemaining > 0 &&
      c.attackModeTimer <= 0 &&
      c.speed > 12
    ) {
      c.attackModeUsesRemaining -= 1;
      c.attackModeTimer = 15.0;
      c.specialActive = true;
      if (c.isPlayer) {
        setRaceControlMessage(rc, 'ATTACK MODE ACTIVATED — 15s AWD BOOST!', 3.0);
      }
    }
  }

  // 6. Compute global flag priority
  const anyYellow = rc.sectorFlags[0] === 'yellow' || rc.sectorFlags[1] === 'yellow' || rc.sectorFlags[2] === 'yellow';
  const yellowCount =
    (rc.sectorFlags[0] === 'yellow' ? 1 : 0) +
    (rc.sectorFlags[1] === 'yellow' ? 1 : 0) +
    (rc.sectorFlags[2] === 'yellow' ? 1 : 0);

  if (anyFinished && opts.isRace) {
    rc.globalFlag = 'checkered';
  } else if (rc.safetyCar.phase === 'deployed' || rc.safetyCar.phase === 'in-this-lap') {
    rc.globalFlag = 'safety-car';
  } else if (rc.safetyCar.phase === 'vsc') {
    rc.globalFlag = 'vsc';
  } else if (yellowCount >= 2) {
    rc.globalFlag = 'double-yellow';
  } else if (anyYellow) {
    rc.globalFlag = 'yellow';
  } else if (opts.isRace && opts.totalLaps >= 2 && leader && leader.lap >= opts.totalLaps) {
    rc.globalFlag = 'white';
  } else {
    rc.globalFlag = 'green';
  }
}

// ==================== Standing-Start Launch Helper ====================

export const LAUNCH_RPM_SWEET_SPOT: [number, number] = [0.66, 0.88];

export function evaluateStandingStartLaunch(params: {
  rpmNormalized: number;
}): {
  status: 'none' | 'perfect';
  launchBoostSeconds: number;
} {
  if (
    params.rpmNormalized >= LAUNCH_RPM_SWEET_SPOT[0] &&
    params.rpmNormalized <= LAUNCH_RPM_SWEET_SPOT[1]
  ) {
    return {
      status: 'perfect',
      launchBoostSeconds: 1.6,
    };
  }
  return {
    status: 'none',
    launchBoostSeconds: 0,
  };
}
