/**
 * TheMealDB schema provides exactly 20 ingredient and measurement slots (`strIngredient1`..`20` and `strMeasure1`..`20`)
 */
export const MAX_MEALDB_INGREDIENTS = 20 as const;

/**
 * temperature used for LLM recipe refinement to ensure structured consistency
 */
export const REFINER_TEMPERATURE = 0.2 as const;

/**
 * canonical list of meal categories supported by TheMealDB filter endpoints
 */
export const THEMEALDB_CATEGORIES = [
  'Beef',
  'Breakfast',
  'Chicken',
  'Dessert',
  'Goat',
  'Lamb',
  'Miscellaneous',
  'Pasta',
  'Pork',
  'Seafood',
  'Side',
  'Starter',
  'Vegan',
  'Vegetarian',
] as const;
