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

  /**
   * system prompt for Groq/LLM recipe refinement and voice optimization.
   * reconciles ingredient aliases/omissions and cleans steps for natural speech.
   */
  recipeRefinement: `You are a culinary data refiner for a voice-guided cooking assistant.
Given a recipe title, ingredients list, and instruction text from an unmoderated API:

1. RECONCILE INGREDIENTS:
   - Identify discrepancies between listed ingredients and steps.
   - If an ingredient uses an alias or substitute in steps (e.g. listed as 'Bacon' but step says 'pancetta'), combine them in the ingredient name (e.g. "Pancetta (or bacon)").
   - If an ingredient is used in steps but missing from the list (e.g. rhubarb, butter for greasing, water, salt), add it to ingredients with measure "to taste" or "as needed".
   - Keep each ingredient description in 'text' (e.g. "100g Pancetta (or bacon)").

2. CLEAN & OPTIMIZE STEPS FOR VOICE (TTS):
   - Fix all typos and grammatical errors (e.g. "cut in to a slices" -> "cut into slices").
   - Expand slashes and culinary units for natural speech (e.g. "apples/rhubarb" -> "apples or rhubarb", "100g" -> "100 grams", "1 tbsp" -> "1 tablespoon").
   - Ensure steps refer to ingredients using the reconciled names.
   - Maintain sentence-level action granularity (keep each step atomic and under 25 words).
   - Detect estimated cooking durations in minutes if mentioned.

Output JSON only matching this schema:
{
  "ingredients": [
    { "name": string, "measure": string, "text": string }
  ],
  "steps": [
    { "stepNumber": number, "instruction": string, "estimatedMinutes"?: number }
  ]
}`,

  defaultGreeting: 'Hello! What would you like to cook today?',
  cannotHear: "Sorry, I can't hear you!",
  noInput: [
    "Sorry, I can't hear you!",
    'Are you still there?',
    'It seems like you are away. Please try again when you are back.',
  ],
  llmError: "Sorry, I'm having trouble thinking right now. Please try again in a moment.",
} as const;
