import aiPolicyWeightsV5Raw from './aiPolicyWeights_v5.json';
import aiPolicyWeightsV6Raw from './aiPolicyWeights_v6.json';
import aiPolicyWeightsV7Raw from './aiPolicyWeights_v7.json';
import aiPolicyWeightsV8Raw from './aiPolicyWeights_v8.json';
import { BoPMultipliers } from './cars';
import {
  CarSimState,
  computeAIControl,
  computeClassGripProfile,
  ControlInput,
} from './physics';
import { CompiledTrack, sampleTrackAtT } from './tracks';
import { AIDifficulty } from './types';

export interface PolicyObsNorm {
  mean: number[];
  std: number[];
  clip?: number;
}

export interface PolicyObsConfig {
  lookaheadMeters?: number[];
  curvatureMode?: 'clamp40' | 'window_tanh';
  curvatureScale?: number;
}

export interface PolicyWeights {
  version?: number;
  obsDim: number;
  hiddenDim?: number;
  actDim?: number;
  numHiddenLayers?: number;
  activation?: 'tanh' | 'silu';
  residual?: boolean;
  w0: number[][];
  b0: number[];
  w1: number[][];
  b1: number[];
  w2: number[][];
  b2: number[];
  w3?: number[][];
  b3?: number[];
  ln0Weight?: number[];
  ln0Bias?: number[];
  ln1Weight?: number[];
  ln1Bias?: number[];
  ln2Weight?: number[];
  ln2Bias?: number[];
  obsNorm?: PolicyObsNorm;
  obsConfig?: PolicyObsConfig;
  meta?: Record<string, unknown>;
}

export type AiPolicyVariantId =
  | 'v5'
  | 'v6'
  | 'v7'
  | 'v8';

export const AI_POLICY_VARIANT_IDS: readonly AiPolicyVariantId[] = [
  'v5',
  'v6',
  'v7',
  'v8',
] as const;

export type AiPolicyMixWeights = Record<AiPolicyVariantId, number>;

export interface AiPolicyVariantInfo {
  id: AiPolicyVariantId;
  label: string;
  shortLabel: string;
  description: string;
  weights: PolicyWeights | null;
  loaded: boolean;
  hiddenDim: number | null;
  obsDim: number | null;
  meta: Record<string, unknown> | null;
}

export const DEFAULT_POLICY_MIX: AiPolicyMixWeights = {
  v5: 0,
  v6: 0,
  v7: 0,
  v8: 100,
};

const POLICY_MIX_STORAGE_KEY = 'apex_ai_policy_mix_v2';

function isFiniteNumberVector(arr: unknown, expectedLength: number): arr is number[] {
  if (!Array.isArray(arr) || arr.length !== expectedLength) return false;
  for (let i = 0; i < expectedLength; i++) {
    if (typeof arr[i] !== 'number' || !Number.isFinite(arr[i])) return false;
  }
  return true;
}

function isFiniteNumberMatrix(arr: unknown, rows: number, cols: number): arr is number[][] {
  if (!Array.isArray(arr) || arr.length !== rows) return false;
  for (let i = 0; i < rows; i++) {
    if (!isFiniteNumberVector(arr[i], cols)) return false;
  }
  return true;
}

function validateOptionalLayerNorm(
  weight: unknown,
  bias: unknown,
  dim: number,
): boolean {
  if (weight === undefined && bias === undefined) return true;
  return isFiniteNumberVector(weight, dim) && isFiniteNumberVector(bias, dim);
}

