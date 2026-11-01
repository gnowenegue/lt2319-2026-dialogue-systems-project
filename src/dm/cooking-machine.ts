import { assign, fromPromise, setup } from 'xstate';

import { ROLES } from '../constants';
import prompts from '../prompts';
import { getRefinedRecipe, searchMealsByName } from '../recipes';
import type { NormalizedRecipe } from '../recipes/types';
import {
  formatPrepBatchUtterance,
  formatStepUtterance,
  hasMorePrepBatches,
  lookupIngredient,
} from './helpers';
import type { CookingContext, CookingEvent } from './types';

/**
 * fetches and refines recipe details from TheMealDB API with session caching
 */
export const fetchRecipeLogic = fromPromise(
  async ({ input }: { input: { query: string } }): Promise<NormalizedRecipe> => {
    const meals = await searchMealsByName(input.query);
    if (!meals || meals.length === 0) {
      throw new Error(`Recipe not found for "${input.query}"`);
    }
    const refined = await getRefinedRecipe(meals[0].idMeal);
    if (!refined) {
      throw new Error(`Failed to refine recipe "${meals[0].strMeal}"`);
    }
    return refined;
  },
);

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
    'spst.speak': ({ context }, params: { utterance: string }) => {
      // notify SpeechState ASR/TTS actor if initialized
      if (context.spstRef) {
        context.spstRef.send({
          type: 'SPEAK',
          value: {
            utterance: params.utterance,
          },
        });
      }
    },
    'spst.listen': ({ context }) => {
      if (context.spstRef) {
        context.spstRef.send({
          type: 'LISTEN',
        });
      }
    },
  },
  actors: {
    fetchRecipeActor: fetchRecipeLogic,
  },
  guards: {
    hasMorePrepBatches: ({ context }) =>
      hasMorePrepBatches(context.recipe?.ingredients ?? [], context.prepBatchIndex),
    isLastStep: ({ context }) =>
      context.currentStepIndex >= (context.recipe?.steps.length ?? 1) - 1,
    canGoBackStep: ({ context }) => context.currentStepIndex > 0,
    isValidStepNumber: ({ context, event }) => {
      if (event.type !== 'GOTO_STEP') return false;
      const stepNum = event.stepNumber;
      return stepNum >= 1 && stepNum <= (context.recipe?.steps.length ?? 0);
    },
  },
}).createMachine({
  id: 'CookingCopilot',
  initial: 'Idle',
  context: {
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
    spstRef: null,
  },
  states: {
    Idle: {
      on: {
        START: 'PromptRecipe',
        CLICK: 'PromptRecipe',
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
        NEXT_STEP: [
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
        QUERY_INGREDIENT: 'AnswerIngredientQuery',
      },
    },

    AnswerIngredientQuery: {
      entry: [
        assign({
          lastSpokenUtterance: ({ context, event }) =>
            lookupIngredient(
              context.recipe?.ingredients ?? [],
              event.type === 'QUERY_INGREDIENT' ? event.ingredient : undefined,
            ),
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
