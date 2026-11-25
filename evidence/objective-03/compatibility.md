# Objective 03 · Compatibility and execution scope

[Português brasileiro](compatibility.pt-BR.md) · [Integrated report](REPORT.md) · [Test ledger](tests.json) · [Reproduction](reproduction.md)

| Target | Verified scope |
| --- | --- |
| Windows x64 and WebView2 | The native development executables exercised Standard and each new module through real WebView2 UI. The final candidate passed 17 native interface checks and five mixed measurement cycles with WebView2 `158.0.4370.33`. The runs observed foreground workers, idle, minimize, restore and close. Full-workspace release Clippy passed on Windows. [Windows UI](windows-ui.json) · [Paired Windows](paired-windows.json) · [Windows protection and lint](windows-protection.json) |
| Windows x64 and installed Chrome | Tests used Chrome `158.0.8127.38` on the production distribution. All 93 passed, covering the ten modules, the navy Dark default, keyboard and compact-width interaction, seven locales, Arabic RTL, worker recovery, local records and offline behavior. [Browser results](browser.json) |
| CLI and WebAssembly | Windows release CLI, generated Standard WASM and one isolated WASM asset per advanced module run the supported contracts. Complete advanced records and structured failures are compared against the corresponding CLI requests. [Regression](regression.md) · [Calculation record contract](calculation-proof/contract.md) |
| Hosted Ubuntu | The workflow runs Rust and frontend builds and tests, the full set of independent Python mathematical references, Standard structured WASM checks, all CLI/WASM parities, Chromium and standalone offline checks. [CI workflow](../../.github/workflows/ci.yml) |
| Hosted Windows | The workflow runs Rust and frontend builds and tests and compiles and tests the desktop crate. The physical Windows UI, installed Chrome, Credential Manager round trip and live WebView2 capabilities are recorded separately. [CI workflow](../../.github/workflows/ci.yml) · [Regression](regression.md) |
| Hosted macOS | The workflow builds and tests the desktop crate and exercises CLI, WASM and frontend contracts. Physical macOS UI, packaging, signing and notarization are outside this verification. [CI workflow](../../.github/workflows/ci.yml) |

The Windows, Ubuntu, macOS and security jobs completed successfully on `c3af4870b6fe781f1b7526995fcd3761791aeead`. Physical testing scope comes from the local evidence above. [CI receipt](ci.json) · [Exact integrated run](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45651132774) · [Acceptance ledger](acceptance.json)

## Web assets and offline operation

The first web load prepares the app shell and its core asset group. Other locale bundles stay lazy until selected, and advanced assets stay lazy until their eligible module is used. An advanced tool can run offline after its same-version assets have been prepared while connected. Use **Operations → Use cached assets only** to restrict the controlled web page to cached resources. Browser cache eviction or a version change can require preparation again. The desktop executable embeds the built web assets. [Operations guide](../../docs/en/operations.md) · [Standalone offline suite](../../tests/verify-web-offline.mjs) · [Tauri asset configuration](../../apps/desktop/tauri.conf.json)

English, Brazilian Portuguese, Simplified Chinese, Hindi, Spanish, Arabic and French are the seven UI locales. The mathematical record uses stable keys and values across languages. Display format, messages and layout are localized. The browser suites include Arabic RTL and 320 px layouts. The native shell's configured minimum width and the browser's tested layout width are distinct. [Locale definitions](../../apps/web/src/i18n.ts) · [Tauri configuration](../../apps/desktop/tauri.conf.json)

## Distribution scope

The source and public evidence describe a development-stage candidate. The Windows verification uses the locally built executable and the installed WebView2 runtime. The report records executable and WASM hashes for identification. Stable release, signed distribution, store submission and notarization sit outside the current delivery. [Integrated report](REPORT.md) · [Build instructions](../../docs/en/build.md)
