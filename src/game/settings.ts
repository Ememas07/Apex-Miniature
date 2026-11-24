/**
 * Persistent client-side gameplay, graphics, audio, camera, HUD & accessibility settings (localStorage-backed).
 */

import {
  getWheelPresetConfig,
  SteeringLockCurve,
  WHEEL_CALIBRATION_PRESETS,
  WHEEL_PRESET_ORDER,
  WheelPresetId,
} from './gamepad';
import { EngineerVerbosity, TcLevel } from './types';

export type { SteeringLockCurve, WheelPresetId };
export { WHEEL_CALIBRATION_PRESETS, WHEEL_PRESET_ORDER };

export type TouchControlsMode = 'auto' | 'always' | 'off';
export type TouchSteerStyle = 'pad' | 'buttons' | 'gyro';
export type TransmissionMode = 'auto' | 'semi-auto' | 'manual';
export type GraphicsPreset = 'low' | 'medium' | 'high' | 'ultra';
export type ShadowQuality = 'off' | 'low' | 'medium' | 'high';
export type ParticleDensitySetting = 'off' | 'low' | 'medium' | 'high';
export type RacingLineMode = 'off' | 'corners-only' | 'full';
export type HudPreset = 'full' | 'minimal' | 'pro' | 'off';
export type ColorblindMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
export type UnitsSystem = 'metric' | 'imperial';

export type KeybindAction =
  | 'throttle'
  | 'brake'
  | 'steerLeft'
  | 'steerRight'
  | 'shiftUp'
  | 'shiftDown'
  | 'special'
  | 'ersMode'
  | 'camera'
  | 'resetCamera'
  | 'lookBack'
  | 'lookLeft'
  | 'lookRight'
  | 'brakeBiasDown'
  | 'brakeBiasUp'
  | 'tcToggle'
  | 'mfdCycle'
  | 'flashback'
  | 'photoMode'
  | 'pause'
  | 'mute';

export type KeybindConfig = Record<KeybindAction, string>;
export type KeybindMap = KeybindConfig;

export const DEFAULT_KEYBINDS: KeybindConfig = {
  throttle: 'KeyW',
  brake: 'KeyS',
  steerLeft: 'KeyA',
  steerRight: 'KeyD',
  shiftUp: 'KeyE',
  shiftDown: 'KeyQ',
  special: 'Space',
  ersMode: 'KeyB',
  camera: 'KeyC',
  resetCamera: 'KeyR',
  lookBack: 'KeyV',
  lookLeft: 'KeyZ',
  lookRight: 'KeyX',
  brakeBiasDown: 'BracketLeft',
  brakeBiasUp: 'BracketRight',
  tcToggle: 'KeyT',
  mfdCycle: 'Tab',
  flashback: 'KeyF',
  photoMode: 'F9',
  pause: 'KeyP',
  mute: 'KeyM',
};

export const KEYBIND_LABELS: Record<KeybindAction, string> = {
  throttle: 'Throttle / Gas',
  brake: 'Brake / Reverse',
  steerLeft: 'Steer Left',
  steerRight: 'Steer Right',
  shiftUp: 'Shift Up (Manual / Semi)',
  shiftDown: 'Shift Down (Manual / Semi)',
  special: 'Special (DRS / Aero / Attack / Boost)',
  ersMode: 'Cycle ERS Mode (Hybrids)',
  camera: 'Cycle Camera',
  resetCamera: 'Reset Camera',
  lookBack: 'Look Back (Hold)',
  lookLeft: 'Glance Left (Hold)',
  lookRight: 'Glance Right (Hold)',
  brakeBiasDown: 'Brake Bias Rear (-)',
  brakeBiasUp: 'Brake Bias Front (+)',
  tcToggle: 'Cycle Traction Control',
  mfdCycle: 'Cycle MFD Telemetry Page',
  flashback: 'Instant Flashback (-5.5s)',
  photoMode: 'Toggle Photo Mode',
  pause: 'Pause Menu',
  mute: 'Mute Audio',
};

