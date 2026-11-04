import { describe, expect, it } from 'vitest';
import {
  formatCheckTimerUtterance,
  formatDurationForSpeech,
  formatPrepBatchUtterance,
  formatStepUtterance,
  hasMorePrepBatches,
  lookupIngredient,
  prepareAssistantSpeech,
  resolveActiveStateName,
  resolveContextualGreeting,
  resolveContextualHelp,
} from '../helpers';
import { createMockRecipe } from './test-helpers';

describe('Dialogue Manager - Pure Spoken Formatting Helpers', () => {
  const mockRecipe = createMockRecipe();

  it('formats ingredient batches with correct conversational markers', () => {
    const ingredients = mockRecipe.ingredients;

    // batch 0: first
    const batch0 = formatPrepBatchUtterance(ingredients, 0, 2);
    expect(batch0).toBe('First: 1 pound penne rigate, and 1/4 cup olive oil. Got those?');
    expect(hasMorePrepBatches(ingredients, 0, 2)).toBe(true);

    // batch 1: intermediate next
    const batch1 = formatPrepBatchUtterance(ingredients, 1, 2);
    expect(batch1).toBe('Next: 3 cloves garlic, and 1/2 tsp red chile flakes. Got those?');
    expect(hasMorePrepBatches(ingredients, 1, 2)).toBe(true);

    // batch 3: final lastly
    const batch3 = formatPrepBatchUtterance(ingredients, 3, 2);
    expect(batch3).toBe(
      'Lastly: 6 leaves basil, and salt and pepper to taste. Ready to start cooking?',
    );
    expect(hasMorePrepBatches(ingredients, 3, 2)).toBe(false);
  });

  it('formats step instructions with natural conversational cues across steps', () => {
    const step1 = formatStepUtterance(mockRecipe.steps[0], 4);
    expect(step1).toBe(
      "Step 1: Bring a large pot of salted water to a boil. Let me know when you're ready.",
    );

    const step2 = formatStepUtterance(mockRecipe.steps[1], 4);
    expect(step2).toBe(
      "Step 2: Heat olive oil in a large skillet over medium heat and add garlic. Let me know when you're ready.",
    );

    // step 3 has estimatedMinutes: 10
    const step3 = formatStepUtterance(mockRecipe.steps[2], 4);
    expect(step3).toBe(
      'Step 3: Add chopped tomatoes, red chile flakes, and simmer for 10 minutes. Would you like me to start a timer for 10 minutes?',
    );

    // step 3 with timer already running
    const step3Running = formatStepUtterance(mockRecipe.steps[2], 4, true);
    expect(step3Running).toBe(
      "Step 3: Add chopped tomatoes, red chile flakes, and simmer for 10 minutes. Let me know when you're ready.",
    );

    const step4 = formatStepUtterance(mockRecipe.steps[3], 4);
    expect(step4).toBe(
      "Final step: Toss cooked penne with sauce and garnish with fresh basil. Let me know when you're done.",
    );
  });

  it('performs instant ingredient lookup accurately', () => {
    const ingredients = mockRecipe.ingredients;

    expect(lookupIngredient(ingredients, 'garlic')).toBe('You need 3 cloves garlic.');
    expect(lookupIngredient(ingredients, 'olive oil')).toBe('You need 1/4 cup olive oil.');
    expect(lookupIngredient(ingredients, 'saffron')).toBe("I don't see saffron in this recipe.");
  });

  it('formats durations into natural spoken dialogue phrasing for speech', () => {
    expect(formatDurationForSpeech(0)).toBe('0 seconds');
    expect(formatDurationForSpeech(-5)).toBe('0 seconds');
    expect(formatDurationForSpeech(1)).toBe('1 second');
    expect(formatDurationForSpeech(45)).toBe('45 seconds');
    expect(formatDurationForSpeech(60)).toBe('1 minute');
    expect(formatDurationForSpeech(120)).toBe('2 minutes');
    expect(formatDurationForSpeech(61)).toBe('1 minute and 1 second');
    expect(formatDurationForSpeech(195)).toBe('3 minutes and 15 seconds');
    expect(formatDurationForSpeech(3600)).toBe('1 hour');
    expect(formatDurationForSpeech(7200)).toBe('2 hours');
    expect(formatDurationForSpeech(5400)).toBe('1 hour and 30 minutes');
    expect(formatDurationForSpeech(3661)).toBe('1 hour, 1 minute and 1 second');
  });

  it('formats conversational timer query responses accurately', () => {
    // empty timers
    expect(formatCheckTimerUtterance([])).toBe("You don't have any active timers.");

    // single timer check
    const now = 1000000;
    const timers = [
      {
        id: '1',
        label: 'pasta',
        targetTimestamp: now + 120000,
        totalDurationSeconds: 120,
      },
    ];
    expect(formatCheckTimerUtterance(timers, 'pasta', now)).toBe(
      'The pasta timer has 2 minutes left.',
    );
    expect(formatCheckTimerUtterance(timers, undefined, now)).toBe(
      'Your pasta timer has 2 minutes left.',
    );
    expect(formatCheckTimerUtterance(timers, 'garlic bread', now)).toBe(
      "I couldn't find an active timer for garlic bread.",
    );

    // multiple timers check
    const multiTimers = [
      {
        id: '1',
        label: 'pasta',
        targetTimestamp: now + 120000,
        totalDurationSeconds: 120,
      },
      {
        id: '2',
        label: 'oven',
        targetTimestamp: now + 900000,
        totalDurationSeconds: 900,
      },
    ];
    expect(formatCheckTimerUtterance(multiTimers, undefined, now)).toBe(
      'You have 2 active timers: pasta with 2 minutes left, and oven with 15 minutes left.',
    );
  });

  describe('prepareAssistantSpeech helper', () => {
    it('appends assistant turn and returns updated speech status without mutating original messages', () => {
      const initialMessages = [{ role: 'system' as const, content: 'system prompt' }];
      const context = {
        messages: initialMessages,
      } as Parameters<typeof prepareAssistantSpeech>[0];

      const result = prepareAssistantSpeech(context, 'Hello! What are we cooking?');
      expect(result.lastSpokenUtterance).toBe('Hello! What are we cooking?');
      expect(result.speechStatus).toBe('speaking');
      expect(result.messages).toHaveLength(2);
      expect(result.messages[1]).toMatchObject({
        role: 'assistant',
        content: 'Hello! What are we cooking?',
      });
      expect(result.messages[1].timestamp).toBeDefined();

      // immutability check
      expect(initialMessages).toHaveLength(1);
      expect(context.messages).toBe(initialMessages);
    });

    it('leaves messages unchanged when text is empty', () => {
      const initialMessages = [{ role: 'user' as const, content: 'hi' }];
      const context = {
        messages: initialMessages,
      } as Parameters<typeof prepareAssistantSpeech>[0];

      const result = prepareAssistantSpeech(context, '');
      expect(result.lastSpokenUtterance).toBe('');
      expect(result.speechStatus).toBe('speaking');
      expect(result.messages).toBe(initialMessages);
    });
  });

  describe('resolveActiveStateName', () => {
    it('extracts string states', () => {
      expect(resolveActiveStateName({ getSnapshot: () => ({ value: 'PromptRecipe' }) })).toBe(
        'PromptRecipe',
      );
    });

    it('extracts parent key from nested state objects', () => {
      expect(
        resolveActiveStateName({
          getSnapshot: () => ({ value: { WaitingForStepCommand: 'inner' } }),
        }),
      ).toBe('WaitingForStepCommand');
    });

    it('returns undefined if snapshot is missing', () => {
      expect(resolveActiveStateName({})).toBeUndefined();
    });
  });

  describe('resolveContextualHelp & resolveContextualGreeting', () => {
    const dummyContext = {
      recipe: mockRecipe,
      currentStepIndex: 1,
      messages: [],
    } as unknown as Parameters<typeof resolveContextualHelp>[0];

    it('returns state-specific help guidance', () => {
      expect(resolveContextualHelp(dummyContext, 'PromptRecipe')).toContain(
        "Tell me what you'd like to cook",
      );
      expect(resolveContextualHelp(dummyContext, 'ConfirmRecipe')).toContain(
        'Say yes to start cooking',
      );
      expect(resolveContextualHelp(dummyContext, 'WaitingForPrepConfirmation')).toContain(
        'gathered these ingredients',
      );
      expect(resolveContextualHelp(dummyContext, 'WaitingForStepCommand')).toContain('next step');
      expect(resolveContextualHelp(dummyContext, 'Completed')).toContain('finished this recipe');
    });

    it('returns state-specific greeting prompts', () => {
      expect(resolveContextualGreeting(dummyContext, 'PromptRecipe')).toBe(
        'Hi! What would you like to cook today?',
      );
      expect(resolveContextualGreeting(dummyContext, 'ConfirmRecipe')).toContain(
        'We have Spicy Arrabiata Penne ready',
      );
      expect(resolveContextualGreeting(dummyContext, 'WaitingForPrepConfirmation')).toContain(
        'gathering ingredients for Spicy Arrabiata Penne',
      );
      expect(resolveContextualGreeting(dummyContext, 'WaitingForStepCommand')).toContain(
        "We're on step 2 of 4",
      );
    });
  });
});
