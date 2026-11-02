import { fromCallback } from 'xstate';

import { TIMER_JITTER_TOLERANCE_MS } from './constants';
import { createHeartbeat } from './helpers';
import type { ActiveTimer, TimerActorEmittedEvent, TimerActorInputEvent } from './types';

/**
 * XState v5 callback actor logic managing multiple kitchen timers with Web Worker heartbeats
 */
export const timerActorLogic = fromCallback<
  TimerActorInputEvent,
  undefined,
  TimerActorEmittedEvent
>(({ sendBack, receive, emit }) => {
  let activeTimers: readonly ActiveTimer[] = [];
  let isHeartbeatRunning = false;

  const heartbeat = createHeartbeat();

  const syncHeartbeat = () => {
    // dynamically engage background ticking only when active timers exist
    if (activeTimers.length > 0 && !isHeartbeatRunning) {
      heartbeat.start(handleTick);
      isHeartbeatRunning = true;
    } else if (activeTimers.length === 0 && isHeartbeatRunning) {
      heartbeat.stop();
      isHeartbeatRunning = false;
    }
  };

  const notifyTimersUpdated = () => {
    const updateEvent: TimerActorEmittedEvent = {
      type: 'TIMERS_UPDATED',
      timers: activeTimers,
    };
    sendBack(updateEvent);
    emit(updateEvent);
  };

  const handleTick = () => {
    const now = Date.now();

    // filter timers into expired and remaining groups using clock jitter tolerance
    const expired = activeTimers.filter(
      (timer) => timer.targetTimestamp - now <= TIMER_JITTER_TOLERANCE_MS,
    );
    const remaining = activeTimers.filter(
      (timer) => timer.targetTimestamp - now > TIMER_JITTER_TOLERANCE_MS,
    );

    if (expired.length === 0) {
      return;
    }

    activeTimers = remaining;
    syncHeartbeat();

    // notify parent machine and listeners of expired timers and updated state
    expired.forEach((timer) => {
      const expiredEvent: TimerActorEmittedEvent = {
        type: 'TIMER_EXPIRED',
        id: timer.id,
        label: timer.label,
      };
      sendBack(expiredEvent);
      emit(expiredEvent);
    });

    notifyTimersUpdated();
  };

  receive((event) => {
    if (event.type === 'START_TIMER') {
      const duration = Number(event.durationSeconds);
      // ignore invalid or non-positive durations
      if (!Number.isFinite(duration) || duration <= 0) {
        return;
      }

      const trimmedLabel = (event.label || 'timer').trim();
      const newTimer: ActiveTimer = {
        id: event.id,
        label: trimmedLabel,
        targetTimestamp: Date.now() + duration * 1000,
        totalDurationSeconds: duration,
      };

      // replace existing timer with matching `id` or `label`
      activeTimers = [
        ...activeTimers.filter(
          (t) => t.id !== event.id && t.label.toLowerCase() !== trimmedLabel.toLowerCase(),
        ),
        newTimer,
      ];
      syncHeartbeat();
      notifyTimersUpdated();
    } else if (event.type === 'CANCEL_TIMER') {
      if (!event.id && !event.label) {
        // cancel all active timers when no specific identifier is provided
        activeTimers = [];
      } else {
        // filter out matching timer by `id` or `label`
        activeTimers = activeTimers.filter((t) => {
          if (event.id && t.id === event.id) return false;
          if (event.label && t.label.toLowerCase() === event.label.trim().toLowerCase()) {
            return false;
          }
          return true;
        });
      }
      syncHeartbeat();
      notifyTimersUpdated();
    } else if (event.type === 'RESET_TIMERS') {
      activeTimers = [];
      syncHeartbeat();
      notifyTimersUpdated();
    } else if (event.type === 'QUERY_TIMERS') {
      notifyTimersUpdated();
    }
  });

  return () => {
    heartbeat.stop();
    isHeartbeatRunning = false;
    activeTimers = [];
  };
});
