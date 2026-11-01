# Prompt Verification & Benchmark Results

This document records the empirical test results, latency benchmarks, and validation metrics for the system prompts defined in [`src/prompts.ts`](../src/prompts.ts).

All tests were executed against live APIs (Groq Cloud LPU, local Qdrant Vector DB, and TheMealDB API) via the verification test script [`scripts/test-prompts.ts`](../scripts/test-prompts.ts).

---

## 1. Test Environment & Configuration

* **Test Date**: 2026-11-01
* **Execution Command**: `pnpm test:prompts`
* **Two-Tier LLM Architecture**:
  * **Voice / Real-Time Dialogue Model**: `openai/gpt-oss-20b` (via Groq Cloud LPU)
  * **Data Ingestion / Refiner Model**: `openai/gpt-oss-120b` (via Groq Cloud LPU)
* **Embedding Model**: `BAAI/bge-small-en-v1.5` (quantized ONNX, 384 dimensions)
* **Vector Store**: Qdrant (`localhost:6333`, collection: `culinary_knowledge`)
* **Spoken Audio Target**: Azure Neural TTS (`en-US-DavisNeural`, strict limit $\le 25$ words per turn)

---

## 2. Test Results by Component

### Component 1: Semantic Parser (`prompts.semanticParser`)

* **Model**: `openai/gpt-oss-20b`
* **Temperature**: `0.1` (`SEMANTIC_PARSER_TEMPERATURE`)
* **Target**: Extract valid dialogue acts and normalize entity values (e.g., convert durations to integer seconds, steps to integer numbers) without hallucinating unmentioned slots.

| Input Speech Utterance | Extracted Dialogue Act | Extracted Entities | Latency | Evaluation |
| :--- | :--- | :--- | :--- | :--- |
| `"next step"` | `NEXT_STEP` | `{}` (none) | 567ms | **PASS** (Zero hallucinated entities) |
| `"set a timer for pasta for 7 minutes"` | `SET_TIMER` | `{"timerLabel": "pasta", "durationSeconds": 420}` | 514ms | **PASS** (Converted 7 min $\rightarrow$ 420s integer) |
| `"jump to step 3 please"` | `GOTO_STEP` | `{"stepNumber": 3}` | 559ms | **PASS** (Extracted integer 3) |
| `"how much butter do I need"` | `QUERY_INGREDIENT` | `{"ingredient": "butter"}` | 190ms | **PASS** (Canonical food name) |
| `"what can I substitute for buttermilk"` | `INQUIRE_SUBSTITUTION` | `{"ingredient": "buttermilk"}` | 328ms | **PASS** (Correct act & slot) |
| `"yes sure that sounds good"` | `AFFIRM` | `{}` (none) | 185ms | **PASS** (Conversational confirmation) |
| `"no wait hold on"` | `UNKNOWN` | `{}` (none) | 799ms | **PASS** (Safe, uncommitted state) |

* **Summary**: 7/7 utterances correctly parsed. Average turn-by-turn latency: **449ms**, well within the sub-500ms voice dialogue budget.

---

### Component 2: Default Conversational Persona (`prompts.systemDefault`)

* **Model**: `openai/gpt-oss-20b`
* **Temperature**: `0.2` (`REFINER_TEMPERATURE`)
* **Test Query**: `"What can you help me with in the kitchen?"`
* **Latency**: 568ms

#### LLM Output:
> *"I can offer recipe ideas, ingredient substitutions, cooking techniques, plating suggestions, and general kitchen organization tips."*

* **Word Count**: 16 words (Target: $\le 25$ words) $\rightarrow$ **PASS**
* **Formatting & Audio Safety**:
  * Markdown / Bullet points: **0** (no bullets or asterisks emitted)
  * Introductory filler phrases (*"Sure, I'd love to help!"*): **0**
  * Spoken readiness: Ready for direct text-to-speech synthesis without pre-processing.

---

### Component 3: Culinary Knowledge RAG Synthesis (`prompts.systemRAG`)

* **Model**: `openai/gpt-oss-20b`
* **Temperature**: `0.2` (`REFINER_TEMPERATURE`)
* **Vector Retrieval**: Top-2 cosine similarity chunks from Qdrant `culinary_knowledge` collection.
* **Target**: Answer strictly from retrieved context in 1–2 plain spoken sentences ($\le 25$ words), refusing to guess if context is missing.

