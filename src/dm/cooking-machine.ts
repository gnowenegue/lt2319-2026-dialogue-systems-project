import { speechstate } from 'speechstate';
import { assign, setup } from 'xstate';

import { settings } from '../configs';
import { ROLES } from '../constants';
import prompts from '../prompts';
import { timerActorLogic } from '../timers';
import { handleRecognised, speechActions } from './actions';
import { fetchRecipeLogic } from './actors';
import { cookingGuards } from './guards';
import {
  formatCheckTimerUtterance,
  formatDurationForSpeech,
  formatPrepBatchUtterance,
  formatStepUtterance,
  lookupIngredient,
} from './helpers';
import type { CookingContext, CookingEvent, Message, SpeechStatus } from './types';

export { fetchRecipeLogic };

/**
 * pure helper returning updated assistant spoken utterance, active speaking state, and appended messages
 */
function prepareAssistantSpeech(
  context: CookingContext,
  text: string,
): { lastSpokenUtterance: string; speechStatus: SpeechStatus; messages: Message[] } {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return {
    lastSpokenUtterance: text,
    speechStatus: 'speaking',
    messages: text
      ? [
          ...context.messages,
          {
            role: ROLES.Assistant,
            content: text,
            timestamp,
          },
        ]
      : context.messages,
  };
}

/**
 * procedural cooking state machine coordinating recipe discovery, paced ingredient prep,
 * and step-by-step cooking navigation.
 */
