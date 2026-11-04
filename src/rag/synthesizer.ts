import { createChatCompletion } from '../llm';
import prompts from '../prompts';
import { DEFAULT_SEARCH_LIMIT, EMPTY_QUERY_FALLBACK, RAG_TEMPERATURE } from './constants';
import { queryCulinaryKnowledge } from './retrieval';
import type { RagCategory, SynthesizeRagOptions } from './types';

/**
 * synthesizes concise, spoken culinary advice grounded in retrieved Qdrant knowledge
 */
export const synthesizeCulinaryAdvice = async (
  query: string,
  category?: RagCategory,
  options?: SynthesizeRagOptions,
): Promise<string> => {
  const trimmed = query.trim();
  if (!trimmed) {
    return EMPTY_QUERY_FALLBACK;
  }

  let contextText = '';
  try {
    const searchResult = await queryCulinaryKnowledge(trimmed, {
      category,
      limit: options?.limit ?? DEFAULT_SEARCH_LIMIT,
    });
    if (!searchResult.startsWith('No matching culinary advice found')) {
      contextText = searchResult;
    }
  } catch (error) {
    // fail gracefully when Qdrant is offline or unreachable
    console.warn('[RAG] Retrieval fallback:', error);
  }

  const historyMessages =
    options?.recentMessages?.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })) ?? [];

  const contextSections = [
    options?.stepContext ? `Current Step: ${options.stepContext}` : '',
    contextText ? `Context:\n${contextText}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const userContent = contextSections
    ? `${contextSections}\n\nQuestion: ${trimmed}`
    : `Question: ${trimmed}`;

  const { content } = await createChatCompletion({
    callName: 'rag-synthesis',
    client: options?.client,
    model: options?.model,
    messages: [
      { role: 'system', content: prompts.systemRAG },
      ...historyMessages,
      { role: 'user', content: userContent },
    ],
    temperature: RAG_TEMPERATURE,
  });

  return content || "I don't have advice on that in my culinary guides.";
};
