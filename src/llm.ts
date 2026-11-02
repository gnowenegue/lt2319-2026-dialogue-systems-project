import OpenAI from 'openai';

import { getEnv } from './configs';
import {
  DEFAULT_GROQ_BASE_URL,
  DEFAULT_GROQ_MODEL,
  DEFAULT_GROQ_REFINER_MODEL,
  LLM_MODEL,
} from './constants';

// configure Groq cloud endpoint if valid API key is present, otherwise fallback to local Ollama
const rawKey = getEnv('VITE_GROQ_API_KEY');
const groqApiKey = rawKey && rawKey !== 'your_groq_api_key_here' ? rawKey : undefined;

const activeBaseUrl = groqApiKey
  ? DEFAULT_GROQ_BASE_URL
  : getEnv('VITE_OLLAMA_URL', 'http://localhost:11434/v1/');
const activeApiKey = groqApiKey || 'ollama';

/**
 * active LLM model identifier depending on whether Groq API key is present or falling back to local Ollama
 */
export const ACTIVE_LLM_MODEL = groqApiKey
  ? getEnv('VITE_GROQ_MODEL', DEFAULT_GROQ_MODEL)
  : LLM_MODEL;

/**
 * dedicated LLM model identifier for structured recipe refinement and voice optimization
 */
export const ACTIVE_REFINER_MODEL = groqApiKey
  ? getEnv('VITE_GROQ_REFINER_MODEL', DEFAULT_GROQ_REFINER_MODEL)
  : LLM_MODEL;

/**
 * configured OpenAI client pointing to either Groq cloud or local Ollama
 */
export const openai = new OpenAI({
  baseURL: activeBaseUrl,
  apiKey: activeApiKey,
  dangerouslyAllowBrowser: true,
});
