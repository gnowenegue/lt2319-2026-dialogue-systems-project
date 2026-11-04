import { describe, expect, it, vi } from 'vitest';
import { WakeWordEngine } from '../wake-word/wake-word-engine';

describe('WakeWordEngine', () => {
  it('initializes with default configuration values', () => {
    const engine = new WakeWordEngine();
    expect(engine.modelName).toBe('hey_jarvis_v0.1');
    expect(engine.modelsPath).toBe('/models/wake-word');
    expect(engine.threshold).toBe(0.35);
    expect(engine.cooldownMs).toBe(1500);
    expect(engine.getState()).toBe('uninitialized');
  });

  it('accepts custom configuration values', () => {
    const engine = new WakeWordEngine({
      modelName: 'alexa',
      modelsPath: '/custom/models',
      threshold: 0.8,
      cooldownMs: 2000,
    });
    expect(engine.modelName).toBe('alexa');
    expect(engine.modelsPath).toBe('/custom/models');
    expect(engine.threshold).toBe(0.8);
    expect(engine.cooldownMs).toBe(2000);
  });

  it('debounces rapid consecutive triggers within cooldown window', () => {
    const engine = new WakeWordEngine({ cooldownMs: 1000 });
    const triggerSpy = vi.fn();
    engine.onTrigger(triggerSpy);

    // simulate worker posting detection via private handler
    const handleDetection = (
      engine as unknown as { handleDetection: (score: number, model: string) => void }
    ).handleDetection.bind(engine);

    // first trigger passes
    handleDetection(0.9, 'hey_jarvis_v0.1');
    expect(triggerSpy).toHaveBeenCalledTimes(1);
    expect(triggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        modelName: 'hey_jarvis_v0.1',
        score: 0.9,
      }),
    );

    // immediate second trigger is dropped due to cooldown
    handleDetection(0.95, 'hey_jarvis_v0.1');
    expect(triggerSpy).toHaveBeenCalledTimes(1);
  });

  it('stops and resets state cleanly', () => {
    const engine = new WakeWordEngine();
    engine.stop();
    expect(engine.getState()).toBe('stopped');
  });
});
