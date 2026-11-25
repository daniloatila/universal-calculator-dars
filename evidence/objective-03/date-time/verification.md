# Date & Time · Stage verification

[Português brasileiro](verification.pt-BR.md) · [Calendar models and limits](limits.md) · [Calculation record contract](../calculation-proof/contract.md) · [Stage plan](../PLAN.md) · [Test ledger](tests.json)

The verification covers all eight Date & Time operations, the isolated offline module, and regression checks for the Standard calculator and the eight previously delivered advanced tools.

## Verified locally

| Verification | Observed result |
| --- | --- |
| Independent references on the Windows CLI | 403 passed on the optimized and instrumented builds. The suite uses Python `datetime`, `calendar` and `zoneinfo`, with zone data loaded from `tzdata` 2026.6. It includes 143 structured rejections, 21 expected time-zone transition errors and eight replays with identical records. [Independent oracle](../../../tests/verify-date-time.py) |
| Date & Time CLI and WASM | 49 complete responses matched and eight module-isolation checks passed. [Parity runner](../../../tests/check-date-time-targets.mjs) |
| Rust tests for default workspace members | 84 passed across the Standard core (16) and Universal engine (68). [Test ledger](tests.json) |
| Web Node and installed Chrome on Windows | All 65 Node tests and 89 Chrome tests passed on the final distribution, including eight Date & Time browser tests. [Browser observations](browser.json) · [Browser capture](browser.png) |
| Offline and lazy loading | All 10 standalone checks passed. The scoped browser case loaded one isolated Date & Time module on demand and performed a time-zone conversion after an offline reload. [Offline runner](../../../tests/verify-web-offline.mjs) |
| Regression through Converter | The Standard core passed 157 independent cases, 20 CLI/WASM comparisons and 291 structured cases. Scientific through Converter passed 177, 184, 210, 223, 159, 289, 368 and 342 independent cases, respectively. Their CLI/WASM runs matched 19, 28, 27, 30, 32, 38, 36 and 46 complete records. [Test ledger](tests.json) |
| Line coverage | The merged LLVM report recorded 977/980 Date & Time lines (99.69%), 10,189/10,495 Universal engine lines (97.08%) and 613/620 Standard core lines (98.87%). [Test ledger](tests.json) |
| Locked Windows release | The optimized CLI ran the independent oracle. The native WebView2 run measured startup, Date & Time interactions, restoration and process teardown. [Windows measurements](windows-benchmark.json) |

