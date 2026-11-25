# Objective 02 · Revision 01 · DARS 0.2.1

[Português brasileiro](REPORT.pt-BR.md) · [Historical 0.2.0 delivery](../REPORT.md) · [Objective 01 approval](../../objective-01/approval.json)

The owner reported an independent score of **88/100** for 0.2.0. This corrective revision targets the native capability adapter, performance and memory evidence, module lifecycle and scheduling. The original mission and the approved mathematical engine remain the reference. [Project state](../../../PROJECT_STATE.md) · [Acceptance ledger](acceptance.json)

## Changes demonstrated

- **Windows capability provider.** The packaged main WebView can read a bounded native snapshot with a fixed request. The Windows provider reports architecture, logical processors, available and total physical memory, memory pressure, system and host CPU, power, battery and actual window state. The CPU counters need two observations. The validated host used AC with a present battery. Thermal state and hardware GPU capability were unavailable. The user-initiated context probe successfully created a WebGL context. [Compatibility](compatibility.md) · [Security](security.md)
- **Automatic behavior.** Native Win32 minimization changed Auto from Balanced to Ultra Light, suspended Standard and left zero workers. WebView2 reported the requested LOW memory target. Restoration read back NORMAL, restored Balanced and reproduced the expected expansion of `1/3`. A bounded four-thread load changed mean measured system CPU by 2.76 percentage points. Three native readings took 76–117 µs and local IPC was approximately 0.7 ms. Simulated tests cover sustained CPU, memory, power, thermal and graphics conditions and recovery. [Measurements](benchmarks.json) · [Regression record](regression.md)
- **Operational shell.** Registered descriptors own presentation, state and optional resources. The real shell selected a text fixture and a chart fixture with a Worker, played through suspension, retry and termination, and cleared active and retained state. The manager bounds loading and activation to a shared fifteen-second deadline and disposes late runtimes. Standard remains the production module. [Module tests](module-shell.json) · [Regression record](regression.md)
- **Resource scheduling.** Essential and interactive operations have a protected foreground slot in every profile. Queues, deadlines and concurrency are bounded. Optional work has explicit lifecycle outcomes. Ultra Light can render demand-driven reduced-detail frames every 250 ms. Cancellation releases owned resources, and an operation that ignores abort keeps its physical slot until completion so deferred work cannot create unbounded concurrency. [Scheduling tests](../../../apps/web/tests/module-work.test.mts) · [Graphics test](../../../apps/web/tests/module-frames.spec.ts)
- **Math, privacy and appearance.** The baseline 576 checks were repeated by suite, with 18 additional tests and a separate packaged-app sensor scenario. Core coverage was 98.87% of lines and 95.69% of regions. The Windows UI passed 17 checks and the Credential Manager passed two. The seven locale packs and default Dark navy theme were kept. [Test ledger](tests.json) · [Security](security.md) · [Windows screenshot](windows-operations.png)

## Performance and retention

Six mirrored Windows runs checked 610 workload results and 234 native samples with all expected window states. Every version used the same ordered expression sequence and normal Playwright actions. The 19-second workload uses a time bound, so the number of checked expressions varies from 101 to 104 per run. The focused comparison uses the same fixed expression count. The 0.2.0 executable matched its recorded digest. The 0.1.1 executable was rebuilt from audited source with all 15 web files byte-matched to the approved build. Its native digest differs from the historical executable. [Artifact provenance and raw-scope aggregates](benchmarks.json) · [Matching protocol](../../../benchmarks/windows-audit-021.md)

| Version | External p50, ms | External p95, ms | External p99, ms | Startup to checked result, ms |
| --- | ---: | ---: | ---: | ---: |
| 0.1.1 rebuilt | 48.32–48.81 | 63.13–64.24 | 65.19–65.45 | 526.08–543.15 |
| 0.2.0 | 48.82–48.85 | 63.57–64.55 | 65.14–65.70 | 527.53–531.59 |
| 0.2.1 | 48.52–48.81 | 63.86–64.12 | 65.12–65.34 | 524.23–554.02 |

The ranges are the two per-run percentiles for each version. The historical 100-second workload reported external p50 of 31.88 ms and 48.87 ms across 0.1.1 and 0.2.0, with one timed workload per version. That 53.3% gap did not recur in the matched runs. The current 0.1.1 p50 was close to the historical 0.2.0 p50. The synthetic-click-to-checked-DOM p50 measured 0.6–0.8 ms across the six runs. The focus controls put ordinary locator clicks at 14.70–16.08 ms and forced clicks at 5.05–5.84 ms. In the full path the post-click result check alone took 25.24–27.08 ms at p50. These scopes show how actionability, protocol round trips and result observation affect the end-to-end measurement. The older observations lack the stage data to assign a share of the historical gap to a specific OS scheduler or WebView2 mechanism. [Historical comparison](../benchmarks.json) · [Measurement layers](benchmarks.json)

Rust typed parse, evaluation and display formatting measured 2.7 µs at p50 and 90.6 µs at p99. Serializing a precomputed response measured 0.1 µs and 2.1 µs respectively. The JS–WASM structured-call p50 was 3.6–4.4 µs across all versions. Dedicated worker dispatch to reply measured 2.4–3.1 ms at p50. The candidate's two observed worker starts took 26.9 and 39.1 ms, compared with 12.8–22.9 ms across the older runs. Each worker start represents one observation. Real 0.2.1 restore-to-recalled-result took 39.49 and 42.99 ms in the matched runs. The timing distributions, including higher quantiles and sample counts, are in the measurement ledger. [Timing evidence](benchmarks.json)

