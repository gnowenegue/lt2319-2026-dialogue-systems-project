/**
 * sampling temperature for LLM semantic parsing.
 * low value (0.1) enforces deterministic JSON structure and consistent intent classification.
 */
export const SEMANTIC_PARSER_TEMPERATURE = 0.1 as const;

/**
 * single source of truth for all supported dialogue acts.
 * used to derive TypeScript types, runtime validation sets, and LLM prompt schemas.
 */
export const DIALOGUE_ACTS = [
  'NEXT_STEP',
  'PREVIOUS_STEP',
  'REPEAT_STEP',
  'GOTO_STEP',
  'QUERY_INGREDIENT',
  'QUERY_STEP_DETAIL',
  'INQUIRE_SUBSTITUTION',
  'INQUIRE_TECHNIQUE',
  'SET_TIMER',
  'CHECK_TIMER',
  'CANCEL_TIMER',
  'SEARCH_RECIPE',
  'SELECT_RECIPE',
  'AFFIRM',
  'DENY',
  'SKIP_PREP',
  'GREETING',
  'HELP',
  'UNKNOWN',
] as const;
