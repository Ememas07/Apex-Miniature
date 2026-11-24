export type WheelPresetId =
  | 'default'
  | 'logitech-g29'
  | 'thrustmaster-t300'
  | 'fanatec-dd'
  | 'generic-combined';

export type SteeringLockCurve = 'standard' | 'linear' | 'progressive' | 's-curve';
export type PedalAxisMode = 'triggers' | 'split' | 'combined';

export interface GamepadInputState {
  connected: boolean;
  gamepadId: string | null;
  throttle: number; // 0..1 analog (R2 / RT / buttons[7] or wheel pedal axis)
  brake: number; // 0..1 analog (L2 / LT / buttons[6], wheel pedal axis, or Square/X fallback)
  steer: number; // -1..1 (Left Stick X / Wheel axes[0] or D-Pad Left/Right) with deadzone + curve
  leftStickY: number; // -1..1 (Left Stick Y / axes[1]) for freecam flight
  cameraX: number; // -1..1 (Right Stick X / axes[2]) with deadzone
  cameraY: number; // -1..1 (Right Stick Y / axes[3]) with deadzone
  specialPressed: boolean; // Cross / A (buttons[0]) currently held
  specialJustPressed: boolean; // Rising edge of Cross / A (buttons[0]) — true for 1 poll only
  cameraJustPressed: boolean; // Rising edge of Triangle / Y (buttons[3]) — cycle camera / freecam
  pauseJustPressed: boolean; // Rising edge of Options / Start (buttons[9]) — toggle pause
  resetCameraJustPressed: boolean; // Rising edge of Share / View (buttons[8]) or R3 (buttons[11])
  lbPressed: boolean; // L1 / LB (buttons[4]) held
  rbPressed: boolean; // R1 / RB (buttons[5]) held
  lbJustPressed: boolean; // Rising edge of L1 / LB (buttons[4])
  rbJustPressed: boolean; // Rising edge of R1 / RB (buttons[5])
  lookBackPressed: boolean; // Circle / B (buttons[1]) or L3 (buttons[10]) held
  mfdCycleJustPressed: boolean; // D-Pad Up (buttons[12]) rising edge
  rawSteerAxis: number; // Uncurved raw left stick X / wheel axis for live calibration tester
  hasAnyInput: boolean; // True if any mapped trigger/stick/button is active
}

export interface GamepadConfig {
  steerDeadzone: number;
  steerLinearity: number;
  steerSensitivity: number;
  wheelLockDegrees: number;
  rumbleIntensity: number;
  splitPedalAxes: boolean;
  cameraDeadzone: number;
  triggerDeadzone: number;
  specialButtonThreshold: number;
  wheelPreset?: WheelPresetId;
  steeringLockCurve?: SteeringLockCurve;
  combinedPedalAxis?: boolean;
  invertSteerAxis?: boolean;
  invertThrottleAxis?: boolean;
  invertBrakeAxis?: boolean;
  throttleAxisIndex?: number;
  brakeAxisIndex?: number;
  combinedPedalAxisIndex?: number;
}

export const DEFAULT_GAMEPAD_CONFIG: GamepadConfig = {
  steerDeadzone: 0.1,
  steerLinearity: 1.35,
  steerSensitivity: 1.0,
  wheelLockDegrees: 360,
  rumbleIntensity: 0.75,
  splitPedalAxes: false,
  cameraDeadzone: 0.12,
  triggerDeadzone: 0.04,
  specialButtonThreshold: 0.5,
  wheelPreset: 'default',
  steeringLockCurve: 'standard',
  combinedPedalAxis: false,
  invertSteerAxis: false,
  invertThrottleAxis: false,
  invertBrakeAxis: false,
};

export interface WheelCalibrationPreset {
  id: WheelPresetId;
  label: string;
  shortLabel: string;
  description: string;
  pedalMode: PedalAxisMode;
  config: {
    steerDeadzone: number;
    steerLinearity: number;
    steerSensitivity: number;
    wheelLockDegrees: number;
    steeringLockCurve: SteeringLockCurve;
    rumbleIntensity: number;
    splitPedalAxes: boolean;
    combinedPedalAxis: boolean;
    invertSteerAxis: boolean;
    invertThrottleAxis: boolean;
    invertBrakeAxis: boolean;
  };
}

export const WHEEL_PRESET_ORDER: readonly WheelPresetId[] = [
  'default',
  'logitech-g29',
  'thrustmaster-t300',
  'fanatec-dd',
  'generic-combined',
];

