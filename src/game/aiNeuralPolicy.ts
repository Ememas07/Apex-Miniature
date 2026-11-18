import aiPolicyWeightsRaw from './aiPolicyWeights.json';
import { BoPMultipliers } from './cars';
import {
  CarSimState,
  computeAIControl,
  ControlInput,
} from './physics';
import { CompiledTrack, sampleTrackAtT } from './tracks';
import { AIDifficulty } from './types';

export interface PolicyWeights {
  obsDim: number;
  w0: number[][];
  b0: number[];
  w1: number[][];
  b1: number[];
  w2: number[][];
  b2: number[];
}

export const AI_POLICY_WEIGHTS: PolicyWeights = aiPolicyWeightsRaw as PolicyWeights;

export const LOOKAHEAD_METERS = [12, 25, 42, 65, 95, 135, 185, 250];
export const TRAFFIC_SLOTS = 4;

/**
 * Maps game AI difficulty or pace multiplier smoothly to the neural skillTarget in [0.65 .. 1.05].
 * Lower difficulties genuinely brake earlier and carry less apex speed without artificial rubber-banding.
 */
export function mapDifficultyToSkillTarget(
  difficulty?: AIDifficulty | string,
  paceMultiplier?: number,
): number {
  if (difficulty === 'Rookie') return 0.72;
  if (difficulty === 'Amateur') return 0.81;
  if (difficulty === 'Pro') return 0.90;
  if (difficulty === 'Alien') return 1.00;

  if (paceMultiplier !== undefined) {
    // Map pace multiplier [0.80 .. 1.15] smoothly into [0.68 .. 1.05]
    return Math.max(0.65, Math.min(1.05, 0.72 + (paceMultiplier - 0.84) * 1.15));
  }
  return 0.90;
}

/**
 * Constructs the authentic 43-float observation vector matching scripts/rlSimServer.ts:
 * 0..9: [forwardVel/100, lateralVel/30, lateralOffset/halfW, headingErr/Math.PI, yawRate/3.0, prevSteer, normTopSpeed, normGrip, normDownforce, normBraking]
 * 10..25: 8 spline lookahead points [12, 25, 42, 65, 95, 135, 185, 250]m -> [clamp(curvature * 40, -1, 1), dHeading / Math.PI]
 * 26..41: 4 nearest cars within [-25m, +85m] sorted by abs(relLong) -> [relLong/80, relLat/halfW, relSpeed/50, sameClass], padded with [1.0, 0.0, 0.0, 0.0]
 * 42: skillTarget in [0.65 .. 1.05]
 */
export function buildObservationVector(
  car: CarSimState,
  compiledTrack: CompiledTrack,
  allCars: CarSimState[],
  prevSteer: number,
  skillTarget: number,
  bop?: BoPMultipliers,
): number[] {
  const currentSample = sampleTrackAtT(compiledTrack, car.trackT);
  const halfW = Math.max(1, (currentSample.width ?? compiledTrack.spec.trackWidth) * 0.5);
  const trackHeading = Math.atan2(currentSample.tx, currentSample.tz);

  let headingErr = car.heading - trackHeading;
  while (headingErr > Math.PI) headingErr -= Math.PI * 2;
  while (headingErr < -Math.PI) headingErr += Math.PI * 2;

  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  const forwardVel = car.vx * sinH + car.vz * cosH;
  const lateralVel = car.vx * cosH - car.vz * sinH;

  const activeBop =
    bop ??
    car.bopMultipliers ?? {
      topSpeedMult: 1.0,
      gripMult: 1.0,
      downforceMult: 1.0,
      brakingMult: 1.0,
    };
  const attrs = car.carSpec.attributes;
  const normTopSpeed =
    ((attrs.topSpeed * 3.6) * activeBop.topSpeedMult) / 360;
  const normGrip =
    ((attrs.corneringGrip / 100 * 2.2) * activeBop.gripMult) / 2.2;
  const normDownforce = (activeBop.downforceMult) / 3.0;
  const normBraking =
    ((attrs.braking / 100 * 2.2) * activeBop.brakingMult) / 2.2;

  const obs: number[] = [
    forwardVel / 100,
    lateralVel / 30,
    car.lateralOffset / halfW,
    headingErr / Math.PI,
    (car.yawRate ?? 0) / 3.0,
    prevSteer,
    normTopSpeed,
    normGrip,
    normDownforce,
    normBraking,
  ];

  // 16 lookahead track curvature & heading delta features
  for (const dist of LOOKAHEAD_METERS) {
    const ahead = sampleTrackAtT(
      compiledTrack,
      car.trackT + dist / Math.max(100, compiledTrack.totalLength),
    );
    const aheadHeading = Math.atan2(ahead.tx, ahead.tz);
    let dHeading = aheadHeading - trackHeading;
    while (dHeading > Math.PI) dHeading -= Math.PI * 2;
    while (dHeading < -Math.PI) dHeading += Math.PI * 2;

    const curv = ahead.curvature ?? 0;
    obs.push(Math.max(-1, Math.min(1, curv * 40)));
    obs.push(dHeading / Math.PI);
  }

  // 16 traffic radar features
  const nearby: {
    absDist: number;
    relLong: number;
    relLat: number;
    relSpeed: number;
    sameClass: number;
  }[] = [];

  const activeClass = car.carSpec.classId;

  for (let i = 0; i < allCars.length; i++) {
    const other = allCars[i];
    if (other.id === car.id || other.pitStopRemaining > 0) continue;

    let dt = other.trackT - car.trackT;
    while (dt > 0.5) dt -= 1;
    while (dt < -0.5) dt += 1;
    const relLong = dt * compiledTrack.totalLength;
    if (relLong < -25 || relLong > 85) continue;

    const sameClass = other.carSpec.classId === activeClass ? 1.0 : 0.0;

    nearby.push({
      absDist: Math.abs(relLong),
      relLong: Math.max(-1, Math.min(1, relLong / 80)),
      relLat: Math.max(-2, Math.min(2, (other.lateralOffset - car.lateralOffset) / halfW)),
      relSpeed: Math.max(-1, Math.min(1, (car.speed - other.speed) / 50)),
      sameClass,
    });
  }

  nearby.sort((a, b) => a.absDist - b.absDist);

  for (let i = 0; i < TRAFFIC_SLOTS; i++) {
    if (i < nearby.length) {
      obs.push(nearby[i].relLong, nearby[i].relLat, nearby[i].relSpeed, nearby[i].sameClass);
    } else {
      obs.push(1.0, 0.0, 0.0, 0.0);
    }
  }

  // Input #43: Target Skill / Pace Scalar [0.65 .. 1.05]
  obs.push(skillTarget);

  return obs;
}

