import type { speechstate } from 'speechstate';
import { describe, expect, it } from 'vitest';
import { createActor, fromPromise, fromTransition } from 'xstate';

import type { NormalizedRecipe } from '../../recipes/types';
import { cookingMachine } from '../cooking-machine';
import {
  formatCheckTimerUtterance,
  formatDurationForSpeech,
  formatPrepBatchUtterance,
  formatStepUtterance,
  hasMorePrepBatches,
  lookupIngredient,
} from '../helpers';

const mockArrabiataRecipe: NormalizedRecipe = {
  id: '52771',
  title: 'Spicy Arrabiata Penne',
  totalEstimatedMinutes: 20,
  ingredients: [
    { name: 'penne rigate', measure: '1 pound', text: '1 pound penne rigate' },
    { name: 'olive oil', measure: '1/4 cup', text: '1/4 cup olive oil' },
    { name: 'garlic', measure: '3 cloves', text: '3 cloves garlic' },
    { name: 'red chile flakes', measure: '1/2 tsp', text: '1/2 tsp red chile flakes' },
    { name: 'chopped tomatoes', measure: '1 tin', text: '1 tin chopped tomatoes' },
    { name: 'Italian seasoning', measure: '1/2 tsp', text: '1/2 tsp Italian seasoning' },
    { name: 'basil', measure: '6 leaves', text: '6 leaves basil' },
    { name: 'salt and pepper', measure: 'to taste', text: 'salt and pepper to taste' },
  ],
  steps: [
    {
      stepNumber: 1,
      instruction: 'Bring a large pot of salted water to a boil.',
    },
    {
      stepNumber: 2,
      instruction: 'Heat olive oil in a large skillet over medium heat and add garlic.',
    },
    {
      stepNumber: 3,
      instruction: 'Add chopped tomatoes, red chile flakes, and simmer for 10 minutes.',
      estimatedMinutes: 10,
    },
    {
      stepNumber: 4,
      instruction: 'Toss cooked penne with sauce and garnish with fresh basil.',
    },
  ],
};

const createTestCookingActor = (recipe: NormalizedRecipe = mockArrabiataRecipe) => {
  const machine = cookingMachine.provide({
    actors: {
      fetchRecipeActor: fromPromise(async () => recipe),
      speechstateActor: fromTransition((state) => state, {}) as unknown as typeof speechstate,
    },
  });
  return createActor(machine).start();
};

