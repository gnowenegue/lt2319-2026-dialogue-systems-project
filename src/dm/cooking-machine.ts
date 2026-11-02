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
import type { CookingContext, CookingEvent } from './types';

export { fetchRecipeLogic };

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
  }),
  on: {
    RECOGNISED: {
      actions: [
        assign({
          lastResult: ({ event }) => event.value,
        }),
        'handleRecognised',
      ],
    },
    TIMERS_UPDATED: {
      actions: assign({
        activeTimers: ({ event }) => event.timers,
      }),
    },
    TIMER_EXPIRED: {
      actions: [
        assign({
          lastSpokenUtterance: ({ event }) => `Time's up! Your ${event.label} timer is done.`,
        }),
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
        assign({
          lastSpokenUtterance: ({ event }) => {
            const label = event.label?.trim() || 'cooking';
            const duration = formatDurationForSpeech(event.durationSeconds);
            return `Started a ${duration} timer for ${label}.`;
          },
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
        assign({
          lastSpokenUtterance: ({ context, event }) =>
            formatCheckTimerUtterance(context.activeTimers, event.label),
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
        assign({
          lastSpokenUtterance: ({ event }) =>
            event.label?.trim()
              ? `Cancelled the ${event.label.trim()} timer.`
              : 'Cancelled all timers.',
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
        assign({
          lastSpokenUtterance: ({ context, event }) =>
            lookupIngredient(context.recipe?.ingredients ?? [], event.ingredient),
        }),
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
      },
    },

    Prepare: {
      entry: { type: 'spst.prepare' },
      on: {
        ASRTTS_READY: 'PromptRecipe',
      },
    },

    PromptRecipe: {
      entry: [
        assign({
          lastSpokenUtterance: prompts.promptRecipe,
          errorMessage: null,
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
          actions: { type: 'spst.listen' },
        },
        SEARCH_RECIPE: 'FetchingRecipe',
      },
    },

    FetchingRecipe: {
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
          actions: assign({
            errorMessage: ({ event }) =>
              event.error instanceof Error ? event.error.message : String(event.error),
          }),
        },
      },
    },

    ConfirmRecipe: {
      entry: [
        assign({
          lastSpokenUtterance: ({ context }) => {
            const recipe = context.recipe;
            const time = recipe?.totalEstimatedMinutes ?? 20;
            return `Found ${recipe?.title}. It takes about ${time} minutes. Ready to gather ingredients?`;
          },
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
          actions: { type: 'spst.listen' },
        },
        AFFIRM: 'AnnouncePrepBatch',
        SKIP_PREP: 'AnnounceStep',
        DENY: 'PromptRecipe',
      },
    },

    AnnouncePrepBatch: {
      entry: [
        assign({
          lastSpokenUtterance: ({ context }) =>
            formatPrepBatchUtterance(context.recipe?.ingredients ?? [], context.prepBatchIndex),
        }),
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
      entry: [{ type: 'spst.listen' }],
      on: {
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
      },
    },

    AnnounceStep: {
      entry: [
        assign({
          lastSpokenUtterance: ({ context }) => {
            const steps = context.recipe?.steps ?? [];
            const step = steps[context.currentStepIndex];
            return step ? formatStepUtterance(step, steps.length) : 'All steps completed.';
          },
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
      entry: [{ type: 'spst.listen' }],
      on: {
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
        assign({
          lastSpokenUtterance: 'All steps completed. Enjoy your meal!',
        }),
        {
          type: 'spst.speak',
          params: ({ context }) => ({
            utterance: context.lastSpokenUtterance ?? '',
          }),
        },
      ],
      on: {
        START: 'PromptRecipe',
        CLICK: 'PromptRecipe',
      },
    },
  },
});
