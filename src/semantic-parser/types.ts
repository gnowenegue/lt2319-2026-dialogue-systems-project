import type OpenAI from 'openai';
import type { DIALOGUE_ACTS } from './constants';

/**
 * options for semantic parsing specifying an optional LLM client and model identifier
 */
export interface ParserOptions {
  client?: OpenAI;
  model?: string;
  recentMessages?: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>;
  currentState?: string;
}

/**
 * supported dialogue acts representing the user's communicative intent.
 * derived dynamically from the canonical `DIALOGUE_ACTS` array to guarantee a single source of truth.
 */
export type DialogueAct = (typeof DIALOGUE_ACTS)[number];

/**
 * semantic entities extracted from the user's speech utterance.
 * all slots are optional to keep LLM responses compact and eliminate empty null fields.
 */
export interface Entities {
  ingredient?: string;
  stepNumber?: number;
  query?: string;
  durationSeconds?: number;
  timerLabel?: string;
}

/**
 * structured result returned by the semantic parser after parsing recognized speech
 */
export interface SemanticParseResult {
  act: DialogueAct;
  entities?: Entities;
  utterance: string;
}
