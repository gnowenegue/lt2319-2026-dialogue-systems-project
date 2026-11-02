# Cookmate

> A stateful spoken dialogue copilot combining deterministic state management, structured recipe APIs, and retrieval-augmented language models to assist users hands-free during procedural cooking tasks.

Built for the **LT2319 Dialogue Systems** course project at the University of Gothenburg.

---

## Architecture Overview

Cookmate separates conversation state, recipe facts, and general culinary knowledge:

- **Dialogue Management & State**: [SpeechState](https://github.com/speechstate/speechstate) + [XState v5](https://stately.ai/docs/xstate) for deterministic session state, step navigation, and kitchen timers.
- **Natural Language Understanding**: Structured LLM semantic extraction mapping speech utterances to strict dialogue acts.
- **Recipe Data**: [TheMealDB API](https://www.themealdb.com/) for structured ingredients and instructions.
- **Culinary Knowledge RAG**: [Qdrant](https://qdrant.tech/) vector search with section-aware Wikibooks culinary corpus.
- **Audio Pipeline**: Azure Speech SDK (ASR/TTS) with custom push audio streams and Web Audio API.

---

## Getting Started

### Prerequisites

- Node.js >= 24
- `pnpm`
- Docker (for local Qdrant vector database)

### Setup

```bash
# Install dependencies
pnpm install

# Start local Qdrant vector store
docker compose up -d

# Run development server
pnpm dev
```

### Verification & Testing

```bash
# Typecheck & lint check
pnpm verify

# Run unit tests
pnpm test
```
