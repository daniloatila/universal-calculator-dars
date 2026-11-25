# Objective 03 · Independent review and correction · DARS 0.3.1

[Português brasileiro](REPORT.pt-BR.md) · [Historical 0.3.0 report](../REPORT.md) · [Findings](findings.json) · [Reproduction](reproduction.md)

**Status** `READY_FOR_REVIEW` for 0.3.1 after the browser matrix, mapped regression, paired native measurements and exact-commit CI. The independent reviewer scored 0.3.0 **90/100** and left approval pending. Objectives 01 and 02 retain owner approval. Objective 04 remains `NOT_STARTED`.

## Confirmed behavior in 0.3.0

The archived Windows executable SHA-256 `8c2da09e07fa9e5a95bf3e068105b63a2e1e860582fb371dcc0bd4ace4db3d88` was verified against the integrated artifact ledger, then executed in WebView2 `158.0.4370.33`. Each case calculated once, changed language without edits and calculated again. The audited baseline source was `c3af4870b6fe781f1b7526995fcd3761791aeead`. Its preserved evidence head was `9e491d266b73e357046483aa8ff8aa45daf2103f`. [Artifact ledger](../assets.json) · [Windows observation](windows-baseline.json)

| Language change | Unchanged original input | First canonical input and result | Re-execution in 0.3.0 |
| --- | --- | --- | --- |
| English → Brazilian Portuguese | `log(8,2)` | `log(8,2)` gives exact `3` | `log(8.2)` gives approximate `0.91381385238371668972315074469267` |
| Brazilian Portuguese → English | `log(8;2)` | `log(8,2)` gives exact `3` | Same canonical input and exact result |
| Brazilian Portuguese → English | `log(8,2)` | `log(8.2)` gives approximate `0.91381385238371668972315074469267` | `log(8,2)` gives exact `3` |

Scientific stored the expression as text and took its decimal separator from the display locale at submission. The locale update kept the active module mounted. A comma changed roles from a function-argument separator to a decimal mark, or the reverse, before Rust received the request. The normalized expression in the record exposed the change. [Scientific runtime](../../../apps/web/src/tool-scientific-runtime.tsx) · [Application shell](../../../apps/web/src/app.tsx) · [Locale helpers](../../../apps/web/src/locale-format.ts)

All three corrected Chrome fixtures preserved their initial canonical expression, result, exactness and exported record after the language change and a new worker execution. English `log(8,2)` and Portuguese `log(8;2)` retained exact `3`. Portuguese `log(8,2)` retained the unary expression `log(8.2)` and its approximate result. [Scientific browser tests](../../../apps/web/tests/scientific.spec.ts) · [Browser results](browser.json)

## Correction across ten workspaces

Locale-sensitive edit fields retain their original text and the locale in which the draft was composed. The input adapter normalizes against that retained locale at the point of submission. A language change updates presentation, including existing result labels and formatting, while the request and work already pending keep their mathematical data. Module snapshots preserve the drafts during suspension and switching. A nonempty field continues to use its retained notation during editing. An origin hint identifies that notation when it differs from the current display language. Clearing the field establishes the current notation for the next input. Inserting a localized example starts a draft in the notation of that example.

| Workspace | Fields and grammar reviewed |
| --- | --- |
| Standard | The editor and undo/redo retain original notation. History and stored reference reuse keep their original expression context, typed bindings and canonical values. |
| Scientific | The expression retains decimal and argument-separator context, including the matching keypad. Working digits have an independent draft and an integer grammar. Angle, notation and real/complex choices are typed option IDs. |
| Algebra | Each operation retains its own expression draft. System, substitution and verification statement delimiters remain semicolons, including supported aliases. Variables and domain selection keep their meaning. |
| Calculus | Each operation retains its expression and separately typed bounds, expansion or approach point, and tolerance. Direction, variable, derivative order and terms use their fixed option values. The expression parser accepts unary functions. |
| Linear Algebra | Each matrix or vector cell and numerical tolerance retain notation independently. Matrix structure and operation choices stay separate from numbers. |
| Geometry | Dimensions and coordinates retain their notation. Coordinate rows preserve their boundary tokens. Measurement units and operation IDs remain canonical. |
| Discrete Mathematics | Integer and logical fields use their dedicated digit policies. Set boundaries and nonnumeric members keep their literal representation. |
| Programmer | Values and shifts use signed digits and the selected base. Word width, representation and bitwise operation IDs are stable across presentation changes. |
| Converter | Amount and manual exchange rate retain separate notation. Unit and currency IDs, source text and validity dates keep their own fields. |
| Date & Time | ISO tokens and zone IDs use their own wire grammar. Signed period values and supported digit forms normalize independently of decimal notation. Holiday, weekday and disambiguation data retain their meaning. |

The interface does not infer a second meaning when a draft is incomplete or invalid. It keeps the text in its original context and the grammar rejects invalid submissions. The report and test matrix verify this behavior on named fixtures. Mathematical engines remain the authority for values, precision and diagnostics. Localized presentation maps known explanations and labels. The original and canonical expressions, raw options and result in the record remain available for replay. [Calculation Proof contract](../calculation-proof/contract.md) · [Transition matrix](locale-transition-matrix.json)

The record format retains schema 1 and accepts existing records. New records can carry `expression_locale` when one locale describes the original expression. A matrix assembled from cells entered under multiple locales can keep just its original text and canonical replay fields. The export still has its original byte limit. Engine replay uses the canonical expression and options. [Revision schema](schema.v1.json) · [Historical schema](../calculation-proof/schema.v1.json)

## Validation and delivery

