import type OpenAI from 'openai';
import type { Hypothesis, SpeechStateExternalEvent } from 'speechstate';
import type { AnyActorRef } from 'xstate';

import type { ROLES } from '../constants';
import type { RagCategory } from '../rag/types';
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
  bargeIn?: boolean;
}

/**
 * input parameters for culinary knowledge retrieval and advice synthesis
 */
export interface QueryKnowledgeInput {
  query: string;
  category?: RagCategory;
  recentMessages?: readonly { role: 'user' | 'assistant'; content: string }[];
  /**
   * active recipe and step context to ground situational cooking advice
   */
  stepContext?: string;
}

/**
 * input parameters for answering factual questions about the active cooking step
 */
export interface QueryStepDetailInput {
  query: string;
  instruction?: string;
  stepNumber?: number;
  recipeTitle?: string;
  client?: OpenAI;
  model?: string;
}

/**
 * candidate recipe option presented during multi-match recipe discovery
 */
export interface RecipeCandidate {
  id: string;
  title: string;
  index: number;
}

/**
 * search result returned by recipe discovery actor
 */
export type SearchRecipeOutput =
  | NormalizedRecipe
  | { kind: 'single'; recipe: NormalizedRecipe }
  | { kind: 'multiple'; candidates: readonly RecipeCandidate[] };

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
   * candidate recipe options discovered during search pending user selection
   */
  recipeCandidates?: readonly RecipeCandidate[] | null;
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
   * flag indicating if the most recent user utterance was a barge-in
   */
  lastBargeIn?: boolean;
  /**
   * conversation history for multi-turn conversational repairs and context
   */
  messages: Message[];
  /**
   * count of consecutive audible reprompts triggered by silence timeouts
   */
  noInputCount: number;
  /**
   * count of consecutive no-input timeout events, including silent timeouts during prep and cooking
   */
  debugNoInput?: number;
  /**
   * ISO 8601 timestamp of when speechstate most recently triggered ASR_NOINPUT
   */
  lastNoInputAt?: string | null;
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
  /**
   * flag indicating a silent no-input timeout occurred during hands-busy cooking or prep
   */
  silentNoInput?: boolean;
  /**
   * recipe ID of the user-selected candidate to be refined and loaded
   */
  selectedCandidateId?: string | null;
  /**
   * pending culinary query for RAG retrieval and advice synthesis
   */
  knowledgeQuery?: string | null;
  /**
   * category constraint for culinary RAG lookup
   */
  knowledgeCategory?: RagCategory | null;
  /**
   * dialogue state to return to once knowledge response finishes speaking
   */
  returnState?:
    | 'WaitingForStepCommand'
    | 'WaitingForPrepConfirmation'
    | 'ConfirmRecipe'
    | 'SelectingRecipe'
    | 'PromptRecipe'
    | 'Idle'
    | 'Completed'
    | null;
}

/**
 * events processed by the cooking state machine
 */
export type CookingEvent =
  | { type: 'START' }
  | { type: 'CLICK' }
  | { type: 'SEARCH_RECIPE'; query: string }
  | { type: 'SELECT_RECIPE'; index?: number; query?: string }
  | { type: 'AFFIRM' }
  | { type: 'DENY' }
  | { type: 'NEXT_STEP' }
  | { type: 'PREVIOUS_STEP' }
  | { type: 'REPEAT_STEP' }
  | { type: 'GOTO_STEP'; stepNumber: number }
  | { type: 'QUERY_INGREDIENT'; ingredient?: string }
  | { type: 'QUERY_STEP_DETAIL'; query: string; stepNumber?: number }
  | { type: 'INQUIRE_TECHNIQUE'; query: string }
  | { type: 'INQUIRE_SUBSTITUTION'; ingredient?: string; query: string }
  | { type: 'SET_TIMER'; durationSeconds: number; label?: string }
  | { type: 'CHECK_TIMER'; label?: string }
  | { type: 'CANCEL_TIMER'; label?: string; id?: string }
  | { type: 'TIMER_EXPIRED'; id: string; label: string }
  | { type: 'TIMERS_UPDATED'; timers: readonly ActiveTimer[] }
  | { type: 'SKIP_PREP' }
  | { type: 'WAKE_WORD'; modelName?: string; score?: number }
  | { type: 'PTT_TRIGGER' }
  | { type: 'SPEAK_COMPLETE' }
  | { type: 'ASRTTS_READY' }
  | { type: 'ASR_NOINPUT' }
  | { type: 'LISTEN_COMPLETE' }
  | { type: 'RECOGNISED'; value: Hypothesis[]; bargeIn?: boolean }
  | { type: 'UNKNOWN' }
  | { type: 'HELP' }
  | { type: 'GREETING' }
  | { type: 'ACT_RESOLVED'; act: DialogueAct; entities?: Record<string, unknown> }
  | SpeechStateExternalEvent;
