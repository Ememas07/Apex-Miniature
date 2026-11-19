import { useCallback, useEffect, useRef, useState } from 'react';
import { LiveryStudioModal } from './components/LiveryStudioModal';
import { MultiplayerModal } from './components/MultiplayerModal';
import { PauseModal } from './components/PauseModal';
import { RaceHUD } from './components/RaceHUD';
import { RaceMenuModal } from './components/RaceMenuModal';
import { ResultsModal } from './components/ResultsModal';
import { SoundEditorModal } from './components/SoundEditorModal';
import { TitleOverlay } from './components/TitleOverlay';
import { TrackStudioModal } from './components/TrackStudioModal';
import { CAR_CLASSES, CARS, getCarById } from './game/cars';
import { registerCustomTrackInMemory } from './game/customTracks';
import {
  ConnectionMode,
  extractSharedRoomConfigPatch,
  mergeSharedRoomConfig,
  MultiplayerClient,
} from './game/multiplayer';
import { computeUpdatedAdaptiveBoost, formatLapTime } from './game/physics';
import { getTrackById } from './game/tracks';
import {
  CameraMode,
  CarClassId,
  GamePhase,
  HudSnapshot,
  LiveryConfig,
  PitServiceAction,
  PitStrategy,
  RaceConfig,
  RoomState,
  TireCompound,
  TrackSpec,
} from './game/types';
import { RaceViewport } from './three/RaceViewport';

const INITIAL_CAR = CARS[0]; // Ferrari 499P

const INITIAL_CONFIG: RaceConfig = {
  trackId: 'spa-francorchamps',
  activeClasses: [CarClassId.HYPERCAR_GTP, CarClassId.LMP2, CarClassId.GT3],
  playerCarId: INITIAL_CAR.id,
  playerLivery: { ...INITIAL_CAR.defaultLivery },
  gridSize: 12,
  totalLaps: 5,
  weather: 'dry',
  startingCompound: 'medium',
  qualifyingEnabled: false,
  aiDifficulty: 'Pro',
  aiAdaptiveBoost: 0,
  aiBotCount: 11,
  noAi: false,
  sessionMode: 'race',
};

