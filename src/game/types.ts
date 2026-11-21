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
  | 'formula-white'
  | 'none';

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
  customTexture?: string; // Optional data URL or texture path for custom painted liveries
}

export interface CarDimensions {
  length: number; // in meters (e.g. 5.00 for Hypercars, 4.75 for GT3, 3.84 for Clio V6, 5.50 for F1)
  width?: number; // in meters
  height?: number; // in meters
  wheelbase?: number; // in meters
}

export interface CarLiveryPreset {
  id: string;
  name: string;
  team?: string;
  livery: LiveryConfig;
}

export type SoundProfileId =
  | 'cadillac_v8_hybrid'
  | 'gtp_turbo_v8'
  | 'gtp_turbo_v6'
  | 'gtp_na_v12'
  | 'gtp_na_v8'
  | 'lmp2_gibson_v8'
  | 'gt3_flat6'
  | 'gt3_flatplane_v8'
  | 'gt3_v10'
  | 'gt3_crossplane_v8'
  | 'gt3_turbo_v6'
  | 'gt3_turbo_i6'
  | 'gt3_turbo_v8'
  | 'gt4_flat6'
  | 'gt4_turbo_i6'
  | 'gt4_turbo_v8'
  | 'gt4_turbo_v6'
  | 'gt4_turbo_i4'
  | 'gt4_crossplane_v8'
  | 'f1_v6_hybrid'
  | 'f1_v10'
  | 'formula_e'
  | 'coupe_flat6'
  | 'coupe_flatplane_v8'
  | 'coupe_turbo_i6'
  | 'coupe_turbo_v6'
  | 'coupe_na_v6'
  | 'coupe_turbo_i4'
  | 'supercar_v12'
  | 'supercar_flatplane_v8'
  | 'supercar_v6_hybrid';

export interface CarSpec {
  id: string;
  name: string;
  manufacturer: string;
  classId: CarClassId;
  silhouette: BodySilhouette;
  attributes: BoPAttributes;
  tradeoffNote: string;
  engineType: 'v6-hybrid' | 'v8-hybrid' | 'v6' | 'v8' | 'v10' | 'v12' | 'flat6' | 'electric' | 'turbo-i6' | 'turbo-i4';
  soundProfile?: SoundProfileId;
  gears?: number; // per-car transmission gear override (e.g. Cadillac GTP = 6 gears)
  specialTypeOverride?: ClassSpecialType;
  specialLabelOverride?: string;
  defaultLivery: LiveryConfig;
  modelId?: string; // override model folder if different from carSpec.id
  liveries?: CarLiveryPreset[]; // multiple selectable liveries for single-chassis classes (e.g. F1 2026, F1 2021, LMP2)
  dimensions?: CarDimensions;
  length?: number; // Real-world car length in meters
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
  city?: string;
  region: TrackRegion;
  seriesTags: ('IMSA' | 'WEC' | 'F1')[];
  flagship: boolean;
  scenery: SceneryTheme;
  asphaltColor: string;
  kerbPrimary: string;
  kerbSecondary: string;
  trackWidth: number;
  targetLapSeconds: number;
  circuitLengthKm?: number;
  circuitInfo?: string;
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

export type CameraMode = 'orbit' | 'hood';

export type PitServiceAction = 'tyres' | 'fuel';

export interface PitStrategy {
  nextCompound: TireCompound;
}

export type SinglePlayerSessionMode = 'race' | 'practice' | 'ai-race';

export type RaceStartType = 'standing' | 'rolling';

export type SpectatorCameraMode = 'spectate' | 'freecam';

export interface RaceConfig {
  trackId: string;
  customTrack?: TrackSpec;
  activeClasses: CarClassId[];
  playerCarId: string;
  playerLivery: LiveryConfig;
  gridSize: number; // 1 to 24
  aiBotCount: number; // 0 to 23
  noAi: boolean; // quick toggle for No AI (Humans Only / Solo)
  totalLaps: number; // 0 = continuous practice, 1..20 race laps
  weather: WeatherMode;
  startingCompound: TireCompound;
  qualifyingEnabled: boolean;
  aiDifficulty: AIDifficulty;
  roomCode?: string;
  sessionMode?: SinglePlayerSessionMode;
  startType?: RaceStartType;
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
  startType?: RaceStartType;
  greenFlagFlash?: number; // >0 brief GREEN FLAG banner after start
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
  isStoppedOnTrack: boolean;
  pitStopRemaining: number;
  pitStopTotal: number;
  pitActiveTask: PitServiceAction | null;
  pitQueue: PitServiceAction[];
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
  sessionMode?: SinglePlayerSessionMode;
  spectatorCameraMode?: SpectatorCameraMode;
  spectatedCarId?: string | null;
  spectatedDriverName?: string;
  spectatedCarName?: string;
  currentSector?: 1 | 2 | 3;
  sectorTimes?: [number | null, number | null, number | null];
  bestSectorTimes?: [number | null, number | null, number | null];
  lastLapSectorTimes?: [number | null, number | null, number | null];
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
