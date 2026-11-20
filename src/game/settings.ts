/**
 * Persistent client-side gameplay & input settings (localStorage-backed).
 */

export interface GameSettings {
  /** When false, all Gamepad / joystick / steering-wheel polling is ignored. */
  controllerEnabled: boolean;
}

const STORAGE_KEY = 'apex_game_settings_v1';

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  controllerEnabled: true,
};

type SettingsListener = (settings: GameSettings) => void;

const listeners = new Set<SettingsListener>();

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
