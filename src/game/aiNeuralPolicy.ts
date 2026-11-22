import { BoPMultipliers } from './cars';
import {
  CarSimState,
  computeAIControl,
  computeClassGripProfile,
  ControlInput,
} from './physics';
import { CompiledTrack, sampleTrackAtT } from './tracks';
import { AIDifficulty, AiNeuralTelemetrySnapshot, CarClassId, RaceStartType } from './types';
import {
  buildAiNeuralTelemetrySnapshot,
  PERSONALITY_POLICY_PROFILES,
  resolvePersonalityBlendedMix,
  stepAiStuckRecovery,
  stepHumanLikeMistake,
} from './aiRacecraft';

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

export type PolicyPedalMode = 'independent' | 'signed';

export interface PolicyWeights {
  version?: number;
  obsDim: number;
  hiddenDim?: number;
  actDim?: number;
  numHiddenLayers?: number;
  activation?: 'tanh' | 'silu';
  residual?: boolean;
  pedalMode?: PolicyPedalMode;
  carClass?: CarClassId | string;
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

export type AiPolicyVariantId = 'v1' | 'v2';

export const AI_POLICY_VARIANT_IDS: readonly AiPolicyVariantId[] = ['v1', 'v2'] as const;

export const AI_POLICY_CLASS_IDS: readonly CarClassId[] = [
  CarClassId.HYPERCAR_GTP,
  CarClassId.LMP2,
  CarClassId.GT3,
  CarClassId.GT4,
  CarClassId.F1_2026,
  CarClassId.F1_2021,
  CarClassId.F1_2005,
  CarClassId.FORMULA_E,
  CarClassId.TRACK_COUPE,
  CarClassId.SUPERCAR,
] as const;

export interface AiClassPolicyInfo {
  classId: CarClassId;
  filename: string;
  weights: PolicyWeights | null;
  loaded: boolean;
  hiddenDim: number | null;
  obsDim: number | null;
  pedalMode: PolicyPedalMode;
  meta: Record<string, unknown> | null;
}

export function getClassPolicyFilename(classId: CarClassId | string): string {
  return `class_${String(classId).toLowerCase()}.bin`;
}

const ANB1_MAGIC = [0x41, 0x4e, 0x42, 0x31] as const; // 'ANB1'

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
  binaryAvailable?: boolean;
  meta: Record<string, unknown> | null;
}

export type StartPolicyMode = 'neural' | 'launch-assist' | 'off';

export interface StartPolicyStatus {
  loaded: boolean;
  source: 'neural' | 'launch-assist';
  mode: StartPolicyMode;
  hiddenDim: number | null;
  meta: Record<string, unknown> | null;
}

export const DEFAULT_POLICY_MIX: AiPolicyMixWeights = {
  v1: 100,
  v2: 0,
};

const POLICY_MIX_STORAGE_KEY = 'apex_ai_policy_mix_v5_unified';
const START_POLICY_MODE_STORAGE_KEY = 'apex_ai_start_policy_mode_v1';
const PERSONALITY_BLEND_STORAGE_KEY = 'apex_ai_personality_blend_v1';
const PER_CLASS_POLICY_STORAGE_KEY = 'apex_ai_per_class_policy_v1';

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
    (obsDim !== 43 && obsDim !== 59) ||
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

const VARIANT_META: Record<
  AiPolicyVariantId,
  { label: string; shortLabel: string; description: string }
> = {
  v1: {
    label: 'v1 General Fallback',
    shortLabel: 'v1 Gen',
    description:
      '59-input multi-class ANB1 binary fallback policy used when a dedicated per-class model is not loaded',
  },
  v2: {
    label: 'v2 Racecraft Fallback',
    shortLabel: 'v2 Craft',
    description:
      '59-input racecraft ANB1 binary fallback policy for multi-class traffic & Turn-1 discipline',
  },
};

const POLICY_BINARY_BASE_URL = './models/policies/';

function readBinaryPolicySyncNode(filename: string): PolicyWeights | null {
  if (typeof window !== 'undefined') return null;
  try {
    const proc = (globalThis as unknown as {
      process?: {
        cwd?: () => string;
        getBuiltinModule?: (id: string) => unknown;
      };
    }).process;
    if (!proc?.getBuiltinModule || !proc?.cwd) return null;
    const fsMod = proc.getBuiltinModule('node:fs') as {
      existsSync: (p: string) => boolean;
      readFileSync: (p: string) => Uint8Array;
    } | undefined;
    const pathMod = proc.getBuiltinModule('node:path') as {
      resolve: (...parts: string[]) => string;
    } | undefined;
    if (!fsMod || !pathMod) return null;
    const fullPath = pathMod.resolve(proc.cwd(), 'public', 'models', 'policies', filename);
    if (!fsMod.existsSync(fullPath)) return null;
    const raw = fsMod.readFileSync(fullPath);
    return decodePolicyWeightsBinary(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
  } catch {
    return null;
  }
}

const registryListeners = new Set<() => void>();
function notifyPolicyRegistryListeners(): void {
  for (const listener of registryListeners) {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  }
}

export function subscribePolicyRegistry(listener: () => void): () => void {
  registryListeners.add(listener);
  return () => {
    registryListeners.delete(listener);
  };
}

const POLICY_REGISTRY: Record<AiPolicyVariantId, AiPolicyVariantInfo> = (() => {
  const weightsById: Record<AiPolicyVariantId, PolicyWeights | null> = {
    v1: readBinaryPolicySyncNode('aiPolicyWeights_v1.bin'),
    v2: readBinaryPolicySyncNode('aiPolicyWeights_v2.bin'),
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
      binaryAvailable: Boolean(w),
      meta: w?.meta ?? null,
    };
  }
  return out;
})();

const CLASS_POLICY_REGISTRY: Record<CarClassId, AiClassPolicyInfo> = (() => {
  const out = {} as Record<CarClassId, AiClassPolicyInfo>;
  for (const classId of AI_POLICY_CLASS_IDS) {
    const filename = getClassPolicyFilename(classId);
    const w = readBinaryPolicySyncNode(filename);
    out[classId] = {
      classId,
      filename,
      weights: w,
      loaded: Boolean(w),
      hiddenDim: w ? w.hiddenDim ?? w.w0.length : null,
      obsDim: w ? w.obsDim : null,
      pedalMode: w?.pedalMode ?? ((w?.version ?? 1) >= 4 ? 'signed' : 'independent'),
      meta: w?.meta ?? null,
    };
  }
  return out;
})();

export let AI_POLICY_WEIGHTS: PolicyWeights =
  POLICY_REGISTRY.v1.weights ??
  ({
    version: 4,
    obsDim: 59,
    hiddenDim: 1,
    actDim: 3,
    numHiddenLayers: 2,
    pedalMode: 'signed',
    w0: [new Array(59).fill(0)],
    b0: [0],
    w1: [[0]],
    b1: [0],
    w2: [[0], [0], [0]],
    b2: [0, 0.9, 0],
  } as PolicyWeights);

let activeStartPolicyWeights: PolicyWeights | null = readBinaryPolicySyncNode(
  'aiPolicyWeights_starts.bin',
);

export function getClassPolicyVariants(): AiClassPolicyInfo[] {
  return AI_POLICY_CLASS_IDS.map((classId) => CLASS_POLICY_REGISTRY[classId]);
}

export function getClassPolicyWeights(classId: CarClassId): PolicyWeights | null {
  return CLASS_POLICY_REGISTRY[classId]?.weights ?? null;
}

export function setClassPolicyWeights(
  classId: CarClassId,
  weights: PolicyWeights | null,
): boolean {
  const filename = getClassPolicyFilename(classId);
  if (weights === null) {
    CLASS_POLICY_REGISTRY[classId] = {
      classId,
      filename,
      weights: null,
      loaded: false,
      hiddenDim: null,
      obsDim: null,
      pedalMode: 'signed',
      meta: null,
    };
    notifyPolicyRegistryListeners();
    return true;
  }
  const valid = validatePolicyWeights(weights);
  if (!valid) return false;
  CLASS_POLICY_REGISTRY[classId] = {
    classId,
    filename,
    weights: valid,
    loaded: true,
    hiddenDim: valid.hiddenDim ?? valid.w0.length,
    obsDim: valid.obsDim,
    pedalMode: valid.pedalMode ?? ((valid.version ?? 1) >= 4 ? 'signed' : 'independent'),
    meta: valid.meta ?? null,
  };
  notifyPolicyRegistryListeners();
  return true;
}

