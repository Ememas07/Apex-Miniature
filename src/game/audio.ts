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
  baseIdleHz: number; // warm fundamental at idle (70..85 Hz)
  maxRedlineHz: number; // warm fundamental at redline (190..255 Hz)
  subRatio: number; // sub-octave crankshaft rumble (0.5x)
  midHarmonicRatio: number; // midrange harmonic layer (1.5x, 2.0x, or 2.5x)
  highHarmonicRatio?: number; // high scream layer (e.g. 3.0x or 3.5x for F1 / V10 / V12)
  oscCombustionType: OscillatorType;
  oscHarmonicType: OscillatorType;
  oscSubType: OscillatorType;
  idleFilterCutoff: number; // 260 Hz at idle
  wotFilterCutoff: number; // 1,150..2,200 Hz at WOT
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
      gearWhineLevel: 0.20,
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
      idleRpm: is2005F1 ? 4000 : 950,
      redlineRpm: is2005F1 ? 19000 : 8800,
      baseIdleHz: is2005F1 ? 84 : 80,
      maxRedlineHz: 240,
      subRatio: 0.5,
      midHarmonicRatio: 2.5,
      highHarmonicRatio: is2005F1 ? 3.5 : 3.0,
      oscCombustionType: 'sawtooth',
      oscHarmonicType: 'sawtooth',
      oscSubType: 'triangle',
      idleFilterCutoff: is2005F1 ? 320 : 280,
      wotFilterCutoff: is2005F1 ? 2400 : 2200,
      filterQ: is2005F1 ? 3.5 : 3.2,
      distortionDrive: 24,
      combustionGain: is2005F1 ? 0.22 : 0.20,
      profileGain: 1.05,
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
      baseIdleHz: 82,
      maxRedlineHz: 238,
      subRatio: 0.5,
      midHarmonicRatio: 2.0,
      highHarmonicRatio: 3.0,
      oscCombustionType: 'sawtooth',
      oscHarmonicType: 'sawtooth',
      oscSubType: 'sine',
      idleFilterCutoff: 270,
      wotFilterCutoff: 2100,
      filterQ: 2.5,
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
      maxRedlineHz: 218,
      subRatio: 0.5,
      midHarmonicRatio: 1.5,
      highHarmonicRatio: 2.2,
      oscCombustionType: 'sawtooth',
      oscHarmonicType: 'triangle',
      oscSubType: 'sawtooth',
      idleFilterCutoff: 260,
      wotFilterCutoff: 1750,
      filterQ: 2.8,
      distortionDrive: 20,
      combustionGain: 0.19,
      profileGain: 1.08,
      hasHybridWhine: false,
      hybridWhineLevel: 0.0,
      hasTurboFlutter: false,
      turboSpoolPitch: 0,
      turboSpoolLevel: 0,
      gearWhineLevel: 0.10,
      hasExhaustCrackles: true,
      crackleIntensity: 1.20,
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
      oscCombustionType: 'sawtooth',
      oscHarmonicType: 'triangle',
      oscSubType: 'sine',
      idleFilterCutoff: 260,
      wotFilterCutoff: 1550,
      filterQ: 2.0,
      distortionDrive: 22,
      combustionGain: 0.19,
      profileGain: 1.08,
      hasHybridWhine: false,
      hybridWhineLevel: 0.0,
      hasTurboFlutter: true,
      turboSpoolPitch: 1.05,
      turboSpoolLevel: 0.12,
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
      baseIdleHz: 68,
      maxRedlineHz: 195,
      subRatio: 0.5,
      midHarmonicRatio: 2.0,
      highHarmonicRatio: 2.5,
      oscCombustionType: 'sawtooth',
      oscHarmonicType: 'square',
      oscSubType: 'triangle',
      idleFilterCutoff: 250,
      wotFilterCutoff: 1250,
      filterQ: 1.6,
      distortionDrive: 26,
      combustionGain: 0.21,
      profileGain: 1.10,
      hasHybridWhine: carId.includes('cadillac'),
      hybridWhineLevel: 0.06,
      hasTurboFlutter: carId.includes('amg') || carId.includes('aston'),
      turboSpoolPitch: 0.95,
      turboSpoolLevel: 0.08,
      gearWhineLevel: 0.08,
      hasExhaustCrackles: true,
      crackleIntensity: 1.30,
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
      baseIdleHz: 72,
      maxRedlineHz: 216,
      subRatio: 0.5,
      midHarmonicRatio: 2.0,
      highHarmonicRatio: 2.5,
      oscCombustionType: 'sawtooth',
      oscHarmonicType: 'sawtooth',
      oscSubType: 'sine',
      idleFilterCutoff: 260,
      wotFilterCutoff: 1650,
      filterQ: 2.0,
      distortionDrive: 22,
      combustionGain: 0.19,
      profileGain: 1.05,
      hasHybridWhine: !isNonHybrid,
      hybridWhineLevel: 0.08,
      hasTurboFlutter: !isNonHybrid,
      turboSpoolPitch: 1.10,
      turboSpoolLevel: 0.10,
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
      oscCombustionType: 'sawtooth',
      oscHarmonicType: 'triangle',
      oscSubType: 'sawtooth',
      idleFilterCutoff: 260,
      wotFilterCutoff: 1400,
      filterQ: 1.8,
      distortionDrive: 20,
      combustionGain: 0.18,
      profileGain: 1.12,
      hasHybridWhine: false,
      hybridWhineLevel: 0.0,
      hasTurboFlutter: true,
      turboSpoolPitch: 1.15,
      turboSpoolLevel: 0.14,
      gearWhineLevel: 0.06,
      hasExhaustCrackles: true,
      crackleIntensity: 1.20,
    };
  }

  // 9. V6 Turbo Hybrid Deep Baritone + MGU-K Spool (F1 2026/2021, Ferrari 296, Acura ARX-06, Peugeot 9X8, Toyota GR010, Alpine A424, Renault RS01, Clio V6)
  return {
    type: 'V6_TURBO_HYBRID',
    name: isF1Modern ? 'Formula 1 1.6L V6 Turbo Hybrid' : 'V6 Turbo Hybrid Deep Baritone & Spool',
    cylinders: 6,
    idleRpm: isF1Modern ? 3800 : 900,
    redlineRpm: isF1Modern ? 15000 : 8300,
    baseIdleHz: isF1Modern ? 80 : 70,
    maxRedlineHz: isF1Modern ? 228 : 205,
    subRatio: 0.5,
    midHarmonicRatio: 2.0,
    highHarmonicRatio: isF1Modern ? 3.0 : 2.5,
    oscCombustionType: 'sawtooth',
    oscHarmonicType: 'triangle',
    oscSubType: 'sine',
    idleFilterCutoff: 260,
    wotFilterCutoff: isF1Modern ? 1800 : 1350,
    filterQ: 1.8,
    distortionDrive: 21,
    combustionGain: isF1Modern ? 0.20 : 0.18,
    profileGain: 1.06,
    hasHybridWhine: true,
    hybridWhineLevel: isF1Modern ? 0.14 : 0.09,
    hasTurboFlutter: true,
    turboSpoolPitch: 1.25,
    turboSpoolLevel: 0.15,
    gearWhineLevel: isF1Modern ? 0.14 : 0.08,
    hasExhaustCrackles: true,
    crackleIntensity: 1.30,
  };
}

/**
 * Computes the warm fundamental combustion frequency:
 * Scales firing frequency (RPM / 60) * (cylinders / 2) * 0.45 cleanly into
 * the warm [baseIdleHz, maxRedlineHz] (68..240 Hz) musical range without early ceiling clipping.
 */
export function computeWarmFundamentalHz(
  profile: AcousticProfile,
  rpmNorm: number,
  throttle = 0,
): { baseHz: number; subHz: number; midHz: number; filterHz: number } {
  if (profile.type === 'ELECTRIC_EV') {
    return { baseHz: 0, subHz: 0, midHz: 0, filterHz: profile.idleFilterCutoff };
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

  const filterBlend = Math.min(1, clampedRpm * 0.45 + clampedThrottle * 0.55);
  const filterHz =
    profile.idleFilterCutoff + (profile.wotFilterCutoff - profile.idleFilterCutoff) * filterBlend;

  return {
    baseHz,
    subHz,
    midHz,
    filterHz,
  };
}
