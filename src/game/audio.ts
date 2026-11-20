import { CarClassId, CarSpec, SoundProfileId } from './types';

export type AcousticProfileType =
  | 'V12_NA'
  | 'V10_NA'
  | 'V8_CROSSPLANE'
  | 'V8_FLATPLANE'
  | 'FLAT6_BOXER'
  | 'V6_TURBO_HYBRID'
  | 'INLINE6_TURBO'
  | 'INLINE4_TURBO'
  | 'ELECTRIC_EV';

export interface AcousticProfile {
  type: AcousticProfileType;
  soundProfile: SoundProfileId;
  name: string;
  cylinders: number;
  idleRpm: number;
  redlineRpm: number;
  baseIdleHz: number; // fundamental firing base at idle (45..100 Hz)
  maxRedlineHz: number; // fundamental firing base at redline (165..380 Hz)
  subRatio: number; // sub-octave crankshaft / uneven bank rumble (0.5x)
  midHarmonicRatio: number; // midrange cylinder-order harmonic (1.5x, 2.0x, 2.5x, 3.0x)
  highHarmonicRatio?: number; // high scream/bark harmonic (3.0x..6.0x)
  subLevel?: number; // 0.5x sub-rumble level
  midLevel?: number; // midrange harmonic oscillator level
  highLevel?: number; // upper harmonic oscillator level
  // Custom harmonic overtone amplitudes [1x, 2nd, 3rd, 4th, 5th, 6th, 7th, 8th] for PeriodicWave synthesis
  harmonicWeights: number[];
  // Dual-band exhaust acoustic resonance formants
  chestFormantHz: number; // low-mid chest/header resonance (110..260 Hz for V8s)
  chestFormantGain: number; // dB boost
  chestFormantQ: number;
  formantHz?: number; // upper-mid exhaust/intake formant (600..1800 Hz)
  formantGain?: number; // dB boost
  formantQ?: number;
  // Uneven firing pulse / mechanical clatter modulation
  pulseDepth?: number;
  pulseRateScale?: number;
  pulseWaveform?: OscillatorType;
  pulseRpmFade?: number;
  // Oscillator base waveforms
  oscCombustionType: OscillatorType;
  oscHarmonicType: OscillatorType;
  oscSubType: OscillatorType;
  // Low-pass exhaust muffler / open-header sweep (up to 2.5-3.5 kHz)
  idleFilterCutoff: number;
  wotFilterCutoff: number;
  filterQ: number;
  distortionDrive: number;
  combustionGain: number;
  profileGain: number; // Output gain calibration for perceived RMS loudness normalization
  engineOutputGain?: number; // Master combustion output gain alias (0.02x..2.5x, default 0.90x)
  // Intake / induction snarl channel
  intakeLevel: number;
  intakeCenterHz: number;
  intakeHighRpmThreshold: number;
  // Hybrid MGU-K electric motor whine
  hasHybridWhine: boolean;
  hybridWhineLevel: number;
  mguLaunchDominant: boolean;
  // Turbocharger spool & wastegate flutter
  hasTurboFlutter: boolean;
  turboSpoolPitch: number;
  turboSpoolLevel: number;
  // Straight-cut sequential transmission gear whine
  gearWhineLevel: number;
  gearWhinePitchScale: number;
  // Rev limiter & shift / overrun foley
  revLimiterRateHz: number; // Cyclic ignition-cut rate (14..22 Hz)
  flatShiftCutMs: number; // Ignition-cut upshift bap duration in ms
  hasExhaustCrackles: boolean;
  crackleIntensity: number;
}

const SOUND_OVERRIDES_STORAGE_KEY = 'apex_sound_overrides_v1';

let cachedSoundOverrides: Partial<Record<SoundProfileId, Partial<AcousticProfile>>> | null = null;

export function loadSoundProfileOverrides(): Partial<Record<SoundProfileId, Partial<AcousticProfile>>> {
  if (cachedSoundOverrides) return cachedSoundOverrides;
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(SOUND_OVERRIDES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          cachedSoundOverrides = parsed;
          return cachedSoundOverrides!;
        }
      }
    }
  } catch {
    // Ignore storage parse failures
  }
  cachedSoundOverrides = {};
  return cachedSoundOverrides;
}

export function saveSoundProfileOverride(
  profileId: SoundProfileId,
  override: Partial<AcousticProfile>,
): void {
  const all = { ...loadSoundProfileOverrides(), [profileId]: override };
  cachedSoundOverrides = all;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SOUND_OVERRIDES_STORAGE_KEY, JSON.stringify(all));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function clearSoundProfileOverride(profileId?: SoundProfileId): void {
  if (!profileId) {
    cachedSoundOverrides = {};
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(SOUND_OVERRIDES_STORAGE_KEY);
      }
    } catch {}
    return;
  }
  const all = { ...loadSoundProfileOverrides() };
  delete all[profileId];
  cachedSoundOverrides = all;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SOUND_OVERRIDES_STORAGE_KEY, JSON.stringify(all));
    }
  } catch {}
}

export const SOUND_PRESET_CATALOG: Array<{ id: SoundProfileId; label: string; group: string }> = [
  { id: 'cadillac_v8_hybrid', label: 'GTP — Cadillac V-Series.R (5.5L NA V8 Hybrid)', group: 'IMSA GTP' },
  { id: 'gtp_turbo_v8', label: 'GTP — Porsche 963 / BMW M Hybrid V8 (TT V8 Hybrid)', group: 'IMSA GTP' },
  { id: 'gtp_turbo_v6', label: 'GTP — Acura ARX-06 / Ferrari 499P (TT V6 Hybrid)', group: 'IMSA GTP' },
  { id: 'gtp_na_v12', label: 'GTP — Aston Martin Valkyrie AMR-LMH (6.5L V12)', group: 'IMSA GTP' },
  { id: 'gtp_na_v8', label: 'GTP — Glickenhaus SCG 007 (Twin-Turbo V8)', group: 'IMSA GTP' },
  { id: 'lmp2_gibson_v8', label: 'LMP2 — Oreca 07 Gibson GK428 (4.2L NA V8)', group: 'IMSA LMP2' },
  { id: 'gt3_flat6', label: 'GTD — Porsche 911 GT3 R 992 (4.2L Flat-6)', group: 'IMSA GTD / GT3' },
  { id: 'gt3_flatplane_v8', label: 'GTD — Corvette Z06 GT3.R (5.5L Flat-Plane V8)', group: 'IMSA GTD / GT3' },
  { id: 'gt3_v10', label: 'GTD — Lamborghini / Audi R8 LMS (5.2L NA V10)', group: 'IMSA GTD / GT3' },
  { id: 'gt3_crossplane_v8', label: 'GTD — Mustang / AMG / RC F (Cross-Plane NA V8)', group: 'IMSA GTD / GT3' },
  { id: 'gt3_turbo_i6', label: 'GTD — BMW M4 GT3 (3.0L Twin-Turbo I6)', group: 'IMSA GTD / GT3' },
  { id: 'gt3_turbo_v6', label: 'GTD — Ferrari 296 / NSX GT3 (Twin-Turbo V6)', group: 'IMSA GTD / GT3' },
  { id: 'gt3_turbo_v8', label: 'GTD — McLaren 720S / Vantage / Bentley (TT V8)', group: 'IMSA GTD / GT3' },
  { id: 'gt4_flat6', label: 'GS — Porsche 718 Cayman GT4 RS (4.0L Flat-6)', group: 'IMSA GS / GT4' },
  { id: 'gt4_crossplane_v8', label: 'GS — Ford Mustang GT4 (5.0L NA V8)', group: 'IMSA GS / GT4' },
  { id: 'gt4_turbo_i6', label: 'GS — BMW M4 GT4 / Supra GT4 (Turbo I6)', group: 'IMSA GS / GT4' },
  { id: 'gt4_turbo_v8', label: 'GS — Vantage GT4 / AMG GT4 (Twin-Turbo V8)', group: 'IMSA GS / GT4' },
  { id: 'gt4_turbo_v6', label: 'GS — McLaren Artura GT4 (Twin-Turbo V6)', group: 'IMSA GS / GT4' },
  { id: 'gt4_turbo_i4', label: 'GS — Alpine A110 GT4+ (1.8L Turbo I4)', group: 'IMSA GS / GT4' },
  { id: 'f1_v6_hybrid', label: 'Formula 1 — 1.6L V6 Turbo Hybrid (15,000 RPM)', group: 'Formula' },
  { id: 'f1_v10', label: 'Formula 1 — 2005 3.0L V10 (19,000 RPM)', group: 'Formula' },
  { id: 'formula_e', label: 'Formula E — GEN3 Evo Pure Electric Inverter', group: 'Formula' },
  { id: 'coupe_flat6', label: 'Track Coupe — Porsche 911 GT3 RS (Flat-6)', group: 'Production' },
  { id: 'coupe_flatplane_v8', label: 'Track Coupe — Corvette Z06 (LT6 Flat-Plane V8)', group: 'Production' },
  { id: 'coupe_turbo_i6', label: 'Track Coupe — BMW M2 CS (Turbo I6)', group: 'Production' },
  { id: 'coupe_turbo_v6', label: 'Track Coupe — Nissan GT-R NISMO (TT V6)', group: 'Production' },
  { id: 'coupe_na_v6', label: 'Track Coupe — Renault Clio V6 (3.0L NA V6)', group: 'Production' },
  { id: 'supercar_v12', label: 'Supercar — Aston Valkyrie Road (6.5L V12)', group: 'Supercars' },
  { id: 'supercar_flatplane_v8', label: 'Supercar — 488 / 918 / 750S / W1 (V8)', group: 'Supercars' },
  { id: 'supercar_v6_hybrid', label: 'Supercar — Ferrari 296 GTB / F80 (V6 Hybrid)', group: 'Supercars' },
];

