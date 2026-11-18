import { AcousticProfile, computeWarmFundamentalHz, makeSoftClippingCurve } from '../game/audio';

export interface ReferenceAudioWindow {
  name: string;
  startSec: number;
  durationSec: number;
  totalDurationSec: number;
  sampleRate: number;
  monoData: Float32Array;
  buffer: AudioBuffer;
}

export interface ExtractedSpectralFeatures {
  firingHz: number;
  estimatedRpm: number;
  rpmNorm: number;
  inferredCylinders: number;
  inferredIdleRpm: number;
  inferredRedlineRpm: number;
  subLevel: number;
  harmonicWeights: number[];
  wotFilterCutoff: number;
  distortionDrive: number;
  turboSpoolLevel: number;
  gearWhineLevel: number;
  hasHybrid: boolean;
  hasTurbo: boolean;
}

export interface AutoFitProgress {
  step: number;
  totalSteps: number;
  loss: number;
  candidate: AcousticProfile;
  features: ExtractedSpectralFeatures;
}

/**
 * Extracts mono channel PCM Float32Array from an AudioBuffer.
 */
export function getMonoChannelData(buffer: AudioBuffer): Float32Array {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;
  if (numChannels === 1) {
    return buffer.getChannelData(0);
  }
  const mono = new Float32Array(length);
  for (let c = 0; c < numChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      mono[i] += ch[i] / numChannels;
    }
  }
  return mono;
}

/**
 * Slices a specific startSec window from an AudioBuffer.
 */
export function sliceReferenceWindow(
  buffer: AudioBuffer,
  startSec: number,
  durationSec = 2.0,
  name = 'Reference Clip',
): ReferenceAudioWindow {
  const sampleRate = buffer.sampleRate;
  const mono = getMonoChannelData(buffer);
  const totalDurationSec = buffer.duration;

  const clampedStartSec = Math.max(0, Math.min(Math.max(0, totalDurationSec - 0.5), startSec));
  const actualDurationSec = Math.min(durationSec, Math.max(0.5, totalDurationSec - clampedStartSec));

  const startSample = Math.floor(clampedStartSec * sampleRate);
  const windowSamples = Math.floor(actualDurationSec * sampleRate);
  const windowMono = mono.subarray(startSample, Math.min(mono.length, startSample + windowSamples));

  return {
    name,
    startSec: Number(clampedStartSec.toFixed(2)),
    durationSec: Number(actualDurationSec.toFixed(2)),
    totalDurationSec: Number(totalDurationSec.toFixed(2)),
    sampleRate,
    monoData: windowMono,
    buffer,
  };
}

/**
 * Automatically scans an AudioBuffer to select the cleanest, most sustained high-energy
 * 2.0-second engine pull window (avoiding silence, gear shifts, and idle coasting).
 */
export function findCleanestEngineWindow(
  buffer: AudioBuffer,
  name = 'Reference Clip',
  windowDurationSec = 2.0,
): ReferenceAudioWindow {
  const sampleRate = buffer.sampleRate;
  const mono = getMonoChannelData(buffer);
  const totalDuration = buffer.duration;

  if (totalDuration <= windowDurationSec) {
    return {
      name,
      startSec: 0,
      durationSec: totalDuration,
      totalDurationSec: totalDuration,
      sampleRate,
      monoData: mono,
      buffer,
    };
  }

  const windowSamples = Math.floor(windowDurationSec * sampleRate);
  const stepSamples = Math.floor(0.2 * sampleRate); // 200ms step
  const maxStart = mono.length - windowSamples;

  let bestStart = 0;
  let bestScore = -Infinity;

  for (let start = 0; start <= maxStart; start += stepSamples) {
    let sumSq = 0;
    let highFreqEnergy = 0;
    const stride = 4;
    const count = Math.floor(windowSamples / stride);
    for (let i = 0; i < windowSamples; i += stride) {
      const s = mono[start + i];
      sumSq += s * s;
      if (i > 0) {
        const diff = s - mono[start + i - 1];
        highFreqEnergy += diff * diff;
      }
    }
    const rms = Math.sqrt(sumSq / Math.max(1, count));
    const hfRatio = highFreqEnergy / (sumSq + 1e-6);

    // Score combines sustained amplitude and spectral density
    const score = rms * 0.75 + Math.min(1.0, hfRatio) * 0.25;
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }

  const startSec = Number((bestStart / sampleRate).toFixed(2));
  const windowMono = mono.subarray(bestStart, bestStart + windowSamples);

  return {
    name,
    startSec,
    durationSec: windowDurationSec,
    totalDurationSec: Number(totalDuration.toFixed(2)),
    sampleRate,
    monoData: windowMono,
    buffer,
  };
}

