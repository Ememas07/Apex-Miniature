import { useEffect, useMemo, useState } from 'react';
import { Cpu, RotateCcw, SlidersHorizontal, Sparkles } from 'lucide-react';
import {
  AI_POLICY_VARIANT_IDS,
  AiPolicyMixWeights,
  AiPolicyVariantId,
  DEFAULT_POLICY_MIX,
  getActiveAiPolicyMix,
  getAiPolicyVariants,
  getClassPolicyVariants,
  getNormalizedPolicyMix,
  getPerClassPoliciesEnabled,
  getPersonalityPolicyBlendingEnabled,
  getStartPolicyMode,
  getStartPolicyStatus,
  selectSingleAiPolicyVariant,
  setActiveAiPolicyMix,
  setPerClassPoliciesEnabled,
  setPersonalityPolicyBlendingEnabled,
  setStartPolicyMode,
  StartPolicyMode,
  subscribeAiPolicyMix,
  subscribePerClassPolicies,
  subscribePersonalityPolicyBlending,
  subscribePolicyRegistry,
  subscribeStartPolicyMode,
} from '../game/aiNeuralPolicy';

interface AiPolicyMixPanelProps {
  compact?: boolean;
}

export function AiPolicyMixPanel({ compact = false }: AiPolicyMixPanelProps) {
  const [registryTick, setRegistryTick] = useState(0);
  const variants = useMemo(() => getAiPolicyVariants(), [registryTick]);
  const classPolicies = useMemo(() => getClassPolicyVariants(), [registryTick]);
  const startPolicy = useMemo(() => getStartPolicyStatus(), [registryTick]);
  const [mix, setMix] = useState<AiPolicyMixWeights>(() => getActiveAiPolicyMix());
  const [startMode, setStartMode] = useState<StartPolicyMode>(() => getStartPolicyMode());
  const [perClassEnabled, setPerClassEnabled] = useState<boolean>(() =>
    getPerClassPoliciesEnabled(),
  );
  const [personalityBlend, setPersonalityBlend] = useState<boolean>(() =>
    getPersonalityPolicyBlendingEnabled(),
  );
  const [expanded, setExpanded] = useState(!compact);

  useEffect(() => {
    const u1 = subscribeAiPolicyMix((next) => setMix({ ...next }));
    const u2 = subscribeStartPolicyMode((next) => setStartMode(next));
    const u3 = subscribePersonalityPolicyBlending((next) => setPersonalityBlend(next));
    const u4 = subscribePerClassPolicies((next) => setPerClassEnabled(next));
    const u5 = subscribePolicyRegistry(() => setRegistryTick((t) => t + 1));
    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
    };
  }, []);

  const normalized = useMemo(() => getNormalizedPolicyMix(mix), [mix, registryTick]);
  const loadedVariants = useMemo(() => variants.filter((v) => v.loaded), [variants]);
  const loadedClassPolicies = useMemo(
    () => classPolicies.filter((c) => c.loaded),
    [classPolicies],
  );

  const handleSliderChange = (id: AiPolicyVariantId, rawVal: number) => {
    const val = Number.isFinite(rawVal) ? Math.max(0, Math.min(100, Math.round(rawVal))) : 0;
    setActiveAiPolicyMix({ ...mix, [id]: val });
  };

  const summaryText = normalized
    .map((entry) => {
      const meta = variants.find((v) => v.id === entry.id);
      return `${meta?.shortLabel ?? entry.id} ${Math.round(entry.fraction * 100)}%`;
    })
    .join(' · ');

  return (
    <div
      data-testid="ai-policy-mix-panel"
      className="rounded-md border border-white/10 bg-[#121722] p-3 space-y-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Cpu className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-200 truncate">
            AI Neural Policy (ANB1 Binary)
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] font-telemetry text-sky-300 truncate max-w-[190px] tabular-nums">
            {perClassEnabled && loadedClassPolicies.length > 0
              ? `Per-Class (${loadedClassPolicies.length}/${classPolicies.length})`
              : summaryText || 'v1 Gen 100%'}
          </span>
          {compact && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="px-2 py-1 rounded bg-[#181f2c] hover:bg-[#222c3d] border border-white/10 text-[11px] font-semibold text-slate-200 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
            >
              <SlidersHorizontal className="w-3 h-3" />
              {expanded ? 'Hide' : 'Tune'}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 pt-2 border-t border-white/10">
          {/* Per-Class Dedicated ANB1 Binary Models */}
          <div className="rounded px-2.5 py-2 border border-indigo-500/25 bg-[#0d1322] space-y-2 text-[11px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="font-semibold text-indigo-300">Per-Class Binary Models</span>
                <span className="text-slate-400">
                  {' '}
                  · {loadedClassPolicies.length}/{classPolicies.length} classes loaded (ANB1 .bin)
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPerClassPoliciesEnabled(true)}
                  className={`px-2 py-0.5 rounded border text-[10px] font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
                    perClassEnabled
                      ? 'bg-indigo-600 border-indigo-400 text-white'
                      : 'bg-[#121c22] hover:bg-[#1a2830] border-white/10 text-slate-300'
                  }`}
                >
                  Per-Class
                </button>
                <button
                  type="button"
                  onClick={() => setPerClassPoliciesEnabled(false)}
                  className={`px-2 py-0.5 rounded border text-[10px] font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
                    !perClassEnabled
                      ? 'bg-indigo-600 border-indigo-400 text-white'
                      : 'bg-[#121c22] hover:bg-[#1a2830] border-white/10 text-slate-300'
                  }`}
                >
                  Fallback Only
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {classPolicies.map((cp) => (
                <span
                  key={cp.classId}
                  title={
                    cp.loaded
                      ? `${cp.filename} (${cp.hiddenDim}h · ${cp.obsDim}-obs · ${cp.pedalMode})`
                      : `Untrained (${cp.filename}) — uses v1/v2 fallback`
                  }
                  className={`px-1.5 py-0.5 rounded text-[10px] font-telemetry border ${
                    cp.loaded
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-white/5 border-white/10 text-slate-500'
                  }`}
                >
                  {cp.classId}
                  {cp.loaded && cp.pedalMode === 'signed' ? ' · 2P' : ''}
                </span>
              ))}
            </div>
          </div>

          {/* Quick Single-Model & 50/50 Blend Presets (Fallback Mix) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveAiPolicyMix({ ...DEFAULT_POLICY_MIX })}
              className="px-2 py-1 rounded bg-[#18202f] hover:bg-[#232f45] border border-white/10 text-[11px] font-semibold text-slate-200 cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
              title="Reset to 100% v1 Physics Master"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
            {loadedVariants.length > 1 && (
              <button
                type="button"
                onClick={() => setActiveAiPolicyMix({ v1: 50, v2: 50 })}
                className="px-2 py-1 rounded bg-[#18202f] hover:bg-[#232f45] border border-emerald-500/35 text-[11px] font-semibold text-emerald-300 cursor-pointer whitespace-nowrap shrink-0"
                title="50% v1 Physics Master + 50% v2 Racecraft Master"
              >
                50 / 50 Blend
              </button>
            )}
            {variants
              .filter((v) => v.loaded)
              .map((v) => {
                const isExclusive = normalized.length === 1 && normalized[0].id === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => selectSingleAiPolicyVariant(v.id)}
                    className={`px-2 py-1 rounded border text-[11px] font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
                      isExclusive
                        ? 'bg-sky-600 border-sky-400 text-white'
                        : 'bg-[#18202f] hover:bg-[#232f45] border-white/10 text-slate-300'
                    }`}
                  >
                    100% {v.shortLabel}
                  </button>
                );
              })}
          </div>

          {/* Per-Variant Sliders & Load Status */}
          <div className="space-y-2">
            {AI_POLICY_VARIANT_IDS.map((id) => {
              const info = variants.find((v) => v.id === id)!;
              const rawVal = mix[id] ?? 0;
              const normEntry = normalized.find((n) => n.id === id);
              const effPct = normEntry ? Math.round(normEntry.fraction * 100) : 0;
              const meanSpeed =
                typeof info.meta?.meanSpeedKmh === 'number' && Number.isFinite(info.meta.meanSpeedKmh)
                  ? Math.round(info.meta.meanSpeedKmh)
                  : null;

              return (
                <div
                  key={id}
                  className={`rounded px-2.5 py-2 border ${
                    info.loaded
                      ? 'bg-[#0e131c] border-white/10'
                      : 'bg-[#0c1017]/60 border-white/5 opacity-70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs mb-1">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white truncate">{info.label}</span>
                        {info.loaded ? (
                          <span className="text-[10px] font-telemetry text-emerald-400 whitespace-nowrap tabular-nums">
                            Loaded{info.hiddenDim ? ` · ${info.hiddenDim}h` : ''}
                            {info.obsDim ? ` · ${info.obsDim}-obs` : ''}
                            {info.binaryAvailable ? ' · ANB1' : ''}
                            {meanSpeed !== null ? ` · ~${meanSpeed} km/h` : ''}
                          </span>
                        ) : (
                          <span className="text-[10px] font-telemetry text-amber-400/90 whitespace-nowrap">
                            Ready to Train (see .RUN.md)
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 truncate">{info.description}</p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        disabled={!info.loaded}
                        aria-label={`${info.label} mix weight`}
                        value={info.loaded ? rawVal : 0}
                        onChange={(e) => handleSliderChange(id, Number(e.target.value))}
                        className="w-12 px-1.5 py-0.5 rounded bg-[#090c12] border border-white/15 text-right font-telemetry text-[11px] text-white tabular-nums disabled:opacity-40 focus:outline-none focus:border-sky-400"
                      />
                      <span className="w-9 text-right font-telemetry text-[11px] text-sky-300 tabular-nums">
                        {effPct}%
                      </span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={100}
                    disabled={!info.loaded}
                    aria-label={`${info.label} slider`}
                    value={info.loaded ? rawVal : 0}
                    onChange={(e) => handleSliderChange(id, Number(e.target.value))}
                    className="w-full accent-sky-500 cursor-pointer disabled:cursor-not-allowed h-1.5"
                  />
                </div>
              );
            })}
          </div>

          {/* Single-Model Per-Personality Inference Modifiers Toggle */}
          <div className="rounded px-2.5 py-2 border border-sky-500/20 bg-[#0d1420] flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="min-w-0 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="font-semibold text-sky-200">Driver Personalities</span>
              <span className="text-slate-400 hidden sm:inline">
                · Single-model inference modifiers per trait
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPersonalityPolicyBlendingEnabled(true)}
                className={`px-2 py-0.5 rounded border text-[10px] font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
                  personalityBlend
                    ? 'bg-sky-600 border-sky-400 text-white'
                    : 'bg-[#121c22] hover:bg-[#1a2830] border-white/10 text-slate-300'
                }`}
              >
                On
              </button>
              <button
                type="button"
                onClick={() => setPersonalityPolicyBlendingEnabled(false)}
                className={`px-2 py-0.5 rounded border text-[10px] font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
                  !personalityBlend
                    ? 'bg-sky-600 border-sky-400 text-white'
                    : 'bg-[#121c22] hover:bg-[#1a2830] border-white/10 text-slate-300'
                }`}
              >
                Uniform
              </button>
            </div>
          </div>

          {/* Selectable Race Start Policy Mode */}
          <div className="rounded px-2.5 py-2 border border-emerald-500/25 bg-[#0d161b] flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="min-w-0">
              <span className="font-semibold text-emerald-300">Starts Policy</span>
              <span className="text-slate-400">
                {' '}
                · {startPolicy.loaded ? `Trained Neural (${startPolicy.hiddenDim}h · ANB1)` : 'Neural Missing'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'neural' as StartPolicyMode, label: 'Trained Neural', disabled: !startPolicy.loaded },
                  { id: 'launch-assist' as StartPolicyMode, label: 'Auto Assist', disabled: false },
                  { id: 'off' as StartPolicyMode, label: 'Off', disabled: false },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => setStartPolicyMode(opt.id)}
                  className={`px-2 py-0.5 rounded border text-[10px] font-semibold cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                    startMode === opt.id
                      ? 'bg-emerald-600 border-emerald-400 text-white'
                      : 'bg-[#121c22] hover:bg-[#1a2830] border-white/10 text-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
