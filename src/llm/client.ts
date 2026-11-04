import OpenAI from 'openai';

import { getEnv } from '../env';
import {
  DEFAULT_GROQ_BASE_URL,
  DEFAULT_GROQ_MODEL,
  DEFAULT_GROQ_REFINER_MODEL,
  DEFAULT_OLLAMA_API_KEY,
  DEFAULT_OLLAMA_BASE_URL,
  GROQ_PROXY_PATH,
  LLM_MODEL,
} from './constants';
import type { LlmClientConfig } from './types';

const groqApiKey = getEnv('VITE_GROQ_API_KEY');

/**
 * routes browser requests through dev proxy to bypass CORS restrictions while letting Node/CLI scripts call directly
 */
const resolveGroqBaseUrl = (): string => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(GROQ_PROXY_PATH, window.location.origin).toString();
  }
  return DEFAULT_GROQ_BASE_URL;
};

/**
 * creates a configured OpenAI client instance pointing to Groq cloud or local Ollama
 */
export const createLlmClient = (config?: LlmClientConfig): OpenAI => {
  // configure Groq cloud endpoint if valid API key is present, otherwise fallback to local Ollama
  const activeBaseUrl =
    config?.baseURL ??
    (groqApiKey ? resolveGroqBaseUrl() : getEnv('VITE_OLLAMA_URL', DEFAULT_OLLAMA_BASE_URL));

  const activeApiKey = config?.apiKey ?? (groqApiKey || DEFAULT_OLLAMA_API_KEY);

  return new OpenAI({
    baseURL: activeBaseUrl,
    apiKey: activeApiKey,
    dangerouslyAllowBrowser: true,
  });
};

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
 * default configured OpenAI client pointing to either Groq cloud or local Ollama
 */
export const openai = createLlmClient();
