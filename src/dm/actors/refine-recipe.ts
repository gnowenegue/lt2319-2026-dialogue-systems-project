import { fromPromise } from 'xstate';

import { getRefinedRecipe } from '../../recipes';
import type { NormalizedRecipe } from '../../recipes/types';

/**
 * refines a chosen recipe candidate by ID from TheMealDB API
 */
export const refineRecipeLogic = fromPromise(
  async ({ input }: { input: { candidateId: string } }): Promise<NormalizedRecipe> => {
    const refined = await getRefinedRecipe(input.candidateId);
    if (!refined) {
      throw new Error(`Failed to refine recipe candidate "${input.candidateId}"`);
    }

    return refined;
  },
);
