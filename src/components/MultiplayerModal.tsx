import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  Check,
  CheckCircle,
  Clock,
  CloudRain,
  Copy,
  Eye,
  Flag,
  Globe,
  ListOrdered,
  Lock,
  LogOut,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  Shuffle,
  SkipForward,
  Sun,
  Trash2,
  UserX,
  Users,
  Wifi,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import {
  CAR_CLASSES,
  filterCars,
  getAllSelectableCars,
  getCarById,
  validateDriverNumber,
} from '../game/cars';
import { getSavedCustomTracks } from '../game/customTracks';
import {
  ConnectionMode,
  ExtendedRaceConfig,
  ExtendedRoomState,
  PlaylistEntry,
  getActiveMultiplayerClient,
  loadOnlineProfile,
  normalizePlaylist,
} from '../game/multiplayer';
import { generateRandomScenario } from '../game/randomScenario';
import { TRACKS, compileTrack, filterTracks, formatTargetLapMMSS, getTrackById } from '../game/tracks';
import {
  CarClassId,
  ChatMessage,
  LiveryConfig,
  LobbySummary,
  RaceConfig,
  RoomState,
  TrackRegion,
  TrackSpec,
} from '../game/types';
import { GarageViewport } from '../three/GarageViewport';
import { AiPolicyMixPanel } from './AiPolicyMixPanel';

interface MultiplayerModalProps {
  config: RaceConfig;
  room: RoomState | null;
  myPeerId?: string;
  myPingMs?: number;
  connectionMode?: ConnectionMode;
  customTracksNonce?: number;
  mpError: string | null;
  chatMessages?: ChatMessage[];
  onFetchPublicLobbies?: () => Promise<LobbySummary[]>;
  onUpdateConfig: (patch: Partial<RaceConfig>, meta?: { isPublic?: boolean; lobbyName?: string }) => void;
  onCreateRoom: (driverName: string, opts?: { isPublic?: boolean; lobbyName?: string }) => void;
  onJoinRoom: (code: string, driverName: string, opts?: { isSpectator?: boolean }) => void;
  onLeaveRoom: () => void;
  onStartFromLobby: () => void;
  onSendChat?: (text: string) => void;
  onKickPeer?: (targetPeerId: string) => void;
  onBanPeer?: (targetPeerId: string) => void;
  onVoteTrack?: (trackId: string) => void;
  onUpdatePeer?: (payload: {
    carId?: string;
    classId?: CarClassId;
    livery?: LiveryConfig;
    ready?: boolean;
    isSpectator?: boolean;
  }) => void;
  onClose: () => void;
}

const QUICK_CHAT_PHRASES = ['Good luck!', 'Ready!', 'Change track?', 'Clean T1!'];
const VOTE_TRACK_IDS = ['monza', 'spa', 'suzuka', 'silverstone', 'lemans'];

const PRESET_COLORS = [
  '#c8102e',
  '#1d4ed8',
  '#facc15',
  '#16a34a',
  '#ea580c',
  '#a855f7',
  '#f8fafc',
  '#0f172a',
];

const REGION_FILTERS: Array<'Flagship' | TrackRegion | 'All'> = [
  'Flagship',
  'Americas',
  'Europe',
  'Asia-Pacific & Middle East',
  'Custom',
  'All',
];

