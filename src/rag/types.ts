import type OpenAI from 'openai';

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
 * options for synthesized RAG culinary advice generation
 */
export interface SynthesizeRagOptions {
  client?: OpenAI;
  model?: string;
  recentMessages?: readonly { role: 'user' | 'assistant'; content: string }[];
  /**
   * active recipe and step context to ground situational cooking advice
   */
  stepContext?: string;
  /**
   * maximum number of relevant culinary advice points retrieved
   */
  limit?: number;
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
