import { GamepadInputState } from './gamepad';
import { TouchControlsMode } from './settings';

export interface TouchInputState {
  active: boolean;
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1..1
  specialPressed: boolean;
  specialJustPressed: boolean;
  // Freecam flight axes (-1..1)
  moveForward: number;
  moveRight: number;
  moveUp: number;
}

export const NEUTRAL_TOUCH_STATE: TouchInputState = {
  active: false,
  throttle: 0,
  brake: 0,
  steer: 0,
  specialPressed: false,
  specialJustPressed: false,
  moveForward: 0,
  moveRight: 0,
  moveUp: 0,
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Converts a horizontal drag offset on the on-screen steering touchpad into a smooth
 * non-linear [-1, +1] steering value with a gentle center deadzone so straight-line
 * driving stays rock-steady while full lock remains snappy.
 */
export function computeTouchPadSteer(
  deltaX: number,
  maxRadiusPx: number,
  deadzone = 0.08,
): number {
  if (!Number.isFinite(deltaX) || !Number.isFinite(maxRadiusPx) || maxRadiusPx <= 0) {
    return 0;
  }
  const raw = clamp(deltaX / maxRadiusPx, -1, 1);
  const absVal = Math.abs(raw);
  if (absVal <= deadzone) return 0;
  const normalized = clamp((absVal - deadzone) / (1 - deadzone), 0, 1);
  const curved = 0.45 * normalized + 0.55 * normalized * normalized;
  return Math.sign(raw) * curved;
}

/**
 * Detects whether the current browser/device has primary touch or coarse-pointer capability.
 */
export function isTouchCapableDevice(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) {
      return true;
    }
  } catch {
    // Ignore matchMedia restrictions
  }
  if (typeof navigator !== 'undefined' && typeof navigator.maxTouchPoints === 'number') {
    if (navigator.maxTouchPoints > 0) return true;
  }
  return 'ontouchstart' in window;
}

/**
 * Resolves whether on-screen touch controls should currently be visible given the user's setting
 * and device touch capability.
 */
export function shouldShowTouchControls(
  mode: TouchControlsMode,
  isTouchDevice: boolean,
): boolean {
  if (mode === 'always') return true;
  if (mode === 'off') return false;
  return isTouchDevice;
}

/**
 * Cleanly blends keyboard, gamepad, and mobile touchpad driving inputs so any combination
 * works smoothly without fighting each other.
 */
export function blendAllDrivingInputs(
  keyboard: { throttle: number; brake: number; steer: number },
  gamepad: Pick<GamepadInputState, 'connected' | 'throttle' | 'brake' | 'steer'>,
  touch: Pick<TouchInputState, 'active' | 'throttle' | 'brake' | 'steer'>,
): { throttle: number; brake: number; steer: number } {
  const gpThrottle = gamepad.connected ? gamepad.throttle : 0;
  const gpBrake = gamepad.connected ? gamepad.brake : 0;
  const gpSteer = gamepad.connected ? gamepad.steer : 0;

  const tThrottle = touch.active ? touch.throttle : 0;
  const tBrake = touch.active ? touch.brake : 0;
  const tSteer = touch.active ? touch.steer : 0;

  const throttle = clamp(Math.max(keyboard.throttle, gpThrottle, tThrottle), 0, 1);
  const brake = clamp(Math.max(keyboard.brake, gpBrake, tBrake), 0, 1);

  const steer = clamp(keyboard.steer + gpSteer + tSteer, -1, 1);
  return { throttle, brake, steer };
}

/**
 * Zero-overhead mutable bridge read by RaceViewport's 60fps animation loop and written
 * directly by TouchControlsOverlay pointer handlers.
 */
class TouchInputStore {
  private state: TouchInputState = { ...NEUTRAL_TOUCH_STATE };

  private recomputeActive(): void {
    const s = this.state;
    s.active =
      s.throttle > 0 ||
      s.brake > 0 ||
      s.steer !== 0 ||
      s.specialPressed ||
      s.specialJustPressed ||
      s.moveForward !== 0 ||
      s.moveRight !== 0 ||
      s.moveUp !== 0;
  }

  setThrottle(val: number): void {
    this.state.throttle = clamp(val, 0, 1);
    this.recomputeActive();
  }

  setBrake(val: number): void {
    this.state.brake = clamp(val, 0, 1);
    this.recomputeActive();
  }

  setSteer(val: number): void {
    this.state.steer = clamp(val, -1, 1);
    this.recomputeActive();
  }

  setSpecial(pressed: boolean): void {
    if (pressed && !this.state.specialPressed) {
      this.state.specialJustPressed = true;
    }
    this.state.specialPressed = pressed;
    this.recomputeActive();
  }

  setFreecamMove(moveForward: number, moveRight: number): void {
    this.state.moveForward = clamp(moveForward, -1, 1);
    this.state.moveRight = clamp(moveRight, -1, 1);
    this.recomputeActive();
  }

  setFreecamUp(moveUp: number): void {
    this.state.moveUp = clamp(moveUp, -1, 1);
    this.recomputeActive();
  }

  /**
   * Reads a snapshot of the current touch state and consumes the one-frame `specialJustPressed` edge.
   */
  consumeFrame(): TouchInputState {
    const snapshot: TouchInputState = { ...this.state };
    if (this.state.specialJustPressed) {
      this.state.specialJustPressed = false;
      this.recomputeActive();
    }
    return snapshot;
  }

  reset(): void {
    this.state = { ...NEUTRAL_TOUCH_STATE };
  }
}

export const touchInputStore = new TouchInputStore();
