# Scientific · Stage verification

[Português brasileiro](verification.pt-BR.md) · [Mathematical and resource limits](limits.md) · [Calculation record contract](../calculation-proof/contract.md) · [Test ledger](tests.json)

These results cover the Scientific stage of Objective 03 and its interaction with Standard, the scheduler and local calculation records. Other modules and global acceptance are tracked in the [stage plan](../PLAN.md).

## Local checks

| Verification | Observed result |
| --- | --- |
| Rust tests for default workspace members | 25 passing cases across the Standard core and Scientific engine. |
| Web Node tests | 65 passed, 0 failed. |
| Installed Chrome on Windows | 34 passed, 0 failed, 0 skipped and 0 flaky. The suite includes Scientific, proof import/export, RTL, cancellation, adaptive behavior and Standard regression cases. |
| Web offline and lazy locales | 10 passed, 0 failed. The focused Scientific browser test also observed an empty Scientific request/cache set on launch and a checked result after explicit preparation and offline reload. |
| Scientific CLI and WASM parity | 19 passed, 0 failed. Checked responses use the same versioned calculation record contract. |
| Standard mathematical regressions | 157 independent rational and decimal cases, 20 CLI/WASM parity checks and 291 structured value cases passed. |
| Independent Scientific mathematical oracles | SymPy/mpmath passed 102 cases. The separate mpmath complex suite passed 75 cases, including principal branches and bounded rejections. |
| Line coverage | Standard core 613/620 (98.87%). Universal engine 1,795/1,873 (95.84%). The top-level Scientific module covered 978/1,023 lines (95.60%). Each count covers its own source scope. |
| Locked Windows release build and launch | Build completed. The normal release executable launched and completed the WebView2 run described below. |
| Local Clippy | The default workspace members passed. The workspace-wide run was blocked by Windows Smart App Control. The normal release build and runtime check completed under the existing security policy. |
| Dependency audit | npm audit passed. RustSec scanned 431 locked dependencies and found zero advisories classified as vulnerabilities. Two yanked-registry lookups timed out despite exit status 0. CI still needs to complete that part. |

RustSec reported the existing permitted warnings for `chrono` 0.4.45 (unmaintained), `proc-macro-error` 1.0.4 (unmaintained) and `glib` 0.18.5 (unsound).

The official sparse registry separately confirmed `yanked=false` and checksums matching the lockfile for all four new entries in this stage. They are `astro-float-num` 0.3.6, `either` 1.19.0, `itertools` 0.10.5 and `lazy_static` 1.5.1. [Cargo.lock](../../../Cargo.lock) · [astro-float-num registry entry](https://index.crates.io/as/tr/astro-float-num) · [either registry entry](https://index.crates.io/ei/th/either) · [itertools registry entry](https://index.crates.io/it/er/itertools) · [lazy_static registry entry](https://index.crates.io/la/zy/lazy_static)

Reproduce with the pinned Rust and Node toolchains from the repository root. On Windows, point `DARS_CHROME_EXECUTABLE` at installed Chrome for the standalone offline script if the packaged Playwright Chromium is unavailable. [Chrome tests](../../../apps/web/tests/scientific.spec.ts) · [Calculation record tests](../../../apps/web/tests/calculation-proof.spec.ts) · [CI job definition](../../../.github/workflows/ci.yml)

```powershell
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo build --locked --release -p dars-cli
node scripts/build-wasm.mjs
npm run build --prefix apps/web
npm test --prefix apps/web
$env:DARS_BROWSER_CHANNEL = 'chrome'
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
node tests/check-scientific-targets.mjs target/release/dars.exe
python -B tests/verify-scientific.py target/release/dars.exe
python -B tests/verify-scientific-complex.py target/release/dars.exe
cargo build --locked --release -p dars-desktop
node benchmarks/windows-scientific.mjs target/release/dars-desktop.exe
```

Install the mathematical oracle dependencies into a test environment from the [pinned requirements](../../../tests/math-oracle-requirements.txt). The coverage ledger combines instrumented Rust unit tests and native CLI oracle execution.

## WASM and interaction timing

The direct Node measure used initialized Scientific WASM, Rust request decoding and proof serialization. Across 120 measured interactions, after 10 warmups per expression, p50/p95/p99 were **0.115 / 0.996 / 1.320 ms**. The measured initialization was **15.30 ms**. The module artifact measured **678,019 bytes** and the observed WASM linear capacity was **1,179,648 bytes**. These boundaries exclude browser and worker overhead. [Parity and timing runner](../../../tests/check-scientific-targets.mjs)

The interactive Windows run took **564.21 ms** from process start to the checked Standard result and **32.99 ms** from selection to the visible Scientific panel. The checked sustained Scientific interactions had p50/p95/p99 of **54.81 / 109.44 / 109.77 ms** across 43 operations. The interaction metric includes filling and clicking through Playwright, worker creation, computation and observation of the checked DOM result. The run observed **49 dedicated Scientific workers opened and closed**. The window resumed with its Scientific expression intact, returned to the recorded Standard result, and left zero sampled processes after close. [Interactive Windows runner](../../../benchmarks/windows-scientific.mjs)

## Windows resources

The completed WebView2 run used a fresh profile, WebView2 **158.0.4370.33**, Windows **10.0.26200** and 20 logical processors. Six samples per phase covered approximately five seconds. Memory below is median across samples in MiB, shown as process tree / DARS host / WebView2 auxiliaries. CPU is the sampled process-tree rate relative to one logical CPU. Worker counts are end-of-phase observations.

| Phase | Private resident MiB | Private commit MiB | CPU | Workers |
| --- | ---: | ---: | ---: | ---: |
| Standard visible | 97.34 / 3.98 / 93.36 | 233.93 / 5.54 / 228.39 | 2.14% | 1 |
| Scientific workload | 118.61 / 4.19 / 114.43 | 258.58 / 6.34 / 252.24 | 50.82% | 0 |
| Scientific idle | 138.27 / 4.20 / 134.08 | 277.80 / 6.34 / 271.45 | 0.31% | 0 |
| Scientific minimized | 86.19 / 4.20 / 81.99 | 225.12 / 6.35 / 218.77 | 2.14% | 0 |
| Scientific restored | 99.76 / 4.20 / 95.55 | 327.64 / 6.34 / 321.30 | 0.00% | 0 |
| After close | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00% | 0 |

The workload phase still opened short-lived workers between sample endpoints. Private resident memory declined during minimization, while private commit increased after restoration and remained concentrated in the auxiliary processes. These observations come from one short run. The incremental **100 MB** target and longer-cycle retention remain open for the [memory-debt investigation](../../objective-02/revision-02/memory-debt.md). The earlier incomplete Windows attempt is excluded from the table.

The executable SHA-256 was `593beb96e92c8927631ba4c08c355984dc23984b629ee306fd6e6b1c417a7386`. The Scientific WASM SHA-256 was `49cebbb780ad371d0443a81d95f586118b5e22111ad3477f33495ebff6bda3ad`. The Windows screenshot SHA-256 was `c8f98425fed9035892d215971047b39d748ee9ca4b77004002ceb81bb4b7b8e7`. Visual inspection confirmed the navy Scientific controls and the exact result `10` for `log(1024,2)`, with the Calculation record section collapsed. [Measured phases](windows-benchmark.json) · [Windows capture](windows.png)
