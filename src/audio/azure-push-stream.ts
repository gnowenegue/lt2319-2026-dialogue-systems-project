import { createPushStreamAudioConfig, type PushStreamAudioConfigResult } from 'speechstate';

/**
 * lifecycle state of the Azure push audio stream
 */
export type AzurePushStreamState = 'idle' | 'streaming' | 'closed';

/**
 * bridges `AudioPipeline` and `CircularAudioBuffer` to Azure Speech SDK's `PushAudioInputStream`.
 * enables selectively piping audio to Azure ASR: flushes the 500ms pre-roll history upon trigger
 * and continues streaming live 16 kHz PCM chunks until speech finishes.
 */
export class AzurePushStreamAdapter {
  private readonly pushStreamResult: PushStreamAudioConfigResult;
  private state: AzurePushStreamState = 'idle';

  constructor(sampleRate = 16000) {
    this.pushStreamResult = createPushStreamAudioConfig(sampleRate);
  }

  /**
   * returns the underlying `AudioConfig` required by `speechstate`'s `Settings`
   */
  get audioConfig() {
    return this.pushStreamResult.audioConfig;
  }

  /**
   * begins streaming audio into Azure ASR.
   * immediately flushes pre-roll audio history so the start of speech is not clipped.
   */
  startStreaming(preRoll?: Int16Array): void {
    if (this.state === 'closed') {
      return;
    }

    this.state = 'streaming';

    // flush chronological pre-roll audio history into Azure stream
    if (preRoll && preRoll.length > 0) {
      // create independent buffer slice to avoid sharing mutating memory
      const preRollCopy = new Int16Array(preRoll);
      this.pushStreamResult.pushStream.write(preRollCopy.buffer as ArrayBuffer);
    }
  }

  /**
   * writes a live 16 kHz PCM chunk into Azure stream if actively streaming
   */
  pushChunk(chunk: Int16Array): void {
    if (this.state !== 'streaming') {
      return;
    }

    // write chunk buffer into Azure push stream
    const chunkCopy = new Int16Array(chunk);
    this.pushStreamResult.pushStream.write(chunkCopy.buffer as ArrayBuffer);
  }

  /**
   * pauses streaming audio into Azure ASR while keeping the underlying stream open
   */
  stopStreaming(): void {
    if (this.state === 'streaming') {
      this.state = 'idle';
    }
  }

  /**
   * checks whether the adapter is actively piping audio to Azure
   */
  isStreaming(): boolean {
    return this.state === 'streaming';
  }

  /**
   * permanently closes the push audio stream upon application shutdown
   */
  close(): void {
    if (this.state !== 'closed') {
      this.state = 'closed';
      try {
        this.pushStreamResult.pushStream.close();
      } catch {
        // ignore errors on already-closed stream
      }
    }
  }
}
