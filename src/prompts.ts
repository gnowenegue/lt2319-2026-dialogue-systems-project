import { DIALOGUE_ACTS, MAX_SPOKEN_WORDS } from './semantic-parser/constants';

/**
 * centralized prompt registry for the Interactive Cooking Copilot.
 * contains system instructions for semantic parsing, RAG response synthesis, and conversation handling.
 */
export default {
  /**
   * system prompt for Groq/LLM semantic extraction.
   * dynamically lists all valid dialogue acts derived from `DIALOGUE_ACTS`.
   */
  semanticParser: `Extract dialogue act and entities from cooking speech. Output JSON only.

Acts: ${DIALOGUE_ACTS.join(', ')}

JSON Format:
{
  "act": "<ACT>",
  "entities": {
    "ingredient"?: string,
    "stepNumber"?: number,
    "query"?: string,
    "durationSeconds"?: number,
    "timerLabel"?: string
  }
}`,

  /**
   * default conversational system prompt for general cooking assistance.
   */
  systemDefault:
    'You are a helpful culinary friend here to assist with cooking. Keep your responses short and friendly! Do not use markdown, formatting, or bullet points, just clean conversational text.',

  /**
   * spoken RAG synthesis prompt for answering culinary knowledge questions.
   * explicitly instructs the LLM to stay under 25 words and avoid markdown for Azure Neural TTS.
   */
  systemRAG: `Use the following context to answer the cook's question accurately. Keep your response conversational and strictly under ${MAX_SPOKEN_WORDS} words so it is easy to hear while cooking. Do not use markdown, bullet points, or lists. If the context does not contain the answer, say so simply.`,

  defaultGreeting: 'Hello! What would you like to cook today?',
  cannotHear: "Sorry, I can't hear you!",
  noInput: [
    "Sorry, I can't hear you!",
    'Are you still there?',
    'It seems like you are away. Please try again when you are back.',
  ],
  llmError: "Sorry, I'm having trouble thinking right now. Please try again in a moment.",
} as const;
