import { getCarById } from './cars';
import { getTrackById } from './tracks';
import {
  AIDifficulty,
  AiPaceOrder,
  CarClassId,
  HudSnapshot,
  MedalTier,
  RaceConfig,
  TireCompound,
  WeatherPresetId,
} from './types';

// ==================== Scripted Race Scenarios & Driving School Licenses ====================

export interface ScenarioSpec {
  id: string;
  category: 'scenario' | 'license';
  code: string;
  title: string;
  subtitle: string;
  briefing: string;
  objectiveLabel: string;
  trackId: string;
  carId: string;
  activeClasses: CarClassId[];
  aiBotCount: number;
  aiDifficulty: AIDifficulty;
  totalLaps: number;
  weatherPreset: WeatherPresetId;
  startingCompound: TireCompound;
  startType: 'standing' | 'rolling';
  startingGridPosition?: number; // 1-indexed (e.g. 12 = start P12)
  startingFuelOverride?: number; // % fuel at start
  /** Target condition for evaluation */
  targetMaxPosition?: number;
  targetMaxLapSeconds?: number;
  targetMaxWarnings?: number;
  targetMinFuelLeft?: number;
  goldMaxPosition?: number;
  silverMaxPosition?: number;
  bronzeMaxPosition?: number;
  goldMaxLapSeconds?: number;
  silverMaxLapSeconds?: number;
  bronzeMaxLapSeconds?: number;
}

