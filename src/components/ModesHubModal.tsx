import { useMemo, useState } from 'react';
import {
  Award,
  Calendar,
  Check,
  Clock,
  Copy,
  Flame,
  GraduationCap,
  Play,
  Plus,
  RotateCcw,
  Shield,
  Sparkles,
  Timer,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import { CAR_CLASSES, CARS, getCarById } from '../game/cars';
import {
  ActiveChampionshipState,
  CHAMPIONSHIP_PRESETS,
  ChampionshipRoundSpec,
  ChampionshipSeriesPreset,
  HERITAGE_UNLOCK_LIVERIES,
  WeekendFormat,
  computeConstructorStandings,
  createChampionshipSeason,
  getCollectorRank,
  getSuggestedCarsForClasses,
  loadCareerProfile,
  saveActiveChampionship,
  saveCareerProfile,
  unlockHeritageLivery,
} from '../game/championship';
import { formatLapTime } from '../game/physics';
import {
  computeTrackClassMedalTargets,
  formatDailyShareCard,
  getDailyChallengeBest,
  getDailyHotlapChallenge,
  listPersonalRecords,
} from '../game/records';
import {
  LICENSE_TESTS,
  RACE_SCENARIOS,
  ScenarioSpec,
  buildRaceConfigPatchFromScenario,
  describeScenarioTrack,
  loadChallengeMedals,
} from '../game/scenarios';
import { TRACKS, getTrackById } from '../game/tracks';
import {
  AIDifficulty,
  CarClassId,
  GhostTargetMode,
  LiveryConfig,
  MedalTier,
  RaceConfig,
  WeatherPresetId,
} from '../game/types';

type HubTab = 'championship' | 'timetrial' | 'scenarios' | 'special' | 'collector';

interface ModesHubModalProps {
  raceConfig: RaceConfig;
  activeChampionship: ActiveChampionshipState | null;
  onUpdateChampionship: (next: ActiveChampionshipState | null) => void;
  onLaunchChampionshipStage: (champ: ActiveChampionshipState, skipPractice?: boolean) => void;
  onStartModeSession: (patch: Partial<RaceConfig>) => void;
  onApplyHeritageLivery: (patch: Partial<LiveryConfig>) => void;
  onClose: () => void;
  initialTab?: HubTab;
}

function MedalBadge({ medal }: { medal: MedalTier | null | undefined }) {
  if (!medal) {
    return (
      <span className="px-1.5 py-0.5 rounded bg-[#18202c] border border-white/10 text-[10px] font-bold uppercase text-slate-500">
        No Medal
      </span>
    );
  }
  const styles: Record<MedalTier, string> = {
    bronze: 'bg-amber-900/40 border-amber-600/60 text-amber-300',
    silver: 'bg-slate-400/20 border-slate-300/60 text-slate-200',
    gold: 'bg-yellow-500/25 border-yellow-400/70 text-yellow-300',
    alien: 'bg-fuchsia-600/30 border-fuchsia-400/80 text-fuchsia-200',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded border text-[10px] font-display font-bold uppercase ${styles[medal]}`}>
      {medal}
    </span>
  );
}

export function ModesHubModal({
  raceConfig,
  activeChampionship,
  onUpdateChampionship,
  onLaunchChampionshipStage,
  onStartModeSession,
  onApplyHeritageLivery,
  onClose,
  initialTab = 'championship',
}: ModesHubModalProps) {
  const [tab, setTab] = useState<HubTab>(initialTab);

  // Championship creation & custom builder state
  const [selectedPresetId, setSelectedPresetId] = useState<string>(CHAMPIONSHIP_PRESETS[0].id);
  const [champCarId, setChampCarId] = useState<string>(CHAMPIONSHIP_PRESETS[0].defaultPlayerCarId);
  const [champDiff, setChampDiff] = useState<AIDifficulty>(raceConfig.aiDifficulty);
  const [champWeekendFormat, setChampWeekendFormat] = useState<WeekendFormat>(
    CHAMPIONSHIP_PRESETS[0].weekendFormat,
  );
  const [standingsView, setStandingsView] = useState<'drivers' | 'constructors'>('drivers');
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);
  const [customSeasonName, setCustomSeasonName] = useState('Apex Custom Cup');
  const [customClass, setCustomClass] = useState<CarClassId>(CarClassId.GT3);
  const [customLaps, setCustomLaps] = useState<number>(5);
  const [customDurationMins, setCustomDurationMins] = useState<number>(0);
  const [customTrackIds, setCustomTrackIds] = useState<string[]>([
    'spa-francorchamps',
    'monza',
    'silverstone',
    'suzuka',
  ]);
  const [addTrackChoice, setAddTrackChoice] = useState<string>(TRACKS[0].id);

  // Time Trial & Daily state
  const dailyChallenge = useMemo(() => getDailyHotlapChallenge(), []);
  const dailyBest = useMemo(() => getDailyChallengeBest(dailyChallenge.dateKey), [dailyChallenge.dateKey]);
  const dailyTrack = getTrackById(dailyChallenge.trackId);
  const dailyCar = getCarById(dailyChallenge.carId);
  const [copiedDaily, setCopiedDaily] = useState(false);
  const [ttGhostMode, setTtGhostMode] = useState<GhostTargetMode>(raceConfig.ghostMode ?? 'personal-best');
  const personalRecords = useMemo(() => listPersonalRecords(), []);

  // Scenarios & Licenses
  const [challengeMedals] = useState<Record<string, MedalTier>>(() => loadChallengeMedals());
  const [challengeFilter, setChallengeFilter] = useState<'scenarios' | 'licenses'>('scenarios');

  // Elimination & Endurance
  const [elimInterval, setElimInterval] = useState<number>(30);
  const [elimGridSize, setElimGridSize] = useState<number>(10);
  const [enduranceMins, setEnduranceMins] = useState<number>(15);

  // Collector Career Profile
  const [career, setCareer] = useState(() => loadCareerProfile());
  const [unlockFeedback, setUnlockFeedback] = useState<string | null>(null);

  const selectedPreset = useMemo(
    () => CHAMPIONSHIP_PRESETS.find((p) => p.id === selectedPresetId) ?? CHAMPIONSHIP_PRESETS[0],
    [selectedPresetId],
  );
  const presetCarPool = useMemo(
    () => getSuggestedCarsForClasses(selectedPreset.classes),
    [selectedPreset.classes],
  );
  const customCarPool = useMemo(() => getSuggestedCarsForClasses([customClass]), [customClass]);

  const handleSelectPreset = (preset: ChampionshipSeriesPreset) => {
    setSelectedPresetId(preset.id);
    setChampCarId(preset.defaultPlayerCarId);
    setChampWeekendFormat(preset.weekendFormat);
    setShowCustomBuilder(false);
  };

  const handleStartPresetSeason = () => {
    const season = createChampionshipSeason({
      series: selectedPreset,
      playerCarId: champCarId,
      aiDifficulty: champDiff,
      weekendFormat: champWeekendFormat,
    });
    saveActiveChampionship(season);
    onUpdateChampionship(season);
  };

  const handleCreateCustomSeason = () => {
    if (customTrackIds.length < 2) return;
    const pool = getSuggestedCarsForClasses([customClass]);
    const validCarId = pool.some((c) => c.id === champCarId) ? champCarId : pool[0].id;
    const rounds: ChampionshipRoundSpec[] = customTrackIds.map((tid, idx) => ({
      roundNumber: idx + 1,
      trackId: tid,
      laps: customDurationMins > 0 ? 99 : customLaps,
      raceDurationMinutes: customDurationMins > 0 ? customDurationMins : undefined,
      weatherPreset: (idx % 3 === 1 ? 'passing-shower' : 'clear-dry') as WeatherPresetId,
    }));
    const customSeries: ChampionshipSeriesPreset = {
      id: `custom-${Date.now()}`,
      name: customSeasonName.trim() || 'Apex Custom Cup',
      shortName: 'Custom',
      description: 'Player-designed custom championship calendar.',
      classes: [customClass],
      defaultPlayerCarId: validCarId,
      gridSize: 12,
      weekendFormat: champWeekendFormat,
      rounds,
    };
    const season = createChampionshipSeason({
      series: customSeries,
      playerCarId: validCarId,
      aiDifficulty: champDiff,
      weekendFormat: champWeekendFormat,
      customRounds: rounds,
    });
    saveActiveChampionship(season);
    onUpdateChampionship(season);
    setShowCustomBuilder(false);
  };

  const handleCopyDailyCard = () => {
    const text = formatDailyShareCard(dailyChallenge, dailyBest);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedDaily(true);
    window.setTimeout(() => setCopiedDaily(false), 2000);
  };

  const handleLaunchDaily = () => {
    onStartModeSession({
      sessionMode: 'time-trial',
      trackId: dailyChallenge.trackId,
      customTrack: undefined,
      playerCarId: dailyChallenge.carId,
      playerLivery: { ...dailyCar.defaultLivery },
      activeClasses: [dailyCar.classId],
      noAi: true,
      aiBotCount: 0,
      gridSize: 1,
      totalLaps: 0,
      raceDurationMinutes: 0,
      weather: dailyChallenge.weatherPreset === 'clear-dry' ? 'dry' : 'dynamic-rain',
      weatherPreset: dailyChallenge.weatherPreset,
      startingCompound: dailyChallenge.compound,
      qualifyingEnabled: false,
      startType: 'rolling',
      ghostMode: 'personal-best',
      dailyChallengeDate: dailyChallenge.dateKey,
      championshipId: undefined,
      scenarioId: undefined,
      licenseId: undefined,
    });
  };

  const handleLaunchTimeTrial = () => {
    const car = getCarById(raceConfig.playerCarId);
    onStartModeSession({
      sessionMode: 'time-trial',
      noAi: true,
      aiBotCount: 0,
      gridSize: 1,
      totalLaps: 0,
      raceDurationMinutes: 0,
      qualifyingEnabled: false,
      startType: 'rolling',
      activeClasses: [car.classId],
      ghostMode: ttGhostMode,
      dailyChallengeDate: undefined,
      championshipId: undefined,
      scenarioId: undefined,
      licenseId: undefined,
    });
  };

  const handleLaunchScenario = (spec: ScenarioSpec) => {
    const patch = buildRaceConfigPatchFromScenario(spec);
    onStartModeSession({
      ...patch,
      championshipId: undefined,
      dailyChallengeDate: undefined,
    });
  };

  const handleLaunchElimination = () => {
    onStartModeSession({
      sessionMode: 'elimination',
      noAi: false,
      aiBotCount: Math.max(3, elimGridSize - 1),
      gridSize: elimGridSize,
      totalLaps: 99,
      raceDurationMinutes: 0,
      eliminationIntervalSeconds: elimInterval,
      qualifyingEnabled: false,
      startType: 'rolling',
      championshipId: undefined,
      scenarioId: undefined,
      licenseId: undefined,
      dailyChallengeDate: undefined,
    });
  };

  const handleLaunchEndurance = () => {
    onStartModeSession({
      sessionMode: 'race',
      noAi: false,
      aiBotCount: Math.max(5, raceConfig.aiBotCount || 11),
      gridSize: Math.max(6, (raceConfig.aiBotCount || 11) + 1),
      totalLaps: 99,
      raceDurationMinutes: enduranceMins,
      qualifyingEnabled: false,
      startType: 'rolling',
      championshipId: undefined,
      scenarioId: undefined,
      licenseId: undefined,
      dailyChallengeDate: undefined,
    });
  };

  const currentTrack = raceConfig.customTrack || getTrackById(raceConfig.trackId);
  const currentCar = getCarById(raceConfig.playerCarId);
  const currentTtTargets = useMemo(
    () => computeTrackClassMedalTargets(currentTrack, currentCar.classId),
    [currentTrack, currentCar.classId],
  );
  const collectorRank = getCollectorRank(career.reputation);

  return (
    <div
      data-testid="modes-hub-modal"
      role="dialog"
      aria-label="Championships & Game Modes"
      className="fixed inset-0 z-30 bg-black/82 flex items-center justify-center safe-pad-modal"
    >
      <div className="w-full max-w-5xl max-h-[92dvh] bg-[#11151d] border border-white/15 rounded-lg flex flex-col overflow-hidden shadow-2xl">
        {/* Top Header */}
        <div className="px-4 sm:px-6 py-3.5 bg-[#0d1118] border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base sm:text-xl font-display font-extrabold text-white tracking-wide flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
              <span className="truncate">CHAMPIONSHIPS &amp; MODES</span>
            </h2>
            <p className="text-[11px] text-slate-400 truncate">
              Seasons, Ghost Time Trials, Daily Hotlap, Scenarios, Driving Licenses, Knockout &amp; Collector Career
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Modes Hub"
            className="p-2 rounded bg-[#161c28] hover:bg-[#222b3d] border border-white/10 text-slate-300 hover:text-white cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-4 sm:px-6 py-2 bg-[#0d1118] border-b border-white/10 flex items-center gap-1.5 overflow-x-auto shrink-0">
          {(
            [
              { id: 'championship', label: 'Championships', icon: Trophy },
              { id: 'timetrial', label: 'Time Trial & Daily', icon: Timer },
              { id: 'scenarios', label: 'Scenarios & Licenses', icon: GraduationCap },
              { id: 'special', label: 'Elimination & Endurance', icon: Flame },
              { id: 'collector', label: 'Collector Profile', icon: Award },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`modes-tab-${item.id}`}
                onClick={() => setTab(item.id)}
                className={`px-3 py-2 rounded text-xs font-display font-bold flex items-center gap-1.5 border cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-red-600 border-red-400 text-white'
                    : 'bg-[#151b26] border-white/10 text-slate-300 hover:text-white hover:border-white/25'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto custom-scroll p-4 sm:p-6 space-y-5">
          {/* ==================== 1. CHAMPIONSHIPS ==================== */}
          {tab === 'championship' && (
            <div className="space-y-5">
              {/* Active Season Dashboard */}
              {activeChampionship && (
                <div className="bg-[#151c29] border border-amber-500/40 rounded-lg p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
                        Active Season · {activeChampionship.completed ? 'SEASON COMPLETE' : `Round ${activeChampionship.currentRoundIndex + 1} of ${activeChampionship.rounds.length}`}
                      </div>
                      <h3 className="text-lg font-display font-extrabold text-white">
                        {activeChampionship.name}
                      </h3>
                      <div className="text-xs text-slate-300 mt-0.5">
                        Car: {getCarById(activeChampionship.playerCarId).name} · {activeChampionship.aiDifficulty} AI ·{' '}
                        {activeChampionship.weekendFormat === 'full-weekend'
                          ? 'Full Weekend (Practice → Quali → Sprint → Feature)'
                          : 'Standard Feature Format'}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!activeChampionship.completed && (
                        <>
                          <button
                            type="button"
                            data-testid="btn-launch-champ-stage"
                            onClick={() => onLaunchChampionshipStage(activeChampionship, false)}
                            className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-xs font-display font-bold text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>
                              Start R{activeChampionship.currentRoundIndex + 1} ·{' '}
                              {activeChampionship.currentStage.toUpperCase()}
                            </span>
                          </button>
                          {activeChampionship.currentStage === 'practice' && (
                            <button
                              type="button"
                              onClick={() => onLaunchChampionshipStage(activeChampionship, true)}
                              className="px-3 py-2 rounded bg-[#1d2535] hover:bg-[#273146] border border-white/15 text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap shrink-0"
                            >
                              Skip Practice → Quali
                            </button>
                          )}
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          saveActiveChampionship(null);
                          onUpdateChampionship(null);
                        }}
                        className="px-3 py-2 rounded bg-[#1a1f2b] hover:bg-red-950/60 border border-white/10 hover:border-red-500/40 text-xs font-semibold text-slate-300 hover:text-red-200 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset Season</span>
                      </button>
                    </div>
                  </div>

                  {/* Round Calendar Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {activeChampionship.rounds.map((r, idx) => {
                      const tr = getTrackById(r.trackId);
                      const isCurrent = !activeChampionship.completed && idx === activeChampionship.currentRoundIndex;
                      const isDone = activeChampionship.completed || idx < activeChampionship.currentRoundIndex;
                      return (
                        <div
                          key={`${r.roundNumber}-${r.trackId}`}
                          className={`rounded p-2 border text-xs ${
                            isCurrent
                              ? 'bg-red-600/20 border-red-400 text-white'
                              : isDone
                              ? 'bg-emerald-950/25 border-emerald-500/30 text-slate-300'
                              : 'bg-[#10151f] border-white/10 text-slate-400'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] font-telemetry">
                            <span>R{r.roundNumber}</span>
                            <span>{r.raceDurationMinutes ? `${r.raceDurationMinutes}m` : `${r.laps}L`}</span>
                          </div>
                          <div className="font-semibold truncate mt-0.5">{tr.shortName}</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Standings Table (Drivers / Constructors) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-display font-bold uppercase tracking-wider text-slate-300">
                        Championship Standings
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setStandingsView('drivers')}
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                            standingsView === 'drivers'
                              ? 'bg-amber-500/25 border border-amber-400 text-amber-200'
                              : 'bg-[#10151f] border border-white/10 text-slate-400'
                          }`}
                        >
                          Drivers
                        </button>
                        <button
                          type="button"
                          onClick={() => setStandingsView('constructors')}
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                            standingsView === 'constructors'
                              ? 'bg-amber-500/25 border border-amber-400 text-amber-200'
                              : 'bg-[#10151f] border border-white/10 text-slate-400'
                          }`}
                        >
                          Constructors
                        </button>
                      </div>
                    </div>

                    <div className="max-h-48 overflow-y-auto custom-scroll bg-[#0e131c] border border-white/10 rounded">
                      {standingsView === 'drivers' ? (
                        <table className="w-full text-left text-xs">
                          <thead className="bg-[#131925] text-[10px] uppercase text-slate-400">
                            <tr>
                              <th className="py-1.5 px-2.5">#</th>
                              <th className="py-1.5 px-2.5">Driver</th>
                              <th className="py-1.5 px-2.5">Team</th>
                              <th className="py-1.5 px-2.5 text-right">Wins</th>
                              <th className="py-1.5 px-2.5 text-right">FL</th>
                              <th className="py-1.5 px-2.5 text-right">Pts</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {activeChampionship.driverStandings.slice(0, 14).map((d, idx) => (
                              <tr
                                key={d.driverId}
                                className={d.isPlayer ? 'bg-red-600/20 text-white font-semibold' : 'text-slate-300'}
                              >
                                <td className="py-1.5 px-2.5 font-telemetry">{idx + 1}</td>
                                <td className="py-1.5 px-2.5">{d.name}</td>
                                <td className="py-1.5 px-2.5 text-slate-400">{d.teamName}</td>
                                <td className="py-1.5 px-2.5 text-right font-telemetry">{d.wins}</td>
                                <td className="py-1.5 px-2.5 text-right font-telemetry">{d.fastestLaps}</td>
                                <td className="py-1.5 px-2.5 text-right font-telemetry font-bold text-amber-300">
                                  {d.points}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <table className="w-full text-left text-xs">
                          <thead className="bg-[#131925] text-[10px] uppercase text-slate-400">
                            <tr>
                              <th className="py-1.5 px-2.5">#</th>
                              <th className="py-1.5 px-2.5">Constructor</th>
                              <th className="py-1.5 px-2.5 text-right">Wins</th>
                              <th className="py-1.5 px-2.5 text-right">Podiums</th>
                              <th className="py-1.5 px-2.5 text-right">Pts</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {computeConstructorStandings(activeChampionship.driverStandings).map((c, idx) => (
                              <tr key={c.teamName} className="text-slate-200">
                                <td className="py-1.5 px-2.5 font-telemetry">{idx + 1}</td>
                                <td className="py-1.5 px-2.5 font-semibold">{c.teamName}</td>
                                <td className="py-1.5 px-2.5 text-right font-telemetry">{c.wins}</td>
                                <td className="py-1.5 px-2.5 text-right font-telemetry">{c.podiums}</td>
                                <td className="py-1.5 px-2.5 text-right font-telemetry font-bold text-amber-300">
                                  {c.points}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* New Season Selector / Custom Builder Toggle */}
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-display font-bold uppercase tracking-wider text-slate-200">
                  {showCustomBuilder ? 'Custom Season Builder' : 'Official Series Presets'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCustomBuilder((v) => !v)}
                  className="px-3 py-1.5 rounded bg-[#182030] hover:bg-[#222d42] border border-sky-400/40 text-xs font-semibold text-sky-200 cursor-pointer whitespace-nowrap shrink-0"
                >
                  {showCustomBuilder ? '← Back to Series Presets' : '+ Custom Season Builder'}
                </button>
              </div>

              {!showCustomBuilder ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {CHAMPIONSHIP_PRESETS.map((preset) => {
                      const selected = preset.id === selectedPreset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleSelectPreset(preset)}
                          className={`text-left p-3.5 rounded-lg border transition-colors cursor-pointer ${
                            selected
                              ? 'bg-red-600/15 border-red-400 text-white'
                              : 'bg-[#141a25] border-white/10 hover:border-white/25 text-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-display font-bold text-sm">{preset.shortName}</span>
                            <span className="text-[10px] font-telemetry text-amber-300">
                              {preset.rounds.length} Rounds
                            </span>
                          </div>
                          <div className="text-xs font-semibold text-white mt-0.5">{preset.name}</div>
                          <p className="text-[11px] text-slate-400 mt-1 leading-snug">{preset.description}</p>
                        </button>
                      );
                    })}
                  </div>

                  {/* Entry Configuration */}
                  <div className="lg:col-span-5 bg-[#141a25] border border-white/10 rounded-lg p-4 space-y-3.5">
                    <div className="text-xs font-display font-bold uppercase tracking-wider text-amber-300">
                      Season Entry · {selectedPreset.shortName}
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Your Chassis</label>
                      <select
                        value={champCarId}
                        onChange={(e) => setChampCarId(e.target.value)}
                        className="w-full bg-[#0d1118] border border-white/15 rounded px-2.5 py-2 text-xs text-white"
                      >
                        {presetCarPool.map((c) => (
                          <option key={c.id} value={c.id}>
                            [{CAR_CLASSES[c.classId].shortName}] {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">AI Difficulty</label>
                        <select
                          value={champDiff}
                          onChange={(e) => setChampDiff(e.target.value as AIDifficulty)}
                          className="w-full bg-[#0d1118] border border-white/15 rounded px-2 py-1.5 text-xs text-white"
                        >
                          {(['Rookie', 'Amateur', 'Pro', 'Alien'] as AIDifficulty[]).map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Weekend Format</label>
                        <select
                          value={champWeekendFormat}
                          onChange={(e) => setChampWeekendFormat(e.target.value as WeekendFormat)}
                          className="w-full bg-[#0d1118] border border-white/15 rounded px-2 py-1.5 text-xs text-white"
                        >
                          <option value="standard">Feature Only</option>
                          <option value="full-weekend">Full Weekend (P/Q/S/F)</option>
                        </select>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Points: 25-18-15-12-10-8-6-4-2-1 · +1 Pole · +1 Fastest Lap (Top 10)
                    </div>
                    <button
                      type="button"
                      data-testid="btn-create-championship"
                      onClick={handleStartPresetSeason}
                      className="w-full py-2.5 rounded bg-red-600 hover:bg-red-500 text-xs font-display font-bold text-white cursor-pointer"
                    >
                      {activeChampionship ? 'Start New Season (Replaces Current)' : 'Create Championship Season'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-[#141a25] border border-white/10 rounded-lg p-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Season Name</label>
                      <input
                        type="text"
                        value={customSeasonName}
                        onChange={(e) => setCustomSeasonName(e.target.value)}
                        className="w-full bg-[#0d1118] border border-white/15 rounded px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Class</label>
                      <select
                        value={customClass}
                        onChange={(e) => {
                          const cls = e.target.value as CarClassId;
                          setCustomClass(cls);
                          const pool = getSuggestedCarsForClasses([cls]);
                          if (pool[0]) setChampCarId(pool[0].id);
                        }}
                        className="w-full bg-[#0d1118] border border-white/15 rounded px-2 py-1.5 text-xs text-white"
                      >
                        {Object.values(CAR_CLASSES).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Your Car</label>
                      <select
                        value={customCarPool.some((c) => c.id === champCarId) ? champCarId : customCarPool[0]?.id}
                        onChange={(e) => setChampCarId(e.target.value)}
                        className="w-full bg-[#0d1118] border border-white/15 rounded px-2 py-1.5 text-xs text-white"
                      >
                        {customCarPool.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Race Length</label>
                      <select
                        value={customDurationMins > 0 ? `t-${customDurationMins}` : `l-${customLaps}`}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v.startsWith('t-')) {
                            setCustomDurationMins(Number(v.slice(2)));
                          } else {
                            setCustomDurationMins(0);
                            setCustomLaps(Number(v.slice(2)));
                          }
                        }}
                        className="w-full bg-[#0d1118] border border-white/15 rounded px-2 py-1.5 text-xs text-white"
                      >
                        <option value="l-3">3 Laps</option>
                        <option value="l-5">5 Laps</option>
                        <option value="l-8">8 Laps</option>
                        <option value="t-5">5-Min Timed</option>
                        <option value="t-15">15-Min Endurance</option>
                      </select>
                    </div>
                  </div>

                  {/* Round Picker */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-300">
                        Calendar Rounds ({customTrackIds.length}/8)
                      </span>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={addTrackChoice}
                          onChange={(e) => setAddTrackChoice(e.target.value)}
                          className="bg-[#0d1118] border border-white/15 rounded px-2 py-1 text-xs text-white"
                        >
                          {TRACKS.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={customTrackIds.length >= 8}
                          onClick={() => setCustomTrackIds((prev) => [...prev, addTrackChoice])}
                          className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-xs font-bold text-white flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {customTrackIds.map((tid, idx) => {
                        const tr = getTrackById(tid);
                        return (
                          <div
                            key={`${tid}-${idx}`}
                            className="bg-[#0e131c] border border-white/10 rounded px-2.5 py-2 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="text-[10px] font-telemetry text-slate-400">R{idx + 1}</div>
                              <div className="font-semibold text-white truncate">{tr.shortName}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setCustomTrackIds((prev) => prev.filter((_, i) => i !== idx))
                              }
                              aria-label="Remove round"
                              className="p-1 text-slate-400 hover:text-red-400 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={customTrackIds.length < 2}
                    onClick={handleCreateCustomSeason}
                    className="w-full py-2.5 rounded bg-red-600 hover:bg-red-500 disabled:opacity-40 text-xs font-display font-bold text-white cursor-pointer"
                  >
                    Create Custom Season ({customTrackIds.length} Rounds)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ==================== 2. TIME TRIAL & DAILY HOTLAP ==================== */}
          {tab === 'timetrial' && (
            <div className="space-y-5">
              {/* Daily Hotlap Challenge Card */}
              <div className="bg-[#151c29] border border-sky-400/40 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-sky-300">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Daily Hotlap Challenge · {dailyChallenge.dateKey}</span>
                  </div>
                  <h3 className="text-lg font-display font-extrabold text-white">
                    {dailyTrack.name} · {dailyCar.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 text-xs font-telemetry text-slate-300">
                    <span className="text-amber-300">Bronze {formatLapTime(dailyChallenge.targets.bronze)}</span>
                    <span className="text-slate-200">Silver {formatLapTime(dailyChallenge.targets.silver)}</span>
                    <span className="text-yellow-300">Gold {formatLapTime(dailyChallenge.targets.gold)}</span>
                    <span className="text-fuchsia-300">Alien {formatLapTime(dailyChallenge.targets.alien)}</span>
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-2 pt-1">
                    <span>Your Best Today:</span>
                    <span className="font-telemetry text-emerald-400 font-bold">
                      {dailyBest ? formatLapTime(dailyBest.bestLapTime) : 'No lap yet'}
                    </span>
                    {dailyBest && <MedalBadge medal={dailyBest.medal} />}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyDailyCard}
                    className="px-3 py-2 rounded bg-[#1a2232] hover:bg-[#232e42] border border-white/15 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    {copiedDaily ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedDaily ? 'Copied Card' : 'Share Card'}</span>
                  </button>
                  <button
                    type="button"
                    data-testid="btn-launch-daily"
                    onClick={handleLaunchDaily}
                    className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 text-xs font-display font-bold text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Run Daily Hotlap</span>
                  </button>
                </div>
              </div>

              {/* Ghost Time Trial Launcher */}
              <div className="bg-[#141a25] border border-white/10 rounded-lg p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-display font-bold uppercase tracking-wider text-white">
                      3D Ghost Time Trial · {currentTrack.shortName} ({currentCar.name})
                    </h3>
                    <div className="text-[11px] font-telemetry text-slate-400 mt-0.5">
                      Bronze {formatLapTime(currentTtTargets.bronze)} · Silver {formatLapTime(currentTtTargets.silver)} · Gold {formatLapTime(currentTtTargets.gold)} · Alien {formatLapTime(currentTtTargets.alien)}
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid="btn-launch-timetrial"
                    onClick={handleLaunchTimeTrial}
                    className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-display font-bold text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Timer className="w-3.5 h-3.5" />
                    <span>Launch Time Trial</span>
                  </button>
                </div>

                <div>
                  <span className="text-[11px] text-slate-400 block mb-1.5">3D Translucent Ghost Opponent</span>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    {(
                      [
                        { id: 'personal-best', label: 'PB Ghost' },
                        { id: 'bronze', label: 'Bronze' },
                        { id: 'silver', label: 'Silver' },
                        { id: 'gold', label: 'Gold' },
                        { id: 'alien', label: 'Alien' },
                        { id: 'off', label: 'Ghost Off' },
                      ] as Array<{ id: GhostTargetMode; label: string }>
                    ).map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setTtGhostMode(g.id)}
                        className={`py-1.5 px-2 rounded text-[11px] font-semibold border cursor-pointer whitespace-nowrap ${
                          ttGhostMode === g.id
                            ? 'bg-emerald-600/25 border-emerald-400 text-emerald-200'
                            : 'bg-[#0e131c] border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Personal Records Matrix */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-display font-bold uppercase tracking-wider text-slate-200">
                    Personal Records Matrix ({personalRecords.length})
                  </h3>
                  <span className="text-[11px] text-slate-400">Auto-saved across all races &amp; hotlaps</span>
                </div>
                {personalRecords.length === 0 ? (
                  <div className="bg-[#141a25] border border-white/10 rounded-lg p-6 text-center text-xs text-slate-400">
                    Complete a clean timed lap in any mode to record your first Personal Best &amp; 3D Ghost.
                  </div>
                ) : (
                  <div className="bg-[#141a25] border border-white/10 rounded-lg overflow-x-auto">
                    <table className="w-full text-left text-xs min-w-[560px]">
                      <thead className="bg-[#0e131c] text-[10px] uppercase text-slate-400">
                        <tr>
                          <th className="py-2 px-3">Track</th>
                          <th className="py-2 px-3">Car</th>
                          <th className="py-2 px-3">Medal</th>
                          <th className="py-2 px-3 text-right">Best Lap</th>
                          <th className="py-2 px-3 text-right">S1 / S2 / S3</th>
                          <th className="py-2 px-3 text-right">Top Speed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {personalRecords.slice(0, 20).map((rec) => {
                          const tr = getTrackById(rec.trackId);
                          const car = getCarById(rec.carId);
                          return (
                            <tr key={`${rec.trackId}::${rec.carId}`} className="text-slate-200">
                              <td className="py-2 px-3 font-semibold">{tr.shortName}</td>
                              <td className="py-2 px-3 text-slate-300">{car.name}</td>
                              <td className="py-2 px-3">
                                <MedalBadge medal={rec.medal} />
                              </td>
                              <td className="py-2 px-3 text-right font-telemetry font-bold text-emerald-400">
                                {formatLapTime(rec.bestLapTime)}
                              </td>
                              <td className="py-2 px-3 text-right font-telemetry text-[11px] text-slate-400">
                                {rec.bestSectors
                                  .map((s) => (s != null ? `${s.toFixed(1)}s` : '--'))
                                  .join(' / ')}
                              </td>
                              <td className="py-2 px-3 text-right font-telemetry text-slate-300">
                                {rec.topSpeedKmh} km/h
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================== 3. SCENARIOS & LICENSES ==================== */}
          {tab === 'scenarios' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setChallengeFilter('scenarios')}
                  className={`px-3.5 py-2 rounded text-xs font-display font-bold border cursor-pointer whitespace-nowrap ${
                    challengeFilter === 'scenarios'
                      ? 'bg-red-600 border-red-400 text-white'
                      : 'bg-[#141a25] border-white/10 text-slate-300'
                  }`}
                >
                  Scripted Race Scenarios ({RACE_SCENARIOS.length})
                </button>
                <button
                  type="button"
                  onClick={() => setChallengeFilter('licenses')}
                  className={`px-3.5 py-2 rounded text-xs font-display font-bold border cursor-pointer whitespace-nowrap ${
                    challengeFilter === 'licenses'
                      ? 'bg-sky-600 border-sky-400 text-white'
                      : 'bg-[#141a25] border-white/10 text-slate-300'
                  }`}
                >
                  Driving School Licenses ({LICENSE_TESTS.length})
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(challengeFilter === 'scenarios' ? RACE_SCENARIOS : LICENSE_TESTS).map((spec) => {
                  const medal = challengeMedals[spec.id] ?? null;
                  return (
                    <div
                      key={spec.id}
                      className="bg-[#141a25] border border-white/10 rounded-lg p-4 flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-[#1d2536] border border-white/10 text-[10px] font-telemetry font-bold text-amber-300">
                            {spec.code}
                          </span>
                          <MedalBadge medal={medal} />
                        </div>
                        <h4 className="font-display font-bold text-sm text-white">{spec.title}</h4>
                        <div className="text-[11px] text-sky-300 font-medium">
                          {spec.subtitle} · {describeScenarioTrack(spec)}
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">{spec.briefing}</p>
                      </div>
                      <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-amber-200 truncate">
                          {spec.objectiveLabel}
                        </span>
                        <button
                          type="button"
                          data-testid={`btn-launch-${spec.id}`}
                          onClick={() => handleLaunchScenario(spec)}
                          className="px-3.5 py-1.5 rounded bg-red-600 hover:bg-red-500 text-xs font-display font-bold text-white flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <Play className="w-3 h-3" />
                          <span>Drive</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ==================== 4. ELIMINATION & ENDURANCE ==================== */}
          {tab === 'special' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Elimination / Knockout */}
              <div className="bg-[#141a25] border border-orange-500/35 rounded-lg p-5 space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-orange-400">
                    <Flame className="w-5 h-5" />
                    <h3 className="font-display font-extrabold text-base text-white">
                      Elimination Knockout
                    </h3>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Every countdown interval, the last-place car on track is eliminated until a single champion survives. Uses your currently selected car ({currentCar.name}) and circuit ({currentTrack.shortName}).
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[11px] text-slate-400 block mb-1">KO Interval</span>
                      <div className="grid grid-cols-3 gap-1">
                        {[20, 30, 45].map((sec) => (
                          <button
                            key={sec}
                            type="button"
                            onClick={() => setElimInterval(sec)}
                            className={`py-1.5 rounded text-xs font-telemetry font-bold border cursor-pointer ${
                              elimInterval === sec
                                ? 'bg-orange-600/30 border-orange-400 text-orange-200'
                                : 'bg-[#0e131c] border-white/10 text-slate-400'
                            }`}
                          >
                            {sec}s
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 block mb-1">Grid Size</span>
                      <div className="grid grid-cols-3 gap-1">
                        {[6, 10, 14].map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => setElimGridSize(sz)}
                            className={`py-1.5 rounded text-xs font-telemetry font-bold border cursor-pointer ${
                              elimGridSize === sz
                                ? 'bg-orange-600/30 border-orange-400 text-orange-200'
                                : 'bg-[#0e131c] border-white/10 text-slate-400'
                            }`}
                          >
                            {sz}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  data-testid="btn-launch-elimination"
                  onClick={handleLaunchElimination}
                  className="w-full py-2.5 rounded bg-orange-600 hover:bg-orange-500 text-xs font-display font-bold text-white flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Flame className="w-4 h-4" />
                  <span>Start Elimination ({elimGridSize} Cars · {elimInterval}s KO)</span>
                </button>
              </div>

              {/* Timed Endurance Races */}
              <div className="bg-[#141a25] border border-emerald-500/35 rounded-lg p-5 space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <Clock className="w-5 h-5" />
                    <h3 className="font-display font-extrabold text-base text-white">
                      Timed Endurance Race
                    </h3>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Clock-based WEC/IMSA endurance racing with autonomous AI weather &amp; on-track tyre strategy. When the clock hits 00:00, complete the final lap to the chequered flag.
                  </p>

                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1.5">Race Duration</span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[5, 15, 30, 60].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => setEnduranceMins(mins)}
                          className={`py-2 rounded text-xs font-telemetry font-bold border cursor-pointer ${
                            enduranceMins === mins
                              ? 'bg-emerald-600/30 border-emerald-400 text-emerald-200'
                              : 'bg-[#0e131c] border-white/10 text-slate-400'
                          }`}
                        >
                          {mins} min
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  data-testid="btn-launch-endurance"
                  onClick={handleLaunchEndurance}
                  className="w-full py-2.5 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-display font-bold text-white flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Clock className="w-4 h-4" />
                  <span>Start {enduranceMins}-Min Endurance at {currentTrack.shortName}</span>
                </button>
              </div>
            </div>
          )}

          {/* ==================== 5. COLLECTOR CAREER PROFILE ==================== */}
          {tab === 'collector' && (
            <div className="space-y-5">
              <div className="bg-[#151c29] border border-amber-400/35 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" />
                    <span>Optional Collector Progression · All {CARS.length} Cars Stay Free in Quick Race</span>
                  </div>
                  <h3 className="text-lg font-display font-extrabold text-white mt-0.5">
                    {collectorRank.title}
                  </h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-4 text-xs font-telemetry">
                    <span className="text-amber-300 font-bold">{career.credits.toLocaleString()} CR</span>
                    <span className="text-sky-300 font-bold">
                      {career.reputation} REP
                      {collectorRank.nextRep ? ` / ${collectorRank.nextRep}` : ' (MAX)'}
                    </span>
                    <span className="text-slate-300">{career.racesCompleted} Races</span>
                    <span className="text-emerald-300">{career.wins} Wins</span>
                    <span className="text-slate-300">{career.podiums} Podiums</span>
                    <span className="text-slate-300">{career.cleanLaps} Clean Laps</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const next = { ...career, enabled: !career.enabled };
                    saveCareerProfile(next);
                    setCareer(next);
                  }}
                  className={`px-3.5 py-2 rounded text-xs font-bold border cursor-pointer whitespace-nowrap ${
                    career.enabled
                      ? 'bg-emerald-600/25 border-emerald-400 text-emerald-200'
                      : 'bg-[#1a202c] border-white/15 text-slate-400'
                  }`}
                >
                  Career Rewards: {career.enabled ? 'ENABLED' : 'PAUSED'}
                </button>
              </div>

              {unlockFeedback && (
                <div className="px-3 py-2 rounded bg-amber-950/60 border border-amber-400/50 text-xs text-amber-200">
                  {unlockFeedback}
                </div>
              )}

              <div className="space-y-2.5">
                <h4 className="text-sm font-display font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Unlockable Heritage Collector Liveries</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {HERITAGE_UNLOCK_LIVERIES.map((liv) => {
                    const unlocked = career.unlockedLiveryIds.includes(liv.id);
                    return (
                      <div
                        key={liv.id}
                        className="bg-[#141a25] border border-white/10 rounded-lg p-4 flex flex-col justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-display font-bold text-sm text-white">{liv.name}</span>
                            {unlocked ? (
                              <span className="text-[10px] font-bold uppercase text-emerald-400">Unlocked</span>
                            ) : (
                              <span className="text-[11px] font-telemetry text-amber-300">
                                {liv.costCredits} CR · {liv.requiredRep} REP
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-1">{liv.description}</p>
                          <div className="mt-2.5 h-2 rounded-full overflow-hidden flex bg-black/40">
                            <div className="flex-1" style={{ backgroundColor: liv.liveryPatch.primaryColor }} />
                            <div className="w-1/4" style={{ backgroundColor: liv.liveryPatch.secondaryColor }} />
                            <div className="w-1/6" style={{ backgroundColor: liv.liveryPatch.tertiaryColor }} />
                          </div>
                        </div>

                        <div className="flex justify-end">
                          {unlocked ? (
                            <button
                              type="button"
                              onClick={() => {
                                onApplyHeritageLivery(liv.liveryPatch);
                                setUnlockFeedback(`Applied "${liv.name}" to ${currentCar.name}.`);
                              }}
                              className="px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer"
                            >
                              Apply to {currentCar.name}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                const res = unlockHeritageLivery(liv.id);
                                setCareer(res.profile);
                                setUnlockFeedback(
                                  res.success
                                    ? `Unlocked "${liv.name}"!`
                                    : res.reason ?? 'Cannot unlock yet.',
                                );
                              }}
                              className="px-3.5 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white cursor-pointer"
                            >
                              Unlock ({liv.costCredits} CR)
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
