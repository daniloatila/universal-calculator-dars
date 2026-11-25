# Álgebra Linear · Verificação da etapa

[English](verification.md) · [Limites matemáticos e de recursos](limits.pt-BR.md) · [Contrato do registro de cálculo](../calculation-proof/contract.pt-BR.md) · [Plano de etapas](../PLAN.pt-BR.md) · [Registro de testes](tests.json)

Os resultados cobrem a etapa de Álgebra Linear do Objetivo 03, incluindo operações exatas e numéricas, editor matricial, registro de cálculo e verificações de regressão dos módulos já entregues.

## Verificações locais

| Verificação | Resultado observado |
| --- | --- |
| Referências independentes na CLI Windows | 223 aprovados e 0 falhas nas compilações otimizada e instrumentada, com SymPy 1.14.0, NumPy 2.5.1 e SciPy 1.18.1. O total cobre as 14 operações, 50 rejeições estruturadas, seis reexecuções com registros de cálculo idênticos e uma verificação de procedência da entrada original. [Oráculo independente](../../../tests/verify-linear-algebra.py) |
| CLI e WASM de Álgebra Linear | 30 respostas completas coincidiram. Três verificações adicionais de isolamento entre módulos passaram. [Executor de paridade](../../../tests/check-linear-algebra-targets.mjs) |
| Testes Rust dos membros padrão do workspace | 45 aprovados no núcleo Standard (16) e no motor universal (29). A formatação Rust e o Clippy para os membros padrão do workspace passaram. |
| Testes web no Node | 65 aprovados e 0 falhas. O esquema compartilhado do registro de cálculo aceita o identificador do módulo. |
| Chrome instalado no Windows | A suíte completa passou nos 52 casos antes da correção da posição inicial de rolagem em RTL. A distribuição final passou em 25 testes focados de Álgebra Linear, dos módulos avançados anteriores e do registro de cálculo. [Observações do navegador](browser.json) · [Captura no navegador](browser.png) |
| Offline e idiomas sob demanda | 10 verificações avulsas passaram na distribuição final. A suíte focada no navegador também conferiu isolamento de módulos e cálculos matriciais offline. [Executor offline](../../../tests/verify-web-offline.mjs) |
| Regressões do Standard | 157 casos independentes de racionais e decimais, 20 comparações entre CLI e WASM e 291 casos de valores estruturados passaram. [Oráculo independente](../../../tests/oracle.py) · [Executor de paridade](../../../tests/check-targets.mjs) · [Oráculo estruturado](../../../crates/dars-core/tests/structured-oracle.py) |
| Regressões do Científico, Álgebra e Cálculo | As referências independentes aprovaram, respectivamente, 177, 184 e 210 casos. Entre CLI e WASM, coincidiram 19, 28 e 27 respostas, respectivamente. [Científico](../scientific/verification.pt-BR.md) · [Álgebra](../algebra/verification.pt-BR.md) · [Cálculo](../calculus/verification.pt-BR.md) |
| Cobertura de linhas | Os testes Rust instrumentados e as referências na CLI nativa cobriram 921/934 linhas de Álgebra Linear (98,61%), 5.960/6.164 do motor universal (96,69%) e 613/620 do núcleo Standard (98,87%). [Registro de testes](tests.json) |
| Build release com dependências fixadas no Windows | A CLI otimizada executou todo o oráculo independente. O release normal do aplicativo desktop concluiu a execução no WebView2 sob a política de segurança existente no Windows. [Medições Windows](windows-benchmark.json) |

A referência exata cobre matrizes racionais e retangulares, vetores linha e coluna, produtos vetoriais nos eixos, determinante e inversa, posto e sistemas compatíveis, incompatíveis e indeterminados. Para a solução única, confere `A*x=b` exatamente. Para um sistema indeterminado, compara a solução particular e o núcleo completo com o SymPy. Solicitações de inversa de matriz singular retornam `singular`. Entradas com linhas malformadas, problemas espectrais não simétricos fora do escopo e escalas numéricas fora do limite retornam erros estruturados. [Suíte exata](../../../tests/verify-linear-algebra.py) · [Motor exato](../../../crates/dars-universal/src/linear_algebra/exact.rs)

Os testes no navegador cobrem as 14 operações, edição por teclado, colagem e redimensionamento de matrizes, texto exato de inteiros acima da faixa segura do JavaScript e diagnósticos numéricos no registro exportado. A suíte exercita sete idiomas e um layout RTL árabe a 320 px. A correção RTL deixa a primeira célula visível na posição inicial de rolagem em matrizes largas. Os testes também verificam que Álgebra Linear prepara somente seu WASM após o primeiro cálculo, que a recarga offline permite calcular novamente e que a troca de módulo encerra o trabalho pendente e preserva a entrada. [Suíte no navegador](../../../apps/web/tests/linear-algebra.spec.ts)

