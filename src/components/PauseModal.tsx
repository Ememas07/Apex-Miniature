import { useEffect, useState } from 'react';
import { Volume2, VolumeX, ArrowLeft, Settings, Download, Camera, Film, RotateCcw } from 'lucide-react';
import { formatLapTime } from '../game/physics';
import { RecordedBcLap, telemetryRecorder } from '../game/telemetryRecorder';

interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onReturnToTitle: () => void;
  onOpenSettings?: () => void;
  onOpenPhotoMode?: () => void;
  onOpenReplay?: () => void;
  onTriggerFlashback?: () => void;
  replayAvailable?: boolean;
  flashbackAvailable?: boolean;
  masterVolume?: number;
  onVolumeChange?: (vol: number) => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
}

export function PauseModal({
  onResume,
  onRestart,
  onReturnToTitle,
  onOpenSettings,
  onOpenPhotoMode,
  onOpenReplay,
  onTriggerFlashback,
  replayAvailable = false,
  flashbackAvailable = false,
  masterVolume: propVolume,
  onVolumeChange,
  isMuted: propMuted,
  onToggleMute,
}: PauseModalProps) {
  const [recordedLaps, setRecordedLaps] = useState<RecordedBcLap[]>(() =>
    telemetryRecorder.getRecordedLaps(),
  );
  const [bcExportMsg, setBcExportMsg] = useState<string | null>(null);

  useEffect(() => {
    setRecordedLaps(telemetryRecorder.getRecordedLaps());
    return telemetryRecorder.subscribe(() => {
      setRecordedLaps(telemetryRecorder.getRecordedLaps());
    });
  }, []);

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

  const selectedCount = recordedLaps.filter((l) => l.included).length;

  return (
    <div
      data-testid="pause-modal"
      role="dialog"
      aria-label="Race Paused"
      className="fixed inset-0 z-30 bg-black/70 flex items-center justify-center safe-pad-modal"
    >
      <div className="w-full max-w-sm max-h-[92dvh] overflow-y-auto custom-scroll bg-[#11151d] border border-white/15 rounded-lg p-4 sm:p-6 shadow-2xl space-y-4 sm:space-y-5">
        <div>
          <h2 className="text-lg sm:text-xl font-display font-bold text-white">Session Paused</h2>
          <p className="text-xs text-slate-400 mt-1">
            Simulation suspended. Press Esc, P, or Start to resume.
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
            <span className="font-mono text-slate-400 tabular-nums">
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

        {/* Behavioral Cloning Dataset Export (visible once laps are recorded) */}
        {recordedLaps.length > 0 && (
          <div
            data-testid="bc-export-panel"
            className="p-3 rounded-lg bg-[#0c121b] border border-sky-500/25 space-y-2"
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-sky-300">
                AI Behavioral Cloning ({recordedLaps.length} laps)
              </span>
              <button
                type="button"
                onClick={() => telemetryRecorder.selectCleanLapsOnly()}
                className="text-[10px] font-semibold text-slate-300 hover:text-white underline cursor-pointer whitespace-nowrap"
              >
                Clean Only
              </button>
            </div>
            <div className="max-h-24 overflow-y-auto space-y-1 pr-0.5">
              {recordedLaps.map((lap) => (
                <label
                  key={lap.id}
                  className="flex items-center justify-between gap-2 text-[11px] bg-[#121926] px-2 py-1 rounded border border-white/5 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={lap.included}
                      onChange={() => telemetryRecorder.toggleLapIncluded(lap.id)}
                      className="accent-sky-500 cursor-pointer"
                    />
                    <span className="font-telemetry text-white tabular-nums">
                      L{lap.lapNumber} · {formatLapTime(lap.lapTime)}
                    </span>
                  </span>
                  <span
                    className={`text-[9px] font-bold uppercase ${
                      lap.isClean ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {lap.isClean ? 'CLEAN' : 'OFF-TRK'}
                  </span>
                </label>
              ))}
            </div>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => {
                const res = telemetryRecorder.downloadDatasetBundle();
                if (res.lapCount > 0) {
                  setBcExportMsg(`Exported ${res.lapCount} lap(s) (${res.sampleCount} frames)`);
                }
              }}
              className="w-full py-1.5 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-[11px] font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Export {selectedCount} Lap(s) JSONL for trainPPO.py
            </button>
            {bcExportMsg && (
              <div className="text-[10px] text-emerald-400 text-center">{bcExportMsg}</div>
            )}
          </div>
        )}

        {(onOpenPhotoMode || onOpenReplay || onTriggerFlashback) && (
          <div className="grid grid-cols-3 gap-2">
            {onOpenPhotoMode && (
              <button
                type="button"
                onClick={onOpenPhotoMode}
                className="py-2 px-2 rounded bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-200 text-xs font-bold flex flex-col items-center gap-1 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                Photo (F9)
              </button>
            )}
            {onOpenReplay && (
              <button
                type="button"
                disabled={!replayAvailable}
                onClick={onOpenReplay}
                className="py-2 px-2 rounded bg-rose-500/15 hover:bg-rose-500/25 disabled:opacity-35 border border-rose-500/40 text-rose-200 text-xs font-bold flex flex-col items-center gap-1 cursor-pointer"
              >
                <Film className="w-3.5 h-3.5" />
                Replay
              </button>
            )}
            {onTriggerFlashback && (
              <button
                type="button"
                disabled={!flashbackAvailable}
                onClick={() => {
                  onTriggerFlashback();
                  onResume();
                }}
                className="py-2 px-2 rounded bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-35 border border-amber-500/40 text-amber-200 text-xs font-bold flex flex-col items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Rewind -5.5s
              </button>
            )}
          </div>
        )}

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
          {onOpenSettings && (
            <button
              type="button"
              data-testid="btn-pause-settings"
              onClick={onOpenSettings}
              className="w-full py-2.5 rounded bg-[#18202c] hover:bg-[#222c3d] border border-white/10 text-sm font-semibold text-slate-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              Settings
            </button>
          )}
          <button
            type="button"
            onClick={onReturnToTitle}
            className="w-full py-2.5 rounded bg-transparent hover:bg-white/5 border border-white/10 text-sm font-medium text-slate-300 flex items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Menu (Paddock)
          </button>
        </div>
      </div>
    </div>
  );
}
