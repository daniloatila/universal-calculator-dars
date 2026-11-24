# Reproducing the Objective 01 correction

[Review report](REPORT.md) · [Regression record](regression.md) · [Original 0.1.0 reproduction](../reproduction.md)

Use an independent repository checkout and start commands at its root. The final audited source is commit `460c2f05049acaa75da0035444150f5f4eaed801`. Rustup reads `rust-toolchain.toml`. The recorded build used Node.js 24.19.0 and Python 3. Windows desktop verification also needs PowerShell 7, the Microsoft C++ build tools, Windows SDK and WebView2. [Build prerequisites](../../../docs/en/build.md)

```powershell
git clone https://github.com/daniloatila/universal-calculator-dars.git
Set-Location universal-calculator-dars
git switch --detach 460c2f05049acaa75da0035444150f5f4eaed801
cargo install wasm-bindgen-cli --version 0.2.130 --locked
npm ci --prefix apps/web --ignore-scripts
node scripts/build-wasm.mjs
npm run build --prefix apps/web
cargo build --locked --release -p dars-cli
```

## Reproduce the original failure

In a separate checkout, use the original `ea26c7f9d4d870d1ee06a8b95f60854d0da059d3` and run the same build steps. Serve its production build with `npm run preview --prefix apps/web`. The recorded historical run used Chrome 158.0.8127.38 and checked the entry, worker and WASM files against the original artifact manifest. A rebuild in a different toolchain or environment may yield different hashes. [Original artifact manifest](../artifacts.json) · [Historical run](baseline-memory.json)

1. In English with a fresh calculator session, type `100` and press **MS**.
2. Replace the expression with `sqrt(2)%` and press **M+**. Wait for the memory operation to finish.
3. Press **MR** and Enter. In the original build the recall constructs `sqrt(2)%((100)+(sqrt(2)%))` and returns an invalid-expression error. Press **Clear all**, then **MR** and Enter. This time the recalled expression is `(100)+(sqrt(2)%)` and produces `101.414213562373095048802`.
4. In the corrected build, run the same sequence through the first press of Enter after **MR**. **MR** replaces the expression already used by **M+** with a session reference such as `@1`. Enter produces the approximate result `100.014142135623730950488`, which is `100 + sqrt(2)/100` rounded to 24 significant digits. Do a fresh calculation of `200+10%` and check for `220`. As an exact control, calculate `1/2` and continue with the keypad `+`, `2`, `=` to get `2.5`.

## Run the automated checks

After building WASM and the frontend, run the following in the corrected checkout. On Unix-like systems, use `target/release/dars` in the two commands that take a CLI path. The CLI exits with status `1` for `1/0` and emits `division_by_zero`. The commands for `0.1+0.2` and `1/3` exit with status `0`. The structured oracle runs the generated WASM exports in Node and derives expected values independently in Python.

```powershell
cargo fmt --all --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
python -B tests/oracle.py target/release/dars.exe
node tests/check-targets.mjs target/release/dars.exe
python -B crates/dars-core/tests/structured-oracle.py
npm test --prefix apps/web
npm exec --prefix apps/web -- playwright install chromium
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
```

The Playwright suite starts its own production preview on loopback port 4174. Shut down any manual preview on that port before running it. To reproduce with Google Chrome installed, set `DARS_BROWSER_CHANNEL` to `chrome` for the Playwright suite. `DARS_CHROME_EXECUTABLE` takes the installed Chrome executable path for the offline script. The offline script serves a production build under a subpath on a dedicated loopback port and cuts off network access in the browser context after the initial asset load. On Linux, the CI workflow installs Chromium with `--with-deps`. [Playwright configuration](../../../apps/web/playwright.config.ts) · [Offline test](../../../tests/verify-web-offline.mjs) · [CI workflow](../../../.github/workflows/ci.yml)

For a focused repeat of the five browser memory regressions and the worker timeout check, use `npm run test:e2e --prefix apps/web -- standard-revision.spec.ts worker.spec.ts`. See the regression record for expected results and the fault injection scope. [Regression record](regression.md)

## Repeat the language and theme checks

Open the production preview at 390 × 844 in a fresh desktop Chrome context for each of `en`, `pt-BR`, `zh-CN`, `hi`, `es`, `ar` and `fr`. Set the browser's preferred locale for each first visit or select it in Settings and reload. For each locale, check `html.lang`, the title and control labels, `0.1+0.2` with local digits and decimal mark, and the localized `1/0` error. In Arabic, the surrounding interface is right-to-left while the expression and keypad remain left-to-right. At this width, check for horizontal overflow. In an English context, select Arabic in Settings, reload and confirm that Arabic remains selected.

On two new profiles, emulate light and dark system schemes before opening the calculator. Each fresh profile opens in Dark with body background `rgb(10, 20, 39)`. Repeat with JavaScript disabled to verify the first paint. In Settings, choose each of **System**, **Light**, **Dark** and **OLED** and reload to check persistence. With Chrome emulating both light and dark system schemes, System follows the emulated scheme and the explicit themes keep their selected palettes. OLED has a `rgb(0, 0, 0)` base background. For reduced motion, emulate `prefers-reduced-motion: reduce`. Use a temporary element with a CSS transition, animation and smooth scrolling to verify the stylesheet suppresses the first two and sets `scroll-behavior` to `auto`. [Existing preference test](../../../apps/web/tests/standard.spec.ts) · [Production stylesheet](../../../apps/web/src/styles.css)

## Repeat the Windows desktop check

On Windows with WebView2 and the Vite production assets already built, run the following. The test starts the release executable on Windows with isolated temporary WebView2 profiles and a loopback test-only debugger connection. It verifies the navy Dark default with light media emulation and `0.1+0.2`, then verifies the inline brand mark, arithmetic, error handling, the corrected memory flow, **MC** and `200+10%` with the WebView2 context offline after startup. The JSON and app captures are written to `artifacts/objective-01/revision-01/desktop-verification/`. [Windows verification script](../../../scripts/verify-desktop.mjs)

```powershell
cargo build --locked --release -p dars-desktop
node scripts/verify-desktop.mjs --revision-01
```

For the performance methodology and extended Windows sampling, see [Benchmarks](benchmarks.json). The desktop verification script's short sample is part of the runtime smoke check.
