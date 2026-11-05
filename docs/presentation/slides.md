---
marp: true
theme: gaia
_class: lead
paginate: true
html: true
style: |
  :root {
    /* Core Content Colors */
    --color-header: #64748b;      /* Muted steel slate for topic breadcrumbs */
    --color-heading: #1d4ed8;     /* Royal tech blue for H2 slide titles */
    --color-body: #334155;        /* Neutral dark slate for normal body text */
    --color-bold: #c2410c;        /* Warm terracotta for bold emphasis */

    /* Card Accent Colors (No clash with H2 blue) */
    --color-card-1: #7c3aed;      /* Deep purple / violet */
    --color-card-2: #c2410c;      /* Warm terracotta */
    --color-card-3: #d97706;      /* Warm amber / ochre */
    --color-card-4: #0d9488;      /* Deep teal */

    /* Canvas & Surface */
    --color-bg-main: #fafaf9;     /* Warm stone slide background */
    --color-bg-card: #ffffff;     /* Crisp white card surface */
    --color-border-subtle: #e2e8f0;/* Clean dividing line */
    --color-card-shadow: rgba(0, 0, 0, 0.05);
    --color-code-bg: #f1f5f9;     /* Light slate code background */

    /* Lead / Title Slide */
    --color-lead-bg-start: #0f172a;
    --color-lead-bg-mid: #1e293b;
    --color-lead-bg-end: #172554;
    --color-lead-text: #f8fafc;
    --color-lead-text-muted: #cbd5e1;
    --color-lead-title: #38bdf8;
    --color-lead-subtitle: #fed7aa;

    /* Dialogue Speakers */
    --color-speaker-user: #c2410c;        /* Warm terracotta for User (avoids clash with blue tags) */
    --color-speaker-cookmate: #0d9488;    /* Deep teal for CookMate */
  }

  section {
    background-color: var(--color-bg-main);
    color: var(--color-body);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    padding: 65px;
    font-size: 20px;
    justify-content: flex-start;
  }

  header {
    position: absolute;
    top: 22px;
    left: 65px;
    right: 65px;
    height: auto;
    line-height: normal;
    padding: 0;
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--color-header);
    text-align: left;
  }

  section.lead {
    justify-content: center;
    background: linear-gradient(135deg, var(--color-lead-bg-start) 0%, var(--color-lead-bg-mid) 50%, var(--color-lead-bg-end) 100%);
    color: var(--color-lead-text);
  }

  section.center h2 {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 52px;
    border-bottom: none;
    padding-bottom: 0;
    margin: 0;
    text-align: center;
    white-space: nowrap;
  }

  section.lead h1 {
    color: var(--color-lead-title);
    font-size: 54px;
    font-weight: 800;
    margin-bottom: 8px;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  }

  section.lead h3 {
    color: var(--color-lead-subtitle);
    font-size: 28px;
    font-weight: 500;
  }

  section.lead p {
    color: var(--color-lead-text-muted);
  }

  h1 {
    color: var(--color-heading);
    font-size: 32px;
    font-weight: 700;
  }

  h2 {
    color: var(--color-heading);
    font-size: 28px;
    font-weight: 700;
    border-bottom: 3px solid var(--color-border-subtle);
    padding-bottom: 8px;
    margin-top: 0;
    margin-bottom: 18px;
  }

  h3 {
    color: var(--color-heading);
    font-size: 24px;
  }

  strong {
    color: var(--color-bold);
    font-weight: 700;
  }

  ul {
    margin-top: 15px;
    color: var(--color-body);
  }

  section > ul > li {
    margin-bottom: 16px;
    line-height: 1.4;
    color: var(--color-body);
  }

  li > ul {
    margin-top: 6px;
    margin-bottom: 6px;
  }

  li > ul > li {
    margin-bottom: 6px;
    font-size: 19px;
    line-height: 1.35;
    color: var(--color-body);
  }

  li::marker {
    color: var(--color-heading);
  }

  ol {
    margin-top: 25px;
    font-size: 24px;
    color: var(--color-body);
  }

  ol > li {
    margin-bottom: 16px;
    line-height: 1.5;
  }

  ol li::marker {
    color: var(--color-heading);
    font-weight: 700;
  }

  code {
    background: var(--color-code-bg);
    color: var(--color-heading);
    border: 1px solid var(--color-border-subtle);
    border-radius: 6px;
    padding: 2px 8px;
    font-size: 0.88em;
    font-weight: 600;
  }

  section :is(pre, marp-pre) {
    background: var(--color-code-bg);
    border: 1px solid var(--color-border-subtle);
    border-radius: 12px;
    padding: 16px 22px;
    margin: 14px 0 0 0;
    box-shadow: 0 4px 6px -1px var(--color-card-shadow);
    --marp-auto-scaling-white-space: pre-wrap;
    white-space: pre-wrap;
  }

  section :is(pre, marp-pre),
  section :is(pre, marp-pre) code {
    font-size: 20px !important;
    line-height: 1.35 !important;
    color: var(--color-body) !important;
    font-weight: 500 !important;
  }

  section :is(pre, marp-pre) code {
    background: transparent !important;
    border: none !important;
    padding: 0 !important;
  }

  .card-grid > ul {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    list-style: none;
    padding: 0;
    margin: 10px 0 0 0;
  }

  .card-grid > ul > li {
    background: var(--color-bg-card);
    border-radius: 10px;
    padding: 16px 20px;
    box-shadow: 0 4px 6px -1px var(--color-card-shadow);
    list-style: none;
    margin-bottom: 0;
  }

  .card-grid > ul > li:nth-child(1) { border-top: 4px solid var(--color-card-1); }
  .card-grid > ul > li:nth-child(2) { border-top: 4px solid var(--color-card-2); }
  .card-grid > ul > li:nth-child(3) { border-top: 4px solid var(--color-card-3); }
  .card-grid > ul > li:nth-child(4) { border-top: 4px solid var(--color-card-4); }

  .card-grid > ul > li > h3 {
    margin-top: 0;
    margin-bottom: 14px;
  }

  .card-grid > ul > li:nth-child(1) > h3 { color: var(--color-card-1); }
  .card-grid > ul > li:nth-child(2) > h3 { color: var(--color-card-2); }
  .card-grid > ul > li:nth-child(3) > h3 { color: var(--color-card-3); }
  .card-grid > ul > li:nth-child(4) > h3 { color: var(--color-card-4); }

  .card-grid > ul > li > ul {
    margin-top: 0;
    padding-left: 20px;
    font-size: 20px;
  }

  .card-grid > ul > li > ul > li {
    line-height: 1.35;
    list-style: disc;
    color: var(--color-body);
    margin-bottom: 12px;
  }

  .card-grid ~ ul {
    margin-top: 14px;
    margin-bottom: 0;
    font-size: 22px;
  }

  .card-grid ~ ul > li {
    margin-bottom: 0;
  }

  .card-grid-3 > ul {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 20px;
    list-style: none;
    padding: 0;
    margin: 10px 0 0 0;
  }

  .card-grid-3 > ul > li {
    background: var(--color-bg-card);
    border-radius: 10px;
    padding: 16px 20px;
    box-shadow: 0 4px 6px -1px var(--color-card-shadow);
    list-style: none;
    margin-bottom: 0;
  }

  .card-grid-3 > ul > li:nth-child(1) { border-top: 4px solid var(--color-card-1); }
  .card-grid-3 > ul > li:nth-child(2) { border-top: 4px solid var(--color-card-2); }
  .card-grid-3 > ul > li:nth-child(3) { border-top: 4px solid var(--color-card-4); }

  .card-grid-3 > ul > li > h3 {
    margin-top: 0;
    margin-bottom: 12px;
    font-size: 22px;
  }

  .card-grid-3 > ul > li:nth-child(1) > h3 { color: var(--color-card-1); }
  .card-grid-3 > ul > li:nth-child(2) > h3 { color: var(--color-card-2); }
  .card-grid-3 > ul > li:nth-child(3) > h3 { color: var(--color-card-4); }

  .card-grid-3 > ul > li > ul {
    margin-top: 0;
    padding-left: 20px;
    font-size: 19px;
  }

  .card-grid-3 > ul > li > ul > li {
    line-height: 1.35;
    list-style: disc;
    color: var(--color-body);
    margin-bottom: 14px;
  }

  /* Dialogue Speaker Colors (Slide 16) */
  .speaker-user, strong.speaker-user, .user, strong.user {
    color: var(--color-speaker-user);
    font-weight: 700;
  }

  .speaker-cookmate, strong.speaker-cookmate, .cookmate, strong.cookmate {
    color: var(--color-speaker-cookmate);
    font-weight: 700;
  }

  .image-center {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    margin: 10px 0 15px 0;
  }

  .image-center img {
    margin: 0 auto;
    display: block;
  }

  li:has(.image-center) {
    list-style: none;
    margin-left: -2em;
  }

  li:has(.image-center)::marker {
    display: none;
    content: "";
  }

  section > ul > li:has(.image-center) ~ li {
    margin-bottom: 10px;
    font-size: 20px;
  }

  footer {
    font-size: 14px;
    color: var(--color-body);
    opacity: 0.6;
    font-weight: 500;
  }
