# Compatibility

[Português brasileiro](compatibility.pt-BR.md)

| Target | Scope |
| --- | --- |
| Native CLI | Locked Rust toolchain, same financial request and result envelope used by the browser |
| Browser | Production WASM assets, seven locales, five profiles, prepared offline cache and mobile layouts |
| Windows x64 | Shared production assets in the reviewed Tauri executable, verified with installed WebView2 |
| Linux and macOS | CI build, lint and test scopes recorded per job in the acceptance ledger |

The desktop executable for review is separate from a stable distribution. The artifact record identifies runtime, source, digest and signature state.
