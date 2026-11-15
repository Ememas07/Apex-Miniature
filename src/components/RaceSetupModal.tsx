import { useState } from 'react';
import { X, Users, Flag, CloudRain, Sun } from 'lucide-react';
import { CAR_CLASSES, getCarById } from '../game/cars';
import { TRACKS, compileTrack, getTrackById } from '../game/tracks';
import {
  AIDifficulty,
  CarClassId,
  RaceConfig,
  RoomState,
  TireCompound,
  TrackRegion,
  TrackSpec,
} from '../game/types';

interface RaceSetupModalProps {
  config: RaceConfig;
  room: RoomState | null;
  mpError: string | null;
  onUpdateConfig: (patch: Partial<RaceConfig>) => void;
  onCreateRoom: (driverName: string) => void;
  onJoinRoom: (code: string, driverName: string) => void;
  onLeaveRoom: () => void;
  onStartFromLobby: () => void;
  onClose: () => void;
}

type SetupTab = 'track' | 'rules' | 'multiplayer';

function TrackOutlineSvg({ track }: { track: TrackSpec }) {
  const compiled = compileTrack(track, 90);
  const xs = compiled.samples.map((s) => s.x);
  const zs = compiled.samples.map((s) => s.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const span = Math.max(maxX - minX, maxZ - minZ, 1);

  const d = compiled.samples
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
  mpError,
  onUpdateConfig,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onStartFromLobby,
  onClose,
}: RaceSetupModalProps) {
  const [tab, setTab] = useState<SetupTab>('track');
  const [regionFilter, setRegionFilter] = useState<'Flagship' | TrackRegion | 'All'>('Flagship');
  const [driverName, setDriverName] = useState('Player 1');
  const [joinCode, setJoinCode] = useState('');

  const selectedTrack = getTrackById(config.trackId);
  const playerCar = getCarById(config.playerCarId);

  const filteredTracks = TRACKS.filter((t) => {
    if (regionFilter === 'Flagship') return t.flagship;
    if (regionFilter === 'All') return true;
    return t.region === regionFilter;
  });

  const toggleClass = (cid: CarClassId) => {
    const exists = config.activeClasses.includes(cid);
    if (exists && config.activeClasses.length === 1) return; // keep at least 1 class
    if (exists) {
      // Ensure player's car class remains included or switch player's car
      const next = config.activeClasses.filter((c) => c !== cid);
      onUpdateConfig({ activeClasses: next });
    } else {
      const next = [...config.activeClasses, cid].slice(-3); // max 3 classes for clean multi-class grids
      onUpdateConfig({ activeClasses: next });
    }
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
              {selectedTrack.name} · {config.totalLaps} Laps · {config.gridSize} Cars
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
                tab === t.id
                  ? 'border-red-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
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
                  {(['Flagship', 'Americas', 'Europe', 'Asia-Pacific & Middle East', 'All'] as const).map(
                    (rf) => (
                      <button
                        key={rf}
                        type="button"
                        onClick={() => setRegionFilter(rf)}
                        className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                          regionFilter === rf
                            ? 'bg-red-600 text-white'
                            : 'bg-[#171c26] text-slate-300 hover:bg-[#1f2634]'
                        }`}
                      >
                        {rf === 'Flagship' ? 'Flagship 10' : rf}
                      </button>
                    ),
                  )}
                </div>
                <span className="text-xs text-slate-400 tabular-nums">
                  Showing {filteredTracks.length} circuits
                </span>
              </div>

              {/* Track Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredTracks.map((trk) => {
                  const active = trk.id === config.trackId;
                  return (
                    <button
                      key={trk.id}
                      type="button"
                      onClick={() => onUpdateConfig({ trackId: trk.id })}
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
            </div>
          )}

          {tab === 'rules' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Multi-Class Grid Builder */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-display font-bold text-white">Multi-Class Grid (Up to 3 Classes)</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Mix Prototypes + LMP2 + GT3 or run single-class sprints. Your car: {playerCar.name} ({CAR_CLASSES[playerCar.classId].shortName}).
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
                        <span
                          className="w-3 h-3 rounded-sm shrink-0"
                          style={{ backgroundColor: cls.plateColor }}
                        />
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
                    <label htmlFor="laps-slider" className="font-semibold text-slate-200">Race Length</label>
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

                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <label htmlFor="grid-slider" className="font-semibold text-slate-200">Total Grid Cars (AI Bot Fill)</label>
                    <span className="font-telemetry text-white">{config.gridSize} Cars</span>
                  </div>
                  <input
                    id="grid-slider"
                    type="range"
                    min={4}
                    max={24}
                    step={2}
                    value={config.gridSize}
                    onChange={(e) => onUpdateConfig({ gridSize: Number(e.target.value) })}
                    className="w-full accent-red-600 cursor-pointer"
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
                    onClick={() =>
                      onUpdateConfig({
                        weather: config.weather === 'dry' ? 'dynamic-rain' : 'dry',
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
                    onClick={() =>
                      onUpdateConfig({ qualifyingEnabled: !config.qualifyingEnabled })
                    }
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
                    Host a live room or enter a 5-letter room code. Unfilled grid slots automatically populate with personality-driven AI bots.
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
                  <div className="p-4 rounded bg-[#0d1118] border border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-slate-400">Active Room Code</div>
                        <div className="text-2xl font-display font-extrabold text-amber-400 tracking-widest">
                          {room.code}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={onLeaveRoom}
                        className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-xs text-slate-300 cursor-pointer"
                      >
                        Leave Room
                      </button>
                    </div>
                    <div className="text-xs text-slate-400">
                      Share this code with friends on the same server to race together.
                    </div>
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
                    <span>Grid Roster ({config.gridSize} Total Slots)</span>
                  </div>
                  <span className="text-xs text-slate-400 tabular-nums">
                    {room ? room.peers.length : 1} Human · {Math.max(0, config.gridSize - (room ? room.peers.length : 1))} AI Bots
                  </span>
                </div>

                <div className="space-y-1.5">
                  {room ? (
                    room.peers.map((p) => (
                      <div
                        key={p.peerId}
                        className="flex items-center justify-between px-3 py-2 rounded bg-[#151a24] border border-white/10 text-xs"
                      >
                        <span className="font-semibold text-white">
                          {p.name} {p.isHost ? '(Host)' : ''}
                        </span>
                        <span className="text-slate-400">
                          {getCarById(p.carId).name} · #{p.livery.driverNumber}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center justify-between px-3 py-2 rounded bg-[#151a24] border border-white/10 text-xs">
                      <span className="font-semibold text-white">{driverName} (Local)</span>
                      <span className="text-slate-400">
                        {playerCar.name} · #{config.playerLivery.driverNumber}
                      </span>
                    </div>
                  )}

                  <div className="pt-2 border-t border-white/10 text-xs text-slate-400 space-y-1">
                    <div className="font-semibold text-slate-300">Automatic AI Bot Personalities</div>
                    <p>
                      Late-Braker (aggressive divebombs) · Metronome (robotic consistency) · Tire-Saver (late-stint pace) · Traffic-Smart (prototypes flash headlights passing GT3).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
