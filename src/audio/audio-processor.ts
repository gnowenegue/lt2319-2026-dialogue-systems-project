/**
 * audio worklet processor for slicing microphone audio into 16 kHz PCM chunks.
 * runs in the browser dedicated audio rendering thread, accumulates 32-bit float audio,
 * converts samples to 16-bit signed PCM, and posts configured PCM chunks to the main thread.
 */

interface AudioWorkletProcessorOptions {
  processorOptions?: {
    chunkSize?: number;
  };
}

// browser type declarations required when running in an `AudioWorkletGlobalScope`
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: AudioWorkletProcessorOptions);
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: AudioWorkletProcessorOptions) => AudioWorkletProcessor,
): void;

class PcmChunkProcessor extends AudioWorkletProcessor {
  private targetChunkSize: number;
  private buffer: Float32Array;
  private bufferedSamples = 0;

  constructor(options?: AudioWorkletProcessorOptions) {
    super();
    const chunkSize = options?.processorOptions?.chunkSize;
    if (!chunkSize || chunkSize <= 0) {
      throw new Error('PcmChunkProcessor requires a positive chunkSize in processorOptions');
    }
    this.targetChunkSize = chunkSize;
    this.buffer = new Float32Array(this.targetChunkSize);
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    // grab the first audio channel for mono microphone input
    const channelData = input[0];
    const inputLength = channelData.length;

    let offset = 0;
    while (offset < inputLength) {
      const needed = this.targetChunkSize - this.bufferedSamples;
      const toCopy = Math.min(needed, inputLength - offset);

      this.buffer.set(channelData.subarray(offset, offset + toCopy), this.bufferedSamples);
      this.bufferedSamples += toCopy;
      offset += toCopy;

      // once we gather a full chunk, convert float audio to 16-bit PCM and post
      if (this.bufferedSamples === this.targetChunkSize) {
        const pcm16 = new Int16Array(this.targetChunkSize);
        for (let i = 0; i < this.targetChunkSize; i++) {
          const s = Math.max(-1, Math.min(1, this.buffer[i]));
          // convert float values from [-1.0, 1.0] to signed 16-bit integers [-32768, 32767]
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // post transferable `ArrayBuffer` to main thread without copying memory
        this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
        this.bufferedSamples = 0;
      }
    }

    return true;
  }
}

registerProcessor('pcm-chunk-processor', PcmChunkProcessor);
