import { useMemo, useState } from 'react';
import {
  Bot,
  Car,
  ChevronRight,
  Compass,
  Flag,
  Layers,
  MapPin,
  Palette,
  Sparkles,
  Users,
  Volume2,
  Wrench,
} from 'lucide-react';
import { CAR_CLASSES, getCarById } from '../game/cars';
import { compileTrack, formatTargetLapMMSS, getTrackById } from '../game/tracks';
import { RaceConfig, TrackSpec } from '../game/types';

interface TitleOverlayProps {
  raceConfig: RaceConfig;
  roomCode: string | null;
  onOpenRace: () => void;
  onOpenHostAiRace: () => void;
  onOpenMultiplayer: () => void;
  onOpenCarsShowcase: () => void;
  onOpenTracksShowcase: () => void;
  onOpenStudio: () => void;
  onOpenLiveryStudio: () => void;
  onOpenSoundStudio: () => void;
}

const MODERN_MENU_STORAGE_KEY = 'apex_modern_menu_v2';

function loadModernMenuPreference(): boolean {
  try {
    return window.localStorage.getItem(MODERN_MENU_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

function saveModernMenuPreference(val: boolean): void {
  try {
    window.localStorage.setItem(MODERN_MENU_STORAGE_KEY, val ? '1' : '0');
  } catch {
    // Ignore storage errors
  }
}

function ApexLogo({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      viewBox="0 0 380 86"
      className={compact ? 'w-48 md:w-56 h-auto' : 'w-56 md:w-64 h-auto'}
      role="img"
      aria-label="Apex Miniature"
    >
      <polygon points="8,70 36,14 58,14 30,70" fill="#ef4444" />
      <polygon points="36,70 64,14 78,14 50,70" fill="#f8fafc" />
      <polygon points="56,70 72,38 86,38 70,70" fill="#facc15" />
      <text
        x="100"
        y="44"
        fill="#f8fafc"
        fontFamily="Oxanium, sans-serif"
        fontWeight="800"
        fontSize="36"
        letterSpacing="2"
      >
        APEX
      </text>
      <text
        x="102"
        y="70"
        fill="#cbd5e1"
        fontFamily="Oxanium, sans-serif"
        fontWeight="700"
        fontSize="20"
        letterSpacing="5.5"
      >
        MINIATURE
      </text>
    </svg>
  );
}

function MiniTrackPreviewSvg({ track }: { track: TrackSpec }) {
  const pathD = useMemo(() => {
    const compiled = compileTrack(track, 64);
    const xs = compiled.samples.map((s) => s.x);
    const zs = compiled.samples.map((s) => s.z);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const span = Math.max(maxX - minX, maxZ - minZ, 1);

    return (
      compiled.samples
        .map((s, idx) => {
          const px = 10 + ((s.x - minX) / span) * 76;
          const py = 10 + ((s.z - minZ) / span) * 44;
          return `${idx === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
        })
        .join(' ') + ' Z'
    );
  }, [track]);

  return (
    <svg viewBox="0 0 96 64" className="w-20 h-14 shrink-0" aria-hidden="true">
      <path
        d={pathD}
        fill="none"
        stroke="#0f172a"
        strokeWidth="6.5"
        strokeLinejoin="round"
      />
      <path
        d={pathD}
        fill="none"
        stroke="#e2e8f0"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TitleOverlay({
  raceConfig,
  roomCode,
  onOpenRace,
  onOpenHostAiRace,
  onOpenMultiplayer,
  onOpenCarsShowcase,
  onOpenTracksShowcase,
  onOpenStudio,
  onOpenLiveryStudio,
  onOpenSoundStudio,
}: TitleOverlayProps) {
  const [modernMenu, setModernMenu] = useState<boolean>(() => loadModernMenuPreference());

  const car = getCarById(raceConfig.playerCarId);
  const track = raceConfig.customTrack || getTrackById(raceConfig.trackId);
  const classMeta = CAR_CLASSES[car.classId];
  const isAiRaceMode = raceConfig.sessionMode === 'ai-race';
  const aiCount = isAiRaceMode
    ? Math.max(2, raceConfig.aiBotCount || 11)
    : raceConfig.noAi || raceConfig.sessionMode === 'practice'
    ? 0
    : Math.max(0, raceConfig.aiBotCount ?? 11);

  const toggleModernMenu = () => {
    setModernMenu((prev) => {
      const next = !prev;
      saveModernMenuPreference(next);
      return next;
    });
  };

  const trackLocation = track.city ? `${track.city}, ${track.country}` : track.country;
  const lapEstMMSS = formatTargetLapMMSS(track.targetLapSeconds);
  const setupModeSummary = isAiRaceMode
    ? `Host AI Race · ${aiCount} AI · ${raceConfig.totalLaps} Laps`
    : aiCount === 0
    ? raceConfig.totalLaps <= 0
      ? 'Solo Practice · Continuous'
      : `Solo Practice · ${raceConfig.totalLaps} Laps`
    : `${aiCount} AI Opponents · ${raceConfig.totalLaps} Laps · ${
        raceConfig.qualifyingEnabled ? '1-Lap Quali' : 'Grid Start'
      }`;

  const topBar = (
    <div className="flex items-start justify-between gap-4">
      {/* Top-Left Logo Lockup */}
      <div className="pointer-events-auto">
        <ApexLogo compact={modernMenu} />
      </div>

      {/* Top-Right Room Indicator & Modern Version Toggle */}
      <div className="flex items-center gap-3 pointer-events-auto">
        {roomCode && (
          <button
            type="button"
            onClick={onOpenMultiplayer}
            className="px-3 py-1.5 rounded bg-[#0b0e13]/92 border border-amber-500/40 text-xs font-telemetry text-amber-400 hover:text-amber-300 cursor-pointer whitespace-nowrap shrink-0"
          >
            Room {roomCode}
          </button>
        )}
        <button
          type="button"
          data-testid="btn-toggle-modern-menu"
          onClick={toggleModernMenu}
          aria-pressed={modernMenu}
          className={`px-3.5 py-2 rounded-md border text-xs font-display font-bold tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-2 ${
            modernMenu
              ? 'bg-red-600 border-red-400 text-white shadow-lg shadow-red-950/50'
              : 'bg-[#121722]/95 hover:bg-[#1a2232] border-white/20 hover:border-white/40 text-slate-100'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Modern Version</span>
          <span className="text-[10px] font-telemetry opacity-80">
            {modernMenu ? 'ON' : 'OFF'}
          </span>
        </button>
      </div>
    </div>
  );

  if (modernMenu) {
    return (
      <div
        data-testid="title-overlay"
        data-menu-style="modern"
        className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-5 md:p-8"
      >
        {topBar}

        {/* Modern Left Paddock Command Column */}
        <div className="max-w-[430px] w-full pointer-events-auto my-auto space-y-3.5">
          {/* Primary Launch Stack */}
          <div className="bg-[#0b0e13]/58 border border-white/15 rounded-lg p-4 space-y-3 shadow-lg">
            <div className="flex items-center justify-between text-[11px] text-slate-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
              <span className="font-display font-bold uppercase tracking-widest text-white">
                Paddock Control
              </span>
              <span className="font-telemetry text-slate-200">
                {raceConfig.aiDifficulty} AI · {raceConfig.weather === 'dynamic-rain' ? 'Dynamic Rain' : 'Dry'}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                data-testid="btn-open-race"
                data-start="true"
                onClick={onOpenRace}
                className="w-full px-5 py-3.5 rounded-md bg-red-600/92 hover:bg-red-500 active:bg-red-700 text-white font-display font-bold text-base tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center justify-between shadow-lg shadow-red-950/40"
              >
                <span className="flex items-center gap-2.5">
                  <Flag className="w-4 h-4" />
                  <span>Race & Practice</span>
                </span>
                <ChevronRight className="w-4 h-4 opacity-85" />
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="btn-open-host-ai-race"
                  onClick={onOpenHostAiRace}
                  className="px-4 py-2.5 rounded-md bg-[#121722]/65 hover:bg-[#1a2232]/80 border border-amber-500/40 hover:border-amber-400 text-amber-100 hover:text-white font-display font-bold text-xs tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center justify-center gap-2"
                >
                  <Bot className="w-3.5 h-3.5 text-amber-400" />
                  <span>Host AI Race</span>
                </button>

                <button
                  type="button"
                  data-testid="btn-open-multiplayer"
                  onClick={onOpenMultiplayer}
                  className="px-4 py-2.5 rounded-md bg-[#121722]/65 hover:bg-[#1a2232]/80 border border-white/20 hover:border-white/40 text-slate-100 font-display font-bold text-xs tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center justify-center gap-2"
                >
                  <Users className="w-3.5 h-3.5 text-sky-400" />
                  <span>Multiplayer</span>
                  {roomCode && <span className="font-telemetry text-[11px] text-amber-400">({roomCode})</span>}
                </button>
              </div>
            </div>

            <div className="pt-1.5 border-t border-white/12 text-[11px] text-slate-200 flex items-center justify-between gap-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
              <span className="truncate">{setupModeSummary}</span>
              <span className="text-slate-300 whitespace-nowrap">Enter to Launch</span>
            </div>
          </div>

          {/* Compact Selected Car & Selected Track Previews */}
          <div className="grid grid-cols-1 gap-2.5">
            {/* Compact Selected Car Preview */}
            <button
              type="button"
              onClick={onOpenCarsShowcase}
              className="w-full text-left bg-[#0b0e13]/52 hover:bg-[#111620]/70 border border-white/15 hover:border-white/30 rounded-lg p-3.5 transition-colors cursor-pointer group shadow-lg"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="px-1.5 py-0.5 text-[10px] font-display font-bold rounded-sm shrink-0"
                      style={{ backgroundColor: classMeta.plateColor, color: classMeta.badgeTextColor }}
                    >
                      {classMeta.shortName}
                    </span>
                    <span className="text-[11px] text-slate-200 truncate">{car.manufacturer}</span>
                    <span className="font-telemetry text-[11px] text-slate-300">
                      #{raceConfig.playerLivery.driverNumber}
                    </span>
                  </div>
                  <div className="font-display font-bold text-sm text-white truncate mt-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
                    {car.name}
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-sky-300 group-hover:text-sky-200 whitespace-nowrap shrink-0 flex items-center gap-1">
                  <Car className="w-3.5 h-3.5" />
                  <span>Cars</span>
                </span>
              </div>
              <div className="mt-2.5 h-1.5 w-full rounded-full overflow-hidden flex bg-black/30">
                <div className="h-full flex-1" style={{ backgroundColor: raceConfig.playerLivery.primaryColor }} />
                <div className="h-full w-1/4" style={{ backgroundColor: raceConfig.playerLivery.secondaryColor }} />
                <div className="h-full w-1/6" style={{ backgroundColor: raceConfig.playerLivery.tertiaryColor }} />
              </div>
            </button>

            {/* Compact Selected Track Preview */}
            <button
              type="button"
              onClick={onOpenTracksShowcase}
              className="w-full text-left bg-[#0b0e13]/52 hover:bg-[#111620]/70 border border-white/15 hover:border-white/30 rounded-lg p-3.5 transition-colors cursor-pointer group shadow-lg flex items-center gap-3.5"
            >
              <div className="bg-[#0b0e13]/45 border border-white/12 rounded p-1.5 shrink-0">
                <MiniTrackPreviewSvg track={track} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-200 flex items-center gap-1 truncate">
                    <MapPin className="w-3 h-3 text-red-400 shrink-0" />
                    <span className="truncate">{trackLocation}</span>
                  </span>
                  <span className="text-[11px] font-semibold text-emerald-300 group-hover:text-emerald-200 whitespace-nowrap shrink-0 flex items-center gap-1">
                    <Compass className="w-3.5 h-3.5" />
                    <span>Tracks</span>
                  </span>
                </div>
                <div className="font-display font-bold text-sm text-white truncate mt-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
                  {track.name}
                </div>
                <div className="text-[11px] font-telemetry text-slate-200 mt-0.5">
                  {track.circuitLengthKm ? `${track.circuitLengthKm.toFixed(2)} km` : `${track.corners} Turns`}
                  {' · '}Est. {lapEstMMSS}
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Bottom Dockless Bar: Showcases + Studios + Key Hints (No Dark Bar Background) */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pointer-events-auto">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="btn-open-cars-showcase"
              onClick={onOpenCarsShowcase}
              className="px-3.5 py-2 rounded-md bg-[#0b0e13]/55 hover:bg-[#161e2e]/78 border border-white/15 hover:border-white/35 text-xs font-semibold text-white cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors"
            >
              <Car className="w-3.5 h-3.5 text-red-400" />
              <span>Cars Showcase</span>
            </button>

            <button
              type="button"
              data-testid="btn-open-tracks-showcase"
              onClick={onOpenTracksShowcase}
              className="px-3.5 py-2 rounded-md bg-[#0b0e13]/55 hover:bg-[#161e2e]/78 border border-white/15 hover:border-white/35 text-xs font-semibold text-white cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors"
            >
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              <span>Tracks Showcase</span>
            </button>

            <span aria-hidden="true" className="hidden sm:inline-block w-px h-5 bg-white/20 mx-0.5" />

            <button
              type="button"
              data-testid="btn-open-livery-studio"
              onClick={onOpenLiveryStudio}
              className="px-3 py-2 rounded-md bg-[#0b0e13]/55 hover:bg-[#161e2e]/78 border border-indigo-400/35 hover:border-indigo-400 text-xs font-semibold text-indigo-100 cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors"
            >
              <Palette className="w-3.5 h-3.5 text-indigo-400" />
              <span>Livery Studio</span>
            </button>

            <button
              type="button"
              data-testid="btn-open-sound-studio"
              onClick={onOpenSoundStudio}
              className="px-3 py-2 rounded-md bg-[#0b0e13]/55 hover:bg-[#161e2e]/78 border border-amber-400/35 hover:border-amber-400 text-xs font-semibold text-amber-100 cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors"
            >
              <Volume2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Sound Studio</span>
            </button>

            <button
              type="button"
              data-testid="btn-open-studio"
              onClick={onOpenStudio}
              className="px-3 py-2 rounded-md bg-[#0b0e13]/55 hover:bg-[#161e2e]/78 border border-sky-400/35 hover:border-sky-400 text-xs font-semibold text-sky-100 cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors"
            >
              <Wrench className="w-3.5 h-3.5 text-sky-400" />
              <span>Track Studio</span>
            </button>
          </div>

          <div className="text-[11px] text-slate-200 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
            WASD / Arrows / Gamepad Drive · Space / Shift / E Special · C Camera · P Pause
          </div>
        </div>
      </div>
    );
  }

  // CLASSIC MAIN MENU (Top-left logo, top-right Modern Version toggle, compact previews, Host AI Race & Showcases)
  return (
    <div
      data-testid="title-overlay"
      data-menu-style="classic"
      className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-6 md:p-10"
      style={{
        background:
          'linear-gradient(90deg, rgba(10,13,18,0.88) 0%, rgba(10,13,18,0.58) 38%, rgba(10,13,18,0.08) 72%, rgba(10,13,18,0) 100%)',
      }}
    >
      {/* Top Bar: Logo Top-Left & Modern Version Toggle Top-Right */}
      {topBar}

      {/* Left-Third Navigation & Compact Car / Track Previews */}
      <div className="max-w-xl pointer-events-auto my-auto space-y-5">
        {/* Compact Selected Car & Track Preview Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onOpenCarsShowcase}
            className="text-left bg-[#0d1118]/92 hover:bg-[#141a24] border border-white/12 hover:border-white/25 rounded-md p-3 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
              <span>SELECTED CAR</span>
              <span className="font-telemetry">#{raceConfig.playerLivery.driverNumber}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="px-1.5 py-0.5 text-[10px] font-display font-bold rounded-sm shrink-0"
                style={{ backgroundColor: classMeta.plateColor, color: classMeta.badgeTextColor }}
              >
                {classMeta.shortName}
              </span>
              <span className="font-semibold text-xs text-white truncate">{car.name}</span>
            </div>
            <div className="mt-2 h-1 rounded-full overflow-hidden flex bg-[#161c28]">
              <div className="h-full flex-1" style={{ backgroundColor: raceConfig.playerLivery.primaryColor }} />
              <div className="h-full w-1/4" style={{ backgroundColor: raceConfig.playerLivery.secondaryColor }} />
              <div className="h-full w-1/6" style={{ backgroundColor: raceConfig.playerLivery.tertiaryColor }} />
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenTracksShowcase}
            className="text-left bg-[#0d1118]/92 hover:bg-[#141a24] border border-white/12 hover:border-white/25 rounded-md p-3 transition-colors cursor-pointer flex items-center gap-2.5"
          >
            <MiniTrackPreviewSvg track={track} />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-slate-400 truncate">{trackLocation}</div>
              <div className="font-semibold text-xs text-white truncate mt-0.5">{track.name}</div>
              <div className="text-[10px] font-telemetry text-slate-400 mt-0.5">
                {track.circuitLengthKm ? `${track.circuitLengthKm.toFixed(2)} km · ` : ''}
                ~{lapEstMMSS}
              </div>
            </div>
          </button>
        </div>

        <div className="text-xs text-slate-300 border-t border-white/10 pt-3">
          {setupModeSummary}
        </div>

        {/* Consolidated Navigation */}
        <div className="space-y-4">
          {/* Primary Play Modes */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              data-testid="btn-open-race"
              data-start="true"
              onClick={onOpenRace}
              className="px-7 py-3 rounded-md bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-display font-bold text-sm tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-lg shadow-red-950/50"
            >
              Race
            </button>

            <button
              type="button"
              data-testid="btn-open-host-ai-race"
              onClick={onOpenHostAiRace}
              className="px-5 py-3 rounded-md bg-[#161b24] hover:bg-[#1e2532] border border-amber-500/35 hover:border-amber-400 text-amber-200 hover:text-white font-display font-bold text-sm tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-2"
            >
              <Bot className="w-4 h-4 text-amber-400" />
              <span>Host AI Race</span>
            </button>

            <button
              type="button"
              data-testid="btn-open-multiplayer"
              onClick={onOpenMultiplayer}
              className="px-5 py-3 rounded-md bg-[#161b24] hover:bg-[#1e2532] border border-white/20 hover:border-white/35 text-slate-100 font-display font-bold text-sm tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center justify-center gap-2"
            >
              <span>Multiplayer</span>
              {roomCode && (
                <span className="font-telemetry text-xs text-amber-400">({roomCode})</span>
              )}
            </button>
          </div>

          {/* 3D Showcases */}
          <div className="pt-3 border-t border-white/10">
            <div className="text-[11px] font-medium text-slate-400 mb-2">Showcases</div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                data-testid="btn-open-cars-showcase"
                onClick={onOpenCarsShowcase}
                className="px-4 py-2 rounded-md bg-[#161b24] hover:bg-[#1e2532] border border-white/15 hover:border-white/30 text-slate-100 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-2"
              >
                <Car className="w-3.5 h-3.5 text-red-400" />
                <span>Cars Showcase</span>
              </button>

              <button
                type="button"
                data-testid="btn-open-tracks-showcase"
                onClick={onOpenTracksShowcase}
                className="px-4 py-2 rounded-md bg-[#161b24] hover:bg-[#1e2532] border border-white/15 hover:border-white/30 text-slate-100 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-2"
              >
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span>Tracks Showcase</span>
              </button>
            </div>
          </div>

          {/* 3 Studio Menus */}
          <div className="pt-3 border-t border-white/10">
            <div className="text-[11px] font-medium text-slate-400 mb-2">Studios</div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                data-testid="btn-open-livery-studio"
                onClick={onOpenLiveryStudio}
                className="px-4 py-2 rounded-md bg-[#161b24] hover:bg-[#1e2532] border border-indigo-500/30 hover:border-indigo-400 text-indigo-300 hover:text-white font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center justify-center gap-2"
              >
                <Palette className="w-3.5 h-3.5" />
                <span>Livery Studio</span>
              </button>

              <button
                type="button"
                data-testid="btn-open-sound-studio"
                onClick={onOpenSoundStudio}
                className="px-4 py-2 rounded-md bg-[#161b24] hover:bg-[#1e2532] border border-amber-500/30 hover:border-amber-400 text-amber-300 hover:text-white font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center justify-center gap-2"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>Sound Studio</span>
              </button>

              <button
                type="button"
                data-testid="btn-open-studio"
                onClick={onOpenStudio}
                className="px-4 py-2 rounded-md bg-[#161b24] hover:bg-[#1e2532] border border-sky-500/30 hover:border-sky-400 text-sky-300 hover:text-white font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center justify-center gap-2"
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Track Studio</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom flat borderless control hint */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
        <span>
          WASD / Arrows / Controller (R2/L2/Stick) Drive · Space / Shift / E / X Toggle Special · R-Stick / C Camera · M Mute · P Pause
        </span>
        <span className="text-slate-200/90">Press Enter to launch active setup</span>
      </div>
    </div>
  );
}