export const RACE_SCENARIOS: readonly ScenarioSpec[] = [
  {
    id: 'scen-spa-last-to-first',
    category: 'scenario',
    code: 'SC-01',
    title: 'Last-to-First Charge at Spa',
    subtitle: 'Hypercar GTP · Start P10 · 3 Laps',
    briefing: 'You start dead last on fresh Soft tyres at Spa-Francorchamps. Slice through the Hypercar field before the checkered flag.',
    objectiveLabel: 'Finish P1 (Gold) · P3 (Silver) · P5 (Bronze)',
    trackId: 'spa-francorchamps',
    carId: 'ferrari-499p',
    activeClasses: [CarClassId.HYPERCAR_GTP],
    aiBotCount: 9,
    aiDifficulty: 'Pro',
    totalLaps: 3,
    weatherPreset: 'clear-dry',
    startingCompound: 'soft',
    startType: 'rolling',
    startingGridPosition: 10,
    goldMaxPosition: 1,
    silverMaxPosition: 3,
    bronzeMaxPosition: 5,
  },
  {
    id: 'scen-silverstone-downpour',
    category: 'scenario',
    code: 'SC-02',
    title: 'Survive Sudden Downpour on Slicks',
    subtitle: 'GT3 · Silverstone · Storm Front',
    briefing: 'A heavy storm front sweeps across Silverstone mid-race while you start on Soft slicks. Manage wet grip or make a decisive on-track wet tyre stop.',
    objectiveLabel: 'Finish Top 3 in Storm Conditions',
    trackId: 'silverstone',
    carId: 'porsche-911-gt3-r',
    activeClasses: [CarClassId.GT3],
    aiBotCount: 9,
    aiDifficulty: 'Pro',
    totalLaps: 3,
    weatherPreset: 'storm-front',
    startingCompound: 'soft',
    startType: 'standing',
    startingGridPosition: 5,
    goldMaxPosition: 1,
    silverMaxPosition: 3,
    bronzeMaxPosition: 5,
  },
  {
    id: 'scen-lemans-multiclass',
    category: 'scenario',
    code: 'SC-03',
    title: 'Multiclass Traffic Gauntlet at Le Mans',
    subtitle: 'Hypercar vs LMP2 & GT3 · 2 Laps',
    briefing: 'Navigate a dense 16-car multi-class grid down the Mulsanne Straight and Porsche Curves. Keep it clean and claim overall victory.',
    objectiveLabel: 'Win Overall at Le Mans',
    trackId: 'le-mans',
    carId: 'porsche-963',
    activeClasses: [CarClassId.HYPERCAR_GTP, CarClassId.LMP2, CarClassId.GT3],
    aiBotCount: 15,
    aiDifficulty: 'Pro',
    totalLaps: 2,
    weatherPreset: 'overcast',
    startingCompound: 'medium',
    startType: 'rolling',
    startingGridPosition: 7,
    goldMaxPosition: 1,
    silverMaxPosition: 2,
    bronzeMaxPosition: 4,
  },
  {
    id: 'scen-monza-fuel-save',
    category: 'scenario',
    code: 'SC-04',
    title: 'Fuel-Save Finish at Monza',
    subtitle: 'F1 2026 · 20% Fuel · 3 Laps',
    briefing: 'Your fuel rig under-fueled the car to 20%. Cycle ERS to HARVEST, use slipstream tow, and reach the finish line without running dry!',
    objectiveLabel: 'Finish with >0% Fuel · P1 Gold',
    trackId: 'monza',
    carId: 'f1-26-ferrari',
    activeClasses: [CarClassId.F1_2026],
    aiBotCount: 9,
    aiDifficulty: 'Amateur',
    totalLaps: 3,
    weatherPreset: 'clear-dry',
    startingCompound: 'medium',
    startType: 'rolling',
    startingGridPosition: 4,
    startingFuelOverride: 20,
    targetMinFuelLeft: 0.5,
    goldMaxPosition: 1,
    silverMaxPosition: 3,
    bronzeMaxPosition: 6,
  },
  {
    id: 'scen-monaco-street',
    category: 'scenario',
    code: 'SC-05',
    title: 'Monaco Principality Street Sprint',
    subtitle: 'F1 2026 · Tight Barriers · 3 Laps',
    briefing: 'Zero margin for error between Monaco’s Armco walls. Keep track-limit and contact incidents minimal while charging from P6.',
    objectiveLabel: 'Podium Cleanly at Monaco',
    trackId: 'monaco',
    carId: 'f1-26-mclaren',
    activeClasses: [CarClassId.F1_2026],
    aiBotCount: 9,
    aiDifficulty: 'Pro',
    totalLaps: 3,
    weatherPreset: 'clear-dry',
    startingCompound: 'soft',
    startType: 'standing',
    startingGridPosition: 6,
    goldMaxPosition: 1,
    silverMaxPosition: 3,
    bronzeMaxPosition: 5,
  },
  {
    id: 'scen-fe-attack-duel',
    category: 'scenario',
    code: 'SC-06',
    title: 'Formula E Attack Mode Showdown',
    subtitle: 'Formula E · Miami · 3 Laps',
    briefing: 'Hit the off-line glowing Attack Mode activation zone to unleash 15s AWD boost and overtake the pack in Miami.',
    objectiveLabel: 'Win the Formula E Street Duel',
    trackId: 'miami',
    carId: 'fe-porsche-99x',
    activeClasses: [CarClassId.FORMULA_E],
    aiBotCount: 9,
    aiDifficulty: 'Pro',
    totalLaps: 3,
    weatherPreset: 'clear-dry',
    startingCompound: 'medium',
    startType: 'standing',
    startingGridPosition: 6,
    goldMaxPosition: 1,
    silverMaxPosition: 3,
    bronzeMaxPosition: 5,
  },
];