/**
 * Runs forward inference on the 43-input [64, 64] tanh MLP neural driver policy.
 */
export function evaluateNeuralPolicy(
  obs: number[],
  weights: PolicyWeights = AI_POLICY_WEIGHTS,
): { steer: number; throttle: number; brake: number } | null {
  if (
    !weights ||
    weights.obsDim !== 43 ||
    !weights.w0 ||
    !weights.w1 ||
    !weights.w2 ||
    obs.length !== 43
  ) {
    return null;
  }

  // Layer 0: 43 -> 64 (tanh)
  const h0 = new Float32Array(64);
  const w0 = weights.w0;
  const b0 = weights.b0;
  for (let i = 0; i < 64; i++) {
    let sum = b0[i] ?? 0;
    const row = w0[i];
    if (!row) continue;
    for (let j = 0; j < 43; j++) {
      sum += row[j] * obs[j];
    }
    h0[i] = Math.tanh(sum);
  }

  // Layer 1: 64 -> 64 (tanh)
  const h1 = new Float32Array(64);
  const w1 = weights.w1;
  const b1 = weights.b1;
  for (let i = 0; i < 64; i++) {
    let sum = b1[i] ?? 0;
    const row = w1[i];
    if (!row) continue;
    for (let j = 0; j < 64; j++) {
      sum += row[j] * h0[j];
    }
    h1[i] = Math.tanh(sum);
  }

  // Layer 2: 64 -> 3 (linear action heads)
  const out = new Float32Array(3);
  const w2 = weights.w2;
  const b2 = weights.b2;
  for (let i = 0; i < 3; i++) {
    let sum = b2[i] ?? 0;
    const row = w2[i];
    if (!row) continue;
    for (let j = 0; j < 64; j++) {
      sum += row[j] * h1[j];
    }
    out[i] = sum;
  }

  return {
    steer: Math.max(-1, Math.min(1, out[0])),
    throttle: Math.max(0, Math.min(1, (out[1] + 1) * 0.5)),
    brake: Math.max(0, Math.min(1, (out[2] + 1) * 0.5)),
  };
}

/**
 * Computes AI control using the trained 43-input neural driver policy,
 * smoothly blending with the dynamic racing-line & apex solver and falling back cleanly to the heuristic
 * controller when boxing, in pit lane, or if weights fail validation.
 */
export function computeNeuralAIControl(
  car: CarSimState,
  compiledTrack: CompiledTrack,
  allCars: CarSimState[],
  dt: number,
  trackWetness: number,
  difficulty?: AIDifficulty,
): ControlInput {
  // Always evaluate heuristic control for race management, pit triggers, and safety bounds
  const heuristic = computeAIControl(car, compiledTrack, allCars, dt, trackWetness);

  // If boxing on track or finished, defer directly to heuristic controller
  if (car.pitStopRemaining > 0 || car.finished) {
    return heuristic;
  }

  const skillTarget = mapDifficultyToSkillTarget(difficulty, car.aiPaceMultiplier);
  const prevSteer = car.steerAngle;
  const obs = buildObservationVector(
    car,
    compiledTrack,
    allCars,
    prevSteer,
    skillTarget,
    car.bopMultipliers,
  );

  const policyOut = evaluateNeuralPolicy(obs);
  if (!policyOut) {
    return heuristic;
  }

  // Guardrail safety containment: if car drifts excessively wide, heuristic off-track override takes priority
  const currentSample = sampleTrackAtT(compiledTrack, car.trackT);
  const halfW = (currentSample.width ?? compiledTrack.spec.trackWidth) * 0.5;
  const offTrackRatio = Math.abs(car.lateralOffset) / Math.max(1, halfW);

  let blendedSteer = policyOut.steer;
  let blendedThrottle = policyOut.throttle;
  let blendedBrake = policyOut.brake;

  if (offTrackRatio > 0.82) {
    // Smoothly blend toward heuristic recovery steering
    const blendWeight = Math.min(1.0, (offTrackRatio - 0.82) / 0.18);
    blendedSteer = policyOut.steer * (1 - blendWeight) + heuristic.steer * blendWeight;
    blendedThrottle = Math.min(policyOut.throttle, heuristic.throttle);
    blendedBrake = Math.max(policyOut.brake, heuristic.brake);
  }

  // Preserve DRS / special triggers and manual transmission signals from heuristic
  return {
    steer: Math.max(-1, Math.min(1, blendedSteer)),
    throttle: Math.max(0, Math.min(1, blendedThrottle)),
    brake: Math.max(0, Math.min(1, blendedBrake)),
    specialPressed: heuristic.specialPressed,
    specialJustPressed: heuristic.specialJustPressed,
    shiftUp: heuristic.shiftUp,
    shiftDown: heuristic.shiftDown,
  };
}
