import type { speechstate } from 'speechstate';
import { describe, expect, it, vi } from 'vitest';
import { createActor, fromPromise, fromTransition } from 'xstate';

import { openai } from '../../llm';
import * as recipes from '../../recipes';
import type { NormalizedRecipe } from '../../recipes/types';
import { handleRecognisedAction } from '../actions/handle-recognised';
import { fetchRecipeLogic } from '../actors/fetch-recipe';
import { cookingMachine } from '../cooking-machine';
import { formatCandidateUtterance, matchCandidate } from '../helpers';
import type { CookingContext, CookingEvent, RecipeCandidate, SearchRecipeOutput } from '../types';
import { createMockRecipe } from './test-helpers';

const mockCandidates: readonly RecipeCandidate[] = [
  { id: 'c-1', title: 'Spicy Penne Arrabiata', index: 1 },
  { id: 'c-2', title: 'Fettuccine Alfredo', index: 2 },
  { id: 'c-3', title: 'Spaghetti Carbonara', index: 3 },
];

const mockArrabiataRecipe = createMockRecipe({
  id: 'c-1',
  title: 'Spicy Penne Arrabiata',
  ingredients: [{ name: 'Penne', measure: '1 lb', text: '1 pound penne' }],
  steps: [{ stepNumber: 1, instruction: 'Boil pasta in salted water.' }],
});

const mockAlfredoRecipe = createMockRecipe({
  id: 'c-2',
  title: 'Fettuccine Alfredo',
  ingredients: [{ name: 'Fettuccine', measure: '1 lb', text: '1 pound fettuccine' }],
  steps: [{ stepNumber: 1, instruction: 'Melt butter with heavy cream.' }],
});

