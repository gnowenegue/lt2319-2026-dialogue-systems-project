export const REGION = 'swedencentral' as const;

export const ROLES = {
  Assistant: 'assistant',
  User: 'user',
  System: 'system',
} as const;

/**
 * maximum word count threshold for spoken dialogue utterances.
 * keeps responses concise (<25 words) to avoid cognitive overload while cooking.
 */
export const MAX_SPOKEN_WORDS = 25 as const;

/**
 * default number of recent conversational turns included in LLM context windows
 * for dialogue continuity and elliptical / anaphora resolution.
 */
export const DEFAULT_CONVERSATION_WINDOW = 3 as const;
