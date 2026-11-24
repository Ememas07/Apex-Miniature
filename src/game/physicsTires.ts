import type { SetupPhysicsModifiers } from './carSetup';
import type { CarSimState } from './physics';
import {
  FourWheelTireState,
  SceneryTheme,
  TireCompound,
  TrackSurfaceType,
} from './types';

export function createInitialFourWheelTires(initialTemp = 72): FourWheelTireState {
  const mk = () => ({ wear: 100, temp: initialTemp, flatSpot: 0, graining: 0, load: 1.0 });
  return { fl: mk(), fr: mk(), rl: mk(), rr: mk() };
}

export function getCompoundModifiers(compound: TireCompound, trackWetness: number): {
  grip: number;
  wearRate: number;
  optimalTemp: number;
} {
  const wetPenalty = trackWetness;
  switch (compound) {
    case 'soft':
      return {
        grip: 1.08 * (1 - wetPenalty * 0.40),
        wearRate: 1.45,
        optimalTemp: 95,
      };
    case 'medium':
      return {
        grip: 1.0 * (1 - wetPenalty * 0.34),
        wearRate: 1.0,
        optimalTemp: 88,
      };
    case 'hard':
      return {
        grip: 0.94 * (1 - wetPenalty * 0.28),
        wearRate: 0.65,
        optimalTemp: 82,
      };
    case 'wet':
      return {
        // Realistically ~12-14% less grip in heavy rain than dry softs (0.94 vs 1.08),
        // while massively outperforming slicks (0.65-0.68) in standing water.
        grip: 0.86 + wetPenalty * 0.08,
        wearRate: trackWetness < 0.2 ? 1.95 : 0.85,
        optimalTemp: 68,
      };
  }
}

/**
 * Classifies track surface type and returns grip, rolling drag, and gravel sinking resistance.
 */
export function classifyTrackSurface(
  lateralOffset: number,
  halfW: number,
  curvature: number,
  scenery: SceneryTheme,
  localWetness: number,
): {
  surface: TrackSurfaceType;
  gripMult: number;
  dragMult: number;
  gravelDecelMs2: number;
  sausageUpset: number;
} {
  const absLat = Math.abs(lateralOffset);
  const absCurv = Math.abs(curvature);
  const isInsideCorner =
    absCurv > 0.008 &&
    ((curvature > 0 && lateralOffset > 0) || (curvature < 0 && lateralOffset < 0));

  if (absLat <= halfW - 0.55) {
    return { surface: 'asphalt', gripMult: 1.0, dragMult: 1.0, gravelDecelMs2: 0, sausageUpset: 0 };
  }

  // Apex kerb & painted sausage kerb
  if (absLat <= halfW + 1.55) {
    if (isInsideCorner) {
      return {
        surface: 'kerb',
        gripMult: Math.max(0.74, 0.96 - localWetness * 0.18),
        dragMult: 0.985,
        gravelDecelMs2: 0,
        sausageUpset: 0,
      };
    }
    return { surface: 'asphalt', gripMult: 0.98, dragMult: 0.99, gravelDecelMs2: 0, sausageUpset: 0 };
  }

  // Sausage kerb on tight chicanes / inner apex beyond primary kerb
  if (isInsideCorner && absCurv > 0.024 && absLat <= halfW + 2.35) {
    return {
      surface: 'sausage-kerb',
      gripMult: Math.max(0.60, 0.78 - localWetness * 0.18),
      dragMult: 0.94,
      gravelDecelMs2: 0,
      sausageUpset: 1.0,
    };
  }

  // Street/stadium circuits have painted concrete runoff
  if (scenery === 'street-night' || scenery === 'stadium') {
    return {
      surface: 'concrete-runoff',
      gripMult: Math.max(0.66, 0.86 - localWetness * 0.16),
      dragMult: 0.93,
      gravelDecelMs2: 0,
      sausageUpset: 0,
    };
  }

  // Wet astroturf strip just outside kerbs on modern circuits (ice-like when wet)
  if (absLat <= halfW + 2.85) {
    return {
      surface: 'astroturf',
      gripMult: localWetness > 0.18 ? Math.max(0.36, 0.72 - localWetness * 0.42) : 0.79,
      dragMult: 0.90,
      gravelDecelMs2: 0,
      sausageUpset: 0,
    };
  }

  // Outer gravel traps on high-curvature corners in desert / forest / parkland tracks
  const isOutsideCorner =
    absCurv > 0.014 &&
    ((curvature > 0 && lateralOffset < 0) || (curvature < 0 && lateralOffset > 0));
  if (isOutsideCorner && (scenery === 'desert' || scenery === 'forest' || scenery === 'parkland')) {
    const depthRatio = Math.min(1, (absLat - (halfW + 2.85)) / 4.0);
    return {
      surface: 'gravel',
      gripMult: 0.48,
      dragMult: 0.64 - depthRatio * 0.10,
      gravelDecelMs2: 4.5 + depthRatio * 5.0,
      sausageUpset: 0.25,
    };
  }

  // Standard grass runoff
  return {
    surface: 'grass',
    gripMult: Math.max(0.40, 0.60 - localWetness * 0.20),
    dragMult: 0.74,
    gravelDecelMs2: 1.2,
    sausageUpset: 0,
  };
}

