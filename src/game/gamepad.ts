export interface GamepadInputState {
  connected: boolean;
  gamepadId: string | null;
  throttle: number; // 0..1 analog (R2 / RT / buttons[7])
  brake: number; // 0..1 analog (L2 / LT / buttons[6] or Square/X fallback)
  steer: number; // -1..1 (Left Stick X / axes[0] or D-Pad Left/Right) with deadzone + smooth curve
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
  hasAnyInput: boolean; // True if any mapped trigger/stick/button is active
}

export interface GamepadConfig {
  steerDeadzone: number;
  cameraDeadzone: number;
  triggerDeadzone: number;
  specialButtonThreshold: number;
}

export const DEFAULT_GAMEPAD_CONFIG: GamepadConfig = {
  steerDeadzone: 0.1,
  cameraDeadzone: 0.12,
  triggerDeadzone: 0.04,
  specialButtonThreshold: 0.5,
};

export interface GamepadLike {
  index: number;
  id?: string;
  connected?: boolean;
  mapping?: string;
  axes?: ReadonlyArray<number>;
  buttons?: ReadonlyArray<{ pressed?: boolean; value?: number } | undefined>;
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
  hasAnyInput: false,
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Applies a deadzone and smooth non-linear response curve to a -1..+1 stick axis
 * so slight center drift never causes steering jitter while keeping full lock linear.
 */
export function applySteeringCurve(rawAxis: number, deadzone = DEFAULT_GAMEPAD_CONFIG.steerDeadzone): number {
  if (!Number.isFinite(rawAxis)) return 0;
  const clamped = clamp(rawAxis, -1, 1);
  const absVal = Math.abs(clamped);
  if (absVal <= deadzone) return 0;
  const normalized = clamp((absVal - deadzone) / (1 - deadzone), 0, 1);
  // Smooth racing-game blend: gentle precision near center, responsive sweep toward full lock
  const curved = 0.4 * normalized + 0.6 * normalized * normalized;
  return Math.sign(clamped) * curved;
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

  resetEdgeState(): void {
    this.prevSpecialPressed = false;
    this.prevCameraPressed = false;
    this.prevPausePressed = false;
    this.prevResetCamPressed = false;
    this.prevLbPressed = false;
    this.prevRbPressed = false;
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
    const triggerThrottle = readTriggerValue(buttons[7], this.config.triggerDeadzone);
    const triggerBrake = readTriggerValue(buttons[6], this.config.triggerDeadzone);
    const squareBrake = isBtnDown(2) ? 1 : 0;

    const throttle = triggerThrottle;
    const brake = Math.max(triggerBrake, squareBrake);

    const stickSteer = applySteeringCurve(axes[0] ?? 0, this.config.steerDeadzone);
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
      rbPressed;

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
