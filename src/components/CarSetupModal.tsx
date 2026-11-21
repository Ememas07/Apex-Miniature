import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, RotateCcw, Shield, Sliders, Upload, Wrench, X } from 'lucide-react';
import { CAR_CLASSES, CARS, getCarBoP, getCarById } from '../game/cars';
import {
  CAR_SETUP_PRESETS,
  clearSavedCarSetup,
  CustomBoPSandboxState,
  decodeSetupCode,
  DEFAULT_CAR_SETUP,
  encodeSetupCode,
  getCustomBoPSandbox,
  getDefaultTrackClassSetup,
  getSavedCarSetup,
  getTrackClassSetupLabel,
  hasUserSavedCarSetup,
  normalizeCarSetup,
  resetCustomBoPSandbox,
  saveCarSetup,
  setCustomBoPCarOverride,
  setCustomBoPClassOverride,
  setCustomBoPEnabled,
  subscribeCustomBoP,
} from '../game/carSetup';
import { getTrackById } from '../game/tracks';
import { CarClassId, CarSetupConfig } from '../game/types';

interface CarSetupModalProps {
  open: boolean;
  carId: string;
  trackId: string;
  currentSetup?: CarSetupConfig;
  onClose: () => void;
  onApplySetup: (setup: CarSetupConfig) => void;
}

