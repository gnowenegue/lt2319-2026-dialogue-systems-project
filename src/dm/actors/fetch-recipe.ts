import { fromPromise } from 'xstate';

import { getRefinedRecipe, searchMealsByName } from '../../recipes';
import type { NormalizedRecipe } from '../../recipes/types';

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
