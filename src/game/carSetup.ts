import { BoPMultipliers } from './cars';
import { CarClassId, CarSetupConfig } from './types';

export type SetupPresetId = 'balanced' | 'low-downforce' | 'high-downforce' | 'wet';

export interface SetupPreset {
  id: SetupPresetId;
  name: string;
  subtitle: string;
  setup: CarSetupConfig;
}

export const DEFAULT_CAR_SETUP: CarSetupConfig = {
  frontWing: 50,
  rearWing: 50,
  brakeBalance: 56,
  finalDrive: 0,
  suspensionStiffness: 50,
  arbBalance: 0,
  diffLock: 50,
  startingFuel: 100,
  tirePressureFront: 24.0,
  tirePressureRear: 23.5,
};

export const CAR_SETUP_PRESETS: readonly SetupPreset[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    subtitle: 'All-round baseline',
    setup: { ...DEFAULT_CAR_SETUP },
  },
  {
    id: 'low-downforce',
    name: 'Low Downforce (Monza)',
    subtitle: 'Maximum straight-line Vmax & low drag',
    setup: {
      frontWing: 24,
      rearWing: 20,
      brakeBalance: 58,
      finalDrive: 7,
      suspensionStiffness: 62,
      arbBalance: -8,
      diffLock: 42,
      startingFuel: 95,
      tirePressureFront: 25.5,
      tirePressureRear: 25.0,
    },
  },
  {
    id: 'high-downforce',
    name: 'High Downforce (Monaco)',
    subtitle: 'Peak cornering bite & short gearing',
    setup: {
      frontWing: 84,
      rearWing: 86,
      brakeBalance: 54,
      finalDrive: -7,
      suspensionStiffness: 42,
      arbBalance: 14,
      diffLock: 64,
      startingFuel: 90,
      tirePressureFront: 23.0,
      tirePressureRear: 22.5,
    },
  },
  {
    id: 'wet',
    name: 'Wet Weather',
    subtitle: 'Soft suspension, rear stability & warm tires',
    setup: {
      frontWing: 74,
      rearWing: 80,
      brakeBalance: 52,
      finalDrive: -3,
      suspensionStiffness: 28,
      arbBalance: -18,
      diffLock: 32,
      startingFuel: 100,
      tirePressureFront: 26.5,
      tirePressureRear: 26.0,
    },
  },
] as const;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function normalizeCarSetup(raw?: Partial<CarSetupConfig> | null): CarSetupConfig {
  const s = raw ?? {};
  const num = (v: unknown, fb: number, lo: number, hi: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? clamp(n, lo, hi) : fb;
  };
  return {
    frontWing: Math.round(num(s.frontWing, DEFAULT_CAR_SETUP.frontWing, 0, 100)),
    rearWing: Math.round(num(s.rearWing, DEFAULT_CAR_SETUP.rearWing, 0, 100)),
    brakeBalance: Math.round(num(s.brakeBalance, DEFAULT_CAR_SETUP.brakeBalance, 45, 68) * 2) / 2,
    finalDrive: Math.round(num(s.finalDrive, DEFAULT_CAR_SETUP.finalDrive, -10, 10)),
    suspensionStiffness: Math.round(num(s.suspensionStiffness, DEFAULT_CAR_SETUP.suspensionStiffness, 0, 100)),
    arbBalance: Math.round(num(s.arbBalance, DEFAULT_CAR_SETUP.arbBalance, -50, 50)),
    diffLock: Math.round(num(s.diffLock, DEFAULT_CAR_SETUP.diffLock, 0, 100)),
    startingFuel: Math.round(num(s.startingFuel, DEFAULT_CAR_SETUP.startingFuel, 15, 100)),
    tirePressureFront: Math.round(num(s.tirePressureFront, DEFAULT_CAR_SETUP.tirePressureFront, 18, 32) * 10) / 10,
    tirePressureRear: Math.round(num(s.tirePressureRear, DEFAULT_CAR_SETUP.tirePressureRear, 18, 32) * 10) / 10,
  };
}

