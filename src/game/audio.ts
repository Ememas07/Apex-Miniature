import { CarClassId, CarSpec } from './types';

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
  name: string;
  cylinders: number;
  idleRpm: number;
  redlineRpm: number;
  baseIdleHz: number; // warm fundamental at idle (68..96 Hz)
  maxRedlineHz: number; // warm fundamental at redline (190..255 Hz)
  subRatio: number; // sub-octave crankshaft rumble (0.5x)
  midHarmonicRatio: number; // midrange harmonic layer (1.5x, 2.0x, or 2.5x)
  highHarmonicRatio?: number; // high scream layer (e.g. 3.0x or 3.5x for F1 / V10 / V12)
  subLevel?: number; // relative amplitude for sub-octave oscillator
  midLevel?: number; // relative amplitude for mid harmonic oscillator
  highLevel?: number; // relative amplitude for high scream oscillator
  pulseDepth?: number; // cylinder-order uneven firing modulation depth (V8 crossplane / boxer)
  formantHz?: number; // exhaust resonance peak frequency
  formantGain?: number; // exhaust resonance peak gain (dB)
  oscCombustionType: OscillatorType;
  oscHarmonicType: OscillatorType;
  oscSubType: OscillatorType;
  idleFilterCutoff: number; // 250..340 Hz at idle
  wotFilterCutoff: number; // 1,250..2,500 Hz at WOT
  filterQ: number;
  distortionDrive: number;
  combustionGain: number;
  profileGain: number; // Output gain calibration for loudness normalization
  hasHybridWhine: boolean;
  hybridWhineLevel: number;
  hasTurboFlutter: boolean;
  turboSpoolPitch: number;
  turboSpoolLevel: number;
  gearWhineLevel: number; // Straight-cut dog-ring transmission whine
  hasExhaustCrackles: boolean;
  crackleIntensity: number;
}

/**
 * Generates an analogue-style soft-clipping saturation curve for WaveShaperNode.
 * Smoothly rounds off harsh peaks, eliminating mosquito buzz and adding harmonic warmth.
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
 * Resolves the specific acoustic profile for a vehicle by carId, engineType, and classId.
 */
