import { parentPort } from 'node:worker_threads';

parentPort?.on('message', (message) => {
  if (message !== 'long-task') return;
  parentPort.postMessage('started');
  const gate = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(gate, 0, 0, 30_000);
  parentPort.postMessage('completed');
});
