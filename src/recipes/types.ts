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

// top-level wrapper object returned by TheMealDB filter endpoints (e.g. `filter.php?c=Pasta`)
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
  text: string; // full ingredient description, e.g. "1 pound penne rigate"
}

/**
 * discrete, sequential cooking step extracted from TheMealDB raw instruction text.
 * enriched with voice timer metadata in minutes for proactive dialogue manager alerts.
 */
export interface RecipeStep {
  stepNumber: number; // 1-indexed step number (1, 2, 3...)
  instruction: string;
  estimatedMinutes?: number; // detected cooking duration in minutes (e.g. 9 for "about 9 minutes")
  ingredientsReferenced?: string[]; // names of recipe ingredients mentioned in this step
}

/**
 * fully normalized recipe object stored in our XState dialogue session context.
 * used across the dialogue manager, culinary RAG, and kitchen dashboard UI.
 */
export interface NormalizedRecipe {
  id: string;
  title: string;
  category: string;
  area: string;
  instructionsRaw: string;
  thumbnail: string | null;
  tags: string[];
  sourceUrl: string | null;
  youtubeUrl: string | null;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  totalEstimatedMinutes?: number;
}
