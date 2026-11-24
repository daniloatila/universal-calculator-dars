import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import type { AdaptiveProfile } from '../src/adaptive';
import type { ModuleRuntime } from '../src/module-manager';

test('adaptive graphics policies change real canvas draw cadence and suspension stops drawing', async ({ page }, testInfo) => {
  const sources = new Map(await Promise.all(['adaptive', 'module-manager', 'module-frames'].map(async (name) => {
    const source = await readFile(new URL('../src/' + name + '.ts', import.meta.url), 'utf8');
    const { outputText } = transpileModule(source, {
      compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ESNext },
    });
    return [name + '.js', outputText] as const;
  })));
  await page.route('**/__dars-cadence-test/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const script = sources.get(path.split('/').at(-1) ?? '');
    return script === undefined
      ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>DARS cadence test</title>' })
      : route.fulfill({ contentType: 'text/javascript', body: script });
  });
  await page.goto('/__dars-cadence-test/');

  const result = await page.evaluate(async () => {
    const { createModuleFrames } = await import(new URL('module-frames.js', location.href).href) as typeof import('../src/module-frames');
    const { createModuleManager } = await import(new URL('module-manager.js', location.href).href) as typeof import('../src/module-manager');
    const { updateAdaptive } = await import(new URL('adaptive.js', location.href).href) as typeof import('../src/adaptive');
    const policy = (profile: AdaptiveProfile) => updateAdaptive(undefined, profile, {
      visible: true, runtime: 'web', gpuAvailable: true, graphicsApi: 'exposed', batteryApi: 'unavailable',
    }, performance.now()).policy;
    type Runtime = ModuleRuntime<undefined> & { frames: ReturnType<typeof createModuleFrames> };
    const draws: number[] = [];
    let animate = false;
    let renderedColor: number[] | undefined;
    const manager = createModuleManager<Runtime, undefined>([{
      id: 'canvas-fixture',
      async load() {
        return {
          activate(scope) {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 8;
            document.body.append(canvas);
            scope.resources.own('graphics', () => {
              canvas.width = canvas.height = 0;
              canvas.remove();
            });
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Canvas2D unavailable in this browser.');
            context.fillStyle = '#345678';
            const frames = createModuleFrames(scope, policy('ultra_light'), () => {
              context.fillRect(0, 0, 8, 8);
              draws.push(performance.now());
              renderedColor ??= Array.from(context.getImageData(0, 0, 1, 1).data);
              if (animate) frames.invalidate();
            });
            return { frames };
          },
        };
      },
    }]);
    const wait = (duration: number) => new Promise((resolve) => window.setTimeout(resolve, duration));

    try {
      await manager.activate('canvas-fixture');
      const frames = manager.getActive()?.instance.frames;
      if (!frames) throw new Error('Canvas fixture failed to activate');
      frames.setPolicy(policy('maximum'));
      for (let i = 0; i < 12; i++) frames.invalidate();
      await wait(150);
      const oneShotDraws = draws.length;

      animate = true;
      const windows = [];
      for (const profile of ['ultra_light', 'efficiency', 'maximum'] as const) {
        const startDraws = draws.length;
        const start = performance.now();
        const selected = policy(profile);
        frames.setPolicy(selected);
        frames.invalidate();
        await wait(650);
        windows.push({
          profile,
          requestedIntervalMs: selected.graphicsFrameIntervalMs,
          elapsedMs: performance.now() - start,
          draws: draws.length - startDraws,
        });
      }
      await manager.suspend();
      const atSuspension = draws.length;
      frames.invalidate();
      await wait(200);
      return {
        oneShotDraws, renderedColor, windows,
        drawsAfterSuspension: draws.length - atSuspension,
        phase: manager.getSnapshot().modules[0]?.phase,
        ownedGraphics: manager.getSnapshot().resources.graphics,
        canvases: document.querySelectorAll('canvas').length,
      };
    } finally {
      await manager.close();
    }
  });

  const [ultra, efficiency, maximum] = result.windows;
  expect(result.oneShotDraws).toBe(1);
  expect(result.renderedColor).toEqual([0x34, 0x56, 0x78, 255]);
  expect(ultra).toMatchObject({ profile: 'ultra_light', requestedIntervalMs: null, draws: 0 });
  expect(efficiency).toMatchObject({ profile: 'efficiency', requestedIntervalMs: 100 });
  expect(maximum).toMatchObject({ profile: 'maximum', requestedIntervalMs: 17 });
  expect(efficiency?.draws).toBeGreaterThan(0);
  expect(maximum?.draws).toBeGreaterThan(efficiency?.draws ?? Infinity);
  expect(result).toMatchObject({ drawsAfterSuspension: 0, phase: 'suspended', ownedGraphics: 0, canvases: 0 });
  await testInfo.attach('graphics-cadence-proof', { body: JSON.stringify(result), contentType: 'application/json' });
});
