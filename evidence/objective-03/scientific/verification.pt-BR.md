# Científico · Verificação da etapa

[English](verification.md) · [Limites matemáticos e de recursos](limits.pt-BR.md) · [Contrato do registro de cálculo](../calculation-proof/contract.pt-BR.md) · [Registro de testes](tests.json)

Os resultados cobrem a etapa do Científico no Objetivo 03 e sua interação com o Standard, o agendador e os registros locais de cálculo. Os outros módulos e a aceitação global seguem no [plano de etapas](../PLAN.pt-BR.md).

## Verificações locais

| Verificação | Resultado observado |
| --- | --- |
| Testes Rust dos membros padrão do workspace | 25 casos aprovados no núcleo Standard e no motor Científico. |
| Testes web no Node | 65 aprovados e 0 falhas. |
| Chrome instalado no Windows | 34 aprovados, 0 falhas, 0 ignorados e 0 instáveis. A suíte inclui Científico, importação e exportação de registros, RTL, cancelamento, comportamento adaptativo e regressão do Standard. |
| Web offline e idiomas sob demanda | 10 aprovados e 0 falhas. O teste focado do Científico também observou ausência de requisições e cache do módulo na abertura inicial, e um resultado conferido após preparação explícita e recarga offline. |
| Paridade da CLI e do WASM do Científico | 19 aprovados e 0 falhas. As respostas conferidas usam o mesmo contrato versionado de registro de cálculo. |
| Regressões matemáticas do Standard | 157 casos independentes de racionais e decimais, 20 comparações entre CLI e WASM e 291 casos de valores estruturados passaram. |
| Oráculos matemáticos independentes do Científico | SymPy/mpmath passou 102 casos. A suíte complexa do mpmath passou 75 casos, incluindo ramos principais e rejeições por limites. |
| Cobertura de linhas | Núcleo do Standard 613/620 (98,87%). Motor universal 1.795/1.873 (95,84%). O arquivo principal do Científico cobriu 978/1.023 linhas (95,60%). Cada contagem corresponde ao seu escopo de código. |
| Build release com dependências fixadas e abertura no Windows | Build concluído. O executável release normal abriu e completou a execução WebView2 descrita abaixo. |
| Clippy local | Os membros padrão do workspace passaram. A execução no workspace inteiro foi bloqueada pelo Controle Inteligente de Aplicativos do Windows. O build release normal e a verificação em execução concluíram sob a política de segurança existente. |
| Auditoria de dependências | A auditoria npm passou. O RustSec verificou 431 dependências travadas e encontrou zero avisos classificados como vulnerabilidades. Duas consultas ao registro de versões retiradas excederam o tempo limite apesar do código de saída 0. O CI ainda precisa completar essa parte. |

O RustSec registrou os avisos permitidos preexistentes para `chrono` 0.4.45 (sem manutenção), `proc-macro-error` 1.0.4 (sem manutenção) e `glib` 0.18.5 (classificado como `unsound`).

