import {
  BoPAttributes,
  CarClassId,
  CarClassMeta,
  CarDimensions,
  CarLiveryPreset,
  CarSpec,
  LiveryConfig,
} from './types';
import bopConfigRaw from './bopConfig.json';

export interface BoPMultipliers {
  topSpeedMult: number;
  gripMult: number;
  downforceMult: number;
  brakingMult: number;
}

export const BOP_CONFIG: Record<string, BoPMultipliers> = bopConfigRaw as Record<string, BoPMultipliers>;

export function getCarBoP(carId: string): BoPMultipliers {
  const direct = BOP_CONFIG[carId];
  if (direct) return direct;
  const alias = CAR_ALIASES[carId];
  if (alias && BOP_CONFIG[alias.targetCarId]) {
    return BOP_CONFIG[alias.targetCarId];
  }
  return {
    topSpeedMult: 1.0,
    gripMult: 1.0,
    downforceMult: 1.0,
    brakingMult: 1.0,
  };
}

export const CAR_CLASSES: Record<CarClassId, CarClassMeta> = {
  [CarClassId.HYPERCAR_GTP]: {
    id: CarClassId.HYPERCAR_GTP,
    name: 'WEC Hypercar / IMSA GTP',
    shortName: 'GTP',
    category: 'Endurance',
    plateColor: '#dc2626',
    badgeTextColor: '#ffffff',
    basePaceIndex: 1.04,
    forwardGears: 7,
    specialType: 'ers-overtake',
    specialLabel: 'Hybrid Overtake',
    defaultHeadlightTint: 'crystal-white',
  },
  [CarClassId.LMP2]: {
    id: CarClassId.LMP2,
    name: 'LMP2 Prototype',
    shortName: 'LMP2',
    category: 'Endurance',
    plateColor: '#2563eb',
    badgeTextColor: '#ffffff',
    basePaceIndex: 0.96,
    forwardGears: 6,
    specialType: 'none',
    specialLabel: 'None',
    defaultHeadlightTint: 'crystal-white',
  },
  [CarClassId.GT3]: {
    id: CarClassId.GT3,
    name: 'GTD Pro / LMGT3',
    shortName: 'GT3',
    category: 'Endurance',
    plateColor: '#16a34a',
    badgeTextColor: '#ffffff',
    basePaceIndex: 0.87,
    forwardGears: 6,
    specialType: 'none',
    specialLabel: 'None',
    defaultHeadlightTint: 'endurance-yellow',
  },
  [CarClassId.GT4]: {
    id: CarClassId.GT4,
    name: 'GT4 European / IMSA GS',
    shortName: 'GT4',
    category: 'Endurance',
    plateColor: '#0284c7',
    badgeTextColor: '#ffffff',
    basePaceIndex: 0.81,
    forwardGears: 6,
    specialType: 'none',
    specialLabel: 'None',
    defaultHeadlightTint: 'crystal-white',
  },
  [CarClassId.F1_2026]: {
    id: CarClassId.F1_2026,
    name: 'Formula 1 — 2026 Spec',
    shortName: 'F1 26',
    category: 'Single-Seater',
    plateColor: '#f8fafc',
    badgeTextColor: '#0f172a',
    basePaceIndex: 1.15,
    forwardGears: 8,
    specialType: 'active-aero',
    specialLabel: 'Active Aero',
    defaultHeadlightTint: 'crystal-white',
  },
  [CarClassId.F1_2021]: {
    id: CarClassId.F1_2021,
    name: 'Formula 1 — 2021 Spec',
    shortName: 'F1 21',
    category: 'Single-Seater',
    plateColor: '#e2e8f0',
    badgeTextColor: '#0f172a',
    basePaceIndex: 1.18,
    forwardGears: 8,
    specialType: 'drs',
    specialLabel: 'DRS',
    defaultHeadlightTint: 'crystal-white',
  },
  [CarClassId.F1_2005]: {
    id: CarClassId.F1_2005,
    name: 'Formula 1 — 2005 V10',
    shortName: 'F1 05',
    category: 'Single-Seater',
    plateColor: '#fef08a',
    badgeTextColor: '#1e293b',
    basePaceIndex: 1.14,
    forwardGears: 7,
    specialType: 'v10-overboost',
    specialLabel: 'V10 Overboost',
    defaultHeadlightTint: 'crystal-white',
  },
  [CarClassId.FORMULA_E]: {
    id: CarClassId.FORMULA_E,
    name: 'Formula E (GEN3 Evo)',
    shortName: 'FE GEN3',
    category: 'Single-Seater',
    plateColor: '#06b6d4',
    badgeTextColor: '#082f49',
    basePaceIndex: 0.94,
    forwardGears: 1,
    specialType: 'attack-mode',
    specialLabel: 'Attack Mode AWD',
    defaultHeadlightTint: 'ice-blue',
  },
  [CarClassId.TRACK_COUPE]: {
    id: CarClassId.TRACK_COUPE,
    name: 'Production Track Coupes',
    shortName: 'COUPE',
    category: 'Production',
    plateColor: '#f59e0b',
    badgeTextColor: '#111827',
    basePaceIndex: 0.78,
    forwardGears: 6,
    specialType: 'none',
    specialLabel: 'None',
    defaultHeadlightTint: 'crystal-white',
  },
  [CarClassId.SUPERCAR]: {
    id: CarClassId.SUPERCAR,
    name: 'Production Supercars & Hypercars',
    shortName: 'HYPER',
    category: 'Production',
    plateColor: '#a855f7',
    badgeTextColor: '#ffffff',
    basePaceIndex: 0.89,
    forwardGears: 7,
    specialType: 'none',
    specialLabel: 'None',
    defaultHeadlightTint: 'crystal-white',
  },
};

function makeLivery(
  primaryColor: string,
  secondaryColor: string,
  tertiaryColor: string,
  driverNumber: string,
  opts: Partial<LiveryConfig> = {},
): LiveryConfig {
  return {
    primaryColor,
    secondaryColor,
    tertiaryColor,
    rimFinish: opts.rimFinish ?? 'gloss-black',
    template: opts.template ?? 'racing-stripes',
    carbonHood: opts.carbonHood ?? false,
    carbonWing: opts.carbonWing ?? true,
    carbonSplitter: opts.carbonSplitter ?? true,
    driverNumber,
    numberPlateStyle: opts.numberPlateStyle ?? 'auto',
    headlightTint: opts.headlightTint ?? 'crystal-white',
    windshieldBanner: opts.windshieldBanner ?? 'APEX',
  };
}

/**
 * Computes balanced intra-class lap equilibrium index from the 5 BoP attributes.
 * Every car in the same class stays within ~0.5% equilibrium while having distinct trade-offs.
 */
export function computeBoPEquilibriumScore(attrs: BoPAttributes): number {
  return (
    attrs.topSpeed * 0.22 +
    attrs.acceleration * 0.23 +
    attrs.corneringGrip * 0.28 +
    attrs.braking * 0.17 +
    attrs.efficiency * 0.10
  );
}

/**
 * Real-world car metric dimensions (length, width, height, wheelbase in meters).
 * Retains true real-world scale across prototypes, GTs, single-seaters, and road cars.
 */
