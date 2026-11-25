import init, { combine_values_json, evaluate_value_json, evaluate_value_record_json } from './wasm/dars_wasm.js';
import { parseCalculationProof } from './calculation-proof';
import type { Evaluation, EvaluationRequest, EvaluationResponse } from './engine';

function send(message: EvaluationResponse) {
  self.postMessage(message);
}

function evaluate(request: EvaluationRequest): Evaluation {
  if (request.type === 'combine') {
    return JSON.parse(combine_values_json(request.left, request.right, request.subtract)) as Evaluation;
  }
  const { input, originalExpression } = request;
  const bindings = JSON.stringify(request.bindings);
  if (originalExpression === undefined) return JSON.parse(evaluate_value_json(input, bindings)) as Evaluation;

  const result = JSON.parse(evaluate_value_record_json(input, bindings)) as Evaluation;
  if (!result.ok) return result;
  const { proof: received, ...answer } = result;
  const proof = parseCalculationProof(received);
  if (!proof || proof.module !== 'standard' || proof.operation !== 'evaluate' ||
      proof.result !== (answer.exact ?? answer.approximate)) return answer;
  if (originalExpression === input) return { ...answer, proof };

  const withDisplay = parseCalculationProof({ ...proof, expression: originalExpression });
  if (withDisplay) return { ...answer, proof: withDisplay };
  const fallback = parseCalculationProof({
    ...proof, constraints: [...proof.constraints, 'Original display expression could not fit the portable text limits'],
  }) ?? proof;
  return { ...answer, proof: fallback };
}

async function start() {
  try {
    const { memory } = await init();
    self.addEventListener('message', ({ data }: MessageEvent<EvaluationRequest>) => {
      try {
        send({ type: 'result', id: data.id, result: evaluate(data), wasmBytes: memory.buffer.byteLength });
      } catch {
        send({ type: 'unavailable' });
      }
    });
    send({ type: 'ready', wasmBytes: memory.buffer.byteLength });
  } catch {
    send({ type: 'unavailable' });
  }
}

void start();