export function validatePolicyWeights(raw: unknown): PolicyWeights | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<PolicyWeights>;
  if (
    !Array.isArray(candidate.w0) ||
    !Array.isArray(candidate.b0) ||
    !Array.isArray(candidate.w1) ||
    !Array.isArray(candidate.b1) ||
    !Array.isArray(candidate.w2) ||
    !Array.isArray(candidate.b2)
  ) {
    return null;
  }
  const numHidden = candidate.numHiddenLayers ?? (candidate.w3 && candidate.b3 ? 3 : 2);
  if (numHidden !== 2 && numHidden !== 3) return null;

  const hiddenDim = candidate.hiddenDim ?? candidate.w0.length;
  const obsDim = candidate.obsDim ?? candidate.w0[0]?.length ?? 43;
  const outW = numHidden === 3 ? candidate.w3 : candidate.w2;
  const outB = numHidden === 3 ? candidate.b3 : candidate.b2;
  const actDim = candidate.actDim ?? outW?.length ?? 3;

  if (
    obsDim !== 43 ||
    actDim !== 3 ||
    !Number.isInteger(hiddenDim) ||
    hiddenDim <= 0 ||
    !isFiniteNumberMatrix(candidate.w0, hiddenDim, obsDim) ||
    !isFiniteNumberVector(candidate.b0, hiddenDim) ||
    !isFiniteNumberMatrix(candidate.w1, hiddenDim, hiddenDim) ||
    !isFiniteNumberVector(candidate.b1, hiddenDim)
  ) {
    return null;
  }

  if (numHidden === 3) {
    if (
      !isFiniteNumberMatrix(candidate.w2, hiddenDim, hiddenDim) ||
      !isFiniteNumberVector(candidate.b2, hiddenDim) ||
      !isFiniteNumberMatrix(outW, actDim, hiddenDim) ||
      !isFiniteNumberVector(outB, actDim)
    ) {
      return null;
    }
  } else {
    if (
      !isFiniteNumberMatrix(candidate.w2, actDim, hiddenDim) ||
      !isFiniteNumberVector(candidate.b2, actDim)
    ) {
      return null;
    }
  }

  if (
    !validateOptionalLayerNorm(candidate.ln0Weight, candidate.ln0Bias, hiddenDim) ||
    !validateOptionalLayerNorm(candidate.ln1Weight, candidate.ln1Bias, hiddenDim) ||
    (numHidden === 3 &&
      !validateOptionalLayerNorm(candidate.ln2Weight, candidate.ln2Bias, hiddenDim))
  ) {
    return null;
  }

  if (candidate.obsNorm !== undefined) {
    const n = candidate.obsNorm;
    if (
      !n ||
      typeof n !== 'object' ||
      !isFiniteNumberVector(n.mean, obsDim) ||
      !isFiniteNumberVector(n.std, obsDim)
    ) {
      return null;
    }
    for (let i = 0; i < obsDim; i++) {
      if (n.std[i] <= 0) return null;
    }
  }

  if (candidate.obsConfig?.lookaheadMeters !== undefined) {
    if (!isFiniteNumberVector(candidate.obsConfig.lookaheadMeters, 8)) {
      return null;
    }
  }

  return {
    ...(candidate as PolicyWeights),
    obsDim,
    hiddenDim,
    actDim,
    numHiddenLayers: numHidden,
  };
}

export const AI_POLICY_WEIGHTS: PolicyWeights =
  validatePolicyWeights(aiPolicyWeightsV8Raw) ?? (aiPolicyWeightsV8Raw as PolicyWeights);

const VARIANT_META: Record<
  AiPolicyVariantId,
  { label: string; shortLabel: string; description: string }
> = {
  v5: {
    label: 'v5 Hotlap & Pace',
    shortLabel: 'v5 Hotlap',
    description: '128h LayerNorm+ObsNorm solo pace specialist, 310m window lookahead',
  },
  v6: {
    label: 'v6 Traffic Racecraft',
    shortLabel: 'v6 Traffic',
    description: '128h LayerNorm+ObsNorm wheel-to-wheel overtaking & TTC modulation',
  },
  v7: {
    label: 'v7 Wall Survival',
    shortLabel: 'v7 Surv.',
    description: '128h ResMLP technical/street specialist, adaptive hard-track focus',
  },
  v8: {
    label: 'v8 Flagship Adaptive',
    shortLabel: 'v8 Flag.',
    description: '3x128 ResMLP 3-phase adaptive curriculum all-track flagship driver',
  },
};

const POLICY_REGISTRY: Record<AiPolicyVariantId, AiPolicyVariantInfo> = (() => {
  const weightsById: Record<AiPolicyVariantId, PolicyWeights | null> = {
    v5: validatePolicyWeights(aiPolicyWeightsV5Raw),
    v6: validatePolicyWeights(aiPolicyWeightsV6Raw),
    v7: validatePolicyWeights(aiPolicyWeightsV7Raw),
    v8: validatePolicyWeights(aiPolicyWeightsV8Raw),
  };
  const out = {} as Record<AiPolicyVariantId, AiPolicyVariantInfo>;
  for (const id of AI_POLICY_VARIANT_IDS) {
    const w = weightsById[id];
    out[id] = {
      id,
      ...VARIANT_META[id],
      weights: w,
      loaded: Boolean(w),
      hiddenDim: w ? w.hiddenDim ?? w.w0.length : null,
      obsDim: w ? w.obsDim : null,
      meta: w?.meta ?? null,
    };
  }
  return out;
})();