export function formatKeyCode(code: string): string {
  if (!code) return '---';
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  const map: Record<string, string> = {
    Space: 'SPACE',
    ShiftLeft: 'L-SHIFT',
    ShiftRight: 'R-SHIFT',
    ControlLeft: 'L-CTRL',
    ControlRight: 'R-CTRL',
    AltLeft: 'L-ALT',
    AltRight: 'R-ALT',
    ArrowUp: 'UP',
    ArrowDown: 'DOWN',
    ArrowLeft: 'LEFT',
    ArrowRight: 'RIGHT',
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    Minus: '-',
    Equal: '=',
    Tab: 'TAB',
    Enter: 'ENTER',
    Backspace: 'BKSP',
  };
  return map[code] ?? code.replace(/^Numpad/, 'NUM ');
}

/** Alias used by HUD / ControlsBriefingCard */
export const formatKeyLabel = formatKeyCode;

export interface GameSettings {
  // 1. Controls & Driving Aids
  controllerEnabled: boolean;
  touchControlsMode: TouchControlsMode;
  touchSteerStyle: TouchSteerStyle;
  touchOpacity: number; // 0.35..1.0
  touchAutoAccel: boolean;
  transmissionMode: TransmissionMode;
  tcDefault: 'auto' | TcLevel;
  stabilityControl: boolean;
  autoRecovery: boolean;
  racingLineMode: RacingLineMode;
  steerDeadzone: number; // 0.02..0.25
  steerLinearity: number; // 1.0..2.2
  steerSensitivity: number; // 0.5..1.8
  wheelLockDegrees: number; // 180..900
  wheelPreset: WheelPresetId;
  steeringLockCurve: SteeringLockCurve;
  rumbleIntensity: number; // 0..1
  splitPedalAxes: boolean;
  combinedPedalAxis: boolean;
  invertSteerAxis: boolean;
  invertThrottleAxis: boolean;
  invertBrakeAxis: boolean;
  showControlsBriefing: boolean;
  keybinds: KeybindConfig;

  // 2. Graphics & Performance
  graphicsPreset: GraphicsPreset;
  renderScale: number; // 0.5..2.0
  adaptiveDpr: boolean;
  shadowQuality: ShadowQuality;
  particleDensity: ParticleDensitySetting;
  bloomEnabled: boolean;
  tiltShiftEnabled: boolean;
  speedBlurEnabled: boolean;
  showFpsCounter: boolean;
  workerSimulation: boolean;

  // 3. Audio Mixer (7 channels, 0..1)
  masterVolume: number;
  engineVolume: number;
  opponentVolume: number;
  tireSurfaceVolume: number;
  collisionVolume: number;
  uiRadioVolume: number;
  musicVolume: number;
  engineerVerbosity: EngineerVerbosity;
  radioVoiceEnabled: boolean;

  // 4. Camera
  fovOffset: number; // -10..+15 degrees
  lookToApex: number; // 0..1
  cameraShake: number; // 0..1
  chaseHeightOffset: number; // -0.5..+1.0
  chaseDistanceOffset: number; // -3..+4

  // 5. HUD & Telemetry
  hudPreset: HudPreset;
  hudScale: number; // 0.75..1.25
  showVirtualMirror: boolean;
  showPedalTrace: boolean;
  showCornerCallouts: boolean;
  showNametags: boolean;
  minimapRotate: boolean;
  units: UnitsSystem;

  // 6. Accessibility
  colorblindMode: ColorblindMode;
  highContrastHud: boolean;
  reducedMotion: boolean;
  subtitleScale: number; // 0.85..1.4
}

