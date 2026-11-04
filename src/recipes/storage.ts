import type { NormalizedRecipe } from './types';

/**
 * storage key prefix including schema versioning to avoid stale cache collisions
 */
export const RECIPE_STORAGE_PREFIX = 'cookmate:recipe:v1:';

// verify browser environment and `localStorage` availability safely across Node and web
const isLocalStorageAvailable = (): boolean => {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage);
  } catch {
    return false;
  }
};

/**
 * retrieves a cached `NormalizedRecipe` from browser `localStorage` by recipe ID.
 * returns `null` if the item is missing, invalid JSON, or if running in non-browser environments.
 */
export const getRecipeFromStorage = (id: string): NormalizedRecipe | null => {
  if (!isLocalStorageAvailable()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(`${RECIPE_STORAGE_PREFIX}${id}`);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as NormalizedRecipe;
  } catch {
    // return `null` if reading or parsing fails
    return null;
  }
};

/**
 * writes a `NormalizedRecipe` to browser `localStorage` under a versioned key.
 * fails silently if storage quota is exceeded or storage access is restricted.
 */
export const saveRecipeToStorage = (id: string, recipe: NormalizedRecipe): void => {
  if (!isLocalStorageAvailable()) {
    return;
  }

  try {
    window.localStorage.setItem(`${RECIPE_STORAGE_PREFIX}${id}`, JSON.stringify(recipe));
  } catch {
    // fail silently when storage is restricted or quota exceeded
  }
};

/**
 * removes all cached recipe entries matching the recipe prefix from `localStorage`.
 * leaves unrelated storage keys untouched.
 */
export const clearRecipeStorage = (): void => {
  if (!isLocalStorageAvailable()) {
    return;
  }

  try {
    const recipeKeys = Object.keys(window.localStorage).filter((key) =>
      key.startsWith(RECIPE_STORAGE_PREFIX),
    );

    recipeKeys.forEach((key) => {
      window.localStorage.removeItem(key);
    });
  } catch {
    // fail silently if storage access is restricted
  }
};
