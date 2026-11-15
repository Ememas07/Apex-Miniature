import { CarSpec } from '../game/types';

export class MotorsportAudioEngine {
  private ctx: AudioContext | null = null;
  private oscMain: OscillatorNode | null = null;
  private oscHarm: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private initialized = false;

  init() {
    if (this.initialized) return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.18;
      master.connect(ctx.destination);
      this.masterGain = master;

      const engGain = ctx.createGain();
      engGain.gain.value = 0;
      engGain.connect(master);
      this.engineGain = engGain;

      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.value = 90;

      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.value = 180;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 650;

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(engGain);

      osc1.start();
      osc2.start();
      this.oscMain = osc1;
      this.oscHarm = osc2;
      this.initialized = true;
    } catch {
      // Ignore if AudioContext blocked
    }
  }

  setMuted(mute: boolean) {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.18, this.ctx.currentTime, 0.04);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  updateEngine(rpmNorm: number, throttle: number, engineType: CarSpec['engineType'], active: boolean) {
    if (!this.initialized || !this.ctx || !this.oscMain || !this.oscHarm || !this.engineGain) return;
    if (this.ctx.state === 'suspended' && active) {
      this.ctx.resume().catch(() => {});
    }

    const now = this.ctx.currentTime;
    if (!active || this.muted) {
      this.engineGain.gain.setTargetAtTime(0, now, 0.06);
      return;
    }

    let baseHz = 72;
    let spanHz = 180;
    let harmRatio = 2.0;

    if (engineType === 'v10') {
      baseHz = 115;
      spanHz = 340;
      harmRatio = 2.5;
    } else if (engineType === 'electric') {
      baseHz = 180;
      spanHz = 420;
      harmRatio = 1.5;
      this.oscMain.type = 'sine';
    } else if (engineType === 'v12') {
      baseHz = 95;
      spanHz = 270;
      harmRatio = 2.25;
      this.oscMain.type = 'sawtooth';
    } else {
      this.oscMain.type = 'sawtooth';
    }

    const freq = baseHz + rpmNorm * spanHz;
    this.oscMain.frequency.setTargetAtTime(freq, now, 0.03);
    this.oscHarm.frequency.setTargetAtTime(freq * harmRatio, now, 0.03);
    const targetGain = 0.08 + throttle * 0.14;
    this.engineGain.gain.setTargetAtTime(targetGain, now, 0.04);
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
      this.oscMain?.stop();
      this.oscHarm?.stop();
      this.ctx?.close();
    } catch {
      // ignore
    }
    this.initialized = false;
  }
}
