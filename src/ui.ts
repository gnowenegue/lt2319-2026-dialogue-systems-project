import { ROLES } from './constants';
import type { Message, SpeechStatus } from './dm/types';
import prompts from './prompts';
import type { NormalizedRecipe } from './recipes/types';
import { type ActiveTimer, calculateRemainingSeconds } from './timers';

export interface DOMElements {
  startButton: HTMLButtonElement | null;
  statusCard: HTMLElement | null;
  machineState: HTMLElement | null;
  recipeProgress: HTMLElement | null;
  timersContainer: HTMLElement | null;
  voiceHeroBanner: HTMLElement | null;
  voiceHeroTitle: HTMLElement | null;
  voiceHeroSubtitle: HTMLElement | null;
  copyDebugBtn: HTMLButtonElement | null;
  copyBtnIcon: HTMLElement | null;
  copyBtnText: HTMLElement | null;
  systemPromptText: HTMLElement | null;
  chatHistory: HTMLElement | null;
  wakeWordIndicator: HTMLElement | null;
  pttIndicator: HTMLElement | null;
}

/**
 * queries and returns cached references to all application DOM elements
 */
export const getDOMElements = (): DOMElements => {
  return {
    startButton: document.querySelector<HTMLButtonElement>('#start-btn'),
    statusCard: document.querySelector<HTMLElement>('#status-card'),
    machineState: document.querySelector<HTMLElement>('#machine-state'),
    recipeProgress: document.querySelector<HTMLElement>('#recipe-progress'),
    timersContainer: document.querySelector<HTMLElement>('#timers-container'),
    voiceHeroBanner: document.querySelector<HTMLElement>('#voice-hero-banner'),
    voiceHeroTitle: document.querySelector<HTMLElement>('#voice-hero-title'),
    voiceHeroSubtitle: document.querySelector<HTMLElement>('#voice-hero-subtitle'),
    copyDebugBtn: document.querySelector<HTMLButtonElement>('#copy-debug-btn'),
    copyBtnIcon: document.querySelector<HTMLElement>('#copy-btn-icon'),
    copyBtnText: document.querySelector<HTMLElement>('#copy-btn-text'),
    systemPromptText: document.querySelector<HTMLElement>('#system-prompt-text'),
    chatHistory: document.querySelector<HTMLElement>('#chat-history'),
    wakeWordIndicator: document.querySelector<HTMLElement>('#indicator-wakeword'),
    pttIndicator: document.querySelector<HTMLElement>('#indicator-ptt'),
  };
};

/**
 * creates an individual message row element with speaker label, metadata badges, and bubble
 */
export const createMessageElement = (msg: Message): HTMLElement => {
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
    labelEl.textContent = '🧑‍🍳 CookMate';
  }
  headerEl.appendChild(labelEl);

  // nlu intent debug badge
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
  return rowEl;
};

/**
 * renders conversation message items into the scrollable history feed
 */
export const renderChatHistory = (container: HTMLElement, messages: Message[]): void => {
  // declarative functional message element mapping
  const messageElements = messages.map(createMessageElement);
  container.replaceChildren(...messageElements);

  container.scrollTo({
    top: container.scrollHeight,
    behavior: 'smooth',
  });
};

export interface VoiceIndicatorElements {
  statusCard: HTMLElement | null;
  voiceHeroBanner: HTMLElement | null;
  voiceHeroTitle: HTMLElement | null;
  voiceHeroSubtitle: HTMLElement | null;
}

const VOICE_HERO_COPY: Record<SpeechStatus, { title: string; subtitle: string }> = {
  listening: {
    title: 'LISTENING',
    subtitle: 'Awaiting your voice... Speak naturally',
  },
  speaking: {
    title: 'SPEAKING',
    subtitle: 'CookMate is speaking...',
  },
  processing: {
    title: 'THINKING',
    subtitle: 'Interpreting voice & recipe data...',
  },
  paused: {
    title: 'PAUSED',
    subtitle: 'Mic paused after 3 timeouts — click Resume',
  },
  idle: {
    title: 'STANDBY',
    subtitle: 'Say "Hey Chef" or tap Spacebar to speak',
  },
};

/**
 * updates prominent voice hero banner and ambient card glow
 */
export const updateVoiceIndicator = (
  status: SpeechStatus,
  elements: VoiceIndicatorElements,
): void => {
  if (elements.statusCard) {
    elements.statusCard.classList.remove(
      'card-glow-idle',
      'card-glow-listening',
      'card-glow-speaking',
      'card-glow-processing',
      'card-glow-paused',
    );
    elements.statusCard.classList.add(`card-glow-${status}`);
  }

  if (elements.voiceHeroBanner) {
    elements.voiceHeroBanner.className = `voice-hero-banner state-${status}`;
  }

  if (!elements.voiceHeroTitle || !elements.voiceHeroSubtitle) return;

  const copy = VOICE_HERO_COPY[status] ?? VOICE_HERO_COPY.idle;
  elements.voiceHeroTitle.textContent = copy.title;
  elements.voiceHeroSubtitle.textContent = copy.subtitle;
};

export type TriggerIndicatorStatus = 'loading' | 'ready' | 'active' | 'error' | 'disabled';

/**
 * updates visual state and label for a voice trigger readiness badge (wake word or PTT)
 */