export const REAL_WORLD_CAR_DIMENSIONS: Record<string, CarDimensions> = {
  // WEC Hypercar / IMSA GTP (~4.90 - 5.05 m)
  'ferrari-499p': { length: 5.00, width: 2.00, height: 1.05, wheelbase: 3.15 },
  'toyota-gr010': { length: 4.90, width: 2.00, height: 1.05, wheelbase: 3.14 },
  'porsche-963': { length: 5.02, width: 2.00, height: 1.05, wheelbase: 3.148 },
  'cadillac-vseries-r': { length: 5.03, width: 2.00, height: 1.05, wheelbase: 3.148 },
  'bmw-m-hybrid-v8': { length: 5.02, width: 2.00, height: 1.05, wheelbase: 3.148 },
  'acura-arx-06': { length: 5.00, width: 2.00, height: 1.05, wheelbase: 3.148 },
  'alpine-a424': { length: 5.00, width: 2.00, height: 1.05, wheelbase: 3.148 },
  'peugeot-9x8': { length: 4.995, width: 2.00, height: 1.05, wheelbase: 3.045 },
  'aston-valkyrie-lmh': { length: 5.00, width: 2.00, height: 1.05, wheelbase: 3.15 },
  'lamborghini-sc63': { length: 5.00, width: 2.00, height: 1.05, wheelbase: 3.148 },
  'genesis-gmr-001': { length: 5.00, width: 2.00, height: 1.05, wheelbase: 3.148 },
  'glickenhaus-scg-007': { length: 4.99, width: 2.00, height: 1.05, wheelbase: 3.15 },

  // LMP2 (~4.75 m)
  'oreca-07': { length: 4.75, width: 1.99, height: 1.05, wheelbase: 3.005 },
  'oreca-07-united': { length: 4.75, width: 1.99, height: 1.05, wheelbase: 3.005 },
  'oreca-07-united-autosports': { length: 4.75, width: 1.99, height: 1.05, wheelbase: 3.005 },
  'oreca-07-europol': { length: 4.75, width: 1.99, height: 1.05, wheelbase: 3.005 },
  'oreca-07-inter-europol': { length: 4.75, width: 1.99, height: 1.05, wheelbase: 3.005 },
  'oreca-07-ao': { length: 4.75, width: 1.99, height: 1.05, wheelbase: 3.005 },
  'oreca-07-ao-racing': { length: 4.75, width: 1.99, height: 1.05, wheelbase: 3.005 },
  'oreca-07-af-corse': { length: 4.75, width: 1.99, height: 1.05, wheelbase: 3.005 },
  'oreca-07-cool': { length: 4.75, width: 1.99, height: 1.05, wheelbase: 3.005 },
  'oreca-07-cool-racing': { length: 4.75, width: 1.99, height: 1.05, wheelbase: 3.005 },
  'oreca-07-algarve': { length: 4.75, width: 1.99, height: 1.05, wheelbase: 3.005 },
  'oreca-07-algarve-pro': { length: 4.75, width: 1.99, height: 1.05, wheelbase: 3.005 },
  'united-autosports': { length: 4.75, width: 1.99, height: 1.05, wheelbase: 3.005 },
  'inter-europol': { length: 4.75, width: 1.99, height: 1.05, wheelbase: 3.005 },
  'ao-racing': { length: 4.75, width: 1.99, height: 1.05, wheelbase: 3.005 },
  'af-corse': { length: 4.75, width: 1.99, height: 1.05, wheelbase: 3.005 },
  'cool-racing': { length: 4.75, width: 1.99, height: 1.05, wheelbase: 3.005 },
  'algarve-pro': { length: 4.75, width: 1.99, height: 1.05, wheelbase: 3.005 },
  'ligier-js-p217': { length: 4.75, width: 1.99, height: 1.05, wheelbase: 3.01 },

  // GTD Pro / LMGT3 (~4.55 - 4.78 m)
  'porsche-911-gt3-r': { length: 4.62, width: 2.04, height: 1.28, wheelbase: 2.51 },
  'ferrari-296-gt3': { length: 4.565, width: 2.05, height: 1.23, wheelbase: 2.60 },
  'corvette-z06-gt3r': { length: 4.71, width: 2.05, height: 1.22, wheelbase: 2.73 },
  'bmw-m4-gt3': { length: 4.75, width: 2.04, height: 1.31, wheelbase: 2.92 },
  'ford-mustang-gt3': { length: 4.78, width: 2.04, height: 1.33, wheelbase: 2.72 },
  'aston-vantage-gt3': { length: 4.55, width: 2.04, height: 1.27, wheelbase: 2.71 },
  'lamborghini-temerario-gt3': { length: 4.70, width: 2.03, height: 1.20, wheelbase: 2.66 },
  'mercedes-amg-gt3': { length: 4.746, width: 2.05, height: 1.24, wheelbase: 2.63 },
  'lexus-rcf-gt3': { length: 4.75, width: 2.03, height: 1.27, wheelbase: 2.73 },
  'mclaren-720s-gt3': { length: 4.664, width: 2.04, height: 1.20, wheelbase: 2.67 },
  'renault-rs01-gt3': { length: 4.71, width: 2.00, height: 1.12, wheelbase: 2.73 },
  'bentley-continental-gt3': { length: 4.76, width: 2.04, height: 1.36, wheelbase: 2.85 },
  'audi-r8-lms-gt3': { length: 4.568, width: 1.995, height: 1.17, wheelbase: 2.65 },
  'acura-nsx-gt3': { length: 4.612, width: 2.04, height: 1.24, wheelbase: 2.63 },

  // GT4 (~4.25 - 4.78 m)
  'porsche-cayman-gt4-rs': { length: 4.456, width: 1.82, height: 1.27, wheelbase: 2.48 },
  'bmw-m4-gt4': { length: 4.76, width: 1.92, height: 1.37, wheelbase: 2.86 },
  'aston-vantage-gt4': { length: 4.49, width: 1.94, height: 1.27, wheelbase: 2.71 },
  'toyota-supra-gt4': { length: 4.46, width: 1.87, height: 1.29, wheelbase: 2.47 },
  'mclaren-artura-gt4': { length: 4.54, width: 1.98, height: 1.19, wheelbase: 2.64 },
  'mercedes-amg-gt4': { length: 4.62, width: 1.99, height: 1.27, wheelbase: 2.63 },
  'alpine-a110-gt4': { length: 4.25, width: 1.80, height: 1.25, wheelbase: 2.42 },
  'ford-mustang-gt4': { length: 4.78, width: 1.96, height: 1.38, wheelbase: 2.72 },

  // Production Track Coupes & Hatchbacks (Clio V6 ~3.84 m .. GT-R ~4.71 m)
  'renault-clio-v6': { length: 3.84, width: 1.81, height: 1.36, wheelbase: 2.53 },
  'bmw-m2-cs': { length: 4.58, width: 1.89, height: 1.40, wheelbase: 2.75 },
  'porsche-911-gt3-rs': { length: 4.57, width: 1.90, height: 1.30, wheelbase: 2.46 },
  'honda-civic-type-r': { length: 4.59, width: 1.89, height: 1.41, wheelbase: 2.735 },
  'corvette-z06-coupe': { length: 4.69, width: 2.02, height: 1.23, wheelbase: 2.72 },
  'nissan-gtr-nismo': { length: 4.71, width: 1.90, height: 1.37, wheelbase: 2.78 },

  // Production Supercars & Hypercars (~4.50 - 4.84 m)
  'aston-valkyrie-road': { length: 4.50, width: 1.99, height: 1.07, wheelbase: 2.77 },
  'ferrari-296-gtb': { length: 4.565, width: 1.96, height: 1.19, wheelbase: 2.60 },
  'mclaren-750s': { length: 4.569, width: 1.93, height: 1.20, wheelbase: 2.67 },
  'mclaren-w1': { length: 4.635, width: 2.07, height: 1.18, wheelbase: 2.68 },
  'porsche-918-spyder': { length: 4.643, width: 1.94, height: 1.17, wheelbase: 2.73 },
  'ferrari-sf90': { length: 4.568, width: 1.952, height: 1.213, wheelbase: 2.65 },
  'ferrari-f80': { length: 4.84, width: 2.06, height: 1.14, wheelbase: 2.77 },

  // Formula E (~5.02 m)
  'fe-porsche-99x': { length: 5.02, width: 1.70, height: 1.02, wheelbase: 2.97 },
  'fe-jaguar-itype7': { length: 5.02, width: 1.70, height: 1.02, wheelbase: 2.97 },
  'fe-nissan-e4orce': { length: 5.02, width: 1.70, height: 1.02, wheelbase: 2.97 },
  'fe-maserati-folgore': { length: 5.02, width: 1.70, height: 1.02, wheelbase: 2.97 },

  // Formula 1 (2026 ~5.50 m, 2021 ~5.63 m, 2005 ~4.65 m)
  'f1-26-mercedes': { length: 5.50, width: 1.90, height: 0.95, wheelbase: 3.40 },
  'f1-26-ferrari': { length: 5.50, width: 1.90, height: 0.95, wheelbase: 3.40 },
  'f1-26-redbull': { length: 5.50, width: 1.90, height: 0.95, wheelbase: 3.40 },
  'f1-26-mclaren': { length: 5.50, width: 1.90, height: 0.95, wheelbase: 3.40 },
  'f1-26-aston': { length: 5.50, width: 1.90, height: 0.95, wheelbase: 3.40 },
  'f1-26-williams': { length: 5.50, width: 1.90, height: 0.95, wheelbase: 3.40 },
  'f1-26-alpine': { length: 5.50, width: 1.90, height: 0.95, wheelbase: 3.40 },
  'f1-26-haas': { length: 5.50, width: 1.90, height: 0.95, wheelbase: 3.40 },
  'f1-26-audi': { length: 5.50, width: 1.90, height: 0.95, wheelbase: 3.40 },
  'f1-26-racing-bulls': { length: 5.50, width: 1.90, height: 0.95, wheelbase: 3.40 },
  'f1-26-cadillac': { length: 5.50, width: 1.90, height: 0.95, wheelbase: 3.40 },
  'f1-21-mercedes': { length: 5.63, width: 2.00, height: 0.95, wheelbase: 3.60 },
  'f1-21-redbull': { length: 5.63, width: 2.00, height: 0.95, wheelbase: 3.60 },
  'f1-21-ferrari': { length: 5.63, width: 2.00, height: 0.95, wheelbase: 3.60 },
  'f1-21-mclaren': { length: 5.63, width: 2.00, height: 0.95, wheelbase: 3.60 },
  'f1-21-alpine': { length: 5.63, width: 2.00, height: 0.95, wheelbase: 3.60 },
  'f1-21-alphatauri': { length: 5.63, width: 2.00, height: 0.95, wheelbase: 3.60 },
  'f1-21-aston': { length: 5.63, width: 2.00, height: 0.95, wheelbase: 3.60 },
  'f1-21-williams': { length: 5.63, width: 2.00, height: 0.95, wheelbase: 3.60 },
  'f1-21-alfa': { length: 5.63, width: 2.00, height: 0.95, wheelbase: 3.60 },
  'f1-21-haas': { length: 5.63, width: 2.00, height: 0.95, wheelbase: 3.60 },
  'f1-05-renault': { length: 4.65, width: 1.80, height: 0.95, wheelbase: 3.10 },
  'f1-05-mclaren': { length: 4.65, width: 1.80, height: 0.95, wheelbase: 3.10 },
  'f1-05-ferrari': { length: 4.65, width: 1.80, height: 0.95, wheelbase: 3.10 },
  'f1-05-williams': { length: 4.65, width: 1.80, height: 0.95, wheelbase: 3.10 },
};

export const REAL_WORLD_CAR_LENGTHS: Record<string, number> = Object.fromEntries(
  Object.entries(REAL_WORLD_CAR_DIMENSIONS).map(([k, v]) => [k, v.length]),
);

