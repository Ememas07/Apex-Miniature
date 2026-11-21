import { CAR_CLASSES } from './cars';
import type { CarSimState } from './physics';
import { CompiledTrack, sampleTrackAtT } from './tracks';
import {
  AIDifficulty,
  AiNeuralTelemetrySnapshot,
  AIPersonality,
  DamageLevel,
  LiveryConfig,
  PitServiceAction,
  TireCompound,
} from './types';

// ============================================================================
// 4.1.3 DRIVER ROSTER & PERSISTENT AI PERSONALITIES (12 x 2-CAR TEAMS = 24)
// ============================================================================

export interface AiDriverProfile {
  id: string;
  name: string;
  shortName: string;
  nationality: string; // 3-letter motorsport ISO code
  teamId: string;
  teamName: string;
  teammateId: string;
  rivalId: string;
  carNumber: string;
  personality: AIPersonality;
  skill: number; // 0.88 .. 1.04
  aggression: number; // 0.25 .. 0.95
  consistency: number; // 0.72 .. 0.99
  wetSkill: number; // 0.85 .. 1.06
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor: string;
}

export const AI_DRIVER_ROSTER: readonly AiDriverProfile[] = [
  // Team 1: Scuderia Valenti (Rosso Corsa)
  {
    id: 'l-rossi',
    name: 'L. Rossi',
    shortName: 'ROS',
    nationality: 'ITA',
    teamId: 'scuderia-valenti',
    teamName: 'Scuderia Valenti',
    teammateId: 'm-bellini',
    rivalId: 'e-laurent',
    carNumber: '51',
    personality: 'Late-Braker',
    skill: 1.03,
    aggression: 0.88,
    consistency: 0.94,
    wetSkill: 1.02,
    primaryColor: '#c8102e',
    secondaryColor: '#facc15',
    tertiaryColor: '#111827',
  },
  {
    id: 'm-bellini',
    name: 'M. Bellini',
    shortName: 'BEL',
    nationality: 'ITA',
    teamId: 'scuderia-valenti',
    teamName: 'Scuderia Valenti',
    teammateId: 'l-rossi',
    rivalId: 'k-takahashi',
    carNumber: '50',
    personality: 'Metronome',
    skill: 1.00,
    aggression: 0.65,
    consistency: 0.97,
    wetSkill: 0.98,
    primaryColor: '#c8102e',
    secondaryColor: '#f8fafc',
    tertiaryColor: '#facc15',
  },
  // Team 2: Alpine Nord Motorsport (French Racing Blue)
  {
    id: 'e-laurent',
    name: 'E. Laurent',
    shortName: 'LAU',
    nationality: 'FRA',
    teamId: 'alpine-nord',
    teamName: 'Alpine Nord',
    teammateId: 'c-moreau',
    rivalId: 'l-rossi',
    carNumber: '36',
    personality: 'Traffic-Smart',
    skill: 1.02,
    aggression: 0.78,
    consistency: 0.95,
    wetSkill: 1.04,
    primaryColor: '#0055a4',
    secondaryColor: '#ec4899',
    tertiaryColor: '#f8fafc',
  },
  {
    id: 'c-moreau',
    name: 'C. Moreau',
    shortName: 'MOR',
    nationality: 'FRA',
    teamId: 'alpine-nord',
    teamName: 'Alpine Nord',
    teammateId: 'e-laurent',
    rivalId: 'm-weber',
    carNumber: '35',
    personality: 'Tire-Saver',
    skill: 0.97,
    aggression: 0.52,
    consistency: 0.96,
    wetSkill: 1.01,
    primaryColor: '#0055a4',
    secondaryColor: '#38bdf8',
    tertiaryColor: '#ec4899',
  },
  // Team 3: Fuji Works GT (Championship White & Crimson)
  {
    id: 'k-takahashi',
    name: 'K. Takahashi',
    shortName: 'TAK',
    nationality: 'JPN',
    teamId: 'fuji-works',
    teamName: 'Fuji Works',
    teammateId: 'r-sato',
    rivalId: 'm-bellini',
    carNumber: '7',
    personality: 'Metronome',
    skill: 1.03,
    aggression: 0.70,
    consistency: 0.99,
    wetSkill: 1.05,
    primaryColor: '#e2e8f0',
    secondaryColor: '#dc2626',
    tertiaryColor: '#0f172a',
  },
  {
    id: 'r-sato',
    name: 'R. Sato',
    shortName: 'SAT',
    nationality: 'JPN',
    teamId: 'fuji-works',
    teamName: 'Fuji Works',
    teammateId: 'k-takahashi',
    rivalId: 'd-silva',
    carNumber: '8',
    personality: 'Late-Braker',
    skill: 0.98,
    aggression: 0.86,
    consistency: 0.90,
    wetSkill: 0.99,
    primaryColor: '#e2e8f0',
    secondaryColor: '#111827',
    tertiaryColor: '#dc2626',
  },
  // Team 4: Stuttgart Corsa (Silver Arrows & Petronas Cyan)
  {
    id: 'm-weber',
    name: 'M. Weber',
    shortName: 'WEB',
    nationality: 'DEU',
    teamId: 'stuttgart-corsa',
    teamName: 'Stuttgart Corsa',
    teammateId: 'h-vogel',
    rivalId: 'c-moreau',
    carNumber: '63',
    personality: 'Tire-Saver',
    skill: 1.01,
    aggression: 0.62,
    consistency: 0.97,
    wetSkill: 1.03,
    primaryColor: '#94a3b8',
    secondaryColor: '#06b6d4',
    tertiaryColor: '#0f172a',
  },
  {
    id: 'h-vogel',
    name: 'H. Vogel',
    shortName: 'VOG',
    nationality: 'DEU',
    teamId: 'stuttgart-corsa',
    teamName: 'Stuttgart Corsa',
    teammateId: 'm-weber',
    rivalId: 'a-foster',
    carNumber: '44',
    personality: 'Traffic-Smart',
    skill: 0.99,
    aggression: 0.75,
    consistency: 0.93,
    wetSkill: 0.97,
    primaryColor: '#94a3b8',
    secondaryColor: '#facc15',
    tertiaryColor: '#06b6d4',
  },
  // Team 5: Silverstone Velocity (Papaya & Carbon)
  {
    id: 'a-foster',
    name: 'A. Foster',
    shortName: 'FOS',
    nationality: 'GBR',
    teamId: 'silverstone-velocity',
    teamName: 'Silverstone Velocity',
    teammateId: 'o-hart',
    rivalId: 'h-vogel',
    carNumber: '4',
    personality: 'Late-Braker',
    skill: 1.02,
    aggression: 0.85,
    consistency: 0.92,
    wetSkill: 1.06,
    primaryColor: '#f97316',
    secondaryColor: '#0f172a',
    tertiaryColor: '#38bdf8',
  },
  {
    id: 'o-hart',
    name: 'O. Hart',
    shortName: 'HAR',
    nationality: 'GBR',
    teamId: 'silverstone-velocity',
    teamName: 'Silverstone Velocity',
    teammateId: 'a-foster',
    rivalId: 's-lindqvist',
    carNumber: '81',
    personality: 'Metronome',
    skill: 0.99,
    aggression: 0.68,
    consistency: 0.96,
    wetSkill: 1.02,
    primaryColor: '#f97316',
    secondaryColor: '#f8fafc',
    tertiaryColor: '#0f172a',
  },
  // Team 6: Nordic Hyperworks (Ice Blue & Neon Lime)
  {
    id: 's-lindqvist',
    name: 'S. Lindqvist',
    shortName: 'LIN',
    nationality: 'SWE',
    teamId: 'nordic-hyperworks',
    teamName: 'Nordic Hyperworks',
    teammateId: 'm-korhonen',
    rivalId: 'o-hart',
    carNumber: '17',
    personality: 'Tire-Saver',
    skill: 0.98,
    aggression: 0.56,
    consistency: 0.95,
    wetSkill: 1.05,
    primaryColor: '#0284c7',
    secondaryColor: '#a3e635',
    tertiaryColor: '#0f172a',
  },
  {
    id: 'm-korhonen',
    name: 'M. Korhonen',
    shortName: 'KOR',
    nationality: 'FIN',
    teamId: 'nordic-hyperworks',
    teamName: 'Nordic Hyperworks',
    teammateId: 's-lindqvist',
    rivalId: 'n-van-dijk',
    carNumber: '77',
    personality: 'Metronome',
    skill: 0.97,
    aggression: 0.60,
    consistency: 0.98,
    wetSkill: 1.04,
    primaryColor: '#0284c7',
    secondaryColor: '#f8fafc',
    tertiaryColor: '#a3e635',
  },
  // Team 7: Paulista Endurance (Emerald & Gold)
  {
    id: 'd-silva',
    name: 'D. Silva',
    shortName: 'SIL',
    nationality: 'BRA',
    teamId: 'paulista-endurance',
    teamName: 'Paulista Endurance',
    teammateId: 'g-mendes',
    rivalId: 'r-sato',
    carNumber: '12',
    personality: 'Traffic-Smart',
    skill: 1.00,
    aggression: 0.82,
    consistency: 0.91,
    wetSkill: 1.03,
    primaryColor: '#15803d',
    secondaryColor: '#facc15',
    tertiaryColor: '#052e16',
  },
  {
    id: 'g-mendes',
    name: 'G. Mendes',
    shortName: 'MEN',
    nationality: 'BRA',
    teamId: 'paulista-endurance',
    teamName: 'Paulista Endurance',
    teammateId: 'd-silva',
    rivalId: 'r-gomez',
    carNumber: '19',
    personality: 'Late-Braker',
    skill: 0.95,
    aggression: 0.89,
    consistency: 0.87,
    wetSkill: 0.99,
    primaryColor: '#15803d',
    secondaryColor: '#f8fafc',
    tertiaryColor: '#facc15',
  },
  // Team 8: Oranje Apex Racing (Deep Navy & Racing Orange)
  {
    id: 'n-van-dijk',
    name: 'N. Van Dijk',
    shortName: 'VDI',
    nationality: 'NLD',
    teamId: 'oranje-apex',
    teamName: 'Oranje Apex',
    teammateId: 'b-peeters',
    rivalId: 'm-korhonen',
    carNumber: '33',
    personality: 'Late-Braker',
    skill: 1.04,
    aggression: 0.93,
    consistency: 0.96,
    wetSkill: 1.06,
    primaryColor: '#1e1b4b',
    secondaryColor: '#ea580c',
    tertiaryColor: '#facc15',
  },
  {
    id: 'b-peeters',
    name: 'B. Peeters',
    shortName: 'PEE',
    nationality: 'BEL',
    teamId: 'oranje-apex',
    teamName: 'Oranje Apex',
    teammateId: 'n-van-dijk',
    rivalId: 'j-mccall',
    carNumber: '22',
    personality: 'Traffic-Smart',
    skill: 0.96,
    aggression: 0.72,
    consistency: 0.92,
    wetSkill: 1.00,
    primaryColor: '#1e1b4b',
    secondaryColor: '#ef4444',
    tertiaryColor: '#f8fafc',
  },
  // Team 9: Iberian GT Factory (Crimson & Midnight)
  {
    id: 'r-gomez',
    name: 'R. Gomez',
    shortName: 'GOM',
    nationality: 'ESP',
    teamId: 'iberian-gt',
    teamName: 'Iberian GT',
    teammateId: 'p-navarro',
    rivalId: 'g-mendes',
    carNumber: '55',
    personality: 'Traffic-Smart',
    skill: 0.99,
    aggression: 0.76,
    consistency: 0.95,
    wetSkill: 0.98,
    primaryColor: '#991b1b',
    secondaryColor: '#fbbf24',
    tertiaryColor: '#111827',
  },
  {
    id: 'p-navarro',
    name: 'P. Navarro',
    shortName: 'NAV',
    nationality: 'ESP',
    teamId: 'iberian-gt',
    teamName: 'Iberian GT',
    teammateId: 'r-gomez',
    rivalId: 't-chen',
    carNumber: '14',
    personality: 'Tire-Saver',
    skill: 0.97,
    aggression: 0.64,
    consistency: 0.97,
    wetSkill: 1.01,
    primaryColor: '#991b1b',
    secondaryColor: '#e2e8f0',
    tertiaryColor: '#fbbf24',
  },
  // Team 10: Pacific Works Racing (Teal & Graphite)
  {
    id: 't-chen',
    name: 'T. Chen',
    shortName: 'CHE',
    nationality: 'AUS',
    teamId: 'pacific-works',
    teamName: 'Pacific Works',
    teammateId: 'l-parker',
    rivalId: 'p-navarro',
    carNumber: '24',
    personality: 'Metronome',
    skill: 0.96,
    aggression: 0.61,
    consistency: 0.94,
    wetSkill: 0.96,
    primaryColor: '#0f766e',
    secondaryColor: '#f59e0b',
    tertiaryColor: '#0f172a',
  },
  {
    id: 'l-parker',
    name: 'L. Parker',
    shortName: 'PAR',
    nationality: 'NZL',
    teamId: 'pacific-works',
    teamName: 'Pacific Works',
    teammateId: 't-chen',
    rivalId: 'v-novak',
    carNumber: '27',
    personality: 'Late-Braker',
    skill: 0.94,
    aggression: 0.84,
    consistency: 0.89,
    wetSkill: 0.98,
    primaryColor: '#0f766e',
    secondaryColor: '#f8fafc',
    tertiaryColor: '#f59e0b',
  },
  // Team 11: Northstar Motorsport (Midnight Blue & Red)
  {
    id: 'j-mccall',
    name: 'J. McCall',
    shortName: 'MCC',
    nationality: 'USA',
    teamId: 'northstar-motorsport',
    teamName: 'Northstar Motorsport',
    teammateId: 'k-bouchard',
    rivalId: 'b-peeters',
    carNumber: '2',
    personality: 'Late-Braker',
    skill: 0.95,
    aggression: 0.87,
    consistency: 0.88,
    wetSkill: 0.93,
    primaryColor: '#1d4ed8',
    secondaryColor: '#ef4444',
    tertiaryColor: '#f8fafc',
  },
  {
    id: 'k-bouchard',
    name: 'K. Bouchard',
    shortName: 'BOU',
    nationality: 'CAN',
    teamId: 'northstar-motorsport',
    teamName: 'Northstar Motorsport',
    teammateId: 'j-mccall',
    rivalId: 'm-kovacs',
    carNumber: '18',
    personality: 'Tire-Saver',
    skill: 0.93,
    aggression: 0.55,
    consistency: 0.93,
    wetSkill: 0.97,
    primaryColor: '#1d4ed8',
    secondaryColor: '#f8fafc',
    tertiaryColor: '#ef4444',
  },
  // Team 12: Central Euro Racing (British Racing Green & Gold)
  {
    id: 'v-novak',
    name: 'V. Novak',
    shortName: 'NOV',
    nationality: 'AUT',
    teamId: 'central-euro',
    teamName: 'Central Euro',
    teammateId: 'm-kovacs',
    rivalId: 'l-parker',
    carNumber: '91',
    personality: 'Traffic-Smart',
    skill: 0.95,
    aggression: 0.71,
    consistency: 0.92,
    wetSkill: 0.99,
    primaryColor: '#065f46',
    secondaryColor: '#eab308',
    tertiaryColor: '#f8fafc',
  },
  {
    id: 'm-kovacs',
    name: 'M. Kovacs',
    shortName: 'KOV',
    nationality: 'CHE',
    teamId: 'central-euro',
    teamName: 'Central Euro',
    teammateId: 'v-novak',
    rivalId: 'k-bouchard',
    carNumber: '92',
    personality: 'Metronome',
    skill: 0.92,
    aggression: 0.58,
    consistency: 0.95,
    wetSkill: 0.96,
    primaryColor: '#065f46',
    secondaryColor: '#f8fafc',
    tertiaryColor: '#eab308',
  },
] as const;

