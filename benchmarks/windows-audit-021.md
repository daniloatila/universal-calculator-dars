# Windows comparison for Objective 02 revision 01

[Português brasileiro](windows-audit-021.pt-BR.md) · [Revision evidence](../evidence/objective-02/revision-01/REPORT.md)

Use an interactive Windows session and the locked web test dependencies. Supply three paths to the native executables for 0.1.1, 0.2.0 and 0.2.1. The runner starts separate WebView2 profiles, fingerprints each executable and checks the same expressions and result format. Its default order is 0.1.1, 0.2.0, 0.2.1, 0.2.1, 0.2.0, 0.1.1. Each version gets two starts in reverse positions. Keep the machine session open and leave the benchmark window alone.

```powershell
node benchmarks/windows-audit-021.mjs path-to-0.1.1.exe path-to-0.2.0.exe path-to-0.2.1.exe
```

The fixed phases per run are unlaunched ambient (3 s), settling after the first checked result (8 s), repeated work (19 s), visible idle (15 s), Win32 minimization (14 s) and visible recovery (13 s). Restore must calculate the same saved value. The same Win32 tool from the original benchmark supplies native counters. Elapsed intervals, invalid samples, window states, background CPU and attached process counts are recorded. Diagnostic process-role and heap queries occur at the ends of phases. The brief `--quick` mode is a harness check.

## Timing boundaries

The original style of full automation remains the primary readout. Each checked operation is separated into input fill, ordinary Playwright click, and result wait in the outer process. The runner reports the distribution and p50, p95 and p99 for each portion. A separate diagnostic run measures explicit DOM click to result update, result update to a subsequent animation frame, normal versus forced locator clicks and the dedicated worker's dispatch-to-reply time. A temporary test-only worker wrapper observes startup and the optional WASM memory field. Browser rendering, React commits, worker execution and protocol scheduling can overlap. Timer differences between scopes are unsuitable for subtracting pooled percentiles.

The Rust example measures parsing, evaluating and preparing the typed display response, then separately serializes a precomputed legacy response. The structured Rust response includes opaque session value encoding. The Node harness observes the JS–WASM structured result boundary and JSON parsing in separate intervals. None of these microbenchmarks is a substitute for the full Windows interface path.

```powershell
cargo run --locked --release -p dars-core --example audit_timings
node benchmarks/layers-audit-021.mjs path-to-wasm-0.1.1 path-to-wasm-0.2.0 path-to-wasm-0.2.1
```

## Memory and attribution

The process tree records private resident memory, private commitment, summed resident memory and shared quantities. It keeps the host and WebView2 auxiliaries separate. Role mapping uses process IDs returned by the test-only Chrome DevTools session and leaves unknown roles unclassified. Browser renderer heap and live WASM capacity are separate scopes. Native resource and process changes can reflect allowed runtime caching and allocator retention. The system-wide delta includes activity outside DARS. Sustained multi-cycle evidence complements the shorter matched phases. [Native counter definitions](windows-desktop.md)

Raw records and temporary profiles stay below the ignored artifact directory. The revision evidence publishes aggregate data and hashes after inspection. A freshly rebuilt baseline is separately identified when the Windows artifact differs in bytes.
