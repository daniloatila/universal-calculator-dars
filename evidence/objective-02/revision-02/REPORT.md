# Objective 02 · Revision 02 · DARS 0.2.2

[Português brasileiro](REPORT.pt-BR.md) · [Previous delivery](../revision-01/REPORT.md)

**State** `READY_FOR_REVIEW`

The owner reported an independent assessment of 93/100 for 0.2.1 and commissioned the scheduler correction for 0.2.2. Prior acceptance evidence and the project's approval gates remain the historical reference. [Reproduce the defect](reproduction.md) · [Tracked memory debt](memory-debt.md)

## Failure and recovery

The 0.2.1 reproduction confirmed that the first essential request received a timeout and an abort notification. Its callback remained pending and kept the foreground slot. A second essential request expired after zero dispatches. [Observed reproduction](tests.json) · [Repeat the reproduction](reproduction.md)

The generic scheduler now admits work through a bundled dedicated worker, with one worker and one decoded result per request. An admitted request owns its slot until the scheduler invalidates its callbacks and calls `Worker.terminate()`. Completion, failure, deadline, user cancellation and module disposal all retire the worker. The next admitted request gets a fresh worker. A late callback has no effect, and expired work stays retired. If termination itself fails, the scheduler closes admission and retains the affected slot in its active count. [Scheduler implementation](../../../apps/web/src/module-work.ts) · [Worker termination standard](https://html.spec.whatwg.org/multipage/workers.html#dom-worker-terminate-dev)

## Verification

- In Chrome, a real worker withheld its result in each of the five adaptive profiles. Each successor then returned a valid value from 42 to 46 in the same App instance. The Chrome fixtures also verified secondary recovery, explicit cancellation, suspension and module switching. All 19 scheduler workers created in those scenarios were eventually terminated. [Browser observations](scheduler-outcomes.json)
- Node tests exercised queue saturation, bounded foreground and background admission, stale callbacks, cancellation during worker creation and repeated transport, worker and decoder failures. The 14 requested cases are mapped to exact tests and observed outcomes. Standard retains its existing Rust/WASM worker supervisor. [Recovery matrix](recovery.md)
- The regression passed 602 checks, including 594 tracked equivalents and eight additions. The mathematical core reached 98.87% line coverage and 95.69% region coverage. The locked Windows 0.2.2 executable passed 17 native UI checks and a separate WebView2 capability scenario. The production tests include cache-only mode, seven locales, navy Dark default and exact calculations. [Regression ledger](tests.json) · [Windows evidence](windows.json) · [GitHub Actions](ci.json)

## Tracked memory debt

Revision 01 measured successive minimized process-tree private commit medians of 252.42, 307.36, 308.43 and 376.20 MiB. WebView2 helpers account for the dominant share. Allocation cause remains undetermined. The <100 MB incremental basic-mode target stays open. Objectives 03–08 have an explicit monitoring requirement. The pre-1.0.0 plan defines controlled observations for stabilization, retention, sustained growth and leak attribution. [Memory debt and protocol](memory-debt.md)

## Review gate

Objective 01 remains `APPROVED`. Objective 02 awaits the owner's decision and Objective 03 remains `NOT_STARTED`. This is a development version. [Acceptance record](acceptance.json) · [Project state](../../../PROJECT_STATE.md)
