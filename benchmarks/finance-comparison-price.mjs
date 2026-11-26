import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cpus } from "node:os";
import { performance } from "node:perf_hooks";
import { isMainThread, parentPort, Worker } from "node:worker_threads";
import assert from "node:assert/strict";

const moduleDir = new URL("../apps/web/src/tool-wasm/loans/", import.meta.url);
const currentWasm = new URL("dars_tool_wasm_bg.wasm", moduleDir);
const { version } = JSON.parse(await readFile(new URL("../apps/web/package.json", import.meta.url), "utf8"));
const timeoutMs = 15_000;
const samples = 2;
const principal = 100_000n;
const referenceRate = [1n, 100n];
const alternativeRate = [101n, 10_000n];
const number = (value) => Number(value.toFixed(3));

function wait(worker, timeout = timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { clear(); resolve(null); }, timeout);
    const message = (value) => { clear(); resolve(value); };
    const error = (failure) => { clear(); reject(failure); };
    const clear = () => {
      clearTimeout(timer);
      worker.off("message", message);
      worker.off("error", error);
    };
    worker.once("message", message);
    worker.once("error", error);
  });
}

function loan(periods, scope, rate) {
  return { operation: "price", input: JSON.stringify({
    principal: String(principal), rate, periods, rounding_scope: scope, start_date: "2026-01-31",
  }), options: { currency: "BRL" } };
}

function gcd(a, b) {
  while (b !== 0n) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}

function ratio(n, d) {
  const common = gcd(n, d);
  return [n / common, d / common];
}

function difference([n1, d1], [n2, d2]) {
  return ratio(n1 * d2 - n2 * d1, d1 * d2);
}

function decimal(text) {
  const unsigned = text.startsWith("-") ? text.slice(1) : text;
  const [whole, fraction = ""] = unsigned.split(".");
  return ratio(BigInt(whole + fraction) * (text.startsWith("-") ? -1n : 1n), 10n ** BigInt(fraction.length));
}

function round([n, d], places) {
  const scaled = (n < 0n ? -n : n) * 10n ** BigInt(places);
  const quotient = scaled / d;
  const twiceRemainder = (scaled % d) * 2n;
  const increment = twiceRemainder > d || (twiceRemainder === d && quotient % 2n === 1n);
  return ratio((n < 0n ? -1n : 1n) * (quotient + (increment ? 1n : 0n)), 10n ** BigInt(places));
}

function exactCost(periods, [rateN, rateD]) {
  const growthN = (rateD + rateN) ** BigInt(periods);
  const growthD = rateD ** BigInt(periods);
  const denomination = rateD * (growthN - growthD);
  const paid = principal * rateN * growthN * BigInt(periods);
  return ratio(paid - principal * denomination, denomination);
}

if (!isMainThread) {
  const begin = performance.now();
  const { default: initialize, evaluate_tool_json } = await import(new URL("dars_tool_wasm.js", moduleDir));
  await initialize({ module_or_path: await readFile(currentWasm) });
  parentPort.postMessage({ ready: true, initializationMs: number(performance.now() - begin) });
  parentPort.on("message", (request) => {
    const start = performance.now();
    const response = evaluate_tool_json(request);
    parentPort.postMessage({ response, engineMs: number(performance.now() - start) });
  });
} else {
  async function execute(request, validate) {
    const opening = performance.now();
    const worker = new Worker(new URL(import.meta.url));
    const trials = [];
    let setup;
    try {
      setup = await wait(worker);
      assert(setup?.ready, "loans WASM must initialize within the budget");
      setup = { initialization_ms: setup.initializationMs, ready_wall_ms: number(performance.now() - opening) };
      for (let index = 0; index < samples; index++) {
        const phase = index === 0 ? "first_request_after_setup" : "warm_worker";
        const start = performance.now();
        const response = wait(worker);
        worker.postMessage(request);
        const completion = await response;
        const wallMs = number(performance.now() - start);
        if (completion === null) {
          trials.push({ phase, request_wall_ms: wallMs, status: "timed_out" });
          break;
        }
        const reply = JSON.parse(completion.response);
        assert.equal(reply.ok, true, JSON.stringify(reply));
        assert.equal(reply.proof.engine_version, version);
        const verified = validate(JSON.parse(reply.proof.result));
        trials.push({
          phase, request_wall_ms: wallMs, engine_ms: completion.engineMs,
          result_bytes: Buffer.byteLength(reply.proof.result), status: "verified", ...verified,
        });
      }
    } finally {
      await worker.terminate();
    }
    return { ...setup, request_bytes: Buffer.byteLength(request), trials };
  }

  const results = [];
  const envelope = (operation) => JSON.stringify({ schema: 1, module: "loans", ...operation });
  for (const periods of [360, 600]) {
    for (const scope of ["per_row", "final"]) {
      const reference = loan(periods, scope, "0.01");
      const alternative = loan(periods, scope, "0.0101");
      const single = await execute(envelope(reference), (data) => {
        const summary = data.summary;
        assert.equal(summary.method, "price");
        assert.equal(summary.contract_periods, periods);
        assert.equal(summary.actual_periods, periods);
        assert.equal(summary.rounding_scope, scope);
        if (scope === "final") assert.deepEqual(decimal(summary.total_cost), round(exactCost(periods, referenceRate), 2));
        return { total_cost: summary.total_cost, periods: summary.actual_periods };
      });
      const comparison = await execute(envelope({
        operation: "scenario_compare",
        input: JSON.stringify({ reference, alternative, metric: "total_cost" }),
        options: {},
      }), (data) => {
        const selected = data.selected;
        assert.equal(selected.status, "direct");
        const singleCost = single.trials[0]?.total_cost;
        if (singleCost) assert.equal(selected.reference.presentation, singleCost);
        assert.equal(selected.reference.context.horizon, periods);
        assert.equal(selected.alternative.context.horizon, periods);
        const expected = scope === "final"
          ? difference(exactCost(periods, alternativeRate), exactCost(periods, referenceRate))
          : difference(decimal(selected.alternative.presentation), decimal(selected.reference.presentation));
        assert.deepEqual(
          decimal(selected.absolute_difference),
          round(expected, selected.precision_used.difference_decimal_places),
        );
        return {
          compatibility: selected.status, source: selected.precision_source,
          absolute_difference: selected.absolute_difference,
          exact_difference_omitted: selected.exact_difference_omitted,
        };
      });
      results.push({ periods, rounding_scope: scope, single, comparison });
      console.log(JSON.stringify({ periods, scope, single: single.trials, pair: comparison.trials }));
    }
  }
  const evidence = {
    schema: 1,
    observed_at_utc: new Date().toISOString(),
    version,
    module_sha256: createHash("sha256").update(await readFile(currentWasm)).digest("hex"),
    platform: process.platform, architecture: process.arch, node: process.version,
    processor: cpus()[0]?.model,
    timeout_ms: timeoutMs,
    scope: "Generated loans WASM under Node worker_threads. Module initialization is timed separately. First request after fresh-worker setup is not an operating-system cold start.",
    limitations: "Two samples per path on a single host. Excludes browser/WebView rendering and cannot establish a platform-wide latency guarantee.",
    results,
  };
  const defaultOutput = version === "0.4.1"
    ? "artifacts/objective-04/revision-01/price-benchmark.json"
    : `artifacts/${version}-price-benchmark.json`;
  const output = resolve(process.argv[2] ?? defaultOutput);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(evidence, null, 2) + "\n");
}
