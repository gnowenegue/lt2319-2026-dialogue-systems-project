import { ROLES } from '../constants';
import prompts from '../prompts';
import type { RecipeIngredient, RecipeStep } from '../recipes/types';
import { calculateRemainingSeconds } from '../timers';
import type { ActiveTimer } from '../timers/types';
import { INGREDIENTS_PER_PREP_BATCH } from './constants';
import type { CookingContext, Message, RecipeCandidate, SpeechStatus } from './types';

/**
 * formats a 2-item ingredient batch for spoken delivery during mise en place prep
 */
export const formatPrepBatchUtterance = (
  ingredients: RecipeIngredient[],
  batchIndex: number,
  batchSize = INGREDIENTS_PER_PREP_BATCH,
): string => {
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

  return `Next: ${itemsText}. Got those?`;
};

/**
 * determines whether additional ingredient batches remain after the current batch index
 */
export const hasMorePrepBatches = (
  ingredients: RecipeIngredient[],
  batchIndex: number,
  batchSize = INGREDIENTS_PER_PREP_BATCH,
): boolean => {
  return (batchIndex + 1) * batchSize < ingredients.length;
};

/**
 * formats an active cooking step instruction for concise spoken delivery (<25 words)
 */
export const formatStepUtterance = (
  step: RecipeStep,
  totalSteps: number,
  isTimerRunning = false,
): string => {
  const instruction = step.instruction.trim().replace(/\.$/, '');

  if (step.estimatedMinutes && step.estimatedMinutes > 0 && !isTimerRunning) {
    const duration = formatDurationForSpeech(step.estimatedMinutes * 60);
    const prefix = step.stepNumber === totalSteps ? 'Final step' : `Step ${step.stepNumber}`;
    return `${prefix}: ${instruction}. Would you like me to start a timer for ${duration}?`;
  }

  if (step.stepNumber === totalSteps) {
    return `Final step: ${instruction}. Let me know when you're done.`;
  }

  return `Step ${step.stepNumber}: ${instruction}. Let me know when you're ready.`;
};

/**
 * answers in-memory factual queries about ingredients with zero LLM latency
 */
export const lookupIngredient = (ingredients: RecipeIngredient[], queryName?: string): string => {
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
};

/**
 * formats duration in seconds into natural conversational phrasing for spoken delivery
 */
export const formatDurationForSpeech = (totalSeconds: number): string => {
  const total = Math.max(0, Math.floor(totalSeconds));
  if (total === 0) {
    return '0 seconds';
  }

  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  }
  if (seconds > 0) {
    parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`);
  }

  if (parts.length === 1) {
    return parts[0];
  }
  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }
  return `${parts[0]}, ${parts[1]} and ${parts[2]}`;
};

/**
 * formats a conversational response when querying active kitchen timers
 */
export const formatCheckTimerUtterance = (
  activeTimers: readonly ActiveTimer[],
  queryLabel?: string,
  now = Date.now(),
): string => {
  if (activeTimers.length === 0) {
    return "You don't have any active timers.";
  }

  if (queryLabel?.trim()) {
    const normalized = queryLabel.trim().toLowerCase();
    const match = activeTimers.find(
      (t) =>
        t.label.toLowerCase() === normalized ||
        t.label.toLowerCase().includes(normalized) ||
        normalized.includes(t.label.toLowerCase()),
    );

    if (match) {
      const remaining = calculateRemainingSeconds(match.targetTimestamp, now);
      return `The ${match.label} timer has ${formatDurationForSpeech(remaining)} left.`;
    }

    return `I couldn't find an active timer for ${queryLabel}.`;
  }

  if (activeTimers.length === 1) {
    const timer = activeTimers[0];
    const remaining = calculateRemainingSeconds(timer.targetTimestamp, now);
    return `Your ${timer.label} timer has ${formatDurationForSpeech(remaining)} left.`;
  }

  const descriptions = activeTimers.map((t) => {
    const remaining = calculateRemainingSeconds(t.targetTimestamp, now);
    return `${t.label} with ${formatDurationForSpeech(remaining)} left`;
  });

  return `You have ${activeTimers.length} active timers: ${descriptions.join(', and ')}.`;
};

/**
 * formats discovered recipe candidates for concise spoken delivery (<30 words)
 */
export const formatCandidateUtterance = (candidates: readonly RecipeCandidate[]): string => {
  if (candidates.length === 0) {
    return 'No recipes found.';
  }

  const items = candidates.map((c) => `${c.index}) ${c.title}`).join(', ');
  return `I found ${candidates.length} options: ${items}. Which one would you like?`;
};

