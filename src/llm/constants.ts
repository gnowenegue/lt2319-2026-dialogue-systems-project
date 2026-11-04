/**
 * default local Ollama model identifier
 */
export const LLM_MODEL = 'llama3.2:latest' as const;

/**
 * base URL for Groq OpenAI-compatible API endpoint
 */
export const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1' as const;

/**
 * dev server proxy path for Groq to bypass browser CORS restrictions
 */
export const GROQ_PROXY_PATH = '/api/groq' as const;

/**
 * default Groq model identifier for general dialogue and parsing
 */
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b' as const;

/**
 * default Groq model identifier for structured recipe refinement and voice optimization
 */
export const DEFAULT_GROQ_REFINER_MODEL = 'openai/gpt-oss-120b' as const;

/**
 * default local Ollama API endpoint
 */
export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1/' as const;

/**
 * fallback API key placeholder required by the OpenAI client when connecting to Ollama
 */
export const DEFAULT_OLLAMA_API_KEY = 'ollama' as const;