export const WHEEL_CALIBRATION_PRESETS: Record<WheelPresetId, WheelCalibrationPreset> = {
  default: {
    id: 'default',
    label: 'Standard Gamepad / Custom',
    shortLabel: 'Gamepad',
    description: 'Analog triggers + thumbstick steering curve for DualSense, Xbox & mobile pads',
    pedalMode: 'triggers',
    config: {
      steerDeadzone: 0.08,
      steerLinearity: 1.35,
      steerSensitivity: 1.0,
      wheelLockDegrees: 360,
      steeringLockCurve: 'standard',
      rumbleIntensity: 0.75,
      splitPedalAxes: false,
      combinedPedalAxis: false,
      invertSteerAxis: false,
      invertThrottleAxis: false,
      invertBrakeAxis: false,
    },
  },
  'logitech-g29': {
    id: 'logitech-g29',
    label: 'Logitech G29 / G923',
    shortLabel: 'Logitech G29/G923',
    description: '540° progressive lock curve with split gas/brake axes (+1 rest to -1 pressed)',
    pedalMode: 'split',
    config: {
      steerDeadzone: 0.02,
      steerLinearity: 1.15,
      steerSensitivity: 1.25,
      wheelLockDegrees: 540,
      steeringLockCurve: 'progressive',
      rumbleIntensity: 0.8,
      splitPedalAxes: true,
      combinedPedalAxis: false,
      invertSteerAxis: false,
      invertThrottleAxis: false,
      invertBrakeAxis: false,
    },
  },
  'thrustmaster-t300': {
    id: 'thrustmaster-t300',
    label: 'Thrustmaster T300',
    shortLabel: 'Thrustmaster T300',
    description: '540° linear belt-drive lock curve with split inverted pedal axes',
    pedalMode: 'split',
    config: {
      steerDeadzone: 0.02,
      steerLinearity: 1.05,
      steerSensitivity: 1.3,
      wheelLockDegrees: 540,
      steeringLockCurve: 'linear',
      rumbleIntensity: 0.75,
      splitPedalAxes: true,
      combinedPedalAxis: false,
      invertSteerAxis: false,
      invertThrottleAxis: true,
      invertBrakeAxis: true,
    },
  },
  'fanatec-dd': {
    id: 'fanatec-dd',
    label: 'Fanatec Direct Drive',
    shortLabel: 'Fanatec DD',
    description: '1:1 linear direct-drive response at 360° lock with split load-cell pedals',
    pedalMode: 'split',
    config: {
      steerDeadzone: 0.02,
      steerLinearity: 1.0,
      steerSensitivity: 1.1,
      wheelLockDegrees: 360,
      steeringLockCurve: 'linear',
      rumbleIntensity: 0.65,
      splitPedalAxes: true,
      combinedPedalAxis: false,
      invertSteerAxis: false,
      invertThrottleAxis: false,
      invertBrakeAxis: false,
    },
  },
  'generic-combined': {
    id: 'generic-combined',
    label: 'Generic Combined Pedals',
    shortLabel: 'Combined Pedals',
    description: '270° S-curve lock for entry wheels sharing throttle (-1) & brake (+1) on one axis',
    pedalMode: 'combined',
    config: {
      steerDeadzone: 0.05,
      steerLinearity: 1.25,
      steerSensitivity: 1.1,
      wheelLockDegrees: 270,
      steeringLockCurve: 's-curve',
      rumbleIntensity: 0.5,
      splitPedalAxes: false,
      combinedPedalAxis: true,
      invertSteerAxis: false,
      invertThrottleAxis: false,
      invertBrakeAxis: false,
    },
  },
};

export function getWheelPresetConfig(presetId: WheelPresetId): WheelCalibrationPreset {
  return WHEEL_CALIBRATION_PRESETS[presetId] ?? WHEEL_CALIBRATION_PRESETS.default;
}

/**
 * Matches common Web Gamepad API device IDs to a recommended wheel calibration preset.
 */
export function detectWheelPresetFromGamepadId(gamepadId: string | null | undefined): WheelPresetId | null {
  if (!gamepadId) return null;
  const id = gamepadId.toLowerCase();
  if (/\b(g29|g920|g923|driving force|logitech.*wheel)\b/.test(id)) {
    return 'logitech-g29';
  }
  if (/\b(t300|t150|t248|t500|t-gt|tx racing|thrustmaster)\b/.test(id)) {
    return 'thrustmaster-t300';
  }
  if (/\b(fanatec|csl\s*dd|podium|clubsport)\b/.test(id)) {
    return 'fanatec-dd';
  }
  if (/\b(wheel|racing|pedal|hori|simagic|moza)\b/.test(id)) {
    return 'generic-combined';
  }
  return null;
}

/**
 * Infers whether a connected controller uses analog triggers, split wheel pedal axes,
 * or a single combined throttle/brake pedal axis.
 */
export function detectPedalAxisMode(
  gamepad: Pick<GamepadLike, 'axes' | 'buttons' | 'id' | 'mapping'> | null | undefined,
): PedalAxisMode {
  if (!gamepad) return 'triggers';
  const presetMatch = detectWheelPresetFromGamepadId(gamepad.id);
  const axes = gamepad.axes ?? [];
  if (axes.length >= 6) {
    const ax2 = axes[2];
    const ax5 = axes[5];
    if (
      typeof ax2 === 'number' &&
      typeof ax5 === 'number' &&
      Math.abs(ax2) > 0.75 &&
      Math.abs(ax5) > 0.75
    ) {
      return 'split';
    }
  }
  if (presetMatch) {
    return WHEEL_CALIBRATION_PRESETS[presetMatch].pedalMode;
  }
  if (gamepad.mapping !== 'standard' && axes.length >= 2 && axes.length < 6) {
    return 'combined';
  }
  return 'triggers';
}

export interface GamepadLike {
  index: number;
  id?: string;
  connected?: boolean;
  mapping?: string;
  axes?: ReadonlyArray<number>;
  buttons?: ReadonlyArray<{ pressed?: boolean; value?: number } | undefined>;
  vibrationActuator?: {
    playEffect?: (
      type: 'dual-rumble',
      params?: { duration?: number; strongMagnitude?: number; weakMagnitude?: number },
    ) => Promise<unknown>;
  } | null;
}

