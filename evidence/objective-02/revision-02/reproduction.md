# Reproduction · Scheduler recovery

[Revision report](REPORT.md) · [Revision 01 evidence](../revision-01/REPORT.md) · [Build prerequisites](../../../docs/en/build.md)

## Observe the 0.2.1 failure

Use a separate worktree of the published 0.2.1 delivery. The script exercises its original callback-based scheduler without a browser or changes to that tree. Node must support TypeScript stripping.

```powershell
git worktree add --detach ../dars-audit-021 579564f408e7208f992f8970899225bdaa7ae2ca
Push-Location ../dars-audit-021
@'
import { strict as assert } from 'node:assert';
import { createModuleWork } from './apps/web/src/module-work.ts';
const scope = new AbortController();
const scheduler = createModuleWork(scope.signal, { pendingJobs: 1 });
let successorStarts = 0;
let aborted = false;
const stuck = scheduler.submit((signal) => {
  signal.addEventListener('abort', () => { aborted = true; }, { once: true });
  return new Promise(() => {});
}, { kind: 'essential', timeoutMs: 50 });
const successor = scheduler.submit(async () => ++successorStarts, {
  kind: 'essential', timeoutMs: 160,
});
const observed = {
  stuck: (await stuck).status,
  successor: (await successor).status,
  successorStarts,
  aborted,
  queue: scheduler.getSnapshot(),
};
assert.equal(observed.stuck, 'timed_out');
assert.equal(observed.successor, 'timed_out');
assert.equal(observed.successorStarts, 0);
assert.equal(observed.aborted, true);
assert.equal(observed.queue.active, 1);
scope.abort();
console.log(JSON.stringify(observed));
'@ | node --experimental-strip-types --input-type=module -
Pop-Location
```

Both requests expire. The second starts zero times, and the abandoned callback continues to occupy the foreground slot despite the abort notification.

## Verify 0.2.2

In the revision worktree, install the locked dependencies and build the Rust/WASM and web targets as documented. The Node scheduler tests use controlled worker adapters that can deliver deliberately stale callbacks. The shell tests use actual browser Workers and the real App with its test-only descriptors. Set `DARS_BROWSER_CHANNEL=chrome` in the interactive Windows test environment or use the workflow's Playwright Chromium.

```powershell
node scripts/install-wasm-bindgen.mjs
npm ci --prefix apps/web --ignore-scripts
node scripts/build-wasm.mjs
npm run build --prefix apps/web
node --experimental-strip-types --test apps/web/tests/module-work.test.mts apps/web/tests/module-manager.test.mts
$env:DARS_BROWSER_CHANNEL = 'chrome'
npm exec --prefix apps/web -- playwright test -c apps/web/playwright.config.ts module-shell.spec.ts
```

Use the regression ledger for all reported suites. The native runners place the candidate's output in the revision 02 artifact directory.

```powershell
cargo build --locked --release -p dars-cli -p dars-desktop
node scripts/verify-desktop.mjs --objective-02-revision-02
node scripts/verify-native-capabilities.mjs target/release/dars-desktop.exe --objective-02-revision-02
```

The Windows runners use disposable WebView2 profiles and test-only loopback DevTools. The scheduler recovery sequence runs inside the browser fixture. The Windows production calculator exercises its existing Standard module and scoped capability provider. [Regression ledger](tests.json)
