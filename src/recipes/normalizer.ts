import { MAX_MEALDB_INGREDIENTS } from './constants';
import type { MealDBMeal, NormalizedRecipe, RecipeIngredient, RecipeStep } from './types';

const sentenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

/**
 * extract structured ingredients from TheMealDB 20 flat slots
 */
export const extractIngredients = (meal: MealDBMeal): RecipeIngredient[] => {
  const ingredients: RecipeIngredient[] = [];

  for (let i = 1; i <= MAX_MEALDB_INGREDIENTS; i++) {
    const name = meal[`strIngredient${i}`]?.trim();
    if (name) {
      const measure = meal[`strMeasure${i}`]?.trim() ?? '';
      ingredients.push({
        name,
        measure,
        text: measure ? `${measure} ${name}` : name,
      });
    }
  }

  return ingredients;
};

const MINUTES_RE = /\b(\d+)\s*(?:mins?|minutes?)\b/i;
const HOURS_RE = /\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i;

// parses duration in minutes from instruction text supporting hours and minutes
const parseStepMinutes = (instruction: string): number | undefined => {
  const hourMatch = HOURS_RE.exec(instruction);
  const minuteMatch = MINUTES_RE.exec(instruction);

  if (hourMatch || minuteMatch) {
    const hours = hourMatch ? Number(hourMatch[1]) : 0;
    const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
    const total = Math.round(hours * 60 + minutes);
    return total > 0 ? total : undefined;
  }

  return undefined;
};

/**
 * split raw instructions into sentence-level steps and detect cooking times in minutes
 */
export const extractSteps = (instructions: string): RecipeStep[] => {
  if (!instructions?.trim()) return [];

  const normalized = instructions.replace(/\r\n/g, '\n').trim();
  const sentences = Array.from(sentenceSegmenter.segment(normalized))
    .map((s) => s.segment.trim())
    .filter(Boolean);

  return sentences.map((instruction, index) => ({
    stepNumber: index + 1,
    instruction,
    estimatedMinutes: parseStepMinutes(instruction),
  }));
};

/**
 * calculates the sum of estimated cooking minutes across recipe steps
 */
export const calculateTotalMinutes = (steps: RecipeStep[]): number | undefined => {
  const total = steps.reduce((sum, step) => sum + (step.estimatedMinutes ?? 0), 0);
  return total > 0 ? total : undefined;
};

/**
 * normalize a raw TheMealDB meal record into a clean, structured recipe for the dialogue session
 */
export const normalizeMealDBRecipe = (meal: MealDBMeal): NormalizedRecipe => {
  const ingredients = extractIngredients(meal);
  const steps = extractSteps(meal.strInstructions || '');

  return {
    id: meal.idMeal,
    title: meal.strMeal,
    ingredients,
    steps,
    totalEstimatedMinutes: calculateTotalMinutes(steps),
  };
};