function readStoredMix(): AiPolicyMixWeights {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_POLICY_MIX };
  } 
  try {
    const raw = window.localStorage.getItem(POLICY_MIX_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_POLICY_MIX };
    const parsed = JSON.parse(raw) as Partial<Record<AiPolicyVariantId, unknown>>;
    const next: AiPolicyMixWeights = { ...DEFAULT_POLICY_MIX };
    let anyFinite = false;
    for (const id of AI_POLICY_VARIANT_IDS) {
      const val = Number(parsed[id]);
      if (Number.isFinite(val) && val >= 0) {
        next[id] = Math.min(100, val);
        anyFinite = true;
      }
    }
    return anyFinite ? next : { ...DEFAULT_POLICY_MIX };
  } catch {
    return { ...DEFAULT_POLICY_MIX };
  }
}

let activePolicyMix: AiPolicyMixWeights = readStoredMix();
const mixListeners = new Set<(mix: AiPolicyMixWeights) => void>();

export function getAiPolicyVariants(): AiPolicyVariantInfo[] {
  return AI_POLICY_VARIANT_IDS.map((id) => POLICY_REGISTRY[id]);
}

export function getActiveAiPolicyMix(): AiPolicyMixWeights {
  return { ...activePolicyMix };
}

export function setActiveAiPolicyMix(next: Partial<AiPolicyMixWeights>): void {
  const updated: AiPolicyMixWeights = { ...activePolicyMix };
  for (const id of AI_POLICY_VARIANT_IDS) {
    if (next[id] !== undefined) {
      const n = Number(next[id]);
      updated[id] = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
    }
  }
  activePolicyMix = updated;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(POLICY_MIX_STORAGE_KEY, JSON.stringify(activePolicyMix));
    } catch {
      // Ignore storage quota errors
    }
  }
  for (const listener of mixListeners) {
    listener({ ...activePolicyMix });
  }
}

export function selectSingleAiPolicyVariant(id: AiPolicyVariantId): void {
  const mix: AiPolicyMixWeights = {
    v5: 0,
    v6: 0,
    v7: 0,
    v8: 0,
  };
  mix[id] = 100;
  setActiveAiPolicyMix(mix);
}

export function subscribeAiPolicyMix(listener: (mix: AiPolicyMixWeights) => void): () => void {
  mixListeners.add(listener);
  return () => {
    mixListeners.delete(listener);
  };
}

export function getNormalizedPolicyMix(
  mix: Partial<AiPolicyMixWeights> = activePolicyMix,
): Array<{ id: AiPolicyVariantId; fraction: number; weights: PolicyWeights }> {
  const candidates: Array<{ id: AiPolicyVariantId; rawWeight: number; weights: PolicyWeights }> = [];
  let total = 0;
  for (const id of AI_POLICY_VARIANT_IDS) {
    const info = POLICY_REGISTRY[id];
    const w = mix[id] ?? 0;
    if (info.loaded && info.weights && w > 0) {
      candidates.push({ id, rawWeight: w, weights: info.weights });
      total += w;
    }
  }
  if (total <= 0 || candidates.length === 0) {
    const fallback = POLICY_REGISTRY.v8.weights ?? POLICY_REGISTRY.v7.weights;
    const fallbackId: AiPolicyVariantId = POLICY_REGISTRY.v8.weights ? 'v8' : 'v7';
    return fallback ? [{ id: fallbackId, fraction: 1, weights: fallback }] : [];
  }
  return candidates.map((c) => ({
    id: c.id,
    fraction: c.rawWeight / total,
    weights: c.weights,
  }));
}

if (typeof window !== 'undefined' && typeof console !== 'undefined') {
  console.info('[AI Policy]', AI_POLICY_WEIGHTS.meta);
}

