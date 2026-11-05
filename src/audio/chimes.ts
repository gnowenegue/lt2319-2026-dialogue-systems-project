/**
 * synthesized audio earcons (chimes) for voice turn-taking and standby transitions
 */

let chimeAudioContext: AudioContext | null = null;

const getChimeAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  if (!chimeAudioContext || chimeAudioContext.state === 'closed') {
    chimeAudioContext = new AudioCtx();
  }
  if (chimeAudioContext.state === 'suspended') {
    chimeAudioContext.resume().catch(() => {});
  }
  return chimeAudioContext;
};

/**
 * plays a gentle two-tone frequency sequence with exponential decay
 */
const playToneSequence = (
  frequencies: readonly [number, number],
  toneDurationSeconds: number,
  peakGain = 0.05,
): void => {
  try {
    const ctx = getChimeAudioContext();
    if (!ctx || typeof ctx.createOscillator !== 'function') return;

    const now = ctx.currentTime;
    const totalDuration = toneDurationSeconds * frequencies.length;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequencies[0], now);
    osc.frequency.setValueAtTime(frequencies[1], now + toneDurationSeconds);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + totalDuration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + totalDuration + 0.05);
  } catch (err) {
    // suppress audio errors if device audio output is unavailable
    console.debug('[CookMate] Audio chime playback skipped:', err);
  }
};

/**
 * resets cached AudioContext for testing isolation
 */
export const resetChimeAudioContextForTesting = (): void => {
  chimeAudioContext = null;
};

/**
 * plays a descending two-tone chime indicating microphone standby (587 Hz -> 440 Hz)
 */
export const playSleepChime = (): void => {
  playToneSequence([587.33, 440.0], 0.14, 0.18);
};

/**
 * plays an ascending two-tone chime confirming wake word or push-to-talk activation (440 Hz -> 659 Hz)
 */
export const playWakeChime = (): void => {
  playToneSequence([440.0, 659.25], 0.12, 0.18);
};
