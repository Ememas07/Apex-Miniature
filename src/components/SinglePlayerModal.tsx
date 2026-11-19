import { useMemo, useState } from 'react';
import { CloudRain, Flag, Gauge, Search, Sun, Timer, Users, X } from 'lucide-react';
import { CAR_CLASSES, getCarById } from '../game/cars';
import { getSavedCustomTracks } from '../game/customTracks';
import { TRACKS, compileTrack, filterTracks, getTrackById } from '../game/tracks';
import {
  AIDifficulty,
  CarClassId,
  RaceConfig,
  SinglePlayerSessionMode,
  TireCompound,
  TrackRegion,
  TrackSpec,
} from '../game/types';

interface SinglePlayerModalProps {
  config: RaceConfig;
  customTracksNonce?: number;
  onStartPractice: (patch: Partial<RaceConfig>) => void;
  onStartQuickRace: (patch: Partial<RaceConfig>) => void;
  onClose: () => void;
}

function TrackOutlinePreview({ track }: { track: TrackSpec }) {
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
        const px = 10 + ((s.x - minX) / span) * 100;
        const py = 10 + ((s.z - minZ) / span) * 80;
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

const REGION_FILTERS: Array<'Flagship' | TrackRegion | 'All'> = [
  'Flagship',
  'Europe',
  'Americas',
  'Asia-Pacific & Middle East',
  'Custom',
  'All',
];

export function SinglePlayerModal({
  config,
  customTracksNonce,
  onStartPractice,
  onStartQuickRace,
  onClose,
}: SinglePlayerModalProps) {
  const [mode, setMode] = useState<SinglePlayerSessionMode>(
    config.sessionMode === 'practice' ? 'practice' : 'practice',
  );
  const [trackId, setTrackId] = useState<string>(config.trackId);
  const [customTrack, setCustomTrack] = useState<TrackSpec | undefined>(config.customTrack);
  const [regionFilter, setRegionFilter] = useState<'Flagship' | TrackRegion | 'All'>('Flagship');
  const [trackSearch, setTrackSearch] = useState('');

  // Practice settings
  const [practiceLaps, setPracticeLaps] = useState<number>(
    config.sessionMode === 'practice' ? config.totalLaps : 0,
  );

  // Quick Race settings
  const [activeClasses, setActiveClasses] = useState<CarClassId[]>(
    config.activeClasses.length > 0 ? config.activeClasses : [getCarById(config.playerCarId).classId],
  );
  const [raceLaps, setRaceLaps] = useState<number>(config.totalLaps > 0 ? config.totalLaps : 5);
  const [aiBotCount, setAiBotCount] = useState<number>(config.aiBotCount ?? 11);
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>(config.aiDifficulty);
  const [qualifyingEnabled, setQualifyingEnabled] = useState<boolean>(config.qualifyingEnabled);

  // Shared environment settings
  const [weather, setWeather] = useState<'dry' | 'dynamic-rain'>(config.weather);
  const [startingCompound, setStartingCompound] = useState<TireCompound>(config.startingCompound);

  const customTracks = useMemo(() => {
    void customTracksNonce;
    return getSavedCustomTracks();
  }, [customTracksNonce]);

  const filteredTracks = useMemo(
    () => filterTracks(TRACKS, customTracks, regionFilter, trackSearch),
    [customTracks, regionFilter, trackSearch],
  );

  const selectedTrack = customTrack || getTrackById(trackId);
  const playerCar = getCarById(config.playerCarId);
  const classMeta = CAR_CLASSES[playerCar.classId];

  const toggleClass = (cid: CarClassId) => {
    const exists = activeClasses.includes(cid);
    if (exists && activeClasses.length === 1) return;
    if (exists) {
      setActiveClasses(activeClasses.filter((c) => c !== cid));
    } else {
      setActiveClasses([...activeClasses, cid].slice(-3));
    }
  };

  const handleLaunch = () => {
    if (mode === 'practice') {
      onStartPractice({
        sessionMode: 'practice',
        trackId,
        customTrack,
        totalLaps: practiceLaps,
        weather,
        startingCompound,
        qualifyingEnabled: false,
        noAi: true,
        aiBotCount: 0,
      });
    } else {
      const normalizedClasses = activeClasses.includes(playerCar.classId)
        ? activeClasses
        : [playerCar.classId, ...activeClasses].slice(0, 3);
      onStartQuickRace({
        sessionMode: 'race',
        trackId,
        customTrack,
        activeClasses: normalizedClasses,
        totalLaps: raceLaps,
        aiBotCount,
        gridSize: aiBotCount + 1,
        noAi: false,
        aiDifficulty,
        qualifyingEnabled,
        weather,
        startingCompound,
      });
    }
  };

  return (
    <div
      data-testid="single-player-modal"
      role="dialog"
      aria-label="Single Player Mode"
      className="fixed inset-0 z-30 bg-black/80 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-5xl max-h-[90vh] bg-[#0f131b] border border-white/15 rounded-lg flex flex-col overflow-hidden shadow-2xl">
        {/* Top Bar */}
        <div className="px-6 py-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-4 bg-[#0b0e13]">
          <div>
            <h2 className="text-lg font-display font-bold text-white tracking-wide">
              SINGLE PLAYER
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
              <span
                className="px-1.5 py-0.5 text-[10px] font-display font-bold rounded-sm"
                style={{ backgroundColor: classMeta.plateColor, color: classMeta.badgeTextColor }}
              >
                {classMeta.shortName}
              </span>
              <span className="text-slate-200 font-semibold">{playerCar.name}</span>
              <span>·</span>
              <span>Offline Local Simulation</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="sp-tab-practice"
              onClick={() => setMode('practice')}
              className={`px-3.5 py-2 rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                mode === 'practice'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#171d28] text-slate-300 hover:bg-[#1f2735]'
              }`}
            >
              <Timer className="w-3.5 h-3.5" />
              Practice / Hotlap
            </button>
            <button
              type="button"
              data-testid="sp-tab-race"
              onClick={() => setMode('race')}
              className={`px-3.5 py-2 rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                mode === 'race'
                  ? 'bg-red-600 text-white'
                  : 'bg-[#171d28] text-slate-300 hover:bg-[#1f2735]'
              }`}
            >
              <Flag className="w-3.5 h-3.5" />
              Quick Race vs AI
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Single Player"
              className="ml-2 p-2 rounded bg-[#171d28] hover:bg-[#232c3c] text-slate-300 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scroll p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Circuit Selector (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-display font-bold uppercase tracking-wider text-slate-300">
                Select Circuit
              </h3>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={trackSearch}
                  onChange={(e) => setTrackSearch(e.target.value)}
                  placeholder="Search tracks..."
                  className="pl-8 pr-3 py-1.5 rounded bg-[#161b24] border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {REGION_FILTERS.map((reg) => (
                <button
                  key={reg}
                  type="button"
                  onClick={() => setRegionFilter(reg)}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                    regionFilter === reg
                      ? 'bg-sky-600 text-white'
                      : 'bg-[#161b24] text-slate-400 hover:text-white border border-white/10'
                  }`}
                >
                  {reg}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto custom-scroll pr-1">
              {filteredTracks.map((trk) => {
                const isSelected = selectedTrack.id === trk.id;
                const isCustom = trk.region === 'Custom';
                return (
                  <button
                    key={trk.id}
                    type="button"
                    onClick={() => {
                      setTrackId(trk.id);
                      setCustomTrack(isCustom ? trk : undefined);
                    }}
                    className={`flex items-center gap-3 p-3 rounded-md border text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#1a2230] border-sky-400 text-white'
                        : 'bg-[#131822] border-white/10 text-slate-300 hover:border-white/25'
                    }`}
                  >
                    <TrackOutlinePreview track={trk} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-xs text-white truncate">{trk.name}</div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">{trk.country}</div>
                      <div className="text-[10px] font-telemetry text-slate-400 mt-1">
                        ~{Math.round(trk.targetLapSeconds)}s lap
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Session Configuration (5 cols) */}
          <div className="lg:col-span-5 space-y-5 bg-[#121721] border border-white/10 rounded-lg p-5">
            {mode === 'practice' ? (
              <>
                <div>
                  <div className="flex items-center gap-2 text-emerald-400 font-display font-bold text-sm uppercase tracking-wide">
                    <Gauge className="w-4 h-4" />
                    Solo Track Hotlap
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Clean rolling start with no AI traffic. Tracks live S1 / S2 / S3 sector splits and personal best laps.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-2">
                    Session Length
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Continuous', val: 0 },
                      { label: '5 Laps', val: 5 },
                      { label: '10 Laps', val: 10 },
                      { label: '15 Laps', val: 15 },
                      { label: '20 Laps', val: 20 },
                    ].map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => setPracticeLaps(opt.val)}
                        className={`py-2 px-2 rounded text-xs font-semibold border cursor-pointer ${
                          practiceLaps === opt.val
                            ? 'bg-emerald-600/25 border-emerald-400 text-emerald-200'
                            : 'bg-[#171d28] border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="flex items-center gap-2 text-red-400 font-display font-bold text-sm uppercase tracking-wide">
                    <Users className="w-4 h-4" />
                    Quick Race vs AI
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Full standing-start race (or 1-lap qualifying) against local AI drivers across up to 3 classes.
                  </p>
                </div>

                {/* AI Opponents & Laps */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-300 font-semibold">AI Opponents</span>
                      <span className="font-telemetry text-white">{aiBotCount}</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={23}
                      value={aiBotCount}
                      onChange={(e) => setAiBotCount(Number(e.target.value))}
                      className="w-full accent-red-500 cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                      Race Laps
                    </label>
                    <div className="flex gap-1">
                      {[3, 5, 10, 15, 20].map((laps) => (
                        <button
                          key={laps}
                          type="button"
                          onClick={() => setRaceLaps(laps)}
                          className={`flex-1 py-1.5 rounded text-[11px] font-telemetry font-bold border cursor-pointer ${
                            raceLaps === laps
                              ? 'bg-red-600 border-red-400 text-white'
                              : 'bg-[#171d28] border-white/10 text-slate-400 hover:text-white'
                          }`}
                        >
                          {laps}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* AI Difficulty */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                    AI Difficulty
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['Rookie', 'Amateur', 'Pro', 'Alien'] as AIDifficulty[]).map((diff) => (
                      <button
                        key={diff}
                        type="button"
                        onClick={() => setAiDifficulty(diff)}
                        className={`py-1.5 rounded text-xs font-semibold border cursor-pointer ${
                          aiDifficulty === diff
                            ? 'bg-red-600/25 border-red-400 text-white'
                            : 'bg-[#171d28] border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {diff}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Multi-Class Opponent Pool */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                    Grid Classes (up to 3)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.values(CAR_CLASSES).map((cls) => {
                      const active = activeClasses.includes(cls.id);
                      return (
                        <button
                          key={cls.id}
                          type="button"
                          onClick={() => toggleClass(cls.id)}
                          className={`px-2 py-1 rounded text-[11px] font-display font-bold border cursor-pointer ${
                            active
                              ? 'border-white/60 text-white'
                              : 'bg-[#171d28] border-white/10 text-slate-500 hover:text-slate-300'
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

                {/* Qualifying Toggle */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-semibold text-slate-300">1-Lap Qualifying Shootout</span>
                  <button
                    type="button"
                    onClick={() => setQualifyingEnabled((q) => !q)}
                    className={`px-3 py-1 rounded text-xs font-semibold border cursor-pointer ${
                      qualifyingEnabled
                        ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                        : 'bg-[#171d28] border-white/10 text-slate-400'
                    }`}
                  >
                    {qualifyingEnabled ? 'Enabled' : 'Grid Start'}
                  </button>
                </div>
              </>
            )}

            {/* Shared Weather & Starting Tires */}
            <div className="pt-3 border-t border-white/10 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Weather Conditions
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setWeather('dry')}
                    className={`py-2 rounded text-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer ${
                      weather === 'dry'
                        ? 'bg-sky-600/25 border-sky-400 text-sky-200'
                        : 'bg-[#171d28] border-white/10 text-slate-400'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    Dry Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeather('dynamic-rain')}
                    className={`py-2 rounded text-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer ${
                      weather === 'dynamic-rain'
                        ? 'bg-sky-600/25 border-sky-400 text-sky-200'
                        : 'bg-[#171d28] border-white/10 text-slate-400'
                    }`}
                  >
                    <CloudRain className="w-3.5 h-3.5" />
                    Dynamic Rain
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Starting Compound
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['soft', 'medium', 'hard', 'wet'] as TireCompound[]).map((cmp) => (
                    <button
                      key={cmp}
                      type="button"
                      onClick={() => setStartingCompound(cmp)}
                      className={`py-1.5 rounded text-[11px] font-bold uppercase border cursor-pointer ${
                        startingCompound === cmp
                          ? 'bg-red-600 border-red-400 text-white'
                          : 'bg-[#171d28] border-white/10 text-slate-400 hover:text-white'
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

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-[#0b0e13] flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs text-slate-300">
            <span className="text-white font-semibold">{selectedTrack.name}</span>
            <span className="mx-2 text-slate-600">·</span>
            <span>
              {mode === 'practice'
                ? practiceLaps === 0
                  ? 'Practice Hotlap (Continuous)'
                  : `Practice (${practiceLaps} Laps)`
                : `Quick Race · ${aiBotCount} AI (${aiDifficulty}) · ${raceLaps} Laps`}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded bg-[#171d28] hover:bg-[#222a38] border border-white/10 text-xs font-semibold text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid={mode === 'practice' ? 'btn-start-practice' : 'btn-start-quick-race'}
              onClick={handleLaunch}
              className={`px-6 py-2.5 rounded text-xs font-display font-bold text-white cursor-pointer shadow-lg ${
                mode === 'practice'
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : 'bg-red-600 hover:bg-red-500'
              }`}
            >
              {mode === 'practice' ? 'Start Practice' : qualifyingEnabled ? 'Start Qualifying' : 'Start Quick Race'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
