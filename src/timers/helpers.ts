import {
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  TIMER_JITTER_TOLERANCE_MS,
  WORKER_HEARTBEAT_SCRIPT,
} from './constants';
import type { HeartbeatController } from './types';

/**
 * calculates remaining seconds from target timestamp, clamped to zero
 */
export function calculateRemainingSeconds(
  targetTimestamp: number,
  now = Date.now(),
  toleranceMs = TIMER_JITTER_TOLERANCE_MS,
): number {
  const diff = targetTimestamp - now;
  if (diff <= toleranceMs) {
    return 0;
  }
  return Math.ceil(diff / 1000);
}

/**
 * creates an unthrottled heartbeat controller using Web Worker when available,
 * falling back to standard interval in Node.js test environments
 */
export function createHeartbeat(intervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS): HeartbeatController {
  const hasWorker =
    typeof window !== 'undefined' &&
    typeof window.Worker !== 'undefined' &&
    typeof window.Blob !== 'undefined';

  if (hasWorker) {
    let worker: Worker | null = null;
    let workerUrl: string | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let tickHandler: (() => void) | null = null;

    const WorkerConstructor = window.Worker;
    const BlobConstructor = window.Blob;
    const urlApi = typeof window.URL !== 'undefined' ? window.URL : URL;

    return {
      start(onTick: () => void) {
        if (worker || intervalId) return;
        tickHandler = onTick;

        try {
          const blob = new BlobConstructor([WORKER_HEARTBEAT_SCRIPT], {
            type: 'application/javascript',
          });
          workerUrl = urlApi.createObjectURL(blob);
          worker = new WorkerConstructor(workerUrl);

          // revoke blob URL now that worker is instantiated to prevent memory leaks
          urlApi.revokeObjectURL(workerUrl);
          workerUrl = null;

          worker.onmessage = () => {
            tickHandler?.();
          };
          worker.postMessage({ type: 'START', intervalMs });
        } catch {
          if (workerUrl) {
            urlApi.revokeObjectURL(workerUrl);
            workerUrl = null;
          }
          worker = null;
          // fallback to standard `setInterval` if Web Worker construction fails (e.g. CSP policies)
          intervalId = setInterval(onTick, intervalMs);
        }
      },
      stop() {
        if (worker) {
          worker.postMessage('STOP');
          worker.terminate();
          worker = null;
        }
        if (workerUrl) {
          urlApi.revokeObjectURL(workerUrl);
          workerUrl = null;
        }
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        tickHandler = null;
      },
    };
  }

  // fallback to standard `setInterval` in test runners or headless environments
  let intervalId: ReturnType<typeof setInterval> | null = null;
  return {
    start(onTick: () => void) {
      if (!intervalId) {
        intervalId = setInterval(onTick, intervalMs);
      }
    },
    stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
}
