import { DEFAULT_PRE_ROLL_CAPACITY } from './constants';

/**
 * `CircularAudioBuffer` (ring buffer) for rolling audio history.
 * keeps a rolling window of recent PCM audio samples in memory (e.g. 500ms pre-roll).
 * optimized for 16 kHz 16-bit mono PCM (`Int16Array`).
 * when the buffer fills up, new samples overwrite the oldest ones in a continuous loop.
 * call `getBuffer()` at any point to retrieve stored audio in chronological order (oldest to newest).
 */
export class CircularAudioBuffer {
  private buffer: Int16Array;
  private head = 0; // index in the array where the next sample will be written
  private count = 0; // total number of valid audio samples currently stored in the buffer

  /**
   * @param capacity maximum number of samples to hold (defaults to `DEFAULT_PRE_ROLL_CAPACITY`).
   */
  constructor(public readonly capacity: number = DEFAULT_PRE_ROLL_CAPACITY) {
    if (capacity <= 0) {
      throw new Error('CircularAudioBuffer capacity must be greater than 0');
    }
    this.buffer = new Int16Array(capacity);
  }

  /**
   * appends an array of PCM samples into the circular buffer.
   * if incoming samples exceed capacity, only the most recent `capacity` samples are kept.
   */
  write(samples: Int16Array): void {
    const len = samples.length;
    if (len === 0) return;

    // if incoming data is larger than entire capacity, keep only the trailing end
    if (len >= this.capacity) {
      const sliceStart = len - this.capacity;
      this.buffer.set(samples.subarray(sliceStart));
      this.head = 0;
      this.count = this.capacity;
      return;
    }

    // normal insertion: check whether chunk fits before the end of the buffer or wraps around
    const spaceAtEnd = this.capacity - this.head;

    if (len <= spaceAtEnd) {
      // chunk fits in remaining space without wrapping around
      this.buffer.set(samples, this.head);
      this.head = (this.head + len) % this.capacity;
    } else {
      // chunk wraps around: copy first part to the end, then wrap remainder to index 0
      this.buffer.set(samples.subarray(0, spaceAtEnd), this.head);
      this.buffer.set(samples.subarray(spaceAtEnd), 0);
      this.head = len - spaceAtEnd;
    }

    this.count = Math.min(this.capacity, this.count + len);
  }

  /**
   * returns a copy of stored audio samples in chronological order (oldest to newest)
   */
  getBuffer(): Int16Array {
    if (this.count === 0) {
      return new Int16Array(0);
    }

    const output = new Int16Array(this.count);

    if (this.count < this.capacity) {
      // buffer has not wrapped yet; samples start at index 0 up to `head`
      output.set(this.buffer.subarray(0, this.count));
    } else {
      // buffer is full; oldest sample is at `this.head`
      const tailLength = this.capacity - this.head;
      output.set(this.buffer.subarray(this.head), 0);
      if (this.head > 0) {
        output.set(this.buffer.subarray(0, this.head), tailLength);
      }
    }

    return output;
  }

  /**
   * current number of valid samples stored in the buffer
   */
  get size(): number {
    return this.count;
  }

  /**
   * clears all stored samples and resets buffer pointers
   */
  clear(): void {
    this.head = 0;
    this.count = 0;
    this.buffer.fill(0);
  }
}
