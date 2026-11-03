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
    dialogueState: String(value),
    speechStatus: context.speechStatus ?? 'idle',
    noInputCount: context.noInputCount ?? 0,
    errorMessage: context.errorMessage,
    recipe: context.recipe
      ? {
          id: context.recipe.id,
          title: context.recipe.title,
          currentStepIndex: context.currentStepIndex ?? 0,
          totalSteps: context.recipe.steps?.length ?? 0,
          prepBatchIndex: context.prepBatchIndex ?? 0,
        }
      : null,
    activeTimers: context.activeTimers ?? [],
    lastSpokenUtterance: context.lastSpokenUtterance,
    latestAsr: topAsr
      ? {
          utterance: topAsr.utterance,
          confidence: topAsr.confidence,
        }
      : null,
    lastResolvedAct: context.lastResolvedAct ?? null,
    lastResolvedEntities: context.lastResolvedEntities ?? null,
    messages: context.messages ?? [],
  };
}
