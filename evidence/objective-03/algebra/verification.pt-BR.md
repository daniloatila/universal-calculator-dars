# Álgebra · Verificação da etapa

[English](verification.md) · [Limites matemáticos e de recursos](limits.pt-BR.md) · [Contrato do registro de cálculo](../calculation-proof/contract.pt-BR.md) · [Plano de etapas](../PLAN.pt-BR.md) · [Registro de testes](tests.json)

Os resultados cobrem a etapa de Álgebra do Objetivo 03 e sua interação com o Standard, o Científico, o ciclo de vida dos workers e o registro de cálculo.

## Verificações locais

| Verificação | Resultado observado |
| --- | --- |
| Oráculo independente SymPy na CLI otimizada para Windows | 184 aprovados e 0 falhas com SymPy 1.14.0. As nove operações foram cobertas. O total inclui 37 rejeições estruturadas e sete reexecuções na CLI com registros completos idênticos. [Oráculo](../../../tests/verify-algebra.py) |
| CLI e WASM de Álgebra | 28 respostas completas coincidiram, com uma verificação adicional de isolamento entre módulos e zero falhas. [Executor de paridade](../../../tests/check-algebra-targets.mjs) |
| Testes Rust dos membros padrão do workspace | 32 aprovados e 0 falhas no núcleo Standard (16) e no motor universal (16). |
| Testes web no Node | 65 aprovados e 0 falhas. |
| Chrome instalado no Windows | A suíte completa aprovou 39 casos antes do ajuste final de formatação Rust. A distribuição final passou por 12 testes focados (cinco de Álgebra, cinco do Científico e dois do registro de cálculo). [Observações do navegador](browser.json) · [Captura no navegador](browser.png) |
| Web offline e idiomas sob demanda | A verificação avulsa passou em 10 checagens. A suíte focada no navegador também conferiu o isolamento do cache de Álgebra e o cálculo offline. [Executor offline](../../../tests/verify-web-offline.mjs) · [Suíte de Álgebra no navegador](../../../apps/web/tests/algebra.spec.ts) |
| Regressões do Standard | 157 casos independentes de racionais e decimais, 20 comparações entre CLI e WASM e 291 casos de valores estruturados passaram. [Oráculo independente](../../../tests/oracle.py) · [Executor de paridade](../../../tests/check-targets.mjs) · [Oráculo estruturado](../../../crates/dars-core/tests/structured-oracle.py) |
| Regressão do Científico | O oráculo SymPy/mpmath passou em 102 casos e o oráculo complexo separado do mpmath passou em 75. Entre CLI e WASM, 19 registros coincidiram e uma checagem de isolamento entre módulos passou. [Oráculos do Científico](../../../tests/verify-scientific.py) · [Referência complexa](../../../tests/verify-scientific-complex.py) · [Executor de paridade](../../../tests/check-scientific-targets.mjs) |
| Cobertura de linhas | Álgebra 1.425/1.480 (96,28%). Motor universal, incluindo o envelope compartilhado, o Científico e Álgebra, 3.246/3.375 (96,18%). Núcleo Standard 613/620 (98,87%). Os resultados combinam os testes Rust instrumentados e os oráculos na CLI nativa. |
| Build release com dependências fixadas no Windows | A CLI otimizada e o aplicativo desktop compilaram sob a política de segurança existente. A CLI executou o oráculo independente e o desktop completou a verificação no WebView2. [Medições Windows](windows-benchmark.json) |

Os testes no navegador conferem as nove operações no DOM, incluindo a restrição `x != 0` para `x/x`, a seleção de domínio, a entrada localizada, o layout RTL árabe a 320 px e o encerramento de um worker ativo na troca de módulo. O teste offline de Álgebra verifica que a abertura inicial não carrega nem armazena recursos avançados, prepara Álgebra sem baixar o Científico e confere um resultado após recarregar offline. A suíte compartilhada do registro de cálculo cobre exportação local em JSON, importação passiva, entradas inválidas ou grandes demais e exibição literal de marcação importada. [Suíte de Álgebra no navegador](../../../apps/web/tests/algebra.spec.ts) · [Suíte compartilhada do registro de cálculo no navegador](../../../apps/web/tests/calculation-proof.spec.ts)

O oráculo da CLI confere soluções reais e complexas, multiplicidades, extremos exatos de intervalos, exclusões originais, substituição parcial e restrições de famílias de soluções. A requisição normalizada `x/x=1` preserva a exclusão original na reexecução. A verificação em `x=0` retorna `false`, e o motor aplica os limites da requisição e do registro antes de emiti-lo. [Oráculo](../../../tests/verify-algebra.py) · [Limites de requisição](../../../crates/dars-universal/src/lib.rs)

