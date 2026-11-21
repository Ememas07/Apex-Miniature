import { CARS, getCarById } from './cars';
import {
  AIDifficulty,
  CarClassId,
  DriverStandingsEntry,
  LiveryConfig,
  WeatherPresetId,
  WeekendStage,
} from './types';

// ==================== Championship Series Definitions ====================

export type WeekendFormat = 'standard' | 'full-weekend';

export interface ChampionshipRoundSpec {
  roundNumber: number;
  trackId: string;
  laps: number;
  raceDurationMinutes?: number;
  weatherPreset: WeatherPresetId;
}

export interface ChampionshipSeriesPreset {
  id: string;
  name: string;
  shortName: string;
  description: string;
  classes: CarClassId[];
  defaultPlayerCarId: string;
  gridSize: number;
  weekendFormat: WeekendFormat;
  rounds: ChampionshipRoundSpec[];
}

export const POINTS_TABLE = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const;
export const SPRINT_POINTS_TABLE = [8, 7, 6, 5, 4, 3, 2, 1] as const;
export const FASTEST_LAP_BONUS = 1;
export const POLE_POSITION_BONUS = 1;

export const CHAMPIONSHIP_PRESETS: readonly ChampionshipSeriesPreset[] = [
  {
    id: 'wec-endurance-cup',
    name: 'WEC World Endurance Cup',
    shortName: 'WEC Cup',
    description: 'Multi-class Hypercar, LMP2 & GT3 endurance calendar across iconic FIA circuits.',
    classes: [CarClassId.HYPERCAR_GTP, CarClassId.LMP2, CarClassId.GT3],
    defaultPlayerCarId: 'ferrari-499p',
    gridSize: 14,
    weekendFormat: 'standard',
    rounds: [
      { roundNumber: 1, trackId: 'imola', laps: 4, weatherPreset: 'clear-dry' },
      { roundNumber: 2, trackId: 'spa-francorchamps', laps: 4, weatherPreset: 'passing-shower' },
      { roundNumber: 3, trackId: 'le-mans', laps: 3, weatherPreset: 'dynamic-random' },
      { roundNumber: 4, trackId: 'interlagos', laps: 5, weatherPreset: 'overcast' },
      { roundNumber: 5, trackId: 'fuji', laps: 5, weatherPreset: 'drying-track' },
      { roundNumber: 6, trackId: 'bahrain', laps: 5, weatherPreset: 'clear-dry' },
    ],
  },
  {
    id: 'imsa-weathertech',
    name: 'IMSA WeatherTech SportsCar Series',
    shortName: 'IMSA Series',
    description: 'North American multi-class sports car championship from Daytona to Laguna Seca.',
    classes: [CarClassId.HYPERCAR_GTP, CarClassId.LMP2, CarClassId.GT3],
    defaultPlayerCarId: 'cadillac-v-series-r',
    gridSize: 14,
    weekendFormat: 'standard',
    rounds: [
      { roundNumber: 1, trackId: 'daytona-road', laps: 5, weatherPreset: 'clear-dry' },
      { roundNumber: 2, trackId: 'sebring', laps: 4, weatherPreset: 'overcast' },
      { roundNumber: 3, trackId: 'long-beach', laps: 5, weatherPreset: 'clear-dry' },
      { roundNumber: 4, trackId: 'laguna-seca', laps: 5, weatherPreset: 'clear-dry' },
      { roundNumber: 5, trackId: 'watkins-glen', laps: 5, weatherPreset: 'passing-shower' },
      { roundNumber: 6, trackId: 'road-america', laps: 4, weatherPreset: 'dynamic-random' },
    ],
  },
  {
    id: 'f1-world-championship',
    name: 'F1 2026 World Championship',
    shortName: 'F1 2026',
    description: 'Full GP weekend format (Practice → Superpole → Sprint → Feature) in 2026 Active-Aero cars.',
    classes: [CarClassId.F1_2026],
    defaultPlayerCarId: 'f1-26-ferrari',
    gridSize: 16,
    weekendFormat: 'full-weekend',
    rounds: [
      { roundNumber: 1, trackId: 'bahrain', laps: 5, weatherPreset: 'clear-dry' },
      { roundNumber: 2, trackId: 'monaco', laps: 6, weatherPreset: 'clear-dry' },
      { roundNumber: 3, trackId: 'silverstone', laps: 5, weatherPreset: 'passing-shower' },
      { roundNumber: 4, trackId: 'spa-francorchamps', laps: 4, weatherPreset: 'drying-track' },
      { roundNumber: 5, trackId: 'monza', laps: 5, weatherPreset: 'clear-dry' },
      { roundNumber: 6, trackId: 'suzuka', laps: 5, weatherPreset: 'overcast' },
      { roundNumber: 7, trackId: 'interlagos', laps: 5, weatherPreset: 'storm-front' },
      { roundNumber: 8, trackId: 'las-vegas', laps: 5, weatherPreset: 'clear-dry' },
    ],
  },
  {
    id: 'gt3-sprint-cup',
    name: 'GT3 European Sprint Cup',
    shortName: 'GT3 Sprint',
    description: 'Door-to-door GT3 sprint battles with balanced BoP across Europe’s fastest road courses.',
    classes: [CarClassId.GT3],
    defaultPlayerCarId: 'porsche-911-gt3-r',
    gridSize: 14,
    weekendFormat: 'full-weekend',
    rounds: [
      { roundNumber: 1, trackId: 'zandvoort', laps: 5, weatherPreset: 'overcast' },
      { roundNumber: 2, trackId: 'portimao', laps: 5, weatherPreset: 'clear-dry' },
      { roundNumber: 3, trackId: 'red-bull-ring', laps: 6, weatherPreset: 'passing-shower' },
      { roundNumber: 4, trackId: 'hungaroring', laps: 5, weatherPreset: 'clear-dry' },
      { roundNumber: 5, trackId: 'nurburgring-gp', laps: 5, weatherPreset: 'drying-track' },
      { roundNumber: 6, trackId: 'catalunya', laps: 5, weatherPreset: 'clear-dry' },
    ],
  },
  {
    id: 'formula-e-street-tour',
    name: 'Formula E World Street Tour',
    shortName: 'FE Street',
    description: 'High-voltage AWD Attack Mode duels on tight urban street circuits.',
    classes: [CarClassId.FORMULA_E],
    defaultPlayerCarId: 'fe-porsche-99x',
    gridSize: 12,
    weekendFormat: 'standard',
    rounds: [
      { roundNumber: 1, trackId: 'mexico-city', laps: 6, weatherPreset: 'clear-dry' },
      { roundNumber: 2, trackId: 'jeddah', laps: 5, weatherPreset: 'clear-dry' },
      { roundNumber: 3, trackId: 'miami', laps: 5, weatherPreset: 'passing-shower' },
      { roundNumber: 4, trackId: 'monaco', laps: 6, weatherPreset: 'clear-dry' },
      { roundNumber: 5, trackId: 'long-beach', laps: 6, weatherPreset: 'overcast' },
      { roundNumber: 6, trackId: 'singapore', laps: 5, weatherPreset: 'drying-track' },
    ],
  },
];

