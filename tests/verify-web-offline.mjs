import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { chromium, expect } = require("@playwright/test");
const dist = fileURLToPath(new URL("../apps/web/dist/", import.meta.url));
const prefix = "/dars-test/";
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};
let served = 0;
const requestedPaths = new Set();
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    if (!path.startsWith(prefix)) throw new Error("Outside test server scope");
    const name = decodeURIComponent(path.slice(prefix.length)) || "index.html";
    const file = resolve(dist, name);
    const member = relative(dist, file);
    if (member === ".." || member.startsWith(`..${sep}`) || resolve(dist, member) !== file) {
      throw new Error("Outside the static build");
    }
    const contents = await readFile(file);
    served += 1;
    requestedPaths.add(path);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    }).end(contents);
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  const executablePath = process.env.DARS_CHROME_EXECUTABLE;
  browser = await chromium.launch(executablePath ? { executablePath } : {});
  const context = await browser.newContext({ locale: "en-US" });
  const external = new Set();
  context.on("request", (request) => {
    if (!request.url().startsWith(`${origin}/`)) external.add(request.url());
  });
  await context.route("**/*", (route) => {
    if (route.request().url().startsWith(`${origin}/`)) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  await page.goto(`${origin}${prefix}`);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const otherLocales = /\/(pt-BR|zh-CN|hi|es|ar|fr)-[\w-]+\.js$/;
  assert(![...requestedPaths].some((path) => otherLocales.test(path)), "Unused translations stay unloaded.");
  const before = served;
  await context.setOffline(true);
  const response = await page.reload();
  assert(response?.fromServiceWorker(), "The offline navigation must come from the service worker.");
  const input = page.getByRole("textbox", { name: "Expression" });
  for (const [expression, expected] of [["0.1+0.2", "0.3"], ["12/4", "3"]]) {
    await input.fill(expression);
    await expect(page.getByRole("button", { name: "Calculate", exact: true })).toBeEnabled();
    await input.press("Enter");
    await expect(page.getByTestId("result")).toHaveText(expected);
  }
  assert.equal(served, before, "No successful static server request while offline.");

  await context.setOffline(false);
  await page.locator("summary").click();
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("pt-BR");
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await page.waitForFunction(async () => {
    const matches = (await caches.keys()).filter((key) => key.startsWith("dars-static:"));
    for (const key of matches) {
      const cache = await caches.open(key);
      if ((await cache.keys()).some((request) => /\/pt-BR-[\w-]+\.js$/.test(request.url))) return true;
    }
    return false;
  });
  assert.equal([...requestedPaths].filter((path) => otherLocales.test(path)).length, 1);
  await context.setOffline(true);
  const translated = await page.reload();
  assert(translated?.fromServiceWorker());
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  assert.deepEqual([...external], [], "No external page requests.");
  console.log(JSON.stringify({ suite: "production-web-offline-and-lazy-locales", passed: 10, failed: 0 }));
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