/**
 * Resamples an AudioBuffer window to standard 22,050 Hz mono Float32Array in C++ via OfflineAudioContext.
 */
export async function resampleWindowTo22k(
  buffer: AudioBuffer,
  startSec: number,
  durationSec = 1.5,
  sampleRate = 22050,
): Promise<Float32Array> {
  const totalSamples = Math.max(128, Math.floor(durationSec * sampleRate));
  const offlineCtx = new OfflineAudioContext(1, totalSamples, sampleRate);
  const src = offlineCtx.createBufferSource();
  src.buffer = buffer;
  src.connect(offlineCtx.destination);
  src.start(0, Math.max(0, startSec), durationSec);
  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0);
}

/**
 * High-speed Radix-2 Cooley-Tukey FFT implementation with precomputed bit-reversal and twiddle factors.
 */
class FastRadix2FFT {
  public readonly n: number;
  private readonly cosTable: Float32Array;
  private readonly sinTable: Float32Array;
  private readonly bitRev: Uint32Array;

  constructor(n = 1024) {
    this.n = n;
    this.cosTable = new Float32Array(n / 2);
    this.sinTable = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      const angle = (-2 * Math.PI * i) / n;
      this.cosTable[i] = Math.cos(angle);
      this.sinTable[i] = Math.sin(angle);
    }
    this.bitRev = new Uint32Array(n);
    const levels = Math.round(Math.log2(n));
    for (let i = 0; i < n; i++) {
      let rev = 0;
      for (let j = 0; j < levels; j++) {
        rev = (rev << 1) | ((i >> j) & 1);
      }
      this.bitRev[i] = rev;
    }
  }

  public transform(realIn: Float32Array, realOut: Float32Array, imagOut: Float32Array): void {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const rev = this.bitRev[i];
      realOut[i] = realIn[rev];
      imagOut[i] = 0;
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0; j < half; j++) {
          const k = j * step;
          const cos = this.cosTable[k];
          const sin = this.sinTable[k];
          const tr = cos * realOut[i + j + half] - sin * imagOut[i + j + half];
          const ti = sin * realOut[i + j + half] + cos * imagOut[i + j + half];
          realOut[i + j + half] = realOut[i + j] - tr;
          imagOut[i + j + half] = imagOut[i + j] - ti;
          realOut[i + j] += tr;
          imagOut[i + j] += ti;
        }
      }
    }
  }
}

const FFT_SIZE = 1024;
const HOP_SIZE = 256;
const fftInstance = new FastRadix2FFT(FFT_SIZE);

