export enum CarClassId {
  HYPERCAR_GTP = 'HYPERCAR_GTP',
  LMP2 = 'LMP2',
  GT3 = 'GT3',
  GT4 = 'GT4',
  F1_2026 = 'F1_2026',
  F1_2021 = 'F1_2021',
  F1_2005 = 'F1_2005',
  FORMULA_E = 'FORMULA_E',
  TRACK_COUPE = 'TRACK_COUPE',
  SUPERCAR = 'SUPERCAR',
}

export type BodySilhouette = 'prototype' | 'lmp2' | 'gt' | 'formula' | 'coupe' | 'supercar';

export type ClassSpecialType =
  | 'none'
  | 'active-aero'
  | 'attack-mode'
  | 'ers-overtake'
  | 'v10-overboost'
  | 'rich-fuel-overboost'
  | 'high-beam-flash'
  | 'hybrid-deploy';

export interface BoPAttributes {
  topSpeed: number; // 1-100
  acceleration: number; // 1-100
  corneringGrip: number; // 1-100
  braking: number; // 1-100
  efficiency: number; // 1-100 (tire & fuel/energy life)
}

export interface CarClassMeta {
  id: CarClassId;
  name: string;
  shortName: string;
  category: 'Endurance' | 'Single-Seater' | 'Production';
  plateColor: string;
  badgeTextColor: string;
  basePaceIndex: number; // Class speed tier (higher = faster overall lap)
  forwardGears: number; // Standard forward gear count for this class
  specialType: ClassSpecialType;
  specialLabel: string;
  defaultHeadlightTint: HeadlightTint;
}

export type RimFinish = 'gloss-black' | 'silver' | 'gold-bronze' | 'white' | 'body-matched';

export type LiveryTemplate =
  | 'racing-stripes'
  | 'two-tone'
  | 'geometric'
  | 'heritage';

export type NumberPlateStyle =
  | 'auto'
  | 'gtp-red'
  | 'lmp2-blue'
  | 'gt3-green'
  | 'gt4-cyan'
  | 'gtd-amber'
  | 'formula-white';

export type HeadlightTint = 'crystal-white' | 'endurance-yellow' | 'ice-blue';

export interface LiveryConfig {
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  rimFinish: RimFinish;
  template: LiveryTemplate;
  carbonHood: boolean;
  carbonWing: boolean;
  carbonSplitter: boolean;
  driverNumber: string; // 1-3 digits
  numberPlateStyle: NumberPlateStyle;
  headlightTint: HeadlightTint;
  windshieldBanner: string;
}

export interface CarSpec {
  id: string;
  name: string;
  manufacturer: string;
  classId: CarClassId;
  silhouette: BodySilhouette;
  attributes: BoPAttributes;
  tradeoffNote: string;
  engineType: 'v6-hybrid' | 'v8-hybrid' | 'v10' | 'v12' | 'flat6' | 'electric' | 'turbo-i6' | 'turbo-i4';
  gears?: number; // per-car transmission gear override (e.g. Cadillac GTP = 6 gears)
  specialTypeOverride?: ClassSpecialType;
  specialLabelOverride?: string;
  defaultLivery: LiveryConfig;
}

export type TrackRegion = 'Americas' | 'Europe' | 'Asia-Pacific & Middle East' | 'Custom';

export type SceneryTheme = 'stadium' | 'forest' | 'desert' | 'street-night' | 'coastal' | 'parkland';

export interface TrackWaypoint {
  x: number;
  y: number; // elevation
  z: number;
  width?: number; // per-node width override
  banking?: number; // per-node banking in degrees
  tension?: number; // per-node Catmull-Rom tension (0.15 tight .. 0.85 sweeping, default 0.5)
}

export interface TrackSpec {
  id: string;
  name: string;
  shortName: string;
  country: string;
  region: TrackRegion;
  seriesTags: ('IMSA' | 'WEC' | 'F1')[];
  flagship: boolean;
  scenery: SceneryTheme;
  asphaltColor: string;
  kerbPrimary: string;
  kerbSecondary: string;
  trackWidth: number;
  targetLapSeconds: number;
  corners: number;
  waypoints: TrackWaypoint[];
  isCustom?: boolean;
  startNodeIndex?: number;
  pitSide?: 'left' | 'right';
  banking?: number;
  createdAt?: number;
}

