import { refineRecipeWithLLM } from './refiner';
import { clearRecipeStorage, getRecipeFromStorage, saveRecipeToStorage } from './storage';
import type {
  MealDBFilterResponse,
  MealDBMeal,
  MealDBResponse,
  MealDBSummary,
  NormalizedRecipe,
  RefinerOptions,
} from './types';

const BASE_URL = 'https://www.themealdb.com/api/json/v1/1';
const refinedRecipeCache = new Map<string, NormalizedRecipe>();

// helper function to send HTTP requests to TheMealDB and parse JSON responses with descriptive errors
async function fetchFromMealDB<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  if (params) {
    url.search = new URLSearchParams(params).toString();
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const target = params ? `${endpoint}?${url.searchParams.toString()}` : endpoint;
    throw new Error(`TheMealDB request failed (${target}): ${message}`);
  }
}

/**
 * search meals by full or partial name (e.g. `searchMealsByName("Arrabiata")`)
 */
export async function searchMealsByName(name: string): Promise<MealDBMeal[]> {
  const data = await fetchFromMealDB<MealDBResponse>('search.php', {
    s: name.trim(),
  });
  return data.meals ?? [];
}

/**
 * look up full meal details by ID (e.g. `getMealById("52771")`)
 */
export async function getMealById(id: string): Promise<MealDBMeal | null> {
  const data = await fetchFromMealDB<MealDBResponse>('lookup.php', {
    i: id.trim(),
  });
  return data.meals?.[0] ?? null;
}

/**
 * fetch a single random meal recipe
 * @note currently unused in the dialogue manager; retained for complete TheMealDB API coverage.
 */
export async function getRandomMeal(): Promise<MealDBMeal | null> {
  const data = await fetchFromMealDB<MealDBResponse>('random.php');
  return data.meals?.[0] ?? null;
}

/**
 * filter meals by primary ingredient (returns lightweight summary cards).
 * note: does not contain full ingredients or instructions; call `getMealById()` to get complete recipe details.
 * @note currently unused in the dialogue manager; retained for complete TheMealDB API coverage.
 */
export async function filterMealsByIngredient(ingredient: string): Promise<MealDBSummary[]> {
  const data = await fetchFromMealDB<MealDBFilterResponse>('filter.php', {
    i: ingredient.trim().replace(/\s+/g, '_'),
  });
  return data.meals ?? [];
}

/**
 * filter meals by category (returns lightweight summary cards).
 * note: does not contain full ingredients or instructions; call `getMealById()` to get complete recipe details.
 * @note currently unused in the dialogue manager; retained for complete TheMealDB API coverage.
 */
export async function filterMealsByCategory(category: string): Promise<MealDBSummary[]> {
  const data = await fetchFromMealDB<MealDBFilterResponse>('filter.php', {
    c: category.trim(),
  });
  return data.meals ?? [];
}

/**
 * resets the in-memory cache and persistent localStorage of refined recipes
 */
export function clearRefinedRecipeCache(): void {
  refinedRecipeCache.clear();
  clearRecipeStorage();
}

/**
 * fetches full meal details from TheMealDB and refines them via LLM.
 * returns a cached `NormalizedRecipe` from in-memory cache or persistent storage if available.
 */
export async function getRefinedRecipe(
  id: string,
  options?: RefinerOptions,
): Promise<NormalizedRecipe | null> {
  const normalizedId = id.trim();

  // check in-memory cache first for instant synchronous access
  const memoryCached = refinedRecipeCache.get(normalizedId);
  if (memoryCached) {
    return memoryCached;
  }

  // check persistent browser storage fallback
  const storageCached = getRecipeFromStorage(normalizedId);
  if (storageCached) {
    refinedRecipeCache.set(normalizedId, storageCached);
    return storageCached;
  }

  const meal = await getMealById(normalizedId);
  if (!meal) {
    return null;
  }

  const refined = await refineRecipeWithLLM(meal, options);
  refinedRecipeCache.set(normalizedId, refined);
  saveRecipeToStorage(normalizedId, refined);
  return refined;
}
