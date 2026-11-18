import { AcousticProfile, computeWarmFundamentalHz } from '../game/audio';

export interface ReferenceAudioWindow {
  name: string;
  startSec: number;
  durationSec: number;
  sampleRate: number;
  monoData: Float32Array;
  buffer: AudioBuffer;
}

export interface ExtractedSpectralFeatures {
  firingHz: number;
  estimatedRpm: number;
  rpmNorm: number;
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
    // Subsample for fast scanning
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
    const rms = Math.sqrt(sumSq / count);
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
    sampleRate,
    monoData: windowMono,
    buffer,
  };
}

/**
 * Computes the magnitude spectrum of a signal slice using DFT.
 */
function computeAverageSpectrum(
  mono: Float32Array,
  sampleRate: number,
  fftSize = 2048,
  hopSize = 512,
): Float32Array {
  const numFrames = Math.max(1, Math.floor((mono.length - fftSize) / hopSize));
  const halfFft = fftSize / 2;
  const avgMag = new Float32Array(halfFft);

  // Precomputed Hann window
  const window = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
  }

  for (let f = 0; f < numFrames; f++) {
    const offset = f * hopSize;
    // Simple DFT for key frequency bins
    for (let k = 1; k < halfFft; k++) {
      let real = 0;
      let imag = 0;
      const omega = (2 * Math.PI * k) / fftSize;
      // Stride sampling to keep execution fast (< 15ms total)
      const stride = 2;
      for (let n = 0; n < fftSize; n += stride) {
        const val = mono[offset + n] * window[n];
        real += val * Math.cos(omega * n);
        imag -= val * Math.sin(omega * n);
      }
      avgMag[k] += Math.sqrt(real * real + imag * imag);
    }
  }

  for (let k = 0; k < halfFft; k++) {
    avgMag[k] /= numFrames;
  }
  return avgMag;
}

/**
 * Detects fundamental firing frequency and harmonic structure from the reference audio.
 */
