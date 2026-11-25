# Windows desktop memory debt

[Português brasileiro](memory-debt.pt-BR.md) · [Roadmap](../../../ROADMAP.md)

**Status** Open and monitored. The Objective 02 independent review recorded the target of less than 100 MB of incremental RAM in visible basic desktop mode as technical debt. The scheduler revision 0.2.2 records the finding from 0.2.1. The memory target remains subject to the original mission's feasibility condition. [Original mission](../../../PROJECT_SPEC.md) · [Objective 02 revision 01](../revision-01/REPORT.md)

## Recorded observation

The qualifying Windows x64 and WebView2 run on 25 November 2026 used DARS 0.2.1 from commit `1183df897d8042f01fdc3f43947ebcc27cd48c7e`. One application process completed four cycles in the order below. Each minimized phase contributed five samples over approximately 15 seconds. The figures are phase medians in MiB. The aggregate includes the DARS host and its descendants. The helper values come from the separate auxiliary-process counters. [Measurement ledger](../revision-01/benchmarks.json) · [Sustained cycle protocol](../../../benchmarks/windows-adaptive-cycles.md)

| Cycle | Profile | Tree private commit | DARS host private commit | WebView2 helpers private commit | Tree private resident |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | Ultra Light | 252.42 | 5.59 | 246.83 | 84.72 |
| 2 | Maximum | 307.36 | 4.84 | 302.51 | 82.00 |
| 3 | Maximum | 308.43 | 5.59 | 302.84 | 82.85 |
| 4 | Ultra Light | 376.20 | 6.21 | 369.98 | 91.11 |

The tree's minimized private commit increased by 123.78 MiB from cycle 1 to cycle 4. The helpers accounted for 123.16 MiB of that increase. The minimized phases recorded zero math workers and closing the application left zero descendants in the observed tree. Visible idle private resident medians for the two Ultra Light cycles were 139.46 and 132.82 MiB. The minimized private resident and private commit measurements can move independently. [Measurement ledger, `windows_sustained.phases` and `windows_sustained.residualTreeAfterClose`](../revision-01/benchmarks.json)

Process-level counters identify the helpers as the main source of the measured growth. Allocation ownership inside WebView2 and the longer-term trend remain undetermined. Each active-work checkpoint reported about 1.12 MiB of WASM linear capacity and 5.79–6.95 MiB of used renderer JavaScript heap. Those runtime readings cover different scopes and cannot be added to Windows process figures. The visible basic-mode settle phase of a separate matched run measured 100.88–100.93 MiB of tree private resident memory after the first result. Verification of the incremental physical-RAM target remains open. System-wide RAM changes include activity outside the process tree. [Scope and limitations](../revision-01/REPORT.md#performance-and-retention)

## Required monitoring for Objectives 03–08

Include a Windows memory check with each objective after it is authorized. Record the build and WebView2 versions, profile and workload, baseline conditions, phase durations, sample counts and any missing counters. Record tree, host and helper private resident memory and private commit at startup, after the first checked result, at visible idle, during minimization and after recovery. Verify worker counts and residual descendants after close. Include a representative path for any newly added module or long-lived resource, then compare the shared Standard scenario with the most recent comparable record. Explain changes in the objective's evidence and carry forward the open item until the investigation resolves it.

For the basic desktop target, report an incremental physical-RAM estimate in bytes and MiB against a matched ambient control, including auxiliary processes and accounting for shared pages where attribution is available. Report private resident, private commit and system-wide change as separate observations. The stated target is below 100,000,000 bytes (about 95.37 MiB). Mark the target unverified when the measurement cannot isolate incremental app RAM. [Original mission](../../../PROJECT_SPEC.md) · [Counter definitions](../../../benchmarks/windows-desktop.md#reading-the-measurements)

## Investigation before the 1.0.0 release

Run the extended check during the authorized pre-release audit. Use at least three independent sessions with fresh WebView2 profiles and repeat with warmed profiles. Record fixed, identical workload batches and session conditions. Include a Standard basic-mode run and a representative mixed-module run. Use at least 20 identical calculation, idle, minimize and restore cycles per workload in each session, followed by at least 30 minutes of no-work cooldown and a close-and-check phase. Use matched no-work controls and sample at least 60 seconds of quiet ambient before opening and after closing the application. Compare like-for-like phases rather than adjacent active and minimized readings.

Before the run, define a noise tolerance per counter as the greater of 5 MiB and three times the median absolute deviation of medians from equal-length control windows. Split the last 15 cycles into three consecutive windows of five cycles. Compare the same-phase sample medians across those windows and use the following criteria.

| Pattern | Evidence required |
| --- | --- |
| Recovery | The cooldown median is at or below the stabilized pre-workload median plus tolerance. Verify released workers and inspect device and process counters after close. |
| Bounded retention or stabilization | The final three same-phase medians remain within tolerance of one another. A cooldown above the stabilized pre-workload baseline by more than tolerance indicates retained memory in the observation window. Repeat with warmed profiles before attributing the retention to caches or allocator behavior. |
| Sustained growth | The three final same-phase medians rise in sequence, the last exceeds the first by more than tolerance, and the pattern recurs in three independent matched sessions. Investigate by process role and phase. Repeat with longer windows if the control variability leaves the trend unresolved. |
| Confirmed leak | A matched reproduction and allocation or resource traces identify persistent growth from objects or resources that should be released. Verify the lifecycle step or fix that stops the growth under the same workload. Record unresolved attribution when the instrumentation cannot identify the retained resource. |

Record the classified pattern, measurement sensitivity, incremental target result and any remaining deviation before stable release. The 0.2.2 review reused the 0.2.1 measurement ledger for this debt record. The extended run is planned for the pre-release audit.
