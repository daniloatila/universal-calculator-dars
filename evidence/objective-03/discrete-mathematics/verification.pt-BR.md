# Matemática Discreta · Verificação da etapa

[English](verification.md) · [Limites matemáticos e de recursos](limits.pt-BR.md) · [Contrato do registro de cálculo](../calculation-proof/contract.pt-BR.md) · [Plano de etapas](../PLAN.pt-BR.md) · [Registro de testes](tests.json)

Os resultados cobrem a etapa de Matemática Discreta do Objetivo 03, incluindo aritmética exata, lógica proposicional, primalidade e fatoração com limites, registros de cálculo e regressões dos módulos já entregues.

## Verificações locais

| Verificação | Resultado observado |
| --- | --- |
| Referências independentes na CLI Windows | 289 aprovados e 0 falhas nas compilações finais otimizada e instrumentada com Python e SymPy 1.14.0. A suíte cobre as 16 operações, 59 rejeições estruturadas, dez reexecuções com registros de cálculo idênticos e uma verificação de procedência da entrada original. [Oráculo independente](../../../tests/verify-discrete-mathematics.py) |
| CLI e WASM de Matemática Discreta | 38 respostas completas coincidiram. Cinco verificações adicionais de isolamento entre módulos passaram. [Executor de paridade](../../../tests/check-discrete-mathematics-targets.mjs) |
| Testes Rust dos membros padrão do workspace | 60 aprovados no núcleo Standard (16) e no motor universal (44). A formatação Rust passou. |
| Testes web no Node | 65 aprovados e 0 falhas. |
| Chrome instalado no Windows | 67 aprovados na distribuição final, incluindo os oito testes de Matemática Discreta. [Observações do navegador](browser.json) · [Captura no navegador](browser.png) |
| Offline e idiomas sob demanda | 10 verificações avulsas passaram na distribuição final. O teste focado de Matemática Discreta no navegador também conferiu isolamento de módulos e cálculo offline. [Executor offline](../../../tests/verify-web-offline.mjs) |
| Regressões do Standard | 157 casos independentes de racionais e decimais, 20 comparações entre CLI e WASM e 291 casos de valores estruturados passaram. [Oráculo independente](../../../tests/oracle.py) · [Executor de paridade](../../../tests/check-targets.mjs) · [Oráculo estruturado](../../../crates/dars-core/tests/structured-oracle.py) |
| Módulos avançados anteriores | As referências do Científico, Álgebra, Cálculo, Álgebra Linear e Geometria passaram, respectivamente, em 177, 184, 210, 223 e 159 casos. Entre CLI e WASM, coincidiram 19, 28, 27, 30 e 32 registros, respectivamente. [Científico](../scientific/verification.pt-BR.md) · [Álgebra](../algebra/verification.pt-BR.md) · [Cálculo](../calculus/verification.pt-BR.md) · [Álgebra Linear](../linear-algebra/verification.pt-BR.md) · [Geometria](../geometry/verification.pt-BR.md) |
| Cobertura de linhas | Os testes Rust instrumentados e os oráculos na CLI nativa cobriram 1.073/1.099 linhas de Matemática Discreta (97,63%), 7.914/8.158 do motor universal (97,01%) e 613/620 do núcleo Standard (98,87%). [Registro de testes](tests.json) |
| Build release com dependências fixadas no Windows | A CLI otimizada executou o oráculo independente. O release normal do aplicativo desktop concluiu a execução no WebView2 sob a política de segurança existente no Windows. [Medições Windows](windows-benchmark.json) |

A referência usa `math` e `itertools` do Python para seleções com e sem repetição, operações nativas de conjuntos para identidades e inclusão, e predicados booleanos explícitos para as linhas das tabelas-verdade. Compara contagens e valores inteiros de precisão arbitrária, incluindo `4096!`, um resultado válido de 65.536 bits e potência modular nos limites admitidos de 1.024 bits para o expoente e 2.048 bits para o módulo. Com oito variáveis, confere as 256 atribuições com falso antes de verdadeiro. A suíte também reconstrói a fatoração com sinal, verifica multiplicidades e confere termos de sequências por fórmulas independentes. [Oráculo independente](../../../tests/verify-discrete-mathematics.py)

