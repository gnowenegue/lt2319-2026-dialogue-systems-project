import { parseUtterance } from '../../semantic-parser';
import type { CookingEvent } from '../types';

/**
 * translates recognized user speech into semantic dialogue acts and sends them to the machine
 */
export async function handleRecognisedAction({
  self,
  event,
}: {
  self: { send: (event: CookingEvent) => void };
  event: CookingEvent;
}): Promise<void> {
  if (event.type !== 'RECOGNISED') return;
  const utterance = event.value[0]?.utterance?.trim();
  if (!utterance) return;

  const parsed = await parseUtterance(utterance);
  switch (parsed.act) {
    case 'SEARCH_RECIPE':
      self.send({ type: 'SEARCH_RECIPE', query: parsed.entities?.query || utterance });
      break;
    case 'AFFIRM':
      self.send({ type: 'AFFIRM' });
      break;
    case 'DENY':
      self.send({ type: 'DENY' });
      break;
    case 'NEXT_STEP':
      self.send({ type: 'NEXT_STEP' });
      break;
    case 'PREVIOUS_STEP':
      self.send({ type: 'PREVIOUS_STEP' });
      break;
    case 'REPEAT_STEP':
      self.send({ type: 'REPEAT_STEP' });
      break;
    case 'GOTO_STEP':
      self.send({ type: 'GOTO_STEP', stepNumber: Number(parsed.entities?.stepNumber) || 1 });
      break;
    case 'QUERY_INGREDIENT':
      self.send({ type: 'QUERY_INGREDIENT', ingredient: parsed.entities?.ingredient });
      break;
    case 'SET_TIMER': {
      const duration = Number(parsed.entities?.durationSeconds) || 60;
      const label = (parsed.entities?.timerLabel as string | undefined)?.trim() || 'cooking';
      self.send({ type: 'SET_TIMER', durationSeconds: duration, label });
      break;
    }
    case 'CHECK_TIMER': {
      const label = parsed.entities?.timerLabel as string | undefined;
      self.send({ type: 'CHECK_TIMER', label });
      break;
    }
    case 'CANCEL_TIMER': {
      const label = parsed.entities?.timerLabel as string | undefined;
      self.send({ type: 'CANCEL_TIMER', label });
      break;
    }
    default:
      console.warn(`[NLU] Unhandled dialogue act: "${parsed.act}" for utterance: "${utterance}"`);
  }
}