describe('Dialogue Manager - Recipe Discovery & Selection (SELECT_RECIPE)', () => {
  describe('helpers', () => {
    it('formats candidate options into natural spoken utterance', () => {
      const utterance = formatCandidateUtterance(mockCandidates);
      expect(utterance).toBe(
        'I found 3 options: 1) Spicy Penne Arrabiata, 2) Fettuccine Alfredo, 3) Spaghetti Carbonara. Which one would you like?',
      );
    });

    it('matches candidate by numeric index', () => {
      expect(matchCandidate(mockCandidates, 1)).toEqual(mockCandidates[0]);
      expect(matchCandidate(mockCandidates, 2)).toEqual(mockCandidates[1]);
      expect(matchCandidate(mockCandidates, 3)).toEqual(mockCandidates[2]);
      expect(matchCandidate(mockCandidates, 4)).toBeNull();
      expect(matchCandidate(mockCandidates, 0)).toBeNull();
    });

    it('matches candidate by ordinal keywords in query', () => {
      expect(matchCandidate(mockCandidates, undefined, 'the first one')).toEqual(mockCandidates[0]);
      expect(matchCandidate(mockCandidates, undefined, 'choose the second')).toEqual(
        mockCandidates[1],
      );
      expect(matchCandidate(mockCandidates, undefined, 'number 3 please')).toEqual(
        mockCandidates[2],
      );
      expect(matchCandidate(mockCandidates, undefined, 'the last option')).toEqual(
        mockCandidates[2],
      );
    });

    it('matches candidate by partial title substring', () => {
      expect(matchCandidate(mockCandidates, undefined, 'make arrabiata')).toEqual(
        mockCandidates[0],
      );
      expect(matchCandidate(mockCandidates, undefined, 'Alfredo')).toEqual(mockCandidates[1]);
      expect(matchCandidate(mockCandidates, undefined, 'carbonara')).toEqual(mockCandidates[2]);
      expect(matchCandidate(mockCandidates, undefined, 'tacos')).toBeNull();
    });
  });

  describe('handleRecognisedAction', () => {
    it('translates SELECT_RECIPE into machine event with index and query when candidates exist', async () => {
      const sentEvents: CookingEvent[] = [];
      const mockContext = {
        recipeCandidates: mockCandidates,
        messages: [],
      } as unknown as CookingContext;

      const mockSelf = {
        send: (ev: CookingEvent) => sentEvents.push(ev),
        getSnapshot: () => ({ can: () => true }),
      };

      vi.spyOn(openai.chat.completions, 'create').mockResolvedValueOnce({
        id: 'mock-select-1',
        choices: [
          {
            finish_reason: 'stop',
            index: 0,
            logprobs: null,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                act: 'SELECT_RECIPE',
                entities: { stepNumber: 2, query: 'second one' },
              }),
              refusal: null,
            },
          },
        ],
        created: Date.now(),
        model: 'mock-model',
        object: 'chat.completion',
      });

      await handleRecognisedAction({
        context: mockContext,
        self: mockSelf,
        event: {
          type: 'RECOGNISED',
          value: [{ utterance: 'The second one', confidence: 0.95 }],
        },
      });

      const selectEvent = sentEvents.find((e) => e.type === 'SELECT_RECIPE');
      expect(selectEvent).toBeDefined();
      expect(selectEvent).toEqual({
        type: 'SELECT_RECIPE',
        index: 2,
        query: 'second one',
      });
    });

    it('normalizes SELECT_RECIPE to SEARCH_RECIPE when user names a dish during PromptRecipe (no active candidates)', async () => {
      const sentEvents: CookingEvent[] = [];
      const mockContext = {
        recipeCandidates: null,
        messages: [],
      } as unknown as CookingContext;

      const mockSelf = {
        send: (ev: CookingEvent) => sentEvents.push(ev),
        getSnapshot: () => ({ can: () => true }),
      };

      vi.spyOn(openai.chat.completions, 'create').mockResolvedValueOnce({
        id: 'mock-select-2',
        choices: [
          {
            finish_reason: 'stop',
            index: 0,
            logprobs: null,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                act: 'SELECT_RECIPE',
                entities: { query: 'Banana pancake' },
              }),
              refusal: null,
            },
          },
        ],
        created: Date.now(),
        model: 'mock-model',
        object: 'chat.completion',
      });

      await handleRecognisedAction({
        context: mockContext,
        self: mockSelf,
        event: {
          type: 'RECOGNISED',
          value: [{ utterance: 'Banana pancake', confidence: 0.95 }],
        },
      });

      const searchEvent = sentEvents.find((e) => e.type === 'SEARCH_RECIPE');
      expect(searchEvent).toBeDefined();
      expect(searchEvent).toEqual({
        type: 'SEARCH_RECIPE',
        query: 'Banana pancake',
      });
    });

    it('routes ingredient variety or clarification queries to INQUIRE_SUBSTITUTION', async () => {
      const sentEvents: CookingEvent[] = [];
      const mockContext = { messages: [] } as unknown as CookingContext;
      const mockSelf = {
        send: (ev: CookingEvent) => sentEvents.push(ev),
        getSnapshot: () => ({ can: () => true }),
      };

      vi.spyOn(openai.chat.completions, 'create').mockResolvedValueOnce({
        id: 'mock-oil-clarification',
        choices: [
          {
            finish_reason: 'stop',
            index: 0,
            logprobs: null,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                act: 'QUERY_INGREDIENT',
                entities: { ingredient: 'oil' },
              }),
              refusal: null,
            },
          },
        ],
        created: Date.now(),
        model: 'mock-model',
        object: 'chat.completion',
      });

      await handleRecognisedAction({
        context: mockContext,
        self: mockSelf,
        event: {
          type: 'RECOGNISED',
          value: [{ utterance: 'What kind of oil?', confidence: 0.95 }],
        },
      });

      const inquireEvent = sentEvents.find((e) => e.type === 'INQUIRE_SUBSTITUTION');
      expect(inquireEvent).toBeDefined();
      expect(inquireEvent).toEqual({
        type: 'INQUIRE_SUBSTITUTION',
        ingredient: 'oil',
        query: 'What kind of oil?',
      });
    });

    it('keeps standard ingredient quantity questions as QUERY_INGREDIENT', async () => {
      const sentEvents: CookingEvent[] = [];
      const mockContext = { messages: [] } as unknown as CookingContext;
      const mockSelf = {
        send: (ev: CookingEvent) => sentEvents.push(ev),
        getSnapshot: () => ({ can: () => true }),
      };

      vi.spyOn(openai.chat.completions, 'create').mockResolvedValueOnce({
        id: 'mock-oil-quantity',
        choices: [
          {
            finish_reason: 'stop',
            index: 0,
            logprobs: null,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                act: 'QUERY_INGREDIENT',
                entities: { ingredient: 'oil' },
              }),
              refusal: null,
            },
          },
        ],
        created: Date.now(),
        model: 'mock-model',
        object: 'chat.completion',
      });

      await handleRecognisedAction({
        context: mockContext,
        self: mockSelf,
        event: {
          type: 'RECOGNISED',
          value: [{ utterance: 'How much oil do I need?', confidence: 0.95 }],
        },
      });

      const queryIngredientEvent = sentEvents.find((e) => e.type === 'QUERY_INGREDIENT');
      expect(queryIngredientEvent).toBeDefined();
      expect(queryIngredientEvent).toEqual({
        type: 'QUERY_INGREDIENT',
        ingredient: 'oil',
      });
    });
  });

  describe('state machine discovery flow', () => {
    const createDiscoveryTestActor = () => {
      const machine = cookingMachine.provide({
        actors: {
          fetchRecipeActor: fromPromise(
            async (): Promise<SearchRecipeOutput> => ({
              kind: 'multiple',
              candidates: mockCandidates,
            }),
          ),
          refineRecipeActor: fromPromise(
            async ({ input }: { input: { candidateId: string } }): Promise<NormalizedRecipe> => {
              if (input.candidateId === 'c-2') return mockAlfredoRecipe;
              return mockArrabiataRecipe;
            },
          ),
          speechstateActor: fromTransition((state) => state, {}) as unknown as typeof speechstate,
          queryKnowledgeActor: fromPromise(async () => 'Mock advice.'),
          queryStepDetailActor: fromPromise(async () => 'Mock step detail.'),
        },
      });
      return createActor(machine).start();
    };

    it('presents candidates on multi-match search and transitions to SelectingRecipe', async () => {
      const actor = createDiscoveryTestActor();

      actor.send({ type: 'START' });
      actor.send({ type: 'ASRTTS_READY' });
      actor.send({ type: 'SEARCH_RECIPE', query: 'pasta' });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(actor.getSnapshot().value).toBe('SelectingRecipe');
      expect(actor.getSnapshot().context.recipeCandidates).toHaveLength(3);
      expect(actor.getSnapshot().context.lastSpokenUtterance).toContain(
        'I found 3 options: 1) Spicy Penne Arrabiata, 2) Fettuccine Alfredo, 3) Spaghetti Carbonara',
      );
    });

    it('selects candidate by number, refines recipe, and proceeds to ConfirmRecipe', async () => {
      const actor = createDiscoveryTestActor();

      actor.send({ type: 'START' });
      actor.send({ type: 'ASRTTS_READY' });
      actor.send({ type: 'SEARCH_RECIPE', query: 'pasta' });
      await new Promise((resolve) => setTimeout(resolve, 0));

      // select candidate 2 (Fettuccine Alfredo)
      actor.send({ type: 'SELECT_RECIPE', index: 2 });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(actor.getSnapshot().value).toBe('ConfirmRecipe');
      expect(actor.getSnapshot().context.recipe?.title).toBe('Fettuccine Alfredo');
      expect(actor.getSnapshot().context.recipeCandidates).toBeNull();
      expect(actor.getSnapshot().context.lastSpokenUtterance).toContain('Found Fettuccine Alfredo');
    });

    it('selects candidate by name substring', async () => {
      const actor = createDiscoveryTestActor();

      actor.send({ type: 'START' });
      actor.send({ type: 'ASRTTS_READY' });
      actor.send({ type: 'SEARCH_RECIPE', query: 'pasta' });
      await new Promise((resolve) => setTimeout(resolve, 0));

      // user says "choose Arrabiata"
      actor.send({ type: 'SELECT_RECIPE', query: 'Arrabiata' });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(actor.getSnapshot().value).toBe('ConfirmRecipe');
      expect(actor.getSnapshot().context.recipe?.title).toBe('Spicy Penne Arrabiata');
    });

    it('reprompts user when candidate choice is invalid', async () => {
      const actor = createDiscoveryTestActor();

      actor.send({ type: 'START' });
      actor.send({ type: 'ASRTTS_READY' });
      actor.send({ type: 'SEARCH_RECIPE', query: 'pasta' });
      await new Promise((resolve) => setTimeout(resolve, 0));

      // invalid index 5
      actor.send({ type: 'SELECT_RECIPE', index: 5 });
      expect(actor.getSnapshot().value).toBe('SelectingRecipe');
      expect(actor.getSnapshot().context.lastSpokenUtterance).toContain(
        'Sorry, I did not recognize that option',
      );
    });

    it('accepts GOTO_STEP as an alias for candidate index', async () => {
      const actor = createDiscoveryTestActor();

      actor.send({ type: 'START' });
      actor.send({ type: 'ASRTTS_READY' });
      actor.send({ type: 'SEARCH_RECIPE', query: 'pasta' });
      await new Promise((resolve) => setTimeout(resolve, 0));

      // speech recognition parses "number two" as GOTO_STEP
      actor.send({ type: 'GOTO_STEP', stepNumber: 2 });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(actor.getSnapshot().value).toBe('ConfirmRecipe');
      expect(actor.getSnapshot().context.recipe?.title).toBe('Fettuccine Alfredo');
    });

    it('allows cancelling selection back to PromptRecipe via DENY', async () => {
      const actor = createDiscoveryTestActor();

      actor.send({ type: 'START' });
      actor.send({ type: 'ASRTTS_READY' });
      actor.send({ type: 'SEARCH_RECIPE', query: 'pasta' });
      await new Promise((resolve) => setTimeout(resolve, 0));

      actor.send({ type: 'DENY' });
      expect(actor.getSnapshot().value).toBe('PromptRecipe');
    });

    it('accepts SELECT_RECIPE in PromptRecipe as a fallback and transitions to FetchingRecipe', async () => {
      const actor = createDiscoveryTestActor();

      actor.send({ type: 'START' });
      actor.send({ type: 'ASRTTS_READY' });
      expect(actor.getSnapshot().value).toBe('PromptRecipe');

      // user says "Banana pancake", which was tagged as SELECT_RECIPE
      actor.send({ type: 'SELECT_RECIPE', query: 'Banana pancake' });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(actor.getSnapshot().value).toBe('SelectingRecipe');
    });

    it('reprompts with error message without double prompting when recipe search fails', async () => {
      const machine = cookingMachine.provide({
        actors: {
          fetchRecipeActor: fromPromise(async (): Promise<SearchRecipeOutput> => {
            throw new Error('Recipe not found');
          }),
          refineRecipeActor: fromPromise(async () => mockArrabiataRecipe),
          speechstateActor: fromTransition((state) => state, {}) as unknown as typeof speechstate,
          queryKnowledgeActor: fromPromise(async () => 'Mock advice.'),
          queryStepDetailActor: fromPromise(async () => 'Mock step detail.'),
        },
      });
      const actor = createActor(machine).start();

      actor.send({ type: 'START' });
      actor.send({ type: 'ASRTTS_READY' });
      expect(actor.getSnapshot().value).toBe('PromptRecipe');

      const messagesBefore = actor.getSnapshot().context.messages.length;

      actor.send({ type: 'SEARCH_RECIPE', query: 'Dirty pancakes' });
      await new Promise((resolve) => setTimeout(resolve, 0));

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('PromptRecipe');
      expect(snapshot.context.lastSpokenUtterance).toBe(
        'Sorry, I could not find a recipe for that. What else would you like to cook?',
      );
      // verify only one assistant message was added for the error, not followed by duplicate greeting
      const assistantMessages = snapshot.context.messages.filter((m) => m.role === 'assistant');
      const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
      expect(lastAssistantMessage.content).toBe(
        'Sorry, I could not find a recipe for that. What else would you like to cook?',
      );
      expect(snapshot.context.messages.length).toBe(messagesBefore + 1);
    });

    it('reprompts with error message without double prompting when recipe refinement fails', async () => {
      const machine = cookingMachine.provide({
        actors: {
          fetchRecipeActor: fromPromise(
            async (): Promise<SearchRecipeOutput> => ({
              kind: 'multiple',
              candidates: mockCandidates,
            }),
          ),
          refineRecipeActor: fromPromise(async (): Promise<NormalizedRecipe> => {
            throw new Error('Failed to refine recipe');
          }),
          speechstateActor: fromTransition((state) => state, {}) as unknown as typeof speechstate,
          queryKnowledgeActor: fromPromise(async () => 'Mock advice.'),
          queryStepDetailActor: fromPromise(async () => 'Mock step detail.'),
        },
      });
      const actor = createActor(machine).start();

      actor.send({ type: 'START' });
      actor.send({ type: 'ASRTTS_READY' });
      actor.send({ type: 'SEARCH_RECIPE', query: 'pasta' });
      await new Promise((resolve) => setTimeout(resolve, 0));

      actor.send({ type: 'SELECT_RECIPE', index: 1 });
      await new Promise((resolve) => setTimeout(resolve, 0));

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('PromptRecipe');
      expect(snapshot.context.lastSpokenUtterance).toBe(
        'Sorry, I could not load that recipe. What else would you like to cook?',
      );
      const assistantMessages = snapshot.context.messages.filter((m) => m.role === 'assistant');
      const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
      expect(lastAssistantMessage.content).toBe(
        'Sorry, I could not load that recipe. What else would you like to cook?',
      );
    });
  });

  describe('fetchRecipeLogic', () => {
    it('falls back to category search when direct search fails (e.g. "Some dessert")', async () => {
      vi.spyOn(recipes, 'searchMealsByName').mockResolvedValue([]);
      vi.spyOn(recipes, 'filterMealsByCategory').mockResolvedValue([
        { idMeal: '52768', strMeal: 'Apple Frangipan Tart', strMealThumb: '' },
        { idMeal: '52893', strMeal: 'Apple & Blackberry Crumble', strMealThumb: '' },
      ]);

      const actor = createActor(fetchRecipeLogic, {
        input: { query: 'Some dessert' },
      }).start();

      await new Promise((resolve) => setTimeout(resolve, 10));

      const snapshot = actor.getSnapshot();
      expect(snapshot.status).toBe('done');
      expect(snapshot.output).toEqual({
        kind: 'multiple',
        candidates: [
          { id: '52768', title: 'Apple Frangipan Tart', index: 1 },
          { id: '52893', title: 'Apple & Blackberry Crumble', index: 2 },
        ],
      });
    });

    it('falls back to primary ingredient search when name and category fail', async () => {
      vi.spyOn(recipes, 'searchMealsByName').mockResolvedValue([]);
      vi.spyOn(recipes, 'filterMealsByCategory').mockResolvedValue([]);
      vi.spyOn(recipes, 'filterMealsByIngredient').mockResolvedValue([
        { idMeal: '52772', strMeal: 'Teriyaki Chicken Casserole', strMealThumb: '' },
      ]);
      vi.spyOn(recipes, 'getRefinedRecipe').mockResolvedValue(mockArrabiataRecipe);

      const actor = createActor(fetchRecipeLogic, {
        input: { query: 'chicken' },
      }).start();

      await new Promise((resolve) => setTimeout(resolve, 10));

      const snapshot = actor.getSnapshot();
      expect(snapshot.status).toBe('done');
      expect(snapshot.output).toEqual({
        kind: 'single',
        recipe: mockArrabiataRecipe,
      });
    });

    it('throws when recipe cannot be found across all search strategies', async () => {
      vi.spyOn(recipes, 'searchMealsByName').mockResolvedValue([]);
      vi.spyOn(recipes, 'filterMealsByCategory').mockResolvedValue([]);
      vi.spyOn(recipes, 'filterMealsByIngredient').mockResolvedValue([]);

      let caughtError: unknown;
      const actor = createActor(fetchRecipeLogic, {
        input: { query: 'unknown alien food' },
      });
      actor.subscribe({
        error: (err) => {
          caughtError = err;
        },
      });
      actor.start();

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect((caughtError as Error)?.message).toContain(
        'Recipe not found for "unknown alien food"',
      );
    });
  });
});
