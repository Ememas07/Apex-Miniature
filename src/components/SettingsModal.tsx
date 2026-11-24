import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Eye,
  Gamepad2,
  Gauge,
  Hand,
  Keyboard,
  Monitor,
  Radio,
  RotateCcw,
  Settings,
  Sliders,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  applyGraphicsPreset,
  applyWheelPreset,
  ColorblindMode,
  DEFAULT_GAME_SETTINGS,
  DEFAULT_KEYBINDS,
  formatKeyCode,
  GameSettings,
  getGameSettings,
  GraphicsPreset,
  HudPreset,
  KEYBIND_LABELS,
  KeybindAction,
  KeybindMap,
  ParticleDensitySetting,
  RacingLineMode,
  setGameSettings,
  ShadowQuality,
  SteeringLockCurve,
  subscribeGameSettings,
  TouchControlsMode,
  TouchSteerStyle,
  TransmissionMode,
  UnitsSystem,
  WHEEL_CALIBRATION_PRESETS,
  WHEEL_PRESET_ORDER,
} from '../game/settings';
import {
  computeWheelSteer,
  detectWheelPresetFromGamepadId,
  readWheelPedals,
  selectActiveGamepad,
} from '../game/gamepad';
import { EngineerVerbosity, TcLevel } from '../game/types';
import { isTouchCapableDevice } from '../game/touchControls';
import { audioEngine } from '../three/audioEngine';

interface SettingsModalProps {
  onClose: () => void;
}

type SettingsTab = 'controls' | 'graphics' | 'audio' | 'camera' | 'hud' | 'accessibility';

function detectConnectedGamepadName(): string | null {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return null;
  }
  try {
    const pads = navigator.getGamepads() ?? [];
    for (let i = 0; i < pads.length; i++) {
      const gp = pads[i];
      if (gp && gp.connected) {
        return gp.id || `Controller #${gp.index + 1}`;
      }
    }
  } catch {
    // Ignore restricted Gamepad API environments
  }
  return null;
}

interface PadLiveAxes {
  steer: number; // -1..1
  throttle: number; // 0..1
  brake: number; // 0..1
}

