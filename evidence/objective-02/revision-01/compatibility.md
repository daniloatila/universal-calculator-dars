# Objective 02 revision compatibility

[Revision report](REPORT.md) · [Regression record](regression.md) · [0.2.0 platform evidence](../compatibility.md) · [Verified CI run](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45511054525)

## Platform evidence

| Environment | Evidence for 0.2.1 | Limits |
| --- | --- | --- |
| Windows 11 Pro x64, build 26200 · Chrome | 25 Playwright cases and 10 explicit offline checks recorded. Tests use live Chromium Web Workers, Canvas and WebGL when available, the Windows desktop browser and a production web build. Two cases exercise the production App shell via separate test entries. | The narrow layout and Arabic RTL use an emulated viewport. The browser visibility test injects a document visibility event. Physical mobile and native window behavior require separate checks. |
| Windows 11 x64 · Tauri/WebView2 158.0.4370.33 | The packaged executable passed 17 local interface checks. Five native sensor Rust cases and two Credential Manager cases passed. The live harness checked restricted IPC, current readings, cache and actual Win32 minimize and restore. [Test ledger](tests.json) | Host CPU and memory cover the Tauri process. The process-tree benchmark accounts separately for its WebView2 descendants. |
| Windows x64 · CLI/WASM | Local CLI oracle, structured oracle and parity were repeated. Their distinct scopes and counts are in the regression record. | WASM parity establishes numerical equivalence for its tested vectors and does not measure native runtime behavior. |
| Ubuntu runner · CLI/web | CI passed Rust, CLI and generated WASM checks, npm tests, independent oracles and headless Chromium. | Linux Tauri and physical Linux device execution are outside this workflow. |
| Windows runner · desktop build | CI passed building the native desktop and running the desktop Rust tests after the web build. | Interactive Windows evidence comes from the local device. |
| macOS runner · desktop build | CI passed the native desktop build and supported CLI, web and Rust behavior. | The workflow provides compilation and Rust tests. Physical macOS interaction and platform-specific performance remain unmeasured. |
| Android, iOS, physical tablets and other desktop architectures | Capability decoding supports platform-aware absence. No device execution is recorded for this revision. | Mobile hardware, runtime lifecycle, packaging and performance conclusions require observations on the respective devices. |

## What each reading measures

The verified Windows executable had SHA-256 `45967b9fac2fd0a111f35eaa3b6cad2640326753eb544040fe2c9c128918a91c` and came from `1183df897d8042f01fdc3f43947ebcc27cd48c7e`. All four CI jobs passed on that source. The contained capability test used normal permissions, accepted the fixed empty request, rejected an unexpected selector and reused a cached sample inside the minimum interval. [Artifact and test ledger](tests.json) · [Verified CI run](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45511054525)

- **Windows local native provider.** CPU deltas need two valid observations. System CPU is a normalized aggregate within the API's reported topology. Host CPU is expressed in equivalents of one logical CPU. Host memory covers the Tauri process. Windows system memory and power APIs expose current physical-memory availability and can identify AC power and battery when reported. A sample without a battery reading leaves battery level and charge state unavailable. The WebView2 memory target is a runtime policy readback. [Native capability contract](../../../apps/desktop/src/capabilities.rs)
- **Window and graphics.** Win32 minimization changed Automatic from Balanced to Ultra Light, suspended the active module and left zero workers. WebView2 read back Low via its memory-usage target interface. Restore read back Normal, returned to Balanced and reproduced the expected decimal expansion of `1/3`. Browser builds use document visibility. A browser graphics context was created during the Windows run. The native physical GPU and thermal fields were unavailable. [Native sensor harness](../../../scripts/verify-native-capabilities.mjs) · [Adaptive decoder](../../../apps/web/src/adaptive-native.ts)
- **Observed sensor response.** Windows reported AC and an 80% battery level during the run. The bounded fixture raised mean system CPU by 2.761 percentage points. That run did not reach the critical-pressure threshold. The native sample cost was 76–117 µs and observed IPC round trips were approximately 0.7 ms. The values describe the sampled machine and interval. [Native sensor harness](../../../scripts/verify-native-capabilities.mjs)
- **Memory and performance.** WebView2 descendants, private resident pages, private commit and shared memory have separate native counters in the repeat benchmark. JavaScript heap readings are browser-reported, and WebAssembly reports allocated linear capacity. Package size, host measurements and process-tree totals cover different scopes. Platform deltas require comparable same-host runs. [Windows comparison method](../../../benchmarks/windows-audit-021.md) · [0.2.0 benchmark evidence](../benchmarks.json)
- **Packaged and web availability.** Desktop uses embedded application assets. Explicit cache-only web operation requires a secure context with a controlling service worker and an installed cache. Languages previously downloaded can be used from that cache. The Windows credential test uses Credential Manager and verifies deletion of its synthetic entry. macOS and other platforms can return a provider-unavailable result. [Operations documentation](../../../docs/en/operations.md) · [Português brasileiro](../../../docs/pt-BR/operations.md)

## Reproduce the platform checks

Follow the pinned toolchain and platform setup. On Windows, rebuild the WebAssembly and frontend outputs before building the desktop so the release executable embeds the same web assets. Run the native harnesses in an interactive Windows session with WebView2 installed. [Build instructions](../../../docs/en/build.md)

~~~powershell
node scripts/build-wasm.mjs
npm run build --prefix apps/web
cargo build --locked --release -p dars-desktop
node scripts/verify-desktop.mjs --objective-02-revision
node scripts/verify-native-capabilities.mjs target/release/dars-desktop.exe
~~~

The native capability harness launches a disposable profile, connects over loopback CDP and minimizes and restores a real owner window. This harness observes the regular local capability IPC. The production app operates with normal user permissions and has no dependency on the harness, CDP or PowerShell for steady-state monitoring. Check the native commands from the same revision and retain the executable fingerprint with the result. [Desktop smoke harness](../../../scripts/verify-desktop.mjs) · [Native sensor harness](../../../scripts/verify-native-capabilities.mjs)