export interface AiRosterAssignment {
  profile: AiDriverProfile;
  paceMultiplier: number;
  applyCoordinatedLivery: (baseLivery: LiveryConfig, hasTeamPresets: boolean) => LiveryConfig;
}

export function getAiDriverProfile(id: string | undefined): AiDriverProfile | null {
  if (!id) return null;
  return AI_DRIVER_ROSTER.find((d) => d.id === id) ?? null;
}

/**
 * Assigns structured 2-car team pairings from AI_DRIVER_ROSTER with realistic pace spread
 * while preserving team livery coordination.
 */
export function assignAiRosterGrid(
  count: number,
  difficulty: AIDifficulty,
  baseDifficultyMultiplier: number,
): AiRosterAssignment[] {
  const result: AiRosterAssignment[] = [];
  for (let i = 0; i < count; i++) {
    const profile = AI_DRIVER_ROSTER[i % AI_DRIVER_ROSTER.length];
    // Combine driver skill rating with difficulty spread (wider on Alien so field spreads naturally)
    const skillDelta = profile.skill - 0.98; // roughly -0.06 .. +0.06
    const spreadScale = difficulty === 'Alien' ? 1.15 : difficulty === 'Pro' ? 0.95 : 0.75;
    const paceMultiplier = Math.max(
      0.74,
      Math.min(1.06, baseDifficultyMultiplier * (1 + skillDelta * spreadScale)),
    );
    result.push({
      profile,
      paceMultiplier,
      applyCoordinatedLivery(baseLivery: LiveryConfig, hasTeamPresets: boolean): LiveryConfig {
        if (hasTeamPresets) {
          return {
            ...baseLivery,
            driverNumber: profile.carNumber,
          };
        }
        return {
          ...baseLivery,
          primaryColor: profile.primaryColor,
          secondaryColor: profile.secondaryColor,
          tertiaryColor: profile.tertiaryColor,
          driverNumber: profile.carNumber,
        };
      },
    });
  }
  return result;
}

