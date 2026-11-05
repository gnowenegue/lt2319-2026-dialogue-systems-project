import * as ort from 'onnxruntime-web/wasm';
import {
  DEFAULT_COOLDOWN_MS,
  DEFAULT_DETECTION_THRESHOLD,
  EMBEDDING_DIMS,
  MEL_BINS,
  REQUIRED_EMBEDDING_FRAMES,
  REQUIRED_MEL_FRAMES,
  SCORE_LOG_THRESHOLD,
} from './constants';
import type { WakeWordWorkerInMessage, WakeWordWorkerOutMessage } from './types';

// configure onnxruntime-web execution environment in Web Worker
// use CDN for wasm binaries to bypass Vite worker dynamic module bundling restrictions
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/';
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

let melSession: ort.InferenceSession | null = null;
let embSession: ort.InferenceSession | null = null;
let wwSession: ort.InferenceSession | null = null;

let currentModelName = '';
let currentThreshold: number = DEFAULT_DETECTION_THRESHOLD;
let currentCooldownMs: number = DEFAULT_COOLDOWN_MS;
let lastTriggerTimestamp = 0;

// rolling buffer of mel spectrogram frames: [REQUIRED_MEL_FRAMES * MEL_BINS]
const totalMelCapacity = REQUIRED_MEL_FRAMES * MEL_BINS;
const melBuffer = new Float32Array(totalMelCapacity);
let accumulatedMelFrames = 0;

// rolling buffer of audio embeddings: [REQUIRED_EMBEDDING_FRAMES * EMBEDDING_DIMS]
const totalEmbCapacity = REQUIRED_EMBEDDING_FRAMES * EMBEDDING_DIMS;
const embBuffer = new Float32Array(totalEmbCapacity);
let accumulatedEmbFrames = 0;

/**
 * post typed message to main thread
 */
const postReply = (message: WakeWordWorkerOutMessage): void => {
  self.postMessage(message);
};

/**
 * loads all three ONNX models into memory
 */
const initSessions = async (
  modelsPath: string,
  modelName: string,
  threshold: number,
  cooldownMs?: number,
): Promise<void> => {
  currentModelName = modelName;
  currentThreshold = threshold;
  currentCooldownMs = cooldownMs ?? DEFAULT_COOLDOWN_MS;
  lastTriggerTimestamp = 0;

  // normalize models path for relative or absolute urls
  const baseUrl = modelsPath.endsWith('/') ? modelsPath : `${modelsPath}/`;
  const origin = typeof self !== 'undefined' && self.location?.origin ? self.location.origin : '';
  const resolvedBase = baseUrl.startsWith('http')
    ? baseUrl
    : `${origin}${baseUrl.startsWith('/') ? '' : '/'}${baseUrl}`;
  const melUrl = `${resolvedBase}melspectrogram.onnx`;
  const embUrl = `${resolvedBase}embedding_model.onnx`;
  const wwUrl = `${resolvedBase}${modelName}.onnx`;

  melSession = await ort.InferenceSession.create(melUrl, {
    executionProviders: ['wasm'],
  });

  embSession = await ort.InferenceSession.create(embUrl, {
    executionProviders: ['wasm'],
  });

  wwSession = await ort.InferenceSession.create(wwUrl, {
    executionProviders: ['wasm'],
  });

  // reset buffers
  melBuffer.fill(0);
  embBuffer.fill(0);
  accumulatedMelFrames = 0;
  accumulatedEmbFrames = 0;

  postReply({ type: 'READY' });
};

/**
 * processes a single 16 kHz 1,280-sample audio chunk through the 3-stage openWakeWord pipeline
 */
