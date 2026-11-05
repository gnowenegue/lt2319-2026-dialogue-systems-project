import { describe, expect, it } from 'vitest';
import { ROLES } from '../../constants';
import { buildDebugReport } from '../debug-report';
import { createTestCookingActor } from './test-helpers';

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

    // step 7: confirm final batch -> enter step execution (Step 1)
    actor.send({ type: 'AFFIRM' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      "Step 1: Bring a large pot of salted water to a boil. Let me know when you're ready.",
    );

    // step 8: user completes step 1 -> advance to Step 2
    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      "Step 2: Heat olive oil in a large skillet over medium heat and add garlic. Let me know when you're ready.",
    );

    // step 9: user completes step 2 -> advance to Step 3 (timed step)
    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(2);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      'Step 3: Add chopped tomatoes, red chile flakes, and simmer for 10 minutes. Would you like me to start a timer for 10 minutes?',
    );

    // step 10: user completes step 3 -> advance to Step 4 (final step)
    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(3);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      "Final step: Toss cooked penne with sauce and garnish with fresh basil. Let me know when you're done.",
    );

    // step 11: user completes final step -> recipe completed
    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().value).toBe('Completed');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      'All steps completed. Enjoy your meal!',
    );

    actor.stop();
  });

  it('answers in-step ingredient queries factually from memory without state distortion', async () => {
    const actor = createTestCookingActor();

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    actor.send({ type: 'SKIP_PREP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);

    // query known ingredient quantity
    actor.send({ type: 'QUERY_INGREDIENT', ingredient: 'garlic' });
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe('You need 3 cloves garlic.');
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);

    // query all ingredients
    actor.send({ type: 'QUERY_INGREDIENT' });
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain('1 pound penne rigate');
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');

    // query non-existent ingredient
    actor.send({ type: 'QUERY_INGREDIENT', ingredient: 'cilantro' });
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      "I don't see cilantro in this recipe.",
    );
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);
  });

  it('supports skipping ingredient prep directly when cook has everything ready', async () => {
    const actor = createTestCookingActor();

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actor.getSnapshot().value).toBe('ConfirmRecipe');

    // skip prep directly to step 1
    actor.send({ type: 'SKIP_PREP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain('Step 1:');
  });

  it('advances to next step when cook acknowledges with AFFIRM (e.g. "Alright", "Got it")', async () => {
    const actor = createTestCookingActor();

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    actor.send({ type: 'SKIP_PREP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);

    // user says "Got it" / "Okay" -> AFFIRM
    actor.send({ type: 'AFFIRM' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain('Step 2:');
  });

  it('supports advancing to step 1 on NEXT_STEP when cook says done with ingredients in ConfirmRecipe', async () => {
    const actor = createTestCookingActor();

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actor.getSnapshot().value).toBe('ConfirmRecipe');

    // user says "next" -> advances to Step 1 directly
    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain('Step 1:');
  });

  it('handles step navigation: previous, repeat, and direct jump', async () => {
    const actor = createTestCookingActor();

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    actor.send({ type: 'SKIP_PREP' });

    // advance to step 2 (index 1)
    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);

    // repeat step 2
    actor.send({ type: 'REPEAT_STEP' });
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain('Step 2:');

    // go back to step 1
    actor.send({ type: 'PREVIOUS_STEP' });
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain('Step 1:');

    // go back at step 1 stays at step 1
    actor.send({ type: 'PREVIOUS_STEP' });
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);

    // direct jump to step 4
    actor.send({ type: 'GOTO_STEP', stepNumber: 4 });
    expect(actor.getSnapshot().context.currentStepIndex).toBe(3);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain('Final step:');

    // invalid jump index is rejected gracefully
    actor.send({ type: 'GOTO_STEP', stepNumber: 99 });
    expect(actor.getSnapshot().context.currentStepIndex).toBe(3);
  });

  it('allows jumping directly to a step via GOTO_STEP during ingredient preparation', async () => {
    const actor = createTestCookingActor();

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // begin ingredient prep
    actor.send({ type: 'AFFIRM' });
    expect(actor.getSnapshot().value).toBe('WaitingForPrepConfirmation');

    // cook says "go to step 2" directly while looking at ingredients
    actor.send({ type: 'GOTO_STEP', stepNumber: 2 });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain('Step 2:');
  });

  it('accumulates multi-turn conversation history with system prompt, user speech, and NLU acts', () => {
    const actor = createTestCookingActor();

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });

    // user speaks recognized utterance
    actor.send({
      type: 'RECOGNISED',
      value: [{ utterance: 'Cook arrabiata pasta', confidence: 0.95 }],
    });

    const messages = actor.getSnapshot().context.messages;
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages[0].role).toBe(ROLES.System);
    expect(messages[messages.length - 1].role).toBe(ROLES.User);
    expect(messages[messages.length - 1].content).toBe('Cook arrabiata pasta');

    // simulated NLU resolves act
    actor.send({
      type: 'ACT_RESOLVED',
      act: 'SEARCH_RECIPE',
      entities: { query: 'arrabiata' },
    });

    expect(actor.getSnapshot().context.lastResolvedAct).toBe('SEARCH_RECIPE');
    expect(actor.getSnapshot().context.messages[messages.length - 1].act).toBe('SEARCH_RECIPE');
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
    expect(activeReport.recipeCandidates).toBeNull();
    expect(activeReport.knowledgeQuery).toBeNull();
    expect(activeReport.returnState).toBeNull();
    expect(activeReport.latestAsr?.utterance).toBe('yes ready');
    expect(activeReport.latestAsr?.confidence).toBe(0.92);
    expect(activeReport.lastResolvedAct).toBe('AFFIRM');
    expect(activeReport.lastResolvedEntities).toEqual({ query: 'yes' });
    expect(activeReport.messages.length).toBeGreaterThan(1);
  });

  it('switches recipes globally via SEARCH_RECIPE while in ConfirmRecipe', async () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actor.getSnapshot().value).toBe('ConfirmRecipe');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain('Spicy Arrabiata Penne');

    // user interrupts during recipe confirmation: "Actually let's make lasagna"
    actor.send({ type: 'SEARCH_RECIPE', query: 'lasagna' });
    expect(actor.getSnapshot().value).toBe('FetchingRecipe');

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(actor.getSnapshot().value).toBe('ConfirmRecipe');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain(
      'Ready to gather ingredients?',
    );
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
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      "Take your time. Say 'ready' or 'yes' when you have them.",
    );
    expect(actor.getSnapshot().context.prepBatchIndex).toBe(0);

    // user is now ready and confirms
    actor.send({ type: 'AFFIRM' });
    expect(actor.getSnapshot().value).toBe('WaitingForPrepConfirmation');
    expect(actor.getSnapshot().context.prepBatchIndex).toBe(1);
  });

  it('handles DENY gracefully in WaitingForStepCommand without deadlocking', async () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    actor.send({ type: 'SKIP_PREP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');

    // assistant asks if user is ready for next step; user denies ("not yet", "hold on")
    actor.send({ type: 'DENY' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      "No rush. Say 'next step' whenever you're ready.",
    );
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);

    // user finishes later and issues NEXT_STEP
    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain('Step 2:');
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

  it('resets recipe and restarts via WAKE_WORD from Completed', async () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    actor.send({ type: 'SKIP_PREP' });
    actor.send({ type: 'GOTO_STEP', stepNumber: 4 });
    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().value).toBe('Completed');

    // trigger by wake word while Completed
    actor.send({ type: 'WAKE_WORD' });
    expect(actor.getSnapshot().value).toBe('PromptRecipe');
    expect(actor.getSnapshot().context.recipe).toBeNull();
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);
    expect(actor.getSnapshot().context.prepBatchIndex).toBe(0);
  });
});
