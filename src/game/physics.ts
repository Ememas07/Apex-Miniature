import { CAR_CLASSES, getCarById } from './cars';
import { CompiledTrack, projectOntoTrack, sampleTrackAtT } from './tracks';
import {
  AIDifficulty,
  AIPersonality,
  CarClassId,
  CarSpec,
  DriverStandingsEntry,
  LiveryConfig,
  PitStrategy,
  TireCompound,
} from './types';

export interface ControlInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (left) .. +1 (right)
  specialPressed: boolean; // edge-triggered or held depending on class
}

export interface CarSimState {
  id: string;
  name: string;
  isPlayer: boolean;
  isHumanPeer: boolean;
  carSpec: CarSpec;
  livery: LiveryConfig;
  personality?: AIPersonality;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  heading: number; // radians; 0 = +Z, atan2(tx, tz)
  speed: number; // m/s forward scalar
  steerAngle: number; // visual wheel angle
  lap: number; // 1-indexed current lap
  trackT: number; // 0..1 normalized position
  prevTrackT: number;
  totalDistance: number; // laps + trackT
  lateralOffset: number;
  currentLapTime: number;
  bestLapTime: number | null;
  lastLapTime: number | null;
  totalTime: number;
  compound: TireCompound;
  tireWear: number; // 100 down to 0
  tireTemp: number; // Celsius (50..125)
  fuel: number; // 100 down to 0
  aeroDamage: number; // 0..100
  specialCharge: number; // 0..100
  specialActive: boolean;
  inSlipstream: boolean;
  understeerFactor: number; // 0..1
  warningCount: number;
  offTrackCooldown: number;
  penaltyTimeRemaining: number;
  inPitLane: boolean;
  pitBoxTimer: number;
  pitStopRemaining: number;
  pitSpeeding: boolean;
  pitStops: number;
  pitCooldown: number;
  pitStrategy: PitStrategy;
  flashingHeadlights: boolean;
  finished: boolean;
  aiTargetOffset: number;
  aiPassTimer: number;
  aiPaceMultiplier: number;
}

export function createCarSimState(params: {
  id: string;
  name: string;
  isPlayer: boolean;
  isHumanPeer?: boolean;
  carId: string;
  livery: LiveryConfig;
  gridSlot: number;
  compiledTrack: CompiledTrack;
  compound: TireCompound;
  personality?: AIPersonality;
  aiPaceMultiplier?: number;
}): CarSimState {
  const carSpec = getCarById(params.carId);
  const row = Math.floor(params.gridSlot / 2);
  const col = params.gridSlot % 2;
  // Spawn behind start line (t = 0.985 backwards) on open track width
  const startT = (((0.985 - row * 0.011) % 1) + 1) % 1;
  const sp = sampleTrackAtT(params.compiledTrack, startT);
  const lat = (col === 0 ? -1 : 1) * 3.0;
  const x = sp.x + sp.nx * lat;
  const z = sp.z + sp.nz * lat;
  const heading = Math.atan2(sp.tx, sp.tz);

  return {
    id: params.id,
    name: params.name,
    isPlayer: params.isPlayer,
    isHumanPeer: params.isHumanPeer ?? false,
    carSpec,
    livery: params.livery,
    personality: params.personality,
    x,
    y: sp.y,
    z,
    vx: 0,
    vz: 0,
    heading,
    speed: 0,
    steerAngle: 0,
    lap: 1,
    trackT: startT,
    prevTrackT: startT,
    totalDistance: startT - 1, // negative before crossing S/F line on lap 1
    lateralOffset: lat,
    currentLapTime: 0,
    bestLapTime: null,
    lastLapTime: null,
    totalTime: 0,
    compound: params.compound,
    tireWear: 100,
    tireTemp: 72,
    fuel: 100,
    aeroDamage: 0,
    specialCharge: 100,
    specialActive: false,
    inSlipstream: false,
    understeerFactor: 0,
    warningCount: 0,
    offTrackCooldown: 0,
    penaltyTimeRemaining: 0,
    inPitLane: false,
    pitBoxTimer: 0,
    pitStopRemaining: 0,
    pitSpeeding: false,
    pitStops: 0,
    pitCooldown: 0,
    pitStrategy: {
      serviceType: 'full-service',
      nextCompound: params.compound,
    },
    flashingHeadlights: false,
    finished: false,
    aiTargetOffset: lat * 0.4,
    aiPassTimer: 0,
    aiPaceMultiplier: params.aiPaceMultiplier ?? 1.0,
  };
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
        grip: 1.08 * (1 - wetPenalty * 0.36),
        wearRate: 1.45,
        optimalTemp: 95,
      };
    case 'medium':
      return {
        grip: 1.0 * (1 - wetPenalty * 0.30),
        wearRate: 1.0,
        optimalTemp: 88,
      };
    case 'hard':
      return {
        grip: 0.94 * (1 - wetPenalty * 0.25),
        wearRate: 0.65,
        optimalTemp: 82,
      };
    case 'wet':
      return {
        grip: 0.90 + wetPenalty * 0.17, // Shines in rain, slower/hotter on dry asphalt
        wearRate: trackWetness < 0.2 ? 1.85 : 0.85,
        optimalTemp: 68,
      };
  }
}

