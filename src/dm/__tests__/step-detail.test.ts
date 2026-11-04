import type OpenAI from 'openai';
import type { speechstate } from 'speechstate';
import { describe, expect, it, vi } from 'vitest';
import { createActor, fromPromise, fromTransition } from 'xstate';

import { getLlmUsageHistory } from '../../llm';
import { queryStepDetail } from '../actors/query-step-detail';
import { STEP_DETAIL_TEMPERATURE } from '../constants';
import { cookingMachine } from '../cooking-machine';
import type { QueryStepDetailInput, SearchRecipeOutput } from '../types';
import { createMockRecipe } from './test-helpers';

const mockArrabiataRecipe = createMockRecipe({
  id: 'mock-1',
  title: 'Spicy Penne Arrabiata',
  ingredients: [
    { name: 'Penne', measure: '1 lb', text: '1 pound penne rigate' },
    { name: 'Garlic', measure: '3 cloves', text: '3 cloves garlic' },
  ],
  steps: [
    {
      stepNumber: 1,
      instruction: 'Preheat oven to 400 degrees Fahrenheit and bring a pot of water to a boil.',
      estimatedMinutes: 8,
    },
    {
      stepNumber: 2,
      instruction: 'Heat olive oil in a large skillet over medium-high heat.',
      estimatedMinutes: 5,
    },
  ],
});

describe('Dialogue Manager - QUERY_STEP_DETAIL Flow', () => {
  it('answers step detail query during active cooking and resumes WaitingForStepCommand', async () => {
    let capturedInput: QueryStepDetailInput | null = null;

    const machine = cookingMachine.provide({
      actors: {
        fetchRecipeActor: fromPromise(
          async (): Promise<SearchRecipeOutput> => ({
            kind: 'single',
            recipe: mockArrabiataRecipe,
          }),
        ),
        speechstateActor: fromTransition((state) => state, {}) as unknown as typeof speechstate,
        queryKnowledgeActor: fromPromise(async () => 'Mock culinary advice.'),
        queryStepDetailActor: fromPromise(
          async ({ input }: { input: QueryStepDetailInput }): Promise<string> => {
            capturedInput = input;
            return 'The oven should be preheated to 400 degrees Fahrenheit.';
          },
        ),
      },
    });

    const actor = createActor(machine).start();

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // skip prep directly into step 1
    actor.send({ type: 'SKIP_PREP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);

    // user asks for step detail
    actor.send({
      type: 'QUERY_STEP_DETAIL',
      query: 'What oven temperature do I need?',
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(capturedInput).not.toBeNull();
    expect((capturedInput as unknown as QueryStepDetailInput).query).toBe(
      'What oven temperature do I need?',
    );
    expect((capturedInput as unknown as QueryStepDetailInput).stepNumber).toBe(1);
    expect((capturedInput as unknown as QueryStepDetailInput).instruction).toContain(
      '400 degrees Fahrenheit',
    );

    expect(actor.getSnapshot().value).toBe('SpeakingKnowledge');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      'The oven should be preheated to 400 degrees Fahrenheit.',
    );

    // finishes speaking step detail and resumes back to WaitingForStepCommand
    actor.send({ type: 'SPEAK_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);
  });

  it('handles queryStepDetail fallbacks for empty query and missing instruction', async () => {
    // case 1: empty query
    const emptyResult = await queryStepDetail({
      query: '   ',
      instruction: 'Chop the onions.',
    });
    expect(emptyResult).toBe('What would you like to know about this step?');

    // case 2: missing active step instruction
    const noInstructionResult = await queryStepDetail({
      query: 'What temperature?',
      instruction: undefined,
    });
    expect(noInstructionResult).toBe("We haven't started cooking any steps yet.");
  });

  it('records LLM usage metrics when queryStepDetail calls OpenAI completions', async () => {
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'Bake at 350F.' } }],
            usage: { prompt_tokens: 15, completion_tokens: 5, total_tokens: 20 },
          }),
        },
      },
    };

    const answer = await queryStepDetail({
      query: 'What temp?',
      instruction: 'Bake the cake.',
      client: mockClient as unknown as OpenAI,
    });
    expect(answer).toBe('Bake at 350F.');
    expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: STEP_DETAIL_TEMPERATURE,
      }),
    );

    const history = getLlmUsageHistory();
    const lastRecord = history[history.length - 1];
    expect(lastRecord?.call).toBe('step-detail');
    expect(lastRecord?.promptTokens).toBe(15);
    expect(lastRecord?.completionTokens).toBe(5);
    expect(lastRecord?.totalTokens).toBe(20);
  });
});
