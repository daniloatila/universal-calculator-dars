# Compilar o DARS a partir do código-fonte

[English](../en/build.md)

Execute os comandos na raiz do repositório. Use Rustup, a versão de Rust em `rust-toolchain.toml`, Node.js 24.19.0, npm e Python 3 para as verificações independentes. A compilação desktop no Windows também precisa das ferramentas de build C++ da Microsoft, do Windows SDK e do runtime WebView2. [Pré-requisitos por plataforma do Tauri](https://v2.tauri.app/start/prerequisites/)

## Web e WebAssembly

```sh
cargo install wasm-bindgen-cli --version 0.2.130 --locked
npm ci --prefix apps/web
node scripts/build-wasm.mjs
npm run build --prefix apps/web
npm run preview --prefix apps/web
```

Abra o endereço local informado pelo Vite. A prévia serve localmente o aplicativo compilado e o WASM. Para editar o frontend, use `npm run dev --prefix apps/web` depois de gerar a integração com WASM. Encerre qualquer um dos servidores locais com Ctrl+C no terminal correspondente.

## Desktop para Windows

Depois do build web:

```powershell
cargo build --locked --release -p dars-desktop
.\target\release\dars-desktop.exe
```

O Tauri incorpora os mesmos arquivos de `apps/web/dist` usados no build web. Gere novamente os arquivos web após alterações na interface ou no avaliador Rust. O comando gera um executável Windows para revisão local. [Evidências de compatibilidade](../../evidence/objective-03/compatibility.pt-BR.md)

A revisão de lint de todo o workspace verificada localmente no Windows usa o perfil `release`.

```powershell
cargo clippy --locked --workspace --release --all-targets -- -D warnings
```

## CLI

```sh
cargo run --locked -p dars-cli -- "0.1 + 0.2"
cargo run --locked -p dars-cli -- standard-record "1 / 3"
cargo run --locked -p dars-cli -- tool '{"schema":1,"module":"scientific","operation":"evaluate","input":"sin(90°)"}'
```

Passe a expressão ou a requisição JSON avançada como um único argumento entre aspas. A avaliação imprime JSON na saída padrão. O código de saída 0 indica um resultado, 1 um erro de avaliação e 2 uma invocação inválida. `--help` e `--version` imprimem texto. [Registro e reprodução de cálculos](../../evidence/objective-03/calculation-proof/contract.pt-BR.md)

## Testes

Compile os arquivos web primeiro para que o pacote desktop possa incorporá-los. Em seguida, execute:

```sh
cargo test --locked
npm test --prefix apps/web
npm exec --prefix apps/web -- playwright install chromium
npm run test:e2e --prefix apps/web
```

As instruções de reprodução cobrem as ferramentas fixadas, referências matemáticas independentes, paridade CLI/WASM, verificações reais no Windows e navegador e medições de desempenho. [Reprodução do Objetivo 03](../../evidence/objective-03/reproduction.pt-BR.md)