// ============================================================================
// 4.2.3 PER-PERSONALITY NEURAL POLICY BLENDING
// ============================================================================

export interface PersonalityPolicyProfile {
  mixWeights: Record<'v1' | 'v2', number>;
  label: string;
  brakeBias: number; // <1 brakes slightly later, >1 brakes earlier
  throttleSmoothness: number; // <1 smoother corner-exit throttle
  overtakeAggression: number; // >1 pulls out sooner / commits harder
  wetConfidence: number;
}

export const PERSONALITY_POLICY_PROFILES: Record<AIPersonality, PersonalityPolicyProfile> = {
  'Late-Braker': {
    mixWeights: { v1: 35, v2: 65 },
    label: 'Late-Braker (v2 65% · v1 35%)',
    brakeBias: 0.93,
    throttleSmoothness: 1.02,
    overtakeAggression: 1.18,
    wetConfidence: 0.96,
  },
  Metronome: {
    mixWeights: { v1: 55, v2: 45 },
    label: 'Metronome (v1 55% · v2 45%)',
    brakeBias: 1.0,
    throttleSmoothness: 0.98,
    overtakeAggression: 0.95,
    wetConfidence: 1.02,
  },
  'Tire-Saver': {
    mixWeights: { v1: 70, v2: 30 },
    label: 'Tire-Saver (v1 70% · v2 30%)',
    brakeBias: 1.06,
    throttleSmoothness: 0.91,
    overtakeAggression: 0.88,
    wetConfidence: 1.04,
  },
  'Traffic-Smart': {
    mixWeights: { v1: 20, v2: 80 },
    label: 'Traffic-Smart (v2 80% · v1 20%)',
    brakeBias: 0.98,
    throttleSmoothness: 0.97,
    overtakeAggression: 1.14,
    wetConfidence: 1.01,
  },
};

