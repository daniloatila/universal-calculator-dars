# Operational intelligence

[Português brasileiro](../pt-BR/operations.md) · [Objective 02 revision evidence](../../evidence/objective-02/revision-01/REPORT.md)

Open **Operations** below the calculator. Select **Automatic** to let the device choose a profile, or select a named profile. Open **Local diagnostics** to see the effective profile and its reason. A manual choice survives a reload. Window suspension and critical resource protection can temporarily override it.

| Profile | Idle worker grace | Active and queued requests | Display cache entries | Optional graphics interval |
| --- | ---: | ---: | ---: | ---: |
| Ultra Light | 1 s | 1 | 0 | 250 ms, reduced detail |
| Efficiency | 4 s | 2 | 4 | 100 ms |
| Balanced | 12 s | 4 | 8 | 50 ms |
| Performance | 45 s | 6 | 16 | 34 ms |
| Maximum | 120 s | 8 | 32 | 17 ms |

The Standard module uses one dedicated worker while work is active. Requests run in order and use the same Rust evaluator under every profile. After the grace period the worker terminates. A later calculation starts a fresh worker. Ultra Light and Efficiency also reduce decorative paint. Cache limits apply to transient formatted text. Calculator history, undo and exact retained values are session state.

Automatic decisions use sustained signals, different entry and exit thresholds, and a minimum dwell. Ordinary drops need eight seconds of sustained evidence and a rise needs twenty seconds, subject to a fifteen-second dwell. Critical memory or temperature and a hidden window can trigger immediate protection. The adapter samples at 15 to 60 second intervals according to the effective profile. Expanded diagnostics sample every ten seconds while visible. Sampling stops when hidden.

## Module lifecycle

A descriptor imports the selected module when the manager activates it. The manager transitions through unloaded, loading, active, suspending, suspended, terminated and recoverable failure. Each active generation owns cancellable tasks and closeable resources. Suspension retains a compact session snapshot, cancels work, releases worker, graphics and cache ownership, and unmounts the workspace. Restore mounts a new workspace using the retained snapshot. Termination discards the snapshot. A failed activation can be retried from the interface.

The module scheduler classifies requests as essential, interactive, secondary, optional, maintenance or rendering. A reserved foreground slot remains available in Ultra Light. Both queues are bounded, and older requests gain priority. Every accepted request has a deadline. Optional work can be explicitly deferred, and suspension cancels waiting and running work. The drawing scheduler coalesces invalidations and offers a reduced-detail frame on demand in Ultra Light.

Standard is the sole production math module. Synthetic light and heavy modules run in the browser tests to exercise switching, workers, buffers and graphics cadence. Descriptors gate what modules can be imported. The test descriptors are outside the product bundle.

Windows WebView2 can report a visible document while its native window is minimized. The desktop host reads the actual window state and sends a boolean using fixed application code. It exposes no window-management command to JavaScript. Browser builds use the document visibility signal. [Tauri window events](https://docs.rs/tauri/latest/x86_64-pc-windows-msvc/tauri/enum.WindowEvent.html)

On a runtime that exposes `ICoreWebView2_19`, the host requests the `LOW` memory target during native minimization and restores `NORMAL` when the window returns. The target is advisory to WebView2. The module still releases its own resources through its lifecycle. Older runtime interfaces leave the target unavailable. [WebView2 memory target](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2_19?view=webview2-1.0.2849.39)

## Values, privacy and readings

The editor can show a label such as `@1 ≈ 100.014142135623730950488` next to its session reference. The label is for reading. Rust still receives the rational or certified interval that the reference denotes.

**Privacy center** shows the destinations and retention for data the application uses. In a supported web context, enabling offline mode asks the service worker to serve packaged build files only from its cache. The preference applies to controlled pages in the same app scope. A language that has never been loaded can require an explicit change back to allow static downloads. A desktop build uses embedded files. An initial web installation needs the static files, and browser-managed update checks are outside the app's fetch policy.

Session clearing cancels work and discards expressions, editing history, memory and completed calculations. Preference reset clears only DARS language, appearance and profile settings. Browser site-storage controls can remove downloaded files. User-initiated copy writes to the OS clipboard. A native Windows Credential Manager provider is available to future authorized Rust consumers. The app exposes no credential operation to the webview and stores no account secret as part of current use. The provider returns unavailable on other platforms. [Microsoft credential storage](https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credentialw)

Diagnostics use only local observations. Logical thread count and device-memory hints come from the browser. Main-thread scheduling delay is a responsiveness signal, with measured interaction latency reported separately. A graphics API advertised by the browser does not measure GPU availability or speed. The worker can report allocated WebAssembly linear-memory capacity. The browser's reported JavaScript heap and the native process tree use different accounting. The Windows provider samples system CPU, host CPU on a one-logical-CPU scale, total and available physical memory, the OS low-memory signal, architecture, processor count, host memory, power source and battery when present. Readings are local and cached for at least two seconds. Service-side sample latency and webview round-trip time are measured separately. The host scope excludes WebView2 descendants. Thermal data is unavailable in the verified Windows provider. A successfully created graphics context describes API execution without identifying the adapter.

A registered module defines its own description, view, state and optional resources. The initial loader and activation share a fifteen-second deadline. Selecting another module aborts superseded work. Clearing the session discards the states of all registered modules, including the suspended ones. On macOS, Linux, Android and iOS the contract accepts only readings supported by the runtime. The verified native sensors are on Windows. [Revision report](../../evidence/objective-02/revision-01/REPORT.md)
