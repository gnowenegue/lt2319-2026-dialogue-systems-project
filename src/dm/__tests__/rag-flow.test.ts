import type { speechstate } from 'speechstate';
import { describe, expect, it } from 'vitest';
import { createActor, fromPromise, fromTransition } from 'xstate';
import type { NormalizedRecipe } from '../../recipes/types';
import { cookingMachine } from '../cooking-machine';
import type { QueryKnowledgeInput, SearchRecipeOutput } from '../types';

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

interface TestCookingActorOptions {
  recipe?: NormalizedRecipe;
  knowledgeReplies?: Record<string, string>;
  onQueryKnowledge?: (input: QueryKnowledgeInput) => Promise<string> | string;
}

const createTestCookingActor = (options: TestCookingActorOptions = {}) => {
  const recipe = options.recipe ?? mockArrabiataRecipe;
  const machine = cookingMachine.provide({
    actors: {
      fetchRecipeActor: fromPromise(
        async (): Promise<SearchRecipeOutput> => ({ kind: 'single', recipe }),
      ),
      refineRecipeActor: fromPromise(async () => recipe),
      speechstateActor: fromTransition((state) => state, {}) as unknown as typeof speechstate,
      queryStepDetailActor: fromPromise(async () => 'Step details: 200 degrees Celsius.'),
      queryKnowledgeActor: fromPromise(async ({ input }: { input: QueryKnowledgeInput }) => {
        if (options.onQueryKnowledge) {
          return options.onQueryKnowledge(input);
        }
        if (options.knowledgeReplies?.[input.query]) {
          return options.knowledgeReplies[input.query];
        }
        return input.category === 'techniques'
          ? 'A rolling boil has vigorous bubbles that keep rising even when stirred.'
          : 'You can substitute 1/8 teaspoon of garlic powder for each clove of fresh garlic.';
      }),
    },
  });
  return createActor(machine).start();
};

