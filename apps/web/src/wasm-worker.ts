import init, { combine_values_json, evaluate_value_json } from './wasm/dars_wasm.js';
import type { Evaluation, EvaluationRequest, EvaluationResponse } from './engine';

function send(message: EvaluationResponse) {
  self.postMessage(message);
}

async function start() {
  try {
    await init();
    self.addEventListener('message', ({ data }: MessageEvent<EvaluationRequest>) => {
      try {
        const json = data.type === 'evaluate'
          ? evaluate_value_json(data.input, JSON.stringify(data.bindings))
          : combine_values_json(data.left, data.right, data.subtract);
        send({ type: 'result', id: data.id, result: JSON.parse(json) as Evaluation });
      } catch {
        send({ type: 'unavailable' });
      }
    });
    send({ type: 'ready' });
  } catch {
    send({ type: 'unavailable' });
  }
}

void start();
