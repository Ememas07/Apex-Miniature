import { CAR_CLASSES, getCarById, resolveCarSpecial } from './cars';
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

export const SPEED_KMH_FACTOR = 3.6;

export interface ControlInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (left) .. +1 (right)
  specialPressed: boolean; // edge-triggered or held depending on class
  specialJustPressed?: boolean; // edge-triggered activation
  pitLimiterToggle?: boolean; // toggle 60 km/h pit speed limiter
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
  fuelLapsRemaining: number; // estimated laps of fuel remaining
  aeroDamage: number; // 0..100
  specialCharge: number; // 0..100
  specialActive: boolean;
  attackModeUsesRemaining: number;
  attackModeTimer: number;
  inSlipstream: boolean;
  understeerFactor: number; // 0..1
  lateralSlip: number; // 0..1 tire lateral scrub intensity
  onKerb: boolean; // currently riding corner kerb rumble strips
  warningCount: number;
  offTrackCooldown: number;
  penaltyTimeRemaining: number;
  inPitLane: boolean;
  pitLimiterActive: boolean;
  pitLimiterManual: boolean;
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
  aiStuckTimer: number;
  aiPrevHeadingErr: number;
  wallCollisionCooldown?: number;
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
    fuelLapsRemaining: 14.3,
    aeroDamage: 0,
    specialCharge: 100,
    specialActive: false,
    attackModeUsesRemaining: 2,
    attackModeTimer: 0,
    inSlipstream: false,
    understeerFactor: 0,
    lateralSlip: 0,
    onKerb: false,
    warningCount: 0,
    offTrackCooldown: 0,
    penaltyTimeRemaining: 0,
    inPitLane: false,
    pitLimiterActive: false,
    pitLimiterManual: false,
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
    aiStuckTimer: 0,
    aiPrevHeadingErr: 0,
    wallCollisionCooldown: 0,
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
 * Resolves car contact against barriers, guardrails and invisible pit walls:
 * 1. Depenetration: pushes car out of wall collision normal (normal * depth + 0.05m) every frame
 * 2. Tangent wall-sliding: projects velocity onto wall tangent (v_slide = v - (v . n)n) with 0.07 scraping friction and 0.15 restitution
 * 3. Outward yaw alignment toward wall tangent so car glances off smoothly instead of sticking dead
 * 4. Damage: ignores impacts < 25 km/h (0 damage); heavy impacts accumulated at 0.25x rate with 0.5s cooldown
 */