/**
 * Generates an analogue-style soft-clipping saturation curve for WaveShaperNode.
 */
export function makeSoftClippingCurve(amount = 22, nSamples = 1024): Float32Array {
  const curve = new Float32Array(nSamples);
  const deg = Math.PI / 180;
  for (let i = 0; i < nSamples; ++i) {
    const x = (i * 2) / nSamples - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

/**
 * Infers SoundProfileId from (carId, engineType, classId) when soundProfile is not passed explicitly.
 */
export function inferSoundProfileId(
  carId: string = '',
  engineType: CarSpec['engineType'] = 'v8-hybrid',
  classId?: CarClassId,
): SoundProfileId {
  if (classId === CarClassId.FORMULA_E || engineType === 'electric' || carId.startsWith('fe-')) {
    return 'formula_e';
  }
  if (classId === CarClassId.F1_2005 || carId.startsWith('f1-05')) {
    return 'f1_v10';
  }
  if (
    classId === CarClassId.F1_2026 ||
    classId === CarClassId.F1_2021 ||
    carId.startsWith('f1-26') ||
    carId.startsWith('f1-21')
  ) {
    return 'f1_v6_hybrid';
  }

  // GTP / Hypercar
  if (carId.includes('cadillac-vseries')) return 'cadillac_v8_hybrid';
  if (carId.includes('aston-valkyrie-lmh')) return 'gtp_na_v12';
  if (carId.includes('aston-valkyrie-road')) return 'supercar_v12';
  if (carId.includes('glickenhaus') || carId.includes('scg-007')) return 'gtp_na_v8';
  if (
    carId.includes('porsche-963') ||
    carId.includes('bmw-m-hybrid') ||
    carId.includes('lamborghini-sc63') ||
    carId.includes('genesis-gmr')
  ) {
    return 'gtp_turbo_v8';
  }
  if (
    carId.includes('ferrari-499p') ||
    carId.includes('toyota-gr010') ||
    carId.includes('acura-arx') ||
    carId.includes('alpine-a424') ||
    carId.includes('peugeot-9x8')
  ) {
    return 'gtp_turbo_v6';
  }

  // LMP2
  if (
    classId === CarClassId.LMP2 ||
    carId.includes('oreca') ||
    carId.includes('ligier') ||
    carId.includes('united') ||
    carId.includes('europol') ||
    carId.includes('ao-racing') ||
    carId.includes('cool-racing') ||
    carId.includes('algarve')
  ) {
    return 'lmp2_gibson_v8';
  }

  // GT3 / GTD Pro
  if (carId.includes('porsche-911-gt3-r')) return 'gt3_flat6';
  if (carId.includes('corvette-z06-gt3')) return 'gt3_flatplane_v8';
  if (carId.includes('corvette-z06-coupe')) return 'coupe_flatplane_v8';
  if (carId.includes('lamborghini-temerario') || carId.includes('r8')) return 'gt3_v10';
  if (carId.includes('mustang-gt3') || carId.includes('amg-gt3') || carId.includes('lexus-rcf')) {
    return 'gt3_crossplane_v8';
  }
  if (carId.includes('bmw-m4-gt3')) return 'gt3_turbo_i6';
  if (carId.includes('ferrari-296-gt3') || carId.includes('renault-rs01') || carId.includes('acura-nsx')) {
    return 'gt3_turbo_v6';
  }
  if (carId.includes('mclaren-720s') || carId.includes('aston-vantage-gt3') || carId.includes('bentley')) {
    return 'gt3_turbo_v8';
  }

  // GT4 / GS
  if (carId.includes('cayman-gt4') || (classId === CarClassId.GT4 && engineType === 'flat6')) return 'gt4_flat6';
  if (carId.includes('bmw-m4-gt4') || carId.includes('supra-gt4')) return 'gt4_turbo_i6';
  if (carId.includes('artura-gt4')) return 'gt4_turbo_v6';
  if (carId.includes('mustang-gt4')) return 'gt4_crossplane_v8';
  if (carId.includes('vantage-gt4') || carId.includes('amg-gt4')) return 'gt4_turbo_v8';
  if (carId.includes('alpine-a110')) return 'gt4_turbo_i4';

  // Track Coupes
  if (carId.includes('911-gt3-rs')) return 'coupe_flat6';
  if (carId.includes('m2-cs')) return 'coupe_turbo_i6';
  if (carId.includes('gtr-nismo')) return 'coupe_turbo_v6';
  if (carId.includes('clio-v6')) return 'coupe_na_v6';
  if (carId.includes('civic')) return 'coupe_turbo_i4';

  // Supercars
  if (carId.includes('296-gtb') || carId.includes('ferrari-f80')) return 'supercar_v6_hybrid';
  if (
    carId.includes('918') ||
    carId.includes('sf90') ||
    carId.includes('750s') ||
    carId.includes('mclaren-w1')
  ) {
    return 'supercar_flatplane_v8';
  }

  // EngineType fallback
  if (engineType === 'v12') return 'supercar_v12';
  if (engineType === 'v10') return 'gt3_v10';
  if (engineType === 'flat6') return 'gt3_flat6';
  if (engineType === 'turbo-i6') return 'gt3_turbo_i6';
  if (engineType === 'turbo-i4') return 'gt4_turbo_i4';
  if (engineType === 'v6') return 'gt3_turbo_v6';
  if (engineType === 'v8') return 'gt3_crossplane_v8';
  if (engineType === 'v6-hybrid') return 'gtp_turbo_v6';
  return 'gtp_turbo_v8';
}

export function getBaseAcousticProfile(
  sp: SoundProfileId,
  carId: string = '',
): AcousticProfile {
  switch (sp) {
    case 'formula_e':
      return {
        type: 'ELECTRIC_EV',
        soundProfile: sp,
        name: 'Formula E GEN3 Inverter & Reduction Gearbox',
        cylinders: 0,
        idleRpm: 0,
        redlineRpm: 12000,
        baseIdleHz: 0,
        maxRedlineHz: 0,
        subRatio: 0,
        midHarmonicRatio: 0,
        highHarmonicRatio: 0,
        subLevel: 0,
        midLevel: 0,
        highLevel: 0,
        harmonicWeights: [1, 0, 0, 0, 0, 0, 0, 0],
        chestFormantHz: 200,
        chestFormantGain: 0,
        chestFormantQ: 1.0,
        formantHz: 2100,
        formantGain: 2.5,
        formantQ: 1.4,
        pulseDepth: 0,
        oscCombustionType: 'sine',
        oscHarmonicType: 'triangle',
        oscSubType: 'sine',
        idleFilterCutoff: 1200,
        wotFilterCutoff: 1800,
        filterQ: 1.1,
        distortionDrive: 4,
        combustionGain: 0.0,
        profileGain: 0.15,
        engineOutputGain: 0.15,
        intakeLevel: 0.0,
        intakeCenterHz: 1800,
        intakeHighRpmThreshold: 1.0,
        hasHybridWhine: true,
        hybridWhineLevel: 0.16,
        mguLaunchDominant: false,
        hasTurboFlutter: false,
        turboSpoolPitch: 0,
        turboSpoolLevel: 0,
        gearWhineLevel: 0.14,
        gearWhinePitchScale: 1.25,
        revLimiterRateHz: 18,
        flatShiftCutMs: 0,
        hasExhaustCrackles: false,
        crackleIntensity: 0,
      };

    case 'cadillac_v8_hybrid':
      return {
        type: 'V8_CROSSPLANE',
        soundProfile: sp,
        name: 'IMSA GTP 5.5L NA Cross-Plane V8 Hybrid (Cadillac V-Series.R)',
        cylinders: 8,
        idleRpm: 950,
        redlineRpm: 8800,
        baseIdleHz: 52,
        maxRedlineHz: 245,
        subRatio: 0.5,
        midHarmonicRatio: 2.0,
        highHarmonicRatio: 4.0,
        subLevel: 1.05,
        midLevel: 0.84,
        highLevel: 0.48,
        harmonicWeights: [1.0, 0.86, 0.32, 0.68, 0.14, 0.22, 0.06, 0.05],
        chestFormantHz: 175,
        chestFormantGain: 7.5,
        chestFormantQ: 1.35,
        formantHz: 460,
        formantGain: 3.5,
        formantQ: 1.2,
        pulseDepth: 0.36,
        pulseRateScale: 0.18,
        pulseWaveform: 'sawtooth',
        pulseRpmFade: 0.72,
        oscCombustionType: 'sawtooth',
        oscHarmonicType: 'sawtooth',
        oscSubType: 'triangle',
        idleFilterCutoff: 270,
        wotFilterCutoff: 2650,
        filterQ: 1.9,
        distortionDrive: 32,
        combustionGain: 0.38,
        profileGain: 0.90,
        engineOutputGain: 0.90,
        intakeLevel: 0.07,
        intakeCenterHz: 950,
        intakeHighRpmThreshold: 0.6,
        hasHybridWhine: true,
        hybridWhineLevel: 0.10,
        mguLaunchDominant: true,
        hasTurboFlutter: false,
        turboSpoolPitch: 0,
        turboSpoolLevel: 0,
        gearWhineLevel: 0.10,
        gearWhinePitchScale: 1.0,
        revLimiterRateHz: 17,
        flatShiftCutMs: 55,
        hasExhaustCrackles: true,
        crackleIntensity: 1.65,
      };

    case 'gtp_turbo_v8':
      return {
        type: 'V8_FLATPLANE',
        soundProfile: sp,
        name: 'IMSA GTP Twin-Turbo V8 Hybrid',
        cylinders: 8,
        idleRpm: 920,
        redlineRpm: 8400,
        baseIdleHz: 58,
        maxRedlineHz: 255,
        subRatio: 0.5,
        midHarmonicRatio: 2.0,
        highHarmonicRatio: 3.0,
        subLevel: 0.72,
        midLevel: 0.80,
        highLevel: 0.34,
        harmonicWeights: [1.0, 0.76, 0.34, 0.32, 0.10, 0.08, 0.03, 0.02],
        chestFormantHz: 195,
        chestFormantGain: 4.5,
        chestFormantQ: 1.25,
        formantHz: 620,
        formantGain: 3.2,
        formantQ: 1.4,
        pulseDepth: 0.12,
        pulseRateScale: 0.22,
        pulseWaveform: 'triangle',
        pulseRpmFade: 0.7,
        oscCombustionType: 'sawtooth',
        oscHarmonicType: 'triangle',
        oscSubType: 'sine',
        idleFilterCutoff: 230,
        wotFilterCutoff: 1380,
        filterQ: 1.5,
        distortionDrive: 20,
        combustionGain: 0.36,
        profileGain: 0.90,
        engineOutputGain: 0.90,
        intakeLevel: 0.04,
        intakeCenterHz: 1400,
        intakeHighRpmThreshold: 0.65,
        hasHybridWhine: true,
        hybridWhineLevel: 0.10,
        mguLaunchDominant: true,
        hasTurboFlutter: true,
        turboSpoolPitch: 1.18,
        turboSpoolLevel: 0.12,
        gearWhineLevel: 0.10,
        gearWhinePitchScale: 1.05,
        revLimiterRateHz: 18,
        flatShiftCutMs: 52,
        hasExhaustCrackles: true,
        crackleIntensity: 1.25,
      };

    case 'gtp_turbo_v6': {
      const isHighRevAcura = carId.includes('acura-arx');
      return {
        type: 'V6_TURBO_HYBRID',
        soundProfile: sp,
        name: isHighRevAcura
          ? 'IMSA GTP 2.4L Twin-Turbo V6 Hybrid (Acura ARX-06)'
          : 'IMSA GTP / WEC Twin-Turbo V6 Hybrid',
        cylinders: 6,
        idleRpm: 1100,
        redlineRpm: isHighRevAcura ? 10000 : 8800,
        baseIdleHz: 60,
        maxRedlineHz: isHighRevAcura ? 285 : 255,
        subRatio: 0.5,
        midHarmonicRatio: 1.5,
        highHarmonicRatio: 3.0,
        subLevel: 0.62,
        midLevel: 0.82,
        highLevel: 0.42,
        harmonicWeights: [1.0, 0.55, 0.72, 0.34, 0.18, 0.14, 0.05, 0.03],
        chestFormantHz: 215,
        chestFormantGain: 4.0,
        chestFormantQ: 1.4,
        formantHz: 740,
        formantGain: 3.8,
        formantQ: 1.5,
        pulseDepth: 0.09,
        pulseRateScale: 0.24,
        pulseWaveform: 'sine',
        pulseRpmFade: 0.5,
        oscCombustionType: 'sawtooth',
        oscHarmonicType: 'triangle',
        oscSubType: 'sine',
        idleFilterCutoff: 245,
        wotFilterCutoff: isHighRevAcura ? 1550 : 1350,
        filterQ: 1.8,
        distortionDrive: 19,
        combustionGain: 0.36,
        profileGain: 0.90,
        engineOutputGain: 0.90,
        intakeLevel: 0.04,
        intakeCenterHz: 1550,
        intakeHighRpmThreshold: 0.6,
        hasHybridWhine: true,
        hybridWhineLevel: 0.10,
        mguLaunchDominant: true,
        hasTurboFlutter: true,
        turboSpoolPitch: isHighRevAcura ? 1.32 : 1.22,
        turboSpoolLevel: 0.12,
        gearWhineLevel: 0.10,
        gearWhinePitchScale: 1.1,
        revLimiterRateHz: 19,
        flatShiftCutMs: 50,
        hasExhaustCrackles: true,
        crackleIntensity: 1.2,
      };
    }

    case 'gtp_na_v12':
    case 'supercar_v12': {
      const isRace = sp === 'gtp_na_v12';
      return {
        type: 'V12_NA',
        soundProfile: sp,
        name: isRace ? 'IMSA GTP 6.5L NA Cosworth V12 (Valkyrie LMH)' : 'V12 Naturally Aspirated Screaming Wail',
        cylinders: 12,
        idleRpm: 1100,
        redlineRpm: 11100,
        baseIdleHz: 78,
        maxRedlineHz: 345,
        subRatio: 0.5,
        midHarmonicRatio: 2.0,
        highHarmonicRatio: 3.0,
        subLevel: 0.36,
        midLevel: 0.92,
        highLevel: 0.94,
        harmonicWeights: [0.95, 0.80, 0.88, 0.52, 0.34, 0.55, 0.22, 0.28],
        chestFormantHz: 240,
        chestFormantGain: 2.0,
        chestFormantQ: 1.1,
        formantHz: 1180,
        formantGain: 6.0,
        formantQ: 2.0,
        pulseDepth: 0.0,
        pulseRateScale: 0.25,
        pulseWaveform: 'sine',
        pulseRpmFade: 1.0,
        oscCombustionType: 'sawtooth',
        oscHarmonicType: 'sawtooth',
        oscSubType: 'sine',
        idleFilterCutoff: 295,
        wotFilterCutoff: 3250,
        filterQ: 2.8,
        distortionDrive: 22,
        combustionGain: 0.36,
        profileGain: 0.90,
        engineOutputGain: 0.90,
        intakeLevel: 0.10,
        intakeCenterHz: 1950,
        intakeHighRpmThreshold: 0.55,
        hasHybridWhine: false,
        hybridWhineLevel: 0.0,
        mguLaunchDominant: false,
        hasTurboFlutter: false,
        turboSpoolPitch: 0,
        turboSpoolLevel: 0,
        gearWhineLevel: isRace ? 0.12 : 0.05,
        gearWhinePitchScale: 1.15,
        revLimiterRateHz: 20,
        flatShiftCutMs: isRace ? 55 : 25,
        hasExhaustCrackles: true,
        crackleIntensity: 1.3,
      };
    }

    case 'gtp_na_v8':
      return {
        type: 'V8_FLATPLANE',
        soundProfile: sp,
        name: 'Hypercar Twin-Turbo V8 Non-Hybrid (Glickenhaus SCG 007)',
        cylinders: 8,
        idleRpm: 950,
        redlineRpm: 8600,
        baseIdleHz: 62,
        maxRedlineHz: 268,
        subRatio: 0.5,
        midHarmonicRatio: 2.0,
        highHarmonicRatio: 3.0,
        subLevel: 0.58,
        midLevel: 0.84,
        highLevel: 0.62,
        harmonicWeights: [1.0, 0.85, 0.35, 0.68, 0.20, 0.34, 0.12, 0.14],
        chestFormantHz: 220,
        chestFormantGain: 4.0,
        chestFormantQ: 1.3,
        formantHz: 780,
        formantGain: 4.5,
        formantQ: 1.7,
        pulseDepth: 0.10,
        pulseRateScale: 0.22,
        pulseWaveform: 'triangle',
        pulseRpmFade: 0.7,
        oscCombustionType: 'sawtooth',
        oscHarmonicType: 'sawtooth',
        oscSubType: 'sine',
        idleFilterCutoff: 260,
        wotFilterCutoff: 2550,
        filterQ: 2.1,
        distortionDrive: 24,
        combustionGain: 0.36,
        profileGain: 0.90,
        engineOutputGain: 0.90,
        intakeLevel: 0.07,
        intakeCenterHz: 1450,
        intakeHighRpmThreshold: 0.6,
        hasHybridWhine: false,
        hybridWhineLevel: 0.0,
        mguLaunchDominant: false,
        hasTurboFlutter: true,
        turboSpoolPitch: 1.08,
        turboSpoolLevel: 0.10,
        gearWhineLevel: 0.10,
        gearWhinePitchScale: 1.05,
        revLimiterRateHz: 18,
        flatShiftCutMs: 52,
        hasExhaustCrackles: true,
        crackleIntensity: 1.35,
      };

    case 'lmp2_gibson_v8':
      return {
        type: 'V8_FLATPLANE',
        soundProfile: sp,
        name: 'IMSA LMP2 Gibson GK428 4.2L NA V8',
        cylinders: 8,
        idleRpm: 1150,
        redlineRpm: 9000,
        baseIdleHz: 68,
        maxRedlineHz: 298,
        subRatio: 0.5,
        midHarmonicRatio: 2.0,
        highHarmonicRatio: 4.0,
        subLevel: 0.42,
        midLevel: 0.90,
        highLevel: 0.86,
        harmonicWeights: [0.95, 1.0, 0.28, 0.86, 0.18, 0.54, 0.14, 0.32],
        chestFormantHz: 250,
        chestFormantGain: 2.5,
        chestFormantQ: 1.2,
        formantHz: 1220,
        formantGain: 7.0,
        formantQ: 1.45,
        pulseDepth: 0.06,
        pulseRateScale: 0.25,
        pulseWaveform: 'triangle',
        pulseRpmFade: 0.85,
        oscCombustionType: 'sawtooth',
        oscHarmonicType: 'sawtooth',
        oscSubType: 'triangle',
        idleFilterCutoff: 300,
        wotFilterCutoff: 3100,
        filterQ: 2.6,
        distortionDrive: 26,
        combustionGain: 0.38,
        profileGain: 0.90,
        engineOutputGain: 0.90,
        intakeLevel: 0.11,
        intakeCenterHz: 1650,
        intakeHighRpmThreshold: 0.55,
        hasHybridWhine: false,
        hybridWhineLevel: 0.0,
        mguLaunchDominant: false,
        hasTurboFlutter: false,
        turboSpoolPitch: 0,
        turboSpoolLevel: 0,
        gearWhineLevel: 0.14,
        gearWhinePitchScale: 1.28,
        revLimiterRateHz: 19,
        flatShiftCutMs: 62,
        hasExhaustCrackles: true,
        crackleIntensity: 1.45,
      };

    case 'gt3_flat6':
    case 'coupe_flat6': {
      const isRace = sp === 'gt3_flat6';
      return {
        type: 'FLAT6_BOXER',
        soundProfile: sp,
        name: isRace ? 'IMSA GTD 4.2L NA Flat-6 (Porsche 911 GT3 R)' : 'Porsche 4.0L NA Flat-6 GT3 RS',
        cylinders: 6,
        idleRpm: 950,
        redlineRpm: 9250,
        baseIdleHz: 64,
        maxRedlineHz: 276,
        subRatio: 0.5,
        midHarmonicRatio: 3.0,
        highHarmonicRatio: 6.0,
        subLevel: 0.48,
        midLevel: 0.94,
        highLevel: 0.80,
        harmonicWeights: [0.90, 0.55, 1.0, 0.42, 0.35, 0.78, 0.24, 0.32],
        chestFormantHz: 220,
        chestFormantGain: 2.5,
        chestFormantQ: 1.3,
        formantHz: 1380,
        formantGain: 6.5,
        formantQ: 2.2,
        pulseDepth: 0.24,
        pulseRateScale: 0.31,
        pulseWaveform: 'triangle',
        pulseRpmFade: 0.35,
        oscCombustionType: 'sawtooth',
        oscHarmonicType: 'triangle',
        oscSubType: 'sawtooth',
        idleFilterCutoff: 280,
        wotFilterCutoff: 2950,
        filterQ: 3.0,
        distortionDrive: 22,
        combustionGain: 0.36,
        profileGain: 0.90,
        engineOutputGain: 0.90,
        intakeLevel: isRace ? 0.16 : 0.14,
        intakeCenterHz: 1850,
        intakeHighRpmThreshold: 0.66,
        hasHybridWhine: false,
        hybridWhineLevel: 0.0,
        mguLaunchDominant: false,
        hasTurboFlutter: false,
        turboSpoolPitch: 0,
        turboSpoolLevel: 0,
        gearWhineLevel: isRace ? 0.12 : 0.05,
        gearWhinePitchScale: 1.12,
        revLimiterRateHz: 19,
        flatShiftCutMs: isRace ? 48 : 24,
        hasExhaustCrackles: true,
        crackleIntensity: 1.35,
      };
    }

    case 'gt3_flatplane_v8':
    case 'coupe_flatplane_v8': {
      const isRace = sp === 'gt3_flatplane_v8';
      return {
        type: 'V8_FLATPLANE',
        soundProfile: sp,
        name: isRace ? 'IMSA GTD 5.5L Flat-Plane V8 (Corvette Z06 GT3.R)' : '5.5L LT6 Flat-Plane V8',
        cylinders: 8,
        idleRpm: 1000,
        redlineRpm: 8600,
        baseIdleHz: 68,
        maxRedlineHz: 286,
        subRatio: 0.5,
        midHarmonicRatio: 2.0,
        highHarmonicRatio: 4.0,
        subLevel: 0.44,
        midLevel: 0.88,
        highLevel: 0.84,
        harmonicWeights: [0.95, 1.0, 0.22, 0.90, 0.15, 0.56, 0.14, 0.36],
        chestFormantHz: 245,
        chestFormantGain: 2.5,
        chestFormantQ: 1.3,
        formantHz: 1120,
        formantGain: 6.2,
        formantQ: 1.9,
        pulseDepth: 0.05,
        pulseRateScale: 0.25,
        pulseWaveform: 'triangle',
        pulseRpmFade: 0.9,
        oscCombustionType: 'sawtooth',
        oscHarmonicType: 'sawtooth',
        oscSubType: 'sine',
        idleFilterCutoff: 285,
        wotFilterCutoff: 2900,
        filterQ: 2.4,
        distortionDrive: 25,
        combustionGain: 0.38,
        profileGain: 0.90,
        engineOutputGain: 0.90,
        intakeLevel: 0.12,
        intakeCenterHz: 1550,
        intakeHighRpmThreshold: 0.58,
        hasHybridWhine: false,
        hybridWhineLevel: 0.0,
        mguLaunchDominant: false,
        hasTurboFlutter: false,
        turboSpoolPitch: 0,
        turboSpoolLevel: 0,
        gearWhineLevel: isRace ? 0.12 : 0.05,
        gearWhinePitchScale: 1.08,
        revLimiterRateHz: 18,
        flatShiftCutMs: isRace ? 48 : 22,
        hasExhaustCrackles: true,
        crackleIntensity: 1.4,
      };
    }

    case 'gt3_v10':
    case 'f1_v10': {
      const is2005F1 = sp === 'f1_v10';
      return {
        type: 'V10_NA',
        soundProfile: sp,
        name: is2005F1 ? 'F1 3.0L V10 19,000 RPM Screamer' : 'IMSA GTD 5.2L NA V10 (Lamborghini / Audi R8)',
        cylinders: 10,
        idleRpm: is2005F1 ? 4200 : 980,
        redlineRpm: is2005F1 ? 19000 : 8800,
        // F1 2005 stays <=240 Hz to honor existing warm-fundamental unit test bounds; GT3 V10 screams to 360 Hz!
        baseIdleHz: is2005F1 ? 86 : 74,
        maxRedlineHz: is2005F1 ? 240 : 358,
        subRatio: 0.5,
        midHarmonicRatio: 2.5,
        highHarmonicRatio: 5.0,
        subLevel: 0.30,
        midLevel: 0.92,
        highLevel: is2005F1 ? 0.98 : 0.88,
        harmonicWeights: [0.85, 0.50, 0.72, 0.45, 1.0, 0.32, 0.28, 0.48],
        chestFormantHz: 230,
        chestFormantGain: 1.5,
        chestFormantQ: 1.1,
        formantHz: is2005F1 ? 1480 : 1260,
        formantGain: is2005F1 ? 6.5 : 5.8,
        formantQ: 2.4,
        pulseDepth: 0.0,
        pulseRateScale: 0.25,
        pulseWaveform: 'sine',
        pulseRpmFade: 1.0,
        oscCombustionType: 'sawtooth',
        oscHarmonicType: 'sawtooth',
        oscSubType: 'triangle',
        idleFilterCutoff: is2005F1 ? 340 : 285,
        wotFilterCutoff: is2005F1 ? 3400 : 3150,
        filterQ: is2005F1 ? 3.5 : 3.0,
        distortionDrive: 23,
        combustionGain: is2005F1 ? 0.38 : 0.36,
        profileGain: 0.90,
        engineOutputGain: 0.90,
        intakeLevel: 0.11,
        intakeCenterHz: 1900,
        intakeHighRpmThreshold: 0.5,
        hasHybridWhine: false,
        hybridWhineLevel: 0.0,
        mguLaunchDominant: false,
        hasTurboFlutter: false,
        turboSpoolPitch: 0,
        turboSpoolLevel: 0,
        gearWhineLevel: is2005F1 ? 0.14 : 0.10,
        gearWhinePitchScale: is2005F1 ? 1.3 : 1.1,
        revLimiterRateHz: is2005F1 ? 21 : 19,
        flatShiftCutMs: is2005F1 ? 42 : 48,
        hasExhaustCrackles: true,
        crackleIntensity: 1.35,
      };
    }

    case 'gt3_crossplane_v8':
    case 'gt4_crossplane_v8': {
      const isGt3 = sp === 'gt3_crossplane_v8';
      return {
        type: 'V8_CROSSPLANE',
        soundProfile: sp,
        name: isGt3
          ? 'IMSA GTD Cross-Plane NA V8 (Mustang / AMG / RC F)'
          : 'IMSA GS Cross-Plane V8 (Mustang GT4)',
        cylinders: 8,
        idleRpm: 780,
        redlineRpm: 7600,
        baseIdleHz: 48,
        maxRedlineHz: 224,
        subRatio: 0.5,
        midHarmonicRatio: 1.5,
        highHarmonicRatio: 2.0,
        subLevel: 1.05,
        midLevel: 0.76,
        highLevel: 0.36,
        harmonicWeights: [1.0, 0.82, 0.45, 0.48, 0.18, 0.16, 0.06, 0.04],
        chestFormantHz: 155,
        chestFormantGain: 7.5,
        chestFormantQ: 1.3,
        formantHz: 410,
        formantGain: 3.5,
        formantQ: 1.2,
        pulseDepth: 0.38,
        pulseRateScale: 0.17,
        pulseWaveform: 'sawtooth',
        pulseRpmFade: 0.65,
        oscCombustionType: 'sawtooth',
        oscHarmonicType: 'square',
        oscSubType: 'triangle',
        idleFilterCutoff: 235,
        wotFilterCutoff: isGt3 ? 2550 : 2250,
        filterQ: 1.6,
        distortionDrive: 29,
        combustionGain: 0.38,
        profileGain: 0.90,
        engineOutputGain: 0.90,
        intakeLevel: isGt3 ? 0.08 : 0.10,
        intakeCenterHz: 920,
        intakeHighRpmThreshold: 0.6,
        hasHybridWhine: false,
        hybridWhineLevel: 0.0,
        mguLaunchDominant: false,
        hasTurboFlutter: false,
        turboSpoolPitch: 0,
        turboSpoolLevel: 0,
        gearWhineLevel: isGt3 ? 0.10 : 0.05,
        gearWhinePitchScale: 0.95,
        revLimiterRateHz: 16,
        flatShiftCutMs: isGt3 ? 46 : 28,
        hasExhaustCrackles: true,
        crackleIntensity: 1.55,
      };
    }

    case 'gt3_turbo_i6':
    case 'gt4_turbo_i6':
    case 'coupe_turbo_i6': {
      const isGt3 = sp === 'gt3_turbo_i6';
      const isGt4 = sp === 'gt4_turbo_i6';
      return {
        type: 'INLINE6_TURBO',
        soundProfile: sp,
        name: isGt3 ? 'IMSA GTD Twin-Turbo Inline-6 (BMW M4 GT3)' : 'Twin-Turbo Inline-6',
        cylinders: 6,
        idleRpm: 820,
        redlineRpm: 7600,
        baseIdleHz: 56,
        maxRedlineHz: 210,
        subRatio: 0.5,
        midHarmonicRatio: 2.0,
        highHarmonicRatio: 3.0,
        subLevel: 0.72,
        midLevel: 0.80,
        highLevel: 0.36,
        harmonicWeights: [1.0, 0.65, 0.58, 0.32, 0.16, 0.12, 0.04, 0.02],
        chestFormantHz: 185,
        chestFormantGain: 5.0,
        chestFormantQ: 1.3,
        formantHz: 540,
        formantGain: 3.5,
        formantQ: 1.5,
        pulseDepth: 0.05,
        pulseRateScale: 0.24,
        pulseWaveform: 'sine',
        pulseRpmFade: 0.5,
        oscCombustionType: 'sawtooth',
        oscHarmonicType: 'triangle',
        oscSubType: 'sine',
        idleFilterCutoff: 235,
        wotFilterCutoff: isGt3 ? 1480 : 1320,
        filterQ: 1.7,
        distortionDrive: 20,
        combustionGain: 0.36,
        profileGain: 0.90,
        engineOutputGain: 0.90,
        intakeLevel: isGt3 ? 0.06 : 0.11,
        intakeCenterHz: 1200,
        intakeHighRpmThreshold: 0.55,
        hasHybridWhine: false,
        hybridWhineLevel: 0.0,
        mguLaunchDominant: false,
        hasTurboFlutter: true,
        turboSpoolPitch: 1.14,
        turboSpoolLevel: 0.11,
        gearWhineLevel: isGt3 ? 0.10 : isGt4 ? 0.05 : 0.02,
        gearWhinePitchScale: 1.0,
        revLimiterRateHz: 17,
        flatShiftCutMs: isGt3 ? 45 : isGt4 ? 26 : 0,
        hasExhaustCrackles: true,
        crackleIntensity: 1.2,
      };
    }

    case 'gt3_turbo_v6':
    case 'gt4_turbo_v6':
    case 'coupe_turbo_v6': {
      const isGt3 = sp === 'gt3_turbo_v6';
      const isGt4 = sp === 'gt4_turbo_v6';
      return {
        type: 'V6_TURBO_HYBRID',
        soundProfile: sp,
        name: isGt3 ? 'IMSA GTD Twin-Turbo V6 (Ferrari 296 / NSX)' : 'Twin-Turbo V6',
        cylinders: 6,
        idleRpm: 880,
        redlineRpm: 8200,
        baseIdleHz: 58,
        maxRedlineHz: 218,
        subRatio: 0.5,
        midHarmonicRatio: 1.5,
        highHarmonicRatio: 2.5,
        subLevel: 0.78,
        midLevel: 0.76,
        highLevel: 0.34,
        harmonicWeights: [1.0, 0.58, 0.64, 0.28, 0.14, 0.10, 0.04, 0.02],
        chestFormantHz: 195,
        chestFormantGain: 5.5,
        chestFormantQ: 1.3,
        formantHz: 490,
        formantGain: 3.4,
        formantQ: 1.4,
        pulseDepth: 0.10,
        pulseRateScale: 0.22,
        pulseWaveform: 'triangle',
        pulseRpmFade: 0.6,
        oscCombustionType: 'sawtooth',
        oscHarmonicType: 'triangle',
        oscSubType: 'sine',
        idleFilterCutoff: 230,
        wotFilterCutoff: isGt3 ? 1380 : 1240,
        filterQ: 1.6,
        distortionDrive: 19,
        combustionGain: 0.36,
        profileGain: 0.90,
        engineOutputGain: 0.90,
        intakeLevel: isGt3 ? 0.06 : 0.10,
        intakeCenterHz: 1300,
        intakeHighRpmThreshold: 0.55,
        hasHybridWhine: false,
        hybridWhineLevel: 0.0,
        mguLaunchDominant: false,
        hasTurboFlutter: true,
        turboSpoolPitch: 1.24,
        turboSpoolLevel: 0.11,
        gearWhineLevel: isGt3 ? 0.10 : isGt4 ? 0.05 : 0.02,
        gearWhinePitchScale: 1.02,
        revLimiterRateHz: 17,
        flatShiftCutMs: isGt3 ? 45 : isGt4 ? 26 : 0,
        hasExhaustCrackles: true,
        crackleIntensity: 1.2,
      };
    }

    case 'gt3_turbo_v8':
    case 'gt4_turbo_v8': {
      const isGt3 = sp === 'gt3_turbo_v8';
      const isCrossplaneTurbo = carId.includes('bentley') || carId.includes('aston') || carId.includes('amg');
      return {
        type: isCrossplaneTurbo ? 'V8_CROSSPLANE' : 'V8_FLATPLANE',
        soundProfile: sp,
        name: isGt3 ? 'IMSA GTD Twin-Turbo V8 (McLaren 720S / Vantage / Bentley)' : 'IMSA GS Twin-Turbo V8',
        cylinders: 8,
        idleRpm: 820,
        redlineRpm: 7800,
        baseIdleHz: isCrossplaneTurbo ? 50 : 58,
        maxRedlineHz: isCrossplaneTurbo ? 215 : 240,
        subRatio: 0.5,
        midHarmonicRatio: isCrossplaneTurbo ? 1.5 : 2.0,
        highHarmonicRatio: 2.5,
        subLevel: 0.88,
        midLevel: 0.76,
        highLevel: 0.34,
        harmonicWeights: isCrossplaneTurbo
          ? [1.0, 0.76, 0.40, 0.42, 0.14, 0.10, 0.04, 0.02]
          : [1.0, 0.80, 0.26, 0.54, 0.12, 0.16, 0.05, 0.03],
        chestFormantHz: 170,
        chestFormantGain: 6.0,
        chestFormantQ: 1.25,
        formantHz: 520,
        formantGain: 3.0,
        formantQ: 1.3,
        pulseDepth: isCrossplaneTurbo ? 0.22 : 0.08,
        pulseRateScale: 0.19,
        pulseWaveform: 'triangle',
        pulseRpmFade: 0.65,
        oscCombustionType: 'sawtooth',
        oscHarmonicType: 'triangle',
        oscSubType: 'sine',
        idleFilterCutoff: 230,
        wotFilterCutoff: isGt3 ? 1320 : 1180,
        filterQ: 1.5,
        distortionDrive: 22,
        combustionGain: 0.36,
        profileGain: 0.90,
        engineOutputGain: 0.90,
        intakeLevel: isGt3 ? 0.05 : 0.09,
        intakeCenterHz: 1150,
        intakeHighRpmThreshold: 0.6,
        hasHybridWhine: false,
        hybridWhineLevel: 0.0,
        mguLaunchDominant: false,
        hasTurboFlutter: true,
        turboSpoolPitch: 1.06,
        turboSpoolLevel: 0.11,
        gearWhineLevel: isGt3 ? 0.10 : 0.04,
        gearWhinePitchScale: 0.98,
        revLimiterRateHz: 16,
        flatShiftCutMs: isGt3 ? 44 : 25,
        hasExhaustCrackles: true,
        crackleIntensity: 1.25,
      };
    }

    case 'gt4_flat6':
      return {
        type: 'FLAT6_BOXER',
        soundProfile: sp,
        name: 'IMSA GS 4.0L NA Flat-6 (Porsche 718 Cayman GT4 RS)',
        cylinders: 6,
        idleRpm: 880,
        redlineRpm: 9000,
        baseIdleHz: 60,
        maxRedlineHz: 256,
        subRatio: 0.5,
        midHarmonicRatio: 3.0,
        highHarmonicRatio: 6.0,
        subLevel: 0.52,
        midLevel: 0.86,
        highLevel: 0.64,
        harmonicWeights: [0.92, 0.58, 0.94, 0.42, 0.30, 0.66, 0.18, 0.22],
        chestFormantHz: 215,
        chestFormantGain: 3.0,
        chestFormantQ: 1.3,
        formantHz: 1220,
        formantGain: 4.8,
        formantQ: 2.0,
        pulseDepth: 0.20,
        pulseRateScale: 0.30,
        pulseWaveform: 'triangle',
        pulseRpmFade: 0.4,
        oscCombustionType: 'sawtooth',
        oscHarmonicType: 'triangle',
        oscSubType: 'sawtooth',
        idleFilterCutoff: 260,
        wotFilterCutoff: 2550,
        filterQ: 2.5,
        distortionDrive: 19,
        combustionGain: 0.36,
        profileGain: 0.90,
        engineOutputGain: 0.90,
        intakeLevel: 0.17,
        intakeCenterHz: 1700,
        intakeHighRpmThreshold: 0.55,
        hasHybridWhine: false,
        hybridWhineLevel: 0.0,
        mguLaunchDominant: false,
        hasTurboFlutter: false,
        turboSpoolPitch: 0,
        turboSpoolLevel: 0,
        gearWhineLevel: 0.05,
        gearWhinePitchScale: 1.0,
        revLimiterRateHz: 18,
        flatShiftCutMs: 26,
        hasExhaustCrackles: true,
        crackleIntensity: 1.15,
      };

    case 'gt4_turbo_i4':
    case 'coupe_turbo_i4': {
      const isGt4 = sp === 'gt4_turbo_i4';
      return {
        type: 'INLINE4_TURBO',
        soundProfile: sp,
        name: isGt4 ? 'IMSA GS Turbo Inline-4 (Alpine A110 GT4)' : 'Turbo Inline-4 Hot Hatch',
        cylinders: 4,
        idleRpm: 850,
        redlineRpm: 7200,
        baseIdleHz: 48,
        maxRedlineHz: 165,
        subRatio: 0.5,
        midHarmonicRatio: 2.0,
        highHarmonicRatio: 2.5,
        subLevel: 0.70,
        midLevel: 0.78,
        highLevel: 0.40,
        harmonicWeights: [1.0, 0.72, 0.42, 0.40, 0.18, 0.12, 0.05, 0.03],
        chestFormantHz: 190,
        chestFormantGain: 4.0,
        chestFormantQ: 1.3,
        formantHz: 510,
        formantGain: 3.4,
        formantQ: 1.5,
        pulseDepth: 0.16,
        pulseRateScale: 0.24,
        pulseWaveform: 'triangle',
        pulseRpmFade: 0.65,
        oscCombustionType: 'sawtooth',
        oscHarmonicType: 'triangle',
        oscSubType: 'sawtooth',
        idleFilterCutoff: 255,
        wotFilterCutoff: 1580,
        filterQ: 1.8,
        distortionDrive: 19,
        combustionGain: 0.36,
        profileGain: 0.90,
        engineOutputGain: 0.90,
        intakeLevel: 0.15,
        intakeCenterHz: 1350,
        intakeHighRpmThreshold: 0.45,
        hasHybridWhine: false,
        hybridWhineLevel: 0.0,
        mguLaunchDominant: false,
        hasTurboFlutter: true,
        turboSpoolPitch: 1.28,
        turboSpoolLevel: 0.10,
        gearWhineLevel: isGt4 ? 0.04 : 0.02,
        gearWhinePitchScale: 0.95,
        revLimiterRateHz: 16,
        flatShiftCutMs: isGt4 ? 22 : 0,
        hasExhaustCrackles: true,
        crackleIntensity: 1.25,
      };
    }

    case 'coupe_na_v6':
      return {
        type: 'V6_TURBO_HYBRID',
        soundProfile: sp,
        name: '3.0L NA V6 (Renault Clio V6)',
        cylinders: 6,
        idleRpm: 880,
        redlineRpm: 7200,
        baseIdleHz: 56,
        maxRedlineHz: 205,
        subRatio: 0.5,
        midHarmonicRatio: 1.5,
        highHarmonicRatio: 3.0,
        subLevel: 0.65,
        midLevel: 0.84,
        highLevel: 0.55,
        harmonicWeights: [1.0, 0.65, 0.72, 0.42, 0.22, 0.24, 0.09, 0.06],
        chestFormantHz: 210,
        chestFormantGain: 4.5,
        chestFormantQ: 1.4,
        formantHz: 680,
        formantGain: 4.2,
        formantQ: 1.6,
        pulseDepth: 0.10,
        pulseRateScale: 0.24,
        pulseWaveform: 'triangle',
        pulseRpmFade: 0.5,
        oscCombustionType: 'sawtooth',
        oscHarmonicType: 'triangle',
        oscSubType: 'sine',
        idleFilterCutoff: 265,
        wotFilterCutoff: 2450,
        filterQ: 2.0,
        distortionDrive: 20,
        combustionGain: 0.36,
        profileGain: 0.90,
        engineOutputGain: 0.90,
        intakeLevel: 0.16,
        intakeCenterHz: 1450,
        intakeHighRpmThreshold: 0.48,
        hasHybridWhine: false,
        hybridWhineLevel: 0.0,
        mguLaunchDominant: false,
        hasTurboFlutter: false,
        turboSpoolPitch: 0,
        turboSpoolLevel: 0,
        gearWhineLevel: 0.03,
        gearWhinePitchScale: 0.9,
        revLimiterRateHz: 16,
        flatShiftCutMs: 0,
        hasExhaustCrackles: true,
        crackleIntensity: 1.1,
      };

    case 'supercar_flatplane_v8':
      return {
        type: 'V8_FLATPLANE',
        soundProfile: sp,
        name: 'Exotic Supercar Flat-Plane V8',
        cylinders: 8,
        idleRpm: 940,
        redlineRpm: 8800,
        baseIdleHz: 64,
        maxRedlineHz: 280,
        subRatio: 0.5,
        midHarmonicRatio: 2.0,
        highHarmonicRatio: 4.0,
        subLevel: 0.52,
        midLevel: 0.86,
        highLevel: 0.74,
        harmonicWeights: [0.95, 1.0, 0.28, 0.80, 0.16, 0.44, 0.12, 0.22],
        chestFormantHz: 220,
        chestFormantGain: 3.0,
        chestFormantQ: 1.2,
        formantHz: 940,
        formantGain: 5.0,
        formantQ: 1.7,
        pulseDepth: 0.06,
        pulseRateScale: 0.24,
        pulseWaveform: 'triangle',
        pulseRpmFade: 0.8,
        oscCombustionType: 'sawtooth',
        oscHarmonicType: 'sawtooth',
        oscSubType: 'sine',
        idleFilterCutoff: 270,
        wotFilterCutoff: 2850,
        filterQ: 2.2,
        distortionDrive: 22,
        combustionGain: 0.38,
        profileGain: 0.90,
        engineOutputGain: 0.90,
        intakeLevel: 0.10,
        intakeCenterHz: 1550,
        intakeHighRpmThreshold: 0.58,
        hasHybridWhine:
          carId.includes('918') || carId.includes('mclaren-w1'),
        hybridWhineLevel: 0.06,
        mguLaunchDominant: false,
        hasTurboFlutter: !carId.includes('918'),
        turboSpoolPitch: 1.18,
        turboSpoolLevel: !carId.includes('918') ? 0.09 : 0.0,
        gearWhineLevel: 0.05,
        gearWhinePitchScale: 1.0,
        revLimiterRateHz: 18,
        flatShiftCutMs: 32,
        hasExhaustCrackles: true,
        crackleIntensity: 1.25,
      };

    case 'supercar_v6_hybrid':
      return {
        type: 'V6_TURBO_HYBRID',
        soundProfile: sp,
        name: 'Exotic V6 Twin-Turbo Hybrid (296 GTB / F80)',
        cylinders: 6,
        idleRpm: 950,
        redlineRpm: 8800,
        baseIdleHz: 62,
        maxRedlineHz: 255,
        subRatio: 0.5,
        midHarmonicRatio: 2.0,
        highHarmonicRatio: 3.0,
        subLevel: 0.54,
        midLevel: 0.86,
        highLevel: 0.68,
        harmonicWeights: [1.0, 0.68, 0.76, 0.44, 0.24, 0.34, 0.12, 0.10],
        chestFormantHz: 215,
        chestFormantGain: 3.2,
        chestFormantQ: 1.3,
        formantHz: 880,
        formantGain: 4.8,
        formantQ: 1.8,
        pulseDepth: 0.06,
        pulseRateScale: 0.24,
        pulseWaveform: 'sine',
        pulseRpmFade: 0.7,
        oscCombustionType: 'sawtooth',
        oscHarmonicType: 'sawtooth',
        oscSubType: 'sine',
        idleFilterCutoff: 265,
        wotFilterCutoff: 2450,
        filterQ: 2.2,
        distortionDrive: 21,
        combustionGain: 0.36,
        profileGain: 0.90,
        engineOutputGain: 0.90,
        intakeLevel: 0.09,
        intakeCenterHz: 1550,
        intakeHighRpmThreshold: 0.58,
        hasHybridWhine: true,
        hybridWhineLevel: 0.07,
        mguLaunchDominant: false,
        hasTurboFlutter: true,
        turboSpoolPitch: 1.3,
        turboSpoolLevel: 0.10,
        gearWhineLevel: 0.05,
        gearWhinePitchScale: 1.05,
        revLimiterRateHz: 18,
        flatShiftCutMs: 32,
        hasExhaustCrackles: true,
        crackleIntensity: 1.25,
      };

    case 'f1_v6_hybrid':
    default:
      return {
        type: 'V6_TURBO_HYBRID',
        soundProfile: 'f1_v6_hybrid',
        name: 'Formula 1 1.6L V6 Turbo Hybrid',
        cylinders: 6,
        idleRpm: 3900,
        redlineRpm: 15000,
        baseIdleHz: 86,
        maxRedlineHz: 335,
        subRatio: 0.5,
        midHarmonicRatio: 2.0,
        highHarmonicRatio: 3.5,
        subLevel: 0.42,
        midLevel: 0.90,
        highLevel: 0.88,
        harmonicWeights: [0.92, 0.72, 0.82, 0.48, 0.30, 0.42, 0.18, 0.16],
        chestFormantHz: 230,
        chestFormantGain: 2.0,
        chestFormantQ: 1.2,
        formantHz: 1020,
        formantGain: 5.0,
        formantQ: 2.1,
        pulseDepth: 0.04,
        pulseRateScale: 0.25,
        pulseWaveform: 'sine',
        pulseRpmFade: 0.8,
        oscCombustionType: 'sawtooth',
        oscHarmonicType: 'sawtooth',
        oscSubType: 'sine',
        idleFilterCutoff: 310,
        wotFilterCutoff: 3200,
        filterQ: 2.8,
        distortionDrive: 22,
        combustionGain: 0.38,
        profileGain: 0.90,
        engineOutputGain: 0.90,
        intakeLevel: 0.07,
        intakeCenterHz: 1800,
        intakeHighRpmThreshold: 0.6,
        hasHybridWhine: true,
        hybridWhineLevel: 0.10,
        mguLaunchDominant: false,
        hasTurboFlutter: true,
        turboSpoolPitch: 1.58,
        turboSpoolLevel: 0.12,
        gearWhineLevel: 0.12,
        gearWhinePitchScale: 1.25,
        revLimiterRateHz: 20,
        flatShiftCutMs: 44,
        hasExhaustCrackles: true,
        crackleIntensity: 1.35,
      };
  }
}

/**
 * Resolves the specific multi-layered acoustic profile for a vehicle,
 * applying any user-tuned Sound Studio overrides stored in localStorage.
 */
export function resolveAcousticProfile(
  carId: string = '',
  engineType: CarSpec['engineType'] = 'v8-hybrid',
  classId?: CarClassId,
  explicitProfile?: SoundProfileId,
): AcousticProfile {
  const sp = explicitProfile ?? inferSoundProfileId(carId, engineType, classId);
  const base = getBaseAcousticProfile(sp, carId);
  const overrides = loadSoundProfileOverrides()[sp];
  if (!overrides) return base;
  return {
    ...base,
    ...overrides,
    harmonicWeights: overrides.harmonicWeights ?? base.harmonicWeights,
  };
}

/**
 * Computes physical crankHz, firingHz = crankHz * (cylinders / 2),
 * fundamental baseHz (45..380 Hz), harmonic layers, and low-pass sweep.
 */
export function computeWarmFundamentalHz(
  profile: AcousticProfile,
  rpmNorm: number,
  throttle = 0,
): {
  rpm: number;
  crankHz: number;
  firingHz: number;
  baseHz: number;
  subHz: number;
  midHz: number;
  highHz: number;
  filterHz: number;
} {
  if (profile.type === 'ELECTRIC_EV' || profile.cylinders <= 0) {
    return {
      rpm: 0,
      crankHz: 0,
      firingHz: 0,
      baseHz: 0,
      subHz: 0,
      midHz: 0,
      highHz: 0,
      filterHz: profile.idleFilterCutoff,
    };
  }

  const clampedRpm = Math.max(0, Math.min(1, rpmNorm));
  const clampedThrottle = Math.max(0, Math.min(1, throttle));

  const rpm = profile.idleRpm + clampedRpm * (profile.redlineRpm - profile.idleRpm);
  const crankHz = rpm / 60;
  const firingHz = crankHz * (profile.cylinders / 2);

  const rawIdle = (profile.idleRpm / 60) * (profile.cylinders / 2);
  const rawRedline = (profile.redlineRpm / 60) * (profile.cylinders / 2);
  const normSweep = rawRedline > rawIdle ? (firingHz - rawIdle) / (rawRedline - rawIdle) : clampedRpm;

  const baseHz = Math.max(
    45,
    Math.min(
      380,
      profile.baseIdleHz + normSweep * (profile.maxRedlineHz - profile.baseIdleHz),
    ),
  );
  const subHz = baseHz * profile.subRatio;
  const midHz = baseHz * profile.midHarmonicRatio;
  const highHz = baseHz * (profile.highHarmonicRatio ?? 2.5);

  const filterBlend = Math.min(1, clampedRpm * 0.48 + clampedThrottle * 0.52);
  const filterHz =
    profile.idleFilterCutoff + (profile.wotFilterCutoff - profile.idleFilterCutoff) * filterBlend;

  return {
    rpm,
    crankHz,
    firingHz,
    baseHz,
    subHz,
    midHz,
    highHz,
    filterHz,
  };
}
