import { MAX_MEALDB_INGREDIENTS } from './constants';
import type { MealDBMeal, NormalizedRecipe, RecipeIngredient, RecipeStep } from './types';

const sentenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

// extract structured ingredients from TheMealDB 20 flat slots
export function extractIngredients(meal: MealDBMeal): RecipeIngredient[] {
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
}

// split raw instructions into sentence-level steps and detect cooking times in minutes
export function extractSteps(instructions: string): RecipeStep[] {
  if (!instructions?.trim()) return [];

  const sentences = Array.from(sentenceSegmenter.segment(instructions))
    .map((s) => s.segment.trim())
    .filter(Boolean);

  return sentences.map((instruction, index) => {
    const match = instruction.match(/(\d+)\s?min/i);
    const minutes = match ? Number(match[1]) : undefined;

    return {
      stepNumber: index + 1,
      instruction,
      estimatedMinutes: minutes,
    };
  });
}

// normalize a raw TheMealDB meal record into a clean, structured recipe for the dialogue session
export function normalizeMealDBRecipe(meal: MealDBMeal): NormalizedRecipe {
  const ingredients = extractIngredients(meal);
  const steps = extractSteps(meal.strInstructions || '');

  const tags = meal.strTags
    ? meal.strTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const totalEstimatedMinutes = steps.reduce(
    (total, step) => total + (step.estimatedMinutes ?? 0),
    0,
  );

  return {
    id: meal.idMeal,
    title: meal.strMeal,
    category: meal.strCategory,
    area: meal.strArea,
    instructionsRaw: meal.strInstructions,
    thumbnail: meal.strMealThumb ?? null,
    tags,
    sourceUrl: meal.strSource ?? null,
    youtubeUrl: meal.strYoutube ?? null,
    ingredients,
    steps,
    totalEstimatedMinutes: totalEstimatedMinutes > 0 ? totalEstimatedMinutes : undefined,
  };
}
