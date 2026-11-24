# Windows desktop resource profile

[Português brasileiro](windows-desktop.pt-BR.md)

The revision 01 protocol observes a release build of DARS in an interactive Windows session. It measures the native process and its WebView2 descendants, checks an exact result at each start, and exercises the calculator through the actual desktop interface. The revision report records the measured environment, executable hash and results. [Revision report](../evidence/objective-01/revision-01/REPORT.md)

## Reproduction

Build the release executable first. Run from the repository root on Windows with the WebView2 Runtime, PowerShell 7, Node.js 22.12 or newer, and the dependencies in the web lockfile installed. [Build instructions](../docs/en/build.md)

```powershell
npm ci --prefix apps/web --ignore-scripts
node benchmarks/windows-desktop-profile.mjs
```

You can pass an alternate release executable as the first positional argument. `--quick` checks the harness with shorter phases. It produces no qualifying measurement. The full run takes about six minutes. Keep the Windows session open and avoid interacting with the DARS window during the run. Record meaningful system activity when interpreting the machine-level baseline.

If the window changes unexpectedly during workload or recovery, keep the original run and repeat the visible-use observation with `node benchmarks/windows-desktop-profile.mjs --visible-tail`. It starts a fresh process and WebView2 profile, then runs the 25-second stabilization, 100-second workload and 65-second recovery. Report the repeat as a separate application session. Use the original run for the other phases that passed their window checks.

The harness uses a temporary WebView2 profile under the run directory and attaches Playwright to a dynamically assigned loopback test port. It checks `0.1+0.2` → `0.3` using the normal calculator controls. The timer includes process spawn, WebView2 and CDP startup, automated UI interaction and exact result readback. Three starts use newly created profiles and two reuse the primary profile. Windows file and WebView caches may remain warm in both groups. These timings represent profile state in the current Windows session.

## Observation phases

| Phase | Minimum | Application state |
| --- | ---: | --- |
| Ambient | 30 s | DARS unlaunched in this run |
| Stabilization | 25 s | Visible after the first exact calculation |
| Settled idle | 65 s | Visible without new calculations |
| Minimized | 60 s | Minimized using the native PID-owned main window |
| Workload | 100 s | Restored with continued exact arithmetic and compound irrational relative percentage calculations |
| Recovery | 65 s | Visible without new calculations after the workload |
| Closed | 25 s | DARS host closed with a descendant check before and after the phase |

The sampler targets a four-second cadence and checks the window state and foreground at each observation. The workload records completed calculations and end-to-end UI latency. Exact integer expressions use a separate independent expected value. Irrational percentage expressions are checked for the expected integer part and a visible decimal part. The separate mathematical regression suite validates irrational precision.

## Reading the measurements

- `workingSetBytes` counts resident mappings. `privateWorkingSetBytes` counts private resident mappings. `privateBytes` measures private commit. `sharedWorkingSetBytes` is the per-process working-set remainder above the private resident amount. `sharedCommitBytes` is the Windows shared commit counter. For an even sample count, the reported median is the upper middle observation. Each phase reports the host, all descendants and the full tree separately. Shared pages can appear in several per-process counters. [Microsoft process memory counters](https://learn.microsoft.com/en-us/windows/win32/api/psapi/ns-psapi-process_memory_counters_ex2)
- `systemCommitDeltaVsUnlaunchedBytes` and `systemPhysicalDeltaVsUnlaunchedBytes` compare phase medians with the ambient median. They include concurrent Windows activity and may be negative. The tree private resident and private commit counters describe process-attributed usage. Incremental system-wide memory includes effects outside those counters. [Microsoft system performance counters](https://learn.microsoft.com/en-us/windows/win32/api/psapi/nf-psapi-getperformanceinfo)
- Tree CPU integrates kernel and user time for matching process instances in adjacent samples. Short-lived processes or time before the first or after the last observation of a process can be missed. The process count and observed arrivals and exits are included. `processOneLogicalCpuPercent` uses one logical CPU as the denominator. `processTotalMachinePercent` divides that result by the logical processor count. System CPU uses `GetSystemTimes` with idle removed. [Microsoft system timing](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getsystemtimes)
- Compare first, last, median and maximum private resident and committed values across idle, workload and recovery. Growth and retention can reflect allocations, caching, page trimming and runtime behavior in this application session. A run of this duration can surface growth for follow-up. Conclusions about leaks require longer and repeated observations.

Raw sample events and the phase summaries are saved under `artifacts/objective-01/revision-01/desktop-profile-*` and, for a visible-use repeat, `desktop-visible-tail-*` in the same parent directory. Phase and startup checkpoints are flushed as the run proceeds. An interrupted run can retain earlier observations. Keep user-specific local files and WebView2 profiles in the ignored artifacts directory. Publish only sanitized evidence selected for the objective.

The v0.1.0 measurements used a different observation window and working-set method. Read the 0.1.1 results beside that history with the protocol differences in view. The future goal remains below 100 MB of incremental memory. Objective 02 owns the deeper architectural optimization.
