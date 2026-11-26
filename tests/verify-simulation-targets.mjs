// Covers three isolated scientific WASM targets with the same native CLI requests.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';

assert(process.argv[2], 'Pass the native DARS CLI as the first argument.');
const cli = resolve(process.argv[2]);
const mk = (module, operation, recipe, options = {}, original_input) => JSON.stringify({
  schema: 1, module, operation, input: typeof recipe === 'string' ? recipe : JSON.stringify(recipe), options, original_input,
});

function native(request) {
  try {
    return execFileSync(cli, ['tool', request], { encoding: 'utf8', timeout: 10000 }).trim();
  } catch (error) {
    if (error.status !== 1) throw error;
    return error.stdout.trim();
  }
}

function numericalParity(wasm, cli, path) {
  if (typeof cli === 'number') {
    assert.equal(typeof wasm, 'number', path);
    const scale = Math.max(Math.abs(wasm), Math.abs(cli));
    const nearZero = path.includes('residuals.') || path.endsWith('.rss') || path.endsWith('.rmse')
      || path.endsWith('.residual_standard_error') || path.includes('.quantile.value');
    const margin = path.endsWith('.reciprocal_condition') ? 1e-14 : nearZero ? 2e-12 : 0;
    assert(Math.abs(wasm - cli) <= Math.max(margin, 2e-8 * scale), `${path}: ${wasm} vs ${cli}`);
  } else if (cli && typeof cli === 'object') {
    assert(wasm && typeof wasm === 'object', path);
    assert.equal(Array.isArray(wasm), Array.isArray(cli), path);
    assert.deepEqual(Object.keys(wasm), Object.keys(cli), path);
    for (const key of Object.keys(cli)) numericalParity(wasm[key], cli[key], `${path}.${key}`);
  } else {
    assert.equal(wasm, cli, path);
  }
}

function compare(source, target, request) {
  const a = JSON.parse(source);
  const b = JSON.parse(target);
  if (!b.ok) {
    assert.deepEqual(a, b, request);
    return 'exact';
  }
  assert.equal(a.ok, true, request);
  const { result: aValue, ...aProof } = a.proof;
  const { result: bValue, ...bProof } = b.proof;
  assert.deepEqual(aProof, bProof, request);
  if (aValue === bValue) return 'exact';
  numericalParity(JSON.parse(aValue), JSON.parse(bValue), b.proof.operation);
  return 'numeric';
}

const normal = { model: 'distribution', distribution: 'normal', parameters: { mean: '0', sd: '1.5' }, seed: '42', samples: 1201, threshold: 0 };
const finance = { model: 'finance', initial: 1000, contribution: 15, drift: '.01', volatility: '.09', steps: 22, samples: 420, seed: '18446744073709551615', risk_level: '.937', threshold: '1400' };
const walk = { model: 'random_walk', start: 12, drift: '.05', sd: '.3', steps: 36, seed: '18446744073709551614', samples: 1200, threshold: 12 };
const historical = { model: 'historical_risk', losses: [-10, -2, 0, 1, 3, 7, 7, 9, 10], risk_level: '.88', threshold: 6 };

