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

