export type RagCategory = 'techniques' | 'substitutions';

export interface RagQueryOptions {
  category?: RagCategory;
  limit?: number;
  scoreThreshold?: number;
}
