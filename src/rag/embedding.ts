import { env, type FeatureExtractionPipeline, pipeline } from '@huggingface/transformers';

import { EMBEDDING_MODEL } from './constants';

let isEnvConfigured = false;

// configures local model path and disables remote network fetching for transformers
const ensureTransformersEnv = (): void => {
  if (isEnvConfigured) {
    return;
  }

  if (globalThis.process?.cwd) {
    env.localModelPath = `${globalThis.process.cwd()}/public/models`;
  } else {
    env.localModelPath = '/models';
  }
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  isEnvConfigured = true;
};

// lazy load the embedding pipeline once with retry on rejection
let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

const getExtractor = (): Promise<FeatureExtractionPipeline> => {
  ensureTransformersEnv();

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
export const preloadModel = async (): Promise<void> => {
  await getExtractor();
};

/**
 * computes normalized mean-pooled dense vector embeddings for input query text
 */
export const embedQuery = async (text: string): Promise<number[]> => {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
};
