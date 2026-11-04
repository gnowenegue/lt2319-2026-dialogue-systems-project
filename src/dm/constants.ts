/**
 * number of ingredients announced per turn during the mise en place prep phase.
 * defaults to 2 items to ensure exact measurements stay within working memory and <25 spoken words.
 */
export const INGREDIENTS_PER_PREP_BATCH = 2 as const;

/**
 * sampling temperature for grounded active-step factual query inference.
 * low value (0.1) enforces strict grounding in the provided recipe instruction.
 */
export const STEP_DETAIL_TEMPERATURE = 0.1 as const;
