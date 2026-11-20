import { CAR_CLASSES, getCarById } from '../game/cars';
import { formatLapTime } from '../game/physics';
import { HudSnapshot } from '../game/types';

interface ResultsModalProps {
  snapshot: HudSnapshot;
  trackName: string;
  onRaceAgain: () => void;
  onReturnToTitle: () => void;
}

export function ResultsModal({
  snapshot,
  trackName,
  onRaceAgain,
  onReturnToTitle,
}: ResultsModalProps) {
  const isAiRace = snapshot.sessionMode === 'ai-race';
  const focusRow = isAiRace
    ? snapshot.standings[0]
    : snapshot.standings.find((s) => s.isPlayer) ?? snapshot.standings[0];
  const winnerCar = focusRow ? getCarById(focusRow.carId) : null;

  return (
    <div
      data-testid="results-modal"
      role="dialog"
      aria-label="Race Classification"
      className="fixed inset-0 z-30 bg-black/80 flex items-center justify-center p-2 sm:p-4 safe-area-inset"
    >
      <div className="w-full max-w-3xl max-h-[92dvh] bg-[#11151d] border border-white/15 rounded-lg flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-4 py-3.5 sm:px-6 sm:py-5 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <div className="text-xs text-slate-400">
              {trackName} · {isAiRace ? 'AI Race Classification' : 'Final Classification'}
            </div>
            <h2 className="text-lg sm:text-2xl font-display font-extrabold text-white mt-0.5 leading-tight">
              {isAiRace && focusRow
                ? `Winner: ${focusRow.name} · ${winnerCar?.name ?? ''}`
                : `Finished P${focusRow.position} Overall · P${focusRow.classPosition} in Class`}
            </h2>
          </div>

          <div className="flex items-center gap-6 text-right shrink-0">
            <div>
              <span className="text-[11px] text-slate-400 block">
                {isAiRace ? 'Winner Best Lap' : 'Best Lap'}
              </span>
              <span className="font-telemetry text-sm font-bold text-emerald-400">
                {formatLapTime(focusRow.bestLapTime)}
              </span>
            </div>
          </div>
        </div>

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
                <th className="py-2 font-semibold text-right">Pits</th>
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
                      {row.personality && (
                        <span className="ml-1.5 text-[10px] text-slate-500">({row.personality})</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 truncate max-w-[170px]">{car.name}</td>
                    <td className="py-2.5 pr-3 text-right font-telemetry">
                      {formatLapTime(row.bestLapTime)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-telemetry">
                      {row.position === 1 ? 'Winner' : `+${row.intervalToLeader.toFixed(2)}s`}
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
          <a
            href="/"
            className="px-4 py-2.5 rounded bg-transparent hover:bg-sky-500/10 border border-sky-500/30 hover:border-sky-400 text-xs font-semibold text-sky-400 cursor-pointer flex items-center gap-1.5 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            Back to Hub
          </a>
          <button
            type="button"
            onClick={onReturnToTitle}
            className="px-4 py-2.5 rounded bg-[#18202c] hover:bg-[#222c3d] border border-white/10 text-xs font-semibold text-slate-200 cursor-pointer"
          >
            Return to Paddock
          </button>
          <button
            type="button"
            data-start="true"
            onClick={onRaceAgain}
            className="px-6 py-2.5 rounded bg-red-600 hover:bg-red-500 text-xs font-display font-bold text-white cursor-pointer"
          >
            Race Again
          </button>
        </div>
      </div>
    </div>
  );
}
