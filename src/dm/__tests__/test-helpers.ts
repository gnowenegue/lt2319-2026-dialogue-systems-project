import type { speechstate } from 'speechstate';
import { createActor, fromPromise, fromTransition } from 'xstate';
import type { NormalizedRecipe } from '../../recipes/types';
import { cookingMachine } from '../cooking-machine';
import type { SearchRecipeOutput } from '../types';

/**
 * creates a fresh mock recipe with optional overrides for testing
 */
export const createMockRecipe = (overrides: Partial<NormalizedRecipe> = {}): NormalizedRecipe => {
  return {
    id: '52771',
    title: 'Spicy Arrabiata Penne',
    totalEstimatedMinutes: 20,
    ingredients: [
      { name: 'penne rigate', measure: '1 pound', text: '1 pound penne rigate' },
      { name: 'olive oil', measure: '1/4 cup', text: '1/4 cup olive oil' },
      { name: 'garlic', measure: '3 cloves', text: '3 cloves garlic' },
      { name: 'red chile flakes', measure: '1/2 tsp', text: '1/2 tsp red chile flakes' },
      { name: 'chopped tomatoes', measure: '1 tin', text: '1 tin chopped tomatoes' },
      { name: 'Italian seasoning', measure: '1/2 tsp', text: '1/2 tsp Italian seasoning' },
      { name: 'basil', measure: '6 leaves', text: '6 leaves basil' },
      { name: 'salt and pepper', measure: 'to taste', text: 'salt and pepper to taste' },
    ],
    steps: [
      {
        stepNumber: 1,
        instruction: 'Bring a large pot of salted water to a boil.',
      },
      {
        stepNumber: 2,
        instruction: 'Heat olive oil in a large skillet over medium heat and add garlic.',
      },
      {
        stepNumber: 3,
        instruction: 'Add chopped tomatoes, red chile flakes, and simmer for 10 minutes.',
        estimatedMinutes: 10,
      },
      {
        stepNumber: 4,
        instruction: 'Toss cooked penne with sauce and garnish with fresh basil.',
      },
    ],
    ...overrides,
  };
};

/**
 * factory creating an initialized test cooking actor with mock dependencies
 */
export const createTestCookingActor = (recipe: NormalizedRecipe = createMockRecipe()) => {
  const machine = cookingMachine.provide({
    actors: {
      fetchRecipeActor: fromPromise(
        async (): Promise<SearchRecipeOutput> => ({ kind: 'single', recipe }),
      ),
      refineRecipeActor: fromPromise(async () => recipe),
      queryKnowledgeActor: fromPromise(async () => 'Mock culinary advice.'),
      queryStepDetailActor: fromPromise(async () => 'Step details: 200 degrees Celsius.'),
      speechstateActor: fromTransition((state) => state, {}) as unknown as typeof speechstate,
    },
  });
  return createActor(machine).start();
};
