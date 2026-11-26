# Windows desktop verification method

[Português brasileiro](windows-method.pt-BR.md)

The comparison uses the approved 0.4.1 Windows x64 review package and the hosted 0.5.0 review package. The provenance verifier checks the GitHub repository, workflow, source commit, branch, Windows job, archive digest, protocol manifest, executable identity and WASM inventory before the candidate is launched. Use the SHA-256 of the preserved 0.4.1 executable from the [approved receipt](../../objective-04/revision-01/windows-artifact.json). Review packages preserve Windows policy and use independent temporary WebView2 profiles.

```powershell
pwsh -NoProfile -File scripts/verify-science-windows-artifact.ps1 -ArtifactId $artifactId -RunId $runId -Commit $commit
node scripts/verify-desktop.mjs --objective-05 --exe $candidate
node scripts/verify-science-desktop.mjs $baseline $candidate $verifiedReceipt artifacts/objective-05/paired-desktop
node scripts/verify-finance-desktop.mjs --candidate-only $candidate $verifiedSha artifacts/objective-05/finance-offline.json 0.5.0
node scripts/verify-finance-comparison-v041.mjs $candidate $verifiedSha artifacts/objective-05/finance-comparison 0.5.0
```

The historical test exercises its existing 17 checked desktop interactions. The paired script runs both executables sequentially on the same host, starts each from a fresh WebView2 profile and exercises identical Standard expressions. It records visible startup, the first checked result, visible idle, minimization, restoration and post-close cleanup. The candidate additionally tests seven science examples using WebView2's network emulation, repeats Graph Lab and Data Lab across three cycles, checks actual output semantics and verifies that workers close. After the timed phases, it reads all 22 packaged WASM assets through the running app and independently compares their bytes with the hosted manifest hashes.

The first attempt stopped on the 0.4.1 baseline before launching the 0.5.0 package. A Standard worker had relaunched on restoration and the event listener counted it as a surviving science worker. The corrected attempt counts workers by their packaged science module URLs and preserves the complete worker counts per phase and process-tree cleanup check. This was a review harness correction on the same application binaries.

The five offline finance examples and historical equivalent-rate scenario use fresh candidate-only sessions and produce separate evidence. The 0.4.1 baseline data remains the paired Standard dataset. The probability screenshot was retaken on the same verified candidate after its first chart rendered. The original timed results remain in the paired measurement.

Working set, private resident bytes and private commit come from distinct Win32 process counters. The tree includes the host and WebView2 descendants. Shared resident sums can count a page more than once. The change in system physical memory includes activity outside the application. JavaScript heap measurements are render-process observations where WebView2 provides them. Benchmark repetitions compare this controlled workload and serve as observational dependency and resource checks. The separate sustained-leak investigation and the application-attributable physical RAM target follow the [memory debt protocol](../../objective-02/revision-02/memory-debt.md).
