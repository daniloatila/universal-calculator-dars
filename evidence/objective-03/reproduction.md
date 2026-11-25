# Objective 03 · Reproduction

[Português brasileiro](reproduction.pt-BR.md) · [Integrated report](REPORT.md) · [Regression map](regression.md) · [Test ledger](tests.json)

Run from the repository root at the source commit in the integrated ledger. Use Rust `1.100.0`, Node `24.19.0`, npm, and a supported x64 Python `3.12`–`3.14` for the full independent wheel set. Windows desktop verification needs an interactive Windows session, C++ build tools, Windows SDK, PowerShell 7 and WebView2. The hosted workflow provides the alternate Linux and macOS commands. [Rust toolchain](../../rust-toolchain.toml) · [Build prerequisites](../../docs/en/build.md) · [CI workflow](../../.github/workflows/ci.yml)

## Build and Standard checks

```powershell
cargo fmt --all --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
cargo build --locked --release -p dars-cli
node scripts/install-wasm-bindgen.mjs
node scripts/build-wasm.mjs
npm ci --prefix apps/web --ignore-scripts
npm run build --prefix apps/web
npm test --prefix apps/web
python -B tests/oracle.py target/release/dars.exe
python -B crates/dars-core/tests/structured-oracle.py
node tests/check-targets.mjs target/release/dars.exe
node tests/check-standard-record-targets.mjs target/release/dars.exe
```

The web build creates the exact local assets later embedded by Tauri. Rust tests default to the portable workspace members. Desktop tests run after the production web assets exist. On Unix, use `target/release/dars` without the `.exe` suffix. [Build script](../../scripts/build-wasm.mjs) · [Core verification](regression.md)

## Independent advanced references and parity

```powershell
python -m venv .tooling/math-oracle-venv
$oraclePython = '.tooling/math-oracle-venv/Scripts/python.exe'
& $oraclePython -m pip install --only-binary=:all: --require-hashes -r tests/math-oracle-requirements.txt -r tests/linear-algebra-oracle-requirements.txt
$cli = 'target/release/dars.exe'
$modules = 'scientific', 'algebra', 'calculus', 'linear-algebra', 'geometry', 'discrete-mathematics', 'programmer', 'converter', 'date-time'
foreach ($module in $modules) {
    & $oraclePython -B "tests/verify-$module.py" $cli
    if ($LASTEXITCODE) { throw "Independent reference failed for $module" }
    node "tests/check-$module-targets.mjs" $cli
    if ($LASTEXITCODE) { throw "CLI/WASM parity failed for $module" }
}
& $oraclePython -B tests/verify-scientific-complex.py $cli
```

Use a clean instrumentation target for coverage and collect the Rust suites and independent CLI invocations under one `cargo llvm-cov show-env --pwsh` environment. Use the instrumented CLI in the Python commands and export the merged `cargo llvm-cov report --json` after all instrumented runs. The ordinary build commands above leave independent references out of runtime assets. [Reference locks](../../tests/math-oracle-requirements.txt) · [Linear Algebra reference locks](../../tests/linear-algebra-oracle-requirements.txt) · [Coverage and counts](tests.json)

## Installed Chrome, offline, and Windows WebView2

```powershell
$env:DARS_BROWSER_CHANNEL = 'chrome'
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
cargo build --locked --release -p dars-desktop
cargo clippy --locked --workspace --release --all-targets -- -D warnings
cargo test --locked --release -p dars-desktop --lib -- --include-ignored
cargo test --locked --release -p dars-desktop --bin dars-desktop
node scripts/verify-desktop.mjs --objective-03
node scripts/verify-native-capabilities.mjs target/release/dars-desktop.exe --objective-02-revision-02
```

The production suite can also use Playwright Chromium. On a host without its browser binary, set `DARS_CHROME_EXECUTABLE` to the installed Chrome executable before the standalone offline script. The native UI suite uses the 0.2.2 assertions with the currently built executable. The credential test uses a synthetic entry and verifies its removal. The native capability runner tests actual WebView2 and Win32 adaptation. Full-workspace Clippy was verified locally in the release profile with Windows protections active. [Browser configuration](../../apps/web/playwright.config.ts) · [Windows baseline mapping](regression.md) · [Protection evidence](windows-protection.json)

The per-module Windows runners are linked from each stage report. They use temporary app profiles and record startup to a checked Standard result, activation, sustained checked interactions, worker closure, resource phases, restoration and teardown. For consistent timings, run samplers with a quiet host and keep benchmark commands sequential. Keep raw run output in ignored artifacts and publish sanitized evidence with its source and executable identity. [Windows sampling protocol](../../benchmarks/windows-desktop.md) · [Stage and benchmark index](REPORT.md#module-validation) · [Memory debt protocol](../objective-02/revision-02/memory-debt.md)

For the paired trial, use the archived 0.2.2 executable. Verify its SHA-256 `8c0ca0ee530edc836f1cfbaef646d015cd40b79a231f89a0bb3838d7a0d5d96e` before using it as the first argument. The current release build is the second argument. [Paired runner](../../benchmarks/windows-objective-03.mjs) · [Memory evidence](memory-debt.md)

```powershell
node benchmarks/windows-objective-03.mjs $approved022Exe target/release/dars-desktop.exe
```

## Supply chain

```powershell
npm audit --prefix apps/web --audit-level=high
cargo audit --deny yanked
```

Read the four results for the exact tested source commit in the integrated evidence. Native Windows launch, hosted compile/test, source scanning and dependency audit are separate observations. [Security scope](security.md) · [Compatibility matrix](compatibility.md)
