import { describe, expect, it, vi } from 'vitest';
import { AzurePushStreamAdapter } from '../azure-push-stream';

// mock speechstate helper
vi.mock('speechstate', () => {
  return {
    createPushStreamAudioConfig: vi.fn(() => ({
      pushStream: {
        write: vi.fn(),
        close: vi.fn(),
      },
      audioConfig: {
        privAudioConfig: 'mock-audio-config',
      },
    })),
  };
});

describe('AzurePushStreamAdapter', () => {
  it('initializes in idle state and exposes audioConfig', () => {
    const adapter = new AzurePushStreamAdapter();
    expect(adapter.isStreaming()).toBe(false);
    expect(adapter.audioConfig).toBeDefined();
  });

  it('flushes pre-roll buffer immediately upon startStreaming', () => {
    const adapter = new AzurePushStreamAdapter();
    const preRoll = new Int16Array([100, 200, 300, 400]);

    adapter.startStreaming(preRoll);
    expect(adapter.isStreaming()).toBe(true);

    const mockPushStream = (
      adapter as unknown as {
        pushStreamResult: { pushStream: { write: ReturnType<typeof vi.fn> } };
      }
    ).pushStreamResult.pushStream;

    expect(mockPushStream.write).toHaveBeenCalledTimes(1);
  });

  it('pipes live chunks only when in streaming state', () => {
    const adapter = new AzurePushStreamAdapter();
    const mockPushStream = (
      adapter as unknown as {
        pushStreamResult: { pushStream: { write: ReturnType<typeof vi.fn> } };
      }
    ).pushStreamResult.pushStream;

    const chunk = new Int16Array([10, 20, 30]);

    // when idle, chunks are dropped
    adapter.pushChunk(chunk);
    expect(mockPushStream.write).not.toHaveBeenCalled();

    // when streaming, chunks are pushed
    adapter.startStreaming();
    adapter.pushChunk(chunk);
    expect(mockPushStream.write).toHaveBeenCalledTimes(1);

    // after stopping, chunks are dropped again
    adapter.stopStreaming();
    expect(adapter.isStreaming()).toBe(false);
    adapter.pushChunk(chunk);
    expect(mockPushStream.write).toHaveBeenCalledTimes(1);
  });

  it('closes push stream cleanly', () => {
    const adapter = new AzurePushStreamAdapter();
    const mockPushStream = (
      adapter as unknown as {
        pushStreamResult: { pushStream: { close: ReturnType<typeof vi.fn> } };
      }
    ).pushStreamResult.pushStream;

    adapter.close();
    expect(mockPushStream.close).toHaveBeenCalledTimes(1);
  });

  it('renews push stream upon stopStreaming for subsequent speech turns', () => {
    const adapter = new AzurePushStreamAdapter();
    const initialStream = (
      adapter as unknown as {
        pushStreamResult: {
          pushStream: { write: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
        };
      }
    ).pushStreamResult.pushStream;

    adapter.startStreaming();
    adapter.stopStreaming();

    expect(initialStream.close).toHaveBeenCalledTimes(1);

    const renewedStream = (
      adapter as unknown as {
        pushStreamResult: { pushStream: { write: ReturnType<typeof vi.fn> } };
      }
    ).pushStreamResult.pushStream;

    expect(renewedStream).not.toBe(initialStream);

    // new stream can receive chunks when streaming resumes
    const chunk = new Int16Array([1, 2, 3]);
    adapter.startStreaming();
    adapter.pushChunk(chunk);
    expect(renewedStream.write).toHaveBeenCalledTimes(1);
  });
});
