import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  ControlsBriefingCard,
  hasDismissedBriefing,
  markBriefingDismissed,
} from './components/ControlsBriefingCard';
import { PauseModal } from './components/PauseModal';
import { LandscapeMobileBanner, OfflineIndicator, PWAInstallButton } from './components/PWAControls';
import { RaceHUD } from './components/RaceHUD';
import { RaceMenuModal } from './components/RaceMenuModal';
import { ReplayAndPhotoOverlay } from './components/ReplayAndPhotoOverlay';
import { ResultsModal } from './components/ResultsModal';
import { TitleOverlay } from './components/TitleOverlay';
import { TouchControlsOverlay } from './components/TouchControlsOverlay';
import { getSavedCarSetup } from './game/carSetup';
import { CAMERA_MODE_ORDER, cycleCameraMode } from './game/camera';
import { CARS, getCarById, resolveCarSpecial } from './game/cars';
import {
  ActiveChampionshipState,
  awardCareerSessionRewards,
  loadActiveChampionship,
  recordChampionshipSessionResult,
  saveActiveChampionship,
} from './game/championship';
import { registerCustomTrackInMemory } from './game/customTracks';
import {
  ConnectionMode,
  extractSharedRoomConfigPatch,
  mergeSharedRoomConfig,
  MultiplayerClient,
} from './game/multiplayer';
import { formatLapTime } from './game/physics';
import { loadLastRaceConfig, saveLastRaceConfig } from './game/records';
import { evaluateScenarioResult, getScenarioById, saveChallengeMedal } from './game/scenarios';
import {
  GameSettings,
  getGameSettings,
  HudPreset,
  setGameSettings as persistGameSettings,
  subscribeGameSettings,
} from './game/settings';
import { isTouchCapableDevice, shouldShowTouchControls } from './game/touchControls';
import { getTrackById } from './game/tracks';
import {
  CameraMode,
  CarClassId,
  ChatMessage,
  GamePhase,
  HudSnapshot,
  LiveryConfig,
  MedalTier,
  MfdPage,
  PitServiceAction,
  PitStrategy,
  RaceConfig,
  RoomState,
  SpectatorCameraMode,
  TireCompound,
  TrackSpec,
} from './game/types';
import { audioEngine } from './three/audioEngine';
import {
  InRaceTelemetryControls,
  PhotoModeState,
  RaceViewport,
  ReplayAndPhotoControls,
  ReplayStateSnapshot,
  SpectateControls,
} from './three/RaceViewport';

// Code-split heavy studios & secondary modals for fast initial TTI
const CarSetupModal = lazy(() =>
  import('./components/CarSetupModal').then((m) => ({ default: m.CarSetupModal })),
);
const CarsShowcaseModal = lazy(() =>
  import('./components/CarsShowcaseModal').then((m) => ({ default: m.CarsShowcaseModal })),
);
const LiveryStudioModal = lazy(() =>
  import('./components/LiveryStudioModal').then((m) => ({ default: m.LiveryStudioModal })),
);
const ModesHubModal = lazy(() =>
  import('./components/ModesHubModal').then((m) => ({ default: m.ModesHubModal })),
);
const MultiplayerModal = lazy(() =>
  import('./components/MultiplayerModal').then((m) => ({ default: m.MultiplayerModal })),
);
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal })),
);
const SoundEditorModal = lazy(() =>
  import('./components/SoundEditorModal').then((m) => ({ default: m.SoundEditorModal })),
);
const TracksShowcaseModal = lazy(() =>
  import('./components/TracksShowcaseModal').then((m) => ({ default: m.TracksShowcaseModal })),
);
const TrackStudioModal = lazy(() =>
  import('./components/TrackStudioModal').then((m) => ({ default: m.TrackStudioModal })),
);

const MFD_PAGE_ORDER: MfdPage[] = ['tires-brakes', 'strategy', 'electronics', 'sectors'];
const HUD_PRESET_ORDER: HudPreset[] = ['full', 'minimal', 'pro', 'off'];

const INITIAL_CAR = CARS[0]; // Ferrari 499P