---

<!-- _class: lead -->
<!-- _header: "" -->

# CookMate

### An Interactive Cooking Copilot

<br />

**LT2319 Dialogue Systems 2 (2026)**

Eugene Wong

---

<!-- _header: "" -->

## Agenda

1) **Problem**
2) **Pre-existing API**
3) **Data Collection & Distillation**
4) **System Architecture & Implementation**
5) **Sample Dialogue**
6) **Future Work**
7) **Live Demo**

---

<!-- header: "1. Problem" -->

## Cooking as a Dialogue Domain

* Cooking is inherently **hands-busy and eyes-busy**
* **Noisy, hostile acoustic environment**:
  * Sizzling pans, running water, and extractor fans compete with voice input
* **Asymmetric pacing & long pauses**:
  * Multi-minute gaps between turns (chopping, simmering) while state must persist
* **Frequent interruptions & contextual inquiries**:
  * **Clarifications**: *"Wait, how many tablespoons of butter?"*
  * **Substitutions**: *"I don't have heavy cream, what can I use?"*
  * **Technique help**: *"What does al dente actually look like?"*
* **Concurrent events**:
  * Independent timers running simultaneously while the user preps other ingredients

---

## Why Pure LLM Chatbots Fail in the Kitchen

<div class="card-grid">

