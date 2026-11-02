/**
 * default heartbeat interval in milliseconds for background ticking
 */
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 250;

/**
 * allowable clock jitter in milliseconds to prevent delayed timer triggering
 */
export const TIMER_JITTER_TOLERANCE_MS = 50;

/**
 * inline Web Worker source code driving unthrottled timer pulses
 */
export const WORKER_HEARTBEAT_SCRIPT = `
let intervalId = null;
self.onmessage = function(e) {
  const data = e.data;
  const isStart = data === 'START' || (data && data.type === 'START');
  const isStop = data === 'STOP' || (data && data.type === 'STOP');
  if (isStart) {
    if (!intervalId) {
      const interval = (data && data.intervalMs) || 1000;
      intervalId = setInterval(function() {
        self.postMessage('TICK');
      }, interval);
    }
  } else if (isStop) {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
};
`;