A captura no navegador mostra o tema azul-marinho, uma matriz 3×2 com fatores QR aproximados, o campo de tolerância e os diagnósticos observados. O SHA-256 da imagem é `8ecac7e8ecfefebd3dfe1d1b563b059fd1fb7bd2000b88cb0da4b5a2e234e846`. [Captura no navegador](browser.png)

## Verificações numéricas

A suíte confere reconstrução e ortogonalidade na QR reduzida, espectro ordenado de matrizes reais simétricas e o subespaço invariante completo para autovalores repetidos. Os casos incluem matrizes nas escalas `1e-20` e `1e90`, matrizes com 12 linhas e autovalores repetidos ou próximos de zero. A suíte verifica `P*A=L*U` exatamente na LU racional e também compara a reconstrução com o SciPy. As verificações numéricas usam cálculos independentes do NumPy e do SciPy. [Oráculo independente](../../../tests/verify-linear-algebra.py) · [Motor numérico](../../../crates/dars-universal/src/linear_algebra/numeric.rs)

| Caso | Resultado observado |
| --- | --- |
| QR reduzida de `1 2;3 4;5 7` com tolerância `1e-12` | O registro informa resíduo relativo de Frobenius da reconstrução de `2,858e-16` e erro de ortogonalidade de `7,146e-16`. A reconstrução independente a partir dos fatores retornados mediu, respectivamente, `2,889e-16` e `7,176e-16`. |
| QR de `diag(1,1e-10)` | Posto exato dois. O recíproco estimado do número de condição na norma 2, `1e-10`, coincide com a referência NumPy. O registro avisa que a matriz é mal condicionada. |
| Autovalores e autovetores de `2 1 1;1 2 1;1 1 2` | O espectro ordenado coincide com `(1,1,4)` dentro da tolerância solicitada. O autoespaço bidimensional do valor repetido coincide com o projetor do SciPy, e o registro avisa sobre autovalores agrupados. |

O registro da aproximação informa precisão de trabalho, tolerância solicitada e resíduos observados. O campo de limite de erro certificado fica nulo. O teste de autovetores compara projetores de subespaços, permitindo que o resultado escolha a própria base ortonormal para um autovalor repetido. [Contrato do registro de cálculo](../calculation-proof/contract.pt-BR.md)

## Dependências e segurança