export const cookingMachine = setup({
  types: {
    context: {} as CookingContext,
    events: {} as CookingEvent,
  },
  actions: {
    ...speechActions,
    handleRecognised,
  },
  actors: {
    fetchRecipeActor: fetchRecipeLogic,
    speechstateActor: speechstate,
    timerActor: timerActorLogic,
  },
  guards: cookingGuards,
}).createMachine({
  id: 'CookingCopilot',
  initial: 'Idle',
  context: ({ spawn }) => ({
    recipe: null,
    prepBatchIndex: 0,
    currentStepIndex: 0,
    lastSpokenUtterance: null,
    lastResult: null,
    messages: [
      {
        role: ROLES.System,
        content: prompts.systemDefault,
      },
    ],
    noInputCount: 0,
    errorMessage: null,
    spstRef: spawn('speechstateActor', { input: settings }),
    timerRef: spawn('timerActor'),
    activeTimers: [],
    speechStatus: 'idle',
    pendingUtterance: null,
    lastResolvedAct: null,
    lastResolvedEntities: null,
  }),
  on: {
    RECOGNISED: {
      actions: [
        assign(({ context, event }) => {
          const userUtterance = event.value[0]?.utterance?.trim();
          const timestamp = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });
          return {
            lastResult: event.value,
            noInputCount: 0,
            pendingUtterance: null,
            speechStatus: 'processing',
            messages: userUtterance
              ? [
                  ...context.messages,
                  {
                    role: ROLES.User,
                    content: userUtterance,
                    timestamp,
                  },
                ]
              : context.messages,
          };
        }),
        'handleRecognised',
      ],
    },
    ACT_RESOLVED: {
      actions: assign(({ context, event }) => {
        const msgs = [...context.messages];
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === ROLES.User) {
            msgs[i] = { ...msgs[i], act: event.act };
            break;
          }
        }
        return {
          lastResolvedAct: event.act,
          lastResolvedEntities: event.entities ?? null,
          messages: msgs,
        };
      }),
    },
    ASR_NOINPUT: {
      guard: ({ context }) => context.noInputCount < prompts.noInput.length,
      actions: assign(({ context }) => {
        const idx = Math.min(context.noInputCount, prompts.noInput.length - 1);
        const text = prompts.noInput[idx];
        const nextCount = context.noInputCount + 1;
        return {
          noInputCount: nextCount,
          pendingUtterance: text,
        };
      }),
    },
    LISTEN_COMPLETE: {
      guard: ({ context }) => Boolean(context.pendingUtterance),
      actions: [
        assign(({ context }) => {
          const text = context.pendingUtterance ?? '';
          const isPaused = context.noInputCount >= prompts.noInput.length;
          const asst = prepareAssistantSpeech(context, text);
          return {
            ...asst,
            pendingUtterance: null,
            speechStatus: isPaused ? 'paused' : 'speaking',
          };
        }),
        {
          type: 'spst.speak',
          params: ({ context }) => {
            const isPaused = context.noInputCount >= prompts.noInput.length;
            return {
              utterance: context.lastSpokenUtterance ?? '',
              bargeIn: !isPaused,
            };
          },
        },
      ],
    },
    UNKNOWN: {
      actions: [
        assign(({ context }) => prepareAssistantSpeech(context, prompts.cannotHear)),
        {
          type: 'spst.speak',
          params: ({ context }) => ({
            utterance: context.lastSpokenUtterance ?? '',
          }),
        },
      ],
    },
    CLICK: [
      {
        guard: ({ context }) => context.noInputCount >= prompts.noInput.length,
        actions: [
          assign({ noInputCount: 0, pendingUtterance: null, speechStatus: 'listening' }),
          { type: 'spst.listen' },
        ],
      },
    ],
    TIMERS_UPDATED: {
      actions: assign({
        activeTimers: ({ event }) => event.timers,
      }),
    },
    TIMER_EXPIRED: {
      actions: [
        assign(({ context, event }) =>
          prepareAssistantSpeech(context, `Time's up! Your ${event.label} timer is done.`),
        ),
        {
          type: 'spst.speak',
          params: ({ context }) => ({
            utterance: context.lastSpokenUtterance ?? '',
          }),
        },
      ],
    },
    SET_TIMER: {
      actions: [
        ({ context, event }) => {
          if (context.timerRef) {
            const id = `timer-${Date.now()}`;
            const label = event.label?.trim() || 'cooking';
            context.timerRef.send({
              type: 'START_TIMER',
              id,
              label,
              durationSeconds: event.durationSeconds,
            });
          }
        },
        assign(({ context, event }) => {
          const label = event.label?.trim() || 'cooking';
          const duration = formatDurationForSpeech(event.durationSeconds);
          return prepareAssistantSpeech(context, `Started a ${duration} timer for ${label}.`);
        }),
        {
          type: 'spst.speak',
          params: ({ context }) => ({
            utterance: context.lastSpokenUtterance ?? '',
          }),
        },
      ],
    },
    CHECK_TIMER: {
      actions: [
        assign(({ context, event }) => {
          const matching = event.label
            ? context.activeTimers.filter((t) => t.label === event.label)
            : context.activeTimers;
          return prepareAssistantSpeech(context, formatCheckTimerUtterance(matching, event.label));
        }),
        {
          type: 'spst.speak',
          params: ({ context }) => ({
            utterance: context.lastSpokenUtterance ?? '',
          }),
        },
      ],
    },
    CANCEL_TIMER: {
      actions: [
        ({ context, event }) => {
          if (context.timerRef) {
            if (event.label || event.id) {
              context.timerRef.send({
                type: 'CANCEL_TIMER',
                id: event.id,
                label: event.label,
              });
            } else {
              context.timerRef.send({ type: 'RESET_TIMERS' });
            }
          }
        },
        assign(({ context, event }) => {
          const text = event.label?.trim()
            ? `Cancelled the ${event.label.trim()} timer.`
            : 'Cancelled all timers.';
          return prepareAssistantSpeech(context, text);
        }),
        {
          type: 'spst.speak',
          params: ({ context }) => ({
            utterance: context.lastSpokenUtterance ?? '',
          }),
        },
      ],
    },
    QUERY_INGREDIENT: {
      actions: [
        assign(({ context, event }) =>
          prepareAssistantSpeech(
            context,
            lookupIngredient(context.recipe?.ingredients ?? [], event.ingredient),
          ),
        ),
        {
          type: 'spst.speak',
          params: ({ context }) => ({
            utterance: context.lastSpokenUtterance ?? '',
          }),
        },
      ],
    },
    SEARCH_RECIPE: {
      target: '.FetchingRecipe',
    },
    HELP: {
      actions: [
        assign(({ context }) => prepareAssistantSpeech(context, prompts.help)),
        {
          type: 'spst.speak',
          params: ({ context }) => ({
            utterance: context.lastSpokenUtterance ?? '',
          }),
        },
      ],
    },
    GREETING: {
      actions: [
        assign(({ context }) => prepareAssistantSpeech(context, prompts.greeting)),
        {
          type: 'spst.speak',
          params: ({ context }) => ({
            utterance: context.lastSpokenUtterance ?? '',
          }),
        },
      ],
    },
  },
  states: {
    Idle: {
      on: {
        START: 'Prepare',
        CLICK: 'Prepare',
        ASR_NOINPUT: {},
        LISTEN_COMPLETE: {},
      },
    },

    Prepare: {
      entry: [assign({ speechStatus: 'processing' }), { type: 'spst.prepare' }],
      on: {
        ASRTTS_READY: 'PromptRecipe',
      },
    },

    PromptRecipe: {
      entry: [
        assign(({ context }) => ({
          ...prepareAssistantSpeech(context, prompts.promptRecipe),
          errorMessage: null,
        })),
        {
          type: 'spst.speak',
          params: ({ context }) => ({
            utterance: context.lastSpokenUtterance ?? '',
          }),
        },
      ],
      on: {
        SPEAK_COMPLETE: {
          guard: ({ context }) => context.noInputCount < prompts.noInput.length,
          actions: [assign({ speechStatus: 'listening' }), { type: 'spst.listen' }],
        },
        SEARCH_RECIPE: 'FetchingRecipe',
      },
    },

    FetchingRecipe: {
      entry: assign({ speechStatus: 'processing' }),
      invoke: {
        id: 'fetchRecipeActor',
        src: 'fetchRecipeActor',
        input: ({ event }) => ({
          query: event.type === 'SEARCH_RECIPE' ? event.query : '',
        }),
        onDone: {
          target: 'ConfirmRecipe',
          actions: assign({
            recipe: ({ event }) => event.output,
            prepBatchIndex: 0,
            currentStepIndex: 0,
            errorMessage: null,
          }),
        },
        onError: {
          target: 'PromptRecipe',
          actions: assign(({ context, event }) => ({
            ...prepareAssistantSpeech(
              context,
              'Sorry, I could not find a recipe for that. What else would you like to cook?',
            ),
            errorMessage: event.error instanceof Error ? event.error.message : String(event.error),
          })),
        },
      },
    },

    ConfirmRecipe: {
      entry: [
        assign(({ context }) => {
          const recipe = context.recipe;
          const time = recipe?.totalEstimatedMinutes ?? 20;
          return prepareAssistantSpeech(
            context,
            `Found ${recipe?.title}. It takes about ${time} minutes. Ready to gather ingredients?`,
          );
        }),
        {
          type: 'spst.speak',
          params: ({ context }) => ({
            utterance: context.lastSpokenUtterance ?? '',
          }),
        },
      ],
      on: {
        SPEAK_COMPLETE: {
          guard: ({ context }) => context.noInputCount < prompts.noInput.length,
          actions: [assign({ speechStatus: 'listening' }), { type: 'spst.listen' }],
        },
        AFFIRM: 'AnnouncePrepBatch',
        SKIP_PREP: 'AnnounceStep',
        NEXT_STEP: 'AnnounceStep',
        GOTO_STEP: {
          guard: 'isValidStepNumber',
          actions: assign({
            currentStepIndex: ({ event }) =>
              event.type === 'GOTO_STEP' ? event.stepNumber - 1 : 0,
          }),
          target: 'AnnounceStep',
        },
        DENY: 'PromptRecipe',
      },
    },

    AnnouncePrepBatch: {
      entry: [
        assign(({ context }) =>
          prepareAssistantSpeech(
            context,
            formatPrepBatchUtterance(context.recipe?.ingredients ?? [], context.prepBatchIndex),
          ),
        ),
        {
          type: 'spst.speak',
          params: ({ context }) => ({
            utterance: context.lastSpokenUtterance ?? '',
          }),
        },
      ],
      always: 'WaitingForPrepConfirmation',
    },

    WaitingForPrepConfirmation: {
      entry: [assign({ speechStatus: 'listening' }), { type: 'spst.listen' }],
      on: {
        SPEAK_COMPLETE: {
          guard: ({ context }) => context.noInputCount < prompts.noInput.length,
          actions: [assign({ speechStatus: 'listening' }), { type: 'spst.listen' }],
        },
        AFFIRM: [
          {
            guard: 'hasMorePrepBatches',
            actions: assign({
              prepBatchIndex: ({ context }) => context.prepBatchIndex + 1,
            }),
            target: 'AnnouncePrepBatch',
          },
          {
            target: 'AnnounceStep',
          },
        ],
        NEXT_STEP: {
          actions: ({ self }) => self.send({ type: 'AFFIRM' }),
        },
        REPEAT_STEP: 'AnnouncePrepBatch',
        SKIP_PREP: 'AnnounceStep',
        GOTO_STEP: {
          guard: 'isValidStepNumber',
          actions: assign({
            currentStepIndex: ({ event }) =>
              event.type === 'GOTO_STEP' ? event.stepNumber - 1 : 0,
          }),
          target: 'AnnounceStep',
        },
      },
    },

    AnnounceStep: {
      entry: [
        assign(({ context }) => {
          const steps = context.recipe?.steps ?? [];
          const step = steps[context.currentStepIndex];
          const text = step ? formatStepUtterance(step, steps.length) : 'All steps completed.';
          return prepareAssistantSpeech(context, text);
        }),
        {
          type: 'spst.speak',
          params: ({ context }) => ({
            utterance: context.lastSpokenUtterance ?? '',
          }),
        },
      ],
      always: 'WaitingForStepCommand',
    },

    WaitingForStepCommand: {
      entry: [assign({ speechStatus: 'listening' }), { type: 'spst.listen' }],
      on: {
        SPEAK_COMPLETE: {
          guard: ({ context }) => context.noInputCount < prompts.noInput.length,
          actions: [assign({ speechStatus: 'listening' }), { type: 'spst.listen' }],
        },
        AFFIRM: {
          actions: ({ self }) => self.send({ type: 'NEXT_STEP' }),
        },
        NEXT_STEP: [
          {
            guard: 'isLastStep',
            target: 'Completed',
          },
          {
            actions: assign({
              currentStepIndex: ({ context }) => context.currentStepIndex + 1,
            }),
            target: 'AnnounceStep',
          },
        ],
        PREVIOUS_STEP: [
          {
            guard: 'canGoBackStep',
            actions: assign({
              currentStepIndex: ({ context }) => context.currentStepIndex - 1,
            }),
            target: 'AnnounceStep',
          },
          {
            target: 'AnnounceStep',
          },
        ],
        REPEAT_STEP: 'AnnounceStep',
        GOTO_STEP: {
          guard: 'isValidStepNumber',
          actions: assign({
            currentStepIndex: ({ event }) =>
              event.type === 'GOTO_STEP' ? event.stepNumber - 1 : 0,
          }),
          target: 'AnnounceStep',
        },
      },
    },

    Completed: {
      entry: [
        assign(({ context }) => ({
          ...prepareAssistantSpeech(context, 'All steps completed. Enjoy your meal!'),
          speechStatus: 'idle',
        })),
        {
          type: 'spst.speak',
          params: ({ context }) => ({
            utterance: context.lastSpokenUtterance ?? '',
            bargeIn: false,
          }),
        },
      ],
      on: {
        START: 'PromptRecipe',
        CLICK: 'PromptRecipe',
        ASR_NOINPUT: {},
        LISTEN_COMPLETE: {},
      },
    },
  },
});