export function getRealWorldCarDimensions(carId?: string, classId?: CarClassId): CarDimensions {
  if (carId) {
    const direct = REAL_WORLD_CAR_DIMENSIONS[carId];
    if (direct) return { ...direct };
    const normalized = carId.toLowerCase().replace(/_/g, '-');
    if (REAL_WORLD_CAR_DIMENSIONS[normalized]) return { ...REAL_WORLD_CAR_DIMENSIONS[normalized] };
    if (normalized.includes('clio')) return { length: 3.84, width: 1.81, height: 1.36, wheelbase: 2.53 };
    if (normalized.startsWith('f1-05')) return { length: 4.65, width: 1.80, height: 0.95, wheelbase: 3.10 };
    if (normalized.startsWith('f1-21')) return { length: 5.63, width: 2.00, height: 0.95, wheelbase: 3.60 };
    if (normalized.startsWith('f1-26') || normalized.startsWith('f1-')) return { length: 5.50, width: 1.90, height: 0.95, wheelbase: 3.40 };
    if (normalized.startsWith('fe-')) return { length: 5.02, width: 1.70, height: 1.02, wheelbase: 2.97 };
    if (
      normalized.includes('oreca') ||
      normalized.includes('ligier') ||
      normalized.includes('united') ||
      normalized.includes('europol') ||
      normalized.includes('ao-racing') ||
      normalized.includes('corse') ||
      normalized.includes('cool') ||
      normalized.includes('algarve')
    ) {
      return { length: 4.75, width: 1.99, height: 1.05, wheelbase: 3.005 };
    }
    if (normalized.includes('gt4')) return { length: 4.55, width: 1.92, height: 1.28, wheelbase: 2.65 };
    if (normalized.includes('gt3')) return { length: 4.68, width: 2.04, height: 1.25, wheelbase: 2.70 };
  }
  switch (classId) {
    case CarClassId.F1_2026:
      return { length: 5.50, width: 1.90, height: 0.95, wheelbase: 3.40 };
    case CarClassId.F1_2021:
      return { length: 5.63, width: 2.00, height: 0.95, wheelbase: 3.60 };
    case CarClassId.F1_2005:
      return { length: 4.65, width: 1.80, height: 0.95, wheelbase: 3.10 };
    case CarClassId.FORMULA_E:
      return { length: 5.02, width: 1.70, height: 1.02, wheelbase: 2.97 };
    case CarClassId.HYPERCAR_GTP:
      return { length: 5.00, width: 2.00, height: 1.05, wheelbase: 3.15 };
    case CarClassId.LMP2:
      return { length: 4.75, width: 1.99, height: 1.05, wheelbase: 3.005 };
    case CarClassId.GT3:
      return { length: 4.68, width: 2.04, height: 1.25, wheelbase: 2.70 };
    case CarClassId.GT4:
      return { length: 4.55, width: 1.92, height: 1.28, wheelbase: 2.65 };
    case CarClassId.TRACK_COUPE:
      return { length: 4.45, width: 1.88, height: 1.35, wheelbase: 2.65 };
    case CarClassId.SUPERCAR:
      return { length: 4.65, width: 2.00, height: 1.18, wheelbase: 2.70 };
    default:
      return { length: 4.65, width: 2.00, height: 1.20, wheelbase: 2.70 };
  }
}

export function getRealWorldCarLength(carId?: string, classId?: CarClassId): number {
  return getRealWorldCarDimensions(carId, classId).length;
}

