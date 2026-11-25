# Scheduler recovery verification

[Revision report](REPORT.md) · [Reproduction and commands](reproduction.md) · [Regression ledger](tests.json) · [Chrome observations](scheduler-outcomes.json)

The focused Node run passed **25 of 25** tests across the scheduler and module manager. The real application shell run passed **4 of 4** tests in Google Chrome 158.0.8127.38, including two new scheduler recovery tests. The Node cases inject failures and stale callbacks through controlled Worker adapters. The Chrome cases use synthetic Chart and Note modules and real dedicated browser Workers. The test fixture is bundled in memory for the browser run and is excluded from the product. The production correction is in the reusable module scheduler, with no changes to Standard calculator code. [Scheduler source](../../../apps/web/src/module-work.ts) · [Browser fixture](../../../apps/web/tests/fixtures/module-shell/chart-scheduler.ts)

Each admitted request owns a fresh Worker. A timeout, cancellation, transport error, or completed response invalidates the execution and detaches its listeners. The scheduler invokes `Worker.terminate()` before releasing its slot, so a successor can run without waiting for the old task to cooperate. Queued requests that never start allocate no Worker. The scheduler does not replay requests. If termination throws, it closes admission, cancels other work, returns `failed` for the affected job, and continues to count the unconfirmed slot as active. That injected failure is a safety check. Routine timeout and cancellation recover the slot in place after successful termination. [Scheduler source](../../../apps/web/src/module-work.ts) · [Fail-closed Node test](../../../apps/web/tests/module-work.test.mts#L355)

## Mandatory cases

The references in the table point to the exact test names listed below. Worker counts concern scheduler-owned dedicated Workers in these fixtures. They do not measure system memory or establish a bound on WebView2 process memory.

| # | Required case | Observed result | Tests |
| --- | --- | --- | --- |
| 1 | Stuck essential followed by valid essential | The first Worker timed out and was terminated before the queued successor started. The successor returned `41` in Node and returned `42` through `46` in Chrome across the five profiles. | N2, C1 |
| 2 | Stuck secondary followed by new work | The foreground lane completed independent work while the secondary Worker was stuck. After its timeout and termination, the next secondary returned `4` in Node and `23` in Chrome. The independent Chrome result was `24`. | N3, C2 |
| 3 | Recovery after timeout | Both foreground and background tests observed `timed_out`, physical termination before slot reuse, and a successful successor. Scheduler counts returned to zero. | N2, N3, N7, C1, C2 |
| 4 | Recovery after cancellation | Node cancelled queued and active jobs and covered cancellation during worker creation. The worker returned by the reentrant factory was terminated without receiving a request, and its successor returned `6`. In Chrome, explicit abort terminated the active Worker and the queued successor returned `25`. | N5, N6, N7, C2 |
| 5 | Tasks that ignore `AbortSignal` | Chrome Workers acknowledged receipt and emitted heartbeats on a separate port without returning a result or cooperating with cancellation. The scheduler terminated them on deadline or abort and subsequent work completed. The Node adapters likewise had no cooperative cancellation path. | N2, N5, C1, C2 |
| 6 | Delayed responses from discarded executions | Node saved old callbacks before timeout, active cancellation, or suspension and delivered them deliberately after disposal. Timeout and cancellation cases observed zero decodes from the stale response, and the active successor still returned its own value. | N2, N5, M1 |
| 7 | Repeated failures | Three Node cycles injected transport error, message error, a failed post, invalid decode input and factory failure. Every cycle completed a valid subsequent request. Fifteen allocated Workers were terminated once each, with peak active ownership of one. | N9 |
| 8 | Queue saturation | Independent foreground and background waiting queues rejected their ninth entries with `queue_full`. A saturated background queue did not block foreground admission. Scope cancellation settled waiting jobs without spawning their Workers. | N4, N8, M2 |
| 9 | Concurrency bounds | The foreground lane peaked at one. Adaptive background capacities were `0`, `1`, `2`, `3`, and `4`. With four active background slots, a downgrade to one admitted no new Worker until there was capacity. In Chrome, the observed peak was one in the timeout sequence and two in the Efficiency case with independent foreground work. Injected termination failure left the unconfirmed slot counted and admitted no successor. | N2, N3, N10, M1, C1, C2 |
| 10 | Recovery in Ultra Light | Essential work recovered while background capacity was zero. The Chrome successor returned `42` in the same scheduler generation. Node also verified cancellation recovery and that Ultra Light defers optional work. | N1, N7, M1, C1 |
| 11 | Recovery in the other profiles | Chrome completed successors with `43` in Efficiency, `44` in Balanced, `45` in Performance, and `46` in Maximum. Node verified timeout and cancellation recovery in each profile. | N7, C1 |
| 12 | Suspend and switch during failures | Real shell suspension and switching each cancelled an in-flight hanging job. Suspension also cancelled a queued request without worker creation. The old scheduler was closed with zero active and zero queued jobs. The resumed and reselected module returned `27` and `28` from fresh scopes while preserving its Chart state. | M1, C2 |
| 13 | No unbounded worker or abandoned-task growth | The Chrome trace balanced all 19 worker creations with termination, and both scenarios ended with zero active and queued requests. Repeated injected failures left zero live mock Workers after each cycle. The termination-failure test deliberately retained one unconfirmed slot and refused further allocation. | N9, N10, M1, C1, C2 |
| 14 | Continue without restarting the application | A single scheduler generation completed all five Chrome foreground recovery pairs. The other Chrome test resumed and switched modules in the same application page, retained Note text and the Chart point, and processed valid work after each transition. | C1, C2 |

## Exact test references

### Node scheduler

- **N1** `Ultra Light admits essential, interactive and rendering workers while optional work defers`. [Test](../../../apps/web/tests/module-work.test.mts#L103)
- **N2** `an essential timeout terminates an unresponsive worker and a queued essential request returns a valid result`. [Test](../../../apps/web/tests/module-work.test.mts#L123)
- **N3** `a stalled secondary worker times out and the next secondary uses its recovered lane`. [Test](../../../apps/web/tests/module-work.test.mts#L153)
- **N4** `background saturation reserves admission and essentials outrank queued rendering work`. [Test](../../../apps/web/tests/module-work.test.mts#L176)
- **N5** `request cancellation frees a queued slot, invalidates old replies and permits a new task`. [Test](../../../apps/web/tests/module-work.test.mts#L204)
- **N6** `cancellation during worker creation terminates the returned worker before the successor is admitted`. [Test](../../../apps/web/tests/module-work.test.mts#L239)
- **N7** `timeout and cancellation recover essential admission under all five adaptive profiles`. [Test](../../../apps/web/tests/module-work.test.mts#L269)
- **N8** `foreground saturation rejects overflow without allocating extra workers`. [Test](../../../apps/web/tests/module-work.test.mts#L300)
- **N9** `repeated transport, decode, creation and post failures dispose workers without growing active ownership`. [Test](../../../apps/web/tests/module-work.test.mts#L323)
- **N10** `a termination failure retains physical ownership and stops admission rather than overcommitting`. [Test](../../../apps/web/tests/module-work.test.mts#L355)

### Node module lifecycle

- **M1** `background work defers in Ultra Light, admits configured parallelism, and cancels on suspension`. [Test](../../../apps/web/tests/module-manager.test.mts#L496)
- **M2** `background work has a bounded queue, isolates failures, and never launches after close`. [Test](../../../apps/web/tests/module-manager.test.mts#L587)

### Chrome real shell and dedicated Workers

- **C1** `real Workers time out, release foreground capacity, and return valid successors in every adaptive profile`. [Test](../../../apps/web/tests/module-shell.spec.ts#L195)
- **C2** `real scheduler Workers recover from secondary hangs and release in-flight jobs on cancel, suspend, and switch`. [Test](../../../apps/web/tests/module-shell.spec.ts#L233)

The same Chrome run preserved `the real app shell selects heterogeneous modules and globally clears both active and suspended state` and `the same app shell isolates a hung module, retries and disposes a late runtime`. That second test exercises a user-initiated module retry. Task recovery does not automatically resubmit the interrupted request. [Module selection and clear](../../../apps/web/tests/module-shell.spec.ts#L67) · [Module-level recovery](../../../apps/web/tests/module-shell.spec.ts#L115)