export type TireCompound = 'soft' | 'medium' | 'hard' | 'wet';

export type WeatherMode = 'dry' | 'dynamic-rain';

export type AIDifficulty = 'Rookie' | 'Amateur' | 'Pro' | 'Alien';

export type AIPersonality = 'Late-Braker' | 'Metronome' | 'Tire-Saver' | 'Traffic-Smart';

export type CameraMode = 'chase-34' | 'high-chase' | 'isometric';

export type PitServiceType = 'splash-go' | 'full-service';

export interface PitStrategy {
  serviceType: PitServiceType;
  nextCompound: TireCompound;
}

export interface RaceConfig {
  trackId: string;
  customTrack?: TrackSpec;
  activeClasses: CarClassId[];
  playerCarId: string;
  playerLivery: LiveryConfig;
  gridSize: number; // 1 to 24
  aiBotCount: number; // 0 to 23
  noAi: boolean; // quick toggle for No AI (Humans Only / Solo)
  totalLaps: number; // 5 to 20
  weather: WeatherMode;
  startingCompound: TireCompound;
  qualifyingEnabled: boolean;
  aiDifficulty: AIDifficulty;
  aiAdaptiveBoost: number; // -0.06 to +0.08 learned from player lap times
  roomCode?: string;
}

export interface DriverStandingsEntry {
  id: string;
  name: string;
  isPlayer: boolean;
  isHumanPeer: boolean;
  carId: string;
  classId: CarClassId;
  driverNumber: string;
  personality?: AIPersonality;
  position: number;
  classPosition: number;
  lap: number;
  progress: number; // 0..1 along lap
  totalDistance: number;
  intervalToAhead: number; // seconds
  intervalToLeader: number; // seconds
  bestLapTime: number | null;
  lastLapTime: number | null;
  totalTime: number;
  pitStops: number;
  inPit: boolean;
  finished: boolean;
  primaryColor: string;
  secondaryColor: string;
}

export type GamePhase = 'title' | 'qualifying' | 'playing' | 'paused' | 'gameover';

export interface HudSnapshot {
  phase: GamePhase;
  countdown: number; // >0 before green flag
  speedKmh: number;
  gear: number;
  rpmNormalized: number; // 0..1
  lap: number;
  totalLaps: number;
  position: number;
  totalCars: number;
  classPosition: number;
  classCars: number;
  currentLapTime: number;
  bestLapTime: number | null;
  lastLapTime: number | null;
  intervalAhead: number | null;
  intervalBehind: number | null;
  tireWear: number; // 100 down to 0
  tireTemp: number; // Celsius
  compound: TireCompound;
  fuel: number; // 100 down to 0
  fuelLapsRemaining: number; // estimated laps of fuel remaining
  aeroDamage: number; // 0 up to 100
  specialCharge: number; // 0..100
  specialActive: boolean;
  attackModeUsesRemaining?: number;
  attackModeTimer?: number;
  inSlipstream: boolean;
  trackWetness: number; // 0..1
  warningCount: number;
  penaltyTimeRemaining: number;
  inPitLane: boolean;
  pitLimiterActive: boolean;
  pitStopRemaining: number;
  pitSpeeding: boolean;
  pitStrategy: PitStrategy;
  cameraMode: CameraMode;
  standings: DriverStandingsEntry[];
  minimapDots: Array<{
    id: string;
    x: number;
    z: number;
    classId: CarClassId;
    isPlayer: boolean;
    isHumanPeer: boolean;
  }>;
  qualiResultTime: number | null;
  qualiGridPos: number | null;
}

export interface RoomPeer {
  peerId: string;
  name: string;
  carId: string;
  classId: CarClassId;
  livery: LiveryConfig;
  ready: boolean;
  isHost: boolean;
}

export interface RoomState {
  code: string;
  hostId: string;
  config: Partial<RaceConfig>;
  customTrack?: TrackSpec;
  peers: RoomPeer[];
  players?: Record<string, RoomPeer>;
  started: boolean;
}
