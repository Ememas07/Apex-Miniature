import { useEffect, useRef, useState } from 'react';
import { MultiplayerClient } from '../game/multiplayer';
import { ReplayBookmark } from '../game/replay';
import { getGameSettings, subscribeGameSettings } from '../game/settings';
import {
  AiPaceOrder,
  CameraMode,
  ErsMode,
  GamePhase,
  HudSnapshot,
  MfdPage,
  PhotoFilterId,
  PitServiceAction,
  PitStrategy,
  RaceConfig,
  RoomPeer,
  SpectatorCameraMode,
  TireCompound,
} from '../game/types';
import { MotorsportAudioEngine } from './audioEngine';
import {
  RaceSceneRenderer,
  scheduleSoftwareGlFrame,
  ViewportInputController,
} from './RaceSceneRenderer';
import { RaceSimulationEngine } from './RaceSimulationEngine';

export interface SpectateControls {
  cycleCar: (dir: 1 | -1) => void;
  selectCar: (carId: string) => void;
  setCameraMode: (mode: SpectatorCameraMode) => void;
  toggleCameraMode: () => void;
}

export interface InRaceTelemetryControls {
  cycleErsMode: () => void;
  cycleTcLevel?: () => void;
  adjustBrakeBalance: (delta: number) => void;
  triggerFlashback?: () => boolean;
  setMfdPage?: (page: MfdPage) => void;
  openPhotoMode?: () => void;
  openReplay?: () => void;
  setAiPaceOrder: (carId: string, order: AiPaceOrder) => void;
  setAiErsMode: (carId: string, mode: ErsMode) => void;
  callAiOnTrackService: (carId: string, action: PitServiceAction, compound?: TireCompound) => boolean;
}

export interface PhotoModeState {
  active: boolean;
  fov: number;
  rollDeg: number;
  exposure: number;
  contrast: number;
  saturation: number;
  tiltShift: boolean;
  tiltShiftStrength: number;
  filter: PhotoFilterId;
  watermark: boolean;
}

export interface ReplayStateSnapshot {
  active: boolean;
  playing: boolean;
  time: number;
  duration: number;
  speed: number;
  focusCarId: string;
  cameraMode: CameraMode;
  cars: Array<{ id: string; name: string }>;
  bookmarks: ReplayBookmark[];
}

export interface ReplayAndPhotoControls {
  enterReplay: () => void;
  exitReplay: () => void;
  setReplayPlaying: (playing: boolean) => void;
  setReplaySpeed: (speed: number) => void;
  seekReplay: (timeSec: number) => void;
  setReplayFocusCar: (carId: string) => void;
  setReplayCamera: (mode: CameraMode) => void;
  enterPhotoMode: () => void;
  exitPhotoMode: () => void;
  updatePhotoSettings: (patch: Partial<PhotoModeState>) => void;
  capturePhoto: (withWatermark: boolean) => void;
}

export interface RaceViewportProps {
  phase: GamePhase;
  raceConfig: RaceConfig;
  cameraMode: CameraMode;
  spectatorCameraMode?: SpectatorCameraMode;
  muted: boolean;
  pitStrategy: PitStrategy;
  runNonce: number;
  mpClient: MultiplayerClient;
  roomPeers: RoomPeer[];
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onRaceFinish: (snapshot: HudSnapshot) => void;
  onQualifyingFinish: (qualiTime: number, gridPos: number) => void;
  onTogglePause: () => void;
  onCycleCamera: () => void;
  onSpectatorCameraModeChange?: (mode: SpectatorCameraMode) => void;
  onToggleMute: () => void;
  onPitHandlerReady?: (handler: (action: PitServiceAction, nextCompound?: TireCompound) => boolean) => void;
  onSpectateControlsReady?: (controls: SpectateControls) => void;
  onInRaceControlsReady?: (controls: InRaceTelemetryControls) => void;
  onReplayStateChange?: (state: ReplayStateSnapshot) => void;
  onPhotoStateChange?: (state: PhotoModeState) => void;
  onReplayAndPhotoControlsReady?: (controls: ReplayAndPhotoControls) => void;
  onCycleMfd?: () => void;
}

