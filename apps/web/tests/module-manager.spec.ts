import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import type { ModuleDescriptor, ModuleRuntime } from '../src/module-manager';

test('browser fixtures switch through the module manager and release workers, cache and canvas resources', async ({ page }, testInfo) => {
  const source = await readFile(new URL('../src/module-manager.ts', import.meta.url), 'utf8');
  const code = transpileModule(source, {
    compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ESNext },
  }).outputText;
  // Serve the real manager to a test-only page. Neither fixture is in the application bundle.
  await page.route('**/__dars-lifecycle-test/**', (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/manager.js')) {
      return route.fulfill({ contentType: 'text/javascript', body: code });
    }
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>DARS lifecycle test</title>' });
  });
  await page.goto('/__dars-lifecycle-test/');

  const run = await page.evaluate(async () => {
    const managerUrl = new URL('manager.js', location.href).href;
    const { createModuleManager } = await import(managerUrl) as typeof import('../src/module-manager');
    type State = { input: string };
    type Runtime = ModuleRuntime<State> & { input?: string };
    const loads: string[] = [];
    const messages: string[] = [];
    const postSwitchStates: Array<{ activeId: string | null; resourceCount: number }> = [];
    let overlappingPhases = false;
    let memoryBytes = 0;
    let terminated = 0;
    let cleared = 0;
    let graphicsReleased = 0;
    let workerStarted: Promise<void> | undefined;
    let graphicBackend: 'canvas-2d' | 'webgl' | null = null;
    const launch = (id: string, activate: Awaited<ReturnType<ModuleDescriptor<Runtime, State>['load']>>['activate']) => ({
      id,
      async load() {
        loads.push(id);
        return { activate };
      },
    });
    const manager = createModuleManager<Runtime, State>([
      launch('standard', ({ previousState }) => {
        const runtime: Runtime = {
          input: previousState?.input ?? '',
          snapshot: () => ({ input: runtime.input ?? '' }),
        };
        return runtime;
      }),
      launch('heavy', ({ resources }) => {
        const workerUrl = URL.createObjectURL(new Blob([
          "self.postMessage('started'); setTimeout(() => self.postMessage('completed'), 1000);",
        ], { type: 'text/javascript' }));
        resources.own('other', () => URL.revokeObjectURL(workerUrl));
        const worker = new Worker(workerUrl);
        resources.own('worker', () => { worker.terminate(); terminated++; });
        workerStarted = new Promise((resolve) => {
          worker.addEventListener('message', ({ data }) => {
            messages.push(String(data));
            if (data === 'started') resolve();
          });
        });

        const cache = new Map([['chunk', new Uint8Array(4 * 1024 * 1024).fill(127)]]);
        memoryBytes = cache.get('chunk')?.byteLength ?? 0;
        resources.own('cache', () => { cache.clear(); if (!cache.size) cleared++; });

        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        document.body.append(canvas);
        resources.own('other', () => canvas.remove());
        const gl = canvas.getContext('webgl', { antialias: false });
        if (gl) {
          const buffer = gl.createBuffer();
          if (!buffer) throw new Error('The fixture WebGL context could not allocate a buffer.');
          graphicBackend = 'webgl';
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 1]), gl.STATIC_DRAW);
          resources.own('graphics', () => {
            gl.deleteBuffer(buffer);
            if (!gl.isBuffer(buffer)) graphicsReleased++;
            gl.getExtension('WEBGL_lose_context')?.loseContext();
          });
        } else {
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('No graphics context in the fixture browser.');
          graphicBackend = 'canvas-2d';
          ctx.fillRect(0, 0, 256, 256);
          resources.own('graphics', () => {
            canvas.width = canvas.height = 0;
            if (canvas.width === 0 && canvas.height === 0) graphicsReleased++;
          });
        }
        return {};
      }),
    ]);
    const unsubscribe = manager.subscribe(() => {
      if (manager.getSnapshot().modules.filter(({ phase }) => phase === 'active').length > 1) overlappingPhases = true;
    });

    try {
      await manager.activate('standard');
      const eagerLoads = loads.slice();
      const standard = manager.getActive()?.instance;
      if (standard) standard.input = 'sqrt(2)%';
      for (let cycle = 0; cycle < 5; cycle++) {
        if (await manager.activate('heavy') !== 'active') throw new Error('Fixture did not activate.');
        await workerStarted;
        await manager.activate('standard');
        const snapshot = manager.getSnapshot();
        postSwitchStates.push({ activeId: snapshot.activeId, resourceCount: Object.values(snapshot.resources).reduce((a, b) => a + b, 0) });
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1_050));
      return {
        eagerLoads, heavyLoads: loads.filter((value) => value === 'heavy').length, graphicsReleased, graphicBackend,
        overlappingPhases, messages, terminated, cleared, memoryBytes, postSwitchStates,
        graphicsRemaining: document.querySelectorAll('canvas').length,
        recoveredInput: manager.getActive()?.instance.input,
      };
    } finally {
      unsubscribe();
      await manager.close();
    }
  });

  expect(run.eagerLoads).toEqual(['standard']);
  expect(run.heavyLoads).toBe(5);
  expect(run.graphicBackend).toMatch(/^(canvas-2d|webgl)$/);
  expect(run.graphicsReleased).toBe(5);
  expect(run.graphicsRemaining).toBe(0);
  expect(run.memoryBytes).toBe(4 * 1024 * 1024);
  expect(run.cleared).toBe(5);
  expect(run.terminated).toBe(5);
  expect(run.messages).toEqual(Array<string>(5).fill('started'));
  expect(run.recoveredInput).toBe('sqrt(2)%');
  expect(run.overlappingPhases).toBe(false);
  expect(run.postSwitchStates).toEqual(Array.from({ length: 5 }, () => ({ activeId: 'standard', resourceCount: 0 })));
  await testInfo.attach('lifecycle-resource-proof', {
    body: JSON.stringify(run),
    contentType: 'application/json',
  });
});