const NEUTRAL_STATE: GamepadInputState = {
  connected: false,
  gamepadId: null,
  throttle: 0,
  brake: 0,
  steer: 0,
  leftStickY: 0,
  cameraX: 0,
  cameraY: 0,
  specialPressed: false,
  specialJustPressed: false,
  cameraJustPressed: false,
  pauseJustPressed: false,
  resetCameraJustPressed: false,
  lbPressed: false,
  rbPressed: false,
  lbJustPressed: false,
  rbJustPressed: false,
  lookBackPressed: false,
  mfdCycleJustPressed: false,
  rawSteerAxis: 0,
  hasAnyInput: false,
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function applyDeadzoneNormalized(raw01: number, deadzone: number): number {
  const clamped = clamp(raw01, 0, 1);
  if (clamped <= deadzone) return 0;
  return clamp((clamped - deadzone) / Math.max(0.05, 1 - deadzone), 0, 1);
}

/**
 * Applies a deadzone and steering lock response curve to a -1..+1 stick or wheel axis
 * so center drift never causes steering jitter while preserving wheel precision.
 */
export function applySteeringCurve(
  rawAxis: number,
  deadzone = DEFAULT_GAMEPAD_CONFIG.steerDeadzone,
  linearity = DEFAULT_GAMEPAD_CONFIG.steerLinearity,
  sensitivity = DEFAULT_GAMEPAD_CONFIG.steerSensitivity,
  lockCurve: SteeringLockCurve = 'standard',
): number {
  if (!Number.isFinite(rawAxis)) return 0;
  const clamped = clamp(rawAxis, -1, 1);
  const absVal = Math.abs(clamped);
  if (absVal <= deadzone) return 0;
  const normalized = clamp((absVal - deadzone) / Math.max(0.05, 1 - deadzone), 0, 1);
  const exp = clamp(linearity, 1.0, 2.4);

  let shaped: number;
  switch (lockCurve) {
    case 'linear':
      shaped = normalized;
      break;
    case 'progressive':
      shaped = 0.25 * normalized + 0.75 * Math.pow(normalized, clamp(exp * 1.15, 1.0, 2.4));
      break;
    case 's-curve': {
      const smooth = normalized * normalized * (3 - 2 * normalized);
      shaped = 0.55 * smooth + 0.45 * Math.pow(normalized, exp);
      break;
    }
    case 'standard':
    default:
      shaped = Math.pow(normalized, exp);
      break;
  }

  const sensGain = clamp(sensitivity, 0.35, 2.4);
  const curved = clamp(shaped * sensGain, 0, 1);
  return Math.sign(clamped) * curved;
}

/**
 * Computes steering axis output from a raw -1..+1 axis using wheel lock, polarity, and lock curve.
 */
export function computeWheelSteer(
  rawAxis: number,
  config: Pick<
    GamepadConfig,
    'steerDeadzone' | 'steerLinearity' | 'steerSensitivity' | 'wheelLockDegrees' | 'steeringLockCurve' | 'invertSteerAxis'
  >,
): { rawSteerAxis: number; steer: number } {
  const safeRaw = Number.isFinite(rawAxis) ? rawAxis : 0;
  const rawSteerAxis = clamp(config.invertSteerAxis ? -safeRaw : safeRaw, -1, 1);
  const lockGain = clamp(360 / Math.max(180, config.wheelLockDegrees), 0.4, 2.0);
  const steer = applySteeringCurve(
    rawSteerAxis,
    config.steerDeadzone,
    config.steerLinearity,
    config.steerSensitivity * lockGain,
    config.steeringLockCurve ?? 'standard',
  );
  return { rawSteerAxis, steer };
}

/**
 * Reads throttle and brake (0..1) supporting standard triggers, split wheel pedal axes,
 * single combined pedal axes, and per-pedal axis polarity inversion.
 */
export function readWheelPedals(
  axes: ReadonlyArray<number>,
  buttons: ReadonlyArray<{ pressed?: boolean; value?: number } | undefined>,
  config: Pick<
    GamepadConfig,
    | 'triggerDeadzone'
    | 'splitPedalAxes'
    | 'combinedPedalAxis'
    | 'invertThrottleAxis'
    | 'invertBrakeAxis'
    | 'throttleAxisIndex'
    | 'brakeAxisIndex'
    | 'combinedPedalAxisIndex'
  >,
): { throttle: number; brake: number; mode: PedalAxisMode } {
  const deadzone = config.triggerDeadzone;
  let throttle = readTriggerValue(buttons[7], deadzone);
  let brake = readTriggerValue(buttons[6], deadzone);
  let mode: PedalAxisMode = 'triggers';

  if (config.splitPedalAxes && axes.length >= 3) {
    mode = 'split';
    const tIdx = config.throttleAxisIndex ?? (axes.length >= 6 ? 2 : 1);
    const bIdx = config.brakeAxisIndex ?? (axes.length >= 6 ? 5 : 2);
    const rawT = axes[tIdx];
    const rawB = axes[bIdx];
    if (typeof rawT === 'number' && Number.isFinite(rawT)) {
      const normalized = config.invertThrottleAxis ? (1 + clamp(rawT, -1, 1)) * 0.5 : (1 - clamp(rawT, -1, 1)) * 0.5;
      throttle = Math.max(throttle, applyDeadzoneNormalized(normalized, deadzone));
    }
    if (typeof rawB === 'number' && Number.isFinite(rawB)) {
      const normalized = config.invertBrakeAxis ? (1 + clamp(rawB, -1, 1)) * 0.5 : (1 - clamp(rawB, -1, 1)) * 0.5;
      brake = Math.max(brake, applyDeadzoneNormalized(normalized, deadzone));
    }
  } else if (config.combinedPedalAxis && axes.length >= 2) {
    mode = 'combined';
    const cIdx = config.combinedPedalAxisIndex ?? 1;
    const rawC = axes[cIdx];
    if (typeof rawC === 'number' && Number.isFinite(rawC)) {
      const clampedC = clamp(rawC, -1, 1);
      const rawThrottleHalf = config.invertThrottleAxis ? clampedC : -clampedC;
      const rawBrakeHalf = config.invertBrakeAxis ? -clampedC : clampedC;
      throttle = Math.max(throttle, applyDeadzoneNormalized(rawThrottleHalf, deadzone));
      brake = Math.max(brake, applyDeadzoneNormalized(rawBrakeHalf, deadzone));
    }
  }

  return { throttle, brake, mode };
}

/**
 * Applies deadzone and gentle curve to a right-stick camera axis (-1..+1).
 */
export function applyCameraStickAxis(rawAxis: number, deadzone = DEFAULT_GAMEPAD_CONFIG.cameraDeadzone): number {
  if (!Number.isFinite(rawAxis)) return 0;
  const clamped = clamp(rawAxis, -1, 1);
  const absVal = Math.abs(clamped);
  if (absVal <= deadzone) return 0;
  const normalized = clamp((absVal - deadzone) / (1 - deadzone), 0, 1);
  const curved = 0.5 * normalized + 0.5 * normalized * normalized;
  return Math.sign(clamped) * curved;
}

/**
 * Reads an analog trigger button (R2 = buttons[7], L2 = buttons[6]) as 0..1 with tiny resting deadzone.
 */
export function readTriggerValue(
  button: { pressed?: boolean; value?: number } | undefined,
  deadzone = DEFAULT_GAMEPAD_CONFIG.triggerDeadzone,
): number {
  if (!button) return 0;
  let raw = 0;
  if (typeof button.value === 'number' && Number.isFinite(button.value)) {
    raw = clamp(button.value, 0, 1);
  } else if (button.pressed) {
    raw = 1;
  }
  if (raw <= deadzone) return 0;
  return clamp((raw - deadzone) / (1 - deadzone), 0, 1);
}

/**
 * Selects the best connected gamepad from a sparse `navigator.getGamepads()` list.
 * Prefers `preferredIndex` if still connected, otherwise prefers `mapping === 'standard'`,
 * falling back to the first connected gamepad.
 */
export function selectActiveGamepad(
  gamepads: ReadonlyArray<GamepadLike | null | undefined>,
  preferredIndex: number | null,
): GamepadLike | null {
  if (!gamepads || gamepads.length === 0) return null;

  if (preferredIndex !== null && preferredIndex >= 0 && preferredIndex < gamepads.length) {
    const preferred = gamepads[preferredIndex];
    if (preferred && preferred.connected !== false) {
      return preferred;
    }
  }

  let fallback: GamepadLike | null = null;
  for (let i = 0; i < gamepads.length; i++) {
    const gp = gamepads[i];
    if (!gp || gp.connected === false) continue;
    if (gp.mapping === 'standard') return gp;
    if (!fallback) fallback = gp;
  }
  return fallback;
}

/**
 * Browser Gamepad API manager supporting PS4/DualShock & standard controllers.
 * Handles `gamepadconnected` / `gamepaddisconnected` events and safe per-frame polling
 * with edge-triggered Cross/X (`buttons[0]`) special toggle detection.
 */
export class GamepadController {
  private readonly config: GamepadConfig;
  private activeIndex: number | null = null;
  private prevSpecialPressed = false;
  private prevCameraPressed = false;
  private prevPausePressed = false;
  private prevResetCamPressed = false;
  private prevLbPressed = false;
  private prevRbPressed = false;
  private prevMfdPressed = false;
  private lastRumbleAtMs = 0;
  private attached = false;
  private enabled = true;

  private readonly onConnected = (e: GamepadEvent): void => {
    const gp = e.gamepad;
    if (!gp) return;
    if (this.activeIndex === null || gp.mapping === 'standard') {
      this.activeIndex = gp.index;
      this.resetEdgeState();
    }
  };

  private readonly onDisconnected = (e: GamepadEvent): void => {
    const gp = e.gamepad;
    if (!gp) return;
    if (this.activeIndex === gp.index) {
      this.activeIndex = null;
      this.resetEdgeState();
    }
  };

  constructor(config?: Partial<GamepadConfig>) {
    this.config = { ...DEFAULT_GAMEPAD_CONFIG, ...config };
  }

  attach(target: Window = window): void {
    if (this.attached || typeof target === 'undefined') return;
    target.addEventListener('gamepadconnected', this.onConnected);
    target.addEventListener('gamepaddisconnected', this.onDisconnected);
    this.attached = true;
  }

  detach(target: Window = window): void {
    if (!this.attached || typeof target === 'undefined') return;
    target.removeEventListener('gamepadconnected', this.onConnected);
    target.removeEventListener('gamepaddisconnected', this.onDisconnected);
    this.attached = false;
    this.resetEdgeState();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.resetEdgeState();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  updateConfig(patch: Partial<GamepadConfig>): void {
    Object.assign(this.config, patch);
  }

  triggerRumble(strongMagnitude: number, weakMagnitude: number, durationMs = 110): void {
    if (!this.enabled || this.config.rumbleIntensity <= 0.01) return;
    const now = Date.now();
    if (now - this.lastRumbleAtMs < 55) return;
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
    try {
      const list = Array.from(navigator.getGamepads() ?? []) as Array<GamepadLike | null>;
      const gp = selectActiveGamepad(list, this.activeIndex);
      const actuator = gp?.vibrationActuator;
      if (actuator && typeof actuator.playEffect === 'function') {
        this.lastRumbleAtMs = now;
        const scale = clamp(this.config.rumbleIntensity, 0, 1);
        actuator
          .playEffect('dual-rumble', {
            duration: Math.max(30, Math.min(600, durationMs)),
            strongMagnitude: clamp(strongMagnitude * scale, 0, 1),
            weakMagnitude: clamp(weakMagnitude * scale, 0, 1),
          })
          .catch(() => {});
      }
    } catch {
      // ignore unsupported actuators
    }
  }

  resetEdgeState(): void {
    this.prevSpecialPressed = false;
    this.prevCameraPressed = false;
    this.prevPausePressed = false;
    this.prevResetCamPressed = false;
    this.prevLbPressed = false;
    this.prevRbPressed = false;
    this.prevMfdPressed = false;
  }

  /**
   * Polls a provided gamepad list (or `navigator.getGamepads()` by default).
   * Always safe even if the browser lacks Gamepad API support or a controller disconnects mid-frame.
   */
  poll(overrideGamepads?: ReadonlyArray<GamepadLike | null | undefined>): GamepadInputState {
    if (!this.enabled) {
      this.resetEdgeState();
      return { ...NEUTRAL_STATE };
    }
    let rawList: ReadonlyArray<GamepadLike | null | undefined>;
    if (overrideGamepads) {
      rawList = overrideGamepads;
    } else if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
      try {
        rawList = Array.from(navigator.getGamepads() ?? []);
      } catch {
        this.activeIndex = null;
        this.resetEdgeState();
        return { ...NEUTRAL_STATE };
      }
    } else {
      return { ...NEUTRAL_STATE };
    }

    const gp = selectActiveGamepad(rawList, this.activeIndex);
    if (!gp) {
      this.activeIndex = null;
      this.resetEdgeState();
      return { ...NEUTRAL_STATE };
    }

    if (this.activeIndex !== gp.index) {
      this.activeIndex = gp.index;
      this.resetEdgeState();
    }

    const axes = gp.axes ?? [];
    const buttons = gp.buttons ?? [];

    const isBtnDown = (idx: number): boolean => {
      const btn = buttons[idx];
      return Boolean(
        btn &&
          (btn.pressed ||
            (typeof btn.value === 'number' && btn.value >= this.config.specialButtonThreshold)),
      );
    };

    // Standard Gamepad layout (DualShock / DualSense / Xbox / Switch Pro / Mobile Backbone & Kishi):
    // R2/RT = buttons[7] (analog 0..1), L2/LT = buttons[6] (analog 0..1)
    // Left Stick X/Y = axes[0]/axes[1], Right Stick X/Y = axes[2]/axes[3]
    // D-pad Left/Right = buttons[14]/buttons[15] (fallback steering when stick is neutral)
    // Cross/A = buttons[0] (Special), Square/X = buttons[2] (brake fallback), Triangle/Y = buttons[3] (Camera)
    // L1/LB = buttons[4], R1/RB = buttons[5], Select/Share = buttons[8], Start/Options = buttons[9], R3 = buttons[11]
    const pedals = readWheelPedals(axes, buttons, this.config);
    const squareBrake = isBtnDown(2) ? 1 : 0;

    const throttle = pedals.throttle;
    const brake = Math.max(pedals.brake, squareBrake);

    const { rawSteerAxis, steer: stickSteer } = computeWheelSteer(axes[0] ?? 0, this.config);
    const dpadSteer = (isBtnDown(15) ? 1 : 0) - (isBtnDown(14) ? 1 : 0);
    const steer = stickSteer !== 0 ? stickSteer : dpadSteer;

    const leftStickY = applyCameraStickAxis(axes[1] ?? 0, this.config.cameraDeadzone);
    const cameraX = applyCameraStickAxis(axes[2] ?? 0, this.config.cameraDeadzone);
    const cameraY = applyCameraStickAxis(axes[3] ?? 0, this.config.cameraDeadzone);

    const specialPressed = isBtnDown(0);
    const specialJustPressed = specialPressed && !this.prevSpecialPressed;
    this.prevSpecialPressed = specialPressed;

    const cameraPressed = isBtnDown(3);
    const cameraJustPressed = cameraPressed && !this.prevCameraPressed;
    this.prevCameraPressed = cameraPressed;

    const pausePressed = isBtnDown(9);
    const pauseJustPressed = pausePressed && !this.prevPausePressed;
    this.prevPausePressed = pausePressed;

    const resetCamPressed = isBtnDown(8) || isBtnDown(11);
    const resetCameraJustPressed = resetCamPressed && !this.prevResetCamPressed;
    this.prevResetCamPressed = resetCamPressed;

    const lbPressed = isBtnDown(4);
    const lbJustPressed = lbPressed && !this.prevLbPressed;
    this.prevLbPressed = lbPressed;

    const rbPressed = isBtnDown(5);
    const rbJustPressed = rbPressed && !this.prevRbPressed;
    this.prevRbPressed = rbPressed;

    const lookBackPressed = isBtnDown(1) || isBtnDown(10);
    const mfdPressed = isBtnDown(12);
    const mfdCycleJustPressed = mfdPressed && !this.prevMfdPressed;
    this.prevMfdPressed = mfdPressed;

    const hasAnyInput =
      throttle > 0 ||
      brake > 0 ||
      steer !== 0 ||
      leftStickY !== 0 ||
      cameraX !== 0 ||
      cameraY !== 0 ||
      specialPressed ||
      cameraPressed ||
      pausePressed ||
      resetCamPressed ||
      lbPressed ||
      rbPressed ||
      lookBackPressed ||
      mfdPressed;

    return {
      connected: true,
      gamepadId: gp.id ?? null,
      throttle,
      brake,
      steer,
      leftStickY,
      cameraX,
      cameraY,
      specialPressed,
      specialJustPressed,
      cameraJustPressed,
      pauseJustPressed,
      resetCameraJustPressed,
      lbPressed,
      rbPressed,
      lbJustPressed,
      rbJustPressed,
      lookBackPressed,
      mfdCycleJustPressed,
      rawSteerAxis,
      hasAnyInput,
    };
  }
}

/**
 * Cleanly blends keyboard and gamepad driving inputs so either can be used seamlessly
 * without fighting each other.
 */
export function blendDrivingInputs(
  keyboard: { throttle: number; brake: number; steer: number },
  gamepad: Pick<GamepadInputState, 'connected' | 'throttle' | 'brake' | 'steer'>,
): { throttle: number; brake: number; steer: number } {
  if (!gamepad.connected) {
    return {
      throttle: clamp(keyboard.throttle, 0, 1),
      brake: clamp(keyboard.brake, 0, 1),
      steer: clamp(keyboard.steer, -1, 1),
    };
  }

  const throttle = clamp(Math.max(keyboard.throttle, gamepad.throttle), 0, 1);
  const brake = clamp(Math.max(keyboard.brake, gamepad.brake), 0, 1);

  // If only one input source is active on steering, use it directly with zero interference;
  // if both are touched simultaneously, blend cleanly and clamp to [-1, 1].
  let steer = 0;
  if (keyboard.steer !== 0 && gamepad.steer === 0) {
    steer = keyboard.steer;
  } else if (gamepad.steer !== 0 && keyboard.steer === 0) {
    steer = gamepad.steer;
  } else if (keyboard.steer !== 0 && gamepad.steer !== 0) {
    steer = clamp(keyboard.steer + gamepad.steer, -1, 1);
  }

  return { throttle, brake, steer };
}

export type GamepadNavDirection = 'up' | 'down' | 'left' | 'right';

export type GamepadNavAction =
  | { type: 'move'; direction: GamepadNavDirection; target: HTMLElement | null }
  | { type: 'activate'; target: HTMLElement | null }
  | { type: 'back'; handled: boolean };

export interface GamepadMenuNavOptions {
  /** Root container or getter to query focusable elements within (defaults to document). */
  root?: ParentNode | (() => ParentNode | null);
  /** CSS selector for navigable elements. */
  selector?: string;
  /** Left-stick threshold for directional menu movement (default 0.55). */
  stickThreshold?: number;
  /** Initial delay before holding D-Pad/stick starts repeating (ms, default 320). */
  repeatDelayMs?: number;
  /** Repeat interval while holding D-Pad/stick (ms, default 120). */
  repeatIntervalMs?: number;
  /** Preferred gamepad slot index. */
  preferredIndex?: number | null;
  /** Initial active state (default true). */
  active?: boolean;
  /** Step <input type="range"> elements on Left/Right instead of jumping focus (default true). */
  stepRangeInputs?: boolean;
  /** Optional callback when A/Cross activates an element; return true to skip default .click(). */
  onActivate?: (el: HTMLElement) => boolean | void;
  /** Optional callback when B/Circle is pressed; return true to skip dispatching Escape. */
  onBack?: () => boolean | void;
  /** Optional gamepad source override (useful for unit tests). */
  getGamepads?: () => ReadonlyArray<GamepadLike | null | undefined>;
  /** Optional active-element getter override (useful for unit tests). */
  getActiveElement?: () => HTMLElement | null;
}

const DEFAULT_NAV_SELECTOR =
  '[data-nav], button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isElementVisibleForNav(el: HTMLElement): boolean {
  if ((el as HTMLButtonElement).disabled) return false;
  if (el.getAttribute?.('aria-hidden') === 'true') return false;
  if (el.closest?.('[aria-hidden="true"], [inert]')) return false;
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (typeof el.getBoundingClientRect === 'function') {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) return false;
    }
  }
  return true;
}

