/**
 * category partition for curated culinary knowledge
 */
export type RagCategory = 'techniques' | 'substitutions';

/**
 * query options configuring category filtering, result limit, and score thresholds
 */
export interface RagQueryOptions {
  category?: RagCategory;
  limit?: number;
  scoreThreshold?: number;
}

/**
 * stored point payload schema in the culinary knowledge vector collection
 */
export interface CulinaryKnowledgePayload {
  text: string;
  category: RagCategory;
  title?: string;
  [key: string]: unknown;
}