describe('Dialogue Manager - RAG Happy Flow (Techniques & Substitutions)', () => {
  it('executes a happy flow with RAG inquiries for technique and ingredient substitution without state distortion', async () => {
    const actor = createTestCookingActor();

    // step 1: initialize speech and select recipe
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actor.getSnapshot().value).toBe('ConfirmRecipe');

    // step 2: cook skips ingredient gathering directly into step 1
    actor.send({ type: 'SKIP_PREP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain(
      'Step 1: Bring a large pot of salted water to a boil',
    );

    // step 3: cook inquires about technique ("How do I know when the water is boiling?")
    actor.send({
      type: 'INQUIRE_TECHNIQUE',
      query: 'How do I know when the water is boiling?',
    });

    expect(actor.getSnapshot().value).toBe('QueryingKnowledge');
    expect(actor.getSnapshot().context.speechStatus).toBe('processing');

    // allow asynchronous queryKnowledgeActor to resolve
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actor.getSnapshot().value).toBe('SpeakingKnowledge');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      'A rolling boil has vigorous bubbles that keep rising even when stirred.',
    );
    // verify active recipe step remains untouched
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);

    // assistant finishes speaking advice and resumes listening for next step command
    actor.send({ type: 'SPEAK_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);
    expect(actor.getSnapshot().context.speechStatus).toBe('listening');

    // step 4: cook proceeds to step 2 (olive oil and garlic)
    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain(
      'Step 2: Heat olive oil in a large skillet over medium heat and add garlic',
    );

    // step 5: cook inquires about substitution ("What can I substitute for garlic?")
    actor.send({
      type: 'INQUIRE_SUBSTITUTION',
      ingredient: 'garlic',
      query: 'What can I substitute for garlic?',
    });

    expect(actor.getSnapshot().value).toBe('QueryingKnowledge');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actor.getSnapshot().value).toBe('SpeakingKnowledge');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      'You can substitute 1/8 teaspoon of garlic powder for each clove of fresh garlic.',
    );
    // verify step 2 remains untouched
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);

    // assistant finishes speaking and returns to step 2 listening
    actor.send({ type: 'SPEAK_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);
    expect(actor.getSnapshot().context.speechStatus).toBe('listening');

    // step 6: cook advances through remaining steps to completion
    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().context.currentStepIndex).toBe(2);

    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().context.currentStepIndex).toBe(3);

    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().value).toBe('Completed');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      'All steps completed. Enjoy your meal!',
    );
  });

  it('handles ingredient substitution inquiries during ingredient prep and preserves prep batch index', async () => {
    const actor = createTestCookingActor({
      knowledgeReplies: {
        'Can I use butter instead of olive oil?':
          'Yes, you can substitute butter 1-to-1 for olive oil in skillet sautéing.',
      },
    });

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // affirm recipe to enter ingredient prep batch 0 (penne rigate and olive oil)
    actor.send({ type: 'AFFIRM' });
    expect(actor.getSnapshot().value).toBe('WaitingForPrepConfirmation');
    expect(actor.getSnapshot().context.prepBatchIndex).toBe(0);

    // cook asks about substituting olive oil during prep
    actor.send({
      type: 'INQUIRE_SUBSTITUTION',
      ingredient: 'olive oil',
      query: 'Can I use butter instead of olive oil?',
    });

    expect(actor.getSnapshot().value).toBe('QueryingKnowledge');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actor.getSnapshot().value).toBe('SpeakingKnowledge');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      'Yes, you can substitute butter 1-to-1 for olive oil in skillet sautéing.',
    );
    expect(actor.getSnapshot().context.prepBatchIndex).toBe(0);

    // upon speak completion, machine returns to WaitingForPrepConfirmation with prepBatchIndex intact
    actor.send({ type: 'SPEAK_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('WaitingForPrepConfirmation');
    expect(actor.getSnapshot().context.prepBatchIndex).toBe(0);

    // cook affirms having batch 0 ingredients -> advances to batch 1
    actor.send({ type: 'AFFIRM' });
    expect(actor.getSnapshot().value).toBe('WaitingForPrepConfirmation');
    expect(actor.getSnapshot().context.prepBatchIndex).toBe(1);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain('3 cloves garlic');
  });

  it('handles global culinary inquiries during recipe confirmation or initial prompt', async () => {
    const actor = createTestCookingActor({
      knowledgeReplies: {
        'What does al dente mean?': 'Al dente means cooking pasta until it is firm to the bite.',
      },
    });

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    expect(actor.getSnapshot().value).toBe('PromptRecipe');

    // cook asks technique question even before picking recipe
    actor.send({
      type: 'INQUIRE_TECHNIQUE',
      query: 'What does al dente mean?',
    });

    expect(actor.getSnapshot().value).toBe('QueryingKnowledge');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actor.getSnapshot().value).toBe('SpeakingKnowledge');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      'Al dente means cooking pasta until it is firm to the bite.',
    );

    // finishes speaking and returns to PromptRecipe
    actor.send({ type: 'SPEAK_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('PromptRecipe');

    // now cook searches recipe normally
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(actor.getSnapshot().value).toBe('ConfirmRecipe');
  });

  it('passes recent conversational turns to queryKnowledgeActor for dialogue continuity and pronoun resolution', async () => {
    let capturedInput: QueryKnowledgeInput | null = null;

    const actor = createTestCookingActor({
      onQueryKnowledge: (input) => {
        capturedInput = input;
        return 'Mock contextual advice.';
      },
    });

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    actor.send({ type: 'SKIP_PREP' });

    // trigger inquiry
    actor.send({
      type: 'INQUIRE_TECHNIQUE',
      query: 'How hot should it be?',
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const input = capturedInput as unknown as QueryKnowledgeInput;
    expect(input).not.toBeNull();
    expect(input.query).toBe('How hot should it be?');
    expect(input.category).toBe('techniques');
    // should contain prior messages including assistant step utterance
    expect(input.recentMessages).toBeDefined();
    expect(input.recentMessages?.length).toBeGreaterThan(0);
    const hasAssistantUtterance = input.recentMessages?.some(
      (m: { role: string; content: string }) =>
        m.role === 'assistant' && m.content.includes('Step 1'),
    );
    expect(hasAssistantUtterance).toBe(true);
    expect(input.stepContext).toBe(
      'Recipe: Spicy Arrabiata Penne, Step 1: Bring a large pot of salted water to a boil.',
    );
  });

  it('avoids duplicating the recognized user question in recentMessages during speech inquiry', async () => {
    let capturedInput: QueryKnowledgeInput | null = null;

    const actor = createTestCookingActor({
      onQueryKnowledge: (input) => {
        capturedInput = input;
        return 'Mock contextual advice.';
      },
    });

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    actor.send({ type: 'SKIP_PREP' });

    // simulate speech recognition event adding user turn to messages
    const speechUtterance = 'How hot should the skillet be?';
    actor.send({
      type: 'RECOGNISED',
      value: [{ utterance: speechUtterance, confidence: 0.98 }],
    });

    // parser resolves dialogue act to inquiry
    actor.send({
      type: 'INQUIRE_TECHNIQUE',
      query: speechUtterance,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const input = capturedInput as unknown as QueryKnowledgeInput;
    expect(input).not.toBeNull();
    expect(input.query).toBe(speechUtterance);
    expect(input.stepContext).toContain('Step 1: Bring a large pot of salted water to a boil.');
    // verify the recognized user turn is not duplicated in recentMessages
    const hasUserUtteranceInHistory = input.recentMessages?.some(
      (m) => m.role === 'user' && m.content === speechUtterance,
    );
    expect(hasUserUtteranceInHistory).toBe(false);
  });

  it('handles graceful fallback when culinary knowledge query fails', async () => {
    const machine = cookingMachine.provide({
      actors: {
        fetchRecipeActor: fromPromise(
          async (): Promise<SearchRecipeOutput> => ({
            kind: 'single',
            recipe: mockArrabiataRecipe,
          }),
        ),
        speechstateActor: fromTransition((state) => state, {}) as unknown as typeof speechstate,
        queryKnowledgeActor: fromPromise(async (): Promise<string> => {
          throw new Error('Qdrant unreachable');
        }),
      },
    });
    const actor = createActor(machine).start();

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    actor.send({ type: 'SKIP_PREP' });

    actor.send({
      type: 'INQUIRE_TECHNIQUE',
      query: 'What does deglaze mean?',
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actor.getSnapshot().value).toBe('SpeakingKnowledge');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      "Sorry, I couldn't find advice on that in my culinary guides.",
    );

    // resumes back to active step command on speak complete
    actor.send({ type: 'SPEAK_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);
  });
});
