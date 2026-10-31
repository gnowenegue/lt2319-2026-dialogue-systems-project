import prompts from './prompts';

export const REGION = 'swedencentral' as const;
export const LLM_MODEL = 'llama3.2:latest' as const;
export const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1' as const;
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b' as const;

export const ROLES = {
  Assistant: 'assistant',
  User: 'user',
  System: 'system',
} as const;

export const NO_INPUT_THRESHOLD = prompts.noInput.length;
