# DARS 0.2.1 security and privacy review

[Resumo em português brasileiro](#resumo-em-português-brasileiro)

## Native boundary

The added Tauri capability grants the packaged local `main` WebView one command, `dars_native_capabilities`. The application manifest registers the command by name. The handler checks the window label, packaged origin and empty JSON object before reading the local counters. The application keeps `withGlobalTauri: false`. Its content security policy limits scripts, styles, workers and connections to the app origin. Images also permit inline data. The build uses the existing locked serde, Windows and WebView2 versions. [Native capability](../../../apps/desktop/capabilities/native-sensors.json) · [Tauri configuration](../../../apps/desktop/tauri.conf.json) · [Command validation](../../../apps/desktop/src/capabilities.rs) · [Tauri capability model](https://v2.tauri.app/security/capabilities/)

The versioned response has fixed fields for physical memory, CPU, power, window state and sampling cost. The app CPU reading covers the desktop host process. The benchmark measures WebView2 descendants separately. Collection uses Win32 APIs with normal process permissions. Unavailable readings use `null` or are omitted in the interface. System CPU remains unavailable on hosts with multiple Windows processor groups, where the selected API measures the calling thread's group. The optional graphics check attempts to create a local WebGL context and reads no GPU name, vendor or identifier. Thermal state was unavailable. [Win32 collection](../../../apps/desktop/src/capabilities/windows.rs) · [WebView response validation](../../../apps/web/src/adaptive-native.ts) · [Win32 CPU scope](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getsystemtimes)

Requests less than two seconds apart reuse the latest sample. The production controller samples at a low cadence while visible and stops its scheduled polling when the window is hidden or minimized. The validated reading stays in session memory and travels through local Tauri IPC. The command accepts no process selector, filesystem path, system command or credential. Its response contains no unique device identifier or external destination. [Adaptive host](../../../apps/web/src/adaptive-browser.ts) · [Permission manifest](../../../apps/desktop/build.rs)

Two fixed JavaScript snippets relay native window visibility. The optional WebView2 COM interface sets the memory target to LOW on minimize and NORMAL on restore. Reading the property back confirms the requested target. The browser runtime decides how to apply that target. [Native window handling](../../../apps/desktop/src/main.rs) · [WebView2 memory target](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2_19?view=webview2-1.0.2849.39)

## Observed Windows behavior

The tested executable had SHA-256 `45967b9fac2fd0a111f35eaa3b6cad2640326753eb544040fe2c9c128918a91c`. WebView2 158.0.4370.33 returned native memory, CPU and AC/battery readings for the empty request. It rejected a selector with `native_sensors_invalid_request`, and two closely spaced requests reused one sample counter. A WebGL context was created. In three recorded readings, native collection took 76–117 µs and the renderer observed a round trip of about 0.7 ms. Collection time covers the counters and record assembly. The round trip also includes local transport. [Native sensor harness](../../../scripts/verify-native-capabilities.mjs)

Native minimization moved Auto from Balanced to Ultra Light, suspended the module and left zero workers. The COM target read LOW. Restoration returned the target to NORMAL and the profile to Balanced. The exact value `1/3` retained the expected decimal expansion. A separate bounded CPU fixture used four threads for up to six seconds at a 40% duty cycle per thread. It exercised the CPU reading under moderate load. The observed automatic profile change came from the physical window transition. [Native sensor harness](../../../scripts/verify-native-capabilities.mjs)

## Offline operation and credentials

Explicit cache-only mode applies to web pages controlled by the service worker. The browser first needs the static resources in its cache. Browser update checks are outside this application policy. The offline browser suite passed **10 of 10 checks**, covering offline reloads and calculations, lazy locale downloads and reuse of a cached locale. The Operations tests also exercise rejection of a file absent from the cache and restoration of normal network policy. Diagnostics and calculator state remain local. Explicit preferences retain their documented persistence, and the privacy controls clear module session data and DARS preferences. [Offline harness](../../../tests/verify-web-offline.mjs) · [Operations privacy tests](../../../apps/web/tests/operations.spec.ts) · [Regression evidence](regression.md)

The Windows credential provider uses the current user's Credential Manager and enforces its DARS namespace and value-size bounds. **The credential checks passed 2 of 2**. The native round trip stored and read a synthetic entry, deleted it and confirmed its absence. The sensor capability grants no credential access. [Credential provider and tests](../../../apps/desktop/src/credentials.rs) · [Objective 02 baseline](../security.md)

Bundled modules are trusted app code and share a WebView. The ACL applies to that WebView. Third-party JavaScript modules would require a separate origin and permission boundary before they could run as untrusted extensions. [Module registry](../../../apps/web/src/module-registry.ts) · [Tauri capability model](https://v2.tauri.app/security/capabilities/)

## Source review and CI

The prepublication review examined **60 staged paths** and verified the approved mission and Rust math sources against the previous delivery. Gitleaks completed successfully on the staged source export. The source scan covers the published source commit. [Audited source](https://github.com/daniloatila/universal-calculator-dars/commit/1183df897d8042f01fdc3f43947ebcc27cd48c7e)

The audited runtime source passed all four GitHub Actions jobs. npm reported zero vulnerabilities. RustSec reported three warnings also present in 0.2.0. Two concern unmaintained transitive crates and one concerns a `glib` iterator in the GTK dependency chain. The Rust audit with `--deny yanked` passed. [CI results](ci.json) · [GitHub Actions run](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45511054525)

## Resumo em português brasileiro

A revisão concede ao WebView local uma única permissão para ler sensores por uma requisição vazia. No Windows, a execução rejeitou um seletor inesperado e confirmou a coleta de CPU, memória e energia. A minimização suspendeu o módulo, encerrou o worker e aplicou LOW ao WebView2. A restauração retomou o perfil anterior e aplicou NORMAL. A leitura térmica ficou indisponível. O teste gráfico mediu a criação de um contexto WebGL.

O navegador passou **10 de 10 verificações offline**. O Gerenciador de Credenciais passou **dois de dois testes**, incluindo a confirmação de que a entrada sintética foi removida. O Gitleaks aprovou a cópia do código preparada para publicação após a revisão de **60 caminhos**. [Reprodução](reproduction.md) · [Regressão](regression.md)
