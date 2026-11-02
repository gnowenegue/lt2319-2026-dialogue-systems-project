import './style.css';

import { createActor } from 'xstate';

import { cookingMachine } from './dm';

const button = document.querySelector<HTMLButtonElement>('#start-btn');
const machineStateEl = document.querySelector<HTMLElement>('#machine-state');
const recipeProgressEl = document.querySelector<HTMLElement>('#recipe-progress');
const timersContainerEl = document.querySelector<HTMLElement>('#timers-container');
const userTranscriptEl = document.querySelector<HTMLElement>('#user-transcript');
const systemTranscriptEl = document.querySelector<HTMLElement>('#system-transcript');

const dmActor = createActor(cookingMachine).start();

dmActor.subscribe((snapshot) => {
  console.group('[CookingCopilot] State Transition');
  console.log('Value:', snapshot.value);
  console.log('Last Spoken:', snapshot.context.lastSpokenUtterance);
  console.groupEnd();

  const stateStr = String(snapshot.value);
  if (machineStateEl) {
    machineStateEl.textContent = stateStr;
  }

  // Update button visibility / text based on state
  if (button) {
    if (stateStr === 'Idle') {
      button.style.display = 'inline-block';
      button.textContent = 'Start Cooking';
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

  // Update User speech transcription
  if (userTranscriptEl) {
    const latestUserSpeech = snapshot.context.lastResult?.[0]?.utterance?.trim();
    if (latestUserSpeech) {
      userTranscriptEl.textContent = `"${latestUserSpeech}"`;
    }
  }

  // Update Assistant speech output
  if (systemTranscriptEl) {
    const systemSpeech = snapshot.context.lastSpokenUtterance?.trim();
    if (systemSpeech) {
      systemTranscriptEl.textContent = `"${systemSpeech}"`;
    }
  }
});

if (button) {
  button.addEventListener('click', () => {
    dmActor.send({ type: 'CLICK' });
  });
}