export const LICENSE_TESTS: readonly ScenarioSpec[] = [
  {
    id: 'lic-b1-launch',
    category: 'license',
    code: 'B-1',
    title: 'Standing Start & Chicane Braking',
    subtitle: 'Monza · GT3 · 1 Timed Lap',
    briefing: 'Hold throttle in the 66–88% RPM sweet spot on the lights for a Perfect Launch, then trail-brake smoothly into Monza’s chicanes.',
    objectiveLabel: 'Gold <= 1:48.0 · Silver <= 1:54.0 · Bronze <= 2:02.0',
    trackId: 'monza',
    carId: 'ferrari-296-gt3',
    activeClasses: [CarClassId.GT3],
    aiBotCount: 0,
    aiDifficulty: 'Pro',
    totalLaps: 1,
    weatherPreset: 'clear-dry',
    startingCompound: 'soft',
    startType: 'standing',
    goldMaxLapSeconds: 108,
    silverMaxLapSeconds: 114,
    bronzeMaxLapSeconds: 122,
    targetMaxWarnings: 2,
  },
  {
    id: 'lic-b2-elevation',
    category: 'license',
    code: 'B-2',
    title: 'Crest Unloading & High-Speed Flow',
    subtitle: 'Portimao · LMP2 · 1 Flying Lap',
    briefing: 'Master Portimao’s blind crests where vertical load drops over hilltops. Modulate steering cleanly over the summits.',
    objectiveLabel: 'Gold <= 1:34.0 · Silver <= 1:40.0 · Bronze <= 1:48.0',
    trackId: 'portimao',
    carId: 'oreca-07',
    activeClasses: [CarClassId.LMP2],
    aiBotCount: 0,
    aiDifficulty: 'Pro',
    totalLaps: 1,
    weatherPreset: 'clear-dry',
    startingCompound: 'soft',
    startType: 'rolling',
    goldMaxLapSeconds: 94,
    silverMaxLapSeconds: 100,
    bronzeMaxLapSeconds: 108,
    targetMaxWarnings: 2,
  },
  {
    id: 'lic-a1-wet',
    category: 'license',
    code: 'A-1',
    title: 'Wet-Weather Grip & Puddle Control',
    subtitle: 'Interlagos · GT3 · Heavy Rain',
    briefing: 'Drive Interlagos in soaking rain on Wet tyres. Avoid off-line standing-water puddles and brake early into Descida do Lago.',
    objectiveLabel: 'Gold <= 1:44.0 · Silver <= 1:51.0 · Bronze <= 2:00.0',
    trackId: 'interlagos',
    carId: 'mercedes-amg-gt3',
    activeClasses: [CarClassId.GT3],
    aiBotCount: 0,
    aiDifficulty: 'Pro',
    totalLaps: 1,
    weatherPreset: 'storm-front',
    startingCompound: 'wet',
    startType: 'rolling',
    goldMaxLapSeconds: 104,
    silverMaxLapSeconds: 111,
    bronzeMaxLapSeconds: 120,
    targetMaxWarnings: 2,
  },
  {
    id: 'lic-a2-slipstream',
    category: 'license',
    code: 'A-2',
    title: 'Slipstream & DRS Overtaking',
    subtitle: 'Bahrain · F1 2026 · Pass 4 Rivals',
    briefing: 'Use slipstream tow down Bahrain’s straights and activate Active Aero / DRS (<1.0s) to climb from P5 to P1 in 2 laps.',
    objectiveLabel: 'Reach P1 (Gold) · P2 (Silver) · P3 (Bronze)',
    trackId: 'bahrain',
    carId: 'f1-26-redbull',
    activeClasses: [CarClassId.F1_2026],
    aiBotCount: 4,
    aiDifficulty: 'Amateur',
    totalLaps: 2,
    weatherPreset: 'clear-dry',
    startingCompound: 'soft',
    startType: 'rolling',
    startingGridPosition: 5,
    goldMaxPosition: 1,
    silverMaxPosition: 2,
    bronzeMaxPosition: 3,
  },
  {
    id: 'lic-s1-superpole',
    category: 'license',
    code: 'S-1',
    title: 'Superpole Master Benchmark',
    subtitle: 'Suzuka · F1 2026 · Full Attack',
    briefing: 'Deliver a clean qualifying lap around Suzuka’s Figure-8 esses, Spoon Curve, and 130R with zero track-limit violations.',
    objectiveLabel: 'Gold <= 1:30.0 · Silver <= 1:35.0 · Bronze <= 1:42.0',
    trackId: 'suzuka',
    carId: 'f1-26-mercedes',
    activeClasses: [CarClassId.F1_2026],
    aiBotCount: 0,
    aiDifficulty: 'Alien',
    totalLaps: 1,
    weatherPreset: 'clear-dry',
    startingCompound: 'soft',
    startType: 'rolling',
    goldMaxLapSeconds: 90,
    silverMaxLapSeconds: 95,
    bronzeMaxLapSeconds: 102,
    targetMaxWarnings: 1,
  },
];

export const ALL_SCENARIOS: readonly ScenarioSpec[] = [...RACE_SCENARIOS, ...LICENSE_TESTS];

export function getScenarioById(id: string | undefined): ScenarioSpec | null {
  if (!id) return null;
  return ALL_SCENARIOS.find((s) => s.id === id) ?? null;
}

