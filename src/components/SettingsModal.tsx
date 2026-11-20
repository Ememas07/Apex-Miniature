import { useEffect, useState } from 'react';
import { Gamepad2, Hand, Settings, Volume2, VolumeX, X } from 'lucide-react';
import {
  getGameSettings,
  setGameSettings,
  subscribeGameSettings,
  TouchControlsMode,
  TouchSteerStyle,
} from '../game/settings';
import { isTouchCapableDevice } from '../game/touchControls';

interface SettingsModalProps {
  onClose: () => void;
}

function detectConnectedGamepadName(): string | null {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return null;
  }
  try {
    const pads = navigator.getGamepads() ?? [];
    for (let i = 0; i < pads.length; i++) {
      const gp = pads[i];
      if (gp && gp.connected) {
        return gp.id || `Controller #${gp.index + 1}`;
      }
    }
  } catch {
    // Ignore restricted Gamepad API environments
  }
  return null;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [controllerEnabled, setControllerEnabled] = useState<boolean>(
    () => getGameSettings().controllerEnabled,
  );
  const [touchControlsMode, setTouchControlsMode] = useState<TouchControlsMode>(
    () => getGameSettings().touchControlsMode,
  );
  const [touchSteerStyle, setTouchSteerStyle] = useState<TouchSteerStyle>(
    () => getGameSettings().touchSteerStyle,
  );
  const [isTouchDevice] = useState<boolean>(() => isTouchCapableDevice());
  const [detectedGamepad, setDetectedGamepad] = useState<string | null>(() =>
    detectConnectedGamepadName(),
  );

  const [volume, setVolume] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('apex_audio_volume');
      return saved !== null ? Math.max(0, Math.min(1, parseFloat(saved))) : 0.8;
    } catch {
      return 0.8;
    }
  });

  const [muted, setMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('apex_audio_muted') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const unsub = subscribeGameSettings((next) => {
      setControllerEnabled(next.controllerEnabled);
      setTouchControlsMode(next.touchControlsMode);
      setTouchSteerStyle(next.touchSteerStyle);
    });
    const refreshPads = () => setDetectedGamepad(detectConnectedGamepadName());
    window.addEventListener('gamepadconnected', refreshPads);
    window.addEventListener('gamepaddisconnected', refreshPads);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      unsub();
      window.removeEventListener('gamepadconnected', refreshPads);
      window.removeEventListener('gamepaddisconnected', refreshPads);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const handleToggleController = () => {
    const next = !controllerEnabled;
    setControllerEnabled(next);
    setGameSettings({ controllerEnabled: next });
    if (next) {
      setDetectedGamepad(detectConnectedGamepadName());
    }
  };

  const handleTouchModeChange = (mode: TouchControlsMode) => {
    setTouchControlsMode(mode);
    setGameSettings({ touchControlsMode: mode });
  };

  const handleTouchSteerStyleChange = (style: TouchSteerStyle) => {
    setTouchSteerStyle(style);
    setGameSettings({ touchSteerStyle: style });
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    try {
      localStorage.setItem('apex_audio_volume', String(newVol));
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent('apex-audio-volume', { detail: { volume: newVol } }));
  };

  const handleToggleMute = () => {
    const nextMute = !muted;
    setMuted(nextMute);
    try {
      localStorage.setItem('apex_audio_muted', String(nextMute));
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent('apex-audio-mute', { detail: { muted: nextMute } }));
  };

  return (
    <div
      data-testid="settings-modal"
      role="dialog"
      aria-label="Game Settings"
      className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-3 sm:p-4"
    >
      <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto custom-scroll bg-[#11151d] border border-white/15 rounded-lg p-5 sm:p-6 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-red-500" />
              Settings
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Controller, mobile touch controls, and audio preferences are saved automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Settings"
            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Input / Controller Section */}
        <div className="p-4 rounded-lg bg-[#0c1017] border border-white/10 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                <Gamepad2 className={`w-4 h-4 ${controllerEnabled ? 'text-emerald-400' : 'text-slate-500'}`} />
                Controller / Gamepad Input
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Supports PS4/PS5, Xbox, Switch Pro, and mobile Bluetooth controllers. Disable to prevent stick drift.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={controllerEnabled}
              data-testid="toggle-controller-input"
              onClick={handleToggleController}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                controllerEnabled
                  ? 'bg-emerald-600 border-emerald-400/60'
                  : 'bg-slate-800 border-white/15'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  controllerEnabled ? 'translate-x-5.5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] pt-2 border-t border-white/5 gap-2">
            <span className="text-slate-400 shrink-0">Status</span>
            <span
              data-testid="controller-input-status"
              className={`font-telemetry truncate max-w-[230px] ${
                !controllerEnabled
                  ? 'text-amber-400'
                  : detectedGamepad
                  ? 'text-emerald-400'
                  : 'text-slate-400'
              }`}
              title={controllerEnabled ? detectedGamepad ?? 'No controller detected' : 'Disabled'}
            >
              {!controllerEnabled
                ? 'Disabled (Keyboard / Touch Only)'
                : detectedGamepad
                ? detectedGamepad
                : 'Enabled · No controller detected'}
            </span>
          </div>

          {controllerEnabled && (
            <div className="pt-2 border-t border-white/5 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-400">
              <span>Steer: <strong className="text-slate-200">L-Stick / D-Pad</strong></span>
              <span>Gas / Brake: <strong className="text-slate-200">R2 / L2</strong></span>
              <span>Special: <strong className="text-slate-200">A / Cross</strong></span>
              <span>Camera: <strong className="text-slate-200">Y / Triangle</strong></span>
              <span>Pause: <strong className="text-slate-200">Start / Options</strong></span>
              <span>Look / Reset: <strong className="text-slate-200">R-Stick / R3</strong></span>
            </div>
          )}
        </div>

        {/* Mobile Touchpad Controls Section */}
        <div className="p-4 rounded-lg bg-[#0c1017] border border-white/10 space-y-3">
          <div className="space-y-0.5">
            <div className="text-sm font-semibold text-white flex items-center gap-2">
              <Hand className="w-4 h-4 text-sky-400" />
              On-Screen Touch Controls
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Multi-touch steering pad, gas/brake pedals, and boost button. Auto enables on phones & tablets ({isTouchDevice ? 'touch screen detected' : 'desktop detected'}).
            </p>
          </div>

          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Touch Controls Mode">
            {([
              { id: 'auto', label: 'Auto' },
              { id: 'always', label: 'Always On' },
              { id: 'off', label: 'Off' },
            ] as { id: TouchControlsMode; label: string }[]).map((opt) => (
              <button
                key={opt.id}
                type="button"
                data-testid={`touch-mode-${opt.id}`}
                onClick={() => handleTouchModeChange(opt.id)}
                className={`min-h-[38px] px-2 py-1.5 rounded text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                  touchControlsMode === opt.id
                    ? 'bg-sky-600 border-sky-400 text-white'
                    : 'bg-[#151b26] border-white/10 text-slate-300 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {touchControlsMode !== 'off' && (
            <div className="pt-2 border-t border-white/5 space-y-1.5">
              <div className="text-[11px] text-slate-400">Steering Layout</div>
              <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Touch Steering Layout">
                {([
                  { id: 'pad', label: 'Analog Touchpad' },
                  { id: 'buttons', label: 'Left / Right Buttons' },
                ] as { id: TouchSteerStyle; label: string }[]).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={`touch-steer-${opt.id}`}
                    onClick={() => handleTouchSteerStyleChange(opt.id)}
                    className={`min-h-[38px] px-2 py-1.5 rounded text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                      touchSteerStyle === opt.id
                        ? 'bg-red-600 border-red-400 text-white'
                        : 'bg-[#151b26] border-white/10 text-slate-300 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Audio Section */}
        <div className="p-4 rounded-lg bg-[#0c1017] border border-white/10 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
              {muted ? (
                <VolumeX className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              )}
              Master Volume
            </span>
            <span className="font-mono text-slate-400">
              {muted ? 'MUTED' : `${Math.round(volume * 100)}%`}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={muted ? 0 : volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              aria-label="Master Volume Slider"
              className="flex-1 accent-red-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
            />
            <button
              type="button"
              onClick={handleToggleMute}
              className={`min-w-[38px] min-h-[38px] flex items-center justify-center rounded border text-xs font-semibold cursor-pointer transition-colors ${
                muted
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
              title={muted ? 'Unmute Audio' : 'Mute Audio'}
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="button"
          data-testid="btn-close-settings"
          onClick={onClose}
          className="w-full min-h-[44px] py-2.5 rounded bg-red-600 hover:bg-red-500 text-sm font-display font-bold text-white cursor-pointer"
        >
          Done
        </button>
      </div>
    </div>
  );
}
