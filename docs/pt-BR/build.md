# Compilar a fundação a partir do código-fonte

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

O Tauri incorpora os mesmos arquivos de `apps/web/dist` usados no build web. Gere novamente os arquivos web antes de recompilar após alterações na interface ou no avaliador Rust. O comando compila um executável Windows em fase de desenvolvimento. As plataformas suportadas dependem das [evidências de compatibilidade](../../evidence/objective-01/compatibility.md).

## CLI

```sh
cargo run --locked -p dars-cli -- "0.1 + 0.2"
cargo run --locked -p dars-cli -- "1 / 3"
cargo run --locked -p dars-cli -- "1 / 0"
```

Passe a expressão como um único argumento entre aspas. A avaliação imprime o resultado em JSON na saída padrão. O código de saída 0 indica um resultado, 1 um erro de avaliação e 2 uma invocação inválida. `--help` e `--version` imprimem texto.

## Testes

Compile os arquivos web primeiro para que o pacote desktop possa incorporá-los. Em seguida, execute:

```sh
cargo test --workspace --locked
npm test --prefix apps/web
npm exec --prefix apps/web -- playwright install chromium
npm run test:e2e --prefix apps/web
```

Consulte as [instruções de reprodução do objetivo](../../evidence/objective-01/reproduction.md) para os testes de plataforma e benchmarks.
