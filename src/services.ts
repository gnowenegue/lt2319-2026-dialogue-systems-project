import OpenAI from 'openai';

import { DEFAULT_GROQ_BASE_URL, DEFAULT_GROQ_MODEL, LLM_MODEL } from './constants';
import { queryCulinaryKnowledge } from './rag';
import type { Message } from './types';

// configure Groq cloud endpoint if API key is present, otherwise fallback to local Ollama
const groqApiKey = import.meta.env?.VITE_GROQ_API_KEY;
const activeBaseUrl = groqApiKey
  ? DEFAULT_GROQ_BASE_URL
  : import.meta.env?.VITE_OLLAMA_URL || 'http://localhost:11434/v1/';
const activeApiKey = groqApiKey || 'ollama';

export const ACTIVE_LLM_MODEL = groqApiKey
  ? import.meta.env?.VITE_GROQ_MODEL || DEFAULT_GROQ_MODEL
  : LLM_MODEL;

const openai = new OpenAI({
  baseURL: activeBaseUrl,
  apiKey: activeApiKey,
  dangerouslyAllowBrowser: true,
});

const getChatCompletions = async (messages: Message[]) => {
  const completion = await openai.chat.completions.create({
    messages,
    model: ACTIVE_LLM_MODEL,
    store: true,
  });

  const outputContent = completion.choices[0]?.message?.content ?? '';
  const output = outputContent.replace(/^assistant\s*/i, '').trim();
  console.log(`LLM output: ${output}`);

  return output;
};

export { getChatCompletions, openai, queryCulinaryKnowledge };
