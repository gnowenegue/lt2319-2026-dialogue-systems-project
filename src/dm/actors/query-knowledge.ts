import { fromPromise } from 'xstate';

import { synthesizeCulinaryAdvice } from '../../rag';
import type { QueryKnowledgeInput } from '../types';

/**
 * queries culinary knowledge corpus and synthesizes concise spoken advice
 */
export const queryKnowledgeLogic = fromPromise(
  async ({ input }: { input: QueryKnowledgeInput }): Promise<string> => {
    return synthesizeCulinaryAdvice(input.query, input.category, {
      recentMessages: input.recentMessages,
      stepContext: input.stepContext,
    });
  },
);