export const CARS: CarSpec[] = [
  // ================= WEC HYPERCAR / IMSA GTP (12 cars) =================
  {
    id: 'ferrari-499p',
    name: 'Ferrari 499P',
    manufacturer: 'Ferrari',
    classId: CarClassId.HYPERCAR_GTP,
    silhouette: 'prototype',
    attributes: { topSpeed: 88, acceleration: 87, corneringGrip: 85, braking: 84, efficiency: 81 },
    tradeoffNote: 'Blistering straight-line punch and strong traction; higher tire deg in long stints.',
    engineType: 'v6-hybrid',
    soundProfile: 'gtp_turbo_v6',
    defaultLivery: makeLivery('#c8102e', '#facc15', '#ffffff', '51', { template: 'racing-stripes', rimFinish: 'gold-bronze' }),
  },
  {
    id: 'toyota-gr010',
    name: 'Toyota GR010 Hybrid',
    manufacturer: 'Toyota',
    classId: CarClassId.HYPERCAR_GTP,
    silhouette: 'prototype',
    attributes: { topSpeed: 84, acceleration: 85, corneringGrip: 86, braking: 86, efficiency: 91 },
    tradeoffNote: 'Metronomic stint consistency and gentle tire wear; slightly softer peak vmax.',
    engineType: 'v6-hybrid',
    soundProfile: 'gtp_turbo_v6',
    defaultLivery: makeLivery('#111827', '#ef4444', '#ffffff', '7', { template: 'two-tone', carbonHood: true }),
  },
  {
    id: 'porsche-963',
    name: 'Porsche 963',
    manufacturer: 'Porsche',
    classId: CarClassId.HYPERCAR_GTP,
    silhouette: 'prototype',
    attributes: { topSpeed: 85, acceleration: 86, corneringGrip: 86, braking: 87, efficiency: 85 },
    tradeoffNote: 'All-round chassis poise and late-braking stability across bumpy street circuits.',
    engineType: 'v8-hybrid',
    soundProfile: 'gtp_turbo_v8',
    defaultLivery: makeLivery('#dc2626', '#ffffff', '#0f172a', '6', { template: 'heritage', rimFinish: 'gloss-black' }),
  },
  {
    id: 'cadillac-vseries-r',
    name: 'Cadillac V-Series.R',
    manufacturer: 'Cadillac',
    classId: CarClassId.HYPERCAR_GTP,
    silhouette: 'prototype',
    attributes: { topSpeed: 89, acceleration: 89, corneringGrip: 82, braking: 84, efficiency: 83 },
    tradeoffNote: 'Ferocious naturally-aspirated V8 torque and top speed; heavier front wash in long sweepers.',
    engineType: 'v8-hybrid',
    soundProfile: 'cadillac_v8_hybrid',
    gears: 6,
    defaultLivery: makeLivery('#facc15', '#0f172a', '#ef4444', '01', { template: 'geometric', rimFinish: 'gloss-black' }),
  },
  {
    id: 'bmw-m-hybrid-v8',
    name: 'BMW M Hybrid V8',
    manufacturer: 'BMW',
    classId: CarClassId.HYPERCAR_GTP,
    silhouette: 'prototype',
    attributes: { topSpeed: 87, acceleration: 86, corneringGrip: 84, braking: 87, efficiency: 82 },
    tradeoffNote: 'Strong threshold braking and curb compliance; moderate aero efficiency.',
    engineType: 'v8-hybrid',
    soundProfile: 'gtp_turbo_v8',
    defaultLivery: makeLivery('#ffffff', '#1d4ed8', '#dc2626', '24', { template: 'geometric', rimFinish: 'silver' }),
  },
  {
    id: 'acura-arx-06',
    name: 'Acura ARX-06',
    manufacturer: 'Acura',
    classId: CarClassId.HYPERCAR_GTP,
    silhouette: 'prototype',
    attributes: { topSpeed: 83, acceleration: 88, corneringGrip: 88, braking: 85, efficiency: 82 },
    tradeoffNote: 'High-downforce cornering knife with explosive hairpin exit; lower top-end drag ceiling.',
    engineType: 'v6-hybrid',
    soundProfile: 'gtp_turbo_v6',
    defaultLivery: makeLivery('#1e293b', '#ef4444', '#38bdf8', '10', { template: 'two-tone', rimFinish: 'silver' }),
  },
  {
    id: 'alpine-a424',
    name: 'Alpine A424',
    manufacturer: 'Alpine',
    classId: CarClassId.HYPERCAR_GTP,
    silhouette: 'prototype',
    attributes: { topSpeed: 87, acceleration: 84, corneringGrip: 86, braking: 85, efficiency: 85 },
    tradeoffNote: 'Slippery aero efficiency on long straights; slightly softer initial launch.',
    engineType: 'v6-hybrid',
    soundProfile: 'gtp_turbo_v6',
    defaultLivery: makeLivery('#1d4ed8', '#ef4444', '#ffffff', '35', { template: 'racing-stripes', rimFinish: 'gloss-black' }),
  },
  {
    id: 'peugeot-9x8',
    name: 'Peugeot 9X8',
    manufacturer: 'Peugeot',
    classId: CarClassId.HYPERCAR_GTP,
    silhouette: 'prototype',
    attributes: { topSpeed: 83, acceleration: 84, corneringGrip: 89, braking: 86, efficiency: 86 },
    tradeoffNote: 'Ground-effect apex speed specialist; trades raw straight speed for rapid mid-corner rotation.',
    engineType: 'v6-hybrid',
    soundProfile: 'gtp_turbo_v6',
    defaultLivery: makeLivery('#cbd5e1', '#84cc16', '#0f172a', '93', { template: 'geometric', carbonHood: true }),
  },
  {
    id: 'aston-valkyrie-lmh',
    name: 'Aston Martin Valkyrie AMR-LMH',
    manufacturer: 'Aston Martin',
    classId: CarClassId.HYPERCAR_GTP,
    silhouette: 'prototype',
    attributes: { topSpeed: 90, acceleration: 84, corneringGrip: 87, braking: 83, efficiency: 80 },
    tradeoffNote: 'Featherweight V12 top-end screamer with rapid direction change; shorter braking margin.',
    engineType: 'v12',
    soundProfile: 'gtp_na_v12',
    specialTypeOverride: 'rich-fuel-overboost',
    specialLabelOverride: 'Rich Fuel Overboost',
    defaultLivery: makeLivery('#065f46', '#a3e635', '#ffffff', '007', { template: 'racing-stripes', rimFinish: 'gold-bronze' }),
  },
  {
    id: 'lamborghini-sc63',
    name: 'Lamborghini SC63',
    manufacturer: 'Lamborghini',
    classId: CarClassId.HYPERCAR_GTP,
    silhouette: 'prototype',
    attributes: { topSpeed: 86, acceleration: 85, corneringGrip: 85, braking: 88, efficiency: 83 },
    tradeoffNote: 'Confident deep braking zones and rear stability; modest mid-range pull.',
    engineType: 'v8-hybrid',
    soundProfile: 'gtp_turbo_v8',
    defaultLivery: makeLivery('#65a30d', '#111827', '#ef4444', '63', { template: 'two-tone', carbonHood: true }),
  },
  {
    id: 'genesis-gmr-001',
    name: 'Genesis GMR-001',
    manufacturer: 'Genesis',
    classId: CarClassId.HYPERCAR_GTP,
    silhouette: 'prototype',
    attributes: { topSpeed: 86, acceleration: 87, corneringGrip: 85, braking: 84, efficiency: 86 },
    tradeoffNote: 'Punchy hybrid deployment out of chicanes with tidy tire preservation.',
    engineType: 'v8-hybrid',
    soundProfile: 'gtp_turbo_v8',
    defaultLivery: makeLivery('#ea580c', '#18181b', '#f8fafc', '88', { template: 'heritage', rimFinish: 'gloss-black' }),
  },
  {
    id: 'glickenhaus-scg-007',
    name: 'Glickenhaus SCG 007',
    manufacturer: 'Glickenhaus',
    classId: CarClassId.HYPERCAR_GTP,
    silhouette: 'prototype',
    attributes: { topSpeed: 88, acceleration: 83, corneringGrip: 85, braking: 86, efficiency: 89 },
    tradeoffNote: 'Non-hybrid mechanical purity: ultra-light on fuel and tires, slightly slower off slow corners.',
    engineType: 'v8',
    soundProfile: 'gtp_na_v8',
    specialTypeOverride: 'rich-fuel-overboost',
    specialLabelOverride: 'Rich Fuel Overboost',
    defaultLivery: makeLivery('#0284c7', '#ffffff', '#dc2626', '708', { template: 'heritage', rimFinish: 'white' }),
  },

  // ================= LMP2 PROTOTYPE (Oreca 07 Gibson) =================
  {
    id: 'oreca-07',
    name: 'Oreca 07 Gibson',
    manufacturer: 'Oreca',
    classId: CarClassId.LMP2,
    silhouette: 'lmp2',
    modelId: 'oreca-07',
    attributes: { topSpeed: 81, acceleration: 81, corneringGrip: 82, braking: 82, efficiency: 84 },
    tradeoffNote: 'Spec benchmark LMP2 prototype with naturally aspirated 4.2L Gibson V8 and versatile aero configuration.',
    engineType: 'v8',
    soundProfile: 'lmp2_gibson_v8',
    gears: 6,
    defaultLivery: makeLivery('#FF6B00', '#0052A5', '#111111', '22', { template: 'two-tone', rimFinish: 'gloss-black' }),
    liveries: [
      {
        id: 'united-autosports',
        name: 'Oreca 07 — United Autosports',
        team: 'United Autosports',
        livery: makeLivery('#FF6B00', '#0052A5', '#111111', '22', { template: 'two-tone', rimFinish: 'gloss-black' }),
      },
      {
        id: 'inter-europol',
        name: 'Oreca 07 — Inter Europol Competition',
        team: 'Inter Europol Competition',
        livery: makeLivery('#FFD100', '#00843D', '#FFFFFF', '34', { template: 'geometric', rimFinish: 'silver' }),
      },
      {
        id: 'ao-racing',
        name: 'Oreca 07 — AO Racing "Spike"',
        team: 'AO Racing',
        livery: makeLivery('#6A2C91', '#FF6A00', '#111111', '99', { template: 'racing-stripes', rimFinish: 'gloss-black' }),
      },
      {
        id: 'af-corse',
        name: 'Oreca 07 — AF Corse',
        team: 'AF Corse',
        livery: makeLivery('#D52B1E', '#FFFFFF', '#C0C0C0', '83', { template: 'racing-stripes', rimFinish: 'silver' }),
      },
      {
        id: 'cool-racing',
        name: 'Oreca 07 — COOL Racing',
        team: 'COOL Racing',
        livery: makeLivery('#0055B8', '#FFFFFF', '#111111', '37', { template: 'geometric', rimFinish: 'white' }),
      },
      {
        id: 'algarve-pro',
        name: 'Oreca 07 — Algarve Pro Racing',
        team: 'Algarve Pro Racing',
        livery: makeLivery('#111111', '#FF6600', '#FFFFFF', '25', { template: 'two-tone', rimFinish: 'gloss-black' }),
      },
    ],
  },

  // ================= GTD Pro / GTD / LMGT3 (10 cars) =================
  {
    id: 'porsche-911-gt3-r',
    name: 'Porsche 911 GT3 R (992)',
    manufacturer: 'Porsche',
    classId: CarClassId.GT3,
    silhouette: 'gt',
    attributes: { topSpeed: 74, acceleration: 79, corneringGrip: 81, braking: 82, efficiency: 79 },
    tradeoffNote: 'Rear-engine traction monster on corner exit and late braking; trims top speed on long chutes.',
    engineType: 'flat6',
    soundProfile: 'gt3_flat6',
    defaultLivery: makeLivery('#f8fafc', '#16a34a', '#111827', '911', { template: 'heritage', rimFinish: 'gold-bronze', headlightTint: 'endurance-yellow' }),
  },
  {
    id: 'ferrari-296-gt3',
    name: 'Ferrari 296 GT3',
    manufacturer: 'Ferrari',
    classId: CarClassId.GT3,
    silhouette: 'gt',
    attributes: { topSpeed: 77, acceleration: 78, corneringGrip: 81, braking: 79, efficiency: 78 },
    tradeoffNote: 'Agile mid-engine balance in fast sweepers with crisp aero efficiency.',
    engineType: 'v6',
    soundProfile: 'gt3_turbo_v6',
    defaultLivery: makeLivery('#dc2626', '#facc15', '#ffffff', '62', { template: 'racing-stripes', headlightTint: 'endurance-yellow' }),
  },
  {
    id: 'corvette-z06-gt3r',
    name: 'Chevrolet Corvette Z06 GT3.R',
    manufacturer: 'Chevrolet',
    classId: CarClassId.GT3,
    silhouette: 'gt',
    attributes: { topSpeed: 79, acceleration: 80, corneringGrip: 77, braking: 79, efficiency: 80 },
    tradeoffNote: 'Flat-plane V8 top-end pull and long-stint balance; demands patience on initial turn-in.',
    engineType: 'v8',
    soundProfile: 'gt3_flatplane_v8',
    defaultLivery: makeLivery('#facc15', '#18181b', '#dc2626', '3', { template: 'two-tone', carbonHood: true, headlightTint: 'endurance-yellow' }),
  },
  {
    id: 'bmw-m4-gt3',
    name: 'BMW M4 GT3',
    manufacturer: 'BMW',
    classId: CarClassId.GT3,
    silhouette: 'gt',
    attributes: { topSpeed: 78, acceleration: 77, corneringGrip: 79, braking: 81, efficiency: 81 },
    tradeoffNote: 'Long-wheelbase stability over aggressive kerbs and gentle front tire wear.',
    engineType: 'turbo-i6',
    soundProfile: 'gt3_turbo_i6',
    defaultLivery: makeLivery('#ffffff', '#2563eb', '#ef4444', '1', { template: 'geometric', headlightTint: 'endurance-yellow' }),
  },
  {
    id: 'ford-mustang-gt3',
    name: 'Ford Mustang GT3',
    manufacturer: 'Ford',
    classId: CarClassId.GT3,
    silhouette: 'gt',
    attributes: { topSpeed: 81, acceleration: 79, corneringGrip: 76, braking: 78, efficiency: 80 },
    tradeoffNote: 'Roaring Coyote V8 straight-line bruiser; wider arc through tight hairpins.',
    engineType: 'v8',
    soundProfile: 'gt3_crossplane_v8',
    defaultLivery: makeLivery('#1d4ed8', '#ffffff', '#ef4444', '64', { template: 'racing-stripes', headlightTint: 'endurance-yellow' }),
  },
  {
    id: 'aston-vantage-gt3',
    name: 'Aston Martin Vantage GT3',
    manufacturer: 'Aston Martin',
    classId: CarClassId.GT3,
    silhouette: 'gt',
    attributes: { topSpeed: 77, acceleration: 78, corneringGrip: 79, braking: 80, efficiency: 81 },
    tradeoffNote: 'Predictable front-engine composure in wet and dry transitions.',
    engineType: 'v8',
    soundProfile: 'gt3_turbo_v8',
    defaultLivery: makeLivery('#047857', '#bef264', '#111827', '27', { template: 'two-tone', rimFinish: 'gloss-black', headlightTint: 'endurance-yellow' }),
  },
  {
    id: 'lamborghini-temerario-gt3',
    name: 'Lamborghini Huracan GT3',
    manufacturer: 'Lamborghini',
    classId: CarClassId.GT3,
    silhouette: 'gt',
    attributes: { topSpeed: 78, acceleration: 80, corneringGrip: 79, braking: 78, efficiency: 76 },
    tradeoffNote: 'Explosive mid-corner rotation and launch punch; works rear tires hard.',
    engineType: 'v10',
    soundProfile: 'gt3_v10',
    defaultLivery: makeLivery('#84cc16', '#0f172a', '#ffffff', '19', { template: 'geometric', headlightTint: 'endurance-yellow' }),
  },
  {
    id: 'mercedes-amg-gt3',
    name: 'Mercedes-AMG GT3',
    manufacturer: 'Mercedes-AMG',
    classId: CarClassId.GT3,
    silhouette: 'gt',
    attributes: { topSpeed: 76, acceleration: 77, corneringGrip: 80, braking: 82, efficiency: 82 },
    tradeoffNote: 'Bulletproof braking stability and planted front nose over bumps.',
    engineType: 'v8',
    soundProfile: 'gt3_crossplane_v8',
    defaultLivery: makeLivery('#94a3b8', '#06b6d4', '#0f172a', '57', { template: 'heritage', rimFinish: 'silver', headlightTint: 'endurance-yellow' }),
  },
  {
    id: 'lexus-rcf-gt3',
    name: 'Lexus RC F GT3',
    manufacturer: 'Lexus',
    classId: CarClassId.GT3,
    silhouette: 'gt',
    attributes: { topSpeed: 79, acceleration: 77, corneringGrip: 77, braking: 80, efficiency: 83 },
    tradeoffNote: 'Durable V8 endurance cruiser with forgiving slide recovery.',
    engineType: 'v8',
    soundProfile: 'gt3_crossplane_v8',
    defaultLivery: makeLivery('#0f172a', '#2563eb', '#f8fafc', '14', { template: 'two-tone', headlightTint: 'endurance-yellow' }),
  },
  {
    id: 'mclaren-720s-gt3',
    name: 'McLaren 720S GT3',
    manufacturer: 'McLaren',
    classId: CarClassId.GT3,
    silhouette: 'gt',
    attributes: { topSpeed: 76, acceleration: 78, corneringGrip: 82, braking: 79, efficiency: 76 },
    tradeoffNote: 'Razor-sharp front aero bite in fast chicanes; sensitive to hot track temps.',
    engineType: 'v8',
    soundProfile: 'gt3_turbo_v8',
    defaultLivery: makeLivery('#f97316', '#0f172a', '#38bdf8', '59', { template: 'geometric', carbonHood: true, headlightTint: 'endurance-yellow' }),
  },
  {
    id: 'renault-rs01-gt3',
    name: 'Renault Sport R.S. 01 GT3',
    manufacturer: 'Renault',
    classId: CarClassId.GT3,
    silhouette: 'gt',
    attributes: { topSpeed: 78, acceleration: 79, corneringGrip: 80, braking: 79, efficiency: 77 },
    tradeoffNote: 'LMP1-derived carbon monocoque & massive downforce; heavier GT3 BoP ballast.',
    engineType: 'v6',
    soundProfile: 'gt3_turbo_v6',
    gears: 7,
    defaultLivery: makeLivery('#facc15', '#111827', '#ffffff', '21', { template: 'two-tone', rimFinish: 'gloss-black', headlightTint: 'endurance-yellow' }),
  },
  {
    id: 'bentley-continental-gt3',
    name: 'Bentley Continental GT3',
    manufacturer: 'Bentley',
    classId: CarClassId.GT3,
    silhouette: 'gt',
    attributes: { topSpeed: 82, acceleration: 79, corneringGrip: 75, braking: 78, efficiency: 82 },
    tradeoffNote: 'Massive 4.0L twin-turbo V8 torque & straight-line stability; heavy curb weight in tight chicanes.',
    engineType: 'v8',
    soundProfile: 'gt3_turbo_v8',
    defaultLivery: makeLivery('#064e3b', '#ffffff', '#a3e635', '7', { template: 'heritage', rimFinish: 'gloss-black', headlightTint: 'endurance-yellow' }),
  },
  {
    id: 'audi-r8-lms-gt3',
    name: 'Audi R8 LMS GT3 EVO II',
    manufacturer: 'Audi',
    classId: CarClassId.GT3,
    silhouette: 'gt',
    attributes: { topSpeed: 77, acceleration: 78, corneringGrip: 80, braking: 80, efficiency: 79 },
    tradeoffNote: 'Naturally aspirated 5.2L V10 throttle response & sharp mid-engine turn-in.',
    engineType: 'v10',
    soundProfile: 'gt3_v10',
    defaultLivery: makeLivery('#cbd5e1', '#dc2626', '#111827', '29', { template: 'geometric', rimFinish: 'gloss-black', headlightTint: 'endurance-yellow' }),
  },
  {
    id: 'acura-nsx-gt3',
    name: 'Acura NSX GT3 Evo22',
    manufacturer: 'Acura',
    classId: CarClassId.GT3,
    silhouette: 'gt',
    attributes: { topSpeed: 76, acceleration: 80, corneringGrip: 79, braking: 80, efficiency: 80 },
    tradeoffNote: 'Twin-turbo V6 corner-exit punch & balanced endurance chassis.',
    engineType: 'v6',
    soundProfile: 'gt3_turbo_v6',
    defaultLivery: makeLivery('#dc2626', '#111827', '#f8fafc', '93', { template: 'two-tone', rimFinish: 'gloss-black', headlightTint: 'endurance-yellow' }),
  },

  // ================= GT4 EUROPEAN / IMSA GS (8 cars) =================
  {
    id: 'porsche-cayman-gt4-rs',
    name: 'Porsche 718 Cayman GT4 RS Clubsport',
    manufacturer: 'Porsche',
    classId: CarClassId.GT4,
    silhouette: 'gt',
    attributes: { topSpeed: 68, acceleration: 71, corneringGrip: 75, braking: 74, efficiency: 84 },
    tradeoffNote: '911 GT3-derived 9,000 RPM 4.0L flat-six & sharp mid-engine balance.',
    engineType: 'flat6',
    soundProfile: 'gt4_flat6',
    defaultLivery: makeLivery('#e2e8f0', '#0284c7', '#0f172a', '82', { template: 'two-tone', rimFinish: 'gloss-black' }),
  },
  {
    id: 'bmw-m4-gt4',
    name: 'BMW M4 GT4 G82',
    manufacturer: 'BMW',
    classId: CarClassId.GT4,
    silhouette: 'gt',
    attributes: { topSpeed: 72, acceleration: 71, corneringGrip: 71, braking: 73, efficiency: 84 },
    tradeoffNote: 'Twin-turbo S58 torque & high-speed stability; longer braking zones.',
    engineType: 'turbo-i6',
    soundProfile: 'gt4_turbo_i6',
    defaultLivery: makeLivery('#ffffff', '#2563eb', '#dc2626', '11', { template: 'geometric', rimFinish: 'gloss-black' }),
  },
  {
    id: 'aston-vantage-gt4',
    name: 'Aston Martin Vantage GT4',
    manufacturer: 'Aston Martin',
    classId: CarClassId.GT4,
    silhouette: 'gt',
    attributes: { topSpeed: 71, acceleration: 70, corneringGrip: 73, braking: 73, efficiency: 85 },
    tradeoffNote: '4.0L twin-turbo V8 endurance reliability & smooth aerodynamic platform.',
    engineType: 'v8',
    soundProfile: 'gt4_turbo_v8',
    defaultLivery: makeLivery('#064e3b', '#a3e635', '#111827', '97', { template: 'heritage', rimFinish: 'gold-bronze' }),
  },
  {
    id: 'toyota-supra-gt4',
    name: 'Toyota GR Supra GT4 EVO',
    manufacturer: 'Toyota',
    classId: CarClassId.GT4,
    silhouette: 'gt',
    attributes: { topSpeed: 70, acceleration: 72, corneringGrip: 72, braking: 72, efficiency: 85 },
    tradeoffNote: 'Agile short-wheelbase turn-in & responsive inline-6 turbo punch.',
    engineType: 'turbo-i6',
    soundProfile: 'gt4_turbo_i6',
    defaultLivery: makeLivery('#ffffff', '#dc2626', '#111827', '52', { template: 'two-tone', rimFinish: 'gloss-black' }),
  },
  {
    id: 'mclaren-artura-gt4',
    name: 'McLaren Artura GT4',
    manufacturer: 'McLaren',
    classId: CarClassId.GT4,
    silhouette: 'gt',
    attributes: { topSpeed: 69, acceleration: 72, corneringGrip: 74, braking: 73, efficiency: 83 },
    tradeoffNote: 'Carbon monocell lightweight agility & 120-degree twin-turbo V6 punch.',
    engineType: 'v6',
    soundProfile: 'gt4_turbo_v6',
    defaultLivery: makeLivery('#ea580c', '#111827', '#0284c7', '27', { template: 'geometric', rimFinish: 'gloss-black' }),
  },
  {
    id: 'mercedes-amg-gt4',
    name: 'Mercedes-AMG GT4',
    manufacturer: 'Mercedes-AMG',
    classId: CarClassId.GT4,
    silhouette: 'gt',
    attributes: { topSpeed: 71, acceleration: 70, corneringGrip: 72, braking: 74, efficiency: 85 },
    tradeoffNote: '4.0L twin-turbo V8 torque & bombproof endurance traction control.',
    engineType: 'v8',
    soundProfile: 'gt4_turbo_v8',
    defaultLivery: makeLivery('#cbd5e1', '#0284c7', '#111827', '48', { template: 'racing-stripes', rimFinish: 'silver' }),
  },
  {
    id: 'alpine-a110-gt4',
    name: 'Alpine A110 GT4+',
    manufacturer: 'Alpine',
    classId: CarClassId.GT4,
    silhouette: 'gt',
    attributes: { topSpeed: 67, acceleration: 71, corneringGrip: 76, braking: 74, efficiency: 87 },
    tradeoffNote: 'Ultra-lightweight 1,080kg featherweight chassis & exceptional tire preservation.',
    engineType: 'turbo-i4',
    soundProfile: 'gt4_turbo_i4',
    defaultLivery: makeLivery('#2563eb', '#ffffff', '#dc2626', '36', { template: 'heritage', rimFinish: 'white' }),
  },
  {
    id: 'ford-mustang-gt4',
    name: 'Ford Mustang GT4',
    manufacturer: 'Ford',
    classId: CarClassId.GT4,
    silhouette: 'gt',
    attributes: { topSpeed: 73, acceleration: 71, corneringGrip: 70, braking: 72, efficiency: 84 },
    tradeoffNote: '5.0L Coyote V8 roar & straight-line speed; heavier tire wear in tight hairpins.',
    engineType: 'v8',
    soundProfile: 'gt4_crossplane_v8',
    defaultLivery: makeLivery('#1e3a8a', '#ffffff', '#dc2626', '55', { template: 'racing-stripes', rimFinish: 'gloss-black' }),
  },

  // ================= FORMULA 1 — 2026 SPEC =================
  {
    id: 'f1-26-mercedes',
    name: 'Mercedes-AMG W17 (2026)',
    manufacturer: 'Mercedes',
    classId: CarClassId.F1_2026,
    silhouette: 'formula',
    modelId: 'f1-26-mercedes',
    attributes: { topSpeed: 93, acceleration: 93, corneringGrip: 93, braking: 93, efficiency: 90 },
    tradeoffNote: 'Active Aero 2026 regulation challenger with 50/50 ICE-MGU-K power unit and Z-mode/X-mode active aerodynamics.',
    engineType: 'v6-hybrid',
    soundProfile: 'f1_v6_hybrid',
    gears: 8,
    defaultLivery: makeLivery('#00D2BE', '#C0C0C0', '#111111', '63', { template: 'geometric' }),
    liveries: [
      {
        id: 'f1-26-mercedes',
        name: 'Mercedes-AMG Petronas W17',
        team: 'Mercedes-AMG',
        livery: makeLivery('#00D2BE', '#C0C0C0', '#111111', '63', { template: 'geometric' }),
      },
      {
        id: 'f1-26-ferrari',
        name: 'Scuderia Ferrari SF-26',
        team: 'Ferrari',
        livery: makeLivery('#D52E37', '#FFF200', '#111111', '16', { template: 'racing-stripes', rimFinish: 'gloss-black' }),
      },
      {
        id: 'f1-26-mclaren',
        name: 'McLaren MCL40',
        team: 'McLaren',
        livery: makeLivery('#FF8000', '#1A1A1A', '#0090FF', '4', { template: 'two-tone', carbonHood: true }),
      },
      {
        id: 'f1-26-redbull',
        name: 'Oracle Red Bull Racing RB22',
        team: 'Red Bull Racing',
        livery: makeLivery('#1E2B4D', '#DC0000', '#FCD700', '1', { template: 'heritage' }),
      },
      {
        id: 'f1-26-aston',
        name: 'Aston Martin Aramco AMR26',
        team: 'Aston Martin',
        livery: makeLivery('#006F62', '#CEDC00', '#111111', '14', { template: 'racing-stripes' }),
      },
      {
        id: 'f1-26-williams',
        name: 'Williams Racing FW48',
        team: 'Williams',
        livery: makeLivery('#005AFF', '#00A3E0', '#FFFFFF', '23', { template: 'two-tone' }),
      },
      {
        id: 'f1-26-alpine',
        name: 'BWT Alpine F1 A526',
        team: 'Alpine',
        livery: makeLivery('#0090FF', '#FF4FA3', '#111111', '10', { template: 'geometric' }),
      },
      {
        id: 'f1-26-haas',
        name: 'MoneyGram Haas VF-26',
        team: 'Haas',
        livery: makeLivery('#FFFFFF', '#111111', '#E6002B', '87', { template: 'two-tone', carbonHood: true }),
      },
      {
        id: 'f1-26-audi',
        name: 'Audi Revolut R26',
        team: 'Audi',
        livery: makeLivery('#C8C8C8', '#EB4526', '#111111', '27', { template: 'geometric', carbonHood: true }),
      },
      {
        id: 'f1-26-cadillac',
        name: 'Cadillac Formula 1',
        team: 'Cadillac',
        livery: makeLivery('#111111', '#E5E5E5', '#D4AF37', '11', { template: 'racing-stripes', rimFinish: 'gold-bronze' }),
      },
      {
        id: 'f1-26-racing-bulls',
        name: 'Visa Cash App RB VCARB 03',
        team: 'Racing Bulls',
        livery: makeLivery('#FFFFFF', '#1F459C', '#DC0000', '22', { template: 'heritage', rimFinish: 'white' }),
      },
    ],
  },

  // ================= FORMULA 1 — 2021 SPEC =================
  {
    id: 'f1-21-mercedes',
    name: 'Mercedes-AMG W12 (2021)',
    manufacturer: 'Mercedes',
    classId: CarClassId.F1_2021,
    silhouette: 'formula',
    modelId: 'f1-21-mercedes',
    attributes: { topSpeed: 94, acceleration: 94, corneringGrip: 97, braking: 96, efficiency: 89 },
    tradeoffNote: 'Peak floor-downforce 2021 titan with complex bargeboards, razor-sharp turn-in and planted rear stability.',
    engineType: 'v6-hybrid',
    soundProfile: 'f1_v6_hybrid',
    gears: 8,
    defaultLivery: makeLivery('#111111', '#00D2BE', '#C0C0C0', '44', { template: 'heritage' }),
    liveries: [
      {
        id: 'f1-21-mercedes',
        name: 'Mercedes-AMG Petronas W12',
        team: 'Mercedes',
        livery: makeLivery('#111111', '#00D2BE', '#C0C0C0', '44', { template: 'heritage' }),
      },
      {
        id: 'f1-21-redbull',
        name: 'Red Bull Racing Honda RB16B',
        team: 'Red Bull',
        livery: makeLivery('#1E2B4D', '#DC0000', '#FCD700', '33', { template: 'two-tone' }),
      },
      {
        id: 'f1-21-ferrari',
        name: 'Scuderia Ferrari SF21',
        team: 'Ferrari',
        livery: makeLivery('#DC0000', '#7A0019', '#FFFFFF', '55', { template: 'two-tone' }),
      },
      {
        id: 'f1-21-mclaren',
        name: 'McLaren F1 Team MCL35M',
        team: 'McLaren',
        livery: makeLivery('#FF8700', '#0090FF', '#111111', '3', { template: 'racing-stripes' }),
      },
      {
        id: 'f1-21-alpine',
        name: 'Alpine F1 Team A521',
        team: 'Alpine',
        livery: makeLivery('#005BA9', '#FFFFFF', '#EF1A2D', '14', { template: 'geometric' }),
      },
      {
        id: 'f1-21-alphatauri',
        name: 'Scuderia AlphaTauri AT02',
        team: 'AlphaTauri',
        livery: makeLivery('#2B4562', '#FFFFFF', '#C0C0C0', '10', { template: 'two-tone', rimFinish: 'white' }),
      },
      {
        id: 'f1-21-aston',
        name: 'Aston Martin Cognizant AMR21',
        team: 'Aston Martin',
        livery: makeLivery('#006F62', '#F596C8', '#111111', '5', { template: 'racing-stripes' }),
      },
      {
        id: 'f1-21-williams',
        name: 'Williams Racing FW43B',
        team: 'Williams',
        livery: makeLivery('#005AFF', '#FFFFFF', '#FCD700', '63', { template: 'geometric' }),
      },
      {
        id: 'f1-21-alfa',
        name: 'Alfa Romeo Racing ORLEN C41',
        team: 'Alfa Romeo',
        livery: makeLivery('#FFFFFF', '#900000', '#111111', '7', { template: 'two-tone' }),
      },
      {
        id: 'f1-21-haas',
        name: 'Uralkali Haas VF-21',
        team: 'Haas',
        livery: makeLivery('#FFFFFF', '#0039A6', '#D52B1E', '47', { template: 'racing-stripes' }),
      },
    ],
  },

  // ================= FORMULA 1 — 2005 SPEC =================
  {
    id: 'f1-05-renault',
    name: 'Renault R25 V10 (2005)',
    manufacturer: 'Renault',
    classId: CarClassId.F1_2005,
    silhouette: 'formula',
    attributes: { topSpeed: 92, acceleration: 96, corneringGrip: 92, braking: 91, efficiency: 87 },
    tradeoffNote: 'Featherweight 605kg V10 screamer with violent standing starts and playful mechanical slip.',
    engineType: 'v10',
    soundProfile: 'f1_v10',
    defaultLivery: makeLivery('#38bdf8', '#facc15', '#1e3a8a', '5', { template: 'two-tone', rimFinish: 'silver' }),
  },
  {
    id: 'f1-05-mclaren',
    name: 'McLaren MP4-20 V10 (2005)',
    manufacturer: 'McLaren',
    classId: CarClassId.F1_2005,
    silhouette: 'formula',
    attributes: { topSpeed: 95, acceleration: 94, corneringGrip: 93, braking: 90, efficiency: 84 },
    tradeoffNote: 'Razor-sharp turn-in and blistering top-end V10 shriek; demands smooth throttle.',
    engineType: 'v10',
    soundProfile: 'f1_v10',
    defaultLivery: makeLivery('#cbd5e1', '#111827', '#ef4444', '9', { template: 'geometric', rimFinish: 'silver' }),
  },
  {
    id: 'f1-05-ferrari',
    name: 'Ferrari F2005 V10 (2005)',
    manufacturer: 'Ferrari',
    classId: CarClassId.F1_2005,
    silhouette: 'formula',
    attributes: { topSpeed: 93, acceleration: 93, corneringGrip: 92, braking: 93, efficiency: 89 },
    tradeoffNote: 'Enduring Bridgestone stint pace and crisp late-braking balance.',
    engineType: 'v10',
    soundProfile: 'f1_v10',
    defaultLivery: makeLivery('#dc2626', '#ffffff', '#111827', '1', { template: 'racing-stripes', rimFinish: 'silver' }),
  },
  {
    id: 'f1-05-williams',
    name: 'Williams FW27 BMW V10 (2005)',
    manufacturer: 'Williams',
    classId: CarClassId.F1_2005,
    silhouette: 'formula',
    attributes: { topSpeed: 96, acceleration: 94, corneringGrip: 90, braking: 91, efficiency: 86 },
    tradeoffNote: '19,200 RPM BMW V10 horsepower king; lively rear under hard downshifts.',
    engineType: 'v10',
    soundProfile: 'f1_v10',
    defaultLivery: makeLivery('#ffffff', '#1e3a8a', '#38bdf8', '7', { template: 'heritage', rimFinish: 'white' }),
  },

  // ================= FORMULA E (GEN3 Evo) =================
  {
    id: 'fe-porsche-99x',
    name: 'Porsche 99X Electric GEN3 Evo',
    manufacturer: 'Porsche',
    classId: CarClassId.FORMULA_E,
    silhouette: 'formula',
    attributes: { topSpeed: 76, acceleration: 92, corneringGrip: 83, braking: 85, efficiency: 86 },
    tradeoffNote: 'Instant AWD launch torque and heavy front-axle regen braking for tight street circuits.',
    engineType: 'electric',
    soundProfile: 'formula_e',
    defaultLivery: makeLivery('#ffffff', '#dc2626', '#0f172a', '94', { template: 'geometric', headlightTint: 'ice-blue' }),
  },
  {
    id: 'fe-jaguar-itype7',
    name: 'Jaguar I-Type 7 GEN3 Evo',
    manufacturer: 'Jaguar',
    classId: CarClassId.FORMULA_E,
    silhouette: 'formula',
    attributes: { topSpeed: 77, acceleration: 90, corneringGrip: 84, braking: 84, efficiency: 87 },
    tradeoffNote: 'Ultra-efficient powertrain software that sustains Attack Mode pace without overheating.',
    engineType: 'electric',
    soundProfile: 'formula_e',
    defaultLivery: makeLivery('#111827', '#f8fafc', '#eab308', '9', { template: 'two-tone', headlightTint: 'ice-blue' }),
  },
  {
    id: 'fe-nissan-e4orce',
    name: 'Nissan e-4ORCE 05',
    manufacturer: 'Nissan',
    classId: CarClassId.FORMULA_E,
    silhouette: 'formula',
    attributes: { topSpeed: 75, acceleration: 93, corneringGrip: 84, braking: 84, efficiency: 84 },
    tradeoffNote: 'Explosive corner-exit punch with agile street-chicane rotation.',
    engineType: 'electric',
    soundProfile: 'formula_e',
    defaultLivery: makeLivery('#ef4444', '#ffffff', '#1e293b', '23', { template: 'heritage', headlightTint: 'ice-blue' }),
  },
  {
    id: 'fe-maserati-folgore',
    name: 'Maserati Tipo Folgore',
    manufacturer: 'Maserati',
    classId: CarClassId.FORMULA_E,
    silhouette: 'formula',
    attributes: { topSpeed: 78, acceleration: 89, corneringGrip: 84, braking: 86, efficiency: 85 },
    tradeoffNote: 'Top-end street speed paired with confident threshold braking.',
    engineType: 'electric',
    soundProfile: 'formula_e',
    defaultLivery: makeLivery('#1d4ed8', '#f8fafc', '#38bdf8', '7', { template: 'racing-stripes', headlightTint: 'ice-blue' }),
  },

  // ================= PRODUCTION TRACK COUPES =================
  {
    id: 'bmw-m2-cs',
    name: 'BMW M2 CS',
    manufacturer: 'BMW',
    classId: CarClassId.TRACK_COUPE,
    silhouette: 'coupe',
    attributes: { topSpeed: 68, acceleration: 71, corneringGrip: 71, braking: 73, efficiency: 82 },
    tradeoffNote: 'Playful front-engine balance with forgiving slip angles and stout brakes.',
    engineType: 'turbo-i6',
    soundProfile: 'coupe_turbo_i6',
    defaultLivery: makeLivery('#1d4ed8', '#111827', '#ef4444', '21', { template: 'racing-stripes', carbonHood: true, rimFinish: 'gold-bronze' }),
  },
  {
    id: 'porsche-911-gt3-rs',
    name: 'Porsche 911 GT3 RS',
    manufacturer: 'Porsche',
    classId: CarClassId.TRACK_COUPE,
    silhouette: 'coupe',
    attributes: { topSpeed: 70, acceleration: 72, corneringGrip: 75, braking: 75, efficiency: 76 },
    tradeoffNote: 'Active-wing street weapon with racecar cornering bite; lighter top speed.',
    engineType: 'flat6',
    soundProfile: 'coupe_flat6',
    defaultLivery: makeLivery('#f8fafc', '#ef4444', '#111827', '992', { template: 'heritage', carbonHood: true, rimFinish: 'gloss-black' }),
  },
  {
    id: 'corvette-z06-coupe',
    name: 'Chevrolet Corvette Z06',
    manufacturer: 'Chevrolet',
    classId: CarClassId.TRACK_COUPE,
    silhouette: 'coupe',
    attributes: { topSpeed: 74, acceleration: 74, corneringGrip: 70, braking: 71, efficiency: 77 },
    tradeoffNote: '8,600 RPM flat-plane V8 surge on long straights; noticeable body roll under load.',
    engineType: 'v8',
    soundProfile: 'coupe_flatplane_v8',
    defaultLivery: makeLivery('#ea580c', '#18181b', '#ffffff', '06', { template: 'two-tone', rimFinish: 'gloss-black' }),
  },
  {
    id: 'nissan-gtr-nismo',
    name: 'Nissan GT-R NISMO',
    manufacturer: 'Nissan',
    classId: CarClassId.TRACK_COUPE,
    silhouette: 'coupe',
    attributes: { topSpeed: 72, acceleration: 76, corneringGrip: 70, braking: 71, efficiency: 78 },
    tradeoffNote: 'AWD corner-exit slingshot grip; heavier curb weight in rapid chicanes.',
    engineType: 'v6',
    soundProfile: 'coupe_turbo_v6',
    defaultLivery: makeLivery('#cbd5e1', '#111827', '#dc2626', '23', { template: 'two-tone', carbonHood: true, rimFinish: 'gloss-black' }),
  },
  {
    id: 'renault-clio-v6',
    name: 'Renault Clio V6 Phase 2',
    manufacturer: 'Renault',
    classId: CarClassId.TRACK_COUPE,
    silhouette: 'coupe',
    attributes: { topSpeed: 64, acceleration: 68, corneringGrip: 76, braking: 74, efficiency: 86 },
    tradeoffNote: 'Mid-engine 3.0L naturally aspirated V6 hot-hatch icon; wide haunches and lively rear-wheel-drive rotation.',
    engineType: 'v6',
    soundProfile: 'coupe_na_v6',
    defaultLivery: makeLivery('#2563eb', '#cbd5e1', '#111827', '15', { template: 'two-tone', rimFinish: 'silver' }),
  },
  {
    id: 'honda-civic-type-r',
    name: 'Honda Civic Type R (FL5)',
    manufacturer: 'Honda',
    classId: CarClassId.TRACK_COUPE,
    silhouette: 'coupe',
    attributes: { topSpeed: 67, acceleration: 69, corneringGrip: 75, braking: 74, efficiency: 86 },
    tradeoffNote: 'Dual-axis strut FWD track king; razor-sharp front-end bite and huge rear wing stability.',
    engineType: 'turbo-i4',
    soundProfile: 'coupe_turbo_i4',
    defaultLivery: makeLivery('#f8fafc', '#dc2626', '#111827', '25', { template: 'racing-stripes', rimFinish: 'gloss-black' }),
  },

  // ================= PRODUCTION SUPERCARS & HYPERCARS =================
  {
    id: 'ferrari-296-gtb',
    name: 'Ferrari 296 GTB',
    manufacturer: 'Ferrari',
    classId: CarClassId.SUPERCAR,
    silhouette: 'supercar',
    attributes: { topSpeed: 84, acceleration: 85, corneringGrip: 78, braking: 79, efficiency: 79 },
    tradeoffNote: 'Short-wheelbase agility with rapid twin-turbo hybrid punch; less aero than GT3.',
    engineType: 'v6-hybrid',
    soundProfile: 'supercar_v6_hybrid',
    defaultLivery: makeLivery('#dc2626', '#facc15', '#111827', '296', { template: 'racing-stripes', rimFinish: 'silver' }),
  },
  {
    id: 'mclaren-750s',
    name: 'McLaren 750S',
    manufacturer: 'McLaren',
    classId: CarClassId.SUPERCAR,
    silhouette: 'supercar',
    attributes: { topSpeed: 86, acceleration: 84, corneringGrip: 79, braking: 78, efficiency: 77 },
    tradeoffNote: 'Featherweight carbon tub and ferocious top-end pull; demands smooth brake release.',
    engineType: 'v8',
    soundProfile: 'supercar_flatplane_v8',
    defaultLivery: makeLivery('#f97316', '#111827', '#f8fafc', '750', { template: 'two-tone', rimFinish: 'gloss-black' }),
  },
  {
    id: 'ferrari-sf90',
    name: 'Ferrari 488 GTB',
    manufacturer: 'Ferrari',
    classId: CarClassId.SUPERCAR,
    silhouette: 'supercar',
    attributes: { topSpeed: 83, acceleration: 83, corneringGrip: 80, braking: 80, efficiency: 81 },
    tradeoffNote: '3.9L twin-turbo flat-plane V8 RWD berlinetta; sharp mid-engine turn-in and responsive corner-exit balance.',
    engineType: 'v8-hybrid',
    soundProfile: 'supercar_flatplane_v8',
    defaultLivery: makeLivery('#dc2626', '#cbd5e1', '#facc15', '488', { template: 'heritage', rimFinish: 'gold-bronze' }),
  },
  {
    id: 'porsche-918-spyder',
    name: 'Porsche 918 Spyder',
    manufacturer: 'Porsche',
    classId: CarClassId.SUPERCAR,
    silhouette: 'supercar',
    attributes: { topSpeed: 83, acceleration: 86, corneringGrip: 79, braking: 80, efficiency: 82 },
    tradeoffNote: 'Precision Weissach AWD traction and clean brake modulation.',
    engineType: 'v8-hybrid',
    soundProfile: 'supercar_flatplane_v8',
    defaultLivery: makeLivery('#cbd5e1', '#84cc16', '#111827', '918', { template: 'racing-stripes', rimFinish: 'gloss-black' }),
  },
  {
    id: 'aston-valkyrie-road',
    name: 'Aston Martin Valkyrie (Road Spec)',
    manufacturer: 'Aston Martin',
    classId: CarClassId.SUPERCAR,
    silhouette: 'supercar',
    attributes: { topSpeed: 90, acceleration: 83, corneringGrip: 81, braking: 77, efficiency: 74 },
    tradeoffNote: '6.5L V12 extreme power-to-weight rocket with active venturi downforce.',
    engineType: 'v12',
    soundProfile: 'supercar_v12',
    defaultLivery: makeLivery('#065f46', '#a3e635', '#111827', '12', { template: 'geometric', carbonHood: true, rimFinish: 'gold-bronze' }),
  },
  {
    id: 'ferrari-f80',
    name: 'Ferrari F80',
    manufacturer: 'Ferrari',
    classId: CarClassId.SUPERCAR,
    silhouette: 'supercar',
    attributes: { topSpeed: 89, acceleration: 89, corneringGrip: 77, braking: 76, efficiency: 74 },
    tradeoffNote: '1,200 hp Le Mans-derived 3.0L twin-turbo V6 hybrid with active rear wing; 350+ km/h vmax.',
    engineType: 'v6-hybrid',
    soundProfile: 'supercar_v6_hybrid',
    defaultLivery: makeLivery('#dc2626', '#111827', '#ffffff', '80', { template: 'racing-stripes', rimFinish: 'gloss-black' }),
  },
  {
    id: 'mclaren-w1',
    name: 'McLaren W1',
    manufacturer: 'McLaren',
    classId: CarClassId.SUPERCAR,
    silhouette: 'supercar',
    attributes: { topSpeed: 89, acceleration: 88, corneringGrip: 77, braking: 76, efficiency: 75 },
    tradeoffNote: '1,275 hp twin-turbo V8 hybrid successor to P1 with Active Long Tail aero; extreme high-speed downforce.',
    engineType: 'v8-hybrid',
    soundProfile: 'supercar_flatplane_v8',
    defaultLivery: makeLivery('#ea580c', '#111827', '#ffffff', '01', { template: 'geometric', rimFinish: 'gloss-black' }),
  },
];