export function resolveAcousticProfile(
  carId: string = '',
  engineType: CarSpec['engineType'] = 'v8-hybrid',
  classId?: CarClassId,
): AcousticProfile {
  // 1. Formula E: strictly pure electric inverter whine + straight-cut reduction gears
  if (classId === CarClassId.FORMULA_E || engineType === 'electric' || carId.startsWith('fe-')) {
    return {
      type: 'ELECTRIC_EV',
      name: 'Formula E Inverter & Reduction Gearbox',
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
      pulseDepth: 0,
      formantHz: 1800,
      formantGain: 2.0,
      oscCombustionType: 'sine',
      oscHarmonicType: 'triangle',
      oscSubType: 'sine',
      idleFilterCutoff: 1600,
      wotFilterCutoff: 3800,
      filterQ: 2.2,
      distortionDrive: 8,
      combustionGain: 0.0, // Strictly zero combustion noise!
      profileGain: 1.25,
      hasHybridWhine: true,
      hybridWhineLevel: 0.24,
      hasTurboFlutter: false,
      turboSpoolPitch: 0,
      turboSpoolLevel: 0,
      gearWhineLevel: 0.22,
      hasExhaustCrackles: false,
      crackleIntensity: 0,
    };
  }

  const isF1Modern =
    classId === CarClassId.F1_2026 ||
    classId === CarClassId.F1_2021 ||
    carId.startsWith('f1-26') ||
    carId.startsWith('f1-21');

  // 2. 2005 F1 & High-Revving V10 NA (McLaren MP4-20, Renault R25, Audi R8, Lamborghini Temerario, Huracan)
  const is2005F1 = classId === CarClassId.F1_2005 || carId.startsWith('f1-05');
  const isV10 =
    !isF1Modern &&
    (engineType === 'v10' ||
      carId.includes('r8') ||
      carId.includes('temerario') ||
      carId.includes('huracan'));
  if (is2005F1 || isV10) {
    return {
      type: 'V10_NA',
      name: is2005F1 ? 'F1 3.0L V10 19,000 RPM Screamer' : 'V10 Naturally Aspirated Resonant Howl',
      cylinders: 10,
      idleRpm: is2005F1 ? 4200 : 950,
      redlineRpm: is2005F1 ? 19000 : 8800,
      baseIdleHz: is2005F1 ? 86 : 82,
      maxRedlineHz: is2005F1 ? 240 : 236,
      subRatio: 0.5,
      midHarmonicRatio: 2.5,
      highHarmonicRatio: is2005F1 ? 3.5 : 3.0,
      subLevel: 0.35,
      midLevel: 0.92,
      highLevel: is2005F1 ? 0.95 : 0.78,
      pulseDepth: 0.0,
      formantHz: is2005F1 ? 1240 : 980,
      formantGain: is2005F1 ? 5.5 : 4.5,
      oscCombustionType: 'sawtooth',
      oscHarmonicType: 'sawtooth',
      oscSubType: 'triangle',
      idleFilterCutoff: is2005F1 ? 340 : 280,
      wotFilterCutoff: is2005F1 ? 2550 : 2200,
      filterQ: is2005F1 ? 3.6 : 3.1,
      distortionDrive: 24,
      combustionGain: is2005F1 ? 0.22 : 0.20,
      profileGain: 1.04,
      hasHybridWhine: false,
      hybridWhineLevel: 0.0,
      hasTurboFlutter: false,
      turboSpoolPitch: 0,
      turboSpoolLevel: 0,
      gearWhineLevel: is2005F1 ? 0.16 : 0.08,
      hasExhaustCrackles: true,
      crackleIntensity: 1.4,
    };
  }

  // 3. V12 NA Screaming Harmonic Wail (Aston Valkyrie LMH & Road)
  const isV12 = !isF1Modern && (engineType === 'v12' || carId.includes('valkyrie'));
  if (isV12) {
    return {
      type: 'V12_NA',
      name: 'V12 Naturally Aspirated Screaming Wail',
      cylinders: 12,
      idleRpm: 1050,
      redlineRpm: 11100,
      baseIdleHz: 84,
      maxRedlineHz: 242,
      subRatio: 0.5,
      midHarmonicRatio: 2.0,
      highHarmonicRatio: 3.0,
      subLevel: 0.40,
      midLevel: 0.90,
      highLevel: 0.88,
      pulseDepth: 0.0,
      formantHz: 1040,
      formantGain: 5.0,
      oscCombustionType: 'sawtooth',
      oscHarmonicType: 'sawtooth',
      oscSubType: 'sine',
      idleFilterCutoff: 280,
      wotFilterCutoff: 2250,
      filterQ: 2.6,
      distortionDrive: 22,
      combustionGain: 0.20,
      profileGain: 1.02,
      hasHybridWhine: false,
      hybridWhineLevel: 0.0,
      hasTurboFlutter: false,
      turboSpoolPitch: 0,
      turboSpoolLevel: 0,
      gearWhineLevel: 0.12,
      hasExhaustCrackles: true,
      crackleIntensity: 1.25,
    };
  }

  // 4. Flat-6 Boxer Metallic Pulse (Porsche 911 GT3 R, 718 Cayman GT4, 992 GT3 RS)
  const isFlat6 =
    !isF1Modern &&
    (engineType === 'flat6' ||
      (carId.includes('porsche') &&
        !carId.includes('963') &&
        !carId.includes('918') &&
        engineType !== 'v8-hybrid' &&
        !carId.startsWith('fe-')) ||
      carId.includes('911') ||
      carId.includes('718') ||
      carId.includes('cayman'));
  if (isFlat6) {
    return {
      type: 'FLAT6_BOXER',
      name: 'Flat-6 Boxer Metallic Pulse',
      cylinders: 6,
      idleRpm: 900,
      redlineRpm: 9000,
      baseIdleHz: 74,
      maxRedlineHz: 220,
      subRatio: 0.5,
      midHarmonicRatio: 1.5,
      highHarmonicRatio: 2.25,
      subLevel: 0.58,
      midLevel: 0.88,
      highLevel: 0.72,
      pulseDepth: 0.22,
      formantHz: 860,
      formantGain: 4.8,
      oscCombustionType: 'sawtooth',
      oscHarmonicType: 'triangle',
      oscSubType: 'sawtooth',
      idleFilterCutoff: 265,
      wotFilterCutoff: 1850,
      filterQ: 2.9,
      distortionDrive: 21,
      combustionGain: 0.19,
      profileGain: 1.08,
      hasHybridWhine: false,
      hybridWhineLevel: 0.0,
      hasTurboFlutter: false,
      turboSpoolPitch: 0,
      turboSpoolLevel: 0,
      gearWhineLevel: 0.11,
      hasExhaustCrackles: true,
      crackleIntensity: 1.25,
    };
  }

  // 5. Inline-6 Turbo Resonant Growl + Spool (BMW M4 GT3, BMW M4 GT4, BMW M2 CS, Toyota Supra GT4, Nissan GT-R Nismo)
  const isI6 =
    !isF1Modern &&
    (engineType === 'turbo-i6' ||
      carId.includes('bmw-m4') ||
      carId.includes('m2-cs') ||
      carId.includes('supra') ||
      carId.includes('gtr-nismo'));
  if (isI6) {
    return {
      type: 'INLINE6_TURBO',
      name: 'Inline-6 Turbo Resonant Growl & Spool',
      cylinders: 6,
      idleRpm: 820,
      redlineRpm: 7600,
      baseIdleHz: 72,
      maxRedlineHz: 208,
      subRatio: 0.5,
      midHarmonicRatio: 2.0,
      highHarmonicRatio: 2.5,
      subLevel: 0.68,
      midLevel: 0.80,
      highLevel: 0.48,
      pulseDepth: 0.05,
      formantHz: 560,
      formantGain: 3.8,
      oscCombustionType: 'sawtooth',
      oscHarmonicType: 'triangle',
      oscSubType: 'sine',
      idleFilterCutoff: 260,
      wotFilterCutoff: 1580,
      filterQ: 2.0,
      distortionDrive: 22,
      combustionGain: 0.19,
      profileGain: 1.08,
      hasHybridWhine: false,
      hybridWhineLevel: 0.0,
      hasTurboFlutter: true,
      turboSpoolPitch: 1.15,
      turboSpoolLevel: 0.16,
      gearWhineLevel: 0.09,
      hasExhaustCrackles: true,
      crackleIntensity: 1.15,
    };
  }

  // 6. V8 Crossplane Deep Bass Burble (Cadillac V-Series.R, Corvette Z06 GT3/Coupe, Mustang GT3/GT4, AMG GT3/GT4, Lexus RC F, Bentley)
  const isV8Crossplane =
    !isF1Modern &&
    (carId.includes('cadillac-vseries') ||
      carId.includes('corvette') ||
      carId.includes('mustang') ||
      carId.includes('amg') ||
      carId.includes('lexus-rcf') ||
      carId.includes('bentley') ||
      carId.includes('aston-vantage'));
  if (isV8Crossplane) {
    return {
      type: 'V8_CROSSPLANE',
      name: 'V8 Crossplane Deep Bass Burble',
      cylinders: 8,
      idleRpm: 800,
      redlineRpm: 7800,
      baseIdleHz: 66,
      maxRedlineHz: 188,
      subRatio: 0.5,
      midHarmonicRatio: 1.5,
      highHarmonicRatio: 2.25,
      subLevel: 0.95,
      midLevel: 0.68,
      highLevel: 0.36,
      pulseDepth: 0.32,
      formantHz: 320,
      formantGain: 4.5,
      oscCombustionType: 'sawtooth',
      oscHarmonicType: 'square',
      oscSubType: 'triangle',
      idleFilterCutoff: 240,
      wotFilterCutoff: 1220,
      filterQ: 1.6,
      distortionDrive: 28,
      combustionGain: 0.21,
      profileGain: 1.10,
      hasHybridWhine: carId.includes('cadillac'),
      hybridWhineLevel: 0.06,
      hasTurboFlutter: carId.includes('amg') || carId.includes('aston'),
      turboSpoolPitch: 0.95,
      turboSpoolLevel: carId.includes('amg') || carId.includes('aston') ? 0.11 : 0.0,
      gearWhineLevel: 0.08,
      hasExhaustCrackles: true,
      crackleIntensity: 1.35,
    };
  }

  // 7. V8 Flatplane Crisp Bark (Ferrari 499P, Porsche 963/918, McLaren 720S/750S/W1, Koenigsegg Jesko, BMW M Hybrid V8, Oreca 07)
  const isV8Flatplane =
    !isF1Modern &&
    (engineType === 'v8-hybrid' ||
      carId.includes('499p') ||
      carId.includes('963') ||
      carId.includes('918') ||
      carId.includes('bmw-m-hybrid') ||
      carId.includes('oreca') ||
      carId.includes('mclaren') ||
      carId.includes('jesko') ||
      carId.includes('lamborghini-sc63') ||
      carId.includes('genesis-gmr') ||
      carId.includes('glickenhaus') ||
      carId.includes('sf90'));
  if (isV8Flatplane) {
    const isNonHybrid =
      carId.includes('valkyrie') ||
      carId.includes('glickenhaus') ||
      carId.includes('scg-007') ||
      carId.includes('oreca');
    return {
      type: 'V8_FLATPLANE',
      name: 'V8 Flatplane Crisp Bark',
      cylinders: 8,
      idleRpm: 920,
      redlineRpm: 8600,
      baseIdleHz: 73,
      maxRedlineHz: 218,
      subRatio: 0.5,
      midHarmonicRatio: 2.0,
      highHarmonicRatio: 2.5,
      subLevel: 0.54,
      midLevel: 0.85,
      highLevel: 0.68,
      pulseDepth: 0.08,
      formantHz: 680,
      formantGain: 4.0,
      oscCombustionType: 'sawtooth',
      oscHarmonicType: 'sawtooth',
      oscSubType: 'sine',
      idleFilterCutoff: 265,
      wotFilterCutoff: 1720,
      filterQ: 2.1,
      distortionDrive: 22,
      combustionGain: 0.19,
      profileGain: 1.05,
      hasHybridWhine: !isNonHybrid,
      hybridWhineLevel: 0.08,
      hasTurboFlutter: !isNonHybrid,
      turboSpoolPitch: 1.15,
      turboSpoolLevel: !isNonHybrid ? 0.13 : 0.0,
      gearWhineLevel: 0.10,
      hasExhaustCrackles: true,
      crackleIntensity: 1.25,
    };
  }

  // 8. Inline-4 Turbo Punchy Growl (Toyota GR Yaris, Honda Civic Type R, Alpine A110 GT4)
  const isI4 =
    !isF1Modern &&
    (engineType === 'turbo-i4' ||
      carId.includes('yaris') ||
      carId.includes('civic') ||
      (carId.includes('clio') && !carId.includes('clio-v6')) ||
      carId.includes('alpine-a110'));
  if (isI4) {
    return {
      type: 'INLINE4_TURBO',
      name: 'Inline-4 Turbo Punchy Growl',
      cylinders: 4,
      idleRpm: 850,
      redlineRpm: 7200,
      baseIdleHz: 70,
      maxRedlineHz: 198,
      subRatio: 0.5,
      midHarmonicRatio: 2.0,
      highHarmonicRatio: 2.2,
      subLevel: 0.72,
      midLevel: 0.78,
      highLevel: 0.42,
      pulseDepth: 0.16,
      formantHz: 480,
      formantGain: 3.5,
      oscCombustionType: 'sawtooth',
      oscHarmonicType: 'triangle',
      oscSubType: 'sawtooth',
      idleFilterCutoff: 260,
      wotFilterCutoff: 1420,
      filterQ: 1.8,
      distortionDrive: 20,
      combustionGain: 0.18,
      profileGain: 1.12,
      hasHybridWhine: false,
      hybridWhineLevel: 0.0,
      hasTurboFlutter: true,
      turboSpoolPitch: 1.25,
      turboSpoolLevel: 0.18,
      gearWhineLevel: 0.06,
      hasExhaustCrackles: true,
      crackleIntensity: 1.25,
    };
  }

  // 9. V6 Turbo Hybrid (F1 2026/2021 high-revving scream + MGU-K/turbo whistle, or GT3/GTP V6 baritone + spool)
  return {
    type: 'V6_TURBO_HYBRID',
    name: isF1Modern ? 'Formula 1 1.6L V6 Turbo Hybrid' : 'V6 Turbo Hybrid Deep Baritone & Spool',
    cylinders: 6,
    idleRpm: isF1Modern ? 3900 : 900,
    redlineRpm: isF1Modern ? 15000 : 8300,
    baseIdleHz: isF1Modern ? 86 : 70,
    maxRedlineHz: isF1Modern ? 238 : 206,
    subRatio: 0.5,
    midHarmonicRatio: 2.0,
    highHarmonicRatio: isF1Modern ? 3.5 : 2.5,
    subLevel: isF1Modern ? 0.44 : 0.78,
    midLevel: isF1Modern ? 0.90 : 0.80,
    highLevel: isF1Modern ? 0.88 : 0.46,
    pulseDepth: isF1Modern ? 0.04 : 0.12,
    formantHz: isF1Modern ? 940 : 460,
    formantGain: isF1Modern ? 4.5 : 4.0,
    oscCombustionType: 'sawtooth',
    oscHarmonicType: isF1Modern ? 'sawtooth' : 'triangle',
    oscSubType: 'sine',
    idleFilterCutoff: isF1Modern ? 310 : 255,
    wotFilterCutoff: isF1Modern ? 2350 : 1420,
    filterQ: isF1Modern ? 2.8 : 1.9,
    distortionDrive: isF1Modern ? 23 : 21,
    combustionGain: isF1Modern ? 0.21 : 0.19,
    profileGain: 1.05,
    hasHybridWhine: true,
    hybridWhineLevel: isF1Modern ? 0.15 : 0.09,
    hasTurboFlutter: true,
    turboSpoolPitch: isF1Modern ? 1.55 : 1.25,
    turboSpoolLevel: isF1Modern ? 0.22 : 0.18,
    gearWhineLevel: isF1Modern ? 0.14 : 0.08,
    hasExhaustCrackles: true,
    crackleIntensity: 1.30,
  };
}