export interface SetupPhysicsModifiers {
  topSpeedMult: number;
  accelMult: number;
  dragMult: number;
  frontDownforceMult: number;
  rearDownforceMult: number;
  overallDownforceMult: number;
  frontMechGripMult: number;
  rearMechGripMult: number;
  diffExitTractionMult: number;
  diffTurnInMult: number;
  brakeBiasFront: number; // 0.45..0.68
  kerbComplianceMult: number; // softer suspension handles kerbs better
  pitchRollScale: number; // stiffer suspension rolls/pitches less
  frontTireHeatMult: number;
  rearTireHeatMult: number;
  frontTireWearMult: number;
  rearTireWearMult: number;
}

/**
 * Translates CarSetupConfig into balanced, authentic motorsport physics modifiers.
 * Keeps neutral setup (DEFAULT_CAR_SETUP) at exact 1.0 identity multipliers.
 */
export function computeSetupPhysicsModifiers(rawSetup?: CarSetupConfig | null): SetupPhysicsModifiers {
  const s = rawSetup ? normalizeCarSetup(rawSetup) : DEFAULT_CAR_SETUP;
  const fw = (s.frontWing - 50) / 50; // -1..+1
  const rw = (s.rearWing - 50) / 50; // -1..+1
  const avgWing = (fw + rw) * 0.5;
  const fd = s.finalDrive / 10; // -1..+1
  const susp = (s.suspensionStiffness - 50) / 50; // -1..+1
  const arb = s.arbBalance / 50; // -1..+1
  const diff = (s.diffLock - 50) / 50; // -1..+1
  const pF = (s.tirePressureFront - 24.0) / 8.0; // -0.75..+1
  const pR = (s.tirePressureRear - 23.5) / 8.5;

  // Aero wings: +wing -> +downforce, +drag, -Vmax
  const frontDownforceMult = 1.0 + fw * 0.14;
  const rearDownforceMult = 1.0 + rw * 0.14;
  const overallDownforceMult = 1.0 + avgWing * 0.13;
  const dragMult = 1.0 + avgWing * 0.16;

  // Final drive: taller (+fd) boosts top speed at cost of low-mid accel; shorter (-fd) boosts accel
  const topSpeedMult = (1.0 - avgWing * 0.042) * (1.0 + fd * 0.036);
  const accelMult = 1.0 - fd * 0.055;

  // ARB & suspension balance: +arb shifts mechanical grip toward front (sharper turn-in / more oversteer)
  const frontMechGripMult = 1.0 + arb * 0.055 - Math.abs(pF) * 0.035 + susp * 0.015;
  const rearMechGripMult = 1.0 - arb * 0.055 - Math.abs(pR) * 0.035 + susp * 0.015;

  // Differential: higher lock = stronger corner-exit traction, slightly tighter mid-corner rotation
  const diffExitTractionMult = 1.0 + diff * 0.065;
  const diffTurnInMult = 1.0 - diff * 0.04;

  // Suspension stiffness: soft absorbs kerbs/bumps better; stiff reduces body roll & sharpens response
  const kerbComplianceMult = 1.0 - susp * 0.22;
  const pitchRollScale = 1.0 - susp * 0.32;

  // Tire pressures: higher pressure heats faster & slightly reduces rolling resistance, lower pressure grips & wears slightly faster
  const frontTireHeatMult = 1.0 + pF * 0.12;
  const rearTireHeatMult = 1.0 + pR * 0.12;
  const frontTireWearMult = 1.0 + Math.abs(pF) * 0.10;
  const rearTireWearMult = 1.0 + Math.abs(pR) * 0.10;

  return {
    topSpeedMult,
    accelMult,
    dragMult,
    frontDownforceMult,
    rearDownforceMult,
    overallDownforceMult,
    frontMechGripMult,
    rearMechGripMult,
    diffExitTractionMult,
    diffTurnInMult,
    brakeBiasFront: s.brakeBalance / 100,
    kerbComplianceMult,
    pitchRollScale,
    frontTireHeatMult,
    rearTireHeatMult,
    frontTireWearMult,
    rearTireWearMult,
  };
}

