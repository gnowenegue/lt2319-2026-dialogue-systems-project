import { describe, expect, it } from 'vitest';
import prompts from '../../prompts';
import { buildDebugReport } from '../debug-report';
import { createTestCookingActor } from './test-helpers';

describe('Dialogue Manager - Voice Lifecycle & Speech Turn-Taking', () => {
  it('progressively escalates on consecutive ASR_NOINPUT events and resumes on CLICK', () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });

    expect(actor.getSnapshot().value).toBe('PromptRecipe');
    expect(actor.getSnapshot().context.noInputCount).toBe(0);

    // first no-input timeout buffers utterance until recognition teardown completes
    actor.send({ type: 'ASR_NOINPUT' });
    expect(actor.getSnapshot().context.noInputCount).toBe(1);
    expect(actor.getSnapshot().context.pendingUtterance).toBe(prompts.noInput[0]);
    actor.send({ type: 'LISTEN_COMPLETE' });
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(prompts.noInput[0]);
    expect(actor.getSnapshot().context.pendingUtterance).toBeNull();

    // second no-input timeout
    actor.send({ type: 'ASR_NOINPUT' });
    expect(actor.getSnapshot().context.noInputCount).toBe(2);
    expect(actor.getSnapshot().context.pendingUtterance).toBe(prompts.noInput[1]);
    actor.send({ type: 'LISTEN_COMPLETE' });
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(prompts.noInput[1]);
    expect(actor.getSnapshot().context.pendingUtterance).toBeNull();

    // third no-input timeout (pauses)
    actor.send({ type: 'ASR_NOINPUT' });
    expect(actor.getSnapshot().context.noInputCount).toBe(3);
    expect(actor.getSnapshot().context.pendingUtterance).toBe(prompts.noInput[2]);
    actor.send({ type: 'LISTEN_COMPLETE' });
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(prompts.noInput[2]);
    expect(actor.getSnapshot().context.pendingUtterance).toBeNull();
    expect(actor.getSnapshot().context.speechStatus).toBe('paused');

    // subsequent no-input timeout when already paused is ignored
    actor.send({ type: 'ASR_NOINPUT' });
    expect(actor.getSnapshot().context.noInputCount).toBe(3);
    expect(actor.getSnapshot().context.pendingUtterance).toBeNull();

    // resumes on click
    actor.send({ type: 'CLICK' });
    expect(actor.getSnapshot().context.noInputCount).toBe(0);
    expect(actor.getSnapshot().context.speechStatus).toBe('listening');
  });

  it('ignores ASR_NOINPUT when in Completed state', async () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // skip prep directly to step 1
    actor.send({ type: 'SKIP_PREP' });
    actor.send({ type: 'NEXT_STEP' }); // step 1 -> 2
    actor.send({ type: 'NEXT_STEP' }); // step 2 -> 3
    actor.send({ type: 'NEXT_STEP' }); // step 3 -> 4
    actor.send({ type: 'NEXT_STEP' }); // step 4 (last step) -> Completed

    expect(actor.getSnapshot().value).toBe('Completed');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      'All steps completed. Enjoy your meal!',
    );

    // silence timeout in Completed state should not trigger no-input prompt
    actor.send({ type: 'ASR_NOINPUT' });
    expect(actor.getSnapshot().context.noInputCount).toBe(0);
    expect(actor.getSnapshot().context.pendingUtterance).toBeNull();
  });

  it('handles ASR_NOINPUT silently in WaitingForPrepConfirmation without reprompting or incrementing noInputCount', async () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    actor.send({ type: 'AFFIRM' });
    expect(actor.getSnapshot().value).toBe('WaitingForPrepConfirmation');
    const spokenBefore = actor.getSnapshot().context.lastSpokenUtterance;

    // simulate silence timeout during ingredient gathering
    actor.send({ type: 'ASR_NOINPUT' });
    expect(actor.getSnapshot().context.noInputCount).toBe(0);
    expect(actor.getSnapshot().context.debugNoInput).toBe(1);
    expect(actor.getSnapshot().context.pendingUtterance).toBeNull();
    expect(actor.getSnapshot().context.silentNoInput).toBe(true);
    expect(buildDebugReport(actor.getSnapshot()).silentNoInput).toBe(true);

    actor.send({ type: 'LISTEN_COMPLETE' });
    expect(actor.getSnapshot().context.silentNoInput).toBe(false);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(spokenBefore);
    expect(actor.getSnapshot().context.speechStatus).toBe('listening');
  });

  it('restarts listening on raw LISTEN_COMPLETE in WaitingForPrepConfirmation even without ASR_NOINPUT', async () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    actor.send({ type: 'AFFIRM' });
    expect(actor.getSnapshot().value).toBe('WaitingForPrepConfirmation');

    // assistant finishes speaking the batch
    actor.send({ type: 'SPEAK_COMPLETE' });
    expect(actor.getSnapshot().context.speechStatus).toBe('listening');

    // browser webkitSpeechRecognition ends naturally on silence without ASR_NOINPUT
    actor.send({ type: 'LISTEN_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('WaitingForPrepConfirmation');
    expect(actor.getSnapshot().context.speechStatus).toBe('listening');

    // user can still confirm batch and advance
    actor.send({ type: 'AFFIRM' });
    expect(actor.getSnapshot().context.prepBatchIndex).toBe(1);
  });

  it('handles ASR_NOINPUT silently in WaitingForStepCommand without reprompting or pausing', async () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    actor.send({ type: 'SKIP_PREP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    const spokenStep = actor.getSnapshot().context.lastSpokenUtterance;

    // simulate multiple consecutive silence timeouts during cooking step execution
    actor.send({ type: 'ASR_NOINPUT' });
    expect(actor.getSnapshot().context.noInputCount).toBe(0);
    expect(actor.getSnapshot().context.debugNoInput).toBe(1);
    expect(actor.getSnapshot().context.pendingUtterance).toBeNull();
    expect(actor.getSnapshot().context.silentNoInput).toBe(true);

    actor.send({ type: 'LISTEN_COMPLETE' });
    expect(actor.getSnapshot().context.silentNoInput).toBe(false);
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(spokenStep);
    expect(actor.getSnapshot().context.speechStatus).toBe('listening');

    // another timeout cycle
    actor.send({ type: 'ASR_NOINPUT' });
    actor.send({ type: 'LISTEN_COMPLETE' });
    expect(actor.getSnapshot().context.noInputCount).toBe(0);
    expect(actor.getSnapshot().context.debugNoInput).toBe(2);
    expect(actor.getSnapshot().context.speechStatus).toBe('listening');

    // user can still advance step after silence
    actor.send({ type: 'NEXT_STEP' });
    expect(actor.getSnapshot().context.currentStepIndex).toBe(1);
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.lastSpokenUtterance).not.toBe(spokenStep);
  });

  it('speaks repair prompt on UNKNOWN utterance without dropping cooking state', () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });

    actor.send({ type: 'UNKNOWN' });
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(prompts.cannotHear);
  });

  it('handles HELP and GREETING globally without losing current state', async () => {
    const actor = createTestCookingActor();

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    expect(actor.getSnapshot().value).toBe('PromptRecipe');

    // ask for help
    actor.send({ type: 'HELP' });
    expect(actor.getSnapshot().value).toBe('PromptRecipe');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain(
      'navigate steps with next or repeat',
    );

    // greeting
    actor.send({ type: 'GREETING' });
    expect(actor.getSnapshot().value).toBe('PromptRecipe');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe('Hi! Ready when you are.');
  });

  it('records barge-in status on internal context while omitting barge-in from debug report', () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });

    actor.send({
      type: 'RECOGNISED',
      value: [{ utterance: 'stop talking', confidence: 0.98 }],
      bargeIn: true,
    });

    const snapshot = actor.getSnapshot();
    const userMsg = snapshot.context.messages.find((m) => m.role === 'user');
    expect(userMsg?.bargeIn).toBe(true);
    expect(snapshot.context.lastBargeIn).toBe(true);

    const report = buildDebugReport(snapshot);
    expect('bargeIn' in (report.latestAsr ?? {})).toBe(false);
    expect(report.messages.some((m) => 'bargeIn' in m)).toBe(false);
  });

  it('does not mark barge-in on internal context when user waits for SPEAK_COMPLETE before speaking', () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });

    // assistant finishes speaking prompt -> speechStatus becomes 'listening'
    actor.send({ type: 'SPEAK_COMPLETE' });

    // user speaks after assistant finishes
    actor.send({
      type: 'RECOGNISED',
      value: [{ utterance: 'make pasta', confidence: 0.95 }],
      bargeIn: true, // even if speechstate mistakenly sends bargeIn: true
    });

    const snapshot = actor.getSnapshot();
    const userMsg = snapshot.context.messages.find((m) => m.role === 'user');
    expect(userMsg?.bargeIn).toBe(false);
    expect(snapshot.context.lastBargeIn).toBe(false);

    const report = buildDebugReport(snapshot);
    expect('bargeIn' in (report.latestAsr ?? {})).toBe(false);
    expect(report.messages.some((m) => 'bargeIn' in m)).toBe(false);
  });

  it('records lastNoInputAt and debugNoInput in context and debug report when ASR_NOINPUT triggers', () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });

    const initialReport = buildDebugReport(actor.getSnapshot());
    expect(initialReport.lastNoInputAt).toBeNull();
    expect(initialReport.debugNoInput).toBe(0);

    actor.send({ type: 'ASR_NOINPUT' });

    const timeoutReport = buildDebugReport(actor.getSnapshot());
    expect(timeoutReport.lastNoInputAt).toBeDefined();
    expect(typeof timeoutReport.lastNoInputAt).toBe('string');
    expect(timeoutReport.debugNoInput).toBe(1);
  });

  it('activates machine and starts listening on WAKE_WORD or PTT_TRIGGER', () => {
    const actor = createTestCookingActor();
    expect(actor.getSnapshot().value).toBe('Idle');

    // WAKE_WORD in Idle advances to Prepare
    actor.send({ type: 'WAKE_WORD', modelName: 'hey_jarvis_v0.1', score: 0.85 });
    expect(actor.getSnapshot().value).toBe('Prepare');

    actor.send({ type: 'ASRTTS_READY' });
    expect(actor.getSnapshot().value).toBe('PromptRecipe');

    // PTT_TRIGGER resets pauses and enters listening mode
    actor.send({ type: 'PTT_TRIGGER' });
    expect(actor.getSnapshot().context.speechStatus).toBe('listening');
  });
});