const STORAGE_KEY = 'apex_game_settings_v2';
const LEGACY_STORAGE_KEY = 'apex_game_settings_v1';

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  controllerEnabled: true,
  touchControlsMode: 'auto',
  touchSteerStyle: 'pad',
  touchOpacity: 0.75,
  touchAutoAccel: false,
  transmissionMode: 'auto',
  tcDefault: 'auto',
  stabilityControl: true,
  autoRecovery: true,
  racingLineMode: 'corners-only',
  steerDeadzone: 0.08,
  steerLinearity: 1.35,
  steerSensitivity: 1.0,
  wheelLockDegrees: 360,
  wheelPreset: 'default',
  steeringLockCurve: 'standard',
  rumbleIntensity: 0.75,
  splitPedalAxes: false,
  combinedPedalAxis: false,
  invertSteerAxis: false,
  invertThrottleAxis: false,
  invertBrakeAxis: false,
  showControlsBriefing: true,
  keybinds: { ...DEFAULT_KEYBINDS },

  graphicsPreset: 'high',
  renderScale: 1.0,
  adaptiveDpr: true,
  shadowQuality: 'medium',
  particleDensity: 'high',
  bloomEnabled: true,
  tiltShiftEnabled: false,
  speedBlurEnabled: true,
  showFpsCounter: false,
  workerSimulation: false,

  masterVolume: 0.85,
  engineVolume: 0.9,
  opponentVolume: 0.7,
  tireSurfaceVolume: 0.8,
  collisionVolume: 0.85,
  uiRadioVolume: 0.85,
  musicVolume: 0.35,
  engineerVerbosity: 'full',
  radioVoiceEnabled: false,

  fovOffset: 0,
  lookToApex: 0.45,
  cameraShake: 0.7,
  chaseHeightOffset: 0,
  chaseDistanceOffset: 0,

  hudPreset: 'full',
  hudScale: 1.0,
  showVirtualMirror: true,
  showPedalTrace: true,
  showCornerCallouts: true,
  showNametags: true,
  minimapRotate: false,
  units: 'metric',

  colorblindMode: 'none',
  highContrastHud: false,
  reducedMotion: false,
  subtitleScale: 1.0,
};

export function applyWheelPreset(preset: WheelPresetId): Partial<GameSettings> {
  const entry = getWheelPresetConfig(preset);
  return {
    wheelPreset: entry.id,
    steerDeadzone: entry.config.steerDeadzone,
    steerLinearity: entry.config.steerLinearity,
    steerSensitivity: entry.config.steerSensitivity,
    wheelLockDegrees: entry.config.wheelLockDegrees,
    steeringLockCurve: entry.config.steeringLockCurve,
    rumbleIntensity: entry.config.rumbleIntensity,
    splitPedalAxes: entry.config.splitPedalAxes,
    combinedPedalAxis: entry.config.combinedPedalAxis,
    invertSteerAxis: entry.config.invertSteerAxis,
    invertThrottleAxis: entry.config.invertThrottleAxis,
    invertBrakeAxis: entry.config.invertBrakeAxis,
  };
}

export function applyGraphicsPreset(preset: GraphicsPreset): Partial<GameSettings> {
  switch (preset) {
    case 'low':
      return {
        graphicsPreset: 'low',
        renderScale: 0.75,
        shadowQuality: 'off',
        particleDensity: 'low',
        bloomEnabled: false,
        tiltShiftEnabled: false,
        speedBlurEnabled: false,
        adaptiveDpr: true,
      };
    case 'medium':
      return {
        graphicsPreset: 'medium',
        renderScale: 1.0,
        shadowQuality: 'low',
        particleDensity: 'medium',
        bloomEnabled: false,
        tiltShiftEnabled: false,
        speedBlurEnabled: true,
        adaptiveDpr: true,
      };
    case 'ultra':
      return {
        graphicsPreset: 'ultra',
        renderScale: 1.5,
        shadowQuality: 'high',
        particleDensity: 'high',
        bloomEnabled: true,
        tiltShiftEnabled: true,
        speedBlurEnabled: true,
        adaptiveDpr: false,
      };
    case 'high':
    default:
      return {
        graphicsPreset: 'high',
        renderScale: 1.0,
        shadowQuality: 'medium',
        particleDensity: 'high',
        bloomEnabled: true,
        tiltShiftEnabled: false,
        speedBlurEnabled: true,
        adaptiveDpr: true,
      };
  }
}

