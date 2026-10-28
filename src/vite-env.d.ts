/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AZURE_SPEECH_KEY: string;
  readonly VITE_AZURE_SPEECH_REGION: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_QDRANT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