export function resolvePersonalityBlendedMix(
  baseMix: Record<'v1' | 'v2', number>,
  personality: AIPersonality | undefined,
  enabled: boolean,
): Record<'v1' | 'v2', number> {
  if (!enabled || !personality) return baseMix;
  const profile = PERSONALITY_POLICY_PROFILES[personality];
  if (!profile) return baseMix;

  const keys = ['v1', 'v2'] as const;
  let baseSum = 0;
  for (const k of keys) baseSum += Math.max(0, baseMix[k] ?? 0);
  if (baseSum <= 0) return { ...profile.mixWeights };

  const out = { v1: 0, v2: 0 };
  for (const k of keys) {
    const bNorm = ((baseMix[k] ?? 0) / baseSum) * 100;
    const pNorm = profile.mixWeights[k];
    out[k] = Math.round((bNorm * 0.55 + pNorm * 0.45) * 10) / 10;
  }
  return out;
}

// ============================================================================
// 4.1.2 AUTHENTIC AI ON-TRACK STRATEGY & WEATHER REACTIVITY (NO PIT LANES!)
// ============================================================================

export interface AiStrategyDecision {
  action: PitServiceAction;
  compound?: TireCompound;
  reason: string;
  urgency: 'critical' | 'strategic';
}

export interface AiStrategyContext {
  car: CarSimState;
  allCars: CarSimState[];
  trackWetness: number;
  remainingLaps: number; // approximate laps left (or estimated from timed race)
  isTimedRace: boolean;
  raceTimeRemainingSeconds: number | null;
  damageLevel?: DamageLevel;
}

function chooseOptimalDryCompound(remainingLaps: number, personality: AIPersonality): TireCompound {
  if (remainingLaps <= 3.5) return 'soft';
  if (remainingLaps <= 8.5) return personality === 'Tire-Saver' ? 'soft' : 'medium';
  return personality === 'Late-Braker' ? 'medium' : 'hard';
}

/**
 * Evaluates full race strategy for an AI car using Apex Miniature's stationary
 * on-track service mechanic (strictly NO physical pit lanes).
 * Handles weather crossovers, fuel < 1.2 laps, tire cliff + undercut/overcut offsets,
 * and heavy localized/aero damage repairs.
 */