const SETUP_CODE_PREFIX = 'APXSET:';

export function encodeSetupCode(setup: CarSetupConfig): string {
  const s = normalizeCarSetup(setup);
  const compact = [
    s.frontWing,
    s.rearWing,
    s.brakeBalance,
    s.finalDrive,
    s.suspensionStiffness,
    s.arbBalance,
    s.diffLock,
    s.startingFuel,
    s.tirePressureFront,
    s.tirePressureRear,
  ].join(',');
  return `${SETUP_CODE_PREFIX}v1:${compact}`;
}

export function decodeSetupCode(code: string): CarSetupConfig | null {
  if (typeof code !== 'string') return null;
  const trimmed = code.trim();
  if (!trimmed.startsWith(SETUP_CODE_PREFIX)) return null;
  const body = trimmed.slice(SETUP_CODE_PREFIX.length);
  const parts = body.startsWith('v1:') ? body.slice(3).split(',') : body.split(',');
  if (parts.length !== 10) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return normalizeCarSetup({
    frontWing: nums[0],
    rearWing: nums[1],
    brakeBalance: nums[2],
    finalDrive: nums[3],
    suspensionStiffness: nums[4],
    arbBalance: nums[5],
    diffLock: nums[6],
    startingFuel: nums[7],
    tirePressureFront: nums[8],
    tirePressureRear: nums[9],
  });
}

const SETUP_STORAGE_KEY = 'apex_car_setups_v1';

function readSetupStore(): Record<string, CarSetupConfig> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(SETUP_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getSavedCarSetup(carId: string, trackId: string): CarSetupConfig {
  const store = readSetupStore();
  const specific = store[`${carId}::${trackId}`];
  if (specific) return normalizeCarSetup(specific);
  const carDefault = store[`${carId}::*`];
  if (carDefault) return normalizeCarSetup(carDefault);
  return { ...DEFAULT_CAR_SETUP };
}

export function saveCarSetup(carId: string, trackId: string, setup: CarSetupConfig): CarSetupConfig {
  const clean = normalizeCarSetup(setup);
  try {
    if (typeof localStorage !== 'undefined') {
      const store = readSetupStore();
      store[`${carId}::${trackId}`] = clean;
      localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(store));
    }
  } catch {
    // Ignore storage quota / private mode failures
  }
  return clean;
}

// ==================== Live BoP Inspector & Custom BoP Sandbox ====================

export type CustomBoPClassOverrides = Partial<Record<CarClassId, BoPMultipliers>>;
export type CustomBoPCarOverrides = Record<string, BoPMultipliers>;

export interface CustomBoPSandboxState {
  enabled: boolean;
  classOverrides: CustomBoPClassOverrides;
  carOverrides: CustomBoPCarOverrides;
}

const CUSTOM_BOP_STORAGE_KEY = 'apex_custom_bop_sandbox_v1';

const DEFAULT_BOP_SANDBOX: CustomBoPSandboxState = {
  enabled: false,
  classOverrides: {},
  carOverrides: {},
};

function sanitizeBoP(raw?: Partial<BoPMultipliers> | null): BoPMultipliers {
  const clampMult = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? clamp(Math.round(n * 1000) / 1000, 0.75, 1.25) : 1.0;
  };
  return {
    topSpeedMult: clampMult(raw?.topSpeedMult),
    gripMult: clampMult(raw?.gripMult),
    downforceMult: clampMult(raw?.downforceMult),
    brakingMult: clampMult(raw?.brakingMult),
  };
}

