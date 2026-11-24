# Reprodução · Objetivo 01

Use a raiz de uma cópia independente do repositório. O código auditado está no commit `164af9e4fb1719834cbf7858d1dc7781ac9bfacf`. Rustup seleciona a versão definida em `rust-toolchain.toml`. O ambiente da entrega usou Node 24.19.0, Python 3.14.7, PowerShell 7 e, no Windows, MSVC, Windows SDK e WebView2. [Pré-requisitos da fundação](../../docs/pt-BR/build.md) · [Inventário do ambiente](environment.json)

```sh
git clone https://github.com/daniloatila/universal-calculator-dars.git
cd universal-calculator-dars
git switch --detach 164af9e4fb1719834cbf7858d1dc7781ac9bfacf
cargo install wasm-bindgen-cli --version 0.2.130 --locked
npm ci --prefix apps/web --ignore-scripts
node scripts/build-wasm.mjs
npm run build --prefix apps/web
```

Para abrir o aplicativo web, execute `npm run preview --prefix apps/web` e acesse o endereço local mostrado pelo Vite. Encerre a prévia com Ctrl+C antes dos testes.

## Windows, CLI e oráculo

```powershell
cargo build --locked --release -p dars-cli -p dars-desktop
.\target\release\dars.exe '0.1+0.2'
.\target\release\dars.exe '1/3'
.\target\release\dars.exe '1/0'
.\target\release\dars-desktop.exe
```

As respostas CLI contêm `3/10` e `0.3`, a fração exata `1/3` e `division_by_zero`, respectivamente. Os dois cálculos válidos retornam código de saída 0. Divisão por zero retorna 1. Feche a janela antes do ensaio automatizado. O script inicia a aplicação em perfis isolados, exercita o motor na WebView2 e grava resultados e captura.

```powershell
python -B tests/oracle.py target/release/dars.exe
node tests/check-targets.mjs target/release/dars.exe
node scripts/verify-desktop.mjs
```

## Testes web, núcleo e qualidade

```sh
cargo fmt --all --check
cargo clippy --workspace --locked --all-targets -- -D warnings
cargo test --workspace --locked
npm test --prefix apps/web
npm exec --prefix apps/web -- playwright install chromium
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
```

Em Linux, o CI instala as dependências de sistema do Chromium com `playwright install --with-deps chromium`. Os parâmetros opcionais `DARS_BROWSER_CHANNEL` e `DARS_CHROME_EXECUTABLE` permitem repetir a suíte Playwright e o ensaio offline com Chrome local, respectivamente. A prova offline fecha o acesso à rede no contexto de teste depois de carregar os arquivos pela primeira vez. [Workflow](../../.github/workflows/ci.yml) · [Contagens esperadas](tests.json)

## Cobertura, benchmarks e segurança

```sh
rustup component add llvm-tools-preview
cargo install cargo-llvm-cov --version 0.9.2 --locked
cargo llvm-cov --locked -p dars-core --json --summary-only
node benchmarks/baseline.mjs
npm audit --prefix apps/web --audit-level=high
cargo install cargo-audit --version 0.23.0 --locked
cargo audit --deny yanked
```

Compare o benchmark com a máquina, o toolchain e o artefato registrados. O audit consulta bases atualizadas e pode mostrar resultados diferentes em outra data. A cobertura indicada no relatório é de linhas, funções e regiões do núcleo. [Benchmarks](benchmarks.json) · [Cobertura](coverage.json) · [Avisos de segurança](security.md)

No PowerShell, confronte hashes e tamanhos dos arquivos gerados com esta validação:

```powershell
$manifest = Get-Content -Raw evidence/objective-01/artifacts.json | ConvertFrom-Json
foreach ($entry in $manifest.PSObject.Properties.Value) {
    $file = Get-Item -LiteralPath $entry.workspace_relative
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    [pscustomobject]@{
        Arquivo = $entry.workspace_relative
        TamanhoConfere = $file.Length -eq $entry.bytes
        HashConfere = $hash -eq $entry.sha256
    }
}
```

Os hashes identificam os artefatos efetivamente medidos. Builds independentes podem produzir outros bytes por diferenças de versão e ambiente. Repita os testes de comportamento além da comparação de hashes. [Manifesto](artifacts.json) · [Compatibilidade observada](compatibility.md)

Para repetir a verificação adicional de precisão no Windows, abra o executável local, calcule `1/3` e compare os modos **Decimal** e **Exato**. Confira `0,333333333333333333333333` no idioma português e `1/3` no modo exato. [Verificação suplementar](windows-exact.json)