/**
 * matches a user choice by 1-based index or candidate title match
 */
export const matchCandidate = (
  candidates: readonly RecipeCandidate[],
  index?: number,
  query?: string,
): RecipeCandidate | null => {
  // numeric index match (1-indexed)
  if (typeof index === 'number' && index >= 1 && index <= candidates.length) {
    return candidates[index - 1] ?? null;
  }

  if (!query?.trim()) {
    return null;
  }

  const normalized = query.toLowerCase().trim();

  // title matching: direct substring or token match
  const queryTokens = normalized.split(/\s+/).filter((t) => t.length > 2);
  const matchByTitle = candidates.find((c) => {
    const titleLower = c.title.toLowerCase();
    if (titleLower.includes(normalized) || normalized.includes(titleLower)) {
      return true;
    }

    const titleTokens = titleLower.split(/\s+/).filter((t) => t.length > 2);
    return queryTokens.some((qTok) => titleTokens.includes(qTok));
  });

  return matchByTitle ?? null;
};

/**
 * creates updated assistant speech context fields and appends the spoken turn to conversation history
 */
export const prepareAssistantSpeech = (
  context: CookingContext,
  text: string,
): { lastSpokenUtterance: string; speechStatus: SpeechStatus; messages: Message[] } => {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return {
    lastSpokenUtterance: text,
    speechStatus: 'speaking',
    messages: text
      ? [
          ...context.messages,
          {
            role: ROLES.Assistant,
            content: text,
            timestamp,
          },
        ]
      : context.messages,
  };
};

/**
 * extracts the active return state snapshot for knowledge and step detail queries
 */
export const resolveReturnState = (
  context: CookingContext,
  self: { getSnapshot?: () => { value?: unknown } },
): CookingContext['returnState'] => {
  if (context.returnState) return context.returnState;
  const current = self.getSnapshot?.()?.value;
  return typeof current === 'string'
    ? (current as CookingContext['returnState'])
    : 'WaitingForStepCommand';
};

/**
 * extracts the primary active state name from actor snapshot
 */
export const resolveActiveStateName = (self: {
  getSnapshot?: () => { value?: unknown };
}): string | undefined => {
  const snapshotValue = self.getSnapshot?.()?.value;
  if (typeof snapshotValue === 'string') return snapshotValue;
  if (typeof snapshotValue === 'object' && snapshotValue !== null) {
    return Object.keys(snapshotValue)[0];
  }
  return undefined;
};

/**
 * resolves contextual help guidance tailored to current dialogue state
 */
export const resolveContextualHelp = (
  _context: CookingContext,
  state: string | undefined,
): string => {
  switch (state) {
    case 'WaitingForPrepConfirmation':
    case 'AnnouncePrepBatch':
      return prompts.helpPrep;
    case 'WaitingForStepCommand':
    case 'AnnounceStep':
      return prompts.helpStep;
    case 'SelectingRecipe':
      return prompts.selectRecipeHelp;
    case 'ConfirmRecipe':
      return prompts.helpConfirmRecipe;
    case 'Completed':
      return prompts.helpCompleted;
    default:
      return prompts.helpPromptRecipe;
  }
};

/**
 * resolves contextual greeting acknowledging current flow and prompting next step
 */
export const resolveContextualGreeting = (
  context: CookingContext,
  state: string | undefined,
): string => {
  const title = context.recipe?.title;
  const stepNumber = (context.currentStepIndex ?? 0) + 1;
  const totalSteps = context.recipe?.steps.length ?? 0;

  switch (state) {
    case 'WaitingForStepCommand':
    case 'AnnounceStep':
      return `Hey! We're on step ${stepNumber} of ${totalSteps}. Say 'next step' when you're ready, or 'repeat' to hear it again.`;
    case 'WaitingForPrepConfirmation':
    case 'AnnouncePrepBatch':
      return title
        ? `Hey! We're gathering ingredients for ${title}. Ready to keep going, or want to skip to cooking?`
        : "Hey! We're gathering ingredients. Ready to keep going, or want to skip to cooking?";
    case 'ConfirmRecipe':
      return title
        ? `Hey there! We have ${title} ready. Say 'yes' to start cooking, or search for another dish.`
        : 'Hey there! Ready to start cooking, or search for another dish?';
    case 'SelectingRecipe':
      return prompts.selectRecipeHelp;
    case 'Completed':
      return title
        ? `Hi there! You've finished cooking ${title}. Ready to make something else?`
        : "Hi there! You've finished this recipe. Ready to make something else?";
    default:
      return prompts.promptRecipe;
  }
};