function readStoredCustomBoP(): CustomBoPSandboxState {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_BOP_SANDBOX, classOverrides: {}, carOverrides: {} };
    const raw = localStorage.getItem(CUSTOM_BOP_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BOP_SANDBOX, classOverrides: {}, carOverrides: {} };
    const parsed = JSON.parse(raw);
    const classOverrides: CustomBoPClassOverrides = {};
    if (parsed?.classOverrides && typeof parsed.classOverrides === 'object') {
      for (const [k, v] of Object.entries(parsed.classOverrides)) {
        classOverrides[k as CarClassId] = sanitizeBoP(v as Partial<BoPMultipliers>);
      }
    }
    const carOverrides: CustomBoPCarOverrides = {};
    if (parsed?.carOverrides && typeof parsed.carOverrides === 'object') {
      for (const [k, v] of Object.entries(parsed.carOverrides)) {
        carOverrides[k] = sanitizeBoP(v as Partial<BoPMultipliers>);
      }
    }
    return {
      enabled: Boolean(parsed?.enabled),
      classOverrides,
      carOverrides,
    };
  } catch {
    return { ...DEFAULT_BOP_SANDBOX, classOverrides: {}, carOverrides: {} };
  }
}

let activeCustomBoP: CustomBoPSandboxState = readStoredCustomBoP();
const bopListeners = new Set<(state: CustomBoPSandboxState) => void>();

export function getCustomBoPSandbox(): CustomBoPSandboxState {
  return {
    enabled: activeCustomBoP.enabled,
    classOverrides: { ...activeCustomBoP.classOverrides },
    carOverrides: { ...activeCustomBoP.carOverrides },
  };
}

function persistCustomBoP(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CUSTOM_BOP_STORAGE_KEY, JSON.stringify(activeCustomBoP));
    }
  } catch {
    // ignore
  }
  const snap = getCustomBoPSandbox();
  bopListeners.forEach((fn) => fn(snap));
}

export function setCustomBoPEnabled(enabled: boolean): void {
  activeCustomBoP = { ...activeCustomBoP, enabled };
  persistCustomBoP();
}

export function setCustomBoPClassOverride(classId: CarClassId, mults: Partial<BoPMultipliers>): void {
  activeCustomBoP = {
    ...activeCustomBoP,
    classOverrides: {
      ...activeCustomBoP.classOverrides,
      [classId]: sanitizeBoP({ ...activeCustomBoP.classOverrides[classId], ...mults }),
    },
  };
  persistCustomBoP();
}

export function setCustomBoPCarOverride(carId: string, mults: Partial<BoPMultipliers>): void {
  activeCustomBoP = {
    ...activeCustomBoP,
    carOverrides: {
      ...activeCustomBoP.carOverrides,
      [carId]: sanitizeBoP({ ...activeCustomBoP.carOverrides[carId], ...mults }),
    },
  };
  persistCustomBoP();
}

export function resetCustomBoPSandbox(): void {
  activeCustomBoP = { enabled: false, classOverrides: {}, carOverrides: {} };
  persistCustomBoP();
}

export function subscribeCustomBoP(listener: (state: CustomBoPSandboxState) => void): () => void {
  bopListeners.add(listener);
  return () => {
    bopListeners.delete(listener);
  };
}

/**
 * Applies active Custom BoP Sandbox class & car multipliers on top of a car's base BoP.
 */
export function resolveEffectiveBoP(
  baseBoP: BoPMultipliers,
  carId: string,
  classId: CarClassId,
): BoPMultipliers {
  if (!activeCustomBoP.enabled) return baseBoP;
  const cls = activeCustomBoP.classOverrides[classId];
  const car = activeCustomBoP.carOverrides[carId];
  if (!cls && !car) return baseBoP;
  return {
    topSpeedMult: baseBoP.topSpeedMult * (cls?.topSpeedMult ?? 1.0) * (car?.topSpeedMult ?? 1.0),
    gripMult: baseBoP.gripMult * (cls?.gripMult ?? 1.0) * (car?.gripMult ?? 1.0),
    downforceMult: baseBoP.downforceMult * (cls?.downforceMult ?? 1.0) * (car?.downforceMult ?? 1.0),
    brakingMult: baseBoP.brakingMult * (cls?.brakingMult ?? 1.0) * (car?.brakingMult ?? 1.0),
  };
}
