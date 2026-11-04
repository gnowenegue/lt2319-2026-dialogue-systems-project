import './style.css';

import { createActor } from 'xstate';

import { AudioPipeline, PushToTalkController, WakeWordEngine } from './audio';
import { getPushStreamAdapter } from './configs';
import { ROLES } from './constants';
import { buildDebugReport, cookingMachine } from './dm';
import type { Message, SpeechStatus } from './dm/types';
import prompts from './prompts';

const button = document.querySelector<HTMLButtonElement>('#start-btn');
const statusCardEl = document.querySelector<HTMLElement>('#status-card');
const machineStateEl = document.querySelector<HTMLElement>('#machine-state');
const recipeProgressEl = document.querySelector<HTMLElement>('#recipe-progress');
const timersContainerEl = document.querySelector<HTMLElement>('#timers-container');
const voiceHeroBannerEl = document.querySelector<HTMLElement>('#voice-hero-banner');
const voiceHeroTitleEl = document.querySelector<HTMLElement>('#voice-hero-title');
const voiceHeroSubtitleEl = document.querySelector<HTMLElement>('#voice-hero-subtitle');
const copyDebugBtn = document.querySelector<HTMLButtonElement>('#copy-debug-btn');
const copyBtnIconEl = document.querySelector<HTMLElement>('#copy-btn-icon');
const copyBtnTextEl = document.querySelector<HTMLElement>('#copy-btn-text');
const systemPromptTextEl = document.querySelector<HTMLElement>('#system-prompt-text');
const chatHistoryEl = document.querySelector<HTMLElement>('#chat-history');

const dmActor = createActor(cookingMachine).start();
const audioPipeline = new AudioPipeline();
const wakeWordEngine = new WakeWordEngine();
const pttController = new PushToTalkController();
const pushStreamAdapter = getPushStreamAdapter();

// enable Spacebar Push-To-Talk hotkey immediately on page load
pttController.enable();

let audioStarted = false;

/**
 * ensures Web Audio hardware, wake word worker, and PTT hotkey are initialized
 */
async function ensureAudioStarted(): Promise<void> {
  if (audioStarted) return;
  audioStarted = true;

  try {
    await audioPipeline.start();
    console.log('[Cookmate] Audio pipeline started (16 kHz mono)');

    // pipe PCM chunks to openWakeWord worker and Azure push stream
    audioPipeline.onChunk((chunk) => {
      wakeWordEngine.processChunk(chunk);
      pushStreamAdapter.pushChunk(chunk);
    });

    wakeWordEngine
      .start()
      .then(() => {
        console.log('[Cookmate] Wake word engine started (Hey Jarvis)');
      })
      .catch((err) => {
        console.warn('[Cookmate] Wake word engine deferred/warning:', err);
      });
  } catch (err) {
    audioStarted = false;
    console.error('[Cookmate] Error initializing audio pipeline:', err);
  }
}

// auto-start microphone and wake word engine on load so users can say "Hey Jarvis" immediately
ensureAudioStarted().catch(() => {});

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

  const snapshot = dmActor.getSnapshot();
  const stateStr = String(snapshot.value);

  // flush 500ms pre-roll to Azure push stream so initial syllables are preserved
  const preRoll = audioPipeline.getPreRoll();
  pushStreamAdapter.startStreaming(preRoll);
  audioPipeline.clearPreRoll();

  if (stateStr === 'Idle') {
    dmActor.send({ type: 'CLICK' });
  } else {
    dmActor.send(source === 'wake-word' ? { type: 'WAKE_WORD' } : { type: 'PTT_TRIGGER' });
  }
}

// listen for wake word detection
wakeWordEngine.onTrigger((detection) => {
  console.log(
    `[Cookmate] Wake word detected: ${detection.modelName} (score: ${(detection.score * 100).toFixed(1)}%)`,
  );
  handleTrigger('wake-word');
});

// listen for Push-To-Talk spacebar toggle
pttController.onTrigger(() => {
  console.log('[Cookmate] Push-to-Talk (Spacebar) triggered');
  handleTrigger('ptt');
});

/**
 * renders conversation message items into the scrollable history feed
 */
