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
  AI_POLICY_CLASS_IDS,
  DEFAULT_POLICY_MIX,
  AI_POLICY_WEIGHTS,
  getClassPolicyFilename,
  getClassPolicyVariants,
  getClassPolicyWeights,
  setClassPolicyWeights,
  getPerClassPoliciesEnabled,
  setPerClassPoliciesEnabled,
  subscribePerClassPolicies,
  subscribePolicyRegistry,
  preloadAllBinaryPolicies,
} from './aiNeuralPolicy';

export type {
  AiPolicyVariantId,
  AiPolicyMixWeights,
  AiPolicyVariantInfo,
  AiClassPolicyInfo,
  PolicyPedalMode,
  PolicyWeights,
  PolicyObsNorm,
  PolicyObsConfig,
} from './aiNeuralPolicy';
