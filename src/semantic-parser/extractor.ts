import type OpenAI from 'openai';
import prompts from '../prompts';
import { SEMANTIC_PARSER_TEMPERATURE } from './constants';
import type { SemanticParseResult } from './types';

/**
 * options for semantic extraction specifying the LLM client and model identifier.
 */
export interface ExtractorOptions {
  client: OpenAI;
  model: string;
}

/**
 * extracts structured dialogue act and entities from recognized speech using Groq.
 * parses JSON directly with graceful fallback to `UNKNOWN` on error or empty input.
 */
export const extractDialogueActAndEntities = async (
  utterance: string,
  options: ExtractorOptions,
): Promise<SemanticParseResult> => {
  const trimmed = utterance.trim();
  if (!trimmed) {
    return { act: 'UNKNOWN', utterance: '' };
  }

  try {
    const completion = await options.client.chat.completions.create({
      model: options.model,
      messages: [
        { role: 'system', content: prompts.semanticParser },
        { role: 'user', content: trimmed },
      ],
      response_format: { type: 'json_object' },
      temperature: SEMANTIC_PARSER_TEMPERATURE,
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
    return {
      act: parsed.act || 'UNKNOWN',
      entities: parsed.entities,
      utterance: trimmed,
    };
  } catch (error) {
    console.error('[SemanticParser] Extraction error:', error);
    return { act: 'UNKNOWN', utterance: trimmed };
  }
};
