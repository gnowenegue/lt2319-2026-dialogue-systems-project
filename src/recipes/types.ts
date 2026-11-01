/*
 * external API types derived directly from TheMealDB REST responses
 */

/**
 * raw recipe payload returned by TheMealDB search (`search.php`) and lookup (`lookup.php`) endpoints.
 * contains 40 flat fields for ingredients and measures (`strIngredient1`..`20`, `strMeasure1`..`20`)
 * and an unstructured text block for instructions in `strInstructions`.
 */
export interface MealDBMeal {
  idMeal: string;
  strMeal: string;
  strMealAlternate?: string | null;
  strCategory: string;
  strArea: string;
  strInstructions: string;
  strMealThumb: string | null;
  strTags: string | null;
  strYoutube: string | null;
  strSource: string | null;
  strImageSource: string | null;
  strCreativeCommonsConfirmed: string | null;
  dateModified: string | null;
  // dynamic index signature for TheMealDB 20 flat ingredient slots (`strIngredient1` through `strIngredient20`)
  [key: `strIngredient${number}`]: string | null | undefined;
  // dynamic index signature for TheMealDB 20 flat measurement slots (`strMeasure1` through `strMeasure20`)
  [key: `strMeasure${number}`]: string | null | undefined;
}

/**
 * top-level wrapper object returned by TheMealDB search and lookup endpoints.
 * returns `{ meals: MealDBMeal[] }` on success, or `{ meals: null }` when no meals match.
 */
export interface MealDBResponse {
  meals: MealDBMeal[] | null;
}

/**
 * partial meal summary record returned by TheMealDB filter endpoints (e.g. filter by category or ingredient).
 * note: does not contain instructions or ingredients; requires a subsequent `lookup.php` call to hydrate.
 */
export interface MealDBSummary {
  idMeal: string;
  strMeal: string;
  strMealThumb: string | null;
}

/**
 * top-level wrapper object returned by TheMealDB filter endpoints (e.g. `filter.php?c=Pasta`).
 */
export interface MealDBFilterResponse {
  meals: MealDBSummary[] | null;
}

/*
 * internal types designed for the dialogue manager, culinary RAG, and dashboard UI
 */

/**
 * clean, structured ingredient representation used in our dialogue state and UI.
 * replaces TheMealDB flat numbered fields with paired `name`, `measure`, and display `text`.
 */
export interface RecipeIngredient {
  name: string;
  measure: string;
  /**
   * full ingredient description, e.g. "1 pound penne rigate"
   */
  text: string;
}

/**
 * discrete, sequential cooking step extracted from TheMealDB raw instruction text.
 * refined with voice timer metadata in minutes for proactive dialogue manager alerts.
 */
export interface RecipeStep {
  /**
   * 1-indexed step number (1, 2, 3...)
   */
  stepNumber: number;
  instruction: string;
  /**
   * detected cooking duration in minutes (e.g. 9 for "about 9 minutes")
   */
  estimatedMinutes?: number;
}

/**
 * normalized recipe object stored in our XState dialogue session context.
 * used across the dialogue manager for ingredient prep and active cooking steps.
 */
export interface NormalizedRecipe {
  id: string;
  title: string;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  totalEstimatedMinutes?: number;
}
