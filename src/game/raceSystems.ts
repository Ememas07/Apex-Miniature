import { CAR_CLASSES } from './cars';
import { CompiledTrack, sampleTrackAtT } from './tracks';
import {
  CarClassId,
  ErsMode,
  PenaltyReason,
  PenaltyType,
  RaceFlagState,
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

// ==================== 1.2 Authentic Flag Rules, Race Control & Safety Car / VSC ====================

export interface SafetyCarSimState {
  active: boolean;
  phase: 'none' | 'vsc' | 'sc' | 'sc-ending';
  timer: number;
  cooldown: number;
  trackT: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number; // m/s
  speedLimitMs: number; // m/s cap during VSC / SC
  lightsOn: boolean; // amber flashing when active, green/off when ending
}

export interface RaceControlState {
  globalFlag: RaceFlagState;
  sectorFlags: [SectorFlag, SectorFlag, SectorFlag];
  sectorYellowTimers: [number, number, number];
  safetyCar: SafetyCarSimState;
  message: string | null;
  messageTimer: number;
  incidentAccumulator: number;
  lastIncidentTime: number;
  prevRankByCarId: Map<string, number>;
  yellowOvertakeCooldown: Map<string, number>;
  elapsedRaceTime: number;
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
}

export function createRaceControlState(): RaceControlState {
  return {
    globalFlag: 'green',
    sectorFlags: ['green', 'green', 'green'],
    sectorYellowTimers: [0, 0, 0],
    safetyCar: {
      active: false,
      phase: 'none',
      timer: 0,
      cooldown: 18, // grace period at race start
      trackT: 0.04,
      x: 0,
      y: 0,
      z: 0,
      heading: 0,
      speed: 32,
      speedLimitMs: 36,
      lightsOn: false,
    },
    message: null,
    messageTimer: 0,
    incidentAccumulator: 0,
    lastIncidentTime: -99,
    prevRankByCarId: new Map(),
    yellowOvertakeCooldown: new Map(),
    elapsedRaceTime: 0,
  };
}

export function getSectorIndexForT(t: number): 0 | 1 | 2 {
  const tw = wrapT(t);
  if (tw < 0.3333) return 0;
  if (tw < 0.6667) return 1;
  return 2;
}

function setRaceControlMessage(rc: RaceControlState, msg: string, duration = 4.0): void {
  rc.message = msg;
  rc.messageTimer = duration;
}

/**
 * Steps full Race Control:
 * - Local Yellow flags per sector on spins, stopped cars, or heavy crashes + overtaking under yellow enforcement
 * - Blue flags for slower-class or lapped traffic
 * - White flag (final lap), Black-and-White warning flag, Checkered flag
 * - Safety Car (SC) & Virtual Safety Car (VSC) deployment, physical SC spline movement & restart
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
    safetyCarEnabled: boolean;
  },
): void {
  rc.elapsedRaceTime += dt;
  if (rc.messageTimer > 0) {
    rc.messageTimer = Math.max(0, rc.messageTimer - dt);
    if (rc.messageTimer === 0) rc.message = null;
  }
  if (rc.safetyCar.cooldown > 0) {
    rc.safetyCar.cooldown = Math.max(0, rc.safetyCar.cooldown - dt);
  }

  // Decay yellow overtake cooldowns
  rc.yellowOvertakeCooldown.forEach((val, key) => {
    const next = val - dt;
    if (next <= 0) rc.yellowOvertakeCooldown.delete(key);
    else rc.yellowOvertakeCooldown.set(key, next);
  });

  // 1. Sort cars by race progress (highest totalDistance first)
  const ordered = [...cars].sort((a, b) => b.totalDistance - a.totalDistance);
  const leader = ordered[0];
  const trackLen = Math.max(200, compiledTrack.totalLength);
  const halfW = compiledTrack.spec.trackWidth * 0.5;

  // 2. Detect sector incidents (spun, stopped, or crashed car)
  const sectorIncidentThisTick: [boolean, boolean, boolean] = [false, false, false];
  let stoppedOrHeavyCount = 0;

  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    if (c.finished || c.pitStopRemaining > 0) continue;
    const secIdx = getSectorIndexForT(c.trackT);
    const isSpun = Math.abs(c.yawRate ?? 0) > 1.85 && c.speed > 5;
    const isStoppedOnTrack = rc.elapsedRaceTime > 6.5 && c.speed < 2.8 && c.totalDistance > 0.02;
    const isHeavyCrash = (c.lastWallImpact ?? 0) > 12.5 || (c.lastCollisionImpact ?? 0) > 11.5;

    if (isSpun || isStoppedOnTrack || isHeavyCrash) {
      sectorIncidentThisTick[secIdx] = true;
      rc.sectorYellowTimers[secIdx] = Math.max(rc.sectorYellowTimers[secIdx], isHeavyCrash ? 6.0 : 4.0);
    }
    if (isHeavyCrash || isStoppedOnTrack) {
      stoppedOrHeavyCount += 1;
    }
  }

  for (let s = 0; s < 3; s++) {
    if (!sectorIncidentThisTick[s] && rc.sectorYellowTimers[s] > 0) {
      rc.sectorYellowTimers[s] = Math.max(0, rc.sectorYellowTimers[s] - dt);
    }
    rc.sectorFlags[s] = rc.sectorYellowTimers[s] > 0 ? 'yellow' : 'green';
  }

  // 3. Safety Car & Virtual Safety Car trigger / progression
  if (opts.isRace && opts.safetyCarEnabled && opts.totalLaps >= 3 && leader && !leader.finished) {
    if (stoppedOrHeavyCount >= 2 && rc.safetyCar.phase === 'none' && rc.safetyCar.cooldown <= 0 && rc.elapsedRaceTime > 12) {
      rc.incidentAccumulator += dt * stoppedOrHeavyCount;
      rc.lastIncidentTime = rc.elapsedRaceTime;
    } else if (rc.elapsedRaceTime - rc.lastIncidentTime > 5.0) {
      rc.incidentAccumulator = Math.max(0, rc.incidentAccumulator - dt * 0.5);
    }

    if (
      rc.safetyCar.phase === 'none' &&
      rc.safetyCar.cooldown <= 0 &&
      leader.lap < opts.totalLaps &&
      rc.incidentAccumulator >= 1.2
    ) {
      rc.incidentAccumulator = 0;
      const deployFullSc = stoppedOrHeavyCount >= 3 || Math.random() < 0.55;
      if (deployFullSc) {
        rc.safetyCar.active = true;
        rc.safetyCar.phase = 'sc';
        rc.safetyCar.timer = 22.0;
        rc.safetyCar.speed = 32.0; // ~115 km/h
        rc.safetyCar.speedLimitMs = 34.0;
        rc.safetyCar.lightsOn = true;
        rc.safetyCar.trackT = wrapT(leader.trackT + Math.min(0.08, 45 / trackLen));
        setRaceControlMessage(rc, 'SAFETY CAR DEPLOYED — NO OVERTAKING', 5.0);
      } else {
        rc.safetyCar.active = true;
        rc.safetyCar.phase = 'vsc';
        rc.safetyCar.timer = 14.0;
        rc.safetyCar.speedLimitMs = 36.0; // ~130 km/h VSC delta cap
        rc.safetyCar.lightsOn = false;
        setRaceControlMessage(rc, 'VIRTUAL SAFETY CAR — RESPECT DELTA SPEED', 5.0);
      }
    }
  }

  if (rc.safetyCar.phase === 'vsc') {
    rc.safetyCar.timer = Math.max(0, rc.safetyCar.timer - dt);
    if (rc.safetyCar.timer <= 0) {
      rc.safetyCar.phase = 'none';
      rc.safetyCar.active = false;
      rc.safetyCar.cooldown = 45.0;
      setRaceControlMessage(rc, 'VSC ENDING — GREEN FLAG!', 3.5);
    }
  } else if (rc.safetyCar.phase === 'sc' || rc.safetyCar.phase === 'sc-ending') {
    rc.safetyCar.timer = Math.max(0, rc.safetyCar.timer - dt);
    // Advance physical Safety Car along spline ahead of leader
    const scSpd = rc.safetyCar.phase === 'sc-ending' ? 42.0 : 32.0;
    rc.safetyCar.speed = scSpd;
    rc.safetyCar.trackT = wrapT(rc.safetyCar.trackT + (scSpd * dt) / trackLen);
    const sp = sampleTrackAtT(compiledTrack, rc.safetyCar.trackT);
    rc.safetyCar.x = sp.x;
    rc.safetyCar.y = sp.y;
    rc.safetyCar.z = sp.z;
    rc.safetyCar.heading = Math.atan2(sp.tx, sp.tz);

    if (rc.safetyCar.phase === 'sc' && rc.safetyCar.timer <= 5.0) {
      rc.safetyCar.phase = 'sc-ending';
      rc.safetyCar.lightsOn = false; // roof lights switch off -> green restart imminent
      setRaceControlMessage(rc, 'SAFETY CAR IN THIS LAP — PREPARE FOR RESTART', 4.5);
    } else if (rc.safetyCar.phase === 'sc-ending' && rc.safetyCar.timer <= 0) {
      rc.safetyCar.phase = 'none';
      rc.safetyCar.active = false;
      rc.safetyCar.cooldown = 55.0;
      setRaceControlMessage(rc, 'GREEN FLAG — RACING RESUMES!', 3.5);
    }
  }

  // 4. Overtaking under Yellow / SC / VSC + VSC speeding enforcement
  const isNeutralized = rc.safetyCar.phase !== 'none';
  for (let idx = 0; idx < ordered.length; idx++) {
    const c = ordered[idx];
    const prevRank = rc.prevRankByCarId.get(c.id);
    const secIdx = getSectorIndexForT(c.trackT);
    const inYellow = rc.sectorFlags[secIdx] === 'yellow' || isNeutralized;

    if (
      opts.isRace &&
      rc.elapsedRaceTime > 8.0 &&
      prevRank !== undefined &&
      idx < prevRank &&
      inYellow &&
      !c.finished &&
      c.pitStopRemaining <= 0 &&
      !rc.yellowOvertakeCooldown.has(c.id)
    ) {
      // Only penalize if overtaken car wasn't itself stopped/crawling (< 8 m/s)
      const passedCar = ordered[idx + 1];
      if (passedCar && passedCar.speed > 10.0) {
        rc.yellowOvertakeCooldown.set(c.id, 6.0);
        c.warningCount += 1;
        c.penaltyReason = 'yellow-overtake';
        c.penaltyType = 'slow-down';
        c.penaltyTimeRemaining = Math.min(2.5, Math.max(1.0, c.penaltyTimeRemaining + 1.2));
        if (c.isPlayer) {
          setRaceControlMessage(rc, 'ILLEGAL OVERTAKE UNDER YELLOW — SLOW DOWN TO SERVE PENALTY', 4.0);
        }
      }
    }
    rc.prevRankByCarId.set(c.id, idx);

    // VSC delta speed check (lenient +6 m/s grace)
    if (
      opts.isRace &&
      rc.safetyCar.phase === 'vsc' &&
      rc.safetyCar.timer < 11.5 &&
      c.speed > rc.safetyCar.speedLimitMs + 6.5 &&
      !c.finished
    ) {
      if (!rc.yellowOvertakeCooldown.has(c.id)) {
        rc.yellowOvertakeCooldown.set(c.id, 5.0);
        c.penaltyReason = 'vsc-speeding';
        c.penaltyType = 'time-penalty';
        c.postRacePenaltySeconds = (c.postRacePenaltySeconds ?? 0) + 3;
        if (c.isPlayer) {
          setRaceControlMessage(rc, 'VSC DELTA INFRINGEMENT — +3s TIME PENALTY', 3.5);
        }
      }
    }

    // Black-and-White flag warning at 3 warnings
    if (c.warningCount >= 3 && !c.blackAndWhiteFlagged) {
      c.blackAndWhiteFlagged = true;
      if (c.isPlayer) {
        setRaceControlMessage(rc, 'BLACK & WHITE FLAG — FINAL TRACK LIMITS / CONDUCT WARNING', 4.0);
      }
    }
  }

  // 5. Blue Flags (Multi-Class / Lapped Traffic)
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

  // 6. DRS Detection/Activation & Formula E Attack Mode Zone
  const drsAllowedGlobally =
    !isNeutralized && (opts.isRace ? (leader?.lap ?? 1) >= 2 : true);

  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    const inDrs = zones.drsZones.some((z) => isTInRange(c.trackT, z.activationStartT, z.activationEndT));
    c.inDrsZone = inDrs;

    if (!drsAllowedGlobally) {
      c.drsEligible = false;
    } else if (!opts.isRace) {
      // Practice / Qualifying: DRS allowed in any DRS zone
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

  // 7. Compute global flag priority
  const anyFinished = ordered.some((c) => c.finished);
  const anyYellow = rc.sectorFlags[0] === 'yellow' || rc.sectorFlags[1] === 'yellow' || rc.sectorFlags[2] === 'yellow';
  const yellowCount =
    (rc.sectorFlags[0] === 'yellow' ? 1 : 0) +
    (rc.sectorFlags[1] === 'yellow' ? 1 : 0) +
    (rc.sectorFlags[2] === 'yellow' ? 1 : 0);

  if (anyFinished && opts.isRace) {
    rc.globalFlag = 'checkered';
  } else if (rc.safetyCar.phase === 'sc' || rc.safetyCar.phase === 'sc-ending') {
    rc.globalFlag = 'sc';
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

// ==================== Standing-Start Launch / Jump-Start Helper ====================

export const LAUNCH_RPM_SWEET_SPOT: [number, number] = [0.66, 0.88];

export function evaluateStandingStartLaunch(params: {
  rpmNormalized: number;
  jumpStartTriggered: boolean;
}): {
  status: 'none' | 'perfect' | 'jump-start';
  launchBoostSeconds: number;
  postRacePenaltySeconds: number;
} {
  if (params.jumpStartTriggered) {
    return {
      status: 'jump-start',
      launchBoostSeconds: 0,
      postRacePenaltySeconds: 5,
    };
  }
  if (
    params.rpmNormalized >= LAUNCH_RPM_SWEET_SPOT[0] &&
    params.rpmNormalized <= LAUNCH_RPM_SWEET_SPOT[1]
  ) {
    return {
      status: 'perfect',
      launchBoostSeconds: 1.6,
      postRacePenaltySeconds: 0,
    };
  }
  return {
    status: 'none',
    launchBoostSeconds: 0,
    postRacePenaltySeconds: 0,
  };
}
