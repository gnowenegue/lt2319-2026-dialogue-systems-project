import { MAX_SPOKEN_WORDS } from './constants';
import { DIALOGUE_ACTS } from './semantic-parser/constants';

// shared rules for concise, voice-safe responses for Azure Neural TTS delivery
const SPOKEN_RESPONSE_RULES = `Answer in 1-2 plain sentences strictly under ${MAX_SPOKEN_WORDS} words. No markdown, lists, or filler. Never guess cooking times, temperatures, measurements, or food safety advice—if uncertain, say so simply.`;

/**
 * centralized prompt registry for the Interactive Cooking Copilot.
 * contains system instructions for semantic parsing, RAG response synthesis, and conversation handling.
 */
export default {
  /**
   * system prompt for Groq/LLM semantic extraction.
   * dynamically lists all valid dialogue acts derived from `DIALOGUE_ACTS`.
   */
  semanticParser: `Extract dialogue act and entities from cooking speech. Output JSON matching the schema.

Acts: ${DIALOGUE_ACTS.join(', ')}

Schema:
{
  "act": "<one of Acts>",
  "entities": {
    "ingredient": "string (food name, e.g. 'butter')",
    "stepNumber": "number (positive integer, e.g. 3)",
    "query": "string (recipe search term or technique query)",
    "durationSeconds": "number (total duration in seconds, e.g. 5 minutes = 300)",
    "timerLabel": "string (timer name if mentioned, e.g. 'pasta')"
  }
}

Rules:
- Omit entities or unused entity keys if not mentioned.
- Only select acts from the Acts list; if unclear, use "UNKNOWN".
- Never infer or assume entities not explicitly spoken.
- Convert timer durations to integer seconds (never minutes or text).`,

  /**
   * default conversational system prompt for general cooking assistance.
   */
  systemDefault: `You are a culinary assistant helping a cook. ${SPOKEN_RESPONSE_RULES}`,

  /**
   * spoken RAG synthesis prompt for answering culinary knowledge questions.
   */
  systemRAG: `Answer the cook's question using only the provided context. ${SPOKEN_RESPONSE_RULES}`,

  /**
   * system prompt for Groq/LLM recipe refinement and voice optimization.
   * reconciles ingredient aliases/omissions and cleans steps for natural speech.
   */
  recipeRefinement: `Refine and normalize recipe JSON for spoken step-by-step cooking. Output JSON matching the schema.

Schema:
{
  "ingredients": [
    { "name": "string", "measure": "string", "text": "string" }
  ],
  "steps": [
    { "stepNumber": 1, "instruction": "string", "estimatedMinutes": 5 }
  ]
}

Rules:
1. INGREDIENTS:
- Reconcile aliases between ingredients and steps (e.g. listed 'Bacon', step says 'pancetta' -> "Pancetta (or bacon)").
- Add missing staple ingredients mentioned in steps (e.g. water, salt, butter for greasing) with measure "to taste" or "as needed".
- Set 'text' to the full spoken description (e.g. "100 grams pancetta (or bacon)").
- Never invent ingredients not referenced in the recipe.

2. STEPS:
- Expand abbreviations, units, fractions, and temperatures for speech:
  * "100g" -> "100 grams", "1 tbsp" -> "1 tablespoon", "1/2" -> "half a", "2 tsp" -> "2 teaspoons".
  * "180°C" -> "180 degrees Celsius", "375°F" -> "375 degrees Fahrenheit".
  * "apples/rhubarb" -> "apples or rhubarb".
- Remove author commentary, URLs, emojis, and parentheticals.
- Split compound sentences into atomic single-action steps under 25 words each.
- Renumber steps sequentially starting from 1.
- Omit 'estimatedMinutes' if no specific duration is mentioned in the step. Never guess cooking times.`,

  /**
   * initial spoken utterance prompting the user to specify a recipe to cook
   */
  promptRecipe: 'Hi! What would you like to cook today?',
  cannotHear: "Sorry, I didn't catch that. Could you say that again?",
  noInput: [
    "Sorry, I didn't catch that. Could you say that again?",
    "Are you still there? Let me know when you're ready for the next step.",
    "I'll pause for now. Tap the microphone when you're ready to continue.",
  ],
  llmError: "Sorry, I'm having trouble thinking right now. Please try again in a moment.",
} as const;
