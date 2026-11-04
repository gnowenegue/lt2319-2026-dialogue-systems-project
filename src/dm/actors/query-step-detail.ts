import { fromPromise } from 'xstate';

import { createChatCompletion } from '../../llm';
import prompts from '../../prompts';
import { STEP_DETAIL_TEMPERATURE } from '../constants';
import type { QueryStepDetailInput } from '../types';

/**
 * answers in-memory factual queries about the active cooking step using grounded LLM inference
 */
export async function queryStepDetail(input: QueryStepDetailInput): Promise<string> {
  const trimmed = input.query.trim();
  if (!trimmed) {
    return 'What would you like to know about this step?';
  }

  if (!input.instruction) {
    return "We haven't started cooking any steps yet.";
  }

  const stepLabel = input.stepNumber ? `Step ${input.stepNumber}` : 'Current step';
  const titleLabel = input.recipeTitle ? ` (${input.recipeTitle})` : '';

  const { content } = await createChatCompletion({
    callName: 'step-detail',
    client: input.client,
    model: input.model,
    messages: [
      { role: 'system', content: prompts.systemStepDetail },
      {
        role: 'user',
        content: `${stepLabel}${titleLabel}: "${input.instruction}"\n\nQuestion: ${trimmed}`,
      },
    ],
    temperature: STEP_DETAIL_TEMPERATURE,
  });

  return content || "I don't see that mentioned in this step.";
}

/**
 * actor logic answering step detail questions within the dialogue state machine
 */
export const queryStepDetailLogic = fromPromise(
  async ({ input }: { input: QueryStepDetailInput }): Promise<string> => queryStepDetail(input),
);