// Precomputed Hann window for FFT_SIZE
const HANN_WINDOW = new Float32Array(FFT_SIZE);
for (let i = 0; i < FFT_SIZE; i++) {
  HANN_WINDOW[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
}

export interface STFTFeatures {
  logSTFT: Float32Array[]; // [numFrames][numBins]
  avgLogMag: Float32Array; // [halfFft]
  avgMag: Float32Array; // [halfFft]
  spectralCentroid: number;
  f0Contour: Float32Array;
  medianF0: number;
  harmonicRatios: number[]; // [0.5x, 1x, 2x, 3x, 4x, 5x, 6x]
}

/**
 * Computes STFT log-magnitude frames, fundamental firing contour f0(t),
 * and harmonic ratios from mono PCM at 22,050 Hz.
 */
export function extractSTFTFeatures(
  pcm: Float32Array,
  sampleRate = 22050,
): STFTFeatures {
  const halfFft = FFT_SIZE / 2;
  const binHz = sampleRate / FFT_SIZE;
  const numFrames = Math.max(1, Math.floor((pcm.length - FFT_SIZE) / HOP_SIZE));

  const frameRealIn = new Float32Array(FFT_SIZE);
  const frameRealOut = new Float32Array(FFT_SIZE);
  const frameImagOut = new Float32Array(FFT_SIZE);

  const logSTFT: Float32Array[] = [];
  const avgMag = new Float32Array(halfFft);
  const f0Contour = new Float32Array(numFrames);

  // Focus bounds for engine firing frequency: 45 Hz .. 650 Hz
  const minBin = Math.max(2, Math.floor(45 / binHz));
  const maxBin = Math.min(halfFft - 1, Math.ceil(650 / binHz));

  let totalCentroidSum = 0;
  let totalCentroidCount = 0;

  for (let f = 0; f < numFrames; f++) {
    const offset = f * HOP_SIZE;
    for (let i = 0; i < FFT_SIZE; i++) {
      frameRealIn[i] = pcm[offset + i] * HANN_WINDOW[i];
    }

    fftInstance.transform(frameRealIn, frameRealOut, frameImagOut);

    const frameLog = new Float32Array(halfFft);
    const frameMag = new Float32Array(halfFft);

    let frameNum = 0;
    let frameDenom = 0;

    for (let k = 0; k < halfFft; k++) {
      const mag = Math.sqrt(frameRealOut[k] * frameRealOut[k] + frameImagOut[k] * frameImagOut[k]);
      frameMag[k] = mag;
      avgMag[k] += mag;
      frameLog[k] = Math.log(mag + 1e-4);

      const freq = k * binHz;
      frameNum += freq * mag;
      frameDenom += mag;
    }

    if (frameDenom > 1e-6) {
      totalCentroidSum += frameNum / frameDenom;
      totalCentroidCount++;
    }

    logSTFT.push(frameLog);

    // Harmonic Product Spectrum (order 3) for robust f0 detection
    let bestBin = minBin;
    let bestHps = -Infinity;
    for (let b = minBin; b <= maxBin; b++) {
      const h1 = frameMag[b];
      const h2 = b * 2 < halfFft ? frameMag[b * 2] : 0;
      const h3 = b * 3 < halfFft ? frameMag[b * 3] : 0;
      const hps = h1 * (0.6 + h2 * 0.4) * (0.6 + h3 * 0.3);
      if (hps > bestHps) {
        bestHps = hps;
        bestBin = b;
      }
    }
    f0Contour[f] = bestBin * binHz;
  }

  for (let k = 0; k < halfFft; k++) {
    avgMag[k] /= numFrames;
  }

  const avgLogMag = new Float32Array(halfFft);
  for (let k = 0; k < halfFft; k++) {
    avgLogMag[k] = Math.log(avgMag[k] + 1e-4);
  }

  // Median f0 to filter out transient anomalies
  const sortedF0 = Float32Array.from(f0Contour).sort();
  const medianF0 = sortedF0[Math.floor(sortedF0.length / 2)] || 120;

  // Extract harmonic peak amplitudes at multiples [0.5, 1, 2, 3, 4, 5, 6]
  const getHarmonicPeak = (multiple: number): number => {
    const targetHz = medianF0 * multiple;
    const centerBin = Math.round(targetHz / binHz);
    if (centerBin < 1 || centerBin >= halfFft) return 0.05;
    let maxVal = 0;
    for (let delta = -2; delta <= 2; delta++) {
      const idx = centerBin + delta;
      if (idx >= 0 && idx < halfFft) {
        maxVal = Math.max(maxVal, avgMag[idx]);
      }
    }
    return maxVal;
  };

  const fundAmp = Math.max(0.001, getHarmonicPeak(1.0));
  const harmonicRatios = [
    Number((getHarmonicPeak(0.5) / fundAmp).toFixed(3)),
    1.0,
    Number((getHarmonicPeak(2.0) / fundAmp).toFixed(3)),
    Number((getHarmonicPeak(3.0) / fundAmp).toFixed(3)),
    Number((getHarmonicPeak(4.0) / fundAmp).toFixed(3)),
    Number((getHarmonicPeak(5.0) / fundAmp).toFixed(3)),
    Number((getHarmonicPeak(6.0) / fundAmp).toFixed(3)),
  ];

  const spectralCentroid = totalCentroidCount > 0 ? totalCentroidSum / totalCentroidCount : 1200;

  return {
    logSTFT,
    avgLogMag,
    avgMag,
    spectralCentroid,
    f0Contour,
    medianF0,
    harmonicRatios,
  };
}

/**
 * Analyzes reference audio to extract physical automotive engine features:
 * - Fundamental firing frequency
 * - Inferred cylinders, idle RPM, and redline RPM
 * - Harmonic series weights
 * - Low-pass muffler roll-off cutoff
 * - Saturation drive level
 */
export function analyzeReferenceAudio(
  mono: Float32Array,
  sampleRate: number,
  fallbackCylinders = 8,
  fallbackIdle = 1000,
  fallbackRedline = 8800,
): ExtractedSpectralFeatures {
  const features = extractSTFTFeatures(mono, sampleRate);
  const firingHz = features.medianF0;
  const binHz = sampleRate / FFT_SIZE;
  const halfFft = FFT_SIZE / 2;

  // Infer most plausible cylinder count [4, 6, 8, 10, 12]
  const cylinderCandidates = [4, 6, 8, 10, 12];
  let inferredCylinders = fallbackCylinders > 0 ? fallbackCylinders : 8;
  let bestScore = -Infinity;

  for (const c of cylinderCandidates) {
    const rpm = (firingHz * 120) / c;
    // IMSA/GT engine sweet spot: ~2,500 - 8,500 RPM
    let score = 0;
    if (rpm >= 2200 && rpm <= 9000) {
      score += 10 - Math.abs(rpm - 5500) / 700;
    } else {
      score -= Math.abs(rpm - 5500) / 400;
    }
    if (c === fallbackCylinders) score += 4; // Bias toward modal's current configuration
    if (score > bestScore) {
      bestScore = score;
      inferredCylinders = c;
    }
  }

  const estimatedRpm = Math.round((firingHz * 120) / inferredCylinders);
  const inferredIdleRpm = Math.max(750, Math.min(1400, Math.round((fallbackIdle > 0 ? fallbackIdle : 950) / 50) * 50));
  const inferredRedlineRpm = Math.max(6800, Math.min(11500, Math.round((fallbackRedline > 0 ? fallbackRedline : 8800) / 100) * 100));

  const rpmNorm = Math.max(
    0.05,
    Math.min(0.98, (estimatedRpm - inferredIdleRpm) / Math.max(1, inferredRedlineRpm - inferredIdleRpm)),
  );

  const [rawSub, w1, rawH2, rawH3, rawH4, rawH5, rawH6] = features.harmonicRatios;
  const subLevel = Number(Math.min(1.3, Math.max(0.15, rawSub * 0.9)).toFixed(2));
  const w2 = Number(Math.min(1.4, Math.max(0.1, rawH2)).toFixed(2));
  const w3 = Number(Math.min(1.4, Math.max(0.05, rawH3)).toFixed(2));
  const w4 = Number(Math.min(1.3, Math.max(0.04, rawH4)).toFixed(2));
  const w5 = Number(Math.min(1.2, Math.max(0.03, rawH5)).toFixed(2));
  const w6 = Number(Math.min(1.1, Math.max(0.02, rawH6)).toFixed(2));
  const harmonicWeights = [1.0, w2, w3, w4, w5, w6, 0.05, 0.03];

  // Spectral roll-off detection for low-pass cutoff
  let peakVal = 0;
  for (let k = 0; k < halfFft; k++) {
    if (features.avgMag[k] > peakVal) peakVal = features.avgMag[k];
  }
  const threshold = peakVal * 0.16;
  let rollOffBin = Math.floor(1800 / binHz);
  for (let k = Math.floor(1000 / binHz); k < Math.floor(4000 / binHz); k++) {
    if (features.avgMag[k] < threshold && (features.avgMag[k + 1] ?? 0) < threshold) {
      rollOffBin = k;
      break;
    }
  }
  const wotFilterCutoff = Math.max(1200, Math.min(3600, Math.round(rollOffBin * binHz)));

  // Distortion / growl saturation estimation from harmonic sum
  const harmonicSum = w2 + w3 + w4 + w5;
  const distortionDrive = Math.max(12, Math.min(38, Math.round(14 + harmonicSum * 6)));

  // High-frequency whine presence (1.8 kHz - 3.8 kHz)
  let whineEnergy = 0;
  const whineStartBin = Math.floor(1800 / binHz);
  const whineEndBin = Math.min(halfFft - 1, Math.floor(3800 / binHz));
  for (let k = whineStartBin; k <= whineEndBin; k++) {
    whineEnergy += features.avgMag[k];
  }
  const avgWhine = whineEnergy / Math.max(1, whineEndBin - whineStartBin + 1);
  const whineRatio = avgWhine / (features.avgMag[Math.round(firingHz / binHz)] + 1e-4);

  const gearWhineLevel = Number(Math.max(0.04, Math.min(0.24, whineRatio * 0.22)).toFixed(2));
  const turboSpoolLevel = Number(Math.max(0.02, Math.min(0.22, whineRatio * 0.18)).toFixed(2));

  return {
    firingHz: Number(firingHz.toFixed(1)),
    estimatedRpm,
    rpmNorm: Number(rpmNorm.toFixed(2)),
    inferredCylinders,
    inferredIdleRpm,
    inferredRedlineRpm,
    subLevel,
    harmonicWeights,
    wotFilterCutoff,
    distortionDrive,
    turboSpoolLevel,
    gearWhineLevel,
    hasHybrid: inferredCylinders === 6 || inferredCylinders === 8,
    hasTurbo: turboSpoolLevel > 0.08,
  };
}

// Global cached soft-clipping curves for WaveShaperNode
const softClippingCurveCache = new Map<number, Float32Array>();
function getCachedSoftClippingCurve(drive: number): Float32Array {
  const rounded = Math.round(drive);
  let curve = softClippingCurveCache.get(rounded);
  if (!curve) {
    curve = makeSoftClippingCurve(rounded, 1024);
    if (softClippingCurveCache.size > 64) softClippingCurveCache.clear();
    softClippingCurveCache.set(rounded, curve);
  }
  return curve;
}

/**
 * Fast C++ synthesis evaluation of an AcousticProfile candidate using OfflineAudioContext.
 * Renders 1.5s at 22,050 Hz in ~1.5ms.
 */
export async function renderCandidateOffline(
  profile: AcousticProfile,
  rpmNorm: number,
  throttle = 0.85,
  durationSec = 1.5,
  sampleRate = 22050,
): Promise<Float32Array> {
  const totalSamples = Math.floor(durationSec * sampleRate);
  const offlineCtx = new OfflineAudioContext(1, totalSamples, sampleRate);

  const { baseHz, subHz, midHz, highHz } = computeWarmFundamentalHz(
    profile,
    rpmNorm,
    throttle,
  );

  // 1. PeriodicWave Combustion Oscillator
  const real = new Float32Array(16);
  const imag = new Float32Array(16);
  const sub = Math.max(0, profile.subLevel ?? 0.65);
  const weights = profile.harmonicWeights;
  const w1 = weights[0] ?? 1.0;
  const w2 = weights[1] ?? 0.7;
  const w3 = weights[2] ?? 0.5;
  const w4 = weights[3] ?? 0.4;
  const w5 = weights[4] ?? 0.2;
  const w6 = weights[5] ?? 0.15;

  imag[1] = sub * 1.0;
  imag[2] = w1 * 1.0;
  imag[3] = 0.18 * (w1 + w2);
  imag[4] = w2 * 0.95;
  imag[5] = 0.14 * (w2 + w3);
  imag[6] = w3 * 0.92;
  imag[7] = 0.10 * (w3 + w4);
  imag[8] = w4 * 0.88;
  imag[9] = 0.08 * (w4 + w5);
  imag[10] = w5 * 0.85;
  imag[11] = 0.06 * (w5 + w6);
  imag[12] = w6 * 0.82;

  let energy = 0;
  for (let k = 1; k <= 12; k++) {
    energy += imag[k] * imag[k];
  }
  const rms = Math.sqrt(energy) || 1.0;
  const scale = 0.78 / Math.max(0.70, rms * 0.75);
  for (let k = 1; k <= 12; k++) {
    imag[k] *= scale;
  }

  const customWave = offlineCtx.createPeriodicWave(real, imag, { disableNormalization: true });
  const oscComb = offlineCtx.createOscillator();
  oscComb.setPeriodicWave(customWave);
  oscComb.frequency.setValueAtTime(baseHz * 0.5, 0);

  // 2. Harmonic Oscillators
  const oscSub = offlineCtx.createOscillator();
  oscSub.type = profile.oscSubType || 'triangle';
  oscSub.frequency.setValueAtTime(subHz, 0);

  const oscMid = offlineCtx.createOscillator();
  oscMid.type = profile.oscHarmonicType || 'sawtooth';
  oscMid.frequency.setValueAtTime(midHz, 0);

  const oscHigh = offlineCtx.createOscillator();
  oscHigh.type = profile.highLevel && profile.highLevel > 0.65 ? 'sawtooth' : 'triangle';
  oscHigh.frequency.setValueAtTime(highHz, 0);

  // Gains
  const fundGain = offlineCtx.createGain();
  fundGain.gain.setValueAtTime(0.85, 0);
  const subGain = offlineCtx.createGain();
  subGain.gain.setValueAtTime(profile.subLevel ?? 0.65, 0);
  const midGain = offlineCtx.createGain();
  midGain.gain.setValueAtTime((profile.midLevel ?? 0.78) * (0.65 + throttle * 0.35), 0);
  const highGain = offlineCtx.createGain();
  const upperRpmCurve = Math.pow(rpmNorm, 1.35);
  highGain.gain.setValueAtTime((profile.highLevel ?? 0.45) * (0.25 + upperRpmCurve * 0.95), 0);

  oscComb.connect(fundGain);
  oscSub.connect(subGain);
  oscMid.connect(midGain);
  oscHigh.connect(highGain);

  const preMix = offlineCtx.createGain();
  fundGain.connect(preMix);
  subGain.connect(preMix);
  midGain.connect(preMix);
  highGain.connect(preMix);

  // Pulse modulation LFO if pulseDepth > 0
  if ((profile.pulseDepth ?? 0) > 0.05) {
    const pulseScale = profile.pulseRateScale ?? 0.22;
    const pulseHz = Math.max(9, baseHz * pulseScale);
    const pulseLfo = offlineCtx.createOscillator();
    pulseLfo.type = profile.pulseWaveform || 'sawtooth';
    pulseLfo.frequency.setValueAtTime(pulseHz, 0);

    const pulseGain = offlineCtx.createGain();
    const rpmFade = 1.0 - (profile.pulseRpmFade ?? 0.65) * Math.pow(rpmNorm, 1.15);
    pulseGain.gain.setValueAtTime((profile.pulseDepth ?? 0) * rpmFade * 0.3, 0);

    pulseLfo.connect(pulseGain);
    pulseGain.connect(preMix.gain);
    pulseLfo.start(0);
    pulseLfo.stop(durationSec);
  }

  // 3. Distortion WaveShaper
  const shaper = offlineCtx.createWaveShaper();
  shaper.curve = getCachedSoftClippingCurve(profile.distortionDrive) as unknown as Float32Array<ArrayBuffer>;
  preMix.connect(shaper);

  // 4. Resonant Exhaust Low-Pass Filter
  const combFilter = offlineCtx.createBiquadFilter();
  combFilter.type = 'lowpass';
  const baseCutoff = profile.wotFilterCutoff || 2800;
  const dynamicCutoff = Math.max(
    650,
    Math.min(4500, baseCutoff * (0.65 + 0.85 * rpmNorm) * (0.8 + throttle * 0.25)),
  );
  combFilter.frequency.setValueAtTime(dynamicCutoff, 0);
  combFilter.Q.setValueAtTime(Math.min(1.8, Math.max(0.5, profile.filterQ || 1.4)), 0);
  shaper.connect(combFilter);

  // 5. Formant Peaking Filters
  const chestRes = offlineCtx.createBiquadFilter();
  chestRes.type = 'peaking';
  chestRes.frequency.setValueAtTime(profile.chestFormantHz, 0);
  chestRes.gain.setValueAtTime(profile.chestFormantGain, 0);
  chestRes.Q.setValueAtTime(profile.chestFormantQ, 0);

  const exhaustRes = offlineCtx.createBiquadFilter();
  exhaustRes.type = 'peaking';
  exhaustRes.frequency.setValueAtTime(profile.formantHz ?? 650, 0);
  exhaustRes.gain.setValueAtTime(profile.formantGain ?? 3.5, 0);
  exhaustRes.Q.setValueAtTime(profile.formantQ ?? 1.6, 0);

  combFilter.connect(chestRes);
  chestRes.connect(exhaustRes);

  const outGain = offlineCtx.createGain();
  outGain.gain.setValueAtTime(0.35, 0);
  exhaustRes.connect(outGain);
  outGain.connect(offlineCtx.destination);

  oscComb.start(0);
  oscSub.start(0);
  oscMid.start(0);
  oscHigh.start(0);

  oscComb.stop(durationSec);
  oscSub.stop(durationSec);
  oscMid.stop(durationSec);
  oscHigh.stop(durationSec);

  const renderedBuffer = await offlineCtx.startRendering();
  return renderedBuffer.getChannelData(0);
}

/**
 * Multi-resolution loss evaluating:
 * 1. Log-STFT spectral distance (timbre & envelope)
 * 2. Harmonic ratios distance (firing order character)
 * 3. Spectral centroid match (brightness & bite)
 */
export function computePresetLoss(
  target: STFTFeatures,
  candidate: STFTFeatures,
): number {
  // 1. Log-STFT spectral loss
  const halfFft = FFT_SIZE / 2;
  let logStftDiff = 0;
  for (let k = 0; k < halfFft; k++) {
    logStftDiff += Math.abs(target.avgLogMag[k] - candidate.avgLogMag[k]);
  }
  const stftLoss = logStftDiff / halfFft;

  // 2. Harmonic ratios loss [0.5x, 2x, 3x, 4x, 5x, 6x]
  let harmDiff = 0;
  for (let i = 0; i < target.harmonicRatios.length; i++) {
    if (i === 1) continue; // Skip 1.0x fundamental reference
    const tRatio = target.harmonicRatios[i] ?? 0;
    const cRatio = candidate.harmonicRatios[i] ?? 0;
    harmDiff += Math.abs(tRatio - cRatio);
  }
  const harmLoss = harmDiff / Math.max(1, target.harmonicRatios.length - 1);

  // 3. Spectral centroid loss
  const centroidLoss =
    Math.abs(target.spectralCentroid - candidate.spectralCentroid) /
    Math.max(1, target.spectralCentroid);

  return Number((stftLoss * 0.45 + harmLoss * 0.40 + centroidLoss * 0.15).toFixed(3));
}

/**
 * Plays a pleasant completion audio chime blip via Web Audio when auto-fitting succeeds.
 */
export function playCompletionBlip(audioContext: AudioContext): void {
  try {
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880.0, now + 0.08); // A5
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + 0.36);
  } catch {
    // Ignore audio blip failures if context is suspended or blocked
  }
}

