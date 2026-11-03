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
  'spst.speak': (
    { context }: { context: CookingContext },
    params: { utterance: string; bargeIn?: boolean },
  ) => {
    // notify SpeechState ASR/TTS actor if initialized
    if (context.spstRef) {
      context.spstRef.send({
        type: 'SPEAK',
        value: {
          utterance: params.utterance,
          ...(params.bargeIn !== undefined ? { bargeIn: params.bargeIn } : {}),
        },
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
};