const lawExamples = [
  ['bernoulli', { p: 0.4 }, 0], ['binomial', { n: 10, p: .5 }, 6],
  ['negative_binomial', { r: 3.2, p: .4 }, 7], ['geometric', { p: .6 }, 3],
  ['poisson', { lambda: 2.6 }, 2], ['hypergeometric', { population: 90, successes: 12, draws: 10 }, 4],
  ['discrete_uniform', { minimum: -5, maximum: 6 }, -1], ['uniform', { minimum: -3, maximum: 6 }, 2.4],
  ['normal', { mean: -0.1, sd: 1.3 }, .4], ['lognormal', { log_mean: .07, log_sd: .2 }, 1.4],
  ['exponential', { rate: .05 }, 31], ['gamma', { shape: 2, rate: .9 }, 1.9],
  ['beta', { alpha: 2.7, beta: 3.1 }, .38], ['weibull', { shape: 1.2, scale: 2.8 }, 1.4],
  ['student_t', { df: 6.2 }, -2.2], ['chi_squared', { df: 3.5 }, 1.7], ['fisher_f', { df1: 6.5, df2: 4.9 }, 2.6],
];
const values = [3, 6, 1, 9, 4, 4, 8, 11];
const sample = [1, 8, 0, 4, 5, 7, 6, 7];
const statistics = [
  ['descriptive', '{"values":[10000000000000004.1,"10000000000000004.2",10000000000000004.3],"percentiles":[0.25,0.5,0.75]}'],
  ['descriptive', { values: [1, 1, 2, 2, 4, 5, 6, 77], weights: [2, 3, 1, 2, 4, 6, 2, 1], percentiles: [0.1, 0.7] }, { quantile: 'type1', population: true, kurtosis: 'pearson' }],
  ['descriptive', { values: [1, 0, null, 4, 1, 3] }, { missing: 'omit' }],
  ['relationship', { x: values, y: sample }],
  ['relationship', { x: [0, 1, null, 4, 3], y: [5, 5, 12, 5, 5] }, { missing: 'omit' }],
  ['regression', { predictors: values.map((x, i) => [x, i ** 2]), response: sample }],
  ['regression', { predictors: values.map((x) => [x, x * 4]), response: sample }],
  ['regression', { predictors: values.map((_, i) => [`10000000000000000.${i + 1}`]), response: sample }],
  ['mean_test', { values, null_mean: '2.5', known_sd: '12.6' }],
  ['mean_test', { values, null_mean: '2.5' }, { alternative: 'less', alpha: '.01' }],
  ['difference_test', { x: values, y: sample, paired: true }],
  ['difference_test', { x: values, y: sample, paired: false }, { alternative: 'greater', alpha: '.02' }],
  ['proportion_test', { successes: 499800, trials: 1000000, p0: .5 }],
  ['chi_square', { observed: [18, 21, 11, 10], expected: [15, 15, 15, 15] }],
  ['chi_square_independence', { table: [[20, 14, 6], [10, 15, 30]] }],
  ['anova', { groups: [values, sample, [4, 9, 2, 7, 11, 6]] }],
  ['rank_test', { x: values, y: sample }],
  ['sign_test', { x: values, y: sample }],
  ['descriptive', { values: [null] }],
  ['regression', { predictors: [[1, 2]], response: [3] }],
].map(([operation, recipe, options]) => mk('statistics', operation, recipe, options));
const probability = lawExamples.flatMap(([distribution, parameters, x]) => [0.013, 0.5, 0.98].map(probability => mk('probability', 'distribution', {
  distribution, parameters, x, probability, lower: x, upper: x + 4, sample_count: 12, seed: '42', plot_points: 23,
})));
probability.push(mk('probability', 'distribution', { distribution: 'binomial', parameters: { n: 1000000, p: 0.5 }, x: 500000, probability: 0.5 }));
probability.push(mk('probability', 'distribution', { distribution: 'binomial', parameters: { n: 10, p: .5 }, probability: .623046875 }));
probability.push(mk('probability', 'distribution', { distribution: 'normal', parameters: { mean: 0, sd: 1 }, x: 12, lower: 12, upper: 14 }));
probability.push(mk('probability', 'events', { p_a: 0.3, p_b: 0.4, p_ab: 0.12 }));
probability.push(mk('probability', 'events', { p_a: 0.8, p_b: 0.9, p_ab: 0.12 }));
probability.push(mk('probability', 'distribution', { distribution: 'normal', parameters: { mean: 0, sd: -1 } }));
const simulationValid = [normal, finance, walk, historical,
  { ...historical, losses: Array.from({ length: 100 }, (_, i) => i + 1), risk_level: '0.560000000000000000000001' },
  { ...finance, initial: '1e100', contribution: 0, steps: 1, drift: '-1e-22', volatility: 0, shock: 0 },
  { ...normal, seed: '0', distribution: 'binomial', parameters: { n: 1200, p: '.1' } }, {
  ...normal, seed: '0', distribution: 'gamma', parameters: { shape: '.8', rate: '3.2' },
}].map(recipe => mk('simulation', 'monte_carlo', recipe));
const simulation = [
  ...simulationValid, mk('simulation', 'monte_carlo', { ...normal, samples: 100001 }),
  mk('simulation', 'monte_carlo', { ...walk, samples: 100000, steps: 1000 }), mk('simulation', 'monte_carlo', { ...normal, seed: '-5' }),
];

