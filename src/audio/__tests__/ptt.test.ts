import { describe, expect, it, vi } from 'vitest';
import { PushToTalkController } from '../ptt';

describe('PushToTalkController', () => {
  it('enables and disables keyboard listening', () => {
    const target = new EventTarget();
    const ptt = new PushToTalkController(target);
    expect(ptt.isEnabled()).toBe(false);

    ptt.enable();
    expect(ptt.isEnabled()).toBe(true);

    ptt.disable();
    expect(ptt.isEnabled()).toBe(false);
  });

  it('triggers listener when Spacebar is pressed outside form inputs', () => {
    const target = new EventTarget();
    const ptt = new PushToTalkController(target);
    const triggerSpy = vi.fn();
    ptt.onTrigger(triggerSpy);
    ptt.enable();

    const spaceEvent = new Event('keydown', { cancelable: true });
    Object.defineProperty(spaceEvent, 'code', { value: 'Space' });

    target.dispatchEvent(spaceEvent);
    expect(triggerSpy).toHaveBeenCalledTimes(1);
    expect(spaceEvent.defaultPrevented).toBe(true);
  });

  it('ignores Spacebar press when typing in input or textarea elements', () => {
    const target = new EventTarget();
    const ptt = new PushToTalkController(target);
    const triggerSpy = vi.fn();
    ptt.onTrigger(triggerSpy);
    ptt.enable();

    const inputEl = {
      tagName: 'INPUT',
      isContentEditable: false,
    } as unknown as HTMLElement;

    const eventOnInput = new Event('keydown', { cancelable: true });
    Object.defineProperty(eventOnInput, 'code', { value: 'Space' });
    Object.defineProperty(eventOnInput, 'target', { value: inputEl });

    target.dispatchEvent(eventOnInput);
    expect(triggerSpy).not.toHaveBeenCalled();
  });

  it('unsubscribes listeners correctly', () => {
    const target = new EventTarget();
    const ptt = new PushToTalkController(target);
    const triggerSpy = vi.fn();
    const unsubscribe = ptt.onTrigger(triggerSpy);
    ptt.enable();

    unsubscribe();

    const spaceEvent = new Event('keydown');
    Object.defineProperty(spaceEvent, 'code', { value: 'Space' });

    target.dispatchEvent(spaceEvent);
    expect(triggerSpy).not.toHaveBeenCalled();
  });
});