const processChunk = async (chunk: Int16Array): Promise<void> => {
  if (!melSession || !embSession || !wwSession) {
    return;
  }

  // stage 1: melspectrogram feature extraction
  // openWakeWord expects raw int16 magnitude values in Float32 format [-32768, 32767]
  const pcmFloats = new Float32Array(chunk.length);
  for (let i = 0; i < chunk.length; i++) {
    pcmFloats[i] = chunk[i];
  }

  const melInputTensor = new ort.Tensor('float32', pcmFloats, [1, chunk.length]);
  const melOutput = await melSession.run({
    [melSession.inputNames[0]]: melInputTensor,
  });

  const melData = melOutput[melSession.outputNames[0]].data as Float32Array;
  const newFramesCount = melData.length / MEL_BINS;

  // stage 2: apply openWakeWord scaling: (value / 10.0) + 2.0 and slide rolling mel buffer
  const scaledNewFrames = new Float32Array(melData.length);
  for (let i = 0; i < melData.length; i++) {
    scaledNewFrames[i] = melData[i] / 10.0 + 2.0;
  }

  // shift existing mel frames left to make room for new frames
  melBuffer.copyWithin(0, scaledNewFrames.length);
  melBuffer.set(scaledNewFrames, totalMelCapacity - scaledNewFrames.length);
  accumulatedMelFrames = Math.min(REQUIRED_MEL_FRAMES, accumulatedMelFrames + newFramesCount);

  // await full context before running embedding model
  if (accumulatedMelFrames < REQUIRED_MEL_FRAMES) {
    return;
  }

  // stage 3: generate 96-dim speech embedding from 76-frame mel window
  // input shape expected: [1, 76, 32, 1]
  const embInputTensor = new ort.Tensor('float32', melBuffer, [
    1,
    REQUIRED_MEL_FRAMES,
    MEL_BINS,
    1,
  ]);
  const embOutput = await embSession.run({
    [embSession.inputNames[0]]: embInputTensor,
  });

  const embVector = embOutput[embSession.outputNames[0]].data as Float32Array;

  // shift existing embeddings left and append new 96-dim vector
  embBuffer.copyWithin(0, EMBEDDING_DIMS);
  embBuffer.set(embVector, totalEmbCapacity - EMBEDDING_DIMS);
  accumulatedEmbFrames = Math.min(REQUIRED_EMBEDDING_FRAMES, accumulatedEmbFrames + 1);

  if (accumulatedEmbFrames < REQUIRED_EMBEDDING_FRAMES) {
    return;
  }

  // stage 4: evaluate wake word classifier head
  // input shape expected: [1, 16, 96]
  const wwInputTensor = new ort.Tensor('float32', embBuffer, [
    1,
    REQUIRED_EMBEDDING_FRAMES,
    EMBEDDING_DIMS,
  ]);
  const wwOutput = await wwSession.run({
    [wwSession.inputNames[0]]: wwInputTensor,
  });

  const rawScore = (wwOutput[wwSession.outputNames[0]].data as Float32Array)[0];
  const now = Date.now();
  const inCooldown = now - lastTriggerTimestamp < currentCooldownMs;

  // log near-miss and positive detections outside cooldown window to assist DevTools calibration
  if (!inCooldown && rawScore >= SCORE_LOG_THRESHOLD) {
    const isTrigger = rawScore >= currentThreshold;
    console.log(
      `[WakeWord] ${isTrigger ? '🎯 TRIGGER' : '👂 Heard'}: ${(rawScore * 100).toFixed(1)}% (threshold: ${(currentThreshold * 100).toFixed(0)}%)`,
    );
  }

  // emit detection event if confidence exceeds configured threshold and outside cooldown window
  if (!inCooldown && rawScore >= currentThreshold) {
    lastTriggerTimestamp = now;
    postReply({
      type: 'DETECTION',
      score: rawScore,
      modelName: currentModelName,
    });
  }
};

/**
 * worker message event listener
 */
self.onmessage = async (event: MessageEvent<WakeWordWorkerInMessage>): Promise<void> => {
  const msg = event.data;

  try {
    switch (msg.type) {
      case 'INIT': {
        await initSessions(msg.modelsPath, msg.modelName, msg.threshold, msg.cooldownMs);
        break;
      }
      case 'PROCESS_CHUNK': {
        await processChunk(msg.chunk);
        break;
      }
      case 'STOP': {
        melSession = null;
        embSession = null;
        wwSession = null;
        melBuffer.fill(0);
        embBuffer.fill(0);
        accumulatedMelFrames = 0;
        accumulatedEmbFrames = 0;
        lastTriggerTimestamp = 0;
        break;
      }
    }
  } catch (err) {
    const errorStr = err instanceof Error ? err.message : String(err);
    postReply({ type: 'ERROR', error: errorStr });
  }
};