O índice oficial do registro confirmou separadamente `yanked=false` e checksums idênticos aos do lockfile para as quatro novas entradas desta etapa. São `astro-float-num` 0.3.6, `either` 1.19.0, `itertools` 0.10.5 e `lazy_static` 1.5.1. [Cargo.lock](../../../Cargo.lock) · [Registro de astro-float-num](https://index.crates.io/as/tr/astro-float-num) · [Registro de either](https://index.crates.io/ei/th/either) · [Registro de itertools](https://index.crates.io/it/er/itertools) · [Registro de lazy_static](https://index.crates.io/la/zy/lazy_static)

Reproduza na raiz do repositório com as versões fixadas de Rust e Node. No Windows, informe o Chrome instalado em `DARS_CHROME_EXECUTABLE` para o script offline avulso quando o Chromium empacotado pelo Playwright estiver indisponível. [Testes Chrome](../../../apps/web/tests/scientific.spec.ts) · [Testes do registro de cálculo](../../../apps/web/tests/calculation-proof.spec.ts) · [Definição dos jobs de CI](../../../.github/workflows/ci.yml)

```powershell
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo build --locked --release -p dars-cli
node scripts/build-wasm.mjs
npm run build --prefix apps/web
npm test --prefix apps/web
$env:DARS_BROWSER_CHANNEL = 'chrome'
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
node tests/check-scientific-targets.mjs target/release/dars.exe
python -B tests/verify-scientific.py target/release/dars.exe
python -B tests/verify-scientific-complex.py target/release/dars.exe
cargo build --locked --release -p dars-desktop
node benchmarks/windows-scientific.mjs target/release/dars-desktop.exe
```

Instale as dependências do oráculo em um ambiente de teste a partir dos [requisitos fixados](../../../tests/math-oracle-requirements.txt). A contagem de cobertura combina testes unitários Rust instrumentados e execução dos oráculos na CLI nativa.

## WASM e tempos de interação

A medição direta no Node usou o WASM do Científico inicializado, a leitura da requisição em Rust e a serialização do registro. Em 120 interações medidas, após 10 aquecimentos por expressão, p50/p95/p99 foram **0,115 / 0,996 / 1,320 ms**. A inicialização medida foi de **15,30 ms**. O artefato do módulo tinha **678.019 bytes** e a capacidade linear observada do WASM era de **1.179.648 bytes**. Esses limites de medição excluem o tempo do navegador e dos workers. [Executor de paridade e medição](../../../tests/check-scientific-targets.mjs)

No Windows interativo, a inicialização até o resultado conferido do Standard levou **564,21 ms**. Da seleção até a exibição do painel Científico foram **32,99 ms**. As 43 interações conferidas sob carga registraram p50/p95/p99 de **54,81 / 109,44 / 109,77 ms**. Essa medida inclui o preenchimento e o clique pelo Playwright, a criação do worker, o cálculo e a leitura do resultado conferido no DOM. A execução observou **49 workers dedicados do Científico abertos e fechados**. A janela restaurou a expressão do Científico, voltou ao resultado registrado no Standard e deixou zero processos nas amostras após fechar. [Executor interativo Windows](../../../benchmarks/windows-scientific.mjs)

## Recursos no Windows

A execução WebView2 concluída usou perfil novo, WebView2 **158.0.4370.33**, Windows **10.0.26200** e 20 processadores lógicos. Seis amostras por fase cobriram cerca de cinco segundos. A memória abaixo representa a mediana em MiB para a árvore de processos / processo DARS / auxiliares do WebView2. CPU é a taxa amostrada da árvore em relação a um processador lógico. Os workers foram contados ao final de cada fase.

| Fase | Memória privada residente em MiB | Commit privado em MiB | CPU | Workers |
| --- | ---: | ---: | ---: | ---: |
| Standard visível | 97,34 / 3,98 / 93,36 | 233,93 / 5,54 / 228,39 | 2,14% | 1 |
| Científico sob carga | 118,61 / 4,19 / 114,43 | 258,58 / 6,34 / 252,24 | 50,82% | 0 |
| Científico em repouso | 138,27 / 4,20 / 134,08 | 277,80 / 6,34 / 271,45 | 0,31% | 0 |
| Científico minimizado | 86,19 / 4,20 / 81,99 | 225,12 / 6,35 / 218,77 | 2,14% | 0 |
| Científico restaurado | 99,76 / 4,20 / 95,55 | 327,64 / 6,34 / 321,30 | 0,00% | 0 |
| Após fechar | 0,00 / 0,00 / 0,00 | 0,00 / 0,00 / 0,00 | 0,00% | 0 |

A fase sob carga ainda abriu workers breves entre as amostras. A memória privada residente caiu durante a minimização. O commit privado subiu após restaurar e continuou concentrado nos processos auxiliares. As observações são de uma execução curta. A meta de **100 MB incrementais** e a retenção em ciclos mais longos seguem abertas para a [investigação da dívida de memória](../../objective-02/revision-02/memory-debt.pt-BR.md). A tabela considera a execução Windows concluída.

O hash SHA-256 do executável foi `593beb96e92c8927631ba4c08c355984dc23984b629ee306fd6e6b1c417a7386`. O hash do WASM do Científico foi `49cebbb780ad371d0443a81d95f586118b5e22111ad3477f33495ebff6bda3ad`. A captura Windows teve hash `c8f98425fed9035892d215971047b39d748ee9ca4b77004002ceb81bb4b7b8e7`. A inspeção visual confirmou os controles do Científico em azul-marinho e o resultado exato `10` para `log(1024,2)`, com a seção Registro de cálculo recolhida. [Fases medidas](windows-benchmark.json) · [Captura Windows](windows.png)
