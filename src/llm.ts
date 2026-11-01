import { existsSync } from 'node:fs';
import OpenAI from 'openai';

import {
  DEFAULT_GROQ_BASE_URL,
  DEFAULT_GROQ_MODEL,
  DEFAULT_GROQ_REFINER_MODEL,
  LLM_MODEL,
} from './constants';

// auto-load .env in Node runtime if available
if (typeof process !== 'undefined' && process.loadEnvFile && existsSync('.env')) {
  try {
    process.loadEnvFile();
  } catch {
    // ignore if .env cannot be loaded
  }
}

// configure Groq cloud endpoint if valid API key is present, otherwise fallback to local Ollama
const rawKey =
  import.meta.env?.VITE_GROQ_API_KEY ||
  (typeof process !== 'undefined' ? process.env?.VITE_GROQ_API_KEY : undefined);
const groqApiKey = rawKey && rawKey !== 'your_groq_api_key_here' ? rawKey : undefined;

const activeBaseUrl = groqApiKey
  ? DEFAULT_GROQ_BASE_URL
  : import.meta.env?.VITE_OLLAMA_URL ||
    (typeof process !== 'undefined' ? process.env?.VITE_OLLAMA_URL : undefined) ||
    'http://localhost:11434/v1/';
const activeApiKey = groqApiKey || 'ollama';

/**
 * active LLM model identifier depending on whether Groq API key is present or falling back to local Ollama
 */
export const ACTIVE_LLM_MODEL = groqApiKey
  ? import.meta.env?.VITE_GROQ_MODEL ||
    (typeof process !== 'undefined' ? process.env?.VITE_GROQ_MODEL : undefined) ||
    DEFAULT_GROQ_MODEL
  : LLM_MODEL;

/**
 * dedicated LLM model identifier for structured recipe refinement and voice optimization
 */
export const ACTIVE_REFINER_MODEL = groqApiKey
  ? import.meta.env?.VITE_GROQ_REFINER_MODEL ||
    (typeof process !== 'undefined' ? process.env?.VITE_GROQ_REFINER_MODEL : undefined) ||
    DEFAULT_GROQ_REFINER_MODEL
  : LLM_MODEL;

/**
 * configured OpenAI client pointing to either Groq cloud or local Ollama
 */
export const openai = new OpenAI({
  baseURL: activeBaseUrl,
  apiKey: activeApiKey,
  dangerouslyAllowBrowser: true,
});