* ### State Amnesia

  * Loses track of completed and remaining steps across long sessions
  * Cannot guarantee strict, step-by-step progress through a recipe

* ### Hallucination Risks

  * Inventing missing measurements or altering cooking steps
  * Presents real culinary failure and safety hazards

* ### Poor Voice Ergonomics

  * Spoken dialogue demands snappy responses
  * LLMs fail on both: high latency and excessive length

* ### No Grounded Action

  * Cannot maintain set-and-forget timers in background tabs
  * Cannot proactively alert you when cooking time is up

</div>

---

<!-- header: "2. Pre-existing API" -->

## TheMealDB: Our Recipe Data Source

* **Open Community Database**: Around 300 recipes from diverse web sources
* **Inconsistent by Nature**:
  * Mixed measurements (cups, grams, spoons, or no units at all)
  * Varying writing styles with typos and informal phrasing
  * Mismatched items (ingredients mentioned in text but omitted from the list)
* **Rigid Structure**: Fixed 20 ingredient slots
* **Unstructured Text**: Instructions saved as one long block rather than separate steps
* **Zero Cooking Knowledge**: No built-in cooking times, techniques, or substitutes

---

## What the Raw Recipe Data Looks Like

```json
{
  "idMeal": "52772",
  "strMeal": "Teriyaki Chicken Casserole",
  "strCategory": "Chicken",
  "strIngredient1": "soy sauce",
  "strMeasure1": "3/4 cup",
  "strIngredient2": "water",
  "strMeasure2": "1/2 cup",
  "...": "...",
  "strIngredient20": "",
  "strMeasure20": "",
  "strInstructions": "Preheat oven to 350° F. Spray pan with cooking spray.
}
```

---

## Recipe Normalization & Refinement

<div class="card-grid">

* ### 1. Code Cleanup

  * Pairs ingredient slots with measurements
  * Splits text blocks into single sentences
  * Fast rule-based fallback without LLM

* ### 2. LLM Refinement

  * Expands abbreviations into spoken words\
  (`tbsp` &rarr; `tablespoon`)
  * Adds forgotten basics to the ingredient list\
  (oil, salt, water)
  * Breaks compound tasks into short, single-action steps (< 25 words)

</div>

<br />

* Refined recipes are cached in browser storage to avoid repeated LLM calls

---

<!-- header: "3. Data Collection & Distillation" -->

## How People Talk While Cooking

* **Simulated Dialogues**:
  * **8 sample sessions, 102 spoken turns** between a home cook and an assistant
  * Studied natural speech patterns to guide system design before writing code