A suíte focada no navegador conferiu as 16 operações, a exibição de inteiros acima da faixa segura do JavaScript e uma tabela-verdade de 256 linhas com 16 por página. Também verificou a localização em sete idiomas e o layout RTL árabe a 320 px, os dois rótulos de primalidade e a importação passiva de um registro exportado com `probable_prime`. Os testes de worker conferiram cancelamento de requisição pendente, recuperação da entrada após trocar de módulo e cálculo depois de recarregar offline com apenas o WASM de Matemática Discreta preparado. [Suíte no navegador](../../../apps/web/tests/discrete-mathematics.spec.ts)

A captura no navegador mostra o tema azul-marinho, as colunas de oito variáveis e a segunda página da tabela-verdade exata, com a indicação de linhas 17 a 32 de 256. O SHA-256 da imagem é `8c806744f99f6fb60bb30fb123665507a489710c460da7dcc90dbd1ba28f1019`. [Captura no navegador](browser.png)

## Evidências de primalidade

| Caso | Resultado observado |
| --- | --- |
| `18446744073709551557` | `prime` com classificação exata e o método determinístico para inteiros sem sinal de 64 bits. |
| `2^127−1` | `probable_prime` com classificação aproximada. O registro informa que os 12 testes fortes de primalidade com bases fixas passaram, com precisão, tolerância e limite de erro nulos. |
| `(2^61−1)(2^31−1)` | `composite` com classificação exata e testemunha na base `2`. O oráculo Python verifica de forma independente a falha do teste forte para a base registrada. |
| `-360` | Lista exata `[-1,2,2,2,3,3,5]`, incluindo sinal e fatores primos repetidos. |

A referência confere o número de Mersenne selecionado de forma independente pelo teste de Lucas–Lehmer. O aplicativo mantém `probable_prime` para o valor maior e não atribui probabilidade à aprovação com bases fixas. [Verificações independentes de primalidade](../../../tests/verify-discrete-mathematics.py) · [Motor de primalidade e fatoração](../../../crates/dars-universal/src/discrete_mathematics/number_theory.rs)

## Dependências e segurança

O módulo usa os crates Num de inteiros já fixados. Os lockfiles de Rust e npm coincidem com os da etapa aceita de Geometria. O parser booleano tipado avalia exclusivamente os operadores admitidos e rejeita nomes de variáveis reservados pelo registro de cálculo. As entradas de conjuntos e inteiros usam gramáticas léxicas com limites. Os quatro jobs de CI de Geometria passaram. O CI de Matemática Discreta inclui o oráculo independente e a verificação de paridade, e sua execução segue a publicação do commit da etapa. [Parser de inteiros](../../../crates/dars-universal/src/discrete_mathematics/integer.rs) · [Parser booleano](../../../crates/dars-universal/src/discrete_mathematics/logic.rs) · [Registro de CI de Geometria](../geometry/ci.json) · [Definição do CI](../../../.github/workflows/ci.yml)

## Tempos diretos no WASM

O executor Node mediu o WASM de Matemática Discreta inicializado, incluindo a leitura da requisição no Rust e a serialização do registro de cálculo. Em 120 interações após 10 aquecimentos por expressão, p50/p95/p99 foram **0,0151 / 0,0383 / 0,0441 ms**. A inicialização levou **14,20 ms**. O WASM tinha **448.172 bytes**, com capacidade linear observada de **1.179.648 bytes**. O escalonamento pelo navegador, o início do worker e a renderização no DOM ficam fora dessa medição. O SHA-256 do WASM foi `5c67295ada054af8254eb44510f2473f5f6d357a8a13ffd40adbab55600359da`. [Executor de paridade e medição](../../../tests/check-discrete-mathematics-targets.mjs) · [Registro de testes](tests.json)

## Interação e recursos no Windows

