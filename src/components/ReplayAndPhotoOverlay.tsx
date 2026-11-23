import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  Film,
  Pause,
  Play,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { CAMERA_MODE_LABELS, CAMERA_MODE_ORDER } from '../game/camera';
import { CameraMode, PhotoFilterId } from '../game/types';
import {
  PhotoModeState,
  ReplayAndPhotoControls,
  ReplayStateSnapshot,
} from '../three/RaceViewport';

interface ReplayAndPhotoOverlayProps {
  replayState: ReplayStateSnapshot | null;
  photoState: PhotoModeState | null;
  controls: ReplayAndPhotoControls | null;
}

const SPEED_OPTIONS = [0.1, 0.25, 0.5, 1, 2, 4];

const FILTER_OPTIONS: Array<{ id: PhotoFilterId; label: string }> = [
  { id: 'none', label: 'Natural' },
  { id: 'f1-broadcast', label: 'Broadcast' },
  { id: 'kodachrome', label: 'Kodachrome' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'film-grain', label: 'Night Film' },
  { id: 'noir', label: 'B&W Noir' },
];

function formatClock(sec: number): string {
  const s = Math.max(0, sec);
  const mins = Math.floor(s / 60);
  const rem = s - mins * 60;
  return `${mins}:${rem < 10 ? '0' : ''}${rem.toFixed(1)}`;
}