Installed Chrome `158.0.8127.38` passed **146/146** checks. All 42 directed language transitions covered the ten workspaces, with **420 before/after pairs and 840 computations**. The suite compares the complete worker request excluding its transport ID and the complete engine record. Separate scenarios hold a real request across a locale change, inspect exported records, preserve a suspended draft with warm offline catalogs, reset preferences, and check incomplete input and an ambiguous civil time. All five additional lifecycle checks and ten standalone offline checks passed. The first integrated browser run passed 144 of 146. The revision then restored Standard's supported `root` argument aliases and made test setup clear fields before typing a replacement in a different notation. [Browser results](browser.json) · [Transition matrix](locale-transition-matrix.json) · [Transition tests](../../../apps/web/tests/locale-transitions.spec.ts)

All 2,355 advanced independent cases, 305 advanced CLI/WASM pairs and 37 feature-isolation checks passed. Standard retained 157 independent CLI checks, 291 independent structured WASM checks, 20 CLI/WASM pairs and 9 calculation-record parity checks. The Rust suites passed 21 Standard and 68 Universal checks, and Node passed 69. LLVM line coverage was 726/733 (**99.05%**) for Standard and 10,189/10,495 (**97.08%**) for Universal. The default-member Clippy and lock audits passed with zero vulnerabilities reported and the prior advisory warnings retained. All **602 mapped checks** passed across local portable and Chrome runs, two native credential and five capability checks in hosted Windows, and 17 WebView2 interface checks on local Windows. [Regression map](regression.md) · [Test ledger](tests.json) · [Security](security.md)

The 0.3.1 local release build stopped when Windows blocked a generated Rust build helper `build_script_build.exe` at 14:25:17 local time. Code Integrity records 3077 and 3033 identified policy `VerifiedAndReputableDesktop`. Cargo returned OS error 4551. System protections and exclusions stayed intact. The exact hosted Windows job built the candidate and produced review artifact `15048137470`. The ZIP SHA-256, executable SHA-256 and source provenance were verified before execution. The unsigned executable has 13,646,848 bytes and SHA-256 `80ff0a020fd25a0c2ec8aebd19f84361297ea9d55cbc6f7d4b90d6f24168885a`. [Security](security.md) · [Artifact verification](windows-artifact.json) · [Reproduction](reproduction.md)

The verified candidate ran on the local Windows 11 system in WebView2 `158.0.4370.33`. All three Scientific cases retained their original text, canonical expression, origin label, result and engine version `0.3.1` after re-evaluation. English `log(8,2)` and Portuguese `log(8;2)` remained exact `3`. Portuguese `log(8,2)` retained `log(8.2)` and `0.91381385238371668972315074469267`. The local interface passed **17/17**, with three launch-to-first-checked-result samples of 568, 617 and 587 milliseconds. The optional hosted UI step produced no native observation files. These UI results come from the local execution of the verified hosted artifact. [Windows Scientific cases](windows-candidate.json) · [Windows UI checks](windows-ui.json) · [Hosted Rust checks](windows-rust.json)

Both the hosted desktop package and the local Chrome build contain ten WASM modules from the audited source. All ten file hashes differ between the build environments. The Windows and Chrome observations each use the integrity record for their own build. The Windows review executable and its source provenance were verified before launch. [Asset ledgers](assets.json) · [Windows artifact](windows-artifact.json)

After the local application and benchmark runs, the Windows readback at 14:46:40 showed Defender antivirus, real-time protection and tamper protection enabled. The queried log interval from 14:25:30 contained zero additional related 3077 events and zero selected Defender or ASR events. No `dars-desktop` process remained. [Security scope](security.md) · [Protection evidence](windows-protection.json)

Corrected source `2a8e0f5a174afe850f245b2ae4cc8e974119bf5d` was published and read back on the Objective 03 review branch. The exact run `45665744240` completed successfully on Linux, macOS and Windows and in the security job. The Windows job packaged the one-day review archive, completed release-mode full-workspace Clippy and ran the credential round trip. The historical 0.3.0 evidence remains intact. [Corrected source](https://github.com/daniloatila/universal-calculator-dars/commit/2a8e0f5a174afe850f245b2ae4cc8e974119bf5d) · [CI receipt](ci.json) · [Exact CI run](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45665744240) · [Acceptance](acceptance.json)

## Paired Windows measurements

Both executables ran the same Scientific workload on the local system with fresh WebView2 profiles. The stable spelling `log(8;2)` remained exact `3` through twelve English and Brazilian Portuguese switches per build. Each build closed all 14 observed Scientific workers. Peak concurrency was one and there were zero descendants after exiting. Each resource phase used six samples at approximately one-second intervals, with a single startup snapshot. [Paired benchmark](benchmarks.json)

| Observation in milliseconds | 0.3.0 | 0.3.1 |
| --- | ---: | ---: |
| Cold start to checked Standard result | 541.45 | 645.16 |
| First Scientific calculation | 109.97 | 112.85 |
| Locale switch p50 / p95 | 8.89 / 55.43 | 9.06 / 47.72 |
| Recalculation p50 / p95 | 51.91 / 61.26 | 52.89 / 66.65 |
| Scientific calculation after restore | 48.49 | 63.58 |

Standard visible median private resident memory was 103,063,552 → 104,267,776 bytes. During Scientific idle, private resident memory was 133,947,392 → 134,651,904 bytes, while private commit was 280,633,344 → 278,532,096 bytes. The restored phase showed a private commit increase of 61,120,512 bytes. The ledger records application and auxiliary process counters, summed shared working sets and system memory separately. The cold start has one sample per artifact. With twelve interactions, p95 and p99 select the same largest observation. These short observations cannot classify a long-duration trend or attribute shared pages. The basic desktop incremental RAM target stays open. [Benchmark ledger](benchmarks.json) · [0.3.0 memory evidence](../memory-debt.md) · [Approved protocol](../../objective-02/revision-02/memory-debt.md)
