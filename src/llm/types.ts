/**
 * token consumption and performance metadata recorded for an LLM completion
 */
export interface LlmUsageRecord {
  readonly call: string;
  readonly model: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly timestamp: string;
}

/**
 * aggregated token consumption metrics across all LLM completions in the session
 */
export interface LlmUsageSummary {
  readonly totalCalls: number;
  readonly totalPromptTokens: number;
  readonly totalCompletionTokens: number;
  readonly totalTokens: number;
}
