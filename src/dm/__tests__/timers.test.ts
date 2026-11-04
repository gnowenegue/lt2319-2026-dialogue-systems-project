import { describe, expect, it } from 'vitest';
import { buildDebugReport } from '../debug-report';
import { createTestCookingActor } from './test-helpers';

describe('Dialogue Manager - Kitchen Timers Integration', () => {
  it('manages kitchen timers via push synchronization without disturbing active recipe step', async () => {
    const actor = createTestCookingActor();

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    actor.send({ type: 'SKIP_PREP' });

    // cook is currently on step 1 (index 0)
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);

    // cook says: "Set a pasta timer for 8 minutes"
    actor.send({
      type: 'SET_TIMER',
      durationSeconds: 480,
      label: 'pasta',
    });

    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      'Started a 8 minutes timer for pasta.',
    );
    // state must remain at WaitingForStepCommand with step 1 intact
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(0);

    // activeTimers is pushed into context immediately
    expect(actor.getSnapshot().context.activeTimers).toHaveLength(1);
    expect(actor.getSnapshot().context.activeTimers[0].label).toBe('pasta');
    const timerReport = buildDebugReport(actor.getSnapshot());
    expect(timerReport.activeTimers[0].remainingSeconds).toBeGreaterThan(0);

    // cook asks: "How much time is left on my pasta timer?"
    actor.send({
      type: 'CHECK_TIMER',
      label: 'pasta',
    });
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain('The pasta timer has');
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');

    // cook advances step while timer is still running
    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);
    expect(actor.getSnapshot().context.activeTimers).toHaveLength(1);

    // cook cancels pasta timer
    actor.send({
      type: 'CANCEL_TIMER',
      label: 'pasta',
    });
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe('Cancelled the pasta timer.');
    expect(actor.getSnapshot().context.activeTimers).toHaveLength(0);
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);

    // background timer expiration event arrives proactively
    actor.send({
      type: 'TIMER_EXPIRED',
      id: 'timer-sauce',
      label: 'sauce',
    });
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      "Time's up! Your sauce timer is done.",
    );
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);

    actor.stop();
  });
});
