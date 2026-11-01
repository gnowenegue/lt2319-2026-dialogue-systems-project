import type { RecipeIngredient, RecipeStep } from '../recipes/types';
import { INGREDIENTS_PER_PREP_BATCH } from './constants';

/**
 * formats a 2-item ingredient batch for spoken delivery during mise en place prep
 */
export function formatPrepBatchUtterance(
  ingredients: RecipeIngredient[],
  batchIndex: number,
  batchSize = INGREDIENTS_PER_PREP_BATCH,
): string {
  const start = batchIndex * batchSize;
  const batch = ingredients.slice(start, start + batchSize);

  if (batch.length === 0) {
    return 'All ingredients are gathered.';
  }

  const itemsText = batch.map((item) => item.text).join(', and ');
  const isFirst = batchIndex === 0;
  const isLast = start + batchSize >= ingredients.length;

  if (isFirst) {
    return `First: ${itemsText}. Got those?`;
  }

  if (isLast) {
    return `Lastly: ${itemsText}. Ready to start cooking?`;
  }

  return `Next: ${itemsText}.`;
}

/**
 * determines whether additional ingredient batches remain after the current batch index
 */
export function hasMorePrepBatches(
  ingredients: RecipeIngredient[],
  batchIndex: number,
  batchSize = INGREDIENTS_PER_PREP_BATCH,
): boolean {
  return (batchIndex + 1) * batchSize < ingredients.length;
}

/**
 * formats an active cooking step instruction for concise spoken delivery (<25 words)
 */
export function formatStepUtterance(step: RecipeStep, totalSteps: number): string {
  if (step.stepNumber === 1) {
    return `Step 1: ${step.instruction} Say 'next' when done.`;
  }

  if (step.stepNumber === totalSteps) {
    return `Final step: ${step.instruction} Enjoy your meal!`;
  }

  return `Step ${step.stepNumber}: ${step.instruction}`;
}

/**
 * answers in-memory factual queries about ingredients with zero LLM latency
 */
export function lookupIngredient(ingredients: RecipeIngredient[], queryName?: string): string {
  if (!queryName?.trim()) {
    const list = ingredients.map((item) => item.text).join(', ');

    return `You need: ${list}.`;
  }

  const normalizedQuery = queryName.toLowerCase().trim();
  const match = ingredients.find(
    (item) =>
      item.name.toLowerCase().includes(normalizedQuery) ||
      normalizedQuery.includes(item.name.toLowerCase()) ||
      item.text.toLowerCase().includes(normalizedQuery),
  );

  if (match) {
    return `You need ${match.text}.`;
  }

  return `I don't see ${queryName} in this recipe.`;
}
