import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Smartphone, Zap } from 'lucide-react';
import { getGameSettings, subscribeGameSettings, TouchSteerStyle } from '../game/settings';
import { computeTouchPadSteer, touchInputStore } from '../game/touchControls';

interface TouchControlsOverlayProps {
  visible: boolean;
  steerStyle: TouchSteerStyle;
  isFreecam: boolean;
  isAiRace: boolean;
  specialLabel?: string;
  specialActive?: boolean;
  specialCharge?: number;
  dimmedByGamepad?: boolean;
}

export function TouchControlsOverlay({
  visible,
  steerStyle,
  isFreecam,
  isAiRace,
  specialLabel = 'BOOST',
  specialActive = false,
  specialCharge,
  dimmedByGamepad = false,
}: TouchControlsOverlayProps) {
  // Visual feedback states (live steering/pedals write straight into touchInputStore at 60fps)
  const [padThumbX, setPadThumbX] = useState(0); // -1..1 visual offset
  const [padEngaged, setPadEngaged] = useState(false);
  const [leftHeld, setLeftHeld] = useState(false);
  const [rightHeld, setRightHeld] = useState(false);
  const [gasHeld, setGasHeld] = useState(false);
  const [brakeHeld, setBrakeHeld] = useState(false);
  const [specialHeld, setSpecialHeld] = useState(false);
  const [tiltValue, setTiltValue] = useState(0);
  const [tiltNeedsPerm, setTiltNeedsPerm] = useState(false);
  const [touchOpacity, setTouchOpacity] = useState(() => getGameSettings().touchOpacity);
  const [autoAccel, setAutoAccel] = useState(() => getGameSettings().touchAutoAccel);

  useEffect(() => {
    return subscribeGameSettings((next) => {
      setTouchOpacity(next.touchOpacity);
      setAutoAccel(next.touchAutoAccel);
    });
  }, []);

  // Freecam virtual stick visual state
  const [flightStick, setFlightStick] = useState<{ x: number; y: number; active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  });
  const [ascendHeld, setAscendHeld] = useState(false);
  const [descendHeld, setDescendHeld] = useState(false);

  // Per-zone active pointer IDs for rock-solid multi-touch independence
  const steerPadPointerRef = useRef<number | null>(null);
  const steerLeftPointerRef = useRef<number | null>(null);
  const steerRightPointerRef = useRef<number | null>(null);
  const gasPointerRef = useRef<number | null>(null);
  const brakePointerRef = useRef<number | null>(null);
  const specialPointerRef = useRef<number | null>(null);
  const flightPointerRef = useRef<number | null>(null);
  const ascendPointerRef = useRef<number | null>(null);
  const descendPointerRef = useRef<number | null>(null);

  const steerPadRef = useRef<HTMLDivElement | null>(null);
  const flightPadRef = useRef<HTMLDivElement | null>(null);

  const releaseAllControls = useCallback(() => {
    steerPadPointerRef.current = null;
    steerLeftPointerRef.current = null;
    steerRightPointerRef.current = null;
    gasPointerRef.current = null;
    brakePointerRef.current = null;
    specialPointerRef.current = null;
    flightPointerRef.current = null;
    ascendPointerRef.current = null;
    descendPointerRef.current = null;

    setPadThumbX(0);
    setPadEngaged(false);
    setLeftHeld(false);
    setRightHeld(false);
    setGasHeld(false);
    setBrakeHeld(false);
    setSpecialHeld(false);
    setFlightStick({ x: 0, y: 0, active: false });
    setAscendHeld(false);
    setDescendHeld(false);

    touchInputStore.reset();
  }, []);

  // Reset all touch inputs on visibility change, mode switch, blur, or unmount
  useEffect(() => {
    if (!visible) {
      releaseAllControls();
      return;
    }
    const onBlurOrHide = () => releaseAllControls();
    window.addEventListener('blur', onBlurOrHide);
    document.addEventListener('visibilitychange', onBlurOrHide);
    return () => {
      window.removeEventListener('blur', onBlurOrHide);
      document.removeEventListener('visibilitychange', onBlurOrHide);
      releaseAllControls();
    };
  }, [visible, isFreecam, steerStyle, releaseAllControls]);

  // Auto-Accelerate assist (keeps throttle pressed unless braking)
  useEffect(() => {
    if (!visible || isFreecam || isAiRace) return;
    if (autoAccel) {
      touchInputStore.setThrottle(brakeHeld ? 0 : 1);
    } else if (!gasHeld) {
      touchInputStore.setThrottle(0);
    }
  }, [visible, isFreecam, isAiRace, autoAccel, brakeHeld, gasHeld]);

  // Gyroscope / Tilt Steering when steerStyle === 'gyro'
  useEffect(() => {
    if (!visible || isFreecam || isAiRace || steerStyle !== 'gyro') {
      setTiltValue(0);
      return;
    }
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (typeof DOE?.requestPermission === 'function') {
      setTiltNeedsPerm(true);
    }
    const onOrientation = (ev: DeviceOrientationEvent) => {
      const isLandscape = window.innerWidth > window.innerHeight;
      const rawDeg = isLandscape ? ev.beta ?? 0 : ev.gamma ?? 0;
      const clamped = Math.max(-35, Math.min(35, rawDeg));
      const norm = Math.abs(clamped) < 3.5 ? 0 : clamped / 32;
      const steerVal = Math.max(-1, Math.min(1, norm));
      setTiltValue(steerVal);
      touchInputStore.setSteer(steerVal);
    };
    window.addEventListener('deviceorientation', onOrientation);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      touchInputStore.setSteer(0);
    };
  }, [visible, isFreecam, isAiRace, steerStyle]);

  const requestTiltPermission = async () => {
    try {
      const DOE = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (typeof DOE?.requestPermission === 'function') {
        const res = await DOE.requestPermission();
        if (res === 'granted') setTiltNeedsPerm(false);
      }
    } catch {
      // ignore
    }
  };

  // --- Analog Steering Touchpad Handlers ---
  const updateSteerPadFromClientX = useCallback((clientX: number) => {
    const el = steerPadRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width * 0.5;
    const maxRadius = Math.max(24, rect.width * 0.42);
    const deltaX = clientX - centerX;
    const clampedRatio = Math.max(-1, Math.min(1, deltaX / maxRadius));
    const steerVal = computeTouchPadSteer(deltaX, maxRadius, 0.08);
    setPadThumbX(clampedRatio);
    touchInputStore.setSteer(steerVal);
  }, []);

  const handleSteerPadDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (steerPadPointerRef.current !== null && steerPadPointerRef.current !== e.pointerId) return;
    steerPadPointerRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore synthetic events
    }
    setPadEngaged(true);
    updateSteerPadFromClientX(e.clientX);
  };

  const handleSteerPadMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (steerPadPointerRef.current !== e.pointerId) return;
    e.stopPropagation();
    updateSteerPadFromClientX(e.clientX);
  };

  const handleSteerPadUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (steerPadPointerRef.current !== e.pointerId) return;
    e.stopPropagation();
    steerPadPointerRef.current = null;
    setPadEngaged(false);
    setPadThumbX(0);
    touchInputStore.setSteer(0);
  };

  // --- Split Left / Right Steering Button Handlers ---
  const syncButtonSteer = (left: boolean, right: boolean) => {
    touchInputStore.setSteer((right ? 1 : 0) - (left ? 1 : 0));
  };

  const handleLeftDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    steerLeftPointerRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    setLeftHeld(true);
    syncButtonSteer(true, steerRightPointerRef.current !== null);
  };

  const handleLeftUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (steerLeftPointerRef.current !== e.pointerId) return;
    e.stopPropagation();
    steerLeftPointerRef.current = null;
    setLeftHeld(false);
    syncButtonSteer(false, steerRightPointerRef.current !== null);
  };

  const handleRightDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    steerRightPointerRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    setRightHeld(true);
    syncButtonSteer(steerLeftPointerRef.current !== null, true);
  };

  const handleRightUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (steerRightPointerRef.current !== e.pointerId) return;
    e.stopPropagation();
    steerRightPointerRef.current = null;
    setRightHeld(false);
    syncButtonSteer(steerLeftPointerRef.current !== null, false);
  };

  // --- Pedal & Special Handlers ---
  const handleGasDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    gasPointerRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    setGasHeld(true);
    touchInputStore.setThrottle(1);
  };

  const handleGasUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (gasPointerRef.current !== e.pointerId) return;
    e.stopPropagation();
    gasPointerRef.current = null;
    setGasHeld(false);
    touchInputStore.setThrottle(0);
  };

  const handleBrakeDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    brakePointerRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    setBrakeHeld(true);
    touchInputStore.setBrake(1);
  };

  const handleBrakeUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (brakePointerRef.current !== e.pointerId) return;
    e.stopPropagation();
    brakePointerRef.current = null;
    setBrakeHeld(false);
    touchInputStore.setBrake(0);
  };

  const handleSpecialDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    specialPointerRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    setSpecialHeld(true);
    touchInputStore.setSpecial(true);
  };

  const handleSpecialUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (specialPointerRef.current !== e.pointerId) return;
    e.stopPropagation();
    specialPointerRef.current = null;
    setSpecialHeld(false);
    touchInputStore.setSpecial(false);
  };

  // --- Freecam Virtual Flight Stick Handlers ---
  const updateFlightStick = useCallback((clientX: number, clientY: number) => {
    const el = flightPadRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxR = Math.max(24, Math.min(rect.width, rect.height) * 0.42);
    let dx = (clientX - cx) / maxR;
    let dy = (clientY - cy) / maxR;
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }
    setFlightStick({ x: dx, y: dy, active: true });
    touchInputStore.setFreecamMove(-dy, dx);
  }, []);

  const handleFlightDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    flightPointerRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    updateFlightStick(e.clientX, e.clientY);
  };

  const handleFlightMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (flightPointerRef.current !== e.pointerId) return;
    e.stopPropagation();
    updateFlightStick(e.clientX, e.clientY);
  };

  const handleFlightUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (flightPointerRef.current !== e.pointerId) return;
    e.stopPropagation();
    flightPointerRef.current = null;
    setFlightStick({ x: 0, y: 0, active: false });
    touchInputStore.setFreecamMove(0, 0);
  };

  const syncFreecamUp = (up: boolean, down: boolean) => {
    touchInputStore.setFreecamUp((up ? 1 : 0) - (down ? 1 : 0));
  };

  const handleAscendDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    ascendPointerRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    setAscendHeld(true);
    syncFreecamUp(true, descendPointerRef.current !== null);
  };

  const handleAscendUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (ascendPointerRef.current !== e.pointerId) return;
    e.stopPropagation();
    ascendPointerRef.current = null;
    setAscendHeld(false);
    syncFreecamUp(false, descendPointerRef.current !== null);
  };

  const handleDescendDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    descendPointerRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    setDescendHeld(true);
    syncFreecamUp(ascendPointerRef.current !== null, true);
  };

  const handleDescendUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (descendPointerRef.current !== e.pointerId) return;
    e.stopPropagation();
    descendPointerRef.current = null;
    setDescendHeld(false);
    syncFreecamUp(ascendPointerRef.current !== null, false);
  };

  if (!visible) return null;
  // In AI Race spectate mode (not freecam), user orbits via direct canvas drag/pinch — no driving pedals needed
  if (isAiRace && !isFreecam) return null;

  const opacityClass = dimmedByGamepad ? 'opacity-35 hover:opacity-90 transition-opacity' : 'opacity-100';

  if (isFreecam) {
    return (
      <div
        data-testid="touch-controls-freecam"
        className={`fixed inset-x-0 bottom-0 z-25 pointer-events-none flex items-end justify-between px-4 pb-4 sm:px-6 sm:pb-6 ${opacityClass}`}
        style={{
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
          paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
        }}
      >
        {/* Left Virtual Flight Stick */}
        <div
          ref={flightPadRef}
          onPointerDown={handleFlightDown}
          onPointerMove={handleFlightMove}
          onPointerUp={handleFlightUp}
          onPointerCancel={handleFlightUp}
          role="slider"
          aria-label="Freecam Flight Stick"
          className={`pointer-events-auto touch-none select-none relative w-32 h-32 sm:w-36 sm:h-36 rounded-full bg-[#0b0e13]/72 backdrop-blur-sm border ${
            flightStick.active ? 'border-sky-400/80 shadow-lg shadow-sky-950/50' : 'border-white/20'
          } flex items-center justify-center`}
        >
          <div className="w-16 h-16 rounded-full border border-white/10 pointer-events-none" />
          <div
            className="absolute w-12 h-12 rounded-full bg-sky-500/80 border border-sky-200/70 shadow-lg pointer-events-none"
            style={{
              transform: `translate(${flightStick.x * 42}px, ${flightStick.y * 42}px)`,
            }}
          />
          <span className="absolute bottom-2 text-[9px] font-display font-bold uppercase tracking-widest text-slate-300 pointer-events-none">
            Move
          </span>
        </div>

        {/* Right Altitude Up / Down Controls */}
        <div className="pointer-events-auto flex flex-col gap-2.5">
          <button
            type="button"
            tabIndex={-1}
            onPointerDown={handleAscendDown}
            onPointerUp={handleAscendUp}
            onPointerCancel={handleAscendUp}
            aria-label="Fly Up"
            className={`touch-none select-none w-16 h-14 rounded-xl border flex flex-col items-center justify-center gap-0.5 text-[10px] font-display font-bold uppercase transition-colors ${
              ascendHeld
                ? 'bg-sky-500/80 border-sky-300 text-white'
                : 'bg-[#0b0e13]/75 border-white/20 text-slate-200'
            }`}
          >
            <ArrowUp className="w-4 h-4" />
            <span>Up</span>
          </button>
          <button
            type="button"
            tabIndex={-1}
            onPointerDown={handleDescendDown}
            onPointerUp={handleDescendUp}
            onPointerCancel={handleDescendUp}
            aria-label="Fly Down"
            className={`touch-none select-none w-16 h-14 rounded-xl border flex flex-col items-center justify-center gap-0.5 text-[10px] font-display font-bold uppercase transition-colors ${
              descendHeld
                ? 'bg-sky-500/80 border-sky-300 text-white'
                : 'bg-[#0b0e13]/75 border-white/20 text-slate-200'
            }`}
          >
            <ArrowDown className="w-4 h-4" />
            <span>Down</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="touch-controls-overlay"
      className={`fixed inset-x-0 bottom-0 z-25 pointer-events-none flex items-end justify-between gap-3 px-3 pb-3 sm:px-6 sm:pb-5 ${opacityClass}`}
      style={{
        opacity: dimmedByGamepad ? 0.35 : touchOpacity,
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
      }}
    >
      {/* BOTTOM-LEFT: Steering Touchpad OR Split Steering Buttons OR Gyroscope Tilt */}
      <div className="pointer-events-auto flex items-end">
        {steerStyle === 'gyro' ? (
          <div className="rounded-2xl bg-[#0b0e13]/75 backdrop-blur-sm border border-sky-400/40 px-4 py-3 flex flex-col items-center gap-1.5 shadow-xl min-w-[144px]">
            <div className="flex items-center gap-1.5 text-[10px] font-display font-bold uppercase tracking-wider text-sky-300">
              <Smartphone className="w-3.5 h-3.5" />
              Gyro Tilt
            </div>
            <div className="w-28 h-2 rounded-full bg-slate-800 relative overflow-hidden">
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/30" />
              <div
                className="absolute top-0 bottom-0 bg-sky-400 rounded-full"
                style={{
                  left: tiltValue >= 0 ? '50%' : `${50 + tiltValue * 50}%`,
                  width: `${Math.abs(tiltValue) * 50}%`,
                }}
              />
            </div>
            {tiltNeedsPerm ? (
              <button
                type="button"
                onClick={requestTiltPermission}
                className="px-2 py-0.5 rounded bg-sky-500 text-slate-950 font-bold text-[10px] uppercase cursor-pointer"
              >
                Enable Tilt Sensor
              </button>
            ) : (
              <span className="text-[9px] font-mono text-slate-400">
                {tiltValue >= 0 ? '+' : ''}
                {Math.round(tiltValue * 100)}%
              </span>
            )}
          </div>
        ) : steerStyle === 'pad' ? (
          <div
            ref={steerPadRef}
            data-testid="touch-steer-pad"
            role="slider"
            aria-label="Steering Touchpad"
            aria-valuemin={-100}
            aria-valuemax={100}
            aria-valuenow={Math.round(padThumbX * 100)}
            onPointerDown={handleSteerPadDown}
            onPointerMove={handleSteerPadMove}
            onPointerUp={handleSteerPadUp}
            onPointerCancel={handleSteerPadUp}
            className={`touch-none select-none relative w-44 sm:w-56 h-24 sm:h-28 rounded-2xl bg-[#0b0e13]/72 backdrop-blur-sm border transition-colors flex items-center justify-center overflow-hidden shadow-2xl ${
              padEngaged ? 'border-sky-400/80 bg-[#0e1522]/85' : 'border-white/20'
            }`}
          >
            {/* Subtle track rail & center mark */}
            <div className="absolute inset-x-5 h-1.5 rounded-full bg-white/10 pointer-events-none" />
            <div className="absolute top-3 bottom-3 w-px bg-white/20 pointer-events-none" />

            {/* Live directional deflection fill */}
            <div
              className="absolute h-1.5 rounded-full bg-sky-400/85 pointer-events-none"
              style={{
                left: padThumbX >= 0 ? '50%' : `${50 + padThumbX * 42}%`,
                width: `${Math.abs(padThumbX) * 42}%`,
              }}
            />

            {/* Left / Right hints */}
            <ChevronLeft
              className={`absolute left-2.5 w-5 h-5 pointer-events-none transition-colors ${
                padThumbX < -0.15 ? 'text-sky-300' : 'text-slate-400/70'
              }`}
            />
            <ChevronRight
              className={`absolute right-2.5 w-5 h-5 pointer-events-none transition-colors ${
                padThumbX > 0.15 ? 'text-sky-300' : 'text-slate-400/70'
              }`}
            />

            {/* Draggable steering puck */}
            <div
              className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 flex items-center justify-center shadow-lg pointer-events-none transition-colors ${
                padEngaged
                  ? 'bg-sky-500/85 border-white text-white scale-105'
                  : 'bg-[#1a2232]/90 border-white/35 text-slate-200'
              }`}
              style={{
                transform: `translateX(${padThumbX * 64}px)`,
              }}
            >
              <span className="text-[10px] font-display font-extrabold tracking-wider">STEER</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              tabIndex={-1}
              data-testid="touch-steer-left"
              aria-label="Steer Left"
              onPointerDown={handleLeftDown}
              onPointerUp={handleLeftUp}
              onPointerCancel={handleLeftUp}
              className={`touch-none select-none w-[74px] h-[74px] sm:w-20 sm:h-20 rounded-2xl border backdrop-blur-sm flex items-center justify-center transition-colors shadow-xl ${
                leftHeld
                  ? 'bg-sky-500/85 border-sky-200 text-white'
                  : 'bg-[#0b0e13]/72 border-white/20 text-slate-100'
              }`}
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              data-testid="touch-steer-right"
              aria-label="Steer Right"
              onPointerDown={handleRightDown}
              onPointerUp={handleRightUp}
              onPointerCancel={handleRightUp}
              className={`touch-none select-none w-[74px] h-[74px] sm:w-20 sm:h-20 rounded-2xl border backdrop-blur-sm flex items-center justify-center transition-colors shadow-xl ${
                rightHeld
                  ? 'bg-sky-500/85 border-sky-200 text-white'
                  : 'bg-[#0b0e13]/72 border-white/20 text-slate-100'
              }`}
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          </div>
        )}
      </div>

      {/* BOTTOM-RIGHT: Special Trigger + Brake & Gas Pedals */}
      <div className="pointer-events-auto flex flex-col items-end gap-2 short:gap-1.5">
        {/* Class Special / Boost / Active Aero / Attack Mode trigger */}
        <button
          type="button"
          tabIndex={-1}
          data-testid="touch-special-btn"
          aria-label={specialLabel}
          onPointerDown={handleSpecialDown}
          onPointerUp={handleSpecialUp}
          onPointerCancel={handleSpecialUp}
          className={`touch-none select-none min-h-[44px] short:min-h-[34px] px-3.5 py-2 short:px-2.5 short:py-1 rounded-xl short:rounded-lg border backdrop-blur-sm flex items-center gap-1.5 text-xs short:text-[10px] font-display font-bold tracking-wider uppercase transition-colors shadow-lg ${
            specialActive || specialHeld
              ? 'bg-emerald-500/90 border-emerald-200 text-white shadow-emerald-950/60'
              : 'bg-[#0b0e13]/78 border-amber-400/45 text-amber-200'
          }`}
        >
          <Zap className="w-3.5 h-3.5 short:w-3 short:h-3 shrink-0" />
          <span className="whitespace-nowrap">{specialLabel}</span>
          {typeof specialCharge === 'number' && (
            <span className="font-telemetry text-[11px] short:text-[10px] opacity-90">{Math.round(specialCharge)}%</span>
          )}
        </button>

        {/* Pedals Row: Brake (left) + Gas (right) */}
        <div className="flex items-end gap-2.5">
          <button
            type="button"
            tabIndex={-1}
            data-testid="touch-brake-btn"
            aria-label="Brake or Reverse"
            onPointerDown={handleBrakeDown}
            onPointerUp={handleBrakeUp}
            onPointerCancel={handleBrakeUp}
            className={`touch-none select-none w-[70px] h-[78px] sm:w-20 sm:h-22 rounded-2xl border backdrop-blur-sm flex flex-col items-center justify-center gap-1 transition-colors shadow-xl ${
              brakeHeld
                ? 'bg-red-600/90 border-red-200 text-white scale-[0.98]'
                : 'bg-[#0b0e13]/75 border-red-500/40 text-red-200'
            }`}
          >
            <span className="font-display font-extrabold text-xs tracking-wider uppercase">Brake</span>
            <span className="text-[9px] text-red-200/75 font-mono">REV</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            data-testid="touch-gas-btn"
            aria-label="Throttle Gas"
            onPointerDown={handleGasDown}
            onPointerUp={handleGasUp}
            onPointerCancel={handleGasUp}
            className={`touch-none select-none w-[82px] h-[96px] sm:w-24 sm:h-28 rounded-2xl border backdrop-blur-sm flex flex-col items-center justify-center gap-1 transition-colors shadow-2xl ${
              gasHeld
                ? 'bg-emerald-500/90 border-emerald-200 text-white scale-[0.98]'
                : 'bg-[#0b0e13]/78 border-emerald-400/50 text-emerald-200'
            }`}
          >
            <span className="font-display font-extrabold text-sm tracking-wider uppercase">Gas</span>
            <span className="text-[9px] text-emerald-200/80 font-mono">ACCEL</span>
          </button>
        </div>
      </div>
    </div>
  );
}
