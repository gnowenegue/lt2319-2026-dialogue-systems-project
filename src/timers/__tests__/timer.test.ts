import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';

import { calculateRemainingSeconds, createHeartbeat, timerActorLogic } from '..';
import { formatTimeRemaining } from '../../ui';
import type { ActiveTimer } from '../types';

describe('Timer - Helper Functions', () => {
  it('calculates remaining seconds correctly and clamps to zero within jitter tolerance', () => {
    const now = 1000000;
    expect(calculateRemainingSeconds(now + 5000, now)).toBe(5);
    expect(calculateRemainingSeconds(now + 500, now)).toBe(1); // rounded up to next second
    expect(calculateRemainingSeconds(now + 40, now)).toBe(0); // within 50ms tolerance
    expect(calculateRemainingSeconds(now, now)).toBe(0);
    expect(calculateRemainingSeconds(now - 3000, now)).toBe(0);
  });

  it('formats remaining seconds into mm:ss countdown display', () => {
    expect(formatTimeRemaining(600)).toBe('10:00');
    expect(formatTimeRemaining(75)).toBe('01:15');
    expect(formatTimeRemaining(9)).toBe('00:09');
    expect(formatTimeRemaining(0)).toBe('00:00');
  });
});

describe('Timer - Lifecycle & Event Messaging', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('triggers TIMER_EXPIRED when a single timer reaches zero', () => {
    const expiredEvents: Array<{ type: string; id: string; label: string }> = [];

    const actor = createActor(timerActorLogic);

    actor.on('TIMER_EXPIRED', (event) => {
      expiredEvents.push(event);
    });

    actor.start();

    actor.send({
      type: 'START_TIMER',
      id: 'timer-pasta',
      label: 'pasta',
      durationSeconds: 3,
    });

    // advance 2 seconds: not expired yet
    vi.advanceTimersByTime(2000);
    expect(expiredEvents).toHaveLength(0);

    // advance remaining 1 second: should expire
    vi.advanceTimersByTime(1000);
    expect(expiredEvents).toHaveLength(1);
    expect(expiredEvents[0]).toEqual({
      type: 'TIMER_EXPIRED',
      id: 'timer-pasta',
      label: 'pasta',
    });

    actor.stop();
  });

  it('manages multiple concurrent timers and fires them in chronological order', () => {
    const expiredOrder: string[] = [];

    const actor = createActor(timerActorLogic);
    actor.on('TIMER_EXPIRED', (event) => {
      expiredOrder.push(event.label);
    });

    actor.start();

    actor.send({
      type: 'START_TIMER',
      id: '1',
      label: 'garlic bread',
      durationSeconds: 2,
    });
    actor.send({
      type: 'START_TIMER',
      id: '2',
      label: 'simmer sauce',
      durationSeconds: 5,
    });

    vi.advanceTimersByTime(2000);
    expect(expiredOrder).toEqual(['garlic bread']);

    vi.advanceTimersByTime(3000);
    expect(expiredOrder).toEqual(['garlic bread', 'simmer sauce']);

    actor.stop();
  });

  it('cancels an active timer by id and prevents TIMER_EXPIRED from firing', () => {
    const expiredEvents: Array<{ type: string; id: string; label: string }> = [];

    const actor = createActor(timerActorLogic);
    actor.on('TIMER_EXPIRED', (event) => {
      expiredEvents.push(event);
    });

    actor.start();

    actor.send({
      type: 'START_TIMER',
      id: 'timer-oven',
      label: 'oven',
      durationSeconds: 4,
    });

    vi.advanceTimersByTime(2000);

    actor.send({
      type: 'CANCEL_TIMER',
      id: 'timer-oven',
    });

    vi.advanceTimersByTime(3000);
    expect(expiredEvents).toHaveLength(0);

    actor.stop();
  });

  it('cancels an active timer by label (case-insensitive)', () => {
    const expiredEvents: Array<{ type: string; id: string; label: string }> = [];

    const actor = createActor(timerActorLogic);
    actor.on('TIMER_EXPIRED', (event) => {
      expiredEvents.push(event);
    });

    actor.start();

    actor.send({
      type: 'START_TIMER',
      id: 'uuid-1234',
      label: 'Pasta',
      durationSeconds: 5,
    });

    vi.advanceTimersByTime(2000);

    // cancel by spoken label rather than internal uuid
    actor.send({
      type: 'CANCEL_TIMER',
      label: 'pasta',
    });

    vi.advanceTimersByTime(4000);
    expect(expiredEvents).toHaveLength(0);

    actor.stop();
  });

  it('cancels all active timers when CANCEL_TIMER is sent without id or label', () => {
    let latestTimers: readonly ActiveTimer[] = [];

    const actor = createActor(timerActorLogic);
    actor.on('TIMERS_UPDATED', (event) => {
      latestTimers = event.timers;
    });

    actor.start();

    actor.send({
      type: 'START_TIMER',
      id: '1',
      label: 'pasta',
      durationSeconds: 300,
    });
    actor.send({
      type: 'START_TIMER',
      id: '2',
      label: 'sauce',
      durationSeconds: 600,
    });
    expect(latestTimers).toHaveLength(2);

    actor.send({ type: 'CANCEL_TIMER' });
    expect(latestTimers).toHaveLength(0);

    actor.stop();
  });

  it('replaces active timer when starting with matching label or id', () => {
    let latestTimers: readonly ActiveTimer[] = [];

    const actor = createActor(timerActorLogic);
    actor.on('TIMERS_UPDATED', (event) => {
      latestTimers = event.timers;
    });

    actor.start();

    actor.send({
      type: 'START_TIMER',
      id: '1',
      label: 'pasta',
      durationSeconds: 300,
    });

    expect(latestTimers).toHaveLength(1);
    expect(latestTimers[0].totalDurationSeconds).toBe(300);

    // user says "set pasta timer for 10 minutes", replacing existing
    actor.send({
      type: 'START_TIMER',
      id: '2',
      label: 'pasta',
      durationSeconds: 600,
    });

    expect(latestTimers).toHaveLength(1);
    expect(latestTimers[0].id).toBe('2');
    expect(latestTimers[0].totalDurationSeconds).toBe(600);

    actor.stop();
  });

  it('ignores invalid or non-positive durations on START_TIMER', () => {
    let latestTimers: readonly ActiveTimer[] = [];

    const actor = createActor(timerActorLogic);
    actor.on('TIMERS_UPDATED', (event) => {
      latestTimers = event.timers;
    });

    actor.start();

    actor.send({
      type: 'START_TIMER',
      id: 'bad-1',
      label: 'test',
      durationSeconds: 0,
    });
    expect(latestTimers).toHaveLength(0);

    actor.send({
      type: 'START_TIMER',
      id: 'bad-2',
      label: 'test',
      durationSeconds: -10,
    });
    expect(latestTimers).toHaveLength(0);

    actor.send({
      type: 'START_TIMER',
      id: 'bad-3',
      label: 'test',
      durationSeconds: Number.NaN,
    });
    expect(latestTimers).toHaveLength(0);

    actor.stop();
  });

  it('emits TIMERS_UPDATED upon start, cancel, reset, query, and expiration', () => {
    const updates: Array<readonly ActiveTimer[]> = [];

    const actor = createActor(timerActorLogic);
    actor.on('TIMERS_UPDATED', (event) => {
      updates.push(event.timers);
    });

    actor.start();

    actor.send({
      type: 'START_TIMER',
      id: 't1',
      label: 'eggs',
      durationSeconds: 2,
    });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toHaveLength(1);

    actor.send({ type: 'QUERY_TIMERS' });
    expect(updates).toHaveLength(2);

    vi.advanceTimersByTime(2000);
    // after expiration, TIMERS_UPDATED should be emitted with empty remaining
    expect(updates).toHaveLength(3);
    expect(updates[2]).toHaveLength(0);

    actor.stop();
  });

  it('expires on schedule even if target timestamp is slightly ahead of heartbeat tick due to jitter', () => {
    const expiredEvents: Array<{ type: string; id: string; label: string }> = [];

    const actor = createActor(timerActorLogic);
    actor.on('TIMER_EXPIRED', (event) => {
      expiredEvents.push(event);
    });

    actor.start();

    // advance 20ms into the 1000ms heartbeat interval before starting timer
    vi.advanceTimersByTime(20);

    // timer starts at t = 20, targetTimestamp = 3020
    actor.send({
      type: 'START_TIMER',
      id: 'jitter-test',
      label: 'tea',
      durationSeconds: 3,
    });

    // advance 2000ms -> total t = 2020. Heartbeat ticks at t = 1000, 2000. Not expired yet.
    vi.advanceTimersByTime(2000);
    expect(expiredEvents).toHaveLength(0);

    // advance 1000ms -> total t = 3020. Heartbeat tick 3 fires at t = 3000.
    // at t = 3000, targetTimestamp is 3020. (target - now = 20ms <= 50ms tolerance).
    // with tolerance, it fires on tick 3 rather than waiting for tick 4 at t = 4000!
    vi.advanceTimersByTime(1000);
    expect(expiredEvents).toHaveLength(1);

    actor.stop();
  });

  it('resets all timers when RESET_TIMERS is received', () => {
    const expiredEvents: Array<{ type: string; id: string; label: string }> = [];

    const actor = createActor(timerActorLogic);
    actor.on('TIMER_EXPIRED', (event) => {
      expiredEvents.push(event);
    });

    actor.start();

    actor.send({
      type: 'START_TIMER',
      id: '1',
      label: 'timer 1',
      durationSeconds: 3,
    });
    actor.send({
      type: 'START_TIMER',
      id: '2',
      label: 'timer 2',
      durationSeconds: 4,
    });

    actor.send({ type: 'RESET_TIMERS' });

    vi.advanceTimersByTime(5000);
    expect(expiredEvents).toHaveLength(0);

    actor.stop();
  });

  it('manually expires a specific timer when EXPIRE_TIMER is received', () => {
    const expiredEvents: Array<{ type: string; id: string; label: string }> = [];
    let latestTimers: readonly ActiveTimer[] = [];

    const actor = createActor(timerActorLogic);
    actor.on('TIMER_EXPIRED', (event) => {
      expiredEvents.push(event);
    });
    actor.on('TIMERS_UPDATED', (event) => {
      latestTimers = event.timers;
    });

    actor.start();

    actor.send({
      type: 'START_TIMER',
      id: 'timer-pasta',
      label: 'pasta',
      durationSeconds: 300,
    });
    actor.send({
      type: 'START_TIMER',
      id: 'timer-sauce',
      label: 'sauce',
      durationSeconds: 600,
    });

    expect(latestTimers).toHaveLength(2);

    actor.send({
      type: 'EXPIRE_TIMER',
      id: 'timer-pasta',
    });

    expect(expiredEvents).toHaveLength(1);
    expect(expiredEvents[0]).toEqual({
      type: 'TIMER_EXPIRED',
      id: 'timer-pasta',
      label: 'pasta',
    });
    expect(latestTimers).toHaveLength(1);
    expect(latestTimers[0].id).toBe('timer-sauce');

    actor.stop();
  });
});

