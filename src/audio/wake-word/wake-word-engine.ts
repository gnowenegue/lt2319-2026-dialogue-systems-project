import {
  DEFAULT_COOLDOWN_MS,
  DEFAULT_DETECTION_THRESHOLD,
  DEFAULT_MODELS_PATH,
  DEFAULT_WAKE_WORD_MODEL,
} from './constants';
import type {
  WakeWordConfig,
  WakeWordDetection,
  WakeWordListener,
  WakeWordState,
  WakeWordWorkerInMessage,
  WakeWordWorkerOutMessage,
} from './types';

/**
 * client-side wake word detector coordinating background openWakeWord ONNX inference.
 * receives continuous 80ms PCM audio chunks from `AudioPipeline` and emits trigger events
 * when target wake word probability surpasses configured threshold.
 */
export class WakeWordEngine {
  private worker: Worker | null = null;
  private state: WakeWordState = 'uninitialized';
  private listeners: Set<WakeWordListener> = new Set();
  private lastTriggerTimestamp = 0;

  public readonly modelName: string;
  public readonly modelsPath: string;
  public readonly threshold: number;
  public readonly cooldownMs: number;

  constructor(config: WakeWordConfig = {}) {
    this.modelName = config.modelName ?? DEFAULT_WAKE_WORD_MODEL;
    this.modelsPath = config.modelsPath ?? DEFAULT_MODELS_PATH;
    this.threshold = config.threshold ?? DEFAULT_DETECTION_THRESHOLD;
    this.cooldownMs = config.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  }

  /**
   * initializes the dedicated Web Worker and loads ONNX models
   */
  async start(): Promise<void> {
    if (this.state === 'ready' || this.state === 'loading') {
      return;
    }

    this.state = 'loading';

    return new Promise((resolve, reject) => {
      try {
        // instantiate worker using Vite native ES module URL resolution
        this.worker = new Worker(new URL('./wake-word-worker.ts', import.meta.url), {
          type: 'module',
        });

        this.worker.onmessage = (event: MessageEvent<WakeWordWorkerOutMessage>) => {
          const msg = event.data;

          if (msg.type === 'READY') {
            this.state = 'ready';
            resolve();
          } else if (msg.type === 'DETECTION') {
            this.handleDetection(msg.score, msg.modelName);
          } else if (msg.type === 'ERROR') {
            console.error('[WakeWordEngine] Worker error:', msg.error);
            if (this.state === 'loading') {
              this.state = 'error';
              reject(new Error(msg.error));
            }
          }
        };

        this.worker.onerror = (err: ErrorEvent) => {
          console.error('[WakeWordEngine] Uncaught worker error:', err);
          this.state = 'error';
          reject(new Error(err.message || 'WakeWord worker initialization failed'));
        };

        const initMsg: WakeWordWorkerInMessage = {
          type: 'INIT',
          modelName: this.modelName,
          modelsPath: this.modelsPath,
          threshold: this.threshold,
        };
        this.worker.postMessage(initMsg);
      } catch (err) {
        this.state = 'error';
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /**
   * feeds a single 16 kHz 1,280-sample Int16 PCM chunk into the wake word worker
   */
  processChunk(chunk: Int16Array): void {
    if (this.state !== 'ready' || !this.worker) {
      return;
    }

    const msg: WakeWordWorkerInMessage = {
      type: 'PROCESS_CHUNK',
      chunk,
    };
    this.worker.postMessage(msg);
  }

  /**
   * subscribes to wake word detection events. returns an unsubscribe function.
   */
  onTrigger(listener: WakeWordListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * current lifecycle state of the wake word engine
   */
  getState(): WakeWordState {
    return this.state;
  }

  /**
   * terminates the Web Worker and resets engine state
   */
  stop(): void {
    if (this.worker) {
      const stopMsg: WakeWordWorkerInMessage = { type: 'STOP' };
      this.worker.postMessage(stopMsg);
      this.worker.terminate();
      this.worker = null;
    }
    this.state = 'stopped';
  }

  private handleDetection(score: number, modelName: string): void {
    const now = Date.now();
    // debounce rapid consecutive triggers during cooldown window
    if (now - this.lastTriggerTimestamp < this.cooldownMs) {
      return;
    }

    this.lastTriggerTimestamp = now;
    const payload: WakeWordDetection = {
      modelName,
      score,
      timestamp: now,
    };

    this.listeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (err) {
        console.error('[WakeWordEngine] Error in trigger listener:', err);
      }
    });
  }
}
