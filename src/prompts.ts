import { MAX_SPOKEN_WORDS } from './constants';
import { DIALOGUE_ACTS } from './semantic-parser/constants';

// shared rules for concise, voice-safe responses for Azure Neural TTS delivery
export const SPOKEN_RESPONSE_RULES = `Answer in 1-2 plain sentences strictly under ${MAX_SPOKEN_WORDS} words. No markdown, lists, or filler. Never guess cooking times, temperatures, measurements, or food safety advice—if uncertain, say so simply.`;

/**
 * system prompts provided to LLMs for semantic parsing, recipe normalization, and synthesis.
 */
export const SYSTEM_PROMPTS = {
  /**
   * system prompt for Groq/LLM semantic extraction.
   * dynamically lists all valid dialogue acts derived from `DIALOGUE_ACTS`.
   */
  semanticParser: `Extract dialogue act and entities from cooking speech as JSON.

Acts: ${DIALOGUE_ACTS.join(', ')}

Schema: {"act": "<Act>", "entities": {"ingredient": string, "stepNumber": number, "query": string, "durationSeconds": number, "timerLabel": string}}

Rules:
- Return exactly ONE JSON object for the target utterance only.
- Omit unused entity keys. Return UNKNOWN if intent is unclear.
- Active dialogue phase: When provided, use the phase to disambiguate short utterances, ordinals, and numbers (e.g. in SelectingRecipe, "two" or "the second one" means SELECT_RECIPE; in WaitingForStepCommand, "two" or "step two" means GOTO_STEP). Global acts (timers, help, greetings) remain accessible in any phase.
- SKIP_PREP: User has all ingredients, wants to skip prep, or start cooking immediately. Overrides AFFIRM.
- GOTO_STEP: stepNumber must be integer (e.g. "step two" -> 2). Use -1 for "last"/"final", 1 for "first".
- INQUIRE_SUBSTITUTION: Swapping, replacing, missing ingredients, or clarifying ingredient types/varieties (e.g. "I don't have butter", "replace milk", "what kind of oil?", "what oil?"). Put food in "ingredient", question in "query".
- INQUIRE_TECHNIQUE: Culinary definitions or how-to checks (e.g. "what does sauté mean?"). Put question in "query".
- QUERY_INGREDIENT vs INQUIRE_SUBSTITUTION / QUERY_STEP_DETAIL: QUERY_INGREDIENT is strictly for ingredient quantities, presence, or full list ("how much salt?", "do we need butter?", "what ingredients are in this?"). Questions asking what kind/type/variety to use or about swapping/substituting are INQUIRE_SUBSTITUTION ("what kind of oil?", "which flour?"). QUERY_STEP_DETAIL is for step actions ("what heat?").
- SEARCH_RECIPE: Naming a dish, meal, or ingredient to find or cook. Put strictly the food, meal, or ingredient name in "query" without action verbs or search prefixes (e.g. "find chicken curry" -> "chicken curry", "how to make pancakes" -> "pancakes", "banana pancake" -> "banana pancake").
- SELECT_RECIPE: Choosing a candidate ONLY when presented with numbered options (e.g. "the second one", "choose Alfredo", "number 1"). Put candidate number (1, 2, 3) in "stepNumber" or name in "query".
- SET_TIMER: Convert duration to total integer seconds (e.g. 5 min -> 300).

Examples:
User: "Actually, I have everything. Let's cook" -> {"act": "SKIP_PREP"}
User: "Banana pancake" -> {"act": "SEARCH_RECIPE", "entities": {"query": "Banana pancake"}}
User: "How do I make chicken curry?" -> {"act": "SEARCH_RECIPE", "entities": {"query": "chicken curry"}}
User: "Got those" -> {"act": "AFFIRM"}
User: "Can we go to the last step?" -> {"act": "GOTO_STEP", "entities": {"stepNumber": -1}}
User: "Let's make the second one" -> {"act": "SELECT_RECIPE", "entities": {"stepNumber": 2}}
User: "How much olive oil do we need?" -> {"act": "QUERY_INGREDIENT", "entities": {"ingredient": "olive oil"}}
User: "Can I use butter instead of oil?" -> {"act": "INQUIRE_SUBSTITUTION", "entities": {"ingredient": "butter", "query": "Can I use butter instead of oil?"}}
User: "What kind of oil?" -> {"act": "INQUIRE_SUBSTITUTION", "entities": {"ingredient": "oil", "query": "What kind of oil should I use?"}}
User: "I don't have vanilla" -> {"act": "INQUIRE_SUBSTITUTION", "entities": {"ingredient": "vanilla", "query": "What can I substitute for vanilla?"}}
User: "What does braise mean?" -> {"act": "INQUIRE_TECHNIQUE", "entities": {"query": "What does braise mean?"}}
User: "Set a timer for 5 minutes" -> {"act": "SET_TIMER", "entities": {"durationSeconds": 300, "timerLabel": "cooking"}}`,

  /**
   * default conversational system prompt for general cooking assistance.
   */
  systemDefault: `You are a culinary assistant helping a cook. ${SPOKEN_RESPONSE_RULES}`,

  /**
   * spoken RAG synthesis prompt for answering culinary knowledge questions.
   */
  systemRAG: `Answer the cook's question using only the provided context. For substitutions, if none is found, state that there is no substitute listed for that ingredient. ${SPOKEN_RESPONSE_RULES}`,

  /**
   * spoken synthesis prompt for answering factual questions about the active cooking step.
   */
  systemStepDetail: `Answer the cook's question about the current cooking step using only the provided step instruction. If not mentioned in the step, say that it's not mentioned. ${SPOKEN_RESPONSE_RULES}`,

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
- For garnish or serving items where measure is a usage note (e.g. 'to serve', 'for garnish', 'to taste', 'optional'), keep 'measure' intact but omit the note from 'text' for spoken gathering (e.g. name "Raspberries", measure "to serve" -> text "raspberries").
- Set 'text' to the full spoken description for gathering (e.g. "100 grams pancetta (or bacon)").
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
} as const;