Álgebra usa as dependências de aritmética exata já fixadas. Os lockfiles de Rust e npm coincidem com os da etapa aceita do Científico. A verificação do Científico documenta a auditoria npm, os resultados do RustSec e as limitações locais de registro e política do Windows. Os quatro jobs de CI do Científico concluíram com sucesso. O CI de Álgebra inclui o oráculo independente e a verificação de paridade, e sua execução segue a publicação do commit da etapa. [Evidência de segurança do Científico](../scientific/verification.pt-BR.md#verificações-locais) · [Registro de CI do Científico](../scientific/ci.json) · [Definição do CI](../../../.github/workflows/ci.yml)

## Tempos diretos no WASM

O executor Node mediu o WASM de Álgebra inicializado, incluindo a leitura da requisição no Rust e a serialização do registro. Em 120 interações medidas após 10 aquecimentos por expressão, p50/p95/p99 foram **0,045 / 0,070 / 0,078 ms**. A inicialização levou **14,30 ms**. O artefato tinha **623.789 bytes** e a capacidade linear observada era de **1.179.648 bytes**. Esse escopo exclui o escalonamento pelo navegador, a criação do worker e a renderização no DOM. O SHA-256 do WASM medido foi `5749e62ed3fc844efb7dbfb8f6d1437eb2918e35511788de285521cb9595b1f1`. [Executor de paridade e medição](../../../tests/check-algebra-targets.mjs)

Os relatórios locais consultados são `artifacts/objective-03/algebra/parity.json` e `artifacts/objective-03/algebra/coverage-final.json`. O arquivo de cobertura contém metadados da ferramenta local. Preserve esse arquivo no ambiente de execução e publique apenas as contagens sanitizadas.

## Interação e recursos no Windows

O aplicativo desktop abriu com um perfil novo e levou **565,42 ms** até o resultado conferido do Standard. A seleção de Álgebra levou **25,22 ms** até o painel visível. Nas 40 interações conferidas de Álgebra, p50/p95/p99 foram **49,06 / 63,90 / 64,22 ms**. O intervalo inclui as ações do Playwright, o ciclo do worker, o cálculo e a observação do resultado no DOM. Os **46** workers de Álgebra observados encerraram. O ciclo de minimização e restauração via Win32 preservou entrada e resultado de Álgebra, o Standard manteve `0.3` quando selecionado novamente e a árvore ficou sem processos descendentes nas amostras após o fechamento. [Executor no Windows](../../../benchmarks/windows-algebra.mjs) · [Fases medidas](windows-benchmark.json)

A execução usou Windows **10.0.26200**, WebView2 **158.0.4370.33** e 20 processadores lógicos. Cada fase teve seis amostras em cerca de cinco segundos. As colunas de memória mostram as medianas em MiB para a árvore de processos / processo DARS / auxiliares do WebView2. CPU é a taxa amostrada em relação a um processador lógico, e os workers foram contados ao fim de cada fase.

| Fase | Memória privada residente em MiB | Commit privado em MiB | CPU | Workers |
| --- | ---: | ---: | ---: | ---: |
| Standard visível | 101,26 / 4,41 / 96,86 | 238,09 / 6,38 / 231,71 | 2,77% | 1 |
| Álgebra sob carga | 118,54 / 4,11 / 114,43 | 254,38 / 5,68 / 248,70 | 51,81% | 0 |
| Álgebra em repouso | 138,80 / 4,11 / 134,70 | 266,01 / 5,68 / 260,33 | 0,31% | 0 |
| Álgebra minimizada | 90,29 / 4,11 / 86,18 | 240,54 / 5,68 / 234,86 | 2,45% | 0 |
| Álgebra restaurada | 106,16 / 4,14 / 102,02 | 319,20 / 5,91 / 313,30 | 0,00% | 0 |
| Após fechar | 0,00 / 0,00 / 0,00 | 0,00 / 0,00 / 0,00 | 0,00% | 0 |

Workers de curta duração abriram e fecharam entre os pontos finais das fases. A memória privada residente caiu durante a minimização. O commit privado após restaurar superou as medianas sob carga e em repouso e ficou concentrado no WebView2. A medição cobre um ciclo curto. A meta de 100 MB incrementais e a retenção em ciclos mais longos seguem abertas. [Dívida de memória e protocolo](../../objective-02/revision-02/memory-debt.pt-BR.md)

O SHA-256 do executável release foi `2e3cf84e4e0f68a2226fa41b722942a7659bd5707a3d97aa848cf103d6cac28b`. O SHA-256 da captura Windows foi `ec3d4d1a4155532912480e47c19ffe58c73c83438bb1eeb3f30c7bbfc1974b3d`. A inspeção visual confirmou o tema azul-marinho, o solucionador de sistemas selecionado e o resultado exato `x=2; y=1`, com o registro de cálculo recolhido. [Captura Windows](windows.png)

## Reprodução

Na raiz do repositório, use as versões fixadas de Rust e Node e instale as dependências do oráculo de teste com hashes. Para o script offline avulso, informe em `DARS_CHROME_EXECUTABLE` o executável do navegador instalado se o Chromium do Playwright estiver indisponível. [Requisitos do oráculo](../../../tests/math-oracle-requirements.txt)

```powershell
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo build --locked --release -p dars-cli
node scripts/build-wasm.mjs
python -m venv .tooling/math-oracle-venv
$oraclePython = '.tooling/math-oracle-venv/Scripts/python.exe'
& $oraclePython -m pip install --only-binary=:all: --require-hashes -r tests/math-oracle-requirements.txt
& $oraclePython -B tests/verify-algebra.py target/release/dars.exe
node tests/check-algebra-targets.mjs target/release/dars.exe
npm run build --prefix apps/web
npm test --prefix apps/web
$env:DARS_BROWSER_CHANNEL = 'chrome'
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
cargo build --locked --release -p dars-desktop
node benchmarks/windows-algebra.mjs target/release/dars-desktop.exe
```