export function getDifficultyMultiplier(difficulty: AIDifficulty, adaptiveBoost: number): number {
  const base =
    difficulty === 'Rookie'
      ? 0.84
      : difficulty === 'Amateur'
      ? 0.92
      : difficulty === 'Pro'
      ? 1.0
      : 1.07;
  return Math.max(0.75, Math.min(1.16, base + adaptiveBoost));
}

export function computeUpdatedAdaptiveBoost(
  currentBoost: number,
  playerBestLap: number | null,
  targetLapSeconds: number,
  classPaceIndex: number,
): number {
  if (!playerBestLap || playerBestLap <= 5) return currentBoost;
  const expectedLap = targetLapSeconds / classPaceIndex;
  const ratio = expectedLap / playerBestLap; // > 1 if player is faster than expected
  const delta = (ratio - 1) * 0.18;
  return Math.max(-0.06, Math.min(0.08, Number((currentBoost * 0.6 + delta).toFixed(4))));
}

/**
 * Steps a single car's sim-cade physics for `dt` seconds.
 */
export function stepCarPhysics(
  car: CarSimState,
  input: ControlInput,
  compiledTrack: CompiledTrack,
  dt: number,
  opts: {
    trackWetness: number;
    totalLaps: number;
    isQualifying: boolean;
    allCars: CarSimState[];
  },
): void {
  if (car.finished) {
    car.speed *= Math.max(0, 1 - 1.5 * dt);
    car.vx = Math.sin(car.heading) * car.speed;
    car.vz = Math.cos(car.heading) * car.speed;
    car.x += car.vx * dt;
    car.z += car.vz * dt;
    return;
  }

  const classMeta = CAR_CLASSES[car.carSpec.classId];
  const attrs = car.carSpec.attributes;

  // Handle active pit stop hold
  if (car.pitStopRemaining > 0) {
    car.speed = 0;
    car.vx = 0;
    car.vz = 0;
    car.pitStopRemaining = Math.max(0, car.pitStopRemaining - dt);
    car.currentLapTime += dt;
    car.totalTime += dt;
    if (car.pitStopRemaining === 0) {
      // Apply pit service
      if (car.pitStrategy.serviceType === 'full-service') {
        car.compound = car.pitStrategy.nextCompound;
        car.tireWear = 100;
        car.tireTemp = 72;
        car.fuel = 100;
        car.aeroDamage = 0;
      } else {
        car.fuel = Math.min(100, car.fuel + 45);
        car.aeroDamage = Math.max(0, car.aeroDamage - 50);
      }
      car.pitStops += 1;
      car.pitCooldown = 6.0;
      car.pitSpeeding = false;
    }
    return;
  }

  // Class special activation / toggle
  if (input.specialPressed) {
    if (classMeta.specialType === 'active-aero') {
      car.specialActive = !car.specialActive;
    } else if (classMeta.specialType === 'attack-mode' && car.specialCharge >= 30) {
      car.specialActive = true;
    } else if (classMeta.specialType === 'hybrid-deploy' && car.specialCharge > 10) {
      car.specialActive = !car.specialActive;
    }
  }

  if (car.specialActive) {
    if (classMeta.specialType === 'active-aero') {
      // Braking automatically closes low-drag wing back to high-downforce corner mode
      if (input.brake > 0.35) {
        car.specialActive = false;
      }
    } else if (classMeta.specialType === 'attack-mode') {
      car.specialCharge = Math.max(0, car.specialCharge - dt * 13);
      if (car.specialCharge <= 0.1) car.specialActive = false;
    } else if (classMeta.specialType === 'hybrid-deploy') {
      car.specialCharge = Math.max(0, car.specialCharge - dt * 16);
      if (car.specialCharge <= 0.5) car.specialActive = false;
    }
  } else {
    // Recharge ERS/Attack mode under braking & cornering
    const rechargeRate = input.brake > 0.2 ? 14 : 2.8;
    car.specialCharge = Math.min(100, car.specialCharge + dt * rechargeRate);
  }

  // Slipstream detection (within 1.5..14m ahead and +/-2.8m laterally)
  let inSlipstream = false;
  for (let i = 0; i < opts.allCars.length; i++) {
    const other = opts.allCars[i];
    if (other.id === car.id) continue;
    let dT = other.trackT - car.trackT;
    if (dT < 0) dT += 1;
    const distAhead = dT * compiledTrack.totalLength;
    if (distAhead > 1.8 && distAhead < 14.5 && Math.abs(other.lateralOffset - car.lateralOffset) < 2.9) {
      inSlipstream = true;
      break;
    }
  }
  car.inSlipstream = inSlipstream;

  // Compute physical performance scalars
  const paceScale = classMeta.basePaceIndex;
  const maxSpeedBase = (28 + (attrs.topSpeed / 100) * 18) * paceScale; // ~36..53 m/s
  const accelBase = (15 + (attrs.acceleration / 100) * 14) * paceScale;
  const gripBase = (1.35 + (attrs.corneringGrip / 100) * 1.15) * (0.85 + paceScale * 0.15);
  const brakeBase = (24 + (attrs.braking / 100) * 18) * paceScale;

  const compoundMod = getCompoundModifiers(car.compound, opts.trackWetness);
  const wearGripFactor = 0.72 + 0.28 * Math.pow(car.tireWear / 100, 0.7);
  const damageFactor = 1 - (car.aeroDamage / 100) * 0.18;
  const fuelFactor = car.fuel > 0 ? 1.0 : 0.45; // Limp home if out of fuel

  let specialSpeedMult = 1.0;
  let specialAccelMult = 1.0;
  let specialGripMult = 1.0;
  if (car.specialActive) {
    if (classMeta.specialType === 'active-aero') {
      specialSpeedMult = 1.09;
      specialGripMult = 0.84; // Low drag = less downforce in corners!
    } else if (classMeta.specialType === 'attack-mode') {
      specialSpeedMult = 1.07;
      specialAccelMult = 1.18;
      specialGripMult = 1.05; // AWD bite
    } else if (classMeta.specialType === 'hybrid-deploy') {
      specialSpeedMult = 1.06;
      specialAccelMult = 1.14;
    }
  }

  const slipstreamMult = inSlipstream ? 1.075 : 1.0;
  const penaltyCap = car.penaltyTimeRemaining > 0 ? 0.52 : 1.0;
  if (car.penaltyTimeRemaining > 0) {
    car.penaltyTimeRemaining = Math.max(0, car.penaltyTimeRemaining - dt);
  }

  // Pit lane check
  const inPitProgress = car.trackT >= compiledTrack.pitEntryT || car.trackT <= compiledTrack.pitExitT;
  const halfW = compiledTrack.spec.trackWidth * 0.5;
  const isInPitCorridor = inPitProgress && car.lateralOffset < -halfW + 0.4 && car.lateralOffset > -halfW - 15;
  car.inPitLane = isInPitCorridor;

  // Off-track / runoff resistance
  const onAsphalt = Math.abs(car.lateralOffset) <= halfW + 1.0 || isInPitCorridor;
  const offTrackDrag = onAsphalt ? 1.0 : 0.72;
  const offTrackGrip = onAsphalt ? 1.0 : 0.65;

  // Speed ceiling
  let effectiveMaxSpeed =
    maxSpeedBase *
    specialSpeedMult *
    slipstreamMult *
    damageFactor *
    fuelFactor *
    offTrackDrag *
    penaltyCap *
    (car.isPlayer ? 1.0 : car.aiPaceMultiplier);

  if (car.inPitLane) {
    const pitLimitSpeed = 16.7; // ~60 km/h scaled
    if (car.speed > pitLimitSpeed * 1.18 && !car.pitSpeeding && car.pitCooldown <= 0) {
      car.pitSpeeding = true;
      car.penaltyTimeRemaining = Math.max(car.penaltyTimeRemaining, 3.0);
    }
    effectiveMaxSpeed = Math.min(effectiveMaxSpeed, pitLimitSpeed);
  }

  // Longitudinal acceleration & braking
  const throttle = Math.max(0, Math.min(1, input.throttle));
  const brake = Math.max(0, Math.min(1, input.brake));

  if (throttle > 0 && brake < 0.1) {
    const speedRatio = Math.min(1, car.speed / Math.max(1, effectiveMaxSpeed));
    const torqueCurve = Math.max(0.15, 1.15 - speedRatio * 0.85);
    car.speed += accelBase * specialAccelMult * fuelFactor * throttle * torqueCurve * dt;
  }

  if (brake > 0) {
    car.speed = Math.max(0, car.speed - brakeBase * compoundMod.grip * brake * dt);
  }

  // Natural aero/rolling drag when coasting or above effectiveMaxSpeed
  const dragCoeff = car.specialActive && classMeta.specialType === 'active-aero' ? 0.35 : 0.48;
  if (car.speed > effectiveMaxSpeed) {
    car.speed -= (car.speed - effectiveMaxSpeed) * Math.min(1, dt * 3.8);
  } else if (throttle < 0.05 && brake < 0.05) {
    car.speed = Math.max(0, car.speed - car.speed * dragCoeff * dt);
  }

  // Sim-Cade Steering, Trail-Braking & Understeer Scrub
  const steerInput = Math.max(-1, Math.min(1, input.steer));
  car.steerAngle += (steerInput * 0.5 - car.steerAngle) * Math.min(1, dt * 14);

  const speedNorm = Math.min(1, car.speed / Math.max(1, maxSpeedBase));
  // Trail-braking bonus: gentle braking (0.1..0.65) while turning sharpens front bite
  const trailBrakeBonus = brake > 0.08 && brake < 0.7 && Math.abs(steerInput) > 0.25 ? 1.14 : 1.0;
  const availableGrip =
    gripBase * compoundMod.grip * wearGripFactor * specialGripMult * offTrackGrip * damageFactor * trailBrakeBonus;

  // High-speed steering sensitivity tapers slightly, rewarding slow-in / fast-out
  const maxTurnRate = availableGrip * (1.28 - speedNorm * 0.48);
  const lateralDemand = Math.abs(steerInput) * speedNorm * 1.35;
  const understeer = Math.max(0, lateralDemand - availableGrip * 0.56);
  car.understeerFactor = Math.min(1, understeer);

  // Over-driving entries scrubs speed & reduces turn efficiency
  if (understeer > 0.05 && car.speed > 12) {
    car.speed = Math.max(10, car.speed - understeer * 8.5 * dt);
  }

  const turnEffectiveness = 1 - Math.min(0.38, understeer * 0.34);
  const lowSpeedScale = Math.min(1, car.speed / 6.0);
  // Note: steerInput > 0 = turn right -> in right-handed XZ with heading 0 = +Z, turning right decreases heading (-X is right? Wait: sin(h), cos(h): h = +pi/2 => +X, h = -pi/2 => -X)
  // Let's keep consistent convention: heading angle increases counter-clockwise (+Y up), so left steer (-1) increases heading, right steer (+1) decreases heading!
  car.heading -= steerInput * maxTurnRate * turnEffectiveness * lowSpeedScale * dt;

  // Lateral velocity blend (playful slide angle for coupes/2005 F1, planted for 2021 F1)
  const desiredVx = Math.sin(car.heading) * car.speed;
  const desiredVz = Math.cos(car.heading) * car.speed;
  const lateralBlend = Math.min(1, dt * (6.5 + availableGrip * 3.5));
  car.vx += (desiredVx - car.vx) * lateralBlend;
  car.vz += (desiredVz - car.vz) * lateralBlend;

  car.x += car.vx * dt;
  car.z += car.vz * dt;

  // Project onto track spline
  const proj = projectOntoTrack(compiledTrack, car.x, car.z, car.trackT);
  car.y = proj.sample.y;
  car.lateralOffset = proj.lateralOffset;

  // Guardrail outer containment so cars bounce gently rather than leaving the world
  const maxAllowedLat = halfW + (inPitProgress ? 16.5 : 7.5);
  const maxRightLat = halfW + 7.5;
  if (car.lateralOffset > maxRightLat) {
    const push = car.lateralOffset - maxRightLat;
    car.x -= proj.sample.nx * push;
    car.z -= proj.sample.nz * push;
    car.speed *= 0.82;
    car.aeroDamage = Math.min(100, car.aeroDamage + 2.5);
    car.lateralOffset = maxRightLat;
  } else if (car.lateralOffset < -maxAllowedLat) {
    const push = -maxAllowedLat - car.lateralOffset;
    car.x += proj.sample.nx * push;
    car.z += proj.sample.nz * push;
    car.speed *= 0.82;
    car.aeroDamage = Math.min(100, car.aeroDamage + 2.5);
    car.lateralOffset = -maxAllowedLat;
  }

  // Pit box trigger
  if (car.pitCooldown > 0) car.pitCooldown = Math.max(0, car.pitCooldown - dt);
  const inPitBoxZone = isInPitCorridor && (proj.sample.t >= 0.96 || proj.sample.t <= 0.03);
  if (inPitBoxZone && car.pitCooldown <= 0 && car.speed < 18 && !opts.isQualifying) {
    car.pitStopRemaining = car.pitStrategy.serviceType === 'full-service' ? 4.0 : 2.1;
    car.speed = 0;
  }

  // Track limits corner cutting check
  if (car.offTrackCooldown > 0) car.offTrackCooldown = Math.max(0, car.offTrackCooldown - dt);
  const cuttingInside =
    !isInPitCorridor &&
    Math.abs(car.lateralOffset) > halfW + 1.5 &&
    ((proj.sample.curvature > 0.012 && car.lateralOffset > 0) ||
      (proj.sample.curvature < -0.012 && car.lateralOffset < 0));
  if (cuttingInside && car.offTrackCooldown <= 0 && car.speed > 16) {
    car.warningCount += 1;
    car.offTrackCooldown = 2.5;
    if (car.warningCount >= 2) {
      car.penaltyTimeRemaining = Math.max(car.penaltyTimeRemaining, 1.5);
    }
  }

  // Lap & progress tracking
  car.prevTrackT = car.trackT;
  car.trackT = proj.sample.t;
  car.currentLapTime += dt;
  car.totalTime += dt;

  // Detect start/finish crossing forward (prevTrackT > 0.85 && trackT < 0.15)
  if (car.prevTrackT > 0.85 && car.trackT < 0.15) {
    if (car.totalDistance < 0) {
      // Initial start/finish crossing from pre-start grid
      car.lap = 1;
      car.currentLapTime = 0;
    } else {
      const completedTime = car.currentLapTime;
      if (completedTime > 5) {
        car.lastLapTime = completedTime;
        if (car.bestLapTime === null || completedTime < car.bestLapTime) {
          car.bestLapTime = completedTime;
        }
      }
      car.currentLapTime = 0;
      if (opts.isQualifying) {
        car.finished = true;
      } else if (car.lap >= opts.totalLaps) {
        car.finished = true;
      } else {
        car.lap += 1;
      }
    }
  } else if (car.prevTrackT < 0.15 && car.trackT > 0.85 && car.totalDistance > 0.2) {
    // Backwards crossing guard
    car.lap = Math.max(1, car.lap - 1);
  }

  car.totalDistance = car.totalDistance < 0 && car.prevTrackT > 0.85 && car.trackT > 0.5
    ? car.trackT - 1
    : (car.lap - 1) + car.trackT;

  // Tire wear, temperature & fuel consumption (scaled for 5-20 lap races)
  const efficiencyFactor = 1.25 - (attrs.efficiency / 100) * 0.55;
  const lapScale = 10 / Math.max(5, opts.totalLaps);
  const cornerLoad = Math.abs(steerInput) * speedNorm;
  const wearDelta = (0.28 + cornerLoad * 0.72 + car.understeerFactor * 0.85) * compoundMod.wearRate * efficiencyFactor * lapScale * dt;
  car.tireWear = Math.max(5, car.tireWear - wearDelta);

  const targetTemp = compoundMod.optimalTemp + cornerLoad * 24 + car.understeerFactor * 16 - opts.trackWetness * 14;
  car.tireTemp += (targetTemp - car.tireTemp) * Math.min(1, dt * 1.4);

  const fuelDelta = (0.38 + throttle * 0.82) * efficiencyFactor * lapScale * dt;
  car.fuel = Math.max(0, car.fuel - fuelDelta);
}

