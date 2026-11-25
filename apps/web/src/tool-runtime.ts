import { parseCalculationProof } from './calculation-proof';
import type { CalculationProof } from './calculation-proof';
import type { ModuleActivation } from './module-manager';
import { createModuleWork } from './module-work';

export type ToolRequest = {
  schema: 1;
  module: CalculationProof['module'];
  operation: string;
  input: string;
  original_input?: string;
  options: Readonly<Record<string, string | boolean | number>>;
};

type ToolReply = { ok: true; proof: CalculationProof } | { ok: false; code: string };

function decodeReply(value: unknown, request: ToolRequest): ToolReply {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid tool response');
  const record = value as Record<string, unknown>;
  if (record.ok === false && typeof record.code === 'string' && /^[a-z][a-z0-9_]{0,63}$/u.test(record.code)) {
    return { ok: false, code: record.code };
  }
  const proof = record.ok === true ? parseCalculationProof(record.proof) : null;
  if (!proof || proof.module !== request.module || proof.operation !== request.operation ||
      proof.expression !== (request.original_input ?? request.input)) throw new TypeError('Invalid tool proof');
  return { ok: true, proof };
}

export function activateTool<State>(scope: ModuleActivation<State>, createWorker: () => Worker) {
  const work = createModuleWork(scope.signal, { pendingJobs: 1 });

  return {
    submit(request: ToolRequest, signal: AbortSignal, timeoutMs = 15_000) {
      return work.submit({
        request,
        createWorker() {
          const worker = createWorker();
          worker.terminate = scope.resources.own('worker', worker.terminate.bind(worker));
          return worker;
        },
        decode: (value) => decodeReply(value, request),
      }, { kind: 'essential', signal, timeoutMs });
    },
    setPolicy: work.setPolicy,
    getResources() {
      const { active, queued } = work.getSnapshot();
      return { pending: active + queued };
    },
    dispose: work.close,
  };
}
