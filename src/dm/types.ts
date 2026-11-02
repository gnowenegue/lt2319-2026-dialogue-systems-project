import type { Hypothesis, SpeechStateExternalEvent } from 'speechstate';
import type { AnyActorRef } from 'xstate';

import type { ROLES } from '../constants';
import type { NormalizedRecipe } from '../recipes/types';
import type { DialogueAct } from '../semantic-parser/types';

/**
 * conversational message role
 */
export type MessageRole = (typeof ROLES)[keyof typeof ROLES];

/**
 * conversational message structure
 */
export interface Message {
  role: MessageRole;
  content: string;
}

/**
 * dialogue manager session context tracking active recipe and procedural execution progress
 */
export interface CookingContext {
  /**
   * active SpeechState actor reference for ASR / TTS
   */
  spstRef?: AnyActorRef | null;
  /**
   * active normalized recipe being prepared and cooked
   */
  recipe: NormalizedRecipe | null;
  /**
   * 0-indexed batch pointer into `recipe.ingredients` during mise en place prep
   */
  prepBatchIndex: number;
  /**
   * 0-indexed step pointer into `recipe.steps` during active cooking
   */
  currentStepIndex: number;
  /**
   * most recent utterance synthesized and spoken by the copilot
   */
  lastSpokenUtterance: string | null;
  /**
   * most recent speech recognition hypotheses received from ASR
   */
  lastResult: Hypothesis[] | null;
  /**
   * conversation history for multi-turn conversational repairs and context
   */
  messages: Message[];
  /**
   * count of consecutive turns with no user input
   */
  noInputCount: number;
  /**
   * descriptive error message when recipe fetch or action fails
   */
  errorMessage: string | null;
}

/**
 * events processed by the cooking state machine
 */
export type CookingEvent =
  | { type: 'START' }
  | { type: 'CLICK' }
  | { type: 'SEARCH_RECIPE'; query: string }
  | { type: 'AFFIRM' }
  | { type: 'DENY' }
  | { type: 'NEXT_STEP' }
  | { type: 'PREVIOUS_STEP' }
  | { type: 'REPEAT_STEP' }
  | { type: 'GOTO_STEP'; stepNumber: number }
  | { type: 'QUERY_INGREDIENT'; ingredient?: string }
  | { type: 'SKIP_PREP' }
  | { type: 'SPEAK_COMPLETE' }
  | { type: 'ASRTTS_READY' }
  | { type: 'ASR_NOINPUT' }
  | { type: 'LISTEN_COMPLETE' }
  | { type: 'RECOGNISED'; value: Hypothesis[] }
  | { type: 'ACT_RESOLVED'; act: DialogueAct; entities?: Record<string, unknown> }
  | SpeechStateExternalEvent;