export function evaluateAiRaceStrategy(ctx: AiStrategyContext): AiStrategyDecision | null {
  const { car, allCars, trackWetness, remainingLaps, isTimedRace, raceTimeRemainingSeconds, damageLevel } = ctx;
  if (car.finished || car.pitStopRemaining > 0 || car.pitCooldown > 0 || car.aiPendingStop) {
    return null;
  }

  // Do not pit on the final lap unless critically out of fuel or completely undriveable on slicks in monsoon
  const enoughRaceLeft = isTimedRace
    ? (raceTimeRemainingSeconds ?? 0) > 55
    : remainingLaps >= 1.0;

  const personality: AIPersonality = car.personality ?? 'Metronome';
  const wetSkill = car.aiWetSkill ?? 1.0;

  // 1. Critical Fuel Check (< 1.2 laps remaining)
  if (car.fuelLapsRemaining < 1.2 || car.fuel < 7.5) {
    return {
      action: 'fuel',
      reason: 'Fuel critical (<1.2 laps) — on-track refuel',
      urgency: 'critical',
    };
  }

  // 2. Dynamic Weather Crossover Swaps (slicks <-> wets)
  // High wet-skill drivers stay out slightly longer on slicks in light dampness; cautious drivers box earlier.
  const wetCrossover = Math.max(0.30, Math.min(0.46, 0.36 + (wetSkill - 1.0) * 0.5));
  const dryCrossover = Math.max(0.12, Math.min(0.22, 0.17 - (wetSkill - 1.0) * 0.25));

  if (trackWetness >= wetCrossover && car.compound !== 'wet' && (enoughRaceLeft || trackWetness >= 0.58)) {
    return {
      action: 'tyres',
      compound: 'wet',
      reason: `Rain crossover (${Math.round(trackWetness * 100)}% wet) — switching to Wets`,
      urgency: trackWetness >= 0.52 ? 'critical' : 'strategic',
    };
  }

  if (trackWetness <= dryCrossover && car.compound === 'wet' && enoughRaceLeft) {
    const dryComp = chooseOptimalDryCompound(remainingLaps, personality);
    return {
      action: 'tyres',
      compound: dryComp,
      reason: `Dry track crossover — switching to ${dryComp.toUpperCase()} slicks`,
      urgency: 'strategic',
    };
  }

  if (!enoughRaceLeft) return null;

  // 3. Heavy Mechanical / Aero Damage Repair (3.0s on-track quick repair)
  const dmg = car.damage;
  const maxComponentDmg = dmg
    ? Math.max(dmg.frontWing, dmg.rearWing, dmg.engine, dmg.suspension)
    : car.aeroDamage;
  if (damageLevel !== 'off' && (car.aeroDamage >= 46 || maxComponentDmg >= 58)) {
    return {
      action: 'repair',
      reason: `Heavy damage (${Math.round(Math.max(car.aeroDamage, maxComponentDmg))}%) — on-track repair`,
      urgency: 'critical',
    };
  }

  // 4. Tire Cliff & Undercut/Overcut Strategy
  // Check if stuck in dirty air right behind a same-class car (undercut trigger)
  let stuckInDirtyAir = false;
  for (let i = 0; i < allCars.length; i++) {
    const other = allCars[i];
    if (other.id === car.id || other.finished || other.pitStopRemaining > 0) continue;
    if (other.carSpec.classId !== car.carSpec.classId) continue;
    const distDiff = other.totalDistance - car.totalDistance;
    if (distDiff > 0.001 && distDiff < 0.022) {
      stuckInDirtyAir = true;
      break;
    }
  }

  // Personality-driven stint cliff thresholds:
  // Tire-Saver overcuts longer; Late-Braker undercuts earlier especially when stuck behind traffic.
  const baseWearThreshold =
    personality === 'Tire-Saver'
      ? 16
      : personality === 'Late-Braker'
      ? 25
      : personality === 'Traffic-Smart'
      ? 23
      : 21;
  const undercutBonus =
    stuckInDirtyAir && personality !== 'Tire-Saver' ? 7 : 0;
  const effectiveWearThreshold = baseWearThreshold + undercutBonus;

  if (car.tireWear <= effectiveWearThreshold) {
    const nextComp =
      trackWetness >= 0.32 ? 'wet' : chooseOptimalDryCompound(remainingLaps, personality);
    return {
      action: 'tyres',
      compound: nextComp,
      reason:
        undercutBonus > 0 && car.tireWear > baseWearThreshold
          ? `Undercut in traffic (${Math.round(car.tireWear)}% wear) — fresh ${nextComp.toUpperCase()}`
          : `Tire cliff (${Math.round(car.tireWear)}% wear) — fresh ${nextComp.toUpperCase()}`,
      urgency: car.tireWear <= 14 ? 'critical' : 'strategic',
    };
  }

  return null;
}

// ============================================================================
// 4.1.1 MULTI-CLASS TRAFFIC ETIQUETTE & 4.1.5 ONE-MOVE DEFENSIVE RACECRAFT
// ============================================================================

export interface RacecraftOverlayResult {
  overrideTargetOffset: number | null;
  suppressStraightBraking: boolean;
  throttleMultiplier: number;
  maneuver: 'racing' | 'overtaking' | 'defending' | 'blue-flag';
  underDefensivePressure: boolean;
}

/**
 * Evaluates multi-class traffic projection (faster class cleanly passing slower class without
 * false straight-line braking; slower class smoothly yielding off-line under blue flag) and
 * same-class One-Move Defensive Racecraft approaching heavy braking zones.
 */
