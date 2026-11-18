import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Check,
  Copy,
  Flame,
  Gauge,
  Play,
  RotateCcw,
  Sliders,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import {
  AcousticProfile,
  clearSoundProfileOverride,
  getBaseAcousticProfile,
  loadSoundProfileOverrides,
  resolveAcousticProfile,
  saveSoundProfileOverride,
  SOUND_PRESET_CATALOG,
} from '../game/audio';
import { CAR_CLASSES, getCarById } from '../game/cars';
import { SoundProfileId } from '../game/types';
import { MotorsportAudioEngine } from '../three/audioEngine';

interface SoundEditorModalProps {
  currentCarId: string;
  onClose: () => void;
}

type TestMode = 'manual' | 'pedal' | 'sweep' | 'limiter';

const CYLINDER_OPTIONS = [4, 6, 8, 10, 12];
const WAVEFORM_OPTIONS: Array<{ value: OscillatorType; label: string }> = [
  { value: 'sawtooth', label: 'Sawtooth' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'square', label: 'Square' },
  { value: 'sine', label: 'Sine' },
];

export function SoundEditorModal({ currentCarId, onClose }: SoundEditorModalProps) {
  const activeCar = useMemo(() => getCarById(currentCarId), [currentCarId]);
  const defaultProfileId: SoundProfileId = useMemo(
    () =>
      resolveAcousticProfile(
        activeCar.id,
        activeCar.engineType,
        activeCar.classId,
        activeCar.soundProfile,
      ).soundProfile,
    [activeCar],
  );

  const [selectedPresetId, setSelectedPresetId] = useState<SoundProfileId>(defaultProfileId);
  const [profile, setProfile] = useState<AcousticProfile>(() =>
    resolveAcousticProfile(
      activeCar.id,
      activeCar.engineType,
      activeCar.classId,
      activeCar.soundProfile,
    ),
  );
  const [hasCustomOverride, setHasCustomOverride] = useState<boolean>(
    () => Boolean(loadSoundProfileOverrides()[defaultProfileId]),
  );

  // Audio playback & live simulation state
  const [audioRunning, setAudioRunning] = useState(false);
  const [testMode, setTestMode] = useState<TestMode>('manual');
  const [pedalPressed, setPedalPressed] = useState(false);
  const [manualRpm, setManualRpm] = useState(0.28);
  const [manualThrottle, setManualThrottle] = useState(0.25);
  const [manualGear, setManualGear] = useState(2);
  const [copiedJson, setCopiedJson] = useState(false);

  const [telemetry, setTelemetry] = useState({
    rpm: profile.idleRpm,
    crankHz: 0,
    firingHz: 0,
    baseHz: profile.baseIdleHz,
    limiterActive: false,
    gear: 2,
    speedKmh: 65,
    rpmNorm: 0.28,
    throttle: 0.25,
  });

  const engineRef = useRef<MotorsportAudioEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const profileRef = useRef<AcousticProfile>(profile);
  profileRef.current = profile;

  const simRef = useRef({
    audioRunning: false,
    testMode: 'manual' as TestMode,
    pedalPressed: false,
    manualRpm: 0.28,
    manualThrottle: 0.25,
    manualGear: 2,
    simRpm: 0.28,
    simThrottle: 0.25,
    simGear: 2,
    simSpeedKmh: 65,
    sweepPhaseTimer: 0,
    sweepLifting: false,
  });

  simRef.current.audioRunning = audioRunning;
  simRef.current.testMode = testMode;
  simRef.current.pedalPressed = pedalPressed;
  simRef.current.manualRpm = manualRpm;
  simRef.current.manualThrottle = manualThrottle;
  simRef.current.manualGear = manualGear;

  const groupedPresets = useMemo(() => {
    const groups = new Map<string, typeof SOUND_PRESET_CATALOG>();
    for (const item of SOUND_PRESET_CATALOG) {
      const list = groups.get(item.group) ?? [];
      list.push(item);
      groups.set(item.group, list);
    }
    return Array.from(groups.entries());
  }, []);

  const ensureAudioStarted = () => {
    if (!engineRef.current) {
      engineRef.current = new MotorsportAudioEngine();
    }
    engineRef.current.init();
    if (!audioRunning) {
      setAudioRunning(true);
    }
  };

  const applyLiveAudioUpdate = (p: AcousticProfile) => {
    profileRef.current = p;
    const engine = engineRef.current;
    if (engine && simRef.current.audioRunning) {
      engine.updateEngineWithProfile(
        p,
        simRef.current.simRpm,
        simRef.current.simThrottle,
        true,
        activeCar.classId,
        simRef.current.simSpeedKmh,
        p.soundProfile === defaultProfileId ? activeCar.id : '',
        0,
        false,
        simRef.current.simGear,
      );
    }
  };

  const handleSelectPreset = (presetId: SoundProfileId) => {
    setSelectedPresetId(presetId);
    const isCarMatch = presetId === defaultProfileId;
    const resolved = resolveAcousticProfile(
      isCarMatch ? activeCar.id : '',
      activeCar.engineType,
      isCarMatch ? activeCar.classId : undefined,
      presetId,
    );
    profileRef.current = resolved;
    setProfile(resolved);
    setHasCustomOverride(Boolean(loadSoundProfileOverrides()[presetId]));
    applyLiveAudioUpdate(resolved);
  };

  const updateProfileField = <K extends keyof AcousticProfile>(
    key: K,
    value: AcousticProfile[K],
  ) => {
    const next: AcousticProfile = {
      ...profileRef.current,
      [key]: value,
      harmonicWeights: [...profileRef.current.harmonicWeights],
    };
    if (key === 'profileGain') {
      next.engineOutputGain = value as number;
    } else if (key === 'engineOutputGain') {
      next.profileGain = value as number;
    }
    profileRef.current = next;
    setProfile(next);
    saveSoundProfileOverride(next.soundProfile, next);
    setHasCustomOverride(true);
    applyLiveAudioUpdate(next);
  };

  const updateHarmonicWeight = (index: number, value: number) => {
    const nextWeights = [...profileRef.current.harmonicWeights];
    while (nextWeights.length < 8) nextWeights.push(0);
    nextWeights[index] = value;
    const next: AcousticProfile = {
      ...profileRef.current,
      harmonicWeights: nextWeights,
    };
    profileRef.current = next;
    setProfile(next);
    saveSoundProfileOverride(next.soundProfile, next);
    setHasCustomOverride(true);
    applyLiveAudioUpdate(next);
  };

  const handleResetProfile = () => {
    clearSoundProfileOverride(selectedPresetId);
    const base = getBaseAcousticProfile(
      selectedPresetId,
      selectedPresetId === defaultProfileId ? activeCar.id : '',
    );
    profileRef.current = base;
    setProfile(base);
    setHasCustomOverride(false);
    applyLiveAudioUpdate(base);
  };

  const handleResetAll = () => {
    clearSoundProfileOverride();
    const base = getBaseAcousticProfile(
      selectedPresetId,
      selectedPresetId === defaultProfileId ? activeCar.id : '',
    );
    profileRef.current = base;
    setProfile(base);
    setHasCustomOverride(false);
    applyLiveAudioUpdate(base);
  };

  const handleCopyJson = async () => {
    const json = JSON.stringify(profile, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setCopiedJson(true);
      window.setTimeout(() => setCopiedJson(false), 1800);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  // Live audio synthesis & spectrum visualizer RAF loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let lastUiUpdate = 0;
    const freqData = new Uint8Array(128);
    const timeData = new Uint8Array(128);

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const s = simRef.current;
      const p = profileRef.current;
      const engine = engineRef.current;

      if (s.testMode === 'limiter') {
        s.simThrottle = 1.0;
        s.simRpm = 0.995;
        s.simGear = s.manualGear;
        s.simSpeedKmh = Math.min(330, 52 * s.simGear);
      } else if (s.testMode === 'sweep') {
        s.sweepPhaseTimer += dt;
        if (!s.sweepLifting) {
          s.simThrottle = 1.0;
          const accelRate = Math.max(0.32, 0.92 - (s.simGear - 1) * 0.11);
          s.simRpm += dt * accelRate;
          if (s.simRpm >= 0.99) {
            if (s.simGear < 6) {
              s.simGear += 1;
              s.simRpm = 0.58;
            } else {
              // Hold top gear redline bounce briefly, then lift off for overrun crackles
              if (s.sweepPhaseTimer > 7.5) {
                s.sweepLifting = true;
                s.sweepPhaseTimer = 0;
              } else {
                s.simRpm = 0.992;
              }
            }
          }
        } else {
          s.simThrottle = 0.0;
          s.simRpm -= dt * 0.42;
          if (s.simRpm <= 0.46 && s.simGear > 2) {
            s.simGear -= 1;
            s.simRpm = 0.78;
          }
          if (s.sweepPhaseTimer > 2.6 || (s.simGear <= 2 && s.simRpm <= 0.22)) {
            s.sweepLifting = false;
            s.sweepPhaseTimer = 0;
            s.simGear = 1;
            s.simRpm = 0.15;
          }
        }
        s.simSpeedKmh = Math.max(25, Math.min(335, s.simGear * 48 * (0.4 + s.simRpm * 0.68)));
      } else if (s.testMode === 'pedal') {
        if (s.pedalPressed) {
          s.simThrottle = Math.min(1, s.simThrottle + dt * 6.0);
          s.simRpm += dt * (1.25 - (s.simGear - 1) * 0.14);
          if (s.simRpm >= 0.993) {
            if (s.simGear < 6) {
              s.simGear += 1;
              s.simRpm = 0.62;
            } else {
              s.simRpm = 0.993;
            }
          }
        } else {
          s.simThrottle = Math.max(0, s.simThrottle - dt * 5.0);
          s.simRpm = Math.max(0.06, s.simRpm - dt * 0.55);
          if (s.simRpm < 0.28 && s.simGear > 1) {
            s.simGear -= 1;
            s.simRpm = 0.55;
          }
        }
        s.simSpeedKmh = Math.max(0, Math.min(340, s.simGear * 46 * s.simRpm));
      } else {
        // Manual sliders
        s.simRpm = s.manualRpm;
        s.simThrottle = s.manualThrottle;
        s.simGear = s.manualGear;
        s.simSpeedKmh = s.manualGear * 44 * (0.25 + s.manualRpm * 0.78);
      }

      if (engine && s.audioRunning) {
        engine.updateEngineWithProfile(
          p,
          s.simRpm,
          s.simThrottle,
          true,
          activeCar.classId,
          s.simSpeedKmh,
          p.soundProfile === defaultProfileId ? activeCar.id : '',
          0,
          false,
          s.simGear,
        );
      } else if (engine && !s.audioRunning) {
        engine.updateEngineWithProfile(p, 0, 0, false, activeCar.classId, 0, '', 0, false, 1);
      }

      // Render live spectrum & waveform on canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx2d = canvas.getContext('2d');
        if (ctx2d) {
          const w = canvas.width;
          const h = canvas.height;
          ctx2d.fillStyle = '#070b12';
          ctx2d.fillRect(0, 0, w, h);

          // Subtle frequency grid
          ctx2d.strokeStyle = 'rgba(148,163,184,0.08)';
          ctx2d.lineWidth = 1;
          for (let gx = 1; gx < 6; gx++) {
            const xPos = (gx / 6) * w;
            ctx2d.beginPath();
            ctx2d.moveTo(xPos, 0);
            ctx2d.lineTo(xPos, h);
            ctx2d.stroke();
          }

          if (engine && s.audioRunning && engine.getAnalyserFrequencyData(freqData)) {
            const barCount = 56;
            const barW = w / barCount;
            for (let i = 0; i < barCount; i++) {
              const mag = freqData[i] / 255;
              const barH = mag * (h - 10);
              const hue = 205 - mag * 190; // cyan -> amber -> crimson
              ctx2d.fillStyle = `hsla(${hue}, 88%, 55%, 0.78)`;
              ctx2d.fillRect(i * barW + 1, h - barH, Math.max(1, barW - 2), barH);
            }
          }

          if (engine && s.audioRunning && engine.getAnalyserTimeData(timeData)) {
            ctx2d.strokeStyle = '#38bdf8';
            ctx2d.lineWidth = 1.6;
            ctx2d.beginPath();
            for (let i = 0; i < timeData.length; i++) {
              const x = (i / (timeData.length - 1)) * w;
              const v = (timeData[i] - 128) / 128;
              const y = h * 0.5 + v * (h * 0.42);
              if (i === 0) ctx2d.moveTo(x, y);
              else ctx2d.lineTo(x, y);
            }
            ctx2d.stroke();
          } else {
            ctx2d.strokeStyle = 'rgba(56,189,248,0.28)';
            ctx2d.lineWidth = 1.2;
            ctx2d.beginPath();
            ctx2d.moveTo(0, h * 0.5);
            ctx2d.lineTo(w, h * 0.5);
            ctx2d.stroke();
          }
        }
      }

      if (now - lastUiUpdate > 55) {
        lastUiUpdate = now;
        const t = engine?.lastTelemetry;
        setTelemetry({
          rpm:
            t && s.audioRunning
              ? t.rpm
              : Math.round(p.idleRpm + s.simRpm * (p.redlineRpm - p.idleRpm)),
          crankHz: t && s.audioRunning ? t.crankHz : 0,
          firingHz: t && s.audioRunning ? t.firingHz : 0,
          baseHz: t && s.audioRunning ? t.baseHz : 0,
          limiterActive: Boolean(t?.limiterActive && s.audioRunning),
          gear: s.simGear,
          speedKmh: Math.round(s.simSpeedKmh),
          rpmNorm: s.simRpm,
          throttle: s.simThrottle,
        });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [activeCar.classId, activeCar.id, defaultProfileId]);

  // Clean up Web Audio context on unmount
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  const classMeta = CAR_CLASSES[activeCar.classId];

  return (
    <div
      data-testid="sound-editor-modal"
      className="fixed inset-0 z-40 bg-[#070a10] text-slate-100 flex flex-col overflow-hidden"
    >
      {/* Top Studio Header */}
      <header className="shrink-0 flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 bg-[#0e131d] border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-400">
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display font-bold text-base tracking-wide text-white">
                IMSA Acoustic Sound Studio
              </h2>
              {hasCustomOverride && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-400/30">
                  Custom Saved
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Active Car: <span className="text-slate-200 font-medium">{activeCar.name}</span> ({classMeta.shortName}) · Changes apply live in-race
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              if (!audioRunning) {
                ensureAudioStarted();
              } else {
                setAudioRunning(false);
              }
            }}
            className={`px-3.5 py-2 rounded-md font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-colors ${
              audioRunning
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-red-600 hover:bg-red-500 text-white'
            }`}
          >
            {audioRunning ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {audioRunning ? 'Mute Studio Audio' : 'Start Audio Engine'}
          </button>

          <button
            type="button"
            onClick={handleCopyJson}
            className="px-3 py-2 rounded-md bg-[#172030] hover:bg-[#1f2b40] border border-white/15 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer"
          >
            {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedJson ? 'Copied JSON!' : 'Copy JSON Preset'}
          </button>

          <button
            type="button"
            onClick={handleResetProfile}
            disabled={!hasCustomOverride}
            className="px-3 py-2 rounded-md bg-[#172030] hover:bg-[#1f2b40] disabled:opacity-40 border border-white/15 text-xs font-semibold text-slate-300 flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Profile
          </button>

          <button
            type="button"
            onClick={handleResetAll}
            className="px-3 py-2 rounded-md bg-[#172030] hover:bg-[#1f2b40] border border-white/10 text-xs font-medium text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            Reset All
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-md bg-white/10 hover:bg-white/20 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
          >
            <X className="w-4 h-4" />
            Done
          </button>
        </div>
      </header>

      {/* Main Content Split */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Left Column: Preset Selector, Live Pedals & Telemetry Oscilloscope */}
        <section className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-white/10 bg-[#0b1019] p-5 flex flex-col gap-4 overflow-y-auto custom-scroll">
          {/* Preset Selector */}
          <div className="p-3.5 rounded-lg bg-[#111827] border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Engine Preset & Car Profile
              </label>
              <button
                type="button"
                onClick={() => handleSelectPreset(defaultProfileId)}
                className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
              >
                Load Active Car
              </button>
            </div>
            <select
              value={selectedPresetId}
              onChange={(e) => handleSelectPreset(e.target.value as SoundProfileId)}
              className="w-full px-3 py-2 rounded bg-[#0a0e16] border border-white/15 text-sm text-white focus:outline-none focus:border-amber-400"
            >
              {groupedPresets.map(([group, items]) => (
                <optgroup key={group} label={group}>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                      {item.id === defaultProfileId ? ' ★ (Active Car)' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Architecture: <strong className="text-slate-200">{profile.type}</strong></span>
              <span>ID: <code className="text-sky-300">{profile.soundProfile}</code></span>
            </div>
          </div>

          {/* Live Telemetry & Spectrum Canvas */}
          <div className="p-3.5 rounded-lg bg-[#111827] border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Activity className="w-4 h-4 text-sky-400" />
                Live Exhaust Spectrum & Waveform
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                  telemetry.limiterActive
                    ? 'bg-red-600/25 border-red-500 text-red-300'
                    : 'bg-slate-800 border-white/10 text-slate-400'
                }`}
              >
                {telemetry.limiterActive ? 'IGNITION CUT LIMITER' : 'CLEAN COMBUSTION'}
              </span>
            </div>

            <canvas
              ref={canvasRef}
              width={480}
              height={130}
              className="w-full h-32 rounded border border-white/10 bg-[#070b12]"
            />

            {/* RPM Bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-telemetry">
                <span className="text-white font-bold">{telemetry.rpm.toLocaleString()} RPM</span>
                <span className="text-slate-400">
                  Gear {telemetry.gear} · {telemetry.speedKmh} km/h · Redline {profile.redlineRpm.toLocaleString()}
                </span>
              </div>
              <div className="h-2.5 rounded bg-[#070b12] overflow-hidden border border-white/10">
                <div
                  className="h-full transition-all duration-75"
                  style={{
                    width: `${Math.round(telemetry.rpmNorm * 100)}%`,
                    backgroundColor:
                      telemetry.rpmNorm >= 0.96
                        ? '#ef4444'
                        : telemetry.rpmNorm >= 0.8
                          ? '#f59e0b'
                          : '#38bdf8',
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className="p-2 rounded bg-[#0a0e16] border border-white/5">
                <div className="text-[10px] uppercase text-slate-400">Crank Hz</div>
                <div className="font-telemetry text-xs font-bold text-slate-100">{telemetry.crankHz} Hz</div>
              </div>
              <div className="p-2 rounded bg-[#0a0e16] border border-white/5">
                <div className="text-[10px] uppercase text-slate-400">Firing Order Hz</div>
                <div className="font-telemetry text-xs font-bold text-amber-300">{telemetry.firingHz} Hz</div>
              </div>
              <div className="p-2 rounded bg-[#0a0e16] border border-white/5">
                <div className="text-[10px] uppercase text-slate-400">Synth Base Hz</div>
                <div className="font-telemetry text-xs font-bold text-sky-300">{telemetry.baseHz} Hz</div>
              </div>
            </div>
          </div>

          {/* Interactive Throttle Pedal / RPM Sweep / Rev-Limiter Controls */}
          <div className="p-3.5 rounded-lg bg-[#111827] border border-white/10 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <Gauge className="w-4 h-4 text-amber-400" />
              Interactive Dyno & Rev-Limiter Pedal
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onPointerDown={() => {
                  ensureAudioStarted();
                  setTestMode('pedal');
                  setPedalPressed(true);
                }}
                onPointerUp={() => setPedalPressed(false)}
                onPointerLeave={() => setPedalPressed(false)}
                onPointerCancel={() => setPedalPressed(false)}
                className={`py-3 px-2 rounded-md font-bold text-xs uppercase tracking-wide border transition-colors cursor-pointer select-none ${
                  testMode === 'pedal' && pedalPressed
                    ? 'bg-emerald-600 border-emerald-400 text-white'
                    : 'bg-[#172030] hover:bg-[#1f2c42] border-emerald-500/40 text-emerald-300'
                }`}
              >
                Hold Throttle Pedal
              </button>

              <button
                type="button"
                onClick={() => {
                  ensureAudioStarted();
                  setTestMode((prev) => (prev === 'sweep' ? 'manual' : 'sweep'));
                }}
                className={`py-3 px-2 rounded-md font-bold text-xs uppercase tracking-wide border transition-colors cursor-pointer ${
                  testMode === 'sweep'
                    ? 'bg-sky-600 border-sky-400 text-white'
                    : 'bg-[#172030] hover:bg-[#1f2c42] border-sky-500/40 text-sky-300'
                }`}
              >
                {testMode === 'sweep' ? 'Stop Gear Sweep' : 'Auto RPM Sweep'}
              </button>

              <button
                type="button"
                onClick={() => {
                  ensureAudioStarted();
                  setTestMode((prev) => (prev === 'limiter' ? 'manual' : 'limiter'));
                }}
                className={`py-3 px-2 rounded-md font-bold text-xs uppercase tracking-wide border transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                  testMode === 'limiter'
                    ? 'bg-red-600 border-red-400 text-white'
                    : 'bg-[#172030] hover:bg-[#1f2c42] border-red-500/40 text-red-300'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                {testMode === 'limiter' ? 'Stop Limiter' : 'Rev Limiter Test'}
              </button>
            </div>

            {/* Manual RPM / Throttle / Gear Sliders */}
            <div className="space-y-2.5 pt-1">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Manual RPM Sweep</span>
                  <span className="font-telemetry text-white">{Math.round(manualRpm * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.005}
                  value={testMode === 'manual' ? manualRpm : telemetry.rpmNorm}
                  onChange={(e) => {
                    ensureAudioStarted();
                    setTestMode('manual');
                    setManualRpm(parseFloat(e.target.value));
                  }}
                  className="w-full accent-sky-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Throttle Load</span>
                  <span className="font-telemetry text-white">{Math.round(manualThrottle * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={testMode === 'manual' ? manualThrottle : telemetry.throttle}
                  onChange={(e) => {
                    ensureAudioStarted();
                    setTestMode('manual');
                    setManualThrottle(parseFloat(e.target.value));
                  }}
                  className="w-full accent-emerald-400 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-300">Simulated Gear</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5, 6].map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => {
                        ensureAudioStarted();
                        setTestMode('manual');
                        setManualGear(g);
                      }}
                      className={`w-7 h-7 rounded text-xs font-telemetry font-bold border cursor-pointer ${
                        manualGear === g
                          ? 'bg-amber-500 border-amber-400 text-slate-950'
                          : 'bg-[#0a0e16] border-white/10 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Synth Parameter Sliders & Toggles */}
        <section className="lg:col-span-7 bg-[#090d14] p-5 overflow-y-auto custom-scroll space-y-5">
          {/* Section 1: Engine Geometry & Rev Limiter */}
          <div className="p-4 rounded-lg bg-[#101622] border border-white/10 space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-300">
              <Sliders className="w-4 h-4" />
              1. Engine Architecture, RPM Range & Rev Limiter
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-slate-300 mb-1.5">Cylinder Count (Firing Order)</div>
                <div className="flex gap-1.5">
                  {CYLINDER_OPTIONS.map((cyl) => (
                    <button
                      key={cyl}
                      type="button"
                      onClick={() => updateProfileField('cylinders', cyl)}
                      className={`flex-1 py-1.5 rounded text-xs font-telemetry font-bold border cursor-pointer ${
                        profile.cylinders === cyl
                          ? 'bg-amber-500 border-amber-400 text-slate-950'
                          : 'bg-[#0a0e16] border-white/10 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      {cyl}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-300 mb-1.5">Primary Oscillator Waveform</div>
                <div className="flex gap-1.5">
                  {WAVEFORM_OPTIONS.map((wf) => (
                    <button
                      key={wf.value}
                      type="button"
                      onClick={() => updateProfileField('oscCombustionType', wf.value)}
                      className={`flex-1 py-1.5 rounded text-xs font-semibold border cursor-pointer ${
                        profile.oscCombustionType === wf.value
                          ? 'bg-sky-500 border-sky-400 text-slate-950'
                          : 'bg-[#0a0e16] border-white/10 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      {wf.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SliderControl
                label="Idle RPM"
                value={profile.idleRpm}
                min={600}
                max={4500}
                step={50}
                unit=" RPM"
                onChange={(v) => updateProfileField('idleRpm', v)}
              />
              <SliderControl
                label="Redline RPM"
                value={profile.redlineRpm}
                min={6000}
                max={19000}
                step={100}
                unit=" RPM"
                onChange={(v) => updateProfileField('redlineRpm', v)}
              />
              <SliderControl
                label="Rev-Limiter Cut Rate"
                value={profile.revLimiterRateHz}
                min={14}
                max={22}
                step={0.5}
                unit=" Hz"
                onChange={(v) => updateProfileField('revLimiterRateHz', v)}
              />
            </div>
          </div>

          {/* Section 2: Harmonic Mixer */}
          <div className="p-4 rounded-lg bg-[#101622] border border-white/10 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-sky-300">
              2. Firing-Order Harmonic Mixer (PeriodicWave & Sub)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              <SliderControl
                label="0.5x Sub-Rumble"
                value={profile.subLevel ?? 0.6}
                min={0}
                max={1.4}
                step={0.02}
                onChange={(v) => updateProfileField('subLevel', v)}
              />
              <SliderControl
                label="1x Fundamental"
                value={profile.harmonicWeights[0] ?? 1.0}
                min={0}
                max={1.5}
                step={0.02}
                onChange={(v) => updateHarmonicWeight(0, v)}
              />
              <SliderControl
                label="2nd Order (Cross-Plane V8)"
                value={profile.harmonicWeights[1] ?? 0.7}
                min={0}
                max={1.5}
                step={0.02}
                onChange={(v) => updateHarmonicWeight(1, v)}
              />
              <SliderControl
                label="3rd Order (Flat-6 Boxer)"
                value={profile.harmonicWeights[2] ?? 0.5}
                min={0}
                max={1.5}
                step={0.02}
                onChange={(v) => updateHarmonicWeight(2, v)}
              />
              <SliderControl
                label="4th Order (Flat-Plane V8)"
                value={profile.harmonicWeights[3] ?? 0.4}
                min={0}
                max={1.5}
                step={0.02}
                onChange={(v) => updateHarmonicWeight(3, v)}
              />
              <SliderControl
                label="5th Order (V10 Wail)"
                value={profile.harmonicWeights[4] ?? 0.2}
                min={0}
                max={1.5}
                step={0.02}
                onChange={(v) => updateHarmonicWeight(4, v)}
              />
              <SliderControl
                label="6th Order (Top Scream)"
                value={profile.harmonicWeights[5] ?? 0.15}
                min={0}
                max={1.5}
                step={0.02}
                onChange={(v) => updateHarmonicWeight(5, v)}
              />
            </div>
          </div>

          {/* Section 3: Master Gain, Exhaust Filter, Distortion, Intake & Crackle */}
          <div className="p-4 rounded-lg bg-[#101622] border border-white/10 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-rose-300">
              3. Engine Output Gain, Exhaust Resonance, Growl Drive & Intake Snarl
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              <SliderControl
                label="Engine Output Gain"
                value={profile.profileGain ?? profile.engineOutputGain ?? 1.6}
                min={0.2}
                max={3.0}
                step={0.05}
                unit="x"
                onChange={(v) => updateProfileField('profileGain', v)}
              />
              <SliderControl
                label="Exhaust Low-Pass Cutoff"
                value={profile.wotFilterCutoff}
                min={600}
                max={3500}
                step={25}
                unit=" Hz"
                onChange={(v) => updateProfileField('wotFilterCutoff', v)}
              />
              <SliderControl
                label="Filter Resonance (Q)"
                value={profile.filterQ}
                min={0.5}
                max={6.0}
                step={0.1}
                onChange={(v) => updateProfileField('filterQ', v)}
              />
              <SliderControl
                label="Distortion / Growl Drive"
                value={profile.distortionDrive}
                min={4}
                max={45}
                step={1}
                onChange={(v) => updateProfileField('distortionDrive', v)}
              />
              <SliderControl
                label="Intake Roar Gain"
                value={profile.intakeLevel}
                min={0}
                max={0.35}
                step={0.01}
                onChange={(v) => updateProfileField('intakeLevel', v)}
              />
              <SliderControl
                label="Overrun Crackle Intensity"
                value={profile.crackleIntensity}
                min={0}
                max={2.5}
                step={0.05}
                onChange={(v) => updateProfileField('crackleIntensity', v)}
              />
              <div className="flex items-end pb-1">
                <button
                  type="button"
                  onClick={() => updateProfileField('hasExhaustCrackles', !profile.hasExhaustCrackles)}
                  className={`w-full py-2 px-3 rounded text-xs font-semibold border cursor-pointer ${
                    profile.hasExhaustCrackles
                      ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                      : 'bg-[#0a0e16] border-white/10 text-slate-400'
                  }`}
                >
                  Overrun Pops: {profile.hasExhaustCrackles ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
          </div>

          {/* Section 4: Turbo Spool, MGU-K Hybrid & Gearbox Whine */}
          <div className="p-4 rounded-lg bg-[#101622] border border-white/10 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
              4. Turbocharger, MGU-K Hybrid & Straight-Cut Gearbox
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              <SliderControl
                label="Turbo Spool Gain"
                value={profile.turboSpoolLevel}
                min={0}
                max={1.0}
                step={0.01}
                onChange={(v) => updateProfileField('turboSpoolLevel', v)}
              />
              <SliderControl
                label="Turbo Whistle Pitch"
                value={profile.turboSpoolPitch}
                min={0.7}
                max={1.8}
                step={0.02}
                unit="x"
                onChange={(v) => updateProfileField('turboSpoolPitch', v)}
              />
              <SliderControl
                label="MGU-K Hybrid Whine"
                value={profile.hybridWhineLevel}
                min={0}
                max={1.0}
                step={0.01}
                onChange={(v) => updateProfileField('hybridWhineLevel', v)}
              />
              <SliderControl
                label="Straight-Cut Gearbox Whine"
                value={profile.gearWhineLevel}
                min={0}
                max={1.0}
                step={0.01}
                onChange={(v) => updateProfileField('gearWhineLevel', v)}
              />
              <div className="flex items-end pb-1">
                <button
                  type="button"
                  onClick={() => updateProfileField('hasHybridWhine', !profile.hasHybridWhine)}
                  className={`w-full py-2 px-3 rounded text-xs font-semibold border cursor-pointer ${
                    profile.hasHybridWhine
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                      : 'bg-[#0a0e16] border-white/10 text-slate-400'
                  }`}
                >
                  MGU-K Motor: {profile.hasHybridWhine ? 'ON' : 'OFF'}
                </button>
              </div>
              <div className="flex items-end pb-1">
                <button
                  type="button"
                  onClick={() => updateProfileField('hasTurboFlutter', !profile.hasTurboFlutter)}
                  className={`w-full py-2 px-3 rounded text-xs font-semibold border cursor-pointer ${
                    profile.hasTurboFlutter
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                      : 'bg-[#0a0e16] border-white/10 text-slate-400'
                  }`}
                >
                  Wastegate Flutter: {profile.hasTurboFlutter ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  unit = '',
  onChange,
}: SliderControlProps) {
  const formatted =
    step >= 1
      ? `${Math.round(value)}${unit}`
      : `${value.toFixed(2)}${unit}`;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-300 truncate pr-2">{label}</span>
        <span className="font-telemetry text-slate-100 shrink-0">{formatted}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-amber-400 cursor-pointer"
      />
    </div>
  );
}
