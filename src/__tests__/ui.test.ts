import { describe, expect, it } from 'vitest';
import { updateTriggerIndicator } from '../ui';

describe('UI - Trigger Readiness Indicators', () => {
  it('updates classes and label text according to trigger status', () => {
    const classList = new Set<string>(['indicator-badge', 'status-loading']);
    const labelEl = { textContent: 'Loading...' };
    const badgeEl = {
      classList: {
        add: (cls: string) => classList.add(cls),
        remove: (...cls: string[]) => {
          cls.forEach((c) => {
            classList.delete(c);
          });
        },
        contains: (cls: string) => classList.has(cls),
      },
      querySelector: (selector: string) => (selector === '.indicator-label' ? labelEl : null),
    } as unknown as HTMLElement;

    // transition to ready
    updateTriggerIndicator(badgeEl, 'ready', '"Hey Chef" ready');
    expect(badgeEl.classList.contains('status-ready')).toBe(true);
    expect(badgeEl.classList.contains('status-loading')).toBe(false);
    expect(labelEl.textContent).toBe('"Hey Chef" ready');

    // transition to active
    updateTriggerIndicator(badgeEl, 'active', '"Hey Chef" detected');
    expect(badgeEl.classList.contains('status-active')).toBe(true);
    expect(badgeEl.classList.contains('status-ready')).toBe(false);
    expect(labelEl.textContent).toBe('"Hey Chef" detected');

    // transition to error
    updateTriggerIndicator(badgeEl, 'error', '"Hey Chef" unavailable');
    expect(badgeEl.classList.contains('status-error')).toBe(true);
    expect(badgeEl.classList.contains('status-active')).toBe(false);
    expect(labelEl.textContent).toBe('"Hey Chef" unavailable');
  });

  it('safely handles null elements without throwing', () => {
    expect(() => updateTriggerIndicator(null, 'ready', 'Test')).not.toThrow();
  });
});
