import type { Hypothesis, SpeechStateExternalEvent } from 'speechstate';
import type { AnyActorRef } from 'xstate';

import type { ROLES } from '../constants';
import type { NormalizedRecipe } from '../recipes/types';
import type { DialogueAct } from '../semantic-parser/types';
import type { ActiveTimer } from '../timers/types';

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
  act?: DialogueAct;
  timestamp?: string;
}

/**
 * current speech processing and microphone activity status
 */
export type SpeechStatus = 'idle' | 'listening' | 'speaking' | 'processing' | 'paused';

/**
 * dialogue manager session context tracking active recipe and procedural execution progress
 */
export interface CookingContext {
  /**
   * active SpeechState actor reference for ASR / TTS
   */
  spstRef?: AnyActorRef | null;
  /**
   * active child actor reference for background kitchen timers
   */
  timerRef?: AnyActorRef | null;
  /**
   * active kitchen timers synced via push events
   */
  activeTimers: readonly ActiveTimer[];
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
  /**
   * current mic and speech synthesis activity state
   */
  speechStatus?: SpeechStatus;
  /**
   * pending utterance buffered until recognizer teardown completes
   */
  pendingUtterance?: string | null;
  /**
   * most recently resolved semantic dialogue act
   */
  lastResolvedAct?: DialogueAct | null;
  /**
   * entities extracted by semantic parser for the latest dialogue act
   */
  lastResolvedEntities?: Record<string, unknown> | null;
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
  | { type: 'SET_TIMER'; durationSeconds: number; label?: string }
  | { type: 'CHECK_TIMER'; label?: string }
  | { type: 'CANCEL_TIMER'; label?: string; id?: string }
  | { type: 'TIMER_EXPIRED'; id: string; label: string }
  | { type: 'TIMERS_UPDATED'; timers: readonly ActiveTimer[] }
  | { type: 'SKIP_PREP' }
  | { type: 'SPEAK_COMPLETE' }
  | { type: 'ASRTTS_READY' }
  | { type: 'ASR_NOINPUT' }
  | { type: 'LISTEN_COMPLETE' }
  | { type: 'RECOGNISED'; value: Hypothesis[] }
  | { type: 'UNKNOWN' }
  | { type: 'HELP' }
  | { type: 'GREETING' }
  | { type: 'ACT_RESOLVED'; act: DialogueAct; entities?: Record<string, unknown> }
  | SpeechStateExternalEvent;