export function formatSpeed(kmh: number, units: UnitsSystem = activeSettings.units): { value: number; unit: string } {
  const safe = Number.isFinite(kmh) ? kmh : 0;
  if (units === 'imperial') {
    return { value: Math.round(safe * 0.621371), unit: 'MPH' };
  }
  return { value: Math.round(safe), unit: 'KM/H' };
}

export function formatTemp(celsius: number, units: UnitsSystem = activeSettings.units): string {
  const safe = Number.isFinite(celsius) ? celsius : 0;
  if (units === 'imperial') {
    return `${Math.round(safe * 1.8 + 32)}°F`;
  }
  return `${Math.round(safe)}°C`;
}

export interface SemanticPalette {
  good: string;
  warn: string;
  danger: string;
  purple: string;
  throttle: string;
  brake: string;
}

export function getSemanticPalette(mode: ColorblindMode = activeSettings.colorblindMode): SemanticPalette {
  switch (mode) {
    case 'protanopia':
    case 'deuteranopia':
      return {
        good: '#38bdf8',
        warn: '#facc15',
        danger: '#f97316',
        purple: '#c084fc',
        throttle: '#38bdf8',
        brake: '#f97316',
      };
    case 'tritanopia':
      return {
        good: '#2dd4bf',
        warn: '#fda4af',
        danger: '#ef4444',
        purple: '#f472b6',
        throttle: '#2dd4bf',
        brake: '#ef4444',
      };
    case 'none':
    default:
      return {
        good: '#22c55e',
        warn: '#f59e0b',
        danger: '#ef4444',
        purple: '#a855f7',
        throttle: '#22c55e',
        brake: '#ef4444',
      };
  }
}

type SettingsListener = (settings: GameSettings) => void;
const listeners = new Set<SettingsListener>();

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function isOneOf<T extends string>(v: unknown, list: readonly T[]): v is T {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
}

function sanitizeKeybinds(raw: unknown): KeybindConfig {
  const out: KeybindConfig = { ...DEFAULT_KEYBINDS };
  if (!raw || typeof raw !== 'object') return out;
  const obj = raw as Record<string, unknown>;
  (Object.keys(DEFAULT_KEYBINDS) as KeybindAction[]).forEach((action) => {
    const val = obj[action];
    if (typeof val === 'string' && val.trim().length > 0 && val.length <= 32) {
      out[action] = val.trim();
    }
  });
  return out;
}