// Attach real-world metric dimensions and lengths to all specifications
for (const car of CARS) {
  const dims = getRealWorldCarDimensions(car.id, car.classId);
  car.dimensions = dims;
  car.length = dims.length;
}

const CAR_ALIASES: Record<string, { targetCarId: string; liveryPresetId?: string }> = {
  // Formula 1 2026
  'f1-26-ferrari': { targetCarId: 'f1-26-mercedes', liveryPresetId: 'f1-26-ferrari' },
  'f1-26-mclaren': { targetCarId: 'f1-26-mercedes', liveryPresetId: 'f1-26-mclaren' },
  'f1-26-redbull': { targetCarId: 'f1-26-mercedes', liveryPresetId: 'f1-26-redbull' },
  'f1-26-aston': { targetCarId: 'f1-26-mercedes', liveryPresetId: 'f1-26-aston' },
  'f1-26-williams': { targetCarId: 'f1-26-mercedes', liveryPresetId: 'f1-26-williams' },
  'f1-26-alpine': { targetCarId: 'f1-26-mercedes', liveryPresetId: 'f1-26-alpine' },
  'f1-26-haas': { targetCarId: 'f1-26-mercedes', liveryPresetId: 'f1-26-haas' },
  'f1-26-audi': { targetCarId: 'f1-26-mercedes', liveryPresetId: 'f1-26-audi' },
  'f1-26-cadillac': { targetCarId: 'f1-26-mercedes', liveryPresetId: 'f1-26-cadillac' },
  'f1-26-racing-bulls': { targetCarId: 'f1-26-mercedes', liveryPresetId: 'f1-26-racing-bulls' },
  'f1-2026': { targetCarId: 'f1-26-mercedes' },
  'f1_2026': { targetCarId: 'f1-26-mercedes' },

  // Formula 1 2021
  'f1-21-redbull': { targetCarId: 'f1-21-mercedes', liveryPresetId: 'f1-21-redbull' },
  'f1-21-ferrari': { targetCarId: 'f1-21-mercedes', liveryPresetId: 'f1-21-ferrari' },
  'f1-21-mclaren': { targetCarId: 'f1-21-mercedes', liveryPresetId: 'f1-21-mclaren' },
  'f1-21-alpine': { targetCarId: 'f1-21-mercedes', liveryPresetId: 'f1-21-alpine' },
  'f1-21-alphatauri': { targetCarId: 'f1-21-mercedes', liveryPresetId: 'f1-21-alphatauri' },
  'f1-21-aston': { targetCarId: 'f1-21-mercedes', liveryPresetId: 'f1-21-aston' },
  'f1-21-williams': { targetCarId: 'f1-21-mercedes', liveryPresetId: 'f1-21-williams' },
  'f1-21-alfa': { targetCarId: 'f1-21-mercedes', liveryPresetId: 'f1-21-alfa' },
  'f1-21-haas': { targetCarId: 'f1-21-mercedes', liveryPresetId: 'f1-21-haas' },
  'f1-2021': { targetCarId: 'f1-21-mercedes' },
  'f1_2021': { targetCarId: 'f1-21-mercedes' },

  // LMP2
  'oreca-07': { targetCarId: 'oreca-07' },
  'oreca-07-united': { targetCarId: 'oreca-07', liveryPresetId: 'united-autosports' },
  'oreca-07-united-autosports': { targetCarId: 'oreca-07', liveryPresetId: 'united-autosports' },
  'united-autosports': { targetCarId: 'oreca-07', liveryPresetId: 'united-autosports' },
  'oreca-07-europol': { targetCarId: 'oreca-07', liveryPresetId: 'inter-europol' },
  'oreca-07-inter-europol': { targetCarId: 'oreca-07', liveryPresetId: 'inter-europol' },
  'inter-europol': { targetCarId: 'oreca-07', liveryPresetId: 'inter-europol' },
  'oreca-07-ao': { targetCarId: 'oreca-07', liveryPresetId: 'ao-racing' },
  'oreca-07-ao-racing': { targetCarId: 'oreca-07', liveryPresetId: 'ao-racing' },
  'ao-racing': { targetCarId: 'oreca-07', liveryPresetId: 'ao-racing' },
  'oreca-07-af-corse': { targetCarId: 'oreca-07', liveryPresetId: 'af-corse' },
  'af-corse': { targetCarId: 'oreca-07', liveryPresetId: 'af-corse' },
  'oreca-07-cool': { targetCarId: 'oreca-07', liveryPresetId: 'cool-racing' },
  'oreca-07-cool-racing': { targetCarId: 'oreca-07', liveryPresetId: 'cool-racing' },
  'cool-racing': { targetCarId: 'oreca-07', liveryPresetId: 'cool-racing' },
  'oreca-07-algarve': { targetCarId: 'oreca-07', liveryPresetId: 'algarve-pro' },
  'oreca-07-algarve-pro': { targetCarId: 'oreca-07', liveryPresetId: 'algarve-pro' },
  'algarve-pro': { targetCarId: 'oreca-07', liveryPresetId: 'algarve-pro' },
  'ligier-js-p217': { targetCarId: 'oreca-07', liveryPresetId: 'united-autosports' },
  'lmp2': { targetCarId: 'oreca-07' },
  'oreca': { targetCarId: 'oreca-07' },
};

