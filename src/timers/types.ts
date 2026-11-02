/**
 * active kitchen timer tracked with absolute deadline
 */
export interface ActiveTimer {
  readonly id: string;
  readonly label: string;
  readonly targetTimestamp: number;
  readonly totalDurationSeconds: number;
}

/**
 * input commands accepted by the timer callback actor
 */
export type TimerActorInputEvent =
  | { type: 'START_TIMER'; id: string; label: string; durationSeconds: number }
  | { type: 'CANCEL_TIMER'; id?: string; label?: string }
  | { type: 'RESET_TIMERS' }
  | { type: 'QUERY_TIMERS' };

/**
 * events emitted by the timer callback actor to its parent or observers
 */
export type TimerActorEmittedEvent =
  | {
      type: 'TIMER_EXPIRED';
      id: string;
      label: string;
    }
  | {
      type: 'TIMERS_UPDATED';
      timers: readonly ActiveTimer[];
    };

/**
 * controller interface managing the background ticking heartbeat
 */
export interface HeartbeatController {
  start: (onTick: () => void) => void;
  stop: () => void;
}