export function computeRacecraftOverlay(
  car: CarSimState,
  compiledTrack: CompiledTrack,
  allCars: CarSimState[],
  dt: number,
  halfW: number,
  minSafeLane: number,
  maxSafeLane: number,
): RacecraftOverlayResult {
  const trackLen = Math.max(100, compiledTrack.totalLength);
  const myPace = CAR_CLASSES[car.carSpec.classId]?.basePaceIndex ?? 1.0;
  const carWidth = car.carSpec.dimensions?.width ?? 1.95;

  // Check upcoming braking/corner zone (20m..72m ahead)
  const sample25 = sampleTrackAtT(compiledTrack, (car.trackT + 25 / trackLen) % 1);
  const sample50 = sampleTrackAtT(compiledTrack, (car.trackT + 50 / trackLen) % 1);
  const sample72 = sampleTrackAtT(compiledTrack, (car.trackT + 72 / trackLen) % 1);
  const currSample = sampleTrackAtT(compiledTrack, car.trackT);

  const upcomingMaxSignedK =
    Math.abs(sample50.curvature) >= Math.abs(sample25.curvature)
      ? Math.abs(sample72.curvature) > Math.abs(sample50.curvature)
        ? sample72.curvature
        : sample50.curvature
      : sample25.curvature;
  const approachingCorner = Math.abs(upcomingMaxSignedK) > 0.013;
  const inStraight = Math.abs(currSample.curvature) < 0.008;

  let slowerClassAhead: CarSimState | null = null;
  let slowerClassDs = Infinity;
  let fasterClassBehind = false;
  let sameClassAttacker: CarSimState | null = null;
  let sameClassAttackerDs = Infinity;
  let hasSideBySide = false;

  for (let i = 0; i < allCars.length; i++) {
    const other = allCars[i];
    if (other.id === car.id || other.pitStopRemaining > 0 || other.eliminated) continue;

    let dT = other.trackT - car.trackT;
    if (dT > 0.5) dT -= 1;
    if (dT < -0.5) dT += 1;
    const ds = dT * trackLen;

    if (Math.abs(ds) < 5.8 && Math.abs(other.lateralOffset - car.lateralOffset) < carWidth * 2.4) {
      hasSideBySide = true;
    }

    const otherPace = CAR_CLASSES[other.carSpec.classId]?.basePaceIndex ?? 1.0;
    const paceDiff = myPace - otherPace;

    // 1. Faster class approaching slower class ahead (up to 48m)
    if (paceDiff >= 0.08 && ds > 1.8 && ds < 48.0 && ds < slowerClassDs) {
      slowerClassDs = ds;
      slowerClassAhead = other;
    }

    // 2. Slower class being approached by faster class behind (up to 34m)
    if (paceDiff <= -0.08 && ds < -1.5 && ds > -34.0 && other.speed > car.speed - 2.0) {
      fasterClassBehind = true;
    }

    // 3. Same-class rival attacking within 4..18m behind
    if (
      Math.abs(paceDiff) < 0.08 &&
      ds < -4.2 &&
      ds > -18.5 &&
      Math.abs(ds) < sameClassAttackerDs &&
      other.speed >= car.speed - 3.5
    ) {
      sameClassAttackerDs = Math.abs(ds);
      sameClassAttacker = other;
    }
  }

  // Priority A: Blue-flag slower-class predictable yielding
  if ((car.blueFlagActive || fasterClassBehind) && car.speed > 12) {
    car.aiDefenseCommitted = false;
    // Pick the predictable side we are already closer to (never cut across track in front of prototype)
    const yieldTarget =
      car.lateralOffset >= 0
        ? Math.min(maxSafeLane, halfW * 0.66)
        : Math.max(minSafeLane, -halfW * 0.66);
    const shouldEase = fasterClassBehind && Math.abs(car.lateralOffset) < halfW * 0.55;
    return {
      overrideTargetOffset: yieldTarget,
      suppressStraightBraking: false,
      throttleMultiplier: shouldEase ? 0.91 : 0.97,
      maneuver: 'blue-flag',
      underDefensivePressure: false,
    };
  }

  // Priority B: Faster class projecting clean multi-class overtake without unnecessary straight braking
  if (slowerClassAhead && car.speed > slowerClassAhead.speed - 3.0) {
    car.aiDefenseCommitted = false;
    const clearance = carWidth * 1.48;
    const leftEdge = Math.min(maxSafeLane, slowerClassAhead.lateralOffset - clearance);
    const rightEdge = Math.max(minSafeLane, slowerClassAhead.lateralOffset + clearance);
    const leftRoom = Math.max(0, leftEdge - minSafeLane);
    const rightRoom = Math.max(0, maxSafeLane - rightEdge);

    // On corner entry, prefer inside dive if enough room; otherwise choose wider side
    const insideDir = approachingCorner ? Math.sign(upcomingMaxSignedK) : 0;
    let passOffset: number;
    if (insideDir > 0 && rightRoom >= 0.75) {
      passOffset = Math.max(rightEdge, (rightEdge + maxSafeLane) * 0.55);
    } else if (insideDir < 0 && leftRoom >= 0.75) {
      passOffset = Math.min(leftEdge, (minSafeLane + leftEdge) * 0.55);
    } else if (rightRoom >= leftRoom && rightRoom >= 0.5) {
      passOffset = Math.max(rightEdge, (rightEdge + maxSafeLane) * 0.52);
    } else if (leftRoom >= 0.5) {
      passOffset = Math.min(leftEdge, (minSafeLane + leftEdge) * 0.52);
    } else {
      passOffset = car.lateralOffset;
    }

    const clampedPass = Math.max(minSafeLane, Math.min(maxSafeLane, passOffset));
    const lateralClearNow =
      Math.abs(slowerClassAhead.lateralOffset - car.lateralOffset) >= carWidth * 1.15 ||
      (inStraight && slowerClassDs > 11.0 && Math.abs(clampedPass - slowerClassAhead.lateralOffset) >= clearance * 0.95);

    return {
      overrideTargetOffset: clampedPass,
      suppressStraightBraking: inStraight && lateralClearNow && slowerClassDs > 8.5,
      throttleMultiplier: 1.0,
      maneuver: 'overtaking',
      underDefensivePressure: false,
    };
  }

  // Priority C: Same-Class One-Move Defensive Racecraft approaching heavy braking zones
  if (
    sameClassAttacker &&
    !hasSideBySide &&
    approachingCorner &&
    car.speed > 22.0 &&
    !car.aiPendingStop
  ) {
    // Commit at most ONE defensive move toward the inside line of the upcoming corner
    if (!car.aiDefenseCommitted) {
      const insideSign = Math.sign(upcomingMaxSignedK); // +1 right corner -> +nx inside, -1 left corner -> -nx inside
      const defenseLane = Math.max(
        minSafeLane,
        Math.min(maxSafeLane, insideSign * halfW * 0.52),
      );
      car.aiDefenseCommitted = true;
      car.aiDefenseLane = defenseLane;
      car.aiDefenseTimer = 2.6;
    } else if ((car.aiDefenseTimer ?? 0) > 0) {
      car.aiDefenseTimer = Math.max(0, (car.aiDefenseTimer ?? 0) - dt);
    }

    const lockedLane = car.aiDefenseLane ?? car.lateralOffset;
    return {
      overrideTargetOffset: Math.max(minSafeLane, Math.min(maxSafeLane, lockedLane)),
      suppressStraightBraking: false,
      throttleMultiplier: 1.0,
      maneuver: 'defending',
      underDefensivePressure: true,
    };
  }

  // Clear one-move defense flag cleanly on corner exit / when attacker drops back
  if (car.aiDefenseCommitted) {
    if (!approachingCorner || !sameClassAttacker || (car.aiDefenseTimer ?? 0) <= 0) {
      car.aiDefenseCommitted = false;
      car.aiDefenseLane = undefined;
      car.aiDefenseTimer = 0;
    }
  }

  return {
    overrideTargetOffset: null,
    suppressStraightBraking: false,
    throttleMultiplier: 1.0,
    maneuver: 'racing',
    underDefensivePressure: Boolean(sameClassAttacker),
  };
}

// ============================================================================
// 4.1.4 HUMAN-LIKE MISTAKES & REALISM (DIFFICULTY + PRESSURE SCALED)
// ============================================================================

export interface MistakeModulation {
  active: boolean;
  type: 'none' | 'lockup' | 'wide-exit';
  steerDelta: number;
  throttleMultiplier: number;
  brakeMultiplier: number;
}