// ==================== Persistent Active Championship State ====================

export interface ChampionshipDriverStanding {
  driverId: string;
  name: string;
  isPlayer: boolean;
  carId: string;
  teamName: string;
  classId: CarClassId;
  points: number;
  wins: number;
  podiums: number;
  poles: number;
  fastestLaps: number;
}

export interface ChampionshipConstructorStanding {
  teamName: string;
  points: number;
  wins: number;
  podiums: number;
}

export interface CompletedRoundSummary {
  roundNumber: number;
  trackId: string;
  stage: WeekendStage;
  playerPosition: number;
  winnerName: string;
  pointsAwardedToPlayer: number;
  fastestLapDriver: string | null;
}

export interface ActiveChampionshipState {
  id: string;
  seriesId: string;
  name: string;
  classes: CarClassId[];
  playerCarId: string;
  aiDifficulty: AIDifficulty;
  gridSize: number;
  weekendFormat: WeekendFormat;
  rounds: ChampionshipRoundSpec[];
  currentRoundIndex: number;
  currentStage: WeekendStage;
  pendingGridPos: number | null;
  driverStandings: ChampionshipDriverStanding[];
  history: CompletedRoundSummary[];
  completed: boolean;
  startedAt: number;
}

const CHAMPIONSHIP_STORAGE_KEY = 'apex_championship_state_v1';

