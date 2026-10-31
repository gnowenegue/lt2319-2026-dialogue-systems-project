export type AudioPipelineState = 'uninitialized' | 'starting' | 'running' | 'stopped' | 'error';

export interface AudioPipelineConfig {
  /**
   * target audio sample rate in Hz (defaults to `DEFAULT_SAMPLE_RATE`, 16,000 Hz)
   */
  sampleRate?: number;
  /**
   * number of audio samples per emitted chunk (defaults to `DEFAULT_CHUNK_SIZE`, 1,280 samples)
   */
  chunkSize?: number;
  /**
   * duration of recent audio kept in memory before speech triggers (defaults to `DEFAULT_PRE_ROLL_DURATION_MS`, 500ms)
   */
  preRollDurationMs?: number;
  /**
   * file path or URL to the `AudioWorklet` processor script (defaults to bundled `audio-processor.ts`)
   */
  workletUrl?: string;
}

export type AudioChunkListener = (chunk: Int16Array) => void;
export type AudioStateListener = (state: AudioPipelineState, error?: Error) => void;
