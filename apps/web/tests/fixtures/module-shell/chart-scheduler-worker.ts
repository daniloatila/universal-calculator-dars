import type { ChartJob } from './control';

let diagnostics: MessagePort | undefined;

self.onmessage = ({ data }: MessageEvent<{ diagnostics: MessagePort } | ChartJob>) => {
  if ('diagnostics' in data) {
    diagnostics = data.diagnostics;
    return;
  }

  diagnostics?.postMessage('started');
  if (data.behavior === 'hang') {
    // The worker stays alive and responsive to diagnostics without spinning the CPU or completing the request.
    self.setInterval(() => diagnostics?.postMessage('heartbeat'), 25);
    return;
  }

  self.postMessage(data.value);
};
