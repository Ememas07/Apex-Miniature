import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CloudRain,
  Edit3,
  Flag,
  Gauge,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Shuffle,
  Sun,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  CAR_CLASSES,
  CARS,
  computeBoPEquilibriumScore,
  filterCars,
  getAllSelectableCars,
  getCarById,
  resolveCarSpecial,
  validateDriverNumber,
} from '../game/cars';
import {
  deleteCustomTrack,
  exportTrackToShareCode,
  getSavedCustomTracks,
  importTrackFromString,
} from '../game/customTracks';
import { generateRandomScenario } from '../game/randomScenario';
import { TRACKS, compileTrack, filterTracks, getTrackById } from '../game/tracks';
import {
  AIDifficulty,
  CarClassId,
  HeadlightTint,
  LiveryConfig,
  LiveryTemplate,
  NumberPlateStyle,
  RaceConfig,
  RimFinish,
  TireCompound,
  TrackRegion,
  TrackSpec,
} from '../game/types';
import { GarageAngle, GarageViewport } from '../three/GarageViewport';

interface RaceMenuModalProps {
  config: RaceConfig;
  customTracksNonce?: number;
  onUpdateConfig: (patch: Partial<RaceConfig>) => void;
  onSelectCar: (carId: string, resetLivery: LiveryConfig) => void;
  onChangeLivery: (livery: LiveryConfig) => void;
  onStartRace: (patch: Partial<RaceConfig>) => void;
  onOpenStudio?: (trackToEdit?: TrackSpec) => void;
  onClose: () => void;
}

type SelectorTab = 'car' | 'livery' | 'track';

const COLOR_SWATCHES = [
  '#dc2626', '#ea580c', '#facc15', '#84cc16', '#16a34a', '#065f46',
  '#06b6d4', '#2563eb', '#1e1b4b', '#7c3aed', '#ec4899', '#f8fafc',
  '#94a3b8', '#334155', '#111827',
];

const RIM_OPTIONS: Array<{ id: RimFinish; label: string; swatch: string }> = [
  { id: 'gloss-black', label: 'Gloss Black', swatch: '#14171c' },
  { id: 'silver', label: 'Silver Alloy', swatch: '#d4d8df' },
  { id: 'gold-bronze', label: 'Gold / Bronze', swatch: '#c89b3c' },
  { id: 'white', label: 'Motorsport White', swatch: '#f1f5f9' },
  { id: 'body-matched', label: 'Body-Matched', swatch: 'linear-gradient(135deg,#ef4444,#3b82f6)' },
];

const TEMPLATE_OPTIONS: Array<{ id: LiveryTemplate; label: string; desc: string }> = [
  { id: 'racing-stripes', label: 'Racing Stripes', desc: 'Twin center stripes & rocker trim' },
  { id: 'two-tone', label: 'Two-Tone Split', desc: 'Diagonal aero flank & contrast tail' },
  { id: 'geometric', label: 'Geometric Blocks', desc: 'Angular modern works chevrons' },
  { id: 'heritage', label: 'Heritage Stripes', desc: 'Classic triple endurance bands' },
];

const PLATE_OPTIONS: Array<{ id: NumberPlateStyle; label: string; color: string }> = [
  { id: 'auto', label: 'Auto by Class', color: '#475569' },
  { id: 'gtp-red', label: 'GTP Red', color: '#dc2626' },
  { id: 'lmp2-blue', label: 'LMP2 Blue', color: '#2563eb' },
  { id: 'gt3-green', label: 'GT3 Green', color: '#16a34a' },
  { id: 'gt4-cyan', label: 'GT4 Cyan', color: '#0284c7' },
  { id: 'gtd-amber', label: 'GTD Amber', color: '#f59e0b' },
  { id: 'formula-white', label: 'Formula White', color: '#f8fafc' },
];

const HEADLIGHT_OPTIONS: Array<{ id: HeadlightTint; label: string; hex: string }> = [
  { id: 'crystal-white', label: 'Crystal White', hex: '#f8fafc' },
  { id: 'endurance-yellow', label: 'Endurance Yellow', hex: '#facc15' },
  { id: 'ice-blue', label: 'Ice Blue (EV)', hex: '#38bdf8' },
];

const BANNER_PRESETS = ['APEX', 'GT', 'PROTO', 'PRO', 'AM', 'WEC', 'IMSA', 'F1'];

const REGION_FILTERS: Array<'Flagship' | TrackRegion | 'All'> = [
  'Flagship',
  'Americas',
  'Europe',
  'Asia-Pacific & Middle East',
  'Custom',
  'All',
];

