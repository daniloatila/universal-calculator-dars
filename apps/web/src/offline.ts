/**
 * Cache public build assets only. The packaged Tauri app serves those assets
 * directly, and neither runtime persists calculation state in this cache.
 */
export function registerOffline(locale: string) {
  if (!import.meta.env.PROD || !window.isSecureContext || !("serviceWorker" in navigator)) return;
  if (!/^https?:$/.test(window.location.protocol) || window.location.hostname === "tauri.localhost") return;

  const workers = navigator.serviceWorker;
  // A cold page can finish loading a lazy workspace before its first worker claims the page.
  // Those requests used the browser cache, so the worker never saw them in a fetch event.
  const rememberFirstVisit = () => {
    const assets = new URL('./assets/', window.location.href).href;
    const claimedAt = performance.now();
    const reported = new Set<string>();
    const report = (entries: PerformanceEntry[]) => {
      const urls: string[] = [];
      for (const entry of entries) {
        const url = entry.name;
        if (reported.size >= 128) break;
        if (entry.startTime > claimedAt || !url.startsWith(assets) || url.includes('?') || url.includes('#') || reported.has(url)) continue;
        reported.add(url);
        urls.push(url);
      }
      if (urls.length) workers.controller?.postMessage({ type: 'dars-cache-visited', urls });
    };
    // A request started before control may finish later. Observe completions until the page
    // closes; requests started under control are already handled by the worker's fetch event.
    if (typeof PerformanceObserver !== 'undefined') {
      const observer = new PerformanceObserver(list => {
        report(list.getEntries());
        if (reported.size >= 128) observer.disconnect();
      });
      observer.observe({ entryTypes: ['resource'] });
      window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
    }
    report(performance.getEntriesByType('resource'));
  };
  if (!workers.controller) workers.addEventListener('controllerchange', rememberFirstVisit, { once: true });

  // Registration failures (for example, disabled site storage) do not affect calculations.
  void workers
    .register(new URL("./dars-worker.js", window.location.href), { updateViaCache: "none" })
    .then(() => navigator.serviceWorker.ready)
    .then(({ active }) => active?.postMessage({ type: "dars-cache-locale", locale }))
    .catch(() => workers.removeEventListener('controllerchange', rememberFirstVisit));
}

export type AssetMode = 'packaged' | 'unavailable' | 'online' | 'offline';

export function packagedAssets(): boolean {
  return window.location.hostname === 'tauri.localhost' || window.location.protocol === 'tauri:';
}

export async function getAssetMode(offline?: boolean): Promise<AssetMode> {
  if (packagedAssets()) return 'packaged';
  const worker = navigator.serviceWorker?.controller;
  if (!worker) return 'unavailable';

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => settle('unavailable'), 1500);
    function settle(mode: AssetMode) {
      window.clearTimeout(timeout);
      channel.port1.close();
      resolve(mode);
    }
    channel.port1.onmessage = ({ data }) => {
      settle(typeof data?.offline === 'boolean' ? (data.offline ? 'offline' : 'online') : 'unavailable');
    };
    try {
      worker.postMessage({ type: 'dars-static-policy', offline }, [channel.port2]);
    } catch {
      channel.port2.close();
      settle('unavailable');
    }
  });
}

export function observeAssetMode(onChange: (mode: AssetMode) => void): () => void {
  let disposed = false;
  let revision = 0;
  function refresh() {
    const id = ++revision;
    void getAssetMode().then((mode) => {
      if (!disposed && id === revision) onChange(mode);
    });
  }
  function receive({ data }: MessageEvent) {
    if (data?.type === 'dars-static-policy') refresh();
  }
  const workers = navigator.serviceWorker;
  workers?.addEventListener('controllerchange', refresh);
  workers?.addEventListener('message', receive);
  refresh();
  return () => {
    disposed = true;
    workers?.removeEventListener('controllerchange', refresh);
    workers?.removeEventListener('message', receive);
  };
}
