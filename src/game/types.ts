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
  | 'drs'
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

export type PaintFinish =
  | 'gloss'
  | 'metallic'
  | 'matte'
  | 'satin'
  | 'chrome'
  | 'carbon-weave'
  | 'pearlescent';

export type WindowTint = 'clear' | 'smoke' | 'dark' | 'mirror';

export type GarageEnvironment = 'display-case' | 'pit-garage' | 'sunset-grid' | 'wind-tunnel';

export type DecalShape =
  | 'stripe'
  | 'chevron'
  | 'star'
  | 'circle'
  | 'diamond'
  | 'checkered'
  | 'lightning'
  | 'number-plate'
  | 'text';

export interface DecalLayer {
  id: string;
  shape: DecalShape;
  x: number; // 0..1 normalized UV
  y: number; // 0..1 normalized UV
  scale: number; // 0.05..0.6
  rotation: number; // degrees
  color: string;
  mirror: boolean;
  text?: string;
  opacity?: number;
}

export type LiveryDecal = DecalLayer;

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
  paintFinish?: PaintFinish;
  caliperColor?: string;
  windowTint?: WindowTint;
  decals?: DecalLayer[];
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
  sceneryProp?: 'none' | 'grandstand' | 'trees' | 'bridge' | 'tunnel';
  runoff?: 'asphalt' | 'grass' | 'gravel';
  drsZone?: boolean;
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
  sectorSplits?: [number, number];
  createdAt?: number;
}

export type TireCompound = 'soft' | 'medium' | 'hard' | 'wet';

export type WeatherMode = 'dry' | 'dynamic-rain';

export type WeatherCondition =
  | 'dry'
  | 'overcast'
  | 'light-drizzle'
  | 'rain'
  | 'heavy-storm'
  | 'drying-track';

export type WeatherPresetId =
  | 'clear-dry'
  | 'overcast'
  | 'passing-shower'
  | 'storm-front'
  | 'drying-track'
  | 'dynamic-random'
  | 'custom';

export interface WeatherForecastSegment {
  /** Normalized session time / race progress [0..1] where this segment starts */
  progressFraction: number;
  condition: WeatherCondition;
  /** Target rain intensity [0..1] */
  rainIntensity: number;
}

export type DamageLevel = 'off' | 'visual-only' | 'light' | 'realistic';

export type AbsLevel = 'off' | 'low' | 'high';

export type ErsMode = 'harvest' | 'balanced' | 'overtake' | 'quali';

export type TrackSurfaceType =
  | 'asphalt'
  | 'kerb'
  | 'sausage-kerb'
  | 'concrete-runoff'
  | 'astroturf'
  | 'grass'
  | 'gravel';

export interface WheelTireState {
  wear: number; // 100 down to 0
  temp: number; // Celsius
  flatSpot: number; // 0..1
  graining: number; // 0..1
  load: number; // normalized vertical load ~0.2..2.0
}

export interface FourWheelTireState {
  fl: WheelTireState;
  fr: WheelTireState;
  rl: WheelTireState;
  rr: WheelTireState;
}

export interface LocalizedDamageState {
  frontWing: number; // 0..100
  rearWing: number; // 0..100
  engine: number; // 0..100
  suspension: number; // 0..100
  suspensionPullDir: number; // -1..+1 steering pull direction
  headlightBroken: boolean;
  frontWingDetached: boolean;
  rearWingDetached: boolean;
}

export interface CarSetupConfig {
  frontWing: number; // 0..100 (50 = balanced)
  rearWing: number; // 0..100 (50 = balanced)
  brakeBalance: number; // 45..68 (% front)
  finalDrive: number; // -10..+10 (negative = short accel, positive = tall Vmax)
  suspensionStiffness: number; // 0..100 (50 = balanced)
  arbBalance: number; // -50..+50 (negative = understeer, positive = oversteer)
  diffLock: number; // 0..100 (0 = open/entry turn-in, 100 = locked/exit traction)
  startingFuel: number; // 15..100 (%)
  tirePressureFront: number; // 18..32 psi
  tirePressureRear: number; // 18..32 psi
}

export type RaceFlagState =
  | 'green'
  | 'yellow'
  | 'double-yellow'
  | 'white'
  | 'black-and-white'
  | 'black'
  | 'checkered';

export type SectorFlag = 'green' | 'yellow';

export type PenaltyReason =
  | 'corner-cut'
  | 'avoidable-contact'
  | 'yellow-overtake';

export type PenaltyType = 'slow-down' | 'time-penalty' | 'drive-through' | 'stop-and-go';

export type AIDifficulty = 'Rookie' | 'Amateur' | 'Pro' | 'Alien';

export type AIPersonality =
  | 'Late-Braker'
  | 'Metronome'
  | 'Tire-Saver'
  | 'Traffic-Smart'
  | 'Average GTP Driver'
  | 'Passive';

export type TimeOfDayPreset =
  | 'midday'
  | 'dawn'
  | 'golden-hour'
  | 'dusk'
  | 'night'
  | 'dynamic-24h';