const INITIAL_CONFIG: RaceConfig = {
  trackId: 'spa-francorchamps',
  activeClasses: [CarClassId.HYPERCAR_GTP, CarClassId.LMP2, CarClassId.GT3],
  playerCarId: INITIAL_CAR.id,
  playerLivery: { ...INITIAL_CAR.defaultLivery },
  gridSize: 12,
  totalLaps: 5,
  weather: 'dry',
  weatherPreset: 'clear-dry',
  startingCompound: 'soft',
  qualifyingEnabled: false,
  aiDifficulty: 'Pro',
  aiBotCount: 11,
  noAi: false,
  sessionMode: 'race',
  startType: 'standing',
  damageLevel: 'light',
  absLevel: 'low',
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
    const restored = loadLastRaceConfig(INITIAL_CONFIG);
    return trackParam ? { ...restored, trackId: trackParam } : restored;
  });
  const [runNonce, setRunNonce] = useState<number>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1' ? 1 : 0;
  });

  const [raceMenuOpen, setRaceMenuOpen] = useState(false);
  const [modesHubOpen, setModesHubOpen] = useState(false);
  const [multiplayerOpen, setMultiplayerOpen] = useState(false);
  const [carsShowcaseOpen, setCarsShowcaseOpen] = useState(false);
  const [tracksShowcaseOpen, setTracksShowcaseOpen] = useState(false);
  const [trackStudioOpen, setTrackStudioOpen] = useState(false);
  const [liveryStudioOpen, setLiveryStudioOpen] = useState(false);
  const [soundStudioOpen, setSoundStudioOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [carSetupOpen, setCarSetupOpen] = useState(false);
  const [editingCustomTrack, setEditingCustomTrack] = useState<TrackSpec | undefined>(undefined);
  const [activeChampionship, setActiveChampionship] = useState<ActiveChampionshipState | null>(() =>
    loadActiveChampionship(),
  );
  const [lastCareerReward, setLastCareerReward] = useState<{
    creditsEarned: number;
    repEarned: number;
  } | null>(null);
  const [lastScenarioResult, setLastScenarioResult] = useState<{
    passed: boolean;
    medal: MedalTier | null;
    summary: string;
  } | null>(null);
  const [lastChampPoints, setLastChampPoints] = useState<number | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>(() => {
    const params = new URLSearchParams(window.location.search);
    const cam = params.get('camera') as CameraMode | null;
    return cam && CAMERA_MODE_ORDER.includes(cam) ? cam : 'orbit';
  });
  const [mfdPage, setMfdPage] = useState<MfdPage>('tires-brakes');
  const [replayState, setReplayState] = useState<ReplayStateSnapshot | null>(null);
  const [photoState, setPhotoState] = useState<PhotoModeState | null>(null);
  const replayControlsRef = useRef<ReplayAndPhotoControls | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [myPingMs, setMyPingMs] = useState<number>(0);
  const [briefingDismissed, setBriefingDismissed] = useState<boolean>(() => hasDismissedBriefing());
  const [gameSettings, setGameSettings] = useState<GameSettings>(() => getGameSettings());
  const [touchCapable, setTouchCapable] = useState<boolean>(() => isTouchCapableDevice());
  const [spectatorCameraMode, setSpectatorCameraMode] = useState<SpectatorCameraMode>('spectate');
  const spectateControlsRef = useRef<SpectateControls | null>(null);
  const inRaceControlsRef = useRef<InRaceTelemetryControls | null>(null);
  const [muted, setMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('apex_audio_muted') === 'true';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const onAudioMute = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      if (typeof detail === 'boolean') setMuted(detail);
    };
    window.addEventListener('apex-audio-mute', onAudioMute);
    return () => window.removeEventListener('apex-audio-mute', onAudioMute);
  }, []);
  const [pitStrategy, setPitStrategy] = useState<PitStrategy>({
    nextCompound: 'soft',
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
  const lastRaceStartTimeRef = useRef(0);

  // Smooth fade-in / fade-out curtain for main menu & session transitions
  const [screenFading, setScreenFading] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') !== '1';
  });
  const fadeTimersRef = useRef<{ mid?: number; end?: number }>({});

  useEffect(() => {
    const t = window.setTimeout(() => setScreenFading(false), 120);
    return () => {
      window.clearTimeout(t);
      if (fadeTimersRef.current.mid) window.clearTimeout(fadeTimersRef.current.mid);
      if (fadeTimersRef.current.end) window.clearTimeout(fadeTimersRef.current.end);
    };
  }, []);

  const runWithScreenFade = useCallback((applyTransition: () => void) => {
    if (fadeTimersRef.current.mid) window.clearTimeout(fadeTimersRef.current.mid);
    if (fadeTimersRef.current.end) window.clearTimeout(fadeTimersRef.current.end);
    setScreenFading(true);
    fadeTimersRef.current.mid = window.setTimeout(() => {
      applyTransition();
      fadeTimersRef.current.end = window.setTimeout(() => {
        setScreenFading(false);
      }, 140);
    }, 280);
  }, []);

  // Sync document.body.dataset.state & ambient menu music
  useEffect(() => {
    document.body.dataset.state = phase === 'qualifying' ? 'playing' : phase;
    audioEngine.setMenuMusicActive(phase === 'title' && !muted);
  }, [phase, muted]);

  useEffect(() => {
    const unsub = subscribeGameSettings((next) => setGameSettings(next));
    const onResize = () => setTouchCapable(isTouchCapableDevice());
    window.addEventListener('resize', onResize);
    return () => {
      unsub();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // Load saved per-(car, track) setup whenever playerCarId or trackId changes
  useEffect(() => {
    const saved = getSavedCarSetup(raceConfig.playerCarId, raceConfig.trackId);
    setRaceConfig((prev) => ({ ...prev, carSetup: saved }));
  }, [raceConfig.playerCarId, raceConfig.trackId]);

  // Persist standard race preferences across sessions
  useEffect(() => {
    if (
      !raceConfig.championshipId &&
      !raceConfig.scenarioId &&
      !raceConfig.licenseId &&
      !raceConfig.dailyChallengeDate
    ) {
      saveLastRaceConfig(raceConfig);
    }
  }, [raceConfig]);

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
      const now = Date.now();
      if (now - lastRaceStartTimeRef.current < 1000) return;
      lastRaceStartTimeRef.current = now;

      setRoom(startedRoom);
      if (startedRoom?.config?.customTrack) {
        registerCustomTrackInMemory(startedRoom.config.customTrack);
      }
      if (startedRoom?.config) {
        setRaceConfig((prev) => mergeSharedRoomConfig(prev, startedRoom.config));
      }
      runWithScreenFade(() => {
        setRaceMenuOpen(false);
        setMultiplayerOpen(false);
        setCarsShowcaseOpen(false);
        setTracksShowcaseOpen(false);
        setTrackStudioOpen(false);
        setLiveryStudioOpen(false);
        setSoundStudioOpen(false);
        setFinalSnapshot(null);
        setQualiBanner(null);
        setSpectatorCameraMode('spectate');
        setRunNonce((n) => n + 1);
        const useQuali = startedRoom?.config?.qualifyingEnabled ?? qualifyingEnabledRef.current;
        const targetPhase = useQuali ? 'qualifying' : 'playing';
        setActivePrePausePhase(targetPhase);
        setPhase(targetPhase);
      });
    };
    mp.onError = (msg) => setMpError(msg);
    mp.onConnectionModeChange = (mode) => setConnectionMode(mode);
    mp.onChatMessage = (entry) => {
      setChatMessages((prev) => [...prev.slice(-49), entry]);
    };
    mp.onKicked = (reason) => {
      setRoom(null);
      setChatMessages([]);
      setMpError(reason || 'Removed from lobby by host.');
    };
    setConnectionMode(mp.connectionMode);
    const pingTimer = window.setInterval(() => {
      setMyPingMs(Math.round(mp.myPingMs || 0));
    }, 1000);
    return () => window.clearInterval(pingTimer);
  }, [runWithScreenFade]);

  const handleStartSession = useCallback(() => {
    const now = Date.now();
    if (now - lastRaceStartTimeRef.current < 1000) return;

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    if (room && room.hostId === mpClientRef.current?.peerId && raceConfig.sessionMode === 'race') {
      mpClientRef.current.startRace();
      return;
    }
    lastRaceStartTimeRef.current = now;
    const useQuali = raceConfig.sessionMode === 'race' && raceConfig.qualifyingEnabled;
    const targetPhase = useQuali ? 'qualifying' : 'playing';
    runWithScreenFade(() => {
      setRaceMenuOpen(false);
      setModesHubOpen(false);
      setMultiplayerOpen(false);
      setCarsShowcaseOpen(false);
      setTracksShowcaseOpen(false);
      setTrackStudioOpen(false);
      setLiveryStudioOpen(false);
      setSoundStudioOpen(false);
      setFinalSnapshot(null);
      setQualiBanner(null);
      setLastCareerReward(null);
      setLastScenarioResult(null);
      setLastChampPoints(null);
      setSpectatorCameraMode('spectate');
      setActivePrePausePhase(targetPhase);
      setRunNonce((n) => n + 1);
      setPhase(targetPhase);
    });
  }, [raceConfig.qualifyingEnabled, raceConfig.sessionMode, room, runWithScreenFade]);

  const handleStartSinglePlayer = useCallback(
    (patch: Partial<RaceConfig>, forcePhase?: 'playing' | 'qualifying') => {
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
      const useQuali = patch.sessionMode === 'race' && Boolean(patch.qualifyingEnabled);
      const targetPhase = forcePhase ?? (useQuali ? 'qualifying' : 'playing');
      runWithScreenFade(() => {
        setRaceConfig((prev) => ({ ...prev, ...patch }));
        setRaceMenuOpen(false);
        setModesHubOpen(false);
        setMultiplayerOpen(false);
        setCarsShowcaseOpen(false);
        setTracksShowcaseOpen(false);
        setTrackStudioOpen(false);
        setLiveryStudioOpen(false);
        setSoundStudioOpen(false);
        setFinalSnapshot(null);
        setQualiBanner(null);
        setLastCareerReward(null);
        setLastScenarioResult(null);
        setLastChampPoints(null);
        setSpectatorCameraMode('spectate');
        setActivePrePausePhase(targetPhase);
        setRunNonce((n) => n + 1);
        setPhase(targetPhase);
      });
    },
    [room, runWithScreenFade],
  );

  const handleLaunchChampionshipStage = useCallback(
    (champInput: ActiveChampionshipState, skipPractice = false) => {
      let champ = champInput;
      if (skipPractice && champ.currentStage === 'practice') {
        champ = { ...champ, currentStage: 'qualifying' };
        saveActiveChampionship(champ);
        setActiveChampionship(champ);
      }
      const round = champ.rounds[champ.currentRoundIndex];
      if (!round || champ.completed) return;
      const car = getCarById(champ.playerCarId);
      const isWet = round.weatherPreset !== 'clear-dry' && round.weatherPreset !== 'overcast';
      const stage = champ.currentStage;
      const isPractice = stage === 'practice';
      const isQuali = stage === 'qualifying';
      const isSprint = stage === 'sprint';
      const stageLaps = isPractice
        ? 2
        : isSprint
        ? Math.max(2, Math.round(round.laps * 0.5))
        : round.laps;

      handleStartSinglePlayer(
        {
          sessionMode: isPractice ? 'practice' : 'championship',
          trackId: round.trackId,
          customTrack: undefined,
          playerCarId: car.id,
          playerLivery:
            raceConfig.playerCarId === car.id ? raceConfig.playerLivery : { ...car.defaultLivery },
          activeClasses: [...champ.classes],
          aiBotCount: isPractice ? 0 : Math.max(1, champ.gridSize - 1),
          noAi: isPractice,
          gridSize: isPractice ? 1 : champ.gridSize,
          totalLaps: stageLaps,
          raceDurationMinutes: stage === 'feature' ? round.raceDurationMinutes ?? 0 : 0,
          weather: isWet ? 'dynamic-rain' : 'dry',
          weatherPreset: round.weatherPreset,
          startingCompound: isWet ? 'wet' : 'soft',
          qualifyingEnabled: false,
          aiDifficulty: champ.aiDifficulty,
          startType: isPractice ? 'rolling' : 'standing',
          championshipId: champ.id,
          weekendStage: stage,
          startingGridPosition:
            !isPractice && !isQuali && champ.pendingGridPos ? champ.pendingGridPos : undefined,
          scenarioId: undefined,
          licenseId: undefined,
          dailyChallengeDate: undefined,
        },
        isQuali ? 'qualifying' : 'playing',
      );
    },
    [handleStartSinglePlayer, raceConfig.playerCarId, raceConfig.playerLivery],
  );

  const handleReturnToTitle = useCallback(() => {
    runWithScreenFade(() => {
      setRaceMenuOpen(false);
      setModesHubOpen(false);
      setMultiplayerOpen(false);
      setCarsShowcaseOpen(false);
      setTracksShowcaseOpen(false);
      setSettingsOpen(false);
      setFinalSnapshot(null);
      setQualiBanner(null);
      setSpectatorCameraMode('spectate');
      setPhase('title');
    });
  }, [runWithScreenFade]);

  // Global QoL & Title keyboard shortcuts (Enter/Space on Title, Shift+R quick restart, H HUD cycle, N nametags, Esc nested modals)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
      if (inInput) return;

      if (e.code === 'Escape') {
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (carSetupOpen) {
          setCarSetupOpen(false);
          return;
        }
        if (soundStudioOpen) {
          setSoundStudioOpen(false);
          return;
        }
        if (liveryStudioOpen) {
          setLiveryStudioOpen(false);
          return;
        }
        if (carsShowcaseOpen) {
          setCarsShowcaseOpen(false);
          return;
        }
        if (tracksShowcaseOpen) {
          setTracksShowcaseOpen(false);
          return;
        }
        if (modesHubOpen) {
          setModesHubOpen(false);
          return;
        }
        if (raceMenuOpen) {
          setRaceMenuOpen(false);
          return;
        }
      }

      if (phase === 'playing' || phase === 'qualifying') {
        if (e.shiftKey && e.code === 'KeyR' && !room) {
          e.preventDefault();
          setRunNonce((n) => n + 1);
          return;
        }
        if (!e.ctrlKey && !e.metaKey && !e.altKey && e.code === 'KeyH') {
          const cur = getGameSettings().hudPreset;
          const next = HUD_PRESET_ORDER[(HUD_PRESET_ORDER.indexOf(cur) + 1) % HUD_PRESET_ORDER.length];
          persistGameSettings({ hudPreset: next });
          return;
        }
        if (!e.ctrlKey && !e.metaKey && !e.altKey && e.code === 'KeyN') {
          const cur = getGameSettings().showNametags;
          persistGameSettings({ showNametags: !cur });
          return;
        }
      }

      if (
        phase !== 'title' ||
        raceMenuOpen ||
        modesHubOpen ||
        multiplayerOpen ||
        carsShowcaseOpen ||
        tracksShowcaseOpen ||
        trackStudioOpen ||
        liveryStudioOpen ||
        soundStudioOpen ||
        settingsOpen
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
    room,
    raceMenuOpen,
    modesHubOpen,
    multiplayerOpen,
    carsShowcaseOpen,
    tracksShowcaseOpen,
    trackStudioOpen,
    liveryStudioOpen,
    soundStudioOpen,
    settingsOpen,
    carSetupOpen,
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
    setCameraMode((prev) => cycleCameraMode(prev));
  }, []);

  const handleCycleMfd = useCallback(() => {
    setMfdPage((prev) => MFD_PAGE_ORDER[(MFD_PAGE_ORDER.indexOf(prev) + 1) % MFD_PAGE_ORDER.length]);
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((m) => !m);
  }, []);

  const handleRaceFinish = useCallback(
    (snapshot: HudSnapshot) => {
      let earnedMedal: MedalTier | null = null;
      const activeScenario = getScenarioById(raceConfig.scenarioId ?? raceConfig.licenseId);
      if (activeScenario) {
        const res = evaluateScenarioResult(activeScenario, snapshot);
        setLastScenarioResult(res);
        if (res.medal) {
          saveChallengeMedal(activeScenario.id, res.medal);
          earnedMedal = res.medal;
        }
      } else {
        setLastScenarioResult(null);
      }

      if (raceConfig.championshipId && activeChampionship) {
        const stage = raceConfig.weekendStage ?? 'feature';
        const { nextState, playerPointsEarned } = recordChampionshipSessionResult(activeChampionship, {
          standings: snapshot.standings,
          stage,
        });
        saveActiveChampionship(nextState);
        setActiveChampionship(nextState);
        setLastChampPoints(stage === 'practice' ? null : playerPointsEarned);
      } else {
        setLastChampPoints(null);
      }

      if (snapshot.sessionMode !== 'ai-race') {
        const playerRow = snapshot.standings.find((s) => s.isPlayer);
        const fastestLapRow = snapshot.standings.reduce<typeof playerRow | null>((best, r) => {
          if (!r.bestLapTime) return best;
          if (!best || !best.bestLapTime || r.bestLapTime < best.bestLapTime) return r;
          return best;
        }, null);
        const reward = awardCareerSessionRewards({
          position: playerRow?.position ?? snapshot.position,
          totalCars: snapshot.totalCars,
          cleanLaps: snapshot.cleanLapsCount ?? 0,
          overtakes: snapshot.overtakesCount ?? 0,
          hasFastestLap: Boolean(playerRow && fastestLapRow && playerRow.id === fastestLapRow.id),
          medalEarned: earnedMedal,
        });
        setLastCareerReward({
          creditsEarned: reward.creditsEarned,
          repEarned: reward.repEarned,
        });
      } else {
        setLastCareerReward(null);
      }

      setFinalSnapshot(snapshot);
      setPhase('gameover');
    },
    [activeChampionship, raceConfig.championshipId, raceConfig.licenseId, raceConfig.scenarioId, raceConfig.weekendStage],
  );

  const handleQualifyingFinish = useCallback(
    (qualiTime: number, gridPos: number) => {
      if (raceConfig.championshipId && activeChampionship) {
        const { nextState } = recordChampionshipSessionResult(activeChampionship, {
          standings: [],
          stage: 'qualifying',
          qualiGridPos: gridPos,
        });
        saveActiveChampionship(nextState);
        setActiveChampionship(nextState);
      }
      setQualiBanner({ time: qualiTime, gridPos });
    },
    [activeChampionship, raceConfig.championshipId],
  );

  const handleLaunchRaceAfterQuali = useCallback(() => {
    if (raceConfig.championshipId && activeChampionship) {
      setQualiBanner(null);
      handleLaunchChampionshipStage(activeChampionship, false);
      return;
    }
    runWithScreenFade(() => {
      setQualiBanner(null);
      setActivePrePausePhase('playing');
      setRunNonce((n) => n + 1);
      setPhase('playing');
    });
  }, [activeChampionship, handleLaunchChampionshipStage, raceConfig.championshipId, runWithScreenFade]);

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
    setRaceConfig((prev) => ({
      ...prev,
      playerCarId: carId,
      playerLivery: resetLivery,
    }));
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
    runWithScreenFade(() => {
      setTrackStudioOpen(false);
      setRaceMenuOpen(false);
      setMultiplayerOpen(false);
      setFinalSnapshot(null);
      setQualiBanner(null);
      setActivePrePausePhase('playing');
      setRunNonce((n) => n + 1);
      setPhase('playing');
    });
  };

  const titleVisible =
    phase === 'title' &&
    !raceMenuOpen &&
    !modesHubOpen &&
    !multiplayerOpen &&
    !carsShowcaseOpen &&
    !tracksShowcaseOpen &&
    !trackStudioOpen &&
    !liveryStudioOpen &&
    !soundStudioOpen &&
    !settingsOpen;

  const track = raceConfig.customTrack || getTrackById(raceConfig.trackId);
  const touchControlsActive = shouldShowTouchControls(gameSettings.touchControlsMode, touchCapable);
  const playerCarSpec = getCarById(raceConfig.playerCarId);
  const playerSpecial = resolveCarSpecial(playerCarSpec);
  const isAiRaceSession = raceConfig.sessionMode === 'ai-race';

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#0b0e13]">
      {/* Isolated 3D Canvas Viewport */}
      <RaceViewport
        phase={phase}
        raceConfig={raceConfig}
        cameraMode={cameraMode}
        spectatorCameraMode={spectatorCameraMode}
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
        onSpectatorCameraModeChange={setSpectatorCameraMode}
        onToggleMute={handleToggleMute}
        onPitHandlerReady={(handler) => {
          pitHandlerRef.current = handler;
        }}
        onSpectateControlsReady={(controls) => {
          spectateControlsRef.current = controls;
        }}
        onInRaceControlsReady={(controls) => {
          inRaceControlsRef.current = controls;
        }}
        onReplayStateChange={setReplayState}
        onPhotoStateChange={setPhotoState}
        onReplayAndPhotoControlsReady={(controls) => {
          replayControlsRef.current = controls;
        }}
        onCycleMfd={handleCycleMfd}
      />

      {/* PWA Install button in top-right paddock header during title screen */}
      {phase === 'title' && titleVisible && (
        <div className="fixed top-3 right-3 z-30">
          <PWAInstallButton compact />
        </div>
      )}

      {/* Title Screen (kept mounted during title phase for smooth fade-in/fade-out with sub-menus) */}
      {phase === 'title' && (
        <TitleOverlay
          visible={titleVisible}
          raceConfig={raceConfig}
          roomCode={room?.code ?? null}
          activeChampionshipLabel={
            activeChampionship && !activeChampionship.completed
              ? `${activeChampionship.name} (R${activeChampionship.currentRoundIndex + 1}/${activeChampionship.rounds.length})`
              : null
          }
          onOpenRace={() => {
            setMultiplayerOpen(false);
            setModesHubOpen(false);
            if (raceConfig.sessionMode === 'ai-race') {
              handleUpdateConfig({ sessionMode: 'race' });
            }
            setRaceMenuOpen(true);
          }}
          onOpenModesHub={() => {
            setRaceMenuOpen(false);
            setMultiplayerOpen(false);
            setModesHubOpen(true);
          }}
          onOpenHostAiRace={() => {
            setMultiplayerOpen(false);
            setModesHubOpen(false);
            handleUpdateConfig({
              sessionMode: 'ai-race',
              noAi: false,
              aiBotCount: Math.max(2, raceConfig.aiBotCount || 11),
              totalLaps: raceConfig.totalLaps > 0 ? raceConfig.totalLaps : 5,
            });
            setRaceMenuOpen(true);
          }}
          onOpenMultiplayer={() => {
            setRaceMenuOpen(false);
            setModesHubOpen(false);
            setMultiplayerOpen(true);
          }}
          onOpenCarsShowcase={() => setCarsShowcaseOpen(true)}
          onOpenTracksShowcase={() => setTracksShowcaseOpen(true)}
          onOpenStudio={() => handleOpenStudio()}
          onOpenLiveryStudio={() => setLiveryStudioOpen(true)}
          onOpenSoundStudio={() => setSoundStudioOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
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
          onStartRace={(patch) => handleStartSinglePlayer(patch)}
          onOpenStudio={(trackToEdit) => handleOpenStudio(trackToEdit)}
          onOpenCarSetup={() => setCarSetupOpen(true)}
          onClose={() => setRaceMenuOpen(false)}
        />
      )}

      {/* Lazy-Loaded Heavy Studios & Secondary Modals */}
      <Suspense fallback={null}>
        {/* Championships, Time Trial, Daily Hotlap, Scenarios, Licenses, Elimination & Collector Career Hub */}
        {modesHubOpen && (
          <ModesHubModal
            raceConfig={raceConfig}
            activeChampionship={activeChampionship}
            onUpdateChampionship={setActiveChampionship}
            onLaunchChampionshipStage={handleLaunchChampionshipStage}
            onStartModeSession={(patch) => handleStartSinglePlayer(patch)}
            onApplyHeritageLivery={(liveryPatch) => {
              handleChangeLivery({ ...raceConfig.playerLivery, ...liveryPatch });
            }}
            onClose={() => setModesHubOpen(false)}
          />
        )}

        {/* Unified Multiplayer Room Creation & Lobby */}
        {multiplayerOpen && (
          <MultiplayerModal
            config={raceConfig}
            room={room}
            myPeerId={mpClientRef.current.peerId}
            myPingMs={myPingMs}
            connectionMode={connectionMode}
            customTracksNonce={customTracksNonce}
            mpError={mpError}
            chatMessages={chatMessages}
            onFetchPublicLobbies={() => mpClientRef.current!.fetchPublicLobbies()}
            onSendChat={(text) => mpClientRef.current?.sendChat(text)}
            onKickPeer={(targetId) => mpClientRef.current?.kickPeer(targetId)}
            onVoteTrack={(trackId) => mpClientRef.current?.voteTrack(trackId)}
            onUpdateConfig={handleUpdateConfig}
            onUpdatePeer={(payload) => mpClientRef.current?.updatePeer(payload)}
            onCreateRoom={async (name, opts) => {
              try {
                setMpError(null);
                setChatMessages([]);
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
                  opts,
                );
              } catch (err: unknown) {
                setMpError(err instanceof Error ? err.message : 'Failed to create room');
              }
            }}
            onJoinRoom={async (code, name, opts) => {
              try {
                setMpError(null);
                setChatMessages([]);
                await mpClientRef.current?.joinRoom(
                  code,
                  name,
                  raceConfig.playerCarId,
                  raceConfig.playerLivery,
                  getCarById(raceConfig.playerCarId).classId,
                  opts,
                );
              } catch (err: unknown) {
                setMpError(err instanceof Error ? err.message : 'Failed to join room');
              }
            }}
            onLeaveRoom={() => {
              try {
                mpClientRef.current?.leaveRoom();
                setRoom(null);
                setChatMessages([]);
                setMpError(null);
              } catch (err: unknown) {
                setMpError(err instanceof Error ? err.message : 'Error leaving room');
              }
            }}
            onStartFromLobby={handleStartSession}
            onClose={() => setMultiplayerOpen(false)}
          />
        )}

        {/* Interactive IMSA Sound Studio */}
        {soundStudioOpen && (
          <SoundEditorModal
            currentCarId={raceConfig.playerCarId}
            onClose={() => setSoundStudioOpen(false)}
          />
        )}

        {/* 3D Livery Studio & UV Painter */}
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

        {/* Cars Showcase 3D Menu */}
        {carsShowcaseOpen && (
          <CarsShowcaseModal
            selectedCarId={raceConfig.playerCarId}
            selectedLivery={raceConfig.playerLivery}
            onSelectCar={handleSelectCar}
            onClose={() => setCarsShowcaseOpen(false)}
          />
        )}

        {/* Tracks Showcase 3D Menu */}
        {tracksShowcaseOpen && (
          <TracksShowcaseModal
            selectedTrackId={raceConfig.trackId}
            selectedCustomTrack={raceConfig.customTrack}
            onSelectTrack={(trackId, customTrack) => {
              handleUpdateConfig({ trackId, customTrack });
            }}
            onClose={() => setTracksShowcaseOpen(false)}
          />
        )}
      </Suspense>

      {/* Active Race / Qualifying HUD (hidden during Photo Mode & Replay Theater) */}
      {(phase === 'playing' || phase === 'qualifying') &&
        hud &&
        !photoState?.active &&
        !replayState?.active && (
          <>
            <RaceHUD
              hud={hud}
              trackId={raceConfig.trackId}
              customTrack={raceConfig.customTrack}
              playerCarId={raceConfig.playerCarId}
              muted={muted}
              touchControlsActive={touchControlsActive}
              mfdPage={mfdPage}
              onCycleMfd={handleCycleMfd}
              onCycleTcLevel={() => inRaceControlsRef.current?.cycleTcLevel?.()}
              onTriggerFlashback={() => inRaceControlsRef.current?.triggerFlashback?.()}
              onOpenPhotoMode={() => inRaceControlsRef.current?.openPhotoMode?.()}
              onChangePitStrategy={setPitStrategy}
              onRequestPitStop={(action, nextCompound) =>
                pitHandlerRef.current ? pitHandlerRef.current(action, nextCompound) : false
              }
              onCycleCamera={handleCycleCamera}
              onToggleSpectatorCameraMode={() => spectateControlsRef.current?.toggleCameraMode()}
              onCycleSpectatedCar={(dir) => spectateControlsRef.current?.cycleCar(dir)}
              onSelectSpectatedCar={(carId) => spectateControlsRef.current?.selectCar(carId)}
              onToggleMute={handleToggleMute}
              onTogglePause={handleTogglePause}
              onReturnToTitle={handleReturnToTitle}
              onCycleErsMode={() => inRaceControlsRef.current?.cycleErsMode()}
              onAdjustBrakeBalance={(delta) => inRaceControlsRef.current?.adjustBrakeBalance(delta)}
              onSetAiPaceOrder={(carId, order) => inRaceControlsRef.current?.setAiPaceOrder(carId, order)}
              onSetAiErsMode={(carId, mode) => inRaceControlsRef.current?.setAiErsMode(carId, mode)}
              onCallAiOnTrackService={(carId, action, compound) =>
                inRaceControlsRef.current?.callAiOnTrackService(carId, action, compound)
              }
            />
            {gameSettings.showControlsBriefing &&
              !briefingDismissed &&
              !isAiRaceSession &&
              hud.countdown > 0 && (
                <ControlsBriefingCard
                  carId={raceConfig.playerCarId}
                  onDismiss={() => {
                    markBriefingDismissed();
                    setBriefingDismissed(true);
                  }}
                />
              )}
            <TouchControlsOverlay
              visible={touchControlsActive}
              steerStyle={gameSettings.touchSteerStyle}
              isFreecam={isAiRaceSession && spectatorCameraMode === 'freecam'}
              isAiRace={isAiRaceSession}
              specialLabel={playerSpecial.specialType !== 'none' ? playerSpecial.specialLabel : undefined}
              specialActive={hud.specialActive}
              specialCharge={hud.specialCharge}
            />
          </>
        )}

      {/* Instant Replay Theater & Photo Mode Studio Overlay */}
      <ReplayAndPhotoOverlay
        replayState={replayState}
        photoState={photoState}
        controls={replayControlsRef.current}
      />

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
      {phase === 'paused' && !photoState?.active && !replayState?.active && (
        <PauseModal
          onResume={() => {
            setSettingsOpen(false);
            handleTogglePause();
          }}
          onRestart={() => {
            setSettingsOpen(false);
            setRunNonce((n) => n + 1);
            setPhase(activePrePausePhase);
          }}
          onOpenPhotoMode={() => {
            setSettingsOpen(false);
            handleTogglePause();
            replayControlsRef.current?.enterPhotoMode();
          }}
          onOpenReplay={() => {
            setSettingsOpen(false);
            handleTogglePause();
            replayControlsRef.current?.enterReplay();
          }}
          onTriggerFlashback={
            !room
              ? () => {
                  setSettingsOpen(false);
                  handleTogglePause();
                  inRaceControlsRef.current?.triggerFlashback?.();
                }
              : undefined
          }
          replayAvailable={(replayState?.duration ?? 0) > 1 || (hud?.lap ?? 1) > 1 || (hud?.currentLapTime ?? 0) > 1}
          flashbackAvailable={!room && ((hud?.lap ?? 1) > 1 || (hud?.currentLapTime ?? 0) > 2)}
          onOpenSettings={() => setSettingsOpen(true)}
          onReturnToTitle={handleReturnToTitle}
        />
      )}

      <Suspense fallback={null}>
        {/* Settings Modal (accessible from Title Paddock & Pause Menu) */}
        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

        {/* Garage Car Setup & BoP Workbench Modal */}
        {carSetupOpen && (
          <CarSetupModal
            open={carSetupOpen}
            carId={raceConfig.playerCarId}
            trackId={raceConfig.trackId}
            currentSetup={raceConfig.carSetup}
            onClose={() => setCarSetupOpen(false)}
            onApplySetup={(setup) => {
              handleUpdateConfig({ carSetup: setup });
            }}
          />
        )}
      </Suspense>

      {/* Post-Race Results Modal (hidden while reviewing Replay Theater) */}
      {phase === 'gameover' && finalSnapshot && !replayState?.active && (
        <ResultsModal
          snapshot={finalSnapshot}
          trackName={track.name}
          raceConfig={raceConfig}
          activeChampionship={activeChampionship}
          championshipPointsEarned={lastChampPoints}
          careerReward={lastCareerReward}
          scenarioResult={lastScenarioResult}
          onWatchReplay={() => replayControlsRef.current?.enterReplay()}
          onNextChampionshipRound={
            activeChampionship && !activeChampionship.completed
              ? () => handleLaunchChampionshipStage(activeChampionship, false)
              : undefined
          }
          onRaceAgain={handleStartSession}
          onReturnToTitle={handleReturnToTitle}
        />
      )}

      {/* Global PWA Offline & Mobile Landscape Indicators */}
      <OfflineIndicator />
      <LandscapeMobileBanner active={phase === 'playing' || phase === 'qualifying'} />

      {/* Smooth Main Menu / Session Fade-In & Fade-Out Curtain with Circuit Trivia Tip */}
      <div
        aria-hidden="true"
        data-testid="screen-fade-overlay"
        className={`fixed inset-0 z-50 pointer-events-none bg-[#0b0e13] transition-opacity duration-300 ease-in-out flex flex-col items-center justify-center px-6 text-center ${
          screenFading ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-amber-400/90">
          {track.name} · {track.country}
        </div>
        {track.circuitInfo && (
          <div className="mt-2 max-w-md text-xs text-slate-400 leading-relaxed">
            {track.circuitInfo}
          </div>
        )}
      </div>
    </main>
  );
}
