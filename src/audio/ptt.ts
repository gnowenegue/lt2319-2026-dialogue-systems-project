/**
 * callback subscriber invoked when Push-To-Talk (PTT) is triggered
 */
export type PttTriggerListener = () => void;

/**
 * keyboard Push-To-Talk (PTT) controller enabling Spacebar tap/toggle to activate listening mode.
 * automatically ignores spacebar presses when typing inside text inputs, textareas, or content-editable elements.
 */
export class PushToTalkController {
  private active = false;
  private listeners: Set<PttTriggerListener> = new Set();
  private keydownHandler: ((event: KeyboardEvent) => void) | null = null;
  private target: EventTarget | null;

  constructor(target?: EventTarget | null) {
    this.target =
      target !== undefined
        ? target
        : typeof window !== 'undefined' && typeof window.addEventListener === 'function'
          ? window
          : null;

    this.keydownHandler = (event: KeyboardEvent) => {
      if (!this.active || event.code !== 'Space') {
        return;
      }

      // avoid triggering PTT when user is typing into text fields
      const targetEl = event.target as HTMLElement | null;
      if (
        targetEl &&
        (targetEl.tagName === 'INPUT' ||
          targetEl.tagName === 'TEXTAREA' ||
          targetEl.isContentEditable)
      ) {
        return;
      }

      // prevent default page scrolling on Spacebar press
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }

      // notify trigger listeners
      this.listeners.forEach((listener) => {
        try {
          listener();
        } catch (err) {
          console.error('[PushToTalk] Error in PTT listener:', err);
        }
      });
    };
  }

  /**
   * activates Spacebar key listening
   */
  enable(): void {
    if (this.active || !this.keydownHandler || !this.target) {
      return;
    }
    this.active = true;
    this.target.addEventListener('keydown', this.keydownHandler as EventListener);
  }

  /**
   * deactivates Spacebar key listening
   */
  disable(): void {
    if (!this.active || !this.keydownHandler || !this.target) {
      return;
    }
    this.active = false;
    this.target.removeEventListener('keydown', this.keydownHandler as EventListener);
  }

  /**
   * subscribes to PTT trigger events. returns an unsubscribe function.
   */
  onTrigger(listener: PttTriggerListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * checks whether keyboard PTT listener is currently enabled
   */
  isEnabled(): boolean {
    return this.active;
  }
}
