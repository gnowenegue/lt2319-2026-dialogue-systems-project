import type { Settings } from 'speechstate';

import { REGION } from './constants';

const speechRegion = import.meta.env.VITE_AZURE_SPEECH_REGION || REGION;
const speechKey = import.meta.env.VITE_AZURE_SPEECH_KEY || '';

const azureCredentials = {
  endpoint: `https://${speechRegion}.api.cognitive.microsoft.com/sts/v1.0/issuetoken`,
  key: speechKey,
};

const settings: Settings = {
  azureCredentials: azureCredentials,
  azureRegion: speechRegion,
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: 'en-US',
  ttsDefaultVoice: 'en-US-DavisNeural',
  bargeIn: false,
};

export { azureCredentials, settings };
