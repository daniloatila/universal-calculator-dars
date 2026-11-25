# Objective 03 · Universal Mathematics · DARS 0.3.0

[Português brasileiro](REPORT.pt-BR.md) · [Acceptance](acceptance.json) · [Tests](tests.json) · [Benchmarks](benchmarks.json) · [Stage plan](PLAN.md)

**Audit state** `READY_FOR_REVIEW`. All nine implementation stages reached internal acceptance. The integrated source and measured artifacts are published at `c3af4870b6fe781f1b7526995fcd3761791aeead` on `codex/objective-03-universal-mathematics`. The same commit passed all four GitHub Actions jobs. [Audited source and evidence](https://github.com/daniloatila/universal-calculator-dars/commit/c3af4870b6fe781f1b7526995fcd3761791aeead) · [CI receipt](ci.json) · [Stage plan](PLAN.md)

The owner approved the `0.2.2` foundation at 95/100 and authorized Objective 03. DARS `0.3.0` integrates Standard and nine advanced workspaces using Rust as the calculation authority. The default workspace is Standard. The navy Dark theme, seven locales, five adaptive profiles, privacy controls and temporary module state continue through the existing shell. The advanced tools load and calculate on demand. [Owner approval](../objective-02/approval.json) · [Changes from 0.2.2](changes.md) · [Project state](../../PROJECT_STATE.md)

## Module validation

The independent stage suites exercised **2,355 advanced cases**. The stage parity runs matched **305 complete CLI/WASM responses**, with separate feature-isolation checks. Limits and reference material are recorded per module. The source column identifies the accepted implementation stage and its measurements. The integrated verification scope is recorded separately. [Integrated test ledger](tests.json)

| Module | Accepted stage source | Independent cases | Complete CLI/WASM pairs | Evidence |
| --- | --- | ---: | ---: | --- |
| Scientific | `efcf3e0` | 177 | 19 | [Verification](scientific/verification.md) · [Limits and references](scientific/limits.md) · [Native capture](scientific/windows.png) |
| Algebra | `6fda1e6` | 184 | 28 | [Verification](algebra/verification.md) · [Limits and references](algebra/limits.md) · [Browser capture](algebra/browser.png) |
| Calculus | `1c3a847` | 210 | 27 | [Verification](calculus/verification.md) · [Limits and references](calculus/limits.md) · [Browser capture](calculus/browser.png) |
| Linear Algebra | `a020118` | 223 | 30 | [Verification](linear-algebra/verification.md) · [Limits and references](linear-algebra/limits.md) · [Browser capture](linear-algebra/browser.png) |
| Geometry | `202d55a` | 159 | 32 | [Verification](geometry/verification.md) · [Limits and references](geometry/limits.md) · [Browser capture](geometry/browser.png) |
| Discrete Mathematics | `4fe9909` | 289 | 38 | [Verification](discrete-mathematics/verification.md) · [Limits and references](discrete-mathematics/limits.md) · [Browser capture](discrete-mathematics/browser.png) |
| Programmer | `1bfe150` | 368 | 36 | [Verification](programmer/verification.md) · [Limits and references](programmer/limits.md) · [Browser capture](programmer/browser.png) |
| Converter | `f0678d6` | 342 | 46 | [Verification](converter/verification.md) · [Limits and references](converter/limits.md) · [Browser capture](converter/browser.png) |
| Date & Time | `e104801` | 403 | 49 | [Verification](date-time/verification.md) · [Limits and references](date-time/limits.md) · [Browser capture](date-time/browser.png) |

Algebra retains restrictions such as `x != 0` after simplifying `x/x`. Calculus reports numerical quadrature diagnostics as estimates, and Linear Algebra reports observed residuals for its numerical decompositions. Discrete Mathematics distinguishes deterministic primality from probable results. Programmer defines bit behavior by word width. Converter keeps manual rate validity explicit, and Date & Time uses IANA `2026f` with an explicit repeated-time policy. The per-module limits describe accepted classes, singularities, approximation policies and structured failures. Converter's raw LLVM line count includes 37 uncovered lines in compile-time-only registry builders. Its stage coverage is 92.87% raw and 97.38% when only those lines are excluded. [Converter coverage rationale](converter/verification.md) · [Dependency and reference inventory](dependencies.md)

## Calculation records and regression

Calculation Proof is a versioned execution record with original and normalized input, current settings, domain, method, result and exactness. Precision, rounding, tolerance and error bounds are included where supported. Export and passive import stay local. Imported content is displayed as unverified. The record provides provenance and supports reproduction and independent verification. A formal proof requires its own premises and deductions. The Standard opt-in record path also preserves certified interval evidence and replay bindings within the portable limit. [Calculation record contract](calculation-proof/contract.md) · [Open schema](calculation-proof/schema.v1.json) · [Standard target checks](../../tests/check-standard-record-targets.mjs)

All **602** checks of the accepted `0.2.2` baseline passed across ten mapped suites. They include native Credential Manager and sensor tests, independent Standard oracles, desktop and web interaction and the scheduler successor regression. The integrated run passed **93 installed Chrome checks**, **66 Node checks**, **10 standalone offline checks**, and **89 default-member Rust tests**. This includes five additional Standard Rust record tests. The opt-in record also passed nine CLI/WASM comparisons and five replay checks. The merged LLVM report covered **726/733 Standard lines (99.05%)** and **10,189/10,495 Universal lines (97.08%)**. [602-check map](regression.md) · [Test ledger](tests.json) · [Browser results](browser.json)

The integrated browser exercise observed at most one calculation worker while switching through all ten modules and exercised all five profiles. The first-use offline Standard route loaded no advanced assets. The record exercise retained the original localized Brazilian Portuguese input and its stored interval binding. The Standard capture SHA-256 is `5c6def4e3893ad8bf14018e5672b3b39726a79197e7edb2cc49838d2f787d901`. [Browser results](browser.json) · [Standard calculation record capture](standard-proof.png)

## Resource behavior and memory debt

The nine individually measured Windows stage builds produced checked Standard results in **564.21–679.45 ms** and selected the new workspace in **23.89–36.81 ms**. Their different work scenarios produced native interaction medians of **49.06–87.58 ms**. Across those stage runs, **398 of 398** observed tool workers closed. The stage benchmarks record actual workloads, process roles, resource phases and artifact hashes. These figures describe distinct builds and scenarios. The initialized Node WASM timing excludes the workstation, worker startup and rendering costs measured by the native interaction scripts. [Benchmark ledger](benchmarks.json) · [Windows sampling method](../../benchmarks/windows-desktop.md)

The open basic desktop target is below **100,000,000 bytes** of incremental physical RAM. Private resident memory and private commit are separate process counters. WebView2 helper processes account for much of the observed process memory, and the short samples cannot identify allocation ownership or classify a long-duration trend. The extended pre-release protocol calls for matched ambient controls, fresh and warm profiles, at least 20 cycles per workload and a 30-minute cooldown. The debt remains open. [Current memory evidence](memory-debt.md) · [Prior baseline and extended protocol](../objective-02/revision-02/memory-debt.md)

The final executable passed all **17 native WebView2 interface checks**. Three measured launches reached a checked Standard result in **603, 576 and 634 ms**. In the separate paired Standard trial, 0.2.2 and 0.3.0 reached checked results in **578.14 and 572.29 ms**. Twelve checked interactions per build had p50 **30.77 and 31.32 ms**, with p95 and p99 **55.66 and 62.35 ms**, respectively. These are short observations under the same WebView2 build. [Native UI results](windows-ui.json) · [Paired Windows measurements](paired-windows.json)

The candidate's five mixed WebView2 cycles covered all five profiles. **31 of 31** observed workers closed, with peak one. Both paired builds left zero descendants. The native capture shows `46/2 = 23` retained with its calculation record after switching modules. Its SHA-256 is `6ee6a6420ade4b13de89760941eb8f51949504bc5a7e7cd7a2545e99b3bd0d41`. [Benchmarks](benchmarks.json) · [Native Standard record capture](standard-proof-windows.png)

The final production web build has **57 files, 5,721,499 bytes and 10 WASM modules**. Its Standard WASM SHA-256 is `3ab358a01d87af5478c3ee3acb849f66402ff5c386eb02eb048e1eef29ce9d55`. The Windows executable has **13,644,800 bytes**, SHA-256 `8c2da09e07fa9e5a95bf3e068105b63a2e1e860582fb371dcc0bd4ace4db3d88` and Authenticode status `NotSigned`. [Asset and executable manifest](assets.json) · [Compatibility](compatibility.md)

## Security, publication and review

Dependency scope, Code Integrity event 3077, local data handling, native capability limits and the RustSec warning inventory are recorded in the security report. Physical Windows and installed Chrome results cover interactive use. Hosted macOS evidence covers build and tests. The exact integrated Actions run passed Ubuntu, Windows, macOS and security. The source and evidence are delivered for independent review as a development version. [Security](security.md) · [Compatibility](compatibility.md) · [Reproduction](reproduction.md) · [Exact integrated Actions run](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45651132774)

Objectives 01 and 02 remain `APPROVED`. Objective 04 remains `NOT_STARTED`. The integrated acceptance ledger records Objective 03's review gate. [Acceptance](acceptance.json) · [Project roadmap](../../ROADMAP.md)
