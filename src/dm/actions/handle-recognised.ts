import { ROLES } from '../../constants';
import { parseUtterance } from '../../semantic-parser';
import type { CookingContext, CookingEvent } from '../types';

/**
 * translates recognized user speech into semantic dialogue acts and sends them to the machine
 */
export async function handleRecognisedAction({
  context,
  self,
  event,
}: {
  context?: CookingContext;
  self: {
    send: (event: CookingEvent) => void;
    getSnapshot?: () => { can?: (event: CookingEvent) => boolean; value?: unknown };
  };
  event: CookingEvent;
}): Promise<void> {
  if (event.type !== 'RECOGNISED') return;
  const utterance = event.value[0]?.utterance?.trim();
  if (!utterance) return;

  // extract recent conversation context (up to 3 turns prior to current turn, excluding system prompt)
  const priorMessages = (context?.messages ?? []).slice(0, -1);
  const recentMessages = priorMessages
    .filter((m) => m.role === ROLES.Assistant || m.role === ROLES.User)
    .slice(-3)
    .map((m) => ({
      role: m.role as 'assistant' | 'user',
      content: m.content,
    }));

  const parsed = await parseUtterance(utterance, { recentMessages });
  self.send({
    type: 'ACT_RESOLVED',
    act: parsed.act,
    entities: parsed.entities as Record<string, unknown> | undefined,
  });

  let eventToSend: CookingEvent;
  switch (parsed.act) {
    case 'SEARCH_RECIPE':
      eventToSend = { type: 'SEARCH_RECIPE', query: parsed.entities?.query || utterance };
      break;
    case 'AFFIRM':
      eventToSend = { type: 'AFFIRM' };
      break;
    case 'DENY':
      eventToSend = { type: 'DENY' };
      break;
    case 'SKIP_PREP':
      eventToSend = { type: 'SKIP_PREP' };
      break;
    case 'NEXT_STEP':
      eventToSend = { type: 'NEXT_STEP' };
      break;
    case 'PREVIOUS_STEP':
      eventToSend = { type: 'PREVIOUS_STEP' };
      break;
    case 'REPEAT_STEP':
      eventToSend = { type: 'REPEAT_STEP' };
      break;
    case 'GOTO_STEP': {
      let targetStep = parsed.entities?.stepNumber;
      if (targetStep === -1 || (!targetStep && /\b(last|final|end)\b/i.test(utterance))) {
        targetStep = context?.recipe?.steps.length ?? 1;
      }
      if (typeof targetStep === 'number' && !Number.isNaN(targetStep) && targetStep >= 1) {
        eventToSend = { type: 'GOTO_STEP', stepNumber: targetStep };
      } else {
        eventToSend = { type: 'UNKNOWN' };
      }
      break;
    }
    case 'QUERY_INGREDIENT':
      eventToSend = { type: 'QUERY_INGREDIENT', ingredient: parsed.entities?.ingredient };
      break;
    case 'SET_TIMER': {
      const duration = Number(parsed.entities?.durationSeconds) || 60;
      const label = (parsed.entities?.timerLabel as string | undefined)?.trim() || 'cooking';
      eventToSend = { type: 'SET_TIMER', durationSeconds: duration, label };
      break;
    }
    case 'CHECK_TIMER': {
      const label = parsed.entities?.timerLabel as string | undefined;
      eventToSend = { type: 'CHECK_TIMER', label };
      break;
    }
    case 'CANCEL_TIMER': {
      const label = parsed.entities?.timerLabel as string | undefined;
      eventToSend = { type: 'CANCEL_TIMER', label };
      break;
    }
    case 'HELP':
      eventToSend = { type: 'HELP' };
      break;
    case 'GREETING':
      eventToSend = { type: 'GREETING' };
      break;
    default: {
      eventToSend = { type: 'UNKNOWN' };
      break;
    }
  }

  // if the machine cannot handle this command right now, ask for clarification
  if (self.getSnapshot && !self.getSnapshot().can?.(eventToSend)) {
    self.send({ type: 'UNKNOWN' });
    return;
  }

  self.send(eventToSend);
}
