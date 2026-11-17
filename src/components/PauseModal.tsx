import { useState } from 'react';
import { Volume2, VolumeX, ArrowLeft } from 'lucide-react';

interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onReturnToTitle: () => void;
  masterVolume?: number;
  onVolumeChange?: (vol: number) => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
}

export function PauseModal({
  onResume,
  onRestart,
  onReturnToTitle,
  masterVolume: propVolume,
  onVolumeChange,
  isMuted: propMuted,
  onToggleMute,
}: PauseModalProps) {
  const [volume, setVolume] = useState<number>(() => {
    if (propVolume !== undefined) return propVolume;
    try {
      const saved = localStorage.getItem('apex_audio_volume');
      return saved !== null ? Math.max(0, Math.min(1, parseFloat(saved))) : 0.8;
    } catch {
      return 0.8;
    }
  });

  const [muted, setMuted] = useState<boolean>(() => {
    if (propMuted !== undefined) return propMuted;
    try {
      return localStorage.getItem('apex_audio_muted') === 'true';
    } catch {
      return false;
    }
  });

  const effectiveMuted = propMuted !== undefined ? propMuted : muted;
  const effectiveVolume = propVolume !== undefined ? propVolume : volume;

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    try {
      localStorage.setItem('apex_audio_volume', String(newVol));
    } catch {}
    window.dispatchEvent(new CustomEvent('apex-audio-volume', { detail: { volume: newVol } }));
    onVolumeChange?.(newVol);
  };

  const handleToggleMute = () => {
    const nextMute = !effectiveMuted;
    setMuted(nextMute);
    try {
      localStorage.setItem('apex_audio_muted', String(nextMute));
    } catch {}
    window.dispatchEvent(new CustomEvent('apex-audio-mute', { detail: { muted: nextMute } }));
    onToggleMute?.();
  };

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
            Simulation suspended. Press Esc or P to resume.
          </p>
        </div>

        {/* Master Volume & Mute Control */}
        <div className="p-3.5 rounded-lg bg-[#0c1017] border border-white/10 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              {effectiveMuted ? (
                <VolumeX className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              )}
              Master Volume
            </span>
            <span className="font-mono text-slate-400">
              {effectiveMuted ? 'MUTED' : `${Math.round(effectiveVolume * 100)}%`}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={effectiveMuted ? 0 : effectiveVolume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              aria-label="Master Volume Slider"
              className="flex-1 accent-red-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <button
              type="button"
              onClick={handleToggleMute}
              className={`p-1.5 rounded border text-xs font-semibold cursor-pointer transition-colors ${
                effectiveMuted
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
              title={effectiveMuted ? 'Unmute Audio' : 'Mute Audio'}
            >
              {effectiveMuted ? (
                <VolumeX className="w-3.5 h-3.5" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
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
            className="w-full py-2.5 rounded bg-transparent hover:bg-white/5 border border-white/10 text-sm font-medium text-slate-300 flex items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Menu (Paddock)
          </button>
          <a
            href="/"
            className="w-full py-2.5 rounded bg-transparent hover:bg-sky-500/10 border border-sky-500/30 hover:border-sky-400 text-sm font-medium text-sky-400 flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            Return to Hub
          </a>
        </div>
      </div>
    </div>
  );
}
