import type OpenAI from 'openai';
import { ACTIVE_REFINER_MODEL, openai } from '../llm';
import prompts from '../prompts';
import { REFINER_TEMPERATURE } from './constants';
import { calculateTotalMinutes, normalizeMealDBRecipe } from './normalizer';
import type { MealDBMeal, NormalizedRecipe, RecipeIngredient, RecipeStep } from './types';

/**
 * options for recipe refinement specifying an optional LLM client and model identifier
 */
export interface RefinerOptions {
  client?: OpenAI;
  model?: string;
}

// parses and formats ingredients returned by the LLM
function parseRefinedIngredients(ingredients?: Partial<RecipeIngredient>[]): RecipeIngredient[] {
  if (!Array.isArray(ingredients)) {
    return [];
  }

  return ingredients
    .filter((item) => Boolean(item.name?.trim()))
    .map((item) => {
      const name = item.name?.trim() ?? '';
      const measure = item.measure?.trim() ?? '';
      const text = item.text?.trim() || (measure ? `${measure} ${name}` : name);

      return { name, measure, text };
    });
}

// parses and indexes cooking steps returned by the LLM
function parseRefinedSteps(steps?: Partial<RecipeStep>[]): RecipeStep[] {
  if (!Array.isArray(steps)) {
    return [];
  }

  return steps
    .filter((item) => Boolean(item.instruction?.trim()))
    .map((item, index) => {
      const instruction = item.instruction?.trim() ?? '';
      const stepNumber = item.stepNumber ?? index + 1;
      const estimatedMinutes = item.estimatedMinutes;

      return { stepNumber, instruction, estimatedMinutes };
    });
}

/**
 * refines a raw TheMealDB meal record using an LLM to reconcile ingredient discrepancies
 * and clean step instructions for spoken dialogue delivery.
 * falls back gracefully to deterministic normalization if the LLM request fails.
 */
export async function refineRecipeWithLLM(
  meal: MealDBMeal,
  options: RefinerOptions = {},
): Promise<NormalizedRecipe> {
  const base = normalizeMealDBRecipe(meal);
  const client = options.client ?? openai;
  const model = options.model ?? ACTIVE_REFINER_MODEL;

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: prompts.recipeRefinement },
        { role: 'user', content: JSON.stringify(base) },
      ],
      response_format: { type: 'json_object' },
      temperature: REFINER_TEMPERATURE,
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
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
}
