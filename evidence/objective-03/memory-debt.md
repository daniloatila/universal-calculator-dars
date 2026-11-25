# Objective 03 · Windows desktop memory debt

[Português brasileiro](memory-debt.pt-BR.md) · [Integrated report](REPORT.md) · [Benchmark ledger](benchmarks.json) · [Paired observations](paired-windows.json)

**Status** Open. The target is less than **100,000,000 bytes** of incremental physical memory in visible basic desktop mode, about **95.37 MiB**. The Objective 02 audit observed increasing WebView2 helper private commit during its four-cycle workload and left the incremental physical target and the allocation cause unverified. Objective 03 extends the monitoring through real module changes and worker teardown. [Accepted memory protocol](../objective-02/revision-02/memory-debt.md) · [Original target](../../PROJECT_SPEC.md)

## What the counters measure

| Counter | Interpretation |
| --- | --- |
| Tree private resident | Private working-set pages measured for the app host and its WebView2 tree. The host and helper columns attribute counters to process roles. |
| Tree private commit | Private committed virtual memory. Pages can be resident or paged out. This value can rise while the private working set falls. |
| Aggregate shared working set | Sum of each process's shared working-set mappings. A physical page mapped by more than one process can be counted repeatedly. The full working-set sum includes both private resident and shared mappings. |
| Ambient system physical delta | Observed change in total system memory use against an ambient phase. It includes activity outside DARS and can move independently of the app's counters. |

The threshold concerns attributed incremental physical RAM. A matched ambient comparison and the process tree's private-resident value provide complementary observations. Precise total physical attribution also requires handling shared pages. [Counter definitions](../../benchmarks/windows-desktop.md#reading-the-measurements) · [Paired runner](../../benchmarks/windows-objective-03.mjs)

## Measured behavior

The nine Windows stage runs used a fresh WebView2 profile and measured Standard, module activation and load, idle, minimize, restore and close. Stage 9 recorded **102.08 MiB** tree private resident in visible Standard and **93.58 MiB** minimized with Date & Time. The Date & Time idle private commit median was **305.62 MiB**. All **45** opened workers closed and the last six samples recorded zero descendants. The stage workloads each use their own source and executable identity. [Stage 9 measurements](date-time/windows-benchmark.json) · [Stage index](REPORT.md#module-validation)

The paired run used the archived 0.2.2 executable, SHA-256 `8c0ca0ee530edc836f1cfbaef646d015cd40b79a231f89a0bb3838d7a0d5d96e`, and the integrated 0.3.0 executable, SHA-256 `8c2da09e07fa9e5a95bf3e068105b63a2e1e860582fb371dcc0bd4ace4db3d88`. Both ran on Windows `10.0.26200` with WebView2 `158.0.4370.33`, a fresh profile, and the same 12 checked Standard interactions. Each Standard phase contributed six samples roughly one second apart. [Baseline artifact identity](../objective-02/revision-02/tests.json) · [Paired observations](paired-windows.json)

| Build and Standard phase | Tree private resident (bytes) | Tree private commit (MiB) | Host / helper private commit (MiB) | Aggregate shared working set (bytes) | Observed system-physical delta from own ambient (bytes) |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0.2.2 first visible | 106,164,224 | 235.65 | 5.58 / 230.07 | 285,483,008 | 163,573,760 |
| 0.3.0 first visible | 103,645,184 | 237.61 | 6.46 / 231.14 | 290,254,848 | 173,662,208 |
| 0.2.2 visible idle | 118,501,376 | 241.53 | 5.58 / 235.95 | 286,662,656 | 177,098,752 |
| 0.3.0 visible idle | 116,477,952 | 248.10 | 6.46 / 241.64 | 291,573,760 | 186,003,456 |

On the candidate, visible Standard private resident medians were 98.84 MiB after the first result and 111.08 MiB at idle. Host / helper private resident medians at idle were 4.46 / 106.62 MiB. The tree measured 78.58 MiB private resident and 203.18 MiB private commit minimized, then 94.16 and 251.84 MiB restored. The full working-set sums for first visible and idle were 393,842,688 and 408,055,808 bytes. These sums include repeated shared mappings. The system-level deltas also include activity outside the app. The incremental physical target remains unverified under this measurement. [Paired phase and role medians](paired-windows.json)

The candidate extended the run with five mixed cycles across Ultra Light, Efficiency, Balanced, Performance and Maximum, using Programmer, Calculus, Date & Time, Linear Algebra and Scientific. The cycles preserved each draft and result on restore. The minimized phases had zero workers and tree private-commit medians of 308.66, 324.85, 332.83, 326.25 and 320.20 MiB, respectively. Those phases exercise different modules and do not establish a same-workload trend. Across mixed switching, 31 workers opened and 31 closed, with a peak of one. The last Standard record for `46/2` remained available after switching. Both builds had six final samples with zero descendants. [Paired phases and recovery](paired-windows.json) · [Native capture](standard-proof-windows.png)

Trial runs exposed three harness issues. The first had an ambiguous Calculus field locator. The next completed the five mixed cycles, then required zero workers immediately after reactivating Standard, which may warm its own worker. The final procedure checks the retained Standard result and the identity of any live Standard worker, explicitly suspends the module and requires zero workers with balanced lifecycle counts. A later restart encountered a temporary file lock while reading WebView2's DevTools port. The harness now retries only missing or temporarily locked files until the existing deadline and validates the port range. These corrections apply to the local measurement harness. [Paired runner](../../benchmarks/windows-objective-03.mjs) · [Windows measurement harness](../../benchmarks/windows-tool.mjs)

## Remaining investigation

The unified benchmark establishes process roles and the short-window result. Allocation ownership inside WebView2, warmed-profile behavior and long-term retention remain open. The pre-release protocol calls for at least three independent matched sessions, fresh and warmed profiles, and at least 20 fixed cycles per workload followed by 30 minutes of cooldown. It requires 60 seconds of quiet ambient samples before launch and after close, a defined noise threshold, comparison of like phases and allocation traces where a leak is suspected. Carry forward the attribution and duration limits until the extended observations are available. [Extended protocol and classification criteria](../objective-02/revision-02/memory-debt.md#investigation-before-the-100-release)
