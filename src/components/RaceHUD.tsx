import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Cpu,
  Eye,
  Fuel,
  GripHorizontal,
  Home,
  Navigation,
  Pause,
  Shield,
  Volume2,
  VolumeX,
  Wrench,
} from 'lucide-react';
import { CAR_CLASSES, getCarById, resolveCarSpecial } from '../game/cars';
import { formatLapTime } from '../game/physics';
import { compileTrack, getTrackById } from '../game/tracks';
import { formatWeatherCondition } from '../game/raceSystems';
import {
  formatKeyCode,
  formatSpeed,
  formatTemp,
  GameSettings,
  getGameSettings,
  getSemanticPalette,
  HudWidgetId,
  HudWidgetOffsets,
  KeybindMap,
  loadHudWidgetOffsets,
  saveHudWidgetOffsets,
  subscribeGameSettings,
  subscribeHudWidgetOffsets,
} from '../game/settings';
import {
  AiPaceOrder,
  ErsMode,
  HudSnapshot,
  MfdPage,
  PitServiceAction,
  PitStrategy,
  TireCompound,
  TrackSpec,
} from '../game/types';

interface DraggableHudPanelProps {
  id: HudWidgetId;
  offsets: HudWidgetOffsets;
  hudScale: number;
  onCommitOffset: (id: HudWidgetId, next: { x: number; y: number }) => void;
  className?: string;
  gripPosition?: 'top-right' | 'top-left' | 'top-center';
  children: ReactNode;
}

function DraggableHudPanel({
  id,
  offsets,
  hudScale,
  onCommitOffset,
  className = '',
  gripPosition = 'top-right',
  children,
}: DraggableHudPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const offset = offsets[id] ?? { x: 0, y: 0 };
  const [liveOffset, setLiveOffset] = useState<{ x: number; y: number } | null>(null);
  const activeOffset = liveOffset ?? offset;

  const handleGripPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      const originX = offset.x;
      const originY = offset.y;
      const scale = Math.max(0.5, hudScale || 1);
      const rect = panelRef.current?.getBoundingClientRect();
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 720;

      const clampDelta = (rawX: number, rawY: number) => {
        let nx = rawX;
        let ny = rawY;
        if (rect) {
          const dx = rawX - originX;
          const dy = rawY - originY;
          const minDx = -rect.left + 8;
          const maxDx = vw - rect.right - 8;
          const minDy = -rect.top + 8;
          const maxDy = vh - rect.bottom - 8;
          nx = originX + Math.max(minDx, Math.min(maxDx, dx)) / scale;
          ny = originY + Math.max(minDy, Math.min(maxDy, dy)) / scale;
        }
        return { x: Math.round(nx), y: Math.round(ny) };
      };

      let latest = { x: originX, y: originY };
      const onMove = (ev: PointerEvent) => {
        ev.stopPropagation();
        const rawX = originX + (ev.clientX - startX) / scale;
        const rawY = originY + (ev.clientY - startY) / scale;
        latest = clampDelta(rawX, rawY);
        setLiveOffset(latest);
      };
      const onUp = (ev: PointerEvent) => {
        ev.stopPropagation();
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        setLiveOffset(null);
        onCommitOffset(id, latest);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [hudScale, id, offset.x, offset.y, onCommitOffset],
  );

  const gripPosClass =
    gripPosition === 'top-left'
      ? '-top-2 left-1.5'
      : gripPosition === 'top-center'
      ? '-top-2 left-1/2 -translate-x-1/2'
      : '-top-2 right-1.5';

  return (
    <div
      ref={panelRef}
      data-hud-widget={id}
      className={`relative group ${className}`}
      style={
        activeOffset.x !== 0 || activeOffset.y !== 0
          ? { transform: `translate3d(${activeOffset.x}px, ${activeOffset.y}px, 0)` }
          : undefined
      }
    >
      <button
        type="button"
        tabIndex={-1}
        onPointerDown={handleGripPointerDown}
        title="Drag to reposition HUD panel"
        aria-label={`Move ${id} HUD panel`}
        className={`absolute ${gripPosClass} z-30 pointer-events-auto px-1.5 py-0.2 rounded-full bg-[#0b0e13]/90 border border-white/20 text-slate-400 hover:text-amber-300 hover:border-amber-400/60 opacity-45 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-grab active:cursor-grabbing shadow`}
      >
        <GripHorizontal className="w-3 h-3" />
      </button>
      {children}
    </div>
  );
}