/**
 * In-browser evolutionary coordinate auto-fitter.
 * Evaluates candidate EngineSoundConfig presets using OfflineAudioContext in ~1.5ms per candidate
 * across 120-180 candidates with live progress and real-time parameter convergence.
 */
export class InBrowserSoundFitter {
  private aborted = false;

  public abort(): void {
    this.aborted = true;
  }

  public isAborted(): boolean {
    return this.aborted;
  }

  public async *runFitting(
    baseProfile: AcousticProfile,
    refWindow: ReferenceAudioWindow,
    totalSteps = 150,
  ): AsyncGenerator<AutoFitProgress, AcousticProfile, void> {
    this.aborted = false;

    // Step 1: Resample 1.5s slice of reference window to standard 22,050 Hz via OfflineAudioContext
    const targetPcm = await resampleWindowTo22k(
      refWindow.buffer,
      refWindow.startSec,
      1.5,
      22050,
    );

    // Step 2: Extract target STFT features and physical acoustic parameters
    const targetFeatures = extractSTFTFeatures(targetPcm, 22050);
    const spectralFeatures = analyzeReferenceAudio(
      targetPcm,
      22050,
      baseProfile.cylinders,
      baseProfile.idleRpm,
      baseProfile.redlineRpm,
    );

    const rpmNorm = spectralFeatures.rpmNorm;

    // Seed best candidate with heuristic estimates
    let bestProfile: AcousticProfile = {
      ...baseProfile,
      subLevel: spectralFeatures.subLevel,
      harmonicWeights: [...spectralFeatures.harmonicWeights],
      wotFilterCutoff: spectralFeatures.wotFilterCutoff,
      distortionDrive: spectralFeatures.distortionDrive,
      gearWhineLevel: spectralFeatures.gearWhineLevel,
      turboSpoolLevel: spectralFeatures.turboSpoolLevel,
    };

    // Initial evaluation
    const initialPcm = await renderCandidateOffline(bestProfile, rpmNorm, 0.85, 1.5, 22050);
    const initialCandFeatures = extractSTFTFeatures(initialPcm, 22050);
    let bestLoss = computePresetLoss(targetFeatures, initialCandFeatures);

    yield {
      step: 1,
      totalSteps,
      loss: bestLoss,
      candidate: bestProfile,
      features: spectralFeatures,
    };

    const targetWeights = spectralFeatures.harmonicWeights;
    const targetCutoff = spectralFeatures.wotFilterCutoff;
    const targetDrive = spectralFeatures.distortionDrive;

    // Coordinate & evolutionary optimization loop (~150 candidates in small batches)
    let step = 1;
    while (step < totalSteps && !this.aborted) {
      const batchSize = 3;
      const progressRatio = step / totalSteps;
      const temperature = Math.max(0.08, 1.0 - progressRatio * 0.85);

      for (let b = 0; b < batchSize && step < totalSteps; b++) {
        step++;
        if (this.aborted) break;

        // Generate coordinate mutant based on optimization stage
        const mutant: AcousticProfile = {
          ...bestProfile,
          harmonicWeights: [...bestProfile.harmonicWeights],
        };

        if (step < totalSteps * 0.45) {
          // Phase 1: Harmonic weights & sub-rumble exploration
          const harmIdx = Math.floor(Math.random() * 6);
          const currentW = mutant.harmonicWeights[harmIdx] ?? 1.0;
          const targetW = targetWeights[harmIdx] ?? currentW;
          const delta = (Math.random() * 2 - 1) * 0.25 * temperature + (targetW - currentW) * 0.15;
          mutant.harmonicWeights[harmIdx] = Number(Math.max(0.02, Math.min(1.5, currentW + delta)).toFixed(2));

          if (Math.random() > 0.5) {
            const currentSub = mutant.subLevel ?? 0.65;
            const subDelta = (Math.random() * 2 - 1) * 0.18 * temperature;
            mutant.subLevel = Number(Math.max(0.1, Math.min(1.3, currentSub + subDelta)).toFixed(2));
          }
        } else if (step < totalSteps * 0.80) {
          // Phase 2: Resonator cutoffs, Q-factors, and saturation drive
          const cutoffDelta = (Math.random() * 2 - 1) * 350 * temperature + (targetCutoff - mutant.wotFilterCutoff) * 0.12;
          mutant.wotFilterCutoff = Math.round(Math.max(1200, Math.min(3800, mutant.wotFilterCutoff + cutoffDelta)));

          const driveDelta = (Math.random() * 2 - 1) * 6 * temperature + (targetDrive - mutant.distortionDrive) * 0.15;
          mutant.distortionDrive = Math.round(Math.max(10, Math.min(42, mutant.distortionDrive + driveDelta)));

          const qDelta = (Math.random() * 2 - 1) * 0.25 * temperature;
          mutant.filterQ = Number(Math.max(0.8, Math.min(2.0, (mutant.filterQ || 1.4) + qDelta)).toFixed(2));

          const chestHzDelta = (Math.random() * 2 - 1) * 20 * temperature;
          mutant.chestFormantHz = Math.round(Math.max(120, Math.min(280, mutant.chestFormantHz + chestHzDelta)));
        } else {
          // Phase 3: Fine tuning harmonic bark, clatter pulse & whines
          const harmIdx = 1 + Math.floor(Math.random() * 5);
          const fineDelta = (Math.random() * 2 - 1) * 0.08 * temperature;
          mutant.harmonicWeights[harmIdx] = Number(
            Math.max(0.02, Math.min(1.5, (mutant.harmonicWeights[harmIdx] ?? 0.5) + fineDelta)).toFixed(2),
          );

          if (Math.random() > 0.6) {
            const whineDelta = (Math.random() * 2 - 1) * 0.04 * temperature;
            mutant.gearWhineLevel = Number(
              Math.max(0.02, Math.min(0.28, (mutant.gearWhineLevel ?? 0.1) + whineDelta)).toFixed(2),
            );
          }
        }

        // Render mutant via OfflineAudioContext in C++
        const candPcm = await renderCandidateOffline(mutant, rpmNorm, 0.85, 1.5, 22050);
        const candFeatures = extractSTFTFeatures(candPcm, 22050);
        const candLoss = computePresetLoss(targetFeatures, candFeatures);

        if (candLoss < bestLoss) {
          bestLoss = candLoss;
          bestProfile = mutant;
        }
      }

      yield {
        step,
        totalSteps,
        loss: bestLoss,
        candidate: bestProfile,
        features: spectralFeatures,
      };

      // Micro-yield to UI thread to maintain 60fps responsiveness and slider animations
      await new Promise((resolve) => setTimeout(resolve, 16));
    }

    return bestProfile;
  }
}