export function buildRaceConfigPatchFromScenario(scenario: ScenarioSpec): Partial<RaceConfig> {
  const car = getCarById(scenario.carId);
  return {
    trackId: scenario.trackId,
    customTrack: undefined,
    playerCarId: car.id,
    playerLivery: { ...car.defaultLivery },
    activeClasses: [...scenario.activeClasses],
    aiBotCount: scenario.aiBotCount,
    noAi: scenario.aiBotCount === 0,
    gridSize: scenario.aiBotCount + 1,
    totalLaps: scenario.totalLaps,
    raceDurationMinutes: 0,
    weather: scenario.weatherPreset === 'clear-dry' ? 'dry' : 'dynamic-rain',
    weatherPreset: scenario.weatherPreset,
    startingCompound: scenario.startingCompound,
    qualifyingEnabled: false,
    aiDifficulty: scenario.aiDifficulty,
    startType: scenario.startType,
    sessionMode: scenario.category === 'license' ? 'license' : 'scenario',
    scenarioId: scenario.category === 'scenario' ? scenario.id : undefined,
    licenseId: scenario.category === 'license' ? scenario.id : undefined,
    startingGridPosition: scenario.startingGridPosition,
    startingFuelOverride: scenario.startingFuelOverride,
    ghostMode: scenario.aiBotCount === 0 ? 'gold' : 'off',
  };
}

export function evaluateScenarioResult(
  scenario: ScenarioSpec,
  snapshot: HudSnapshot,
): { passed: boolean; medal: MedalTier | null; summary: string } {
  const playerRow = snapshot.standings.find((s) => s.isPlayer) ?? snapshot.standings[0];
  const pos = playerRow?.position ?? snapshot.position;
  const lap = playerRow?.bestLapTime ?? snapshot.bestLapTime ?? snapshot.lastLapTime ?? snapshot.currentLapTime;
  const warningsOk =
    scenario.targetMaxWarnings === undefined || snapshot.warningCount <= scenario.targetMaxWarnings;
  const fuelOk =
    scenario.targetMinFuelLeft === undefined || snapshot.fuel >= scenario.targetMinFuelLeft;

  if (!fuelOk) {
    return { passed: false, medal: null, summary: 'Ran out of fuel before the finish line.' };
  }
  if (!warningsOk) {
    return {
      passed: false,
      medal: null,
      summary: `Too many track-limit warnings (${snapshot.warningCount}/${scenario.targetMaxWarnings}).`,
    };
  }

  // Time-based license test
  if (scenario.goldMaxLapSeconds !== undefined) {
    if (!lap || !Number.isFinite(lap)) {
      return { passed: false, medal: null, summary: 'No valid timed lap recorded.' };
    }
    if (lap <= scenario.goldMaxLapSeconds * 0.96) {
      return { passed: true, medal: 'alien', summary: 'Alien pace! Crushed the Gold target.' };
    }
    if (lap <= scenario.goldMaxLapSeconds) {
      return { passed: true, medal: 'gold', summary: 'Gold license earned!' };
    }
    if (scenario.silverMaxLapSeconds && lap <= scenario.silverMaxLapSeconds) {
      return { passed: true, medal: 'silver', summary: 'Silver license earned!' };
    }
    if (scenario.bronzeMaxLapSeconds && lap <= scenario.bronzeMaxLapSeconds) {
      return { passed: true, medal: 'bronze', summary: 'Bronze license passed!' };
    }
    return {
      passed: false,
      medal: null,
      summary: `Lap time missed Bronze target (${scenario.bronzeMaxLapSeconds}s).`,
    };
  }

  // Position-based scenario
  if (scenario.goldMaxPosition !== undefined && pos <= scenario.goldMaxPosition) {
    return { passed: true, medal: 'gold', summary: `Gold objective achieved — finished P${pos}!` };
  }
  if (scenario.silverMaxPosition !== undefined && pos <= scenario.silverMaxPosition) {
    return { passed: true, medal: 'silver', summary: `Silver objective achieved — finished P${pos}!` };
  }
  if (scenario.bronzeMaxPosition !== undefined && pos <= scenario.bronzeMaxPosition) {
    return { passed: true, medal: 'bronze', summary: `Bronze objective passed — finished P${pos}!` };
  }
  return {
    passed: false,
    medal: null,
    summary: `Finished P${pos} — needed P${scenario.bronzeMaxPosition ?? 3} or better.`,
  };
}

