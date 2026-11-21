import { BoPMultipliers, getCarById } from './cars';
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

type TrackSetupArchetype = 'low-drag' | 'high-downforce' | 'high-speed-aero' | 'bumpy-braking' | 'balanced';

const TRACK_ARCHETYPE_MAP: Record<string, { archetype: TrackSetupArchetype; label: string }> = {
  // Ultra Low-Drag / High-Speed
  monza: { archetype: 'low-drag', label: 'Monza Low-Drag' },
  'le-mans': { archetype: 'low-drag', label: 'Le Mans Low-Drag' },
  baku: { archetype: 'low-drag', label: 'Baku Low-Drag' },
  'las-vegas': { archetype: 'low-drag', label: 'Las Vegas Low-Drag' },
  'daytona-road': { archetype: 'low-drag', label: 'Daytona Low-Drag' },
  jeddah: { archetype: 'low-drag', label: 'Jeddah High-Speed' },
  'paul-ricard': { archetype: 'low-drag', label: 'Paul Ricard Low-Drag' },
  'road-america': { archetype: 'low-drag', label: 'Road America Low-Drag' },
  // Maximum Downforce / Street & Tight Technical
  monaco: { archetype: 'high-downforce', label: 'Monaco Max-DF' },
  singapore: { archetype: 'high-downforce', label: 'Singapore Max-DF' },
  hungaroring: { archetype: 'high-downforce', label: 'Hungaroring High-DF' },
  'long-beach': { archetype: 'high-downforce', label: 'Long Beach Street' },
  'detroit-street': { archetype: 'high-downforce', label: 'Detroit Street' },
  zandvoort: { archetype: 'high-downforce', label: 'Zandvoort High-DF' },
  'mexico-city': { archetype: 'high-downforce', label: 'Mexico High-DF' },
  'lime-rock': { archetype: 'high-downforce', label: 'Lime Rock Technical' },
  miami: { archetype: 'high-downforce', label: 'Miami Technical' },
  madring: { archetype: 'high-downforce', label: 'Madring High-DF' },
  // High-Speed Aero & Elevation
  'spa-francorchamps': { archetype: 'high-speed-aero', label: 'Spa Aero-Efficiency' },
  silverstone: { archetype: 'high-speed-aero', label: 'Silverstone High-Speed' },
  suzuka: { archetype: 'high-speed-aero', label: 'Suzuka High-Speed' },
  cota: { archetype: 'high-speed-aero', label: 'COTA High-Speed' },
  portimao: { archetype: 'high-speed-aero', label: 'Portimao Elevation' },
  interlagos: { archetype: 'high-speed-aero', label: 'Interlagos Balanced' },
  'red-bull-ring': { archetype: 'high-speed-aero', label: 'Red Bull Ring' },
  'watkins-glen': { archetype: 'high-speed-aero', label: 'Watkins Glen' },
  mosport: { archetype: 'high-speed-aero', label: 'Mosport High-Speed' },
  'road-atlanta': { archetype: 'high-speed-aero', label: 'Road Atlanta' },
  fuji: { archetype: 'high-speed-aero', label: 'Fuji Aero-Efficiency' },
  sepang: { archetype: 'high-speed-aero', label: 'Sepang High-Speed' },
  lusail: { archetype: 'high-speed-aero', label: 'Lusail High-Speed' },
  barcelona: { archetype: 'high-speed-aero', label: 'Barcelona Aero' },
  'albert-park': { archetype: 'high-speed-aero', label: 'Albert Park' },
  // Bumpy / Heavy Braking & Traction
  sebring: { archetype: 'bumpy-braking', label: 'Sebring Bumpy-Enduro' },
  montreal: { archetype: 'bumpy-braking', label: 'Montreal Braking-Kerb' },
  imola: { archetype: 'bumpy-braking', label: 'Imola Kerb-Traction' },
  'laguna-seca': { archetype: 'bumpy-braking', label: 'Laguna Seca Technical' },
  bahrain: { archetype: 'bumpy-braking', label: 'Bahrain Traction' },
  shanghai: { archetype: 'bumpy-braking', label: 'Shanghai Front-Limited' },
  'yas-marina': { archetype: 'bumpy-braking', label: 'Yas Marina Traction' },
  'mid-ohio': { archetype: 'bumpy-braking', label: 'Mid-Ohio Bumpy' },
  vir: { archetype: 'bumpy-braking', label: 'VIR Elevation' },
  'indianapolis-road': { archetype: 'bumpy-braking', label: 'Indy Road' },
};

type SetupClassBucket = 'F1' | 'GTP' | 'LMP2' | 'GT3' | 'OTHER';

