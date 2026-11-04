import type OpenAI from 'openai';
import type { DIALOGUE_ACTS } from './constants';

/**
 * conversational message format for prior dialogue history context.
 */
export interface ParserChatMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

/**
 * options for semantic parsing specifying an optional LLM client, model, and dialogue context.
 */
export interface ParserOptions {
  readonly client?: OpenAI;
  readonly model?: string;
  readonly recentMessages?: readonly ParserChatMessage[];
  readonly currentState?: string;
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
  readonly ingredient?: string;
  readonly stepNumber?: number;
  readonly query?: string;
  readonly durationSeconds?: number;
  readonly timerLabel?: string;
}

/**
 * structured result returned by the semantic parser after parsing recognized speech.
 */
export interface SemanticParseResult {
  readonly act: DialogueAct;
  readonly entities?: Entities;
  readonly utterance: string;
}
