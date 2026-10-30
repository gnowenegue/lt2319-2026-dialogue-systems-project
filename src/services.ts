import OpenAI from 'openai';

import { LLM_MODEL } from './constants';
import { queryCulinaryKnowledge } from './rag';
import type { Message } from './types';

const openai = new OpenAI({
  baseURL: 'http://localhost:11434/v1/',
  apiKey: 'ollama',
  dangerouslyAllowBrowser: true,
});

const queryQdrant = async (_collection: string, query: string): Promise<string> => {
  return queryCulinaryKnowledge(query);
};

const getChatCompletions = async (messages: Message[]) => {
  const completion = await openai.chat.completions.create({
    messages,
    model: LLM_MODEL,
    store: true,
  });

  const outputContent = completion.choices[0]?.message?.content ?? '';
  const output = outputContent.replace(/^assistant\s*/i, '').trim();
  console.log(`LLM output: ${output}`);

  return output;
};

export { getChatCompletions, queryCulinaryKnowledge, queryQdrant };
