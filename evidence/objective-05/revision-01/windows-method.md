# Windows verification of Data Lab 0.5.1

[Português brasileiro](windows-method.pt-BR.md)

The baseline is the preserved Windows x64 review executable of 0.5.0. Verify its SHA-256 against the [0.5.0 provenance receipt](../integrated-audit/windows-artifact.json). For the candidate, verify the successful Windows GitHub Actions job, source commit, archive digest, PE identity and manifest before launch. The scripts use independent temporary WebView2 profiles and keep the original Windows security policy in force.

```powershell
pwsh -NoProfile -File scripts/verify-science-windows-artifact.ps1 -ArtifactId $artifactId -RunId $runId -Commit $commit -Version 0.5.1
node scripts/verify-science-desktop.mjs $baseline $candidate $verifiedReceipt artifacts/objective-05/revision-01/paired-desktop
node scripts/verify-desktop.mjs --objective-05-revision-01 --exe $candidate
node scripts/verify-finance-desktop.mjs --candidate-only $candidate $verifiedSha artifacts/objective-05/revision-01/finance-offline.json 0.5.1
node scripts/verify-finance-comparison-v041.mjs $candidate $verifiedSha artifacts/objective-05/revision-01/finance-comparison 0.5.1
```

Each executable runs the same paired Standard expressions on one host. The runner observes startup, visible idle, minimization, restoration and process-tree cleanup. The candidate exercise checks seven scientific examples offline and repeats Graph Lab and Data Lab in three cycles. It then resets Data Lab, imports the ordinary mixed JSON fixture in decimal-comma notation, casts `valor` to decimal and verifies `n = 2`, exact sum `15/4` and exact mean `15/8`. An exported proof confirms the candidate engine version, the source digest and the observed result. After the timed phases, it reads the 22 packaged WASM files through the running executable and verifies their byte hashes.

The 17 historical desktop checks and candidate-only offline finance sessions have separate datasets. The paired measurement includes only comparable Standard phases in cross-version deltas. Process counters, heap observations and WASM capacity have distinct scopes. The [memory debt protocol](../../objective-02/revision-02/memory-debt.md) remains the reference for the separate sustained investigation and the target for attributable physical RAM.