export function createChampionshipSeason(params: {
  series: ChampionshipSeriesPreset;
  playerCarId?: string;
  aiDifficulty?: AIDifficulty;
  weekendFormat?: WeekendFormat;
  customRounds?: ChampionshipRoundSpec[];
}): ActiveChampionshipState {
  const playerCarId = params.playerCarId ?? params.series.defaultPlayerCarId;
  const playerCar = getCarById(playerCarId);
  const weekendFormat = params.weekendFormat ?? params.series.weekendFormat;
  const rounds =
    params.customRounds && params.customRounds.length > 0
      ? params.customRounds.map((r, i) => ({ ...r, roundNumber: i + 1 }))
      : params.series.rounds.map((r) => ({ ...r }));

  return {
    id: `champ-${Date.now()}`,
    seriesId: params.series.id,
    name: params.series.name,
    classes: [...params.series.classes],
    playerCarId,
    aiDifficulty: params.aiDifficulty ?? 'Pro',
    gridSize: params.series.gridSize,
    weekendFormat,
    rounds,
    currentRoundIndex: 0,
    currentStage: weekendFormat === 'full-weekend' ? 'practice' : 'feature',
    pendingGridPos: null,
    driverStandings: [
      {
        driverId: 'player',
        name: 'You',
        isPlayer: true,
        carId: playerCar.id,
        teamName: playerCar.manufacturer,
        classId: playerCar.classId,
        points: 0,
        wins: 0,
        podiums: 0,
        poles: 0,
        fastestLaps: 0,
      },
    ],
    history: [],
    completed: false,
    startedAt: Date.now(),
  };
}

