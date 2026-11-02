import type { Settings } from 'speechstate';

import { REGION } from './constants';

/**
 * retrieves an environment variable from `import.meta.env` (Vite) or `process.env` (Node)
 */
const getEnv = (key: string, fallback = ''): string => {
  const metaEnv = import.meta.env as Record<string, string | undefined> | undefined;
  return metaEnv?.[key] || globalThis.process?.env?.[key] || fallback;
};

const speechRegion = getEnv('VITE_AZURE_SPEECH_REGION', REGION);
const speechKey = getEnv('VITE_AZURE_SPEECH_KEY');

/**
 * Azure Speech API token issuance endpoint and authentication key
 */
const azureCredentials = {
  endpoint: `https://${speechRegion}.api.cognitive.microsoft.com/sts/v1.0/issuetoken`,
  key: speechKey,
};

/**
 * SpeechState runtime settings configuring Azure ASR, TTS voice, locale, and timeouts
 */
const settings: Settings = {
  azureCredentials: azureCredentials,
  azureRegion: speechRegion,
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: 'en-US',
  ttsDefaultVoice: 'en-US-DavisNeural',
  bargeIn: false,
};

export { azureCredentials, getEnv, settings };