function deterministicHash01(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Introduces occasional realistic human-like mistakes (brief front brake lock-up or mild
 * wide corner exit) scaled by AIDifficulty, driver consistency, and defensive pressure.
 * Strictly disabled during starts (raceElapsed < 8s), on straights, or at low speed so
 * starts and bump-drafting remain ultra-clean.
 */
export function stepHumanLikeMistake(params: {
  car: CarSimState;
  dt: number;
  difficulty: AIDifficulty | undefined;
  nearCurvature: number;
  brakeInput: number;
  underPressure: boolean;
  raceElapsed: number;
}): MistakeModulation {
  const { car, dt, difficulty, nearCurvature, brakeInput, underPressure, raceElapsed } = params;

  // Decrement cooldown and active mistake timers
  if ((car.aiMistakeCooldown ?? 0) > 0) {
    car.aiMistakeCooldown = Math.max(0, (car.aiMistakeCooldown ?? 0) - dt);
  }

  // Active mistake continuation
  if ((car.aiMistakeTimer ?? 0) > 0) {
    car.aiMistakeTimer = Math.max(0, (car.aiMistakeTimer ?? 0) - dt);
    const activeType = car.aiMistakeType ?? 'wide-exit';
    if (car.aiMistakeTimer <= 0) {
      car.aiMistakeType = undefined;
      return { active: false, type: 'none', steerDelta: 0, throttleMultiplier: 1, brakeMultiplier: 1 };
    }
    if (activeType === 'lockup') {
      car.brakeLockupIntensity = Math.max(car.brakeLockupIntensity ?? 0, 0.58);
      return {
        active: true,
        type: 'lockup',
        steerDelta: (car.aiMistakeDir ?? 1) * 0.08,
        throttleMultiplier: 0.92,
        brakeMultiplier: 0.84, // slight braking overshoot from front lockup
      };
    }
    return {
      active: true,
      type: 'wide-exit',
      steerDelta: (car.aiMistakeDir ?? 1) * 0.14,
      throttleMultiplier: 0.88,
      brakeMultiplier: 1.0,
    };
  }

  // Never trigger mistakes on starts, low speed, pit stops, or clean straights
  if (
    raceElapsed < 8.0 ||
    car.pitStopRemaining > 0 ||
    car.finished ||
    car.speed < 20.0 ||
    (car.aiMistakeCooldown ?? 0) > 0
  ) {
    return { active: false, type: 'none', steerDelta: 0, throttleMultiplier: 1, brakeMultiplier: 1 };
  }

  const inBrakingZone = brakeInput > 0.35 && Math.abs(nearCurvature) > 0.012;
  const inFastCorner = Math.abs(nearCurvature) > 0.016 && brakeInput <= 0.15;
  if (!inBrakingZone && !inFastCorner) {
    return { active: false, type: 'none', steerDelta: 0, throttleMultiplier: 1, brakeMultiplier: 1 };
  }

  // Base rate per second scaled strongly by AIDifficulty & driver consistency
  const diffRate =
    difficulty === 'Rookie'
      ? 0.055
      : difficulty === 'Amateur'
      ? 0.028
      : difficulty === 'Pro'
      ? 0.010
      : difficulty === 'Alien'
      ? 0.0025
      : 0.008;

  const consistency = car.aiConsistency ?? 0.92;
  const inconsistencyFactor = Math.max(0.35, 1.8 - consistency); // 0.81..1.08
  const pressureFactor = underPressure ? 1.55 : 1.0;
  const prob = diffRate * inconsistencyFactor * pressureFactor * dt;

  // Deterministic pseudo-random sample per car + quantized time bucket
  let idHash = 0;
  for (let i = 0; i < car.id.length; i++) idHash = (idHash * 31 + car.id.charCodeAt(i)) % 9973;
  const roll = deterministicHash01(idHash + Math.floor(car.totalTime * 20));

  if (roll < prob) {
    const isLockup = inBrakingZone;
    car.aiMistakeType = isLockup ? 'lockup' : 'wide-exit';
    car.aiMistakeTimer = isLockup ? 0.55 : 0.72;
    car.aiMistakeCooldown = difficulty === 'Rookie' ? 14 : difficulty === 'Amateur' ? 22 : 38;
    // Push slightly toward outside of corner (opposite curvature sign)
    car.aiMistakeDir = nearCurvature >= 0 ? -1 : 1;
    if (isLockup) {
      car.brakeLockupIntensity = Math.max(car.brakeLockupIntensity ?? 0, 0.58);
    }
    return {
      active: true,
      type: car.aiMistakeType,
      steerDelta: car.aiMistakeDir * (isLockup ? 0.08 : 0.14),
      throttleMultiplier: isLockup ? 0.92 : 0.88,
      brakeMultiplier: isLockup ? 0.84 : 1.0,
    };
  }

  return { active: false, type: 'none', steerDelta: 0, throttleMultiplier: 1, brakeMultiplier: 1 };
}

// ============================================================================
// 4.1.6 STUCK / CRASH RECOVERY POLISH (3-POINT REVERSE + >3S GHOSTING)
// ============================================================================

export interface StuckRecoveryOutput {
  active: boolean;
  steer: number;
  throttle: number;
  brake: number;
  ghosted: boolean;
}

/**
 * Monitors spun or wall-wedged AI cars. Executes a clean 3-point reverse recovery after
 * 1.35s wedged/stopped (or spun backwards), and grants temporary spawnGhostTimer if still
 * blocked >3.0s so an AI car never forms a permanent roadblock.
 */
export function stepAiStuckRecovery(
  car: CarSimState,
  compiledTrack: CompiledTrack,
  dt: number,
  isRaceActive: boolean,
): StuckRecoveryOutput {
  if (
    !isRaceActive ||
    car.isPlayer ||
    car.isHumanPeer ||
    car.finished ||
    car.pitStopRemaining > 0 ||
    car.aiPendingStop
  ) {
    car.aiStuckTimer = 0;
    car.aiReverseTimer = 0;
    return { active: false, steer: 0, throttle: 0, brake: 0, ghosted: false };
  }

  const sp = sampleTrackAtT(compiledTrack, car.trackT);
  const trackHeading = Math.atan2(sp.tx, sp.tz);
  let headingErr = trackHeading - car.heading;
  while (headingErr > Math.PI) headingErr -= Math.PI * 2;
  while (headingErr < -Math.PI) headingErr += Math.PI * 2;

  const isSpunBackwards = Math.abs(headingErr) > 1.75 && car.speed < 12;
  const isWedged = car.speed < 2.2;

  if (isWedged || isSpunBackwards) {
    car.aiStuckTimer = (car.aiStuckTimer ?? 0) + dt;
  } else if (car.speed > 5.5 && Math.abs(headingErr) < 0.75) {
    car.aiStuckTimer = Math.max(0, (car.aiStuckTimer ?? 0) - dt * 2.5);
    car.aiReverseTimer = 0;
  }

  // Trigger 3-point reverse & realign maneuver after 1.35s stuck
  if (car.aiStuckTimer >= 1.35 && (car.aiReverseTimer ?? 0) <= 0 && car.aiStuckTimer < 3.0) {
    car.aiReverseTimer = 1.05;
  }

  // Phase 2 (> 3.0s blocked): Ghost temporarily + smoothly realign onto safe racing asphalt
  if (car.aiStuckTimer >= 3.0) {
    car.spawnGhostTimer = Math.max(car.spawnGhostTimer ?? 0, 2.2);
    const halfW = (sp.width ?? compiledTrack.spec.trackWidth) * 0.5;
    const safeLat = Math.max(-halfW * 0.55, Math.min(halfW * 0.55, car.lateralOffset * 0.4));
    car.x = sp.x + sp.nx * safeLat;
    car.y = sp.y;
    car.z = sp.z + sp.nz * safeLat;
    car.lateralOffset = safeLat;
    car.heading = trackHeading;
    car.speed = Math.max(car.speed, 6.0);
    car.vx = Math.sin(trackHeading) * car.speed;
    car.vz = Math.cos(trackHeading) * car.speed;
    car.aiStuckTimer = 0;
    car.aiReverseTimer = 0;
    return {
      active: true,
      steer: 0,
      throttle: 0.75,
      brake: 0,
      ghosted: true,
    };
  }

  // Phase 1 (3-point reverse maneuver): back away from wall & turn nose toward track tangent
  if ((car.aiReverseTimer ?? 0) > 0) {
    car.aiReverseTimer = Math.max(0, (car.aiReverseTimer ?? 0) - dt);
    // Gently pull car back off the barrier and rotate nose toward track heading
    const inwardSign = car.lateralOffset >= 0 ? -1 : 1; // move toward centerline
    const reversePull = 4.5 * dt;
    car.x -= Math.sin(car.heading) * reversePull * 0.65;
    car.z -= Math.cos(car.heading) * reversePull * 0.65;
    car.x += sp.nx * inwardSign * Math.min(0.9, dt * 2.2);
    car.z += sp.nz * inwardSign * Math.min(0.9, dt * 2.2);
    // Smoothly pivot heading back toward forward track direction
    const maxYaw = dt * 2.4;
    car.heading += Math.max(-maxYaw, Math.min(maxYaw, headingErr));
    const steer = Math.max(-1, Math.min(1, -headingErr * 1.4));
    return {
      active: true,
      steer,
      throttle: car.aiReverseTimer < 0.35 ? 0.55 : 0.0,
      brake: car.aiReverseTimer < 0.35 ? 0.0 : 0.65,
      ghosted: (car.spawnGhostTimer ?? 0) > 0,
    };
  }

  return { active: false, steer: 0, throttle: 0, brake: 0, ghosted: false };
}

/**
 * Helper to extract an AiNeuralTelemetrySnapshot from the 43/59-dim observation vector
 * and live AI control state for the HUD Neural Visualizer.
 */
export function buildAiNeuralTelemetrySnapshot(params: {
  car: CarSimState;
  obs: number[];
  steer: number;
  throttle: number;
  brake: number;
  startPolicyWeight: number;
  policyBlendLabel: string;
  activeManeuver: AiNeuralTelemetrySnapshot['activeManeuver'];
  strategyIntent: string | null;
  mistakeActive: boolean;
}): AiNeuralTelemetrySnapshot {
  const {
    car,
    obs,
    steer,
    throttle,
    brake,
    startPolicyWeight,
    policyBlendLabel,
    activeManeuver,
    strategyIntent,
    mistakeActive,
  } = params;

  // Obs indices [6..13] are the 8 lookahead curvature probes
  const lookaheadCurvatures: number[] = [];
  for (let i = 0; i < 8; i++) {
    lookaheadCurvatures.push(Number((obs[6 + i] ?? 0).toFixed(3)));
  }

  // Obs indices [23..42] are 4 traffic radar slots x 5 floats (occupied, relLong/80, relLat/15, relSpeed/40, classDiff)
  const radarSlots = [];
  for (let s = 0; s < 4; s++) {
    const base = 23 + s * 5;
    const occupied = (obs[base] ?? 0) > 0.5;
    radarSlots.push({
      occupied,
      relLongM: occupied ? Math.round((obs[base + 1] ?? 0) * 80) : 0,
      relLatM: occupied ? Number(((obs[base + 2] ?? 0) * 15).toFixed(1)) : 0,
      relSpeedMs: occupied ? Number(((obs[base + 3] ?? 0) * 40).toFixed(1)) : 0,
      classDiff: occupied ? Number((obs[base + 4] ?? 0).toFixed(2)) : 0,
    });
  }

  return {
    carId: car.id,
    driverName: car.name,
    nationality: car.aiNationality,
    teamName: car.aiTeamName,
    personality: car.personality ?? 'Metronome',
    policyBlendLabel,
    startPolicyWeight: Number(startPolicyWeight.toFixed(2)),
    steer: Number(steer.toFixed(3)),
    throttle: Number(throttle.toFixed(3)),
    brake: Number(brake.toFixed(3)),
    lookaheadCurvatures,
    radarSlots,
    activeManeuver,
    strategyIntent,
    mistakeActive,
  };
}