function renderChatHistory(container: HTMLElement, messages: Message[]): void {
  // Clear previous message children
  container.replaceChildren();

  for (const msg of messages) {
    const rowEl = document.createElement('div');
    rowEl.className = `message-row ${msg.role}-row`;

    const headerEl = document.createElement('div');
    headerEl.className = 'message-meta';

    const labelEl = document.createElement('span');
    labelEl.className = 'speaker-label';

    if (msg.role === ROLES.System) {
      labelEl.textContent = '⚙️ System Prompt';
    } else if (msg.role === ROLES.User) {
      labelEl.textContent = '👤 You';
    } else {
      labelEl.textContent = '🧑‍🍳 Cookmate';
    }
    headerEl.appendChild(labelEl);

    // NLU intent debug badge (Enhancement 5)
    if (msg.role === ROLES.User && msg.act) {
      const intentBadge = document.createElement('span');
      intentBadge.className = 'intent-badge';
      intentBadge.textContent = `[${msg.act}]`;
      intentBadge.title = `NLU Dialogue Act: ${msg.act}`;
      headerEl.appendChild(intentBadge);
    }

    if (msg.timestamp) {
      const timeEl = document.createElement('span');
      timeEl.className = 'message-time';
      timeEl.textContent = msg.timestamp;
      headerEl.appendChild(timeEl);
    }

    const bubbleEl = document.createElement('p');
    bubbleEl.className = `speech-bubble ${msg.role}-bubble`;
    bubbleEl.textContent = msg.content;

    rowEl.appendChild(headerEl);
    rowEl.appendChild(bubbleEl);
    container.appendChild(rowEl);
  }

  // Smooth scroll to latest turn
  container.scrollTo({
    top: container.scrollHeight,
    behavior: 'smooth',
  });
}

/**
 * updates prominent voice hero banner and ambient card glow
 */
function updateVoiceIndicator(status: SpeechStatus): void {
  if (statusCardEl) {
    statusCardEl.classList.remove(
      'card-glow-idle',
      'card-glow-listening',
      'card-glow-speaking',
      'card-glow-processing',
      'card-glow-paused',
    );
    statusCardEl.classList.add(`card-glow-${status}`);
  }

  if (voiceHeroBannerEl) {
    voiceHeroBannerEl.className = `voice-hero-banner state-${status}`;
  }

  if (!voiceHeroTitleEl || !voiceHeroSubtitleEl) return;

  switch (status) {
    case 'listening':
      voiceHeroTitleEl.textContent = 'LISTENING';
      voiceHeroSubtitleEl.textContent = 'Awaiting your voice... Speak naturally';
      break;
    case 'speaking':
      voiceHeroTitleEl.textContent = 'SPEAKING';
      voiceHeroSubtitleEl.textContent = 'Cookmate is speaking...';
      break;
    case 'processing':
      voiceHeroTitleEl.textContent = 'THINKING';
      voiceHeroSubtitleEl.textContent = 'Interpreting voice & recipe data...';
      break;
    case 'paused': {
      voiceHeroTitleEl.textContent = 'PAUSED';
      voiceHeroSubtitleEl.textContent = 'Mic paused after 3 timeouts — click Resume';
      break;
    }
    default: {
      voiceHeroTitleEl.textContent = 'STANDBY';
      voiceHeroSubtitleEl.textContent = 'Say "Hey Jarvis" or tap Spacebar to speak';
      break;
    }
  }
}

let previousState: unknown;
let previousMessages: Message[] | undefined;