Com um perfil novo, o aplicativo desktop levou **679,45 ms** até o resultado conferido do Standard. A seleção de Matemática Discreta levou **27,75 ms** até o painel visível. Nas 37 interações conferidas com permutações, arranjos e combinações, p50/p95/p99 foram **62,04 / 80,22 / 87,51 ms**. Os tempos incluem o preenchimento dos campos da operação, o clique em Calcular, o ciclo do worker, o cálculo e a observação do resultado no DOM. Os **42** workers observados encerraram. A minimização e restauração via Win32 preservaram `n`, `k` e a contagem de combinações conferida, o Standard manteve `0.3` quando selecionado novamente e as amostras após o fechamento mostraram zero descendentes. [Executor no Windows](../../../benchmarks/windows-discrete-mathematics.mjs) · [Fases medidas](windows-benchmark.json)

A execução usou Windows **10.0.26200**, WebView2 **158.0.4370.33** e 20 processadores lógicos. Cada fase teve seis amostras em cerca de cinco segundos. As colunas de memória mostram as medianas em MiB para a árvore de processos / processo DARS / auxiliares do WebView2. CPU é a taxa amostrada em relação a um processador lógico, e os workers foram contados ao fim de cada fase.

| Fase | Memória privada residente em MiB | Commit privado em MiB | CPU | Workers |
| --- | ---: | ---: | ---: | ---: |
| Standard visível | 97,79 / 3,61 / 94,18 | 233,90 / 5,23 / 228,66 | 5,83% | 1 |
| Matemática Discreta sob carga | 117,65 / 3,65 / 114,00 | 271,63 / 5,30 / 266,33 | 52,12% | 0 |
| Matemática Discreta em repouso | 137,48 / 3,65 / 133,83 | 284,90 / 5,30 / 279,60 | 0,61% | 0 |
| Matemática Discreta minimizada | 90,36 / 3,65 / 86,70 | 223,66 / 5,34 / 218,32 | 3,69% | 0 |
| Matemática Discreta restaurada | 102,27 / 3,68 / 98,59 | 326,32 / 5,33 / 320,99 | 0,92% | 0 |
| Após fechar | 0,00 / 0,00 / 0,00 | 0,00 / 0,00 / 0,00 | 0,00% | 0 |

Workers de curta duração abriram e fecharam entre os pontos finais das fases. A memória privada residente caiu durante a minimização. O maior commit privado ocorreu após a restauração e ficou concentrado no WebView2. A medição cobre um ciclo curto. A meta de 100 MB incrementais de memória física e a retenção em ciclos mais longos seguem abertas. [Dívida de memória e protocolo](../../objective-02/revision-02/memory-debt.pt-BR.md)

O SHA-256 do executável foi `44d59ab8fc98fdb6edb0d9584db40da066e689a41a3235f08b1f33fd1f5f7474`. O SHA-256 da captura Windows foi `f05afac29b1e7348b95a51e6b5a6d27cfacf22f275376aa0f54aa8cc4011c65e`. A inspeção visual confirmou o tema azul-marinho, as entradas `n=10` e `k=3` e a contagem exata `120` de combinações. [Captura Windows](windows.png)

## Reprodução

Na raiz do repositório, use as versões fixadas de Rust e Node e instale as referências matemáticas de teste em ambiente separado. Quando o Chromium do Playwright estiver indisponível, informe em `DARS_CHROME_EXECUTABLE` o executável do navegador instalado para o script offline avulso. [Requisitos do oráculo](../../../tests/math-oracle-requirements.txt)

```powershell
cargo fmt --all -- --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo build --locked --release -p dars-cli
node scripts/build-wasm.mjs
python -m venv .tooling/math-oracle-venv
$oraclePython = '.tooling/math-oracle-venv/Scripts/python.exe'
& $oraclePython -m pip install --only-binary=:all: --require-hashes -r tests/math-oracle-requirements.txt
& $oraclePython -B tests/verify-discrete-mathematics.py target/release/dars.exe
node tests/check-discrete-mathematics-targets.mjs target/release/dars.exe
npm run build --prefix apps/web
npm test --prefix apps/web
$env:DARS_BROWSER_CHANNEL = 'chrome'
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
cargo build --locked --release -p dars-desktop
node benchmarks/windows-discrete-mathematics.mjs target/release/dars-desktop.exe
```
