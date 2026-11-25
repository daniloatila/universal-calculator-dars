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
        const deferredAssets = new Set(Object.values(deferredLocales));
        for (const file of files) {
          // Modules use these chunk names for their lazy workspaces, workers and WASM.
          if (/^assets\/(?:tool-|calculation-proof-|dars_tool_wasm)/.test(file)) deferredAssets.add(file);
        }
        const eagerFiles = files.filter((file) => !deferredAssets.has(file));
        const hash = createHash("sha256");
        for (const file of files) {
          const bytes = await readFile(join(destination, file));
          hash.update(file).update("\0").update(String(bytes.length)).update("\0").update(bytes);
        }
        const worker = `
const scope = self.registration.scope;
const cachePrefix = \`dars-static:\${scope}:\`;
const cacheName = cachePrefix + ${JSON.stringify(hash.digest("hex"))};
const policyCache = \`dars-policy:\${scope}\`;
const offlineKey = new URL(".dars-local/offline", scope).href;
const indexUrl = new URL("index.html", scope).href;
const initialUrls = ${JSON.stringify(eagerFiles)}.map((path) => new URL(path, scope).href);
const localeFiles = ${JSON.stringify(deferredLocales)};
const deferredUrls = ${JSON.stringify([...deferredAssets])}.map((path) => new URL(path, scope).href);
const assetUrls = new Set([...initialUrls, ...deferredUrls]);
let offlineMode = caches.open(policyCache).then((cache) => cache.match(offlineKey)).then(Boolean).catch(() => false);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    if (await offlineMode) throw new Error("Static downloads are disabled by local policy.");
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
  const documentRequest = request.mode === "navigate" && (request.url === scope || request.url === indexUrl);
  if (request.method !== "GET" || (!documentRequest && !assetUrls.has(request.url))) {
    event.respondWith((async () => await offlineMode ? Response.error() : fetch(request))());
    return;
  }
  const key = documentRequest ? indexUrl : request;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    // This cache contains versioned, same-origin build files. Their bytes are independent of the browser's CORS Origin header.
    const cached = await cache.match(key, {ignoreVary: true});
    if (cached) return cached;
    if (await offlineMode) return Response.error();
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone()).catch(() => undefined);
    }
    return response;
  })());
});

self.addEventListener("message", (event) => {
  const message = event.data;
  if (message?.type === "dars-static-policy" && event.ports[0]) {
    const port = event.ports[0];
    const source = event.source;
    if (!source?.url?.startsWith(scope)) return;
    if (typeof message.offline === "boolean") {
      const before = offlineMode;
      offlineMode = before.then(async (prior) => {
        try {
          const cache = await caches.open(policyCache);
          if (message.offline) await cache.put(offlineKey, new Response("1"));
          else await cache.delete(offlineKey);
          const clients = await self.clients.matchAll({type: "window"});
          for (const client of clients) {
            if (client.url.startsWith(scope)) client.postMessage({type: "dars-static-policy", offline: message.offline});
          }
          return message.offline;
        } catch {
          return prior;
        }
      });
    }
    event.waitUntil(offlineMode.then((offline) => port.postMessage({offline})));
    return;
  }
  if (message?.type !== "dars-cache-locale" || !Object.hasOwn(localeFiles, message.locale)) return;
  const url = new URL(localeFiles[message.locale], scope).href;
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    if (!(await offlineMode) && !(await cache.match(url, {ignoreVary: true}))) await cache.add(url);
  })());
});
`.trimStart();
        await writeFile(join(destination, workerName), worker);
      },
    },
  };
}