dmActor.subscribe((snapshot) => {
  if (snapshot.value !== previousState) {
    console.group(
      `[Cookmate] State Transition: ${String(previousState ?? 'Initial')} → ${String(snapshot.value)}`,
    );
    console.log('Value:', snapshot.value);
    console.log('Last Spoken:', snapshot.context.lastSpokenUtterance);
    console.groupEnd();
    previousState = snapshot.value;
  }

  const stateStr = String(snapshot.value);
  if (machineStateEl) {
    machineStateEl.textContent = stateStr;
  }

  // Derive live mic and speech status (Prominent hero banner & ambient glow)
  const isPaused = (snapshot.context.noInputCount ?? 0) >= 3;
  const currentStatus: SpeechStatus =
    stateStr === 'Idle' || stateStr === 'Completed'
      ? 'idle'
      : isPaused
        ? 'paused'
        : (snapshot.context.speechStatus ?? 'idle');
  updateVoiceIndicator(currentStatus);

  // Synchronize Azure push audio streaming with active listening state
  if (currentStatus === 'listening') {
    pushStreamAdapter.startStreaming();
  } else {
    pushStreamAdapter.stopStreaming();
  }

  // Update button visibility / text based on state
  if (button) {
    if (stateStr === 'Idle') {
      button.style.display = 'inline-block';
      button.textContent = 'Start Cooking';
    } else if (stateStr === 'Completed') {
      button.style.display = 'inline-block';
      button.textContent = 'Cook Another Recipe';
    } else if (isPaused) {
      button.style.display = 'inline-block';
      button.textContent = 'Resume Listening';
    } else {
      button.style.display = 'none';
    }
  }

  // Update recipe & step info
  if (recipeProgressEl) {
    const title = snapshot.context.recipe?.title;
    if (title) {
      const stepIdx = snapshot.context.currentStepIndex + 1;
      const totalSteps = snapshot.context.recipe?.steps.length ?? 0;
      recipeProgressEl.textContent = `${title} (Step ${stepIdx} of ${totalSteps})`;
    } else {
      recipeProgressEl.textContent = 'No active recipe';
    }
  }

  // Update active timers
  if (timersContainerEl) {
    const activeTimers = snapshot.context.activeTimers ?? [];
    if (activeTimers.length > 0) {
      timersContainerEl.style.display = 'block';
      timersContainerEl.textContent = `⏱️ Active Timers: ${activeTimers.map((t) => t.label).join(', ')}`;
    } else {
      timersContainerEl.style.display = 'none';
      timersContainerEl.textContent = '';
    }
  }

  // Update System Prompt card content (Option A)
  if (systemPromptTextEl) {
    const systemPrompt =
      snapshot.context.messages.find((m) => m.role === ROLES.System)?.content ??
      prompts.systemDefault;
    systemPromptTextEl.textContent = systemPrompt;
  }

  // Update scrollable full conversation history
  if (chatHistoryEl && snapshot.context.messages !== previousMessages) {
    previousMessages = snapshot.context.messages;
    renderChatHistory(chatHistoryEl, snapshot.context.messages);
  }
});

if (button) {
  button.addEventListener('click', async () => {
    await ensureAudioStarted();
    const preRoll = audioPipeline.getPreRoll();
    pushStreamAdapter.startStreaming(preRoll);
    audioPipeline.clearPreRoll();
    dmActor.send({ type: 'CLICK' });
  });
}

/**
 * copies text to clipboard with fallback to hidden textarea
 */
async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('[Cookmate] navigator.clipboard.writeText failed, using fallback:', err);
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.setAttribute('readonly', '');
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return successful;
  } catch (err) {
    console.error('[Cookmate] Fallback copy also failed:', err);
    return false;
  }
}

if (copyDebugBtn) {
  copyDebugBtn.addEventListener('click', async () => {
    try {
      const snapshot = dmActor.getSnapshot();
      const report = buildDebugReport(snapshot);
      const jsonStr = JSON.stringify(report, null, 2);

      const success = await copyToClipboard(jsonStr);
      if (!success) {
        throw new Error('Clipboard write operation failed');
      }

      copyDebugBtn.classList.add('copied');
      if (copyBtnIconEl) copyBtnIconEl.textContent = '✓';
      if (copyBtnTextEl) copyBtnTextEl.textContent = 'Copied to Clipboard!';

      setTimeout(() => {
        copyDebugBtn.classList.remove('copied');
        if (copyBtnIconEl) copyBtnIconEl.textContent = '📋';
        if (copyBtnTextEl) copyBtnTextEl.textContent = 'Copy Debug Info';
      }, 2000);
    } catch (err) {
      console.error('[Cookmate] Failed to copy debug logs to clipboard:', err);
      if (copyBtnTextEl) copyBtnTextEl.textContent = 'Copy failed';
      setTimeout(() => {
        if (copyBtnTextEl) copyBtnTextEl.textContent = 'Copy Debug Info';
      }, 2000);
    }
  });
}
