import { env, type FeatureExtractionPipeline, pipeline } from '@huggingface/transformers';
import { QdrantClient } from '@qdrant/js-client-rest';

import { getEnv } from '../configs';
import { ACTIVE_LLM_MODEL, openai, recordLlmUsage } from '../llm';
import prompts from '../prompts';
import {
  CULINARY_COLLECTION,
  DEFAULT_QDRANT_PORT,
  DEFAULT_QDRANT_URL,
  DEFAULT_SCORE_THRESHOLD,
  DEFAULT_SEARCH_LIMIT,
  EMBEDDING_MODEL,
  RAG_TEMPERATURE,
} from './constants';
import type { RagCategory, RagQueryOptions, SynthesizeRagOptions } from './types';

// configure offline model directory for `rag-cli` vs browser
if (globalThis.process?.cwd) {
  env.localModelPath = `${globalThis.process.cwd()}/public/models`;
} else {
  env.localModelPath = '/models';
}
env.allowLocalModels = true;
env.allowRemoteModels = false;

const qdrantUrl = getEnv('VITE_QDRANT_URL', DEFAULT_QDRANT_URL);
const qdrantPort = Number(getEnv('VITE_QDRANT_PORT')) || DEFAULT_QDRANT_PORT;

/**
 * shared Qdrant client instance for browser and CLI usage
 */
export const qdrantClient = new QdrantClient({
  url: qdrantUrl,
  port: qdrantPort,
  checkCompatibility: false,
});

// lazy load the embedding pipeline once with retry on rejection
let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;
const getExtractor = (): Promise<FeatureExtractionPipeline> => {
  if (!extractorPromise) {
    extractorPromise = (
      pipeline('feature-extraction', EMBEDDING_MODEL, {
        dtype: 'q8',
      }) as Promise<FeatureExtractionPipeline>
    ).catch((error) => {
      // reset promise to null so subsequent attempts can retry
      extractorPromise = null;
      throw error;
    });
  }
  return extractorPromise;
};

/**
 * pre-warms the embedding pipeline in the background to eliminate cold-start latency
 */
const preloadModel = async (): Promise<void> => {
  await getExtractor();
};

/**
 * computes normalized mean-pooled dense vector embeddings for input query text
 */
const embedQuery = async (text: string): Promise<number[]> => {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
};

/**
 * builds an optional Qdrant payload filter for the requested `category`
 */
const buildCategoryFilter = (category?: RagCategory) => {
  if (!category) {
    return undefined;
  }

  return {
    must: [
      {
        key: 'category',
        match: { value: category },
      },
    ],
  };
};

/**
 * queries the Qdrant `culinary_knowledge` collection for advice
 */
const queryCulinaryKnowledge = async (
  query: string,
  options?: RagQueryOptions,
): Promise<string> => {
  const trimmed = query.trim();
  if (!trimmed) {
    return 'Please provide a culinary question.';
  }

  const vector = await embedQuery(trimmed);

  const searchResults = await qdrantClient.query(CULINARY_COLLECTION, {
    query: vector,
    filter: buildCategoryFilter(options?.category),
    limit: options?.limit ?? DEFAULT_SEARCH_LIMIT,
    score_threshold: options?.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD,
    with_payload: true,
  });

  const points = searchResults.points ?? [];

  // log debug details to the console
  console.debug(`[RAG] "${trimmed}" matched ${points.length} points:`, points);

  const texts = points
    .map((point) => point.payload?.text)
    .filter((text): text is string => typeof text === 'string' && text.length > 0);

  return texts.length > 0
    ? texts.join('\n\n')
    : `No matching culinary advice found for "${trimmed}".`;
};

/**
 * synthesizes concise, spoken culinary advice grounded in retrieved Qdrant knowledge
 */
const synthesizeCulinaryAdvice = async (
  query: string,
  category?: RagCategory,
  options?: SynthesizeRagOptions,
): Promise<string> => {
  const trimmed = query.trim();
  if (!trimmed) {
    return 'Please provide a culinary question.';
  }

  let contextText = '';
  try {
    const searchResult = await queryCulinaryKnowledge(trimmed, {
      category,
      limit: options?.limit ?? DEFAULT_SEARCH_LIMIT,
    });
    if (!searchResult.startsWith('No matching culinary advice found')) {
      contextText = searchResult;
    }
  } catch (error) {
    // fail gracefully when Qdrant is offline or unreachable
    console.warn('[RAG] Retrieval fallback:', error);
  }

  const client = options?.client ?? openai;
  const model = options?.model ?? ACTIVE_LLM_MODEL;

  const historyMessages =
    options?.recentMessages?.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })) ?? [];

  const contextSections = [
    options?.stepContext ? `Current Step: ${options.stepContext}` : '',
    contextText ? `Context:\n${contextText}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: prompts.systemRAG },
      ...historyMessages,
      {
        role: 'user',
        content: contextSections
          ? `${contextSections}\n\nQuestion: ${trimmed}`
          : `Question: ${trimmed}`,
      },
    ],
    temperature: RAG_TEMPERATURE,
  });

  recordLlmUsage('rag-synthesis', model, completion.usage);

  return (
    completion.choices[0]?.message?.content?.trim() ||
    "I don't have advice on that in my culinary guides."
  );
};

export {
  buildCategoryFilter,
  embedQuery,
  preloadModel,
  queryCulinaryKnowledge,
  synthesizeCulinaryAdvice,
};
