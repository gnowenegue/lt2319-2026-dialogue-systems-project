import './style.css';

import { createActor } from 'xstate';

import { cookingMachine } from './dm';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  app.innerHTML = `
    <div>
      <h1>Cooking Dialogue Copilot</h1>
      <div class="card">
        <button id="counter" type="button" style="min-width: 280px; padding: 1.2em; font-size: 1.1em; line-height: 1.4;">
          <strong>Click to Start Cooking</strong>
        </button>
      </div>
    </div>
  `;
}

const button = document.querySelector<HTMLButtonElement>('#counter');
if (button) {
  const dmActor = createActor(cookingMachine).start();

  dmActor.subscribe((snapshot) => {
    console.group('[CookingCopilot] State Transition');
    console.log('Value:', snapshot.value);
    console.log('Last Spoken:', snapshot.context.lastSpokenUtterance);
    console.groupEnd();

    const lastSpoken = snapshot.context.lastSpokenUtterance;
    const recipeTitle = snapshot.context.recipe?.title;
    const stepIdx = snapshot.context.currentStepIndex + 1;
    const totalSteps = snapshot.context.recipe?.steps.length ?? 0;

    button.innerHTML = `
      <strong>${String(snapshot.value)}</strong>
      ${recipeTitle ? `<div style="font-size: 0.9em; opacity: 0.85; margin-top: 4px;">Recipe: ${recipeTitle} (Step ${stepIdx}/${totalSteps})</div>` : ''}
      ${lastSpoken ? `<p style="font-size: 0.85em; margin-top: 6px;">"${lastSpoken}"</p>` : ''}
    `;
  });

  button.addEventListener('click', () => {
    dmActor.send({ type: 'CLICK' });
  });
}
