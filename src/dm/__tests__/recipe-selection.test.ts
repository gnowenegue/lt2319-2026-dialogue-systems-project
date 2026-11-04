import type { speechstate } from 'speechstate';
import { describe, expect, it, vi } from 'vitest';
import { createActor, fromPromise, fromTransition } from 'xstate';

import * as recipes from '../../recipes';
import type { NormalizedRecipe } from '../../recipes/types';
import { fetchRecipeLogic } from '../actors/fetch-recipe';
import { cookingMachine } from '../cooking-machine';
import { formatCandidateUtterance, matchCandidate } from '../helpers';
import type { RecipeCandidate, SearchRecipeOutput } from '../types';
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

    it('matches candidate by partial title substring', () => {
      expect(matchCandidate(mockCandidates, undefined, 'make arrabiata')).toEqual(
        mockCandidates[0],
      );
      expect(matchCandidate(mockCandidates, undefined, 'Alfredo')).toEqual(mockCandidates[1]);
      expect(matchCandidate(mockCandidates, undefined, 'carbonara')).toEqual(mockCandidates[2]);
      expect(matchCandidate(mockCandidates, undefined, 'tacos')).toBeNull();
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

    it('matches category by token inclusion in natural phrases (e.g. "make dessert")', async () => {
      vi.spyOn(recipes, 'searchMealsByName').mockResolvedValue([]);
      const filterSpy = vi
        .spyOn(recipes, 'filterMealsByCategory')
        .mockResolvedValue([
          { idMeal: '52768', strMeal: 'Apple Frangipan Tart', strMealThumb: '' },
        ]);
      vi.spyOn(recipes, 'getRefinedRecipe').mockResolvedValue(mockArrabiataRecipe);

      const actor = createActor(fetchRecipeLogic, {
        input: { query: 'make dessert' },
      }).start();

      await new Promise((resolve) => setTimeout(resolve, 10));

      const snapshot = actor.getSnapshot();
      expect(snapshot.status).toBe('done');
      expect(filterSpy).toHaveBeenCalledWith('Dessert');
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