/**
 * Computes per-wheel grip scalar combining wear, thermal window, graining, and flat-spots.
 */
export function computeWheelGripFactor(
  w: { wear: number; temp: number; flatSpot: number; graining: number },
  optimalTemp: number,
): number {
  const tempDelta = w.temp - optimalTemp;
  // Cold tyres (< optimal - 8C) lose up to 28% grip; overheated tyres (> optimal + 10C) lose up to 30% grip
  const coldPenalty = tempDelta < -8 ? Math.min(0.28, ((-8 - tempDelta) / 36) * 0.28) : 0;
  const hotPenalty = tempDelta > 10 ? Math.min(0.30, ((tempDelta - 10) / 30) * 0.30) : 0;
  const wFactor = 0.70 + 0.30 * Math.pow(w.wear / 100, 0.72);
  return Math.max(0.45, wFactor * (1 - coldPenalty - hotPenalty - w.graining * 0.11 - w.flatSpot * 0.12));
}

export interface BrakeThermalStepParams {
  car: CarSimState;
  brake: number;
  brakeBase: number;
  effectiveMassKg: number;
  setupMod: SetupPhysicsModifiers;
  compoundGrip: number;
  offTrackGrip: number;
  crestLoadFactor: number;
  trackTempC: number;
  effectiveWetness: number;
  isFormula: boolean;
  isProto: boolean;
  fAeroDragN: number;
  fRollN: number;
  dt: number;
}

/**
 * Steps brake disc thermal model (cold bite, hot fade, ABS lock-up) and applies braking deceleration.
 */
