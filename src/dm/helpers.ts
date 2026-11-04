import { ROLES } from '../constants';
import type { RecipeIngredient, RecipeStep } from '../recipes/types';
import { calculateRemainingSeconds } from '../timers';
import type { ActiveTimer } from '../timers/types';
import { INGREDIENTS_PER_PREP_BATCH } from './constants';
import type { CookingContext, Message, RecipeCandidate, SpeechStatus } from './types';

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

  return `Next: ${itemsText}. Got those?`;
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
  const instruction = step.instruction.trim().replace(/\.$/, '');

  if (step.stepNumber === totalSteps) {
    return `Final step: ${instruction}. Let me know when you're done.`;
  }

  return `Step ${step.stepNumber}: ${instruction}. Let me know when you're ready.`;
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

/**
 * formats duration in seconds into natural conversational phrasing for spoken delivery
 */
export function formatDurationForSpeech(totalSeconds: number): string {
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
}

/**
 * formats a conversational response when querying active kitchen timers
 */
export function formatCheckTimerUtterance(
  activeTimers: readonly ActiveTimer[],
  queryLabel?: string,
  now = Date.now(),
): string {
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
}

/**
 * formats discovered recipe candidates for concise spoken delivery (<30 words)
 */
export function formatCandidateUtterance(candidates: readonly RecipeCandidate[]): string {
  if (candidates.length === 0) {
    return 'No recipes found.';
  }

  const items = candidates.map((c) => `${c.index}) ${c.title}`).join(', ');
  return `I found ${candidates.length} options: ${items}. Which one would you like?`;
}

/**
 * matches a user choice by 1-based index, ordinal phrase, or partial title match
 */
export function matchCandidate(
  candidates: readonly RecipeCandidate[],
  index?: number,
  query?: string,
): RecipeCandidate | null {
  // numeric index match (1-indexed)
  if (typeof index === 'number' && index >= 1 && index <= candidates.length) {
    return candidates[index - 1] ?? null;
  }

  if (!query?.trim()) {
    return null;
  }

  const normalized = query.toLowerCase().trim();

  // ordinal and relative keyword matching
  if (/\b(first|1st|number 1|one)\b/i.test(normalized)) {
    return candidates[0] ?? null;
  }
  if (/\b(second|2nd|number 2|two)\b/i.test(normalized) && candidates.length >= 2) {
    return candidates[1] ?? null;
  }
  if (/\b(third|3rd|number 3|three)\b/i.test(normalized) && candidates.length >= 3) {
    return candidates[2] ?? null;
  }
  if (/\b(last|final)\b/i.test(normalized) && candidates.length > 0) {
    return candidates[candidates.length - 1] ?? null;
  }

  // title matching: substring or significant token overlap
  const queryTokens = normalized.split(/\s+/).filter((t) => t.length > 2);
  const matchByTitle = candidates.find((c) => {
    const titleLower = c.title.toLowerCase();
    if (titleLower.includes(normalized) || normalized.includes(titleLower)) {
      return true;
    }

    const titleTokens = titleLower.split(/\s+/).filter((t) => t.length > 2);
    return queryTokens.some((qTok) =>
      titleTokens.some((tTok) => tTok.includes(qTok) || qTok.includes(tTok)),
    );
  });

  return matchByTitle ?? null;
}

/**
 * creates updated assistant speech context fields and appends the spoken turn to conversation history
 */
export function prepareAssistantSpeech(
  context: CookingContext,
  text: string,
): { lastSpokenUtterance: string; speechStatus: SpeechStatus; messages: Message[] } {
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
}