export default function App() {
  const [phase, setPhase] = useState<GamePhase>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1' ? 'playing' : 'title';
  });
  const [activePrePausePhase, setActivePrePausePhase] = useState<'playing' | 'qualifying'>('playing');
  const [raceConfig, setRaceConfig] = useState<RaceConfig>(() => {
    const params = new URLSearchParams(window.location.search);
    const trackParam = params.get('track') || params.get('trackId');
    return trackParam ? { ...INITIAL_CONFIG, trackId: trackParam } : INITIAL_CONFIG;
  });
  const [runNonce, setRunNonce] = useState<number>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1' ? 1 : 0;
  });

  const [raceMenuOpen, setRaceMenuOpen] = useState(false);
  const [multiplayerOpen, setMultiplayerOpen] = useState(false);
  const [trackStudioOpen, setTrackStudioOpen] = useState(false);
  const [liveryStudioOpen, setLiveryStudioOpen] = useState(false);
  const [soundStudioOpen, setSoundStudioOpen] = useState(false);
  const [editingCustomTrack, setEditingCustomTrack] = useState<TrackSpec | undefined>(undefined);
  const [cameraMode, setCameraMode] = useState<CameraMode>(() => {
    const params = new URLSearchParams(window.location.search);
    const cam = params.get('camera');
    return cam === 'isometric' || cam === 'hood' || cam === 'orbit'
      ? cam
      : 'orbit';
  });
  const [muted, setMuted] = useState(false);
  const [pitStrategy, setPitStrategy] = useState<PitStrategy>({
    nextCompound: 'medium',
  });
  const pitHandlerRef = useRef<((action: PitServiceAction, nextCompound?: TireCompound) => boolean) | null>(null);

  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [finalSnapshot, setFinalSnapshot] = useState<HudSnapshot | null>(null);
  const [qualiBanner, setQualiBanner] = useState<{ time: number; gridPos: number } | null>(null);

  const mpClientRef = useRef<MultiplayerClient | null>(null);
  if (!mpClientRef.current) {
    mpClientRef.current = new MultiplayerClient();
  }
  const [room, setRoom] = useState<RoomState | null>(null);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>(
    mpClientRef.current?.connectionMode || 'disconnected',
  );
  const [mpError, setMpError] = useState<string | null>(null);
  const [customTracksNonce, setCustomTracksNonce] = useState(0);
  const qualifyingEnabledRef = useRef(raceConfig.qualifyingEnabled);
  qualifyingEnabledRef.current = raceConfig.qualifyingEnabled;

  // Sync document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = phase === 'qualifying' ? 'playing' : phase;
  }, [phase]);

  // Subscribe to Multiplayer events
  useEffect(() => {
    const mp = mpClientRef.current!;
    mp.onRoomUpdate = (nextRoom) => {
      setRoom(nextRoom);
      setMpError(null);
      if (nextRoom?.config) {
        if (nextRoom.config.customTrack) {
          registerCustomTrackInMemory(nextRoom.config.customTrack);
        }
        setRaceConfig((prev) => mergeSharedRoomConfig(prev, nextRoom.config));
      }
    };
    mp.onRaceStart = (startedRoom) => {
      setRoom(startedRoom);
      if (startedRoom?.config?.customTrack) {
        registerCustomTrackInMemory(startedRoom.config.customTrack);
      }
      if (startedRoom?.config) {
        setRaceConfig((prev) => mergeSharedRoomConfig(prev, startedRoom.config));
      }
      setRaceMenuOpen(false);
      setMultiplayerOpen(false);
      setTrackStudioOpen(false);
      setLiveryStudioOpen(false);
      setSoundStudioOpen(false);
      setFinalSnapshot(null);
      setQualiBanner(null);
      setRunNonce((n) => n + 1);
      const useQuali = startedRoom?.config?.qualifyingEnabled ?? qualifyingEnabledRef.current;
      const targetPhase = useQuali ? 'qualifying' : 'playing';
      setActivePrePausePhase(targetPhase);
      setPhase(targetPhase);
    };
    mp.onError = (msg) => setMpError(msg);
    mp.onConnectionModeChange = (mode) => setConnectionMode(mode);
  }, []);

  const handleStartSession = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setRaceMenuOpen(false);
    setMultiplayerOpen(false);
    setTrackStudioOpen(false);
    setLiveryStudioOpen(false);
    setSoundStudioOpen(false);
    setFinalSnapshot(null);
    setQualiBanner(null);

    if (room && room.hostId === mpClientRef.current?.peerId && raceConfig.sessionMode !== 'practice') {
      mpClientRef.current.startRace();
    }
    const targetPhase =
      raceConfig.sessionMode !== 'practice' && raceConfig.qualifyingEnabled ? 'qualifying' : 'playing';
    setActivePrePausePhase(targetPhase);
    setRunNonce((n) => n + 1);
    setPhase(targetPhase);
  }, [raceConfig.qualifyingEnabled, raceConfig.sessionMode, room]);

  const handleStartSinglePlayer = useCallback(
    (patch: Partial<RaceConfig>) => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      if (room) {
        try {
          mpClientRef.current?.leaveRoom();
        } catch {
          // Ignore disconnect errors when switching to offline Single Player
        }
        setRoom(null);
        setMpError(null);
      }
      setRaceConfig((prev) => ({ ...prev, ...patch }));
      setRaceMenuOpen(false);
      setMultiplayerOpen(false);
      setTrackStudioOpen(false);
      setLiveryStudioOpen(false);
      setSoundStudioOpen(false);
      setFinalSnapshot(null);
      setQualiBanner(null);
      const targetPhase =
        patch.sessionMode !== 'practice' && patch.qualifyingEnabled ? 'qualifying' : 'playing';
      setActivePrePausePhase(targetPhase);
      setRunNonce((n) => n + 1);
      setPhase(targetPhase);
    },
    [room],
  );

  const handleReturnToTitle = useCallback(() => {
    setRaceMenuOpen(false);
    setMultiplayerOpen(false);
    setFinalSnapshot(null);
    setQualiBanner(null);
    setPhase('title');
  }, []);

  // Enter / Space shortcut on Title screen
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        phase !== 'title' ||
        raceMenuOpen ||
        multiplayerOpen ||
        trackStudioOpen ||
        liveryStudioOpen ||
        soundStudioOpen
      ) {
        return;
      }
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        handleStartSession();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    phase,
    raceMenuOpen,
    multiplayerOpen,
    trackStudioOpen,
    liveryStudioOpen,
    soundStudioOpen,
    handleStartSession,
  ]);

  const handleTogglePause = useCallback(() => {
    setPhase((cur) => {
      if (cur === 'playing' || cur === 'qualifying') {
        setActivePrePausePhase(cur);
        return 'paused';
      }
      if (cur === 'paused') {
        return activePrePausePhase;
      }
      return cur;
    });
  }, [activePrePausePhase]);

  const handleCycleCamera = useCallback(() => {
    setCameraMode((prev) =>
      prev === 'orbit'
        ? 'hood'
        : prev === 'hood'
        ? 'isometric'
        : 'orbit',
    );
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((m) => !m);
  }, []);

  const handleRaceFinish = useCallback(
    (snapshot: HudSnapshot) => {
      setFinalSnapshot(snapshot);
      const playerRow = snapshot.standings.find((s) => s.isPlayer);
      const track = getTrackById(raceConfig.trackId);
      const car = getCarById(raceConfig.playerCarId);
      const nextBoost = computeUpdatedAdaptiveBoost(
        raceConfig.aiAdaptiveBoost,
        playerRow?.bestLapTime ?? null,
        track.targetLapSeconds,
        CAR_CLASSES[car.classId].basePaceIndex,
      );
      setRaceConfig((prev) => ({ ...prev, aiAdaptiveBoost: nextBoost }));
      setPhase('gameover');
    },
    [raceConfig.aiAdaptiveBoost, raceConfig.playerCarId, raceConfig.trackId],
  );

  const handleQualifyingFinish = useCallback((qualiTime: number, gridPos: number) => {
    setQualiBanner({ time: qualiTime, gridPos });
  }, []);

  const handleLaunchRaceAfterQuali = useCallback(() => {
    setQualiBanner(null);
    setActivePrePausePhase('playing');
    setRunNonce((n) => n + 1);
    setPhase('playing');
  }, []);

  const handleUpdateConfig = (patch: Partial<RaceConfig>) => {
    setRaceConfig((prev) => {
      const next = { ...prev, ...patch };
      if (room && room.hostId === mpClientRef.current?.peerId) {
        const sharedPatch = extractSharedRoomConfigPatch(patch);
        if (Object.keys(sharedPatch).length > 0) {
          mpClientRef.current.updateConfig(sharedPatch);
        }
      }
      return next;
    });
  };

  const handleSelectCar = (carId: string, resetLivery: LiveryConfig) => {
    const car = getCarById(carId);
    setRaceConfig((prev) => {
      const classes = prev.activeClasses.includes(car.classId)
        ? prev.activeClasses
        : [car.classId, ...prev.activeClasses].slice(0, 3);
      return {
        ...prev,
        playerCarId: carId,
        playerLivery: resetLivery,
        activeClasses: classes,
      };
    });
    mpClientRef.current?.updatePeer({ carId, classId: car.classId, livery: resetLivery });
  };

  const handleChangeLivery = (livery: LiveryConfig) => {
    setRaceConfig((prev) => ({ ...prev, playerLivery: livery }));
    mpClientRef.current?.updatePeer({ livery });
  };

  const handleOpenStudio = (trackToEdit?: TrackSpec) => {
    setEditingCustomTrack(trackToEdit);
    setTrackStudioOpen(true);
  };

  const handleStudioSaveTrack = (saved: TrackSpec) => {
    registerCustomTrackInMemory(saved);
    setCustomTracksNonce((n) => n + 1);
    if (raceConfig.trackId === saved.id) {
      handleUpdateConfig({ customTrack: saved });
    }
  };

  const handleStudioTestDrive = (saved: TrackSpec) => {
    registerCustomTrackInMemory(saved);
    setCustomTracksNonce((n) => n + 1);
    handleUpdateConfig({ trackId: saved.id, customTrack: saved });
    setTrackStudioOpen(false);
    setRaceMenuOpen(false);
    setMultiplayerOpen(false);
    setFinalSnapshot(null);
    setQualiBanner(null);
    setActivePrePausePhase('playing');
    setRunNonce((n) => n + 1);
    setPhase('playing');
  };

  const track = raceConfig.customTrack || getTrackById(raceConfig.trackId);

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#0b0e13]">
      {/* Isolated 3D Canvas Viewport */}
      <RaceViewport
        phase={phase}
        raceConfig={raceConfig}
        cameraMode={cameraMode}
        muted={muted}
        pitStrategy={pitStrategy}
        runNonce={runNonce}
        mpClient={mpClientRef.current}
        roomPeers={room?.peers ?? []}
        onHudUpdate={setHud}
        onRaceFinish={handleRaceFinish}
        onQualifyingFinish={handleQualifyingFinish}
        onTogglePause={handleTogglePause}
        onCycleCamera={handleCycleCamera}
        onToggleMute={handleToggleMute}
        onPitHandlerReady={(handler) => {
          pitHandlerRef.current = handler;
        }}
      />

      {/* Title Screen */}
      {phase === 'title' &&
        !raceMenuOpen &&
        !multiplayerOpen &&
        !trackStudioOpen &&
        !liveryStudioOpen &&
        !soundStudioOpen && (
          <TitleOverlay
            raceConfig={raceConfig}
            roomCode={room?.code ?? null}
            onOpenRace={() => {
              setMultiplayerOpen(false);
              setRaceMenuOpen(true);
            }}
            onOpenMultiplayer={() => {
              setRaceMenuOpen(false);
              setMultiplayerOpen(true);
            }}
            onOpenStudio={() => handleOpenStudio()}
            onOpenLiveryStudio={() => setLiveryStudioOpen(true)}
            onOpenSoundStudio={() => setSoundStudioOpen(true)}
          />
        )}

      {/* Unified Single-Player Race Setup */}
      {raceMenuOpen && (
        <RaceMenuModal
          config={raceConfig}
          customTracksNonce={customTracksNonce}
          onUpdateConfig={handleUpdateConfig}
          onSelectCar={handleSelectCar}
          onChangeLivery={handleChangeLivery}
          onStartRace={handleStartSinglePlayer}
          onOpenStudio={(trackToEdit) => handleOpenStudio(trackToEdit)}
          onClose={() => setRaceMenuOpen(false)}
        />
      )}

      {/* Unified Multiplayer Room Creation & Lobby */}
      {multiplayerOpen && (
        <MultiplayerModal
          config={raceConfig}
          room={room}
          myPeerId={mpClientRef.current.peerId}
          connectionMode={connectionMode}
          customTracksNonce={customTracksNonce}
          mpError={mpError}
          onUpdateConfig={handleUpdateConfig}
          onUpdatePeer={(payload) => mpClientRef.current?.updatePeer(payload)}
          onCreateRoom={async (name) => {
            try {
              setMpError(null);
              const mpConfig: RaceConfig = {
                ...raceConfig,
                sessionMode: 'race',
                totalLaps: raceConfig.totalLaps > 0 ? raceConfig.totalLaps : 5,
              };
              setRaceConfig(mpConfig);
              await mpClientRef.current?.createRoom(
                name,
                mpConfig.playerCarId,
                mpConfig.playerLivery,
                mpConfig,
                getCarById(mpConfig.playerCarId).classId,
              );
            } catch (err: unknown) {
              setMpError(err instanceof Error ? err.message : 'Failed to create room');
            }
          }}
          onJoinRoom={async (code, name) => {
            try {
              setMpError(null);
              await mpClientRef.current?.joinRoom(
                code,
                name,
                raceConfig.playerCarId,
                raceConfig.playerLivery,
                getCarById(raceConfig.playerCarId).classId,
              );
            } catch (err: unknown) {
              setMpError(err instanceof Error ? err.message : 'Failed to join room');
            }
          }}
          onLeaveRoom={() => {
            try {
              mpClientRef.current?.leaveRoom();
              setRoom(null);
              setMpError(null);
            } catch (err: unknown) {
              setMpError(err instanceof Error ? err.message : 'Error leaving room');
            }
          }}
          onStartFromLobby={handleStartSession}
          onClose={() => setMultiplayerOpen(false)}
        />
      )}

      {/* Interactive IMSA Sound Studio (Untouched) */}
      {soundStudioOpen && (
        <SoundEditorModal
          currentCarId={raceConfig.playerCarId}
          onClose={() => setSoundStudioOpen(false)}
        />
      )}

      {/* 3D Livery Studio & UV Painter (Untouched) */}
      {liveryStudioOpen && (
        <LiveryStudioModal
          initialCarId={raceConfig.playerCarId}
          initialLivery={raceConfig.playerLivery}
          onApplyLivery={(carId, newLivery) => {
            if (carId !== raceConfig.playerCarId) {
              handleSelectCar(carId, newLivery);
            } else {
              handleChangeLivery(newLivery);
            }
          }}
          onClose={() => setLiveryStudioOpen(false)}
        />
      )}

      {/* Interactive Track Studio Circuit Builder */}
      {trackStudioOpen && (
        <TrackStudioModal
          initialTrack={editingCustomTrack}
          onClose={() => setTrackStudioOpen(false)}
          onSaveTrack={handleStudioSaveTrack}
          onTestDrive={handleStudioTestDrive}
        />
      )}

      {/* Active Race / Qualifying HUD */}
      {(phase === 'playing' || phase === 'qualifying') && hud && (
        <RaceHUD
          hud={hud}
          trackId={raceConfig.trackId}
          customTrack={raceConfig.customTrack}
          playerCarId={raceConfig.playerCarId}
          muted={muted}
          onChangePitStrategy={setPitStrategy}
          onRequestPitStop={(action, nextCompound) =>
            pitHandlerRef.current ? pitHandlerRef.current(action, nextCompound) : false
          }
          onCycleCamera={handleCycleCamera}
          onToggleMute={handleToggleMute}
          onTogglePause={handleTogglePause}
          onReturnToTitle={handleReturnToTitle}
        />
      )}

      {/* Qualifying Hotlap Complete Modal */}
      {phase === 'qualifying' && qualiBanner && (
        <div
          data-testid="quali-result-modal"
          role="dialog"
          aria-label="Qualifying Result"
          className="fixed inset-0 z-30 bg-black/75 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-[#11151d] border border-white/15 rounded-lg p-6 text-center space-y-4 shadow-2xl">
            <div className="text-xs text-slate-400 uppercase tracking-widest">Qualifying Complete</div>
            <div className="text-4xl font-display font-extrabold text-white tabular-nums">
              P{qualiBanner.gridPos} Grid Start
            </div>
            <div className="font-telemetry text-lg text-emerald-400">
              Hotlap: {formatLapTime(qualiBanner.time)}
            </div>
            <button
              type="button"
              data-start="true"
              onClick={handleLaunchRaceAfterQuali}
              className="w-full py-3 rounded bg-red-600 hover:bg-red-500 text-sm font-display font-bold text-white cursor-pointer"
            >
              Start Race from P{qualiBanner.gridPos}
            </button>
          </div>
        </div>
      )}

      {/* Pause Modal */}
      {phase === 'paused' && (
        <PauseModal
          onResume={handleTogglePause}
          onRestart={() => {
            setRunNonce((n) => n + 1);
            setPhase(activePrePausePhase);
          }}
          onReturnToTitle={handleReturnToTitle}
        />
      )}

      {/* Post-Race Results Modal */}
      {phase === 'gameover' && finalSnapshot && (
        <ResultsModal
          snapshot={finalSnapshot}
          trackName={track.name}
          adaptiveBoost={raceConfig.aiAdaptiveBoost}
          onRaceAgain={handleStartSession}
          onReturnToTitle={handleReturnToTitle}
        />
      )}
    </main>
  );
}
