import { spawn, execFileSync } from "node:child_process";
import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const bridge = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { chromium, expect } = bridge("@playwright/test");
const executable = fileURLToPath(new URL("../target/release/dars-desktop.exe", import.meta.url));
const artifactRoot = fileURLToPath(new URL("../artifacts/objective-01/", import.meta.url));
const evidenceRoot = new URL("../evidence/objective-01/", import.meta.url);
await mkdir(artifactRoot, { recursive: true });

async function debuggerEndpoint(profile, process) {
  const deadline = performance.now() + 15_000;
  while (performance.now() < deadline && process.exitCode === null) {
    try {
      const [port] = (await readFile(join(profile, "EBWebView", "DevToolsActivePort"), "utf8")).split(/\r?\n/);
      if (/^\d{1,5}$/.test(port) && Number(port) > 0) return `http://127.0.0.1:${port}`;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await delay(35);
  }
  throw new Error(`DARS did not expose its test-only WebView2 endpoint (process exit ${process.exitCode}).`);
}

function processTree(root) {
  if (!Number.isSafeInteger(root)) throw new Error("Expected a numeric process identifier");
  const script = `
$parent = ${root}
$full = @(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId)
$ids = [System.Collections.Generic.HashSet[int]]::new()
[void]$ids.Add($parent)
do {
    $before = $ids.Count
    foreach ($row in $full) {
        if ($ids.Contains([int]$row.ParentProcessId)) {
            [void]$ids.Add([int]$row.ProcessId)
        }
    }
} while ($ids.Count -ne $before)
@(Get-Process -Id @($ids) -ErrorAction SilentlyContinue |
    Select-Object @{n='pid';e={$_.Id}},@{n='cpu';e={$_.CPU}},@{n='rss';e={$_.WorkingSet64}}) |
    ConvertTo-Json -AsArray -Compress
`;
  const rows = JSON.parse(execFileSync("pwsh.exe", ["-NoProfile", "-Command", script], { encoding: "utf8", windowsHide: true }));
  assert(rows.some((row) => row.pid === root), "DARS must stay open during baseline sampling.");
  return rows;
}

async function checkDesktop(record) {
  const profile = await mkdtemp(join(artifactRoot, "webview-profile-"));
  const started = performance.now();
  const processHandle = spawn(executable, [], {
    cwd: artifactRoot,
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: profile,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=0",
    },
    stdio: "ignore",
  });
  let browser;
  try {
    const endpoint = await debuggerEndpoint(profile, processHandle);
    browser = await chromium.connectOverCDP(endpoint);
    const [context] = browser.contexts();
    assert(context);
    const page = context.pages()[0] ?? await context.waitForEvent("page", { timeout: 10_000 });
    await page.waitForURL((url) => url.hostname === "tauri.localhost" || url.protocol === "tauri:", { timeout: 10_000 });
    const external = new Set();
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.hostname !== "tauri.localhost" && url.protocol !== "tauri:") external.add(url.origin);
    });
    const expression = page.getByRole("textbox", { name: "Expression" });
    const result = page.getByTestId("result");
    await expression.fill("0.1+0.2", { timeout: 8_000 });
    const calculate = page.getByRole("button", { name: "Calculate", exact: true });
    await expect(calculate).toBeEnabled({ timeout: 8_000 });
    await calculate.click();
    await expect(result).toHaveText("0.3", { timeout: 8_000 });
    const launchToFirstResultMs = Math.round(performance.now() - started);
    if (!record) return { launchToFirstResultMs };

    await context.setOffline(true);
    await expression.fill("9*(1+2)");
    await expression.press("Enter");
    await expect(result).toHaveText("27");
    await expression.fill("1/0");
    await expression.press("Enter");
    await expect(page.getByText(/division by zero/i)).toBeVisible();
    await expression.fill("sqrt(81)+1/3");
    await expression.press("Enter");
    await expect(result).toHaveText("9.33333333333333333333333");
    assert.deepEqual([...external], []);
    await page.screenshot({ path: fileURLToPath(new URL("windows-x64.png", evidenceRoot)) });

    const initial = processTree(processHandle.pid);
    const idleStart = performance.now();
    await delay(2_500);
    const final = processTree(processHandle.pid);
    const intervalMs = performance.now() - idleStart;
    const previous = new Map(initial.map((row) => [row.pid, row.cpu]));
    const cpuSeconds = final.reduce((sum, row) => sum + Math.max(row.cpu - (previous.get(row.pid) ?? 0), 0), 0);
    const memory = final.reduce((sum, row) => sum + row.rss, 0);
    return {
      launchToFirstResultMs,
      idleSampleMs: Math.round(intervalMs),
      idleCpuOneCorePct: Number((cpuSeconds * 100_000 / intervalMs).toFixed(2)),
      desktopHostWorkingSetBytes: final.find((row) => row.pid === processHandle.pid).rss,
      totalProcessTreeWorkingSetBytes: memory,
      processTreeCount: final.length,
      passed: 5,
      failed: 0,
    };
  } finally {
    await browser?.close();
    if (processHandle.exitCode === null) {
      const closed = new Promise((resolve) => processHandle.once("exit", resolve));
      processHandle.kill();
      await closed;
    }
  }
}

const initial = await checkDesktop(true);
const repeated = [await checkDesktop(false), await checkDesktop(false)];
const results = {
  suite: "windows-x64-tauri-webview2",
  method: "Independent WebView2 profiles. Launch-to-first-result measured through the UI using a test-only CDP session. Sum of working sets can include shared pages. CDP offline mode was applied after startup.",
  ...initial,
  launchToFirstResultSamplesMs: [initial, ...repeated].map((sample) => sample.launchToFirstResultMs),
};
await writeFile(new URL("windows-x64.json", evidenceRoot), JSON.stringify(results, null, 2) + "\n");
console.log(JSON.stringify(results));
