/**
 * AI Control & Pathfinding module
 */
export {
  computeAIControl,
  computeUpdatedAdaptiveBoost,
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
  mapDifficultyToSkillTarget,
  AI_POLICY_WEIGHTS,
} from './aiNeuralPolicy';
