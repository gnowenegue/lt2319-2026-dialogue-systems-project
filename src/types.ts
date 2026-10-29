import type { Hypothesis, SpeechStateExternalEvent } from 'speechstate';
import type { AnyActorRef } from 'xstate';

import type { ROLES } from './constants';

export interface DMContext {
  spstRef: AnyActorRef;
  lastResult: Hypothesis[] | null;
  // nextUtterance: string;
  messages: Message[];
  noInputCount: number;
}

export type DMEvents = SpeechStateExternalEvent | { type: 'CLICK' } | { type: 'DONE' };

export type MessageRole = (typeof ROLES)[keyof typeof ROLES];

export type Message = {
  role: MessageRole;
  content: string;
};