export function RaceViewport(props: RaceViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [attractFaded, setAttractFaded] = useState(false);
  const setAttractFadedRef = useRef(setAttractFaded);
  setAttractFadedRef.current = setAttractFaded;

  const runtimeRef = useRef<{
    engine: RaceSimulationEngine;
    sceneRenderer: RaceSceneRenderer;
    rebuildWorld: () => void;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let activeSettings = getGameSettings();
    const audio = new MotorsportAudioEngine();
    const engine = new RaceSimulationEngine(propsRef.current.raceConfig, () => audio.playRadioChirp());
    engine.raceRadio.configure({
      verbosity: activeSettings.engineerVerbosity,
      volume: activeSettings.uiRadioVolume,
      muted: propsRef.current.muted,
      voiceEnabled: activeSettings.radioVoiceEnabled,
    });
    audio.applyMixerSettings(activeSettings);

    const sceneRenderer = new RaceSceneRenderer({
      container,
      settings: activeSettings,
      initialCameraMode: propsRef.current.cameraMode,
      initialSpectatorMode: propsRef.current.spectatorCameraMode ?? 'spectate',
      getPhase: () => propsRef.current.phase,
      getSessionMode: () => propsRef.current.raceConfig.sessionMode,
      getCameraMode: () => propsRef.current.cameraMode,
      getCars: () => engine.cars,
      getSpectatedCarId: () => engine.spectatedCarId,
      onAudioUnlock: () => audio.init(),
      onSpectatorCameraModeChange: (mode) => propsRef.current.onSpectatorCameraModeChange?.(mode),
    });

    const emitPhotoState = () => propsRef.current.onPhotoStateChange?.(sceneRenderer.getPhotoState());
    const emitReplayState = () => propsRef.current.onReplayStateChange?.(sceneRenderer.getReplayState(engine));

    const rebuildWorld = () => {
      const p = propsRef.current;
      const flags = engine.rebuildSession({
        phase: p.phase,
        raceConfig: p.raceConfig,
        cameraMode: p.cameraMode,
        pitStrategy: p.pitStrategy,
        mpClient: p.mpClient,
        roomPeers: p.roomPeers,
        settings: activeSettings,
      });
      sceneRenderer.rebuildVisuals(engine, {
        ...flags,
        settings: activeSettings,
        cameraMode: p.cameraMode,
        spectatorMode: p.spectatorCameraMode,
      });
      emitReplayState();
      emitPhotoState();
    };

    runtimeRef.current = { engine, sceneRenderer, rebuildWorld };
    rebuildWorld();

    const enterPhotoMode = () => propsRef.current.onPhotoStateChange?.(sceneRenderer.enterPhotoMode());
    const exitPhotoMode = () => propsRef.current.onPhotoStateChange?.(sceneRenderer.exitPhotoMode(activeSettings));
    const enterReplayMode = () => {
      if (!engine.replayRecorder.hasFrames()) return;
      const dur = engine.replayRecorder.getDuration();
      sceneRenderer.replay.active = true;
      sceneRenderer.replay.playing = true;
      sceneRenderer.replay.time = dur.start;
      sceneRenderer.replay.speed = 1;
      sceneRenderer.replay.focusCarId = engine.cars.find((c) => c.isPlayer)?.id ?? engine.cars[0]?.id ?? 'player';
      emitReplayState();
    };

    const triggerFlashback = (): boolean => {
      const ok = engine.triggerFlashback(propsRef.current.roomPeers.length, propsRef.current.raceConfig.sessionMode);
      if (ok) audio.playBeep(620, 0.08);
      return ok;
    };

    const inputCtrl = new ViewportInputController(engine, sceneRenderer, activeSettings, {
      getPhase: () => propsRef.current.phase,
      getSessionMode: () => propsRef.current.raceConfig.sessionMode,
      getSettings: () => activeSettings,
      onTogglePause: () => propsRef.current.onTogglePause(),
      onCycleCamera: () => propsRef.current.onCycleCamera(),
      onToggleMute: () => propsRef.current.onToggleMute(),
      onCycleMfd: () => propsRef.current.onCycleMfd?.(),
      onBrakeBalance: (d) => {
        const next = engine.adjustBrakeBalance(d);
        if (next !== null) audio.playBeep(500 + (next - 46) * 8, 0.04);
      },
      onCycleErs: () => {
        if (engine.cycleErsMode()) audio.playBeep(640, 0.05);
      },
      onCycleTc: () => {
        const next = engine.cycleTcLevel();
        if (next !== null) audio.playBeep(520 + next * 70, 0.05);
      },
      onFlashback: triggerFlashback,
      onTogglePhotoMode: () => {
        if (sceneRenderer.photo.active) exitPhotoMode();
        else enterPhotoMode();
      },
      onExportTelemetry: () => audio.playBeep(880, 0.08),
      onSetAudioVolume: (v) => audio.setVolume(v),
      onSetAudioMuted: (m) => audio.setMuted(m),
      onAudioUnlock: () => audio.init(),
    });

    propsRef.current.onPitHandlerReady?.((action, nextCompound) => {
      const ok = engine.requestPitStop(action, nextCompound);
      if (ok) audio.playBeep(560, 0.08);
      return ok;
    });

    propsRef.current.onReplayAndPhotoControlsReady?.({
      enterReplay: enterReplayMode,
      exitReplay: () => {
        sceneRenderer.replay.active = false;
        emitReplayState();
      },
      setReplayPlaying: (playing) => {
        sceneRenderer.replay.playing = playing;
        emitReplayState();
      },
      setReplaySpeed: (speed) => {
        sceneRenderer.replay.speed = speed;
        emitReplayState();
      },
      seekReplay: (relTimeSec) => {
        const dur = engine.replayRecorder.getDuration();
        sceneRenderer.replay.time = Math.max(dur.start, Math.min(dur.end, dur.start + relTimeSec));
        emitReplayState();
      },
      setReplayFocusCar: (carId) => {
        sceneRenderer.replay.focusCarId = carId;
        emitReplayState();
      },
      setReplayCamera: (mode) => {
        sceneRenderer.replay.cameraMode = mode;
        emitReplayState();
      },
      enterPhotoMode: () => propsRef.current.onPhotoStateChange?.(sceneRenderer.enterPhotoMode()),
      exitPhotoMode,
      updatePhotoSettings: (patch) => propsRef.current.onPhotoStateChange?.(sceneRenderer.updatePhotoSettings(patch)),
      capturePhoto: (withWatermark) => sceneRenderer.capturePhoto(withWatermark, audio),
    });

    propsRef.current.onInRaceControlsReady?.({
      cycleErsMode: () => {
        if (engine.cycleErsMode()) audio.playBeep(640, 0.05);
      },
      cycleTcLevel: () => {
        const next = engine.cycleTcLevel();
        if (next !== null) audio.playBeep(520 + next * 70, 0.05);
      },
      adjustBrakeBalance: (delta) => {
        const next = engine.adjustBrakeBalance(delta);
        if (next !== null) audio.playBeep(500 + (next - 46) * 8, 0.04);
      },
      triggerFlashback,
      openPhotoMode: () => propsRef.current.onPhotoStateChange?.(sceneRenderer.enterPhotoMode()),
      openReplay: enterReplayMode,
      setAiPaceOrder: (carId, order) => {
        if (engine.setAiPaceOrder(carId, order)) {
          audio.playBeep(order === 'attack' ? 760 : order === 'conserve' ? 440 : 580, 0.05);
        }
      },
      setAiErsMode: (carId, mode) => {
        if (engine.setAiErsMode(carId, mode)) audio.playBeep(620, 0.05);
      },
      callAiOnTrackService: (carId, action, compound) => {
        const ok = engine.callAiOnTrackService(carId, action, compound);
        if (ok) audio.playBeep(680, 0.07);
        return ok;
      },
    });

    propsRef.current.onSpectateControlsReady?.({
      cycleCar: (dir) => {
        if (engine.cars.length === 0) return;
        const idx = engine.cars.findIndex((c) => c.id === engine.spectatedCarId);
        const nextCar = engine.cars[idx < 0 ? 0 : (idx + dir + engine.cars.length) % engine.cars.length];
        engine.spectatedCarId = nextCar.id;
        sceneRenderer.resetGameplayCamera(nextCar, true);
        if (sceneRenderer.spectatorCameraMode === 'freecam') sceneRenderer.setSpectatorCameraMode('spectate');
      },
      selectCar: (carId) => {
        const nextCar = engine.cars.find((c) => c.id === carId);
        if (!nextCar) return;
        engine.spectatedCarId = carId;
        sceneRenderer.resetGameplayCamera(nextCar, true);
        if (sceneRenderer.spectatorCameraMode === 'freecam') sceneRenderer.setSpectatorCameraMode('spectate');
      },
      setCameraMode: (mode) => sceneRenderer.setSpectatorCameraMode(mode),
      toggleCameraMode: () =>
        sceneRenderer.setSpectatorCameraMode(sceneRenderer.spectatorCameraMode === 'spectate' ? 'freecam' : 'spectate'),
    });

    const unsubscribeSettings = subscribeGameSettings((next) => {
      activeSettings = next;
      inputCtrl.applySettings(next);
      audio.applyMixerSettings(next);
      engine.raceRadio.configure({
        verbosity: next.engineerVerbosity,
        volume: next.uiRadioVolume,
        muted: propsRef.current.muted,
        voiceEnabled: next.radioVoiceEnabled,
      });
      engine.applySettings(next);
      sceneRenderer.applySettings(next, engine.compiledTrack, engine.trackWetness);
    });

    let frameId = 0;
    let lastTime = performance.now();
    let disposed = false;
    let lastSyncedMuted: boolean | null = null;

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      const p = propsRef.current;
      if (lastSyncedMuted !== p.muted) {
        lastSyncedMuted = p.muted;
        audio.setMuted(p.muted);
      }

      const polled = inputCtrl.pollFrame(activeSettings);
      const stepRes = engine.step(
        dt,
        rawDt,
        now,
        {
          throttle: polled.throttle,
          brake: polled.brake,
          steer: polled.steer,
          specialPressed: polled.specialPressed,
          specialJustPressed: polled.specialJustPressed,
          shiftUp: polled.shiftUp,
          shiftDown: polled.shiftDown,
        },
        {
          phase: p.phase,
          raceConfig: p.raceConfig,
          cameraMode: p.cameraMode,
          pitStrategy: p.pitStrategy,
          mpClient: p.mpClient,
          roomPeers: p.roomPeers,
          settings: activeSettings,
        },
        sceneRenderer.fpsSmoothed,
        sceneRenderer.photo.active,
        sceneRenderer.replay.active,
        sceneRenderer.spectatorCameraMode,
      );

      if (stepRes.attractFaded !== undefined) setAttractFadedRef.current(stepRes.attractFaded);
      if (stepRes.shouldRebuildAttract) rebuildWorld();
      for (const ae of stepRes.audioEvents) {
        if (ae.type === 'beep') audio.playBeep(ae.freq, ae.duration);
        else audio.playImpact(ae.intensity, ae.kind);
      }
      for (const re of stepRes.rumbleEvents) {
        inputCtrl.gamepad.triggerRumble(re.weak, re.strong, re.durationMs);
      }

      sceneRenderer.renderFrame({
        dt,
        nowMs: now,
        phase: p.phase,
        cameraMode: p.cameraMode,
        sessionMode: p.raceConfig.sessionMode,
        totalLaps: p.raceConfig.totalLaps,
        spectatorCameraMode: p.spectatorCameraMode,
        settings: activeSettings,
        keysPressed: inputCtrl.keysPressed,
        gp: polled.gp,
        touchMove: polled.touchIn,
        throttle: polled.throttle,
        brake: polled.brake,
        engine,
        audio,
        ghostPose: stepRes.ghostPose,
        onReplayTick: (rs) => propsRef.current.onReplayStateChange?.(rs),
        onRumble: (w, s, ms) => inputCtrl.gamepad.triggerRumble(w, s, ms),
      });

      if (stepRes.hudSnapshot) p.onHudUpdate(stepRes.hudSnapshot);
      if (stepRes.qualifyingFinish) {
        p.onQualifyingFinish(stepRes.qualifyingFinish.qualiTime, stepRes.qualifyingFinish.gridPos);
      } else if (stepRes.raceFinish) {
        p.onRaceFinish(stepRes.raceFinish);
      }

      if (sceneRenderer.isSoftwareGl) {
        scheduleSoftwareGlFrame(sceneRenderer.renderer, () => disposed, (id) => { frameId = id; }, tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    if (sceneRenderer.isSoftwareGl) {
      scheduleSoftwareGlFrame(sceneRenderer.renderer, () => disposed, (id) => { frameId = id; }, tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      unsubscribeSettings();
      inputCtrl.dispose();
      engine.dispose();
      sceneRenderer.dispose();
      audio.dispose();
      runtimeRef.current = null;
    };
  }, []);

  const lastRebuildKeyRef = useRef<string>('');
  useEffect(() => {
    if (!runtimeRef.current || props.phase === 'paused' || props.phase === 'gameover') return;
    const isTitle = props.phase === 'title';
    const sessionPhase = isTitle ? 'title' : props.phase === 'qualifying' ? 'qualifying' : 'race';
    const ct = props.raceConfig.customTrack;
    const key = isTitle
      ? 'title'
      : `${sessionPhase}:${props.raceConfig.sessionMode ?? 'race'}:${props.raceConfig.trackId}:${ct ? `${ct.waypoints.length}:${ct.createdAt ?? 0}` : ''}:${props.runNonce}`;
    if (key === lastRebuildKeyRef.current) return;
    lastRebuildKeyRef.current = key;
    runtimeRef.current.engine.attractTransitionState = 'idle';
    if (isTitle) runtimeRef.current.engine.attractFocusPassedHalfway = false;
    setAttractFaded(false);
    runtimeRef.current.rebuildWorld();
  }, [props.raceConfig.trackId, props.raceConfig.customTrack, props.raceConfig.sessionMode, props.runNonce, props.phase]);

  return (
    <>
      <div
        ref={containerRef}
        data-testid="race-viewport"
        className="fixed inset-0 w-full h-full min-h-0 overflow-hidden touch-none"
        aria-label="3D Miniature Motorsport Race Viewport"
      />
      <div
        aria-hidden="true"
        data-testid="attract-fade-overlay"
        className={`fixed inset-0 z-[5] pointer-events-none bg-[#0b0e13] transition-opacity duration-700 ease-in-out ${
          attractFaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </>
  );
}