const spec = { statistics, probability, simulation };
const results = {};
for (const module of Object.keys(spec)) {
  const folder = new URL(`../apps/web/src/tool-wasm/${module}/`, import.meta.url);
  const { default: initialize, evaluate_tool_json: evaluate, SimulationTask } = await import(new URL('dars_tool_wasm.js', folder));
  const wasm = await readFile(new URL('dars_tool_wasm_bg.wasm', folder));
  const t0 = performance.now();
  const { memory } = await initialize({ module_or_path: wasm });
  const initializationMs = performance.now() - t0;
  const initialBytes = memory.buffer.byteLength;
  let exact = 0;
  let numeric = 0;
  for (const request of spec[module]) {
    if (compare(evaluate(request), native(request), request) === 'exact') exact++;
    else numeric++;
  }
  for (const other of Object.keys(spec).filter(name => name !== module)) {
    assert.deepEqual(JSON.parse(evaluate(spec[other][0])), { ok: false, code: 'unsupported' });
  }
  const chunks = [];
  if (module === 'simulation') {
    const entry = mk('simulation', 'monte_carlo', normal, {}, 'Original locale source notation');
    const isolated = mk('probability', 'distribution', { distribution: 'normal', parameters: { mean: 0, sd: 1 } });
    assert.throws(() => new SimulationTask(isolated), value => value === 'unsupported');
    const invalid = new SimulationTask(entry);
    assert.throws(() => invalid.step(0), value => value === 'limit');
    assert.throws(() => invalid.step(4097), value => value === 'limit');
    assert.throws(() => invalid.finish(), value => value === 'invalid_input');
    invalid.free();

    for (const request of [...simulationValid, entry]) {
      const expected = evaluate(request);
      for (const size of [1, 127, 2048, 4096]) {
        const run = new SimulationTask(request);
        try {
          const recipe = JSON.parse(JSON.parse(request).input);
          const total = recipe.samples ?? recipe.losses.length;
          let steps = 0;
          let done = false;
          let previous = 0;
          while (!done) {
            const progress = JSON.parse(run.step(size));
            assert.equal(progress.total, total);
            assert(progress.completed > previous && progress.completed <= Math.min(total, previous + size));
            assert.equal(progress.done, progress.completed === total);
            previous = progress.completed;
            done = progress.done;
            steps++;
          }
          const complete = run.finish();
          assert.equal(complete, expected, request);
          assert.throws(() => run.step(size), value => value === 'invalid_input');
          compare(complete, native(request), request);
          chunks.push({ model: recipe.model, distribution: recipe.distribution ?? null, batch: size, steps, total });
        } finally {
          run.free();
        }
      }
    }
    const transient = new SimulationTask(mk('simulation', 'monte_carlo', { ...normal, samples: 100000 }));
    assert.equal(JSON.parse(transient.step(2048)).done, false);
    transient.free();
    assert(JSON.parse(evaluate(entry)).ok);
  }

  const benchmarkRequest = module === 'simulation'
    ? mk('simulation', 'monte_carlo', { ...normal, samples: 100000 })
    : module === 'probability'
      ? mk('probability', 'distribution', { distribution: 'binomial', parameters: { n: 1000000, p: .5 }, x: 500000, probability: .937, plot_points: 80 })
      : mk('statistics', 'descriptive', { values: Array.from({ length: 512 }, (_, i) => (i % 199 - 99) / 10) });
  // The request envelope is 4 KiB, including decimal lexemes.
  assert(JSON.parse(benchmarkRequest).input.length <= 4096);
  const timings = [];
  for (let sample = 0; sample < 15; sample++) {
    const started = performance.now();
    const result = JSON.parse(evaluate(benchmarkRequest));
    const end = performance.now() - started;
    assert(result.ok, JSON.stringify(result));
    if (sample >= 3) timings.push(end);
  }
  timings.sort((a, b) => a - b);
  const p = fraction => timings[Math.ceil(fraction * timings.length) - 1];
  results[module] = { requestParities: exact + numeric, exact, numeric, isolationChecks: Object.keys(spec).length - 1, chunks,
    wasmBytes: wasm.byteLength, wasmSha256: createHash('sha256').update(wasm).digest('hex'), benchmark: {
      scope: 'Node, initialized release WASM, request to proof, 3 warmups discarded', initializationMs,
      initialLinearBytes: initialBytes, finalLinearBytes: memory.buffer.byteLength, measurements: timings.length, p50Ms: p(.5), p95Ms: p(.95),
    },
  };
}

const receipt = { suite: 'statistics-probability-simulation-target-parity', node: process.version, platform: process.platform, cliSha256: createHash('sha256').update(await readFile(cli)).digest('hex'), modules: results };
if (process.argv[3]) await writeFile(resolve(process.argv[3]), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
