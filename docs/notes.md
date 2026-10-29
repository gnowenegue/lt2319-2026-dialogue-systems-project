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



