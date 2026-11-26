# Reproducing Objective 06

Start from the audited source commit in acceptance.json. Use the pinned versions in the repository build guide and lockfiles. The standalone Formula Studio comparisons use the release CLI as well as the generated WASM. Install the Playwright Chromium build for hosted browser tests, or set DARS_BROWSER_CHANNEL to chrome for a separately installed Google Chrome. For the standalone offline suite set DARS_CHROME_EXECUTABLE to the installed Chrome binary or use its documented default.

```sh
cargo fmt --all --check
cargo test --locked
cargo build --release --locked -p dars-cli
node scripts/install-wasm-bindgen.mjs
node scripts/build-wasm.mjs
npm ci --prefix apps/web --ignore-scripts
npm run build --prefix apps/web
npm test --prefix apps/web
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
node scripts/verify-capability-session.mjs
node scripts/verify-automation-flows.mjs
```

On Windows, run the native release core tests including the isolated credential round trip. Use the artifact verifier and the paired scripts for actual WebView2 and memory testing. A local server fixture uses an ephemeral numeric loopback socket. It neither requires nor starts a model. Reading the installed service status uses the explicit inventory control in the packaged app. An actual provider with no listener should return a connection-refused diagnosis. [Windows method](integrated-audit/windows-method.md) · [Provider tests](intelligence/README.md)

The archived workflow runs the independent Python oracles, native/WASM comparisons, LLVM coverage and credential checks for the exact revision. For the historical browser ledger, run collect-browser.py snapshot with the SHA before running the suites. Save Node output as node.log, the Playwright report as playwright.json and the standalone offline output as offline.log under artifacts/objective-06/integrated-run. Run collect-browser.py collect with the same SHA. collect-source-ci.py takes the SHA and successful workflow run ID. collect-regression.py then combines the signed-off component counts with the physical Windows receipt. [CI workflow](../../.github/workflows/ci.yml) · [Regression collector](integrated-audit/collect-regression.py)

The Linux workflow uses Playwright’s chromium channel, which runs the full browser in headless mode. The earlier Headless Shell run reported page crashes in Intelligence tests. The full test set is retained. [Playwright browser configuration](https://playwright.dev/docs/browsers#chromium-new-headless-mode)
