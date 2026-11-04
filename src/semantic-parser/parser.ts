import { createChatCompletion } from '../llm';
import prompts from '../prompts';
import {
  ACTS_REQUIRING_QUERY,
  DIALOGUE_ACTS,
  SEMANTIC_PARSER_TEMPERATURE,
  STATE_EXPECTED_ACTS,
} from './constants';
import type {
  DialogueAct,
  Entities,
  ParserChatMessage,
  ParserOptions,
  SemanticParseResult,
} from './types';

/**
 * runtime type guard validating whether a value matches a supported `DialogueAct`.
 */
export const isDialogueAct = (act: unknown): act is DialogueAct =>
  typeof act === 'string' && (DIALOGUE_ACTS as readonly string[]).includes(act);

/**
 * constructs the user prompt payload conditioned with prior conversation history and active state hints.
 */
export const buildUserPrompt = (
  utterance: string,
  recentMessages?: readonly ParserChatMessage[],
  currentState?: string,
): string => {
  // format recent conversation history as context for the target utterance
  const contextPrefix = recentMessages?.length
    ? `Recent conversation context:\n${recentMessages
        .map((msg) => `${msg.role === 'assistant' ? 'Assistant' : 'User'}: ${msg.content}`)
        .join('\n')}\n\n`
    : '';

  // condition parsing with active dialogue state phase hint when available
  const expectedActs = currentState ? STATE_EXPECTED_ACTS[currentState] : undefined;
  const stateHint = currentState
    ? `Active dialogue phase: ${currentState}${
        expectedActs ? ` (likely intents: ${expectedActs.join(', ')})` : ''
      }\n\n`
    : '';

  return `${contextPrefix}${stateHint}Target utterance to parse:\n"${utterance}"`;
};

// helper parsing functions for entity sanitization
const parseNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : undefined;
  }
  return undefined;
};

const parseString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

/**
 * extracts and parses a JSON payload safely from model output, handling optional markdown formatting.
 */
export const extractJsonPayload = (content: string): Record<string, unknown> => {
  const trimmed = content.trim();
  if (!trimmed) return {};

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return {};

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/**
 * cleans and sanitizes raw extracted entity slots, omitting undefined properties.
 */
export const cleanEntities = (rawEntities: unknown): Entities | undefined => {
  if (typeof rawEntities !== 'object' || rawEntities === null) {
    return undefined;
  }

  const record = rawEntities as Record<string, unknown>;

  const candidate: Entities = {
    ingredient: parseString(record.ingredient),
    stepNumber: parseNumber(record.stepNumber),
    query: parseString(record.query),
    durationSeconds: parseNumber(record.durationSeconds),
    timerLabel: parseString(record.timerLabel),
  };

  // eliminate undefined properties to ensure compact output
  const definedEntries = Object.entries(candidate).filter(
    ([, value]) => value !== undefined,
  ) as Array<[keyof Entities, Entities[keyof Entities]]>;

  return definedEntries.length > 0 ? (Object.fromEntries(definedEntries) as Entities) : undefined;
};

/**
 * ensures fallback query entity is populated for intent categories requiring contextual text.
 */
export const normalizeParseResult = (
  rawAct: DialogueAct,
  rawEntities: Entities | undefined,
  utterance: string,
): { act: DialogueAct; entities?: Entities } => {
  const requiresQuery = ACTS_REQUIRING_QUERY.includes(rawAct);
  const shouldSynthesizeQuery = requiresQuery && !rawEntities?.query;

  const entities = shouldSynthesizeQuery ? { ...rawEntities, query: utterance } : rawEntities;

  return { act: rawAct, ...(entities ? { entities } : {}) };
};

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

  try {
    const userContent = buildUserPrompt(trimmed, options.recentMessages, options.currentState);

    const { content } = await createChatCompletion({
      callName: 'semantic-parser',
      client: options.client,
      model: options.model,
      messages: [
        { role: 'system', content: prompts.semanticParser },
        { role: 'user', content: userContent },
      ],
      responseFormat: { type: 'json_object' },
      temperature: SEMANTIC_PARSER_TEMPERATURE,
    });

    const payload = extractJsonPayload(content);

    const rawAct = isDialogueAct(payload.act) ? payload.act : 'UNKNOWN';
    const cleanedEntities = cleanEntities(payload.entities);
    const { act, entities } = normalizeParseResult(rawAct, cleanedEntities, trimmed);

    return {
      act,
      entities,
      utterance: trimmed,
    };
  } catch (error) {
    console.error('[SemanticParser] Parse error:', error);
    return { act: 'UNKNOWN', utterance: trimmed };
  }
};
