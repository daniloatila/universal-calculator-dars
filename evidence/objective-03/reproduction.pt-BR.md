# Objetivo 03 · Reprodução

[English](reproduction.md) · [Relatório integrado](REPORT.pt-BR.md) · [Mapa de regressão](regression.pt-BR.md) · [Registro de testes](tests.json)

Execute na raiz do repositório, no commit de código identificado pelo registro integrado. Use Rust `1.100.0`, Node `24.19.0`, npm e Python x64 `3.12`–`3.14` para o conjunto completo de pacotes de referência. A verificação desktop precisa de uma sessão Windows interativa, ferramentas C++, Windows SDK, PowerShell 7 e WebView2. O workflow hospedado contém os comandos correspondentes de Linux e macOS. [Ferramentas Rust](../../rust-toolchain.toml) · [Pré-requisitos de build](../../docs/pt-BR/build.md) · [Workflow de CI](../../.github/workflows/ci.yml)

## Build e verificações do Standard

```powershell
cargo fmt --all --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
cargo build --locked --release -p dars-cli
node scripts/install-wasm-bindgen.mjs
node scripts/build-wasm.mjs
npm ci --prefix apps/web --ignore-scripts
npm run build --prefix apps/web
npm test --prefix apps/web
python -B tests/oracle.py target/release/dars.exe
python -B crates/dars-core/tests/structured-oracle.py
node tests/check-targets.mjs target/release/dars.exe
node tests/check-standard-record-targets.mjs target/release/dars.exe
```

O build web gera os recursos locais que o Tauri incorpora. Os testes Rust usam por padrão os membros portáveis do workspace. Execute os testes desktop depois de gerar os recursos web de produção. No Unix, use `target/release/dars` sem o sufixo `.exe`. [Script de build](../../scripts/build-wasm.mjs) · [Verificação do núcleo](regression.pt-BR.md)

## Referências independentes e paridade dos módulos avançados

```powershell
python -m venv .tooling/math-oracle-venv
$oraclePython = '.tooling/math-oracle-venv/Scripts/python.exe'
& $oraclePython -m pip install --only-binary=:all: --require-hashes -r tests/math-oracle-requirements.txt -r tests/linear-algebra-oracle-requirements.txt
$cli = 'target/release/dars.exe'
$modules = 'scientific', 'algebra', 'calculus', 'linear-algebra', 'geometry', 'discrete-mathematics', 'programmer', 'converter', 'date-time'
foreach ($module in $modules) {
    & $oraclePython -B "tests/verify-$module.py" $cli
    if ($LASTEXITCODE) { throw "Independent reference failed for $module" }
    node "tests/check-$module-targets.mjs" $cli
    if ($LASTEXITCODE) { throw "CLI/WASM parity failed for $module" }
}
& $oraclePython -B tests/verify-scientific-complex.py $cli
```

Para medir cobertura, use um diretório de instrumentação limpo e colete as suítes Rust e as chamadas independentes à CLI sob o mesmo ambiente do `cargo llvm-cov show-env --pwsh`. Use a CLI instrumentada nos comandos Python e exporte o relatório consolidado com `cargo llvm-cov report --json` depois de todas as execuções instrumentadas. Os comandos de build anteriores mantêm as bibliotecas de referência fora dos recursos de execução. [Referências fixadas](../../tests/math-oracle-requirements.txt) · [Referências fixadas de Álgebra Linear](../../tests/linear-algebra-oracle-requirements.txt) · [Cobertura e contagens](tests.json)

## Chrome instalado, modo offline e Windows WebView2

```powershell
$env:DARS_BROWSER_CHANNEL = 'chrome'
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
cargo build --locked --release -p dars-desktop
cargo clippy --locked --workspace --release --all-targets -- -D warnings
cargo test --locked --release -p dars-desktop --lib -- --include-ignored
cargo test --locked --release -p dars-desktop --bin dars-desktop
node scripts/verify-desktop.mjs --objective-03
node scripts/verify-native-capabilities.mjs target/release/dars-desktop.exe --objective-02-revision-02
```

A suíte de produção também roda no Chromium do Playwright. Num computador sem esse binário, informe o caminho do Chrome instalado em `DARS_CHROME_EXECUTABLE` antes do script offline avulso. A suíte nativa de interface usa as asserções de 0.2.2 sobre o executável atual. O teste de credencial usa uma entrada sintética e confirma sua remoção. O executor de capacidades nativas testa a adaptação real do WebView2 e do Win32. O Clippy de todo o workspace foi verificado localmente no perfil release, com as proteções do Windows ativas. [Configuração do navegador](../../apps/web/playwright.config.ts) · [Mapa da base Windows](regression.pt-BR.md) · [Evidência de proteção](windows-protection.json)

Os relatórios de etapa apontam para os executores Windows de cada módulo. Eles usam perfis temporários da aplicação e registram inicialização até o resultado conferido no Standard, ativação, interações sustentadas com resultado conferido, encerramento de workers, fases de recursos, restauração e fechamento. Para medições comparáveis, execute os coletores em um computador ocioso e mantenha os benchmarks sequenciais. Guarde saídas brutas em artefatos ignorados e publique evidências sanitizadas com a identificação do código e do executável. [Protocolo de coleta Windows](../../benchmarks/windows-desktop.pt-BR.md) · [Índice de etapas e benchmarks](REPORT.pt-BR.md#validação-dos-módulos) · [Protocolo da dívida de memória](../objective-02/revision-02/memory-debt.pt-BR.md)

Para a execução pareada, use o executável 0.2.2 arquivado. Confirme o SHA-256 `8c0ca0ee530edc836f1cfbaef646d015cd40b79a231f89a0bb3838d7a0d5d96e` antes de usá-lo como primeiro argumento. O segundo argumento é o build release atual. [Executor pareado](../../benchmarks/windows-objective-03.mjs) · [Evidência de memória](memory-debt.pt-BR.md)

```powershell
node benchmarks/windows-objective-03.mjs $approved022Exe target/release/dars-desktop.exe
```

## Cadeia de dependências

```powershell
npm audit --prefix apps/web --audit-level=high
cargo audit --deny yanked
```

Consulte as quatro conclusões para o commit exato de código nas evidências integradas. Inicialização real no Windows, compilação e testes hospedados, varredura do código e auditoria de dependências são observações distintas. [Escopo de segurança](security.pt-BR.md) · [Matriz de compatibilidade](compatibility.pt-BR.md)