The same-renderer-clock supplement matched all 50 expected worker messages to the checked result per version. The interval from arrival to DOM includes result handling, React scheduling and commit. The next animation frame is a renderer marker with browser compositing and physical display presentation outside its scope. These markers use the same renderer clock. [Renderer probes](benchmarks.json)

| Version | Worker reply to checked DOM p50 / p95 / p99, ms | Checked DOM to next frame p50 / p95 / p99, ms |
| --- | ---: | ---: |
| 0.1.1 | 0.30 / 0.60 / 0.80 | 3.70 / 5.40 / 6.00 |
| 0.2.0 | 0.30 / 0.50 / 0.60 | 3.30 / 5.20 / 6.20 |
| 0.2.1 | 0.40 / 0.70 / 2.80 | 4.20 / 6.60 / 15.10 |

| Version | Private resident after load and idle, MiB | Private resident minimized, MiB | Private commit minimized, MiB |
| --- | ---: | ---: | ---: |
| 0.1.1 rebuilt | 139.08–143.89 | 143.80–148.46 | 315.98–319.03 |
| 0.2.0 | 138.93–138.98 | 138.61–139.09 | 299.27–358.35 |
| 0.2.1 | 141.73–142.14 | 79.50–80.87 | 229.19–229.68 |

These are ranges of phase medians for the whole process tree. The historical minimized private-commit increase of 32.09 MiB was concentrated in helper processes. The repeated 0.2.0 commit was variable. The 0.2.1 minimized host contributed 4.94–5.55 MiB of private commit, while helpers contributed 223.64–224.74 MiB. At the last minimized sample the process classified as GPU held 85.82–86.12 MiB of private commit in 0.2.1, down from 159.24–216.46 MiB in 0.2.0. This is process memory, with graphics allocations and WebView2 caching limited to the accounting available from the OS and CDP. The applied LOW hint and the lower minimized readings were observed together. Exact allocator attribution and an isolated effect size for the hint remain unavailable. Restored 0.2.1 commit returned to 318.54–320.70 MiB, with 101.46–101.70 MiB private resident. The matched runs therefore demonstrate a reduction during minimization. [Process tree and role counters](benchmarks.json) · [WebView2 memory target contract](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2_19?view=webview2-1.0.2849.39)

Four sustained cycles in a single process ran Ultra Light, Maximum, Maximum and Ultra Light for 600 checked calculations, each with at least 28 seconds of active work. The tree's private resident medians across those cycles were 132.82–139.46 MiB after visible idle and 82.00–91.11 MiB when minimized. Minimized private commit medians ranged from 252.42–376.20 MiB. Visible idle ended with one worker in Maximum and zero in Ultra Light, and every minimized cycle had zero. Active-work checkpoints reported 1.12–1.12 MiB of WASM linear capacity and 5.79–6.95 MiB of used renderer JavaScript heap across 4 of four checkpoints. Restore recalled and calculated the same saved value in 45.25–80.80 ms. After close there were zero remaining descendants. The two Ultra Light idle medians were 139.46 and 132.82 MiB. The two Maximum idle medians were 136.59 and 137.15 MiB. These pairs describe retention over the measured interval. [Sustained cycle results](benchmarks.json)

Minimized private commit grew across the four sustained cycles from 252.42 to 307.36, 308.43 and 376.20 MiB, while the host remained within 4.84–6.21 MiB. The growth was in WebView2 helpers. The last two Ultra Light idle snapshots bracketed a decrease in private resident memory even with the later rise in commit. The historical 0.2.0 run under the same cycle protocol ended at 381.73 MiB of minimized commit and 148.67 MiB of minimized private resident memory, versus 376.20 and 91.11 MiB on 0.2.1. The two sustained runs were conducted in separate sessions. The figures show that reduced resident memory on minimization can coexist with committed memory retained during reuse. Allocation ownership within WebView2 and longer-term growth remain unmeasured. [Historical cycles](../benchmarks.json) · [Current cycles](benchmarks.json)

The 24 November sustained attempt was interrupted at the owner’s pause. The second cycle had one of five samples minimized before the native window became visible again, ahead of the scheduled restore. Its samples are excluded from the qualified 25 November repetition. [Attempt status and cycle evidence](benchmarks.json)

Visible basic-mode incremental RAM below 100 MB remains an engineering target. The 0.2.1 settle phase measured 100.88–100.93 MiB of process-tree private resident memory after the first result. System-wide RAM changes include other workloads. JavaScript heap and WASM linear capacity cover different, potentially overlapping scopes. Application-owned caches and workers are constrained by profile and released on suspension. WebView2 manages its own caches and allocator, and the revision uses its advisory memory target with NORMAL restored on return. [Memory method](reproduction.md) · [Runtime and process limits](compatibility.md)

## Operational scope

A future built-in module can register its state, optional graphics and work policy using the same shell, manager and privacy controls. Modules continue to share the WebView's trusted application boundary. The two fixture modules cover heterogeneous implementations. Resource budgets, snapshot sizes and interaction patterns still need evidence as real modules are added. Physical platform evidence is Windows x64. Cross-platform CI and browser checks have the scope recorded separately. [Compatibility](compatibility.md) · [Reproduction](reproduction.md)

**State** `READY_FOR_REVIEW`. All mandatory criteria have recorded evidence. Objective 01 remains `APPROVED`, Objective 03 remains `NOT_STARTED`, and version 0.2.1 is a development delivery awaiting independent review.

[Findings](findings.json) · [Tests](tests.json) · [Measurements](benchmarks.json) · [GitHub Actions](ci.json)