/**
 * Loads a per-class compact ANB1 binary model (.bin) from a URL into CLASS_POLICY_REGISTRY.
 */
export async function loadClassPolicyFromBinaryUrl(
  classId: CarClassId,
  url: string,
): Promise<boolean> {
  if (typeof fetch !== 'function') return false;
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return false;
    const buf = await res.arrayBuffer();
    const decoded = decodePolicyWeightsBinary(buf);
    if (!decoded) return false;
    return setClassPolicyWeights(classId, decoded);
  } catch {
    return false;
  }
}

/**
 * Loads compact ANB1 binary weights (.bin) from a URL into the live policy registry
 * (e.g. './models/policies/aiPolicyWeights_v1.bin' or '..._v2.bin').
 */
export async function loadPolicyWeightsFromBinaryUrl(
  target: AiPolicyVariantId | 'starts',
  url: string,
): Promise<boolean> {
  if (typeof fetch !== 'function') return false;
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return false;
    const buf = await res.arrayBuffer();
    const decoded = decodePolicyWeightsBinary(buf);
    if (!decoded) return false;
    if (target === 'starts') {
      activeStartPolicyWeights = decoded;
      notifyPolicyRegistryListeners();
      return true;
    }
    POLICY_REGISTRY[target] = {
      ...POLICY_REGISTRY[target],
      weights: decoded,
      loaded: true,
      hiddenDim: decoded.hiddenDim ?? decoded.w0.length,
      obsDim: decoded.obsDim,
      binaryAvailable: true,
      meta: decoded.meta ?? null,
    };
    if (target === 'v1') {
      AI_POLICY_WEIGHTS = decoded;
    }
    notifyPolicyRegistryListeners();
    return true;
  } catch {
    return false;
  }
}

let binaryPreloadPromise: Promise<void> | null = null;

/**
 * Discovers and loads all shipped ANB1 binary policy models (general fallbacks, starts, and per-class specialists)
 * from public/models/policies/manifest.json in the browser. Zero JSON weight files are bundled.
 */
export function preloadAllBinaryPolicies(baseUrl: string = POLICY_BINARY_BASE_URL): Promise<void> {
  if (typeof window === 'undefined' || typeof fetch !== 'function') {
    return Promise.resolve();
  }
  if (binaryPreloadPromise) return binaryPreloadPromise;

  binaryPreloadPromise = (async () => {
    const prefix = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    let manifestFiles: string[] = [];
    let manifestClasses: Record<string, string> = {};
    try {
      const mRes = await fetch(`${prefix}manifest.json`, { cache: 'no-cache' });
      if (mRes.ok) {
        const mData = (await mRes.json()) as {
          files?: string[];
          classes?: Record<string, string>;
        };
        if (Array.isArray(mData.files)) manifestFiles = mData.files;
        if (mData.classes && typeof mData.classes === 'object') manifestClasses = mData.classes;
      }
    } catch {
      // Fallback to probing standard fallback filenames when manifest is absent
    }

    const tasks: Promise<unknown>[] = [];
    const hasManifest = manifestFiles.length > 0;
    if (!hasManifest || manifestFiles.includes('aiPolicyWeights_v1.bin')) {
      tasks.push(loadPolicyWeightsFromBinaryUrl('v1', `${prefix}aiPolicyWeights_v1.bin`));
    }
    if (!hasManifest || manifestFiles.includes('aiPolicyWeights_v2.bin')) {
      tasks.push(loadPolicyWeightsFromBinaryUrl('v2', `${prefix}aiPolicyWeights_v2.bin`));
    }
    if (!hasManifest || manifestFiles.includes('aiPolicyWeights_starts.bin')) {
      tasks.push(loadPolicyWeightsFromBinaryUrl('starts', `${prefix}aiPolicyWeights_starts.bin`));
    }

    for (const classId of AI_POLICY_CLASS_IDS) {
      const file = manifestClasses[classId];
      if (file) {
        tasks.push(loadClassPolicyFromBinaryUrl(classId, `${prefix}${file}`));
      }
    }

    await Promise.allSettled(tasks);
    notifyPolicyRegistryListeners();
  })();

  return binaryPreloadPromise;
}

if (typeof window !== 'undefined' && typeof fetch === 'function') {
  void preloadAllBinaryPolicies();
}

function readStoredPerClassPoliciesEnabled(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return true;
  try {
    const raw = window.localStorage.getItem(PER_CLASS_POLICY_STORAGE_KEY);
    if (raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

let perClassPoliciesEnabled = readStoredPerClassPoliciesEnabled();
const perClassListeners = new Set<(enabled: boolean) => void>();

export function getPerClassPoliciesEnabled(): boolean {
  return perClassPoliciesEnabled;
}

export function setPerClassPoliciesEnabled(enabled: boolean): void {
  perClassPoliciesEnabled = Boolean(enabled);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(PER_CLASS_POLICY_STORAGE_KEY, String(perClassPoliciesEnabled));
    } catch {
      // ignore
    }
  }
  for (const listener of perClassListeners) {
    listener(perClassPoliciesEnabled);
  }
}

export function subscribePerClassPolicies(listener: (enabled: boolean) => void): () => void {
  perClassListeners.add(listener);
  return () => {
    perClassListeners.delete(listener);
  };
}

function readStoredStartPolicyMode(): StartPolicyMode {
  if (typeof window === 'undefined' || !window.localStorage) {
    return activeStartPolicyWeights ? 'neural' : 'launch-assist';
  }
  try {
    const raw = window.localStorage.getItem(START_POLICY_MODE_STORAGE_KEY);
    if (raw === 'neural' || raw === 'launch-assist' || raw === 'off') {
      return raw === 'neural' && !activeStartPolicyWeights ? 'launch-assist' : raw;
    }
  } catch {
    // ignore
  }
  return activeStartPolicyWeights ? 'neural' : 'launch-assist';
}

let activeStartPolicyMode: StartPolicyMode = readStoredStartPolicyMode();
const startModeListeners = new Set<(mode: StartPolicyMode) => void>();

export function getStartPolicyMode(): StartPolicyMode {
  return activeStartPolicyMode;
}

export function setStartPolicyMode(mode: StartPolicyMode): void {
  const resolved: StartPolicyMode =
    mode === 'neural' && !activeStartPolicyWeights ? 'launch-assist' : mode;
  activeStartPolicyMode = resolved;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(START_POLICY_MODE_STORAGE_KEY, resolved);
    } catch {
      // ignore
    }
  }
  for (const listener of startModeListeners) {
    listener(resolved);
  }
}

export function subscribeStartPolicyMode(listener: (mode: StartPolicyMode) => void): () => void {
  startModeListeners.add(listener);
  return () => {
    startModeListeners.delete(listener);
  };
}

export function getStartPolicyWeights(): PolicyWeights | null {
  return activeStartPolicyWeights;
}

export function setStartPolicyWeights(weights: PolicyWeights | null): boolean {
  if (weights === null) {
    activeStartPolicyWeights = null;
    return true;
  }
  const valid = validatePolicyWeights(weights);
  if (!valid) return false;
  activeStartPolicyWeights = valid;
  return true;
}

export function getStartPolicyStatus(): StartPolicyStatus {
  const w = activeStartPolicyWeights;
  return {
    loaded: Boolean(w),
    source: activeStartPolicyMode === 'neural' && w ? 'neural' : 'launch-assist',
    mode: activeStartPolicyMode,
    hiddenDim: w ? (w.hiddenDim ?? w.w0.length) : null,
    meta: w?.meta ?? null,
  };
}

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
    v1: 0,
    v2: 0,
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

