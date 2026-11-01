export const REGION = 'swedencentral' as const;
export const LLM_MODEL = 'llama3.2:latest' as const;
export const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1' as const;
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b' as const;
export const DEFAULT_GROQ_REFINER_MODEL = 'openai/gpt-oss-120b' as const;

export const ROLES = {
  Assistant: 'assistant',
  User: 'user',
  System: 'system',
} as const;

export const NO_INPUT_THRESHOLD = 3 as const;

/**
 * maximum word count threshold for spoken dialogue utterances.
 * keeps responses concise (<25 words) to avoid cognitive overload while cooking.
 */
export const MAX_SPOKEN_WORDS = 25 as const;

/**
 * duration in milliseconds for the hands-free open-mic follow-up window after speech.
 */
export const OPEN_MIC_FOLLOW_UP_MS = 8000 as const;
