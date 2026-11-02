import { hasMorePrepBatches as checkHasMorePrepBatches } from './helpers';
import type { CookingContext, CookingEvent } from './types';

/**
 * pure guard functions enforcing state transition preconditions in the cooking machine
 */
export const cookingGuards = {
  hasMorePrepBatches: ({ context }: { context: CookingContext }) =>
    checkHasMorePrepBatches(context.recipe?.ingredients ?? [], context.prepBatchIndex),
  isLastStep: ({ context }: { context: CookingContext }) =>
    context.currentStepIndex >= (context.recipe?.steps.length ?? 1) - 1,
  canGoBackStep: ({ context }: { context: CookingContext }) => context.currentStepIndex > 0,
  isValidStepNumber: ({ context, event }: { context: CookingContext; event: CookingEvent }) => {
    if (event.type !== 'GOTO_STEP') return false;
    const stepNum = event.stepNumber;
    return stepNum >= 1 && stepNum <= (context.recipe?.steps.length ?? 0);
  },
};