/**
 * Resolves car-to-car collisions with elastic separation and mild aero/suspension wear.
 */
export function resolveCarCollisions(cars: CarSimState[]): number {
  let maxImpact = 0;
  const minDist = 2.65;
  const minDistSq = minDist * minDist;

  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      if (a.pitStopRemaining > 0 || b.pitStopRemaining > 0) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const dSq = dx * dx + dz * dz;
      if (dSq > 0.0001 && dSq < minDistSq) {
        const d = Math.sqrt(dSq);
        const nx = dx / d;
        const nz = dz / d;
        const overlap = (minDist - d) * 0.5;
        a.x -= nx * overlap;
        a.z -= nz * overlap;
        b.x += nx * overlap;
        b.z += nz * overlap;

        const relVx = b.vx - a.vx;
        const relVz = b.vz - a.vz;
        const impactSpeed = Math.abs(relVx * nx + relVz * nz);
        if (impactSpeed > 4.5) {
          maxImpact = Math.max(maxImpact, impactSpeed);
          const dmg = Math.min(14, (impactSpeed - 4) * 0.85);
          a.aeroDamage = Math.min(100, a.aeroDamage + dmg);
          b.aeroDamage = Math.min(100, b.aeroDamage + dmg);
          a.speed *= 0.92;
          b.speed *= 0.92;
        }
      }
    }
  }
  return maxImpact;
}

