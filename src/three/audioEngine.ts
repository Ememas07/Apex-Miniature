import { CarClassId, CarSpec, SoundProfileId, TrackSurfaceType } from '../game/types';
import type { GameSettings } from '../game/settings';
import {
  AcousticProfile,
  computeWarmFundamentalHz,
  makeSoftClippingCurve,
  resolveAcousticProfile,
} from '../game/audio';

export interface SpatialOpponentAudioInput {
  id: string;
  x: number;
  y?: number;
  z: number;
  vx: number;
  vz: number;
  rpmNormalized: number;
  speedMs: number;
  cylinders?: number;
  isElectric?: boolean;
}

export interface SpatialListenerCameraPose {
  x: number;
  y: number;
  z: number;
  forwardX: number;
  forwardY: number;
  forwardZ: number;
  upX?: number;
  upY?: number;
  upZ?: number;
}

interface OpponentVoice {
  osc: OscillatorNode;
  subOsc: OscillatorNode;
  filter: BiquadFilterNode;
  panner3d: PannerNode | null;
  stereoFallback: StereoPannerNode | null;
  gain: GainNode;
  wasActive: boolean;
  lastOppId: string | null;
}

export class MotorsportAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;
  private engineBus: GainNode | null = null;
  private opponentBus: GainNode | null = null;
  private tireBus: GainNode | null = null;
  private surfaceBus: GainNode | null = null;
  private windBus: GainNode | null = null;
  private uiBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private cabinFilter: BiquadFilterNode | null = null;
  private tunnelPreFilter: BiquadFilterNode | null = null;
  private tunnelConvolver: ConvolverNode | null = null;
  private tunnelDelay: DelayNode | null = null;
  private tunnelFeedback: GainNode | null = null;
  private tunnelWetGain: GainNode | null = null;
  private customListenerUntil = 0;
  private windSource: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private surfaceSource: AudioBufferSourceNode | null = null;
  private surfaceFilter: BiquadFilterNode | null = null;
  private surfaceGain: GainNode | null = null;
  private opponentVoices: OpponentVoice[] = [];
  private musicOscA: OscillatorNode | null = null;
  private musicOscB: OscillatorNode | null = null;
  private musicPadGain: GainNode | null = null;
  private musicActive = false;
  private mixerVolumes = {
    master: 0.8,
    engine: 0.9,
    opponents: 0.75,
    tires: 0.85,
    surface: 0.8,
    wind: 0.65,
    ui: 0.8,
    music: 0.35,
  };
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

  // Equal-Loudness & RMS Normalization Nodes (-16 dBFS target)
  private eqCutFilter: BiquadFilterNode | null = null;
  private highShelfFilter: BiquadFilterNode | null = null;
  private normalizeGainNode: GainNode | null = null;
  private currentNormGain = 1.0;
  private rmsBuffer: Float32Array = new Float32Array(512);

  // Reference Audio Auditioning Nodes
  private refSource: AudioBufferSourceNode | null = null;
  private refGain: GainNode | null = null;
  private isPlayingRef = false;

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
    outputDbfs: -16.0,
    layerLevels: {
      combustion: 0,
      intake: 0,
      turbo: 0,
      mgu: 0,
      gearbox: 0,
    },
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
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      // Gentle safety ceiling limiter so transient spikes never clip without pumping engine volume
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.setValueAtTime(-1.5, ctx.currentTime);
      limiter.knee.setValueAtTime(6, ctx.currentTime);
      limiter.ratio.setValueAtTime(3.5, ctx.currentTime);
      limiter.attack.setValueAtTime(0.008, ctx.currentTime);
      limiter.release.setValueAtTime(0.16, ctx.currentTime);
      limiter.connect(ctx.destination);
      this.masterLimiter = limiter;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.48 * this.masterVolume;
      master.connect(limiter);
      this.masterGain = master;

      // Dedicated isolated sub-buses for 7-channel mixer so SFX never destabilize engine RMS
      const cabinFilter = ctx.createBiquadFilter();
      cabinFilter.type = 'lowpass';
      cabinFilter.frequency.value = 18000;
      cabinFilter.Q.value = 0.7;
      cabinFilter.connect(master);
      this.cabinFilter = cabinFilter;

      // Concrete tunnel / street-canyon reverb send via procedural ConvolverNode (with DelayNode fallback)
      const tWet = ctx.createGain();
      tWet.gain.value = 0;
      tWet.connect(cabinFilter);
      this.tunnelWetGain = tWet;

      let tunnelSendInput: AudioNode | null = null;
      if (typeof ctx.createConvolver === 'function') {
        try {
          const preFilter = ctx.createBiquadFilter();
          preFilter.type = 'lowpass';
          preFilter.frequency.value = 3400;
          preFilter.Q.value = 0.65;

          const convolver = ctx.createConvolver();
          convolver.normalize = true;
          convolver.buffer = this.buildTunnelImpulseResponse(ctx);

          preFilter.connect(convolver);
          convolver.connect(tWet);

          this.tunnelPreFilter = preFilter;
          this.tunnelConvolver = convolver;
          tunnelSendInput = preFilter;
        } catch {
          this.tunnelPreFilter = null;
          this.tunnelConvolver = null;
        }
      }

      if (!tunnelSendInput) {
        const tDelay = ctx.createDelay(0.5);
        tDelay.delayTime.value = 0.085;
        const tFeedback = ctx.createGain();
        tFeedback.gain.value = 0.36;
        tDelay.connect(tFeedback);
        tFeedback.connect(tDelay);
        tDelay.connect(tWet);
        this.tunnelDelay = tDelay;
        this.tunnelFeedback = tFeedback;
        tunnelSendInput = tDelay;
      }

      const engineBus = ctx.createGain();
      engineBus.gain.value = this.mixerVolumes.engine;
      engineBus.connect(cabinFilter);
      engineBus.connect(tunnelSendInput);
      this.engineBus = engineBus;

      const opponentBus = ctx.createGain();
      opponentBus.gain.value = this.mixerVolumes.opponents;
      opponentBus.connect(cabinFilter);
      opponentBus.connect(tunnelSendInput);
      this.opponentBus = opponentBus;

      // Initialize AudioListener in Three.js right-handed space
      this.applyListenerTransform(0, 0, 0, 0, 0, 1, 0, 1, 0, true);

      const sfxCompressor = ctx.createDynamicsCompressor();
      sfxCompressor.threshold.setValueAtTime(-6, ctx.currentTime);
      sfxCompressor.knee.setValueAtTime(6, ctx.currentTime);
      sfxCompressor.ratio.setValueAtTime(3.0, ctx.currentTime);
      sfxCompressor.attack.setValueAtTime(0.01, ctx.currentTime);
      sfxCompressor.release.setValueAtTime(0.12, ctx.currentTime);
      sfxCompressor.connect(master);

      const sfxBus = ctx.createGain();
      sfxBus.gain.value = 1.0;
      sfxBus.connect(sfxCompressor);
      this.sfxBus = sfxBus;

      const tireBus = ctx.createGain();
      tireBus.gain.value = this.mixerVolumes.tires;
      tireBus.connect(sfxBus);
      this.tireBus = tireBus;

      const surfaceBus = ctx.createGain();
      surfaceBus.gain.value = this.mixerVolumes.surface;
      surfaceBus.connect(sfxBus);
      this.surfaceBus = surfaceBus;

      const windBus = ctx.createGain();
      windBus.gain.value = this.mixerVolumes.wind;
      windBus.connect(sfxBus);
      this.windBus = windBus;

      const uiBus = ctx.createGain();
      uiBus.gain.value = this.mixerVolumes.ui;
      uiBus.connect(master);
      this.uiBus = uiBus;

      const musicBus = ctx.createGain();
      musicBus.gain.value = this.mixerVolumes.music;
      musicBus.connect(master);
      this.musicBus = musicBus;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.75;
      // Measure strictly engineBus so tire scrub/SFX never destabilizes auto-leveler RMS
      engineBus.connect(analyser);
      this.analyser = analyser;

      // Equal-Loudness Compensation Filter:
      // -7 dB peaking cut at 3.1 kHz (human ear acoustic sensitivity peak)
      const eqCut = ctx.createBiquadFilter();
      eqCut.type = 'peaking';
      eqCut.frequency.value = 3100;
      eqCut.Q.value = 0.9;
      eqCut.gain.value = -7.0;
      this.eqCutFilter = eqCut;

      // High-shelf trim to soften high-frequency harshness
      const highShelf = ctx.createBiquadFilter();
      highShelf.type = 'highshelf';
      highShelf.frequency.value = 6500;
      highShelf.gain.value = -3.5;
      this.highShelfFilter = highShelf;

      // Dynamic RMS Normalization Gain Node (targeting -16 dBFS)
      const normGain = ctx.createGain();
      normGain.gain.value = 1.0;
      this.normalizeGainNode = normGain;

      const mainEngine = ctx.createGain();
      mainEngine.gain.value = 0;
      mainEngine.connect(eqCut);
      eqCut.connect(highShelf);
      highShelf.connect(normGain);
      normGain.connect(engineBus);
      this.engineGain = mainEngine;

      // 1. Multi-harmonic Combustion Engine Synthesizer with Dual Formants & Saturation
      const combGain = ctx.createGain();
      combGain.gain.value = 0.35;
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
      elFilter.Q.value = 2.2;
      this.electricFilter = elFilter;

      const oscEl1 = ctx.createOscillator();
      oscEl1.type = 'sine';
      oscEl1.frequency.value = 1100;

      const oscEl2 = ctx.createOscillator();
      oscEl2.type = 'sine';
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
      gFilter.frequency.value = 2200;
      gFilter.Q.value = 2.4;
      this.gearFilter = gFilter;

      const oscG1 = ctx.createOscillator();
      oscG1.type = 'triangle';
      oscG1.frequency.value = 1800;

      const oscG2 = ctx.createOscillator();
      oscG2.type = 'triangle';
      oscG2.frequency.value = 3600;

      const g2SubGain = ctx.createGain();
      g2SubGain.gain.value = 0.15;

      oscG1.connect(gFilter);
      oscG2.connect(g2SubGain);
      g2SubGain.connect(gFilter);
      gFilter.connect(gGain);
      gGain.connect(mainEngine);

      oscG1.start();
      oscG2.start();

      this.oscGearWhine = oscG1;
      this.oscGearWhineSub = oscG2;

      // 5. Continuous Turbo Spool Whistle + Boost Turbine Air Hiss (2.2 - 4.2 kHz)
      const turboOsc = ctx.createOscillator();
      turboOsc.type = 'sine';
      turboOsc.frequency.value = 2600;
      const turboFilter = ctx.createBiquadFilter();
      turboFilter.type = 'bandpass';
      turboFilter.frequency.value = 3000;
      turboFilter.Q.value = 2.8;

      const turboNoiseSrc = ctx.createBufferSource();
      turboNoiseSrc.buffer = noiseBuf;
      turboNoiseSrc.loop = true;
      const turboNoiseFlt = ctx.createBiquadFilter();
      turboNoiseFlt.type = 'bandpass';
      turboNoiseFlt.frequency.value = 3000;
      turboNoiseFlt.Q.value = 4.0;
      const turboNoiseGain = ctx.createGain();
      turboNoiseGain.gain.value = 0.08;

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
      sGain.connect(this.tireBus ?? sfxBus);
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
      kGain.connect(this.surfaceBus ?? sfxBus);
      kOsc.start();

      this.kerbOsc = kOsc;
      this.kerbFilter = kFilter;
      this.kerbGain = kGain;

      // High-speed aerodynamic wind rush foley channel
      if (this.noiseBuffer) {
        const wSrc = ctx.createBufferSource();
        wSrc.buffer = this.noiseBuffer;
        wSrc.loop = true;
        const wFilter = ctx.createBiquadFilter();
        wFilter.type = 'bandpass';
        wFilter.frequency.value = 520;
        wFilter.Q.value = 0.9;
        const wGain = ctx.createGain();
        wGain.gain.value = 0;
        wSrc.connect(wFilter);
        wFilter.connect(wGain);
        wGain.connect(this.windBus ?? sfxBus);
        wSrc.start();
        this.windSource = wSrc;
        this.windFilter = wFilter;
        this.windGain = wGain;

        // Surface gravel / grass / wet spray foley channel
        const sSrc = ctx.createBufferSource();
        sSrc.buffer = this.noiseBuffer;
        sSrc.loop = true;
        const sFilter = ctx.createBiquadFilter();
        sFilter.type = 'bandpass';
        sFilter.frequency.value = 950;
        sFilter.Q.value = 1.1;
        const sGain = ctx.createGain();
        sGain.gain.value = 0;
        sSrc.connect(sFilter);
        sFilter.connect(sGain);
        sGain.connect(this.surfaceBus ?? sfxBus);
        sSrc.start();
        this.surfaceSource = sSrc;
        this.surfaceFilter = sFilter;
        this.surfaceGain = sGain;
      }

      // 4-voice spatial opponent engine synthesizer pool with Doppler + 3D HRTF PannerNode (stereo fallback)
      this.opponentVoices = [];
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 110;
        const subOsc = ctx.createOscillator();
        subOsc.type = 'triangle';
        subOsc.frequency.value = 55;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 900;
        filter.Q.value = 1.5;
        const gain = ctx.createGain();
        gain.gain.value = 0;

        let panner3d: PannerNode | null = null;
        let stereoFallback: StereoPannerNode | null = null;

        if (typeof ctx.createPanner === 'function') {
          try {
            panner3d = ctx.createPanner();
            try {
              panner3d.panningModel = 'HRTF';
            } catch {
              panner3d.panningModel = 'equalpower';
            }
            panner3d.distanceModel = 'inverse';
            panner3d.refDistance = 4;
            panner3d.maxDistance = 62;
            // Attenuation is shaped explicitly on voice.gain to preserve smooth 62m fade and fallback parity
            panner3d.rolloffFactor = 0;
            panner3d.coneInnerAngle = 360;
            panner3d.coneOuterAngle = 360;
            panner3d.coneOuterGain = 0;
          } catch {
            panner3d = null;
          }
        }

        if (!panner3d) {
          stereoFallback = ctx.createStereoPanner();
          stereoFallback.pan.value = 0;
        }

        osc.connect(filter);
        subOsc.connect(filter);
        if (panner3d) {
          filter.connect(panner3d);
          panner3d.connect(gain);
        } else if (stereoFallback) {
          filter.connect(stereoFallback);
          stereoFallback.connect(gain);
        } else {
          filter.connect(gain);
        }
        gain.connect(this.opponentBus ?? master);
        osc.start();
        subOsc.start();
        this.opponentVoices.push({
          osc,
          subOsc,
          filter,
          panner3d,
          stereoFallback,
          gain,
          wasActive: false,
          lastOppId: null,
        });
      }

      // Subtle atmospheric menu pad synth (silent during racing)
      const mOscA = ctx.createOscillator();
      mOscA.type = 'sine';
      mOscA.frequency.value = 110;
      const mOscB = ctx.createOscillator();
      mOscB.type = 'triangle';
      mOscB.frequency.value = 164.81;
      const mFilter = ctx.createBiquadFilter();
      mFilter.type = 'lowpass';
      mFilter.frequency.value = 340;
      const mPadGain = ctx.createGain();
      mPadGain.gain.value = 0;
      mOscA.connect(mFilter);
      mOscB.connect(mFilter);
      mFilter.connect(mPadGain);
      mPadGain.connect(this.musicBus ?? master);
      mOscA.start();
      mOscB.start();
      this.musicOscA = mOscA;
      this.musicOscB = mOscB;
      this.musicPadGain = mPadGain;

      this.initialized = true;
    } catch {
      // AudioContext blocked until user gesture
    }
  }

  private getOrCreatePeriodicWave(
    waveform: OscillatorType,
    weights: number[],
    subLevel = 0.65,
  ): PeriodicWave | null {
    if (!this.ctx) return null;
    const key = `${waveform}:${subLevel.toFixed(2)}:${weights.join(',')}`;
    const cached = this.periodicWaveCache.get(key);
    if (cached) return cached;

    // Harmonic bin mapping for primary oscillator running at f0 = 0.5 * firingHz:
    // bin 1  = 0.5x sub-octave rumble
    // bin 2  = 1.0x fundamental firing order
    // bin 4  = 2.0x (2nd order)
    // bin 6  = 3.0x (3rd order - Flat-6)
    // bin 8  = 4.0x (4th order - Flat-Plane V8)
    // bin 10 = 5.0x (5th order - V10)
    // bin 12 = 6.0x (6th order - Top Scream)
    const real = new Float32Array(16);
    const imag = new Float32Array(16);

    const sub = Math.max(0, subLevel);
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

    // Explicit gain normalization with disableNormalization: true
    let energy = 0;
    for (let k = 1; k <= 12; k++) {
      energy += imag[k] * imag[k];
    }
    const rms = Math.sqrt(energy) || 1.0;
    const scale = 0.78 / Math.max(0.70, rms * 0.75);
    for (let k = 1; k <= 12; k++) {
      imag[k] *= scale;
    }

    const wave = this.ctx.createPeriodicWave(real, imag, { disableNormalization: true });
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

  public getFrequencyData(target?: Uint8Array): Uint8Array | null {
    if (!this.analyser) return null;
    const buf = target ?? new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(buf as Uint8Array<ArrayBuffer>);
    return buf;
  }

  public getAnalyserTimeData(out: Uint8Array): boolean {
    if (!this.analyser) return false;
    this.analyser.getByteTimeDomainData(out as Uint8Array<ArrayBuffer>);
    return true;
  }

  public applyMixerSettings(settings: GameSettings): void {
    this.mixerVolumes = {
      master: settings.masterVolume,
      engine: settings.engineVolume,
      opponents: settings.opponentVolume,
      tires: settings.tireSurfaceVolume,
      surface: settings.tireSurfaceVolume,
      wind: settings.collisionVolume,
      ui: settings.uiRadioVolume,
      music: settings.musicVolume,
    };
    this.setMasterVolume(settings.masterVolume);
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.engineBus?.gain.setTargetAtTime(settings.engineVolume, now, 0.04);
    this.opponentBus?.gain.setTargetAtTime(settings.opponentVolume, now, 0.04);
    this.tireBus?.gain.setTargetAtTime(settings.tireSurfaceVolume, now, 0.04);
    this.surfaceBus?.gain.setTargetAtTime(settings.tireSurfaceVolume, now, 0.04);
    this.windBus?.gain.setTargetAtTime(settings.collisionVolume, now, 0.04);
    this.uiBus?.gain.setTargetAtTime(settings.uiRadioVolume, now, 0.04);
    this.musicBus?.gain.setTargetAtTime(settings.musicVolume, now, 0.05);
  }

  public setMenuMusicActive(active: boolean): void {
    this.musicActive = active;
    if (!this.ctx || !this.musicPadGain) return;
    const now = this.ctx.currentTime;
    this.musicPadGain.gain.setTargetAtTime(active && !this.muted ? 0.055 : 0, now, 0.45);
  }

  /**
   * Generates a lightweight stereo impulse response modeling concrete tunnel & street-canyon reflections.
   */
  private buildTunnelImpulseResponse(ctx: AudioContext): AudioBuffer {
    const sampleRate = Math.max(8000, ctx.sampleRate || 44100);
    const durationSec = 0.9;
    const length = Math.max(1, Math.floor(sampleRate * durationSec));
    const buffer = ctx.createBuffer(2, length, sampleRate);

    // Deterministic LCG PRNG so IR generation is fast and allocation-free
    let seed = 0x517cc1b7;
    const nextNoise = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return (seed / 0x80000000) - 1;
    };

    // Discrete early slap-back reflections off parallel concrete walls & ceiling
    const earlyTaps: Array<{ timeSec: number; gainL: number; gainR: number }> = [
      { timeSec: 0.011, gainL: 0.62, gainR: 0.54 },
      { timeSec: 0.019, gainL: 0.48, gainR: 0.58 },
      { timeSec: 0.029, gainL: 0.42, gainR: 0.36 },
      { timeSec: 0.043, gainL: 0.31, gainR: 0.35 },
      { timeSec: 0.061, gainL: 0.24, gainR: 0.21 },
      { timeSec: 0.083, gainL: 0.16, gainR: 0.18 },
    ];

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const fadeIn = Math.min(1, t / 0.008);
        const decay = Math.exp(-t * 5.8);
        // Progressive high-frequency absorption by concrete surfaces
        const damp = Math.max(0.14, 0.42 - t * 0.28);
        lp = lp + damp * (nextNoise() - lp);
        data[i] = lp * fadeIn * decay * 0.45;
      }

      for (const tap of earlyTaps) {
        const tapOffsetSec = tap.timeSec + (ch === 1 ? 0.0017 : 0);
        const idx = Math.floor(tapOffsetSec * sampleRate);
        if (idx >= 0 && idx < length) {
          const amp = ch === 0 ? tap.gainL : tap.gainR;
          data[idx] += amp;
          if (idx + 1 < length) data[idx + 1] += amp * 0.45;
          if (idx + 2 < length) data[idx + 2] -= amp * 0.2;
        }
      }
    }

    return buffer;
  }

  private applyListenerTransform(
    x: number,
    y: number,
    z: number,
    fx: number,
    fy: number,
    fz: number,
    ux: number,
    uy: number,
    uz: number,
    immediate = false,
  ): void {
    if (!this.ctx) return;
    const listener = this.ctx.listener;
    if (!listener) return;

    const px = Number.isFinite(x) ? x : 0;
    const py = Number.isFinite(y) ? y : 0;
    const pz = Number.isFinite(z) ? z : 0;

    let fwdX = Number.isFinite(fx) ? fx : 0;
    let fwdY = Number.isFinite(fy) ? fy : 0;
    let fwdZ = Number.isFinite(fz) ? fz : 1;
    const fwdLen = Math.hypot(fwdX, fwdY, fwdZ);
    if (fwdLen > 1e-4) {
      fwdX /= fwdLen;
      fwdY /= fwdLen;
      fwdZ /= fwdLen;
    } else {
      fwdX = 0;
      fwdY = 0;
      fwdZ = 1;
    }

    let upX = Number.isFinite(ux) ? ux : 0;
    let upY = Number.isFinite(uy) ? uy : 1;
    let upZ = Number.isFinite(uz) ? uz : 0;
    const upLen = Math.hypot(upX, upY, upZ);
    if (upLen > 1e-4) {
      upX /= upLen;
      upY /= upLen;
      upZ /= upLen;
    } else {
      upX = 0;
      upY = 1;
      upZ = 0;
    }

    const now = this.ctx.currentTime;
    if (
      listener.positionX &&
      listener.positionY &&
      listener.positionZ &&
      listener.forwardX &&
      listener.forwardY &&
      listener.forwardZ &&
      listener.upX &&
      listener.upY &&
      listener.upZ
    ) {
      if (immediate) {
        listener.positionX.setValueAtTime(px, now);
        listener.positionY.setValueAtTime(py, now);
        listener.positionZ.setValueAtTime(pz, now);
        listener.forwardX.setValueAtTime(fwdX, now);
        listener.forwardY.setValueAtTime(fwdY, now);
        listener.forwardZ.setValueAtTime(fwdZ, now);
        listener.upX.setValueAtTime(upX, now);
        listener.upY.setValueAtTime(upY, now);
        listener.upZ.setValueAtTime(upZ, now);
      } else {
        listener.positionX.setTargetAtTime(px, now, 0.02);
        listener.positionY.setTargetAtTime(py, now, 0.02);
        listener.positionZ.setTargetAtTime(pz, now, 0.02);
        listener.forwardX.setTargetAtTime(fwdX, now, 0.02);
        listener.forwardY.setTargetAtTime(fwdY, now, 0.02);
        listener.forwardZ.setTargetAtTime(fwdZ, now, 0.02);
        listener.upX.setTargetAtTime(upX, now, 0.02);
        listener.upY.setTargetAtTime(upY, now, 0.02);
        listener.upZ.setTargetAtTime(upZ, now, 0.02);
      }
      return;
    }

    const legacy = listener as unknown as {
      setPosition?: (x: number, y: number, z: number) => void;
      setOrientation?: (
        fx: number,
        fy: number,
        fz: number,
        ux: number,
        uy: number,
        uz: number,
      ) => void;
    };
    legacy.setPosition?.(px, py, pz);
    legacy.setOrientation?.(fwdX, fwdY, fwdZ, upX, upY, upZ);
  }

  private applyPannerPosition(
    panner: PannerNode,
    x: number,
    y: number,
    z: number,
    now: number,
    immediate: boolean,
  ): void {
    const px = Number.isFinite(x) ? x : 0;
    const py = Number.isFinite(y) ? y : 0;
    const pz = Number.isFinite(z) ? z : 0;

    if (panner.positionX && panner.positionY && panner.positionZ) {
      if (immediate) {
        panner.positionX.setValueAtTime(px, now);
        panner.positionY.setValueAtTime(py, now);
        panner.positionZ.setValueAtTime(pz, now);
      } else {
        panner.positionX.setTargetAtTime(px, now, 0.018);
        panner.positionY.setTargetAtTime(py, now, 0.018);
        panner.positionZ.setTargetAtTime(pz, now, 0.018);
      }
      return;
    }

    const legacy = panner as unknown as {
      setPosition?: (x: number, y: number, z: number) => void;
    };
    legacy.setPosition?.(px, py, pz);
  }

  /**
   * Syncs the Web Audio 3D AudioListener directly from active focus camera coordinates and orientation.
   */
  public updateListenerPose(pose: SpatialListenerCameraPose): void {
    if (!this.initialized || !this.ctx) return;
    this.customListenerUntil = this.ctx.currentTime + 0.05;
    this.applyListenerTransform(
      pose.x,
      pose.y,
      pose.z,
      pose.forwardX,
      pose.forwardY,
      pose.forwardZ,
      pose.upX ?? 0,
      pose.upY ?? 1,
      pose.upZ ?? 0,
    );
  }

  public updateOpponentEngines(
    opponents: SpatialOpponentAudioInput[],
    listenerX: number,
    listenerZ: number,
    listenerVx: number,
    listenerVz: number,
    listenerHeading: number,
    listenerCamera?: Partial<SpatialListenerCameraPose>,
  ): void {
    if (!this.initialized || !this.ctx || this.muted || this.opponentVoices.length === 0) return;
    const now = this.ctx.currentTime;
    const defaultFwdX = Math.sin(listenerHeading);
    const defaultFwdZ = Math.cos(listenerHeading);

    if (listenerCamera || now >= this.customListenerUntil) {
      this.applyListenerTransform(
        listenerCamera?.x ?? listenerX,
        listenerCamera?.y ?? 0,
        listenerCamera?.z ?? listenerZ,
        listenerCamera?.forwardX ?? defaultFwdX,
        listenerCamera?.forwardY ?? 0,
        listenerCamera?.forwardZ ?? defaultFwdZ,
        listenerCamera?.upX ?? 0,
        listenerCamera?.upY ?? 1,
        listenerCamera?.upZ ?? 0,
      );
    }

    // Three.js right vector = forward x up = (-cos(heading), 0, sin(heading)) for StereoPanner fallback
    const rightX = -Math.cos(listenerHeading);
    const rightZ = Math.sin(listenerHeading);

    const ranked = opponents
      .map((opp) => {
        const dx = opp.x - listenerX;
        const dz = opp.z - listenerZ;
        const dist = Math.hypot(dx, dz);
        return { opp, dx, dz, dist };
      })
      .filter((item) => item.dist < 62 && item.opp.speedMs > 1.5)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, this.opponentVoices.length);

    for (let i = 0; i < this.opponentVoices.length; i++) {
      const voice = this.opponentVoices[i];
      const item = ranked[i];
      if (!item) {
        voice.gain.gain.setTargetAtTime(0, now, 0.06);
        voice.wasActive = false;
        voice.lastOppId = null;
        continue;
      }
      const { opp, dx, dz, dist } = item;
      const safeDist = Math.max(2.5, dist);
      // Distance attenuation
      const atten = Math.max(0, Math.min(1, 1 - (safeDist - 3) / 58));

      // Doppler shift based on radial closing velocity (speed of sound = 343 m/s)
      const invD = 1 / safeDist;
      const relVx = opp.vx - listenerVx;
      const relVz = opp.vz - listenerVz;
      const radialSpeed = (relVx * dx + relVz * dz) * invD; // positive = moving away
      const doppler = Math.max(0.76, Math.min(1.28, 343 / Math.max(180, 343 + radialSpeed * 1.15)));

      const cyl = opp.cylinders ?? 8;
      const baseHz = opp.isElectric
        ? (280 + opp.rpmNormalized * 960) * doppler
        : (62 + opp.rpmNormalized * (cyl >= 10 ? 290 : 195)) * doppler;

      voice.osc.type = opp.isElectric ? 'sine' : 'sawtooth';
      voice.osc.frequency.setTargetAtTime(Math.max(40, Math.min(2200, baseHz)), now, 0.035);
      voice.subOsc.frequency.setTargetAtTime(Math.max(28, baseHz * 0.5), now, 0.035);
      voice.filter.frequency.setTargetAtTime(
        opp.isElectric ? 2400 : 420 + opp.rpmNormalized * 1100 * atten,
        now,
        0.04,
      );

      if (voice.panner3d) {
        const snap = !voice.wasActive || voice.lastOppId !== opp.id;
        this.applyPannerPosition(voice.panner3d, opp.x, opp.y ?? 0, opp.z, now, snap);
      } else if (voice.stereoFallback) {
        const pan = Math.max(-0.92, Math.min(0.92, (dx * rightX + dz * rightZ) / Math.max(6, safeDist)));
        voice.stereoFallback.pan.setTargetAtTime(pan, now, 0.035);
      }

      voice.gain.gain.setTargetAtTime(atten * atten * (opp.isElectric ? 0.08 : 0.13), now, 0.04);
      voice.wasActive = true;
      voice.lastOppId = opp.id;
    }
  }

  public updateEnvironmentFoley(params: {
    speedKmh: number;
    wetness: number;
    surface?: TrackSurfaceType;
    inCockpit?: boolean;
    inTunnel?: boolean;
    streetCanyon?: number;
    reverbMix?: number;
  }): void {
    if (!this.initialized || !this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const spdFrac = Math.min(1, Math.max(0, (params.speedKmh - 45) / 260));

    if (this.windGain && this.windFilter) {
      this.windFilter.frequency.setTargetAtTime(280 + spdFrac * 1350, now, 0.06);
      this.windGain.gain.setTargetAtTime(spdFrac * spdFrac * 0.13, now, 0.06);
    }

    if (this.surfaceGain && this.surfaceFilter) {
      const surf = params.surface ?? 'asphalt';
      let targetGain = 0;
      let targetFreq = 900;
      if (surf === 'gravel' && params.speedKmh > 8) {
        targetGain = Math.min(0.22, (params.speedKmh / 110) * 0.22);
        targetFreq = 1650;
      } else if (surf === 'grass' && params.speedKmh > 8) {
        targetGain = Math.min(0.14, (params.speedKmh / 120) * 0.14);
        targetFreq = 680;
      } else if (params.wetness > 0.18 && params.speedKmh > 35) {
        targetGain = Math.min(0.18, params.wetness * spdFrac * 0.22);
        targetFreq = 2200;
      }
      this.surfaceFilter.frequency.setTargetAtTime(targetFreq, now, 0.05);
      this.surfaceGain.gain.setTargetAtTime(targetGain, now, 0.05);
    }

    if (this.cabinFilter) {
      this.cabinFilter.frequency.setTargetAtTime(params.inCockpit ? 3800 : 18000, now, 0.08);
    }
    if (this.tunnelWetGain) {
      const canyonMix = Math.max(0, Math.min(1, params.streetCanyon ?? 0)) * 0.22;
      const customMix =
        params.reverbMix !== undefined ? Math.max(0, Math.min(0.5, params.reverbMix)) : canyonMix;
      const targetWet = params.inTunnel ? 0.36 : customMix;
      this.tunnelWetGain.gain.setTargetAtTime(targetWet, now, 0.12);
    }
  }

  public playImpact(intensity = 0.5, kind: 'wall' | 'car' = 'car'): void {
    const outBus = this.surfaceBus ?? this.sfxBus ?? this.masterGain;
    if (!this.initialized || !this.ctx || !outBus || this.muted) return;
    const now = this.ctx.currentTime;
    const amp = Math.max(0.08, Math.min(0.45, intensity * 0.38));

    // Low thump body
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(kind === 'wall' ? 115 : 155, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.18);
    const oGain = this.ctx.createGain();
    oGain.gain.setValueAtTime(amp, now);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(oGain);
    oGain.connect(outBus);
    osc.start(now);
    osc.stop(now + 0.21);

    // Carbon/metal crunch burst
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.setValueAtTime(kind === 'wall' ? 880 : 1450, now);
      filt.Q.setValueAtTime(1.1, now);
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(amp * 0.85, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      src.connect(filt);
      filt.connect(nGain);
      nGain.connect(outBus);
      src.start(now);
      src.stop(now + 0.17);
    }
  }

  public playRadioChirp(): void {
    const outBus = this.uiBus ?? this.sfxBus ?? this.masterGain;
    if (!this.initialized || !this.ctx || !outBus || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1480, now);
    osc.frequency.setValueAtTime(1920, now + 0.045);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(g);
    g.connect(outBus);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playShiftBeep(isUp = true): void {
    const outBus = this.uiBus ?? this.sfxBus ?? this.masterGain;
    if (!this.initialized || !this.ctx || !outBus || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isUp ? 1120 : 740, now);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.07, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    osc.connect(g);
    g.connect(outBus);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public getAudioContext(): AudioContext | null {
    if (!this.initialized || !this.ctx) {
      this.init();
    }
    return this.ctx;
  }

  public playReferenceBuffer(buffer: AudioBuffer, offsetSec = 0, durationSec?: number): void {
    if (!this.ctx) this.init();
    if (!this.ctx || !this.masterGain) return;
    this.stopReferenceAudio();

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.95;
    src.connect(gain);
    gain.connect(this.masterGain);

    src.onended = () => {
      this.isPlayingRef = false;
      this.refSource = null;
      this.refGain = null;
    };

    const now = this.ctx.currentTime;
    if (durationSec !== undefined && durationSec > 0) {
      src.start(now, offsetSec, durationSec);
    } else {
      src.start(now, offsetSec);
    }
    this.refSource = src;
    this.refGain = gain;
    this.isPlayingRef = true;
  }

  public stopReferenceAudio(): void {
    if (this.refSource) {
      try {
        this.refSource.stop();
        this.refSource.disconnect();
      } catch {}
      this.refSource = null;
    }
    if (this.refGain) {
      try {
        this.refGain.disconnect();
      } catch {}
      this.refGain = null;
    }
    this.isPlayingRef = false;
  }

  public isPlayingReference(): boolean {
    return this.isPlayingRef;
  }

  public getOutputLevelDbfs(): number {
    return this.lastTelemetry.outputDbfs;
  }

  setMuted(mute: boolean) {
    if (this.muted === mute) return;
    this.muted = mute;
    try {
      localStorage.setItem('apex_audio_muted', String(mute));
    } catch {}
    if (this.masterGain && this.ctx) {
      const targetGain = mute ? 0 : 0.48 * this.masterVolume;
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
      const targetGain = this.muted ? 0 : 0.48 * this.masterVolume;
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
    revLimiterActive?: boolean,
  ) {
    if (!active) {
      this.silenceAll();
      return;
    }
    const profile = resolveAcousticProfile(carId, engineType, classId, soundProfile);
    this.updateEngineWithProfile(
      profile,
      rpmNorm,
      throttle,
      true,
      classId,
      speedKmh ?? 0,
      carId ?? '',
      lateralSlip,
      onKerb,
      gear,
      revLimiterActive,
    );
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
    this.windGain?.gain.setTargetAtTime(0, now, 0.05);
    this.surfaceGain?.gain.setTargetAtTime(0, now, 0.05);
    for (const v of this.opponentVoices) {
      v.gain.gain.setTargetAtTime(0, now, 0.06);
    }
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
    revLimiterActive?: boolean,
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

    const currentSub = profile.subLevel ?? 0.65;
    const waveKey = `${profile.oscCombustionType}:${currentSub.toFixed(2)}:${profile.harmonicWeights.join(',')}`;
    if (this.currentWaveKey !== waveKey) {
      this.currentWaveKey = waveKey;
      const customWave = this.getOrCreatePeriodicWave(
        profile.oscCombustionType,
        profile.harmonicWeights,
        currentSub,
      );
      if (customWave) {
        this.oscCombustion.setPeriodicWave(customWave);
      } else if (profile.oscCombustionType !== 'custom') {
        this.oscCombustion.type = profile.oscCombustionType;
      }
    }
    if (this.oscHarmonic && this.oscHarmonic.type !== profile.oscHarmonicType) {
      this.oscHarmonic.type = profile.oscHarmonicType;
    }
    if (this.oscSub && this.oscSub.type !== profile.oscSubType) {
      this.oscSub.type = profile.oscSubType;
    }
    const targetHighType = profile.highLevel && profile.highLevel > 0.65 ? 'sawtooth' : 'triangle';
    if (this.oscHighHarmonic && this.oscHighHarmonic.type !== targetHighType) {
      this.oscHighHarmonic.type = targetHighType;
    }

    this.combustionFilter.Q.setTargetAtTime(Math.min(1.8, Math.max(0.5, profile.filterQ || 1.4)), now, 0.015);
    if (this.chestResonator) {
      this.chestResonator.frequency.setTargetAtTime(profile.chestFormantHz, now, 0.015);
      this.chestResonator.gain.setTargetAtTime(profile.chestFormantGain, now, 0.015);
      this.chestResonator.Q.setTargetAtTime(profile.chestFormantQ, now, 0.015);
    }
    if (this.exhaustResonator) {
      this.exhaustResonator.frequency.setTargetAtTime(profile.formantHz ?? 650, now, 0.015);
      this.exhaustResonator.gain.setTargetAtTime(profile.formantGain ?? 3.5, now, 0.015);
      this.exhaustResonator.Q.setTargetAtTime(profile.formantQ ?? 1.6, now, 0.015);
    }
    if (this.waveShaper && (this.currentDrive !== profile.distortionDrive || !this.waveShaper.curve)) {
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

    const safeRpm = Number.isFinite(rpmNorm) ? rpmNorm : 0;
    const clampedRpm = Math.max(0, Math.min(1, safeRpm));
    throttle = Number.isFinite(throttle) ? Math.max(0, Math.min(1, throttle)) : 0;
    const clampedThrottle = Math.max(0, Math.min(1, throttle));

    if (profile.type === 'ELECTRIC_EV') {
      combGainLevel = 0.0;
      // Tamed 12x-15x internal gain multiplier for realistic Gen3 cabin texture
      elGainLevel = (profile.hybridWhineLevel ?? 0.16) * 0.024 + clampedThrottle * 0.018 + Math.min(0.008, speedKmh / 3600);
      inverterHz = Math.min(2400, 750 + clampedRpm * 1450);
      inverterGearHz = Math.min(2600, 1100 + speedKmh * 8.5);

      // Warm low-pass filter at ~1,800 Hz
      this.electricFilter.type = 'lowpass';
      this.electricFilter.frequency.setTargetAtTime(Math.min(1800, 850 + speedKmh * 3.8), now, 0.02);
      this.electricFilter.Q.setTargetAtTime(1.1, now, 0.02);

      // Subtle mechanical reduction gear texture
      gearGainLevel = (profile.gearWhineLevel ?? 0.14) * 0.018 * Math.min(1.0, 0.25 + (speedKmh / 240) * 0.75);
      gearWhineHz = Math.min(2200, (850 + speedKmh * 9.5) * (profile.gearWhinePitchScale || 1.0));
      if (this.pulseLfoGain) this.pulseLfoGain.gain.setTargetAtTime(0, now, 0.02);
      this.lastTelemetry = {
        rpm: Math.round(clampedRpm * 12000),
        crankHz: 0,
        firingHz: 0,
        baseHz: 0,
        limiterActive: false,
        outputDbfs: -16.0,
        layerLevels: {
          combustion: 0,
          intake: 0,
          turbo: 0,
          mgu: Math.min(1, elGainLevel * 25),
          gearbox: Math.min(1, gearGainLevel * 30),
        },
      };
    } else {
      const { rpm, crankHz, firingHz, baseHz, subHz, midHz, highHz } =
        computeWarmFundamentalHz(profile, clampedRpm, clampedThrottle);

      // Primary oscillator runs at 0.5 * firingHz so Fourier bins map exactly:
      // bin 1 = 0.5x, bin 2 = 1x, bin 4 = 2nd, bin 6 = 3rd, bin 8 = 4th, bin 10 = 5th, bin 12 = 6th
      this.oscCombustion.frequency.setTargetAtTime(baseHz * 0.5, now, 0.015);
      this.oscHarmonic.frequency.setTargetAtTime(midHz, now, 0.015);
      this.oscSub.frequency.setTargetAtTime(subHz, now, 0.015);
      this.oscHighHarmonic.frequency.setTargetAtTime(highHz, now, 0.015);

      // Gentle 12 dB/oct slope (Q <= 1.8) exhaust low-pass filter scaling dynamically with RPM up to 3,200-4,500 Hz
      const baseCutoff = profile.wotFilterCutoff || 2800;
      const dynamicCutoff = Math.max(
        650,
        Math.min(4500, baseCutoff * (0.65 + 0.85 * clampedRpm) * (0.8 + clampedThrottle * 0.25)),
      );
      this.combustionFilter.frequency.setTargetAtTime(dynamicCutoff, now, 0.015);
      this.combustionFilter.Q.setTargetAtTime(Math.min(1.8, Math.max(0.5, profile.filterQ || 1.4)), now, 0.015);

      const upperRpmCurve = Math.pow(clampedRpm, 1.35);
      this.fundGain?.gain.setTargetAtTime(0.85, now, 0.015);
      this.subGain?.gain.setTargetAtTime(profile.subLevel ?? 0.65, now, 0.015);
      this.midGain?.gain.setTargetAtTime(
        (profile.midLevel ?? 0.78) * (0.65 + clampedThrottle * 0.35),
        now,
        0.015,
      );
      this.highGain?.gain.setTargetAtTime(
        (profile.highLevel ?? 0.45) * (0.25 + upperRpmCurve * 0.95),
        now,
        0.015,
      );

      // Cylinder firing pulse modulation (Crossplane V8 burble lope / Flat-6 boxer clatter)
      if (this.pulseLfo && this.pulseLfoGain) {
        const pulseScale = profile.pulseRateScale ?? 0.22;
        const pulseHz = Math.max(9, baseHz * pulseScale);
        const rpmFade = 1.0 - (profile.pulseRpmFade ?? 0.65) * Math.pow(clampedRpm, 1.15);
        this.pulseLfo.frequency.setTargetAtTime(pulseHz, now, 0.02);
        this.pulseLfoGain.gain.setTargetAtTime(
          Math.max(0, (profile.pulseDepth ?? 0) * rpmFade * (0.65 + clampedThrottle * 0.35)),
          now,
          0.02,
        );
      }

      // Boosted combustion base gain for authoritative engine roar
      combGainLevel = (profile.combustionGain ?? 0.28) * (1.35 + clampedThrottle * 0.85);

      // === HARSH HYSTERESIS REV LIMITER (Drops pitch, cuts gain, triggers pops) ===
      const isRedlineCandidate = clampedRpm >= 0.984 && clampedThrottle > 0.22;
      if (revLimiterActive !== undefined) {
        limiterActive = revLimiterActive;
      } else if (isRedlineCandidate) {
        limiterActive = true;
      }

      if (limiterActive) {
        combGainLevel *= 0.12;
        if (now - this.lastLimiterPopTime > 0.055) {
          this.lastLimiterPopTime = now;
          this.triggerExhaustCrackles(0.85 * Math.max(0.7, profile.crackleIntensity));
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
      if ((profile.intakeLevel ?? 0) > 0 && this.intakeFilter) {
        const highRpmKick =
          clampedRpm > profile.intakeHighRpmThreshold
            ? 1.0 + ((clampedRpm - profile.intakeHighRpmThreshold) / Math.max(0.1, 1 - profile.intakeHighRpmThreshold)) * 1.45
            : 0.45 + clampedRpm * 0.55;
        const intakeHz = profile.intakeCenterHz * (0.62 + clampedRpm * 0.65);
        this.intakeFilter.frequency.setTargetAtTime(intakeHz, now, 0.02);
        intakeGainLevel = profile.intakeLevel * (0.18 + clampedThrottle * 0.82) * highRpmKick;
      }

      // === MGU-K HYBRID ELECTRIC MOTOR WHINE (tamed 10x-15x to avoid mosquito screech) ===
      if (profile.hasHybridWhine && !isNonHybridHypercar) {
        if (profile.mguLaunchDominant) {
          // Loudest at pit-exit / low-speed launch (< 95 km/h), blending subtly under ICE at speed
          const launchPresence =
            speedKmh < 95
              ? 1.0 - (speedKmh / 95) * 0.45
              : 0.32 + clampedThrottle * 0.25;
          elGainLevel = (profile.hybridWhineLevel ?? 0) * 0.05 * launchPresence * (0.55 + clampedThrottle * 0.65);
          inverterHz = Math.min(3200, 720 + speedKmh * 17 + clampedRpm * 850);
          inverterGearHz = Math.min(3800, 1440 + speedKmh * 26 + clampedRpm * 1200);
        } else {
          const isHypercar = classId === CarClassId.HYPERCAR_GTP;
          elGainLevel = (profile.hybridWhineLevel ?? 0) * 0.05 * (0.6 + clampedThrottle * 0.85);
          inverterHz = Math.min(3200, (isHypercar ? 920 : 1420) + clampedRpm * 1750);
          inverterGearHz = Math.min(3800, (isHypercar ? 1850 : 2450) + clampedRpm * 2100);
        }
        this.electricFilter.frequency.setTargetAtTime(Math.min(3200, inverterHz), now, 0.015);
      }

      // === STRAIGHT-CUT SEQUENTIAL GEARBOX WHINE (tamed 10x-15x for subtle texture) ===
      if ((profile.gearWhineLevel ?? 0) > 0) {
        const speedMix = Math.min(1.0, 0.16 + (speedKmh / 245) * 0.62 + clampedRpm * 0.28);
        gearGainLevel = (profile.gearWhineLevel ?? 0) * 0.055 * speedMix * (0.55 + clampedThrottle * 0.45);
        gearWhineHz = Math.min(
          3600,
          (950 + speedKmh * 12.5 + clampedRpm * 780) * (profile.gearWhinePitchScale || 1.0)
        );
        this.gearFilter?.frequency.setTargetAtTime(Math.min(3400, gearWhineHz * 1.1), now, 0.015);
      }

      // === TWIN-TURBO SPOOL WHISTLE + BOOST AIR HISS (tamed 10x-15x, smooth whisper) ===
      if ((profile.turboSpoolLevel ?? 0) > 0 && this.oscTurboSpool && this.turboSpoolFilter) {
        const boostLoad = Math.max(0, Math.min(1, clampedRpm * 0.48 + clampedThrottle * 0.62 - 0.1));
        const spoolHz = Math.min(4200, (2200 + boostLoad * 2600) * Math.max(0.75, profile.turboSpoolPitch));
        this.oscTurboSpool.frequency.setTargetAtTime(spoolHz, now, 0.02);
        this.turboSpoolFilter.frequency.setTargetAtTime(spoolHz, now, 0.02);
        this.turboNoiseFilter?.frequency.setTargetAtTime(Math.min(3600, spoolHz), now, 0.02);
        turboGainLevel = (profile.turboSpoolLevel ?? 0) * 0.05 * boostLoad * (0.35 + clampedThrottle * 0.65);
      }

      this.lastTelemetry = {
        rpm: Math.round(rpm),
        crankHz: Number(crankHz.toFixed(1)),
        firingHz: Number(firingHz.toFixed(1)),
        baseHz: Number(baseHz.toFixed(1)),
        limiterActive,
        outputDbfs: -16.0,
        layerLevels: {
          combustion: Math.min(1, combGainLevel / 0.65),
          intake: Math.min(1, intakeGainLevel / 0.35),
          turbo: Math.min(1, turboGainLevel * 25),
          mgu: Math.min(1, elGainLevel * 25),
          gearbox: Math.min(1, gearGainLevel * 22),
        },
      };
    }

    this.combustionGain.gain.setTargetAtTime(combGainLevel, now, 0.015);
    this.oscElectricInverter.frequency.setTargetAtTime(inverterHz, now, 0.015);
    this.oscElectricGear.frequency.setTargetAtTime(inverterGearHz, now, 0.015);
    this.electricGain.gain.setTargetAtTime(elGainLevel, now, 0.015);
    this.oscGearWhine?.frequency.setTargetAtTime(gearWhineHz, now, 0.015);
    this.oscGearWhineSub?.frequency.setTargetAtTime(Math.min(4200, gearWhineHz * 1.98), now, 0.015);
    this.gearGain?.gain.setTargetAtTime(gearGainLevel, now, 0.015);
    this.intakeGain?.gain.setTargetAtTime(intakeGainLevel, now, 0.015);
    this.turboSpoolGain?.gain.setTargetAtTime(turboGainLevel, now, 0.015);

    // Master / Engine Output Gain Calibration (strictly isolated on engineBus)
    const masterOutputGain = profile.engineOutputGain ?? profile.profileGain ?? 0.90;
    const overallEngineGain = (0.24 + clampedThrottle * 0.28) * masterOutputGain;
    this.engineGain.gain.setTargetAtTime(overallEngineGain, now, 0.03);

    // Live RMS Measurement & Auto-Leveling toward -16 dBFS (measured on engineBus only)
    let liveRms = 0.05;
    if (this.analyser) {
      if (!this.rmsBuffer || this.rmsBuffer.length !== 512) {
        this.rmsBuffer = new Float32Array(512);
      }
      this.analyser.getFloatTimeDomainData(this.rmsBuffer as unknown as Float32Array<ArrayBuffer>);
      let sumSq = 0;
      for (let i = 0; i < 512; i++) {
        const v = this.rmsBuffer[i];
        sumSq += v * v;
      }
      liveRms = Math.sqrt(sumSq / 512);
    }
    const liveDbfs = Number((20 * Math.log10(Math.max(1e-4, liveRms))).toFixed(1));
    this.lastTelemetry.outputDbfs = liveDbfs;

    const staticTrim = profile.type === 'ELECTRIC_EV' ? 0.35 : profile.cylinders >= 10 ? 0.72 : 0.85;
    const targetRms = 0.1585; // -16 dBFS
    if (clampedThrottle > 0.05 && liveRms > 0.015) {
      const neededGain = (targetRms / liveRms) * staticTrim;
      const clampedGain = Math.max(0.10, Math.min(2.5, neededGain));
      this.currentNormGain = this.currentNormGain * 0.92 + clampedGain * 0.08;
    } else {
      this.currentNormGain = this.currentNormGain * 0.95 + staticTrim * 0.05;
    }
    this.normalizeGainNode?.gain.setTargetAtTime(this.currentNormGain, now, 0.08);

    // Live Tire Scrub Audio (strictly routed to isolated sfxBus)
    if (this.scrubGain && this.scrubFilter) {
      const slipIntensity =
        speedKmh > 22 && lateralSlip > 0.14 ? Math.min(1, (lateralSlip - 0.14) * 1.45) : 0;
      this.scrubFilter.frequency.setTargetAtTime(1050 + slipIntensity * 850, now, 0.045);
      this.scrubGain.gain.setTargetAtTime(slipIntensity * 0.13, now, 0.045);
    }

    // Live Kerb Rumble Audio (strictly routed to isolated sfxBus)
    if (this.kerbGain && this.kerbOsc) {
      const kerbActive = onKerb && speedKmh > 18;
      this.kerbOsc.frequency.setTargetAtTime(52 + Math.min(48, speedKmh * 0.24), now, 0.035);
      this.kerbGain.gain.setTargetAtTime(kerbActive ? 0.16 : 0, now, 0.035);
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
    const outBus = this.sfxBus ?? this.masterGain;
    if (!this.ctx || !outBus || !this.noiseBuffer || this.muted) return;
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
    gain.connect(outBus);
    src.start(now);
    src.stop(now + 0.06);
  }

  /**
   * Multi-pulse turbo wastegate flutter chirp on throttle lift ("stu-tu-tu").
   */
  private triggerWastegateFlutter(intensity = 1.0) {
    const outBus = this.sfxBus ?? this.masterGain;
    if (!this.ctx || !outBus || !this.noiseBuffer || this.muted) return;
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
      gain.connect(outBus);
      src.start(t);
      src.stop(t + 0.042);
    }
  }

  /**
   * Exhaust pop/crackle sequence on throttle overrun, downshift, or rev-limiter bounce.
   */
  private triggerExhaustCrackles(intensity = 1.0) {
    const outBus = this.sfxBus ?? this.masterGain;
    if (!this.ctx || !outBus || !this.noiseBuffer || this.muted) return;
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
      gain.connect(outBus);

      src.start(popTime);
      src.stop(popTime + 0.05);
    }
  }

  playBeep(freq = 660, duration = 0.12) {
    const outBus = this.sfxBus ?? this.masterGain;
    if (!this.initialized || !this.ctx || !outBus || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(outBus);
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
      this.stopReferenceAudio();
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
      this.windSource?.stop();
      this.surfaceSource?.stop();
      this.musicOscA?.stop();
      this.musicOscB?.stop();
      for (const v of this.opponentVoices) {
        try {
          v.osc.stop();
          v.subOsc.stop();
          v.panner3d?.disconnect();
          v.stereoFallback?.disconnect();
          v.gain.disconnect();
        } catch {}
      }
      this.opponentVoices = [];
      try {
        this.tunnelPreFilter?.disconnect();
        this.tunnelConvolver?.disconnect();
        this.tunnelDelay?.disconnect();
        this.tunnelFeedback?.disconnect();
        this.tunnelWetGain?.disconnect();
      } catch {}
      this.tunnelPreFilter = null;
      this.tunnelConvolver = null;
      this.tunnelDelay = null;
      this.tunnelFeedback = null;
      this.tunnelWetGain = null;
      this.ctx?.close();
    } catch {
      // ignore
    }
    this.initialized = false;
  }
}

export const audioEngine = new MotorsportAudioEngine();

