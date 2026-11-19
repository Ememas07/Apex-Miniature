export interface GamepadInputState {
  connected: boolean;
  gamepadId: string | null;
  throttle: number; // 0..1 analog (R2 / buttons[7])
  brake: number; // 0..1 analog (L2 / buttons[6])
  steer: number; // -1..1 (Left Stick X / axes[0]) with deadzone + smooth response curve
  cameraX: number; // -1..1 (Right Stick X / axes[2]) with deadzone
  cameraY: number; // -1..1 (Right Stick Y / axes[3]) with deadzone
  specialPressed: boolean; // Cross / X (buttons[0]) currently held
  specialJustPressed: boolean; // Rising edge of Cross / X (buttons[0]) — true for 1 poll only
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
  cameraX: 0,
  cameraY: 0,
  specialPressed: false,
  specialJustPressed: false,
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
  private attached = false;

  private readonly onConnected = (e: GamepadEvent): void => {
    const gp = e.gamepad;
    if (!gp) return;
    if (this.activeIndex === null || gp.mapping === 'standard') {
      this.activeIndex = gp.index;
      this.prevSpecialPressed = false;
    }
  };

  private readonly onDisconnected = (e: GamepadEvent): void => {
    const gp = e.gamepad;
    if (!gp) return;
    if (this.activeIndex === gp.index) {
      this.activeIndex = null;
      this.prevSpecialPressed = false;
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

  resetEdgeState(): void {
    this.prevSpecialPressed = false;
  }

  /**
   * Polls a provided gamepad list (or `navigator.getGamepads()` by default).
   * Always safe even if the browser lacks Gamepad API support or a controller disconnects mid-frame.
   */
  poll(overrideGamepads?: ReadonlyArray<GamepadLike | null | undefined>): GamepadInputState {
    let rawList: ReadonlyArray<GamepadLike | null | undefined>;
    if (overrideGamepads) {
      rawList = overrideGamepads;
    } else if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
      try {
        rawList = Array.from(navigator.getGamepads() ?? []);
      } catch {
        this.activeIndex = null;
        this.prevSpecialPressed = false;
        return { ...NEUTRAL_STATE };
      }
    } else {
      return { ...NEUTRAL_STATE };
    }

    const gp = selectActiveGamepad(rawList, this.activeIndex);
    if (!gp) {
      this.activeIndex = null;
      this.prevSpecialPressed = false;
      return { ...NEUTRAL_STATE };
    }

    if (this.activeIndex !== gp.index) {
      this.activeIndex = gp.index;
      this.prevSpecialPressed = false;
    }

    const axes = gp.axes ?? [];
    const buttons = gp.buttons ?? [];

    // PS4 / Standard Gamepad layout:
    // R2 = buttons[7] (analog 0..1), L2 = buttons[6] (analog 0..1)
    // Left Stick X = axes[0], Right Stick X/Y = axes[2], axes[3]
    // Cross / X = buttons[0] (edge-triggered toggle)
    const throttle = readTriggerValue(buttons[7], this.config.triggerDeadzone);
    const brake = readTriggerValue(buttons[6], this.config.triggerDeadzone);
    const steer = applySteeringCurve(axes[0] ?? 0, this.config.steerDeadzone);
    const cameraX = applyCameraStickAxis(axes[2] ?? 0, this.config.cameraDeadzone);
    const cameraY = applyCameraStickAxis(axes[3] ?? 0, this.config.cameraDeadzone);

    const crossBtn = buttons[0];
    const specialPressed = Boolean(
      crossBtn &&
        (crossBtn.pressed ||
          (typeof crossBtn.value === 'number' && crossBtn.value >= this.config.specialButtonThreshold)),
    );
    const specialJustPressed = specialPressed && !this.prevSpecialPressed;
    this.prevSpecialPressed = specialPressed;

    const hasAnyInput =
      throttle > 0 ||
      brake > 0 ||
      steer !== 0 ||
      cameraX !== 0 ||
      cameraY !== 0 ||
      specialPressed;

    return {
      connected: true,
      gamepadId: gp.id ?? null,
      throttle,
      brake,
      steer,
      cameraX,
      cameraY,
      specialPressed,
      specialJustPressed,
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