function TrackOutlineSvg({ track }: { track: TrackSpec }) {
  const compiled = compileTrack(track, 90);
  const xs = compiled.samples.map((s) => s.x);
  const zs = compiled.samples.map((s) => s.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const span = Math.max(maxX - minX, maxZ - minZ, 1);

  const d =
    compiled.samples
      .map((s, i) => {
        const px = 12 + ((s.x - minX) / span) * 96;
        const py = 12 + ((s.z - minZ) / span) * 76;
        return `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
      })
      .join(' ') + ' Z';

  return (
    <svg viewBox="0 0 120 100" className="w-20 h-16 shrink-0" aria-hidden="true">
      <path d={d} fill="none" stroke="#334155" strokeWidth="6" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={track.kerbPrimary} strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

export function RaceMenuModal({
  config,
  customTracksNonce,
  onUpdateConfig,
  onSelectCar,
  onChangeLivery,
  onStartRace,
  onOpenStudio,
  onClose,
}: RaceMenuModalProps) {
  const activeCar = useMemo(() => getCarById(config.playerCarId), [config.playerCarId]);
  const classMeta = CAR_CLASSES[activeCar.classId];
  const selectedTrack = config.customTrack || getTrackById(config.trackId);

  const [tab, setTab] = useState<SelectorTab>('track');
  const [angle, setAngle] = useState<GarageAngle>('hero');

  // Car filter state
  const [activeClass, setActiveClass] = useState<CarClassId | 'ALL'>(activeCar.classId);
  const [carSearch, setCarSearch] = useState('');

  // Track filter state
  const [regionFilter, setRegionFilter] = useState<'Flagship' | TrackRegion | 'All'>('All');
  const [trackSearch, setTrackSearch] = useState('');
  const [customTracks, setCustomTracks] = useState<TrackSpec[]>(() => getSavedCustomTracks());
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importCodeInput, setImportCodeInput] = useState('');
  const [importErr, setImportErr] = useState<string | null>(null);
  const [copiedTrackId, setCopiedTrackId] = useState<string | null>(null);

  const refreshCustomTracks = () => {
    setCustomTracks(getSavedCustomTracks());
  };

  useEffect(() => {
    refreshCustomTracks();
  }, [customTracksNonce]);

  const allSelectableCars = useMemo(() => getAllSelectableCars(), []);
  const trimmedCarSearch = carSearch.trim();
  const effectiveClassFilter: CarClassId | 'ALL' =
    trimmedCarSearch.length > 0 && activeClass !== 'ALL' ? 'ALL' : activeClass;
  const filteredCars = filterCars(allSelectableCars, carSearch, effectiveClassFilter);
  const filteredTracks = useMemo(
    () => filterTracks(TRACKS, customTracks, regionFilter, trackSearch),
    [customTracks, regionFilter, trackSearch],
  );

  const aiCount = config.noAi || config.sessionMode === 'practice' ? 0 : Math.max(0, Math.min(23, config.aiBotCount ?? 11));
  const isSolo = aiCount === 0;
  const bopScore = computeBoPEquilibriumScore(activeCar.attributes).toFixed(1);

  const setAiOpponents = (nextCount: number) => {
    const clamped = Math.max(0, Math.min(23, Math.round(nextCount)));
    if (clamped === 0) {
      onUpdateConfig({
        aiBotCount: 0,
        noAi: true,
        gridSize: 1,
        sessionMode: 'practice',
        qualifyingEnabled: false,
      });
    } else {
      onUpdateConfig({
        aiBotCount: clamped,
        noAi: false,
        gridSize: clamped + 1,
        sessionMode: 'race',
        totalLaps: config.totalLaps > 0 ? config.totalLaps : 5,
      });
    }
  };

  const toggleClass = (cid: CarClassId) => {
    const exists = config.activeClasses.includes(cid);
    if (exists && config.activeClasses.length === 1) return;
    if (exists) {
      onUpdateConfig({ activeClasses: config.activeClasses.filter((c) => c !== cid) });
    } else {
      onUpdateConfig({ activeClasses: [...config.activeClasses, cid].slice(-3) });
    }
  };

  const updateLivery = (patch: Partial<LiveryConfig>) => {
    onChangeLivery({ ...config.playerLivery, ...patch });
  };

  const handleRandomScenario = () => {
    const scenario = generateRandomScenario(
      TRACKS,
      customTracks,
      allSelectableCars,
      config.playerLivery.driverNumber,
    );
    onSelectCar(scenario.car.id, scenario.livery);
    onUpdateConfig({
      activeClasses: scenario.activeClasses,
      trackId: scenario.track.id,
      customTrack: scenario.isCustomTrack ? scenario.track : undefined,
    });
    setActiveClass(scenario.car.classId);
    setCarSearch('');
    setTrackSearch('');
    setRegionFilter('All');
  };

  const handleLaunch = () => {
    if (isSolo) {
      onStartRace({
        sessionMode: 'practice',
        trackId: config.trackId,
        customTrack: config.customTrack,
        totalLaps: config.totalLaps,
        weather: config.weather,
        startingCompound: config.startingCompound,
        qualifyingEnabled: false,
        noAi: true,
        aiBotCount: 0,
        gridSize: 1,
      });
      return;
    }

    onStartRace({
      sessionMode: 'race',
      trackId: config.trackId,
      customTrack: config.customTrack,
      activeClasses: config.activeClasses,
      totalLaps: config.totalLaps > 0 ? config.totalLaps : 5,
      aiBotCount: aiCount,
      gridSize: aiCount + 1,
      noAi: false,
      aiDifficulty: config.aiDifficulty,
      qualifyingEnabled: config.qualifyingEnabled,
      weather: config.weather,
      startingCompound: config.startingCompound,
    });
  };

  return (
    <div
      data-testid="race-menu-modal"
      role="dialog"
      aria-label="Race Setup"
      className="fixed inset-0 z-30 bg-[#0b0e13]/95 flex flex-col overflow-hidden"
    >
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 md:px-7 py-3.5 bg-[#0d1118] border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-2 rounded bg-[#161b24] hover:bg-[#1e2634] border border-white/10 text-xs font-semibold text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Menu
          </button>
          <div className="min-w-0">
            <h2 className="text-base md:text-lg font-display font-bold text-white tracking-wide whitespace-nowrap">
              RACE SETUP
            </h2>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 truncate">
              <span className="text-slate-200 font-medium">{activeCar.name}</span>
              <span aria-hidden="true">·</span>
              <span>{selectedTrack.name}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {isSolo ? 'Solo Practice' : `${aiCount} AI Opponents`}
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {isSolo && config.totalLaps <= 0 ? 'Continuous' : `${config.totalLaps} Laps`}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            data-testid="btn-random-scenario"
            onClick={handleRandomScenario}
            title="Prepare a random track, class mix, and car without starting"
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-md bg-[#161b24] hover:bg-[#1f2736] border border-white/15 text-xs font-display font-bold text-slate-100 tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Shuffle className="w-3.5 h-3.5 text-amber-400" />
            Random
          </button>
          <button
            type="button"
            data-testid="btn-start-race"
            data-start="true"
            onClick={handleLaunch}
            className="flex items-center gap-2 px-6 py-2.5 rounded-md bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-display font-bold text-sm tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-lg shadow-red-950/50"
          >
            <Flag className="w-4 h-4" />
            {isSolo ? 'Start Practice' : config.qualifyingEnabled ? 'Start Qualifying' : 'Start Race'}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Race Setup"
            className="p-2 rounded bg-[#161b24] hover:bg-[#202836] border border-white/10 text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content: 2-Column Unified Layout */}
      <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-12 overflow-y-auto lg:overflow-hidden">
        {/* LEFT COLUMN: 3D Preview + AI Opponents & Race Settings */}
        <div className="lg:col-span-5 flex flex-col min-h-0 shrink-0 lg:shrink border-b lg:border-b-0 lg:border-r border-white/10 bg-[#0e121a] lg:overflow-y-auto custom-scroll">
          {/* Live 3D Die-Cast Turntable */}
          <div className="relative h-56 sm:h-64 lg:h-64 xl:h-72 min-h-0 shrink-0 overflow-hidden bg-[#101520] border-b border-white/10">
            <GarageViewport carSpec={activeCar} livery={config.playerLivery} angle={angle} />

            {/* Car Identity Overlay */}
            <div className="absolute top-3.5 left-4 right-4 pointer-events-none">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span
                  className="px-1.5 py-0.5 text-[10px] font-display font-bold rounded-sm"
                  style={{ backgroundColor: classMeta.plateColor, color: classMeta.badgeTextColor }}
                >
                  {classMeta.shortName}
                </span>
                <span>{activeCar.manufacturer}</span>
                <span aria-hidden="true" className="text-slate-500">·</span>
                <span className="font-telemetry text-slate-200">#{config.playerLivery.driverNumber}</span>
                <span aria-hidden="true" className="text-slate-500">·</span>
                <span className="tabular-nums text-slate-400">BoP {bopScore}</span>
              </div>
              <h3 className="mt-1 text-xl font-display font-extrabold text-white tracking-tight truncate">
                {activeCar.name}
              </h3>
            </div>

            {/* Camera Angle Controls */}
            <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between gap-2 pointer-events-none">
              <div className="flex items-center gap-1 p-1 rounded bg-[#0c1017]/90 border border-white/10 pointer-events-auto">
                {(['hero', 'front', 'side', 'rear'] as GarageAngle[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAngle(a)}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
                      angle === a
                        ? 'bg-red-600 text-white'
                        : 'text-slate-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {a === 'hero' ? '3/4' : a.charAt(0).toUpperCase() + a.slice(1)}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-slate-400 bg-[#0c1017]/85 px-2.5 py-1 rounded border border-white/10">
                Drag to rotate
              </span>
            </div>
          </div>

          {/* Session & AI Opponents Configuration */}
          <div className="p-5 space-y-5 flex-1">
            {/* AI Opponents Stepper & Slider (0 = Solo Practice, 1-23 = Race) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isSolo ? (
                    <Gauge className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Users className="w-4 h-4 text-red-400" />
                  )}
                  <label htmlFor="race-ai-slider" className="text-xs font-display font-bold text-white uppercase tracking-wider">
                    AI Opponents
                  </label>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="btn-ai-minus"
                    onClick={() => setAiOpponents(aiCount - 1)}
                    disabled={aiCount <= 0}
                    aria-label="Decrease AI opponents"
                    className="w-7 h-7 rounded bg-[#161c28] hover:bg-[#20293a] disabled:opacity-35 border border-white/10 flex items-center justify-center text-slate-200 cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span
                    data-testid="ai-opponents-count"
                    className="w-12 text-center font-telemetry text-sm font-bold text-white tabular-nums"
                  >
                    {aiCount}
                  </span>
                  <button
                    type="button"
                    data-testid="btn-ai-plus"
                    onClick={() => setAiOpponents(aiCount + 1)}
                    disabled={aiCount >= 23}
                    aria-label="Increase AI opponents"
                    className="w-7 h-7 rounded bg-[#161c28] hover:bg-[#20293a] disabled:opacity-35 border border-white/10 flex items-center justify-center text-slate-200 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <input
                id="race-ai-slider"
                data-testid="slider-ai-opponents"
                type="range"
                min={0}
                max={23}
                value={aiCount}
                onChange={(e) => setAiOpponents(Number(e.target.value))}
                className="w-full accent-red-600 cursor-pointer"
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {[
                    { label: 'Solo (0)', val: 0 },
                    { label: '5 AI', val: 5 },
                    { label: '11 AI', val: 11 },
                    { label: '19 AI', val: 19 },
                    { label: '23 AI', val: 23 },
                  ].map((preset) => (
                    <button
                      key={preset.val}
                      type="button"
                      onClick={() => setAiOpponents(preset.val)}
                      className={`px-2 py-1 rounded text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                        aiCount === preset.val
                          ? preset.val === 0
                            ? 'bg-emerald-600/25 border-emerald-400 text-emerald-200'
                            : 'bg-red-600/25 border-red-400 text-white'
                          : 'bg-[#141923] border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-slate-400 tabular-nums">
                  {isSolo ? 'Solo Practice / Hotlap' : `${aiCount + 1}-Car Grid`}
                </span>
              </div>
            </div>

            <div className="border-t border-white/10 pt-4 space-y-4">
              {/* Session Length */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-2">
                  {isSolo ? 'Practice Length' : 'Race Laps'}
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(isSolo
                    ? [
                        { label: 'Open', val: 0 },
                        { label: '5', val: 5 },
                        { label: '10', val: 10 },
                        { label: '15', val: 15 },
                        { label: '20', val: 20 },
                      ]
                    : [
                        { label: '3', val: 3 },
                        { label: '5', val: 5 },
                        { label: '10', val: 10 },
                        { label: '15', val: 15 },
                        { label: '20', val: 20 },
                      ]
                  ).map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => onUpdateConfig({ totalLaps: opt.val })}
                      className={`py-1.5 rounded text-xs font-telemetry font-bold border transition-colors cursor-pointer ${
                        config.totalLaps === opt.val
                          ? isSolo
                            ? 'bg-emerald-600/25 border-emerald-400 text-emerald-200'
                            : 'bg-red-600 border-red-400 text-white'
                          : 'bg-[#141923] border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* AI-specific Race Options (shown when AI >= 1) */}
              {!isSolo && (
                <>
                  {/* AI Difficulty */}
                  <div>
                    <div className="text-xs font-semibold text-slate-300 mb-1.5">AI Difficulty</div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['Rookie', 'Amateur', 'Pro', 'Alien'] as AIDifficulty[]).map((diff) => (
                        <button
                          key={diff}
                          type="button"
                          onClick={() => onUpdateConfig({ aiDifficulty: diff })}
                          className={`py-1.5 rounded text-xs font-semibold border transition-colors cursor-pointer ${
                            config.aiDifficulty === diff
                              ? 'bg-[#1f2838] border-red-500 text-white'
                              : 'bg-[#141923] border-white/10 text-slate-400 hover:text-white'
                          }`}
                        >
                          {diff}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Multi-Class Opponent Pool */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold text-slate-300">Grid Classes (up to 3)</span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateConfig({
                            activeClasses: [CarClassId.HYPERCAR_GTP, CarClassId.LMP2, CarClassId.GT3],
                          })
                        }
                        className="text-[11px] text-amber-300 hover:text-amber-200 font-medium cursor-pointer"
                      >
                        WEC / IMSA Preset
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.values(CAR_CLASSES).map((cls) => {
                        const active = config.activeClasses.includes(cls.id);
                        return (
                          <button
                            key={cls.id}
                            type="button"
                            onClick={() => toggleClass(cls.id)}
                            className={`px-2 py-1 rounded text-[11px] font-display font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                              active
                                ? 'border-white/60'
                                : 'bg-[#141923] border-white/10 text-slate-500 hover:text-slate-300'
                            }`}
                            style={
                              active
                                ? { backgroundColor: cls.plateColor, color: cls.badgeTextColor }
                                : undefined
                            }
                          >
                            {cls.shortName}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* Weather & Qualifying Row */}
              <div className={`grid gap-2 ${isSolo ? 'grid-cols-2' : 'grid-cols-2'}`}>
                <button
                  type="button"
                  data-testid="btn-weather-toggle"
                  onClick={() =>
                    onUpdateConfig({
                      weather: config.weather === 'dynamic-rain' ? 'dry' : 'dynamic-rain',
                    })
                  }
                  className="flex items-center justify-center gap-2 py-2 px-3 rounded border border-white/15 bg-[#141923] hover:bg-[#1b2230] text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap"
                >
                  {config.weather === 'dynamic-rain' ? (
                    <>
                      <CloudRain className="w-3.5 h-3.5 text-sky-400" />
                      Dynamic Rain
                    </>
                  ) : (
                    <>
                      <Sun className="w-3.5 h-3.5 text-amber-400" />
                      Dry Clear
                    </>
                  )}
                </button>

                {!isSolo ? (
                  <button
                    type="button"
                    onClick={() => onUpdateConfig({ qualifyingEnabled: !config.qualifyingEnabled })}
                    className={`py-2 px-3 rounded border text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                      config.qualifyingEnabled
                        ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                        : 'bg-[#141923] border-white/15 text-slate-300 hover:text-white'
                    }`}
                  >
                    1-Lap Quali: {config.qualifyingEnabled ? 'ON' : 'OFF'}
                  </button>
                ) : (
                  <div className="flex items-center justify-center px-3 py-2 rounded border border-white/10 bg-[#121620] text-xs text-emerald-300 font-medium whitespace-nowrap">
                    Rolling Hotlap Start
                  </div>
                )}
              </div>

              {/* Starting Tire Compound */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Starting Tires
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['soft', 'medium', 'hard', 'wet'] as TireCompound[]).map((cmp) => (
                    <button
                      key={cmp}
                      type="button"
                      onClick={() => onUpdateConfig({ startingCompound: cmp })}
                      className={`py-1.5 rounded text-[11px] font-bold uppercase border cursor-pointer transition-colors ${
                        config.startingCompound === cmp
                          ? 'bg-red-600 border-red-400 text-white'
                          : 'bg-[#141923] border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {cmp}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Unified Selector Tabs (Car, Livery, Track) */}
        <div className="lg:col-span-7 flex flex-col min-h-0 shrink-0 lg:shrink bg-[#11151d]">
          {/* Section Switcher */}
          <div className="flex items-center justify-between gap-2 px-5 pt-3 bg-[#0d1118] border-b border-white/10 shrink-0">
            <div className="flex items-center gap-1">
              {[
                { id: 'track' as SelectorTab, label: `Track (${TRACKS.length})` },
                { id: 'car' as SelectorTab, label: `Car (${CARS.length})` },
                { id: 'livery' as SelectorTab, label: 'Livery & Number' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  data-testid={`race-tab-${t.id}`}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                    tab === t.id
                      ? 'border-red-500 text-white'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'livery' && (
              <button
                type="button"
                onClick={() => onChangeLivery({ ...activeCar.defaultLivery })}
                className="flex items-center gap-1.5 px-2.5 py-1 mb-1.5 rounded bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-300 hover:text-white cursor-pointer whitespace-nowrap"
                title="Reset to factory livery"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Factory Reset
              </button>
            )}
          </div>

          {/* Active Selector Content */}
          <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-5 space-y-5">
            {tab === 'car' && (
              <>
                {/* Car Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="race-car-search"
                    type="text"
                    value={carSearch}
                    onChange={(e) => setCarSearch(e.target.value)}
                    placeholder={`Search ${allSelectableCars.length} cars by model, brand, or class...`}
                    aria-label="Search car models"
                    className="w-full pl-8 pr-8 py-2 rounded bg-[#0c1017] border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500"
                  />
                  {carSearch.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCarSearch('')}
                      aria-label="Clear car search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Class Filters */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveClass('ALL')}
                    className={`px-2.5 py-1.5 rounded text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                      effectiveClassFilter === 'ALL'
                        ? 'bg-[#1d2433] border-red-500 text-white'
                        : 'bg-[#151a24] border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    All ({CARS.length})
                  </button>
                  {Object.values(CAR_CLASSES).map((cls) => (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => {
                        setActiveClass(cls.id);
                        setCarSearch('');
                      }}
                      className={`px-2.5 py-1.5 rounded text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                        effectiveClassFilter === cls.id
                          ? 'bg-[#1d2433] border-red-500 text-white'
                          : 'bg-[#151a24] border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {cls.shortName}
                    </button>
                  ))}
                </div>

                {/* Car List */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-300">
                      {effectiveClassFilter === 'ALL'
                        ? trimmedCarSearch
                          ? 'Search Results'
                          : 'All Motorsport Classes'
                        : CAR_CLASSES[effectiveClassFilter].name}
                    </span>
                    <span className="text-xs text-slate-400 tabular-nums">
                      {filteredCars.length} of {CARS.length}
                    </span>
                  </div>

                  {filteredCars.length === 0 ? (
                    <div className="p-6 rounded border border-dashed border-white/15 bg-[#0e131c] text-center space-y-2">
                      <p className="text-xs text-slate-300">No cars match &ldquo;{carSearch}&rdquo;.</p>
                      <button
                        type="button"
                        onClick={() => setCarSearch('')}
                        className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-xs font-semibold text-white cursor-pointer"
                      >
                        Clear search
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto custom-scroll pr-1">
                      {filteredCars.map((c) => {
                        const selected = c.id === activeCar.id;
                        const cMeta = CAR_CLASSES[c.classId];
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => onSelectCar(c.id, { ...c.defaultLivery })}
                            className={`flex items-center justify-between px-3 py-2.5 rounded border text-left transition-colors cursor-pointer ${
                              selected
                                ? 'bg-[#1c2434] border-red-500 text-white'
                                : 'bg-[#151a23] border-white/5 text-slate-300 hover:bg-[#19202b]'
                            }`}
                          >
                            <div className="min-w-0 pr-2.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold truncate">{c.name}</span>
                                {effectiveClassFilter === 'ALL' && (
                                  <span
                                    className="px-1 py-0.5 text-[9px] font-bold rounded-sm shrink-0"
                                    style={{ backgroundColor: cMeta.plateColor, color: cMeta.badgeTextColor }}
                                  >
                                    {cMeta.shortName}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 truncate mt-0.5">{c.tradeoffNote}</div>
                            </div>
                            <span
                              className="w-3.5 h-3.5 rounded-sm shrink-0 border border-white/20"
                              style={{ backgroundColor: c.defaultLivery.primaryColor }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Selected Car BoP Profile */}
                <div className="pt-4 border-t border-white/10 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-200">
                      {activeCar.name} Performance Profile
                    </span>
                    <span className="text-slate-400">
                      Special: {resolveCarSpecial(activeCar).specialLabel}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                    {[
                      { label: 'Top Speed', val: activeCar.attributes.topSpeed, color: '#ef4444' },
                      { label: 'Acceleration', val: activeCar.attributes.acceleration, color: '#f97316' },
                      { label: 'Cornering Grip', val: activeCar.attributes.corneringGrip, color: '#22c55e' },
                      { label: 'Braking', val: activeCar.attributes.braking, color: '#38bdf8' },
                      { label: 'Efficiency', val: activeCar.attributes.efficiency, color: '#eab308' },
                    ].map((stat) => (
                      <div key={stat.label} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-400">{stat.label}</span>
                          <span className="font-telemetry text-white">{stat.val}</span>
                        </div>
                        <div className="h-1.5 rounded bg-[#0c1017] overflow-hidden">
                          <div
                            className="h-full rounded transition-all duration-200"
                            style={{ width: `${stat.val}%`, backgroundColor: stat.color }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {tab === 'livery' && (
              <div className="space-y-5">
                {/* Team & Factory Livery Presets */}
                {activeCar.liveries && activeCar.liveries.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200">
                        Team & Factory Liveries ({activeCar.liveries.length})
                      </span>
                      <span className="text-[11px] text-slate-400">Instant preset</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto custom-scroll pr-1">
                      {activeCar.liveries.map((preset) => {
                        const isCurrent =
                          config.playerLivery.primaryColor.toLowerCase() === preset.livery.primaryColor.toLowerCase() &&
                          config.playerLivery.secondaryColor.toLowerCase() === preset.livery.secondaryColor.toLowerCase() &&
                          config.playerLivery.driverNumber === preset.livery.driverNumber;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => onChangeLivery({ ...preset.livery })}
                            className={`flex items-center gap-2 p-2 rounded border text-left transition-colors cursor-pointer ${
                              isCurrent
                                ? 'bg-[#1e293b] border-red-500 text-white'
                                : 'bg-[#151a23] border-white/10 text-slate-300 hover:bg-[#1a2230] hover:text-white'
                            }`}
                          >
                            <div className="flex -space-x-1 shrink-0">
                              <span
                                className="w-3.5 h-3.5 rounded-full border border-black/40"
                                style={{ backgroundColor: preset.livery.primaryColor }}
                              />
                              <span
                                className="w-3.5 h-3.5 rounded-full border border-black/40"
                                style={{ backgroundColor: preset.livery.secondaryColor }}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold truncate">{preset.name}</div>
                              <div className="text-[10px] text-slate-400 font-telemetry">
                                #{preset.livery.driverNumber}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Livery Template */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">Livery Template</label>
                  <div className="grid grid-cols-2 gap-2">
                    {TEMPLATE_OPTIONS.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => updateLivery({ template: tpl.id })}
                        className={`p-2.5 rounded border text-left transition-colors cursor-pointer ${
                          config.playerLivery.template === tpl.id
                            ? 'bg-[#1d2534] border-red-500 text-white'
                            : 'bg-[#151a23] border-white/10 text-slate-300 hover:bg-[#1a202b]'
                        }`}
                      >
                        <div className="text-xs font-semibold">{tpl.label}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{tpl.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3-Channel Paint Pickers */}
                <div className="space-y-3.5">
                  {(
                    [
                      { key: 'primaryColor', label: 'Primary Body Color' },
                      { key: 'secondaryColor', label: 'Secondary Accent Color' },
                      { key: 'tertiaryColor', label: 'Tertiary Trim Color' },
                    ] as const
                  ).map(({ key, label }) => (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor={`race-color-${key}`} className="text-xs font-semibold text-slate-300">
                          {label}
                        </label>
                        <div className="flex items-center gap-2">
                          <span className="font-telemetry text-[11px] text-slate-400 uppercase">
                            {config.playerLivery[key]}
                          </span>
                          <input
                            id={`race-color-${key}`}
                            type="color"
                            value={config.playerLivery[key]}
                            onChange={(e) => updateLivery({ [key]: e.target.value })}
                            className="w-6 h-6 rounded border border-white/20 bg-transparent cursor-pointer"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {COLOR_SWATCHES.map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            aria-label={`Select ${label} ${hex}`}
                            onClick={() => updateLivery({ [key]: hex })}
                            className={`w-6 h-6 rounded-sm border cursor-pointer transition-transform ${
                              config.playerLivery[key].toLowerCase() === hex.toLowerCase()
                                ? 'border-white scale-110 ring-2 ring-red-500'
                                : 'border-white/20 hover:scale-105'
                            }`}
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Driver Number & Banner */}
                <div className="pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="race-driver-number" className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Racing Number (1–3 Digits)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="race-driver-number"
                        type="text"
                        inputMode="numeric"
                        maxLength={3}
                        value={config.playerLivery.driverNumber}
                        onChange={(e) =>
                          updateLivery({ driverNumber: e.target.value.replace(/[^0-9]/g, '').slice(0, 3) })
                        }
                        onBlur={() =>
                          updateLivery({ driverNumber: validateDriverNumber(config.playerLivery.driverNumber) })
                        }
                        className="w-24 px-3 py-1.5 rounded bg-[#0c1017] border border-white/20 text-white font-display font-bold text-lg tracking-wider text-center focus:outline-none focus:border-red-500"
                      />
                      <div className="flex flex-wrap gap-1">
                        {['1', '16', '51', '007', '911'].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => updateLivery({ driverNumber: preset })}
                            className="px-2 py-1 rounded bg-[#161b24] hover:bg-[#1e2532] border border-white/10 text-[11px] font-telemetry text-slate-200 cursor-pointer"
                          >
                            #{preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="race-windshield-banner" className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Windshield Banner
                    </label>
                    <input
                      id="race-windshield-banner"
                      type="text"
                      maxLength={10}
                      value={config.playerLivery.windshieldBanner}
                      onChange={(e) =>
                        updateLivery({ windshieldBanner: e.target.value.toUpperCase().slice(0, 10) })
                      }
                      className="w-full px-3 py-1.5 rounded bg-[#0c1017] border border-white/20 text-white font-display font-bold tracking-widest uppercase text-xs focus:outline-none focus:border-red-500"
                    />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {BANNER_PRESETS.map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => updateLivery({ windshieldBanner: b })}
                          className="px-2 py-0.5 rounded bg-[#161b24] hover:bg-[#1e2532] border border-white/10 text-[10px] font-display font-bold text-slate-300 cursor-pointer"
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Wheels, Carbon, Plate & Headlights */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Wheel Rim Finish</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {RIM_OPTIONS.map((rim) => (
                        <button
                          key={rim.id}
                          type="button"
                          onClick={() => updateLivery({ rimFinish: rim.id })}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded border text-xs font-medium cursor-pointer transition-colors ${
                            config.playerLivery.rimFinish === rim.id
                              ? 'bg-[#1d2534] border-red-500 text-white'
                              : 'bg-[#151a23] border-white/10 text-slate-300 hover:bg-[#1a202b]'
                          }`}
                        >
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-white/30 shrink-0"
                            style={{ background: rim.swatch }}
                          />
                          <span className="truncate">{rim.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Headlight Tint</label>
                    <div className="space-y-1.5">
                      {HEADLIGHT_OPTIONS.map((hl) => (
                        <button
                          key={hl.id}
                          type="button"
                          onClick={() => updateLivery({ headlightTint: hl.id })}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded border text-xs font-medium cursor-pointer transition-colors ${
                            config.playerLivery.headlightTint === hl.id
                              ? 'bg-[#1d2534] border-red-500 text-white'
                              : 'bg-[#151a23] border-white/10 text-slate-300 hover:bg-[#1a202b]'
                          }`}
                        >
                          <span
                            className="w-3 h-3 rounded-full border border-white/30 shrink-0"
                            style={{ backgroundColor: hl.hex }}
                          />
                          <span>{hl.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Carbon Fiber & Plate Backing */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Exposed Carbon Fiber</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { key: 'carbonHood' as const, label: 'Hood' },
                        { key: 'carbonWing' as const, label: 'Wing' },
                        { key: 'carbonSplitter' as const, label: 'Splitter' },
                      ].map((item) => {
                        const active = config.playerLivery[item.key];
                        return (
                          <button
                            key={item.key}
                            type="button"
                            aria-pressed={active}
                            onClick={() => updateLivery({ [item.key]: !active })}
                            className={`px-2 py-1.5 rounded border text-xs font-semibold cursor-pointer transition-colors ${
                              active
                                ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200'
                                : 'bg-[#151a23] border-white/10 text-slate-400 hover:text-white'
                            }`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Number Plate Backing</label>
                    <div className="flex flex-wrap gap-1.5">
                      {PLATE_OPTIONS.map((pl) => (
                        <button
                          key={pl.id}
                          type="button"
                          onClick={() => updateLivery({ numberPlateStyle: pl.id })}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] font-semibold cursor-pointer transition-colors ${
                            config.playerLivery.numberPlateStyle === pl.id
                              ? 'bg-[#1d2534] border-red-500 text-white'
                              : 'bg-[#151a23] border-white/10 text-slate-300 hover:bg-[#1a202b]'
                          }`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-sm border border-white/25 shrink-0"
                            style={{ backgroundColor: pl.color }}
                          />
                          <span>{pl.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === 'track' && (
              <div className="space-y-4">
                {/* Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="race-track-search"
                    type="text"
                    value={trackSearch}
                    onChange={(e) => setTrackSearch(e.target.value)}
                    placeholder="Search circuits by name, country, series (F1, WEC, IMSA), or direction..."
                    aria-label="Search circuits"
                    className="w-full pl-8 pr-8 py-2 rounded bg-[#0c1017] border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500"
                  />
                  {trackSearch.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setTrackSearch('')}
                      aria-label="Clear circuit search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Region Filters & Custom Track Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {REGION_FILTERS.map((rf) => {
                      const count = rf === 'Custom' ? customTracks.length : rf === 'All' ? TRACKS.length : undefined;
                      return (
                        <button
                          key={rf}
                          type="button"
                          onClick={() => {
                            setRegionFilter(rf);
                            if (rf === 'Custom') refreshCustomTracks();
                          }}
                          className={`px-2.5 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                            regionFilter === rf
                              ? 'bg-red-600 text-white'
                              : 'bg-[#171c26] text-slate-300 hover:bg-[#1f2634]'
                          }`}
                        >
                          {rf === 'Flagship' ? 'Flagship 10' : rf === 'Custom' ? `Custom CAD (${count})` : count !== undefined ? `${rf} (${count})` : rf}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2">
                    {regionFilter === 'Custom' && onOpenStudio && (
                      <button
                        type="button"
                        data-testid="btn-new-custom-track"
                        onClick={() => onOpenStudio()}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        New in Studio
                      </button>
                    )}
                    {regionFilter === 'Custom' && (
                      <button
                        type="button"
                        data-testid="btn-import-custom-track"
                        onClick={() => {
                          setImportErr(null);
                          setImportCodeInput('');
                          setImportModalOpen(true);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#202737] hover:bg-[#283247] border border-white/10 text-slate-200 text-xs font-medium cursor-pointer whitespace-nowrap"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Import
                      </button>
                    )}
                    <span className="text-xs text-slate-400 tabular-nums whitespace-nowrap">
                      {filteredTracks.length} circuits
                    </span>
                  </div>
                </div>

                {/* Circuit Grid */}
                {regionFilter === 'Custom' ? (
                  customTracks.length === 0 ? (
                    <div className="p-8 border border-dashed border-white/15 rounded-lg text-center space-y-3 bg-[#131822]/60">
                      <div className="text-sm font-semibold text-white">No Custom Circuits Saved Yet</div>
                      <p className="text-xs text-slate-400 max-w-md mx-auto">
                        Design custom circuits in Track Studio or import a share code to race them here.
                      </p>
                      {onOpenStudio && (
                        <button
                          type="button"
                          onClick={() => onOpenStudio()}
                          className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-display font-bold cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <Plus className="w-4 h-4" />
                          Open Track Studio
                        </button>
                      )}
                    </div>
                  ) : filteredTracks.length === 0 ? (
                    <div className="p-6 border border-dashed border-white/15 rounded-lg text-center space-y-2 bg-[#131822]/60">
                      <div className="text-xs text-slate-300">No custom tracks match &ldquo;{trackSearch}&rdquo;.</div>
                      <button
                        type="button"
                        onClick={() => setTrackSearch('')}
                        className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-semibold cursor-pointer"
                      >
                        Clear search
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {filteredTracks.map((trk) => {
                        const active = trk.id === config.trackId;
                        return (
                          <div
                            key={trk.id}
                            className={`flex flex-col justify-between p-3 rounded-md border transition-colors ${
                              active
                                ? 'bg-[#1c2331] border-sky-400 text-white'
                                : 'bg-[#151a23] border-white/10 text-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2.5">
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-semibold truncate text-white">{trk.name}</div>
                                <div className="mt-0.5 text-[11px] text-slate-400">
                                  {trk.scenery} · {trk.corners} turns · ~{trk.targetLapSeconds}s
                                </div>
                              </div>
                              <TrackOutlineSvg track={trk} />
                            </div>
                            <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-white/10 text-xs">
                              <button
                                type="button"
                                onClick={() => onUpdateConfig({ trackId: trk.id, customTrack: trk })}
                                className={`px-3 py-1 rounded font-semibold cursor-pointer ${
                                  active
                                    ? 'bg-sky-600 text-white'
                                    : 'bg-white/10 hover:bg-white/20 text-slate-200'
                                }`}
                              >
                                {active ? 'Selected' : 'Select'}
                              </button>
                              <div className="flex items-center gap-1">
                                {onOpenStudio && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenStudio(trk)}
                                    title="Edit in Track Studio"
                                    className="p-1.5 rounded hover:bg-white/10 text-slate-300 hover:text-white cursor-pointer"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const code = exportTrackToShareCode(trk);
                                    navigator.clipboard.writeText(code);
                                    setCopiedTrackId(trk.id);
                                    setTimeout(() => setCopiedTrackId(null), 2000);
                                  }}
                                  title="Copy Share Code"
                                  className="p-1.5 rounded hover:bg-white/10 text-slate-300 hover:text-white cursor-pointer"
                                >
                                  {copiedTrackId === trk.id ? (
                                    <span className="text-[10px] text-emerald-400 font-bold">Copied</span>
                                  ) : (
                                    <Share2 className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    deleteCustomTrack(trk.id);
                                    refreshCustomTracks();
                                    if (config.trackId === trk.id) {
                                      onUpdateConfig({ trackId: TRACKS[0].id, customTrack: undefined });
                                    }
                                  }}
                                  title="Delete Custom Track"
                                  className="p-1.5 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : filteredTracks.length === 0 ? (
                  <div className="p-6 border border-dashed border-white/15 rounded-lg text-center space-y-2 bg-[#131822]/60">
                    <div className="text-xs text-slate-300">No circuits match &ldquo;{trackSearch}&rdquo;.</div>
                    <button
                      type="button"
                      onClick={() => setTrackSearch('')}
                      className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-semibold cursor-pointer"
                    >
                      Clear search
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {filteredTracks.map((trk) => {
                      const active = trk.id === config.trackId && !config.customTrack;
                      return (
                        <button
                          key={trk.id}
                          type="button"
                          onClick={() => onUpdateConfig({ trackId: trk.id, customTrack: undefined })}
                          className={`flex items-center justify-between p-3 rounded-md border text-left transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#1c2331] border-red-500 text-white'
                              : 'bg-[#151a23] border-white/10 text-slate-300 hover:bg-[#19202c]'
                          }`}
                        >
                          <div className="min-w-0 pr-2.5">
                            <div className="text-sm font-semibold truncate">{trk.name}</div>
                            <div className="mt-1 text-[11px] text-slate-400">
                              {trk.country} · {trk.seriesTags.join(' / ')}
                            </div>
                            <div className="mt-0.5 text-[11px] font-telemetry text-slate-400">
                              {trk.corners} turns · ~{Math.round(trk.targetLapSeconds)}s lap
                            </div>
                          </div>
                          <TrackOutlineSvg track={trk} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Custom Track Import Dialog */}
      {importModalOpen && (
        <div
          data-testid="setup-import-modal"
          role="dialog"
          aria-label="Import Circuit"
          className="fixed inset-0 z-40 bg-black/80 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-[#121722] border border-white/15 rounded-lg p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <h3 className="font-display font-bold text-sm text-white">Import Custom Circuit</h3>
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Paste a Share Code (e.g. <span className="text-sky-300 font-telemetry">APXTRK:...</span>) or circuit JSON.
            </p>
            <textarea
              value={importCodeInput}
              onChange={(e) => {
                setImportCodeInput(e.target.value);
                setImportErr(null);
              }}
              rows={4}
              placeholder="Paste APXTRK:... code or JSON..."
              className="w-full p-2.5 bg-black/40 border border-white/15 focus:border-sky-400 rounded text-xs font-telemetry text-slate-200 outline-none resize-none"
            />
            {importErr && <div className="text-xs text-red-400 font-medium">{importErr}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-xs text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="btn-confirm-import"
                onClick={() => {
                  setImportErr(null);
                  const res = importTrackFromString(importCodeInput);
                  if (!res.success || !res.track) {
                    setImportErr(res.error || 'Failed to parse track');
                    return;
                  }
                  refreshCustomTracks();
                  onUpdateConfig({ trackId: res.track.id, customTrack: res.track });
                  setImportModalOpen(false);
                  setImportCodeInput('');
                }}
                disabled={!importCodeInput.trim()}
                className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-xs font-display font-bold text-white cursor-pointer"
              >
                Import Circuit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
