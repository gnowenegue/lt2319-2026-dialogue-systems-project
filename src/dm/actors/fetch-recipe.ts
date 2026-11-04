import { fromPromise } from 'xstate';

import {
  filterMealsByCategory,
  filterMealsByIngredient,
  getRefinedRecipe,
  searchMealsByName,
  THEMEALDB_CATEGORIES,
} from '../../recipes';
import type { RecipeCandidate, SearchRecipeOutput } from '../types';

/**
 * removes common conversational determiners (e.g. "some", "a", "an", "the")
 */
const cleanRecipeQuery = (rawQuery: string): string => {
  return rawQuery
    .trim()
    .replace(/^(?:some|a|an|the|any)\s+/i, '')
    .trim();
};

/**
 * transforms meal search matches into either a single refined recipe or up to 3 candidate suggestions
 */
const resolveMealResults = async (
  meals: readonly { idMeal: string; strMeal: string }[],
): Promise<SearchRecipeOutput> => {
  if (meals.length === 1) {
    const refined = await getRefinedRecipe(meals[0].idMeal);
    if (!refined) {
      throw new Error(`Failed to refine recipe "${meals[0].strMeal}"`);
    }

    return { kind: 'single', recipe: refined };
  }

  const candidates: RecipeCandidate[] = meals.slice(0, 3).map((m, i) => ({
    id: m.idMeal,
    title: m.strMeal,
    index: i + 1,
  }));

  return { kind: 'multiple', candidates };
};

/**
 * searches TheMealDB for recipes: returns a single refined recipe if only 1 match, or multiple candidates
 */
export const fetchRecipeLogic = fromPromise(
  async ({ input }: { input: { query: string } }): Promise<SearchRecipeOutput> => {
    const rawQuery = input.query.trim();
    const cleanedQuery = cleanRecipeQuery(rawQuery);

    // attempt direct meal name lookup
    let meals = await searchMealsByName(rawQuery);
    if ((!meals || meals.length === 0) && cleanedQuery && cleanedQuery !== rawQuery) {
      meals = await searchMealsByName(cleanedQuery);
    }

    if (meals && meals.length > 0) {
      return resolveMealResults(meals);
    }

    // attempt category filter fallback (e.g. "dessert", "make dessert", "seafood")
    const lowerCleaned = cleanedQuery.toLowerCase();
    const queryTokens = lowerCleaned.split(/[^a-z0-9]+/i).filter(Boolean);
    const matchedCategory = THEMEALDB_CATEGORIES.find((cat) => {
      const catLower = cat.toLowerCase();
      return (
        catLower === lowerCleaned ||
        queryTokens.includes(catLower) ||
        queryTokens.some((token) => token === `${catLower}s` || token.startsWith(catLower))
      );
    });

    if (matchedCategory) {
      const categoryMeals = await filterMealsByCategory(matchedCategory);
      if (categoryMeals && categoryMeals.length > 0) {
        return resolveMealResults(categoryMeals);
      }
    }

    // attempt primary ingredient filter fallback (e.g. "chocolate", "potatoes")
    if (cleanedQuery) {
      const ingredientMeals = await filterMealsByIngredient(cleanedQuery);
      if (ingredientMeals && ingredientMeals.length > 0) {
        return resolveMealResults(ingredientMeals);
      }
    }

    throw new Error(`Recipe not found for "${input.query}"`);
  },
);
