/**
 * configuration options for initializing the wake word detection engine
 */
export interface WakeWordConfig {
  /**
   * base filename of the wake word classifier without `.onnx` extension (defaults to `'hey_chef'`)
   */
  modelName?: string;
  /**
   * root public directory containing static ONNX model files (defaults to `'/models/wake-word'`)
   */
  modelsPath?: string;
  /**
   * minimum probability score $[0.0, 1.0]$ required to fire a trigger (defaults to `0.5`)
   */
  threshold?: number;
  /**
   * minimum duration in milliseconds between triggers to prevent duplicate firings (defaults to `1500ms`)
   */
  cooldownMs?: number;
}

/**
 * payload emitted when a wake word is successfully detected
 */
export interface WakeWordDetection {
  /**
   * name of the classifier model that triggered (e.g. `'hey_chef'`)
   */
  modelName: string;
  /**
   * detection confidence score between 0.0 and 1.0
   */
  score: number;
  /**
   * millisecond epoch timestamp when detection occurred
   */
  timestamp: number;
}

/**
 * callback subscriber invoked upon wake word detection
 */
export type WakeWordListener = (detection: WakeWordDetection) => void;

/**
 * lifecycle state of the background wake word engine
 */
export type WakeWordState = 'uninitialized' | 'loading' | 'ready' | 'stopped' | 'error';

/**
 * messages passed from main thread to the wake word Web Worker
 */
export type WakeWordWorkerInMessage =
  | {
      type: 'INIT';
      modelName: string;
      modelsPath: string;
      threshold: number;
      cooldownMs?: number;
    }
  | {
      type: 'PROCESS_CHUNK';
      chunk: Int16Array;
    }
  | {
      type: 'STOP';
    };

/**
 * messages posted from the wake word Web Worker back to main thread
 */
export type WakeWordWorkerOutMessage =
  | {
      type: 'READY';
    }
  | {
      type: 'DETECTION';
      score: number;
      modelName: string;
    }
  | {
      type: 'ERROR';
      error: string;
    };