export const updateTriggerIndicator = (
  element: HTMLElement | null,
  status: TriggerIndicatorStatus,
  label: string,
): void => {
  if (!element) return;

  element.classList.remove(
    'status-loading',
    'status-ready',
    'status-active',
    'status-error',
    'status-disabled',
  );
  element.classList.add(`status-${status}`);

  const labelEl = element.querySelector('.indicator-label');
  if (labelEl) {
    labelEl.textContent = label;
  }
};

/**
 * updates recipe title and active step progress label
 */
export const updateRecipeProgress = (
  element: HTMLElement | null,
  recipe: NormalizedRecipe | null | undefined,
  currentStepIndex: number,
): void => {
  if (!element) return;

  if (recipe?.title) {
    const stepIdx = currentStepIndex + 1;
    const totalSteps = recipe.steps.length;
    element.textContent = `${recipe.title} (Step ${stepIdx} of ${totalSteps})`;
  } else {
    element.textContent = 'No active recipe';
  }
};

/**
 * formats remaining seconds into an mm:ss countdown display
 */
export const formatTimeRemaining = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/**
 * creates an individual timer card element with label, live countdown, and manual expire button
 */
export const createTimerElement = (
  timer: ActiveTimer,
  onExpire?: (timerId: string) => void,
): HTMLElement => {
  const cardEl = document.createElement('div');
  cardEl.className = 'timer-card';
  cardEl.dataset.timerId = timer.id;

  const infoEl = document.createElement('div');
  infoEl.className = 'timer-info';

  const labelEl = document.createElement('span');
  labelEl.className = 'timer-label';
  labelEl.textContent = `⏱️ ${timer.label}`;

  const countdownEl = document.createElement('span');
  countdownEl.className = 'timer-countdown';
  countdownEl.dataset.timestamp = String(timer.targetTimestamp);
  countdownEl.textContent = formatTimeRemaining(calculateRemainingSeconds(timer.targetTimestamp));

  infoEl.appendChild(labelEl);
  infoEl.appendChild(countdownEl);

  const expireBtn = document.createElement('button');
  expireBtn.type = 'button';
  expireBtn.className = 'btn-expire-timer';
  expireBtn.dataset.timerId = timer.id;
  expireBtn.textContent = 'Expire';
  expireBtn.title = `Manually expire ${timer.label} timer for demo`;

  if (onExpire) {
    expireBtn.addEventListener('click', () => {
      onExpire(timer.id);
    });
  }

  cardEl.appendChild(infoEl);
  cardEl.appendChild(expireBtn);
  return cardEl;
};

let timerCountdownInterval: ReturnType<typeof setInterval> | null = null;

/**
 * updates active timer list, rendering individual timer cards with live countdowns
 */
export const updateTimersDisplay = (
  element: HTMLElement | null,
  activeTimers: readonly ActiveTimer[] = [],
  onExpire?: (timerId: string) => void,
): void => {
  if (!element) return;

  if (activeTimers.length > 0) {
    element.style.display = 'flex';
    const timerCards = activeTimers.map((timer) => createTimerElement(timer, onExpire));
    element.replaceChildren(...timerCards);

    if (!timerCountdownInterval) {
      timerCountdownInterval = setInterval(() => {
        const countdownEls = element.querySelectorAll<HTMLElement>('.timer-countdown');
        countdownEls.forEach((el) => {
          const timestamp = Number(el.dataset.timestamp);
          if (timestamp) {
            el.textContent = formatTimeRemaining(calculateRemainingSeconds(timestamp));
          }
        });
      }, 1000);
    }
  } else {
    element.style.display = 'none';
    element.replaceChildren();
    if (timerCountdownInterval) {
      clearInterval(timerCountdownInterval);
      timerCountdownInterval = null;
    }
  }
};

/**
 * updates primary action button label and visibility depending on machine state
 */
export const updateActionButton = (
  button: HTMLButtonElement | null,
  stateStr: string,
  isPaused: boolean,
): void => {
  if (!button) return;

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
};

/**
 * updates system prompt debug text display
 */
export const updateSystemPrompt = (element: HTMLElement | null, messages: Message[]): void => {
  if (!element) return;

  const systemPrompt =
    messages.find((m) => m.role === ROLES.System)?.content ?? prompts.systemDefault;
  element.textContent = systemPrompt;
};

/**
 * copies text to clipboard with hidden textarea fallback
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('[CookMate] navigator.clipboard.writeText failed, using fallback:', err);
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
    console.error('[CookMate] Fallback copy also failed:', err);
    return false;
  }
};

/**
 * binds clipboard export handler and visual feedback to the copy debug button
 */
export const setupCopyDebugButton = (
  copyDebugBtn: HTMLButtonElement | null,
  copyBtnIconEl: HTMLElement | null,
  copyBtnTextEl: HTMLElement | null,
  getReportJson: () => string,
): void => {
  if (!copyDebugBtn) return;

  copyDebugBtn.addEventListener('click', async () => {
    try {
      const jsonStr = getReportJson();
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
      console.error('[CookMate] Failed to copy debug logs to clipboard:', err);
      if (copyBtnTextEl) copyBtnTextEl.textContent = 'Copy failed';
      setTimeout(() => {
        if (copyBtnTextEl) copyBtnTextEl.textContent = 'Copy Debug Info';
      }, 2000);
    }
  });
};