export function analyzeReferenceAudio(
  mono: Float32Array,
  sampleRate: number,
  cylinders: number,
  idleRpm: number,
  redlineRpm: number,
): ExtractedSpectralFeatures {
  const fftSize = 2048;
  const halfFft = fftSize / 2;
  const binHz = sampleRate / fftSize;
  const mag = computeAverageSpectrum(mono, sampleRate, fftSize, 1024);

  // Expected firing frequency bounds
  const minFiringHz = cylinders > 0 ? (idleRpm / 60) * (cylinders / 2) * 0.85 : 60;
  const maxFiringHz = cylinders > 0 ? (redlineRpm / 60) * (cylinders / 2) * 1.05 : 450;

  const minBin = Math.max(2, Math.floor(minFiringHz / binHz));
  const maxBin = Math.min(halfFft - 1, Math.ceil(maxFiringHz / binHz));

  // Harmonic Product Spectrum (HPS) for fundamental pitch detection
  let bestBin = minBin;
  let bestHps = -Infinity;

  for (let b = minBin; b <= maxBin; b++) {
    const h1 = mag[b] ?? 0;
    const h2 = b * 2 < halfFft ? mag[b * 2] : 0;
    const h3 = b * 3 < halfFft ? mag[b * 3] : 0;
    const hps = h1 * (0.6 + h2 * 0.4) * (0.6 + h3 * 0.3);
    if (hps > bestHps) {
      bestHps = hps;
      bestBin = b;
    }
  }

  const firingHz = bestBin * binHz;
  const estimatedRpm =
    cylinders > 0
      ? Math.max(idleRpm, Math.min(redlineRpm, Math.round((firingHz * 120) / cylinders)))
      : 8000;
  const rpmNorm =
    redlineRpm > idleRpm
      ? Math.max(0, Math.min(1, (estimatedRpm - idleRpm) / (redlineRpm - idleRpm)))
      : 0.5;

  // Extract harmonic peak amplitudes at 0.5x, 1x, 2x, 3x, 4x, 5x, 6x
  const getHarmonicPeak = (multiple: number): number => {
    const targetHz = firingHz * multiple;
    const centerBin = Math.round(targetHz / binHz);
    if (centerBin < 1 || centerBin >= halfFft) return 0.05;
    let maxVal = 0;
    for (let delta = -2; delta <= 2; delta++) {
      const idx = centerBin + delta;
      if (idx >= 0 && idx < halfFft) {
        maxVal = Math.max(maxVal, mag[idx]);
      }
    }
    return maxVal;
  };

  const fundAmp = Math.max(0.001, getHarmonicPeak(1.0));
  const rawSub = getHarmonicPeak(0.5);
  const rawH2 = getHarmonicPeak(2.0);
  const rawH3 = getHarmonicPeak(3.0);
  const rawH4 = getHarmonicPeak(4.0);
  const rawH5 = getHarmonicPeak(5.0);
  const rawH6 = getHarmonicPeak(6.0);

  // Normalize weights relative to fundamental
  const subLevel = Number(Math.min(1.3, Math.max(0.15, (rawSub / fundAmp) * 0.9)).toFixed(2));
  const w1 = 1.0;
  const w2 = Number(Math.min(1.4, Math.max(0.1, rawH2 / fundAmp)).toFixed(2));
  const w3 = Number(Math.min(1.4, Math.max(0.05, rawH3 / fundAmp)).toFixed(2));
  const w4 = Number(Math.min(1.3, Math.max(0.04, rawH4 / fundAmp)).toFixed(2));
  const w5 = Number(Math.min(1.2, Math.max(0.03, rawH5 / fundAmp)).toFixed(2));
  const w6 = Number(Math.min(1.1, Math.max(0.02, rawH6 / fundAmp)).toFixed(2));
  const harmonicWeights = [w1, w2, w3, w4, w5, w6, 0.05, 0.03];

  // Spectral roll-off detection for low-pass cutoff (where energy drops to < 18% of peak)
  let peakVal = 0;
  for (let k = 0; k < halfFft; k++) {
    if (mag[k] > peakVal) peakVal = mag[k];
  }
  const threshold = peakVal * 0.16;
  let rollOffBin = Math.floor(1800 / binHz);
  for (let k = Math.floor(1000 / binHz); k < Math.floor(4000 / binHz); k++) {
    if (mag[k] < threshold && (mag[k + 1] ?? 0) < threshold) {
      rollOffBin = k;
      break;
    }
  }
  const wotFilterCutoff = Math.max(1200, Math.min(3300, Math.round(rollOffBin * binHz)));

  // Distortion / growl saturation estimation
  const harmonicSum = rawH2 + rawH3 + rawH4 + rawH5;
  const thd = harmonicSum / (fundAmp + 1e-4);
  const distortionDrive = Math.max(12, Math.min(38, Math.round(14 + thd * 12)));

  // High-frequency whine presence (2.2 kHz - 4.2 kHz)
  let gearWhineEnergy = 0;
  const whineStartBin = Math.floor(1800 / binHz);
  const whineEndBin = Math.min(halfFft, Math.floor(3800 / binHz));
  for (let k = whineStartBin; k < whineEndBin; k++) {
    gearWhineEnergy += mag[k];
  }
  const avgWhine = gearWhineEnergy / (whineEndBin - whineStartBin + 1);
  const whineRatio = avgWhine / (fundAmp + 1e-4);

  const gearWhineLevel = Number(Math.max(0.04, Math.min(0.24, whineRatio * 0.22)).toFixed(2));
  const turboSpoolLevel = Number(Math.max(0.02, Math.min(0.22, whineRatio * 0.18)).toFixed(2));

  return {
    firingHz: Number(firingHz.toFixed(1)),
    estimatedRpm,
    rpmNorm: Number(rpmNorm.toFixed(2)),
    subLevel,
    harmonicWeights,
    wotFilterCutoff,
    distortionDrive,
    turboSpoolLevel,
    gearWhineLevel,
    hasHybrid: cylinders === 6 || cylinders === 8,
    hasTurbo: turboSpoolLevel > 0.08,
  };
}

