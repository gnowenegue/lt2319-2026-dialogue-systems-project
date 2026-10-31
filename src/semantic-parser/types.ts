import type { DIALOGUE_ACTS } from './constants';

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
  candidateSubstitute?: string;
  stepNumber?: number;
  minutes?: number;
  seconds?: number;
  timerLabel?: string;
  technique?: string;
  recipeQuery?: string;
  selectionIndex?: number;
  queryType?: 'quantity' | 'presence' | 'list' | 'method';
}

/**
 * structured result returned by the semantic extractor after parsing recognized speech
 */
export interface SemanticParseResult {
  act: DialogueAct;
  entities?: Entities;
  confidence?: number;
  utterance: string;
}

/**
 * dialogue act event sent directly to the XState dialogue manager
 */
export type DialogueActEvent = {
  type: DialogueAct;
} & Entities;
