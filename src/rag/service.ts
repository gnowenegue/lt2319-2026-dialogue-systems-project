import { env, type FeatureExtractionPipeline, pipeline } from '@huggingface/transformers';
import { QdrantClient } from '@qdrant/js-client-rest';

import {
  CULINARY_COLLECTION,
  DEFAULT_QDRANT_PORT,
  DEFAULT_QDRANT_URL,
  DEFAULT_SCORE_THRESHOLD,
  DEFAULT_SEARCH_LIMIT,
  EMBEDDING_MODEL,
} from './constants';
import type { RagCategory, RagQueryOptions } from './types';

// configure offline model directory for `rag-cli` vs browser
if (typeof window === 'undefined' && typeof process !== 'undefined' && process.cwd) {
  env.localModelPath = `${process.cwd()}/public/models`;
} else {
  env.localModelPath = '/models';
}
env.allowRemoteModels = false;

const qdrantUrl = import.meta.env?.VITE_QDRANT_URL || DEFAULT_QDRANT_URL;
const qdrantPort = Number(import.meta.env?.VITE_QDRANT_PORT) || DEFAULT_QDRANT_PORT;

/**
 * shared Qdrant client instance for browser and CLI usage
 */
export const qdrantClient = new QdrantClient({
  url: qdrantUrl,
  port: qdrantPort,
  checkCompatibility: false,
});

// lazy load the embedding pipeline once
let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;
const getExtractor = (): Promise<FeatureExtractionPipeline> => {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', EMBEDDING_MODEL, {
      dtype: 'q8',
    }) as Promise<FeatureExtractionPipeline>;
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

  const texts = points.map((point) => point.payload?.text).filter(Boolean) as string[];

  return texts.length > 0
    ? texts.join('\n\n')
    : `No matching culinary advice found for "${trimmed}".`;
};

export { buildCategoryFilter, embedQuery, preloadModel, queryCulinaryKnowledge };