function readStoredPersonalityBlend(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return true;
  try {
    const raw = window.localStorage.getItem(PERSONALITY_BLEND_STORAGE_KEY);
    if (raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

let personalityPolicyBlendingEnabled = readStoredPersonalityBlend();
const personalityBlendListeners = new Set<(enabled: boolean) => void>();

export function getPersonalityPolicyBlendingEnabled(): boolean {
  return personalityPolicyBlendingEnabled;
}

export function setPersonalityPolicyBlendingEnabled(enabled: boolean): void {
  personalityPolicyBlendingEnabled = enabled;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(PERSONALITY_BLEND_STORAGE_KEY, String(enabled));
    } catch {
      // ignore
    }
  }
  for (const fn of personalityBlendListeners) fn(enabled);
}

export function subscribePersonalityPolicyBlending(
  listener: (enabled: boolean) => void,
): () => void {
  personalityBlendListeners.add(listener);
  return () => {
    personalityBlendListeners.delete(listener);
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
    const fallback = POLICY_REGISTRY.v2.weights ?? POLICY_REGISTRY.v1.weights;
    const fallbackId: AiPolicyVariantId = POLICY_REGISTRY.v2.weights ? 'v2' : 'v1';
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

/**
 * Extended 59-input observation vector for `v9_2` that appends 16 advanced-physics & racecraft
 * signals (4-corner tires, brakes, dirty air, crests, surfaces, localized damage, wetness/rubber, flags)
 * directly after the canonical 43-input vector.
 */
export function buildPhysicsAwareObservationVector(
  car: CarSimState,
  compiledTrack: CompiledTrack,
  allCars: CarSimState[],
  prevSteer: number,
  skillTarget: number = 1.0,
  bopOverride?: BoPMultipliers,
  obsConfig?: PolicyObsConfig,
): number[] {
  const obs = buildObservationVector(
    car,
    compiledTrack,
    allCars,
    prevSteer,
    skillTarget,
    bopOverride,
    obsConfig,
  );
  const t = car.tires;
  const flWear = t ? t.fl.wear / 100 : car.tireWear / 100;
  const frWear = t ? t.fr.wear / 100 : car.tireWear / 100;
  const rlWear = t ? t.rl.wear / 100 : car.tireWear / 100;
  const rrWear = t ? t.rr.wear / 100 : car.tireWear / 100;
  const frontTempNorm = t ? Math.max(-1, Math.min(1, ((t.fl.temp + t.fr.temp) * 0.5 - 90) / 40)) : 0;
  const rearTempNorm = t ? Math.max(-1, Math.min(1, ((t.rl.temp + t.rr.temp) * 0.5 - 90) / 40)) : 0;
  const brakeTempNorm = Math.max(0, Math.min(1, ((car.brakeTempFront ?? 240) - 100) / 800));
  const brakeLockup = Math.max(0, Math.min(1, car.brakeLockupIntensity ?? 0));
  const dirtyAir = Math.max(0, Math.min(1, car.dirtyAirStrength ?? 0));
  const crestDelta = Math.max(-1, Math.min(1, ((car.crestLoadFactor ?? 1.0) - 1.0) * 2.2));
  const surfaceEnc =
    car.surfaceType === 'asphalt' ? 0.0
      : car.surfaceType === 'kerb' ? 0.2
      : car.surfaceType === 'sausage-kerb' ? 0.45
      : car.surfaceType === 'concrete-runoff' ? 0.5
      : car.surfaceType === 'astroturf' ? 0.7
      : car.surfaceType === 'grass' ? 0.85
      : car.surfaceType === 'gravel' ? 1.0
      : 0.0;
  const dmg = car.damage;
  const frontDmg = dmg ? dmg.frontWing / 100 : car.aeroDamage / 100;
  const rearDmg = dmg ? dmg.rearWing / 100 : car.aeroDamage / 100;
  const mechDmg = dmg ? Math.max(dmg.engine, dmg.suspension) / 100 : 0;
  const localWet = Math.max(0, Math.min(1, car.localWetness ?? 0));
  const raceControlFlag = car.blueFlagActive ? 1.0 : car.drsEligible ? -0.5 : 0.0;

  obs.push(
    flWear,
    frWear,
    rlWear,
    rrWear,
    frontTempNorm,
    rearTempNorm,
    brakeTempNorm,
    brakeLockup,
    dirtyAir,
    crestDelta,
    surfaceEnc,
    frontDmg,
    rearDmg,
    mechDmg,
    localWet,
    raceControlFlag,
  );
  return obs;
}

const SCRATCH_BUFFERS = new Map<
  string,
  { xIn: Float32Array; h0: Float32Array; h1: Float32Array; h2: Float32Array }
>();

function getScratchBuffers(hiddenDim: number, obsDim: number = 43): {
  xIn: Float32Array;
  h0: Float32Array;
  h1: Float32Array;
  h2: Float32Array;
} {
  const key = `${obsDim}x${hiddenDim}`;
  let entry = SCRATCH_BUFFERS.get(key);
  if (!entry) {
    entry = {
      xIn: new Float32Array(obsDim),
      h0: new Float32Array(hiddenDim),
      h1: new Float32Array(hiddenDim),
      h2: new Float32Array(hiddenDim),
    };
    SCRATCH_BUFFERS.set(key, entry);
  }
  return entry;
}

interface PackedPolicyWeights {
  version: number;
  obsDim: number;
  hiddenDim: number;
  actDim: number;
  numHidden: 2 | 3;
  useSilu: boolean;
  useResidual: boolean;
  useLinearOutput: boolean;
  useSignedPedal: boolean;
  obsMean: Float32Array | null;
  obsInvStd: Float32Array | null;
  obsClip: number;
  w0: Float32Array;
  b0: Float32Array;
  ln0Weight: Float32Array | null;
  ln0Bias: Float32Array | null;
  w1: Float32Array;
  b1: Float32Array;
  ln1Weight: Float32Array | null;
  ln1Bias: Float32Array | null;
  w2: Float32Array;
  b2: Float32Array;
  ln2Weight: Float32Array | null;
  ln2Bias: Float32Array | null;
  outW: Float32Array;
  outB: Float32Array;
}

const PACKED_POLICY_CACHE = new WeakMap<PolicyWeights, PackedPolicyWeights | null>();

function flattenMatrixToF32(mat: number[][], rows: number, cols: number): Float32Array {
  const out = new Float32Array(rows * cols);
  for (let i = 0; i < rows; i++) {
    const row = mat[i];
    const base = i * cols;
    for (let j = 0; j < cols; j++) {
      out[base + j] = row[j];
    }
  }
  return out;
}

function packPolicyWeights(weights: PolicyWeights): PackedPolicyWeights | null {
  if (PACKED_POLICY_CACHE.has(weights)) {
    return PACKED_POLICY_CACHE.get(weights) ?? null;
  }
  const valid = validatePolicyWeights(weights);
  if (!valid) {
    PACKED_POLICY_CACHE.set(weights, null);
    return null;
  }

  const obsDim = valid.obsDim;
  const hiddenDim = valid.hiddenDim ?? valid.w0.length;
  const actDim = valid.actDim ?? 3;
  const numHidden: 2 | 3 = (valid.numHiddenLayers ?? (valid.w3 && valid.b3 ? 3 : 2)) === 3 ? 3 : 2;
  const outWRaw = numHidden === 3 ? valid.w3! : valid.w2;
  const outBRaw = numHidden === 3 ? valid.b3! : valid.b2;

  let obsMean: Float32Array | null = null;
  let obsInvStd: Float32Array | null = null;
  let obsClip = 10.0;
  if (valid.obsNorm) {
    obsMean = new Float32Array(obsDim);
    obsInvStd = new Float32Array(obsDim);
    for (let j = 0; j < obsDim; j++) {
      obsMean[j] = valid.obsNorm.mean[j];
      obsInvStd[j] = 1.0 / valid.obsNorm.std[j];
    }
    obsClip = valid.obsNorm.clip ?? 10.0;
  }

  const packed: PackedPolicyWeights = {
    version: valid.version ?? 1,
    obsDim,
    hiddenDim,
    actDim,
    numHidden,
    useSilu: valid.activation === 'silu',
    useResidual: Boolean(valid.residual),
    useLinearOutput: (valid.version ?? 1) >= 2,
    useSignedPedal: valid.pedalMode === 'signed' || (valid.version ?? 1) >= 4,
    obsMean,
    obsInvStd,
    obsClip,
    w0: flattenMatrixToF32(valid.w0, hiddenDim, obsDim),
    b0: Float32Array.from(valid.b0),
    ln0Weight: valid.ln0Weight ? Float32Array.from(valid.ln0Weight) : null,
    ln0Bias: valid.ln0Bias ? Float32Array.from(valid.ln0Bias) : null,
    w1: flattenMatrixToF32(valid.w1, hiddenDim, hiddenDim),
    b1: Float32Array.from(valid.b1),
    ln1Weight: valid.ln1Weight ? Float32Array.from(valid.ln1Weight) : null,
    ln1Bias: valid.ln1Bias ? Float32Array.from(valid.ln1Bias) : null,
    w2: numHidden === 3 ? flattenMatrixToF32(valid.w2, hiddenDim, hiddenDim) : new Float32Array(0),
    b2: numHidden === 3 ? Float32Array.from(valid.b2) : new Float32Array(0),
    ln2Weight: numHidden === 3 && valid.ln2Weight ? Float32Array.from(valid.ln2Weight) : null,
    ln2Bias: numHidden === 3 && valid.ln2Bias ? Float32Array.from(valid.ln2Bias) : null,
    outW: flattenMatrixToF32(outWRaw, actDim, hiddenDim),
    outB: Float32Array.from(outBRaw),
  };

  PACKED_POLICY_CACHE.set(weights, packed);
  return packed;
}

/**
 * Encodes PolicyWeights into the compact ANB1 binary format (~4-5x smaller than JSON):
 * [4B magic 'ANB1'][4B uint32 headerLen][UTF-8 JSON header][0-3B zero pad to 4B][little-endian Float32 tensors]
 */
export function encodePolicyWeightsBinary(weights: PolicyWeights): Uint8Array {
  const valid = validatePolicyWeights(weights);
  if (!valid) {
    throw new Error('Cannot encode invalid PolicyWeights to ANB1 binary');
  }
  const hiddenDim = valid.hiddenDim ?? valid.w0.length;
  const numHidden: 2 | 3 = (valid.numHiddenLayers ?? (valid.w3 && valid.b3 ? 3 : 2)) === 3 ? 3 : 2;
  const hasLn = Boolean(valid.ln0Weight && valid.ln0Bias);
  const hasObsNorm = Boolean(valid.obsNorm);
  const pedalMode: PolicyPedalMode =
    valid.pedalMode ?? ((valid.version ?? 1) >= 4 ? 'signed' : 'independent');

  const headerObj = {
    version: valid.version ?? (pedalMode === 'signed' ? 4 : 3),
    obsDim: valid.obsDim,
    hiddenDim,
    actDim: valid.actDim ?? 3,
    numHiddenLayers: numHidden,
    activation: valid.activation ?? 'tanh',
    residual: Boolean(valid.residual),
    pedalMode,
    carClass: valid.carClass,
    hasLn,
    hasObsNorm,
    obsNormClip: valid.obsNorm?.clip ?? 10.0,
    obsConfig: valid.obsConfig,
    meta: valid.meta,
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(headerObj));
  const paddedHeaderLen = (headerBytes.length + 3) & ~3;

  const chunks: Float32Array[] = [];
  if (hasObsNorm && valid.obsNorm) {
    chunks.push(Float32Array.from(valid.obsNorm.mean), Float32Array.from(valid.obsNorm.std));
  }
  chunks.push(flattenMatrixToF32(valid.w0, hiddenDim, valid.obsDim), Float32Array.from(valid.b0));
  if (hasLn) {
    chunks.push(Float32Array.from(valid.ln0Weight!), Float32Array.from(valid.ln0Bias!));
  }
  chunks.push(flattenMatrixToF32(valid.w1, hiddenDim, hiddenDim), Float32Array.from(valid.b1));
  if (hasLn) {
    chunks.push(Float32Array.from(valid.ln1Weight!), Float32Array.from(valid.ln1Bias!));
  }
  if (numHidden === 3) {
    chunks.push(flattenMatrixToF32(valid.w2, hiddenDim, hiddenDim), Float32Array.from(valid.b2));
    if (hasLn) {
      chunks.push(Float32Array.from(valid.ln2Weight!), Float32Array.from(valid.ln2Bias!));
    }
    chunks.push(flattenMatrixToF32(valid.w3!, 3, hiddenDim), Float32Array.from(valid.b3!));
  } else {
    chunks.push(flattenMatrixToF32(valid.w2, 3, hiddenDim), Float32Array.from(valid.b2));
  }

  let totalFloats = 0;
  for (const c of chunks) totalFloats += c.length;
  const totalBytes = 8 + paddedHeaderLen + totalFloats * 4;
  const out = new Uint8Array(totalBytes);
  const view = new DataView(out.buffer);
  out[0] = ANB1_MAGIC[0];
  out[1] = ANB1_MAGIC[1];
  out[2] = ANB1_MAGIC[2];
  out[3] = ANB1_MAGIC[3];
  view.setUint32(4, headerBytes.length, true);
  out.set(headerBytes, 8);

  let floatOffset = (8 + paddedHeaderLen) / 4;
  const f32View = new Float32Array(out.buffer);
  for (const c of chunks) {
    f32View.set(c, floatOffset);
    floatOffset += c.length;
  }
  return out;
}

/**
 * Decodes an ANB1 binary weight buffer into validated PolicyWeights.
 */
export function decodePolicyWeightsBinary(input: ArrayBuffer | Uint8Array): PolicyWeights | null {
  try {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.byteLength < 12) return null;
    if (
      bytes[0] !== ANB1_MAGIC[0] ||
      bytes[1] !== ANB1_MAGIC[1] ||
      bytes[2] !== ANB1_MAGIC[2] ||
      bytes[3] !== ANB1_MAGIC[3]
    ) {
      return null;
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const headerLen = view.getUint32(4, true);
    const paddedHeaderLen = (headerLen + 3) & ~3;
    const tensorStart = 8 + paddedHeaderLen;
    if (tensorStart > bytes.byteLength) return null;

    const headerStr = new TextDecoder().decode(bytes.subarray(8, 8 + headerLen));
    const hdr = JSON.parse(headerStr) as {
      version?: number;
      obsDim: number;
      hiddenDim: number;
      actDim: number;
      numHiddenLayers: 2 | 3;
      activation?: 'tanh' | 'silu';
      residual?: boolean;
      pedalMode?: PolicyPedalMode;
      carClass?: CarClassId | string;
      hasLn?: boolean;
      hasObsNorm?: boolean;
      obsNormClip?: number;
      obsConfig?: PolicyObsConfig;
      meta?: Record<string, unknown>;
    };

    const obsDim = hdr.obsDim;
    const hiddenDim = hdr.hiddenDim;
    const actDim = hdr.actDim;
    const numHidden = hdr.numHiddenLayers;
    const tensorBytes = bytes.byteLength - tensorStart;
    if (tensorBytes < 0 || tensorBytes % 4 !== 0) return null;

    const alignedCopy = new Uint8Array(tensorBytes);
    alignedCopy.set(bytes.subarray(tensorStart, tensorStart + tensorBytes));
    const floats = new Float32Array(alignedCopy.buffer);
    let cursor = 0;

    const readVec = (n: number): number[] => {
      const res = new Array<number>(n);
      for (let i = 0; i < n; i++) res[i] = floats[cursor + i];
      cursor += n;
      return res;
    };
    const readMat = (rows: number, cols: number): number[][] => {
      const mat = new Array<number[]>(rows);
      for (let r = 0; r < rows; r++) {
        mat[r] = readVec(cols);
      }
      return mat;
    };

    const raw: Partial<PolicyWeights> = {
      version: hdr.version ?? 3,
      obsDim,
      hiddenDim,
      actDim,
      numHiddenLayers: numHidden,
      activation: hdr.activation ?? 'tanh',
      residual: Boolean(hdr.residual),
      pedalMode: hdr.pedalMode ?? ((hdr.version ?? 3) >= 4 ? 'signed' : 'independent'),
      carClass: hdr.carClass,
      obsConfig: hdr.obsConfig,
      meta: hdr.meta,
    };

    if (hdr.hasObsNorm) {
      raw.obsNorm = {
        mean: readVec(obsDim),
        std: readVec(obsDim),
        clip: hdr.obsNormClip ?? 10.0,
      };
    }

    raw.w0 = readMat(hiddenDim, obsDim);
    raw.b0 = readVec(hiddenDim);
    if (hdr.hasLn) {
      raw.ln0Weight = readVec(hiddenDim);
      raw.ln0Bias = readVec(hiddenDim);
    }

    raw.w1 = readMat(hiddenDim, hiddenDim);
    raw.b1 = readVec(hiddenDim);
    if (hdr.hasLn) {
      raw.ln1Weight = readVec(hiddenDim);
      raw.ln1Bias = readVec(hiddenDim);
    }

    if (numHidden === 3) {
      raw.w2 = readMat(hiddenDim, hiddenDim);
      raw.b2 = readVec(hiddenDim);
      if (hdr.hasLn) {
        raw.ln2Weight = readVec(hiddenDim);
        raw.ln2Bias = readVec(hiddenDim);
      }
      raw.w3 = readMat(actDim, hiddenDim);
      raw.b3 = readVec(actDim);
    } else {
      raw.w2 = readMat(actDim, hiddenDim);
      raw.b2 = readVec(actDim);
    }

    if (cursor > floats.length) return null;
    return validatePolicyWeights(raw);
  } catch {
    return null;
  }
}

function applyLayerNormInPlace(
  buf: Float32Array,
  dim: number,
  gamma: Float32Array,
  beta: Float32Array,
): void {
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

function matVecAddBiasF32(
  w: Float32Array,
  b: Float32Array,
  x: Float32Array,
  out: Float32Array,
  rows: number,
  cols: number,
): void {
  const cols4 = cols & ~3;
  for (let i = 0; i < rows; i++) {
    let sum = b[i];
    const base = i * cols;
    let j = 0;
    for (; j < cols4; j += 4) {
      sum +=
        w[base + j] * x[j] +
        w[base + j + 1] * x[j + 1] +
        w[base + j + 2] * x[j + 2] +
        w[base + j + 3] * x[j + 3];
    }
    for (; j < cols; j++) {
      sum += w[base + j] * x[j];
    }
    out[i] = sum;
  }
}

/**
 * Runs forward inference on a 43-input neural driver policy using pre-packed contiguous Float32Array weights.
 * Seamlessly supports legacy v1/v2 [H, H] tanh MLPs as well as v3 extended models
 * (RunningMeanStd obsNorm, LayerNorm, SiLU/Tanh, residual skips, and 2- or 3-hidden-layer MLPs).
 */
export function evaluateNeuralPolicy(
  obs: number[],
  weights: PolicyWeights = AI_POLICY_WEIGHTS,
): { steer: number; throttle: number; brake: number } | null {
  if (!weights || !Array.isArray(obs)) return null;
  const packed = packPolicyWeights(weights);
  if (!packed || obs.length !== packed.obsDim) return null;

  const { obsDim, hiddenDim, numHidden, useSilu, useResidual, useLinearOutput } = packed;
  const { xIn, h0, h1, h2 } = getScratchBuffers(hiddenDim, obsDim);

  if (packed.obsMean && packed.obsInvStd) {
    const mean = packed.obsMean;
    const invStd = packed.obsInvStd;
    const clip = packed.obsClip;
    for (let j = 0; j < obsDim; j++) {
      const v = obs[j];
      if (!Number.isFinite(v)) return null;
      const norm = (v - mean[j]) * invStd[j];
      xIn[j] = norm > clip ? clip : norm < -clip ? -clip : norm;
    }
  } else {
    for (let j = 0; j < obsDim; j++) {
      const v = obs[j];
      if (!Number.isFinite(v)) return null;
      xIn[j] = v;
    }
  }

  // Layer 0: obsDim -> hiddenDim
  matVecAddBiasF32(packed.w0, packed.b0, xIn, h0, hiddenDim, obsDim);
  if (packed.ln0Weight && packed.ln0Bias) {
    applyLayerNormInPlace(h0, hiddenDim, packed.ln0Weight, packed.ln0Bias);
  }
  applyActivationInPlace(h0, hiddenDim, useSilu);

  // Layer 1: hiddenDim -> hiddenDim
  matVecAddBiasF32(packed.w1, packed.b1, h0, h1, hiddenDim, hiddenDim);
  if (packed.ln1Weight && packed.ln1Bias) {
    applyLayerNormInPlace(h1, hiddenDim, packed.ln1Weight, packed.ln1Bias);
  }
  applyActivationInPlace(h1, hiddenDim, useSilu);
  if (useResidual) {
    for (let i = 0; i < hiddenDim; i++) h1[i] += h0[i];
  }

  let finalHidden = h1;

  // Optional Layer 2 (when numHidden === 3): hiddenDim -> hiddenDim
  if (numHidden === 3) {
    matVecAddBiasF32(packed.w2, packed.b2, h1, h2, hiddenDim, hiddenDim);
    if (packed.ln2Weight && packed.ln2Bias) {
      applyLayerNormInPlace(h2, hiddenDim, packed.ln2Weight, packed.ln2Bias);
    }
    applyActivationInPlace(h2, hiddenDim, useSilu);
    if (useResidual) {
      for (let i = 0; i < hiddenDim; i++) h2[i] += h1[i];
    }
    finalHidden = h2;
  }

  // Output layer: hiddenDim -> 3 (linear clamped [-1, 1] for version >= 2; tanh fallback for version === 1)
  const outW = packed.outW;
  const outB = packed.outB;
  let out0 = 0;
  let out1 = 0;
  let out2 = 0;
  for (let i = 0; i < 3; i++) {
    let sum = outB[i];
    const base = i * hiddenDim;
    for (let j = 0; j < hiddenDim; j++) {
      sum += outW[base + j] * finalHidden[j];
    }
    if (!Number.isFinite(sum)) return null;
    const raw = useLinearOutput ? sum : Math.tanh(sum);
    const clamped = raw > 1 ? 1 : raw < -1 ? -1 : raw;
    if (i === 0) out0 = clamped;
    else if (i === 1) out1 = clamped;
    else out2 = clamped;
  }

  if (packed.useSignedPedal) {
    // Signed longitudinal pedal (v4): physically eliminates throttle+brake overlap
    // and guarantees crisp 100% full throttle on straights when out1 >= 0.90.
    const DEADZONE = 0.02;
    const SPAN = 0.88;
    let throttle = 0;
    let brake = 0;
    if (out1 > DEADZONE) {
      throttle = Math.min(1, (out1 - DEADZONE) / SPAN);
    } else if (out1 < -DEADZONE) {
      brake = Math.min(1, (-out1 - DEADZONE) / SPAN);
    }
    return {
      steer: out0,
      throttle,
      brake,
    };
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

export interface NeuralStartContext {
  raceElapsed?: number;
  startType?: RaceStartType;
}

/**
 * Computes the [0..1] blend weight of the dedicated start policy during standing & rolling race starts.
 * Smoothly crossfades to 0 once the car is past the initial launch window and up to racing speed.
 */
export function computeStartPhaseWeight(
  car: Pick<CarSimState, 'speed' | 'totalDistance'>,
  startContext?: NeuralStartContext,
): number {
  const raceElapsed = startContext?.raceElapsed;
  const isRolling = startContext?.startType === 'rolling';

  if (raceElapsed === undefined || !Number.isFinite(raceElapsed)) {
    // Fallback standing-start protection even when caller doesn't pass raceElapsed:
    // protects cars launching from near-standstill right around the starting grid.
    if (car.totalDistance < 0.08 && car.speed < 18.0) {
      if (car.speed <= 10.0) return 1.0;
      return Math.max(0, Math.min(1, (18.0 - car.speed) / 8.0));
    }
    return 0;
  }

  if (raceElapsed < 0) return 1.0;

  if (isRolling) {
    // Rolling start: full start policy for 0..2.6s after green flag, smooth crossfade 2.6..4.2s
    if (raceElapsed <= 2.6) return 1.0;
    if (raceElapsed >= 4.2) return 0.0;
    return (4.2 - raceElapsed) / 1.6;
  }

  // Standing start: hold full start policy while accelerating off the grid (0..2.8s or speed < 18 m/s),
  // then smoothly hand off to the active V5-V9 race policy blend by 5.2-6.5s.
  if (raceElapsed >= 6.5) return 0.0;
  if (raceElapsed <= 2.8) return 1.0;
  const timeFade = Math.max(0, Math.min(1, (5.0 - raceElapsed) / 2.2));
  const speedFade = car.speed < 22.0 ? Math.max(0, Math.min(1, (22.0 - car.speed) / 10.0)) : 0;
  // Cap any extended low-speed fade smoothly to 0 by 6.5s
  const hardCap = Math.max(0, Math.min(1, (6.5 - raceElapsed) / 1.5));
  return Math.max(timeFade, speedFade * hardCap);
}

/**
 * Clean standing & rolling start launch controller used when trained `starts` neural weights
 * are not yet present. Holds grid lanes cleanly with smooth lateral separation, full launch
 * acceleration, and Turn-1 braking awareness.
 */
export function computeStartLaunchControl(
  car: CarSimState,
  compiledTrack: CompiledTrack,
  allCars: CarSimState[],
  heuristic: ControlInput,
  startType: RaceStartType = 'standing',
): { steer: number; throttle: number; brake: number } {
  const trackLen = Math.max(100, compiledTrack.totalLength);
  const lookAheadDist = Math.max(18, Math.min(44, 18 + car.speed * 0.55));
  const spNow = sampleTrackAtT(compiledTrack, car.trackT);
  const spAhead = sampleTrackAtT(compiledTrack, (car.trackT + lookAheadDist / trackLen) % 1);
  const halfW = Math.max(3, (spNow.width ?? compiledTrack.spec.trackWidth) * 0.5);

  // Hold current grid lane smoothly within safe track margins, nudging gently away from tight side/front traffic
  let targetLat = Math.max(-halfW * 0.62, Math.min(halfW * 0.62, car.lateralOffset));
  let blockedAheadThrottleCap = 1.0;
  let blockedAheadBrake = 0.0;

  for (let i = 0; i < allCars.length; i++) {
    const other = allCars[i];
    if (other.id === car.id || other.pitStopRemaining > 0) continue;

    let dt = other.trackT - car.trackT;
    if (dt > 0.5) dt -= 1;
    if (dt < -0.5) dt += 1;
    const relLong = dt * trackLen;
    if (relLong < -6.5 || relLong > 22.0) continue;

    const dLat = other.lateralOffset - car.lateralOffset;
    const absDLat = Math.abs(dLat);

    // Side-by-side separation: gently nudge away if closer than 2.7m laterally
    if (Math.abs(relLong) < 6.0 && absDLat < 2.7) {
      const pushDir = dLat >= 0 ? -1 : 1;
      const strength = (2.7 - absDLat) * 0.55;
      targetLat += pushDir * strength;
    }

    // Car directly ahead in our lane: pull cleanly toward the wider open side
    if (relLong > 0.5 && relLong < 16.0 && absDLat < 2.4) {
      const closing = car.speed - other.speed;
      if (closing > 0.5 || relLong < 8.5) {
        const spaceLeft = other.lateralOffset + halfW * 0.65;
        const spaceRight = halfW * 0.65 - other.lateralOffset;
        const passDir = spaceRight >= spaceLeft ? 1 : -1;
        targetLat = other.lateralOffset + passDir * 2.85;
      }
      // Only modulate throttle/brake if genuinely closing fast right on a bumper (never dead-stop on grid!)
      if (relLong < 6.5 && closing > 3.5 && (car.spawnGhostTimer ?? 0) <= 0.1) {
        blockedAheadThrottleCap = Math.min(blockedAheadThrottleCap, 0.35);
        blockedAheadBrake = Math.max(blockedAheadBrake, Math.min(0.65, (closing - 3.5) * 0.12));
      }
    }
  }

  targetLat = Math.max(-halfW * 0.68, Math.min(halfW * 0.68, targetLat));
  const latErr = targetLat - car.lateralOffset;

  const trackHeading = Math.atan2(spAhead.tx, spAhead.tz);
  let headingErr = trackHeading - car.heading;
  while (headingErr > Math.PI) headingErr -= Math.PI * 2;
  while (headingErr < -Math.PI) headingErr += Math.PI * 2;

  // stepCarPhysics: heading -= steer * rate -> positive headingErr (track bends left) needs steer < 0
  // lateralOffset increases to the right (+nx), so positive latErr (need to move right) needs steer > 0
  const steer = Math.max(
    -0.85,
    Math.min(0.85, -headingErr * 2.1 + (latErr / halfW) * 0.85),
  );

  // Clean full-traction launch acceleration while honoring heuristic Turn-1 braking zone
  const launchThrottle = startType === 'standing' && car.speed < 8.0 ? 0.94 : 1.0;
  const cornerBrakeActive = heuristic.brake > 0.12 && car.speed > 18.0;
  const throttle = cornerBrakeActive
    ? Math.min(launchThrottle, heuristic.throttle, blockedAheadThrottleCap)
    : Math.min(launchThrottle, blockedAheadThrottleCap);
  const brake = cornerBrakeActive
    ? Math.max(heuristic.brake, blockedAheadBrake)
    : blockedAheadBrake;

  return {
    steer,
    throttle: Math.max(0, Math.min(1, throttle)),
    brake: Math.max(0, Math.min(1, brake)),
  };
}

/**
 * Computes AI control using the trained 43-input neural driver policy,
 * automatically engaging the dedicated Starts policy on standing/rolling starts with smooth handoff,
 * supporting straight-line bump-drafting, and falling back cleanly to the heuristic controller
 * when boxing, in pit lane, or if weights fail validation.
 */
export function computeNeuralAIControl(
  car: CarSimState,
  compiledTrack: CompiledTrack,
  allCars: CarSimState[],
  dt: number,
  trackWetness: number,
  difficulty?: AIDifficulty,
  startContext?: NeuralStartContext,
): ControlInput {
  // Always evaluate heuristic control for race management, on-track service triggers, and kinematic safety bounds
  const heuristic = computeAIControl(car, compiledTrack, allCars, dt, trackWetness);

  // If servicing on track, pending on-track service stop, or finished, defer directly to heuristic controller
  if (car.pitStopRemaining > 0 || car.aiPendingStop || car.finished) {
    car.aiLastTelemetry = {
      carId: car.id,
      driverName: car.name,
      nationality: car.aiNationality,
      teamName: car.aiTeamName,
      personality: car.personality ?? 'Metronome',
      policyBlendLabel: car.aiPendingStop ? 'On-Track Service Pullover' : 'Service Complete',
      startPolicyWeight: 0,
      steer: Number(heuristic.steer.toFixed(3)),
      throttle: Number(heuristic.throttle.toFixed(3)),
      brake: Number(heuristic.brake.toFixed(3)),
      lookaheadCurvatures: [0, 0, 0, 0, 0, 0, 0, 0],
      radarSlots: [
        { occupied: false, relLongM: 0, relLatM: 0, relSpeedMs: 0, classDiff: 0 },
        { occupied: false, relLongM: 0, relLatM: 0, relSpeedMs: 0, classDiff: 0 },
        { occupied: false, relLongM: 0, relLatM: 0, relSpeedMs: 0, classDiff: 0 },
        { occupied: false, relLongM: 0, relLatM: 0, relSpeedMs: 0, classDiff: 0 },
      ],
      activeManeuver: 'servicing',
      strategyIntent: car.aiStrategyIntent ?? null,
      mistakeActive: false,
    };
    return heuristic;
  }

  // Section 4.1.6: Stuck / Crash 3-Point Reverse & >3s Anti-Roadblock Ghost Recovery
  const raceElapsed = startContext?.raceElapsed ?? (car.totalTime > 0 ? car.totalTime : 10);
  const recovery = stepAiStuckRecovery(car, compiledTrack, dt, raceElapsed > 1.8);
  if (recovery.active) {
    car.aiLastTelemetry = {
      carId: car.id,
      driverName: car.name,
      nationality: car.aiNationality,
      teamName: car.aiTeamName,
      personality: car.personality ?? 'Metronome',
      policyBlendLabel: recovery.ghosted ? 'Ghost Recovery' : '3-Point Reverse',
      startPolicyWeight: 0,
      steer: Number(recovery.steer.toFixed(3)),
      throttle: Number(recovery.throttle.toFixed(3)),
      brake: Number(recovery.brake.toFixed(3)),
      lookaheadCurvatures: [0, 0, 0, 0, 0, 0, 0, 0],
      radarSlots: [
        { occupied: false, relLongM: 0, relLatM: 0, relSpeedMs: 0, classDiff: 0 },
        { occupied: false, relLongM: 0, relLatM: 0, relSpeedMs: 0, classDiff: 0 },
        { occupied: false, relLongM: 0, relLatM: 0, relSpeedMs: 0, classDiff: 0 },
        { occupied: false, relLongM: 0, relLatM: 0, relSpeedMs: 0, classDiff: 0 },
      ],
      activeManeuver: 'recovering',
      strategyIntent: car.aiStrategyIntent ?? null,
      mistakeActive: false,
    };
    return {
      steer: recovery.steer,
      throttle: recovery.throttle,
      brake: recovery.brake,
      specialPressed: false,
      specialJustPressed: false,
    };
  }

  const skillTarget = mapDifficultyToSkillTarget(difficulty, car.aiPaceMultiplier);
  const prevSteer = car.steerAngle;

  // Per-Class Binary Specialist Routing (preferred when a trained class_<classId>.bin exists)
  const dedicatedClassWeights = perClassPoliciesEnabled
    ? CLASS_POLICY_REGISTRY[car.carSpec.classId]?.weights ?? null
    : null;

  // Fallback: Section 4.2.3 Per-Personality Neural Policy Blending (v1 / v2)
  const effectiveMix = resolvePersonalityBlendedMix(
    activePolicyMix,
    car.personality,
    personalityPolicyBlendingEnabled,
  );
  const entries = dedicatedClassWeights ? [] : getNormalizedPolicyMix(effectiveMix);
  if (!dedicatedClassWeights && entries.length === 0) return heuristic;

  const obsCache = new Map<string, number[]>();
  const getCachedObs = (obsConfig?: PolicyObsConfig, obsDim: number = 43): number[] => {
    const key = `${obsDim}:${getObsConfigKey(obsConfig)}`;
    let obs = obsCache.get(key);
    if (!obs) {
      obs =
        obsDim === 59
          ? buildPhysicsAwareObservationVector(
              car,
              compiledTrack,
              allCars,
              prevSteer,
              1.0,
              car.bopMultipliers,
              obsConfig,
            )
          : buildObservationVector(
              car,
              compiledTrack,
              allCars,
              prevSteer,
              1.0,
              car.bopMultipliers,
              obsConfig,
            );
      obsCache.set(key, obs);
    }
    return obs;
  };

  let primaryObs: number[] | null = null;
  let policyOut: { steer: number; throttle: number; brake: number } | null = null;
  if (dedicatedClassWeights) {
    primaryObs = getCachedObs(dedicatedClassWeights.obsConfig, dedicatedClassWeights.obsDim);
    policyOut = evaluateNeuralPolicy(primaryObs, dedicatedClassWeights);
  } else if (entries.length === 1) {
    const w = entries[0].weights;
    primaryObs = getCachedObs(w.obsConfig, w.obsDim);
    policyOut = evaluateNeuralPolicy(primaryObs, w);
  } else {
    let steer = 0;
    let throttle = 0;
    let brake = 0;
    let weightSum = 0;
    for (let i = 0; i < entries.length; i++) {
      const { fraction, weights } = entries[i];
      const obs = getCachedObs(weights.obsConfig, weights.obsDim);
      if (!primaryObs) primaryObs = obs;
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

  let blendedSteer = policyOut.steer;
  let blendedThrottle = policyOut.throttle;
  let blendedBrake = policyOut.brake;

  // Apply per-personality neural control profile (brake timing, exit smoothness, Average GTP Driver vs Passive racecraft)
  const pProf = car.personality ? PERSONALITY_POLICY_PROFILES[car.personality] : undefined;
  if (personalityPolicyBlendingEnabled && pProf) {
    if (blendedBrake > 0.08 && blendedBrake < 0.88) {
      blendedBrake = Math.max(0, Math.min(1, blendedBrake * pProf.brakeBias));
    }
    if (Math.abs(blendedSteer) > 0.35 && blendedBrake < 0.1 && car.tireWear < 75) {
      blendedThrottle = Math.max(0, Math.min(1, blendedThrottle * pProf.throttleSmoothness));
    }
  }

  // Wet-weather driving adaptation for neural AI (smoother exit throttle, earlier wet braking, slicks-in-rain caution)
  const effWet = Math.max(trackWetness, car.localWetness ?? 0);
  if (effWet > 0.22) {
    const wetSkill = car.aiWetSkill ?? 1.0;
    const wetConf = pProf?.wetConfidence ?? 1.0;
    const slicksInRain = car.compound !== 'wet';
    const wetFactor = effWet * (slicksInRain ? 1.45 : 1.0) / Math.max(0.82, wetSkill * wetConf);
    // Smoother corner-exit throttle to prevent wheelspin in rain & puddles
    if (Math.abs(blendedSteer) > 0.24 && blendedBrake < 0.12) {
      const exitCap = Math.max(0.56, 1.0 - wetFactor * 0.22);
      blendedThrottle = Math.min(blendedThrottle, exitCap);
    }
    if ((car.puddleIntensity ?? 0) > 0.25 && car.speed > 26) {
      blendedThrottle = Math.min(blendedThrottle, 0.72);
    }
    // Earlier braking safety in wet conditions (especially if caught on slicks before boxing)
    if (car.speed > 20 && heuristic.brake > 0.26 && blendedBrake < heuristic.brake * (slicksInRain ? 0.96 : 0.86)) {
      const wetBrakeAssist = Math.min(0.75, wetFactor * 0.45);
      blendedBrake = Math.min(1, blendedBrake + (heuristic.brake - blendedBrake) * wetBrakeAssist);
      blendedThrottle = Math.min(blendedThrottle, Math.max(0, 1 - blendedBrake * 1.5));
    }
    // Gently blend toward the wider off-rubber wet line from heuristic in heavy rain corners
    if (effWet > 0.32 && Math.abs(blendedSteer) > 0.22) {
      const wetLineBlend = Math.min(0.26, (effWet - 0.32) * 0.38);
      blendedSteer = blendedSteer * (1 - wetLineBlend) + heuristic.steer * wetLineBlend;
    }
  }

  // Dedicated Start Policy (selectable: Trained Neural / Auto Launch Assist / Off)
  const startWeight = activeStartPolicyMode === 'off' ? 0 : computeStartPhaseWeight(car, startContext);
  if (startWeight > 0.001) {
    let startOut: { steer: number; throttle: number; brake: number } | null = null;
    if (activeStartPolicyMode === 'neural' && activeStartPolicyWeights) {
      startOut = evaluateNeuralPolicy(
        getCachedObs(activeStartPolicyWeights.obsConfig, activeStartPolicyWeights.obsDim),
        activeStartPolicyWeights,
      );
      // Lightweight anti-stall floor on the first 2.5s of a standing launch even for early checkpoints
      if (
        startOut &&
        startContext?.startType !== 'rolling' &&
        (startContext?.raceElapsed ?? 0) < 2.5 &&
        car.speed < 10.0 &&
        startOut.throttle < 0.45
      ) {
        startOut = {
          steer: startOut.steer,
          throttle: Math.max(startOut.throttle, 0.82),
          brake: 0,
        };
      }
      // Turn-1 braking awareness during neural starts handoff so cars never plow into Turn 1
      if (startOut && heuristic.brake > 0.28 && car.speed > 18.0) {
        startOut = {
          steer: startOut.steer * 0.65 + heuristic.steer * 0.35,
          throttle: Math.min(startOut.throttle, heuristic.throttle),
          brake: Math.max(startOut.brake, heuristic.brake * 0.95),
        };
      }
    }
    if (!startOut) {
      startOut = computeStartLaunchControl(
        car,
        compiledTrack,
        allCars,
        heuristic,
        startContext?.startType ?? 'standing',
      );
    }
    blendedSteer = startOut.steer * startWeight + blendedSteer * (1 - startWeight);
    blendedThrottle = startOut.throttle * startWeight + blendedThrottle * (1 - startWeight);
    blendedBrake = startOut.brake * startWeight + blendedBrake * (1 - startWeight);
  }

  // Guardrail safety containment & straight-line bump-drafting assist
  const currentSample = sampleTrackAtT(compiledTrack, car.trackT);
  const halfW = (currentSample.width ?? compiledTrack.spec.trackWidth) * 0.5;
  const offTrackRatio = Math.abs(car.lateralOffset) / Math.max(1, halfW);

  // Physics-Aware Turn-1 & Heavy Braking Kinematic Safety Guard:
  const isTurn1Window = raceElapsed >= 0 && raceElapsed < 14.0;
  const brakeThreshold = isTurn1Window ? 0.28 : 0.44;
  if (car.speed > 18.0 && heuristic.brake > brakeThreshold && blendedBrake < heuristic.brake * 0.82) {
    const brakeDeficit = heuristic.brake - blendedBrake;
    const guardGain = isTurn1Window
      ? Math.min(1.0, 0.55 + (heuristic.brake - 0.25) * 1.1)
      : Math.min(0.88, (heuristic.brake - 0.38) * 1.35);
    blendedBrake = Math.min(1.0, blendedBrake + brakeDeficit * guardGain);
    blendedThrottle = Math.min(blendedThrottle, Math.max(0, 1 - blendedBrake * 1.6));
    if (heuristic.brake > 0.55) {
      const steerAssist = isTurn1Window ? 0.42 : 0.28;
      blendedSteer = blendedSteer * (1 - steerAssist) + heuristic.steer * steerAssist;
    }
  }

  // Straight-line bump-drafting: prevent overly timid neural lifting/braking when tucked behind
  // a car (including the player) at high speed on a clear straightaway.
  if (startWeight < 0.5 && car.speed > 38.0 && heuristic.brake < 0.08 && offTrackRatio < 0.95) {
    const trackLen = Math.max(100, compiledTrack.totalLength);
    const aheadSample = sampleTrackAtT(compiledTrack, (car.trackT + 65 / trackLen) % 1);
    const onClearStraight =
      Math.abs(currentSample.curvature ?? 0) < 0.008 &&
      Math.abs(aheadSample.curvature ?? 0) < 0.010;
    if (onClearStraight) {
      let draftLead: CarSimState | null = null;
      let draftDist = 18.0;
      for (let i = 0; i < allCars.length; i++) {
        const other = allCars[i];
        if (other.id === car.id || other.pitStopRemaining > 0) continue;
        let dtTrack = other.trackT - car.trackT;
        if (dtTrack > 0.5) dtTrack -= 1;
        if (dtTrack < -0.5) dtTrack += 1;
        const relLong = dtTrack * trackLen;
        if (
          relLong > 2.2 &&
          relLong < draftDist &&
          Math.abs(other.lateralOffset - car.lateralOffset) < 1.9 &&
          other.carSpec.classId === car.carSpec.classId &&
          other.speed > 34.0
        ) {
          draftDist = relLong;
          draftLead = other;
        }
      }
      if (draftLead) {
        const closing = car.speed - draftLead.speed;
        if (closing < 5.5) {
          const minDraftThrottle = closing > 3.8 && draftDist < 6.0 ? 0.78 : 0.94;
          blendedThrottle = Math.max(blendedThrottle, minDraftThrottle);
          blendedBrake = 0;
        }
      }
    }
  }

  // Wheel-to-wheel personality expression: Average GTP Drivers lunge aggressively inside, Passive drivers yield cleanly!
  if (startWeight < 0.2 && offTrackRatio < 0.85) {
    if (car.aiDefenseCommitted) {
      blendedSteer = blendedSteer * 0.68 + heuristic.steer * 0.32;
    } else if (car.blueFlagActive) {
      blendedSteer = blendedSteer * 0.62 + heuristic.steer * 0.38;
      blendedThrottle *= 0.91;
    } else if ((pProf?.diveBombTendency ?? 0) >= 0.55 && car.aiPassTimer > 0) {
      // Aggressive Average GTP Driver / Late-Braker: commit hard to the inside passing lane & brake later
      blendedSteer = blendedSteer * 0.58 + heuristic.steer * 0.42;
      if (blendedBrake > 0.12 && blendedBrake < 0.85) {
        blendedBrake *= 0.88;
      }
    } else if ((pProf?.yieldTendency ?? 0) >= 0.55) {
      // Passive / easy-going driver: if a rival is attacking closely behind, drift politely off-line & lift slightly
      const trackLen = Math.max(100, compiledTrack.totalLength);
      let attackedClosely = false;
      for (let i = 0; i < allCars.length; i++) {
        const other = allCars[i];
        if (other.id === car.id || other.pitStopRemaining > 0) continue;
        let dtTrack = other.trackT - car.trackT;
        if (dtTrack > 0.5) dtTrack -= 1;
        if (dtTrack < -0.5) dtTrack += 1;
        const relLong = dtTrack * trackLen;
        if (relLong < -2.0 && relLong > -16.0 && other.speed >= car.speed - 2.5) {
          attackedClosely = true;
          break;
        }
      }
      if (attackedClosely) {
        blendedSteer = blendedSteer * 0.58 + heuristic.steer * 0.42;
        blendedThrottle *= (pProf?.yieldTendency ?? 0.6) >= 0.8 ? 0.89 : 0.94;
      }
    }
  }

  // Section 4.1.4: Human-Like Mistakes (difficulty + pressure scaled; disabled on starts & straights)
  const mistake = stepHumanLikeMistake({
    car,
    dt,
    difficulty,
    nearCurvature: currentSample.curvature ?? 0,
    brakeInput: blendedBrake,
    underPressure: Boolean(car.aiDefenseCommitted),
    raceElapsed,
  });
  if (mistake.active) {
    blendedSteer += mistake.steerDelta;
    blendedThrottle *= mistake.throttleMultiplier;
    blendedBrake *= mistake.brakeMultiplier;
  }

  if (offTrackRatio > 1.05) {
    // Smoothly blend toward heuristic recovery over 1.05..1.25
    const blendWeight = Math.min(1.0, (offTrackRatio - 1.05) / 0.20);
    blendedSteer = blendedSteer * (1 - blendWeight) + heuristic.steer * blendWeight;
    blendedThrottle =
      blendedThrottle * (1 - blendWeight) +
      Math.min(blendedThrottle, heuristic.throttle) * blendWeight;
    blendedBrake =
      blendedBrake * (1 - blendWeight) +
      Math.max(blendedBrake, heuristic.brake) * blendWeight;
  }

  // Apply post-inference difficulty pacing cleanly (Alien untouched at 1.0)
  const isAlien = difficulty === 'Alien' || (difficulty === undefined && skillTarget >= 1.0);
  if (!isAlien) {
    const throttleScale = Math.max(0.75, Math.min(1.0, 0.70 + 0.30 * skillTarget));
    blendedThrottle *= throttleScale;
  }

  const finalSteer = Math.max(-1, Math.min(1, blendedSteer));
  const finalThrottle = Math.max(0, Math.min(1, blendedThrottle));
  const finalBrake = Math.max(0, Math.min(1, blendedBrake));

  // Capture live neural telemetry snapshot for Section 4.2.2 HUD Neural Visualizer
  const blendLabel = dedicatedClassWeights
    ? `${car.carSpec.classId} Class (ANB1${
        dedicatedClassWeights.pedalMode === 'signed' ? ' · Signed' : ''
      })`
    : entries
        .map((e) => `${POLICY_REGISTRY[e.id].shortLabel} ${Math.round(e.fraction * 100)}%`)
        .join(' · ');
  const activeManeuver: AiNeuralTelemetrySnapshot['activeManeuver'] =
    startWeight > 0.25
      ? 'launch'
      : car.blueFlagActive
      ? 'blue-flag'
      : car.aiDefenseCommitted
      ? 'defending'
      : car.aiPassTimer > 0
      ? 'overtaking'
      : 'racing';

  if (primaryObs) {
    car.aiLastTelemetry = buildAiNeuralTelemetrySnapshot({
      car,
      obs: primaryObs,
      steer: finalSteer,
      throttle: finalThrottle,
      brake: finalBrake,
      startPolicyWeight: startWeight,
      policyBlendLabel: blendLabel,
      activeManeuver,
      strategyIntent: car.aiStrategyIntent ?? null,
      mistakeActive: mistake.active,
    });
  }

  // Preserve DRS / special triggers and manual transmission signals from heuristic
  return {
    steer: finalSteer,
    throttle: finalThrottle,
    brake: finalBrake,
    specialPressed: heuristic.specialPressed,
    specialJustPressed: heuristic.specialJustPressed,
    shiftUp: heuristic.shiftUp,
    shiftDown: heuristic.shiftDown,
  };
}