export const LOOKAHEAD_METERS = [12, 25, 42, 65, 95, 135, 185, 250];
export const TRAFFIC_SLOTS = 4;

/**
 * Maps game AI difficulty or pace multiplier smoothly to the neural skillTarget in [0.65 .. 1.05].
 * Lower difficulties genuinely brake earlier and carry less apex speed without artificial rubber-banding.
 */
export function mapDifficultyToSkillTarget(
  difficulty?: AIDifficulty | string,
  paceMultiplier?: number,
): number {
  if (difficulty === 'Rookie') return 0.72;
  if (difficulty === 'Amateur') return 0.81;
  if (difficulty === 'Pro') return 0.90;
  if (difficulty === 'Alien') return 1.00;

  if (paceMultiplier !== undefined) {
    // Map pace multiplier [0.80 .. 1.15] smoothly into [0.68 .. 1.05]
    return Math.max(0.65, Math.min(1.05, 0.72 + (paceMultiplier - 0.84) * 1.15));
  }
  return 0.90;
}

/**
 * Constructs the authentic 43-float observation vector matching scripts/rlSimServer.ts:
 * 0..9: [forwardVel/100, lateralVel/30, lateralOffset/halfW, headingErr/Math.PI, yawRate/3.0, prevSteer, normTopSpeed, normGrip, normDownforce, normBraking]
 * 10..25: 8 spline lookahead points [12, 25, 42, 65, 95, 135, 185, 250]m -> [clamp(curvature * 40, -1, 1), dHeading / Math.PI]
 * 26..41: 4 nearest cars within [-25m, +85m] sorted by abs(relLong) -> [relLong/80, relLat/halfW, relSpeed/50, sameClass], padded with [1.0, 0.0, 0.0, 0.0]
 * 42: skillTarget in [0.65 .. 1.05]
 */
