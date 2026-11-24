import init, { evaluate_json } from './wasm/dars_wasm.js';
import type { Evaluation, EvaluationRequest, EvaluationResponse } from './engine';

function send(message: EvaluationResponse) {
  self.postMessage(message);
}

async function start() {
  try {
    await init();
    self.addEventListener('message', ({ data }: MessageEvent<EvaluationRequest>) => {
      let result: Evaluation;
      try {
        result = JSON.parse(evaluate_json(data.input)) as Evaluation;
      } catch {
        result = { ok: false, code: 'engine_unavailable' };
      }
      send({ type: 'result', id: data.id, result });
    });
    send({ type: 'ready' });
  } catch {
    send({ type: 'unavailable' });
  }
}

void start();