function resolveNavScope(rootOpt?: ParentNode | (() => ParentNode | null)): ParentNode | null {
  const base = typeof rootOpt === 'function' ? rootOpt() : rootOpt ?? (typeof document !== 'undefined' ? document : null);
  if (!base || typeof base.querySelectorAll !== 'function') return null;
  const dialogs = Array.from(
    base.querySelectorAll('[data-gamepad-scope], [role="dialog"][aria-modal="true"]'),
  ) as HTMLElement[];
  for (let i = dialogs.length - 1; i >= 0; i--) {
    const dlg = dialogs[i];
    if (dlg.getAttribute?.('aria-hidden') !== 'true') {
      return dlg;
    }
  }
  return base;
}

function getFocusableCandidates(scope: ParentNode, selector: string): HTMLElement[] {
  const nodes = Array.from(scope.querySelectorAll(selector)) as HTMLElement[];
  return nodes.filter(isElementVisibleForNav);
}

function pickSpatialCandidate(
  candidates: HTMLElement[],
  current: HTMLElement | null,
  direction: GamepadNavDirection,
): HTMLElement | null {
  if (candidates.length === 0) return null;
  if (!current || !candidates.includes(current)) {
    const initial = candidates.find((c) => c.hasAttribute?.('data-nav-initial'));
    if (initial) return initial;
    return direction === 'up' || direction === 'left' ? candidates[candidates.length - 1] : candidates[0];
  }
  if (candidates.length === 1) return current;

  const curRect = typeof current.getBoundingClientRect === 'function' ? current.getBoundingClientRect() : null;
  const hasGeometry =
    curRect !== null &&
    (curRect.width > 0 || curRect.height > 0) &&
    candidates.some((c) => {
      if (c === current || typeof c.getBoundingClientRect !== 'function') return false;
      const r = c.getBoundingClientRect();
      return r.width > 0 || r.height > 0;
    });

  if (hasGeometry && curRect) {
    const cx = curRect.left + curRect.width * 0.5;
    const cy = curRect.top + curRect.height * 0.5;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;

    for (const cand of candidates) {
      if (cand === current || typeof cand.getBoundingClientRect !== 'function') continue;
      const r = cand.getBoundingClientRect();
      if (r.width <= 0 && r.height <= 0) continue;
      const tx = r.left + r.width * 0.5;
      const ty = r.top + r.height * 0.5;
      const dx = tx - cx;
      const dy = ty - cy;

      let primary = 0;
      let cross = 0;
      if (direction === 'up') {
        if (dy >= -2) continue;
        primary = -dy;
        cross = Math.abs(dx);
      } else if (direction === 'down') {
        if (dy <= 2) continue;
        primary = dy;
        cross = Math.abs(dx);
      } else if (direction === 'left') {
        if (dx >= -2) continue;
        primary = -dx;
        cross = Math.abs(dy);
      } else {
        if (dx <= 2) continue;
        primary = dx;
        cross = Math.abs(dy);
      }

      const score = primary + cross * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = cand;
      }
    }

    if (best) return best;
  }

  const idx = candidates.indexOf(current);
  const delta = direction === 'up' || direction === 'left' ? -1 : 1;
  return candidates[(idx + delta + candidates.length) % candidates.length];
}

