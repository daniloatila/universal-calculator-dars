# Foundation security and privacy

[Português brasileiro](../pt-BR/security.md)

## Data and permissions

| Data or operation | Destination | Purpose and permission | Retention |
| --- | --- | --- | --- |
| Expression, result, history, undo, redo and memory | Current application session | Local calculator functions | Session only |
| Explicit theme and language preference | Local app or browser profile | Restore the choices made in the interface | Until the preference or app data is cleared |
| Copy result | Operating-system clipboard | An explicit user action via the platform clipboard | Managed by the OS and its clipboard settings |
| Web application assets | Static origin serving the application | Load current HTML, scripts, styles and WebAssembly | Browser cache policy |
| Built app assets for offline use | Browser Cache Storage on the app origin | Make the loaded build available offline, where service workers are supported | Versioned build cache or until site data is cleared |
| Build dependencies and CI | Configured public package registries and CI endpoints | Developer setup and continuous integration | By developer and service policy |

The calculator's evaluation path stays on the device. Telemetry, tracking, advertising, accounts, language models, server-side evaluation, remote synchronization and application updater checks are outside this milestone. A fresh web installation first needs the static assets. In a supported browser, a service worker caches build resources for offline use. A desktop build loads its embedded assets directly. The web cache holds build assets only.

## Boundaries

- Treat expressions as mathematical data. Use the bounded Rust parser to validate lengths, tokens, nesting, and operations before and during evaluation.
- Keep credentials, authorization for external endpoints and arbitrary host execution out of the core and UI. The desktop configuration grants no plugin capabilities. Report any future permission changes with their purpose and data access.
- Keep production assets local and use the desktop content security policy to allow the bundled assets needed for WASM. Test parser failures, pasted input and untrusted strings without opening external destinations.
- Keep published reports free of secrets, personal paths, and raw logs. Inspect the tracked tree before source publication. Check pinned tool versions, locked dependencies, third-party licenses and known advisories.

See [Objective 01 security evidence](../../evidence/objective-01/security.md) for the observed checks, findings and limits.

Objective 02 adds the same-origin cache policy, local diagnostics and a Windows credential provider reserved for authorized native consumers. [Privacy center and security boundaries](operations.md#values-privacy-and-readings)

The desktop Intelligence gateway is the first user-authorized consumer of native provider credentials. The webview can replace or remove a key. It cannot read it back. See the [0.6.0 privacy ledger](../../evidence/objective-06/privacy.md) and [architecture decision](../adr/0003-productivity.md).
