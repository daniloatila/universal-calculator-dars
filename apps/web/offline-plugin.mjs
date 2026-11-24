import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const workerName = "dars-worker.js";

export default function offlinePrecache() {
  let destination;
  return {
    name: "dars-offline-precache",
    apply: "build",
    configResolved(config) {
      destination = resolve(config.root, config.build.outDir);
    },
    writeBundle: {
      order: "post",
      async handler() {
        const entries = await readdir(destination, { recursive: true, withFileTypes: true });
        const files = entries
          .filter((entry) => entry.isFile() && entry.name !== workerName && !entry.name.endsWith(".map"))
          .map((entry) => join(entry.parentPath, entry.name).slice(destination.length + 1).replaceAll("\\", "/"))
          .sort();
        if (!files.includes("index.html") || !files.some((file) => file.endsWith(".wasm"))) {
          throw new Error("The offline build requires index.html and a WebAssembly asset.");
        }
        const deferredLocales = {};
        for (const file of files) {
          const locale = /^assets\/(pt-BR|zh-CN|hi|es|ar|fr)-[\w-]+\.js$/.exec(file)?.[1];
          if (locale) deferredLocales[locale] = file;
        }
        if (Object.keys(deferredLocales).length !== 6) {
          throw new Error("The offline build expects six separately loaded non-English locale chunks.");
        }
        const eagerFiles = files.filter((file) => !Object.values(deferredLocales).includes(file));
        const hash = createHash("sha256");
        for (const file of files) {
          const bytes = await readFile(join(destination, file));
          hash.update(file).update("\0").update(String(bytes.length)).update("\0").update(bytes);
        }
        const worker = `
const scope = self.registration.scope;
const cachePrefix = \`dars-static:\${scope}:\`;
const cacheName = cachePrefix + ${JSON.stringify(hash.digest("hex"))};
const indexUrl = new URL("index.html", scope).href;
const initialUrls = ${JSON.stringify(eagerFiles)}.map((path) => new URL(path, scope).href);
const localeFiles = ${JSON.stringify(deferredLocales)};
const localeUrls = new Set(Object.values(localeFiles).map((path) => new URL(path, scope).href));
const assetUrls = new Set([...initialUrls, ...localeUrls]);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll(initialUrls.map((url) => new Request(url, {cache: "reload", credentials: "same-origin"})));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const old = (await caches.keys()).filter((key) => key.startsWith(cachePrefix) && key !== cacheName);
    await Promise.all(old.map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const documentRequest = request.mode === "navigate" && (request.url === scope || request.url === indexUrl);
  if (!documentRequest && !assetUrls.has(request.url)) return;
  const key = documentRequest ? indexUrl : request;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(key);
    if (cached) return cached;
    const response = await fetch(request);
    if (localeUrls.has(request.url) && response.ok) {
      await cache.put(request, response.clone()).catch(() => undefined);
    }
    return response;
  })());
});

self.addEventListener("message", (event) => {
  const message = event.data;
  if (message?.type !== "dars-cache-locale" || !Object.hasOwn(localeFiles, message.locale)) return;
  const url = new URL(localeFiles[message.locale], scope).href;
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    if (!(await cache.match(url))) await cache.add(url);
  })());
});
`.trimStart();
        await writeFile(join(destination, workerName), worker);
      },
    },
  };
}
