import { getLlmUsageHistory, getLlmUsageSummary } from '../llm';
import { calculateRemainingSeconds } from '../timers';
import { INGREDIENTS_PER_PREP_BATCH } from './constants';
import type { CookingContext } from './types';

export interface DebugReportOptions {
  value: unknown;
  context: CookingContext;
}

/**
 * pure helper compiling dialogue machine snapshot and conversation history into structured debug logs
 */
export function buildDebugReport({ value, context }: DebugReportOptions) {
  const topAsr = context.lastResult?.[0];

  return {
    exportedAt: new Date().toISOString(),
    dialogueState: typeof value === 'string' ? value : JSON.stringify(value),
    speechStatus: context.speechStatus ?? 'idle',
    noInputCount: context.noInputCount ?? 0,
    debugNoInput: context.debugNoInput ?? 0,
    silentNoInput: Boolean(context.silentNoInput),
    lastNoInputAt: context.lastNoInputAt ?? null,
    errorMessage: context.errorMessage ?? null,
    recipe: context.recipe
      ? {
          id: context.recipe.id,
          title: context.recipe.title,
          currentStepIndex: context.currentStepIndex ?? 0,
          currentStepText: context.recipe.steps?.[context.currentStepIndex]?.instruction ?? null,
          totalSteps: context.recipe.steps?.length ?? 0,
          prepBatchIndex: context.prepBatchIndex ?? 0,
          totalPrepBatches: Math.ceil(
            (context.recipe.ingredients?.length ?? 0) / INGREDIENTS_PER_PREP_BATCH,
          ),
        }
      : null,
    recipeCandidates: context.recipeCandidates ?? null,
    knowledgeQuery: context.knowledgeQuery ?? null,
    knowledgeCategory: context.knowledgeCategory ?? null,
    returnState: context.returnState ?? null,
    activeTimers: (context.activeTimers ?? []).map((timer) => ({
      ...timer,
      remainingSeconds: calculateRemainingSeconds(timer.targetTimestamp),
    })),
    lastSpokenUtterance: context.lastSpokenUtterance ?? null,
    latestAsr: topAsr
      ? {
          utterance: topAsr.utterance,
          confidence: topAsr.confidence,
        }
      : null,
    lastResolvedAct: context.lastResolvedAct ?? null,
    lastResolvedEntities: context.lastResolvedEntities ?? null,
    llmUsage: {
      summary: getLlmUsageSummary(),
      history: getLlmUsageHistory(),
    },
    // strip internal barge-in tracking metadata from exported debug messages
    messages: (context.messages ?? []).map(({ bargeIn: _, ...msg }) => msg),
  };
}