/**
 * Computes AI control inputs based on track lookahead, class traffic awareness, and personality.
 */
export function computeAIControl(
  car: CarSimState,
  compiledTrack: CompiledTrack,
  allCars: CarSimState[],
  dt: number,
  trackWetness: number,
): ControlInput {
  const personality = car.personality ?? 'Metronome';
  const classMeta = CAR_CLASSES[car.carSpec.classId];

  // Decide pit stop if tires worn (<26%), fuel low (<16%), or weather switched to rain on slicks
  const needsWetSwitch = trackWetness > 0.5 && car.compound !== 'wet';
  const needsDrySwitch = trackWetness < 0.15 && car.compound === 'wet';
  const wantsPit =
    car.pitCooldown <= 0 &&
    (car.tireWear < 24 || car.fuel < 15 || needsWetSwitch || needsDrySwitch);

  if (wantsPit) {
    car.pitStrategy = {
      serviceType: 'full-service',
      nextCompound: trackWetness > 0.45 ? 'wet' : 'medium',
    };
  }

  // Lookahead along spline
  const lookAheadDist = 18 + car.speed * 0.42;
  const lookT = car.trackT + lookAheadDist / compiledTrack.totalLength;
  const farLookT = car.trackT + (lookAheadDist * 2.1) / compiledTrack.totalLength;
  const nearTarget = sampleTrackAtT(compiledTrack, lookT);
  const farTarget = sampleTrackAtT(compiledTrack, farLookT);

  // Traffic & overtaking logic
  car.aiPassTimer = Math.max(0, car.aiPassTimer - dt);
  let blockedAhead = false;
  let slowerClassAhead = false;
  let dodgeSign = 0;

  for (let i = 0; i < allCars.length; i++) {
    const other = allCars[i];
    if (other.id === car.id || other.inPitLane) continue;
    let dT = other.trackT - car.trackT;
    if (dT < 0) dT += 1;
    const distAhead = dT * compiledTrack.totalLength;
    if (distAhead > 1.5 && distAhead < 22) {
      const latGap = Math.abs(other.lateralOffset - car.lateralOffset);
      if (latGap < 3.4) {
        blockedAhead = true;
        const otherClass = CAR_CLASSES[other.carSpec.classId];
        if (classMeta.basePaceIndex > otherClass.basePaceIndex + 0.05) {
          slowerClassAhead = true;
        }
        if (car.aiPassTimer <= 0) {
          dodgeSign = other.lateralOffset >= 0 ? -1 : 1;
          car.aiTargetOffset = dodgeSign * Math.min(compiledTrack.spec.trackWidth * 0.34, 4.6);
          car.aiPassTimer = 1.6;
        }
      }
    }
  }

  // Traffic-Smart prototypes flash headlights at slower GT traffic
  car.flashingHeadlights =
    personality === 'Traffic-Smart' && slowerClassAhead && Math.floor(car.totalTime * 6) % 2 === 0;

  if (!blockedAhead && car.aiPassTimer <= 0) {
    // Return smoothly toward racing apex line (inside of upcoming corner)
    const apexSign = farTarget.curvature > 0.005 ? 1 : farTarget.curvature < -0.005 ? -1 : 0;
    car.aiTargetOffset += (apexSign * 2.2 - car.aiTargetOffset) * Math.min(1, dt * 1.5);
  }

  // Pit lane entry override
  let targetOffset = car.aiTargetOffset;
  if (wantsPit && (car.trackT >= 0.87 || car.trackT <= 0.04)) {
    targetOffset = compiledTrack.pitOffset;
  }

  const targetX = nearTarget.x + nearTarget.nx * targetOffset;
  const targetZ = nearTarget.z + nearTarget.nz * targetOffset;

  const dx = targetX - car.x;
  const dz = targetZ - car.z;
  const desiredHeading = Math.atan2(dx, dz);
  let headingErr = desiredHeading - car.heading;
  while (headingErr > Math.PI) headingErr -= Math.PI * 2;
  while (headingErr < -Math.PI) headingErr += Math.PI * 2;

  // Steering: heading increases left, decreases right -> steer > 0 means right
  const steer = Math.max(-1, Math.min(1, -headingErr * 2.3));

  // Corner braking anticipation based on upcoming curvature
  const maxCurvature = Math.max(Math.abs(nearTarget.curvature), Math.abs(farTarget.curvature));
  const personalityBrakeMult =
    personality === 'Late-Braker'
      ? 1.14
      : personality === 'Tire-Saver'
      ? 0.90
      : 1.0;

  const cornerTargetSpeed =
    maxCurvature > 0.004
      ? Math.max(15, (29 / (1 + maxCurvature * 26)) * classMeta.basePaceIndex * personalityBrakeMult)
      : 999;

  let throttle = 1.0;
  let brake = 0.0;

  if (car.inPitLane) {
    throttle = car.speed < 14.5 ? 0.55 : 0;
    brake = car.speed > 16 ? 0.8 : 0;
  } else if (car.speed > cornerTargetSpeed) {
    const excess = (car.speed - cornerTargetSpeed) / 14;
    brake = Math.min(1, 0.25 + excess);
    throttle = 0;
  } else if (personality === 'Tire-Saver' && car.tireWear > 45 && Math.abs(steer) > 0.55) {
    throttle = 0.82; // Conserves rubber early
  } else if (blockedAhead && !slowerClassAhead && car.aiPassTimer < 0.3) {
    throttle = 0.88;
  }

  // Trigger Class Special on straights
  const onStraight = maxCurvature < 0.004 && Math.abs(steer) < 0.18;
  let specialPressed = false;
  if (classMeta.specialType === 'active-aero') {
    if (onStraight && !car.specialActive && car.speed > 26) specialPressed = true;
    if (!onStraight && car.specialActive) specialPressed = true;
  } else if (onStraight && !car.specialActive && car.specialCharge > 55 && car.speed > 24) {
    specialPressed = true;
  }

  return { throttle, brake, steer, specialPressed };
}