function TrackOutlineMini({ track }: { track: TrackSpec }) {
  const compiled = compileTrack(track, 72);
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
    <svg viewBox="0 0 120 100" className="w-16 h-12 shrink-0" aria-hidden="true">
      <path d={d} fill="none" stroke="#334155" strokeWidth="6" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={track.kerbPrimary} strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

export function MultiplayerModal({
  config,
  room,
  myPeerId,
  myPingMs = 0,
  connectionMode = 'disconnected',
  customTracksNonce,
  mpError,
  chatMessages = [],
  onFetchPublicLobbies,
  onUpdateConfig,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onStartFromLobby,
  onSendChat,
  onKickPeer,
  onBanPeer,
  onVoteTrack,
  onUpdatePeer,
  onClose,
}: MultiplayerModalProps) {
  const onlineProfile = useMemo(() => loadOnlineProfile(), []);
  const [driverName, setDriverName] = useState(onlineProfile.username || 'Player 1');
  const [lobbyName, setLobbyName] = useState(`${onlineProfile.username || 'Player 1'}'s Paddock`);
  const [isPublicRoom, setIsPublicRoom] = useState(true);
  const [joinAsSpectator, setJoinAsSpectator] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [joiningRoom, setJoiningRoom] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Public lobby browser state
  const [publicLobbies, setPublicLobbies] = useState<LobbySummary[]>([]);
  const [loadingLobbies, setLoadingLobbies] = useState(false);

  // Lobby chat state
  const [chatDraft, setChatDraft] = useState('');
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Track picker state (for pre-lobby room creation and host lobby editing)
  const [regionFilter, setRegionFilter] = useState<'Flagship' | TrackRegion | 'All'>('Flagship');
  const [trackSearch, setTrackSearch] = useState('');
  const [showHostTrackPicker, setShowHostTrackPicker] = useState(false);

  // Paddock car picker state
  const [paddockCarSearch, setPaddockCarSearch] = useState('');

  const refreshPublicLobbies = async () => {
    if (!onFetchPublicLobbies) return;
    setLoadingLobbies(true);
    try {
      const list = await onFetchPublicLobbies();
      setPublicLobbies(list);
    } finally {
      setLoadingLobbies(false);
    }
  };

  useEffect(() => {
    if (!room) {
      refreshPublicLobbies();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages.length]);

  useEffect(() => {
    if (room || mpError) {
      setCreatingRoom(false);
      setJoiningRoom(false);
    }
  }, [room, mpError]);

  const effectiveMessages = useMemo(
    () => (chatMessages.length > 0 ? chatMessages : room?.chatMessages ?? []),
    [chatMessages, room?.chatMessages],
  );

  const voteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (room?.trackVotes) {
      for (const tid of Object.values(room.trackVotes)) {
        counts[tid] = (counts[tid] || 0) + 1;
      }
    }
    return counts;
  }, [room?.trackVotes]);

  const handleQuickMatch = () => {
    const openLobby = publicLobbies.find((l) => !l.started && l.playerCount < l.maxPlayers);
    if (openLobby) {
      setJoiningRoom(true);
      onJoinRoom(openLobby.code, driverName.trim() || 'Guest Driver', { isSpectator: false });
      return;
    }
    setCreatingRoom(true);
    onCreateRoom(driverName.trim() || 'Host Driver', {
      isPublic: true,
      lobbyName: lobbyName.trim() || `${driverName.trim() || 'Host'}'s Public Grid`,
    });
  };

  const handleSendChatSubmit = (textOverride?: string) => {
    const payload = (textOverride ?? chatDraft).trim();
    if (!payload || !onSendChat) return;
    onSendChat(payload);
    if (!textOverride) setChatDraft('');
  };

  const customTracks = useMemo(() => {
    void customTracksNonce;
    return getSavedCustomTracks();
  }, [customTracksNonce]);

  const allSelectableCars = useMemo(() => getAllSelectableCars(), []);
  const filteredTracks = useMemo(
    () => filterTracks(TRACKS, customTracks, regionFilter, trackSearch),
    [customTracks, regionFilter, trackSearch],
  );
  const filteredPaddockCars = useMemo(
    () => filterCars(allSelectableCars, paddockCarSearch, 'ALL'),
    [allSelectableCars, paddockCarSearch],
  );

  const selectedTrack = config.customTrack || getTrackById(config.trackId);
  const playerCar = getCarById(config.playerCarId);
  const playerClassMeta = CAR_CLASSES[playerCar.classId];

  const extConfig = config as ExtendedRaceConfig;
  const extRoom = room as ExtendedRoomState | null;
  const mandatoryServiceStop = Boolean(extConfig.mandatoryServiceStop);
  const playlist = useMemo(
    () =>
      normalizePlaylist(
        extRoom?.config?.playlistEntries ??
          extRoom?.playlistEntries ??
          extConfig.playlistEntries ??
          extRoom?.config?.playlist ??
          extRoom?.playlist ??
          extConfig.playlist,
      ),
    [
      extRoom?.config?.playlistEntries,
      extRoom?.playlistEntries,
      extConfig.playlistEntries,
      extRoom?.config?.playlist,
      extRoom?.playlist,
      extConfig.playlist,
    ],
  );
  const playlistIndex = Math.max(
    0,
    Math.min(
      Math.max(0, playlist.length - 1),
      Number(extRoom?.config?.playlistIndex ?? extRoom?.playlistIndex ?? extConfig.playlistIndex ?? 0) || 0,
    ),
  );
  const bannedPeerIds = extRoom?.bannedPeerIds ?? [];

  const updateExtendedConfig = (patch: Partial<ExtendedRaceConfig>) => {
    onUpdateConfig(patch as Partial<RaceConfig>);
  };

  const handleAddSelectedTrackToPlaylist = () => {
    const entry: PlaylistEntry = {
      trackId: selectedTrack.id,
      trackName: selectedTrack.shortName || selectedTrack.name,
      totalLaps: config.totalLaps > 0 ? config.totalLaps : 5,
      ...(config.customTrack ? { customTrack: config.customTrack } : {}),
    };
    const next = [...playlist, entry];
    updateExtendedConfig({
      playlist: next.map((p) => p.trackId),
      playlistEntries: next,
    });
  };

  const handleRemovePlaylistItem = (indexToRemove: number) => {
    const next = playlist.filter((_, i) => i !== indexToRemove);
    updateExtendedConfig({
      playlist: next.map((p) => p.trackId),
      playlistEntries: next,
      playlistIndex: Math.min(playlistIndex, Math.max(0, next.length - 1)),
    });
  };

  const handleBanPeerClick = (targetPeerId: string) => {
    if (onBanPeer) {
      onBanPeer(targetPeerId);
      return;
    }
    getActiveMultiplayerClient()?.banPeer(targetPeerId);
  };

  const handleUnbanPeerClick = (targetPeerId: string) => {
    getActiveMultiplayerClient()?.unbanPeer(targetPeerId);
  };

  const handleAdvancePlaylistClick = () => {
    getActiveMultiplayerClient()?.advancePlaylist();
  };

  const isHost = Boolean(room && room.hostId === myPeerId);
  const myPeer = room?.peers.find((p) => p.peerId === myPeerId);
  const isReady = Boolean(myPeer?.ready);
  const readyCount = room ? room.peers.filter((p) => p.ready).length : 0;
  const aiFillCount = config.noAi ? 0 : Math.max(0, Math.min(23, config.aiBotCount ?? 11));

  const toggleClass = (cid: CarClassId) => {
    const exists = config.activeClasses.includes(cid);
    if (exists && config.activeClasses.length === 1) return;
    if (exists) {
      onUpdateConfig({ activeClasses: config.activeClasses.filter((c) => c !== cid) });
    } else {
      onUpdateConfig({ activeClasses: [...config.activeClasses, cid].slice(-3) });
    }
  };

  const handleSelectCarInLobby = (carId: string) => {
    const car = getCarById(carId);
    const nextLivery: LiveryConfig = {
      ...car.defaultLivery,
      driverNumber: config.playerLivery.driverNumber || car.defaultLivery.driverNumber,
    };

    onUpdateConfig({
      playerCarId: car.id,
      playerLivery: nextLivery,
    });
    onUpdatePeer?.({ carId: car.id, classId: car.classId, livery: nextLivery });
  };

  const handleUpdateLiveryInLobby = (patch: Partial<LiveryConfig>) => {
    const nextLivery: LiveryConfig = { ...config.playerLivery, ...patch };
    onUpdateConfig({ playerLivery: nextLivery });
    onUpdatePeer?.({ livery: nextLivery });
  };

  const handleToggleReady = () => {
    onUpdatePeer?.({ ready: !isReady });
  };

  const handleCopyRoomCode = () => {
    if (!room) return;
    navigator.clipboard?.writeText(room.code).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const handleRandomScenario = () => {
    if (room && !isHost) {
      // Guest inside lobby: randomize own car within room classes without altering host settings
      const matchingCars = allSelectableCars.filter((c) => config.activeClasses.includes(c.classId));
      const pool = matchingCars.length > 0 ? matchingCars : allSelectableCars;
      const picked = pool[Math.floor(Math.random() * pool.length)];
      handleSelectCarInLobby(picked.id);
      return;
    }

    const scenario = generateRandomScenario(
      TRACKS,
      customTracks,
      allSelectableCars,
      config.playerLivery.driverNumber,
    );
    onUpdateConfig({
      activeClasses: scenario.activeClasses,
      trackId: scenario.track.id,
      customTrack: scenario.isCustomTrack ? scenario.track : undefined,
      playerCarId: scenario.car.id,
      playerLivery: scenario.livery,
    });
    if (room) {
      onUpdatePeer?.({
        carId: scenario.car.id,
        classId: scenario.car.classId,
        livery: scenario.livery,
      });
    }
    setTrackSearch('');
    setRegionFilter('All');
  };

  const renderConnectionBadge = () => {
    if (connectionMode === 'server') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium whitespace-nowrap">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          WebSocket Connected
        </span>
      );
    }
    if (connectionMode === 'local-relay') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-amber-300 font-medium whitespace-nowrap">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          Local Multi-Tab Relay
        </span>
      );
    }
    if (connectionMode === 'connecting') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-sky-400 font-medium whitespace-nowrap">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
          Connecting...
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 font-medium whitespace-nowrap">
        <span className="w-2 h-2 rounded-full bg-slate-500" />
        Ready to Connect
      </span>
    );
  };

  return (
    <div
      data-testid="multiplayer-modal"
      role="dialog"
      aria-label="Multiplayer Rooms and Lobby"
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
            <div className="flex items-center gap-3">
              <h2 className="text-base md:text-lg font-display font-bold text-white tracking-wide whitespace-nowrap">
                MULTIPLAYER
              </h2>
              <span aria-hidden="true" className="text-slate-600 hidden sm:inline">/</span>
              <span className="hidden sm:inline">{renderConnectionBadge()}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 truncate">
              {room ? (
                <>
                  <span className="font-telemetry text-amber-400 font-semibold">Room {room.code}</span>
                  <span aria-hidden="true">·</span>
                  <span>{selectedTrack.name}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{config.totalLaps} Laps</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    {room.peers.length} {room.peers.length === 1 ? 'Driver' : 'Drivers'}
                    {aiFillCount > 0 ? ` + ${aiFillCount} AI` : ' (Humans Only)'}
                  </span>
                </>
              ) : (
                <span>Host a custom lobby or join with a 5-letter room code</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            data-testid="btn-mp-random-scenario"
            onClick={handleRandomScenario}
            title={
              room && !isHost
                ? 'Pick a random car from the lobby classes'
                : 'Prepare a random track, class mix, and car without starting'
            }
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-md bg-[#161b24] hover:bg-[#1f2736] border border-white/15 text-xs font-display font-bold text-slate-100 tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Shuffle className="w-3.5 h-3.5 text-amber-400" />
            {room && !isHost ? 'Random Car' : 'Random'}
          </button>
          {room && isHost && (
            <button
              type="button"
              data-testid="btn-mp-start-race"
              onClick={onStartFromLobby}
              className="flex items-center gap-2 px-5 py-2.5 rounded-md bg-red-600 hover:bg-red-500 text-white font-display font-bold text-sm tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-lg shadow-red-950/50"
            >
              <Flag className="w-4 h-4" />
              {config.qualifyingEnabled ? 'Start Qualifying' : 'Start Race'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Multiplayer"
            className="p-2 rounded bg-[#161b24] hover:bg-[#202836] border border-white/10 text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-5 md:p-7">
        {!room ? (
          /* ===================== PRE-LOBBY: CREATE OR JOIN ROOM ===================== */
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Driver Identity + Host / Join Actions */}
            <div className="lg:col-span-5 space-y-6">
              <div className="p-5 rounded-lg bg-[#11151d] border border-white/10 space-y-5">
                <div>
                  <h3 className="text-sm font-display font-bold text-white uppercase tracking-wide">
                    Join or Create a Room
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Every connected driver selects their own car, class, and livery in the paddock lobby before the host launches the grid.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded bg-[#0c1017] border border-white/10 text-[11px]">
                  <div className="flex items-center gap-2 text-slate-300">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Elo <strong className="font-telemetry text-white">{onlineProfile.eloRating}</strong></span>
                    <span className="text-slate-600">·</span>
                    <span>SR <strong className="font-telemetry text-emerald-300">{onlineProfile.safetyRating}%</strong></span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-400 font-telemetry">
                    <Wifi className="w-3 h-3 text-sky-400" />
                    {myPingMs > 0 ? `${myPingMs}ms` : 'LAN'}
                  </div>
                </div>

                <div>
                  <label htmlFor="mp-driver-name" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Driver Name
                  </label>
                  <input
                    id="mp-driver-name"
                    type="text"
                    maxLength={20}
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    placeholder="Player 1"
                    className="w-full px-3 py-2 rounded bg-[#0c1017] border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500"
                  />
                </div>

                {/* Quick Match & Public Lobby Browser */}
                <div className="pt-4 border-t border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-sky-400" />
                      Public Lobbies ({publicLobbies.length})
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleQuickMatch}
                        disabled={creatingRoom || joiningRoom}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-[11px] font-display font-bold text-white cursor-pointer transition-colors"
                      >
                        <Zap className="w-3 h-3" />
                        Quick Match
                      </button>
                      <button
                        type="button"
                        onClick={refreshPublicLobbies}
                        disabled={loadingLobbies}
                        aria-label="Refresh public lobbies"
                        className="p-1.5 rounded bg-[#181f2c] hover:bg-[#222c3d] border border-white/10 text-slate-300 cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 ${loadingLobbies ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>
                  {publicLobbies.length === 0 ? (
                    <div className="p-2.5 rounded bg-[#0c1017] border border-white/10 text-[11px] text-slate-400 text-center">
                      No open public lobbies yet — click <span className="text-sky-300 font-semibold">Quick Match</span> or host one below.
                    </div>
                  ) : (
                    <div className="max-h-36 overflow-y-auto custom-scroll space-y-1.5 pr-1">
                      {publicLobbies.map((lobby) => {
                        const trk = getTrackById(lobby.trackId);
                        return (
                          <div
                            key={lobby.code}
                            className="flex items-center justify-between gap-2 px-2.5 py-2 rounded bg-[#0d121b] border border-white/10 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="font-semibold text-white truncate flex items-center gap-1.5">
                                <span className="truncate">{lobby.name}</span>
                                {lobby.started && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                                    IN RACE
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate">
                                {trk.name} · {lobby.playerCount}/{lobby.maxPlayers} · Host: {lobby.hostName}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setJoiningRoom(true);
                                onJoinRoom(lobby.code, driverName.trim() || 'Guest Driver', {
                                  isSpectator: lobby.started || joinAsSpectator,
                                });
                              }}
                              className="px-2.5 py-1 rounded bg-red-600/90 hover:bg-red-500 text-[11px] font-semibold text-white cursor-pointer shrink-0"
                            >
                              {lobby.started ? 'Spectate' : 'Join'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Host Room Action */}
                <div className="pt-4 border-t border-white/10 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200">Host New Room</span>
                    <button
                      type="button"
                      onClick={() => setIsPublicRoom((v) => !v)}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold cursor-pointer ${
                        isPublicRoom
                          ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                          : 'bg-[#161c28] border-white/15 text-slate-300'
                      }`}
                    >
                      {isPublicRoom ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                      {isPublicRoom ? 'Public Lobby' : 'Private Code'}
                    </button>
                  </div>
                  <input
                    type="text"
                    maxLength={32}
                    value={lobbyName}
                    onChange={(e) => setLobbyName(e.target.value)}
                    placeholder="Lobby title (e.g. Monza GT3 Sprint)"
                    className="w-full px-3 py-1.5 rounded bg-[#0c1017] border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500"
                  />
                  <button
                    type="button"
                    data-testid="btn-create-room"
                    onClick={() => {
                      setCreatingRoom(true);
                      onCreateRoom(driverName.trim() || 'Host Driver', {
                        isPublic: isPublicRoom,
                        lobbyName: lobbyName.trim() || `${driverName.trim() || 'Host'}'s Paddock`,
                      });
                    }}
                    disabled={creatingRoom}
                    className="w-full py-3 px-4 rounded-md bg-red-600 hover:bg-red-500 disabled:opacity-50 text-sm font-display font-bold text-white cursor-pointer transition-colors shadow-lg shadow-red-950/40"
                  >
                    {creatingRoom ? 'Creating Room...' : 'Create Multiplayer Room'}
                  </button>
                </div>

                {/* Join Room Action */}
                <div className="pt-4 border-t border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="mp-join-code" className="block text-xs font-semibold text-slate-200">
                      Join by Room Code
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={joinAsSpectator}
                        onChange={(e) => setJoinAsSpectator(e.target.checked)}
                        className="accent-sky-500 cursor-pointer"
                      />
                      <Eye className="w-3 h-3 text-sky-400" />
                      Spectator
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <input
                      id="mp-join-code"
                      type="text"
                      data-testid="input-join-code"
                      placeholder="APX42"
                      maxLength={6}
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      className="flex-1 px-3 py-2.5 rounded bg-[#0c1017] border border-white/15 text-sm font-telemetry uppercase tracking-widest text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500"
                    />
                    <button
                      type="button"
                      data-testid="btn-join-room"
                      onClick={() => {
                        setJoiningRoom(true);
                        onJoinRoom(joinCode.trim(), driverName.trim() || 'Guest Driver', {
                          isSpectator: joinAsSpectator,
                        });
                      }}
                      disabled={joiningRoom || joinCode.trim().length < 4}
                      className="px-5 py-2.5 rounded bg-[#1d2534] hover:bg-[#263144] disabled:opacity-40 border border-white/15 text-xs font-semibold text-white cursor-pointer transition-colors whitespace-nowrap"
                    >
                      {joiningRoom ? 'Joining...' : joinAsSpectator ? 'Spectate' : 'Join Room'}
                    </button>
                  </div>
                </div>

                {mpError && (
                  <div className="p-3 rounded bg-red-950/60 border border-red-500/40 text-xs text-red-200">
                    {mpError}
                  </div>
                )}
              </div>

              {/* Current Vehicle Preview Card */}
              <div className="p-4 rounded-lg bg-[#11151d] border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">Your Entry Car</span>
                  <span
                    className="px-1.5 py-0.5 text-[10px] font-display font-bold rounded-sm"
                    style={{ backgroundColor: playerClassMeta.plateColor, color: playerClassMeta.badgeTextColor }}
                  >
                    {playerClassMeta.shortName}
                  </span>
                </div>
                <div className="h-36 w-full rounded overflow-hidden relative bg-[#090c12] border border-white/10">
                  <GarageViewport carSpec={playerCar} livery={config.playerLivery} autoRotate={true} />
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="text-white font-semibold truncate">{playerCar.name}</span>
                  <span className="font-telemetry">#{config.playerLivery.driverNumber}</span>
                </div>
              </div>
            </div>

            {/* Right Column: Room Creation Settings */}
            <div className="lg:col-span-7 p-5 rounded-lg bg-[#11151d] border border-white/10 space-y-5">
              <div>
                <h3 className="text-sm font-display font-bold text-white uppercase tracking-wide">
                  Room Creation Settings
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure track, race rules, and AI grid fill before hosting (can also be adjusted inside the lobby).
                </p>
              </div>

              {/* Race Rules Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Race Laps</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[3, 5, 10, 15, 20].map((laps) => (
                      <button
                        key={laps}
                        type="button"
                        onClick={() => onUpdateConfig({ totalLaps: laps, sessionMode: 'race' })}
                        className={`py-1.5 rounded text-xs font-telemetry font-bold border cursor-pointer transition-colors ${
                          config.totalLaps === laps
                            ? 'bg-red-600 border-red-400 text-white'
                            : 'bg-[#151a24] border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {laps}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Conditions & Format
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateConfig({
                          weather: config.weather === 'dynamic-rain' ? 'dry' : 'dynamic-rain',
                        })
                      }
                      className="flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded border border-white/15 bg-[#151a24] hover:bg-[#1c2330] text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap"
                    >
                      {config.weather === 'dynamic-rain' ? (
                        <>
                          <CloudRain className="w-3.5 h-3.5 text-sky-400" />
                          Rain
                        </>
                      ) : (
                        <>
                          <Sun className="w-3.5 h-3.5 text-amber-400" />
                          Dry
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateConfig({ qualifyingEnabled: !config.qualifyingEnabled })}
                      className={`py-1.5 px-2.5 rounded border text-xs font-semibold cursor-pointer whitespace-nowrap ${
                        config.qualifyingEnabled
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                          : 'bg-[#151a24] border-white/15 text-slate-300'
                      }`}
                    >
                      Quali: {config.qualifyingEnabled ? 'ON' : 'OFF'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateConfig({
                          startType: (config.startType ?? 'standing') === 'rolling' ? 'standing' : 'rolling',
                        })
                      }
                      className={`py-1.5 px-2.5 rounded border text-xs font-semibold cursor-pointer whitespace-nowrap ${
                        config.startType === 'rolling'
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                          : 'bg-[#151a24] border-white/15 text-slate-300'
                      }`}
                    >
                      Start: {config.startType === 'rolling' ? 'Rolling' : 'Standing'}
                    </button>
                    <button
                      type="button"
                      data-testid="btn-mp-mandatory-service"
                      onClick={() => updateExtendedConfig({ mandatoryServiceStop: !mandatoryServiceStop })}
                      className={`flex items-center justify-center gap-1 py-1.5 px-2.5 rounded border text-xs font-semibold cursor-pointer whitespace-nowrap ${
                        mandatoryServiceStop
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                          : 'bg-[#151a24] border-white/15 text-slate-300'
                      }`}
                    >
                      <Wrench className="w-3 h-3" />
                      Service: {mandatoryServiceStop ? 'Mandatory' : 'Optional'}
                    </button>
                  </div>
                </div>
              </div>

              {/* AI Fill & Multi-Class Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-white/10">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300">AI Bot Fill</span>
                    <span className="font-telemetry text-amber-300 font-bold">
                      {aiFillCount === 0 ? 'Humans Only (0 AI)' : `${aiFillCount} AI Bots`}
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label="Multiplayer AI Bot Fill"
                    min={0}
                    max={23}
                    value={aiFillCount}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      onUpdateConfig({
                        aiBotCount: val,
                        noAi: val === 0,
                        gridSize: val + 1,
                        sessionMode: 'race',
                      });
                    }}
                    className="w-full accent-red-600 cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const nextNoAi = !config.noAi;
                      onUpdateConfig({
                        noAi: nextNoAi,
                        aiBotCount: nextNoAi ? 0 : 11,
                        gridSize: nextNoAi ? 1 : 12,
                        sessionMode: 'race',
                      });
                    }}
                    className={`px-2.5 py-1 rounded border text-[11px] font-semibold cursor-pointer ${
                      config.noAi
                        ? 'bg-amber-600 border-amber-400 text-white'
                        : 'bg-[#151a24] border-white/10 text-slate-300 hover:text-white'
                    }`}
                  >
                    {config.noAi ? 'Humans Only: ON' : 'Humans Only: OFF'}
                  </button>
                </div>

                <div className="space-y-2">
                  <span className="block text-xs font-semibold text-slate-300">Grid Classes (up to 3)</span>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.values(CAR_CLASSES).map((cls) => {
                      const active = config.activeClasses.includes(cls.id);
                      return (
                        <button
                          key={cls.id}
                          type="button"
                          onClick={() => toggleClass(cls.id)}
                          className={`px-2 py-1 rounded text-[11px] font-display font-bold border cursor-pointer whitespace-nowrap ${
                            active
                              ? 'border-white/60'
                              : 'bg-[#151a24] border-white/10 text-slate-500 hover:text-slate-300'
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
              </div>

              {aiFillCount > 0 && <AiPolicyMixPanel compact={true} />}

              {/* Circuit Selector */}
              <div className="pt-3 border-t border-white/10 space-y-3">
                <div className="p-3 rounded border border-white/10 bg-[#0d1118] flex items-center justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-[11px] text-slate-400 truncate">
                      Selected: <span className="text-white font-semibold">{selectedTrack.name}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {selectedTrack.city ? `${selectedTrack.city} · ` : ''}
                      {selectedTrack.country}
                      {selectedTrack.circuitLengthKm ? ` · ${selectedTrack.circuitLengthKm.toFixed(2)} km` : ''}
                      {` · Est. ${formatTargetLapMMSS(selectedTrack.targetLapSeconds)}`}
                    </div>
                    {selectedTrack.circuitInfo && (
                      <div className="text-[10px] text-slate-500 line-clamp-1">{selectedTrack.circuitInfo}</div>
                    )}
                  </div>
                  <TrackOutlineMini track={selectedTrack} />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-200">
                    Room Circuit
                  </span>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={trackSearch}
                      onChange={(e) => setTrackSearch(e.target.value)}
                      placeholder="Search circuits..."
                      aria-label="Search room circuits"
                      className="pl-8 pr-7 py-1.5 rounded bg-[#0c1017] border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500"
                    />
                    {trackSearch && (
                      <button
                        type="button"
                        onClick={() => setTrackSearch('')}
                        aria-label="Clear circuit search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {REGION_FILTERS.map((rf) => (
                    <button
                      key={rf}
                      type="button"
                      onClick={() => setRegionFilter(rf)}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                        regionFilter === rf
                          ? 'bg-red-600 text-white'
                          : 'bg-[#161c28] text-slate-300 hover:bg-[#1e2636]'
                      }`}
                    >
                      {rf === 'Flagship' ? 'Flagship 10' : rf === 'Custom' ? `Custom (${customTracks.length})` : rf}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto custom-scroll pr-1">
                  {filteredTracks.map((trk) => {
                    const isCustom = trk.region === 'Custom';
                    const active = trk.id === config.trackId && (isCustom ? Boolean(config.customTrack) : !config.customTrack);
                    return (
                      <button
                        key={trk.id}
                        type="button"
                        onClick={() =>
                          onUpdateConfig({
                            trackId: trk.id,
                            customTrack: isCustom ? trk : undefined,
                          })
                        }
                        className={`flex items-center justify-between gap-2 p-2.5 rounded border text-left transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#1c2434] border-red-500 text-white'
                            : 'bg-[#151a24] border-white/10 text-slate-300 hover:bg-[#1a202d]'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">{trk.name}</div>
                          <div className="text-[11px] text-slate-400 truncate mt-0.5">
                            {trk.city ? `${trk.city} · ` : ''}
                            {trk.country}
                          </div>
                          <div className="text-[10px] font-telemetry text-slate-400 truncate mt-0.5">
                            {trk.circuitLengthKm ? `${trk.circuitLengthKm.toFixed(2)} km · ` : ''}
                            {trk.corners}T · ~{formatTargetLapMMSS(trk.targetLapSeconds)}
                          </div>
                        </div>
                        <TrackOutlineMini track={trk} />
                      </button>
                    );
                  })}
                </div>

                {/* Multi-Track Championship Playlist Builder */}
                <div className="pt-3 border-t border-white/10 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <ListOrdered className="w-3.5 h-3.5 text-amber-400" />
                      Multi-Track Playlist ({playlist.length})
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        data-testid="btn-add-playlist-track"
                        onClick={handleAddSelectedTrackToPlaylist}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-600/25 hover:bg-amber-600/40 border border-amber-400/40 text-[11px] font-semibold text-amber-200 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        Add {selectedTrack.shortName}
                      </button>
                      {playlist.length > 0 && (
                        <button
                          type="button"
                          onClick={() => updateExtendedConfig({ playlist: [], playlistEntries: [], playlistIndex: 0 })}
                          className="px-2 py-1 rounded bg-[#181f2c] hover:bg-rose-950/60 border border-white/10 text-[11px] text-slate-400 hover:text-rose-200 cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  {playlist.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {playlist.map((item, idx) => {
                        const label = item.trackName || getTrackById(item.trackId).shortName || item.trackId;
                        return (
                          <span
                            key={`${item.trackId}-${idx}`}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-[#161c28] border border-white/10 text-[11px] text-slate-200"
                          >
                            <span className="font-telemetry text-amber-400 font-bold">R{idx + 1}</span>
                            <span>{label}</span>
                            {item.totalLaps && <span className="text-slate-500">· {item.totalLaps}L</span>}
                            <button
                              type="button"
                              onClick={() => handleRemovePlaylistItem(idx)}
                              aria-label={`Remove round ${idx + 1}`}
                              className="text-slate-400 hover:text-rose-300 cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ===================== ACTIVE ROOM LOBBY ===================== */
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Room Code, Connected Roster & Host Settings */}
            <div className="lg:col-span-7 space-y-5">
              {/* Room Code & Readiness Header */}
              <div className="p-5 rounded-lg bg-[#11151d] border border-white/10 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-400">Active Room Code</div>
                  <div className="flex items-center gap-2.5 mt-0.5">
                    <span
                      data-testid="active-room-code"
                      className="text-3xl font-display font-extrabold text-amber-400 tracking-widest"
                    >
                      {room.code}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyRoomCode}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#181f2c] hover:bg-[#222c3d] border border-white/10 text-xs text-slate-200 cursor-pointer whitespace-nowrap"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedCode ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="btn-toggle-ready"
                    onClick={handleToggleReady}
                    className={`px-4 py-2 rounded text-xs font-display font-bold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                      isReady
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : 'bg-amber-600 hover:bg-amber-500 text-white'
                    }`}
                  >
                    {isReady ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                    {isReady ? 'READY' : 'MARK READY'}
                  </button>
                  <button
                    type="button"
                    data-testid="btn-leave-room"
                    onClick={onLeaveRoom}
                    className="flex items-center gap-1.5 px-3 py-2 rounded bg-[#181f2c] hover:bg-red-950/70 border border-white/10 hover:border-red-500/40 text-xs font-semibold text-slate-300 hover:text-red-200 cursor-pointer transition-colors whitespace-nowrap"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Leave Room
                  </button>
                </div>
              </div>

              {mpError && (
                <div className="p-3 rounded bg-red-950/60 border border-red-500/40 text-xs text-red-200">
                  {mpError}
                </div>
              )}

              {/* Connected Driver Roster */}
              <div className="p-5 rounded-lg bg-[#11151d] border border-white/10 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-display font-bold uppercase tracking-wide text-white">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span>
                      Lobby Drivers ({room.peers.length} Human{room.peers.length === 1 ? '' : 's'})
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 tabular-nums">
                    <span>
                      {readyCount}/{room.peers.length} Ready
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{aiFillCount === 0 ? 'Zero AI Bots' : `+ ${aiFillCount} AI Fill`}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  {room.peers.map((p) => {
                    const peerCar = getCarById(p.carId || 'ferrari-499p');
                    const peerClass =
                      CAR_CLASSES[p.classId as CarClassId] ||
                      CAR_CLASSES[peerCar.classId] ||
                      CAR_CLASSES[CarClassId.HYPERCAR_GTP];
                    const pingVal = p.peerId === myPeerId ? myPingMs : p.pingMs ?? 0;
                    const pingTone =
                      pingVal > 220 ? 'text-rose-400' : pingVal > 100 ? 'text-amber-300' : 'text-emerald-400';
                    return (
                      <div
                        key={p.peerId}
                        className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded bg-[#151a24] border border-white/10 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/30"
                            style={{ backgroundColor: p.livery.primaryColor || '#dc2626' }}
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-white truncate flex items-center gap-1.5">
                              <span className="truncate">{p.name}</span>
                              {p.isHost && <span className="text-amber-400 font-normal">(Director)</span>}
                              {p.peerId === myPeerId && <span className="text-sky-400 font-normal">(You)</span>}
                              {p.isSpectator && (
                                <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[9px] font-bold">
                                  SPECTATOR
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {peerCar.name} · #{p.livery.driverNumber} · Elo {p.eloRating ?? 1200} · SR{' '}
                              {p.safetyRating ?? 80}%
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`font-telemetry text-[10px] ${pingTone}`}>
                            {pingVal > 0 ? `${pingVal}ms` : 'LAN'}
                          </span>
                          <span
                            className="px-1.5 py-0.5 rounded-sm text-[10px] font-display font-bold"
                            style={{ backgroundColor: peerClass.plateColor, color: peerClass.badgeTextColor }}
                          >
                            {peerClass.shortName}
                          </span>
                          <span
                            className={`text-[11px] font-bold tracking-wide ${
                              p.ready ? 'text-emerald-400' : 'text-amber-300'
                            }`}
                          >
                            {p.isSpectator ? 'WATCHING' : p.ready ? 'READY' : 'CHOOSING'}
                          </span>
                          {isHost && p.peerId !== myPeerId && onKickPeer && (
                            <button
                              type="button"
                              onClick={() => onKickPeer(p.peerId)}
                              title={`Remove ${p.name} from lobby`}
                              aria-label={`Kick ${p.name}`}
                              className="p-1 rounded bg-rose-950/60 hover:bg-rose-800/70 border border-rose-500/30 text-rose-300 cursor-pointer"
                            >
                              <UserX className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isHost && p.peerId !== myPeerId && (
                            <button
                              type="button"
                              data-testid={`btn-ban-peer-${p.peerId}`}
                              onClick={() => handleBanPeerClick(p.peerId)}
                              title={`Ban ${p.name} from rejoining this session`}
                              aria-label={`Ban ${p.name}`}
                              className="p-1 rounded bg-red-950/80 hover:bg-red-700/80 border border-red-500/40 text-red-200 cursor-pointer"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Track Vote & Lobby Chat */}
              <div className="p-4 rounded-lg bg-[#11151d] border border-white/10 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-display font-bold uppercase tracking-wide text-white">
                    <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
                    Paddock Chat & Circuit Vote
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {VOTE_TRACK_IDS.map((tid) => {
                      const trk = getTrackById(tid);
                      const votes = voteCounts[tid] || 0;
                      const myVote = room.trackVotes?.[myPeerId || ''] === tid;
                      return (
                        <button
                          key={tid}
                          type="button"
                          onClick={() => {
                            onVoteTrack?.(tid);
                            if (isHost) {
                              onUpdateConfig({ trackId: tid, customTrack: undefined });
                            }
                          }}
                          className={`px-2 py-0.5 rounded border text-[10px] font-semibold cursor-pointer ${
                            myVote || config.trackId === tid
                              ? 'bg-sky-600/25 border-sky-400 text-sky-200'
                              : 'bg-[#151a24] border-white/10 text-slate-400 hover:text-white'
                          }`}
                        >
                          {trk.name.split(' ')[0]}
                          {votes > 0 ? ` (${votes})` : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div
                  ref={chatScrollRef}
                  className="h-28 overflow-y-auto custom-scroll rounded bg-[#0b0f17] border border-white/10 p-2.5 space-y-1.5 text-xs"
                >
                  {effectiveMessages.length === 0 ? (
                    <div className="text-[11px] text-slate-500 italic">
                      No messages yet — say hello or vote for the next circuit.
                    </div>
                  ) : (
                    effectiveMessages.map((m) => (
                      <div key={m.id} className={m.isSystem ? 'text-amber-300/90 text-[11px]' : 'text-slate-200'}>
                        <span className="font-semibold text-sky-300 mr-1.5">{m.senderName}:</span>
                        <span>{m.text}</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex flex-wrap gap-1">
                  {QUICK_CHAT_PHRASES.map((phrase) => (
                    <button
                      key={phrase}
                      type="button"
                      onClick={() => handleSendChatSubmit(phrase)}
                      className="px-2 py-0.5 rounded bg-[#161d2b] hover:bg-[#1f293d] border border-white/10 text-[10px] text-slate-300 cursor-pointer"
                    >
                      {phrase}
                    </button>
                  ))}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendChatSubmit();
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    maxLength={140}
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    placeholder="Message paddock..."
                    className="flex-1 px-3 py-1.5 rounded bg-[#0c1017] border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                  />
                  <button
                    type="submit"
                    disabled={!chatDraft.trim()}
                    className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-xs font-semibold text-white cursor-pointer flex items-center gap-1"
                  >
                    <Send className="w-3 h-3" />
                    Send
                  </button>
                </form>
              </div>

              {/* Room Settings (Editable for Host, Read-Only for Guest) */}
              <div className="p-5 rounded-lg bg-[#11151d] border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-display font-bold uppercase tracking-wide text-white">
                    {isHost ? 'Host Room Settings' : 'Room Race Settings'}
                  </h3>
                  {isHost ? (
                    <button
                      type="button"
                      onClick={() => setShowHostTrackPicker((v) => !v)}
                      className="text-xs font-semibold text-sky-400 hover:text-sky-300 cursor-pointer"
                    >
                      {showHostTrackPicker ? 'Hide Track Picker' : 'Change Circuit'}
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-400">Controlled by Host</span>
                  )}
                </div>

                {/* Summary Strip */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                  <span className="font-semibold text-white">{selectedTrack.name}</span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="tabular-nums">{config.totalLaps} Laps</span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span>{config.weather === 'dynamic-rain' ? 'Dynamic Rain' : 'Dry Clear'}</span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span>{config.qualifyingEnabled ? '1-Lap Quali' : 'Grid Start'}</span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="tabular-nums">
                    {aiFillCount === 0 ? 'Humans Only' : `${aiFillCount} AI Fill`}
                  </span>
                  {mandatoryServiceStop && (
                    <>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-[10px] font-bold">
                        Mandatory Service Stop
                      </span>
                    </>
                  )}
                  {playlist.length > 0 && (
                    <>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-200 text-[10px] font-bold">
                        Playlist R{playlistIndex + 1}/{playlist.length}
                      </span>
                    </>
                  )}
                </div>

                {isHost && (
                  <div className="space-y-4 pt-3 border-t border-white/10">
                    {showHostTrackPicker && (
                      <div className="space-y-2.5 pb-3 border-b border-white/10">
                        <div className="flex flex-wrap gap-1.5">
                          {REGION_FILTERS.map((rf) => (
                            <button
                              key={rf}
                              type="button"
                              onClick={() => setRegionFilter(rf)}
                              className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                                regionFilter === rf
                                  ? 'bg-red-600 text-white'
                                  : 'bg-[#161c28] text-slate-300 hover:bg-[#1e2636]'
                              }`}
                            >
                              {rf === 'Flagship' ? 'Flagship 10' : rf}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto custom-scroll pr-1">
                          {filteredTracks.map((trk) => {
                            const isCustom = trk.region === 'Custom';
                            const active = trk.id === config.trackId;
                            return (
                              <button
                                key={trk.id}
                                type="button"
                                onClick={() =>
                                  onUpdateConfig({
                                    trackId: trk.id,
                                    customTrack: isCustom ? trk : undefined,
                                  })
                                }
                                className={`px-3 py-2 rounded border text-left text-xs transition-colors cursor-pointer ${
                                  active
                                    ? 'bg-[#1c2434] border-red-500 text-white font-semibold'
                                    : 'bg-[#151a24] border-white/10 text-slate-300 hover:bg-[#1a202d]'
                                }`}
                              >
                                <div className="truncate font-semibold">{trk.name}</div>
                                <div className="text-[10px] text-slate-400 truncate">
                                  {trk.city ? `${trk.city}, ${trk.country}` : trk.country}
                                  {' · '}
                                  ~{formatTargetLapMMSS(trk.targetLapSeconds)}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <span className="block text-[11px] text-slate-400 mb-1.5">Race Laps</span>
                        <div className="grid grid-cols-5 gap-1">
                          {[3, 5, 10, 15, 20].map((laps) => (
                            <button
                              key={laps}
                              type="button"
                              onClick={() => onUpdateConfig({ totalLaps: laps })}
                              className={`py-1 rounded text-xs font-telemetry font-bold border cursor-pointer ${
                                config.totalLaps === laps
                                  ? 'bg-red-600 border-red-400 text-white'
                                  : 'bg-[#151a24] border-white/10 text-slate-400 hover:text-white'
                              }`}
                            >
                              {laps}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="block text-[11px] text-slate-400 mb-1.5">Weather & Quali</span>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateConfig({
                                weather: config.weather === 'dynamic-rain' ? 'dry' : 'dynamic-rain',
                              })
                            }
                            className="py-1 px-2 rounded border border-white/15 bg-[#151a24] text-xs font-semibold text-slate-200 cursor-pointer"
                          >
                            {config.weather === 'dynamic-rain' ? 'Rain' : 'Dry'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateConfig({ qualifyingEnabled: !config.qualifyingEnabled })}
                            className={`py-1 px-2 rounded border text-xs font-semibold cursor-pointer ${
                              config.qualifyingEnabled
                                ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                                : 'bg-[#151a24] border-white/15 text-slate-300'
                            }`}
                          >
                            Quali: {config.qualifyingEnabled ? 'ON' : 'OFF'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateConfig({
                                startType: (config.startType ?? 'standing') === 'rolling' ? 'standing' : 'rolling',
                              })
                            }
                            className={`py-1 px-2 rounded border text-xs font-semibold cursor-pointer ${
                              config.startType === 'rolling'
                                ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                                : 'bg-[#151a24] border-white/15 text-slate-300'
                            }`}
                          >
                            Start: {config.startType === 'rolling' ? 'Rolling' : 'Standing'}
                          </button>
                          <button
                            type="button"
                            data-testid="btn-lobby-mandatory-service"
                            onClick={() => updateExtendedConfig({ mandatoryServiceStop: !mandatoryServiceStop })}
                            className={`py-1 px-2 rounded border text-xs font-semibold cursor-pointer ${
                              mandatoryServiceStop
                                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                                : 'bg-[#151a24] border-white/15 text-slate-300'
                            }`}
                          >
                            Service: {mandatoryServiceStop ? 'Mandatory' : 'Off'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Host AI Fill Controls */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-semibold">AI Bot Fill (0–23)</span>
                        <div className="flex items-center gap-2">
                          <span className="font-telemetry text-amber-300 font-bold">
                            {aiFillCount === 0 ? '0 (Humans Only)' : `${aiFillCount} Bots`}
                          </span>
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
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                              config.noAi
                                ? 'bg-amber-600 text-white'
                                : 'bg-[#1c2433] border border-white/15 text-slate-300'
                            }`}
                          >
                            {config.noAi ? 'Humans Only ON' : 'Humans Only OFF'}
                          </button>
                        </div>
                      </div>
                      <input
                        type="range"
                        aria-label="Host AI Bot Count"
                        min={0}
                        max={23}
                        value={aiFillCount}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          onUpdateConfig({
                            aiBotCount: val,
                            noAi: val === 0,
                            gridSize: room.peers.length + val,
                          });
                        }}
                        className="w-full accent-red-600 cursor-pointer"
                      />
                    </div>

                    {/* Host Playlist Rotation & Ban Management */}
                    <div className="pt-3 border-t border-white/10 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                          <ListOrdered className="w-3.5 h-3.5 text-amber-400" />
                          Championship Playlist ({playlist.length})
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={handleAddSelectedTrackToPlaylist}
                            className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-600/25 hover:bg-amber-600/40 border border-amber-400/40 text-[11px] font-semibold text-amber-200 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            Add Current
                          </button>
                          {playlist.length > 0 && (
                            <button
                              type="button"
                              data-testid="btn-advance-playlist"
                              onClick={handleAdvancePlaylistClick}
                              className="flex items-center gap-1 px-2 py-0.5 rounded bg-sky-600/25 hover:bg-sky-600/40 border border-sky-400/40 text-[11px] font-semibold text-sky-200 cursor-pointer"
                            >
                              <SkipForward className="w-3 h-3" />
                              Next Round
                            </button>
                          )}
                        </div>
                      </div>
                      {playlist.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {playlist.map((item, idx) => {
                            const label = item.trackName || getTrackById(item.trackId).shortName || item.trackId;
                            const isCurrent = idx === playlistIndex;
                            return (
                              <span
                                key={`${item.trackId}-${idx}`}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] ${
                                  isCurrent
                                    ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-semibold'
                                    : 'bg-[#161c28] border-white/10 text-slate-300'
                                }`}
                              >
                                <span className="font-telemetry">R{idx + 1}</span>
                                <span>{label}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemovePlaylistItem(idx)}
                                  aria-label={`Remove playlist round ${idx + 1}`}
                                  className="text-slate-400 hover:text-rose-300 cursor-pointer ml-0.5"
                                >
                                  <Trash2 className="w-2.5 h-2.5" />
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {bannedPeerIds.length > 0 && (
                        <div className="pt-2 border-t border-white/10 space-y-1.5">
                          <span className="text-[11px] font-semibold text-rose-300 flex items-center gap-1">
                            <Ban className="w-3 h-3" />
                            Session Ban List ({bannedPeerIds.length})
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {bannedPeerIds.map((bid) => (
                              <button
                                key={bid}
                                type="button"
                                onClick={() => handleUnbanPeerClick(bid)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/60 hover:bg-rose-900/70 border border-rose-500/30 text-[10px] text-rose-200 cursor-pointer"
                                title={`Unban ${bid}`}
                              >
                                <span>{bid}</span>
                                <X className="w-2.5 h-2.5" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Your Paddock Car & Livery */}
            <div className="lg:col-span-5 p-5 rounded-lg bg-[#11151d] border border-white/10 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-display font-bold text-white">Your Paddock Entry</h3>
                  <p className="text-xs text-slate-400">Synced live to all drivers in room</p>
                </div>
                <span
                  className="px-2 py-0.5 rounded-sm text-[10px] font-display font-bold"
                  style={{
                    backgroundColor: playerClassMeta.plateColor,
                    color: playerClassMeta.badgeTextColor,
                  }}
                >
                  {playerClassMeta.shortName}
                </span>
              </div>

              {/* 3D Turntable */}
              <div className="h-44 w-full rounded-md overflow-hidden relative bg-[#090c12] border border-white/10">
                <GarageViewport carSpec={playerCar} livery={config.playerLivery} autoRotate={true} />
                <div className="absolute bottom-2 right-2 text-[10px] text-slate-300 bg-[#090c12]/85 px-2 py-0.5 rounded border border-white/10 pointer-events-none">
                  Drag to spin
                </div>
              </div>

              {/* Searchable Car Picker */}
              <div className="space-y-2" data-testid="paddock-car-select">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="paddock-car-search" className="text-slate-300 font-semibold truncate pr-2">
                    Car: {playerCar.name}
                  </label>
                  <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                    {filteredPaddockCars.length}/{allSelectableCars.length}
                  </span>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="paddock-car-search"
                    type="text"
                    value={paddockCarSearch}
                    onChange={(e) => setPaddockCarSearch(e.target.value)}
                    placeholder="Search car model, brand, or class..."
                    aria-label="Search paddock car models"
                    className="w-full pl-8 pr-8 py-1.5 rounded bg-[#0c1017] border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500"
                  />
                  {paddockCarSearch.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPaddockCarSearch('')}
                      aria-label="Clear paddock car search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {filteredPaddockCars.length === 0 ? (
                  <div className="p-3 rounded border border-dashed border-white/15 bg-[#0e131c] text-center space-y-1.5">
                    <p className="text-[11px] text-slate-300">No cars match &ldquo;{paddockCarSearch}&rdquo;.</p>
                    <button
                      type="button"
                      onClick={() => setPaddockCarSearch('')}
                      className="px-2.5 py-1 rounded bg-red-600 text-[11px] font-semibold text-white cursor-pointer"
                    >
                      Clear search
                    </button>
                  </div>
                ) : (
                  <div className="max-h-44 overflow-y-auto custom-scroll space-y-1 pr-1">
                    {filteredPaddockCars.map((c) => {
                      const selected = c.id === config.playerCarId;
                      const clsMeta = CAR_CLASSES[c.classId];
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectCarInLobby(c.id)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded border text-left text-xs transition-colors cursor-pointer ${
                            selected
                              ? 'bg-[#1c2434] border-red-500 text-white'
                              : 'bg-[#151a24] border-white/5 text-slate-300 hover:bg-[#19202b]'
                          }`}
                        >
                          <span className="truncate pr-2 font-medium">{c.name}</span>
                          <span
                            className="px-1.5 py-0.5 text-[10px] font-bold rounded-sm shrink-0"
                            style={{ backgroundColor: clsMeta.plateColor, color: clsMeta.badgeTextColor }}
                          >
                            {clsMeta.shortName}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quick Paint & Driver Number */}
              <div className="pt-3 border-t border-white/10 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="block text-[11px] text-slate-400 mb-1.5">Primary Color</span>
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_COLORS.map((col) => (
                        <button
                          key={col}
                          type="button"
                          onClick={() => handleUpdateLiveryInLobby({ primaryColor: col })}
                          className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                            config.playerLivery.primaryColor.toLowerCase() === col.toLowerCase()
                              ? 'border-white scale-110'
                              : 'border-transparent opacity-85 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: col }}
                          aria-label={`Color ${col}`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <label htmlFor="mp-driver-num" className="block text-[11px] text-slate-400 mb-1.5">
                      Number
                    </label>
                    <input
                      id="mp-driver-num"
                      type="text"
                      inputMode="numeric"
                      maxLength={3}
                      value={config.playerLivery.driverNumber}
                      onChange={(e) =>
                        handleUpdateLiveryInLobby({
                          driverNumber: e.target.value.replace(/[^0-9]/g, '').slice(0, 3),
                        })
                      }
                      onBlur={() =>
                        handleUpdateLiveryInLobby({
                          driverNumber: validateDriverNumber(config.playerLivery.driverNumber),
                        })
                      }
                      className="w-16 px-2 py-1 rounded bg-[#0c1017] border border-white/15 text-center font-display font-bold text-sm text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Lobby Footer (when in an active room) */}
      {room && (
        <div className="px-5 md:px-7 py-3.5 bg-[#0d1118] border-t border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-300">
            <span className="font-semibold text-white">Room {room.code}</span>
            <span className="mx-2 text-slate-600">·</span>
            <span className="tabular-nums">
              {readyCount} of {room.peers.length} drivers ready
            </span>
          </div>
          {isHost ? (
            <button
              type="button"
              onClick={onStartFromLobby}
              className="flex items-center gap-2 px-6 py-2.5 rounded-md bg-red-600 hover:bg-red-500 text-white font-display font-bold text-xs tracking-wide cursor-pointer whitespace-nowrap shadow-lg shadow-red-950/50"
            >
              <Flag className="w-3.5 h-3.5" />
              {config.qualifyingEnabled ? 'Start Qualifying Session' : 'Start Multiplayer Race'}
            </button>
          ) : (
            <div className="text-xs text-amber-300 font-medium">
              Waiting for host to launch the race...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