export type CameraMode =
  | 'orbit'
  | 'chase-close'
  | 'chase-far'
  | 'hood'
  | 'bumper'
  | 'cockpit'
  | 'tv-broadcast';

export type PhotoFilterId =
  | 'none'
  | 'film-grain'
  | 'noir'
  | 'kodachrome'
  | 'f1-broadcast'
  | 'vintage';

export type MfdPage = 'tires-brakes' | 'strategy' | 'electronics' | 'sectors';

export type TcLevel = 0 | 1 | 2 | 3;

export type EngineerVerbosity = 'off' | 'minimal' | 'full';

export type BlindSpotStatus = 'clear' | 'left' | 'right' | 'both';

export interface CornerCallout {
  direction: 'left' | 'right' | 'chicane';
  severity: 'hairpin' | 'sharp' | 'medium' | 'fast';
  distanceM: number;
  suggestedGear: number;
  brakingRecommended: boolean;
}

export interface RaceRadioMessage {
  id: string;
  sender: 'SPOTTER' | 'ENGINEER' | 'RACE CONTROL';
  text: string;
  priority: 'low' | 'medium' | 'high';
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface LobbySummary {
  code: string;
  name: string;
  trackId: string;
  activeClasses: CarClassId[];
  playerCount: number;
  maxPlayers: number;
  started: boolean;
  hostName: string;
}

export interface PlayerOnlineProfile {
  username: string;
  eloRating: number;
  safetyRating: number; // 0..100
  racesCompleted: number;
  wins: number;
  cleanLaps: number;
}

export type PitServiceAction = 'tyres' | 'fuel' | 'repair';

export interface PitStrategy {
  nextCompound: TireCompound;
}

export type SinglePlayerSessionMode =
  | 'race'
  | 'practice'
  | 'ai-race'
  | 'time-trial'
  | 'elimination'
  | 'scenario'
  | 'license'
  | 'championship';

export type GhostTargetMode = 'off' | 'personal-best' | 'bronze' | 'silver' | 'gold' | 'alien';

export type MedalTier = 'bronze' | 'silver' | 'gold' | 'alien';

export type AiPaceOrder = 'conserve' | 'balanced' | 'push' | 'attack';

export type WeekendStage = 'practice' | 'qualifying' | 'sprint' | 'feature';

export interface ProximityCarIndicator {
  id: string;
  /** Relative lateral distance in meters (+right, -left in player car frame) */
  dx: number;
  /** Relative longitudinal distance in meters (+ahead, -behind in player car frame) */
  dz: number;
  classId: CarClassId;
  isHumanPeer: boolean;
}

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
  /** Optional timed endurance duration in minutes (0 or undefined = lap-based) */
  raceDurationMinutes?: number;
  weather: WeatherMode;
  weatherPreset?: WeatherPresetId;
  weatherTimeline?: WeatherForecastSegment[];
  startingCompound: TireCompound;
  qualifyingEnabled: boolean;
  aiDifficulty: AIDifficulty;
  damageLevel?: DamageLevel;
  absLevel?: AbsLevel;
  carSetup?: CarSetupConfig;
  roomCode?: string;
  sessionMode?: SinglePlayerSessionMode;
  startType?: RaceStartType;
  ghostMode?: GhostTargetMode;
  eliminationIntervalSeconds?: number;
  scenarioId?: string;
  licenseId?: string;
  startingGridPosition?: number;
  startingFuelOverride?: number;
  championshipId?: string;
  weekendStage?: WeekendStage;
  dailyChallengeDate?: string;
  timeOfDay?: TimeOfDayPreset;
  timeScale?: number;
}

export interface AiNeuralRadarSlot {
  occupied: boolean;
  relLongM: number;
  relLatM: number;
  relSpeedMs: number;
  classDiff: number;
}

export interface AiNeuralTelemetrySnapshot {
  carId: string;
  driverName: string;
  nationality?: string;
  teamName?: string;
  personality: AIPersonality;
  policyBlendLabel: string;
  startPolicyWeight: number;
  steer: number;
  throttle: number;
  brake: number;
  lookaheadCurvatures: number[];
  radarSlots: AiNeuralRadarSlot[];
  activeManeuver:
    | 'racing'
    | 'overtaking'
    | 'defending'
    | 'blue-flag'
    | 'recovering'
    | 'servicing'
    | 'launch';
  strategyIntent: string | null;
  mistakeActive: boolean;
}

export interface DriverStandingsEntry {
  id: string;
  name: string;
  isPlayer: boolean;
  isHumanPeer: boolean;
  carId: string;
  classId: CarClassId;
  driverNumber: string;
  nationality?: string;
  teamName?: string;
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
  postRacePenaltySeconds?: number;
  pitStops: number;
  inPit: boolean;
  finished: boolean;
  eliminated?: boolean;
  primaryColor: string;
  secondaryColor: string;
}

export type GamePhase = 'title' | 'qualifying' | 'playing' | 'paused' | 'gameover';