function formatClockMMSS(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

interface RaceHUDProps {
  hud: HudSnapshot;
  trackId: string;
  customTrack?: TrackSpec;
  playerCarId: string;
  muted: boolean;
  onChangePitStrategy: (strategy: PitStrategy) => void;
  onRequestPitStop: (action: PitServiceAction, nextCompound?: TireCompound) => boolean;
  onCycleCamera: () => void;
  onToggleSpectatorCameraMode?: () => void;
  onCycleSpectatedCar?: (dir: 1 | -1) => void;
  onSelectSpectatedCar?: (carId: string) => void;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onReturnToTitle: () => void;
  onCycleErsMode?: () => void;
  onAdjustBrakeBalance?: (delta: number) => void;
  onSetAiPaceOrder?: (carId: string, order: AiPaceOrder) => void;
  onSetAiErsMode?: (carId: string, mode: ErsMode) => void;
  onCallAiOnTrackService?: (carId: string, action: PitServiceAction, compound?: TireCompound) => void;
  touchControlsActive?: boolean;
  mandatoryServiceStop?: boolean;
  mfdPage?: MfdPage;
  onCycleMfd?: () => void;
  onCycleTcLevel?: () => void;
  onTriggerFlashback?: () => void;
  onOpenPhotoMode?: () => void;
}

export function RaceHUD({
  hud,
  trackId,
  customTrack,
  playerCarId,
  muted,
  onChangePitStrategy,
  onRequestPitStop,
  onCycleCamera,
  onToggleSpectatorCameraMode,
  onCycleSpectatedCar,
  onSelectSpectatedCar,
  onToggleMute,
  onTogglePause,
  onReturnToTitle,
  onCycleErsMode,
  onAdjustBrakeBalance,
  onSetAiPaceOrder,
  onSetAiErsMode,
  onCallAiOnTrackService,
  touchControlsActive = false,
  mandatoryServiceStop = false,
  mfdPage: externalMfdPage,
  onCycleMfd,
  onCycleTcLevel,
  onTriggerFlashback,
  onOpenPhotoMode,
}: RaceHUDProps) {
  const [leaderboardExpanded, setLeaderboardExpanded] = useState(false);
  const [relativeExpanded, setRelativeExpanded] = useState(true);
  const [aiServiceCompound, setAiServiceCompound] = useState<TireCompound>('soft');
  const [showAiVisualizer, setShowAiVisualizer] = useState(false);
  const [localMfdPage, setLocalMfdPage] = useState<MfdPage>('tires-brakes');
  const [gameSettings, setGameSettings] = useState<GameSettings>(() => getGameSettings());
  const [hudOffsets, setHudOffsets] = useState<HudWidgetOffsets>(() => loadHudWidgetOffsets());
  const keybinds: KeybindMap = gameSettings.keybinds;
  const activeMfdPage: MfdPage = externalMfdPage ?? localMfdPage;

  useEffect(() => {
    return subscribeGameSettings((next) => {
      setGameSettings({ ...next, keybinds: { ...next.keybinds } });
    });
  }, []);

  useEffect(() => {
    return subscribeHudWidgetOffsets((next) => {
      setHudOffsets({ ...next });
    });
  }, []);

  const commitHudOffset = useCallback((id: HudWidgetId, next: { x: number; y: number }) => {
    setHudOffsets((prev) => {
      const updated = { ...prev, [id]: next };
      saveHudWidgetOffsets(updated);
      return updated;
    });
  }, []);

  const cycleMfd = () => {
    if (onCycleMfd) {
      onCycleMfd();
      return;
    }
    const order: MfdPage[] = ['tires-brakes', 'strategy', 'electronics', 'sectors'];
    const idx = order.indexOf(localMfdPage);
    setLocalMfdPage(order[(idx + 1) % order.length]);
  };

  const palette = getSemanticPalette(gameSettings.colorblindMode);
  const hudPreset = gameSettings.hudPreset;
  const hudScale = gameSettings.hudScale;
  const highContrast = gameSettings.highContrastHud;
  const units = gameSettings.units;

  const track = customTrack || getTrackById(trackId);
  const isAiRace = hud.sessionMode === 'ai-race';
  const isHotlapMode = hud.sessionMode === 'practice' || hud.sessionMode === 'time-trial';
  const spectatorMode = hud.spectatorCameraMode ?? 'spectate';
  const spectatedEntry = isAiRace
    ? hud.standings.find((s) => s.id === hud.spectatedCarId) ?? hud.standings[0] ?? null
    : null;
  const activeCar = spectatedEntry ? getCarById(spectatedEntry.carId) : getCarById(playerCarId);
  const classMeta = CAR_CLASSES[activeCar.classId];
  const carSpecial = resolveCarSpecial(activeCar);
  const hasHybridErs = Boolean(hud.hasErs);
  const isManualGears = hud.transmissionMode === 'manual';
  const isFirstPersonMirrorCam =
    hud.cameraMode === 'hood' || hud.cameraMode === 'bumper' || hud.cameraMode === 'cockpit';
  const isHighOrUltraGraphics =
    gameSettings.graphicsPreset === 'high' || gameSettings.graphicsPreset === 'ultra';
  const show3dVirtualMirror =
    gameSettings.showVirtualMirror && !isAiRace && isFirstPersonMirrorCam && isHighOrUltraGraphics;
  const showTextVirtualMirror =
    gameSettings.showVirtualMirror &&
    !isAiRace &&
    !show3dVirtualMirror &&
    ((hud.rearCarGapM !== null && hud.rearCarGapM !== undefined) ||
      Boolean(hud.blindSpot && hud.blindSpot !== 'clear'));
  const playerStanding = !isAiRace ? hud.standings.find((s) => s.isPlayer) ?? null : null;

  // Relative standings slice for player races (cars immediately ahead and behind)
  const relativeRows = useMemo(() => {
    if (isAiRace || isHotlapMode || hud.standings.length <= 1) return [];
    const playerIdx = hud.standings.findIndex((s) => s.isPlayer);
    if (playerIdx < 0) return [];
    const playerEntry = hud.standings[playerIdx];
    const windowSize = 5;
    let start = Math.max(0, playerIdx - 2);
    let end = Math.min(hud.standings.length, start + windowSize);
    start = Math.max(0, end - windowSize);
    return hud.standings.slice(start, end).map((row) => {
      const isAhead = row.position < playerEntry.position;
      const absGap = Math.abs(row.intervalToLeader - playerEntry.intervalToLeader);
      // Negative = ahead of player, Positive = behind player
      const relGap = row.isPlayer ? 0 : isAhead ? -absGap : absGap;
      return { row, relGap, isAhead };
    });
  }, [isAiRace, isHotlapMode, hud.standings]);

  const minimapGeometry = useMemo(() => {
    const compiled = compileTrack(track, 100);
    const xs = compiled.samples.map((s) => s.x);
    const zs = compiled.samples.map((s) => s.z);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const span = Math.max(maxX - minX, maxZ - minZ, 1);

    const project = (x: number, z: number) => ({
      px: 14 + ((x - minX) / span) * 112,
      py: 14 + ((z - minZ) / span) * 82,
    });

    const pathD =
      compiled.samples
        .map((s, idx) => {
          const { px, py } = project(s.x, s.z);
          return `${idx === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
        })
        .join(' ') + ' Z';

    return { pathD, project };
  }, [track]);

  const showOnTrackPitPrompt =
    !isAiRace && hud.countdown <= 0 && (hud.isStoppedOnTrack || hud.pitStopRemaining > 0);
  const remainingTotal =
    hud.pitStopRemaining +
    hud.pitQueue.reduce((acc, task) => acc + (task === 'tyres' ? 2.0 : task === 'repair' ? 3.0 : 4.0), 0);
  const pitProgressPct =
    hud.pitStopTotal > 0
      ? Math.max(0, Math.min(100, ((hud.pitStopTotal - remainingTotal) / hud.pitStopTotal) * 100))
      : 0;

  if (hudPreset === 'off') {
    return (
      <div
        data-testid="race-hud"
        className="fixed inset-0 z-20 pointer-events-none flex justify-end items-start safe-pad-hud"
      >
        <button
          type="button"
          onClick={onTogglePause}
          className="pointer-events-auto px-2.5 py-1.5 rounded bg-black/75 border border-white/20 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
        >
          <Pause className="w-3.5 h-3.5" />
          HUD Off (H)
        </button>
      </div>
    );
  }

  const formatTimeOfDay = (hours?: number): string => {
    if (hours === undefined || !Number.isFinite(hours)) return '';
    const h = Math.floor(((hours % 24) + 24) % 24);
    const m = Math.floor((hours - Math.floor(hours)) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  return (
    <div
      data-testid="race-hud"
      className={`fixed inset-0 z-20 pointer-events-none flex flex-col justify-between safe-pad-hud ${
        highContrast ? 'contrast-125' : ''
      }`}
      style={
        hudScale !== 1
          ? {
              transform: `scale(${hudScale})`,
              transformOrigin: 'center center',
            }
          : undefined
      }
    >
      {/* TOP BAR CORNERS */}
      <div className="flex items-start justify-between gap-2 sm:gap-4 short:gap-2">
        {/* Top-Left Cluster: Broadcast AI Race / Practice / Race Standings */}
        <DraggableHudPanel
          id="standings"
          offsets={hudOffsets}
          hudScale={hudScale}
          onCommitOffset={commitHudOffset}
          gripPosition="top-right"
          className="bg-[#0b0e13]/92 border border-white/12 rounded-md px-2.5 py-2 sm:px-3.5 sm:py-2.5 short:px-2 short:py-1.5 min-w-0 max-w-[205px] sm:max-w-[276px] md:min-w-[244px] md:max-w-[300px] short:min-w-0 short:max-w-[186px] max-h-[calc(100vh-280px)] overflow-y-auto custom-scroll shadow-lg"
        >
          {isAiRace ? (
            <>
              <div className="flex items-center justify-between gap-2 sm:gap-3">
                <div className="min-w-0">
                  <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-amber-400 block">
                    AI Race Broadcast
                  </span>
                  <span className="font-display font-extrabold text-sm sm:text-base text-white truncate block max-w-[130px] sm:max-w-[180px]">
                    {track.shortName}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[10px] text-slate-400 block">LAP</span>
                  <span className="font-display font-bold text-sm text-white tabular-nums">
                    {hud.lap} / {hud.totalLaps}
                  </span>
                </div>
              </div>

              {/* Spectate / Freecam Switcher */}
              <div className="mt-2.5 grid grid-cols-2 gap-1.5 pointer-events-auto">
                <button
                  type="button"
                  tabIndex={-1}
                  data-testid="btn-spectate-mode"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    if (spectatorMode !== 'spectate') onToggleSpectatorCameraMode?.();
                  }}
                  className={`py-1.5 px-2.5 rounded text-[11px] font-bold border flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    spectatorMode === 'spectate'
                      ? 'bg-red-600 border-red-400 text-white'
                      : 'bg-[#151a24] border-white/10 text-slate-300 hover:text-white'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Spectate</span>
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  data-testid="btn-freecam-mode"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    if (spectatorMode !== 'freecam') onToggleSpectatorCameraMode?.();
                  }}
                  className={`py-1.5 px-2.5 rounded text-[11px] font-bold border flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    spectatorMode === 'freecam'
                      ? 'bg-sky-600 border-sky-400 text-white'
                      : 'bg-[#151a24] border-white/10 text-slate-300 hover:text-white'
                  }`}
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Freecam [F]</span>
                </button>
              </div>

              {/* Spectated Car Switcher */}
              <div className="mt-2 flex items-center justify-between gap-2 bg-[#131822] border border-white/10 rounded px-2 py-1.5 pointer-events-auto">
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onCycleSpectatedCar?.(-1);
                  }}
                  aria-label="Previous AI Car"
                  title="Previous Car ([)"
                  className="p-1 rounded bg-[#1b2230] hover:bg-[#252e40] text-slate-200 cursor-pointer shrink-0"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <div className="min-w-0 flex-1 text-center">
                  <div className="text-[11px] font-bold text-white truncate">
                    P{spectatedEntry?.position ?? hud.position} · {hud.spectatedDriverName || 'AI Driver'}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {hud.spectatedCarName || activeCar.name}
                  </div>
                </div>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onCycleSpectatedCar?.(1);
                  }}
                  aria-label="Next AI Car"
                  title="Next Car (])"
                  className="p-1 rounded bg-[#1b2230] hover:bg-[#252e40] text-slate-200 cursor-pointer shrink-0"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Clickable Live Leaderboard (always open on md+, collapsible on mobile) */}
              {(() => {
                const finishedCount = hud.standings.filter((r) => r.finished).length;
                return finishedCount > 0 && finishedCount < hud.standings.length ? (
                  <div className="mt-2 px-2 py-1 rounded bg-emerald-500/15 border border-emerald-400/35 text-[10px] font-bold text-emerald-300 flex items-center justify-between">
                    <span>CHEQUERED FLAG</span>
                    <span className="font-telemetry tabular-nums">
                      {finishedCount} / {hud.standings.length} Finished
                    </span>
                  </div>
                ) : null;
              })()}
              <div className="mt-2 pt-1.5 sm:mt-2.5 sm:pt-2 border-t border-white/10 pointer-events-auto">
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setLeaderboardExpanded((v) => !v)}
                  className="w-full flex items-center justify-between text-[10px] text-slate-400 mb-1 md:pointer-events-none short:pointer-events-auto cursor-pointer"
                >
                  <span>Live Classification ({hud.totalCars} AI)</span>
                  <span className="hidden md:inline short:hidden">Click to Focus</span>
                  <span className="md:hidden short:inline-flex inline-flex items-center gap-0.5 text-slate-300">
                    {leaderboardExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </span>
                </button>
                <div
                  className={`${
                    leaderboardExpanded ? 'block' : 'hidden md:block short:hidden'
                  } max-h-36 sm:max-h-52 short:max-h-24 overflow-y-auto custom-scroll space-y-0.5 pr-1`}
                >
                  {hud.standings.map((row) => {
                    const cls = CAR_CLASSES[row.classId];
                    const isFocused = row.id === hud.spectatedCarId;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.currentTarget.blur();
                          onSelectSpectatedCar?.(row.id);
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-[11px] text-left cursor-pointer transition-colors ${
                          isFocused
                            ? 'bg-red-600/30 border border-red-500/60 text-white'
                            : 'hover:bg-white/5 border border-transparent text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-telemetry w-5 text-slate-400 shrink-0">P{row.position}</span>
                          <span
                            className="px-1 py-0.2 text-[9px] font-display font-bold rounded-sm shrink-0"
                            style={{ backgroundColor: cls.plateColor, color: cls.badgeTextColor }}
                          >
                            {cls.shortName}
                          </span>
                          <span className="truncate font-semibold">{row.name}</span>
                        </div>
                        <span className="font-telemetry text-[10px] text-slate-400 shrink-0">
                          {row.position === 1 ? 'LDR' : `+${row.intervalToLeader.toFixed(1)}s`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : isHotlapMode ? (
            <>
              <div className="flex items-baseline justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-lg sm:text-xl font-display font-extrabold tracking-wide leading-none ${
                      hud.sessionMode === 'time-trial' ? 'text-sky-400' : 'text-emerald-400'
                    }`}
                  >
                    {hud.sessionMode === 'time-trial' ? 'TIME TRIAL' : 'PRACTICE'}
                  </span>
                  <span
                    className="px-1.5 py-0.5 text-[10px] font-display font-bold rounded-sm"
                    style={{ backgroundColor: classMeta.plateColor, color: classMeta.badgeTextColor }}
                  >
                    {classMeta.shortName}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block">
                    {hud.ghostLabel ? hud.ghostLabel.toUpperCase() : 'SOLO HOTLAP'}
                  </span>
                  <span className="font-display font-bold text-sm text-white tabular-nums">
                    {hud.totalLaps > 0 ? `LAP ${hud.lap} / ${hud.totalLaps}` : `LAP ${hud.lap}`}
                  </span>
                </div>
              </div>

              <div className="mt-2 pt-2 short:mt-1 short:pt-1 border-t border-white/10 grid grid-cols-2 short:grid-cols-1 gap-x-4 gap-y-1 text-xs short:text-[10px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Lap</span>
                  <span className="font-telemetry text-white">{formatLapTime(hud.currentLapTime)}</span>
                </div>
                <div className="flex justify-between short:hidden">
                  <span className="text-slate-400">Best</span>
                  <span className="font-telemetry text-emerald-400">{formatLapTime(hud.bestLapTime)}</span>
                </div>
                <div className="flex justify-between short:hidden">
                  <span className="text-slate-400">Last</span>
                  <span className="font-telemetry text-slate-200">{formatLapTime(hud.lastLapTime)}</span>
                </div>
                <div className="flex justify-between short:hidden">
                  <span className="text-slate-400">Sector</span>
                  <span className="font-telemetry text-sky-300">S{hud.currentSector ?? 1}</span>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-white/10 grid grid-cols-3 gap-2 text-[11px] short:hidden">
                {[0, 1, 2].map((idx) => {
                  const val = hud.sectorTimes?.[idx] ?? hud.lastLapSectorTimes?.[idx] ?? null;
                  const best = hud.bestSectorTimes?.[idx] ?? null;
                  const sessionBest = hud.sessionBestSectorTimes?.[idx] ?? null;
                  const isPurple =
                    val !== null && sessionBest !== null && Math.abs(val - sessionBest) < 0.005;
                  const isGreen =
                    !isPurple && val !== null && best !== null && Math.abs(val - best) < 0.005;
                  return (
                    <div key={idx} className="bg-[#131822] rounded px-1.5 py-1 text-center">
                      <div className="text-[10px] text-slate-400">S{idx + 1}</div>
                      <div
                        className={`font-telemetry font-semibold ${
                          isPurple
                            ? 'text-fuchsia-400'
                            : isGreen
                            ? 'text-emerald-400'
                            : val !== null
                            ? 'text-amber-300'
                            : 'text-slate-500'
                        }`}
                      >
                        {val !== null ? `${val.toFixed(2)}s` : '--'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              {(hud.championshipRoundLabel || hud.scenarioTitle) && (
                <div className="mb-1 text-[10px] font-display font-bold uppercase tracking-wider text-amber-300 truncate">
                  {hud.championshipRoundLabel ?? hud.scenarioTitle}
                </div>
              )}
              <div className="flex items-baseline justify-between gap-2 sm:gap-4 short:gap-2">
                <div className="flex items-baseline gap-1.5 sm:gap-2 short:gap-1">
                  <span className="text-2xl sm:text-3xl short:text-base font-display font-extrabold text-white tabular-nums leading-none">
                    P{hud.position}
                  </span>
                  <span className="text-[11px] sm:text-xs short:text-[10px] text-slate-400 tabular-nums">/{hud.totalCars}</span>
                  <span
                    className="ml-0.5 sm:ml-1 short:ml-0 px-1.5 py-0.5 short:px-1 short:py-0 text-[9px] sm:text-[10px] short:text-[8px] font-display font-bold rounded-sm whitespace-nowrap"
                    style={{ backgroundColor: classMeta.plateColor, color: classMeta.badgeTextColor }}
                  >
                    {classMeta.shortName} P{hud.classPosition}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  {hud.raceTimeRemaining != null ? (
                    <>
                      <span className="text-[10px] sm:text-[11px] short:hidden text-emerald-300 block">
                        TIME LEFT
                      </span>
                      <span className="font-telemetry font-bold text-xs sm:text-sm short:text-[11px] text-white tabular-nums">
                        {formatClockMMSS(hud.raceTimeRemaining)}
                      </span>
                    </>
                  ) : hud.eliminationCountdown != null ? (
                    <>
                      <span className="text-[10px] sm:text-[11px] short:hidden text-orange-400 block">
                        NEXT KO
                      </span>
                      <span className="font-telemetry font-bold text-xs sm:text-sm short:text-[11px] text-orange-300 tabular-nums">
                        {hud.eliminationCountdown.toFixed(1)}s
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-[10px] sm:text-[11px] short:hidden text-slate-400 block">
                        {hud.phase === 'qualifying' ? 'QUALI' : 'LAP'}
                      </span>
                      <span className="font-display font-bold text-xs sm:text-sm short:text-[11px] text-white tabular-nums">
                        <span className="hidden short:inline text-slate-400 font-normal mr-0.5">L</span>
                        {hud.lap}/{hud.totalLaps}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 short:mt-1 short:pt-1 border-t border-white/10 grid grid-cols-2 short:grid-cols-1 gap-x-2.5 sm:gap-x-4 gap-y-0.5 sm:gap-y-1 text-[11px] sm:text-xs short:text-[10px]">
                <div className="hidden sm:flex short:hidden justify-between">
                  <span className="text-slate-400">Ahead</span>
                  <span className="font-telemetry text-rose-300">
                    {hud.intervalAhead !== null ? `-${hud.intervalAhead.toFixed(2)}s` : 'Leader'}
                  </span>
                </div>
                <div className="hidden sm:flex short:hidden justify-between">
                  <span className="text-slate-400">Behind</span>
                  <span className="font-telemetry text-slate-300">
                    {hud.intervalBehind !== null ? `+${hud.intervalBehind.toFixed(2)}s` : '--'}
                  </span>
                </div>
                <div className="flex justify-between gap-1">
                  <span className="text-slate-400">Lap</span>
                  <span className="font-telemetry text-white">{formatLapTime(hud.currentLapTime)}</span>
                </div>
                <div className="flex justify-between gap-1 short:hidden">
                  <span className="text-slate-400">Best</span>
                  <span className="font-telemetry text-emerald-400">{formatLapTime(hud.bestLapTime)}</span>
                </div>
              </div>

              {/* Compact Purple / Green / Yellow Sector Splits (shows completed lap across S/F, clears S2 & S3 once S1 is crossed on new lap) */}
              {(hud.sectorTimes?.some((s) => s !== null) || hud.lastLapSectorTimes?.some((s) => s !== null)) && (
                <div className="hidden sm:grid short:hidden mt-1.5 pt-1.5 border-t border-white/10 grid-cols-3 gap-1.5 text-[10px]">
                  {[0, 1, 2].map((idx) => {
                    const crossedS1ThisLap =
                      hud.sectorTimes?.[0] !== null && hud.sectorTimes?.[0] !== undefined;
                    const val = crossedS1ThisLap
                      ? (hud.sectorTimes?.[idx] ?? null)
                      : (hud.lastLapSectorTimes?.[idx] ?? null);
                    const best = hud.bestSectorTimes?.[idx] ?? null;
                    const sessionBest = hud.sessionBestSectorTimes?.[idx] ?? null;
                    const isPurple =
                      val !== null && sessionBest !== null && Math.abs(val - sessionBest) < 0.005;
                    const isGreen =
                      !isPurple && val !== null && best !== null && Math.abs(val - best) < 0.005;
                    return (
                      <div key={idx} className="bg-[#131822] rounded px-1 py-0.5 text-center font-telemetry">
                        <span className="text-slate-500 mr-1">S{idx + 1}</span>
                        <span
                          className={
                            isPurple
                              ? 'text-fuchsia-400 font-bold'
                              : isGreen
                              ? 'text-emerald-400 font-semibold'
                              : val !== null
                              ? 'text-amber-300'
                              : 'text-slate-500'
                          }
                        >
                          {val !== null ? val.toFixed(1) : '---'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Live Relative Timing Tower (player races, styled like spectate classification) */}
          {!isAiRace && !isHotlapMode && relativeRows.length > 0 && (
            <div className="mt-2 pt-2 short:hidden border-t border-white/10 pointer-events-auto">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] uppercase tracking-wider font-display font-bold text-slate-400">
                  Relative Timing
                </span>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setRelativeExpanded((v) => !v);
                  }}
                  className="text-[9px] text-slate-400 hover:text-white flex items-center gap-0.5 cursor-pointer"
                >
                  {relativeExpanded ? 'Hide' : 'Show'}
                  {relativeExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>
              {relativeExpanded && (
                <div className="space-y-0.5" data-testid="hud-relative-panel">
                  {relativeRows.map(({ row, relGap, isAhead }) => {
                    const rowClass = CAR_CLASSES[row.classId];
                    const gapText = row.isPlayer
                      ? 'YOU'
                      : `${isAhead ? '-' : '+'}${Math.abs(relGap).toFixed(1)}s`;
                    return (
                      <div
                        key={row.id}
                        className={`flex items-center justify-between gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-telemetry ${
                          row.isPlayer
                            ? 'bg-red-600/25 border border-red-500/50 text-white font-bold'
                            : 'bg-[#121722]/90 border border-white/5 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-5 text-slate-400 shrink-0 tabular-nums">P{row.position}</span>
                          <span
                            className="w-1.5 h-3 rounded-xs shrink-0"
                            style={{ backgroundColor: rowClass.plateColor }}
                            title={rowClass.shortName}
                          />
                          <span className="truncate font-sans font-medium">{row.name}</span>
                        </div>
                        <span
                          className={`shrink-0 tabular-nums ${
                            row.isPlayer
                              ? 'text-amber-300 font-bold'
                              : isAhead
                              ? 'text-rose-300'
                              : 'text-slate-300'
                          }`}
                        >
                          {gapText}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Contextual Racecraft / Rulebook Alerts (player sessions only) */}
          {!isAiRace &&
            (hud.inSlipstream ||
              hud.penaltyTimeRemaining > 0 ||
              (mandatoryServiceStop && !isHotlapMode && hud.countdown <= 0) ||
              (hud.postRacePenaltySeconds ?? 0) > 0 ||
              hud.warningCount > 0 ||
              hud.pitStopRemaining > 0 ||
              hud.blueFlagActive ||
              (hud.dirtyAirStrength ?? 0) > 0.25 ||
              (carSpecial.specialType === 'drs' && hud.drsEligible) ||
              (carSpecial.specialType === 'attack-mode' && hud.inAttackModeZone) ||
              (hud.surfaceType && hud.surfaceType !== 'asphalt' && hud.surfaceType !== 'kerb')) && (
              <div className="mt-2 pt-2 short:mt-1 short:pt-1 border-t border-white/10 space-y-1 short:space-y-0.5 text-[11px] short:text-[9px] font-semibold">
                {mandatoryServiceStop && !isHotlapMode && hud.countdown <= 0 && (
                  <div
                    className={
                      (playerStanding?.pitStops ?? 0) > 0
                        ? 'text-emerald-400 font-bold'
                        : 'text-amber-300 font-bold'
                    }
                  >
                    {(playerStanding?.pitStops ?? 0) > 0
                      ? 'MANDATORY SERVICE: COMPLETED'
                      : 'MANDATORY ON-TRACK SERVICE REQUIRED'}
                  </div>
                )}
                {hud.blueFlagActive && (
                  <div className="text-sky-400 font-bold">BLUE FLAG — YIELD TO FASTER CAR</div>
                )}
                {carSpecial.specialType === 'attack-mode' && hud.inAttackModeZone && (
                  <div className="text-fuchsia-300 font-bold">ATTACK MODE ACTIVATION ZONE</div>
                )}
                {carSpecial.specialType === 'drs' && hud.drsEligible && (
                  <div className="text-emerald-300 font-bold">DRS AVAILABLE (&lt;1.0s)</div>
                )}
                {hud.inSlipstream && (
                  <div className="text-sky-300">
                    <span className="short:hidden">SLIPSTREAM TOW ACTIVE</span>
                    <span className="hidden short:inline">SLIPSTREAM TOW</span>
                  </div>
                )}
                {(hud.dirtyAirStrength ?? 0) > 0.25 && (
                  <div className="text-amber-300">
                    DIRTY AIR (-{Math.round((hud.dirtyAirStrength ?? 0) * 18)}% FRONT GRIP)
                  </div>
                )}
                {hud.surfaceType && hud.surfaceType !== 'asphalt' && hud.surfaceType !== 'kerb' && (
                  <div className="text-orange-300 uppercase">
                    SURFACE: {hud.surfaceType.replace('-', ' ')}
                  </div>
                )}
                {hud.pitStopRemaining > 0 && (
                  <div className="text-amber-300">
                    {hud.pitActiveTask === 'fuel'
                      ? 'REFUELING'
                      : hud.pitActiveTask === 'repair'
                      ? 'REPAIRING DAMAGE'
                      : 'TYRE SERVICE'}{' '}
                    {remainingTotal.toFixed(1)}s
                  </div>
                )}
                {hud.penaltyTimeRemaining > 0 && hud.pitStopRemaining <= 0 && (
                  <div className="text-red-400 font-bold leading-snug">
                    <div>
                      YIELD TIME: {hud.penaltyTimeRemaining.toFixed(1)}s
                      {hud.penaltyReason ? ` (${hud.penaltyReason.replace('-', ' ').toUpperCase()})` : ''}
                    </div>
                    {hud.penaltyReason === 'yellow-overtake' &&
                      (hud.yellowYieldPositions ?? 0) > 0 &&
                      hud.yellowYieldTargetName && (
                        <div className="text-[10px] text-amber-300 font-semibold">
                          OR GIVE BACK {hud.yellowYieldPositions} POS TO {hud.yellowYieldTargetName}
                        </div>
                      )}
                  </div>
                )}
                {(hud.postRacePenaltySeconds ?? 0) > 0 && (
                  <div className="text-rose-400 font-bold">
                    POST-RACE TIME PENALTY: +{hud.postRacePenaltySeconds}s
                  </div>
                )}
                {hud.warningCount > 0 && hud.penaltyTimeRemaining <= 0 && (
                  <div className="text-amber-300">
                    {hud.warningCount >= 5 ? 'BLACK & WHITE FLAG' : `Track Limits (${hud.warningCount})`}
                  </div>
                )}
              </div>
            )}
        </DraggableHudPanel>

        {/* Top-Center: Unified Awareness Stack (Virtual Mirror + Start Lights + Flags + Radio + Live Delta) */}
        <div className="flex-1 min-w-0 flex flex-col items-center gap-1.5">
          {(show3dVirtualMirror || showTextVirtualMirror) && (
            <DraggableHudPanel
              id="virtualMirror"
              offsets={hudOffsets}
              hudScale={hudScale}
              onCommitOffset={commitHudOffset}
              gripPosition="top-right"
              className="flex flex-col items-center"
            >
              {show3dVirtualMirror && (
                <div
                  data-testid="virtual-mirror-frame"
                  data-camera-mode={hud.cameraMode}
                  className="relative w-[300px] h-[78px] max-w-[78vw] rounded-md border-2 border-white/35 bg-transparent shadow-[0_6px_28px_rgba(0,0,0,0.75)] overflow-hidden"
                >
                  {(hud.blindSpot === 'left' || hud.blindSpot === 'both') && (
                    <div className="absolute inset-y-0 left-0 w-1.5 bg-amber-400 animate-pulse" />
                  )}
                  {(hud.blindSpot === 'right' || hud.blindSpot === 'both') && (
                    <div className="absolute inset-y-0 right-0 w-1.5 bg-amber-400 animate-pulse" />
                  )}
                  <div className="absolute top-0.5 left-1.5 px-1 rounded bg-black/60 text-[8px] font-mono uppercase tracking-widest text-slate-300">
                    Rear Mirror
                  </div>
                  {hud.rearCarGapM !== null && hud.rearCarGapM !== undefined && (
                    <div className="absolute top-0.5 right-1.5 px-1.5 rounded bg-black/65 text-[9px] font-telemetry font-bold text-white tabular-nums">
                      {hud.rearCarGapM.toFixed(1)}m
                    </div>
                  )}
                </div>
              )}

              {showTextVirtualMirror && (
                <div
                  data-testid="virtual-mirror-fallback"
                  className="flex items-center gap-2 bg-[#0b0e13]/90 border border-white/20 rounded-md px-3 py-1 shadow-xl"
                >
                  <span
                    className={`text-[11px] font-black tracking-wider px-1.5 py-0.5 rounded ${
                      hud.blindSpot === 'left' || hud.blindSpot === 'both'
                        ? 'bg-amber-500 text-slate-950 animate-pulse'
                        : 'text-slate-600'
                    }`}
                  >
                    ◀ L
                  </span>
                  <div className="text-center min-w-[110px]">
                    <div className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">
                      Rear Mirror
                    </div>
                    {hud.rearCarGapM !== null && hud.rearCarGapM !== undefined ? (
                      <div className="text-xs font-telemetry font-bold text-white tabular-nums">
                        {hud.rearCarGapM.toFixed(1)}m{' '}
                        <span
                          className={
                            (hud.rearCarClosingKmh ?? 0) > 8
                              ? 'text-rose-400'
                              : 'text-emerald-400'
                          }
                        >
                          {(hud.rearCarClosingKmh ?? 0) >= 0 ? '+' : ''}
                          {(() => {
                            const spd = formatSpeed(Math.abs(hud.rearCarClosingKmh ?? 0), units);
                            return `${spd.value} ${spd.unit}`;
                          })()}
                        </span>
                      </div>
                    ) : (
                      <div className="text-[10px] font-bold text-amber-300 uppercase">Side-by-Side</div>
                    )}
                  </div>
                  <span
                    className={`text-[11px] font-black tracking-wider px-1.5 py-0.5 rounded ${
                      hud.blindSpot === 'right' || hud.blindSpot === 'both'
                        ? 'bg-amber-500 text-slate-950 animate-pulse'
                        : 'text-slate-600'
                    }`}
                  >
                    R ▶
                  </span>
                </div>
              )}
            </DraggableHudPanel>
          )}

          <DraggableHudPanel
            id="topCenter"
            offsets={hudOffsets}
            hudScale={hudScale}
            onCommitOffset={commitHudOffset}
            gripPosition="top-right"
            className="flex flex-col items-center gap-1.5 max-w-[360px]"
          >
          {hud.countdown > 0 ? (
            <div
              className={`bg-[#0b0e13]/95 border rounded-md px-6 py-3 short:px-3.5 short:py-1.5 text-center shadow-xl ${
                hud.startType === 'rolling' ? 'border-amber-400/50' : 'border-white/15'
              }`}
            >
              <div
                className={`text-xs short:text-[9px] uppercase tracking-widest font-semibold ${
                  hud.startType === 'rolling' ? 'text-amber-300' : 'text-slate-400'
                }`}
              >
                {hud.startType === 'rolling' ? 'Rolling Start · Hold Formation' : 'Standing Start · Hold Sweet Spot'}
              </div>
              <div
                className={`text-3xl short:text-xl font-display font-extrabold tabular-nums mt-0.5 leading-none ${
                  hud.startType === 'rolling' ? 'text-amber-400' : 'text-red-500'
                }`}
              >
                {Math.ceil(hud.countdown)}
              </div>
              {hud.startType === 'standing' && !isAiRace && (
                <div className="mt-2 w-48 mx-auto">
                  <div className="relative h-2.5 rounded bg-[#18202c] border border-white/10 overflow-hidden">
                    <div
                      className="absolute inset-y-0 bg-emerald-500/40 border-x border-emerald-400"
                      style={{
                        left: `${Math.round((hud.launchRpmSweetSpot?.[0] ?? 0.66) * 100)}%`,
                        width: `${Math.round(((hud.launchRpmSweetSpot?.[1] ?? 0.88) - (hud.launchRpmSweetSpot?.[0] ?? 0.66)) * 100)}%`,
                      }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 bg-sky-400/80 transition-all duration-75"
                      style={{ width: `${Math.round(hud.rpmNormalized * 100)}%` }}
                    />
                  </div>
                  <div className="mt-0.5 flex justify-between text-[9px] text-slate-400 font-telemetry">
                    <span>RPM</span>
                    <span className={hud.rpmNormalized > 0.94 ? 'text-amber-300 font-bold' : 'text-emerald-300'}>
                      {hud.rpmNormalized > 0.94 ? 'WHEELSPIN RISK' : 'SWEET SPOT 66–88%'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : hud.launchStatus === 'perfect' ? (
            <div className="bg-emerald-950/92 border border-emerald-400/70 rounded-md px-5 py-2 text-center shadow-xl">
              <div className="text-sm font-display font-extrabold text-emerald-300 tracking-widest uppercase">
                PERFECT LAUNCH! +BOOST
              </div>
            </div>
          ) : (hud.greenFlagFlash ?? 0) > 0 ? (
            <div className="bg-emerald-950/90 border border-emerald-400/60 rounded-md px-6 py-2.5 short:px-3.5 short:py-1 text-center shadow-xl">
              <div className="text-lg short:text-sm font-display font-extrabold text-emerald-300 tracking-widest uppercase leading-none">
                GREEN FLAG!
              </div>
            </div>
          ) : hud.sectorFlags?.some((sf) => sf === 'yellow') ||
            hud.raceFlag === 'yellow' ||
            hud.raceFlag === 'double-yellow' ? (
            <div
              className={`border rounded-md px-4 py-1.5 text-center shadow-lg ${
                hud.inYellowMicrosector
                  ? 'bg-yellow-950/95 border-yellow-400/90'
                  : 'bg-[#0b0e13]/92 border-yellow-500/45'
              }`}
            >
              {hud.inYellowMicrosector && (
                <div className="text-xs font-display font-extrabold text-yellow-300 tracking-widest uppercase mb-0.5">
                  YELLOW FLAG IN YOUR SECTOR · NO OVERTAKING
                </div>
              )}
              {hud.sectorFlags && (
                <div className="text-[10px] font-telemetry flex items-center justify-center gap-2">
                  {hud.sectorFlags.map((sf, idx) => (
                    <span
                      key={idx}
                      className={
                        sf === 'yellow'
                          ? 'text-yellow-300 font-bold'
                          : 'text-slate-400'
                      }
                    >
                      {sf === 'yellow' ? `Yellow S${idx + 1}` : `Clear S${idx + 1}`}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : hud.raceFlag === 'white' ? (
            <div className="bg-slate-900/92 border border-white/60 rounded-md px-4 py-1 text-center shadow-lg">
              <div className="text-xs font-display font-extrabold text-white tracking-widest uppercase">
                WHITE FLAG · FINAL LAP
              </div>
            </div>
          ) : touchControlsActive && !isAiRace ? (
            <div className="hidden sm:flex short:flex flex-col bg-[#0b0e13]/85 border border-white/12 rounded-md px-3 py-1.5 short:px-2.5 short:py-1 shadow-lg min-w-[168px] short:min-w-[152px]">
              <div className="flex items-baseline justify-between gap-2.5">
                <div className="flex items-baseline gap-1">
                  <span
                    data-testid="hud-speed"
                    className="text-xl short:text-lg font-display font-extrabold text-white tabular-nums leading-none"
                  >
                    {hud.speedKmh}
                  </span>
                  <span className="text-[8px] text-slate-400 uppercase tracking-wider">KM/H</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-[8px] text-slate-400 uppercase">G</span>
                  <span className="text-base short:text-sm font-display font-bold text-amber-400 tabular-nums leading-none">
                    {hud.gear === -1 ? 'R' : hud.gear}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-telemetry leading-none">
                  <span className={hud.tireWear < 30 ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
                    {hud.compound.slice(0, 1).toUpperCase()}{hud.tireWear}%
                  </span>
                  <span className="text-amber-300 font-semibold">F{hud.fuel}%</span>
                </div>
              </div>
              <div className="mt-1 h-1 rounded bg-[#1a202c] overflow-hidden">
                <div
                  className="h-full transition-all duration-75"
                  style={{
                    width: `${Math.round(hud.rpmNormalized * 100)}%`,
                    backgroundColor: hud.rpmNormalized > 0.85 ? '#ef4444' : '#38bdf8',
                  }}
                />
              </div>
            </div>
          ) : null}

          {hud.mecachromeWarning && (
            <div className="px-4 py-1.5 rounded-md bg-red-950/95 border-2 border-red-500 text-red-100 font-display font-black text-xs uppercase tracking-wider shadow-2xl animate-pulse">
              ENGINE FAILURE — GETTING MECACHROMED ({(hud.mecachromeRemaining ?? 0).toFixed(1)}s)
            </div>
          )}

          {hud.radioMessage && (
            <div className="px-3.5 py-1.5 rounded-md bg-[#0b1220]/92 border border-sky-400/50 text-sky-100 text-xs shadow-xl flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded bg-sky-500/25 border border-sky-400/50 text-[9px] font-black uppercase tracking-widest text-sky-300">
                {hud.radioMessage.sender}
              </span>
              <span className="font-semibold">{hud.radioMessage.text}</span>
            </div>
          )}

          {/* Prominent Yield Penalty Banner (shows exact time and/or position to yield) */}
          {!isAiRace && hud.countdown <= 0 && hud.penaltyTimeRemaining > 0 && hud.pitStopRemaining <= 0 && (
            <div
              data-testid="hud-yield-penalty-banner"
              className="bg-red-950/95 border border-red-400/80 rounded-md px-4 py-1.5 text-center shadow-xl"
            >
              <div className="text-xs font-display font-extrabold text-red-200 tracking-wider uppercase">
                {hud.penaltyReason === 'yellow-overtake'
                  ? 'ILLEGAL YELLOW-FLAG OVERTAKE'
                  : 'SLOW-DOWN PENALTY'}
              </div>
              <div className="text-[11px] font-telemetry font-bold text-white mt-0.5">
                YIELD {hud.penaltyTimeRemaining.toFixed(1)}s
                {hud.penaltyReason === 'yellow-overtake' &&
                (hud.yellowYieldPositions ?? 0) > 0 &&
                hud.yellowYieldTargetName
                  ? ` · OR GIVE ${hud.yellowYieldPositions} POS BACK TO ${hud.yellowYieldTargetName.toUpperCase()}`
                  : ' · LIFT THROTTLE TO SERVE'}
              </div>
            </div>
          )}

          {hud.raceControlMessage && hud.countdown <= 0 && (
            <div className="bg-[#0b0e13]/92 border border-white/15 rounded px-3 py-1 text-[10px] font-display font-bold tracking-wider uppercase text-slate-100 shadow-lg text-center">
              RC: {hud.raceControlMessage}
            </div>
          )}

          {/* Live Delta-to-Best / Ghost Delta Bar */}
          {!isAiRace && hud.countdown <= 0 && hud.liveDeltaSeconds != null && (
            <div
              data-testid="hud-live-delta"
              className="bg-[#0b0e13]/90 border border-white/15 rounded px-3 py-1 shadow-lg flex items-center gap-2.5 text-xs font-telemetry"
            >
              {hud.ghostLabel && (
                <span className="text-[10px] text-slate-400 uppercase font-sans font-semibold">
                  {hud.ghostLabel}
                </span>
              )}
              <span
                className={`font-bold tabular-nums ${
                  hud.liveDeltaSeconds <= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {hud.liveDeltaSeconds <= 0 ? '' : '+'}
                {hud.liveDeltaSeconds.toFixed(2)}s
              </span>
              <div className="w-16 h-1.5 bg-[#1a202c] rounded overflow-hidden relative">
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/30" />
                <div
                  className={`absolute top-0 bottom-0 ${
                    hud.liveDeltaSeconds <= 0 ? 'bg-emerald-400 right-1/2' : 'bg-red-500 left-1/2'
                  }`}
                  style={{
                    width: `${Math.min(50, Math.abs(hud.liveDeltaSeconds) * 20).toFixed(0)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Scenario / License Objective Chip */}
          {hud.scenarioObjective && hud.countdown <= 0 && (
            <div className="hidden sm:block bg-[#0b0e13]/88 border border-amber-400/35 rounded px-3 py-1 text-[10px] font-semibold text-amber-200 text-center">
              Objective: {hud.scenarioObjective}
            </div>
          )}
          </DraggableHudPanel>
        </div>

        {/* Top-Right Cluster: Compact Minimap, Weather, Time/FPS & Utility Icon Buttons */}
        <DraggableHudPanel
          id="topRight"
          offsets={hudOffsets}
          hudScale={hudScale}
          onCommitOffset={commitHudOffset}
          gripPosition="top-left"
          className="flex flex-col items-end gap-1.5 sm:gap-2 short:gap-1 shrink-0"
        >
          <div className="flex items-center gap-1 sm:gap-1.5 short:gap-1 pointer-events-auto">
            {hud.aiNeuralTelemetry && (
              <button
                type="button"
                tabIndex={-1}
                data-testid="btn-toggle-ai-visualizer"
                onClick={(e) => {
                  e.currentTarget.blur();
                  setShowAiVisualizer((v) => !v);
                }}
                aria-label="Toggle AI Neural Telemetry Visualizer"
                title="AI Neural Visualizer (4 radar slots, 8 curvature probes, live policy outputs)"
                className={`min-w-[38px] min-h-[38px] sm:min-w-0 sm:min-h-0 p-2 short:p-1.5 rounded border cursor-pointer flex items-center justify-center ${
                  showAiVisualizer
                    ? 'bg-sky-600 border-sky-400 text-white'
                    : 'bg-[#0b0e13]/90 border-white/15 text-slate-200 hover:text-white'
                }`}
              >
                <Cpu className="w-4 h-4 short:w-3.5 short:h-3.5" />
              </button>
            )}
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                if (isAiRace) onToggleSpectatorCameraMode?.();
                else onCycleCamera();
              }}
              aria-label={isAiRace ? 'Toggle Spectate or Freecam' : 'Switch Camera Angle'}
              title={isAiRace ? 'Toggle Spectate / Freecam [F]' : 'Camera [C]'}
              className="min-w-[38px] min-h-[38px] sm:min-w-0 sm:min-h-0 p-2 short:p-1.5 rounded bg-[#0b0e13]/90 border border-white/15 text-slate-200 hover:text-white cursor-pointer flex items-center justify-center"
            >
              <Camera className="w-4 h-4 short:w-3.5 short:h-3.5" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
              title="Mute [M]"
              className="min-w-[38px] min-h-[38px] sm:min-w-0 sm:min-h-0 p-2 short:p-1.5 rounded bg-[#0b0e13]/90 border border-white/15 text-slate-200 hover:text-white cursor-pointer flex items-center justify-center"
            >
              {muted ? (
                <VolumeX className="w-4 h-4 short:w-3.5 short:h-3.5 text-red-400" />
              ) : (
                <Volume2 className="w-4 h-4 short:w-3.5 short:h-3.5" />
              )}
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onTogglePause();
              }}
              aria-label="Pause Race"
              title="Pause [P]"
              className="min-w-[38px] min-h-[38px] sm:min-w-0 sm:min-h-0 p-2 short:p-1.5 rounded bg-[#0b0e13]/90 border border-white/15 text-slate-200 hover:text-white cursor-pointer flex items-center justify-center"
            >
              <Pause className="w-4 h-4 short:w-3.5 short:h-3.5" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onReturnToTitle();
              }}
              aria-label="Return to Title Screen"
              title="Return to Title"
              className="min-w-[38px] min-h-[38px] sm:min-w-0 sm:min-h-0 p-2 short:p-1.5 rounded bg-[#0b0e13]/90 border border-sky-500/30 hover:border-sky-400 text-sky-400 hover:text-sky-300 cursor-pointer flex items-center justify-center transition-colors"
            >
              <Home className="w-4 h-4 short:w-3.5 short:h-3.5" />
            </button>
          </div>

          {/* Track Minimap */}
          <div className="bg-[#0b0e13]/85 border border-white/12 rounded-md p-1.5 sm:p-2 short:p-1">
            <svg viewBox="0 0 140 110" className="w-24 h-[72px] sm:w-32 sm:h-24 md:w-36 md:h-28 short:w-[84px] short:h-[54px]" aria-label="Track Minimap">
              <path
                d={minimapGeometry.pathD}
                fill="none"
                stroke="#334155"
                strokeWidth="4.5"
                strokeLinejoin="round"
              />
              {hud.minimapDots.map((dot) => {
                const { px, py } = minimapGeometry.project(dot.x, dot.z);
                const dotColor = dot.isPlayer
                  ? '#ffffff'
                  : dot.isHumanPeer
                  ? '#facc15'
                  : CAR_CLASSES[dot.classId].plateColor;
                return (
                  <circle
                    key={dot.id}
                    cx={px}
                    cy={py}
                    r={dot.isPlayer ? 4.2 : 2.6}
                    fill={dotColor}
                    stroke={dot.isPlayer ? '#ef4444' : '#0b0e13'}
                    strokeWidth={dot.isPlayer ? 1.5 : 0.6}
                  />
                );
              })}
            </svg>
          </div>

          {/* Dynamic Weather & Track Evolution Chip */}
          {hud.weatherCondition && (
            <div className="hidden sm:block bg-[#0b0e13]/85 border border-white/12 rounded-md px-2 py-1 text-[10px] text-right max-w-[168px] leading-tight">
              <div className="font-semibold text-slate-200 flex items-center justify-end gap-1.5">
                <span className={hud.trackWetness > 0.15 ? 'text-sky-300' : 'text-amber-200'}>
                  {formatWeatherCondition(hud.weatherCondition)}
                </span>
                <span className="font-telemetry text-slate-400">
                  {hud.trackTempC ?? 30}°C
                </span>
              </div>
              <div className="text-[9px] text-slate-400 font-telemetry">
                Grip {Math.round((hud.trackRubber ?? 0.3) * 100)}%
                {hud.trackWetness > 0.08
                  ? ` · Line ${Math.round((hud.racingLineWetness ?? hud.trackWetness) * 100)}%`
                  : ''}
              </div>
              {hud.weatherNextLabel && (
                <div className="text-[9px] text-sky-300/90 truncate">{hud.weatherNextLabel}</div>
              )}
            </div>
          )}

          {/* Integrated Time-of-Day & FPS Pill (inside Top-Right stack — zero overlap) */}
          {(gameSettings.showFpsCounter || hud.timeOfDayHours !== undefined) && (
            <div className="hidden lg:flex items-center gap-2 px-2 py-0.5 rounded bg-[#0b0e13]/85 border border-white/10 text-[10px] font-mono text-slate-300">
              {hud.timeOfDayHours !== undefined && <span>{formatTimeOfDay(hud.timeOfDayHours)}</span>}
              {gameSettings.showFpsCounter && hud.fps !== undefined && (
                <span className={hud.fps < 45 ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
                  {hud.fps} FPS
                </span>
              )}
            </div>
          )}
        </DraggableHudPanel>
      </div>

      {/* BOTTOM CORNERS */}
      <div
        className={`flex items-end gap-2 sm:gap-3 ${
          touchControlsActive && !isAiRace ? 'flex-col items-center justify-end' : 'justify-between'
        }`}
      >
        {/* Bottom-Left Column: MFD/Inputs + Freecam Hint + AI Director + On-Track Pit Crew (stacked cleanly, never overlapping) */}
        <div
          className={
            touchControlsActive && !isAiRace
              ? 'w-full flex flex-col items-center gap-2'
              : 'flex flex-col items-start gap-2 min-w-0 shrink-0'
          }
        >
          {isAiRace && spectatorMode === 'freecam' && (
            <div
              data-testid="freecam-controls-hint"
              className={`bg-[#0b0e13]/92 border border-sky-500/40 rounded-md px-3 py-2 sm:px-3.5 sm:py-2.5 shadow-xl space-y-1 max-w-xs sm:max-w-sm ${
                touchControlsActive ? 'mb-36 sm:mb-40' : ''
              }`}
            >
              <div className="text-[10px] sm:text-[11px] font-display font-bold text-sky-300 uppercase tracking-wider">
                Freecam Flight Mode
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-300 leading-relaxed">
                {touchControlsActive
                  ? 'Drag Look · Pinch Zoom · Left Stick Move · Up / Down Altitude'
                  : 'WASD Move · Drag Mouse Look · Space / E Up · Q / Ctrl Down · Scroll Zoom · Shift+Scroll Speed · F Spectate'}
              </div>
            </div>
          )}

          {/* AI Race Engineer / Director Panel (AI Race Spectate Mode — No Pit Lanes, On-Track Service Orders) */}
          {isAiRace && spectatorMode !== 'freecam' && spectatedEntry && onSetAiPaceOrder && (
            <DraggableHudPanel
              id="aiDirector"
              offsets={hudOffsets}
              hudScale={hudScale}
              onCommitOffset={commitHudOffset}
              gripPosition="top-right"
            >
            <div
              data-testid="ai-director-panel"
              className="hidden sm:block bg-[#0b0e13]/94 border border-amber-500/35 rounded-md p-3 pointer-events-auto space-y-2 w-72 shadow-xl"
            >
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-display font-bold text-amber-300 uppercase tracking-wider">
                  Race Engineer Radio
                </span>
                <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                  {spectatedEntry.name}
                </span>
              </div>

              <div>
                <div className="text-[9px] text-slate-400 uppercase mb-1">Pace Order</div>
                <div className="grid grid-cols-4 gap-1">
                  {(['conserve', 'balanced', 'push', 'attack'] as AiPaceOrder[]).map((ord) => (
                    <button
                      key={ord}
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onSetAiPaceOrder(spectatedEntry.id, ord);
                      }}
                      className={`py-1 rounded text-[9px] font-bold uppercase border cursor-pointer ${
                        (hud.aiPaceOrder ?? 'balanced') === ord
                          ? 'bg-amber-600 border-amber-400 text-white'
                          : 'bg-[#151a24] border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {ord === 'conserve' ? 'Save' : ord}
                    </button>
                  ))}
                </div>
              </div>

              {hasHybridErs && onSetAiErsMode && (
                <div>
                  <div className="flex items-center justify-between text-[9px] text-slate-400 uppercase mb-1">
                    <span>Hybrid ERS</span>
                    <span className="font-telemetry text-sky-300 font-bold">
                      {hud.ersBattery ?? 0}%
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {(['harvest', 'balanced', 'overtake', 'quali'] as ErsMode[]).map((em) => (
                      <button
                        key={em}
                        type="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.currentTarget.blur();
                          onSetAiErsMode(spectatedEntry.id, em);
                        }}
                        className={`py-1 rounded text-[9px] font-bold uppercase border cursor-pointer ${
                          (hud.ersMode ?? 'balanced') === em
                            ? 'bg-sky-600 border-sky-400 text-white'
                            : 'bg-[#151a24] border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {em === 'balanced' ? 'Bal' : em === 'overtake' ? 'Ovt' : em}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {onCallAiOnTrackService && (
                <div className="space-y-1 pt-1 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-slate-400 uppercase">On-Track Service Call</span>
                    <div className="flex gap-1">
                      {(['soft', 'medium', 'hard', 'wet'] as TireCompound[]).map((cmp) => (
                        <button
                          key={cmp}
                          type="button"
                          tabIndex={-1}
                          onClick={(e) => {
                            e.currentTarget.blur();
                            setAiServiceCompound(cmp);
                          }}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border cursor-pointer ${
                            aiServiceCompound === cmp
                              ? 'bg-red-600 border-red-400 text-white'
                              : 'bg-[#151a24] border-white/10 text-slate-400'
                          }`}
                        >
                          {cmp[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onCallAiOnTrackService(spectatedEntry.id, 'tyres', aiServiceCompound);
                      }}
                      className="py-1 rounded text-[10px] font-bold bg-amber-600/25 hover:bg-amber-600/40 border border-amber-400/50 text-amber-200 cursor-pointer"
                    >
                      Tyres
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onCallAiOnTrackService(spectatedEntry.id, 'repair');
                      }}
                      className="py-1 rounded text-[10px] font-bold bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-400/50 text-emerald-200 cursor-pointer"
                    >
                      Repair
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onCallAiOnTrackService(spectatedEntry.id, 'fuel');
                      }}
                      className="py-1 rounded text-[10px] font-bold bg-sky-600/25 hover:bg-sky-600/40 border border-sky-400/50 text-sky-200 cursor-pointer"
                    >
                      Fuel
                    </button>
                  </div>
                </div>
              )}
            </div>
            </DraggableHudPanel>
          )}

          {showOnTrackPitPrompt && (
            <DraggableHudPanel
              id="pitPrompt"
              offsets={hudOffsets}
              hudScale={hudScale}
              onCommitOffset={commitHudOffset}
              gripPosition="top-right"
              className={touchControlsActive ? 'w-full flex justify-center' : ''}
            >
            <div
              data-testid="on-track-pit-prompt"
              className={`bg-[#0b0e13]/95 border border-amber-500/50 rounded-md p-3 pointer-events-auto space-y-2.5 w-full max-w-[310px] sm:w-80 shadow-xl ${
                touchControlsActive ? 'mb-2' : ''
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-display font-bold text-amber-300 uppercase tracking-wide">
                  On-Track Service Crew
                </span>
                <span className="text-[10px] text-slate-400 tabular-nums">
                  {hud.pitStopRemaining > 0
                    ? `${remainingTotal.toFixed(1)}s left`
                    : 'Stopped on track'}
                </span>
              </div>

              {hud.pitStopRemaining > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-semibold">
                    <span className="text-white">
                      {hud.pitActiveTask === 'tyres'
                        ? `Fitting ${hud.pitStrategy.nextCompound.toUpperCase()} Tyres...`
                        : hud.pitActiveTask === 'repair'
                        ? 'Repairing Aero & Chassis...'
                        : 'Refueling to 100%...'}
                    </span>
                    {hud.pitQueue.length > 0 && (
                      <span className="text-amber-300">
                        + {hud.pitQueue[0] === 'tyres' ? 'Tyres' : hud.pitQueue[0] === 'repair' ? 'Repair' : 'Fuel'} queued
                      </span>
                    )}
                  </div>
                  <div className="h-2 rounded bg-[#1a202c] overflow-hidden">
                    <div
                      className="h-full bg-amber-400 transition-all duration-75"
                      style={{ width: `${pitProgressPct.toFixed(0)}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-4 gap-1">
                {(['soft', 'medium', 'hard', 'wet'] as TireCompound[]).map((cmp) => (
                  <button
                    key={cmp}
                    type="button"
                    tabIndex={-1}
                    disabled={hud.pitActiveTask === 'tyres'}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onChangePitStrategy({ nextCompound: cmp });
                    }}
                    className={`min-h-[34px] py-1 rounded text-[10px] font-bold uppercase border cursor-pointer disabled:opacity-50 ${
                      hud.pitStrategy.nextCompound === cmp
                        ? 'bg-red-600 border-red-400 text-white'
                        : 'bg-[#151a23] border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    {cmp}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  tabIndex={-1}
                  disabled={hud.pitActiveTask === 'tyres' || hud.pitQueue.includes('tyres')}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onRequestPitStop('tyres', hud.pitStrategy.nextCompound);
                  }}
                  className="min-h-[38px] py-1.5 px-1.5 rounded text-[10px] font-bold border border-amber-400/60 bg-amber-600/25 hover:bg-amber-600/40 text-amber-200 flex items-center justify-center gap-1 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <Wrench className="w-3 h-3 shrink-0" />
                  <span>Tyres 2s</span>
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  data-testid="btn-pit-repair"
                  disabled={hud.pitActiveTask === 'repair' || hud.pitQueue.includes('repair')}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onRequestPitStop('repair');
                  }}
                  className="min-h-[38px] py-1.5 px-1.5 rounded text-[10px] font-bold border border-emerald-400/60 bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-200 flex items-center justify-center gap-1 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <Shield className="w-3 h-3 shrink-0" />
                  <span>Repair 3s</span>
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  disabled={hud.pitActiveTask === 'fuel' || hud.pitQueue.includes('fuel')}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onRequestPitStop('fuel');
                  }}
                  className="min-h-[38px] py-1.5 px-1.5 rounded text-[10px] font-bold border border-sky-400/60 bg-sky-600/25 hover:bg-sky-600/40 text-sky-200 flex items-center justify-center gap-1 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <Fuel className="w-3 h-3 shrink-0" />
                  <span>Fuel 4s</span>
                </button>
              </div>
            </div>
            </DraggableHudPanel>
          )}

          {/* Section 7 Bottom-Left Compact 4-Page MFD & Live Pedal Input Trace (inline in Bottom-Left stack — zero overlap) */}
          {!isAiRace && hudPreset === 'full' && !touchControlsActive && (
            <DraggableHudPanel
              id="mfd"
              offsets={hudOffsets}
              hudScale={hudScale}
              onCommitOffset={commitHudOffset}
              gripPosition="top-right"
              className="pointer-events-auto hidden md:flex flex-col gap-2 w-52"
            >
              {gameSettings.showPedalTrace && (
                <div className="bg-[#0b0e13]/90 border border-white/12 rounded-md p-2 space-y-1 shadow-lg">
                  <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    <span>Live Inputs</span>
                    <span className="font-mono text-slate-300">
                      {(() => {
                        const spd = formatSpeed(hud.speedKmh, units);
                        return `${spd.value} ${spd.unit}`;
                      })()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px] font-mono">
                    <span className="w-7 text-slate-400">THR</span>
                    <div className="flex-1 h-1.5 rounded bg-slate-800 overflow-hidden">
                      <div
                        className="h-full transition-all duration-75"
                        style={{
                          width: `${Math.round((hud.throttleInput ?? 0) * 100)}%`,
                          backgroundColor: palette.throttle,
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px] font-mono">
                    <span className="w-7 text-slate-400">BRK</span>
                    <div className="flex-1 h-1.5 rounded bg-slate-800 overflow-hidden">
                      <div
                        className="h-full transition-all duration-75"
                        style={{
                          width: `${Math.round((hud.brakeInput ?? 0) * 100)}%`,
                          backgroundColor: palette.brake,
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px] font-mono">
                    <span className="w-7 text-slate-400">STR</span>
                    <div className="flex-1 h-1.5 rounded bg-slate-800 relative overflow-hidden">
                      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/30" />
                      <div
                        className="absolute top-0 bottom-0 bg-sky-400"
                        style={{
                          left: (hud.steerInput ?? 0) >= 0 ? '50%' : `${50 + (hud.steerInput ?? 0) * 50}%`,
                          width: `${Math.abs(hud.steerInput ?? 0) * 50}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 4-Page Multi-Function Display (Tab to cycle) */}
              <div className="bg-[#0b0e13]/92 border border-white/15 rounded-md p-2.5 shadow-xl space-y-2 text-[11px]">
                <div className="flex items-center justify-between border-b border-white/10 pb-1">
                  <span className="text-[10px] font-display font-bold uppercase tracking-wider text-sky-300">
                    MFD · {activeMfdPage.replace('-', ' & ')}
                  </span>
                  <button
                    type="button"
                    onClick={cycleMfd}
                    className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[9px] font-mono text-slate-200 cursor-pointer"
                    title={`Cycle MFD (${formatKeyCode(keybinds.mfdCycle)})`}
                  >
                    {formatKeyCode(keybinds.mfdCycle)} ▸
                  </button>
                </div>

                {activeMfdPage === 'tires-brakes' && (
                  <div className="grid grid-cols-2 gap-1.5 font-telemetry text-[10px] tabular-nums">
                    <div className="bg-[#121722] rounded p-1.5 border border-white/5">
                      <div className="text-slate-400 text-[9px]">FL / FR TEMP</div>
                      <div className="text-white font-bold">
                        {formatTemp(hud.tires?.fl.temp ?? hud.tireTemp, units)} ·{' '}
                        {formatTemp(hud.tires?.fr.temp ?? hud.tireTemp, units)}
                      </div>
                    </div>
                    <div className="bg-[#121722] rounded p-1.5 border border-white/5">
                      <div className="text-slate-400 text-[9px]">RL / RR TEMP</div>
                      <div className="text-white font-bold">
                        {formatTemp(hud.tires?.rl.temp ?? hud.tireTemp, units)} ·{' '}
                        {formatTemp(hud.tires?.rr.temp ?? hud.tireTemp, units)}
                      </div>
                    </div>
                    <div className="bg-[#121722] rounded p-1.5 border border-white/5 col-span-2 flex items-center justify-between">
                      <span className="text-slate-400 text-[9px]">BRAKES F / R</span>
                      <span className="text-amber-300 font-bold">
                        {formatTemp(hud.brakeTempFront ?? 280, units)} / {formatTemp(hud.brakeTempRear ?? 250, units)}
                      </span>
                    </div>
                  </div>
                )}

                {activeMfdPage === 'strategy' && (
                  <div className="space-y-1 text-[10px] font-telemetry">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Fuel Remaining</span>
                      <span className="text-white font-bold">
                        {Math.round(hud.fuel)}% (~{hud.fuelLapsRemaining.toFixed(1)} laps)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Tyre Life</span>
                      <span className="text-white font-bold">
                        {Math.round(hud.tireWear)}% ({hud.compound.toUpperCase()})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Track Temp</span>
                      <span className="text-sky-300 font-bold">
                        {formatTemp(hud.trackTempC ?? 28, units)}
                      </span>
                    </div>
                  </div>
                )}

                {activeMfdPage === 'electronics' && (
                  <div className="space-y-1.5 text-[10px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Traction Control</span>
                      {hud.tcEquipped === false ? (
                        <span className="px-2 py-0.5 rounded font-mono font-bold bg-slate-900 text-slate-500 border border-white/5">
                          N/A (NO TC)
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={onCycleTcLevel}
                          className={`px-2 py-0.5 rounded font-mono font-bold cursor-pointer ${
                            hud.tcIntervening
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                          }`}
                        >
                          TC {hud.tcLevel ?? 0} {hud.tcIntervening ? 'ACT' : ''}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Brake Bias</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onAdjustBrakeBalance?.(-0.5)}
                          className="px-1.5 rounded bg-slate-800 hover:bg-slate-700 text-white cursor-pointer"
                        >
                          -
                        </button>
                        <span className="font-mono text-white font-bold">
                          {(hud.brakeBalance ?? 56).toFixed(1)}%
                        </span>
                        <button
                          type="button"
                          onClick={() => onAdjustBrakeBalance?.(0.5)}
                          className="px-1.5 rounded bg-slate-800 hover:bg-slate-700 text-white cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    {hud.hasErs && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">ERS Mode</span>
                        <button
                          type="button"
                          onClick={onCycleErsMode}
                          className="px-2 py-0.5 rounded bg-sky-500/25 border border-sky-400/40 text-sky-200 font-mono font-bold uppercase cursor-pointer"
                        >
                          {hud.ersMode}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {activeMfdPage === 'sectors' && (
                  <div className="grid grid-cols-3 gap-1 font-telemetry text-[10px] text-center">
                    {[0, 1, 2].map((sIdx) => {
                      const t = hud.sectorTimes?.[sIdx] ?? hud.lastLapSectorTimes?.[sIdx] ?? null;
                      const best = hud.sessionBestSectorTimes?.[sIdx] ?? null;
                      const isPurple = t !== null && best !== null && t <= best + 0.01;
                      return (
                        <div
                          key={sIdx}
                          className={`p-1 rounded border ${
                            isPurple
                              ? 'bg-fuchsia-950/60 border-fuchsia-400/60 text-fuchsia-200'
                              : 'bg-[#121722] border-white/5 text-slate-200'
                          }`}
                        >
                          <div className="text-[8px] text-slate-400">S{sIdx + 1}</div>
                          <div className="font-bold">{t !== null ? t.toFixed(2) : '--.--'}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {(onTriggerFlashback || onOpenPhotoMode) && (
                  <div className="flex items-center gap-1.5 pt-1 border-t border-white/10">
                    {onTriggerFlashback && hud.flashbackAvailable && (
                      <button
                        type="button"
                        onClick={onTriggerFlashback}
                        className="flex-1 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-amber-200 text-[9px] font-bold uppercase cursor-pointer"
                      >
                        Rewind [{formatKeyCode(keybinds.flashback)}]
                      </button>
                    )}
                    {onOpenPhotoMode && (
                      <button
                        type="button"
                        onClick={onOpenPhotoMode}
                        className="flex-1 py-1 rounded bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/40 text-sky-200 text-[9px] font-bold uppercase cursor-pointer"
                      >
                        Photo [{formatKeyCode(keybinds.photoMode)}]
                      </button>
                    )}
                  </div>
                )}
              </div>
            </DraggableHudPanel>
          )}
        </div>

        {/* Bottom-Center: Proximity Car Radar (inline flex center — zero overlap with MFD or Telemetry) */}
        <div className="hidden lg:flex flex-1 justify-center items-end min-w-0">
          {!isAiRace &&
            hud.countdown <= 0 &&
            hud.proximityCars &&
            hud.proximityCars.length > 0 && (
              <DraggableHudPanel
                id="radar"
                offsets={hudOffsets}
                hudScale={hudScale}
                onCommitOffset={commitHudOffset}
                gripPosition="top-center"
              >
                <div data-testid="hud-proximity-radar">
                  {(() => {
                    const hasSideBySide = hud.proximityCars!.some(
                      (c) => Math.abs(c.dz) < 4.8 && Math.abs(c.dx) < 4.5,
                    );
                    const scale = 50 / 18;
                    return (
                      <svg
                        viewBox="-60 -60 120 120"
                        className="w-[104px] h-[104px]"
                        aria-label="Proximity Car Radar"
                      >
                        <circle
                          cx="0"
                          cy="0"
                          r="54"
                          fill="rgba(11,14,19,0.78)"
                          stroke={hasSideBySide ? '#ef4444' : 'rgba(255,255,255,0.22)'}
                          strokeWidth={hasSideBySide ? '2.5' : '1.2'}
                        />
                        <circle
                          cx="0"
                          cy="0"
                          r="27"
                          fill="none"
                          stroke="rgba(255,255,255,0.12)"
                          strokeDasharray="3 3"
                        />
                        <line x1="-52" y1="0" x2="52" y2="0" stroke="rgba(255,255,255,0.08)" />
                        <line x1="0" y1="-52" x2="0" y2="52" stroke="rgba(255,255,255,0.08)" />
                        <rect x="-4.5" y="-8.5" width="9" height="17" rx="2" fill="#f8fafc" stroke="#ef4444" strokeWidth="1.2" />
                        {hud.proximityCars!.map((p) => {
                          const cx = Math.max(-48, Math.min(48, p.dx * scale));
                          const cy = Math.max(-48, Math.min(48, -p.dz * scale));
                          const close = Math.hypot(p.dx, p.dz) < 6.5;
                          return (
                            <rect
                              key={p.id}
                              x={cx - 4.5}
                              y={cy - 8}
                              width="9"
                              height="16"
                              rx="2"
                              fill={close ? '#ef4444' : CAR_CLASSES[p.classId].plateColor}
                              stroke="#0b0e13"
                              strokeWidth="1"
                            />
                          );
                        })}
                      </svg>
                    );
                  })()}
                </div>
              </DraggableHudPanel>
            )}
        </div>

        {/* Bottom-Right Cluster: Telemetry (Player or Spectated AI Car) or Freecam Badge */}
        <DraggableHudPanel
          id="telemetry"
          offsets={hudOffsets}
          hudScale={hudScale}
          onCommitOffset={commitHudOffset}
          gripPosition="top-left"
          className="shrink-0"
        >
        {isAiRace && spectatorMode === 'freecam' ? (
          <div className="hidden sm:block bg-[#0b0e13]/90 border border-white/12 rounded-md px-4 py-3 shadow-lg text-right">
            <div className="text-[10px] text-sky-300 uppercase tracking-widest font-bold">
              Free-Flying Camera
            </div>
            <div className="text-xs text-slate-300 mt-1">
              Click any driver in the leaderboard or press [F] to spectate
            </div>
          </div>
        ) : touchControlsActive && !isAiRace ? (
          /* Portrait-only Compact Telemetry Bar above pedals (landscape uses the top-center strip so zero pedal overlap) */
          <div className="sm:hidden short:hidden bg-[#0b0e13]/88 border border-white/12 rounded-md px-3 py-1.5 shadow-lg w-auto min-w-[184px] max-w-[240px] mb-32">
            <div className="flex items-end justify-between gap-3">
              <div>
                <span className="text-[9px] text-slate-400 uppercase tracking-wider block leading-none">
                  KM/H
                </span>
                <span
                  data-testid="hud-speed"
                  className="text-2xl sm:text-3xl font-display font-extrabold text-white tabular-nums leading-none"
                >
                  {hud.speedKmh}
                </span>
              </div>
              <div className="text-center">
                <span className="text-[9px] text-slate-400 uppercase block leading-none">
                  {isManualGears ? 'MAN' : 'AUTO'}
                </span>
                <span
                  className={`text-xl font-display font-bold tabular-nums leading-none ${
                    isManualGears && hud.rpmNormalized > 0.91 ? 'text-red-400 animate-pulse' : 'text-amber-400'
                  }`}
                >
                  {hud.gear === -1 ? 'R' : hud.gear}
                </span>
              </div>
              <div className="text-right text-[10px] leading-tight space-y-0.5">
                <div className="font-telemetry">
                  <span className="text-slate-400">{hud.compound.slice(0, 1).toUpperCase()} </span>
                  <span className={hud.tireWear < 30 ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
                    {hud.tireWear}%
                  </span>
                </div>
                <div className="font-telemetry text-slate-200">
                  F <span className="text-amber-300 font-semibold">{hud.fuel}%</span>
                </div>
              </div>
            </div>
            <div className="mt-1.5 h-1.5 rounded bg-[#1a202c] overflow-hidden">
              <div
                className="h-full transition-all duration-75"
                style={{
                  width: `${Math.round(hud.rpmNormalized * 100)}%`,
                  backgroundColor: hud.rpmNormalized > 0.85 ? '#ef4444' : '#38bdf8',
                }}
              />
            </div>
          </div>
        ) : (
          /* 4-Module Driving HUD Cluster: 1. Tyres & Brakes, 2. Fuel (L + %), 3. Gear/Speed/RPM, 4. Damage */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-[424px] sm:w-[424px] items-end">
            {/* MODULE 2: FUEL (Liters + %, no fuel temperature) */}
            <div
              data-testid="hud-module-fuel"
              className="bg-[#0b0e13]/90 border border-white/12 rounded-md px-3 py-2 shadow-lg"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[9px] font-display font-bold uppercase tracking-wider text-slate-400">
                  {activeCar.engineType === 'electric' ? 'Battery Energy' : 'Fuel'}
                </span>
                <span
                  className={`text-[10px] font-telemetry font-bold ${
                    hud.fuelLapsRemaining !== undefined && hud.fuelLapsRemaining < 2
                      ? 'text-red-400'
                      : 'text-amber-300'
                  }`}
                >
                  ~{hud.fuelLapsRemaining ?? Math.round(hud.fuel * 0.15)} LAPS
                </span>
              </div>
              {(() => {
                const cap = hud.fuelCapacityLiters ?? (activeCar.engineType === 'electric' ? 52 : 90);
                const liters = hud.fuelLiters ?? Number(((hud.fuel / 100) * cap).toFixed(1));
                const unit = activeCar.engineType === 'electric' ? 'kWh' : 'L';
                const pct = Math.max(0, Math.min(100, hud.fuel));
                const barColor =
                  pct <= 10 ? 'bg-red-500' : pct <= 22 ? 'bg-amber-400' : 'bg-emerald-400';
                return (
                  <>
                    <div className="flex items-baseline justify-between font-telemetry">
                      <span className="text-base font-extrabold text-white tabular-nums leading-none">
                        {liters.toFixed(1)}
                        <span className="text-[10px] text-slate-400 ml-0.5 font-normal">{unit}</span>
                      </span>
                      <span
                        className={`text-xs font-bold tabular-nums ${
                          pct <= 12 ? 'text-red-400' : pct <= 25 ? 'text-amber-300' : 'text-slate-200'
                        }`}
                      >
                        {pct}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded bg-[#18202c] overflow-hidden">
                      <div
                        className={`h-full transition-all duration-150 ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </>
                );
              })()}
            </div>

            {/* MODULE 4: DAMAGE */}
            <div
              data-testid="hud-module-damage"
              className="bg-[#0b0e13]/90 border border-white/12 rounded-md px-3 py-2 shadow-lg"
            >
              {(() => {
                const d = hud.damage ?? { frontWing: 0, rearWing: 0, engine: 0, suspension: 0 };
                const maxDmg = Math.max(d.frontWing, d.rearWing, d.engine, d.suspension);
                const zones = [
                  ['FW', d.frontWing],
                  ['RW', d.rearWing],
                  ['ENG', d.engine],
                  ['SUSP', d.suspension],
                ] as const;
                return (
                  <>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[9px] font-display font-bold uppercase tracking-wider text-slate-400">
                        Damage
                      </span>
                      <span
                        className={`text-[9px] font-telemetry font-bold uppercase ${
                          maxDmg > 50
                            ? 'text-red-400'
                            : maxDmg > 15
                            ? 'text-amber-300'
                            : 'text-emerald-400'
                        }`}
                      >
                        {maxDmg > 50 ? 'CRITICAL' : maxDmg > 15 ? 'DAMAGED' : 'OK'}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-[9px] font-telemetry">
                      {zones.map(([lbl, val]) => {
                        const rounded = Math.round(val);
                        const barCls =
                          rounded > 50
                            ? 'bg-red-500'
                            : rounded > 15
                            ? 'bg-amber-400'
                            : 'bg-emerald-500/70';
                        const txtCls =
                          rounded > 50
                            ? 'text-red-400 font-bold'
                            : rounded > 15
                            ? 'text-amber-300 font-semibold'
                            : 'text-slate-300';
                        return (
                          <div key={lbl} className="bg-[#131924] rounded px-1 py-0.5 text-center">
                            <div className="text-[8px] text-slate-500 leading-none">{lbl}</div>
                            <div className={`tabular-nums leading-tight mt-0.5 ${txtCls}`}>
                              {rounded}%
                            </div>
                            <div className="mt-0.5 h-0.5 rounded bg-[#1e2636] overflow-hidden">
                              <div
                                className={`h-full ${barCls}`}
                                style={{ width: `${Math.min(100, Math.max(rounded > 0 ? 12 : 0, rounded))}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* MODULE 1: TYRES & BRAKES */}
            <div
              data-testid="hud-module-tyres-brakes"
              className="bg-[#0b0e13]/90 border border-white/12 rounded-md px-3 py-2.5 shadow-lg space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-display font-bold uppercase tracking-wider text-slate-400">
                  Tyres &amp; Brakes
                </span>
                <div className="flex items-center gap-1.5 text-[10px] font-telemetry">
                  <span className="px-1.5 py-0.2 rounded bg-white/10 text-white font-bold uppercase">
                    {hud.compound}
                  </span>
                  <span className={hud.tireWear < 30 ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
                    {hud.tireWear}%
                  </span>
                </div>
              </div>

              {hud.tires && (
                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  {(['fl', 'fr', 'rl', 'rr'] as const).map((k) => {
                    const wh = hud.tires![k];
                    const tempColor =
                      wh.temp > 112
                        ? 'text-red-400 border-red-500/45'
                        : wh.temp < 65
                        ? 'text-sky-300 border-sky-500/40'
                        : 'text-emerald-300 border-emerald-500/35';
                    return (
                      <div
                        key={k}
                        className={`rounded bg-[#131924] border px-1.5 py-0.5 flex items-center justify-between font-telemetry ${tempColor}`}
                      >
                        <span className="uppercase text-[9px] text-slate-400">{k}</span>
                        <span className="tabular-nums">
                          {Math.round(wh.wear)}% · {Math.round(wh.temp)}°
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="pt-1.5 border-t border-white/10 space-y-1 text-[10px]">
                <div className="flex items-center justify-between font-telemetry">
                  <span className="text-slate-400">Brakes F/R</span>
                  {(() => {
                    const bf = hud.brakeTempFront ?? 280;
                    const br = hud.brakeTempRear ?? 250;
                    const isFade = (hud.brakeFade ?? 0) > 0.18;
                    const isLock = (hud.brakeLockup ?? 0) > 0.25;
                    const isCold = Math.max(bf, br) < 185;
                    return (
                      <span
                        className={
                          isFade
                            ? 'text-red-400 font-bold'
                            : isLock
                            ? 'text-amber-300 font-bold'
                            : isCold
                            ? 'text-sky-300 font-semibold'
                            : 'text-slate-200'
                        }
                      >
                        {bf}°/{br}°
                        {isFade ? ' FADE' : isLock ? ' LOCK' : isCold ? ' COLD' : ''}
                      </span>
                    );
                  })()}
                </div>

                <div className="flex items-center justify-between gap-1 pointer-events-auto">
                  <span className="text-slate-400">BBias</span>
                  <div className="flex items-center gap-1">
                    {!isAiRace && onAdjustBrakeBalance && (
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.currentTarget.blur();
                          onAdjustBrakeBalance(-0.5);
                        }}
                        className="px-1.5 rounded bg-[#18202c] hover:bg-[#243044] text-slate-200 border border-white/10 cursor-pointer"
                        title={`Shift Brake Bias Rearward (${formatKeyCode(keybinds.brakeBiasDown)})`}
                      >
                        -
                      </button>
                    )}
                    <span className="font-telemetry text-white min-w-[38px] text-center tabular-nums">
                      {(hud.brakeBalance ?? 56).toFixed(1)}%
                    </span>
                    {!isAiRace && onAdjustBrakeBalance && (
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.currentTarget.blur();
                          onAdjustBrakeBalance(0.5);
                        }}
                        className="px-1.5 rounded bg-[#18202c] hover:bg-[#243044] text-slate-200 border border-white/10 cursor-pointer"
                        title={`Shift Brake Bias Forward (${formatKeyCode(keybinds.brakeBiasUp)})`}
                      >
                        +
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* MODULE 3: GEAR / SPEED / RPM (+ ERS & Class Special) */}
            <div
              data-testid="hud-module-speed"
              className="bg-[#0b0e13]/90 border border-white/12 rounded-md px-3 py-2.5 shadow-lg space-y-2"
            >
              {isAiRace && (
                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-white/10 text-[10px]">
                  <span className="font-semibold text-white truncate">
                    {hud.spectatedDriverName || 'AI Driver'}
                  </span>
                  <span
                    className="px-1.5 py-0.5 text-[9px] font-display font-bold rounded-sm shrink-0"
                    style={{ backgroundColor: classMeta.plateColor, color: classMeta.badgeTextColor }}
                  >
                    {classMeta.shortName}
                  </span>
                </div>
              )}

              <div className="flex items-end justify-between gap-3">
                <div>
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider block leading-none">
                    KM/H
                  </span>
                  <span
                    data-testid="hud-speed"
                    className="text-4xl font-display font-extrabold text-white tabular-nums leading-none"
                  >
                    {hud.speedKmh}
                  </span>
                </div>

                <div className="text-right">
                  <div className="flex items-center justify-end gap-1 mb-0.5">
                    <span className="text-[9px] text-slate-400 uppercase">Gear</span>
                    {!isAiRace && (
                      <span
                        data-testid="hud-transmission-badge"
                        className={`px-1 py-0.2 rounded text-[8px] font-bold uppercase tracking-wider ${
                          isManualGears
                            ? 'bg-amber-500/25 text-amber-300 border border-amber-400/40'
                            : 'bg-white/10 text-slate-300'
                        }`}
                      >
                        {isManualGears ? 'MAN' : 'AUTO'}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-3xl font-display font-extrabold tabular-nums leading-none ${
                      isManualGears && hud.rpmNormalized > 0.91 ? 'text-red-400 animate-pulse' : 'text-amber-400'
                    }`}
                  >
                    {hud.gear === -1 ? 'R' : hud.gear}
                  </span>
                </div>
              </div>

              {/* RPM Bar */}
              <div className="h-2 rounded bg-[#1a202c] overflow-hidden">
                <div
                  className="h-full transition-all duration-75"
                  style={{
                    width: `${Math.round(hud.rpmNormalized * 100)}%`,
                    backgroundColor:
                      hud.rpmNormalized > 0.88
                        ? '#ef4444'
                        : hud.rpmNormalized > 0.72
                        ? '#f59e0b'
                        : '#38bdf8',
                  }}
                />
              </div>

              {/* ERS Battery + Mode (for Hybrid classes) */}
              {hasHybridErs && (
                <div className="space-y-1 pt-1 border-t border-white/10">
                  <div className="flex items-center justify-between text-[9px] font-telemetry">
                    <span className="text-sky-300 font-semibold uppercase">ERS Battery</span>
                    <span className="text-white font-bold tabular-nums">{hud.ersBattery ?? 0}%</span>
                  </div>
                  <div className="h-1.5 rounded bg-[#18202c] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-100"
                      style={{ width: `${Math.max(0, Math.min(100, hud.ersBattery ?? 0))}%` }}
                    />
                  </div>
                  {!isAiRace && onCycleErsMode && (
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onCycleErsMode();
                      }}
                      className="w-full py-0.5 px-1.5 rounded bg-[#151d2b] hover:bg-[#1e2a3d] border border-sky-500/35 text-[9px] font-bold uppercase tracking-wider text-sky-300 flex items-center justify-between cursor-pointer pointer-events-auto"
                      title={`Cycle Hybrid ERS Mode (${formatKeyCode(keybinds.ersMode)})`}
                    >
                      <span>ERS [{formatKeyCode(keybinds.ersMode)}]</span>
                      <span className="text-white">{(hud.ersMode ?? 'balanced').toUpperCase()}</span>
                    </button>
                  )}
                </div>
              )}

              {/* Class Special & Camera Footer */}
              <div className="pt-1.5 border-t border-white/8 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[10px] text-slate-400">
                {carSpecial.specialType !== 'none' ? (
                  <span className="truncate">
                    {carSpecial.specialType === 'drs' ? (
                      <span>
                        DRS:{' '}
                        <strong
                          className={
                            hud.specialActive
                              ? 'text-emerald-400 font-bold'
                              : hud.drsEligible
                              ? 'text-emerald-300'
                              : 'text-slate-200'
                          }
                        >
                          {hud.specialActive
                            ? 'OPEN'
                            : hud.drsEligible
                            ? 'READY'
                            : hud.inDrsZone
                            ? '>1s'
                            : 'CLOSED'}
                        </strong>{' '}
                        {!isAiRace && (
                          <span className="text-[9px] text-slate-500">[{formatKeyCode(keybinds.special)}]</span>
                        )}
                      </span>
                    ) : carSpecial.specialType === 'active-aero' ? (
                      <span>
                        Aero:{' '}
                        <strong className={hud.specialActive ? 'text-emerald-400 font-bold' : 'text-slate-200'}>
                          {hud.specialActive ? 'X-MODE' : 'Z-MODE'}
                        </strong>{' '}
                        {!isAiRace && (
                          <span className="text-[9px] text-slate-500">[{formatKeyCode(keybinds.special)}]</span>
                        )}
                      </span>
                    ) : carSpecial.specialType === 'attack-mode' ? (
                      <span>
                        Attack:{' '}
                        <strong className={hud.specialActive ? 'text-cyan-300 font-bold' : 'text-slate-200'}>
                          {hud.specialActive
                            ? `${hud.attackModeTimer?.toFixed(1) ?? '15.0'}s`
                            : `${hud.attackModeUsesRemaining ?? 2}/2`}
                        </strong>
                      </span>
                    ) : carSpecial.specialType === 'v10-overboost' ? (
                      <span>
                        V10:{' '}
                        <strong className={hud.specialActive ? 'text-red-400 font-bold' : 'text-slate-200'}>
                          {hud.specialActive ? `ON ${hud.specialCharge}%` : `${hud.specialCharge}%`}
                        </strong>{' '}
                        {!isAiRace && (
                          <span className="text-[9px] text-slate-500">[{formatKeyCode(keybinds.special)}]</span>
                        )}
                      </span>
                    ) : carSpecial.specialType === 'rich-fuel-overboost' ? (
                      <span>
                        Rich:{' '}
                        <strong className={hud.specialActive ? 'text-amber-400 font-bold' : 'text-slate-200'}>
                          {hud.specialActive ? `ON ${hud.specialCharge}%` : `${hud.specialCharge}%`}
                        </strong>{' '}
                        {!isAiRace && (
                          <span className="text-[9px] text-slate-500">[{formatKeyCode(keybinds.special)}]</span>
                        )}
                      </span>
                    ) : (
                      <span>
                        {carSpecial.specialLabel}:{' '}
                        <strong className={hud.specialActive ? 'text-emerald-400 font-bold' : 'text-slate-200'}>
                          {hud.specialActive
                            ? `ON ${hud.ersBattery ?? hud.specialCharge}%`
                            : `${hud.ersBattery ?? hud.specialCharge}%`}
                        </strong>{' '}
                        {!isAiRace && (
                          <span className="text-[9px] text-slate-500">[{formatKeyCode(keybinds.special)}]</span>
                        )}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider">
                    {classMeta.shortName}
                  </span>
                )}
                {hud.trackWetness > 0.1 ? (
                  <span className="text-sky-300 font-semibold shrink-0">
                    Wet {Math.round(hud.trackWetness * 100)}%
                  </span>
                ) : isAiRace ? (
                  <span data-testid="hud-camera-label" className="shrink-0">
                    [F] Freecam
                  </span>
                ) : (
                  <span data-testid="hud-camera-label" className="shrink-0">
                    {hud.cameraMode === 'hood' ? 'Hood' : 'Orbit'} [{formatKeyCode(keybinds.camera)}]
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        </DraggableHudPanel>
      </div>

      {/* Section 4.2.2: In-Game AI Neural Telemetry & Visualizer Overlay (Pro/Debug Mode) */}
      {showAiVisualizer && hud.aiNeuralTelemetry && (
        <DraggableHudPanel
          id="aiVisualizer"
          offsets={hudOffsets}
          hudScale={hudScale}
          onCommitOffset={commitHudOffset}
          gripPosition="top-left"
          className="fixed right-3 top-48 sm:right-5 sm:top-52 z-25"
        >
        <div
          data-testid="hud-ai-neural-visualizer"
          className="w-[264px] bg-[#0b0e13]/92 border border-sky-500/35 rounded-md p-3 text-[11px] text-slate-200 shadow-2xl pointer-events-auto space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1.5">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="font-display font-bold text-white truncate">
                  {hud.aiNeuralTelemetry.driverName}
                </span>
                {hud.aiNeuralTelemetry.nationality && (
                  <span className="px-1 py-0.2 rounded bg-white/10 text-[9px] font-telemetry text-slate-300">
                    {hud.aiNeuralTelemetry.nationality}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {hud.aiNeuralTelemetry.personality} · {hud.aiNeuralTelemetry.policyBlendLabel}
              </div>
            </div>
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 ${
                hud.aiNeuralTelemetry.activeManeuver === 'defending'
                  ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40'
                  : hud.aiNeuralTelemetry.activeManeuver === 'overtaking'
                  ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                  : hud.aiNeuralTelemetry.activeManeuver === 'recovering'
                  ? 'bg-red-600/30 text-red-300 border border-red-500/40'
                  : 'bg-sky-600/25 text-sky-300 border border-sky-500/35'
              }`}
            >
              {hud.aiNeuralTelemetry.activeManeuver}
            </span>
          </div>

          {/* Live Neural Policy Outputs: Steer / Throttle / Brake */}
          <div className="space-y-1.5 font-telemetry tabular-nums">
            <div className="flex items-center gap-2 text-[10px]">
              <span className="w-9 text-slate-400">STR</span>
              <div className="flex-1 h-2 bg-[#161c28] rounded overflow-hidden relative">
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/25" />
                <div
                  className="absolute top-0 bottom-0 bg-sky-400"
                  style={{
                    left: hud.aiNeuralTelemetry.steer >= 0 ? '50%' : `${50 + hud.aiNeuralTelemetry.steer * 50}%`,
                    width: `${Math.abs(hud.aiNeuralTelemetry.steer) * 50}%`,
                  }}
                />
              </div>
              <span className="w-10 text-right text-sky-300">
                {hud.aiNeuralTelemetry.steer >= 0 ? '+' : ''}
                {hud.aiNeuralTelemetry.steer.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="w-9 text-slate-400">THR</span>
              <div className="flex-1 h-2 bg-[#161c28] rounded overflow-hidden">
                <div
                  className="h-full bg-emerald-400"
                  style={{ width: `${Math.round(hud.aiNeuralTelemetry.throttle * 100)}%` }}
                />
              </div>
              <span className="w-10 text-right text-emerald-300">
                {Math.round(hud.aiNeuralTelemetry.throttle * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="w-9 text-slate-400">BRK</span>
              <div className="flex-1 h-2 bg-[#161c28] rounded overflow-hidden">
                <div
                  className="h-full bg-red-500"
                  style={{ width: `${Math.round(hud.aiNeuralTelemetry.brake * 100)}%` }}
                />
              </div>
              <span className="w-10 text-right text-red-400">
                {Math.round(hud.aiNeuralTelemetry.brake * 100)}%
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
              <span>Starts → Race Crossfade</span>
              <span className="text-sky-300">
                {Math.round(hud.aiNeuralTelemetry.startPolicyWeight * 100)}% starts
              </span>
            </div>
          </div>

          {/* 8 Lookahead Curvature Probes */}
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1">
              8 Lookahead Curvature Probes (10m → 310m)
            </div>
            <div className="grid grid-cols-8 gap-1 h-9 items-center bg-[#121722] rounded px-1.5 py-1 border border-white/5">
              {hud.aiNeuralTelemetry.lookaheadCurvatures.map((k, idx) => {
                const mag = Math.min(1, Math.abs(k));
                return (
                  <div key={idx} className="h-full flex flex-col justify-center items-center relative">
                    <div className="w-full h-px bg-white/15 absolute top-1/2" />
                    <div
                      className={`w-2 rounded-xs ${k >= 0 ? 'bg-amber-400' : 'bg-cyan-400'}`}
                      style={{
                        height: `${Math.max(2, Math.round(mag * 14))}px`,
                        transform: k >= 0 ? 'translateY(-45%)' : 'translateY(45%)',
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4 Neural Traffic Radar Slots */}
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1">
              4 Neural Traffic Radar Slots
            </div>
            <div className="grid grid-cols-2 gap-1 font-telemetry text-[10px] tabular-nums">
              {hud.aiNeuralTelemetry.radarSlots.map((slot, idx) => (
                <div
                  key={idx}
                  className={`px-1.5 py-1 rounded border ${
                    slot.occupied
                      ? 'bg-[#151e2e] border-sky-500/35 text-slate-200'
                      : 'bg-[#0f131b] border-white/5 text-slate-600'
                  }`}
                >
                  {slot.occupied
                    ? `S${idx + 1}: ${slot.relLongM >= 0 ? '+' : ''}${slot.relLongM}m / ${slot.relLatM >= 0 ? '+' : ''}${slot.relLatM}m`
                    : `S${idx + 1}: Clear`}
                </div>
              ))}
            </div>
          </div>

          {(hud.aiNeuralTelemetry.strategyIntent || hud.aiNeuralTelemetry.mistakeActive) && (
            <div className="pt-1 border-t border-white/10 text-[10px] space-y-0.5">
              {hud.aiNeuralTelemetry.strategyIntent && (
                <div className="text-amber-300 truncate">
                  Strategy: {hud.aiNeuralTelemetry.strategyIntent}
                </div>
              )}
              {hud.aiNeuralTelemetry.mistakeActive && (
                <div className="text-red-400 font-semibold">Mistake event active (lockup/wide)</div>
              )}
            </div>
          )}
        </div>
        </DraggableHudPanel>
      )}
    </div>
  );
}
