import { describe, expect, it } from 'vitest';

import { extractIngredients, extractSteps, normalizeMealDBRecipe } from '../normalizer';
import type { MealDBMeal } from '../types';

describe('Recipe Normalizer', () => {
  describe('extractIngredients', () => {
    it('extracts non-empty ingredients paired with measurements', () => {
      const mockMeal = {
        idMeal: '1',
        strMeal: 'Test Meal',
        strInstructions: 'Test',
        strIngredient1: 'penne rigate',
        strMeasure1: '1 pound',
        strIngredient2: 'garlic',
        strMeasure2: '3 cloves',
        strIngredient3: '',
        strMeasure3: '',
        strIngredient4: null,
        strMeasure4: null,
      } as unknown as MealDBMeal;

      const ingredients = extractIngredients(mockMeal);

      expect(ingredients).toHaveLength(2);
      expect(ingredients[0]).toEqual({
        name: 'penne rigate',
        measure: '1 pound',
        text: '1 pound penne rigate',
      });
      expect(ingredients[1]).toEqual({
        name: 'garlic',
        measure: '3 cloves',
        text: '3 cloves garlic',
      });
    });

    it('handles an ingredient with no measurement without leading spaces', () => {
      const mockMeal = {
        idMeal: '1',
        strMeal: 'Test Meal',
        strInstructions: 'Test',
        strIngredient1: 'kosher salt',
        strMeasure1: '',
      } as unknown as MealDBMeal;

      const ingredients = extractIngredients(mockMeal);

      expect(ingredients).toHaveLength(1);
      expect(ingredients[0]).toEqual({
        name: 'kosher salt',
        measure: '',
        text: 'kosher salt',
      });
    });

    it('returns an empty array when no ingredients are present', () => {
      const mockMeal = {
        idMeal: '1',
        strMeal: 'Empty Meal',
        strInstructions: 'Test',
      } as unknown as MealDBMeal;

      expect(extractIngredients(mockMeal)).toEqual([]);
    });
  });

  describe('extractSteps', () => {
    it('splits instructions into numbered sentence-level steps', () => {
      const text =
        'Bring a large pot of water to a boil. Add kosher salt to the boiling water, then add the pasta.';
      const steps = extractSteps(text);

      expect(steps).toHaveLength(2);
      expect(steps[0]).toEqual({
        stepNumber: 1,
        instruction: 'Bring a large pot of water to a boil.',
        estimatedMinutes: undefined,
      });
      expect(steps[1]).toEqual({
        stepNumber: 2,
        instruction: 'Add kosher salt to the boiling water, then add the pasta.',
        estimatedMinutes: undefined,
      });
    });

    it('extracts cooking minutes when present in a step', () => {
      const text = 'Cook pasta for about 9 minutes. In a separate pan, heat oil.';
      const steps = extractSteps(text);

      expect(steps).toHaveLength(2);
      expect(steps[0].estimatedMinutes).toBe(9);
      expect(steps[1].estimatedMinutes).toBeUndefined();
    });

    it('handles empty or whitespace instructions gracefully', () => {
      expect(extractSteps('')).toEqual([]);
      expect(extractSteps('   ')).toEqual([]);
    });
  });

  describe('normalizeMealDBRecipe', () => {
    it('normalizes a complete meal record with total cooking time', () => {
      const mockMeal = {
        idMeal: '52771',
        strMeal: 'Spicy Arrabiata Penne',
        strCategory: 'Vegetarian',
        strArea: 'Italian',
        strInstructions:
          'Bring water to boil. Cook pasta for 9 minutes.\r\nAdd garlic and cook for 2 minutes.',
        strMealThumb: 'https://example.com/thumb.jpg',
        strTags: 'Pasta,Curry',
        strYoutube: 'https://youtube.com/watch?v=123',
        strSource: 'https://recipe.com',
        strIngredient1: 'penne',
        strMeasure1: '1 lb',
      } as unknown as MealDBMeal;

      const recipe = normalizeMealDBRecipe(mockMeal);

      expect(recipe.id).toBe('52771');
      expect(recipe.title).toBe('Spicy Arrabiata Penne');
      expect(recipe.ingredients).toHaveLength(1);
      expect(recipe.steps).toHaveLength(3);
      expect(recipe.totalEstimatedMinutes).toBe(11); // sums 9 minutes from step 1 and 2 minutes from step 2
    });
  });
});
