import { afterEach, describe, expect, it, vi } from 'vitest';
import { playSleepChime, playWakeChime, resetChimeAudioContextForTesting } from '../chimes';

describe('Audio Chimes (Earcons)', () => {
  const originalAudioContext = window.AudioContext;

  afterEach(() => {
    window.AudioContext = originalAudioContext;
    resetChimeAudioContextForTesting();
    vi.restoreAllMocks();
  });

  it('runs safely and does not throw when AudioContext is unavailable', () => {
    // @ts-expect-error intentionally testing environment without AudioContext
    window.AudioContext = undefined;
    expect(() => playSleepChime()).not.toThrow();
    expect(() => playWakeChime()).not.toThrow();
  });

  it('configures oscillator frequencies and gain ramps for sleep chime', () => {
    const mockOscillator = {
      type: '',
      frequency: {
        setValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    const mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };

    const mockAudioContextInstance = {
      state: 'running',
      currentTime: 10,
      destination: {},
      createOscillator: vi.fn(() => mockOscillator),
      createGain: vi.fn(() => mockGain),
      resume: vi.fn(),
    };

    window.AudioContext = vi.fn().mockImplementation(function (this: unknown) {
      return mockAudioContextInstance;
    }) as unknown as typeof window.AudioContext;

    playSleepChime();

    expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(587.33, 10);
    expect(mockOscillator.start).toHaveBeenCalled();
    expect(mockGain.gain.exponentialRampToValueAtTime).toHaveBeenCalled();
  });

  it('configures oscillator frequencies for wake chime', () => {
    const mockOscillator = {
      type: '',
      frequency: {
        setValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    const mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };

    const mockAudioContextInstance = {
      state: 'running',
      currentTime: 20,
      destination: {},
      createOscillator: vi.fn(() => mockOscillator),
      createGain: vi.fn(() => mockGain),
      resume: vi.fn(),
    };

    window.AudioContext = vi.fn().mockImplementation(function (this: unknown) {
      return mockAudioContextInstance;
    }) as unknown as typeof window.AudioContext;

    playWakeChime();

    expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(440.0, 20);
    expect(mockOscillator.start).toHaveBeenCalled();
  });
});