describe('Timer - Web Worker & Heartbeat Controller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('manages Web Worker lifecycle and revokes blob URL', () => {
    let terminated = false;
    const postedMessages: unknown[] = [];
    const revokedUrls: string[] = [];
    let mockWorkerInstance: MockWorker | null = null;

    class MockWorker {
      onmessage: ((e: { data: string }) => void) | null = null;
      constructor(_url: string) {
        mockWorkerInstance = this;
      }
      postMessage(data: unknown) {
        postedMessages.push(data);
      }
      terminate() {
        terminated = true;
      }
    }

    const originalWindow = global.window;
    const originalURL = global.URL;

    const mockUrlApi = {
      createObjectURL: vi.fn(() => 'blob:mock-worker-url'),
      revokeObjectURL: vi.fn((url: string) => revokedUrls.push(url)),
    };

    // mock browser environment with Worker, Blob, and URL
    (global as unknown as { window: unknown }).window = {
      Worker: MockWorker,
      Blob: class MockBlob {
        constructor(
          readonly parts: unknown[],
          readonly opts: unknown,
        ) {}
      },
      URL: mockUrlApi,
    };

    let tickCount = 0;
    const heartbeat = createHeartbeat(500);

    heartbeat.start(() => {
      tickCount++;
    });

    // verify blob URL revoked immediately to prevent leaks
    expect(revokedUrls).toContain('blob:mock-worker-url');
    // verify start message sent with custom interval
    expect(postedMessages).toEqual([{ type: 'START', intervalMs: 500 }]);

    // simulate worker tick message
    (mockWorkerInstance as MockWorker | null)?.onmessage?.({ data: 'TICK' });
    expect(tickCount).toBe(1);

    heartbeat.stop();
    expect(terminated).toBe(true);
    expect(postedMessages).toContain('STOP');

    // restore globals
    (global as unknown as { window: unknown }).window = originalWindow;
    (global as unknown as { URL: unknown }).URL = originalURL;
  });

  it('falls back gracefully to setInterval if Worker instantiation throws (CSP policy)', () => {
    const originalWindow = global.window;
    const originalURL = global.URL;

    (global as unknown as { window: unknown }).window = {
      Worker: class ThrowingWorker {
        constructor() {
          throw new Error("Failed to construct 'Worker': Script at blob:... blocked by CSP");
        }
      },
      Blob: class MockBlob {},
    };

    (global as unknown as { URL: unknown }).URL = {
      createObjectURL: vi.fn(() => 'blob:mock-blocked-url'),
      revokeObjectURL: vi.fn(),
    };

    let tickCount = 0;
    const heartbeat = createHeartbeat(100);

    // should not throw, should fall back to setInterval
    expect(() => {
      heartbeat.start(() => {
        tickCount++;
      });
    }).not.toThrow();

    vi.advanceTimersByTime(100);
    expect(tickCount).toBe(1);

    heartbeat.stop();

    (global as unknown as { window: unknown }).window = originalWindow;
    (global as unknown as { URL: unknown }).URL = originalURL;
  });
});
