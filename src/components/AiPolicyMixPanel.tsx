import { useEffect, useMemo, useState } from 'react';
import { Cpu, RotateCcw, SlidersHorizontal } from 'lucide-react';
import {
  AI_POLICY_VARIANT_IDS,
  AiPolicyMixWeights,
  AiPolicyVariantId,
  DEFAULT_POLICY_MIX,
  getActiveAiPolicyMix,
  getAiPolicyVariants,
  getNormalizedPolicyMix,
  selectSingleAiPolicyVariant,
  setActiveAiPolicyMix,
  subscribeAiPolicyMix,
} from '../game/aiNeuralPolicy';

interface AiPolicyMixPanelProps {
  compact?: boolean;
}

export function AiPolicyMixPanel({ compact = false }: AiPolicyMixPanelProps) {
  const variants = useMemo(() => getAiPolicyVariants(), []);
  const [mix, setMix] = useState<AiPolicyMixWeights>(() => getActiveAiPolicyMix());
  const [expanded, setExpanded] = useState(!compact);

  useEffect(() => {
    return subscribeAiPolicyMix((next) => setMix({ ...next }));
  }, []);

  const normalized = useMemo(() => getNormalizedPolicyMix(mix), [mix]);
  const loadedVariants = useMemo(() => variants.filter((v) => v.loaded), [variants]);

  const handleSliderChange = (id: AiPolicyVariantId, rawVal: number) => {
    const val = Number.isFinite(rawVal) ? Math.max(0, Math.min(100, Math.round(rawVal))) : 0;
    setActiveAiPolicyMix({ ...mix, [id]: val });
  };

  const handleEqualMix = () => {
    const next = Object.fromEntries(
      AI_POLICY_VARIANT_IDS.map((id) => [id, 0]),
    ) as AiPolicyMixWeights;
    const count = loadedVariants.length || 1;
    const share = Math.round(100 / count);
    for (const v of loadedVariants) {
      next[v.id] = share;
    }
    setActiveAiPolicyMix(next);
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
            AI Neural Policy Mix
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] font-telemetry text-sky-300 truncate max-w-[190px]">
            {summaryText || 'Base 100%'}
          </span>
          {compact && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="px-2 py-1 rounded bg-[#181f2c] hover:bg-[#222c3d] border border-white/10 text-[11px] font-semibold text-slate-200 flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <SlidersHorizontal className="w-3 h-3" />
              {expanded ? 'Hide' : 'Tune'}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 pt-2 border-t border-white/10">
          {/* Quick Single-Model / Blend Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveAiPolicyMix({ ...DEFAULT_POLICY_MIX })}
              className="px-2 py-1 rounded bg-[#18202f] hover:bg-[#232f45] border border-white/10 text-[11px] font-semibold text-slate-200 cursor-pointer flex items-center gap-1 whitespace-nowrap"
              title="Reset to 100% Base neural model"
            >
              <RotateCcw className="w-3 h-3" />
              Base 100%
            </button>
            {loadedVariants.length > 1 && (
              <button
                type="button"
                onClick={handleEqualMix}
                className="px-2 py-1 rounded bg-[#18202f] hover:bg-[#232f45] border border-sky-500/30 text-[11px] font-semibold text-sky-300 cursor-pointer whitespace-nowrap"
              >
                Equal Blend ({loadedVariants.length})
              </button>
            )}
            {variants
              .filter((v) => v.id !== 'base' && v.loaded)
              .map((v) => {
                const isExclusive = normalized.length === 1 && normalized[0].id === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => selectSingleAiPolicyVariant(v.id)}
                    className={`px-2 py-1 rounded border text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
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
                      : 'bg-[#0c1017]/60 border-white/5 opacity-65'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs mb-1">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white truncate">{info.label}</span>
                        {info.loaded ? (
                          <span className="text-[10px] font-telemetry text-emerald-400 whitespace-nowrap">
                            Loaded{info.hiddenDim ? ` · ${info.hiddenDim}h` : ''}
                            {meanSpeed !== null ? ` · ~${meanSpeed} km/h` : ''}
                          </span>
                        ) : (
                          <span className="text-[10px] font-telemetry text-amber-400/90 whitespace-nowrap">
                            Untrained / Missing
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
                        className="w-12 px-1.5 py-0.5 rounded bg-[#090c12] border border-white/15 text-right font-telemetry text-[11px] text-white disabled:opacity-40 focus:outline-none focus:border-sky-400"
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
        </div>
      )}
    </div>
  );
}