export function computeStandings(cars: CarSimState[], compiledTrack: CompiledTrack): DriverStandingsEntry[] {
  const sorted = [...cars].sort((a, b) => {
    if (a.finished && !b.finished) return -1;
    if (!a.finished && b.finished) return 1;
    if (a.finished && b.finished) return a.totalTime - b.totalTime;
    return b.totalDistance - a.totalDistance;
  });

  const classCounters = new Map<CarClassId, number>();
  const leader = sorted[0];

  return sorted.map((c, idx) => {
    const classPos = (classCounters.get(c.carSpec.classId) ?? 0) + 1;
    classCounters.set(c.carSpec.classId, classPos);

    const ahead = idx > 0 ? sorted[idx - 1] : null;
    const distDiffLeader = Math.max(0, (leader.totalDistance - c.totalDistance) * compiledTrack.totalLength);
    const distDiffAhead = ahead
      ? Math.max(0, (ahead.totalDistance - c.totalDistance) * compiledTrack.totalLength)
      : 0;
    const refSpeed = Math.max(24, c.speed);

    return {
      id: c.id,
      name: c.name,
      isPlayer: c.isPlayer,
      isHumanPeer: c.isHumanPeer,
      carId: c.carSpec.id,
      classId: c.carSpec.classId,
      driverNumber: c.livery.driverNumber,
      personality: c.personality,
      position: idx + 1,
      classPosition: classPos,
      lap: c.lap,
      progress: c.trackT,
      totalDistance: c.totalDistance,
      intervalToAhead: Number((distDiffAhead / refSpeed).toFixed(2)),
      intervalToLeader: Number((distDiffLeader / refSpeed).toFixed(2)),
      bestLapTime: c.bestLapTime,
      lastLapTime: c.lastLapTime,
      totalTime: c.totalTime,
      pitStops: c.pitStops,
      inPit: c.inPitLane || c.pitStopRemaining > 0,
      finished: c.finished,
      primaryColor: c.livery.primaryColor,
      secondaryColor: c.livery.secondaryColor,
    };
  });
}

export function formatLapTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '--:--.--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs.toFixed(2)}`;
}
