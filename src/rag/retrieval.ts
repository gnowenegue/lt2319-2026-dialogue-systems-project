import { QdrantClient } from '@qdrant/js-client-rest';

import { getEnv } from '../env';
import {
  CULINARY_COLLECTION,
  DEFAULT_QDRANT_PORT,
  DEFAULT_QDRANT_URL,
  DEFAULT_SCORE_THRESHOLD,
  DEFAULT_SEARCH_LIMIT,
  EMPTY_QUERY_FALLBACK,
} from './constants';
import { embedQuery } from './embedding';
import type { RagCategory, RagQueryOptions } from './types';

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

/**
 * builds an optional Qdrant payload filter for the requested `category`
 */
export const buildCategoryFilter = (category?: RagCategory) => {
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
export const queryCulinaryKnowledge = async (
  query: string,
  options?: RagQueryOptions,
): Promise<string> => {
  const trimmed = query.trim();
  if (!trimmed) {
    return EMPTY_QUERY_FALLBACK;
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
