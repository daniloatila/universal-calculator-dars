# Reproduce the Objective 04 checks

[Português brasileiro](reproduction.pt-BR.md) · [Project state](../../PROJECT_STATE.md)

Use the candidate source commit recorded in the acceptance ledger. Follow the project's locked Rust and Node build procedure. The test requests contain synthetic amounts and dates. [Build instructions](../../docs/en/build.md)

```console
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo build --locked --release -p dars-cli
node scripts/build-wasm.mjs
npm ci --prefix apps/web --ignore-scripts
npm run build --prefix apps/web
npm test --prefix apps/web
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
python -B tests/verify-financial-loans.py target/release/dars
python -B tests/verify-investment-business.py target/release/dars
python -B tests/verify-tax.py target/release/dars
node tests/check-finance-targets.mjs target/release/dars
```

Use `target/release/dars.exe` on Windows. On a machine with an installed Chrome channel, set `DARS_BROWSER_CHANNEL=chrome` for Playwright. The stand-alone offline check also supports `DARS_CHROME_EXECUTABLE`. The GitHub CI workflow selects the platform checks and installs the pinned oracle libraries in its temporary environment.

On Windows, verify the executable and packaged WASM hashes against the review artifact's provenance before running the desktop check. Use an independently verified 0.3.1 executable for the matched Standard measurements. Use the Windows production WebView2 runtime and a fresh profile per run. Keep profiles and console logs outside public evidence. [Windows memory protocol](../objective-02/revision-02/memory-debt.md)

For the double-IRR fixture, open Financial, choose Internal rates of return and load the example. Calculate and open the roots table. The two rates are 0.10 and 0.20, each with multiplicity one. Switch from English to Portuguese and calculate again. The visible digits and separators follow the locale while the Calculation Proof preserves each field's original notation and canonical payload.

For the pricing fixture, open Business, choose Pricing and load the example. The resulting price is 125 and the gross margin on revenue is 0.20. Change one assumption, run both scenarios and save them for comparison. The comparator shows the difference between the selected outcomes and omits a relative difference when the reference is zero.
