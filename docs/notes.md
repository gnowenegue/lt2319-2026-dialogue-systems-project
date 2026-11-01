# Architectural & Design Notes

This document records key design decisions, tradeoffs, and domain-specific considerations for the Interactive Cooking Copilot.

---

## Table of Contents

- [1. Recipe Step Granularity: Sentence-Level vs. Paragraph-Level](#1-recipe-step-granularity-sentence-level-vs-paragraph-level)
  - [Context](#context)
  - [The Problem in Spoken Dialogue Systems](#the-problem-in-spoken-dialogue-systems)
  - [Decision: Sentence-Level Steps (Action-Level Granularity)](#decision-sentence-level-steps-action-level-granularity)
  - [Implementation Approach](#implementation-approach)
- [2. TheMealDB Data Layer Conventions](#2-themealdb-data-layer-conventions)
  - [Fixed Ingredient Slots (`MAX_MEALDB_INGREDIENTS = 20`)](#fixed-ingredient-slots-max_mealdb_ingredients--20)
  - [Two-Stage Discovery Pattern (`filter` vs. `lookup`)](#two-stage-discovery-pattern-filter-vs-lookup)
  - [Factual Grounding & Safety Guardrails](#factual-grounding--safety-guardrails)
- [3. Testing Framework & Directory Convention](#3-testing-framework--directory-convention)
  - [Decision: Vitest for Unit Testing](#decision-vitest-for-unit-testing)
  - [Directory Convention: Feature-Level `__tests__/`](#directory-convention-feature-level-__tests__)
- [4. Culinary RAG Scope & Ingestion Strategy](#4-culinary-rag-scope--ingestion-strategy)
  - [Decision: Scope Limited to Cooking Techniques & Ingredient Substitutions](#decision-scope-limited-to-cooking-techniques--ingredient-substitutions)
  - [Decision: Curated High-Signal Corpus vs. Web Scraping (YAGNI)](#decision-curated-high-signal-corpus-vs-web-scraping-yagni)
  - [Single Vector Collection with Semantic Metadata](#single-vector-collection-with-semantic-metadata)
  - [Section-Aware, Heading-Preserving Chunking Strategy](#section-aware-heading-preserving-chunking-strategy)
- [5. Offline In-Browser Embedding Pipeline (Transformers.js & ONNX)](#5-offline-in-browser-embedding-pipeline-transformersjs--onnx)
  - [Context & The Ollama Bottleneck](#context--the-ollama-bottleneck)
  - [Decision: Client-Side Transformers.js over External Embedding Services](#decision-client-side-transformersjs-over-external-embedding-services)
  - [Model Selection: BAAI/bge-small-en-v1.5 (Quantized ONNX)](#model-selection-baaibge-small-en-v15-quantized-onnx)
  - [Bundled Offline Asset Strategy (`public/models/`)](#bundled-offline-asset-strategy-publicmodels)
  - [Architectural Separation: Local Embeddings vs. Cloud LLM](#architectural-separation-local-embeddings-vs-cloud-llm)
- [6. Two-Tier LLM Architecture for Voice Cooking (20B Speech Loop vs. 120B Recipe Ingestion)](#6-two-tier-llm-architecture-for-voice-cooking-20b-speech-loop-vs-120b-recipe-ingestion)
  - [Context & The Spoken Latency Budget](#context--the-spoken-latency-budget)
  - [The Problem: Flat Intent Extraction vs. Nested Document Synthesis](#the-problem-flat-intent-extraction-vs-nested-document-synthesis)
  - [Decision: Decouple Turn-by-Turn Speech from One-Off Ingestion](#decision-decouple-turn-by-turn-speech-from-one-off-ingestion)
  - [Implementation & Environment Configuration](#implementation--environment-configuration)

---

## 1. Recipe Step Granularity: Sentence-Level vs. Paragraph-Level

### Context
TheMealDB stores recipe instructions (`strInstructions`) as freeform text, typically separated into multi-sentence paragraphs using `\r\n`.

For example, in *Spicy Arrabiata Penne*, paragraph 2 contains:
> *"In a large skillet over medium-high heat, add the olive oil and heat until the oil starts to shimmer. Add the garlic and cook, stirring, until fragrant, 1 to 2 minutes. Add the chopped tomatoes, red chile flakes, Italian seasoning and salt and pepper to taste. Bring to a boil and cook for 5 minutes. Remove from the heat and add the chopped basil."*

### The Problem in Spoken Dialogue Systems
* **Paragraph-level steps**:
  * Combining 5 physical actions into a single turn produces a 75-word utterance.
  * Causes cognitive overload for a cook whose hands and eyes are occupied with a hot pan.
  * Violates the spoken NLG design target of concise responses (<25 words per utterance).
  * Makes conversational repair and step navigation clumsy (e.g., *"What did you say after garlic?"*).

### Decision: Sentence-Level Steps (Action-Level Granularity)
* We normalize instructions into **individual sentence-level actions** (10 steps instead of 3 for Arrabiata).
* Each turn delivers a single, focused instruction (e.g. *"Step 4: In a large skillet over medium-high heat, add the olive oil and heat until the oil starts to shimmer."*).
* The user performs the action, then says *"Next"*, *"Done"*, or asks a question about that specific action.

### Implementation Approach
* Rather than maintaining brittle custom regexes to split sentences, use modern JavaScript's native **`Intl.Segmenter`** (`{ granularity: "sentence" }`).
* `Intl.Segmenter` is standard in Node.js and all modern browsers, requires zero dependencies, and correctly preserves culinary abbreviations (e.g., `"1.5 tbsp."`, `"approx. 9 mins."`).

---

## 2. TheMealDB Data Layer Conventions

### Fixed Ingredient Slots (`MAX_MEALDB_INGREDIENTS = 20`)
* TheMealDB SQL database explicitly caps ingredients at 20 slots (`strIngredient1` through `strIngredient20` and `strMeasure1` through `strMeasure20`).
* Stored as a constant `MAX_MEALDB_INGREDIENTS = 20` in `src/recipes/constants.ts` to avoid magic numbers.
* Extraction runs a clear, sequential 1..20 loop, pairing each valid ingredient with its measurement into a clean `{ name, measure, text }` structure.

### Two-Stage Discovery Pattern (`filter` vs. `lookup`)
* TheMealDB filter endpoints (`filter.php?c=...` or `filter.php?i=...`) return **light summaries only** (`idMeal`, `strMeal`, `strMealThumb`), containing no ingredients or steps.
* The system follows a two-stage flow:
  1. **Candidate Discovery**: Search or filter to present 2–3 options.
  2. **Hydration**: Call `lookup.php?i={idMeal}` once a recipe is selected to retrieve the full instructions before entering the cooking session.

### Factual Grounding & Safety Guardrails
* Per TheMealDB's official agent guidance (`AGENTS.md`):
  * **Never invent missing quantities**: If an ingredient has a blank measure, present it as-is (e.g., "to taste").
  * **No silent substitutions**: Recipe facts remain immutable; user substitutions are tracked separately in dialogue state.
  * **No allergen certification**: Do not certify dishes as allergen-free or medical-grade based on category tags alone.

---

## 3. Testing Framework & Directory Convention

### Decision: Vitest for Unit Testing
* **Native Vite Integration**: Vitest shares `vite.config.ts` and transforms TypeScript out-of-the-box without extra runner layers.
* **Alignment with SpeechState**: The course's core dialogue library (`speechstate`) also uses Vitest (`"test": "vitest"`).
* **Mocking Capabilities**: Provides built-in mock utilities (`vi.fn()`, `vi.spyOn()`) for mocking network requests (`fetch`) and dialogue state actors in later phases.

### Directory Convention: Feature-Level `__tests__/`
* Tests are organized under `src/<feature>/__tests__/*.test.ts` (e.g. `src/recipes/__tests__/normalizer.test.ts`).
* Keeps the project root and production directories clean while allowing mock data and test fixtures to live right alongside the feature code they test.

---

## 4. Culinary RAG Scope & Ingestion Strategy

### Decision: Scope Limited to Cooking Techniques & Ingredient Substitutions
* **Kitchen Reality**: During active cooking, home cooks almost exclusively ask two types of domain questions:
  1. **Substitutions**: *"I don't have heavy cream, can I use milk?"*, *"Can I swap pecorino for parmesan?"*
  2. **Techniques & Troubleshooting**: *"What does sauté mean?"*, *"Why isn't this browning?"*, *"How hot should the skillet be?"*
* **Dialogue Simplicity**: Constraining the knowledge domain simplifies semantic parsing and dialogue intent routing in XState to two primary dialogue acts:
  * `INQUIRE_SUBSTITUTION` (entities: `originalIngredient`, `candidateSubstitute`)
  * `INQUIRE_TECHNIQUE` (entities: `action`, `symptom`)
* Avoids bloating vector retrieval with unrelated food science, broad culinary history, or conflicting recipes.

### Decision: Curated High-Signal Corpus vs. Web Scraping (YAGNI)
* **The Problem with Scraping Wikibooks**:
  * Non-recipe culinary reference content on Wikibooks is small (~10–15 relevant topic pages).
  * MediaWiki pages contain noisy HTML/templates, edit tags (`[edit]`), navigation banners, and inconsistent tables.
  * Writing, debugging, and maintaining scraping/cleanup pipelines is unnecessary engineering overhead for a fixed knowledge domain.
* **Curated Markdown Corpus**:
  * Documents are authored in clean, modular Markdown under `data/knowledge/` (`substitutions/` and `techniques/`).
  * Structured explicitly into heading-anchored, concise sections designed to be chunked into atomic 100–250 word advisory blocks.
  * Guarantees factual accuracy, high embedding signal-to-noise ratio, and answers concise enough for spoken dialogue (<25 words per utterance).

### Single Vector Collection with Semantic Metadata
* Rather than managing multiple collections in Qdrant, all culinary knowledge lives in a single collection (`culinary_knowledge`).
* Each point is tagged with payload metadata (`category: "substitutions" | "techniques"`, `topic`, `sourceFile`).
* Enables unified vector search with optional metadata filtering when dialogue state provides explicit intent context.

### Section-Aware, Heading-Preserving Chunking Strategy
* **The Problem with Naive Character Splitting**:
  * Blind character slicing (e.g. fixed 500-char windows) cuts sentences in half, separates advice from caveats, and detaches headings from their body text (leaving empty headers like `### Salt`).
  * In a spoken dialogue copilot, severed advice produces incomplete LLM responses, confusing cooks who cannot visually read a screen.
* **Heading-Preserving Splits (`##` and `###`)**:
  * Cuts strictly along Markdown H2 (`##`) and H3 (`###`) boundaries to mirror natural topic divisions across varied Wikibooks authoring styles.
  * Stamps the document title context (e.g. `[Sautéing]`, `[Al Dente]`) at the start of each chunk so semantic vectors retain topic identity even when the body text uses generic language.
  * Eliminates orphan headings (<15 chars of text) by keeping headers glued directly to their explanation paragraphs.
* **Noise & Keyword Trap Filtering**:
  * Strips breadcrumbs (`Cookbook | Recipes | ...`) and HTML metadata comments prior to chunking.
  * Filters out trailing recipe lists (`## Recipes that call for...`), cross-references (`## See also`), and bibliographies to prevent false-positive keyword matches during vector search.
* **Sentence-Boundary Priority**:
  * Sections exceeding 900 characters fall back to recursive splitting with separator priority `["\n\n\n", "\n\n", ". ", "\n", " "]`, enforcing cuts between full sentences rather than arbitrary mid-sentence line breaks.

---

## 5. Offline In-Browser Embedding Pipeline (Transformers.js & ONNX)

### Context & The Ollama Bottleneck
* The initial starter architecture (from Lab 5) routed embedding requests through a remote Ollama server (`qwen3-embedding`) via an OpenAI-compatible HTTP interface.
* **The Problem**:
  * When hosted on a shared university server, Ollama models automatically unload after 5 minutes of idle time (`keep_alive`), creating 3-to-5 second cold-boot latency spikes on subsequent turns.
  * It introduced a strict network and VPN dependency for what should be a responsive client-side cooking assistant.
  * Requiring evaluators or home cooks to install and manage a background Ollama daemon locally adds friction and violates self-contained project requirements.

### Decision: Client-Side Transformers.js over External Embedding Services
* We migrated embedding extraction entirely to **`@huggingface/transformers`** (v4), running directly within the browser (via WebAssembly / ONNX Runtime) and in Node.js for CLI ingestion.
* **Benefits**:
  * **Zero network latency & no cold starts**: Embeddings compute deterministically in **~15ms** on a standard CPU.
  * **Complete autonomy**: Operates 100% offline without API keys, usage costs, or rate limits.
  * **Cross-runtime consistency**: The exact same tokenizer and ONNX graph run in both Node.js (`scripts/rag-cli.ts`) during ingestion and the client browser (`src/rag/service.ts`) during live dialogue.

### Model Selection: BAAI/bge-small-en-v1.5 (Quantized ONNX)
* **Model Choice**: `BAAI/bge-small-en-v1.5` (exported to ONNX by Xenova on Hugging Face Hub).
* **Retrieval Quality**:
  * Consistently outperforms older standard embedding models like `all-MiniLM-L6-v2` by ~10 points on the MTEB (Massive Text Embedding Benchmark) retrieval tasks while maintaining the exact same compact vector footprint (384 dimensions).
  * Specifically optimized for **asymmetric retrieval**: matching short, informal user questions (*"Can I use butter instead?"*) to longer explanatory culinary guidance chunks.
* **8-Bit Integer Quantization (`model_quantized.onnx`)**:
  * Converted from 32-bit floating point (`fp32`) to 8-bit integer (`int8`).
  * Shrinks the total on-disk model weight footprint by **75%** (from 133 MB down to **32.4 MB**).
  * WebAssembly executes int8 SIMD matrix multiplications significantly faster on commodity laptop CPUs, with less than 0.3% degradation in benchmark retrieval accuracy compared to full precision.

### Bundled Offline Asset Strategy (`public/models/`)
* Rather than downloading model weights dynamically from the Hugging Face Hub on first run (which requires internet and pollutes user home directories), all model assets are bundled directly in [`public/models/bge-small-en-v1.5/`](file:///Users/eugenewong/Documents/Projects/lt2319-2026-dialogue-systems-project/public/models/bge-small-en-v1.5/):
  * `config.json`, `tokenizer.json`, `tokenizer_config.json`, `special_tokens_map.json`, `vocab.txt`
  * `onnx/model_quantized.onnx`
* **Static Serving**:
  * In the browser, Vite serves these static files directly from root (`/models/bge-small-en-v1.5/`).
  * In Node CLI scripts, paths resolve directly from the local file system (`process.cwd() + '/public/models'`).
* **Strict Offline Enforcement (`env.allowRemoteModels = false`)**:
  * We explicitly set `env.allowRemoteModels = false` in [`src/rag/service.ts`](file:///Users/eugenewong/Documents/Projects/lt2319-2026-dialogue-systems-project/src/rag/service.ts) (which is shared and reused across both the browser and [`scripts/rag-cli.ts`](file:///Users/eugenewong/Documents/Projects/lt2319-2026-dialogue-systems-project/scripts/rag-cli.ts)).
  * Forbids any silent outbound HTTP requests to `huggingface.co`, ensuring zero telemetry and fast failure if any local model file is missing.

### Architectural Separation: Local Embeddings vs. Cloud LLM
* **Local In-Browser (Embeddings & Vector Search)**:
  * 32 MB model size and ~15ms execution time make local embeddings ideal for edge/client-side execution.
* **Cloud API (Conversational LLM / Spoken NLG)**:
  * Full generative LLMs (e.g. Llama 3, Gemini Flash) require 2 GB–8 GB of memory and induce significant browser memory pressure and token generation delays (>1s) on client devices.
  * Generative chat completions remain delegated to cloud APIs (Groq / Gemini) to satisfy our spoken NLG requirement of sub-second responses and concise speech (<25 words per turn).

---

## 6. Two-Tier LLM Architecture for Voice Cooking (20B Speech Loop vs. 120B Recipe Ingestion)

### Context & The Spoken Latency Budget
Voice interaction during physical cooking has tight latency bounds:
* A home cook with hot pans or dirty hands perceives pauses longer than 800ms as an unresponsive or broken system.
* The end-to-end voice loop consists of: `User Speech -> Azure STT -> LLM Processing -> Azure TTS -> Audio Playback`.
* To keep the total interaction snappy, the cloud LLM processing window must complete in under 500ms.

### The Problem: Flat Intent Extraction vs. Nested Document Synthesis
The cooking copilot performs two fundamentally different LLM workloads:
1. **Real-Time Turn Dialogue (`semanticParser`, `systemRAG`, `systemDefault`)**:
   * Evaluated on every spoken user turn (10–30 turns per cooking session).
   * Generates compact, flat outputs: dialogue acts (`NEXT_STEP`, `SET_TIMER`), simple entity slots (ingredient name, seconds), or 1–2 spoken sentences (<25 words).
   * A 20B parameter model (`openai/gpt-oss-20b`) completes these turns reliably in 140ms–400ms on Groq LPUs.
2. **Heavy Recipe Refinement (`recipeRefinement`)**:
   * Transforms raw API recipe data (TheMealDB) into spoken-friendly structured data.
   * Requires complex schema generation: reconciling ingredient discrepancies, detecting missing staples, expanding abbreviations for TTS, and splitting multi-action run-on sentences into atomic steps.
   * Under Groq's constrained grammar decoding (`response_format: { type: 'json_object' }`), the 20B model failed with `400 json_validate_failed` because its attention weights defaulted to conversational lead-ins or markdown fences on long nested array structures.
   * Conversely, a 120B model (`openai/gpt-oss-120b`) possesses the instruction-following fidelity to emit valid nested JSON without grammar violations.

### Decision: Decouple Turn-by-Turn Speech from One-Off Ingestion
Rather than forcing a single model across both disparate tasks:
* **Real-time Voice Turns**: Bound to `VITE_GROQ_MODEL=openai/gpt-oss-20b` (or local `llama3.2:latest`). Prioritizes ultra-low latency (sub-400ms) and minimal token consumption against rate-limit quotas.
* **Recipe Ingestion & Normalization**: Bound to `VITE_GROQ_REFINER_MODEL=openai/gpt-oss-120b`. Runs once when a recipe is selected; the ~5-second execution time is completely natural for a recipe hydration step and transparent to the user.

### Implementation & Environment Configuration
* **Environment Separation**:
  * `VITE_GROQ_MODEL`: Controls conversational dialogue acts, chit-chat, and culinary RAG response synthesis.
  * `VITE_GROQ_REFINER_MODEL`: Controls recipe normalization, ingredient reconciliation, and TTS step cleaning.
* **Zero Runtime Overhead**:
  * [`src/llm.ts`](../src/llm.ts) exports `ACTIVE_LLM_MODEL` and `ACTIVE_REFINER_MODEL`, defaulting to their respective constants with safe fallback to local Ollama if offline.
  * [`src/recipes/refiner.ts`](../src/recipes/refiner.ts) routes directly to `ACTIVE_REFINER_MODEL`.