export function resolveWallContact(
  car: CarSimState,
  sample: { nx: number; nz: number; tx: number; tz: number },
  wallLat: number,
  side: 1 | -1, // 1 = car struck right wall (+lateral), -1 = car struck left wall (-lateral)
  dt: number,
): void {
  const penetration = side === 1 ? car.lateralOffset - wallLat : wallLat - car.lateralOffset;
  if (penetration <= 0) return;

  // Depenetration: push car out along collision normal (-side * n)
  const pushDist = penetration + 0.05;
  car.x -= sample.nx * (side * pushDist);
  car.z -= sample.nz * (side * pushDist);
  car.lateralOffset = side === 1 ? wallLat - 0.05 : wallLat + 0.05;

  // Velocity projection onto wall tangent: v_slide = v - (v . n)n
  const vNorm = side * (car.vx * sample.nx + car.vz * sample.nz);
  const vTan = car.vx * sample.tx + car.vz * sample.tz;

  // Tangent slide with modest scraping friction (0.07) and gentle restitution (0.15)
  const vSlide = vTan * 0.93;
  const vBounce = vNorm > 0 ? -0.15 * vNorm : 0;

  car.vx = vSlide * sample.tx + (side * vBounce) * sample.nx;
  car.vz = vSlide * sample.tz + (side * vBounce) * sample.nz;
  car.speed = Math.max(0, vSlide);

  // Outward yaw alignment toward wall tangent so car glances off smoothly
  const wallHeading = Math.atan2(sample.tx, sample.tz);
  let headingDiff = wallHeading - car.heading;
  while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
  while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
  car.heading += headingDiff * Math.min(1.0, dt * 8.5);

  // Collision damage threshold & cooldown:
  // Ignore low-speed grazing impacts below 25 km/h (6.944 m/s) -> 0 damage
  const impactSpeed = Math.max(0, vNorm);
  const DAMAGE_THRESHOLD_SPEED = 25 / SPEED_KMH_FACTOR; // 6.944 m/s
  if (impactSpeed >= DAMAGE_THRESHOLD_SPEED && (!car.wallCollisionCooldown || car.wallCollisionCooldown <= 0)) {
    // 75% reduced damage accumulation (0.25x rate) with 0.5s cooldown
    const heavyDmg = (impactSpeed - DAMAGE_THRESHOLD_SPEED) * 0.25;
    car.aeroDamage = Math.min(100, car.aeroDamage + Math.min(5.0, heavyDmg));
    car.wallCollisionCooldown = 0.5;
  }
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

  // Pit lane check
  const inPitProgress = car.trackT >= compiledTrack.pitEntryT || car.trackT <= compiledTrack.pitExitT;
  const halfW = compiledTrack.spec.trackWidth * 0.5;
  const pitSideSign = compiledTrack.spec.pitSide === 'right' ? 1 : -1;
  const isInPitCorridor =
    inPitProgress &&
    (pitSideSign === 1
      ? car.lateralOffset > halfW + 1.6 && car.lateralOffset < halfW + 18
      : car.lateralOffset < -halfW - 1.6 && car.lateralOffset > -halfW - 18);
  car.inPitLane = isInPitCorridor;

  // Manual pit limiter toggle
  if (input.pitLimiterToggle) {
    car.pitLimiterManual = !car.pitLimiterManual;
  }

  // Auto-release pit limiter cleanly at pit-exit line
  const crossedPitExit = car.prevTrackT <= compiledTrack.pitExitT && car.trackT > compiledTrack.pitExitT;
  if (crossedPitExit) {
    car.inPitLane = false;
    car.pitLimiterManual = false;
    car.pitSpeeding = false;
  }

  car.pitLimiterActive = car.inPitLane || car.pitLimiterManual;

  // Class / car-specific special activation / toggle
  const resolvedSpecial = resolveCarSpecial(car.carSpec);
  const specialType = resolvedSpecial.specialType;
  const isSpecialTriggered = input.specialJustPressed ?? input.specialPressed;

  switch (specialType) {
    case 'active-aero': {
      if (isSpecialTriggered) {
        car.specialActive = !car.specialActive;
      }
      if (car.specialActive && input.brake > 0.35) {
        // Braking automatically closes low-drag wing back to high-downforce corner mode
        car.specialActive = false;
      }
      break;
    }
    case 'attack-mode': {
      // 2 uses per race, 15s duration: enables AWD acceleration boost and +15% power
      if (isSpecialTriggered && car.attackModeUsesRemaining > 0 && car.attackModeTimer <= 0) {
        car.attackModeUsesRemaining -= 1;
        car.attackModeTimer = 15.0;
        car.specialActive = true;
      }
      if (car.attackModeTimer > 0) {
        car.attackModeTimer = Math.max(0, car.attackModeTimer - dt);
        car.specialCharge = Math.round((car.attackModeTimer / 15.0) * 100);
        if (car.attackModeTimer <= 0) {
          car.specialActive = false;
        }
      } else {
        car.specialCharge = car.attackModeUsesRemaining * 50;
      }
      break;
    }
    case 'ers-overtake':
    case 'hybrid-deploy': {
      // Hold or toggle to deploy rechargeable battery for +15% acceleration
      if (input.specialPressed && car.specialCharge > 1) {
        car.specialActive = true;
        car.specialCharge = Math.max(0, car.specialCharge - dt * 20);
      } else {
        car.specialActive = false;
      }
      if (!car.specialActive) {
        // Recharges under braking
        const rechargeRate = input.brake > 0.2 ? 22 : 3.5;
        car.specialCharge = Math.min(100, car.specialCharge + dt * rechargeRate);
      }
      break;
    }
    case 'v10-overboost':
    case 'rich-fuel-overboost': {
      // Temporary +8% power/RPM surge with +35% fuel burn while active (NA V10 / Valkyrie / Glickenhaus)
      if (input.specialPressed && car.specialCharge > 2) {
        car.specialActive = true;
        car.specialCharge = Math.max(0, car.specialCharge - dt * 15);
      } else {
        car.specialActive = false;
        car.specialCharge = Math.min(100, car.specialCharge + dt * 10);
      }
      break;
    }
    case 'high-beam-flash': {
      // Flashes headlights and signals slower traffic ahead to yield
      car.specialActive = Boolean(input.specialPressed);
      car.flashingHeadlights = car.specialActive;
      break;
    }
    default: {
      car.specialActive = false;
      break;
    }
  }

  // Prototype / GT High-Beam flash signals slower traffic ahead to yield cleanly toward its nearest open edge
  if (car.flashingHeadlights) {
    for (let i = 0; i < opts.allCars.length; i++) {
      const other = opts.allCars[i];
      if (other.id === car.id || other.inPitLane || other.isPlayer) continue;
      let dT = other.trackT - car.trackT;
      while (dT > 0.5) dT -= 1;
      while (dT < -0.5) dT += 1;
      const distAhead = dT * compiledTrack.totalLength;
      if (distAhead > 1.5 && distAhead < 28 && other.speed < car.speed + 2) {
        const yieldSide = other.lateralOffset >= car.lateralOffset ? 1 : -1;
        const maxYield = Math.max(2.0, halfW - 2.0);
        other.aiTargetOffset = yieldSide * Math.min(maxYield, 4.2);
        other.aiPassTimer = 1.6;
      }
    }
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
  // 1:1 Metric Scale (1 unit = 1 meter):
  // Top speeds reach 315-350 km/h (87-97 m/s) for F1/Hypercar, and 270-292 km/h (75-81 m/s) for GT3
  const maxSpeedBase = (63 + (attrs.topSpeed / 100) * 19) * (0.64 + 0.36 * paceScale);
  const accelBase = (18 + (attrs.acceleration / 100) * 14) * (0.62 + 0.38 * paceScale);
  const gripBase = (1.42 + (attrs.corneringGrip / 100) * 1.15) * (0.75 + paceScale * 0.25);
  const brakeBase = (34 + (attrs.braking / 100) * 20) * (0.65 + paceScale * 0.35);

  const compoundMod = getCompoundModifiers(car.compound, opts.trackWetness);
  const wearGripFactor = 0.72 + 0.28 * Math.pow(car.tireWear / 100, 0.7);
  // Cap maximum speed/grip penalty at 10%-12% even at 100% damage so a damaged car remains fully drivable
  const damageFactor = 1 - (car.aeroDamage / 100) * 0.11;
  const fuelFactor = car.fuel > 0 ? 1.0 : 0.45; // Limp home if out of fuel

  let specialSpeedMult = 1.0;
  let specialAccelMult = 1.0;
  let specialGripMult = 1.0;
  if (car.specialActive) {
    if (specialType === 'active-aero') {
      // 2026 F1: +12% top speed, -25% cornering grip vs High-Downforce Corner Mode
      specialSpeedMult = 1.12;
      specialGripMult = 0.75;
    } else if (specialType === 'attack-mode') {
      // Formula E: enables AWD acceleration boost and +15% power
      specialSpeedMult = 1.06;
      specialAccelMult = 1.15;
      specialGripMult = 1.08;
    } else if (specialType === 'ers-overtake' || specialType === 'hybrid-deploy') {
      // 2021 F1 & Hypercar: +15% acceleration
      specialSpeedMult = 1.05;
      specialAccelMult = 1.15;
    } else if (specialType === 'v10-overboost' || specialType === 'rich-fuel-overboost') {
      // 2005 F1 & Non-hybrid LMH: temporary +8% power surge with +35% fuel burn
      specialSpeedMult = 1.04;
      specialAccelMult = 1.08;
    }
  }

  const slipstreamMult = inSlipstream ? 1.075 : 1.0;
  const penaltyCap = car.penaltyTimeRemaining > 0 ? 0.52 : 1.0;
  if (car.penaltyTimeRemaining > 0) {
    car.penaltyTimeRemaining = Math.max(0, car.penaltyTimeRemaining - dt);
  }

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

  // Pit Speed Limiter: Strictly clamp to 60 km/h (framerate-independent using dt)
  const PIT_LIMIT_KMH = 60;
  const PIT_LIMIT_SPEED = PIT_LIMIT_KMH / SPEED_KMH_FACTOR; // 60 / 3.6 = 16.6667 m/s

  if (car.pitLimiterActive) {
    if (car.speed > PIT_LIMIT_SPEED) {
      if (car.inPitLane && car.speed > PIT_LIMIT_SPEED * 1.08 && !car.pitSpeeding && car.pitCooldown <= 0) {
        car.pitSpeeding = true;
        car.penaltyTimeRemaining = Math.max(car.penaltyTimeRemaining, 3.0);
      }
      // Smoothly brake down to 60 km/h if entered faster
      const decel = Math.max(22, (car.speed - PIT_LIMIT_SPEED) * 5.5);
      car.speed = Math.max(PIT_LIMIT_SPEED, car.speed - decel * dt);
    }
    effectiveMaxSpeed = Math.min(effectiveMaxSpeed, PIT_LIMIT_SPEED);
  }

  // Longitudinal acceleration & braking
  const throttle = Math.max(0, Math.min(1, input.throttle));
  const brake = Math.max(0, Math.min(1, input.brake));

  if (throttle > 0 && brake < 0.1) {
    if (car.pitLimiterActive && car.speed >= PIT_LIMIT_SPEED - 0.05) {
      // Ignore excess throttle above 60 km/h
      car.speed = PIT_LIMIT_SPEED;
    } else {
      const speedRatio = Math.min(1, car.speed / Math.max(1, effectiveMaxSpeed));
      const torqueCurve = Math.max(0.15, 1.15 - speedRatio * 0.85);
      car.speed += accelBase * specialAccelMult * fuelFactor * throttle * torqueCurve * dt;
      if (car.pitLimiterActive && car.speed > PIT_LIMIT_SPEED) {
        car.speed = PIT_LIMIT_SPEED;
      }
    }
  }

  if (brake > 0) {
    car.speed = Math.max(0, car.speed - brakeBase * compoundMod.grip * brake * dt);
  }

  // Natural aero/rolling drag when coasting or above effectiveMaxSpeed
  const dragCoeff = car.specialActive && specialType === 'active-aero' ? 0.35 : 0.48;
  if (car.pitLimiterActive && car.speed > PIT_LIMIT_SPEED) {
    car.speed = PIT_LIMIT_SPEED;
  } else if (car.speed > effectiveMaxSpeed) {
    car.speed -= (car.speed - effectiveMaxSpeed) * Math.min(1, dt * 3.8);
  } else if (throttle < 0.05 && brake < 0.05) {
    car.speed = Math.max(0, car.speed - car.speed * dragCoeff * dt);
  }

  // Sim-Cade Steering, Centripetal Cornering Limit, Trail-Braking & Understeer Scrub
  const steerInput = Math.max(-1, Math.min(1, input.steer));
  car.steerAngle += (steerInput * 0.5 - car.steerAngle) * Math.min(1, dt * 14);

  const speedNorm = Math.min(1, car.speed / Math.max(1, maxSpeedBase));
  // Trail-braking bonus: gentle braking (0.08..0.7) while turning sharpens front bite
  const trailBrakeBonus = brake > 0.08 && brake < 0.7 && Math.abs(steerInput) > 0.25 ? 1.14 : 1.0;
  const sampleBank = sampleTrackAtT(compiledTrack, car.trackT).banking || 0;
  const bankingGripBonus = 1.0 + Math.sin(Math.abs(sampleBank)) * 0.35;
  const availableGrip =
    gripBase *
    compoundMod.grip *
    wearGripFactor *
    specialGripMult *
    offTrackGrip *
    damageFactor *
    trailBrakeBonus *
    bankingGripBonus;

  // Centripetal lateral physics cap: realistic centripetal limit matching physical Gs
  const maxTurnRate = Math.min(
    availableGrip * 1.45,
    (availableGrip * 22.0) / Math.max(7.5, car.speed),
  );
  const lateralDemand = Math.abs(steerInput) * speedNorm * speedNorm * 1.55;
  const understeer = Math.max(0, (lateralDemand - availableGrip * 0.56) * 1.65);
  car.understeerFactor = Math.min(1, understeer);

  // Over-driving entries scrubs speed & pushes the car wide with genuine front-axle washout
  if (understeer > 0.05 && car.speed > 12) {
    car.speed = Math.max(11.0, car.speed - understeer * 15.0 * dt);
  }

  const turnEffectiveness = 1 - Math.min(0.55, understeer * 0.45);
  const lowSpeedScale = Math.min(1, car.speed / 6.0);
  car.heading -= steerInput * maxTurnRate * turnEffectiveness * lowSpeedScale * dt;

  // Lateral velocity blend & lateral slip calculation for tire scrub audio
  const desiredVx = Math.sin(car.heading) * car.speed;
  const desiredVz = Math.cos(car.heading) * car.speed;
  const lateralBlend = Math.min(1, dt * (6.5 + availableGrip * 3.5) * (1 - Math.min(0.45, understeer * 0.4)));
  car.vx += (desiredVx - car.vx) * lateralBlend;
  car.vz += (desiredVz - car.vz) * lateralBlend;

  const fwdX = Math.sin(car.heading);
  const fwdZ = Math.cos(car.heading);
  const rightVel = car.vx * fwdZ - car.vz * fwdX;
  car.lateralSlip = Math.min(
    1,
    (Math.abs(rightVel) / 7.5 + car.understeerFactor * 0.72) * (car.speed > 5 ? 1 : 0),
  );

  car.x += car.vx * dt;
  car.z += car.vz * dt;

  // Project onto track spline
  const proj = projectOntoTrack(compiledTrack, car.x, car.z, car.trackT);
  const bank = proj.sample.banking || 0;
  car.y = proj.sample.y + car.lateralOffset * Math.sin(bank);
  car.lateralOffset = proj.lateralOffset;

  // Kerb contact detection on curved apexes
  const sampleHalfW = (proj.sample.width ? proj.sample.width : compiledTrack.spec.trackWidth) * 0.5;
  car.onKerb =
    !isInPitCorridor &&
    car.speed > 4 &&
    Math.abs(proj.sample.curvature) > 0.008 &&
    Math.abs(car.lateralOffset) >= sampleHalfW - 0.65 &&
    Math.abs(car.lateralOffset) <= sampleHalfW + 1.8 &&
    ((proj.sample.curvature > 0 && car.lateralOffset > 0) ||
      (proj.sample.curvature < 0 && car.lateralOffset < 0));

  // Update wall collision cooldown timer
  if (car.wallCollisionCooldown && car.wallCollisionCooldown > 0) {
    car.wallCollisionCooldown = Math.max(0, car.wallCollisionCooldown - dt);
  }

  // Guardrails, outer containment & invisible pit-lane walls
  const pitSign = compiledTrack.spec.pitSide === 'right' ? 1 : -1;
  const pitOffset = compiledTrack.pitOffset;
  const isPitThroat =
    (car.trackT >= compiledTrack.pitEntryT && car.trackT < ((compiledTrack.pitEntryT + 0.018) % 1 || 0.91)) ||
    (car.trackT <= compiledTrack.pitExitT && car.trackT > ((compiledTrack.pitExitT - 0.018 + 1) % 1 || 0.07));
  const isPitDividerZone = inPitProgress && !isPitThroat;

  if (car.inPitLane) {
    // 1. Pit divider wall separating pit lane from main track straight
    const dividerWallLat = pitSign === 1 ? sampleHalfW + 1.2 : -sampleHalfW - 1.2;
    if (isPitDividerZone) {
      if (pitSign === 1 && car.lateralOffset < dividerWallLat) {
        resolveWallContact(car, proj.sample, dividerWallLat, -1, dt);
      } else if (pitSign === -1 && car.lateralOffset > dividerWallLat) {
        resolveWallContact(car, proj.sample, dividerWallLat, 1, dt);
      }
    }
    // 2. Outer pit-garage boundary wall
    const garageWallLat = pitOffset + pitSign * 4.8;
    if (pitSign === 1 && car.lateralOffset > garageWallLat) {
      resolveWallContact(car, proj.sample, garageWallLat, 1, dt);
    } else if (pitSign === -1 && car.lateralOffset < garageWallLat) {
      resolveWallContact(car, proj.sample, garageWallLat, -1, dt);
    }
  } else {
    // Car on main track
    // 1. Pit divider wall prevents crossing sideways into pit lane
    if (isPitDividerZone) {
      const dividerWallLat = pitSign === 1 ? sampleHalfW + 0.8 : -sampleHalfW - 0.8;
      if (pitSign === 1 && car.lateralOffset > dividerWallLat) {
        resolveWallContact(car, proj.sample, dividerWallLat, 1, dt);
      } else if (pitSign === -1 && car.lateralOffset < dividerWallLat) {
        resolveWallContact(car, proj.sample, dividerWallLat, -1, dt);
      }
    }
    // 2. Outer track guardrails / barriers
    const outerRunoff = 6.2;
    const maxRight = inPitProgress && pitSign === 1 ? sampleHalfW + 0.8 : sampleHalfW + outerRunoff;
    const maxLeft = inPitProgress && pitSign === -1 ? -sampleHalfW - 0.8 : -sampleHalfW - outerRunoff;
    if (car.lateralOffset > maxRight && (!isPitDividerZone || pitSign !== 1)) {
      resolveWallContact(car, proj.sample, maxRight, 1, dt);
    } else if (car.lateralOffset < maxLeft && (!isPitDividerZone || pitSign !== -1)) {
      resolveWallContact(car, proj.sample, maxLeft, -1, dt);
    }
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

  // Tire wear, temperature & fuel consumption (calibrated so a full tank lasts ~12-16 laps at full push)
  const efficiencyFactor = 1.25 - (attrs.efficiency / 100) * 0.55;
  const cornerLoad = Math.abs(steerInput) * speedNorm;
  const wearDelta = (0.014 + cornerLoad * 0.045 + car.understeerFactor * 0.04) * compoundMod.wearRate * efficiencyFactor * dt;
  car.tireWear = Math.max(5, car.tireWear - wearDelta);

  const targetTemp = compoundMod.optimalTemp + cornerLoad * 24 + car.understeerFactor * 16 - opts.trackWetness * 14;
  car.tireTemp += (targetTemp - car.tireTemp) * Math.min(1, dt * 1.4);

  // Recalibrated fuel consumption: a full tank lasts ~12-16 laps at 1:1 scale (a 5km-7km lap burns ~6-8% of a tank)
  const lapProgressDelta = (car.speed * dt) / Math.max(2000, compiledTrack.totalLength);
  const throttleLoad = 0.40 + 0.60 * throttle;
  let overboostFuelMult = 1.0;
  if (car.specialActive && (specialType === 'v10-overboost' || specialType === 'rich-fuel-overboost')) {
    overboostFuelMult = 1.35; // +35% fuel burn while overboost active
  }
  const fuelBurn = 8.8 * lapProgressDelta * throttleLoad * efficiencyFactor * overboostFuelMult;
  car.fuel = Math.max(0, car.fuel - fuelBurn);

  const avgBurnRatePerLap = Math.max(4.0, 8.8 * efficiencyFactor * 0.78 * overboostFuelMult);
  car.fuelLapsRemaining = Number((car.fuel / avgBurnRatePerLap).toFixed(1));

  // Anti-Stuck Watchdog: if an AI car's speed remains < 5 km/h for 1.5s outside a pit stall,
  // smoothly reset aligned with nearest spline point at 35 km/h (9.72 m/s) in an unoccupied lateral lane
  if (!car.isPlayer && !car.inPitLane && car.pitStopRemaining <= 0) {
    if (car.speed < 5 / SPEED_KMH_FACTOR) {
      car.aiStuckTimer = (car.aiStuckTimer || 0) + dt;
      if (car.aiStuckTimer >= 1.5) {
        const sp = sampleTrackAtT(compiledTrack, car.trackT);
        const safeMargin = 1.8;
        const laneLimit = Math.max(1.5, halfW - safeMargin);
        const candidates = [0, -laneLimit * 0.65, laneLimit * 0.65, -laneLimit * 0.35, laneLimit * 0.35];
        let bestLane = 0;
        let bestClearance = -1;
        for (const cand of candidates) {
          let minGap = Infinity;
          for (const other of opts.allCars) {
            if (other.id === car.id || other.inPitLane) continue;
            let dT = other.trackT - car.trackT;
            while (dT > 0.5) dT -= 1;
            while (dT < -0.5) dT += 1;
            const ds = Math.abs(dT * compiledTrack.totalLength);
            if (ds < 14) {
              minGap = Math.min(minGap, Math.hypot(ds, other.lateralOffset - cand));
            }
          }
          if (minGap > bestClearance) {
            bestClearance = minGap;
            bestLane = cand;
          }
        }
        car.x = sp.x + sp.nx * bestLane;
        car.y = sp.y;
        car.z = sp.z + sp.nz * bestLane;
        car.lateralOffset = bestLane;
        car.aiTargetOffset = bestLane;
        car.heading = Math.atan2(sp.tx, sp.tz);
        car.speed = 35 / SPEED_KMH_FACTOR; // 35 km/h rolling speed (~9.72 m/s)
        car.vx = Math.sin(car.heading) * car.speed;
        car.vz = Math.cos(car.heading) * car.speed;
        car.steerAngle = 0;
        car.understeerFactor = 0;
        car.aiPrevHeadingErr = 0;
        car.aiStuckTimer = 0;
      }
    } else {
      car.aiStuckTimer = 0;
    }
  }
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
 * Computes AI control inputs using:
 * 1. Full track-relative (ds, dLat) 3-layer spatial avoidance (Forward Braking Cone, Dynamic Overtaking Lane, Side-by-Side Door Awareness)
 * 2. Kinematic stopping-distance curvature scan across [0, v^2/(2*a_brake) + 15m]
 * 3. Adaptive lookahead + damped PD steering + Off-Track Guardrail Override
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
  const attrs = car.carSpec.attributes;

  const CAR_WIDTH = 2.1;
  const CAR_HALF_WIDTH = CAR_WIDTH * 0.5;
  const CAR_LENGTH = 4.4;

  // Pit decision
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

  // Physical performance estimation matching stepCarPhysics
  const paceScale = classMeta.basePaceIndex;
  const compoundMod = getCompoundModifiers(car.compound, trackWetness);
  const wearGripFactor = 0.72 + 0.28 * Math.pow(car.tireWear / 100, 0.7);
  const damageFactor = 1 - (car.aeroDamage / 100) * 0.18;

  const gripBase = (1.35 + (attrs.corneringGrip / 100) * 1.15) * (0.85 + paceScale * 0.15);
  const brakeBase = (24 + (attrs.braking / 100) * 18) * paceScale;
  const personalityBrakeFactor =
    personality === 'Late-Braker' ? 0.94 : personality === 'Tire-Saver' ? 0.82 : 0.88;
  const brakeDecel = Math.max(10, brakeBase * compoundMod.grip * personalityBrakeFactor);
  const skillFactor = Math.max(0.84, Math.min(0.98, 0.91 * (0.5 + 0.5 * car.aiPaceMultiplier)));

  const currentSample = sampleTrackAtT(compiledTrack, car.trackT);
  const halfW = (currentSample.width || compiledTrack.spec.trackWidth) * 0.5;
  const boundaryMargin = CAR_HALF_WIDTH + 0.75;
  const minSafeLane = Math.min(-0.5, -halfW + boundaryMargin);
  const maxSafeLane = Math.max(0.5, halfW - boundaryMargin);

  // ==================== 1. FULL SPATIAL AWARENESS (ALL CARS INCLUDING PLAYER) ====================
  car.aiPassTimer = Math.max(0, car.aiPassTimer - dt);

  const dynamicBrakingDist = Math.max(
    14,
    (car.speed * car.speed) / (2 * Math.max(8, brakeDecel * 0.78)) + 9.0,
  );

  let leadCar: CarSimState | null = null;
  let leadDs = Infinity;
  let slowerClassAhead = false;

  // Side-by-side door awareness bounds
  let sideCarLeftLat: number | null = null;
  let sideCarRightLat: number | null = null;

  for (let i = 0; i < allCars.length; i++) {
    const other = allCars[i];
    if (other.id === car.id || other.inPitLane || other.pitStopRemaining > 0) continue;

    let dT = other.trackT - car.trackT;
    while (dT > 0.5) dT -= 1;
    while (dT < -0.5) dT += 1;
    const ds = dT * compiledTrack.totalLength;
    const dLat = other.lateralOffset;

    // Layer 3: Side-by-Side Door Awareness (|ds| < carLength * 1.35)
    if (Math.abs(ds) < CAR_LENGTH * 1.35 && Math.abs(dLat) <= halfW + 2.5) {
      if (dLat < car.lateralOffset) {
        if (sideCarLeftLat === null || dLat > sideCarLeftLat) {
          sideCarLeftLat = dLat;
        }
      } else {
        if (sideCarRightLat === null || dLat < sideCarRightLat) {
          sideCarRightLat = dLat;
        }
      }
    }

    // Layer 1: Forward Braking Cone (0 < ds < dynamicBrakingDist and lateral overlap < carWidth * 1.45)
    const aheadLatOverlap = Math.abs(dLat - car.lateralOffset) < CAR_WIDTH * 1.45;
    if (ds > 0.4 && aheadLatOverlap) {
      if (ds < dynamicBrakingDist && ds < leadDs) {
        leadDs = ds;
        leadCar = other;
      }
      if (ds < Math.max(65, dynamicBrakingDist)) {
        const otherClass = CAR_CLASSES[other.carSpec.classId];
        if (classMeta.basePaceIndex > otherClass.basePaceIndex + 0.04) {
          slowerClassAhead = true;
        }
      }
    }
  }

  // Traffic-Smart prototypes flash headlights at slower GT traffic ahead
  car.flashingHeadlights =
    personality === 'Traffic-Smart' && slowerClassAhead && Math.floor(car.totalTime * 6) % 2 === 0;

  // ==================== 2. DYNAMIC OVERTAKING LANE & RACING LINE ====================
  // Check upcoming corner curvature at 25m for subtle apex line bias when track is clear
  const apexLookSample = sampleTrackAtT(
    compiledTrack,
    car.trackT + 26 / Math.max(100, compiledTrack.totalLength),
  );
  const apexSign =
    apexLookSample.curvature > 0.012 ? 1 : apexLookSample.curvature < -0.012 ? -1 : 0;
  let desiredOffset = apexSign * Math.min(maxSafeLane * 0.55, 2.2);

  // Layer 2: Dynamic Overtaking Lane Selection when closing on slower car ahead
  if (leadCar && leadDs < Math.max(36, car.speed * 1.45) && car.speed > leadCar.speed - 2.0) {
    const leftUpper = Math.min(maxSafeLane, leadCar.lateralOffset - CAR_WIDTH * 1.6);
    const rightLower = Math.max(minSafeLane, leadCar.lateralOffset + CAR_WIDTH * 1.6);
    const leftClearance = Math.max(0, leftUpper - minSafeLane);
    const rightClearance = Math.max(0, maxSafeLane - rightLower);

    // Prevent picking a lane that cuts into a side-by-side car
    const canGoLeft =
      leftClearance >= 0.4 &&
      (sideCarLeftLat === null || leftUpper >= sideCarLeftLat + CAR_WIDTH * 1.4);
    const canGoRight =
      rightClearance >= 0.4 &&
      (sideCarRightLat === null || rightLower <= sideCarRightLat - CAR_WIDTH * 1.4);

    if (canGoLeft && (!canGoRight || leftClearance >= rightClearance)) {
      desiredOffset = Math.min(leftUpper, (minSafeLane + leftUpper) * 0.55);
      car.aiPassTimer = Math.max(car.aiPassTimer, 1.1);
    } else if (canGoRight) {
      desiredOffset = Math.max(rightLower, (rightLower + maxSafeLane) * 0.55);
      car.aiPassTimer = Math.max(car.aiPassTimer, 1.1);
    } else {
      desiredOffset = car.lateralOffset;
    }
  } else if (car.aiPassTimer > 0) {
    // Hold chosen passing lane smoothly until pass completes
    desiredOffset = car.aiTargetOffset;
  }

  // Smooth lateral lane transition
  const hasLateralOverlapNow = leadCar ? Math.abs(leadCar.lateralOffset - car.lateralOffset) < CAR_WIDTH * 1.35 : false;
  const laneBlendRate = hasLateralOverlapNow ? 5.5 : (leadCar ? 4.2 : 2.2);
  car.aiTargetOffset += (desiredOffset - car.aiTargetOffset) * Math.min(1, dt * laneBlendRate);

  // Layer 3 Lockout: Hold parallel lateral spacing (|myLat - otherLat| >= carWidth * 1.4) when alongside
  if (sideCarLeftLat !== null) {
    car.aiTargetOffset = Math.max(car.aiTargetOffset, sideCarLeftLat + CAR_WIDTH * 1.4);
  }
  if (sideCarRightLat !== null) {
    car.aiTargetOffset = Math.min(car.aiTargetOffset, sideCarRightLat - CAR_WIDTH * 1.4);
  }

  // Hard Track-Boundary Containment: strictly clamp target offset inside safe asphalt bounds
  car.aiTargetOffset = Math.max(minSafeLane, Math.min(maxSafeLane, car.aiTargetOffset));

  // Pit lane entry override when boxing
  let steerTargetOffset = car.aiTargetOffset;
  const enteringPit = wantsPit && (car.trackT >= 0.87 || car.trackT <= 0.04);
  if (enteringPit) {
    steerTargetOffset = compiledTrack.pitOffset;
  }

  // ==================== 3. KINEMATIC STOPPING-DISTANCE CURVATURE SCAN ====================
  // Extended AI lookahead: 150m - 350m ahead of heavy corners so AI brakes smoothly from 330+ km/h
  const scanDist = Math.max(150, Math.min(350, (car.speed * car.speed) / (2 * Math.max(10, brakeDecel * 0.82)) + 35.0));
  const scanSteps = 28;
  let maxBrakeRatio = 0;
  let immediateCornerSpeed = 999;

  const effectiveLatGripBase =
    gripBase * compoundMod.grip * wearGripFactor * damageFactor;

  for (let sIdx = 0; sIdx <= scanSteps; sIdx++) {
    const dMeters = 2.5 + (sIdx / scanSteps) * scanDist;
    const sample = sampleTrackAtT(
      compiledTrack,
      car.trackT + dMeters / Math.max(100, compiledTrack.totalLength),
    );
    const absK = Math.abs(sample.curvature);
    if (absK < 0.0048) continue;

    const bankBonus = 1.0 + Math.sin(Math.abs(sample.banking || 0)) * 0.35;
    const aeroDownforceBonus = 1.0 + Math.min(0.38, car.speed / 62.0);
    const sampleGrip = effectiveLatGripBase * bankBonus * aeroDownforceBonus;
    // Calibrated centripetal safe cornering speed at 1:1 metric scale
    const vSafe = Math.max(10.5, Math.sqrt((sampleGrip * 18.5) / absK) * skillFactor);

    if (dMeters < 16) {
      immediateCornerSpeed = Math.min(immediateCornerSpeed, vSafe);
    }

    if (car.speed > vSafe) {
      const reqBrakeDist = (car.speed * car.speed - vSafe * vSafe) / (2 * brakeDecel);
      // Ratio >= 1.0 means we must brake at full decel right now to reach vSafe by dMeters
      const ratio = reqBrakeDist / Math.max(1.5, dMeters - 1.5);
      if (ratio > maxBrakeRatio) {
        maxBrakeRatio = ratio;
      }
    }
  }

  let cornerThrottle = 1.0;
  let cornerBrake = 0.0;

  if (car.speed > immediateCornerSpeed * 1.02) {
    const over = (car.speed - immediateCornerSpeed) / 7.5;
    cornerBrake = Math.min(1.0, 0.45 + over * 0.55);
    cornerThrottle = 0.0;
  } else if (maxBrakeRatio >= 0.84) {
    cornerBrake = Math.min(1.0, 0.25 + (maxBrakeRatio - 0.84) * 2.4);
    cornerThrottle = 0.0;
  } else if (maxBrakeRatio >= 0.72) {
    // Feather throttle slightly before braking threshold
    cornerThrottle = Math.max(0.25, 1.0 - (maxBrakeRatio - 0.72) * 5.5);
  }

  // ==================== 4. COLLISION-AVOIDANCE BRAKING ====================
  let avoidBrake = 0.0;
  let avoidThrottleCap = 1.0;

  if (leadCar) {
    const closingSpeed = car.speed - leadCar.speed;
    const hasLateralOverlap = Math.abs(leadCar.lateralOffset - car.lateralOffset) < CAR_WIDTH * 1.35;
    const pullingOutToPass =
      Math.abs(car.aiTargetOffset - leadCar.lateralOffset) >= CAR_WIDTH * 1.45 &&
      Math.abs(leadCar.lateralOffset - car.lateralOffset) < CAR_WIDTH * 1.45;

    // When directly behind with lateral overlap, ALWAYS match speed and brake to avoid rear-ending!
    const immediateDanger = hasLateralOverlap || !pullingOutToPass || leadDs < 12.0 || closingSpeed > 1.5;

    if (immediateDanger) {
      const gap = Math.max(0.5, leadDs - 4.2);
      const desiredFollowSpeed =
        leadDs < 10.0
          ? Math.max(0, leadCar.speed * Math.max(0, (leadDs - 4.0) / 6.0))
          : (hasLateralOverlap ? Math.min(leadCar.speed, car.speed) : leadCar.speed);

      if (car.speed > desiredFollowSpeed || closingSpeed > 0.2) {
        const speedDiffDecel =
          (car.speed * car.speed - desiredFollowSpeed * desiredFollowSpeed) / (2 * Math.max(1.0, gap));
        const closingDecel = Math.max(0, closingSpeed) * (3.0 / Math.max(1.0, gap));
        const reqAvoidDecel = speedDiffDecel + closingDecel;
        if (reqAvoidDecel > 1.0) {
          avoidBrake = Math.max(0, Math.min(1.0, reqAvoidDecel / brakeDecel));
          avoidThrottleCap = avoidBrake > 0.05 ? 0.0 : 0.35;
        }
      } else if (leadDs < 14.0 && hasLateralOverlap) {
        avoidThrottleCap = Math.min(avoidThrottleCap, 0.5);
      }
    }
  }

  // ==================== 5. ADAPTIVE LOOKAHEAD + DAMPED PD STEERING ====================
  const ahead10 = sampleTrackAtT(
    compiledTrack,
    car.trackT + 10 / Math.max(100, compiledTrack.totalLength),
  );
  const ahead20 = sampleTrackAtT(
    compiledTrack,
    car.trackT + 20 / Math.max(100, compiledTrack.totalLength),
  );
  const nearCurv = Math.max(
    Math.abs(currentSample.curvature),
    Math.abs(ahead10.curvature),
    Math.abs(ahead20.curvature),
  );
  const curvBlend = Math.min(1, nearCurv / 0.042);
  const straightLook = Math.max(38, Math.min(68, 32 + car.speed * 0.36));
  const tightLook = Math.max(14, Math.min(26, 12 + car.speed * 0.18));
  let lookAheadDist = straightLook * (1 - curvBlend) + tightLook * curvBlend;
  if (leadCar && leadDs < 24 && Math.abs(car.lateralOffset - steerTargetOffset) > 0.5) {
    lookAheadDist = Math.max(12, Math.min(lookAheadDist, leadDs * 0.85));
  }

  const targetSample = sampleTrackAtT(
    compiledTrack,
    car.trackT + lookAheadDist / Math.max(100, compiledTrack.totalLength),
  );
  const targetX = targetSample.x + targetSample.nx * steerTargetOffset;
  const targetZ = targetSample.z + targetSample.nz * steerTargetOffset;

  const dx = targetX - car.x;
  const dz = targetZ - car.z;
  const desiredHeading = Math.atan2(dx, dz);
  let headingErr = desiredHeading - car.heading;
  while (headingErr > Math.PI) headingErr -= Math.PI * 2;
  while (headingErr < -Math.PI) headingErr += Math.PI * 2;

  const safeDt = Math.max(0.005, dt);
  const errDeriv = Math.max(-8, Math.min(8, (headingErr - (car.aiPrevHeadingErr || 0)) / safeDt));
  car.aiPrevHeadingErr = headingErr;

  // stepCarPhysics: heading -= steer * rate -> positive headingErr (target left) requires steer < 0
  const kp = 2.45;
  const kd = 0.14;
  let steer = -(headingErr * kp + errDeriv * kd);

  let throttle = Math.min(cornerThrottle, avoidThrottleCap);
  let brake = Math.max(cornerBrake, avoidBrake);

  // ==================== 6. OFF-TRACK GUARDRAIL OVERRIDE ====================
  if (!enteringPit && !car.inPitLane && Math.abs(car.lateralOffset) > halfW * 0.78) {
    const excessRatio = (Math.abs(car.lateralOffset) - halfW * 0.78) / Math.max(1, halfW * 0.22);
    // Lift throttle 30-50% to arrest drift velocity and stabilize front grip
    throttle = Math.min(throttle, Math.max(0.50, 0.70 - Math.min(0.20, excessRatio * 0.15)));
    // Corrective inward steering bias: lateralOffset > 0 (right) -> steer < 0 (left)
    const inwardBias = Math.min(0.65, 0.25 + excessRatio * 0.45);
    steer += -Math.sign(car.lateralOffset) * inwardBias;
  }

  steer = Math.max(-1, Math.min(1, steer));

  if (car.inPitLane) {
    throttle = car.speed < 14.5 ? 0.55 : 0;
    brake = car.speed > 16.5 ? 0.85 : 0;
  } else if (personality === 'Tire-Saver' && car.tireWear > 45 && Math.abs(steer) > 0.55 && brake === 0) {
    throttle = Math.min(throttle, 0.84);
  }

  // Trigger Class / Car Special on straights when clear ahead
  const resolvedSpecial = resolveCarSpecial(car.carSpec);
  const onStraight = nearCurv < 0.01 && Math.abs(steer) < 0.18 && maxBrakeRatio < 0.5;
  let specialPressed = false;
  if (resolvedSpecial.specialType === 'active-aero') {
    if (onStraight && !car.specialActive && car.speed > 26) specialPressed = true;
    if (!onStraight && car.specialActive) specialPressed = true;
  } else if (resolvedSpecial.specialType === 'attack-mode') {
    if (onStraight && !car.specialActive && car.attackModeUsesRemaining > 0 && car.speed > 25) {
      specialPressed = true;
    }
  } else if (onStraight && !car.specialActive && car.specialCharge > 50 && car.speed > 24 && !leadCar) {
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