export function ReplayAndPhotoOverlay({
  replayState,
  photoState,
  controls,
}: ReplayAndPhotoOverlayProps) {
  if (!controls) return null;

  // Photo Mode Overlay takes precedence when active
  if (photoState?.active) {
    return (
      <div className="fixed inset-0 z-40 pointer-events-none flex flex-col justify-between p-4 select-none">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3">
          <div className="pointer-events-auto bg-slate-950/90 border border-slate-700/80 rounded-lg px-3.5 py-2 flex items-center gap-3 shadow-lg">
            <Camera className="w-4 h-4 text-sky-400" />
            <div>
              <div className="text-xs font-black tracking-wider uppercase text-white">
                Photo Mode Studio
              </div>
              <div className="text-[10px] text-slate-400">
                WASD / Arrows: Orbit &amp; Dolly &bull; Q/E: Height &bull; F9: Exit
              </div>
            </div>
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => controls.capturePhoto(photoState.watermark)}
              className="px-3.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-lg cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Capture PNG
            </button>
            <button
              type="button"
              onClick={() => controls.exitPhotoMode()}
              className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold text-xs uppercase tracking-wider flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Close
            </button>
          </div>
        </div>

        {/* Bottom-right compact grading drawer */}
        <div className="flex justify-end">
          <div className="pointer-events-auto w-80 bg-slate-950/92 border border-slate-700/80 rounded-xl p-3.5 shadow-2xl space-y-2.5 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <span className="font-black uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400" />
                Lens &amp; Color Grading
              </span>
              <button
                type="button"
                onClick={() =>
                  controls.updatePhotoSettings({
                    fov: 45,
                    rollDeg: 0,
                    tiltShift: true,
                    tiltShiftStrength: 1.0,
                    exposure: 1.05,
                    contrast: 1.02,
                    saturation: 1.05,
                    filter: 'none',
                  })
                }
                className="text-[10px] font-bold text-slate-400 hover:text-white uppercase cursor-pointer"
              >
                Reset
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <label className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase">
                  <span>Lens FOV</span>
                  <span className="text-white tabular-nums">{Math.round(photoState.fov)}&deg;</span>
                </div>
                <input
                  type="range"
                  min={18}
                  max={90}
                  step={1}
                  value={photoState.fov}
                  onChange={(e) => controls.updatePhotoSettings({ fov: Number(e.target.value) })}
                  className="w-full accent-sky-400"
                />
              </label>

              <label className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase">
                  <span>Dutch Roll</span>
                  <span className="text-white tabular-nums">{Math.round(photoState.rollDeg)}&deg;</span>
                </div>
                <input
                  type="range"
                  min={-35}
                  max={35}
                  step={1}
                  value={photoState.rollDeg}
                  onChange={(e) => controls.updatePhotoSettings({ rollDeg: Number(e.target.value) })}
                  className="w-full accent-sky-400"
                />
              </label>

              <label className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase">
                  <span>Exposure</span>
                  <span className="text-white tabular-nums">{photoState.exposure.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.6}
                  max={1.6}
                  step={0.05}
                  value={photoState.exposure}
                  onChange={(e) => controls.updatePhotoSettings({ exposure: Number(e.target.value) })}
                  className="w-full accent-sky-400"
                />
              </label>

              <label className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase">
                  <span>Contrast</span>
                  <span className="text-white tabular-nums">{photoState.contrast.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.75}
                  max={1.45}
                  step={0.05}
                  value={photoState.contrast}
                  onChange={(e) => controls.updatePhotoSettings({ contrast: Number(e.target.value) })}
                  className="w-full accent-sky-400"
                />
              </label>

              <label className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase">
                  <span>Saturation</span>
                  <span className="text-white tabular-nums">{photoState.saturation.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={1.6}
                  step={0.05}
                  value={photoState.saturation}
                  onChange={(e) => controls.updatePhotoSettings({ saturation: Number(e.target.value) })}
                  className="w-full accent-sky-400"
                />
              </label>

              <label className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase">
                  <span>Tilt-Shift</span>
                  <span className="text-white tabular-nums">{photoState.tiltShift ? `${Math.round(photoState.tiltShiftStrength * 100)}%` : 'Off'}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={photoState.tiltShift ? photoState.tiltShiftStrength : 0}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    controls.updatePhotoSettings({ tiltShift: v > 0.05, tiltShiftStrength: Math.max(0.2, v) });
                  }}
                  className="w-full accent-sky-400"
                />
              </label>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                Color Filter
              </div>
              <div className="grid grid-cols-3 gap-1">
                {FILTER_OPTIONS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => controls.updatePhotoSettings({ filter: f.id })}
                    className={`px-2 py-1 rounded text-[10px] font-bold border transition cursor-pointer ${
                      photoState.filter === f.id
                        ? 'bg-sky-500/25 border-sky-400 text-sky-200'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center justify-between pt-1 border-t border-slate-800 cursor-pointer">
              <span className="text-[11px] font-semibold text-slate-300">Apex Miniature Watermark</span>
              <input
                type="checkbox"
                checked={photoState.watermark}
                onChange={(e) => controls.updatePhotoSettings({ watermark: e.target.checked })}
                className="accent-sky-400"
              />
            </label>
          </div>
        </div>
      </div>
    );
  }

  // Instant Replay Transport Bar
  if (replayState?.active) {
    const duration = Math.max(0.1, replayState.duration);
    const carIdx = Math.max(
      0,
      replayState.cars.findIndex((c) => c.id === replayState.focusCarId),
    );
    const focusCar = replayState.cars[carIdx] ?? replayState.cars[0];

    const stepCar = (dir: -1 | 1) => {
      if (replayState.cars.length === 0) return;
      const next = (carIdx + dir + replayState.cars.length) % replayState.cars.length;
      controls.setReplayFocusCar(replayState.cars[next].id);
    };

    return (
      <div className="fixed inset-x-0 bottom-4 z-40 px-4 flex justify-center pointer-events-none select-none">
        <div className="pointer-events-auto w-full max-w-4xl bg-slate-950/92 border border-slate-700/80 rounded-xl p-3 shadow-2xl space-y-2.5">
          {/* Header row: Replay badge, focus car, camera switcher, Photo Mode & Exit */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-black uppercase tracking-wider text-[10px] flex items-center gap-1">
                <Film className="w-3 h-3" />
                Replay
              </span>
              {focusCar && (
                <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded px-2 py-1">
                  <button
                    type="button"
                    onClick={() => stepCar(-1)}
                    className="text-slate-400 hover:text-white cursor-pointer"
                    aria-label="Previous car"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-bold text-white min-w-[110px] text-center truncate">
                    {focusCar.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => stepCar(1)}
                    className="text-slate-400 hover:text-white cursor-pointer"
                    aria-label="Next car"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <select
                value={replayState.cameraMode}
                onChange={(e) => controls.setReplayCamera(e.target.value as CameraMode)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] font-bold text-slate-200"
              >
                {CAMERA_MODE_ORDER.map((m) => (
                  <option key={m} value={m}>
                    {CAMERA_MODE_LABELS[m]}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => controls.enterPhotoMode()}
                className="px-2.5 py-1 rounded bg-sky-500/20 border border-sky-500/50 hover:bg-sky-500/30 text-sky-200 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                Photo
              </button>

              <button
                type="button"
                onClick={() => controls.exitReplay()}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Exit Replay
              </button>
            </div>
          </div>

          {/* Timeline scrubber with highlight bookmark markers */}
          <div className="relative pt-1">
            <input
              type="range"
              min={0}
              max={duration}
              step={0.05}
              value={Math.min(duration, replayState.time)}
              onChange={(e) => controls.seekReplay(Number(e.target.value))}
              className="w-full accent-rose-500 cursor-pointer"
            />
            {replayState.bookmarks.length > 0 && (
              <div className="relative h-2 -mt-1 pointer-events-none">
                {replayState.bookmarks.map((bm, i) => {
                  const pct = Math.max(0, Math.min(100, (bm.time / duration) * 100));
                  const col =
                    bm.type === 'fastest-lap'
                      ? 'bg-fuchsia-400'
                      : bm.type === 'overtake'
                      ? 'bg-emerald-400'
                      : 'bg-amber-400';
                  return (
                    <button
                      key={`${bm.time}-${i}`}
                      type="button"
                      title={bm.label}
                      onClick={() => controls.seekReplay(bm.time)}
                      style={{ left: `${pct}%` }}
                      className={`pointer-events-auto absolute top-0 w-2 h-2 -translate-x-1/2 rounded-full ${col} cursor-pointer`}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Playback transport + speed multipliers */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => controls.setReplayPlaying(!replayState.playing)}
                className="px-3 py-1 rounded bg-white text-slate-950 hover:bg-slate-200 font-black text-xs flex items-center gap-1 cursor-pointer"
              >
                {replayState.playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {replayState.playing ? 'Pause' : 'Play'}
              </button>
              <span className="font-mono text-[11px] text-slate-300 tabular-nums">
                {formatClock(replayState.time)} / {formatClock(duration)}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {SPEED_OPTIONS.map((spd) => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => controls.setReplaySpeed(spd)}
                  className={`px-2 py-0.5 rounded font-mono text-[11px] font-bold border cursor-pointer ${
                    replayState.speed === spd
                      ? 'bg-rose-500/25 border-rose-400 text-rose-200'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
