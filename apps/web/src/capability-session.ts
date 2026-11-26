import { createModuleWork } from './module-work';
import type { ModuleActivation } from './module-manager';
import type { AdaptivePolicy } from './adaptive';
import { validateCapability } from './capability-catalog';
import { parseCalculationProof } from './calculation-proof';
import type { CalculationProof } from './calculation-proof';
import type { ToolRequest } from './tool-runtime';
import { decodeDataLabOutput, decodeDataLabReply, validateDataLabInput } from './data-lab-contract';

const workers: Readonly<Record<string, () => Worker>> = {
  'standard': () => new Worker(new URL('./capability-standard-worker.ts', import.meta.url), { type: 'module' }),
  'linear_algebra': () => new Worker(new URL('./tool-linear-algebra-worker.ts', import.meta.url), { type: 'module' }),
  'discrete-mathematics': () => new Worker(new URL('./tool-discrete-worker.ts', import.meta.url), { type: 'module' }),
  'scientific': () => new Worker(new URL('./tool-scientific-worker.ts', import.meta.url), { type: 'module' }),
  'algebra': () => new Worker(new URL('./tool-algebra-worker.ts', import.meta.url), { type: 'module' }),
  'calculus': () => new Worker(new URL('./tool-calculus-worker.ts', import.meta.url), { type: 'module' }),
  'geometry': () => new Worker(new URL('./tool-geometry-worker.ts', import.meta.url), { type: 'module' }),
  'programmer': () => new Worker(new URL('./tool-programmer-worker.ts', import.meta.url), { type: 'module' }),
  'converter': () => new Worker(new URL('./tool-converter-worker.ts', import.meta.url), { type: 'module' }),
  'date-time': () => new Worker(new URL('./tool-date-time-worker.ts', import.meta.url), { type: 'module' }),
  'financial': () => new Worker(new URL('./tool-financial-worker.ts', import.meta.url), { type: 'module' }),
  'investment': () => new Worker(new URL('./tool-investment-worker.ts', import.meta.url), { type: 'module' }),
  'loans': () => new Worker(new URL('./tool-loans-worker.ts', import.meta.url), { type: 'module' }),
  'tax': () => new Worker(new URL('./tool-tax-worker.ts', import.meta.url), { type: 'module' }),
  'business': () => new Worker(new URL('./tool-business-worker.ts', import.meta.url), { type: 'module' }),
  'statistics': () => new Worker(new URL('./tool-statistics-worker.ts', import.meta.url), { type: 'module' }),
  'probability': () => new Worker(new URL('./tool-probability-worker.ts', import.meta.url), { type: 'module' }),
  'simulation': () => new Worker(new URL('./tool-simulation-worker.ts', import.meta.url), { type: 'module' }),
  'optimization': () => new Worker(new URL('./tool-optimization-worker.ts', import.meta.url), { type: 'module' }),
  'physics-engineering': () => new Worker(new URL('./tool-physics-engineering-worker.ts', import.meta.url), { type: 'module' }),
  'graph-lab': () => new Worker(new URL('./tool-graph-lab-worker.ts', import.meta.url), { type: 'module' })
};
// Shared across primary productivity workspaces and the auxiliary Intelligence panel.
let active = false;
function createSession(signal: AbortSignal, own?: (worker: Worker) => void) {
  const work = createModuleWork(signal, { pendingJobs: 1 });
  let ceiling = 32 * 1024 * 1024;
  let pending: AbortController | undefined;
  async function single<T>(requestSignal: AbortSignal | undefined, submit: (s: AbortSignal) => Promise<T>): Promise<T> {
    if (signal.aborted || requestSignal?.aborted) throw new Error('cancelled');
    if (active) throw new Error('queue_full');
    const controller = new AbortController();
    const stop = () => controller.abort();
    active = true;
    pending = controller;
    requestSignal?.addEventListener('abort', stop, { once: true });
    try { return await submit(controller.signal); }
    finally {
      active = false;
      pending = undefined;
      requestSignal?.removeEventListener('abort', stop);
    }
  }
  function owned(make: () => Worker) {
    const worker = make();
    own?.(worker);
    return worker;
  }
  async function run(request: ToolRequest, requestSignal?: AbortSignal): Promise<CalculationProof> {
    const c = validateCapability(request);
    const frozen = structuredClone(request);
    return single(requestSignal, async s => {
      const reply = await work.submit({
        request: frozen, createWorker: () => owned(workers[c.module]!),
        progress: c.module === 'simulation' ? { update() {}, watchdogMs: 15000 } : undefined,
        decode(raw: unknown) {
          if (!raw || typeof raw !== 'object') throw new Error('invalid_response');
          const r = raw as { ok?: boolean; proof?: unknown; code?: string };
          if (r.ok === false && typeof r.code === 'string') return { error: r.code } as const;
          const proof = r.ok === true && parseCalculationProof(r.proof);
          if (!proof || proof.module !== c.module || proof.operation !== c.operation || proof.algorithm_version!==c.algorithm ||
            proof.expression !== (c.module === 'standard' ? frozen.input : frozen.original_input ?? frozen.input))
            throw new Error('invalid_response');
          return { proof } as const;
        }
      }, { signal: s, timeoutMs: c.maximumTimeMs, kind: c.module === 'simulation' ? 'scientific' : 'interactive' });
      if (reply.status !== 'completed') throw new Error(reply.status);
      if (!reply.value.proof) throw new Error(reply.value.error);
      return reply.value.proof;
    });
  }
  async function dataset(file: Blob, config: Record<string, unknown>, allowance: number, requestSignal?: AbortSignal, offset = 0) {
    if (!(file instanceof Blob) || !Number.isSafeInteger(allowance) || allowance < 65536 || !Number.isSafeInteger(offset) || offset < 0)
      throw new Error('invalid_input');
    const budget = Math.min(ceiling, allowance);
    const settings = JSON.stringify({ ...config, resource_budget_bytes: budget });
    validateDataLabInput(file.size, settings, budget);
    return single(requestSignal, async s => {
      const reply = await work.submit({ request: { file, settings, budget, offset, includeResourceReceipt:true },
        createWorker: () => owned(() => new Worker(new URL('./data-lab-worker.ts', import.meta.url), {type:'module'})),
        progress:{update() {},watchdogMs:25000}, decode:decodeDataLabReply
      }, { signal:s, kind:'import', timeoutMs:45000 });
      if (reply.status !== 'completed') throw new Error(reply.status);
      if (!reply.value.ok) throw new Error(reply.value.code);
      const estimatedPeak=reply.value.estimatedPeak;
      if (!estimatedPeak || estimatedPeak > budget) throw new Error('invalid_response');
      return {...decodeDataLabOutput(reply.value),estimatedPeak};
    });
  }
  return { run, dataset, getBudget: () => ceiling,
    setPolicy(policy: AdaptivePolicy) {
      if (policy.dataLabResourceBudgetBytes < ceiling) pending?.abort();
      ceiling = policy.dataLabResourceBudgetBytes;
      work.setPolicy(policy);
    },
    getResources() { const state = work.getSnapshot(); return {pending:state.active + state.queued}; },
    dispose() { pending?.abort(); work.close(); }
  };
}
export type CapabilitySession = ReturnType<typeof createSession>;
export function createCapabilitySession<T>(scope: ModuleActivation<T>) {
  return createSession(scope.signal, worker => {
    worker.terminate = scope.resources.own('worker', worker.terminate.bind(worker));
  });
}
export function createDetachedCapabilitySession(signal: AbortSignal) { return createSession(signal); }