* **Common Speech Patterns Observed**:
  * **Vague words (*"it"*, *"that"*)**: Cooks say *"Can I add it now?"* or *"Would that work?"* without naming the ingredient
  * **Pacing requests**: Asking to pause (*"Hold on"*) or repeat (*"Say that again"*) without advancing the recipe
  * **Mid-step questions**: Asking about missing ingredients, measurements, or cooking techniques while working

---

## What the Assistant Needs to Understand

<div class="card-grid">

* ### Step Navigation

  * `NEXT_STEP`, `PREVIOUS_STEP`
  * `REPEAT_STEP`, `GOTO_STEP`
  * `SKIP_PREP` (skip to cooking)

* ### Cooking Questions

  * `QUERY_INGREDIENT` (amounts)
  * `QUERY_STEP_DETAIL` (step help)
  * `INQUIRE_SUBSTITUTION` (swaps)
  * `INQUIRE_TECHNIQUE` (methods)

* ### Timers

  * `SET_TIMER` (duration & label)
  * `CHECK_TIMER` (time left)
  * `CANCEL_TIMER`

* ### Search & Basic Chat

  * `SEARCH_RECIPE`, `SELECT_RECIPE`
  * `AFFIRM`, `DENY` (yes / no)
  * `GREETING`, `HELP`, `UNKNOWN` (repair)

</div>

* **Key Details Extracted (`Entities`)**: `ingredient`, `stepNumber`, `durationSeconds`, `timerLabel`, `query`

---

<!-- header: "4. System Architecture & Implementation" -->

## Architecture Overview

<div class="card-grid">

* ### Voice Interface

  * **Tech**: `openWakeWord` + `Azure Speech`
  * **Role**: Wake word trigger, ASR and TTS

* ### NLU

  * **Tech**: `Groq` with `openai/gpt-oss-20b`
  * **Role**: Turns spoken words into clear cooking actions and commands

* ### Orchestration & Runtime

  * **Tech**: `SpeechState` + `XState` + `Web Worker`
  * **Role**: Tracks cooking progress step-by-step and runs background timers

* ### Culinary Knowledge & RAG

  * **Tech**: `TheMealDB` + `Qdrant` + `Transformers.js`
  * **Role**: Finds recipes and answers cooking questions with short, spoken advice

</div>

---

## Hands-Free Audio Pipeline

* <div class="image-center">
    <img src="audio-pipeline.svg" width="860" />
  </div>

* **Why local wake word?** Avoids a permanent open mic where random kitchen noise or side conversations trigger CookMate by mistake.
* **Why extend SpeechState?** CookMate was already capturing the mic for `openWakeWord`, so we extended `SpeechState` to accept that existing stream rather than fighting over the microphone.
* **Eyes-free design**: Subtle audio chimes confirm when the assistant wakes and sleeps, so the cook never has to look at the screen.

---

<!-- header: "4. System Architecture & Implementation" -->

## Dialogue Flow & Cooking Policy (XState)

<div class="card-grid">

* ### Paced Ingredient Prep

  * **No info overload**: Chunks ingredient lists into bite-sized pairs (2 at a time)
  * **Explicit pacing**: Waits for *"got them"* before introducing the next batch

* ### Flexible Step Navigation

  * **Sequential flow**: Steps advance one by one with *"next"*
  * **Repetitions & jumps**: Handles *"say that again"* or *"jump to step 4"* safely

* ### Mid-Step Interruptions

  * **Ask anytime**: Inquire about substitutions or measurements mid-step
  * **Instant resume**: Answers the question and returns to the active step

* ### Proactive Timer Prompts

  * **Context-aware**: Detects durations mentioned in step text
  * **Proactive offer**: Asks *"Want me to set a 5-minute timer?"* so the cook doesn't have to calculate

</div>

---

## Concurrent Kitchen Timers

<div class="card-grid">

* ### The "Sleeping Screen" Problem

  * **Kitchen reality**: Cooks step away, screens dim, or tabs get backgrounded
  * **The danger**: Browsers aggressively pause background apps to save battery—risking burnt food
  * **Our fix**: A dedicated background thread (`Web Worker`) keeps counting down reliably

* ### Concurrent Dialogue & Priority Alerts

  * **Parallel tracking**: Runs multiple independent timers while you continue prepping
  * **Non-destructive interrupt**: Timer alarms chime and speak over current dialogue without losing recipe progress
  * **Conversational checks**: Cooks can ask *"how much time left on the pasta?"* at any time

