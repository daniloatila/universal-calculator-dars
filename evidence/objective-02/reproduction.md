# Reproduzir o Objetivo 02

[Relatório](REPORT.md) · [Baseline 0.1.1](../objective-01/revision-01/REPORT.md) · [Contrato operacional](../../docs/pt-BR/operations.md)

Use uma cópia do repositório no commit de código indicado em [tests.json](tests.json). É necessário Node 24.19.0, o toolchain Rust indicado em `rust-toolchain.toml` e o wasm-bindgen da versão fixada pelo projeto. Para a execução Windows, use uma sessão interativa com WebView2, Windows SDK e PowerShell 7. [Requisitos de compilação](../../docs/pt-BR/build.md)

```powershell
node scripts/install-wasm-bindgen.mjs
node scripts/build-wasm.mjs
npm ci --prefix apps/web --ignore-scripts
npm run build --prefix apps/web
cargo build --locked --release -p dars-cli -p dars-desktop
```

## Testes e equivalência com a referência

```powershell
cargo fmt --all --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
python -B tests/oracle.py target/release/dars.exe
node tests/check-targets.mjs target/release/dars.exe
python -B crates/dars-core/tests/structured-oracle.py
npm test --prefix apps/web
npm exec --prefix apps/web -- playwright install chromium
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
```

Nos sistemas Unix, o caminho de CLI é `target/release/dars`. As fases Windows de validação e medição em seguida usam o executável local. O teste do Gerenciador de Credenciais escreve uma entrada sintética num nome exclusivo e confirma sua remoção.

```powershell
cargo test --locked -p dars-desktop --lib -- --include-ignored
node scripts/verify-desktop.mjs --objective-02
node benchmarks/baseline.mjs
node benchmarks/windows-adaptive-cycles.mjs
```

Para repetir a linha de repouso com o mesmo protocolo da referência, execute `node benchmarks/windows-desktop-profile.mjs target/release/dars-desktop.exe`. O comando salva a nova coleta em uma pasta única de artefatos ignorados, com o hash do executável usado.

O ensaio completo alterna Ultraleve, Máximo, Máximo, Ultraleve no mesmo processo. Mantém um cálculo ou valor conhecido em cada fase e verifica retomada após minimizar. O arquivo de resultados inclui fases não qualificadas quando alguma observação falha. `--quick` serve para checar o ambiente. [Método](../../benchmarks/windows-adaptive-cycles.pt-BR.md)

## Demonstração manual

1. No Windows ou no navegador, abra **Operação** e **Diagnóstico local**. Selecione **Ultraleve**, calcule `0.1+0.2` e aguarde o worker encerrar. Repita com **Máximo** e observe a retenção do worker na mesma janela. Em ambos os perfis o resultado é `0.3`.
2. Armazene um valor na memória usando MS, minimize a janela real no Windows e restaure. MR recupera o valor. O diagnóstico diferencia a instância ativa da suspensão. O teste nativo lê a janela por Win32.
3. No navegador de produção com service worker ativo, marque **Usar apenas recursos em cache** e recarregue. Cálculos e arquivos já carregados ficam disponíveis. A prova automatizada tenta consultar um arquivo de mesma origem que não está em cache e confirma que só volta a responder após desmarcar.
4. Alterne entre árabe, português e inglês. O seletor usa o idioma escolhido após recarregar. A expressão segue da esquerda para a direita mesmo com o restante da interface em RTL.
5. Execute MS 100, digite `sqrt(2)%`, pressione M+, MR e calcule. O editor explica a referência temporária e o resultado exibido é `100.014142135623730950488`. Use **Limpar cálculos e sessão** para remover esse estado.

[Resultados de regressão](tests.json) · [Saídas e limites do benchmark](benchmarks.json)
