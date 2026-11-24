import { cpus, arch, platform, release } from "node:os";
import { performance } from "node:perf_hooks";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { strict as assert } from "node:assert";
import init, { evaluate_json } from "../apps/web/src/wasm/dars_wasm.js";

const wasmFile = new URL("../apps/web/src/wasm/dars_wasm_bg.wasm", import.meta.url);
const wasmBytes = await readFile(wasmFile);
const initialMemory = process.memoryUsage();
const coldStart = performance.now();
await init({ module_or_path: wasmBytes });
const engineInitMs = performance.now() - coldStart;

const expressions = ["0.1+0.2", "1/3", "(1+2)*3", "200+10%", "sqrt(2)", "root(100,3)"];
const warmup = 500;
const iterations = 2400;
const evaluation = (index) => evaluate_json(expressions[index % expressions.length]);
for (let index = 0; index < warmup; index += 1) evaluation(index);

const cpuStart = process.cpuUsage();
const wallStart = performance.now();
const samples = [];
for (let index = 0; index < iterations; index += 1) {
  const started = performance.now();
  const result = evaluation(index);
  samples.push(performance.now() - started);
  assert(result.startsWith('{"ok":true'));
}
const elapsed = performance.now() - wallStart;
const cpu = process.cpuUsage(cpuStart);
samples.sort((left, right) => left - right);
const quantile = (fraction) => Number(samples[Math.ceil(fraction * samples.length) - 1].toFixed(4));
const memory = process.memoryUsage();

const directory = fileURLToPath(new URL("../apps/web/dist/", import.meta.url));
const entries = await readdir(directory, { recursive: true, withFileTypes: true });
let distBytes = 0;
let gzipDistBytes = 0;
for (const entry of entries.filter((entry) => entry.isFile())) {
  const data = await readFile(join(entry.parentPath, entry.name));
  distBytes += data.length;
  gzipDistBytes += gzipSync(data).length;
}
const measuredFile = async (name) => {
  try {
    return (await stat(new URL(name, import.meta.url))).size;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};
console.log(JSON.stringify({
  suite: "objective-01-baseline",
  environment: { platform: platform(), osRelease: release(), arch: arch(), cpu: cpus()[0].model, logicalCores: cpus().length, node: process.version },
  method: "Node WebAssembly elapsed time includes evaluation and JSON serialization. Gzip bytes are the sum of per-file compressed sizes for the complete build. Process RSS includes Node.",
  webAssembly: {
    iterations,
    coldInitMs: Number(engineInitMs.toFixed(3)),
    medianMs: quantile(0.5),
    p95Ms: quantile(0.95),
    p99Ms: quantile(0.99),
    elapsedMs: Number(elapsed.toFixed(3)),
    userCpuUs: cpu.user,
    systemCpuUs: cpu.system,
    processRssBytes: memory.rss,
    processRssDeltaBytes: memory.rss - initialMemory.rss,
  },
  size: {
    wasmBytes: wasmBytes.length,
    distBytes,
    gzipDistBytes,
    cliWindowsBytes: await measuredFile("../target/release/dars.exe"),
    desktopWindowsBytes: await measuredFile("../target/release/dars-desktop.exe"),
  },
}, null, 2));
