import { Keyboard, X } from 'lucide-react';
import { getCarById, resolveCarSpecial } from '../game/cars';
import { formatKeyLabel, getGameSettings } from '../game/settings';

const BRIEFING_STORAGE_KEY = 'apex_miniature_controls_briefing_dismissed_v1';

export function hasDismissedBriefing(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(BRIEFING_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markBriefingDismissed(): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(BRIEFING_STORAGE_KEY, '1');
    }
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

interface ControlsBriefingCardProps {
  carId: string;
  onDismiss: () => void;
}

export function ControlsBriefingCard({ carId, onDismiss }: ControlsBriefingCardProps) {
  const settings = getGameSettings();
  const kb = settings.keybinds;
  const car = getCarById(carId);
  const special = resolveCarSpecial(car);

  const items: Array<{ keys: string; label: string }> = [
    {
      keys: `${formatKeyLabel(kb.throttle)} / ${formatKeyLabel(kb.brake)}`,
      label: 'Throttle & Brake',
    },
    {
      keys: `${formatKeyLabel(kb.steerLeft)} / ${formatKeyLabel(kb.steerRight)}`,
      label: 'Steer',
    },
    ...(special.specialType !== 'none'
      ? [{ keys: formatKeyLabel(kb.special), label: special.specialLabel }]
      : []),
    {
      keys: formatKeyLabel(kb.camera),
      label: 'Cycle Camera',
    },
    {
      keys: formatKeyLabel(kb.flashback),
      label: 'Flashback (-5.5s)',
    },
    {
      keys: formatKeyLabel(kb.pause),
      label: 'Pause / Pit Menu',
    },
  ];

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 w-[min(92vw,540px)] pointer-events-auto select-none">
      <div className="bg-slate-950/90 backdrop-blur-md border border-slate-700/80 rounded-xl px-4 py-3 shadow-2xl">
        <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-800">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-white">
            <Keyboard className="w-4 h-4 text-sky-400" />
            <span>Grid Controls Briefing</span>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-200 flex items-center gap-1 cursor-pointer"
          >
            <span>Got it</span>
            <X className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {items.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between gap-2 bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1.5"
            >
              <span className="text-[11px] text-slate-300 font-medium truncate">
                {item.label}
              </span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] font-bold text-sky-300 shrink-0">
                {item.keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
