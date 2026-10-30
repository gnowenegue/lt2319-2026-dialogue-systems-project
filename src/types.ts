import type { Hypothesis, SpeechStateExternalEvent } from 'speechstate';
import type { AnyActorRef } from 'xstate';

import type { ROLES } from './constants';

export interface DMContext {
  spstRef: AnyActorRef;
  lastResult: Hypothesis[] | null;
  // optional queued message text for the assistant to speak on the next turn
  messages: Message[];
  noInputCount: number;
}

export type DMEvents = SpeechStateExternalEvent | { type: 'CLICK' } | { type: 'DONE' };

export type MessageRole = (typeof ROLES)[keyof typeof ROLES];

export type Message = {
  role: MessageRole;
  content: string;
};
