import defaultWorkletUrl from './audio-processor.ts?url';
import { CircularAudioBuffer } from './circular-buffer';
import { DEFAULT_CHUNK_SIZE, DEFAULT_PRE_ROLL_DURATION_MS, DEFAULT_SAMPLE_RATE } from './constants';
import type {
  AudioChunkListener,
  AudioPipelineConfig,
  AudioPipelineState,
  AudioStateListener,
} from './types';

/**
 * `AudioPipeline`
 *
 * captures microphone audio via Web Audio API, downsamples to 16 kHz mono PCM,
 * maintains an in-memory 500ms pre-roll circular buffer, and continuously emits
 * 80ms (1,280-sample) PCM frames to subscribers (e.g. openWakeWord, Azure push stream).
 */
export class AudioPipeline {
  private state: AudioPipelineState = 'uninitialized';
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;

  private preRollBuffer: CircularAudioBuffer;
  private chunkListeners: Set<AudioChunkListener> = new Set();
  private stateListeners: Set<AudioStateListener> = new Set();

  public readonly sampleRate: number;
  public readonly chunkSize: number;
  public readonly preRollDurationMs: number;
  public readonly workletUrl: string;

  constructor(config: AudioPipelineConfig = {}) {
    this.sampleRate = config.sampleRate ?? DEFAULT_SAMPLE_RATE;
    this.chunkSize = config.chunkSize ?? DEFAULT_CHUNK_SIZE;
    this.preRollDurationMs = config.preRollDurationMs ?? DEFAULT_PRE_ROLL_DURATION_MS;
    this.workletUrl = config.workletUrl ?? defaultWorkletUrl;

    // calculate sample capacity for pre-roll buffer from configured sample rate and duration
    const preRollCapacity = Math.round((this.sampleRate * this.preRollDurationMs) / 1000);
    this.preRollBuffer = new CircularAudioBuffer(preRollCapacity);
  }

  /**
   * initializes audio hardware and begins streaming PCM chunks
   */
  async start(): Promise<void> {
    if (this.state === 'running' || this.state === 'starting') {
      return;
    }

    this.setState('starting');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia is not supported in this browser environment');
      }

      // request single-channel mic stream with standard echo and noise processing
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: this.sampleRate,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      // create Web Audio context configured at 16 kHz
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx({
        sampleRate: this.sampleRate,
        latencyHint: 'interactive',
      });

      // resume context if suspended by browser autoplay policy
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // load `AudioWorklet` processor module
      await this.audioContext.audioWorklet.addModule(this.workletUrl);

      // connect mic stream -> source -> worklet with configured chunkSize
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-chunk-processor', {
        processorOptions: {
          chunkSize: this.chunkSize,
        },
      });

      // handle `Int16Array` PCM chunks from worklet
      this.workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        const chunk = new Int16Array(event.data);

        // update pre-roll circular buffer
        this.preRollBuffer.write(chunk);

        // notify active subscribers (openWakeWord, Azure push stream)
        this.chunkListeners.forEach((listener) => {
          try {
            listener(chunk);
          } catch (err) {
            console.error('[AudioPipeline] Error in chunk listener:', err);
          }
        });
      };

      this.sourceNode.connect(this.workletNode);
      // do not connect `workletNode` to destination to prevent mic feedback or echo in speakers

      this.setState('running');
    } catch (error) {
      this.stop();
      this.setState('error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * returns the rolling pre-roll audio history (up to 500ms) in chronological order
   */
  getPreRoll(): Int16Array {
    return this.preRollBuffer.getBuffer();
  }

  /**
   * clears the pre-roll buffer (useful immediately after flushing into speech recognition)
   */
  clearPreRoll(): void {
    this.preRollBuffer.clear();
  }

  /**
   * subscribes to live PCM audio chunks (defaults to 80ms chunks of 1,280 samples).
   * returns an unsubscribe function.
   */
  onChunk(listener: AudioChunkListener): () => void {
    this.chunkListeners.add(listener);
    return () => {
      this.chunkListeners.delete(listener);
    };
  }

  /**
   * subscribes to pipeline lifecycle state changes
   */
  onStateChange(listener: AudioStateListener): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  /**
   * current pipeline lifecycle state
   */
  getState(): AudioPipelineState {
    return this.state;
  }

  /**
   * stops mic streaming and tears down the Web Audio graph
   */
  stop(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore disconnect errors during teardown
      }
      this.sourceNode = null;
    }

    if (this.workletNode) {
      try {
        this.workletNode.port.onmessage = null;
        this.workletNode.disconnect();
      } catch {
        // ignore disconnect errors during teardown
      }
      this.workletNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        track.stop();
      });
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.preRollBuffer.clear();
    this.setState('stopped');
  }

  private setState(state: AudioPipelineState, error?: Error): void {
    this.state = state;
    this.stateListeners.forEach((listener) => {
      try {
        listener(state, error);
      } catch (err) {
        console.error('[AudioPipeline] Error in state listener:', err);
      }
    });
  }
}
