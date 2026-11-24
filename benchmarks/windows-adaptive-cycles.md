# Windows adaptive cycles

[Português brasileiro](windows-adaptive-cycles.pt-BR.md)

This protocol exercises the Windows release executable with real WebView2 and the Standard interface. It reuses the process sampler from the [0.1.1 protocol](windows-desktop.md). The calculator has a single production module. Repeated switching between test modules is verified separately by the [module lifecycle tests](../apps/web/tests/module-manager.test.mts).

## Run the observation

Build the release executable and install the web test dependencies from the lockfile. The harness needs an interactive Windows session, Node.js, PowerShell 7 and the WebView2 Runtime. Keep the session open and avoid other activity in the application window. [Build instructions](../docs/en/build.md)

```powershell
npm ci --prefix apps/web --ignore-scripts
node benchmarks/windows-adaptive-cycles.mjs
```

An optional first argument selects a different 0.2.0 executable. Add `--quick` to check the harness with abbreviated phases. The abbreviated run is ineligible for conclusions about steady use or memory retention.

The full observation takes approximately six and a half minutes. It starts with 25 seconds of ambient sampling, starts a fresh WebView2 profile and checks the exact value of `0.1+0.2`. It stores `100` in calculator memory and allows 20 seconds for initial stabilization. The same application process then runs four cycles in the order Ultra Light, Maximum, Maximum, Ultra Light. Starting and ending with Ultra Light partly balances the ordering effect of a warmed browser and an aging process.

| Phase | Minimum per cycle | Observation |
| --- | ---: | --- |
| Active calculation | 28 s | Exact synthetic arithmetic and the full expected decimal rendering of `sqrt(2)%`. |
| Visible idle | 18 s | Native memory and math worker retention with no new calculations. |
| Native minimization | 15 s | Win32 window state, math worker release and the suspended module. |
| Recovery | 14 s | After restoration, the calculator recalls and evaluates the saved `100`. Continued sampling examines memory retention. |

The app closes for a 20-second observation of the machine and residual descendants. Two additional fresh profiles and two reused-profile launches measure time to first exact result. The profiles run within the same boot and may share warm Windows file caches.

## Evidence boundaries

- Summaries use the Windows process tree, separately reporting host, descendants and aggregate working set, private resident memory, private commit and shared counters. The system-wide physical and commit differences against ambient include concurrent activity. Shared pages can appear in multiple process counters. [Windows sampling and definitions](windows-desktop.md#reading-the-measurements)
- Per-process CPU uses matched process identities at adjacent samples. A process that starts or exits between samples contributes only measured intervals. Worker counts come from dedicated workers observed through Playwright and are compared with the application diagnostics at visible checkpoints. [Playwright Page workers](https://playwright.dev/docs/api/class-page#page-workers)
- Visible checkpoints can report the renderer isolate heap from CDP, followed by an application diagnostics reading for the exact WASM linear memory capacity. The two measurements cover different runtime scopes and may overlap with process counters. Linear memory capacity describes the buffer size and cannot establish private resident usage. Unsupported readings are recorded as missing. Diagnostics are closed during the timed phases. [CDP Runtime heap usage](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-getHeapUsage)
- Compare repeated idle and recovery readings in the same profile and the paired profiles in this run. Retained memory after load can include WebView2 caches, allocator retention, retained interface state or still-active workers. This finite observation cannot establish an allocator-level category or prove the absence of leaks. The historical 0.1.1 run used different phase lengths and workload mix. [0.1.1 benchmark evidence](../evidence/objective-01/revision-01/benchmarks.json)

The harness writes incremental summaries and raw samples under the ignored `artifacts/objective-02/windows-adaptive-cycles-*` directory. Raw samples include process identifiers and stay local. The review records the binary hash, the summarized observations and any phase or measurement limits.
