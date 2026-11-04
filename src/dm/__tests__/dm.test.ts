import type { speechstate } from 'speechstate';
import { describe, expect, it } from 'vitest';
import { createActor, fromPromise, fromTransition } from 'xstate';
import prompts from '../../prompts';
import type { NormalizedRecipe } from '../../recipes/types';
import { cookingMachine } from '../cooking-machine';
import { buildDebugReport } from '../debug-report';
import {
  formatCheckTimerUtterance,
  formatDurationForSpeech,
  formatPrepBatchUtterance,
  formatStepUtterance,
  hasMorePrepBatches,
  lookupIngredient,
} from '../helpers';
import type { SearchRecipeOutput } from '../types';

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
      fetchRecipeActor: fromPromise(
        async (): Promise<SearchRecipeOutput> => ({ kind: 'single', recipe }),
      ),
      refineRecipeActor: fromPromise(async () => recipe),
      queryKnowledgeActor: fromPromise(async () => 'Mock culinary advice.'),
      queryStepDetailActor: fromPromise(async () => 'Step details: 200 degrees Celsius.'),
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
      'Next: 3 cloves garlic, and 1/2 tsp red chile flakes. Got those?',
    );

    // step 5: confirm batch 2 -> advance to Batch 3 (items 5-6)
    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().value).toBe('WaitingForPrepConfirmation');
    expect(actor.getSnapshot().context.prepBatchIndex).toBe(2);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      'Next: 1 tin chopped tomatoes, and 1/2 tsp Italian seasoning. Got those?',
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
      "Step 1: Bring a large pot of salted water to a boil. Let me know when you're ready.",
    );

    // step 8: advance to Step 2
    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      "Step 2: Heat olive oil in a large skillet over medium heat and add garlic. Let me know when you're ready.",
    );

    // step 9: advance to Step 3
    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(2);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      "Step 3: Add chopped tomatoes, red chile flakes, and simmer for 10 minutes. Let me know when you're ready.",
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

  it('advances to next step when cook acknowledges with AFFIRM (e.g. "Alright", "Got it")', async () => {
    const actor = createTestCookingActor();

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    actor.send({ type: 'SKIP_PREP' });

    // currently on step 1 (index 0)
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);

    // cook says: "Alright" / "Got it" -> maps to AFFIRM
    actor.send({ type: 'AFFIRM' });

    // advances to step 2 (index 1)
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain('Step 2: Heat olive oil');
  });

  it('supports advancing to step 1 on NEXT_STEP when cook says done with ingredients in ConfirmRecipe', async () => {
    const actor = createTestCookingActor();

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actor.getSnapshot().value).toBe('ConfirmRecipe');

    // cook says: "I'm done with the ingredients" -> maps to NEXT_STEP
    actor.send({ type: 'NEXT_STEP' });

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

  it('allows jumping directly to a step via GOTO_STEP during ingredient preparation', async () => {
    const actor = createTestCookingActor();

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    actor.send({ type: 'AFFIRM' });

    // actor is now in WaitingForPrepConfirmation
    expect(actor.getSnapshot().value).toBe('WaitingForPrepConfirmation');

    // jump directly to step 4 (last step)
    actor.send({ type: 'GOTO_STEP', stepNumber: 4 });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(3);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain(
      'Final step: Toss cooked penne with sauce',
    );
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
    const timerReport = buildDebugReport(actor.getSnapshot());
    expect(timerReport.activeTimers[0].remainingSeconds).toBeGreaterThan(0);

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
    const step1 = formatStepUtterance(mockArrabiataRecipe.steps[0], 4);
    expect(step1).toBe(
      "Step 1: Bring a large pot of salted water to a boil. Let me know when you're ready.",
    );

    const step2 = formatStepUtterance(mockArrabiataRecipe.steps[1], 4);
    expect(step2).toBe(
      "Step 2: Heat olive oil in a large skillet over medium heat and add garlic. Let me know when you're ready.",
    );

    const step4 = formatStepUtterance(mockArrabiataRecipe.steps[3], 4);
    expect(step4).toBe(
      "Final step: Toss cooked penne with sauce and garnish with fresh basil. Let me know when you're done.",
    );
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

  it('progressively escalates on consecutive ASR_NOINPUT events and resumes on CLICK', () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });

    expect(actor.getSnapshot().value).toBe('PromptRecipe');
    expect(actor.getSnapshot().context.noInputCount).toBe(0);

    // first no-input timeout buffers utterance until recognition teardown completes
    actor.send({ type: 'ASR_NOINPUT' });
    expect(actor.getSnapshot().context.noInputCount).toBe(1);
    expect(actor.getSnapshot().context.pendingUtterance).toBe(prompts.noInput[0]);
    actor.send({ type: 'LISTEN_COMPLETE' });
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(prompts.noInput[0]);
    expect(actor.getSnapshot().context.pendingUtterance).toBeNull();

    // second no-input timeout
    actor.send({ type: 'ASR_NOINPUT' });
    expect(actor.getSnapshot().context.noInputCount).toBe(2);
    expect(actor.getSnapshot().context.pendingUtterance).toBe(prompts.noInput[1]);
    actor.send({ type: 'LISTEN_COMPLETE' });
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(prompts.noInput[1]);
    expect(actor.getSnapshot().context.pendingUtterance).toBeNull();

    // third no-input timeout (pauses)
    actor.send({ type: 'ASR_NOINPUT' });
    expect(actor.getSnapshot().context.noInputCount).toBe(3);
    expect(actor.getSnapshot().context.pendingUtterance).toBe(prompts.noInput[2]);
    actor.send({ type: 'LISTEN_COMPLETE' });
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(prompts.noInput[2]);
    expect(actor.getSnapshot().context.pendingUtterance).toBeNull();
    expect(actor.getSnapshot().context.speechStatus).toBe('paused');

    // subsequent no-input timeout when already paused is ignored
    actor.send({ type: 'ASR_NOINPUT' });
    expect(actor.getSnapshot().context.noInputCount).toBe(3);
    expect(actor.getSnapshot().context.pendingUtterance).toBeNull();

    // resumes on click
    actor.send({ type: 'CLICK' });
    expect(actor.getSnapshot().context.noInputCount).toBe(0);
    expect(actor.getSnapshot().context.speechStatus).toBe('listening');
  });

  it('ignores ASR_NOINPUT when in Completed state', async () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // skip prep directly to step 1
    actor.send({ type: 'SKIP_PREP' });
    actor.send({ type: 'NEXT_STEP' }); // step 1 -> 2
    actor.send({ type: 'NEXT_STEP' }); // step 2 -> 3
    actor.send({ type: 'NEXT_STEP' }); // step 3 -> 4
    actor.send({ type: 'NEXT_STEP' }); // step 4 (last step) -> Completed

    expect(actor.getSnapshot().value).toBe('Completed');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      'All steps completed. Enjoy your meal!',
    );

    // silence timeout in Completed state should not trigger no-input prompt
    actor.send({ type: 'ASR_NOINPUT' });
    expect(actor.getSnapshot().context.noInputCount).toBe(0);
    expect(actor.getSnapshot().context.pendingUtterance).toBeNull();
  });

  it('handles ASR_NOINPUT silently in WaitingForPrepConfirmation without reprompting or incrementing noInputCount', async () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    actor.send({ type: 'AFFIRM' });
    expect(actor.getSnapshot().value).toBe('WaitingForPrepConfirmation');
    const spokenBefore = actor.getSnapshot().context.lastSpokenUtterance;

    // simulate silence timeout during ingredient gathering
    actor.send({ type: 'ASR_NOINPUT' });
    expect(actor.getSnapshot().context.noInputCount).toBe(0);
    expect(actor.getSnapshot().context.debugNoInput).toBe(1);
    expect(actor.getSnapshot().context.pendingUtterance).toBeNull();
    expect(actor.getSnapshot().context.silentNoInput).toBe(true);
    expect(buildDebugReport(actor.getSnapshot()).silentNoInput).toBe(true);

    actor.send({ type: 'LISTEN_COMPLETE' });
    expect(actor.getSnapshot().context.silentNoInput).toBe(false);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(spokenBefore);
    expect(actor.getSnapshot().context.speechStatus).toBe('listening');
  });

  it('restarts listening on raw LISTEN_COMPLETE in WaitingForPrepConfirmation even without ASR_NOINPUT', async () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    actor.send({ type: 'AFFIRM' });
    expect(actor.getSnapshot().value).toBe('WaitingForPrepConfirmation');

    // assistant finishes speaking the batch
    actor.send({ type: 'SPEAK_COMPLETE' });
    expect(actor.getSnapshot().context.speechStatus).toBe('listening');

    // browser webkitSpeechRecognition ends naturally on silence without ASR_NOINPUT
    actor.send({ type: 'LISTEN_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('WaitingForPrepConfirmation');
    expect(actor.getSnapshot().context.speechStatus).toBe('listening');

    // user can still confirm batch and advance
    actor.send({ type: 'AFFIRM' });
    expect(actor.getSnapshot().context.prepBatchIndex).toBe(1);
  });

  it('handles ASR_NOINPUT silently in WaitingForStepCommand without reprompting or pausing', async () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    actor.send({ type: 'SKIP_PREP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    const spokenStep = actor.getSnapshot().context.lastSpokenUtterance;

    // simulate multiple consecutive silence timeouts during cooking step execution
    actor.send({ type: 'ASR_NOINPUT' });
    expect(actor.getSnapshot().context.noInputCount).toBe(0);
    expect(actor.getSnapshot().context.debugNoInput).toBe(1);
    expect(actor.getSnapshot().context.pendingUtterance).toBeNull();
    expect(actor.getSnapshot().context.silentNoInput).toBe(true);

    actor.send({ type: 'LISTEN_COMPLETE' });
    expect(actor.getSnapshot().context.silentNoInput).toBe(false);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(spokenStep);
    expect(actor.getSnapshot().context.speechStatus).toBe('listening');

    // another timeout cycle
    actor.send({ type: 'ASR_NOINPUT' });
    actor.send({ type: 'LISTEN_COMPLETE' });
    expect(actor.getSnapshot().context.noInputCount).toBe(0);
    expect(actor.getSnapshot().context.debugNoInput).toBe(2);
    expect(actor.getSnapshot().context.speechStatus).toBe('listening');

    // user can still advance step after silence
    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.lastSpokenUtterance).not.toBe(spokenStep);
  });

  it('speaks repair prompt on UNKNOWN utterance without dropping cooking state', () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });

    actor.send({ type: 'UNKNOWN' });
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(prompts.cannotHear);
  });

  it('accumulates multi-turn conversation history with system prompt, user speech, and NLU acts', () => {
    const actor = createTestCookingActor();

    // Initial state contains system prompt
    const initialMsgs = actor.getSnapshot().context.messages;
    expect(initialMsgs.length).toBe(1);
    expect(initialMsgs[0].role).toBe('system');
    expect(initialMsgs[0].content).toBe(prompts.systemDefault);

    // Start cooking triggers PromptRecipe assistant utterance
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });

    const msgsAfterStart = actor.getSnapshot().context.messages;
    expect(msgsAfterStart.length).toBe(2);
    expect(msgsAfterStart[1].role).toBe('assistant');
    expect(msgsAfterStart[1].content).toBe(prompts.promptRecipe);

    // User speaks recipe query
    actor.send({
      type: 'RECOGNISED',
      value: [{ utterance: 'make pasta', confidence: 0.95 }],
    });

    const msgsAfterUser = actor.getSnapshot().context.messages;
    expect(msgsAfterUser.length).toBe(3);
    expect(msgsAfterUser[2].role).toBe('user');
    expect(msgsAfterUser[2].content).toBe('make pasta');

    // NLU resolves act to SEARCH_RECIPE
    actor.send({ type: 'ACT_RESOLVED', act: 'SEARCH_RECIPE' });
    const msgsAfterAct = actor.getSnapshot().context.messages;
    expect(msgsAfterAct[2].act).toBe('SEARCH_RECIPE');
  });

  it('safely compiles structured debug reports with and without active recipe', async () => {
    const actor = createTestCookingActor();

    // Idle report
    const idleReport = buildDebugReport(actor.getSnapshot());
    expect(idleReport.dialogueState).toBe('Idle');
    expect(idleReport.recipe).toBeNull();
    expect(idleReport.messages.length).toBe(1);
    expect(idleReport.llmUsage).toBeDefined();

    // Active recipe report
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });

    // allow microtask queue to process actor invocation
    await new Promise((resolve) => setTimeout(resolve, 0));

    actor.send({ type: 'SPEAK_COMPLETE' });
    actor.send({
      type: 'RECOGNISED',
      value: [{ utterance: 'yes ready', confidence: 0.92 }],
    });
    actor.send({
      type: 'ACT_RESOLVED',
      act: 'AFFIRM',
      entities: { query: 'yes' },
    });

    const activeReport = buildDebugReport(actor.getSnapshot());
    expect(activeReport.dialogueState).toBe('ConfirmRecipe');
    expect(activeReport.recipe?.title).toBe('Spicy Arrabiata Penne');
    expect(activeReport.recipe?.totalSteps).toBe(4);
    expect(activeReport.recipe?.totalPrepBatches).toBe(4);
    expect(activeReport.recipe?.currentStepIndex).toBe(0);
    expect(activeReport.recipe?.currentStepText).toBe(
      'Bring a large pot of salted water to a boil.',
    );
    expect(activeReport.silentNoInput).toBe(false);
    expect(activeReport.recipeCandidates).toBeNull();
    expect(activeReport.knowledgeQuery).toBeNull();
    expect(activeReport.returnState).toBeNull();
    expect(activeReport.latestAsr?.utterance).toBe('yes ready');
    expect(activeReport.latestAsr?.confidence).toBe(0.92);
    expect('bargeIn' in (activeReport.latestAsr ?? {})).toBe(false);
    expect(activeReport.lastResolvedAct).toBe('AFFIRM');
    expect(activeReport.lastResolvedEntities).toEqual({ query: 'yes' });
    expect(activeReport.messages.length).toBeGreaterThan(1);
  });

  it('switches recipes globally via SEARCH_RECIPE while in ConfirmRecipe (barge-in scenario)', async () => {
    const actor = createTestCookingActor();

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'apple pie' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actor.getSnapshot().value).toBe('ConfirmRecipe');

    // user barges in mid-confirmation and asks to cook pasta instead
    actor.send({ type: 'SEARCH_RECIPE', query: 'pasta' });
    expect(actor.getSnapshot().value).toBe('FetchingRecipe');

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(actor.getSnapshot().value).toBe('ConfirmRecipe');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain(
      'Ready to gather ingredients?',
    );
  });

  it('handles HELP and GREETING globally without losing current state', async () => {
    const actor = createTestCookingActor();

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    expect(actor.getSnapshot().value).toBe('PromptRecipe');

    // ask for help
    actor.send({ type: 'HELP' });
    expect(actor.getSnapshot().value).toBe('PromptRecipe');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain(
      'navigate steps with next or repeat',
    );

    // greeting
    actor.send({ type: 'GREETING' });
    expect(actor.getSnapshot().value).toBe('PromptRecipe');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe('Hi! Ready when you are.');
  });

  it('records barge-in status on internal context while omitting barge-in from debug report', () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });

    actor.send({
      type: 'RECOGNISED',
      value: [{ utterance: 'stop talking', confidence: 0.98 }],
      bargeIn: true,
    });

    const snapshot = actor.getSnapshot();
    const userMsg = snapshot.context.messages.find((m) => m.role === 'user');
    expect(userMsg?.bargeIn).toBe(true);
    expect(snapshot.context.lastBargeIn).toBe(true);

    const report = buildDebugReport(snapshot);
    expect('bargeIn' in (report.latestAsr ?? {})).toBe(false);
    expect(report.messages.some((m) => 'bargeIn' in m)).toBe(false);
  });

  it('does not mark barge-in on internal context when user waits for SPEAK_COMPLETE before speaking', () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });

    // assistant finishes speaking prompt -> speechStatus becomes 'listening'
    actor.send({ type: 'SPEAK_COMPLETE' });

    // user speaks after assistant finishes
    actor.send({
      type: 'RECOGNISED',
      value: [{ utterance: 'make pasta', confidence: 0.95 }],
      bargeIn: true, // even if speechstate mistakenly sends bargeIn: true
    });

    const snapshot = actor.getSnapshot();
    const userMsg = snapshot.context.messages.find((m) => m.role === 'user');
    expect(userMsg?.bargeIn).toBe(false);
    expect(snapshot.context.lastBargeIn).toBe(false);

    const report = buildDebugReport(snapshot);
    expect('bargeIn' in (report.latestAsr ?? {})).toBe(false);
    expect(report.messages.some((m) => 'bargeIn' in m)).toBe(false);
  });

  it('records lastNoInputAt and debugNoInput in context and debug report when ASR_NOINPUT triggers', () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });

    const initialReport = buildDebugReport(actor.getSnapshot());
    expect(initialReport.lastNoInputAt).toBeNull();
    expect(initialReport.debugNoInput).toBe(0);

    actor.send({ type: 'ASR_NOINPUT' });

    const timeoutReport = buildDebugReport(actor.getSnapshot());
    expect(timeoutReport.lastNoInputAt).toBeDefined();
    expect(typeof timeoutReport.lastNoInputAt).toBe('string');
    expect(timeoutReport.debugNoInput).toBe(1);
  });

  it('handles DENY gracefully in WaitingForPrepConfirmation without deadlocking', async () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    actor.send({ type: 'AFFIRM' });
    expect(actor.getSnapshot().value).toBe('WaitingForPrepConfirmation');

    // user says "no" or "not yet" during ingredient prep
    actor.send({ type: 'DENY' });
    expect(actor.getSnapshot().value).toBe('WaitingForPrepConfirmation');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain('Take your time');
    expect(actor.getSnapshot().context.speechStatus).toBe('speaking');

    actor.send({ type: 'SPEAK_COMPLETE' });
    expect(actor.getSnapshot().context.speechStatus).toBe('listening');
  });

  it('handles DENY gracefully in WaitingForStepCommand without deadlocking', async () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // skip prep directly to steps
    actor.send({ type: 'SKIP_PREP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');

    // user says "no" when at step 1
    actor.send({ type: 'DENY' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain('No rush');
    expect(actor.getSnapshot().context.speechStatus).toBe('speaking');

    actor.send({ type: 'SPEAK_COMPLETE' });
    expect(actor.getSnapshot().context.speechStatus).toBe('listening');
  });

  it('reprompts gracefully on out-of-bounds GOTO_STEP instead of dropping event', async () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    actor.send({ type: 'SKIP_PREP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');

    // recipe has 4 steps, user asks for step 99
    actor.send({ type: 'GOTO_STEP', stepNumber: 99 });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      'This recipe has 4 steps. Which step would you like?',
    );
  });

  it('resets recipe and step indices upon restarting from Completed to PromptRecipe', async () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    actor.send({ type: 'SKIP_PREP' });
    // jump to last step (step 4)
    actor.send({ type: 'GOTO_STEP', stepNumber: 4 });
    expect(actor.getSnapshot().context.currentStepIndex).toBe(3);

    // advance past last step to complete
    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().value).toBe('Completed');

    // click start over to begin a new cooking session
    actor.send({ type: 'CLICK' });
    expect(actor.getSnapshot().value).toBe('PromptRecipe');
    expect(actor.getSnapshot().context.recipe).toBeNull();
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);
    expect(actor.getSnapshot().context.prepBatchIndex).toBe(0);
  });

  it('activates machine and starts listening on WAKE_WORD or PTT_TRIGGER', () => {
    const actor = createTestCookingActor();
    expect(actor.getSnapshot().value).toBe('Idle');

    // WAKE_WORD in Idle advances to Prepare
    actor.send({ type: 'WAKE_WORD', modelName: 'hey_jarvis_v0.1', score: 0.85 });
    expect(actor.getSnapshot().value).toBe('Prepare');

    actor.send({ type: 'ASRTTS_READY' });
    expect(actor.getSnapshot().value).toBe('PromptRecipe');

    // PTT_TRIGGER resets pauses and enters listening mode
    actor.send({ type: 'PTT_TRIGGER' });
    expect(actor.getSnapshot().context.speechStatus).toBe('listening');
  });
});
