import { spawn, execFileSync } from "node:child_process";
import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const bridge = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { chromium, expect } = bridge("@playwright/test");
const executableFlag = process.argv.indexOf("--exe");
const executable = executableFlag === -1
  ? fileURLToPath(new URL("../target/release/dars-desktop.exe", import.meta.url))
  : resolve(process.argv[executableFlag + 1]);
const localeRevision = process.argv.includes("--objective-03-revision-01");
const scienceReview = process.argv.includes("--objective-05");
const financeRevision = process.argv.includes("--objective-04-revision-01");
const financeReview = scienceReview || financeRevision || process.argv.includes("--objective-04");
const universalReview = financeReview || localeRevision || process.argv.includes("--objective-03");
const recoveryRevision = process.argv.includes("--objective-02-revision-02");
const operationalRevision = recoveryRevision || process.argv.includes("--objective-02-revision");
const operational = universalReview || operationalRevision || process.argv.includes("--objective-02");
const revised = operational || process.argv.includes("--revision-01");
const evidenceRoot = new URL(
  scienceReview ? "../artifacts/objective-05/desktop-regression/"
    : financeRevision ? "../artifacts/objective-04/revision-01/desktop-regression/"
    : financeReview ? "../artifacts/objective-04/desktop-regression/"
    : localeRevision ? "../artifacts/objective-03/revision-01/desktop-verification/"
    : universalReview ? "../artifacts/objective-03/integrated-platform/desktop-verification/"
    : recoveryRevision ? "../artifacts/objective-02/revision-02/desktop-verification/"
    : operationalRevision ? "../artifacts/objective-02/revision-01/desktop-verification/"
    : operational ? "../artifacts/objective-02/desktop-verification/"
    : revised ? "../artifacts/objective-01/revision-01/desktop-verification/" : "../artifacts/objective-01/desktop-verification/",
  import.meta.url,
);
const artifactRoot = fileURLToPath(evidenceRoot);
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
    if (revised) {
      await page.emulateMedia({ colorScheme: "light" });
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect(page.locator("body")).toHaveCSS("background-color", "rgb(10, 20, 39)");
    }
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
    if (revised) {
      await expression.fill("100");
      await page.getByRole("button", { name: "Store in memory", exact: true }).click();
      await expect(page.getByRole("button", { name: "Recall memory", exact: true })).toBeEnabled();
      await expression.fill("sqrt(2)%");
      const addToMemory = page.getByRole("button", { name: "Add to memory", exact: true });
      await addToMemory.click();
      await expect(addToMemory).toBeEnabled();
      await page.getByRole("button", { name: "Recall memory", exact: true }).click();
      await expect(expression).toHaveValue(/^@\d+$/);
      await calculate.click();
      await expect(result).toHaveText("100.014142135623730950488");
      await expect(page.locator("header .brand-mark rect")).toHaveCSS("fill", "rgb(141, 204, 255)");
      await writeFile(new URL("windows-memory.png", evidenceRoot), await page.screenshot(), { flush: true });
      await page.getByRole("button", { name: "Clear memory", exact: true }).click();
      await expect(page.getByRole("button", { name: "Recall memory", exact: true })).toBeDisabled();
      await expression.fill("200+10%");
      await calculate.click();
      await expect(result).toHaveText("220");
      assert.deepEqual([...external], []);
    }
    if (operational) {
      await page.getByText("Operations", { exact: true }).click();
      await expect(page.getByRole("heading", { name: "Privacy center" })).toBeVisible();
      await expect(page.getByText("Assets packaged on this device", { exact: true }).first()).toBeVisible();
      await page.getByText("Local diagnostics", { exact: true }).click();
      await expect(page.getByTestId("effective-profile")).toBeVisible();
      await writeFile(new URL("windows-operations.png", evidenceRoot), await page.screenshot({ fullPage: true }), { flush: true });
      assert.deepEqual([...external], []);
    }
    await writeFile(new URL("windows-x64.png", evidenceRoot), await page.screenshot(), { flush: true });

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
      passed: operational ? 17 : revised ? 13 : 5,
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
await writeFile(new URL("windows-x64.json", evidenceRoot), JSON.stringify(results, null, 2) + "\n", { flush: true });
console.log(JSON.stringify(results));