function sanitizeSettings(raw: unknown): GameSettings {
  const d = DEFAULT_GAME_SETTINGS;
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const tcRaw = p.tcDefault;
  const tcDefault: 'auto' | TcLevel =
    tcRaw === 'auto' || tcRaw === 0 || tcRaw === 1 || tcRaw === 2 || tcRaw === 3 ? tcRaw : d.tcDefault;

  return {
    controllerEnabled: typeof p.controllerEnabled === 'boolean' ? p.controllerEnabled : d.controllerEnabled,
    touchControlsMode: isOneOf(p.touchControlsMode, ['auto', 'always', 'off'] as const) ? p.touchControlsMode : d.touchControlsMode,
    touchSteerStyle: isOneOf(p.touchSteerStyle, ['pad', 'buttons', 'gyro'] as const) ? p.touchSteerStyle : d.touchSteerStyle,
    touchOpacity: clampNum(p.touchOpacity, 0.35, 1.0, d.touchOpacity),
    touchAutoAccel: typeof p.touchAutoAccel === 'boolean' ? p.touchAutoAccel : d.touchAutoAccel,
    transmissionMode: isOneOf(p.transmissionMode, ['auto', 'semi-auto', 'manual'] as const) ? p.transmissionMode : d.transmissionMode,
    tcDefault,
    stabilityControl: typeof p.stabilityControl === 'boolean' ? p.stabilityControl : d.stabilityControl,
    autoRecovery: typeof p.autoRecovery === 'boolean' ? p.autoRecovery : d.autoRecovery,
    racingLineMode: isOneOf(p.racingLineMode, ['off', 'corners-only', 'full'] as const) ? p.racingLineMode : d.racingLineMode,
    steerDeadzone: clampNum(p.steerDeadzone, 0.02, 0.25, d.steerDeadzone),
    steerLinearity: clampNum(p.steerLinearity, 1.0, 2.2, d.steerLinearity),
    steerSensitivity: clampNum(p.steerSensitivity, 0.5, 1.8, d.steerSensitivity),
    wheelLockDegrees: clampNum(p.wheelLockDegrees, 180, 900, d.wheelLockDegrees),
    wheelPreset: isOneOf(p.wheelPreset, WHEEL_PRESET_ORDER) ? p.wheelPreset : d.wheelPreset,
    steeringLockCurve: isOneOf(p.steeringLockCurve, ['standard', 'linear', 'progressive', 's-curve'] as const)
      ? p.steeringLockCurve
      : d.steeringLockCurve,
    rumbleIntensity: clampNum(p.rumbleIntensity, 0, 1, d.rumbleIntensity),
    splitPedalAxes: typeof p.splitPedalAxes === 'boolean' ? p.splitPedalAxes : d.splitPedalAxes,
    combinedPedalAxis:
      typeof p.combinedPedalAxis === 'boolean'
        ? p.splitPedalAxes === true
          ? false
          : p.combinedPedalAxis
        : d.combinedPedalAxis,
    invertSteerAxis: typeof p.invertSteerAxis === 'boolean' ? p.invertSteerAxis : d.invertSteerAxis,
    invertThrottleAxis: typeof p.invertThrottleAxis === 'boolean' ? p.invertThrottleAxis : d.invertThrottleAxis,
    invertBrakeAxis: typeof p.invertBrakeAxis === 'boolean' ? p.invertBrakeAxis : d.invertBrakeAxis,
    showControlsBriefing: typeof p.showControlsBriefing === 'boolean' ? p.showControlsBriefing : d.showControlsBriefing,
    keybinds: sanitizeKeybinds(p.keybinds),

    graphicsPreset: isOneOf(p.graphicsPreset, ['low', 'medium', 'high', 'ultra'] as const) ? p.graphicsPreset : d.graphicsPreset,
    renderScale: clampNum(p.renderScale, 0.5, 2.0, d.renderScale),
    adaptiveDpr: typeof p.adaptiveDpr === 'boolean' ? p.adaptiveDpr : d.adaptiveDpr,
    shadowQuality: isOneOf(p.shadowQuality, ['off', 'low', 'medium', 'high'] as const) ? p.shadowQuality : d.shadowQuality,
    particleDensity: isOneOf(p.particleDensity, ['off', 'low', 'medium', 'high'] as const) ? p.particleDensity : d.particleDensity,
    bloomEnabled: typeof p.bloomEnabled === 'boolean' ? p.bloomEnabled : d.bloomEnabled,
    tiltShiftEnabled: typeof p.tiltShiftEnabled === 'boolean' ? p.tiltShiftEnabled : d.tiltShiftEnabled,
    speedBlurEnabled: typeof p.speedBlurEnabled === 'boolean' ? p.speedBlurEnabled : d.speedBlurEnabled,
    showFpsCounter: typeof p.showFpsCounter === 'boolean' ? p.showFpsCounter : d.showFpsCounter,
    workerSimulation: typeof p.workerSimulation === 'boolean' ? p.workerSimulation : d.workerSimulation,

    masterVolume: clampNum(p.masterVolume, 0, 1, d.masterVolume),
    engineVolume: clampNum(p.engineVolume, 0, 1, d.engineVolume),
    opponentVolume: clampNum(p.opponentVolume, 0, 1, d.opponentVolume),
    tireSurfaceVolume: clampNum(p.tireSurfaceVolume, 0, 1, d.tireSurfaceVolume),
    collisionVolume: clampNum(p.collisionVolume, 0, 1, d.collisionVolume),
    uiRadioVolume: clampNum(p.uiRadioVolume, 0, 1, d.uiRadioVolume),
    musicVolume: clampNum(p.musicVolume, 0, 1, d.musicVolume),
    engineerVerbosity: isOneOf(p.engineerVerbosity, ['off', 'minimal', 'full'] as const) ? p.engineerVerbosity : d.engineerVerbosity,
    radioVoiceEnabled: typeof p.radioVoiceEnabled === 'boolean' ? p.radioVoiceEnabled : d.radioVoiceEnabled,

    fovOffset: clampNum(p.fovOffset, -10, 15, d.fovOffset),
    lookToApex: clampNum(p.lookToApex, 0, 1, d.lookToApex),
    cameraShake: clampNum(p.cameraShake, 0, 1, d.cameraShake),
    chaseHeightOffset: clampNum(p.chaseHeightOffset, -0.5, 1.0, d.chaseHeightOffset),
    chaseDistanceOffset: clampNum(p.chaseDistanceOffset, -3, 4, d.chaseDistanceOffset),

    hudPreset: isOneOf(p.hudPreset, ['full', 'minimal', 'pro', 'off'] as const) ? p.hudPreset : d.hudPreset,
    hudScale: clampNum(p.hudScale, 0.75, 1.25, d.hudScale),
    showVirtualMirror: typeof p.showVirtualMirror === 'boolean' ? p.showVirtualMirror : d.showVirtualMirror,
    showPedalTrace: typeof p.showPedalTrace === 'boolean' ? p.showPedalTrace : d.showPedalTrace,
    showCornerCallouts: typeof p.showCornerCallouts === 'boolean' ? p.showCornerCallouts : d.showCornerCallouts,
    showNametags: typeof p.showNametags === 'boolean' ? p.showNametags : d.showNametags,
    minimapRotate: typeof p.minimapRotate === 'boolean' ? p.minimapRotate : d.minimapRotate,
    units: isOneOf(p.units, ['metric', 'imperial'] as const) ? p.units : d.units,

    colorblindMode: isOneOf(p.colorblindMode, ['none', 'protanopia', 'deuteranopia', 'tritanopia'] as const) ? p.colorblindMode : d.colorblindMode,
    highContrastHud: typeof p.highContrastHud === 'boolean' ? p.highContrastHud : d.highContrastHud,
    reducedMotion: typeof p.reducedMotion === 'boolean' ? p.reducedMotion : d.reducedMotion,
    subtitleScale: clampNum(p.subtitleScale, 0.85, 1.4, d.subtitleScale),
  };
}