function stepRangeInput(el: HTMLElement, direction: 'left' | 'right'): boolean {
  const input = el as HTMLInputElement;
  if (input.tagName?.toLowerCase() !== 'input' || input.type !== 'range') return false;
  const min = Number.isFinite(parseFloat(input.min)) ? parseFloat(input.min) : 0;
  const max = Number.isFinite(parseFloat(input.max)) ? parseFloat(input.max) : 100;
  const stepRaw = parseFloat(input.step);
  const step = Number.isFinite(stepRaw) && stepRaw > 0 ? stepRaw : (max - min) / 20;
  const current = Number.isFinite(parseFloat(input.value)) ? parseFloat(input.value) : min;
  const next = clamp(current + (direction === 'right' ? step : -step), min, max);
  if (Math.abs(next - current) < 1e-9) return true;

  const nativeSetter = Object.getOwnPropertyDescriptor(
    typeof HTMLInputElement !== 'undefined' ? HTMLInputElement.prototype : Object.prototype,
    'value',
  )?.set;
  if (nativeSetter) {
    nativeSetter.call(input, String(next));
  } else {
    input.value = String(next);
  }
  input.dispatchEvent?.(new Event('input', { bubbles: true }));
  input.dispatchEvent?.(new Event('change', { bubbles: true }));
  return true;
}