export function getCarById(id: string): CarSpec {
  const direct = CARS.find((c) => c.id === id);
  if (direct) return direct;

  const alias = CAR_ALIASES[id];
  if (alias) {
    const target = CARS.find((c) => c.id === alias.targetCarId);
    if (target) {
      if (alias.liveryPresetId && target.liveries) {
        const presetId = alias.liveryPresetId;
        const preset = target.liveries.find(
          (p) =>
            p.id === presetId ||
            p.id === `oreca-07-${presetId}` ||
            p.id.endsWith(presetId),
        );
        if (preset) {
          const dims = getRealWorldCarDimensions(id, target.classId);
          return {
            ...target,
            id,
            name: preset.name,
            manufacturer: preset.team ?? target.manufacturer,
            dimensions: dims,
            length: dims.length,
            defaultLivery: { ...preset.livery },
          };
        }
      }
      return target;
    }
  }

  // Dynamic fallback for any Oreca 07 or LMP2 variant: never fall back to Ferrari 499P
  if (
    id.includes('oreca') ||
    id.includes('lmp2') ||
    id.includes('ligier') ||
    id.includes('united') ||
    id.includes('europol') ||
    id.includes('ao-racing') ||
    id.includes('af-corse') ||
    id.includes('cool-racing') ||
    id.includes('algarve')
  ) {
    const target = CARS.find((c) => c.id === 'oreca-07');
    if (target && target.liveries) {
      const clean = id.toLowerCase().replace(/[^a-z0-9]/g, '');
      const preset = target.liveries.find((p) => {
        const pClean = p.id.toLowerCase().replace(/[^a-z0-9]/g, '');
        return clean.includes(pClean) || pClean.includes(clean.replace(/^oreca07/, ''));
      });
      if (preset) {
        const dims = getRealWorldCarDimensions(id, target.classId);
        return {
          ...target,
          id,
          name: preset.name,
          manufacturer: preset.team ?? target.manufacturer,
          dimensions: dims,
          length: dims.length,
          defaultLivery: { ...preset.livery },
        };
      }
      return target;
    }
  }

  return CARS[0];
}

