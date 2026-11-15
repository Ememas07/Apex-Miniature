import { CAR_CLASSES, getCarById } from '../game/cars';
import { getTrackById } from '../game/tracks';
import { RaceConfig } from '../game/types';

interface TitleOverlayProps {
  raceConfig: RaceConfig;
  roomCode: string | null;
  onStartRace: () => void;
  onOpenGarage: () => void;
  onOpenSetup: () => void;
  onOpenStudio?: () => void;
}

export function TitleOverlay({
  raceConfig,
  roomCode,
  onStartRace,
  onOpenGarage,
  onOpenSetup,
  onOpenStudio,
}: TitleOverlayProps) {
  const car = getCarById(raceConfig.playerCarId);
  const track = raceConfig.customTrack || getTrackById(raceConfig.trackId);
  const classMeta = CAR_CLASSES[car.classId];

  return (
    <div
      data-testid="title-overlay"
      className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-6 md:p-12"
      style={{
        background:
          'linear-gradient(90deg, rgba(10,13,18,0.88) 0%, rgba(10,13,18,0.58) 38%, rgba(10,13,18,0.08) 72%, rgba(10,13,18,0) 100%)',
      }}
    >
      {/* Top quiet session line */}
      <div className="flex items-center justify-between text-xs tracking-wider text-slate-300">
        <div className="flex items-center gap-3">
          <span className="font-display font-bold text-slate-100">APEX MINIATURE</span>
          <span aria-hidden="true" className="text-slate-600">/</span>
          <span className="text-slate-400">All 57 Cars & 43 Circuits Unlocked</span>
        </div>
        <div className="flex items-center gap-4 pointer-events-auto">
          {roomCode && (
            <div className="text-xs font-telemetry text-amber-400">
              Room {roomCode}
            </div>
          )}
          <a
            href="/"
            title="Return to Main Hub"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-sky-400 hover:text-sky-300 border border-sky-500/30 hover:border-sky-400 font-semibold text-xs transition-all shadow-sm cursor-pointer"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            Back to Hub
          </a>
        </div>
      </div>

      {/* Left-Third Asymmetric Title Lockup */}
      <div className="max-w-lg pointer-events-auto my-auto">
        <div className="mb-5">
          {/* Bespoke inline SVG Motorsport Crest & Wordmark */}
          <svg
            viewBox="0 0 380 86"
            className="w-72 md:w-96 h-auto"
            role="img"
            aria-label="Apex Miniature"
          >
            {/* Stylized Curb & Apex Chevron Emblem */}
            <polygon points="8,70 36,14 58,14 30,70" fill="#ef4444" />
            <polygon points="36,70 64,14 78,14 50,70" fill="#f8fafc" />
            <polygon points="56,70 72,38 86,38 70,70" fill="#facc15" />
            {/* Wordmark */}
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
        </div>

        {/* Active Setup Summary (unboxed clean metadata) */}
        <div className="mb-7 space-y-1.5 border-t border-white/10 pt-4">
          <div className="flex items-center gap-2.5 text-sm text-slate-200">
            <span
              className="inline-block px-2 py-0.5 text-[11px] font-display font-bold rounded-sm"
              style={{ backgroundColor: classMeta.plateColor, color: classMeta.badgeTextColor }}
            >
              {classMeta.shortName}
            </span>
            <span className="font-semibold text-white">{car.name}</span>
            <span aria-hidden="true" className="text-slate-500">·</span>
            <span className="font-telemetry text-slate-300">#{raceConfig.playerLivery.driverNumber}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>{track.name}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{raceConfig.totalLaps} Laps</span>
            <span aria-hidden="true">·</span>
            <span>{raceConfig.activeClasses.length > 1 ? `${raceConfig.activeClasses.length}-Class Grid` : 'Single Class'}</span>
            <span aria-hidden="true">·</span>
            <span>{raceConfig.qualifyingEnabled ? '1-Lap Quali' : 'Grid Start'}</span>
          </div>
        </div>

        {/* Primary & Secondary Actions (<= 3 menu actions total) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            type="button"
            data-start="true"
            onClick={onStartRace}
            className="px-7 py-3.5 rounded-md bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-display font-bold text-base tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-lg shadow-red-950/50"
          >
            {raceConfig.qualifyingEnabled ? 'Start Qualifying' : 'Hit the Track'}
          </button>

          <button
            type="button"
            onClick={onOpenGarage}
            className="px-5 py-3.5 rounded-md bg-[#161b24] hover:bg-[#1e2532] border border-white/15 text-slate-100 font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Garage & Livery
          </button>

          <button
            type="button"
            onClick={onOpenSetup}
            className="px-5 py-3.5 rounded-md bg-[#161b24] hover:bg-[#1e2532] border border-white/15 text-slate-100 font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Track & Multiplayer
          </button>

          {onOpenStudio && (
            <button
              type="button"
              data-testid="btn-open-studio"
              onClick={onOpenStudio}
              className="px-5 py-3.5 rounded-md bg-[#161b24] hover:bg-[#1e2532] border border-sky-500/30 hover:border-sky-400 text-sky-300 hover:text-white font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center justify-center gap-2"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Track Studio
            </button>
          )}
        </div>
      </div>

      {/* Bottom flat borderless control hint */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
        <span>
          WASD / Arrows Drive · Space Class Special · C Camera · M Mute · P Pause
        </span>
        <span className="text-slate-500">Press Enter or Space to start</span>
      </div>
    </div>
  );
}

