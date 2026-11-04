import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

interface ModelTarget {
  filename: string;
  urls: string[];
}

const MODELS_DIR = path.resolve(process.cwd(), 'public/models/wake-word');

const MODEL_TARGETS: ModelTarget[] = [
  {
    filename: 'melspectrogram.onnx',
    urls: [
      'https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/melspectrogram.onnx',
      'https://huggingface.co/davidscripka/openwakeword/resolve/main/melspectrogram.onnx',
    ],
  },
  {
    filename: 'embedding_model.onnx',
    urls: [
      'https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/embedding_model.onnx',
      'https://huggingface.co/davidscripka/openwakeword/resolve/main/embedding_model.onnx',
    ],
  },
  {
    filename: 'hey_jarvis_v0.1.onnx',
    urls: [
      'https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/hey_jarvis_v0.1.onnx',
      'https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/hey_jarvis.onnx',
      'https://raw.githubusercontent.com/dscripka/openWakeWord/main/openwakeword/resources/models/hey_jarvis_v0.1.onnx',
      'https://raw.githubusercontent.com/dscripka/openWakeWord/main/openwakeword/resources/models/hey_jarvis.onnx',
      'https://huggingface.co/davidscripka/openwakeword/resolve/main/openwakeword/resources/models/hey_jarvis_v0.1.onnx',
      'https://huggingface.co/davidscripka/openwakeword/resolve/main/hey_jarvis_v0.1.onnx',
      'https://huggingface.co/davidscripka/openwakeword/raw/main/hey_jarvis_v0.1.onnx',
      'https://huggingface.co/datasets/davidscripka/openwakeword_models/resolve/main/hey_jarvis_v0.1.onnx',
    ],
  },
];

/**
 * downloads a file from an array of fallback urls
 */
async function downloadWithFallback(target: ModelTarget, destinationDir: string): Promise<void> {
  const filePath = path.join(destinationDir, target.filename);
  if (existsSync(filePath)) {
    console.log(`[WakeWord] ${target.filename} already exists, skipping.`);
    return;
  }

  let lastError: Error | null = null;
  for (const url of target.urls) {
    try {
      console.log(`[WakeWord] Downloading ${target.filename} from ${url}...`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Cookmate/1.0 (academic course project; student@gu.se)',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await writeFile(filePath, buffer);
      console.log(
        `[WakeWord] Successfully saved ${target.filename} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`,
      );
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[WakeWord] Failed to download from ${url}: ${lastError.message}. Trying next fallback...`,
      );
    }
  }

  throw new Error(
    `Failed to download ${target.filename} from all mirrors. Last error: ${lastError?.message}`,
  );
}

async function main(): Promise<void> {
  console.log(`[WakeWord] Preparing models directory: ${MODELS_DIR}`);
  await mkdir(MODELS_DIR, { recursive: true });

  for (const target of MODEL_TARGETS) {
    await downloadWithFallback(target, MODELS_DIR);
  }

  console.log('[WakeWord] All wake word ONNX models are in place.');
}

main().catch((err) => {
  console.error('[WakeWord] Fatal error downloading models:', err);
  process.exit(1);
});