// ==================== Scenario Progress Persistence ====================

const CHALLENGES_STORAGE_KEY = 'apex_challenges_progress_v1';

export function loadChallengeMedals(): Record<string, MedalTier> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(CHALLENGES_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, MedalTier>;
  } catch {
    return {};
  }
}

export function saveChallengeMedal(scenarioId: string, medal: MedalTier): Record<string, MedalTier> {
  const rank: Record<MedalTier, number> = { bronze: 1, silver: 2, gold: 3, alien: 4 };
  const current = loadChallengeMedals();
  const prev = current[scenarioId];
  if (!prev || rank[medal] > rank[prev]) {
    current[scenarioId] = medal;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CHALLENGES_STORAGE_KEY, JSON.stringify(current));
      }
    } catch {
      // ignore
    }
  }
  return current;
}

// ==================== Elimination / Knockout Controller ====================

export interface EliminationState {
  active: boolean;
  intervalSeconds: number;
  countdown: number;
  eliminatedIds: Set<string>;
  lastEliminatedName: string | null;
}

export function createEliminationState(active: boolean, intervalSeconds = 30): EliminationState {
  return {
    active,
    intervalSeconds: Math.max(15, intervalSeconds),
    // Extra 15s grace on lap 1 launch before first knockout
    countdown: Math.max(20, intervalSeconds + 15),
    eliminatedIds: new Set<string>(),
    lastEliminatedName: null,
  };
}

export function stepEliminationState<
  T extends { id: string; name: string; totalDistance: number; finished: boolean; eliminated?: boolean },
>(
  state: EliminationState,
  cars: T[],
  dt: number,
): { eliminatedCar: T | null; winnerCar: T | null } {
  if (!state.active) return { eliminatedCar: null, winnerCar: null };

  const alive = cars.filter((c) => !state.eliminatedIds.has(c.id));
  if (alive.length <= 1) {
    return { eliminatedCar: null, winnerCar: alive[0] ?? null };
  }

  state.countdown -= dt;
  if (state.countdown > 0) {
    return { eliminatedCar: null, winnerCar: null };
  }

  // Eliminate the car currently in last place among alive cars
  alive.sort((a, b) => a.totalDistance - b.totalDistance);
  const victim = alive[0];
  state.eliminatedIds.add(victim.id);
  victim.eliminated = true;
  victim.finished = true;
  state.lastEliminatedName = victim.name;
  state.countdown = state.intervalSeconds;

  const remaining = cars.filter((c) => !state.eliminatedIds.has(c.id));
  if (remaining.length === 1) {
    remaining[0].finished = true;
    return { eliminatedCar: victim, winnerCar: remaining[0] };
  }
  return { eliminatedCar: victim, winnerCar: null };
}

// ==================== AI Race Engineer Pace Modifiers ====================

export function getAiPaceOrderModifiers(order: AiPaceOrder | undefined): {
  paceMultiplier: number;
  tireWearMultiplier: number;
  fuelBurnMultiplier: number;
  label: string;
} {
  switch (order) {
    case 'conserve':
      return { paceMultiplier: 0.94, tireWearMultiplier: 0.65, fuelBurnMultiplier: 0.72, label: 'CONSERVE' };
    case 'push':
      return { paceMultiplier: 1.035, tireWearMultiplier: 1.32, fuelBurnMultiplier: 1.18, label: 'PUSH' };
    case 'attack':
      return { paceMultiplier: 1.065, tireWearMultiplier: 1.65, fuelBurnMultiplier: 1.35, label: 'ATTACK' };
    case 'balanced':
    default:
      return { paceMultiplier: 1.0, tireWearMultiplier: 1.0, fuelBurnMultiplier: 1.0, label: 'BALANCED' };
  }
}

export function describeScenarioTrack(scenario: ScenarioSpec): string {
  const track = getTrackById(scenario.trackId);
  return `${track.name} · ${track.country}`;
}
