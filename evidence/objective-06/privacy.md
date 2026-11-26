# Privacy and data destinations

| Data | Destination and purpose | Authorization and retention |
| --- | --- | --- |
| Expressions, notebook cells, formulas and flow inputs | Current device, Rust math and in-session editing | Explicit run. Documents, selected source files and results are saved through a user action. Opening a file stages it for inspection. |
| Build assets and display preferences | Web app origin, service-worker cache and local preferences | Browser cache behavior applies to visited assets. A fresh profile uses navy dark and AI disabled. Packaged Windows assets load from the executable. |
| Local model inventory | Selected numeric IPv4/IPv6 loopback address and port, GET inventory | Single-use review shows the URL. Default inventory sends zero prompt bytes and no credential. Optional local authentication is separately selected. |
| AI proposal or explanation request | User-selected provider and model, with displayed body and purpose | One authorization per transmission. Offline denies external providers. A local compatible server's own processing and retention depend on its operator. |
| Provider key | Native session or Windows Credential Manager when explicitly selected | The webview can submit, replace or remove a key. No read-key operation is exposed. Local credentials are constrained to their authorized endpoint. |
| PNG, dictation and reading | Local image decoder, available on-device speech component or installed local voice | Explicit file selection or user control. Recognized input remains editable and requires confirmation before evaluation. |
| Review material | Public review branch | Synthetic demonstrations, measured counts, platform versions, hashes and sanitized results. Private prompts, user files and actual API keys are excluded. |

A model does not choose the destination or authorize a file attachment. Consent expires after 120 seconds. The result can be recalculated with AI disabled. External providers may retain requests according to their service and account policy. [Provider contract](intelligence/providers.md) · [Observed delivery boundaries](intelligence/README.md)
