import type { MealDBFilterResponse, MealDBMeal, MealDBResponse, MealDBSummary } from './types';

const BASE_URL = 'https://www.themealdb.com/api/json/v1/1';

/**
 * Helper to fetch and parse JSON from TheMealDB with descriptive error handling
 */
async function fetchFromMealDB<T>(endpoint: string): Promise<T> {
  try {
    const response = await fetch(`${BASE_URL}/${endpoint}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`TheMealDB request failed (${endpoint}): ${message}`);
  }
}

/**
 * Search meals by full or partial name (e.g. searchMealsByName("Arrabiata"))
 */
export async function searchMealsByName(name: string): Promise<MealDBMeal[]> {
  const encoded = encodeURIComponent(name.trim());
  const data = await fetchFromMealDB<MealDBResponse>(`search.php?s=${encoded}`);
  return data.meals ?? [];
}

/**
 * Look up full meal details by ID (e.g. getMealById("52771"))
 */
export async function getMealById(id: string): Promise<MealDBMeal | null> {
  const encoded = encodeURIComponent(id.trim());
  const data = await fetchFromMealDB<MealDBResponse>(`lookup.php?i=${encoded}`);
  return data.meals?.[0] ?? null;
}

/**
 * Fetch a single random meal recipe
 */
export async function getRandomMeal(): Promise<MealDBMeal | null> {
  const data = await fetchFromMealDB<MealDBResponse>('random.php');
  return data.meals?.[0] ?? null;
}

/**
 * Filter meals by primary ingredient (returns light summaries)
 * Note: Does not contain full ingredients or instructions. Call getMealById to hydrate.
 */
export async function filterMealsByIngredient(ingredient: string): Promise<MealDBSummary[]> {
  const encoded = encodeURIComponent(ingredient.trim().replace(/\s+/g, '_'));
  const data = await fetchFromMealDB<MealDBFilterResponse>(`filter.php?i=${encoded}`);
  return data.meals ?? [];
}

/**
 * Filter meals by category (returns light summaries)
 * Note: Does not contain full ingredients or instructions. Call getMealById to hydrate.
 */
export async function filterMealsByCategory(category: string): Promise<MealDBSummary[]> {
  const encoded = encodeURIComponent(category.trim());
  const data = await fetchFromMealDB<MealDBFilterResponse>(`filter.php?c=${encoded}`);
  return data.meals ?? [];
}