/**
 * Returns all selectable cars and team variants across all classes,
 * cleanly expanding multi-team classes like F1 2026, F1 2021, and LMP2
 * into individual manufacturer/team selectable entries.
 */
export function getAllSelectableCars(): CarSpec[] {
  const result: CarSpec[] = [];
  for (const car of CARS) {
    if (car.id === 'oreca-07') {
      result.push(car);
      if (car.liveries) {
        for (const preset of car.liveries) {
          const aliasId = `oreca-07-${preset.id.replace(/^oreca-07-/, '')}`;
          const dims = getRealWorldCarDimensions(aliasId, car.classId);
          result.push({
            ...car,
            id: aliasId,
            name: preset.name.includes('Oreca') ? preset.name : `Oreca 07 — ${preset.name}`,
            manufacturer: preset.team ?? car.manufacturer,
            dimensions: dims,
            length: dims.length,
            defaultLivery: { ...preset.livery },
          });
        }
      }
    } else if (car.liveries && car.liveries.length > 1) {
      for (const preset of car.liveries) {
        const dims = getRealWorldCarDimensions(preset.id, car.classId);
        result.push({
          ...car,
          id: preset.id,
          name: preset.name,
          manufacturer: preset.team ?? car.manufacturer,
          dimensions: dims,
          length: dims.length,
          defaultLivery: { ...preset.livery },
        });
      }
    } else {
      result.push(car);
    }
  }
  return result;
}

