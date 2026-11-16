import { useEffect, useState } from 'react';
import { X, Users, Flag, CloudRain, Sun, CheckCircle, Clock, Plus, Edit3, Trash2, Share2, Upload } from 'lucide-react';
import { CAR_CLASSES, CARS, getCarById } from '../game/cars';
import { TRACKS, compileTrack, getTrackById } from '../game/tracks';
import {
  deleteCustomTrack,
  exportTrackToShareCode,
  getSavedCustomTracks,
  importTrackFromString,
} from '../game/customTracks';
import {
  AIDifficulty,
  CarClassId,
  LiveryConfig,
  RaceConfig,
  RoomState,
  TireCompound,
  TrackRegion,
  TrackSpec,
} from '../game/types';

interface RaceSetupModalProps {
  config: RaceConfig;
  room: RoomState | null;
  myPeerId?: string;
  customTracksNonce?: number;
  mpError: string | null;
  onUpdateConfig: (patch: Partial<RaceConfig>) => void;
  onCreateRoom: (driverName: string) => void;
  onJoinRoom: (code: string, driverName: string) => void;
  onLeaveRoom: () => void;
  onStartFromLobby: () => void;
  onClose: () => void;
  onUpdatePeer?: (payload: { carId?: string; classId?: CarClassId; livery?: LiveryConfig; ready?: boolean }) => void;
  onOpenStudio?: (trackToEdit?: TrackSpec) => void;
}

type SetupTab = 'track' | 'rules' | 'multiplayer';

