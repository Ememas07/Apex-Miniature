/**
 * AI Control & Pathfinding module
 */
export {
  computeAIControl,
  getDifficultyMultiplier,
  resolveTuningConfig,
  TUNING_BOUNDS,
  GLOBAL_TUNING_CONFIG,
  ACTIVE_TUNING_CONFIG,
} from './physics';

export {
  computeNeuralAIControl,
  buildObservationVector,
  evaluateNeuralPolicy,
  evaluateBlendedNeuralPolicy,
  mapDifficultyToSkillTarget,
  validatePolicyWeights,
  getAiPolicyVariants,
  getActiveAiPolicyMix,
  setActiveAiPolicyMix,
  selectSingleAiPolicyVariant,
  subscribeAiPolicyMix,
  getNormalizedPolicyMix,
  AI_POLICY_VARIANT_IDS,
  DEFAULT_POLICY_MIX,
  AI_POLICY_WEIGHTS,
} from './aiNeuralPolicy';

export type {
  AiPolicyVariantId,
  AiPolicyMixWeights,
  AiPolicyVariantInfo,
  PolicyWeights,
} from './aiNeuralPolicy';
