// ============================================================================
// EXTERNAL INTERFACES (Derived directly from TheMealDB REST API)
// ============================================================================

/**
 * Raw recipe payload returned by TheMealDB search (`search.php`) and lookup (`lookup.php`) endpoints.
 * Contains 40 flat fields for ingredients/measures (strIngredient1..20, strMeasure1..20)
 * and an unstructured text block for instructions (strInstructions).
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
  // Dynamic index signature for TheMealDB's 20 flat ingredient slots (strIngredient1 through strIngredient20)
  [key: `strIngredient${number}`]: string | null | undefined;
  // Dynamic index signature for TheMealDB's 20 flat measurement slots (strMeasure1 through strMeasure20)
  [key: `strMeasure${number}`]: string | null | undefined;
}

/**
 * Top-level wrapper object returned by TheMealDB search and lookup endpoints.
 * Returns `{ meals: MealDBMeal[] }` on success, or `{ meals: null }` when no meals match.
 */
export interface MealDBResponse {
  meals: MealDBMeal[] | null;
}

/**
 * Partial meal summary record returned by TheMealDB filter endpoints (e.g. filter by category or ingredient).
 * NOTE: Does NOT contain instructions or ingredients; requires a subsequent lookup.php call to hydrate.
 */
export interface MealDBSummary {
  idMeal: string;
  strMeal: string;
  strMealThumb: string | null;
}

/**
 * Top-level wrapper object returned by TheMealDB filter endpoints (e.g., `filter.php?c=Pasta`).
 */
export interface MealDBFilterResponse {
  meals: MealDBSummary[] | null;
}

// ============================================================================
// INTERNAL INTERFACES (Designed by us for our Cooking Copilot)
// ============================================================================

/**
 * Clean, structured ingredient representation used in our dialogue state and UI.
 * Replaces TheMealDB's flat numbered fields with paired name, measure, and full text.
 */
export interface RecipeIngredient {
  name: string;
  measure: string;
  text: string; // e.g. "1 pound penne rigate"
}

/**
 * Discrete, sequential cooking step extracted from TheMealDB's raw instruction text.
 * Enriched with voice timer metadata for proactive Dialogue Manager alerts (Phase 4).
 */
export interface RecipeStep {
  stepNumber: number; // 1-indexed (1, 2, 3...)
  instruction: string;
  estimatedMinutes?: number; // Detected cooking duration (e.g., 9 for "about 9 minutes")
  ingredientsReferenced?: string[]; // Names of recipe ingredients mentioned in this step
}

/**
 * Fully normalized recipe object stored in our XState dialogue session context.
 * Used by the Dialogue Manager, Culinary RAG, and Kitchen Dashboard UI.
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
