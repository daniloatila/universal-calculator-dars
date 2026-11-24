/**
 * Cache public build assets only. The packaged Tauri app serves those assets
 * directly, and neither runtime persists calculation state in this cache.
 */
export function registerOffline(locale: string) {
  if (!import.meta.env.PROD || !window.isSecureContext || !("serviceWorker" in navigator)) return;
  if (!/^https?:$/.test(window.location.protocol) || window.location.hostname === "tauri.localhost") return;

  // Registration failures (for example, disabled site storage) do not affect calculations.
  void navigator.serviceWorker
    .register(new URL("./dars-worker.js", window.location.href), { updateViaCache: "none" })
    .then(() => navigator.serviceWorker.ready)
    .then(({ active }) => active?.postMessage({ type: "dars-cache-locale", locale }))
    .catch(() => undefined);
}