O motor numérico usa Nalgebra 0.35.0. O índice oficial confirmou checksums idênticos e `yanked=false` para as 12 novas entradas fixadas no Rust. O RustSec verificou 443 entradas e registrou zero avisos classificados como vulnerabilidades. Permanecem os três avisos já conhecidos de `chrono` 0.4.45 e `proc-macro-error` 1.0.4 (sem manutenção) e `glib` 0.18.5 (`unsound`). [Verificação do registro](dependency-check.json) · [Lockfile do Cargo](../../../Cargo.lock) · [Auditoria anterior](../scientific/verification.pt-BR.md#verificações-locais)

NumPy e SciPy são dependências exclusivas dos testes. As distribuições binárias estão fixadas por versão e SHA-256 para Windows x86-64 e Linux x86-64 com glibc, no CPython 3.12–3.14. Os quatro jobs de CI de Cálculo passaram. O CI de Álgebra Linear inclui as referências matemáticas e a verificação de paridade próprias, e sua execução segue a publicação do commit da etapa. [Requisitos das distribuições do oráculo](../../../tests/linear-algebra-oracle-requirements.txt) · [Registro de CI de Cálculo](../calculus/ci.json) · [Definição do CI](../../../.github/workflows/ci.yml)

## Tempos diretos no WASM

O executor Node mediu o WASM de Álgebra Linear inicializado, incluindo a leitura da requisição no Rust e a serialização do registro de cálculo. Em 120 interações após 10 aquecimentos por expressão, p50/p95/p99 foram **0,0283 / 0,0389 / 0,0437 ms**. A inicialização levou **13,08 ms**. O WASM tinha **523.769 bytes**, com capacidade linear observada de **1.179.648 bytes**. O escalonamento pelo navegador, o início do worker e a renderização no DOM ficam fora dessa medição. O SHA-256 do WASM foi `35611b767ba5b8a647969e090d60914641f45640c78d355ef2f2c771a92ca32c`. [Executor de paridade e medição](../../../tests/check-linear-algebra-targets.mjs) · [Registro de testes](tests.json)

## Interação e recursos no Windows

O aplicativo desktop abriu com um perfil novo e levou **672,82 ms** até o resultado conferido do Standard. A seleção de Álgebra Linear levou **36,81 ms** até o painel visível. Nas 32 interações conferidas de determinante, transposição e posto, p50/p95/p99 foram **87,58 / 106,93 / 107,33 ms**. O intervalo inclui a entrada nas quatro células, o clique em Calcular, o ciclo do worker, o cálculo e a observação do resultado no DOM. Os **37** workers de Álgebra Linear observados encerraram. A minimização e restauração via Win32 preservaram as quatro células e o resultado, o Standard manteve `0.3` quando selecionado novamente e as amostras após o fechamento mostraram zero descendentes. [Executor no Windows](../../../benchmarks/windows-linear-algebra.mjs) · [Fases medidas](windows-benchmark.json)

A execução usou Windows **10.0.26200**, WebView2 **158.0.4370.33** e 20 processadores lógicos. Cada fase teve seis amostras em cerca de cinco segundos. As colunas de memória mostram as medianas em MiB para a árvore de processos / processo DARS / auxiliares do WebView2. CPU é a taxa amostrada em relação a um processador lógico, e os workers foram contados ao fim de cada fase.

| Fase | Memória privada residente em MiB | Commit privado em MiB | CPU | Workers |
| --- | ---: | ---: | ---: | ---: |
| Standard visível | 100,06 / 4,14 / 95,92 | 237,69 / 5,75 / 231,95 | 3,39% | 1 |
| Álgebra Linear sob carga | 123,95 / 4,10 / 119,85 | 266,94 / 5,79 / 261,15 | 71,22% | 0 |
| Álgebra Linear em repouso | 146,28 / 4,10 / 142,18 | 293,04 / 5,79 / 287,25 | 0,00% | 0 |
| Álgebra Linear minimizada | 86,32 / 4,10 / 82,21 | 235,33 / 5,80 / 229,54 | 3,99% | 0 |
| Álgebra Linear restaurada | 106,18 / 4,14 / 102,04 | 328,25 / 5,80 / 322,45 | 0,00% | 0 |
| Após fechar | 0,00 / 0,00 / 0,00 | 0,00 / 0,00 / 0,00 | 0,00% | 0 |

Workers de curta duração abriram e fecharam entre os pontos finais das fases. A memória privada residente caiu durante a minimização. A restauração registrou o maior commit privado da execução, concentrado no WebView2. A medição cobre um ciclo curto. A meta de 100 MB incrementais e a retenção em ciclos mais longos seguem abertas. [Dívida de memória e protocolo](../../objective-02/revision-02/memory-debt.pt-BR.md)

O SHA-256 do executável foi `39db702a8bb1cbe32958a25a20daeca90700953ccfae907864b8f94b78003670`. O SHA-256 da captura Windows foi `2e392f889eb91b8a2f691edfe29426eba8a8001b01eddde02db07096cd7ecd64`. A inspeção visual confirmou o tema azul-marinho, as quatro entradas preservadas e a transposta exata `[[1,3],[2,4]]` com o registro de cálculo recolhido. [Captura Windows](windows.png)

## Reprodução

Na raiz do repositório, use as versões fixadas de Rust e Node e instale as referências de teste em ambiente separado. Quando o Chromium do Playwright estiver indisponível, informe em `DARS_CHROME_EXECUTABLE` o executável do navegador instalado para o script offline avulso. [Requisitos gerais dos oráculos](../../../tests/math-oracle-requirements.txt) · [Distribuições do oráculo de Álgebra Linear](../../../tests/linear-algebra-oracle-requirements.txt)

```powershell
cargo fmt --all -- --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo build --locked --release -p dars-cli
node scripts/build-wasm.mjs
python -m venv .tooling/math-oracle-venv
$oraclePython = '.tooling/math-oracle-venv/Scripts/python.exe'
& $oraclePython -m pip install --only-binary=:all: --require-hashes -r tests/math-oracle-requirements.txt -r tests/linear-algebra-oracle-requirements.txt
& $oraclePython -B tests/verify-linear-algebra.py target/release/dars.exe
node tests/check-linear-algebra-targets.mjs target/release/dars.exe
npm run build --prefix apps/web
npm test --prefix apps/web
$env:DARS_BROWSER_CHANNEL = 'chrome'
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
cargo build --locked --release -p dars-desktop
node benchmarks/windows-linear-algebra.mjs target/release/dars-desktop.exe
```
