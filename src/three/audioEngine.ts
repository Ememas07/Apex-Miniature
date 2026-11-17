import { CarClassId, CarSpec } from '../game/types';
import {
  computeWarmFundamentalHz,
  makeSoftClippingCurve,
  resolveAcousticProfile,
} from '../game/audio';

export class MotorsportAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;
  private engineGain: GainNode | null = null;

  // Combustion nodes with soft-clipping saturation
  private oscCombustion: OscillatorNode | null = null;
  private oscHarmonic: OscillatorNode | null = null;
  private oscSub: OscillatorNode | null = null;
  private combustionFilter: BiquadFilterNode | null = null;
  private waveShaper: WaveShaperNode | null = null;
  private combustionGain: GainNode | null = null;

  // Electric / Hybrid / MGU-K nodes
  private oscElectricInverter: OscillatorNode | null = null;
  private oscElectricGear: OscillatorNode | null = null;
  private electricFilter: BiquadFilterNode | null = null;
  private electricGain: GainNode | null = null;

  // Tire scrub & kerb rumble nodes
  private scrubSource: AudioBufferSourceNode | null = null;
  private scrubFilter: BiquadFilterNode | null = null;
  private scrubGain: GainNode | null = null;
  private kerbOsc: OscillatorNode | null = null;
  private kerbFilter: BiquadFilterNode | null = null;
  private kerbGain: GainNode | null = null;

  // Noise / Pops / Wastegate buffer
  private noiseBuffer: AudioBuffer | null = null;

  private prevThrottle = 0;
  private lastCrackleTime = 0;
  private currentProfileType: string | null = null;
  private masterVolume = 0.80;
  private muted = false;
  private initialized = false;

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
      // LocalStorage access fallback
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

      // Soft Dynamics Limiter / Master Compressor to eliminate clipping & normalize all 76 cars
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.setValueAtTime(-12, ctx.currentTime);
      limiter.knee.setValueAtTime(8, ctx.currentTime);
      limiter.ratio.setValueAtTime(6, ctx.currentTime);
      limiter.attack.setValueAtTime(0.003, ctx.currentTime);
      limiter.release.setValueAtTime(0.08, ctx.currentTime);
      limiter.connect(ctx.destination);
      this.masterLimiter = limiter;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.20 * this.masterVolume;
      master.connect(limiter);
      this.masterGain = master;

      const mainEngine = ctx.createGain();
      mainEngine.gain.value = 0;
      mainEngine.connect(master);
      this.engineGain = mainEngine;

      // 1. Combustion Engine Synthesizer with soft-clipping saturation
      const combGain = ctx.createGain();
      combGain.gain.value = 0.18;
      this.combustionGain = combGain;

      const combFilter = ctx.createBiquadFilter();
      combFilter.type = 'lowpass';
      combFilter.frequency.value = 450;
      combFilter.Q.value = 1.8;
      this.combustionFilter = combFilter;

      const shaper = ctx.createWaveShaper();
      shaper.curve = makeSoftClippingCurve(22) as unknown as Float32Array<ArrayBuffer>;
      shaper.oversample = '2x';
      this.waveShaper = shaper;

      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.value = 75;

      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.value = 150;

      const osc3 = ctx.createOscillator();
      osc3.type = 'sawtooth';
      osc3.frequency.value = 37.5;

      osc1.connect(combFilter);
      osc2.connect(combFilter);
      osc3.connect(combFilter);
      combFilter.connect(shaper);
      shaper.connect(combGain);
      combGain.connect(mainEngine);

      osc1.start();
      osc2.start();
      osc3.start();

      this.oscCombustion = osc1;
      this.oscHarmonic = osc2;
      this.oscSub = osc3;

      // 2. Electric Inverter & Straight-Cut Gear Whistle (Formula E & Hybrids)
      const elGain = ctx.createGain();
      elGain.gain.value = 0;
      this.electricGain = elGain;

      const elFilter = ctx.createBiquadFilter();
      elFilter.type = 'bandpass';
      elFilter.frequency.value = 1800;
      elFilter.Q.value = 2.4;
      this.electricFilter = elFilter;

      const oscEl1 = ctx.createOscillator();
      oscEl1.type = 'sine';
      oscEl1.frequency.value = 1200;

      const oscEl2 = ctx.createOscillator();
      oscEl2.type = 'triangle';
      oscEl2.frequency.value = 2400;

      oscEl1.connect(elFilter);
      oscEl2.connect(elFilter);
      elFilter.connect(elGain);
      elGain.connect(mainEngine);

      oscEl1.start();
      oscEl2.start();

      this.oscElectricInverter = oscEl1;
      this.oscElectricGear = oscEl2;

      // 3. Pre-render white noise buffer for exhaust pops, wastegate & continuous tire scrub
      const bufferLength = Math.floor(ctx.sampleRate * 0.8);
      const noiseBuf = ctx.createBuffer(1, bufferLength, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufferLength; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = noiseBuf;

      // 4. Continuous Tire Lateral-Slip Scrub channel
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

      // 5. Kerb / Rumble Strip vibration channel
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

  setMuted(mute: boolean) {
    this.muted = mute;
    try {
      localStorage.setItem('apex_audio_muted', String(mute));
    } catch {}
    if (this.masterGain && this.ctx) {
      const targetGain = mute ? 0 : 0.20 * this.masterVolume;
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
      const targetGain = this.muted ? 0 : 0.20 * this.masterVolume;
      this.masterGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.04);
    }
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  /**
   * Parameterized audio synthesizer tailored to each car class and powertrain type
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
  ) {
    if (
      !this.initialized ||
      !this.ctx ||
      !this.oscCombustion ||
      !this.oscHarmonic ||
      !this.oscSub ||
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
      this.engineGain.gain.setTargetAtTime(0, now, 0.06);
      this.scrubGain?.gain.setTargetAtTime(0, now, 0.05);
      this.kerbGain?.gain.setTargetAtTime(0, now, 0.04);
      return;
    }

    const profile = resolveAcousticProfile(carId, engineType, classId);
    const isNonHybridHypercar = carId === 'aston-valkyrie-lmh' || carId === 'glickenhaus-scg-007';

    if (this.currentProfileType !== profile.type) {
      this.currentProfileType = profile.type;
      this.oscCombustion.type = profile.oscCombustionType;
      this.oscHarmonic.type = profile.oscHarmonicType;
      this.oscSub.type = profile.oscSubType;
      this.combustionFilter.Q.setTargetAtTime(profile.filterQ, now, 0.04);
      if (this.waveShaper) {
        this.waveShaper.curve = makeSoftClippingCurve(profile.distortionDrive) as unknown as Float32Array<ArrayBuffer>;
      }
    }

    let combGainLevel = 0.0;
    let elGainLevel = 0.0;
    let inverterHz = 1200;
    let gearHz = 2200;

    const speedNum = speedKmh ?? 0;

    if (profile.type === 'ELECTRIC_EV') {
      // === FORMULA E (GEN3 EVO): PURE ELECTRIC INVERTER WHINE + STRAIGHT-CUT GEARS ===
      combGainLevel = 0.0; // Strictly zero combustion noise!
      elGainLevel = 0.12 + throttle * 0.14 + Math.min(0.08, speedNum / 300);
      inverterHz = 850 + rpmNorm * 2200;
      gearHz = 1600 + speedNum * 14;
      this.electricFilter.frequency.setTargetAtTime(gearHz, now, 0.03);
    } else {
      // === WARM MULTI-CYLINDER COMBUSTION SYNTHESIS (68..255 Hz fundamental + soft clipping) ===
      const { baseHz, subHz, midHz, filterHz } = computeWarmFundamentalHz(profile, rpmNorm, throttle);
      this.oscCombustion.frequency.setTargetAtTime(baseHz, now, 0.03);
      this.oscHarmonic.frequency.setTargetAtTime(midHz, now, 0.03);
      this.oscSub.frequency.setTargetAtTime(subHz, now, 0.03);
      this.combustionFilter.frequency.setTargetAtTime(filterHz, now, 0.04);
      combGainLevel = profile.combustionGain * (0.72 + throttle * 0.45);

      if (profile.hasHybridWhine && !isNonHybridHypercar) {
        const isHypercar = classId === CarClassId.HYPERCAR_GTP;
        elGainLevel = isHypercar
          ? throttle > 0.4 || speedNum < 90
            ? profile.hybridWhineLevel
            : 0.02
          : profile.hybridWhineLevel * (0.65 + throttle * 0.9);
        inverterHz = (isHypercar ? 900 : 1350) + rpmNorm * 1650;
        gearHz = (isHypercar ? 1800 : 2300) + rpmNorm * 2000;
        this.electricFilter.frequency.setTargetAtTime(inverterHz, now, 0.03);
      } else if (profile.gearWhineLevel > 0) {
        // Procedural straight-cut transmission gear whine layer
        elGainLevel = profile.gearWhineLevel * Math.min(1.0, 0.2 + (speedNum / 260) * 0.8);
        inverterHz = 1100 + speedNum * 12;
        gearHz = 1900 + speedNum * 18;
        this.electricFilter.frequency.setTargetAtTime(inverterHz, now, 0.03);
      }
    }

    this.combustionGain.gain.setTargetAtTime(combGainLevel, now, 0.03);
    this.oscElectricInverter.frequency.setTargetAtTime(inverterHz, now, 0.03);
    this.oscElectricGear.frequency.setTargetAtTime(gearHz, now, 0.03);
    this.electricGain.gain.setTargetAtTime(elGainLevel, now, 0.04);

    // Per-Car Gain / Loudness Normalization across all 76 cars
    const overallEngineGain = (0.10 + throttle * 0.12) * profile.profileGain;
    this.engineGain.gain.setTargetAtTime(overallEngineGain, now, 0.04);

    // Live Tire Scrub Audio (lateralSlip > 0.14 at speed)
    if (this.scrubGain && this.scrubFilter) {
      const slipIntensity = speedNum > 22 && lateralSlip > 0.14 ? Math.min(1, (lateralSlip - 0.14) * 1.45) : 0;
      this.scrubFilter.frequency.setTargetAtTime(1050 + slipIntensity * 850, now, 0.04);
      this.scrubGain.gain.setTargetAtTime(slipIntensity * 0.14, now, 0.04);
    }

    // Live Kerb Rumble Audio
    if (this.kerbGain && this.kerbOsc) {
      const kerbActive = onKerb && speedNum > 18;
      this.kerbOsc.frequency.setTargetAtTime(52 + Math.min(48, speedNum * 0.24), now, 0.03);
      this.kerbGain.gain.setTargetAtTime(kerbActive ? 0.18 : 0, now, 0.03);
    }

    // Throttle Lift-Off Detection: Exhaust Crackles & Wastegate Flutter
    if (this.prevThrottle > 0.65 && throttle < 0.25 && rpmNorm > 0.45 && now - this.lastCrackleTime > 0.5) {
      this.lastCrackleTime = now;
      if (profile.hasTurboFlutter) {
        this.triggerWastegateFlutter(profile.crackleIntensity);
      } else if (profile.hasExhaustCrackles) {
        this.triggerExhaustCrackles(profile.crackleIntensity);
      }
    }
    this.prevThrottle = throttle;
  }

  /**
   * Turbo wastegate flutter noise burst on throttle lift
   */
  private triggerWastegateFlutter(intensity = 1.0) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2600, now);
    filter.Q.setValueAtTime(4.0, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.14 * intensity, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    src.start(now);
    src.stop(now + 0.24);
  }

  /**
   * Exhaust pop/crackle sequence on throttle overrun
   */
  private triggerExhaustCrackles(intensity = 1.0) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const popCount = 2 + Math.floor(Math.random() * 3);

    for (let i = 0; i < popCount; i++) {
      const popTime = now + i * 0.065 + Math.random() * 0.02;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(800 + Math.random() * 600, popTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime((0.16 + Math.random() * 0.08) * intensity, popTime);
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

  dispose() {
    try {
      this.oscCombustion?.stop();
      this.oscHarmonic?.stop();
      this.oscSub?.stop();
      this.oscElectricInverter?.stop();
      this.oscElectricGear?.stop();
      this.scrubSource?.stop();
      this.kerbOsc?.stop();
      this.ctx?.close();
    } catch {
      // ignore
    }
    this.initialized = false;
  }
}
