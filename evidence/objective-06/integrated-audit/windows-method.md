# Physical Windows verification method

[Português brasileiro](windows-method.pt-BR.md)

Use the Objective 05 revision's reviewed 0.5.1 executable as the baseline. Its SHA-256 is `847982f6e3db718fbde20e8eb4b6ce2d71d50fc6cf08b9353f58e392aecc3473`. For the 0.6.0 candidate, the download checker requires a successful Windows build on the Objective 06 review branch and the exact source commit, run ID and artifact ID. It verifies the archive digest, entries, byte counts, executable digest, PE architecture, application version and WASM manifest before launch. [Baseline receipt](../../objective-05/revision-01/windows-artifact.json) · [Download checker](../../../scripts/verify-science-windows-artifact.ps1)

The following commands use PowerShell variables for the two executable paths, verified candidate receipt and lowercase executable hash. Run them sequentially in an interactive Windows session with WebView2 installed. Each application session uses a separate test profile.

```powershell
./scripts/verify-science-windows-artifact.ps1 -ArtifactId $artifactId -RunId $runId -Commit $commit -Version 0.6.0
node scripts/verify-science-desktop.mjs $baselineExe $candidateExe $receipt artifacts/objective-06/paired-desktop
node scripts/verify-desktop.mjs --objective-06 --exe $candidateExe
node scripts/verify-finance-desktop.mjs --candidate-only $candidateExe $candidateHash artifacts/objective-06/finance-offline.json 0.6.0
node scripts/verify-finance-comparison-v041.mjs $candidateExe $candidateHash artifacts/objective-06/finance-comparison 0.6.0
```

The paired run measures startup to a checked Standard result, 12 recalculations and process-tree memory at the same visible, idle, minimized and restored checkpoints. It separates host and auxiliary private working set, total working set and private commit. Machine-wide counters include competing processes. A single device and one run per version limit conclusions about resource use. The Intelligence case uses the disabled provider mode and computes a built-in proposal locally. It starts no AI server.

The candidate exercises the seven science and data workspaces offline, including three Graph Lab and Data Lab visits. It verifies mixed JSON input, compares the 22 packaged WASM byte streams with their hashes and checks 25 registered module IDs. Additional offline cases run the financial notebook, a versioned formula, a two-scenario financial automation and a Rust-checked proposal from the Intelligence panel. Opened and closed worker counts are observed through the browser protocol. The separate finance runs exercise five offline examples and replay a historical comparison proof. The historical Windows suite exercises 17 checks. [Native productivity cases](../../../scripts/verify-productivity-windows.mjs) · [Paired study](../../../scripts/verify-science-desktop.mjs)

With WebView request emulation still offline, the native broker then receives explicit consent for synthetic local HTTP servers on IPv4 and IPv6 loopback. The UI checks model inventory, a structured financial proposal, a request for clarification, a rejected unsupported operation and a closed port. The fixture closes its listening sockets, returns the UI to disabled mode and leaves the workspace with zero workers. [Native broker cases](../../../scripts/verify-intelligence-windows.mjs)
