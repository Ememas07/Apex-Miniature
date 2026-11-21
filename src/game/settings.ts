/**
 * Persistent client-side gameplay & input settings (localStorage-backed).
 */

export type TouchControlsMode = 'auto' | 'always' | 'off';
export type TouchSteerStyle = 'pad' | 'buttons';
export type TransmissionMode = 'auto' | 'manual';

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
  | 'brakeBiasDown'
  | 'brakeBiasUp'
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
  brakeBiasDown: 'BracketLeft',
  brakeBiasUp: 'BracketRight',
  pause: 'KeyP',
  mute: 'KeyM',
};

export const KEYBIND_LABELS: Record<KeybindAction, string> = {
  throttle: 'Throttle / Gas',
  brake: 'Brake / Reverse',
  steerLeft: 'Steer Left',
  steerRight: 'Steer Right',
  shiftUp: 'Shift Up (Manual)',
  shiftDown: 'Shift Down (Manual)',
  special: 'Special (DRS / Aero / Attack / Boost)',
  ersMode: 'Cycle ERS Mode (Hybrids)',
  camera: 'Cycle Camera',
  resetCamera: 'Reset Camera',
  brakeBiasDown: 'Brake Bias Rear (-)',
  brakeBiasUp: 'Brake Bias Front (+)',
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

export interface GameSettings {
  /** When false, all Gamepad / joystick / steering-wheel polling is ignored. */
  controllerEnabled: boolean;
  /** Controls visibility of on-screen mobile touchpad driving controls. */
  touchControlsMode: TouchControlsMode;
  /** On-screen steering style: analog horizontal touchpad or split Left/Right buttons. */
  touchSteerStyle: TouchSteerStyle;
  /** Gearbox mode: automatic or manual sequential shifting. */
  transmissionMode: TransmissionMode;
  /** Customizable keyboard bindings (KeyboardEvent.code values). */
  keybinds: KeybindConfig;
}

const STORAGE_KEY = 'apex_game_settings_v1';

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  controllerEnabled: true,
  touchControlsMode: 'auto',
  touchSteerStyle: 'pad',
  transmissionMode: 'auto',
  keybinds: { ...DEFAULT_KEYBINDS },
};

type SettingsListener = (settings: GameSettings) => void;

const listeners = new Set<SettingsListener>();

function isValidTouchMode(v: unknown): v is TouchControlsMode {
  return v === 'auto' || v === 'always' || v === 'off';
}

function isValidTouchSteerStyle(v: unknown): v is TouchSteerStyle {
  return v === 'pad' || v === 'buttons';
}

function isValidTransmissionMode(v: unknown): v is TransmissionMode {
  return v === 'auto' || v === 'manual';
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

function readStoredSettings(): GameSettings {
  try {
    if (typeof localStorage === 'undefined') {
      return { ...DEFAULT_GAME_SETTINGS, keybinds: { ...DEFAULT_KEYBINDS } };
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_GAME_SETTINGS, keybinds: { ...DEFAULT_KEYBINDS } };
    }
    const parsed = JSON.parse(raw);
    return {
      controllerEnabled:
        typeof parsed?.controllerEnabled === 'boolean'
          ? parsed.controllerEnabled
          : DEFAULT_GAME_SETTINGS.controllerEnabled,
      touchControlsMode: isValidTouchMode(parsed?.touchControlsMode)
        ? parsed.touchControlsMode
        : DEFAULT_GAME_SETTINGS.touchControlsMode,
      touchSteerStyle: isValidTouchSteerStyle(parsed?.touchSteerStyle)
        ? parsed.touchSteerStyle
        : DEFAULT_GAME_SETTINGS.touchSteerStyle,
      transmissionMode: isValidTransmissionMode(parsed?.transmissionMode)
        ? parsed.transmissionMode
        : DEFAULT_GAME_SETTINGS.transmissionMode,
      keybinds: sanitizeKeybinds(parsed?.keybinds),
    };
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
  activeSettings = {
    ...activeSettings,
    ...(typeof patch.controllerEnabled === 'boolean'
      ? { controllerEnabled: patch.controllerEnabled }
      : {}),
    ...(isValidTouchMode(patch.touchControlsMode)
      ? { touchControlsMode: patch.touchControlsMode }
      : {}),
    ...(isValidTouchSteerStyle(patch.touchSteerStyle)
      ? { touchSteerStyle: patch.touchSteerStyle }
      : {}),
    ...(isValidTransmissionMode(patch.transmissionMode)
      ? { transmissionMode: patch.transmissionMode }
      : {}),
    ...(patch.keybinds
      ? { keybinds: sanitizeKeybinds({ ...activeSettings.keybinds, ...patch.keybinds }) }
      : {}),
  };
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
