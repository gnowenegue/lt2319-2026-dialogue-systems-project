import './style.css';

import { createActor } from 'xstate';
import { cookingMachine } from './dm';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  app.innerHTML = `
    <div>
      <div class="card">
        <button id="counter" type="button"></button>
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
    button.innerHTML = `
      <strong>${String(snapshot.value)}</strong>
      ${lastSpoken ? `<p style="font-size: 0.85em; margin-top: 6px;">"${lastSpoken}"</p>` : ''}
    `;
  });

  button.addEventListener('click', () => {
    dmActor.send({ type: 'CLICK' });
  });
}