export function buildObservationVector(
  car: CarSimState,
  compiledTrack: CompiledTrack,
  allCars: CarSimState[],
  prevSteer: number,
  skillTarget: number,
  bop?: BoPMultipliers,
  obsConfig?: PolicyObsConfig,
): number[] {
  const currentSample = sampleTrackAtT(compiledTrack, car.trackT);
  const halfW = Math.max(1, (currentSample.width ?? compiledTrack.spec.trackWidth) * 0.5);
  const trackHeading = Math.atan2(currentSample.tx, currentSample.tz);

  let headingErr = car.heading - trackHeading;
  while (headingErr > Math.PI) headingErr -= Math.PI * 2;
  while (headingErr < -Math.PI) headingErr += Math.PI * 2;

  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  const forwardVel = car.vx * sinH + car.vz * cosH;
  const lateralVel = car.vx * cosH - car.vz * sinH;

  const activeBop =
    bop ??
    car.bopMultipliers ?? {
      topSpeedMult: 1.0,
      gripMult: 1.0,
      downforceMult: 1.0,
      brakingMult: 1.0,
    };
  const attrs = car.carSpec.attributes;
  const normTopSpeed =
    ((attrs.topSpeed * 3.6) * activeBop.topSpeedMult) / 360;
  const normGrip =
    ((attrs.corneringGrip / 100 * 2.2) * activeBop.gripMult) / 2.2;
  const { classDownforceBonus } = computeClassGripProfile(
    car.carSpec.classId,
    90,
    undefined,
    activeBop.downforceMult,
  );
  const classAeroPeak = Math.max(0, classDownforceBonus - 1.0);
  const normDownforce = Math.min(
    1.5,
    (classAeroPeak / 0.55) * (0.7 + 0.3 * (attrs.corneringGrip / 100)),
  );
  const normBraking =
    ((attrs.braking / 100 * 2.2) * activeBop.brakingMult) / 2.2;

  const obs: number[] = [
    forwardVel / 100,
    lateralVel / 30,
    car.lateralOffset / halfW,
    headingErr / Math.PI,
    (car.yawRate ?? 0) / 3.0,
    prevSteer,
    normTopSpeed,
    normGrip,
    normDownforce,
    normBraking,
  ];

  // 16 lookahead track curvature & heading delta features
  const lookaheadMeters =
    obsConfig?.lookaheadMeters && obsConfig.lookaheadMeters.length === 8
      ? obsConfig.lookaheadMeters
      : LOOKAHEAD_METERS;
  const useWindowTanh = obsConfig?.curvatureMode === 'window_tanh';
  const curvatureScale = obsConfig?.curvatureScale ?? 14.0;
  const trackLen = Math.max(100, compiledTrack.totalLength);

  let prevDist = 0;
  for (let idx = 0; idx < lookaheadMeters.length; idx++) {
    const dist = lookaheadMeters[idx];
    const ahead = sampleTrackAtT(compiledTrack, car.trackT + dist / trackLen);
    const aheadHeading = Math.atan2(ahead.tx, ahead.tz);
    let dHeading = aheadHeading - trackHeading;
    while (dHeading > Math.PI) dHeading -= Math.PI * 2;
    while (dHeading < -Math.PI) dHeading += Math.PI * 2;

    if (useWindowTanh) {
      // Window-peak signed curvature across (prevDist, dist] prevents hairpin aliasing across far probes
      const span = Math.max(4, dist - prevDist);
      const subSamples = span > 45 ? 5 : span > 20 ? 4 : 3;
      let peakCurv = ahead.curvature ?? 0;
      let peakAbs = Math.abs(peakCurv);
      for (let s = 1; s < subSamples; s++) {
        const probeDist = prevDist + (span * s) / subSamples;
        const probe = sampleTrackAtT(compiledTrack, car.trackT + probeDist / trackLen);
        const k = probe.curvature ?? 0;
        const ak = Math.abs(k);
        if (ak > peakAbs) {
          peakAbs = ak;
          peakCurv = k;
        }
      }
      obs.push(Math.tanh(peakCurv * curvatureScale));
    } else {
      const curv = ahead.curvature ?? 0;
      obs.push(Math.max(-1, Math.min(1, curv * 40)));
    }
    obs.push(dHeading / Math.PI);
    prevDist = dist;
  }

  // 16 traffic radar features
  const nearby: {
    absDist: number;
    relLong: number;
    relLat: number;
    relSpeed: number;
    sameClass: number;
  }[] = [];

  const activeClass = car.carSpec.classId;

  for (let i = 0; i < allCars.length; i++) {
    const other = allCars[i];
    if (other.id === car.id || other.pitStopRemaining > 0) continue;

    let dt = other.trackT - car.trackT;
    while (dt > 0.5) dt -= 1;
    while (dt < -0.5) dt += 1;
    const relLong = dt * compiledTrack.totalLength;
    if (relLong < -25 || relLong > 85) continue;

    const sameClass = other.carSpec.classId === activeClass ? 1.0 : 0.0;

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

  return obs;
}

const SCRATCH_BUFFERS = new Map<
  number,
  { xIn: Float32Array; h0: Float32Array; h1: Float32Array; h2: Float32Array }
>();

function getScratchBuffers(hiddenDim: number): {
  xIn: Float32Array;
  h0: Float32Array;
  h1: Float32Array;
  h2: Float32Array;
} {
  let entry = SCRATCH_BUFFERS.get(hiddenDim);
  if (!entry) {
    entry = {
      xIn: new Float32Array(43),
      h0: new Float32Array(hiddenDim),
      h1: new Float32Array(hiddenDim),
      h2: new Float32Array(hiddenDim),
    };
    SCRATCH_BUFFERS.set(hiddenDim, entry);
  }
  return entry;
}

function applyLayerNormInPlace(buf: Float32Array, dim: number, gamma: number[], beta: number[]): void {
  let mean = 0;
  for (let i = 0; i < dim; i++) mean += buf[i];
  mean /= dim;
  let variance = 0;
  for (let i = 0; i < dim; i++) {
    const d = buf[i] - mean;
    variance += d * d;
  }
  const invStd = 1.0 / Math.sqrt(variance / dim + 1e-5);
  for (let i = 0; i < dim; i++) {
    buf[i] = (buf[i] - mean) * invStd * gamma[i] + beta[i];
  }
}

function applyActivationInPlace(buf: Float32Array, dim: number, useSilu: boolean): void {
  if (useSilu) {
    for (let i = 0; i < dim; i++) {
      const v = buf[i];
      buf[i] = v / (1 + Math.exp(-v));
    }
  } else {
    for (let i = 0; i < dim; i++) {
      buf[i] = Math.tanh(buf[i]);
    }
  }
}

/**
 * Runs forward inference on a 43-input neural driver policy.
 * Seamlessly supports legacy v1/v2 [H, H] tanh MLPs as well as v3 extended models
 * (RunningMeanStd obsNorm, LayerNorm, SiLU/Tanh, residual skips, and 2- or 3-hidden-layer MLPs).
 */
export function evaluateNeuralPolicy(
  obs: number[],
  weights: PolicyWeights = AI_POLICY_WEIGHTS,
): { steer: number; throttle: number; brake: number } | null {
  const hiddenDim = weights?.hiddenDim ?? weights?.w0?.length ?? 64;
  const numHidden = weights?.numHiddenLayers ?? (weights?.w3 && weights?.b3 ? 3 : 2);
  const outW = numHidden === 3 ? weights?.w3 : weights?.w2;
  const outB = numHidden === 3 ? weights?.b3 : weights?.b2;

  if (
    !weights ||
    weights.obsDim !== 43 ||
    (numHidden !== 2 && numHidden !== 3) ||
    !Number.isInteger(hiddenDim) ||
    hiddenDim <= 0 ||
    !Array.isArray(weights.w0) ||
    !Array.isArray(weights.b0) ||
    !Array.isArray(weights.w1) ||
    !Array.isArray(weights.b1) ||
    !Array.isArray(weights.w2) ||
    !Array.isArray(weights.b2) ||
    !Array.isArray(outW) ||
    !Array.isArray(outB) ||
    weights.w0.length !== hiddenDim ||
    weights.b0.length !== hiddenDim ||
    weights.w1.length !== hiddenDim ||
    weights.b1.length !== hiddenDim ||
    (numHidden === 3 && (weights.w2.length !== hiddenDim || weights.b2.length !== hiddenDim)) ||
    outW.length !== 3 ||
    outB.length !== 3 ||
    obs.length !== 43
  ) {
    return null;
  }

  const { xIn, h0, h1, h2 } = getScratchBuffers(hiddenDim);
  const obsNorm = weights.obsNorm;
  if (obsNorm) {
    const clip = obsNorm.clip ?? 10.0;
    for (let j = 0; j < 43; j++) {
      const v = obs[j];
      if (!Number.isFinite(v)) return null;
      const norm = (v - obsNorm.mean[j]) / obsNorm.std[j];
      xIn[j] = Math.max(-clip, Math.min(clip, norm));
    }
  } else {
    for (let j = 0; j < 43; j++) {
      const v = obs[j];
      if (!Number.isFinite(v)) return null;
      xIn[j] = v;
    }
  }

  const useSilu = weights.activation === 'silu';
  const useResidual = Boolean(weights.residual);

  // Layer 0: 43 -> hiddenDim
  const w0 = weights.w0;
  const b0 = weights.b0;
  for (let i = 0; i < hiddenDim; i++) {
    let sum = b0[i];
    const row = w0[i];
    if (!Array.isArray(row) || row.length !== 43 || !Number.isFinite(sum)) return null;
    for (let j = 0; j < 43; j++) {
      sum += row[j] * xIn[j];
    }
    if (!Number.isFinite(sum)) return null;
    h0[i] = sum;
  }
  if (weights.ln0Weight && weights.ln0Bias) {
    applyLayerNormInPlace(h0, hiddenDim, weights.ln0Weight, weights.ln0Bias);
  }
  applyActivationInPlace(h0, hiddenDim, useSilu);

  // Layer 1: hiddenDim -> hiddenDim
  const w1 = weights.w1;
  const b1 = weights.b1;
  for (let i = 0; i < hiddenDim; i++) {
    let sum = b1[i];
    const row = w1[i];
    if (!Array.isArray(row) || row.length !== hiddenDim || !Number.isFinite(sum)) return null;
    for (let j = 0; j < hiddenDim; j++) {
      sum += row[j] * h0[j];
    }
    if (!Number.isFinite(sum)) return null;
    h1[i] = sum;
  }
  if (weights.ln1Weight && weights.ln1Bias) {
    applyLayerNormInPlace(h1, hiddenDim, weights.ln1Weight, weights.ln1Bias);
  }
  applyActivationInPlace(h1, hiddenDim, useSilu);
  if (useResidual) {
    for (let i = 0; i < hiddenDim; i++) h1[i] += h0[i];
  }

  let finalHidden = h1;

  // Optional Layer 2 (when numHidden === 3): hiddenDim -> hiddenDim
  if (numHidden === 3) {
    const w2 = weights.w2;
    const b2 = weights.b2;
    for (let i = 0; i < hiddenDim; i++) {
      let sum = b2[i];
      const row = w2[i];
      if (!Array.isArray(row) || row.length !== hiddenDim || !Number.isFinite(sum)) return null;
      for (let j = 0; j < hiddenDim; j++) {
        sum += row[j] * h1[j];
      }
      if (!Number.isFinite(sum)) return null;
      h2[i] = sum;
    }
    if (weights.ln2Weight && weights.ln2Bias) {
      applyLayerNormInPlace(h2, hiddenDim, weights.ln2Weight, weights.ln2Bias);
    }
    applyActivationInPlace(h2, hiddenDim, useSilu);
    if (useResidual) {
      for (let i = 0; i < hiddenDim; i++) h2[i] += h1[i];
    }
    finalHidden = h2;
  }

  // Output layer: hiddenDim -> 3 (linear clamped [-1, 1] for version >= 2; tanh fallback for version === 1)
  const useLinearOutput = (weights.version ?? 1) >= 2;
  let out0 = 0;
  let out1 = 0;
  let out2 = 0;
  for (let i = 0; i < 3; i++) {
    let sum = outB[i];
    const row = outW[i];
    if (!Array.isArray(row) || row.length !== hiddenDim || !Number.isFinite(sum)) return null;
    for (let j = 0; j < hiddenDim; j++) {
      sum += row[j] * finalHidden[j];
    }
    if (!Number.isFinite(sum)) return null;
    const raw = useLinearOutput ? sum : Math.tanh(sum);
    const clamped = Math.max(-1, Math.min(1, raw));
    if (i === 0) out0 = clamped;
    else if (i === 1) out1 = clamped;
    else out2 = clamped;
  }

  return {
    steer: out0,
    throttle: Math.max(0, Math.min(1, (out1 + 1) * 0.5)),
    brake: Math.max(0, Math.min(1, (out2 + 1) * 0.5)),
  };
}

/**
 * Evaluates all loaded policies in the active percentage mix and computes the weighted average action.
 */
export function evaluateBlendedNeuralPolicy(
  obs: number[],
  mix: Partial<AiPolicyMixWeights> = activePolicyMix,
): { steer: number; throttle: number; brake: number } | null {
  const entries = getNormalizedPolicyMix(mix);
  if (entries.length === 0) return null;
  if (entries.length === 1) {
    return evaluateNeuralPolicy(obs, entries[0].weights);
  }

  let steer = 0;
  let throttle = 0;
  let brake = 0;
  let weightSum = 0;

  for (let i = 0; i < entries.length; i++) {
    const { fraction, weights } = entries[i];
    const res = evaluateNeuralPolicy(obs, weights);
    if (!res) continue;
    steer += res.steer * fraction;
    throttle += res.throttle * fraction;
    brake += res.brake * fraction;
    weightSum += fraction;
  }

  if (weightSum <= 0) return null;
  return {
    steer: Math.max(-1, Math.min(1, steer / weightSum)),
    throttle: Math.max(0, Math.min(1, throttle / weightSum)),
    brake: Math.max(0, Math.min(1, brake / weightSum)),
  };
}

function getObsConfigKey(cfg?: PolicyObsConfig): string {
  if (!cfg) return 'legacy';
  const lm = cfg.lookaheadMeters ? cfg.lookaheadMeters.join(',') : 'default';
  return `${cfg.curvatureMode ?? 'clamp40'}|${cfg.curvatureScale ?? 14}|${lm}`;
}

/**
 * Computes AI control using the trained 43-input neural driver policy,
 * smoothly blending with the dynamic racing-line & apex solver and falling back cleanly to the heuristic
 * controller when boxing, in pit lane, or if weights fail validation.
 */
export function computeNeuralAIControl(
  car: CarSimState,
  compiledTrack: CompiledTrack,
  allCars: CarSimState[],
  dt: number,
  trackWetness: number,
  difficulty?: AIDifficulty,
): ControlInput {
  // Always evaluate heuristic control for race management, pit triggers, and safety bounds
  const heuristic = computeAIControl(car, compiledTrack, allCars, dt, trackWetness);

  // If boxing on track or finished, defer directly to heuristic controller
  if (car.pitStopRemaining > 0 || car.finished) {
    return heuristic;
  }

  const skillTarget = mapDifficultyToSkillTarget(difficulty, car.aiPaceMultiplier);
  const prevSteer = car.steerAngle;

  // Build per-obsConfig observations (cached so identical configs compute only once)
  const entries = getNormalizedPolicyMix(activePolicyMix);
  if (entries.length === 0) return heuristic;

  let policyOut: { steer: number; throttle: number; brake: number } | null = null;
  if (entries.length === 1) {
    const obs = buildObservationVector(
      car,
      compiledTrack,
      allCars,
      prevSteer,
      1.0,
      car.bopMultipliers,
      entries[0].weights.obsConfig,
    );
    policyOut = evaluateNeuralPolicy(obs, entries[0].weights);
  } else {
    const obsCache = new Map<string, number[]>();
    let steer = 0;
    let throttle = 0;
    let brake = 0;
    let weightSum = 0;
    for (let i = 0; i < entries.length; i++) {
      const { fraction, weights } = entries[i];
      const key = getObsConfigKey(weights.obsConfig);
      let obs = obsCache.get(key);
      if (!obs) {
        obs = buildObservationVector(
          car,
          compiledTrack,
          allCars,
          prevSteer,
          1.0,
          car.bopMultipliers,
          weights.obsConfig,
        );
        obsCache.set(key, obs);
      }
      const res = evaluateNeuralPolicy(obs, weights);
      if (!res) continue;
      steer += res.steer * fraction;
      throttle += res.throttle * fraction;
      brake += res.brake * fraction;
      weightSum += fraction;
    }
    if (weightSum > 0) {
      policyOut = {
        steer: Math.max(-1, Math.min(1, steer / weightSum)),
        throttle: Math.max(0, Math.min(1, throttle / weightSum)),
        brake: Math.max(0, Math.min(1, brake / weightSum)),
      };
    }
  }
  if (!policyOut) {
    return heuristic;
  }

  // Guardrail safety containment: only intervene when car genuinely leaves the track (> 1.05 halfW)
  const currentSample = sampleTrackAtT(compiledTrack, car.trackT);
  const halfW = (currentSample.width ?? compiledTrack.spec.trackWidth) * 0.5;
  const offTrackRatio = Math.abs(car.lateralOffset) / Math.max(1, halfW);

  let blendedSteer = policyOut.steer;
  let blendedThrottle = policyOut.throttle;
  let blendedBrake = policyOut.brake;

  if (offTrackRatio > 1.05) {
    // Smoothly blend toward heuristic recovery over 1.05..1.25
    const blendWeight = Math.min(1.0, (offTrackRatio - 1.05) / 0.20);
    blendedSteer = policyOut.steer * (1 - blendWeight) + heuristic.steer * blendWeight;
    blendedThrottle =
      policyOut.throttle * (1 - blendWeight) +
      Math.min(policyOut.throttle, heuristic.throttle) * blendWeight;
    blendedBrake =
      policyOut.brake * (1 - blendWeight) +
      Math.max(policyOut.brake, heuristic.brake) * blendWeight;
  }

  // Apply post-inference difficulty pacing cleanly (Alien untouched at 1.0)
  const isAlien = difficulty === 'Alien' || (difficulty === undefined && skillTarget >= 1.0);
  if (!isAlien) {
    const throttleScale = Math.max(0.75, Math.min(1.0, 0.70 + 0.30 * skillTarget));
    blendedThrottle *= throttleScale;
  }

  // Preserve DRS / special triggers and manual transmission signals from heuristic
  return {
    steer: Math.max(-1, Math.min(1, blendedSteer)),
    throttle: Math.max(0, Math.min(1, blendedThrottle)),
    brake: Math.max(0, Math.min(1, blendedBrake)),
    specialPressed: heuristic.specialPressed,
    specialJustPressed: heuristic.specialJustPressed,
    shiftUp: heuristic.shiftUp,
    shiftDown: heuristic.shiftDown,
  };
}