export function CarSetupModal({
  open,
  carId,
  trackId,
  currentSetup,
  onClose,
  onApplySetup,
}: CarSetupModalProps) {
  const [tab, setTab] = useState<'setup' | 'bop'>('setup');
  const [draft, setDraft] = useState<CarSetupConfig>(() =>
    normalizeCarSetup(currentSetup ?? getSavedCarSetup(carId, trackId)),
  );
  const [shareInput, setShareInput] = useState('');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [bopState, setBopState] = useState<CustomBoPSandboxState>(() => getCustomBoPSandbox());
  const [bopSelectedClass, setBopSelectedClass] = useState<CarClassId>(() => getCarById(carId).classId);

  const car = useMemo(() => getCarById(carId), [carId]);
  const track = useMemo(() => getTrackById(trackId), [trackId]);
  const classCars = useMemo(() => CARS.filter((c) => c.classId === bopSelectedClass), [bopSelectedClass]);

  useEffect(() => {
    if (open) {
      setDraft(normalizeCarSetup(currentSetup ?? getSavedCarSetup(carId, trackId)));
      setBopSelectedClass(getCarById(carId).classId);
      setImportError(null);
      setCopyFeedback(null);
    }
  }, [open, carId, trackId, currentSetup]);

  useEffect(() => subscribeCustomBoP(setBopState), []);

  if (!open) return null;

  const updateField = <K extends keyof CarSetupConfig>(key: K, value: CarSetupConfig[K]) => {
    setDraft((prev) => normalizeCarSetup({ ...prev, [key]: value }));
  };

  const handleSaveAndApply = () => {
    const clean = saveCarSetup(carId, trackId, draft);
    onApplySetup(clean);
    onClose();
  };

  const handleCopyCode = () => {
    const code = encodeSetupCode(draft);
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
    setShareInput(code);
    setCopyFeedback('Copied!');
    window.setTimeout(() => setCopyFeedback(null), 1800);
  };

  const handleImportCode = () => {
    const decoded = decodeSetupCode(shareInput);
    if (!decoded) {
      setImportError('Invalid APXSET setup code.');
      return;
    }
    setImportError(null);
    setDraft(decoded);
  };

  const clsOverride = bopState.classOverrides[bopSelectedClass] ?? {
    topSpeedMult: 1.0,
    gripMult: 1.0,
    downforceMult: 1.0,
    brakingMult: 1.0,
  };

  const trackClassLabel = useMemo(() => getTrackClassSetupLabel(carId, trackId), [carId, trackId]);
  const isCustomSaved = hasUserSavedCarSetup(carId, trackId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-lg border border-white/15 bg-[#0e131c] text-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#121826]">
          <div className="flex items-center gap-2.5 min-w-0">
            <Wrench className="w-4 h-4 text-sky-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-bold tracking-wide uppercase truncate">
                Garage Setup &amp; BoP Workbench
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                {car.name} · {track.name} ·{' '}
                <span className="text-sky-300 font-semibold">
                  {isCustomSaved ? 'Custom Saved' : `Auto: ${trackClassLabel}`}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTab('setup')}
              className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                tab === 'setup'
                  ? 'bg-sky-600 text-white'
                  : 'bg-[#1a2233] text-slate-300 hover:bg-[#232e45]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Car Setup
            </button>
            <button
              type="button"
              onClick={() => setTab('bop')}
              className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                tab === 'bop'
                  ? 'bg-amber-600 text-white'
                  : 'bg-[#1a2233] text-slate-300 hover:bg-[#232e45]'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              BoP Sandbox
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close setup modal"
              className="p-1.5 rounded bg-white/5 hover:bg-white/15 text-slate-300 cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {tab === 'setup' ? (
            <>
              {/* Auto-Loaded Track × Class Default Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded border border-sky-500/30 bg-[#101929] text-xs">
                <div className="min-w-0">
                  <span className="font-semibold text-sky-300">Track &amp; Class Auto-Setup:</span>{' '}
                  <span className="text-slate-200">{trackClassLabel}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const def = clearSavedCarSetup(carId, trackId);
                    setDraft(def);
                  }}
                  className="px-2.5 py-1 rounded bg-[#182438] hover:bg-[#223350] border border-sky-400/40 text-[11px] font-semibold text-sky-200 cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3 h-3" />
                  Load {trackClassLabel}
                </button>
              </div>

              {/* Presets */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {CAR_SETUP_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setDraft({ ...preset.setup })}
                    className="text-left p-2.5 rounded border border-white/10 bg-[#141b29] hover:bg-[#1c263a] hover:border-sky-400/50 transition cursor-pointer"
                  >
                    <div className="text-xs font-bold text-white">{preset.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                      {preset.subtitle}
                    </div>
                  </button>
                ))}
              </div>

              {/* Tuning Sliders */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SetupSlider
                  label="Front Wing / Splitter"
                  value={draft.frontWing}
                  min={0}
                  max={100}
                  step={1}
                  display={`${draft.frontWing}%`}
                  hint="Higher = sharper turn-in & front downforce, slightly lower Vmax"
                  onChange={(v) => updateField('frontWing', v)}
                />
                <SetupSlider
                  label="Rear Wing Angle"
                  value={draft.rearWing}
                  min={0}
                  max={100}
                  step={1}
                  display={`${draft.rearWing}%`}
                  hint="Higher = planted rear end in fast corners, more drag"
                  onChange={(v) => updateField('rearWing', v)}
                />
                <SetupSlider
                  label="Brake Balance (Front %)"
                  value={draft.brakeBalance}
                  min={45}
                  max={68}
                  step={0.5}
                  display={`${draft.brakeBalance.toFixed(1)}% F`}
                  hint="Live adjustable in-race with [ / ] · Forward = stable, Rearward = rotation"
                  onChange={(v) => updateField('brakeBalance', v)}
                />
                <SetupSlider
                  label="Final Drive Gear Ratio"
                  value={draft.finalDrive}
                  min={-10}
                  max={10}
                  step={1}
                  display={draft.finalDrive === 0 ? 'Balanced' : draft.finalDrive > 0 ? `+${draft.finalDrive} Tall` : `${draft.finalDrive} Short`}
                  hint="Short = explosive corner exit · Tall = higher straight-line top speed"
                  onChange={(v) => updateField('finalDrive', v)}
                />
                <SetupSlider
                  label="Suspension Stiffness"
                  value={draft.suspensionStiffness}
                  min={0}
                  max={100}
                  step={1}
                  display={`${draft.suspensionStiffness}%`}
                  hint="Soft = absorbs kerbs & wet tracks · Stiff = crisp aero platform"
                  onChange={(v) => updateField('suspensionStiffness', v)}
                />
                <SetupSlider
                  label="Anti-Roll Bar Balance"
                  value={draft.arbBalance}
                  min={-50}
                  max={50}
                  step={1}
                  display={draft.arbBalance === 0 ? 'Neutral' : draft.arbBalance < 0 ? `${draft.arbBalance} Understeer` : `+${draft.arbBalance} Oversteer`}
                  hint="Negative = safer stability · Positive = aggressive apex rotation"
                  onChange={(v) => updateField('arbBalance', v)}
                />
                <SetupSlider
                  label="Differential Locking"
                  value={draft.diffLock}
                  min={0}
                  max={100}
                  step={1}
                  display={`${draft.diffLock}%`}
                  hint="Low = freer corner entry · High = stronger corner-exit traction"
                  onChange={(v) => updateField('diffLock', v)}
                />
                <SetupSlider
                  label="Starting Fuel Load"
                  value={draft.startingFuel}
                  min={15}
                  max={100}
                  step={5}
                  display={`${draft.startingFuel}%`}
                  hint="Lighter fuel = lighter chassis & quicker lap times, fewer laps before pit"
                  onChange={(v) => updateField('startingFuel', v)}
                />
                <SetupSlider
                  label="Front Tire Pressure"
                  value={draft.tirePressureFront}
                  min={18}
                  max={32}
                  step={0.5}
                  display={`${draft.tirePressureFront.toFixed(1)} PSI`}
                  hint="Sweet spot ~24 PSI · Higher heats faster, lower boosts contact patch"
                  onChange={(v) => updateField('tirePressureFront', v)}
                />
                <SetupSlider
                  label="Rear Tire Pressure"
                  value={draft.tirePressureRear}
                  min={18}
                  max={32}
                  step={0.5}
                  display={`${draft.tirePressureRear.toFixed(1)} PSI`}
                  hint="Sweet spot ~23.5 PSI · Tunes rear warm-up & traction window"
                  onChange={(v) => updateField('tirePressureRear', v)}
                />
              </div>

              {/* Share Codes */}
              <div className="rounded border border-white/10 bg-[#121722] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-200">
                    Share / Import Setup Code (`APXSET:`)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDraft({ ...DEFAULT_CAR_SETUP })}
                      className="px-2 py-1 rounded bg-[#1b2434] hover:bg-[#253147] border border-white/10 text-[11px] font-semibold text-slate-300 flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Default
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="px-2 py-1 rounded bg-sky-600/90 hover:bg-sky-500 text-[11px] font-semibold text-white flex items-center gap-1 cursor-pointer"
                    >
                      {copyFeedback ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copyFeedback ?? 'Export Code'}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={shareInput}
                    onChange={(e) => setShareInput(e.target.value)}
                    placeholder="Paste APXSET:v1:... code here"
                    className="flex-1 px-2.5 py-1.5 rounded bg-[#090d14] border border-white/15 font-telemetry text-xs text-slate-200 focus:outline-none focus:border-sky-400"
                  />
                  <button
                    type="button"
                    onClick={handleImportCode}
                    className="px-2.5 py-1.5 rounded bg-[#1c2536] hover:bg-[#26324a] border border-white/15 text-xs font-semibold text-white flex items-center gap-1 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Import
                  </button>
                </div>
                {importError && <p className="text-[11px] text-rose-400">{importError}</p>}
              </div>
            </>
          ) : (
            /* Live BoP Inspector & Custom BoP Sandbox */
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-500/30 bg-amber-950/20 p-3">
                <div>
                  <div className="text-xs font-bold text-amber-300 uppercase">
                    Custom BoP Sandbox Override
                  </div>
                  <div className="text-[11px] text-slate-300">
                    Inspect factory `bopConfig.json` parity or apply custom class/car multipliers for league races.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomBoPEnabled(!bopState.enabled)}
                    className={`px-3 py-1.5 rounded text-xs font-bold cursor-pointer border ${
                      bopState.enabled
                        ? 'bg-emerald-600 border-emerald-400 text-white'
                        : 'bg-[#1a2233] border-white/15 text-slate-300'
                    }`}
                  >
                    {bopState.enabled ? 'Sandbox Active' : 'Sandbox Off (Stock BoP)'}
                  </button>
                  <button
                    type="button"
                    onClick={resetCustomBoPSandbox}
                    className="px-2.5 py-1.5 rounded bg-[#1a2233] hover:bg-[#263147] border border-white/10 text-xs text-slate-300 cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset All
                  </button>
                </div>
              </div>

              {/* Class selector */}
              <div className="flex flex-wrap gap-1.5">
                {Object.values(CAR_CLASSES).map((meta) => (
                  <button
                    key={meta.id}
                    type="button"
                    onClick={() => setBopSelectedClass(meta.id)}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer border ${
                      bopSelectedClass === meta.id
                        ? 'bg-sky-600 border-sky-400 text-white'
                        : 'bg-[#141b29] border-white/10 text-slate-300 hover:bg-[#1e283b]'
                    }`}
                  >
                    {meta.shortName}
                  </button>
                ))}
              </div>

              {/* Class-wide BoP Multipliers */}
              <div className="rounded border border-white/10 bg-[#121722] p-3 space-y-2.5">
                <div className="text-xs font-semibold text-slate-200">
                  Class-Wide BoP Multiplier — {CAR_CLASSES[bopSelectedClass].name}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {(
                    [
                      ['topSpeedMult', 'Top Speed'],
                      ['gripMult', 'Mech Grip'],
                      ['downforceMult', 'Downforce'],
                      ['brakingMult', 'Braking'],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-400">{label}</span>
                        <span className="font-telemetry text-amber-300">
                          {(clsOverride[key] * 100).toFixed(1)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.8}
                        max={1.2}
                        step={0.005}
                        disabled={!bopState.enabled}
                        value={clsOverride[key]}
                        onChange={(e) =>
                          setCustomBoPClassOverride(bopSelectedClass, {
                            [key]: Number(e.target.value),
                          })
                        }
                        className="w-full accent-amber-500 h-1.5 disabled:opacity-40 cursor-pointer"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Per-Car BoP Inspector Table */}
              <div className="rounded border border-white/10 bg-[#121722] overflow-hidden">
                <div className="grid grid-cols-12 px-3 py-2 bg-[#171e2d] text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <div className="col-span-4">Car</div>
                  <div className="col-span-2 text-right">Stock Vmax</div>
                  <div className="col-span-2 text-right">Stock Grip</div>
                  <div className="col-span-2 text-right">Custom Vmax</div>
                  <div className="col-span-2 text-right">Custom Grip</div>
                </div>
                <div className="divide-y divide-white/5 max-h-56 overflow-y-auto">
                  {classCars.map((c) => {
                    const base = getCarBoP(c.id);
                    const custom = bopState.carOverrides[c.id] ?? {
                      topSpeedMult: 1.0,
                      gripMult: 1.0,
                      downforceMult: 1.0,
                      brakingMult: 1.0,
                    };
                    return (
                      <div
                        key={c.id}
                        className="grid grid-cols-12 items-center px-3 py-1.5 text-[11px] hover:bg-white/[0.02]"
                      >
                        <div className="col-span-4 font-medium text-slate-200 truncate pr-2">
                          {c.name}
                        </div>
                        <div className="col-span-2 text-right font-telemetry text-slate-400">
                          {base.topSpeedMult.toFixed(3)}×
                        </div>
                        <div className="col-span-2 text-right font-telemetry text-slate-400">
                          {base.gripMult.toFixed(3)}×
                        </div>
                        <div className="col-span-2 flex justify-end">
                          <input
                            type="number"
                            step={0.01}
                            min={0.8}
                            max={1.2}
                            disabled={!bopState.enabled}
                            value={custom.topSpeedMult}
                            onChange={(e) =>
                              setCustomBoPCarOverride(c.id, { topSpeedMult: Number(e.target.value) })
                            }
                            className="w-16 px-1.5 py-0.5 rounded bg-[#0a0e16] border border-white/15 text-right font-telemetry text-[11px] text-amber-300 disabled:opacity-40"
                          />
                        </div>
                        <div className="col-span-2 flex justify-end">
                          <input
                            type="number"
                            step={0.01}
                            min={0.8}
                            max={1.2}
                            disabled={!bopState.enabled}
                            value={custom.gripMult}
                            onChange={(e) =>
                              setCustomBoPCarOverride(c.id, { gripMult: Number(e.target.value) })
                            }
                            className="w-16 px-1.5 py-0.5 rounded bg-[#0a0e16] border border-white/15 text-right font-telemetry text-[11px] text-sky-300 disabled:opacity-40"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 bg-[#121826]">
          <span className="text-[11px] text-slate-400">
            Saved per (car, circuit) · Brake bias also live-adjustable in-race (`[` / `]`)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-[#1b2333] hover:bg-[#253047] text-xs font-semibold text-slate-200 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAndApply}
              className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Save &amp; Apply Setup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SetupSlider({
  label,
  value,
  min,
  max,
  step,
  display,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  hint: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rounded border border-white/10 bg-[#121722] p-2.5 space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-200">{label}</span>
        <span className="font-telemetry text-sky-300 font-bold">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-sky-500 h-1.5 cursor-pointer"
      />
      <p className="text-[10px] text-slate-400 leading-tight">{hint}</p>
    </div>
  );
}