export function stepBrakeThermalAndLockup(p: BrakeThermalStepParams): void {
  const { car, brake, setupMod, dt } = p;
  const brakeBiasF = setupMod.brakeBiasFront;
  const brakeBiasR = 1 - brakeBiasF;
  const brakeHeatPower = brake * car.speed * (p.isFormula ? 3.2 : p.isProto ? 2.9 : 2.5);
  const brakeAmbient = Math.max(25, p.trackTempC + 10);
  const brakeCoolRate = (0.014 + car.speed * 0.00125) * (1 + p.effectiveWetness * 0.40);
  const curBTF = car.brakeTempFront ?? 240;
  const curBTR = car.brakeTempRear ?? 220;
  const nextBTF = Math.max(
    brakeAmbient,
    Math.min(1020, curBTF + (brakeHeatPower * brakeBiasF * 1.15 - (curBTF - brakeAmbient) * brakeCoolRate) * dt),
  );
  const nextBTR = Math.max(
    brakeAmbient,
    Math.min(1020, curBTR + (brakeHeatPower * brakeBiasR * 1.15 - (curBTR - brakeAmbient) * brakeCoolRate) * dt),
  );
  car.brakeTempFront = nextBTF;
  car.brakeTempRear = nextBTR;

  const avgBrakeTemp = nextBTF * brakeBiasF + nextBTR * brakeBiasR;
  // Cold brakes (<240C) lose up to 38% stopping power; overheated brakes (>680C) suffer up to 45% fade
  const coldBrakeEff = avgBrakeTemp < 240 ? 0.62 + 0.38 * Math.max(0, (avgBrakeTemp - 50) / 190) : 1.0;
  const hotFadeLoss = avgBrakeTemp > 680 ? Math.min(0.45, ((avgBrakeTemp - 680) / 260) * 0.45) : 0;
  car.brakeFade = Math.min(1, hotFadeLoss / 0.45);
  const brakeThermalEff = coldBrakeEff * (1 - hotFadeLoss);

  let lockupIntensity = 0;
  if (brake > 0) {
    const absLvl = car.absLevel ?? 'low';
    const absMargin = absLvl === 'high' ? 1.18 : absLvl === 'low' ? 0.96 : 0.74;
    const lockThreshold =
      absMargin *
      p.compoundGrip *
      Math.max(0.65, p.offTrackGrip) *
      Math.pow(p.crestLoadFactor, 0.5) *
      (1 - Math.abs(brakeBiasF - 0.56) * 1.1);
    if (car.speed > 14 && brake > lockThreshold && absLvl !== 'high') {
      lockupIntensity = Math.min(1, (brake - lockThreshold) / Math.max(0.15, 1.05 - lockThreshold));
    }
    // Locked wheels lose peak friction slightly and scrub flat-spots onto front/rear tires
    const lockupDecelPenalty = 1 - lockupIntensity * 0.16;
    const fBrakeN =
      p.effectiveMassKg *
        p.brakeBase *
        p.compoundGrip *
        brakeThermalEff *
        lockupDecelPenalty *
        Math.pow(p.crestLoadFactor, 0.4) *
        brake +
      p.fAeroDragN +
      p.fRollN;
    car.speed = Math.max(0, car.speed - (fBrakeN / p.effectiveMassKg) * dt);
  }
  car.brakeLockupIntensity = lockupIntensity;
}

export interface FourWheelTireStepParams {
  car: CarSimState;
  tState: FourWheelTireState;
  steerInput: number;
  speedNorm: number;
  rYaw: number;
  brake: number;
  throttle: number;
  crestLoadFactor: number;
  isFE: boolean;
  trackTempC: number;
  efficiencyAttr: number;
  compoundMod: { grip: number; wearRate: number; optimalTemp: number };
  setupMod: SetupPhysicsModifiers;
  effectiveWetness: number;
  puddleIntensity: number;
  dt: number;
}

/**
 * Updates per-corner 4-wheel tire wear, thermal equilibrium, graining, and lock-up flat spots.
 */