</div>

---

<!-- header: "4. System Architecture & Implementation" -->

## Spoken NLU: Turning Speech into Actions

* Powered by `openai/gpt-oss-20b` on Groq for near-instant spoken understanding

<div class="card-grid">

* ### Structured Cooking Commands

  * **From speech to actions**: Translates natural speech into clear, typed commands
  * **Zero guessing**: Enforces strict JSON schemas for navigation, timers, and questions
  * **Spoken speed**: Responds near-instantly so conversation feels fluid

* ### State-Conditioned Understanding

  * **Resolves vague speech**: Uses current dialogue state to interpret ambiguous words:
    * In *Recipe Search*: *"the second one"* &rarr; `SELECT_RECIPE`
    * In *Ingredient Prep*: *"ready"* &rarr; `NEXT_STEP`
    * In *Cooking Step*: *"how much butter?"* &rarr; `QUERY_INGREDIENT`

</div>

---

<!-- header: "4. System Architecture & Implementation" -->

## Culinary Knowledge & Grounded Answers

<div class="card-grid">

* ### Grounded Knowledge (RAG)

  * **Local embeddings**: Runs `Transformers.js` in-browser to embed user queries
  * **Verified search**: Matches queries against indexed culinary guides in `Qdrant`
  * **Curated categories**: Targeted lookup for ingredient *substitutions* and *cooking techniques*

* ### Spoken Voice Budget (< 25 Words)

  * **Grounded synthesis**: Combines retrieved facts with recipe context using `Groq`
  * **Strict voice limit**: Enforces a strict < 25-word limit so spoken advice never drags on

</div>

---

<!-- header: "5. Sample Dialogue" -->

## End-to-End Dialogue Walkthrough

<div class="card-grid">

* ### Phase 1: Discovery & Paced Prep

  * <strong class="user">User:</strong> *"I want to make Beef Noodles"*\
  &rarr; `[SEARCH_RECIPE]` *(hydrates & refines recipe)*
  * <strong class="cookmate">CookMate:</strong> *"Found Beef Noodles. Ready to gather ingredients?"*
  * <strong class="user">User:</strong> *"Yes, ready"* &rarr; `[AFFIRM]`
  * <strong class="cookmate">CookMate:</strong> *"First, gather 800 grams beef, 2 onions, and 2 carrots."* *(Batch 1 of 2)*
  * <strong class="user">User:</strong> *"Got them"* &rarr; `[AFFIRM]`

* ### Phase 2: Cooking, RAG & Timers

  * <strong class="cookmate">CookMate:</strong> *"Step 2: Heat 2 tablespoons of olive oil in a large pot."*
  * <strong class="user">User:</strong> *"Can I use butter instead?"*\
  &rarr; `[INQUIRE_SUBSTITUTION]`
  * <strong class="cookmate">CookMate:</strong> *"Yes, butter works well, but keep heat medium so it doesn't burn."*
  * <strong class="user">User:</strong> *"What's next?"* &rarr; `[NEXT_STEP]`
  * <strong class="cookmate">CookMate:</strong> *"Step 3: Sear the beef for 5 minutes. Would you like me to start a timer for 5 minutes?"*
  * <strong class="user">User:</strong> *"Yes please."* &rarr; `[SET_TIMER]`

</div>

---

<!-- header: "6. Future Work" -->

## Future Improvements

<div class="card-grid-3">

* ### Barge-In

  * **Current status**: Enabling speech interruption caused erratic behavior between TTS and ASR, so it was disabled to ensure demo stability
  * **Next step**: Troubleshoot and stabilize barge-in so cooks can interrupt or say *"stop"* mid-speech

* ### Dynamic Portion Scaling

  * **Current status**: Recipe APIs provide fixed ingredient quantities for rigid serving sizes
  * **Next step**: Conversational math on the fly (*"cook for 6 people"*, *"how many cups is 200g?"*) without losing step progress

* ### Persistent Dietary Memory

  * **Current status**: Assistant starts fresh every time, forgetting user habits between sessions
  * **Next step**: Remember preferences across visits (*"remember I'm lactose intolerant"*, *"always swap cilantro for parsley"*)

</div>

---

<!-- _class: center -->
<!-- _header: "" -->

## Demo
