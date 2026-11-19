import { useMemo } from 'react';
import { Camera, Volume2, VolumeX, Pause, Wrench, Home, Fuel } from 'lucide-react';
import { CAR_CLASSES, getCarById, resolveCarSpecial } from '../game/cars';
import { formatLapTime } from '../game/physics';
import { compileTrack, getTrackById } from '../game/tracks';
import { HudSnapshot, PitServiceAction, PitStrategy, TireCompound, TrackSpec } from '../game/types';

interface RaceHUDProps {
  hud: HudSnapshot;
  trackId: string;
  customTrack?: TrackSpec;
  playerCarId: string;
  muted: boolean;
  onChangePitStrategy: (strategy: PitStrategy) => void;
  onRequestPitStop: (action: PitServiceAction, nextCompound?: TireCompound) => boolean;
  onCycleCamera: () => void;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onReturnToTitle: () => void;
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
  onToggleMute,
  onTogglePause,
  onReturnToTitle,
}: RaceHUDProps) {
  const track = customTrack || getTrackById(trackId);
  const playerCar = getCarById(playerCarId);
  const classMeta = CAR_CLASSES[playerCar.classId];
  const carSpecial = resolveCarSpecial(playerCar);

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
    hud.countdown <= 0 && (hud.isStoppedOnTrack || hud.pitStopRemaining > 0);
  const remainingTotal =
    hud.pitStopRemaining +
    hud.pitQueue.reduce((acc, task) => acc + (task === 'tyres' ? 2.0 : 4.0), 0);
  const pitProgressPct =
    hud.pitStopTotal > 0
      ? Math.max(0, Math.min(100, ((hud.pitStopTotal - remainingTotal) / hud.pitStopTotal) * 100))
      : 0;

  return (
    <div
      data-testid="race-hud"
      className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-4 md:p-5"
    >
      {/* TOP BAR CORNERS */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left Cluster: Position / Practice Mode, Lap & Live Intervals / Sectors */}
        <div className="bg-[#0b0e13]/90 border border-white/12 rounded-md px-4 py-3 min-w-[245px] shadow-lg">
          {hud.sessionMode === 'practice' ? (
            <>
              <div className="flex items-baseline justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-display font-extrabold text-emerald-400 tracking-wide leading-none">
                    PRACTICE
                  </span>
                  <span
                    className="px-1.5 py-0.5 text-[10px] font-display font-bold rounded-sm"
                    style={{ backgroundColor: classMeta.plateColor, color: classMeta.badgeTextColor }}
                  >
                    {classMeta.shortName}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block">SOLO HOTLAP</span>
                  <span className="font-display font-bold text-sm text-white tabular-nums">
                    {hud.totalLaps > 0 ? `LAP ${hud.lap} / ${hud.totalLaps}` : `LAP ${hud.lap}`}
                  </span>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-white/10 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Lap</span>
                  <span className="font-telemetry text-white">{formatLapTime(hud.currentLapTime)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Best</span>
                  <span className="font-telemetry text-emerald-400">{formatLapTime(hud.bestLapTime)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Last</span>
                  <span className="font-telemetry text-slate-200">{formatLapTime(hud.lastLapTime)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Sector</span>
                  <span className="font-telemetry text-sky-300">S{hud.currentSector ?? 1}</span>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-white/10 grid grid-cols-3 gap-2 text-[11px]">
                {[0, 1, 2].map((idx) => {
                  const val = hud.sectorTimes?.[idx] ?? hud.lastLapSectorTimes?.[idx] ?? null;
                  const best = hud.bestSectorTimes?.[idx] ?? null;
                  const isBest = val !== null && best !== null && Math.abs(val - best) < 0.005;
                  return (
                    <div key={idx} className="bg-[#131822] rounded px-1.5 py-1 text-center">
                      <div className="text-[10px] text-slate-400">S{idx + 1}</div>
                      <div
                        className={`font-telemetry font-semibold ${
                          isBest ? 'text-emerald-400' : val !== null ? 'text-slate-100' : 'text-slate-500'
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
              <div className="flex items-baseline justify-between gap-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-display font-extrabold text-white tabular-nums leading-none">
                    P{hud.position}
                  </span>
                  <span className="text-xs text-slate-400 tabular-nums">/{hud.totalCars}</span>
                  <span
                    className="ml-1 px-1.5 py-0.5 text-[10px] font-display font-bold rounded-sm"
                    style={{ backgroundColor: classMeta.plateColor, color: classMeta.badgeTextColor }}
                  >
                    {classMeta.shortName} P{hud.classPosition}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block">
                    {hud.phase === 'qualifying' ? 'QUALI HOTLAP' : 'LAP'}
                  </span>
                  <span className="font-display font-bold text-sm text-white tabular-nums">
                    {hud.lap} / {hud.totalLaps}
                  </span>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-white/10 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Ahead</span>
                  <span className="font-telemetry text-amber-300">
                    {hud.intervalAhead !== null ? `+${hud.intervalAhead.toFixed(2)}s` : 'Leader'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Behind</span>
                  <span className="font-telemetry text-slate-200">
                    {hud.intervalBehind !== null ? `-${hud.intervalBehind.toFixed(2)}s` : '--'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Lap</span>
                  <span className="font-telemetry text-white">{formatLapTime(hud.currentLapTime)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Best</span>
                  <span className="font-telemetry text-emerald-400">{formatLapTime(hud.bestLapTime)}</span>
                </div>
              </div>
            </>
          )}

          {/* Contextual Racecraft / Rulebook Alerts */}
          {(hud.inSlipstream || hud.penaltyTimeRemaining > 0 || hud.warningCount > 0 || hud.pitStopRemaining > 0) && (
            <div className="mt-2 pt-2 border-t border-white/10 space-y-1 text-[11px] font-semibold">
              {hud.inSlipstream && (
                <div className="text-sky-300">SLIPSTREAM TOW ACTIVE</div>
              )}
              {hud.pitStopRemaining > 0 && (
                <div className="text-amber-300">
                  {hud.pitActiveTask === 'fuel' ? 'REFUELING' : 'TYRE SERVICE'} {remainingTotal.toFixed(1)}s
                </div>
              )}
              {hud.penaltyTimeRemaining > 0 && hud.pitStopRemaining <= 0 && (
                <div className="text-red-400">
                  SLOWDOWN PENALTY {hud.penaltyTimeRemaining.toFixed(1)}s
                </div>
              )}
              {hud.warningCount > 0 && hud.penaltyTimeRemaining <= 0 && (
                <div className="text-amber-300">
                  Track Limits Warning ({hud.warningCount})
                </div>
              )}
            </div>
          )}
        </div>

        {/* Center Countdown Lights Banner (only during start lights) */}
        {hud.countdown > 0 && (
          <div className="bg-[#0b0e13]/95 border border-white/15 rounded-md px-6 py-3 text-center shadow-xl">
            <div className="text-xs text-slate-400 uppercase tracking-widest">Formation Ready</div>
            <div className="text-3xl font-display font-extrabold text-red-500 tabular-nums mt-0.5">
              {Math.ceil(hud.countdown)}
            </div>
          </div>
        )}

        {/* Top-Right Cluster: Compact Minimap & Utility Icon Buttons */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-1.5 pointer-events-auto">
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onCycleCamera();
              }}
              aria-label="Switch Camera Angle"
              title="Camera [C]"
              className="p-2 rounded bg-[#0b0e13]/90 border border-white/15 text-slate-200 hover:text-white cursor-pointer"
            >
              <Camera className="w-4 h-4" />
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
              className="p-2 rounded bg-[#0b0e13]/90 border border-white/15 text-slate-200 hover:text-white cursor-pointer"
            >
              {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
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
              className="p-2 rounded bg-[#0b0e13]/90 border border-white/15 text-slate-200 hover:text-white cursor-pointer"
            >
              <Pause className="w-4 h-4" />
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
              className="p-2 rounded bg-[#0b0e13]/90 border border-sky-500/30 hover:border-sky-400 text-sky-400 hover:text-sky-300 cursor-pointer flex items-center justify-center transition-colors"
            >
              <Home className="w-4 h-4" />
            </button>
          </div>

          {/* Track Minimap */}
          <div className="bg-[#0b0e13]/88 border border-white/12 rounded-md p-2">
            <svg viewBox="0 0 140 110" className="w-36 h-28" aria-label="Track Minimap">
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
        </div>
      </div>

      {/* BOTTOM CORNERS */}
      <div className="flex items-end justify-between gap-4">
        {/* Bottom-Left: On-Track Stationary Pit Stop Prompt */}
        <div>
          {showOnTrackPitPrompt && (
            <div
              data-testid="on-track-pit-prompt"
              className="bg-[#0b0e13]/95 border border-amber-500/50 rounded-md p-3 pointer-events-auto space-y-2.5 w-72 shadow-xl"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-display font-bold text-amber-300 uppercase tracking-wide">
                  On-Track Pit Crew
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
                        : 'Refueling to 100%...'}
                    </span>
                    {hud.pitQueue.length > 0 && (
                      <span className="text-amber-300">
                        + {hud.pitQueue[0] === 'tyres' ? 'Tyres' : 'Fuel'} queued
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
                    className={`py-1 rounded text-[10px] font-bold uppercase border cursor-pointer disabled:opacity-50 ${
                      hud.pitStrategy.nextCompound === cmp
                        ? 'bg-red-600 border-red-400 text-white'
                        : 'bg-[#151a23] border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    {cmp}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  tabIndex={-1}
                  disabled={hud.pitActiveTask === 'tyres' || hud.pitQueue.includes('tyres')}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onRequestPitStop('tyres', hud.pitStrategy.nextCompound);
                  }}
                  className="py-2 px-2 rounded text-[11px] font-bold border border-amber-400/60 bg-amber-600/25 hover:bg-amber-600/40 text-amber-200 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Change Tyres (2.0s)</span>
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  disabled={hud.pitActiveTask === 'fuel' || hud.pitQueue.includes('fuel')}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onRequestPitStop('fuel');
                  }}
                  className="py-2 px-2 rounded text-[11px] font-bold border border-sky-400/60 bg-sky-600/25 hover:bg-sky-600/40 text-sky-200 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <Fuel className="w-3.5 h-3.5" />
                  <span>Refuel (4.0s)</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom-Right Cluster: Speed, Gear, Tire/Fuel & Class Special */}
        <div className="bg-[#0b0e13]/90 border border-white/12 rounded-md px-4 py-3 min-w-[310px] shadow-lg">
          <div className="flex items-end justify-between gap-5">
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                KM/H
              </span>
              <span
                data-testid="hud-speed"
                className="text-4xl font-display font-extrabold text-white tabular-nums leading-none"
              >
                {hud.speedKmh}
              </span>
            </div>

            <div className="text-center">
              <span className="text-[10px] text-slate-400 uppercase block">Gear</span>
              <span className="text-2xl font-display font-bold text-amber-400 tabular-nums leading-none">
                {hud.gear === -1 ? 'R' : hud.gear}
              </span>
            </div>

            <div className="text-right space-y-1 text-xs">
              <div className="flex items-center justify-end gap-2">
                <span className="text-slate-400">Tire ({hud.compound.toUpperCase()})</span>
                <span
                  className={`font-telemetry font-bold ${
                    hud.tireWear < 30 ? 'text-red-400' : 'text-emerald-400'
                  }`}
                >
                  {hud.tireWear}%
                </span>
              </div>
              <div className="flex items-center justify-end gap-2">
                <span className="text-slate-400">Temp / Fuel</span>
                <span className="font-telemetry text-slate-200">
                  {hud.tireTemp}°C · {hud.fuel}%{' '}
                  <span
                    className={
                      hud.fuelLapsRemaining !== undefined && hud.fuelLapsRemaining < 2
                        ? 'text-red-400 font-bold'
                        : 'text-amber-300 font-semibold'
                    }
                  >
                    ({hud.fuelLapsRemaining ?? Math.round(hud.fuel * 0.15)} Laps)
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* RPM Bar */}
          <div className="mt-2.5 h-1.5 rounded bg-[#1a202c] overflow-hidden">
            <div
              className="h-full transition-all duration-75"
              style={{
                width: `${Math.round(hud.rpmNormalized * 100)}%`,
                backgroundColor: hud.rpmNormalized > 0.85 ? '#ef4444' : '#38bdf8',
              }}
            />
          </div>

          {/* Class Special & Track Surface Footer */}
          <div className="mt-2 flex items-center justify-between gap-4 text-[11px] text-slate-400 whitespace-nowrap">
            <span>
              {carSpecial.specialType === 'active-aero' ? (
                <span>
                  Active Aero:{' '}
                  <strong className={hud.specialActive ? 'text-emerald-400' : 'text-slate-200'}>
                    {hud.specialActive ? 'STRAIGHT (LOW DRAG +12%)' : 'CORNER (HIGH DOWNFORCE)'}
                  </strong>{' '}
                  <span className="text-[10px] text-slate-500">[Shift/E/X]</span>
                </span>
              ) : carSpecial.specialType === 'attack-mode' ? (
                <span>
                  Attack Mode AWD:{' '}
                  <strong className={hud.specialActive ? 'text-cyan-300' : 'text-slate-200'}>
                    {hud.specialActive
                      ? `ACTIVE ${hud.attackModeTimer?.toFixed(1) ?? '15.0'}s (+15% PWR)`
                      : `${hud.attackModeUsesRemaining ?? 2}/2 USES READY`}
                  </strong>{' '}
                  <span className="text-[10px] text-slate-500">[Shift/E/X]</span>
                </span>
              ) : carSpecial.specialType === 'v10-overboost' ? (
                <span>
                  V10 Overboost:{' '}
                  <strong className={hud.specialActive ? 'text-red-400 font-bold' : 'text-slate-200'}>
                    {hud.specialActive
                      ? `ON ${hud.specialCharge}% (+8% PWR, +35% FUEL)`
                      : `${hud.specialCharge}% READY`}
                  </strong>{' '}
                  <span className="text-[10px] text-slate-500">[Shift/E/X]</span>
                </span>
              ) : carSpecial.specialType === 'rich-fuel-overboost' ? (
                <span>
                  Rich Fuel Overboost:{' '}
                  <strong className={hud.specialActive ? 'text-amber-400 font-bold' : 'text-slate-200'}>
                    {hud.specialActive
                      ? `ON ${hud.specialCharge}% (+8% PWR, +35% FUEL)`
                      : `${hud.specialCharge}% READY`}
                  </strong>{' '}
                  <span className="text-[10px] text-slate-500">[Shift/E/X]</span>
                </span>
              ) : carSpecial.specialType === 'high-beam-flash' ? (
                <span>
                  High Beams:{' '}
                  <strong className={hud.specialActive ? 'text-amber-300' : 'text-slate-200'}>
                    {hud.specialActive ? 'FLASHING TRAFFIC' : 'OFF (READY)'}
                  </strong>{' '}
                  <span className="text-[10px] text-slate-500">[Shift/E/X]</span>
                </span>
              ) : (
                <span>
                  {carSpecial.specialLabel}:{' '}
                  <strong className={hud.specialActive ? 'text-emerald-400' : 'text-slate-200'}>
                    {hud.specialActive ? `ON ${hud.specialCharge}% (+15% ACCEL)` : `${hud.specialCharge}% READY`}
                  </strong>{' '}
                  <span className="text-[10px] text-slate-500">[Shift/E/X]</span>
                </span>
              )}
            </span>
            {hud.trackWetness > 0.1 ? (
              <span className="text-sky-300 font-semibold">
                Wetness {Math.round(hud.trackWetness * 100)}%
              </span>
            ) : hud.aeroDamage > 4 ? (
              <span className="text-amber-300 font-semibold">Aero {hud.aeroDamage}% dmg</span>
            ) : (
              <span data-testid="hud-camera-label">
                Cam:{' '}
                {hud.cameraMode === 'hood'
                  ? 'Hood'
                  : hud.cameraMode === 'orbit'
                  ? 'Chase'
                  : 'Isometric'}{' '}
                · [C]
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