function readStoredSettings(): GameSettings {
  try {
    if (typeof localStorage === 'undefined') {
      return { ...DEFAULT_GAME_SETTINGS, keybinds: { ...DEFAULT_KEYBINDS } };
    }
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_GAME_SETTINGS, keybinds: { ...DEFAULT_KEYBINDS } };
    }
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_GAME_SETTINGS, keybinds: { ...DEFAULT_KEYBINDS } };
  }
}

let activeSettings: GameSettings = readStoredSettings();

export function getGameSettings(): GameSettings {
  return { ...activeSettings, keybinds: { ...activeSettings.keybinds } };
}

export function isControllerInputEnabled(): boolean {
  return activeSettings.controllerEnabled;
}

export function setGameSettings(patch: Partial<GameSettings>): GameSettings {
  const merged = {
    ...activeSettings,
    ...patch,
    keybinds: patch.keybinds ? { ...activeSettings.keybinds, ...patch.keybinds } : activeSettings.keybinds,
  };
  activeSettings = sanitizeSettings(merged);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activeSettings));
    }
  } catch {
    // Ignore storage quota / private mode failures
  }
  const snapshot = getGameSettings();
  listeners.forEach((fn) => fn(snapshot));
  return snapshot;
}

export function subscribeGameSettings(listener: SettingsListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

