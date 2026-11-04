import type OpenAI from 'openai';

import type { LlmUsageRecord, LlmUsageSummary } from './types';

let usageHistory: readonly LlmUsageRecord[] = [];

/**
 * aggregates token consumption metrics across a list of usage records using pure functional reduction
 */
export const calculateUsageSummary = (history: readonly LlmUsageRecord[]): LlmUsageSummary => {
  return history.reduce<LlmUsageSummary>(
    (acc, item) => ({
      totalCalls: acc.totalCalls + 1,
      totalPromptTokens: acc.totalPromptTokens + item.promptTokens,
      totalCompletionTokens: acc.totalCompletionTokens + item.completionTokens,
      totalTokens: acc.totalTokens + item.totalTokens,
    }),
    { totalCalls: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0 },
  );
};

/**
 * records token usage for an LLM completion, outputs debug logs to console, and retains session history
 */
export const recordLlmUsage = (
  call: string,
  model: string,
  usage?: OpenAI.Completions.CompletionUsage | null,
): LlmUsageRecord => {
  const record: LlmUsageRecord = {
    call,
    model,
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
    totalTokens: usage?.total_tokens ?? 0,
    timestamp: new Date().toISOString(),
  };

  usageHistory = [...usageHistory, record];

  console.debug('[LLM Usage]', {
    call: record.call,
    model: record.model,
    promptTokens: record.promptTokens,
    completionTokens: record.completionTokens,
    totalTokens: record.totalTokens,
  });

  return record;
};

/**
 * returns the full history of recorded LLM completion usage records in the current session
 */
export const getLlmUsageHistory = (): readonly LlmUsageRecord[] => {
  return usageHistory;
};

/**
 * aggregates token metrics across all recorded LLM calls in the current session
 */
export const getLlmUsageSummary = (): LlmUsageSummary => {
  return calculateUsageSummary(usageHistory);
};

/**
 * resets all recorded LLM token usage records
 */
export const resetLlmUsageHistory = (): void => {
  usageHistory = [];
};