The Windows oracle loads TZif resources directly from the pinned Python distribution, bypassing the operating system time-zone database. It derives civil dates, ISO weeks, and business-day counts independently, checks UTC instants with exact integer nanoseconds, and verifies replay of the original input and its options. Historical fixtures include the São Paulo corrections in IANA 2026f and the Havana transition rule for November 2026. The suite also covers Lord Howe's half-hour shift, Apia's missing calendar day and historical seconds in time-zone offsets. [Independent oracle](../../../tests/verify-date-time.py) · [IANA release 2026f](https://www.iana.org/time-zones/releases/2026f) · [Python zoneinfo documentation](https://docs.python.org/3/library/zoneinfo.html)

The browser scope exercises all eight operations, business-calendar settings, signed civil intervals, elapsed nanoseconds, distinct errors for repeated and skipped wall times, passive import of an exported calculation record, temporary drafts and worker cancellation. It covers seven languages, including Arabic RTL controls at 320 px, and verifies time-zone conversion after an offline reload. The record export and import case observed zero external requests. [Date & Time browser tests](../../../apps/web/tests/date-time.spec.ts)

The navy-theme browser capture shows the earlier `America/New_York` occurrence of `2024-11-03T01:30:00`, mapped to `2024-11-03T05:30:00Z` at source offset `-04:00`. The recorded IANA version `2026f` and format `rearguard` are visible beneath the result. The capture SHA-256 is `b820712c61e8772bb63def49ea7d4674d06fbc491fd2db38a2a8ed122dc98b45`. [Browser capture](browser.png)

## Representative checks

| Fixture | Observed result |
| --- | --- |
| `2024-02-28` through `2024-03-01` | Difference `2` civil days. Reversal gives `-2`. The equivalent 1900 interval contains one day under Gregorian century rules. |
| `2000-02-29` through `2023-02-28` | Age `23` years, `0` months, `0` days after clamping the anniversary. |
| `2024-01-31` plus one month | `2024-02-29` under `clamp`. The `reject` policy returns a domain error for the missing February 31. |
| `2021-01-01` | Friday, ordinal day `1`, week `53` of ISO week-year `2020`. |
| `2024-02-23` through `2024-03-01`, with Wednesday `2024-02-28` and Monday `2024-02-26` excluded | Three business days with default Monday to Friday weekdays. Reversal negates the count. |
| `2024-02-23` plus one business day, with Monday `2024-02-26` excluded | `2024-02-27`. A separate civil deadline adds one day to `2024-02-24` and returns `2024-02-25`. |
| `2024-11-03T01:30:00` in `America/New_York` | `05:30Z` with earlier resolution or `06:30Z` with later resolution. A skipped spring wall time returns `nonexistent_local_time` for every policy. |
| `1970-01-01T00:00:00Z` followed by `1969-12-31T23:59:59.999999999Z` | Exact signed duration `-0.000000001` seconds. |

The initial oracle comparison found two daylight-saving flag differences for Dublin between January and July. Pinned `tzdata` uses the IANA main representation, in which these fixtures have a winter adjustment of −1 hour and a summer adjustment of zero. The Jiff data bundle uses the IANA `rearguard` representation, with winter standard time and summer daylight saving. The final oracle checks the expected flags for each dated fixture against the published `rearguard` rules. The local times, UTC instants and offsets match the Python wheel independently in both directions between Dublin and London. The calculation record now reports the variant used for the flag. [IANA Dublin and EU rules](https://data.iana.org/time-zones/tzdb-2026f/europe) · [Jiff data bundle format](https://docs.rs/jiff-tzdb/1.0.0/jiff_tzdb/) · [Independent oracle](../../../tests/verify-date-time.py)

## Dependency and security checks

Date & Time uses Jiff `1.0.3` and `jiff-tzdb` `1.0.0` with bundled IANA 2026f data. The test-only Python `tzdata` wheel is pinned at `2026.6` with a SHA-256 hash. The date operations use explicit dates and settings. Named time zones use the bundled data offline, and custom business calendars use the supplied weekday and holiday rules. [Rust dependency configuration](../../../crates/dars-universal/Cargo.toml) · [Oracle requirements](../../../tests/math-oracle-requirements.txt) · [Calendar models and limits](limits.md)

The RustSec scan reported zero vulnerabilities across 443 locked entries and three previously recorded advisories for `chrono` (unmaintained), `proc-macro-error` (unmaintained) and `glib` (unsoundness). The lock retains `chrono` via the optional `serde_with` resolution. The selected `dars-desktop` tree across targets and the Date & Time WASM tree both exclude `chrono`. The CI definition includes the independent oracle and parity checks. [Test ledger](tests.json) · [CI definition](../../../.github/workflows/ci.yml)

## Direct WASM timing

The Node runner measured initialized Date & Time WASM, including Rust request decoding and calculation record serialization. Across 120 interactions after 10 warmups per expression, p50/p95/p99 were **0.0195 / 0.0383 / 0.0620 ms**. Initialization took **14.38 ms**. The WASM measured **556,597 bytes** with observed linear memory capacity of **1,441,792 bytes**. Browser scheduling, worker startup and DOM rendering fall outside this measure. The WASM SHA-256 was `4c81d033f8d451a3afdc907a19946fed731cc3bb7bb44adb60fd7b27244ccd5b`. [Parity and timing runner](../../../tests/check-date-time-targets.mjs) · [Test ledger](tests.json)

## Windows interaction and resources

The locked release ran on Windows `10.0.26200` with WebView2 `158.0.4370.33`. Startup to the checked Standard result took **604.56 ms**. Selecting Date & Time took **29.96 ms**. Across **39 sustained interactions**, p50/p95/p99 were **61.41 / 71.09 / 71.90 ms**. Each timed interaction included entering dates and options, running the worker and checking the DOM result. The workload covered Gregorian day differences, a clamped month addition, and a São Paulo to Kathmandu conversion that preserved the nanosecond in `2026-07-01T12:00:00.000000001`. The 13,606,912-byte executable had SHA-256 `cf18604382b8ad7fb0209134d9da07332c4bfe4fcc8af1f4f1dfecce096d8f6b`. [Windows runner](../../../benchmarks/windows-date-time.mjs) · [Measured phases](windows-benchmark.json)

All 45 opened workers closed. Win32 minimize and restore preserved the two date inputs and their checked result. Returning to Standard retained `0.3`. Zero descendants were observed 23.44 ms after host exit and across all six close samples. [Measured phases](windows-benchmark.json)

| Phase | Process tree private resident (MiB) | Process tree private commit (MiB) |
| --- | ---: | ---: |
| Standard visible | 102.08 | 238.03 |
| Date & Time load | 132.27 | 272.26 |
| Date & Time idle | 167.10 | 305.62 |
| Minimized | 93.58 | 266.39 |
| Restored | 109.90 | 302.88 |
| After close | 0.00 | 0.00 |

Each row reports the median of six samples collected about one second apart. Private resident memory fell during minimize. At the highest observed median private commit, in the idle phase, auxiliary processes accounted for 299.94 MiB. The open target of less than 100 MB incremental RAM in visible Standard mode and retention across longer cycles require separate evaluation. The desktop capture shows the exact two-day interval from `2024-02-28` to `2024-03-01` in the default navy theme. Its SHA-256 is `132d4ed4548558336562e1d77c050feb673d21c9499fee9044ea07eae72e92ac`. [Measured phases](windows-benchmark.json) · [Windows capture](windows.png) · [Memory debt and protocol](../../objective-02/revision-02/memory-debt.md)

## Reproduction

Use the pinned Rust and Node toolchains from the repository root. Install the test-only references in a separate environment. If Playwright Chromium is unavailable, set `DARS_CHROME_EXECUTABLE` to the installed browser executable for the standalone offline script. [Oracle requirements](../../../tests/math-oracle-requirements.txt)

```powershell
cargo fmt --all -- --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo build --locked --release -p dars-cli
node scripts/build-wasm.mjs
python -m venv .tooling/math-oracle-venv
$oraclePython = '.tooling/math-oracle-venv/Scripts/python.exe'
& $oraclePython -m pip install --only-binary=:all: --require-hashes -r tests/math-oracle-requirements.txt
& $oraclePython -B tests/verify-date-time.py target/release/dars.exe
node tests/check-date-time-targets.mjs target/release/dars.exe
npm run build --prefix apps/web
npm test --prefix apps/web
$env:DARS_BROWSER_CHANNEL = 'chrome'
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
cargo build --locked --release -p dars-desktop
node benchmarks/windows-date-time.mjs target/release/dars-desktop.exe
```