/**
 * predefined assistant dialogue lines spoken directly to the user.
 */
export const SPOKEN_RESPONSES = {
  /**
   * initial spoken utterance prompting the user to specify a recipe to cook
   */
  promptRecipe: 'Hi! What would you like to cook today?',
  greeting: 'Hi! Ready when you are.',
  help: 'You can ask to search for a recipe, navigate steps with next or repeat, set timers, or ask about ingredients.',
  helpPromptRecipe:
    "Tell me what you'd like to cook, such as quick pasta, chicken curry, or pancakes.",
  helpConfirmRecipe: 'Say yes to start cooking, or ask to search for a different recipe.',
  helpPrep:
    "Say 'yes' or 'got it' when you have gathered these ingredients, or say 'skip' to jump straight into cooking.",
  helpStep:
    "You can say 'next step', 'repeat', 'go to step number', 'set a timer', or ask about ingredients and cooking techniques.",
  helpCompleted:
    "You have finished this recipe! Say 'start' or ask for another dish to cook again.",
  selectRecipeHelp:
    'Please choose a recipe by saying its number or name, or ask to search for something else.',
  selectRecipeReprompt:
    'Sorry, I did not recognize that option. Please choose recipe 1, 2, or 3, or say the recipe name.',
  cannotHear: "Sorry, I didn't catch that. Could you say that again?",
  noInput: [
    "Sorry, I didn't catch that. Could you say that again?",
    "Are you still there? Let me know when you're ready for the next step.",
    "I'll pause for now. Tap the microphone when you're ready to continue.",
  ],
  recipeNotFound: 'Sorry, I could not find a recipe for that. What else would you like to cook?',
  recipeLoadFailed: 'Sorry, I could not load that recipe. What else would you like to cook?',
  prepWaiting: "Take your time. Say 'ready' or 'yes' when you have them.",
  stepWaiting: "No rush. Say 'next step' whenever you're ready.",
  stepDetailNotFound: "Sorry, I couldn't find details on that step.",
  knowledgeNotFound: "Sorry, I couldn't find advice on that in my culinary guides.",
  recipeCompleted: 'All steps completed. Enjoy your meal!',
} as const;

export type SystemPrompts = typeof SYSTEM_PROMPTS;
export type SpokenResponses = typeof SPOKEN_RESPONSES;

/**
 * centralized prompt registry for CookMate.
 * contains system instructions for semantic parsing, RAG response synthesis, and conversation handling.
 */
const prompts = {
  ...SYSTEM_PROMPTS,
  ...SPOKEN_RESPONSES,
} as const;

export type PromptRegistry = typeof prompts;
export default prompts;