export function getCarsByClass(classId: CarClassId): CarSpec[] {
  return CARS.filter((c) => c.classId === classId);
}

export function resolveCarSpecial(car: CarSpec): {
  specialType: NonNullable<CarSpec['specialTypeOverride']>;
  specialLabel: string;
} {
  const cls = CAR_CLASSES[car.classId];
  return {
    specialType: car.specialTypeOverride ?? cls.specialType,
    specialLabel: car.specialLabelOverride ?? cls.specialLabel,
  };
}

/**
 * Returns true ONLY for hybrid classes with a standalone ERS battery & deployment modes:
 * WEC Hypercar/IMSA GTP (excluding non-hybrid rich-fuel-overboost LMH cars), F1 2026, and F1 2021.
 */
export function carHasHybridErs(car: CarSpec): boolean {
  if (car.specialTypeOverride === 'rich-fuel-overboost' || car.specialTypeOverride === 'none') {
    return false;
  }
  return (
    car.classId === CarClassId.HYPERCAR_GTP ||
    car.classId === CarClassId.F1_2026 ||
    car.classId === CarClassId.F1_2021
  );
}

export function validateDriverNumber(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '').slice(0, 3);
  return digits.length > 0 ? digits : '1';
}

export function resolveNumberPlateColors(
  carClassId: CarClassId,
  style: LiveryConfig['numberPlateStyle'],
): { bg: string; text: string } {
  switch (style) {
    case 'gtp-red':
      return { bg: '#dc2626', text: '#ffffff' };
    case 'lmp2-blue':
      return { bg: '#2563eb', text: '#ffffff' };
    case 'gt3-green':
      return { bg: '#16a34a', text: '#ffffff' };
    case 'gt4-cyan':
      return { bg: '#0284c7', text: '#ffffff' };
    case 'gtd-amber':
      return { bg: '#f59e0b', text: '#111827' };
    case 'formula-white':
      return { bg: '#f8fafc', text: '#0f172a' };
    case 'auto':
    default: {
      const meta = CAR_CLASSES[carClassId];
      return { bg: meta.plateColor, text: meta.badgeTextColor };
    }
  }
}

export function filterCars(
  cars: CarSpec[],
  query: string,
  classFilter: CarClassId | 'ALL',
): CarSpec[] {
  const q = query.trim().toLowerCase();
  const base = classFilter === 'ALL' ? cars : cars.filter((c) => c.classId === classFilter);
  if (!q) return base;
  const tokens = q.split(/\s+/).filter(Boolean);
  return base.filter((c) => {
    const cls = CAR_CLASSES[c.classId];
    const searchable = `${c.name} ${c.manufacturer} ${c.id} ${cls.name} ${cls.shortName}`.toLowerCase();
    const words = searchable.split(/[^a-z0-9]+/).filter(Boolean);
    return tokens.every((tok) => {
      if (tok.length <= 3) {
        return words.some((w) => w.startsWith(tok));
      }
      return searchable.includes(tok);
    });
  });
}