/**
 * Computes the warm fundamental combustion frequency:
 * Scales firing frequency (RPM / 60) * (cylinders / 2) * 0.45 cleanly into
 * the warm [baseIdleHz, maxRedlineHz] (66..255 Hz) musical range without early ceiling clipping.
 */
export function computeWarmFundamentalHz(
  profile: AcousticProfile,
  rpmNorm: number,
  throttle = 0,
): { baseHz: number; subHz: number; midHz: number; highHz: number; filterHz: number } {
  if (profile.type === 'ELECTRIC_EV') {
    return { baseHz: 0, subHz: 0, midHz: 0, highHz: 0, filterHz: profile.idleFilterCutoff };
  }

  const clampedRpm = Math.max(0, Math.min(1, rpmNorm));
  const clampedThrottle = Math.max(0, Math.min(1, throttle));

  // Raw firing rate at idle & redline using f_base = (RPM / 60) * (cylinders / 2) * 0.45
  const rawIdle = (profile.idleRpm / 60) * (profile.cylinders / 2) * 0.45;
  const rawRedline = (profile.redlineRpm / 60) * (profile.cylinders / 2) * 0.45;
  const rpm = profile.idleRpm + clampedRpm * (profile.redlineRpm - profile.idleRpm);
  const rawCurrent = (rpm / 60) * (profile.cylinders / 2) * 0.45;

  // Normalize firing sweep across [baseIdleHz, maxRedlineHz] so high-revving V10/V12 sweep smoothly across gears
  const normSweep = rawRedline > rawIdle ? (rawCurrent - rawIdle) / (rawRedline - rawIdle) : clampedRpm;
  const baseHz = Math.max(
    profile.baseIdleHz,
    Math.min(profile.maxRedlineHz, profile.baseIdleHz + normSweep * (profile.maxRedlineHz - profile.baseIdleHz)),
  );
  const subHz = baseHz * profile.subRatio; // 0.5x crankshaft rumble
  const midHz = baseHz * profile.midHarmonicRatio; // 1.5x, 2.0x, or 2.5x midrange harmonic
  const highHz = baseHz * (profile.highHarmonicRatio ?? 2.5); // 2.2x..3.5x upper-RPM harmonic scream

  const filterBlend = Math.min(1, clampedRpm * 0.45 + clampedThrottle * 0.55);
  const filterHz =
    profile.idleFilterCutoff + (profile.wotFilterCutoff - profile.idleFilterCutoff) * filterBlend;

  return {
    baseHz,
    subHz,
    midHz,
    highHz,
    filterHz,
  };
}
