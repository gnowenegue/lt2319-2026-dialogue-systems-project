import type OpenAI from 'openai';

/**
 * category partition for curated culinary knowledge
 */
export type RagCategory = 'techniques' | 'substitutions';

/**
 * query options configuring category filtering, result limit, and score thresholds
 */
export interface RagQueryOptions {
  readonly category?: RagCategory;
  readonly limit?: number;
  readonly scoreThreshold?: number;
}

/**
 * options for synthesized RAG culinary advice generation
 */
export interface SynthesizeRagOptions {
  readonly client?: OpenAI;
  readonly model?: string;
  readonly recentMessages?: readonly {
    readonly role: 'user' | 'assistant';
    readonly content: string;
  }[];
  /**
   * active recipe and step context to ground situational cooking advice
   */
  readonly stepContext?: string;
  /**
   * maximum number of relevant culinary advice points retrieved
   */
  readonly limit?: number;
}
