/**
 * target audio sample rate in Hz (16 kHz mono)
 */
export const DEFAULT_SAMPLE_RATE = 16000 as const;

/**
 * number of audio samples per emitted chunk (1,280 samples equals 80ms at 16 kHz)
 */
export const DEFAULT_CHUNK_SIZE = 1280 as const;

/**
 * duration of recent audio in milliseconds kept in memory before speech triggers
 */
export const DEFAULT_PRE_ROLL_DURATION_MS = 500 as const;

/**
 * total number of PCM samples stored for 500ms pre-roll at 16 kHz
 */
export const DEFAULT_PRE_ROLL_CAPACITY = 8000 as const;