/**
 * Standalone DOM gamepad menu navigation controller ready to mount globally.
 * Maps D-Pad / Left Stick to spatial focus movement, A/Cross to click/activate,
 * and B/Circle to `onBack()` or Escape key dispatch.
 */
export class GamepadMenuNavigator {
  private readonly options: Required<
    Pick<GamepadMenuNavOptions, 'selector' | 'stickThreshold' | 'repeatDelayMs' | 'repeatIntervalMs' | 'stepRangeInputs'>
  > &
    GamepadMenuNavOptions;
  private active: boolean;
  private rafId = 0;
  private running = false;
  private prevConfirmDown = false;
  private prevBackDown = false;
  private heldDir: GamepadNavDirection | null = null;
  private dirPressedAtMs = 0;
  private lastDirFireMs = 0;

  constructor(options: GamepadMenuNavOptions = {}) {
    this.options = {
      selector: DEFAULT_NAV_SELECTOR,
      stickThreshold: 0.55,
      repeatDelayMs: 320,
      repeatIntervalMs: 120,
      stepRangeInputs: true,
      ...options,
    };
    this.active = options.active ?? true;
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.resetState();
    }
  }

  isActive(): boolean {
    return this.active;
  }

  resetState(): void {
    this.prevConfirmDown = false;
    this.prevBackDown = false;
    this.heldDir = null;
    this.dirPressedAtMs = 0;
    this.lastDirFireMs = 0;
  }

  start(): void {
    if (this.running || typeof requestAnimationFrame !== 'function') return;
    this.running = true;
    const loop = (now: number) => {
      if (!this.running) return;
      this.step(now);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    if (this.rafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.resetState();
  }

  private readGamepadList(override?: ReadonlyArray<GamepadLike | null | undefined>): ReadonlyArray<GamepadLike | null | undefined> {
    if (override) return override;
    if (this.options.getGamepads) return this.options.getGamepads();
    if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
      try {
        return Array.from(navigator.getGamepads() ?? []);
      } catch {
        return [];
      }
    }
    return [];
  }

  private getCurrentActiveElement(scope: ParentNode | null): HTMLElement | null {
    if (this.options.getActiveElement) return this.options.getActiveElement();
    const doc = (scope as { ownerDocument?: Document } | null)?.ownerDocument ??
      (typeof document !== 'undefined' ? document : null);
    return (doc?.activeElement as HTMLElement | null) ?? null;
  }

  step(
    nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now(),
    overrideGamepads?: ReadonlyArray<GamepadLike | null | undefined>,
  ): GamepadNavAction | null {
    if (!this.active) {
      this.resetState();
      return null;
    }

    const gp = selectActiveGamepad(this.readGamepadList(overrideGamepads), this.options.preferredIndex ?? null);
    if (!gp) {
      this.resetState();
      return null;
    }

    const axes = gp.axes ?? [];
    const buttons = gp.buttons ?? [];
    const isDown = (idx: number): boolean => {
      const b = buttons[idx];
      return Boolean(b && (b.pressed || (typeof b.value === 'number' && b.value >= 0.5)));
    };

    const confirmDown = isDown(0); // A / Cross
    const backDown = isDown(1); // B / Circle
    const confirmJustPressed = confirmDown && !this.prevConfirmDown;
    const backJustPressed = backDown && !this.prevBackDown;
    this.prevConfirmDown = confirmDown;
    this.prevBackDown = backDown;

    const thresh = this.options.stickThreshold;
    const axX = axes[0] ?? 0;
    const axY = axes[1] ?? 0;

    let dir: GamepadNavDirection | null = null;
    if (isDown(12) || axY <= -thresh) dir = 'up';
    else if (isDown(13) || axY >= thresh) dir = 'down';
    else if (isDown(14) || axX <= -thresh) dir = 'left';
    else if (isDown(15) || axX >= thresh) dir = 'right';

    const scope = resolveNavScope(this.options.root);

    if (backJustPressed) {
      const customHandled = Boolean(this.options.onBack?.());
      if (!customHandled && typeof KeyboardEvent !== 'undefined') {
        const activeEl = this.getCurrentActiveElement(scope);
        const evt = new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          bubbles: true,
          cancelable: true,
        });
        if (activeEl && typeof activeEl.dispatchEvent === 'function') {
          activeEl.dispatchEvent(evt);
        } else if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(evt);
        }
      }
      return { type: 'back', handled: true };
    }

    if (confirmJustPressed) {
      const activeEl = this.getCurrentActiveElement(scope);
      const candidates = scope ? getFocusableCandidates(scope, this.options.selector) : [];
      const target =
        activeEl && (candidates.length === 0 || candidates.includes(activeEl))
          ? activeEl
          : candidates[0] ?? activeEl;
      if (target) {
        const handled = Boolean(this.options.onActivate?.(target));
        if (!handled) {
          target.click?.();
        }
      }
      return { type: 'activate', target: target ?? null };
    }

    if (!dir) {
      this.heldDir = null;
      return null;
    }

    let shouldFire = false;
    if (dir !== this.heldDir) {
      this.heldDir = dir;
      this.dirPressedAtMs = nowMs;
      this.lastDirFireMs = nowMs;
      shouldFire = true;
    } else if (
      nowMs - this.dirPressedAtMs >= this.options.repeatDelayMs &&
      nowMs - this.lastDirFireMs >= this.options.repeatIntervalMs
    ) {
      this.lastDirFireMs = nowMs;
      shouldFire = true;
    }

    if (!shouldFire || !scope) return null;

    const activeEl = this.getCurrentActiveElement(scope);
    if (this.options.stepRangeInputs && activeEl && (dir === 'left' || dir === 'right')) {
      if (stepRangeInput(activeEl, dir)) {
        return { type: 'move', direction: dir, target: activeEl };
      }
    }

    const candidates = getFocusableCandidates(scope, this.options.selector);
    const next = pickSpatialCandidate(candidates, activeEl, dir);
    if (next) {
      next.focus?.();
      next.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
    return { type: 'move', direction: dir, target: next };
  }
}

/**
 * Mounts a global DOM gamepad menu navigation loop and returns a cleanup callback.
 */
export function mountGamepadMenuNavigation(options?: GamepadMenuNavOptions): () => void {
  const nav = new GamepadMenuNavigator(options);
  nav.start();
  return () => nav.stop();
}
