import { CarClassId, CarSpec } from '../game/types';

export class MotorsportAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineGain: GainNode | null = null;

  // Combustion nodes
  private oscCombustion: OscillatorNode | null = null;
  private oscHarmonic: OscillatorNode | null = null;
  private oscSub: OscillatorNode | null = null;
  private combustionFilter: BiquadFilterNode | null = null;
  private combustionGain: GainNode | null = null;

  // Electric / Hybrid / MGU-K nodes
  private oscElectricInverter: OscillatorNode | null = null;
  private oscElectricGear: OscillatorNode | null = null;
  private electricFilter: BiquadFilterNode | null = null;
  private electricGain: GainNode | null = null;

  // Noise / Pops / Wastegate buffer
  private noiseBuffer: AudioBuffer | null = null;

  private prevThrottle = 0;
  private lastCrackleTime = 0;
  private muted = false;
  private initialized = false;

  init() {
    if (this.initialized) return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.20;
      master.connect(ctx.destination);
      this.masterGain = master;

      const mainEngine = ctx.createGain();
      mainEngine.gain.value = 0;
      mainEngine.connect(master);
      this.engineGain = mainEngine;

      // 1. Combustion Engine Synthesizer
      const combGain = ctx.createGain();
      combGain.gain.value = 0.16;
      this.combustionGain = combGain;

      const combFilter = ctx.createBiquadFilter();
      combFilter.type = 'lowpass';
      combFilter.frequency.value = 1400;
      combFilter.Q.value = 1.8;
      this.combustionFilter = combFilter;

      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.value = 90;

      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.value = 180;

      const osc3 = ctx.createOscillator();
      osc3.type = 'sawtooth';
      osc3.frequency.value = 45;

      osc1.connect(combFilter);
      osc2.connect(combFilter);
      osc3.connect(combFilter);
      combFilter.connect(combGain);
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

      // 3. Pre-render white noise buffer for exhaust pops & wastegate flutter
      const bufferLength = Math.floor(ctx.sampleRate * 0.4);
      const noiseBuf = ctx.createBuffer(1, bufferLength, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufferLength; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = noiseBuf;

      this.initialized = true;
    } catch {
      // AudioContext blocked until user gesture
    }
  }

  setMuted(mute: boolean) {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.20, this.ctx.currentTime, 0.04);
    }
  }

  isMuted(): boolean {
    return this.muted;
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
      return;
    }

    const isF1_2005 = classId === CarClassId.F1_2005 || (engineType === 'v10' && classId === undefined);
    const isF1Modern = classId === CarClassId.F1_2026 || classId === CarClassId.F1_2021;
    const isFormulaE = classId === CarClassId.FORMULA_E || engineType === 'electric';
    const isHypercar = classId === CarClassId.HYPERCAR_GTP;
    const isGT3 = classId === CarClassId.GT3;
    const isRoadCar = classId === CarClassId.TRACK_COUPE || classId === CarClassId.SUPERCAR;

    let baseHz = 75;
    let spanHz = 240;
    let harmRatio = 2.0;
    let subRatio = 0.5;
    let filterCutoff = 1400;
    let combGainLevel = 0.18;
    let elGainLevel = 0.0;
    let inverterHz = 1200;
    let gearHz = 2200;

    if (isFormulaE) {
      // === FORMULA E (GEN3 EVO): PURE ELECTRIC INVERTER WHINE + STRAIGHT-CUT GEARS ===
      combGainLevel = 0.0; // Strictly zero combustion noise!
      elGainLevel = 0.12 + throttle * 0.14 + (speedKmh ? Math.min(0.08, speedKmh / 300) : 0);
      inverterHz = 850 + rpmNorm * 2200;
      gearHz = 1600 + (speedKmh ? speedKmh * 14 : rpmNorm * 2800);
      this.electricFilter.frequency.setTargetAtTime(gearHz, now, 0.03);
    } else if (isF1_2005) {
      // === 2005 F1: HIGH-PITCHED SCREAMING V10 (UP TO 19,000 RPM) ===
      this.oscCombustion.type = 'sawtooth';
      this.oscHarmonic.type = 'sawtooth';
      baseHz = 190;
      spanHz = 760; // Peak fundamental up to ~950Hz
      harmRatio = 2.5; // 2.5x harmonic howling up to ~2,375Hz
      subRatio = 1.0;
      filterCutoff = 3600; // Bright, open exhaust scream
      combGainLevel = 0.22 + throttle * 0.10;
      elGainLevel = 0.0;
    } else if (isF1Modern) {
      // === 2021 & 2026 F1: LOWER V6 TURBO RUMBLE + MGU-K ELECTRIC WHINE ===
      this.oscCombustion.type = 'sawtooth';
      this.oscHarmonic.type = 'triangle';
      baseHz = 68;
      spanHz = 210;
      harmRatio = 2.0;
      subRatio = 0.5;
      filterCutoff = 1150;
      combGainLevel = 0.16 + throttle * 0.09;
      // High-frequency MGU-K electric boost whine
      elGainLevel = 0.06 + throttle * 0.08;
      inverterHz = 1400 + rpmNorm * 1800;
      gearHz = 2400 + rpmNorm * 2200;
      this.electricFilter.frequency.setTargetAtTime(inverterHz, now, 0.03);
    } else if (isHypercar) {
      // === WEC HYPERCAR / GTP: DEEP V8/V6/V12 GROWL + HYBRID ACCELERATION WHINE ===
      this.oscCombustion.type = 'sawtooth';
      this.oscHarmonic.type = 'sawtooth';
      baseHz = engineType === 'v12' ? 95 : 64;
      spanHz = engineType === 'v12' ? 320 : 220;
      harmRatio = engineType === 'v12' ? 2.25 : 2.0;
      subRatio = 0.5;
      filterCutoff = 1350;
      combGainLevel = 0.18 + throttle * 0.10;
      // Hybrid electric pit-exit & launch whine
      elGainLevel = (throttle > 0.4 || (speedKmh !== undefined && speedKmh < 90)) ? 0.07 : 0.02;
      inverterHz = 900 + rpmNorm * 1400;
      gearHz = 1800 + rpmNorm * 1600;
      this.electricFilter.frequency.setTargetAtTime(inverterHz, now, 0.03);
    } else if (isGT3) {
      // === GT3: DISTINCT ENGINE CHARACTER (FLAT-6, V8, V10) ===
      if (engineType === 'flat6') {
        // Porsche flat-6 rasp
        this.oscCombustion.type = 'sawtooth';
        this.oscHarmonic.type = 'triangle';
        baseHz = 82;
        spanHz = 280;
        harmRatio = 3.0;
        filterCutoff = 1600;
        this.combustionFilter.Q.setTargetAtTime(3.2, now, 0.03);
      } else if (engineType === 'v10') {
        // Lamborghini V10 howl
        this.oscCombustion.type = 'sawtooth';
        this.oscHarmonic.type = 'sawtooth';
        baseHz = 110;
        spanHz = 360;
        harmRatio = 2.5;
        filterCutoff = 2200;
      } else {
        // Cross-plane V8 rumble (AMG, Corvette, Mustang)
        this.oscCombustion.type = 'sawtooth';
        this.oscHarmonic.type = 'square';
        baseHz = 58;
        spanHz = 195;
        harmRatio = 2.0;
        subRatio = 0.5;
        filterCutoff = 1200;
      }
      combGainLevel = 0.18 + throttle * 0.09;
      elGainLevel = 0.0;
    } else if (isRoadCar) {
      // === ROAD COUPES & SUPERCARS: STREET-MUFFLED EXHAUST NOTE ===
      this.oscCombustion.type = 'sawtooth';
      this.oscHarmonic.type = 'triangle';
      baseHz = 55;
      spanHz = 180;
      harmRatio = 2.0;
      subRatio = 0.5;
      filterCutoff = 580; // Street mufflers attenuate higher harmonics
      combGainLevel = 0.13 + throttle * 0.07;
      elGainLevel = 0.0;
    } else {
      // Default Prototype / Generic
      baseHz = 72;
      spanHz = 210;
      harmRatio = 2.0;
      subRatio = 0.5;
      filterCutoff = 1300;
      combGainLevel = 0.16 + throttle * 0.08;
      elGainLevel = 0.0;
    }

    const freq = baseHz + rpmNorm * spanHz;
    this.oscCombustion.frequency.setTargetAtTime(freq, now, 0.03);
    this.oscHarmonic.frequency.setTargetAtTime(freq * harmRatio, now, 0.03);
    this.oscSub.frequency.setTargetAtTime(freq * subRatio, now, 0.03);
    this.combustionFilter.frequency.setTargetAtTime(filterCutoff + throttle * 600, now, 0.04);
    this.combustionGain.gain.setTargetAtTime(combGainLevel, now, 0.03);

    this.oscElectricInverter.frequency.setTargetAtTime(inverterHz, now, 0.03);
    this.oscElectricGear.frequency.setTargetAtTime(gearHz, now, 0.03);
    this.electricGain.gain.setTargetAtTime(elGainLevel, now, 0.04);

    const overallEngineGain = 0.10 + throttle * 0.12;
    this.engineGain.gain.setTargetAtTime(overallEngineGain, now, 0.04);

    // Throttle Lift-Off Detection: Exhaust Crackles & Wastegate Flutter
    if (this.prevThrottle > 0.65 && throttle < 0.25 && rpmNorm > 0.45 && now - this.lastCrackleTime > 0.5) {
      this.lastCrackleTime = now;
      if (isF1Modern) {
        this.triggerWastegateFlutter();
      } else if (isF1_2005 || isGT3 || isHypercar) {
        this.triggerExhaustCrackles();
      }
    }
    this.prevThrottle = throttle;
  }

  /**
   * Turbo wastegate flutter noise burst on throttle lift
   */
  private triggerWastegateFlutter() {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2600, now);
    filter.Q.setValueAtTime(4.0, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.14, now);
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
  private triggerExhaustCrackles() {
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
      gain.gain.setValueAtTime(0.16 + Math.random() * 0.08, popTime);
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
      this.ctx?.close();
    } catch {
      // ignore
    }
    this.initialized = false;
  }
}
