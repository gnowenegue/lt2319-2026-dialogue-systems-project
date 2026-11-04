import { ACTIVE_LLM_MODEL, openai, recordLlmUsage } from '../llm';
import prompts from '../prompts';
import { DIALOGUE_ACTS, SEMANTIC_PARSER_TEMPERATURE, STATE_EXPECTED_ACTS } from './constants';
import type { DialogueAct, Entities, ParserOptions, SemanticParseResult } from './types';

/**
 * ensures fallback entity properties are populated for structured dialogue acts
 */
export const normalizeParseResult = (
  rawAct: DialogueAct,
  rawEntities: Entities | undefined,
  utterance: string,
): { act: DialogueAct; entities?: Entities } => {
  let entities = rawEntities;

  // populate query with full utterance if model omitted it for question or search acts
  if (
    (rawAct === 'INQUIRE_SUBSTITUTION' ||
      rawAct === 'INQUIRE_TECHNIQUE' ||
      rawAct === 'SEARCH_RECIPE' ||
      rawAct === 'QUERY_STEP_DETAIL') &&
    !entities?.query
  ) {
    entities = { ...entities, query: utterance };
  }

  return { act: rawAct, entities };
};

/**
 * runtime type guard validating whether a value matches a supported `DialogueAct`
 */
export const isDialogueAct = (act: unknown): act is DialogueAct =>
  typeof act === 'string' && (DIALOGUE_ACTS as readonly string[]).includes(act);

/**
 * parses structured dialogue act and entities from recognized speech using Groq.
 * parses JSON directly with graceful fallback to `UNKNOWN` on error or empty input.
 */
export const parseUtterance = async (
  utterance: string,
  options: ParserOptions = {},
): Promise<SemanticParseResult> => {
  const trimmed = utterance.trim();
  if (!trimmed) {
    return { act: 'UNKNOWN', utterance: '' };
  }

  const client = options.client ?? openai;
  const model = options.model ?? ACTIVE_LLM_MODEL;

  try {
    // format recent conversation history as context for the target utterance
    const contextPrefix = options.recentMessages?.length
      ? `Recent conversation context:\n${options.recentMessages
          .map((msg) => `${msg.role === 'assistant' ? 'Assistant' : 'User'}: ${msg.content}`)
          .join('\n')}\n\n`
      : '';

    // condition parsing with active dialogue state phase hint when available
    const expectedActs = options.currentState
      ? STATE_EXPECTED_ACTS[options.currentState]
      : undefined;
    const stateHint = options.currentState
      ? `Active dialogue phase: ${options.currentState}${
          expectedActs ? ` (likely intents: ${expectedActs.join(', ')})` : ''
        }\n\n`
      : '';

    const userContent = `${contextPrefix}${stateHint}Target utterance to parse:\n"${trimmed}"`;

    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: prompts.semanticParser },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      temperature: SEMANTIC_PARSER_TEMPERATURE,
    });

    recordLlmUsage('semantic-parser', model, completion.usage);

    const content = completion.choices[0]?.message?.content ?? '{}';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    const rawAct = isDialogueAct(parsed.act) ? parsed.act : 'UNKNOWN';
    const rawEntities =
      typeof parsed.entities === 'object' && parsed.entities !== null ? parsed.entities : undefined;

    const parsedEntities: Entities | undefined = rawEntities
      ? {
          ingredient:
            typeof rawEntities.ingredient === 'string' ? rawEntities.ingredient.trim() : undefined,
          stepNumber:
            rawEntities.stepNumber !== undefined && !Number.isNaN(Number(rawEntities.stepNumber))
              ? Number(rawEntities.stepNumber)
              : undefined,
          query: typeof rawEntities.query === 'string' ? rawEntities.query.trim() : undefined,
          durationSeconds:
            rawEntities.durationSeconds !== undefined &&
            !Number.isNaN(Number(rawEntities.durationSeconds))
              ? Number(rawEntities.durationSeconds)
              : undefined,
          timerLabel:
            typeof rawEntities.timerLabel === 'string' ? rawEntities.timerLabel.trim() : undefined,
        }
      : undefined;

    const { act, entities } = normalizeParseResult(rawAct, parsedEntities, trimmed);

    return {
      act,
      entities,
      utterance: trimmed,
    };
  } catch (error) {
    console.error('[SemanticParser] Parse error:', error);
    const { act, entities } = normalizeParseResult('UNKNOWN', undefined, trimmed);
    return { act, entities, utterance: trimmed };
  }
};
