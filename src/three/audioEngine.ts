import { CarClassId, CarSpec, SoundProfileId } from '../game/types';
import {
  AcousticProfile,
  computeWarmFundamentalHz,
  makeSoftClippingCurve,
  resolveAcousticProfile,
} from '../game/audio';

export class MotorsportAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private engineGain: GainNode | null = null;

  // Combustion nodes with custom PeriodicWave harmonic spectrum, dual formants & soft clipping
  private oscCombustion: OscillatorNode | null = null;
  private oscHarmonic: OscillatorNode | null = null;
  private oscSub: OscillatorNode | null = null;
  private oscHighHarmonic: OscillatorNode | null = null;
  private fundGain: GainNode | null = null;
  private midGain: GainNode | null = null;
  private subGain: GainNode | null = null;
  private highGain: GainNode | null = null;
  private pulseLfo: OscillatorNode | null = null;
  private pulseLfoGain: GainNode | null = null;
  private combustionFilter: BiquadFilterNode | null = null;
  private chestResonator: BiquadFilterNode | null = null;
  private exhaustResonator: BiquadFilterNode | null = null;
  private waveShaper: WaveShaperNode | null = null;
  private combustionGain: GainNode | null = null;

  // Intake / Induction Roar channel
  private intakeSource: AudioBufferSourceNode | null = null;
  private intakeFilter: BiquadFilterNode | null = null;
  private intakeGain: GainNode | null = null;

  // Electric / Hybrid MGU-K Inverter channel
  private oscElectricInverter: OscillatorNode | null = null;
  private oscElectricGear: OscillatorNode | null = null;
  private electricFilter: BiquadFilterNode | null = null;
  private electricGain: GainNode | null = null;

  // Dedicated Straight-Cut Sequential Gearbox Whine channel
  private oscGearWhine: OscillatorNode | null = null;
  private oscGearWhineSub: OscillatorNode | null = null;
  private gearFilter: BiquadFilterNode | null = null;
  private gearGain: GainNode | null = null;

  // Continuous Turbo Spool Whistle + Boost Air Hiss
  private oscTurboSpool: OscillatorNode | null = null;
  private turboNoiseSource: AudioBufferSourceNode | null = null;
  private turboSpoolFilter: BiquadFilterNode | null = null;
  private turboNoiseFilter: BiquadFilterNode | null = null;
  private turboSpoolGain: GainNode | null = null;

  // Tire scrub & kerb rumble nodes
  private scrubSource: AudioBufferSourceNode | null = null;
  private scrubFilter: BiquadFilterNode | null = null;
  private scrubGain: GainNode | null = null;
  private kerbOsc: OscillatorNode | null = null;
  private kerbFilter: BiquadFilterNode | null = null;
  private kerbGain: GainNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;
  private periodicWaveCache = new Map<string, PeriodicWave>();

  private prevThrottle = 0;
  private prevGear = 1;
  private lastCrackleTime = 0;
  private lastLimiterPopTime = 0;
  private flatShiftDipUntil = 0;
  private currentWaveKey: string | null = null;
  private currentDrive = -1;
  private masterVolume = 0.80;
  private muted = false;
  private initialized = false;

  // Exposed telemetry for live Sound Studio monitoring
  public lastTelemetry = {
    rpm: 0,
    crankHz: 0,
    firingHz: 0,
    baseHz: 0,
    limiterActive: false,
  };

  constructor() {
    try {
      const savedVol = localStorage.getItem('apex_audio_volume');
      if (savedVol !== null) {
        const v = parseFloat(savedVol);
        if (!isNaN(v) && v >= 0 && v <= 1) {
          this.masterVolume = v;
        }
      }
      const savedMute = localStorage.getItem('apex_audio_muted');
      if (savedMute !== null) {
        this.muted = savedMute === 'true';
      }
    } catch {
      // LocalStorage fallback
    }
  }

  init() {
    if (this.initialized) return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      // Soft Dynamics Limiter / Master Compressor to normalize RMS loudness across all profiles
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.setValueAtTime(-14, ctx.currentTime);
      limiter.knee.setValueAtTime(6, ctx.currentTime);
      limiter.ratio.setValueAtTime(6, ctx.currentTime);
      limiter.attack.setValueAtTime(0.003, ctx.currentTime);
      limiter.release.setValueAtTime(0.08, ctx.currentTime);
      limiter.connect(ctx.destination);
      this.masterLimiter = limiter;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.26 * this.masterVolume;
      master.connect(limiter);
      this.masterGain = master;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      master.connect(analyser);
      this.analyser = analyser;

      const mainEngine = ctx.createGain();
      mainEngine.gain.value = 0;
      mainEngine.connect(master);
      this.engineGain = mainEngine;

      // 1. Multi-harmonic Combustion Engine Synthesizer with Dual Formants & Saturation
      const combGain = ctx.createGain();
      combGain.gain.value = 0.2;
      this.combustionGain = combGain;

      const combFilter = ctx.createBiquadFilter();
      combFilter.type = 'lowpass';
      combFilter.frequency.value = 450;
      combFilter.Q.value = 1.8;
      this.combustionFilter = combFilter;

      const chestRes = ctx.createBiquadFilter();
      chestRes.type = 'peaking';
      chestRes.frequency.value = 175;
      chestRes.Q.value = 1.3;
      chestRes.gain.value = 4.0;
      this.chestResonator = chestRes;

      const resonator = ctx.createBiquadFilter();
      resonator.type = 'peaking';
      resonator.frequency.value = 650;
      resonator.Q.value = 1.6;
      resonator.gain.value = 4.0;
      this.exhaustResonator = resonator;

      const shaper = ctx.createWaveShaper();
      shaper.curve = makeSoftClippingCurve(22) as unknown as Float32Array<ArrayBuffer>;
      shaper.oversample = '2x';
      this.waveShaper = shaper;

      const fGain = ctx.createGain();
      fGain.gain.value = 0.85;
      const mGain = ctx.createGain();
      mGain.gain.value = 0.72;
      const sbGain = ctx.createGain();
      sbGain.gain.value = 0.65;
      const hGain = ctx.createGain();
      hGain.gain.value = 0.3;

      this.fundGain = fGain;
      this.midGain = mGain;
      this.subGain = sbGain;
      this.highGain = hGain;

      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.value = 75;

      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.value = 150;

      const osc3 = ctx.createOscillator();
      osc3.type = 'sawtooth';
      osc3.frequency.value = 37.5;

      const osc4 = ctx.createOscillator();
      osc4.type = 'sawtooth';
      osc4.frequency.value = 225;

      // Cylinder firing pulse LFO (Crossplane V8 lope / Boxer mechanical clatter)
      const lfo = ctx.createOscillator();
      lfo.type = 'sawtooth';
      lfo.frequency.value = 16;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0;
      lfo.connect(lfoGain);
      lfoGain.connect(sbGain.gain);
      lfoGain.connect(mGain.gain);
      lfo.start();
      this.pulseLfo = lfo;
      this.pulseLfoGain = lfoGain;

      osc1.connect(fGain);
      osc2.connect(mGain);
      osc3.connect(sbGain);
      osc4.connect(hGain);

      fGain.connect(combFilter);
      mGain.connect(combFilter);
      sbGain.connect(combFilter);
      hGain.connect(combFilter);

      combFilter.connect(chestRes);
      chestRes.connect(resonator);
      resonator.connect(shaper);
      shaper.connect(combGain);
      combGain.connect(mainEngine);

      osc1.start();
      osc2.start();
      osc3.start();
      osc4.start();

      this.oscCombustion = osc1;
      this.oscHarmonic = osc2;
      this.oscSub = osc3;
      this.oscHighHarmonic = osc4;

      // 2. Pre-render white noise buffer for intake roar, turbo hiss, exhaust pops, wastegate & tire scrub
      const bufferLength = Math.floor(ctx.sampleRate * 1.0);
      const noiseBuf = ctx.createBuffer(1, bufferLength, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufferLength; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = noiseBuf;

      // 2b. Dedicated Intake / Induction Roar Channel
      const intSrc = ctx.createBufferSource();
      intSrc.buffer = noiseBuf;
      intSrc.loop = true;
      const intFilter = ctx.createBiquadFilter();
      intFilter.type = 'bandpass';
      intFilter.frequency.value = 1400;
      intFilter.Q.value = 1.4;
      const intGain = ctx.createGain();
      intGain.gain.value = 0;
      intSrc.connect(intFilter);
      intFilter.connect(intGain);
      intGain.connect(mainEngine);
      intSrc.start();
      this.intakeSource = intSrc;
      this.intakeFilter = intFilter;
      this.intakeGain = intGain;

      // 3. MGU-K Hybrid Electric Inverter Channel (Formula E & GTP Launch Whine)
      const elGain = ctx.createGain();
      elGain.gain.value = 0;
      this.electricGain = elGain;

      const elFilter = ctx.createBiquadFilter();
      elFilter.type = 'bandpass';
      elFilter.frequency.value = 1400;
      elFilter.Q.value = 2.6;
      this.electricFilter = elFilter;

      const oscEl1 = ctx.createOscillator();
      oscEl1.type = 'sine';
      oscEl1.frequency.value = 1100;

      const oscEl2 = ctx.createOscillator();
      oscEl2.type = 'triangle';
      oscEl2.frequency.value = 2200;

      oscEl1.connect(elFilter);
      oscEl2.connect(elFilter);
      elFilter.connect(elGain);
      elGain.connect(mainEngine);

      oscEl1.start();
      oscEl2.start();

      this.oscElectricInverter = oscEl1;
      this.oscElectricGear = oscEl2;

      // 4. Dedicated Straight-Cut Sequential Gearbox Whine Channel (LMP2 / GTP / GT3)
      const gGain = ctx.createGain();
      gGain.gain.value = 0;
      this.gearGain = gGain;

      const gFilter = ctx.createBiquadFilter();
      gFilter.type = 'bandpass';
      gFilter.frequency.value = 2400;
      gFilter.Q.value = 3.2;
      this.gearFilter = gFilter;

      const oscG1 = ctx.createOscillator();
      oscG1.type = 'triangle';
      oscG1.frequency.value = 1800;

      const oscG2 = ctx.createOscillator();
      oscG2.type = 'sawtooth';
      oscG2.frequency.value = 3600;

      const g2SubGain = ctx.createGain();
      g2SubGain.gain.value = 0.28;

      oscG1.connect(gFilter);
      oscG2.connect(g2SubGain);
      g2SubGain.connect(gFilter);
      gFilter.connect(gGain);
      gGain.connect(mainEngine);

      oscG1.start();
      oscG2.start();

      this.oscGearWhine = oscG1;
      this.oscGearWhineSub = oscG2;

      // 5. Continuous Turbo Spool Whistle + Boost Turbine Air Hiss (2.8 - 5.5 kHz)
      const turboOsc = ctx.createOscillator();
      turboOsc.type = 'sine';
      turboOsc.frequency.value = 2800;
      const turboFilter = ctx.createBiquadFilter();
      turboFilter.type = 'bandpass';
      turboFilter.frequency.value = 3400;
      turboFilter.Q.value = 3.6;

      const turboNoiseSrc = ctx.createBufferSource();
      turboNoiseSrc.buffer = noiseBuf;
      turboNoiseSrc.loop = true;
      const turboNoiseFlt = ctx.createBiquadFilter();
      turboNoiseFlt.type = 'bandpass';
      turboNoiseFlt.frequency.value = 3400;
      turboNoiseFlt.Q.value = 5.2;
      const turboNoiseGain = ctx.createGain();
      turboNoiseGain.gain.value = 0.45;

      const turboGain = ctx.createGain();
      turboGain.gain.value = 0;

      turboOsc.connect(turboFilter);
      turboFilter.connect(turboGain);
      turboNoiseSrc.connect(turboNoiseFlt);
      turboNoiseFlt.connect(turboNoiseGain);
      turboNoiseGain.connect(turboGain);
      turboGain.connect(mainEngine);

      turboOsc.start();
      turboNoiseSrc.start();

      this.oscTurboSpool = turboOsc;
      this.turboNoiseSource = turboNoiseSrc;
      this.turboSpoolFilter = turboFilter;
      this.turboNoiseFilter = turboNoiseFlt;
      this.turboSpoolGain = turboGain;

      // 6. Continuous Tire Lateral-Slip Scrub channel
      const sSrc = ctx.createBufferSource();
      sSrc.buffer = noiseBuf;
      sSrc.loop = true;

      const sFilter = ctx.createBiquadFilter();
      sFilter.type = 'bandpass';
      sFilter.frequency.value = 1250;
      sFilter.Q.value = 2.6;

      const sGain = ctx.createGain();
      sGain.gain.value = 0;

      sSrc.connect(sFilter);
      sFilter.connect(sGain);
      sGain.connect(master);
      sSrc.start();

      this.scrubSource = sSrc;
      this.scrubFilter = sFilter;
      this.scrubGain = sGain;

      // 7. Kerb / Rumble Strip vibration channel
      const kOsc = ctx.createOscillator();
      kOsc.type = 'triangle';
      kOsc.frequency.value = 62;

      const kFilter = ctx.createBiquadFilter();
      kFilter.type = 'lowpass';
      kFilter.frequency.value = 210;

      const kGain = ctx.createGain();
      kGain.gain.value = 0;

      kOsc.connect(kFilter);
      kFilter.connect(kGain);
      kGain.connect(master);
      kOsc.start();

      this.kerbOsc = kOsc;
      this.kerbFilter = kFilter;
      this.kerbGain = kGain;

      this.initialized = true;
    } catch {
      // AudioContext blocked until user gesture
    }
  }

  private getOrCreatePeriodicWave(
    waveform: OscillatorType,
    weights: number[],
  ): PeriodicWave | null {
    if (!this.ctx) return null;
    const key = `${waveform}:${weights.map((w) => w.toFixed(2)).join(',')}`;
    const cached = this.periodicWaveCache.get(key);
    if (cached) return cached;

    const harmonicCount = Math.max(8, weights.length);
    const real = new Float32Array(harmonicCount + 1);
    const imag = new Float32Array(harmonicCount + 1);

    for (let k = 1; k <= harmonicCount; k++) {
      const w = weights[k - 1] ?? 0;
      let baseAmp = 1 / k;
      if (waveform === 'square') {
        baseAmp = k % 2 === 1 ? 1 / k : 0.14 / k;
      } else if (waveform === 'triangle') {
        baseAmp = k % 2 === 1 ? 1 / (k * k) : 0.08 / k;
      } else if (waveform === 'sine') {
        baseAmp = k === 1 ? 1.0 : 0.05 * w;
      }
      imag[k] = baseAmp * w;
    }

    const wave = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    if (this.periodicWaveCache.size > 64) {
      this.periodicWaveCache.clear();
    }
    this.periodicWaveCache.set(key, wave);
    return wave;
  }

  public getAnalyserFrequencyData(out: Uint8Array): boolean {
    if (!this.analyser) return false;
    this.analyser.getByteFrequencyData(out as Uint8Array<ArrayBuffer>);
    return true;
  }

  public getAnalyserTimeData(out: Uint8Array): boolean {
    if (!this.analyser) return false;
    this.analyser.getByteTimeDomainData(out as Uint8Array<ArrayBuffer>);
    return true;
  }

  setMuted(mute: boolean) {
    this.muted = mute;
    try {
      localStorage.setItem('apex_audio_muted', String(mute));
    } catch {}
    if (this.masterGain && this.ctx) {
      const targetGain = mute ? 0 : 0.26 * this.masterVolume;
      this.masterGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.04);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMasterVolume(vol: number) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    try {
      localStorage.setItem('apex_audio_volume', String(this.masterVolume));
    } catch {}
    if (this.masterGain && this.ctx) {
      const targetGain = this.muted ? 0 : 0.26 * this.masterVolume;
      this.masterGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.04);
    }
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  /**
   * Standard per-frame race loop entry point.
   */
  updateEngine(
    rpmNorm: number,
    throttle: number,
    engineType: CarSpec['engineType'],
    active: boolean,
    classId?: CarClassId,
    _isBraking?: boolean,
    speedKmh?: number,
    carId?: string,
    lateralSlip = 0,
    onKerb = false,
    gear = 1,
    soundProfile?: SoundProfileId,
  ) {
    if (!active) {
      this.silenceAll();
      return;
    }
    const profile = resolveAcousticProfile(carId, engineType, classId, soundProfile);
    this.updateEngineWithProfile(profile, rpmNorm, throttle, true, classId, speedKmh ?? 0, carId ?? '', lateralSlip, onKerb, gear);
  }

  private silenceAll() {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.engineGain?.gain.setTargetAtTime(0, now, 0.05);
    this.scrubGain?.gain.setTargetAtTime(0, now, 0.05);
    this.kerbGain?.gain.setTargetAtTime(0, now, 0.04);
    this.turboSpoolGain?.gain.setTargetAtTime(0, now, 0.05);
    this.gearGain?.gain.setTargetAtTime(0, now, 0.04);
    this.intakeGain?.gain.setTargetAtTime(0, now, 0.04);
  }

  /**
   * Direct profile-driven synthesis (used both in-race and live in Sound Studio).
   */
  updateEngineWithProfile(
    profile: AcousticProfile,
    rpmNorm: number,
    throttle: number,
    active: boolean,
    classId?: CarClassId,
    speedKmh = 0,
    carId = '',
    lateralSlip = 0,
    onKerb = false,
    gear = 1,
  ) {
    if (
      !this.initialized ||
      !this.ctx ||
      !this.oscCombustion ||
      !this.oscHarmonic ||
      !this.oscSub ||
      !this.oscHighHarmonic ||
      !this.engineGain ||
      !this.combustionGain ||
      !this.combustionFilter ||
      !this.oscElectricInverter ||
      !this.oscElectricGear ||
      !this.electricGain ||
      !this.electricFilter
    ) {
      return;
    }

    if (this.ctx.state === 'suspended' && active) {
      this.ctx.resume().catch(() => {});
    }

    const now = this.ctx.currentTime;
    if (!active || this.muted) {
      this.silenceAll();
      return;
    }

    const isNonHybridHypercar =
      carId === 'aston-valkyrie-lmh' || carId === 'glickenhaus-scg-007';

    const waveKey = `${profile.oscCombustionType}:${profile.harmonicWeights.map((w) => w.toFixed(2)).join(',')}`;
    if (this.currentWaveKey !== waveKey) {
      this.currentWaveKey = waveKey;
      const customWave = this.getOrCreatePeriodicWave(
        profile.oscCombustionType,
        profile.harmonicWeights,
      );
      if (customWave) {
        this.oscCombustion.setPeriodicWave(customWave);
      } else {
        this.oscCombustion.type = profile.oscCombustionType;
      }
      this.oscHarmonic.type = profile.oscHarmonicType;
      this.oscSub.type = profile.oscSubType;
      this.oscHighHarmonic.type =
        profile.highLevel && profile.highLevel > 0.65 ? 'sawtooth' : 'triangle';
    }

    this.combustionFilter.Q.setTargetAtTime(profile.filterQ, now, 0.04);
    if (this.chestResonator) {
      this.chestResonator.frequency.setTargetAtTime(profile.chestFormantHz, now, 0.04);
      this.chestResonator.gain.setTargetAtTime(profile.chestFormantGain, now, 0.04);
      this.chestResonator.Q.setTargetAtTime(profile.chestFormantQ, now, 0.04);
    }
    if (this.exhaustResonator) {
      this.exhaustResonator.frequency.setTargetAtTime(profile.formantHz ?? 650, now, 0.04);
      this.exhaustResonator.gain.setTargetAtTime(profile.formantGain ?? 3.5, now, 0.04);
      this.exhaustResonator.Q.setTargetAtTime(profile.formantQ ?? 1.6, now, 0.04);
    }
    if (this.waveShaper && Math.abs(this.currentDrive - profile.distortionDrive) > 0.5) {
      this.currentDrive = profile.distortionDrive;
      this.waveShaper.curve = makeSoftClippingCurve(profile.distortionDrive) as unknown as Float32Array<ArrayBuffer>;
    }
    if (this.pulseLfo && profile.pulseWaveform && this.pulseLfo.type !== profile.pulseWaveform) {
      this.pulseLfo.type = profile.pulseWaveform;
    }

    let combGainLevel = 0.0;
    let elGainLevel = 0.0;
    let gearGainLevel = 0.0;
    let intakeGainLevel = 0.0;
    let turboGainLevel = 0.0;
    let inverterHz = 1100;
    let inverterGearHz = 2200;
    let gearWhineHz = 1800;
    let limiterActive = false;

    const clampedRpm = Math.max(0, Math.min(1, rpmNorm));
    const clampedThrottle = Math.max(0, Math.min(1, throttle));

    if (profile.type === 'ELECTRIC_EV') {
      combGainLevel = 0.0;
      elGainLevel = 0.14 + clampedThrottle * 0.16 + Math.min(0.09, speedKmh / 300);
      inverterHz = 850 + clampedRpm * 2350;
      inverterGearHz = 1650 + speedKmh * 15;
      this.electricFilter.frequency.setTargetAtTime(inverterGearHz, now, 0.03);
      gearGainLevel = profile.gearWhineLevel * Math.min(1.0, 0.25 + (speedKmh / 240) * 0.75);
      gearWhineHz = (1200 + speedKmh * 15) * profile.gearWhinePitchScale;
      if (this.pulseLfoGain) this.pulseLfoGain.gain.setTargetAtTime(0, now, 0.03);
      this.lastTelemetry = { rpm: Math.round(clampedRpm * 12000), crankHz: 0, firingHz: 0, baseHz: 0, limiterActive: false };
    } else {
      const { rpm, crankHz, firingHz, baseHz, subHz, midHz, highHz, filterHz } =
        computeWarmFundamentalHz(profile, clampedRpm, clampedThrottle);

      this.oscCombustion.frequency.setTargetAtTime(baseHz, now, 0.022);
      this.oscHarmonic.frequency.setTargetAtTime(midHz, now, 0.022);
      this.oscSub.frequency.setTargetAtTime(subHz, now, 0.022);
      this.oscHighHarmonic.frequency.setTargetAtTime(highHz, now, 0.022);
      this.combustionFilter.frequency.setTargetAtTime(filterHz, now, 0.03);

      const upperRpmCurve = Math.pow(clampedRpm, 1.35);
      this.fundGain?.gain.setTargetAtTime(0.84 * (profile.harmonicWeights[0] ?? 1.0), now, 0.03);
      this.subGain?.gain.setTargetAtTime(profile.subLevel ?? 0.65, now, 0.03);
      this.midGain?.gain.setTargetAtTime(
        (profile.midLevel ?? 0.78) * (0.65 + clampedThrottle * 0.35),
        now,
        0.03,
      );
      this.highGain?.gain.setTargetAtTime(
        (profile.highLevel ?? 0.45) * (0.25 + upperRpmCurve * 0.95),
        now,
        0.03,
      );

      // Cylinder firing pulse modulation (Crossplane V8 burble lope / Flat-6 boxer clatter)
      if (this.pulseLfo && this.pulseLfoGain) {
        const pulseScale = profile.pulseRateScale ?? 0.22;
        const pulseHz = Math.max(9, baseHz * pulseScale);
        const rpmFade = 1.0 - (profile.pulseRpmFade ?? 0.65) * Math.pow(clampedRpm, 1.15);
        this.pulseLfo.frequency.setTargetAtTime(pulseHz, now, 0.035);
        this.pulseLfoGain.gain.setTargetAtTime(
          Math.max(0, (profile.pulseDepth ?? 0) * rpmFade * (0.65 + clampedThrottle * 0.35)),
          now,
          0.035,
        );
      }

      combGainLevel = profile.combustionGain * (0.7 + clampedThrottle * 0.48);

      // === CYCLIC FUEL/IGNITION-CUT REV LIMITER (rpm >= 98.5% redline) ===
      if (clampedRpm >= 0.985 && clampedThrottle > 0.22) {
        limiterActive = true;
        const cutHz = Math.max(12, Math.min(24, profile.revLimiterRateHz || 18));
        const phase = Math.sin(now * Math.PI * 2 * cutHz);
        if (phase < 0) {
          combGainLevel *= 0.16;
          if (now - this.lastLimiterPopTime > 0.095) {
            this.lastLimiterPopTime = now;
            this.triggerExhaustCrackles(0.85 * Math.max(0.7, profile.crackleIntensity));
          }
        }
      }

      // === FLAT-SHIFT IGNITION-CUT UPSHIFT BAP ===
      const isUpshift = gear > this.prevGear && this.prevGear > 0 && clampedThrottle > 0.25;
      if (isUpshift && profile.flatShiftCutMs > 0) {
        this.flatShiftDipUntil = now + profile.flatShiftCutMs / 1000;
        this.triggerFlatShiftBap(profile.formantHz ?? 600);
      }
      if (now < this.flatShiftDipUntil) {
        combGainLevel *= 0.24;
      }

      // === INTAKE / INDUCTION SNARL CHANNEL ===
      if (profile.intakeLevel > 0 && this.intakeFilter) {
        const highRpmKick =
          clampedRpm > profile.intakeHighRpmThreshold
            ? 1.0 + ((clampedRpm - profile.intakeHighRpmThreshold) / Math.max(0.1, 1 - profile.intakeHighRpmThreshold)) * 1.45
            : 0.45 + clampedRpm * 0.55;
        const intakeHz = profile.intakeCenterHz * (0.62 + clampedRpm * 0.65);
        this.intakeFilter.frequency.setTargetAtTime(intakeHz, now, 0.035);
        intakeGainLevel = profile.intakeLevel * (0.18 + clampedThrottle * 0.82) * highRpmKick;
      }

      // === MGU-K HYBRID ELECTRIC MOTOR WHINE (GTP pit-exit / low-RPM launch) ===
      if (profile.hasHybridWhine && !isNonHybridHypercar) {
        if (profile.mguLaunchDominant) {
          // Loudest at pit-exit / low-speed launch (< 95 km/h), blending under ICE at racing speed
          const launchPresence =
            speedKmh < 95
              ? 1.0 - (speedKmh / 95) * 0.45
              : 0.32 + clampedThrottle * 0.25;
          elGainLevel = profile.hybridWhineLevel * launchPresence * (0.55 + clampedThrottle * 0.65);
          inverterHz = 720 + speedKmh * 17 + clampedRpm * 850;
          inverterGearHz = 1440 + speedKmh * 26 + clampedRpm * 1200;
        } else {
          const isHypercar = classId === CarClassId.HYPERCAR_GTP;
          elGainLevel = profile.hybridWhineLevel * (0.6 + clampedThrottle * 0.85);
          inverterHz = (isHypercar ? 920 : 1420) + clampedRpm * 1750;
          inverterGearHz = (isHypercar ? 1850 : 2450) + clampedRpm * 2100;
        }
        this.electricFilter.frequency.setTargetAtTime(inverterHz, now, 0.03);
      }

      // === STRAIGHT-CUT SEQUENTIAL GEARBOX WHINE (8x-12x drivetrain harmonic) ===
      if (profile.gearWhineLevel > 0) {
        const speedMix = Math.min(1.0, 0.16 + (speedKmh / 245) * 0.62 + clampedRpm * 0.28);
        gearGainLevel = profile.gearWhineLevel * speedMix * (0.55 + clampedThrottle * 0.45);
        gearWhineHz =
          (950 + speedKmh * 12.5 + clampedRpm * 780) * (profile.gearWhinePitchScale || 1.0);
        this.gearFilter?.frequency.setTargetAtTime(gearWhineHz * 1.15, now, 0.03);
      }

      // === TWIN-TURBO SPOOL WHISTLE + BOOST AIR HISS (2.8 - 5.5 kHz) ===
      if (profile.turboSpoolLevel > 0 && this.oscTurboSpool && this.turboSpoolFilter) {
        const boostLoad = Math.max(0, Math.min(1, clampedRpm * 0.48 + clampedThrottle * 0.62 - 0.1));
        const spoolHz = (2400 + boostLoad * 3100) * Math.max(0.75, profile.turboSpoolPitch);
        this.oscTurboSpool.frequency.setTargetAtTime(spoolHz, now, 0.04);
        this.turboSpoolFilter.frequency.setTargetAtTime(spoolHz, now, 0.04);
        this.turboNoiseFilter?.frequency.setTargetAtTime(spoolHz, now, 0.04);
        turboGainLevel = profile.turboSpoolLevel * boostLoad * (0.35 + clampedThrottle * 0.65);
      }

      this.lastTelemetry = {
        rpm: Math.round(rpm),
        crankHz: Number(crankHz.toFixed(1)),
        firingHz: Number(firingHz.toFixed(1)),
        baseHz: Number(baseHz.toFixed(1)),
        limiterActive,
      };
    }

    this.combustionGain.gain.setTargetAtTime(combGainLevel, now, 0.014);
    this.oscElectricInverter.frequency.setTargetAtTime(inverterHz, now, 0.03);
    this.oscElectricGear.frequency.setTargetAtTime(inverterGearHz, now, 0.03);
    this.electricGain.gain.setTargetAtTime(elGainLevel, now, 0.035);
    this.oscGearWhine?.frequency.setTargetAtTime(gearWhineHz, now, 0.025);
    this.oscGearWhineSub?.frequency.setTargetAtTime(gearWhineHz * 1.98, now, 0.025);
    this.gearGain?.gain.setTargetAtTime(gearGainLevel, now, 0.03);
    this.intakeGain?.gain.setTargetAtTime(intakeGainLevel, now, 0.03);
    this.turboSpoolGain?.gain.setTargetAtTime(turboGainLevel, now, 0.035);

    // Perceived RMS Loudness Normalization per profile
    const overallEngineGain = (0.12 + clampedThrottle * 0.14) * profile.profileGain;
    this.engineGain.gain.setTargetAtTime(overallEngineGain, now, 0.035);

    // Live Tire Scrub Audio
    if (this.scrubGain && this.scrubFilter) {
      const slipIntensity =
        speedKmh > 22 && lateralSlip > 0.14 ? Math.min(1, (lateralSlip - 0.14) * 1.45) : 0;
      this.scrubFilter.frequency.setTargetAtTime(1050 + slipIntensity * 850, now, 0.04);
      this.scrubGain.gain.setTargetAtTime(slipIntensity * 0.14, now, 0.04);
    }

    // Live Kerb Rumble Audio
    if (this.kerbGain && this.kerbOsc) {
      const kerbActive = onKerb && speedKmh > 18;
      this.kerbOsc.frequency.setTargetAtTime(52 + Math.min(48, speedKmh * 0.24), now, 0.03);
      this.kerbGain.gain.setTargetAtTime(kerbActive ? 0.18 : 0, now, 0.03);
    }

    // Throttle Lift-Off & Downshift Detection: Exhaust Crackles & Wastegate Flutter
    const isDownshift = gear > 0 && this.prevGear > 0 && gear < this.prevGear && clampedRpm > 0.45;
    const isThrottleLift = this.prevThrottle > 0.58 && clampedThrottle < 0.25 && clampedRpm > 0.42;
    if ((isDownshift || isThrottleLift) && now - this.lastCrackleTime > 0.34) {
      this.lastCrackleTime = now;
      if (profile.hasTurboFlutter && isThrottleLift) {
        this.triggerWastegateFlutter(profile.crackleIntensity);
      } else if (profile.hasExhaustCrackles) {
        this.triggerExhaustCrackles(profile.crackleIntensity * (isDownshift ? 1.25 : 1.0));
      }
    }
    this.prevThrottle = clampedThrottle;
    this.prevGear = gear;
  }

  /**
   * Rapid-fire flat-shift sequential gearbox ignition-cut BAP transient.
   */
  private triggerFlatShiftBap(centerHz = 600) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(Math.max(260, Math.min(1100, centerHz * 0.75)), now);
    filter.Q.setValueAtTime(1.8, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.06);
  }

  /**
   * Multi-pulse turbo wastegate flutter chirp on throttle lift ("stu-tu-tu").
   */
  private triggerWastegateFlutter(intensity = 1.0) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const pulses = 4;
    for (let i = 0; i < pulses; i++) {
      const t = now + i * 0.044;
      const amp = (0.15 * intensity) * Math.pow(0.68, i);
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(3200 - i * 280, t);
      filter.Q.setValueAtTime(4.8, t);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(amp, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.038);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      src.start(t);
      src.stop(t + 0.042);
    }
  }

  /**
   * Exhaust pop/crackle sequence on throttle overrun, downshift, or rev-limiter bounce.
   */
  private triggerExhaustCrackles(intensity = 1.0) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const popCount = 2 + Math.floor(Math.random() * 3);

    for (let i = 0; i < popCount; i++) {
      const popTime = now + i * 0.058 + Math.random() * 0.018;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(420 + Math.random() * 680, popTime);
      filter.Q.setValueAtTime(1.4, popTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime((0.18 + Math.random() * 0.09) * intensity, popTime);
      gain.gain.exponentialRampToValueAtTime(0.001, popTime + 0.045);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      src.start(popTime);
      src.stop(popTime + 0.05);
    }
  }

  playBeep(freq = 660, duration = 0.12) {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration);
  }

  setVolume(vol: number) {
    this.setMasterVolume(vol);
  }

  getVolume(): number {
    return this.getMasterVolume();
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  dispose() {
    try {
      this.oscCombustion?.stop();
      this.oscHarmonic?.stop();
      this.oscSub?.stop();
      this.oscHighHarmonic?.stop();
      this.pulseLfo?.stop();
      this.intakeSource?.stop();
      this.oscElectricInverter?.stop();
      this.oscElectricGear?.stop();
      this.oscGearWhine?.stop();
      this.oscGearWhineSub?.stop();
      this.oscTurboSpool?.stop();
      this.turboNoiseSource?.stop();
      this.scrubSource?.stop();
      this.kerbOsc?.stop();
      this.ctx?.close();
    } catch {
      // ignore
    }
    this.initialized = false;
  }
}