function resolveSetupClassBucket(classId: CarClassId): SetupClassBucket {
  if (
    classId === CarClassId.F1_2026 ||
    classId === CarClassId.F1_2021 ||
    classId === CarClassId.F1_2005
  ) {
    return 'F1';
  }
  if (classId === CarClassId.HYPERCAR_GTP) return 'GTP';
  if (classId === CarClassId.LMP2) return 'LMP2';
  if (classId === CarClassId.GT3) return 'GT3';
  return 'OTHER';
}

const CLASS_ARCHETYPE_SETUPS: Record<
  Exclude<SetupClassBucket, 'OTHER'>,
  Record<TrackSetupArchetype, CarSetupConfig>
> = {
  F1: {
    'low-drag': {
      frontWing: 24,
      rearWing: 18,
      brakeBalance: 57.5,
      finalDrive: 7,
      suspensionStiffness: 74,
      arbBalance: 4,
      diffLock: 46,
      startingFuel: 92,
      tirePressureFront: 24.8,
      tirePressureRear: 23.6,
    },
    'high-downforce': {
      frontWing: 90,
      rearWing: 88,
      brakeBalance: 54.5,
      finalDrive: -7,
      suspensionStiffness: 56,
      arbBalance: 14,
      diffLock: 62,
      startingFuel: 88,
      tirePressureFront: 23.2,
      tirePressureRear: 22.4,
    },
    'high-speed-aero': {
      frontWing: 66,
      rearWing: 62,
      brakeBalance: 56.0,
      finalDrive: 1,
      suspensionStiffness: 76,
      arbBalance: 8,
      diffLock: 52,
      startingFuel: 94,
      tirePressureFront: 24.4,
      tirePressureRear: 23.4,
    },
    'bumpy-braking': {
      frontWing: 62,
      rearWing: 66,
      brakeBalance: 55.0,
      finalDrive: -2,
      suspensionStiffness: 54,
      arbBalance: -6,
      diffLock: 48,
      startingFuel: 95,
      tirePressureFront: 23.8,
      tirePressureRear: 22.8,
    },
    balanced: {
      frontWing: 58,
      rearWing: 56,
      brakeBalance: 56.0,
      finalDrive: 0,
      suspensionStiffness: 70,
      arbBalance: 6,
      diffLock: 52,
      startingFuel: 95,
      tirePressureFront: 24.0,
      tirePressureRear: 23.2,
    },
  },
  GTP: {
    'low-drag': {
      frontWing: 26,
      rearWing: 22,
      brakeBalance: 58.0,
      finalDrive: 8,
      suspensionStiffness: 66,
      arbBalance: -4,
      diffLock: 44,
      startingFuel: 96,
      tirePressureFront: 25.0,
      tirePressureRear: 24.4,
    },
    'high-downforce': {
      frontWing: 82,
      rearWing: 84,
      brakeBalance: 55.0,
      finalDrive: -6,
      suspensionStiffness: 46,
      arbBalance: 10,
      diffLock: 60,
      startingFuel: 92,
      tirePressureFront: 23.4,
      tirePressureRear: 22.8,
    },
    'high-speed-aero': {
      frontWing: 56,
      rearWing: 54,
      brakeBalance: 56.5,
      finalDrive: 2,
      suspensionStiffness: 64,
      arbBalance: 4,
      diffLock: 52,
      startingFuel: 98,
      tirePressureFront: 24.2,
      tirePressureRear: 23.6,
    },
    'bumpy-braking': {
      frontWing: 58,
      rearWing: 64,
      brakeBalance: 55.5,
      finalDrive: -2,
      suspensionStiffness: 42,
      arbBalance: -10,
      diffLock: 48,
      startingFuel: 100,
      tirePressureFront: 23.6,
      tirePressureRear: 23.0,
    },
    balanced: {
      frontWing: 52,
      rearWing: 52,
      brakeBalance: 56.5,
      finalDrive: 0,
      suspensionStiffness: 58,
      arbBalance: 2,
      diffLock: 50,
      startingFuel: 98,
      tirePressureFront: 24.0,
      tirePressureRear: 23.5,
    },
  },
  LMP2: {
    'low-drag': {
      frontWing: 28,
      rearWing: 24,
      brakeBalance: 57.5,
      finalDrive: 7,
      suspensionStiffness: 62,
      arbBalance: 0,
      diffLock: 46,
      startingFuel: 95,
      tirePressureFront: 24.6,
      tirePressureRear: 24.0,
    },
    'high-downforce': {
      frontWing: 84,
      rearWing: 82,
      brakeBalance: 54.5,
      finalDrive: -6,
      suspensionStiffness: 44,
      arbBalance: 12,
      diffLock: 58,
      startingFuel: 90,
      tirePressureFront: 23.2,
      tirePressureRear: 22.8,
    },
    'high-speed-aero': {
      frontWing: 60,
      rearWing: 56,
      brakeBalance: 56.0,
      finalDrive: 1,
      suspensionStiffness: 60,
      arbBalance: 6,
      diffLock: 52,
      startingFuel: 95,
      tirePressureFront: 24.0,
      tirePressureRear: 23.5,
    },
    'bumpy-braking': {
      frontWing: 60,
      rearWing: 62,
      brakeBalance: 55.0,
      finalDrive: -2,
      suspensionStiffness: 40,
      arbBalance: -6,
      diffLock: 48,
      startingFuel: 96,
      tirePressureFront: 23.5,
      tirePressureRear: 23.0,
    },
    balanced: {
      frontWing: 54,
      rearWing: 52,
      brakeBalance: 56.0,
      finalDrive: 0,
      suspensionStiffness: 56,
      arbBalance: 4,
      diffLock: 50,
      startingFuel: 95,
      tirePressureFront: 23.8,
      tirePressureRear: 23.4,
    },
  },
  GT3: {
    'low-drag': {
      frontWing: 26,
      rearWing: 28,
      brakeBalance: 58.5,
      finalDrive: 6,
      suspensionStiffness: 54,
      arbBalance: -8,
      diffLock: 42,
      startingFuel: 95,
      tirePressureFront: 24.5,
      tirePressureRear: 24.2,
    },
    'high-downforce': {
      frontWing: 78,
      rearWing: 82,
      brakeBalance: 55.5,
      finalDrive: -5,
      suspensionStiffness: 38,
      arbBalance: 6,
      diffLock: 56,
      startingFuel: 90,
      tirePressureFront: 23.0,
      tirePressureRear: 22.6,
    },
    'high-speed-aero': {
      frontWing: 56,
      rearWing: 60,
      brakeBalance: 57.0,
      finalDrive: 1,
      suspensionStiffness: 50,
      arbBalance: -4,
      diffLock: 48,
      startingFuel: 96,
      tirePressureFront: 23.8,
      tirePressureRear: 23.4,
    },
    'bumpy-braking': {
      frontWing: 54,
      rearWing: 62,
      brakeBalance: 56.0,
      finalDrive: -2,
      suspensionStiffness: 34,
      arbBalance: -12,
      diffLock: 44,
      startingFuel: 98,
      tirePressureFront: 23.2,
      tirePressureRear: 22.8,
    },
    balanced: {
      frontWing: 50,
      rearWing: 54,
      brakeBalance: 57.0,
      finalDrive: 0,
      suspensionStiffness: 46,
      arbBalance: -4,
      diffLock: 48,
      startingFuel: 96,
      tirePressureFront: 23.6,
      tirePressureRear: 23.2,
    },
  },
};

