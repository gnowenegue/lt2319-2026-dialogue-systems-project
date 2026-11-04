import prompts from '../prompts';
import { hasMorePrepBatches as checkHasMorePrepBatches, matchCandidate } from './helpers';
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
  hasMatchingCandidate: ({ context, event }: { context: CookingContext; event: CookingEvent }) => {
    if (event.type === 'SELECT_RECIPE') {
      return matchCandidate(context.recipeCandidates ?? [], event.index, event.query) !== null;
    }
    if (event.type === 'GOTO_STEP') {
      return matchCandidate(context.recipeCandidates ?? [], event.stepNumber) !== null;
    }
    return false;
  },
  isUnderNoInputLimit: ({ context }: { context: CookingContext }) =>
    context.noInputCount < prompts.noInput.length,
  isNoInputLimitReached: ({ context }: { context: CookingContext }) =>
    context.noInputCount >= prompts.noInput.length,
  hasPendingUtterance: ({ context }: { context: CookingContext }) =>
    Boolean(context.pendingUtterance),
  hasPendingStepTimer: ({ context }: { context: CookingContext }) =>
    Boolean(context.pendingStepTimer),
};
