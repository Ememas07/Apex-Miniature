/**
 * Persistent client-side gameplay & input settings (localStorage-backed).
 */

export type TouchControlsMode = 'auto' | 'always' | 'off';
export type TouchSteerStyle = 'pad' | 'buttons';

export interface GameSettings {
  /** When false, all Gamepad / joystick / steering-wheel polling is ignored. */
  controllerEnabled: boolean;
  /** Controls visibility of on-screen mobile touchpad driving controls. */
  touchControlsMode: TouchControlsMode;
  /** On-screen steering style: analog horizontal touchpad or split Left/Right buttons. */
  touchSteerStyle: TouchSteerStyle;
}

const STORAGE_KEY = 'apex_game_settings_v1';

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  controllerEnabled: true,
  touchControlsMode: 'auto',
  touchSteerStyle: 'pad',
};

type SettingsListener = (settings: GameSettings) => void;

const listeners = new Set<SettingsListener>();

function isValidTouchMode(v: unknown): v is TouchControlsMode {
  return v === 'auto' || v === 'always' || v === 'off';
}

function isValidTouchSteerStyle(v: unknown): v is TouchSteerStyle {
  return v === 'pad' || v === 'buttons';
}

function readStoredSettings(): GameSettings {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_GAME_SETTINGS };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GAME_SETTINGS };
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
    };
  } catch {
    return { ...DEFAULT_GAME_SETTINGS };
  }
}

let activeSettings: GameSettings = readStoredSettings();

export function getGameSettings(): GameSettings {
  return { ...activeSettings };
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
  };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activeSettings));
    }
  } catch {
    // Ignore storage quota / private mode failures
  }
  const snapshot = { ...activeSettings };
  listeners.forEach((fn) => fn(snapshot));
  return snapshot;
}

export function subscribeGameSettings(listener: SettingsListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