/**
 * Returns the tailored motorsport default setup for a car + track combination.
 * Provides dedicated per-track × per-class engineering baselines for GTP, LMP2, GT3, and F1.
 */
export function getDefaultTrackClassSetup(carId: string, trackId: string): CarSetupConfig {
  const car = getCarById(carId);
  const bucket = resolveSetupClassBucket(car.classId);
  const trackInfo = TRACK_ARCHETYPE_MAP[trackId];
  const archetype: TrackSetupArchetype = trackInfo?.archetype ?? 'balanced';

  if (bucket !== 'OTHER') {
    return normalizeCarSetup(CLASS_ARCHETYPE_SETUPS[bucket][archetype]);
  }

  // Fallback for other classes (GT4, Formula E, Road/Supercar) using track archetype
  if (archetype === 'low-drag') return { ...CAR_SETUP_PRESETS[1].setup };
  if (archetype === 'high-downforce') return { ...CAR_SETUP_PRESETS[2].setup };
  return { ...DEFAULT_CAR_SETUP };
}

export function getTrackClassSetupLabel(carId: string, trackId: string): string {
  const car = getCarById(carId);
  const bucket = resolveSetupClassBucket(car.classId);
  const trackInfo = TRACK_ARCHETYPE_MAP[trackId];
  const classTag = bucket === 'OTHER' ? car.classId : bucket;
  return `${classTag} · ${trackInfo?.label ?? 'Balanced Baseline'}`;
}

export function getSavedCarSetup(carId: string, trackId: string): CarSetupConfig {
  const store = readSetupStore();
  const specific = store[`${carId}::${trackId}`];
  if (specific) return normalizeCarSetup(specific);
  const carDefault = store[`${carId}::*`];
  if (carDefault) return normalizeCarSetup(carDefault);
  return getDefaultTrackClassSetup(carId, trackId);
}

export function hasUserSavedCarSetup(carId: string, trackId: string): boolean {
  const store = readSetupStore();
  return Boolean(store[`${carId}::${trackId}`] || store[`${carId}::*`]);
}

export function clearSavedCarSetup(carId: string, trackId: string): CarSetupConfig {
  try {
    if (typeof localStorage !== 'undefined') {
      const store = readSetupStore();
      delete store[`${carId}::${trackId}`];
      localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(store));
    }
  } catch {
    // ignore
  }
  return getDefaultTrackClassSetup(carId, trackId);
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