describe('Dialogue Manager - Procedural Cooking State Machine', () => {
  it('executes the full happy path from discovery to completed meal', async () => {
    const actor = createTestCookingActor();

    expect(actor.getSnapshot().value).toBe('Idle');

    // step 1: start interaction
    actor.send({ type: 'START' });
    expect(actor.getSnapshot().value).toBe('Prepare');
    actor.send({ type: 'ASRTTS_READY' });
    expect(actor.getSnapshot().value).toBe('PromptRecipe');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      'Hi! What would you like to cook today?',
    );

    // step 2: search recipe
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });

    // allow microtask queue to process actor invocation
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actor.getSnapshot().value).toBe('ConfirmRecipe');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain('Spicy Arrabiata Penne');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain(
      'Ready to gather ingredients?',
    );

    // step 3: confirm ingredient prep (Batch 1: items 1-2)
    actor.send({ type: 'AFFIRM' });
    expect(actor.getSnapshot().value).toBe('WaitingForPrepConfirmation');
    expect(actor.getSnapshot().context.prepBatchIndex).toBe(0);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      'First: 1 pound penne rigate, and 1/4 cup olive oil. Got those?',
    );

    // step 4: confirm batch 1 -> advance to Batch 2 (items 3-4)
    actor.send({ type: 'AFFIRM' });
    expect(actor.getSnapshot().value).toBe('WaitingForPrepConfirmation');
    expect(actor.getSnapshot().context.prepBatchIndex).toBe(1);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      'Next: 3 cloves garlic, and 1/2 tsp red chile flakes.',
    );

    // step 5: confirm batch 2 -> advance to Batch 3 (items 5-6)
    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().value).toBe('WaitingForPrepConfirmation');
    expect(actor.getSnapshot().context.prepBatchIndex).toBe(2);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      'Next: 1 tin chopped tomatoes, and 1/2 tsp Italian seasoning.',
    );

    // step 6: confirm batch 3 -> advance to Batch 4 (final items 7-8)
    actor.send({ type: 'AFFIRM' });
    expect(actor.getSnapshot().value).toBe('WaitingForPrepConfirmation');
    expect(actor.getSnapshot().context.prepBatchIndex).toBe(3);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      'Lastly: 6 leaves basil, and salt and pepper to taste. Ready to start cooking?',
    );

    // step 7: confirm final batch -> enters Step 1 of cooking
    actor.send({ type: 'AFFIRM' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      "Step 1: Bring a large pot of salted water to a boil. Say 'next' when done.",
    );

    // step 8: advance to Step 2
    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      'Step 2: Heat olive oil in a large skillet over medium heat and add garlic.',
    );

    // step 9: advance to Step 3
    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(2);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      'Step 3: Add chopped tomatoes, red chile flakes, and simmer for 10 minutes.',
    );

    // step 10: advance from Step 4 (last step) -> completes recipe
    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(3);

    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().value).toBe('Completed');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      'All steps completed. Enjoy your meal!',
    );
  });

  it('answers in-step ingredient queries factually from memory without state distortion', async () => {
    const actor = createTestCookingActor();

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // skip prep directly into step 1
    actor.send({ type: 'SKIP_PREP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');

    // advance to step 2 (where garlic is added)
    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);

    // cook asks: "Wait, how much garlic?"
    actor.send({ type: 'QUERY_INGREDIENT', ingredient: 'garlic' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe('You need 3 cloves garlic.');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);

    // cook asks about missing ingredient: "Do we need oregano?"
    actor.send({ type: 'QUERY_INGREDIENT', ingredient: 'oregano' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      "I don't see oregano in this recipe.",
    );

    // cook can still proceed with "next"
    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().context.currentStepIndex).toBe(2);
  });

  it('supports skipping ingredient prep directly when cook has everything ready', async () => {
    const actor = createTestCookingActor();

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actor.getSnapshot().value).toBe('ConfirmRecipe');

    // cook says: "I already have everything ready"
    actor.send({ type: 'SKIP_PREP' });

    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain('Step 1: Bring a large pot');
  });

  it('handles step navigation: previous, repeat, and direct jump', async () => {
    const actor = createTestCookingActor();

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    actor.send({ type: 'SKIP_PREP' });

    // currently on step 1 (index 0)
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);

    // PREVIOUS on step 1 stays at step 1
    actor.send({ type: 'PREVIOUS_STEP' });
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);

    // jump to step 3
    actor.send({ type: 'GOTO_STEP', stepNumber: 3 });
    expect(actor.getSnapshot().context.currentStepIndex).toBe(2);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain(
      'Step 3: Add chopped tomatoes',
    );

    // PREVIOUS from step 3 goes back to step 2
    actor.send({ type: 'PREVIOUS_STEP' });
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain('Step 2: Heat olive oil');

    // REPEAT on step 2 re-speaks step 2
    actor.send({ type: 'REPEAT_STEP' });
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain('Step 2: Heat olive oil');

    // invalid step jump is guarded and ignored
    actor.send({ type: 'GOTO_STEP', stepNumber: 99 });
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);
  });

  it('prepares speechstate and advances to PromptRecipe upon ASRTTS_READY on user click', () => {
    const actor = createTestCookingActor();
    expect(actor.getSnapshot().value).toBe('Idle');

    actor.send({ type: 'CLICK' });
    expect(actor.getSnapshot().value).toBe('Prepare');

    actor.send({ type: 'ASRTTS_READY' });
    expect(actor.getSnapshot().value).toBe('PromptRecipe');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      'Hi! What would you like to cook today?',
    );
  });

  it('manages kitchen timers via push synchronization without disturbing active recipe step', async () => {
    const actor = createTestCookingActor();

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    actor.send({ type: 'SKIP_PREP' });

    // cook is currently on step 1 (index 0)
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);

    // cook says: "Set a pasta timer for 8 minutes"
    actor.send({
      type: 'SET_TIMER',
      durationSeconds: 480,
      label: 'pasta',
    });

    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      'Started a 8 minutes timer for pasta.',
    );
    // state must remain at WaitingForStepCommand with step 1 intact
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);

    // activeTimers is pushed into context immediately
    expect(actor.getSnapshot().context.activeTimers).toHaveLength(1);
    expect(actor.getSnapshot().context.activeTimers[0].label).toBe('pasta');

    // cook asks: "How much time is left on my pasta timer?"
    actor.send({
      type: 'CHECK_TIMER',
      label: 'pasta',
    });
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain('The pasta timer has');
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');

    // cook advances step while timer is still running
    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);
    expect(actor.getSnapshot().context.activeTimers).toHaveLength(1);

    // cook cancels pasta timer
    actor.send({
      type: 'CANCEL_TIMER',
      label: 'pasta',
    });
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe('Cancelled the pasta timer.');
    expect(actor.getSnapshot().context.activeTimers).toHaveLength(0);
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);

    // background timer expiration event arrives proactively
    actor.send({
      type: 'TIMER_EXPIRED',
      id: 'timer-sauce',
      label: 'sauce',
    });
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      "Time's up! Your sauce timer is done.",
    );
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);

    actor.stop();
  });
});

describe('Dialogue Manager - Pure Spoken Formatting Helpers', () => {
  it('formats ingredient batches with correct conversational markers', () => {
    const ingredients = mockArrabiataRecipe.ingredients;

    // batch 0: first
    const batch0 = formatPrepBatchUtterance(ingredients, 0, 2);
    expect(batch0).toBe('First: 1 pound penne rigate, and 1/4 cup olive oil. Got those?');
    expect(hasMorePrepBatches(ingredients, 0, 2)).toBe(true);

    // batch 1: intermediate next
    const batch1 = formatPrepBatchUtterance(ingredients, 1, 2);
    expect(batch1).toBe('Next: 3 cloves garlic, and 1/2 tsp red chile flakes.');
    expect(hasMorePrepBatches(ingredients, 1, 2)).toBe(true);

    // batch 3: final lastly
    const batch3 = formatPrepBatchUtterance(ingredients, 3, 2);
    expect(batch3).toBe(
      'Lastly: 6 leaves basil, and salt and pepper to taste. Ready to start cooking?',
    );
    expect(hasMorePrepBatches(ingredients, 3, 2)).toBe(false);
  });

  it('formats step instructions with spoken grounding cue on first step', () => {
    const step1 = formatStepUtterance(mockArrabiataRecipe.steps[0], 4);
    expect(step1).toBe(
      "Step 1: Bring a large pot of salted water to a boil. Say 'next' when done.",
    );

    const step2 = formatStepUtterance(mockArrabiataRecipe.steps[1], 4);
    expect(step2).toBe(
      'Step 2: Heat olive oil in a large skillet over medium heat and add garlic.',
    );

    const step4 = formatStepUtterance(mockArrabiataRecipe.steps[3], 4);
    expect(step4).toBe('Final step: Toss cooked penne with sauce and garnish with fresh basil.');
  });

  it('performs instant ingredient lookup accurately', () => {
    const ingredients = mockArrabiataRecipe.ingredients;

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
});