export function loadActiveChampionship(): ActiveChampionshipState | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(CHAMPIONSHIP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveChampionshipState;
    if (!parsed || !Array.isArray(parsed.rounds) || parsed.rounds.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveActiveChampionship(state: ActiveChampionshipState | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!state) {
      localStorage.removeItem(CHAMPIONSHIP_STORAGE_KEY);
    } else {
      localStorage.setItem(CHAMPIONSHIP_STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // ignore
  }
}

export function computeConstructorStandings(
  drivers: ReadonlyArray<ChampionshipDriverStanding>,
): ChampionshipConstructorStanding[] {
  const byTeam = new Map<string, ChampionshipConstructorStanding>();
  for (const d of drivers) {
    const existing = byTeam.get(d.teamName) ?? {
      teamName: d.teamName,
      points: 0,
      wins: 0,
      podiums: 0,
    };
    existing.points += d.points;
    existing.wins += d.wins;
    existing.podiums += d.podiums;
    byTeam.set(d.teamName, existing);
  }
  return Array.from(byTeam.values()).sort((a, b) => b.points - a.points || b.wins - a.wins);
}

/**
 * Advances a full-weekend stage (`practice` → `qualifying` → `sprint` → `feature`) or records
 * points from a completed Sprint/Feature race and advances to the next round!
 */
export function recordChampionshipSessionResult(
  state: ActiveChampionshipState,
  params: {
    standings: DriverStandingsEntry[];
    stage: WeekendStage;
    poleDriverId?: string | null;
    qualiGridPos?: number | null;
  },
): { nextState: ActiveChampionshipState; playerPointsEarned: number } {
  const next: ActiveChampionshipState = {
    ...state,
    driverStandings: state.driverStandings.map((d) => ({ ...d })),
    history: [...state.history],
  };

  const round = next.rounds[next.currentRoundIndex];
  if (!round || next.completed) {
    return { nextState: next, playerPointsEarned: 0 };
  }

  // Practice or Qualifying stage simply transitions to next weekend stage
  if (params.stage === 'practice') {
    next.currentStage = 'qualifying';
    return { nextState: next, playerPointsEarned: 0 };
  }
  if (params.stage === 'qualifying') {
    next.pendingGridPos = params.qualiGridPos ?? null;
    if (params.qualiGridPos === 1) {
      const playerRow = next.driverStandings.find((d) => d.isPlayer);
      if (playerRow) {
        playerRow.points += POLE_POSITION_BONUS;
        playerRow.poles += 1;
      }
    }
    next.currentStage = next.weekendFormat === 'full-weekend' ? 'sprint' : 'feature';
    return { nextState: next, playerPointsEarned: params.qualiGridPos === 1 ? POLE_POSITION_BONUS : 0 };
  }

  // Race stage (Sprint or Feature): award motorsport points
  const ptsTable = params.stage === 'sprint' ? SPRINT_POINTS_TABLE : POINTS_TABLE;
  const sorted = [...params.standings].sort((a, b) => a.position - b.position);

  // Identify fastest lap among finishers
  let fastestEntry: DriverStandingsEntry | null = null;
  for (const row of sorted) {
    if (row.bestLapTime && row.bestLapTime > 0) {
      if (!fastestEntry || row.bestLapTime < (fastestEntry.bestLapTime ?? Infinity)) {
        fastestEntry = row;
      }
    }
  }

  let playerPointsEarned = 0;

  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    const car = getCarById(row.carId);
    let driver = next.driverStandings.find(
      (d) => (row.isPlayer && d.isPlayer) || (!row.isPlayer && !d.isPlayer && d.name === row.name),
    );
    if (!driver) {
      driver = {
        driverId: row.isPlayer ? 'player' : row.name,
        name: row.name,
        isPlayer: row.isPlayer,
        carId: car.id,
        teamName: car.manufacturer,
        classId: row.classId,
        points: 0,
        wins: 0,
        podiums: 0,
        poles: 0,
        fastestLaps: 0,
      };
      next.driverStandings.push(driver);
    }

    let pts = i < ptsTable.length ? ptsTable[i] : 0;
    if (params.stage === 'feature' && fastestEntry && fastestEntry.id === row.id && i < 10) {
      pts += FASTEST_LAP_BONUS;
      driver.fastestLaps += 1;
    }
    if (params.poleDriverId && params.poleDriverId === row.id && params.stage === 'feature') {
      pts += POLE_POSITION_BONUS;
      driver.poles += 1;
    }

    driver.points += pts;
    if (params.stage === 'feature') {
      if (row.position === 1) driver.wins += 1;
      if (row.position <= 3) driver.podiums += 1;
    }
    if (row.isPlayer) {
      playerPointsEarned = pts;
    }
  }

  next.driverStandings.sort(
    (a, b) => b.points - a.points || b.wins - a.wins || b.podiums - a.podiums,
  );

  const playerStanding = sorted.find((r) => r.isPlayer);
  next.history.push({
    roundNumber: round.roundNumber,
    trackId: round.trackId,
    stage: params.stage,
    playerPosition: playerStanding?.position ?? sorted.length,
    winnerName: sorted[0]?.name ?? 'Unknown',
    pointsAwardedToPlayer: playerPointsEarned,
    fastestLapDriver: fastestEntry?.name ?? null,
  });

  if (params.stage === 'sprint') {
    next.currentStage = 'feature';
    next.pendingGridPos = playerStanding?.position ?? next.pendingGridPos;
  } else {
    // Advance to next round
    next.pendingGridPos = null;
    if (next.currentRoundIndex + 1 >= next.rounds.length) {
      next.completed = true;
    } else {
      next.currentRoundIndex += 1;
      next.currentStage = next.weekendFormat === 'full-weekend' ? 'practice' : 'feature';
    }
  }

  return { nextState: next, playerPointsEarned };
}

// ==================== Collector Career Progression (Optional Toggle) ====================

export interface CollectorHeritageLivery {
  id: string;
  name: string;
  costCredits: number;
  requiredRep: number;
  description: string;
  liveryPatch: Partial<LiveryConfig>;
}

export const HERITAGE_UNLOCK_LIVERIES: readonly CollectorHeritageLivery[] = [
  {
    id: 'heritage-gulf',
    name: 'Powder Blue & Marigold Heritage',
    costCredits: 1500,
    requiredRep: 100,
    description: 'Iconic 1969 endurance powder-blue and marigold racing stripe scheme.',
    liveryPatch: {
      primaryColor: '#38bdf8',
      secondaryColor: '#f97316',
      tertiaryColor: '#0f172a',
      template: 'racing-stripes',
      rimFinish: 'gold-bronze',
      windshieldBanner: 'APEX',
    },
  },
  {
    id: 'heritage-tricolore',
    name: 'Alpine Tricolore Works',
    costCredits: 3000,
    requiredRep: 300,
    description: 'Pearl motorsport white with crimson, cobalt & sapphire triple endurance bands.',
    liveryPatch: {
      primaryColor: '#f8fafc',
      secondaryColor: '#dc2626',
      tertiaryColor: '#2563eb',
      template: 'heritage',
      rimFinish: 'white',
      windshieldBanner: 'WEC',
    },
  },
  {
    id: 'heritage-british-green',
    name: 'Brooklands British Racing Green',
    costCredits: 4500,
    requiredRep: 600,
    description: 'Deep emerald metallic finish with champagne gold accent nose & bronze wheels.',
    liveryPatch: {
      primaryColor: '#065f46',
      secondaryColor: '#facc15',
      tertiaryColor: '#f8fafc',
      template: 'two-tone',
      rimFinish: 'gold-bronze',
      windshieldBanner: 'PRO',
    },
  },
  {
    id: 'heritage-carbon-gold',
    name: '24H Collector Carbon & Gold',
    costCredits: 8000,
    requiredRep: 1200,
    description: 'Exposed stealth carbon weave with championship gold geometric chevrons.',
    liveryPatch: {
      primaryColor: '#111827',
      secondaryColor: '#facc15',
      tertiaryColor: '#ef4444',
      template: 'geometric',
      carbonHood: true,
      carbonWing: true,
      carbonSplitter: true,
      rimFinish: 'gold-bronze',
      windshieldBanner: 'APEX',
    },
  },
];

export interface CareerProfile {
  enabled: boolean;
  credits: number;
  reputation: number;
  racesCompleted: number;
  wins: number;
  podiums: number;
  cleanLaps: number;
  unlockedLiveryIds: string[];
}

const CAREER_STORAGE_KEY = 'apex_career_profile_v1';

export const DEFAULT_CAREER_PROFILE: CareerProfile = {
  enabled: true,
  credits: 500,
  reputation: 0,
  racesCompleted: 0,
  wins: 0,
  podiums: 0,
  cleanLaps: 0,
  unlockedLiveryIds: [],
};

export function loadCareerProfile(): CareerProfile {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_CAREER_PROFILE };
    const raw = localStorage.getItem(CAREER_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CAREER_PROFILE };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CAREER_PROFILE,
      ...parsed,
      unlockedLiveryIds: Array.isArray(parsed?.unlockedLiveryIds) ? parsed.unlockedLiveryIds : [],
    };
  } catch {
    return { ...DEFAULT_CAREER_PROFILE };
  }
}

