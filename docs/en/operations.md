# Operational intelligence

[Português brasileiro](../pt-BR/operations.md) · [Objective 02 evidence](../../evidence/objective-02/REPORT.md)

Open **Operations** below the calculator. Select **Automatic** to let the device choose a profile, or select a named profile. Open **Local diagnostics** to see the effective profile and its reason. A manual choice survives a reload. Window suspension and critical resource protection can temporarily override it.

| Profile | Idle worker grace | Active and queued requests | Display cache entries | Optional graphics interval |
| --- | ---: | ---: | ---: | ---: |
| Ultra Light | 1 s | 1 | 0 | Disabled |
| Efficiency | 4 s | 2 | 4 | 100 ms |
| Balanced | 12 s | 4 | 8 | 50 ms |
| Performance | 45 s | 6 | 16 | 34 ms |
| Maximum | 120 s | 8 | 32 | 17 ms |

The Standard module uses one dedicated worker while work is active. Requests run in order and use the same Rust evaluator under every profile. After the grace period the worker terminates. A later calculation starts a fresh worker. Ultra Light and Efficiency also reduce decorative paint. Cache limits apply to transient formatted text. Calculator history, undo and exact retained values are session state.

Automatic decisions use sustained signals, different entry and exit thresholds, and a minimum dwell. Ordinary drops need eight seconds of sustained evidence and a rise needs twenty seconds, subject to a fifteen-second dwell. Critical memory or temperature and a hidden window can trigger immediate protection. The adapter samples at 15 to 60 second intervals according to the effective profile. Expanded diagnostics sample every ten seconds while visible. Sampling stops when hidden.

## Module lifecycle

A descriptor imports the selected module when the manager activates it. The manager transitions through unloaded, loading, active, suspending, suspended, terminated and recoverable failure. Each active generation owns cancellable tasks and closeable resources. Suspension retains a compact session snapshot, cancels work, releases worker, graphics and cache ownership, and unmounts the workspace. Restore mounts a new workspace using the retained snapshot. Termination discards the snapshot. A failed activation can be retried from the interface.

The optional module scheduler allows zero, one, two, three or four secondary tasks across the five profiles, respectively. It defers new work at the admission limit and aborts work when a module retires. The frame scheduler coalesces graphics invalidations and cancels queued draws during suspension.

Standard is the sole production math module. Synthetic light and heavy modules run in the browser tests to exercise switching, workers, buffers and graphics cadence. Descriptors gate what modules can be imported. The test descriptors are outside the product bundle.

Windows WebView2 can report a visible document while its native window is minimized. The desktop host reads the actual window state and sends a boolean using fixed application code. It exposes no window-management command to JavaScript. Browser builds use the document visibility signal. [Tauri window events](https://docs.rs/tauri/latest/x86_64-pc-windows-msvc/tauri/enum.WindowEvent.html)

## Values, privacy and readings

The editor can show a label such as `@1 ≈ 100.014142135623730950488` next to its session reference. The label is for reading. Rust still receives the rational or certified interval that the reference denotes.

**Privacy center** shows the destinations and retention for data the application uses. In a supported web context, enabling offline mode asks the service worker to serve packaged build files only from its cache. The preference applies to controlled pages in the same app scope. A language that has never been loaded can require an explicit change back to allow static downloads. A desktop build uses embedded files. An initial web installation needs the static files, and browser-managed update checks are outside the app's fetch policy.

Session clearing cancels work and discards expressions, editing history, memory and completed calculations. Preference reset clears only DARS language, appearance and profile settings. Browser site-storage controls can remove downloaded files. User-initiated copy writes to the OS clipboard. A native Windows Credential Manager provider is available to future authorized Rust consumers. The app exposes no credential operation to the webview and stores no account secret as part of current use. The provider returns unavailable on other platforms. [Microsoft credential storage](https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credentialw)

Diagnostics use only local observations. Logical thread count and device-memory hints come from the browser. Main-thread scheduling delay is a responsiveness signal, with measured interaction latency reported separately. A graphics API advertised by the browser does not measure GPU availability or speed. The worker can report allocated WebAssembly linear-memory capacity. The browser's reported JavaScript heap and the native process tree use different accounting. CPU utilization, temperature and system memory pressure are left unknown when the runtime cannot supply them.
