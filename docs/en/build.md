# Build DARS from source

[Português brasileiro](../pt-BR/build.md)

Run the commands from the repository root. Use Rustup, the Rust toolchain in `rust-toolchain.toml`, Node.js 24.19.0, npm, and Python 3 for the independent checks. A Windows desktop build also needs the Microsoft C++ build tools, Windows SDK and WebView2 runtime. [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/)

## Web and WebAssembly

```sh
cargo install wasm-bindgen-cli --version 0.2.130 --locked
npm ci --prefix apps/web
node scripts/build-wasm.mjs
npm run build --prefix apps/web
npm run preview --prefix apps/web
```

Open the local URL reported by Vite. The preview serves the built application and WASM locally. For editing the frontend use `npm run dev --prefix apps/web` after generating the binding. To stop either local server, press Ctrl+C in its terminal.

## Windows desktop

After the web build:

```powershell
cargo build --locked --release -p dars-desktop
.\target\release\dars-desktop.exe
```

Tauri embeds the same `apps/web/dist` assets used by the web build. Rebuild the web assets after changes to the interface or Rust evaluator. This command produces a Windows executable for local review. [Compatibility results](../../evidence/objective-03/compatibility.md)

The full workspace lint command was verified locally for 0.3.0 and on the hosted Windows runner for 0.3.1. When local App Control blocks a build helper, consult the revision evidence and verify the review artifact against its source commit and digest. [Windows integrity evidence](../../evidence/objective-03/revision-01/security.md) · [Revision reproduction](../../evidence/objective-03/revision-01/reproduction.md)

```powershell
cargo clippy --locked --workspace --release --all-targets -- -D warnings
```

## CLI

```sh
cargo run --locked -p dars-cli -- "0.1 + 0.2"
cargo run --locked -p dars-cli -- standard-record "1 / 3"
cargo run --locked -p dars-cli -- tool '{"schema":1,"module":"scientific","operation":"evaluate","input":"sin(90°)"}'
```

Pass the expression or advanced request JSON as one quoted argument. Evaluation prints JSON to standard output. Exit code 0 indicates a result, 1 an evaluation error, and 2 invalid invocation. `--help` and `--version` print text. [Calculation record and replay](../../evidence/objective-03/calculation-proof/contract.md)

## Tests

Build the web assets first so the desktop crate can embed them. Then run:

```sh
cargo test --locked
npm test --prefix apps/web
npm exec --prefix apps/web -- playwright install chromium
npm run test:e2e --prefix apps/web
```

The reproduction notes cover the locked toolchain, independent oracles, CLI/WASM parity, actual Windows and browser checks, and benchmarks. [Objective 03 reproduction](../../evidence/objective-03/reproduction.md)
