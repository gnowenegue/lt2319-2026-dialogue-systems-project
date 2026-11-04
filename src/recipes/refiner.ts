import { ACTIVE_REFINER_MODEL, createChatCompletion, safeExtractJson } from '../llm';
import prompts from '../prompts';
import { REFINER_TEMPERATURE } from './constants';
import { calculateTotalMinutes, normalizeMealDBRecipe } from './normalizer';
import type {
  MealDBMeal,
  NormalizedRecipe,
  RecipeIngredient,
  RecipeStep,
  RefinerOptions,
} from './types';

// parse and format ingredients returned by the LLM
const parseRefinedIngredients = (ingredients?: Partial<RecipeIngredient>[]): RecipeIngredient[] => {
  if (!Array.isArray(ingredients)) {
    return [];
  }

  return ingredients.flatMap((item) => {
    const name = item.name?.trim();
    if (!name) {
      return [];
    }

    const measure = item.measure?.trim() ?? '';
    const text = item.text?.trim() || (measure ? `${measure} ${name}` : name);

    return [{ name, measure, text }];
  });
};

// parse and index cooking steps returned by the LLM
const parseRefinedSteps = (steps?: Partial<RecipeStep>[]): RecipeStep[] => {
  if (!Array.isArray(steps)) {
    return [];
  }

  const validSteps = steps.flatMap((item) => {
    const instruction = item.instruction?.trim();
    return instruction ? [{ ...item, instruction }] : [];
  });

  return validSteps.map((item, index) => ({
    stepNumber: item.stepNumber ?? index + 1,
    instruction: item.instruction,
    estimatedMinutes: item.estimatedMinutes,
  }));
};

/**
 * refines a raw TheMealDB meal record using an LLM to reconcile ingredient discrepancies
 * and clean step instructions for spoken dialogue delivery.
 * falls back gracefully to deterministic normalization if the LLM request fails.
 */
export const refineRecipeWithLLM = async (
  meal: MealDBMeal,
  options: RefinerOptions = {},
): Promise<NormalizedRecipe> => {
  const base = normalizeMealDBRecipe(meal);
  try {
    const { content } = await createChatCompletion({
      callName: 'recipe-refinement',
      client: options.client,
      model: options.model ?? ACTIVE_REFINER_MODEL,
      messages: [
        { role: 'system', content: prompts.recipeRefinement },
        { role: 'user', content: JSON.stringify(base) },
      ],
      responseFormat: { type: 'json_object' },
      temperature: REFINER_TEMPERATURE,
    });

    const parsed =
      safeExtractJson<{
        ingredients?: Partial<RecipeIngredient>[];
        steps?: Partial<RecipeStep>[];
      }>(content) ?? {};
    const ingredients = parseRefinedIngredients(parsed.ingredients);
    const steps = parseRefinedSteps(parsed.steps);

    if (ingredients.length === 0 || steps.length === 0) {
      return base;
    }

    return {
      id: base.id,
      title: base.title,
      ingredients,
      steps,
      totalEstimatedMinutes: calculateTotalMinutes(steps) ?? base.totalEstimatedMinutes,
    };
  } catch (error) {
    console.warn('[RecipeRefiner] Refinement failed, falling back to base recipe:', error);
    return base;
  }
};
