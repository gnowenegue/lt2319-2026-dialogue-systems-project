/**
 * default wake word classifier model name
 */
export const DEFAULT_WAKE_WORD_MODEL = 'hey_chef' as const;

/**
 * default static asset directory for wake word ONNX files
 */
export const DEFAULT_MODELS_PATH = '/models/wake-word' as const;

/**
 * default probability threshold required to fire a wake word trigger
 */
export const DEFAULT_DETECTION_THRESHOLD = 0.35 as const;

/**
 * probability score threshold for logging near-miss detections to the browser console
 */
export const SCORE_LOG_THRESHOLD = 0.2 as const;

/**
 * default cooldown interval in milliseconds after a detection to prevent duplicate triggers
 */
export const DEFAULT_COOLDOWN_MS = 1500 as const;

/**
 * number of Mel spectrogram frequency bins produced per time step by `melspectrogram.onnx`
 */
export const MEL_BINS = 32 as const;

/**
 * number of Mel spectrogram time frames emitted per 1,280-sample (80ms) PCM chunk
 */
export const MEL_FRAMES_PER_CHUNK = 5 as const;

/**
 * number of historical Mel frames required by `embedding_model.onnx` (76 frames = 1,216ms audio context)
 */
export const REQUIRED_MEL_FRAMES = 76 as const;

/**
 * feature vector dimension produced by `embedding_model.onnx`
 */
export const EMBEDDING_DIMS = 96 as const;

/**
 * number of audio feature embeddings evaluated by the wake word classifier (16 embeddings = 1,280ms context)
 */
export const REQUIRED_EMBEDDING_FRAMES = 16 as const;