export interface HudSnapshot {
  phase: GamePhase;
  countdown: number; // >0 before green flag
  startType?: RaceStartType;
  greenFlagFlash?: number; // >0 brief GREEN FLAG banner after start
  launchStatus?: 'none' | 'staging' | 'perfect';
  launchRpmSweetSpot?: [number, number];
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
  /** Live delta vs personal best / target ghost in seconds (negative = ahead/faster) */
  liveDeltaSeconds?: number | null;
  ghostLabel?: string | null;
  intervalAhead: number | null;
  intervalBehind: number | null;
  tireWear: number; // 100 down to 0
  tireTemp: number; // Celsius
  tires?: FourWheelTireState;
  brakeTempFront?: number;
  brakeTempRear?: number;
  brakeFade?: number; // 0..1
  brakeLockup?: number; // 0..1
  brakeBalance?: number; // % front (45..68)
  compound: TireCompound;
  fuel: number; // 100 down to 0
  fuelLiters?: number;
  fuelCapacityLiters?: number;
  fuelLapsRemaining: number; // estimated laps of fuel remaining
  aeroDamage: number; // 0 up to 100
  damage?: LocalizedDamageState;
  damageLevel?: DamageLevel;
  specialCharge: number; // 0..100
  specialActive: boolean;
  ersBattery?: number; // 0..100 standalone hybrid ERS battery (GTP, F1 26, F1 21 only)
  hasErs?: boolean;
  ersMode?: ErsMode;
  transmissionMode?: 'auto' | 'semi-auto' | 'manual';
  drsEligible?: boolean;
  inDrsZone?: boolean;
  attackModeUsesRemaining?: number;
  attackModeTimer?: number;
  inAttackModeZone?: boolean;
  inSlipstream: boolean;
  dirtyAirStrength?: number; // 0..1
  surfaceType?: TrackSurfaceType;
  crestLoadFactor?: number;
  trackWetness: number; // 0..1
  weatherCondition?: WeatherCondition;
  racingLineWetness?: number;
  offLineWetness?: number;
  trackRubber?: number; // 0..1
  ambientTempC?: number;
  trackTempC?: number;
  weatherNextLabel?: string;
  warningCount: number;
  penaltyTimeRemaining: number;
  postRacePenaltySeconds?: number;
  penaltyReason?: PenaltyReason | null;
  penaltyType?: PenaltyType | null;
  raceFlag?: RaceFlagState;
  sectorFlags?: [SectorFlag, SectorFlag, SectorFlag];
  inYellowMicrosector?: boolean;
  yellowYieldTargetName?: string | null;
  yellowYieldPositions?: number;
  blueFlagActive?: boolean;
  raceControlMessage?: string | null;
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
  proximityCars?: ProximityCarIndicator[];
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
  sessionBestSectorTimes?: [number | null, number | null, number | null];
  lastLapSectorTimes?: [number | null, number | null, number | null];
  // Section 3: Endurance timer, Elimination, Scenarios/Licenses, AI Race Engineer, Analytics
  raceDurationSeconds?: number;
  raceTimeRemaining?: number | null;
  eliminationCountdown?: number | null;
  eliminatedCarIds?: string[];
  eliminated?: boolean;
  scenarioTitle?: string | null;
  scenarioObjective?: string | null;
  topSpeedKmh?: number;
  overtakesCount?: number;
  cleanLapsCount?: number;
  incidentsCount?: number;
  managedAiCarId?: string | null;
  aiPaceOrder?: AiPaceOrder;
  weekendStage?: WeekendStage;
  championshipRoundLabel?: string | null;
  aiNeuralTelemetry?: AiNeuralTelemetrySnapshot | null;
  // Section 5-10: Driving Aids, Live Inputs, Awareness, Radio, Replay, Telemetry & Online
  tcLevel?: TcLevel;
  tcIntervening?: boolean;
  stabilityIntervening?: boolean;
  throttleInput?: number;
  brakeInput?: number;
  steerInput?: number;
  blindSpot?: BlindSpotStatus;
  rearCarGapM?: number | null;
  rearCarClosingKmh?: number;
  rearCarLateralM?: number;
  upcomingCorner?: CornerCallout | null;
  radioMessage?: RaceRadioMessage | null;
  mecachromeWarning?: boolean;
  mecachromeRemaining?: number;
  fps?: number;
  timeOfDayHours?: number;
  lapPositionHistory?: Array<{ lap: number; position: number }>;
  replayAvailable?: boolean;
  flashbackAvailable?: boolean;
  peerPings?: Record<string, number>;
  chatMessages?: ChatMessage[];
}

export interface RoomPeer {
  peerId: string;
  name: string;
  carId: string;
  classId: CarClassId;
  livery: LiveryConfig;
  ready: boolean;
  isHost: boolean;
  isSpectator?: boolean;
  pingMs?: number;
  eloRating?: number;
  safetyRating?: number;
}

export interface RoomState {
  code: string;
  hostId: string;
  name?: string;
  isPublic?: boolean;
  config: Partial<RaceConfig>;
  customTrack?: TrackSpec;
  peers: RoomPeer[];
  players?: Record<string, RoomPeer>;
  started: boolean;
  raceStartServerTime?: number;
  trackVotes?: Record<string, string>;
  chatMessages?: ChatMessage[];
}
