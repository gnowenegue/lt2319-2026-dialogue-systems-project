import type OpenAI from 'openai';

import { ACTIVE_LLM_MODEL, openai } from './client';
import type { ChatCompletionOptions, ChatCompletionResult } from './types';
import { recordLlmUsage } from './usage';

/**
 * executes an OpenAI chat completion call with automatic client defaulting and session token usage tracking
 */
export const createChatCompletion = async (
  options: ChatCompletionOptions,
): Promise<ChatCompletionResult> => {
  const client = options.client ?? openai;
  const model = options.model ?? ACTIVE_LLM_MODEL;

  const completion = await client.chat.completions.create({
    model,
    messages: options.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    temperature: options.temperature,
    response_format: options.responseFormat,
  });

  recordLlmUsage(options.callName, model, completion.usage);

  return {
    content: completion.choices[0]?.message?.content?.trim() ?? '',
    completion,
  };
};
