import { speechstate } from 'speechstate';
import { describe, expect, it } from 'vitest';
import { createActor, fromPromise, fromTransition, setup } from 'xstate';
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

  it('handles ASR_NOINPUT in WaitingForPrepConfirmation by entering standby and resuming on WAKE_WORD', async () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    actor.send({ type: 'AFFIRM' });
    expect(actor.getSnapshot().value).toBe('WaitingForPrepConfirmation');
    const spokenBefore = actor.getSnapshot().context.lastSpokenUtterance;

    // simulate follow-up window timeout during ingredient gathering
    actor.send({ type: 'ASR_NOINPUT' });
    expect(actor.getSnapshot().context.noInputCount).toBe(0);
    expect(actor.getSnapshot().context.debugNoInput).toBe(1);
    expect(actor.getSnapshot().context.pendingUtterance).toBeNull();
    expect(actor.getSnapshot().context.speechStatus).toBe('idle');
    expect(buildDebugReport(actor.getSnapshot()).speechStatus).toBe('idle');

    // ASR teardown completes; mic stays in standby
    actor.send({ type: 'LISTEN_COMPLETE' });
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(spokenBefore);
    expect(actor.getSnapshot().context.speechStatus).toBe('idle');

    // wake word wakes up the mic
    actor.send({ type: 'WAKE_WORD', modelName: 'hey_chef' });
    expect(actor.getSnapshot().context.speechStatus).toBe('listening');

    // user confirms batch and advances
    actor.send({ type: 'AFFIRM' });
    expect(actor.getSnapshot().context.prepBatchIndex).toBe(1);
  });

  it('handles ASR_NOINPUT in WaitingForStepCommand by entering standby and resuming on PTT_TRIGGER', async () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    actor.send({ type: 'SKIP_PREP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    const spokenStep = actor.getSnapshot().context.lastSpokenUtterance;

    // simulate follow-up window timeout during cooking step execution
    actor.send({ type: 'ASR_NOINPUT' });
    expect(actor.getSnapshot().context.noInputCount).toBe(0);
    expect(actor.getSnapshot().context.debugNoInput).toBe(1);
    expect(actor.getSnapshot().context.pendingUtterance).toBeNull();
    expect(actor.getSnapshot().context.speechStatus).toBe('idle');

    // ASR teardown completes; mic stays in standby
    actor.send({ type: 'LISTEN_COMPLETE' });
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(spokenStep);
    expect(actor.getSnapshot().context.speechStatus).toBe('idle');

    // PTT spacebar wakes up the mic
    actor.send({ type: 'PTT_TRIGGER' });
    expect(actor.getSnapshot().context.speechStatus).toBe('listening');

    // user advances step after waking
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

  it('handles HELP and GREETING contextually without losing current state', async () => {
    const actor = createTestCookingActor();

    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });
    expect(actor.getSnapshot().value).toBe('PromptRecipe');

    // ask for help in PromptRecipe
    actor.send({ type: 'HELP' });
    expect(actor.getSnapshot().value).toBe('PromptRecipe');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(prompts.helpPromptRecipe);

    // greeting in PromptRecipe
    actor.send({ type: 'GREETING' });
    expect(actor.getSnapshot().value).toBe('PromptRecipe');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(prompts.promptRecipe);

    // advance to step execution
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    actor.send({ type: 'SKIP_PREP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');

    // contextual help during active step
    actor.send({ type: 'HELP' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(prompts.helpStep);

    // contextual greeting during active step
    actor.send({ type: 'GREETING' });
    expect(actor.getSnapshot().value).toBe('WaitingForStepCommand');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain("We're on step 1");
    expect(actor.getSnapshot().context.lastSpokenUtterance).toContain("Say 'next step'");
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
    actor.send({ type: 'WAKE_WORD', modelName: 'hey_chef', score: 0.85 });
    expect(actor.getSnapshot().value).toBe('Prepare');

    actor.send({ type: 'ASRTTS_READY' });
    expect(actor.getSnapshot().value).toBe('PromptRecipe');

    // PTT_TRIGGER resets pauses and enters listening mode
    actor.send({ type: 'PTT_TRIGGER' });
    expect(actor.getSnapshot().context.speechStatus).toBe('listening');
  });

  it('does not re-trigger speakLastUtterance on redundant ASRTTS_READY when isSpeechReady is already true', async () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });

    // search recipe and advance to ConfirmRecipe
    actor.send({ type: 'SEARCH_RECIPE', query: 'arrabiata' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(actor.getSnapshot().value).toBe('ConfirmRecipe');

    // affirm recipe -> transitions to AnnouncePrepBatch -> WaitingForPrepConfirmation
    actor.send({ type: 'AFFIRM' });
    expect(actor.getSnapshot().value).toBe('WaitingForPrepConfirmation');
    expect(actor.getSnapshot().context.speechStatus).toBe('speaking');
    expect(actor.getSnapshot().context.isSpeechReady).toBe(true);

    const spstRef = actor.getSnapshot().context.spstRef;
    const sentEvents: unknown[] = [];
    if (spstRef) {
      const originalSend = spstRef.send.bind(spstRef);
      spstRef.send = (event: unknown) => {
        sentEvents.push(event);
        return originalSend(event as never);
      };
    }

    // redundant ASRTTS_READY when already ready must not duplicate speech
    actor.send({ type: 'ASRTTS_READY' });

    expect(sentEvents).toHaveLength(0);
  });

  it('triggers speakLastUtterance on initial ASRTTS_READY when speech readiness was delayed', () => {
    const actor = createTestCookingActor();
    expect(actor.getSnapshot().context.isSpeechReady).toBe(false);

    // proactive timer expiration arrives before speech readiness handshake completes
    actor.send({
      type: 'TIMER_EXPIRED',
      id: 'timer-early',
      label: 'pasta',
    });
    expect(actor.getSnapshot().context.speechStatus).toBe('speaking');

    const spstRef = actor.getSnapshot().context.spstRef;
    const sentEvents: unknown[] = [];
    if (spstRef) {
      const originalSend = spstRef.send.bind(spstRef);
      spstRef.send = (event: unknown) => {
        sentEvents.push(event);
        return originalSend(event as never);
      };
    }

    // pre-warm completes and emits first ASRTTS_READY
    actor.send({ type: 'ASRTTS_READY' });

    expect(actor.getSnapshot().context.isSpeechReady).toBe(true);
    expect(sentEvents).toContainEqual({
      type: 'SPEAK',
      value: {
        utterance: "Time's up! Your pasta timer is done.",
      },
    });
  });

  it('speaks no-input prompt exactly once on LISTEN_COMPLETE and ignores subsequent ASRTTS_READY without duplicating speech', () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });

    const spstRef = actor.getSnapshot().context.spstRef;
    const sentEvents: unknown[] = [];
    if (spstRef) {
      const originalSend = spstRef.send.bind(spstRef);
      spstRef.send = (event: unknown) => {
        sentEvents.push(event);
        return originalSend(event as never);
      };
    }

    // silence timeout occurs
    actor.send({ type: 'ASR_NOINPUT' });
    expect(actor.getSnapshot().context.pendingUtterance).toBe(prompts.noInput[0]);

    // ASR teardown completes; LISTEN_COMPLETE triggers speech
    actor.send({ type: 'LISTEN_COMPLETE' });
    expect(actor.getSnapshot().context.speechStatus).toBe('speaking');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(prompts.noInput[0]);

    const speakCountAfterListenComplete = sentEvents.filter(
      (e) => typeof e === 'object' && e !== null && (e as { type: string }).type === 'SPEAK',
    ).length;
    expect(speakCountAfterListenComplete).toBe(1);

    // subsequent ASRTTS_READY should NOT duplicate SPEAK
    actor.send({ type: 'ASRTTS_READY' });
    const speakCountAfterAsrTtsReady = sentEvents.filter(
      (e) => typeof e === 'object' && e !== null && (e as { type: string }).type === 'SPEAK',
    ).length;
    expect(speakCountAfterAsrTtsReady).toBe(1);
  });

  it('transitions directly from Idle to PromptRecipe when pre-warmed via ASRTTS_READY', () => {
    const actor = createTestCookingActor();
    expect(actor.getSnapshot().value).toBe('Idle');
    expect(actor.getSnapshot().context.isSpeechReady).toBe(false);

    // simulate background pre-warm completing while user is still in Idle
    actor.send({ type: 'ASRTTS_READY' });
    expect(actor.getSnapshot().value).toBe('Idle');
    expect(actor.getSnapshot().context.isSpeechReady).toBe(true);

    // trigger via WAKE_WORD -> should bypass Prepare and jump directly to PromptRecipe
    actor.send({ type: 'WAKE_WORD' });
    expect(actor.getSnapshot().value).toBe('PromptRecipe');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(prompts.promptRecipe);
  });

  it('falls back to Prepare when triggered before pre-warm completes', () => {
    const actor = createTestCookingActor();
    expect(actor.getSnapshot().value).toBe('Idle');
    expect(actor.getSnapshot().context.isSpeechReady).toBe(false);

    // trigger before pre-warm completes
    actor.send({ type: 'WAKE_WORD' });
    expect(actor.getSnapshot().value).toBe('Prepare');

    // pre-warm / handshake finishes
    actor.send({ type: 'ASRTTS_READY' });
    expect(actor.getSnapshot().value).toBe('PromptRecipe');
    expect(actor.getSnapshot().context.isSpeechReady).toBe(true);
  });

  it('triggers speakLastUtterance on TIMER_EXPIRED while listening and resumes listening on SPEAK_COMPLETE', () => {
    const actor = createTestCookingActor();
    actor.send({ type: 'START' });
    actor.send({ type: 'ASRTTS_READY' });

    expect(actor.getSnapshot().value).toBe('PromptRecipe');

    // assistant finishes speaking greeting prompt; transitions to listening
    actor.send({ type: 'SPEAK_COMPLETE' });
    expect(actor.getSnapshot().context.speechStatus).toBe('listening');

    const spstRef = actor.getSnapshot().context.spstRef;
    const sentEvents: unknown[] = [];
    if (spstRef) {
      const originalSend = spstRef.send.bind(spstRef);
      spstRef.send = (event: unknown) => {
        sentEvents.push(event);
        return originalSend(event as never);
      };
    }

    // proactive timer expiration arrives while in listening state
    actor.send({
      type: 'TIMER_EXPIRED',
      id: 'timer-cooking',
      label: 'cooking',
    });

    expect(actor.getSnapshot().context.speechStatus).toBe('speaking');
    expect(actor.getSnapshot().context.lastSpokenUtterance).toBe(
      "Time's up! Your cooking timer is done.",
    );
    expect(sentEvents).toContainEqual({
      type: 'SPEAK',
      value: {
        utterance: "Time's up! Your cooking timer is done.",
      },
    });

    // when speech completes, assistant returns cleanly to listening
    actor.send({ type: 'SPEAK_COMPLETE' });
    expect(actor.getSnapshot().context.speechStatus).toBe('listening');
  });

  it('allows SpeechState to interrupt active ASR recognition when receiving proactive SPEAK', async () => {
    const asrEvents: unknown[] = [];
    const ttsEvents: unknown[] = [];

    const mockAsr = fromTransition((state, event) => {
      asrEvents.push(event);
      return state;
    }, {});

    const mockTts = fromTransition((state, event) => {
      ttsEvents.push(event);
      return state;
    }, {});

    const testMachine = speechstate.provide({
      actors: {
        audioContext: fromPromise(async () => ({}) as AudioContext),
        getToken: fromPromise(async () => 'mock-token'),
        asr: mockAsr as never,
        tts: mockTts as never,
      },
    });

    const parentMachine = setup({}).createMachine({
      context: ({ spawn }) => ({
        ssRef: spawn(testMachine, {
          input: {
            azureCredentials: { endpoint: '', key: '' },
            azureRegion: 'swedencentral',
            bargeIn: false,
          },
        }),
      }),
    });

    const parentActor = createActor(parentMachine).start();
    const actor = parentActor.getSnapshot().context.ssRef;

    actor.send({ type: 'PREPARE' });
    await new Promise((resolve) => setTimeout(resolve, 10));

    actor.send({ type: 'TTS_READY' });
    actor.send({ type: 'ASR_READY' });

    // actor is now in Ready.Idle
    expect(actor.getSnapshot().matches({ Active: { AsrTtsManager: { Ready: 'Idle' } } })).toBe(
      true,
    );

    // DM sends LISTEN -> enters WaitForRecogniser
    actor.send({ type: 'LISTEN' });
    expect(
      actor.getSnapshot().matches({ Active: { AsrTtsManager: { Ready: 'WaitForRecogniser' } } }),
    ).toBe(true);

    // ASR starts -> enters Recognising
    actor.send({ type: 'ASR_STARTED' });
    expect(
      actor
        .getSnapshot()
        .matches({ Active: { AsrTtsManager: { Ready: { Recognising: 'Proceed' } } } }),
    ).toBe(true);

    // DM proactively sends SPEAK (e.g. TIMER_EXPIRED) while recognising
    actor.send({
      type: 'SPEAK',
      value: { utterance: "Time's up! Your cooking timer is done." },
    });

    // Should transition to Speaking, stop ASR, and dispatch SPEAK to TTS
    expect(
      actor.getSnapshot().matches({ Active: { AsrTtsManager: { Ready: { Speaking: 'Start' } } } }),
    ).toBe(true);
    expect(asrEvents).toContainEqual({ type: 'STOP' });
    expect(ttsEvents).toContainEqual(
      expect.objectContaining({
        type: 'SPEAK',
        value: expect.objectContaining({
          utterance: "Time's up! Your cooking timer is done.",
        }),
      }),
    );

    // Late LISTEN_COMPLETE from ASR teardown should be absorbed without aborting Speaking
    actor.send({ type: 'LISTEN_COMPLETE' });
    expect(actor.getSnapshot().matches({ Active: { AsrTtsManager: { Ready: 'Speaking' } } })).toBe(
      true,
    );
  });
});