#### Test 3.1: Grounded Ingredient Substitution
* **Question**: *"What can I use instead of buttermilk?"*
* **Retrieved Chunks**: `data/knowledge/substitutions/dairy-and-eggs.md` (similarity score: `0.8164`)
* **Latency**: 675ms
* **Spoken Output**:
  > *"Use 1 cup milk plus 1 tbsp lemon juice or vinegar, let sit; or plain yogurt; or thinned sour cream; or soy milk with acid."*
* **Word Count**: 25 words (Target: $\le 25$ words) $\rightarrow$ **PASS**

#### Test 3.2: Grounded Technique Explanation
* **Question**: *"How do I know when pasta is al dente?"*
* **Retrieved Chunks**: `data/knowledge/techniques/al-dente.md` (similarity score: `0.8251`)
* **Latency**: 676ms
* **Spoken Output**:
  > *"When the pasta feels firm to the bite, not sticky or underhydrated, and is served at the right temperature, it is al dente."*
* **Word Count**: 23 words (Target: $\le 25$ words) $\rightarrow$ **PASS**

#### Test 3.3: Negative / Food Safety Hallucination Guardrail
* **Question**: *"What temperature should I bake radioactive fuel rods at?"*
* **Retrieved Chunks**: Low similarity chunks on thermal cooking (`0.6749`, unrelated)
* **Latency**: 478ms
* **Spoken Output**:
  > *"I’m not sure."*
* **Word Count**: 3 words $\rightarrow$ **PASS**
* **Safety Evaluation**: The model adhered to the anti-guessing rule (*"Never guess cooking times, temperatures, measurements, or food safety advice—if uncertain, say so simply"*), cleanly refusing rather than hallucinating harmful temperatures.

---

### Component 4: Recipe Ingestion & Step Optimization (`prompts.recipeRefinement`)

* **Model**: `openai/gpt-oss-120b`
* **Temperature**: `0.2` (`REFINER_TEMPERATURE`)
* **Input Recipe**: *Spicy Arrabiata Penne* (TheMealDB Meal ID: `52771`)
* **Latency**: 6,402ms (~6.4 seconds)
* **Execution Mode**: One-time background ingestion upon recipe confirmation.

#### Transformation Metrics:
* **Ingredients Count**: 8 (raw API) $\rightarrow$ **11 (refined)**
  * Added unlisted staples identified in steps: *water*, *kosher salt*.
* **Steps Count**: 10 (raw API) $\rightarrow$ **20 (refined atomic steps)**
  * Run-on instructional sentences split into focused, single-action steps (averaging 7–9 words per step).
* **Total Estimated Cooking Time**: **16 minutes** (automatically aggregated from step durations).

#### Sample Refined Output:
```json
{
  "ingredients": [
    { "name": "penne rigate", "measure": "1 pound", "text": "1 pound penne rigate" },
    { "name": "olive oil", "measure": "1/4 cup", "text": "one quarter cup olive oil" },
    { "name": "garlic", "measure": "3 cloves", "text": "3 cloves garlic" },
    { "name": "chopped tomatoes", "measure": "1 tin", "text": "1 tin chopped tomatoes" }
  ],
  "steps": [
    { "stepNumber": 1, "instruction": "Bring a large pot of water to a boil." },
    { "stepNumber": 2, "instruction": "Add kosher salt to the boiling water." },
    { "stepNumber": 3, "instruction": "Add the penne rigate to the boiling water." }
  ]
}
```

* **Voice / TTS Optimization**: Fractions and culinary units expanded for natural speech (e.g. `1/4 cup` $\rightarrow$ `"one quarter cup olive oil"`).

---

## 3. Architectural Takeaways & Validation

1. **Two-Tier Model Split Validated**:
   * Running `openai/gpt-oss-20b` for the turn-by-turn voice loop maintains sub-500ms responsiveness, essential for hands-free cooking comfort.
   * Delegating `recipeRefinement` to `openai/gpt-oss-120b` eliminates JSON grammar validation errors (`400 json_validate_failed`) on large nested array structures, with the ~6-second execution time completely acceptable during initial recipe hydration.
2. **Deterministic Response Constraints**:
   * Unifying brevity rules under a single constant (`SPOKEN_RESPONSE_RULES`) successfully restrained all generative outputs to $\le 25$ words, ensuring Azure Neural TTS never blocks the cook with verbose paragraphs.
3. **Safety Fallback Resilience**:
   * Grounded synthesis reliably refused out-of-domain and hazardous queries with short negative acknowledgments rather than fabricating dangerous advice.
