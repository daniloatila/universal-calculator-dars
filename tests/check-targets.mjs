import { execFileSync } from "node:child_process";
import { deepStrictEqual } from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import init, { evaluate_json } from "../apps/web/src/wasm/dars_wasm.js";

const wasm = new URL("../apps/web/src/wasm/dars_wasm_bg.wasm", import.meta.url);
await init({ module_or_path: await readFile(wasm) });
const cli = resolve(process.argv[2]);
const cases = [
  "0.1+0.2", "1/3", "1/0", "sqrt(-1)", "sqrt(2)", "sqrt(81)", "root(16, 4)",
  "2^3^2", "-2^2", "2^-3", "1 + @", "", "1.+2.", "200+10%", "200*10%",
  "400-(5+1)%", "123456789123456789/123456789", "0^0", "1e-8", "1001^0.5",
];
for (const expression of cases) {
  let native;
  try {
    native = execFileSync(cli, [expression], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    if (error.status !== 1) throw error;
    native = error.stdout;
  }
  const browser = evaluate_json(expression);
  deepStrictEqual(JSON.parse(browser), JSON.parse(native), expression);
}
console.log(JSON.stringify({ suite: "native-wasm-result-parity", passed: cases.length, failed: 0 }));
