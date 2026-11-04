/**
 * target Qdrant vector collection name storing culinary reference knowledge
 */
export const CULINARY_COLLECTION = 'culinary_knowledge' as const;

/**
 * local ONNX embedding model identifier for client-side vector inference
 */
export const EMBEDDING_MODEL = 'bge-small-en-v1.5' as const;

/**
 * output vector embedding dimensions produced by the BAAI/bge-small model
 */
export const EMBEDDING_DIMENSIONS = 384 as const;

/**
 * minimum cosine similarity score threshold for relevant RAG chunks
 */
export const DEFAULT_SCORE_THRESHOLD = 0.6 as const;

/**
 * default number of relevant culinary advice points retrieved per search
 */
export const DEFAULT_SEARCH_LIMIT = 3 as const;

/**
 * default REST port for local Qdrant vector database instance
 */
export const DEFAULT_QDRANT_PORT = 6333 as const;

/**
 * default local host URL for Qdrant service
 */
export const DEFAULT_QDRANT_URL = 'http://localhost' as const;

/**
 * default fallback message returned when an empty culinary query is submitted
 */
export const EMPTY_QUERY_FALLBACK = 'Please provide a culinary question.' as const;

/**
 * sampling temperature for LLM RAG spoken advice synthesis
 */
export const RAG_TEMPERATURE = 0.2 as const;
