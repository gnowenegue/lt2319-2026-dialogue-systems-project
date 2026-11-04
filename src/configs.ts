import type { Settings } from 'speechstate';
import { AzurePushStreamAdapter } from './audio/azure-push-stream';
import { REGION } from './constants';
import { getEnv } from './env';

const speechRegion = getEnv('VITE_AZURE_SPEECH_REGION', REGION);
const speechKey = getEnv('VITE_AZURE_SPEECH_KEY');

/**
 * Azure Speech API token issuance endpoint and authentication key
 */
const azureCredentials = {
  endpoint: `https://${speechRegion}.api.cognitive.microsoft.com/sts/v1.0/issuetoken`,
  key: speechKey,
};

let pushStreamAdapterInstance: AzurePushStreamAdapter | null = null;

/**
 * returns singleton instance of `AzurePushStreamAdapter`
 */
const getPushStreamAdapter = (): AzurePushStreamAdapter => {
  if (!pushStreamAdapterInstance) {
    pushStreamAdapterInstance = new AzurePushStreamAdapter();
  }
  return pushStreamAdapterInstance;
};

/**
 * factory creating SpeechState runtime settings with optional custom audio stream
 */
const createSettings = (audioConfig?: Settings['audioConfig']): Settings => ({
  azureCredentials: azureCredentials,
  azureRegion: speechRegion,
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 10000,
  locale: 'en-US',
  ttsDefaultVoice: 'en-US-DavisNeural',
  ttsDefaultSpeechRate: 1.15,
  bargeIn: false,
  audioConfig,
});

/**
 * SpeechState runtime settings configuring Azure ASR, TTS voice, locale, and timeouts
 */
const settings: Settings = {
  ...createSettings(),
  get audioConfig() {
    return getPushStreamAdapter().audioConfig;
  },
};

export { getPushStreamAdapter, settings };