export function stepFourWheelTireDynamics(p: FourWheelTireStepParams): void {
  const { car, tState, compoundMod, setupMod, dt } = p;
  const efficiencyFactor = 1.25 - (p.efficiencyAttr / 100) * 0.55;
  const cornerLoad = Math.abs(p.steerInput) * p.speedNorm;
  const latShift = Math.max(-0.45, Math.min(0.45, (car.speed * p.rYaw) / 36.0)); // + = turning right (loads left tires)
  const longShift = Math.max(-0.35, Math.min(0.35, p.brake * 0.30 - p.throttle * 0.18));
  const fBaseLoad = (1.0 + longShift) * p.crestLoadFactor;
  const rBaseLoad = (1.0 - longShift) * p.crestLoadFactor;
  const loads = {
    fl: Math.max(0.25, fBaseLoad * (1.0 + latShift)),
    fr: Math.max(0.25, fBaseLoad * (1.0 - latShift)),
    rl: Math.max(0.25, rBaseLoad * (1.0 + latShift)),
    rr: Math.max(0.25, rBaseLoad * (1.0 - latShift)),
  };

  const lockup = car.brakeLockupIntensity ?? 0;
  const rearWheelspin = p.throttle > 0.82 && car.speed < 28 && !p.isFE ? (p.throttle - 0.82) * 2.5 : 0;
  const trackTempBias = (p.trackTempC - 26) * 0.45;
  const baseWearStep =
    (0.014 + cornerLoad * 0.045 + car.understeerFactor * 0.04) * compoundMod.wearRate * efficiencyFactor;

  const updateWheel = (
    w: { wear: number; temp: number; flatSpot: number; graining: number; load: number },
    load: number,
    isFront: boolean,
  ) => {
    w.load = load;
    const heatMult = isFront ? setupMod.frontTireHeatMult : setupMod.rearTireHeatMult;
    const wearMult = isFront ? setupMod.frontTireWearMult : setupMod.rearTireWearMult;
    const extraScrub = isFront
      ? car.understeerFactor * 0.55 + lockup * 0.9
      : rearWheelspin * 0.65 + car.lateralSlip * 0.35;

    const overheatWearMult =
      w.temp > compoundMod.optimalTemp + 12
        ? 1 + Math.min(0.65, ((w.temp - (compoundMod.optimalTemp + 12)) / 25) * 0.65)
        : 1.0;
    w.wear = Math.max(
      5,
      w.wear - baseWearStep * (0.65 + 0.35 * load + extraScrub * 0.45) * wearMult * overheatWearMult * dt,
    );

    // Realistic tyre thermal equilibrium: cools down on straights, warms through cornering energy, scrub & radiant brake heat
    const brakeTempForAxle = isFront ? (car.brakeTempFront ?? 220) : (car.brakeTempRear ?? 200);
    const brakeRadiantHeat = Math.max(0, (brakeTempForAxle - 220) / 500) * 9.5;
    const baselineCruiseTemp = Math.max(p.trackTempC + 16, compoundMod.optimalTemp - 22);
    const targetWheelTemp =
      baselineCruiseTemp +
      trackTempBias +
      (cornerLoad * 36 * load + extraScrub * 34 + (car.speed / 92) * 14) * heatMult +
      brakeRadiantHeat -
      p.effectiveWetness * 16 -
      p.puddleIntensity * 10;

    // Slow thermal transfer: ~10-20s to build temperature, ~20-35s to cool down
    const heating = targetWheelTemp > w.temp;
    const thermalRate = heating
      ? 0.055 + load * 0.038 + extraScrub * 0.055
      : 0.028 + (car.speed / 100) * 0.022 + p.effectiveWetness * 0.04;
    w.temp += (targetWheelTemp - w.temp) * Math.min(1, dt * thermalRate);

    // Lock-up accumulates flat-spot on fronts (or rears if rear-biased)
    if (
      lockup > 0.15 &&
      ((isFront && setupMod.brakeBiasFront >= 0.52) || (!isFront && setupMod.brakeBiasFront < 0.52))
    ) {
      w.flatSpot = Math.min(1, w.flatSpot + lockup * 0.065 * dt);
    }
    // Cold graining if pushing hard while tire is significantly below operating window
    if (w.temp < compoundMod.optimalTemp - 14 && cornerLoad > 0.45) {
      w.graining = Math.min(1, w.graining + 0.032 * cornerLoad * dt);
    } else if (w.temp >= compoundMod.optimalTemp - 6) {
      w.graining = Math.max(0, w.graining - 0.028 * dt);
    }
  };

  updateWheel(tState.fl, loads.fl, true);
  updateWheel(tState.fr, loads.fr, true);
  updateWheel(tState.rl, loads.rl, false);
  updateWheel(tState.rr, loads.rr, false);

  car.tireWear = (tState.fl.wear + tState.fr.wear + tState.rl.wear + tState.rr.wear) * 0.25;
  car.tireTemp = (tState.fl.temp + tState.fr.temp + tState.rl.temp + tState.rr.temp) * 0.25;
  car.flatSpotVibration = Math.max(
    tState.fl.flatSpot,
    tState.fr.flatSpot,
    tState.rl.flatSpot,
    tState.rr.flatSpot,
  );
}
