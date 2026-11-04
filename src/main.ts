import './style.css';

import { createActor } from 'xstate';

import { AudioPipeline, PushToTalkController, WakeWordEngine } from './audio';
import { getPushStreamAdapter } from './configs';
import { buildDebugReport, cookingMachine } from './dm';
import type { Message, SpeechStatus } from './dm/types';
import { preloadModel } from './rag';
import {
  getDOMElements,
  renderChatHistory,
  setupCopyDebugButton,
  updateActionButton,
  updateRecipeProgress,
  updateSystemPrompt,
  updateTimersDisplay,
  updateVoiceIndicator,
} from './ui';

const dom = getDOMElements();
const dmActor = createActor(cookingMachine);

let lastTriggeringEvent: unknown;

// log events received by Dialogue Manager, ignoring internal XState lifecycles
dmActor.system.inspect((inspectionEvent) => {
  if (
    inspectionEvent.type === '@xstate.event' &&
    inspectionEvent.actorRef === dmActor &&
    !inspectionEvent.event.type.startsWith('xstate.')
  ) {
    console.log('[CookMate] Event:', inspectionEvent.event.type, inspectionEvent.event);
  } else if (inspectionEvent.type === '@xstate.snapshot' && inspectionEvent.actorRef === dmActor) {
    lastTriggeringEvent = inspectionEvent.event;
  }
});

dmActor.start();

const audioPipeline = new AudioPipeline();
const wakeWordEngine = new WakeWordEngine({ modelName: 'hey_chef' });
const pttController = new PushToTalkController();
const pushStreamAdapter = getPushStreamAdapter();

// enable Spacebar Push-To-Talk hotkey immediately on page load
pttController.enable();

let audioStarted = false;

/**
 * flushes audio pre-roll buffer to Azure push stream
 */
function flushPreRoll(): void {
  const preRoll = audioPipeline.getPreRoll();
  pushStreamAdapter.startStreaming(preRoll);
  audioPipeline.clearPreRoll();
}

/**
 * ensures Web Audio hardware, wake word worker, and PTT hotkey are initialized
 */
async function ensureAudioStarted(): Promise<void> {
  if (audioStarted) return;
  audioStarted = true;

  try {
    await audioPipeline.start();
    console.log('[CookMate] Audio pipeline started (16 kHz mono)');

    // pipe PCM chunks to openWakeWord worker and Azure push stream
    audioPipeline.onChunk((chunk) => {
      wakeWordEngine.processChunk(chunk);
      pushStreamAdapter.pushChunk(chunk);
    });

    wakeWordEngine
      .start()
      .then(() => {
        console.log('[CookMate] Wake word engine started (Hey Chef)');
      })
      .catch((err) => {
        console.warn('[CookMate] Wake word engine deferred/warning:', err);
      });
  } catch (err) {
    audioStarted = false;
    console.error('[CookMate] Error initializing audio pipeline:', err);
  }
}

// auto-start microphone and wake word engine on load
ensureAudioStarted().catch(() => {});

// warm up embedding model in the background to prevent cold-start latency on RAG queries
preloadModel().catch((err) => {
  console.warn('[CookMate] Embedding model preload deferred/warning:', err);
});

// fallback: activate on first user interaction if browser policy deferred autoplay
const startAudioOnInteraction = (): void => {
  if (!audioStarted) {
    ensureAudioStarted().catch(() => {});
  }
};
window.addEventListener('click', startAudioOnInteraction, { once: true });
window.addEventListener('keydown', startAudioOnInteraction, { once: true });

/**
 * handles wake word detection or manual PTT toggle
 */
async function handleTrigger(source: 'wake-word' | 'ptt'): Promise<void> {
  await ensureAudioStarted();
  flushPreRoll();

  const snapshot = dmActor.getSnapshot();
  const stateStr = String(snapshot.value);

  if (stateStr === 'Idle') {
    dmActor.send({ type: 'CLICK' });
  } else {
    dmActor.send(source === 'wake-word' ? { type: 'WAKE_WORD' } : { type: 'PTT_TRIGGER' });
  }
}

// listen for wake word detection
wakeWordEngine.onTrigger((detection) => {
  console.log(
    `[CookMate] Wake word detected: ${detection.modelName} (score: ${(detection.score * 100).toFixed(1)}%)`,
  );
  handleTrigger('wake-word');
});

// listen for Push-To-Talk spacebar toggle
pttController.onTrigger(() => {
  console.log('[CookMate] Push-to-Talk (Spacebar) triggered');
  handleTrigger('ptt');
});

// listen for primary action button click
dom.startButton?.addEventListener('click', async () => {
  await ensureAudioStarted();
  flushPreRoll();
  dmActor.send({ type: 'CLICK' });
});

let previousState: unknown;
let previousMessages: Message[] | undefined;

dmActor.subscribe((snapshot) => {
  if (snapshot.value !== previousState) {
    console.group(
      `[CookMate] State Transition: ${String(previousState ?? 'Initial')} → ${String(snapshot.value)}`,
    );
    if (lastTriggeringEvent) {
      console.log('Triggered by Event:', lastTriggeringEvent);
    }
    console.log('Value:', snapshot.value);
    console.log('Last Spoken:', snapshot.context.lastSpokenUtterance);
    console.groupEnd();
    previousState = snapshot.value;
  }

  const stateStr = String(snapshot.value);
  if (dom.machineState) {
    dom.machineState.textContent = stateStr;
  }

  // derive live mic and speech status
  const isPaused = (snapshot.context.noInputCount ?? 0) >= 3;
  const currentStatus: SpeechStatus =
    stateStr === 'Idle' || stateStr === 'Completed'
      ? 'idle'
      : isPaused
        ? 'paused'
        : (snapshot.context.speechStatus ?? 'idle');

  updateVoiceIndicator(currentStatus, dom);

  // synchronize Azure push audio streaming with active listening state
  if (currentStatus === 'listening') {
    pushStreamAdapter.startStreaming();
  } else {
    pushStreamAdapter.stopStreaming();
  }

  updateActionButton(dom.startButton, stateStr, isPaused);
  updateRecipeProgress(
    dom.recipeProgress,
    snapshot.context.recipe,
    snapshot.context.currentStepIndex,
  );
  updateTimersDisplay(dom.timersContainer, snapshot.context.activeTimers);
  updateSystemPrompt(dom.systemPromptText, snapshot.context.messages);

  if (dom.chatHistory && snapshot.context.messages !== previousMessages) {
    previousMessages = snapshot.context.messages;
    renderChatHistory(dom.chatHistory, snapshot.context.messages);
  }
});

// setup copy debug logs button handler
setupCopyDebugButton(dom.copyDebugBtn, dom.copyBtnIcon, dom.copyBtnText, () => {
  const snapshot = dmActor.getSnapshot();
  const report = buildDebugReport(snapshot);
  return JSON.stringify(report, null, 2);
});
