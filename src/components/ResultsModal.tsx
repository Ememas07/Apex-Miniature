import { useState } from 'react';
import { Award, ChevronRight, Download, Film, Trophy } from 'lucide-react';
import { CAR_CLASSES, getCarById } from '../game/cars';
import { ActiveChampionshipState } from '../game/championship';
import { formatLapTime } from '../game/physics';
import { computeTrackClassMedalTargets, evaluateMedal } from '../game/records';
import { telemetryRecorder } from '../game/telemetryRecorder';
import { getTrackById } from '../game/tracks';
import { HudSnapshot, MedalTier, RaceConfig } from '../game/types';

interface ResultsModalProps {
  snapshot: HudSnapshot;
  trackName: string;
  raceConfig?: RaceConfig;
  activeChampionship?: ActiveChampionshipState | null;
  championshipPointsEarned?: number | null;
  careerReward?: { creditsEarned: number; repEarned: number } | null;
  scenarioResult?: { passed: boolean; medal: MedalTier | null; summary: string } | null;
  onNextChampionshipRound?: () => void;
  onWatchReplay?: () => void;
  onRaceAgain: () => void;
  onReturnToTitle: () => void;
}

export function ResultsModal({
  snapshot,
  trackName,
  raceConfig,
  activeChampionship,
  championshipPointsEarned,
  careerReward,
  scenarioResult,
  onNextChampionshipRound,
  onWatchReplay,
  onRaceAgain,
  onReturnToTitle,
}: ResultsModalProps) {
  const [bcExportLabel, setBcExportLabel] = useState<string | null>(null);
  const recordedCleanLaps = telemetryRecorder.getRecordedLaps().filter((l) => l.isClean);
  const isAiRace = snapshot.sessionMode === 'ai-race';
  const isElimination = snapshot.sessionMode === 'elimination';
  const focusRow = isAiRace
    ? snapshot.standings[0]
    : snapshot.standings.find((s) => s.isPlayer) ?? snapshot.standings[0];
  const winnerCar = focusRow ? getCarById(focusRow.carId) : null;

  // Theoretical best lap from personal best sectors
  const bestS = snapshot.bestSectorTimes;
  const theoreticalBest =
    bestS && bestS[0] != null && bestS[1] != null && bestS[2] != null
      ? bestS[0] + bestS[1] + bestS[2]
      : null;

  // Time Trial / Daily Challenge medal evaluation
  const trackSpec = raceConfig?.customTrack || (raceConfig ? getTrackById(raceConfig.trackId) : null);
  const hotlapMedal =
    !scenarioResult &&
    trackSpec &&
    focusRow &&
    focusRow.bestLapTime &&
    (snapshot.sessionMode === 'time-trial' || snapshot.sessionMode === 'practice')
      ? evaluateMedal(
          focusRow.bestLapTime,
          computeTrackClassMedalTargets(trackSpec, focusRow.classId),
        )
      : null;

  const canAdvanceChampionship =
    Boolean(raceConfig?.championshipId) &&
    Boolean(activeChampionship) &&
    !activeChampionship?.completed &&
    Boolean(onNextChampionshipRound);

  return (
    <div
      data-testid="results-modal"
      role="dialog"
      aria-label="Race Classification"
      className="fixed inset-0 z-30 bg-black/80 flex items-center justify-center safe-pad-modal"
    >
      <div className="w-full max-w-3xl max-h-[92dvh] bg-[#11151d] border border-white/15 rounded-lg flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-4 py-3.5 sm:px-6 sm:py-5 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <div className="text-xs text-slate-400">
              {trackName} ·{' '}
              {isAiRace
                ? 'AI Race Classification'
                : isElimination
                ? 'Elimination Knockout Results'
                : snapshot.championshipRoundLabel
                ? snapshot.championshipRoundLabel
                : snapshot.scenarioTitle
                ? snapshot.scenarioTitle
                : 'Final Classification'}
            </div>
            <h2 className="text-lg sm:text-2xl font-display font-extrabold text-white mt-0.5 leading-tight">
              {isAiRace && focusRow
                ? `Winner: ${focusRow.name} · ${winnerCar?.name ?? ''}`
                : focusRow
                ? `Finished P${focusRow.position} Overall · P${focusRow.classPosition} in Class`
                : 'Session Complete'}
            </h2>
          </div>

          <div className="flex items-center gap-5 text-right shrink-0">
            {hotlapMedal && (
              <div>
                <span className="text-[11px] text-slate-400 block">Pace Medal</span>
                <span className="font-display text-sm font-extrabold uppercase text-yellow-300">
                  {hotlapMedal}
                </span>
              </div>
            )}
            <div>
              <span className="text-[11px] text-slate-400 block">
                {isAiRace ? 'Winner Best Lap' : 'Best Lap'}
              </span>
              <span className="font-telemetry text-sm font-bold text-emerald-400">
                {formatLapTime(focusRow?.bestLapTime ?? snapshot.bestLapTime)}
              </span>
            </div>
          </div>
        </div>

        {/* Scenario / Championship / Career Highlights Strip */}
        {(scenarioResult || championshipPointsEarned != null || (careerReward && (careerReward.creditsEarned > 0 || careerReward.repEarned > 0))) && (
          <div className="px-4 py-2.5 sm:px-6 bg-[#141b27] border-b border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
            {scenarioResult && (
              <div className="flex items-center gap-2">
                <Award className={`w-4 h-4 ${scenarioResult.passed ? 'text-yellow-300' : 'text-red-400'}`} />
                <span className={scenarioResult.passed ? 'text-emerald-300 font-bold' : 'text-red-300 font-bold'}>
                  {scenarioResult.passed
                    ? `${scenarioResult.medal ? scenarioResult.medal.toUpperCase() : 'PASSED'} — ${scenarioResult.summary}`
                    : `FAILED — ${scenarioResult.summary}`}
                </span>
              </div>
            )}
            {championshipPointsEarned != null && (
              <div className="flex items-center gap-1.5 text-amber-300 font-display font-bold">
                <Trophy className="w-4 h-4" />
                <span>+{championshipPointsEarned} Championship Pts</span>
              </div>
            )}
            {careerReward && (careerReward.creditsEarned > 0 || careerReward.repEarned > 0) && (
              <div className="flex items-center gap-3 font-telemetry text-slate-200 ml-auto">
                <span className="text-amber-300 font-bold">+{careerReward.creditsEarned} CR</span>
                <span className="text-sky-300 font-bold">+{careerReward.repEarned} REP</span>
              </div>
            )}
          </div>
        )}

        {/* Post-Race Telemetry & Analytics Strip */}
        {!isAiRace && (
          <div className="px-4 py-2.5 sm:px-6 bg-[#0e131c] border-b border-white/10 grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
            <div className="bg-[#131924] rounded px-2 py-1.5">
              <div className="text-[10px] text-slate-400 uppercase">Top Speed</div>
              <div className="font-telemetry text-xs font-bold text-white">
                {snapshot.topSpeedKmh ?? snapshot.speedKmh} km/h
              </div>
            </div>
            <div className="bg-[#131924] rounded px-2 py-1.5">
              <div className="text-[10px] text-slate-400 uppercase">Overtakes</div>
              <div className="font-telemetry text-xs font-bold text-emerald-400">
                {snapshot.overtakesCount ?? 0}
              </div>
            </div>
            <div className="bg-[#131924] rounded px-2 py-1.5">
              <div className="text-[10px] text-slate-400 uppercase">Clean Laps</div>
              <div className="font-telemetry text-xs font-bold text-sky-300">
                {snapshot.cleanLapsCount ?? 0}
              </div>
            </div>
            <div className="bg-[#131924] rounded px-2 py-1.5">
              <div className="text-[10px] text-slate-400 uppercase">Incidents</div>
              <div className="font-telemetry text-xs font-bold text-amber-300">
                {snapshot.incidentsCount ?? 0}
              </div>
            </div>
            <div className="bg-[#131924] rounded px-2 py-1.5 col-span-2 sm:col-span-1">
              <div className="text-[10px] text-slate-400 uppercase">Theoretical</div>
              <div className="font-telemetry text-xs font-bold text-fuchsia-300">
                {theoreticalBest ? formatLapTime(theoreticalBest) : '--:--.---'}
              </div>
            </div>
          </div>
        )}

        {/* Lap-by-Lap Position Progression Chart */}
        {!isAiRace && snapshot.lapPositionHistory && snapshot.lapPositionHistory.length >= 2 && (
          <div className="px-4 py-2.5 sm:px-6 bg-[#0b1018] border-b border-white/10">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">
              <span>Lap-by-Lap Position Chart</span>
              <span className="font-mono text-sky-300">
                P{snapshot.lapPositionHistory[0].position} &rarr; P
                {snapshot.lapPositionHistory[snapshot.lapPositionHistory.length - 1].position}
              </span>
            </div>
            <svg viewBox="0 0 320 56" className="w-full h-14 bg-[#0f1623] rounded border border-white/5">
              {[1, Math.ceil(snapshot.totalCars / 2), Math.max(2, snapshot.totalCars)].map((posTick) => {
                const y = 8 + ((posTick - 1) / Math.max(1, snapshot.totalCars - 1)) * 40;
                return (
                  <g key={posTick}>
                    <line x1="22" y1={y} x2="312" y2={y} stroke="#1e293b" strokeWidth="0.7" />
                    <text x="4" y={y + 3} fill="#64748b" fontSize="7" fontFamily="monospace">
                      P{posTick}
                    </text>
                  </g>
                );
              })}
              <polyline
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2"
                strokeLinejoin="round"
                points={snapshot.lapPositionHistory
                  .map((pt, idx) => {
                    const x = 26 + (idx / Math.max(1, snapshot.lapPositionHistory!.length - 1)) * 282;
                    const y = 8 + ((pt.position - 1) / Math.max(1, snapshot.totalCars - 1)) * 40;
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                  })
                  .join(' ')}
              />
              {snapshot.lapPositionHistory.map((pt, idx) => {
                const x = 26 + (idx / Math.max(1, snapshot.lapPositionHistory!.length - 1)) * 282;
                const y = 8 + ((pt.position - 1) / Math.max(1, snapshot.totalCars - 1)) * 40;
                return <circle key={pt.lap} cx={x} cy={y} r="2.6" fill="#f8fafc" stroke="#0284c7" strokeWidth="1" />;
              })}
            </svg>
          </div>
        )}

        {/* Classification Table */}
        <div className="flex-1 overflow-auto custom-scroll p-3 sm:p-6">
          <table className="w-full min-w-[540px] text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-slate-400">
                <th className="py-2 pr-3 font-semibold">Pos</th>
                <th className="py-2 pr-3 font-semibold">Class</th>
                <th className="py-2 pr-3 font-semibold">Driver</th>
                <th className="py-2 pr-3 font-semibold">Car</th>
                <th className="py-2 pr-3 font-semibold text-right">Best Lap</th>
                <th className="py-2 pr-3 font-semibold text-right">Gap</th>
                <th className="py-2 font-semibold text-right">Stops</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {snapshot.standings.map((row) => {
                const cls = CAR_CLASSES[row.classId];
                const car = getCarById(row.carId);
                const highlight = isAiRace ? row.position === 1 : row.isPlayer;
                return (
                  <tr
                    key={row.id}
                    className={
                      highlight
                        ? isAiRace
                          ? 'bg-emerald-950/35 text-white font-semibold'
                          : 'bg-red-950/35 text-white font-semibold'
                        : row.eliminated
                        ? 'text-slate-500'
                        : 'text-slate-300'
                    }
                  >
                    <td className="py-2.5 pr-3 font-telemetry">{row.position}</td>
                    <td className="py-2.5 pr-3">
                      <span
                        className="px-1.5 py-0.5 text-[10px] font-display font-bold rounded-sm"
                        style={{ backgroundColor: cls.plateColor, color: cls.badgeTextColor }}
                      >
                        {cls.shortName}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span>{row.name}</span>
                      {row.nationality && (
                        <span className="ml-1.5 text-[9px] font-telemetry text-slate-400">
                          [{row.nationality}]
                        </span>
                      )}
                      {row.eliminated && (
                        <span className="ml-1.5 px-1 py-0.5 rounded bg-orange-950 border border-orange-500/40 text-[9px] font-bold text-orange-300">
                          OUT
                        </span>
                      )}
                      {row.personality && (
                        <span className="ml-1.5 text-[10px] text-slate-500">({row.personality})</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 truncate max-w-[170px]">{car.name}</td>
                    <td className="py-2.5 pr-3 text-right font-telemetry">
                      {formatLapTime(row.bestLapTime)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-telemetry">
                      {row.eliminated
                        ? 'KO'
                        : row.position === 1
                        ? 'Winner'
                        : `+${row.intervalToLeader.toFixed(2)}s`}
                    </td>
                    <td className="py-2.5 text-right font-telemetry">{row.pitStops}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 border-t border-white/10 flex flex-wrap items-center justify-end gap-2 sm:gap-3 bg-[#0d1118]">
          <button
            type="button"
            onClick={() => {
              if (recordedCleanLaps.length > 0) {
                const res = telemetryRecorder.downloadDatasetBundle({ cleanOnly: true });
                if (res.lapCount > 0) {
                  setBcExportLabel(`Exported ${res.lapCount} clean lap(s)`);
                }
              } else {
                const demo = telemetryRecorder.exportManual(true);
                setBcExportLabel(
                  demo ? `Exported ${demo.samples.length} frames` : 'No telemetry recorded',
                );
              }
            }}
            className="mr-auto px-3 py-2 rounded bg-[#101c2c] hover:bg-[#172840] border border-sky-500/35 text-xs font-semibold text-sky-300 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            title="Export human laps/telemetry as JSONL for scripts/trainPPO.py --bc-dataset (F8)"
          >
            <Download className="w-3.5 h-3.5" />
            {bcExportLabel ??
              (recordedCleanLaps.length > 0
                ? `Export ${recordedCleanLaps.length} BC Lap(s)`
                : 'Export Telemetry (F8)')}
          </button>
          {onWatchReplay && snapshot.replayAvailable && (
            <button
              type="button"
              onClick={onWatchReplay}
              className="px-4 py-2.5 rounded bg-rose-600/25 hover:bg-rose-600/40 border border-rose-500/45 text-xs font-display font-bold text-rose-200 cursor-pointer flex items-center gap-1.5"
            >
              <Film className="w-3.5 h-3.5" />
              Watch Replay
            </button>
          )}
          <button
            type="button"
            onClick={onReturnToTitle}
            className="px-4 py-2.5 rounded bg-[#18202c] hover:bg-[#222c3d] border border-white/10 text-xs font-semibold text-slate-200 cursor-pointer"
          >
            Return to Paddock
          </button>
          <button
            type="button"
            onClick={onRaceAgain}
            className="px-5 py-2.5 rounded bg-[#232c3d] hover:bg-[#2d384d] border border-white/15 text-xs font-display font-bold text-white cursor-pointer"
          >
            {canAdvanceChampionship ? 'Retry Round' : 'Race Again'}
          </button>
          {canAdvanceChampionship && onNextChampionshipRound && activeChampionship && (
            <button
              type="button"
              data-start="true"
              data-testid="btn-next-champ-round"
              onClick={onNextChampionshipRound}
              className="px-6 py-2.5 rounded bg-red-600 hover:bg-red-500 text-xs font-display font-bold text-white cursor-pointer flex items-center gap-1.5"
            >
              <span>
                Next: R{activeChampionship.currentRoundIndex + 1} · {activeChampionship.currentStage.toUpperCase()}
              </span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