export function saveCareerProfile(profile: CareerProfile): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CAREER_STORAGE_KEY, JSON.stringify(profile));
    }
  } catch {
    // ignore
  }
}

export function getCollectorRank(reputation: number): { title: string; nextRep: number | null } {
  if (reputation >= 2500) return { title: 'Grand Master Collector', nextRep: null };
  if (reputation >= 1200) return { title: 'Factory Works Ace', nextRep: 2500 };
  if (reputation >= 600) return { title: 'International Pro', nextRep: 1200 };
  if (reputation >= 250) return { title: 'National Paddock Driver', nextRep: 600 };
  if (reputation >= 80) return { title: 'Clubman Racer', nextRep: 250 };
  return { title: 'Rookie Die-Cast Collector', nextRep: 80 };
}

export function awardCareerSessionRewards(params: {
  position: number;
  totalCars: number;
  cleanLaps: number;
  overtakes: number;
  hasFastestLap: boolean;
  medalEarned?: string | null;
}): { profile: CareerProfile; creditsEarned: number; repEarned: number } {
  const profile = loadCareerProfile();
  if (!profile.enabled) {
    return { profile, creditsEarned: 0, repEarned: 0 };
  }

  let creditsEarned = 250;
  let repEarned = 25;

  if (params.totalCars > 1) {
    if (params.position === 1) {
      creditsEarned += 1000;
      repEarned += 120;
      profile.wins += 1;
      profile.podiums += 1;
    } else if (params.position <= 3) {
      creditsEarned += 600;
      repEarned += 75;
      profile.podiums += 1;
    } else if (params.position <= Math.ceil(params.totalCars * 0.5)) {
      creditsEarned += 300;
      repEarned += 40;
    }
  }

  creditsEarned += Math.min(8, params.cleanLaps) * 80;
  repEarned += Math.min(8, params.cleanLaps) * 12;
  creditsEarned += Math.min(12, params.overtakes) * 45;
  repEarned += Math.min(12, params.overtakes) * 6;

  if (params.hasFastestLap) {
    creditsEarned += 250;
    repEarned += 35;
  }
  if (params.medalEarned === 'alien') {
    creditsEarned += 1200;
    repEarned += 150;
  } else if (params.medalEarned === 'gold') {
    creditsEarned += 750;
    repEarned += 90;
  } else if (params.medalEarned === 'silver') {
    creditsEarned += 400;
    repEarned += 45;
  } else if (params.medalEarned === 'bronze') {
    creditsEarned += 200;
    repEarned += 20;
  }

  profile.credits += creditsEarned;
  profile.reputation += repEarned;
  profile.racesCompleted += 1;
  profile.cleanLaps += params.cleanLaps;

  saveCareerProfile(profile);
  return { profile, creditsEarned, repEarned };
}

export function unlockHeritageLivery(liveryId: string): {
  success: boolean;
  reason?: string;
  profile: CareerProfile;
} {
  const profile = loadCareerProfile();
  const target = HERITAGE_UNLOCK_LIVERIES.find((l) => l.id === liveryId);
  if (!target) return { success: false, reason: 'Unknown livery', profile };
  if (profile.unlockedLiveryIds.includes(liveryId)) return { success: true, profile };
  if (profile.reputation < target.requiredRep) {
    return { success: false, reason: `Requires ${target.requiredRep} REP`, profile };
  }
  if (profile.credits < target.costCredits) {
    return { success: false, reason: `Requires ${target.costCredits} CR`, profile };
  }
  profile.credits -= target.costCredits;
  profile.unlockedLiveryIds = [...profile.unlockedLiveryIds, liveryId];
  saveCareerProfile(profile);
  return { success: true, profile };
}

export function getSuggestedCarsForClasses(classes: CarClassId[]) {
  const filtered = CARS.filter((c) => classes.includes(c.classId));
  return filtered.length > 0 ? filtered : CARS;
}