const PRESET_COLORS = [
  '#c8102e', // Ferrari Rosso
  '#1d4ed8', // Alpine Blue
  '#facc15', // Racing Yellow
  '#16a34a', // British Racing Green
  '#ea580c', // McLaren Papaya
  '#a855f7', // Purple
  '#f8fafc', // Pure White
  '#0f172a', // Midnight Black
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
    <svg viewBox="0 0 120 100" className="w-24 h-20 shrink-0" aria-hidden="true">
      <path d={d} fill="none" stroke="#334155" strokeWidth="6" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={track.kerbPrimary} strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

export function RaceSetupModal({
  config,
  room,
  myPeerId,
  customTracksNonce,
  mpError,
  onUpdateConfig,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onStartFromLobby,
  onClose,
  onUpdatePeer,
  onOpenStudio,
}: RaceSetupModalProps) {
  const [tab, setTab] = useState<SetupTab>('track');
  const [regionFilter, setRegionFilter] = useState<'Flagship' | TrackRegion | 'All'>('Flagship');
  const [driverName, setDriverName] = useState('Player 1');
  const [joinCode, setJoinCode] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [customTracks, setCustomTracks] = useState<TrackSpec[]>(() => getSavedCustomTracks());
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importCodeInput, setImportCodeInput] = useState('');
  const [importErr, setImportErr] = useState<string | null>(null);
  const [copiedTrackId, setCopiedTrackId] = useState<string | null>(null);

  const selectedTrack = config.customTrack || getTrackById(config.trackId);
  const playerCar = getCarById(config.playerCarId);

  const refreshCustomTracks = () => {
    setCustomTracks(getSavedCustomTracks());
  };

  useEffect(() => {
    refreshCustomTracks();
  }, [customTracksNonce]);

  const filteredTracks = TRACKS.filter((t) => {
    if (regionFilter === 'Flagship') return t.flagship;
    if (regionFilter === 'All') return true;
    if (regionFilter === 'Custom') return false;
    return t.region === regionFilter;
  });

  const toggleClass = (cid: CarClassId) => {
    const exists = config.activeClasses.includes(cid);
    if (exists && config.activeClasses.length === 1) return;
    if (exists) {
      const next = config.activeClasses.filter((c) => c !== cid);
      onUpdateConfig({ activeClasses: next });
    } else {
      const next = [...config.activeClasses, cid].slice(-3);
      onUpdateConfig({ activeClasses: next });
    }
  };

  const handleSelectCarInLobby = (carId: string) => {
    const car = getCarById(carId);
    const nextLivery: LiveryConfig = {
      ...car.defaultLivery,
      driverNumber: config.playerLivery.driverNumber || car.defaultLivery.driverNumber,
    };
    const nextClasses = config.activeClasses.includes(car.classId)
      ? config.activeClasses
      : [car.classId, ...config.activeClasses].slice(0, 3);

    onUpdateConfig({
      playerCarId: car.id,
      playerLivery: nextLivery,
      activeClasses: nextClasses,
    });
    onUpdatePeer?.({ carId: car.id, classId: car.classId, livery: nextLivery });
  };

  const handleSelectColorInLobby = (colorHex: string) => {
    const nextLivery: LiveryConfig = {
      ...config.playerLivery,
      primaryColor: colorHex,
    };
    onUpdateConfig({ playerLivery: nextLivery });
    onUpdatePeer?.({ livery: nextLivery });
  };

  const handleToggleReady = () => {
    const next = !isReady;
    setIsReady(next);
    onUpdatePeer?.({ ready: next });
  };

  return (
    <div
      data-testid="race-setup-modal"
      role="dialog"
      aria-label="Race Setup and Multiplayer Lobby"
      className="fixed inset-0 z-30 bg-[#0b0e13]/95 flex items-center justify-center p-4 md:p-8"
    >
      <div className="w-full max-w-5xl h-[88vh] bg-[#11151d] border border-white/10 rounded-lg flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="text-lg font-display font-bold text-white">Race Weekend & Multiplayer Paddock</h2>
            <p className="text-xs text-slate-400">
              {selectedTrack.name} · {config.totalLaps} Laps ·{' '}
              {config.noAi ? `${room ? room.peers.length : 1} Humans (No AI)` : `${config.gridSize} Cars`}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onStartFromLobby}
              className="flex items-center gap-1.5 px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-xs font-display font-bold text-white cursor-pointer whitespace-nowrap"
            >
              <Flag className="w-3.5 h-3.5" />
              {config.qualifyingEnabled ? 'Start Qualifying' : 'Launch Race'}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Race Setup"
              className="p-2 rounded bg-white/5 hover:bg-white/10 text-slate-300 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-3 bg-[#0d1118] border-b border-white/10">
          {[
            { id: 'track' as SetupTab, label: `Circuits (${TRACKS.length})` },
            { id: 'rules' as SetupTab, label: 'Multi-Class & Strategy' },
            { id: 'multiplayer' as SetupTab, label: room ? `Room ${room.code}` : 'Multiplayer & AI Fill' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                tab === t.id ? 'border-red-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scroll p-6">
          {tab === 'track' && (
            <div className="space-y-4">
              {/* Region Filters */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {(['Flagship', 'Americas', 'Europe', 'Asia-Pacific & Middle East', 'Custom', 'All'] as const).map(
                    (rf) => {
                      const count = rf === 'Custom' ? customTracks.length : rf === 'All' ? TRACKS.length : undefined;
                      return (
                        <button
                          key={rf}
                          type="button"
                          onClick={() => {
                            setRegionFilter(rf);
                            if (rf === 'Custom') refreshCustomTracks();
                          }}
                          className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                            regionFilter === rf
                              ? 'bg-red-600 text-white'
                              : 'bg-[#171c26] text-slate-300 hover:bg-[#1f2634]'
                          }`}
                        >
                          <span>{rf === 'Flagship' ? 'Flagship 10' : rf === 'Custom' ? 'Custom CAD' : rf}</span>
                          {count !== undefined && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 text-slate-300 font-mono">
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    },
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {regionFilter === 'Custom' && onOpenStudio && (
                    <button
                      type="button"
                      data-testid="btn-new-custom-track"
                      onClick={() => onOpenStudio()}
                      className="flex items-center gap-1 px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer"
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
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#202737] hover:bg-[#283247] border border-white/10 text-slate-200 text-xs font-medium cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Import
                    </button>
                  )}
                  <span className="text-xs text-slate-400 tabular-nums">
                    Showing {regionFilter === 'Custom' ? customTracks.length : filteredTracks.length} circuits
                  </span>
                </div>
              </div>

              {/* Custom Tracks Tab View */}
              {regionFilter === 'Custom' ? (
                customTracks.length === 0 ? (
                  <div className="p-8 border border-dashed border-white/15 rounded-lg text-center space-y-3 bg-[#131822]/60">
                    <div className="text-sm font-semibold text-white">No Custom Tracks Saved Yet</div>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Create your own high-speed figure-8s with overpass bridges, banked tri-ovals, or GP circuits in
                      the Track Studio spline editor!
                    </p>
                    {onOpenStudio && (
                      <button
                        type="button"
                        onClick={() => onOpenStudio()}
                        className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-display font-bold cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        Launch Track Studio
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {customTracks.map((trk) => {
                      const active = trk.id === config.trackId;
                      return (
                        <div
                          key={trk.id}
                          className={`flex flex-col justify-between p-3.5 rounded-md border text-left transition-colors ${
                            active
                              ? 'bg-[#1c2331] border-sky-400 text-white'
                              : 'bg-[#151a23] border-white/10 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold truncate text-white">{trk.name}</span>
                                <span className="px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 text-[10px] font-mono">
                                  Custom CAD
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-slate-400">
                                {trk.scenery} · {trk.corners} turns · ~{trk.targetLapSeconds}s lap · {trk.waypoints.length} nodes
                              </div>
                            </div>
                            <TrackOutlineSvg track={trk} />
                          </div>

                          {/* Action Button Row */}
                          <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-white/10 text-xs">
                            <button
                              type="button"
                              onClick={() => onUpdateConfig({ trackId: trk.id, customTrack: trk })}
                              className={`px-3 py-1 rounded font-semibold cursor-pointer ${
                                active
                                  ? 'bg-sky-600 text-white'
                                  : 'bg-white/10 hover:bg-white/20 text-slate-200'
                              }`}
                            >
                              {active ? '✓ Selected' : 'Select Track'}
                            </button>

                            <div className="flex items-center gap-1.5">
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
                                  <span className="text-[10px] text-emerald-400 font-bold">Copied!</span>
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
              ) : (
                /* Standard Track Grid */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredTracks.map((trk) => {
                    const active = trk.id === config.trackId && !config.customTrack;
                    return (
                      <button
                        key={trk.id}
                        type="button"
                        onClick={() => onUpdateConfig({ trackId: trk.id, customTrack: undefined })}
                        className={`flex items-center justify-between p-3.5 rounded-md border text-left transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#1c2331] border-red-500 text-white'
                            : 'bg-[#151a23] border-white/10 text-slate-300 hover:bg-[#19202c]'
                        }`}
                      >
                        <div className="min-w-0 pr-3">
                          <div className="text-sm font-semibold truncate">{trk.name}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {trk.country} · {trk.seriesTags.join(' / ')} · {trk.corners} turns · ~{trk.targetLapSeconds}s lap
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

          {tab === 'rules' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Multi-Class Grid Builder */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-display font-bold text-white">Multi-Class Grid (Up to 3 Classes)</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Mix Prototypes + LMP2 + GT3 or run single-class sprints. Your car: {playerCar.name} (
                    {CAR_CLASSES[playerCar.classId].shortName}).
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(CAR_CLASSES).map((cls) => {
                    const active = config.activeClasses.includes(cls.id);
                    return (
                      <button
                        key={cls.id}
                        type="button"
                        onClick={() => toggleClass(cls.id)}
                        className={`flex items-center justify-between px-3 py-2.5 rounded border text-xs font-semibold cursor-pointer transition-colors ${
                          active
                            ? 'bg-[#1c2433] border-red-500 text-white'
                            : 'bg-[#151a23] border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span className="truncate">{cls.shortName}</span>
                        <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: cls.plateColor }} />
                      </button>
                    );
                  })}
                </div>

                {/* Preset Endurance Multi-Class Quick Button */}
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig({
                      activeClasses: [CarClassId.HYPERCAR_GTP, CarClassId.LMP2, CarClassId.GT3],
                    })
                  }
                  className="w-full py-2 px-3 rounded bg-[#18202c] hover:bg-[#202a3a] border border-white/10 text-xs font-semibold text-amber-300 cursor-pointer"
                >
                  Apply WEC / IMSA 3-Class Endurance Grid (GTP + LMP2 + GT3)
                </button>
              </div>

              {/* Race Format & Pit Strategy Rules */}
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <label htmlFor="laps-slider" className="font-semibold text-slate-200">
                      Race Length
                    </label>
                    <span className="font-telemetry text-white">{config.totalLaps} Laps</span>
                  </div>
                  <input
                    id="laps-slider"
                    type="range"
                    min={5}
                    max={20}
                    value={config.totalLaps}
                    onChange={(e) => onUpdateConfig({ totalLaps: Number(e.target.value) })}
                    className="w-full accent-red-600 cursor-pointer"
                  />
                </div>

                {/* AI Bot Count (0 to 23) and "No AI (Humans Only)" Toggle */}
                <div className="p-3 rounded bg-[#151a24] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="ai-bot-slider" className="font-semibold text-slate-200">
                      AI Bot Opponents (0 to 23)
                    </label>
                    <span className="font-telemetry font-bold text-amber-300">
                      {config.noAi ? '0 (No AI)' : `${config.aiBotCount ?? 11} Bots`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const nextNoAi = !config.noAi;
                        onUpdateConfig({
                          noAi: nextNoAi,
                          aiBotCount: nextNoAi ? 0 : 11,
                          gridSize: nextNoAi ? 1 : 12,
                        });
                      }}
                      className={`px-3 py-1.5 rounded border text-xs font-semibold cursor-pointer transition-colors ${
                        config.noAi
                          ? 'bg-amber-600 border-amber-400 text-white'
                          : 'bg-[#1e2634] border-white/15 text-slate-300 hover:text-white'
                      }`}
                    >
                      {config.noAi ? 'No AI (Humans Only) [ON]' : 'No AI (Humans Only) [OFF]'}
                    </button>
                    <span className="text-[11px] text-slate-400">
                      {config.noAi ? 'Humans only grid (0 bots)' : 'AI bots fill remaining slots'}
                    </span>
                  </div>
                  <input
                    id="ai-bot-slider"
                    type="range"
                    min={0}
                    max={23}
                    disabled={config.noAi}
                    value={config.noAi ? 0 : config.aiBotCount ?? 11}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      onUpdateConfig({
                        aiBotCount: val,
                        noAi: val === 0,
                        gridSize: val + 1,
                      });
                    }}
                    className="w-full accent-red-600 cursor-pointer disabled:opacity-40"
                  />
                </div>

                <div>
                  <span className="block text-xs font-semibold text-slate-200 mb-2">Starting Tire Compound</span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['soft', 'medium', 'hard', 'wet'] as TireCompound[]).map((cmp) => (
                      <button
                        key={cmp}
                        type="button"
                        onClick={() => onUpdateConfig({ startingCompound: cmp })}
                        className={`py-2 px-2 rounded border text-xs font-semibold uppercase cursor-pointer ${
                          config.startingCompound === cmp
                            ? 'bg-red-600 border-red-500 text-white'
                            : 'bg-[#151a23] border-white/10 text-slate-300'
                        }`}
                      >
                        {cmp}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    data-testid="btn-weather-toggle"
                    onClick={() =>
                      onUpdateConfig({
                        weather: config.weather === 'dynamic-rain' ? 'dry' : 'dynamic-rain',
                      })
                    }
                    className="flex items-center justify-center gap-2 py-2.5 px-3 rounded border border-white/15 bg-[#151a23] hover:bg-[#1b222e] text-xs font-semibold text-slate-200 cursor-pointer"
                  >
                    {config.weather === 'dynamic-rain' ? (
                      <>
                        <CloudRain className="w-4 h-4 text-sky-400" />
                        Dynamic Rain
                      </>
                    ) : (
                      <>
                        <Sun className="w-4 h-4 text-amber-400" />
                        Dry Track
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onUpdateConfig({ qualifyingEnabled: !config.qualifyingEnabled })}
                    className={`py-2.5 px-3 rounded border text-xs font-semibold cursor-pointer ${
                      config.qualifyingEnabled
                        ? 'bg-emerald-950/50 border-emerald-500 text-emerald-200'
                        : 'bg-[#151a23] border-white/15 text-slate-300'
                    }`}
                  >
                    1-Lap Qualifying: {config.qualifyingEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-semibold text-slate-200">AI Difficulty</span>
                    <span className="text-slate-400 tabular-nums">
                      Adaptive Skill: {config.aiAdaptiveBoost >= 0 ? '+' : ''}
                      {Math.round(config.aiAdaptiveBoost * 100)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['Rookie', 'Amateur', 'Pro', 'Alien'] as AIDifficulty[]).map((diff) => (
                      <button
                        key={diff}
                        type="button"
                        onClick={() => onUpdateConfig({ aiDifficulty: diff })}
                        className={`py-2 rounded border text-xs font-semibold cursor-pointer ${
                          config.aiDifficulty === diff
                            ? 'bg-[#1f2838] border-red-500 text-white'
                            : 'bg-[#151a23] border-white/10 text-slate-400'
                        }`}
                      >
                        {diff}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'multiplayer' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-display font-bold text-white">Online Multiplayer Room</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Host a room or enter a 5-letter code. Every player independently chooses their car, class, and livery
                    before clicking Ready.
                  </p>
                </div>

                <div>
                  <label htmlFor="driver-name-input" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Your Driver Name
                  </label>
                  <input
                    id="driver-name-input"
                    type="text"
                    maxLength={20}
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-[#0c1017] border border-white/15 text-sm text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                {!room ? (
                  <div className="space-y-3 pt-2">
                    <button
                      type="button"
                      onClick={() => onCreateRoom(driverName || 'Host Driver')}
                      className="w-full py-2.5 px-4 rounded bg-red-600 hover:bg-red-500 text-xs font-display font-bold text-white cursor-pointer"
                    >
                      Host New Multiplayer Room
                    </button>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Room Code (e.g. APX42)"
                        maxLength={6}
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        className="flex-1 px-3 py-2 rounded bg-[#0c1017] border border-white/15 text-sm font-telemetry uppercase text-white focus:outline-none focus:border-red-500"
                      />
                      <button
                        type="button"
                        onClick={() => onJoinRoom(joinCode, driverName || 'Guest Driver')}
                        disabled={joinCode.trim().length < 4}
                        className="px-4 py-2 rounded bg-[#1d2534] hover:bg-[#263144] disabled:opacity-40 border border-white/15 text-xs font-semibold text-white cursor-pointer"
                      >
                        Join Room
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-4 rounded bg-[#0d1118] border border-white/10 flex items-center justify-between">
                      <div>
                        <div className="text-xs text-slate-400">Active Room Code</div>
                        <div className="text-2xl font-display font-extrabold text-amber-400 tracking-widest">
                          {room.code}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleToggleReady}
                          className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                            isReady
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                              : 'bg-amber-600 hover:bg-amber-500 text-white'
                          }`}
                        >
                          {isReady ? <CheckCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                          {isReady ? 'READY' : 'MARK READY'}
                        </button>
                        <button
                          type="button"
                          onClick={onLeaveRoom}
                          className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-xs text-slate-300 cursor-pointer"
                        >
                          Leave
                        </button>
                      </div>
                    </div>

                    {/* Independent Car & Livery Customizer for Connected Player */}
                    <div className="p-4 rounded bg-[#0e131c] border border-white/10 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-display font-bold text-white">Your Paddock Car & Colors</span>
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold"
                          style={{
                            backgroundColor: CAR_CLASSES[playerCar.classId].plateColor,
                            color: CAR_CLASSES[playerCar.classId].badgeTextColor,
                          }}
                        >
                          {CAR_CLASSES[playerCar.classId].shortName}
                        </span>
                      </div>

                      {/* Car Picker */}
                      <div>
                        <label htmlFor="paddock-car-select" className="block text-[11px] text-slate-400 mb-1">
                          Select Car Model
                        </label>
                        <select
                          id="paddock-car-select"
                          value={config.playerCarId}
                          onChange={(e) => handleSelectCarInLobby(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded bg-[#151a24] border border-white/15 text-xs text-white focus:outline-none focus:border-red-500"
                        >
                          {CARS.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({CAR_CLASSES[c.classId].shortName})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Primary Livery Color Picker */}
                      <div>
                        <span className="block text-[11px] text-slate-400 mb-1.5">Primary Body Color</span>
                        <div className="flex flex-wrap gap-1.5">
                          {PRESET_COLORS.map((col) => (
                            <button
                              key={col}
                              type="button"
                              onClick={() => handleSelectColorInLobby(col)}
                              className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                                config.playerLivery.primaryColor === col
                                  ? 'border-white scale-110 shadow-lg'
                                  : 'border-transparent opacity-85 hover:opacity-100'
                              }`}
                              style={{ backgroundColor: col }}
                              aria-label={`Color ${col}`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Host Controls: AI Opponent Management in Multiplayer */}
                    {room.hostId === myPeerId ? (
                      <div className="p-3 rounded bg-[#131822] border border-white/10 space-y-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-200">Host Lobby AI Settings</span>
                          <span className="text-amber-300 font-bold">
                            {config.noAi ? 'Humans Only (0 AI)' : `${config.aiBotCount ?? 11} AI Bots`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const nextNoAi = !config.noAi;
                              onUpdateConfig({
                                noAi: nextNoAi,
                                aiBotCount: nextNoAi ? 0 : 11,
                                gridSize: nextNoAi ? room.peers.length : room.peers.length + 11,
                              });
                            }}
                            className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                              config.noAi
                                ? 'bg-amber-600 text-white'
                                : 'bg-[#1c2433] border border-white/15 text-slate-300'
                            }`}
                          >
                            {config.noAi ? 'No AI (Humans Only) [ON]' : 'No AI (Humans Only) [OFF]'}
                          </button>
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                            <span>AI Bot Fill Count (0–23)</span>
                            <span className="font-telemetry text-slate-200">
                              {config.noAi ? 0 : config.aiBotCount ?? 11}
                            </span>
                          </div>
                          <input
                            type="range"
                            aria-label="Host AI Bot Count"
                            min={0}
                            max={23}
                            disabled={config.noAi}
                            value={config.noAi ? 0 : config.aiBotCount ?? 11}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              onUpdateConfig({
                                aiBotCount: val,
                                noAi: val === 0,
                                gridSize: room.peers.length + val,
                              });
                            }}
                            className="w-full accent-red-600 cursor-pointer disabled:opacity-40"
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {mpError && (
                  <div className="p-3 rounded bg-red-950/60 border border-red-500/40 text-xs text-red-200">
                    {mpError}
                  </div>
                )}
              </div>

              {/* Connected Grid & AI Bot Fill Breakdown */}
              <div className="p-4 rounded bg-[#0d1118] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-white">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span>Connected Roster ({room ? room.peers.length : 1} Human Drivers)</span>
                  </div>
                  <span className="text-xs text-slate-400 tabular-nums">
                    {config.noAi
                      ? 'Zero AI Bots'
                      : `${Math.max(0, (config.aiBotCount ?? 11))} AI Bots filling grid`}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {room ? (
                    room.peers.map((p) => {
                      const peerCar = getCarById(p.carId || 'ferrari-499p');
                      const peerClass = CAR_CLASSES[p.classId || peerCar.classId];
                      return (
                        <div
                          key={p.peerId}
                          className="flex items-center justify-between px-3 py-2.5 rounded bg-[#151a24] border border-white/10 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/30"
                              style={{ backgroundColor: p.livery.primaryColor || '#dc2626' }}
                            />
                            <div className="truncate">
                              <span className="font-semibold text-white">
                                {p.name} {p.isHost ? '(Host)' : ''}
                              </span>
                              <div className="text-[11px] text-slate-400 truncate">
                                {peerCar.name} · #{p.livery.driverNumber}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                              style={{ backgroundColor: peerClass.plateColor, color: peerClass.badgeTextColor }}
                            >
                              {peerClass.shortName}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                p.ready ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/50' : 'bg-amber-950 text-amber-300 border border-amber-500/50'
                              }`}
                            >
                              {p.ready ? 'READY' : 'CHOOSING'}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex items-center justify-between px-3 py-2 rounded bg-[#151a24] border border-white/10 text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/30"
                          style={{ backgroundColor: config.playerLivery.primaryColor }}
                        />
                        <span className="font-semibold text-white">{driverName} (Local Driver)</span>
                      </div>
                      <span className="text-slate-400">
                        {playerCar.name} · #{config.playerLivery.driverNumber}
                      </span>
                    </div>
                  )}

                  <div className="pt-2 border-t border-white/10 text-xs text-slate-400 space-y-1">
                    <div className="font-semibold text-slate-300">Procedural 3D Car & Livery Synchronization</div>
                    <p>
                      Each connected driver renders in their chosen car body (Hypercar, GT3, F1, FE, etc.) with custom
                      paint, driver number, and authentic aerodynamic parts on the starting grid.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Import Modal */}
      {importModalOpen && (
        <div
          data-testid="setup-import-modal"
          role="dialog"
          aria-label="Import Circuit"
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-[#121722] border border-white/15 rounded-lg p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <h3 className="font-display font-bold text-sm text-white">Import Custom Circuit</h3>
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Paste a compact Share Code (e.g. <span className="text-sky-300 font-mono">APXTRK:...</span>) or full
              circuit JSON to load it directly into your garage.
            </p>

            <textarea
              value={importCodeInput}
              onChange={(e) => {
                setImportCodeInput(e.target.value);
                setImportErr(null);
              }}
              rows={4}
              placeholder="Paste APXTRK:... code or JSON..."
              className="w-full p-2.5 bg-black/40 border border-white/15 focus:border-sky-400 rounded text-xs font-mono text-slate-200 outline-none resize-none"
            />

            {importErr && <div className="text-xs text-red-400 font-medium">Error: {importErr}</div>}

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