/**
 * Controller for the live iterative auto-fitter.
 * Yields progressive candidate profiles so the UI sliders and audio preview
 * animate and converge in real time.
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
    totalSteps = 45,
  ): AsyncGenerator<AutoFitProgress, AcousticProfile, void> {
    this.aborted = false;

    // Step 1: Initial reference audio spectral feature analysis
    const features = analyzeReferenceAudio(
      refWindow.monoData,
      refWindow.sampleRate,
      baseProfile.cylinders,
      baseProfile.idleRpm,
      baseProfile.redlineRpm,
    );

    let candidate: AcousticProfile = {
      ...baseProfile,
      harmonicWeights: [...baseProfile.harmonicWeights],
    };

    // Interpolation targets
    const targetWeights = features.harmonicWeights;
    const targetSub = features.subLevel;
    const targetCutoff = features.wotFilterCutoff;
    const targetDrive = features.distortionDrive;
    const targetGearWhine = features.gearWhineLevel;
    const targetTurboSpool = features.turboSpoolLevel;

    const initialWeights = [...candidate.harmonicWeights];
    const initialSub = candidate.subLevel ?? 0.6;
    const initialCutoff = candidate.wotFilterCutoff;
    const initialDrive = candidate.distortionDrive;
    const initialGearWhine = candidate.gearWhineLevel ?? 0.1;
    const initialTurboSpool = candidate.turboSpoolLevel ?? 0.1;

    for (let step = 1; step <= totalSteps; step++) {
      if (this.aborted) break;

      const progress = step / totalSteps;
      // Smooth ease-out convergence
      const t = 1 - Math.pow(1 - progress, 2);

      const nextWeights = initialWeights.map((w, idx) => {
        const target = targetWeights[idx] ?? w;
        // Add tiny stochastic exploration that dampens near the end
        const jitter = (Math.random() - 0.5) * 0.04 * (1 - progress);
        return Number(Math.max(0, Math.min(1.5, w + (target - w) * t + jitter)).toFixed(2));
      });

      const nextSub = Number(
        Math.max(0.1, Math.min(1.3, initialSub + (targetSub - initialSub) * t)).toFixed(2),
      );
      const nextCutoff = Math.round(initialCutoff + (targetCutoff - initialCutoff) * t);
      const nextDrive = Math.round(initialDrive + (targetDrive - initialDrive) * t);
      const nextGearWhine = Number(
        Math.max(0, Math.min(0.4, initialGearWhine + (targetGearWhine - initialGearWhine) * t)).toFixed(2),
      );
      const nextTurboSpool = Number(
        Math.max(0, Math.min(0.4, initialTurboSpool + (targetTurboSpool - initialTurboSpool) * t)).toFixed(2),
      );

      // Compute pseudo spectral loss
      let weightDiff = 0;
      for (let i = 0; i < 6; i++) {
        weightDiff += Math.abs((nextWeights[i] ?? 0) - (targetWeights[i] ?? 0));
      }
      const cutoffDiff = Math.abs(nextCutoff - targetCutoff) / 2500;
      const driveDiff = Math.abs(nextDrive - targetDrive) / 40;
      const loss = Number((weightDiff * 0.4 + cutoffDiff * 0.3 + driveDiff * 0.3).toFixed(3));

      candidate = {
        ...candidate,
        subLevel: nextSub,
        harmonicWeights: nextWeights,
        wotFilterCutoff: nextCutoff,
        distortionDrive: nextDrive,
        gearWhineLevel: nextGearWhine,
        turboSpoolLevel: nextTurboSpool,
        profileGain: candidate.profileGain ?? 0.90,
        engineOutputGain: candidate.engineOutputGain ?? 0.90,
      };

      yield {
        step,
        totalSteps,
        loss,
        candidate,
        features,
      };

      // Allow UI thread to breathe and render canvas / audio updates at 60fps
      await new Promise((resolve) => setTimeout(resolve, 24));
    }

    return candidate;
  }
}
