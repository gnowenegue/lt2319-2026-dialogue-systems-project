import type OpenAI from 'openai';

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

/**
 * configuration options for initializing an OpenAI-compatible client
 */
export interface LlmClientConfig {
  readonly apiKey?: string;
  readonly baseURL?: string;
}

/**
 * parameters for executing chat completions with automatic usage tracking
 */
export interface ChatCompletionOptions {
  readonly callName: string;
  readonly messages: readonly OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  readonly client?: OpenAI;
  readonly model?: string;
  readonly temperature?: number;
  readonly responseFormat?: OpenAI.Chat.Completions.ChatCompletionCreateParams['response_format'];
}

/**
 * result payload returned by a chat completion call
 */
export interface ChatCompletionResult {
  readonly content: string;
  readonly completion: OpenAI.Chat.Completions.ChatCompletion;
}
