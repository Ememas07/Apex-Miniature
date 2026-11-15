interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onReturnToTitle: () => void;
}

export function PauseModal({ onResume, onRestart, onReturnToTitle }: PauseModalProps) {
  return (
    <div
      data-testid="pause-modal"
      role="dialog"
      aria-label="Race Paused"
      className="fixed inset-0 z-30 bg-black/70 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-sm bg-[#11151d] border border-white/15 rounded-lg p-6 shadow-2xl space-y-5">
        <div>
          <h2 className="text-xl font-display font-bold text-white">Session Paused</h2>
          <p className="text-xs text-slate-400 mt-1">
            Simulation & engine audio suspended. Press Esc or P to resume.
          </p>
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-2.5 rounded bg-red-600 hover:bg-red-500 text-sm font-display font-bold text-white cursor-pointer"
          >
            Resume Session
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full py-2.5 rounded bg-[#18202c] hover:bg-[#222c3d] border border-white/10 text-sm font-semibold text-slate-200 cursor-pointer"
          >
            Restart Session
          </button>
          <button
            type="button"
            onClick={onReturnToTitle}
            className="w-full py-2.5 rounded bg-transparent hover:bg-white/5 border border-white/10 text-sm font-medium text-slate-400 cursor-pointer"
          >
            Return to Paddock
          </button>
        </div>
      </div>
    </div>
  );
}
