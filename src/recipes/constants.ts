/**
 * TheMealDB schema provides exactly 20 ingredient and measurement slots (`strIngredient1`..`20` and `strMeasure1`..`20`)
 */
export const MAX_MEALDB_INGREDIENTS = 20 as const;

/**
 * temperature used for LLM recipe refinement to ensure structured consistency
 */
export const REFINER_TEMPERATURE = 0.2 as const;
