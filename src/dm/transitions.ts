/**
 * shared transition configurations for procedural cooking machine states
 */

export const advancePrepBatchTransition = [
  {
    guard: 'hasMorePrepBatches',
    actions: 'advancePrepBatch',
    target: 'AnnouncePrepBatch',
  },
  {
    target: 'AnnounceStep',
  },
] as const;

export const advanceCookingStepTransition = [
  {
    guard: 'isLastStep',
    target: 'Completed',
  },
  {
    actions: 'advanceCookingStep',
    target: 'AnnounceStep',
  },
] as const;

export const gotoStepTransition = [
  {
    guard: 'isValidStepNumber',
    actions: 'setStepFromGoto',
    target: 'AnnounceStep',
  },
  {
    actions: ['repromptInvalidStep', 'speakLastUtterance'],
  },
] as const;

export const resumeListeningTransition = [
  {
    guard: 'isNoInputLimitReached',
    actions: ['resetNoInput', 'spst.listen'],
  },
  {
    actions: ['setListening', 'spst.listen'],
  },
] as const;