function SliderRow({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
  sublabel,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  sublabel?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-white/90">{label}</span>
        <span className="font-mono font-bold text-amber-300 tabular-nums">{valueLabel}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 accent-amber-400 bg-white/10 rounded-lg cursor-pointer"
      />
      {sublabel && <div className="text-[11px] text-white/45">{sublabel}</div>}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 transition text-left"
    >
      <div>
        <div className="text-xs font-bold text-white">{label}</div>
        {description && <div className="text-[11px] text-white/45 mt-0.5">{description}</div>}
      </div>
      <span
        className={`shrink-0 inline-flex items-center w-10 h-5 rounded-full p-0.5 transition-colors ${
          checked ? 'bg-emerald-500 justify-end' : 'bg-white/15 justify-start'
        }`}
      >
        <span className="w-4 h-4 rounded-full bg-white shadow" />
      </span>
    </button>
  );
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('controls');
  const [settings, setSettings] = useState<GameSettings>(() => getGameSettings());
  const [listeningAction, setListeningAction] = useState<KeybindAction | null>(null);
  const [isTouchDevice] = useState<boolean>(() => isTouchCapableDevice());
  const [detectedGamepad, setDetectedGamepad] = useState<string | null>(() =>
    detectConnectedGamepadName(),
  );
  const [liveAxes, setLiveAxes] = useState<PadLiveAxes>({ steer: 0, throttle: 0, brake: 0 });
  const [muted, setMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('apex_audio_muted') === 'true';
    } catch {
      return false;
    }
  });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const patch = (partial: Partial<GameSettings>) => {
    const next = setGameSettings(partial);
    setSettings(next);
    audioEngine.applyMixerSettings(next);
    try {
      localStorage.setItem('apex_audio_volume', String(next.masterVolume));
    } catch {
      // Ignore storage errors
    }
  };

  useEffect(() => {
    const unsub = subscribeGameSettings((next) => {
      setSettings(next);
    });
    const refreshPads = () => setDetectedGamepad(detectConnectedGamepadName());
    window.addEventListener('gamepadconnected', refreshPads);
    window.addEventListener('gamepaddisconnected', refreshPads);
    return () => {
      unsub();
      window.removeEventListener('gamepadconnected', refreshPads);
      window.removeEventListener('gamepaddisconnected', refreshPads);
    };
  }, []);

  // Live Gamepad / Wheel Axis Tester when Controls tab is active
  useEffect(() => {
    if (activeTab !== 'controls') return;
    let rafId = 0;
    const poll = () => {
      try {
        const pads = Array.from(navigator.getGamepads?.() ?? []);
        const found = selectActiveGamepad(pads, null);
        if (found) {
          const s = settingsRef.current;
          const { steer } = computeWheelSteer((found.axes ?? [])[0] ?? 0, s);
          const pedals = readWheelPedals(found.axes ?? [], found.buttons ?? [], {
            triggerDeadzone: 0.04,
            splitPedalAxes: s.splitPedalAxes,
            combinedPedalAxis: s.combinedPedalAxis,
            invertThrottleAxis: s.invertThrottleAxis,
            invertBrakeAxis: s.invertBrakeAxis,
          });
          setLiveAxes({ steer, throttle: pedals.throttle, brake: pedals.brake });
          if (!detectedGamepad) setDetectedGamepad(found.id || `Controller #${found.index + 1}`);
        }
      } catch {
        // Ignore restricted environments
      }
      rafId = requestAnimationFrame(poll);
    };
    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, [activeTab, detectedGamepad]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (listeningAction) {
        e.preventDefault();
        e.stopPropagation();
        if (e.code === 'Escape') {
          setListeningAction(null);
          return;
        }
        const next: KeybindMap = { ...settingsRef.current.keybinds };
        const prevCode = next[listeningAction];
        (Object.keys(next) as KeybindAction[]).forEach((act) => {
          if (act !== listeningAction && next[act] === e.code) {
            next[act] = prevCode;
          }
        });
        next[listeningAction] = e.code;
        patch({ keybinds: next });
        setListeningAction(null);
        return;
      }
      if (e.code === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [listeningAction, onClose]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    audioEngine.setMuted(next);
    try {
      localStorage.setItem('apex_audio_muted', String(next));
    } catch {
      // ignore
    }
  };

  const resetAllSettings = () => {
    const next = setGameSettings({
      ...DEFAULT_GAME_SETTINGS,
      keybinds: { ...DEFAULT_KEYBINDS },
    });
    setSettings(next);
    audioEngine.applyMixerSettings(next);
    setMuted(false);
    audioEngine.setMuted(false);
  };

  const tabs: Array<{ id: SettingsTab; label: string; icon: typeof Settings }> = [
    { id: 'controls', label: 'Controls & Aids', icon: Gamepad2 },
    { id: 'graphics', label: 'Graphics', icon: Monitor },
    { id: 'audio', label: 'Audio', icon: Volume2 },
    { id: 'camera', label: 'Camera', icon: Camera },
    { id: 'hud', label: 'HUD', icon: Gauge },
    { id: 'accessibility', label: 'Access', icon: Eye },
  ];

  const keybindOrder: KeybindAction[] = [
    'throttle',
    'brake',
    'steerLeft',
    'steerRight',
    'shiftUp',
    'shiftDown',
    'special',
    'ersMode',
    'brakeBiasDown',
    'brakeBiasUp',
    'tcToggle',
    'mfdCycle',
    'camera',
    'resetCamera',
    'lookBack',
    'flashback',
    'photoMode',
    'pause',
    'mute',
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        data-gamepad-scope="settings-modal"
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-[#0c1018] border border-white/15 shadow-2xl overflow-hidden text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-300">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-wide uppercase">Motorsport Settings Suite</h2>
              <p className="text-[11px] text-white/50">
                All preferences save automatically and apply live in-session
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/75 hover:text-white transition"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1 px-4 py-2.5 border-b border-white/10 bg-black/30 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  active
                    ? 'bg-amber-400 text-black shadow'
                    : 'bg-white/[0.03] text-white/70 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 1. CONTROLS & DRIVING AIDS */}
          {activeTab === 'controls' && (
            <div className="space-y-5">
              {/* Driving Aids */}
              <section className="rounded-xl bg-white/[0.03] border border-white/10 p-4 space-y-4">
                <div className="text-xs font-black uppercase tracking-wider text-amber-300">
                  Driving Aids & Transmission
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <div className="text-[11px] font-bold text-white/60 mb-1.5">Transmission</div>
                    <div className="grid grid-cols-3 gap-1">
                      {(['auto', 'semi-auto', 'manual'] as TransmissionMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => patch({ transmissionMode: mode })}
                          className={`px-2 py-2 rounded-lg text-[11px] font-bold uppercase border transition ${
                            settings.transmissionMode === mode
                              ? 'bg-amber-400 text-black border-amber-300'
                              : 'bg-white/5 text-white/75 border-white/10 hover:bg-white/10'
                          }`}
                        >
                          {mode === 'semi-auto' ? 'Semi' : mode}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white/60 mb-1.5">Traction Control</div>
                    <div className="grid grid-cols-5 gap-1">
                      {(['auto', 0, 1, 2, 3] as Array<'auto' | TcLevel>).map((lvl) => (
                        <button
                          key={String(lvl)}
                          type="button"
                          onClick={() => patch({ tcDefault: lvl })}
                          className={`px-1.5 py-2 rounded-lg text-[11px] font-bold uppercase border transition ${
                            settings.tcDefault === lvl
                              ? 'bg-amber-400 text-black border-amber-300'
                              : 'bg-white/5 text-white/75 border-white/10 hover:bg-white/10'
                          }`}
                        >
                          {lvl === 'auto' ? 'Auto' : lvl === 0 ? 'Off' : `TC${lvl}`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white/60 mb-1.5">Dynamic Racing Line</div>
                    <div className="grid grid-cols-3 gap-1">
                      {(['off', 'corners-only', 'full'] as RacingLineMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => patch({ racingLineMode: mode })}
                          className={`px-2 py-2 rounded-lg text-[11px] font-bold uppercase border transition ${
                            settings.racingLineMode === mode
                              ? 'bg-amber-400 text-black border-amber-300'
                              : 'bg-white/5 text-white/75 border-white/10 hover:bg-white/10'
                          }`}
                        >
                          {mode === 'corners-only' ? 'Brake' : mode}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ToggleRow
                    label="Stability Control (SC)"
                    description="Counters sudden snap oversteer on corner exit"
                    checked={settings.stabilityControl}
                    onChange={(v) => patch({ stabilityControl: v })}
                  />
                  <ToggleRow
                    label="Pre-Race Controls Briefing"
                    description="Show adaptive input cheat-sheet during grid lights"
                    checked={settings.showControlsBriefing}
                    onChange={(v) => patch({ showControlsBriefing: v })}
                  />
                </div>
              </section>

              {/* Gamepad & Wheel Calibration */}
              <section className="rounded-xl bg-white/[0.03] border border-white/10 p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-300">
                    <Gamepad2 className="w-4 h-4" />
                    Gamepad & Racing Wheel
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(() => {
                      const matchedPreset = detectWheelPresetFromGamepadId(detectedGamepad);
                      if (!matchedPreset || matchedPreset === settings.wheelPreset) return null;
                      return (
                        <button
                          type="button"
                          onClick={() => patch(applyWheelPreset(matchedPreset))}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40 text-amber-200 transition"
                        >
                          Apply {WHEEL_CALIBRATION_PRESETS[matchedPreset].shortLabel}
                        </button>
                      );
                    })()}
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${
                        detectedGamepad
                          ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
                          : 'bg-white/5 border-white/10 text-white/50'
                      }`}
                    >
                      {detectedGamepad ? `Connected: ${detectedGamepad.slice(0, 42)}` : 'No controller detected'}
                    </span>
                  </div>
                </div>

                {/* Named Wheel Calibration Presets */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-white/60">
                      Wheel & Controller Calibration Preset
                    </span>
                    <span className="text-[10px] font-mono uppercase text-amber-300/80">
                      {WHEEL_CALIBRATION_PRESETS[settings.wheelPreset]?.pedalMode ?? 'triggers'} mode
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                    {WHEEL_PRESET_ORDER.map((presetId) => {
                      const preset = WHEEL_CALIBRATION_PRESETS[presetId];
                      const active = settings.wheelPreset === presetId;
                      return (
                        <button
                          key={presetId}
                          type="button"
                          onClick={() => patch(applyWheelPreset(presetId))}
                          className={`px-2 py-2 rounded-lg text-[11px] font-bold border transition text-center ${
                            active
                              ? 'bg-amber-400 text-black border-amber-300 shadow'
                              : 'bg-white/5 text-white/75 border-white/10 hover:bg-white/10'
                          }`}
                        >
                          {preset.shortLabel}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-[11px] text-white/45">
                    {WHEEL_CALIBRATION_PRESETS[settings.wheelPreset]?.description}
                  </div>
                </div>

                {/* Steering Lock Curve */}
                <div>
                  <div className="text-[11px] font-bold text-white/60 mb-1.5">Steering Lock Curve</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {(
                      [
                        { id: 'standard', label: 'Standard' },
                        { id: 'linear', label: 'Linear 1:1' },
                        { id: 'progressive', label: 'Progressive' },
                        { id: 's-curve', label: 'S-Curve' },
                      ] as Array<{ id: SteeringLockCurve; label: string }>
                    ).map((curve) => (
                      <button
                        key={curve.id}
                        type="button"
                        onClick={() => patch({ steeringLockCurve: curve.id })}
                        className={`px-2 py-2 rounded-lg text-[11px] font-bold uppercase border transition ${
                          settings.steeringLockCurve === curve.id
                            ? 'bg-amber-400 text-black border-amber-300'
                            : 'bg-white/5 text-white/75 border-white/10 hover:bg-white/10'
                        }`}
                      >
                        {curve.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <ToggleRow
                    label="Enable Gamepad / Wheel"
                    description="Allow controller & steering wheel input"
                    checked={settings.controllerEnabled}
                    onChange={(v) => patch({ controllerEnabled: v })}
                  />
                  <ToggleRow
                    label="Split Pedal Axes"
                    description="Separate gas & brake wheel axes"
                    checked={settings.splitPedalAxes}
                    onChange={(v) =>
                      patch({
                        splitPedalAxes: v,
                        combinedPedalAxis: v ? false : settings.combinedPedalAxis,
                      })
                    }
                  />
                  <ToggleRow
                    label="Combined Pedal Axis"
                    description="Single shared gas (-1) / brake (+1) axis"
                    checked={settings.combinedPedalAxis}
                    onChange={(v) =>
                      patch({
                        combinedPedalAxis: v,
                        splitPedalAxes: v ? false : settings.splitPedalAxes,
                      })
                    }
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <ToggleRow
                    label="Invert Steering Axis"
                    description="Flip left/right wheel polarity"
                    checked={settings.invertSteerAxis}
                    onChange={(v) => patch({ invertSteerAxis: v })}
                  />
                  <ToggleRow
                    label="Invert Throttle Axis"
                    description="Flip pedal rest/pressed direction"
                    checked={settings.invertThrottleAxis}
                    onChange={(v) => patch({ invertThrottleAxis: v })}
                  />
                  <ToggleRow
                    label="Invert Brake Axis"
                    description="Flip brake pedal polarity"
                    checked={settings.invertBrakeAxis}
                    onChange={(v) => patch({ invertBrakeAxis: v })}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <SliderRow
                    label="Steering Deadzone"
                    valueLabel={`${Math.round(settings.steerDeadzone * 100)}%`}
                    min={0.02}
                    max={0.25}
                    step={0.01}
                    value={settings.steerDeadzone}
                    onChange={(v) => patch({ steerDeadzone: v })}
                  />
                  <SliderRow
                    label="Steering Linearity"
                    valueLabel={settings.steerLinearity.toFixed(2)}
                    min={1.0}
                    max={2.2}
                    step={0.05}
                    value={settings.steerLinearity}
                    onChange={(v) => patch({ steerLinearity: v })}
                    sublabel="Higher = smoother precision around center"
                  />
                  <SliderRow
                    label="Steering Sensitivity"
                    valueLabel={`${Math.round(settings.steerSensitivity * 100)}%`}
                    min={0.5}
                    max={1.8}
                    step={0.05}
                    value={settings.steerSensitivity}
                    onChange={(v) => patch({ steerSensitivity: v })}
                  />
                  <SliderRow
                    label="Wheel Rotation Lock"
                    valueLabel={`${settings.wheelLockDegrees}°`}
                    min={180}
                    max={900}
                    step={30}
                    value={settings.wheelLockDegrees}
                    onChange={(v) => patch({ wheelLockDegrees: v })}
                  />
                  <SliderRow
                    label="Haptic Rumble Intensity"
                    valueLabel={`${Math.round(settings.rumbleIntensity * 100)}%`}
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.rumbleIntensity}
                    onChange={(v) => patch({ rumbleIntensity: v })}
                  />

                  {/* Live Axis Tester */}
                  <div className="rounded-xl bg-black/40 border border-white/10 p-3 space-y-2">
                    <div className="text-[10px] font-black uppercase tracking-wider text-white/55">
                      Live Controller Axis Tester
                    </div>
                    <div className="space-y-1.5 text-[11px] font-mono">
                      <div>
                        <div className="flex justify-between text-white/70">
                          <span>STEER</span>
                          <span>{Math.round(liveAxes.steer * 100)}%</span>
                        </div>
                        <div className="relative h-2 bg-white/10 rounded overflow-hidden">
                          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/30" />
                          <div
                            className="absolute top-0 bottom-0 bg-amber-400"
                            style={{
                              left: liveAxes.steer >= 0 ? '50%' : `${50 + liveAxes.steer * 50}%`,
                              width: `${Math.abs(liveAxes.steer) * 50}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="flex justify-between text-emerald-300">
                            <span>THR</span>
                            <span>{Math.round(liveAxes.throttle * 100)}%</span>
                          </div>
                          <div className="h-2 bg-white/10 rounded overflow-hidden">
                            <div
                              className="h-full bg-emerald-400"
                              style={{ width: `${liveAxes.throttle * 100}%` }}
                            />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-rose-300">
                            <span>BRK</span>
                            <span>{Math.round(liveAxes.brake * 100)}%</span>
                          </div>
                          <div className="h-2 bg-white/10 rounded overflow-hidden">
                            <div
                              className="h-full bg-rose-500"
                              style={{ width: `${liveAxes.brake * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Touch / Mobile Controls */}
              <section className="rounded-xl bg-white/[0.03] border border-white/10 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-300">
                    <Hand className="w-4 h-4" />
                    Touch & Mobile Tilt Controls
                  </div>
                  <span className="text-[11px] text-white/45">
                    {isTouchDevice ? 'Touchscreen detected' : 'Desktop browser'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] font-bold text-white/60 mb-1.5">Touch Overlay</div>
                    <div className="grid grid-cols-3 gap-1">
                      {(['auto', 'always', 'off'] as TouchControlsMode[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => patch({ touchControlsMode: m })}
                          className={`px-2 py-2 rounded-lg text-[11px] font-bold uppercase border transition ${
                            settings.touchControlsMode === m
                              ? 'bg-amber-400 text-black border-amber-300'
                              : 'bg-white/5 text-white/75 border-white/10 hover:bg-white/10'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white/60 mb-1.5">Steering Style</div>
                    <div className="grid grid-cols-3 gap-1">
                      {(['pad', 'buttons', 'gyro'] as TouchSteerStyle[]).map((style) => (
                        <button
                          key={style}
                          type="button"
                          onClick={() => patch({ touchSteerStyle: style })}
                          className={`px-2 py-2 rounded-lg text-[11px] font-bold uppercase border transition ${
                            settings.touchSteerStyle === style
                              ? 'bg-amber-400 text-black border-amber-300'
                              : 'bg-white/5 text-white/75 border-white/10 hover:bg-white/10'
                          }`}
                        >
                          {style === 'gyro' ? 'Tilt Gyro' : style}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  <SliderRow
                    label="Touch Control Opacity"
                    valueLabel={`${Math.round(settings.touchOpacity * 100)}%`}
                    min={0.35}
                    max={1}
                    step={0.05}
                    value={settings.touchOpacity}
                    onChange={(v) => patch({ touchOpacity: v })}
                  />
                  <ToggleRow
                    label="Auto-Accelerate (Touch)"
                    description="Hold throttle automatically unless braking"
                    checked={settings.touchAutoAccel}
                    onChange={(v) => patch({ touchAutoAccel: v })}
                  />
                </div>
              </section>

              {/* Keyboard Remapper */}
              <section className="rounded-xl bg-white/[0.03] border border-white/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-300">
                    <Keyboard className="w-4 h-4" />
                    Keyboard Keybinds
                  </div>
                  <button
                    type="button"
                    onClick={() => patch({ keybinds: { ...DEFAULT_KEYBINDS } })}
                    className="flex items-center gap-1 text-[11px] font-bold text-white/65 hover:text-amber-300 transition"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset Keys
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {keybindOrder.map((action) => {
                    const isListening = listeningAction === action;
                    return (
                      <div
                        key={action}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-black/30 border border-white/10"
                      >
                        <span className="text-xs text-white/85">{KEYBIND_LABELS[action]}</span>
                        <button
                          type="button"
                          onClick={() => setListeningAction(isListening ? null : action)}
                          className={`min-w-[82px] px-2.5 py-1 rounded-md text-xs font-mono font-bold border transition ${
                            isListening
                              ? 'bg-amber-400 text-black border-amber-300 animate-pulse'
                              : 'bg-white/10 text-white border-white/15 hover:bg-white/15'
                          }`}
                        >
                          {isListening ? 'PRESS KEY…' : formatKeyCode(settings.keybinds[action])}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {/* 2. GRAPHICS & PERFORMANCE */}
          {activeTab === 'graphics' && (
            <div className="space-y-5">
              <section className="rounded-xl bg-white/[0.03] border border-white/10 p-4 space-y-4">
                <div className="text-xs font-black uppercase tracking-wider text-amber-300">
                  Quality Presets
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {(['low', 'medium', 'high', 'ultra'] as GraphicsPreset[]).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => patch(applyGraphicsPreset(preset))}
                      className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border transition ${
                        settings.graphicsPreset === preset
                          ? 'bg-amber-400 text-black border-amber-300 shadow'
                          : 'bg-white/5 text-white/75 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <div className="text-[11px] font-bold text-white/60 mb-1.5">Shadow Map Quality</div>
                    <div className="grid grid-cols-4 gap-1">
                      {(['off', 'low', 'medium', 'high'] as ShadowQuality[]).map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => patch({ shadowQuality: q })}
                          className={`py-2 rounded-lg text-[11px] font-bold uppercase border transition ${
                            settings.shadowQuality === q
                              ? 'bg-amber-400 text-black border-amber-300'
                              : 'bg-white/5 text-white/75 border-white/10 hover:bg-white/10'
                          }`}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white/60 mb-1.5">Particle VFX Density</div>
                    <div className="grid grid-cols-4 gap-1">
                      {(['off', 'low', 'medium', 'high'] as ParticleDensitySetting[]).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => patch({ particleDensity: d })}
                          className={`py-2 rounded-lg text-[11px] font-bold uppercase border transition ${
                            settings.particleDensity === d
                              ? 'bg-amber-400 text-black border-amber-300'
                              : 'bg-white/5 text-white/75 border-white/10 hover:bg-white/10'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <SliderRow
                  label="Render Resolution Scale"
                  valueLabel={`${Math.round(settings.renderScale * 100)}%`}
                  min={0.5}
                  max={2.0}
                  step={0.05}
                  value={settings.renderScale}
                  onChange={(v) => patch({ renderScale: v })}
                  sublabel="Capped automatically on low-power GPUs when Adaptive DPR is enabled"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ToggleRow
                    label="Adaptive Resolution (60 FPS Target)"
                    description="Dynamically scales pixel ratio during heavy grid starts"
                    checked={settings.adaptiveDpr}
                    onChange={(v) => patch({ adaptiveDpr: v })}
                  />
                  <ToggleRow
                    label="HDR Bloom (Brake Lights & Sparks)"
                    description="Selective glow on emissive rotors, headlights & exhaust"
                    checked={settings.bloomEnabled}
                    onChange={(v) => patch({ bloomEnabled: v })}
                  />
                  <ToggleRow
                    label="Miniature Tilt-Shift Depth of Field"
                    description="Subtle diorama lens blur in Chase & Broadcast cameras"
                    checked={settings.tiltShiftEnabled}
                    onChange={(v) => patch({ tiltShiftEnabled: v })}
                  />
                  <ToggleRow
                    label="High-Speed Peripheral Blur"
                    description="Subtle radial speed vignette above 220 km/h"
                    checked={settings.speedBlurEnabled}
                    onChange={(v) => patch({ speedBlurEnabled: v })}
                  />
                  <ToggleRow
                    label="Show FPS & Frame-Time Counter"
                    description="Display live performance chip in HUD top-right"
                    checked={settings.showFpsCounter}
                    onChange={(v) => patch({ showFpsCounter: v })}
                  />
                  <ToggleRow
                    label="Web Worker Physics Simulation"
                    description="Run car physics & neural AI inference on a background thread (off by default)"
                    checked={settings.workerSimulation}
                    onChange={(v) => patch({ workerSimulation: v })}
                  />
                </div>
              </section>
            </div>
          )}

          {/* 3. AUDIO (7-CHANNEL MIXER + RACE ENGINEER) */}
          {activeTab === 'audio' && (
            <div className="space-y-5">
              <section className="rounded-xl bg-white/[0.03] border border-white/10 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-black uppercase tracking-wider text-amber-300">
                    7-Channel Sound Mixer
                  </div>
                  <button
                    type="button"
                    onClick={toggleMute}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                      muted
                        ? 'bg-rose-500/20 border-rose-400/40 text-rose-300'
                        : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
                    }`}
                  >
                    {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    {muted ? 'Audio Muted' : 'Mute All'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <SliderRow
                    label="Master Output"
                    valueLabel={`${Math.round(settings.masterVolume * 100)}%`}
                    min={0}
                    max={1}
                    step={0.02}
                    value={settings.masterVolume}
                    onChange={(v) => patch({ masterVolume: v })}
                  />
                  <SliderRow
                    label="Player Engine & Exhaust"
                    valueLabel={`${Math.round(settings.engineVolume * 100)}%`}
                    min={0}
                    max={1}
                    step={0.02}
                    value={settings.engineVolume}
                    onChange={(v) => patch({ engineVolume: v })}
                  />
                  <SliderRow
                    label="Spatial Opponent Engines"
                    valueLabel={`${Math.round(settings.opponentVolume * 100)}%`}
                    min={0}
                    max={1}
                    step={0.02}
                    value={settings.opponentVolume}
                    onChange={(v) => patch({ opponentVolume: v })}
                  />
                  <SliderRow
                    label="Tires, Kerbs & Surface Foley"
                    valueLabel={`${Math.round(settings.tireSurfaceVolume * 100)}%`}
                    min={0}
                    max={1}
                    step={0.02}
                    value={settings.tireSurfaceVolume}
                    onChange={(v) => patch({ tireSurfaceVolume: v })}
                  />
                  <SliderRow
                    label="Impacts & Wind Rush"
                    valueLabel={`${Math.round(settings.collisionVolume * 100)}%`}
                    min={0}
                    max={1}
                    step={0.02}
                    value={settings.collisionVolume}
                    onChange={(v) => patch({ collisionVolume: v })}
                  />
                  <SliderRow
                    label="UI, Shift Beeps & Radio"
                    valueLabel={`${Math.round(settings.uiRadioVolume * 100)}%`}
                    min={0}
                    max={1}
                    step={0.02}
                    value={settings.uiRadioVolume}
                    onChange={(v) => patch({ uiRadioVolume: v })}
                  />
                  <SliderRow
                    label="Menu Ambient Music"
                    valueLabel={`${Math.round(settings.musicVolume * 100)}%`}
                    min={0}
                    max={1}
                    step={0.02}
                    value={settings.musicVolume}
                    onChange={(v) => patch({ musicVolume: v })}
                  />
                </div>
              </section>

              <section className="rounded-xl bg-white/[0.03] border border-white/10 p-4 space-y-4">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-300">
                  <Radio className="w-4 h-4" />
                  Pit Wall Race Engineer Radio
                </div>
                <div>
                  <div className="text-[11px] font-bold text-white/60 mb-1.5">Radio Chatter Level</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['off', 'minimal', 'full'] as EngineerVerbosity[]).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => patch({ engineerVerbosity: lvl })}
                        className={`py-2 rounded-lg text-xs font-bold uppercase border transition ${
                          settings.engineerVerbosity === lvl
                            ? 'bg-amber-400 text-black border-amber-300'
                            : 'bg-white/5 text-white/75 border-white/10 hover:bg-white/10'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>
                <ToggleRow
                  label="Spoken Engineer Voice (Web Speech)"
                  description="Speak urgent pit-wall calls aloud in addition to radio subtitles"
                  checked={settings.radioVoiceEnabled}
                  onChange={(v) => patch({ radioVoiceEnabled: v })}
                />
              </section>
            </div>
          )}

          {/* 4. CAMERA */}
          {activeTab === 'camera' && (
            <div className="space-y-5">
              <section className="rounded-xl bg-white/[0.03] border border-white/10 p-4 space-y-4">
                <div className="text-xs font-black uppercase tracking-wider text-amber-300">
                  Camera Framing & Dynamics
                </div>
                <p className="text-xs text-white/55">
                  Cycle all 7 views in-race (Chase Near, Chase Far, T-Cam / Roll Hoop, Cockpit, Hood, Bumper,
                  TV Broadcast) with <span className="font-mono text-amber-300">{formatKeyCode(settings.keybinds.camera)}</span>,
                  hold <span className="font-mono text-amber-300">{formatKeyCode(settings.keybinds.lookBack)}</span> to Look Back.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <SliderRow
                    label="Field of View (FOV) Offset"
                    valueLabel={`${settings.fovOffset >= 0 ? '+' : ''}${settings.fovOffset}°`}
                    min={-10}
                    max={15}
                    step={1}
                    value={settings.fovOffset}
                    onChange={(v) => patch({ fovOffset: v })}
                  />
                  <SliderRow
                    label="Look-to-Apex Rotation"
                    valueLabel={`${Math.round(settings.lookToApex * 100)}%`}
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.lookToApex}
                    onChange={(v) => patch({ lookToApex: v })}
                    sublabel="Subtly pans cockpit & chase cameras toward corner apex"
                  />
                  <SliderRow
                    label="Speed & Kerb Camera Shake"
                    valueLabel={`${Math.round(settings.cameraShake * 100)}%`}
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.cameraShake}
                    onChange={(v) => patch({ cameraShake: v })}
                  />
                  <SliderRow
                    label="Chase Distance Offset"
                    valueLabel={`${settings.chaseDistanceOffset >= 0 ? '+' : ''}${settings.chaseDistanceOffset.toFixed(1)}m`}
                    min={-3}
                    max={4}
                    step={0.2}
                    value={settings.chaseDistanceOffset}
                    onChange={(v) => patch({ chaseDistanceOffset: v })}
                  />
                  <SliderRow
                    label="Chase Height Offset"
                    valueLabel={`${settings.chaseHeightOffset >= 0 ? '+' : ''}${settings.chaseHeightOffset.toFixed(2)}m`}
                    min={-0.5}
                    max={1.0}
                    step={0.05}
                    value={settings.chaseHeightOffset}
                    onChange={(v) => patch({ chaseHeightOffset: v })}
                  />
                </div>
              </section>
            </div>
          )}

          {/* 5. HUD & TELEMETRY */}
          {activeTab === 'hud' && (
            <div className="space-y-5">
              <section className="rounded-xl bg-white/[0.03] border border-white/10 p-4 space-y-4">
                <div className="text-xs font-black uppercase tracking-wider text-amber-300">
                  HUD Layout & Measurement Units
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-[11px] font-bold text-white/60 mb-1.5">HUD Density Preset</div>
                    <div className="grid grid-cols-4 gap-1">
                      {(['full', 'minimal', 'pro', 'off'] as HudPreset[]).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => patch({ hudPreset: p })}
                          className={`py-2 rounded-lg text-xs font-bold uppercase border transition ${
                            settings.hudPreset === p
                              ? 'bg-amber-400 text-black border-amber-300'
                              : 'bg-white/5 text-white/75 border-white/10 hover:bg-white/10'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white/60 mb-1.5">Units System</div>
                    <div className="grid grid-cols-2 gap-1">
                      {(['metric', 'imperial'] as UnitsSystem[]).map((u) => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => patch({ units: u })}
                          className={`py-2 rounded-lg text-xs font-bold uppercase border transition ${
                            settings.units === u
                              ? 'bg-amber-400 text-black border-amber-300'
                              : 'bg-white/5 text-white/75 border-white/10 hover:bg-white/10'
                          }`}
                        >
                          {u === 'metric' ? 'Metric (km/h · °C)' : 'Imperial (mph · °F)'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <SliderRow
                  label="HUD UI Scale"
                  valueLabel={`${Math.round(settings.hudScale * 100)}%`}
                  min={0.75}
                  max={1.25}
                  step={0.05}
                  value={settings.hudScale}
                  onChange={(v) => patch({ hudScale: v })}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ToggleRow
                    label="Virtual Rear-View & Blind-Spot Radar"
                    description="Gap to car behind plus left/right proximity arrows"
                    checked={settings.showVirtualMirror}
                    onChange={(v) => patch({ showVirtualMirror: v })}
                  />
                  <ToggleRow
                    label="Live Pedal Input Trace"
                    description="Scrolling 4-second throttle, brake & steering graph"
                    checked={settings.showPedalTrace}
                    onChange={(v) => patch({ showPedalTrace: v })}
                  />
                  <ToggleRow
                    label="Upcoming Corner Callout Badge"
                    description="Direction arrow, recommended gear & distance countdown"
                    checked={settings.showCornerCallouts}
                    onChange={(v) => patch({ showCornerCallouts: v })}
                  />
                  <ToggleRow
                    label="Floating Driver Nametags"
                    description="Show car labels above nearby rivals on track (toggle with N)"
                    checked={settings.showNametags}
                    onChange={(v) => patch({ showNametags: v })}
                  />
                </div>
              </section>
            </div>
          )}

          {/* 6. ACCESSIBILITY */}
          {activeTab === 'accessibility' && (
            <div className="space-y-5">
              <section className="rounded-xl bg-white/[0.03] border border-white/10 p-4 space-y-4">
                <div className="text-xs font-black uppercase tracking-wider text-amber-300">
                  Visual & Motion Accessibility
                </div>
                <div>
                  <div className="text-[11px] font-bold text-white/60 mb-1.5">
                    Colorblind Semantic Palette (Sectors, Tires, Brake Temps & Pedal Trace)
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(['none', 'deuteranopia', 'protanopia', 'tritanopia'] as ColorblindMode[]).map(
                      (mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => patch({ colorblindMode: mode })}
                          className={`py-2 px-2 rounded-lg text-xs font-bold capitalize border transition ${
                            settings.colorblindMode === mode
                              ? 'bg-amber-400 text-black border-amber-300'
                              : 'bg-white/5 text-white/75 border-white/10 hover:bg-white/10'
                          }`}
                        >
                          {mode === 'none' ? 'Standard' : mode}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                <SliderRow
                  label="Radio Subtitle Size"
                  valueLabel={`${Math.round(settings.subtitleScale * 100)}%`}
                  min={0.85}
                  max={1.4}
                  step={0.05}
                  value={settings.subtitleScale}
                  onChange={(v) => patch({ subtitleScale: v })}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ToggleRow
                    label="High-Contrast Solid HUD Panels"
                    description="Replaces translucent glass panels with solid dark backing"
                    checked={settings.highContrastHud}
                    onChange={(v) => patch({ highContrastHud: v })}
                  />
                  <ToggleRow
                    label="Reduced Motion Mode"
                    description="Minimizes camera shake, speed blur & screen flash effects"
                    checked={settings.reducedMotion}
                    onChange={(v) => patch({ reducedMotion: v })}
                  />
                </div>
              </section>

              <section className="rounded-xl bg-rose-500/10 border border-rose-500/25 p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-rose-300">
                    Reset All Preferences
                  </div>
                  <div className="text-[11px] text-white/60 mt-0.5">
                    Restores Controls, Graphics, Audio Mixer, Camera, HUD, and Accessibility defaults.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetAllSettings}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-xs font-bold text-rose-200 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset All Defaults
                </button>
              </section>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 bg-black/40">
          <span className="text-[11px] text-white/45">
            Press <span className="font-mono text-white/75">ESC</span> to return
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs uppercase tracking-wider transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
