import type { CookingContext } from '../types';

/**
 * speech audio actions interacting directly with the child SpeechState actor
 */
export const speechActions = {
  'spst.prepare': ({ context }: { context: CookingContext }) => {
    // initialize `SpeechState` audio pipelines on user gesture
    if (context.spstRef) {
      context.spstRef.send({
        type: 'PREPARE',
      });
    }
  },
  'spst.listen': ({ context }: { context: CookingContext }) => {
    if (context.spstRef) {
      context.spstRef.send({
        type: 'LISTEN',
      });
    }
  },
  speakLastUtterance: ({ context }: { context: CookingContext }) => {
    if (context.spstRef) {
      context.spstRef.send({
        type: 'SPEAK',
        value: {
          utterance: context.lastSpokenUtterance ?? '',
        },
      });
    }
  },
};
